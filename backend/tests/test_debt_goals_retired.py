"""Debt goals are retired for `limits` builds (section 3 of the debts/Goals rework).

Debts live on the Debts tab now. For a build that sends `limits`:
  * a user-created debt goal holding $0 is left out of every list it reads;
  * one still holding money stays listed (money is never hidden) and deletable, but
    takes no new deposits or transfers;
  * neither counts toward the free goal cap, can be locked, or takes the active slot;
  * the Reconciliation goal (goal_type 'debt' too) is untouched.

Every build WITHOUT `limits` sees debt goals exactly as before — proved at the end of
this file against all three shipped generations.
"""

from __future__ import annotations

import pytest

import main
from conftest import USER_A, auth, v2

LIMITS = v2(USER_A, "premium, social, limits")
GENERATIONS = [
    pytest.param(auth(USER_A), id="no-marker"),
    pytest.param(v2(USER_A, "premium"), id="premium"),
    pytest.param(v2(USER_A, "premium, social"), id="premium+social"),
]


def goal(db, title, **over):
    return db.seed("savings_goals", {"user_id": USER_A, "title": title, "target_amount": 1000.0, **over})


def deposit(db, goal_id, amount, month="January", **over):
    return db.seed("savings_transactions", {"user_id": USER_A, "goal_id": goal_id, "title": "x",
                                            "amount": amount, "type": "deposit", "day": 1,
                                            "month": month, **over})


@pytest.fixture
def account(supabase_db):
    """General Savings, two $0 debt goals (oldest of all), one funded debt goal, the
    Reconciliation goal, and one savings goal."""
    db = supabase_db
    general = goal(db, "General Savings", is_general=True, target_amount=None)
    empty_a = goal(db, "Old card", goal_type="debt")
    empty_b = goal(db, "Car loan", goal_type="debt")
    # A debt goal that once had money and was paid back down to $0 is still $0.
    deposit(db, empty_b["id"], 50.0)
    db.seed("savings_transactions", {"user_id": USER_A, "goal_id": empty_b["id"], "title": "x",
                                     "amount": 50.0, "type": "withdrawal", "day": 2, "month": "January"})
    funded = goal(db, "Student loan", goal_type="debt")
    deposit(db, funded["id"], 120.0)
    recon = goal(db, "Reconciliation", goal_type="debt", is_reconciliation=True, target_amount=0.0)
    saving = goal(db, "Trip")
    return {"db": db, "general": general["id"], "empty_a": empty_a["id"], "empty_b": empty_b["id"],
            "funded": funded["id"], "recon": recon["id"], "saving": saving["id"]}


def ids(res):
    assert res.status_code == 200, res.text
    return [g["id"] for g in res.json()["data"]]


@pytest.fixture
def free(account, premium_on):
    """The same account on an enforced free tier: kill switch on, no subscription."""
    return account


# ══ the lists ═════════════════════════════════════════════════════════════════

def test_zero_dollar_debt_goals_are_not_listed(client, account):
    listed = ids(client.get("/savings/goal/", headers=LIMITS))
    assert account["empty_a"] not in listed and account["empty_b"] not in listed
    # Money is never hidden; the auto-managed goals are untouched.
    for key in ("general", "funded", "recon", "saving"):
        assert account[key] in listed


def test_completed_zero_dollar_debt_goals_are_not_listed(client, account):
    db = account["db"]
    done = goal(db, "Paid card", goal_type="debt", completed=True)
    kept = goal(db, "Old saving", completed=True)
    # Completed through the legacy flag-only route: the money never came out.
    held = goal(db, "Legacy debt", goal_type="debt", completed=True)
    deposit(db, held["id"], 30.0)
    listed = ids(client.get("/savings/goal/completed/", headers=LIMITS))
    assert done["id"] not in listed
    assert kept["id"] in listed and held["id"] in listed


def test_the_reconciliation_goal_is_unchanged(client, account):
    recon = next(g for g in client.get("/savings/goal/", headers=LIMITS).json()["data"]
                 if g["id"] == account["recon"])
    old = next(g for g in client.get("/savings/goal/", headers=auth(USER_A)).json()["data"]
               if g["id"] == account["recon"])
    assert {k: v for k, v in recon.items() if k != "locked"} == old
    assert recon["locked"] is False


