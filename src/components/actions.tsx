'use client';

import { useState } from 'react';

export function CensusButton() {
  const [state, setState] = useState<string>('');
  return (
    <span>
      <button
        className="primary"
        disabled={state === 'running'}
        onClick={async () => {
          setState('running');
          const res = await fetch('/api/census', { method: 'POST' });
          const body = await res.json();
          if (body.connect) {
            window.location.href = body.connect;
            return;
          }
          setState(body.ok ? `Done: ${body.result.candidates} services from ${body.result.messages} emails` : `Error: ${body.error}`);
          if (body.ok) window.location.reload();
        }}
      >
        {state === 'running' ? 'Reading inbox headers…' : 'Run census'}
      </button>{' '}
      <span className="muted">{state !== 'running' && state}</span>
    </span>
  );
}

const OPTIONS = {
  account: ['yes', 'no'],
  user: ['keep', 'ghost', 'unsure'],
} as const;

export function LabelButtons({
  id,
  field,
  value,
}: {
  id: string;
  field: keyof typeof OPTIONS;
  value?: string;
}) {
  const [current, setCurrent] = useState(value);
  return (
    <span style={{ display: 'inline-flex', gap: 4 }}>
      {OPTIONS[field].map((opt) => (
        <button
          key={opt}
          className={current === opt ? 'on' : ''}
          onClick={async () => {
            setCurrent(opt);
            await fetch('/api/labels', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ id, [field]: opt }),
            });
          }}
        >
          {opt}
        </button>
      ))}
    </span>
  );
}

export function AskPhoneButton({ id, disabled }: { id: string; disabled?: boolean }) {
  const [state, setState] = useState('');
  return (
    <div>
      <button
        className="primary"
        disabled={disabled || state === 'waiting'}
        onClick={async () => {
          setState('waiting');
          const res = await fetch(`/api/send/${id}`, { method: 'POST' });
          const body = await res.json();
          if (body.connect) {
            window.location.href = body.connect;
            return;
          }
          const r = body.result;
          setState(
            r?.sent
              ? `Approved on phone. Sent (Gmail id ${r.gmailId}).`
              : r?.outcome
                ? `Not sent: ${r.outcome}${r.reason ? ` (${r.reason})` : ''}`
                : `Not sent: ${body.error ?? 'unknown error'}`,
          );
        }}
      >
        {state === 'waiting' ? 'Waiting for your phone… (2 min)' : 'Ask my phone to approve sending'}
      </button>
      <p className="muted">{state !== 'waiting' && state}</p>
    </div>
  );
}

// Free-tier approval: sign in to Auth0 again, then send within 2 minutes.
export function ReauthSend({ id, confirmed, status }: { id: string; confirmed: boolean; status: string }) {
  const [state, setState] = useState('');
  const ready = confirmed && status === 'pending_phone';
  if (status === 'sent') return <p className="muted">Sent.</p>;
  return (
    <div>
      {!ready ? (
        <button
          className="primary"
          disabled={state === 'working'}
          onClick={async () => {
            setState('working');
            const res = await fetch(`/api/confirm/${id}`, { method: 'POST' });
            const body = await res.json();
            if (body.login) window.location.href = body.login;
            else setState(`Error: ${body.error ?? 'could not start'}`);
          }}
        >
          Confirm by signing in to Auth0 again
        </button>
      ) : (
        <button
          className="primary"
          disabled={state === 'working'}
          onClick={async () => {
            setState('working');
            const res = await fetch(`/api/send/${id}`, { method: 'POST' });
            const body = await res.json();
            if (body.connect) {
              window.location.href = body.connect;
              return;
            }
            const r = body.result;
            setState(
              r?.sent
                ? `Sent (Gmail id ${r.gmailId}).`
                : `Not sent: ${r?.outcome ?? body.error ?? 'unknown'}${r?.reason ? ` (${r.reason})` : ''}`,
            );
          }}
        >
          Signed in again: send now (valid for 2 minutes)
        </button>
      )}
      <p className="muted">{state !== 'working' && state}</p>
    </div>
  );
}
