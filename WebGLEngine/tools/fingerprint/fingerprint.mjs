// tools/fingerprint/fingerprint.mjs
//
// ONE HASH THAT PROVES THE WHOLE ENGINE IS THE SAME ON EVERY MACHINE.
//
// The engine's subsystems -- strict-libm, the molecular-dynamics force field, OBB collision, Ewald electrostatics,
// Prime Transport search -- are each deterministic and each separately gated. This harness ties them together: it
// runs a FIXED scenario through every one, hashes the result of each, and folds those into a single master
// fingerprint. Run it on two machines (Galaxina x86_64 and the M-series arm64 Mac) and compare the two master
// hashes. If they match, the entire engine -- molecules, collisions, electrostatics, search, and the transcendental
// floor under all of them -- computed bit-identical results across architectures. One command, one number, whole-
// engine reproducibility.
//
// CRITICAL DISCIPLINE: the SETUP of every scenario must itself be architecture-independent, or the fingerprint would
// differ for the wrong reason. So every initial condition here is a literal or an IEEE-exact op (+ - * / sqrt) or a
// strict-libm call -- NEVER a library Math.sin/cos/exp, whose last bit may vary between platforms. That is why, e.g.,
// the angle's cos0 is a hard literal, not Math.cos(112 deg).
import { hashFloats, hashInts } from "../hash.mjs";
import { sha256Hex } from "../sha256.mjs";
import { strictSin, strictCos } from "../strictTrig.mjs";
import { strictExp, strictErfc } from "../strictExpErf.mjs";
import { velocityVerlet, computeForces } from "../../physics/md/md.js";
import { bondForces, combine } from "../../physics/md/bonds.js";
import { angleForces as angleForcesFn } from "../../physics/md/angles.js";
import { ewald } from "../../physics/md/ewald.js";
import { obbFromPosed, obbContact } from "../../physics/obbOverlap.js";
import { compact } from "../../brain/transport/primeTransport.js";
import { astar } from "../../brain/astar/astar.js";
import { makeSceneArith, makeOccluders as traceOccluders, renderFrames as traceRender, groundTruth as traceGroundTruth, CAM as traceCam } from "../groundtruth/traceField.js";
import { pulseArrivalTimes } from "../../physics/pulsar/pulsar.js";
import { threatAt as predThreatAt, predictQuadratic as predQuad, leadIntercept as predLead } from "../../physics/predict/predict.js";
import { colorConstraints, xpbdSubstep } from "../../physics/xpbd/xpbd.js";
import { buildClothConstraints } from "../../physics/xpbd/clothMesh.js";
import { clothSubstep } from "../../physics/xpbd/clothStep.js";
import { xpbdSubstepDamped } from "../../physics/xpbd/xpbdDamped.js";
import { tearSubstep } from "../../physics/xpbd/tear.js";
import { attachSubstep } from "../../physics/xpbd/attach.js";
import { thermalModulate, modulatedSubstep } from "../../physics/xpbd/modulate.js";
import { plasticSubstep, meanRest0 } from "../../physics/xpbd/plastic.js";
import { muscleModulate, markRowFibers } from "../../physics/xpbd/muscle.js";
import { fluidMeshSubstep } from "../../physics/xpbd/fluid.js";
import { buildNeighbors, pbfProject, applyXSPH, poly6 } from "../../physics/xpbd/pbf.js";
import { generateIcosphere, buildEdges, enclosedVolume, volumeSubstep } from "../../physics/xpbd/volume.js";
import { planeFrictionSubstep, slopeNormal } from "../../physics/xpbd/friction.js";
import { buildAnisotropicCloth, anisotropicSubstep } from "../../physics/xpbd/anisotropy.js";
import { buildVectorGrid, sampledFieldSubstep } from "../../physics/xpbd/sampledField.js";
import { windClothSubstep } from "../../physics/xpbd/windCloth.js";
import { buildMuscleBelly, contractMuscle, muscleVolumeSubstep } from "../../physics/xpbd/muscleVolume.js";
import { strictJitterCentres } from "../../physics/strictGaussian.js";
import { lcg } from "../../physics/blobThermal.js";
import { warmthOfKelvin, SCENARIOS } from "../../physics/blobKelvin.js";
import { centrifugeStep } from "../../physics/centrifuge.js";
import { makeGyro, gyroStep } from "../../physics/gyroscope.js";
import { makePendulumWave, pendulumStep } from "../../physics/pendulumWave.js";
import { keplerPair, orbitStep } from "../../physics/orbit.js";
import { makeChain, setMode, chainStep } from "../../physics/vibrations.js";
import { spectrum } from "../../physics/fft.js";
import { zeta, piFromZeta } from "../../physics/zeta.js";
import { zetaMag, refineZero } from "../../physics/zetaCritical.js";
import { makeFigureEight, orbitStep as orbitStepF } from "../../physics/figureEight.js";
import { makeSession as makeLockSession, stepFrame as lockStep } from "../../physics/lockstep.js";
import { schwarzschildRadius as bhRs, circularSpeed as bhVc, makeParticle as bhMake, step as bhStep, energy as bhE } from "../../physics/blackHole.js";
import { ELEMENTS as SS_ELEMENTS, planetState as ssPlanet } from "../../physics/solarSystem.js";
import { schwarzschildRadiusKm as nsRs, compactness as nsC, iscoKm as nsIsco, escapeFraction as nsEsc, surfaceGeom as nsSurf, makeOrbit as nsMake, stepOrbit as nsStep } from "../../physics/neutronStar.js";
import { makeParticle as plMake, step as plStep } from "../../physics/plasma.js";
import { makeApproach as imMake, stepApproach as imStep } from "../../physics/impact.js";
import { renderWhole as rnWhole } from "../render/render.js";
import { runLadder as agRunLadder, sum as agSum, perTickFlowTrace as agPerTick } from "../../brain/agent/arena.js";
import { runFleetLadder as flLadder } from "../../brain/agent/fleet.js";
import { makeSystem as ssMakeSystem, orbitStep as ssStep } from "../../physics/orbit.js";
import { strictSin as strictSinFP } from "../../tools/strictTrig.mjs";
import { frictionalPileSubstep } from "../../physics/xpbd/frictionalContact.js";
import { tfRun } from "../../brain/tf/tfStep.js";


// ---- strict-libm: the deterministic transcendental floor ----------------------------------------------------------
function fpStrictLibm() {
    const v = [];
    for (let n = -60; n <= 60; n++) { const x = n * 0.05; v.push(strictSin(x), strictCos(x), strictExp(x), strictErfc(x < 0 ? -x : x)); }
    return hashFloats("strict-libm", v);
}