# ══ the free tier ═════════════════════════════════════════════════════════════

def test_debt_goals_do_not_use_up_the_free_goal(client, free):
    ent = client.get("/me/entitlements/", headers=LIMITS).json()
    assert (ent["max_goals"], ent["goals_used"]) == (1, 1)    # only "Trip"


def test_a_free_user_with_only_debt_goals_can_create_their_savings_goal(client, free):
    db = free["db"]
    db.tables["savings_goals"] = [g for g in db.rows("savings_goals") if g["id"] != free["saving"]]
    assert client.get("/me/entitlements/", headers=LIMITS).json()["goals_used"] == 0
    res = client.post("/savings/goal/", headers=LIMITS, json={"title": "Emergency fund", "target_amount": 900})
    assert res.status_code == 200, res.text
    # ...and it is the active one, although every debt goal is older.
    listed = client.get("/savings/goal/", headers=LIMITS).json()["data"]
    new = next(g for g in listed if g["title"] == "Emergency fund")
    assert new["locked"] is False
    # The cap now applies to the second savings goal, as usual.
    again = client.post("/savings/goal/", headers=LIMITS, json={"title": "Car", "target_amount": 900})
    assert again.status_code == 403 and again.json()["code"] == "goal_limit_reached"


def test_debt_goals_are_never_locked_and_never_take_the_active_slot(client, free):
    listed = {g["id"]: g["locked"] for g in client.get("/savings/goal/", headers=LIMITS).json()["data"]}
    assert listed[free["funded"]] is False
    # The debt goals are older, but the savings goal is the active one.
    assert listed[free["saving"]] is False
    assert main._entitlements(USER_A, {"limits"}).active_goal_id() == free["saving"]


# ══ new money ═════════════════════════════════════════════════════════════════

def test_a_debt_goal_takes_no_new_deposit(client, account, current_month):
    res = client.post("/savings/transaction/", headers=LIMITS, json={
        "title": "Student loan", "amount": 10, "type": "deposit", "day": 1,
        "month": current_month, "goal_id": account["funded"]})
    assert res.status_code == 409 and res.json()["detail"] == main.RETIRED_DEBT_GOAL_DETAIL


def test_a_debt_goal_takes_no_transfer(client, account, current_month):
    deposit(account["db"], account["general"], 500.0)
    res = client.post("/savings/transfer/", headers=LIMITS, json={
        "amount": 10, "to_goal_id": account["funded"], "general_goal_id": account["general"],
        "day": 1, "month": current_month, "to_goal_title": "Student loan"})
    assert res.status_code == 409
    assert all(t.get("source") != "transfer" for t in account["db"].rows("savings_transactions"))


def test_the_reconciliation_goal_still_takes_repayments(client, account, current_month):
    res = client.post("/savings/transaction/", headers=LIMITS, json={
        "title": "Reconciliation", "amount": 10, "type": "deposit", "day": 1,
        "month": current_month, "goal_id": account["recon"]})
    assert res.status_code == 200, res.text


def test_a_funded_debt_goal_can_be_deleted_and_its_money_goes_to_general_savings(client, account,
                                                                                 current_month):
    res = client.delete(f"/savings/goal/{account['funded']}", headers=LIMITS,
                        params={"current_month": current_month})
    assert res.status_code == 200, res.text
    rows = account["db"].rows("savings_transactions")
    assert any(t["goal_id"] == account["general"] and t["amount"] == 120.0
               and t["title"] == "Returned from deleted goal" for t in rows)


# ══ the home ══════════════════════════════════════════════════════════════════

def test_the_home_goals_ring_leaves_out_every_debt_goal(client, account):
    goals = client.get("/home/progress/", headers=LIMITS).json()["goals"]
    # Only "Trip": every user debt goal is gone, funded or not (General Savings and
    # Reconciliation are never listed).
    assert goals["total_count"] == 1
    old = client.get("/home/progress/", headers=auth(USER_A)).json()["goals"]
    assert old["total_count"] == 4


