// physics/xpbd/muscle-selfcheck.mjs
//
// Run: node physics/xpbd/muscle-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs.
//
// Muscle turns a signal into motion. A fiber under full activation shortens to exactly its contracted rest, and when
// the signal is removed it relaxes back to rest -- temporary, the clean contrast with plasticity's permanence, and a
// direct consequence of recomputing from the base every frame. The actuation does directed work: firing the top band
// of a pinned strip curls its tip one way, firing the bottom band curls it the other, straddling the relaxed pose.
// And it is selective -- only constraints flagged as muscle respond, so a body can be part frame and part actuator.
// The sabotage removes the muscle flag check, so passive structure contracts too, and the selectivity check fails: a
// coupling that contracts everything is a global shrink, not a muscle.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { buildClothConstraints } from "./clothMesh.js";
import { colorConstraints } from "./xpbd.js";
import { muscleModulate, modulatedSubstep, markRowFibers } from "./muscle.js";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };
let seed = 0x61b7;
const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
const shuffle = (a) => { const b = a.slice(); for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };
const hp = (p) => { const b = Buffer.alloc(p.length * 8); for (let i = 0; i < p.length; i++) b.writeDoubleLE(p[i], i * 8); return createHash("sha256").update(b).digest("hex"); };
const iota = (n) => Array.from({ length: n }, (_, i) => i);

// a horizontal 2-row strip, left column pinned, one row's horizontal fibers marked muscle
function strip(row) {
    const W = 8, H = 2, N = W * H;
    const { cons } = buildClothConstraints(W, H, 0.3, { structural: 0.0, shear: 0.001, bending: 0.01 });
    markRowFibers(cons, W, row);
    const batches = colorConstraints(cons);
    const pos = new Float64Array(3 * N), vel = new Float64Array(3 * N), invMass = new Float64Array(N);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = y * W + x; pos[3 * i] = x * 0.3; pos[3 * i + 1] = -y * 0.3; pos[3 * i + 2] = 0; invMass[i] = (x === 0) ? 0 : 1; }
    return { W, N, cons, batches, state: { pos, vel, invMass } };
}
const tipY = (s, W) => 0.5 * (s.pos[3 * (W - 1) + 1] + s.pos[3 * (2 * W - 1) + 1]);
const runStrip = (row, actVal, steps = 80) => { const s = strip(row); const a = new Float64Array(s.N).fill(actVal); for (let k = 0; k < steps; k++) modulatedSubstep(s.state, s.cons, s.batches, (cs) => muscleModulate(cs, a, { contraction: 0.4 }), { dt: 0.016, iterations: 10, gravity: [0, 0, 0] }); return { tip: tipY(s.state, s.W), s }; };

// ---- 1. CONTRACTION: full activation shortens a fiber to exactly its contracted rest -------------------------
{
    const c = [{ i: 0, j: 1, rest: 1.0, compliance: 0.0, muscle: true }]; const batches = colorConstraints(c);
    muscleModulate(c, Float64Array.from([1, 1]), { contraction: 0.4 });
    const restExact = Math.abs(c[0].rest - 0.6) < 1e-12;
    const st = { pos: Float64Array.from([0, 0, 0, 1, 0, 0]), vel: new Float64Array(6), invMass: Float64Array.from([0, 1]) };
    for (let k = 0; k < 40; k++) modulatedSubstep(st, c, batches, (cs) => muscleModulate(cs, Float64Array.from([1, 1]), { contraction: 0.4 }), { dt: 0.016, iterations: 8, gravity: [0, 0, 0] });
    ok("!! a fully activated fiber shortens to exactly its contracted rest", restExact && Math.abs(Math.abs(st.pos[3] - st.pos[0]) - 0.6) < 1e-6,
       "activation 1.0 at contraction 0.4 set the fiber rest to 0.6 exactly and the fiber pulled its free end in to length 0.600 -- the signal did mechanical work.");
}

// ---- 2. RELAXATION: remove the signal and the fiber returns to rest (temporary, unlike plasticity) ----------
{
    const c = [{ i: 0, j: 1, rest: 1.0, compliance: 0.0, muscle: true }]; const batches = colorConstraints(c);
    const st = { pos: Float64Array.from([0, 0, 0, 1, 0, 0]), vel: new Float64Array(6), invMass: Float64Array.from([0, 1]) };
    for (let k = 0; k < 40; k++) modulatedSubstep(st, c, batches, (cs) => muscleModulate(cs, Float64Array.from([1, 1]), { contraction: 0.4 }), { dt: 0.016, iterations: 8, gravity: [0, 0, 0] });
    for (let k = 0; k < 60; k++) modulatedSubstep(st, c, batches, (cs) => muscleModulate(cs, Float64Array.from([0, 0]), { contraction: 0.4 }), { dt: 0.016, iterations: 8, gravity: [0, 0, 0] });
    ok("!! removing the signal relaxes the fiber back to its rest length", Math.abs(c[0].rest - 1.0) < 1e-12 && Math.abs(Math.abs(st.pos[3] - st.pos[0]) - 1.0) < 1e-6,
       "after contracting to 0.6, dropping activation to zero returned the rest to 1.0 and the fiber back out to length 1.000 -- a muscle relaxes, it does not take a set.");
}