// ---- molecular dynamics: a 7-atom bonded chain, 500 velocity-Verlet steps -----------------------------------------
function fpMD() {
    const N = 7;
    const pos = new Float64Array(3 * N), vel = new Float64Array(3 * N), masses = new Float64Array(N).fill(12);
    for (let i = 0; i < N; i++) {                        // arithmetic-only initial conditions (no library trig)
        pos[3 * i] = (i - 3) * 1.5;
        pos[3 * i + 1] = ((i * 7) % 5 - 2) * 0.2;
        pos[3 * i + 2] = ((i * 11) % 7 - 3) * 0.15;
        vel[3 * i] = ((i * 37) % 13 - 6) * 0.03;
        vel[3 * i + 1] = ((i * 17) % 11 - 5) * 0.02;
        vel[3 * i + 2] = ((i * 29) % 7 - 3) * 0.025;
    }
    const bonds = []; for (let i = 0; i < N - 1; i++) bonds.push({ i, j: i + 1, k: 90, r0: 1.5 });
    const COS0 = -0.37460659341591196;                   // cos(112 deg) as a hard literal -- identical on every machine
    const angles = []; for (let i = 1; i < N - 1; i++) angles.push({ i: i - 1, j: i, k: i + 1, kang: 30, cos0: COS0 });
    const forceFn = combine((p) => computeForces(p, N, 0.2, 1.6, 0), (p) => bondForces(p, N, bonds), (p) => angleForcesFn(p, N, angles));
    const state = { pos, vel, forces: forceFn(pos).forces, masses, pe: 0 };
    for (let s = 0; s < 500; s++) velocityVerlet(state, 0.004, forceFn);
    return hashFloats("md-forcefield", [...state.pos, ...state.vel]);
}

// ---- OBB collision: two rotated boxes, hash the contact normal + penetration --------------------------------------
function fpCollision() {
    const a = obbFromPosed({ center: [0, 0, 0], half: [1, 1, 1], quat: [0.5, 0.5, 0.5, 0.5] });        // unit quat (literal)
    const b = obbFromPosed({ center: [1.2, 0.4, 0.3], half: [1, 1, 1], quat: [0, 0.7071067811865476, 0, 0.7071067811865476] });
    const c = obbContact(a, b);
    const v = c.hit ? [1, c.depth, ...(c.normal || [0, 0, 0])] : [0, 0, 0, 0, 0];
    return hashFloats("obb-collision", v);
}

// ---- Ewald electrostatics: the NaCl cell energy + forces ----------------------------------------------------------
function fpEwald() {
    const L = 1;
    const na = [[0, 0, 0], [0.5, 0.5, 0], [0.5, 0, 0.5], [0, 0.5, 0.5]];
    const cl = [[0.5, 0, 0], [0, 0.5, 0], [0, 0, 0.5], [0.5, 0.5, 0.5]];
    const pos = [], q = [];
    for (const p of na) { pos.push(p[0] * L, p[1] * L, p[2] * L); q.push(1); }
    for (const p of cl) { pos.push(p[0] * L, p[1] * L, p[2] * L); q.push(-1); }
    const r = ewald(new Float64Array(pos), new Float64Array(q), 8, L, { alpha: 4 / L, kmax: 6, rcut: L });
    return hashFloats("ewald-electrostatics", [r.energy, ...r.forces]);
}

// ---- Prime Transport: a fixed constrained-search compaction, hash the survivors -----------------------------------
function fpPrimeTransport() {
    const NUM_STATES = 8, MAXSURV = 64, THRESH = 0.15;
    const wheel = new Uint32Array(NUM_STATES * NUM_STATES);
    for (let i = 0; i < wheel.length; i++) wheel[i] = ((i * 2654435761) >>> 28) & 1;           // deterministic pseudo-mask (integer hash)
    const tuplets = Array.from({ length: 16 }, (_, t) => ({ steps: [0, 0, 0, (t * 3) % NUM_STATES] }));
    const candidates = Array.from({ length: 240 }, (_, i) => ({
        stateId: (i * 7) % NUM_STATES,
        parentTupleIndex: (i * 5) % 18,                                                        // sometimes past the 16 tuplets -> exercises the bounds guard
        score: ((i * 2246822519) >>> 8) / 0xffffff,                                            // deterministic pseudo-score in [0,1)
    }));
    const { survivors, count } = compact(candidates, wheel, tuplets, NUM_STATES, THRESH, MAXSURV);
    return hashInts("prime-transport", [count, ...survivors]);
}

// ---- A* pathfinding: a fixed grid with walls, hash the chosen path ------------------------------------------------
function fpAstar() {
    const nx = 12, ny = 12, nz = 1, blocked = new Uint8Array(nx * ny * nz);
    for (let i = 0; i < nx * ny; i++) blocked[i] = (((i * 2654435761) >>> 27) & 3) === 0 ? 1 : 0;   // deterministic ~25% walls
    blocked[0] = 0; blocked[nx * ny - 1] = 0;                                                       // keep start/goal open
    const r = astar({ nx, ny, nz, blocked }, 0, nx * ny - 1);
    return hashInts("astar-pathfinding", r ? [1, r.cost, ...r.path] : [0]);
}

// ---- XPBD cloth: a fixed hanging chain, graph-colored, hash the settled positions --------------------------------
function fpXpbd() {
    const N = 6;
    const pos = new Float64Array(3 * N), vel = new Float64Array(3 * N), invMass = new Float64Array(N);
    for (let a = 0; a < N; a++) { pos[3 * a] = a * 0.9; pos[3 * a + 1] = ((a * 7) % 5 - 2) * 0.1; invMass[a] = a === 0 ? 0 : 1; }   // literal init, no trig
    const cons = []; for (let a = 0; a < N - 1; a++) cons.push({ i: a, j: a + 1, rest: 0.8, compliance: 0.002 });
    const batches = colorConstraints(cons);
    const state = { pos, vel, invMass };
    for (let s = 0; s < 40; s++) xpbdSubstep(state, cons, batches, { dt: 0.016, iterations: 5, gravity: [0, -10, 0] });
    return hashFloats("xpbd-cloth", [...state.pos]);
}

// ---- Transform-feedback advection: a ring of agents integrated on the GPU, hash the settled positions -----------
function fpTf() {
    const N = 24;
    const pos = new Float64Array(3 * N), vel = new Float64Array(3 * N);
    for (let a = 0; a < N; a++) { pos[3 * a] = (a % 5) - 2; pos[3 * a + 1] = ((a * 3) % 7) - 3; pos[3 * a + 2] = ((a * 2) % 3) - 1; vel[3 * a] = 0.1 * (((a * 11) % 5) - 2); }   // literal init, no trig
    const out = tfRun({ pos, vel }, 60, { dt: 0.02, coupling: 0.6 });
    return hashFloats("tf-advect", [...out.pos]);
}

