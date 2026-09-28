"""The free-tier limits: the goal cap, locked goals, and the budget-type lock.

Everything here needs a caller that advertises `limits`. The other half — that none
of it exists for a build which does not — is test_backcompat_limits.py, and neither
file proves anything without the other.

Three things decide whether a caller is limited, in this order (main._entitlements):

  1. the `limits` marker        — absent means an unpatchable binary; nothing applies
  2. app_config.premium_enabled — or membership of LIMITS_TEST_USER_IDS
  3. the user's entitlement     — a subscriber is unlimited

and when step 3 cannot be answered because RevenueCat is unreachable, writes fail
CLOSED to a 403 and reads fail OPEN, which is the distinction the two postures on
_Entitlements exist to keep straight.
"""

from __future__ import annotations

import pytest

import main
from conftest import USER_A, USER_B, auth, stamp_year, v2

FUTURE = "2099-01-01T00:00:00+00:00"

# A build that sends the token. `LIMITS` is the minimal form; `APP` is what the real
# app's axios interceptor will send once Phase 2 adds the token to CLIENT_FEATURES,
# and the two must behave identically.
LIMITS = v2(USER_A, "limits")
APP = v2(USER_A, "premium, social, limits")
LIMITS_B = v2(USER_B, "limits")

ALL_BUDGET_TYPES = ["balanced", "wealth_builder", "firm_foundation"]


def goal(db, title: str, user_id: str = USER_A, **over) -> dict:
    row = {"user_id": user_id, "title": title, "target_amount": 1000.0}
    row.update(over)
    return db.seed("savings_goals", row)


def sub(db, user_id: str = USER_A, **over) -> dict:
    row = {"user_id": user_id, "store": "app_store", "environment": "production",
           "store_txn_id": "txn-1", "product_id": "com.dollarseeds.premium.monthly",
           "expires_at": FUTURE}
    row.update(over)
    return db.seed("subscriptions", row)


class _BoomHttpx:
    """RevenueCat unreachable — a timeout, not an answer."""

    def get(self, *a, **k):
        raise TimeoutError("revenuecat unreachable")


@pytest.fixture
def unreachable_revenuecat(monkeypatch):
    monkeypatch.setattr(main, "REVENUECAT_API_KEY", "rc-key")
    monkeypatch.setattr(main, "httpx", _BoomHttpx())


@pytest.fixture
def free(supabase_db, premium_on, current_month):
    """An ENFORCED free caller: the kill switch on, no subscription, and two goals.

    `Emergency fund` is seeded first, so it is the oldest eligible goal and therefore
    the ACTIVE one; `New car` is locked. General Savings is seeded before both and is
    never eligible, which is the point of excluding it — a user must not be locked out
    of their one free goal by a goal the app created for them.
    """
    general = goal(supabase_db, "General Savings", is_general=True, target_amount=None)
    active = goal(supabase_db, "Emergency fund")
    locked = goal(supabase_db, "New car")
    supabase_db.seed("user_settings", {"user_id": USER_A, "tithe_enabled": False,
                                       "tithe_rate": 0.10, "budget_type": "wealth_builder"})
    supabase_db.seed("income", {"user_id": USER_A, "amount": 1000.0, "day": 1,
                                "month": current_month, "budget_type": "wealth_builder"})
    return {"db": supabase_db, "general": general["id"],
            "active": active["id"], "locked": locked["id"]}


# ══ Nothing is enforced unless all three conditions hold ═══════════════════════

def test_the_kill_switch_still_governs_everything(client, supabase_db, current_month):
    """Release 1 ships with premium_enabled false, so a `limits` build installs and
    behaves exactly like a free-for-all. No `premium_on` fixture here."""
    goal(supabase_db, "General Savings", is_general=True, target_amount=None)
    goal(supabase_db, "Emergency fund")
    locked_candidate = goal(supabase_db, "New car")["id"]
    supabase_db.seed("user_settings", {"user_id": USER_A, "budget_type": "wealth_builder"})

    assert client.post("/savings/goal/", headers=LIMITS,
                       json={"title": "Holiday"}).status_code == 200
    assert client.patch("/settings/", headers=LIMITS,
                        json={"budget_type": "firm_foundation"}).status_code == 200
    assert client.post("/savings/transaction/", headers=LIMITS, json={
        "title": "New car", "amount": 10.0, "type": "deposit", "goal_id": locked_candidate,
        "day": 1, "month": current_month, "source": "income"}).status_code == 200

    body = client.get("/me/entitlements/", headers=LIMITS).json()
    assert body["max_goals"] is None
    assert body["budget_types"] == ALL_BUDGET_TYPES
    assert body["video_series"] == "all"
    assert body["max_bank_connections"] == 1

    assert all(g["locked"] is False
               for g in client.get("/savings/goal/", headers=LIMITS).json()["data"])


