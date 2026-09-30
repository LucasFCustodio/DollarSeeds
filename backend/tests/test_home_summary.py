"""Home summary — GET /home/summary/ and the rules behind it.

The debt rules (overdue, due soon, focus_extra, next payment) are pure functions in
debt_freedom.py; the budget and goal rules sit next to the budget helpers in
main.py. Both are tested with plain dicts and a fixed `today`, then the route is
driven against the in-memory fake.
"""

from __future__ import annotations

import datetime

import pytest

import debt_freedom as df
import main
from conftest import USER_A, USER_B, auth

TODAY = datetime.date(2026, 9, 28)


def card(id=1, balance=1000.0, *, minimum=50.0, due_day=14, created="2026-06-01T12:00:00+00:00",
         checked=None, status="active"):
    return {
        "id": id, "name": f"D{id}", "original_balance": 2000.0, "current_balance": balance,
        "min_payment": minimum, "apr": 0.0, "due_day": due_day, "status": status,
        "created_at": created, "interest_checked_through": checked, "species": 4,
        "species_locked": False, "paid_off_at": None,
    }


def txn(on, kind=df.KIND_MINIMUM, amount=50.0, balance_after=950.0, id=1, debt_id=1):
    return {"id": id, "debt_id": debt_id, "kind": kind, "amount": amount,
            "balance_after": balance_after, "occurred_on": on}


# ── overdue ──────────────────────────────────────────────────────────────────

def test_a_missed_minimum_on_the_last_due_date_is_overdue():
    # Due the 14th; today the 28th. Nothing logged between Aug 15 and Sep 14.
    assert df.is_overdue(card(checked="2026-09-14"), [], TODAY) is True


def test_a_minimum_logged_in_the_closed_cycle_is_not_overdue():
    txns = [txn("2026-09-10")]
    assert df.is_overdue(card(checked="2026-09-14"), txns, TODAY) is False


def test_the_due_date_itself_still_counts_for_its_cycle():
    txns = [txn("2026-09-14")]
    assert df.is_overdue(card(checked="2026-09-14"), txns, TODAY) is False


def test_an_extra_payment_alone_does_not_cover_the_minimum():
    txns = [txn("2026-09-10", kind=df.KIND_EXTRA, amount=40.0)]
    assert df.is_overdue(card(checked="2026-09-14"), txns, TODAY) is True


def test_paying_the_statement_in_full_is_never_overdue():
    # Statement at the cycle start was 1000; an extra of 1000 clears it.
    txns = [txn("2026-08-01", kind=df.KIND_INTEREST, amount=10.0, balance_after=1000.0, id=1),
            txn("2026-09-10", kind=df.KIND_EXTRA, amount=1000.0, balance_after=0.0, id=2)]
    assert df.is_overdue(card(balance=0.0, checked="2026-09-14"), txns, TODAY) is False


def test_overdue_clears_once_a_minimum_is_logged_in_the_current_cycle():
    txns = [txn("2026-09-20")]
    assert df.is_overdue(card(checked="2026-09-14"), txns, TODAY) is False


def test_a_debt_created_after_the_last_due_date_is_not_overdue():
    assert df.is_overdue(card(created="2026-09-20T12:00:00+00:00"), [], TODAY) is False


def test_no_due_day_or_paid_off_is_never_overdue():
    assert df.is_overdue(card(due_day=None), [], TODAY) is False
    assert df.is_overdue(card(status="paid_off", checked="2026-09-14"), [], TODAY) is False


def test_a_reversed_minimum_does_not_count():
    txns = [txn("2026-09-10", id=1),
            txn("2026-09-11", kind=df.KIND_MINIMUM_REVERSAL, amount=50.0, balance_after=1000.0, id=2)]
    assert df.is_overdue(card(checked="2026-09-14"), txns, TODAY) is True


# ── due soon ─────────────────────────────────────────────────────────────────

@pytest.mark.parametrize("due_day,expected", [
    (28, True),    # due today
    (30, True),    # in 2 days
    (5, True),     # Oct 5: exactly 7 days
    (6, False),    # Oct 6: 8 days
])
def test_due_soon_window_is_seven_days_inclusive(due_day, expected):
    # Created after every one of their last due dates, so none of these is overdue.
    d = card(due_day=due_day, created="2026-09-10T00:00:00+00:00")
    assert df.is_due_soon(d, [], TODAY) is expected


def test_due_soon_is_false_once_the_minimum_is_logged():
    d = card(due_day=30, created="2026-09-01T00:00:00+00:00")
    assert df.is_due_soon(d, [txn("2026-09-27")], TODAY) is False


