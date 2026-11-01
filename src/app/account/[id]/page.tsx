import { notFound } from 'next/navigation';

import { AskPhoneButton, DraftToAddress, ReauthSend } from '@/components/actions';
import { readLedger } from '@/lib/ledger';
import { isRedacted, maskEmail, maskText } from '@/lib/redact';
import { APPROVAL_MODE } from '@/lib/reauth';
import { safeHttpUrl } from '@/lib/safe-url';
import { loadAll } from '@/lib/store';

export const dynamic = 'force-dynamic';

export default async function Account({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ confirmed?: string; redact?: string }>;
}) {
  const { id } = await params;
  const { confirmed, redact } = await searchParams;
  const R = isRedacted(redact);
  const d = loadAll();
  const c = d.candidates.find((x) => x.id === id);
  if (!c) notFound();
  const route = d.routes[id];
  const proposal = d.proposals[id];
  const events = readLedger().filter((e) => e.id === id);
  // Redacted view: mask the service's name, domain and its first label (e.g. "acme" of acme.co.uk).
  const secrets = c ? [c.displayName, c.domain, c.domain.split('.')[0]] : [];
  const T = (text: string | null | undefined) => (R ? maskText(text ?? '', secrets) : (text ?? ''));

  return (
    <>
      <p><a href={R ? '/?redact=1' : '/'}>← Census</a></p>
      <h1>{R ? `Service ${id}` : c.displayName} <span className="muted">({id})</span></h1>
      <p className="muted">{R ? '••• (redacted)' : c.domain} · first mail {c.firstSeen.slice(0, 10)} · last mail {c.lastSeen.slice(0, 10)} · {c.msgCount} mails</p>

      <h2>Evidence (subjects only)</h2>
      <ul>{c.evidence.map((e) => <li key={e.msgId}>{e.date.slice(0, 10)}: {R ? '(subject hidden)' : e.subject}</li>)}</ul>
      {d.classifications[id] && <p>Gemma: <b>{d.classifications[id]!.kind}</b>, “{T(d.classifications[id]!.reason)}”</p>}

      <h2>Breaches</h2>
      {(d.breaches[id] ?? []).length === 0 ? <p className="muted">None in the public HIBP list for this domain.</p> : (
        <ul>{d.breaches[id].map((b) => (
          <li key={b.name}>{b.date}: {R ? '(breach name hidden)' : b.name} {b.afterSignup ? <span className="chip bad">after you signed up</span> : <span className="chip">before signup</span>} <span className="muted">{b.dataClasses.join(', ')}</span></li>
        ))}</ul>
      )}

      <h2>How to delete it (Ultramarine)</h2>
      {!route ? <p className="muted">Not looked up yet. Run <code>npm run routes</code>.</p> : (
        <>
          <p>
            Method: <b>{route.method}</b>{route.contact && <> · contact <b>{R ? maskEmail(route.contact) : route.contact}</b></>}
            {!R && safeHttpUrl(route.url) && <> · <a href={safeHttpUrl(route.url)!} rel="noreferrer noopener">{route.url}</a></>}
            {' '}{route.quoteVerified ? <span className="chip ok">quote verified on page</span> : <span className="chip bad">quote not found on page</span>}
          </p>
          {route.quote && <blockquote>{T(route.quote)}<br /><span className="muted">— {R ? '(source page hidden)' : route.sourceUrl}</span></blockquote>}
          <p className="muted">Cost: ${route.costUsd.toFixed(6)}</p>
        </>
      )}

      <h2>Deletion request</h2>
      {!proposal ? (
        <>
          <p className="muted">
            No request drafted automatically: only email routes whose address is in a verified quote on the service&apos;s
            own domain get one. If you found the address on the company&apos;s site yourself, type it here. The draft is
            marked as an address you chose.
          </p>
          <DraftToAddress id={id} />
        </>
      ) : (
        <>
          <p>To <b>{R ? maskEmail(proposal.to) : proposal.to}</b> ({proposal.toSource === 'verified_quote' ? 'address from the verified quote' : 'address you typed'}) · status <span className="chip">{proposal.status}</span></p>
          <pre>Subject: {proposal.subject}{'\n\n'}{T(proposal.body)}</pre>
          {APPROVAL_MODE === 'ciba' ? (
            <AskPhoneButton id={id} disabled={proposal.status === 'sent'} />
          ) : (
            <ReauthSend id={id} confirmed={confirmed === '1'} status={proposal.status} />
          )}
        </>
      )}

      <h2>Log</h2>
      <pre>{events.map((e) => JSON.stringify(e)).join('\n') || 'Nothing yet.'}</pre>
    </>
  );
}
