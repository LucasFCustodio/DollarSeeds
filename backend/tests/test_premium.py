"""Premium subscriptions: entitlement, the /playback/ gate, config, and the webhook.

The backward-compatibility half lives in test_backcompat_lessons.py. This file proves
the new behaviour actually works for clients that ask for it.
"""

from __future__ import annotations

import datetime

import pytest

import main
from conftest import USER_A, USER_B, WEBHOOK_SECRET, auth, v2

FUTURE = "2099-01-01T00:00:00+00:00"
PAST = "2020-01-01T00:00:00+00:00"


def sub(db, **over):
    row = {
        "user_id": USER_A, "store": "app_store", "environment": "production",
        "store_txn_id": "txn-1", "product_id": "com.dollarseeds.support.monthly.5",
        "expires_at": FUTURE,
    }
    row.update(over)
    return db.seed("subscriptions", row)


@pytest.fixture
def premium_series(supabase_db):
    supabase_db.seed("lesson_series", {"id": "s-prem", "title": "Premium", "creator": "DS",
                                       "description": "d", "thumbnail_url": "u",
                                       "is_published": True, "is_premium": True, "sort_order": 1})
    supabase_db.seed("lesson_series", {"id": "s-free", "title": "Free", "creator": "DS",
                                       "description": "d", "thumbnail_url": "u",
                                       "is_published": True, "is_premium": False, "sort_order": 0})
    supabase_db.seed("lessons", {"id": "l-prem", "series_id": "s-prem", "title": "P1",
                                 "sort_order": 0, "video_id": "p/1.mp4"})
    supabase_db.seed("lessons", {"id": "l-free", "series_id": "s-free", "title": "F1",
                                 "sort_order": 0, "video_id": "f/1.mp4"})
    return supabase_db


# ══ Entitlement — the boundary cases the model exists to get right ══════════════

@pytest.mark.parametrize("label,row,expected", [
    ("active and unexpired",        {"expires_at": FUTURE},                          True),
    ("expired",                     {"expires_at": PAST},                            False),
    # Apple extends expires_at through the ~16-day retry window, so grace is just
    # "unexpired" as far as access is concerned.
    ("in grace period",             {"expires_at": FUTURE, "status": "in_grace_period"}, True),
    # THE case the spec's original status-based rule got wrong: cancelling turns
    # auto-renew off, it does not take back the period the user paid for.
    ("cancelled but not expired",   {"expires_at": FUTURE, "status": "cancelled",
                                     "auto_renew": False, "cancelled_at": PAST},     True),
    # ...and the case a naive "keep status active on cancel" fix gets wrong.
    ("refunded",                    {"expires_at": FUTURE, "revoked_at": PAST},      False),
    ("paused",                      {"expires_at": FUTURE, "revoked_at": PAST,
                                     "status": "paused"},                            False),
    ("null expiry",                 {"expires_at": None},                            False),
])
def test_entitlement_boundary_cases(supabase_db, label, row, expected):
    sub(supabase_db, **row)
    assert main._has_premium(USER_A) is expected, label


def test_no_row_at_all_is_not_entitled(supabase_db):
    assert main._has_premium(USER_A) is False


def test_two_rows_one_active_is_entitled(supabase_db):
    """A user can hold an App Store and a Play Store subscription. Entitlement is
    EXISTS-over-rows, never "the user's row"."""
    sub(supabase_db, store="app_store", store_txn_id="a", expires_at=PAST)
    sub(supabase_db, store="play_store", store_txn_id="b", expires_at=FUTURE)
    assert main._has_premium(USER_A) is True


def test_two_expired_rows_is_not_entitled(supabase_db):
    sub(supabase_db, store="app_store", store_txn_id="a", expires_at=PAST)
    sub(supabase_db, store="play_store", store_txn_id="b", expires_at=PAST)
    assert main._has_premium(USER_A) is False


def test_one_users_subscription_never_entitles_another(supabase_db):
    sub(supabase_db, user_id=USER_B, expires_at=FUTURE)
    assert main._has_premium(USER_A) is False


# ══ The capability matrix ═══════════════════════════════════════════════════════

