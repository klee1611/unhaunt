# Failure and surprise log

Every wrong or surprising model output, quoted exactly, with the fix. Newest last.

## 1. Thinking made every call 28× slower (Oct 31, 00:45 EDT)
- **Setup:** `gemma4:e2b-it-qat` via Ollama's OpenAI-compatible API on an M1 with 8 GB; one sender to classify.
- **Default:** 34.0 s, 549 completion tokens (2,171 characters of reasoning) for this answer:
  `{"kind":"account","reason":"Transactional emails related to account onboarding and file activity."}`
- **With `reasoning_effort: "none"`:** 1.2 s, 22 completion tokens, same label:
  `{"kind":"account","reason":"The sender is a known account from Dropbox with relevant email subjects."}`
- **Caveat:** single probe; the first call also included model load. To re-measure on the frozen set.
- **Fix:** thinking off by default in `src/lib/model.ts`.

## 2. Gemma's confidence is always 1 (Oct 31, 01:00 EDT)
- **Setup:** 12 calls on a synthetic 6-service fixture (dry run, not real data).
- **Output:** every classification came back with `"confidence": 1`, including the newsletter.
- **Takeaway:** the number carries no information. The eval scores labels only; the post should not show Gemma's confidence.

## 3. Bots aren't welcome at the graveyard: privacy pages behind 403s (Oct 31, 01:05 EDT)
- **Setup:** fetching the privacy / help pages of 8 well-known services with a plain HTTP request.
- **First try:** 4 / 8 readable. Canva, Adobe and Fiverr returned **HTTP 403 even on the homepage**; Glassdoor kept its policy at a path we didn't try.
- **Fix:** more common policy paths, and when a site blocks scripts, read the newest **Wayback Machine** copy instead (dated, so an old policy is marked as old).
- **After:** 8 / 8 readable (4 direct, 1 direct via a new path, 3 from the archive: Fiverr 2023-12-14, Glassdoor 2026-07-01, Canva 2026-10-29).
