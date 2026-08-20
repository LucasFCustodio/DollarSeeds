"""Regression tests — every existing app feature still works with a valid token.

This is the other half of the acceptance bar. Adding authentication must not change
what the app does for a legitimate user, and this is the first release, so a
regression here is a shipped bug. Each test drives a route the way a screen drives it
and asserts on the actual numbers/rows, not just the status code.

Reading order follows the app: dashboard → income → expenses → settings → savings →
goals → rollover → lessons → account.
"""

from __future__ import annotations

from conftest import USER_A, auth

HEADERS = auth(USER_A)


# ══ Dashboard ═══════════════════════════════════════════════════════════════════

def test_dashboard_splits_income_by_the_balanced_5030_20_rule(client, supabase_db, current_month):
    supabase_db.seed("income", {"user_id": USER_A, "amount": 4000.0, "day": 1, "month": current_month})
    supabase_db.seed("expenses", {"user_id": USER_A, "title": "Rent", "amount": 1500.0,
                                  "category": "Needs", "day": 2, "month": current_month})
    supabase_db.seed("expenses", {"user_id": USER_A, "title": "Dining", "amount": 300.0,
                                  "category": "Wants", "day": 3, "month": current_month})
    supabase_db.seed("savings_transactions", {"user_id": USER_A, "title": "Save", "amount": 500.0,
                                              "type": "deposit", "source": "income", "day": 4,
                                              "month": current_month})

    body = client.get(f"/dashboard/{current_month}", headers=HEADERS).json()

    assert body["total_income"] == 4000.0
    assert body["budgets"] == {"needs": 2000.0, "wants": 1200.0, "goals": 800.0}
    assert body["expenses"] == {"needs": 1500.0, "wants": 300.0, "goals": 500.0}
    assert body["budget_type"]["key"] == "balanced"
    assert body["tithe"]["enabled"] is False
    assert body["compliance_score"]["overall"] is not None


def test_dashboard_excludes_transfers_and_rollover_from_the_goals_bucket(client, supabase_db, current_month):
    """Only source='income' deposits consume the Goals budget — the isolation the
    rollover feature depends on."""
    supabase_db.seed("income", {"user_id": USER_A, "amount": 1000.0, "day": 1, "month": current_month})
    for source in ("transfer", "rollover", "opening"):
        supabase_db.seed("savings_transactions", {"user_id": USER_A, "title": source, "amount": 100.0,
                                                  "type": "deposit", "source": source, "day": 2,
                                                  "month": current_month})

    body = client.get(f"/dashboard/{current_month}", headers=HEADERS).json()
    assert body["expenses"]["goals"] == 0


def test_dashboard_applies_the_live_tithe_setting_to_the_current_month(client, supabase_db, current_month):
    supabase_db.seed("user_settings", {"user_id": USER_A, "tithe_enabled": True, "tithe_rate": 0.10})
    supabase_db.seed("income", {"user_id": USER_A, "amount": 1000.0, "day": 1, "month": current_month})

    body = client.get(f"/dashboard/{current_month}", headers=HEADERS).json()

    assert body["tithe"] == {"enabled": True, "rate": 0.10, "amount": 100.0}
    # Tithe is carved out FIRST; the split applies to the remaining $900.
    assert body["budgets"]["needs"] == 450.0
    assert body["budgets"]["wants"] == 270.0
    assert body["budgets"]["goals"] == 180.0


def test_dashboard_uses_the_frozen_snapshot_for_past_months(client, supabase_db, past_month):
    """A past month keeps the tithe/split that were active then, even after the user
    changes their settings."""
    supabase_db.seed("user_settings", {"user_id": USER_A, "tithe_enabled": False,
                                       "tithe_rate": 0.10, "budget_type": "wealth_builder"})
    supabase_db.seed("income", {"user_id": USER_A, "amount": 1000.0, "day": 1, "month": past_month,
                                "tithe_enabled": True, "tithe_rate": 0.10, "budget_type": "balanced"})

    body = client.get(f"/dashboard/{past_month}", headers=HEADERS).json()

    assert body["tithe"]["amount"] == 100.0, "past month should keep its tithe snapshot"
    assert body["budget_type"]["key"] == "balanced", "past month should keep its split snapshot"


def test_dashboard_honours_the_selected_budget_type(client, supabase_db, current_month):
    supabase_db.seed("user_settings", {"user_id": USER_A, "tithe_enabled": False,
                                       "tithe_rate": 0.10, "budget_type": "firm_foundation"})
    supabase_db.seed("income", {"user_id": USER_A, "amount": 1000.0, "day": 1, "month": current_month})

    body = client.get(f"/dashboard/{current_month}", headers=HEADERS).json()
    assert body["budget_type"]["key"] == "firm_foundation"
    assert body["budgets"] == {"needs": 700.0, "wants": 100.0, "goals": 200.0}


def test_dashboard_with_no_data_returns_zeroes_not_an_error(client):
    body = client.get("/dashboard/March", headers=HEADERS).json()
    assert body["total_income"] == 0
    assert body["compliance_score"]["overall"] is None


