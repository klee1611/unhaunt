import { createHash } from 'node:crypto';
import OpenAI from 'openai';
import { z } from 'zod';

import { lazyRuleGhost, type Candidate } from './census';
import { readJson, writeJson } from './ledger';

// Any OpenAI-compatible endpoint serving an open model: Ollama (default), LM Studio, llama.cpp, a hosted open model.
const client = new OpenAI({
  baseURL: process.env.MODEL_BASE_URL ?? 'http://localhost:11434/v1',
  apiKey: process.env.MODEL_API_KEY ?? 'local',
});
export const MODEL_NAME = process.env.MODEL_NAME ?? 'gemma4:e2b-it-qat';

export const Classification = z.object({
  kind: z.enum(['account', 'newsletter', 'unknown']),
  confidence: z.number().min(0).max(1),
  reason: z.string().max(300),
});
export type Classification = z.infer<typeof Classification>;

export const GhostSuggestion = z.object({
  ghost: z.boolean(),
  reason: z.string().max(300),
});
export type GhostSuggestion = z.infer<typeof GhostSuggestion>;

export interface ModelCall<T> {
  value: T | null; // null = invalid twice, treated as unknown
  cached: boolean;
  promptTokens: number;
  completionTokens: number;
  ms: number;
}

// One JSON call with thinking off (34 s → 1.2 s per call on an M1 in our probe), schema-checked,
// retried once, cached by input hash so re-scoring costs nothing.
export async function jsonCall<T>(schema: z.ZodType<T>, system: string, user: string): Promise<ModelCall<T>> {
  const key = createHash('sha256').update(`${MODEL_NAME}\n${system}\n${user}`).digest('hex').slice(0, 24);
  const cacheFile = `cache/model/${key}.json`;
  const hit = readJson<ModelCall<T> | null>(cacheFile, null);
  if (hit) return { ...hit, cached: true };

  let promptTokens = 0;
  let completionTokens = 0;
  const started = Date.now();
  let value: T | null = null;
  for (let attempt = 0; attempt < 2 && value === null; attempt++) {
    const res = await client.chat.completions.create({
      model: MODEL_NAME,
      temperature: 0,
      response_format: { type: 'json_object' },
      // @ts-expect-error Ollama's OpenAI-compatible API accepts "none" to turn thinking off.
      reasoning_effort: 'none',
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    });
    promptTokens += res.usage?.prompt_tokens ?? 0;
    completionTokens += res.usage?.completion_tokens ?? 0;
    try {
      value = schema.parse(JSON.parse(res.choices[0]?.message?.content ?? ''));
    } catch {
      value = null;
    }
  }
  const call = { value, cached: false, promptTokens, completionTokens, ms: Date.now() - started };
  writeJson(cacheFile, call);
  return call;
}

const CLASSIFY_SYSTEM = `You sort the senders in one person's inbox.
Decide if the sender is a service where the person HAS AN ACCOUNT (they signed up, verified an email, or log in),
a NEWSLETTER/marketing list with no account, or UNKNOWN.
Use only the evidence given. Answer JSON: {"kind":"account"|"newsletter"|"unknown","confidence":0..1,"reason":"one short sentence"}.`;

export function classifyCandidate(c: Candidate) {
  const evidence = c.evidence.map((e) => `- ${e.date.slice(0, 10)}: ${e.subject}`).join('\n');
  return jsonCall(
    Classification,
    CLASSIFY_SYSTEM,
    `Sender: ${c.displayName} (${c.domain})\nEmails: ${c.msgCount}, first ${c.firstSeen.slice(0, 10)}, last ${c.lastSeen.slice(0, 10)}\nSubjects:\n${evidence}`,
  );
}

const GHOST_SYSTEM = `You help one person find GHOST accounts: services they signed up for and no longer use.
Signals of a ghost: no recent email, only a welcome email long ago, a service for a one-off event.
Signals of a live account: recent receipts, security alerts, regular activity.
Answer JSON: {"ghost":true|false,"reason":"one short sentence"}.`;

export function suggestGhost(c: Candidate, today = new Date()) {
  const evidence = c.evidence.map((e) => `- ${e.date.slice(0, 10)}: ${e.subject}`).join('\n');
  return jsonCall(
    GhostSuggestion,
    GHOST_SYSTEM,
    `Today: ${today.toISOString().slice(0, 10)}\nService: ${c.displayName} (${c.domain})\nEmails: ${c.msgCount}, first ${c.firstSeen.slice(0, 10)}, last ${c.lastSeen.slice(0, 10)} (lazy rule says ${lazyRuleGhost(c.lastSeen, today) ? 'ghost' : 'live'})\nSubjects:\n${evidence}`,
  );
}
