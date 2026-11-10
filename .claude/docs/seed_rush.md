# Seed Rush (website game backend)

A free daily Bible-verse game on dollarseeds.app: fill in missing words from verses about
money, work and stewardship against a 60-second clock, then land on a daily global
leaderboard. **Website-only** — no app build calls `/seed-rush/`, and no existing table,
column, endpoint or response changed for it (`tests/test_backcompat_seed_rush.py` proves the
last two against goldens captured from `main`).

| Piece | Where |
|-------|-------|
| Rules (pure functions, constants) | [backend/seed_rush.py](../../backend/seed_rush.py) |
| Routes and persistence | "Seed Rush" section at the end of [backend/main.py](../../backend/main.py) |
| Tables | [backend/migrations/0015_seed_rush.sql](../../backend/migrations/0015_seed_rush.sql) |
| Verse file | [backend/seed_rush_data/verses.json](../../backend/seed_rush_data/verses.json) |
| Loader | [backend/load_seed_rush_verses.py](../../backend/load_seed_rush_verses.py) |
| Tests | `tests/test_seed_rush.py`, `tests/test_backcompat_seed_rush.py`, fixture `tests/fixtures/seed_rush_verses.json` (invented sentences, not Scripture) |

## Accounts and guests

Same Supabase accounts as the app, through the same token verification. Seed Rush never
reads or writes auth user metadata — the app shows its onboarding when
`user_metadata.onboarding_v2_completed_at` is missing, and a website-created account must
still see it on first app launch. Supabase's project-wide email confirmation stays **off**.

Guests send `X-Seed-Rush-Guest: <uuid>` (kept in the website's local storage). A request
with an `Authorization` header is judged on the token alone: a bad token is a 401, never a
fallback to guest. Only verified accounts with a username reach the leaderboard; everyone can
play and keep a streak.

## Environment variables (Render → the backend service → Environment)

| Variable | Needed | What |
|----------|--------|------|
| `SEED_RUSH_SECRET` | **yes, in production** | Keys the daily verse order (HMAC), so a future day's order can't be worked out from the public verse list. Any long random string; changing it changes the order for the current day. Unset → a random per-process value and a warning in the log (fine locally, wrong in production: the order would change on every restart). |
| `RESEND_API_KEY` | yes, to send email | Resend API key. Unset → the verification link is printed to the log instead of emailed (local dev). |
| `RESEND_FROM` | optional | Sender, default `DollarSeeds <no-reply@dollarseeds.app>`. The domain must be verified in Resend. |

## Rules

- **Game day** starts at 7:00 AM `America/New_York` by the wall clock (zoneinfo, so DST never
  moves it): the New York date of (now − 7 h).
- **Modes**: easy (1 blank, 3 options, 1 point per correct verse), medium (3 blanks, 6 options,
  2 per correct word), hard (3 blanks, typed, 5 per correct word; case/punctuation ignored, one
  typo allowed in words of 5+ letters). One try per verse; partial credit in medium and hard.
- **Daily order**: every player in a mode gets the same verses in the same order — a keyed
  shuffle of the active verse ids by HMAC(`SEED_RUSH_SECRET`, day|mode). Option order is keyed
  the same way per (day, mode, verse). Practice: random order, unlimited, never ranked.
- **Clock**: 60 s, answers accepted until 3 s past the deadline. An answer faster than the
  mode's minimum (400 / 1200 / 1500 ms after the verse was served) flags the run; flagged runs
  are never ranked.
- **Leaderboard**: read from finished daily runs (no results table). Higher score, then fewer
  wrong words, then the earlier finish.
- **Streak**: consecutive game days, ending today or yesterday, with a finished daily run in any
  mode. Computed from runs, never stored.
- **Limits**: in-memory per caller and per IP (Render runs one instance); verification email at
  most 3 per account per hour.

Bots that learn the public verses are handled by watching the leaderboard by hand for now.

## Loading verses

```bash
cd backend
venv\Scripts\python load_seed_rush_verses.py --dry-run   # validate only
venv\Scripts\python load_seed_rush_verses.py             # upsert by slug
```

Validates the whole file first (any broken rule → nothing written, message names the slug),
upserts by slug, sets `active = false` on verses no longer in the file (never deletes — past
runs point at them), prints a summary. Safe to rerun. The running backend sees changes within
5 minutes (`SR_VERSE_CACHE_SECONDS`). Changing the active set changes the day's order for
players who start after the load; runs already started keep their verses.

## Account deletion

`POST /account/delete/` also removes the account's Seed Rush answers, runs, profile and guest
claims (`_delete_seed_rush_rows`). Verses are shared content and stay.
