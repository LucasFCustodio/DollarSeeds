"""The onboarding's two new routes (ONBOARDING_REWORK.md §3, §6).

POST /onboarding/preview/ — public and stateless. Proved here: it needs no token,
reads and writes nothing, refuses anything outside tight bounds, and returns the SAME
numbers the existing code computes for the same inputs — the dashboard's split, the
minimum and "on pace for" a goals_v2 goal is created with, and the payoff date the
debt garden projects.

POST /debt-freedom/first-debt/ — one free debt. Proved here: a free user gets one
only while `debts` holds no row of theirs (any status), the server enforces it (even
against two overlapping calls), an APR can be left out (apr = 0 + apr_missing), any
later PATCH that sends an APR clears the flag, and the debt is then read-only for
the free user — the existing `read_only` allowance.
"""

from __future__ import annotations

import datetime

import pytest

import main
from conftest import USER_A, USER_B, auth, v2

TODAY = datetime.date(2026, 10, 27)
MONTH = "October"
APP = v2(USER_A, "premium, social, limits, goals_v2")
FUTURE = "2099-01-01T00:00:00+00:00"


@pytest.fixture(autouse=True)
def on_today(monkeypatch):
    monkeypatch.setattr(main, "_df_server_today", lambda: TODAY)


def subscribe(db, user_id: str = USER_A):
    db.seed("subscriptions", {"user_id": user_id, "store": "app_store", "environment": "production",
                              "store_txn_id": f"txn-{user_id[:4]}",
                              "product_id": "com.dollarseeds.premium.monthly", "expires_at": FUTURE})


def preview(client, body: dict, headers=None):
    return client.post("/onboarding/preview/", json={"today": TODAY.isoformat(), **body},
                       headers=headers or {})


GOAL = {"target_amount": 1200, "saved_amount": 100, "target_month": "March", "target_year": 2027}
DEBT = {"amount_owed": 2400, "min_payment": 100, "apr": 22.9}


# ══ Preview: public and stateless ═════════════════════════════════════════════

def test_preview_needs_no_token(client):
    res = preview(client, {"income": 3000})
    assert res.status_code == 200, res.text


def test_preview_reads_and_writes_nothing(client, supabase_db):
    res = preview(client, {"income": 3000, "tithe_rate": 0.1, "goal": GOAL, "debt": DEBT},
                  headers=auth(USER_A))
    assert res.status_code == 200, res.text
    assert supabase_db.selects == []
    assert all(not rows for rows in supabase_db.tables.values())


@pytest.mark.parametrize("body", [
    {"income": -1},
    {"income": 1e12},
    {"income": 3000, "tithe_rate": 0},
    {"income": 3000, "tithe_rate": 1.5},
    {"income": 3000, "note": "hello"},                                    # unknown field
    {"income": 3000, "goal": {**GOAL, "target_amount": 0}},
    {"income": 3000, "goal": {**GOAL, "saved_amount": -5}},
    {"income": 3000, "goal": {**GOAL, "title": "Car"}},                   # no free text
    {"income": 3000, "debt": {**DEBT, "amount_owed": 0}},
    {"income": 3000, "debt": {**DEBT, "apr": 5000}},
    {"income": 3000, "debt": {**DEBT, "name": "Visa"}},
])
def test_preview_refuses_out_of_bounds_input(client, body):
    assert preview(client, body).status_code == 422


@pytest.mark.parametrize("goal", [
    {**GOAL, "target_month": "Smarch"},
    {**GOAL, "target_month": "September", "target_year": 2026},          # before this month
    {**GOAL, "target_year": 2200},
    {**GOAL, "saved_amount": 1200},                                       # already done
])
def test_preview_refuses_an_impossible_goal(client, goal):
    assert preview(client, {"income": 3000, "goal": goal}).status_code == 400


# ══ Preview: the same numbers as the existing code ════════════════════════════

@pytest.mark.parametrize("rate", [None, 0.10, 0.125])
def test_split_matches_the_dashboard(client, supabase_db, rate):
    supabase_db.seed("user_settings", {"user_id": USER_A, "tithe_enabled": rate is not None,
                                       "tithe_rate": rate or 0.10, "budget_type": "balanced"})
    supabase_db.seed("income", {"user_id": USER_A, "amount": 3333.33, "day": 3, "month": MONTH})
    dash = client.get(f"/dashboard/{MONTH}", headers=APP).json()

    split = preview(client, {"income": 3333.33, "tithe_rate": rate}).json()["split"]
    assert split["budget_type"] == "balanced"
    assert split["tithe"]["enabled"] == dash["tithe"]["enabled"]
    assert split["tithe"]["amount"] == round(dash["tithe"]["amount"], 2)
    for key in ("needs", "wants", "goals"):
        assert split[key] == round(dash["budgets"][key], 2)