def test_an_overdue_debt_is_not_also_due_soon():
    # Due day 30 → last due Aug 30, missed; next due Sep 30 is 2 days out.
    d = card(due_day=30, created="2026-06-01T00:00:00+00:00", checked="2026-08-30")
    assert df.is_overdue(d, [], TODAY) is True
    assert df.is_due_soon(d, [], TODAY) is False


# ── focus_extra and next payment ─────────────────────────────────────────────

def test_focus_extra_is_rollover_plus_monthly_extra_for_the_focus_only():
    focus = {"is_focus": True, "suggested_payment": 190.0, "min_payment": 150.0}
    other = {"is_focus": False, "suggested_payment": 100.0, "min_payment": 100.0}
    assert df.focus_extra(focus, 180.0) == 220.0
    assert df.focus_extra(focus, None) == 40.0
    assert df.focus_extra(other, 180.0) == 0.0


def test_next_payment_is_the_nearest_due_date_focus_first_on_a_tie():
    debts = [
        {"id": 1, "status": "paid_off", "next_due_date": None},
        {"id": 2, "status": "active", "next_due_date": "2026-10-14", "is_focus": False},
        {"id": 3, "status": "active", "next_due_date": "2026-10-14", "is_focus": True},
        {"id": 4, "status": "active", "next_due_date": "2026-10-20", "is_focus": False},
        {"id": 5, "status": "active", "next_due_date": None, "is_focus": False},
    ]
    assert df.next_payment(debts)["id"] == 3
    assert df.next_payment(debts[3:])["id"] == 4
    assert df.next_payment([debts[0], debts[4]]) is None


def test_home_debt_summary_counts_and_picks():
    rows = [
        {**card(1, 0.0), "status": "paid_off", "paid_off_at": "2026-04-01T00:00:00+00:00"},
        card(2, 150.0, minimum=100.0, due_day=30, created="2026-09-01T00:00:00+00:00"),
        card(3, 5000.0, minimum=200.0, due_day=14, checked="2026-09-14"),
    ]
    garden = df.decorate_garden(rows, [], TODAY, monthly_extra=50.0)
    s = df.home_debt_summary(garden, [], TODAY)
    assert (s["paid_count"], s["total_count"]) == (1, 3)
    assert (s["overdue_count"], s["due_soon_count"]) == (1, 1)
    assert s["due_soon"] == [{"id": 2, "name": s["due_soon"][0]["name"], "due_date": "2026-09-30", "min_payment": 100.0}]
    nxt = s["next_payment"]
    assert (nxt["id"], nxt["due_date"], nxt["is_focus"]) == (2, "2026-09-30", True)
    # Rollover of the paid-off debt's 50 minimum + 50 monthly extra.
    assert (nxt["min_payment"], nxt["focus_extra"]) == (100.0, 100.0)
    assert s["focus"]["id"] == 2 and s["focus"]["debt"]["is_focus"] is True
    assert s["almost_free"]["id"] == 2 and s["almost_free"]["est_payoff_month"] == "2026-10"
    assert s["plan_est_payoff_month"] == garden["plan_est_payoff_month"]


def test_home_debt_summary_is_none_without_debts():
    assert df.home_debt_summary(df.decorate_garden([], [], TODAY), [], TODAY) is None


# ── budget and goal rules ────────────────────────────────────────────────────

def test_over_budget_lists_each_split_past_its_budget():
    budgets = {"needs": 2000.0, "wants": 1200.0, "goals": 800.0}
    expenses = {"needs": 2000.0, "wants": 1240.0, "goals": 900.5}
    assert main.over_budget_splits(budgets, expenses) == [
        {"split": "wants", "amount_over": 40.0},
        {"split": "goals", "amount_over": 100.5},
    ]
    assert main.over_budget_splits(budgets, {"needs": 0, "wants": 0, "goals": 0}) == []


def test_goals_near_completion():
    goals = [
        {"id": 1, "title": "General", "is_general": True, "target_amount": None, "allocated_amount": 900},
        {"id": 2, "title": "Car", "target_amount": 1000, "allocated_amount": 800},
        {"id": 3, "title": "Trip", "target_amount": 1000, "allocated_amount": 950},
        {"id": 4, "title": "Laptop", "target_amount": 1000, "allocated_amount": 799},
        {"id": 5, "title": "Phone", "target_amount": 100, "allocated_amount": 90},
        {"id": 6, "title": "Done", "target_amount": 100, "allocated_amount": 100, "completed": True},
        {"id": 7, "title": "Loan", "goal_type": "debt", "target_amount": 100, "allocated_amount": 95},
        {"id": 8, "title": "Zero", "target_amount": 0, "allocated_amount": 10},
    ]
    assert main.goals_near_completion(goals) == [
        {"id": 3, "title": "Trip", "pct": 0.95},
        {"id": 5, "title": "Phone", "pct": 0.9},
    ]


