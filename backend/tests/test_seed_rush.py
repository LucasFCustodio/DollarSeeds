"""Seed Rush — the website's daily verse game (seed_rush.py, /seed-rush routes, 0015).

The verses here are tests/fixtures/seed_rush_verses.json: invented sentences, not
Scripture. The clock is pinned (`clock` fixture), the order secret is fixed by
conftest, and Resend is never called — `_resend_post` is replaced wherever a test
needs a key set.
"""

from __future__ import annotations

import datetime
import json
import re
from pathlib import Path

import jwt
import pytest

import load_seed_rush_verses as loader
import main
import seed_rush as sr
from conftest import JWT_SECRET, USER_A, USER_B, auth

UTC = datetime.timezone.utc
FIXTURE = Path(__file__).parent / "fixtures" / "seed_rush_verses.json"
USER_C = "33333333-3333-3333-3333-333333333333"
GUEST_1 = "aaaaaaaa-1111-4111-8111-111111111111"
GUEST_2 = "bbbbbbbb-2222-4222-8222-222222222222"
SECRET = b"test-seed-rush-secret"

# 10:00 AM New York on Thursday 5 November 2026 (EST): game day 2026-11-05.
NOON_UTC = datetime.datetime(2026, 11, 5, 15, 0, tzinfo=UTC)
TODAY = datetime.date(2026, 11, 5)


def guest(guest_id: str = GUEST_1) -> dict:
    return {"X-Seed-Rush-Guest": guest_id}


def token_with(user_id: str, **claims) -> dict:
    """A bearer header whose token carries extra claims (app_metadata, email)."""
    now = datetime.datetime.now(UTC)
    body = {"aud": "authenticated", "role": "authenticated", "sub": user_id,
            "iat": int(now.timestamp()) - 60, "exp": int(now.timestamp()) + 3600,
            "email": f"{user_id[:8]}@example.test", "app_metadata": {"provider": "email"}}
    body.update(claims)
    return {"Authorization": f"Bearer {jwt.encode(body, JWT_SECRET, algorithm='HS256')}"}


class Clock:
    def __init__(self, at: datetime.datetime):
        self.now = at

    def __call__(self) -> datetime.datetime:
        return self.now

    def tick(self, seconds: float = 2.0) -> None:
        self.now += datetime.timedelta(seconds=seconds)


@pytest.fixture
def clock(monkeypatch) -> Clock:
    c = Clock(NOON_UTC)
    monkeypatch.setattr(main, "_sr_now", c)
    return c


@pytest.fixture
def fixture_verses() -> list[dict]:
    return sr.validate_verses(json.loads(FIXTURE.read_text(encoding="utf-8")))


@pytest.fixture
def verses(supabase_db, fixture_verses) -> dict:
    """The fixture loaded through the real loader. Returns {slug: row}."""
    loader.sync(supabase_db, fixture_verses)
    return {r["slug"]: r for r in supabase_db.rows("seed_rush_verses")}


@pytest.fixture
def game(client, supabase_db, verses, clock):
    """Everything an API test needs."""
    return client


def verse_by_id(db, verse_id) -> dict:
    return next(v for v in db.rows("seed_rush_verses") if v["id"] == verse_id)


def correct_answers(db, question: dict, mode: str) -> list[str]:
    return sr.mode_blanks(verse_by_id(db, question["verse_id"]), mode)


def start(client, headers, kind="daily", mode="medium"):
    return client.post("/seed-rush/runs", headers=headers, json={"kind": kind, "mode": mode})


def answer(client, headers, run_id, position, answers):
    return client.post(f"/seed-rush/runs/{run_id}/answer", headers=headers,
                       json={"position": position, "answers": answers})


def play(client, db, clock, headers, kind="daily", mode="medium", wrong_first=0, steps=None):
    """Start a run and answer verses 2 s apart (well over every minimum). The first
    `wrong_first` blanks of each verse are answered wrong. Returns the start body and
    the last answer body."""
    res = start(client, headers, kind, mode)
    assert res.status_code == 200, res.text
    run = res.json()
    q, last = run["question"], None
    count = 0
    while q is not None and (steps is None or count < steps):
        clock.tick(2)
        words = correct_answers(db, q, mode)
        words = ["nope"] * wrong_first + words[wrong_first:]
        last = answer(client, headers, run["run_id"], q["position"], words)
        assert last.status_code == 200, last.text
        q = last.json()["question"]
        count += 1
    return run, last


def finish(client, headers, run_id):
    return client.post(f"/seed-rush/runs/{run_id}/finish", headers=headers)


def seed_run(db, *, user_id=None, guest_id=None, day=TODAY, mode="hard", score=10, wrong=0,
             finished_at="2026-11-05T15:00:30+00:00", flagged=False, kind="daily"):
    return db.seed("seed_rush_runs", {
        "id": f"00000000-0000-4000-8000-{len(db.rows('seed_rush_runs')):012d}",
        "user_id": user_id, "guest_id": guest_id, "kind": kind, "mode": mode,
        "game_day": day.isoformat() if kind == "daily" else None, "verse_order": [1],
        "current_index": 1, "started_at": "2026-11-05T15:00:00+00:00",
        "deadline_at": "2026-11-05T15:01:00+00:00", "finished_at": finished_at,
        "score": score, "words_right": 3, "words_wrong": wrong, "flagged": flagged})


def seed_profile(db, user_id, username="Player", verified=True):
    return db.seed("seed_rush_profiles", {
        "user_id": user_id, "username": username,
        "email_verified_at": "2026-11-01T00:00:00+00:00" if verified else None})


# ══ The game day ═══════════════════════════════════════════════════════════════

def at(y, m, d, hh, mm=0, ss=0) -> datetime.datetime:
    return datetime.datetime(y, m, d, hh, mm, ss, tzinfo=UTC)


@pytest.mark.parametrize("label,before,start_utc,day", [
    # An ordinary EST day: 7:00 AM New York is 12:00 UTC.
    ("standard EST", at(2026, 11, 5, 11, 59, 59), at(2026, 11, 5, 12), datetime.date(2026, 11, 5)),
    # Spring forward (8 March 2026): clocks jump at 2 AM, so 7:00 AM is EDT, 11:00 UTC.
    ("spring forward", at(2026, 3, 8, 10, 59, 59), at(2026, 3, 8, 11), datetime.date(2026, 3, 8)),
    # Fall back (1 November 2026): clocks fall back at 2 AM, so 7:00 AM is EST, 12:00 UTC.
    ("fall back", at(2026, 11, 1, 11, 59, 59), at(2026, 11, 1, 12), datetime.date(2026, 11, 1)),
])
def test_the_game_day_starts_at_7am_new_york(label, before, start_utc, day):
    assert sr.game_day(before) == day - datetime.timedelta(days=1)
    assert sr.game_day(start_utc) == day
    assert sr.day_starts_at(day) == start_utc


