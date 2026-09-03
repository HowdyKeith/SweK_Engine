// WebGLEngine/tools/ship/shipVerdict-selfcheck.mjs
//
// Run: node tools/ship/shipVerdict-selfcheck.mjs   (~2s -- MEASURED)
//
// v4405 -- *** THE ROUND BEFORE THIS ONE SHIPPED A CONFLICT MARKER ONTO main, PAST A VERIFY THAT SAID
// "DO NOT SHIP". ***
//
// verify.mjs printed "1 FAILURE(S) -- DO NOT SHIP" and exited 1. The commit, the push and the fast-forward all
// ran anyway, because they were chained behind a read of the LOG rather than a read of `$?`. Nothing in the
// tree could have caught it: every gate here grades the tree, and the thing that failed was the hand between
// the gate and the push.
//
// Two things it holds, matching the two halves of the failure:
//   * NO TRACKED FILE CARRIES A CONFLICT MARKER, here and on origin/main. No allowance list and no ceiling --
//     the answer to finding one is to resolve it, never to file it, which is the rule claimEvidence uses for
//     contradicted claims.
//   * A VERDICT IS THE EXIT STATUS, and a tail that disagrees with it in EITHER direction is no verdict at
//     all. Proven against a live child process that prints "[verify] ALL GREEN" and exits 1 -- the exact shape
//     that would have fooled the chain -- not against a string in a fixture.
//
// Read with tools/ship/shipVerdict.mjs, which is what the ritual's step 4 now runs.
//
// SABOTAGES (3, all logged, MEASURED 1/3/1 reds by name -- the middle one lands in three places because the
// pair table, the named row and the LIVE child process all read the same rule from different directions):
//   * dropped the `^` anchor from MARKER_RE -> section 2 went red naming this very file, which quotes markers
//     in prose. Restored. That is why the anchor is the design and not an accident.
//   * made verdict() trust the tail when the exit status disagreed -> section 3's "tail says green, exit 1"
//     row went red BY NAME. Restored.
//   * put a conflict marker at line start in a scratch tracked file -> section 2 named the file and the line.
//     Removed.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as SV from "./shipVerdict.mjs";
import { gateReport } from "./gateReport.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const ROOT = path.resolve(ENG, "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const say = (m) => console.log("  ----  " + m);
const REPORT = gateReport("tools/ship/shipVerdict-selfcheck.mjs");

console.log("\n1. the detector sees all three marker shapes, and only at line start");
{
    const planted = ["ok line", "<<<<<<< HEAD", "one", "||||||| base", "two", "=======", "three", ">>>>>>> other", "end"].join("\n");
    const m = SV.conflictMarkers(planted);
    ok("all three anchored kinds are found, with their line numbers", m.length === 3 && m[1].line === 4,
        m.map((x) => x.kind + "@" + x.line).join(" "));
    ok("...and prose that MENTIONS a marker mid-line is not one", SV.conflictMarkers("see <<<<<<< HEAD in the log").length === 0,
        "this gate's own header quotes markers; an unanchored detector would flag the file that explains the defect");
    ok("...and a bare ======= rule is not counted", SV.conflictMarkers("Title\n=======\nbody").length === 0,
        "LIMIT SAID PLAINLY: `=======` carries no trailing text and is a markdown underline as often as a merge. " +
        "It is not matched, so a conflict reduced to that ONE line survives this gate. Both bracketing markers are");
}

console.log("\n2. no tracked file carries one -- here or on origin/main");
const scan = SV.scanTracked(ROOT);
{
    ok("!! *** the working tree is clean of conflict markers ***", scan.hits.length === 0,
        scan.hits.length ? scan.hits.map((h) => h.file + ":" + h.marks.map((x) => x.line).join("/")).join(", ")
                         : `${scan.scanned} tracked files read in full -- no allowance list, no ceiling`);
    const ref = SV.scanRef(ROOT, "origin/main");
    if (!ref.ok) {
        // Narrowed on purpose (v4402): the ONLY thing that excuses this row is the ref being absent, because an
        // absence read as a skip is an absence read as a pass, and that is what this whole round is about.
        ok("origin/main could not be read, and that is the only skip allowed here", /unknown revision|not a valid object|ambiguous argument/i.test(ref.why || ""),
            "SKIPPED: " + ref.why);
    } else {
        // A ROUND CANNOT SHIP THE REPAIR OF main IF THE GATE THAT DEMANDS main BE CLEAN IS RED UNTIL IT LANDS.
        // So the rule is not "main is clean" but "main is clean OR THIS TREE CARRIES THE REPAIR": every marked
        // file on the ref is clean here, so the push clears it. That has no slack -- it cannot be satisfied by
        // ignoring the marker, only by holding its fix in the very commit being verified.
        const unrepaired = ref.hits.filter((h) => scan.hits.some((x) => x.file === h.file) || !fs.existsSync(path.join(ROOT, h.file)));
        ok("!! *** and what is actually ON origin/main is clean, or repaired by THIS tree ***", unrepaired.length === 0,
            unrepaired.length ? unrepaired.map((h) => h.file + " x" + h.count).join(", ") + " -- still marked here too"
                : ref.hits.length ? "origin/main carries " + ref.hits.map((h) => h.file + " x" + h.count).join(", ") +
                    " -- v4404 shipped exactly that, and EVERY ONE IS CLEAN IN THIS TREE, so this commit is the repair"
                : "the ref, not the working tree: a clean tree is not evidence about what shipped");
    }
}

