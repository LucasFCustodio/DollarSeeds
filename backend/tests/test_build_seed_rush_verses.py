"""build_seed_rush_verses.py — the spreadsheet → verses.json builder.

Every spreadsheet here is invented inside the test (made-up garden sentences, not
Scripture), written with openpyxl to tmp_path.
"""

from __future__ import annotations

import json

import openpyxl
import pytest

import build_seed_rush_verses as builder
import load_seed_rush_verses as loader

HEADER = ("#", "Reference", "Category", "Read it (NIV)", "NIV text",
          "Medium & Hard blanks (in verse order)", "Medium wrong options (3)", "Easy blank",
          "Easy wrong options (2)", "Your decision", "Notes / changes", "Explanation (yours)")


def row(**over) -> dict:
    base = {
        "Reference": "Garden 1:1",
        "Category": "Work & Diligence",
        "NIV text": "The careful gardener waters the seed before the sun rises.",
        "Medium & Hard blanks (in verse order)": "careful, seed, sun",
        "Easy blank": "seed",
        "Easy wrong options (2)": "stone, cloud",
        "Medium wrong options (3)": "lazy, river, moon",
        "Your decision": "Approve",
        "Explanation (yours)": "A made-up line for tests.",
    }
    base.update(over)
    return base


def sheet(tmp_path, rows, header=HEADER, name="Verses"):
    book = openpyxl.Workbook()
    ws = book.active
    ws.title = name
    ws.append(list(header))
    for r in rows:
        ws.append([r.get(col) for col in header] if isinstance(r, dict) else list(r))
    book.create_sheet("How to review")
    path = tmp_path / "verses.xlsx"
    book.save(path)
    return path


def run(tmp_path, rows, **kw):
    return builder.build(builder.read_rows(sheet(tmp_path, rows, **kw)))


# ── Columns ─────────────────────────────────────────────────────────────────

def test_columns_are_matched_by_name_not_position(tmp_path):
    shuffled = tuple(reversed(HEADER)) + ("Something new",)
    result = run(tmp_path, [row()], header=shuffled)
    assert result["failed"] == [] and result["skipped"] == []
    assert result["verses"] == [{
        "slug": "garden-1-1", "reference": "Garden 1:1", "category": "Work & Diligence",
        "text": "The careful gardener waters the seed before the sun rises.",
        "blanks": ["careful", "seed", "sun"], "easy_blank": "seed",
        "easy_wrong": ["stone", "cloud"], "medium_wrong": ["lazy", "river", "moon"],
        "explanation": "A made-up line for tests.", "active": True,
    }]


def test_a_missing_column_stops_the_build_and_names_it(tmp_path, capsys):
    header = tuple(c for c in HEADER if c not in ("Easy blank", "Explanation (yours)"))
    path = sheet(tmp_path, [row()], header=header)
    out = tmp_path / "out.json"
    with pytest.raises(builder.BuildError, match="'Easy blank', 'Explanation \\(yours\\)'"):
        builder.build(builder.read_rows(path))
    assert builder.main(["--xlsx", str(path), "--out", str(out)]) == 1
    assert "Easy blank" in capsys.readouterr().err
    assert not out.exists()


def test_a_missing_sheet_stops_the_build(tmp_path):
    with pytest.raises(builder.BuildError, match="no sheet named 'Verses'"):
        run(tmp_path, [row()], name="Sheet1")


# ── Row selection ───────────────────────────────────────────────────────────

def test_only_approved_rows_with_text_and_an_explanation_are_included(tmp_path):
    rows = [
        row(),
        row(**{"Reference": "Garden 1:2", "Your decision": None}),
        row(**{"Reference": "Garden 1:3", "Your decision": "Reject"}),
        row(**{"Reference": "Garden 1:4", "NIV text": "  "}),
        row(**{"Reference": "Garden 1:5", "Explanation (yours)": None}),
        [None] * len(HEADER),  # an empty row is not a verse
        row(**{"Reference": "Garden 1:6", "Your decision": " approve "}),
    ]
    result = run(tmp_path, rows)
    assert [v["slug"] for v in result["verses"]] == ["garden-1-1", "garden-1-6"]
    assert result["skipped"] == [
        ("Garden 1:2", "no decision yet"),
        ("Garden 1:3", "decision is 'Reject', not Approve"),
        ("Garden 1:4", "no NIV text"),
        ("Garden 1:5", "no explanation"),
    ]
    assert result["failed"] == []


# ── Cleaning ────────────────────────────────────────────────────────────────

