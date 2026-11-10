"""Build seed_rush_data/verses.json from Lucas's review spreadsheet (dev tool).

    cd backend
    venv\\Scripts\\python build_seed_rush_verses.py --xlsx C:\\DollarSeeds-Landing\\dollarseeds-landing\\docs\\seed-rush-verses.xlsx

Reads sheet `Verses` (header row 1, columns matched by header name) and writes every
row whose `Your decision` is Approve and that has both NIV text and an explanation.
The Bible text comes only from the `NIV text` column; explanations are copied as
written. The only cleaning is whitespace, BibleGateway footnote / cross-reference
markers ([a], [12], (A)) and a verse number at the very start of the text.

Each verse is checked with the loader's own rules (seed_rush.validate_verse). A verse
that fails is reported and left out; the rest are still written. Rerunning simply
regenerates the file. Exit code: 0 written cleanly, 1 a missing column or unreadable
file (nothing written), 2 written but some verses failed.

Needs openpyxl (requirements-dev.txt). Then validate / load with load_seed_rush_verses.py.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

import seed_rush as sr

DEFAULT_OUT = Path(__file__).resolve().parent / "seed_rush_data" / "verses.json"
SHEET = "Verses"

COL_REFERENCE = "Reference"
COL_CATEGORY = "Category"
COL_TEXT = "NIV text"
COL_BLANKS = "Medium & Hard blanks (in verse order)"
COL_EASY_BLANK = "Easy blank"
COL_EASY_WRONG = "Easy wrong options (2)"
COL_MEDIUM_WRONG = "Medium wrong options (3)"
COL_DECISION = "Your decision"
COL_EXPLANATION = "Explanation (yours)"
COLUMNS = (COL_REFERENCE, COL_CATEGORY, COL_TEXT, COL_BLANKS, COL_EASY_BLANK,
           COL_EASY_WRONG, COL_MEDIUM_WRONG, COL_DECISION, COL_EXPLANATION)
APPROVE = "approve"

# BibleGateway footnotes ([a], [12]) and cross-references ((A), (AB)).
MARKER = re.compile(r"\[[A-Za-z0-9]{1,3}\]|\([A-Za-z0-9]{1,3}\)")
# A verse number at the very start: "7 " or superscript "⁷".
LEADING_NUMBER = re.compile(r"^(?:\d+\s+|[⁰¹²³⁴⁵⁶⁷⁸⁹]+\s*)")


class BuildError(Exception):
    """The spreadsheet can't be read as a verse sheet; nothing is written."""


def squash(value) -> str:
    """Trim, and collapse runs of whitespace (line breaks included) to single spaces."""
    return " ".join(str(value).split()) if value is not None else ""


def clean_text(value) -> str:
    text = squash(value)
    text = LEADING_NUMBER.sub("", text)
    return squash(MARKER.sub("", text))


def words(value) -> list[str]:
    return [w for w in (part.strip() for part in squash(value).split(",")) if w]


def slugify(reference: str) -> str:
    """'1 Timothy 6:10' -> '1-timothy-6-10'; 'Ephesians 5:15-16' -> 'ephesians-5-15-16'."""
    slug = re.sub(r"[\s:–—]+", "-", reference.strip().lower())
    return re.sub(r"-{2,}", "-", slug).strip("-")


def column_index(header) -> dict[str, int]:
    """Map each needed column name to its position. Raises naming every missing one."""
    found = {}
    for i, cell in enumerate(header):
        name = squash(cell).casefold()
        if name and name not in found:
            found[name] = i
    missing = [c for c in COLUMNS if c.casefold() not in found]
    if missing:
        raise BuildError(f"Sheet {SHEET!r} is missing column(s): {', '.join(repr(c) for c in missing)}.")
    return {c: found[c.casefold()] for c in COLUMNS}


