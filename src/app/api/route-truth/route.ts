import { NextResponse } from 'next/server';
import { z } from 'zod';

import { readJson, writeJson } from '@/lib/ledger';
import { parseAddress } from '@/lib/request-guard';
import { requireUser } from '@/lib/run-tool';
import { safeHttpUrl } from '@/lib/safe-url';

const Body = z.object({
  id: z.string().regex(/^svc-\d{3}$/),
  method: z.enum(['self_serve', 'email', 'form', 'unknown']),
  contact: z.string().max(254).optional(),
  url: z.string().max(2048).optional(),
  note: z.string().max(500).optional(),
});

// Your hand-checked deletion route: the answer key for the Ultramarine test (data/route-truth.json).
export async function POST(req: Request) {
  const denied = await requireUser();
  if (denied) return denied;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: 'bad input' }, { status: 400 });
  const b = parsed.data;
  const contact = b.contact?.trim() ? parseAddress(b.contact)?.address : null;
  if (b.method === 'email' && !contact) return NextResponse.json({ ok: false, error: 'email method needs one plain address' }, { status: 400 });
  const truth = readJson<Record<string, unknown>>('route-truth.json', {});
  truth[b.id] = { method: b.method, contact: contact ?? null, url: safeHttpUrl(b.url) ?? null, note: b.note ?? '', checkedAt: new Date().toISOString() };
  writeJson('route-truth.json', truth);
  return NextResponse.json({ ok: true });
}