def test_spending_trends_skips_empty_months_and_reports_quartiles(client, supabase_db, past_month):
    supabase_db.seed("income", {"user_id": USER_A, "amount": 2000.0, "day": 1, "month": past_month})
    supabase_db.seed("expenses", {"user_id": USER_A, "title": "a", "amount": 100.0,
                                  "category": "Wants", "day": 5, "month": past_month})
    supabase_db.seed("expenses", {"user_id": USER_A, "title": "b", "amount": 300.0,
                                  "category": "Wants", "day": 20, "month": past_month})

    data = client.get("/dashboard/trends/", headers=HEADERS).json()["data"]

    assert [m["month"] for m in data] == [past_month]
    month = data[0]
    assert month["total_income"] == 2000.0
    assert month["wants"] == 400.0
    assert month["budgets"]["needs"] == 1000.0
    assert month["wants_quartiles"]["q100"] == 20


# ══ Income ══════════════════════════════════════════════════════════════════════

def test_add_income_snapshots_the_current_tithe_and_budget_type(client, supabase_db, current_month):
    supabase_db.seed("user_settings", {"user_id": USER_A, "tithe_enabled": True,
                                       "tithe_rate": 0.12, "budget_type": "wealth_builder"})

    res = client.post("/income/", headers=HEADERS, json={
        "user_id": USER_A, "amount": 2500.0, "day": 15, "month": current_month,
        "title": "Paycheck", "source": "Salary",
    })
    assert res.status_code == 200

    row = supabase_db.rows("income")[0]
    assert row["amount"] == 2500.0
    assert row["title"] == "Paycheck"
    assert row["tithe_enabled"] is True
    assert row["tithe_rate"] == 0.12
    assert row["budget_type"] == "wealth_builder"


def test_add_income_defaults_the_snapshot_when_settings_are_untouched(client, supabase_db, current_month):
    client.post("/income/", headers=HEADERS, json={"amount": 100.0, "day": 1, "month": current_month})
    row = supabase_db.rows("income")[0]
    assert row["tithe_enabled"] is False
    assert row["tithe_rate"] == 0.10
    assert row["budget_type"] == "balanced"


def test_a_blank_income_title_is_stored_as_null_not_as_the_source(client, supabase_db, current_month):
    """The app used to POST `title: title.trim() || source`, which copied the source
    chip into the title and made every entry in "View all income" read "Paycheck" —
    the row's own title and source became the same string, so the list could not tell
    "the user named this" from "the user named nothing". The client now sends null and
    resolves the fallback at render; the server has to accept that without complaint,
    and must not substitute anything of its own.

    Old binaries still send the copied source, and those rows keep working: the column
    is nullable either way and nothing here is backfilled."""
    res = client.post("/income/", headers=HEADERS, json={
        "amount": 1200.0, "day": 4, "month": current_month,
        "title": None, "source": "Paycheck",
    })
    assert res.status_code == 200

    row = supabase_db.rows("income")[0]
    assert row["title"] is None, "a blank title must not be backfilled from the source"
    assert row["source"] == "Paycheck"

    # And it survives the round trip the details screen actually makes.
    listed = client.get("/income/details/", params={"month": current_month},
                        headers=HEADERS).json()["data"]
    assert listed[0]["title"] is None
    assert listed[0]["source"] == "Paycheck"


def test_income_details_and_delete(client, supabase_db, current_month):
    client.post("/income/", headers=HEADERS, json={"amount": 900.0, "day": 3, "month": current_month})

    listed = client.get("/income/details/", params={"month": current_month}, headers=HEADERS).json()["data"]
    assert len(listed) == 1
    income_id = listed[0]["id"]

    res = client.delete(f"/income/delete/{income_id}", headers=HEADERS)
    assert res.status_code == 200
    assert supabase_db.rows("income") == []


def test_funding_months_lists_earlier_open_months_with_income(client, supabase_db):
    supabase_db.seed("income", {"user_id": USER_A, "amount": 500.0, "day": 1, "month": "January"})
    supabase_db.seed("income", {"user_id": USER_A, "amount": 700.0, "day": 1, "month": "February"})
    supabase_db.seed("income", {"user_id": USER_A, "amount": 900.0, "day": 1, "month": "May"})
    supabase_db.seed("month_status", {"user_id": USER_A, "month": "February", "closed_at": "2026-03-01T00:00:00Z"})

    data = client.get("/income/funding-months/", params={"current_month": "April"},
                      headers=HEADERS).json()["data"]

    assert data == [{"month": "January", "income": 500.0}], "closed and later months must be excluded"


# ══ Expenses ════════════════════════════════════════════════════════════════════

def test_add_list_and_delete_an_expense(client, supabase_db, current_month):
    res = client.post("/expenses/", headers=HEADERS, json={
        "user_id": USER_A, "title": "Groceries", "amount": 120.5,
        "category": "Needs", "day": 8, "month": current_month, "sub_category": "Food",
    })
    assert res.status_code == 200

    listed = client.get("/expenses/details/", headers=HEADERS,
                        params={"month": current_month, "category": "Needs"}).json()["data"]
    assert len(listed) == 1
    assert listed[0]["title"] == "Groceries"
    assert listed[0]["sub_category"] == "Food"

    assert client.delete(f"/expenses/delete/{listed[0]['id']}", headers=HEADERS).status_code == 200
    assert supabase_db.rows("expenses") == []


