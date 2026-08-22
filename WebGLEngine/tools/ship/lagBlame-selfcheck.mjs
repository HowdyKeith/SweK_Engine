// WebGLEngine/tools/ship/lagBlame-selfcheck.mjs -- v3411
//
// *** A PROFILER THAT CANNOT NAME A BLOCKER IT WAS TOLD TO LOOK FOR CANNOT NAME ONE NOBODY KNOWS ABOUT. ***
//
// The `[lag]` line has reported a DURATION and not a FUNCTION for six versions, and I spent three rounds
// guessing at the cause: a request flood (wrong), slow static serves (wrong -- four files reporting the SAME
// seventy seconds are four requests queued behind one blocking call), and the folder delete (A blocker,
// measurably, but NOT THE blocker: detached at v3406 and the stalls continued at 47s, 99s and 145s).
//
// THREE GUESSES IS THE SIGNAL THAT THE INSTRUMENT IS MISSING. So this gate does to the instrument what the lab
// does to a device: it plants a KNOWN answer and demands the instrument recover it. A named function burns the
// CPU for a known duration, and the profiler must come back with THAT NAME and roughly THAT TIME.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { codeHas, noComments } from "./sourceScan.mjs";
const ENG = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const require_ = createRequire(import.meta.url);
const { startLagBlame, rankSelfTime } = require_(path.join(ENG, "ai-bridge", "lagBlame.js"));
let failed = 0;
const say = (m) => console.log("  ----  " + m);
const ok = (l, c, n) => { console.log("  " + (c ? "PASS" : "FAIL") + "  " + l + (n ? "   " + n : "")); if (!c) failed++; };

// A blocker with a name nothing else in the tree shares, so a match cannot be a coincidence.
function theBlockerNobodyNamed(ms) { let x = 0; const t = Date.now(); while (Date.now() - t < ms) x += Math.sqrt(x + 1); return x; }

// ---- 1. THE PLANT: IT MUST NAME THE FUNCTION AND GET THE TIME ROUGHLY RIGHT ------------------------------
{
    const h = startLagBlame({ enabled: true, log: () => {} });
    ok("!! the profiler starts without a flag, a restart or a dependency",
        !!h, "node's own inspector session -- if this were absent the stall would still be TIMED, just not NAMED");
    await h.ready;
    const BLOCK_MS = 700;
    theBlockerNobodyNamed(BLOCK_MS);
    const top = await h.blame(6);
    say("top frames: " + top.map((f) => f.name + " " + f.selfMs + "ms").join(", "));
    const found = top.find((f) => f.name === "theBlockerNobodyNamed");
    ok("!! *** it NAMES the function that held the loop ***",
        !!found && top[0].name === "theBlockerNobodyNamed",
        found ? found.name + " at " + found.where : "NOT NAMED -- and an instrument that cannot find a blocker " +
        "it was TOLD to look for is no use against one nobody knows about");
    ok("...and the self time is the blocking time, not the whole run",
        !!found && found.selfMs > BLOCK_MS * 0.6 && found.selfMs < BLOCK_MS * 1.4,
        found ? found.selfMs + "ms against a planted " + BLOCK_MS + "ms" : "no frame",
    );
    ok("...and it reports a FILE AND LINE, because a bare name is not somewhere to go",
        !!found && /:\d+$/.test(found.where), found ? found.where : "-");
}