def test_a_subscriber_is_not_enforced(client, free, current_month):
    sub(free["db"])

    assert client.post("/savings/goal/", headers=LIMITS,
                       json={"title": "Holiday"}).status_code == 200
    assert client.patch("/settings/", headers=LIMITS,
                        json={"budget_type": "firm_foundation"}).status_code == 200
    assert client.post("/savings/transaction/", headers=LIMITS, json={
        "title": "New car", "amount": 10.0, "type": "deposit", "goal_id": free["locked"],
        "day": 1, "month": current_month, "source": "income"}).status_code == 200

    body = client.get("/me/entitlements/", headers=LIMITS).json()
    assert body["premium_active"] is True
    assert body["max_goals"] is None
    assert body["budget_types"] == ALL_BUDGET_TYPES
    assert all(g["locked"] is False
               for g in client.get("/savings/goal/", headers=LIMITS).json()["data"])


def test_one_users_subscription_never_unlocks_another(client, free):
    sub(free["db"], user_id=USER_B, store_txn_id="txn-b")
    res = client.post("/savings/goal/", headers=LIMITS, json={"title": "Holiday"})
    assert res.status_code == 403


# ══ /me/entitlements/ — the allowance fields ═══════════════════════════════════

def test_an_unpaid_limits_caller_gets_the_free_allowances(client, free):
    body = client.get("/me/entitlements/", headers=LIMITS).json()
    # The six original keys, unchanged and still present.
    assert body["premium_active"] is False
    assert body["expires_at"] is None
    assert body["product_id"] is None
    assert body["pending_product_id"] is None
    assert body["store"] is None
    assert body["auto_renew"] is False
    # The five additive ones.
    assert body["max_goals"] == 1
    assert body["goals_used"] == 2, "General Savings is excluded"
    assert body["budget_types"] == ["balanced"]
    assert body["video_series"] == "free_only"
    assert body["max_bank_connections"] == 0


def test_goals_used_counts_only_eligible_goals(client, supabase_db, premium_on):
    goal(supabase_db, "General Savings", is_general=True, target_amount=None)
    goal(supabase_db, "Reconciliation", is_reconciliation=True, goal_type="debt")
    goal(supabase_db, "Old car", completed=True, completed_amount=500.0)
    assert client.get("/me/entitlements/", headers=LIMITS).json()["goals_used"] == 0

    goal(supabase_db, "Emergency fund")
    assert client.get("/me/entitlements/", headers=LIMITS).json()["goals_used"] == 1


def test_the_allowances_are_identical_for_the_full_token_list(client, free):
    minimal = client.get("/me/entitlements/", headers=LIMITS).json()
    full = client.get("/me/entitlements/", headers=APP).json()
    assert minimal == full


# ══ The goal cap ═══════════════════════════════════════════════════════════════

def test_the_first_goal_is_always_allowed(client, supabase_db, premium_on):
    goal(supabase_db, "General Savings", is_general=True, target_amount=None)
    res = client.post("/savings/goal/", headers=LIMITS, json={"title": "Emergency fund"})
    assert res.status_code == 200, res.text


def test_a_second_goal_is_refused_with_goal_limit_reached(client, supabase_db, premium_on):
    goal(supabase_db, "Emergency fund")
    res = client.post("/savings/goal/", headers=LIMITS, json={"title": "New car"})
    assert res.status_code == 403
    body = res.json()
    assert body["code"] == "goal_limit_reached"
    assert isinstance(body["detail"], str) and body["detail"]
    assert set(body) == {"code", "detail"}


def test_auto_created_and_completed_goals_do_not_consume_the_slot(
        client, supabase_db, premium_on):
    goal(supabase_db, "General Savings", is_general=True, target_amount=None)
    goal(supabase_db, "Reconciliation", is_reconciliation=True, goal_type="debt")
    goal(supabase_db, "Old car", completed=True, completed_amount=500.0)
    res = client.post("/savings/goal/", headers=LIMITS, json={"title": "Emergency fund"})
    assert res.status_code == 200, res.text


