from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import Optional
import os
import datetime
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from supabase import create_client, Client

load_dotenv()

URL: str = os.environ.get("SUPABASE_URL")
KEY: str = os.environ.get("SUPABASE_KEY")
supabase: Client = create_client(URL, KEY)

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class Expense(BaseModel):
    title: str
    amount: float
    category: str
    day: int
    month: str
    user_id: str
    sub_category: Optional[str] = None

class Income(BaseModel):
    amount: float
    day: int
    month: str
    user_id: str
    title: Optional[str] = None
    source: Optional[str] = None
    # Legacy field — kept optional for backward compat with existing rows
    jobTitle: Optional[str] = None

class SavingsEntry(BaseModel):
    user_id: str
    title: str
    amount: float
    type: str  # "deposit" or "withdrawal"
    day: int
    month: str
    goal_id: Optional[int] = None
    source: str = "income"  # "income" | "transfer"

class SavingsGoal(BaseModel):
    user_id: str
    title: str
    target_amount: Optional[float] = None   # nullable for General Savings
    target_month: Optional[str] = None
    target_year: Optional[int] = None
    is_general: bool = False
    # "saving" (default) | "debt". Debt goals behave identically to savings goals;
    # the only difference is grouping/labeling in the Goals tab UI.
    goal_type: str = "saving"

class SavingsTransfer(BaseModel):
    user_id: str
    amount: float
    to_goal_id: int        # destination specific goal
    general_goal_id: int   # General Savings goal id
    day: int
    month: str
    to_goal_title: str     # label for the deposit row

class UserSettings(BaseModel):
    user_id: str
    # Optional so PATCH /settings/ can update each field independently without
    # clobbering the others. GET responses return the raw row (all fields populated).
    tithe_enabled: Optional[bool] = None
    tithe_rate: Optional[float] = None
    budget_type: Optional[str] = None
    firm_foundation_goals_prompted: Optional[bool] = None


# ─── Budget types ─────────────────────────────────────────────────────────────
# Single source of truth for the selectable splits. Store only the KEY anywhere
# (income snapshot / user_settings); never raw percentages, to avoid drift.
# Invariants: wants <= 0.30, savings > 0.
BUDGET_TYPES = {
    "balanced":        {"needs": 0.50, "wants": 0.30, "savings": 0.20},
    "wealth_builder":  {"needs": 0.30, "wants": 0.20, "savings": 0.50},
    "firm_foundation": {"needs": 0.70, "wants": 0.10, "savings": 0.20},
}
DEFAULT_BUDGET_TYPE = "balanced"


# ─── Tithing helpers ──────────────────────────────────────────────────────────
DEFAULT_TITHE_RATE = 0.10

def _get_user_settings(user_id: str) -> dict:
    """Load a user's settings row, lazily creating a default one if none exists.
    Returns a dict with at least {user_id, tithe_enabled, tithe_rate}."""
    res = supabase.table("user_settings").select("*").eq("user_id", user_id).execute()
    if res.data:
        return res.data[0]
    default = {"user_id": user_id, "tithe_enabled": False, "tithe_rate": DEFAULT_TITHE_RATE}
    ins = supabase.table("user_settings").insert(default).execute()
    return ins.data[0] if ins.data else default

def _current_month_name() -> str:
    return datetime.datetime.now().strftime("%B")

def _month_tithe(month: str, total_income: float, income_rows: list, settings: dict) -> dict:
    """Compute the tithe carve-out for a single month.

    Current real-world month  → uses the LIVE user setting (so toggling the switch
                                 updates the dashboard immediately).
    Any other (past) month    → uses the per-row tithe snapshot frozen onto each
                                 income row at insert time, so past months keep their
                                 original split no matter how the toggle changes later.

    Returns {enabled, rate, amount, budgetable}. With tithe disabled / no snapshots
    the carve-out is 0 and budgetable == total_income (behavior identical to before).
    """
    if month == _current_month_name():
        enabled = bool(settings.get("tithe_enabled"))
        rate = float(settings.get("tithe_rate") if settings.get("tithe_rate") is not None else DEFAULT_TITHE_RATE)
        amount = total_income * rate if enabled else 0.0
    else:
        tithed = [r for r in income_rows if r.get("tithe_enabled")]
        amount = sum(r["amount"] * float(r.get("tithe_rate") or DEFAULT_TITHE_RATE) for r in tithed)
        enabled = amount > 0
        rate = float(tithed[0].get("tithe_rate") or DEFAULT_TITHE_RATE) if tithed else \
            float(settings.get("tithe_rate") if settings.get("tithe_rate") is not None else DEFAULT_TITHE_RATE)
    return {
        "enabled": enabled,
        "rate": rate,
        "amount": amount,
        "budgetable": total_income - amount,
    }

