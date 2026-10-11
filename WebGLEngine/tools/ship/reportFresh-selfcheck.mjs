// WebGLEngine/tools/ship/reportFresh-selfcheck.mjs -- v4834
//
// Run: node tools/ship/reportFresh-selfcheck.mjs
//
// GATES tools/ship/gateReport.mjs's staleReports(): NO REPORT IN gate-reports/ IS OLDER THAN THE LAST COMMIT TO ITS OWN GATE.
//
// At the v4819 merge 55 reports conflicted and one side's copy of each was taken whole, against gates the other side had
// edited. Re-run at v4834, 20 of the 55 printed different tables (each reproduced exactly on a second run, so stale and not
// noisy -- murmur's live terms, a second fsrFrameGenBackdrop table, constantRows' census, fsr3's pacing dB), and 16 more
// reports outside the merge were older than their gate's last commit. All 71 are re-taken; this holds the line at zero.
// A report is re-taken with `SWEK_GATE_REPORT=1 node <gate>`, which is what a red here names.
//
// SABOTAGES, four, each red by name:
//   A. staleReports compares with >= instead of >              -> 1 (the live row: every report of a gate edited the day it was taken)
//   B. the shallow boundary is not skipped                      -> 1 (the boundary fixture)
//   C. the first date seen is not kept (the OLDEST edit wins)   -> 2 (both fixture rows: the stale one and the newest-edit one)
//   D. one real report's `at` moved back a year                 -> 1 (the live row, naming it)
"use strict";
import { staleReports } from "./gateReport.mjs";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const say = (m) => console.log("  ----  " + m);
console.log("reportFresh-selfcheck -- a report older than its gate is a stale map\n");

console.log("1. the tree");
{
    const r = staleReports();
    ok("!! *** no report is older than the last commit to its own gate ***", r.stale.length === 0,
        r.stale.length ? r.stale.map((s) => `${s.file} (at ${s.at}, gate edited ${s.edited}) -- SWEK_GATE_REPORT=1 node ${s.gate}`).join("; ")
                       : `${r.judged} of ${r.reports} reports judged against git, ${r.unjudged} unjudged (no commit to their gate in this clone's history)`);
    ok("...and the population is the tree's, not an empty walk", r.reports > 50, `${r.reports} reports`);
    if (r.unjudged) say(`${r.unjudged} report(s) could not be judged here: a shallow clone has no dated edit for their gates. Unjudged is not fresh.`);
}

console.log("\n2. the rule, on fixtures");
{
    const reports = [{ file: "gate-reports/a.json", gate: "x/a-selfcheck.mjs", at: "2026-10-01" },
                     { file: "gate-reports/b.json", gate: "x/b-selfcheck.mjs", at: "2026-10-05" }];
    // newest first, as git log prints: b edited 10-04 (before its report), a edited 10-03 (after its report) then 09-20
    const log = "@c3 2026-10-04\nx/b-selfcheck.mjs\n\n@c2 2026-10-03\nx/a-selfcheck.mjs\n\n@c1 2026-09-20\nx/a-selfcheck.mjs\nx/b-selfcheck.mjs\n";
    const r = staleReports({ reports, log, boundary: [] });
    ok("!! a report taken before its gate's last edit is stale; one taken after is not",
        r.stale.length === 1 && r.stale[0].gate === "x/a-selfcheck.mjs" && r.stale[0].edited === "2026-10-03", JSON.stringify(r.stale));
    ok("...the LAST edit decides, not the first: a's 09-20 edit is older than its report and does not save it",
        r.stale.some((s) => s.gate === "x/a-selfcheck.mjs"), "git prints newest first, so the first date seen per file is kept");
    const shallow = staleReports({ reports, log: "@c9 2026-10-11\nx/a-selfcheck.mjs\nx/b-selfcheck.mjs\n", boundary: ["c9"] });
    ok("!! *** a shallow clone's boundary commit is not an edit: both reports UNJUDGED, neither stale ***",
        shallow.stale.length === 0 && shallow.unjudged === 2 && shallow.judged === 0,
        `judged ${shallow.judged}, unjudged ${shallow.unjudged}, stale ${shallow.stale.length} -- the rig's depth-1 clone would otherwise call every report stale`);
}

console.log(fails ? `\nreportFresh-selfcheck: ${fails} FAILED` : "\nreportFresh-selfcheck: all checks pass");
console.log("unchecked here: a gate edited the SAME DAY as its report (`at` is a date), and whether a fresh report's numbers are right " +
    "-- that is its own gate's question.");
process.exitCode = fails ? 1 : 0;