def test_expense_details_rejects_unknown_categories(client, current_month):
    res = client.get("/expenses/details/", headers=HEADERS,
                     params={"month": current_month, "category": "Bogus"})
    assert res.status_code == 200
    assert res.json()["data"] == []


def test_legacy_goals_expenses_remain_readable(client, supabase_db, past_month):
    """The old 'Investments' bucket wrote category='Goals'. Past-month screens still
    need those rows even though nothing creates them anymore."""
    supabase_db.seed("expenses", {"user_id": USER_A, "title": "Old investment", "amount": 250.0,
                                  "category": "Goals", "day": 4, "month": past_month})
    data = client.get("/expenses/details/", headers=HEADERS,
                      params={"month": past_month, "category": "Goals"}).json()["data"]
    assert len(data) == 1


# ══ Settings ════════════════════════════════════════════════════════════════════

def test_settings_are_created_lazily_on_first_read(client, supabase_db):
    body = client.get("/settings/", headers=HEADERS).json()["data"]
    assert body["user_id"] == USER_A
    assert body["tithe_enabled"] is False
    assert body["tithe_rate"] == 0.10
    assert len(supabase_db.rows("user_settings")) == 1


def test_settings_patch_updates_each_field_independently(client, supabase_db):
    client.get("/settings/", headers=HEADERS)  # create the row

    client.patch("/settings/", headers=HEADERS, json={"user_id": USER_A, "tithe_enabled": True})
    client.patch("/settings/", headers=HEADERS, json={"user_id": USER_A, "tithe_rate": 0.15})
    client.patch("/settings/", headers=HEADERS, json={"user_id": USER_A, "budget_type": "wealth_builder"})
    res = client.patch("/settings/", headers=HEADERS,
                       json={"user_id": USER_A, "firm_foundation_goals_prompted": True})

    assert res.status_code == 200
    row = supabase_db.rows("user_settings")[0]
    assert row["tithe_enabled"] is True
    assert row["tithe_rate"] == 0.15, "a later PATCH must not clobber an earlier field"
    assert row["budget_type"] == "wealth_builder"
    assert row["firm_foundation_goals_prompted"] is True


def test_settings_patch_rejects_an_unknown_budget_type(client):
    res = client.patch("/settings/", headers=HEADERS, json={"user_id": USER_A, "budget_type": "yolo"})
    assert res.status_code == 400


def test_settings_patch_with_no_fields_is_a_no_op(client):
    res = client.patch("/settings/", headers=HEADERS, json={"user_id": USER_A})
    assert res.status_code == 200
    assert res.json()["data"]["user_id"] == USER_A


# ══ Savings ═════════════════════════════════════════════════════════════════════

def test_savings_deposit_withdrawal_and_balance(client, current_month):
    client.post("/savings/transaction/", headers=HEADERS, json={
        "user_id": USER_A, "title": "Deposit", "amount": 300.0, "type": "deposit",
        "day": 2, "month": current_month, "source": "income"})
    client.post("/savings/transaction/", headers=HEADERS, json={
        "user_id": USER_A, "title": "Withdrawal", "amount": 100.0, "type": "withdrawal",
        "day": 5, "month": current_month, "source": "income"})

    assert client.get("/savings/balance/", headers=HEADERS).json()["balance"] == 200.0


def test_savings_history_filters_by_month_and_is_newest_first(client, supabase_db, current_month, past_month):
    supabase_db.seed("savings_transactions", {"user_id": USER_A, "title": "older", "amount": 10.0,
                                              "type": "deposit", "source": "income", "day": 1,
                                              "month": current_month})
    supabase_db.seed("savings_transactions", {"user_id": USER_A, "title": "newer", "amount": 20.0,
                                              "type": "deposit", "source": "income", "day": 2,
                                              "month": current_month})
    supabase_db.seed("savings_transactions", {"user_id": USER_A, "title": "other month", "amount": 30.0,
                                              "type": "deposit", "source": "income", "day": 3,
                                              "month": past_month})

    all_rows = client.get("/savings/history/", headers=HEADERS).json()["data"]
    assert [r["title"] for r in all_rows] == ["other month", "newer", "older"]

    scoped = client.get("/savings/history/", params={"month": current_month}, headers=HEADERS).json()["data"]
    assert [r["title"] for r in scoped] == ["newer", "older"]


def test_delete_a_savings_transaction(client, supabase_db, current_month):
    client.post("/savings/transaction/", headers=HEADERS, json={
        "title": "Oops", "amount": 50.0, "type": "deposit", "day": 1,
        "month": current_month, "source": "income"})
    tx_id = supabase_db.rows("savings_transactions")[0]["id"]

    assert client.delete(f"/savings/transaction/{tx_id}", headers=HEADERS).status_code == 200
    assert supabase_db.rows("savings_transactions") == []


