"""Shared fixtures.

Import order matters here: backend/main.py reads SUPABASE_URL / SUPABASE_KEY /
SUPABASE_JWT_SECRET at module scope, so the environment has to be set BEFORE the
import — hence the env writes at the top of this file rather than in a fixture.

Nothing here touches the real Supabase project: `supabase_db` swaps main.supabase for
the in-memory fake for the duration of each test.
"""

from __future__ import annotations

import datetime
import os
import sys
from pathlib import Path

import pytest

BACKEND_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND_DIR))

# Dummy credentials — create_client() only parses these, it makes no connection, and
# the client object is replaced by the fake before any test runs.
os.environ["SUPABASE_URL"] = "https://test.supabase.co"
os.environ["SUPABASE_KEY"] = "test-service-role-key"

JWT_SECRET = "test-jwt-secret-not-a-real-one"
os.environ["SUPABASE_JWT_SECRET"] = JWT_SECRET

import jwt  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

import main  # noqa: E402
from fake_supabase import FakeSupabase  # noqa: E402

USER_A = "11111111-1111-1111-1111-111111111111"
USER_B = "22222222-2222-2222-2222-222222222222"


def make_token(
    user_id: str = USER_A,
    *,
    secret: str = JWT_SECRET,
    audience: str = "authenticated",
    expires_in: int = 3600,
    algorithm: str = "HS256",
    include_sub: bool = True,
) -> str:
    """Mint a Supabase-shaped access token. Every knob a negative test needs to turn
    (wrong secret, wrong audience, already expired, missing subject) is a keyword."""
    now = datetime.datetime.now(datetime.timezone.utc)
    claims: dict = {
        "aud": audience,
        "role": "authenticated",
        "iss": "https://test.supabase.co/auth/v1",
        "iat": int((now - datetime.timedelta(seconds=60)).timestamp()),
        "exp": int((now + datetime.timedelta(seconds=expires_in)).timestamp()),
        "email": f"{user_id[:8]}@example.test",
    }
    if include_sub:
        claims["sub"] = user_id
    return jwt.encode(claims, secret, algorithm=algorithm)


def auth(user_id: str = USER_A, token: str | None = None) -> dict:
    """Authorization header for a user."""
    return {"Authorization": f"Bearer {token or make_token(user_id)}"}


@pytest.fixture
def supabase_db(monkeypatch) -> FakeSupabase:
    db = FakeSupabase()
    monkeypatch.setattr(main, "supabase", db)
    monkeypatch.setattr(main, "JWT_SECRET", JWT_SECRET)
    # Nothing may reach the real JWKS endpoint. Tests that exercise the asymmetric
    # path opt in explicitly via the `es256` fixture.
    monkeypatch.setattr(main, "_get_jwk_client", lambda: None)
    return db


# ── ES256 / JWKS — how this project actually signs tokens ───────────────────────
# The Supabase project's current JWT signing key is ECC P-256, so real access tokens
# are ES256 and are verified against the project's PUBLIC keys. These fixtures stand
# in for that: a throwaway keypair, plus a stub of PyJWKClient so no test touches the
# network.

class _StubSigningKey:
    def __init__(self, key):
        self.key = key


class _StubJWKClient:
    """Serves one public key, like a JWKS endpoint with a single active key."""

    def __init__(self, public_key, error: Exception | None = None):
        self.public_key = public_key
        self.error = error
        self.calls = 0

    def get_signing_key_from_jwt(self, token: str) -> _StubSigningKey:
        self.calls += 1
        if self.error:
            raise self.error
        return _StubSigningKey(self.public_key)


class ES256Fixture:
    def __init__(self, private_key, public_key, jwk_client):
        self.private_key = private_key
        self.public_key = public_key
        self.jwk_client = jwk_client

    def token(self, user_id: str = USER_A, *, key=None, **kwargs) -> str:
        """An ES256 access token shaped like Supabase's."""
        return make_token(user_id, secret=key or self.private_key, algorithm="ES256", **kwargs)


