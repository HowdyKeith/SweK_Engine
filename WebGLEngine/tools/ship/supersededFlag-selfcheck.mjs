// WebGLEngine/tools/ship/supersededFlag-selfcheck.mjs
//
// Run: node tools/ship/supersededFlag-selfcheck.mjs   (~2s -- MEASURED)
// Gated by tools/ship/selfchecks.mjs (auto-discovered).
//
// v3250 -- THE LAUNCHER CLOSED WITHOUT PAUSING BECAUSE OF A FILE IN %TEMP% FROM A PREVIOUS BOOT.
//
// Keith: "all Start Node Engine .bat starts everything and then exits and only gpu brain is left running... when
// i go back versions the same thing happens."
//
// *** THREE FILES READ %TEMP%\swek_superseded.flag AND ONLY TWO ASKED HOW OLD IT WAS. ***
//
//   SweK_Run.bat:47        (Get-Date) - LastWriteTime -lt [TimeSpan]::FromSeconds(90)
//   ai-bridge/server.js    (Date.now() - fs.statSync(p).mtimeMs) < 90000
//   swek_exit_report.bat   if exist "%TEMP%\swek_superseded.flag"        <-- age never asked
//
// And the third is the file that decides whether the launcher window PAUSES. Its superseded branch is THE ONLY
// BRANCH IN THAT FILE THAT DOES NOT PAUSE -- so the least verifiable signal silenced the most useful output.
//
// %TEMP% SURVIVES REBOOTS. A flag left by an update that did not finish its handoff made every launch afterwards
// announce "the new build is already running", exit 0, and close -- taking the reason with it. ON EVERY VERSION,
// because the flag lives in %TEMP% and not in the folder, WHICH IS EXACTLY WHY GOING BACK VERSIONS DID NOT HELP.
// Only the GPU Brain survived because it is the one thing launched detached with `start`; the launcher window
// and the opener went with the .bat.
//
// SweK_Run.bat's own comment states the rule this restores, and it was right the whole time: "calling a crash a
// handoff hides it forever, while calling a handoff a crash only costs a confusing window."

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..");
const PROJ = path.resolve(ROOT, "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };

const rd = (p) => { try { return fs.readFileSync(p, "utf8"); } catch { return ""; } };
const helper = rd(path.join(HERE, "swek_flag_fresh.bat"));
const report = rd(path.join(HERE, "swek_exit_report.bat"));
const runBat = rd(path.join(ROOT, "SweK_Run.bat"));
const server = rd(path.join(ROOT, "ai-bridge", "server.js"));

// ---- 1. EVERY READER ASKS THE AGE, AND THEY AGREE ON THE NUMBER ---------------------------------------------------------
{
    ok("!! *** the exit report asks HOW OLD the flag is, not merely whether it exists ***",
        /call "%~dp0swek_flag_fresh\.bat"/.test(report) && /if "%FRESH%"=="1"/.test(report) &&
        !/^if exist "%TEMP%\\swek_superseded\.flag" \(\s*$/m.test(report),
        "its superseded branch is THE ONLY BRANCH IN THAT FILE THAT DOES NOT PAUSE, and it was chosen by a bare " +
        "`if exist` on a file in %TEMP% that outlives reboots. THE LEAST VERIFIABLE SIGNAL SILENCED THE MOST " +
        "USEFUL OUTPUT");

    const nums = [helper, runBat].map((s) => (s.match(/FromSeconds\((\d+)\)/) || [, ""])[1]);
    // SCOPED TO THE SUPERSEDED READER. My first version matched the FIRST `mtimeMs) < NNN` in server.js, which
    // is _kpopAlive's 45-second sentinel 700 lines earlier -- a completely unrelated check that happens to be
    // spelled the same way. THE GATE REPORTED A DISAGREEMENT THAT DOES NOT EXIST, which is worse than missing
    // one: it sends somebody to reconcile two numbers that were never about the same thing.
    const supersededFn = (server.match(/swek_superseded\.flag[\s\S]{0,300}/) || [""])[0];
    const jsMs = (supersededFn.match(/mtimeMs\) < (\d+)/) || [, ""])[1];
    ok("!! ...and all three readers use the SAME window",
        nums[0] === "90" && nums[1] === "90" && jsMs === "90000",
        "helper " + nums[0] + "s, SweK_Run " + nums[1] + "s, server.js " + jsMs + "ms. TWO OF THEM WERE ALREADY " +
        "RIGHT AND ALREADY AGREED -- the fix belonged in the one that was not asking, not in a new number");

    ok("...and the check is EXTRACTED rather than copied a third time",
        /swek_flag_fresh/.test(report) && /LastWriteTime/.test(helper),
        "batch has no import, so `call` is what this tree already uses for shared launcher logic. A THIRD INLINE " +
        "COPY would have been the defect this whole session is about, in the file that hides its own evidence");
}

// ---- 2. A STALE FLAG COSTS A WINDOW, NOT A DIAGNOSIS --------------------------------------------------------------------
{
    ok("!! *** a stale flag is cleared AND SAID OUT LOUD ***",
        /stale swek_superseded\.flag was present/.test(helper) && /del "%SWEK_FLAG%"/.test(helper),
        "leaving it costs a PowerShell call on every future launch and leaves the exact artefact that caused " +
        "this sitting on disk looking current. THE ONE LINE IS THE ONLY EVIDENCE ANYBODY WILL EVER SEE that it " +
        "was there");

    // ASSERTED STRUCTURALLY, NOT POSITIONALLY. My first version compared indexOf() -- and the header comment
    // mentions LastWriteTime long before the code does, so it failed on prose. THIRD TIME THIS SESSION A
    // POSITION-BASED ASSERTION HAS MISFIRED; what matters is that the default is set on the code path BEFORE
    // the for/f can overwrite it, which is a question about the CODE and not about byte offsets.
    const helperCode = helper.split(/\r?\n/).filter((l) => !/^\s*REM\b/i.test(l)).join("\n");
    ok("!! ...and a PowerShell that will not run leaves FRESH at 0",
        /set "FRESH=0"/.test(helperCode) &&
        helperCode.indexOf('set "FRESH=0"') < helperCode.indexOf("LastWriteTime"),
        "the safe direction: the caller then REPORTS the exit properly instead of assuming a handoff it could " +
        "not confirm. Defaulting to 1 would reproduce the bug whenever PowerShell was unavailable");

    ok("...and the helper does not setlocal, because the caller needs FRESH",
        !/^setlocal/m.test(helper),
        "a helper that scoped its own variable would set FRESH, exit, and hand back nothing -- which is the " +
        "quiet version of never having checked");
}

// ---- 3. THE LINE ENDINGS, WHICH THIS TREE HAS PAID FOR BEFORE -----------------------------------------------------------
{
    const raw = (p) => { try { return fs.readFileSync(p); } catch { return Buffer.alloc(0); } };
    const crlf = (b) => b.length > 0 && b.includes(Buffer.from("\r\n"));
    ok("!! the new helper is CRLF, like the launcher that calls it",
        crlf(raw(path.join(HERE, "swek_flag_fresh.bat"))) && crlf(raw(path.join(HERE, "swek_exit_report.bat"))),
        "I WROTE IT LF AND THE `file` COMMAND CAUGHT IT. This tree's launcher arc has a recorded line-ending " +
        "rule and a batch file with LF endings misbehaves on Windows -- exactly the class of bug that costs an " +
        "evening and looks like something else entirely");
}

// ---- 4. ASK BEFORE KILLING (v3251) -------------------------------------------------------------------------------------
{
    const ask = rd(path.join(HERE, "swek_ask_exit.bat"));
    const launcher = rd(path.join(PROJ, "START_NODE_Engine.bat"));
    const srv = rd(path.join(ROOT, "ai-bridge", "server.js"));

    ok("!! *** the launcher ASKS the running server to exit before reaching for taskkill ***",
        /swek_ask_exit\.bat/.test(launcher) && /if "%ASKED_OK%"=="1" goto :engine_reaped/.test(launcher) &&
        /\/sys\/exit/.test(ask),
        "POST /sys/exit HAS BEEN ROUTED FOR HUNDREDS OF VERSIONS AND THE LAUNCHER NEVER USED IT -- it went " +
        "straight to matching Name=node.exe with a CommandLine containing server.js and terminating whatever " +
        "came back. That match is a GUESS ABOUT IDENTITY and a broad one: any node on the box whose command " +
        "line mentions server.js is in scope");

    ok("!! ...and the route it asks actually exists",
        /"\/sys\/exit"/.test(srv) && /exitNow/.test(srv),
        "an ask aimed at a route nobody serves would fail every time and fall through to the reap FOREVER, " +
        "looking exactly like the old behaviour while claiming to be new");

    // *** v3929 -- THIS NAMED A FILE THAT STOPPED EXISTING AT v3658, AND HAS BEEN RED EVER SINCE. ***
    //
    // It looked for "swek_killengine.ps1" in the launcher. That name is gone from the tree: v3658 replaced the
    // WRITE-TO-TEMP-RUN-DELETE sequence with a real file, ai-bridge/installers/kill-engine.ps1, BECAUSE AVAST
    // QUARANTINED START_NODE_Engine.bat AS IDP.ALEXA.54 FOR THE DROPPER SHAPE -- drop, execute with policy
    // bypass, remove the evidence. That header says the detection "WAS RIGHT ABOUT THE SHAPE AND WRONG ABOUT
    // THE INTENT". So the fallback was not removed; it was made better, and this check went on reporting it
    // missing for hundreds of versions because nothing ever ran this gate (v3924 found nineteen in that state).
    //
    // AND THE CHECK IS STRENGTHENED WHILE THE NAME IS CORRECTED, because a MENTION was all it ever required: a
    // rename could leave the launcher invoking a script that is not there and this line would still pass, as
    // long as the string matched. The file it points at must EXIST. That is the difference between a launcher
    // that says it can kill a hung server and one that can.
    const KILL_SCRIPT = "WebGLEngine/ai-bridge/installers/kill-engine.ps1";
    const killRef = /installers[\\/]kill-engine\.ps1/.test(launcher);
    const killThere = fs.existsSync(path.join(PROJ, KILL_SCRIPT));
    ok("!! ...and the kill is still there for a server that cannot answer", killRef && killThere,
        "launcher invokes it: " + killRef + ", script on disk: " + killThere + ". A HUNG SERVER CANNOT " +
        "ACKNOWLEDGE ANYTHING. Removing the fallback would trade a broad kill for a launcher that cannot start " +
        "at all, which is a worse failure and a harder one to see -- and a launcher CALLING A SCRIPT THAT IS " +
        "NOT THERE is that same failure wearing a passing check");

    ok("!! *** the fallback is ANNOUNCED, so 'it needed killing' stops being routine ***",
        /did NOT exit on request/.test(ask) && /no processes were terminated/.test(ask),
        "this is the only evidence anybody will ever have that the polite path failed. A launcher silent here " +
        "makes an unresponsive server INDISTINGUISHABLE FROM A HEALTHY ONE -- and a box that needs killing every " +
        "launch is telling you something a taskkill nobody sees never could");

    ok("...and an empty port is reported rather than reaped",
        /already free -- nothing to ask/.test(ask),
        "Keith: 'they kill the old process that might not be running after a new reboot'. RUNNING A REAP OVER AN " +
        "EMPTY BOX is where that impression came from, and it costs a PowerShell launch every start");

    ok("...and the wait is bounded and explained",
        /for \/L %%i in \(1,1,6\)/.test(ask),
        "exitNow() waits 250ms then exits, so a healthy server is gone almost at once and the rest of the " +
        "budget is for one mid-write. LONGER WOULD MAKE EVERY LAUNCH FEEL BROKEN; shorter would reap a server " +
        "that was about to comply");
}

// ---- 5. endlocal MUST NOT SIT INSIDE A BLOCK (v3255) --------------------------------------------------------------------
{
    const ask = rd(path.join(HERE, "swek_ask_exit.bat"));
    const launcher = rd(path.join(PROJ, "START_NODE_Engine.bat"));

    // *** A REAL DEFECT THAT SHIPPED AT v3251 AND RAN ON EVERY LAUNCH. *** A parenthesised block is parsed as
    // ONE command, so `endlocal & set "ASKED_OK=1"` inside a for/if block ran mid-block and the value it handed
    // back was unreliable. An EMPTY ASKED_OK then fell through the caller's `if "%ASKED_OK%"=="1"` and ran the
    // taskkill -- REAPING node.exe RIGHT AFTER THE ASK HAD SUCCEEDED. A launcher killing the server it had just
    // started politely.
    const lines = ask.split(/\r?\n/);
    let depth = 0, inBlock = [];
    for (const l of lines) {
        const code = l.replace(/^\s*REM\b.*$/i, "");
        if (/\bendlocal\b/i.test(code) && depth > 0) inBlock.push(l.trim().slice(0, 40));
        depth += (code.match(/\(/g) || []).length - (code.match(/\)/g) || []).length;
        if (depth < 0) depth = 0;
    }
    ok("!! *** no endlocal sits inside a parenthesised block ***",
        inBlock.length === 0,
        "batch parses a block as one command, so an endlocal inside one runs mid-block and the variable it is " +
        "meant to hand back is unreliable" + (inBlock.length ? ". INSIDE A BLOCK: " + inBlock.join(" | ") : "") +
        ". The loop sets a plain flag now and the single endlocal happens once, at the top level, which is the " +
        "only place batch guarantees it does what it reads like");

    ok("!! ...and an UNSET result is not permission to kill",
        /if not defined ASKED_OK/.test(launcher),
        "THE FAILURE DIRECTION MATTERS: skipping a reap costs one stale process that the next launch asks " +
        "again, while a wrong reap kills a working engine. An unset variable is not a yes");
}

// ---- 6. THE PORT HAS AN OWNER, NOT JUST A LISTENER (v3256) --------------------------------------------------------------
{
    const claim = rd(path.join(HERE, "swek_claim_port.bat"));
    const launcher = rd(path.join(PROJ, "START_NODE_Engine.bat"));

    ok("!! *** a second launcher DECLINES instead of fighting for the port ***",
        /PORT_OWNER%"=="other"/.test(launcher) && /ALREADY OWNS PORT/.test(launcher) && /exit \/b 1/.test(launcher),
        "v3251 taught the launcher to ASK the server to exit, and with TWO launchers up that is not enough: the " +
        "ask kills the SOCKET and the other launcher, still supervising, puts one back. A LISTENER IS A SOCKET; " +
        "AN OWNER IS THE LAUNCHER THAT INTENDS TO KEEP ONE THERE -- both windows behave correctly alone and " +
        "fight forever together");

    ok("!! ...and the claim is validated by PID LIVENESS, not by age",
        /tasklist \/FI "PID eq/.test(claim) && !/FromSeconds/.test(claim),
        "THE v3250 LESSON TAKEN ONE STEP FURTHER. A handoff FLAG is an event, so age is right for it. OWNERSHIP " +
        "IS A STATE, and a state's test is whether the thing holding it still exists -- %TEMP% survives reboots, " +
        "so an age check would hand the port to a launcher that died last Tuesday");

    ok("!! ...and a stale claim is cleared OUT LOUD",
        /claim from PID !PID! is stale/.test(claim),
        "a crashed launcher leaves its claim behind, and a SILENT takeover makes 'the previous one died' " +
        "invisible -- exactly how the superseded flag hid a broken install for rounds");

    ok("!! *** and no PID means NO CLAIM, not a refusal to start ***",
        /if defined SWEK_LAUNCHER_PID/.test(claim) && /RESULT=none/.test(claim),
        "A LAUNCHER THAT WILL NOT LAUNCH BECAUSE IT COULD NOT WRITE A TEMP FILE would be a worse bug than the " +
        "one being fixed. Without a PID the helper claims nothing and the launcher behaves exactly as it did " +
        "before this round");

    ok("...and the window title it sets is the one it searches for",
        /set "SWEK_TITLE=/.test(launcher) && /WINDOWTITLE eq %SWEK_TITLE%/.test(launcher),
        "my first version set one title and searched for another (%~n0*, the script name), which would have " +
        "matched nothing -- or matched a DIFFERENT SweK window and claimed the port under somebody else's PID. " +
        "A CLAIM UNDER THE WRONG PID IS WORSE THAN NO CLAIM: it looks valid, it survives the liveness check, and " +
        "it locks out the launcher that actually owns the port");

    // The endlocal rule from v3255 applies to every launcher helper, not just the one that broke.
    const depthBad = (src) => { let d = 0, bad = 0;
        for (const l of src.split(/\r?\n/)) { const c = l.replace(/^\s*REM\b.*$/i, "");
            if (/\bendlocal\b/i.test(c) && d > 0) bad++;
            d += (c.match(/\(/g) || []).length - (c.match(/\)/g) || []).length; if (d < 0) d = 0; }
        return bad; };
    ok("!! ...and the new helper did not repeat v3255's endlocal-in-a-block",
        depthBad(claim) === 0,
        "checked rather than trusted, one round after that exact mistake shipped and reaped a running server");
}

// ---- 7. EVERY READER OF THE FLAG ASKS ITS AGE (v3273) ---------------------------------------------------------------------
{
    const launcher = rd(path.join(PROJ, "START_NODE_Engine.bat"));

    // *** v3250 FIXED THIS IN swek_exit_report.bat AND MISSED THE LAUNCHER. *** START_NODE_Engine.bat set
    // SUPERSEDE from a bare `if exist`, so a leftover flag made EVERY later launch look like a machine's --
    // and server.js then refused to open a tab at all: "A machine asked for this boot, not a person." Keith
    // double-clicked the launcher and got no page. THE SAME MISTAKE IN THE FILE I DID NOT CHECK WHEN I FIXED
    // THE OTHER ONE, with the shared helper sitting there unused.
    ok("!! *** the launcher asks HOW OLD the superseded flag is ***",
        /swek_flag_fresh\.bat/.test(launcher) && /if "%FRESH%"=="1" set "SUPERSEDE=1"/.test(launcher) &&
        !/if exist "%TEMP%\\swek_superseded\.flag" set "SUPERSEDE=1"/.test(launcher),
        "a bare `if exist` on a file in %TEMP% that OUTLIVES REBOOTS, deciding whether a human or a machine " +
        "started this. THE CONSEQUENCE WAS AN ENGINE THAT NEVER OPENED ITS OWN PAGE");

    // THE GENERAL FORM, so a third reader cannot be added the wrong way.
    const readers = [["START_NODE_Engine.bat", launcher],
                     ["swek_exit_report.bat", rd(path.join(HERE, "swek_exit_report.bat"))],
                     ["SweK_Run.bat", runBat]];
    const bare = readers.filter(([, src]) =>
        /if exist "%TEMP%\\swek_superseded\.flag"/.test(src) && !/swek_flag_fresh|LastWriteTime/.test(src));
    ok("!! ...and NO batch reader tests the flag by existence alone",
        bare.length === 0,
        "checked across all three rather than the one that broke" +
        (bare.length ? ". BARE: " + bare.map((r) => r[0]).join(", ") : "") +
        ". THE FIRST FIX WAS RIGHT AND INCOMPLETE, which is the failure mode of fixing what was reported instead " +
        "of what was wrong");
}

console.log();
console.log("\n*** v3850 -- THE FOURTH READER, AND THE ONE WHOSE ANSWER DECIDED WHETHER A LAUNCH LIVED ***");
{
    // Keith, on an update: the installer ran, a new launcher window opened, announced "ANOTHER SweK LAUNCHER
    // ALREADY OWNS PORT 8787", held sixty seconds and exited -- taking the KPop Listener with it -- and the old
    // build was still there afterwards. THE UPDATE NEVER LANDED, every time.
    //
    // sysadminBridge.restart() writes swek_superseded.flag, spawns the launcher, and exits 900 ms LATER. The new
    // launcher claimed the port inside that window, saw the old owner alive, and refused -- A HANDOVER IT HAD
    // BEEN INVITED INTO. It DID compute SUPERSEDE from the same flag, fifty lines further down, where its only
    // job was suppressing a duplicate browser tab. The signal was in the file and the branch that needed it
    // never saw it.
    const boot = rd(path.join(PROJ, "START_NODE_Engine.bat"));
    const iFresh = boot.indexOf("swek_flag_fresh.bat");
    const iGuard = boot.indexOf("ALREADY OWNS PORT");
    const iKpop = boot.indexOf("Starting KPopListener");
    const iHand = boot.indexOf(":port_handover");

    ok("!! the launcher asks the flag's AGE through the shared helper, not `if exist`",
        iFresh > 0 && !/if exist "%TEMP%\\swek_superseded\.flag"/i.test(boot),
        "swek_flag_fresh.bat is the one definition of the ninety seconds -- v3250 and v3273 were both rounds " +
        "spent on a reader that asked whether the flag existed and not how old it was");
    ok("!! ...and it asks BEFORE the port guard, which is the branch that acts on the answer",
        iFresh > 0 && iGuard > 0 && iFresh < iGuard,
        "computed at the guard, not fifty lines below it where it only chose a browser tab");
    ok("!! *** AN INVITED LAUNCH WAITS FOR THE HANDOVER INSTEAD OF REFUSING IT ***",
        iHand > 0 && /if "%SUPERSEDE%"=="1" goto :port_handover/.test(boot),
        "a fresh flag is the running engine saying it is standing down, seconds ago, expiring in ninety");
    ok("...and an UNINVITED launch still refuses, which was always correct",
        /ALREADY OWNS PORT 8787/.test(boot) && /exit \/b 1/.test(boot),
        "two launchers that both start a server take turns forever; the refusal is not the bug");
    ok("...and the handover TIMES OUT rather than waiting for ever",
        /:port_handover_timeout/.test(boot) && /GEQ 45/.test(boot),
        "a flag is a statement of intent, and one that is not honoured inside 45s is refused like any other");
    ok("!! ...and the handover CONSUMES the flag, so it authorises exactly one takeover",
        /del "%TEMP%\\swek_superseded\.flag"/.test(boot),
        "it stays fresh for ninety seconds; leaving it would let a third window take the port from this one on " +
        "the same invitation");

    ok("!! *** THE PORT GUARD RUNS BEFORE ANY SERVICE IS STARTED ***", iGuard > 0 && iKpop > 0 && iGuard < iKpop,
        "the guard sat BELOW the KPop Listener and the GPU Brain, so refusing started two services and then " +
        "exited, and the closing window took the Listener with it. A GUARD THAT COSTS SOMETHING WHEN IT SAYS NO " +
        "IS NOT A GUARD, IT IS A PARTIAL BOOT");

    console.log("  ----  WHAT THIS CANNOT DO: run a .bat. These are checks on its SOURCE -- the order of its");
    console.log("  ----  branches and which helper it calls. That the handover COMPLETES on Keith's box is his");
    console.log("  ----  first update after this build, and it is the only thing that settles it.");
}

console.log("  ----  WHAT THIS DOES NOT FIX: the kill-then-start dance itself. The launcher still identifies old");
console.log("  ----  processes by MATCHING A COMMAND LINE and terminating them, which is a guess about identity.");
console.log("  ----  Keith's suggestion is better and is the next round: ASK the old server to exit, wait for the");
console.log("  ----  port to go quiet, and fall back to killing only with the fallback RECORDED.");
if (fails) { console.log("supersededFlag-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("supersededFlag-selfcheck: all checks pass");
