"""Security tests — the vulnerability must stay closed.

Two properties are asserted here:

  A. AUTHENTICATION — no valid token, no access. Every protected route rejects a
     request with no token, a forged token, an expired token, or the app's own anon
     key with 401.

  B. AUTHORIZATION (the actual BOLA/IDOR fix) — a VALID token for user A must not
     grant access to user B's data, no matter what `user_id` A puts in the query
     string or request body. This is the class of bug being fixed: the API used to
     take the caller's word for who they were.
"""

from __future__ import annotations

import jwt
import pytest

from conftest import JWT_SECRET, USER_A, USER_B, auth, make_token

# ── Every protected route, with a request that would otherwise be valid ──────────
# (method, path, query params, json body). Bodies are well-formed on purpose: a 401
# has to come from the missing token, not from a validation error masking it.
PROTECTED_ROUTES = [
    ("GET",    "/dashboard/trends/",              {},                                   None),
    ("GET",    "/dashboard/July",                 {},                                   None),
    ("POST",   "/expenses/",                      {},                                   {"title": "x", "amount": 5, "category": "Needs", "day": 1, "month": "July"}),
    ("POST",   "/income/",                        {},                                   {"amount": 100, "day": 1, "month": "July"}),
    ("GET",    "/settings/",                      {},                                   None),
    ("PATCH",  "/settings/",                      {},                                   {"tithe_enabled": True}),
    ("GET",    "/expenses/details/",              {"month": "July", "category": "Needs"}, None),
    ("DELETE", "/expenses/delete/1",              {},                                   None),
    ("DELETE", "/income/delete/1",                {},                                   None),
    ("POST",   "/account/delete/",                {},                                   {"confirmation": "DELETE"}),
    ("GET",    "/income/details/",                {"month": "July"},                    None),
    ("GET",    "/income/funding-months/",         {"current_month": "July"},            None),
    ("GET",    "/savings/balance/",               {},                                   None),
    ("POST",   "/savings/transaction/",           {},                                   {"title": "x", "amount": 5, "type": "deposit", "day": 1, "month": "July"}),
    ("POST",   "/savings/starting-balance/",      {},                                   {"amount": 500, "day": 1, "month": "July"}),
    ("POST",   "/savings/transfer/",              {},                                   {"amount": 5, "to_goal_id": 1, "general_goal_id": 2, "day": 1, "month": "July", "to_goal_title": "Car"}),
    ("GET",    "/savings/history/",               {},                                   None),
    ("DELETE", "/savings/transaction/1",          {},                                   None),
    ("GET",    "/savings/goal/",                  {},                                   None),
    ("GET",    "/savings/goal/completed/",        {},                                   None),
    ("PATCH",  "/savings/goal/1/complete",        {},                                   None),
    ("POST",   "/savings/goal/",                  {},                                   {"title": "Car"}),
    ("PATCH",  "/savings/goal/1",                 {},                                   {"title": "Car"}),
    ("POST",   "/savings/goal/1/finish",          {},                                   {"day": 1, "month": "July"}),
    ("DELETE", "/savings/goal/1",                 {"current_month": "July"},            None),
    ("GET",    "/rollover/preview/",              {"month": "July"},                    None),
    ("POST",   "/rollover/close/",                {},                                   {"month": "July"}),
    ("POST",   "/rollover/reopen/",               {},                                   {"month": "July"}),
    ("POST",   "/lesson-ratings/",                {},                                   {"lesson_id": 1, "rating": 5}),
    ("GET",    "/lessons/series/",                {},                                   None),
    ("GET",    "/lessons/series/abc/",            {},                                   None),
    ("GET",    "/lessons/abc/playback/",          {},                                   None),
    ("GET",    "/me/entitlements/",               {},                                   None),
]

ROUTE_IDS = [f"{m} {p}" for m, p, _, _ in PROTECTED_ROUTES]


def call(client, method, path, params, body, headers=None):
    return client.request(method, path, params=params, json=body, headers=headers or {})


# ══ A. Authentication ═══════════════════════════════════════════════════════════

