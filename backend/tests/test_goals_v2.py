"""Goals v2 — the rules (goals_v2.py, pure, fixed dates) and the routes behind the
`goals_v2` marker (against the in-memory fake).

What an OLD build sees is proven separately, in test_backcompat_goals_v2.py.
"""

from __future__ import annotations

import datetime
import itertools

import pytest

import goals_v2 as gv
import main
from conftest import USER_A, stamp_year, v2

OCT = datetime.date(2026, 10, 27)
NOV = datetime.date(2026, 11, 3)


def goal_at(month: str, year: int) -> int:
    return gv.target_index({"target_month": month, "target_year": year})


# ══ The default target date ════════════════════════════════════════════════════

@pytest.mark.parametrize("today,expected", [
    (datetime.date(2026, 10, 1), ("January", 2027)),
    (datetime.date(2026, 11, 15), ("February", 2027)),
    (datetime.date(2026, 12, 31), ("March", 2027)),
    (datetime.date(2026, 1, 20), ("April", 2026)),
    (datetime.date(2026, 9, 30), ("December", 2026)),
])
def test_default_target_is_three_months_after_this_one(today, expected):
    assert gv.default_target(today) == expected


def test_the_default_target_makes_four_payments():
    month, year = gv.default_target(OCT)
    assert gv.months_left(OCT, goal_at(month, year), False) == 4


# ══ The monthly minimum ═══════════════════════════════════════════════════════

@pytest.mark.parametrize("target_month,year,logged,expected", [
    ("January", 2027, False, 4),   # Oct, Nov, Dec, Jan — inclusive
    ("January", 2027, True, 3),    # this month's already in: from November
    ("October", 2026, False, 1),   # the target IS this month
    ("October", 2026, True, 1),    # …and already paid: still at least 1
    ("March", 2026, False, 1),     # a target in the past: everything is due now
    ("October", 2027, False, 13),
])
def test_months_left_is_inclusive(target_month, year, logged, expected):
    assert gv.months_left(OCT, goal_at(target_month, year), logged) == expected


@pytest.mark.parametrize("target,saved,logged,expected", [
    (1336.0, 0.0, False, 334),     # the spec's example: $334/month
    (1000.0, 0.0, False, 250),
    (1001.0, 0.0, False, 251),     # rounds UP to the whole dollar
    (1200.0, 0.0, False, 300),     # exact: no float edge pushes it to 301
    (1200.01, 0.0, False, 301),    # one cent over → the next dollar
    (1336.0, 336.0, False, 250),   # what's saved comes off first
    (1000.0, 0.0, True, 334),      # already paid this month: over 3 months, 333.33 → 334
    (500.0, 500.0, False, 0),      # holds its target: nothing left
    (500.0, 650.0, False, 0),
])
def test_monthly_minimum(target, saved, logged, expected):
    assert gv.monthly_minimum(target, saved, OCT, goal_at("January", 2027), logged) == expected


def test_no_target_date_means_no_minimum():
    assert gv.monthly_minimum(1000.0, 0.0, OCT, None) is None


# ══ On pace for ═══════════════════════════════════════════════════════════════

def pace(target, saved, minimum, today, logged, month="January", year=2027):
    return gv.on_pace(target, saved, minimum, today, goal_at(month, year), logged)


def test_a_goal_paid_on_schedule_is_on_track():
    assert pace(1336, 0, 334, OCT, False) == {"month": "January", "year": 2027, "months_early": 0}
    # October's minimum paid: three to go, from November.
    assert pace(1336, 334, 334, OCT, True) == {"month": "January", "year": 2027, "months_early": 0}


def test_extra_payments_move_it_earlier():
    # October's minimum plus a $334 extra: two to go, Nov and Dec.
    assert pace(1336, 668, 334, OCT, True) == {"month": "December", "year": 2026, "months_early": 1}
    assert pace(1336, 1002, 334, OCT, True) == {"month": "November", "year": 2026, "months_early": 2}


def test_a_skipped_month_moves_it_later():
    # October skipped; it is now November with nothing saved: four payments from Nov.
    assert pace(1336, 0, 334, NOV, False) == {"month": "February", "year": 2027, "months_early": -1}
    # Two months skipped.
    assert pace(1336, 0, 334, datetime.date(2026, 12, 2), False)["months_early"] == -2


