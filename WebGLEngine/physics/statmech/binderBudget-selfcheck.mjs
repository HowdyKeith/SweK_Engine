// WebGLEngine/physics/statmech/binderBudget-selfcheck.mjs — v3283
//
// Run: node physics/statmech/binderBudget-selfcheck.mjs   (~14s — MEASURED: 27 real Binder measurements at 7200 sweeps each)
// Gated by tools/ship/selfchecks.mjs (tree walk).
//
// The experiment-design handshake: strategies PROPOSE where to measure, the Onsager key ADJUDICATES what they
// found. Same budget for all three. The comparison is the finding: bisection beats even coverage on bracket
// width; the "easy data" policy — which a low-variance reward would endorse — never brackets the crossing at
// all. Pretty measurements about nothing, demonstrated rather than asserted.

import { ONSAGER_TC } from "./ising.js";
import { runCampaign, uniformStrategy, activeStrategy, easyStrategy } from "./binderBudget.js";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };

const CFG = { budget: 9, seed: 7, warmup: 1200, samples: 6000 };
const active = runCampaign(activeStrategy, CFG);
const uniform = runCampaign(uniformStrategy, CFG);
const easy = runCampaign(easyStrategy, CFG);

// ---- 1. THE FALSIFIER: whatever the proposer did, the answer must still be Onsager's -----------------------------
ok("!! the active campaign's crossing lands on Onsager's T_c (the falsifier no strategy contains)",
   active.crossing != null && Math.abs(active.crossing - ONSAGER_TC) < 0.06,
   active.crossing == null ? "no crossing found" : "crossing " + active.crossing.toFixed(4) + " vs " + ONSAGER_TC.toFixed(4) + " (|diff| " + Math.abs(active.crossing - ONSAGER_TC).toFixed(4) + ")");

// ---- 2. ACTIVE BEATS UNIFORM AT THE SAME BUDGET ------------------------------------------------------------------
ok("!! bisection brackets the crossing TIGHTER than even coverage at the same 9-measurement budget",
   active.bracketWidth != null && uniform.bracketWidth != null && active.bracketWidth < uniform.bracketWidth * 0.6,
   "active bracket " + (active.bracketWidth == null ? "none" : active.bracketWidth.toFixed(4)) +
   " vs uniform " + (uniform.bracketWidth == null ? "none" : uniform.bracketWidth.toFixed(4)) +
   " — information-seeking pays, measured in kelvin-equivalents rather than claimed");

// uniform is not broken, just slower — it should still find the crossing (a baseline that fails is no baseline)
ok("...and the uniform baseline still lands near T_c (slower, not wrong)",
   uniform.crossing != null && Math.abs(uniform.crossing - ONSAGER_TC) < 0.08,
   uniform.crossing == null ? "none" : "crossing " + uniform.crossing.toFixed(4));

// ---- 3. THE DEGENERATE POLICY, MEASURED --------------------------------------------------------------------------
// easyStrategy buys smooth, low-variance data at the ends of the span. A reward of "confident measurements"
// calls that optimal. It never straddles the transition: no bracket, or one no tighter than its seed points.
ok("!! the easy-data policy NEVER TIGHTENS the bracket (pretty measurements about nothing, measured)",
   easy.bracketWidth == null || easy.bracketWidth > active.bracketWidth * 3,
   "easy bracket " + (easy.bracketWidth == null ? "NONE — all its measurements sit in the deep phases" : easy.bracketWidth.toFixed(4)) +
   " vs active " + active.bracketWidth.toFixed(4) + " — this is the attractor a naive confidence-reward falls into");

// ---- 4. determinism ----------------------------------------------------------------------------------------------
{
    const a = runCampaign(activeStrategy, CFG), b = runCampaign(activeStrategy, CFG);
    ok("seeded campaigns are bit-identical (a failure reproduces)",
       a.crossing === b.crossing && a.bracketWidth === b.bracketWidth && a.points.length === b.points.length);
}

console.log(fails ? ("[binderBudget-selfcheck] FAILED " + fails) : "[binderBudget-selfcheck] all passed");
process.exit(fails ? 1 : 0);
