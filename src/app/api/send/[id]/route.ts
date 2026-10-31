import { NextResponse } from 'next/server';

import { logEvent, readJson, transition, writeJson, type Proposal } from '@/lib/ledger';
import { runTool } from '@/lib/run-tool';
import { sendDeletionRequestTool } from '@/lib/tools';

export const maxDuration = 300;

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const proposals = readJson<Record<string, Proposal>>('proposals.json', {});
  if (!proposals[id]) return NextResponse.json({ ok: false, error: 'no proposal' }, { status: 404 });

  // drafted / denied / expired / error / approved_not_sent → pending_phone (anything else is refused)
  proposals[id] = transition(proposals[id], 'pending_phone');
  writeJson('proposals.json', proposals);
  logEvent({ type: 'proposed', id });

  const res = await runTool(sendDeletionRequestTool, { id }, `/account/${id}`);
  const body = await res.clone().json();
  const outcome = body?.result?.outcome as string | undefined;

  // Phone said no, timed out or failed: record it; nothing was sent.
  if (outcome && ['denied', 'expired', 'no_push', 'error'].includes(outcome)) {
    const latest = readJson<Record<string, Proposal>>('proposals.json', {});
    latest[id] = transition(latest[id], outcome === 'denied' ? 'denied' : outcome === 'expired' ? 'expired' : 'error');
    writeJson('proposals.json', latest);
  }
  return res;
}
