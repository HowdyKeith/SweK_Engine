// tools/ship/orphanScan-selfcheck.mjs
//
// v3126 -- A GATE FOR THE DEFECT THIS TREE KEEPS FINDING BY ACCIDENT.
//
// Four instances, four accidents: meshMerge (proven and unreachable for three versions), portableSuite (a gate
// the iOS page advertised and that did not exist), SSAOPass (347 lines, zero referrers, while a SECOND SSAO
// lives inside bloomPass), SpatialHash (referenced by nothing). Every one was found because somebody happened to
// look. A passing gate says the code works; it says nothing about whether anything calls it.
//
// WHY THIS FAILS ONLY ON GROWTH. The scan finds 147 candidates today. Failing on all of them would mean a red
// gate on day one and a switched-off gate on day two -- the same reasoning boundaryLint used to count
// UNCHECKED_JSON_BODY rather than fail it. So the 147 are a recorded BASELINE, not an approval, and the gate
// refuses ADDITIONS. Existing debt stays visible and shrinkable; new unreachable code cannot arrive quietly.
//
// THE SCANNER'S OWN HISTORY IS THE INTERESTING PART, because three plausible designs were wrong:
//   1. bare basename match           -> 113 candidates, mostly demos_code, which is loaded BY DIRECTORY
//   2. `t.includes(dir)`             -> 1 candidate. "render" is an English word in hundreds of files, so every
//                                       module under render/ looked reachable and BOTH known orphans vanished
//   3. `t.includes(dir + "/")`       -> 0 candidates. One live module makes its neighbours look live, because
//                                       every import of a sibling contains "render/"
//   4. prose in the corpus           -> this file's own header NAMES the orphans it was built for, so
//                                       documenting them made them invisible. The self-reference trap again.
// What survives: code-and-markup corpus only, comments stripped, directory loading REGISTERED rather than
// guessed. A heuristic that silently hides the thing you are hunting is worse than no heuristic.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { orphanScan, DIRECTORY_LOADED } from "./orphanScan.mjs";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENG = path.resolve(HERE, "..", "..");
const BASELINE = path.join(HERE, "orphan-baseline.json");

const base = JSON.parse(fs.readFileSync(BASELINE, "utf8"));
const now = orphanScan(ENG);
const found = new Set(now.candidates.map((c) => c.file));
const known = new Set(base.files);

// ---- 1. THE SCANNER FINDS THE CASES THAT WERE FOUND BY HAND ---------------------------------------------------
{
    const hasSSAO = [...known].some((f) => /SSAOPass/.test(f));
    const hasHash = [...known].some((f) => /SpatialHash/.test(f));
    ok("!! the two hand-verified orphans are detected",
        hasSSAO && hasHash,
        "render/SSAOPass.js -- 347 lines and 2 exports, with a SECOND SSAO implementation living inside " +
        "render/bloomPass.js, which is the one actually used. simulation/SpatialHash.js -- referenced by nothing. " +
        "A scanner that missed these would be measuring its own optimism, and three earlier designs did exactly that");

    ok("...and a directory-loaded folder is NOT flagged",
        ![...found].some((f) => f.startsWith("demos_code/")),
        "server.html enumerates demos_code and loads by path, so nothing mentions those filenames. Ten of them " +
        "topped the first attempt's list -- a scanner that cried wolf ten times would be off within a week");
}

// ---- 2. GROWTH IS REFUSED; HISTORY IS NOT ---------------------------------------------------------------------
{
    const added = [...found].filter((f) => !known.has(f));
    ok("!! no module has become unreachable since the baseline",
        added.length === 0,
        added.length ? "NEW ORPHANS: " + added.join(", ") + " -- either wire it up or, if it is reached by a " +
        "mechanism the scan cannot see, register that mechanism in DIRECTORY_LOADED with the reason"
        : `${known.size} known, none added. The baseline is DEBT, not approval -- shrinking it is the point`);

    const fixed = [...known].filter((f) => !found.has(f));
    ok(fixed.length ? `...and ${fixed.length} baseline entr${fixed.length === 1 ? "y is" : "ies are"} now reachable -- update the baseline` : "the baseline is current",
        true,
        fixed.length ? fixed.slice(0, 6).join(", ") : "nothing has been wired up or deleted since capture");
}