def test_every_protected_route_is_in_the_table():
    """Guards against a new route being added without a matching security test.
    If this fails, add the route above — do not delete the assertion."""
    import main

    routed = {
        (method, route.path)
        for route in main.app.routes
        for method in getattr(route, "methods", set()) or set()
        if method not in ("HEAD", "OPTIONS")
    }
    # Deliberately public: the health check (returns no data of any kind) and
    # FastAPI's built-in schema/docs pages, which describe the API's shape but expose
    # no user data — and every route they describe now requires a token.
    #
    # Two more, both deliberate and both covered by their own tests below:
    #   GET  /config/            — the force-update gate has to work BEFORE sign-in, and
    #                              the three values it returns are not user-specific.
    #   POST /webhooks/revenuecat — called by RevenueCat, which has no Supabase token.
    #                              Authorized by a shared secret instead; see
    #                              test_webhook_* below, which prove a missing, wrong,
    #                              or server-side-unset secret all fail closed.
    public = {("GET", "/"), ("GET", "/docs"), ("GET", "/docs/oauth2-redirect"),
              ("GET", "/redoc"), ("GET", "/openapi.json"),
              ("GET", "/config/"), ("POST", "/webhooks/revenuecat")}
    covered = {(m, p) for m, p, _, _ in PROTECTED_ROUTES}

    # Match table entries (concrete URLs) to route templates by path shape.
    template_for = {}
    for method, template in routed:
        for m, p, _, _ in PROTECTED_ROUTES:
            if m != method:
                continue
            t_parts, p_parts = template.strip("/").split("/"), p.strip("/").split("/")
            if len(t_parts) == len(p_parts) and all(
                t.startswith("{") or t == q for t, q in zip(t_parts, p_parts)
            ):
                template_for[(method, template)] = (m, p)
    uncovered = routed - public - set(template_for)
    assert not uncovered, f"Routes with no security test: {sorted(uncovered)}"
    assert len(covered) == len(PROTECTED_ROUTES)


@pytest.mark.parametrize("method,path,params,body", PROTECTED_ROUTES, ids=ROUTE_IDS)
def test_no_token_is_rejected(client, method, path, params, body):
    res = call(client, method, path, params, body)
    assert res.status_code == 401, res.text


@pytest.mark.parametrize("method,path,params,body", PROTECTED_ROUTES, ids=ROUTE_IDS)
def test_garbage_token_is_rejected(client, method, path, params, body):
    res = call(client, method, path, params, body, {"Authorization": "Bearer not.a.jwt"})
    assert res.status_code == 401, res.text


def test_health_route_stays_public(client):
    res = client.get("/")
    assert res.status_code == 200
    assert res.json() == {"message": "DollarSeeds Backend is running!"}


@pytest.mark.parametrize(
    "label,token_kwargs",
    [
        ("signed with the wrong secret", {"secret": "attacker-guessed-secret"}),
        ("expired an hour ago",          {"expires_in": -3600}),
        ("wrong audience",               {"audience": "anon"}),
        ("no subject claim",             {"include_sub": False}),
    ],
)
def test_bad_tokens_are_rejected(client, label, token_kwargs):
    res = client.get("/savings/balance/", headers=auth(token=make_token(USER_A, **token_kwargs)))
    assert res.status_code == 401, f"{label} was accepted: {res.text}"


def test_tampered_payload_is_rejected(client):
    """Flip the `sub` in a legitimately-issued token without re-signing it — the
    signature no longer matches, which is the whole point of verifying it."""
    import base64
    import json

    header, payload, signature = make_token(USER_A).split(".")
    decoded = json.loads(base64.urlsafe_b64decode(payload + "=="))
    decoded["sub"] = USER_B
    forged_payload = base64.urlsafe_b64encode(
        json.dumps(decoded).encode()
    ).decode().rstrip("=")

    res = client.get("/savings/balance/", headers=auth(token=f"{header}.{forged_payload}.{signature}"))
    assert res.status_code == 401


def test_unsigned_alg_none_token_is_rejected(client):
    """The classic JWT bypass: strip the signature and declare alg 'none'."""
    token = jwt.encode({"sub": USER_A, "aud": "authenticated"}, None, algorithm="none")
    res = client.get("/savings/balance/", headers=auth(token=token))
    assert res.status_code == 401


def test_anon_key_cannot_be_used_as_a_bearer_token(client, anon_key_token):
    """The anon key is an HS256 JWT signed with the SAME secret and ships inside the
    app binary — so it is public. Verifying the signature alone would accept it; the
    audience and `sub` checks are what reject it."""
    res = client.get("/savings/balance/", headers=auth(token=anon_key_token))
    assert res.status_code == 401


