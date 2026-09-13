// WebGLEngine/tools/ship/versionMarker.js -- v4556
//
// *** ONE DEFINITION OF HOW TO READ A VERSION MARKER OUT OF A SOURCE FILE, BECAUSE THERE WERE FORTY-FOUR AND
// FORTY-FOUR OF THEM READ A COMMENTED-OUT LINE. ***
//
// main.js carries `const ENGINE_VERSION = "v4535"`, and the ship ritual PREPENDS a changelog block above that
// constant every round -- a block that opens with a commented copy of the previous constant:
//
//     // const ENGINE_VERSION = "v4487";   // v4487 -- *** THIS TREE FREEZES NUMBERS INTO ...
//     // const ENGINE_VERSION = "v4476";   // v4476 -- ...
//     const ENGINE_VERSION = "v4535";      <- the live one, BELOW its own history
//
// An unanchored match takes the FIRST hit, which is the oldest comment. brain/brain.js has the identical
// shape for BRAIN_BUILD, with commented copies both above AND below the live line.
//
// *** MEASURED ACROSS THE TREE BEFORE THIS MODULE EXISTED: 87 regex readers of these markers, of which 44
// RETURNED THE COMMENT -- v4487, eight rounds stale -- across 35 FILES. *** Several are user-facing
// (tools/ship/status.mjs, tools/ledger/ledger.mjs, tools/okf/emitOKF.mjs, ai-bridge/fingerprintBridge.js), so
// reports, ledger entries, OKF bundles and fingerprints have been stamped with a version the tree left behind.
//
// AND IT HAD ALREADY COST SOMETHING. A parallel line fixed ai-bridge/githubBridge.js to skip comment lines, and
// the correct reading immediately turned tools/ship/shipRitual-selfcheck.mjs and
// ai-bridge/engineUpdateSource-selfcheck.mjs RED -- both reporting "githubBridge reads v4535 but main.js says
// v4487", blaming the one reader that was right. Three were fixed at v4550; this module is the other 35.
//
// ---- WHY .cjs -------------------------------------------------------------------------------------------
//
// The readers split 26 ESM to 9 CommonJS, the CommonJS ones all in ai-bridge/, whose own directory already
// uses .cjs for shared helpers. A CommonJS module can be `require`d by those nine AND default-imported by the
// twenty-six, so ONE file serves both:
//
//     const VM = require("../tools/ship/versionMarker.js");         // CommonJS
//     import VM from "../tools/ship/versionMarker.js";              // ESM -- DEFAULT import, not named
//
// Node does not offer named exports from CommonJS, so the default is the whole object. An .mjs here would have
// forced the nine into dynamic import() inside synchronous functions, and a second .cjs copy beside it would
// be exactly the second declaration tools/ship/markerSingleSource-selfcheck.mjs exists to forbid.
"use strict";
const fs = require("node:fs");
const path = require("node:path");

/**
 * *** THE ONE PATTERN. *** `^(?!\s*\/\/)` refuses a line whose first non-space characters are a comment
 * opener, which is what every commented changelog copy looks like; `m` makes `^` mean line-start rather than
 * string-start, which is what makes the refusal apply per line at all. Both halves are load-bearing and the
 * gate drives each of them separately.
 */
function markerRe(name) {
    return new RegExp("^(?!\\s*//).*" + name + "\\s*=\\s*\"(v\\d+)\"", "m");
}

/** The marker's value out of a source string, or "" when the file does not declare one. */
function parseMarker(src, name) {
    const m = String(src || "").match(markerRe(name));
    return m ? m[1] : "";
}

function readFileOr(file) {
    try { return fs.readFileSync(file, "utf8"); } catch { return ""; }
}

/** ENGINE_VERSION out of a tree's main.js. `root` is the WebGLEngine directory. */
function engineVersion(root) {
    return parseMarker(readFileOr(path.join(root, "main.js")), "ENGINE_VERSION");
}

/** BRAIN_BUILD out of a tree's brain/brain.js. Same shape, same trap: it has commented copies BOTH SIDES. */
function brainBuild(root) {
    return parseMarker(readFileOr(path.join(root, "brain", "brain.js")), "BRAIN_BUILD");
}

/**
 * *** THE CENSUS THAT MADE THIS A ROUND, taken by running every regex literal in the tree that mentions a
 * marker against the real main.js and comparing what came back. *** Re-derivable: the gate re-takes it.
 */
const CENSUS_AT_V4556 = Object.freeze({
    at: "v4556",
    liveWas: "v4535",
    readersFound: 87,          // regex literals mentioning ENGINE_VERSION anywhere in the tree
    correct: 8,                // returned the live constant
    wrong: 44,                 // returned the commented changelog line
    noMatch: 35,               // matched nothing in main.js (they read other files, or other markers)
    wrongFiles: 35,
    wrongAnswers: Object.freeze(["v4487", "4487"]),
    // *** THE FIRST PASS OF THIS CENSUS OVER-COUNTED, AND THE CORRECTION IS THE INTERESTING PART. ***
    // Comparing what a reader returned against the literal string "v4535" called `ENGINE_VERSION = "v(\d+)"`
    // WRONG, because it captures 4535 without the v -- a different capture convention, not a defect. Raw
    // comparison said 45 wrong; normalising the leading v says 44. A census that compares spellings instead
    // of meanings is the same over-count this tree has now found in several of its own.
    firstPassSaid: 45,
    firstPassError: "compared captured strings raw, so a `v(\\d+)` capture read as a wrong answer",
    modules: Object.freeze({ esm: 26, cjs: 9 }),
});

module.exports = { markerRe, parseMarker, engineVersion, brainBuild, CENSUS_AT_V4556 };
