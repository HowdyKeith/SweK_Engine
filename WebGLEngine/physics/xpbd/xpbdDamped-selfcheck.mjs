// physics/xpbd/xpbdDamped-selfcheck.mjs
//
// Run: node physics/xpbd/xpbdDamped-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs.
//
// Damping has to do two things and break neither. It must reduce to the verified v2659 solver exactly when beta is
// zero -- checked byte-for-byte against xpbdSubstep -- and when beta is positive it must actually bleed energy out of
// motion along the constraint, checked by releasing a stretched constraint with no gravity and watching the
// oscillation die. The exact Equation 26 update is pinned against an inline reference so the gamma term is right, the
// solve stays graph-colored and order-free, and it uses no transcendental. The sabotage drops the gamma numerator
// term, and both the energy check and the exact check fail: with no velocity term the "damping" damps nothing.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { xpbdSubstep, colorConstraints, cloneState } from "./xpbd.js";
import { xpbdSubstepDamped } from "./xpbdDamped.js";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };
let seed = 0x6c2f;
const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
const shuffle = (a) => { const b = a.slice(); for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };
const hp = (p) => { const b = Buffer.alloc(p.length * 8); for (let i = 0; i < p.length; i++) b.writeDoubleLE(p[i], i * 8); return createHash("sha256").update(b).digest("hex"); };

function chain(N = 5) {
    const pos = new Float64Array(3 * N), vel = new Float64Array(3 * N), invMass = new Float64Array(N);
    for (let a = 0; a < N; a++) { pos[3 * a] = a * 1.0; invMass[a] = a === 0 ? 0 : 1; }
    const cons = []; for (let a = 0; a < N - 1; a++) cons.push({ i: a, j: a + 1, rest: 0.8, compliance: 0.001 });
    return { state: { pos, vel, invMass }, cons, batches: colorConstraints(cons) };
}

// ---- 1. beta = 0 EQUIVALENCE: the damped solver reduces to the verified v2659 solver byte-for-byte ----------
{
    const a = chain(), b = chain();
    for (let k = 0; k < 20; k++) { xpbdSubstep(a.state, a.cons, a.batches, { dt: 0.016, iterations: 5, gravity: [0, -10, 0] }); xpbdSubstepDamped(b.state, b.cons, b.batches, { dt: 0.016, iterations: 5, gravity: [0, -10, 0], beta: 0 }); }
    ok("!! with beta = 0 the damped solver equals xpbdSubstep exactly", hp(a.state.pos) === hp(b.state.pos),
       "gamma becomes 0 and every added term vanishes, so damped XPBD reduces byte-for-byte to the verified undamped solver -- damping is purely additive.");
}

// ---- 2. DAMPING REMOVES ENERGY: a released stretched constraint oscillates less when damped ------------------
{
    const cons = [{ i: 0, j: 1, rest: 1.0, compliance: 0.02 }], batches = colorConstraints(cons);
    const lateActivity = (beta) => {
        const s = { pos: Float64Array.from([0, 0, 0, 1.6, 0, 0]), vel: new Float64Array(6), invMass: Float64Array.from([0, 1]) };
        let act = 0; for (let k = 0; k < 400; k++) { xpbdSubstepDamped(s, cons, batches, { dt: 0.02, iterations: 1, gravity: [0, 0, 0], beta }); if (k >= 200) act += Math.abs(s.vel[3]); }
        return act;
    };
    const u = lateActivity(0), d = lateActivity(3.0);
    ok("!! positive beta bleeds energy out of oscillation along the constraint", d < u * 0.1,
       "released from a stretch with no gravity, the undamped constraint keeps oscillating (late |vel| sum " + u.toFixed(2) + ") while the damped one settles (" + d.toFixed(3) + ") -- energy removed along the constraint direction.");
}

// ---- 3. SPINE: graph-colored, byte-identical under within-color shuffles -------------------------------------
{
    const { state, cons } = chain(6); const batches = colorConstraints(cons);
    const run = (bs) => { const s = cloneState(state); for (let k = 0; k < 20; k++) xpbdSubstepDamped(s, cons, bs, { dt: 0.016, iterations: 4, gravity: [0, -8, 0], beta: 1.5 }); return hp(s.pos); };
    const ref = run(batches); let stable = true;
    for (let t = 0; t < 200; t++) if (run(batches.map((b) => shuffle(b))) !== ref) { stable = false; break; }
    ok("!! damped solve is byte-identical under 200 within-color shuffles", stable,
       "the damping term reads only the two endpoints' displacement, so the solve stays a pure per-color function -- order-free and bit-identical.");
}

