"""An in-memory stand-in for the Supabase client used by backend/main.py.

Why: the whole point of the test suite is to prove that user A can never touch user
B's data. Running that against the real project would mean creating and deleting real
accounts and real financial rows with the service_role key — exactly the blast radius
we're trying to prove is closed. So the suite runs fully offline against this fake.

Scope: only what main.py actually calls. That is the PostgREST query-builder chain
(`table().select().eq().neq().in_().limit().order().execute()`, plus insert / update /
delete / upsert), `auth.get_user`, `auth.admin.delete_user`, and
`storage.from_().create_signed_url()`. Filters are ANDed, mirroring PostgREST.

The fake stores plain dicts in `db.tables[name]`, assigns integer ids, and stamps
`created_at`, so tests can assert on rows directly.
"""

from __future__ import annotations

import datetime
import itertools
from typing import Any, Optional


# Column defaults the real schema applies on INSERT. Without these the fake would
# diverge from Postgres in ways that mask bugs — e.g. POST /savings/goal/ never sends
# `completed`, and the Goals tab lists goals with `.eq("completed", False)`, so a goal
# created through the API would silently vanish from the list. Only applied when the
# key is ABSENT: an explicit None stays None, exactly as inserting NULL does.
COLUMN_DEFAULTS: dict[str, dict[str, Any]] = {
    "savings_goals": {
        "completed": False,
        "is_general": False,
        "is_reconciliation": False,
        "goal_type": "saving",
    },
    "savings_transactions": {"source": "income", "goal_id": None, "transfer_group": None},
    "income": {"tithe_enabled": False, "tithe_rate": 0.10, "budget_type": "balanced"},
    "user_settings": {
        "tithe_enabled": False,
        "tithe_rate": 0.10,
        "budget_type": "balanced",
        "firm_foundation_goals_prompted": False,
    },
    "month_status": {"closed_at": None},
    "lesson_series": {"is_published": False, "sort_order": 0},
    "lessons": {"sort_order": 0, "video_provider": "supabase"},
}


def _project(row: dict, columns: Optional[list[str]]) -> dict:
    """Mimic PostgREST returning only the requested columns.

    This matters beyond tidiness: the lesson routes deliberately select around
    `video_id` so the app never receives a path into the private video bucket. Without
    projection the fake would hand it over and the test asserting otherwise would be
    worthless."""
    if columns is None:
        return dict(row)
    return {c: row.get(c) for c in columns if c in row}


class FakeResponse:
    def __init__(self, data: list):
        self.data = data


class FakeUser:
    def __init__(self, user_id: str):
        self.id = user_id


class FakeGetUserResponse:
    def __init__(self, user: Optional[FakeUser]):
        self.user = user


class _Query:
    """One PostgREST request under construction. Terminal op is execute()."""

    def __init__(self, db: "FakeSupabase", table: str, op: str, payload: Any = None,
                 columns: Optional[list[str]] = None):
        self.db = db
        self.table = table
        self.op = op          # select | insert | update | delete | upsert
        self.payload = payload
        self.columns = columns  # None = all columns ("*")
        self.filters: list[tuple[str, str, Any]] = []
        self._limit: Optional[int] = None
        self._order: Optional[tuple[str, bool]] = None

    # ── filters (chainable) ──────────────────────────────────────────────────
    def eq(self, col: str, val: Any) -> "_Query":
        self.filters.append(("eq", col, val))
        return self

    def neq(self, col: str, val: Any) -> "_Query":
        self.filters.append(("neq", col, val))
        return self

    def in_(self, col: str, vals: list) -> "_Query":
        self.filters.append(("in", col, list(vals)))
        return self

    def limit(self, n: int) -> "_Query":
        self._limit = n
        return self

    def order(self, col: str, desc: bool = False) -> "_Query":
        self._order = (col, desc)
        return self

    # ── evaluation ───────────────────────────────────────────────────────────
    def _matches(self, row: dict) -> bool:
        for kind, col, val in self.filters:
            actual = row.get(col)
            if kind == "eq" and actual != val:
                return False
            if kind == "neq" and actual == val:
                return False
            if kind == "in" and actual not in val:
                return False
        return True

    def _rows(self) -> list[dict]:
        return self.db.tables.setdefault(self.table, [])

    def execute(self) -> FakeResponse:
        self.db.calls.append((self.op, self.table))
        rows = self._rows()

        if self.op == "select":
            out = [r for r in rows if self._matches(r)]
            if self._order:
                col, desc = self._order
                # None sorts last ascending / first descending, as in Postgres.
                out = sorted(out, key=lambda r: (r.get(col) is None, r.get(col)), reverse=desc)
            if self._limit is not None:
                out = out[: self._limit]
            # Copies: callers must not be able to mutate the store by accident.
            return FakeResponse([_project(r, self.columns) for r in out])

        if self.op == "insert":
            items = self.payload if isinstance(self.payload, list) else [self.payload]
            created = []
            for item in items:
                row = dict(item)
                for col, default in COLUMN_DEFAULTS.get(self.table, {}).items():
                    row.setdefault(col, default)
                row.setdefault("id", self.db.next_id(self.table))
                row.setdefault("created_at", self.db.next_timestamp())
                rows.append(row)
                created.append(dict(row))
            return FakeResponse(created)

        if self.op == "update":
            updated = []
            for row in rows:
                if self._matches(row):
                    row.update(self.payload)
                    updated.append(dict(row))
            return FakeResponse(updated)

        if self.op == "delete":
            kept, removed = [], []
            for row in rows:
                (removed if self._matches(row) else kept).append(row)
            self.db.tables[self.table] = kept
            return FakeResponse([dict(r) for r in removed])

        if self.op == "upsert":
            # main.py upserts month_status keyed by (user_id, month).
            item = dict(self.payload)
            for col, default in COLUMN_DEFAULTS.get(self.table, {}).items():
                item.setdefault(col, default)
            key = ("user_id", "month")
            for row in rows:
                if all(row.get(k) == item.get(k) for k in key):
                    row.update(item)
                    return FakeResponse([dict(row)])
            item.setdefault("id", self.db.next_id(self.table))
            item.setdefault("created_at", self.db.next_timestamp())
            rows.append(item)
            return FakeResponse([dict(item)])

        raise AssertionError(f"Unsupported op {self.op!r}")