def test_a_funded_legacy_debt_goal_never_reaches_the_home(client, supabase_db):
    """The production case: a funded "Student Loan" debt goal at 15% showed as
    "Student Loan is 15% there" and counted in the ring. For a limits client it is in
    none of the ring's counts, the nearest goal, the saved series, the milestones or
    goals_near_completion. It stays on the Goals tab, where its money is."""
    db = supabase_db
    goal(db, "General Savings", is_general=True, target_amount=None)
    loan = goal(db, "Student Loan", goal_type="debt", created_at="2026-02-01T00:00:00+00:00")
    deposit(db, loan["id"], 150.0, created_at="2026-03-05T00:00:00+00:00")       # 15% of 1000
    near = goal(db, "Car note", goal_type="debt", created_at="2026-02-02T00:00:00+00:00")
    deposit(db, near["id"], 950.0, created_at="2026-03-06T00:00:00+00:00")       # 95%: "near completion"
    paid = goal(db, "Old card", goal_type="debt", completed=True, completed_amount=400.0,
                completed_at="2026-04-01T00:00:00+00:00", created_at="2026-01-01T00:00:00+00:00")
    deposit(db, paid["id"], 400.0, created_at="2026-03-01T00:00:00+00:00")
    db.seed("savings_transactions", {"user_id": USER_A, "goal_id": paid["id"], "title": "x", "amount": 400.0,
                                     "type": "withdrawal", "day": 1, "month": "April",
                                     "created_at": "2026-04-01T00:00:00+00:00"})
    trip = goal(db, "Trip", target_amount=200.0, created_at="2026-02-03T00:00:00+00:00")
    deposit(db, trip["id"], 100.0, created_at="2026-03-07T00:00:00+00:00")       # 50%

    goals = client.get("/home/progress/", headers=LIMITS).json()["goals"]
    assert (goals["total_count"], goals["completed_count"]) == (1, 0)
    assert goals["nearest"] == {"id": trip["id"], "title": "Trip", "pct": 0.5}
    assert goals["total_saved"] == 100.0
    assert goals["series"][-1]["cumulative"] == 100.0
    assert goals["milestones"] == []

    summary = client.get("/home/summary/", headers=LIMITS, params={"month": "March"}).json()
    assert summary["goals_near_completion"] == []

    # The Goals tab still lists both funded debt goals (their money is never hidden).
    listed = [g["id"] for g in client.get("/savings/goal/", headers=LIMITS).json()["data"]]
    assert loan["id"] in listed and near["id"] in listed

    # A build without limits keeps today's ring, debt goals and all.
    old = client.get("/home/progress/", headers=auth(USER_A)).json()["goals"]
    assert (old["total_count"], old["completed_count"]) == (4, 1)
    assert old["nearest"]["title"] == "Car note"
    assert old["milestones"] == [{"month": "2026-04", "name": "Old card"}]


def test_the_nearest_goal_is_never_a_hidden_debt_goal(client, account):
    db = account["db"]
    db.tables["savings_goals"] = [g for g in db.rows("savings_goals")
                                  if g["id"] not in (account["funded"], account["saving"])]
    goals = client.get("/home/progress/", headers=LIMITS).json()["goals"]
    assert goals is None    # nothing left but General Savings and Reconciliation


# ══ every build without `limits` is unchanged ═════════════════════════════════

@pytest.mark.parametrize("headers", GENERATIONS)
def test_old_builds_still_see_and_fund_every_debt_goal(client, account, current_month, headers):
    listed = ids(client.get("/savings/goal/", headers=headers))
    assert account["empty_a"] in listed and account["empty_b"] in listed
    res = client.post("/savings/transaction/", headers=headers, json={
        "title": "Old card", "amount": 10, "type": "deposit", "day": 1,
        "month": current_month, "goal_id": account["empty_a"]})
    assert res.status_code == 200, res.text
    created = client.post("/savings/goal/", headers=headers,
                          json={"title": "New debt", "target_amount": 100, "goal_type": "debt"})
    assert created.status_code == 200 and created.json()["data"][0]["goal_type"] == "debt"


@pytest.mark.parametrize("headers", GENERATIONS)
def test_old_builds_issue_no_new_query_for_a_deposit(client, account, current_month, headers):
    db = account["db"]
    db.selects.clear()
    client.post("/savings/transaction/", headers=headers, json={
        "title": "x", "amount": 10, "type": "deposit", "day": 1,
        "month": current_month, "goal_id": account["saving"]})
    goal_selects = [cols for table, cols in db.selects if table == "savings_goals"]
    assert goal_selects == [["id"]], goal_selects    # _assert_owns_goals only