def test_goal_matches_what_creating_it_stores(client, supabase_db):
    res = client.post("/savings/goal/", headers=APP, json={
        "title": "Car", "target_amount": GOAL["target_amount"], "target_month": GOAL["target_month"],
        "target_year": GOAL["target_year"], "saved_amount": GOAL["saved_amount"],
        "saved_source": "opening", "today": TODAY.isoformat()})
    assert res.status_code == 200, res.text
    listed = client.get("/savings/goal/", headers=APP, params={"today": TODAY.isoformat()}).json()["data"]
    car = next(g for g in listed if g["title"] == "Car")

    got = preview(client, {"income": 3000, "goal": GOAL}).json()["goal"]
    assert got["minimum"] == car["monthly_minimum"] == 184      # ceil(1100 / 6): Oct → Mar
    assert got["on_pace"] == car["on_pace"]
    assert got["share"] == round(184 / 600, 4)                  # Goals = 20% of 3000


def test_goal_share_is_null_without_income(client):
    assert preview(client, {"income": 0, "goal": GOAL}).json()["goal"]["share"] is None


def test_debt_matches_the_garden_projection(client, supabase_db):
    # Created today, so no passed cycle is closed before the projection runs (the
    # fake would otherwise stamp created_at in January and charge nine months).
    supabase_db.seed("debts", {"user_id": USER_A, "name": "Visa", "original_balance": DEBT["amount_owed"],
                               "current_balance": DEBT["amount_owed"], "min_payment": DEBT["min_payment"],
                               "apr": DEBT["apr"], "due_day": 14, "cycle_start_balance": DEBT["amount_owed"],
                               "created_at": f"{TODAY.isoformat()}T09:00:00+00:00"})
    created = client.get("/debt-freedom/", headers=APP, params={"today": TODAY.isoformat()}).json()["debts"][0]

    got = preview(client, {"income": 3000, "debt": DEBT}).json()["debt"]
    assert got["payoff_month"] == created["est_payoff_month"]
    assert got["payoff_month"] is not None
    assert got["covers_interest"] is True
    assert got["before_interest"] is False


def test_a_minimum_below_the_interest_has_no_date(client):
    got = preview(client, {"income": 3000, "debt": {"amount_owed": 10000, "min_payment": 100,
                                                    "apr": 30}}).json()["debt"]
    assert got["covers_interest"] is False
    assert got["payoff_month"] is None


def test_a_skipped_apr_is_projected_before_interest(client):
    got = preview(client, {"income": 3000, "debt": {"amount_owed": 1000, "min_payment": 100}}).json()["debt"]
    assert got["before_interest"] is True
    assert got["monthly_interest"] == 0
    assert got["payoff_month"] == "2027-08"     # 10 payments, November → August


# ══ First debt ════════════════════════════════════════════════════════════════

FIRST = {"name": "Visa", "debt_type": "credit_card", "amount_owed": 1800, "min_payment": 60,
         "due_day": 12, "today": TODAY.isoformat()}


def debts_of(db, user_id=USER_A):
    return [r for r in db.tables.get("debts", []) if r["user_id"] == user_id]


def test_a_free_user_plants_one_debt_without_an_apr(client, premium_on):
    res = client.post("/debt-freedom/first-debt/", headers=APP, json=FIRST)
    assert res.status_code == 200, res.text
    debt = res.json()["debt"]
    assert debt["apr"] == 0
    assert debt["apr_missing"] is True
    assert debt["original_balance"] == debt["current_balance"] == 1800
    assert debt["cycle_start_balance"] == 1800
    assert len(debts_of(premium_on)) == 1


def test_an_apr_given_leaves_the_flag_unset(client, premium_on):
    res = client.post("/debt-freedom/first-debt/", headers=APP, json={**FIRST, "apr": 19.99})
    assert res.status_code == 200, res.text
    assert res.json()["debt"]["apr"] == 19.99
    assert not res.json()["debt"]["apr_missing"]


def test_a_second_first_debt_is_refused(client, premium_on):
    assert client.post("/debt-freedom/first-debt/", headers=APP, json=FIRST).status_code == 200
    res = client.post("/debt-freedom/first-debt/", headers=APP, json={**FIRST, "name": "Car"})
    assert res.status_code == 403
    assert res.json()["code"] == "debt_freedom_locked"
    assert [d["name"] for d in debts_of(premium_on)] == ["Visa"]


@pytest.mark.parametrize("status", ["active", "paid_off"])
def test_any_debt_ever_held_refuses_it(client, premium_on, status):
    premium_on.seed("debts", {"user_id": USER_A, "name": "Old", "original_balance": 10.0,
                              "current_balance": 0.0, "min_payment": 10.0, "apr": 5.0,
                              "due_day": 1, "status": status})
    res = client.post("/debt-freedom/first-debt/", headers=APP, json=FIRST)
    assert res.status_code == 403
    assert len(debts_of(premium_on)) == 1


def test_another_users_debt_does_not_count(client, premium_on):
    premium_on.seed("debts", {"user_id": USER_B, "name": "Theirs", "original_balance": 10.0,
                              "current_balance": 10.0, "min_payment": 10.0, "apr": 5.0, "due_day": 1})
    assert client.post("/debt-freedom/first-debt/", headers=APP, json=FIRST).status_code == 200


