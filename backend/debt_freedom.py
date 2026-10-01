"""Debt Freedom — the snowball rules, as pure functions.

Nothing here touches Supabase or FastAPI: main.py loads the rows, calls these, and
writes back whatever they say changed. That keeps every rule unit-testable with plain
dicts (tests/test_debt_freedom.py) and keeps the policy decisions in one place.

This feature is deliberately separate from the older debt GOALS on the Goals tab
(savings_goals.goal_type = 'debt'). It reads and writes only `debts`,
`debt_transactions` and `debt_freedom_settings` (migrations 0010, 0011).

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
KIND_LATE_FEE = "late_fee"
KIND_STATEMENT_ADJUSTMENT = "statement_adjustment"
KIND_MINIMUM_REVERSAL = "minimum_reversal"
PAYMENT_KINDS = (KIND_MINIMUM, KIND_EXTRA)

CENT = 0.005

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


def _by_debt(transactions: list) -> dict:
    out: dict = {}
    for t in transactions:
        out.setdefault(t.get("debt_id"), []).append(t)
    return out


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


def computed_step(debt: dict, transactions: list) -> int:
    """The step the numbers alone give, before the never-shrink rule."""
    return MAX_STEP if is_paid_off(debt) else growth_step(debt, has_payment(transactions))


def shown_step(debt: dict, transactions: list) -> int:
    """Plants never shrink: max(computed step, highest step ever reached). A check-in
    or an undo that lowers the percent paid changes the numbers, never the plant."""
    stored = debt.get("highest_step")
    return max(computed_step(debt, transactions), int(stored) if stored is not None else 0)


def highest_step_updates(debts: list, transactions: list) -> dict:
    """{debt id: new highest_step} for every debt whose computed step passed it."""
    by_debt = _by_debt(transactions)
    out = {}
    for d in debts:
        step = computed_step(d, by_debt.get(d["id"], []))
        stored = d.get("highest_step")
        if stored is None or step > int(stored):
            out[d["id"]] = step
    return out


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


# ── cycles ───────────────────────────────────────────────────────────────────
#
# A billing cycle runs from the day after one due date through the next due date,
# inclusive: on the due date it is still the current cycle; the next day a new one
# starts. The first cycle starts on the day the debt was created.

DAY = datetime.timedelta(days=1)


def days_in_month(year: int, month: int) -> int:
    return calendar.monthrange(year, month)[1]


def daily_interest(balance: float, apr, days: int) -> float:
    """balance × APR / 100 / 365 × days — real calendar days, so February and a
    31-day month differ. The one interest formula, shared with simulate()."""
    return max(0.0, balance) * _num(apr) / 100 / 365 * days


def _anchor(debt: dict) -> Optional[datetime.date]:
    """The last day already accounted for: the last processed due date, or (never
    processed) the creation date. Due dates strictly after it are still to close,
    and interest days count from it."""
    return _date(debt.get("interest_checked_through")) or _date(debt.get("created_at"))


def _window_start(debt: dict) -> Optional[datetime.date]:
    """First day whose payments count toward the oldest open cycle. Never processed:
    the day before creation, because created_at is stamped in UTC, which is already
    tomorrow for a US evening, while payments carry the phone's local date."""
    checked = _date(debt.get("interest_checked_through"))
    if checked:
        return checked + DAY
    created = _date(debt.get("created_at"))
    return created - DAY if created else None


def _in(t: dict, start: datetime.date, end: datetime.date) -> bool:
    on = _date(t.get("occurred_on"))
    return on is not None and start <= on <= end


def net_minimum(transactions: list, start: datetime.date, end: datetime.date) -> float:
    """payment_minimum minus minimum_reversal, dated within [start, end]."""
    total = 0.0
    for t in transactions:
        if _in(t, start, end):
            if t.get("kind") == KIND_MINIMUM:
                total += _num(t.get("amount"))
            elif t.get("kind") == KIND_MINIMUM_REVERSAL:
                total -= _num(t.get("amount"))
    return money(total)


def net_paid(transactions: list, start: datetime.date, end: datetime.date) -> float:
    """Every payment in [start, end], net of reversals."""
    extra = sum(_num(t.get("amount")) for t in transactions
                if t.get("kind") == KIND_EXTRA and _in(t, start, end))
    return money(net_minimum(transactions, start, end) + extra)


