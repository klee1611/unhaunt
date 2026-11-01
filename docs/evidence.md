# Evidence log

Measurements on public data only (no inbox content). Newest last.

## Ultramarine: first call, cost reconciled to the nanodollar (2026-10-31)
- **Input:** Dropbox's public pages (`dropbox.com/privacy`, `help.dropbox.com`), excerpted around deletion keywords.
- **Answer** (`ultramarine-1-flash`, `reasoning_effort: low`, 1.2 s, request `req_agqzcae4wv6cdaoznqhsccwdpe`):
  method `self_serve`, url `https://www.dropbox.com/account/settings`, confidence 0.85, quote:
  > You can access, amend, download, and delete your personal information by logging into your Dropbox account and going to your account settings page .
- **Quote check:** found word for word on `https://www.dropbox.com/privacy` → `quoteVerified: true`.
- **Cost, two ways:**

| | From the response (`usage`) | From `/v1/usage` before → after |
|---|---|---|
| Input tokens | 1,764 | 2,972 → 4,736 (**+1,764**) |
| Output tokens | 73 | 2,394 → 2,467 (**+73**) |
| Requests | 1 | 4 → 5 (**+1**) |
| Cost | $0.0003011 (published rates: $0.15 / M in, $0.50 / M out) | 4,998,357,200 → 4,998,056,100 nanodollars (**−301,100 = $0.0003011**) |

The estimate and the account balance agree exactly.

## Deletion routes: 20 services from my inbox, answer key built blind (2026-10-31)
- **Answer key:** a second agent (Claude, driving the browser) read each company's own privacy / help
  pages *before* looking at any model output, and recorded the route with its source sentence. 6 of 20
  were excluded: 5 sites unreachable from Canada or down (502, timeouts), 1 client-rendered page the
  agent couldn't read. Two services list two valid routes (form or email); either counts.
- **Scores (14 scored):**

| | Correct | Quote found on the page |
|---|---|---|
| Guess `privacy@<domain>` | 3 / 14 (21%) | — |
| Gemma 4 E2B, same excerpts | 8 / 14 (57%) | 80% |
| Ultramarine | 8 / 14 (57%) | **100%** |

- **Where the misses come from:**
  - 2 services (both models "unknown"): our fetcher got **no page at all** (bot walls), so neither model
    had input. With a page fetched (10 services): Ultramarine 6 / 10, Gemma 6 / 10.
  - 1 Ultramarine miss is our own guard: it answered the right address, but its quote stopped just
    before the address, so the "address must be inside the verified quote" rule dropped it. The guard
    failed safe: it lost a right answer instead of emailing an unverified one.
  - Several answers named the right method but no address (same guard).
- **Cost:** Ultramarine, 20 services, $0.00265 estimated from tokens (receipts: `/v1/usage` before and after).
- **Honest limits:** 14 services is small; the key was built by an agent, not a person (spot-check pending).

## Ultramarine: the whole 20-service run, reconciled to the nanodollar (2026-10-31)
10 calls (the 10 services where a privacy page could be fetched), read against `/v1/usage` before and after:

| | Sum of per-call `usage` | `/v1/usage` before → after |
|---|---|---|
| Requests | 10 | 5 → 15 (**+10**) |
| Input tokens | 14,567 | 4,736 → 19,303 (**+14,567**) |
| Output tokens | 930 | 2,467 → 3,397 (**+930**) |
| Cost | $0.00265005 | 4,998,056,100 → 4,995,406,050 nanodollars (**−2,650,050 = $0.00265005**) |

About **$0.000265 per service** with a page, $0.00013 per service attempted.

## Real deletion requests (2026-11-01 UTC)
Three requests sent from my Gmail through Token Vault, each after a fresh Auth0 sign-in made after the
request and within 2 minutes (one sign-in, one send):

| Service | Sent (UTC) | Confirm → sent |
|---|---|---|
| A coding-course site | 01:24:51 | 13 s |
| An antivirus vendor | 01:26:46 | < 20 s |
| A résumé builder | 01:27:05 | < 20 s |

Before the first success: one attempt hung in my quota limiter (nothing sent, fixed), and one was refused
because the sign-in came 24 minutes after the request (the 10-minute window expired). Both are in the log.
