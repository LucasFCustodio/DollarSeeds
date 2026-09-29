"""Debt Freedom — the snowball rules (debt_freedom.py) and the /debt-freedom/ routes.

The pure rules are tested with plain dicts and a fixed `today`, so nothing here
depends on the calendar. The route tests run against the in-memory fake, with the
server date pinned by the `clock` fixture.
"""

from __future__ import annotations

import datetime

import pytest

import debt_freedom as df
from conftest import USER_A, auth

TODAY = datetime.date(2026, 9, 28)


@pytest.fixture(autouse=True)
def clock(monkeypatch):
    """The routes' server date. Route-created debts get the fake's created_at
    (2026-01-01), so the default is the day after: no due date has passed yet.
    Call the fixture with a date to move it."""
    import main
    state = {"today": datetime.date(2026, 1, 2)}
    monkeypatch.setattr(main, "_df_server_today", lambda: state["today"])

    def set_today(d):
        state["today"] = d
    return set_today


def debt(id, balance, *, original=None, minimum=50.0, apr=0.0, status="active",
         paid_off_at=None, created_at=None, species=4, locked=False, due_day=None,
         checked=None):
    return {
        "id": id, "name": f"D{id}", "original_balance": original if original is not None else balance,
        "current_balance": balance, "min_payment": minimum, "apr": apr, "status": status,
        "paid_off_at": paid_off_at, "created_at": created_at or f"2026-01-01T00:00:{id:02d}+00:00",
        "species": species, "species_locked": locked, "due_day": due_day,
        "interest_checked_through": checked,
    }


def pay(debt_id, on, kind=df.KIND_MINIMUM, amount=50.0):
    return {"debt_id": debt_id, "kind": kind, "amount": amount, "occurred_on": on}


# ── order ────────────────────────────────────────────────────────────────────

def test_order_puts_paid_off_first_oldest_first_then_smallest_balance():
    rows = [
        debt(1, 900), debt(2, 100),
        debt(3, 0, status="paid_off", paid_off_at="2026-05-01T00:00:00+00:00"),
        debt(4, 0, status="paid_off", paid_off_at="2026-02-01T00:00:00+00:00"),
        debt(5, 400),
    ]
    assert [d["id"] for d in df.order_debts(rows)] == [4, 3, 2, 5, 1]
    assert df.focus_debt(df.order_debts(rows))["id"] == 2


def test_order_breaks_balance_ties_by_created_at_then_id():
    rows = [
        debt(3, 500, created_at="2026-03-01T00:00:00+00:00"),
        debt(2, 500, created_at="2026-02-01T00:00:00+00:00"),
        debt(1, 500, created_at="2026-03-01T00:00:00+00:00"),
    ]
    assert [d["id"] for d in df.order_debts(rows)] == [2, 1, 3]


def test_order_handles_numeric_strings():
    rows = [debt(1, "1000.00"), debt(2, "99.50")]
    assert [d["id"] for d in df.order_debts(rows)] == [2, 1]


# ── species ──────────────────────────────────────────────────────────────────

@pytest.mark.parametrize("n", [1, 2, 3])
def test_fewer_than_four_debts_are_all_species_4(n):
    assert [df.species_for(i, n) for i in range(n)] == [4] * n


def test_species_split_into_quarters():
    assert [df.species_for(i, 4) for i in range(4)] == [1, 2, 3, 4]
    assert [df.species_for(i, 8) for i in range(8)] == [1, 1, 2, 2, 3, 3, 4, 4]
    assert [df.species_for(i, 5) for i in range(5)] == [1, 1, 2, 3, 4]
    assert [df.species_for(i, 15) for i in range(15)] == [1] * 4 + [2] * 4 + [3] * 4 + [4] * 3


def test_species_updates_only_touch_unlocked_debts():
    rows = [debt(1, 100, species=4, locked=True), debt(2, 200), debt(3, 300), debt(4, 400)]
    # By position these want 1, 2, 3, 4 — but debt 1 is locked at 4.
    assert df.species_updates(rows) == {2: 2, 3: 3}


def test_species_updates_are_empty_when_already_right():
    rows = [debt(1, 100), debt(2, 200)]
    assert df.species_updates(rows) == {}


# ── growth ───────────────────────────────────────────────────────────────────

def test_seed_until_the_first_payment():
    assert df.growth_step(debt(1, 500, original=1000), paid_something=False) == 0


@pytest.mark.parametrize("current,step", [
    (1000, 1),   # paid but 0%
    (901, 1),    # 9.9%
    (900, 2),    # exactly 10%
    (810, 2),    # 19%
    (800, 3),
    (500, 6),    # 50%
    (100, 10),   # 90%
    (1, 10),     # 99.9%
    (0, 10),     # 100% (capped)
])
def test_growth_steps(current, step):
    assert df.growth_step(debt(1, current, original=1000), paid_something=True) == step


def test_pct_paid_is_clamped_and_safe_with_zero_original():
    assert df.pct_paid(debt(1, 1200, original=1000)) == 0.0
    assert df.pct_paid(debt(1, 0, original=0)) == 1.0


