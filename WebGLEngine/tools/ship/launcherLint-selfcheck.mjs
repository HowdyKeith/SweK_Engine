// tools/ship/launcherLint-selfcheck.mjs
//
// Run: node tools/ship/launcherLint-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs (discovery gate).
//
// v2909 -- OPEN ITEM 10, CLOSED, AND THE CLASS OF BUG BEHIND IT GATED.

import fs from "fs";
import { fileURLToPath } from "node:url";
import os from "os";
import path from "path";
import { lintLauncher, lintAll, lintLines } from "./launcherLint.mjs";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };

// v4005 -- *** THE PROJECT ROOT WAS DERIVED FROM THE WORKING DIRECTORY, so this gate crashed with ENOENT
// on /home/user/START_NODE_Engine.bat when run from anywhere but WebGLEngine/. *** A cwd is not a
// landmark: it is a fact about how somebody invoked you. THIRD INSTANCE OF THIS FAMILY THIS SESSION --
// gateSelection compared paths against an un-normalised ENG_ROOT, and changelog.mjs searched for
// BACKLOG.md as its landmark when no machine has one. Derived from this file's OWN location now,
// which is the pattern every other gate here already uses.
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
// ...and WebGLEngine itself, for the launchers that live INSIDE it. process.cwd() was standing in for this
// and only agreed when the gate happened to be invoked from there.
const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "lintprobe-"));
const write = (n, s) => { const p = path.join(tmp, n); fs.writeFileSync(p, s); return p; };

// ---- 1. DETECTION POWER, MEASURED BEFORE THE RESULT IS BELIEVED ----------------------------------------------------
// The lint found exactly one file on its first run -- the file it was written for. That is precisely the
// situation v2893 built the planted-error discipline for: a checker that has only ever found the bug its author
// already knew about has unknown power over the bug its author did not.
{
    const r2 = lintLauncher(write("PLANTED_R2.bat",
        "@echo off\r\npushd ai-bridge\r\nnode server.js\r\nstart \"Late Brain\" cmd /c \"START_BRAIN.bat\"\r\npopd\r\n"));
    ok("!! a launch stranded after a FOREGROUND server is caught",
        r2.findings.length === 1 && r2.findings[0].rule === "R2-after-foreground",
        "node server.js blocks until shutdown, so anything after it never starts -- this is the rule " +
        "START_NODE_Engine.bat already obeys in prose and nothing enforced");

    const r1 = lintLauncher(write("PLANTED_R1.bat",
        "@echo off\r\necho Engine running. Close this window to leave it running.\r\npause >nul\r\n" +
        "start \"Brain\" cmd /c \"START_BRAIN.bat\"\r\n"));
    ok("!! a launch after a pause is caught, and escalated when the echo says to close the window",
        r1.findings.length === 1 && r1.findings[0].rule === "R1-after-pause" && r1.findings[0].severity === "high",
        "code after `pause` is reachable by keypress, so control flow alone cannot condemn it. What condemns it " +
        "is the launcher's own instruction three lines above telling the user to close instead. The lint reads " +
        "the echo lines for exactly this");

    const noAdvice = lintLauncher(write("PAUSE_NO_ADVICE.bat", "@echo off\r\npause\r\nstart \"x\" cmd /c \"y.bat\"\r\n"));
    ok("...and NOT escalated when it does not",
        noAdvice.findings.length === 1 && noAdvice.findings[0].severity === "medium",
        "same control flow, different severity, because the difference is whether the user was told to close");
}

