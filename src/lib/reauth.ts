import { readJson, writeJson } from './ledger';

// Free-tier human approval: before each send you sign in to Auth0 again (prompt=login, max_age=0).
// The send is allowed only if that sign-in happened after you asked to send this request, and recently.
// Phone approval (CIBA) needs a paid Auth0 plan; set APPROVAL_MODE=ciba to use it instead.

export const APPROVAL_MODE = process.env.APPROVAL_MODE === 'ciba' ? 'ciba' : 'reauth';
export const REAUTH_WINDOW_MS = 120_000;

interface Pending {
  requestedAt: number; // ms
}

export function loginUrlFor(id: string): string {
  const params = new URLSearchParams({
    prompt: 'login',
    max_age: '0',
    returnTo: `/account/${id}?confirmed=1`,
  });
  return `/auth/login?${params}`;
}

export function startConfirmation(id: string, now = Date.now()) {
  const pending = readJson<Record<string, Pending>>('confirmations.json', {});
  pending[id] = { requestedAt: now };
  writeJson('confirmations.json', pending);
}

// authTime is the ID token's auth_time (seconds). Pure, so it can be tested.
export function isFreshConfirmation(
  pending: Pending | undefined,
  authTime: number | undefined,
  now = Date.now(),
): { ok: true } | { ok: false; reason: string } {
  if (!pending) return { ok: false, reason: 'no confirmation was requested for this item' };
  if (!authTime) return { ok: false, reason: 'no sign-in time on the session' };
  const signedInAt = authTime * 1000;
  // Allow a little clock skew between Auth0 and this laptop.
  if (signedInAt + 5_000 < pending.requestedAt) return { ok: false, reason: 'sign-in happened before the request' };
  if (now - signedInAt > REAUTH_WINDOW_MS) return { ok: false, reason: 'sign-in is older than 2 minutes' };
  if (now - pending.requestedAt > 10 * 60_000) return { ok: false, reason: 'confirmation request expired' };
  return { ok: true };
}

export function checkAndConsume(id: string, authTime: number | undefined, now = Date.now()) {
  const pending = readJson<Record<string, Pending>>('confirmations.json', {});
  const result = isFreshConfirmation(pending[id], authTime, now);
  // One confirmation, one send attempt, whatever the outcome.
  delete pending[id];
  writeJson('confirmations.json', pending);
  return result;
}