def test_completing_the_one_goal_frees_the_slot(client, supabase_db, premium_on, current_month):
    goal(supabase_db, "General Savings", is_general=True, target_amount=None)
    only = goal(supabase_db, "Emergency fund")["id"]
    assert client.post("/savings/goal/", headers=LIMITS,
                       json={"title": "New car"}).status_code == 403

    # The active goal keeps every function, including finishing it.
    assert client.post(f"/savings/goal/{only}/finish", headers=LIMITS,
                       json={"day": 1, "month": current_month}).status_code == 200

    res = client.post("/savings/goal/", headers=LIMITS, json={"title": "New car"})
    assert res.status_code == 200, res.text


def test_deleting_the_one_goal_frees_the_slot(client, supabase_db, premium_on, current_month):
    only = goal(supabase_db, "Emergency fund")["id"]
    assert client.delete(f"/savings/goal/{only}", params={"current_month": current_month},
                         headers=LIMITS).status_code == 200
    assert client.post("/savings/goal/", headers=LIMITS,
                       json={"title": "New car"}).status_code == 200


def test_a_duplicate_title_is_still_a_400_at_the_cap(client, supabase_db, premium_on):
    """Order preserved: the name clash is reported as the 400 it has always been,
    rather than being masked by the cap."""
    goal(supabase_db, "Emergency fund")
    res = client.post("/savings/goal/", headers=LIMITS, json={"title": "Emergency fund"})
    assert res.status_code == 400
    assert res.json() == {"detail": "A goal with this name already exists."}


def test_the_cap_cannot_be_bypassed_with_the_is_general_flag(client, supabase_db, premium_on):
    goal(supabase_db, "Emergency fund")
    res = client.post("/savings/goal/", headers=LIMITS,
                      json={"title": "Sneaky", "is_general": True})
    assert res.status_code == 403
    assert res.json()["code"] == "goal_limit_reached"


# ══ Locked goals ═══════════════════════════════════════════════════════════════
#
# WRITES that must be refused. Each entry builds one request against a goal id.

def _writes(ids, month):
    return {
        "deposit": lambda c, gid: c.post("/savings/transaction/", headers=LIMITS, json={
            "title": "x", "amount": 10.0, "type": "deposit", "goal_id": gid,
            "day": 1, "month": month, "source": "income"}),
        "withdrawal": lambda c, gid: c.post("/savings/transaction/", headers=LIMITS, json={
            "title": "x", "amount": 10.0, "type": "withdrawal", "goal_id": gid,
            "day": 1, "month": month, "source": "income"}),
        "transfer": lambda c, gid: c.post("/savings/transfer/", headers=LIMITS, json={
            "amount": 10.0, "to_goal_id": gid, "general_goal_id": ids["general"],
            "day": 1, "month": month, "to_goal_title": "x"}),
        "edit": lambda c, gid: c.patch(f"/savings/goal/{gid}", headers=LIMITS,
                                       json={"title": f"Renamed {gid}"}),
        "complete": lambda c, gid: c.patch(f"/savings/goal/{gid}/complete", headers=LIMITS),
        "finish": lambda c, gid: c.post(f"/savings/goal/{gid}/finish", headers=LIMITS,
                                        json={"day": 1, "month": month}),
    }


WRITE_IDS = ["deposit", "withdrawal", "transfer", "edit", "complete", "finish"]


@pytest.mark.parametrize("write", WRITE_IDS)
def test_every_write_to_a_locked_goal_is_refused(client, free, current_month, write):
    res = _writes(free, current_month)[write](client, free["locked"])
    assert res.status_code == 403, res.text
    assert res.json()["code"] == "goal_locked"


@pytest.mark.parametrize("write", WRITE_IDS)
def test_the_active_goal_accepts_every_write(client, free, current_month, write):
    """The other half of the rule. A cap that also froze the one remaining goal would
    leave a lapsed user with no working goal at all."""
    res = _writes(free, current_month)[write](client, free["active"])
    assert res.status_code == 200, res.text


def test_the_active_goal_is_the_oldest_one(client, free):
    ent = main._entitlements(USER_A, {"limits"})
    assert ent.active_goal_id() == free["active"]
    assert ent.locked_goal_ids() == frozenset({free["locked"]})


