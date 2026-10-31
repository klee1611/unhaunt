import type { BreachMatch } from './breaches';
import type { Candidate } from './census';
import { readJson, type Proposal } from './ledger';
import type { Classification, GhostSuggestion } from './model';

export interface Route {
  method: 'self_serve' | 'email' | 'form' | 'unknown';
  contact: string | null;
  url: string | null;
  quote: string | null;
  quoteVerified: boolean;
  sourceUrl: string | null;
  confidence: number;
  costUsd: number;
}

export interface Label {
  account?: 'yes' | 'no';
  user?: 'keep' | 'ghost' | 'unsure';
}

// Everything the pipeline has written to data/ (all gitignored).
export function loadAll() {
  return {
    candidates: readJson<Candidate[]>('candidates.json', []),
    run: readJson<Record<string, unknown> | null>('census-run.json', null),
    classifications: readJson<Record<string, Classification | null>>('classifications.json', {}),
    ghostSuggestions: readJson<Record<string, GhostSuggestion | null>>('ghost-suggestions.json', {}),
    breaches: readJson<Record<string, BreachMatch[]>>('breaches.json', {}),
    routes: readJson<Record<string, Route>>('routes.json', {}),
    labels: readJson<Record<string, Label>>('labels.json', {}),
    proposals: readJson<Record<string, Proposal>>('proposals.json', {}),
    sample: readJson<string[]>('sample.json', []),
  };
}
