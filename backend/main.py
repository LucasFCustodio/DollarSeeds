from fastapi import FastAPI
from pydantic import BaseModel

app = FastAPI()

# This model matches the data your React Native UI will send
class Expense(BaseModel):
    title: str
    amount: float
    date: str
    category: str
    description: str = None # Optional field

@app.get("/")
def read_root():
    return {"message": "DollarSeeds Backend is running!"}

@app.post("/expenses/")
def create_expense(expense: Expense):
    # TODO: Connect to Supabase database
    print(f"Received expense: {expense.title} for ${expense.amount}")
    return {"status": "success", "data": expense}