def test_ready_to_complete_only_when_zero_and_active():
    assert df.ready_to_complete(debt(1, 0)) is True
    assert df.ready_to_complete(debt(1, 0.01)) is False
    assert df.ready_to_complete(debt(1, 0, status="paid_off")) is False


# ── rollover ─────────────────────────────────────────────────────────────────

def test_focus_takes_every_paid_off_minimum():
    rows = df.order_debts([
        debt(1, 0, minimum=40, status="paid_off", paid_off_at="2026-01-01"),
        debt(2, 0, minimum=60, status="paid_off", paid_off_at="2026-02-01"),
        debt(3, 300, minimum=25),
        debt(4, 900, minimum=75),
    ])
    assert df.suggested_payments(rows) == {3: 125.0, 4: 75.0}


def test_rollover_with_nothing_paid_off_is_just_the_minimum():
    rows = df.order_debts([debt(1, 300, minimum=25), debt(2, 900, minimum=75)])
    assert df.suggested_payments(rows) == {1: 25.0, 2: 75.0}


# ── payoff simulation ────────────────────────────────────────────────────────

def test_zero_interest_single_debt():
    sim = df.simulate(df.order_debts([debt(1, 300, minimum=100)]), TODAY)
    assert sim["months"][1] == "2026-12"   # Oct, Nov, Dec
    assert sim["plan"] == "2026-12"


def test_snowball_rolls_the_payment_into_the_next_debt():
    # Month 1 (Oct): A 100->0 (pays 100), B 1000->900.
    # From Nov B gets 200/mo: 900 -> 700, 500, 300, 100, 0 in Mar.
    rows = df.order_debts([debt(1, 100, minimum=100), debt(2, 1000, minimum=100)])
    sim = df.simulate(rows, TODAY)
    assert sim["months"] == {1: "2026-10", 2: "2027-03"}
    assert sim["plan"] == "2027-03"


def test_leftover_rolls_within_the_same_month():
    # A needs only 30 of its 100: the other 70 goes to B that same month.
    rows = df.order_debts([debt(1, 30, minimum=100), debt(2, 270, minimum=100)])
    sim = df.simulate(rows, TODAY)
    assert sim["months"][1] == "2026-10"
    assert sim["months"][2] == "2026-11"   # Oct: 270-100-70=100; Nov: 0


def test_paid_off_minimums_count_toward_the_plan():
    rows = df.order_debts([
        debt(1, 0, minimum=100, status="paid_off", paid_off_at="2026-03-10T00:00:00+00:00"),
        debt(2, 400, minimum=100),
    ])
    sim = df.simulate(rows, TODAY)
    assert sim["months"] == {1: "2026-03", 2: "2026-11"}


def test_interest_is_added_before_payments():
    # 1000 at 12% APR, daily over each month's real days (the due-date check's
    # formula). Oct: 1000 × .12/365 × 31 = 10.19 → 1010.19 − 510 = 500.19.
    # Nov: 500.19 × .12/365 × 30 = 4.93 → 505.13, paid off.
    rows = df.order_debts([debt(1, 1000, minimum=510, apr=12)])
    sim = df.simulate(rows, TODAY)
    assert sim["months"][1] == "2026-11"
    assert sim["interest"][1] == pytest.approx(15.13)


def test_payment_not_exceeding_interest_is_none():
    # 10,000 at 24%: 200/mo interest. A 200 payment never makes progress.
    rows = df.order_debts([debt(1, 10000, minimum=200, apr=24)])
    sim = df.simulate(rows, TODAY)
    assert sim["months"][1] is None
    assert sim["interest"][1] is None
    assert sim["plan"] is None


def test_stall_on_a_later_debt_leaves_the_earlier_estimate():
    rows = df.order_debts([debt(1, 100, minimum=100), debt(2, 10**7, minimum=100, apr=30)])
    sim = df.simulate(rows, TODAY)
    assert sim["months"][1] == "2026-10"
    assert sim["months"][2] is None
    assert sim["plan"] is None


def test_600_month_cap():
    rows = df.order_debts([debt(1, 100000, minimum=100)])   # 1000 months at 0%
    assert df.simulate(rows, TODAY)["months"][1] is None


def test_zero_balance_active_debt_is_due_this_month():
    sim = df.simulate(df.order_debts([debt(1, 0)]), TODAY)
    assert sim["months"][1] == "2026-09"


def test_empty_garden_has_no_plan():
    assert df.simulate([], TODAY)["plan"] is None


# ── next due date ────────────────────────────────────────────────────────────

def test_next_due_date():
    assert df.next_due_date(None, TODAY) is None
    assert df.next_due_date(28, TODAY) == datetime.date(2026, 9, 28)   # today counts
    assert df.next_due_date(14, TODAY) == datetime.date(2026, 10, 14)
    assert df.next_due_date(31, datetime.date(2026, 2, 3)) == datetime.date(2026, 2, 28)


# ── due-date cycles ──────────────────────────────────────────────────────────

