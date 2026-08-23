---
name: ship-ritual
description: Package a versioned build (a project folder shipped as a numbered .zip) through a hard-fail verify gate before presenting it, so a mislabeled build, a nested copy of the project riding inside the zip, or a corrupted changelog can't reach the user. Use whenever shipping or releasing a new version of a project as a zip, bumping a version marker, or preparing a build artifact for download — especially in an iterative "ship vNNNN, then vNNNN+1" workflow. Codifies bump -> validate -> changelog -> strip -> zip -> verify -> present -> trim.
---

# ship-ritual

Ships a versioned project build as a numbered zip, running every safety check
*before* the artifact is presented. It exists because doing this by hand caused
three real, expensive failures, and each check below maps to one of them:

- **Mislabeled build** — the version marker was bumped and the changelog updated, but
  a code edit was trapped in a stale nested copy, so the zip was "old code wearing a
  new label." *Guard: the version-marker check + the byte-identical round-trip.*
- **Nested fork in the zip** — a previous version's whole project folder got copied
  into the working tree and rode into the release zip, bloating it and shipping two
  project roots. *Guard: the nested-project scan.*
- **Blanked changelog** — a non-ASCII character (an emoji) crashed the changelog
  writer mid-write and left the changelog file empty. *Guard: atomic ASCII-guarded
  changelog writes + a non-empty check.*

The rule that ties it together: **never present the artifact until every check is
green.** Presenting first and checking later is how all three failures reached a
user.

## When to use
- Shipping / releasing a new numbered version of a project as a `.zip`.
- Any "iterate then re-ship" loop where the version number increments each time.
- Preparing a downloadable build artifact that must match the code it claims to be.

## The ritual (in order)

**1. Know the base — never rebuild from memory.**
Start from the actual latest artifact, not a reconstruction. If you're unsure what
the current version is, ask or read the project's state file. Never reuse a version
number; always supersede forward (vNNNN -> vNNNN+1).

**2. Edit in a working dir**, then **bump the version marker** to the new number.
The version string in the code (e.g. `ENGINE_VERSION = "vMMMM"`) must equal the
number you're about to ship. This single line is what the gate checks to catch
"old code, new label."

**3. Update the changelog atomically, ASCII-only.**

*Name the file.* In SweK_Engine the round history is **`docs/CHANGELOG.md`** — one
`## Since vNNNN` section per round, newest first. **It is not README.md.** This step
said only "the changelog" for a long time, so each round appended a section to
whatever file was to hand, and README.md reached 620 KB of which 99.1% was 286
rounds of history: past the size GitHub renders, with the 5 KB a stranger opens the
file for buried underneath. Split at v3941, and `rootLayout-selfcheck` now fails on
a `## Since v` heading in README.md — and fails just as hard if the history stops
being in `docs/CHANGELOG.md`, because deleting it is the cheap way to pass.

The per-round block above `ENGINE_VERSION` in `main.js` is a *different* changelog
with a different job (the reasoning, in the code, where `shipRitual.mjs` verifies
it). Both get written; neither substitutes for the other.

Write the entry to a temp file, back up the changelog, append, then verify it grew;
restore on any error. Reject non-ASCII (emoji, smart quotes, en/em dashes — use `-`,
`->`, plain quotes). `scripts/safe_prepend.py` does this safely; use it instead of a
raw write so a bad character can never blank the file.

**4. Validate the code.**
Syntax-check every file you touched (for JS: `node --check`; for inline module
scripts, extract them first). Run the project's own verify/test gate if it has one
and require it to pass. Strip volatile state/scratch dirs so they don't ride along.

**5. Rename the working dir to the new version, then zip it.**
Rename so the folder name matches the version, then zip with an exclusion list
(dependencies, caches, and **any nested copy of the project folder or its zips**).

**6. Run the verify gate — do NOT present until it is all green.**
`scripts/verify_zip.py --zip <path> --version vMMMM [--marker-file path --marker STR]...`
checks: the version marker appears in the code; there is exactly one project root in
the zip (no nested forks); the zip is a sane size; and any required feature markers
are present. Then do a **byte-identical round-trip**: unzip to a temp dir and
`diff -r` against the source tree. Exit 0 = ship; any failure = STOP and fix.

**7. Present the artifact — only now.**
Only after every check is green, present the zip to the user.

**8. Trim old artifacts.**
Keep just the two newest version zips; delete older ones to avoid clutter and
confusion about which is current.

## Guidelines
- The gate is a **hard fail**: if any check is red, fix the cause — never present
  anyway "just this once." Every documented failure came from skipping the gate.
- Prefer the scripts here for the two error-prone steps (changelog write, zip
  verify); do the rest with normal shell steps.
- Keep the whole flow in one working directory; a nested project copy is the most
  common way the zip gets corrupted.
