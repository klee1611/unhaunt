import './env';

import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';

import type { Candidate } from '../src/lib/census';
import { dataPath, readJson, writeJson } from '../src/lib/ledger';
import type { Label } from '../src/lib/store';

// Picks the services whose deletion routes you check by hand: your ghosts from the frozen sample
// first, then a seeded draw of other real-domain accounts, up to N. Frozen once written.
const N = Number(process.argv[2] ?? 20);
if (existsSync(dataPath('route-eval-ids.json')) && !process.argv.includes('--force')) {
  console.log('data/route-eval-ids.json already exists (frozen). Pass --force to re-draw.');
  process.exit(0);
}
const candidates = readJson<Candidate[]>('candidates.json', []).filter((c) => !c.domain.endsWith('.esp'));
const labels = readJson<Record<string, Label>>('labels.json', {});
const sample = new Set(readJson<string[]>('sample.json', []));

const ghosts = candidates.filter((c) => sample.has(c.id) && labels[c.id]?.user === 'ghost').map((c) => c.id);
const rank = (id: string) => createHash('sha256').update(`unhaunt-routes:${id}`).digest('hex');
const rest = candidates
  .filter((c) => !ghosts.includes(c.id) && labels[c.id]?.account !== 'no' && c.ruleKind !== 'newsletter')
  .sort((a, b) => rank(a.id).localeCompare(rank(b.id)))
  .map((c) => c.id);
const picked = [...ghosts, ...rest].slice(0, N).sort();
writeJson('route-eval-ids.json', picked);
console.log(`Picked ${picked.length} (${Math.min(ghosts.length, N)} of your sample ghosts). Check them at http://localhost:3000/routes`);