def test_starting_balance_is_recorded_once_and_excluded_from_the_budget(client, supabase_db, current_month):
    res = client.post("/savings/starting-balance/", headers=HEADERS,
                      json={"user_id": USER_A, "amount": 5000.0, "day": 1, "month": current_month})
    assert res.json() == {"message": "Starting balance recorded.", "already_set": False}

    row = next(r for r in supabase_db.rows("savings_transactions") if r["title"] == "Starting balance")
    assert row["source"] == "opening"
    assert row["amount"] == 5000.0

    # Idempotent — the onboarding gate can fire twice without doubling the money.
    again = client.post("/savings/starting-balance/", headers=HEADERS,
                        json={"amount": 5000.0, "day": 1, "month": current_month})
    assert again.json()["already_set"] is True
    assert len([r for r in supabase_db.rows("savings_transactions") if r["source"] == "opening"]) == 1

    # It lands in savings but must not consume the Goals budget.
    assert client.get("/savings/balance/", headers=HEADERS).json()["balance"] == 5000.0
    assert client.get(f"/dashboard/{current_month}", headers=HEADERS).json()["expenses"]["goals"] == 0


def test_starting_balance_of_zero_records_nothing(client, supabase_db, current_month):
    """The amount > 0 CHECK on the table forbids a zero row; a user starting from
    nothing must still get through onboarding."""
    res = client.post("/savings/starting-balance/", headers=HEADERS,
                      json={"amount": 0, "day": 1, "month": current_month})
    assert res.json() == {"message": "No starting balance to record.", "already_set": False}
    assert supabase_db.rows("savings_transactions") == []


def test_transfer_writes_both_legs_and_history_collapses_them(client, supabase_db, current_month):
    goals = client.get("/savings/goal/", headers=HEADERS).json()["data"]
    general_id = next(g["id"] for g in goals if g["is_general"])
    client.post("/savings/goal/", headers=HEADERS, json={"title": "Car", "target_amount": 5000.0})
    car_id = next(g["id"] for g in supabase_db.rows("savings_goals") if g["title"] == "Car")

    res = client.post("/savings/transfer/", headers=HEADERS, json={
        "user_id": USER_A, "amount": 250.0, "to_goal_id": car_id, "general_goal_id": general_id,
        "day": 10, "month": current_month, "to_goal_title": "Car"})
    assert res.status_code == 200

    legs = supabase_db.rows("savings_transactions")
    assert len(legs) == 2
    assert {leg["type"] for leg in legs} == {"deposit", "withdrawal"}
    assert all(leg["source"] == "transfer" for leg in legs)
    assert len({leg["transfer_group"] for leg in legs}) == 1

    # Recent Activity shows ONE entry, the withdrawal leg, flagged is_transfer.
    history = client.get("/savings/history/", headers=HEADERS).json()["data"]
    assert len(history) == 1
    assert history[0]["is_transfer"] is True
    assert history[0]["title"] == "Transfer from General Savings to Car"

    # A transfer never changes total savings.
    assert client.get("/savings/balance/", headers=HEADERS).json()["balance"] == 0.0


def test_deleting_one_transfer_leg_removes_both(client, supabase_db, current_month):
    goals = client.get("/savings/goal/", headers=HEADERS).json()["data"]
    general_id = next(g["id"] for g in goals if g["is_general"])
    client.post("/savings/goal/", headers=HEADERS, json={"title": "Car"})
    car_id = next(g["id"] for g in supabase_db.rows("savings_goals") if g["title"] == "Car")
    client.post("/savings/transfer/", headers=HEADERS, json={
        "amount": 100.0, "to_goal_id": car_id, "general_goal_id": general_id,
        "day": 10, "month": current_month, "to_goal_title": "Car"})

    entry = client.get("/savings/history/", headers=HEADERS).json()["data"][0]
    client.delete(f"/savings/transaction/{entry['id']}", headers=HEADERS)

    assert supabase_db.rows("savings_transactions") == []


# ══ Goals ═══════════════════════════════════════════════════════════════════════

def test_general_savings_is_seeded_lazily(client, supabase_db):
    data = client.get("/savings/goal/", headers=HEADERS).json()["data"]
    assert [g["title"] for g in data] == ["General Savings"]
    assert data[0]["is_general"] is True
    # Calling again must not create a second one.
    client.get("/savings/goal/", headers=HEADERS)
    assert len([g for g in supabase_db.rows("savings_goals") if g.get("is_general")]) == 1


def test_create_a_goal_and_see_its_allocated_amount(client, supabase_db, current_month):
    res = client.post("/savings/goal/", headers=HEADERS, json={
        "user_id": USER_A, "title": "Emergency fund", "target_amount": 3000.0,
        "target_month": "December", "target_year": 2026})
    assert res.status_code == 200
    goal_id = res.json()["data"][0]["id"]

    client.post("/savings/transaction/", headers=HEADERS, json={
        "title": "Emergency fund", "amount": 400.0, "type": "deposit", "goal_id": goal_id,
        "day": 3, "month": current_month, "source": "income"})

    goal = next(g for g in client.get("/savings/goal/", headers=HEADERS).json()["data"]
                if g["id"] == goal_id)
    assert goal["allocated_amount"] == 400.0
    assert goal["target_amount"] == 3000.0


def test_duplicate_goal_titles_are_rejected(client):
    client.post("/savings/goal/", headers=HEADERS, json={"title": "Car"})
    res = client.post("/savings/goal/", headers=HEADERS, json={"title": "Car"})
    assert res.status_code == 400


def test_debt_goals_can_be_filtered(client):
    client.post("/savings/goal/", headers=HEADERS, json={"title": "Car", "goal_type": "saving"})
    client.post("/savings/goal/", headers=HEADERS, json={"title": "Student loan", "goal_type": "debt"})

    debts = client.get("/savings/goal/", params={"goal_type": "debt"}, headers=HEADERS).json()["data"]
    assert [g["title"] for g in debts] == ["Student loan"]


