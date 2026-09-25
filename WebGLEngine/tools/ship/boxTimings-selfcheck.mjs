// WebGLEngine/tools/ship/boxTimings-selfcheck.mjs -- v4679
//
// Run: node tools/ship/boxTimings-selfcheck.mjs      (~3s)
//
// *** A RATCHET WITH NO REACHABLE CLEAR STATE IS NOT A CHECK. ***
//
// recordDrift's "sweep timings" row asked whether every gate has a reading in sweep-timings.json. That file is
// host-claimed -- v4647 made it refuse a foreign write, rightly -- and its host is a cloud container that no
// longer exists. The rig cannot claim it; a new container hashes differently. SO NO LIVE BOX COULD ADD AN
// ENTRY, and every round that added a gate left the row red with no action that would clear it.
//
// The repair is not to loosen the row. It is that the row was asking a COVERAGE question ("has this gate ever
// been timed") of a COST-scoped record ("what does it cost on the box that owns this file"). This file grades
// that the two are kept apart, that a foreign reading answers the first and not the second, and that the
// writer a round needs actually writes what it claims.
"use strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import * as BT from "./boxTimings.mjs";
import { boxId } from "./hostScale.mjs";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const report = (l) => console.log("  ----  " + l);
console.log("boxTimings-selfcheck -- the cross-box fallback wrote a file nobody read\n");

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "boxtimings-"));
fs.mkdirSync(path.join(TMP, "tools", "ship"), { recursive: true });
const put = (rel, obj) => fs.writeFileSync(path.join(TMP, rel), JSON.stringify(obj, null, 1));
const ME = "boxA", THEM = "boxB";

// ---- 1. THE NAMES, AND WHY THE PER-BOX ONE IS PER BOX --------------------------------------------------------
console.log("1. *** A FILENAME PER BOX IS v4647'S ARGUMENT ABOUT FIELDS, ONE LEVEL UP ***");
{
    ok("!! the per-box name carries the box id, so two machines cannot overwrite one another",
        BT.FILES.perBox(ME) !== BT.FILES.perBox(THEM) &&
        BT.FILES.perBox(ME).includes(ME) && /^tools\/ship\/sweep-timings\..+\.json$/.test(BT.FILES.perBox(ME)),
        `${BT.FILES.perBox(ME)} vs ${BT.FILES.perBox(THEM)} -- v4647 kept two machines' runtimes out of one set ` +
        "of FIELDS; this keeps them out of one FILE, which is the same argument and the reason the single " +
        "`.local.json` name could only ever hold whichever box ran last");
    ok("...and the shared and legacy names are distinct from it and from each other",
        BT.FILES.shared !== BT.FILES.legacy && BT.FILES.legacy !== BT.FILES.perBox(ME) &&
        /local\.json$/.test(BT.FILES.legacy),
        `${BT.FILES.legacy} is still READ, so the rig's existing measurements are not orphaned by the rename`);
}

// ---- 2. COVERAGE READS EVERY RECORD; COST DOES NOT -----------------------------------------------------------
console.log("\n2. *** THE TWO QUESTIONS, AND A CONTROL THAT SEPARATES THEM ***");
{
    put(BT.FILES.shared, { host: THEM, timings: { "a-selfcheck.mjs": 100, "b-selfcheck.mjs": 200 },
                           at: { "a-selfcheck.mjs": "T", "b-selfcheck.mjs": "T" },
                           kinds: { "a-selfcheck.mjs": "loaded", "b-selfcheck.mjs": "loaded" } });
    put(BT.FILES.perBox(ME), { host: ME, timings: { "b-selfcheck.mjs": 55, "c-selfcheck.mjs": 70 },
                               at: { "b-selfcheck.mjs": "U", "c-selfcheck.mjs": "U" },
                               kinds: { "b-selfcheck.mjs": "alone", "c-selfcheck.mjs": "alone" } });
    const c = BT.coverage(TMP, { id: ME });
    report(`records ${c.records.length}; covered ${c.entries.size}; mine ${c.localCount}, foreign ${c.foreignCount}`);

    ok("!! *** a gate timed on ANOTHER box counts as COVERED, which is what unstuck the ratchet ***",
        c.covered("a-selfcheck.mjs") && c.entries.get("a-selfcheck.mjs").mine === false,
        "'has this gate ever been timed' is answerable by any box's record. Reading only the host-claimed file " +
        "made the row unclearable, because no live box can write that file at all");
    ok("!! *** and the entry still says WHOSE reading it is, so COST is not silently answered by COVERAGE ***",
        c.entries.get("a-selfcheck.mjs").host === THEM && c.entries.get("c-selfcheck.mjs").mine === true,
        "a caller that needs the cost on THIS box can refuse a foreign row; one that needs coverage need not. " +
        "Collapsing them into a bare boolean is the defect, not the fix");
    ok("!! *** THIS BOX'S OWN READING WINS when both records hold the gate ***",
        c.entries.get("b-selfcheck.mjs").ms === 55 && c.entries.get("b-selfcheck.mjs").mine === true,
        "55 (alone, mine) over 200 (loaded, theirs) -- the shared file is first in the walk, so this is the " +
        "precedence rule doing work rather than the read order deciding by accident");
    ok("...and a gate in NO record is not covered, or the row above would pass on anything",
        !c.covered("nothing-selfcheck.mjs"));

    // THE CONTROL: with only the foreign record present, `mine` must be zero -- otherwise `localCount` is
    // measuring the number of entries rather than the number measured here.
    fs.unlinkSync(path.join(TMP, BT.FILES.perBox(ME)));
    const only = BT.coverage(TMP, { id: ME });
    ok("!! CONTROL: with no local record at all, NOTHING reads as locally measured",
        only.localCount === 0 && only.foreignCount === 2 && only.covered("a-selfcheck.mjs"),
        `${only.localCount} local of ${only.entries.size} -- still fully COVERED and zero of it measured here, ` +
        "which is precisely the rig's situation and must not read as a clean bill for the budget");
}

