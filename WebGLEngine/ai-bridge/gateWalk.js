// WebGLEngine/ai-bridge/gateWalk.js -- ONE WALK, READ BY EVERY PAGE THAT OFFERS TO RUN A GATE.
//
// v4018 -- Keith: "is this page the same as rig.html? http://192.168.50.57:8787/gates.html"
//
// They were not, and the difference was not the one either page advertised. gates.html (gatesBridge.js, v2806)
// and rig.html (rigRunner.js, v2559) each walked the tree for *-selfcheck.mjs with their OWN copy of the rules,
// and the two copies had drifted apart in both directions:
//
//   * rigRunner capped its recursion at `depth > 2`, so FIVE real gates at depth 3 -- brain/cs/tools,
//     brain/fleet/tools, brain/rl/tools, brain/room/tools, cell-tracking/drift/tools -- were invisible to
//     rig.html. *** THAT IS EXACTLY THE FAILURE rigRunner's OWN COMMENT NAMED AND THEN SUFFERED: "a
//     hand-written list would drift the moment someone adds a selfcheck, and the drift would look like a
//     SHORTER PAGE RATHER THAN AN ERROR." It discovered from disk as promised and still went short, because the
//     depth cap is a hand-written rule wearing a walk's clothes. ***
//   * the other seven differences were NOT drift: gatesBridge deliberately withholds what the ship suite
//     already gates or skips, and reports each one with its reason. Correct on both sides, and the gate below
//     is built to permit exactly that difference and no other.
//
// THE AUTHORITY IS tools/ship/selfchecks.mjs -- the walk the SHIP GATE itself uses to decide a release. This
// file is its CommonJS twin, existing only because the bridges are require()-based and the suite is ESM, which
// is the same boundary that already makes gatesBridge parse the suite's exclusion lists out of its source text
// rather than importing them. It is a twin ON PURPOSE and gateWalk-selfcheck.mjs runs BOTH against the real
// tree and fails if they ever return different sets, so "twin" cannot quietly become "third opinion".
//
// v3527's rule, met for the fourth time this week: ONE DECLARATION, READ RATHER THAN COPIED, "because the
// second copy is never the one that gets updated."
"use strict";

const fs = require("fs");
const path = require("path");

const ENGINE = path.join(__dirname, "..");

// The suite's four skipped directory names, spelled here exactly as it spells them. NOT a `.`-prefix rule:
// rigRunner used `e.name.startsWith(".")` which is broader than the suite and would silently drop a real
// directory somebody named with a leading dot for an unrelated reason.
const SKIP_DIRS = new Set(["node_modules", ".git", "vendor", ".venv"]);

// The suite's pattern, character for character. Note it is `selfcheck.*\.mjs$` and NOT `-selfcheck\.mjs$`:
// the looser form is what finds `tools/ship/selfchecks.mjs` itself, which every caller then excludes by name.
const GATE_RE = /selfcheck.*\.mjs$/;

/**
 * Every gate file on disk, relative to WebGLEngine/, forward-slashed, sorted.
 * NO DEPTH LIMIT -- the suite has none, and the five gates a limit hid are the reason this file exists.
 */
function walk(dir = ENGINE, out = []) {
    let entries;
    try { entries = fs.readdirSync(dir); } catch { return out; }
    for (const f of entries) {
        if (SKIP_DIRS.has(f)) continue;
        const p = path.join(dir, f);
        let st;
        try { st = fs.statSync(p); } catch { continue; }
        if (st.isDirectory()) walk(p, out);
        else if (GATE_RE.test(f)) out.push(path.relative(ENGINE, p).split(path.sep).join("/"));
    }
    return out;
}

/** The suite discovers itself and must not run itself -- the recursion selfchecks.mjs's own v-comment describes. */
const SELF = "tools/ship/selfchecks.mjs";

/** Sorted, self excluded. This is what both bridges start from. */
function allGates() { return walk().sort().filter((f) => f !== SELF); }

module.exports = { walk, allGates, ENGINE, SKIP_DIRS, GATE_RE, SELF };
