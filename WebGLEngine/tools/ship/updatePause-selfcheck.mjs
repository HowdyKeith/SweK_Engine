// WebGLEngine/tools/ship/updatePause-selfcheck.mjs -- v3075
//
// Run: node tools/ship/updatePause-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs (auto-discovered).
//
// AN AUTO-UPDATE MUST NOT RESTART THE SERVER MID-SUITE.
//
// Keith ran the full rig suite and the updater restarted the server partway through. Every gate after that point
// reported "TypeError: Failed to fetch". Those are FALSE FAILURES, and they are worse than real ones: nothing in
// the report distinguishes them from genuine breakage, so the whole run has to be repeated and no individual
// result can be trusted in the meantime. A suite that cannot be trusted has cost more than it saved.
//
// THE GUARD BELONGS WHERE THE UPDATE IS APPLIED, not in each runner. Render QA already refused to start a second
// run while one was live, but nothing stopped the UPDATER walking over it -- so putting the check in the runners
// would have needed writing four times and would have missed whatever runs next. One guard in _applyIncremental
// covers render QA, the gate suite and any future runner that can answer "am I running".
//
// AND IT IS THE SAME SHAPE AS THE RUSTDESK PAUSE (v1933) that already sat there: opt out via config, and a
// MANUAL update always proceeds, because the person is right there and chose it.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { codeOnly } from "./sourceScan.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };

const server = fs.readFileSync(path.join(ENG, "ai-bridge", "server.js"), "utf8");
const gates = fs.readFileSync(path.join(ENG, "ai-bridge", "gatesBridge.js"), "utf8");
const sCode = codeOnly(server), gCode = codeOnly(gates);

// --- 1. the guard exists, and it is in the right place ---------------------------------------------------------
{
    ok("_applyIncremental defers while a test run is live", /const busy = _testRunActive\(\);/.test(sCode) && /deferred: true/.test(sCode));
    // one definition + one call. More than that means it was copied into a runner.
    ok("!! the guard is in the UPDATE path, not duplicated into each runner",
        (sCode.match(/_testRunActive\(\)/g) || []).length === 2,
        "four runners would have meant four copies and a fifth that forgot");
    ok("!! a MANUAL update still proceeds", /if \(!\(opts && opts\.force\)\) \{\s*const busy/.test(sCode.replace(/\s+/g, " ").replace(/if \(!\(opts && opts\.force\)\) \{ const busy/, "if (!(opts && opts.force)) {\nconst busy")) || /opts\.force/.test(sCode),
        "the person is right there and chose it -- same rule the RustDesk pause has had since v1933");
    ok("...and the deferral says WHY, naming the run", /is running -- update paused/.test(server) && /false failure/.test(server));
}

// --- 2. it asks the runners rather than keeping a second flag --------------------------------------------------
{
    ok("_testRunActive asks renderQaBridge.status()", /renderQaBridge\.status\(\)/.test(sCode) && /s\.running/.test(sCode));
    ok("...and gatesBridge.running()", /gatesBridge\.running\(\)/.test(sCode));
    ok("!! every probe is guarded, so a bridge that does not answer cannot break the updater",
        (sCode.match(/try \{[^}]*running[^}]*\} catch \{\}/g) || []).length >= 2 || /typeof gatesBridge !== "undefined"/.test(sCode),
        "a missing running() must leave the update working, not throw inside the deferral check");
    ok("it derives from the runners' OWN state rather than a duplicate flag", !/_testRunning\s*=/.test(sCode),
        "a second flag would one day disagree with the thing it describes");
}

// --- 3. THE GAP BETWEEN TWO SERIAL GATES, which is where an updater would land ---------------------------------
// gates.html runs the suite ONE AT A TIME. Between two gates there is no child process, so a naive "is a child
// alive" check reports idle in exactly the window the updater is most likely to hit. That is the difference
// between a guard and a guard that works.
{
    // RAW SOURCE, NOT codeOnly, FOR THESE. codeOnly()'s own header warns it will mangle a regex literal
    // containing a quote -- gatesBridge has one, so the stripper desyncs into string mode and blanks the rest of
    // the file. These are unambiguous code tokens with no comment to confuse them, so raw is correct here and
    // the limitation is now demonstrated rather than theoretical.
    ok("gatesBridge exports running()", /module\.exports = \{[^}]*running/.test(gates));
    ok("!! it counts a live gate AND a recent one", /_live > 0 \|\| \(Date\.now\(\) - _lastGateAt\)/.test(gCode),
        "the pause between two serial gates is not the end of the run");
    ok("...the counter is incremented before the spawn and decremented in the callback",
        /_live\+\+/.test(gates) && /_live = Math\.max\(0, _live - 1\)/.test(gates));
    ok("...and a decrement cannot drive it negative", /Math\.max\(0, _live - 1\)/.test(gates),
        "a stuck-negative counter would report idle forever, which is the failure mode that matters here");
}

// --- 4. it really behaves ---------------------------------------------------------------------------------------
{
    const { createRequire } = await import("node:module");
    const req = createRequire(import.meta.url);
    const gb = req(path.join(ENG, "ai-bridge", "gatesBridge.js"));
    ok("a bridge that has never run reports idle", gb.running() === false);
    ok("...and running() is callable without arguments or setup", typeof gb.running === "function");
}

// --- v3076: A TIMEOUT IS NOT A FAILURE -------------------------------------------------------------------------
// Keith's run reported three gates as "FAIL null 180.0s". null is the exit code of a process that was KILLED --
// it never returned a verdict at all, so reading it as a failure is a confident wrong answer about unfinished
// work, sitting in the report beside genuine failures with nothing to tell them apart. THREE OF EIGHT
// "failures" in that run were this. The distinction matters in both directions: a failure wants fixing, a
// timeout wants a bigger budget or a smaller fixture, and conflating them sends you hunting a bug that is not
// there. gatesBridge already carried a timedOut flag; rigRunner threw the information away.
{
    const rig = fs.readFileSync(path.join(ENG, "ai-bridge", "rigRunner.js"), "utf8");
    const page = fs.readFileSync(path.join(ENG, "rig.html"), "utf8");
    ok("!! rigRunner reports whether the gate was KILLED, not just its exit code",
        /let timedOut = false;/.test(rig) && /timedOut = true;/.test(rig) && /timedOut, timeoutMs/.test(rig));
    ok("...the flag is set by the killer, so it cannot claim a timeout that did not happen",
        /setTimeout\(\(\) => \{ timedOut = true;/.test(rig));
    ok("...and the budget it exceeded travels with it", /timeoutMs: TIMEOUT_MS/.test(rig),
        "'timed out' without the budget leaves the reader unable to judge whether it was close");
    ok("!! rig.html says TIMEOUT rather than 'FAIL null'", /r\.timedOut \? "TIMEOUT \(/.test(page));
    ok("!! the tally separates fail, timeout and error", /f \+ " fail"[\s\S]{0,80}timeout/.test(page));
    ok("!! and there is a FAILURE-ONLY list, which is what Keith actually asked for",
        /id="failed"/.test(page) && /NEEDS ATTENTION/.test(page),
        "he had to paste every result because nothing could say 'these four are the ones'");
    ok("...it hides itself when there is nothing to look at", /box\.style\.display = bad\.length \? "block" : "none"/.test(page));
    ok("...and an errored check is counted as its own thing, not silently dropped",
        /c\._errored = true; tally\(\);/.test(page) && /\(error\)/.test(page));
}

console.log("updatePause-selfcheck: " + (fails ? fails + " FAILED" : "all pass"));
process.exit(fails ? 1 : 0);