def _month_budget_type(month: str, income_rows: list, settings: dict) -> str:
    """Resolve the budget-type KEY governing a month's split — same lifecycle as
    _month_tithe.

    Current real-world month → the LIVE user setting (editable mid-month).
    Any other (past) month   → the snapshot stamped on that month's income rows.
                               A split is per-month (not per-row), so we take the
                               most recent income row as the month's representative,
                               mirroring how _month_tithe picks tithed[0]. Falls back
                               to 'balanced' (the only split that existed historically).
    """
    if month == _current_month_name():
        key = settings.get("budget_type") or DEFAULT_BUDGET_TYPE
    elif income_rows:
        recent = max(income_rows, key=lambda r: r.get("day") or 0)
        key = recent.get("budget_type") or DEFAULT_BUDGET_TYPE
    else:
        key = DEFAULT_BUDGET_TYPE
    return key if key in BUDGET_TYPES else DEFAULT_BUDGET_TYPE


def calculate_category_score(spent: float, budget: float) -> float:
    if budget == 0:
        return 10.0
    ratio = spent / budget
    if ratio <= 1.0:
        # 0% spent → 7.0, 100% spent → 10.0 (linear)
        return round(7.0 + ratio * 3.0, 1)
    else:
        # Over budget: steep penalty
        return round(max(1.0, 10.0 - (ratio - 1.0) * 30.0), 1)


@app.get("/")
def read_root():
    return {"message": "DollarSeeds Backend is running!"}

