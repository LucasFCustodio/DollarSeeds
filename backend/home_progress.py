"""Home progress — the goals half of GET /home/progress/, as pure functions.

The debt half (pots, money paid toward debt, payoff milestones) lives in
debt_freedom.py with the other snowball rules; the monthly series helper is shared
from there. Nothing here touches Supabase: main.py loads the rows and calls these,
and tests/test_home_progress.py drives them with plain dicts and a fixed `today`.

THE NUMBER IS "ACHIEVED BY SAVING", NOT "CURRENTLY IN SAVINGS".

    total = Σ completed goals' completed amounts
          + Σ what in-progress goals hold, General Savings included

Finishing a goal withdraws its whole balance (finish_savings_goal), which would drop
a "currently saved" line exactly when the user hits a goal. Here that withdrawal is
replaced by the goal's completed amount, so completing a goal leaves the total level.
A real withdrawal from an in-progress goal or from General Savings still lowers it,
and a transfer between goals nets to zero because both legs count.

Every transaction is dated by `created_at`; the `month` column has no year.

Two kinds of row never count:
  - the Reconciliation goal's: its rows book an overspent month as a debt to
    yourself and repay it, which is neither saving nor spending savings;
  - a completed goal's completion withdrawal, and anything after it.
Rows with no goal_id (pre-goals legacy) DO count: they are part of the savings
balance the Goals tab shows.

GOALS V2 (a client sending `goals_v2`; GOALS_REWORK.md section 5c). The new app shows
no General Savings, so the number there becomes

    total = Σ completed goals' completed amounts + Σ what in-progress listed goals hold

General Savings, Ready to Replant and goal-less legacy rows no longer count. Every
other client keeps the number above.

KEPT UNDER BUDGET (goals_v2 only; section 5b) is the month-end leftovers alone: the
source='rollover' deposits into General Savings. Nothing else that ever went into
General Savings counts — no starting balance, no transfers, no returned money.
"""

from __future__ import annotations

import datetime
from typing import Optional

from debt_freedom import _date, _num, money, monthly_cumulative, amount_in_year, month_key

MONTHS = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
]


def _signed(t: dict) -> float:
    amount = _num(t.get("amount"))
    return amount if t.get("type") == "deposit" else -amount


def _tx_date(t: dict, fallback: datetime.date) -> datetime.date:
    return _date(t.get("created_at")) or fallback


def _ordered(rows: list) -> list:
    return sorted(rows, key=lambda t: (str(t.get("created_at") or "9999"), t.get("id") or 0))


def is_listed_goal(goal: dict) -> bool:
    """A goal the Goals tab lists in Active or Completed: not General Savings, not
    the auto-managed Reconciliation goal, and not Ready to Replant (a container, never
    listed or counted as a goal — and absent from every user's data before goals_v2,
    so leaving it out changes nothing an old build was ever shown)."""
    return (not goal.get("is_general") and not goal.get("is_reconciliation")
            and not goal.get("is_replant"))


def goal_completion(goal: dict, goal_txns: list, today: datetime.date) -> dict:
    """When a completed goal was completed and for how much, plus which of its
    transactions still count.

    The completion withdrawal is the goal's LAST withdrawal. `held` is what the goal
    held just before it. Pre-0004 goals and goals completed through the legacy
    PATCH …/complete route (where the old app wrote its own withdrawal first) have
    no completed_at / completed_amount, so:
      amount = completed_amount, else `held`
      date   = completed_at, else that withdrawal's created_at, else the goal's
               created_at
    Returns {"date", "amount", "held", "counted"} where `counted` are the rows before
    the completion withdrawal."""
    rows = _ordered(goal_txns)
    last_w = None
    for i, t in enumerate(rows):
        if t.get("type") == "withdrawal":
            last_w = i
    counted = rows if last_w is None else rows[:last_w]
    held = money(sum(_signed(t) for t in counted))

    amount = goal.get("completed_amount")
    amount = held if amount is None else money(amount)

    day = _date(goal.get("completed_at"))
    if day is None and last_w is not None:
        day = _date(rows[last_w].get("created_at"))
    if day is None:
        day = _date(goal.get("created_at")) or today
    return {"date": day, "amount": amount, "held": held, "counted": counted}


def savings_events(goals: list, transactions: list, today: datetime.date,
                   goals_only: bool = False) -> list:
    """(date, signed amount) events whose running sum is the "achieved by saving"
    total (see the module docstring). `goals_only` is the goals_v2 rule: only listed
    goals' rows count."""
    by_goal: dict = {}
    for t in transactions:
        by_goal.setdefault(t.get("goal_id"), []).append(t)
    goal_by_id = {g["id"]: g for g in goals}

    events = []
    for gid, rows in by_goal.items():
        goal = goal_by_id.get(gid)
        if goal is not None and goal.get("is_reconciliation"):
            continue
        if goals_only and (goal is None or not is_listed_goal(goal)):
            continue
        if goal is not None and goal.get("completed") and is_listed_goal(goal):
            done = goal_completion(goal, rows, today)
            events.extend((_tx_date(t, today), _signed(t)) for t in done["counted"])
            # The completion: the goal now counts as its completed amount. Normally
            # that is exactly what it held, so this adds nothing and the line stays
            # level; it only moves where the snapshot and the ledger disagree.
            adjust = money(done["amount"] - done["held"])
            if adjust:
                events.append((done["date"], adjust))
            continue
        events.extend((_tx_date(t, today), _signed(t)) for t in rows)
    return events


