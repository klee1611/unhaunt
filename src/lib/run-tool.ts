import { randomUUID } from 'node:crypto';
import { runWithAIContext } from '@auth0/ai-vercel';
import { TokenVaultInterrupt } from '@auth0/ai/interrupts';
import { NextResponse } from 'next/server';

import { auth0 } from './auth0';
import { isAllowedUser } from './request-guard';

type Executable<I> = { execute?: (input: I, options: any) => unknown };

// Defence in depth: routes check the session themselves instead of trusting middleware alone.
export async function requireUser() {
  const session = await auth0.getSession();
  if (!session || !isAllowedUser(session.user.email)) {
    return NextResponse.json({ ok: false, error: 'not signed in' }, { status: 401 });
  }
  return null;
}

// Runs an Auth0-wrapped AI SDK tool directly from code (no model picks it).
// A missing Google connection becomes a link to Auth0's Connected Accounts flow.
export async function runTool<I>(t: Executable<I>, input: I, returnTo: string) {
  const denied = await requireUser();
  if (denied) return denied;
  try {
    const result = await runWithAIContext({ threadID: randomUUID() }, () =>
      t.execute!(input, { toolCallId: randomUUID(), messages: [] }),
    );
    return NextResponse.json({ ok: true, result });
  } catch (err) {
    if (err instanceof TokenVaultInterrupt) {
      const search = new URLSearchParams({ connection: err.connection, returnTo, ...err.authorizationParams });
      for (const s of err.requiredScopes) search.append('scopes', s);
      return NextResponse.json({ ok: false, connect: `/auth/connect?${search}` }, { status: 401 });
    }
    // Log the message only: error objects from HTTP clients can carry request headers (bearer tokens).
    const e = err as { name?: string; message?: string; status?: number };
    console.error(`tool failed: ${e.name ?? 'Error'} ${e.status ?? ''} ${e.message ?? ''}`.trim());
    return NextResponse.json({ ok: false, error: e.message ?? 'tool failed' }, { status: 500 });
  }
}
