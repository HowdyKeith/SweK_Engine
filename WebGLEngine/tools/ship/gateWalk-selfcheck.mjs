// tools/ship/gateWalk-selfcheck.mjs
//
// Run: node tools/ship/gateWalk-selfcheck.mjs
// RUNTIME 232ms MEASURED (median of 3 -- 234/232/229 ms, with date(1) around the run). It walks the real tree
// four times over -- the shared CommonJS twin, a live re-derivation of the ESM suite's own rules, and both
// bridges' offered lists -- which is cheaper than it sounds because a tree walk is all stat calls.
//
// v4018 -- Keith: "is this page the same as rig.html? http://192.168.50.57:8787/gates.html"
//
// *** THE TWO PAGES THAT BOTH OFFER TO RUN EVERY GATE DISAGREED ABOUT WHAT "EVERY" MEANS, AND ONLY ONE OF THEM
// WAS WRONG IN A WAY ANYBODY COULD SEE. *** gates.html (gatesBridge) and rig.html (rigRunner) each carried
// their own copy of the discovery rules. rigRunner capped recursion at `depth > 2`, so five real gates at depth
// three were missing from the page you click to run everything -- and a page that offers 1158 instead of 1163
// looks like a page, not like an error. rigRunner's own comment had already named this exact failure ("the
// drift would look like a SHORTER PAGE RATHER THAN AN ERROR") while its depth cap was busy causing it.
//
// THE OTHER SEVEN DIFFERENCES WERE NEVER DRIFT and this gate is built to keep permitting them: gatesBridge
// withholds what the ship suite already gates or skips, and reports each with a reason. So the property here is
// NOT "the two lists are identical" -- that would be a false law that forbids a correct behaviour. It is:
//
//     THE UNDERLYING WALK IS THE SAME, AND EVERY DIFFERENCE IN WHAT IS OFFERED IS A DECLARED EXCLUSION.
//
// which stays true when somebody adds an exclusion tomorrow, and goes red the moment a walk diverges again.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
// *** BOTH STRIPPERS, AND THE CHOICE IS LOAD-BEARING IN BOTH DIRECTIONS. ***
//   noComments() removes comments and KEEPS string contents -- needed to see require("./gateWalk.js") at all,
//     because codeOnly() blanks string bodies and turns that very line into require("").
//   codeOnly() removes comments AND string contents -- needed for the depth-cap check, because the comment
//     rigRunner.js now carries EXPLAINS the old `depth > 2` rule by quoting it, and a raw-text search would
//     read that explanation as the defect still being present.
// Picking one for both would fail one check or falsely pass the other. Same trap patchBase-selfcheck hit.
import { codeOnly, noComments } from "./sourceScan.mjs";

const require_ = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };

console.log("gateWalk-selfcheck -- do gates.html and rig.html mean the same thing by 'every gate'?\n");

const gateWalk = require_("../../ai-bridge/gateWalk.js");
const rigRunner = require_("../../ai-bridge/rigRunner.js");
const gatesBridge = require_("../../ai-bridge/gatesBridge.js");

