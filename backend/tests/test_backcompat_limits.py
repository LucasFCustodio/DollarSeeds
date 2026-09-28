"""Backward compatibility for every build that does NOT send `limits`.

Three generations of binary are already installed and cannot be updated:

  1. the original App Store build — no `X-Client-Features` at all
  2. the premium build           — `X-Client-Features: premium`
  3. the premium+social build    — `X-Client-Features: premium, social`

None of them has a paywall for goals, a locked-goal card, or a budget-type picker
that can refuse. For all three, the free-tier limits must not exist: unlimited goals,
any budget type, every goal writable, and `/me/entitlements/` returning exactly the
six keys it has always returned.

Same two properties as test_backcompat_lessons.py, and for the same reason:

  A. SHAPE — the response carries the same keys and the same values it does today.
  B. PATH  — the request runs the same CODE. No app_config read, no subscriptions
             scan, no goal count, and not even a widened select list. A gate that
             "usually lets them through" is not good enough when the client cannot
             be patched.

Enforcement itself is proved in test_limits.py.
"""

from __future__ import annotations

import pytest

import main
from conftest import USER_A, auth, stamp_year, v2

# The three generations in the wild. Every test below runs against all of them.
OLD_BINARY = auth(USER_A)
PREMIUM_BUILD = v2(USER_A, "premium")
SOCIAL_BUILD = v2(USER_A, "premium, social")

GENERATIONS = [
    pytest.param(OLD_BINARY, id="no-marker"),
    pytest.param(PREMIUM_BUILD, id="premium"),
    pytest.param(SOCIAL_BUILD, id="premium+social"),
]

# Queries that only the new code path has any reason to make. If one of these shows
# up on an unmarked request, the marker check has been hoisted past something.
NEW_TABLES = {"app_config", "subscriptions"}

FUTURE = "2099-01-01T00:00:00+00:00"


def goal(db, title: str, **over) -> dict:
    row = {"user_id": USER_A, "title": title, "target_amount": 1000.0}
    row.update(over)
    return db.seed("savings_goals", row)


@pytest.fixture
def free_user_at_the_cap(supabase_db, premium_on, current_month):
    """The state that WOULD be enforced for a `limits` caller: the kill switch on, no
    subscription, and two goals — so one of them is over the cap and the newer one
    would be locked. Every assertion in this file is that none of that happens.

    `premium_on` matters: without the switch even a `limits` build is unenforced, and
    a test that passes for that reason proves nothing about the marker.
    """
    general = goal(supabase_db, "General Savings", is_general=True, target_amount=None)
    oldest = goal(supabase_db, "Emergency fund")
    newest = goal(supabase_db, "New car")
    supabase_db.seed("user_settings", {"user_id": USER_A, "tithe_enabled": False,
                                       "tithe_rate": 0.10, "budget_type": "wealth_builder"})
    supabase_db.seed("income", {"user_id": USER_A, "amount": 1000.0, "day": 1,
                                "month": current_month, "budget_type": "wealth_builder"})
    return {"db": supabase_db, "general": general["id"],
            "oldest": oldest["id"], "newest": newest["id"]}


# ══ A. Nothing is limited ══════════════════════════════════════════════════════

@pytest.mark.parametrize("headers", GENERATIONS)
def test_a_second_goal_and_beyond_are_still_created(client, free_user_at_the_cap, headers):
    """The single most important assertion here. These builds have no cap message and
    no purchase path for one, so a 403 on "add a goal" is a dead end."""
    third = client.post("/savings/goal/", headers=headers, json={"title": "Holiday"})
    assert third.status_code == 200, third.text
    fourth = client.post("/savings/goal/", headers=headers, json={"title": "Roof"})
    assert fourth.status_code == 200, fourth.text