// ---- 2b. THE PURE CORE, BECAUSE THE FIRST VERSION MADE A CHECK UNFIXTUREABLE -----------------------------------
console.log("\n2b. *** coverageOf TAKES RECORDS RATHER THAN READING THEM, AND THAT IS NOT A STYLE CHOICE ***");
{
    // recordDrift's staleness check injects a timings record and asserts the check notices what is wrong with
    // it. The first version of this round routed that check through a function that reads the REAL FILES, so
    // the fixture could not reach it: TWO SABOTAGE ROWS WENT RED and the check became undriveable. A staleness
    // check nothing can falsify is a worse defect than the unclearable ratchet this round set out to fix.
    const handed = [{ file: "(injected)", kind: "shared", host: THEM,
                      rec: { timings: { "x-selfcheck.mjs": 9 }, at: { "x-selfcheck.mjs": "T" },
                             kinds: { "x-selfcheck.mjs": "loaded" } } }];
    const c = BT.coverageOf(handed, { id: ME });
    ok("!! *** coverageOf answers from the records it is HANDED and reads no file at all ***",
        c.entries.size === 1 && c.covered("x-selfcheck.mjs") && !c.covered("a-selfcheck.mjs"),
        "a-selfcheck.mjs is in the real fixtures on disk from section 2 and must NOT appear here. If it did, a " +
        "fixture would be answering with the tree's state instead of its own");
    ok("...and it still attributes the host, so the injected path is not a different question",
        c.entries.get("x-selfcheck.mjs").host === THEM && c.entries.get("x-selfcheck.mjs").mine === false);
    ok("!! CONTROL: handed NOTHING it reports nothing, rather than falling back to the tree",
        (() => { const e = BT.coverageOf([], { id: ME }); return e.entries.size === 0 && e.localCount === 0; })(),
        "an empty record set is a legitimate state -- a box with no records -- and reading the real files to " +
        "fill the gap is precisely the fallback that broke the sabotages");
}

// ---- 3. THE LEGACY FILE IS READ, BECAUSE THE RIG ALREADY HAS ONE ----------------------------------------------
console.log("\n3. *** THE FILE v4647 WROTE IS NOT ORPHANED BY THE RENAME ***");
{
    put(BT.FILES.legacy, { host: ME, timings: { "legacy-selfcheck.mjs": 42 },
                           at: { "legacy-selfcheck.mjs": "T" }, kinds: { "legacy-selfcheck.mjs": "alone" } });
    const c = BT.coverage(TMP, { id: ME });
    ok("!! a reading in the old single-name file still counts, and is attributed to its host",
        c.covered("legacy-selfcheck.mjs") && c.entries.get("legacy-selfcheck.mjs").mine === true &&
        c.records.some((r) => r.kind === "legacy"),
        "the rig has one of these with 1,409 readings in it. Renaming the target without reading the old name " +
        "would have thrown those away on the round that finally started using them");
    ok("...and the walk does not mistake the legacy file for a per-box one, which would double-count it",
        c.records.filter((r) => r.file === BT.FILES.legacy).length === 1);
}

