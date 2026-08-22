// tools/roundhouse/run-onset.mjs
//
// The roundhouse driver for shedding-onset question #1, bound to the real LBM lab.
// Run on the rig where you can afford the full step budget:
//     node tools/roundhouse/run-onset.mjs
//
// autoBracket scans the body force upward until the flow first sheds (refusing to
// proceed if it crosses the lattice-Mach ceiling first -- that "shedding" would be
// compressibility error, not physics). findOnset then bisects on the MEASURED
// Reynolds number until the bracket closes. The exit condition is a physics check,
// not two models agreeing.
import { makeLBM } from "../../simulation/lbm/lbm2d.js";
import { autoBracket, findOnset } from "./shedOnset.mjs";

// Full production step budget -- this is what makes the sustained-vs-transient
// verdict trustworthy. On a coarse/short run the transient masquerades as onset.
const base = { warmupSteps: 6000, windowSteps: 4000 };

console.log("autoBracket: scanning body force for first sustained shedding...");
const br = autoBracket(makeLBM, { base });
if (!br.ok) { console.log("  bracket failed:", br.reason); process.exit(1); }
console.log("  bracket [g " + br.gLo.toExponential(2) + " .. " + br.gHi.toExponential(2) + "]  Re [" + br.reLo.toFixed(1) + " .. " + br.reHi.toFixed(1) + "]  after " + br.scans + " scans");

console.log("findOnset: bisecting on measured Re...");
const on = findOnset(makeLBM, { gLo: br.gLo, gHi: br.gHi, base });
if (!on.ok) { console.log("  onset failed:", on.reason); process.exit(1); }
console.log("  Re_critical = " + on.reCritical.toFixed(1) + "  bracket [" + on.reBracket[0].toFixed(1) + " .. " + on.reBracket[1].toFixed(1) + "]");
console.log("  Strouhal at onset = " + (on.strouhalAtOnset != null ? on.strouhalAtOnset.toFixed(3) : "--") + "  rounds = " + on.rounds + "  max mass drift = " + on.maxMassDrift.toExponential(1));
console.log("\nThe sim adjudicated. If Re_critical > ~47, the channel confinement raised onset above the textbook unconfined value -- a measured result, not a recited one.");
