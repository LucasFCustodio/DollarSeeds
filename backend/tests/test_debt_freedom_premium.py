"""Debt Freedom is premium: the `debt_freedom` allowance and the write gate.

Same three conditions as every other limit (main._entitlements): the `limits`
marker, app_config.premium_enabled, and the user's entitlement. For an enforced
caller every WRITE under /debt-freedom/ is refused with 403 `debt_freedom_locked`
and changes nothing; every READ stays open, so a lapsed subscriber still sees their
debts, and the lazy cycle processing reads run keeps their balances true.
"""

from __future__ import annotations

import datetime

import pytest

import main
from conftest import USER_A, USER_B, auth, v2

LIMITS = v2(USER_A, "limits")
APP = v2(USER_A, "premium, social, limits")
FUTURE = "2099-01-01T00:00:00+00:00"
TODAY = datetime.date(2026, 9, 28)


@pytest.fixture(autouse=True)
def on_today(monkeypatch):
    monkeypatch.setattr(main, "_df_server_today", lambda: TODAY)


def subscribe(db, user_id: str = USER_A):
    db.seed("subscriptions", {"user_id": user_id, "store": "app_store", "environment": "production",
                              "store_txn_id": f"txn-{user_id[:4]}",
                              "product_id": "com.dollarseeds.premium.monthly", "expires_at": FUTURE})


def seed_debt(db, user_id: str = USER_A, **over) -> dict:
    row = {"user_id": user_id, "name": "Card", "original_balance": 1000.0, "current_balance": 1000.0,
           "min_payment": 50.0, "apr": 24.0, "due_day": 14, "cycle_start_balance": 1000.0,
           "status": "active", "species": 4, "species_locked": False,
           "created_at": "2026-09-01T10:00:00+00:00", "interest_checked_through": "2026-09-14"}
    row.update(over)
    return db.seed("debts", row)


class _BoomHttpx:
    def get(self, *a, **k):
        raise TimeoutError("revenuecat unreachable")


@pytest.fixture
def unreachable_revenuecat(monkeypatch):
    monkeypatch.setattr(main, "REVENUECAT_API_KEY", "rc-key")
    monkeypatch.setattr(main, "httpx", _BoomHttpx())


def allowance(client, headers=LIMITS) -> str:
    return client.get("/me/entitlements/", headers=headers).json()["debt_freedom"]


# ══ The allowance ══════════════════════════════════════════════════════════════

def test_a_free_caller_with_no_debts_is_none(client, premium_on):
    assert allowance(client) == "none"


def test_a_free_caller_with_debts_is_read_only(client, premium_on):
    seed_debt(premium_on)
    assert allowance(client) == "read_only"


def test_a_paid_off_debt_still_makes_it_read_only(client, premium_on):
    seed_debt(premium_on, status="paid_off", current_balance=0.0)
    assert allowance(client) == "read_only"


def test_a_subscriber_is_full_with_or_without_debts(client, premium_on):
    subscribe(premium_on)
    assert allowance(client) == "full"
    seed_debt(premium_on)
    assert allowance(client) == "full"


def test_the_kill_switch_off_is_full(client, supabase_db):
    seed_debt(supabase_db)
    assert allowance(client) == "full"


def test_another_users_debts_do_not_count(client, premium_on):
    seed_debt(premium_on, user_id=USER_B)
    assert allowance(client) == "none"


def test_the_allowance_is_the_same_for_the_full_token_list(client, premium_on):
    seed_debt(premium_on)
    assert allowance(client, LIMITS) == allowance(client, APP) == "read_only"


def test_an_unmarked_caller_never_gets_the_field(client, premium_on):
    seed_debt(premium_on)
    for headers in (auth(USER_A), v2(USER_A, "premium"), v2(USER_A, "premium, social")):
        assert "debt_freedom" not in client.get("/me/entitlements/", headers=headers).json()


def test_reads_do_not_downgrade_when_revenuecat_is_unreachable(client, premium_on, unreachable_revenuecat):
    """Read posture: a lookup timeout never swaps a paying user's garden for the
    tutorial."""
    seed_debt(premium_on)
    assert allowance(client) == "full"


def test_no_debts_query_for_an_unmarked_or_paid_caller(premium_on):
    """The debts read is only for a caller the limits apply to."""
    seed_debt(premium_on)
    subscribe(premium_on)
    for features in (set(), {"limits"}):
        ent = main._entitlements(USER_A, features)
        assert ent.debt_freedom() == "full"
        assert ent._has_debts is None


# ══ Every write is refused ═════════════════════════════════════════════════════

def _writes(debt_id: int) -> list:
    """(method, path, json) for every write route under /debt-freedom/."""
    return [
        ("post", "/debt-freedom/", {"name": "New", "original_balance": 500, "current_balance": 500,
                                    "min_payment": 25, "apr": 10, "due_day": 3}),
        ("patch", f"/debt-freedom/{debt_id}", {"name": "Renamed"}),
        ("delete", f"/debt-freedom/{debt_id}", None),
        ("post", f"/debt-freedom/{debt_id}/payments", {"minimum": True}),
        ("post", f"/debt-freedom/{debt_id}/payments/undo-minimum", {}),
        ("delete", f"/debt-freedom/{debt_id}/payments/1", None),
        ("post", f"/debt-freedom/{debt_id}/checkin", {"statement_balance": 900, "min_payment": 40}),
        ("post", f"/debt-freedom/{debt_id}/late-fee", {"due_date": "2026-09-14", "amount": 25}),
        ("post", f"/debt-freedom/{debt_id}/complete", None),
        ("put", "/debt-freedom/settings", {"monthly_extra": 100}),
    ]