def read_rows(xlsx_path) -> list[tuple]:
    import openpyxl

    try:
        book = openpyxl.load_workbook(xlsx_path, read_only=True, data_only=True)
    except Exception as e:  # openpyxl raises several unrelated types for a bad file
        raise BuildError(f"Can't open {xlsx_path}: {e}")
    try:
        if SHEET not in book.sheetnames:
            raise BuildError(f"{xlsx_path} has no sheet named {SHEET!r}.")
        return list(book[SHEET].iter_rows(values_only=True))
    finally:
        book.close()


def build(rows: list[tuple]) -> dict:
    """Rows (header first) -> {"verses": [...], "skipped": [(ref, reason)], "failed": [(ref, reason)]}."""
    if not rows:
        raise BuildError(f"Sheet {SHEET!r} is empty.")
    col = column_index(rows[0])
    verses, skipped, failed, slugs = [], [], [], set()

    for number, row in enumerate(rows[1:], start=2):
        cell = lambda name: row[col[name]] if col[name] < len(row) else None  # noqa: E731
        if not any(squash(v) for v in row):
            continue  # an empty row, not a verse
        reference = squash(cell(COL_REFERENCE)) or f"row {number}"

        decision = squash(cell(COL_DECISION))
        text = clean_text(cell(COL_TEXT))
        explanation = squash(cell(COL_EXPLANATION))
        reasons = []
        if not decision:
            reasons.append("no decision yet")
        elif decision.casefold() != APPROVE:
            reasons.append(f"decision is {decision!r}, not Approve")
        if not text:
            reasons.append("no NIV text")
        if not explanation:
            reasons.append("no explanation")
        if reasons:
            skipped.append((reference, "; ".join(reasons)))
            continue

        entry = {
            "slug": slugify(reference),
            "reference": reference,
            "category": squash(cell(COL_CATEGORY)),
            "text": text,
            "blanks": words(cell(COL_BLANKS)),
            "easy_blank": squash(cell(COL_EASY_BLANK)),
            "easy_wrong": words(cell(COL_EASY_WRONG)),
            "medium_wrong": words(cell(COL_MEDIUM_WRONG)),
            "explanation": explanation,
            "active": True,
        }
        try:
            verse = sr.validate_verse(entry, number)
        except sr.SeedRushError as e:
            failed.append((reference, str(e)))
            continue
        if verse["slug"] in slugs:
            failed.append((reference, f"Verse {verse['slug']!r}: slug is used more than once."))
            continue
        slugs.add(verse["slug"])
        verses.append(verse)

    sr.validate_verses(verses)  # the loader's whole-file check, as a last guard
    return {"verses": verses, "skipped": skipped, "failed": failed}


def render(verses: list[dict]) -> str:
    """The verse file: one key per line, word lists inline, UTF-8 kept readable."""
    if not verses:
        return "[]\n"
    blocks = []
    for verse in verses:
        lines = [f"    {json.dumps(k)}: {json.dumps(verse[k], ensure_ascii=False)}" for k in sr.VERSE_FIELDS]
        blocks.append("  {\n" + ",\n".join(lines) + "\n  }")
    return "[\n" + ",\n".join(blocks) + "\n]\n"


def summary(result: dict, out) -> str:
    lines = [f"Included {len(result['verses'])}, skipped {len(result['skipped'])}, "
             f"failed {len(result['failed'])}. Wrote {out}."]
    for key in ("skipped", "failed"):
        for reference, reason in result[key]:
            lines.append(f"  {key:<7} {reference}: {reason}")
    return "\n".join(lines)


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description="Build the Seed Rush verse file from the review spreadsheet.")
    parser.add_argument("--xlsx", required=True, help="the review spreadsheet (.xlsx)")
    parser.add_argument("--out", default=str(DEFAULT_OUT), help="where to write the verse file")
    args = parser.parse_args(argv)

    try:
        result = build(read_rows(args.xlsx))
    except BuildError as e:
        print(f"Not built: {e}", file=sys.stderr)
        return 1
    Path(args.out).write_text(render(result["verses"]), encoding="utf-8", newline="\n")
    print(summary(result, args.out))
    return 2 if result["failed"] else 0


if __name__ == "__main__":
    sys.exit(main())