def test_a_subscriber_may_use_it_with_debts(client, premium_on):
    subscribe(premium_on)
    assert client.post("/debt-freedom/first-debt/", headers=APP, json=FIRST).status_code == 200
    assert client.post("/debt-freedom/first-debt/", headers=APP, json=FIRST).status_code == 200
    assert len(debts_of(premium_on)) == 2


def test_the_kill_switch_off_lets_everyone_write(client, supabase_db):
    assert client.post("/debt-freedom/first-debt/", headers=APP, json=FIRST).status_code == 200
    assert client.post("/debt-freedom/first-debt/", headers=APP, json=FIRST).status_code == 200


def test_two_overlapping_calls_leave_one_debt(client, premium_on, monkeypatch):
    """Both requests passed the "no debt yet" check before either inserted."""
    assert client.post("/debt-freedom/first-debt/", headers=APP, json=FIRST).status_code == 200
    monkeypatch.setattr(main, "_has_any_debt", lambda user_id: False)
    res = client.post("/debt-freedom/first-debt/", headers=APP, json={**FIRST, "name": "Racer"})
    assert res.status_code == 403
    assert [d["name"] for d in debts_of(premium_on)] == ["Visa"]


@pytest.mark.parametrize("over", [
    {"due_day": 0}, {"due_day": 32}, {"amount_owed": -1}, {"min_payment": -1},
    {"apr": -2}, {"debt_type": "loan_shark"}, {"name": "  "},
])
def test_first_debt_validates_like_the_normal_create(client, premium_on, over):
    assert client.post("/debt-freedom/first-debt/", headers=APP, json={**FIRST, **over}).status_code == 400
    assert debts_of(premium_on) == []


def test_before_migration_0014_it_creates_without_the_flag(client, premium_on, monkeypatch):
    real_table = premium_on.table

    class _NoColumn:
        def __init__(self, q):
            self._q = q

        def insert(self, row):
            if "apr_missing" in row:
                raise Exception("Could not find the 'apr_missing' column of 'debts' in the schema cache")
            return self._q.insert(row)

        def __getattr__(self, name):
            return getattr(self._q, name)

    monkeypatch.setattr(premium_on, "table",
                        lambda name: _NoColumn(real_table(name)) if name == "debts" else real_table(name))
    res = client.post("/debt-freedom/first-debt/", headers=APP, json=FIRST)
    assert res.status_code == 200, res.text
    assert res.json()["debt"]["apr"] == 0
    assert not res.json()["debt"]["apr_missing"]


def test_the_free_user_then_sees_it_read_only(client, premium_on):
    """§6a: a free user who has a debt sees it like a lapsed subscriber — the
    existing `read_only` allowance — and every write stays premium."""
    debt = client.post("/debt-freedom/first-debt/", headers=APP, json=FIRST).json()["debt"]
    assert client.get("/me/entitlements/", headers=APP).json()["debt_freedom"] == "read_only"
    garden = client.get("/debt-freedom/", headers=APP).json()
    assert [d["name"] for d in garden["debts"]] == ["Visa"]
    res = client.post(f"/debt-freedom/{debt['id']}/payments", headers=APP, json={"minimum": True})
    assert res.status_code == 403
    assert res.json()["code"] == "debt_freedom_locked"
    res = client.patch(f"/debt-freedom/{debt['id']}", headers=APP, json={"apr": 20})
    assert res.status_code == 403


def test_a_patch_with_an_apr_clears_the_flag(client, premium_on):
    debt = client.post("/debt-freedom/first-debt/", headers=APP, json=FIRST).json()["debt"]
    subscribe(premium_on)
    renamed = client.patch(f"/debt-freedom/{debt['id']}", headers=APP, json={"name": "Visa Gold"}).json()
    assert renamed["debt"]["apr_missing"] is True
    fixed = client.patch(f"/debt-freedom/{debt['id']}", headers=APP, json={"apr": 21.5}).json()
    assert fixed["debt"]["apr"] == 21.5
    assert fixed["debt"]["apr_missing"] is False


def test_a_patch_never_writes_the_flag_onto_a_row_without_it(client, premium_on):
    """Before 0014 (or on any debt not planted without an APR) nothing is written."""
    subscribe(premium_on)
    debt = client.post("/debt-freedom/", headers=APP, json={
        "name": "Car", "original_balance": 5000, "current_balance": 5000,
        "min_payment": 150, "apr": 6.5, "due_day": 3}).json()["debt"]
    client.patch(f"/debt-freedom/{debt['id']}", headers=APP, json={"apr": 7})
    assert debts_of(premium_on)[0]["apr_missing"] is None


def test_home_summary_strips_the_flag_for_older_builds(client, premium_on):
    client.post("/debt-freedom/first-debt/", headers=APP, json=FIRST)
    params = {"month": MONTH, "today": TODAY.isoformat()}
    new = client.get("/home/summary/", headers=APP, params=params).json()
    assert new["debts"]["focus"]["debt"]["apr_missing"] is True
    for headers in (auth(USER_A), v2(USER_A, "premium, social, limits")):
        old = client.get("/home/summary/", headers=headers, params=params).json()
        assert "apr_missing" not in old["debts"]["focus"]["debt"]
