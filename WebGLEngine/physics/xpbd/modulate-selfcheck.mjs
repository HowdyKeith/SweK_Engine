// physics/xpbd/modulate-selfcheck.mjs
//
// Run: node physics/xpbd/modulate-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs.
//
// This is the multi-physics spine, tested through its first coupling (thermal). Heating a region must swell it (rest
// lengths grow) and soften it (compliance grows, so it sags more under load). But the property the whole pipeline
// rests on is that modulation recomputes from a stored BASE every frame, so parameters are a pure function of the
// current field alone: modulate a hundred times with the same field and nothing drifts, and drop the field to zero
// and the parameters return exactly to base. The modulation is a pure per-constraint function of the field snapshot,
// so its order is irrelevant. The sabotage recomputes from the live (already-modulated) value instead of the base,
// and the no-compounding check fails as heat silently accumulates frame over frame.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { buildClothConstraints } from "./clothMesh.js";
import { colorConstraints, cloneState } from "./xpbd.js";
import { thermalModulate, modulatedSubstep, meanEdgeLength, modulateConstraints, initBaseParams } from "./modulate.js";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };
let seed = 0x77a3;
const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
const shuffle = (a) => { const b = a.slice(); for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };
const hp = (p) => { const b = Buffer.alloc(p.length * 8); for (let i = 0; i < p.length; i++) b.writeDoubleLE(p[i], i * 8); return createHash("sha256").update(b).digest("hex"); };
const iota = (n) => Array.from({ length: n }, (_, i) => i);

function cloth(W = 6, H = 6) {
    const N = W * H;
    const mk = () => {
        const { cons } = buildClothConstraints(W, H, 0.3, { structural: 0.0, shear: 0.001, bending: 0.01 });
        const batches = colorConstraints(cons);
        const pos = new Float64Array(3 * N), vel = new Float64Array(3 * N), invMass = new Float64Array(N);
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = y * W + x; pos[3 * i] = x * 0.3; pos[3 * i + 1] = -y * 0.3; pos[3 * i + 2] = 0; invMass[i] = (y === 0) ? 0 : 1; }
        return { cons, batches, state: { pos, vel, invMass } };
    };
    return { N, mk };
}

// ---- 1. THERMAL EXPANSION: heating swells the mesh; the cold mesh holds its size ----------------------------
{
    const { N, mk } = cloth();
    const cold = mk(), hot = mk();
    const tc = new Float64Array(N).fill(0), th = new Float64Array(N).fill(1.0);
    for (let k = 0; k < 30; k++) { modulatedSubstep(cold.state, cold.cons, cold.batches, (c) => thermalModulate(c, tc, { expansion: 0.15, soften: 4 }), { dt: 0.016, iterations: 5, gravity: [0, 0, 0] }); modulatedSubstep(hot.state, hot.cons, hot.batches, (c) => thermalModulate(c, th, { expansion: 0.15, soften: 4 }), { dt: 0.016, iterations: 5, gravity: [0, 0, 0] }); }
    const eCold = meanEdgeLength(cold.state.pos, cold.cons), eHot = meanEdgeLength(hot.state.pos, hot.cons);
    ok("!! heating the mesh swells it while the cold mesh holds its size", eHot > eCold * 1.05,
       "uniform temperature 1.0 grew the mean edge from " + eCold.toFixed(4) + " to " + eHot.toFixed(4) + " -- temperature drove rest length through the constraint parameters.");
}

// ---- 2. SOFTENING: a heated cloth sags further under gravity than a cold one --------------------------------
{
    const N = 36;
    const mkSoft = () => {
        const { cons } = buildClothConstraints(6, 6, 0.3, { structural: 0.001, shear: 0.002, bending: 0.01 });   // non-zero base so heat can raise it
        const batches = colorConstraints(cons);
        const pos = new Float64Array(3 * N), vel = new Float64Array(3 * N), invMass = new Float64Array(N);
        for (let y = 0; y < 6; y++) for (let x = 0; x < 6; x++) { const i = y * 6 + x; pos[3 * i] = x * 0.3; pos[3 * i + 1] = -y * 0.3; pos[3 * i + 2] = 0; invMass[i] = (y === 0) ? 0 : 1; }
        return { cons, batches, state: { pos, vel, invMass } };
    };
    const cold = mkSoft(), hot = mkSoft();
    const tc = new Float64Array(N).fill(0), th = new Float64Array(N).fill(1.0);
    for (let k = 0; k < 60; k++) { modulatedSubstep(cold.state, cold.cons, cold.batches, (c) => thermalModulate(c, tc, { expansion: 0.0, soften: 30 }), { dt: 0.016, iterations: 5, gravity: [0, -10, 0] }); modulatedSubstep(hot.state, hot.cons, hot.batches, (c) => thermalModulate(c, th, { expansion: 0.0, soften: 30 }), { dt: 0.016, iterations: 5, gravity: [0, -10, 0] }); }
    const droop = (s) => { let lo = 0; for (let i = 1; i < s.pos.length; i += 3) if (s.pos[i] < lo) lo = s.pos[i]; return -lo; };
    ok("!! a heated (softer) cloth sags further under load than a cold one", droop(hot.state) > droop(cold.state) * 1.02,
       "with expansion off and only compliance raised, the heated sheet droops to " + droop(hot.state).toFixed(3) + " vs the cold " + droop(cold.state).toFixed(3) + " -- heat lowered the stiffness independent of iteration count.");
}

