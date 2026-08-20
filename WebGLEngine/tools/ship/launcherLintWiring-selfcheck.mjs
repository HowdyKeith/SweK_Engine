// WebGLEngine/tools/ship/launcherLintWiring-selfcheck.mjs -- v2989
//
// Run: node tools/ship/launcherLintWiring-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs (auto-discovered).
//
// GATES that launcherLint is (a) WIRED and (b) LOOKING AT ALL OF ITS SUBJECT.
//
// v2988's census split its gate-only list into analysis records and ORPHANED UTILITIES, and named four of the
// second kind. launcherLint was the one that stung: a LINT FOR A BUG CLASS that linted nothing on ship. It has
// existed since v2909 and ran nowhere.
//
// AND WIRING IT FOUND A SECOND DEFECT UNDERNEATH THE FIRST. lintAll used a flat readdirSync per root, so it saw
// the FOUR .bat files at the top of the tree and NONE of the five nested ones. A lint that inspects 44% of its
// subject reports "0 findings" and means "0 findings HERE", with nothing anywhere saying which. Same shape as
// the mutation whose find-string had drifted (v2884) and the render-QA route nested inside a guard it could
// never match (v2857): a check that runs, passes, and covers nothing.
import { lintAll, lintLines } from "./launcherLint.mjs";
import { prose } from "./sourceScan.mjs";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENG = path.join(HERE, "..", "..");
let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };

// ---- 1. IT COVERS ITS WHOLE SUBJECT -----------------------------------------------------------------------
{
    // Count .bat files independently of the lint, so the coverage claim is not the lint marking its own homework.
    const SKIP = /node_modules|[\\/]\.git|[\\/]vendor|GPU_Assets/;
    const count = (d, n = 0) => {
        let es = []; try { es = fs.readdirSync(d, { withFileTypes: true }); } catch { return n; }
        for (const e of es) {
            const f = path.join(d, e.name);
            if (SKIP.test(f)) continue;
            if (e.isDirectory()) n = count(f, n);
            else if (e.name.toLowerCase().endsWith(".bat")) n++;
        }
        return n;
    };
    const truth = count(ENG);
    const reports = lintAll([ENG]);
    ok("!! the lint scans EVERY .bat in the tree", reports.length === truth,
       reports.length + " scanned against " + truth + " counted by an independent walk -- it used to scan 4 of 9, a flat readdir at the top level only");
    ok("...and the count is non-trivial", truth >= 8, truth + " launchers");
    // NAMED, not pattern-matched on the path -- because lintLauncher reports only the BASENAME. That is a small
    // defect of its own: two launchers with the same name in different directories would be indistinguishable in
    // the output. Recorded rather than silently worked around.
    const names = new Set(reports.map((r) => path.basename(r.file)));
    const nested = ["First_Start_AI_Bridge.bat", "START_BRAIN.bat", "START_BRAIN_CPU.bat", "run_agent.bat", "build_wasm.bat"];
    const missing = nested.filter((n) => !names.has(n));
    ok("!! the five previously-invisible nested launchers ARE scanned", missing.length === 0,
       missing.length ? "STILL MISSING: " + missing.join(", ") : nested.join(", ") + " -- in ai-bridge, brain, tools/roundhouse and wasm-terrain");
    ok("...and the report keeps only a BASENAME, which is worth knowing", reports.every((r) => !/[\\/]/.test(r.file)),
       "two same-named launchers in different directories would read as one -- stated here rather than discovered later");
}

// ---- 2. IT IS WIRED INTO THE GATE THAT ACTUALLY RUNS -----------------------------------------------------------
{
    const verify = fs.readFileSync(path.join(ENG, "tools", "ship", "verify.mjs"), "utf8");
    ok("!! verify.mjs runs the launcher lint", /launcherLint\.mjs/.test(verify),
       "it existed from v2909 to v2988 and ran nowhere -- the ship gate is the 74 checks that run EVERY time");
    ok("...and reports the SCAN COUNT, not just a verdict", /scanned/.test(verify),
       "'0 findings' from a lint that saw four files is not the same statement as '0 findings' from one that saw nine");
    ok("...and fails loudly if the lint cannot run at all", /launcher lint could run at all/.test(verify),
       "a lint that silently stopped importing would be the v2909 situation again with a green tick on top");
}

// ---- 3. IT IS CHEAP, which is why there was never a reason for it to be outside the gate ----------------------------
{
    const t = Date.now();
    lintAll([ENG]);
    const ms = Date.now() - t;
    ok("!! the whole lint costs well under a second", ms < 1000,
       ms + "ms -- there was never a cost argument for leaving it out, it just never got put in");
}

// ---- 4. it can still find something ---------------------------------------------------------------------------------
{
    const reports = lintAll([ENG]);
    ok("every report names its file", reports.every((r) => (r.file || "").length > 3));
    ok("every report carries a findings array", reports.every((r) => Array.isArray(r.findings)),
       "an absent findings list would read as clean");
    ok("the summary line states the scan size", /\d+ launchers scanned/.test((lintLines(reports) || []).join(" ")),
       "so a future shrink in coverage is visible in the output rather than silent");
}

console.log(fails ? "\nlauncherLintWiring-selfcheck: " + fails + " FAILED" : "\nlauncherLintWiring-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
