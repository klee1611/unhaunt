import { getDomain } from 'tldts';

// CSRF: SameSite=Lax doesn't help between localhost ports (they count as the same site),
// so state-changing requests must come from this app's own origin.
export function isSameOrigin(method: string, origin: string | null, appBaseUrl: string): boolean {
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return true;
  if (!origin) return false;
  try {
    return new URL(origin).origin === new URL(appBaseUrl).origin;
  } catch {
    return false;
  }
}

// Optional owner allowlist: ALLOWED_EMAILS="you@example.com,other@example.com".
export function isAllowedUser(email: string | undefined, allowed = process.env.ALLOWED_EMAILS): boolean {
  if (!allowed?.trim()) return true;
  const list = allowed.split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);
  return !!email && list.includes(email.toLowerCase());
}

export const SERVICE_ID = /^svc-\d{3}$/;

// One strict parser for every place that reads a recipient (phone message, domain check, send),
// so they can't disagree. Exactly one plain address: no display names, commas, brackets or second '@'.
const ADDRESS = /^([a-z0-9._%+-]+)@([a-z0-9-]+(?:\.[a-z0-9-]+)+)$/i;

export function parseAddress(value: string | null | undefined): { address: string; domain: string } | null {
  const m = (value ?? '').trim().match(ADDRESS);
  if (!m || m[2].length > 253) return null;
  return { address: m[0].toLowerCase(), domain: m[2].toLowerCase() };
}

// The phone shows this, so it names the recipient's domain. Auth0 allows 64 chars of [a-zA-Z0-9 +-_.,:#].
export function bindingMessage(id: string, to: string | undefined): string {
  const num = id.replace('svc-', '');
  const parsed = parseAddress(to);
  const msg = `Unhaunt: deletion request #${num} to ${parsed ? parsed.domain : 'INVALID recipient'}`;
  return msg.length <= 64 ? msg : `${msg.slice(0, 61)}...`;
}

// A recipient is drafted automatically only if it belongs to the service itself.
export function recipientMatchesService(email: string, serviceDomain: string): boolean {
  const parsed = parseAddress(email);
  return !!parsed && getDomain(parsed.domain) === serviceDomain;
}
