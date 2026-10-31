import './env';

import { writeFileSync } from 'node:fs';

import { lazyRuleGhost, type Candidate } from '../src/lib/census';
import { readJson, readLedger, writeJson } from '../src/lib/ledger';
import type { Classification, GhostSuggestion } from '../src/lib/model';
import type { Label, Route } from '../src/lib/store';

// Scores everything against your hand labels. Reads only cached outputs, so it is free and repeatable.
const candidates = readJson<Candidate[]>('candidates.json', []);
const byId = new Map(candidates.map((c) => [c.id, c]));
const sample = readJson<string[]>('sample.json', []);
const labels = readJson<Record<string, Label>>('labels.json', {});
const cls = readJson<Record<string, Classification | null>>('classifications.json', {});
const ghostSug = readJson<Record<string, GhostSuggestion | null>>('ghost-suggestions.json', {});
const routes = readJson<Record<string, Route>>('routes.json', {});
const localRoutes = readJson<Record<string, Route>>('routes-local.json', {});
type Truth = { method: Route['method']; contact?: string | null; alternatives?: { method: Route['method']; contact?: string | null }[]; excluded?: string; ambiguous?: boolean };
const truth = readJson<Record<string, Truth>>('route-truth.json', {});
const now = new Date(readJson<{ at?: string }>('census-run.json', {}).at ?? Date.now());

const pct = (n: number, d: number) => (d ? `${((100 * n) / d).toFixed(0)}%` : 'n/a');

function prf(pred: (id: string) => boolean, ids: string[], actual: (id: string) => boolean) {
  let tp = 0, fp = 0, fn = 0;
  for (const id of ids) {
    const p = pred(id), a = actual(id);
    if (p && a) tp++;
    else if (p && !a) fp++;
    else if (!p && a) fn++;
  }
  return { tp, fp, fn, precision: pct(tp, tp + fp), recall: pct(tp, tp + fn) };
}

// 1. Real account? (frozen sample, your "account" labels)
const accIds = sample.filter((id) => labels[id]?.account);
const isAcc = (id: string) => labels[id]?.account === 'yes';
const census = {
  labelled: accIds.length,
  rules: prf((id) => byId.get(id)?.ruleKind === 'account', accIds, isAcc),
  gemma: prf((id) => cls[id]?.kind === 'account', accIds, isAcc),
};

// 2. Ghost or keep? (frozen sample, your keep/ghost labels)
const ghostIds = sample.filter((id) => labels[id]?.user === 'keep' || labels[id]?.user === 'ghost');
const isGhost = (id: string) => labels[id]?.user === 'ghost';
const lazy = (id: string) => lazyRuleGhost(byId.get(id)!.lastSeen, now);
const ghost = {
  labelled: ghostIds.length,
  lazyRuleAccuracy: pct(ghostIds.filter((id) => lazy(id) === isGhost(id)).length, ghostIds.length),
  gemmaAccuracy: pct(ghostIds.filter((id) => (ghostSug[id]?.ghost ?? false) === isGhost(id)).length, ghostIds.length),
  liveAccountsLazyRuleWouldKill: ghostIds.filter((id) => lazy(id) && !isGhost(id)).length,
  liveAccountsGemmaWouldKill: ghostIds.filter((id) => ghostSug[id]?.ghost && !isGhost(id)).length,
  ghostsLazyRuleMissed: ghostIds.filter((id) => !lazy(id) && isGhost(id)).length,
};

// 3. Deletion route (your hand-checked truth)
// Unreachable / unverifiable sites are excluded; any listed alternative route counts as right.
const routeIds = Object.keys(truth).filter((id) => !truth[id].excluded);
const matches = (r: Route, t: { method: Route['method']; contact?: string | null }) =>
  r.method === t.method && (t.method !== 'email' || (r.contact ?? '').toLowerCase() === (t.contact ?? '').toLowerCase());
const correct = (r: Route | undefined, id: string) =>
  !!r && [truth[id], ...(truth[id].alternatives ?? [])].some((t) => matches(r, t));