// ---- 3. DIRECTED MOTION: firing top vs bottom fibers curls the strip to opposite sides ----------------------
{
    const relaxed = runStrip(0, 0).tip, top = runStrip(0, 1).tip, bottom = runStrip(1, 1).tip;
    ok("!! firing the top vs bottom band curls the strip to opposite sides of its relaxed pose", (top - relaxed) * (bottom - relaxed) < 0 && Math.abs(top - relaxed) > 0.05 && Math.abs(bottom - relaxed) > 0.05,
       "relaxed tip at " + relaxed.toFixed(3) + ", top fired curls to " + top.toFixed(3) + ", bottom fired curls to " + bottom.toFixed(3) + " -- the signal chooses the direction of motion.");
}

// ---- 4. SELECTIVE: with no fibers flagged, the activation field has no effect at all -----------------------
{
    const W = 8, H = 2, N = W * H;
    const mk = () => {
        const { cons } = buildClothConstraints(W, H, 0.3, { structural: 0.0, shear: 0.001, bending: 0.01 });   // NOTHING flagged muscle
        const batches = colorConstraints(cons);
        const pos = new Float64Array(3 * N), vel = new Float64Array(3 * N), invMass = new Float64Array(N);
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = y * W + x; pos[3 * i] = x * 0.3; pos[3 * i + 1] = -y * 0.3; pos[3 * i + 2] = 0; invMass[i] = (x === 0) ? 0 : 1; }
        return { cons, batches, state: { pos, vel, invMass } };
    };
    const run = (actVal) => { const m = mk(); const a = new Float64Array(N).fill(actVal); for (let k = 0; k < 40; k++) modulatedSubstep(m.state, m.cons, m.batches, (cs) => muscleModulate(cs, a, { contraction: 0.4 }), { dt: 0.016, iterations: 8, gravity: [0, -5, 0] }); return hp(m.state.pos); };
    ok("!! with no fibers flagged muscle, the activation field changes nothing", run(1) === run(0),
       "a body with no constraint marked muscle behaves byte-identically whether the activation field is full or zero -- passive structure is deaf to the signal.");
}

// ---- 5. ORDER-FREE + EXACT: the muscle map is a pure function of the activation snapshot --------------------
{
    const W = 6, H = 6, N = W * H;
    const mkC = () => { const { cons } = buildClothConstraints(W, H, 0.3, { structural: 0.0, shear: 0.001, bending: 0.01 }); markRowFibers(cons, W, 2); return cons; };
    const act = new Float64Array(N); for (let i = 0; i < N; i++) act[i] = (i % 4) * 0.3;
    const ref = mkC(); muscleModulate(ref, act, { contraction: 0.4 }, iota(mkC().length));
    const refRest = ref.map((c) => c.rest);
    let orderFree = true;
    for (let t = 0; t < 40; t++) { const c = mkC(); muscleModulate(c, act, { contraction: 0.4 }, shuffle(iota(c.length))); for (let i = 0; i < c.length; i++) if (c[i].rest !== refRest[i]) { orderFree = false; break; } }
    // exact closed form on a known fiber
    const one = [{ i: 0, j: 1, rest: 2.0, compliance: 0.001, muscle: true }]; muscleModulate(one, Float64Array.from([0.5, 0.9]), { contraction: 0.4 });
    const expect = 2.0 * (1 - 0.4 * 0.7);
    ok("!! the muscle map is order-free and matches rest0*(1 - contraction*activation) exactly", orderFree && Math.abs(one[0].rest - expect) < 1e-12,
       "40 shuffled orders give identical rests, and edge activation 0.7 shortens a rest-2.0 fiber to " + one[0].rest.toFixed(4) + " -- matching the closed form to 1e-12.");
}

// ---- 6. PURE + deterministic -------------------------------------------------------------------------------
{
    const a = runStrip(0, 1), b = runStrip(0, 1);
    const src = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "muscle.js"), "utf8").replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
    const noTrig = !/Math\.(sin|cos|tan|exp|log|pow|hypot|random|acos)\b/.test(src);
    ok("!! two runs agree byte-for-byte and there is no transcendental", hp(a.s.state.pos) === hp(b.s.state.pos) && noTrig,
       "two actuated strips land byte-identical and the coupling uses only +,-,*,/ -- bit-identical across machines, so the brain's signals drive reproducible motion.");
}

console.log(fails ? "\nmuscle-selfcheck: " + fails + " FAILED" : "\nmuscle-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