def test_dst_change_days_are_23_and_25_hours_long():
    """The day is pinned to the wall clock, so the game day spanning a change is
    an hour shorter (spring) or longer (fall) — never a 7 AM that drifts to 6 or 8."""
    def length(day):
        return sr.day_starts_at(day + datetime.timedelta(days=1)) - sr.day_starts_at(day)
    assert length(datetime.date(2026, 3, 7)) == datetime.timedelta(hours=23)
    assert length(datetime.date(2026, 10, 31)) == datetime.timedelta(hours=25)
    assert length(datetime.date(2026, 11, 5)) == datetime.timedelta(hours=24)


def test_next_day_start(game):
    body = game.get("/seed-rush/day").json()
    assert body["game_day"] == "2026-11-05"
    assert body["starts_at"] == "2026-11-05T12:00:00+00:00"
    assert body["next_day_starts_at"] == "2026-11-06T12:00:00+00:00"
    assert body["timezone"] == "America/New_York" and body["start_hour"] == 7


# ══ Deterministic order ════════════════════════════════════════════════════════

IDS = list(range(1, 21))


def test_daily_order_is_the_same_for_the_same_day_and_mode():
    a = sr.daily_order(SECRET, TODAY, "hard", IDS)
    assert a == sr.daily_order(SECRET, TODAY, "hard", reversed(IDS))
    assert sorted(a) == IDS


def test_daily_order_differs_by_day_mode_and_secret():
    base = sr.daily_order(SECRET, TODAY, "hard", IDS)
    assert base != sr.daily_order(SECRET, TODAY + datetime.timedelta(days=1), "hard", IDS)
    assert base != sr.daily_order(SECRET, TODAY, "easy", IDS)
    assert base != sr.daily_order(b"another-secret", TODAY, "hard", IDS)


def test_two_players_get_the_same_verses_and_options(game, supabase_db):
    a = start(game, auth(USER_A), mode="medium").json()
    b = start(game, guest(), mode="medium").json()
    assert a["question"] == b["question"]
    run_a = next(r for r in supabase_db.rows("seed_rush_runs") if r["user_id"] == USER_A)
    run_b = next(r for r in supabase_db.rows("seed_rush_runs") if r["guest_id"] == GUEST_1)
    assert run_a["verse_order"] == run_b["verse_order"]


def test_practice_runs_are_never_daily(game, supabase_db):
    for _ in range(3):
        assert start(game, auth(USER_A), kind="practice").status_code == 200
    assert all(r["game_day"] is None for r in supabase_db.rows("seed_rush_runs"))


# ══ Scoring and matching ═══════════════════════════════════════════════════════

V = {"id": 1, "slug": "s", "reference": "R", "text": "The careful gardener waters the seed before the sun rises.",
     "blanks": ["careful", "seed", "sun"], "easy_blank": "seed",
     "easy_wrong": ["stone", "cloud"], "medium_wrong": ["lazy", "river", "moon"]}


@pytest.mark.parametrize("mode,answers,right,points", [
    ("easy", ["seed"], [True], 1),
    ("easy", ["stone"], [False], 0),
    ("medium", ["careful", "seed", "sun"], [True, True, True], 6),
    ("medium", ["careful", "moon", "sun"], [True, False, True], 4),
    ("hard", ["careful", "seed", "sun"], [True, True, True], 15),
    ("hard", ["carefull", "seeds", "SUN."], [True, False, True], 10),
    ("hard", ["", "", ""], [False, False, False], 0),
])
def test_scoring_per_mode_with_partial_credit(mode, answers, right, points):
    assert sr.grade(V, mode, answers) == {"right": right, "points": points}


@pytest.mark.parametrize("typed,correct,ok", [
    ("Borrower", "borrower", True),          # case
    ("  borrower, ", "borrower", True),      # punctuation and spaces
    ("borower", "borrower", True),           # one deletion, 8 letters
    ("borrowar", "borrower", True),          # one substitution
    ("borrowerr", "borrower", True),         # one insertion
    ("borowar", "borrower", False),          # two edits
    ("ricg", "rich", False),                 # a typo in a 4-letter word
    ("rich", "rich", True),
    ("slaev", "slave", False),               # a swap is two edits
    ("slavr", "slave", True),                # 5 letters: one typo allowed
    ("", "slave", False),
])
def test_hard_matching(typed, correct, ok):
    assert sr.typed_matches(typed, correct) is ok


def test_medium_does_not_forgive_typos():
    assert sr.grade(V, "medium", ["carefull", "seed", "sun"])["right"] == [False, True, True]


def test_minimum_believable_time():
    assert sr.too_fast("easy", 399) and not sr.too_fast("easy", 400)
    assert sr.too_fast("medium", 1199) and not sr.too_fast("medium", 1200)
    assert sr.too_fast("hard", 1499) and not sr.too_fast("hard", 1500)


def test_ties_break_on_wrong_words_then_the_earlier_finish():
    runs = [
        {"id": "a", "score": 10, "words_wrong": 2, "finished_at": "2026-11-05T13:00:00+00:00", "deadline_at": "x"},
        {"id": "b", "score": 10, "words_wrong": 1, "finished_at": "2026-11-05T14:00:00+00:00", "deadline_at": "x"},
        {"id": "c", "score": 10, "words_wrong": 1, "finished_at": "2026-11-05T12:30:00+00:00", "deadline_at": "x"},
        {"id": "d", "score": 12, "words_wrong": 5, "finished_at": "2026-11-05T20:00:00+00:00", "deadline_at": "x"},
    ]
    assert [r["id"] for r in sr.ranked(runs)] == ["d", "c", "b", "a"]


@pytest.mark.parametrize("days,want", [
    ([TODAY, TODAY - datetime.timedelta(days=1), TODAY - datetime.timedelta(days=2)], 3),
    ([TODAY - datetime.timedelta(days=1), TODAY - datetime.timedelta(days=2)], 2),   # today not played yet
    ([TODAY, TODAY - datetime.timedelta(days=2)], 1),                                 # a gap breaks it
    ([TODAY - datetime.timedelta(days=2)], 0),                                        # ended two days ago
    ([], 0),
])
def test_streak(days, want):
    assert sr.streak(days, TODAY) == want


