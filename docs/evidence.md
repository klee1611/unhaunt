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