def card(balance=1000.0, *, start=None, fee=None, minimum=50.0, apr=24.0, due_day=14,
         created_at="2026-08-20T10:00:00+00:00", checked=None, **extra):
    d = debt(1, balance, original=1000.0, minimum=minimum, apr=apr, due_day=due_day,
             created_at=created_at, checked=checked)
    d.update({"cycle_start_balance": 1000.0 if start is None else start, "late_fee": fee,
              "checkin_due_since": None, "late_fee_pending_for": None, **extra})
    return d


def kinds(result):
    return [(r["kind"], r["amount"], r["occurred_on"]) for r in result["transactions"]]


def test_full_payment_in_a_cycle_adds_no_interest_and_no_fee():
    d = card(0.0, fee=30)
    result = df.process_due_dates(d, [pay(1, "2026-09-01", kind=df.KIND_EXTRA, amount=1000)], TODAY)
    assert result["transactions"] == []
    assert result["patch"]["current_balance"] == 0.0
    assert result["patch"]["checkin_due_since"] == "2026-09-14"
    d.update(result["patch"])
    assert df.ready_to_complete(d) is True


def test_minimum_logged_adds_interest_only():
    # 25 days (Aug 20 → Sep 14) on the 950 left after the minimum.
    result = df.process_due_dates(card(950.0, fee=30), [pay(1, "2026-09-01")], TODAY)
    assert kinds(result) == [("interest", 15.62, "2026-09-14")]
    assert result["patch"]["current_balance"] == 965.62
    assert result["patch"]["cycle_start_balance"] == 965.62
    assert result["patch"]["interest_checked_through"] == "2026-09-14"
    assert "late_fee_pending_for" not in result["patch"]


def test_missed_minimum_with_a_late_fee_adds_the_fee_then_interest():
    result = df.process_due_dates(card(fee=30), [], TODAY)
    # Interest is on the balance after the fee: 1030 × 24% / 365 × 25.
    assert kinds(result) == [("late_fee", 30.0, "2026-09-14"), ("interest", 16.93, "2026-09-14")]
    assert result["patch"]["current_balance"] == 1046.93


def test_missed_minimum_without_a_late_fee_asks_and_still_adds_interest():
    result = df.process_due_dates(card(), [], TODAY)
    assert kinds(result) == [("interest", 16.44, "2026-09-14")]
    assert result["patch"]["late_fee_pending_for"] == "2026-09-14"


def test_a_late_fee_of_zero_means_no_fee_and_no_question():
    result = df.process_due_dates(card(fee=0), [], TODAY)
    assert [k for k, _, _ in kinds(result)] == ["interest"]
    assert "late_fee_pending_for" not in result["patch"]


def test_an_extra_payment_alone_is_not_the_minimum():
    result = df.process_due_dates(card(900.0, fee=25), [pay(1, "2026-09-01", kind=df.KIND_EXTRA, amount=100)], TODAY)
    assert [k for k, _, _ in kinds(result)] == ["late_fee", "interest"]


def test_a_reversed_minimum_does_not_count():
    txns = [pay(1, "2026-09-01"), pay(1, "2026-09-02", kind=df.KIND_MINIMUM_REVERSAL)]
    result = df.process_due_dates(card(fee=25), txns, TODAY)
    assert [k for k, _, _ in kinds(result)] == ["late_fee", "interest"]


def test_interest_uses_real_calendar_days_including_due_day_31_in_february():
    # 36.5% APR = 0.1% a day. Due day 31 lands on Feb 28, then Mar 31, then Apr 30.
    d = card(apr=36.5, due_day=31, fee=0, created_at="2026-01-10T00:00:00+00:00", checked="2026-01-31")
    result = df.process_due_dates(d, [], datetime.date(2026, 5, 1))
    assert kinds(result) == [
        ("interest", 28.0, "2026-02-28"),    # 28 days on 1000
        ("interest", 31.87, "2026-03-31"),   # 31 days on 1028
        ("interest", 31.8, "2026-04-30"),    # 30 days on 1059.87
    ]


def test_the_first_cycle_counts_days_from_creation():
    d = card(apr=36.5, fee=0, created_at="2026-09-04T12:00:00+00:00")
    assert kinds(df.process_due_dates(d, [], TODAY)) == [("interest", 10.0, "2026-09-14")]


def test_catch_up_processes_every_missed_due_date_in_order():
    d = card(apr=12, due_day=5, fee=25, created_at="2026-06-10T00:00:00+00:00")
    result = df.process_due_dates(d, [], TODAY)
    assert [(k, on) for k, _, on in kinds(result)] == [
        ("late_fee", "2026-07-05"), ("interest", "2026-07-05"),
        ("late_fee", "2026-08-05"), ("interest", "2026-08-05"),
        ("late_fee", "2026-09-05"), ("interest", "2026-09-05"),
    ]
    balances = [r["balance_after"] for r in result["transactions"]]
    assert balances == sorted(balances)          # each builds on the one before
    assert result["patch"]["interest_checked_through"] == "2026-09-05"
    assert result["patch"]["checkin_due_since"] == "2026-09-05"