def test_days_since_log():
    assert main.days_since_log(None, TODAY) is None
    assert main.days_since_log("2026-09-22T15:02:11+00:00", TODAY) == 6
    assert main.days_since_log("2026-09-28T01:00:00Z", TODAY) == 0


# ── the route ────────────────────────────────────────────────────────────────

@pytest.fixture
def on_today(monkeypatch):
    monkeypatch.setattr(main, "_df_server_today", lambda: TODAY)


KEYS = {"last_logged_at", "days_since_last_log", "over_budget", "debts", "goals_near_completion"}
DEBT_KEYS = {"paid_count", "total_count", "overdue_count", "due_soon_count", "due_soon", "next_payment",
             "focus", "plan_est_payoff_month", "almost_free"}


def test_summary_shape_without_debts(client, supabase_db, on_today):
    supabase_db.seed("income", {"user_id": USER_A, "amount": 1000.0, "day": 1, "month": "September",
                                "created_at": "2026-09-20T10:00:00+00:00"})
    supabase_db.seed("expenses", {"user_id": USER_A, "title": "Dining", "amount": 400.0, "category": "Wants",
                                  "day": 2, "month": "September", "created_at": "2026-09-22T15:02:11+00:00"})
    supabase_db.seed("savings_goals", {"user_id": USER_A, "title": "Trip", "target_amount": 100.0,
                                       "completed": False, "goal_type": "saving"})
    gid = supabase_db.rows("savings_goals")[-1]["id"]
    supabase_db.seed("savings_transactions", {"user_id": USER_A, "goal_id": gid, "title": "Trip", "amount": 85.0,
                                              "type": "deposit", "source": "transfer", "day": 3, "month": "September"})

    res = client.get("/home/summary/", headers=auth(USER_A),
                     params={"month": "September", "today": TODAY.isoformat()})
    assert res.status_code == 200, res.text
    body = res.json()
    assert set(body) == KEYS
    assert body["last_logged_at"] == "2026-09-22T15:02:11+00:00"
    assert body["days_since_last_log"] == 6
    # Same numbers the dashboard serves: wants budget 300, spent 400.
    dash = client.get("/dashboard/September", headers=auth(USER_A)).json()
    assert dash["expenses"]["wants"] - dash["budgets"]["wants"] == 100.0
    assert body["over_budget"] == [{"split": "wants", "amount_over": 100.0}]
    assert body["debts"] is None
    assert body["goals_near_completion"] == [{"id": gid, "title": "Trip", "pct": 0.85}]


def test_summary_shape_with_debts(client, supabase_db, on_today):
    supabase_db.seed("debts", card(balance=1000.0, checked="2026-09-14") | {"user_id": USER_A, "id": 900})
    res = client.get("/home/summary/", headers=auth(USER_A), params={"month": "September"})
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["last_logged_at"] is None and body["days_since_last_log"] is None
    debts = body["debts"]
    assert set(debts) == DEBT_KEYS
    assert (debts["paid_count"], debts["total_count"], debts["overdue_count"]) == (0, 1, 1)
    assert set(debts["next_payment"]) == {"id", "name", "due_date", "min_payment", "focus_extra", "is_focus"}
    assert debts["next_payment"]["due_date"] == "2026-10-14"
    assert {"id", "name", "species", "growth_step", "pct_paid"} <= set(debts["focus"])


def test_summary_is_scoped_to_the_caller(client, supabase_db, on_today):
    supabase_db.seed("debts", card() | {"user_id": USER_B, "id": 901})
    supabase_db.seed("expenses", {"user_id": USER_B, "title": "x", "amount": 5.0, "category": "Needs",
                                  "day": 1, "month": "September"})
    body = client.get("/home/summary/", headers=auth(USER_A), params={"month": "September"}).json()
    assert body["debts"] is None and body["last_logged_at"] is None


def test_home_debt_summary_lists_due_soon_nearest_first():
    rows = [
        card(1, 900.0, minimum=90.0, due_day=5, created="2026-09-10T00:00:00+00:00"),
        card(2, 800.0, minimum=80.0, due_day=30, created="2026-09-01T00:00:00+00:00"),
        card(3, 700.0, minimum=70.0, due_day=20, created="2026-09-01T00:00:00+00:00"),
    ]
    s = df.home_debt_summary(df.decorate_garden(rows, [], TODAY), [], TODAY)
    # Sep 30 and Oct 5 are within 7 days of Sep 28; Oct 20 is not.
    assert [(d["id"], d["due_date"]) for d in s["due_soon"]] == [(2, "2026-09-30"), (1, "2026-10-05")]
    assert s["due_soon_count"] == 2
