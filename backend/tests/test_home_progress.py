"""Home progress — GET /home/progress/ and the rules behind it.

The debt rules (pot stage, money paid toward debt, payoff milestones) live in
debt_freedom.py; the goal rules ("achieved by saving") in home_progress.py. Both are
tested with plain dicts and a fixed `today`, then the route is driven against the
in-memory fake.
"""

from __future__ import annotations

import datetime

import pytest

import debt_freedom as df
import home_progress as hp
import main
from conftest import USER_A, USER_B, auth

TODAY = datetime.date(2026, 9, 28)


# ── pot stage ────────────────────────────────────────────────────────────────

@pytest.mark.parametrize("pct,expected", [
    (0.0, "empty"),
    (0.05, "empty"),
    (0.0999, "empty"),
    (0.10, "started"),
    (0.49, "started"),
    (0.50, "finishing"),
    (0.99, "finishing"),
    # 100% paid but not marked paid off yet: still finishing.
    (1.0, "finishing"),
])
def test_pot_stage_boundaries(pct, expected):
    assert df.pot_stage({"status": "active", "pct_paid": pct}) == expected


def test_a_paid_off_debt_is_completed_whatever_its_pct():
    assert df.pot_stage({"status": "paid_off", "pct_paid": 0.2}) == "completed"


# ── money paid toward debt ───────────────────────────────────────────────────

def dtx(on, kind, amount, id=1, debt_id=1):
    return {"id": id, "debt_id": debt_id, "kind": kind, "amount": amount, "occurred_on": on}


def test_debt_total_counts_payments_and_subtracts_an_undone_minimum():
    txns = [
        dtx("2026-07-14", df.KIND_MINIMUM, 50.0, id=1),
        dtx("2026-07-20", df.KIND_EXTRA, 200.0, id=2),
        dtx("2026-08-14", df.KIND_MINIMUM, 50.0, id=3),
        # The toggle's undo of that August minimum.
        dtx("2026-08-15", df.KIND_MINIMUM_REVERSAL, 50.0, id=4),
        # What the debt cost, not what was paid: ignored.
        dtx("2026-08-14", df.KIND_INTEREST, 12.5, id=5),
        dtx("2026-08-15", df.KIND_LATE_FEE, 30.0, id=6),
        dtx("2026-08-16", df.KIND_BALANCE_EDIT, -100.0, id=7),
        dtx("2026-08-17", df.KIND_STATEMENT_ADJUSTMENT, 40.0, id=8),
    ]
    events = df.debt_payment_events(txns)
    assert sum(a for _, a in events) == 250.0
    series = df.monthly_cumulative(events, TODAY)
    assert series == [
        {"month": "2026-07", "cumulative": 250.0},
        {"month": "2026-08", "cumulative": 250.0},
        {"month": "2026-09", "cumulative": 250.0},
    ]


def test_series_carries_values_through_empty_months_up_to_today():
    events = [(datetime.date(2026, 3, 5), 100.0), (datetime.date(2026, 6, 1), 40.0)]
    series = df.monthly_cumulative(events, TODAY)
    assert [p["month"] for p in series] == [
        "2026-03", "2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09"]
    assert [p["cumulative"] for p in series] == [100.0, 100.0, 100.0, 140.0, 140.0, 140.0, 140.0]


def test_series_crosses_a_year_and_folds_future_dates_into_this_month():
    events = [(datetime.date(2025, 11, 30), 10.0), (datetime.date(2026, 10, 2), 5.0)]
    series = df.monthly_cumulative(events, datetime.date(2026, 1, 15))
    assert series == [
        {"month": "2025-11", "cumulative": 10.0},
        {"month": "2025-12", "cumulative": 10.0},
        {"month": "2026-01", "cumulative": 15.0},
    ]


def test_series_is_empty_without_events():
    assert df.monthly_cumulative([], TODAY) == []


def garden_debt(id, *, status="active", pct=0.0, focus=False, paid_off_at=None, name=None):
    return {"id": id, "name": name or f"D{id}", "status": status, "pct_paid": pct,
            "is_focus": focus, "paid_off_at": paid_off_at}