// ---- Cloth with self-collision: a pinned sheet folds under gravity, structural+shear+bending+contact, hash it ----
function fpCloth() {
    const W = 5, H = 5, N = W * H;
    const { cons, adj } = buildClothConstraints(W, H, 0.3, { structural: 0.0, shear: 0.001, bending: 0.01 });
    const batches = colorConstraints(cons);
    const pos = new Float64Array(3 * N), vel = new Float64Array(3 * N), invMass = new Float64Array(N);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = y * W + x; pos[3 * i] = x * 0.3; pos[3 * i + 1] = 0; pos[3 * i + 2] = -y * 0.3; invMass[i] = (y === 0) ? 0 : 1; }   // hung horizontally, folds under gravity
    const state = { pos, vel, invMass };
    for (let s = 0; s < 50; s++) clothSubstep(state, cons, batches, { dt: 0.016, iterations: 5, gravity: [0, -10, 0], radius: 0.08, adj });
    return hashFloats("cloth-collision", [...state.pos]);
}

// ---- Damped XPBD: a stretched chain released and damped (Eq 26), hash the settled positions --------------------
function fpXpbdDamped() {
    const N = 6;
    const pos = new Float64Array(3 * N), vel = new Float64Array(3 * N), invMass = new Float64Array(N);
    for (let a = 0; a < N; a++) { pos[3 * a] = a * 1.1; pos[3 * a + 1] = ((a * 7) % 5 - 2) * 0.1; invMass[a] = a === 0 ? 0 : 1; }
    const cons = []; for (let a = 0; a < N - 1; a++) cons.push({ i: a, j: a + 1, rest: 0.8, compliance: 0.002 });
    const batches = colorConstraints(cons);
    const state = { pos, vel, invMass };
    for (let s = 0; s < 40; s++) xpbdSubstepDamped(state, cons, batches, { dt: 0.016, iterations: 5, gravity: [0, -10, 0], beta: 2.0 });
    return hashFloats("xpbd-damped", [...state.pos]);
}

// ---- Cloth tearing: a pinned sheet pulled hard until threads snap, hash the torn configuration ----------------
function fpTear() {
    const W = 6, H = 6, N = W * H;
    const { cons } = buildClothConstraints(W, H, 0.3, { structural: 0.0, shear: 0.001, bending: 0.01 });
    const batches = colorConstraints(cons);
    const pos = new Float64Array(3 * N), vel = new Float64Array(3 * N), invMass = new Float64Array(N);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = y * W + x; pos[3 * i] = x * 0.3; pos[3 * i + 1] = -y * 0.3; pos[3 * i + 2] = 0; invMass[i] = (y === 0) ? 0 : 1; }
    const active = new Uint8Array(cons.length).fill(1); const state = { pos, vel, invMass };
    for (let s = 0; s < 40; s++) tearSubstep(state, cons, batches, active, { dt: 0.02, iterations: 5, gravity: [0, -50, 0], tearStrain: 1.08 });
    let torn = 0; for (let i = 0; i < active.length; i++) torn += (1 - active[i]);
    return hashFloats("cloth-tear", [...state.pos, torn]);
}

// ---- Pinned cloth: a sheet held only by two anchors (one moving) under gravity, hash the drape --------------
function fpPinned() {
    const W = 5, H = 5, N = W * H;
    const { cons } = buildClothConstraints(W, H, 0.3, { structural: 0.0, shear: 0.001, bending: 0.01 });
    const batches = colorConstraints(cons);
    const pos = new Float64Array(3 * N), vel = new Float64Array(3 * N), invMass = new Float64Array(N).fill(1);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = y * W + x; pos[3 * i] = x * 0.3; pos[3 * i + 1] = 0; pos[3 * i + 2] = -y * 0.3; }
    const state = { pos, vel, invMass };
    for (let s = 0; s < 40; s++) {
        const t = s * 0.01;
        const att = [{ p: 0, tx: 0, ty: 0, tz: 0, compliance: 0 }, { p: W - 1, tx: 1.2 + 0.2 * t, ty: 0, tz: 0, compliance: 0 }];   // left fixed, right moving
        attachSubstep(state, cons, batches, att, { dt: 0.016, iterations: 5, gravity: [0, -10, 0] });
    }
    return hashFloats("cloth-pinned", [...state.pos]);
}

// ---- Thermal-coupled cloth: a pinned sheet with a temperature gradient swells and softens as it solves --------
function fpThermal() {
    const W = 6, H = 6, N = W * H;
    const { cons } = buildClothConstraints(W, H, 0.3, { structural: 0.001, shear: 0.002, bending: 0.01 });
    const batches = colorConstraints(cons);
    const pos = new Float64Array(3 * N), vel = new Float64Array(3 * N), invMass = new Float64Array(N);
    const temp = new Float64Array(N);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = y * W + x; pos[3 * i] = x * 0.3; pos[3 * i + 1] = -y * 0.3; pos[3 * i + 2] = 0; invMass[i] = (y === 0) ? 0 : 1; temp[i] = ((x + 2 * y) % 5) * 0.25; }
    const state = { pos, vel, invMass };
    for (let s = 0; s < 40; s++) modulatedSubstep(state, cons, batches, (c) => thermalModulate(c, temp, { expansion: 0.15, soften: 6 }), { dt: 0.016, iterations: 5, gravity: [0, -10, 0] });
    return hashFloats("thermal-cloth", [...state.pos]);
}

// ---- Plastic cloth: pulled past yield then released, hash the permanently dented shape and its base rests ------
function fpPlastic() {
    const W = 6, H = 6, N = W * H;
    const { cons } = buildClothConstraints(W, H, 0.3, { structural: 0.0, shear: 0.001, bending: 0.01 });
    const batches = colorConstraints(cons);
    const pos = new Float64Array(3 * N), vel = new Float64Array(3 * N), invMass = new Float64Array(N);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = y * W + x; pos[3 * i] = x * 0.3; pos[3 * i + 1] = -y * 0.3; pos[3 * i + 2] = 0; invMass[i] = (y === 0) ? 0 : 1; }
    const state = { pos, vel, invMass };
    for (let s = 0; s < 30; s++) plasticSubstep(state, cons, batches, { dt: 0.02, iterations: 5, gravity: [0, -60, 0], yieldStrain: 0.05, creep: 0.4, maxStrain: 1.0 });
    for (let s = 0; s < 30; s++) plasticSubstep(state, cons, batches, { dt: 0.02, iterations: 5, gravity: [0, 0, 0], yieldStrain: 0.05, creep: 0.4, maxStrain: 1.0 });
    return hashFloats("plastic-cloth", [...state.pos, meanRest0(cons)]);
}

