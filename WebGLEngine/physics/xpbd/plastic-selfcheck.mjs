// physics/xpbd/plastic-selfcheck.mjs
//
// Run: node physics/xpbd/plastic-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs.
//
// Plasticity is tearing's twin on the parameter: past a yield strain a constraint's rest is permanently rewritten, so
// the object takes a set. The headline check contrasts it with a plain elastic solve under the same load-then-release:
// the plastic sheet stays deformed while the elastic one springs back. Below yield nothing is permanent -- rest0 stays
// exactly at its original. The dent is bounded by a cap, decided against a frozen snapshot so it is order-free, and
// matches its closed form. The sabotage stops carrying the plastic base forward, so next frame's reset from base wipes
// the dent and the take-a-set check fails: without persisting rest0 there is no permanence, only a momentary stretch.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { buildClothConstraints } from "./clothMesh.js";
import { colorConstraints, xpbdSubstep } from "./xpbd.js";
import { plasticSubstep, applyPlasticity, meanRest0 } from "./plastic.js";
import { meanEdgeLength } from "./modulate.js";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };
let seed = 0x4d51;
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
const P = { dt: 0.02, iterations: 5, yieldStrain: 0.05, creep: 0.4, maxStrain: 1.0 };

// ---- 1. TAKES A SET: after load and release the plastic sheet stays deformed; the elastic one springs back ---
{
    const { mk } = cloth();
    const plastic = mk();
    for (let k = 0; k < 40; k++) plasticSubstep(plastic.state, plastic.cons, plastic.batches, { ...P, gravity: [0, -60, 0] });
    for (let k = 0; k < 80; k++) plasticSubstep(plastic.state, plastic.cons, plastic.batches, { ...P, gravity: [0, 0, 0] });
    const ePlastic = meanEdgeLength(plastic.state.pos, plastic.cons);
    const elastic = mk();   // plain XPBD control, same load then release
    for (let k = 0; k < 40; k++) xpbdSubstep(elastic.state, elastic.cons, elastic.batches, { dt: 0.02, iterations: 5, gravity: [0, -60, 0] });
    for (let k = 0; k < 80; k++) xpbdSubstep(elastic.state, elastic.cons, elastic.batches, { dt: 0.02, iterations: 5, gravity: [0, 0, 0] });
    const eElastic = meanEdgeLength(elastic.state.pos, elastic.cons);
    ok("!! after load and release the plastic sheet stays stretched while the elastic one springs back", ePlastic > eElastic * 1.05 && meanRest0(plastic.cons) > 0.3,
       "released from the same hard load, the plastic mesh holds a mean edge of " + ePlastic.toFixed(4) + " (rest lengths permanently grew) against the elastic mesh's " + eElastic.toFixed(4) + " -- it took a set.");
}

// ---- 2. BELOW YIELD IS ELASTIC: a gentle load leaves the base rest untouched ---------------------------------
{
    const { mk } = cloth();
    const gentle = mk();
    for (let k = 0; k < 60; k++) plasticSubstep(gentle.state, gentle.cons, gentle.batches, { ...P, gravity: [0, -1.5, 0] });
    let anyYield = false; for (const c of gentle.cons) if (Math.abs((c.rest0 ?? c.rest) - c.restOrig) > 1e-12) anyYield = true;
    ok("!! a load that never exceeds yield leaves the base rest exactly unchanged", !anyYield,
       "under a gentle load the predicted strain stays below the 0.05 yield, so no constraint's base rest moved -- the material is purely elastic until it yields.");
}

// ---- 3. BOUNDED: sustained overload caps the plastic strain, it does not run away ---------------------------
{
    const { mk } = cloth();
    const m = mk();
    for (let k = 0; k < 200; k++) plasticSubstep(m.state, m.cons, m.batches, { ...P, gravity: [0, -80, 0] });
    let capped = true; for (const c of m.cons) { const tp = ((c.rest0 ?? c.rest) - c.restOrig) / c.restOrig; if (tp > P.maxStrain + 1e-9 || tp < -P.maxStrain - 1e-9) capped = false; }
    ok("!! plastic strain is capped and cannot run away under sustained overload", capped,
       "even after 200 frames of heavy overload no constraint's permanent strain exceeds the " + P.maxStrain + " cap relative to its original length -- the dent is bounded.");
}

// ---- 4. SNAPSHOT DETERMINISM: the yield decision is a pure function of the predicted positions ---------------
{
    const { N, mk } = cloth();
    const build = () => { const m = mk(); const pred = Float64Array.from(m.state.pos); for (let i = 0; i < pred.length; i++) pred[i] *= 1.4; return { cons: m.cons, pred }; };   // stretched snapshot
    const ref = build(); applyPlasticity(ref.pred, ref.cons, P, iota(ref.cons.length));
    const refRest = ref.cons.map((c) => c.rest0);
    let identical = true;
    for (let t = 0; t < 40; t++) { const b = build(); applyPlasticity(b.pred, b.cons, P, shuffle(iota(b.cons.length))); for (let i = 0; i < b.cons.length; i++) if (b.cons[i].rest0 !== refRest[i]) { identical = false; break; } }
    ok("!! the plastic base update is identical no matter the scan order", identical,
       "each constraint reads only its own endpoints from the frozen predicted snapshot, so the permanent rest lengths come out the same across 40 shuffled scans.");
}

// ---- 5. EXACT: the yield formula matches its closed form ----------------------------------------------------
{
    const c = [{ i: 0, j: 1, rest: 1.0, compliance: 0.0 }];
    const pred = Float64Array.from([0, 0, 0, 1.3, 0, 0]);   // strain = 0.3
    applyPlasticity(pred, c, { yieldStrain: 0.1, creep: 0.5, maxStrain: 5 });
    const strain = 0.3, excess = strain - 0.1, expect = 1.0 * (1 + 0.5 * excess);
    ok("!! the permanent rest matches rest0*(1 + creep*(strain - yield)) exactly", Math.abs(c[0].rest0 - expect) < 1e-12,
       "at strain 0.3 with yield 0.1 and creep 0.5, only the 0.2 excess flows: rest 1.0 -> " + c[0].rest0.toFixed(4) + ", matching the closed form to 1e-12.");
}

// ---- 6. PURE + deterministic -------------------------------------------------------------------------------
{
    const { mk } = cloth();
    const a = mk(), b = mk();
    for (let k = 0; k < 60; k++) { plasticSubstep(a.state, a.cons, a.batches, { ...P, gravity: [0, -50, 0] }); plasticSubstep(b.state, b.cons, b.batches, { ...P, gravity: [0, -50, 0] }); }
    const src = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "plastic.js"), "utf8").replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
    const noTrig = !/Math\.(sin|cos|tan|exp|log|pow|hypot|random|acos)\b/.test(src);
    ok("!! two runs agree byte-for-byte and there is no transcendental", hp(a.state.pos) === hp(b.state.pos) && meanRest0(a.cons) === meanRest0(b.cons) && noTrig,
       "two plastic runs land byte-identical with the same permanent rest lengths, and the code uses only +,-,*,/,sqrt -- bit-identical across machines.");
}

console.log(fails ? "\nplastic-selfcheck: " + fails + " FAILED" : "\nplastic-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
