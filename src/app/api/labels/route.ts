import { NextResponse } from 'next/server';
import { z } from 'zod';

import { readJson, writeJson } from '@/lib/ledger';

const Body = z.object({
  id: z.string().regex(/^svc-\d{3}$/),
  account: z.enum(['yes', 'no']).optional(),
  user: z.enum(['keep', 'ghost', 'unsure']).optional(),
});

// Your labels: the answer key (data/labels.json, gitignored).
export async function POST(req: Request) {
  const body = Body.parse(await req.json());
  const labels = readJson<Record<string, { account?: string; user?: string }>>('labels.json', {});
  labels[body.id] = { ...labels[body.id], ...(body.account && { account: body.account }), ...(body.user && { user: body.user }) };
  writeJson('labels.json', labels);
  return NextResponse.json({ ok: true, label: labels[body.id] });
}
