"""Seed Rush — the daily Bible-verse game on the website, as pure functions.

Players fill in missing words from verses about money, work and stewardship against
a 60-second clock. Nothing here touches Supabase or FastAPI: main.py loads the rows,
calls these, and writes back what they say. Tests drive them with plain dicts and a
fixed clock (tests/test_seed_rush.py).

The server keeps the answers, the clock and the score. A browser is only ever sent a
verse as segments with holes in it, plus (in easy and medium) the words to choose
from; it never sends a score.

Data lives only in the seed_rush_* tables (migration 0015). Accounts are the app's
own Supabase accounts, but nothing here reads or writes user metadata: the app keys
its onboarding off `user_metadata.onboarding_v2_completed_at`, and a website-created
account must still see that onboarding on its first app launch.
"""

from __future__ import annotations

import collections
import datetime
import hashlib
import hmac
import html
import re
import secrets
import threading
import time
from typing import Iterable, Optional
from zoneinfo import ZoneInfo

from better_profanity import profanity

# ── The game day ─────────────────────────────────────────────────────────────
# A day starts at 7:00 AM New York time, by the wall clock, so daylight saving time
# never moves it. zoneinfo (not a fixed UTC offset) is what makes that true.
GAME_TIMEZONE = "America/New_York"
GAME_TZ = ZoneInfo(GAME_TIMEZONE)
GAME_DAY_START_HOUR = 7

# ── Modes, kinds, points ─────────────────────────────────────────────────────
KIND_DAILY = "daily"
KIND_PRACTICE = "practice"
KINDS = (KIND_DAILY, KIND_PRACTICE)

MODE_EASY = "easy"
MODE_MEDIUM = "medium"
MODE_HARD = "hard"
MODES = (MODE_EASY, MODE_MEDIUM, MODE_HARD)

# Easy scores per verse (it has one blank); medium and hard per correct word.
POINTS = {MODE_EASY: 1, MODE_MEDIUM: 2, MODE_HARD: 5}

# ── The clock ────────────────────────────────────────────────────────────────
RUN_SECONDS = 60
# Answers are accepted this long after the deadline, for network delay.
GRACE_SECONDS = 3

# An answer faster than this after its question was served is not rejected; it flags
# the run, and flagged runs never reach the leaderboard.
MIN_ANSWER_MS = {MODE_EASY: 400, MODE_MEDIUM: 1200, MODE_HARD: 1500}

# ── Hard mode's typed answers ────────────────────────────────────────────────
# Words at least this long may be off by this many edits (a typo).
HARD_TYPO_MIN_LENGTH = 5
HARD_TYPO_MAX_DISTANCE = 1
# Longest answer string accepted for one blank.
MAX_ANSWER_LENGTH = 60

LEADERBOARD_SIZE = 100

# ── Usernames ────────────────────────────────────────────────────────────────
USERNAME_MIN_LENGTH = 3
USERNAME_MAX_LENGTH = 20
USERNAME_PATTERN = re.compile(r"^[A-Za-z0-9_]+$")
RESERVED_USERNAMES = frozenset({
    "admin", "administrator", "dollarseeds", "dollar_seeds", "benny", "support",
    "moderator", "mod", "staff", "official", "help",
})
# Applied before digits are dropped, so "sh1t" still reads as "shit".
LEET_MAP = str.maketrans({"0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t",
                          "@": "a", "$": "s"})
# better-profanity matches whole words only, so a word glued to others
# ("iamfuckingcool") slips through it. These are checked as SUBSTRINGS of the
# normalized username. The list is kept to roots that almost never occur inside
# innocent words: "ass", "cock", "rape" and the like are left to the whole-word check,
# because as substrings they would refuse "classic", "peacock" and "grapes". A few
# real words still trip it ("Scunthorpe"); blocking slurs glued into a name is worth it.
PROFANE_FRAGMENTS = (
    "fuck", "shit", "cunt", "nigg", "fagg", "bitch", "whore", "slut", "porn", "pussy",
    "dildo", "retard", "jizz", "twat", "asshole", "bastard", "motherf", "wank",
)

