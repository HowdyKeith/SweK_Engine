// tools/roundhouse/shedOnset-selfcheck.mjs
//
// Run: node tools/roundhouse/shedOnset-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs.
//
// The shedding-onset harness held to the two things that make it an experiment and not a demo. First the binding: it
// actually drives the real LBM lab -- a tiny run measures a Reynolds number from the field and comes back with the
// observable struct. Second, and this is the one the whole design turns on, the anti-false-positive: a DECAYING transient
// -- a wobble that is dying out -- must be reported as NOT shedding, or the loop crystallizes on a Reynolds number where
// nothing is actually shedding. The detection is exercised through a mock lattice that emits a controlled signal, so a
// sustained oscillation reads as shedding and a decaying one does not, without waiting minutes for a real sim. The
// sabotage drops the sustained-amplitude test, and the decaying transient is then miscalled as onset -- exactly the wrong
// answer the harness exists to refuse.
import { makeLBM } from "../../simulation/lbm/lbm2d.js";
import { runOnce, autoBracket, defaultConfig, nuOf } from "./shedOnset.mjs";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };

// A mock lattice that ignores the physics and just emits a chosen uy signal at every cell, with a constant upstream ux so
// the harness measures a definite U. Lets the detection be tested in milliseconds instead of a real steady-state run.
function mockMaker(signalFn, U) {
    return (opts) => {
        const nx = opts.nx, ny = opts.ny, n = nx * ny;
        const ux = new Float64Array(n), uy = new Float64Array(n);
        let s = 0;
        return {
            ux, uy, nx, ny, idx: (x, y) => y * nx + x,
            step() { s++; const v = signalFn(s); for (let i = 0; i < n; i++) { ux[i] = U; uy[i] = v; } },
            mass() { return n; },
        };
    };
}
const mockCfg = (over) => defaultConfig({ nx: 24, ny: 14, warmupSteps: 60, windowSteps: 400, cylinder: { cx: 8, cy: 7, D: 4, offset: 0.5 }, probe: { px: 14, py: 5 }, ...over });

// ---- 1. THE BINDING DRIVES THE REAL LBM AND MEASURES Re FROM THE FIELD ------------------------------
{
    const cfg = defaultConfig({ nx: 80, ny: 30, warmupSteps: 300, windowSteps: 300, cylinder: { cx: 24, cy: 15, D: 7, offset: 0.5 }, probe: { px: 40, py: 11 }, g: 4e-5 });
    const r = runOnce(makeLBM, cfg);
    ok("!! the harness drives the real LBM and measures a Reynolds number from the field", Number.isFinite(r.reMeasured) && r.reMeasured > 0 && Number.isFinite(r.uMeasured) && r.massDrift < 1,
       "one real run: Re measured " + r.reMeasured.toFixed(1) + " from U " + r.uMeasured.toExponential(2) + ", mass drift " + r.massDrift.toExponential(1) + " -- the five seams are bound to the engine, not guessed.");
}

// ---- 2. A DECAYING TRANSIENT IS REJECTED, A SUSTAINED LIMIT CYCLE IS ACCEPTED (anti-false-positive) --
{
    const U = 0.08;
    const sustained = runOnce(mockMaker((s) => 0.04 * Math.sin(s * 0.3), U), mockCfg());
    const decaying = runOnce(mockMaker((s) => 0.04 * Math.exp(-s * 0.0016) * Math.sin(s * 0.3), U), mockCfg());
    ok("!! a sustained oscillation reads as shedding and a decaying transient does not", sustained.sheds === true && decaying.sheds === false,
       "constant-amplitude wobble is called shedding; a dying wobble is not (its second-half amplitude falls below the sustain tolerance) -- the loop cannot crystallize on a transient.");
}

// ---- 3. THE HARNESS REFUSES THE MACH CEILING RATHER THAN REPORTING COMPRESSIBILITY AS PHYSICS -------
{
    // a mock whose flow is already past the lattice-Mach guard: autoBracket must refuse, not proceed
    const br = autoBracket(mockMaker((s) => 0.02 * Math.exp(-s * 0.02) * Math.sin(s * 0.3), 0.15), { base: { nx: 24, ny: 14, warmupSteps: 40, windowSteps: 200, cylinder: { cx: 8, cy: 7, D: 4, offset: 0.5 }, probe: { px: 14, py: 5 } } });
    ok("!! a flow past the Mach ceiling is refused, not measured", br.ok === false && /Mach|ceiling/.test(br.reason),
       "U over the lattice-Mach guard returns [" + br.reason + "] -- shedding there would be compressibility error, so the harness declines rather than feed garbage to the bisection.");
}

console.log(fails ? "\nshedOnset-selfcheck: " + fails + " FAILED" : "\nshedOnset-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