def current_cycle(debt: dict, today: datetime.date):
    """(start, end, due) of the cycle holding today. A debt with no due day has no
    real cycle; its stand-in is the calendar month (due None), so the toggle still
    resets monthly."""
    due_day = debt.get("due_day")
    if not due_day:
        start = datetime.date(today.year, today.month, 1)
        end = datetime.date(today.year, today.month, days_in_month(today.year, today.month))
        return start, end, None
    due = next_due_date(due_day, today)
    prev_month = add_months(due, -1)
    start = due_date_in(prev_month.year, prev_month.month, due_day) + DAY
    first = _window_start(debt)
    if first is not None and first > start:
        start = first
    return start, due, due


def min_logged_this_cycle(debt: dict, transactions: list, today: datetime.date) -> bool:
    return minimum_to_undo(debt, transactions, today) is not None


def minimum_to_undo(debt: dict, transactions: list, today: datetime.date) -> Optional[float]:
    """The net minimum logged in the current cycle, which an undo reverses; None
    when there is none — including once that cycle's due date has passed."""
    if is_paid_off(debt):
        return None
    start, end, _ = current_cycle(debt, today)
    amount = net_minimum(transactions, start, end)
    return amount if amount > CENT else None


def due_dates_to_process(debt: dict, today: datetime.date) -> list:
    """Every due date after the anchor and strictly before today, in order. A due
    date is processed the day after it, so a minimum logged on the due date itself
    still counts for that cycle."""
    due_day = debt.get("due_day")
    anchor = _anchor(debt)
    if not due_day or anchor is None or is_paid_off(debt):
        return []
    out = []
    cursor = datetime.date(anchor.year, anchor.month, 1)
    while True:
        due = due_date_in(cursor.year, cursor.month, due_day)
        if due >= today:
            return out
        if due > anchor:
            out.append(due)
        cursor = add_months(cursor, 1)


def process_due_dates(debt: dict, transactions: list, today: datetime.date) -> Optional[dict]:
    """Close every billing cycle whose due date has passed. POLICY — every part of it
    lives here so it can change in one place.

    For each due date, in order (catch-up processes all of them in one call):
      1. Full payment: the cycle's net payments are at least the statement balance
         (cycle_start_balance) → no fee, no interest.
      2. Minimum: net payment_minimum below min_payment → a `late_fee` row when the
         debt has a late_fee above 0; when late_fee is unset, late_fee_pending_for is
         set to the due date so the app can ask. (late_fee = 0 means "no fee".)
      3. Interest: one `interest` row, balance × APR / 100 / 365 × days since the
         previous due date (since creation for the first cycle), on the balance after
         the cycle's payments and fee.
      4. Close: cycle_start_balance = the new balance, checkin_due_since = this due
         date, interest_checked_through advances to it.

    Debts without a due_day, and paid-off debts, are skipped. When cycle_start_balance
    is NULL (a debt from before v2) the first statement is rebuilt as current_balance
    plus the cycle's net payments: the balance before those payments.

    Returns None when no due date has passed, else
    {"transactions": [{kind, amount, balance_after, occurred_on}], "patch": {...}}.
    """
    dues = due_dates_to_process(debt, today)
    if not dues:
        return None

    balance = money(debt.get("current_balance"))
    apr = debt.get("apr")
    fee = debt.get("late_fee")
    fee = None if fee is None else _num(fee)
    statement = debt.get("cycle_start_balance")
    statement = None if statement is None else _num(statement)
    minimum = _num(debt.get("min_payment"))
    pending_for = debt.get("late_fee_pending_for")

    # Day counts run from the previous due date; the first cycle's from creation.
    prev = _anchor(debt)
    start = _window_start(debt)
    rows = []

    def add(kind: str, amount: float, on: datetime.date):
        nonlocal balance
        balance = money(balance + amount)
        rows.append({"kind": kind, "amount": money(amount), "balance_after": balance,
                     "occurred_on": on.isoformat()})

    for due in dues:
        paid = net_paid(transactions, start, due)
        if statement is None:
            statement = money(balance + paid)
        if paid < statement - CENT:
            if net_minimum(transactions, start, due) < min(minimum, statement) - CENT:
                if fee is None:
                    pending_for = due.isoformat()
                elif fee > 0:
                    add(KIND_LATE_FEE, fee, due)
            interest = money(daily_interest(balance, apr, max(0, (due - prev).days)))
            if interest > 0:
                add(KIND_INTEREST, interest, due)
        statement = balance
        start, prev = due + DAY, due

    last = dues[-1].isoformat()
    patch = {
        "current_balance": balance,
        "cycle_start_balance": balance,
        "checkin_due_since": last,
        "interest_checked_through": last,
    }
    if pending_for != debt.get("late_fee_pending_for"):
        patch["late_fee_pending_for"] = pending_for
    return {"transactions": rows, "patch": patch}


