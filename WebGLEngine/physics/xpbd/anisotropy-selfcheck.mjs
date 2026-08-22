// physics/xpbd/anisotropy-selfcheck.mjs
//
// Run: node physics/xpbd/anisotropy-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs.
//
// Anisotropic cloth gives more easily along one thread direction than the other. The gate pulls the same fabric along
// its warp and along its weft with the same force and checks the softer direction stretches more; that swapping the
// two compliances swaps which direction gives; and that equal compliances make the cloth isotropic, stretching the
// same both ways. The whole of anisotropy is which compliance each edge is handed, decided by its direction, so the
// sabotage hands every edge the same one -- and the fabric goes isotropic, failing the directional and flip checks.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { colorConstraints } from "./xpbd.js";
import { buildAnisotropicCloth, anisotropicSubstep, extent } from "./anisotropy.js";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };
const hp = (p) => { const b = Buffer.alloc(p.length * 8); for (let i = 0; i < p.length; i++) b.writeDoubleLE(p[i], i * 8); return createHash("sha256").update(b).digest("hex"); };

const W = 10, H = 10, SP = 0.2;
function stretch(warpComp, weftComp, axis, steps = 80) {
    const cons = buildAnisotropicCloth(W, H, SP, warpComp, weftComp), batches = colorConstraints(cons);
    const N = W * H, pos = new Float64Array(3 * N), vel = new Float64Array(3 * N), invMass = new Float64Array(N).fill(1);
    for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) { const i = z * W + x; pos[3 * i] = x * SP; pos[3 * i + 1] = 0; pos[3 * i + 2] = z * SP; if (axis === 0 && x === 0) invMass[i] = 0; if (axis === 2 && z === 0) invMass[i] = 0; }
    const rest = extent(pos, N, axis), f = axis === 0 ? [6, 0, 0] : [0, 0, 6], st = { pos, vel, invMass };
    for (let s = 0; s < steps; s++) anisotropicSubstep(st, cons, batches, { dt: 0.016, iterations: 14, force: f });
    return { ext: extent(st.pos, N, axis) - rest, sig: hp(st.pos) };
}
const STIFF = 1e-5, SOFT = 1e-3, ISO = 1e-4;

// ---- 1. ANISOTROPIC: with warp stiff and weft soft, the weft direction stretches more ----------------------
{
    const warp = stretch(STIFF, SOFT, 0).ext, weft = stretch(STIFF, SOFT, 2).ext;
    ok("!! under equal pull the softer thread direction stretches more", weft > warp * 3,
       "warp stiff, weft soft: pulling along warp gives " + warp.toFixed(3) + ", along weft gives " + weft.toFixed(3) + " -- the same fabric, the same force, and the soft direction yields many times more.");
}

// ---- 2. FLIP: swapping the compliances swaps which direction gives ------------------------------------------
{
    const warpSoft = stretch(SOFT, STIFF, 0).ext, weftSoft = stretch(SOFT, STIFF, 2).ext;
    ok("!! swapping the two compliances swaps which direction stretches", warpSoft > weftSoft * 3,
       "with warp soft and weft stiff it reverses: warp now stretches " + warpSoft.toFixed(3) + " against weft's " + weftSoft.toFixed(3) + " -- the anisotropy tracks the compliance, not the geometry.");
}

// ---- 3. ISOTROPIC: equal compliances stretch the same both ways ---------------------------------------------
{
    const warp = stretch(ISO, ISO, 0).ext, weft = stretch(ISO, ISO, 2).ext;
    ok("!! equal compliances make the cloth isotropic", Math.abs(warp - weft) < 0.01 && warp > 0.01,
       "handed the same compliance both ways the fabric stretches " + warp.toFixed(3) + " along warp and " + weft.toFixed(3) + " along weft -- indistinguishable, as an isotropic sheet should be.");
}

// ---- 4. MONOTONIC: softer means more stretch ---------------------------------------------------------------
{
    const stiff = stretch(1e-5, 1e-5, 0).ext, mid = stretch(1e-4, 1e-4, 0).ext, soft = stretch(1e-3, 1e-3, 0).ext;
    ok("!! a softer fabric stretches further under the same load", stiff < mid && mid < soft,
       "warp extension climbs " + stiff.toFixed(3) + " -> " + mid.toFixed(3) + " -> " + soft.toFixed(3) + " as the compliance rises -- more give, more stretch, monotonically.");
}

// ---- 5. DETERMINISTIC + rest preserved ---------------------------------------------------------------------
{
    const a = stretch(STIFF, SOFT, 2), b = stretch(STIFF, SOFT, 2);
    // no force -> no stretch
    const cons = buildAnisotropicCloth(W, H, SP, ISO, ISO), batches = colorConstraints(cons);
    const N = W * H, pos = new Float64Array(3 * N), vel = new Float64Array(3 * N), invMass = new Float64Array(N).fill(1);
    for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) { const i = z * W + x; pos[3 * i] = x * SP; pos[3 * i + 2] = z * SP; }
    const rest = extent(pos, N, 0), st = { pos, vel, invMass };
    for (let s = 0; s < 30; s++) anisotropicSubstep(st, cons, batches, { dt: 0.016, iterations: 14, force: [0, 0, 0] });
    ok("!! two runs are byte-identical and a fabric at rest does not stretch", a.sig === b.sig && Math.abs(extent(st.pos, N, 0) - rest) < 1e-9,
       "the same pull reproduces to the last bit, and with no force the fabric holds its rest dimensions exactly.");
}

// ---- 6. PURE -----------------------------------------------------------------------------------------------
{
    const src = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "anisotropy.js"), "utf8").replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
    const clean = !/Math\.(sin|cos|tan|exp|log|pow|hypot|random|acos|asin|atan)\b/.test(src);
    ok("!! the solver uses only +,-,*,/,sqrt -- no transcendental", clean,
       "anisotropy is only a per-edge compliance on the ordinary distance solver, so it stays on arithmetic and square roots, bit-identical across machines.");
}

console.log(fails ? "\nanisotropy-selfcheck: " + fails + " FAILED" : "\nanisotropy-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
