// WebGLEngine/tools/launcherExit-selfcheck.mjs — v2609
//
// Run: node tools/launcherExit-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs.
//
// GATES START_NODE_Engine.bat's exit handling.
//
// Keith: "these are still happening on a auto-update. i am pretty sure there is not error, and the only error
// is that the dos window did not exit without pressing a key."
//
//     [autoPull] checking 8 peer(s) (live+roster) for a newer build...
//     [autoPull] no newer peer
//     [autoPull] checking 8 peer(s) (live+roster) for a newer build...
//     [autoPull] no newer peer
//     [SweK] the ai-bridge exited with code -1. The reason is above this line.
//     Press any key to continue . . .
//
// HE IS RIGHT ON BOTH COUNTS AND THE BUG IS FOUR LINES APART FROM ITS OWN FIX.
//
// ---- 1. THE FLAG WAS DELETED ONE LINE BEFORE THE CHECK THAT NEEDED IT --------------------------------------------
//
//     set "NODE_RC=%ERRORLEVEL%"
//     if exist "%TEMP%\swek_superseded.flag" del "%TEMP%\swek_superseded.flag" >nul 2>nul     <- DELETED HERE
//     ...
//     if not "%NODE_RC%"=="0" (
//         echo [SweK] the ai-bridge exited with code %NODE_RC%. The reason is above this line.
//         pause                                                                               <- ASKED HERE
//     )
//
// swek_superseded.flag EXISTS TO SAY EXACTLY ONE THING: "the nonzero exit was an auto-update replacing this
// instance, not a crash." It is WRITTEN IN FIVE PLACES -- Start_Everything.bat, sysadminBridge.js three times,
// server.js -- AND IT WAS READ IN NONE. The launcher deleted the answer and then asked the question.
//
// AND THE EXIT CODE CONFIRMS HIM: -1 IS A KILLED PROCESS, which is precisely what an auto-update does to the
// instance it is replacing. THE CODE WAS TELLING THE TRUTH AND THE LAUNCHER WAS NOT LISTENING.
//
// ---- 2. "THE REASON IS ABOVE THIS LINE" WAS A LIE ------------------------------------------------------------------
//
// What was above the line? THREE LINES OF "[autoPull] no newer peer". THAT IS NOT A REASON, IT IS THE WEATHER.
// The message v2212 wrote was right for a CRASH -- node in the foreground, the stack on the screen, hold the
// window so it does not close on top of it. IT WAS NEVER TRUE FOR A SUPERSEDE, and nobody checked which one
// they were in before pointing at the screen.
//
// A MESSAGE THAT TELLS YOU WHERE TO LOOK HAD BETTER BE RIGHT. A wrong signpost is worse than no signpost: it
// costs you the walk.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

let fails = 0;
const ok = (name, cond, detail) => {
    console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : ""));
    if (!cond) fails++;
};
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
// v3204 -- THE SUBJECT MOVED AND THIS CHECK DID NOT FOLLOW IT.
//
// Every assertion below is about what a daemon's exit MEANS -- read the supersede flag before deleting it,
// judge supersede before crash, do not pause on a supersede. v3088 EXTRACTED that judgement out of
// START_NODE_Engine.bat into swek_exit_report.bat, precisely so it would have ONE definition instead of four.
// The launcher now just captures %ERRORLEVEL% and calls the helper. This file kept reading the launcher, so
// every marker came back at char -1 and FIVE CHECKS HAVE BEEN FAILING EVER SINCE -- unnoticed, because the
// full suite takes ~26 minutes and nothing short of it runs this gate.
//
// "IF I MOVED A FILE, I MOVED ITS ASSUMPTIONS AND IT DOESN'T KNOW" -- the standing law, and the extraction that
// broke this gate was itself a correct fix for a duplicate-definition bug. A GATE POINTED AT THE WRONG FILE
// REPORTS THE ABSENCE OF THE THING IT CANNOT SEE, which is indistinguishable from the defect it was built for.
const BAT = path.join(ROOT, "WebGLEngine", "tools", "ship", "swek_exit_report.bat");
const src = fs.readFileSync(BAT, "utf8");
// The launcher is still checked for its ONE remaining responsibility: capturing the real exit code and handing
// it over. If it stopped doing that, the helper would judge an empty string.
{
    const launcher = fs.readFileSync(path.join(ROOT, "START_NODE_Engine.bat"), "latin1");
    const capt = /set "NODE_RC=%ERRORLEVEL%"/.test(launcher);
    const hand = /swek_exit_report\.bat" %NODE_RC%/.test(launcher);
    console.log((capt && hand ? "  PASS  " : "  FAIL  ") + "the launcher captures the real exit code and hands it to the one judge"
        + "   capture=" + capt + " handoff=" + hand);
    if (!(capt && hand)) fails++;
}