def test_home_progress_debts_block():
    garden = {"debts": [
        garden_debt(1, status="paid_off", pct=1.0, paid_off_at="2026-05-03T10:00:00+00:00", name="Dentist"),
        garden_debt(2, pct=0.55, focus=True, name="Bank loan"),
        garden_debt(3, pct=0.02),
    ]}
    txns = [dtx("2026-01-10", df.KIND_EXTRA, 1000.0, id=1, debt_id=1),
            dtx("2025-12-10", df.KIND_MINIMUM, 100.0, id=2, debt_id=2)]
    block = df.home_progress_debts(garden, txns, TODAY)
    assert (block["paid_count"], block["total_count"]) == (1, 3)
    assert [(p["id"], p["stage"], p["is_focus"]) for p in block["pots"]] == [
        (1, "completed", False), (2, "finishing", True), (3, "empty", False)]
    assert block["focus_name"] == "Bank loan"
    assert block["total_paid"] == 1100.0
    assert block["paid_this_year"] == 1000.0
    assert block["series"][0] == {"month": "2025-12", "cumulative": 100.0}
    assert block["series"][-1] == {"month": "2026-09", "cumulative": 1100.0}
    assert block["milestones"] == [{"month": "2026-05", "name": "Dentist"}]


def test_focus_name_is_null_once_every_debt_is_paid():
    garden = {"debts": [garden_debt(1, status="paid_off", pct=1.0, paid_off_at="2026-05-03")]}
    assert df.home_progress_debts(garden, [], TODAY)["focus_name"] is None


def test_home_progress_debts_is_none_without_debts():
    assert df.home_progress_debts({"debts": []}, [], TODAY) is None


# ── goals: "achieved by saving" ──────────────────────────────────────────────

def goal(id, *, title=None, target=100.0, completed=False, general=False, recon=False,
         completed_amount=None, completed_at=None, created="2026-01-01T00:00:00+00:00", allocated=None):
    g = {"id": id, "title": title or f"G{id}", "target_amount": target, "completed": completed,
         "is_general": general, "is_reconciliation": recon, "completed_amount": completed_amount,
         "completed_at": completed_at, "created_at": created, "goal_type": "saving"}
    if allocated is not None:
        g["allocated_amount"] = allocated
    return g


def stx(id, goal_id, amount, type="deposit", at="2026-02-01T12:00:00+00:00"):
    return {"id": id, "goal_id": goal_id, "amount": amount, "type": type, "created_at": at}


def total(goals, txns, today=TODAY):
    return round(sum(a for _, a in hp.savings_events(goals, txns, today)), 2)


def test_completing_a_goal_leaves_the_total_unchanged():
    gs = goal(1, general=True, target=None)
    txns = [stx(1, 2, 100.0, at="2026-01-10T00:00:00+00:00"),
            stx(2, 2, 50.0, at="2026-02-10T00:00:00+00:00"),
            stx(3, 1, 30.0, at="2026-02-11T00:00:00+00:00")]
    before = total([gs, goal(2)], txns)

    # finish_savings_goal: mark complete with a snapshot, then withdraw everything.
    done = goal(2, completed=True, completed_amount=150.0, completed_at="2026-03-05T09:00:00+00:00")
    after_txns = txns + [stx(4, 2, 150.0, "withdrawal", at="2026-03-05T09:00:01+00:00")]
    after = total([gs, done], after_txns)

    assert before == after == 180.0
    series = hp.home_progress_goals([gs, done], after_txns, TODAY)["series"]
    march = next(p for p in series if p["month"] == "2026-03")
    assert march["cumulative"] == 180.0


def test_a_real_withdrawal_lowers_the_total():
    gs = goal(1, general=True, target=None)
    txns = [stx(1, 1, 200.0, at="2026-01-10T00:00:00+00:00"),
            stx(2, 2, 80.0, at="2026-01-11T00:00:00+00:00"),
            stx(3, 1, 25.0, "withdrawal", at="2026-02-01T00:00:00+00:00"),
            stx(4, 2, 30.0, "withdrawal", at="2026-02-02T00:00:00+00:00")]
    assert total([gs, goal(2)], txns) == 225.0


def test_a_transfer_between_goals_leaves_the_total_unchanged():
    gs = goal(1, general=True, target=None)
    txns = [stx(1, 1, 200.0, at="2026-01-10T00:00:00+00:00")]
    transfer = [stx(2, 1, 75.0, "withdrawal", at="2026-02-01T00:00:00+00:00"),
                stx(3, 2, 75.0, "deposit", at="2026-02-01T00:00:00+00:00")]
    assert total([gs, goal(2)], txns) == total([gs, goal(2)], txns + transfer) == 200.0