def test_pace_counts_partial_months_up():
    # $1,000 left at $334 → 3 payments (the last a partial one).
    assert pace(1000, 0, 334, OCT, False)["month"] == "December"


def test_nothing_to_pace_once_the_target_is_held():
    assert pace(1336, 1336, 334, OCT, True) is None
    assert gv.ready_to_complete(1336, 1336) is True
    assert gv.ready_to_complete(1336, 1335) is False


def test_the_minimum_never_moves_when_pace_does():
    """Section 2: extra payments and skipped months move "on pace for", never the
    stored minimum. The minimum is an input to pace, never an output."""
    stored = gv.monthly_minimum(1336, 0, OCT, goal_at("January", 2027))
    for saved in (0, 334, 900):
        assert pace(1336, saved, stored, OCT, False) is not None
    assert stored == 334


# ══ Which row is this month's minimum ═════════════════════════════════════════

def mrow(month, created, kind=gv.KIND_MINIMUM, id=1, type="deposit"):
    return {"id": id, "kind": kind, "type": type, "month": month, "created_at": created, "amount": 334}


def test_last_years_same_month_minimum_is_not_this_months():
    assert gv.minimum_row_this_month([mrow("October", "2025-10-04T09:00:00+00:00")], OCT) is None
    assert gv.minimum_row_this_month([mrow("October", "2026-10-04T09:00:00+00:00")], OCT) is not None


def test_a_minimum_stamped_just_over_the_utc_boundary_still_counts():
    # Logged on Oct 31 in the evening, US time: created_at is Nov 1 UTC.
    assert gv.is_this_month(mrow("October", "2026-11-01T02:00:00+00:00"), OCT)
    assert not gv.is_this_month(mrow("October", "2026-11-05T02:00:00+00:00"), OCT)


def test_only_minimum_deposits_are_the_minimum():
    rows = [mrow("October", "2026-10-04T09:00:00+00:00", kind=None),
            mrow("October", "2026-10-04T09:00:00+00:00", type="withdrawal")]
    assert gv.minimum_row_this_month(rows, OCT) is None


# ══ The automatic minimum ═════════════════════════════════════════════════════

def auto_goal(**over):
    return {"id": 1, "auto_minimum": True, "goal_type": "saving", "monthly_minimum": 334, **over}


def test_auto_minimum_waits_for_income():
    assert gv.auto_minimum_due(auto_goal(), OCT, month_has_income=False) is False
    assert gv.auto_minimum_due(auto_goal(), OCT, month_has_income=True) is True


def test_auto_minimum_is_handled_once_a_month():
    assert gv.auto_minimum_due(auto_goal(auto_minimum_month="2026-10-01"), OCT, True) is False
    assert gv.auto_minimum_due(auto_goal(auto_minimum_month="2026-09-01"), OCT, True) is True


def test_auto_minimum_skips_goals_it_does_not_apply_to():
    for over in ({"auto_minimum": False}, {"locked": True}, {"completed": True},
                 {"is_general": True}, {"is_replant": True}, {"goal_type": "debt"}):
        assert gv.auto_minimum_due(auto_goal(**over), OCT, True) is False, over


# ══ Deleting: what is refunded, what is replanted ═════════════════════════════

def drow(amount, source="income", month="October", created="2026-10-04T09:00:00+00:00",
         type="deposit", **over):
    return {"amount": amount, "source": source, "month": month, "created_at": created, "type": type, **over}


def test_delete_refunds_this_month_and_replants_the_rest():
    rows = [drow(200),                                                    # this month's budget
            drow(100, month="September", created="2026-09-04T09:00:00+00:00"),  # last month's
            drow(300, source="opening"),                                  # money already saved
            drow(50, source="transfer")]                                  # moved in from Replant
    assert gv.delete_split(rows, OCT) == {"held": 650.0, "refunded": 200.0, "to_replant": 450.0}


def test_delete_never_replants_more_than_the_goal_held():
    rows = [drow(200), drow(100, month="September", created="2026-09-04T09:00:00+00:00"),
            drow(250, type="withdrawal")]
    assert gv.delete_split(rows, OCT)["to_replant"] == 0.0
    assert gv.delete_split([drow(100, source="opening"), drow(30, type="withdrawal")], OCT)["to_replant"] == 70.0