// ---- 4. THE WRITER, DRIVEN -- INCLUDING THE CAP ---------------------------------------------------------------
console.log("\n4. *** recordLocal WRITES WHAT IT CLAIMS, AND A CAP KILL IS A FLOOR AND NOT A RUNTIME ***");
{
    const calls = [];
    const fakeRun = (g) => { calls.push(g); return g.includes("slow") ? { signal: "SIGTERM" } : { status: 0 }; };
    const r = BT.recordLocal(["fast-selfcheck.mjs", "slow-selfcheck.mjs"],
                             { root: TMP, id: ME, run: fakeRun, now: "STAMP" });
    const w = JSON.parse(fs.readFileSync(path.join(TMP, BT.FILES.perBox(ME)), "utf8"));
    ok("!! *** it runs each gate and files a ms, a per-entry stamp, a kind and an exit code ***",
        calls.length === 2 && w.timings["fast-selfcheck.mjs"] >= 0 && w.at["fast-selfcheck.mjs"] === "STAMP" &&
        w.kinds["fast-selfcheck.mjs"] === "alone" && w.codes["fast-selfcheck.mjs"] === 0,
        "all four, because recordDrift requires a timing AND its own stamp AND a kind -- a reading whose " +
        "quantity is unknown is not a reading anybody can compare");
    ok("!! *** a capped gate is `capped`, not `alone`, so a FLOOR is never read as a runtime ***",
        w.kinds["slow-selfcheck.mjs"] === "capped" && w.codes["slow-selfcheck.mjs"] === null,
        "and its code is null rather than 0: a gate that was killed did not pass, and recording 0 there would " +
        "be the missing-measurement-as-clean-bill shape this tree keeps finding");
    ok("...and it MERGES rather than replaces, so timing one gate does not erase the box's other readings",
        w.timings["legacy-selfcheck.mjs"] === undefined && Object.keys(w.timings).length === 2 &&
        BT.recordLocal(["third-selfcheck.mjs"], { root: TMP, id: ME, run: fakeRun, now: "S2" }).total === 3,
        "three entries after a second call that named one gate");
    ok("...and the written record claims its host, or coverage could not attribute it",
        w.host === ME && /COVERAGE/.test(w.note) && /task #87/.test(w.note),
        "the note says what the file is for AND what it is not for -- the budget still reads the shared file");
}

// ---- 5. THE LIVE TREE, AND WHAT IS HONESTLY STILL WRONG --------------------------------------------------------
console.log("\n5. *** THE REAL RECORDS, AND THE HALF THIS ROUND DID NOT DO ***");
{
    const live = BT.coverage(BT.ENG);
    report(`live: ${live.records.length} record(s), ${live.entries.size} gates covered, ` +
        `${live.localCount} measured on this box (${live.thisBox}), ${live.foreignCount} elsewhere`);
    ok("!! the shared record is present and is NOT this box's, which is the whole situation",
        live.records.some((r) => r.kind === "shared") &&
        live.records.find((r) => r.kind === "shared").host !== live.thisBox,
        `shared record belongs to ${live.records.find((r) => r.kind === "shared").host}; this box is ` +
        `${live.thisBox}. Neither the rig nor this container can write it, which is why coverage had to stop ` +
        "being asked of it");
    ok("!! *** and the BUDGET still reads the shared file alone -- stated, not quietly fixed ***",
        /costOf/.test(fs.readFileSync(path.join(BT.ENG, "tools", "ship", "quickSweep.mjs"), "utf8")) &&
        !/boxTimings/.test(fs.readFileSync(path.join(BT.ENG, "tools", "ship", "quickSweep.mjs"), "utf8")),
        "quickSweep does not import this module. On the rig that means gate SELECTION is still computed from a " +
        "foreign box's numbers -- 91 of 1,409 read over budget there for that reason. Task #87, and it changes " +
        "which gates run, so it is not smuggled into a round about a staleness row");
}

try { fs.rmSync(TMP, { recursive: true, force: true }); } catch {}
console.log("\nunchecked here: WHETHER A FOREIGN READING IS A GOOD ENOUGH ANSWER FOR ANYTHING BUT COVERAGE. It is " +
    "not, and nothing here pretends otherwise -- the rig's own verify measured 91 of 1,409 gates over budget " +
    "purely for being named by a faster box. What would settle it is the cost half reading per-box records and " +
    "scaling or refusing, which is task #87 and belongs with origin/claude/v4672-relative-budget's scale " +
    "machinery rather than beside a second copy of it.");
console.log(fails ? `\nboxTimings-selfcheck: ${fails} FAILED` : "\nboxTimings-selfcheck: all checks pass");
process.exitCode = fails ? 1 : 0;
