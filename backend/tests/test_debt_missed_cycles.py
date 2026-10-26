"""Catch-up minimums: missed cycles, late minimums, and what "overdue" means now.

A minimum used to belong to whichever cycle its occurred_on fell in, so a September
minimum caught up in October was October's: the toggle turned on and the overdue
alert cleared while October was never paid. A late minimum now names its cycle in
`cycle_due_date` (migration 0012). It is dated the day it is logged, so it counts
against THAT month's Goals budget; it covers its own cycle and no other.

The pure rules run on plain dicts with a fixed `today`; the route tests pin the
server date with `clock`.
"""

from __future__ import annotations

import datetime

import pytest

import debt_freedom as df
import main
from conftest import USER_A, auth, stamp_year, v2

D = datetime.date
TODAY = D(2026, 10, 20)   # due day 14: current cycle Oct 15 - Nov 14


def card(*, created="2026-07-20T12:00:00+00:00", balance=1000.0, minimum=50.0, due_day=14,
         status="active", **over) -> dict:
    """Created Jul 20: the passed cycles are Aug 14, Sep 14 and Oct 14."""
    row = {"id": 1, "name": "Card", "original_balance": 1000.0, "current_balance": balance,
           "min_payment": minimum, "apr": 0.0, "due_day": due_day, "status": status,
           "created_at": created, "interest_checked_through": "2026-10-14", "late_fee": 0.0,
           "cycle_start_balance": balance, "species": 4, "species_locked": False, "paid_off_at": None}
    row.update(over)
    return row


def minimum(on, *, cycle=None, amount=50.0, id=1, kind=df.KIND_MINIMUM) -> dict:
    return {"id": id, "debt_id": 1, "kind": kind, "amount": amount, "balance_after": 950.0,
            "occurred_on": on, "cycle_due_date": cycle}


def dues(missed) -> list:
    return [m["due_date"] for m in missed]


# ══ missed_cycles ══════════════════════════════════════════════════════════════

def test_every_passed_cycle_without_a_minimum_is_missed_oldest_first():
    missed = df.missed_cycles(card(), [], TODAY)
    assert missed == [
        {"due_date": "2026-08-14", "amount": 50.0},
        {"due_date": "2026-09-14", "amount": 50.0},
        {"due_date": "2026-10-14", "amount": 50.0},
    ]


def test_an_on_time_minimum_covers_its_cycle():
    txns = [minimum("2026-09-10")]
    assert dues(df.missed_cycles(card(), txns, TODAY)) == ["2026-08-14", "2026-10-14"]


def test_the_due_date_itself_still_counts():
    assert "2026-09-14" not in dues(df.missed_cycles(card(), [minimum("2026-09-14")], TODAY))


def test_a_late_minimum_covers_its_own_cycle_only():
    txns = [minimum("2026-10-18", cycle="2026-09-14")]
    assert dues(df.missed_cycles(card(), txns, TODAY)) == ["2026-08-14", "2026-10-14"]


def test_a_current_cycle_minimum_does_not_cover_an_old_one():
    txns = [minimum("2026-10-18")]
    assert dues(df.missed_cycles(card(), txns, TODAY)) == ["2026-08-14", "2026-09-14", "2026-10-14"]
    assert df.min_logged_this_cycle(card(), txns, TODAY) is True


def test_a_late_minimum_is_not_the_current_cycles():
    """The bug this fixes: catching up last month used to switch this month's toggle
    on."""
    txns = [minimum("2026-10-18", cycle="2026-10-14")]
    assert df.min_logged_this_cycle(card(), txns, TODAY) is False
    assert df.minimum_row_to_undo(card(), txns, TODAY) is None


def test_an_extra_alone_does_not_cover_a_cycle():
    txns = [minimum("2026-09-10", kind=df.KIND_EXTRA, amount=40.0)]
    assert "2026-09-14" in dues(df.missed_cycles(card(), txns, TODAY))


def test_paying_the_statement_in_full_covers_a_cycle():
    txns = [minimum("2026-09-10", kind=df.KIND_EXTRA, amount=1000.0) | {"balance_after": 0.0}]
    assert "2026-09-14" not in dues(df.missed_cycles(card(balance=0.0), txns, TODAY))


