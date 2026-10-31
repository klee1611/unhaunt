import { randomUUID } from 'node:crypto';
import { runWithAIContext } from '@auth0/ai-vercel';
import { TokenVaultInterrupt } from '@auth0/ai/interrupts';
import { NextResponse } from 'next/server';

import { deleteConnectedAccounts, revokeGoogleGrantTool } from '@/lib/disconnect';
import { logEvent } from '@/lib/ledger';
import { requireUser } from '@/lib/run-tool';

// Revoke Gmail access at Google, then remove the tokens from Auth0 Token Vault.
export async function POST() {
  const denied = await requireUser();
  if (denied) return denied;

  let google: { revoked: boolean; status?: number; note?: string };
  try {
    google = (await runWithAIContext({ threadID: randomUUID() }, () =>
      revokeGoogleGrantTool.execute!({}, { toolCallId: randomUUID(), messages: [] }),
    )) as { revoked: boolean; status: number };
  } catch (err) {
    // No Gmail token in the vault: nothing to revoke at Google.
    google = { revoked: false, note: err instanceof TokenVaultInterrupt ? 'not connected' : (err as Error).message };
  }

  let vault: { found: number; deleted: number } | { error: string };
  try {
    vault = await deleteConnectedAccounts();
  } catch (err) {
    vault = { error: (err as Error).message };
  }

  logEvent({ type: 'disconnect', google, vault });
  return NextResponse.json({ ok: true, google, vault });
}