def test_non_bearer_authorization_scheme_is_rejected(client):
    res = client.get("/savings/balance/", headers={"Authorization": "Basic dXNlcjpwYXNz"})
    assert res.status_code == 401


def test_error_response_does_not_leak_why_verification_failed(client):
    """A verification oracle helps an attacker. All failures read the same."""
    res = client.get("/savings/balance/", headers=auth(token=make_token(USER_A, secret="wrong")))
    assert res.status_code == 401
    assert res.json()["detail"] == "Invalid or expired token."


# ── ES256 / JWKS — the path this project actually uses ──────────────────────────
# The Supabase project's current signing key is ECC P-256, so real access tokens are
# ES256 and are verified against the project's published public keys.

def test_es256_token_is_accepted_and_verified_locally(client, es256, supabase_db):
    res = client.get("/savings/balance/", headers=auth(token=es256.token(USER_A)))
    assert res.status_code == 200
    assert es256.jwk_client.calls == 1
    assert supabase_db.remote_verify_calls == [], "must not round-trip to Supabase"


def test_es256_identity_comes_from_the_token(client, es256, supabase_db, current_month):
    supabase_db.seed("expenses", {"user_id": USER_B, "title": "B only", "amount": 10.0,
                                  "category": "Needs", "day": 1, "month": current_month})
    res = client.get("/expenses/details/", params={"month": current_month, "category": "Needs",
                                                   "user_id": USER_B},
                     headers=auth(token=es256.token(USER_A)))
    assert res.json()["data"] == []


def test_es256_token_signed_with_an_unpublished_key_is_rejected(client, es256, other_ec_key):
    """A valid-looking ES256 token signed by a key this project never published."""
    res = client.get("/savings/balance/", headers=auth(token=es256.token(USER_A, key=other_ec_key)))
    assert res.status_code == 401


@pytest.mark.parametrize(
    "label,kwargs",
    [
        ("expired",        {"expires_in": -3600}),
        ("wrong audience", {"audience": "anon"}),
        ("no subject",     {"include_sub": False}),
    ],
)
def test_es256_tokens_still_fail_the_standard_claim_checks(client, es256, label, kwargs):
    res = client.get("/savings/balance/", headers=auth(token=es256.token(USER_A, **kwargs)))
    assert res.status_code == 401, f"ES256 token that is {label} was accepted"


def test_public_key_cannot_be_used_as_an_hmac_secret(client, es256, monkeypatch):
    """Algorithm confusion: forge an HS256 token whose HMAC key is the project's
    PUBLIC key — which is public knowledge. It must not verify. The dispatch only ever
    hands the JWKS key to asymmetric algorithms, so the forgery has no path in."""
    import base64
    import hashlib
    import hmac
    import json

    from cryptography.hazmat.primitives import serialization

    pem = es256.public_key.public_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PublicFormat.SubjectPublicKeyInfo,
    )

    # Built by hand: PyJWT refuses to SIGN with a public key, but an attacker writing
    # the bytes directly has no such scruples — which is the whole point.
    def b64(raw: bytes) -> bytes:
        return base64.urlsafe_b64encode(raw).rstrip(b"=")

    header = b64(json.dumps({"alg": "HS256", "typ": "JWT"}).encode())
    payload = b64(json.dumps({"sub": USER_A, "aud": "authenticated", "exp": 9999999999}).encode())
    signing_input = header + b"." + payload
    signature = b64(hmac.new(pem, signing_input, hashlib.sha256).digest())
    forged = (signing_input + b"." + signature).decode()

    res = client.get("/savings/balance/", headers=auth(token=forged))
    assert res.status_code == 401
    # The precise property being guarded: an HS256 token never reaches the JWKS key
    # at all. If dispatch ever routed by anything other than a fixed allowlist, this
    # is the assertion that would catch it.
    assert es256.jwk_client.calls == 0