def test_a_cycle_that_opened_at_zero_is_not_owed():
    assert df.missed_cycles(card(balance=0.0), [], TODAY) == []


def test_the_amount_is_capped_at_the_statement():
    assert {m["amount"] for m in df.missed_cycles(card(balance=30.0), [], TODAY)} == {30.0}


def test_a_legacy_reversed_minimum_does_not_cover():
    txns = [minimum("2026-09-10", id=1),
            minimum("2026-09-11", id=2, kind=df.KIND_MINIMUM_REVERSAL)]
    assert "2026-09-14" in dues(df.missed_cycles(card(), txns, TODAY))


def test_a_raised_minimum_does_not_unpay_a_cycle_paid_on_time():
    """The check-in after September raised the minimum to 80; September's 50 was the
    whole minimum at the time and still covers it."""
    txns = [minimum("2026-09-10", amount=50.0)]
    assert "2026-09-14" not in dues(df.missed_cycles(card(minimum=80.0), txns, TODAY))


def test_due_dates_before_creation_are_never_missed():
    assert df.missed_cycles(card(created="2026-10-16T12:00:00+00:00"), [], TODAY) == []


def test_no_due_day_or_paid_off_has_none():
    assert df.missed_cycles(card(due_day=None), [], TODAY) == []
    assert df.missed_cycles(card(status="paid_off"), [], TODAY) == []


# ══ overdue ════════════════════════════════════════════════════════════════════

def test_overdue_across_several_missed_months_until_the_last_is_logged():
    debt = card()
    txns = []
    assert df.is_overdue(debt, txns, TODAY) is True
    for i, due in enumerate(["2026-08-14", "2026-09-14"], start=1):
        txns.append(minimum("2026-10-18", cycle=due, id=i))
        assert df.is_overdue(debt, txns, TODAY) is True, due
    txns.append(minimum("2026-10-18", cycle="2026-10-14", id=3))
    assert df.is_overdue(debt, txns, TODAY) is False


def test_the_home_counts_the_missed_months_and_dates_from_the_oldest():
    garden = df.decorate_garden([card()], [], TODAY)
    s = df.home_debt_summary(garden, [], TODAY)
    assert s["overdue"][0]["missed_count"] == 3
    assert s["overdue"][0]["missed_due_date"] == "2026-08-14"
    assert s["overdue"][0]["days_overdue"] == (TODAY - D(2026, 8, 14)).days


def test_the_garden_carries_missed_cycles_and_late_minimums():
    txns = [minimum("2026-10-18", cycle="2026-09-14")]
    d = df.decorate_garden([card()], txns, TODAY)["debts"][0]
    assert dues(d["missed_cycles"]) == ["2026-08-14", "2026-10-14"]
    assert d["late_minimums"] == [{"due_date": "2026-09-14", "amount": 50.0}]


def test_a_late_minimum_from_an_earlier_cycle_can_no_longer_be_taken_back():
    txns = [minimum("2026-10-10", cycle="2026-09-14")]   # logged in the Sep 15 - Oct 14 cycle
    assert df.late_minimum_rows(card(), txns, TODAY) == []
    assert df.late_minimum_row_to_undo(card(), txns, D(2026, 9, 14), TODAY) is None


NOV15 = D(2026, 11, 15)   # the Nov 14 due date closes the Oct 15 - Nov 14 cycle


def late_fees(result) -> list:
    return [(r["amount"], r["occurred_on"]) for r in result["transactions"] if r["kind"] == df.KIND_LATE_FEE]


def test_a_late_minimum_does_not_prevent_the_current_cycles_late_fee():
    """September's minimum, logged late on Oct 18, pays September. October's own
    minimum was never logged, so closing October charges its late fee."""
    debt = card(late_fee=25.0)
    late = [minimum("2026-10-18", cycle="2026-09-14")]
    assert late_fees(df.process_due_dates(debt, late, NOV15)) == [(25.0, "2026-11-14")]