@pytest.mark.parametrize("marked", [False, True])
@pytest.mark.parametrize("premium", [False, True])
@pytest.mark.parametrize("subscribed", [False, True])
def test_playback_matrix(client, premium_series, premium_on, marked, premium, subscribed):
    if subscribed:
        sub(premium_series)
    headers = v2() if marked else auth(USER_A)
    lesson = "l-prem" if premium else "l-free"

    res = client.get(f"/lessons/{lesson}/playback/", headers=headers)

    # The ONLY cell that is refused: a marked client, a premium series, no subscription.
    should_block = marked and premium and not subscribed
    assert res.status_code == (403 if should_block else 200), res.text


def test_blocked_playback_returns_a_top_level_machine_readable_code(client, premium_series, premium_on):
    res = client.get("/lessons/l-prem/playback/", headers=v2())
    assert res.status_code == 403
    body = res.json()
    # Top level, not nested under `detail` — the app branches on it to show the paywall
    # instead of a generic error.
    assert body["code"] == "premium_required"
    # And `detail` stays a plain string, because screens pass it to Alert.alert.
    assert isinstance(body["detail"], str)


def test_series_list_matrix(client, premium_series, premium_on):
    old = client.get("/lessons/series/", headers=auth(USER_A)).json()["data"]
    assert [s["title"] for s in old] == ["Free"]
    assert "is_premium" not in old[0]

    new = client.get("/lessons/series/", headers=v2()).json()["data"]
    assert [s["title"] for s in new] == ["Free", "Premium"]
    assert [s["is_premium"] for s in new] == [False, True]


def test_series_detail_exposes_is_premium_only_to_marked_clients(client, premium_series):
    old = client.get("/lessons/series/s-prem/", headers=auth(USER_A)).json()["data"]
    assert "is_premium" not in old

    new = client.get("/lessons/series/s-prem/", headers=v2()).json()["data"]
    assert new["is_premium"] is True


def test_an_unknown_feature_token_does_not_grant_the_premium_capability(client, premium_series, premium_on):
    res = client.get("/lessons/l-prem/playback/", headers=v2(features="somethingelse"))
    assert res.status_code == 200   # treated as an old binary: hidden, never gated


# ══ /config/ ════════════════════════════════════════════════════════════════════

def test_config_is_public_and_defaults_to_premium_off(client):
    res = client.get("/config/")
    assert res.status_code == 200
    assert res.json() == {"premium_enabled": False,
                          "min_supported_version": "0.0.0",
                          "update_url": ""}


def test_config_reflects_the_kill_switch(client, premium_on):
    assert client.get("/config/").json()["premium_enabled"] is True


def test_config_fails_open_when_the_table_is_unreadable(client, supabase_db, monkeypatch):
    """A config read that throws must degrade to "premium off" — today's behaviour —
    not lock anyone out and not 500."""
    def boom(*a, **k):
        raise RuntimeError("db down")
    monkeypatch.setattr(supabase_db, "table", boom)

    res = client.get("/config/")
    assert res.status_code == 200
    assert res.json()["premium_enabled"] is False


def test_config_does_not_leak_adoption_counters(client):
    """Adoption telemetry goes to the Render log. /config/ is public and unauthenticated
    and must stay minimal."""
    assert set(client.get("/config/").json()) == {
        "premium_enabled", "min_supported_version", "update_url"}


# ══ /me/entitlements/ ═══════════════════════════════════════════════════════════

def test_entitlements_reports_the_active_subscription(client, supabase_db):
    sub(supabase_db, pending_product_id="com.dollarseeds.support.yearly.120")
    body = client.get("/me/entitlements/", headers=auth(USER_A)).json()
    assert body["premium_active"] is True
    assert body["expires_at"] == FUTURE
    assert body["product_id"] == "com.dollarseeds.support.monthly.5"
    assert body["pending_product_id"] == "com.dollarseeds.support.yearly.120"
    assert body["store"] == "app_store"


def test_entitlements_is_false_with_no_subscription(client, supabase_db):
    body = client.get("/me/entitlements/", headers=auth(USER_A)).json()
    assert body["premium_active"] is False
    assert body["expires_at"] is None


def test_entitlements_never_leaks_another_users_subscription(client, supabase_db):
    sub(supabase_db, user_id=USER_B)
    assert client.get("/me/entitlements/", headers=auth(USER_A)).json()["premium_active"] is False


