"""Backward compatibility for the onboarding rework (ONBOARDING_REWORK.md §8).

Store build 1.1.0 (`premium, social, limits`) and the three generations before it are
installed and cannot be updated. This change adds two NEW routes (no old build calls
them), migration 0014's `debts.apr_missing`, the APR flag clear in PATCH
/debt-freedom/{id}, and the strip of that column from /home/summary/. Every route an
old build calls that this change could reach is run here, and its response must be
BYTE-IDENTICAL to `main`:

  * `goldens/onboarding_backcompat/<generation>.json` were captured by running
    `scenario()` against `main`'s code and `main`'s fake database — the schema BEFORE
    migration 0014.
  * The test runs the same scenario against this branch, whose fake has the 0014
    column present-and-NULL (as select('*') returns it once applied), and compares
    every response body byte for byte.

The scenario includes a debt (only a newer build can create one, but the account may
be shared) so the home summary's `focus.debt` — the one place a whole debt row reaches
these builds — is exercised.

/debt-freedom/* routes are not in the scenario: no store build has ever called them
(the Debts tab was behind DEBT_FREEDOM_ENABLED = __DEV__ in every store build), so
they have no old client to keep identical for.

Re-capturing (only if the scenario itself changes — never to make a failure pass):

    git worktree add <tmp> main
    copy this file into <tmp>/backend/tests/
    cd <tmp>/backend && WRITE_ONBOARDING_GOLDENS=<this repo>/backend/tests/goldens/onboarding_backcompat \\
        <venv python> -m pytest -q tests/test_backcompat_onboarding.py
    git worktree remove <tmp>
"""

from __future__ import annotations

import datetime
import json
import os
from pathlib import Path

import pytest

import main
from conftest import USER_A, auth, v2

GOLDEN_DIR = Path(__file__).parent / "goldens" / "onboarding_backcompat"
WRITE_DIR = os.environ.get("WRITE_ONBOARDING_GOLDENS")

TODAY = datetime.date(2026, 10, 27)
MONTH = "October"

GENERATIONS = {
    "no-marker": auth(USER_A),
    "premium": v2(USER_A, "premium"),
    "premium+social": v2(USER_A, "premium, social"),
    "store-1.1.0": v2(USER_A, "premium, social, limits"),
}


def seed(db) -> None:
    db.seed("user_settings", {"user_id": USER_A, "tithe_enabled": True, "tithe_rate": 0.10,
                              "budget_type": "balanced"})
    db.seed("income", {"user_id": USER_A, "amount": 3000.0, "day": 1, "month": MONTH})
    db.seed("expenses", {"user_id": USER_A, "title": "Groceries", "amount": 82.5, "category": "Needs",
                         "sub_category": "Groceries", "day": 4, "month": MONTH})
    db.seed("savings_goals", {"user_id": USER_A, "title": "Emergency fund", "target_amount": 1000.0,
                              "target_month": "March", "target_year": 2027,
                              "created_at": "2026-06-01T10:00:00"})
    # Created today with its first cycle already anchored, so no lazy cycle processing
    # (which stamps the wall clock into updated_at) runs during the scenario.
    db.seed("debts", {"user_id": USER_A, "name": "Visa", "original_balance": 1800.0,
                      "current_balance": 1800.0, "min_payment": 60.0, "apr": 0.0, "due_day": 12,
                      "debt_type": "credit_card", "cycle_start_balance": 1800.0,
                      "interest_checked_through": "2026-10-12",
                      "created_at": "2026-10-27T09:00:00+00:00"})


def scenario(client, db, headers) -> dict:
    """The home, the onboarding-adjacent writes an old build makes (tithe, income,
    expense), and the reads that follow them. {step: "<status> <body>"}."""
    seed(db)
    out: dict = {}

    def call(step, method, path, **kw):
        res = client.request(method, path, headers=headers, **kw)
        out[step] = f"{res.status_code} {res.content.decode('utf-8')}"
        return res

    q = {"today": TODAY.isoformat()}
    call("01 dashboard", "GET", f"/dashboard/{MONTH}", params=q)
    call("02 home summary", "GET", "/home/summary/", params={"month": MONTH, **q})
    call("03 home progress", "GET", "/home/progress/", params=q)
    call("04 entitlements", "GET", "/me/entitlements/")
    call("05 settings", "GET", "/settings/")
    call("06 tithe", "PATCH", "/settings/", json={"tithe_enabled": True, "tithe_rate": 0.12})
    call("07 income", "POST", "/income/", json={"amount": 500.0, "day": 27, "month": MONTH,
                                                "source": "Paycheck", "title": None})
    call("08 expense", "POST", "/expenses/", json={"title": "Coffee", "amount": 4.5, "category": "Wants",
                                                   "sub_category": "Other", "day": 27, "month": MONTH})
    call("09 income list", "GET", "/income/details/", params={"month": MONTH})
    call("10 expense list", "GET", "/expenses/details/", params={"month": MONTH, "category": "Wants"})
    call("11 goals", "GET", "/savings/goal/")
    call("12 dashboard", "GET", f"/dashboard/{MONTH}", params=q)
    call("13 home summary", "GET", "/home/summary/", params={"month": MONTH, **q})
    return out


@pytest.fixture
def pinned_server_date(monkeypatch):
    monkeypatch.setattr(main, "_df_server_today", lambda: TODAY)


@pytest.mark.parametrize("generation", list(GENERATIONS))
def test_golden_responses_match_main(client, supabase_db, pinned_server_date, generation):
    got = scenario(client, supabase_db, GENERATIONS[generation])
    if WRITE_DIR:
        Path(WRITE_DIR).mkdir(parents=True, exist_ok=True)
        (Path(WRITE_DIR) / f"{generation}.json").write_text(
            json.dumps(got, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        pytest.skip("golden written")
    want = json.loads((GOLDEN_DIR / f"{generation}.json").read_text(encoding="utf-8"))
    assert list(got) == list(want)
    for step in want:
        assert got[step] == want[step], f"{generation} · {step} differs from main"


# ══ After the onboarding has planted an APR-less debt on the same account ══════
# `main` cannot produce apr_missing = true, so there is no golden: the old builds'
# home summary must simply not carry the key, whatever its value.

@pytest.mark.parametrize("generation", list(GENERATIONS))
def test_an_apr_less_debt_never_reaches_an_old_build(client, supabase_db, pinned_server_date, generation):
    seed(supabase_db)
    supabase_db.tables["debts"][0]["apr_missing"] = True
    body = client.get("/home/summary/", headers=GENERATIONS[generation],
                      params={"month": MONTH, "today": TODAY.isoformat()}).json()
    assert "apr_missing" not in json.dumps(body)