def test_a_late_minimum_does_not_cover_the_current_cycle_when_the_fee_is_unknown():
    debt = card(late_fee=None)
    late = [minimum("2026-10-18", cycle="2026-09-14")]
    assert df.process_due_dates(debt, late, NOV15)["patch"]["late_fee_pending_for"] == "2026-11-14"


def test_a_late_minimum_still_lowers_the_balance_the_cycle_closes_on():
    """Only the late-fee test is attributed. The money left the balance in October,
    so October's interest is on the lower balance, as for any payment."""
    debt = card(balance=950.0, late_fee=0.0, apr=24.0)
    late = [minimum("2026-10-18", cycle="2026-09-14")]
    on_time = [minimum("2026-10-18")]
    late_rows = df.process_due_dates(debt, late, NOV15)
    on_time_rows = df.process_due_dates(debt, on_time, NOV15)
    assert late_rows["patch"]["current_balance"] == on_time_rows["patch"]["current_balance"]
    assert [r for r in late_rows["transactions"] if r["kind"] == df.KIND_INTEREST] == \
        [r for r in on_time_rows["transactions"] if r["kind"] == df.KIND_INTEREST]


@pytest.mark.parametrize("fee", [25.0, None, 0.0])
@pytest.mark.parametrize("rows", [
    pytest.param([], id="nothing logged"),
    pytest.param([("2026-10-18", 50.0)], id="minimum in the cycle"),
    pytest.param([("2026-11-14", 50.0)], id="minimum on the due date"),
    pytest.param([("2026-10-14", 50.0)], id="minimum in the previous cycle"),
    pytest.param([("2026-10-18", 20.0)], id="short minimum"),
])
def test_a_null_cycle_due_date_behaves_exactly_as_before(fee, rows):
    """Every row from before 0012 has cycle_due_date NULL — or, from a select that
    predates the column, no such key at all. Both must close cycles exactly as the
    occurred_on rule did (net_minimum, which the pre-0012 code called)."""
    debt = card(late_fee=fee)
    with_null = [minimum(on, amount=amt, id=i) for i, (on, amt) in enumerate(rows, 1)]
    without_key = [{k: v for k, v in t.items() if k != "cycle_due_date"} for t in with_null]
    got_null = df.process_due_dates(debt, with_null, NOV15)
    got_missing = df.process_due_dates(debt, without_key, NOV15)
    assert got_null == got_missing
    # ...and the attributed minimum is the pre-0012 net minimum, cycle by cycle.
    for start, due in [(D(2026, 9, 15), D(2026, 10, 14)), (D(2026, 10, 15), D(2026, 11, 14))]:
        assert df.attributed_minimum(with_null, start, due, due) == df.net_minimum(with_null, start, due)
        assert df.attributed_minimum(without_key, start, due, due) == df.net_minimum(without_key, start, due)
    owed_fee = not rows or rows[0][0] in ("2026-10-14",) or rows[0][1] < 50.0
    if fee == 25.0:
        assert late_fees(got_null) == ([(25.0, "2026-11-14")] if owed_fee else [])
    if fee is None:
        assert got_null["patch"].get("late_fee_pending_for") == ("2026-11-14" if owed_fee else None)


# ══ routes ═════════════════════════════════════════════════════════════════════

@pytest.fixture(autouse=True)
def clock(monkeypatch):
    monkeypatch.setattr(main, "_df_server_today", lambda: TODAY)


def seed(db, **over) -> dict:
    row = card(**over)
    row.pop("id")
    return db.seed("debts", {**row, "user_id": USER_A})


def pay(client, debt_id, **body):
    return client.post(f"/debt-freedom/{debt_id}/payments", headers=auth(USER_A),
                       json={"minimum": True, **body})


def undo(client, debt_id, **body):
    return client.post(f"/debt-freedom/{debt_id}/payments/undo-minimum", headers=auth(USER_A), json=body)


