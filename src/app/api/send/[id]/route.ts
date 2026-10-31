import { NextResponse } from 'next/server';

import { auth0 } from '@/lib/auth0';
import { logEvent, readJson, transition, writeJson, type Proposal } from '@/lib/ledger';
import { APPROVAL_MODE, checkAndConsume } from '@/lib/reauth';
import { SERVICE_ID } from '@/lib/request-guard';
import { requireUser, runTool } from '@/lib/run-tool';
import { sendAfterReauthTool, sendDeletionRequestTool } from '@/lib/tools';

export const maxDuration = 300;

function setStatus(id: string, status: Proposal['status']) {
  const latest = readJson<Record<string, Proposal>>('proposals.json', {});
  latest[id] = transition(latest[id], status);
  writeJson('proposals.json', latest);
}

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireUser();
  if (denied) return denied;
  const { id } = await params;
  const proposals = readJson<Record<string, Proposal>>('proposals.json', {});
  if (!SERVICE_ID.test(id) || !Object.hasOwn(proposals, id)) {
    return NextResponse.json({ ok: false, error: 'no proposal' }, { status: 404 });
  }

  if (APPROVAL_MODE === 'reauth') {
    // Step 2: only a sign-in made after the request, within 2 minutes, unlocks one send.
    if (proposals[id].status !== 'pending_phone') {
      return NextResponse.json({ ok: false, error: 'confirm by signing in first' }, { status: 409 });
    }
    const session = await auth0.getSession();
    const fresh = checkAndConsume(id, session?.user.auth_time as number | undefined);
    if (!fresh.ok) {
      setStatus(id, 'expired');
      logEvent({ type: 'approval_outcome', id, method: 'reauth', outcome: 'expired', reason: fresh.reason });
      return NextResponse.json({ ok: true, result: { sent: false, outcome: 'expired', reason: fresh.reason } });
    }
    logEvent({ type: 'reauth_confirmed', id });
    return runTool(sendAfterReauthTool, { id }, `/account/${id}`);
  }

  // Phone approval (CIBA), for paid tenants.
  // drafted / denied / expired / error / approved_not_sent → pending_phone (anything else is refused)
  proposals[id] = transition(proposals[id], 'pending_phone');
  writeJson('proposals.json', proposals);
  logEvent({ type: 'proposed', id });

  const res = await runTool(sendDeletionRequestTool, { id }, `/account/${id}`);
  const body = await res.clone().json();
  const outcome = body?.result?.outcome as string | undefined;

  // Phone said no, timed out or failed: record it; nothing was sent.
  if (outcome && ['denied', 'expired', 'no_push', 'error'].includes(outcome)) {
    setStatus(id, outcome === 'denied' ? 'denied' : outcome === 'expired' ? 'expired' : 'error');
  }
  return res;
}
