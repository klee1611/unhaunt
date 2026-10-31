# Privacy and revocation

Unhaunt reads part of your Gmail and can send email as you. This page lists everything it stores,
where, and how to take each piece back. If you ever suspect a security problem, jump to
[the kill switch](#the-kill-switch).

## What exists, and where

| What | Where | Who can read it | Lifetime |
|---|---|---|---|
| Google's grant to the app (Gmail `readonly` + `send`) | Google, plus the Google refresh token held by **Auth0 Token Vault** | Unhaunt, only through Token Vault | Until revoked. While the Google app is in *Testing*, Google expires it 7 days after consent |
| Short-lived Gmail access token | Memory of the running app | The running app | About 1 hour, never written to disk |
| Your Auth0 user and session | Auth0 tenant; encrypted session cookie in your browser | You, Auth0 | Until you delete the user / log out |
| Census: sender names and domains, subject lines, dates | `data/` on your laptop (gitignored) | You | Until you run `npm run forget` |
| Labels, model outputs, deletion routes, send log | `data/` (gitignored) | You | Until you run `npm run forget` |
| Secrets (Auth0 client secret, session key, Ultramarine key) | `.env.local` (gitignored, mode 600) | You | Until you rotate them |

What **never** leaves your laptop: email bodies (never fetched), attachments, and the census itself.
The only things sent anywhere else: Gmail API calls (to Google), the local model (Ollama on `localhost`),
public privacy pages and a service's domain (to Ultramarine), and the deletion emails you approve.

## Ways to revoke, from strongest to narrowest

### 1. In the app: Disconnect Gmail
On the Census page, click **Disconnect Gmail**, then click again to confirm. It:
1. revokes the grant **at Google** (`oauth2.googleapis.com/revoke`; revoking the access token also
   revokes its refresh token), then
2. deletes the connected account in Auth0 (`DELETE /me/v1/connected-accounts/accounts/{id}`), which
   removes the stored tokens from Token Vault.

Both steps matter: Auth0 documents that deleting the connected account alone does **not** revoke the
provider's tokens. The result of each step is shown on the page and written to `data/ledger.jsonl`.

### 2. At Google (works even if the app or Auth0 is compromised)
Go to <https://myaccount.google.com/connections>, find the app (it may be listed as **Unhaunt** or
**auth0.com**) and choose **Delete all connections**. Google cancels the grant; Token Vault can no longer
get Gmail tokens. An access token already handed out keeps working until it expires (at most ~1 hour).

### 3. For the whole app
- **Google Cloud** → project `ghost-accounts` → Google Auth Platform → Clients: delete
  **Unhaunt via Auth0**. Every token issued to that client stops working. Or disable the Gmail API.
- **Auth0** → Authentication → Social → `google-oauth2`: untick Gmail permissions, or set Purpose back
  to *Authentication* only.

### 4. In Auth0
User Management → Users → your user → delete. Removes your Auth0 profile and anything Token Vault holds
for you. Logging out (`/auth/logout`) only ends the browser session; it does not touch Gmail access.

### 5. On your laptop
```bash
npm run forget          # lists what would be deleted
npm run forget -- --yes # deletes everything in data/ except .gitkeep
```

## The kill switch
If you suspect a security issue, in this order:
1. **Revoke at Google** (section 2). This is the one step that doesn't depend on Unhaunt or Auth0.
2. **Delete the Google OAuth client** in Google Cloud (section 3).
3. **Rotate the Auth0 client secret** (Applications → Unhaunt → Settings → Danger Zone → Rotate) and
   update `.env.local`.
4. **`npm run forget -- --yes`**.
5. If the Ultramarine key may have leaked, rotate it at Paper Instruments.

## What can't go wrong by design
- Nothing is sent without a human approval through Auth0 (a fresh sign-in, or a phone push with CIBA).
- Recipients must be one plain address on the service's own domain, found in a quote verified on the
  company's page. See [security.md](security.md).
- A send is never retried automatically and never repeated.
- Email bodies are never requested; only headers.