// ---- 2. SELF TIME, NOT TOTAL -- THE DISTINCTION THE WHOLE THING TURNS ON ---------------------------------
{
    // A synthetic profile: an outer frame that merely CALLS the blocker, and the blocker itself. Total time
    // would blame the caller, which is true and useless -- it is the ancestor of everything.
    const profile = {
        nodes: [
            { id: 1, callFrame: { functionName: "bootEverything", url: "file:///x/boot.js", lineNumber: 9 } },
            { id: 2, callFrame: { functionName: "theRealCulprit", url: "file:///x/slow.js", lineNumber: 41 } },
            { id: 3, callFrame: { functionName: "(idle)", url: "", lineNumber: 0 } },
        ],
        samples: [1, 2, 2, 2, 2, 3, 3],
        timeDeltas: [1000, 9000, 9000, 9000, 9000, 50000, 50000],
    };
    const ranked = rankSelfTime(profile, 5);
    ok("!! *** the frame ON the CPU is blamed, not the one that called it ***",
        ranked[0].name === "theRealCulprit" && ranked[0].selfMs === 36,
        JSON.stringify(ranked.map((r) => r.name + ":" + r.selfMs)) + ". TOTAL TIME BLAMES THE ANCESTOR OF " +
        "EVERYTHING; self time is the only reading that points somewhere");
    // *** FIFTH CONSECUTIVE ROUND I REACHED FOR codeHas ON A STRING LITERAL, WHICH codeOnly BLANKS -- and I
    // wrote that lesson down at the end of the last round. THE REAL CORRECTION IS NOT noComments, IT IS TO STOP
    // MATCHING SOURCE FOR A BEHAVIOUR I CAN DRIVE. *** Feed the ranker both buckets and watch what survives:
    // that is evidence rather than a claim about how the evidence is spelled.
    const buckets = rankSelfTime({
        nodes: [
            { id: 1, callFrame: { functionName: "(idle)", url: "", lineNumber: 0 } },
            { id: 2, callFrame: { functionName: "(garbage collector)", url: "", lineNumber: 0 } },
            { id: 3, callFrame: { functionName: "(program)", url: "", lineNumber: 0 } },
        ],
        samples: [1, 2, 3],
        timeDeltas: [90000, 40000, 20000],
    }, 5);
    ok("!! (idle) and (program) are dropped while (garbage collector) is KEPT",
        buckets.length === 1 && buckets[0].name === "(garbage collector)",
        JSON.stringify(buckets.map((b) => b.name)) + " -- idle is the OPPOSITE of the thing being hunted, and " +
        "(program) is V8's unattributable bucket. A STALL THAT IS REALLY GC IS A FINDING, not noise, so that " +
        "one stays: it would send somebody to the heap rather than to a function, which is still somewhere");
}

// ---- 3. IT IS OFF UNLESS ASKED FOR, AND ONE SHOT WHEN IT IS ----------------------------------------------
{
    const off = startLagBlame({ log: () => {} });   // no env, no explicit enable
    ok("!! the profiler is OFF by default and returns null rather than throwing",
        off === null,
        "a sampling profiler costs a few percent, which is a poor trade on a box already struggling. AND NULL " +
        "IS A STATE THE CALLER HANDLES: a server that refused to boot without its diagnostic would be worse " +
        "than one that stalls");
    const srv = fs.readFileSync(path.join(ENG, "ai-bridge", "server.js"), "utf8");
    ok("...and server.js guards every use of it",
        codeHas(srv, /_blame && _blame\.running && !_blamed/),
        "three separate conditions, because OFF, ALREADY-STOPPED and ALREADY-REPORTED are three different states");
    ok("!! it fires ONCE, on the first stall big enough to matter",
        codeHas(srv, /lag > 5000/) && codeHas(srv, /_blamed = true;/),
        "reading the profile STOPS it, so this cannot sample for the life of the process -- and a diagnostic " +
        "firing on every 600ms hiccup would BURY THE ANSWER IN ITS OWN OUTPUT");
    ok("...and the lag line says the naming is armed, so a reader knows to wait for it",
        /the next stall over 5s gets NAMED/.test(noComments(srv)),
        "otherwise the profiler being on is invisible until it fires, and silence would read as 'it found nothing'");
}

