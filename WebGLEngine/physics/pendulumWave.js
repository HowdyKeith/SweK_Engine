// physics/pendulumWave.js
//
// A pendulum wave is a row of pendulums whose lengths are tuned so that in one cycle time the longest completes k
// swings, the next k+1, the next k+2, and so on. Released together they start in step, then drift apart -- the small
// frequency differences fan them into a travelling wave, which folds into two groups, then finer patterns, then
// scrambles -- and at the end of the cycle every one of them has completed a whole number of swings at once, so they
// snap back into step and the whole thing repeats. The re-synchronisation is the point, and it is exact only if the
// pendulums keep their frequencies exactly.
//
// Each pendulum, at small amplitude, is a simple harmonic oscillator, theta'' = -omega^2 theta. Rather than approximate
// that with Euler (whose frequency drifts, so the re-sync would smear), each step is the EXACT harmonic rotation of
// (theta, v) through the angle omega*dt -- which is perfect for SHM and re-syncs to the bit. That rotation needs a cos
// and a sin of omega*dt, and those are computed ONCE per pendulum from the strict-trig core the engine already proves
// bit-identical; the per-step loop is then only +,-,*,/. So the strict core built long ago is again what makes a new
// subsystem cross-architecture. g is taken as 1, so a pendulum's length is 1/omega^2.
import { strictSin, strictCos } from "../tools/strictTrig.mjs";

// Build the row: N pendulums, longest doing k swings per cycle, each next one swing more; all released from `amp`.
export function makePendulumWave({ N = 15, k = 20, cycle = 60, amp = 0.3, dt = 1 / 60 } = {}) {
    const base = 2 * Math.PI / cycle, pend = [];
    for (let n = 0; n < N; n++) {
        const w = base * (k + n), c = strictCos(w * dt), s = strictSin(w * dt);
        pend.push({ theta: amp, v: 0, w, c, sOverW: s / w, wS: w * s, L: 1 / (w * w) });
    }
    return { pend, N, amp, cycle, dt, t: 0 };
}

// One step: rotate each (theta, v) through omega*dt exactly -- theta' = c*theta + (s/w)*v, v' = -(w*s)*theta + c*v.
export function pendulumStep(state) {
    for (const p of state.pend) { const th = p.theta, v = p.v; p.theta = p.c * th + p.sOverW * v; p.v = -p.wS * th + p.c * v; }
    state.t += state.dt;
    return state;
}

// How spread out the row is right now: the range of angles. Small = in step, large = scrambled.
export function angleSpread(state) {
    let mn = Infinity, mx = -Infinity;
    for (const p of state.pend) { if (p.theta < mn) mn = p.theta; if (p.theta > mx) mx = p.theta; }
    return mx - mn;
}

// Largest angle magnitude in the row -- should hold near amp, since exact SHM conserves each pendulum's energy.
export function maxAngle(state) { let m = 0; for (const p of state.pend) { const a = p.theta < 0 ? -p.theta : p.theta; if (a > m) m = a; } return m; }