def test_edit_a_goal_and_cascade_the_rename_to_its_transactions(client, supabase_db, current_month):
    goal_id = client.post("/savings/goal/", headers=HEADERS,
                          json={"title": "Vacation", "target_amount": 2000.0}).json()["data"][0]["id"]
    client.post("/savings/transaction/", headers=HEADERS, json={
        "title": "Vacation", "amount": 100.0, "type": "deposit", "goal_id": goal_id,
        "day": 1, "month": current_month, "source": "income"})
    supabase_db.seed("savings_transactions", {"user_id": USER_A, "title": "Returned from deleted goal",
                                              "amount": 5.0, "type": "deposit", "goal_id": goal_id,
                                              "source": "transfer", "day": 1, "month": current_month})

    res = client.patch(f"/savings/goal/{goal_id}", headers=HEADERS,
                       json={"user_id": USER_A, "title": "Big trip", "target_amount": 2500.0})
    assert res.status_code == 200

    goal = next(g for g in supabase_db.rows("savings_goals") if g["id"] == goal_id)
    assert goal["title"] == "Big trip"
    assert goal["target_amount"] == 2500.0

    titles = sorted(t["title"] for t in supabase_db.rows("savings_transactions"))
    assert titles == ["Big trip", "Returned from deleted goal"], "only rows with the OLD title rename"


def test_goal_edit_validation(client, supabase_db):
    goal_id = client.post("/savings/goal/", headers=HEADERS, json={"title": "Car"}).json()["data"][0]["id"]
    client.post("/savings/goal/", headers=HEADERS, json={"title": "Boat"})

    assert client.patch(f"/savings/goal/{goal_id}", headers=HEADERS,
                        json={"target_amount": -5}).status_code == 400
    assert client.patch(f"/savings/goal/{goal_id}", headers=HEADERS,
                        json={"title": "Boat"}).status_code == 400
    assert client.patch(f"/savings/goal/{goal_id}", headers=HEADERS, json={}).json()["message"] == "Nothing to update."


def test_auto_managed_goals_reject_edits_and_deletion(client, supabase_db, current_month):
    general_id = next(g["id"] for g in client.get("/savings/goal/", headers=HEADERS).json()["data"]
                      if g["is_general"])

    assert client.patch(f"/savings/goal/{general_id}", headers=HEADERS,
                        json={"title": "Renamed"}).status_code == 400
    assert client.delete(f"/savings/goal/{general_id}", headers=HEADERS,
                         params={"current_month": current_month}).status_code == 400

    recon = supabase_db.seed("savings_goals", {"user_id": USER_A, "title": "Reconciliation",
                                               "goal_type": "debt", "is_reconciliation": True,
                                               "target_amount": 0.0, "completed": False})
    assert client.patch(f"/savings/goal/{recon['id']}", headers=HEADERS,
                        json={"title": "Nope"}).status_code == 400
    assert client.delete(f"/savings/goal/{recon['id']}", headers=HEADERS,
                         params={"current_month": current_month}).status_code == 400


def test_mark_a_goal_complete_and_list_completed_goals(client, supabase_db):
    goal_id = client.post("/savings/goal/", headers=HEADERS, json={"title": "Laptop"}).json()["data"][0]["id"]

    assert client.patch(f"/savings/goal/{goal_id}/complete", headers=HEADERS).status_code == 200

    active = [g["title"] for g in client.get("/savings/goal/", headers=HEADERS).json()["data"]]
    completed = [g["title"] for g in client.get("/savings/goal/completed/", headers=HEADERS).json()["data"]]
    assert "Laptop" not in active
    assert completed == ["Laptop"]


def test_finish_a_goal_withdraws_its_balance_and_snapshots_it(client, supabase_db, current_month):
    goal_id = client.post("/savings/goal/", headers=HEADERS,
                          json={"title": "Camera", "target_amount": 800.0}).json()["data"][0]["id"]
    client.post("/savings/transaction/", headers=HEADERS, json={
        "title": "Camera", "amount": 800.0, "type": "deposit", "goal_id": goal_id,
        "day": 1, "month": current_month, "source": "income"})

    res = client.post(f"/savings/goal/{goal_id}/finish", headers=HEADERS,
                      json={"user_id": USER_A, "day": 20, "month": current_month})
    assert res.status_code == 200
    assert res.json()["allocated"] == 800.0
    assert res.json()["completed_amount"] == 800.0

    goal = next(g for g in supabase_db.rows("savings_goals") if g["id"] == goal_id)
    assert goal["completed"] is True
    assert goal["completed_amount"] == 800.0
    assert goal["completed_at"]

    # The money left the goal: a matching withdrawal exists and the balance is 0.
    assert client.get("/savings/balance/", headers=HEADERS).json()["balance"] == 0.0
    assert any(t["type"] == "withdrawal" and t["amount"] == 800.0
               for t in supabase_db.rows("savings_transactions"))


