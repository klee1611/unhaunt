import { lookup as dnsLookup, type LookupAddress } from 'node:dns';
import { isIP } from 'node:net';
import ipaddr from 'ipaddr.js';
import { getDomain } from 'tldts';
import { Agent, fetch as undiciFetch } from 'undici';

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

// Anything that isn't plain global unicast is refused: loopback, private, link-local, CGNAT, multicast,
// reserved, and IPv6 forms that embed IPv4 (mapped, 6to4, NAT64, Teredo).
export function isPrivateAddress(ip: string): boolean {
  if (!ipaddr.isValid(ip)) return true;
  const addr = ipaddr.process(ip); // unwraps IPv4-mapped IPv6
  return addr.range() !== 'unicast';
}

// Name-only checks: no IP literals, no single-label or local-only names.
export function looksPublicHostname(host: string): boolean {
  const h = host.toLowerCase().replace(/\.$/, '');
  if (!h || isIP(h) || !h.includes('.')) return false;
  return !/(^|\.)(localhost|local|internal|lan|home|arpa)$/.test(h);
}

// The check runs inside the connection's own DNS lookup, so the address that was checked is the
// address that gets connected to (no second lookup for a rebinding DNS server to answer differently).
function guardedLookup(
  hostname: string,
  options: object,
  callback: (err: NodeJS.ErrnoException | null, address: string | LookupAddress[], family?: number) => void,
) {
  dnsLookup(hostname, { ...options, all: true }, (err, addresses) => {
    if (err) return callback(err, []);
    const list = addresses as LookupAddress[];
    if (!list.length || list.some((a) => isPrivateAddress(a.address))) {
      const e: NodeJS.ErrnoException = new Error(`Refusing non-public address for ${hostname}`);
      e.code = 'ENOTPUBLIC';
      return callback(e, []);
    }
    if ((options as { all?: boolean }).all) return callback(null, list);
    callback(null, list[0].address, list[0].family);
  });
}

const publicOnly = new Agent({ connect: { lookup: guardedLookup as never } });

// fetch that can only reach public addresses, checked at connect time on every request.
export function publicFetch(url: string, init: Parameters<typeof undiciFetch>[1] = {}) {
  const u = new URL(url);
  if (!looksPublicHostname(u.hostname)) return Promise.reject(new Error(`Refusing host ${u.hostname}`));
  return undiciFetch(url, { ...init, dispatcher: publicOnly });
}

// A link from model output is kept only if it belongs to the service or literally appears in the
// fetched page text, so a prompt-injected page can't plant a phishing link.
export function trustedLink(value: string | null | undefined, serviceDomain: string, pageText: string): string | null {
  const safe = safeHttpUrl(value);
  if (!safe) return null;
  const host = new URL(safe).hostname;
  if (getDomain(host) === serviceDomain) return safe;
  return pageText.includes(safe) || pageText.includes(value!) ? safe : null;
}
