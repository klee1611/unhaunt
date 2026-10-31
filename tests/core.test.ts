import { describe, expect, it } from 'vitest';

import { matchBreaches, type HibpBreach } from '../src/lib/breaches';
import {
  assignIds,
  groupCandidates,
  isCodeSubject,
  isSignupSubject,
  lazyRuleGhost,
  ruleKind,
  serviceDomain,
  type MailMeta,
} from '../src/lib/census';
import { canSend, transition, type Proposal } from '../src/lib/ledger';
import { emailInQuote, quoteIsOnPage } from '../src/lib/quote';

const mail = (from: string, subject: string, date: string, extra: Partial<MailMeta> = {}): MailMeta => ({
  msgId: `${from}-${date}`,
  from,
  subject,
  date,
  ...extra,
});

describe('serviceDomain', () => {
  it('groups subdomains under the registrable domain', () => {
    expect(serviceDomain('Acme <no-reply@mail.accounts.acme.co.uk>')).toBe('acme.co.uk');
  });
  it('skips personal mailboxes', () => {
    expect(serviceDomain('Friend <friend@gmail.com>')).toBeNull();
  });
  it('uses the display name for bulk senders', () => {
    expect(serviceDomain('Ghostly App <bounce@sendgrid.net>')).toBe('ghostlyapp.esp');
  });
});

describe('signup and code subjects', () => {
  it.each([
    'Welcome to Acme!',
    'Please verify your email address',
    'Confirm your account',
    'Thanks for signing up',
    '歡迎加入 Acme',
    '請驗證您的電子郵件',
    '註冊成功',
  ])('treats "%s" as signup', (s) => expect(isSignupSubject(s)).toBe(true));

  it.each(['Your verification code is 123456', '您的驗證碼', 'New sign-in to your account', '483920 is your Acme code'])(
    'treats "%s" as a one-time code',
    (s) => expect(isCodeSubject(s)).toBe(true),
  );
});

describe('ruleKind', () => {
  it('needs a non-code signup subject to call it an account', () => {
    expect(ruleKind([mail('a@x.com', 'Welcome to X', '2016-01-01')])).toBe('account');
    expect(ruleKind([mail('a@x.com', 'Your verification code is 1234', '2016-01-01')])).toBe('unknown');
  });
  it('calls unsubscribe-only mail a newsletter', () => {
    expect(ruleKind([mail('a@x.com', 'October digest', '2016-01-01', { listUnsubscribe: true })])).toBe('newsletter');
  });
});

describe('ids', () => {
  it('keeps existing ids and numbers new domains after the highest', () => {
    const ids = assignIds(['b.com', 'a.com', 'c.com'], { 'b.com': 'svc-007' });
    expect(ids['b.com']).toBe('svc-007');
    expect(ids['a.com']).toBe('svc-008');
    expect(ids['c.com']).toBe('svc-009');
  });
  it('groups mail into candidates with first and last seen', () => {
    const { candidates } = groupCandidates([
      mail('X <a@x.com>', 'Welcome to X', '2015-05-01T00:00:00Z'),
      mail('X <b@mail.x.com>', 'Your X summary', '2019-02-01T00:00:00Z'),
      mail('Pal <p@gmail.com>', 'Welcome!', '2020-01-01T00:00:00Z'),
    ]);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({ domain: 'x.com', msgCount: 2, firstSeen: '2015-05-01T00:00:00Z' });
    expect(candidates[0].lastSeen).toBe('2019-02-01T00:00:00Z');
  });
});

describe('lazyRuleGhost', () => {
  it('flags services silent for more than two years', () => {
    const now = new Date('2026-10-31');
    expect(lazyRuleGhost('2024-01-01', now)).toBe(true);
    expect(lazyRuleGhost('2025-06-01', now)).toBe(false);
  });
});

