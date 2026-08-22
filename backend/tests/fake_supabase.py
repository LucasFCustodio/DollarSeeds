"""An in-memory stand-in for the Supabase client used by backend/main.py.

Why: the whole point of the test suite is to prove that user A can never touch user
B's data. Running that against the real project would mean creating and deleting real
accounts and real financial rows with the service_role key — exactly the blast radius
we're trying to prove is closed. So the suite runs fully offline against this fake.

Scope: only what main.py actually calls. That is the PostgREST query-builder chain
(`table().select().eq().neq().in_().lt().lte().gt().gte().is_().or_().limit().order()
.execute()`, plus insert / update / delete / upsert), `auth.get_user`,
`auth.admin.delete_user`, and `storage.from_().create_signed_url()`. Filters are ANDed,
mirroring PostgREST, and comparisons against NULL are never true, as in Postgres.

UNIQUE indexes are enforced on insert (see UNIQUE_KEYS) — without that, an idempotency
test passes vacuously, because inserting the same RevenueCat event id twice just
appends a second row.

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
    # is_premium matters as much as is_published: _project below omits keys that are
    # absent from the stored row, so without this default `s.get("is_premium")` is
    # None — accidentally falsy. The free path would work, the premium path would
    # silently never trigger, and the gate tests would pass while proving nothing.
    "lesson_series": {"is_published": False, "sort_order": 0, "is_premium": False},
    "lessons": {"sort_order": 0, "video_provider": "supabase"},
    "subscriptions": {
        "environment": "production",
        "product_id": None,
        "pending_product_id": None,
        "expires_at": None,
        "revoked_at": None,
        "auto_renew": True,
        "cancelled_at": None,
        "status": "active",
        "last_event_id": None,
        "last_event_at": None,
    },
    "app_config": {},
    "subscription_events": {},
}

# UNIQUE indexes the real schema declares. The fake enforces them on insert so an
# idempotency test cannot pass vacuously: without this, inserting the same RevenueCat
# event id twice simply appends a second row and the duplicate-delivery assertion is
# meaningless. Mirrors migration 0005.
UNIQUE_KEYS: dict[str, tuple[str, ...]] = {
    "subscriptions": ("store", "environment", "store_txn_id"),
    "subscription_events": ("event_id",),
    "app_config": ("key",),
}

# Which columns an upsert matches on. Previously hardcoded to (user_id, month) for
# month_status — the only upsert in main.py at the time. That is actively wrong for
# `subscriptions`, where both sides' `month` is None, so `None == None` passes and the
# upsert clobbers whichever row the user happens to own first. Defaults to the table's
# UNIQUE_KEYS, which is what Postgres' ON CONFLICT would use.
UPSERT_KEYS: dict[str, tuple[str, ...]] = {
    "month_status": ("user_id", "month"),
}


class UniqueViolation(Exception):
    """What PostgREST raises through the supabase client on a 23505. Carries the same
    `.code` and message shape so handler code can branch on it exactly as in prod."""

    def __init__(self, table: str, columns: tuple[str, ...]):
        self.code = "23505"
        self.message = (
            f'duplicate key value violates unique constraint '
            f'"{table}_{"_".join(columns)}_idx"'
        )
        super().__init__(self.message)


def _project(row: dict, columns: Optional[list[str]]) -> dict:
    """Mimic PostgREST returning only the requested columns.

    This matters beyond tidiness: the lesson routes deliberately select around
    `video_id` so the app never receives a path into the private video bucket. Without
    projection the fake would hand it over and the test asserting otherwise would be
    worthless.

    A SELECTED column that is absent from the stored row comes back as None, not
    missing — that is what real PostgREST does, and the production captures in
    goldens/ prove it (an empty lesson description arrives as `"description": null`).
    Omitting the key instead would let a "field disappeared from the response"
    regression pass unnoticed, which is the exact class of bug the goldens exist to
    catch. Columns that were NOT selected are still absent, as they should be."""
    if columns is None:
        return dict(row)
    return {c: row.get(c) for c in columns}


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
        # A LIST, not a single tuple: PostgREST appends each `order=` it is given,
        # so `.order(a).order(b)` sorts by a then b. Collapsing them to the last call
        # would make a two-column ordering silently one-column here, and a tiebreak
        # that only exists in the fake's imagination proves nothing.
        self._order: list[tuple[str, bool]] = []

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

    # Comparison filters. The webhook handler needs these for its conditional,
    # monotonic update — `update ... where last_event_at < :ts` is what makes a
    # stale out-of-order event match zero rows ATOMICALLY, instead of losing a
    # read-compare-write race between two Render workers.
    def lt(self, col: str, val: Any) -> "_Query":
        self.filters.append(("lt", col, val))
        return self

    def lte(self, col: str, val: Any) -> "_Query":
        self.filters.append(("lte", col, val))
        return self

    def gt(self, col: str, val: Any) -> "_Query":
        self.filters.append(("gt", col, val))
        return self

    def gte(self, col: str, val: Any) -> "_Query":
        self.filters.append(("gte", col, val))
        return self

    def is_(self, col: str, val: Any) -> "_Query":
        """PostgREST `is` — used for NULL checks. Accepts None or the string 'null'."""
        self.filters.append(("is", col, None if val in (None, "null") else val))
        return self

    def or_(self, expr: str) -> "_Query":
        """PostgREST `or=(a.lt.x,b.is.null)`. Only the shapes main.py actually uses
        are parsed; anything else raises rather than silently matching everything."""
        self.filters.append(("or", None, expr))
        return self

    def limit(self, n: int) -> "_Query":
        self._limit = n
        return self

    def order(self, col: str, desc: bool = False) -> "_Query":
        self._order.append((col, desc))
        return self

    # ── evaluation ───────────────────────────────────────────────────────────
    @staticmethod
    def _compare(kind: str, actual: Any, val: Any) -> bool:
        # Postgres three-valued logic: any comparison against NULL is NULL, which is
        # not true, so the row does not match. Mirroring this matters — it is exactly
        # why the webhook's conditional update needs an explicit `is.null` arm.
        if actual is None or val is None:
            return False
        try:
            if kind == "lt":
                return actual < val
            if kind == "lte":
                return actual <= val
            if kind == "gt":
                return actual > val
            if kind == "gte":
                return actual >= val
        except TypeError:
            return False
        raise AssertionError(f"Unsupported comparison {kind!r}")

    def _matches_term(self, row: dict, kind: str, col: Optional[str], val: Any) -> bool:
        if kind == "or":
            return any(
                self._matches_term(row, *self._parse_or_term(t))
                for t in str(val).split(",")
            )
        actual = row.get(col)
        if kind == "eq":
            return actual == val
        if kind == "neq":
            return actual != val
        if kind == "in":
            return actual in val
        if kind == "is":
            return actual is val if val is None else actual == val
        return self._compare(kind, actual, val)

    @staticmethod
    def _parse_or_term(term: str) -> tuple[str, str, Any]:
        """`last_event_at.lt.2026-01-01T00:00:00+00:00` -> ("lt", col, value)."""
        parts = term.strip().split(".", 2)
        if len(parts) != 3:
            raise AssertionError(f"Cannot parse or() term {term!r}")
        col, op, raw = parts
        return op, col, (None if raw == "null" else raw)

    def _matches(self, row: dict) -> bool:
        return all(self._matches_term(row, k, c, v) for k, c, v in self.filters)

    def _rows(self) -> list[dict]:
        return self.db.tables.setdefault(self.table, [])

    def execute(self) -> FakeResponse:
        self.db.calls.append((self.op, self.table))
        if self.op == "select":
            # Recorded separately from `calls`, which is a 2-tuple several tests unpack.
            # The COLUMN LIST is part of the backward-compatibility contract, not just
            # the table: GET /lessons/series/{id}/ widens its select only for clients
            # advertising `social`, so that an unmarked request cannot be affected by a
            # stale PostgREST schema cache on a freshly-added column.
            self.db.selects.append((self.table, self.columns))
        rows = self._rows()

        if self.op == "select":
            out = [r for r in rows if self._matches(r)]
            # Applied last-key-first, which is how you build a multi-key sort out of a
            # stable single-key one — `sorted` is stable, so earlier keys win.
            for col, desc in reversed(self._order):
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
                key = UNIQUE_KEYS.get(self.table)
                if key and any(
                    all(existing.get(k) == row.get(k) for k in key) for existing in rows
                ):
                    raise UniqueViolation(self.table, key)
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
            # Matches on the table's declared conflict target — UPSERT_KEYS if it has
            # an entry, otherwise its UNIQUE index. Never a hardcoded (user_id, month):
            # for `subscriptions` both sides' `month` is None, so None == None passes
            # and the upsert would clobber whichever row that user owns first.
            item = dict(self.payload)
            for col, default in COLUMN_DEFAULTS.get(self.table, {}).items():
                item.setdefault(col, default)
            key = UPSERT_KEYS.get(self.table) or UNIQUE_KEYS.get(self.table)
            if key is None:
                raise AssertionError(
                    f"No upsert/unique key declared for table {self.table!r} — add one "
                    f"to UPSERT_KEYS or UNIQUE_KEYS so the fake matches Postgres."
                )
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
        # (table, columns) per select. `columns` is None for select("*").
        self.selects: list[tuple[str, Optional[list[str]]]] = []
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