# ── Email verification ───────────────────────────────────────────────────────
VERIFY_TOKEN_BYTES = 32
VERIFY_TTL = datetime.timedelta(hours=24)
VERIFY_SENDS_PER_WINDOW = 3
VERIFY_SEND_WINDOW = datetime.timedelta(hours=1)
VERIFY_LINK = "https://dollarseeds.app/seed-rush/verify?token={token}"
# Sign-in providers that have already confirmed the email address.
VERIFIED_PROVIDERS = frozenset({"google", "apple"})

# ── Abuse limits: (requests, per seconds), per caller and per IP ─────────────
# Generous on purpose: a fast honest player answers easy verses at most a couple of
# times a second, and a church group or classroom can share one IP.
RATE_LIMITS = {
    "start": {"caller": (30, 60), "ip": (300, 60)},
    "answer": {"caller": (240, 60), "ip": (3000, 60)},
    "username": {"caller": (60, 60), "ip": (240, 60)},
}
# Beyond these limits nothing stops a bot that has learned the public verses
# (GET /seed-rush/verses lists them all). For now that is handled by watching the
# leaderboard by hand.


class SeedRushError(Exception):
    """A rule the verse file breaks. The message names the verse."""


# ═════════════════════════════════════════════════════════════════════════════
# Time
# ═════════════════════════════════════════════════════════════════════════════

def utc(value) -> Optional[datetime.datetime]:
    """A timestamptz as PostgREST returns it (ISO text) → an aware UTC datetime."""
    if value is None:
        return None
    if isinstance(value, datetime.datetime):
        dt = value
    else:
        dt = datetime.datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=datetime.timezone.utc)
    return dt.astimezone(datetime.timezone.utc)


def iso(dt: datetime.datetime) -> str:
    return dt.astimezone(datetime.timezone.utc).isoformat()


def game_day(now: datetime.datetime) -> datetime.date:
    """The game day `now` falls in: the New York date of (now − 7 hours), by the wall
    clock. Before 7:00 AM New York it is still yesterday's game."""
    local = now.astimezone(GAME_TZ)
    day = local.date()
    return day if local.hour >= GAME_DAY_START_HOUR else day - datetime.timedelta(days=1)


def day_starts_at(day: datetime.date) -> datetime.datetime:
    """When `day`'s game begins, in UTC. 7:00 AM is never inside a DST gap (those are
    at 2 AM), so this is always a real, single instant."""
    local = datetime.datetime(day.year, day.month, day.day, GAME_DAY_START_HOUR, tzinfo=GAME_TZ)
    return local.astimezone(datetime.timezone.utc)


def next_day_starts_at(now: datetime.datetime) -> datetime.datetime:
    return day_starts_at(game_day(now) + datetime.timedelta(days=1))


def parse_day(value) -> Optional[datetime.date]:
    if value is None:
        return None
    if isinstance(value, datetime.date):
        return value
    try:
        return datetime.date.fromisoformat(str(value)[:10])
    except ValueError:
        return None


# ═════════════════════════════════════════════════════════════════════════════
# Deterministic order
# ═════════════════════════════════════════════════════════════════════════════

def _keyed_int(secret: bytes, message: str) -> int:
    return int.from_bytes(hmac.new(secret, message.encode("utf-8"), hashlib.sha256).digest(), "big")


def keyed_shuffle(items: Iterable, secret: bytes, label: str) -> list:
    """Fisher–Yates driven by HMAC(secret, label|i). Same secret and label → same
    order, on every server and every Python version (random.Random makes no such
    promise for shuffle). Without the secret, a future day's order is unknowable."""
    out = list(items)
    for i in range(len(out) - 1, 0, -1):
        j = _keyed_int(secret, f"{label}|{i}") % (i + 1)
        out[i], out[j] = out[j], out[i]
    return out


def daily_order(secret: bytes, day: datetime.date, mode: str, verse_ids: Iterable[int]) -> list:
    """Every player in `mode` on `day` gets these verses in this order."""
    return keyed_shuffle(sorted(verse_ids), secret, f"order|{day.isoformat()}|{mode}")


def practice_order(verse_ids: Iterable[int]) -> list:
    out = sorted(verse_ids)
    secrets.SystemRandom().shuffle(out)
    return out