// ---- Muscle actuator: a pinned strip crawled by a travelling contraction band, hash the driven motion ---------
function fpMuscle() {
    const W = 8, H = 2, N = W * H;
    const { cons } = buildClothConstraints(W, H, 0.3, { structural: 0.0, shear: 0.001, bending: 0.01 });
    markRowFibers(cons, W, 0);
    const batches = colorConstraints(cons);
    const pos = new Float64Array(3 * N), vel = new Float64Array(3 * N), invMass = new Float64Array(N);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = y * W + x; pos[3 * i] = x * 0.3; pos[3 * i + 1] = -y * 0.3; pos[3 * i + 2] = 0; invMass[i] = (x === 0) ? 0 : 1; }
    const state = { pos, vel, invMass }, act = new Float64Array(N);
    for (let s = 0; s < 48; s++) {
        const band = s % W;                                   // a contraction band that travels along the strip
        for (let i = 0; i < N; i++) act[i] = (i % W === band) ? 1 : 0;
        modulatedSubstep(state, cons, batches, (cs) => muscleModulate(cs, act, { contraction: 0.4 }), { dt: 0.016, iterations: 8, gravity: [0, -2, 0] });
    }
    return hashFloats("muscle-actuator", [...state.pos]);
}

// ---- Fluid-mesh coupling: a fluid blob dropped on a pinned hammock, hash both bodies and the contact count -------
function fpFluid() {
    const W = 8, H = 8, SP = 0.25, N = W * H;
    const { cons } = buildClothConstraints(W, H, SP, { structural: 0.0005, shear: 0.001, bending: 0.01 });
    const batches = colorConstraints(cons);
    const mpos = new Float64Array(3 * N), mvel = new Float64Array(3 * N), minv = new Float64Array(N);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = y * W + x; mpos[3 * i] = x * SP; mpos[3 * i + 1] = 0; mpos[3 * i + 2] = y * SP; const corner = (x === 0 || x === W - 1) && (y === 0 || y === H - 1); minv[i] = corner ? 0 : 1; }
    const nF = 27; const fpos = new Float64Array(3 * nF), fvel = new Float64Array(3 * nF), finv = new Float64Array(nF).fill(1);
    let k = 0; for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) for (let c = 0; c < 3; c++) { fpos[3 * k] = 0.75 + a * 0.16; fpos[3 * k + 1] = 0.35 + b * 0.16; fpos[3 * k + 2] = 0.75 + c * 0.16; k++; }
    const mesh = { pos: mpos, vel: mvel, invMass: minv }, fluid = { pos: fpos, vel: fvel, invMass: finv };
    let contacts = 0;
    for (let s = 0; s < 60; s++) contacts += fluidMeshSubstep(fluid, mesh, cons, batches, { dt: 0.016, iterations: 6, gravity: [0, -6, 0], fluidRadius: 0.09, contactRadius: 0.26 }).contacts;
    return hashFloats("fluid-mesh", [...mesh.pos, ...fluid.pos, contacts]);
}

// ---- PBF fluid: a compressed particle blob relaxed to rest density by the density projection, hash it -----------
function fpPbf() {
    const h = 0.3, nS = 5, n = nS ** 3;
    const pos = new Float64Array(3 * n); let k = 0; for (let a = 0; a < nS; a++) for (let b = 0; b < nS; b++) for (let c = 0; c < nS; c++) { pos[3 * k] = a * 0.11; pos[3 * k + 1] = b * 0.11; pos[3 * k + 2] = c * 0.11; k++; }
    // rest density from a reference lattice at d=0.15
    const ref = new Float64Array(3 * n); let m = 0; for (let a = 0; a < nS; a++) for (let b = 0; b < nS; b++) for (let c = 0; c < nS; c++) { ref[3 * m] = a * 0.15; ref[3 * m + 1] = b * 0.15; ref[3 * m + 2] = c * 0.15; m++; }
    const rn = buildNeighbors(ref, n, h), ci = Math.floor(n / 2); let rho0 = poly6(0, h); for (const j of rn[ci]) { const ex = ref[3 * ci] - ref[3 * j], ey = ref[3 * ci + 1] - ref[3 * j + 1], ez = ref[3 * ci + 2] - ref[3 * j + 2]; rho0 += poly6(ex * ex + ey * ey + ez * ez, h); }
    const invMass = new Float64Array(n).fill(1);
    for (let it = 0; it < 10; it++) { const nbr = buildNeighbors(pos, n, h); pbfProject(pos, n, invMass, nbr, { h, rho0, iterations: 2, eps: 1e-4 }); }
    return hashFloats("pbf-fluid", [...pos]);
}

// ---- PBF-coupled fluid-mesh: the two-way coupling driving a real position-based fluid, hash both bodies ----------
function fpFluidPBF() {
    const W = 8, H = 8, SP = 0.25, N = W * H, h = 0.28;
    const { cons } = buildClothConstraints(W, H, SP, { structural: 0.0005, shear: 0.001, bending: 0.01 });
    const batches = colorConstraints(cons);
    const mpos = new Float64Array(3 * N), mvel = new Float64Array(3 * N), minv = new Float64Array(N);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = y * W + x; mpos[3 * i] = x * SP; mpos[3 * i + 1] = 0; mpos[3 * i + 2] = y * SP; const cn = (x === 0 || x === W - 1) && (y === 0 || y === H - 1); minv[i] = cn ? 0 : 1; }
    const nF = 64; const mkF = () => { const p = new Float64Array(3 * nF); let k = 0; for (let a = 0; a < 4; a++) for (let b = 0; b < 4; b++) for (let c = 0; c < 4; c++) { p[3 * k] = 0.75 + a * 0.14; p[3 * k + 1] = 0.45 + b * 0.14; p[3 * k + 2] = 0.75 + c * 0.14; k++; } return p; };
    const fpos = mkF(), fvel = new Float64Array(3 * nF), finv = new Float64Array(nF).fill(1);
    const nb = buildNeighbors(fpos, nF, h), ci = 32; let rho0 = poly6(0, h); for (const j of nb[ci]) { const ex = fpos[3 * ci] - fpos[3 * j], ey = fpos[3 * ci + 1] - fpos[3 * j + 1], ez = fpos[3 * ci + 2] - fpos[3 * j + 2]; rho0 += poly6(ex * ex + ey * ey + ez * ez, h); }
    const mesh = { pos: mpos, vel: mvel, invMass: minv }, fluid = { pos: fpos, vel: fvel, invMass: finv };
    for (let s = 0; s < 60; s++) fluidMeshSubstep(fluid, mesh, cons, batches, { dt: 0.016, iterations: 6, gravity: [0, -5, 0], contactRadius: 0.26, h, rho0, pbfIterations: 2, pbfEps: 50 });
    return hashFloats("fluid-pbf", [...mesh.pos, ...fluid.pos]);
}

