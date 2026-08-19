// physics/xpbd/pbfPolish-selfcheck.mjs
//
// Run: node physics/xpbd/pbfPolish-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs.
//
// The two finishing terms of position-based fluids. s_corr is a small artificial pressure that cures the tensile
// instability: a handful of particles have low density, so the density constraint pulls them together (cohesion) and
// they clump; s_corr is a repulsion that resists that collapse. It is isolated cleanly here by setting the rest
// density to the pair's own density so the density constraint is neutral -- then s_corr is the only force, and a
// repulsive one pushes the pair apart, none leaves it, an attractive (wrong-signed) one pulls it together. XSPH is a
// viscosity that blends each velocity toward its neighbours', normalised by weight so it is a bounded average. Both
// are bit-identical -- s_corr's exponent is an integer power built by multiplication, XSPH reuses the sorted
// neighbours. The sabotage flips s_corr's sign, and the repulsion check fails because the pressure now attracts.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { buildNeighbors, pbfProject, applyXSPH, poly6 } from "./pbf.js";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };
const hp = (p) => { const b = Buffer.alloc(p.length * 8); for (let i = 0; i < p.length; i++) b.writeDoubleLE(p[i], i * 8); return createHash("sha256").update(b).digest("hex"); };
const H = 0.3;

const RHO0_NEUTRAL = poly6(0, H) + poly6(0.14 * 0.14, H);
function pairSep(sCorrK) { const pos = Float64Array.from([0, 0, 0, 0.14, 0, 0]), im = Float64Array.from([1, 1]); const nbr = buildNeighbors(pos, 2, H); pbfProject(pos, 2, im, nbr, { h: H, rho0: RHO0_NEUTRAL, iterations: 1, eps: 1e-4, sCorrK, sCorrDq: 0.2 }); return Math.abs(pos[3] - pos[0]); }
function blob() { const nS = 5, n = nS ** 3, pos = new Float64Array(3 * n); let k = 0; for (let a = 0; a < nS; a++) for (let b = 0; b < nS; b++) for (let c = 0; c < nS; c++) { pos[3 * k] = a * 0.16; pos[3 * k + 1] = b * 0.16; pos[3 * k + 2] = c * 0.16; k++; } return { pos, n }; }
function velVar(vel, nbr, n) { let tot = 0, cnt = 0; for (let i = 0; i < n; i++) for (const j of nbr[i]) { const dv = vel[3 * i] - vel[3 * j]; tot += dv * dv; cnt++; } return tot / cnt; }

{
    const none = pairSep(0), rep = pairSep(0.02), att = pairSep(-0.02);
    ok("!! the artificial pressure resists cohesion -- repulsive apart, none still, attractive together", rep > none + 1e-6 && none > att + 1e-6,
       "with the density constraint made neutral, a pair 0.140 apart moves to " + rep.toFixed(4) + " under repulsive s_corr, holds at " + none.toFixed(4) + " with none, and collapses to " + att.toFixed(4) + " under a wrong-signed one -- s_corr is the term that stops particles clumping.");
}
{
    const { pos, n } = blob(); const vel = new Float64Array(3 * n); for (let i = 0; i < n; i++) vel[3 * i] = (i % 3) - 1;
    const nbr = buildNeighbors(pos, n, H); const before = velVar(vel, nbr, n);
    for (let k = 0; k < 8; k++) applyXSPH(pos, vel, n, nbr, H, 0.3); const after = velVar(vel, nbr, n);
    ok("!! XSPH viscosity smooths a noisy velocity field toward coherence", after < before * 0.3,
       "neighbour velocity variance falls from " + before.toFixed(3) + " to " + after.toFixed(3) + " -- the flow moves together instead of as noise.");
}
{
    const { pos, n } = blob(); const vel = new Float64Array(3 * n); for (let i = 0; i < n; i++) { vel[3 * i] = (i * 137 % 100) - 50; vel[3 * i + 1] = (i * 91 % 100) - 50; }
    const nbr = buildNeighbors(pos, n, H); for (let k = 0; k < 40; k++) applyXSPH(pos, vel, n, nbr, H, 0.5);
    let finite = true; for (let i = 0; i < vel.length; i++) if (!Number.isFinite(vel[i]) || Math.abs(vel[i]) > 1e3) finite = false;
    ok("!! XSPH stays bounded because it is a normalised weighted average", finite,
       "forty passes of strong smoothing on velocities up to fifty stay bounded -- normalising by the total weight makes the blend a true average, so it cannot diverge.");
}
{
    const sA = pairSep(0.02), sB = pairSep(0.02);
    const xsphRun = () => { const { pos, n } = blob(); const vel = new Float64Array(3 * n); for (let i = 0; i < n; i++) vel[3 * i] = (i % 5) - 2; const nbr = buildNeighbors(pos, n, H); for (let k = 0; k < 6; k++) applyXSPH(pos, vel, n, nbr, H, 0.3); return hp(vel); };
    ok("!! s_corr and XSPH both reproduce byte-for-byte", sA === sB && xsphRun() === xsphRun(),
       "the artificial-pressure step and the viscosity blend each land identical on a re-run -- integer-power s_corr and sorted-neighbour XSPH are both bit-exact.");
}
{
    const bare = () => { const pos = Float64Array.from([0, 0, 0, 0.11, 0, 0, 0.22, 0, 0]), im = Float64Array.from([1, 1, 1]); const nbr = buildNeighbors(pos, 3, H); pbfProject(pos, 3, im, nbr, { h: H, rho0: 120, iterations: 2, eps: 1e-4 }); return hp(pos); };
    const off = () => { const pos = Float64Array.from([0, 0, 0, 0.11, 0, 0, 0.22, 0, 0]), im = Float64Array.from([1, 1, 1]); const nbr = buildNeighbors(pos, 3, H); pbfProject(pos, 3, im, nbr, { h: H, rho0: 120, iterations: 2, eps: 1e-4, sCorrK: 0 }); return hp(pos); };
    ok("!! with s_corr off the density projection is exactly the original solver", bare() === off(),
       "passing no coefficient and passing zero give byte-identical results, so the gated s_corr contributes nothing when off and the existing fluid subsystems are undisturbed.");
}
{
    const src = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "pbf.js"), "utf8").replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
    const clean = !/Math\.(sin|cos|tan|exp|log|pow|hypot|random|acos|asin|atan)\b/.test(src);
    ok("!! s_corr's power is built by multiplication -- no Math.pow, no transcendental", clean,
       "the (W/Wdq)^4 in s_corr is formed as a square of a square, so every machine evaluates it to the same bits.");
}

console.log(fails ? "\npbfPolish-selfcheck: " + fails + " FAILED" : "\npbfPolish-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