def test_last_years_october_money_is_not_this_months_budget():
    rows = [drow(120, created="2025-10-04T09:00:00+00:00")]
    assert gv.delete_split(rows, OCT) == {"held": 120.0, "refunded": 0.0, "to_replant": 120.0}


def test_replant_transfers_are_unwound_within_what_goes_back():
    replant = [{"id": 10, "type": "withdrawal", "transfer_group": "g1", "amount": 80},
               {"id": 11, "type": "withdrawal", "transfer_group": "g2", "amount": 40}]
    goal = [drow(80, source="transfer", transfer_group="g1", created="2026-10-01T00:00:00+00:00"),
            drow(40, source="transfer", transfer_group="g2", created="2026-10-02T00:00:00+00:00")]
    legs, total = gv.replant_unwinds(goal, replant, 120)
    assert sorted(l["id"] for l in legs) == [10, 11] and total == 120
    legs, total = gv.replant_unwinds(goal, replant, 100)   # only the newest fits
    assert [l["id"] for l in legs] == [11] and total == 40


# ══ Routes ════════════════════════════════════════════════════════════════════

V2 = v2(USER_A, "premium, social, limits, goals_v2")
TODAY = OCT.isoformat()


@pytest.fixture
def at_oct(monkeypatch, supabase_db):
    """Server date pinned to OCT, and the fake stamping created_at at that moment —
    as Postgres' now() would — so 'this month's row' means October 2026 here."""
    monkeypatch.setattr(main, "_df_server_today", lambda: OCT)
    ticks = itertools.count(0)
    base = datetime.datetime(2026, 10, 27, 12, 0, tzinfo=datetime.timezone.utc)
    monkeypatch.setattr(supabase_db, "next_timestamp",
                        lambda: (base + datetime.timedelta(seconds=next(ticks))).isoformat())
    return supabase_db


def goals(client, today=TODAY):
    return client.get("/savings/goal/", headers=V2, params={"today": today}).json()["data"]


def one(client, title, today=TODAY):
    return next(g for g in goals(client, today) if g["title"] == title)


def create(client, title="Trip", target=1336.0, month="January", year=2027, **extra):
    res = client.post("/savings/goal/", headers=V2, json={
        "title": title, "target_amount": target, "target_month": month, "target_year": year,
        "goal_type": "saving", "today": TODAY, **extra})
    assert res.status_code == 200, res.text
    return res.json()["data"][0]


def goals_spent(client, month="October"):
    return client.get(f"/dashboard/{month}", headers=V2, params={"today": TODAY}).json()["expenses"]["goals"]


def add_income(db, amount=2000.0, month="October"):
    db.seed("income", {"user_id": USER_A, "amount": amount, "day": 1, "month": month})


def minimum_rows(db, goal_id):
    return [r for r in db.rows("savings_transactions") if r.get("goal_id") == goal_id and r.get("kind") == "minimum"]


# ── creation ──────────────────────────────────────────────────────────────────

def test_create_stores_the_minimum(client, at_oct):
    goal = create(client)
    assert goal["monthly_minimum"] == 334
    card = one(client, "Trip")
    assert card["minimum_amount"] == 334 and card["minimum_logged"] is False
    assert card["on_pace"] == {"month": "January", "year": 2027, "months_early": 0}


def test_create_defaults_the_target_to_three_months_out(client, at_oct):
    res = client.post("/savings/goal/", headers=V2, json={"title": "Trip", "target_amount": 900.0, "today": TODAY})
    goal = res.json()["data"][0]
    assert (goal["target_month"], goal["target_year"]) == ("January", 2027)
    assert goal["monthly_minimum"] == 225


@pytest.mark.parametrize("body,detail", [
    ({"saved_amount": 1336.0, "saved_source": "opening"}, main.SAVED_REACHES_TARGET_DETAIL),
    ({"saved_amount": 2000.0, "saved_source": "opening"}, main.SAVED_REACHES_TARGET_DETAIL),
    ({"saved_amount": -5.0}, main.SAVED_NEGATIVE_DETAIL),
    ({"saved_amount": 100.0}, main.SAVED_SOURCE_DETAIL),
    ({"target_month": "September", "target_year": 2026}, main.TARGET_IN_PAST_DETAIL),
])
def test_create_refuses_kindly_and_writes_nothing(client, at_oct, body, detail):
    res = client.post("/savings/goal/", headers=V2, json={
        "title": "Trip", "target_amount": 1336.0, "target_month": "January", "target_year": 2027,
        "today": TODAY, **body})
    assert res.status_code == 400 and res.json()["detail"] == detail
    assert not [g for g in at_oct.rows("savings_goals") if g["title"] == "Trip"]


