// WebGLEngine/tools/ship/reportFresh-selfcheck.mjs -- v4834, widened v4839
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
//
// v4839 -- SECTION 3, AN EDIT NOT YET COMMITTED. This gate caught my own v4834 edit to gateReport-selfcheck one commit
// late, because it read git log and nothing else. A gate the working tree changed is now judged by file time.
// SABOTAGES (v4839):
//   E. the working-tree list ignored (staleReports reads only git log)  -> 2 (the fixture row and the repository row)
//   F. the file-time comparison reversed (p > g)                         -> 4 (every row of section 3)
//   G. untracked files not listed (no ls-files --others)                 -> 1 (the repository row: the new gate goes unseen)
//   J. LIVE, on the real tree: one comment line appended to tools/ship/gateReport-selfcheck.mjs and not committed -> the live
//      row red, "gate-reports/gateReport-selfcheck.json (at 2026-10-11, gate edited uncommitted, 2026-10-11T18:42Z)" with
//      its re-take command. That is v4834's own edit, same day and uncommitted, which nothing here could see before.
//      Restored by copy (content equal to HEAD, so the gate is no longer in the working tree's list).
"use strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { staleReports } from "./gateReport.mjs";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const say = (m) => console.log("  ----  " + m);
console.log("reportFresh-selfcheck -- a report older than its gate is a stale map\n");

console.log("1. the tree");
{
    const r = staleReports();
    ok("!! *** no report is older than the last edit to its own gate -- the last commit, or this working tree's uncommitted edit ***", r.stale.length === 0,
        r.stale.length ? r.stale.map((s) => `${s.file} (at ${s.at}, gate edited ${s.edited}) -- SWEK_GATE_REPORT=1 node ${s.gate}`).join("; ")
                       : `${r.judged} of ${r.reports} reports judged against git, ${r.unjudged} unjudged (no commit to their gate in this clone's history); ` +
                         `${r.dirty} on a gate the working tree has changed, judged by file time (v4839)`);
    ok("...and the population is the tree's, not an empty walk", r.reports > 50, `${r.reports} reports`);
    if (r.unjudged) say(`${r.unjudged} report(s) could not be judged here: a shallow clone has no dated edit for their gates. Unjudged is not fresh.`);
}

console.log("\n2. the rule, on fixtures");
{
    const reports = [{ file: "gate-reports/a.json", gate: "x/a-selfcheck.mjs", at: "2026-10-01" },
                     { file: "gate-reports/b.json", gate: "x/b-selfcheck.mjs", at: "2026-10-05" }];
    // newest first, as git log prints: b edited 10-04 (before its report), a edited 10-03 (after its report) then 09-20
    const log = "@c3 2026-10-04\nx/b-selfcheck.mjs\n\n@c2 2026-10-03\nx/a-selfcheck.mjs\n\n@c1 2026-09-20\nx/a-selfcheck.mjs\nx/b-selfcheck.mjs\n";
    const r = staleReports({ reports, log, boundary: [], dirty: [] });   // dirty: [] -- section 3 is the working tree's
    ok("!! a report taken before its gate's last edit is stale; one taken after is not",
        r.stale.length === 1 && r.stale[0].gate === "x/a-selfcheck.mjs" && r.stale[0].edited === "2026-10-03", JSON.stringify(r.stale));
    ok("...the LAST edit decides, not the first: a's 09-20 edit is older than its report and does not save it",
        r.stale.some((s) => s.gate === "x/a-selfcheck.mjs"), "git prints newest first, so the first date seen per file is kept");
    const shallow = staleReports({ reports, log: "@c9 2026-10-11\nx/a-selfcheck.mjs\nx/b-selfcheck.mjs\n", boundary: ["c9"], dirty: [] });
    ok("!! *** a shallow clone's boundary commit is not an edit: both reports UNJUDGED, neither stale ***",
        shallow.stale.length === 0 && shallow.unjudged === 2 && shallow.judged === 0,
        `judged ${shallow.judged}, unjudged ${shallow.unjudged}, stale ${shallow.stale.length} -- the rig's depth-1 clone would otherwise call every report stale`);
}

