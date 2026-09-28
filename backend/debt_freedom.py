"""Debt Freedom — the snowball rules, as pure functions.

Nothing here touches Supabase or FastAPI: main.py loads the rows, calls these, and
writes back whatever they say changed. That keeps every rule unit-testable with plain
dicts (tests/test_debt_freedom.py) and keeps the policy decisions in one place.

This feature is deliberately separate from the older debt GOALS on the Goals tab
(savings_goals.goal_type = 'debt'). It reads and writes only `debts` and
`debt_transactions` (migration 0010).

Rows are the dicts PostgREST returns. Money columns are `numeric`, which can arrive
as a number or a string, so everything goes through _num().
"""

from __future__ import annotations

import calendar
import datetime
import math
from typing import Optional

SPECIES_COUNT = 4
DEFAULT_SPECIES = 4          # every debt while the garden has fewer than 4
MAX_STEP = 10
MAX_SIMULATION_MONTHS = 600

STATUS_ACTIVE = "active"
STATUS_PAID_OFF = "paid_off"

KIND_MINIMUM = "payment_minimum"
KIND_EXTRA = "payment_extra"
KIND_INTEREST = "interest"
KIND_BALANCE_EDIT = "balance_edit"
PAYMENT_KINDS = (KIND_MINIMUM, KIND_EXTRA)

# Canonical English, stored as-is and translated only at render (see i18n.md).
DEBT_TYPES = (
    "credit_card", "student_loan", "medical", "auto",
    "personal", "bnpl", "family", "other",
)

# Optional fields the pot label shows. An unset one is reported in `missing` so the
# client can draw a red "--".
LABEL_OPTIONAL_FIELDS = ("due_day",)


# ── small helpers ────────────────────────────────────────────────────────────

def _num(value) -> float:
    if value is None:
        return 0.0
    try:
        return float(value)
    except (TypeError, ValueError):
        return 0.0


def money(value) -> float:
    return round(_num(value) + 0.0, 2)


def _date(value) -> Optional[datetime.date]:
    """A date from a DATE column, a timestamptz string, or a date/datetime."""
    if value is None:
        return None
    if isinstance(value, datetime.datetime):
        return value.date()
    if isinstance(value, datetime.date):
        return value
    text = str(value)
    try:
        return datetime.date.fromisoformat(text[:10])
    except ValueError:
        return None


def _ts(value) -> str:
    """A sortable key for timestamptz values; missing sorts last."""
    return str(value) if value else "9999"


def month_key(d: datetime.date) -> str:
    return f"{d.year:04d}-{d.month:02d}"