def anchor_for_new_due_day(debt: dict, due_day: int, today: datetime.date) -> Optional[str]:
    """interest_checked_through for a debt getting its FIRST due day (one from before
    v2). Without it the catch-up would charge every cycle since the debt was created —
    months the user never tracked. The current cycle starts after the last due date
    instead, or at creation when that is later (None: anchor on created_at)."""
    due = next_due_date(due_day, today)
    prev_month = add_months(due, -1)
    prev = due_date_in(prev_month.year, prev_month.month, due_day)
    created = _date(debt.get("created_at"))
    if created and created > prev:
        return None
    return prev.isoformat()


def statement_checkin(debt: dict, statement_balance: float, min_payment: float) -> dict:
    """The statement is the truth. Returns {"adjustment": signed amount or None,
    "patch": {...}}; a changed balance moves current_balance and cycle_start_balance
    to the statement's. Either way min_payment updates and the check-in clears."""
    statement_balance = money(statement_balance)
    old = money(debt.get("current_balance"))
    patch = {"min_payment": money(min_payment), "checkin_due_since": None}
    adjustment = None
    if abs(statement_balance - old) > CENT:
        adjustment = money(statement_balance - old)
        patch["current_balance"] = statement_balance
        patch["cycle_start_balance"] = statement_balance
    return {"adjustment": adjustment, "patch": patch}


# ── payoff simulation ────────────────────────────────────────────────────────

def simulate(ordered: list, today: datetime.date, monthly_extra: float = 0.0) -> dict:
    """Month-by-month snowball projection.

    Each month: every unpaid debt accrues a month of interest with the formula the
    due-date check uses (daily APR × that month's real days); each non-focus debt
    gets its minimum; the focus debt gets everything else in the monthly budget —
    the sum of every debt's minimum (so a paid-off debt's minimum keeps working) plus
    the user's `monthly_extra`. Money left over once a debt hits 0 rolls straight into
    the next one that month.

    Month 1 is next calendar month. A debt's projection is None when the plan
    stalls (the focus debt's payment does not exceed its interest) before it is
    paid, or when it is not paid within 600 months.

    Returns {"months": {id: "YYYY-MM"|None}, "interest": {id: float|None},
             "plan": "YYYY-MM"|None}.
    """
    months: dict = {}
    interest: dict = {}
    budget = sum(_num(d.get("min_payment")) for d in ordered) + max(0.0, _num(monthly_extra))

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

    mins = {d["id"]: _num(d.get("min_payment")) for d in queue}

    month = 0
    while queue and month < MAX_SIMULATION_MONTHS:
        month += 1
        first = add_months(today, month)
        days = days_in_month(first.year, first.month)
        accrued = {}
        for d in queue:
            accrued[d["id"]] = daily_interest(balances[d["id"]], d.get("apr"), days)
            balances[d["id"]] += accrued[d["id"]]
            interest[d["id"]] += accrued[d["id"]]

        focus, others = queue[0], queue[1:]
        pool = budget
        for d in others:
            pay = min(mins[d["id"]], balances[d["id"]])
            balances[d["id"]] -= pay
            pool -= pay
        if pool <= accrued[focus["id"]] + 1e-9 and pool < balances[focus["id"]]:
            break  # stalled: the snowball can never shrink the focus debt

        for d in queue:
            if pool <= 0:
                break
            pay = min(pool, balances[d["id"]])
            balances[d["id"]] -= pay
            pool -= pay

        label = month_key(first)
        still = []
        for d in queue:
            if balances[d["id"]] <= CENT:
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


# ── the garden response ──────────────────────────────────────────────────────

