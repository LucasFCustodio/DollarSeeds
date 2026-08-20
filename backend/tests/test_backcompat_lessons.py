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
    """Production's one published series — "The Truth on Generosity", 4 lessons, every
    field populated — mirrored field-for-field against goldens/, plus a premium series
    that must be invisible to an old binary.

    Kept deliberately faithful to the capture: if production's content changes, this
    fixture and the goldens are re-derived together (goldens/README.md)."""
    supabase_db.seed("lesson_series", {
        "id": "s-generosity", "title": "The Truth on Generosity",
        "description": "A series on generosity.", "creator": "Igor",
        "thumbnail_url": "https://img/gen.png",
        "is_published": True, "is_premium": False, "sort_order": 0,
    })
    supabase_db.seed("lesson_series", {
        "id": "s-premium", "title": "Premium Series",
        "description": "Paid.", "creator": "DollarSeeds",
        "thumbnail_url": "https://img/prem.png",
        "is_published": True, "is_premium": True, "sort_order": 1,
    })
    for i in range(4):
        supabase_db.seed("lessons", {
            "id": f"gen-{i}", "series_id": "s-generosity", "title": f"Generosity {i}",
            "description": f"Lesson {i}.", "thumbnail_url": f"https://img/gen-{i}.png",
            "sort_order": i, "video_id": f"gen/{i}.mp4", "duration_seconds": 100 + i,
        })
    supabase_db.seed("lessons", {
        "id": "prem-0", "series_id": "s-premium", "title": "Premium 1",
        "description": "Paid lesson.", "thumbnail_url": "https://img/prem-0.png",
        "sort_order": 0, "video_id": "prem/0.mp4", "duration_seconds": 500,
    })
    return supabase_db


# ══ A. Response shape matches the production capture ════════════════════════════

def test_series_list_shape_is_unchanged(client, live_content):
    res = client.get("/lessons/series/", headers=OLD_BINARY)
    assert res.status_code == 200
    assert shape_of(res.json()) == shape_of(golden("series_list"))


def test_series_detail_shape_is_unchanged(client, live_content):
    res = client.get("/lessons/series/s-generosity/", headers=OLD_BINARY)
    assert res.status_code == 200
    assert shape_of(res.json()) == shape_of(golden("series_detail"))


def test_an_empty_column_is_null_on_the_wire_not_a_missing_key(client, supabase_db):
    """PostgREST returns a SELECTED but empty column as null; it does not drop the key.
    The shipped app reads `lesson.description` directly, so the difference between null
    and absent is the difference between a blank line and undefined.

    This used to be covered incidentally, because the series the goldens were captured
    from happened to have an empty description. It no longer does, so pin the invariant
    explicitly rather than let the coverage vanish with a content edit — it is a
    property of the API, not of whatever is published today."""
    supabase_db.seed("lesson_series", {"id": "s-sparse", "title": "Sparse",
                                       "is_published": True, "sort_order": 0})
    supabase_db.seed("lessons", {"id": "sparse-0", "series_id": "s-sparse",
                                 "title": "No description", "sort_order": 0,
                                 "video_id": "sparse/0.mp4"})

    lesson = client.get("/lessons/series/s-sparse/", headers=OLD_BINARY).json()["data"]["lessons"][0]
    assert "description" in lesson and lesson["description"] is None
    assert "thumbnail_url" in lesson and lesson["thumbnail_url"] is None
    assert "duration_seconds" in lesson and lesson["duration_seconds"] is None


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

    assert [s["title"] for s in data] == ["The Truth on Generosity"]
    # Counts are derived AFTER filtering; a regression there shows up here.
    assert [s["lesson_count"] for s in data] == [4]
    # The new key is for marked clients only.
    assert all("is_premium" not in s for s in data)


def test_ordering_survives_filtering_out_a_premium_series(client, live_content):
    """A premium series removed from the middle must not disturb the sort_order of the
    survivors — the filter runs in Python after the DB has ordered them."""
    live_content.seed("lesson_series", {
        "id": "s-later", "title": "Later Free Series", "description": "d",
        "creator": "DS", "thumbnail_url": "u",
        "is_published": True, "is_premium": False, "sort_order": 2,
    })
    data = client.get("/lessons/series/", headers=OLD_BINARY).json()["data"]
    assert [s["title"] for s in data] == ["The Truth on Generosity", "Later Free Series"]


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


# ══ C. Creator social links reach `social` builds and nobody else ═══════════════
#
# Migration 0006 added instagram_url / linkedin_url / website_url to lesson_series.
# They are served from GET /lessons/series/{id}/ behind their OWN capability token,
# not behind `premium` — see SOCIAL_FEATURE in main.py. Two generations of binary are
# already unpatchable (the App Store build, and the premium build), and each must keep
# getting exactly the response it was written against.

SOCIAL = v2(features="social")
PREMIUM_ONLY = v2(features="premium")
BOTH = v2(features="premium, social")   # what the app's axios interceptor now sends


