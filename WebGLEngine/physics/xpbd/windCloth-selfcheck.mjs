// physics/xpbd/windCloth-selfcheck.mjs
//
// Run: node physics/xpbd/windCloth-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs.
//
// The sampled-field coupling driving a body that resists. A flag pinned at its pole and left in a steady wind bellies
// out downwind and holds a shape -- it does not simply blow away, because its edges hold it together while the wind
// pushes. The gate averages the free edge over time (a flag flaps, so an instant is a random phase) and checks the
// wind billows it out of plane, that a stronger wind billows it further, that the billow follows the wind's direction,
// and -- the coupling's real obligation -- that the fabric holds together, its worst edge strain staying small even in
// a gale. The sabotage zeroes the constraint correction so only the wind acts; the cloth tears off its pole and the
// strain check fails, because a coupling that drives a body but ignores its constraints is just a wind blowing dust.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { buildClothConstraints } from "./clothMesh.js";
import { colorConstraints } from "./xpbd.js";
import { windClothSubstep, freeCentroid, maxStrain } from "./windCloth.js";
import { buildVectorGrid } from "./sampledField.js";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };
const hp = (p) => { const b = Buffer.alloc(p.length * 8); for (let i = 0; i < p.length; i++) b.writeDoubleLE(p[i], i * 8); return createHash("sha256").update(b).digest("hex"); };

const W = 12, H = 8, SP = 0.2, N = W * H;
const { cons } = buildClothConstraints(W, H, SP, { structural: 0.0, shear: 0.0005, bending: 0.002 });
const batches = colorConstraints(cons);
const gdims = { nx: 8, ny: 8, nz: 8, ox: -1, oy: -2, oz: -1, sp: 0.6 };
function windField(dir) { return { grid: buildVectorGrid(gdims.nx, gdims.ny, gdims.nz, gdims.ox, gdims.oy, gdims.oz, gdims.sp, () => dir), dims: gdims }; }
function flag() { const pos = new Float64Array(3 * N), vel = new Float64Array(3 * N), invMass = new Float64Array(N).fill(1); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = y * W + x; pos[3 * i] = x * SP; pos[3 * i + 1] = -y * SP; pos[3 * i + 2] = 0; if (x === 0) invMass[i] = 0; } return { pos, vel, invMass }; }
function run(field, windStrength, axis = 2) { const st = flag(); let sum = 0, cnt = 0, sMax = 0; for (let s = 0; s < 160; s++) { windClothSubstep(st, cons, batches, field, { dt: 0.016, iterations: 12, gravity: [0, -2, 0], windStrength }); if (s >= 100) { sum += freeCentroid(st.pos, st.invMass, N)[axis]; cnt++; } const sm = maxStrain(st.pos, cons); if (sm > sMax) sMax = sm; } return { avg: sum / cnt, strain: sMax, sig: hp(st.pos) }; }

const zWind = windField([0, 0, 1]);
const calm = run(zWind, 0), breeze = run(zWind, 3), gale = run(zWind, 7);

// ---- 1. WIND BILLOWS: a wind pushes the flag out of plane; with none it hangs flat ------------------------
{
    ok("!! a wind bellies the flag out of its plane while a calm flag hangs flat", Math.abs(calm.avg) < 0.05 && breeze.avg > 0.2,
       "with no wind the free edge averages z " + calm.avg.toFixed(3) + " -- flat in its plane -- and in a breeze it bellies to z " + breeze.avg.toFixed(3) + ", carried downwind.");
}

// ---- 2. MONOTONIC: a stronger wind bellies it further -------------------------------------------------------
{
    ok("!! a stronger wind bellies the flag further", calm.avg < breeze.avg && breeze.avg < gale.avg,
       "the time-averaged billow climbs " + calm.avg.toFixed(3) + " -> " + breeze.avg.toFixed(3) + " -> " + gale.avg.toFixed(3) + " with the wind -- more push, more belly.");
}

// ---- 3. CONSTRAINTS HOLD: the fabric stays together even in a gale ------------------------------------------
{
    ok("!! the cloth's edges hold it together against the wind", gale.strain < 0.25,
       "even in the strongest wind the worst edge strain is " + gale.strain.toFixed(3) + " -- the fabric stretches a little but does not come apart; the constraints do their job while the wind drives.");
}

// ---- 4. DIRECTION: the belly follows the wind's direction --------------------------------------------------
{
    const xWind = run(windField([1, 0, 0]), 5, 0);   // wind along +x, measure x of the free edge
    const restX = ((W - 1) * SP + 0) / 2;             // rough rest x of the free half
    ok("!! the flag bellies along whichever way the wind blows", xWind.avg > restX,
       "a wind along +x streams the free edge to x " + xWind.avg.toFixed(2) + ", downwind of its rest -- the coupling carries the cloth in the field's direction, not a fixed one.");
}

// ---- 5. DETERMINISTIC: a flapping flag still reproduces -----------------------------------------------------
{
    ok("!! the same flag in the same wind reproduces byte-for-byte", run(zWind, 5).sig === run(zWind, 5).sig,
       "a flag flaps chaotically, yet two runs from the same start and the same wind land byte-identical -- deterministic despite the flapping, like every other subsystem.");
}

// ---- 6. PURE -----------------------------------------------------------------------------------------------
{
    const src = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "windCloth.js"), "utf8").replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
    const clean = !/Math\.(sin|cos|tan|exp|log|pow|hypot|random|acos|asin|atan)\b/.test(src);
    ok("!! the coupling uses only +,-,*,/,sqrt -- no transcendental", clean,
       "sampling the wind and solving the cloth are arithmetic and square roots, so the flag flaps the same on every machine.");
}

console.log(fails ? "\nwindCloth-selfcheck: " + fails + " FAILED" : "\nwindCloth-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