def test_each_cycle_is_checked_against_its_own_payments():
    # A minimum in the Aug 6 – Sep 5 cycle only: July and September are missed.
    d = card(apr=0, due_day=5, fee=25, created_at="2026-06-10T00:00:00+00:00")
    result = df.process_due_dates(d, [pay(1, "2026-07-20")], TODAY)
    assert [on for k, _, on in kinds(result)] == ["2026-07-05", "2026-09-05"]


def test_the_due_date_itself_is_not_processed_until_the_next_day():
    d = card(created_at="2026-09-01T00:00:00+00:00", due_day=28)
    assert df.process_due_dates(d, [], TODAY) is None
    assert df.process_due_dates(d, [], TODAY + datetime.timedelta(days=1)) is not None


def test_a_processed_cycle_is_not_processed_twice():
    d = card(checked="2026-09-14")
    assert df.process_due_dates(d, [], TODAY) is None


def test_no_due_day_or_paid_off_is_skipped():
    assert df.process_due_dates(card(due_day=None), [], TODAY) is None
    assert df.process_due_dates(card(status="paid_off"), [], TODAY) is None


def test_a_pre_v2_debt_rebuilds_its_first_statement():
    # No cycle_start_balance: the statement is current_balance + the cycle's
    # payments, so paying half is not mistaken for paying in full.
    d = card(500.0, fee=0)
    d["cycle_start_balance"] = None
    result = df.process_due_dates(d, [pay(1, "2026-09-01", kind=df.KIND_EXTRA, amount=500)], TODAY)
    assert [k for k, _, _ in kinds(result)] == ["interest"]


def test_a_payment_logged_the_evening_before_utc_creation_counts():
    # created_at is UTC; the phone's date can be a day behind it.
    d = card(950.0, fee=30, created_at="2026-08-21T01:00:00+00:00")
    result = df.process_due_dates(d, [pay(1, "2026-08-20")], TODAY)
    assert [k for k, _, _ in kinds(result)] == ["interest"]


def test_toggle_cycle_boundaries():
    d = card(checked="2026-08-14")
    txns = [pay(1, "2026-09-14")]
    due_day = datetime.date(2026, 9, 14)
    assert df.current_cycle(d, due_day) == (datetime.date(2026, 8, 15), due_day, due_day)
    assert df.min_logged_this_cycle(d, txns, due_day) is True       # still this cycle
    nxt = due_day + datetime.timedelta(days=1)
    assert df.current_cycle(d, nxt)[2] == datetime.date(2026, 10, 14)
    assert df.min_logged_this_cycle(d, txns, nxt) is False          # a new cycle
    assert df.minimum_to_undo(d, txns, due_day) == 50.0
    assert df.minimum_to_undo(d, txns, nxt) is None


def test_a_debt_with_no_due_day_resets_the_toggle_monthly():
    d = card(due_day=None)
    assert df.min_logged_this_cycle(d, [pay(1, "2026-09-02")], TODAY) is True
    assert df.min_logged_this_cycle(d, [pay(1, "2026-08-30")], TODAY) is False


def test_a_first_due_day_starts_at_the_current_cycle():
    d = card(created_at="2026-01-01T00:00:00+00:00", due_day=None)
    assert df.anchor_for_new_due_day(d, 14, TODAY) == "2026-09-14"
    d["interest_checked_through"] = "2026-09-14"
    d["due_day"] = 14
    assert df.process_due_dates(d, [], TODAY) is None
    # Created after the last due date: anchor on created_at instead.
    assert df.anchor_for_new_due_day(card(created_at="2026-09-20T00:00:00+00:00"), 14, TODAY) is None


@pytest.mark.parametrize("statement,adjustment", [(1120.0, 120.0), (880.0, -120.0)])
def test_checkin_adjusts_in_both_directions(statement, adjustment):
    result = df.statement_checkin(card(checkin_due_since="2026-09-14"), statement, 60)
    assert result["adjustment"] == adjustment
    assert result["patch"] == {"min_payment": 60.0, "checkin_due_since": None,
                               "current_balance": statement, "cycle_start_balance": statement}


def test_checkin_with_the_same_balance_writes_no_adjustment():
    result = df.statement_checkin(card(), 1000.0, 50)
    assert result["adjustment"] is None
    assert "current_balance" not in result["patch"] and result["patch"]["checkin_due_since"] is None


# ── plants never shrink ──────────────────────────────────────────────────────

def test_highest_step_never_decreases():
    d = debt(1, 500, original=1000)
    txns = [pay(1, "2026-09-01")]
    assert df.highest_step_updates([d], txns) == {1: 6}
    d["highest_step"] = 6
    d["current_balance"] = 1200               # a check-in raised the balance
    assert df.computed_step(d, txns) == 1
    assert df.shown_step(d, txns) == 6
    assert df.highest_step_updates([d], txns) == {}
    d["current_balance"] = 100                 # and a higher step is saved again
    assert df.highest_step_updates([d], txns) == {1: 10}


def test_monthly_extra_shortens_the_simulated_payoff():
    rows = df.order_debts([debt(1, 1200, minimum=100)])
    assert df.simulate(rows, TODAY)["months"][1] == "2027-09"
    assert df.simulate(rows, TODAY, monthly_extra=100)["months"][1] == "2027-03"


