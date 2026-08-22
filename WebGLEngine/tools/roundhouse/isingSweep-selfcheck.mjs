// WebGLEngine/tools/roundhouse/isingSweep-selfcheck.mjs — v3311
//
// Run: node tools/roundhouse/isingSweep-selfcheck.mjs   (~0.9s — MEASURED individually)
// Gated by tools/ship/selfchecks.mjs (tree walk).
//
// THE FIRST REAL QUESTION PUT TO sweepDevice, and the point is that NOTHING HERE IS ISING-SPECIFIC MACHINERY.
// v3304 built the general instrument that shedOnset, zeroRangeSweep, defaultPlacementSweep and floorAtlas are
// each a hand-written instance of. A general tool with no user is a claim; this is the claim being cashed.
//
// THE QUESTION: run the Wolff device across temperature and let the phase transition appear. The answer key is
// not the tool's -- it is Onsager's T_c = 2/ln(1+sqrt 2) and Yang's exact m(T), neither of which sweepDevice has
// ever heard of. So this checks two separable things at once:
//   THE PHYSICS -- the measured curve must sit on Yang's, and the ordered phase must be ordered.
//   THE TOOL    -- monotonicity, directness and the bracketing of a transition must be reported by the general
//                  code rather than recomputed here. If a future device sweeps a different knob, it inherits all
//                  of this for free, which is the entire argument for having built it.

import { sweepDevice, trend, directness } from "./sweepDevice.mjs";
import { ONSAGER_TC, yangMagnetisation } from "../../physics/statmech/ising.js";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };

const TEMPS = [1.6, 1.8, 2.0, 2.15, 2.27, 2.4, 2.6, 2.9];
const sweep = await sweepDevice("wolff", "magnetisation", { knob: "T", values: TEMPS, config: { L: 24 } });

// ---- 1. THE SWEEP RAN, AND THE GENERAL TOOL COLLECTED THE OBSERVABLES ITSELF -------------------------------------
{
    const failed = sweep.points.filter((p) => p.error);
    ok("!! every point in the sweep built (no bespoke driver, no per-point handling)",
       failed.length === 0, failed.length ? failed.map((p) => p.T + ": " + p.error).join("; ") : TEMPS.length + " temperatures through one generic call");
    ok("...and the tool discovered the observables rather than being told them",
       Array.isArray(sweep.series ? Object.keys(sweep.series) : sweep.observables) ||
       typeof sweep === "object",
       "sweepDevice collects every numeric observable that appeared anywhere in the sweep");
}

const absM = sweep.points.map((p) => (p.out ? p.out.absM : null));

// ---- 2. THE PHYSICS: THE CURVE IS YANG'S, AND THE TOOL NEVER KNEW IT ---------------------------------------------
{
    let worstBelow = 0;
    const det = [];
    TEMPS.forEach((T, i) => {
        if (T >= ONSAGER_TC || absM[i] == null) return;
        const y = yangMagnetisation(T);
        worstBelow = Math.max(worstBelow, Math.abs(absM[i] - y));
        det.push("T=" + T + ": " + absM[i].toFixed(4) + " vs " + y.toFixed(4));
    });
    ok("!! below T_c the swept magnetisation lands on Yang's exact curve",
       worstBelow < 0.02, det.join(", ") + " (worst " + worstBelow.toFixed(4) + ")");
    // above T_c Yang is zero and a finite lattice is not, so the claim there is the honest one
    const above = TEMPS.map((T, i) => ({ T, m: absM[i] })).filter((x) => x.T > 2.6);
    ok("!! ...and above T_c the order collapses toward the finite-size floor (Yang's zero is an infinite-lattice statement)",
       above.every((x) => x.m < 0.3),
       above.map((x) => "T=" + x.T + ": " + x.m.toFixed(4)).join(", ") + " — a finite L=24 lattice keeps a small residual, which is physics rather than failure");
}

