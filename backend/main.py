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
    date: str
    category: str

class Income(BaseModel):
    jobTitle: str
    amount: float
    jobType: str
    day: int
    month: str

@app.get("/")
def read_root():
    return {"message": "DollarSeeds Backend is running!"}

@app.get("/dashboard/{current_month}")
def get_dashboard_data(current_month: str):
    income_response = supabase.table("income").select("amount").eq("month", current_month).execute()

    total_income = sum(item["amount"] for item in income_response.data)

    needs_budget = total_income * .50
    wants_budget = total_income * .30
    goals_budget = total_income * .20

    return {
        "month": current_month,
        "total_income": total_income,
        "budgets": {
            "needs": needs_budget,
            "wants": wants_budget,
            "goals": goals_budget
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