def option_label(run: dict, verse_id: int) -> str:
    """What a verse's option order is keyed on: (day, mode, verse) for a daily run, so
    every player sees the same order; the run itself for practice."""
    if run.get("kind") == KIND_DAILY:
        return f"options|{run.get('game_day')}|{run.get('mode')}|{verse_id}"
    return f"options|practice|{run.get('id')}|{verse_id}"


# ═════════════════════════════════════════════════════════════════════════════
# Verses
# ═════════════════════════════════════════════════════════════════════════════

SLUG_PATTERN = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
VERSE_FIELDS = ("slug", "reference", "category", "text", "blanks", "easy_blank",
                "easy_wrong", "medium_wrong", "explanation", "active")


def word_spans(text: str, word: str) -> list[tuple[int, int]]:
    """Every whole-word, case-insensitive occurrence of `word` in `text`."""
    pattern = re.compile(r"(?<!\w)" + re.escape(word) + r"(?!\w)", re.IGNORECASE)
    return [m.span() for m in pattern.finditer(text)]


def _words(entry: dict, field: str, count: int, name: str) -> list[str]:
    value = entry.get(field)
    if not isinstance(value, list) or len(value) != count:
        raise SeedRushError(f"{name}: `{field}` must be a list of exactly {count} words.")
    out = []
    for w in value:
        if not isinstance(w, str) or not w.strip():
            raise SeedRushError(f"{name}: `{field}` holds an empty or non-text word.")
        out.append(w.strip())
    return out


def validate_verse(entry: dict, index: int = 0) -> dict:
    """One verse-file entry, checked and cleaned. Raises SeedRushError naming the slug."""
    if not isinstance(entry, dict):
        raise SeedRushError(f"Entry #{index}: not an object.")
    slug = entry.get("slug")
    name = f"Verse {slug!r}" if slug else f"Entry #{index}"
    if not isinstance(slug, str) or not SLUG_PATTERN.match(slug):
        raise SeedRushError(f"{name}: `slug` must be lowercase words joined by hyphens.")
    unknown = set(entry) - set(VERSE_FIELDS)
    if unknown:
        raise SeedRushError(f"{name}: unknown field(s) {sorted(unknown)}.")
    for field in ("reference", "category", "text"):
        if not isinstance(entry.get(field), str) or not entry[field].strip():
            raise SeedRushError(f"{name}: `{field}` must be non-empty text.")
    text = entry["text"]

    blanks = _words(entry, "blanks", 3, name)
    starts = []
    for word in blanks:
        spans = word_spans(text, word)
        if len(spans) != 1:
            raise SeedRushError(
                f"{name}: blank {word!r} appears {len(spans)} times in the text as a whole "
                f"word; it must appear exactly once.")
        starts.append(spans[0][0])
    if starts != sorted(starts):
        raise SeedRushError(f"{name}: `blanks` must be listed in the order they appear in the verse.")

    easy_blank = entry.get("easy_blank")
    if not isinstance(easy_blank, str) or easy_blank.strip().casefold() not in {b.casefold() for b in blanks}:
        raise SeedRushError(f"{name}: `easy_blank` must be one of `blanks`.")
    easy_blank = next(b for b in blanks if b.casefold() == easy_blank.strip().casefold())

    easy_wrong = _words(entry, "easy_wrong", 2, name)
    medium_wrong = _words(entry, "medium_wrong", 3, name)
    for field, words in (("easy_wrong", easy_wrong), ("medium_wrong", medium_wrong)):
        for word in words:
            if word_spans(text, word):
                raise SeedRushError(f"{name}: `{field}` word {word!r} appears in the verse itself.")
    # The choices a player sees must be distinct, or two buttons would read the same.
    for field, options in (("easy", [easy_blank, *easy_wrong]), ("medium", [*blanks, *medium_wrong])):
        if len({o.casefold() for o in options}) != len(options):
            raise SeedRushError(f"{name}: the {field} options contain the same word twice.")

    explanation = entry.get("explanation")
    if explanation is not None and not isinstance(explanation, str):
        raise SeedRushError(f"{name}: `explanation` must be text or null.")
    active = entry.get("active", True)
    if not isinstance(active, bool):
        raise SeedRushError(f"{name}: `active` must be true or false.")

    return {
        "slug": slug, "reference": entry["reference"].strip(), "category": entry["category"].strip(),
        "text": text, "blanks": blanks, "easy_blank": easy_blank, "easy_wrong": easy_wrong,
        "medium_wrong": medium_wrong, "explanation": explanation, "active": active,
    }


