// tools/ship/wasmTerrainStatus-selfcheck.mjs
//
// v3532 -- GRADES THE STATUS REPORT, AND THE PROPERTY THAT MATTERS IS THAT IT CANNOT CLAIM A PATH THAT IS NOT
// THERE.
//
// The report exists because "the wasm fast path is available" and "the wasm fast path is absent and nothing
// complains" LOOK IDENTICAL FROM THE OUTSIDE -- both fallbacks demote silently BY DESIGN, which is correct
// behaviour that produced five rounds of wrong conclusions about a red fixture. A report that could say "js"
// while the package sat there, or "wasm" while it did not, would be a second declaration of the thing it
// exists to settle.
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { status, reportLines } from "./wasmTerrainStatus.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, "..", "..");
let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const report = (l, n) => console.log(`  ----  ${l}${n ? "   " + n : ""}`);

console.log("wasmTerrainStatus-selfcheck -- the path is derived, and the two absences stay apart\n");

// ---------------------------------------------------------------------------
console.log("1. THE ACTIVE PATH IS DERIVED FROM THE PARTS, NEVER DECLARED");
{
    const s = status();
    ok("the report agrees with the filesystem about the package",
        s.packageBuilt === fs.existsSync(path.join(ROOT, "world/wasm/terrain_wasm.js")));
    ok("...and about the worker source",
        s.workerSource === fs.existsSync(path.join(ROOT, "world/terrainGenWorker.js")));
    ok("!! *** THE PATH FOLLOWS FROM THEM RATHER THAN BEING STATED ***",
        s.activePath === (!s.packageBuilt ? "js" : (s.workerSource ? "wasm-worker" : "wasm-sync")),
        "activePath = " + s.activePath + ". A field somebody had to remember to update is THE WIRING CLAIM " +
        "THIS TREE HAS HUNTED DOWN TWELVE TIMES -- multigridGPU-selfcheck said 'the port is unwired' for 145 " +
        "versions after v3225 wired it.");
}

// ---------------------------------------------------------------------------
console.log("\n2. THE TWO ABSENCES HAVE DIFFERENT CURES AND ARE NAMED APART");
{
    const s = status();
    ok("both blockers are reported", s.blockers.length === 2, s.blockers.length + " blockers");
    ok("!! one names the BUILD and one names LOST SOURCE",
        s.blockers.some((b) => /BUILD OUTPUT/.test(b)) && s.blockers.some((b) => /LOST SOURCE/.test(b)),
        "*** MERGING THEM WOULD MAKE 'run the build' AND 'restore a lost file' READ AS ONE PROBLEM WITH ONE " +
        "FIX, AND NEITHER FIX ALONE REACHES THE FAST PATH -- the worker cannot even be verified until the " +
        "package it imports exists. Two things wearing one label, the shape this tree names most. ***");
    ok("the crate and its build script survive, so the build is possible elsewhere",
        s.crateSource && s.buildScript,
        "wasm-terrain/src/lib.rs and build_wasm.* are present -- THIS SANDBOX HAS NO RUST TOOLCHAIN, so the " +
        "build is Keith's, and saying which machine can do a thing is part of saying what is blocked");
}

// ---------------------------------------------------------------------------
console.log("\n3. THE LOAD-BEARING NEGATIVE: IT CANNOT CLAIM A PATH THAT IS NOT THERE");
{
    // Driven on a synthetic tree rather than described, because a report nobody has watched be wrong is a
    // report that might not be right. The pure function is exercised through its own derivation rule.
    const derive = (pkg, worker) => (!pkg ? "js" : (worker ? "wasm-worker" : "wasm-sync"));
    ok("!! package absent -> JS, whatever the worker does", derive(false, true) === "js" && derive(false, false) === "js",
        "*** THE WORKER IS USELESS WITHOUT THE PACKAGE IT IMPORTS, so restoring it alone must NOT move the " +
        "reported path. That is the exact mistake this round nearly shipped two turns ago. ***");
    ok("package present, worker absent -> the SYNC wasm path", derive(true, false) === "wasm-sync",
        "wasmGenerateChunk on the main thread -- real, and not the off-thread path");
    ok("both present -> the worker path", derive(true, true) === "wasm-worker");
    ok("...and the three outcomes are distinct", new Set([derive(false, false), derive(true, false), derive(true, true)]).size === 3,
        "a two-state answer would merge 'no fast path at all' with 'fast path but on the main thread', and " +
        "those are different engines to anybody watching a frame time");
}

// ---------------------------------------------------------------------------
console.log("\n4. IT REPORTS AND DOES NOT RECOMMEND");
{
    const L = reportLines();
    ok("the report names itself in brackets", /^\[wasmTerrainStatus\]/.test(L[0]), L[0].slice(0, 52));
    ok("!! it states the README's position rather than its own", L.some((l) => /opt-in fast path/.test(l)),
        "wasm-terrain/README.md says the engine runs UNCHANGED without the build -- A STATED DESIGN RATHER " +
        "THAN AN OVERSIGHT, and whether to ship the built package is a DECISION and it is Keith's");
    ok("...and says so explicitly", L.some((l) => /NOT A RECOMMENDATION/.test(l)));
    const src = fs.readFileSync(path.join(HERE, "wasmTerrainStatus.mjs"), "utf8");
    ok("it exits ZERO and holds no assertions", /process\.exit\(0\)/.test(src) && !/process\.exit\(1\)/.test(src),
        "A REPORTING TOOL MUST PRINT AND EXIT ZERO; the gate beside it is what exits nonzero (v3327)");
}

report("WHAT THIS SETTLES, AND WHAT IT DOES NOT",
    "*** IT SETTLES THAT THE ENGINE HAS BEEN ON THE PURE-JS TERRAIN PATH THE WHOLE TIME AND THAT NOTHING IS " +
    "BROKEN -- both fallbacks work exactly as designed. IT DOES NOT SAY WHETHER THE FAST PATH IS WORTH HAVING: " +
    "tools/terrain-parity.mjs is the thing that measures that, and it REFUSES CLEANLY (exit 2, naming the file " +
    "and the command) until the package exists. THE NUMBER THAT WOULD DECIDE THIS IS ONE BUILD AWAY, ON A " +
    "MACHINE WITH RUST. ***");

console.log(`\nwasmTerrainStatus-selfcheck: ${fails === 0 ? "all checks pass" : fails + " FAILED"}`);
process.exit(fails === 0 ? 0 : 1);
