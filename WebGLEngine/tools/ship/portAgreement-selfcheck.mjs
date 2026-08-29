// WebGLEngine/tools/ship/portAgreement-selfcheck.mjs -- v4134
//
// THE ANSWER KEY FOR "EVERYTHING AGREES ABOUT WHICH PORT THE ENGINE IS ON."
//
// ai-bridge/server.js has honoured PORT since v1238: `parseInt(process.env.PORT, 10) || 8787`. Two things
// never learned that, and both failures reached Keith as something that looked like a different bug:
//
//   1. START_NODE_Engine.bat wrote 8787 LITERALLY at a dozen places and never read PORT. With PORT set in the
//      environment -- which is exactly what a side-by-side launch does -- the server bound the inherited port
//      while every guard in the launcher fought over 8787. The worst was `swek_ask_exit.bat 8787`, which POSTs
//      /sys/exit: it asked THE RUNNING PRODUCTION SERVER to shut down on behalf of a launch that was never
//      going to use 8787. He met the far end of that as "Failed to fetch", plus a browser opened on a port
//      with nothing behind it.
//
//   2. brain/brain.js read the port beacon ONCE, into a const, at startup. "GPU Brain says offline but the GPU
//      brain is started and running" -- it was running, and it was right. It had resolved 8787 at boot, the
//      engine came up on 63698, and the brain dialled a dead address for the rest of its life. The beacon file
//      is REWRITTEN by the server every time it binds, so the fact was on disk the whole time and nothing
//      looked again.
//
// WHAT THIS GATE CANNOT DO, SAID PLAINLY RATHER THAN IMPLIED: it cannot RUN either fix. The launchers are
// Windows batch and the brain is Deno; this box has neither. So every check here is over source, and the
// behaviour wants a run on the rig. That limit is printed at the end of the run, not buried in this header.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENG = path.resolve(HERE, "..", "..");
const ROOT = path.resolve(ENG, "..");
const read = (p) => fs.readFileSync(p, "utf8");

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };

const BAT = path.join(ROOT, "START_NODE_Engine.bat");
const FREE = path.join(ENG, "tools", "ship", "swek_free_port.bat");
const bat = read(BAT), free = read(FREE);
const server = read(path.join(ENG, "ai-bridge", "server.js"));
const brain = read(path.join(ENG, "brain", "brain.js"));