def test_finishing_an_already_completed_goal_is_rejected(client, current_month):
    goal_id = client.post("/savings/goal/", headers=HEADERS, json={"title": "Bike"}).json()["data"][0]["id"]
    client.post(f"/savings/goal/{goal_id}/finish", headers=HEADERS, json={"day": 1, "month": current_month})
    res = client.post(f"/savings/goal/{goal_id}/finish", headers=HEADERS,
                      json={"day": 1, "month": current_month})
    assert res.status_code == 400


def test_finish_self_heals_a_goal_left_at_zero_by_a_half_failed_finish(client, supabase_db, current_month):
    """Balance already 0 but deposits on record: snapshot what it HELD so the
    Completed card isn't blank, and skip the (already-made) withdrawal."""
    goal_id = client.post("/savings/goal/", headers=HEADERS, json={"title": "Desk"}).json()["data"][0]["id"]
    for tx_type in ("deposit", "withdrawal"):
        supabase_db.seed("savings_transactions", {"user_id": USER_A, "title": "Desk", "amount": 300.0,
                                                  "type": tx_type, "goal_id": goal_id, "source": "income",
                                                  "day": 1, "month": current_month})
    before = len(supabase_db.rows("savings_transactions"))

    res = client.post(f"/savings/goal/{goal_id}/finish", headers=HEADERS,
                      json={"day": 2, "month": current_month})

    assert res.json() == {"message": "Goal completed.", "allocated": 0.0, "completed_amount": 300.0}
    assert len(supabase_db.rows("savings_transactions")) == before, "must not withdraw twice"


def test_deleting_a_goal_returns_prior_month_funds_and_refunds_this_month(client, supabase_db,
                                                                          current_month, past_month):
    goal_id = client.post("/savings/goal/", headers=HEADERS, json={"title": "Trip"}).json()["data"][0]["id"]
    client.post("/savings/transaction/", headers=HEADERS, json={
        "title": "Trip", "amount": 200.0, "type": "deposit", "goal_id": goal_id,
        "day": 1, "month": past_month, "source": "income"})
    client.post("/savings/transaction/", headers=HEADERS, json={
        "title": "Trip", "amount": 75.0, "type": "deposit", "goal_id": goal_id,
        "day": 2, "month": current_month, "source": "income"})

    res = client.delete(f"/savings/goal/{goal_id}", headers=HEADERS,
                        params={"user_id": USER_A, "current_month": current_month})
    assert res.status_code == 200

    assert not any(g["id"] == goal_id for g in supabase_db.rows("savings_goals"))
    txs = supabase_db.rows("savings_transactions")
    assert not any(t["goal_id"] == goal_id for t in txs), "the goal's rows must be cleared"

    returned = [t for t in txs if t["title"] == "Returned from deleted goal"]
    assert len(returned) == 1, "the prior month's deposit comes back to General Savings"
    assert returned[0]["amount"] == 200.0
    assert returned[0]["month"] == past_month
    assert returned[0]["source"] == "transfer", "must not re-consume any month's Goals budget"

    # The current-month deposit is dropped instead, refunding this month's budget.
    assert client.get("/savings/balance/", headers=HEADERS).json()["balance"] == 200.0


def test_deleting_a_missing_goal_is_a_404(client, current_month):
    res = client.delete("/savings/goal/9999", headers=HEADERS, params={"current_month": current_month})
    assert res.status_code == 404


# ══ Rollover / month close ══════════════════════════════════════════════════════

def test_rollover_preview_reports_the_leftover_and_breakdown(client, supabase_db, current_month):
    supabase_db.seed("income", {"user_id": USER_A, "amount": 1000.0, "day": 1, "month": current_month})
    supabase_db.seed("expenses", {"user_id": USER_A, "title": "Rent", "amount": 400.0,
                                  "category": "Needs", "day": 2, "month": current_month})
    supabase_db.seed("expenses", {"user_id": USER_A, "title": "Fun", "amount": 100.0,
                                  "category": "Wants", "day": 3, "month": current_month})

    body = client.get("/rollover/preview/", params={"month": current_month}, headers=HEADERS).json()

    assert body["closed"] is False
    assert body["budgetable"] == 1000.0
    assert body["target_rollover"] == 500.0
    assert body["breakdown"]["needs"] == {"budget": 500.0, "spent": 400.0, "left": 100.0}
    assert body["breakdown"]["wants"] == {"budget": 300.0, "spent": 100.0, "left": 200.0}


def test_closing_a_month_moves_the_leftover_into_general_savings(client, supabase_db, current_month):
    supabase_db.seed("income", {"user_id": USER_A, "amount": 1000.0, "day": 1, "month": current_month})
    supabase_db.seed("expenses", {"user_id": USER_A, "title": "Rent", "amount": 600.0,
                                  "category": "Needs", "day": 2, "month": current_month})

    res = client.post("/rollover/close/", headers=HEADERS, json={"user_id": USER_A, "month": current_month})
    assert res.status_code == 200
    assert res.json()["rolled_over"] == 400.0

    entry = next(t for t in supabase_db.rows("savings_transactions") if t["source"] == "rollover")
    assert entry["amount"] == 400.0
    assert entry["type"] == "deposit"
    assert entry["title"] == f"Rollover — {current_month}"

    status = client.get(f"/dashboard/{current_month}", headers=HEADERS).json()["rollover"]
    assert status["closed"] is True
    assert status["amount"] == 400.0

    # Rollover money never touches the budget math.
    assert client.get(f"/dashboard/{current_month}", headers=HEADERS).json()["expenses"]["goals"] == 0