def test_ties_on_created_at_break_on_id(supabase_db, premium_on):
    """created_at defaults to now() and two goals can share it to the microsecond, so
    the rule needs a second key or "which goal is active" is up to the planner."""
    same = "2026-05-01T00:00:00+00:00"
    second = goal(supabase_db, "Second", created_at=same)
    first = goal(supabase_db, "First", created_at=same)
    assert first["id"] > second["id"], "seeded ids are monotonic"

    ent = main._entitlements(USER_A, {"limits"})
    assert ent.active_goal_id() == second["id"]


def test_general_savings_and_reconciliation_are_never_locked(client, free, current_month):
    recon = goal(free["db"], "Reconciliation", is_reconciliation=True,
                 goal_type="debt", target_amount=0.0)
    res = client.post("/savings/transaction/", headers=LIMITS, json={
        "title": "Seeds", "amount": 10.0, "type": "deposit", "goal_id": free["general"],
        "day": 1, "month": current_month, "source": "income"})
    assert res.status_code == 200, res.text

    res = client.post("/savings/transaction/", headers=LIMITS, json={
        "title": "Reconciliation", "amount": 10.0, "type": "deposit", "goal_id": recon["id"],
        "day": 1, "month": current_month, "source": "income"})
    assert res.status_code == 200, res.text


def test_deleting_a_locked_goal_is_always_allowed(client, free, current_month):
    """The one write a locked goal must accept. A goal the user cannot fund, cannot
    transfer into and cannot complete has to be something they can get rid of — and
    the existing delete already returns its prior-month deposits to General Savings."""
    res = client.delete(f"/savings/goal/{free['locked']}",
                        params={"current_month": current_month}, headers=LIMITS)
    assert res.status_code == 200, res.text
    assert res.json()["message"] == "Goal deleted and funds redistributed."
    assert not [g for g in free["db"].rows("savings_goals") if g["id"] == free["locked"]]


def test_deleting_a_locked_goal_still_returns_its_prior_month_money(
        client, free, current_month, past_month):
    free["db"].seed("savings_transactions", {
        "user_id": USER_A, "title": "New car", "amount": 75.0, "type": "deposit",
        "goal_id": free["locked"], "source": "income", "day": 4, "month": past_month})

    assert client.delete(f"/savings/goal/{free['locked']}",
                         params={"current_month": current_month},
                         headers=LIMITS).status_code == 200

    returned = [t for t in free["db"].rows("savings_transactions")
                if t["title"] == "Returned from deleted goal"]
    assert [t["amount"] for t in returned] == [75.0]
    assert returned[0]["goal_id"] == free["general"]


def test_deleting_a_transaction_of_a_locked_goal_is_refused(client, free, current_month):
    txn = free["db"].seed("savings_transactions", {
        "user_id": USER_A, "title": "New car", "amount": 20.0, "type": "deposit",
        "goal_id": free["locked"], "source": "income", "day": 1, "month": current_month})

    res = client.delete(f"/savings/transaction/{txn['id']}", headers=LIMITS)
    assert res.status_code == 403
    assert res.json()["code"] == "goal_locked"
    assert free["db"].rows("savings_transactions"), "nothing may be deleted"


def test_deleting_either_leg_of_a_transfer_into_a_locked_goal_is_refused(
        client, free, current_month):
    """Deleting one leg deletes BOTH, so the General Savings leg is a write to the
    locked goal even though its own goal_id is General Savings."""
    group = "11111111-2222-3333-4444-555555555555"
    gs_leg = free["db"].seed("savings_transactions", {
        "user_id": USER_A, "title": "Transfer from General Savings to New car",
        "amount": 20.0, "type": "withdrawal", "goal_id": free["general"],
        "source": "transfer", "transfer_group": group, "day": 1, "month": current_month})
    goal_leg = free["db"].seed("savings_transactions", {
        "user_id": USER_A, "title": "New car", "amount": 20.0, "type": "deposit",
        "goal_id": free["locked"], "source": "transfer", "transfer_group": group,
        "day": 1, "month": current_month})

    for leg in (gs_leg, goal_leg):
        res = client.delete(f"/savings/transaction/{leg['id']}", headers=LIMITS)
        assert res.status_code == 403, res.text
        assert res.json()["code"] == "goal_locked"

    assert len(free["db"].rows("savings_transactions")) == 2


def test_deleting_a_transaction_of_the_active_goal_still_works(client, free, current_month):
    txn = free["db"].seed("savings_transactions", {
        "user_id": USER_A, "title": "Emergency fund", "amount": 20.0, "type": "deposit",
        "goal_id": free["active"], "source": "income", "day": 1, "month": current_month})
    assert client.delete(f"/savings/transaction/{txn['id']}", headers=LIMITS).status_code == 200


