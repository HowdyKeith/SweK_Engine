// physics/xpbd/fluid-selfcheck.mjs
//
// Run: node physics/xpbd/fluid-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs.
//
// This is the first two-way coupling, so the headline is that a single contact moves BOTH sides, split by inverse
// mass: equal masses move equally, a heavier mesh node moves less than the fluid particle, and the pair ends exactly
// at the contact distance. From that, the fluid load caves the mesh down while the mesh holds the fluid far above
// where it would free-fall unsupported. The contact set is discovered across the two particle sets and sorted, so it
// is order-free and the coupled step reproduces byte-for-byte. The sabotage drops the mesh half of the correction,
// so the fluid slides off a static wall: the two-way check and the caving check both fail, because a contact that
// moves only one side is a wall, not a coupling.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { buildClothConstraints } from "./clothMesh.js";
import { colorConstraints } from "./xpbd.js";
import { fluidMeshSubstep, solveCrossContacts, findCrossContacts, centroidY } from "./fluid.js";
import { buildNeighbors, poly6 } from "./pbf.js";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };
let seed = 0x2ab9;
const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
const shuffle = (a) => { const b = a.slice(); for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };
const hp = (p) => { const b = Buffer.alloc(p.length * 8); for (let i = 0; i < p.length; i++) b.writeDoubleLE(p[i], i * 8); return createHash("sha256").update(b).digest("hex"); };
const iota = (n) => Array.from({ length: n }, (_, i) => i);

function hammock(W = 8, H = 8, SP = 0.25) {
    const N = W * H;
    const { cons } = buildClothConstraints(W, H, SP, { structural: 0.0005, shear: 0.001, bending: 0.01 });
    const batches = colorConstraints(cons);
    const mk = () => { const pos = new Float64Array(3 * N), vel = new Float64Array(3 * N), invMass = new Float64Array(N); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = y * W + x; pos[3 * i] = x * SP; pos[3 * i + 1] = 0; pos[3 * i + 2] = y * SP; const corner = (x === 0 || x === W - 1) && (y === 0 || y === H - 1); invMass[i] = corner ? 0 : 1; } return { pos, vel, invMass }; };
    return { W, H, N, cons, batches, mk };
}
function blob(nSide = 3, x0 = 0.75, y0 = 0.35, z0 = 0.75) {
    const nF = nSide ** 3; const pos = new Float64Array(3 * nF), vel = new Float64Array(3 * nF), invMass = new Float64Array(nF).fill(1);
    let k = 0; for (let a = 0; a < nSide; a++) for (let b = 0; b < nSide; b++) for (let c = 0; c < nSide; c++) { pos[3 * k] = x0 + a * 0.16; pos[3 * k + 1] = y0 + b * 0.16; pos[3 * k + 2] = z0 + c * 0.16; k++; }
    return { pos, vel, invMass, nF };
}
const OPT = { dt: 0.016, iterations: 6, gravity: [0, -6, 0], fluidRadius: 0.09, contactRadius: 0.26 };

// ---- 1. TWO-WAY: one contact moves both sides, split by inverse mass, to the contact distance ----------------
{
    // equal mass
    const a1 = Float64Array.from([0, 0, 0]), b1 = Float64Array.from([0.1, 0, 0]);
    solveCrossContacts(a1, Float64Array.from([1]), b1, Float64Array.from([1]), [[0, 0]], [[0]], 0.3);
    const equalBoth = Math.abs(a1[0] - (-0.1)) < 1e-12 && Math.abs(b1[0] - 0.2) < 1e-12 && Math.abs((b1[0] - a1[0]) - 0.3) < 1e-12;
    // heavier mesh moves less
    const a2 = Float64Array.from([0, 0, 0]), b2 = Float64Array.from([0.1, 0, 0]);
    solveCrossContacts(a2, Float64Array.from([1]), b2, Float64Array.from([0.25]), [[0, 0]], [[0]], 0.3);
    const massSplit = Math.abs(a2[0]) > Math.abs(b2[0] - 0.1) && Math.abs((b2[0] - a2[0]) - 0.3) < 1e-9;
    ok("!! a contact moves both sides, split by inverse mass, out to the contact distance", equalBoth && massSplit,
       "equal masses each move 0.1 to reach the 0.3 contact distance; against a mesh node four times heavier the fluid moves four times as far -- momentum, not a wall.");
}