def add_months(d: datetime.date, months: int) -> datetime.date:
    """First of the month `months` after d's month."""
    index = d.year * 12 + (d.month - 1) + months
    return datetime.date(index // 12, index % 12 + 1, 1)


def due_date_in(year: int, month: int, due_day: int) -> datetime.date:
    """The due date in a given month. A due day past the month's end (31 in
    February) lands on its last day, the way card issuers handle it."""
    last = calendar.monthrange(year, month)[1]
    return datetime.date(year, month, min(int(due_day), last))


def next_due_date(due_day: Optional[int], today: datetime.date) -> Optional[datetime.date]:
    """The next due date on or after today, or None when no due day is set."""
    if not due_day:
        return None
    this_month = due_date_in(today.year, today.month, due_day)
    if this_month >= today:
        return this_month
    nxt = add_months(today, 1)
    return due_date_in(nxt.year, nxt.month, due_day)


def is_paid_off(debt: dict) -> bool:
    return debt.get("status") == STATUS_PAID_OFF


def has_payment(transactions: list) -> bool:
    return any(t.get("kind") in PAYMENT_KINDS for t in transactions)


# ── order ────────────────────────────────────────────────────────────────────

def order_debts(debts: list) -> list:
    """Paid-off debts first, oldest paid_off_at first; then active debts by
    current_balance ascending, ties broken by created_at then id."""
    paid = sorted(
        (d for d in debts if is_paid_off(d)),
        key=lambda d: (_ts(d.get("paid_off_at")), d.get("id") or 0),
    )
    active = sorted(
        (d for d in debts if not is_paid_off(d)),
        key=lambda d: (_num(d.get("current_balance")), _ts(d.get("created_at")), d.get("id") or 0),
    )
    return paid + active


def focus_debt(ordered: list) -> Optional[dict]:
    return next((d for d in ordered if not is_paid_off(d)), None)


# ── species ──────────────────────────────────────────────────────────────────

def species_for(index: int, total: int) -> int:
    """Species for the debt at 0-based `index` of `total`."""
    if total < SPECIES_COUNT:
        return DEFAULT_SPECIES
    return math.floor(index * SPECIES_COUNT / total) + 1


def species_updates(debts: list) -> dict:
    """{debt id: new species} for every UNLOCKED debt whose species should change.
    Locked debts (at least one payment logged) keep theirs forever."""
    ordered = order_debts(debts)
    total = len(ordered)
    changes = {}
    for i, d in enumerate(ordered):
        if d.get("species_locked"):
            continue
        want = species_for(i, total)
        if d.get("species") != want:
            changes[d["id"]] = want
    return changes


# ── growth ───────────────────────────────────────────────────────────────────

def pct_paid(debt: dict) -> float:
    original = _num(debt.get("original_balance"))
    if original <= 0:
        return 1.0 if _num(debt.get("current_balance")) <= 0 else 0.0
    pct = (original - _num(debt.get("current_balance"))) / original
    return max(0.0, min(1.0, pct))


def growth_step(debt: dict, paid_something: bool) -> int:
    """0 = seed (no payment yet), 1 = under 10%, then one step per 10% up to 10."""
    if not paid_something:
        return 0
    pct = pct_paid(debt)
    if pct < 0.10:
        return 1
    return min(MAX_STEP, math.floor(pct * 10 + 1e-9) + 1)


def ready_to_complete(debt: dict) -> bool:
    return not is_paid_off(debt) and _num(debt.get("current_balance")) <= 0


# ── rollover ─────────────────────────────────────────────────────────────────

def suggested_payments(ordered: list) -> dict:
    """{id: suggested monthly payment}. The focus debt takes its own minimum plus
    the minimum of every paid-off debt; every other active debt, its own minimum."""
    freed = sum(_num(d.get("min_payment")) for d in ordered if is_paid_off(d))
    focus = focus_debt(ordered)
    out = {}
    for d in ordered:
        if is_paid_off(d):
            continue
        own = _num(d.get("min_payment"))
        out[d["id"]] = money(own + freed) if focus is d else money(own)
    return out


# ── payoff simulation ────────────────────────────────────────────────────────

def simulate(ordered: list, today: datetime.date) -> dict:
    """Month-by-month snowball projection.

    Each month: every unpaid debt accrues balance * apr / 100 / 12; each non-focus
    debt gets its minimum; the focus debt gets everything else in the monthly budget
    (the sum of every debt's minimum, so a paid-off debt's minimum keeps working).
    Money left over once a debt hits 0 rolls straight into the next one that month.

    Month 1 is next calendar month. A debt's projection is None when the plan
    stalls (the focus debt's payment does not exceed its interest) before it is
    paid, or when it is not paid within 600 months.

    Returns {"months": {id: "YYYY-MM"|None}, "interest": {id: float|None},
             "plan": "YYYY-MM"|None}.
    """
    months: dict = {}
    interest: dict = {}
    budget = sum(_num(d.get("min_payment")) for d in ordered)

    queue = []
    balances: dict = {}
    for d in ordered:
        if is_paid_off(d):
            paid_on = _date(d.get("paid_off_at"))
            months[d["id"]] = month_key(paid_on) if paid_on else None
            interest[d["id"]] = 0.0
            continue
        balances[d["id"]] = _num(d.get("current_balance"))
        interest[d["id"]] = 0.0
        if balances[d["id"]] <= 0:
            months[d["id"]] = month_key(today)
        else:
            queue.append(d)

    rates = {d["id"]: _num(d.get("apr")) / 100 / 12 for d in queue}
    mins = {d["id"]: _num(d.get("min_payment")) for d in queue}

    month = 0
    while queue and month < MAX_SIMULATION_MONTHS:
        month += 1
        for d in queue:
            accrued = balances[d["id"]] * rates[d["id"]]
            balances[d["id"]] += accrued
            interest[d["id"]] += accrued

        focus, others = queue[0], queue[1:]
        pool = budget
        for d in others:
            pay = min(mins[d["id"]], balances[d["id"]])
            balances[d["id"]] -= pay
            pool -= pay
        focus_interest = balances[focus["id"]] - balances[focus["id"]] / (1 + rates[focus["id"]])
        if pool <= focus_interest + 1e-9 and pool < balances[focus["id"]]:
            break  # stalled: the snowball can never shrink the focus debt

        for d in queue:
            if pool <= 0:
                break
            pay = min(pool, balances[d["id"]])
            balances[d["id"]] -= pay
            pool -= pay

        label = month_key(add_months(today, month))
        still = []
        for d in queue:
            if balances[d["id"]] <= 0.005:
                months[d["id"]] = label
            else:
                still.append(d)
        queue = still

    for d in queue:
        months[d["id"]] = None
        interest[d["id"]] = None

    active_months = [months[d["id"]] for d in ordered if not is_paid_off(d)]
    if not active_months or any(m is None for m in active_months):
        plan = None
    else:
        plan = max(active_months)
    return {
        "months": months,
        "interest": {k: (None if v is None else money(v)) for k, v in interest.items()},
        "plan": plan,
    }


# ── missed payment (the owner's rule) ────────────────────────────────────────

def missed_payment_charges(debt: dict, transactions: list, today: datetime.date):
    """Interest to add for billing cycles whose due date passed with no minimum paid.

    POLICY — keep every part of it in this function so it can change in one place.
      * Only active debts with a due_day and a balance above 0.
      * Considers each due date strictly after `interest_checked_through` (or after
        the debt's creation date when never checked) and strictly before today.
      * A cycle is the span (previous due date, this due date]. It is "paid" when it
        holds a payment_minimum transaction.
      * An unpaid cycle adds one month of interest at the debt's APR on the balance
        at check time, compounding across consecutive missed cycles.

    Returns (charges, checked_through). `charges` is a list of
    {"occurred_on": date, "amount": float, "balance_after": float}; checked_through
    is the last due date examined, or None when none was due.
    """
    due_day = debt.get("due_day")
    if not due_day or is_paid_off(debt):
        return [], None

    anchor = _date(debt.get("interest_checked_through")) or _date(debt.get("created_at"))
    if anchor is None:
        return [], None

    paid_on = sorted(
        d for d in (_date(t.get("occurred_on")) for t in transactions
                    if t.get("kind") == KIND_MINIMUM) if d
    )

    balance = _num(debt.get("current_balance"))
    rate = _num(debt.get("apr")) / 100 / 12
    charges = []
    checked = None

    cursor = datetime.date(anchor.year, anchor.month, 1)
    while True:
        due = due_date_in(cursor.year, cursor.month, due_day)
        if due >= today:
            break
        if due > anchor:
            prev_month = add_months(due, -1)
            prev_due = due_date_in(prev_month.year, prev_month.month, due_day)
            paid = any(prev_due < p <= due for p in paid_on)
            if not paid and balance > 0:
                amount = money(balance * rate)
                if amount > 0:
                    balance = money(balance + amount)
                    charges.append({"occurred_on": due, "amount": amount, "balance_after": balance})
            checked = due
        cursor = add_months(cursor, 1)
    return charges, checked


# ── the garden response ──────────────────────────────────────────────────────

def decorate_garden(debts: list, transactions: list, today: datetime.date) -> dict:
    """Every computed field the client renders. The client computes nothing."""
    by_debt: dict = {}
    for t in transactions:
        by_debt.setdefault(t.get("debt_id"), []).append(t)

    ordered = order_debts(debts)
    total = len(ordered)
    focus = focus_debt(ordered)
    suggested = suggested_payments(ordered)
    sim = simulate(ordered, today)
    active_ids = [d["id"] for d in ordered if not is_paid_off(d)]

    out = []
    paid_so_far = 0
    for i, d in enumerate(ordered):
        if is_paid_off(d):
            paid_so_far += 1
        txns = by_debt.get(d["id"], [])
        due = next_due_date(d.get("due_day"), today) if not is_paid_off(d) else None
        rolls_into = None
        if not is_paid_off(d) and d["id"] in active_ids:
            k = active_ids.index(d["id"])
            rolls_into = active_ids[k + 1] if k + 1 < len(active_ids) else None
        out.append({
            **d,
            "position": i + 1,
            "total": total,
            "is_focus": focus is d,
            "growth_step": MAX_STEP if is_paid_off(d) else growth_step(d, has_payment(txns)),
            "pct_paid": round(pct_paid(d), 4),
            "ready_to_complete": ready_to_complete(d),
            "next_due_date": due.isoformat() if due else None,
            "suggested_payment": suggested.get(d["id"], 0.0),
            "est_payoff_month": sim["months"].get(d["id"]),
            "paid_off_count_through_here": paid_so_far,
            "missing": [f for f in LABEL_OPTIONAL_FIELDS if d.get(f) in (None, "")],
            "monthly_interest": 0.0 if is_paid_off(d) else money(
                _num(d.get("current_balance")) * _num(d.get("apr")) / 100 / 12),
            "interest_remaining": sim["interest"].get(d["id"]),
            "rolls_into_id": rolls_into,
        })
    return {
        "debts": out,
        "focus_id": focus["id"] if focus else None,
        "plan_est_payoff_month": sim["plan"],
    }