@pytest.mark.parametrize("pasted, cleaned", [
    ("⁷ The careful gardener[a] waters the “seed”(A) before the sun—rises.[12]",
     "The careful gardener waters the “seed” before the sun—rises."),
    ("7 The careful\n  gardener waters the ‘seed’ before\r\nthe sun rises – early.(BC)",
     "The careful gardener waters the ‘seed’ before the sun rises – early."),
    ("  The careful gardener waters the seed before the sun rises, says the Lord.  ",
     "The careful gardener waters the seed before the sun rises, says the Lord."),
])
def test_text_cleaning_removes_markers_and_verse_numbers_and_keeps_everything_else(tmp_path, pasted, cleaned):
    result = run(tmp_path, [row(**{"NIV text": pasted})])
    assert result["verses"][0]["text"] == cleaned


def test_explanations_only_get_whitespace_cleanup(tmp_path):
    written = "  Keep [this] (A) “exactly”—as\n\nwritten.  "
    result = run(tmp_path, [row(**{"Explanation (yours)": written})])
    assert result["verses"][0]["explanation"] == "Keep [this] (A) “exactly”—as written."


# ── Slugs ───────────────────────────────────────────────────────────────────

@pytest.mark.parametrize("reference, slug", [
    ("Proverbs 22:7", "proverbs-22-7"),
    ("1 Timothy 6:10", "1-timothy-6-10"),
    ("2 Corinthians 9:7", "2-corinthians-9-7"),
    ("Ephesians 5:15-16", "ephesians-5-15-16"),
    ("Ephesians 5:15–16", "ephesians-5-15-16"),
])
def test_slugs(reference, slug):
    assert builder.slugify(reference) == slug


def test_a_verse_range_reference_builds(tmp_path):
    result = run(tmp_path, [row(**{"Reference": "Garden 5:15-16"})])
    assert result["verses"][0]["slug"] == "garden-5-15-16"


# ── Failures ────────────────────────────────────────────────────────────────

def test_failures_are_reported_and_left_out_and_the_rest_still_written(tmp_path, capsys):
    rows = [
        row(),
        row(**{"Reference": "Garden 1:2", "Easy blank": "barn"}),
        row(**{"Reference": "Garden 1:3", "Medium wrong options (3)": "lazy, river, gardener"}),
        row(**{"Reference": "Garden 1:4", "Medium & Hard blanks (in verse order)": "sun, seed, careful"}),
        row(**{"Reference": "Garden 1:1", "Category": "Saving"}),  # same slug as the first
        row(**{"Reference": "Garden 1:5"}),
    ]
    path = sheet(tmp_path, rows)
    out = tmp_path / "out.json"
    assert builder.main(["--xlsx", str(path), "--out", str(out)]) == 2

    printed = capsys.readouterr().out
    assert "Included 2, skipped 0, failed 4." in printed
    assert "Garden 1:2: Verse 'garden-1-2': `easy_blank` must be one of `blanks`." in printed
    assert "Garden 1:3: Verse 'garden-1-3': `medium_wrong` word 'gardener' appears in the verse itself." in printed
    assert "Garden 1:4: Verse 'garden-1-4': `blanks` must be listed in the order they appear" in printed
    assert "Garden 1:1: Verse 'garden-1-1': slug is used more than once." in printed
    assert "before the sun rises" not in printed  # verse text is never printed

    written = loader.read_file(out)
    assert [v["slug"] for v in written] == ["garden-1-1", "garden-1-5"]


# ── Output ──────────────────────────────────────────────────────────────────

def test_the_output_is_what_the_loader_expects_and_reruns_regenerate_it(tmp_path):
    path = sheet(tmp_path, [row(), row(**{"Reference": "Garden 1:2", "NIV text": "The careful gardener waters the “seed” before the sun rises."})])
    out = tmp_path / "out.json"
    assert builder.main(["--xlsx", str(path), "--out", str(out)]) == 0
    first = out.read_text(encoding="utf-8")
    assert "“seed”" in first  # kept as typed, not \u-escaped
    entries = json.loads(first)
    assert [list(e) for e in entries] == [list(builder.sr.VERSE_FIELDS)] * 2  # loader field order
    assert loader.read_file(out) == entries
    assert loader.main([str(out), "--dry-run"]) == 0

    assert builder.main(["--xlsx", str(sheet(tmp_path, [row()])), "--out", str(out)]) == 0
    assert [v["slug"] for v in loader.read_file(out)] == ["garden-1-1"]


def test_no_approved_rows_writes_an_empty_list(tmp_path):
    out = tmp_path / "out.json"
    path = sheet(tmp_path, [row(**{"Your decision": None})])
    assert builder.main(["--xlsx", str(path), "--out", str(out)]) == 0
    assert loader.read_file(out) == []
