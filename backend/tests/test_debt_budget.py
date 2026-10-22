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


# ══ helpers for the route tests ═══════════════════════════════════════════════

def close_month(db, month=MONTH):
    db.seed("month_status", {"user_id": USER_A, "month": month,
                             "closed_at": "2026-01-01T00:00:00+00:00", "year": stamp_year(month)})


def pay(client, debt, *, minimum=False, extra=None):
    body = {"minimum": minimum, "today": TODAY.isoformat(), "occurred_on": TODAY.isoformat()}
    if extra:
        body["extra_amount"] = extra
    return client.post(f"/debt-freedom/{debt['id']}/payments", headers=auth(USER_A), json=body)


def undo(client, debt):
    return client.post(f"/debt-freedom/{debt['id']}/payments/undo-minimum", headers=auth(USER_A),
                       json={"today": TODAY.isoformat()})


def delete_payment(client, debt, tx_id):
    return client.delete(f"/debt-freedom/{debt['id']}/payments/{tx_id}", headers=auth(USER_A),
                         params={"today": TODAY.isoformat()})


def detail(client, debt):
    res = client.get(f"/debt-freedom/{debt['id']}", headers=auth(USER_A), params={"today": TODAY.isoformat()})
    assert res.status_code == 200, res.text
    return res.json()


def kinds(db):
    return [t["kind"] for t in db.rows("debt_transactions")]


CLOSED = f"{MONTH} is closed. Reopen it before making changes."


# ══ 2. Closed months apply to debt payments ═══════════════════════════════════

def test_logging_a_minimum_or_an_extra_in_a_closed_month_is_refused(client, supabase_db):
    d = seed_debt(supabase_db)
    close_month(supabase_db)
    for kwargs in ({"minimum": True}, {"extra": 25}):
        res = pay(client, d, **kwargs)
        assert res.status_code == 409 and res.json()["detail"] == CLOSED
    assert supabase_db.rows("debt_transactions") == []
    assert supabase_db.rows("debts")[0]["current_balance"] == 1000.0


def test_undoing_a_minimum_in_a_closed_month_is_refused(client, supabase_db):
    d = seed_debt(supabase_db)
    assert pay(client, d, minimum=True).status_code == 200
    close_month(supabase_db)
    res = undo(client, d)
    assert res.status_code == 409 and res.json()["detail"] == CLOSED
    assert kinds(supabase_db) == ["payment_minimum"]


def test_deleting_an_extra_in_a_closed_month_is_refused(client, supabase_db):
    d = seed_debt(supabase_db)
    tx = pay(client, d, extra=40).json()["transactions"][0]
    close_month(supabase_db)
    res = delete_payment(client, d, tx["id"])
    assert res.status_code == 409 and res.json()["detail"] == CLOSED
    assert kinds(supabase_db) == ["payment_extra"]


def test_last_years_closed_month_does_not_lock_this_one(client, supabase_db):
    d = seed_debt(supabase_db)
    supabase_db.seed("month_status", {"user_id": USER_A, "month": MONTH,
                                      "closed_at": "2020-01-01T00:00:00+00:00",
                                      "year": stamp_year(MONTH) - 1})
    assert pay(client, d, minimum=True).status_code == 200


# ══ 5. Delete an extra payment ════════════════════════════════════════════════

def test_deleting_an_extra_puts_everything_back(client, supabase_db):
    seed_income(supabase_db)
    d = seed_debt(supabase_db)
    extra = pay(client, d, extra=100).json()["transactions"][0]
    minimum = pay(client, d, minimum=True).json()["transactions"][0]
    assert dashboard(client)["expenses"]["goals"] == 150.0
    assert minimum["balance_after"] == 850.0

    res = delete_payment(client, d, extra["id"])
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["debt"]["current_balance"] == 950.0
    assert set(body) >= {"debt", "focus_id", "plan_est_payoff_month", "previous_step", "transactions"}
    # The later minimum's balance_after moves up by the deleted amount.
    assert [(t["kind"], t["balance_after"]) for t in supabase_db.rows("debt_transactions")] == [
        ("payment_minimum", 950.0)]
    assert [t["kind"] for t in detail(client, d)["transactions"]] == ["payment_minimum"]
    assert dashboard(client)["expenses"]["goals"] == 50.0