def test_legacy_completed_goal_without_snapshot_uses_what_it_held_and_its_withdrawal_date():
    # Completed through the legacy PATCH …/complete: the old app wrote its own
    # withdrawal first; completed_at and completed_amount are null.
    legacy = goal(2, completed=True)
    txns = [stx(1, 2, 60.0, at="2026-01-10T00:00:00+00:00"),
            stx(2, 2, 40.0, at="2026-02-10T00:00:00+00:00"),
            stx(3, 2, 100.0, "withdrawal", at="2026-04-20T00:00:00+00:00")]
    done = hp.goal_completion(legacy, txns, TODAY)
    assert done["amount"] == 100.0
    assert done["date"] == datetime.date(2026, 4, 20)
    assert total([legacy], txns) == 100.0
    assert hp.goal_milestones([legacy], txns, TODAY) == [{"month": "2026-04", "name": "G2"}]


def test_legacy_completed_goal_without_any_withdrawal_dates_from_the_goal():
    legacy = goal(2, completed=True, created="2025-11-02T00:00:00+00:00")
    txns = [stx(1, 2, 60.0, at="2026-01-10T00:00:00+00:00")]
    done = hp.goal_completion(legacy, txns, TODAY)
    assert (done["amount"], done["date"]) == (60.0, datetime.date(2025, 11, 2))
    assert total([legacy], txns) == 60.0


def test_a_snapshot_that_disagrees_with_the_ledger_wins_from_the_completion_month():
    # finish_savings_goal's self-heal: an earlier half-failed finish already withdrew
    # the money, and the snapshot is what the goal held.
    healed = goal(2, completed=True, completed_amount=90.0, completed_at="2026-05-01T00:00:00+00:00")
    txns = [stx(1, 2, 90.0, at="2026-01-10T00:00:00+00:00"),
            stx(2, 2, 90.0, "withdrawal", at="2026-04-01T00:00:00+00:00")]
    assert total([healed], txns) == 90.0


def test_reconciliation_rows_never_count_and_legacy_unassigned_rows_do():
    recon = goal(3, recon=True, target=None)
    txns = [stx(1, 3, 120.0, "withdrawal", at="2026-02-01T00:00:00+00:00"),
            stx(2, 3, 40.0, "deposit", at="2026-03-01T00:00:00+00:00"),
            stx(3, None, 25.0, at="2026-01-01T00:00:00+00:00")]
    assert total([recon], txns) == 25.0


def test_counts_and_nearest_match_the_goals_tab():
    goals = [
        goal(1, general=True, target=None, allocated=500.0),
        goal(2, recon=True, target=50.0, allocated=0.0),
        goal(3, title="Emergency fund", target=1000.0, allocated=850.0),
        goal(4, title="Trip", target=400.0, allocated=100.0),
        goal(5, title="Laptop", completed=True, completed_amount=900.0,
             completed_at="2026-07-02T00:00:00+00:00"),
    ]
    block = hp.home_progress_goals(goals, [], TODAY)
    assert (block["completed_count"], block["total_count"]) == (1, 3)
    assert block["nearest"] == {"id": 3, "title": "Emergency fund", "pct": 0.85}
    assert block["milestones"] == [{"month": "2026-07", "name": "Laptop"}]


def test_nearest_is_null_when_every_goal_is_completed():
    goals = [goal(5, completed=True, completed_amount=10.0, completed_at="2026-07-02T00:00:00+00:00")]
    assert hp.home_progress_goals(goals, [], TODAY)["nearest"] is None


def test_no_listed_goals_means_no_goals_block():
    gs = goal(1, general=True, target=None, allocated=50.0)
    assert hp.home_progress_goals([gs], [stx(1, 1, 50.0)], TODAY) is None


def test_saved_this_year_and_series():
    gs = goal(1, general=True, target=None)
    txns = [stx(1, 1, 100.0, at="2025-12-20T00:00:00+00:00"),
            stx(2, 2, 40.0, at="2026-02-03T00:00:00+00:00")]
    block = hp.home_progress_goals([gs, goal(2, allocated=40.0)], txns, TODAY)
    assert block["total_saved"] == 140.0
    assert block["saved_this_year"] == 40.0
    assert block["series"][0] == {"month": "2025-12", "cumulative": 100.0}
    assert block["series"][1] == {"month": "2026-01", "cumulative": 100.0}
    assert block["series"][-1] == {"month": "2026-09", "cumulative": 140.0}