# ══ The API: questions never carry answers ═════════════════════════════════════

QUESTION_KEYS = {"position", "verse_id", "reference", "segments", "options"}


def assert_no_answers(db, question: dict, mode: str):
    assert set(question) <= QUESTION_KEYS
    assert ("options" in question) is (mode != "hard")
    text = "".join(s.get("v", "") for s in question["segments"])
    for word in correct_answers(db, question, mode):
        assert not sr.word_spans(text, word), f"{word!r} leaked into the segments"
    if mode == "hard":
        dumped = json.dumps(question).lower()
        for word in correct_answers(db, question, mode):
            assert not re.search(rf"\b{re.escape(word.lower())}\b", dumped)


@pytest.mark.parametrize("mode", sr.MODES)
def test_answers_are_never_in_any_question(game, supabase_db, clock, mode):
    res = start(game, auth(USER_A), "practice", mode).json()
    assert {"run_id", "deadline_at", "server_time", "question"} <= set(res)
    assert not {"verse_order", "blanks", "answers", "correct"} & set(res)
    q, seen = res["question"], 0
    blanks = [s for s in q["segments"] if s["t"] == "blank"]
    assert [b["id"] for b in blanks] == list(range(1 if mode == "easy" else 3))
    while q is not None:
        assert_no_answers(supabase_db, q, mode)
        if mode != "hard":
            assert len(q["options"]) == (3 if mode == "easy" else 6)
        clock.tick(2)
        nxt = answer(game, auth(USER_A), res["run_id"], q["position"],
                     correct_answers(supabase_db, q, mode)).json()
        q, seen = nxt["question"], seen + 1
    assert seen == 6


def test_a_full_run(game, supabase_db, clock):
    run, last = play(game, supabase_db, clock, auth(USER_A), mode="medium", wrong_first=1)
    body = last.json()
    assert body["finished"] is True and body["question"] is None
    assert body["score"] == 6 * 4 and body["words_right"] == 12 and body["words_wrong"] == 6
    assert [r["right"] for r in body["results"]] == [False, True, True]

    done = finish(game, auth(USER_A), run["run_id"]).json()
    assert done["score"] == 24 and done["words_wrong"] == 6
    assert len(done["verses"]) == 6 and all(v["answered"] for v in done["verses"])
    assert {v["slug"] for v in done["verses"]} == {f"test-gardener-{i}" for i in range(1, 7)}
    assert done["streak"] == 1
    assert done["rank"] is None          # no username or verification yet
    # Idempotent.
    assert finish(game, auth(USER_A), run["run_id"]).json() == done


def test_the_answer_response_reveals_the_verses_own_spelling(game, supabase_db, clock):
    """Verse 5 opens with "Quiet"; the correct word comes back capitalised."""
    run = start(game, auth(USER_A), "practice", "hard").json()
    q = run["question"]
    while verse_by_id(supabase_db, q["verse_id"])["slug"] != "test-gardener-5":
        clock.tick(2)
        q = answer(game, auth(USER_A), run["run_id"], q["position"], ["x", "y", "z"]).json()["question"]
    clock.tick(2)
    res = answer(game, auth(USER_A), run["run_id"], q["position"], ["quiet", "simple", "glad"]).json()
    assert [r["correct"] for r in res["results"]] == ["Quiet", "simple", "glad"]
    assert res["points"] == 15


# ══ One try per verse, the clock ══════════════════════════════════════════════

def test_wrong_position_and_repeat_answers_are_rejected(game, supabase_db, clock):
    run = start(game, auth(USER_A)).json()
    q = run["question"]
    clock.tick(2)
    assert answer(game, auth(USER_A), run["run_id"], 1, ["a", "b", "c"]).json()["detail"]["code"] == "wrong_position"
    assert answer(game, auth(USER_A), run["run_id"], 0, ["a", "b", "c"]).status_code == 200
    again = answer(game, auth(USER_A), run["run_id"], 0, correct_answers(supabase_db, q, "medium"))
    assert again.status_code == 409 and again.json()["detail"]["code"] == "already_answered"
    assert len(supabase_db.rows("seed_rush_answers")) == 1


def test_wrong_number_of_answers_is_rejected(game, clock):
    run = start(game, auth(USER_A), mode="easy").json()
    clock.tick(2)
    res = answer(game, auth(USER_A), run["run_id"], 0, ["a", "b"])
    assert res.status_code == 422 and res.json()["detail"]["code"] == "wrong_answer_count"


def test_an_answer_in_the_grace_period_counts_and_ends_the_run(game, supabase_db, clock):
    run = start(game, auth(USER_A), mode="hard").json()
    clock.tick(sr.RUN_SECONDS + 2)
    res = answer(game, auth(USER_A), run["run_id"], 0, correct_answers(supabase_db, run["question"], "hard"))
    assert res.status_code == 200
    assert res.json()["finished"] is True and res.json()["question"] is None and res.json()["points"] == 15
    stored = supabase_db.rows("seed_rush_runs")[0]
    assert stored["finished_at"] == run["deadline_at"]     # ended when the clock did


def test_an_answer_after_the_grace_period_is_rejected_and_the_run_finishes(game, supabase_db, clock):
    run = start(game, auth(USER_A), mode="hard").json()
    clock.tick(sr.RUN_SECONDS + sr.GRACE_SECONDS + 1)
    res = answer(game, auth(USER_A), run["run_id"], 0, ["a", "b", "c"])
    assert res.status_code == 409 and res.json()["detail"]["code"] == "time_up"
    assert supabase_db.rows("seed_rush_runs")[0]["finished_at"] == run["deadline_at"]
    assert supabase_db.rows("seed_rush_answers") == []
    again = answer(game, auth(USER_A), run["run_id"], 0, ["a", "b", "c"])
    assert again.json()["detail"]["code"] == "run_finished"
    done = finish(game, auth(USER_A), run["run_id"]).json()
    assert done["score"] == 0
    # The verse on screen when time ran out is listed, unanswered.
    assert done["verses"] == [{"position": 0, "verse_id": run["question"]["verse_id"],
                               "slug": done["verses"][0]["slug"], "reference": run["question"]["reference"],
                               "answered": False, "right": False, "points": 0}]