@app.get("/dashboard/trends/")
def get_spending_trends(user_id: str):
    all_months = ["January", "February", "March", "April", "May", "June", "July",
                  "August", "September", "October", "November", "December"]

    # Fetch all data in 5 queries instead of per-month queries
    # tithe_enabled/tithe_rate/budget_type/day are the per-row snapshot used to
    # freeze each past month at the tithe + split that were active then.
    all_income = supabase.table("income").select("amount, day, month, tithe_enabled, tithe_rate, budget_type").eq("user_id", user_id).execute()
    all_needs = supabase.table("expenses").select("amount, day, month").eq("category", "Needs").eq("user_id", user_id).execute()
    all_wants = supabase.table("expenses").select("amount, day, month").eq("category", "Wants").eq("user_id", user_id).execute()
    all_goals_exp = supabase.table("expenses").select("amount, day, month").eq("category", "Goals").eq("user_id", user_id).execute()
    # Only count income-sourced deposits toward Goals budget (not transfers between goals)
    all_savings = supabase.table("savings_transactions").select("amount, day, month").eq("type", "deposit").eq("source", "income").eq("user_id", user_id).execute()

    def group_by_month(items):
        grouped = {}
        for item in items:
            m = item["month"]
            if m not in grouped:
                grouped[m] = []
            grouped[m].append(item)
        return grouped

    income_by_month = group_by_month(all_income.data)
    needs_by_month = group_by_month(all_needs.data)
    wants_by_month = group_by_month(all_wants.data)
    goals_by_month = group_by_month(all_goals_exp.data)
    savings_by_month = group_by_month(all_savings.data)

    def spending_quartiles(expenses):
        if not expenses:
            return {"q25": None, "q50": None, "q75": None, "q100": None}
        total = sum(e["amount"] for e in expenses)
        if total == 0:
            return {"q25": None, "q50": None, "q75": None, "q100": None}
        sorted_exp = sorted(expenses, key=lambda x: x["day"])
        cumulative = 0
        quartiles = {}
        thresholds = [(0.25, "q25"), (0.50, "q50"), (0.75, "q75"), (1.0, "q100")]
        t_idx = 0
        for item in sorted_exp:
            cumulative += item["amount"]
            while t_idx < len(thresholds) and cumulative / total >= thresholds[t_idx][0]:
                quartiles[thresholds[t_idx][1]] = item["day"]
                t_idx += 1
            if t_idx == len(thresholds):
                break
        for _, key in thresholds[t_idx:]:
            quartiles[key] = None
        return quartiles

    settings = _get_user_settings(user_id)

    results = []
    for month in all_months:
        month_income_rows = income_by_month.get(month, [])
        total_income = sum(i["amount"] for i in month_income_rows)
        total_needs = sum(i["amount"] for i in needs_by_month.get(month, []))
        total_wants = sum(i["amount"] for i in wants_by_month.get(month, []))
        total_goals = (
            sum(i["amount"] for i in goals_by_month.get(month, [])) +
            sum(i["amount"] for i in savings_by_month.get(month, []))
        )

        if total_income == 0 and total_needs == 0 and total_wants == 0 and total_goals == 0:
            continue

        # Carve tithe out FIRST, then split the remaining (budgetable) income by
        # THIS month's locked budget type. Same rule as the dashboard so the two
        # screens never disagree, and per-month so history stays accurate.
        tithe = _month_tithe(month, total_income, month_income_rows, settings)
        budgetable = tithe["budgetable"]
        bt_key = _month_budget_type(month, month_income_rows, settings)
        bt = BUDGET_TYPES[bt_key]

        results.append({
            "month": month,
            "total_income": total_income,
            "needs": total_needs,
            "wants": total_wants,
            "goals": total_goals,
            "budgets": {
                "needs": budgetable * bt["needs"],
                "wants": budgetable * bt["wants"],
                "goals": budgetable * bt["savings"]
            },
            "tithe": {
                "enabled": tithe["enabled"],
                "rate": tithe["rate"],
                "amount": tithe["amount"],
            },
            "budget_type": bt_key,
            "wants_quartiles": spending_quartiles(wants_by_month.get(month, []))
        })

    return {"data": results}


@app.get("/dashboard/{current_month}")
def get_dashboard_data(current_month: str, user_id: str):
    income_response = supabase.table("income").select("amount, day, tithe_enabled, tithe_rate, budget_type").eq("month", current_month).eq("user_id", user_id).execute()
    total_income = sum(item["amount"] for item in income_response.data)

    # Tithe is carved out FIRST; the budget split then applies to the remainder,
    # using this month's budget type. With tithe disabled + 'balanced' type,
    # budgetable == total_income and budgets are the original 50/30/20.
    settings = _get_user_settings(user_id)
    tithe = _month_tithe(current_month, total_income, income_response.data, settings)
    budgetable = tithe["budgetable"]
    bt_key = _month_budget_type(current_month, income_response.data, settings)
    bt = BUDGET_TYPES[bt_key]

    needs_budget = budgetable * bt["needs"]
    wants_budget = budgetable * bt["wants"]
    goals_budget = budgetable * bt["savings"]

    expense_needs_response = supabase.table("expenses").select("amount").eq("month", current_month).eq("category", "Needs").eq("user_id", user_id).execute()
    expense_wants_response = supabase.table("expenses").select("amount").eq("month", current_month).eq("category", "Wants").eq("user_id", user_id).execute()
    expense_goals_response = supabase.table("expenses").select("amount").eq("month", current_month).eq("category", "Goals").eq("user_id", user_id).execute()
    # Only count income-sourced deposits toward Goals budget (not transfers between goals)
    savings_deposits_response = supabase.table("savings_transactions").select("amount").eq("month", current_month).eq("type", "deposit").eq("source", "income").eq("user_id", user_id).execute()

    total_needs = sum(item["amount"] for item in expense_needs_response.data)
    total_wants = sum(item["amount"] for item in expense_wants_response.data)
    # Goals bucket = historical 'Goals' expenses (legacy "Investments") + income-sourced
    # savings deposits. Debt-goal payments are just savings_transactions deposits with
    # source='income', so they flow into this total automatically — no extra query needed.
    # (Transfers between goals use source='transfer' and are intentionally excluded.)
    total_goals = sum(item["amount"] for item in expense_goals_response.data) + sum(item["amount"] for item in savings_deposits_response.data)

    needs_score = calculate_category_score(total_needs, needs_budget)
    wants_score = calculate_category_score(total_wants, wants_budget)
    # Wants overspend carries a slightly heavier penalty (most discretionary category)
    if wants_budget > 0 and total_wants > wants_budget:
        wants_score = round(max(1.0, wants_score - 0.5), 1)
    goals_score = calculate_category_score(total_goals, goals_budget)

    overall_score = round((needs_score + wants_score + goals_score) / 3, 1) if total_income > 0 else None

    return {
        "month": current_month,
        "total_income": total_income,
        "tithe": {
            "enabled": tithe["enabled"],
            "rate": tithe["rate"],
            "amount": tithe["amount"],
        },
        "budget_type": {
            "key": bt_key,
            "needs": bt["needs"],
            "wants": bt["wants"],
            "savings": bt["savings"],
        },
        "budgets": {
            "needs": needs_budget,
            "wants": wants_budget,
            "goals": goals_budget
        },
        "expenses": {
            "needs": total_needs,
            "wants": total_wants,
            "goals": total_goals
        },
        "compliance_score": {
            "overall": overall_score,
            "needs": needs_score,
            "wants": wants_score,
            "goals": goals_score
        }
    }

