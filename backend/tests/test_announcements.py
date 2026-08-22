"""GET /announcements/ — the in-app News modal's only data source.

The route is BRAND NEW, so there is no backward-compatibility surface to protect
here: the binaries in the App Store were compiled before the path existed and can
never call it. What these tests pin instead is the contract the modal is written
against, and the two properties that are easy to get subtly wrong —

  A. SELECTION — only published rows, newest first, capped at three.
  B. SHAPE     — both language variants always present as keys (null, not missing),
                 because the client falls back per FIELD and `undefined` and `null`
                 are not the same thing to that branch.
"""

from __future__ import annotations

import pytest

from conftest import USER_A, auth

HEADERS = auth(USER_A)

KEYS = {
    "id", "title", "body", "title_pt", "body_pt", "image_url",
    "link_type", "link_target", "link_label", "author", "published_at",
}


def publish(db, id_, *, published_at, title=None, is_published=True, **extra):
    row = {
        "id": id_,
        "title": title or f"Title {id_}",
        "body": f"Body {id_}",
        "author": "Lucas",
        "published_at": published_at,
        "is_published": is_published,
    }
    row.update(extra)
    db.seed("announcements", row)
    return row


# ══ A. Selection ════════════════════════════════════════════════════════════════

@pytest.mark.parametrize("count", [0, 1, 2, 3])
def test_returns_every_published_row_up_to_three(client, supabase_db, count):
    """0, 1 and 2 published announcements are all normal states, not edge cases —
    the feature ships with zero rows in the table and stays there until the first
    INSERT."""
    for i in range(count):
        publish(supabase_db, f"a{i}", published_at=f"2026-08-0{i + 1}T00:00:00+00:00")

    res = client.get("/announcements/", headers=HEADERS)
    assert res.status_code == 200
    assert len(res.json()["data"]) == count


def test_only_the_three_most_recent_are_returned_newest_first(client, supabase_db):
    for i in range(1, 6):
        publish(supabase_db, f"a{i}", published_at=f"2026-08-0{i}T00:00:00+00:00")

    data = client.get("/announcements/", headers=HEADERS).json()["data"]
    assert [r["id"] for r in data] == ["a5", "a4", "a3"]


def test_unpublished_rows_are_invisible(client, supabase_db):
    """is_published defaults to false, which is what makes "insert, check, then flip"
    a safe publishing workflow. A draft leaking to users would remove the only
    review step the feature has."""
    publish(supabase_db, "draft", published_at="2026-08-09T00:00:00+00:00",
            is_published=False)
    publish(supabase_db, "live", published_at="2026-08-01T00:00:00+00:00")

    data = client.get("/announcements/", headers=HEADERS).json()["data"]
    assert [r["id"] for r in data] == ["live"]


def test_ties_on_published_at_are_broken_deterministically(client, supabase_db):
    """published_at defaults to now(), i.e. TRANSACTION time, so a multi-row INSERT
    gives every row the same timestamp to the microsecond. The client keys "have I
    seen this?" off the id of the first row, so an order that can flip between two
    boots re-shows a modal the user already dismissed. Same timestamp ⇒ `id desc`."""
    same = "2026-08-01T12:00:00+00:00"
    for id_ in ("a", "c", "b"):
        publish(supabase_db, id_, published_at=same)

    first = [client.get("/announcements/", headers=HEADERS).json()["data"]
             for _ in range(3)]
    assert [[r["id"] for r in data] for data in first] == [["c", "b", "a"]] * 3


# ══ B. Shape ════════════════════════════════════════════════════════════════════

def test_both_language_variants_are_returned(client, supabase_db):
    """The backend is deliberately locale-unaware — it has no reliable signal for the
    user's language (it is device-local AsyncStorage, never sent), and serving one
    language would leave a user who switches in Settings on the old one until the
    next fetch."""
    publish(supabase_db, "a1", published_at="2026-08-01T00:00:00+00:00",
            title="New series", body="Watch it now.",
            title_pt="Nova série", body_pt="Assista agora.")

    row = client.get("/announcements/", headers=HEADERS).json()["data"][0]
    assert row["title"] == "New series" and row["body"] == "Watch it now."
    assert row["title_pt"] == "Nova série" and row["body_pt"] == "Assista agora."


def test_unset_optional_columns_are_null_keys_not_missing_keys(client, supabase_db):
    """The modal falls back English-per-FIELD and hides the image / link by VALUE.
    Those branches must never have to distinguish `undefined` from `null`, so pin
    that PostgREST returns a selected-but-empty column as an explicit null — the
    same invariant test_backcompat_lessons.py pins for lessons."""
    publish(supabase_db, "bare", published_at="2026-08-01T00:00:00+00:00")

    row = client.get("/announcements/", headers=HEADERS).json()["data"][0]
    assert set(row.keys()) == KEYS
    for key in ("title_pt", "body_pt", "image_url", "link_type", "link_target",
                "link_label"):
        assert key in row and row[key] is None


def test_is_published_never_reaches_the_wire(client, supabase_db):
    """Nothing false can be in the list, so the flag carries no information — and a
    key the client does not read is a key someone later branches on by accident."""
    publish(supabase_db, "a1", published_at="2026-08-01T00:00:00+00:00")
    row = client.get("/announcements/", headers=HEADERS).json()["data"][0]
    assert "is_published" not in row and "created_at" not in row


# ══ C. Blast radius ═════════════════════════════════════════════════════════════

def test_the_route_touches_nothing_but_announcements(client, supabase_db):
    """No app_config read, no subscriptions scan, no capability-marker plumbing. The
    route is new, so there is no unmarked request to preserve and nothing to gate —
    and that should be visible in the WORK it does, not just in the response."""
    publish(supabase_db, "a1", published_at="2026-08-01T00:00:00+00:00")
    supabase_db.calls.clear()

    assert client.get("/announcements/", headers=HEADERS).status_code == 200
    assert {table for _, table in supabase_db.calls} == {"announcements"}


def test_a_missing_table_answers_empty_rather_than_500(client, supabase_db, monkeypatch):
    """Before migration 0007 is applied in production the table does not exist, and
    the backend deploys before the SQL is run. A 500 there would surface as an error
    on every boot of the new build for a feature that is meant to be invisible when
    there is nothing to announce."""
    import main

    class Exploding:
        def table(self, name):
            raise RuntimeError('relation "public.announcements" does not exist')

    monkeypatch.setattr(main, "supabase", Exploding())
    res = client.get("/announcements/", headers=HEADERS)
    assert res.status_code == 200
    assert res.json() == {"data": []}
