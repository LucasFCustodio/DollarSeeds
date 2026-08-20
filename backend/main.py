from fastapi import Depends, FastAPI, Header, HTTPException, Request
from fastapi.responses import JSONResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel
from typing import Optional
import os
import datetime
import hmac
import time
import uuid
import httpx
import jwt
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
    # The API is cookie-free — clients authenticate with an Authorization header —
    # so credentialed cross-origin requests are never needed. (Browsers also reject
    # allow_origins=["*"] combined with credentials.)
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ─── Authentication ───────────────────────────────────────────────────────────
# The Supabase client above is built with the SERVICE_ROLE key, which bypasses Row
# Level Security completely. That makes this file the ONLY thing standing between a
# request and every user's financial data: all authorization has to live here.
#
# Identity therefore comes from the caller's Supabase access token — a signed JWT —
# and NEVER from a `user_id` the client supplies. Routes still accept `user_id` in
# query params / request bodies for backward compatibility with older app builds,
# but it is inert: every handler uses the id resolved from the verified token.

# This project signs access tokens with an ASYMMETRIC key (Supabase Dashboard → JWT
# Keys → current key is ECC P-256, i.e. ES256). There is no shared secret to check
# those against — verification uses the project's PUBLIC keys, published at the JWKS
# endpoint below. Those keys are public by design, so this needs no configuration and
# no new environment variable.
JWKS_URL: Optional[str] = f"{URL.rstrip('/')}/auth/v1/.well-known/jwks.json" if URL else None

# Algorithms we will verify. Fixed list, never taken from the token's own header —
# letting the token pick its algorithm is the classic JWT confusion attack.
ASYMMETRIC_ALGORITHMS = ["ES256", "RS256", "EdDSA"]

# Optional legacy escape hatch. This project's HS256 key is already rotated out
# ("Previously used keys"), so the variable is expected to be UNSET and the HS256 path
# below stays dormant. It exists only so a rollback to a shared secret, or a standby
# HS256 key, doesn't require a code change.
JWT_SECRET: Optional[str] = os.environ.get("SUPABASE_JWT_SECRET")

# Supabase stamps every end-user access token with aud='authenticated'. Checking it
# is not a formality: the project's ANON key is also a JWT issued by this project, and
# it ships inside the app binary — i.e. it is public. Without this check anyone could
# paste it in as a bearer token. (It carries role='anon' and no `sub`, so the missing-
# subject check below independently rejects it too.)
JWT_AUDIENCE = "authenticated"

# auto_error=False so a missing/!Bearer header reaches us and we can raise our own
# 401 instead of FastAPI's 403.
_bearer = HTTPBearer(auto_error=False)

# Fetched once and cached in-process; re-fetched when the cache lifespan expires, so a
# key rotation in Supabase is picked up without a redeploy.
_jwk_client: Optional[jwt.PyJWKClient] = None


def _unauthorized(detail: str = "Not authenticated.") -> HTTPException:
    return HTTPException(status_code=401, detail=detail, headers={"WWW-Authenticate": "Bearer"})


def _get_jwk_client() -> Optional[jwt.PyJWKClient]:
    global _jwk_client
    if _jwk_client is None and JWKS_URL:
        _jwk_client = jwt.PyJWKClient(JWKS_URL, lifespan=3600, timeout=10)
    return _jwk_client


def _decode(token: str, key, algorithms: list[str]) -> dict:
    """Shared decode policy: signature, expiry, audience, and a required subject."""
    return jwt.decode(
        token,
        key,
        algorithms=algorithms,
        audience=JWT_AUDIENCE,
        # Supabase (which issues the token) and Render (which checks it) keep their own
        # clocks. A few seconds of skew must not 401 a user holding a valid token.
        leeway=10,
        options={"require": ["exp", "sub"]},
    )


def _verify_with_jwks(token: str) -> dict:
    """Verify an asymmetrically-signed token against the project's published public
    keys. The keys are cached in-process, so this costs no network call per request —
    which matters because every screen fires several.

    The public key is only ever used with asymmetric algorithms. It is never handed to
    an HS256 decode: a public key used as an HMAC secret is public knowledge, and that
    is precisely the algorithm-confusion forgery this ordering prevents."""
    client = _get_jwk_client()
    if client is None:
        raise jwt.PyJWKClientError("No JWKS endpoint configured (SUPABASE_URL unset).")
    signing_key = client.get_signing_key_from_jwt(token)
    return _decode(token, signing_key.key, ASYMMETRIC_ALGORITHMS)


def _verify_with_secret(token: str) -> dict:
    """Legacy HS256 path — dormant unless SUPABASE_JWT_SECRET is set."""
    return _decode(token, JWT_SECRET, ["HS256"])


def _verify_remotely(token: str) -> dict:
    """Last resort: let Supabase verify the token and tell us who it belongs to.

    Only reached when we cannot verify locally — the JWKS endpoint is unreachable, or
    the token uses an algorithm we have no key for. Costs a round-trip, so it is not
    the normal path, but the token is still cryptographically verified: an unverified
    token is never trusted anywhere in this file."""
    res = supabase.auth.get_user(token)
    user = getattr(res, "user", None)
    if not user or not getattr(user, "id", None):
        raise ValueError("Token did not resolve to a user.")
    return {"sub": user.id}


def get_current_user_id(
    cred: Optional[HTTPAuthorizationCredentials] = Depends(_bearer),
) -> str:
    """FastAPI dependency: the authenticated caller's Supabase user id.

    Rejects a missing, malformed, expired, tampered or wrongly-signed token with 401.
    The returned value is the token's verified `sub` claim — the authoritative user id.
    """
    if cred is None or not cred.credentials:
        raise _unauthorized("Missing bearer token.")
    token = cred.credentials

    # The header's `alg` only decides WHICH key to try — it can never widen what we
    # accept, because each verifier passes its own fixed algorithm allowlist.
    try:
        alg = jwt.get_unverified_header(token).get("alg")
    except Exception:
        raise _unauthorized("Malformed token.")

    try:
        if alg in ASYMMETRIC_ALGORITHMS:
            try:
                claims = _verify_with_jwks(token)
            except jwt.PyJWKClientError:
                # Couldn't retrieve the public keys (network blip, or a rotation whose
                # new kid isn't in our cached set). Drop the cached client so the next
                # request re-fetches, and verify this one through Supabase rather than
                # locking every user out of the app.
                global _jwk_client
                _jwk_client = None
                claims = _verify_remotely(token)
        elif alg == "HS256" and JWT_SECRET:
            claims = _verify_with_secret(token)
        else:
            # No key of our own for this token: an HS256 token with no configured
            # secret, or an unsigned/unknown alg such as 'none'. Supabase decides.
            claims = _verify_remotely(token)
    except HTTPException:
        raise
    except Exception:
        # Deliberately opaque: never tell a caller *why* their token failed.
        raise _unauthorized("Invalid or expired token.")

    user_id = claims.get("sub")
    if not user_id:
        raise _unauthorized("Token has no subject.")
    return str(user_id)

# NOTE on `user_id` in the models below: it is accepted (older app builds still send
# it) but NEVER trusted. Every handler overwrites it with the id from the verified
# token before anything reaches the database. It is Optional so a future client can
# simply stop sending it.

class Expense(BaseModel):
    title: str
    amount: float
    category: str
    day: int
    month: str
    user_id: Optional[str] = None
    sub_category: Optional[str] = None

class Income(BaseModel):
    amount: float
    day: int
    month: str
    user_id: Optional[str] = None
    title: Optional[str] = None
    source: Optional[str] = None
    # Legacy field — kept optional for backward compat with existing rows
    jobTitle: Optional[str] = None

class SavingsEntry(BaseModel):
    user_id: Optional[str] = None
    title: str
    amount: float
    type: str  # "deposit" or "withdrawal"
    day: int
    month: str
    goal_id: Optional[int] = None
    source: str = "income"  # "income" | "transfer"

class StartingBalance(BaseModel):
    user_id: Optional[str] = None
    amount: float
    day: int
    month: str

class SavingsGoal(BaseModel):
    user_id: Optional[str] = None
    title: str
    target_amount: Optional[float] = None   # nullable for General Savings
    target_month: Optional[str] = None
    target_year: Optional[int] = None
    is_general: bool = False
    # "saving" (default) | "debt". Debt goals behave identically to savings goals;
    # the only difference is grouping/labeling in the Goals tab UI.
    goal_type: str = "saving"

class SavingsGoalUpdate(BaseModel):
    """Partial edit of a user-created goal. Every field is optional; only the ones
    the client sends are written. General Savings and Reconciliation are auto-managed
    and reject edits."""
    user_id: Optional[str] = None
    title: Optional[str] = None
    target_amount: Optional[float] = None
    target_month: Optional[str] = None
    target_year: Optional[int] = None

class SavingsGoalFinish(BaseModel):
    """Completing a goal in one tap: the server withdraws whatever the goal holds
    (no user-typed amount) and marks it done. day/month book the withdrawal row."""
    user_id: Optional[str] = None
    day: int
    month: str

class SavingsTransfer(BaseModel):
    user_id: Optional[str] = None
    amount: float
    to_goal_id: int        # destination specific goal
    general_goal_id: int   # General Savings goal id
    day: int
    month: str
    to_goal_title: str     # label for the deposit row

class UserSettings(BaseModel):
    user_id: Optional[str] = None
    # Optional so PATCH /settings/ can update each field independently without
    # clobbering the others. GET responses return the raw row (all fields populated).
    tithe_enabled: Optional[bool] = None
    tithe_rate: Optional[float] = None
    budget_type: Optional[str] = None
    firm_foundation_goals_prompted: Optional[bool] = None

class AccountDeletion(BaseModel):
    user_id: Optional[str] = None
    confirmation: str  # must equal exactly "DELETE" for the request to proceed


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