@pytest.mark.parametrize("headers", GENERATIONS)
def test_wealth_builder_is_still_selectable(client, free_user_at_the_cap, headers):
    res = client.patch("/settings/", headers=headers, json={"budget_type": "wealth_builder"})
    assert res.status_code == 200, res.text
    assert res.json()["data"]["budget_type"] == "wealth_builder"

    res = client.patch("/settings/", headers=headers, json={"budget_type": "firm_foundation"})
    assert res.status_code == 200, res.text


@pytest.mark.parametrize("headers", GENERATIONS)
def test_every_write_to_the_newer_goal_still_succeeds(client, free_user_at_the_cap,
                                                      headers, current_month):
    """The newer goal is exactly the one a `limits` caller would find locked."""
    ids = free_user_at_the_cap
    locked_for_limits = ids["newest"]

    deposit = client.post("/savings/transaction/", headers=headers, json={
        "title": "New car", "amount": 50.0, "type": "deposit",
        "goal_id": locked_for_limits, "day": 1, "month": current_month, "source": "income"})
    assert deposit.status_code == 200, deposit.text
    txn_id = deposit.json()["data"][0]["id"]

    assert client.post("/savings/transaction/", headers=headers, json={
        "title": "New car", "amount": 5.0, "type": "withdrawal",
        "goal_id": locked_for_limits, "day": 1, "month": current_month,
        "source": "income"}).status_code == 200

    assert client.post("/savings/transfer/", headers=headers, json={
        "amount": 10.0, "to_goal_id": locked_for_limits, "general_goal_id": ids["general"],
        "day": 1, "month": current_month, "to_goal_title": "New car"}).status_code == 200

    assert client.patch(f"/savings/goal/{locked_for_limits}", headers=headers,
                        json={"title": "Newer car"}).status_code == 200

    assert client.delete(f"/savings/transaction/{txn_id}", headers=headers).status_code == 200

    assert client.post(f"/savings/goal/{locked_for_limits}/finish", headers=headers,
                       json={"day": 1, "month": current_month}).status_code == 200


@pytest.mark.parametrize("headers", GENERATIONS)
def test_the_legacy_complete_route_still_flips_the_flag(client, free_user_at_the_cap, headers):
    ids = free_user_at_the_cap
    res = client.patch(f"/savings/goal/{ids['newest']}/complete", headers=headers)
    assert res.status_code == 200, res.text
    row = next(g for g in ids["db"].rows("savings_goals") if g["id"] == ids["newest"])
    assert row["completed"] is True


@pytest.mark.parametrize("headers", GENERATIONS)
def test_the_goals_list_never_grows_a_locked_key(client, free_user_at_the_cap, headers):
    data = client.get("/savings/goal/", headers=headers).json()["data"]
    assert data, "fixture must seed goals or this asserts nothing"
    assert all("locked" not in g for g in data)


@pytest.mark.parametrize("headers", GENERATIONS)
def test_the_goals_list_keeps_its_newest_first_order(client, free_user_at_the_cap, headers):
    """A `limits` build gets the list oldest-first, because the active goal is the
    oldest and newest-first buried it. These builds keep the order they were designed
    around — a reordered list crashes nothing, but "today's response in a different
    order" is not today's response."""
    data = client.get("/savings/goal/", headers=headers).json()["data"]
    assert [g["title"] for g in data] == ["New car", "Emergency fund", "General Savings"]


@pytest.mark.parametrize("headers", GENERATIONS)
def test_the_goals_list_query_is_unchanged(client, free_user_at_the_cap, headers):
    """One `order=` and one only. PostgREST appends each one it is given, so the id
    tiebreak added for `limits` builds must not reach this query either."""
    ids = free_user_at_the_cap
    ids["db"].calls.clear()
    assert client.get("/savings/goal/", headers=headers).status_code == 200

    # The unordered one is _ensure_general_savings looking up the pool.
    orders = [keys for table, keys in ids["db"].orders if table == "savings_goals" and keys]
    assert orders == [[("created_at", True)]], orders


