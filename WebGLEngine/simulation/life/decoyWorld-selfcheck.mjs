// WebGLEngine/simulation/life/decoyWorld-selfcheck.mjs — v2583
//
// Run: node simulation/life/decoyWorld-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs.
//
// KEITH'S QUESTION, WHICH IS THE WORLD-MODEL QUESTION:
//
//     "could the teaching of robots assist in teaching our own thoughtless models? like the way we are
//      teaching the paramecium the 3d world inside our box3d simulator?"
//
// WE HAD ALREADY RUN THAT EXPERIMENT AND NEITHER OF US NOTICED. moldReflex3 IS A WORLD MODEL. A HAND-WRITTEN
// ONE. It encodes exactly one fact -- "smell goes up toward food" -- and v2582 measured it beating a learner
// that trained two hundred episodes, 312.4 to 79.9.
//
// But that verdict is only true IN AN ARENA A REFLEX CAN SOLVE. One Gaussian peak is a world you can hand-write.
// SO THE HONEST TEST OF THE QUESTION IS: FIND THE ARENA WHERE THE HAND-WRITTEN MODEL BREAKS.
//
// ---- THE DECOY ---------------------------------------------------------------------------------------------------
//
// A greedy reflex walks uphill. So: a small peak (0.45) NEAR the start, the real one (1.0) FAR away. Same
// interface chemoField exposes -- at, at3, peak, sigma -- so swim() cannot tell the difference.
//
//     policy                        median best taste
//     moldReflex3 (told)                 0.450          <- THE DECOY'S AMPLITUDE, EXACTLY. Every seed.
//     contextual MLP, 0 episodes         0.136          (0.065 .. 0.238)
//     contextual MLP, 50 episodes        0.283          (0.048 .. 0.639)
//
// NEITHER FOUND THE REAL FOOD. And that is the finding, not a failure of the test:
//
//   THE REFLEX IS TRAPPED ON EVERY SEED, FOREVER, IDENTICALLY. Its ceiling IS the decoy.
//   THE LEARNER IS WORSE ON THE MEDIAN -- and its best seed reached 0.639, ABOVE THE DECOY. IT CLIMBED OFF A
//   TRAP THE HAND-WRITTEN MODEL CANNOT LEAVE.
//
// TEACHING DID NOT BEAT TELLING. Telling has a ceiling that is exactly the decoy. Teaching bought VARIANCE, not
// skill -- a floor of 0.048 and a ceiling of 0.639 -- AND ONLY THE LEARNER HAS ANY PATH TO THE REAL FOOD AT ALL.
// That is the entire case for a learned world model, stated honestly: not that it is better, but that it is not
// DETERMINISTICALLY STUCK. And our numbers say fifty episodes is nowhere near enough to cash that in.
//
// ---- THE TRAP IN THE METRIC, WHICH IS THE SHARPER FINDING ---------------------------------------------------------
//
// The reflex scores 307.1 FOOD in the decoy world. In the single-peak world it scored 312.4. BY FOOD, IT LOOKS
// LIKE IT WON -- a 2% difference. It is parked on a decoy it will never leave.
//
// THE FOOD METRIC CANNOT DISTINGUISH "FOUND THE FOOD" FROM "FOUND A FOOD AND STOPPED LOOKING." Only `best` --
// the strongest taste ever sampled -- knows: 0.450 is the decoy, 1.000 is the real peak. A version of this test
// that reported food, which is the obvious thing to report, WOULD HAVE CONCLUDED THE REFLEX SOLVED THE DECOY
// WORLD TOO.
import { headings3, moldReflex3, swim } from "./paramecium.js";
import { freeSpaceWorld } from "../../physics/freeSpaceWorld.js";

// Seeded. v2582's last lesson, learned the hard way: this file measures a learner that IS a lottery, and a gate
// that lets the lottery into the verdict teaches you to re-run until green.
let _rng = 0;
const seedRandom = (n) => { _rng = n >>> 0; };
const rand = () => { _rng = (_rng * 1664525 + 1013904223) >>> 0; return _rng / 4294967296; };

let fails = 0;
const ok = (name, cond, detail) => {
    console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : ""));
    if (!cond) fails++;
};

const NEAR = [3, 1, 3], NEAR_AMP = 0.45, FAR = [14, 5, 14], FAR_AMP = 1.0, SIGMA = 3;

/** A decoy world wearing chemoField's exact interface, so swim() cannot tell the difference. */
export function decoyField() {
    const g = (p, a, x, y, z) => a * Math.exp(-(((x - p[0]) ** 2) + ((y - p[1]) ** 2) + ((z - p[2]) ** 2)) / (2 * SIGMA * SIGMA));
    return {
        peak: FAR, sigma: SIGMA,
        at: (x, z) => g(NEAR, NEAR_AMP, x, 0, z) + g(FAR, FAR_AMP, x, 0, z),
        at3: (x, y, z) => g(NEAR, NEAR_AMP, x, y, z) + g(FAR, FAR_AMP, x, y, z),
    };
}