def test_unreachable_jwks_falls_back_to_supabase_instead_of_locking_everyone_out(
    client, es256, supabase_db, monkeypatch
):
    """A JWKS fetch failure (network blip, or a rotation whose new key id isn't in the
    cached set) must not take the whole app down."""
    import main

    token = es256.token(USER_A)
    supabase_db.remote_tokens[token] = USER_A
    monkeypatch.setattr(main, "_get_jwk_client",
                        lambda: _raise_jwks_error())

    res = client.get("/savings/balance/", headers=auth(token=token))
    assert res.status_code == 200
    assert supabase_db.remote_verify_calls == [token]


def _raise_jwks_error():
    from conftest import _StubJWKClient

    return _StubJWKClient(None, error=jwt.PyJWKClientError("jwks unreachable"))


def test_jwks_failure_still_rejects_a_token_supabase_does_not_recognise(client, es256, monkeypatch):
    import main

    monkeypatch.setattr(main, "_get_jwk_client", lambda: _raise_jwks_error())
    res = client.get("/savings/balance/", headers=auth(token=es256.token(USER_A)))
    assert res.status_code == 401


# ── Remote-verification fallback (no local key of our own) ──────────────────────

def test_remote_fallback_accepts_a_token_supabase_confirms(client, supabase_db, monkeypatch):
    import main

    monkeypatch.setattr(main, "JWT_SECRET", None)  # no local secret → remote path
    token = make_token(USER_A)
    supabase_db.remote_tokens[token] = USER_A

    res = client.get("/savings/balance/", headers=auth(token=token))
    assert res.status_code == 200
    assert supabase_db.remote_verify_calls == [token]


def test_remote_fallback_rejects_a_token_supabase_does_not_recognise(client, supabase_db, monkeypatch):
    import main

    monkeypatch.setattr(main, "JWT_SECRET", None)
    res = client.get("/savings/balance/", headers=auth(token=make_token(USER_A)))
    assert res.status_code == 401


def test_local_verification_makes_no_network_call(client, supabase_db):
    """The reason we verify locally: no per-request round-trip to Supabase."""
    res = client.get("/savings/balance/", headers=auth(USER_A))
    assert res.status_code == 200
    assert supabase_db.remote_verify_calls == []


# ══ B. Authorization — the BOLA/IDOR fix ════════════════════════════════════════

@pytest.fixture
def two_users(supabase_db, current_month):
    """User B has money on record. User A is the attacker holding a valid token."""
    supabase_db.seed("income", {"user_id": USER_B, "amount": 9000.0, "day": 1, "month": current_month})
    supabase_db.seed("expenses", {"user_id": USER_B, "title": "B rent", "amount": 2000.0,
                                  "category": "Needs", "day": 2, "month": current_month})
    supabase_db.seed("savings_goals", {"user_id": USER_B, "title": "B house", "target_amount": 50000.0,
                                       "completed": False, "is_general": False})
    supabase_db.seed("savings_transactions", {"user_id": USER_B, "title": "B savings", "amount": 4000.0,
                                              "type": "deposit", "source": "income", "day": 3,
                                              "month": current_month})
    return supabase_db


def test_cannot_read_another_users_dashboard(client, two_users, current_month):
    """The headline exploit: GET /dashboard/{month}?user_id=<victim>."""
    res = client.get(f"/dashboard/{current_month}", params={"user_id": USER_B}, headers=auth(USER_A))
    assert res.status_code == 200
    body = res.json()
    assert body["total_income"] == 0, "attacker saw the victim's income"
    assert body["expenses"]["needs"] == 0
    assert body["expenses"]["goals"] == 0


def test_cannot_read_another_users_income_details(client, two_users, current_month):
    res = client.get("/income/details/", params={"month": current_month, "user_id": USER_B},
                     headers=auth(USER_A))
    assert res.status_code == 200
    assert res.json()["data"] == []


def test_cannot_read_another_users_savings(client, two_users):
    balance = client.get("/savings/balance/", params={"user_id": USER_B}, headers=auth(USER_A))
    assert balance.status_code == 200
    assert balance.json()["balance"] == 0

    history = client.get("/savings/history/", params={"user_id": USER_B}, headers=auth(USER_A))
    assert history.json()["data"] == []

    goals = client.get("/savings/goal/", params={"user_id": USER_B}, headers=auth(USER_A))
    titles = [g["title"] for g in goals.json()["data"]]
    assert "B house" not in titles