def test_the_whole_extra_comes_back_to_the_goals_split(client, supabase_db):
    seed_income(supabase_db)
    d = seed_debt(supabase_db)
    extra = pay(client, d, extra=60).json()["transactions"][0]
    assert dashboard(client)["expenses"]["goals"] == 60.0
    assert delete_payment(client, d, extra["id"]).status_code == 200
    assert dashboard(client)["expenses"]["goals"] == 0
    assert supabase_db.rows("debts")[0]["current_balance"] == 1000.0
    assert detail(client, d)["transactions"] == []


def test_only_this_cycles_extras_are_deletable(client, supabase_db):
    d = seed_debt(supabase_db)
    old = seed_tx(supabase_db, d, df.KIND_EXTRA, 30.0, _last_due(28).isoformat(), balance_after=970.0)
    new = pay(client, d, extra=20).json()["transactions"][0]
    minimum = pay(client, d, minimum=True).json()["transactions"][0]

    flags = {t["id"]: t["deletable"] for t in detail(client, d)["transactions"]}
    assert flags == {old["id"]: False, new["id"]: True, minimum["id"]: False}

    for tx_id in (old["id"], minimum["id"]):
        assert delete_payment(client, d, tx_id).status_code == 409
    assert len(supabase_db.rows("debt_transactions")) == 3


def test_interest_and_fees_cannot_be_deleted(client, supabase_db):
    d = seed_debt(supabase_db)
    fee = seed_tx(supabase_db, d, df.KIND_LATE_FEE, 30.0, TODAY.isoformat())
    assert delete_payment(client, d, fee["id"]).status_code == 409
    assert detail(client, d)["transactions"][0]["deletable"] is False


def test_a_paid_off_debts_extras_are_not_deletable(client, supabase_db):
    d = seed_debt(supabase_db, current_balance=0.0, status="paid_off",
                  paid_off_at=f"{TODAY.isoformat()}T12:00:00+00:00")
    extra = seed_tx(supabase_db, d, df.KIND_EXTRA, 40.0, TODAY.isoformat())
    assert detail(client, d)["transactions"][0]["deletable"] is False
    assert delete_payment(client, d, extra["id"]).status_code == 409
    assert len(supabase_db.rows("debt_transactions")) == 1


def test_another_debts_payment_cannot_be_deleted_through_this_one(client, supabase_db):
    a = seed_debt(supabase_db, current_balance=100.0)
    b = seed_debt(supabase_db, name="Car", current_balance=900.0)
    tx = pay(client, a, extra=10).json()["transactions"][0]
    assert delete_payment(client, b, tx["id"]).status_code == 409
    assert len(supabase_db.rows("debt_transactions")) == 1


def test_deleting_an_extra_never_shrinks_the_plant(client, supabase_db):
    d = seed_debt(supabase_db, original_balance=1000.0, current_balance=200.0)
    paid = pay(client, d, extra=190).json()
    assert paid["debt"]["growth_step"] == 10
    res = delete_payment(client, d, paid["transactions"][0]["id"]).json()
    assert res["debt"]["current_balance"] == 200.0
    assert res["debt"]["growth_step"] == 10 and res["debt"]["highest_step"] == 10


def test_suggestions_and_focus_recompute_from_the_new_balance(client, supabase_db):
    small = seed_debt(supabase_db, name="Small", current_balance=100.0)
    big = seed_debt(supabase_db, name="Big", current_balance=150.0)
    tx = pay(client, small, extra=100).json()
    assert tx["debt"]["ready_to_complete"] is True
    res = delete_payment(client, small, tx["transactions"][0]["id"]).json()
    assert res["debt"]["ready_to_complete"] is False
    assert res["focus_id"] == small["id"]
    assert res["debt"]["rolls_into_id"] == big["id"]


# ══ 6. The minimum toggle leaves no log/undo pairs ════════════════════════════