def test_finishing_early_ends_the_run(game, clock):
    run = start(game, auth(USER_A)).json()
    clock.tick(5)
    done = finish(game, auth(USER_A), run["run_id"]).json()
    assert done["finished_at"] == clock.now.isoformat()
    assert answer(game, auth(USER_A), run["run_id"], 0, ["a", "b", "c"]).json()["detail"]["code"] == "run_finished"


# ══ One daily run per account and per guest ═══════════════════════════════════

def test_one_daily_run_per_account(game, clock):
    assert start(game, auth(USER_A), mode="easy").status_code == 200
    res = start(game, auth(USER_A), mode="hard")
    assert res.status_code == 409 and res.json()["detail"]["code"] == "already_played"
    assert start(game, auth(USER_A), kind="practice").status_code == 200
    assert start(game, auth(USER_B)).status_code == 200


def test_one_daily_run_per_guest(game, clock):
    assert start(game, guest(GUEST_1)).status_code == 200
    assert start(game, guest(GUEST_1)).status_code == 409
    assert start(game, guest(GUEST_2)).status_code == 200
    assert start(game, guest(GUEST_1), kind="practice").status_code == 200


def test_a_new_game_day_allows_a_new_daily_run(game, clock):
    assert start(game, auth(USER_A)).status_code == 200
    clock.now = at(2026, 11, 6, 11, 59)          # 6:59 AM New York: still the 5th
    assert start(game, auth(USER_A)).status_code == 409
    clock.now = at(2026, 11, 6, 12, 0)           # 7:00 AM
    assert start(game, auth(USER_A)).status_code == 200


def test_the_guest_header_must_be_a_uuid(game):
    res = start(game, guest("not-a-uuid"))
    assert res.status_code == 400 and res.json()["detail"]["code"] == "invalid_guest_id"


def test_a_bad_token_never_falls_back_to_guest(game):
    res = start(game, {"Authorization": "Bearer junk", **guest()})
    assert res.status_code == 401


def test_no_verses_yet(client, supabase_db, clock):
    res = start(client, guest())
    assert res.status_code == 503 and res.json()["detail"]["code"] == "no_verses"


# ══ Minimum believable time ═══════════════════════════════════════════════════

def test_a_too_fast_answer_flags_the_run_without_rejecting_it(game, supabase_db, clock):
    seed_profile(supabase_db, USER_A, "Speedy")
    run = start(game, auth(USER_A), mode="hard").json()
    clock.tick(1.0)                               # under hard's 1500 ms
    res = answer(game, auth(USER_A), run["run_id"], 0, correct_answers(supabase_db, run["question"], "hard"))
    assert res.status_code == 200 and res.json()["points"] == 15
    stored = supabase_db.rows("seed_rush_runs")[0]
    assert stored["flagged"] is True and "1000 ms" in stored["flag_reason"]
    assert supabase_db.rows("seed_rush_answers")[0]["elapsed_ms"] == 1000
    done = finish(game, auth(USER_A), run["run_id"]).json()
    assert done["score"] == 15 and done["rank"] is None
    assert game.get("/seed-rush/leaderboard").json()["entries"] == []


def test_the_clock_for_each_verse_starts_when_it_is_served(game, supabase_db, clock):
    run = start(game, auth(USER_A), mode="easy").json()
    clock.tick(5)
    nxt = answer(game, auth(USER_A), run["run_id"], 0, ["x"]).json()["question"]
    clock.tick(0.5)                               # 500 ms after verse 1 was served: fine for easy
    answer(game, auth(USER_A), run["run_id"], nxt["position"], ["x"])
    assert [a["elapsed_ms"] for a in supabase_db.rows("seed_rush_answers")] == [5000, 500]
    assert supabase_db.rows("seed_rush_runs")[0]["flagged"] is False


# ══ Ownership ═════════════════════════════════════════════════════════════════

def test_another_players_run_is_a_404(game, clock):
    mine = start(game, auth(USER_A)).json()["run_id"]
    theirs = start(game, guest(GUEST_1)).json()["run_id"]
    clock.tick(2)
    for headers, run_id in ((auth(USER_B), mine), (guest(GUEST_2), mine), (guest(GUEST_1), mine),
                            (auth(USER_A), theirs), (guest(GUEST_2), theirs)):
        assert answer(game, headers, run_id, 0, ["a", "b", "c"]).status_code == 404
        assert finish(game, headers, run_id).status_code == 404
    assert finish(game, auth(USER_A), "not-a-uuid").status_code == 404


# ══ Leaderboard ═══════════════════════════════════════════════════════════════

def test_the_leaderboard_only_ranks_verified_named_unflagged_accounts(game, supabase_db):
    seed_profile(supabase_db, USER_A, "Alpha")
    seed_profile(supabase_db, USER_B, "Beta", verified=False)
    seed_profile(supabase_db, USER_C, None)
    flagged_user = "44444444-4444-4444-4444-444444444444"
    seed_profile(supabase_db, flagged_user, "Fast")
    seed_run(supabase_db, user_id=USER_A, score=10)
    seed_run(supabase_db, user_id=USER_B, score=50)                       # unverified
    seed_run(supabase_db, user_id=USER_C, score=60)                       # no username
    seed_run(supabase_db, guest_id=GUEST_1, score=70)                     # guest
    seed_run(supabase_db, user_id=flagged_user, score=80, flagged=True)   # flagged
    seed_run(supabase_db, user_id=USER_A, score=90, kind="practice")      # practice
    body = game.get("/seed-rush/leaderboard").json()
    assert body["game_day"] == "2026-11-05"
    assert body["entries"] == [{"rank": 1, "username": "Alpha", "mode": "hard", "score": 10, "words_wrong": 0}]
    assert body["me"] is None


def test_the_leaderboard_order_and_the_callers_own_row(game, supabase_db):
    for i, (user, score, wrong, fin) in enumerate([
        (USER_A, 30, 2, "2026-11-05T13:00:00+00:00"),
        (USER_B, 30, 1, "2026-11-05T14:00:00+00:00"),
        (USER_C, 40, 9, "2026-11-05T20:00:00+00:00"),
    ]):
        seed_profile(supabase_db, user, f"P{i}")
        seed_run(supabase_db, user_id=user, score=score, wrong=wrong, finished_at=fin)
    body = game.get("/seed-rush/leaderboard", headers=auth(USER_A)).json()
    assert [(e["rank"], e["username"]) for e in body["entries"]] == [(1, "P2"), (2, "P1"), (3, "P0")]
    assert body["me"] == {"rank": 3, "username": "P0", "mode": "hard", "score": 30, "words_wrong": 2}