console.log("1. THE LAUNCHER WATCHES THE PORT THE SERVER WILL ACTUALLY BIND");
{
    // The server's own rule, read from the server rather than restated here -- a second copy of "|| 8787" in
    // this gate would be the same defect the gate exists to catch, one layer up.
    const rule = /parseInt\(process\.env\.PORT,\s*10\)\s*\|\|\s*(\d+)/.exec(server);
    ok("!! server.js's port rule is readable, so this gate does not keep its own copy of the default",
        !!rule, rule ? "PORT || " + rule[1] : "");
    const fallback = rule ? rule[1] : "8787";

    ok("!! the launcher DERIVES a port instead of writing one",
        /set "SWEK_PORT=\d+"/.test(bat) && /if defined PORT set "SWEK_PORT=%PORT%"/.test(bat),
        "PORT if set, otherwise the default -- the same rule server.js applies to the same environment");
    ok("!! ...and its default is the SERVER'S default, not a number of its own",
        new RegExp('set "SWEK_PORT=' + fallback + '"').test(bat),
        "if these two ever disagree the guard protects a port nobody binds");

    // Strip REM lines: this file is mostly commentary, and the history legitimately says "8787".
    const code = bat.split("\n").filter((l) => !/^\s*REM\b/i.test(l)).join("\n");
    const stray = [...code.matchAll(/8787/g)].length;
    ok("!! NO functional 8787 survives outside that one default assignment",
        stray === 1, stray + " occurrence(s) in non-comment lines (1 = the default itself)");

    ok("!! every port-taking helper is TOLD which port",
        /swek_claim_port\.bat" %SWEK_PORT%/.test(bat) &&
        /swek_ask_exit\.bat" %SWEK_PORT%/.test(bat) &&
        /swek_free_port\.bat" %SWEK_PORT%/.test(bat),
        "claim, ask-to-exit and free -- the ask is the dangerous one: it shuts down whatever answers");
    ok("...and the browser is opened on it too",
        /127\.0\.0\.1:%SWEK_PORT%\/health/.test(bat) && /localhost:%SWEK_PORT%\/net\/info/.test(bat)
          && /\$u='http:\/\/localhost:%SWEK_PORT%\/'/.test(bat),
        "a guard that gets this right and an opener that does not still lands the user on a dead page");
    ok("the derivation is NOT inside a parenthesised block",
        !/\(\s*set "SWEK_PORT=/.test(bat),
        "cmd expands %vars% in a block at PARSE time -- this file's own law, stated two screens above it");
}

console.log("\n2. THE SHARED HELPER CAN BE TOLD, AND STILL WORKS WHEN IT IS NOT");
{
    ok("!! swek_free_port.bat takes a port argument",
        /set "PORT=%~1"/.test(free), "its two siblings have taken one all along; this was the odd one out");
    ok("!! ...and an ABSENT argument still means the default, because four other launchers pass none",
        /if "%PORT%"=="" set "PORT=8787"/.test(free),
        "START_BUN.bat, START_BUN_Full.bat, START_NODE_Full.bat and run_node_full.bat call it bare");
    ok("!! the netstat match is the PRECISE form, not a substring",
        !/findstr :\d+ \^\| findstr LISTENING/.test(free) && /findstr \/C:":%PORT% "/.test(free),
        "`findstr :8787` also matches :87870 and :18787 -- and a port from the ephemeral range makes that " +
        "collision far likelier than 8787 ever did");
    const holders = [...free.matchAll(/findstr \/C:":%PORT% "/g)].length;
    ok("...on BOTH passes, the kill and the verify", holders === 2, holders + " of 2");
}

console.log("\n3. LINE ENDINGS -- A BATCH FILE WITH MIXED ONES IS A BATCH FILE THAT MISBEHAVES");
{
    // NOT a theoretical rule. Writing this round's fix inserted LF-only lines into a CRLF file, and it was
    // caught by looking rather than by anything failing -- cmd can mis-parse labels and gotos across a stray
    // bare LF, which is a fault that appears only on Windows and only sometimes.
    for (const [name, p] of [["START_NODE_Engine.bat", BAT], ["swek_free_port.bat", FREE]]) {
        const raw = fs.readFileSync(p);
        const lf = (raw.toString("latin1").match(/\n/g) || []).length;
        const crlf = (raw.toString("latin1").match(/\r\n/g) || []).length;
        ok("!! " + name + " is uniformly CRLF", lf === crlf, crlf + " CRLF of " + lf + " line endings");
    }
}

console.log("\n4. THE BRAIN CAN NOTICE THE ENGINE MOVED");
{
    ok("!! BRIDGE is re-assignable",
        /^let BRIDGE = /m.test(brain) && !/^const BRIDGE = /m.test(brain),
        "a const read once at startup is the whole bug; ~30 sites read this and now pick up a change for free");
    ok("!! there is a re-resolver",
        /function _rebridge\(\)/.test(brain));
    // Anchored on the failure path's own statement rather than a character window: the first draft of this
    // check allowed 600 chars between `catch (e) {` and the call and failed on the catch's own comment block,
    // which measures the wrong thing anyway -- what matters is that the re-read sits with the error counter.
    ok("!! ...called ON THE FAILING POLL, not on a timer",
        /stats\.errors\+\+;\s*(?:\/\/[^\n]*\n\s*)*if \(_rebridge\(\)\) return;/.test(brain),
        "it sits immediately after stats.errors++ in the snapshot catch -- a working connection is evidence " +
        "the address is right, and re-reading then asks a question already answered");
    ok("...and it is NOT wired to an interval or the tick loop",
        !/setInterval\([^)]*_rebridge/.test(brain) && !/await _rebridge/.test(brain),
        "polling the filesystem every tick to learn something a successful fetch already proved");
    ok("!! BRAIN_BRIDGE STILL ALWAYS WINS",
        /if \(_envBridge\) return false;/.test(brain),
        "a person who typed an address meant it -- wandering off it would make the one explicit control a hint");
    ok("!! a move is ANNOUNCED, not silent",
        /the bridge MOVED: /.test(brain),
        "the symptom was in server.html and the cause was in a variable nobody printed");
    ok("...and a new address earns a fresh first-failure report",
        /_fetchWarned = false;/.test(brain),
        "_fetchWarned is a one-shot; leaving it set would silence the first failure against the NEW address too");
    ok("the re-resolver reads the SAME beacon the startup path reads",
        /const next = _beaconBridge\(\);/.test(brain),
        "not a second parser for the same file -- the shape this tree names everywhere");
    ok("...and it does nothing when the address is unchanged",
        /=== BRIDGE\) return false;/.test(brain),
        "otherwise every failed poll would log a 'move' to the address it is already on");
}

console.log("\n  ----  NOT RUN HERE, AND THAT IS THE HONEST STATE OF IT: neither fix is EXECUTED by this gate.");
console.log("  ----  The launchers are Windows batch and the brain is Deno; this box has neither, so every");
console.log("  ----  check above reads source. What wants doing on the rig: start the engine with PORT set to");
console.log("  ----  something other than 8787 and confirm (a) no guard touches 8787, (b) the browser opens on");
console.log("  ----  the right port, and (c) a brain started BEFORE that engine finds it after one failed poll");
console.log("  ----  and logs 'the bridge MOVED'.");

console.log(fails ? `\nportAgreement-selfcheck: ${fails} FAILED` : "\nportAgreement-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