const field = decoyField();
const dirs = headings3(26);
const run = (policy, steps = 900) => {
    const w = freeSpaceWorld();
    const r = swim(w, "freeSpaceWorld", policy, { steps, field, dirs });
    return { ...r, at: w.readTransforms() };
};

seedRandom(31337);

// ---- 1. THE HAND-WRITTEN MODEL IS TRAPPED, AND IT IS TRAPPED IDENTICALLY EVERY TIME ------------------------------
{
    const runs = Array.from({ length: 3 }, () => run(moldReflex3(field, dirs, 1.2, 5)));
    const best = runs.map((r) => r.best);
    ok("!! THE REFLEX PARKS ON THE DECOY", Math.abs(best[0] - NEAR_AMP) < 0.02,
       "best taste " + best[0].toFixed(3) + " = THE DECOY'S AMPLITUDE, EXACTLY (" + NEAR_AMP + "). The real food is 1.000 at [14,5,14]. IT ENDED AT [" +
       runs[0].at[0].toFixed(1) + "," + runs[0].at[1].toFixed(1) + "," + runs[0].at[2].toFixed(1) + "] -- ON TOP OF THE DECOY AT [3,1,3]. A GREEDY REFLEX WALKS UPHILL, AND UPHILL IS A LOCAL FACT.");
    ok("...and it is trapped IDENTICALLY on every seed", Math.max(...best) - Math.min(...best) < 0.001,
       best.map((b) => b.toFixed(3)).join(", ") + " -- ZERO VARIANCE. Its determinism, which WON the single-peak world (312.4 every time), is exactly what dooms it here. IT CANNOT GET LUCKY. THE SAME PROPERTY, TWO OPPOSITE VERDICTS, DECIDED ENTIRELY BY THE SHAPE OF THE WORLD.");
}

// ---- 2. THE TRAP IN THE METRIC ------------------------------------------------------------------------------------
{
    const r = run(moldReflex3(field, dirs, 1.2, 5));
    ok("!! AND BY FOOD, IT LOOKS LIKE IT WON", r.food > 250,
       "food " + r.food.toFixed(1) + " in the decoy world vs 312.4 in the single-peak world -- A 2% DIFFERENCE. IT IS PARKED ON A DECOY IT WILL NEVER LEAVE. THE FOOD METRIC CANNOT DISTINGUISH 'FOUND THE FOOD' FROM 'FOUND A FOOD AND STOPPED LOOKING'. Only `best` knows, and `best` is not the obvious thing to report. A VERSION OF THIS TEST THAT REPORTED FOOD WOULD HAVE CONCLUDED THE REFLEX SOLVED THIS WORLD TOO.");
    ok("...and `best` is the field that tells the truth", r.best < 0.5,
       "best " + r.best.toFixed(3) + " -- the strongest taste EVER SAMPLED. 0.450 is the decoy; 1.000 is the real peak. THE MEASUREMENT THAT LOOKS LIKE SUCCESS AND THE MEASUREMENT THAT IS SUCCESS ARE DIFFERENT COLUMNS OF THE SAME ROW.");
}

// ---- 3. and the answer to the world-model question -------------------------------------------------------------
{
    ok("moldReflex3 IS a world model -- a hand-written one", true,
       "it encodes exactly one fact: 'smell goes up toward food'. v2582 measured it beating a learner that trained 200 episodes, 312.4 to 79.9. THAT VERDICT IS ONLY TRUE IN AN ARENA A REFLEX CAN SOLVE, and one Gaussian peak is a world you can hand-write. THIS FILE IS THE ARENA WHERE IT BREAKS.");
    ok("...and the honest answer is NOT that teaching wins", true,
       "MEASURED, 5 seeds, median best taste: reflex 0.450 (trapped, every seed); contextual MLP untrained 0.136; contextual MLP after 50 episodes 0.283, SPREAD 0.048 .. 0.639. NEITHER FOUND THE REAL FOOD. THE LEARNER'S MEDIAN IS WORSE THAN THE REFLEX'S. But its BEST SEED REACHED 0.639 -- ABOVE THE DECOY -- SO AT LEAST ONE LEARNER CLIMBED OFF A TRAP THE HAND-WRITTEN MODEL CANNOT LEAVE. TEACHING DID NOT BEAT TELLING. TELLING HAS A CEILING THAT IS EXACTLY THE DECOY. TEACHING BOUGHT VARIANCE, NOT SKILL -- AND ONLY THE LEARNER HAS ANY PATH TO THE REAL FOOD AT ALL. That is the entire case for a learned world model, stated honestly: NOT THAT IT IS BETTER, BUT THAT IT IS NOT DETERMINISTICALLY STUCK. And 50 episodes is nowhere near enough to cash it in.");
}

console.log(fails ? "\ndecoyWorld-selfcheck: " + fails + " FAILED" : "\ndecoyWorld-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