# ── decorate ─────────────────────────────────────────────────────────────────

def test_garden_fields():
    rows = [
        debt(1, 0, minimum=40, status="paid_off", paid_off_at="2026-04-01T00:00:00+00:00"),
        debt(2, 500, original=1000, minimum=60, due_day=14),
        debt(3, 2000, minimum=100),
    ]
    garden = df.decorate_garden(rows, [pay(2, "2026-09-01")], TODAY)
    a, b, c = garden["debts"]
    assert garden["focus_id"] == 2
    assert [d["position"] for d in garden["debts"]] == [1, 2, 3]
    assert {d["total"] for d in garden["debts"]} == {3}
    assert (a["is_focus"], b["is_focus"], c["is_focus"]) == (False, True, False)
    assert (a["growth_step"], b["growth_step"], c["growth_step"]) == (10, 6, 0)
    assert b["pct_paid"] == 0.5
    assert b["suggested_payment"] == 100.0 and c["suggested_payment"] == 100.0
    assert b["next_due_date"] == "2026-10-14"
    assert b["missing"] == [] and c["missing"] == ["due_day"]
    assert [d["paid_off_count_through_here"] for d in garden["debts"]] == [1, 1, 1]
    assert b["rolls_into_id"] == 3 and c["rolls_into_id"] is None
    assert a["est_payoff_month"] == "2026-04"
    assert garden["plan_est_payoff_month"] == c["est_payoff_month"]


# ── routes ───────────────────────────────────────────────────────────────────

NEW = {"name": "Chase Visa", "original_balance": 2480, "current_balance": 1240,
       "min_payment": 150, "apr": 24.99, "due_day": 14}


def create(client, **overrides):
    res = client.post("/debt-freedom/", headers=auth(USER_A), json={**NEW, **overrides})
    assert res.status_code == 200, res.text
    return res.json()["debt"]


def test_create_returns_the_decorated_debt(client):
    d = create(client, due_day=14, debt_type="credit_card", pay_url="chase.com")
    assert d["position"] == 1 and d["is_focus"] is True and d["growth_step"] == 0
    assert d["species"] == 4 and d["species_locked"] is False
    assert d["pay_url"] == "https://chase.com"


@pytest.mark.parametrize("bad", [
    {"name": "  "}, {"min_payment": -1}, {"apr": -3}, {"due_day": 0}, {"due_day": 32},
    {"debt_type": "yacht"}, {"pay_url": "javascript:alert(1)"}, {"pay_url": "intent://x"},
])
def test_create_validates(client, bad):
    res = client.post("/debt-freedom/", headers=auth(USER_A), json={**NEW, **bad})
    assert res.status_code == 400, res.text


@pytest.mark.parametrize("field", ["apr", "due_day"])
def test_create_requires_the_six_fields(client, field):
    body = dict(NEW)
    del body[field]
    assert client.post("/debt-freedom/", headers=auth(USER_A), json=body).status_code == 422


def test_create_stores_the_first_statement_and_late_fee(client, supabase_db):
    d = create(client, late_fee=35)
    assert d["late_fee"] == 35.0 and d["min_logged_this_cycle"] is False
    assert d["current_cycle_due_date"] == "2026-01-14"
    assert supabase_db.rows("debts")[0]["cycle_start_balance"] == 1240.0


def test_species_are_redealt_on_create_and_delete(client, supabase_db):
    ids = [create(client, current_balance=b)["id"] for b in (100, 200, 300)]
    assert {d["species"] for d in supabase_db.rows("debts")} == {4}
    ids.append(create(client, current_balance=400)["id"])
    by_id = {d["id"]: d["species"] for d in supabase_db.rows("debts")}
    assert [by_id[i] for i in ids] == [1, 2, 3, 4]
    client.delete(f"/debt-freedom/{ids[3]}", headers=auth(USER_A))
    assert {d["species"] for d in supabase_db.rows("debts")} == {4}


def test_minimum_payment_writes_one_transaction_and_locks_species(client, supabase_db):
    d = create(client)
    res = client.post(f"/debt-freedom/{d['id']}/payments", headers=auth(USER_A), json={"minimum": True})
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["previous_step"] == 0
    assert body["debt"]["current_balance"] == 1090.0
    assert body["debt"]["growth_step"] == 6          # 56% paid
    assert body["debt"]["species_locked"] is True
    [t] = supabase_db.rows("debt_transactions")
    assert (t["kind"], t["amount"], t["balance_after"]) == ("payment_minimum", 150.0, 1090.0)


def test_minimum_plus_extra_writes_two_transactions(client, supabase_db):
    d = create(client)
    res = client.post(f"/debt-freedom/{d['id']}/payments", headers=auth(USER_A),
                      json={"minimum": True, "extra_amount": 90, "occurred_on": "2026-09-27"})
    assert res.status_code == 200
    kinds = [(t["kind"], t["amount"], t["balance_after"], t["occurred_on"]) for t in supabase_db.rows("debt_transactions")]
    assert kinds == [("payment_minimum", 150.0, 1090.0, "2026-09-27"),
                     ("payment_extra", 90.0, 1000.0, "2026-09-27")]


