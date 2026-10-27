"""Backward compatibility for every build that does NOT send `goals_v2`.

Four generations of binary are installed and cannot be updated: the original App
Store build (no header), `premium`, `premium, social`, and store build 1.1.0
(`premium, social, limits`). None of them knows about monthly minimums, Ready to
Replant or "kept under budget", and all of them still show General Savings.

GOALS_REWORK.md asks for responses BYTE-IDENTICAL to `main` for goals, savings,
history, delete and /home/progress/. That is what this file proves:

  * `goldens/goals_v2_backcompat/<generation>.json` were captured by running
    `scenario()` below against `main`'s code and `main`'s fake database — i.e. the
    schema BEFORE migration 0013 (see "Re-capturing").
  * The test runs the same scenario against this branch's code and this branch's fake,
    which has the 0013 columns (present-and-NULL, as select('*') returns them once the
    migration is applied), and compares every response body byte for byte.

So it covers both halves at once: the new code paths are inert for these builds, and
the new columns never leak into what they receive.

The scenario holds only data an old build can produce. What an old build sees on an
account a goals_v2 build has ALSO used is covered at the bottom of this file, against
explicit assertions rather than goldens (`main` has no such data to compare with).

Re-capturing (only if the scenario itself changes — never to make a failure pass):

    git worktree add <tmp> main
    copy this file into <tmp>/backend/tests/
    cd <tmp>/backend && WRITE_GOALS_V2_GOLDENS=<this repo>/backend/tests/goldens/goals_v2_backcompat \\
        <venv python> -m pytest -q tests/test_backcompat_goals_v2.py -k golden
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

GOLDEN_DIR = Path(__file__).parent / "goldens" / "goals_v2_backcompat"
WRITE_DIR = os.environ.get("WRITE_GOALS_V2_GOLDENS")

# The phone's date and the server's, pinned: /home/progress/ reads both, and _df_today
# ignores a client date more than a day from the server's.
TODAY = datetime.date(2026, 10, 27)
MONTH = "October"

GENERATIONS = {
    "no-marker": auth(USER_A),
    "premium": v2(USER_A, "premium"),
    "premium+social": v2(USER_A, "premium, social"),
    "store-1.1.0": v2(USER_A, "premium, social, limits"),
}

# transfer_group is a fresh uuid4 per transfer. It is the only value in the scenario
# that differs from run to run, so it is the only thing masked.
_UUID = re.compile(rb'"transfer_group":"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}"')


def _masked(content: bytes) -> str:
    return _UUID.sub(b'"transfer_group":"<uuid>"', content).decode("utf-8")


def seed(db) -> dict:
    """A user with every kind of row an old build can have: General Savings with a
    starting balance, a month-end rollover and a transfer out of it, a goal funded
    this month and last, a completed goal, and a goal-less legacy deposit."""
    def goal(**row):
        return db.seed("savings_goals", {"user_id": USER_A, **row})

    def txn(**row):
        return db.seed("savings_transactions", {"user_id": USER_A, **row})

    general = goal(title="General Savings", is_general=True, target_amount=None,
                   created_at="2026-05-01T10:00:00")
    fund = goal(title="Emergency fund", target_amount=3000.0, target_month="January",
                target_year=2027, created_at="2026-06-01T10:00:00")
    goal(title="Old car", target_amount=800.0, target_month="August", target_year=2026,
         completed=True, completed_amount=800.0, completed_at="2026-08-20T12:00:00+00:00",
         created_at="2026-05-02T10:00:00")
    txn(title="Starting balance", amount=500.0, type="deposit", goal_id=general["id"],
        source="opening", day=1, month="May", created_at="2026-05-01T10:01:00+00:00")
    txn(title="Rollover — September", amount=120.0, type="deposit", goal_id=general["id"],
        source="rollover", day=28, month="September", created_at="2026-10-01T09:00:00+00:00")
    txn(title="Emergency fund", amount=100.0, type="deposit", goal_id=fund["id"],
        source="income", day=5, month="September", created_at="2026-09-05T09:00:00+00:00")
    txn(title="Emergency fund", amount=200.0, type="deposit", goal_id=fund["id"],
        source="income", day=3, month="October", created_at="2026-10-03T09:00:00+00:00")
    group = "0b0b0b0b-1111-2222-3333-444444444444"
    txn(title="Transfer from General Savings to Emergency fund", amount=50.0, type="withdrawal",
        goal_id=general["id"], source="transfer", transfer_group=group, day=6, month="October",
        created_at="2026-10-06T09:00:00+00:00")
    txn(title="Emergency fund", amount=50.0, type="deposit", goal_id=fund["id"],
        source="transfer", transfer_group=group, day=6, month="October",
        created_at="2026-10-06T09:00:01+00:00")
    txn(title="Deposit", amount=30.0, type="deposit", goal_id=None, source="income",
        day=2, month="April", created_at="2026-04-02T09:00:00+00:00")
    db.seed("income", {"user_id": USER_A, "amount": 2000.0, "day": 1, "month": MONTH})
    return {"general": general["id"], "fund": fund["id"]}


def scenario(client, db, headers) -> dict:
    """Every request the old Goals tab and home make, reads and writes, in a fixed
    order. Returns {step: "<status> <body>"} with the body exactly as served."""
    ids = seed(db)
    out: dict = {}

    def call(step, method, path, **kw):
        res = client.request(method, path, headers=headers, **kw)
        out[step] = f"{res.status_code} {_masked(res.content)}"
        return res

    q = {"today": TODAY.isoformat()}
    call("01 goals", "GET", "/savings/goal/")
    call("02 completed", "GET", "/savings/goal/completed/")
    call("03 balance", "GET", "/savings/balance/")
    call("04 history", "GET", "/savings/history/")
    call("05 progress", "GET", "/home/progress/", params=q)
    call("06 starting balance again", "POST", "/savings/starting-balance/",
         json={"amount": 900.0, "day": 27, "month": MONTH})
    created = call("07 create goal", "POST", "/savings/goal/", json={
        "title": "Holiday", "target_amount": 1200.0, "target_month": "March",
        "target_year": 2027, "goal_type": "saving"})
    holiday = created.json()["data"][0]["id"]
    call("08 edit goal", "PATCH", f"/savings/goal/{holiday}", json={"target_amount": 1500.0})
    call("09 edit nothing", "PATCH", f"/savings/goal/{holiday}", json={})
    dep = call("10 deposit", "POST", "/savings/transaction/", json={
        "title": "Holiday", "amount": 75.0, "type": "deposit", "goal_id": holiday,
        "day": 27, "month": MONTH, "source": "income"})
    call("11 transfer", "POST", "/savings/transfer/", json={
        "amount": 25.0, "to_goal_id": holiday, "general_goal_id": ids["general"],
        "day": 27, "month": MONTH, "to_goal_title": "Holiday"})
    call("12 history", "GET", "/savings/history/")
    call("13 delete deposit", "DELETE", f"/savings/transaction/{dep.json()['data'][0]['id']}")
    call("14 delete goal", "DELETE", f"/savings/goal/{ids['fund']}", params={"current_month": MONTH})
    call("15 goals", "GET", "/savings/goal/")
    call("16 balance", "GET", "/savings/balance/")
    call("17 history", "GET", "/savings/history/")
    call("18 history for a month", "GET", "/savings/history/", params={"month": MONTH})
    call("19 progress", "GET", "/home/progress/", params=q)
    call("20 legacy complete", "PATCH", f"/savings/goal/{holiday}/complete")
    call("21 completed", "GET", "/savings/goal/completed/")
    return out


@pytest.fixture
def pinned_server_date(monkeypatch):
    monkeypatch.setattr(main, "_df_server_today", lambda: TODAY)


@pytest.mark.parametrize("generation", list(GENERATIONS))
def test_golden_responses_match_main(client, supabase_db, pinned_server_date, generation):
    got = scenario(client, supabase_db, GENERATIONS[generation])
    path = GOLDEN_DIR / f"{generation}.json"
    if WRITE_DIR:
        Path(WRITE_DIR).mkdir(parents=True, exist_ok=True)
        (Path(WRITE_DIR) / f"{generation}.json").write_text(
            json.dumps(got, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        pytest.skip("golden written")
    want = json.loads(path.read_text(encoding="utf-8"))
    assert list(got) == list(want)
    for step in want:
        assert got[step] == want[step], f"{generation} · {step} differs from main"


# ══ After a goals_v2 build has used the same account ═══════════════════════════
# `main` has no Ready to Replant, minimum rows or goal-level 'opening' deposits, so
# there is no golden to compare with. What an old build must see instead: no new keys,
# no Ready to Replant goal, the starting-balance screen still able to tell, and the
# same total balance.

V2 = v2(USER_A, "premium, social, limits, goals_v2")


@pytest.fixture
def shared_account(client, supabase_db, pinned_server_date):
    ids = seed(supabase_db)
    # The goals_v2 build loads the goals (Ready to Replant + the one-time move),
    # creates a goal with money already saved, logs a minimum, and deletes a goal.
    assert client.get("/savings/goal/", headers=V2, params={"today": TODAY.isoformat()}).status_code == 200
    res = client.post("/savings/goal/", headers=V2, json={
        "title": "Bike", "target_amount": 600.0, "target_month": "January", "target_year": 2027,
        "saved_amount": 100.0, "saved_source": "opening", "today": TODAY.isoformat()})
    assert res.status_code == 200, res.text
    bike = res.json()["data"][0]["id"]
    assert client.post(f"/savings/goal/{bike}/minimum", headers=V2,
                       json={"today": TODAY.isoformat()}).status_code == 200
    assert client.delete(f"/savings/goal/{ids['fund']}", headers=V2,
                         params={"current_month": MONTH, "today": TODAY.isoformat()}).status_code == 200
    return {**ids, "bike": bike}


V2_GOAL_KEYS = {"monthly_minimum", "auto_minimum", "auto_minimum_month", "is_replant",
                "replant_seed_amount", "minimum_logged", "minimum_amount", "on_pace",
                "ready_to_complete"}


@pytest.mark.parametrize("generation", list(GENERATIONS))
def test_old_builds_never_see_ready_to_replant_or_new_keys(client, shared_account, generation):
    headers = GENERATIONS[generation]
    goals = client.get("/savings/goal/", headers=headers).json()["data"]
    assert [g["title"] for g in goals if not g.get("is_general")] == ["Bike"]
    for g in goals + client.get("/savings/goal/completed/", headers=headers).json()["data"]:
        assert not V2_GOAL_KEYS & set(g), sorted(V2_GOAL_KEYS & set(g))
    for row in client.get("/savings/history/", headers=headers).json()["data"]:
        assert "kind" not in row and "deletable" not in row


@pytest.mark.parametrize("generation", list(GENERATIONS))
def test_old_builds_keep_the_starting_balance_answer(client, shared_account, generation):
    """The goals_v2 build wrote a goal-level 'opening' deposit ("money I'd already
    saved"). The starting-balance check is scoped to General Savings, so it still
    answers from General Savings' own opening row — set, here."""
    res = client.post("/savings/starting-balance/", headers=GENERATIONS[generation],
                      json={"amount": 10.0, "day": 27, "month": MONTH})
    assert res.json()["already_set"] is True


def test_a_goal_level_opening_deposit_does_not_read_as_a_starting_balance(
        client, supabase_db, pinned_server_date):
    """The other direction: an account whose only 'opening' money is in a goal can
    still record its starting balance from an old build."""
    assert client.post("/savings/goal/", headers=V2, json={
        "title": "Bike", "target_amount": 600.0, "saved_amount": 100.0,
        "saved_source": "opening", "today": TODAY.isoformat()}).status_code == 200
    res = client.post("/savings/starting-balance/", headers=auth(USER_A),
                      json={"amount": 250.0, "day": 27, "month": MONTH})
    assert res.json() == {"message": "Starting balance recorded.", "already_set": False}


@pytest.mark.parametrize("generation", list(GENERATIONS))
def test_old_builds_total_balance_is_unchanged_by_the_move(client, supabase_db, pinned_server_date,
                                                           generation):
    """The one-time move is a transfer pair, so the old hero balance does not move."""
    seed(supabase_db)
    before = client.get("/savings/balance/", headers=GENERATIONS[generation]).json()
    client.get("/savings/goal/", headers=V2, params={"today": TODAY.isoformat()})
    assert client.get("/savings/balance/", headers=GENERATIONS[generation]).json() == before


@pytest.mark.parametrize("generation", list(GENERATIONS))
def test_old_builds_home_progress_ignores_ready_to_replant(client, shared_account, generation):
    goals = client.get("/home/progress/", headers=GENERATIONS[generation],
                       params={"today": TODAY.isoformat()}).json()["goals"]
    # Bike + Old car; neither General Savings nor Ready to Replant is a goal.
    assert goals["total_count"] == 2
    assert "kept_under_budget" not in goals