def test_logging_each_missed_month_late(client, supabase_db):
    d = seed(supabase_db)
    garden = client.get("/debt-freedom/", headers=auth(USER_A)).json()["debts"][0]
    assert dues(garden["missed_cycles"]) == ["2026-08-14", "2026-09-14", "2026-10-14"]

    res = pay(client, d["id"], cycle_due_date="2026-09-14")
    assert res.status_code == 200, res.text
    body = res.json()["debt"]
    assert dues(body["missed_cycles"]) == ["2026-08-14", "2026-10-14"]
    assert body["min_logged_this_cycle"] is False, "a late minimum is not this cycle's"
    row = supabase_db.rows("debt_transactions")[-1]
    assert (row["kind"], row["amount"], row["occurred_on"], row["cycle_due_date"]) == \
        ("payment_minimum", 50.0, "2026-10-20", "2026-09-14")
    assert body["current_balance"] == 950.0
    assert body["species_locked"] is True and body["growth_step"] >= 1

    for due in ("2026-08-14", "2026-10-14"):
        assert pay(client, d["id"], cycle_due_date=due).status_code == 200
    final = client.get("/debt-freedom/", headers=auth(USER_A)).json()["debts"][0]
    assert final["missed_cycles"] == []
    assert final["current_balance"] == 850.0

    # The current cycle's minimum is still its own toggle.
    on = pay(client, d["id"])
    assert on.status_code == 200 and on.json()["debt"]["min_logged_this_cycle"] is True


def test_the_home_alert_count_drops_with_each_late_minimum(client, supabase_db):
    d = seed(supabase_db)

    def overdue():
        body = client.get("/home/summary/", headers=auth(USER_A), params={"month": "October"}).json()
        return body["debts"]["overdue"]

    assert overdue()[0]["missed_count"] == 3
    pay(client, d["id"], cycle_due_date="2026-08-14")
    assert overdue()[0]["missed_count"] == 2
    assert overdue()[0]["missed_due_date"] == "2026-09-14"
    pay(client, d["id"], cycle_due_date="2026-09-14")
    pay(client, d["id"], cycle_due_date="2026-10-14")
    assert overdue() == []


def test_a_late_minimum_does_not_spare_this_cycle_its_late_fee(client, supabase_db, monkeypatch):
    """End to end: September logged late on Oct 20, October never paid. When the
    Nov 14 due date closes, October gets its late fee and is still owed."""
    d = seed(supabase_db, late_fee=25.0)
    assert pay(client, d["id"], cycle_due_date="2026-09-14").status_code == 200
    assert pay(client, d["id"], cycle_due_date="2026-08-14").status_code == 200
    assert pay(client, d["id"], cycle_due_date="2026-10-14").status_code == 200

    monkeypatch.setattr(main, "_df_server_today", lambda: NOV15)
    garden = client.get("/debt-freedom/", headers=auth(USER_A)).json()["debts"][0]
    fees = [(t["amount"], t["occurred_on"]) for t in supabase_db.rows("debt_transactions")
            if t["kind"] == "late_fee"]
    assert fees == [(25.0, "2026-11-14")]
    assert dues(garden["missed_cycles"]) == ["2026-11-14"]


def test_a_current_cycle_minimum_leaves_the_old_months_owed(client, supabase_db):
    d = seed(supabase_db)
    body = pay(client, d["id"]).json()["debt"]
    assert body["min_logged_this_cycle"] is True
    assert len(body["missed_cycles"]) == 3


def test_a_cycle_that_is_not_missed_is_refused(client, supabase_db):
    d = seed(supabase_db)
    assert pay(client, d["id"], cycle_due_date="2026-09-14").status_code == 200
    again = pay(client, d["id"], cycle_due_date="2026-09-14")
    assert again.status_code == 409
    for not_a_cycle in ("2026-09-15", "2026-11-14", "2026-07-14"):
        assert pay(client, d["id"], cycle_due_date=not_a_cycle).status_code == 409, not_a_cycle


def test_cycle_due_date_is_for_a_minimum_on_its_own(client, supabase_db):
    d = seed(supabase_db)
    assert pay(client, d["id"], minimum=False, extra_amount=10, cycle_due_date="2026-09-14").status_code == 400
    assert pay(client, d["id"], extra_amount=10, cycle_due_date="2026-09-14").status_code == 400
    assert supabase_db.rows("debt_transactions") == []