describe('quote verification', () => {
  const page = '<p>To delete your account, email&nbsp;<b>privacy@acme.com</b> from the address you signed up with.</p>';
  it('accepts a quote that is on the page', () => {
    expect(quoteIsOnPage('To delete your account, email privacy@acme.com from the address you signed up with.', page)).toBe(true);
  });
  it('rejects a paraphrase', () => {
    expect(quoteIsOnPage('You can delete your account by emailing privacy@acme.com', page)).toBe(false);
  });
  it('rejects quotes too short to prove anything', () => {
    expect(quoteIsOnPage('delete', page)).toBe(false);
  });
  it('only trusts an address that is inside the quote', () => {
    expect(emailInQuote('privacy@acme.com', 'email privacy@acme.com from')).toBe(true);
    expect(emailInQuote('dpo@acme.com', 'email privacy@acme.com from')).toBe(false);
  });
});

describe('approval state machine (fail closed)', () => {
  const p: Proposal = {
    id: 'svc-001',
    to: 'privacy@acme.com',
    toSource: 'verified_quote',
    subject: 's',
    body: 'b',
    status: 'drafted',
  };
  it('cannot jump from drafted to sent', () => {
    expect(() => transition(p, 'sent')).toThrow();
  });
  it.each(['denied', 'expired', 'error'] as const)('%s never allows a send', (outcome) => {
    const q = transition(transition(p, 'pending_phone'), outcome);
    expect(canSend(q, new Set())).toMatchObject({ ok: false });
  });
  it('allows exactly one send after approval', () => {
    const q = transition(transition(p, 'pending_phone'), 'approved');
    expect(canSend(q, new Set())).toEqual({ ok: true });
    expect(canSend(q, new Set(['svc-001']))).toMatchObject({ ok: false, reason: 'already sent' });
  });
  it('a crash after approval needs a new approval', () => {
    const q = transition(transition(transition(p, 'pending_phone'), 'approved'), 'approved_not_sent');
    expect(canSend(q, new Set())).toMatchObject({ ok: false });
    expect(() => transition(q, 'sent')).toThrow();
  });
});

describe('matchBreaches', () => {
  const breaches: HibpBreach[] = [
    { Name: 'Acme', Title: 'Acme', Domain: 'acme.com', BreachDate: '2019-03-01', DataClasses: ['Email addresses', 'Passwords'], IsVerified: true, IsFabricated: false, IsSpamList: false },
    { Name: 'Old', Title: 'Acme 2012', Domain: 'www.acme.com', BreachDate: '2012-01-01', DataClasses: ['Email addresses'], IsVerified: true, IsFabricated: false, IsSpamList: false },
    { Name: 'Spam', Title: 'Spam list', Domain: 'acme.com', BreachDate: '2020-01-01', DataClasses: [], IsVerified: false, IsFabricated: false, IsSpamList: true },
  ];
  it('matches by domain, drops spam lists, flags breaches after signup', () => {
    const m = matchBreaches('acme.com', '2016-05-01T00:00:00Z', breaches);
    expect(m.map((b) => [b.name, b.afterSignup])).toEqual([
      ['Acme 2012', false],
      ['Acme', true],
    ]);
  });
});

import { isPrivateAddress, looksPublicHostname, publicFetch, safeHttpUrl, trustedLink } from '../src/lib/safe-url';

