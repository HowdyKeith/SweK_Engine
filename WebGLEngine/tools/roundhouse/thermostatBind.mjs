// tools/roundhouse/thermostatBind.mjs -- v3773
//
// *** TIER 2. physics/md/thermostat.js was ungraded, and the key the roadmap named for it IS A MIRROR --
// which is the finding, not an obstacle. "Equipartition gives <1/2 m v^2> = 3/2 kT from the target alone"
// sounds like an external key and is not one here: rescaleToT(vel, m, 1.5, dof) SETS the velocities so that
// temperature() reads 1.5, and MEASURED IT READS 1.500000000000. The function sets it and the observable
// reads it back. Fourth device in this family after ct's correlations, the interferometer's lambda and
// kepler's mu. THE MEAN TEMPERATURE IS NOT EVIDENCE ABOUT THIS MODULE. ***
//
// *** WHAT IS NOT A MIRROR, AND BOTH ARE EXACT:
//   (1) MOMENTUM. After removeCOMMotion the total momentum sum(m_i v_i) IS ZERO -- a DIFFERENT quantity from
//       the one being set, so nothing cancels. Measured: |p| = 4.704e-14 on 600 particles.
//   (2) THE RELAXATION LAW. Berendsen coupling obeys dT/dt = (T0 - T)/tau, whose solution
//       T(t) = T0 - (T0 - T_start) exp(-t/tau) IS NEVER WRITTEN INTO THE CODE -- berendsenStep computes a
//       per-step velocity SCALE FACTOR and knows nothing about exponentials. Measured over 300 steps at
//       dt=0.002, tau=0.10: 3.991458 against an analytic 3.990922, a relative error of 1.342e-4. ***
//
// *** AND THE THIRD THING IS A LIMITATION, DECLARED RATHER THAN GRADED: BERENDSEN DOES NOT SAMPLE THE
// CANONICAL ENSEMBLE. It controls the MEAN and suppresses the FLUCTUATIONS, so the kinetic-energy variance is
// smaller than the canonical 2/dof. THAT CANNOT BE MEASURED HERE -- this module is a thermostat, not an
// integrator, and with no forces the temperature marches monotonically to target and sits, with no thermal
// fluctuation to have a variance. It is named so nobody grades a distribution this fixture cannot produce. ***

import { temperature, removeCOMMotion, rescaleToT, berendsenStep } from "../../physics/md/thermostat.js";

export const THERMOSTAT_OBSERVABLES = [
    "momentumMagnitude", "momentumHolds",
    "tMeasured", "tAnalytic", "relaxErrFrac", "relaxHolds",
    "tAfterRescale", "rescaleErrFrac", "mirrorNote",
    "N", "dof", "tau", "dt", "steps", "target",
];

export const THERMOSTAT_MODES = ["relax", "momentum", "mirror", "nosqrt"];

// *** steps: 50 IS MID-RELAXATION ON PURPOSE, AND THAT IS THE ENVELOPE LESSON. At 300 steps both arms have
// essentially converged to the target, so a RATE error is compressed into the last few digits: the plant
// separates only 16.9x there. Measured across the approach: 81.6x at 25 steps, 64.6x at 50, 43.7x at 100,
// 16.9x at 300. A LATE SAMPLE HIDES A RATE ERROR BECAUSE BOTH RATES END IN THE SAME PLACE -- 50 keeps the
// honest residual small (3.8e-3, still well inside the 1e-2 bar) while the plant reads 24.8%. ***
const DEF = { N: 600, target: 4.0, tau: 0.10, dt: 0.002, steps: 50, seed: 7 };

export function thermostatDefaults(hyp) {
    const h = { mode: "relax", ...(hyp || {}) };
    const c = { ...DEF, ...(h.config || {}) };
    const num = (v, d) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : d);
    c.N = Math.min(4000, Math.max(20, num(c.N, DEF.N) | 0));
    c.target = Math.min(1e3, Math.max(1e-3, num(c.target, DEF.target)));
    c.tau = Math.min(10, Math.max(1e-3, num(c.tau, DEF.tau)));
    c.dt = Math.min(c.tau / 2, Math.max(1e-5, num(c.dt, DEF.dt)));   // Berendsen needs dt well under tau
    c.steps = Math.min(5000, Math.max(10, num(c.steps, DEF.steps) | 0));
    h.config = c;
    if (!THERMOSTAT_MODES.includes(h.mode)) h.mode = "relax";
    return h;
}