console.log("\n3. v4839 -- an edit not yet committed, on fixtures and in a repository built for it");
{
    // The rule on its own inputs: which gates the working tree has changed, and when each file was last written.
    const reports = [{ file: "gate-reports/a.json", gate: "x/a-selfcheck.mjs", at: "2026-10-01" },
                     { file: "gate-reports/b.json", gate: "x/b-selfcheck.mjs", at: "2026-10-01" }];
    const times = { "x/a-selfcheck.mjs": 2000, "gate-reports/a.json": 1000, "x/b-selfcheck.mjs": 2000, "gate-reports/b.json": 3000 };
    const r = staleReports({ reports, log: "", boundary: [], dirty: ["x/a-selfcheck.mjs", "x/b-selfcheck.mjs"], mtime: (f) => times[f] ?? null });
    ok("!! *** a gate edited in the working tree AFTER its report was written is stale, before any commit says so ***",
        r.stale.length === 1 && r.stale[0].gate === "x/a-selfcheck.mjs" && /^uncommitted/.test(r.stale[0].edited) && r.dirty === 2,
        JSON.stringify(r.stale) + " -- git log holds no edit at all here, so only the working tree can name it");
    ok("...and one whose report was written after the edit is not: the report re-taken is the answer the red asks for",
        !r.stale.some((x) => x.gate === "x/b-selfcheck.mjs"), `b: gate written at ${times["x/b-selfcheck.mjs"]}, report at ${times["gate-reports/b.json"]}`);

    // And on git itself, because the two listings are what a fixture cannot vouch for: a modified tracked gate
    // (`git diff --name-only HEAD`) and a new one git has never seen (`ls-files --others`).
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "reportFresh-"));
    try {
        const git = (...a) => execFileSync("git", a, { cwd: tmp, stdio: ["ignore", "pipe", "ignore"] });
        const put = (f, text, ms) => { fs.mkdirSync(path.dirname(path.join(tmp, f)), { recursive: true });
            fs.writeFileSync(path.join(tmp, f), text); const t = new Date(ms); fs.utimesSync(path.join(tmp, f), t, t); };
        const day = new Date().toISOString().slice(0, 10), T = Date.now() - 3600000;
        const rep = (g) => JSON.stringify({ gate: g, at: day, tables: [] });
        git("init", "-q"); git("config", "user.email", "fixture@example.invalid"); git("config", "user.name", "fixture");
        put("x/kept-selfcheck.mjs", "// kept\n", T); put("gate-reports/kept-selfcheck.json", rep("x/kept-selfcheck.mjs"), T + 1000);
        put("x/edited-selfcheck.mjs", "// v1\n", T); put("gate-reports/edited-selfcheck.json", rep("x/edited-selfcheck.mjs"), T + 1000);
        git("add", "-A"); git("commit", "-q", "-m", "fixture");
        put("x/edited-selfcheck.mjs", "// v2\n", T + 2000);                                                         // after its report
        put("gate-reports/new-selfcheck.json", rep("x/new-selfcheck.mjs"), T + 3000); put("x/new-selfcheck.mjs", "// new\n", T + 4000);
        const live = staleReports({ root: tmp });
        const names = live.stale.map((x) => x.gate).sort();
        ok("!! *** in a real repository: the modified tracked gate AND the untracked new one are stale; the committed, untouched one is not ***",
            names.join() === "x/edited-selfcheck.mjs,x/new-selfcheck.mjs" && live.dirty === 2,
            `stale: ${names.join(", ") || "none"}; ${live.dirty} report(s) on a gate the working tree changed, of ${live.reports}`);
        put("gate-reports/edited-selfcheck.json", rep("x/edited-selfcheck.mjs"), T + 5000);
        put("gate-reports/new-selfcheck.json", rep("x/new-selfcheck.mjs"), T + 5000);
        const after = staleReports({ root: tmp });
        ok("...and re-taking both reports clears both, so the rule asks for something that can be done",
            after.stale.length === 0, JSON.stringify(after.stale));
    } finally { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {} }
}

console.log(fails ? `\nreportFresh-selfcheck: ${fails} FAILED` : "\nreportFresh-selfcheck: all checks pass");
console.log("unchecked here: a gate edited the SAME DAY as its report and committed elsewhere (`at` is a date; this box's own edits are " +
    "judged before they are committed, by file time), and whether a fresh report's numbers are right -- that is its own gate's question.");
process.exitCode = fails ? 1 : 0;
