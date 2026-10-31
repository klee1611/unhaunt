import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { parseAddress, recipientMatchesService } from './request-guard';

export const DATA_DIR = process.env.GHOST_DATA_DIR ?? join(process.cwd(), 'data');

export function dataPath(...parts: string[]) {
  return join(DATA_DIR, ...parts);
}

export function readJson<T>(file: string, fallback: T): T {
  const p = dataPath(file);
  return existsSync(p) ? (JSON.parse(readFileSync(p, 'utf8')) as T) : fallback;
}

export function writeJson(file: string, value: unknown) {
  const p = dataPath(file);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, JSON.stringify(value, null, 2));
}

// Append-only audit log: every proposal, approval outcome and send.
export function logEvent(event: Record<string, unknown>) {
  const p = dataPath('ledger.jsonl');
  mkdirSync(dirname(p), { recursive: true });
  appendFileSync(p, JSON.stringify({ at: new Date().toISOString(), ...event }) + '\n');
}

export function readLedger(): Record<string, unknown>[] {
  const p = dataPath('ledger.jsonl');
  if (!existsSync(p)) return [];
  return readFileSync(p, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

export type ProposalStatus =
  | 'drafted'
  | 'pending_phone'
  | 'approved'
  | 'denied'
  | 'expired'
  | 'error'
  | 'approved_not_sent'
  | 'sent';

export interface Proposal {
  id: string; // candidate id, e.g. svc-017
  to: string;
  toSource: 'verified_quote' | 'user';
  subject: string;
  body: string;
  status: ProposalStatus;
}

// Allowed status changes. Anything else is refused, so the send path can't be reached by accident.
const TRANSITIONS: Record<ProposalStatus, ProposalStatus[]> = {
  drafted: ['pending_phone'],
  pending_phone: ['approved', 'denied', 'expired', 'error'],
  approved: ['sent', 'approved_not_sent'],
  denied: ['pending_phone'],
  expired: ['pending_phone'],
  error: ['pending_phone'],
  // A crash after approval needs a fresh approval; it never resends on its own.
  approved_not_sent: ['pending_phone'],
  sent: [],
};

export function transition(p: Proposal, next: ProposalStatus): Proposal {
  if (!TRANSITIONS[p.status].includes(next)) {
    throw new Error(`Refused status change ${p.status} → ${next} for ${p.id}`);
  }
  return { ...p, status: next };
}

// The last guard before Gmail: approved, one plain recipient that still belongs to the service
// (or that you typed yourself), and never sent before.
export function canSend(
  p: Proposal,
  sentIds: Set<string>,
  serviceDomain?: string,
): { ok: true } | { ok: false; reason: string } {
  if (p.status !== 'approved') return { ok: false, reason: `status is ${p.status}, not approved` };
  if (sentIds.has(p.id)) return { ok: false, reason: 'already sent' };
  if (!parseAddress(p.to)) return { ok: false, reason: 'recipient is not exactly one plain email address' };
  if (p.toSource === 'verified_quote') {
    if (!serviceDomain || !recipientMatchesService(p.to, serviceDomain)) {
      return { ok: false, reason: 'quoted recipient is not on the service domain' };
    }
  } else if (p.toSource !== 'user') {
    return { ok: false, reason: 'recipient not confirmed by a verified quote or by the user' };
  }
  return { ok: true };
}

export function sentIds(): Set<string> {
  return new Set(
    readLedger()
      .filter((e) => e.type === 'sent')
      .map((e) => String(e.id)),
  );
}
