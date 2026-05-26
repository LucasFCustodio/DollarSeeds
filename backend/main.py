from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import Optional
import os
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

class SavingsTransfer(BaseModel):
    user_id: str
    amount: float
    to_goal_id: int        # destination specific goal
    general_goal_id: int   # General Savings goal id
    day: int
    month: str
    to_goal_title: str     # label for the deposit row


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
    all_income = supabase.table("income").select("amount, month").eq("user_id", user_id).execute()
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

    results = []
    for month in all_months:
        total_income = sum(i["amount"] for i in income_by_month.get(month, []))
        total_needs = sum(i["amount"] for i in needs_by_month.get(month, []))
        total_wants = sum(i["amount"] for i in wants_by_month.get(month, []))
        total_goals = (
            sum(i["amount"] for i in goals_by_month.get(month, [])) +
            sum(i["amount"] for i in savings_by_month.get(month, []))
        )

        if total_income == 0 and total_needs == 0 and total_wants == 0 and total_goals == 0:
            continue

        results.append({
            "month": month,
            "total_income": total_income,
            "needs": total_needs,
            "wants": total_wants,
            "goals": total_goals,
            "budgets": {
                "needs": total_income * 0.5,
                "wants": total_income * 0.3,
                "goals": total_income * 0.2
            },
            "wants_quartiles": spending_quartiles(wants_by_month.get(month, []))
        })

    return {"data": results}


@app.get("/dashboard/{current_month}")
def get_dashboard_data(current_month: str, user_id: str):
    income_response = supabase.table("income").select("amount").eq("month", current_month).eq("user_id", user_id).execute()
    total_income = sum(item["amount"] for item in income_response.data)

    needs_budget = total_income * .50
    wants_budget = total_income * .30
    goals_budget = total_income * .20

    expense_needs_response = supabase.table("expenses").select("amount").eq("month", current_month).eq("category", "Needs").eq("user_id", user_id).execute()
    expense_wants_response = supabase.table("expenses").select("amount").eq("month", current_month).eq("category", "Wants").eq("user_id", user_id).execute()
    expense_goals_response = supabase.table("expenses").select("amount").eq("month", current_month).eq("category", "Goals").eq("user_id", user_id).execute()
    # Only count income-sourced deposits toward Goals budget (not transfers between goals)
    savings_deposits_response = supabase.table("savings_transactions").select("amount").eq("month", current_month).eq("type", "deposit").eq("source", "income").eq("user_id", user_id).execute()

    total_needs = sum(item["amount"] for item in expense_needs_response.data)
    total_wants = sum(item["amount"] for item in expense_wants_response.data)
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
    response = supabase.table("income").insert(income.model_dump()).execute()
    return {"message": "Income successfully added to database!", "data": response.data}

@app.get("/expenses/details/")
def get_expense_details(month: str, category: str, user_id: str):
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
def get_savings_goals(user_id: str):
    # Lazily seed General Savings for this user if it doesn't exist yet
    _ensure_general_savings(user_id)
    goals_res = supabase.table("savings_goals").select("*").eq("user_id", user_id).eq("completed", False).order("created_at", desc=True).execute()
    return {"data": _with_allocated(goals_res.data, user_id)}

@app.get("/savings/goal/completed/")
def get_completed_goals(user_id: str):
    goals_res = supabase.table("savings_goals").select("*").eq("user_id", user_id).eq("completed", True).order("created_at", desc=True).execute()
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
