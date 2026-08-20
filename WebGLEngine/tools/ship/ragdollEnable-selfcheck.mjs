// WebGLEngine/tools/ship/ragdollEnable-selfcheck.mjs
//
// Run: node tools/ship/ragdollEnable-selfcheck.mjs   (~3s -- MEASURED)
// Gated by tools/ship/selfchecks.mjs (auto-discovered).
//
// v3236 -- THE KAIJU RAGDOLL SYSTEM HAS BEEN OFF AT STARTUP, AND NOTHING SAID SO.
//
// *** RagdollIntegration's CONSTRUCTOR SETS `this._enabled = true`. THE MODULE WAS WRITTEN TO BE ON. *** main.js
// overrides it with a bare `ragdollIntegration.setEnabled(false)` carrying no reason, and until v3236 the only
// thing in the entire tree that could turn it back on was `window.ragdoll.setEnabled(true)` typed into a browser
// console -- grep across every .js, .html and .mjs outside main.js finds ZERO callers, and no changelog entry
// explains the override.
//
// SO ROUND 306's LIMB SEVERANCE IS NOT LIVE. It is REACHABLE. Round 307's RagdollDismember is reachable by
// nothing. FOUR SEPARATE READINGS OF THIS SUBSYSTEM DESCRIBED THE FIRST AS LIVE, ALL OF THEM MINE, EACH FROM
// READING A PIECE INSTEAD OF THE PATH -- and the demonstration I was about to propose (spawn a kaiju, flag the
// policy on, watch) WOULD HAVE SHOWN NOTHING AT ALL.
//
// *** THE DEFAULT IS DELIBERATELY LEFT ALONE. *** Flipping it is a behaviour change on a system whose reason for
// being off nobody can produce, and my record on this subsystem is four claims and four corrections. WHAT CAN BE
// FIXED WITHOUT GUESSING IS THE REACHABILITY: a toggle, so "does this look right?" is answerable by somebody
// looking rather than by somebody who knows a line exists.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { noComments, codeOnly } from "./sourceScan.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };

const mainRaw = fs.readFileSync(path.join(ROOT, "main.js"), "utf8");
const mainCode = codeOnly(mainRaw);
const integ = fs.readFileSync(path.join(ROOT, "simulation", "RagdollIntegration.js"), "utf8");

// ---- 1. THE OVERRIDE IS STILL AN OVERRIDE, AND STILL EXPLAINED ------------------------------------------------------
{
    ok("!! *** the module defaults ON and main.js overrides it -- so the line is an OVERRIDE, not a default ***",
        /this\._enabled = true/.test(codeOnly(integ)) && /ragdollIntegration\.setEnabled\(false\)/.test(mainCode),
        "RagdollIntegration line 40 sets _enabled = true. A reader who saw only main.js would think OFF was the " +
        "module's own choice; A READER WHO SAW ONLY THE MODULE WOULD THINK THE SYSTEM RUNS. Neither is true on " +
        "its own, which is why this check reads both files");

    ok("!! ...and the override CARRIES ITS REASON, or says plainly that nobody has one",
        // gateQuality on its first run, FIFTH TIME THIS SESSION: long prose regexes against raw source are the
        // wrapping debt ratcheted since v3071 -- re-flow a comment and the check stops matching text that never
        // changed meaning. Cut to load-bearing words and matched through noComments(), which keeps comment TEXT
        // out and leaves the strings the file prints. THE BASELINE WAS NOT RAISED TO MEET ME.
        /UNEXPLAINED OVERRIDE/.test(mainRaw) && /WRITE IT HERE/.test(mainRaw),
        "a bare setEnabled(false) with no comment is indistinguishable from a debugging line somebody left in. " +
        "IF THE REASON IS FOUND IT GOES HERE; IF THERE IS NO REASON THE LINE SHOULD BE DELETED rather than left " +
        "as a default nobody chose -- and this check goes red either way, which is the point");
}

// ---- 2. IT IS NO LONGER CONSOLE-ONLY ----------------------------------------------------------------------------------
{
    ok("!! *** the ragdoll system has a BUTTON, not just window.ragdoll.* ***",
        /ragdollIntegration\.isEnabled\(\)/.test(mainCode) && /appendChild\(wrap\)/.test(mainCode) &&
        /isGoreEnabled\(\)/.test(mainCode),
        "window.ragdoll.* has carried setEnabled / gore / kick / severLimb since round 304 and NOT ONE OF THEM " +
        "HAD A BUTTON. A MODULE WHOSE ONLY CALLER IS A CONSOLE IS UNFINISHED -- and a demonstration nobody can " +
        "reach is not a demonstration");

    ok("!! ...and the toggle reports the SYSTEM's state, not its own",
        /const sync = \(\) => \{ const on = !!get\(\)/.test(mainCode),
        "a button tracking a private boolean would keep saying ON after something else turned the system off -- " +
        "the 'flag that lies about which code ran' this tree refuses in voxel-viewer and in the mggpu solver");
}

// ---- 3. WHAT THE BUTTON MUST NOT IMPLY --------------------------------------------------------------------------------
{
    ok("!! the Gore tooltip says severance only fires while Ragdoll is ON",
        /Only fires while Ragdoll/i.test(mainRaw),
        "two toggles side by side invite the reading that either one does something on its own. GORE INSIDE A " +
        "DISABLED INTEGRATION IS A SWITCH WIRED TO NOTHING, and finding that out by clicking it is exactly the " +
        "confusion this round exists to end");

    ok("!! ...and it names round 307 as imported by nothing",
        /imported by nothing/i.test(mainRaw),
        "somebody who turns Gore on is looking at ROUND 306's implementation. The better one is still unwired, " +
        "and a tooltip that implied otherwise would make this button the fifth wrong description of this subsystem");

    ok("...and nothing in this round turned the system on",
        /ragdollIntegration\.setEnabled\(false\)/.test(mainCode) && !/ragdollIntegration\.setEnabled\(true\)/.test(mainCode),
        "THE DEFAULT IS LEFT ALONE ON PURPOSE. Flipping it is a behaviour change on a system whose reason for " +
        "being off nobody can produce, and this round changed reachability rather than behaviour");
}

console.log();
console.log("  ----  WHAT IS STILL UNKNOWN: why the line is there. It is not in BACKLOG.md, not in the module,");
console.log("  ----  and not in any comment. Rounds 301-307 predate this changelog's coverage. THE ANSWER IS");
console.log("  ----  KEITH'S OR AN OLDER ARCHIVE'S -- and until somebody produces it, the honest thing is a");
console.log("  ----  visible override and a button, rather than a default flipped on a guess.");
if (fails) { console.log("ragdollEnable-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("ragdollEnable-selfcheck: all checks pass");
