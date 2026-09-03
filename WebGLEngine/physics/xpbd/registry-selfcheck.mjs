// physics/xpbd/registry-selfcheck.mjs
//
// Run: node physics/xpbd/registry-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs.
//
// The registry exists so the authoring UI can build itself without holding any physics. Its one danger is becoming a
// second, drifting copy of the couplings, so the headline check runs every coupling through the registry AND through
// its underlying verified module on the same scenario and demands byte-for-byte agreement -- the registry delegates,
// it does not reimplement. Around that: the metadata every slider and picker is built from must be valid (ranges
// ordered, defaults inside them), field-driven couplings must name the field the brush paints while strain-driven
// ones name none, and the registry must cover exactly the fingerprinted couplings. The sabotage hardcodes a parameter
// inside a registry substep so it diverges from its module, and the faithful-delegation check fails.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { buildClothConstraints } from "./clothMesh.js";
import { colorConstraints, cloneState } from "./xpbd.js";
import { thermalModulate, modulatedSubstep } from "./modulate.js";
import { muscleModulate, markRowFibers } from "./muscle.js";
import { plasticSubstep } from "./plastic.js";
import { fluidMeshSubstep } from "./fluid.js";
import { rigidClothSubstep, makeRigidProxy } from "./rigidCouple.js";
import { COUPLINGS, couplingById, couplingIds } from "./couplingRegistry.js";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };
const hp = (p) => { const b = Buffer.alloc(p.length * 8); for (let i = 0; i < p.length; i++) b.writeDoubleLE(p[i], i * 8); return createHash("sha256").update(b).digest("hex"); };

function cloth(W = 6, H = 6, muscleRow = -1) {
    const N = W * H;
    const mk = () => {
        const { cons } = buildClothConstraints(W, H, 0.3, { structural: 0.0, shear: 0.001, bending: 0.01 });
        if (muscleRow >= 0) markRowFibers(cons, W, muscleRow);
        const batches = colorConstraints(cons);
        const pos = new Float64Array(3 * N), vel = new Float64Array(3 * N), invMass = new Float64Array(N);
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = y * W + x; pos[3 * i] = x * 0.3; pos[3 * i + 1] = -y * 0.3; pos[3 * i + 2] = 0; invMass[i] = (y === 0) ? 0 : 1; }
        return { cons, batches, state: { pos, vel, invMass } };
    };
    return { N, mk };
}

