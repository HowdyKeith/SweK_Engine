// physics/xpbd/cloth-selfcheck.mjs
//
// Run: node physics/xpbd/cloth-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs.
//
// The extensions have to clear three bars. Bending and shear must be real distance constraints that ride the v2659
// solver unchanged, which is checked by turning collisions off and demanding clothSubstep reproduce xpbdSubstep
// byte-for-byte. The whole solve must stay order-free: shuffling within-color order AND scrambling the order the
// collision pass walks the particles must leave the result byte-identical. And self-collision must be deterministic
// and one-directional: the discovered pair set is a pure function of positions (because it is sorted before it feeds
// coloring), overlapping non-bonded particles get pushed apart, and particles already far enough apart are never
// pulled together. The sabotage removes the sort in the collision discovery, and the collision-order check fails.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { buildClothConstraints, countKinds } from "./clothMesh.js";
import { colorConstraints, xpbdSubstep, cloneState } from "./xpbd.js";
import { clothSubstep } from "./clothStep.js";
import { findCollisionPairs } from "./selfCollide.js";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };
let seed = 0x51c7;
const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
const shuffle = (a) => { const b = a.slice(); for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };
const hashPos = (p) => { const b = Buffer.alloc(p.length * 8); for (let i = 0; i < p.length; i++) b.writeDoubleLE(p[i], i * 8); return createHash("sha256").update(b).digest("hex"); };
const iota = (n) => Array.from({ length: n }, (_, i) => i);

// a small cloth crumpled onto itself in z, so non-adjacent particles overlap and self-collision fires
function crumpled(W = 5, H = 5) {
    const { cons, adj } = buildClothConstraints(W, H, 1, { structural: 0.0, shear: 0.001, bending: 0.01 });
    const N = W * H; const pos = new Float64Array(3 * N), vel = new Float64Array(3 * N), invMass = new Float64Array(N);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const i = y * W + x;
        pos[3 * i] = x * 0.25; pos[3 * i + 1] = -y * 0.25; pos[3 * i + 2] = ((x + y) % 2) * 0.05;   // folded, layers 0.05 apart
        invMass[i] = (y === 0) ? 0 : 1;
    }
    return { state: { pos, vel, invMass }, cons, adj, N };
}

// ---- 1. MESH + COLORING: structural/shear/bending present; every batch conflict-free ------------------------
{
    const { cons } = crumpled();
    const kinds = countKinds(cons);
    const batches = colorConstraints(cons);
    let clean = true;
    for (const batch of batches) { const seen = new Set(); for (const ci of batch) { const c = cons[ci]; if (seen.has(c.i) || seen.has(c.j)) clean = false; seen.add(c.i); seen.add(c.j); } }
    ok("!! the mesh has structural, shear and bending constraints, all conflict-free colored", kinds.structural > 0 && kinds.shear > 0 && kinds.bending > 0 && clean,
       kinds.structural + " structural, " + kinds.shear + " shear, " + kinds.bending + " bending across " + batches.length + " color batches -- bending/shear are pure distance constraints, no acos.");
}

// ---- 2. FIDELITY: with collisions off, clothSubstep reproduces the verified v2659 solver byte-for-byte -------
{
    const { state, cons } = crumpled(); const batches = colorConstraints(cons);
    const s1 = cloneState(state), s2 = cloneState(state);
    for (let k = 0; k < 12; k++) { xpbdSubstep(s1, cons, batches, { dt: 0.016, iterations: 5, gravity: [0, -10, 0] }); clothSubstep(s2, cons, batches, { dt: 0.016, iterations: 5, gravity: [0, -10, 0], radius: 0 }); }
    ok("!! collisions off, the cloth step equals xpbdSubstep exactly", hashPos(s1.pos) === hashPos(s2.pos),
       "the extension's shared solver is byte-for-byte the v2659 XPBD update -- the duplicated math has not drifted from the verified reference.");
}

// ---- 3. THE SPINE: byte-identical under within-color shuffle AND scrambled collision walk order --------------
{
    const { state, cons, adj, N } = crumpled();
    const batches = colorConstraints(cons);
    const run = (bs, collOrder) => { const s = cloneState(state); for (let k = 0; k < 15; k++) clothSubstep(s, cons, bs, { dt: 0.016, iterations: 4, gravity: [0, -8, 0], radius: 0.05, adj, collisionOrder: collOrder }); return hashPos(s.pos); };
    const ref = run(batches, iota(N));
    let stable = true;
    for (let t = 0; t < 200; t++) { if (run(batches.map((b) => shuffle(b)), shuffle(iota(N))) !== ref) { stable = false; break; } }
    ok("!! byte-identical under 200 shuffles of color order and collision-walk order", stable,
       "neither the within-color visitation order nor the order the collision pass walks the particles changes a single bit -- coloring plus a sorted pair set makes the whole solve a pure function of the input.");
}

