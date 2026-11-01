import { CensusButton, DisconnectGmailButton, LabelButtons } from '@/components/actions';
import { lazyRuleGhost } from '@/lib/census';
import { isRedacted } from '@/lib/redact';
import { loadAll } from '@/lib/store';

export const dynamic = 'force-dynamic';

export default async function Census({ searchParams }: { searchParams: Promise<{ sample?: string; redact?: string }> }) {
  const { sample: onlySample, redact } = await searchParams;
  const R = isRedacted(redact);
  const q = R ? 'redact=1' : '';
  const d = loadAll();
  const sampleSet = new Set(d.sample);
  const rows = onlySample ? d.candidates.filter((c) => sampleSet.has(c.id)) : d.candidates;
  const breached = d.candidates.filter((c) => d.breaches[c.id]?.some((b) => b.afterSignup)).length;
  const ghosts = Object.values(d.labels).filter((l) => l.user === 'ghost').length;

  return (
    <>
      <h1>Census</h1>
      <p className="muted">
        Services found in your Gmail signup and welcome emails. Headers only; the inbox never leaves this laptop
        except to Google and the local model.
      </p>
      <CensusButton /> <DisconnectGmailButton />
      <div className="stats">
        <div className="stat"><b>{d.candidates.length}</b>services</div>
        <div className="stat"><b>{d.candidates.filter((c) => c.ruleKind === 'account').length}</b>accounts (rules)</div>
        <div className="stat"><b>{Object.values(d.classifications).filter((c) => c?.kind === 'account').length}</b>accounts (Gemma)</div>
        <div className="stat"><b>{breached}</b>breached after signup</div>
        <div className="stat"><b>{ghosts}</b>marked ghost</div>
      </div>
      <p>
        <a href={`/?${q}`}>All</a> · <a href={`/?sample=1&${q}`}>Frozen answer-key sample ({d.sample.length})</a>
      </p>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>ID</th><th>Service</th><th>First / last mail</th><th>Rules</th><th>Gemma</th><th>Lazy rule</th>
              <th>Breaches</th><th>Real account?</th><th>Keep or ghost?</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => {
              const cls = d.classifications[c.id];
              const b = d.breaches[c.id] ?? [];
              return (
                <tr key={c.id}>
                  <td><a href={`/account/${c.id}${R ? '?redact=1' : ''}`}>{c.id}</a>{sampleSet.has(c.id) && ' ★'}</td>
                  <td>{R ? `Service ${c.id}` : c.displayName}<br /><span className="muted">{R ? '•••' : c.domain} · {c.msgCount} mails</span></td>
                  <td>{c.firstSeen.slice(0, 10)}<br />{c.lastSeen.slice(0, 10)}</td>
                  <td><span className="chip">{c.ruleKind}</span></td>
                  <td>{cls ? <span className="chip" title={R ? undefined : cls.reason}>{cls.kind}</span> : <span className="muted">—</span>}</td>
                  <td>{lazyRuleGhost(c.lastSeen) ? <span className="chip ghost">ghost</span> : <span className="chip">live</span>}</td>
                  <td>{b.length ? <span className="chip bad">{b.filter((x) => x.afterSignup).length}/{b.length}</span> : ''}</td>
                  <td><LabelButtons id={c.id} field="account" value={d.labels[c.id]?.account} /></td>
                  <td><LabelButtons id={c.id} field="user" value={d.labels[c.id]?.user} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
