"""Backward compatibility for Seed Rush: no existing endpoint changed.

Seed Rush (migration 0015, routes under /seed-rush) is website-only. The app builds
already on people's phones (1.1.0 and 1.2.0, plus the older markers) never call it, and
must get exactly what they got before. Two goldens prove that, both captured by
running this file against `main`'s code, before Seed Rush existed:

  * `openapi.json` — the API's whole declared surface: every path, method, parameter,
    request body and response model. Every non-/seed-rush path must be identical, and
    every schema main declared must be identical, so no route, field or validation
    rule moved.
  * `<generation>.json` — the bodies a fixed scenario of reads and writes returns, byte
    for byte. It runs twice here: on a plain account, and on the same account after it
    has played Seed Rush, set a username and verified, so Seed Rush rows cannot leak
    into anything the app reads.

Re-capturing (only if the scenario itself changes — never to make a failure pass):

    git worktree add <tmp> main
    copy this file into <tmp>/backend/tests/
    cd <tmp>/backend && WRITE_SEED_RUSH_GOLDENS=<this repo>/backend/tests/goldens/seed_rush_backcompat \\
        <venv python> -m pytest -q tests/test_backcompat_seed_rush.py -k golden
    git worktree remove <tmp>
"""

from __future__ import annotations

import datetime
import json
import os
import re
from pathlib import Path

import pytest

import main
from conftest import USER_A, auth, v2

GOLDEN_DIR = Path(__file__).parent / "goldens" / "seed_rush_backcompat"
WRITE_DIR = os.environ.get("WRITE_SEED_RUSH_GOLDENS")

TODAY = datetime.date(2026, 10, 27)

GENERATIONS = {
    "no-marker": auth(USER_A),
    "store-1.1.0": v2(USER_A, "premium, social, limits"),
    "store-1.2.0": v2(USER_A, "premium, social, limits, goals_v2"),
}


# Debt Freedom stamps `updated_at` with the wall clock when a read settles a cycle. It
# is the only value in the scenario that differs from run to run, so it is the only
# thing masked.
_STAMP = re.compile(r'"updated_at":"\d{4}-\d\d-\d\dT[0-9:.]+\+00:00"')


def _masked(content: bytes) -> str:
    return _STAMP.sub('"updated_at":"<now>"', content.decode("utf-8"))


def _write(name: str, data) -> None:
    Path(WRITE_DIR).mkdir(parents=True, exist_ok=True)
    (Path(WRITE_DIR) / name).write_text(
        json.dumps(data, indent=2, ensure_ascii=False, sort_keys=True) + "\n", encoding="utf-8")


def _golden(name: str):
    return json.loads((GOLDEN_DIR / name).read_text(encoding="utf-8"))


def seed(db) -> None:
    """An account with something on every screen the scenario reads."""
    db.seed("user_settings", {"user_id": USER_A, "tithe_enabled": True, "tithe_rate": 0.10,
                              "budget_type": "balanced"})
    db.seed("income", {"user_id": USER_A, "amount": 3000.0, "day": 1, "month": "March",
                       "title": "Paycheck", "source": "Job"})
    db.seed("expenses", {"user_id": USER_A, "title": "Rent", "amount": 1200.0,
                         "category": "Needs", "day": 2, "month": "March"})
    general = db.seed("savings_goals", {"user_id": USER_A, "title": "General Savings",
                                        "is_general": True, "created_at": "2026-05-01T10:00:00"})
    fund = db.seed("savings_goals", {"user_id": USER_A, "title": "Emergency fund",
                                     "target_amount": 3000.0, "target_month": "January",
                                     "target_year": 2027, "created_at": "2026-06-01T10:00:00"})
    db.seed("savings_transactions", {"user_id": USER_A, "title": "Starting balance",
                                     "amount": 500.0, "type": "deposit", "goal_id": general["id"],
                                     "source": "opening", "day": 1, "month": "May",
                                     "created_at": "2026-05-01T10:01:00+00:00"})
    db.seed("savings_transactions", {"user_id": USER_A, "title": "Emergency fund",
                                     "amount": 100.0, "type": "deposit", "goal_id": fund["id"],
                                     "source": "income", "day": 5, "month": "September",
                                     "created_at": "2026-09-05T09:00:00+00:00"})
    db.seed("debts", {"user_id": USER_A, "name": "Visa", "original_balance": 1000.0,
                      "current_balance": 800.0, "min_payment": 50.0, "apr": 20.0, "due_day": 14,
                      "created_at": "2026-09-01T10:00:00+00:00"})
    db.seed("lesson_series", {"id": "s-gen", "title": "Generosity", "description": "A series.",
                              "creator": "Igor", "thumbnail_url": "https://img/gen.png",
                              "is_published": True, "is_premium": False, "sort_order": 0})


