// tools/rig/run-benard.mjs -- the Rayleigh-Benard Nusselt sweep, as a runnable job.
//   node tools/rig/run-benard.mjs [--quick]
// Thin: the physics lives in simulation/lbm/benardSweep.mjs and the analysis in physics/discovery/symbolicFit.js.
// This only sequences them and prints, so the job and the module can never disagree about what was measured.
import { sweep, splitAtOnset, RA_C } from "../../simulation/lbm/benardSweep.mjs";
import { powerLaw, VERDICT } from "../../physics/discovery/symbolicFit.js";

const quick = process.argv.includes("--quick");
const RAS = quick ? [600, 1200, 2500, 5000] : [600, 900, 1200, 1500, 2500, 3500, 5000, 7000, 10000, 14000];
const opts = quick ? { nx: 64, ny: 26, steps: 6000 } : {};

console.log("[benard] " + RAS.length + " Rayleigh numbers" + (quick ? " (QUICK: coarse grid, short runs -- shape only, not the measurement)" : " at 30,000 steps on 96x34 -- expect about ten minutes"));
console.log("[benard] critical number is " + RA_C + "; nothing below decides anything with it.");
const t0 = Date.now();
const pts = sweep(RAS, opts, (r) => {
    console.log("  Ra=" + String(r.Ra).padStart(6) + "  Nu=" + (Number.isFinite(r.Nu) ? r.Nu.toFixed(6) : "DIVERGED") +
                "  " + ((Date.now() - t0) / 1000).toFixed(0) + "s" + (r.healthy ? "" : "   <- FIELD DIVERGED"));
});

const { below, above } = splitAtOnset(pts);
console.log("");
if (below.length) {
    const worst = Math.max(...below.map((p) => Math.abs(p.Nu - 1)));
    console.log("EXACT KEY -- below onset the convective term is identically absent, so Nu is FORCED to 1:");
    console.log("  max |Nu-1| = " + worst.toExponential(3) + " over " + below.length + " sub-critical points");
}
console.log("");
console.log("HANDING IT TO THE DISCOVERER:");
const across = powerLaw(pts.map((p) => p.Ra), pts.map((p) => p.Nu));
console.log("  across onset      : " + across.verdict + (across.verdict === VERDICT.NO_LAW ? "   <- correct: a bifurcation is not a smooth function" : "   <- UNEXPECTED"));
if (above.length >= 4) {
    const sup = powerLaw(above.map((p) => p.Ra), above.map((p) => p.Nu));
    console.log("  supercritical only: " + sup.verdict + (sup.exponent !== undefined ? "   Nu ~ Ra^" + sup.exponent.toFixed(4) : ""));
    if (sup.verdict === VERDICT.NO_LAW) console.log("     " + (sup.reason || "").slice(0, 120));
    console.log("  NOTE: any exponent here is a MEASUREMENT, not a key -- it is regime dependent, so it is reported and not graded.");
}
console.log("");
console.log("[benard] done in " + ((Date.now() - t0) / 1000).toFixed(0) + "s");