# ══ Webhook: authorization ══════════════════════════════════════════════════════

def rc_event(**over):
    event = {
        "id": "evt-1",
        "type": "INITIAL_PURCHASE",
        "app_user_id": USER_A,
        "product_id": "com.dollarseeds.support.monthly.5",
        "original_transaction_id": "txn-1",
        "store": "APP_STORE",
        "environment": "PRODUCTION",
        "event_timestamp_ms": 1_800_000_000_000,
        "expiration_at_ms": 4_100_000_000_000,   # year 2099
    }
    event.update(over)
    return {"api_version": "1.0", "event": event}


_UNSET = object()


def hook(client, payload=_UNSET, secret=WEBHOOK_SECRET):
    # Sentinel rather than `payload or rc_event()`: an empty dict is a payload a test
    # deliberately sends, and `or` would silently swap in the default event instead.
    body = rc_event() if payload is _UNSET else payload
    headers = {"Authorization": secret} if secret is not None else {}
    return client.post("/webhooks/revenuecat", json=body, headers=headers)


def test_webhook_refuses_everything_when_the_secret_is_not_configured(client, supabase_db):
    """The critical one. main.py's house idiom is `os.environ.get(...)` with an unset
    value meaning "skip that check" — copied here that would compare "" to "" and hand
    anonymous callers write access to the entitlement table over a service-role
    connection. Unset must mean refuse, not allow."""
    # No `webhook_secret` fixture: REVENUECAT_WEBHOOK_AUTH is "" by default.
    assert hook(client, secret="").status_code == 503
    assert hook(client, secret=None).status_code == 503
    assert hook(client, secret="anything").status_code == 503
    assert supabase_db.rows("subscriptions") == []


def test_webhook_rejects_a_wrong_or_missing_secret(client, supabase_db, webhook_secret):
    assert hook(client, secret="wrong-secret").status_code == 401
    assert hook(client, secret=None).status_code == 401
    assert hook(client, secret="").status_code == 401
    assert supabase_db.rows("subscriptions") == []


def test_webhook_accepts_the_configured_secret(client, supabase_db, webhook_secret):
    assert hook(client).status_code == 200
    assert len(supabase_db.rows("subscriptions")) == 1


# ══ Webhook: event mapping ══════════════════════════════════════════════════════

def test_initial_purchase_creates_an_entitled_row(client, supabase_db, webhook_secret):
    hook(client)
    row = supabase_db.rows("subscriptions")[0]
    assert row["user_id"] == USER_A
    assert row["store"] == "app_store" and row["environment"] == "production"
    assert row["store_txn_id"] == "txn-1"
    assert row["revoked_at"] is None
    assert main._has_premium(USER_A) is True


def test_cancellation_keeps_access_until_expiry(client, supabase_db, webhook_secret):
    hook(client)
    hook(client, rc_event(id="evt-2", type="CANCELLATION", cancel_reason="UNSUBSCRIBE",
                          event_timestamp_ms=1_800_000_001_000))

    row = supabase_db.rows("subscriptions")[0]
    assert row["auto_renew"] is False
    assert row["cancelled_at"] is not None
    assert row["status"] == "cancelled"
    assert row["revoked_at"] is None
    assert main._has_premium(USER_A) is True, "cancelling is not losing what you paid for"


def test_a_refund_revokes_immediately(client, supabase_db, webhook_secret):
    hook(client)
    hook(client, rc_event(id="evt-2", type="CANCELLATION", cancel_reason="CUSTOMER_SUPPORT",
                          event_timestamp_ms=1_800_000_001_000))

    row = supabase_db.rows("subscriptions")[0]
    assert row["status"] == "refunded"
    assert row["revoked_at"] is not None
    assert main._has_premium(USER_A) is False


def test_an_unknown_cancel_reason_does_not_revoke(client, supabase_db, webhook_secret):
    """UNKNOWN is Apple declining to give a reason, not a refund. Treating it as one
    would cut off paying users who merely turned auto-renew off."""
    hook(client)
    hook(client, rc_event(id="evt-2", type="CANCELLATION", cancel_reason="UNKNOWN",
                          event_timestamp_ms=1_800_000_001_000))
    assert main._has_premium(USER_A) is True


