# The Notes row: every note is reachable from a page, or says why not (UNNUMBERED; 2026-11-08)

Keith, 2026-11-08: "I know occasionally a '.md' file was created with instructions, but i rarely/never get to look at and find them. so a 'Notes' row would be a great thing and a good rule. if a page has notes that are pertinent and go beyond either the obvious steps that the page may present, or completely separate rig runs that would be expected to be run and returned, then a Notes link on the page would be a necessary linkage."

**This is a rule and a piece of page furniture, not a study.** Nothing here is registered and nothing is a result.

## The rule

Every note under `brain/` (`brain/*.md`) is EITHER linked from the page it applies to, OR declared a RECORD (a registration and its result, a hand-off, a snapshot: nothing for a reader to do or run) with its reason written down. A note that is neither FAILS `tools/ship/pageNotes-selfcheck.mjs` BY NAME, so a new note forces the decision on the day it is written. A record whose text carries the repo's capitalised marker for work still to be done on the rig (the gate spells it) must give "another chat" as its reason: a note with owed work cannot be filed as a record to get green. (The gate caught this very note on its first run, because the note spelled the marker out; it is reworded.) Rig runs that belong to no page are linked from `server.html` under kind `rig` (the engine's landing page is the one place the rig's worklist is always one click away).

## What exists

| file | what it is |
|---|---|
| `page-notes.json` | the registry: `pages` (page -> notes, each with a title, a reason of at least 20 characters and optionally `kind: "rig"`) and `records` (note -> reason) |
| `ui/pageNotes.mjs` | the row: reads the registry, builds a list of links and a "Read here" button per note, one viewer for the text (the bridge serves `.md` as a download, so the page fetches the text itself). Inline when the page has `<div id="swek-notes">`, else a pill "Notes (n)" at the bottom-left that opens a panel. Draws nothing, and touches nothing, when the page has no notes. Never throws. `textContent` only. |
| `ui/pageNotesMount.mjs` | the two-line loader every listed page includes as its last module script |
| `tools/ship/pageNotes-selfcheck.mjs` | the gate (the rule on the real tree and on made-up ones; the loader on exactly the listed pages; the module against a fake DOM and a stub fetch, including a slow answer racing a later one) |

Nine pages carry it: `privatelm.html` (3 notes), `gputaskman.html` (2), `sea-ogre.html` (4), `sub-aquarium.html` (9), `rotorcraft-demo.html` (1), `rotor-league.html` (1), `es-box3d-6dof.html` (2), `brain-bench.html` (3) and `server.html` (6, all rig runs). 31 entries; 23 records (this note is one); all 49 notes under `brain/` classified when this was written. `gputaskman.html` had its own hand-made notes card; it now uses the shared row (the client module lost its `NOTES` table and `getText`).

## To add a note, or a page

1. Write the note. Run `node tools/ship/pageNotes-selfcheck.mjs`: it names the note.
2. Either add it to `page-notes.json` under the page it applies to (a title, and a reason that says what the reader gets that the page does not show), or under `server.html` with `kind: "rig"` if it is a run nobody's page owns, or add it to `records` with the reason it is a record.
3. A page not yet listed: add it to `pages`, add `<script type="module" src="/ui/pageNotesMount.mjs"></script>` as its last script before `</body>` (and, for an inline row, `<div id="swek-notes"></div>` where it should sit). The gate checks both directions: a listed page without the loader fails, and a page with the loader that is not listed fails.

## What was checked, and what was not

* The gate: 68 rows. Sweeps: the module 84 mechanical mutants (58 caught; 26 survivors: 24 are numbers inside CSS strings, which a fake DOM cannot see; the other two were a real gap, the "loading <path>..." line, closed by a row), the registry 17 hand mutants (16 caught; one argued equivalent on this tree), the page 6 hand mutants (6 caught). The log is in the gate's header.
* **A real browser was used once, by eye**: Chromium (Playwright) against a static server rendered the inline card on `privatelm.html` at 900 and 390 px and on `gputaskman.html`, and the floating pill and its panel on `sea-ogre.html`; links and buttons present, the viewer filled with the note, no page errors. That is a look, not a gate. It was NOT run against the engine's bridge, so the `.md` MIME behaviour (a download link, a text fetch) is the bridge's as read in `server.js`, not as observed here.
* **Which notes are records and which are linked is my judgment**, 23 and 26 of them. If a record has something you would want to find, move it to a page: it is one line in `page-notes.json`.
* Only the nine pages above carry the row. The other pages have no note that applies to them; the rule is about notes, not pages, so they gain the row the day a note is attached to them.
* Standing reds, found while checking that nothing else broke (each fails identically on a clean checkout of the commit before this change): `gateAxioms`, `gateSweep`, `instruments`, `registerResidue`, `reportDoors`, `runtimeGap`, `shaderRefs`, and `toolFrontDoor` on this sandbox (its 120 s cap kills `orphanScan.mjs`, which takes 2 min 2 s here on a clean checkout of the previous commit and 2 min 0 s on this one). This change moves two of their counts by one (a new gate: unswept 37 to 38, knowledge-index "added" 37 to 38); `buildKnowledgeIndex.mjs` at ship time closes the second. `render/seaPicker-selfcheck.mjs` is intermittent on a clean checkout too, and `subAquariumPage-selfcheck.mjs` failed once under a 4-way parallel run and passed alone.