// ---- Volume/pressure: a closed icosphere inflated by the single volume constraint, hash shape and volume ---------
function fpVolume() {
    const sph = generateIcosphere(2);
    const edges = buildEdges(sph.pos, sph.tris, 0.0002), batches = colorConstraints(edges);
    const restVol = enclosedVolume(sph.pos, sph.tris);
    const state = { pos: Float64Array.from(sph.pos), vel: new Float64Array(sph.n * 3), invMass: new Float64Array(sph.n).fill(1) };
    for (let s = 0; s < 60; s++) volumeSubstep(state, edges, batches, sph.tris, restVol, { dt: 0.016, iterations: 8, inflation: 1.6, gravity: [0, -2, 0] });
    return hashFloats("volume-balloon", [...state.pos, enclosedVolume(state.pos, sph.tris)]);
}

// ---- Coulomb friction: particles on slopes bracketing the friction angle -- some stick, some slide -------------
function fpFriction() {
    const mu = 0.5, slopes = [0.2, 0.4, 0.45, 0.55, 0.7, 1.0];   // straddle mu
    const nF = slopes.length;
    const pos = new Float64Array(3 * nF), vel = new Float64Array(3 * nF), invMass = new Float64Array(nF).fill(1);
    // one particle per slope, each on its own plane, advanced independently and concatenated into the hash
    const outs = [];
    for (let s = 0; s < nF; s++) {
        const n = slopeNormal(slopes[s]);
        const st = { pos: new Float64Array(3), vel: new Float64Array(3), invMass: Float64Array.from([1]) };
        for (let k = 0; k < 90; k++) planeFrictionSubstep(st, n, 0, mu, { dt: 0.016, gravity: [0, -10, 0] });
        outs.push(st.pos[0], st.pos[1], st.pos[2]);
    }
    return hashFloats("friction-slope", outs);
}

// ---- Frictional pile: a column of grains dropped onto a frictional floor -- chaotic yet bit-reproducible ---------
function fpFrictionPile() {
    const cols = 3, rows = 6, n = cols * cols * rows, R = 0.1;
    const pos = new Float64Array(3 * n), vel = new Float64Array(3 * n), invMass = new Float64Array(n).fill(1);
    let k = 0; for (let y = 0; y < rows; y++) for (let a = 0; a < cols; a++) for (let b = 0; b < cols; b++) { pos[3 * k] = (a - 1) * 0.18; pos[3 * k + 1] = R + 0.05 + y * 0.19; pos[3 * k + 2] = (b - 1) * 0.18; k++; }
    const state = { pos, vel, invMass };
    for (let s = 0; s < 140; s++) frictionalPileSubstep(state, [0, 1, 0], 0, 0.7, { dt: 0.016, iterations: 5, gravity: [0, -10, 0], radius: R });
    return hashFloats("friction-pile", [...state.pos]);
}

// ---- Frictional fluid drag: a fluid shoved sideways over a rigid frictional mesh, hash the slowed fluid ----------
function fpFluidDrag() {
    const W = 14, H = 10, SP = 0.18, N = W * H;
    const { cons } = buildClothConstraints(W, H, SP, { structural: 0.001, shear: 0.002, bending: 0.01 });
    const batches = colorConstraints(cons);
    const mpos = new Float64Array(3 * N), mvel = new Float64Array(3 * N), minv = new Float64Array(N);   // all pinned = rigid surface
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = y * W + x; mpos[3 * i] = x * SP; mpos[3 * i + 1] = 0; mpos[3 * i + 2] = y * SP; }
    const nF = 36; const fpos = new Float64Array(3 * nF), fvel = new Float64Array(3 * nF), finv = new Float64Array(nF).fill(1);
    let k = 0; for (let a = 0; a < 6; a++) for (let b = 0; b < 6; b++) { fpos[3 * k] = 0.4 + a * 0.12; fpos[3 * k + 1] = 0.2; fpos[3 * k + 2] = 0.6 + b * 0.12; fvel[3 * k] = 1.5; k++; }
    const mesh = { pos: mpos, vel: mvel, invMass: minv }, fluid = { pos: fpos, vel: fvel, invMass: finv };
    for (let s = 0; s < 45; s++) fluidMeshSubstep(fluid, mesh, cons, batches, { dt: 0.016, iterations: 6, gravity: [0, -6, 0], contactRadius: 0.2, contactMu: 0.9 });
    return hashFloats("fluid-drag", [...fluid.pos, ...fluid.vel]);
}

// ---- Anisotropic cloth: a stiff-warp / soft-weft sheet pulled along its weft, hash the stretched shape -----------
function fpAnisotropy() {
    const W = 10, H = 10, SP = 0.2;
    const cons = buildAnisotropicCloth(W, H, SP, 1e-5, 1e-3), batches = colorConstraints(cons);
    const N = W * H, pos = new Float64Array(3 * N), vel = new Float64Array(3 * N), invMass = new Float64Array(N).fill(1);
    for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) { const i = z * W + x; pos[3 * i] = x * SP; pos[3 * i + 1] = 0; pos[3 * i + 2] = z * SP; if (z === 0) invMass[i] = 0; }
    const state = { pos, vel, invMass };
    for (let s = 0; s < 70; s++) anisotropicSubstep(state, cons, batches, { dt: 0.016, iterations: 14, force: [0, 0, 6] });
    return hashFloats("cloth-anisotropy", [...state.pos]);
}

// ---- PBF polish: s_corr repulsion on a pair plus an XSPH-smoothed velocity field, hash both -------------------
function fpPbfPolish() {
    const h = 0.3;
    // s_corr repulsion at neutral density
    const rho0 = poly6(0, h) + poly6(0.14 * 0.14, h);
    const pp = Float64Array.from([0, 0, 0, 0.14, 0, 0]), pim = Float64Array.from([1, 1]);
    pbfProject(pp, 2, pim, buildNeighbors(pp, 2, h), { h, rho0, iterations: 1, eps: 1e-4, sCorrK: 0.02, sCorrDq: 0.2 });
    // XSPH smoothing of a noisy field on a small blob
    const nS = 4, n = nS ** 3, pos = new Float64Array(3 * n), vel = new Float64Array(3 * n);
    let k = 0; for (let a = 0; a < nS; a++) for (let b = 0; b < nS; b++) for (let c = 0; c < nS; c++) { pos[3 * k] = a * 0.16; pos[3 * k + 1] = b * 0.16; pos[3 * k + 2] = c * 0.16; vel[3 * k] = (k % 3) - 1; k++; }
    const nbr = buildNeighbors(pos, n, h);
    for (let it = 0; it < 6; it++) applyXSPH(pos, vel, n, nbr, h, 0.3);
    return hashFloats("pbf-polish", [...pp, ...vel]);
}