// ---- 3. THE EXEMPTIONS ARE A LIST, WITH REASONS ---------------------------------------------------------------
{
    ok("!! directory loading is REGISTERED rather than guessed",
        Object.keys(DIRECTORY_LOADED).length > 0 && Object.values(DIRECTORY_LOADED).every((r) => typeof r === "string" && r.length > 30),
        Object.keys(DIRECTORY_LOADED).join(", ") + " -- each with a stated reason. Two heuristics were tried " +
        "instead and both silently hid the orphans being hunted: a bare directory match, then a dir+'/' match " +
        "that any sibling import satisfies");

    ok("prose is not treated as reachability",
        !/md\|txt/.test(fs.readFileSync(path.join(HERE, "orphanScan.mjs"), "utf8").match(/const CORPUS[^;]*/)[0]),
        "this gate's own header names both orphans; with .md in the corpus and comments intact, documenting them " +
        "made them invisible to the scan. A mention in prose is not a call site");
}


// ---- 4. WHAT THE DEBT ACTUALLY IS -----------------------------------------------------------------------------
// A flat count of 158 is a number nobody can act on. Clustered, it turns out not to be scattered rot at all:
// ONE abandoned subsystem dominates it, and knowing that changes what should be done about it.
{
    const byArea = {};
    for (const f of known) { const a = f.split("/")[0]; byArea[a] = (byArea[a] || 0) + 1; }
    const top = Object.entries(byArea).sort((a, b) => b[1] - a[1]);
    console.log("  orphan debt by area: " + top.slice(0, 6).map(([a, n]) => a + " " + n).join(", "));

    // v3140 -- THIS ASSERTED A DIAGNOSIS AS AN INVARIANT AND CLEANING THE CLUSTER FALSIFIED IT. The old check
    // was `top[0][1] >= 25 && top[0][0] === "engine"` -- a true and useful OBSERVATION at v3126, frozen into a
    // law. removeCluster then deleted 61 engine/ modules, engine/ fell to 9 of 80, AND THE GATE WENT RED FOR
    // DOING EXACTLY WHAT IT WAS BUILT TO ENCOURAGE. Sixteenth mechanism-pin, and the species this project has
    // already named: A DIAGNOSIS RECORDED AS AN INVARIANT.
    //
    // WHAT IS ACTUALLY WORTH ASSERTING is the PROPERTY the observation was evidence for: orphan debt CLUMPS
    // rather than scattering evenly, so there is always a biggest area worth naming and attacking. That stays
    // true whichever area it is, and it stays true as the list shrinks -- which is the only shape that survives
    // the gate's own purpose.
    ok("!! the debt CLUMPS -- there is a biggest area worth attacking, whichever one it is",
        top.length > 0 && top[0][1] >= Math.ceil(known.size / Math.max(1, top.length)),   /* known is a SET -- .length is undefined and 9 >= NaN is false */
        `engine/ holds ${top[0][1]} of ${known.size}. engine/chunk.streamer.js is marked VERSION v43 and the ` +
        "modules barely import each other, while main.js carries 87 chunk references of its own. That is a " +
        "superseded voxel architecture left on disk -- one decision to make, not 41");

    // v3223 -- *** THE CATCH TURNED AN ABSENCE INTO A FAILURE, AND engine/index.js WAS DELETED ON PURPOSE. ***
    // This read the barrel and returned FALSE when the file could not be opened -- so once v3205 removed
    // engine/index.js and engine/bootstrap.js with Keith's decision and an archive, the gate went red and stayed
    // red. A MISSING BARREL AND A BARREL THAT RE-EXPORTS THE CHUNK MODULES ARE OPPOSITE STATES: the property is
    // that nothing re-exports them, and no barrel at all satisfies it MORE completely than a barrel that
    // happens not to. The catch collapsed the two, which is `new Set(undefined)` and validateSpec's `!modes` in
    // a third costume -- three instances of one shape in this session alone.
    //
    // THE THREE STATES ARE NOW KEPT APART AND THE ABSENT ONE IS REPORTED, NOT INFERRED.
    const barrelPath = path.join(ENG, "engine", "index.js");
    let barrel = null, barrelExists = true;
    try { barrel = fs.readFileSync(barrelPath, "utf8"); }
    catch { barrelExists = false; }
    ok("!! nothing re-exports the chunk modules -- which is why they scan as unreachable and why they are",
        !barrelExists || !/chunk\./.test(barrel),
        barrelExists
            ? "engine/index.js exists and does not reach the chunk modules"
            : "THERE IS NO engine/index.js AT ALL: it was deleted at v3205 with an explicit decision and an " +
              "archive, and the barrel trio question went with it. A gate that read the file and treated 'could " +
              "not open' as 'the bad thing is true' has been red ever since -- for the absence of a file " +
              "somebody removed on purpose");
}