@app.post("/expenses/")
def create_expense(expense: Expense):
    response = supabase.table("expenses").insert(expense.model_dump()).execute()
    return {"message": "Expense successfully added to database!", "data": response.data}

@app.post("/income/")
def create_income(income: Income):
    # Snapshot the user's CURRENT tithe setting onto the row. This freezes the month's
    # split: even if the user later toggles tithing, past income keeps its original
    # treatment. The live current month is still computed from user_settings.
    settings = _get_user_settings(income.user_id)
    payload = income.model_dump()
    payload["tithe_enabled"] = bool(settings.get("tithe_enabled"))
    payload["tithe_rate"] = float(
        settings.get("tithe_rate") if settings.get("tithe_rate") is not None else DEFAULT_TITHE_RATE
    )
    # Snapshot the budget type too, so the month locks to this split once it's past.
    bt = settings.get("budget_type")
    payload["budget_type"] = bt if bt in BUDGET_TYPES else DEFAULT_BUDGET_TYPE
    response = supabase.table("income").insert(payload).execute()
    return {"message": "Income successfully added to database!", "data": response.data}

@app.get("/settings/")
def get_settings(user_id: str):
    """Return the user's settings, lazily creating a default row if missing."""
    return {"data": _get_user_settings(user_id)}

@app.patch("/settings/")
def update_settings(update: UserSettings):
    """Update tithe_enabled, tithe_rate, budget_type and/or the firm-foundation
    prompt flag for a user (partial update)."""
    _get_user_settings(update.user_id)  # ensure a row exists first
    fields: dict = {}
    if update.tithe_enabled is not None:
        fields["tithe_enabled"] = update.tithe_enabled
    if update.tithe_rate is not None:
        fields["tithe_rate"] = update.tithe_rate
    if update.budget_type is not None:
        if update.budget_type not in BUDGET_TYPES:
            raise HTTPException(status_code=400, detail=f"Unknown budget_type '{update.budget_type}'.")
        fields["budget_type"] = update.budget_type
    if update.firm_foundation_goals_prompted is not None:
        fields["firm_foundation_goals_prompted"] = update.firm_foundation_goals_prompted
    if not fields:
        return {"data": _get_user_settings(update.user_id)}
    res = supabase.table("user_settings").update(fields).eq("user_id", update.user_id).execute()
    return {"message": "Settings updated.", "data": res.data[0] if res.data else None}