def test_the_leaderboard_shows_the_top_100(game, supabase_db):
    for i in range(105):
        uid = f"00000000-0000-4000-9000-{i:012d}"
        seed_profile(supabase_db, uid, f"p{i:03d}")
        seed_run(supabase_db, user_id=uid, score=i)
    body = game.get("/seed-rush/leaderboard", headers=auth("00000000-0000-4000-9000-000000000000")).json()
    assert len(body["entries"]) == 100 and body["entries"][0]["score"] == 104
    assert body["me"]["rank"] == 105


def test_the_leaderboard_for_another_day(game, supabase_db):
    seed_profile(supabase_db, USER_A, "Alpha")
    seed_run(supabase_db, user_id=USER_A, day=TODAY - datetime.timedelta(days=1), score=5)
    assert game.get("/seed-rush/leaderboard").json()["entries"] == []
    body = game.get("/seed-rush/leaderboard", params={"day": "2026-11-04"}).json()
    assert body["game_day"] == "2026-11-04" and body["entries"][0]["score"] == 5
    bad = game.get("/seed-rush/leaderboard", params={"day": "yesterday"})
    assert bad.status_code == 422 and bad.json()["detail"]["code"] == "invalid_day"


def test_a_run_still_in_progress_is_not_ranked_until_its_time_is_up(game, supabase_db, clock):
    seed_profile(supabase_db, USER_A, "Alpha")
    run = start(game, auth(USER_A), mode="easy").json()
    clock.tick(2)
    answer(game, auth(USER_A), run["run_id"], 0, ["x"])
    assert game.get("/seed-rush/leaderboard").json()["entries"] == []
    clock.tick(sr.RUN_SECONDS + sr.GRACE_SECONDS)     # the tab was closed; time ran out
    assert len(game.get("/seed-rush/leaderboard").json()["entries"]) == 1


def test_finish_reports_todays_rank(game, supabase_db, clock):
    seed_profile(supabase_db, USER_B, "Beta")
    seed_run(supabase_db, user_id=USER_B, score=1000)
    seed_profile(supabase_db, USER_A, "Alpha")
    run, _ = play(game, supabase_db, clock, auth(USER_A), mode="easy")
    assert finish(game, auth(USER_A), run["run_id"]).json()["rank"] == 2


# ══ /me and streaks ═══════════════════════════════════════════════════════════

def test_me(game, supabase_db, clock):
    body = game.get("/seed-rush/me", headers=auth(USER_A)).json()
    assert body == {"username": None, "email_verified": False, "email_verified_at": None,
                    "streak": 0, "game_day": "2026-11-05", "played_today": False, "today_run": None}
    run = start(game, auth(USER_A), mode="easy").json()
    body = game.get("/seed-rush/me", headers=auth(USER_A)).json()
    assert body["played_today"] is True and body["today_run"]["finished"] is False
    assert body["streak"] == 0                       # not finished yet
    finish(game, auth(USER_A), run["run_id"])
    body = game.get("/seed-rush/me", headers=auth(USER_A)).json()
    assert body["today_run"]["finished"] is True and body["streak"] == 1


def test_streaks_count_finished_daily_runs_in_any_mode(game, supabase_db, clock):
    for back, mode in ((1, "easy"), (2, "hard"), (3, "medium"), (5, "easy")):
        seed_run(supabase_db, user_id=USER_A, day=TODAY - datetime.timedelta(days=back), mode=mode)
    seed_run(supabase_db, user_id=USER_A, kind="practice")             # never counts
    assert game.get("/seed-rush/me", headers=auth(USER_A)).json()["streak"] == 3
    run, _ = play(game, supabase_db, clock, auth(USER_A), mode="hard", steps=1)
    assert finish(game, auth(USER_A), run["run_id"]).json()["streak"] == 4


def test_me_requires_sign_in(game):
    assert game.get("/seed-rush/me", headers=guest()).status_code == 401


# ══ Guest claim ═══════════════════════════════════════════════════════════════

def test_claiming_a_guest_moves_its_runs_and_streak(game, supabase_db, clock):
    for back in (1, 2):
        seed_run(supabase_db, guest_id=GUEST_1, day=TODAY - datetime.timedelta(days=back))
    seed_run(supabase_db, guest_id=GUEST_1, kind="practice")
    run, _ = play(game, supabase_db, clock, guest(GUEST_1), steps=1)
    assert finish(game, guest(GUEST_1), run["run_id"]).json()["streak"] == 3

    res = game.post("/seed-rush/guest/claim", headers=auth(USER_A), json={"guest_id": GUEST_1})
    assert res.status_code == 200
    assert res.json() == {"claimed_runs": 4, "skipped_runs": 0, "already_claimed": False, "streak": 3}
    assert all(r["user_id"] == USER_A and r["guest_id"] is None for r in supabase_db.rows("seed_rush_runs"))
    assert game.get("/seed-rush/me", headers=auth(USER_A)).json()["streak"] == 3
    # Today's daily is now the account's, so it can't play another.
    assert start(game, auth(USER_A)).status_code == 409


def test_a_same_day_conflict_keeps_the_accounts_run(game, supabase_db, clock):
    mine = seed_run(supabase_db, user_id=USER_A, score=5)
    theirs = seed_run(supabase_db, guest_id=GUEST_1, score=99)
    seed_run(supabase_db, guest_id=GUEST_1, day=TODAY - datetime.timedelta(days=1))
    res = game.post("/seed-rush/guest/claim", headers=auth(USER_A), json={"guest_id": GUEST_1}).json()
    assert res["claimed_runs"] == 1 and res["skipped_runs"] == 1 and res["streak"] == 2
    rows = {r["id"]: r for r in supabase_db.rows("seed_rush_runs")}
    assert rows[mine["id"]]["score"] == 5 and rows[mine["id"]]["user_id"] == USER_A
    assert rows[theirs["id"]]["guest_id"] == GUEST_1 and rows[theirs["id"]]["user_id"] is None


def test_a_guest_can_be_claimed_only_once(game, supabase_db):
    seed_run(supabase_db, guest_id=GUEST_1)
    assert game.post("/seed-rush/guest/claim", headers=auth(USER_A), json={"guest_id": GUEST_1}).status_code == 200
    again = game.post("/seed-rush/guest/claim", headers=auth(USER_B), json={"guest_id": GUEST_1})
    assert again.status_code == 409 and again.json()["detail"]["code"] == "already_claimed"
    same = game.post("/seed-rush/guest/claim", headers=auth(USER_A), json={"guest_id": GUEST_1})
    assert same.status_code == 200 and same.json()["already_claimed"] is True
    assert [r["user_id"] for r in supabase_db.rows("seed_rush_runs")] == [USER_A]