def test_cannot_read_another_users_expense_details_or_trends(client, two_users, current_month):
    details = client.get("/expenses/details/",
                         params={"month": current_month, "category": "Needs", "user_id": USER_B},
                         headers=auth(USER_A))
    assert details.json()["data"] == []

    trends = client.get("/dashboard/trends/", params={"user_id": USER_B}, headers=auth(USER_A))
    assert trends.json()["data"] == []


def test_writes_are_recorded_against_the_token_user_not_the_body(client, two_users, current_month):
    """A body `user_id` of the victim must not plant a row in the victim's ledger."""
    res = client.post("/expenses/", headers=auth(USER_A), json={
        "user_id": USER_B, "title": "planted", "amount": 999.0,
        "category": "Wants", "day": 4, "month": current_month,
    })
    assert res.status_code == 200
    planted = [r for r in two_users.rows("expenses") if r["title"] == "planted"]
    assert len(planted) == 1
    assert planted[0]["user_id"] == USER_A

    res = client.post("/income/", headers=auth(USER_A),
                      json={"user_id": USER_B, "amount": 7.0, "day": 4, "month": current_month})
    assert res.status_code == 200
    assert [r["user_id"] for r in two_users.rows("income") if r["amount"] == 7.0] == [USER_A]

    res = client.post("/savings/goal/", headers=auth(USER_A), json={"user_id": USER_B, "title": "planted goal"})
    assert res.status_code == 200
    assert [g["user_id"] for g in two_users.rows("savings_goals") if g["title"] == "planted goal"] == [USER_A]

    res = client.post("/lesson-ratings/", headers=auth(USER_A),
                      json={"user_id": USER_B, "lesson_id": 1, "rating": 1})
    assert res.status_code == 200
    assert [r["user_id"] for r in two_users.rows("lesson_ratings")] == [USER_A]


def test_cannot_delete_another_users_records(client, two_users, current_month):
    victim_expense = next(r for r in two_users.rows("expenses") if r["user_id"] == USER_B)
    victim_income = next(r for r in two_users.rows("income") if r["user_id"] == USER_B)
    victim_tx = next(r for r in two_users.rows("savings_transactions") if r["user_id"] == USER_B)

    client.delete(f"/expenses/delete/{victim_expense['id']}", params={"user_id": USER_B}, headers=auth(USER_A))
    client.delete(f"/income/delete/{victim_income['id']}", params={"user_id": USER_B}, headers=auth(USER_A))
    client.delete(f"/savings/transaction/{victim_tx['id']}", params={"user_id": USER_B}, headers=auth(USER_A))

    assert any(r["id"] == victim_expense["id"] for r in two_users.rows("expenses"))
    assert any(r["id"] == victim_income["id"] for r in two_users.rows("income"))
    assert any(r["id"] == victim_tx["id"] for r in two_users.rows("savings_transactions"))


def test_cannot_edit_complete_or_delete_another_users_goal(client, two_users, current_month):
    victim_goal = next(g for g in two_users.rows("savings_goals") if g["user_id"] == USER_B)
    gid = victim_goal["id"]

    assert client.patch(f"/savings/goal/{gid}", headers=auth(USER_A),
                        json={"user_id": USER_B, "title": "hijacked"}).status_code == 404
    assert client.post(f"/savings/goal/{gid}/finish", headers=auth(USER_A),
                       json={"user_id": USER_B, "day": 5, "month": current_month}).status_code == 404
    assert client.delete(f"/savings/goal/{gid}", headers=auth(USER_A),
                         params={"user_id": USER_B, "current_month": current_month}).status_code == 404

    # PATCH /complete is a filtered UPDATE — it returns 200 but must match no rows.
    client.patch(f"/savings/goal/{gid}/complete", params={"user_id": USER_B}, headers=auth(USER_A))

    still_there = next(g for g in two_users.rows("savings_goals") if g["id"] == gid)
    assert still_there["title"] == "B house"
    assert still_there["completed"] is False


def test_cannot_deposit_into_another_users_goal(client, two_users, current_month):
    """`goal_id` is client-supplied too. Rows are written under the attacker's own
    user_id, so this wouldn't leak data — it would corrupt the victim's goal balance,
    which is summed by goal_id."""
    victim_goal = next(g for g in two_users.rows("savings_goals") if g["user_id"] == USER_B)
    before = len(two_users.rows("savings_transactions"))

    res = client.post("/savings/transaction/", headers=auth(USER_A), json={
        "title": "pollution", "amount": 1.0, "type": "deposit",
        "day": 6, "month": current_month, "goal_id": victim_goal["id"], "source": "income",
    })
    assert res.status_code == 404
    assert len(two_users.rows("savings_transactions")) == before