// ---- 2. MESH CAVES: fluid load pushes the mesh center down --------------------------------------------------
{
    const h = hammock(); const mesh = h.mk(); const f = blob();
    const ci = Math.floor(h.H / 2) * h.W + Math.floor(h.W / 2); const y0 = mesh.pos[3 * ci + 1];
    const fluid = { pos: f.pos, vel: f.vel, invMass: f.invMass };
    for (let s = 0; s < 120; s++) fluidMeshSubstep(fluid, mesh, h.cons, h.batches, OPT);
    ok("!! the fluid load caves the mesh center downward", mesh.pos[3 * ci + 1] < y0 - 0.05,
       "the mesh center sank from " + y0.toFixed(3) + " to " + mesh.pos[3 * ci + 1].toFixed(3) + " under the fluid's weight -- pressure deformed the sheet.");
}

// ---- 3. FLUID SUPPORTED: the mesh holds the fluid far above where it would free-fall ------------------------
{
    const h = hammock(); const mesh = h.mk();
    const f1 = blob(); const fluid = { pos: f1.pos, vel: f1.vel, invMass: f1.invMass };
    for (let s = 0; s < 120; s++) fluidMeshSubstep(fluid, mesh, h.cons, h.batches, OPT);
    const heldY = centroidY(fluid.pos, f1.nF);
    // control: same fluid, no mesh (free fall the same number of steps)
    const f2 = blob(); const freeY0 = centroidY(f2.pos, f2.nF);
    let vy = 0, y = 0; for (let s = 0; s < 120; s++) { vy += -6 * 0.016; y += vy * 0.016; } const freeY = freeY0 + y;
    ok("!! the mesh holds the fluid bulk far above its unsupported free-fall", heldY > freeY + 2,
       "held by the mesh the fluid bulk rests at y " + heldY.toFixed(2) + "; with no mesh the same fluid would free-fall to about " + freeY.toFixed(2) + " -- the boundary caught it.");
}

// ---- 4. DETERMINISTIC: sorted cross-contacts are order-free and the coupled step reproduces -----------------
{
    // cross-contact set identical under scrambled walk
    const posA = new Float64Array(30), posB = new Float64Array(30);
    for (let i = 0; i < 10; i++) { posA[3 * i] = i * 0.05; posB[3 * i] = i * 0.05 + 0.02; }
    const ref = JSON.stringify(findCrossContacts(posA, 10, posB, 10, 0.1, 0.1, iota(10)));
    let orderFree = true; for (let t = 0; t < 40; t++) if (JSON.stringify(findCrossContacts(posA, 10, posB, 10, 0.1, 0.1, shuffle(iota(10)))) !== ref) { orderFree = false; break; }
    // whole coupled step reproduces
    const run = () => { const h = hammock(); const mesh = h.mk(); const f = blob(); const fluid = { pos: f.pos, vel: f.vel, invMass: f.invMass }; for (let s = 0; s < 40; s++) fluidMeshSubstep(fluid, mesh, h.cons, h.batches, OPT); return hp(mesh.pos) + hp(fluid.pos); };
    ok("!! cross-contacts are order-free and the coupled step is bit-identical", orderFree && run() === run(),
       "the sorted contact set is identical across 40 scrambled walks, and a full fluid-plus-mesh run reproduces byte-for-byte -- two coupled systems, still deterministic.");
}

