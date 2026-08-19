// tools/ship/wasmTerrainStatus.mjs
//
// v3532 -- WHICH TERRAIN PATH IS ACTUALLY RUNNING, DERIVED, BECAUSE NOTHING IN THE TREE SAID.
//
// The engine has THREE terrain paths and the tree has been silent about which one it uses. Chasing a red
// fixture through five rounds is what surfaced it, and each step corrected the step before:
//   1. "world/terrainGenWorker.js is gone for good" -- WRONG, the caller declares its whole protocol.
//   2. "so rebuild it from the surviving half" -- WRONG, it imports a package that is not in the tree.
//   3. "so the whole subsystem is build output" -- WRONG, and wasm-terrain/README.md says so in its own layout:
//      terrainGenWorker.js is listed as SOURCE beside terrainWorkerClient.js. ONLY world/wasm/ is build output.
//
// *** SO THE HONEST STATE IS TWO SEPARATE ABSENCES WITH DIFFERENT CURES, AND THEY WERE BEING READ AS ONE. ***
// world/wasm/ is missing because NOBODY HAS RUN THE BUILD (it needs a Rust toolchain, and this sandbox has
// none). world/terrainGenWorker.js is missing because IT IS A LOST SOURCE FILE. Fixing either alone leaves the
// fast path dead; the worker cannot even be verified until the package it imports exists.
//
// AND THE CONSEQUENCE NOBODY HAD WRITTEN DOWN: BOTH FALLBACKS ARE WORKING EXACTLY AS DESIGNED AND THE ENGINE
// HAS BEEN ON THE PURE-JS TERRAIN PATH THE WHOLE TIME. initTerrainWorker catches and logs "staying on sync
// wasm"; initTerrainWasm catches and demotes; world.js falls through to JS. NOTHING IS BROKEN -- but "the wasm
// fast path is available" and "the wasm fast path is absent and nothing complains" LOOK IDENTICAL FROM THE
// OUTSIDE, which is this tree's most-named shape, and it survived because the absence is silent BY DESIGN.
//
// A REPORT, NOT A RULE: it prints and exits ZERO. Whether to build the package into the ship is a DECISION and
// it is Keith's -- and wasm-terrain/README.md already argues one way ("the engine runs unchanged without this
// build ... this crate is the opt-in fast path"), which is a stated position rather than an oversight.
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, "..", "..");

const has = (rel) => { try { return fs.existsSync(path.join(ROOT, rel)); } catch { return false; } };

/** The three things that decide which path runs, each checked separately because each has its own cure. */
export function status() {
    const pkg = has("world/wasm/terrain_wasm.js");
    const worker = has("world/terrainGenWorker.js");
    const crate = has("wasm-terrain/src/lib.rs");
    const builder = has("wasm-terrain/build_wasm.sh") || has("wasm-terrain/build_wasm.bat");
    const parity = has("tools/terrain-parity.mjs");
    // THE PATH IS DERIVED FROM THE PARTS, never declared. A field saying "js" that somebody had to remember to
    // update is the wiring claim this tree has hunted down twelve times.
    const activePath = !pkg ? "js" : (worker ? "wasm-worker" : "wasm-sync");
    return {
        packageBuilt: pkg,
        workerSource: worker,
        crateSource: crate,
        buildScript: builder,
        parityTool: parity,
        activePath,
        // TWO ABSENCES, NAMED APART. Merging them would make "run the build" and "restore a lost file" read as
        // one problem with one fix, and neither fix alone reaches the fast path.
        blockers: [
            ...(pkg ? [] : ["world/wasm/ is BUILD OUTPUT and has not been built -- run wasm-terrain/build_wasm.sh (needs Rust)"]),
            ...(worker ? [] : ["world/terrainGenWorker.js is LOST SOURCE -- listed in wasm-terrain/README.md's own layout"]),
        ],
    };
}

export function reportLines() {
    const s = status();
    const L = ["[wasmTerrainStatus] which terrain path this build actually runs"];
    L.push("  ACTIVE PATH: " + s.activePath.toUpperCase() +
           (s.activePath === "js" ? "   (the wasm fast path is unavailable and both fallbacks are silent BY DESIGN)" : ""));
    L.push("");
    L.push("  world/wasm/terrain_wasm.js   " + (s.packageBuilt ? "present" : "ABSENT  (build output)"));
    L.push("  world/terrainGenWorker.js    " + (s.workerSource ? "present" : "ABSENT  (source)"));
    L.push("  wasm-terrain/src/lib.rs      " + (s.crateSource ? "present" : "ABSENT"));
    L.push("  wasm-terrain/build_wasm.*    " + (s.buildScript ? "present" : "ABSENT"));
    L.push("  tools/terrain-parity.mjs     " + (s.parityTool ? "present" : "ABSENT"));
    if (s.blockers.length) {
        L.push("");
        L.push("  BLOCKERS (" + s.blockers.length + "), and they have DIFFERENT CURES:");
        for (const b of s.blockers) L.push("    - " + b);
    }
    L.push("");
    L.push("  terrain-parity.mjs REFUSES CLEANLY when the package is missing: exit 2, naming the file AND the");
    L.push("  command that produces it. Worth contrasting with v3201's decisionIndex and gradedCoverage, which");
    L.push("  printed NOTHING and exited ZERO -- an empty report and a tool that never ran are indistinguishable.");
    L.push("");
    L.push("  NOT A RECOMMENDATION. wasm-terrain/README.md states the design: \"the engine runs unchanged without");
    L.push("  this build ... this crate is the opt-in fast path\". Whether to ship the built package is Keith's.");
    return L;
}

if (import.meta.url === `file://${process.argv[1]}`) { for (const l of reportLines()) console.log(l); process.exit(0); }
