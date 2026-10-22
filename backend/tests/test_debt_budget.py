"""Debt Freedom payments in the Goals budget, and the rules that protect that number.

Section numbers refer to the debts/Goals rework: (1) payments count toward the third
split, (2) closed months refuse payment changes, (5) deleting an extra payment, (6) the
delete-based minimum undo, (7) deleting a debt, (8) the payments list for "View all".

The server date is the real one here (no `clock` fixture), so every month and year is
derived from it rather than hardcoded.
"""

from __future__ import annotations

import datetime

import pytest

import debt_freedom as df
import main
from conftest import USER_A, USER_B, auth, stamp_year

TODAY = datetime.date.today()
MONTH = main.MONTHS[TODAY.month - 1]


def this_month(day: int = 1) -> str:
    return datetime.date(TODAY.year, TODAY.month, day).isoformat()


def seed_debt(db, user=USER_A, **over) -> dict:
    return db.seed("debts", {
        "user_id": user, "name": "Card", "original_balance": 1000.0, "current_balance": 1000.0,
        "min_payment": 50.0, "apr": 0.0, "due_day": 28, "cycle_start_balance": 1000.0,
        # Created long ago, with the last due date already processed, so reading the
        # garden closes no cycle and writes no interest row under the test.
        "created_at": "2025-01-01T00:00:00+00:00",
        "interest_checked_through": _last_due(28).isoformat(),
        "species_locked": True, **over,
    })


def _last_due(due_day: int) -> datetime.date:
    """The most recent due date strictly before today."""
    due = df.due_date_in(TODAY.year, TODAY.month, due_day)
    if due >= TODAY:
        prev = df.add_months(TODAY, -1)
        due = df.due_date_in(prev.year, prev.month, due_day)
    return due


def seed_tx(db, debt, kind, amount, on, *, balance_after=None, user=USER_A) -> dict:
    return db.seed("debt_transactions", {
        "user_id": user, "debt_id": debt["id"], "kind": kind, "amount": amount,
        "balance_after": balance_after if balance_after is not None else 0.0, "occurred_on": on,
    })


def seed_income(db, amount=1000.0, month=MONTH):
    db.seed("income", {"user_id": USER_A, "amount": amount, "day": 1, "month": month})


def dashboard(client, month=MONTH):
    res = client.get(f"/dashboard/{month}", headers=auth(USER_A))
    assert res.status_code == 200, res.text
    return res.json()


# ══ 1. Debt payments count against the Goals budget ═══════════════════════════

def test_deposits_only_are_unchanged(client, supabase_db):
    seed_income(supabase_db)
    supabase_db.seed("savings_transactions", {"user_id": USER_A, "title": "Trip", "amount": 80.0,
                                              "type": "deposit", "day": 2, "month": MONTH})
    assert dashboard(client)["expenses"]["goals"] == 80.0


def test_debt_payments_alone_fill_the_goals_split(client, supabase_db):
    seed_income(supabase_db)
    d = seed_debt(supabase_db)
    seed_tx(supabase_db, d, df.KIND_MINIMUM, 50.0, this_month(1))
    seed_tx(supabase_db, d, df.KIND_EXTRA, 120.0, this_month(1))
    body = dashboard(client)
    assert body["expenses"]["goals"] == 170.0
    # The score reads the same number: 170 of a 200 budget.
    assert body["compliance_score"]["goals"] == main.calculate_category_score(170.0, 200.0)


def test_deposits_and_debt_payments_add_up(client, supabase_db):
    seed_income(supabase_db)
    supabase_db.seed("savings_transactions", {"user_id": USER_A, "title": "Trip", "amount": 30.0,
                                              "type": "deposit", "day": 2, "month": MONTH})
    d = seed_debt(supabase_db)
    seed_tx(supabase_db, d, df.KIND_MINIMUM, 50.0, this_month(1))
    assert dashboard(client)["expenses"]["goals"] == 80.0


def test_the_same_month_name_last_year_is_not_counted(client, supabase_db):
    seed_income(supabase_db)
    d = seed_debt(supabase_db)
    last_year = datetime.date(TODAY.year - 1, TODAY.month, 1).isoformat()
    seed_tx(supabase_db, d, df.KIND_EXTRA, 500.0, last_year)
    seed_tx(supabase_db, d, df.KIND_MINIMUM, 50.0, this_month(1))
    assert dashboard(client)["expenses"]["goals"] == 50.0


def test_a_legacy_log_and_undo_pair_nets_to_zero(client, supabase_db):
    seed_income(supabase_db)
    d = seed_debt(supabase_db)
    seed_tx(supabase_db, d, df.KIND_MINIMUM, 50.0, this_month(1))
    seed_tx(supabase_db, d, df.KIND_MINIMUM_REVERSAL, 50.0, this_month(1))
    body = dashboard(client)
    assert body["expenses"]["goals"] == 0
    # No payments left: the total keeps the int shape it had before this rule.
    assert isinstance(body["expenses"]["goals"], int)