def test_closing_a_month_twice_is_idempotent(client, supabase_db, current_month):
    supabase_db.seed("income", {"user_id": USER_A, "amount": 500.0, "day": 1, "month": current_month})

    client.post("/rollover/close/", headers=HEADERS, json={"month": current_month})
    client.post("/rollover/close/", headers=HEADERS, json={"month": current_month})

    rollovers = [t for t in supabase_db.rows("savings_transactions") if t["source"] == "rollover"]
    assert len(rollovers) == 1
    assert rollovers[0]["amount"] == 500.0
    assert len(supabase_db.rows("month_status")) == 1


def test_a_closed_month_is_read_only_until_reopened(client, supabase_db, current_month):
    supabase_db.seed("income", {"user_id": USER_A, "amount": 500.0, "day": 1, "month": current_month})
    client.post("/rollover/close/", headers=HEADERS, json={"month": current_month})

    blocked = client.post("/expenses/", headers=HEADERS, json={
        "title": "Late", "amount": 10.0, "category": "Wants", "day": 28, "month": current_month})
    assert blocked.status_code == 409

    assert client.post("/rollover/reopen/", headers=HEADERS,
                       json={"user_id": USER_A, "month": current_month}).status_code == 200

    allowed = client.post("/expenses/", headers=HEADERS, json={
        "title": "Late", "amount": 10.0, "category": "Wants", "day": 28, "month": current_month})
    assert allowed.status_code == 200


def test_spending_after_close_books_reconciliation_debt(client, supabase_db, current_month):
    """Scenario 4: reopen a closed month, spend more, close again. The clawback can't
    take more than General Savings holds, so the shortfall lands on the auto-managed
    Reconciliation debt goal — never on a user-created goal."""
    supabase_db.seed("income", {"user_id": USER_A, "amount": 1000.0, "day": 1, "month": current_month})
    client.post("/rollover/close/", headers=HEADERS, json={"month": current_month})
    assert client.get("/savings/balance/", headers=HEADERS).json()["balance"] == 1000.0

    client.post("/rollover/reopen/", headers=HEADERS, json={"month": current_month})
    client.post("/expenses/", headers=HEADERS, json={
        "title": "Big buy", "amount": 300.0, "category": "Needs", "day": 15, "month": current_month})
    client.post("/rollover/close/", headers=HEADERS, json={"month": current_month})

    entry = next(t for t in supabase_db.rows("savings_transactions")
                 if t["source"] == "rollover" and t["type"] == "deposit")
    assert entry["amount"] == 700.0, "the rollover entry is reduced, not duplicated"
    assert client.get("/savings/balance/", headers=HEADERS).json()["balance"] == 700.0

    # Nothing was clawed past zero, so no debt was needed here.
    assert not any(g.get("is_reconciliation") for g in supabase_db.rows("savings_goals"))


def test_reconciliation_goal_is_surfaced_with_owed_and_repaid(client, supabase_db, current_month):
    recon = supabase_db.seed("savings_goals", {"user_id": USER_A, "title": "Reconciliation",
                                               "goal_type": "debt", "is_reconciliation": True,
                                               "target_amount": 0.0, "completed": False})
    supabase_db.seed("savings_transactions", {"user_id": USER_A, "title": "Spent after close",
                                              "amount": 200.0, "type": "withdrawal",
                                              "goal_id": recon["id"], "source": "rollover",
                                              "day": 28, "month": current_month})
    supabase_db.seed("savings_transactions", {"user_id": USER_A, "title": "Reconciliation",
                                              "amount": 50.0, "type": "deposit",
                                              "goal_id": recon["id"], "source": "income",
                                              "day": 5, "month": current_month})

    goal = next(g for g in client.get("/savings/goal/", headers=HEADERS).json()["data"]
                if g.get("is_reconciliation"))
    assert goal["target_amount"] == 200.0   # owed
    assert goal["allocated_amount"] == 50.0  # repaid
    assert goal["outstanding"] == 150.0


# ══ Lessons ═════════════════════════════════════════════════════════════════════

def test_lesson_series_list_shows_published_series_with_a_derived_count(client, supabase_db):
    supabase_db.seed("lesson_series", {"id": "s1", "title": "Stewardship", "description": "d",
                                       "creator": "DollarSeeds", "thumbnail_url": "https://img/1.png",
                                       "is_published": True, "sort_order": 1})
    supabase_db.seed("lesson_series", {"id": "s2", "title": "Draft", "is_published": False,
                                       "sort_order": 2})
    for i in (1, 2, 3):
        supabase_db.seed("lessons", {"id": f"l{i}", "series_id": "s1", "title": f"L{i}",
                                     "sort_order": i, "video_id": f"s1/l{i}.mp4",
                                     "video_provider": "supabase"})

    data = client.get("/lessons/series/", headers=HEADERS).json()["data"]

    assert len(data) == 1
    assert data[0]["title"] == "Stewardship"
    assert data[0]["lesson_count"] == 3
    assert "video_id" not in data[0]


