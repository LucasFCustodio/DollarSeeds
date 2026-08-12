"""Backward compatibility for the app binaries already in the App Store.

This is the higher-stakes half of the premium-subscription work. A regression here hits
real users who cannot roll back: the shipped build has no RevenueCat SDK, no paywall and
no purchase path, so anything that hides content from it, or errors, is a dead end.

The contract those binaries depend on is captured in `goldens/`, taken from the LIVE
backend before any of this code existed (see goldens/README.md). Two properties are
asserted:

  A. SHAPE — an unmarked request gets the same keys, types and array order it gets today.
  B. PATH  — an unmarked request runs the same CODE, issuing no extra queries. That is
             stronger than A and is what the query-count and dangling-series tests below
             pin down. A gate that "usually succeeds" is not good enough when the client
             cannot be patched.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from conftest import USER_A, auth, v2

GOLDENS = Path(__file__).parent / "goldens"

# An old binary sends a bearer token and nothing else — no X-Client-Features.
OLD_BINARY = auth(USER_A)


def golden(name: str):
    return json.loads((GOLDENS / f"{name}.json").read_text(encoding="utf-8"))


def shape_of(value):
    """Structure without the values: keys (order preserved), types, and array order.

    Deliberately not a byte comparison of the serialised JSON. Object key order is not
    part of any HTTP contract and no client depends on it, so a byte diff would fail on
    a harmless select-list reorder — a false alarm that teaches you to ignore the test.
    Array order IS preserved here, because `sort_order` genuinely matters."""
    if isinstance(value, dict):
        return [(k, shape_of(v)) for k, v in value.items()]
    if isinstance(value, list):
        return [shape_of(v) for v in value]
    return type(value).__name__


@pytest.fixture
def live_content(supabase_db):
    """The two series production actually serves, plus a premium one that must be
    invisible to an old binary."""
    supabase_db.seed("lesson_series", {
        "id": "s-generosity", "title": "The Truth on Generosity",
        "description": "A series on generosity.", "creator": "Igor",
        "thumbnail_url": "https://img/gen.png",
        "is_published": True, "is_premium": False, "sort_order": 0,
    })
    supabase_db.seed("lesson_series", {
        "id": "s-rethinking", "title": "Rethinking Finances Through a Godly Lens",
        "description": "A test series.", "creator": "DollarSeeds",
        "thumbnail_url": "https://img/rethink.png",
        "is_published": True, "is_premium": False, "sort_order": 1,
    })
    supabase_db.seed("lesson_series", {
        "id": "s-premium", "title": "Premium Series",
        "description": "Paid.", "creator": "DollarSeeds",
        "thumbnail_url": "https://img/prem.png",
        "is_published": True, "is_premium": True, "sort_order": 2,
    })
    for i in range(4):
        supabase_db.seed("lessons", {
            "id": f"gen-{i}", "series_id": "s-generosity", "title": f"Generosity {i}",
            "sort_order": i, "video_id": f"gen/{i}.mp4", "duration_seconds": 100 + i,
        })
    supabase_db.seed("lessons", {
        "id": "rethink-0", "series_id": "s-rethinking", "title": "Rethinking 1",
        "sort_order": 0, "video_id": "rethink/0.mp4", "duration_seconds": 300,
    })
    supabase_db.seed("lessons", {
        "id": "prem-0", "series_id": "s-premium", "title": "Premium 1",
        "sort_order": 0, "video_id": "prem/0.mp4", "duration_seconds": 500,
    })
    return supabase_db


# ══ A. Response shape matches the production capture ════════════════════════════

def test_series_list_shape_is_unchanged(client, live_content):
    res = client.get("/lessons/series/", headers=OLD_BINARY)
    assert res.status_code == 200
    assert shape_of(res.json()) == shape_of(golden("series_list"))


def test_series_detail_shape_is_unchanged(client, live_content):
    # s-rethinking mirrors the series the production capture was taken from: one lesson,
    # with a null description and null thumbnail_url. Those nulls are the point — real
    # PostgREST emits the keys, and the fixture has to reproduce that to be a fair test.
    res = client.get("/lessons/series/s-rethinking/", headers=OLD_BINARY)
    assert res.status_code == 200
    assert shape_of(res.json()) == shape_of(golden("series_detail"))


def test_playback_shape_is_unchanged(client, live_content):
    """The golden's `url` is redacted (it was a live signed URL), so assert the keys,
    their order, and the TTL — never the value."""
    res = client.get("/lessons/gen-0/playback/", headers=OLD_BINARY)
    assert res.status_code == 200
    body = res.json()
    assert list(body.keys()) == list(golden("playback").keys()) == ["url", "expires_in"]
    assert isinstance(body["url"], str) and body["url"]
    assert body["expires_in"] == 3600


@pytest.mark.parametrize("path,name", [
    ("/lessons/series/00000000-0000-0000-0000-000000000000/", "err_series_404"),
    ("/lessons/00000000-0000-0000-0000-000000000000/playback/", "err_playback_404"),
])
def test_error_bodies_are_unchanged(client, live_content, path, name):
    res = client.get(path, headers=OLD_BINARY)
    assert res.status_code == 404
    assert res.json() == golden(name)


def test_unauthenticated_error_body_is_unchanged(client, live_content):
    res = client.get("/lessons/series/")
    assert res.status_code == 401
    assert res.json() == golden("err_noauth_401")


def test_detail_lesson_keys_are_exactly_the_six_shipped_ones(client, live_content):
    """main.py builds the series fields key-by-key, but passes the LESSON rows through
    verbatim — the one line in the file where adding a column to a select() leaks a new
    field onto the wire. Pin the key set so that leak cannot happen silently."""
    lessons = client.get("/lessons/series/s-generosity/", headers=OLD_BINARY).json()["data"]["lessons"]
    for lesson in lessons:
        assert set(lesson.keys()) == {
            "id", "title", "description", "duration_seconds", "thumbnail_url", "sort_order",
        }


def test_detail_never_omits_the_lessons_key(client, supabase_db):
    """lessonSeries/[id].tsx reads `detail.lessons.length` unguarded, so a missing key
    is a crash in the shipped app, not a blank screen."""
    supabase_db.seed("lesson_series", {"id": "s-empty", "title": "Empty",
                                       "is_published": True, "sort_order": 0})
    body = client.get("/lessons/series/s-empty/", headers=OLD_BINARY).json()
    assert body["data"]["lessons"] == []


# ══ B. Premium content is invisible, and playback is never gated ════════════════

def test_premium_series_is_absent_and_counts_survive(client, live_content):
    data = client.get("/lessons/series/", headers=OLD_BINARY).json()["data"]

    assert [s["title"] for s in data] == [
        "The Truth on Generosity", "Rethinking Finances Through a Godly Lens",
    ]
    # Counts are derived AFTER filtering; a regression there shows up here.
    assert [s["lesson_count"] for s in data] == [4, 1]
    # The new key is for marked clients only.
    assert all("is_premium" not in s for s in data)


@pytest.mark.parametrize("flag_on", [False, True])
@pytest.mark.parametrize("entitled", [False, True])
def test_playback_is_never_gated_for_an_old_binary(client, live_content, flag_on, entitled):
    """Four combinations, one expectation: 200. This is the single most important
    assertion in the suite — an old binary has no way to recover from a 403."""
    if flag_on:
        live_content.seed("app_config", {"key": "premium_enabled", "value": "true"})
    if entitled:
        live_content.seed("subscriptions", {
            "user_id": USER_A, "store": "app_store", "store_txn_id": "t1",
            "expires_at": "2099-01-01T00:00:00+00:00",
        })
    import main
    main._app_config_cache = None

    res = client.get("/lessons/prem-0/playback/", headers=OLD_BINARY)
    assert res.status_code == 200, res.text
    assert res.json()["expires_in"] == 3600


def test_unmarked_playback_issues_no_extra_queries(client, live_content):
    """The strongest form of the guarantee: not just the same RESPONSE, the same WORK.

    An unmarked request must touch `lessons` and nothing else — no app_config read, no
    lesson_series lookup, no subscriptions scan. If someone hoists a lookup above the
    marker check, this fails even though every shape assertion above still passes."""
    live_content.seed("app_config", {"key": "premium_enabled", "value": "true"})
    import main
    main._app_config_cache = None
    live_content.calls.clear()

    assert client.get("/lessons/prem-0/playback/", headers=OLD_BINARY).status_code == 200

    tables = {table for _, table in live_content.calls}
    assert tables == {"lessons"}, f"unmarked playback touched {sorted(tables)}"


def test_flag_off_makes_v2_behave_exactly_like_an_old_binary_for_playback(client, live_content):
    """Rollout step 1 ships with premium_enabled=false. Nothing is gated for anyone."""
    res = client.get("/lessons/prem-0/playback/", headers=v2())
    assert res.status_code == 200


def test_a_dangling_series_id_cannot_break_playback(client, supabase_db):
    """A lesson whose series_id has no lesson_series row — the exact shape of the three
    pre-existing tests this design was built around. Both an old binary and a v2 client
    must get their video, not an IndexError."""
    supabase_db.seed("app_config", {"key": "premium_enabled", "value": "true"})
    supabase_db.seed("lessons", {"id": "orphan", "series_id": "gone", "title": "Orphan",
                                 "sort_order": 0, "video_id": "orphan.mp4"})
    import main
    main._app_config_cache = None

    assert client.get("/lessons/orphan/playback/", headers=OLD_BINARY).status_code == 200
    # v2 too: _series_is_premium fails OPEN rather than locking someone out over a
    # missing row.
    assert client.get("/lessons/orphan/playback/", headers=v2()).status_code == 200
