import { NextResponse } from 'next/server';
import { z } from 'zod';

import { readJson, writeJson } from '@/lib/ledger';
import { requireUser } from '@/lib/run-tool';

const Body = z.object({
  id: z.string().regex(/^svc-\d{3}$/),
  account: z.enum(['yes', 'no']).optional(),
  user: z.enum(['keep', 'ghost', 'unsure']).optional(),
});

// Your labels: the answer key (data/labels.json, gitignored).
export async function POST(req: Request) {
  const denied = await requireUser();
  if (denied) return denied;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: 'bad label' }, { status: 400 });
  const body = parsed.data;
  const labels = readJson<Record<string, { account?: string; user?: string }>>('labels.json', {});
  labels[body.id] = { ...labels[body.id], ...(body.account && { account: body.account }), ...(body.user && { user: body.user }) };
  writeJson('labels.json', labels);
  return NextResponse.json({ ok: true, label: labels[body.id] });
}
