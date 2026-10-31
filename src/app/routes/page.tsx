import { RouteTruthForm } from '@/components/actions';
import { readJson } from '@/lib/ledger';
import { loadAll, type Route } from '@/lib/store';

export const dynamic = 'force-dynamic';

type Truth = { method: string; contact: string | null; url: string | null; alternatives?: { method: string; contact?: string | null }[]; excluded?: string };

function Answer({ r, truth }: { r?: Route; truth: Truth }) {
  if (!r) return <span className="muted">not run</span>;
  const ok = (t: { method: string; contact?: string | null }) =>
    r.method === t.method && (t.method !== 'email' || (r.contact ?? '').toLowerCase() === (t.contact ?? '').toLowerCase());
  const right = [truth, ...(truth.alternatives ?? [])].some(ok);
  return (
    <span>
      <span className={`chip ${right ? 'ok' : 'bad'}`}>{right ? 'right' : 'wrong'}</span> {r.method}
      {r.contact ? ` · ${r.contact}` : ''} {r.quote ? (r.quoteVerified ? '· quote verified' : '· quote NOT on page') : ''}
    </span>
  );
}

// Blind check: record what the company's own site says first; the models' answers appear after.
export default async function Routes() {
  const d = loadAll();
  const ids = readJson<string[]>('route-eval-ids.json', []);
  const truth = readJson<Record<string, Truth>>('route-truth.json', {});
  const local = readJson<Record<string, Route>>('routes-local.json', {});
  const done = ids.filter((id) => truth[id]).length;
  return (
    <>
      <h1>Deletion routes: hand check</h1>
      <p className="muted">
        For each service, find how to delete an account on the company&apos;s own site (privacy policy or help
        centre) and record it. The models&apos; answers stay hidden until you save yours. {done}/{ids.length} done.
      </p>
      {!ids.length && <p>Run <code>npm run pick-routes</code> first.</p>}
      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>ID</th><th>Service</th><th>Look here</th><th>What the site says</th><th>Ultramarine</th><th>Gemma</th></tr>
          </thead>
          <tbody>
            {ids.map((id) => {
              const c = d.candidates.find((x) => x.id === id);
              if (!c) return null;
              const t = truth[id];
              return (
                <tr key={id}>
                  <td>{id}</td>
                  <td>{c.displayName}<br /><span className="muted">{c.domain}</span></td>
                  <td>
                    <a href={`https://www.${c.domain}/privacy`} target="_blank" rel="noreferrer noopener">/privacy</a>{' · '}
                    <a href={`https://duckduckgo.com/?q=${encodeURIComponent(`${c.displayName} delete account`)}`} target="_blank" rel="noreferrer noopener">search</a>
                  </td>
                  <td><RouteTruthForm id={id} saved={t} /></td>
                  <td>{t ? <Answer r={d.routes[id]} truth={t} /> : <span className="muted">hidden</span>}</td>
                  <td>{t ? <Answer r={local[id]} truth={t} /> : <span className="muted">hidden</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