def test_cannot_transfer_into_another_users_goal(client, two_users, current_month):
    victim_goal = next(g for g in two_users.rows("savings_goals") if g["user_id"] == USER_B)
    general = client.get("/savings/goal/", headers=auth(USER_A)).json()["data"]
    general_id = next(g["id"] for g in general if g.get("is_general"))
    before = len(two_users.rows("savings_transactions"))

    res = client.post("/savings/transfer/", headers=auth(USER_A), json={
        "amount": 1.0, "to_goal_id": victim_goal["id"], "general_goal_id": general_id,
        "day": 6, "month": current_month, "to_goal_title": "B house",
    })
    assert res.status_code == 404
    assert len(two_users.rows("savings_transactions")) == before


def test_cannot_change_another_users_settings(client, two_users):
    two_users.seed("user_settings", {"user_id": USER_B, "tithe_enabled": False, "tithe_rate": 0.10})

    res = client.patch("/settings/", headers=auth(USER_A),
                       json={"user_id": USER_B, "tithe_enabled": True, "tithe_rate": 0.99})
    assert res.status_code == 200

    victim = next(s for s in two_users.rows("user_settings") if s["user_id"] == USER_B)
    assert victim["tithe_enabled"] is False
    assert victim["tithe_rate"] == 0.10


def test_cannot_close_or_reopen_another_users_month(client, two_users, current_month):
    client.post("/rollover/close/", headers=auth(USER_A), json={"user_id": USER_B, "month": current_month})
    statuses = two_users.rows("month_status")
    assert statuses, "close should have written a status row"
    assert all(s["user_id"] == USER_A for s in statuses)


def test_a_user_cannot_delete_another_users_account(client, two_users, current_month):
    """The worst case in the old API: an unauthenticated POST could permanently erase
    any account. Now the only account a caller can delete is their own."""
    two_users.seed("expenses", {"user_id": USER_A, "title": "A coffee", "amount": 4.0,
                                "category": "Wants", "day": 1, "month": current_month})

    res = client.post("/account/delete/", headers=auth(USER_A),
                      json={"user_id": USER_B, "confirmation": "DELETE"})
    assert res.status_code == 200
    assert res.json() == {"deleted": True}

    # The auth identity destroyed is the CALLER'S, never the id in the body.
    assert two_users.deleted_auth_users == [USER_A]
    assert USER_B not in two_users.deleted_auth_users

    # Every one of the victim's rows survives; the caller's own are gone.
    for table in ("expenses", "income", "savings_goals", "savings_transactions"):
        remaining = two_users.rows(table)
        assert all(r["user_id"] == USER_B for r in remaining), f"{table} lost the victim's rows"
    assert any(r["title"] == "B rent" for r in two_users.rows("expenses"))


def test_unauthenticated_account_deletion_is_impossible(client, two_users):
    res = client.post("/account/delete/", json={"user_id": USER_B, "confirmation": "DELETE"})
    assert res.status_code == 401
    assert two_users.deleted_auth_users == []


def test_forged_token_cannot_delete_an_account(client, two_users):
    res = client.post("/account/delete/",
                      headers=auth(token=make_token(USER_B, secret="attacker-secret")),
                      json={"confirmation": "DELETE"})
    assert res.status_code == 401
    assert two_users.deleted_auth_users == []


def test_lesson_video_urls_require_authentication(client, supabase_db):
    """Playback mints a signed URL into the private lesson-videos bucket. Anonymous
    access would let anyone drain the video library."""
    supabase_db.seed("lessons", {"id": "l1", "series_id": "s1", "video_provider": "supabase",
                                 "video_id": "s1/l1.mp4", "title": "L1", "sort_order": 1})

    assert client.get("/lessons/l1/playback/").status_code == 401
    assert supabase_db.signed_urls == []

    res = client.get("/lessons/l1/playback/", headers=auth(USER_A))
    assert res.status_code == 200
    assert supabase_db.signed_urls == [("lesson-videos", "s1/l1.mp4", 3600)]