@pytest.mark.parametrize("headers", GENERATIONS)
def test_the_dashboard_budget_type_is_unchanged(client, free_user_at_the_cap,
                                                headers, current_month):
    body = client.get(f"/dashboard/{current_month}", headers=headers).json()
    assert body["budget_type"]["key"] == "wealth_builder"
    assert body["live_budget_type"] == "wealth_builder"
    # 30/20/50 on $1000, not the 50/30/20 a limited caller would be given.
    assert body["budgets"] == {"needs": 300.0, "wants": 200.0, "goals": 500.0}


@pytest.mark.parametrize("headers", GENERATIONS)
def test_the_trends_budget_type_is_unchanged(client, free_user_at_the_cap,
                                             headers, current_month):
    rows = client.get("/dashboard/trends/", headers=headers).json()["data"]
    row = next(r for r in rows if r["month"] == current_month)
    assert row["budget_type"] == "wealth_builder"


@pytest.mark.parametrize("headers", GENERATIONS)
def test_closing_a_month_still_freezes_the_live_type(client, free_user_at_the_cap,
                                                     headers, current_month):
    assert client.post("/rollover/close/", headers=headers,
                       json={"month": current_month}).status_code == 200
    row = free_user_at_the_cap["db"].rows("month_status")[0]
    assert row["budget_type"] == "wealth_builder"
    assert row["year"] == stamp_year(current_month)


@pytest.mark.parametrize("headers", GENERATIONS)
def test_income_still_snapshots_the_live_type(client, free_user_at_the_cap,
                                              headers, current_month):
    client.post("/income/", headers=headers,
                json={"amount": 500.0, "day": 9, "month": current_month})
    row = [r for r in free_user_at_the_cap["db"].rows("income") if r["day"] == 9][0]
    assert row["budget_type"] == "wealth_builder"


SIX_KEYS = {"premium_active", "expires_at", "product_id", "pending_product_id",
            "store", "auto_renew"}


@pytest.mark.parametrize("headers", GENERATIONS)
def test_entitlements_returns_exactly_the_six_keys(client, supabase_db, premium_on, headers):
    """The shipped premium build reads these six. New fields are additive and
    marked-only, so this response must not grow for anybody else."""
    assert set(client.get("/me/entitlements/", headers=headers).json()) == SIX_KEYS

    supabase_db.seed("subscriptions", {
        "user_id": USER_A, "store": "app_store", "environment": "production",
        "store_txn_id": "txn-1", "product_id": "com.dollarseeds.support.monthly.5",
        "expires_at": FUTURE})
    body = client.get("/me/entitlements/", headers=headers).json()
    assert set(body) == SIX_KEYS, "an entitled caller must not grow keys either"
    assert body["premium_active"] is True


# ══ B. The same code path, not just the same answer ════════════════════════════

# (method, path, params, body) — every route that now resolves an entitlement.
# /me/entitlements/ is deliberately absent: it reads `subscriptions` for every
# caller and always has, so the assertion below does not apply to it.
ROUTES = [
    ("GET",    "/dashboard/{month}",            {},                   None),
    ("GET",    "/dashboard/trends/",            {},                   None),
    ("POST",   "/income/",                      {},                   {"amount": 100.0, "day": 2, "month": "{month}"}),
    ("PATCH",  "/settings/",                    {},                   {"budget_type": "firm_foundation"}),
    ("GET",    "/savings/goal/",                {},                   None),
    ("POST",   "/savings/goal/",                {},                   {"title": "Another goal"}),
    ("PATCH",  "/savings/goal/{newest}",        {},                   {"title": "Renamed"}),
    ("PATCH",  "/savings/goal/{newest}/complete", {},                 None),
    ("POST",   "/savings/goal/{newest}/finish", {},                   {"day": 1, "month": "{month}"}),
    ("DELETE", "/savings/goal/{newest}",        {"current_month": "{month}"}, None),
    ("GET",    "/rollover/preview/",            {"month": "{month}"}, None),
    ("POST",   "/rollover/close/",              {},                   {"month": "{month}"}),
]