// ---- 1. FAITHFUL DELEGATION: each registry substep equals its module called directly, byte-for-byte ---------
{
    const opt = { dt: 0.016, iterations: 5, gravity: [0, -10, 0] };
    // thermal
    const tW = cloth(); const N = tW.N; const temp = new Float64Array(N); for (let i = 0; i < N; i++) temp[i] = (i % 5) * 0.2;
    const tReg = tW.mk(); const tDir = tW.mk();
    const thermal = couplingById("thermal");
    for (let k = 0; k < 20; k++) { thermal.substep(tReg.state, tReg.cons, tReg.batches, temp, { ...opt, expansion: 0.15, soften: 6 }); modulatedSubstep(tDir.state, tDir.cons, tDir.batches, (c) => thermalModulate(c, temp, { ...opt, expansion: 0.15, soften: 6 }), { ...opt, expansion: 0.15, soften: 6 }); }
    const thermalOK = hp(tReg.state.pos) === hp(tDir.state.pos);
    // muscle
    const mW = cloth(6, 6, 2); const act = new Float64Array(mW.N); for (let i = 0; i < mW.N; i++) act[i] = (i % 4) * 0.3;
    const mReg = mW.mk(), mDir = mW.mk(); const muscle = couplingById("muscle");
    for (let k = 0; k < 20; k++) { muscle.substep(mReg.state, mReg.cons, mReg.batches, act, { ...opt, contraction: 0.4 }); modulatedSubstep(mDir.state, mDir.cons, mDir.batches, (c) => muscleModulate(c, act, { ...opt, contraction: 0.4 }), { ...opt, contraction: 0.4 }); }
    const muscleOK = hp(mReg.state.pos) === hp(mDir.state.pos);
    // plastic
    const pW = cloth(); const pReg = pW.mk(), pDir = pW.mk(); const plastic = couplingById("plastic");
    const pOpt = { dt: 0.02, iterations: 5, gravity: [0, -60, 0], yieldStrain: 0.05, creep: 0.4, maxStrain: 1.0 };
    for (let k = 0; k < 20; k++) { plastic.substep(pReg.state, pReg.cons, pReg.batches, null, pOpt); plasticSubstep(pDir.state, pDir.cons, pDir.batches, pOpt); }
    const plasticOK = hp(pReg.state.pos) === hp(pDir.state.pos);
    // fluid (driver "body": two systems, different substep signature)
    const fluidMk = () => {
        const W = 8, H = 8, SP = 0.25, NN = W * H;
        const built = buildClothConstraints(W, H, SP, { structural: 0.0005, shear: 0.001, bending: 0.01 }); const fb = colorConstraints(built.cons);
        const mpos = new Float64Array(3 * NN), mvel = new Float64Array(3 * NN), minv = new Float64Array(NN);
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = y * W + x; mpos[3 * i] = x * SP; mpos[3 * i + 1] = 0; mpos[3 * i + 2] = y * SP; const cn = (x === 0 || x === W - 1) && (y === 0 || y === H - 1); minv[i] = cn ? 0 : 1; }
        const nF = 27; const fpos = new Float64Array(3 * nF), fvel = new Float64Array(3 * nF), finv = new Float64Array(nF).fill(1);
        let k = 0; for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) for (let c = 0; c < 3; c++) { fpos[3 * k] = 0.75 + a * 0.16; fpos[3 * k + 1] = 0.35 + b * 0.16; fpos[3 * k + 2] = 0.75 + c * 0.16; k++; }
        return { mesh: { pos: mpos, vel: mvel, invMass: minv }, fluid: { pos: fpos, vel: fvel, invMass: finv }, cons: built.cons, batches: fb };
    };
    const fReg = fluidMk(), fDir = fluidMk(); const fluidC = couplingById("fluid");
    const fOpt = { dt: 0.016, iterations: 6, gravity: [0, -6, 0], fluidRadius: 0.09, contactRadius: 0.26 };
    for (let k = 0; k < 30; k++) { fluidC.substep(fReg.fluid, fReg.mesh, fReg.cons, fReg.batches, fOpt); fluidMeshSubstep(fDir.fluid, fDir.mesh, fDir.cons, fDir.batches, fOpt); }
    const fluidOK = hp(fReg.mesh.pos) === hp(fDir.mesh.pos) && hp(fReg.fluid.pos) === hp(fDir.fluid.pos);
    // rigid (driver "rigid", v4403: a particle set and ONE BODY, so the proxy has to be compared too -- a
    // delegation check that only hashed the cloth would pass on a registry that dropped the body's half)
    const rigidMk = () => {
        const W = 9, H = 9, SP = 0.07, NN = W * H;
        const built = buildClothConstraints(W, H, SP);
        const rp = new Float64Array(3 * NN), rv = new Float64Array(3 * NN), ri = new Float64Array(NN);
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
            const i = y * W + x;
            rp[3 * i] = (x - (W - 1) / 2) * SP; rp[3 * i + 1] = 0; rp[3 * i + 2] = (y - (H - 1) / 2) * SP;
            ri[i] = (x === 0 || x === W - 1 || y === 0 || y === H - 1) ? 0 : 1 / 0.03;
        }
        return { cloth: { pos: rp, vel: rv, invMass: ri }, cons: built.cons, batches: colorConstraints(built.cons),
                 proxy: makeRigidProxy({ halfExtents: [0.12, 0.09, 0.11], density: 400, pos: [0, 0.113, 0] }) };
    };
    const rReg = rigidMk(), rDir = rigidMk(); const rigidC = couplingById("rigid");
    const rOpt = { dt: 0.016 / 4, iterations: 2, gravity: [0, -10, 0], radius: 0.02 };
    for (let k = 0; k < 60; k++) {
        rigidC.substep(rReg.cloth, rReg.cons, rReg.batches, rReg.proxy, rOpt);
        rigidClothSubstep(rDir.cloth, rDir.cons, rDir.batches, rDir.proxy, rOpt);
    }
    const rigidOK = hp(rReg.cloth.pos) === hp(rDir.cloth.pos) &&
                    JSON.stringify(rReg.proxy.pos) === JSON.stringify(rDir.proxy.pos) &&
                    JSON.stringify(rReg.proxy.quat) === JSON.stringify(rDir.proxy.quat);
    ok("!! every registry coupling equals its verified module called directly, byte-for-byte", thermalOK && muscleOK && plasticOK && fluidOK && rigidOK,
       "thermal, muscle, plasticity, the two-body fluid coupling and the rigid coupling each run identically whether invoked through the registry or through the module -- the registry delegates, it holds no physics of its own. For the rigid one BOTH SIDES are hashed, cloth and body pose, because a registry that quietly dropped the body's half would leave the cloth identical.");
}