def test_expiration_ends_access(client, supabase_db, webhook_secret):
    hook(client)
    hook(client, rc_event(id="evt-2", type="EXPIRATION", event_timestamp_ms=1_800_000_001_000,
                          expiration_at_ms=1_600_000_000_000))
    assert supabase_db.rows("subscriptions")[0]["status"] == "expired"
    assert main._has_premium(USER_A) is False


def test_billing_issue_does_not_revoke(client, supabase_db, webhook_secret):
    hook(client)
    hook(client, rc_event(id="evt-2", type="BILLING_ISSUE", event_timestamp_ms=1_800_000_001_000))
    assert supabase_db.rows("subscriptions")[0]["status"] == "in_grace_period"
    assert main._has_premium(USER_A) is True


def test_product_change_is_pending_and_does_not_move_the_current_tier(client, supabase_db, webhook_secret):
    """Every product sits at Level 1, so a switch is a crossgrade that takes effect at
    the NEXT renewal — never immediately, never prorated."""
    hook(client)
    hook(client, rc_event(id="evt-2", type="PRODUCT_CHANGE",
                          new_product_id="com.dollarseeds.support.yearly.480",
                          event_timestamp_ms=1_800_000_001_000))

    row = supabase_db.rows("subscriptions")[0]
    assert row["product_id"] == "com.dollarseeds.support.monthly.5", "tier must not move yet"
    assert row["pending_product_id"] == "com.dollarseeds.support.yearly.480"
    assert main._has_premium(USER_A) is True, "a pending switch never interrupts access"


def test_the_renewal_applies_the_pending_tier(client, supabase_db, webhook_secret):
    hook(client)
    hook(client, rc_event(id="evt-2", type="PRODUCT_CHANGE",
                          new_product_id="com.dollarseeds.support.yearly.480",
                          event_timestamp_ms=1_800_000_001_000))
    hook(client, rc_event(id="evt-3", type="RENEWAL",
                          product_id="com.dollarseeds.support.yearly.480",
                          event_timestamp_ms=1_800_000_002_000))

    row = supabase_db.rows("subscriptions")[0]
    assert row["product_id"] == "com.dollarseeds.support.yearly.480"
    assert row["pending_product_id"] is None


def test_reverting_a_pending_change_clears_it(client, supabase_db, webhook_secret):
    hook(client)
    hook(client, rc_event(id="evt-2", type="PRODUCT_CHANGE",
                          new_product_id="com.dollarseeds.support.yearly.480",
                          event_timestamp_ms=1_800_000_001_000))
    hook(client, rc_event(id="evt-3", type="PRODUCT_CHANGE",
                          new_product_id="com.dollarseeds.support.monthly.5",
                          event_timestamp_ms=1_800_000_002_000))
    assert supabase_db.rows("subscriptions")[0]["pending_product_id"] is None


def test_transfer_repoints_the_row_instead_of_duplicating_it(client, supabase_db, webhook_secret):
    """The identity key deliberately excludes user_id so an entitlement can move between
    App User IDs — the delete-then-re-signup and shared-Apple-ID paths."""
    hook(client)
    hook(client, rc_event(id="evt-2", type="TRANSFER", app_user_id=USER_B,
                          event_timestamp_ms=1_800_000_001_000))

    rows = supabase_db.rows("subscriptions")
    assert len(rows) == 1
    assert rows[0]["user_id"] == USER_B
    assert main._has_premium(USER_B) is True
    assert main._has_premium(USER_A) is False


def test_subscription_paused_revokes(client, supabase_db, webhook_secret):
    hook(client, rc_event(store="PLAY_STORE"))
    hook(client, rc_event(id="evt-2", type="SUBSCRIPTION_PAUSED", store="PLAY_STORE",
                          event_timestamp_ms=1_800_000_001_000))
    assert main._has_premium(USER_A) is False


