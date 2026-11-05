"""Load the Seed Rush verse file into `seed_rush_verses` (migration 0015).

    cd backend
    venv\\Scripts\\python load_seed_rush_verses.py                 # seed_rush_data/verses.json
    venv\\Scripts\\python load_seed_rush_verses.py other.json --dry-run

1. Validates the WHOLE file first (seed_rush.validate_verses). One broken rule and
   nothing is written; the message names the verse.
2. Upserts every verse by slug: new slugs are inserted, changed ones updated, and
   identical ones left alone.
3. Marks verses that are in the table but no longer in the file `active = false`.
   It never deletes one: past runs and answers point at it.
4. Prints a summary.

Safe to run any number of times: a second run with the same file changes nothing.
Uses SUPABASE_URL / SUPABASE_KEY from backend/.env, like the backend itself. The
running backend picks changes up within its verse cache time (SR_VERSE_CACHE_SECONDS
in main.py).

Changing the active set changes the daily verse order, so load outside the hour
around 7:00 AM New York if possible. A run already in progress keeps the verses it
was dealt.
"""

from __future__ import annotations

import argparse
import datetime
import json
import os
import sys
from pathlib import Path

import seed_rush as sr

DEFAULT_PATH = Path(__file__).resolve().parent / "seed_rush_data" / "verses.json"
COMPARED = ("reference", "category", "text", "blanks", "easy_blank", "easy_wrong",
            "medium_wrong", "explanation", "active")


def read_file(path) -> list[dict]:
    try:
        entries = json.loads(Path(path).read_text(encoding="utf-8"))
    except json.JSONDecodeError as e:
        raise sr.SeedRushError(f"{path} is not valid JSON: {e}")
    return sr.validate_verses(entries)


def sync(client, verses: list[dict], now: datetime.datetime | None = None) -> dict:
    """Bring the table in line with `verses`. Returns the slugs per outcome."""
    stamp = (now or datetime.datetime.now(datetime.timezone.utc)).isoformat()
    existing = {r["slug"]: r for r in client.table("seed_rush_verses").select("*").execute().data or []}
    summary = {"inserted": [], "updated": [], "unchanged": [], "deactivated": []}

    for verse in verses:
        row = existing.get(verse["slug"])
        if row is None:
            client.table("seed_rush_verses").insert(
                {**verse, "created_at": stamp, "updated_at": stamp}).execute()
            summary["inserted"].append(verse["slug"])
        elif any(row.get(f) != verse[f] for f in COMPARED):
            client.table("seed_rush_verses").update(
                {**{f: verse[f] for f in COMPARED}, "updated_at": stamp}).eq("slug", verse["slug"]).execute()
            summary["updated"].append(verse["slug"])
        else:
            summary["unchanged"].append(verse["slug"])

    in_file = {v["slug"] for v in verses}
    for slug, row in sorted(existing.items()):
        if slug not in in_file and row.get("active"):
            client.table("seed_rush_verses").update(
                {"active": False, "updated_at": stamp}).eq("slug", slug).execute()
            summary["deactivated"].append(slug)
    return summary


def report(summary: dict, verses: list[dict]) -> str:
    lines = [f"{len(verses)} verse(s) in the file, {sum(v['active'] for v in verses)} active."]
    for key in ("inserted", "updated", "unchanged", "deactivated"):
        slugs = summary[key]
        lines.append(f"  {key:<11} {len(slugs)}" + (f": {', '.join(slugs)}" if slugs and key != "unchanged" else ""))
    return "\n".join(lines)


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description="Load the Seed Rush verse file.")
    parser.add_argument("path", nargs="?", default=str(DEFAULT_PATH))
    parser.add_argument("--dry-run", action="store_true", help="validate only; write nothing")
    args = parser.parse_args(argv)

    try:
        verses = read_file(args.path)
    except (sr.SeedRushError, OSError) as e:
        print(f"Not loaded: {e}", file=sys.stderr)
        return 1
    if args.dry_run:
        print(f"Valid: {len(verses)} verse(s). Nothing written (--dry-run).")
        return 0

    from dotenv import load_dotenv
    from supabase import create_client

    load_dotenv()
    url, key = os.environ.get("SUPABASE_URL"), os.environ.get("SUPABASE_KEY")
    if not url or not key:
        print("Not loaded: SUPABASE_URL and SUPABASE_KEY must be set (backend/.env).", file=sys.stderr)
        return 1
    summary = sync(create_client(url, key), verses)
    print(report(summary, verses))
    return 0


if __name__ == "__main__":
    sys.exit(main())