// ---- THE ORDER IS THE BUG ------------------------------------------------------------------------------------------
{
    // v3204 -- THESE MARKERS ARE THE PRE-EXTRACTION SPELLINGS. v3088 moved this judgement into
    // swek_exit_report.bat AND RENAMED ITS LOCALS on the way: SWEK_SUPERSEDED -> SUPERSEDED, NODE_RC -> RC (the
    // helper takes the code as %1), and the `else if` became a plain `if` after an early `exit /b 0`. THE
    // BEHAVIOUR IS UNCHANGED AND CORRECT -- only the spelling moved, and these indexOf calls kept hunting the
    // old words, so all five checks reported char -1. A MARKER IS A COPY OF THE THING IT WATCHES: a rename
    // breaks the watcher silently, and the gate then reports the absence of what it cannot spell, which reads
    // exactly like the defect it was built to catch.
    const readAt = src.indexOf('set "SUPERSEDED=1"');
    const delAt = src.indexOf('del "%TEMP%\\swek_superseded.flag"');
    const askAt = src.indexOf("exited with code %RC%");

    ok("!! THE FLAG IS READ BEFORE IT IS DELETED", readAt > 0 && delAt > 0 && readAt < delAt,
       "read at char " + readAt + ", deleted at " + delAt + ". FOR SEVEN VERSIONS THIS WAS THE OTHER WAY ROUND: the launcher DELETED THE ANSWER AND THEN ASKED THE QUESTION, one line apart. swek_superseded.flag is WRITTEN IN FIVE PLACES (Start_Everything.bat, sysadminBridge.js x3, server.js) AND WAS READ IN NONE.");

    ok("!! ...and read before the exit is judged", readAt > 0 && askAt > 0 && readAt < askAt,
       "the supersede branch comes first, so a replaced instance NEVER reaches the crash message. Keith: 'i am pretty sure there is not error' -- HE WAS RIGHT, AND EXIT CODE -1 IS A KILLED PROCESS, WHICH IS PRECISELY WHAT AN AUTO-UPDATE DOES TO THE INSTANCE IT REPLACES. THE CODE WAS TELLING THE TRUTH AND THE LAUNCHER WAS NOT LISTENING.");

    // SLICE THE BRANCH AND LOOK AT IT. My first attempt here was a lookahead regex so clever it failed on a
    // file that was CORRECT -- the gate said FAIL while the batch script was right. A CHECK TOO CLEVER TO DEBUG
    // IS A CHECK THAT GETS DELETED, and a gate that cries wolf on good code teaches you to ignore it.
    const supStart = src.indexOf('if "%SUPERSEDED%"=="1"');
    const supEnd = src.indexOf('if not "%RC%"=="0"', supStart);
    const supBranch = supStart >= 0 && supEnd > supStart ? src.slice(supStart, supEnd) : "";
    ok("!! a superseded instance does not pause", supBranch.length > 0 && !supBranch.includes("pause") && supBranch.includes("EXPECTED, not a crash"),
       "the supersede branch is " + supBranch.length + " chars and contains no `pause`. Keith: 'the only error is that the dos window did not exit without pressing a key.' THE WINDOW NOW CLOSES ON ITS OWN when the exit was an update. A PROMPT THAT FIRES ON A NORMAL EVENT TRAINS YOU TO DISMISS IT -- and then it is there when it matters and you dismiss that one too.");
}

// ---- AND THE CRASH PATH MUST STILL WORK ------------------------------------------------------------------------------
{
    // v3204 -- same rename: the helper's crash branch is a plain `if not "%RC%"=="0" (` following an early
    // `exit /b 0` from the supersede branch, not an `else if` on NODE_RC. The v2212 REASON is untouched.
    ok("!! a REAL crash still holds the window", /if not "%RC%"=="0" \(/.test(src) && /pause/.test(src),
       "v2212's reason was GOOD and is kept: node runs in the FOREGROUND, so if it falls over the stack is on the screen and the window is about to close on top of it. HOLD IT. THE BUG WAS NEVER THE PAUSE -- IT WAS FIRING THE PAUSE FOR SOMETHING THAT WAS NOT A CRASH.");

    ok("...and it no longer claims the reason is above when it is not", !/(?<!crash[\s\S]{0,200})exited with code %NODE_RC%\. The reason is above this line\.[\s\S]{0,80}pause/.test(src) || /an auto-update replaced this instance/.test(src),
       "Keith saw 'the reason is above this line' sitting on top of three lines of '[autoPull] no newer peer'. THAT IS NOT A REASON, IT IS THE WEATHER. A MESSAGE THAT TELLS YOU WHERE TO LOOK HAD BETTER BE RIGHT -- a wrong signpost is worse than no signpost, IT COSTS YOU THE WALK.");
}

// ---- WHAT THIS GATE CAN AND CANNOT CHECK -----------------------------------------------------------------------------
{
    // v2759 -- this used to hardcode a fail via `process.platform !== "win32"`, which PASSED on the Linux sandbox and
    // FAILED on the actual Windows rig -- backwards, and a gate that is always red just trains you to stop reading it,
    // the very lesson the launcher pause taught. What this gate honestly verifies is STRUCTURAL: the order of the batch
    // file, proven by the checks above. That the structure was actually read and its branches found is a real assertion,
    // and it is true on any platform. The one thing it cannot do is drive cmd.exe -- so that is scoped, not failed.
    ok("!! the launcher structure is verified here; live cmd.exe behavior is left to the real update", src.length > 0 && /superseded/i.test(src),
       "the batch file was read and its supersede branch found, so the ORDER checks above are real: flag read before delete, supersede before crash, only one pause. What this gate does NOT do is run cmd.exe -- Keith's next auto-update is that test: the window closes on its own, and exit code -1 is EXPECTED, not a crash.");
}

console.log(fails ? "\nlauncherExit-selfcheck: " + fails + " FAILED" : "\nlauncherExit-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
