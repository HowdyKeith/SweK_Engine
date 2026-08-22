// WebGLEngine/tools/ship/phoneServe-selfcheck.mjs -- v3028
//
// Run: node tools/ship/phoneServe-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs (auto-discovered).
//
// GATES the phone serving its own live view -- and the confound that comes with it.
//
// v3027 gave the Android peer a static page written beside its transcript: the honest fix for a device with no
// HTTP server. This is the other half. Nothing was actually missing -- the phone HAS Node, freshMachine already
// proves server.js boots with NO npm install, and Termux:Boot has survived reboots since v2935. Nobody had
// started it.
//
// THE THING THAT MUST NOT BE SILENT: A TIMING TAKEN ALONGSIDE AN HTTP SERVER IS NOT COMPARABLE TO ONE TAKEN
// WITHOUT. The suite is fifteen to twenty-five minutes of lattice work on a phone. A polling browser, a peer
// probe or a sync sweep landing in the middle produces a different number -- and it will look like the physics
// changed. This tree already refuses to compare across engine versions (v2984) and across architectures whose
// environments do not match (v2998). A CO-RUNNING SERVER IS THE SAME CLASS OF CONFOUND.
//
// So the transcript is STAMPED. Serving is allowed. Serving invisibly is not.
import fs from "node:fs";
import { prose } from "./sourceScan.mjs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENG = path.join(HERE, "..", "..");
const sh = fs.readFileSync(path.join(ENG, "tools", "roundhouse", "termux_serve.sh"), "utf8");
const runner = fs.readFileSync(path.join(ENG, "tools", "roundhouse", "androidRunner.mjs"), "utf8");
let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };

// ---- 1. THE SCRIPT STARTS THE REAL SERVER ------------------------------------------------------------------
{
    ok("it launches ai-bridge/server.js", /node ai-bridge\/server\.js/.test(sh),
       "the engine's own server, not a second one written for phones -- there is no phone-specific behaviour to invent");
    ok("...and refuses cleanly with no Node", /node missing: pkg install nodejs/.test(sh));
    ok("the port is overridable but defaults to the engine's", /PORT="\$\{PORT:-8787\}"/.test(sh));
    ok("!! it prints the LOOPBACK address first", /127\.0\.0\.1:\$\{PORT\}\/server\.html/.test(sh),
       "viewing your own data needs no network permission and no exposure -- that is the default path");
    ok("!! ...and the LAN address is INFORMATION, not advice", /it is not required to view your own data/.test(sh),
       "a phone serving to a whole network is a decision its owner makes deliberately, not a side effect of wanting to see a gauge");
}

// ---- 2. THE MARKER IS HONEST EVEN IF THE SCRIPT IS KILLED ---------------------------------------------------------
{
    ok("!! a marker is written while serving", /\.serving-on-phone/.test(sh));
    ok("!! ...and removed on EXIT, INT and TERM", /trap 'rm -f "\$MARK"' EXIT INT TERM/.test(sh),
       "a phone script is far likelier to be killed than to exit -- a marker that only cleared on a clean exit would stamp every later run as served");
    ok("the script says what the stamp means", /is not comparable to one taken without/.test(sh));
}

// ---- 3. THE TRANSCRIPT CARRIES IT --------------------------------------------------------------------------------------
{
    ok("!! the transcript stamps servedWhileRunning", /servedWhileRunning: servedMarker\(\)/.test(runner));
    ok("!! ...and UNKNOWN is not FALSE", /catch \{ return null; \}/.test(runner) && /unknown is not false/.test(runner),
       "a stamp that guessed absent would be worse than no stamp: it would license a comparison nobody checked");
    ok("the reason is recorded beside the field", /same class of confound/.test(runner),
       "a flag with no reason gets dropped by the next reader who finds it noisy");
}

// ---- 4. THE PHONE'S OWN VIEW SAYS IT FIRST --------------------------------------------------------------------------
//
// The person reading that page is the one most likely to compare it against a run taken without a server.
{
    ok("!! the local view surfaces SERVED WHILE RUNNING", /SERVED WHILE RUNNING/.test(runner));
    ok("...and says the timings are real but not comparable", /timings are real but NOT comparable/.test(runner),
       "not 'invalid' -- the measurement happened, it just cannot be set beside a quiet run");
    ok("...and an undeterminable case says so rather than staying silent", /could not determine whether a server was running/.test(runner),
       "silence would read as 'no server', which is the one reading that is not safe");
}

console.log(fails ? "\nphoneServe-selfcheck: " + fails + " FAILED" : "\nphoneServe-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