// ---- Sampled field: particles advected through a fixed external swirl field, hash their paths -------------------
function fpSampledField() {
    const nx = 6, ny = 6, nz = 6, ox = -1, oy = -1, oz = -1, sp = 0.5;
    const grid = buildVectorGrid(nx, ny, nz, ox, oy, oz, sp, (x, y, z) => [-z, 0.1, x]);
    const field = { grid, dims: { nx, ny, nz, ox, oy, oz, sp } };
    const nP = 8, pos = new Float64Array(3 * nP), vel = new Float64Array(3 * nP), invMass = new Float64Array(nP).fill(1);
    for (let i = 0; i < nP; i++) { pos[3 * i] = -0.7 + i * 0.18; pos[3 * i + 1] = (i % 3) * 0.1; pos[3 * i + 2] = 0.2 - (i % 2) * 0.3; }
    const state = { pos, vel, invMass };
    for (let s = 0; s < 50; s++) sampledFieldSubstep(state, field, { dt: 0.016, strength: 1.5, damping: 0.01 });
    return hashFloats("sampled-field", [...state.pos]);
}

// ---- Wind cloth: a flag pinned at its pole flapping in a fixed sampled wind, hash the flapping shape -----------
function fpWindCloth() {
    const W = 12, H = 8, SP = 0.2, N = W * H;
    const { cons } = buildClothConstraints(W, H, SP, { structural: 0.0, shear: 0.0005, bending: 0.002 });
    const batches = colorConstraints(cons);
    const g = { nx: 8, ny: 8, nz: 8, ox: -1, oy: -2, oz: -1, sp: 0.6 };
    const field = { grid: buildVectorGrid(g.nx, g.ny, g.nz, g.ox, g.oy, g.oz, g.sp, () => [0, 0, 1]), dims: g };
    const pos = new Float64Array(3 * N), vel = new Float64Array(3 * N), invMass = new Float64Array(N).fill(1);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = y * W + x; pos[3 * i] = x * SP; pos[3 * i + 1] = -y * SP; if (x === 0) invMass[i] = 0; }
    const state = { pos, vel, invMass };
    for (let s = 0; s < 80; s++) windClothSubstep(state, cons, batches, field, { dt: 0.016, iterations: 12, gravity: [0, -2, 0], windStrength: 5 });
    return hashFloats("wind-cloth", [...state.pos]);
}

// ---- Muscle belly: a contractile closed mesh firing under volume conservation, hash the bulged shape -----------
function fpMuscleBelly() {
    const belly = buildMuscleBelly(2, 2.2), batches = colorConstraints(belly.edges);
    const restVol = enclosedVolume(belly.pos, belly.tris);
    const pos = Float64Array.from(belly.pos), state = { pos, vel: new Float64Array(belly.n * 3), invMass: new Float64Array(belly.n).fill(1) };
    contractMuscle(belly.edges, 1.0, 0.35);
    for (let s = 0; s < 50; s++) muscleVolumeSubstep(state, belly.edges, batches, belly.tris, restVol, { dt: 0.016, iterations: 10, useVolume: true });
    return hashFloats("muscle-belly", [...pos, enclosedVolume(pos, belly.tris)]);
}

// ---- Thermal diffusion: strict Brownian jitter (strict-libm Gaussian) on centres, hash the wandered positions ----
function fpThermalDiffusion() {
    const scen = SCENARIOS.bacterium, rnd = lcg(20260715), N = 7;
    const centres = []; for (let i = 0; i < N; i++) centres.push({ x: (i - 3) * 0.12, y: ((i % 3) - 1) * 0.12, z: ((i % 2) - 0.5) * 0.24 });
    const D = warmthOfKelvin(320, scen), box = 1.4;
    for (let s = 0; s < 200; s++) { strictJitterCentres(centres, { D, dt: 1 / 60, rnd }); for (const b of centres) for (const k of ["x", "y", "z"]) { if (b[k] > box) b[k] = 2 * box - b[k]; else if (b[k] < -box) b[k] = -2 * box - b[k]; } }
    const flat = []; for (const b of centres) { flat.push(b.x, b.y, b.z); }
    return hashFloats("thermal-diffusion", flat);
}

// ---- Centrifuge: a mixture spun to separation, hash the banded radial positions -------------------------------
function fpCentrifuge() {
    const spec = [{ a: 0.6, rho: 1.5 }, { a: 0.9, rho: 2.0 }, { a: 1.3, rho: 2.6 }], parts = [];
    for (let s = 0; s < 3; s++) for (let i = 0; i < 12; i++) parts.push({ r: 0.08 + 0.002 * i, a: spec[s].a, rho: spec[s].rho, species: s });
    for (let s = 0; s < 300; s++) centrifugeStep(parts, { omega: 0.6, dt: 1 / 60, rhoF: 1, eta: 1, rMax: 1 });
    return hashFloats("centrifuge", parts.map((p) => p.r));
}

// ---- Gyroscope: spin it under gravity torque, hash the precessed angular-momentum vector -----------------------
function fpGyroscope() {
    const g = makeGyro({ omega: 40, I: 1, axis: [0.48, 0.88, 0] });
    for (let s = 0; s < 300; s++) gyroStep(g, { tipTorque: 12, dt: 1 / 60 });
    return hashFloats("gyroscope", g.L);
}

// ---- Pendulum wave: tuned oscillators stepped part way through a cycle, hash the scrambled angles -------------
function fpPendulumWave() {
    const st = makePendulumWave({ N: 15, k: 20, cycle: 60, amp: 0.3, dt: 1 / 60 });
    for (let s = 0; s < 800; s++) pendulumStep(st);
    return hashFloats("pendulum-wave", st.pend.map((p) => p.theta));
}

// ---- Orbit: a Kepler two-body ellipse run part way round, hash the body positions and velocities ------------
function fpOrbit() {
    const st = keplerPair({ G: 1, m1: 1, m2: 0.001, a: 1, e: 0.4 });
    for (let s = 0; s < 900; s++) orbitStep(st, 0.002);
    return hashFloats("orbit", st.bodies.flatMap((b) => [...b.r, ...b.v]));
}

// ---- Vibrations: a chain set in a normal mode and stepped, hash the displacements ----------------------------
function fpVibrations() {
    const st = makeChain({ N: 12, k: 1, m: 1 }); setMode(st, 3, 0.3);
    for (let s = 0; s < 600; s++) chainStep(st, 1 / 240);
    return hashFloats("vibrations", st.x);
}

