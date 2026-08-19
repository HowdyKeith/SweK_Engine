// physics/xpbd/pbf-selfcheck.mjs
//
// Run: node physics/xpbd/pbf-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs.
//
// Position-based fluids has to do one physical thing and one numerical thing. Physically, its density projection must
// drive a compressed blob back toward rest density -- the constraint spreads packed particles apart. Numerically, it
// forces the floating-point-summation-order problem into the open: density is a sum over neighbours, and a+b+c is not
// a+c+b to the last bit, so the neighbour lists are sorted before any sum is taken. The determinism checks build the
// neighbour lists from a scrambled particle walk and demand byte-identical positions -- only true because the lists
// are sorted. The sabotage removes that sort, and the order-independence check fails: unsorted neighbours make the
// density sum depend on bucket-walk order, and the "deterministic" fluid stops being deterministic.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { buildNeighbors, pbfProject, densityStats, poly6, spikyGradMag } from "./pbf.js";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };
let seed = 0x5e31;
const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
const shuffle = (a) => { const b = a.slice(); for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };
const hp = (p) => { const b = Buffer.alloc(p.length * 8); for (let i = 0; i < p.length; i++) b.writeDoubleLE(p[i], i * 8); return createHash("sha256").update(b).digest("hex"); };
const iota = (n) => Array.from({ length: n }, (_, i) => i);

const H = 0.3;
function grid(nS, d) { const n = nS ** 3; const pos = new Float64Array(3 * n); let k = 0; for (let a = 0; a < nS; a++) for (let b = 0; b < nS; b++) for (let c = 0; c < nS; c++) { pos[3 * k] = a * d; pos[3 * k + 1] = b * d; pos[3 * k + 2] = c * d; k++; } return { pos, n }; }
function restDensity() { const ref = grid(6, 0.15); const nbr = buildNeighbors(ref.pos, ref.n, H); const ci = Math.floor(ref.n / 2); let rho = poly6(0, H); for (const j of nbr[ci]) { const ex = ref.pos[3 * ci] - ref.pos[3 * j], ey = ref.pos[3 * ci + 1] - ref.pos[3 * j + 1], ez = ref.pos[3 * ci + 2] - ref.pos[3 * j + 2]; rho += poly6(ex * ex + ey * ey + ez * ez, H); } return rho; }
const RHO0 = restDensity();

// ---- 1. INCOMPRESSIBILITY: the density projection drives a compressed blob back toward rest -----------------
{
    const blob = grid(6, 0.11), invMass = new Float64Array(blob.n).fill(1);
    let nbr = buildNeighbors(blob.pos, blob.n, H);
    const before = densityStats(blob.pos, blob.n, nbr, H, RHO0).rms;
    for (let it = 0; it < 10; it++) { nbr = buildNeighbors(blob.pos, blob.n, H); pbfProject(blob.pos, blob.n, invMass, nbr, { h: H, rho0: RHO0, iterations: 2, eps: 1e-4 }); }
    const after = densityStats(blob.pos, blob.n, nbr, H, RHO0).rms;
    ok("!! the density projection relaxes a compressed blob toward rest density", after < before * 0.15,
       "an over-packed blob's density error fell from " + before.toFixed(3) + " to " + after.toFixed(3) + " -- the constraint spread the particles until the density relaxed, real pressure from real density.");
}

// ---- 2. DETERMINISM: the projection reproduces byte-for-byte -----------------------------------------------
{
    const run = () => { const blob = grid(5, 0.11), invMass = new Float64Array(blob.n).fill(1); for (let it = 0; it < 8; it++) { const nbr = buildNeighbors(blob.pos, blob.n, H); pbfProject(blob.pos, blob.n, invMass, nbr, { h: H, rho0: RHO0, iterations: 2, eps: 1e-4 }); } return hp(blob.pos); };
    ok("!! two projection runs land byte-for-byte identical", run() === run(),
       "the same compressed blob relaxed twice gives the identical result to the last bit -- the sorted-neighbour sums make the fluid reproducible.");
}

// ---- 3. ORDER-INDEPENDENT: neighbours built from a scrambled walk give the same fluid ----------------------
{
    const project = (walk) => { const blob = grid(5, 0.11), invMass = new Float64Array(blob.n).fill(1); for (let it = 0; it < 8; it++) { const nbr = buildNeighbors(blob.pos, blob.n, H, walk(blob.n)); pbfProject(blob.pos, blob.n, invMass, nbr, { h: H, rho0: RHO0, iterations: 2, eps: 1e-4 }); } return hp(blob.pos); };
    const ref = project((n) => iota(n));
    let identical = true;
    for (let t = 0; t < 30; t++) if (project((n) => shuffle(iota(n))) !== ref) { identical = false; break; }
    ok("!! neighbours built from a scrambled particle walk give byte-identical positions", identical,
       "because each particle's neighbour list is sorted before any density sum, the order the particles were walked in cannot change a single bit -- this is what the sabotage breaks.");
}

// ---- 4. KERNELS EXACT: poly6 and spiky match their closed forms --------------------------------------------
{
    const h = 0.3, r = 0.12, r2 = r * r;
    const h2 = h * h, h9 = h2 * h2 * h2 * h2 * h, expectPoly6 = (315 / (64 * Math.PI * h9)) * (h2 - r2) ** 3;
    const h6 = h * h * h * h * h * h, expectSpiky = (45 / (Math.PI * h6)) * (h - r) ** 2;
    const cutoff = poly6(h * h + 0.01, h) === 0 && spikyGradMag(h + 0.01, h) === 0;
    ok("!! the poly6 and spiky kernels match their closed forms and cut off at h", Math.abs(poly6(r2, h) - expectPoly6) < 1e-12 && Math.abs(spikyGradMag(r, h) - expectSpiky) < 1e-12 && cutoff,
       "at r 0.12 with h 0.3 both kernels match the analytic values to 1e-12 and return zero beyond h -- polynomial kernels, no transcendental.");
}

// ---- 5. STABILITY: many iterations stay finite -------------------------------------------------------------
{
    const blob = grid(6, 0.09), invMass = new Float64Array(blob.n).fill(1);   // heavily over-packed
    for (let it = 0; it < 40; it++) { const nbr = buildNeighbors(blob.pos, blob.n, H); pbfProject(blob.pos, blob.n, invMass, nbr, { h: H, rho0: RHO0, iterations: 3, eps: 1e-4 }); }
    let finite = true; for (let i = 0; i < blob.pos.length; i++) if (!Number.isFinite(blob.pos[i]) || Math.abs(blob.pos[i]) > 1e4) finite = false;
    ok("!! heavy compression relaxed over many iterations stays finite", finite,
       "a blob packed far past rest, projected 40 times, stays bounded -- the density solve does not blow up.");
}

// ---- 6. PURE: no transcendental, no Math.pow ---------------------------------------------------------------
{
    const src = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "pbf.js"), "utf8").replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
    const clean = !/Math\.(sin|cos|tan|exp|log|pow|hypot|random|acos)\b/.test(src);
    ok("!! the solver uses only +,-,*,/,sqrt and a constant pi -- no transcendental, no Math.pow", clean,
       "the kernels are polynomial with h^9 and h^6 built by multiplication, so every machine evaluates them to the same bits.");
}

console.log(fails ? "\npbf-selfcheck: " + fails + " FAILED" : "\npbf-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