describe('fetch and link safety', () => {
  it('drops forged From hosts that are IPs or local names', () => {
    expect(serviceDomain('Evil <a@127.0.0.1>')).toBeNull();
    expect(serviceDomain('Evil <a@[192.168.1.1]>')).toBeNull();
    expect(serviceDomain('Evil <a@router.local>')).toBeNull();
    expect(serviceDomain('Evil <a@localhost>')).toBeNull();
  });
  it('only allows public-looking hostnames', () => {
    expect(looksPublicHostname('www.dropbox.com')).toBe(true);
    for (const h of ['127.0.0.1', 'localhost', 'intranet', 'printer.local', '::1', 'x.internal']) {
      expect(looksPublicHostname(h)).toBe(false);
    }
  });
  it('flags private, loopback and link-local addresses', () => {
    for (const ip of ['127.0.0.1', '10.1.2.3', '172.20.0.1', '192.168.0.1', '169.254.169.254', '100.64.0.1', '::1', 'fd00::1', 'fe80::1', '::ffff:127.0.0.1']) {
      expect(isPrivateAddress(ip)).toBe(true);
    }
    expect(isPrivateAddress('93.184.216.34')).toBe(false);
  });
  it('flags IPv6 forms that hide IPv4 and other special ranges', () => {
    for (const ip of ['2002:7f00:1::1', '64:ff9b::7f00:1', '2001::1', '::', '0.0.0.0', '255.255.255.255', 'ff02::1', 'not-an-ip']) {
      expect(isPrivateAddress(ip)).toBe(true);
    }
    expect(isPrivateAddress('2606:4700:4700::1111')).toBe(false);
  });
  it('keeps model links only on the service domain or present in the page', () => {
    const page = 'Delete your account at https://help.acme.com/delete or contact us.';
    expect(trustedLink('https://acme.com/settings/delete', 'acme.com', page)).toBe('https://acme.com/settings/delete');
    expect(trustedLink('https://evil.example/acme-delete', 'acme.com', page)).toBeNull();
    expect(trustedLink('https://help.acme.com/delete', 'other.com', page)).toBe('https://help.acme.com/delete');
    expect(trustedLink('javascript:alert(1)', 'acme.com', page)).toBeNull();
  });
  it('refuses at connect time a public-looking name that resolves to loopback', async () => {
    // localtest.me is a real public DNS name pointing at 127.0.0.1 (what a rebinding attack relies on).
    await expect(publicFetch('http://localtest.me:11434/api/tags')).rejects.toThrow();
  });
  it('keeps only http(s) URLs from model output', () => {
    expect(safeHttpUrl('https://acme.com/settings/delete')).toBe('https://acme.com/settings/delete');
    expect(safeHttpUrl('javascript:alert(1)')).toBeNull();
    expect(safeHttpUrl('data:text/html,hi')).toBeNull();
    expect(safeHttpUrl('not a url')).toBeNull();
  });
});

import { bindingMessage, isAllowedUser, isSameOrigin, recipientMatchesService } from '../src/lib/request-guard';

describe('request guards', () => {
  const base = 'http://localhost:3000';
  it('refuses state-changing requests from other origins, including other localhost ports', () => {
    expect(isSameOrigin('POST', 'http://localhost:3000', base)).toBe(true);
    expect(isSameOrigin('POST', 'http://localhost:5173', base)).toBe(false);
    expect(isSameOrigin('POST', 'https://evil.example', base)).toBe(false);
    expect(isSameOrigin('POST', null, base)).toBe(false);
    expect(isSameOrigin('GET', null, base)).toBe(true);
  });
  it('enforces the optional owner allowlist', () => {
    expect(isAllowedUser('me@x.com', '')).toBe(true);
    expect(isAllowedUser('me@x.com', 'me@x.com, other@y.com')).toBe(true);
    expect(isAllowedUser('stranger@z.com', 'me@x.com')).toBe(false);
    expect(isAllowedUser(undefined, 'me@x.com')).toBe(false);
  });
  it('names the recipient domain on the phone within Auth0 limits', () => {
    expect(bindingMessage('svc-017', 'privacy@acme.com')).toBe('Unhaunt: deletion request #017 to acme.com');
    const long = bindingMessage('svc-017', `dpo@${'a'.repeat(80)}.com`);
    expect(long.length).toBeLessThanOrEqual(64);
    expect(long).toMatch(/^[a-zA-Z0-9 +\-_.,:#]+$/);
  });
  it('only auto-drafts to addresses on the service domain', () => {
    expect(recipientMatchesService('privacy@acme.com', 'acme.com')).toBe(true);
    expect(recipientMatchesService('dpo@eu.acme.com', 'acme.com')).toBe(true);
    expect(recipientMatchesService('acme@privacy-vendor.com', 'acme.com')).toBe(false);
  });
});
