"""End-to-end verification of the Phase 1 free-tier limits against PRODUCTION.

Creates a throwaway account, drives every gate through the real API, then deletes the
account and everything it wrote. Nothing touches an existing user.

    python verify_limits.py

The account is made under example.com, which RFC 2606 reserves and which can never
receive mail, so no stranger is ever signed up by accident.
"""

from __future__ import annotations

import datetime
import json
import re
import secrets
import sys
import urllib.error
import urllib.request
from pathlib import Path

API = "https://dollarseeds-1.onrender.com"
MONTH = datetime.datetime.now().strftime("%B")
MARKER = "premium, social, limits"

_t = Path("frontend/lib/supabase.ts").read_text(encoding="utf-8")
SUPA = re.search(r"supabaseUrl\s*=\s*'([^']+)'", _t).group(1)
ANON = re.search(r"supabaseAnonKey\s*=\s*'([^']+)'", _t).group(1)

failures: list[str] = []
notes: list[str] = []


def call(method, url, headers=None, body=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("Content-Type", "application/json")
    for k, v in (headers or {}).items():
        req.add_header(k, v)
    try:
        with urllib.request.urlopen(req, timeout=45) as r:
            return r.status, json.loads(r.read() or b"null")
    except urllib.error.HTTPError as e:
        raw = e.read()
        try:
            return e.code, json.loads(raw or b"null")
        except json.JSONDecodeError:
            return e.code, raw.decode(errors="replace")


def check(label, ok, detail=""):
    print(f"[{'PASS' if ok else 'FAIL'}] {label}" + (f"   {detail}" if detail else ""))
    if not ok:
        failures.append(label)


def refused(label, code, status, body):
    ok = status == 403 and isinstance(body, dict) and body.get("code") == code
    check(label, ok, "" if ok else f"got {status} {body}")


def main() -> int:
    email = f"ds-limits-qa-{secrets.token_hex(4)}@example.com"
    password = "LimitsQA-" + secrets.token_hex(4)

    status, body = call("POST", f"{SUPA}/auth/v1/signup", {"apikey": ANON},
                        {"email": email, "password": password})
    token = (body or {}).get("access_token")
    if not token:
        status, body = call("POST", f"{SUPA}/auth/v1/token?grant_type=password",
                            {"apikey": ANON}, {"email": email, "password": password})
        token = (body or {}).get("access_token")
    if not token:
        print(f"Could not create a usable account ({status}): {body}")
        print("If this says the email needs confirming, turn confirmations off in "
              "Supabase > Authentication > Providers, or hand me a clean account.")
        return 2

    uid = (body.get("user") or {}).get("id") or (body.get("user") or {}).get("sub")
    auth = {"Authorization": f"Bearer {token}"}
    mark = {**auth, "X-Client-Features": MARKER}
    print(f"Throwaway account {email}  ({uid})")
    print(f"Booking month: {MONTH}\n")

    try:
        # ── the switch ────────────────────────────────────────────────────────
        _, cfg = call("GET", f"{API}/config/")
        print(f"     /config/ premium_enabled={cfg.get('premium_enabled')}\n")

        # ── allowances ────────────────────────────────────────────────────────
        _, ent = call("GET", f"{API}/me/entitlements/", mark)
        print(f"     entitlements: {json.dumps(ent)}\n")
        check("a new account is not entitled", ent.get("premium_active") is False)
        if ent.get("max_goals") is None:
            notes.append(
                "entitlements reported max_goals=null for an unpaid account. That is the "
                "READ posture failing open, which means the RevenueCat lookup threw. "
                "Writes should still refuse; watch whether they do.")
        else:
            check("max_goals is 1", ent.get("max_goals") == 1, str(ent.get("max_goals")))
            check("budget_types is balanced only", ent.get("budget_types") == ["balanced"])
            check("video_series is free_only", ent.get("video_series") == "free_only")
            check("max_bank_connections is 0", ent.get("max_bank_connections") == 0)
        check("goals_used starts at 0", ent.get("goals_used") == 0, str(ent.get("goals_used")))

        # ── the cap ───────────────────────────────────────────────────────────
        status, a = call("POST", f"{API}/savings/goal/", mark, {"title": "Goal A"})
        check("the first goal is allowed", status == 200, f"got {status} {a}")
        goal_a = (a.get("data") or [{}])[0].get("id")

        status, b = call("POST", f"{API}/savings/goal/", mark, {"title": "Goal B"})
        refused("a second goal is refused with goal_limit_reached",
                "goal_limit_reached", status, b)

        # An UNMARKED create is how a lapsed subscriber ends up holding extra goals.
        status, b = call("POST", f"{API}/savings/goal/", auth, {"title": "Goal B"})
        check("an unmarked client can still create a second goal", status == 200,
              f"got {status} {b}")
        goal_b = (b.get("data") or [{}])[0].get("id")

        # ── locked flags ──────────────────────────────────────────────────────
        _, goals = call("GET", f"{API}/savings/goal/", mark)
        by_id = {g["id"]: g for g in goals.get("data", [])}
        general = next((g["id"] for g in goals.get("data", []) if g.get("is_general")), None)
        print("     goals as served (marked):")
        for g in goals.get("data", []):
            print(f"       id={g['id']:<6} locked={str(g.get('locked')):<5} {g['title']!r}")
        check("the older goal is active", by_id.get(goal_a, {}).get("locked") is False)
        check("the newer goal is locked", by_id.get(goal_b, {}).get("locked") is True)
        check("General Savings is never locked",
              by_id.get(general, {}).get("locked") is False)

        _, ent2 = call("GET", f"{API}/me/entitlements/", mark)
        check("goals_used counts both, excluding General Savings",
              ent2.get("goals_used") == 2, str(ent2.get("goals_used")))

        # ── every write to the locked goal ────────────────────────────────────
        dep = {"title": "x", "amount": 1.0, "type": "deposit", "goal_id": goal_b,
               "day": 1, "month": MONTH, "source": "income"}
        refused("goal_locked on a deposit", "goal_locked",
                *call("POST", f"{API}/savings/transaction/", mark, dep))
        refused("goal_locked on a withdrawal", "goal_locked",
                *call("POST", f"{API}/savings/transaction/", mark, {**dep, "type": "withdrawal"}))
        refused("goal_locked on a transfer", "goal_locked",
                *call("POST", f"{API}/savings/transfer/", mark,
                      {"amount": 1.0, "to_goal_id": goal_b, "general_goal_id": general,
                       "day": 1, "month": MONTH, "to_goal_title": "Goal B"}))
        refused("goal_locked on an edit", "goal_locked",
                *call("PATCH", f"{API}/savings/goal/{goal_b}", mark, {"title": "Renamed"}))
        refused("goal_locked on complete", "goal_locked",
                *call("PATCH", f"{API}/savings/goal/{goal_b}/complete", mark))
        refused("goal_locked on finish", "goal_locked",
                *call("POST", f"{API}/savings/goal/{goal_b}/finish", mark,
                      {"day": 1, "month": MONTH}))

        status, _ = call("PATCH", f"{API}/savings/goal/999999", mark, {"title": "Nope"})
        check("a missing goal is still a 404, not a 403", status == 404, f"got {status}")

        # ── the active goal still works ───────────────────────────────────────
        status, t = call("POST", f"{API}/savings/transaction/", mark, {**dep, "goal_id": goal_a})
        check("the active goal accepts a deposit", status == 200, f"got {status} {t}")
        txn_a = (t.get("data") or [{}])[0].get("id")
        status, _ = call("PATCH", f"{API}/savings/goal/{goal_a}", mark, {"title": "Goal A renamed"})
        check("the active goal accepts an edit", status == 200, f"got {status}")
        if txn_a:
            status, _ = call("DELETE", f"{API}/savings/transaction/{txn_a}", mark)
            check("the active goal's transaction can be deleted", status == 200, f"got {status}")

        # ── deleting a transaction of a locked goal ───────────────────────────
        _, t = call("POST", f"{API}/savings/transaction/", auth, dep)
        txn_b = (t.get("data") or [{}])[0].get("id")
        if txn_b:
            refused("goal_locked on deleting a locked goal's transaction", "goal_locked",
                    *call("DELETE", f"{API}/savings/transaction/{txn_b}", mark))

        # ── deleting the locked GOAL is always allowed ────────────────────────
        status, _ = call("DELETE", f"{API}/savings/goal/{goal_b}?current_month={MONTH}", mark)
        check("deleting a locked goal is allowed", status == 200, f"got {status}")
        status, r = call("POST", f"{API}/savings/goal/", mark, {"title": "Goal C"})
        refused("still capped with one goal left", "goal_limit_reached", status, r)

        # ── completing the one goal frees the slot ────────────────────────────
        status, _ = call("POST", f"{API}/savings/goal/{goal_a}/finish", mark,
                         {"day": 1, "month": MONTH})
        check("the active goal can be finished", status == 200, f"got {status}")
        status, c = call("POST", f"{API}/savings/goal/", mark, {"title": "Goal C"})
        check("finishing frees the slot", status == 200, f"got {status} {c}")

        # ── budget types ──────────────────────────────────────────────────────
        refused("budget_type_locked on wealth_builder", "budget_type_locked",
                *call("PATCH", f"{API}/settings/", mark, {"budget_type": "wealth_builder"}))
        refused("budget_type_locked on firm_foundation", "budget_type_locked",
                *call("PATCH", f"{API}/settings/", mark, {"budget_type": "firm_foundation"}))
        status, _ = call("PATCH", f"{API}/settings/", mark, {"budget_type": "balanced"})
        check("balanced is accepted", status == 200, f"got {status}")

        status, _ = call("PATCH", f"{API}/settings/", mark,
                         {"budget_type": "wealth_builder", "tithe_enabled": True})
        _, st = call("GET", f"{API}/settings/", auth)
        check("a refused patch applies none of its other fields",
              status == 403 and st["data"].get("tithe_enabled") is not True,
              f"tithe_enabled={st['data'].get('tithe_enabled')}")

        # An unmarked client sets a gated type; the stored value must survive.
        call("PATCH", f"{API}/settings/", auth, {"budget_type": "wealth_builder"})
        call("POST", f"{API}/income/", auth, {"amount": 1000.0, "day": 1, "month": MONTH})

        _, st = call("GET", f"{API}/settings/", auth)
        check("the stored choice is never rewritten",
              st["data"].get("budget_type") == "wealth_builder",
              str(st["data"].get("budget_type")))

        _, dash_m = call("GET", f"{API}/dashboard/{MONTH}", mark)
        _, dash_u = call("GET", f"{API}/dashboard/{MONTH}", auth)
        check("an unclosed month resolves to balanced for a limits caller",
              dash_m["budget_type"]["key"] == "balanced", dash_m["budget_type"]["key"])
        check("live_budget_type falls back too",
              dash_m.get("live_budget_type") == "balanced", str(dash_m.get("live_budget_type")))
        check("an unmarked caller still sees wealth_builder",
              dash_u["budget_type"]["key"] == "wealth_builder", dash_u["budget_type"]["key"])
        check("the split is 50/30/20 for the limits caller",
              dash_m["budgets"] == {"needs": 500.0, "wants": 300.0, "goals": 200.0},
              json.dumps(dash_m["budgets"]))

        _, inc_m = call("POST", f"{API}/income/", mark, {"amount": 10.0, "day": 2, "month": MONTH})
        stamped = (inc_m.get("data") or [{}])[0].get("budget_type")
        check("an income row snapshots the fallback", stamped == "balanced", str(stamped))

        # ── closing a month freezes what was shown ────────────────────────────
        status, _ = call("POST", f"{API}/rollover/close/", mark, {"month": MONTH})
        check("the month closes", status == 200, f"got {status}")
        _, closed = call("GET", f"{API}/dashboard/{MONTH}", mark)
        check("the closed month is frozen at balanced",
              closed["budget_type"]["key"] == "balanced", closed["budget_type"]["key"])
        _, closed_u = call("GET", f"{API}/dashboard/{MONTH}", auth)
        check("and stays balanced for an unmarked caller too, because it is frozen",
              closed_u["budget_type"]["key"] == "balanced", closed_u["budget_type"]["key"])
        call("POST", f"{API}/rollover/reopen/", mark, {"month": MONTH})

        # ── the video gate, unchanged ─────────────────────────────────────────
        _, series_m = call("GET", f"{API}/lessons/series/", mark)
        _, series_u = call("GET", f"{API}/lessons/series/", auth)
        print(f"\n     series, marked:   {[s['title'] for s in series_m.get('data', [])]}")
        print(f"     series, unmarked: {[s['title'] for s in series_u.get('data', [])]}")
        for s in series_m.get("data", []):
            _, det = call("GET", f"{API}/lessons/series/{s['id']}/", mark)
            for lesson in det.get("data", {}).get("lessons", [])[:1]:
                status, pb = call("GET", f"{API}/lessons/{lesson['id']}/playback/", mark)
                check("premium playback is refused with the frozen body",
                      status == 403 and pb == {
                          "code": "premium_required",
                          "detail": "This series is part of DollarSeeds Premium."},
                      f"got {status} {pb}")
    finally:
        status, _ = call("POST", f"{API}/account/delete/", auth, {"confirmation": "DELETE"})
        print(f"\n     cleanup: deleted {email} -> HTTP {status}")

    print()
    for n in notes:
        print(f"NOTE: {n}")
    if failures:
        print(f"\n{len(failures)} check(s) failed:")
        for f in failures:
            print(f"  - {f}")
        return 1
    print("\nAll checks passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
