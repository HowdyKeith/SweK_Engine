---
name: xlsx-eval
description: Compare two Excel workbooks cell-by-cell — an expected/answer-key .xlsx against a submitted/candidate .xlsx — and report formula, value, number-format, structural, and named-range differences with a match score. Supports numeric tolerance, case/whitespace-insensitive formula matching, optional number-format checking, weighted per-sheet points scoring, and a concise grade mode. Use when grading or evaluating a spreadsheet output against a reference (e.g. checking an AI model's or a candidate's workbook), diffing two versions of a workbook, or verifying that formulas and values match an answer key.
---

# xlsx-eval

Compares a submitted Excel workbook against an expected (answer-key) workbook and
reports where they differ — formulas, cached values, structure (sheets, dimensions,
missing/extra cells), and named ranges — plus a match score.

## When to use
- Grading or evaluating a spreadsheet against a reference (Excel-eval / Mercor-style tasks).
- Diffing two versions of the same workbook.
- Verifying that formulas and values match an answer key.

## How to run
The comparator is `scripts/compare.py` (uses openpyxl). If openpyxl is missing,
install it first: `pip install openpyxl`.

```bash
python scripts/compare.py --expected answer_key.xlsx --submitted candidate.xlsx
```

Options:
- `--json` — machine-readable output.
- `--max N` — cap reported diffs per sheet (default 100).
- `--tol T` — numeric tolerance (absolute or relative) so `3.14159` vs `3.14`, or
  floating-point noise, can count as a match. Default `1e-9` (effectively exact).
- `--ignore-case` — normalize formula case and whitespace before comparing, so
  `=SUM(A1:A10)`, `=sum(a1:a10)`, and `= SUM(A1:A10)` all match. Excel treats
  formulas case-insensitively, so this reflects real equivalence.
- `--grade` — concise scored output: overall % plus a one-line-per-sheet breakdown
  (`✓ [Sheet] 100.0% (0f 0v 0m 0x)` = formula/value/missing/extra diff counts).
- `--check-format` — also compare each cell's **number format** (currency,
  percentage, decimal places, dates). Off by default, since not every task grades
  formatting; turn it on when the rubric cares about presentation. Format diffs only
  count against cells whose value + formula already match, and show as an extra
  `Nfmt` count in grade mode.
- `--weights FILE` — a JSON file mapping sheet name → points, e.g.
  `{"Model": 80, "Intro": 10, "Notes": 10}` (use `"*"` for a per-sheet default like
  `{"*": 25}`). The score becomes **weighted**: each sheet contributes
  `sheetPct × its points`, so an important sheet counts more than a trivial one —
  reflecting a real rubric instead of treating every cell as equal. Output adds a
  `Weighted score: X% (earned/possible pts)` line and shows each sheet's `w=`.

## What it reports
Per sheet: **formula diffs** (cells whose formula differs), **value diffs** (cached
values differ, tolerance-aware), optional **format diffs** (number format differs),
**missing / extra** cells, and a per-sheet %. Workbook-level: **named-range
(defined-name) diffs**, **extra sheets**, an overall match percentage, and — when
`--weights` is given — a weighted points score.

## Reading the result
- A high match % with only value diffs (no formula diffs) usually means the logic is
  right but the file wasn't recalculated — openpyxl reads cached values only, so an
  un-recalculated submission can show value diffs even when formulas are correct.
  Use `--tol` and check whether formula diffs are zero.
- **Formula diffs are the substantive signal** for "did they build it correctly."
- For grading candidate/model submissions, run with `--ignore-case --tol 1e-6 --grade`
  — this rewards functionally-correct answers instead of penalizing cosmetic
  differences (case, whitespace, rounding), and gives a clean per-sheet score.

## Notes
- openpyxl does not recompute formulas; value comparison uses each file's cached
  value (present only if Excel/LibreOffice saved it). Formula-string comparison
  always works regardless.
- Cell coordinates are reported in A1 notation per sheet.
- Named ranges are read from the workbook's defined names; the check flags any that
  are missing from the submission or point somewhere different.