def test_a_claim_needs_an_account_and_a_uuid(game):
    assert game.post("/seed-rush/guest/claim", headers=guest(), json={"guest_id": GUEST_1}).status_code == 401
    res = game.post("/seed-rush/guest/claim", headers=auth(USER_A), json={"guest_id": "x"})
    assert res.status_code == 400


# ══ Usernames ═════════════════════════════════════════════════════════════════

@pytest.mark.parametrize("name,reason", [
    ("ab", "too_short"),
    ("a" * 21, "too_long"),
    ("has space", "invalid_characters"),
    ("dash-name", "invalid_characters"),
    ("émile", "invalid_characters"),
    ("ADMIN", "reserved"),
    ("Dollar_Seeds", "reserved"),
    ("benny", "reserved"),
    ("Support_1", "reserved"),
    ("fuck", "profane"),
    ("FuCk_you", "profane"),
    ("f_u_c_k", "profane"),
    ("sh1t", "profane"),
    ("5h1th3ad", "profane"),
    ("iamfuckingcool", "profane"),
    ("big_a55_guy", "profane"),
    ("b1tch99", "profane"),
])
def test_username_rules(name, reason):
    assert sr.username_problem(name) == reason


@pytest.mark.parametrize("name", ["Gardener", "abc", "a" * 20, "seed_sower_7", "classic_guy",
                                  "peacock", "Grapes4u", "therapist", "assassin", "moderation",
                                  "helper", "Hancock", "cocktail_free"])
def test_innocent_usernames_are_allowed(name):
    assert sr.username_problem(name) is None


def test_the_substring_check_has_known_false_positives():
    """The price of catching slurs glued to other words: a few real words that
    contain one are refused too. Accepted, and pinned so it is a choice, not a surprise."""
    assert sr.username_problem("Scunthorpe") == "profane"


def test_username_check_and_set(game, supabase_db):
    assert game.get("/seed-rush/username/check", params={"u": "Gardener"}).json() == {
        "username": "Gardener", "valid": True, "available": True, "reason": None}
    assert game.get("/seed-rush/username/check", params={"u": "sh1t"}).json()["reason"] == "profane"

    res = game.put("/seed-rush/username", headers=auth(USER_A), json={"username": "Gardener"})
    assert res.status_code == 200 and res.json() == {"username": "Gardener"}
    for u in ("gardener", "GARDENER"):
        assert game.get("/seed-rush/username/check", params={"u": u}).json()["reason"] == "taken"
        res = game.put("/seed-rush/username", headers=auth(USER_B), json={"username": u})
        assert res.status_code == 409 and res.json()["detail"]["code"] == "taken"
    # The owner may change the capitals of their own name.
    assert game.put("/seed-rush/username", headers=auth(USER_A), json={"username": "GARDENER"}).status_code == 200
    bad = game.put("/seed-rush/username", headers=auth(USER_B), json={"username": "Admin"})
    assert bad.status_code == 400 and bad.json()["detail"]["code"] == "reserved"


def test_underscore_is_not_a_wildcard_in_the_taken_check(game, supabase_db):
    """`ilike` reads `_` as any character; "a_b" must not count as taken by "axb"."""
    seed_profile(supabase_db, USER_A, "seedxsower")
    assert game.get("/seed-rush/username/check", params={"u": "seed_sower"}).json()["available"] is True
    assert game.put("/seed-rush/username", headers=auth(USER_B), json={"username": "seed_sower"}).status_code == 200


def test_the_database_settles_a_username_race(game, supabase_db, monkeypatch):
    """Both callers pass the availability check; the unique index on lower(username)
    refuses the second write."""
    assert game.put("/seed-rush/username", headers=auth(USER_A), json={"username": "Gardener"}).status_code == 200
    monkeypatch.setattr(main, "_sr_username_owner", lambda u: None)
    res = game.put("/seed-rush/username", headers=auth(USER_B), json={"username": "gardener"})
    assert res.status_code == 409


# ══ Email verification ════════════════════════════════════════════════════════

def stored_profile(db, user_id=USER_A) -> dict:
    return next(p for p in db.rows("seed_rush_profiles") if p["user_id"] == user_id)


def link_token(text: str) -> str:
    return re.search(r"verify\?token=([\w-]+)", text).group(1)


def test_without_a_resend_key_the_link_is_logged(game, supabase_db, capsys):
    res = game.post("/seed-rush/verification/send", headers=auth(USER_A))
    assert res.json() == {"status": "sent"}
    out = capsys.readouterr().out
    assert "https://dollarseeds.app/seed-rush/verify?token=" in out
    token = link_token(out)
    profile = stored_profile(supabase_db)
    assert profile["verification_token_hash"] == sr.hash_token(token) != token
    assert token not in json.dumps(supabase_db.rows("seed_rush_profiles"))

    assert game.post("/seed-rush/verification/confirm", json={"token": token}).json() == {"status": "verified"}
    profile = stored_profile(supabase_db)
    assert profile["email_verified_at"] is not None and profile["verification_token_hash"] is None
    assert game.get("/seed-rush/me", headers=auth(USER_A)).json()["email_verified"] is True
    assert game.post("/seed-rush/verification/send", headers=auth(USER_A)).json() == {"status": "already_verified"}
    # Used once: the same link no longer works.
    assert game.post("/seed-rush/verification/confirm", json={"token": token}).json()["detail"]["code"] == "invalid_token"


def test_a_link_expires_after_24_hours(game, supabase_db, clock, capsys):
    game.post("/seed-rush/verification/send", headers=auth(USER_A))
    token = link_token(capsys.readouterr().out)
    clock.tick(24 * 3600 + 1)
    res = game.post("/seed-rush/verification/confirm", json={"token": token})
    assert res.status_code == 400 and res.json()["detail"]["code"] == "expired_token"
    assert stored_profile(supabase_db)["email_verified_at"] is None


def test_an_unknown_token_is_refused(game):
    res = game.post("/seed-rush/verification/confirm", json={"token": "made-up"})
    assert res.status_code == 400 and res.json()["detail"]["code"] == "invalid_token"


