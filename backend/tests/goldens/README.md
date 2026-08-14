# Production response goldens

Captured from the **live** backend `https://dollarseeds-1.onrender.com`, with the premium code
paths dark. They are the "before" half of the backward-compatibility proof: the app binaries
already in the App Store send exactly these requests, and must keep receiving exactly these
responses.

Captured with the App Review test account (`appletester@gmail.com`), whose access token was minted
against the project's public anon key — the same path the shipped app uses.

Current capture: **2026-08-12**, holding the single published series **"The Truth on Generosity"**
(4 lessons). An earlier capture also contained "Rethinking Finances Through a Godly Lens", a test
series since deleted from production.

## Why captured from production, not from the test fake

`fake_supabase._project` originally returned only the keys present on a seeded row, whereas real
PostgREST returns an explicit `null` for a selected-but-empty column — a difference that matters,
because the shipped app reads `lesson.description` directly and null is not the same as undefined.
The first capture caught it: a lesson came back with `"description": null` where the fake would
have dropped the key. The fake was fixed to match.

Today's capture happens to have every column populated, so it no longer demonstrates that on its
own. The invariant is pinned directly instead, by
`test_backcompat_lessons.py::test_an_empty_column_is_null_on_the_wire_not_a_missing_key` — it is a
property of the API, and must not quietly lose its coverage the next time the published content
changes.

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

These goldens track **production content**, so publishing, deleting or editing a series makes them
stale — and a stale golden fails `test_backcompat_lessons.py` for a reason unrelated to the change
being made, on the very tests whose job is to catch real regressions.

When that happens:

1. Mint an access token for `appletester@gmail.com` against `/auth/v1/token?grant_type=password`
   using the project's anon key.
2. Re-run the six requests in the table above.
3. Replace `playback.json`'s `url` with `<REDACTED-SIGNED-URL>`.
4. Update the `live_content` fixture in `test_backcompat_lessons.py` to mirror the new content —
   the fixture and these files are derived together and must agree.

Only the content-shaped assertions move. The *contract* assertions — key sets, the six lesson keys,
`lessons` never being omitted, `expires_in == 3600`, the error bodies — are invariants and should
survive any re-capture untouched. If one of those has to change to make a re-capture pass, that is
a real regression, not a stale file.
