import { parse } from 'tldts';

// One email as fetched from Gmail with format=metadata (no bodies).
export interface MailMeta {
  msgId: string;
  from: string;
  subject: string;
  date: string; // ISO
  listUnsubscribe?: boolean;
}

export interface Candidate {
  id: string;
  domain: string;
  displayName: string;
  firstSeen: string;
  lastSeen: string;
  msgCount: number;
  evidence: { msgId: string; subject: string; date: string }[];
  ruleKind: RuleKind;
}

export type RuleKind = 'account' | 'newsletter' | 'unknown';

// Gmail search used for the census. Subject-only, English + Traditional Chinese.
export const SIGNUP_QUERY =
  'subject:(welcome OR verify OR confirm OR activate OR "sign up" OR "signing up" OR "new account" OR "your account" OR 歡迎 OR 驗證 OR 註冊 OR 啟用 OR 帳號 OR 帳戶)';

// Mailboxes that belong to people, not services.
const PERSONAL_PROVIDERS = new Set([
  'gmail.com', 'googlemail.com', 'outlook.com', 'hotmail.com', 'live.com', 'yahoo.com',
  'yahoo.com.tw', 'icloud.com', 'me.com', 'qq.com', 'proton.me', 'protonmail.com',
]);

// Bulk senders that send on behalf of a company; the From domain says nothing about the service.
const ESP_DOMAINS = new Set([
  'mcsv.net', 'mcdlv.net', 'list-manage.com', 'mailchimpapp.net', 'sendgrid.net', 'amazonses.com',
  'mailgun.org', 'sparkpostmail.com', 'mandrillapp.com', 'hubspotemail.net', 'customeriomail.com',
  'intercom-mail.com', 'postmarkapp.com', 'mailjet.com', 'sendinblue.com', 'brevosend.com',
]);

const SIGNUP_PATTERNS = [
  /\bwelcome\b/i,
  /\bverify (your )?(email|e-mail|account|address)\b/i,
  /\bconfirm (your )?(email|e-mail|account|address|registration|subscription)\b/i,
  /\bactivate (your )?account\b/i,
  /\bthanks? (you )?for (signing up|registering|joining|creating)\b/i,
  /\b(new|your) account\b/i,
  /歡迎/, /註冊/, /啟用/, /驗證(您的|你的)?(電子)?(信箱|郵件|帳號|帳戶)/, /(建立|開通)(了)?(帳號|帳戶)/,
];

// One-time codes and sign-in alerts: an account exists, but these alone are weak signup evidence.
const CODE_PATTERNS = [
  /\b(verification|security|sign[- ]?in|login|one[- ]time|confirmation) code\b/i,
  /\bOTP\b/, /\b\d{4,8}\b is your\b/i, /驗證碼/, /認證碼/, /\bnew (sign[- ]?in|login)\b/i,
];

export function parseFrom(from: string): { name: string; address: string; domain: string } {
  const m = from.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
  const address = (m ? m[2] : from).trim().toLowerCase();
  const name = (m ? m[1] : '').trim();
  const host = address.split('@')[1] ?? '';
  return { name, address, domain: host };
}

export function serviceDomain(from: string): string | null {
  const { name, domain } = parseFrom(from);
  // Only hosts under a real public suffix: forged From headers with IPs or local names stop here.
  const parsed = parse(domain);
  const reg = parsed.isIcann && !parsed.isIp ? parsed.domain : null;
  if (!reg || PERSONAL_PROVIDERS.has(reg)) return null;
  if (ESP_DOMAINS.has(reg)) {
    // Fall back to the display name so "Acme via SendGrid" still groups as Acme.
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '');
    return slug ? `${slug}.esp` : null;
  }
  return reg;
}

export const isSignupSubject = (s: string) => SIGNUP_PATTERNS.some((p) => p.test(s));
export const isCodeSubject = (s: string) => CODE_PATTERNS.some((p) => p.test(s));

// Rules-only baseline: subject keywords decide.
export function ruleKind(mails: MailMeta[]): RuleKind {
  const signup = mails.some((m) => isSignupSubject(m.subject) && !isCodeSubject(m.subject));
  if (signup) return 'account';
  if (mails.length > 0 && mails.every((m) => m.listUnsubscribe)) return 'newsletter';
  return 'unknown';
}

// Assigns stable ids: existing domains keep theirs, new ones get the next number.
export function assignIds(domains: string[], existing: Record<string, string>): Record<string, string> {
  const ids = { ...existing };
  let next = Object.values(ids).reduce((max, id) => Math.max(max, Number(id.slice(4))), 0);
  for (const d of [...domains].sort()) {
    if (!ids[d]) ids[d] = `svc-${String(++next).padStart(3, '0')}`;
  }
  return ids;
}

export function groupCandidates(mails: MailMeta[], existingIds: Record<string, string> = {}) {
  const byDomain = new Map<string, MailMeta[]>();
  const names = new Map<string, string>();
  for (const m of mails) {
    const d = serviceDomain(m.from);
    if (!d) continue;
    byDomain.set(d, [...(byDomain.get(d) ?? []), m]);
    const { name } = parseFrom(m.from);
    if (name && !names.has(d)) names.set(d, name);
  }
  const ids = assignIds([...byDomain.keys()], existingIds);
  const candidates: Candidate[] = [...byDomain.entries()].map(([domain, ms]) => {
    const sorted = [...ms].sort((a, b) => a.date.localeCompare(b.date));
    return {
      id: ids[domain],
      domain,
      displayName: names.get(domain) ?? domain,
      firstSeen: sorted[0].date,
      lastSeen: sorted[sorted.length - 1].date,
      msgCount: ms.length,
      evidence: sorted.slice(0, 5).map(({ msgId, subject, date }) => ({ msgId, subject, date })),
      ruleKind: ruleKind(ms),
    };
  });
  candidates.sort((a, b) => a.id.localeCompare(b.id));
  return { candidates, ids };
}

// Lazy baseline for "ghost": no mail from the service in over two years.
export function lazyRuleGhost(lastSeen: string, now = new Date()): boolean {
  const twoYears = 2 * 365.25 * 24 * 3600 * 1000;
  return now.getTime() - new Date(lastSeen).getTime() > twoYears;
}