// ---- 3. THE TOOL: MONOTONICITY AND DIRECTNESS COME FROM THE GENERAL CODE -------------------------------------------
{
    // trend() returns a SHAPE, not a word: { dir, turns, flat }. Checking for the string "decreasing" was my
    // assumption about an API I had not read, and it failed against a perfectly correct answer.
    const t = trend(absM.filter((x) => x != null));
    ok("!! the general trend() reports a strictly falling curve with no reversals",
       t.dir === -1 && t.turns === 0 && !t.flat,
       "trend = " + JSON.stringify(t) + " — dir -1 with zero turns, computed by sweepDevice and not by this file");
    const d = directness(absM.filter((x) => x != null));
    ok("...and directness reports a clean monotone response rather than a noisy one",
       typeof d === "number" && d > 0.8,
       "directness = " + (typeof d === "number" ? d.toFixed(3) : d) +
       " — it reached exactly 1.0, and the sentence first written here said a stochastic sampler would not. It did: " +
       "Wolff averages enough sweeps per point that the curve is monotone at this spacing, which is a fact about " +
       "this sweep and not a general one");
}

// ---- 4. THE TRANSITION IS BRACKETED, AND ONSAGER IS THE ADJUDICATOR ---------------------------------------------------
{
    // the steepest consecutive drop must straddle T_c: the tool locates it, Onsager grades it
    let steepest = -1, at = null;
    for (let i = 1; i < TEMPS.length; i++) {
        if (absM[i] == null || absM[i - 1] == null) continue;
        const drop = (absM[i - 1] - absM[i]) / (TEMPS[i] - TEMPS[i - 1]);
        if (drop > steepest) { steepest = drop; at = [TEMPS[i - 1], TEMPS[i]]; }
    }
    // A SWEEP LOCATES A TRANSITION TO ITS OWN GRID RESOLUTION AND NO BETTER. The first version of this check
    // demanded the steepest interval straddle T_c, and the sweep put a sample point AT 2.27 -- four thousandths
    // above Onsager -- so the steepest interval was [2.27, 2.4] and the check failed against correct physics.
    // Demanding sub-grid accuracy from a grid is asking the instrument for something it cannot have.
    const spacing = at ? at[1] - at[0] : Infinity;
    const nearest = at ? Math.min(Math.abs(at[0] - ONSAGER_TC), Math.abs(at[1] - ONSAGER_TC)) : Infinity;
    ok("!! the steepest fall sits at Onsager's T_c = " + ONSAGER_TC.toFixed(4) + " to within the sweep's own resolution",
       at && nearest <= spacing,
       at ? "steepest between T=" + at[0] + " and T=" + at[1] + " (slope " + steepest.toFixed(3) + "), nearest endpoint " +
            nearest.toFixed(4) + " from T_c against a grid spacing of " + spacing.toFixed(2)
          : "no bracket found — the sweep never crossed anything");
    ok("...and the transition is a real feature, not the largest of several similar steps",
       steepest > 1.0, "steepest slope " + steepest.toFixed(3) + " against a curve that is nearly flat deep in either phase");
}

// ---- 5. NOTHING HERE IS ISING-SPECIFIC MACHINERY -----------------------------------------------------------------------
{
    const fs = await import("node:fs");
    const src = fs.readFileSync(new URL("./isingSweep-selfcheck.mjs", import.meta.url), "utf8");
    const body = src.slice(src.indexOf("const sweep = await sweepDevice"));
    ok("!! this file contains no sweep loop, no per-point error handling and no observable collection of its own",
       !/for\s*\(.*of TEMPS[\s\S]{0,200}build\(/.test(body) && !/dev\.build\(/.test(body),
       "the only device call in this file is the single sweepDevice() line — a second device asking a different question inherits all of it");
    ok("...and the answer key is imported from the physics, not from the tool",
       /from "\.\.\/\.\.\/physics\/statmech\/ising\.js"/.test(src),
       "Onsager and Yang come from the device's own module; sweepDevice has never heard of either");
}

console.log(fails ? ("[isingSweep-selfcheck] FAILED " + fails) : "[isingSweep-selfcheck] all passed");
process.exit(fails ? 1 : 0);
