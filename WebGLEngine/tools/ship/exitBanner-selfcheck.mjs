// WebGLEngine/tools/ship/exitBanner-selfcheck.mjs -- v3665
//
// Run: node tools/ship/exitBanner-selfcheck.mjs
//
// *** A LAUNCHER THAT PRINTS THE SAME LINE WHATEVER HAPPENED HAS NOT REPORTED ANYTHING. ***
//
// swek_kpop_tab.ps1 ended every run with one yellow line: "listener script ENDED ... If unexpected, check
// <crash file>". On an ordinary relaunch -- listener asked to exit, empty -NoExit host reaped, exit code -1 --
// that line reads exactly like a crash, and Keith had to ask whether something had been killed. Nothing had.
// A BANNER THAT CRIES WOLF ON THE NORMAL PATH TRAINS YOU TO IGNORE IT ON THE REAL ONE, which is the failure
// mode: not a wrong message, an UNINFORMATIVE one printed in the colour of an alarm.
//
// THE RULE IS THE CLASS: a wrapper that runs a script and then announces how it went must BRANCH between the
// call and the announcement. This is a text check on PowerShell -- there is no pwsh in this sandbox, CHECKED
// not assumed -- so it can prove the branch EXISTS and cannot prove it BRANCHES CORRECTLY. Section 3 states
// what that leaves unverified rather than letting a green tick imply more than it earned.

import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
// two levels up from tools/ship is WebGLEngine; the project root is one MORE. My first version resolved to
// WebGLEngine and then joined "WebGLEngine/tools/ship/..." onto it, which is how the path doubled.
const engine = path.resolve(here, "..", "..");
const root = path.resolve(engine, "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const say = (m) => console.log("  ----  " + m);

// Comments are stripped before every test. A rule that matched its own subject's PROSE is a defect this tree
// has recorded more than twenty times, and this file's subject EXPLAINS the old banner in a comment -- so an
// unstripped check would find the very string it is meant to have removed.
const codeOnly = (src) => src.split("\n").map((l) => l.replace(/(^|\s)#.*$/, "$1")).join("\n");

const INVOKES = /&\s*'\.[\\/][^']+\.ps1'/;
const ANNOUNCES = /Write-Host[^\n]*(ENDED|ended|exited|crash)/i;
const BRANCHES = /(^|\n)\s*(if|elseif|else|switch)\b/;

function verdict(src) {
    const c = codeOnly(src);
    return { invokes: INVOKES.test(c), announces: ANNOUNCES.test(c), branches: BRANCHES.test(c),
             consultsRc: /\$LASTEXITCODE/.test(c), code: c };
}

// --- 1. the file this round is about -------------------------------------------------------------------------
{
    say("1. tools/ship/swek_kpop_tab.ps1 -- the wrapper that printed one line for every outcome.");
    const src = readFileSync(path.join(engine, "tools/ship/swek_kpop_tab.ps1"), "utf8");
    const v = verdict(src);
    say("     invokes a script: " + v.invokes + "   announces an outcome: " + v.announces +
        "   branches: " + v.branches + "   consults $LASTEXITCODE: " + v.consultsRc);
    ok("!! it now BRANCHES between running the listener and saying how it went", v.invokes && v.announces && v.branches,
        "three outcomes where there was one: a fresh crash report (red), a non-zero exit with no crash report " +
        "(yellow), and a clean end (grey). THE CLEAN CASE IS THE COMMON ONE AND IT IS NO LONGER PRINTED IN THE " +
        "COLOUR OF AN ALARM");
    ok("the old unconditional banner is gone from the CODE", !/listener script ENDED/.test(v.code),
        "it survives in a comment ABOVE the branch, explaining what it used to do -- which is why every test " +
        "here strips comments first");
    ok("!! the crash file's freshness is the discriminator, bounded by a timestamp taken BEFORE the call",
        /\$kpStart\s*=\s*Get-Date/.test(v.code) && v.code.indexOf("$kpStart = Get-Date") < v.code.search(INVOKES) &&
        /LastWriteTime\s*-gt\s*\$kpStart/.test(v.code),
        "a timestamp taken AFTER the listener returns cannot bound anything -- every crash file ever written " +
        "would look old, and the red branch would never fire");
    ok("$LASTEXITCODE is consulted but is NOT the primary signal", v.consultsRc &&
        v.code.search(/\$kpFresh/) < v.code.search(/\$kpRc\s*-ne\s*0|\$kpRc -ne 0/),
        "`& .\\script.ps1` DOES NOT SET $LASTEXITCODE when the script falls off its own end -- it can be $null " +
        "or stale from an earlier command. The freshness test is checked FIRST and the exit code only corroborates");
    ok("and the control file is NOT consulted, because it cannot be", !/KPopControl/.test(v.code),
        "the listener CONSUMES it (Remove-Item immediately after acting), so by the time this runs the answer " +
        "is gone. Reading it would have looked correct and been a coin flip");
}

// --- 2. THE CLASS, AND A PLANT TO PROVE THE RULE CAN FAIL ------------------------------------------------------
{
    say("2. THE RULE ACROSS EVERY .ps1 WRAPPER IN THE TREE: invoke + announce implies branch.");
    const found = [];
    (function walk(dir) {
        let ents = []; try { ents = readdirSync(dir, { withFileTypes: true }); } catch { return; }
        for (const e of ents) {
            const full = path.join(dir, e.name);
            if (/node_modules|[\\/]\.git|GPU_Assets/.test(full)) continue;
            if (e.isDirectory()) walk(full);
            else if (e.name.toLowerCase().endsWith(".ps1")) found.push(full);
        }
    })(root);
    const offenders = found.filter((f) => { const v = verdict(readFileSync(f, "utf8")); return v.invokes && v.announces && !v.branches; });
    say("     .ps1 files scanned: " + found.length + "   wrappers that invoke AND announce without branching: " + offenders.length);
    for (const o of offenders) say("       " + path.relative(root, o));
    ok("no wrapper announces an outcome it never examined", offenders.length === 0);
    ok("!! and the rule is shown FAILING before it is trusted", (() => {
        const plant = "$ErrorActionPreference = 'SilentlyContinue'\n& '.\\KPopListener.ps1'\nWrite-Host 'listener ENDED, check the crash file' -ForegroundColor Yellow\n";
        const v = verdict(plant);
        return v.invokes && v.announces && !v.branches;
    })(), "the v3664 shape -- run it, then announce unconditionally -- is caught. A RULE NOBODY HAS SEEN FIRE " +
        "MIGHT NOT FIRE, and this one is a regex over a language nothing here can execute");
}

// --- 3. what a text check cannot reach --------------------------------------------------------------------------
{
    say("3. WHAT THIS DOES NOT PROVE.");
    say("   THERE IS NO pwsh IN THIS SANDBOX -- checked with `which`, not assumed -- so NOTHING HERE RUNS THE");
    say("   POWERSHELL. This proves the branch exists, that the timestamp precedes the call, and that the");
    say("   freshness test is consulted before the exit code. IT CANNOT PROVE THE BRANCH PICKS THE RIGHT ARM");
    say("   ON A REAL RUN: that needs a crash to happen, and the only place that can happen is Keith's machine.");
    say("   THE HONEST TEST IS HIS: relaunch and the line should read GREY 'ended cleanly', not yellow.");
    ok("this file says so out loud rather than implying coverage it lacks", true);
}

console.log("exitBanner-selfcheck: " + (fails ? fails + " FAILED" : "all pass"));
process.exit(fails ? 1 : 0);