def test_payment_never_takes_the_balance_below_zero(client, supabase_db):
    d = create(client, current_balance=100)
    res = client.post(f"/debt-freedom/{d['id']}/payments", headers=auth(USER_A),
                      json={"minimum": True, "extra_amount": 500})
    body = res.json()["debt"]
    assert body["current_balance"] == 0 and body["ready_to_complete"] is True
    assert [t["amount"] for t in supabase_db.rows("debt_transactions")] == [100.0]


def test_extra_is_refused_on_a_debt_that_is_not_the_focus(client):
    create(client, current_balance=100)
    other = create(client, current_balance=900)
    res = client.post(f"/debt-freedom/{other['id']}/payments", headers=auth(USER_A),
                      json={"minimum": True, "extra_amount": 10})
    assert res.status_code == 409
    ok = client.post(f"/debt-freedom/{other['id']}/payments", headers=auth(USER_A), json={"minimum": True})
    assert ok.status_code == 200


def test_payment_needs_something_to_pay(client):
    d = create(client)
    assert client.post(f"/debt-freedom/{d['id']}/payments", headers=auth(USER_A), json={}).status_code == 400


def test_balance_edit_writes_a_transaction(client, supabase_db):
    d = create(client)
    res = client.patch(f"/debt-freedom/{d['id']}", headers=auth(USER_A), json={"current_balance": 1300})
    assert res.status_code == 200
    [t] = supabase_db.rows("debt_transactions")
    assert (t["kind"], t["amount"], t["balance_after"]) == ("balance_edit", 60.0, 1300.0)
    # The statement it is checked against moves with the correction.
    assert supabase_db.rows("debts")[0]["cycle_start_balance"] == 1300.0
    # A non-balance edit writes none, and null clears an optional field.
    client.patch(f"/debt-freedom/{d['id']}", headers=auth(USER_A), json={"due_day": 3, "lender": "Chase"})
    res = client.patch(f"/debt-freedom/{d['id']}", headers=auth(USER_A), json={"lender": None, "name": "Visa"})
    assert res.json()["debt"]["due_day"] == 3 and res.json()["debt"]["lender"] is None
    assert res.json()["debt"]["name"] == "Visa"
    assert len(supabase_db.rows("debt_transactions")) == 1


def test_patch_cannot_clear_the_due_day(client):
    d = create(client)
    res = client.patch(f"/debt-freedom/{d['id']}", headers=auth(USER_A), json={"due_day": None})
    assert res.status_code == 400


def test_patch_cannot_null_a_required_field(client):
    d = create(client)
    assert client.patch(f"/debt-freedom/{d['id']}", headers=auth(USER_A), json={"apr": None}).status_code == 400


def test_complete_only_at_zero(client):
    d = create(client, current_balance=100)
    assert client.post(f"/debt-freedom/{d['id']}/complete", headers=auth(USER_A)).status_code == 409
    client.post(f"/debt-freedom/{d['id']}/payments", headers=auth(USER_A), json={"minimum": True})
    res = client.post(f"/debt-freedom/{d['id']}/complete", headers=auth(USER_A))
    assert res.status_code == 200
    assert res.json()["debt"]["status"] == "paid_off" and res.json()["debt"]["paid_off_at"]
    assert client.post(f"/debt-freedom/{d['id']}/complete", headers=auth(USER_A)).status_code == 409
    assert client.post(f"/debt-freedom/{d['id']}/payments", headers=auth(USER_A),
                       json={"minimum": True}).status_code == 409


def test_completion_rolls_the_minimum_into_the_new_focus(client):
    first = create(client, current_balance=100, min_payment=100)
    second = create(client, current_balance=900, min_payment=50)
    client.post(f"/debt-freedom/{first['id']}/payments", headers=auth(USER_A), json={"minimum": True})
    res = client.post(f"/debt-freedom/{first['id']}/complete", headers=auth(USER_A)).json()
    assert res["focus_id"] == second["id"]
    garden = client.get("/debt-freedom/", headers=auth(USER_A)).json()
    focus = next(d for d in garden["debts"] if d["id"] == second["id"])
    assert focus["suggested_payment"] == 150.0
    assert focus["paid_off_count_through_here"] == 1


def test_delete_removes_the_history(client, supabase_db):
    d = create(client)
    client.post(f"/debt-freedom/{d['id']}/payments", headers=auth(USER_A), json={"minimum": True})
    assert client.delete(f"/debt-freedom/{d['id']}", headers=auth(USER_A)).json() == {"deleted": True}
    assert supabase_db.rows("debts") == [] and supabase_db.rows("debt_transactions") == []


def test_detail_includes_history_and_what_it_rolls_into(client):
    a = create(client, current_balance=100)
    b = create(client, current_balance=900, name="Car")
    client.post(f"/debt-freedom/{a['id']}/payments", headers=auth(USER_A), json={"minimum": True})
    res = client.get(f"/debt-freedom/{a['id']}", headers=auth(USER_A)).json()
    assert res["rolls_into"] == {"id": b["id"], "name": "Car"}
    assert [t["kind"] for t in res["transactions"]] == ["payment_minimum"]