// ---- 4. EXACT Eq 26: one moving step matches an inline reference and differs from undamped -------------------
{
    // particle 1 moving so pred != prev, activating the damping term
    const mk = () => ({ pos: Float64Array.from([0, 0, 0, 1.5, 0, 0]), vel: Float64Array.from([0, 0, 0, 1, 0, 0]), invMass: Float64Array.from([0, 1]) });
    const c = { i: 0, j: 1, rest: 1.0, compliance: 0.001 }, dt = 0.01, beta = 0.5;
    const s = mk(); const r = xpbdSubstepDamped(s, [c], [[0]], { dt, iterations: 1, gravity: [0, 0, 0], beta });
    // inline Eq 26 reference for this one step
    const prevx = 1.5, predx0 = 1.5 + 1 * dt;          // predict: pred = pos + v*dt = 1.51
    const len = predx0, C = len - 1.0;
    const aTilde = 0.001 / (dt * dt), betaTilde = dt * dt * beta, gamma = (aTilde * betaTilde) / dt;
    const gradDotDv = ((-predx0) * (-(predx0 - prevx))) / len;   // dx=-predx0, r = -(pred1-prev1)
    const dL = (-C - aTilde * 0 - gamma * gradDotDv) / ((1 + gamma) * 1 + aTilde);
    const expectX = predx0 + (-1) * (dL / len) * (-predx0);      // Δx_1 = -w2*(dL/len)*dx
    // undamped for the same step
    const su = mk(); xpbdSubstepDamped(su, [c], [[0]], { dt, iterations: 1, gravity: [0, 0, 0], beta: 0 });
    ok("!! one moving step matches the Eq 26 reference and differs from undamped", Math.abs(s.pos[3] - expectX) < 1e-12 && Math.abs(r.lambda[0] - dL) < 1e-12 && Math.abs(s.pos[3] - su.pos[3]) > 1e-9,
       "with the endpoint moving, the damping term is active: the step matches the closed-form Eq 26 value to 1e-12 and lands measurably apart from the undamped step.");
}

// ---- 5. STABILITY: heavy damping at a large dt stays finite --------------------------------------------------
{
    const { state, cons } = chain(6); const batches = colorConstraints(cons);
    const s = cloneState(state);
    for (let k = 0; k < 200; k++) xpbdSubstepDamped(s, cons, batches, { dt: 0.05, iterations: 5, gravity: [0, -20, 0], beta: 5.0 });
    let finite = true; for (let i = 0; i < s.pos.length; i++) if (!Number.isFinite(s.pos[i]) || Math.abs(s.pos[i]) > 1e6) finite = false;
    ok("!! heavy damping at a large time step stays finite", finite,
       "beta 5 at dt 0.05 with strong gravity over 200 steps stays bounded -- damping cannot destabilize the solve.");
}

// ---- 6. PURE + deterministic -------------------------------------------------------------------------------
{
    const { state, cons } = chain(6); const batches = colorConstraints(cons);
    const a = cloneState(state), b = cloneState(state);
    for (let k = 0; k < 80; k++) { xpbdSubstepDamped(a, cons, batches, { dt: 0.016, iterations: 5, gravity: [0, -10, 0], beta: 2 }); xpbdSubstepDamped(b, cons, batches, { dt: 0.016, iterations: 5, gravity: [0, -10, 0], beta: 2 }); }
    const src = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "xpbdDamped.js"), "utf8").replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
    const noTrig = !/Math\.(sin|cos|tan|exp|log|pow|hypot|random|acos)\b/.test(src);
    ok("!! runs are byte-identical and the solver has no transcendental", hp(a.pos) === hp(b.pos) && noTrig,
       "two damped runs agree byte-for-byte and the solver uses only +,-,*,/,sqrt -- bit-identical across machines.");
}

console.log(fails ? "\nxpbdDamped-selfcheck: " + fails + " FAILED" : "\nxpbdDamped-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
