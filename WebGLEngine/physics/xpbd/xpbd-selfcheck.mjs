// physics/xpbd/xpbd-selfcheck.mjs
//
// Run: node physics/xpbd/xpbd-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs.
//
// Two things this gate has to pin. First, the DETERMINISM: a graph-colored solve must be bit-identical no matter the
// order constraints are visited within a color, because within a color none of them share a particle -- that is the
// property a GPU dispatch relies on to avoid atomics and races, and the spine shuffles within-color order 200 times
// to prove it, while an all-in-one-batch Gauss-Seidel is shown to drift under the same shuffles. Second, that this
// is REAL XPBD and not the iteration-dependent PBD-with-compliance the tutorials ship: the exact single-step value
// is pinned to hand arithmetic, and the accumulated-lambda solver is shown to diverge from a PBD reference. The
// sabotage drops the -aTilde*lambda term (the exact term the reference doc dropped) and the XPBD-vs-PBD check fails.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { colorConstraints, cloneState, xpbdSubstep } from "./xpbd.js";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };

let seed = 0x2b1d;
const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
const shuffle = (a) => { const b = a.slice(); for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };
const hashPos = (p) => { const b = Buffer.alloc(p.length * 8); for (let i = 0; i < p.length; i++) b.writeDoubleLE(p[i], i * 8); return createHash("sha256").update(b).digest("hex"); };

// a hanging chain: particle 0 fixed, 5 particles in a row, 4 distance constraints, under gravity
function chain() {
    const N = 5;
    const pos = new Float64Array(3 * N), vel = new Float64Array(3 * N), invMass = new Float64Array(N);
    for (let a = 0; a < N; a++) { pos[3 * a] = a * 1.0; invMass[a] = a === 0 ? 0 : 1; }   // stretched a bit so gravity + constraints interact
    const cons = [];
    for (let a = 0; a < N - 1; a++) cons.push({ i: a, j: a + 1, rest: 0.8, compliance: 0.001 });
    return { state: { pos, vel, invMass }, cons };
}

// ---- 1. GRAPH COLORING: no two constraints in a batch share a particle ---------------------------------------
{
    const { cons } = chain();
    const batches = colorConstraints(cons);
    let clean = true;
    for (const batch of batches) { const seen = new Set(); for (const ci of batch) { const c = cons[ci]; if (seen.has(c.i) || seen.has(c.j)) clean = false; seen.add(c.i); seen.add(c.j); } }
    ok("!! graph coloring puts no two particle-sharing constraints in the same batch", clean && batches.length >= 2,
       batches.length + " color batches, none containing two constraints that touch the same particle -- so within a batch the updates are independent and safe to run in any order or in parallel.");
}

// ---- 2. THE SPINE: within-color order does not change the result (byte-identical) ----------------------------
{
    const { state, cons } = chain();
    const batches = colorConstraints(cons);
    const run = (bs) => { const s = cloneState(state); for (let step = 0; step < 20; step++) xpbdSubstep(s, cons, bs, { dt: 0.016, iterations: 4, gravity: [0, -10, 0] }); return hashPos(s.pos); };
    const ref = run(batches);
    let stable = true;
    for (let t = 0; t < 200; t++) { if (run(batches.map((b) => shuffle(b))) !== ref) { stable = false; break; } }
    ok("!! the solve is byte-identical under 200 within-color shuffles", stable,
       "shuffling the order of constraints inside each color batch changes nothing -- graph coloring makes the result a pure function of the input, not of visitation order. Bit-identical, no atomics needed.");
}

// ---- 3. THE CONTRAST: one flat batch (shared particles) DOES drift under shuffling ---------------------------
{
    const { state, cons } = chain();
    const flat = [cons.map((_, i) => i)];   // ALL constraints in a single batch -> they share particles
    const run = (bs) => { const s = cloneState(state); for (let step = 0; step < 20; step++) xpbdSubstep(s, cons, bs, { dt: 0.016, iterations: 4, gravity: [0, -10, 0] }); return hashPos(s.pos); };
    const ref = run(flat);
    let moved = false;
    for (let t = 0; t < 50; t++) { if (run([shuffle(flat[0])]) !== ref) { moved = true; break; } }
    ok("!! an un-colored (single-batch) Gauss-Seidel drifts under shuffling (so test 2 is not vacuous)", moved,
       "put every constraint in one batch and the order suddenly matters -- proving the shuffle test can tell deterministic from not, and that graph coloring is what removes the dependence.");
}

// ---- 4. EXACT XPBD: a single stretched constraint matches hand arithmetic (pins aTilde and Eq 17/18) ---------
{
    const state = { pos: Float64Array.from([0, 0, 0, 1.5, 0, 0]), vel: new Float64Array(6), invMass: Float64Array.from([0, 1]) };
    const r = xpbdSubstep(state, [{ i: 0, j: 1, rest: 1.0, compliance: 0.001 }], [[0]], { dt: 0.01, iterations: 1, gravity: [0, 0, 0] });
    ok("!! one substep matches the closed-form XPBD value exactly", Math.abs(state.pos[3] - 16 / 11) < 1e-12 && Math.abs(r.lambda[0] + 1 / 22) < 1e-12,
       "stretched to 1.5 with compliance 0.001 and dt 0.01: the free particle lands at 16/11 and lambda at -1/22, matching aTilde = compliance/dt^2 and Eqs (17,18) to 1e-12.");
}