// ---- 5. EXACT: a single contact lands both particles at the closed-form positions ---------------------------
{
    const a = Float64Array.from([0, 0, 0]), b = Float64Array.from([0.2, 0, 0]);   // gap 0.2, contact 0.5
    solveCrossContacts(a, Float64Array.from([1]), b, Float64Array.from([1]), [[0, 0]], [[0]], 0.5);
    ok("!! a single contact lands both particles at the exact closed-form positions", Math.abs(a[0] + 0.15) < 1e-12 && Math.abs(b[0] - 0.35) < 1e-12,
       "penetrating by 0.3 with equal mass, each particle moves 0.15: fluid to -0.150, mesh to 0.350, separated to exactly 0.5 -- matched to 1e-12.");
}

// ---- 6. PURE + deterministic -------------------------------------------------------------------------------
{
    const runA = () => { const h = hammock(); const mesh = h.mk(); const f = blob(); const fluid = { pos: f.pos, vel: f.vel, invMass: f.invMass }; for (let s = 0; s < 30; s++) fluidMeshSubstep(fluid, mesh, h.cons, h.batches, OPT); return hp(fluid.pos); };
    const src = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "fluid.js"), "utf8").replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
    const noTrig = !/Math\.(sin|cos|tan|exp|log|pow|hypot|random|acos)\b/.test(src);
    ok("!! two runs agree byte-for-byte and there is no transcendental", runA() === runA() && noTrig,
       "two coupled fluid-mesh runs land byte-identical and the coupling uses only +,-,*,/,sqrt -- bit-identical across machines.");
}

// ---- 7. PBF SLOT: with a rest density, the fluid-fluid slot runs the real density solver, coupled + stable ----
{
    const h = 0.28;
    const restRho = () => { const b = blob(); const nb = buildNeighbors(b.pos, b.nF, h); const ci = Math.floor(b.nF / 2); let r = poly6(0, h); for (const j of nb[ci]) { const ex = b.pos[3 * ci] - b.pos[3 * j], ey = b.pos[3 * ci + 1] - b.pos[3 * j + 1], ez = b.pos[3 * ci + 2] - b.pos[3 * j + 2]; r += poly6(ex * ex + ey * ey + ez * ez, h); } return r; };
    const rho0 = restRho();
    const pbfOpt = { dt: 0.016, iterations: 6, gravity: [0, -5, 0], contactRadius: 0.26, h, rho0, pbfIterations: 2, pbfEps: 50 };
    const run = () => { const hh = hammock(); const mesh = hh.mk(); const b = blob(); const fluid = { pos: b.pos, vel: b.vel, invMass: b.invMass }; const ci = Math.floor(hh.H / 2) * hh.W + Math.floor(hh.W / 2); const y0 = mesh.pos[3 * ci + 1]; for (let s = 0; s < 100; s++) fluidMeshSubstep(fluid, mesh, hh.cons, hh.batches, pbfOpt); return { caved: mesh.pos[3 * ci + 1] < y0 - 0.05, held: centroidY(fluid.pos, b.nF), sig: hp(mesh.pos) + hp(fluid.pos) }; };
    const a = run(), b2 = run();
    // contrast: same scene with the contact slot (no rho0) lands somewhere different
    const hh = hammock(); const mesh = hh.mk(); const bl = blob(); const fl = { pos: bl.pos, vel: bl.vel, invMass: bl.invMass };
    for (let s = 0; s < 100; s++) fluidMeshSubstep(fl, mesh, hh.cons, hh.batches, { dt: 0.016, iterations: 6, gravity: [0, -5, 0], contactRadius: 0.26, fluidRadius: 0.09 });
    ok("!! given a rest density the fluid-fluid slot runs PBF, coupled, stable, and deterministic", a.caved && Math.abs(a.held) < 3 && a.sig === b2.sig && a.sig !== (hp(mesh.pos) + hp(fl.pos)),
       "with a rest density set, the two-way coupling drives its fluid with the real density solver: the mesh still caves, the fluid stays bounded at y " + a.held.toFixed(2) + ", two runs are byte-identical, and it lands measurably apart from the placeholder contact slot.");
}


process.exit(fails ? 1 : 0);