def goal_milestones(goals: list, transactions: list, today: datetime.date) -> list:
    """Each completed goal at its completion month, earliest first."""
    by_goal: dict = {}
    for t in transactions:
        by_goal.setdefault(t.get("goal_id"), []).append(t)
    dated = []
    for g in goals:
        if not (g.get("completed") and is_listed_goal(g)):
            continue
        done = goal_completion(g, by_goal.get(g["id"], []), today)
        dated.append((done["date"], g["id"], g.get("title")))
    dated.sort()
    return [{"month": month_key(day), "name": title} for day, _, title in dated]


def nearest_goal(active_goals: list) -> Optional[dict]:
    """The in-progress goal closest to its target: highest allocated / target, ties
    by id. `active_goals` are listed, not-completed rows run through _with_allocated.
    Goals without a positive target have no "% there" and are skipped."""
    best = None
    for g in active_goals:
        target = _num(g.get("target_amount"))
        if target <= 0:
            continue
        pct = min(1.0, max(0.0, _num(g.get("allocated_amount")) / target))
        key = (-pct, g["id"])
        if best is None or key < best[0]:
            best = (key, {"id": g["id"], "title": g.get("title"), "pct": round(pct, 4)})
    return best[1] if best else None


def _rollover_month(t: dict, today: datetime.date) -> Optional[datetime.date]:
    """The budget month a rollover deposit is FOR: its `month` name, in the year that
    name meant when the row was written (a December row stamped in January is last
    December). Rollover is booked at close-out, so `created_at` is that moment."""
    name = t.get("month")
    if name not in MONTHS:
        return None
    stamped = _date(t.get("created_at")) or today
    number = MONTHS.index(name) + 1
    year = stamped.year if number <= stamped.month else stamped.year - 1
    return datetime.date(year, number, 1)


def kept_under_budget(goals: list, transactions: list, today: datetime.date) -> dict:
    """{"total", "series"} — the month-end leftovers swept into General Savings.
    `series` is one point per month, the first rollover's month through today's,
    each that month's own amount (not cumulative; 0 for a month with none).
    Total 0 and series [] when there has never been one."""
    general = {g["id"] for g in goals if g.get("is_general")}
    by_month: dict = {}
    for t in transactions:
        if (t.get("goal_id") not in general or t.get("source") != "rollover"
                or t.get("type") != "deposit"):
            continue
        month = _rollover_month(t, today)
        if month is None:
            continue
        key = month_key(month)
        by_month[key] = money(by_month.get(key, 0.0) + _num(t.get("amount")))
    if not by_month:
        return {"total": 0.0, "series": []}
    first = min(by_month)
    year, number = int(first[:4]), int(first[5:7])
    last = month_key(today) if month_key(today) > max(by_month) else max(by_month)
    series = []
    while True:
        key = f"{year:04d}-{number:02d}"
        series.append({"month": key, "amount": by_month.get(key, 0.0)})
        if key >= last:
            break
        year, number = (year + 1, 1) if number == 12 else (year, number + 1)
    return {"total": money(sum(by_month.values())), "series": series}


def home_progress_goals(goals: list, transactions: list, today: datetime.date,
                        goals_v2: bool = False) -> Optional[dict]:
    """The Envision dashboard's goals block. `goals` is every savings_goals row for
    the user, with `allocated_amount` on the not-completed ones (_with_allocated);
    `transactions` every savings_transactions row. None when the user has no listed
    goals — General Savings alone doesn't count.

    `goals_v2`: "saved toward goals" counts listed goals only, and the block gains
    `kept_under_budget` / `kept_under_budget_series` (the transactions must then
    carry `source` and `month`)."""
    listed = [g for g in goals if is_listed_goal(g)]
    if not listed:
        return None
    completed = [g for g in listed if g.get("completed")]
    active = [g for g in listed if not g.get("completed")]
    events = savings_events(goals, transactions, today, goals_only=goals_v2)
    block = {
        "completed_count": len(completed),
        "total_count": len(listed),
        "nearest": nearest_goal(active),
        "total_saved": money(sum(amount for _, amount in events)),
        "saved_this_year": amount_in_year(events, today.year),
        "series": monthly_cumulative(events, today),
        "milestones": goal_milestones(goals, transactions, today),
    }
    if goals_v2:
        kept = kept_under_budget(goals, transactions, today)
        block["kept_under_budget"] = kept["total"]
        block["kept_under_budget_series"] = kept["series"]
    return block