const naive = (id: string): Route => ({
  method: 'email', contact: `privacy@${byId.get(id)?.domain}`, url: null, quote: null, quoteVerified: false, sourceUrl: null, confidence: 0, costUsd: 0,
});
const um = routeIds.map((id) => routes[id]).filter(Boolean);
const route = {
  checkedByHand: routeIds.length,
  excluded: Object.values(truth).filter((t) => t.excluded).length,
  naivePrivacyAt: pct(routeIds.filter((id) => correct(naive(id), id)).length, routeIds.length),
  gemmaSamePages: pct(routeIds.filter((id) => correct(localRoutes[id], id)).length, routeIds.length),
  ultramarine: pct(routeIds.filter((id) => correct(routes[id], id)).length, routeIds.length),
  ultramarineQuotesVerified: pct(um.filter((r) => r.quote && r.quoteVerified).length, um.filter((r) => r.quote).length),
  gemmaQuotesVerified: pct(
    routeIds.map((id) => localRoutes[id]).filter((r) => r?.quote && r.quoteVerified).length,
    routeIds.map((id) => localRoutes[id]).filter((r) => r?.quote).length,
  ),
  ultramarineEstimatedUsd: +um.reduce((s, r) => s + r.costUsd, 0).toFixed(6),
};

// 4. Phone approvals and real sends (from the audit log)
const ledger = readLedger();
const outcomes: Record<string, number> = {};
for (const e of ledger.filter((e) => e.type === 'phone_outcome')) outcomes[String(e.outcome)] = (outcomes[String(e.outcome)] ?? 0) + 1;
const approvals = { outcomes, sent: ledger.filter((e) => e.type === 'sent').length, blocked: ledger.filter((e) => e.type === 'send_blocked').length };

const result = {
  census,
  ghost,
  route,
  approvals,
  run: readJson('census-run.json', null),
  classify: readJson('classify-run.json', null),
  totals: {
    services: candidates.length,
    breachedAfterSignup: Object.values(readJson<Record<string, { afterSignup: boolean }[]>>('breaches.json', {})).filter((m) => m.some((b) => b.afterSignup)).length,
    markedGhost: Object.values(labels).filter((l) => l.user === 'ghost').length,
  },
};
writeJson('eval.json', result);

// Aggregate numbers only: safe to commit and publish.
const md = `# Results

Generated by \`npm run eval\` from cached outputs. Aggregate numbers only.

## Is this a real account? (frozen sample, ${census.labelled} labelled by hand)
| | Precision | Recall |
|---|---|---|
| Rules only (subject keywords) | ${census.rules.precision} | ${census.rules.recall} |
| Gemma 4 E2B (local), alone | ${census.gemma.precision} | ${census.gemma.recall} |

## Ghost or still in use? (${ghost.labelled} labelled)
| | Accuracy | Live accounts it would kill |
|---|---|---|
| Lazy rule (no mail in 2 years) | ${ghost.lazyRuleAccuracy} | ${ghost.liveAccountsLazyRuleWouldKill} |
| Gemma 4 E2B suggestion | ${ghost.gemmaAccuracy} | ${ghost.liveAccountsGemmaWouldKill} |

## Deletion route (${route.checkedByHand} scored, ${route.excluded} excluded as unreachable)
| | Correct | Quotes found on the page |
|---|---|---|
| Guess \`privacy@domain\` | ${route.naivePrivacyAt} | — |
| Gemma 4 E2B on the same excerpts | ${route.gemmaSamePages} | ${route.gemmaQuotesVerified} |
| Ultramarine | ${route.ultramarine} | ${route.ultramarineQuotesVerified} |

Ultramarine estimated cost: $${route.ultramarineEstimatedUsd} (receipt: \`/v1/usage\` before and after).

## Phone approvals and sends
${JSON.stringify(approvals)}

## Totals
${JSON.stringify(result.totals)}
`;
writeFileSync('docs/results.md', md);
console.log(md);
