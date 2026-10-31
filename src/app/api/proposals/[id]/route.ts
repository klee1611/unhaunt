import { NextResponse } from 'next/server';
import { z } from 'zod';

import type { Candidate } from '@/lib/census';
import { logEvent, readJson, writeJson, type Proposal } from '@/lib/ledger';
import { draftProposal } from '@/lib/proposal';
import { parseAddress, SERVICE_ID } from '@/lib/request-guard';
import { requireUser } from '@/lib/run-tool';

const Body = z.object({ to: z.string().max(254) });

// Draft a deletion request to an address you typed yourself (marked as such; the model didn't choose it).
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireUser();
  if (denied) return denied;
  const { id } = await params;
  const c = readJson<Candidate[]>('candidates.json', []).find((x) => x.id === id);
  if (!SERVICE_ID.test(id) || !c) return NextResponse.json({ ok: false, error: 'unknown service' }, { status: 404 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  const to = parsed.success ? parseAddress(parsed.data.to) : null;
  if (!to) return NextResponse.json({ ok: false, error: 'enter exactly one plain email address' }, { status: 400 });

  const proposals = readJson<Record<string, Proposal>>('proposals.json', {});
  if (proposals[id] && !['drafted', 'denied', 'expired', 'error'].includes(proposals[id].status)) {
    return NextResponse.json({ ok: false, error: `request is ${proposals[id].status}; can't redraft` }, { status: 409 });
  }
  proposals[id] = draftProposal(id, c.displayName, to.address, 'user');
  writeJson('proposals.json', proposals);
  logEvent({ type: 'drafted', id, toSource: 'user' });
  return NextResponse.json({ ok: true });
}