def test_a_missing_goal_is_still_a_404_not_a_403(client, free, current_month):
    """The lock check sits after the ownership and 404 checks, so "that goal does not
    exist" never comes back as "that goal is locked"."""
    assert client.patch("/savings/goal/999999", headers=LIMITS,
                        json={"title": "Nope"}).status_code == 404
    assert client.post("/savings/goal/999999/finish", headers=LIMITS,
                       json={"day": 1, "month": current_month}).status_code == 404
    assert client.post("/savings/transaction/", headers=LIMITS, json={
        "title": "x", "amount": 10.0, "type": "deposit", "goal_id": 999999,
        "day": 1, "month": current_month, "source": "income"}).status_code == 404


def test_another_users_goal_is_still_a_404(client, free, current_month):
    theirs = goal(free["db"], "Their goal", user_id=USER_B)["id"]
    res = client.post("/savings/transaction/", headers=LIMITS, json={
        "title": "x", "amount": 10.0, "type": "deposit", "goal_id": theirs,
        "day": 1, "month": current_month, "source": "income"})
    assert res.status_code == 404


# ══ The `locked` flag on GET /savings/goal/ ════════════════════════════════════

def test_the_goals_list_flags_the_locked_ones_without_reordering(client, free):
    data = client.get("/savings/goal/", headers=LIMITS).json()["data"]
    # created_at DESC, exactly as before: newest first, General Savings last.
    assert [g["title"] for g in data] == ["New car", "Emergency fund", "General Savings"]
    assert [g["locked"] for g in data] == [True, False, False]


def test_the_locked_flag_is_the_same_whichever_tab_asks(client, free):
    """The `goal_type` filter can hide the oldest goal, so the flag must not be
    derived from the filtered rows — it would name a different active goal per tab."""
    debt = goal(free["db"], "Student loan", goal_type="debt")["id"]

    debts = client.get("/savings/goal/", params={"goal_type": "debt"},
                       headers=LIMITS).json()["data"]
    assert [(g["id"], g["locked"]) for g in debts] == [(debt, True)]

    savings = client.get("/savings/goal/", params={"goal_type": "saving"},
                         headers=LIMITS).json()["data"]
    by_id = {g["id"]: g["locked"] for g in savings}
    assert by_id[free["active"]] is False
    assert by_id[free["locked"]] is True


def test_a_subscribers_goals_are_never_flagged_locked(client, free):
    sub(free["db"])
    data = client.get("/savings/goal/", headers=LIMITS).json()["data"]
    assert [g["locked"] for g in data] == [False, False, False]


# ══ The budget-type lock ═══════════════════════════════════════════════════════

@pytest.mark.parametrize("gated", ["wealth_builder", "firm_foundation"])
def test_a_gated_budget_type_is_refused(client, free, gated):
    res = client.patch("/settings/", headers=LIMITS, json={"budget_type": gated})
    assert res.status_code == 403
    assert res.json()["code"] == "budget_type_locked"
    assert set(res.json()) == {"code", "detail"}


def test_balanced_is_always_accepted(client, free):
    res = client.patch("/settings/", headers=LIMITS, json={"budget_type": "balanced"})
    assert res.status_code == 200, res.text
    assert res.json()["data"]["budget_type"] == "balanced"


def test_an_unknown_budget_type_is_still_a_400(client, free):
    res = client.patch("/settings/", headers=LIMITS, json={"budget_type": "yolo"})
    assert res.status_code == 400


def test_a_refused_patch_applies_none_of_its_other_fields(client, free):
    """One PATCH is one decision. Applying the tithe change while refusing the budget
    type would hand the user half of what they asked for and no way to tell."""
    before = dict(free["db"].rows("user_settings")[0])

    res = client.patch("/settings/", headers=LIMITS, json={
        "budget_type": "wealth_builder", "tithe_enabled": True, "tithe_rate": 0.15,
        "firm_foundation_goals_prompted": True})
    assert res.status_code == 403

    after = free["db"].rows("user_settings")[0]
    assert after == before