def test_saved_up_from_this_months_budget_counts_against_it(client, at_oct):
    add_income(at_oct)
    goal = create(client, saved_amount=336.0, saved_source="income")
    assert goal["monthly_minimum"] == 250        # (1336 − 336) / 4
    assert goals_spent(client) == 336.0


def test_saved_up_from_money_already_saved_does_not(client, at_oct):
    add_income(at_oct)
    create(client, saved_amount=336.0, saved_source="opening")
    assert goals_spent(client) == 0
    assert one(client, "Trip")["allocated_amount"] == 336.0


def test_the_saved_up_deposit_is_refused_in_a_closed_month(client, at_oct):
    at_oct.seed("month_status", {"user_id": USER_A, "month": "October",
                                 "closed_at": "2026-10-26T00:00:00+00:00", "year": stamp_year("October")})
    res = client.post("/savings/goal/", headers=V2, json={
        "title": "Trip", "target_amount": 1336.0, "saved_amount": 10.0, "saved_source": "income", "today": TODAY})
    assert res.status_code == 409 and "is closed" in res.json()["detail"]
    assert not [g for g in at_oct.rows("savings_goals") if g["title"] == "Trip"]


# ── the stored minimum ────────────────────────────────────────────────────────

def test_an_existing_goal_gets_its_minimum_once_on_first_load(client, at_oct):
    old = at_oct.seed("savings_goals", {"user_id": USER_A, "title": "Roof", "target_amount": 1000.0,
                                        "target_month": "January", "target_year": 2027})
    at_oct.seed("savings_transactions", {"user_id": USER_A, "title": "Roof", "amount": 200.0, "type": "deposit",
                                         "goal_id": old["id"], "source": "income", "day": 1, "month": "September",
                                         "created_at": "2026-09-01T00:00:00+00:00"})
    assert one(client, "Roof")["monthly_minimum"] == 200      # (1000 − 200) / 4
    stored = next(g for g in at_oct.rows("savings_goals") if g["id"] == old["id"])
    assert stored["monthly_minimum"] == 200
    # A later read with more money in does not recompute it.
    at_oct.seed("savings_transactions", {"user_id": USER_A, "title": "Roof", "amount": 500.0, "type": "deposit",
                                         "goal_id": old["id"], "source": "opening", "day": 2, "month": "October"})
    assert one(client, "Roof")["monthly_minimum"] == 200


def test_an_extra_payment_never_changes_the_minimum_but_moves_pace(client, at_oct):
    goal = create(client)
    res = client.post(f"/savings/goal/{goal['id']}/extra", headers=V2,
                      json={"amount": 334.0, "source": "opening", "today": TODAY})
    assert res.status_code == 200, res.text
    card = one(client, "Trip")
    assert card["monthly_minimum"] == 334
    assert card["on_pace"]["months_early"] == 1


def test_editing_the_target_recomputes_from_what_is_saved_now(client, at_oct):
    goal = create(client)
    client.post(f"/savings/goal/{goal['id']}/extra", headers=V2, json={"amount": 300.0, "source": "opening", "today": TODAY})
    res = client.patch(f"/savings/goal/{goal['id']}", headers=V2, json={"target_amount": 2000.0, "today": TODAY})
    assert res.json()["data"][0]["monthly_minimum"] == 425     # (2000 − 300) / 4


def test_editing_after_this_months_minimum_counts_from_next_month(client, at_oct):
    goal = create(client)
    client.post(f"/savings/goal/{goal['id']}/minimum", headers=V2, json={"today": TODAY})
    res = client.patch(f"/savings/goal/{goal['id']}", headers=V2, json={"target_month": "April", "today": TODAY})
    # (1336 − 334) over Nov–Apr (6 months) = 167
    assert res.json()["data"][0]["monthly_minimum"] == 167


def test_editing_only_the_title_leaves_the_minimum(client, at_oct):
    goal = create(client)
    at_oct.seed("savings_transactions", {"user_id": USER_A, "title": "Trip", "amount": 900.0, "type": "deposit",
                                         "goal_id": goal["id"], "source": "opening", "day": 2, "month": "October"})
    res = client.patch(f"/savings/goal/{goal['id']}", headers=V2, json={"title": "Big trip", "today": TODAY})
    assert res.json()["data"][0]["monthly_minimum"] == 334