def test_a_late_minimum_can_be_taken_back(client, supabase_db):
    d = seed(supabase_db)
    pay(client, d["id"], cycle_due_date="2026-09-14")
    assert client.get("/debt-freedom/", headers=auth(USER_A)).json()["debts"][0]["late_minimums"] == \
        [{"due_date": "2026-09-14", "amount": 50.0}]

    res = undo(client, d["id"], cycle_due_date="2026-09-14")
    assert res.status_code == 200, res.text
    body = res.json()["debt"]
    assert dues(body["missed_cycles"]) == ["2026-08-14", "2026-09-14", "2026-10-14"]
    assert body["current_balance"] == 1000.0 and body["late_minimums"] == []
    assert supabase_db.rows("debt_transactions") == []
    assert undo(client, d["id"], cycle_due_date="2026-09-14").status_code == 409


def test_the_plain_undo_never_takes_a_late_minimum(client, supabase_db):
    d = seed(supabase_db)
    pay(client, d["id"], cycle_due_date="2026-09-14")
    assert undo(client, d["id"]).status_code == 409
    assert len(supabase_db.rows("debt_transactions")) == 1


def test_a_late_minimum_logged_in_an_earlier_cycle_cannot_be_taken_back(client, supabase_db):
    d = seed(supabase_db)
    supabase_db.seed("debt_transactions", {
        "user_id": USER_A, "debt_id": d["id"], "kind": "payment_minimum", "amount": 50.0,
        "balance_after": 950.0, "occurred_on": "2026-10-10", "cycle_due_date": "2026-09-14"})
    assert undo(client, d["id"], cycle_due_date="2026-09-14").status_code == 409


def test_late_minimums_are_refused_in_a_closed_month(client, supabase_db):
    d = seed(supabase_db)
    pay(client, d["id"], cycle_due_date="2026-09-14")
    supabase_db.seed("month_status", {"user_id": USER_A, "month": "October",
                                      "closed_at": "2026-10-19T00:00:00+00:00",
                                      "year": stamp_year("October")})
    closed = "October is closed. Reopen it before making changes."
    res = pay(client, d["id"], cycle_due_date="2026-08-14")
    assert res.status_code == 409 and res.json()["detail"] == closed
    res = undo(client, d["id"], cycle_due_date="2026-09-14")
    assert res.status_code == 409 and res.json()["detail"] == closed


def test_a_late_minimum_counts_against_the_month_it_is_logged_in(client, supabase_db):
    """Its occurred_on is the day it was logged, so October's Goals split carries it,
    not September's."""
    supabase_db.seed("income", {"user_id": USER_A, "amount": 1000.0, "day": 1, "month": "October"})
    supabase_db.seed("income", {"user_id": USER_A, "amount": 1000.0, "day": 1, "month": "September"})
    d = seed(supabase_db)
    pay(client, d["id"], cycle_due_date="2026-09-14")

    october = client.get("/dashboard/October", headers=auth(USER_A)).json()
    september = client.get("/dashboard/September", headers=auth(USER_A)).json()
    assert october["expenses"]["goals"] == 50.0
    assert september["expenses"]["goals"] == 0
    rows = client.get("/debt-freedom/payments", headers=auth(USER_A), params={"month": "October"}).json()["data"]
    assert [(r["kind"], r["amount"], r["occurred_on"]) for r in rows] == [("payment_minimum", 50.0, "2026-10-20")]


def test_late_minimums_are_gated_like_any_write(client, supabase_db, premium_on):
    d = seed(supabase_db)
    res = client.post(f"/debt-freedom/{d['id']}/payments", headers=v2(USER_A, "limits"),
                      json={"minimum": True, "cycle_due_date": "2026-09-14"})
    assert res.status_code == 403 and res.json()["code"] == "debt_freedom_locked"
    res = client.post(f"/debt-freedom/{d['id']}/payments/undo-minimum", headers=v2(USER_A, "limits"),
                      json={"cycle_due_date": "2026-09-14"})
    assert res.status_code == 403