@pytest.fixture
def linked_series(supabase_db):
    """One published series with all three links, and one with none."""
    supabase_db.seed("lesson_series", {
        "id": "s-links", "title": "Linked", "description": "d", "creator": "Igor",
        "thumbnail_url": "https://img/l.png",
        "is_published": True, "is_premium": False, "sort_order": 0,
        "instagram_url": "https://www.instagram.com/igorbarroso",
        "linkedin_url": "https://www.linkedin.com/in/igor-barroso",
        "website_url": "https://igorbarroso.com",
    })
    supabase_db.seed("lesson_series", {
        "id": "s-bare", "title": "Bare", "description": "d", "creator": "DS",
        "thumbnail_url": "https://img/b.png",
        "is_published": True, "is_premium": False, "sort_order": 1,
    })
    # A real lesson row, so the key-set assertion below actually iterates something.
    supabase_db.seed("lessons", {
        "id": "links-0", "series_id": "s-links", "title": "Linked lesson",
        "description": None, "thumbnail_url": None,
        "sort_order": 0, "video_id": "links/0.mp4", "duration_seconds": 120,
    })
    return supabase_db


SOCIAL_KEYS = {"instagram_url", "linkedin_url", "website_url"}


@pytest.mark.parametrize("headers,label", [
    (OLD_BINARY, "the App Store binary"),
    (PREMIUM_ONLY, "a premium-only build"),
])
def test_social_links_are_absent_without_the_social_marker(client, linked_series, headers, label):
    """`premium` must NOT imply `social`. A build that ships a paywall was not thereby
    written to render a link row, and it cannot be patched if that assumption is wrong."""
    data = client.get("/lessons/series/s-links/", headers=headers).json()["data"]
    assert SOCIAL_KEYS & set(data) == set(), f"{label} received {sorted(SOCIAL_KEYS & set(data))}"


def test_the_unmarked_series_detail_is_still_byte_identical_with_links_populated(
        client, live_content):
    """The shape assertion above proves nothing on its own if the seeded series has no
    links. Populate them on the very series the goldens were captured from, then assert
    the unmarked response is unchanged — the columns exist and are full, and an old
    binary still cannot tell."""
    live_content.seed("lesson_series", {
        "id": "s-generosity", "title": "The Truth on Generosity",
        "description": "A series on generosity.", "creator": "Igor",
        "thumbnail_url": "https://img/gen.png",
        "is_published": True, "is_premium": False, "sort_order": 0,
        "instagram_url": "https://www.instagram.com/igorbarroso",
        "linkedin_url": "https://www.linkedin.com/in/igor-barroso",
        "website_url": "https://igorbarroso.com",
    })
    res = client.get("/lessons/series/s-generosity/", headers=OLD_BINARY)
    assert res.status_code == 200
    assert shape_of(res.json()) == shape_of(golden("series_detail"))


@pytest.mark.parametrize("headers,label", [
    (OLD_BINARY, "the App Store binary"),
    (PREMIUM_ONLY, "a premium-only build"),
])
def test_an_unmarked_request_does_not_even_select_the_new_columns(
        client, linked_series, headers, label):
    """Stronger than "the keys are absent": the QUERY is unchanged too.

    A column added by a migration is invisible to PostgREST until its schema cache
    reloads, and a select naming an unknown column is a 400 — which would surface as a
    500 on this endpoint. Selecting the socials only for clients that will be sent them
    confines that failure mode to builds that can be fixed, and keeps the request the
    App Store binary makes byte-for-byte the one it makes today."""
    linked_series.selects.clear()
    assert client.get("/lessons/series/s-links/", headers=headers).status_code == 200

    series_selects = [cols for table, cols in linked_series.selects if table == "lesson_series"]
    assert series_selects, "the endpoint must have queried lesson_series"
    for cols in series_selects:
        assert cols is not None, f"{label} triggered a select(*) on lesson_series"
        assert SOCIAL_KEYS.isdisjoint(cols), f"{label} selected {sorted(SOCIAL_KEYS & set(cols))}"


@pytest.mark.parametrize("headers", [SOCIAL, BOTH])
def test_a_social_build_gets_all_three_links(client, linked_series, headers):
    data = client.get("/lessons/series/s-links/", headers=headers).json()["data"]
    assert data["instagram_url"] == "https://www.instagram.com/igorbarroso"
    assert data["linkedin_url"] == "https://www.linkedin.com/in/igor-barroso"
    assert data["website_url"] == "https://igorbarroso.com"


def test_unset_links_are_null_keys_not_missing_keys(client, linked_series):
    """The frontend hides the whole section when all three are falsy. That branch must
    key off VALUE, never off absence — so the keys are always present for a social
    build, exactly as PostgREST returns a selected-but-empty column."""
    data = client.get("/lessons/series/s-bare/", headers=SOCIAL).json()["data"]
    for key in SOCIAL_KEYS:
        assert key in data and data[key] is None


def test_social_and_premium_markers_are_independent(client, linked_series):
    """Sending `social` alone must not smuggle in `is_premium`, and vice versa."""
    social_only = client.get("/lessons/series/s-links/", headers=SOCIAL).json()["data"]
    assert "is_premium" not in social_only

    both = client.get("/lessons/series/s-links/", headers=BOTH).json()["data"]
    assert both["is_premium"] is False
    assert SOCIAL_KEYS <= set(both)


def test_the_lessons_rows_never_grow_a_social_key(client, linked_series):
    """The socials live on the SERIES, and the lesson rows are still passed through
    verbatim. Adding a column to that select is the one leak main.py warns about, so
    pin the six-key set for a social build too — not just for an old binary."""
    data = client.get("/lessons/series/s-links/", headers=BOTH).json()["data"]
    assert data["lessons"], "fixture must seed a lesson or this asserts nothing"
    for lesson in data["lessons"]:
        assert set(lesson.keys()) == {
            "id", "title", "description", "duration_seconds", "thumbnail_url", "sort_order",
        }