function seededVelocities(N, seed) {
    const vel = new Float64Array(3 * N);
    let s = seed >>> 0;
    const rnd = () => ((s = (s * 1103515245 + 12345) >>> 0) / 4294967296);
    for (let i = 0; i < 3 * N; i++) vel[i] = rnd() * 2 - 1;
    return vel;
}

export async function buildThermostat(hyp, base = {}) {
    const h = thermostatDefaults({ ...hyp, config: { ...(hyp && hyp.config), ...base } });
    const c = h.config;
    const m = new Float64Array(c.N).fill(1);
    const vel = seededVelocities(c.N, c.seed);

    // *** THE FIRST PLANT I CHOSE WAS `freedof` -- 3N instead of 3N-3 -- AND IT DID NOT FIRE: relaxErrFrac
    // read 1.099e-4 IN BOTH ARMS. THE REASON WAS ALREADY WRITTEN IN THIS FILE BY MY OWN HAND: "the analytic
    // relaxation law does not contain dof at all". If the law does not contain it, changing it cannot break
    // the law -- dof enters temperature() at BOTH ends and cancels in the ratio. A BADLY CHOSEN PLANT, RULED
    // OUT RATHER THAN REPORTED AS A FINDING (v3715's rule), and the tell was that I had documented the
    // cancellation one paragraph before planting into it. ***
    // dof IS still reported, because it is a real property of the run; it is simply not what the plant tests.
    const dof = 3 * c.N - 3;

    removeCOMMotion(vel, m);
    let px = 0, py = 0, pz = 0;
    for (let i = 0; i < c.N; i++) { px += m[i] * vel[3 * i]; py += m[i] * vel[3 * i + 1]; pz += m[i] * vel[3 * i + 2]; }
    const pMag = Math.hypot(px, py, pz);

    const out = { N: c.N, dof, tau: c.tau, dt: c.dt, steps: c.steps, target: c.target,
                  momentumMagnitude: pMag, momentumHolds: pMag < 1e-9 };

    if (h.mode === "mirror") {
        // Reported so the blindness is visible in the device's own output, never graded as a key.
        rescaleToT(vel, m, c.target, dof);
        out.tAfterRescale = temperature(vel, m, dof);
        out.rescaleErrFrac = Math.abs(out.tAfterRescale - c.target) / c.target;
        out.mirrorNote = "rescaleToT SETS this and temperature() READS IT BACK -- not evidence about the module";
        return out;
    }

    rescaleToT(vel, m, 1.0, dof);
    const tStart = temperature(vel, m, dof);
    // *** THE PLANT THAT DOES FIRE: `nosqrt` APPLIES THE ENERGY RATIO TO THE VELOCITIES DIRECTLY. lam2 is a
    // ratio of ENERGIES and velocities scale as its SQUARE ROOT; dropping the sqrt still relaxes toward the
    // target and still converges -- IT SIMPLY RELAXES AT THE WRONG RATE, so the trajectory stops obeying
    // dT/dt = (T0 - T)/tau. THE FINAL TEMPERATURE DOES NOT GIVE IT AWAY; ONLY THE LAW DOES. ***
    for (let k = 0; k < c.steps; k++) berendsenStep(vel, m, c.target, dof, c.dt, c.tau, h.mode === "nosqrt");
    out.tMeasured = temperature(vel, m, dof);
    // THE ANALYTIC SOLUTION, WRITTEN OUT FROM THE INPUTS -- never imported from the module under test.
    out.tAnalytic = c.target - (c.target - tStart) * Math.exp(-c.steps * c.dt / c.tau);
    out.relaxErrFrac = Math.abs(out.tMeasured - out.tAnalytic) / out.tAnalytic;
    out.relaxHolds = out.relaxErrFrac < 1e-2;
    return out;
}

export const thermostatDevice = {
    modes: THERMOSTAT_MODES,
    // "relax" is FIRST so the mode-plant contract compares the plant against the mode that owns the keys.
    plantMode: "nosqrt", plantFlips: "relaxErrFrac", plantKind: "mode",
    name: "berendsen-thermostat", observables: THERMOSTAT_OBSERVABLES,
    build: buildThermostat, defaults: thermostatDefaults,
};
