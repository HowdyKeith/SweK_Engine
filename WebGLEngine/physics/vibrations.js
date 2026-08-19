// physics/vibrations.js
//
// A row of equal masses joined by equal springs, ends pinned, is the simplest system with normal modes. Left to
// itself each mass obeys m x_n'' = k(x_{n-1} - 2 x_n + x_{n+1}) -- a discrete wave equation -- and the special motions
// that keep their shape are the standing waves: start the chain in the shape sin(j pi n / (N+1)) and the WHOLE chain
// oscillates at a single frequency omega_j = 2 sqrt(k/m) sin(j pi / 2(N+1)), every mass in step, the pattern frozen in
// space while its amplitude breathes. Any motion at all is a sum of these modes, which is why they matter: they
// diagonalise the chain. The integrator is symplectic velocity-Verlet so energy stays bounded and the modes do not
// bleed into one another, and the coupling loop is +,-,*,/ -- only the initial mode SHAPE and the analytic frequency
// use a sine, taken from the strict-trig core the engine proves bit-identical, so a mode is cross-architecture.
import { strictSin } from "../tools/strictTrig.mjs";

export function makeChain({ N = 12, k = 1, m = 1 } = {}) {
    return { x: new Float64Array(N), v: new Float64Array(N), N, w02: k / m, k, m };
}

// Set the chain to a pure normal mode j (1..N): x_n = amp * sin(j pi (n+1) / (N+1)), at rest.
export function setMode(state, j, amp = 0.3) {
    const N = state.N; for (let n = 0; n < N; n++) state.x[n] = amp * strictSin(j * Math.PI * (n + 1) / (N + 1)); state.v.fill(0);
    return state;
}

// The analytic frequency of mode j: omega_j = 2 sqrt(k/m) sin(j pi / 2(N+1)).
export function modeFreq(state, j) { return 2 * Math.sqrt(state.w02) * strictSin(j * Math.PI / (2 * (state.N + 1))); }

function accel(x, N, w02, out) {
    for (let n = 0; n < N; n++) { const xl = n > 0 ? x[n - 1] : 0, xr = n < N - 1 ? x[n + 1] : 0; out[n] = w02 * (xl - 2 * x[n] + xr); }
    return out;
}

// One velocity-Verlet step of the coupled chain.
export function chainStep(state, dt = 1 / 120) {
    const { x, v, N, w02 } = state, a = accel(x, N, w02, new Float64Array(N)), hdt2 = 0.5 * dt * dt;
    for (let n = 0; n < N; n++) x[n] += v[n] * dt + a[n] * hdt2;
    const a2 = accel(x, N, w02, new Float64Array(N));
    for (let n = 0; n < N; n++) v[n] += 0.5 * (a[n] + a2[n]) * dt;
    return state;
}

// Total energy: kinetic plus spring potential (including the two pinned end springs).
export function energy(state) {
    const { x, v, N, k, m } = state; let ke = 0, pe = 0;
    for (let n = 0; n < N; n++) ke += 0.5 * m * v[n] * v[n];
    let prev = 0; for (let n = 0; n < N; n++) { const d = x[n] - prev; pe += 0.5 * k * d * d; prev = x[n]; } pe += 0.5 * k * prev * prev;
    return ke + pe;
}

// How parallel the current displacement is to mode j's shape: |x . shape| / (|x| |shape|), 1 = a pure standing wave.
export function modeAlignment(state, j) {
    const N = state.N; let dot = 0, xx = 0, ss = 0;
    for (let n = 0; n < N; n++) { const sh = strictSin(j * Math.PI * (n + 1) / (N + 1)); dot += state.x[n] * sh; xx += state.x[n] * state.x[n]; ss += sh * sh; }
    return Math.abs(dot) / (Math.sqrt(xx) * Math.sqrt(ss));
}