def test_interest_fees_and_edits_never_count(client, supabase_db):
    seed_income(supabase_db)
    d = seed_debt(supabase_db)
    for kind, amount in [(df.KIND_INTEREST, 12.5), (df.KIND_LATE_FEE, 30.0),
                         (df.KIND_BALANCE_EDIT, -100.0), (df.KIND_STATEMENT_ADJUSTMENT, 40.0)]:
        seed_tx(supabase_db, d, kind, amount, this_month(1))
    assert dashboard(client)["expenses"]["goals"] == 0


def test_another_users_payments_never_count(client, supabase_db):
    seed_income(supabase_db)
    d = seed_debt(supabase_db, user=USER_B)
    seed_tx(supabase_db, d, df.KIND_EXTRA, 300.0, this_month(1), user=USER_B)
    assert dashboard(client)["expenses"]["goals"] == 0


def test_a_client_today_decides_the_year(client, supabase_db, monkeypatch):
    """On the phone's Dec 31 the server (UTC) can already be in January. "January"
    must still mean the January just gone for that user, not the new one."""
    monkeypatch.setattr(main, "_df_server_today", lambda: datetime.date(2027, 1, 1))
    supabase_db.seed("income", {"user_id": USER_A, "amount": 1000.0, "day": 1, "month": "January"})
    d = seed_debt(supabase_db)
    seed_tx(supabase_db, d, df.KIND_EXTRA, 70.0, "2026-01-15")
    seed_tx(supabase_db, d, df.KIND_EXTRA, 20.0, "2027-01-01")
    phone = client.get("/dashboard/January", headers=auth(USER_A), params={"today": "2026-12-31"}).json()
    server = client.get("/dashboard/January", headers=auth(USER_A)).json()
    assert phone["expenses"]["goals"] == 70.0
    assert server["expenses"]["goals"] == 20.0


def test_every_consumer_agrees(client, supabase_db):
    """Home summary, rollover preview and trends read the same Goals spend."""
    seed_income(supabase_db)
    d = seed_debt(supabase_db)
    seed_tx(supabase_db, d, df.KIND_EXTRA, 250.0, this_month(1))
    assert dashboard(client)["expenses"]["goals"] == 250.0

    summary = client.get("/home/summary/", headers=auth(USER_A), params={"month": MONTH}).json()
    assert summary["over_budget"] == [{"split": "goals", "amount_over": 50.0}]

    preview = client.get("/rollover/preview/", headers=auth(USER_A), params={"month": MONTH}).json()
    assert preview["breakdown"]["goals"]["spent"] == 250.0
    assert preview["target_rollover"] == 750.0

    trends = client.get("/dashboard/trends/", headers=auth(USER_A)).json()["data"]
    assert next(m for m in trends if m["month"] == MONTH)["goals"] == 250.0


def test_closing_a_month_rolls_over_what_is_left_after_debt_payments(client, supabase_db):
    seed_income(supabase_db)
    d = seed_debt(supabase_db)
    seed_tx(supabase_db, d, df.KIND_MINIMUM, 100.0, this_month(1))
    res = client.post("/rollover/close/", headers=auth(USER_A), json={"month": MONTH})
    assert res.status_code == 200, res.text
    assert res.json()["rolled_over"] == 900.0


def test_paying_debt_writes_no_savings_row(client, supabase_db):
    """The rule reads debt_transactions; it must never mirror a payment into savings,
    which would raise General Savings with money that left the user."""
    d = seed_debt(supabase_db, interest_checked_through=None, created_at=f"{this_month(1)}T00:00:00+00:00")
    res = client.post(f"/debt-freedom/{d['id']}/payments", headers=auth(USER_A),
                      json={"minimum": False, "extra_amount": 40, "today": TODAY.isoformat()})
    assert res.status_code == 200, res.text
    assert supabase_db.rows("savings_transactions") == []
    assert client.get("/savings/balance/", headers=auth(USER_A)).json()["balance"] == 0


def test_budget_paydown_rule():
    start, end = datetime.date(2026, 10, 1), datetime.date(2026, 10, 31)
    txns = [
        {"id": 1, "debt_id": 1, "kind": df.KIND_MINIMUM, "amount": 50, "occurred_on": "2026-10-01"},
        {"id": 2, "debt_id": 1, "kind": df.KIND_EXTRA, "amount": "25.5", "occurred_on": "2026-10-31"},
        {"id": 3, "debt_id": 1, "kind": df.KIND_MINIMUM_REVERSAL, "amount": 50, "occurred_on": "2026-10-02"},
        {"id": 4, "debt_id": 1, "kind": df.KIND_EXTRA, "amount": 99, "occurred_on": "2026-09-30"},
        {"id": 5, "debt_id": 1, "kind": df.KIND_EXTRA, "amount": 99, "occurred_on": "2026-11-01"},
        {"id": 6, "debt_id": 1, "kind": df.KIND_INTEREST, "amount": 9, "occurred_on": "2026-10-05"},
    ]
    assert df.budget_paydown(txns, start, end) == 25.5
