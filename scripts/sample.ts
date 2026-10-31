import './env';

import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';

import type { Candidate } from '../src/lib/census';
import { dataPath, readJson, writeJson } from '../src/lib/ledger';

// Freezes the answer-key sample: 50 candidates chosen by a fixed seed, before any prompt tuning.
// Refuses to overwrite an existing sample so the test set can't drift.
const SEED = 'unhaunt-hf26-week4';
const N = Number(process.argv[2] ?? 50);

if (existsSync(dataPath('sample.json'))) {
  console.log('data/sample.json already exists; the sample is frozen. Delete it by hand to re-draw.');
  process.exit(0);
}
const candidates = readJson<Candidate[]>('candidates.json', []);
const rank = (id: string) => createHash('sha256').update(`${SEED}:${id}`).digest('hex');
const sample = [...candidates]
  .sort((a, b) => rank(a.id).localeCompare(rank(b.id)))
  .slice(0, N)
  .map((c) => c.id)
  .sort();
writeJson('sample.json', sample);
writeJson('sample-meta.json', { seed: SEED, n: sample.length, of: candidates.length, frozenAt: new Date().toISOString() });
console.log(`Froze ${sample.length} of ${candidates.length} candidates. Label them at http://localhost:3000/?sample=1`);
