# Security audit — Unhaunt

**Date:** 2026-10-31 · **Scope:** this repository (local Next.js app on `localhost:3000`, scripts, dependencies).
**Not in scope:** network reconnaissance and external penetration testing (nothing is internet-facing).

## Threat model
Unhaunt holds delegated Gmail access (read + send), sends real email, runs a local model, and fetches
untrusted web pages. The inputs an attacker controls: **email headers** (anyone can email you and forge
`From`), **web page content** (privacy pages, archived copies), and **other local web pages** open in
your browser (other `localhost` ports count as the same site).

## Findings
| # | Finding | Severity | Status |
|---|---|---|---|
| S1 | SSRF: forged `From` domains / redirects could reach localhost or the LAN | High | **Fixed**: public-suffix domains only; address checked at connect time on every redirect hop (undici `lookup`), IP ranges via `ipaddr.js` |
| S2 | Model-supplied links (`javascript:` or phishing) rendered as links | Medium | **Fixed**: http(s) only, and only on the service's domain or present in the fetched page |
| S3 | CSRF on `POST /api/*` from other localhost origins | Medium | **Fixed**: `Origin` must equal `APP_BASE_URL` |
| S4 | Phone approval didn't show where the email goes; drafts to any quoted address | Medium | **Fixed**: phone shows `#NNN to <domain>`; auto-drafts only to addresses on the service's own domain |
| S4b | Recipient parsed differently by the phone message, domain check and send (e.g. `a@acme.com@evil.com`) | Medium | **Fixed**: one strict single-address parser for all three; the service-domain check is repeated right before sending; only the parsed address is passed to Gmail |
| S5 | Routes trusted middleware alone for auth | Low–Med | **Fixed**: routes check the session too |
| S6 | Unvalidated `/api/send/[id]` (`__proto__`) | Low | **Fixed**: `svc-NNN` pattern + own-property check |
| S7 | Any user of the Auth0 tenant could use the app | Low | **Fixed (opt-in)**: `ALLOWED_EMAILS`; also disable sign-ups in Auth0 |
| S8 | Raw HTTP-client errors logged (may carry request config) | Low | **Fixed**: log name, status and message only |
| S9 | No anti-framing / sniffing headers | Low | **Fixed**: `X-Frame-Options: DENY`, `frame-ancestors 'none'`, `nosniff`, `no-referrer` |
| D1 | `next` 15.5.24: critical cache-poisoning advisories | Critical | **Fixed**: 15.5.28 |
| D2 | `axios` (via `@auth0/ai` → `@openfga/sdk`) prototype-pollution gadgets | High | **Fixed**: override to 1.21.0 |
| D3 | `zod` 3 memory exhaustion on huge collections | High (advisory) | **Accepted**: only tiny objects are validated; zod 4 breaks `@auth0/ai` |
| D4 | `postcss` 8.4.31 bundled in Next | High (advisory) | **Accepted**: build-time only, processes our own CSS |
| D5 | `glob` / `minimatch` via `gaxios` → `rimraf` | Moderate | **Accepted**: no untrusted input reaches them |
| R1 | Prompt injection into Gemma / Ultramarine | — | **Accepted with controls**: schema-checked output, quotes verified on the page, links and recipients traced, nothing sent without phone approval |
| R2 | Inbox metadata at rest in `data/` (unencrypted) | Info | **Accepted**: local and gitignored. Delete `data/` after the challenge |

## Controls that were already in place
Headers-only Gmail access; `gmail.readonly` + `gmail.send` scopes only; fail-closed approval state
machine (deny / timeout / error never send, never resend); duplicate-send guard; recipients must sit inside
a quote verified on the page; secrets only in gitignored `.env.local`.

## Recommended Auth0 settings
- Set `ALLOWED_EMAILS` to your address.
- Disable sign-ups on the Username-Password connection; keep Google in Testing mode (only test users).
- CIBA request expiry stays at 120 s (push channel only).

## Verification
`npm test` (49 tests, incl. crafted recipients, incl. SSRF, CSRF, link provenance, binding message, approval states),
`npm audit --omit=dev` (no critical), `next build` passes.
