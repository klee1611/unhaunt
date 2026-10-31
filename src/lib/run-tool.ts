import { randomUUID } from 'node:crypto';
import { runWithAIContext } from '@auth0/ai-vercel';
import { TokenVaultInterrupt } from '@auth0/ai/interrupts';
import { NextResponse } from 'next/server';

type Executable<I> = { execute?: (input: I, options: any) => unknown };

// Runs an Auth0-wrapped AI SDK tool directly from code (no model picks it).
// A missing Google connection becomes a link to Auth0's Connected Accounts flow.
export async function runTool<I>(t: Executable<I>, input: I, returnTo: string) {
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
    console.error(err);
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 500 });
  }
}
