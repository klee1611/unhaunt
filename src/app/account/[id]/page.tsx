import { notFound } from 'next/navigation';

import { AskPhoneButton } from '@/components/actions';
import { readLedger } from '@/lib/ledger';
import { loadAll } from '@/lib/store';

export const dynamic = 'force-dynamic';

export default async function Account({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const d = loadAll();
  const c = d.candidates.find((x) => x.id === id);
  if (!c) notFound();
  const route = d.routes[id];
  const proposal = d.proposals[id];
  const events = readLedger().filter((e) => e.id === id);

  return (
    <>
      <p><a href="/">← Census</a></p>
      <h1>{c.displayName} <span className="muted">({id})</span></h1>
      <p className="muted">{c.domain} · first mail {c.firstSeen.slice(0, 10)} · last mail {c.lastSeen.slice(0, 10)} · {c.msgCount} mails</p>

      <h2>Evidence (subjects only)</h2>
      <ul>{c.evidence.map((e) => <li key={e.msgId}>{e.date.slice(0, 10)}: {e.subject}</li>)}</ul>
      {d.classifications[id] && <p>Gemma: <b>{d.classifications[id]!.kind}</b>, “{d.classifications[id]!.reason}”</p>}

      <h2>Breaches</h2>
      {(d.breaches[id] ?? []).length === 0 ? <p className="muted">None in the public HIBP list for this domain.</p> : (
        <ul>{d.breaches[id].map((b) => (
          <li key={b.name}>{b.date}: {b.name} {b.afterSignup ? <span className="chip bad">after you signed up</span> : <span className="chip">before signup</span>} <span className="muted">{b.dataClasses.join(', ')}</span></li>
        ))}</ul>
      )}

      <h2>How to delete it (Ultramarine)</h2>
      {!route ? <p className="muted">Not looked up yet. Run <code>npm run routes</code>.</p> : (
        <>
          <p>
            Method: <b>{route.method}</b>{route.contact && <> · contact <b>{route.contact}</b></>}
            {route.url && <> · <a href={route.url}>{route.url}</a></>}
            {' '}{route.quoteVerified ? <span className="chip ok">quote verified on page</span> : <span className="chip bad">quote not found on page</span>}
          </p>
          {route.quote && <blockquote>{route.quote}<br /><span className="muted">— {route.sourceUrl}</span></blockquote>}
          <p className="muted">Cost: ${route.costUsd.toFixed(6)}</p>
        </>
      )}

      <h2>Deletion request</h2>
      {!proposal ? <p className="muted">No request drafted. Only email routes with a verified address get one.</p> : (
        <>
          <p>To <b>{proposal.to}</b> ({proposal.toSource === 'verified_quote' ? 'address from the verified quote' : 'address you typed'}) · status <span className="chip">{proposal.status}</span></p>
          <pre>Subject: {proposal.subject}{'\n\n'}{proposal.body}</pre>
          <AskPhoneButton id={id} disabled={proposal.status === 'sent'} />
        </>
      )}

      <h2>Log</h2>
      <pre>{events.map((e) => JSON.stringify(e)).join('\n') || 'Nothing yet.'}</pre>
    </>
  );
}