@pytest.mark.parametrize("event_type", [
    "TEST", "PAYWALL_IMPRESSION", "EXPERIMENT_ENROLLMENT", "SOMETHING_REVENUECAT_ADDS_LATER",
])
def test_unhandled_event_types_are_acknowledged_not_errors(client, supabase_db, webhook_secret, event_type):
    """A 4xx/5xx makes RevenueCat retry for 72h and then alert a human. "We looked at
    this and ignored it" must be a 200."""
    res = hook(client, rc_event(type=event_type))
    assert res.status_code == 200
    assert res.json()["applied"] is False
    assert supabase_db.rows("subscriptions") == []


# ══ Webhook: idempotency, ordering, and bad input ═══════════════════════════════

def test_duplicate_delivery_is_a_no_op(client, supabase_db, webhook_secret):
    hook(client, rc_event(id="evt-1", type="RENEWAL"))
    first = dict(supabase_db.rows("subscriptions")[0])

    res = hook(client, rc_event(id="evt-1", type="RENEWAL"))

    assert res.status_code == 200
    assert res.json()["duplicate"] is True
    assert len(supabase_db.rows("subscriptions")) == 1
    assert supabase_db.rows("subscriptions")[0] == first
    assert len(supabase_db.rows("subscription_events")) == 1


def test_an_out_of_order_expiration_cannot_revoke_a_newer_renewal(client, supabase_db, webhook_secret):
    """The failure this design exists to prevent: an EXPIRATION generated BEFORE a
    renewal, but delivered after it, must not cut off a subscriber who just paid."""
    hook(client, rc_event(id="evt-renew", type="RENEWAL", event_timestamp_ms=2_000_000_000_000))
    res = hook(client, rc_event(id="evt-expire", type="EXPIRATION",
                                event_timestamp_ms=1_000_000_000_000,
                                expiration_at_ms=1_000_000_000_000))

    assert res.status_code == 200
    assert res.json()["applied"] is False
    assert supabase_db.rows("subscriptions")[0]["status"] == "active"
    assert main._has_premium(USER_A) is True


def test_a_newer_event_still_applies(client, supabase_db, webhook_secret):
    hook(client, rc_event(id="evt-1", type="RENEWAL", event_timestamp_ms=1_000_000_000_000))
    hook(client, rc_event(id="evt-2", type="EXPIRATION", event_timestamp_ms=2_000_000_000_000,
                          expiration_at_ms=2_000_000_000_000))
    assert supabase_db.rows("subscriptions")[0]["status"] == "expired"


def test_sandbox_and_production_do_not_collide(client, supabase_db, webhook_secret):
    """Apple's sandbox and production transaction-id namespaces overlap, so a TestFlight
    purchase must not hijack a real one. environment is part of the identity key."""
    hook(client, rc_event(id="evt-prod", environment="PRODUCTION"))
    hook(client, rc_event(id="evt-sand", environment="SANDBOX",
                          event_timestamp_ms=1_800_000_001_000))

    rows = supabase_db.rows("subscriptions")
    assert len(rows) == 2
    assert {r["environment"] for r in rows} == {"production", "sandbox"}


def test_an_event_for_an_unknown_user_is_acknowledged_and_ignored(client, supabase_db, webhook_secret):
    """A RevenueCat anonymous id means a client that never called Purchases.logIn — no
    DollarSeeds user to credit. Also covers accounts deleted since purchase."""
    res = hook(client, rc_event(app_user_id="$RCAnonymousID:abc123"))
    assert res.status_code == 200
    assert res.json()["reason"] == "unknown_user"
    assert supabase_db.rows("subscriptions") == []


def test_an_event_with_no_id_is_acknowledged_and_ignored(client, supabase_db, webhook_secret):
    res = hook(client, {"event": {"type": "RENEWAL", "app_user_id": USER_A}})
    assert res.status_code == 200
    assert res.json()["reason"] == "missing_event_id"


def test_an_empty_payload_is_acknowledged_and_ignored(client, supabase_db, webhook_secret):
    assert hook(client, {}).status_code == 200
    assert supabase_db.rows("subscriptions") == []


def test_play_store_events_without_an_original_transaction_id_still_get_an_identity(
        client, supabase_db, webhook_secret):
    """Google frequently omits original_transaction_id. A NULL identity would be
    catastrophic quietly: NULLs never collide in a unique index, so every renewal would
    append another duplicate row."""
    hook(client, rc_event(store="PLAY_STORE", original_transaction_id=None,
                          transaction_id="gpa-123"))
    rows = supabase_db.rows("subscriptions")
    assert len(rows) == 1
    assert rows[0]["store_txn_id"] == "gpa-123"
    assert rows[0]["store"] == "play_store"