// ---- 5. REAL XPBD, NOT PBD: accumulating lambda with the -aTilde*lambda term diverges from PBD ---------------
{
    // an inline PBD-with-compliance reference: same solve but WITHOUT the -aTilde*lambda term and WITHOUT accumulation
    function pbdRef(state, cons, batches, opts) {
        const { pos, vel, invMass } = state; const N = invMass.length; const dt = opts.dt, g = opts.gravity;
        const pred = new Float64Array(pos.length), prev = Float64Array.from(pos);
        for (let a = 0; a < N; a++) { const o = 3 * a; if (invMass[a] > 0) { vel[o] += g[0] * dt; vel[o + 1] += g[1] * dt; vel[o + 2] += g[2] * dt; pred[o] = pos[o] + vel[o] * dt; pred[o + 1] = pos[o + 1] + vel[o + 1] * dt; pred[o + 2] = pos[o + 2] + vel[o + 2] * dt; } else { pred[o] = pos[o]; pred[o + 1] = pos[o + 1]; pred[o + 2] = pos[o + 2]; } }
        for (let it = 0; it < opts.iterations; it++) for (const batch of batches) for (const ci of batch) {
            const c = cons[ci], w1 = invMass[c.i], w2 = invMass[c.j], wsum = w1 + w2; if (wsum === 0) continue;
            const ax = 3 * c.i, bx = 3 * c.j; const dx = pred[ax] - pred[bx], dy = pred[ax + 1] - pred[bx + 1], dz = pred[ax + 2] - pred[bx + 2];
            const len = Math.sqrt(dx * dx + dy * dy + dz * dz); if (len < 1e-12) continue;
            const aTilde = c.compliance / (dt * dt); const dL = (-(len - c.rest)) / (wsum + aTilde);   // NO -aTilde*lambda, NO accumulation
            const s = dL / len; pred[ax] += w1 * s * dx; pred[ax + 1] += w1 * s * dy; pred[ax + 2] += w1 * s * dz; pred[bx] -= w2 * s * dx; pred[bx + 1] -= w2 * s * dy; pred[bx + 2] -= w2 * s * dz;
        }
        for (let a = 0; a < N; a++) { const o = 3 * a; if (invMass[a] > 0) { vel[o] = (pred[o] - prev[o]) / dt; vel[o + 1] = (pred[o + 1] - prev[o + 1]) / dt; vel[o + 2] = (pred[o + 2] - prev[o + 2]) / dt; } pos[o] = pred[o]; pos[o + 1] = pred[o + 1]; pos[o + 2] = pred[o + 2]; }
    }
    const { state, cons } = chain(); const batches = colorConstraints(cons);
    const sX = cloneState(state), sP = cloneState(state);
    for (let step = 0; step < 30; step++) { xpbdSubstep(sX, cons, batches, { dt: 0.02, iterations: 10, gravity: [0, -10, 0] }); pbdRef(sP, cons, batches, { dt: 0.02, iterations: 10, gravity: [0, -10, 0] }); }
    let maxDiff = 0; for (let i = 0; i < sX.pos.length; i++) maxDiff = Math.max(maxDiff, Math.abs(sX.pos[i] - sP.pos[i]));
    ok("!! accumulating lambda (the -aTilde*lambda term) makes this real XPBD, not PBD", maxDiff > 1e-6,
       "over 30 substeps the XPBD solver diverges from a PBD-with-compliance reference by " + maxDiff.toFixed(4) + " -- the regularization term and lambda accumulation are doing real work; without them stiffness would drift with iteration count.");
}

// ---- 6. UNCONDITIONAL STABILITY + pure integer-of-floats (no transcendental) ---------------------------------
{
    const { state, cons } = chain();
    for (const c of cons) c.compliance = 0;   // infinitely stiff
    const s = cloneState(state); const batches = colorConstraints(cons);
    for (let step = 0; step < 200; step++) xpbdSubstep(s, cons, batches, { dt: 0.05, iterations: 5, gravity: [0, -20, 0] });   // large dt, stiff, strong gravity
    let finite = true; for (let i = 0; i < s.pos.length; i++) if (!Number.isFinite(s.pos[i]) || Math.abs(s.pos[i]) > 1e6) finite = false;
    const src = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "xpbd.js"), "utf8").replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
    const noTrig = !/Math\.(sin|cos|tan|exp|log|pow|hypot|random)\b/.test(src);
    ok("!! stiff constraints at a large time step stay stable, and the solver has no transcendental", finite && noTrig,
       "compliance 0 at dt 0.05 with heavy gravity over 200 steps -- positions stay finite and bounded (XPBD's unconditional stability), and the solver uses only +,-,*,/ and sqrt, so it is bit-identical across machines.");
}

console.log(fails ? "\nxpbd-selfcheck: " + fails + " FAILED" : "\nxpbd-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