def test_toggling_four_times_leaves_at_most_one_minimum(client, supabase_db):
    seed_income(supabase_db)
    d = seed_debt(supabase_db)
    assert pay(client, d, minimum=True).status_code == 200
    assert dashboard(client)["expenses"]["goals"] == 50.0
    assert undo(client, d).status_code == 200
    assert supabase_db.rows("debt_transactions") == []
    assert dashboard(client)["expenses"]["goals"] == 0
    assert detail(client, d)["transactions"] == []

    for step in range(3):
        res = pay(client, d, minimum=True) if step % 2 == 0 else undo(client, d)
        assert res.status_code == 200, res.text
    assert kinds(supabase_db) == ["payment_minimum"]
    assert supabase_db.rows("debts")[0]["current_balance"] == 950.0
    assert [t["kind"] for t in detail(client, d)["transactions"]] == ["payment_minimum"]
    assert dashboard(client)["expenses"]["goals"] == 50.0


def test_undo_shifts_later_rows_and_restores_the_balance(client, supabase_db):
    d = seed_debt(supabase_db)
    pay(client, d, minimum=True)
    extra = pay(client, d, extra=100).json()["transactions"][0]
    assert extra["balance_after"] == 850.0
    body = undo(client, d).json()
    assert body["debt"]["current_balance"] == 900.0 and body["debt"]["min_logged_this_cycle"] is False
    assert [(t["kind"], t["balance_after"]) for t in supabase_db.rows("debt_transactions")] == [
        ("payment_extra", 900.0)]


def test_legacy_pairs_are_collapsed_but_still_netted(client, supabase_db):
    seed_income(supabase_db)
    d = seed_debt(supabase_db, current_balance=950.0)
    on = TODAY.isoformat()
    first = seed_tx(supabase_db, d, df.KIND_MINIMUM, 50.0, on, balance_after=950.0)
    reversal = seed_tx(supabase_db, d, df.KIND_MINIMUM_REVERSAL, 50.0, on, balance_after=1000.0)
    second = seed_tx(supabase_db, d, df.KIND_MINIMUM, 50.0, on, balance_after=950.0)

    assert [t["id"] for t in detail(client, d)["transactions"]] == [second["id"]]
    assert dashboard(client)["expenses"]["goals"] == 50.0
    # Reading them deletes nothing.
    assert len(supabase_db.rows("debt_transactions")) == 3

    # Undo removes the minimum still standing, not the one already cancelled.
    assert undo(client, d).status_code == 200
    assert [t["id"] for t in supabase_db.rows("debt_transactions")] == [first["id"], reversal["id"]]
    assert detail(client, d)["transactions"] == []
    assert dashboard(client)["expenses"]["goals"] == 0
    assert supabase_db.rows("debts")[0]["current_balance"] == 1000.0


def test_nothing_writes_a_reversal_any_more(client, supabase_db):
    d = seed_debt(supabase_db)
    for _ in range(3):
        pay(client, d, minimum=True)
        undo(client, d)
    assert df.KIND_MINIMUM_REVERSAL not in kinds(supabase_db)


def test_cancelled_minimum_pairs_rule():
    rows = [
        {"id": 1, "debt_id": 1, "kind": df.KIND_MINIMUM, "occurred_on": "2026-09-01"},
        {"id": 2, "debt_id": 1, "kind": df.KIND_MINIMUM_REVERSAL, "occurred_on": "2026-09-01"},
        {"id": 3, "debt_id": 1, "kind": df.KIND_MINIMUM, "occurred_on": "2026-09-02"},
        {"id": 4, "debt_id": 2, "kind": df.KIND_MINIMUM, "occurred_on": "2026-09-01"},
        # Debt 2's reversal cancels debt 2's minimum only.
        {"id": 5, "debt_id": 2, "kind": df.KIND_MINIMUM_REVERSAL, "occurred_on": "2026-09-03"},
        {"id": 6, "debt_id": 1, "kind": df.KIND_EXTRA, "occurred_on": "2026-09-01"},
    ]
    assert df.cancelled_minimum_ids(rows) == {1, 2, 4, 5}
    assert [t["id"] for t in df.visible_history(rows)] == [3, 6]