// ---- 2. THE CONTROLS, WHICH MATTER MORE THAN THE CATCHES -------------------------------------------------------------
{
    const clean = lintLauncher(write("CLEAN_ORDER.bat",
        "@echo off\r\nstart \"Brain\" cmd /c \"START_BRAIN.bat\"\r\npushd ai-bridge\r\nnode server.js\r\npopd\r\n"));
    ok("a correctly ordered launcher is not flagged", clean.findings.length === 0,
        "brain first, blocking server second -- the shape START_NODE_Engine.bat uses");

    const label = lintLauncher(write("LABEL_REENTRY.bat",
        "@echo off\r\npause\r\ngoto :skip\r\n:skip\r\nstart \"fine\" cmd /c \"y.bat\"\r\n"));
    ok("!! a label between the blocker and the launch suppresses the finding",
        label.findings.length === 0,
        "batch has goto, so a :label after a pause can be re-entered and the code is genuinely reachable. " +
        "Flagging it would be a false positive, and a lint with false positives on a 25-file corpus gets " +
        "switched off within a week");

    // The most important control in this file: the launcher the engine's own auto-update relaunch selects.
    const node = lintLauncher(path.join(ROOT, "START_NODE_Engine.bat"));
    ok("!! START_NODE_Engine.bat is clean -- the launcher actually in daily use was never affected",
        node.findings.length === 0,
        "it starts the GPU Brain BEFORE the foreground node server.js and has since v2064, with the comment " +
        "saying why. Open item 10 was a real bug in a launcher nobody runs, which is exactly why it survived " +
        "so many rounds of being on the list");
}

// ---- 3. OPEN ITEM 10, CLOSED ------------------------------------------------------------------------------------------
{
    const reports = lintAll([ROOT, ENG]);
    const stranded = reports.reduce((a, r) => a + r.findings.length, 0);
    console.log();
    lintLines(reports).forEach((l) => console.log(l));
    console.log();

    ok("!! every launcher in the tree is now free of stranded launches",
        stranded === 0,
        reports.length + " .bat files scanned, 0 stranded. Before this round Start_Everything.bat had three: the " +
        "stale-brain reaper, the window-title taskkill, and the brain start itself -- all below `pause >nul`");

    const se = fs.readFileSync(path.join(ENG, "Start_Everything.bat"), "utf8").replace(/\r/g, "");
    // ANCHOR TO COMMANDS, NOT TEXT. This check first used indexOf("pause >nul") and FAILED -- because the
    // v2909 comment added directly above the moved block contains the words `pause >nul` while explaining the
    // fix, and indexOf found the explanation before the command. The comment describing the fix broke the check
    // verifying the fix. Recorded rather than quietly repaired: a launcher lint that reads REM lines for
    // severity, as this one does, has to be careful everywhere else NOT to.
    const cmdLine = (re) => se.split("\n").findIndex((l) => !/^\s*(REM|::)/i.test(l) && re.test(l));
    const brainAt = cmdLine(/^\s*start\s+"SweK GPU Brain"/i);
    const pauseAt = cmdLine(/^\s*pause\s*>nul/i);
    ok("...and the fix is an ordering change, not a deletion",
        brainAt > 0 && pauseAt > 0 && brainAt < pauseAt,
        "brain starts at line " + (brainAt + 1) + ", pause at line " + (pauseAt + 1) + ". Nothing was removed: " +
        "the Deno check, the stale-brain reaper and the window-title taskkill all still run, in the same order, " +
        "just where they can be reached");
}

// ---- 4. WHAT THIS DOES NOT ESTABLISH --------------------------------------------------------------------------------
{
    ok("this is a text analyser, not a batch interpreter", true,
        "it does not model delayed expansion, parenthesised-block parse-time expansion, or arbitrary goto graphs. " +
        "Three narrow rules with stated false-positive modes. A launcher lint that claimed to understand cmd.exe " +
        "would be more dangerous than none");
    console.log("  NOTE   Start_Everything.bat still lacks the Deno AUTO-INSTALL that START_NODE_Engine.bat gained");
    console.log("         in v2068 -- it only prints 'winget install DenoLand.Deno to enable'. That is a second");
    console.log("         un-back-ported improvement in the same file, found while fixing the first, and it is a");
    console.log("         behaviour change rather than an ordering fix so it is left for a scoped round.");
}

fs.rmSync(tmp, { recursive: true, force: true });
console.log();
if (fails) { console.log("launcherLint-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("launcherLint-selfcheck: all checks pass");
