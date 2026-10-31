import './env';

import { HIBP_URL, matchBreaches, type HibpBreach } from '../src/lib/breaches';
import type { Candidate } from '../src/lib/census';
import { readJson, writeJson } from '../src/lib/ledger';

// Downloads the public breach list once (no key, no email lookups) and joins it by domain.
let list = readJson<HibpBreach[]>('hibp-breaches.json', []);
if (!list.length) {
  const res = await fetch(HIBP_URL, { headers: { 'user-agent': 'unhaunt-hacktoberfest' } });
  if (!res.ok) throw new Error(`HIBP ${res.status}`);
  list = (await res.json()) as HibpBreach[];
  writeJson('hibp-breaches.json', list);
}

const candidates = readJson<Candidate[]>('candidates.json', []);
const out: Record<string, ReturnType<typeof matchBreaches>> = {};
for (const c of candidates) {
  const m = matchBreaches(c.domain, c.firstSeen, list);
  if (m.length) out[c.id] = m;
}
writeJson('breaches.json', out);
console.log({
  breachesInList: list.length,
  servicesWithBreach: Object.keys(out).length,
  breachedAfterSignup: Object.values(out).filter((m) => m.some((b) => b.afterSignup)).length,
});
