"""Goals v2 — the monthly-habit rules for savings goals, as pure functions.

main.py loads the rows and persists what these say; tests/test_goals_v2.py drives
them with plain dicts and a fixed `today`. Nothing here touches Supabase.

Months are counted on one integer line, `year * 12 + (month - 1)`, so "the month
after December 2026" is plain arithmetic and never a special case.

THE MINIMUM (stored on the goal; GOALS_REWORK.md section 2)

    months left = current month → target month, INCLUSIVE, minimum 1
                  (from NEXT month when this month's minimum is already logged)
    minimum     = ceil((target − saved) / months left), whole dollars

It is computed at creation and when the target amount or date is edited — never
because of a payment, a skipped month, or "on pace for" moving.

ON PACE FOR (computed; section 3)

    months needed = ceil(remaining / minimum)
    on pace for   = start month + months needed − 1
                    (start = this month, or next month when this month's minimum
                     is already logged)

An extra payment shrinks `remaining`, so the date moves earlier; a skipped month
moves the start without shrinking it, so the date moves later. The target date the
user chose is never touched.

WHICH ROW IS "THIS MONTH'S MINIMUM"

`savings_transactions.month` has no year, so a month name alone would match last
October's minimum this October. A row is this month's when its `month` names the
current month AND its `created_at` falls within that calendar month, give or take
a day (created_at is stamped in UTC; the phone's local month can be a day either
side of it at the edges).
"""

from __future__ import annotations

import datetime
from typing import Optional

from debt_freedom import _date, _num

MONTHS = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
]

KIND_MINIMUM = "minimum"
KIND_REPLANT_SEED = "replant_seed"
KIND_REPLANT_RETURN = "replant_return"

# How many months after the current one the form's default target lands on: the
# current month plus 3 more make 4 payments (October → January).
DEFAULT_TARGET_OFFSET = 3

_CENT = 0.005


def month_index(year: int, month: int) -> int:
    """`month` is 1–12."""
    return year * 12 + (month - 1)


def today_index(today: datetime.date) -> int:
    return month_index(today.year, today.month)


def index_to_month(index: int) -> tuple[str, int]:
    """(canonical month name, year)."""
    return MONTHS[index % 12], index // 12


def target_index(goal: dict) -> Optional[int]:
    """The goal's target month on the integer line; None without a usable date."""
    name, year = goal.get("target_month"), goal.get("target_year")
    if name not in MONTHS or year is None:
        return None
    try:
        return month_index(int(year), MONTHS.index(name) + 1)
    except (TypeError, ValueError):
        return None


def default_target(today: datetime.date) -> tuple[str, int]:
    """The form's default target: 3 months after the current one."""
    return index_to_month(today_index(today) + DEFAULT_TARGET_OFFSET)


def target_before_this_month(target_month: Optional[str], target_year: Optional[int],
                             today: datetime.date) -> bool:
    idx = target_index({"target_month": target_month, "target_year": target_year})
    return idx is not None and idx < today_index(today)


def _cents(amount) -> int:
    return int(round(_num(amount) * 100))


def months_left(today: datetime.date, target_idx: int, logged_this_month: bool) -> int:
    start = today_index(today) + (1 if logged_this_month else 0)
    return max(1, target_idx - start + 1)