def test_editing_a_target_date_into_the_past_is_refused(client, at_oct):
    goal = create(client)
    res = client.patch(f"/savings/goal/{goal['id']}", headers=V2,
                       json={"target_month": "August", "target_year": 2026, "today": TODAY})
    assert res.status_code == 400 and res.json()["detail"] == main.TARGET_IN_PAST_DETAIL


# ── the toggle ────────────────────────────────────────────────────────────────

def test_the_toggle_logs_one_budget_deposit_for_this_month(client, at_oct):
    add_income(at_oct)
    goal = create(client)
    res = client.post(f"/savings/goal/{goal['id']}/minimum", headers=V2, json={"today": TODAY})
    assert res.status_code == 200, res.text
    assert res.json()["goal"]["minimum_logged"] is True
    rows = minimum_rows(at_oct, goal["id"])
    assert [(r["amount"], r["source"], r["month"]) for r in rows] == [(334, "income", "October")]
    assert goals_spent(client) == 334
    again = client.post(f"/savings/goal/{goal['id']}/minimum", headers=V2, json={"today": TODAY})
    assert again.status_code == 409


def test_toggling_any_number_of_times_leaves_at_most_one_row_and_no_clutter(client, at_oct):
    goal = create(client)
    for _ in range(4):
        assert client.post(f"/savings/goal/{goal['id']}/minimum", headers=V2, json={"today": TODAY}).status_code == 200
        assert client.post(f"/savings/goal/{goal['id']}/minimum/undo", headers=V2, json={"today": TODAY}).status_code == 200
    assert minimum_rows(at_oct, goal["id"]) == []
    assert not [r for r in at_oct.rows("savings_transactions") if r.get("goal_id") == goal["id"]]
    client.post(f"/savings/goal/{goal['id']}/minimum", headers=V2, json={"today": TODAY})
    assert len(minimum_rows(at_oct, goal["id"])) == 1


def test_the_last_minimum_never_overshoots_the_target(client, at_oct):
    goal = create(client, target=1000.0, month="October", year=2026)   # due this month: 1000
    client.post(f"/savings/goal/{goal['id']}/extra", headers=V2, json={"amount": 900.0, "source": "opening", "today": TODAY})
    client.post(f"/savings/goal/{goal['id']}/minimum", headers=V2, json={"today": TODAY})
    assert [r["amount"] for r in minimum_rows(at_oct, goal["id"])] == [100.0]
    assert one(client, "Trip")["ready_to_complete"] is True


def test_the_toggle_is_refused_in_a_closed_month(client, at_oct):
    goal = create(client)
    at_oct.seed("month_status", {"user_id": USER_A, "month": "October",
                                 "closed_at": "2026-10-26T00:00:00+00:00", "year": stamp_year("October")})
    res = client.post(f"/savings/goal/{goal['id']}/minimum", headers=V2, json={"today": TODAY})
    assert res.status_code == 409 and "is closed" in res.json()["detail"]
    assert minimum_rows(at_oct, goal["id"]) == []


def test_the_toggle_is_refused_on_a_locked_goal(client, at_oct, premium_on):
    create(client, title="First")
    second = at_oct.seed("savings_goals", {"user_id": USER_A, "title": "Second", "target_amount": 500.0,
                                           "target_month": "March", "target_year": 2027})
    for path in ("minimum", "minimum/undo"):
        res = client.post(f"/savings/goal/{second['id']}/{path}", headers=V2, json={"today": TODAY})
        assert res.status_code == 403 and res.json()["code"] == "goal_locked"
    res = client.post(f"/savings/goal/{second['id']}/extra", headers=V2, json={"amount": 5.0, "today": TODAY})
    assert res.status_code == 403


def test_last_octobers_minimum_does_not_switch_this_octobers_toggle_on(client, at_oct):
    goal = create(client)
    at_oct.seed("savings_transactions", {"user_id": USER_A, "title": "Trip", "amount": 334.0, "type": "deposit",
                                         "goal_id": goal["id"], "source": "income", "kind": "minimum", "day": 3,
                                         "month": "October", "created_at": "2025-10-03T09:00:00+00:00"})
    assert one(client, "Trip")["minimum_logged"] is False
    assert client.post(f"/savings/goal/{goal['id']}/minimum/undo", headers=V2, json={"today": TODAY}).status_code == 409


