import './env';

import type { Candidate } from '../src/lib/census';
import { logEvent, readJson, writeJson, type Proposal } from '../src/lib/ledger';
import type { Label, Route } from '../src/lib/store';
import { fetchPolicyPages, localRoute, readUsage, ultramarineRoute } from '../src/lib/ultramarine';

// Finds each service's deletion route with Ultramarine, and with the local model as a baseline.
// Usage: npm run routes -- --ghosts | --eval | svc-001 svc-002 …
const args = process.argv.slice(2);
const candidates = readJson<Candidate[]>('candidates.json', []);
const labels = readJson<Record<string, Label>>('labels.json', {});
const ids = args.includes('--ghosts')
  ? Object.entries(labels).filter(([, l]) => l.user === 'ghost').map(([id]) => id)
  : args.includes('--eval')
    ? readJson<string[]>('route-eval-ids.json', [])
    : args.filter((a) => a.startsWith('svc-'));
if (!ids.length) throw new Error('No ids. Use --ghosts, --eval (data/route-eval-ids.json) or list svc-NNN ids.');

const routes = readJson<Record<string, Route>>('routes.json', {});
const localRoutes = readJson<Record<string, Route>>('routes-local.json', {});
const proposals = readJson<Record<string, Proposal>>('proposals.json', {});
const pagesSeen = readJson<Record<string, string[]>>('route-pages.json', {});

await readUsage('before');
let estimated = 0;
for (const id of ids) {
  const c = candidates.find((x) => x.id === id);
  if (!c || c.domain.endsWith('.esp')) {
    console.log(`${id}: skipped (no real domain)`);
    continue;
  }
  const pages = await fetchPolicyPages(c.domain);
  pagesSeen[id] = pages.map((p) => p.url);
  if (!pages.length) {
    routes[id] = localRoutes[id] = { method: 'unknown', contact: null, url: null, quote: null, quoteVerified: false, sourceUrl: null, confidence: 0, costUsd: 0 };
    console.log(`${id} ${c.domain}: no readable policy page`);
    continue;
  }
  const um = await ultramarineRoute(c.displayName, c.domain, pages);
  routes[id] = um.route;
  estimated += um.route.costUsd;
  localRoutes[id] = (await localRoute(c.displayName, c.domain, pages)).route;
  console.log(`${id} ${c.domain}: ultramarine=${um.route.method}${um.route.contact ? ` ${um.route.contact}` : ''} verified=${um.route.quoteVerified} · gemma=${localRoutes[id].method}`);

  // Draft a request only for ghosts with an email route whose address sits in a verified quote.
  if (labels[id]?.user === 'ghost' && um.route.method === 'email' && um.route.contact && !proposals[id]) {
    proposals[id] = {
      id,
      to: um.route.contact,
      toSource: 'verified_quote',
      subject: `Account and personal data deletion request`,
      body: [
        'Hello,',
        '',
        `Please delete my ${c.displayName} account associated with this email address, and the personal information you hold about me, as provided under applicable privacy law (including Canada's PIPEDA).`,
        '',
        'Please confirm by email once the deletion is complete.',
        '',
        'Thank you.',
      ].join('\n'),
      status: 'drafted',
    };
    logEvent({ type: 'drafted', id });
  }
  writeJson('routes.json', routes);
  writeJson('routes-local.json', localRoutes);
  writeJson('proposals.json', proposals);
  writeJson('route-pages.json', pagesSeen);
}
await readUsage('after');
console.log(`Estimated Ultramarine cost this run: $${estimated.toFixed(6)} (compare data/usage-before-* and usage-after-*)`);