def test_a_lapse_never_rewrites_the_stored_choice(client, free, current_month):
    """The stored budget_type is the user's, not the server's: resubscribing has to
    restore Wealth Builder without them setting it again."""
    client.get(f"/dashboard/{current_month}", headers=LIMITS)
    client.get("/dashboard/trends/", headers=LIMITS)
    client.post("/income/", headers=LIMITS, json={"amount": 10.0, "day": 5, "month": current_month})
    client.post("/rollover/close/", headers=LIMITS, json={"month": current_month})

    assert free["db"].rows("user_settings")[0]["budget_type"] == "wealth_builder"
    # GET /settings/ is deliberately unchanged — it returns the raw row.
    assert client.get("/settings/", headers=LIMITS).json()["data"]["budget_type"] == "wealth_builder"

    sub(free["db"])
    main._fallback_cache.clear()
    # The closed month keeps the balanced stamp it was closed with, permanently. The
    # LIVE setting is what an open month resolves from, and it is back immediately.
    body = client.get(f"/dashboard/{current_month}", headers=LIMITS).json()
    assert body["live_budget_type"] == "wealth_builder", "resubscribing restores it"
    client.post("/rollover/reopen/", headers=LIMITS, json={"month": current_month})
    assert client.get(f"/dashboard/{current_month}",
                      headers=LIMITS).json()["budget_type"]["key"] == "wealth_builder"


def test_an_unclosed_month_resolves_to_balanced(client, free, current_month):
    body = client.get(f"/dashboard/{current_month}", headers=LIMITS).json()
    assert body["budget_type"]["key"] == "balanced"
    assert body["live_budget_type"] == "balanced"
    assert body["budgets"] == {"needs": 500.0, "wants": 300.0, "goals": 200.0}


def test_an_unclosed_past_month_resolves_to_balanced_too(client, free, past_month):
    """Not "the current month" — every month the user may still edit."""
    free["db"].seed("income", {"user_id": USER_A, "amount": 1000.0, "day": 1,
                               "month": past_month, "budget_type": "wealth_builder"})
    body = client.get(f"/dashboard/{past_month}", headers=LIMITS).json()
    assert body["budget_type"]["key"] == "balanced"


def test_trends_and_the_rollover_preview_agree_with_the_dashboard(client, free, current_month):
    rows = client.get("/dashboard/trends/", headers=LIMITS).json()["data"]
    row = next(r for r in rows if r["month"] == current_month)
    assert row["budget_type"] == "balanced"
    assert row["budgets"] == {"needs": 500.0, "wants": 300.0, "goals": 200.0}

    preview = client.get("/rollover/preview/", params={"month": current_month},
                         headers=LIMITS).json()
    assert preview["breakdown"]["needs"]["budget"] == 500.0


def test_income_rows_snapshot_the_fallback_not_the_stored_choice(client, free, current_month):
    client.post("/income/", headers=LIMITS,
                json={"amount": 500.0, "day": 9, "month": current_month})
    row = [r for r in free["db"].rows("income") if r["day"] == 9][0]
    assert row["budget_type"] == "balanced"


def test_closing_a_month_freezes_balanced(client, free, current_month):
    """Close-out freezes what the user was SHOWN. Stamping wealth_builder here would
    make the closed month permanently disagree with the dashboard it was closed from."""
    assert client.post("/rollover/close/", headers=LIMITS,
                       json={"month": current_month}).status_code == 200

    row = free["db"].rows("month_status")[0]
    assert row["budget_type"] == "balanced"
    assert row["year"] == stamp_year(current_month)
    assert client.get(f"/dashboard/{current_month}",
                      headers=LIMITS).json()["budget_type"]["key"] == "balanced"


def test_a_closed_month_keeps_the_type_it_was_closed_with(client, free, past_month):
    """Closed months are permanent, whatever the user is entitled to today — a
    subscriber who lapses does not have their history rewritten."""
    free["db"].seed("income", {"user_id": USER_A, "amount": 1000.0, "day": 1,
                               "month": past_month, "budget_type": "wealth_builder"})
    free["db"].seed("month_status", {
        "user_id": USER_A, "month": past_month, "closed_at": "2026-02-01T00:00:00+00:00",
        "budget_type": "wealth_builder", "tithe_enabled": False, "tithe_rate": 0.10,
        "year": stamp_year(past_month)})

    body = client.get(f"/dashboard/{past_month}", headers=LIMITS).json()
    assert body["budget_type"]["key"] == "wealth_builder"
    assert body["budgets"] == {"needs": 300.0, "wants": 200.0, "goals": 500.0}
    # ...while the live setting the Reopen warning reads still falls back.
    assert body["live_budget_type"] == "balanced"


# ══ RevenueCat unreachable: writes fail closed, reads fail open ════════════════