# ── the automatic minimum ─────────────────────────────────────────────────────

def test_the_automatic_minimum_waits_for_income_then_lands_once(client, at_oct):
    goal = create(client, auto_minimum=True)
    one(client, "Trip")
    assert minimum_rows(at_oct, goal["id"]) == []          # no income yet: the split is not overspent
    add_income(at_oct)
    assert one(client, "Trip")["minimum_logged"] is True
    one(client, "Trip")
    assert len(minimum_rows(at_oct, goal["id"])) == 1       # repeated loads add it once


def test_an_auto_minimum_toggled_off_stays_off_this_month(client, at_oct):
    add_income(at_oct)
    goal = create(client, auto_minimum=True)
    one(client, "Trip")
    client.post(f"/savings/goal/{goal['id']}/minimum/undo", headers=V2, json={"today": TODAY})
    assert one(client, "Trip")["minimum_logged"] is False
    assert minimum_rows(at_oct, goal["id"]) == []
    # …and next month it is added again.
    at_oct.seed("income", {"user_id": USER_A, "amount": 2000.0, "day": 1, "month": "November"})
    nov = datetime.date(2026, 11, 2)
    main_today = main._df_server_today
    try:
        main._df_server_today = lambda: nov
        client.get("/savings/goal/", headers=V2, params={"today": nov.isoformat()})
    finally:
        main._df_server_today = main_today
    assert [r["month"] for r in minimum_rows(at_oct, goal["id"])] == ["November"]


def test_the_automatic_switch_is_set_by_patch(client, at_oct):
    add_income(at_oct)
    goal = create(client)
    client.patch(f"/savings/goal/{goal['id']}", headers=V2, json={"auto_minimum": True, "today": TODAY})
    assert one(client, "Trip")["auto_minimum"] is True
    assert len(minimum_rows(at_oct, goal["id"])) == 1


# ── extra payments ────────────────────────────────────────────────────────────

def test_extra_from_the_budget_counts_and_from_savings_does_not(client, at_oct):
    add_income(at_oct)
    goal = create(client)
    client.post(f"/savings/goal/{goal['id']}/extra", headers=V2, json={"amount": 40.0, "source": "income", "today": TODAY})
    client.post(f"/savings/goal/{goal['id']}/extra", headers=V2, json={"amount": 60.0, "source": "opening", "today": TODAY})
    assert goals_spent(client) == 40.0
    assert one(client, "Trip")["allocated_amount"] == 100.0


@pytest.mark.parametrize("body", [{"amount": 0}, {"amount": -3}, {"amount": 5, "source": "rollover"}])
def test_extra_refuses_bad_input(client, at_oct, body):
    goal = create(client)
    assert client.post(f"/savings/goal/{goal['id']}/extra", headers=V2, json={"today": TODAY, **body}).status_code == 400


# ── Ready to Replant: the one-time move ───────────────────────────────────────

def general_with(db, amount):
    general = db.seed("savings_goals", {"user_id": USER_A, "title": "General Savings", "is_general": True,
                                        "target_amount": None})
    db.seed("savings_transactions", {"user_id": USER_A, "title": "Starting balance", "amount": amount,
                                     "type": "deposit", "goal_id": general["id"], "source": "opening",
                                     "day": 1, "month": "May"})
    return general


def replant_of(client):
    return next(g for g in goals(client) if g.get("is_replant"))


def test_first_load_moves_general_savings_into_replant_once(client, at_oct):
    general_with(at_oct, 640.0)
    assert replant_of(client)["allocated_amount"] == 640.0
    assert main._goal_balance(USER_A, next(g["id"] for g in at_oct.rows("savings_goals") if g["is_general"])) == 0
    # A month-end rollover later goes to General Savings, never to Replant…
    general = next(g for g in at_oct.rows("savings_goals") if g["is_general"])
    at_oct.seed("savings_transactions", {"user_id": USER_A, "title": "Rollover — October", "amount": 90.0,
                                         "type": "deposit", "goal_id": general["id"], "source": "rollover",
                                         "day": 31, "month": "October"})
    # …and the move never runs again.
    assert replant_of(client)["allocated_amount"] == 640.0
    seeds = [r for r in at_oct.rows("savings_transactions") if r.get("kind") == "replant_seed"]
    assert sorted(r["type"] for r in seeds) == ["deposit", "withdrawal"]