@pytest.mark.parametrize("headers", GENERATIONS)
@pytest.mark.parametrize("method,path,params,body", ROUTES,
                         ids=[f"{m} {p}" for m, p, _, _ in ROUTES])
def test_no_route_reads_app_config_or_subscriptions(client, free_user_at_the_cap,
                                                    current_month, headers,
                                                    method, path, params, body):
    """The strongest form of the guarantee: not the same RESPONSE, the same WORK.

    Every one of these routes now resolves an entitlement, and every resolution has
    to stop at the marker check. If someone hoists the kill-switch read or the
    subscriptions scan above it, this fails on the request an App Store binary makes
    even though every assertion above still passes."""
    ids = free_user_at_the_cap
    fill = {"month": current_month, **{k: v for k, v in ids.items() if k != "db"}}

    def render(value):
        return value.format(**fill) if isinstance(value, str) else value

    ids["db"].calls.clear()
    res = client.request(
        method, render(path),
        params={k: render(v) for k, v in params.items()},
        json={k: render(v) for k, v in body.items()} if body else None,
        headers=headers,
    )
    assert res.status_code == 200, res.text

    touched = {table for _, table in ids["db"].calls}
    leaked = NEW_TABLES & touched
    assert not leaked, f"{method} {path} read {sorted(leaked)} for an unmarked caller"


@pytest.mark.parametrize("headers", GENERATIONS)
def test_deleting_a_transaction_does_not_widen_its_select(client, free_user_at_the_cap,
                                                          headers, current_month):
    """`goal_id` is needed only to decide whether a goal is locked, so it is selected
    only for a caller that can be. A column list is part of the contract too — a
    select naming a column PostgREST has not cached yet is a 400, and that failure
    mode must stay confined to builds that can be fixed (see
    test_an_unmarked_request_does_not_even_select_the_new_columns)."""
    ids = free_user_at_the_cap
    txn = ids["db"].seed("savings_transactions", {
        "user_id": USER_A, "title": "New car", "amount": 20.0, "type": "deposit",
        "goal_id": ids["newest"], "source": "income", "day": 1, "month": current_month})

    ids["db"].selects.clear()
    assert client.delete(f"/savings/transaction/{txn['id']}", headers=headers).status_code == 200

    selects = [cols for table, cols in ids["db"].selects if table == "savings_transactions"]
    assert selects, "the route must have queried savings_transactions"
    assert selects[0] == ["month", "transfer_group"], selects[0]
    assert all("goal_id" not in (cols or []) for cols in selects)


def test_an_unknown_feature_token_is_not_the_limits_token(client, free_user_at_the_cap):
    """A token we do not recognise is treated as no token at all, exactly as
    `somethingelse` is for the premium gate."""
    res = client.post("/savings/goal/", headers=v2(USER_A, "limitless, premium2"),
                      json={"title": "Holiday"})
    assert res.status_code == 200, res.text


def test_the_limits_marker_is_what_makes_the_difference(client, free_user_at_the_cap):
    """The control for every test in this file: the identical state, with the token
    added, IS enforced. Without this, all of the above could be passing because the
    fixture is wrong rather than because the marker check works."""
    res = client.post("/savings/goal/", headers=v2(USER_A, "premium, social, limits"),
                      json={"title": "Holiday"})
    assert res.status_code == 403
    assert res.json()["code"] == "goal_limit_reached"


def test_the_test_account_switch_does_not_reach_an_unmarked_caller(
        client, free_user_at_the_cap, monkeypatch):
    """LIMITS_TEST_USER_IDS is for exercising the new rules from a dev build against
    production. A listed user on an OLD build is still an old build."""
    monkeypatch.setattr(main, "LIMITS_TEST_USER_IDS", frozenset({USER_A}))
    for headers in (OLD_BINARY, PREMIUM_BUILD, SOCIAL_BUILD):
        res = client.post("/savings/goal/", headers=headers,
                          json={"title": f"Goal {headers.get('X-Client-Features')}"})
        assert res.status_code == 200, res.text