def test_at_most_three_sends_an_hour(game, clock):
    for _ in range(3):
        assert game.post("/seed-rush/verification/send", headers=auth(USER_A)).json() == {"status": "sent"}
        clock.tick(60)
    res = game.post("/seed-rush/verification/send", headers=auth(USER_A))
    assert res.status_code == 429 and int(res.headers["Retry-After"]) > 0
    clock.tick(3600)
    assert game.post("/seed-rush/verification/send", headers=auth(USER_A)).json() == {"status": "sent"}


def test_the_email_goes_through_resend(game, supabase_db, monkeypatch):
    sent = []

    class Ok:
        status_code = 200
        text = '{"id":"x"}'

    monkeypatch.setattr(main, "RESEND_API_KEY", "re_test")
    monkeypatch.setattr(main, "_resend_post", lambda payload: sent.append(payload) or Ok())
    seed_profile(supabase_db, USER_A, "Gardener", verified=False)
    assert game.post("/seed-rush/verification/send", headers=auth(USER_A)).json() == {"status": "sent"}
    (msg,) = sent
    assert msg["to"] == [f"{USER_A[:8]}@example.test"] and msg["from"] == main.RESEND_FROM
    assert msg["subject"] == "Confirm your email for Seed Rush"
    assert "Gardener" in msg["text"] and "https://dollarseeds.app/seed-rush/verify?token=" in msg["text"]
    assert link_token(msg["text"]) == link_token(msg["html"])
    assert stored_profile(supabase_db)["verification_token_hash"] == sr.hash_token(link_token(msg["text"]))


@pytest.mark.parametrize("failure", ["refused", "unreachable"])
def test_a_refusing_resend_reports_delayed_and_keeps_the_old_link(game, supabase_db, monkeypatch,
                                                                  capsys, failure):
    game.post("/seed-rush/verification/send", headers=auth(USER_A))
    first = link_token(capsys.readouterr().out)

    class Refused:
        status_code = 429
        text = "daily_quota_exceeded"

    def post(payload):
        if failure == "unreachable":
            raise main.httpx.ConnectError("down")
        return Refused()

    monkeypatch.setattr(main, "RESEND_API_KEY", "re_test")
    monkeypatch.setattr(main, "_resend_post", post)
    res = game.post("/seed-rush/verification/send", headers=auth(USER_A))
    assert res.status_code == 200 and res.json() == {"status": "delayed"}
    assert game.post("/seed-rush/verification/confirm", json={"token": first}).json() == {"status": "verified"}


@pytest.mark.parametrize("app_metadata", [
    {"provider": "google", "providers": ["google"]},
    {"provider": "apple", "providers": ["apple"]},
    {"provider": "email", "providers": ["email", "google"]},
])
def test_google_and_apple_accounts_are_verified_on_their_first_call(game, supabase_db, app_metadata):
    body = game.get("/seed-rush/me", headers=token_with(USER_A, app_metadata=app_metadata)).json()
    assert body["email_verified"] is True
    assert stored_profile(supabase_db)["email_verified_at"] is not None


def test_an_email_account_is_not_auto_verified(game, supabase_db):
    body = game.get("/seed-rush/me", headers=token_with(USER_A, app_metadata={"provider": "email"})).json()
    assert body["email_verified"] is False


def test_a_remotely_verified_token_reads_the_provider_from_supabase(game, supabase_db, monkeypatch):
    """The remote path yields only `sub`; the provider comes from the admin lookup."""
    monkeypatch.setattr(main, "_verified_claims", lambda cred: {"sub": USER_A})
    supabase_db.auth_users[USER_A] = {"email": "a@example.test", "app_metadata": {"provider": "apple"}}
    assert game.get("/seed-rush/me", headers=auth(USER_A)).json()["email_verified"] is True


# ══ Seed Rush only touches its own tables ═════════════════════════════════════

def test_seed_rush_reads_and_writes_only_its_own_tables(game, supabase_db, clock, capsys):
    """Nothing the app reads is touched, and auth is never written: a website-made
    account still sees the app's onboarding on first launch."""
    supabase_db.calls.clear()
    run, _ = play(game, supabase_db, clock, auth(USER_A), mode="medium")
    finish(game, auth(USER_A), run["run_id"])
    game.put("/seed-rush/username", headers=auth(USER_A), json={"username": "Gardener"})
    game.post("/seed-rush/verification/send", headers=auth(USER_A))
    game.post("/seed-rush/verification/confirm", json={"token": link_token(capsys.readouterr().out)})
    game.get("/seed-rush/leaderboard", headers=auth(USER_A))
    game.post("/seed-rush/guest/claim", headers=auth(USER_A), json={"guest_id": GUEST_1})
    game.get("/seed-rush/verses")
    game.get("/seed-rush/day")
    assert {t for _, t in supabase_db.calls} <= {"seed_rush_verses", "seed_rush_profiles", "seed_rush_runs",
                                                 "seed_rush_answers", "seed_rush_guest_claims"}
    assert supabase_db.deleted_auth_users == [] and supabase_db.remote_verify_calls == []


# ══ Public verse list ═════════════════════════════════════════════════════════

def test_the_public_verse_list(game, supabase_db):
    supabase_db.seed("seed_rush_verses", {"slug": "retired", "reference": "Old", "category": "x",
                                          "text": "t", "blanks": [], "easy_blank": "", "easy_wrong": [],
                                          "medium_wrong": [], "active": False})
    res = game.get("/seed-rush/verses")
    assert res.headers["Cache-Control"] == "public, max-age=3600"
    rows = res.json()["verses"]
    assert [v["slug"] for v in rows] == [f"test-gardener-{i}" for i in range(1, 7)]
    assert all(set(v) == {"slug", "reference", "category", "text", "explanation"} for v in rows)
    assert rows[0]["explanation"].startswith("A made-up sentence")


# ══ Abuse limits ══════════════════════════════════════════════════════════════

def test_starts_are_rate_limited_per_caller(game, clock):
    limit = sr.RATE_LIMITS["start"]["caller"][0]
    for _ in range(limit):
        assert start(game, guest(), kind="practice").status_code == 200
    res = start(game, guest(), kind="practice")
    assert res.status_code == 429 and res.json()["detail"]["code"] == "rate_limited"
    assert "Retry-After" in res.headers
    assert start(game, guest(GUEST_2), kind="practice").status_code == 200