def test_a_user_with_nothing_in_general_savings_gets_an_empty_container(client, at_oct):
    general_with(at_oct, 0.01)
    assert len([g for g in goals(client) if g.get("is_replant")]) == 1
    assert len([g for g in at_oct.rows("savings_goals") if g.get("is_replant")]) == 1


def test_concurrent_first_loads_create_one_container_and_move_once(client, at_oct, monkeypatch):
    """Two first loads overlap: both see no Ready to Replant, both try to create it.
    The unique index lets one win; the loser reads the winner's row and its stored
    amount. Then both try the move; the second insert fails whole."""
    general_with(at_oct, 300.0)
    main._ensure_replant(USER_A, OCT)                     # request 1 completes
    # Request 2 read "no Ready to Replant" before request 1 committed: its first look
    # finds nothing, so it tries to create one of its own.
    real = main._replant_goal
    first_look = iter([None])
    monkeypatch.setattr(main, "_replant_goal", lambda uid: next(first_look, real(uid)))
    main._ensure_replant(USER_A, OCT)
    assert len([g for g in at_oct.rows("savings_goals") if g.get("is_replant")]) == 1
    assert len([r for r in at_oct.rows("savings_transactions") if r.get("kind") == "replant_seed"]) == 2


def test_a_move_that_died_halfway_is_finished_by_the_next_read(client, at_oct, monkeypatch):
    general_with(at_oct, 300.0)
    real = main._finish_replant_seed
    monkeypatch.setattr(main, "_finish_replant_seed", lambda *a: None)   # the request dies here
    main._ensure_replant(USER_A, OCT)
    assert not [r for r in at_oct.rows("savings_transactions") if r.get("kind") == "replant_seed"]
    monkeypatch.setattr(main, "_finish_replant_seed", real)
    assert replant_of(client)["allocated_amount"] == 300.0


def test_ready_to_replant_is_outside_the_free_cap(client, at_oct, premium_on):
    general_with(at_oct, 50.0)
    create(client, title="First")
    listed = goals(client)
    assert not any(g["locked"] for g in listed)
    assert client.get("/me/entitlements/", headers=V2).json()["goals_used"] == 1


@pytest.mark.parametrize("method,path", [
    ("PATCH", "/savings/goal/{id}"), ("POST", "/savings/goal/{id}/finish"),
    ("DELETE", "/savings/goal/{id}"), ("POST", "/savings/goal/{id}/extra"),
    ("POST", "/savings/goal/{id}/minimum"),
])
def test_ready_to_replant_is_never_edited_completed_deleted_or_funded(client, at_oct, method, path):
    general_with(at_oct, 50.0)
    rid = replant_of(client)["id"]
    body = {"title": "x", "day": 27, "month": "October", "amount": 5, "today": TODAY}
    res = client.request(method, path.format(id=rid), headers=V2, json=body,
                         params={"current_month": "October", "today": TODAY})
    assert res.status_code in (400, 409), (path, res.status_code)
    assert replant_of(client)["allocated_amount"] == 50.0


# ── Ready to Replant: planting ────────────────────────────────────────────────

def test_planting_is_a_transfer_in_one_history_entry(client, at_oct):
    add_income(at_oct)
    general_with(at_oct, 200.0)
    goal = create(client)
    res = client.post("/savings/replant/", headers=V2, json={"to_goal_id": goal["id"], "amount": 120.0, "today": TODAY})
    assert res.status_code == 200, res.text
    assert replant_of(client)["allocated_amount"] == 80.0
    assert one(client, "Trip")["allocated_amount"] == 120.0
    assert goals_spent(client) == 0
    history = client.get("/savings/history/", headers=V2).json()["data"]
    planted = [h for h in history if h["title"].startswith("Planted from Ready to Replant into ")]
    assert len(planted) == 1 and planted[0]["is_transfer"] and planted[0]["deletable"]


def test_planting_more_than_replant_holds_is_refused(client, at_oct):
    general_with(at_oct, 50.0)
    goal = create(client)
    res = client.post("/savings/replant/", headers=V2, json={"to_goal_id": goal["id"], "amount": 60.0, "today": TODAY})
    assert res.status_code == 409