console.log("\n3. a verdict is the exit status, and a tail that disagrees is no verdict");
{
    const rows = [
        { code: 0, tail: "[verify] ALL GREEN", ship: true, agrees: true },
        { code: 1, tail: "[verify] 1 FAILURE(S) - DO NOT SHIP", ship: false, agrees: true },
        { code: 1, tail: "[verify] ALL GREEN", ship: false, agrees: false },
        { code: 0, tail: "[verify] 1 FAILURE(S) - DO NOT SHIP", ship: false, agrees: false },
        { code: null, tail: "[verify] ALL GREEN", ship: false, agrees: false },
    ];
    let wrong = [];
    for (const r of rows) {
        const v = SV.verdict(r);
        if (v.ship !== r.ship || v.agrees !== r.agrees) wrong.push(`exit ${r.code} tail ${JSON.stringify(r.tail.slice(0, 20))}`);
    }
    ok("all five (status, tail) pairs land where they must", wrong.length === 0, wrong.join("; ") || "5 of 5");
    ok("!! *** a tail saying ALL GREEN under a NONZERO exit is NOT a pass ***", SV.verdict({ code: 1, tail: "[verify] ALL GREEN" }).ship === false,
        "THE EXACT SHAPE THAT SHIPPED v4404: the chain read the words and not the status");
    ok("...and a ZERO exit under a tail that does not say green is not one either", SV.verdict({ code: 0, tail: "nothing" }).ship === false,
        "disagreement in either direction is an unfinished or lying run, not a green one");
    ok("...and a process with NO exit status is not a pass", SV.verdict({ code: null, tail: "[verify] ALL GREEN" }).ship === false,
        "v4392's finding, third and fourth sighting this session: a crashed process's output is not a verdict");
    REPORT.table("what a (exit status, tail) pair is worth", ["exit", "tail says", "ship?", "agrees?"],
        rows.map((r) => [String(r.code), SV.TAIL_GREEN.test(r.tail) ? "ALL GREEN" : "failures", SV.verdict(r).ship ? "SHIP" : "NO", SV.verdict(r).agrees ? "yes" : "no"]),
        "The row that shipped v4404 is (1, ALL GREEN) -- the tail was true of an earlier run in the same log.");
}

console.log("\n4. proven against a live process, not a fixture");
{
    const liar = path.join(ENG, "tools", "ship", ".shipVerdict-liar.mjs");
    fs.writeFileSync(liar, 'console.log("[verify] ALL GREEN");\nprocess.exit(1);\n');
    let r;
    try { r = await SV.runProcess(process.execPath, [liar], { cwd: ENG }); } finally { fs.unlinkSync(liar); }
    ok("a REAL child that prints ALL GREEN and exits 1 is caught", r.code === 1 && SV.verdict(r).ship === false,
        `exit=${r.code} tail=${JSON.stringify(r.tail)}`);
    const d = SV.decide({ verify: { code: 0, tail: "[verify] ALL GREEN" }, conflicts: { scanned: 9, hits: [{ file: "x.js", marks: [{ line: 3 }] }] } });
    ok("...and a green verify still does not ship with a marker in the tree", d.ship === false, d.reason);
    ok("...the two conditions are independent: green + clean is the only SHIP",
        SV.decide({ verify: { code: 0, tail: "[verify] ALL GREEN" }, conflicts: { scanned: 9, hits: [] } }).ship === true,
        "one gate for two failures would send different work to the same place -- v4401's rule");
}

console.log("\n5. the ritual points at the status, not at the log");
{
    const skill = path.join(ROOT, ".claude", "skills", "ship", "SKILL.md");
    const src = fs.existsSync(skill) ? fs.readFileSync(skill, "utf8") : "";
    ok("the ship skill exists and names shipVerdict", src.includes("shipVerdict.mjs"),
        src ? "step 4 runs it, so the last line of the step IS derived from the exit code" : "SKILL.md not found at " + skill);
    ok("...and says in as many words that the exit status decides", /exit status|\$\?/.test(src),
        "LIMIT: this is a check for words in prose, which is the weakest shape in the tree and is named as such. " +
        "It cannot tell whether the hand running the ritual obeys it. Section 2 is the one that catches the result");
}

say("WHAT THIS DOES NOT CLAIM. That a round cannot be pushed unverified -- nothing in a repository can stop a " +
    "person from typing `git push`. What it does is make the unverified push LEAVE A MARK the next gate run " +
    "finds, on origin/main and not merely here, and remove the incentive that produced this one by making the " +
    "ritual's last line a rendering of the exit code rather than a thing to be read past. It also cannot see a " +
    "conflict resolved WRONGLY -- markers gone, semantics broken -- which is a different and harder question " +
    "that the gates for the affected files answer, and which is why gateSweep-selfcheck was the thing that " +
    "first told me v4404's merge was bad.");

REPORT.write();
console.log(`\nshipVerdict-selfcheck: ${fails === 0 ? "all checks pass" : fails + " FAILURE(S)"}`);
process.exit(fails === 0 ? 0 : 1);
