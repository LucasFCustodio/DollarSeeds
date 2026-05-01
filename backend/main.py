from fastapi import FastAPI
from pydantic import BaseModel
import os
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from supabase import create_client, Client

load_dotenv()

URL: str = os.environ.get("SUPABASE_URL")
KEY: str = os.environ.get("SUPABASE_KEY")
supabase: Client = create_client(URL, KEY)

app = FastAPI()

# Add this entire block to allow the web browser to connect
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# This model matches the data your React Native UI will send
class Expense(BaseModel):
    title: str
    amount: float
    category: str
    day: int
    month: str
    user_id: str

class Income(BaseModel):
    jobTitle: str
    amount: float
    jobType: str
    day: int
    month: str
    user_id: str

@app.get("/")
def read_root():
    return {"message": "DollarSeeds Backend is running!"}

@app.get("/dashboard/{current_month}")
def get_dashboard_data(current_month: str, user_id: str):
    # Income dashboard information
    income_response = supabase.table("income").select("amount").eq("month", current_month).eq("user_id", user_id).execute()

    total_income = sum(item["amount"] for item in income_response.data)

    needs_budget = total_income * .50
    wants_budget = total_income * .30
    goals_budget = total_income * .20

    # Expense dashboard information
    expense_needs_response = supabase.table("expenses").select("amount").eq("month", current_month).eq("category", "Need").eq("user_id", user_id).execute()
    expense_wants_response = supabase.table("expenses").select("amount").eq("month", current_month).eq("category", "Want").eq("user_id", user_id).execute()
    expense_goals_response = supabase.table("expenses").select("amount").eq("month", current_month).in_("category", ["Savings", "Debt"]).eq("user_id", user_id).execute()

    total_needs = sum(item["amount"] for item in expense_needs_response.data)
    total_wants = sum(item["amount"] for item in expense_wants_response.data)
    total_goals = sum(item["amount"] for item in expense_goals_response.data)

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
        }
    }

@app.post("/expenses/")
def create_expense(expense: Expense):
    # Convert the Pydantic model to a dictionary and insert it into Supabase.
    response = supabase.table("expenses").insert(expense.model_dump()).execute()
    
    return {
        "message": "Expense successfully added to database!",
        "data": response.data
    }

@app.post("/income/")
def create_income(income: Income):
    response = supabase.table("income").insert(income.model_dump()).execute()

    return {
        "message": "Expense successfully added to database!",
        "data": response.data
    }


# GET request for an viewing expense cards
@app.get("/expenses/details/")
def get_expense_details(month: str, category: str, user_id: str):
    # Check what the frontend is asking for and query Supabase accordingly
    if category == "Needs":
        response = supabase.table("expenses").select("*").eq("month", month).eq("category", "Need").eq("user_id", user_id).execute()
    elif category == "Wants":
        response = supabase.table("expenses").select("*").eq("month", month).eq("category", "Want").eq("user_id", user_id).execute()
    elif category == "Goals":
        response = supabase.table("expenses").select("*").eq("month", month).in_("category", ["Savings", "Debt"]).eq("user_id", user_id).execute()
    else:
        return {"data": []} # Fallback just in case

    return {"data": response.data}

@app.delete("/expenses/delete/{id}")
def delete_expense(id: int, user_id: str):
    response = supabase.table("expenses").delete().eq("id", id).eq("user_id", user_id).execute()

    return response.data

# GET request for viewing income cards
@app.get("/income/details/")
def get_income_details(month: str, user_id: str):
    response = supabase.table("income").select("*").eq("month", month).eq("user_id", user_id).execute()

    return {"data": response.data}