# ── deleting a goal ───────────────────────────────────────────────────────────

def test_delete_refunds_this_month_and_replants_everything_else(client, at_oct):
    add_income(at_oct)
    general_with(at_oct, 100.0)
    goal = create(client, saved_amount=300.0, saved_source="opening")
    client.post(f"/savings/goal/{goal['id']}/minimum", headers=V2, json={"today": TODAY})   # 259 this month
    at_oct.seed("savings_transactions", {"user_id": USER_A, "title": "Trip", "amount": 50.0, "type": "deposit",
                                         "goal_id": goal["id"], "source": "income", "day": 9, "month": "September",
                                         "created_at": "2026-09-09T00:00:00+00:00"})
    client.post("/savings/replant/", headers=V2, json={"to_goal_id": goal["id"], "amount": 40.0, "today": TODAY})
    res = client.delete(f"/savings/goal/{goal['id']}", headers=V2,
                        params={"current_month": "October", "today": TODAY})
    assert res.status_code == 200, res.text
    assert res.json()["replanted"] == 390.0              # 300 opening + 50 September + 40 from Replant
    assert goals_spent(client) == 0                      # this month's minimum refunded
    # 100 moved in, −40 planted then unwound (+40), +350 returned = 450.
    assert replant_of(client)["allocated_amount"] == 450.0
    # The "planted" entry was unwound, not left behind to be deleted a second time.
    titles = [h["title"] for h in client.get("/savings/history/", headers=V2).json()["data"]]
    assert not any(t.startswith("Planted from") for t in titles)


# ── history ───────────────────────────────────────────────────────────────────

def test_history_hides_general_savings_and_protects_the_move(client, at_oct):
    general = general_with(at_oct, 200.0)
    at_oct.seed("savings_transactions", {"user_id": USER_A, "title": "Rollover — September", "amount": 30.0,
                                         "type": "deposit", "goal_id": general["id"], "source": "rollover",
                                         "day": 28, "month": "September"})
    goals(client)
    history = client.get("/savings/history/", headers=V2).json()["data"]
    assert [h["title"] for h in history] == ["Moved to Ready to Replant"]
    assert history[0]["deletable"] is False
    res = client.delete(f"/savings/transaction/{history[0]['id']}", headers=V2)
    assert res.status_code == 409 and res.json()["detail"] == main.HISTORY_UNDELETABLE_DETAIL


# ── home progress ─────────────────────────────────────────────────────────────

def test_home_progress_counts_goals_only_and_adds_kept_under_budget(client, at_oct):
    general = general_with(at_oct, 500.0)
    at_oct.seed("savings_transactions", {"user_id": USER_A, "title": "Rollover — September", "amount": 120.0,
                                         "type": "deposit", "goal_id": general["id"], "source": "rollover",
                                         "day": 28, "month": "September", "created_at": "2026-10-01T09:00:00+00:00"})
    goal = create(client, saved_amount=200.0, saved_source="opening")
    client.post("/savings/replant/", headers=V2, json={"to_goal_id": goal["id"], "amount": 100.0, "today": TODAY})
    block = client.get("/home/progress/", headers=V2, params={"today": TODAY}).json()["goals"]
    assert block["total_saved"] == 300.0                 # the goal only; GS and Replant left out
    assert block["kept_under_budget"] == 120.0
    assert block["kept_under_budget_series"] == [{"month": "2026-09", "amount": 120.0},
                                                 {"month": "2026-10", "amount": 0.0}]


# ── the form's budget context ─────────────────────────────────────────────────

def test_budget_context(client, at_oct):
    add_income(at_oct, 2000.0)
    create(client)
    at_oct.seed("debts", {"user_id": USER_A, "name": "Visa", "original_balance": 900, "current_balance": 800,
                          "min_payment": 45.0, "apr": 20, "due_day": 14})
    at_oct.seed("debts", {"user_id": USER_A, "name": "Done", "original_balance": 100, "current_balance": 0,
                          "min_payment": 25.0, "apr": 0, "due_day": 3, "status": "paid_off"})
    body = client.get("/savings/goal/budget-context/", headers=V2, params={"today": TODAY}).json()
    assert body == {"has_income": True, "goals_budget": 400.0, "goal_minimums": 334.0, "debt_minimums": 45.0}