// ---- 4. THE FRONT DOOR: ARM + RESTART AS ONE ACTION, AND ONE SHOT ---------------------------------------
{
    const { armFlagFile, FLAG_FILE } = require_(path.join(ENG, "ai-bridge", "lagBlame.js"));
    // *** AN ENV VAR CANNOT SURVIVE THIS RESTART AND THAT IS WHY THE FLAG IS A FILE. *** restart() relaunches
    // THE LAUNCHER -- `cmd /c start` on Windows, `open` on macOS -- and `open` hands the app to launchd, which
    // does not carry an arbitrary environment across. A button setting an env var would work on one platform
    // and SILENTLY DO NOTHING on the other, which is worse than no button: a quiet boot would read as "the
    // profiler found nothing".
    armFlagFile();
    ok("!! arming leaves a flag the next boot can find",
        fs.existsSync(FLAG_FILE), FLAG_FILE);
    const first = startLagBlame({ log: () => {} });
    ok("!! *** the armed boot starts profiling AND CONSUMES THE FLAG ***",
        !!first && !fs.existsSync(FLAG_FILE),
        "ONE SHOT: profiling can never quietly persist across reboots, which an env var set in a launcher would " +
        "do until somebody remembered to unset it");
    if (first) await first.stop();
    const second = startLagBlame({ log: () => {} });
    ok("...so the boot after it does NOT profile",
        second === null, "the flag is gone, so this is off again");
    armFlagFile();
    const off = startLagBlame({ enabled: false, log: () => {} });
    ok("...and an explicit enabled:false still consumes it, leaving nothing armed",
        off === null && !fs.existsSync(FLAG_FILE),
        "an armed flag left behind would fire on some LATER boot nobody asked to profile");
    const srv = fs.readFileSync(path.join(ENG, "ai-bridge", "server.js"), "utf8");
    ok("!! the route ARMS and then DELEGATES to the existing restart",
        codeHas(srv, /armFlagFile\(\)/) && codeHas(srv, /sysadminBridge\.restart\(\)/),
        "the two halves are useless apart -- a flag nobody reboots into never fires, and a reboot without the " +
        "flag is the boot Keith has already had eight times. AND IT DELEGATES rather than growing a SECOND way " +
        "to restart the server");
    ok("...and a FAILED restart still reports the flag as armed",
        /the next boot profiles once/.test(noComments(srv)) && codeHas(srv, /armed: true/),
        "the next boot BY ANY ROUTE will profile, so somebody who then starts the server by hand still gets " +
        "what they asked for");
    const html = fs.readFileSync(path.join(ENG, "server.html"), "utf8");
    ok("!! the button exists in System Tools and CONFIRMS before restarting",
        /id="bLagBlame"/.test(noComments(html)) && /confirm\(/.test(html.slice(html.indexOf("bLagBlame"))),
        "it restarts the server out from under whoever pressed it");
}

// ---- 5. TWO ARMING MODES, BECAUSE THERE ARE TWO FAILURES --------------------------------------------------
{
    const srv = fs.readFileSync(path.join(ENG, "ai-bridge", "server.js"), "utf8");
    const html = noComments(fs.readFileSync(path.join(ENG, "server.html"), "utf8"));
    // *** KEITH'S CORRECTION: "if we are waiting for POST /sys/lagblame, we do not need to reboot." He is right
    // -- the inspector attaches to THE LIVE PROCESS -- and I had built the restart around a constraint that was
    // never real. BUT THE RESTART PATH IS NOT REDUNDANT: every stall in the Windows log is in the FIRST TWO
    // HUNDRED SECONDS, and a profiler started by a button cannot see a stall that happened before anybody could
    // press it. The Mac's symptom is the opposite. TWO MODES BECAUSE THERE ARE TWO FAILURES.
    // SIXTH TIME. `mode === "now"` and the note text are STRING LITERALS, which codeOnly blanks. The v3411
    // correction said to drive rather than match -- and here the thing being asserted IS a string in a route
    // dispatch I cannot cheaply boot, so noComments is the right instrument and reaching for codeHas was the
    // reflex, not a judgement. THE RULE IS: codeOnly when the subject is an IDIOM, noComments when THE SUBJECT
    // IS THE TEXT.
    const srvText = noComments(srv);
    ok("!! *** arming the RUNNING process needs no restart ***",
        codeHas(srv, /function _armBlameNow/) && /mode === "now"/.test(srvText) && !/restart\(\)[\s\S]{0,80}mode === "now"/.test(srvText),
        "the inspector attaches to this process; the restart was built around a constraint that was never real");
    ok("...and the BOOT mode still exists, because a startup stall cannot be caught by a button",
        /mode=boot/.test(srvText) && codeHas(srv, /armFlagFile\(\)/),
        "every stall in the Windows log is inside the first 200 seconds. NEITHER MODE IS A FALLBACK FOR THE OTHER");
    ok("...and only the restarting one confirms",
        /bLagBoot[\s\S]{0,900}confirm\(/.test(html) && !/bLagBlame"\)[\s\S]{0,400}confirm\(/.test(html),
        "a confirm on the harmless button trains people to click through the one that is not");
    ok("!! *** the last report is KEPT, not only printed ***",
        codeHas(srv, /_lastBlame = \{ at: _at, lagMs: _lag, frames/) && codeHas(srv, /report: _lastBlame/),
        "Keith asked for a place the last report is generated. A line in a scrolling console is a report you " +
        "have to be WATCHING for; this one can be handed over an hour later");
    ok("...and ARMED-AND-QUIET is reported as itself, not as an empty result",
        /nothing over 5s has stalled yet/.test(srvText) && /no stall over 5s yet/.test(html),
        "a blank panel would read as 'nothing found' when it means 'nothing has stalled yet', AND THOSE SEND " +
        "YOU TO DIFFERENT PLACES -- the same distinction this tree draws between UNKNOWN and ABSENT");
}

console.log(failed ? "\n[lagBlame-selfcheck] FAILED " + failed : "\n[lagBlame-selfcheck] all checks pass");
process.exit(failed ? 1 : 0);
