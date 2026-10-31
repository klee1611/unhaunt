# 👻 Unhaunt

**Find the forgotten accounts haunting your inbox. Lay them to rest only when your phone says yes.**

Built for the DEV Hacktoberfest Open-Source AI Challenge, Week 4: *Ghost in the Machine*. Work in progress.

## What it does
1. **Census.** Reads only the *headers* of your Gmail signup and welcome emails (through Auth0 Token Vault) and groups them into the services you have accounts with.
2. **Classify.** A local open model (Gemma 4 E2B via Ollama) separates real accounts from newsletters and suggests which ones are ghosts. Your inbox never leaves your laptop, except to Google itself.
3. **Breaches.** Joins each service's domain against the free public [Have I Been Pwned](https://haveibeenpwned.com/) breach list. No email lookups.
4. **Deletion route.** Ultramarine (Paper Instruments) reads the company's *public* privacy pages and returns how to delete the account, with a quote. Code checks the quote is really on the page; an email address is only used if it sits inside that verified quote. Sites that block scripts are read from the Wayback Machine.
5. **Approval.** Each deletion request is sent from your Gmail only after a human approves it through Auth0:
   - **Free plans (default):** sign in to Auth0 again (`prompt=login`, `max_age=0`). The server only sends if that sign-in happened *after* you asked to send this item and within the last 2 minutes; one sign-in unlocks one send.
   - **Paid plans:** set `APPROVAL_MODE=ciba` to approve a push on your phone instead (Auth0 CIBA + Guardian). Deny, timeout or error: nothing is sent.
   Either way the Gmail token comes from Token Vault, and nothing is ever sent twice.

## Run it
Requires Node 22+, [Ollama](https://ollama.com) and an Auth0 tenant with Token Vault (free plan works; CIBA optional).

```bash
ollama pull gemma4:e2b-it-qat
npm install
cp .env.example .env.local   # fill in Auth0 + Ultramarine values
npm run dev                  # http://localhost:3000 → log in → Run census
npm run classify && npm run breaches && npm run sample
npm run routes -- --ghosts   # after marking ghosts in the UI
npm run eval                 # scores against your labels → docs/results.md
npm test
```

Any OpenAI-compatible open-model endpoint works: set `MODEL_BASE_URL` and `MODEL_NAME`.

## Privacy
Everything the pipeline produces stays in `data/`, which is gitignored. Only aggregate numbers (`docs/results.md`) and a redacted replay are meant to be published.

To take it all back: **Disconnect Gmail** in the app (revokes at Google and removes the Token Vault connection), then `npm run forget -- --yes`. Full details, including revoking at Google directly: [docs/privacy-and-revocation.md](docs/privacy-and-revocation.md).

## Notes
- `docs/`: [privacy and revocation](docs/privacy-and-revocation.md), [security audit](docs/security.md), [failure log](docs/failures.md).
- Code is MIT licensed.