def validate_verses(entries) -> list[dict]:
    """The whole verse file. Any broken rule fails the whole file."""
    if not isinstance(entries, list):
        raise SeedRushError("The verse file must hold a JSON list.")
    out, seen = [], set()
    for i, entry in enumerate(entries):
        verse = validate_verse(entry, i)
        if verse["slug"] in seen:
            raise SeedRushError(f"Verse {verse['slug']!r}: slug is used more than once.")
        seen.add(verse["slug"])
        out.append(verse)
    return out


def mode_blanks(verse: dict, mode: str) -> list[str]:
    """The words a player fills in, in verse order. Blank id i is answers[i]."""
    return [verse["easy_blank"]] if mode == MODE_EASY else list(verse["blanks"])


def mode_options(verse: dict, mode: str) -> Optional[list[str]]:
    """The choices before shuffling; None in hard (typed)."""
    if mode == MODE_EASY:
        return [verse["easy_blank"], *verse["easy_wrong"]]
    if mode == MODE_MEDIUM:
        return [*verse["blanks"], *verse["medium_wrong"]]
    return None


def blank_spans(verse: dict, mode: str) -> list[tuple[int, int]]:
    spans = []
    for word in mode_blanks(verse, mode):
        found = word_spans(verse["text"], word)
        if not found:
            raise SeedRushError(f"Verse {verse.get('slug')!r}: blank {word!r} is not in the text.")
        spans.append(found[0])
    return spans


def segments(verse: dict, mode: str) -> list[dict]:
    """The verse with its blanks cut out. The answers never appear in it."""
    text, out, cursor = verse["text"], [], 0
    for blank_id, (start, end) in enumerate(blank_spans(verse, mode)):
        if start > cursor:
            out.append({"t": "text", "v": text[cursor:start]})
        out.append({"t": "blank", "id": blank_id})
        cursor = end
    if cursor < len(text):
        out.append({"t": "text", "v": text[cursor:]})
    return out


def correct_words(verse: dict, mode: str) -> list[str]:
    """Each blank's word as the verse itself spells it (capitals included)."""
    return [verse["text"][s:e] for s, e in blank_spans(verse, mode)]


def question(verse: dict, mode: str, position: int, secret: bytes, label: str) -> dict:
    out = {"position": position, "verse_id": verse["id"], "reference": verse["reference"],
           "segments": segments(verse, mode)}
    options = mode_options(verse, mode)
    if options is not None:
        out["options"] = keyed_shuffle(options, secret, label)
    return out


# ═════════════════════════════════════════════════════════════════════════════
# Grading
# ═════════════════════════════════════════════════════════════════════════════

def _plain(word: str) -> str:
    """Case, punctuation and spaces stripped: "Borrower," → "borrower"."""
    return re.sub(r"[\W_]+", "", str(word).casefold())


def edit_distance(a: str, b: str, cap: int = HARD_TYPO_MAX_DISTANCE + 1) -> int:
    """Levenshtein distance, giving up (returning `cap`) once it must exceed cap − 1."""
    if abs(len(a) - len(b)) >= cap:
        return cap
    prev = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        cur = [i]
        for j, cb in enumerate(b, 1):
            cur.append(min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (ca != cb)))
        if min(cur) >= cap:
            return cap
        prev = cur
    return min(prev[-1], cap)


def typed_matches(typed: str, correct: str) -> bool:
    """Hard mode: case, punctuation and surrounding spaces ignored; one typo allowed
    in a word of HARD_TYPO_MIN_LENGTH letters or more."""
    a, b = _plain(typed), _plain(correct)
    if not a or not b:
        return False
    if a == b:
        return True
    return len(b) >= HARD_TYPO_MIN_LENGTH and edit_distance(a, b) <= HARD_TYPO_MAX_DISTANCE


def chosen_matches(chosen: str, correct: str) -> bool:
    """Easy and medium: the chosen option, compared without case or stray spaces."""
    return str(chosen).strip().casefold() == correct.strip().casefold()


