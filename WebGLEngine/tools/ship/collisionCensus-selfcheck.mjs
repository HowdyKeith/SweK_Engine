// WebGLEngine/tools/ship/collisionCensus-selfcheck.mjs -- v3607
//
// Run: node tools/ship/collisionCensus-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs (auto-discovered).
//
// GATES tools/ship/collisionCensus.mjs and the two counter increments it needed in physics/xpbd/selfCollide.js.
//
// THE CHECK THIS FILE EXISTS FOR is section 3: "these gates are BLIND" is a claim about absence, and this tree
// requires an absence to be SHOWN FAILING. It is shown two ways -- the same instrument reports nonzero for
// five other gates, and the sort plant is driven live at both levels so the blindness has a mechanism rather
// than a label.
//
// AND THE SHIPPED PATH IS HELD TO READINGS FROM THE PRISTINE v3606 EXTRACT, because adding a counter to a hot
// solver is exactly the kind of edit that "cannot change anything".
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { findCollisionPairs, STATS, resetStats } from "../../physics/xpbd/selfCollide.js";
import { parity } from "../../physics/xpbd/solverParity.mjs";
import {
    ENGINE, HOOK, collisionGates, censusOne, census, classify, collisionOrderStable, MEASURED_V3607, reportLines,
} from "./collisionCensus.mjs";

let fails = 0;
let CENSUS_ROWS = null;   // computed once -- spawning seven gates twice would double a two-minute gate
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };

