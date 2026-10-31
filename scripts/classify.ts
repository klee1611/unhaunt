import './env';

import type { Candidate } from '../src/lib/census';
import { readJson, writeJson } from '../src/lib/ledger';
import { classifyCandidate, MODEL_NAME, suggestGhost } from '../src/lib/model';

// Runs the local open model over every candidate: account or not, and a ghost suggestion.
// Rules-only results are already in candidates.json (ruleKind) as the baseline.
const candidates = readJson<Candidate[]>('candidates.json', []);
if (!candidates.length) throw new Error('No data/candidates.json yet. Run the census first.');

const classifications: Record<string, unknown> = {};
const suggestions: Record<string, unknown> = {};
const stats = { model: MODEL_NAME, calls: 0, cached: 0, invalid: 0, promptTokens: 0, completionTokens: 0, ms: 0 };

let i = 0;
for (const c of candidates) {
  for (const [call, out] of [
    [await classifyCandidate(c), classifications],
    [await suggestGhost(c), suggestions],
  ] as const) {
    out[c.id] = call.value;
    stats.calls++;
    if (call.cached) stats.cached++;
    else {
      stats.promptTokens += call.promptTokens;
      stats.completionTokens += call.completionTokens;
      stats.ms += call.ms;
    }
    if (call.value === null) stats.invalid++;
  }
  if (++i % 10 === 0) console.log(`${i}/${candidates.length}`);
}

writeJson('classifications.json', classifications);
writeJson('ghost-suggestions.json', suggestions);
const fresh = stats.calls - stats.cached;
writeJson('classify-run.json', {
  ...stats,
  at: new Date().toISOString(),
  avgSecondsPerCall: fresh ? +(stats.ms / fresh / 1000).toFixed(2) : null,
  tokensPerSecond: stats.ms ? +((stats.completionTokens / stats.ms) * 1000).toFixed(1) : null,
});
console.log(stats);