def seed_seed_rush(db) -> None:
    """The same account after playing Seed Rush on the website. Stored directly rather
    than through db.seed(), which draws an id and a stamp from the fake's counters
    even when given its own, and would shift every id the scenario's writes get."""
    stamp = "2026-10-26T12:00:00+00:00"

    def put(table, row):
        db.rows(table).append(row)
        return row

    put("seed_rush_profiles", {"id": 9001, "created_at": stamp, "user_id": USER_A,
                               "username": "Gardener",
                               "email_verified_at": "2026-10-20T12:00:00+00:00"})
    run = put("seed_rush_runs", {
        "id": "aaaaaaaa-0000-4000-8000-000000000001", "user_id": USER_A, "guest_id": None,
        "kind": "daily", "mode": "hard", "game_day": "2026-10-26", "verse_order": [1, 2],
        "current_index": 2, "started_at": "2026-10-26T12:00:00+00:00",
        "deadline_at": "2026-10-26T12:01:00+00:00", "finished_at": "2026-10-26T12:00:40+00:00",
        "score": 25, "words_right": 5, "words_wrong": 1, "flagged": False, "created_at": stamp})
    put("seed_rush_answers", {"id": 9002, "created_at": stamp, "run_id": run["id"],
                              "position": 0, "verse_id": 1, "submitted": ["a", "b", "c"],
                              "correct": [True, True, True], "points": 15, "elapsed_ms": 9000})


def scenario(client, headers) -> dict:
    """Reads and writes across the app's screens, in a fixed order. Returns
    {step: "<status> <body>"} with the body exactly as served."""
    out: dict = {}

    def call(step, method, path, hdrs=None, **kw):
        res = client.request(method, path, headers=headers if hdrs is None else hdrs, **kw)
        out[step] = f"{res.status_code} {_masked(res.content)}"
        return res

    q = {"today": TODAY.isoformat()}
    call("01 health", "GET", "/", hdrs={})
    call("02 config", "GET", "/config/", hdrs={})
    call("03 settings", "GET", "/settings/")
    call("04 expenses", "GET", "/expenses/details/", params={"month": "March", "category": "Needs"})
    call("05 income", "GET", "/income/details/", params={"month": "March"})
    call("06 balance", "GET", "/savings/balance/")
    call("07 goals", "GET", "/savings/goal/", params=q)
    call("08 completed", "GET", "/savings/goal/completed/")
    call("09 entitlements", "GET", "/me/entitlements/")
    call("10 announcements", "GET", "/announcements/")
    call("11 lessons", "GET", "/lessons/series/")
    call("12 garden", "GET", "/debt-freedom/", params=q)
    call("13 debt settings", "GET", "/debt-freedom/settings")
    created = call("14 add expense", "POST", "/expenses/", json={
        "title": "Coffee", "amount": 4.5, "category": "Wants", "day": 3, "month": "March"})
    call("15 delete expense", "DELETE", f"/expenses/delete/{created.json()['data'][0]['id']}")
    call("16 onboarding preview", "POST", "/onboarding/preview/", hdrs={},
         json={"income": 3000, "today": TODAY.isoformat()})
    call("17 no token", "GET", "/settings/", hdrs={})
    call("18 forged token", "GET", "/settings/",
         hdrs={"Authorization": "Bearer not.a.token"})
    call("19 delete account, wrong word", "POST", "/account/delete/",
         json={"confirmation": "delete"})
    call("20 delete account", "POST", "/account/delete/", json={"confirmation": "DELETE"})
    return out


@pytest.fixture
def pinned_server_date(monkeypatch):
    monkeypatch.setattr(main, "_df_server_today", lambda: TODAY)


# ══ The declared API surface ═══════════════════════════════════════════════════

def test_golden_openapi_matches_main():
    spec = main.app.openapi()
    if WRITE_DIR:
        _write("openapi.json", spec)
        pytest.skip("golden written")
    want = _golden("openapi.json")

    paths = {p: v for p, v in spec["paths"].items() if not p.startswith("/seed-rush")}
    assert sorted(paths) == sorted(want["paths"])
    for path, ops in want["paths"].items():
        assert paths[path] == ops, f"{path} changed"

    schemas = spec.get("components", {}).get("schemas", {})
    for name, schema in want.get("components", {}).get("schemas", {}).items():
        assert schemas.get(name) == schema, f"schema {name} changed"
    # Anything new is Seed Rush's own.
    added = set(schemas) - set(want.get("components", {}).get("schemas", {}))
    assert all(n.startswith("SeedRush") for n in added), sorted(added)


# ══ What the installed builds receive ══════════════════════════════════════════

@pytest.mark.parametrize("generation", list(GENERATIONS))
def test_golden_responses_match_main(client, supabase_db, pinned_server_date, generation):
    seed(supabase_db)
    got = scenario(client, GENERATIONS[generation])
    if WRITE_DIR:
        _write(f"{generation}.json", got)
        pytest.skip("golden written")
    want = _golden(f"{generation}.json")
    assert sorted(got) == sorted(want)
    for step in want:
        assert got[step] == want[step], f"{generation} · {step} differs from main"


@pytest.mark.parametrize("generation", list(GENERATIONS))
def test_golden_responses_match_main_after_playing_seed_rush(client, supabase_db,
                                                             pinned_server_date, generation):
    if WRITE_DIR:
        pytest.skip("the plain scenario is the golden")
    seed(supabase_db)
    seed_seed_rush(supabase_db)
    got = scenario(client, GENERATIONS[generation])
    want = _golden(f"{generation}.json")
    for step in want:
        assert got[step] == want[step], f"{generation} · {step} differs from main"