def monthly_minimum(target_amount, saved, today: datetime.date, target_idx: Optional[int],
                    logged_this_month: bool = False) -> Optional[int]:
    """Whole-dollar minimum, or None when the goal has no target date. 0 once the
    goal holds its target (it is ready to complete)."""
    if target_idx is None:
        return None
    remaining = _cents(target_amount) - _cents(saved)
    if remaining <= 0:
        return 0
    per_month = months_left(today, target_idx, logged_this_month) * 100
    return -(-remaining // per_month)   # ceil, in integers: no float edge at x.00


def is_this_month(row: dict, today: datetime.date) -> bool:
    """Is this savings row booked to TODAY's month (month name and year)?"""
    if row.get("month") != MONTHS[today.month - 1]:
        return False
    stamped = _date(row.get("created_at"))
    if stamped is None:
        return False
    first = datetime.date(today.year, today.month, 1)
    nxt = datetime.date(today.year + (today.month == 12), today.month % 12 + 1, 1)
    return first - datetime.timedelta(days=1) <= stamped <= nxt


def minimum_row_this_month(goal_rows: list, today: datetime.date) -> Optional[dict]:
    """This month's minimum deposit for one goal (its rows only), or None. Newest
    first if there were ever two."""
    rows = [r for r in goal_rows
            if r.get("kind") == KIND_MINIMUM and r.get("type") == "deposit"
            and is_this_month(r, today)]
    rows.sort(key=lambda r: (str(r.get("created_at") or ""), r.get("id") or 0), reverse=True)
    return rows[0] if rows else None


def balance(goal_rows: list) -> float:
    """Deposits − withdrawals, never below 0 (as _with_allocated)."""
    total = sum(_num(r.get("amount")) * (1 if r.get("type") == "deposit" else -1) for r in goal_rows)
    return max(0.0, round(total, 2))


def on_pace(target_amount, saved, minimum, today: datetime.date, target_idx: Optional[int],
            logged_this_month: bool) -> Optional[dict]:
    """{"month", "year", "months_early"} — months_early > 0 is early, < 0 behind,
    0 on track. None when there is nothing to pace (no target date, no minimum, or
    the goal already holds its target)."""
    if target_idx is None or minimum is None:
        return None
    remaining = _cents(target_amount) - _cents(saved)
    if remaining <= 0 or _num(minimum) <= 0:
        return None
    needed = -(-remaining // _cents(minimum))
    start = today_index(today) + (1 if logged_this_month else 0)
    pace_idx = start + needed - 1
    name, year = index_to_month(pace_idx)
    return {"month": name, "year": year, "months_early": target_idx - pace_idx}


def ready_to_complete(target_amount, saved) -> bool:
    target = _num(target_amount)
    return target > 0 and _num(saved) >= target - _CENT


def takes_minimum(goal: dict) -> bool:
    """Goals the monthly minimum applies to: user savings goals still running. Not
    General Savings, Reconciliation, Ready to Replant, completed goals or retired
    user debt goals."""
    return not (goal.get("is_general") or goal.get("is_reconciliation") or goal.get("is_replant")
                or goal.get("completed") or goal.get("goal_type") == "debt")


def first_of_month(today: datetime.date) -> datetime.date:
    return datetime.date(today.year, today.month, 1)


def auto_minimum_due(goal: dict, today: datetime.date, month_has_income: bool) -> bool:
    """Should this read add the goal's automatic minimum for this month? Only once the
    month has income (so the Goals split is never shown overspent on the 1st, before
    the paycheck is logged), and only if this month has not been handled already —
    which includes the user toggling an auto-added minimum off."""
    if not goal.get("auto_minimum") or not month_has_income or not takes_minimum(goal):
        return False
    if goal.get("locked"):
        return False
    handled = _date(goal.get("auto_minimum_month"))
    return handled is None or handled < first_of_month(today)


def delete_split(goal_rows: list, today: datetime.date) -> dict:
    """What deleting a goal does with its money, for a goals_v2 client.

    This month's budget money (source='income' deposits booked to this month) is
    dropped, refunding the month. Everything else it holds goes to Ready to Replant:
    the net amount, never more than the goal held.

    Returns {"held", "refunded", "to_replant"}."""
    held = balance(goal_rows)
    refunded = round(sum(_num(r.get("amount")) for r in goal_rows
                         if r.get("type") == "deposit" and r.get("source") == "income"
                         and is_this_month(r, today)), 2)
    return {"held": held, "refunded": refunded, "to_replant": max(0.0, round(held - refunded, 2))}


def replant_unwinds(goal_rows: list, replant_rows: list, to_replant: float) -> tuple[list, float]:
    """Ready to Replant → goal transfers to undo when that goal is deleted, so the
    money goes back by deleting the pair rather than by a second deposit (which would
    leave a deletable "moved" entry able to put the money back twice).

    Newest first, and only while they fit inside `to_replant`. Returns (the Replant
    legs to delete, the amount they return)."""
    replant_groups = {r.get("transfer_group") for r in replant_rows
                      if r.get("transfer_group") and r.get("type") == "withdrawal"}
    incoming = [r for r in goal_rows if r.get("type") == "deposit"
                and r.get("transfer_group") in replant_groups]
    incoming.sort(key=lambda r: (str(r.get("created_at") or ""), r.get("id") or 0), reverse=True)
    legs, total = [], 0.0
    for dep in incoming:
        amount = _num(dep.get("amount"))
        if total + amount > to_replant + _CENT:
            continue
        leg = next((r for r in replant_rows if r.get("transfer_group") == dep.get("transfer_group")
                    and r.get("type") == "withdrawal"), None)
        if leg is None:
            continue
        legs.append(leg)
        total = round(total + amount, 2)
    return legs, total
