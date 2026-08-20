// WebGLEngine/physics/reaction/brusselator.js — v3319
// ---------------------------------------------------------------------------------------------------------------
// TURING PATTERNS, AND THE THRESHOLD IS EXACT.
//
// Two chemicals, both diffusing, both reacting. Left alone the mixture sits at a uniform steady state. Turing's
// 1952 result is that DIFFUSION -- the process that smooths everything -- can DESTABILISE that uniform state and
// produce stripes, if the inhibitor diffuses faster than the activator. It is the least intuitive stabilising
// mechanism in physics and it has a closed form.
//
// THE BRUSSELATOR is chosen over Gray-Scott for one reason: its algebra is exact rather than numerical.
//
//     u_t = Du u_xx + A - (B+1) u + u^2 v
//     v_t = Dv v_xx + B u - u^2 v
//
// The homogeneous steady state is EXACTLY u* = A, v* = B/A -- no quadratic to solve, no root-finding. Linearising
// there gives a Jacobian with integer-and-square entries:
//
//     J = [[ B - 1 ,  A^2 ] ,
//          [ -B     , -A^2 ]]
//
// and with diffusion, mode k grows at the larger eigenvalue of J - diag(Du k^2, Dv k^2). So the growth rate of
// every mode is a formula, exactly as FDTD's error is a formula: what gets graded is not "a pattern appeared"
// but "THIS MODE GREW AT EXACTLY THIS RATE".
//
// AND THE THRESHOLD ITSELF IS CLOSED FORM. Instability first appears at
//
//     B_c = (1 + A sqrt(Du/Dv))^2
//
// which the simulation is never told. Below it every mode decays no matter how long you wait; above it a band
// grows. A device that produced patterns below B_c would be producing them from something other than Turing's
// mechanism.
//
// *** THE THEOREM THAT MAKES THE SABOTAGE HONEST, STATED PRECISELY -- AND MY FIRST STATEMENT OF IT WAS WRONG. ***
// I wrote "with equal diffusion there is no instability, ever". Measured, Du = Dv at B = 20 GROWS at +0.295,
// and the theorem is not violated: the homogeneous state is ALREADY unstable there without any diffusion at all.
// The Brusselator's Jacobian has trace B - 1 - A^2, so a uniform HOPF oscillation sets in above
//
//     B_hopf = 1 + A^2
//
// which is 10 at A = 3, and B = 20 is past it. Diffusion did not destabilise anything; it arrived at a state
// that was already unstable.
//
// THE CORRECT STATEMENT: DIFFUSION CANNOT DESTABILISE A STATE THAT IS STABLE WITHOUT IT. With Dv = Du the same
// quantity is subtracted from both eigenvalue branches, so a stable Jacobian stays stable at every k. The test
// therefore has to hold B BELOW the Hopf threshold, and then equal diffusion must give decay for every mode --
// which is exactly what it does. A sabotage that ignored the Hopf line would have "disproved" a real theorem.
// ---------------------------------------------------------------------------------------------------------------
"use strict";

/** The exact homogeneous steady state. No solver involved. */
export const steadyState = (A, B) => ({ u: A, v: B / A });

/** Jacobian at the steady state, exactly. */
export function jacobian(A, B) {
    return { a11: B - 1, a12: A * A, a21: -B, a22: -A * A };
}

/**
 * Growth rate of Fourier mode k: the larger real part of the eigenvalues of J - diag(Du k^2, Dv k^2).
 * This is the closed form the simulation is graded against and never sees.
 */
export function growthRate(k, { A, B, Du, Dv }) {
    const J = jacobian(A, B);
    const m11 = J.a11 - Du * k * k, m22 = J.a22 - Dv * k * k;
    const tr = m11 + m22;
    const det = m11 * m22 - J.a12 * J.a21;
    const disc = tr * tr / 4 - det;
    if (disc < 0) return tr / 2;                  // complex pair: growth is the real part
    return tr / 2 + Math.sqrt(disc);
}

/** The Turing threshold, exactly. The simulation is never told this number. */
export const criticalB = (A, Du, Dv) => Math.pow(1 + A * Math.sqrt(Du / Dv), 2);

/** The wavenumber that first goes unstable at threshold, also closed form. */
export const hopfB = (A) => 1 + A * A;   // uniform oscillation sets in above this, with no diffusion involved
export const criticalK = (A, Du, Dv) => Math.sqrt(A / Math.sqrt(Du * Dv));

/**
 * One-dimensional periodic Brusselator, explicit RK2 in time and second-order central differences in space.
 * Seeded with a SINGLE Fourier mode of small amplitude, so the measured growth is that mode's and not a mixture.
 */
export function makeField({ n = 128, L = 32, A = 3, B = 9, Du = 1, Dv = 8, mode = 4, amp = 1e-7, seed = 7 } = {}) {
    const dx = L / n;
    const ss = steadyState(A, B);
    const u = new Float64Array(n), v = new Float64Array(n);
    for (let i = 0; i < n; i++) {
        const phase = 2 * Math.PI * mode * i / n;
        u[i] = ss.u + amp * Math.cos(phase);
        v[i] = ss.v;                                    // perturb ONE species only; the coupling does the rest
    }
    return { n, L, dx, A, B, Du, Dv, u, v, ss, k: 2 * Math.PI * mode / L, modeIndex: mode };
}