// ---------------------------------------------------------------------------
console.log("1. *** THE WALK HAS ONE HOME, AND NEITHER BRIDGE KEPT A COPY ***");
{
    const rigRaw = fs.readFileSync(path.join(ROOT, "ai-bridge", "rigRunner.js"), "utf8");
    const gbRaw = fs.readFileSync(path.join(ROOT, "ai-bridge", "gatesBridge.js"), "utf8");
    // the require is a STRING, so it needs the stripper that keeps strings
    const rigStr = noComments(rigRaw), gbStr = noComments(gbRaw);
    // the old rules are CODE SHAPES, and both files now describe them in prose -- so they need the stripper
    // that drops strings and comments alike, or the explanation reads as the defect.
    const rigSrc = codeOnly(rigRaw), gbSrc = codeOnly(gbRaw);

    ok("!! rigRunner requires the shared walk", /require\(["']\.\/gateWalk\.js["']\)/.test(rigStr));
    ok("!! gatesBridge requires the shared walk", /require\(["']\.\/gateWalk\.js["']\)/.test(gbStr));

    // *** THE DEPTH CAP IS THE SPECIFIC THING THAT BROKE, so it is named rather than left to a general rule. ***
    ok("!! *** rigRunner has NO depth cap of its own any more ***", !/depth\s*>\s*\d/.test(rigSrc),
        "`if (depth > 2) return` hid five gates at depth three from the page that exists to run all of them");
    ok("...and neither bridge still calls readdirSync for gate discovery",
        !/readdirSync/.test(rigSrc) && !/readdirSync/.test(gbSrc),
        "a second walk is a second answer, and the second copy is never the one that gets updated (v3527)");
}

// ---------------------------------------------------------------------------
console.log("\n2. *** THE COMMONJS TWIN AGREES WITH THE ESM SUITE IT MIRRORS -- RUN, NOT ASSUMED ***");
{
    // gateWalk.js exists only because the bridges are require()-based and selfchecks.mjs is ESM. A twin that
    // is never compared to its original is just a third opinion with a nicer comment, so this imports the REAL
    // suite and re-derives its walk against the same tree.
    const suiteSrc = fs.readFileSync(path.join(ROOT, "tools", "ship", "selfchecks.mjs"), "utf8");
    const skipDirs = [...suiteSrc.matchAll(/f === "([^"]+)"/g)].map((m) => m[1]);
    ok("!! the suite's skipped directory names are exactly the twin's",
        [...gateWalk.SKIP_DIRS].sort().join(",") === skipDirs.sort().join(","),
        "twin: " + [...gateWalk.SKIP_DIRS].sort().join(",") + "  |  suite: " + skipDirs.sort().join(","));

    const suitePattern = (suiteSrc.match(/else if \((\/[^/]+\/)\.test\(f\)\)/) || [])[1];
    ok("!! ...and the suite's filename pattern is the twin's, character for character",
        suitePattern === String(gateWalk.GATE_RE),
        "twin: " + gateWalk.GATE_RE + "  |  suite: " + suitePattern);

    // AND THE SETS THEMSELVES, against the real tree rather than against the rules that produce them.
    const twin = gateWalk.walk().sort();
    const suiteWalk = (dir, out = []) => {
        for (const f of fs.readdirSync(dir)) {
            if (["node_modules", ".git", "vendor", ".venv"].includes(f)) continue;
            const p = path.join(dir, f);
            let st; try { st = fs.statSync(p); } catch { continue; }
            if (st.isDirectory()) suiteWalk(p, out);
            else if (/selfcheck.*\.mjs$/.test(f)) out.push(path.relative(ROOT, p).split(path.sep).join("/"));
        }
        return out;
    };
    const real = suiteWalk(ROOT).sort();
    ok("!! *** THE TWIN RETURNS THE SAME SET AS THE SUITE'S OWN RULES, ON THIS TREE ***",
        twin.length === real.length && twin.every((f, i) => f === real[i]),
        twin.length + " files both ways -- a twin nobody compares is a third opinion");
}

// ---------------------------------------------------------------------------
console.log("\n3. *** THE TWO PAGES AGREE, AND EVERY DIFFERENCE IS A DECLARED EXCLUSION ***");
{
    const rig = new Set(rigRunner.discover().map((x) => x.rel));
    const listed = gatesBridge.listGates();
    const offered = new Set(listed.runnable);
    const declared = new Set([...listed.alreadyGated, ...listed.skipped.map((s) => s.file)]);

    ok("!! the suite's exclusion lists were PARSED, not silently empty", listed.parsedExclusions,
        "an unparsed exclusion list makes this whole section pass by accident");

    const onlyGates = [...offered].filter((f) => !rig.has(f));
    ok("!! *** NOTHING gates.html OFFERS IS MISSING FROM rig.html ***", onlyGates.length === 0,
        onlyGates.length ? "MISSING FROM rig.html: " + onlyGates.join(", ") : "both pages reach every gate");

    const onlyRig = [...rig].filter((f) => !offered.has(f));
    ok("!! ...and everything rig.html offers that gates.html withholds is DECLARED, with a reason",
        onlyRig.every((f) => declared.has(f)),
        onlyRig.length + " withheld: " + onlyRig.map((f) => f.split("/").pop()).join(", ") +
        " -- gates.html reports these under alreadyGated/skipped rather than pretending they do not exist");

    // THE NUMBERS HAVE TO ADD UP, which is the version of this a person can check by eye on the two pages.
    ok("!! *** rig.html's count IS gates.html's runnable PLUS its declared exclusions ***",
        rig.size === offered.size + onlyRig.length,
        rig.size + " = " + offered.size + " + " + onlyRig.length);
}

// ---------------------------------------------------------------------------
console.log("\n4. *** THE FIVE GATES THE DEPTH CAP HID ARE REACHABLE FROM BOTH PAGES ***");
{
    // Named individually rather than counted: a count passes again the moment five different files go missing.
    const DEPTH_THREE = [
        "brain/cs/tools/cs-selfcheck.mjs",
        "brain/fleet/tools/fleet-selfcheck.mjs",
        "brain/rl/tools/rocket-selfcheck.mjs",
        "brain/room/tools/room-selfcheck.mjs",
        "cell-tracking/drift/tools/drift-selfcheck.mjs",
    ];
    const rig = new Set(rigRunner.discover().map((x) => x.rel));
    for (const f of DEPTH_THREE) {
        const onDisk = fs.existsSync(path.join(ROOT, f));
        ok("   " + f, onDisk && rig.has(f),
            !onDisk ? "*** NO LONGER ON DISK -- if this gate moved, update the list; do not just delete the check ***"
                    : (rig.has(f) ? "" : "*** rig.html cannot see it again ***"));
    }
    ok("!! ...and each really is deeper than the old cap allowed",
        DEPTH_THREE.every((f) => f.split("/").length - 1 > 2),
        "if these ever move shallower this check stops proving anything, so it says so rather than passing quietly");
}

console.log("\n" + (fails ? fails + " FAILED" : "ALL PASS"));
process.exit(fails ? 1 : 0);