WRITE_IDS = ["create", "update", "delete", "payment", "undo", "delete-payment",
             "checkin", "late-fee", "complete", "settings"]


def _send(client, method, path, body, headers):
    kwargs = {"headers": headers}
    if body is not None:
        kwargs["json"] = body
    return client.request(method.upper(), path, **kwargs)


def _snapshot(db) -> dict:
    return {t: [dict(r) for r in db.rows(t)] for t in ("debts", "debt_transactions", "debt_freedom_settings")}


@pytest.mark.parametrize("index", range(10), ids=WRITE_IDS)
@pytest.mark.parametrize("has_debts", [True, False], ids=["read_only", "none"])
def test_every_write_is_refused_for_a_free_caller(client, premium_on, index, has_debts):
    # A debt of USER_B's stands in for "no debts" so every path has an id to name.
    d = seed_debt(premium_on, user_id=USER_A if has_debts else USER_B, late_fee_pending_for="2026-09-14")
    assert allowance(client) == ("read_only" if has_debts else "none")
    before = _snapshot(premium_on)

    method, path, body = _writes(d["id"])[index]
    res = _send(client, method, path, body, LIMITS)

    assert res.status_code == 403, res.text
    assert res.json() == {"code": "debt_freedom_locked",
                          "detail": main.PREMIUM_REQUIRED_DETAILS["debt_freedom_locked"]}
    assert _snapshot(premium_on) == before, "a refused write changes nothing"


@pytest.mark.parametrize("index", range(10), ids=WRITE_IDS)
def test_writes_fail_closed_when_revenuecat_is_unreachable(client, premium_on, unreachable_revenuecat, index):
    """The goal gates' posture: an unreachable lookup refuses rather than serving a
    premium write it cannot vouch for. A subscriber recorded in our own table never
    reaches RevenueCat, so they are unaffected (next test)."""
    d = seed_debt(premium_on)
    method, path, body = _writes(d["id"])[index]
    res = _send(client, method, path, body, LIMITS)
    assert res.status_code == 403 and res.json()["code"] == "debt_freedom_locked"


def test_a_recorded_subscriber_writes_through_a_revenuecat_outage(client, premium_on, unreachable_revenuecat):
    subscribe(premium_on)
    d = seed_debt(premium_on)
    assert client.post(f"/debt-freedom/{d['id']}/payments", headers=LIMITS,
                       json={"minimum": True}).status_code == 200


@pytest.mark.parametrize("headers", [auth(USER_A), v2(USER_A, "premium, social")],
                         ids=["unmarked", "premium+social"])
def test_a_caller_without_limits_is_not_gated(client, premium_on, headers):
    """The same rule as every gate: no marker, nothing applies."""
    d = seed_debt(premium_on)
    assert client.post(f"/debt-freedom/{d['id']}/payments", headers=headers,
                       json={"minimum": True}).status_code == 200


def test_a_subscriber_can_write(client, premium_on):
    subscribe(premium_on)
    res = client.post("/debt-freedom/", headers=LIMITS, json=_writes(0)[0][2])
    assert res.status_code == 200, res.text
    d = res.json()["debt"]
    assert client.post(f"/debt-freedom/{d['id']}/payments", headers=LIMITS,
                       json={"minimum": True}).status_code == 200
    assert client.put("/debt-freedom/settings", headers=LIMITS,
                      json={"monthly_extra": 50}).status_code == 200


def test_the_kill_switch_off_lets_a_free_caller_write(client, supabase_db):
    d = seed_debt(supabase_db)
    assert client.post(f"/debt-freedom/{d['id']}/payments", headers=LIMITS,
                       json={"minimum": True}).status_code == 200


def test_a_missing_debt_is_refused_before_it_is_looked_up(client, premium_on):
    """The gate runs first: an enforced caller learns nothing about which ids exist."""
    res = client.post("/debt-freedom/999999/payments", headers=LIMITS, json={"minimum": True})
    assert res.status_code == 403


def test_the_existing_premium_codes_are_unchanged():
    assert main.PremiumRequired().detail == "This series is part of DollarSeeds Premium."
    assert main.PremiumRequired("debt_freedom_locked").code == "debt_freedom_locked"


# ══ Reads stay open ════════════════════════════════════════════════════════════

def test_every_read_stays_open_for_a_lapsed_user(client, premium_on):
    d = seed_debt(premium_on)
    garden = client.get("/debt-freedom/", headers=LIMITS)
    assert garden.status_code == 200 and garden.json()["debts"][0]["id"] == d["id"]
    assert client.get(f"/debt-freedom/{d['id']}", headers=LIMITS).status_code == 200
    assert client.get("/debt-freedom/settings", headers=LIMITS).status_code == 200
    assert client.get("/debt-freedom/payments", headers=LIMITS,
                      params={"month": "September"}).status_code == 200


def test_cycle_processing_still_runs_on_read_for_a_lapsed_user(client, premium_on):
    """Interest and late fees keep landing, so the balance a lapsed user sees is true
    when they come back."""
    seed_debt(premium_on, interest_checked_through="2026-08-14", late_fee=25.0,
              created_at="2026-08-01T10:00:00+00:00")
    body = client.get("/debt-freedom/", headers=LIMITS).json()
    kinds = [t["kind"] for t in premium_on.rows("debt_transactions")]
    assert kinds == ["late_fee", "interest"]
    assert body["debts"][0]["current_balance"] > 1000.0