def grade(verse: dict, mode: str, answers: list[str]) -> dict:
    """{"right": [bool per blank], "points"}. Partial credit in medium and hard."""
    expected = mode_blanks(verse, mode)
    match = typed_matches if mode == MODE_HARD else chosen_matches
    right = [match(given, want) for given, want in zip(answers, expected)]
    right += [False] * (len(expected) - len(right))
    if mode == MODE_EASY:
        points = POINTS[MODE_EASY] if all(right) else 0
    else:
        points = POINTS[mode] * sum(right)
    return {"right": right, "points": points}


def too_fast(mode: str, elapsed_ms: int) -> bool:
    return elapsed_ms < MIN_ANSWER_MS[mode]


# ═════════════════════════════════════════════════════════════════════════════
# Runs, ranking, streaks
# ═════════════════════════════════════════════════════════════════════════════

def deadline(run: dict) -> datetime.datetime:
    return utc(run["deadline_at"])


def accepting_until(run: dict) -> datetime.datetime:
    return deadline(run) + datetime.timedelta(seconds=GRACE_SECONDS)


def is_over(run: dict, now: datetime.datetime) -> bool:
    """Finished, or past the grace period (an abandoned tab finishes itself)."""
    return run.get("finished_at") is not None or now > accepting_until(run)


def finish_time(run: dict, now: datetime.datetime) -> datetime.datetime:
    """When a run ends: now, but never later than its deadline — an answer accepted
    in the grace period, or a run nobody came back to, ended when the clock did."""
    return min(now, deadline(run))


def effective_finished_at(run: dict) -> datetime.datetime:
    return utc(run.get("finished_at")) or deadline(run)


def rank_key(run: dict) -> tuple:
    """Higher score, then fewer wrong words, then the earlier finish."""
    return (-int(run.get("score") or 0), int(run.get("words_wrong") or 0),
            effective_finished_at(run), str(run.get("id")))


def ranked(runs: Iterable[dict]) -> list[dict]:
    return sorted(runs, key=rank_key)


def streak(played_days: Iterable[datetime.date], today: datetime.date) -> int:
    """Consecutive game days with a finished daily run, ending today or yesterday."""
    days = set(played_days)
    one = datetime.timedelta(days=1)
    cursor = today if today in days else today - one
    count = 0
    while cursor in days:
        count += 1
        cursor -= one
    return count


# ═════════════════════════════════════════════════════════════════════════════
# Usernames
# ═════════════════════════════════════════════════════════════════════════════

profanity.load_censor_words()


def profanity_form(username: str) -> str:
    """Lowercased, leetspeak mapped, then underscores and digits dropped:
    "F_u_c_K" and "sh1t_head" both read plainly."""
    return re.sub(r"[_0-9]", "", username.lower().translate(LEET_MAP))


def is_profane(username: str) -> bool:
    lowered = username.lower()
    for form in (lowered.replace("_", " "), lowered.translate(LEET_MAP).replace("_", " ")):
        if profanity.contains_profanity(form):
            return True
    plain = profanity_form(username)
    if plain and profanity.contains_profanity(plain):
        return True
    return any(fragment in plain for fragment in PROFANE_FRAGMENTS)


def username_problem(username) -> Optional[str]:
    """None when the name is allowed (availability aside), else why not:
    too_short | too_long | invalid_characters | reserved | profane."""
    if not isinstance(username, str):
        return "invalid_characters"
    if len(username) < USERNAME_MIN_LENGTH:
        return "too_short"
    if len(username) > USERNAME_MAX_LENGTH:
        return "too_long"
    if not USERNAME_PATTERN.match(username):
        return "invalid_characters"
    lowered = username.lower()
    # "Admin_1" and "benny7" impersonate as well as the bare names do.
    if lowered in RESERVED_USERNAMES or re.sub(r"[_0-9]", "", lowered) in RESERVED_USERNAMES:
        return "reserved"
    if is_profane(username):
        return "profane"
    return None


# ═════════════════════════════════════════════════════════════════════════════
# Email verification
# ═════════════════════════════════════════════════════════════════════════════