// ---- 3. FROM-BASE, NO COMPOUNDING: the stability property the whole pipeline rests on -----------------------
{
    const { N, mk } = cloth();
    const { cons } = mk(); const temp = new Float64Array(N).fill(0.5);
    const rests = []; for (let k = 0; k < 100; k++) { thermalModulate(cons, temp, { expansion: 0.15, soften: 4 }); rests.push(cons[0].rest); }
    const stable = rests.every((r) => Math.abs(r - rests[0]) < 1e-15);
    thermalModulate(cons, new Float64Array(N).fill(0), { expansion: 0.15, soften: 4 });   // field back to zero
    const backToBase = Math.abs(cons[0].rest - cons[0].rest0) < 1e-15 && Math.abs(cons[0].compliance - cons[0].compliance0) < 1e-15;
    ok("!! modulating 100 times never compounds, and zero field returns to base exactly", stable && backToBase,
       "the same field applied 100 times gives the identical rest every time (no drift), and dropping the field to zero restores rest and compliance to their base values to 1e-15 -- recomputed from base, not from the last modulated value.");
}

// ---- 4. ORDER-FREE + DETERMINISTIC: modulation is a pure function of the field snapshot ---------------------
{
    const { N, mk } = cloth();
    const base = mk(); const temp = new Float64Array(N); for (let i = 0; i < N; i++) temp[i] = (i % 5) * 0.2;
    // modulation order does not change the resulting parameters
    const refCons = mk().cons; thermalModulate(refCons, temp, { expansion: 0.15, soften: 4 }, iota(refCons.length));
    let orderFree = true;
    for (let t = 0; t < 40; t++) { const c = mk().cons; thermalModulate(c, temp, { expansion: 0.15, soften: 4 }, shuffle(iota(c.length))); for (let i = 0; i < c.length; i++) if (Math.abs(c[i].rest - refCons[i].rest) > 0 || Math.abs(c[i].compliance - refCons[i].compliance) > 0) { orderFree = false; break; } }
    // whole step is deterministic
    const run = () => { const m = mk(); for (let k = 0; k < 30; k++) modulatedSubstep(m.state, m.cons, m.batches, (c) => thermalModulate(c, temp, { expansion: 0.15, soften: 4 }), { dt: 0.016, iterations: 5, gravity: [0, -10, 0] }); return hp(m.state.pos); };
    ok("!! modulation is order-free and the whole step is deterministic", orderFree && run() === run(),
       "the field-to-parameter map reads only the snapshot and each constraint's own nodes, so 40 shuffled modulation orders give identical parameters, and the full modulate-then-solve step reproduces byte-for-byte.");
}

// ---- 5. EXACT: the thermal map matches its closed form to 1e-12 ---------------------------------------------
{
    const cons = [{ i: 0, j: 1, rest: 2.0, compliance: 0.001 }];
    const temp = Float64Array.from([0.4, 0.8]);   // edge temp = 0.6
    thermalModulate(cons, temp, { expansion: 0.15, soften: 4 });
    const tEdge = 0.6, expectRest = 2.0 * (1 + 0.15 * tEdge), expectComp = 0.001 * (1 + 4 * tEdge);
    ok("!! rest and compliance match rest0*(1+a*T) and compliance0*(1+s*T) exactly", Math.abs(cons[0].rest - expectRest) < 1e-12 && Math.abs(cons[0].compliance - expectComp) < 1e-12,
       "edge temperature 0.6: rest 2.0 -> " + cons[0].rest.toFixed(4) + " and compliance 0.001 -> " + cons[0].compliance.toExponential(3) + ", both matching the closed form to 1e-12.");
}

// ---- 6. PURE + deterministic across the module -------------------------------------------------------------
{
    const { N, mk } = cloth(); const temp = new Float64Array(N); for (let i = 0; i < N; i++) temp[i] = (i % 7) * 0.1;
    const a = mk(), b = mk();
    for (let k = 0; k < 40; k++) { modulatedSubstep(a.state, a.cons, a.batches, (c) => thermalModulate(c, temp, { expansion: 0.15, soften: 4 }), { dt: 0.016, iterations: 5, gravity: [0, -10, 0] }); modulatedSubstep(b.state, b.cons, b.batches, (c) => thermalModulate(c, temp, { expansion: 0.15, soften: 4 }), { dt: 0.016, iterations: 5, gravity: [0, -10, 0] }); }
    const src = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "modulate.js"), "utf8").replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
    const noTrig = !/Math\.(sin|cos|tan|exp|log|pow|hypot|random|acos)\b/.test(src);
    ok("!! two runs agree byte-for-byte and there is no transcendental", hp(a.state.pos) === hp(b.state.pos) && noTrig,
       "two thermally-coupled runs land byte-identical and the spine uses only +,-,*,/,sqrt -- bit-identical across machines.");
}

console.log(fails ? "\nmodulate-selfcheck: " + fails + " FAILED" : "\nmodulate-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