// ---- FFT: the spectrum of a fixed mixed-tone signal, hashed -- the strict spectral tool -----------------------
function fpFft() {
    const N = 256, sig = new Float64Array(N);
    for (let i = 0; i < N; i++) sig[i] = strictSinFP(2 * Math.PI * 7 * i / N) + 0.5 * strictSinFP(2 * Math.PI * 19 * i / N);
    return hashFloats("fft", Array.from(spectrum(sig)));
}

// ---- Zeta: the Basel bridge and neighbours, hashed -- pi out of a sum over the integers ----------------------
function fpZeta() {
    return hashFloats("zeta", [zeta(2), zeta(3), zeta(4), zeta(6), zeta(8), piFromZeta()]);
}

// ---- Zeta on the critical line: magnitudes and the first located zero, hashed -------------------------------
function fpZetaCritical() {
    const ts = [10, 14.134725, 17, 21.02204, 25.010858], vals = ts.map((t) => zetaMag(t));
    vals.push(refineZero(13.5, 15));
    return hashFloats("zeta-critical", vals);
}

// ---- Figure-eight: the three-body choreography run part way round, hash positions and velocities ------------
function fpFigureEight() {
    const st = makeFigureEight(); for (let s = 0; s < 900; s++) orbitStepF(st, 0.0005);
    return hashFloats("figure-eight", st.bodies.flatMap((b) => [...b.r, ...b.v]));
}

// ---- Lockstep: a fixed input timeline stepped deterministically, hash the final state ----------------------
function fpLockstep() {
    const bodies = [{ m: 1, r: [-1, 0, 0], v: [0, -0.3, 0] }, { m: 1, r: [1, 0, 0], v: [0, 0.3, 0] }, { m: 0.5, r: [0, 1.2, 0], v: [0.4, 0, 0] }];
    const T = []; for (let f = 0; f < 300; f++) { const inp = []; if (f === 50) inp.push({ body: 0, dvx: 0.05 }); if (f === 150) inp.push({ body: 1, dvy: 0.05 }); T.push(inp); }
    const s = makeLockSession(bodies, { dt: 0.01 }); for (let f = 0; f < 300; f++) lockStep(s, T[f]);
    return hashFloats("lockstep", s.sys.bodies.flatMap((b) => [...b.r, ...b.v]));
}

// ---- Black hole: Paczynski-Wiita orbit, hash the trajectory + conserved energy ----------------------------
function fpBlackHole() {
    const G = 1, M = 1, c = 1, rs = bhRs(M, G, c);
    const p = bhMake(12, 1.04 * bhVc(12, M, G, rs));
    for (let i = 0; i < 8000 && !p.captured; i++) bhStep(p, 0.005, M, G, rs);
    return hashFloats("black-hole", [rs, p.r[0], p.r[1], p.v[0], p.v[1], p.rMin, p.rMax, bhE(p, M, G, rs)]);
}

// ---- Solar system: real orbital elements, colinear (trig-free) start, hash the trajectory ------------------
function fpSolarSystem() {
    const bodies = [{ m: 1, r: [0, 0, 0], v: [0, 0, 0] }];
    for (const b of SS_ELEMENTS.slice(1, 5)) bodies.push(ssPlanet(b.a, b.e, b.m, 0));   // theta 0 -> cos/sin exact, no libm drift
    const sys = ssMakeSystem(bodies, { G: 1 });
    for (let i = 0; i < 3000; i++) ssStep(sys, 0.001);
    return hashFloats("solar-system", sys.bodies.flatMap((b) => [...b.r, ...b.v]));
}

// ---- Neutron star: documented specs + a plunging orbit that impacts the surface -------------------------
function fpNeutronStar() {
    const M = 1.4, R = 11, surf = nsSurf(M, R);
    const p = nsMake(7, 0.7); for (let i = 0; i < 20000 && !p.impacted; i++) nsStep(p, 0.005, surf);
    return hashFloats("neutron-star", [nsRs(M), nsC(M, R), nsIsco(M), nsEsc(M, R), p.r[0], p.r[1], p.rMin, p.impacted ? 1 : 0]);
}

// ---- Plasma: a charged particle trapped in a magnetic bottle (Boris pusher, pure arithmetic) ------
function fpPlasma() {
    const p = plMake(1.0, 0.4); for (let i = 0; i < 4000; i++) plStep(p, 0.02, 1, 5);
    return hashFloats("plasma", [p.r[0], p.r[1], p.r[2], p.v[0], p.v[1], p.v[2], p.zMax, p.reflections]);
}

// ---- Impact: the vacuum gravitational-focusing approach (sqrt-only; drag/crater stay gated-only) ---
function fpImpact() {
    const p = imMake(-40, 1.5, 1, 0); for (let i = 0; i < 6000 && !p.hit && !p.missed; i++) imStep(p, 0.01, 1, 1);
    return hashFloats("impact", [p.r[0], p.r[1], p.v[0], p.v[1], p.rMin, p.hit ? 1 : 0, p.missed ? 1 : 0]);
}

// ---- Render: a deterministic raytraced framebuffer (sqrt-only -> peers' slices are bit-identical) --
function fpRender() {
    return hashFloats("render", Array.from(rnWhole(32, 24)));
}

// ---- 4D ground truth: the exact trajectory field off the arithmetic-only scene, projected through the pinhole camera.
// Only + - * / sqrt feed it, all correctly rounded under IEEE-754, so the emitted 3D tracks, 2D observations and depth are
// the same to the bit on every architecture -- a benchmark that is itself part of the cross-arch guarantee.
function fpTraceTruth() {
    const scene = makeSceneArith(2024, { nPoints: 24, nFrames: 12 });
    const occ = traceOccluders(2024, 12);
    const gt = traceGroundTruth(scene, traceCam, occ);
    const rend = traceRender(scene, occ, traceCam);
    const v = [];
    for (const tr of gt.tracks3d) for (const q of tr) { v.push(q[0], q[1], q[2]); }
    for (const tr of gt.obs2d) for (const o of tr) { v.push(o[0], o[1]); }
    for (const tr of gt.depth) for (const d of tr) { v.push(d); }
    for (let p = 0; p < scene.nPoints; p++) for (let f = 0; f < scene.nFrames; f++) v.push(rend.renderedVisible[p][f] ? 1 : 0);  // the true visibility -- sqrt ray-sphere + z-buffer, all cross-arch
    return hashFloats("trace-truth", v);
}