def seed_card(db, **overrides):
    return db.seed("debts", {
        "user_id": USER_A, "name": "Card", "original_balance": 1000.0, "current_balance": 1000.0,
        "min_payment": 50.0, "apr": 24.0, "due_day": 14, "cycle_start_balance": 1000.0,
        "created_at": "2026-08-20T10:00:00+00:00", **overrides,
    })


def test_garden_processes_missed_due_dates_once(client, supabase_db, clock):
    clock(datetime.date(2026, 9, 28))
    d = seed_card(supabase_db, due_day=5, apr=12.0, late_fee=25.0, created_at="2026-06-10T00:00:00+00:00")
    first = client.get("/debt-freedom/", headers=auth(USER_A)).json()
    rows = supabase_db.rows("debt_transactions")
    assert [(t["kind"], t["occurred_on"]) for t in rows] == [
        ("late_fee", "2026-07-05"), ("interest", "2026-07-05"),
        ("late_fee", "2026-08-05"), ("interest", "2026-08-05"),
        ("late_fee", "2026-09-05"), ("interest", "2026-09-05"),
    ]
    got = first["debts"][0]
    assert got["current_balance"] == rows[-1]["balance_after"]
    assert got["checkin_due_since"] == "2026-09-05"
    assert got["current_cycle_due_date"] == "2026-10-05"
    again = client.get("/debt-freedom/", headers=auth(USER_A)).json()
    assert len(supabase_db.rows("debt_transactions")) == 6
    assert again["debts"][0]["current_balance"] == got["current_balance"]
    assert d["id"] == got["id"]


def test_a_client_today_more_than_a_day_off_is_ignored(client, supabase_db, clock):
    clock(datetime.date(2026, 9, 10))
    seed_card(supabase_db)
    client.get("/debt-freedom/", headers=auth(USER_A), params={"today": "2026-12-01"})
    assert supabase_db.rows("debt_transactions") == []     # Sep 14 has not passed
    client.get("/debt-freedom/", headers=auth(USER_A), params={"today": "2026-09-11"})
    assert supabase_db.rows("debt_transactions") == []


def test_toggle_on_off_and_its_cycle(client, supabase_db, clock):
    clock(datetime.date(2026, 9, 14))
    d = seed_card(supabase_db)
    path = f"/debt-freedom/{d['id']}/payments"
    on = client.post(path, headers=auth(USER_A), json={"minimum": True, "today": "2026-09-14"})
    assert on.status_code == 200, on.text
    assert on.json()["debt"]["min_logged_this_cycle"] is True
    assert on.json()["debt"]["current_balance"] == 950.0
    # A second minimum in the same cycle is refused.
    assert client.post(path, headers=auth(USER_A), json={"minimum": True}).status_code == 409

    off = client.post(f"{path}/undo-minimum", headers=auth(USER_A), json={"today": "2026-09-14"})
    assert off.status_code == 200, off.text
    body = off.json()["debt"]
    assert body["current_balance"] == 1000.0 and body["min_logged_this_cycle"] is False
    assert body["species_locked"] is True
    assert [t["kind"] for t in supabase_db.rows("debt_transactions")] == ["payment_minimum", "minimum_reversal"]
    assert client.post(f"{path}/undo-minimum", headers=auth(USER_A)).status_code == 409

    # On again, then the due date passes: a new cycle, the toggle is off, and the
    # old cycle's minimum can no longer be undone.
    assert client.post(path, headers=auth(USER_A), json={"minimum": True}).status_code == 200
    clock(datetime.date(2026, 9, 15))
    garden = client.get("/debt-freedom/", headers=auth(USER_A)).json()
    assert garden["debts"][0]["min_logged_this_cycle"] is False
    assert garden["debts"][0]["current_cycle_due_date"] == "2026-10-14"
    assert client.post(f"{path}/undo-minimum", headers=auth(USER_A)).status_code == 409
    # The minimum counted: interest only, no late fee question.
    assert "late_fee" not in [t["kind"] for t in supabase_db.rows("debt_transactions")]
    assert garden["debts"][0]["late_fee_pending_for"] is None


def test_undo_never_shrinks_the_plant(client, supabase_db, clock):
    clock(datetime.date(2026, 9, 10))
    d = seed_card(supabase_db, current_balance=200.0, min_payment=150.0)
    paid = client.post(f"/debt-freedom/{d['id']}/payments", headers=auth(USER_A), json={"minimum": True}).json()
    assert paid["debt"]["growth_step"] == 10                  # 95% paid
    undone = client.post(f"/debt-freedom/{d['id']}/payments/undo-minimum", headers=auth(USER_A)).json()
    assert undone["debt"]["computed_step"] == 9 and undone["debt"]["growth_step"] == 10
    assert undone["debt"]["highest_step"] == 10