def test_the_audit_log_records_every_event_including_ignored_ones(client, supabase_db, webhook_secret):
    hook(client, rc_event(id="a", type="INITIAL_PURCHASE"))
    hook(client, rc_event(id="b", type="TEST"))
    hook(client, rc_event(id="c", app_user_id="$RCAnonymousID:zzz"))

    logged = {r["event_id"]: r["event_type"] for r in supabase_db.rows("subscription_events")}
    assert logged == {"a": "INITIAL_PURCHASE", "b": "TEST", "c": "INITIAL_PURCHASE"}


def test_the_webhook_evicts_a_cached_entitlement_miss(client, supabase_db, webhook_secret):
    """The negative cache must never outlive a purchase — otherwise the user pays and
    still sees a paywall for up to a minute."""
    main._fallback_cache[USER_A] = (main.time.monotonic(), False)
    hook(client)
    assert USER_A not in main._fallback_cache


# ══ The RevenueCat fallback ═════════════════════════════════════════════════════

def test_the_gate_fails_closed_to_403_when_revenuecat_is_unreachable(
        client, premium_series, premium_on, monkeypatch):
    """Fail closed, but to a paywall the user can act on — never a 500, which renders
    as "Couldn't load this video" with no way forward."""
    monkeypatch.setattr(main, "REVENUECAT_API_KEY", "rc-key")
    monkeypatch.setattr(main, "httpx", _BoomHttpx())

    res = client.get("/lessons/l-prem/playback/", headers=v2())
    assert res.status_code == 403
    assert res.json()["code"] == "premium_required"


def test_entitlements_answers_false_when_revenuecat_is_unreachable(
        client, supabase_db, monkeypatch):
    """A status read is not a gate, so it degrades to "no" rather than erroring."""
    monkeypatch.setattr(main, "REVENUECAT_API_KEY", "rc-key")
    monkeypatch.setattr(main, "httpx", _BoomHttpx())

    res = client.get("/me/entitlements/", headers=auth(USER_A))
    assert res.status_code == 200
    assert res.json()["premium_active"] is False


def test_a_live_revenuecat_entitlement_is_honoured_after_a_local_miss(
        client, premium_series, premium_on, monkeypatch):
    """Closes the purchase->playback race, and means a misconfigured webhook degrades to
    a slow path instead of an invisible total outage."""
    monkeypatch.setattr(main, "REVENUECAT_API_KEY", "rc-key")
    monkeypatch.setattr(main, "httpx", _StubHttpx({
        "subscriber": {"entitlements": {"premium": {"expires_date": FUTURE}}}
    }))

    assert client.get("/lessons/l-prem/playback/", headers=v2()).status_code == 200


def test_a_denial_is_cached_so_repeated_taps_do_not_hammer_revenuecat(
        client, premium_series, premium_on, monkeypatch):
    stub = _StubHttpx({"subscriber": {"entitlements": {}}})
    monkeypatch.setattr(main, "REVENUECAT_API_KEY", "rc-key")
    monkeypatch.setattr(main, "httpx", stub)

    for _ in range(3):
        assert client.get("/lessons/l-prem/playback/", headers=v2()).status_code == 403
    assert stub.calls == 1


def test_the_fallback_is_skipped_entirely_without_an_api_key(client, premium_series, premium_on, monkeypatch):
    stub = _StubHttpx({"subscriber": {"entitlements": {}}})
    monkeypatch.setattr(main, "httpx", stub)
    assert client.get("/lessons/l-prem/playback/", headers=v2()).status_code == 403
    assert stub.calls == 0


class _StubResponse:
    def __init__(self, body):
        self._body = body

    def raise_for_status(self):
        return None

    def json(self):
        return self._body


class _StubHttpx:
    def __init__(self, body):
        self.body = body
        self.calls = 0

    def get(self, *a, **k):
        self.calls += 1
        return _StubResponse(self.body)


class _BoomHttpx:
    def get(self, *a, **k):
        raise TimeoutError("revenuecat unreachable")