def test_lesson_series_detail_lists_lessons_without_video_paths(client, supabase_db):
    supabase_db.seed("lesson_series", {"id": "s1", "title": "Stewardship", "is_published": True,
                                       "sort_order": 1})
    supabase_db.seed("lessons", {"id": "l2", "series_id": "s1", "title": "Second", "sort_order": 2,
                                 "duration_seconds": 120, "video_id": "s1/l2.mp4"})
    supabase_db.seed("lessons", {"id": "l1", "series_id": "s1", "title": "First", "sort_order": 1,
                                 "duration_seconds": 90, "video_id": "s1/l1.mp4"})

    data = client.get("/lessons/series/s1/", headers=HEADERS).json()["data"]

    assert [lesson["title"] for lesson in data["lessons"]] == ["First", "Second"]
    assert all("video_id" not in lesson for lesson in data["lessons"])


def test_unpublished_series_is_a_404(client, supabase_db):
    supabase_db.seed("lesson_series", {"id": "s9", "title": "Draft", "is_published": False,
                                       "sort_order": 1})
    assert client.get("/lessons/series/s9/", headers=HEADERS).status_code == 404


def test_playback_mints_a_short_lived_signed_url(client, supabase_db):
    supabase_db.seed("lessons", {"id": "l1", "series_id": "s1", "title": "L1", "sort_order": 1,
                                 "video_provider": "supabase", "video_id": "s1/l1.mp4"})

    body = client.get("/lessons/l1/playback/", headers=HEADERS).json()

    assert body["expires_in"] == 3600
    assert body["url"].startswith("https://storage.test/lesson-videos/s1/l1.mp4")


def test_playback_passes_through_an_externally_hosted_video(client, supabase_db):
    supabase_db.seed("lessons", {"id": "l2", "series_id": "s1", "title": "L2", "sort_order": 1,
                                 "video_provider": "youtube", "video_id": "https://youtu.be/abc"})
    body = client.get("/lessons/l2/playback/", headers=HEADERS).json()
    assert body == {"url": "https://youtu.be/abc", "expires_in": 0}


def test_playback_of_a_missing_lesson_is_a_404(client):
    assert client.get("/lessons/nope/playback/", headers=HEADERS).status_code == 404


def test_rating_a_lesson(client, supabase_db):
    res = client.post("/lesson-ratings/", headers=HEADERS,
                      json={"user_id": USER_A, "lesson_id": 7, "rating": 5})
    assert res.status_code == 200
    row = supabase_db.rows("lesson_ratings")[0]
    assert row == {**row, "user_id": USER_A, "lesson_id": 7, "rating": 5}


# ══ Account deletion ════════════════════════════════════════════════════════════

def test_account_deletion_wipes_every_user_table_and_the_auth_user(client, supabase_db, current_month):
    supabase_db.seed("income", {"user_id": USER_A, "amount": 100.0, "day": 1, "month": current_month})
    supabase_db.seed("expenses", {"user_id": USER_A, "title": "x", "amount": 1.0,
                                  "category": "Needs", "day": 1, "month": current_month})
    supabase_db.seed("savings_transactions", {"user_id": USER_A, "title": "x", "amount": 1.0,
                                              "type": "deposit", "source": "income", "day": 1,
                                              "month": current_month})
    supabase_db.seed("savings_goals", {"user_id": USER_A, "title": "x", "completed": False})
    supabase_db.seed("month_status", {"user_id": USER_A, "month": current_month, "closed_at": None})
    supabase_db.seed("lesson_ratings", {"user_id": USER_A, "lesson_id": 1, "rating": 5})
    supabase_db.seed("user_settings", {"user_id": USER_A, "tithe_enabled": False, "tithe_rate": 0.10})

    res = client.post("/account/delete/", headers=HEADERS,
                      json={"user_id": USER_A, "confirmation": "DELETE"})

    assert res.json() == {"deleted": True}
    for table in ("income", "expenses", "savings_transactions", "savings_goals",
                  "month_status", "lesson_ratings", "user_settings"):
        assert supabase_db.rows(table) == [], f"{table} was not cleared"
    assert supabase_db.deleted_auth_users == [USER_A]


def test_account_deletion_without_the_exact_confirmation_is_a_no_op(client, supabase_db, current_month):
    supabase_db.seed("income", {"user_id": USER_A, "amount": 100.0, "day": 1, "month": current_month})

    res = client.post("/account/delete/", headers=HEADERS, json={"confirmation": "delete"})

    assert res.json() == {"deleted": False}
    assert len(supabase_db.rows("income")) == 1
    assert supabase_db.deleted_auth_users == []


# ══ Backward compatibility ══════════════════════════════════════════════════════

def test_requests_still_work_when_the_client_omits_user_id_entirely(client, supabase_db, current_month):
    """The app can drop `user_id` from its payloads whenever convenient — identity
    already comes from the token."""
    res = client.post("/expenses/", headers=HEADERS, json={
        "title": "No user_id", "amount": 12.0, "category": "Wants", "day": 1, "month": current_month})
    assert res.status_code == 200
    assert supabase_db.rows("expenses")[0]["user_id"] == USER_A


def test_requests_still_work_when_the_client_sends_its_own_user_id(client, supabase_db, current_month):
    """Builds already in the wild keep sending it; it is accepted and ignored."""
    res = client.get(f"/dashboard/{current_month}", params={"user_id": USER_A}, headers=HEADERS)
    assert res.status_code == 200