@pytest.mark.parametrize("statement,change", [(1120.0, 120.0), (880.0, -120.0)])
def test_checkin_writes_the_adjustment_and_clears_the_prompt(client, supabase_db, clock, statement, change):
    clock(datetime.date(2026, 9, 20))
    d = seed_card(supabase_db, checkin_due_since="2026-09-14", interest_checked_through="2026-09-14")
    res = client.post(f"/debt-freedom/{d['id']}/checkin", headers=auth(USER_A),
                      json={"statement_balance": statement, "min_payment": 60})
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["balance_change"] == change
    assert body["debt"]["current_balance"] == statement and body["debt"]["min_payment"] == 60.0
    assert body["debt"]["checkin_due_since"] is None
    [t] = supabase_db.rows("debt_transactions")
    assert (t["kind"], t["amount"], t["balance_after"]) == ("statement_adjustment", change, statement)
    assert supabase_db.rows("debts")[0]["cycle_start_balance"] == statement


def test_checkin_that_lowers_percent_paid_keeps_the_plant(client, supabase_db, clock):
    clock(datetime.date(2026, 9, 10))
    d = seed_card(supabase_db, current_balance=500.0)
    client.post(f"/debt-freedom/{d['id']}/payments", headers=auth(USER_A), json={"minimum": True})
    res = client.post(f"/debt-freedom/{d['id']}/checkin", headers=auth(USER_A),
                      json={"statement_balance": 1000, "min_payment": 50}).json()
    assert res["debt"]["computed_step"] == 1
    assert res["debt"]["growth_step"] == 6 and res["debt"]["highest_step"] == 6


def test_late_fee_save_and_remember(client, supabase_db, clock):
    clock(datetime.date(2026, 9, 20))
    d = seed_card(supabase_db, late_fee_pending_for="2026-09-14", interest_checked_through="2026-09-14")
    path = f"/debt-freedom/{d['id']}/late-fee"
    assert client.post(path, headers=auth(USER_A), json={"due_date": "2026-08-14", "amount": 30}).status_code == 409
    res = client.post(path, headers=auth(USER_A), json={"due_date": "2026-09-14", "amount": 30, "remember": True})
    assert res.status_code == 200, res.text
    body = res.json()["debt"]
    assert body["current_balance"] == 1030.0 and body["late_fee"] == 30.0
    assert body["late_fee_pending_for"] is None
    [t] = supabase_db.rows("debt_transactions")
    assert (t["kind"], t["amount"], t["occurred_on"]) == ("late_fee", 30.0, "2026-09-14")
    # Answered: a repeat (a double tap) changes nothing.
    assert client.post(path, headers=auth(USER_A), json={"due_date": "2026-09-14", "amount": 30}).status_code == 409
    assert len(supabase_db.rows("debt_transactions")) == 1


def test_late_fee_skip(client, supabase_db, clock):
    clock(datetime.date(2026, 9, 20))
    d = seed_card(supabase_db, late_fee_pending_for="2026-09-14", interest_checked_through="2026-09-14")
    res = client.post(f"/debt-freedom/{d['id']}/late-fee", headers=auth(USER_A),
                      json={"due_date": "2026-09-14", "amount": None})
    assert res.status_code == 200
    assert res.json()["debt"]["late_fee_pending_for"] is None
    assert res.json()["debt"]["current_balance"] == 1000.0 and res.json()["debt"]["late_fee"] is None
    assert supabase_db.rows("debt_transactions") == []


def test_settings_round_trip_and_shorten_the_plan(client, supabase_db, clock):
    clock(datetime.date(2026, 9, 10))
    seed_card(supabase_db, apr=0.0, current_balance=1200.0, min_payment=100.0)
    assert client.get("/debt-freedom/settings", headers=auth(USER_A)).json() == {"monthly_extra": None}
    before = client.get("/debt-freedom/", headers=auth(USER_A)).json()
    assert before["monthly_extra"] is None and before["plan_est_payoff_month"] == "2027-09"
    res = client.put("/debt-freedom/settings", headers=auth(USER_A), json={"monthly_extra": 100})
    assert res.json() == {"monthly_extra": 100.0}
    after = client.get("/debt-freedom/", headers=auth(USER_A)).json()
    assert after["monthly_extra"] == 100.0 and after["plan_est_payoff_month"] == "2027-03"
    # Blank clears it; the row is updated, not duplicated.
    client.put("/debt-freedom/settings", headers=auth(USER_A), json={"monthly_extra": None})
    assert len(supabase_db.rows("debt_freedom_settings")) == 1
    assert client.put("/debt-freedom/settings", headers=auth(USER_A), json={"monthly_extra": -5}).status_code == 400


def test_patch_sets_a_first_due_day_without_back_charging(client, supabase_db, clock):
    clock(datetime.date(2026, 9, 28))
    d = seed_card(supabase_db, due_day=None, cycle_start_balance=None, created_at="2026-01-01T00:00:00+00:00")
    res = client.patch(f"/debt-freedom/{d['id']}", headers=auth(USER_A), json={"due_day": 14})
    assert res.status_code == 200
    assert res.json()["debt"]["due_day"] == 14 and res.json()["debt"]["missing"] == []
    assert supabase_db.rows("debt_transactions") == []
    stored = supabase_db.rows("debts")[0]
    assert stored["interest_checked_through"] == "2026-09-14" and stored["cycle_start_balance"] == 1000.0