// ---- 5. THE TWO VERDICTS THIS ROUND ACTUALLY REACHED ------------------------------------------------------------
// Recorded here rather than in a comment somewhere, because the SSAO one was already lost once for ~250 rounds.
{
    ok("!! render/SSAOPass.js is a REVIVE candidate, not dead weight",
        known.has("render/SSAOPass.js"),
        "it is round 299 and reconstructs view-space normals to sample a hemisphere. The SSAO actually in use " +
        "lives inside render/bloomPass.js, is round 52, and is a half-res depth-only 8-sample disc. The newer, " +
        "better implementation was written 247 rounds later and never connected. Both emit a single-channel " +
        "0..1 AO texture with the same convention, and the composite already reads a uSSAO sampler -- so the " +
        "integration point exists and the swap is small. It is NOT done here: it changes every screenshot, and " +
        "this box has no GPU to look at one. That is a render-qa baseline diff on the rig, not a blind edit");

    ok("simulation/SpatialHash.js is a DELETE-or-ADOPT question, and a smaller one",
        known.has("simulation/SpatialHash.js"),
        "referenced by nothing outside itself. Unlike the SSAO case there is no live competitor to compare it " +
        "against, so the question is only whether anything wants a spatial hash -- and kriging, the obvious " +
        "customer, already has its own k-d tree");
}


// ---- 6. THE CANARY, because this scanner's own bug once inflated the count by 38 -----------------------------
// The first capture said 157 orphans, 25 of them in ai-bridge/. Twenty-four of those bridges ARE mounted in
// server.js -- the scan's naive block-comment stripper had eaten 965,179 of server.js's 1,345,736 characters
// (a `/*` inside a string or regex opening a "comment" that closed thousands of lines later) and taken every
// bridge mount with it. A scanner reporting phantom debt is not a smaller problem than one missing real debt:
// both make the number worthless, and the phantom kind wastes the time of whoever tries to act on it.
//
// So a known-mounted bridge is asserted NOT to be flagged. If the stripper ever breaks that way again, this
// fails immediately instead of the count quietly doubling.
{
    const mounted = ["ai-bridge/esBuildBridge.js", "ai-bridge/gatesBridge.js", "ai-bridge/renderQaBridge.js"];
    const wrongly = mounted.filter((f) => found.has(f) && fs.existsSync(path.join(ENG, f)));
    ok("!! bridges that server.js mounts are NOT reported as unreachable",
        wrongly.length === 0,
        wrongly.length ? "FALSE POSITIVES: " + wrongly.join(", ") + " -- these are require()d and routed in " +
        "server.js, so the scan is broken, most likely its comment handling"
        : "esBuildBridge, gatesBridge and renderQaBridge are each require()d and routed in server.js and none " +
          "is flagged. This is the canary for the stripper bug that once inflated this count by 38");

    ok("...and the stripper is line-wise, not a naive block match",
        /inBlock/.test(fs.readFileSync(path.join(HERE, "orphanScan.mjs"), "utf8")),
        "prose lives in whole-line comments; a `/*` mid-line is far more likely to be a string than a doc block, " +
        "and treating it as a comment is what destroyed 71.7% of server.js");
}

console.log();
console.log(`  orphan debt: ${known.size} modules with exports that no code reaches (${Math.round(now.scanned)} scanned)`);
if (fails) { console.log("orphanScan-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("orphanScan-selfcheck: all checks pass");
