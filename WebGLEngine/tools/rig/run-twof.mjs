// tools/rig/run-twof.mjs -- the f_drag = 2 f_lift experiment, as a runnable job.
//   node tools/rig/run-twof.mjs [--quick]
// The rig config is the one v2863 DERIVED from a divergence rather than guessed: tau 0.55 for margin over the
// 0.545 that blew up, U 0.09 for margin under the validity ceiling, and Reynolds bought with diameter -- which
// costs domain AREA quadratically, and is why this is a rig job and not a longer sandbox run.
import { runTwoF, verdictTwoF, reOf, nuOf, STABLE_TAU_FLOOR } from "../../simulation/lbm/twoFExperiment.mjs";

const quick = process.argv.includes("--quick");
const cfg = quick
    ? { nx: 160, ny: 61, tau: 0.55, U: 0.09, D: 10, cx: 40, yOffset: 0.75, settle: 1500, record: 3000 }
    : { nx: 520, ny: 201, tau: STABLE_TAU_FLOOR, U: 0.09, D: 20, cx: 110, yOffset: 1.0, settle: 20000, record: 40000 };

console.log("[2f] Re=" + reOf(cfg.U, cfg.D, cfg.tau).toFixed(0) + "  blockage=" + (100 * cfg.D / cfg.ny).toFixed(1) +
            "%  nu=" + nuOf(cfg.tau).toFixed(5) + (quick ? "   (QUICK: too small to settle anything -- shape only)" : "   expect a long run"));
const t0 = Date.now();
const r = runTwoF(cfg, (d, t) => { if (d % 4000 === 0) console.log("  " + d + "/" + t + "  " + ((Date.now() - t0) / 1000).toFixed(0) + "s"); });
const v = verdictTwoF(r);
console.log("");
console.log("  inlet drift : " + (100 * r.inletDriftFrac).toFixed(3) + "%   (the v2834 feedback loop failed at 12-21%)");
console.log("  lift sustained: " + r.liftSustained + "   amplitude " + (r.liftAmplitude == null ? "n/a" : r.liftAmplitude.toFixed(5)));
console.log("  f_lift=" + r.fLift + "  f_drag=" + r.fDrag + "  ratio=" + r.dragOverLift);
console.log("");
console.log("VERDICT: " + v.text);
console.log("[2f] done in " + ((Date.now() - t0) / 1000).toFixed(0) + "s");
