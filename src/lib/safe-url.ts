import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

// Domains come from email From headers, which anyone can forge, and URLs come from model output
// shaped by untrusted pages. Only public http(s) hosts may be fetched or linked.

export function safeHttpUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const u = new URL(value);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.toString() : null;
  } catch {
    return null;
  }
}

export function isPrivateAddress(ip: string): boolean {
  if (isIP(ip) === 4) {
    const [a, b] = ip.split('.').map(Number);
    return (
      a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a >= 224
    );
  }
  const v6 = ip.toLowerCase();
  if (v6.startsWith('::ffff:')) return isPrivateAddress(v6.slice(7));
  return v6 === '::' || v6 === '::1' || v6.startsWith('fc') || v6.startsWith('fd') || v6.startsWith('fe80');
}

// Name-only checks: no IP literals, no single-label or local-only names.
export function looksPublicHostname(host: string): boolean {
  const h = host.toLowerCase().replace(/\.$/, '');
  if (!h || isIP(h) || !h.includes('.')) return false;
  return !/(^|\.)(localhost|local|internal|lan|home|arpa)$/.test(h);
}

// Full check before every request, including each redirect hop: every resolved address must be public.
export async function isPublicHost(host: string): Promise<boolean> {
  if (!looksPublicHostname(host)) return false;
  try {
    const addrs = await lookup(host, { all: true });
    return addrs.length > 0 && addrs.every((a) => !isPrivateAddress(a.address));
  } catch {
    return false;
  }
}