@app.get("/expenses/details/")
def get_expense_details(month: str, category: str, user_id: str):
    # "Goals" is kept allowed for READ-ONLY historical access: the old "Investments"
    # expense bucket wrote category='Goals', and past-month dashboards still need to
    # render those rows. No code path CREATES new 'Goals' expenses anymore — debt and
    # savings goals now live in savings_goals/savings_transactions instead.
    if category not in ("Needs", "Wants", "Goals"):
        return {"data": []}
    response = supabase.table("expenses").select("*").eq("month", month).eq("category", category).eq("user_id", user_id).execute()
    return {"data": response.data}

@app.delete("/expenses/delete/{id}")
def delete_expense(id: int, user_id: str):
    response = supabase.table("expenses").delete().eq("id", id).eq("user_id", user_id).execute()
    return response.data

@app.delete("/income/delete/{id}")
def delete_income(id: int, user_id: str):
    response = supabase.table("income").delete().eq("id", id).eq("user_id", user_id).execute()
    return response.data

@app.get("/income/details/")
def get_income_details(month: str, user_id: str):
    response = supabase.table("income").select("*").eq("month", month).eq("user_id", user_id).execute()
    return {"data": response.data}

@app.get("/savings/balance/")
def get_savings_balance(user_id: str):
    response = supabase.table("savings_transactions").select("amount, type").eq("user_id", user_id).execute()
    balance = sum(
        r["amount"] if r["type"] == "deposit" else -r["amount"]
        for r in response.data
    )
    return {"balance": balance}

@app.post("/savings/transaction/")
def create_savings_transaction(entry: SavingsEntry):
    response = supabase.table("savings_transactions").insert(entry.model_dump()).execute()
    return {"message": "Savings transaction recorded.", "data": response.data}

@app.post("/savings/transfer/")
def transfer_from_general(transfer: SavingsTransfer):
    """Move money from General Savings into a specific goal.
    Creates two transactions with source='transfer' so neither affects the Goals budget."""
    # Withdrawal from General Savings
    supabase.table("savings_transactions").insert({
        "user_id": transfer.user_id,
        "title": f"Transferred to {transfer.to_goal_title}",
        "amount": transfer.amount,
        "type": "withdrawal",
        "goal_id": transfer.general_goal_id,
        "source": "transfer",
        "day": transfer.day,
        "month": transfer.month,
    }).execute()
    # Deposit into the destination goal
    supabase.table("savings_transactions").insert({
        "user_id": transfer.user_id,
        "title": transfer.to_goal_title,
        "amount": transfer.amount,
        "type": "deposit",
        "goal_id": transfer.to_goal_id,
        "source": "transfer",
        "day": transfer.day,
        "month": transfer.month,
    }).execute()
    return {"message": "Transfer recorded."}

@app.get("/savings/history/")
def get_savings_history(user_id: str, month: str = None):
    query = supabase.table("savings_transactions").select("*").eq("user_id", user_id)
    if month:
        query = query.eq("month", month)
    response = query.order("created_at", desc=True).execute()
    return {"data": response.data}

@app.delete("/savings/transaction/{id}")
def delete_savings_transaction(id: int, user_id: str):
    response = supabase.table("savings_transactions").delete().eq("id", id).eq("user_id", user_id).execute()
    return response.data

def _with_allocated(goals_data: list, user_id: str) -> list:
    if not goals_data:
        return []
    txs_res = supabase.table("savings_transactions") \
        .select("goal_id, amount, type").eq("user_id", user_id).execute()
    allocated: dict[int, float] = {}
    for tx in txs_res.data:
        gid = tx.get("goal_id")
        if gid is not None:
            delta = tx["amount"] if tx["type"] == "deposit" else -tx["amount"]
            allocated[gid] = allocated.get(gid, 0) + delta
    return [{**g, "allocated_amount": max(0.0, allocated.get(g["id"], 0.0))} for g in goals_data]

def _ensure_general_savings(user_id: str) -> int:
    """Ensure a General Savings goal exists for this user. Returns its id."""
    gen = supabase.table("savings_goals").select("id").eq("user_id", user_id).eq("is_general", True).execute()
    if gen.data:
        return gen.data[0]["id"]
    result = supabase.table("savings_goals").insert({
        "user_id": user_id,
        "title": "General Savings",
        "is_general": True,
        "completed": False,
    }).execute()
    return result.data[0]["id"]