def test_writes_fail_closed_when_revenuecat_is_unreachable(
        client, free, unreachable_revenuecat, current_month):
    """Fail closed, but to a 403 the user can act on, never a 500 — the same posture
    as /playback/."""
    res = client.post("/savings/goal/", headers=LIMITS, json={"title": "Holiday"})
    assert res.status_code == 403 and res.json()["code"] == "goal_limit_reached"

    res = client.patch("/settings/", headers=LIMITS, json={"budget_type": "wealth_builder"})
    assert res.status_code == 403 and res.json()["code"] == "budget_type_locked"

    res = client.post("/savings/transaction/", headers=LIMITS, json={
        "title": "x", "amount": 10.0, "type": "deposit", "goal_id": free["locked"],
        "day": 1, "month": current_month, "source": "income"})
    assert res.status_code == 403 and res.json()["code"] == "goal_locked"


def test_reads_do_not_downgrade_when_revenuecat_is_unreachable(
        client, free, unreachable_revenuecat, current_month):
    """A dashboard must not drop a paying user to Balanced because a lookup timed
    out, and their goals must not gray out either."""
    body = client.get(f"/dashboard/{current_month}", headers=LIMITS).json()
    assert body["budget_type"]["key"] == "wealth_builder"
    assert body["live_budget_type"] == "wealth_builder"

    assert all(g["locked"] is False
               for g in client.get("/savings/goal/", headers=LIMITS).json()["data"])

    ent = client.get("/me/entitlements/", headers=LIMITS).json()
    assert ent["max_goals"] is None
    assert ent["budget_types"] == ALL_BUDGET_TYPES
    assert ent["video_series"] == "all"


def test_the_two_postures_are_reachable_on_one_resolver(free, unreachable_revenuecat):
    """Stated directly, because it is the one place the object is deliberately of two
    minds and a future refactor could quietly collapse it to one."""
    ent = main._entitlements(USER_A, {"limits"})
    assert ent.lookup_unavailable is True
    assert ent.enforced is True, "a gate refuses"
    assert ent.enforced_on_reads is False, "a read does not downgrade"

    # Every accessor a gate uses has to take the write posture explicitly. Reading a
    # gate off the fail-open side is exactly how this went wrong once: the settings
    # gate compared against `budget_types` and let wealth_builder through an outage
    # while _live_budget_type went on resolving the month to balanced.
    assert ent.budget_types_for(write=True) == ("balanced",)
    assert ent.at_goal_cap() is True
    assert ent.locked_goal_ids(write=True) == frozenset({free["locked"]})

    # ...and every accessor a RESPONSE is built from takes the fail-open side.
    assert set(ent.budget_types) == set(ALL_BUDGET_TYPES)
    assert ent.max_goals is None
    assert ent.locked_goal_ids() == frozenset()


# ══ The frozen premium_required response ═══════════════════════════════════════

FROZEN_PREMIUM_REQUIRED = {
    "code": "premium_required",
    "detail": "This series is part of DollarSeeds Premium.",
}


@pytest.mark.parametrize("headers", [
    pytest.param(v2(USER_A, "premium"), id="premium"),
    pytest.param(v2(USER_A, "premium, social"), id="premium+social"),
    pytest.param(v2(USER_A, "premium, social, limits"), id="premium+social+limits"),
])
def test_the_premium_required_body_is_byte_identical(client, supabase_db, premium_on, headers):
    """PremiumRequired now carries a code and a detail, and the shipped build branches
    on that exact string. Raised bare, it must produce what it has always produced."""
    supabase_db.seed("lesson_series", {"id": "s-prem", "title": "Premium", "creator": "DS",
                                       "description": "d", "thumbnail_url": "u",
                                       "is_published": True, "is_premium": True,
                                       "sort_order": 0})
    supabase_db.seed("lessons", {"id": "l-prem", "series_id": "s-prem", "title": "P1",
                                 "sort_order": 0, "video_id": "p/1.mp4"})

    res = client.get("/lessons/l-prem/playback/", headers=headers)
    assert res.status_code == 403
    assert res.json() == FROZEN_PREMIUM_REQUIRED


def test_raising_it_bare_is_still_the_frozen_pair():
    exc = main.PremiumRequired()
    assert exc.code == "premium_required"
    assert exc.detail == FROZEN_PREMIUM_REQUIRED["detail"]


