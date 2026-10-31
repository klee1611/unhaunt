import { GaxiosError } from 'gaxios';
import { google, type gmail_v1 } from 'googleapis';
import { TokenVaultError } from '@auth0/ai/interrupts';

import type { MailMeta } from './census';

export function gmailClient(accessToken: string) {
  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: accessToken });
  return google.gmail({ version: 'v1', auth });
}

// Retries on Gmail rate limits; a 401 means the Token Vault connection needs consent again.
async function withBackoff<T>(fn: () => Promise<T>, tries = 5): Promise<T> {
  for (let i = 0; ; i++) {
    try {
      return await fn();
    } catch (err) {
      if (err instanceof GaxiosError) {
        if (err.status === 401) throw new TokenVaultError('Authorization required to access the Token Vault');
        if ((err.status === 429 || err.status === 403 || (err.status ?? 0) >= 500) && i < tries - 1) {
          await new Promise((r) => setTimeout(r, 500 * 2 ** i));
          continue;
        }
      }
      throw err;
    }
  }
}

export async function listMessageIds(gmail: gmail_v1.Gmail, q: string, max = 5000): Promise<string[]> {
  const ids: string[] = [];
  let pageToken: string | undefined;
  do {
    const res = await withBackoff(() =>
      gmail.users.messages.list({ userId: 'me', q, maxResults: 500, pageToken, includeSpamTrash: false }),
    );
    ids.push(...(res.data.messages ?? []).map((m) => m.id!));
    pageToken = res.data.nextPageToken ?? undefined;
  } while (pageToken && ids.length < max);
  return ids.slice(0, max);
}

// Headers only: From, Subject, Date, List-Unsubscribe. Bodies are never fetched.
export async function getMeta(gmail: gmail_v1.Gmail, id: string): Promise<MailMeta> {
  const res = await withBackoff(() =>
    gmail.users.messages.get({
      userId: 'me',
      id,
      format: 'metadata',
      metadataHeaders: ['From', 'Subject', 'Date', 'List-Unsubscribe'],
    }),
  );
  const h = (name: string) => res.data.payload?.headers?.find((x) => x.name?.toLowerCase() === name.toLowerCase())?.value ?? '';
  return {
    msgId: id,
    from: h('From'),
    subject: h('Subject'),
    date: new Date(Number(res.data.internalDate ?? 0)).toISOString(),
    listUnsubscribe: Boolean(h('List-Unsubscribe')),
  };
}

export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]);
      }
    }),
  );
  return out;
}

// Newest mail from a domain (any subject): the activity signal for "ghost or live".
export async function latestFrom(gmail: gmail_v1.Gmail, domain: string): Promise<{ date: string; count: number } | null> {
  const res = await withBackoff(() => gmail.users.messages.list({ userId: 'me', q: `from:${domain}`, maxResults: 1 }));
  const first = res.data.messages?.[0];
  if (!first) return null;
  const meta = await getMeta(gmail, first.id!);
  return { date: meta.date, count: res.data.resultSizeEstimate ?? 0 };
}

function encodeHeader(value: string) {
  return /^[\x20-\x7e]*$/.test(value) ? value : `=?UTF-8?B?${Buffer.from(value).toString('base64')}?=`;
}

export async function sendMail(gmail: gmail_v1.Gmail, to: string, subject: string, body: string) {
  const raw = [
    `To: ${to}`,
    `Subject: ${encodeHeader(subject)}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset="UTF-8"',
    '',
    body,
  ].join('\r\n');
  const res = await withBackoff(() =>
    gmail.users.messages.send({ userId: 'me', requestBody: { raw: Buffer.from(raw).toString('base64url') } }),
  );
  return { gmailId: res.data.id };
}