def _new_ec_key():
    from cryptography.hazmat.primitives.asymmetric import ec

    return ec.generate_private_key(ec.SECP256R1())


@pytest.fixture
def es256(monkeypatch, supabase_db) -> ES256Fixture:
    private_key = _new_ec_key()
    client = _StubJWKClient(private_key.public_key())
    monkeypatch.setattr(main, "_get_jwk_client", lambda: client)
    # The legacy shared secret is rotated out on the real project, so the realistic
    # configuration is no secret at all.
    monkeypatch.setattr(main, "JWT_SECRET", None)
    return ES256Fixture(private_key, private_key.public_key(), client)


@pytest.fixture
def other_ec_key():
    """A second keypair — an attacker's, or a key this project never published."""
    return _new_ec_key()


# ── Premium subscriptions ───────────────────────────────────────────────────────

WEBHOOK_SECRET = "test-revenuecat-webhook-secret"


@pytest.fixture(autouse=True)
def reset_premium_module_state(monkeypatch):
    """main.py holds process-wide state: the app_config cache, the RevenueCat lookup
    cache, and the two credentials read at import. Left alone, one test's flag flip or
    cached entitlement miss leaks into the next and suite ORDER starts to matter — the
    kind of bug that only shows up in CI. Reset before every test.

    Both credentials default to empty, so the safe posture (no RevenueCat fallback, and
    a webhook that refuses everything) is what a test gets unless it opts in."""
    monkeypatch.setattr(main, "_app_config_cache", None)
    monkeypatch.setattr(main, "_fallback_cache", {})
    monkeypatch.setattr(main, "REVENUECAT_API_KEY", "")
    monkeypatch.setattr(main, "REVENUECAT_WEBHOOK_AUTH", "")


@pytest.fixture
def webhook_secret(monkeypatch) -> str:
    """Configure the webhook receiver. Without this the route 503s by design."""
    monkeypatch.setattr(main, "REVENUECAT_WEBHOOK_AUTH", WEBHOOK_SECRET)
    return WEBHOOK_SECRET


@pytest.fixture
def premium_on(supabase_db):
    """Flip the server-side kill switch on. Off is the default everywhere, matching how
    this ships: release 1 goes out dark."""
    supabase_db.seed("app_config", {"key": "premium_enabled", "value": "true"})
    main._app_config_cache = None
    return supabase_db


def v2(user_id: str = USER_A, features: str = "premium") -> dict:
    """Headers for a v2+ build: authenticated AND advertising the premium capability.

    The distinction between this and plain auth() is the whole backward-compatibility
    story — auth() is the binary already in the App Store."""
    return {**auth(user_id), "X-Client-Features": features}


@pytest.fixture
def client(supabase_db) -> TestClient:
    # raise_server_exceptions=False so an unexpected 500 surfaces as a failed
    # assertion on the response rather than a raw traceback out of the test client.
    return TestClient(main.app, raise_server_exceptions=False)


@pytest.fixture
def current_month() -> str:
    """The real-world month name. Several code paths branch on 'is this the current
    month?' (live tithe setting vs frozen per-row snapshot), so tests that exercise
    the live path must use this rather than a hardcoded month."""
    return datetime.datetime.now().strftime("%B")


@pytest.fixture
def past_month(current_month: str) -> str:
    """A month that is definitely not the current one — for the snapshot path."""
    return "January" if current_month != "January" else "February"


@pytest.fixture
def anon_key_token() -> str:
    """A Supabase ANON key: a real HS256 JWT signed with the SAME project secret, but
    with role='anon', no `sub`, and aud absent. It ships inside the app binary, so
    every user has one — it must never be accepted as a bearer token."""
    return jwt.encode(
        {"iss": "supabase", "ref": "vbvsblpyeylnemrecyqv", "role": "anon",
         "iat": 1776643822, "exp": 2092219822},
        JWT_SECRET,
        algorithm="HS256",
    )