# ══ 7. Deleting a debt ════════════════════════════════════════════════════════

def test_deleting_a_debt_with_open_month_payments_recovers_the_goals_split(client, supabase_db):
    seed_income(supabase_db)
    d = seed_debt(supabase_db)
    pay(client, d, minimum=True)
    pay(client, d, extra=30)
    assert dashboard(client)["expenses"]["goals"] == 80.0
    res = client.delete(f"/debt-freedom/{d['id']}", headers=auth(USER_A), params={"today": TODAY.isoformat()})
    assert res.status_code == 200 and res.json() == {"deleted": True}
    assert dashboard(client)["expenses"]["goals"] == 0


def test_deleting_a_debt_with_closed_month_payments_is_refused(client, supabase_db):
    d = seed_debt(supabase_db)
    pay(client, d, minimum=True)
    close_month(supabase_db)
    res = client.delete(f"/debt-freedom/{d['id']}", headers=auth(USER_A))
    assert res.status_code == 409
    assert res.json()["detail"] == main.DEBT_DELETE_CLOSED_DETAIL
    assert len(supabase_db.rows("debts")) == 1 and len(supabase_db.rows("debt_transactions")) == 1


def test_a_net_zero_legacy_pair_in_a_closed_month_does_not_block_delete(client, supabase_db):
    d = seed_debt(supabase_db)
    seed_tx(supabase_db, d, df.KIND_MINIMUM, 50.0, TODAY.isoformat())
    seed_tx(supabase_db, d, df.KIND_MINIMUM_REVERSAL, 50.0, TODAY.isoformat())
    seed_tx(supabase_db, d, df.KIND_INTEREST, 9.0, TODAY.isoformat())
    close_month(supabase_db)
    assert client.delete(f"/debt-freedom/{d['id']}", headers=auth(USER_A)).status_code == 200


def test_a_debt_without_payments_deletes_even_in_a_closed_month(client, supabase_db):
    d = seed_debt(supabase_db)
    close_month(supabase_db)
    assert client.delete(f"/debt-freedom/{d['id']}", headers=auth(USER_A)).status_code == 200


# ══ 8. Debt payments for the Goals split's "View all" ═════════════════════════

def test_the_months_payments_are_listed_newest_first_with_the_debt_name(client, supabase_db):
    card = seed_debt(supabase_db, name="Visa")
    car = seed_debt(supabase_db, name="Car loan")
    a = seed_tx(supabase_db, card, df.KIND_MINIMUM, 50.0, this_month(1))
    b = seed_tx(supabase_db, car, df.KIND_EXTRA, 75.0, this_month(1))
    # A legacy pair, interest, and the same month last year: none of them listed.
    seed_tx(supabase_db, car, df.KIND_MINIMUM, 20.0, this_month(1))
    seed_tx(supabase_db, car, df.KIND_MINIMUM_REVERSAL, 20.0, this_month(1))
    seed_tx(supabase_db, card, df.KIND_INTEREST, 9.0, this_month(1))
    seed_tx(supabase_db, card, df.KIND_EXTRA, 500.0, datetime.date(TODAY.year - 1, TODAY.month, 1).isoformat())

    res = client.get("/debt-freedom/payments", headers=auth(USER_A),
                     params={"month": MONTH, "today": TODAY.isoformat()})
    assert res.status_code == 200, res.text
    assert res.json()["data"] == [
        {"id": b["id"], "debt_id": car["id"], "debt_name": "Car loan", "kind": "payment_extra",
         "amount": 75.0, "occurred_on": this_month(1)},
        {"id": a["id"], "debt_id": card["id"], "debt_name": "Visa", "kind": "payment_minimum",
         "amount": 50.0, "occurred_on": this_month(1)},
    ]
    # It adds up to the debt part of the split.
    seed_income(supabase_db)
    assert dashboard(client)["expenses"]["goals"] == 125.0


def test_an_unknown_month_lists_nothing(client):
    res = client.get("/debt-freedom/payments", headers=auth(USER_A), params={"month": "Agosto"})
    assert res.status_code == 200 and res.json() == {"data": []}