def decorate_garden(debts: list, transactions: list, today: datetime.date,
                    monthly_extra: Optional[float] = None) -> dict:
    """Every computed field the client renders. The client computes nothing."""
    by_debt = _by_debt(transactions)

    ordered = order_debts(debts)
    total = len(ordered)
    focus = focus_debt(ordered)
    suggested = suggested_payments(ordered)
    sim = simulate(ordered, today, _num(monthly_extra))
    active_ids = [d["id"] for d in ordered if not is_paid_off(d)]

    out = []
    paid_so_far = 0
    for i, d in enumerate(ordered):
        paid_off = is_paid_off(d)
        if paid_off:
            paid_so_far += 1
        txns = by_debt.get(d["id"], [])
        due = next_due_date(d.get("due_day"), today) if not paid_off else None
        rolls_into = None
        if not paid_off and d["id"] in active_ids:
            k = active_ids.index(d["id"])
            rolls_into = active_ids[k + 1] if k + 1 < len(active_ids) else None
        out.append({
            **d,
            "position": i + 1,
            "total": total,
            "is_focus": focus is d,
            "growth_step": shown_step(d, txns),
            "computed_step": computed_step(d, txns),
            "highest_step": d.get("highest_step"),
            "pct_paid": round(pct_paid(d), 4),
            "ready_to_complete": ready_to_complete(d),
            "next_due_date": due.isoformat() if due else None,
            # The due date that closes the cycle the toggle belongs to (= next_due_date).
            "current_cycle_due_date": due.isoformat() if due else None,
            "min_logged_this_cycle": min_logged_this_cycle(d, txns, today),
            "checkin_due_since": None if paid_off else d.get("checkin_due_since"),
            "late_fee_pending_for": None if paid_off else d.get("late_fee_pending_for"),
            "late_fee": d.get("late_fee"),
            "suggested_payment": suggested.get(d["id"], 0.0),
            "est_payoff_month": sim["months"].get(d["id"]),
            "paid_off_count_through_here": paid_so_far,
            "missing": [f for f in LABEL_OPTIONAL_FIELDS if d.get(f) in (None, "")],
            "monthly_interest": 0.0 if paid_off else money(
                _num(d.get("current_balance")) * _num(d.get("apr")) / 100 / 12),
            "interest_remaining": sim["interest"].get(d["id"]),
            "rolls_into_id": rolls_into,
        })
    return {
        "debts": out,
        "focus_id": focus["id"] if focus else None,
        "plan_est_payoff_month": sim["plan"],
        "monthly_extra": money(monthly_extra) if monthly_extra is not None else None,
    }


# ── the home summary ─────────────────────────────────────────────────────────
#
# GET /home/summary/ shows a few debt facts on the home screen. They are read off
# the SAME decorated garden the Debts tab renders (decorate_garden above), so the
# two screens can never disagree; these functions only pick from it.

DUE_SOON_DAYS = 7


def _effect(t: dict) -> float:
    """How a transaction moved the balance: payments lower it, everything else
    (interest, fees, edits, adjustments, reversals) is stored as the signed rise."""
    amount = _num(t.get("amount"))
    return -amount if t.get("kind") in PAYMENT_KINDS else amount


def balance_at(debt: dict, transactions: list, day: datetime.date) -> float:
    """The balance at the start of `day`: the last transaction dated before it, or
    (none) the balance before the debt's first transaction, or (no history at all)
    the current balance."""
    dated = sorted((t for t in transactions if _date(t.get("occurred_on")) is not None),
                   key=lambda t: (_date(t.get("occurred_on")), t.get("id") or 0))
    before = [t for t in dated if _date(t.get("occurred_on")) < day]
    if before:
        return money(before[-1].get("balance_after"))
    if dated:
        first = dated[0]
        return money(_num(first.get("balance_after")) - _effect(first))
    return money(debt.get("current_balance"))


def last_passed_due_date(debt: dict, today: datetime.date) -> Optional[datetime.date]:
    """The most recent due date strictly before today that the debt existed for
    (the same due dates process_due_dates closes), else None."""
    due_day = debt.get("due_day")
    if not due_day:
        return None
    due = due_date_in(today.year, today.month, due_day)
    if due >= today:
        prev = add_months(today, -1)
        due = due_date_in(prev.year, prev.month, due_day)
    created = _date(debt.get("created_at"))
    if created is not None and due <= created:
        return None
    return due


def missed_last_minimum(debt: dict, transactions: list, today: datetime.date) -> bool:
    """Did the cycle that closed on the last passed due date fail the late-fee test
    process_due_dates applies? Not paid in full, and a net minimum below
    min(min_payment, statement)."""
    due = last_passed_due_date(debt, today)
    if due is None:
        return False
    prev_month = add_months(due, -1)
    start = due_date_in(prev_month.year, prev_month.month, debt["due_day"]) + DAY
    created = _date(debt.get("created_at"))
    if created is not None and created - DAY > start:
        start = created - DAY
    statement = balance_at(debt, transactions, start)
    if statement <= CENT:
        return False
    if net_paid(transactions, start, due) >= statement - CENT:
        return False
    return net_minimum(transactions, start, due) < min(_num(debt.get("min_payment")), statement) - CENT


def is_overdue(debt: dict, transactions: list, today: datetime.date) -> bool:
    """An active debt whose last passed due date closed without its minimum. It stays
    overdue until a minimum is logged in the current cycle."""
    if is_paid_off(debt):
        return False
    if min_logged_this_cycle(debt, transactions, today):
        return False
    return missed_last_minimum(debt, transactions, today)