// A pulsar is a clock: the arrival times of a spinning-down neutron star's pulses. Phase phi(t)=f0*t+0.5*fdot*t*t; pulse n
// arrives at phi=n, solved with a quadratic -- arithmetic and one sqrt, both correctly rounded, so the pulse train is the
// same to the bit on every architecture. The most precise clock in nature, ticking identically across the fleet.
function fpPulsar() {
    return hashFloats("pulsar", pulseArrivalTimes(30, -1e-3, 200));
}

// Anticipating a threat: quadratic motion prediction and firing-lead intercepts on a fixed arithmetic scenario. The lead
// is a quadratic solve with one sqrt, the prediction is pure arithmetic, so the whole thing is bit-identical cross-arch.
function fpPredict() {
    const p0 = [0, 0], v0 = [3, 1], acc = [-0.4, 0.6], dt = 0.5, v = [];
    for (let t = 1; t < 6; t += 0.5) { const a = predThreatAt(t - 2 * dt, p0, v0, acc), b = predThreatAt(t - dt, p0, v0, acc), c = predThreatAt(t, p0, v0, acc); const q = predQuad(a, b, c, dt, dt); v.push(q[0], q[1]); }
    for (const cfg of [[[0, 0], [2, 0]], [[3, -4], [-1, 2]], [[-5, 2], [1.5, 1]], [[6, 6], [0, -3]]]) { const sol = predLead([-12, -9], cfg[0], cfg[1], 6); if (sol) v.push(sol.t, sol.aim[0], sol.aim[1]); }
    return hashFloats("predict", v);
}

// ---- Agent arena: a learned bandit ranked against baselines over deterministic episodes (pure arithmetic) ----
function fpArena() {
    const r = agRunLadder(777, 40);
    const totals = ["random", "greedy", "reflex", "learned"].map((k) => agSum(r.arms[k]));
    const q = ["rush", "flank", "hold"].map((k) => r.Q[k]);
    return hashFloats("agent-arena", [...totals, ...q, ...r.arms.learned.slice(0, 8)]);
}

// ---- Agent per-tick flow: the integer trajectory of the agent following the brain's re-solved field (hypot-invariant) ----
function fpArenaPerTick() {
    const t = agPerTick(2024);
    return hashFloats("agent-pertick", [t.reward, t.steps, t.caught, t.reached, ...t.path]);
}

// ---- Fleet agent: a learned scheduler ranked by makespan against naive ones over a deterministic fleet (pure arithmetic) ----
function fpFleet() {
    const r = flLadder(777);
    const ms = [r.random.makespan, r.roundRobin.makespan, r.greedy.makespan, r.learned.makespan];
    const est = r.est.flat();
    return hashFloats("fleet-agent", [...ms, ...est, ...r.learned.assign.slice(0, 12)]);
}

export function computeFingerprint() {
    const subsystems = [
        { name: "strict-libm", hash: fpStrictLibm() },
        { name: "md-forcefield", hash: fpMD() },
        { name: "obb-collision", hash: fpCollision() },
        { name: "ewald-electrostatics", hash: fpEwald() },
        { name: "prime-transport", hash: fpPrimeTransport() },
        { name: "astar-pathfinding", hash: fpAstar() },
        { name: "xpbd-cloth", hash: fpXpbd() },
        { name: "tf-advect", hash: fpTf() },
        { name: "cloth-collision", hash: fpCloth() },
        { name: "xpbd-damped", hash: fpXpbdDamped() },
        { name: "cloth-tear", hash: fpTear() },
        { name: "cloth-pinned", hash: fpPinned() },
        { name: "thermal-cloth", hash: fpThermal() },
        { name: "plastic-cloth", hash: fpPlastic() },
        { name: "muscle-actuator", hash: fpMuscle() },
        { name: "fluid-mesh", hash: fpFluid() },
        { name: "pbf-fluid", hash: fpPbf() },
        { name: "fluid-pbf", hash: fpFluidPBF() },
        { name: "volume-balloon", hash: fpVolume() },
        { name: "friction-slope", hash: fpFriction() },
        { name: "friction-pile", hash: fpFrictionPile() },
        { name: "fluid-drag", hash: fpFluidDrag() },
        { name: "cloth-anisotropy", hash: fpAnisotropy() },
        { name: "pbf-polish", hash: fpPbfPolish() },
        { name: "sampled-field", hash: fpSampledField() },
        { name: "wind-cloth", hash: fpWindCloth() },
        { name: "muscle-belly", hash: fpMuscleBelly() },
        { name: "thermal-diffusion", hash: fpThermalDiffusion() },
        { name: "centrifuge", hash: fpCentrifuge() },
        { name: "gyroscope", hash: fpGyroscope() },
        { name: "pendulum-wave", hash: fpPendulumWave() },
        { name: "orbit", hash: fpOrbit() },
        { name: "vibrations", hash: fpVibrations() },
        { name: "fft", hash: fpFft() },
        { name: "zeta", hash: fpZeta() },
        { name: "zeta-critical", hash: fpZetaCritical() },
        { name: "figure-eight", hash: fpFigureEight() },
        { name: "lockstep", hash: fpLockstep() },
        { name: "black-hole", hash: fpBlackHole() },
        { name: "solar-system", hash: fpSolarSystem() },
        { name: "neutron-star", hash: fpNeutronStar() },
        { name: "plasma", hash: fpPlasma() },
        { name: "impact", hash: fpImpact() },
        { name: "render", hash: fpRender() },
        { name: "agent-arena", hash: fpArena() },
        { name: "agent-pertick", hash: fpArenaPerTick() },
        { name: "fleet-agent", hash: fpFleet() },
        { name: "trace-truth", hash: fpTraceTruth() },
        { name: "pulsar", hash: fpPulsar() },
        { name: "predict", hash: fpPredict() },
    ];
    return { subsystems, master: masterOf(subsystems) };
}

export function masterOf(subsystems) {
    let s = "";
    for (const x of subsystems) s += x.name + "=" + x.hash + ";";
    return sha256Hex(new TextEncoder().encode(s));
}

// CLI -- Node only. node:url is imported lazily HERE, never at top level, so this module stays loadable in the browser
// (where computeFingerprint is used by case-study, verify, predictions). typeof process short-circuits before the import.
if (typeof process !== "undefined" && process.argv) {
    const { pathToFileURL } = await import("node:url");
    if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
        const { subsystems, master } = computeFingerprint();
        console.log("SweK Engine cross-architecture fingerprint\n");
        for (const s of subsystems) console.log("  " + s.name.padEnd(22) + s.hash.slice(0, 32) + "...");
        console.log("\n  MASTER  " + master);
        console.log("\n  Run this on each machine and compare the MASTER line. Identical master = whole-engine bit-identity.");
    }
}