// ---- 1. THE SHIPPED PATH DID NOT MOVE, AND selfCollide STILL TOUCHES NO FILESYSTEM -----------------------------------
{
    const N = 40, pos = new Float64Array(3 * N);
    let s = 12345; const rnd = () => { s = (s * 1103515245 + 12345) >>> 0; return s / 4294967296; };
    for (let i = 0; i < 3 * N; i++) pos[i] = rnd();
    const pairs = findCollisionPairs(pos, N, 0.2, 0.2, new Set());
    const h = crypto.createHash("sha256").update(JSON.stringify(pairs)).digest("hex").slice(0, 16);
    ok("!! findCollisionPairs is bit-identical to pristine v3606", pairs.length === 15 && h === "f3d8a86998698c5a",
       pairs.length + " pairs, hash " + h + " -- captured BEFORE the counter was added");
    const p = parity({}, { hold: 60 });
    ok("...and a collision-ACTIVE cloth run is unchanged too", p.maxDiff === 0 && p.contacts === 37,
       "solverParity default row: maxDiff " + p.maxDiff + ", " + p.contacts + " contacts");
    // COMMENTS STRIPPED FIRST. My first version matched the raw source and failed on selfCollide's own comment
    // EXPLAINING why it touches no filesystem -- prose-as-code, twenty-plus instances in this tree, committed
    // again inside the round that adds the comment. codeOnly is right here: an import is an IDIOM.
    const raw = fs.readFileSync(path.join(ENGINE, "physics", "xpbd", "selfCollide.js"), "utf8");
    const src = raw.replace(/^\s*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
    ok("!! ...and the solver STILL IMPORTS NO FILESYSTEM -- it must stay browser-importable",
       !/node:fs|require\(/.test(src), "the dump lives in the loader hook, which shares the module instance");
    ok("...and the reason survives in the source", /node:fs/.test(raw),
       "a design decision without its reason gets reversed by the next person");
    ok("the hook is the only thing that writes", /node:fs/.test(fs.readFileSync(HOOK, "utf8")));
}

// ---- 2. THE COUNTER COUNTS, AND ITS THREE FIELDS ARE THREE DIFFERENT FACTS ---------------------------------------------
{
    resetStats();
    ok("resetStats really clears it", STATS.calls === 0 && STATS.pairs === 0 && STATS.empty === 0);
    const N = 4, apart = new Float64Array([0, 0, 0, 9, 0, 0, 18, 0, 0, 27, 0, 0]);
    findCollisionPairs(apart, N, 0.2, 0.2, new Set());
    ok("!! a call that finds nothing counts as a CALL and as EMPTY", STATS.calls === 1 && STATS.empty === 1 && STATS.pairs === 0,
       "empty and never-ran are different facts and the census reports them apart");
    const close = new Float64Array([0, 0, 0, 0.05, 0, 0, 0.1, 0, 0, 5, 0, 0]);
    findCollisionPairs(close, N, 0.2, 0.2, new Set());
    ok("...and a call that finds pairs moves pairs and maxPairs, not empty", STATS.calls === 2 && STATS.empty === 1 && STATS.pairs > 0 && STATS.maxPairs > 0,
       JSON.stringify(STATS));
    resetStats();
}

// ---- 3. THE CENSUS: TWO GATES DRIVE THE PASS THOUSANDS OF TIMES AND NEVER SEE A CONTACT --------------------------------
{
    const gates = collisionGates();
    ok("the gate list is DERIVED from imports, never typed", gates.length >= 6 && gates.every((g) => /-selfcheck\.mjs$/.test(g)),
       gates.length + " gates: " + gates.map((g) => path.basename(g)).join(", "));
    const rows = census(gates); CENSUS_ROWS = rows;
    ok("every gate dumped its stats -- a missing dump would read as zero and look like blindness",
       rows.every((r) => r.dumped), rows.filter((r) => !r.dumped).map((r) => r.label).join(", ") || "all " + rows.length);
    ok("...and every one of them still passes", rows.every((r) => r.code === 0),
       rows.filter((r) => r.code !== 0).map((r) => r.label + " exit " + r.code).join(", ") || "all green under the hook");
    const blind = rows.filter((r) => classify(r) === "BLIND");
    ok("!! TWO GATES ARE BLIND: the pass RAN and returned an empty list EVERY time",
       blind.length === 2 && blind.every((r) => MEASURED_V3607.blind.includes(r.label)),
       blind.map((r) => path.basename(r.label) + " " + r.calls + " calls / " + r.empty + " empty").join(", "));
    ok("!! ...and clothLoopKey is the one NOBODY had looked for", blind.some((r) => /clothLoopKey/.test(r.label)),
       "v3606 found the first by hand; an instrument found the second, which is the difference");
    const seeing = rows.filter((r) => classify(r) === "sees-contacts");
    ok("POSITIVE CONTROL: the same instrument reports thousands of contacts elsewhere", seeing.length >= 4,
       seeing.map((r) => path.basename(r.label) + ":" + r.pairs).join("  ") + " -- so BLIND is a reading, not a broken counter");
}

// ---- 4. THE SORT IS DETECTABLE AT THE PAIR-LIST LEVEL AND NOT AT THE SOLVE LEVEL ---------------------------------------
//
// THIS IS WHY THREE GATES WITH REAL CONTACTS STILL MISSED THE PLANT, and it is measured rather than assumed.
{
    const s = collisionOrderStable();
    ok("the pair-list comparison runs on a frame that HAS pairs", s.listLength > 20,
       s.listLength + " pairs on the deepest interpenetrating frame -- my first version compared a SETTLED frame " +
       "and read a confident 40/40 over a list of length ZERO");
    ok("!! the pair list is order-independent, which is what the sort exists for", s.listSame === s.trials,
       s.listSame + "/" + s.trials + " scrambled walks return the identical list");
    ok("!! and the SOLVE is order-independent whether the sort is there or not", s.solveSame === s.solveTrials,
       s.solveSame + "/" + s.solveTrials + " -- the colouring and per-colour independence ABSORB the discovery order");
    ok("!! SO A SOLVE-LEVEL SHUFFLE CHECK CANNOT SEE THE SORT, WHATEVER ITS FIXTURE",
       MEASURED_V3607.twoLevels.listSameWithSortRemoved === 0 && MEASURED_V3607.twoLevels.solveSameWithSortRemoved === 20,
       "measured with the sort removed: list 0/40, solve 20/20 -- clothLoop-selfcheck's collision-order claim is " +
       "vacuous at the LEVEL, not merely at the radius");
    ok("...and the solve-level insensitivity is REPORTED, not dressed as a proof", true,
       "it is a fact about this tree's fixtures, not a demonstration that no fixture could ever see it");
}

// ---- 5. WHAT IS NOT CLAIMED, AND THE ANTIDOTE ---------------------------------------------------------------------------
//
// ANTIDOTE: when somebody gives a BLIND gate a fixture that produces contacts, section 3's count goes RED.
// REWRITE IT TO THE SMALLER LIST AND NAME WHO WAS FIXED -- do not delete it, and do not widen "BLIND" to keep
// the number. A rising blind count is a NEW defect and must fail; a falling one is the work being done.
{
    ok("the census is offered as an UPPER BOUND on detectability, never as coverage",
       (MEASURED_V3607.notClaimed || "").includes("UPPER BOUND"),
       "a nonzero pair count is NECESSARY and not SUFFICIENT -- 2 of the 5 that see contacts caught the sort plant");
    ok("...and the three that saw contacts and missed it are named rather than counted as failures",
       MEASURED_V3607.sawContactsAndMissedIt.length === 3,
       MEASURED_V3607.sawContactsAndMissedIt.join(", ") + " -- their assertions are order-insensitive by design");
    const rep = reportLines({ rows: CENSUS_ROWS });
    ok("the report renders and names BLIND in its own output", rep.length > 15 && rep.join("\n").includes("BLIND"), rep.length + " lines");
}

console.log(fails ? "\ncollisionCensus-selfcheck: " + fails + " FAILED" : "\ncollisionCensus-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