function lap(f, n, dx) {
    const out = new Float64Array(n);
    const inv = 1 / (dx * dx);
    for (let i = 0; i < n; i++) {
        const l = f[(i - 1 + n) % n], r = f[(i + 1) % n];
        out[i] = (l - 2 * f[i] + r) * inv;
    }
    return out;
}

function deriv(u, v, F) {
    const { n, dx, A, B, Du, Dv } = F;
    const lu = lap(u, n, dx), lv = lap(v, n, dx);
    const du = new Float64Array(n), dv = new Float64Array(n);
    for (let i = 0; i < n; i++) {
        const uu = u[i], vv = v[i], u2v = uu * uu * vv;
        du[i] = Du * lu[i] + A - (B + 1) * uu + u2v;
        dv[i] = Dv * lv[i] + B * uu - u2v;
    }
    return { du, dv };
}

export function step(F, dt) {
    const { n, u, v } = F;
    const k1 = deriv(u, v, F);
    const um = new Float64Array(n), vm = new Float64Array(n);
    for (let i = 0; i < n; i++) { um[i] = u[i] + 0.5 * dt * k1.du[i]; vm[i] = v[i] + 0.5 * dt * k1.dv[i]; }
    const k2 = deriv(um, vm, F);
    for (let i = 0; i < n; i++) { u[i] += dt * k2.du[i]; v[i] += dt * k2.dv[i]; }
    return F;
}

/** Amplitude of the seeded mode: projection onto its own cosine, which isolates it from every other mode. */
export function modeAmplitude(F) {
    let s = 0;
    for (let i = 0; i < F.n; i++) s += (F.u[i] - F.ss.u) * Math.cos(2 * Math.PI * F.modeIndex * i / F.n);
    return 2 * s / F.n;
}

/**
 * Measure the exponential growth rate of the seeded mode while it is still LINEAR. The amplitude is kept tiny
 * and the window short, because the whole point is to compare against a LINEARISED prediction: let it saturate
 * and the measurement is of the nonlinear state, which the formula does not describe.
 */
// *** TWO CORRECTIONS, BOTH MEASURED, AND BOTH ARE "THE MODEL OF THE MODEL" RATHER THAN PHYSICS. ***
//
//   (1) THE FIT MUST SKIP THE STARTUP TRANSIENT. Perturbing only u seeds BOTH eigenmodes, and the decaying one
//       dominates at first: measured local rates are 3.151 over t=0-0.5 and then 2.4330, 2.43098, 2.43094... A
//       fit from t=0 reads 2.648 against a predicted 2.435 and looks like an 8% physics disagreement. It is the
//       apparatus. The window opens at tStart, once the growing eigenmode owns the amplitude.
//
//   (2) THE PREDICTION MUST USE THE DISCRETE LAPLACIAN. The grid's second difference has eigenvalue
//       (2/dx^2)(1 - cos(k dx)), not k^2 -- 0.614871 against 0.616850 here. Comparing a discrete simulation to a
//       continuum formula is comparing two different operators, and the difference is 0.3%, which is larger than
//       the agreement being claimed. With both corrections the measured rate is 2.43098 against 2.43099.
//
// The seed amplitude is 1e-7 rather than 1e-4 so the LINEAR RANGE IS LONG ENOUGH TO FIT. A fast mode starting at
// 1e-4 leaves the linear regime before the window closes and the fit is left with two points and returns null --
// which is a correct refusal, and a needless one when a smaller seed buys four more decades of linear growth.
//
// The window also CLOSES before saturation: past t~3 the local rate falls away (2.427, 2.383, 1.994) as the
// nonlinearity takes over, and a linear-stability formula does not describe that.
export const discreteK = (k, dx) => Math.sqrt((2 / (dx * dx)) * (1 - Math.cos(k * dx)));

export function measureGrowth({ dt = 2e-3, tStart = 1.0, tEnd = 3.0, sample = 0.25, ...opts } = {}) {
    const F = makeField(opts);
    const steps = Math.round(tEnd / dt), every = Math.max(1, Math.round(sample / dt));
    const ts = [], logs = [];
    for (let s = 0; s <= steps; s++) {
        if (s % every === 0 && s * dt >= tStart) {
            const a = Math.abs(modeAmplitude(F));
            if (a > 0 && a < 1e-2) { ts.push(s * dt); logs.push(Math.log(a)); }
        }
        step(F, dt);
    }
    if (ts.length < 3) return { rate: null, points: ts.length };
    let sx = 0, sy = 0, sxx = 0, sxy = 0;
    const n = ts.length;
    for (let i = 0; i < n; i++) { sx += ts[i]; sy += logs[i]; sxx += ts[i] * ts[i]; sxy += ts[i] * logs[i]; }
    const rate = (n * sxy - sx * sy) / (n * sxx - sx * sx);
    const kd = discreteK(F.k, F.dx);
    return { rate, points: n, predicted: growthRate(kd, F), predictedContinuum: growthRate(F.k, F),
             k: F.k, kDiscrete: kd };
}