def new_token() -> tuple[str, str]:
    """(token for the link, its hash for the database). Only the hash is stored."""
    token = secrets.token_urlsafe(VERIFY_TOKEN_BYTES)
    return token, hash_token(token)


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def provider_verified(claims: dict) -> bool:
    """Google and Apple sign-ins have already confirmed the address."""
    meta = claims.get("app_metadata") or {}
    providers = {str(meta.get("provider") or "").lower()}
    providers |= {str(p).lower() for p in (meta.get("providers") or [])}
    return bool(providers & VERIFIED_PROVIDERS)


def send_allowance(profile: dict, now: datetime.datetime) -> tuple[bool, dict, int]:
    """May another verification email go out? Returns (allowed, the window columns to
    write, seconds until the next send is allowed when it is not)."""
    started = utc(profile.get("verification_window_started_at"))
    count = int(profile.get("verification_window_count") or 0)
    if started is None or now - started >= VERIFY_SEND_WINDOW:
        return True, {"verification_window_started_at": iso(now), "verification_window_count": 1}, 0
    if count >= VERIFY_SENDS_PER_WINDOW:
        wait = int((started + VERIFY_SEND_WINDOW - now).total_seconds()) + 1
        return False, {}, max(wait, 1)
    return True, {"verification_window_count": count + 1}, 0


def verification_email(link: str, username: Optional[str]) -> dict:
    """Subject, plain text and HTML. No images, no tracking links."""
    name = username or "there"
    subject = "Confirm your email for Seed Rush"
    text = (
        f"Hi {name},\n\n"
        "Thanks for playing Seed Rush! Confirm your email so your scores can appear on "
        "the daily leaderboard:\n\n"
        f"{link}\n\n"
        "The link works for 24 hours. If you didn't ask for this, you can ignore this "
        "email and nothing will change.\n\n"
        "DollarSeeds\n"
    )
    safe_link, safe_name = html.escape(link, quote=True), html.escape(name)
    body = (
        '<div style="font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.5;'
        'color:#1f2a24;max-width:480px">'
        f"<p>Hi {safe_name},</p>"
        "<p>Thanks for playing Seed Rush! Confirm your email so your scores can appear on "
        "the daily leaderboard.</p>"
        f'<p><a href="{safe_link}" style="display:inline-block;background:#0F3D2E;color:#ffffff;'
        'padding:12px 20px;border-radius:8px;text-decoration:none">Confirm my email</a></p>'
        f'<p style="font-size:14px;color:#55635b">Or paste this link into your browser:<br>{safe_link}</p>'
        '<p style="font-size:14px;color:#55635b">The link works for 24 hours. If you didn\'t ask '
        "for this, you can ignore this email and nothing will change.</p>"
        "<p>DollarSeeds</p></div>"
    )
    return {"subject": subject, "text": text, "html": body}


# ═════════════════════════════════════════════════════════════════════════════
# Rate limiting
# ═════════════════════════════════════════════════════════════════════════════

class RateLimiter:
    """Sliding-window request counts in process memory.

    Render runs ONE instance of this backend, so one process sees every request. A
    second instance would count separately, loosening each limit by that factor —
    tolerable for limits this generous, but move this to the database (or Redis)
    before scaling out. Counts reset on every deploy, which is fine for the same reason.
    """

    _SWEEP_EVERY = 1000

    def __init__(self, clock=time.monotonic):
        self._clock = clock
        self._hits: dict[tuple, collections.deque] = {}
        self._lock = threading.Lock()
        self._since_sweep = 0

    def hit(self, bucket: str, key: str, limit: int, window: float) -> Optional[int]:
        """Record one request. None when allowed; otherwise the seconds to wait."""
        now = self._clock()
        with self._lock:
            self._since_sweep += 1
            if self._since_sweep >= self._SWEEP_EVERY:
                self._sweep(now)
            q = self._hits.setdefault((bucket, key), collections.deque())
            while q and q[0] <= now - window:
                q.popleft()
            if len(q) >= limit:
                return max(1, int(q[0] + window - now) + 1)
            q.append(now)
            return None

    def _sweep(self, now: float) -> None:
        longest = max(w for limits in RATE_LIMITS.values() for _, w in limits.values())
        for k in [k for k, q in self._hits.items() if not q or q[-1] <= now - longest]:
            del self._hits[k]
        self._since_sweep = 0
