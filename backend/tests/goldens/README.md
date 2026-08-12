# Production response goldens

Captured from the **live** backend `https://dollarseeds-1.onrender.com` on **2026-08-12**, before
any premium-subscription code existed. They are the "before" half of the backward-compatibility
proof: the app binaries already in the App Store send exactly these requests, and must keep
receiving exactly these responses.

Captured with the App Review test account (`appletester@gmail.com`), whose access token was minted
against the project's public anon key — the same path the shipped app uses.

## Why captured from production, not from the test fake

`fake_supabase._project` returns only the keys present on a seeded row, whereas real PostgREST
returns an explicit `null` for a selected-but-empty column. The captured `series_detail.json` proves
it: the first lesson has `"description": null` and `"thumbnail_url": null`. A golden generated from
the fake would encode a contract the wire does not have.

## The requests

| File | Request (old binary sends **no** `X-Client-Features` header) | Status |
|------|--------------------------------------------------------------|--------|
| `series_list.json`      | `GET /lessons/series/`                        | 200 |
| `series_detail.json`    | `GET /lessons/series/{id}/`                   | 200 |
| `playback.json`         | `GET /lessons/{id}/playback/`                 | 200 |
| `err_series_404.json`   | `GET /lessons/series/{unknown-uuid}/`         | 404 |
| `err_playback_404.json` | `GET /lessons/{unknown-uuid}/playback/`       | 404 |
| `err_noauth_401.json`   | `GET /lessons/series/` with no bearer token   | 401 |

## `playback.json` is redacted, deliberately

The real response carries a **live signed URL into the private `lesson-videos` bucket**, valid for
one hour. It is stored here as `<REDACTED-SIGNED-URL>`. Never commit an unredacted capture. Tests
assert the *keys*, the *types*, and `expires_in == 3600` — never the URL value.

## Re-capturing

`series_list.json` currently holds **two** series: "The Truth on Generosity" (4 lessons) and
"Rethinking Finances Through a Godly Lens" (1 lesson). The second is a test series slated for
deletion. **When it is deleted, re-capture** — otherwise `test_backcompat_lessons.py` fails for a
reason unrelated to this feature, on the very test whose job is to catch real regressions.

Re-capture by minting a token for the test account and re-running the six requests above, then
re-redacting the playback URL.