@pytest.mark.parametrize("code", ["goal_limit_reached", "budget_type_locked", "goal_locked"])
def test_every_new_code_has_its_own_plain_english_detail(code):
    details = {c: main.PremiumRequired(c).detail for c in main.PREMIUM_REQUIRED_DETAILS}
    assert len(set(details.values())) == len(details), "each code says something different"
    assert main.PremiumRequired(code).detail.endswith("."), code


# ══ LIMITS_TEST_USER_IDS ═══════════════════════════════════════════════════════

@pytest.fixture
def test_account(monkeypatch):
    """USER_A listed, USER_B not. No `premium_on`: the whole point is enforcing while
    the kill switch is still off."""
    monkeypatch.setattr(main, "LIMITS_TEST_USER_IDS", frozenset({USER_A}))


@pytest.fixture
def two_goals_each(supabase_db):
    goal(supabase_db, "Emergency fund")
    goal(supabase_db, "Emergency fund B", user_id=USER_B)
    return supabase_db


def test_a_listed_user_is_enforced_while_the_flag_is_off(client, two_goals_each, test_account):
    assert main._premium_enabled() is False

    res = client.post("/savings/goal/", headers=LIMITS, json={"title": "New car"})
    assert res.status_code == 403
    assert res.json()["code"] == "goal_limit_reached"

    res = client.patch("/settings/", headers=LIMITS, json={"budget_type": "wealth_builder"})
    assert res.status_code == 403
    assert res.json()["code"] == "budget_type_locked"

    assert client.get("/me/entitlements/", headers=LIMITS).json()["max_goals"] == 1


def test_an_unlisted_user_is_untouched(client, two_goals_each, test_account):
    res = client.post("/savings/goal/", headers=LIMITS_B, json={"title": "New car B"})
    assert res.status_code == 200, res.text
    assert client.patch("/settings/", headers=LIMITS_B,
                        json={"budget_type": "wealth_builder"}).status_code == 200
    assert client.get("/me/entitlements/", headers=LIMITS_B).json()["max_goals"] is None


def test_a_listed_user_without_the_marker_is_untouched(client, two_goals_each, test_account):
    assert client.post("/savings/goal/", headers=auth(USER_A),
                       json={"title": "New car"}).status_code == 200
    assert client.patch("/settings/", headers=v2(USER_A, "premium, social"),
                        json={"budget_type": "wealth_builder"}).status_code == 200


def test_a_listed_user_still_gets_free_videos_and_an_honest_config(
        client, supabase_db, test_account):
    """The switch must not leak into the OTHER gate. /config/ is what the live premium
    build reads to decide what to lock, and /playback/ is what it locks."""
    supabase_db.seed("lesson_series", {"id": "s-prem", "title": "Premium", "creator": "DS",
                                       "description": "d", "thumbnail_url": "u",
                                       "is_published": True, "is_premium": True,
                                       "sort_order": 0})
    supabase_db.seed("lessons", {"id": "l-prem", "series_id": "s-prem", "title": "P1",
                                 "sort_order": 0, "video_id": "p/1.mp4"})

    assert client.get("/config/").json()["premium_enabled"] is False
    assert client.get("/lessons/l-prem/playback/", headers=APP).status_code == 200
    assert client.get("/lessons/l-prem/playback/", headers=v2(USER_A, "premium")).status_code == 200


def test_an_unset_switch_changes_nothing(client, two_goals_each, monkeypatch):
    monkeypatch.setattr(main, "LIMITS_TEST_USER_IDS", main._parse_user_id_list(None))
    assert client.post("/savings/goal/", headers=LIMITS, json={"title": "New car"}).status_code == 200


def test_an_empty_switch_changes_nothing(client, two_goals_each, monkeypatch):
    monkeypatch.setattr(main, "LIMITS_TEST_USER_IDS", main._parse_user_id_list("  , ,"))
    assert client.post("/savings/goal/", headers=LIMITS, json={"title": "New car"}).status_code == 200


@pytest.mark.parametrize("raw,expected", [
    (None, set()),
    ("", set()),
    ("   ", set()),
    (",,", set()),
    ("a", {"a"}),
    (" a , b ", {"a", "b"}),
    ("a,,b,", {"a", "b"}),
    ("a\n, b\t", {"a", "b"}),
])
def test_the_id_list_is_parsed_forgivingly(raw, expected):
    assert main._parse_user_id_list(raw) == expected


def test_a_listed_user_who_pays_is_not_enforced(client, two_goals_each, test_account):
    sub(two_goals_each)
    assert client.post("/savings/goal/", headers=LIMITS, json={"title": "New car"}).status_code == 200
