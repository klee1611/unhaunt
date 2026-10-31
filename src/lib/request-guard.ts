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

// The phone shows this, so it names the recipient's domain. Auth0 allows 64 chars of [a-zA-Z0-9 +-_.,:#].
export function bindingMessage(id: string, to: string | undefined): string {
  const num = id.replace('svc-', '');
  const domain = (to?.split('@')[1] ?? 'unknown').toLowerCase().replace(/[^a-z0-9.-]/g, '');
  const msg = `Unhaunt: deletion request #${num} to ${domain}`;
  return msg.length <= 64 ? msg : `${msg.slice(0, 61)}...`;
}

// A recipient is drafted automatically only if it belongs to the service itself.
export function recipientMatchesService(email: string, serviceDomain: string): boolean {
  const host = email.split('@')[1];
  return !!host && getDomain(host) === serviceDomain;
}