def is_due_soon(debt: dict, transactions: list, today: datetime.date) -> bool:
    """Active, not overdue, next due date within DUE_SOON_DAYS of today (inclusive),
    and no minimum logged for it yet."""
    if is_paid_off(debt):
        return False
    due = next_due_date(debt.get("due_day"), today)
    if due is None or (due - today).days > DUE_SOON_DAYS:
        return False
    if min_logged_this_cycle(debt, transactions, today):
        return False
    return not is_overdue(debt, transactions, today)


def focus_extra(debt: dict, monthly_extra: Optional[float]) -> float:
    """What the focus debt gets on top of its own minimum this month: the rollover
    (suggested − minimum) plus the user's monthly extra. 0 for every other debt."""
    if not debt.get("is_focus"):
        return 0.0
    rollover = _num(debt.get("suggested_payment")) - _num(debt.get("min_payment"))
    return money(max(0.0, rollover) + max(0.0, _num(monthly_extra)))


def next_payment(garden_debts: list) -> Optional[dict]:
    """The active debt with the nearest next_due_date; on a shared date the focus
    debt first, then garden order. None when no active debt has a due date."""
    candidates = [(i, d) for i, d in enumerate(garden_debts)
                  if not is_paid_off(d) and d.get("next_due_date")]
    if not candidates:
        return None
    _, d = min(candidates, key=lambda c: (c[1]["next_due_date"], not c[1].get("is_focus"), c[0]))
    return d


def home_debt_summary(garden: dict, transactions: list, today: datetime.date) -> Optional[dict]:
    """The home screen's debt block, from a decorate_garden() result. None when the
    user has no debts at all."""
    debts = garden.get("debts") or []
    if not debts:
        return None
    by_debt = _by_debt(transactions)
    monthly_extra = garden.get("monthly_extra")
    active = [d for d in debts if not is_paid_off(d)]

    nxt = next_payment(debts)
    focus = next((d for d in debts if d.get("is_focus")), None)
    # Every due-soon debt, nearest first (garden order on a tie). The next payment is
    # included when it is due soon; the home leaves it out of its list itself.
    due_soon = sorted(
        ((i, d) for i, d in enumerate(active) if is_due_soon(d, by_debt.get(d["id"], []), today)),
        key=lambda c: (c[1]["next_due_date"], c[0]),
    )
    # Every overdue debt, longest overdue first (garden order on a tie). The missed
    # due date is the one missed_last_minimum tested: last_passed_due_date.
    overdue = []
    for i, d in enumerate(active):
        if not is_overdue(d, by_debt.get(d["id"], []), today):
            continue
        missed = last_passed_due_date(d, today)
        overdue.append((i, d, missed))
    overdue.sort(key=lambda c: (-(today - c[2]).days, c[0]))
    next_month = month_key(add_months(today, 1))
    almost = next((d for d in active if d.get("est_payoff_month") == next_month), None)

    return {
        "paid_count": len(debts) - len(active),
        "total_count": len(debts),
        "overdue_count": len(overdue),
        "overdue": [{
            "id": d["id"],
            "name": d.get("name"),
            "min_payment": money(d.get("min_payment")),
            "missed_due_date": missed.isoformat(),
            "days_overdue": (today - missed).days,
            "pay_url": d.get("pay_url") or None,
        } for _, d, missed in overdue],
        "due_soon_count": len(due_soon),
        "due_soon": [{
            "id": d["id"],
            "name": d.get("name"),
            "due_date": d["next_due_date"],
            "min_payment": money(d.get("min_payment")),
        } for _, d in due_soon],
        "next_payment": None if nxt is None else {
            "id": nxt["id"],
            "name": nxt.get("name"),
            "due_date": nxt["next_due_date"],
            "min_payment": money(nxt.get("min_payment")),
            "focus_extra": focus_extra(nxt, monthly_extra),
            "is_focus": bool(nxt.get("is_focus")),
        },
        # The whole decorated debt, so the home can draw the same plant and pot
        # label the Debts tab does. Its first keys are the documented summary ones.
        "focus": None if focus is None else {
            "id": focus["id"],
            "name": focus.get("name"),
            "species": focus.get("species"),
            "growth_step": focus.get("growth_step"),
            "pct_paid": focus.get("pct_paid"),
            "focus_extra": focus_extra(focus, monthly_extra),
            "debt": focus,
        },
        "plan_est_payoff_month": garden.get("plan_est_payoff_month"),
        "almost_free": None if almost is None else {
            "id": almost["id"],
            "name": almost.get("name"),
            "est_payoff_month": almost["est_payoff_month"],
        },
    }