@app.get("/savings/goal/")
def get_savings_goals(user_id: str, goal_type: Optional[str] = None):
    # Lazily seed General Savings for this user if it doesn't exist yet
    _ensure_general_savings(user_id)
    query = supabase.table("savings_goals").select("*").eq("user_id", user_id).eq("completed", False)
    # Optional filter: "saving" | "debt". Allocation math is identical for both.
    if goal_type in ("saving", "debt"):
        query = query.eq("goal_type", goal_type)
    goals_res = query.order("created_at", desc=True).execute()
    return {"data": _with_allocated(goals_res.data, user_id)}

@app.get("/savings/goal/completed/")
def get_completed_goals(user_id: str, goal_type: Optional[str] = None):
    query = supabase.table("savings_goals").select("*").eq("user_id", user_id).eq("completed", True)
    if goal_type in ("saving", "debt"):
        query = query.eq("goal_type", goal_type)
    goals_res = query.order("created_at", desc=True).execute()
    return {"data": _with_allocated(goals_res.data, user_id)}

@app.patch("/savings/goal/{id}/complete")
def complete_savings_goal(id: int, user_id: str):
    response = supabase.table("savings_goals").update({"completed": True}).eq("id", id).eq("user_id", user_id).execute()
    return {"message": "Goal marked as complete.", "data": response.data}

@app.post("/savings/goal/")
def create_savings_goal(goal: SavingsGoal):
    existing = supabase.table("savings_goals").select("id").eq("user_id", goal.user_id).eq("title", goal.title).execute()
    if existing.data:
        raise HTTPException(status_code=400, detail="A goal with this name already exists.")
    response = supabase.table("savings_goals").insert(goal.model_dump()).execute()
    return {"message": "Goal created.", "data": response.data}

@app.delete("/savings/goal/{id}")
def delete_savings_goal(id: int, user_id: str, current_month: str):
    # Block deletion of General Savings
    goal_res = supabase.table("savings_goals").select("is_general").eq("id", id).eq("user_id", user_id).execute()
    if not goal_res.data:
        raise HTTPException(status_code=404, detail="Goal not found.")
    if goal_res.data[0].get("is_general"):
        raise HTTPException(status_code=400, detail="General Savings cannot be deleted.")

    # Ensure General Savings exists to receive redistributed funds
    general_id = _ensure_general_savings(user_id)

    # Get all deposits for this goal
    deposits = supabase.table("savings_transactions").select("*") \
        .eq("goal_id", id).eq("type", "deposit").eq("user_id", user_id).execute()

    for dep in deposits.data:
        if dep["month"] != current_month:
            # Previous month: redirect to General Savings (source='transfer' so it
            # doesn't double-count against any month's Goals budget)
            supabase.table("savings_transactions").insert({
                "user_id": user_id,
                "title": "Returned from deleted goal",
                "amount": float(dep["amount"]),
                "type": "deposit",
                "goal_id": general_id,
                "source": "transfer",
                "day": dep["day"],
                "month": dep["month"],
            }).execute()
        # Current-month deposits are simply dropped below when we clear all transactions

    # Remove ALL transactions for this goal so the FK constraint is satisfied,
    # then delete the goal. (Prior-month amounts were already re-inserted above
    # under general_id; current-month deposits are intentionally discarded to
    # refund the budget.)
    supabase.table("savings_transactions").delete() \
        .eq("goal_id", id).eq("user_id", user_id).execute()

    # Now safe to delete the goal itself
    supabase.table("savings_goals").delete().eq("id", id).eq("user_id", user_id).execute()
    return {"message": "Goal deleted and funds redistributed."}

class LessonRating(BaseModel):
    user_id: str
    lesson_id: int
    rating: int  # 1–5

@app.post("/lesson-ratings/")
def create_lesson_rating(entry: LessonRating):
    response = supabase.table("lesson_ratings").insert(entry.model_dump()).execute()
    return {"message": "Rating recorded.", "data": response.data}
