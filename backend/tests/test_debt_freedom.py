"""Debt Freedom — the snowball rules (debt_freedom.py) and the /debt-freedom/ routes.

The pure rules are tested with plain dicts and a fixed `today`, so nothing here
depends on the calendar. The route tests run against the in-memory fake.
"""

from __future__ import annotations

import datetime

import pytest

import debt_freedom as df
from conftest import USER_A, auth

TODAY = datetime.date(2026, 9, 28)


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
    # 1000 at 12% APR: 1% a month. Paying 510/mo: Oct 1010-510=500, Nov 505 -> 0.
    rows = df.order_debts([debt(1, 1000, minimum=510, apr=12)])
    sim = df.simulate(rows, TODAY)
    assert sim["months"][1] == "2026-11"
    assert sim["interest"][1] == pytest.approx(15.0)


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


# ── missed payment ───────────────────────────────────────────────────────────

def test_missed_payment_charges_one_month_of_interest():
    d = debt(1, 1200, apr=12, due_day=14, created_at="2026-08-20T10:00:00+00:00")
    charges, checked = df.missed_payment_charges(d, [], TODAY)
    # Only Sep 14 is after creation and before today.
    assert charges == [{"occurred_on": datetime.date(2026, 9, 14), "amount": 12.0, "balance_after": 1212.0}]
    assert checked == datetime.date(2026, 9, 14)


def test_a_minimum_in_the_cycle_prevents_the_charge():
    d = debt(1, 1200, apr=12, due_day=14, created_at="2026-08-20T10:00:00+00:00")
    charges, checked = df.missed_payment_charges(d, [pay(1, "2026-08-30")], TODAY)
    assert charges == []
    assert checked == datetime.date(2026, 9, 14)


def test_an_extra_payment_alone_does_not_count_as_the_minimum():
    d = debt(1, 1200, apr=12, due_day=14, created_at="2026-08-20T10:00:00+00:00")
    charges, _ = df.missed_payment_charges(d, [pay(1, "2026-09-01", kind=df.KIND_EXTRA)], TODAY)
    assert len(charges) == 1


def test_each_cycle_needs_its_own_minimum():
    d = debt(1, 1200, apr=12, due_day=14, created_at="2026-07-01T00:00:00+00:00")
    # Jul 20 falls in the (Jul 14, Aug 14] cycle only: Jul 14 and Sep 14 are missed.
    charges, _ = df.missed_payment_charges(d, [pay(1, "2026-07-20")], TODAY)
    assert [c["occurred_on"] for c in charges] == [datetime.date(2026, 7, 14), datetime.date(2026, 9, 14)]


def test_several_missed_cycles_compound():
    d = debt(1, 1000, apr=12, due_day=5, created_at="2026-06-10T00:00:00+00:00")
    charges, checked = df.missed_payment_charges(d, [], TODAY)
    assert [c["occurred_on"] for c in charges] == [
        datetime.date(2026, 7, 5), datetime.date(2026, 8, 5), datetime.date(2026, 9, 5)]
    assert [c["amount"] for c in charges] == [10.0, 10.1, 10.2]
    assert charges[-1]["balance_after"] == 1030.3
    assert checked == datetime.date(2026, 9, 5)


def test_checked_through_stops_a_cycle_being_charged_twice():
    d = debt(1, 1000, apr=12, due_day=5, created_at="2026-06-10T00:00:00+00:00", checked="2026-09-05")
    assert df.missed_payment_charges(d, [], TODAY) == ([], None)


def test_due_today_is_not_yet_missed():
    d = debt(1, 1000, apr=12, due_day=28, created_at="2026-09-01T00:00:00+00:00")
    assert df.missed_payment_charges(d, [], TODAY) == ([], None)


def test_no_due_day_zero_balance_or_paid_off_is_never_charged():
    created = "2026-01-01T00:00:00+00:00"
    assert df.missed_payment_charges(debt(1, 1000, apr=12, created_at=created), [], TODAY) == ([], None)
    charges, _ = df.missed_payment_charges(debt(1, 0, apr=12, due_day=5, created_at=created), [], TODAY)
    assert charges == []
    assert df.missed_payment_charges(
        debt(1, 0, apr=12, due_day=5, status="paid_off", created_at=created), [], TODAY) == ([], None)


def test_short_months_clamp_the_due_day():
    d = debt(1, 1000, apr=12, due_day=31, created_at="2026-02-01T00:00:00+00:00", checked="2026-01-31")
    charges, _ = df.missed_payment_charges(d, [], datetime.date(2026, 3, 1))
    assert [c["occurred_on"] for c in charges] == [datetime.date(2026, 2, 28)]


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
       "min_payment": 150, "apr": 24.99}


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


def test_create_requires_the_five_fields(client):
    body = dict(NEW)
    del body["apr"]
    assert client.post("/debt-freedom/", headers=auth(USER_A), json=body).status_code == 422


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
    # A non-balance edit writes none, and null clears an optional field.
    client.patch(f"/debt-freedom/{d['id']}", headers=auth(USER_A), json={"due_day": 3})
    res = client.patch(f"/debt-freedom/{d['id']}", headers=auth(USER_A), json={"due_day": None, "name": "Visa"})
    assert res.json()["debt"]["due_day"] is None and res.json()["debt"]["name"] == "Visa"
    assert len(supabase_db.rows("debt_transactions")) == 1


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


def test_garden_applies_missed_payment_interest_once(client, supabase_db):
    supabase_db.seed("debts", {"user_id": USER_A, "name": "Card", "original_balance": 1000.0,
                               "current_balance": 1000.0, "min_payment": 50.0, "apr": 12.0,
                               "due_day": 1, "created_at": "2025-01-01T00:00:00+00:00",
                               "interest_checked_through": None})
    today = datetime.date.today()
    first = client.get("/debt-freedom/", headers=auth(USER_A)).json()
    interest = [t for t in supabase_db.rows("debt_transactions") if t["kind"] == "interest"]
    assert interest, "a due date has certainly passed since 2025-01-01"
    assert first["debts"][0]["current_balance"] == interest[-1]["balance_after"]
    assert first["debts"][0]["interest_checked_through"] <= today.isoformat()

    again = client.get("/debt-freedom/", headers=auth(USER_A)).json()
    assert len([t for t in supabase_db.rows("debt_transactions") if t["kind"] == "interest"]) == len(interest)
    assert again["debts"][0]["current_balance"] == first["debts"][0]["current_balance"]