# ── the route ────────────────────────────────────────────────────────────────

@pytest.fixture
def on_today(monkeypatch):
    monkeypatch.setattr(main, "_df_server_today", lambda: TODAY)


DEBT_KEYS = {"paid_count", "total_count", "pots", "focus_name", "total_paid", "paid_this_year",
             "series", "milestones"}
GOAL_KEYS = {"completed_count", "total_count", "nearest", "total_saved", "saved_this_year",
             "series", "milestones"}


def debt_row(id, balance=1000.0, user=USER_A):
    return {"id": id, "user_id": user, "name": f"D{id}", "original_balance": 2000.0,
            "current_balance": balance, "min_payment": 50.0, "apr": 0.0, "due_day": 14,
            "status": "active", "created_at": "2026-06-01T12:00:00+00:00",
            "interest_checked_through": "2026-09-14", "species": 4, "species_locked": False,
            "paid_off_at": None}


def get(client, user=USER_A):
    res = client.get("/home/progress/", headers=auth(user), params={"today": TODAY.isoformat()})
    assert res.status_code == 200, res.text
    return res.json()


def test_route_with_neither_debts_nor_goals(client, supabase_db, on_today):
    assert get(client) == {"debts": None, "goals": None}


def test_route_general_savings_alone_is_no_goals(client, supabase_db, on_today):
    supabase_db.seed("savings_goals", {"user_id": USER_A, "title": "General Savings", "is_general": True,
                                       "completed": False})
    gid = supabase_db.rows("savings_goals")[-1]["id"]
    supabase_db.seed("savings_transactions", {"user_id": USER_A, "goal_id": gid, "title": "x", "amount": 10.0,
                                              "type": "deposit", "source": "income", "day": 1,
                                              "month": "September", "created_at": "2026-09-01T00:00:00+00:00"})
    assert get(client)["goals"] is None


def test_route_with_debts_only(client, supabase_db, on_today):
    supabase_db.seed("debts", debt_row(900))
    supabase_db.seed("debt_transactions", {"id": 1, "user_id": USER_A, "debt_id": 900, "kind": "payment_minimum",
                                           "amount": 50.0, "balance_after": 950.0, "occurred_on": "2026-09-10"})
    body = get(client)
    assert body["goals"] is None
    debts = body["debts"]
    assert set(debts) == DEBT_KEYS
    assert set(debts["pots"][0]) == {"id", "name", "pct_paid", "stage", "is_focus"}
    assert debts["total_paid"] == 50.0
    assert debts["series"] == [{"month": "2026-09", "cumulative": 50.0}]


def test_route_with_goals_only(client, supabase_db, on_today):
    supabase_db.seed("savings_goals", {"user_id": USER_A, "title": "Trip", "target_amount": 100.0,
                                       "completed": False, "goal_type": "saving",
                                       "created_at": "2026-08-01T00:00:00+00:00"})
    gid = supabase_db.rows("savings_goals")[-1]["id"]
    supabase_db.seed("savings_transactions", {"user_id": USER_A, "goal_id": gid, "title": "Trip", "amount": 85.0,
                                              "type": "deposit", "source": "income", "day": 3,
                                              "month": "August", "created_at": "2026-08-03T00:00:00+00:00"})
    body = get(client)
    assert body["debts"] is None
    goals = body["goals"]
    assert set(goals) == GOAL_KEYS
    assert (goals["completed_count"], goals["total_count"]) == (0, 1)
    assert goals["nearest"] == {"id": gid, "title": "Trip", "pct": 0.85}
    assert goals["total_saved"] == 85.0
    assert goals["series"] == [{"month": "2026-08", "cumulative": 85.0},
                               {"month": "2026-09", "cumulative": 85.0}]


def test_route_is_scoped_to_the_caller(client, supabase_db, on_today):
    supabase_db.seed("debts", debt_row(901, user=USER_B))
    supabase_db.seed("savings_goals", {"user_id": USER_B, "title": "Trip", "target_amount": 100.0,
                                       "completed": False, "goal_type": "saving"})
    assert get(client) == {"debts": None, "goals": None}