// ---- 4. COLLISION DETERMINISM: the discovered pair set is a pure function of positions -----------------------
{
    // a tight cluster of loose particles (no bonds) with many overlaps within the threshold
    const N = 12; const pos = new Float64Array(3 * N);
    for (let a = 0; a < N; a++) { pos[3 * a] = (a % 4) * 0.05; pos[3 * a + 1] = Math.floor(a / 4) * 0.05; pos[3 * a + 2] = (a % 2) * 0.03; }
    const a = findCollisionPairs(pos, N, 0.1, 0.12, new Set(), iota(N));
    let identical = true;
    for (let t = 0; t < 40; t++) { const b = findCollisionPairs(pos, N, 0.1, 0.12, new Set(), shuffle(iota(N))); if (JSON.stringify(a) !== JSON.stringify(b)) { identical = false; break; } }
    ok("!! the collision pair set is identical no matter the walk order", identical && a.length > 0,
       a.length + " pairs found, and scrambling the particle walk order 40 times yields the identical sorted list -- the sort is what makes discovery reproducible before it ever reaches the solver.");
}

// ---- 5. COLLISION IS UNILATERAL AND CORRECT: pushes overlapping apart, never pulls the distant together ------
{
    // two free non-adjacent particles overlapping -> should separate toward 2*radius
    const near = { pos: Float64Array.from([0, 0, 0, 0.05, 0, 0]), vel: new Float64Array(6), invMass: Float64Array.from([1, 1]) };
    clothSubstep(near, [], [], { dt: 0.016, iterations: 1, gravity: [0, 0, 0], radius: 0.1, adj: new Set() });
    const sepNear = Math.abs(near.pos[3] - near.pos[0]);
    // two particles already well apart -> collision must leave them untouched (no phantom attraction)
    const far = { pos: Float64Array.from([0, 0, 0, 1, 0, 0]), vel: new Float64Array(6), invMass: Float64Array.from([1, 1]) };
    clothSubstep(far, [], [], { dt: 0.016, iterations: 1, gravity: [0, 0, 0], radius: 0.1, adj: new Set() });
    const sepFar = Math.abs(far.pos[3] - far.pos[0]);
    ok("!! contact pushes overlapping particles apart and leaves distant ones alone", sepNear > 0.05 && Math.abs(sepFar - 1) < 1e-12,
       "overlapping (gap 0.05) separated to " + sepNear.toFixed(4) + " toward the 0.2 contact distance; a distant pair (gap 1.0) stayed at 1.0 exactly -- unilateral, so no phantom pull.");
}

// ---- 6. STABILITY + pure integer-of-floats across all three files -------------------------------------------
{
    const { state, cons, adj } = crumpled(6, 6);
    const batches = colorConstraints(cons);
    const a = cloneState(state), b = cloneState(state);
    for (let k = 0; k < 100; k++) { clothSubstep(a, cons, batches, { dt: 0.016, iterations: 5, gravity: [0, -10, 0], radius: 0.05, adj }); clothSubstep(b, cons, batches, { dt: 0.016, iterations: 5, gravity: [0, -10, 0], radius: 0.05, adj }); }
    let finite = true; for (let i = 0; i < a.pos.length; i++) if (!Number.isFinite(a.pos[i]) || Math.abs(a.pos[i]) > 1e6) finite = false;
    const here = path.dirname(fileURLToPath(import.meta.url));
    const src = ["clothMesh.js", "selfCollide.js", "clothStep.js"].map((f) => fs.readFileSync(path.join(here, f), "utf8")).join("\n").replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
    const noTrig = !/Math\.(sin|cos|tan|exp|log|pow|hypot|random|acos|asin|atan)\b/.test(src);
    ok("!! 100 substeps of a self-colliding cloth stay finite and deterministic, no transcendental", hashPos(a.pos) === hashPos(b.pos) && finite && noTrig,
       "a 6x6 cloth folded on itself, run twice, is byte-identical and bounded, and the mesh/collision/step code uses only +,-,*,/,sqrt and floor -- bit-identical across machines.");
}

console.log(fails ? "\ncloth-selfcheck: " + fails + " FAILED" : "\ncloth-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