// ---- 2. METADATA VALID: ranges ordered and defaults inside them ---------------------------------------------
{
    let valid = true, why = "";
    for (const c of COUPLINGS) {
        if (!c.id || !c.label || !Array.isArray(c.params)) { valid = false; why = "missing id/label/params"; break; }
        for (const p of c.params) { if (!(p.min < p.max)) { valid = false; why = c.id + "." + p.name + " range"; break; } if (!(p.default >= p.min && p.default <= p.max)) { valid = false; why = c.id + "." + p.name + " default"; break; } }
        if (!valid) break;
    }
    ok("!! every coupling's slider metadata is well-formed", valid,
       valid ? "all " + COUPLINGS.length + " couplings have ordered parameter ranges with defaults inside them -- the UI can build its sliders straight from this." : "invalid metadata: " + why);
}

// ---- 3. COVERAGE: the registry lists exactly the fingerprinted couplings ------------------------------------
{
    const ids = couplingIds().slice().sort().join(",");
    const expected = ["fluid", "muscle", "plastic", "rigid", "thermal"].join(",");
    ok("!! the registry covers exactly the fingerprinted couplings", ids === expected,
       "registry ids [" + couplingIds().join(", ") + "] match the couplings that own fingerprint subsystems -- nothing paintable is missing and nothing phantom is listed.");
}

// ---- 4. DRIVER CONSISTENCY: field couplings name a field, strain couplings name none ------------------------
{
    let consistent = true;
    for (const c of COUPLINGS) {
        if (c.driver === "field" && !c.fieldName) consistent = false;
        if ((c.driver === "strain" || c.driver === "body" || c.driver === "rigid") && c.fieldName !== null) consistent = false;
        if (c.driver !== "field" && c.driver !== "strain" && c.driver !== "body" && c.driver !== "rigid") consistent = false;
    }
    ok("!! field-driven couplings name a paint field and strain-driven ones name none", consistent,
       "thermal and muscle declare the scalar the brush paints (temperature, activation); plasticity declares none because it reads stress from the motion -- the UI knows when to show the brush.");
}

// ---- 5. LOOKUP: couplingById and couplingIds resolve correctly ----------------------------------------------
{
    const byId = couplingById("muscle"), missing = couplingById("nope");
    ok("!! lookups resolve known couplings and reject unknown ones", byId && byId.id === "muscle" && missing === null && couplingIds().length === COUPLINGS.length,
       "couplingById returns the muscle entry and null for an unknown id; couplingIds enumerates all " + COUPLINGS.length + " -- the picker has a clean index.");
}

// ---- 6. NO REIMPLEMENTATION: the registry defines no solver math, only imports it ---------------------------
{
    const src = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "couplingRegistry.js"), "utf8");
    const noMath = !/Math\.sqrt|dLambda|aTilde|pred\[/.test(src.replace(/\/\/[^\n]*/g, ""));
    ok("!! the registry contains no solver math -- it only imports the verified modules", noMath,
       "no square roots, no multiplier updates, no prediction buffers appear in the registry; every substep is a call into a gated module, so there is nothing here to drift.");
}

console.log(fails ? "\nregistry-selfcheck: " + fails + " FAILED" : "\nregistry-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