class _Table:
    def __init__(self, db: "FakeSupabase", name: str):
        self.db = db
        self.name = name

    def select(self, *cols: str) -> _Query:
        # main.py passes one comma-separated string, PostgREST-style: select("a, b").
        joined = ",".join(cols)
        columns = None if not joined.strip() or "*" in joined else [
            c.strip() for c in joined.split(",") if c.strip()
        ]
        return _Query(self.db, self.name, "select", columns=columns)

    def insert(self, payload: Any) -> _Query:
        return _Query(self.db, self.name, "insert", payload)

    def update(self, payload: dict) -> _Query:
        return _Query(self.db, self.name, "update", payload)

    def delete(self) -> _Query:
        return _Query(self.db, self.name, "delete")

    def upsert(self, payload: dict) -> _Query:
        return _Query(self.db, self.name, "upsert", payload)


class _AdminAuth:
    def __init__(self, db: "FakeSupabase"):
        self.db = db

    def delete_user(self, user_id: str):
        # Recorded rather than enacted: the security tests assert on exactly WHICH
        # id reached this call — that is the "can't nuke another user's account" test.
        self.db.deleted_auth_users.append(user_id)
        return {"id": user_id}


class _Auth:
    def __init__(self, db: "FakeSupabase"):
        self.db = db
        self.admin = _AdminAuth(db)

    def get_user(self, token: str) -> FakeGetUserResponse:
        """Remote token verification. The fake honours a registry of tokens the test
        has explicitly declared valid; everything else resolves to no user, which is
        how a real rejected token behaves."""
        self.db.remote_verify_calls.append(token)
        user_id = self.db.remote_tokens.get(token)
        return FakeGetUserResponse(FakeUser(user_id) if user_id else None)


class _Bucket:
    def __init__(self, db: "FakeSupabase", bucket: str):
        self.db = db
        self.bucket = bucket

    def create_signed_url(self, path: str, ttl: int) -> dict:
        self.db.signed_urls.append((self.bucket, path, ttl))
        return {"signedURL": f"https://storage.test/{self.bucket}/{path}?token=signed"}


class _Storage:
    def __init__(self, db: "FakeSupabase"):
        self.db = db

    def from_(self, bucket: str) -> _Bucket:
        return _Bucket(self.db, bucket)


class FakeSupabase:
    def __init__(self):
        self.tables: dict[str, list[dict]] = {}
        self.calls: list[tuple[str, str]] = []
        self.deleted_auth_users: list[str] = []
        self.remote_tokens: dict[str, str] = {}   # token -> user_id (remote verify)
        self.remote_verify_calls: list[str] = []
        self.signed_urls: list[tuple[str, str, int]] = []
        self.auth = _Auth(self)
        self.storage = _Storage(self)
        self._ids = itertools.count(1)
        self._clock = itertools.count(0)

    def table(self, name: str) -> _Table:
        return _Table(self, name)

    # ── helpers for tests ────────────────────────────────────────────────────
    def next_id(self, _table: str) -> int:
        return next(self._ids)

    def next_timestamp(self) -> str:
        # Monotonic and distinct so `order("created_at", desc=True)` is deterministic.
        base = datetime.datetime(2026, 1, 1, tzinfo=datetime.timezone.utc)
        return (base + datetime.timedelta(seconds=next(self._clock))).isoformat()

    def rows(self, table: str) -> list[dict]:
        return self.tables.setdefault(table, [])

    def seed(self, table: str, row: dict) -> dict:
        """Put a pre-existing row in the store, applying the same column defaults an
        INSERT would, so seeded rows behave like rows the app itself wrote."""
        stored = dict(row)
        for col, default in COLUMN_DEFAULTS.get(table, {}).items():
            stored.setdefault(col, default)
        stored.setdefault("id", self.next_id(table))
        stored.setdefault("created_at", self.next_timestamp())
        self.rows(table).append(stored)
        return dict(stored)