MONTHS = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
]


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
def get_spending_trends(user_id: str = Depends(get_current_user_id)):
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
def get_dashboard_data(current_month: str, user_id: str = Depends(get_current_user_id)):
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

    # Rollover state for THIS month (source='rollover' is excluded from every
    # number above, so this is purely informational and can never move the score).
    general_id = _ensure_general_savings(user_id)
    roll_entry = _gs_rollover_entry(user_id, current_month, general_id)
    roll_target, _, _ = _compute_target_rollover(user_id, current_month, settings)
    st = _month_status(user_id, current_month)
    rollover_info = {
        "closed": bool(st and st.get("closed_at")),
        "closed_at": st.get("closed_at") if st else None,
        "amount": _r(roll_entry["amount"]) if roll_entry else 0.0,
        "target": roll_target,
    }

    return {
        "month": current_month,
        "total_income": total_income,
        "rollover": rollover_info,
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
def create_expense(expense: Expense, user_id: str = Depends(get_current_user_id)):
    _assert_month_open(user_id, expense.month)
    payload = expense.model_dump()
    payload["user_id"] = user_id  # never trust the body's user_id
    response = supabase.table("expenses").insert(payload).execute()
    return {"message": "Expense successfully added to database!", "data": response.data}

@app.post("/income/")
def create_income(income: Income, user_id: str = Depends(get_current_user_id)):
    # Snapshot the user's CURRENT tithe setting onto the row. This freezes the month's
    # split: even if the user later toggles tithing, past income keeps its original
    # treatment. The live current month is still computed from user_settings.
    _assert_month_open(user_id, income.month)
    settings = _get_user_settings(user_id)
    payload = income.model_dump()
    payload["user_id"] = user_id  # never trust the body's user_id
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
def get_settings(user_id: str = Depends(get_current_user_id)):
    """Return the user's settings, lazily creating a default row if missing."""
    return {"data": _get_user_settings(user_id)}

@app.patch("/settings/")
def update_settings(update: UserSettings, user_id: str = Depends(get_current_user_id)):
    """Update tithe_enabled, tithe_rate, budget_type and/or the firm-foundation
    prompt flag for a user (partial update)."""
    _get_user_settings(user_id)  # ensure a row exists first
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
        return {"data": _get_user_settings(user_id)}
    res = supabase.table("user_settings").update(fields).eq("user_id", user_id).execute()
    return {"message": "Settings updated.", "data": res.data[0] if res.data else None}

@app.get("/expenses/details/")
def get_expense_details(month: str, category: str, user_id: str = Depends(get_current_user_id)):
    # "Goals" is kept allowed for READ-ONLY historical access: the old "Investments"
    # expense bucket wrote category='Goals', and past-month dashboards still need to
    # render those rows. No code path CREATES new 'Goals' expenses anymore — debt and
    # savings goals now live in savings_goals/savings_transactions instead.
    if category not in ("Needs", "Wants", "Goals"):
        return {"data": []}
    response = supabase.table("expenses").select("*").eq("month", month).eq("category", category).eq("user_id", user_id).execute()
    return {"data": response.data}

@app.delete("/expenses/delete/{id}")
def delete_expense(id: int, user_id: str = Depends(get_current_user_id)):
    row = supabase.table("expenses").select("month").eq("id", id).eq("user_id", user_id).execute()
    if row.data:
        _assert_month_open(user_id, row.data[0].get("month"))
    response = supabase.table("expenses").delete().eq("id", id).eq("user_id", user_id).execute()
    return response.data

@app.delete("/income/delete/{id}")
def delete_income(id: int, user_id: str = Depends(get_current_user_id)):
    row = supabase.table("income").select("month").eq("id", id).eq("user_id", user_id).execute()
    if row.data:
        _assert_month_open(user_id, row.data[0].get("month"))
    response = supabase.table("income").delete().eq("id", id).eq("user_id", user_id).execute()
    return response.data


# Every table that stores per-user rows (keyed by user_id). Shared content tables
# (lesson_series, lessons) are intentionally excluded.
#
# `subscriptions` is here for privacy, but note what it does NOT do: deleting the row
# does not cancel the store subscription, and a webhook arriving afterwards will simply
# re-create an orphan row (there is no FK — see migration 0005). That orphan is
# deliberate; it is the audit trail for a refund on an account that no longer exists.
# The user must cancel in the App Store themselves — the delete-account screen says so.
USER_DATA_TABLES = [
    "expenses", "income", "savings_transactions", "savings_goals",
    "month_status", "lesson_ratings", "user_settings", "subscriptions",
]

@app.post("/account/delete/")
def delete_account(req: AccountDeletion, user_id: str = Depends(get_current_user_id)):
    """Irreversibly delete the CALLER'S OWN account. `user_id` from the body is ignored
    entirely — the only account this route can ever touch is the token's own."""
    # Authoritative guard: only proceed when the user typed exactly "DELETE".
    # Anything else is a silent no-op (200, no error) per product spec.
    if req.confirmation != "DELETE":
        return {"deleted": False}

    # Wipe all user-owned data first, then remove the auth identity itself.
    for table in USER_DATA_TABLES:
        try:
            supabase.table(table).delete().eq("user_id", user_id).execute()
        except Exception as e:
            print(f"Account deletion: failed clearing {table} for {user_id}: {e}")

    # Delete the Supabase Auth user. Requires the service_role key (the anon key
    # cannot touch the admin API).
    try:
        supabase.auth.admin.delete_user(user_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to delete auth user: {e}")

    return {"deleted": True}

@app.get("/income/details/")
def get_income_details(month: str, user_id: str = Depends(get_current_user_id)):
    response = supabase.table("income").select("*").eq("month", month).eq("user_id", user_id).execute()
    return {"data": response.data}

@app.get("/income/funding-months/")
def get_funding_months(current_month: str, user_id: str = Depends(get_current_user_id)):
    """Months earlier in the calendar than current_month that are still OPEN (not
    closed) and have > $0 of income. Each can fund a goal deposit from that month's
    leftover income — the deposit is booked against that month's Goals budget."""
    if current_month not in MONTHS:
        return {"data": []}
    cur_idx = MONTHS.index(current_month)
    rows = supabase.table("income").select("amount, month").eq("user_id", user_id).execute().data
    totals: dict[str, float] = {}
    for r in rows:
        totals[r["month"]] = totals.get(r["month"], 0.0) + (r["amount"] or 0.0)
    result = [
        {"month": m, "income": _r(totals[m])}
        for m in MONTHS[:cur_idx]
        if totals.get(m, 0.0) > 0 and not _is_month_closed(user_id, m)
    ]
    return {"data": result}

@app.get("/savings/balance/")
def get_savings_balance(user_id: str = Depends(get_current_user_id)):
    response = supabase.table("savings_transactions").select("amount, type").eq("user_id", user_id).execute()
    balance = sum(
        r["amount"] if r["type"] == "deposit" else -r["amount"]
        for r in response.data
    )
    return {"balance": balance}

@app.post("/savings/transaction/")
def create_savings_transaction(entry: SavingsEntry, user_id: str = Depends(get_current_user_id)):
    _assert_month_open(user_id, entry.month)
    _assert_owns_goals(user_id, entry.goal_id)
    payload = entry.model_dump()
    payload["user_id"] = user_id  # never trust the body's user_id
    response = supabase.table("savings_transactions").insert(payload).execute()
    return {"message": "Savings transaction recorded.", "data": response.data}

# Pre-app savings the user already had when they signed up. Excluded from budget math.
OPENING_SOURCE = "opening"

@app.post("/savings/starting-balance/")
def set_starting_balance(entry: StartingBalance, user_id: str = Depends(get_current_user_id)):
    """One-time capture of the savings the user already had BEFORE they started using
    the app. Booked into General Savings with source='opening' — like 'rollover', that
    source is excluded from the budget math (which allowlists source='income'), so
    money brought in from before never consumes the Goals budget of the month it lands
    in. Idempotent: a user can only ever have one opening row."""
    existing = supabase.table("savings_transactions").select("id") \
        .eq("user_id", user_id).eq("source", OPENING_SOURCE).limit(1).execute()
    if existing.data:
        return {"message": "Starting balance already set.", "already_set": True}

    # A user starting from nothing may legitimately enter 0. The table's amount > 0
    # CHECK forbids a zero row, so record nothing and let them through.
    if entry.amount <= 0:
        return {"message": "No starting balance to record.", "already_set": False}

    _assert_month_open(user_id, entry.month)
    general_id = _ensure_general_savings(user_id)
    supabase.table("savings_transactions").insert({
        "user_id": user_id,
        "title": "Starting balance",
        "amount": entry.amount,
        "type": "deposit",
        "goal_id": general_id,
        "source": OPENING_SOURCE,
        "day": entry.day,
        "month": entry.month,
    }).execute()
    return {"message": "Starting balance recorded.", "already_set": False}

@app.post("/savings/transfer/")
def transfer_from_general(transfer: SavingsTransfer, user_id: str = Depends(get_current_user_id)):
    """Move money from General Savings into a specific goal.
    Creates two transactions with source='transfer' so neither affects the Goals budget.
    Both legs share a `transfer_group` uuid so Recent Activity can collapse them into a
    single entry and deleting that entry removes both legs together (see
    get_savings_history / delete_savings_transaction)."""
    _assert_month_open(user_id, transfer.month)
    _assert_owns_goals(user_id, transfer.general_goal_id, transfer.to_goal_id)
    group = str(uuid.uuid4())
    # Withdrawal from General Savings. Its title is the human-readable label shown for
    # the collapsed transfer entry in Recent Activity.
    supabase.table("savings_transactions").insert({
        "user_id": user_id,
        "title": f"Transfer from General Savings to {transfer.to_goal_title}",
        "amount": transfer.amount,
        "type": "withdrawal",
        "goal_id": transfer.general_goal_id,
        "source": "transfer",
        "transfer_group": group,
        "day": transfer.day,
        "month": transfer.month,
    }).execute()
    # Deposit into the destination goal
    supabase.table("savings_transactions").insert({
        "user_id": user_id,
        "title": transfer.to_goal_title,
        "amount": transfer.amount,
        "type": "deposit",
        "goal_id": transfer.to_goal_id,
        "source": "transfer",
        "transfer_group": group,
        "day": transfer.day,
        "month": transfer.month,
    }).execute()
    return {"message": "Transfer recorded."}

@app.get("/savings/history/")
def get_savings_history(month: str = None, user_id: str = Depends(get_current_user_id)):
    query = supabase.table("savings_transactions").select("*").eq("user_id", user_id)
    if month:
        query = query.eq("month", month)
    response = query.order("created_at", desc=True).execute()
    return {"data": _collapse_transfers(response.data)}

def _collapse_transfers(rows: list) -> list:
    """Fold each General-Savings→goal transfer (two rows sharing a transfer_group)
    into a SINGLE Recent Activity entry. We surface the withdrawal-from-General leg —
    it carries the "Transfer from General Savings to X" label — flagged is_transfer so
    the client renders it neutrally. Order is preserved by first-seen position; the
    entry keeps the withdrawal leg's id, so deleting it cascades to both legs. Rows
    without a transfer_group (deposits, withdrawals, rollover) pass through untouched."""
    by_group: dict[str, list] = {}
    for r in rows:
        g = r.get("transfer_group")
        if g:
            by_group.setdefault(g, []).append(r)
    collapsed, seen = [], set()
    for r in rows:
        g = r.get("transfer_group")
        if not g:
            collapsed.append(r)
            continue
        if g in seen:
            continue
        seen.add(g)
        pair = by_group[g]
        primary = next((x for x in pair if x["type"] == "withdrawal"), pair[0])
        collapsed.append({**primary, "is_transfer": True})
    return collapsed

@app.delete("/savings/transaction/{id}")
def delete_savings_transaction(id: int, user_id: str = Depends(get_current_user_id)):
    row = supabase.table("savings_transactions").select("month, transfer_group").eq("id", id).eq("user_id", user_id).execute()
    if row.data:
        _assert_month_open(user_id, row.data[0].get("month"))
        group = row.data[0].get("transfer_group")
        if group:
            # This row is one leg of a General Savings transfer. Delete BOTH legs so the
            # money returns to General Savings and leaves the goal atomically — net zero
            # to the overall balance, since a transfer never changed total seeds saved.
            response = supabase.table("savings_transactions").delete() \
                .eq("transfer_group", group).eq("user_id", user_id).execute()
            return response.data
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

def _assert_owns_goals(user_id: str, *goal_ids: Optional[int]):
    """Reject goal ids that don't belong to the caller.

    The token settles WHO is acting, but `goal_id` still arrives from the client. Rows
    are written with the caller's own user_id, so a foreign goal_id can't leak data —
    it would corrupt another user's goal allocation, since goal balances are summed by
    goal_id. Verifying ownership closes that."""
    ids = [g for g in goal_ids if g is not None]
    if not ids:
        return
    res = supabase.table("savings_goals").select("id").eq("user_id", user_id).in_("id", ids).execute()
    owned = {r["id"] for r in (res.data or [])}
    if any(g not in owned for g in ids):
        raise HTTPException(status_code=404, detail="Goal not found.")


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
def get_savings_goals(goal_type: Optional[str] = None, user_id: str = Depends(get_current_user_id)):
    # Lazily seed General Savings for this user if it doesn't exist yet
    _ensure_general_savings(user_id)
    query = supabase.table("savings_goals").select("*").eq("user_id", user_id).eq("completed", False)
    # Optional filter: "saving" | "debt". Allocation math is identical for both.
    if goal_type in ("saving", "debt"):
        query = query.eq("goal_type", goal_type)
    goals_res = query.order("created_at", desc=True).execute()
    return {"data": _decorate_reconciliation(_with_allocated(goals_res.data, user_id), user_id)}

def _decorate_reconciliation(goals: list, user_id: str) -> list:
    """The Reconciliation goal's funded math is owed/repaid (not the generic
    deposits−withdrawals _with_allocated gives), so override its fields:
    target_amount = owed, allocated_amount = repaid, plus an `outstanding` field.
    The frontend renders it as a special auto-generated card and hides it when
    outstanding is 0. It stays in the list so users can pay it down like any debt
    goal (normal source='income' deposits)."""
    if not any(g.get("is_reconciliation") for g in goals):
        return goals
    owed, repaid, outstanding, _ = _recon_summary(user_id)
    for g in goals:
        if g.get("is_reconciliation"):
            g["target_amount"] = owed
            g["allocated_amount"] = repaid
            g["outstanding"] = outstanding
    return goals

@app.get("/savings/goal/completed/")
def get_completed_goals(goal_type: Optional[str] = None, user_id: str = Depends(get_current_user_id)):
    query = supabase.table("savings_goals").select("*").eq("user_id", user_id).eq("completed", True)
    if goal_type in ("saving", "debt"):
        query = query.eq("goal_type", goal_type)
    goals_res = query.order("created_at", desc=True).execute()
    return {"data": _with_allocated(goals_res.data, user_id)}

@app.patch("/savings/goal/{id}/complete")
def complete_savings_goal(id: int, user_id: str = Depends(get_current_user_id)):
    response = supabase.table("savings_goals").update({"completed": True}).eq("id", id).eq("user_id", user_id).execute()
    return {"message": "Goal marked as complete.", "data": response.data}

@app.post("/savings/goal/")
def create_savings_goal(goal: SavingsGoal, user_id: str = Depends(get_current_user_id)):
    existing = supabase.table("savings_goals").select("id").eq("user_id", user_id).eq("title", goal.title).execute()
    if existing.data:
        raise HTTPException(status_code=400, detail="A goal with this name already exists.")
    payload = goal.model_dump()
    payload["user_id"] = user_id  # never trust the body's user_id
    response = supabase.table("savings_goals").insert(payload).execute()
    return {"message": "Goal created.", "data": response.data}

def _editable_goal(id: int, user_id: str) -> dict:
    """Load a user-created goal, rejecting the two auto-managed ones."""
    res = supabase.table("savings_goals").select("*").eq("id", id).eq("user_id", user_id).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Goal not found.")
    goal = res.data[0]
    if goal.get("is_general"):
        raise HTTPException(status_code=400, detail="General Savings cannot be edited.")
    if goal.get("is_reconciliation"):
        raise HTTPException(status_code=400, detail="The Reconciliation goal is managed automatically.")
    return goal

@app.patch("/savings/goal/{id}")
def update_savings_goal(id: int, update: SavingsGoalUpdate, user_id: str = Depends(get_current_user_id)):
    goal = _editable_goal(id, user_id)

    fields = update.model_dump(exclude={"user_id"}, exclude_none=True)
    if not fields:
        return {"message": "Nothing to update.", "data": [goal]}

    if "target_amount" in fields and fields["target_amount"] <= 0:
        raise HTTPException(status_code=400, detail="Target amount must be greater than zero.")

    new_title = fields.get("title")
    if new_title and new_title != goal["title"]:
        clash = supabase.table("savings_goals").select("id") \
            .eq("user_id", user_id).eq("title", new_title).neq("id", id).execute()
        if clash.data:
            raise HTTPException(status_code=400, detail="A goal with this name already exists.")

    response = supabase.table("savings_goals").update(fields).eq("id", id).eq("user_id", user_id).execute()

    # Transaction titles are denormalized copies of the goal title, so a rename would
    # leave stale labels in Recent Activity. Only rows still carrying the OLD title are
    # renamed — rows like "Returned from deleted goal" keep their own wording.
    if new_title and new_title != goal["title"]:
        supabase.table("savings_transactions").update({"title": new_title}) \
            .eq("goal_id", id).eq("user_id", user_id).eq("title", goal["title"]).execute()

    return {"message": "Goal updated.", "data": response.data}

@app.post("/savings/goal/{id}/finish")
def finish_savings_goal(id: int, body: SavingsGoalFinish, user_id: str = Depends(get_current_user_id)):
    """One-tap completion. Withdraws exactly what the goal holds — no hand-typed
    amount — and snapshots it, since allocated_amount (deposits − withdrawals) drops
    to 0 the moment the withdrawal lands.

    ORDER MATTERS: the goal is marked complete FIRST. There are two writes here and no
    transaction across them, so if one has to fail it must be the second. Marking first
    means a failure leaves the goal active with its money intact (retry is safe);
    withdrawing first would take the money and leave the goal active at $0."""
    goal = _editable_goal(id, user_id)
    if goal.get("completed"):
        raise HTTPException(status_code=400, detail="Goal is already completed.")
    _assert_month_open(user_id, body.month)

    allocated = max(0.0, _goal_balance(user_id, id))
    # Self-heal: a goal whose balance is already 0 but which has deposits on record was
    # withdrawn by an earlier half-failed finish. Snapshot what it HELD so the Completed
    # card isn't blank, and skip the withdrawal below (the money is already gone).
    if allocated == 0:
        deps = supabase.table("savings_transactions").select("amount") \
            .eq("user_id", user_id).eq("goal_id", id).eq("type", "deposit").execute()
        snapshot = _r(sum(d["amount"] for d in deps.data))
    else:
        snapshot = allocated

    try:
        supabase.table("savings_goals").update({
            "completed": True,
            "completed_amount": snapshot,
            "completed_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        }).eq("id", id).eq("user_id", user_id).execute()
    except Exception as e:
        # Surfaced to the client instead of 500-ing anonymously: the likeliest cause is a
        # stale PostgREST schema cache after the 0004 migration (PGRST204).
        raise HTTPException(status_code=500, detail=f"Could not mark the goal complete: {e}")

    if allocated > 0:
        supabase.table("savings_transactions").insert({
            "user_id": user_id,
            "title": goal["title"],
            "amount": allocated,
            "type": "withdrawal",
            "goal_id": id,
            "source": "income",
            "day": body.day,
            "month": body.month,
        }).execute()

    return {"message": "Goal completed.", "allocated": allocated, "completed_amount": snapshot}

@app.delete("/savings/goal/{id}")
def delete_savings_goal(id: int, current_month: str, user_id: str = Depends(get_current_user_id)):
    # Block deletion of General Savings
    goal_res = supabase.table("savings_goals").select("is_general, is_reconciliation").eq("id", id).eq("user_id", user_id).execute()
    if not goal_res.data:
        raise HTTPException(status_code=404, detail="Goal not found.")
    if goal_res.data[0].get("is_general"):
        raise HTTPException(status_code=400, detail="General Savings cannot be deleted.")
    if goal_res.data[0].get("is_reconciliation"):
        raise HTTPException(status_code=400, detail="The Reconciliation goal is managed automatically and cannot be deleted.")

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


# ─── End-of-month rollover ────────────────────────────────────────────────────
# When a month is "closed out", its leftover (income not spent or already saved)
# moves into General Savings as a SINGLE adjustable rollover entry, recomputed
# deterministically by reconcile_month whenever that month changes. Late edits to
# a closed month are reconciled safely against an auto-managed Reconciliation debt
# goal. ISOLATION: every transaction this feature writes uses source='rollover',
# which the budget/score math excludes (those paths allowlist source='income'),
# so a rollover bug can only ever move a savings balance — never the budgeting.
ROLLOVER_SOURCE = "rollover"
RECON_TITLE = "Reconciliation"

def _r(x) -> float:
    """Round to cents to keep float dust out of the ledger."""
    return round(float(x or 0.0), 2)

def _month_status(user_id: str, month: str) -> Optional[dict]:
    res = supabase.table("month_status").select("*").eq("user_id", user_id).eq("month", month).execute()
    return res.data[0] if res.data else None

def _is_month_closed(user_id: str, month: str) -> bool:
    st = _month_status(user_id, month)
    return bool(st and st.get("closed_at"))

def _assert_month_open(user_id: str, month: Optional[str]):
    """Closed months are read-only. Edit routes call this so a user must explicitly
    Reopen before changing a closed month (the safer of the two options in the spec).
    Old clients never close a month, so this guard is inert for them."""
    if month and _is_month_closed(user_id, month):
        raise HTTPException(status_code=409, detail=f"{month} is closed. Reopen it before making changes.")

def _sum_expenses(user_id: str, month: str, category: str) -> float:
    res = supabase.table("expenses").select("amount").eq("user_id", user_id).eq("month", month).eq("category", category).execute()
    return sum(r["amount"] for r in res.data)

def _rollover_income_rows(user_id: str, month: str) -> list:
    return supabase.table("income").select("amount, day, month, tithe_enabled, tithe_rate, budget_type") \
        .eq("user_id", user_id).eq("month", month).execute().data

def _goal_balance(user_id: str, goal_id: Optional[int]) -> float:
    """Liquid balance held in a single goal = deposits − withdrawals (all sources)."""
    if goal_id is None:
        return 0.0
    res = supabase.table("savings_transactions").select("amount, type").eq("user_id", user_id).eq("goal_id", goal_id).execute()
    return _r(sum(t["amount"] if t["type"] == "deposit" else -t["amount"] for t in res.data))

def _compute_target_rollover(user_id: str, month: str, settings: Optional[dict] = None):
    """Pure function of the month's data: the leftover the dashboard implies.

    budgetable is computed with the SAME _month_tithe the dashboard uses (live
    setting for the current month, per-row snapshot for past months) and the goals
    actual is the SAME (legacy 'Goals' expenses + income-sourced deposits), so the
    rollover amount always equals the "leftover" the user actually sees — they can
    never diverge. The budget-type split does NOT affect the target (it's NET
    leftover); the split is only used for the per-category breakdown shown in the UI.

    Returns (target_rollover, breakdown, budgetable).
    """
    settings = settings or _get_user_settings(user_id)
    irows = _rollover_income_rows(user_id, month)
    total_income = sum(r["amount"] for r in irows)
    budgetable = _month_tithe(month, total_income, irows, settings)["budgetable"]
    bt = BUDGET_TYPES[_month_budget_type(month, irows, settings)]

    needs_spent = _sum_expenses(user_id, month, "Needs")
    wants_spent = _sum_expenses(user_id, month, "Wants")
    # Goals actual EXACTLY as get_dashboard_data computes it: legacy 'Goals'
    # expenses + income-sourced savings deposits (source='income' only; transfers
    # and rollover are excluded). For any month closeable today there are no new
    # 'Goals' expenses, so this equals "goals income deposits" — matching both the
    # spec's formula and the dashboard.
    goals_exp = _sum_expenses(user_id, month, "Goals")
    gdep = supabase.table("savings_transactions").select("amount") \
        .eq("user_id", user_id).eq("month", month).eq("type", "deposit").eq("source", "income").execute()
    goals_spent = goals_exp + sum(r["amount"] for r in gdep.data)

    target = max(0.0, _r(budgetable - needs_spent - wants_spent - goals_spent))
    breakdown = {
        "needs": {"budget": _r(budgetable * bt["needs"]), "spent": _r(needs_spent), "left": _r(budgetable * bt["needs"] - needs_spent)},
        "wants": {"budget": _r(budgetable * bt["wants"]), "spent": _r(wants_spent), "left": _r(budgetable * bt["wants"] - wants_spent)},
        "goals": {"budget": _r(budgetable * bt["savings"]), "spent": _r(goals_spent), "left": _r(budgetable * bt["savings"] - goals_spent)},
    }
    return target, breakdown, _r(budgetable)

def _gs_rollover_entry(user_id: str, month: str, general_id: int) -> Optional[dict]:
    """The single GS rollover deposit for a month (updated in place), or None."""
    res = supabase.table("savings_transactions").select("*") \
        .eq("user_id", user_id).eq("month", month).eq("goal_id", general_id) \
        .eq("source", ROLLOVER_SOURCE).eq("type", "deposit").execute()
    return res.data[0] if res.data else None

def _set_gs_rollover(user_id: str, month: str, general_id: int, entry: Optional[dict], new_amount: float, day: int):
    """Upsert the month's one GS rollover entry. amount>0 is enforced by a CHECK,
    so a zero target means we DELETE the entry rather than store 0."""
    new_amount = _r(new_amount)
    if new_amount <= 0.005:
        if entry:
            supabase.table("savings_transactions").delete().eq("id", entry["id"]).eq("user_id", user_id).execute()
        return
    if entry:
        supabase.table("savings_transactions").update({"amount": new_amount}).eq("id", entry["id"]).eq("user_id", user_id).execute()
    else:
        supabase.table("savings_transactions").insert({
            "user_id": user_id, "title": f"Rollover — {month}", "amount": new_amount,
            "type": "deposit", "goal_id": general_id, "source": ROLLOVER_SOURCE,
            "day": day, "month": month,
        }).execute()

def _recon_goal(user_id: str) -> Optional[dict]:
    res = supabase.table("savings_goals").select("*").eq("user_id", user_id).eq("is_reconciliation", True).execute()
    return res.data[0] if res.data else None

def _ensure_reconciliation_goal(user_id: str) -> int:
    """Ensure the auto-managed Reconciliation debt goal exists. One per user,
    not user-creatable/deletable. Mirrors _ensure_general_savings."""
    g = _recon_goal(user_id)
    if g:
        return g["id"]
    ins = supabase.table("savings_goals").insert({
        "user_id": user_id, "title": RECON_TITLE, "goal_type": "debt",
        "is_reconciliation": True, "target_amount": 0.0, "completed": False,
    }).execute()
    return ins.data[0]["id"]

def _recon_txns(user_id: str, recon_id: Optional[int]) -> list:
    if recon_id is None:
        return []
    return supabase.table("savings_transactions").select("amount, type, source, month") \
        .eq("user_id", user_id).eq("goal_id", recon_id).execute().data

def _recon_month_booked(user_id: str, month: str, recon_id: Optional[int]) -> float:
    """THIS month's net reconciliation debt booked via the rollover mechanism =
    Σ(source='rollover' withdrawals) − Σ(source='rollover' deposits) for the month.

    Pure per-month: user income repayments (source='income') are intentionally
    EXCLUDED, so paying down the debt manually never makes a later reconcile think
    leftover increased and claw money back. This is what keeps reconcile a pure
    function of the month's own transactions."""
    if recon_id is None:
        return 0.0
    rows = [t for t in _recon_txns(user_id, recon_id) if t.get("month") == month and t.get("source") == ROLLOVER_SOURCE]
    withdr = sum(t["amount"] for t in rows if t["type"] == "withdrawal")
    dep = sum(t["amount"] for t in rows if t["type"] == "deposit")
    return _r(withdr - dep)

def _recon_summary(user_id: str, recon_id: Optional[int] = None):
    """Returns (owed, repaid, outstanding, recon_id) for the Reconciliation goal.
    owed   = Σ rollover withdrawals (debt the reconcile booked)
    repaid = Σ all deposits (reconcile auto-repay 'rollover' + user 'income' payments)
    outstanding = max(0, owed − repaid)."""
    if recon_id is None:
        g = _recon_goal(user_id)
        recon_id = g["id"] if g else None
    rows = _recon_txns(user_id, recon_id)
    owed = sum(t["amount"] for t in rows if t["type"] == "withdrawal" and t["source"] == ROLLOVER_SOURCE)
    repaid = sum(t["amount"] for t in rows if t["type"] == "deposit")
    return _r(owed), _r(repaid), _r(max(0.0, owed - repaid)), recon_id

def reconcile_month(user_id: str, month: str) -> float:
    """Single source of truth for a month's rollover. Idempotent and convergent:
    re-running with no data change is a no-op. Drives
        net = (GS rollover entry) − (this month's booked reconciliation debt)
    to target_rollover. NEVER touches any user-created goal — shortfalls land only
    on the Reconciliation debt goal.

    NOTE: the spec's prose used delta = current_entry − target, but that is
    inconsistent with its own Scenario 4 (where an outstanding debt must also be
    repaid when leftover recovers). We drive the NET (entry − booked-debt) to
    target instead, which produces the scenario's stated results and stays idempotent.
    """
    settings = _get_user_settings(user_id)
    target, _, _ = _compute_target_rollover(user_id, month, settings)

    general_id = _ensure_general_savings(user_id)
    entry = _gs_rollover_entry(user_id, month, general_id)
    R = _r(entry["amount"]) if entry else 0.0

    recon = _recon_goal(user_id)
    recon_id = recon["id"] if recon else None
    B = _recon_month_booked(user_id, month, recon_id)

    net_current = _r(R - B)
    need = _r(target - net_current)
    day = datetime.datetime.now().day if month == _current_month_name() else 28

    if abs(need) < 0.005:
        pass  # already converged
    elif need > 0:
        # Leftover recovered: repay THIS month's booked debt FIRST, then top up GS.
        pay = min(need, B)
        if pay > 0.005:
            recon_id = recon_id or _ensure_reconciliation_goal(user_id)
            supabase.table("savings_transactions").insert({
                "user_id": user_id, "title": f"Rollover recovery — {month}", "amount": _r(pay),
                "type": "deposit", "goal_id": recon_id, "source": ROLLOVER_SOURCE, "day": day, "month": month,
            }).execute()
        remainder = _r(need - pay)
        if remainder > 0.005:
            _set_gs_rollover(user_id, month, general_id, entry, _r(R + remainder), day)
    else:
        # Leftover shrank: claw back, but General Savings may never go negative.
        A = _r(-need)
        gs_balance = _goal_balance(user_id, general_id)
        reducible = max(0.0, min(A, R, gs_balance))
        if reducible > 0.005:
            _set_gs_rollover(user_id, month, general_id, entry, _r(R - reducible), day)
        shortfall = _r(A - reducible)
        if shortfall > 0.005:
            recon_id = recon_id or _ensure_reconciliation_goal(user_id)
            supabase.table("savings_transactions").insert({
                "user_id": user_id, "title": f"Spent after close — {month}", "amount": _r(shortfall),
                "type": "withdrawal", "goal_id": recon_id, "source": ROLLOVER_SOURCE, "day": day, "month": month,
            }).execute()

    # Keep the Reconciliation goal's target_amount in sync with total owed so it
    # renders sensibly anywhere a generic debt goal would (progress = repaid/owed).
    if recon_id:
        owed, _repaid, _out, _ = _recon_summary(user_id, recon_id)
        supabase.table("savings_goals").update({"target_amount": owed}).eq("id", recon_id).eq("user_id", user_id).execute()

    return target


@app.get("/rollover/preview/")
def rollover_preview(month: str, user_id: str = Depends(get_current_user_id)):
    """Target rollover + per-category breakdown (split used for display only) and
    whether the month is closed. Does not mutate anything."""
    target, breakdown, budgetable = _compute_target_rollover(user_id, month)
    st = _month_status(user_id, month)
    return {
        "month": month,
        "closed": bool(st and st.get("closed_at")),
        "closed_at": st.get("closed_at") if st else None,
        "target_rollover": target,
        "budgetable": budgetable,
        "breakdown": breakdown,
    }

class RolloverAction(BaseModel):
    user_id: Optional[str] = None
    month: str

@app.post("/rollover/close/")
def rollover_close(action: RolloverAction, user_id: str = Depends(get_current_user_id)):
    """Reconcile the month (first close defines the rollover entry) then mark it
    closed. Safe to call repeatedly — reconcile is idempotent."""
    moved = reconcile_month(user_id, action.month)
    supabase.table("month_status").upsert({
        "user_id": user_id, "month": action.month,
        "closed_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
    }).execute()
    return {"message": f"{action.month} closed.", "month": action.month, "rolled_over": moved}

@app.post("/rollover/reopen/")
def rollover_reopen(action: RolloverAction, user_id: str = Depends(get_current_user_id)):
    """Unlock a closed month for editing. Recompute happens on the next close
    (or whenever reconcile_month runs), the single deterministic recompute point."""
    supabase.table("month_status").upsert({
        "user_id": user_id, "month": action.month, "closed_at": None,
    }).execute()
    return {"message": f"{action.month} reopened.", "month": action.month}


class LessonRating(BaseModel):
    user_id: Optional[str] = None
    lesson_id: int
    rating: int  # 1–5

@app.post("/lesson-ratings/")
def create_lesson_rating(entry: LessonRating, user_id: str = Depends(get_current_user_id)):
    payload = entry.model_dump()
    payload["user_id"] = user_id  # never trust the body's user_id
    response = supabase.table("lesson_ratings").insert(payload).execute()
    return {"message": "Rating recorded.", "data": response.data}


# ─── Premium subscriptions: capability marker, config, entitlement ────────────
# DollarSeeds is live, and the binaries already on people's phones keep calling this
# API forever. They have no RevenueCat SDK, no paywall and no purchase path, so showing
# one a locked series is a dead end with no way out. Everything here is built around a
# single rule:
#
#   AN UNMARKED REQUEST MUST TAKE EXACTLY THE CODE PATH IT TOOK BEFORE THIS FEATURE.
#
# Not "a path that usually succeeds" — the same path, issuing the same queries. That is
# why the gate in /playback/ returns before it reads app_config, lesson_series or
# subscriptions. Three tests seed a lesson whose series_id has NO lesson_series row
# (test_auth_security::test_lesson_video_urls_require_authentication, and two in
# test_regression); they pass untouched, and that is the proof. If they ever need
# editing to accommodate a change here, the change is wrong.
#
# v2 identifies itself with `X-Client-Features: premium`, attached once in the app's
# axios request interceptor. A header rather than a query param because that
# interceptor is a single choke point already scoped to this host: one line there marks
# every request the app will ever make, including routes that don't exist yet. A query
# param would have to be added at each call site and forgotten at the next one.

PREMIUM_FEATURE = "premium"
PREMIUM_ENTITLEMENT_ID = "premium"

# A SECOND capability, not a reuse of `premium`. X-Client-Features is a LIST of what
# the calling build understands, and this is what that list is for: creator social
# links have nothing to do with subscriptions, and a build that renders the paywall is
# not thereby a build that renders a link row.
#
# The distinction is not academic — the premium binary is itself now a shipped
# generation that cannot be patched. Keying these fields off `premium` would start
# sending it keys it was never written against; keying them off their own token means
# each generation gets exactly the response it was built for, and the question "which
# build sees this field" stays answerable by reading one line.
SOCIAL_FEATURE = "social"

# Two switches, deliberately not one:
#   * Hiding premium series from UNMARKED clients is ALWAYS on. It is backward
#     compatibility, not a business rule, and must survive every rollback.
#   * premium_enabled gates only MARKED clients. Flipping it off hands v2 users free
#     access without ever exposing premium content to an old binary — which matters,
#     because content given away cannot be taken back (no series is ever retro-paywalled).
APP_CONFIG_DEFAULTS = {
    "premium_enabled": "false",
    "min_supported_version": "0.0.0",
    "update_url": "",
}
_APP_CONFIG_TTL_SECONDS = 60
_app_config_cache: Optional[tuple] = None   # (monotonic_stamp, values)

REVENUECAT_API_KEY: str = os.environ.get("REVENUECAT_API_KEY", "").strip()
REVENUECAT_WEBHOOK_AUTH: str = os.environ.get("REVENUECAT_WEBHOOK_AUTH", "").strip()
REVENUECAT_API_URL = "https://api.revenuecat.com/v1/subscribers"
REVENUECAT_TIMEOUT_SECONDS = 3.0

# Caches BOTH outcomes of a RevenueCat lookup for a minute, keyed by user id. The
# negative half stops a denied user re-hitting the API on every tap; the positive half
# stops an entitled user doing so while the webhook is still in flight. Evicted the
# moment a webhook writes anything for that user, so a fresh purchase is never masked.
_FALLBACK_CACHE_TTL_SECONDS = 60
_fallback_cache: dict = {}   # user_id -> (monotonic_stamp, bool)

# Adoption telemetry for rollout step 3 ("flip once adoption looks reasonable").
# Logged to Render's stream only — never exposed on /config/, which is public and
# unauthenticated. In-process and per-instance, reset by every deploy: the question is
# a ratio, not a total, so that costs nothing and needs no schema.
_marked_requests = 0
_unmarked_requests = 0
_client_mix_logged_at = 0.0
_CLIENT_MIX_LOG_INTERVAL_SECONDS = 60


class PremiumRequired(Exception):
    """403 carrying a machine-readable code the app branches on.

    Every other error in this file is `{"detail": "<sentence>"}` and stays that way —
    screens pass `detail` straight to Alert.alert, so making it an object would break
    them. This adds a TOP-LEVEL `code` instead, which is the one thing the paywall path
    needs: the client must tell "you need to subscribe" apart from any other 403 in
    order to show a paywall rather than a generic "couldn't load this video"."""


@app.exception_handler(PremiumRequired)
def _premium_required_handler(request: Request, exc: PremiumRequired):
    return JSONResponse(
        status_code=403,
        content={
            "code": "premium_required",
            "detail": "This series is part of DollarSeeds Premium.",
        },
    )


class _EntitlementLookupUnavailable(Exception):
    """RevenueCat could not be reached inside the timeout. Distinct from "they said no"
    so the caller can choose its own failure posture."""


def _client_features(x_client_features: Optional[str] = Header(default=None)) -> set:
    """Which capabilities the calling BUILD supports. No header = the shipped binary,
    which supports none of them."""
    global _marked_requests, _unmarked_requests
    if x_client_features:
        _marked_requests += 1
        features = {f.strip().lower() for f in x_client_features.split(",") if f.strip()}
    else:
        _unmarked_requests += 1
        features = set()
    _log_client_mix()
    return features


def _log_client_mix() -> None:
    global _client_mix_logged_at
    now = time.monotonic()
    if now - _client_mix_logged_at < _CLIENT_MIX_LOG_INTERVAL_SECONDS:
        return
    _client_mix_logged_at = now
    total = _marked_requests + _unmarked_requests
    if total:
        pct = 100.0 * _marked_requests / total
        print(f"client-mix: {_marked_requests}/{total} lesson requests on v2+ ({pct:.1f}%)")


def _app_config() -> dict:
    """Server-side flags, cached for a minute.

    A table rather than env vars so the kill switch is one UPDATE in the Supabase
    dashboard: no Render redeploy, and — the point — the lever still works when a bad
    deploy is what broke things.

    FAILS OPEN. A read that throws yields premium_enabled=false, i.e. exactly today's
    behaviour, matching the app's own "never trap the user behind a gate" rule. The
    failure is not cached, so the next request retries."""
    global _app_config_cache
    now = time.monotonic()
    if _app_config_cache and now - _app_config_cache[0] < _APP_CONFIG_TTL_SECONDS:
        return _app_config_cache[1]

    values = dict(APP_CONFIG_DEFAULTS)
    try:
        rows = supabase.table("app_config").select("key, value").execute().data
    except Exception as e:
        print(f"app_config read failed; falling back to defaults (premium off): {e}")
        return values
    for row in rows:
        if row.get("key") in values and row.get("value") is not None:
            values[row["key"]] = str(row["value"])

    _app_config_cache = (now, values)
    return values


def _premium_enabled() -> bool:
    return _app_config().get("premium_enabled", "false").strip().lower() == "true"


def _parse_ts(value) -> Optional[datetime.datetime]:
    """Postgres timestamptz -> aware datetime. None for anything unparseable, which
    every caller reads as "no access" rather than guessing."""
    if not value:
        return None
    if isinstance(value, datetime.datetime):
        return value if value.tzinfo else value.replace(tzinfo=datetime.timezone.utc)
    try:
        parsed = datetime.datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError:
        return None
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=datetime.timezone.utc)


def _ms_to_iso(ms) -> Optional[str]:
    """RevenueCat sends epoch milliseconds; Postgres wants a timestamptz string."""
    if ms in (None, ""):
        return None
    try:
        return datetime.datetime.fromtimestamp(
            int(ms) / 1000, datetime.timezone.utc
        ).isoformat()
    except (TypeError, ValueError, OSError):
        return None


def _has_premium(user_id: str) -> bool:
    """Is this user entitled RIGHT NOW, according to our own table?

    Deliberately NOT driven by `status`. RevenueCat delivers a refund as a CANCELLATION,
    and a cancellation that merely turns auto-renew off must NOT revoke access — the
    user paid for the period. Deriving access from a status string collapses those two
    into one field and necessarily gets one of them wrong. `expires_at` is the single
    quantity that is right in both cases, because RevenueCat moves it: forward when
    Apple extends a grace period, back to the refund moment when money is returned.

        entitled  <=>  expires_at > now()  AND  revoked_at IS NULL

    `status`, `auto_renew` and `cancelled_at` are descriptive only — support and the
    paywall's "Current: ..." line read them; access never does.

    Compared in Python, not SQL, matching the house style (totals are summed in Python
    after fetching rows). A user has one or two rows; there is nothing to push down."""
    try:
        rows = supabase.table("subscriptions") \
            .select("expires_at, revoked_at").eq("user_id", user_id).execute().data
    except Exception as e:
        print(f"entitlement read failed for {user_id}: {e}")
        return False

    now = datetime.datetime.now(datetime.timezone.utc)
    for row in rows:
        if row.get("revoked_at"):
            continue
        expires = _parse_ts(row.get("expires_at"))
        if expires and expires > now:
            return True
    return False


def _entitlement_via_revenuecat(user_id: str) -> bool:
    """Ask RevenueCat directly after a miss against our own table.

    Without this, a misconfigured webhook is an invisible total outage: no paying user
    has access and there is no way to backfill. It also closes the purchase->playback
    race, where StoreKit has already succeeded but the webhook has not landed.

    Runs ONLY after a local miss, which is what makes the cache safe: a user whose
    webhook has since arrived is served from the table and never consults it.

    Raises _EntitlementLookupUnavailable on timeout/upstream error — the caller picks
    the failure posture, because a gate and a status read want different ones."""
    if not REVENUECAT_API_KEY:
        return False

    cached = _fallback_cache.get(user_id)
    if cached and time.monotonic() - cached[0] < _FALLBACK_CACHE_TTL_SECONDS:
        return cached[1]

    try:
        res = httpx.get(
            f"{REVENUECAT_API_URL}/{user_id}",
            headers={"Authorization": f"Bearer {REVENUECAT_API_KEY}"},
            timeout=REVENUECAT_TIMEOUT_SECONDS,
        )
        res.raise_for_status()
        body = res.json()
    except Exception as e:
        print(f"RevenueCat lookup failed for {user_id}: {e}")
        raise _EntitlementLookupUnavailable() from e

    entitlement = ((body.get("subscriber") or {}).get("entitlements") or {}) \
        .get(PREMIUM_ENTITLEMENT_ID) or {}
    expires = _parse_ts(entitlement.get("expires_date"))
    active = bool(expires and expires > datetime.datetime.now(datetime.timezone.utc))

    # Deliberately no write-through. The subscriber REST payload has a different shape
    # from a webhook event, and parsing it into a row would mean a second, rarely
    # exercised writer for the same table. The cache bounds the API calls instead, and
    # the webhook remains the ONLY writer.
    _fallback_cache[user_id] = (time.monotonic(), active)
    return active


def _is_entitled(user_id: str) -> bool:
    """Local table first, RevenueCat only on a miss."""
    if _has_premium(user_id):
        return True
    return _entitlement_via_revenuecat(user_id)


def _series_is_premium(series_id: Optional[str]) -> bool:
    """FAILS OPEN: an absent series_id, a missing row, or a read error all mean "not
    premium". Locking a paying user out over a lookup blip is worse than serving one
    video we meant to gate."""
    if not series_id:
        return False
    try:
        rows = supabase.table("lesson_series").select("is_premium") \
            .eq("id", series_id).execute().data
    except Exception as e:
        print(f"is_premium lookup failed for series {series_id}: {e}")
        return False
    return bool(rows and rows[0].get("is_premium", False))


# ─── Video lesson series ──────────────────────────────────────────────────────
# Cloud-hosted VIDEO series (distinct from the written lessons, which live entirely
# in the frontend constant `constants/lessons.ts` + local AsyncStorage). Data model:
#   lesson_series 1───∞ lessons
# Videos live in the PRIVATE `lesson-videos` bucket; lessons.video_id is the object
# PATH inside it. The app never receives a permanent video URL — the list/detail
# routes below deliberately omit video paths, and /playback/ mints a short-lived
# signed URL per play. Series/lesson images live in the PUBLIC `lesson-thumbnails`
# bucket (thumbnail_url is a plain public URL).
#
# CONTENT WORKFLOW: there is no admin UI. Video/image files are uploaded, and the
# lesson_series / lessons rows inserted, MANUALLY via the Supabase dashboard.

SIGNED_URL_TTL_SECONDS = 3600  # 1 hour; the client re-fetches per playback

class SeriesSummary(BaseModel):
    id: str
    title: str
    description: Optional[str] = None
    creator: Optional[str] = None
    thumbnail_url: Optional[str] = None
    lesson_count: int

class SeriesLesson(BaseModel):
    id: str
    title: str
    description: Optional[str] = None
    duration_seconds: Optional[int] = None
    thumbnail_url: Optional[str] = None
    sort_order: int

class SeriesDetail(BaseModel):
    id: str
    title: str
    description: Optional[str] = None
    creator: Optional[str] = None
    thumbnail_url: Optional[str] = None
    lessons: list[SeriesLesson]
    # Creator social links (migration 0006). Sent ONLY to builds advertising the
    # `social` capability — see get_lesson_series. Full https:// URLs, or absent.
    instagram_url: Optional[str] = None
    linkedin_url: Optional[str] = None
    website_url: Optional[str] = None

class PlaybackResponse(BaseModel):
    url: str
    expires_in: int


@app.get("/lessons/series/")
def list_lesson_series(features: set = Depends(_client_features),
                       user_id: str = Depends(get_current_user_id)):
    """Published video series for the Lessons page, ordered by sort_order. Each carries
    a DERIVED lesson_count (never stored, so it can't drift). No video paths are exposed.

    Premium series are hidden OUTRIGHT from clients that don't advertise the `premium`
    feature. That is not a business rule and is not behind the kill switch — a build
    with no paywall and no purchase path can only render a locked card as a dead end,
    and hiding it costs no revenue because that build cannot transact anyway."""
    supports_premium = PREMIUM_FEATURE in features

    series = supabase.table("lesson_series") \
        .select("id, title, description, creator, thumbnail_url, is_premium") \
        .eq("is_published", True).order("sort_order").execute().data

    if not supports_premium:
        # Filter BEFORE deriving counts, so lesson_count and ordering for the series an
        # old binary DOES see are bit-for-bit what it receives today.
        series = [s for s in series if not s.get("is_premium", False)]

    # Derive lesson_count with a single COUNT-style query over the published series' ids.
    counts: dict[str, int] = {}
    ids = [s["id"] for s in series]
    if ids:
        rows = supabase.table("lessons").select("series_id").in_("series_id", ids).execute().data
        for r in rows:
            counts[r["series_id"]] = counts.get(r["series_id"], 0) + 1

    data = []
    for s in series:
        item = {
            "id": s["id"],
            "title": s["title"],
            "description": s.get("description"),
            "creator": s.get("creator"),
            "thumbnail_url": s.get("thumbnail_url"),
            "lesson_count": counts.get(s["id"], 0),
        }
        if supports_premium:
            # Only marked clients get the extra key, so the unmarked response stays
            # byte-identical. They need it to draw the lock badge BEFORE the tap: the
            # 403 from /playback/ is the enforcement backstop, not the UX trigger.
            item["is_premium"] = bool(s.get("is_premium", False))
        data.append(item)
    return {"data": data}


@app.get("/lessons/series/{series_id}/")
def get_lesson_series(series_id: str,
                      features: set = Depends(_client_features),
                      user_id: str = Depends(get_current_user_id)):
    """A single published series plus its lessons ordered by sort_order. Returns only the
    metadata the playlist screen needs — NEVER raw video paths/URLs (see /playback/).

    Deliberately NOT marker-filtered: an old binary cannot reach a premium series id,
    because it never appears in its list, and nothing here exposes a video path. Marked
    clients additionally get `is_premium` so the playlist can lock rows before the tap,
    and `social`-capable clients get the three creator link fields.

    Widening the SERIES select is safe in a way the lessons select is not — those rows
    are never handed to the client. Every series field on the wire is copied out by
    hand into the dict at the bottom of this function, so a column selected here
    reaches nobody until a line down there puts it inside a capability check. It is
    still selected conditionally; see the comment on series_columns for why."""
    wants_social = SOCIAL_FEATURE in features
    # The new columns are selected ONLY when someone is going to be sent them. An
    # unmarked request therefore issues the identical query it issues today, right down
    # to the column list — which is what keeps a stale PostgREST schema cache after the
    # 0006 migration (PGRST204) a problem for social builds alone, instead of 500-ing
    # this endpoint for the binaries in the App Store. Same reasoning as the /playback/
    # gate: an old client must not merely get the same answer, it must run the same path.
    series_columns = "id, title, description, creator, thumbnail_url, is_published, is_premium"
    if wants_social:
        series_columns += ", instagram_url, linkedin_url, website_url"

    s = supabase.table("lesson_series").select(series_columns).eq("id", series_id).execute().data
    if not s or not s[0].get("is_published"):
        raise HTTPException(status_code=404, detail="Series not found.")
    series = s[0]

    # DO NOT add columns to this select. Unlike the series fields below, these rows are
    # passed to the client verbatim, so anything selected here lands on the wire — and
    # this is the only line in the file where that can leak a new field to old binaries.
    lessons = supabase.table("lessons") \
        .select("id, title, description, duration_seconds, thumbnail_url, sort_order") \
        .eq("series_id", series_id).order("sort_order").execute().data

    data = {
        "id": series["id"],
        "title": series["title"],
        "description": series.get("description"),
        "creator": series.get("creator"),
        "thumbnail_url": series.get("thumbnail_url"),
        "lessons": lessons,
    }
    if PREMIUM_FEATURE in features:
        data["is_premium"] = bool(series.get("is_premium", False))
    if wants_social:
        # Marked-only, NOT unconditional. Old clients would indeed ignore unknown keys
        # — but "would ignore" is a claim about a binary nobody can patch if it turns
        # out to be wrong, and the goldens exist precisely so that claim never has to
        # be made. Adding these for everyone would change GET /lessons/series/{id}/ for
        # the App Store binary, which test_backcompat_lessons.py treats as a regression
        # rather than a golden to update.
        #
        # Always all three keys, present as null when unset. A key that appeared only
        # when populated would make the client's "no links at all" branch depend on
        # absence rather than on value — the same null-vs-undefined trap the goldens
        # README documents for lesson.description.
        data["instagram_url"] = series.get("instagram_url")
        data["linkedin_url"] = series.get("linkedin_url")
        data["website_url"] = series.get("website_url")
    return {"data": data}


@app.get("/lessons/{lesson_id}/playback/")
def get_lesson_playback(lesson_id: str,
                        features: set = Depends(_client_features),
                        user_id: str = Depends(get_current_user_id)):
    """Mint a SHORT-LIVED signed URL to stream one lesson's video. The private
    `lesson-videos` bucket is never public, so this is the only way the app gets a
    (temporary, expiring) URL. Returns { url, expires_in }."""
    row = supabase.table("lessons") \
        .select("id, series_id, video_provider, video_id").eq("id", lesson_id).execute().data
    if not row:
        raise HTTPException(status_code=404, detail="Lesson not found.")
    lesson = row[0]

    # ── Premium gate ────────────────────────────────────────────────────────────
    # THE ORDER OF THESE CONDITIONS IS THE BACKWARD-COMPATIBILITY GUARANTEE. Python
    # short-circuits `and`, so an unmarked request leaves this line having issued not
    # one extra query — no app_config read, no lesson_series lookup, no subscriptions
    # scan. Anything hoisted above the marker check breaks a live app that cannot be
    # rolled back. Three tests seed a lesson whose series_id has no lesson_series row
    # precisely so that a hoist shows up as an IndexError instead of shipping.
    if (PREMIUM_FEATURE in features
            and _premium_enabled()
            and _series_is_premium(lesson.get("series_id"))):
        try:
            entitled = _is_entitled(user_id)
        except _EntitlementLookupUnavailable:
            # FAIL CLOSED — but to a 403, never a 500. A 403 renders the paywall, which
            # the user can act on; a 500 renders "Couldn't load this video", a dead end.
            # A deliberate local exception to the fail-open posture everywhere else: it
            # cannot touch old binaries (they never reach this line), and a marked
            # client here has already missed against our own table.
            entitled = False
        if not entitled:
            raise PremiumRequired()

    provider = lesson.get("video_provider") or "supabase"
    if provider != "supabase":
        # Externally-hosted video: video_id is already a playable URL. (No provider
        # besides 'supabase' is used today; this keeps the door open without gating.)
        return {"url": lesson["video_id"], "expires_in": 0}

    signed = supabase.storage.from_("lesson-videos") \
        .create_signed_url(lesson["video_id"], SIGNED_URL_TTL_SECONDS)
    url = signed.get("signedURL") or signed.get("signedUrl")
    if not url:
        raise HTTPException(status_code=500, detail="Could not sign video URL.")
    return {"url": url, "expires_in": SIGNED_URL_TTL_SECONDS}


# ─── Premium subscriptions: routes ────────────────────────────────────────────

@app.get("/config/")
def get_client_config():
    """PUBLIC client bootstrap: the premium kill switch and the force-update floor.

    No bearer token, deliberately — the force-update gate has to work before sign-in,
    and none of these three values is user-specific or sensitive. It is in the `public`
    set of tests/test_auth_security.py for that reason.

    The CLIENT MUST FAIL OPEN if this is unreachable: behave as unrestricted rather than
    bricking. The adoption counters go to the Render log, never into this response."""
    cfg = _app_config()
    return {
        "premium_enabled": cfg.get("premium_enabled", "false").strip().lower() == "true",
        "min_supported_version": cfg.get("min_supported_version", "0.0.0"),
        "update_url": cfg.get("update_url", ""),
    }


@app.get("/me/entitlements/")
def get_my_entitlements(user_id: str = Depends(get_current_user_id)):
    """The CALLER'S OWN subscription state. Server-side truth: the client never asserts
    its entitlement to us, it asks.

    Returns more than premium_active/expires_at because the paywall has to say
    "Current: Intermediate Monthly" and, after a crossgrade, "your new tier starts on
    <expires_at>". Safe to be generous — this route is new, so it has no old clients.

    product_id is REPORTING ONLY. Every tier grants the same entitlement; nothing
    downstream may branch on it."""
    try:
        rows = supabase.table("subscriptions").select(
            "store, product_id, pending_product_id, expires_at, revoked_at, auto_renew, status"
        ).eq("user_id", user_id).execute().data
    except Exception as e:
        print(f"entitlements read failed for {user_id}: {e}")
        rows = []

    now = datetime.datetime.now(datetime.timezone.utc)
    live = []
    for row in rows:
        if row.get("revoked_at"):
            continue
        expires = _parse_ts(row.get("expires_at"))
        if expires and expires > now:
            live.append((expires, row))

    if live:
        # Furthest-out subscription wins — a user holding both an App Store and a Play
        # Store row (rare, but possible) should see the one that actually governs access.
        _, row = max(live, key=lambda pair: pair[0])
        return {
            "premium_active": True,
            "expires_at": row.get("expires_at"),
            "product_id": row.get("product_id"),
            "pending_product_id": row.get("pending_product_id"),
            "store": row.get("store"),
            "auto_renew": bool(row.get("auto_renew", True)),
        }

    # No live local row. Ask RevenueCat before answering no: the webhook may simply not
    # have landed yet. This is a status read rather than a gate, so an unreachable
    # RevenueCat answers "false" instead of failing closed the way /playback/ does.
    try:
        fallback_active = _entitlement_via_revenuecat(user_id)
    except _EntitlementLookupUnavailable:
        fallback_active = False

    return {
        "premium_active": fallback_active,
        "expires_at": None,
        "product_id": None,
        "pending_product_id": None,
        "store": None,
        "auto_renew": False,
    }


# Events that grant or restore access. All of them do the same thing: trust
# expiration_at_ms. That is the whole point of driving entitlement off expires_at.
_GRANTING_EVENTS = {
    "INITIAL_PURCHASE", "RENEWAL", "UNCANCELLATION", "SUBSCRIPTION_EXTENDED",
    "REFUND_REVERSED", "NON_RENEWING_PURCHASE", "TEMPORARY_ENTITLEMENT_GRANT",
}


def _is_unique_violation(exc: Exception) -> bool:
    code = getattr(exc, "code", None)
    text = str(exc).lower()
    return code == "23505" or "23505" in text or "duplicate key value" in text


def _as_uuid(value) -> Optional[str]:
    """RevenueCat App User IDs are Supabase user ids because the app calls
    Purchases.logIn(user.id) at sign-in. Anything that isn't a UUID — most often an
    anonymous "$RCAnonymousID:..." from a client that never logged in — has no
    DollarSeeds user to credit."""
    try:
        return str(uuid.UUID(str(value)))
    except (ValueError, AttributeError, TypeError):
        return None


def _apply_subscription_patch(identity: dict, user_id: str, patch: dict,
                              event_id: str, event_at: Optional[str]) -> bool:
    """Write one event's effect. Idempotent, monotonic and race-free.

    The conditional UPDATE is the entire mechanism: `where <identity> and
    (last_event_at is null or last_event_at < :event_at)`. A duplicate delivery (same
    timestamp) and a stale out-of-order delivery (older timestamp) both match ZERO rows,
    atomically. That matters because FastAPI runs these handlers in a threadpool and
    Render runs several workers, so a read-compare-write in Python would let a stale
    event win a race and, say, expire a subscription that had just renewed.

    Returns True if the row was written, False if the event was deliberately dropped."""
    body = dict(patch)
    body["last_event_id"] = event_id
    body["last_event_at"] = event_at
    body["updated_at"] = datetime.datetime.now(datetime.timezone.utc).isoformat()

    def _conditional_update():
        q = supabase.table("subscriptions").update(body)
        for col, val in identity.items():
            q = q.eq(col, val)
        if event_at:
            q = q.or_(f"last_event_at.is.null,last_event_at.lt.{event_at}")
        return q.execute().data

    if _conditional_update():
        _fallback_cache.pop(user_id, None)
        return True

    # Zero rows updated: either no row exists yet, or this event is stale.
    q = supabase.table("subscriptions").select("id")
    for col, val in identity.items():
        q = q.eq(col, val)
    if q.execute().data:
        return False   # stale — correctly dropped

    try:
        supabase.table("subscriptions").insert(
            {**identity, "user_id": user_id, **body}
        ).execute()
    except Exception as e:
        if not _is_unique_violation(e):
            raise
        # Lost an insert race with a concurrent worker. The row exists now, so replay
        # the same conditional update against it — still monotonic, still idempotent.
        _conditional_update()
    _fallback_cache.pop(user_id, None)
    return True


@app.post("/webhooks/revenuecat")
def revenuecat_webhook(payload: dict, authorization: Optional[str] = Header(default=None)):
    """The ONLY writer of `subscriptions`.

    NO TRAILING SLASH, unlike the rest of this file: with redirect_slashes on, the
    slashed form would 307 and we would be betting that RevenueCat re-POSTs to the
    redirect target. The URL configured in their dashboard must match this exactly.

    Sync `def`, like every other handler here, and that is load-bearing: the supabase
    client is blocking, so an `async def` would block the event loop on every DB call.
    Taking the body as a dict rather than a Request is what keeps it sync."""
    # ── Authorization ───────────────────────────────────────────────────────────
    # RevenueCat does NOT sign the body. The Authorization header value configured in
    # their dashboard is the ENTIRE security boundary — do not add anything named
    # "verify_signature" here later, because there is no signature to verify.
    #
    # This must NEVER adopt the JWT_SECRET idiom above (unset -> that path is skipped).
    # An unset secret here would compare "" against "" and accept anonymous writes to
    # the entitlement table over a service-role connection. Unset means refuse everything.
    if not REVENUECAT_WEBHOOK_AUTH:
        raise HTTPException(status_code=503, detail="Webhook receiver is not configured.")
    if not hmac.compare_digest(
        (authorization or "").encode("utf-8"),
        REVENUECAT_WEBHOOK_AUTH.encode("utf-8"),
    ):
        raise HTTPException(status_code=401, detail="Invalid webhook credentials.")

    event = (payload or {}).get("event") or {}
    event_id = event.get("id")
    event_type = (event.get("type") or "").upper()

    # FROM HERE ON, ALMOST EVERYTHING RETURNS 200. A 4xx/5xx makes RevenueCat retry for
    # 72 hours and then alert a human — right for a transient DB fault, wrong for "we
    # looked at this and deliberately ignored it". Only genuine transient failures raise.
    if not event_id:
        print(f"revenuecat webhook: event with no id ({event_type or 'no type'}), ignoring")
        return {"received": True, "applied": False, "reason": "missing_event_id"}

    app_user_id = event.get("app_user_id") or event.get("original_app_user_id")
    store_txn_id = (event.get("original_transaction_id")
                    or event.get("transaction_id")
                    or event.get("original_app_user_id"))

    # Audit log first, but NOT load-bearing: PostgREST gives no cross-table transaction,
    # so a duplicate here never short-circuits the state write. Idempotency lives in the
    # conditional update instead, which means replaying a logged-but-unapplied event is
    # safe — and a crash between the two writes loses nothing.
    duplicate = False
    try:
        supabase.table("subscription_events").insert({
            "event_id": event_id,
            "event_type": event_type,
            "app_user_id": app_user_id,
            "store_txn_id": store_txn_id,
            "payload": payload,
        }).execute()
    except Exception as e:
        duplicate = _is_unique_violation(e)
        if not duplicate:
            print(f"revenuecat webhook: audit write failed for {event_id}: {e}")

    user_id = _as_uuid(app_user_id)
    if user_id is None:
        print(f"revenuecat webhook: {event_type} for non-user {app_user_id!r}, ignoring")
        return {"received": True, "applied": False, "reason": "unknown_user"}

    now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()
    event_at = _ms_to_iso(event.get("event_timestamp_ms"))
    expires_at = _ms_to_iso(event.get("expiration_at_ms"))

    if event_type in _GRANTING_EVENTS:
        patch = {
            "expires_at": expires_at,
            "revoked_at": None,
            "auto_renew": True,
            "cancelled_at": None,
            "status": "active",
        }
        if event.get("product_id"):
            # A renewal is the ONLY thing that promotes a pending crossgrade: the
            # event's own product_id is by definition the one now in force, so taking
            # it verbatim is self-correcting even if we mis-recorded the pending value.
            patch["product_id"] = event["product_id"]
            patch["pending_product_id"] = None

    elif event_type == "CANCELLATION":
        # Cancelling is NOT losing access — the user paid for the period and keeps it
        # until expires_at. Only a refund revokes immediately, and RevenueCat delivers
        # that as a CANCELLATION too, distinguished solely by cancel_reason.
        #
        # CUSTOMER_SUPPORT only. UNKNOWN is Apple declining to give a reason, and
        # treating it as a refund would cut off paying users who merely turned off
        # auto-renew. A genuine refund also self-corrects: the EXPIRATION that follows
        # carries expiration_at_ms at the refund moment, and expires_at is what governs.
        patch = {"auto_renew": False, "cancelled_at": now_iso, "status": "cancelled"}
        if (event.get("cancel_reason") or "").upper() == "CUSTOMER_SUPPORT":
            patch["revoked_at"] = now_iso
            patch["status"] = "refunded"
        if expires_at:
            patch["expires_at"] = expires_at

    elif event_type == "EXPIRATION":
        patch = {"expires_at": expires_at or now_iso, "status": "expired",
                 "pending_product_id": None}

    elif event_type == "BILLING_ISSUE":
        # Access is untouched: Apple retries for ~16 days and extends expires_at while
        # it does, and that extension arrives as its own event.
        patch = {"status": "in_grace_period"}
        if expires_at:
            patch["expires_at"] = expires_at

    elif event_type == "PRODUCT_CHANGE":
        # PENDING, not applied. Every product sits at Level 1 in one subscription group,
        # so every switch is a crossgrade that takes effect at the NEXT RENEWAL — never
        # prorated, never immediate. product_id therefore must not move here, and
        # entitlement must not wobble. A change naming the current product means the
        # user reverted a pending switch, so clear it.
        new_product = event.get("new_product_id")
        patch = {"pending_product_id":
                 None if (not new_product or new_product == event.get("product_id"))
                 else new_product}

    elif event_type == "SUBSCRIPTION_PAUSED":
        # Play Store only. Without this a paused Android user keeps access to the old
        # expires_at.
        patch = {"revoked_at": now_iso, "status": "paused"}

    elif event_type == "TRANSFER":
        # The entitlement moved to a different App User ID — the delete-account-then-
        # re-signup and shared-Apple-ID paths. The identity key is (store, environment,
        # store_txn_id) and excludes user_id precisely so the row can be re-pointed
        # rather than duplicated into a unique-constraint violation.
        patch = {"user_id": user_id}

    else:
        # TEST, PAYWALL_*, EXPERIMENT_ENROLLMENT, VIRTUAL_CURRENCY_TRANSACTION,
        # SUBSCRIBER_ALIAS, and anything RevenueCat adds later. Logged, acknowledged,
        # never a 500.
        return {"received": True, "applied": False, "reason": "ignored_event_type",
                "duplicate": duplicate}

    if not store_txn_id:
        print(f"revenuecat webhook: {event_type} with no transaction identity, ignoring")
        return {"received": True, "applied": False, "reason": "no_transaction_identity"}

    identity = {
        "store": (event.get("store") or "APP_STORE").strip().lower(),
        "environment": (event.get("environment") or "PRODUCTION").strip().lower(),
        "store_txn_id": str(store_txn_id),
    }

    try:
        applied = _apply_subscription_patch(identity, user_id, patch, event_id, event_at)
    except Exception as e:
        # A genuine transient fault IS worth a retry, so this one does raise.
        print(f"revenuecat webhook: applying {event_type} {event_id} failed: {e}")
        raise HTTPException(status_code=503, detail="Could not record the event.")

    return {"received": True, "applied": applied, "duplicate": duplicate,
            **({} if applied else {"reason": "stale_event"})}