def test_requests_are_rate_limited_per_ip(game, monkeypatch):
    monkeypatch.setitem(sr.RATE_LIMITS, "username", {"caller": (100, 60), "ip": (2, 60)})
    hdr = {"X-Forwarded-For": "203.0.113.9, 10.0.0.1"}
    for _ in range(2):
        assert game.get("/seed-rush/username/check", params={"u": "abc"}, headers=hdr).status_code == 200
    assert game.get("/seed-rush/username/check", params={"u": "abc"}, headers=hdr).status_code == 429
    other = {"X-Forwarded-For": "198.51.100.4"}
    assert game.get("/seed-rush/username/check", params={"u": "abc"}, headers=other).status_code == 200


def test_the_rate_limiter_window_slides():
    now = [0.0]
    limiter = sr.RateLimiter(clock=lambda: now[0])
    assert limiter.hit("b", "k", 2, 10) is None
    assert limiter.hit("b", "k", 2, 10) is None
    assert limiter.hit("b", "k", 2, 10) == 11
    now[0] = 10.5
    assert limiter.hit("b", "k", 2, 10) is None


# ══ Account deletion ══════════════════════════════════════════════════════════

def test_account_deletion_removes_seed_rush_rows(game, supabase_db, clock):
    run, _ = play(game, supabase_db, clock, auth(USER_A), steps=2)
    finish(game, auth(USER_A), run["run_id"])
    game.put("/seed-rush/username", headers=auth(USER_A), json={"username": "Gardener"})
    seed_run(supabase_db, guest_id=GUEST_1, day=TODAY - datetime.timedelta(days=1))
    game.post("/seed-rush/guest/claim", headers=auth(USER_A), json={"guest_id": GUEST_1})
    other, _ = play(game, supabase_db, clock, auth(USER_B), steps=1)
    supabase_db.seed("expenses", {"user_id": USER_A, "title": "x", "amount": 1.0, "category": "Needs",
                                  "day": 1, "month": "March"})

    res = game.post("/account/delete/", headers=auth(USER_A), json={"confirmation": "DELETE"})
    assert res.json() == {"deleted": True}
    assert [r["user_id"] for r in supabase_db.rows("seed_rush_runs")] == [USER_B]
    assert [p["user_id"] for p in supabase_db.rows("seed_rush_profiles")] == [USER_B]
    assert {a["run_id"] for a in supabase_db.rows("seed_rush_answers")} == {other["run_id"]}
    assert supabase_db.rows("seed_rush_guest_claims") == []
    assert supabase_db.rows("expenses") == [] and supabase_db.deleted_auth_users == [USER_A]
    # Verses are shared content and stay.
    assert len(supabase_db.rows("seed_rush_verses")) == 6


# ══ The verse file and its loader ═════════════════════════════════════════════

def entry(**changes) -> dict:
    base = json.loads(FIXTURE.read_text(encoding="utf-8"))[0]
    return {**base, **changes}


@pytest.mark.parametrize("changes,message", [
    ({"blanks": ["careful", "seed"]}, "exactly 3"),
    ({"blanks": ["careful", "seed", "moon"]}, "'moon' appears 0 times"),
    ({"blanks": ["care", "seed", "sun"]}, "'care' appears 0 times"),           # whole words only
    ({"text": "The careful gardener waters the seed before the sun rises, sun or rain."},
     "'sun' appears 2 times"),
    ({"blanks": ["seed", "careful", "sun"]}, "in the order they appear"),
    ({"easy_blank": "gardener"}, "`easy_blank` must be one of"),
    ({"easy_wrong": ["stone"]}, "exactly 2"),
    ({"easy_wrong": ["stone", "gardener"]}, "'gardener' appears in the verse"),
    ({"medium_wrong": ["lazy", "river"]}, "exactly 3"),
    ({"medium_wrong": ["lazy", "river", "Rises"]}, "'Rises' appears in the verse"),
    ({"medium_wrong": ["lazy", "river", "LAZY"]}, "same word twice"),
    ({"slug": "Bad Slug"}, "`slug`"),
    ({"active": "yes"}, "`active`"),
    ({"surprise": 1}, "unknown field"),
])
def test_the_loader_refuses_a_broken_verse(changes, message):
    with pytest.raises(sr.SeedRushError) as err:
        sr.validate_verses([entry(**changes)])
    assert message in str(err.value)
    assert "test-gardener-1" in str(err.value) or "slug" in message


def test_the_loader_refuses_duplicate_slugs():
    with pytest.raises(sr.SeedRushError, match="'test-gardener-1': slug is used more than once"):
        sr.validate_verses([entry(), entry()])


def test_the_shipped_verse_file_is_valid():
    # Built from the review spreadsheet by build_seed_rush_verses.py.
    verses = loader.read_file(loader.DEFAULT_PATH)
    assert verses and all(v["explanation"] for v in verses)


def test_the_loader_upserts_by_slug_deactivates_and_never_deletes(supabase_db, fixture_verses):
    first = loader.sync(supabase_db, fixture_verses)
    assert len(first["inserted"]) == 6
    ids = {r["slug"]: r["id"] for r in supabase_db.rows("seed_rush_verses")}

    again = loader.sync(supabase_db, fixture_verses)
    assert again == {"inserted": [], "updated": [], "unchanged": [v["slug"] for v in fixture_verses],
                     "deactivated": []}

    edited = [{**fixture_verses[0], "explanation": "Rewritten."}, *fixture_verses[1:5]]
    third = loader.sync(supabase_db, edited)
    assert third["updated"] == ["test-gardener-1"] and third["deactivated"] == ["test-gardener-6"]
    rows = {r["slug"]: r for r in supabase_db.rows("seed_rush_verses")}
    assert len(rows) == 6 and {s: r["id"] for s, r in rows.items()} == ids
    assert rows["test-gardener-1"]["explanation"] == "Rewritten." and rows["test-gardener-6"]["active"] is False

    back = loader.sync(supabase_db, fixture_verses)
    assert back["updated"] == ["test-gardener-1", "test-gardener-6"]
    assert all(r["active"] for r in supabase_db.rows("seed_rush_verses"))


def test_the_loader_cli_validates_without_writing(tmp_path, capsys):
    bad = tmp_path / "verses.json"
    bad.write_text(json.dumps([entry(easy_blank="nope")]), encoding="utf-8")
    assert loader.main([str(bad), "--dry-run"]) == 1
    assert "test-gardener-1" in capsys.readouterr().err
    assert loader.main([str(FIXTURE), "--dry-run"]) == 0
