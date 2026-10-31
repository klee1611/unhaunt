import { tool } from 'ai';
import { z } from 'zod';

import { getAccessToken, withGmail, withPhoneApproval } from './auth0-ai';
import { groupCandidates, SIGNUP_QUERY, type Candidate } from './census';
import { getMeta, gmailClient, latestFrom, listMessageIds, mapLimit, sendMail } from './gmail';
import { canSend, logEvent, readJson, sentIds, transition, writeJson, type Proposal } from './ledger';
import { parseAddress } from './request-guard';

// Census: Token Vault hands over a Gmail token; only headers are read; everything stays in data/.
export const readInboxTool = withGmail(
  tool({
    description: 'Find services the user signed up for, from Gmail signup and welcome email headers',
    inputSchema: z.object({ max: z.number().int().positive().default(5000) }),
    execute: async ({ max }) => {
      const started = Date.now();
      const gmail = gmailClient(await getAccessToken());

      const ids = await listMessageIds(gmail, SIGNUP_QUERY, max);
      const metas = await mapLimit(ids, 10, (id) => getMeta(gmail, id));
      const { candidates, ids: idMap } = groupCandidates(metas, readJson<Record<string, string>>('ids.json', {}));

      // Activity signal: newest mail from each service, any subject.
      await mapLimit(
        candidates.filter((c) => !c.domain.endsWith('.esp')),
        5,
        async (c: Candidate) => {
          const latest = await latestFrom(gmail, c.domain);
          if (latest && latest.date > c.lastSeen) c.lastSeen = latest.date;
          if (latest) c.msgCount = Math.max(c.msgCount, latest.count);
        },
      );

      const run = {
        at: new Date().toISOString(),
        query: SIGNUP_QUERY,
        messages: ids.length,
        candidates: candidates.length,
        ruleAccounts: candidates.filter((c) => c.ruleKind === 'account').length,
        seconds: Math.round((Date.now() - started) / 1000),
      };
      writeJson('candidates.json', candidates);
      writeJson('ids.json', idMap);
      writeJson('census-run.json', run);
      logEvent({ type: 'census', ...run });
      return run;
    },
  }),
);

// Deletion request: phone approval (CIBA) runs first; only then is a Gmail token fetched and the email sent.
export const sendDeletionRequestTool = withPhoneApproval(
  withGmail(
    tool({
      description: 'Send an approved account deletion request from the user Gmail',
      inputSchema: z.object({ id: z.string().regex(/^svc-\d{3}$/) }),
      execute: async ({ id }) => {
        const proposals = readJson<Record<string, Proposal>>('proposals.json', {});
        let p = proposals[id];
        if (!p) return { sent: false, outcome: 'error', reason: 'no proposal' };

        // Reaching this line means the phone said yes.
        p = transition(p, 'approved');
        logEvent({ type: 'phone_outcome', id, outcome: 'approved' });

        const domain = readJson<Candidate[]>('candidates.json', []).find((c) => c.id === id)?.domain;
        const check = canSend(p, sentIds(), domain);
        if (!check.ok) {
          proposals[id] = transition(p, 'approved_not_sent');
          writeJson('proposals.json', proposals);
          logEvent({ type: 'send_blocked', id, reason: check.reason });
          return { sent: false, outcome: 'blocked', reason: check.reason };
        }

        try {
          const gmail = gmailClient(await getAccessToken());
          // Send to the parsed address only, never the raw string.
          const { gmailId } = await sendMail(gmail, parseAddress(p.to)!.address, p.subject, p.body);
          proposals[id] = transition(p, 'sent');
          logEvent({ type: 'sent', id, gmailId });
          return { sent: true, outcome: 'approved', gmailId };
        } catch (err) {
          // Never retried automatically: a fresh phone approval is required.
          proposals[id] = transition(p, 'approved_not_sent');
          logEvent({ type: 'send_failed', id, message: (err as Error).message });
          throw err;
        } finally {
          writeJson('proposals.json', proposals);
        }
      },
    }),
  ),
);
