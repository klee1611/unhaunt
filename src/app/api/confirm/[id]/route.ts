import { NextResponse } from 'next/server';

import { logEvent, readJson, transition, writeJson, type Proposal } from '@/lib/ledger';
import { loginUrlFor, startConfirmation } from '@/lib/reauth';
import { SERVICE_ID } from '@/lib/request-guard';
import { requireUser } from '@/lib/run-tool';

// Step 1 of a free-tier approval: record the request, then send you to sign in again.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireUser();
  if (denied) return denied;
  const { id } = await params;
  const proposals = readJson<Record<string, Proposal>>('proposals.json', {});
  if (!SERVICE_ID.test(id) || !Object.hasOwn(proposals, id)) {
    return NextResponse.json({ ok: false, error: 'no proposal' }, { status: 404 });
  }
  // drafted / denied / expired / error / approved_not_sent → pending approval
  try {
    proposals[id] = transition(proposals[id], 'pending_phone');
  } catch {
    return NextResponse.json({ ok: false, error: `request is ${proposals[id].status}; nothing to confirm` }, { status: 409 });
  }
  writeJson('proposals.json', proposals);
  startConfirmation(id);
  logEvent({ type: 'reauth_requested', id });
  return NextResponse.json({ ok: true, login: loginUrlFor(id) });
}
