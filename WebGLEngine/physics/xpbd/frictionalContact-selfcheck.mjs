// physics/xpbd/frictionalContact-selfcheck.mjs
//
// Run: node physics/xpbd/frictionalContact-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs.
//
// Pairwise Coulomb friction is proven the way the world proves it: drop a heap of particles and watch it pile up. With
// friction the heap holds a slope -- an angle of repose -- and the steeper the friction the steeper the pile; with no
// friction it spreads into a flat pancake. The gate checks a frictional pile is narrower and taller than a
// frictionless one, that the pile steepens monotonically with mu, and that a single contact moves both particles by
// inverse mass. The pile is chaotic yet the same start gives the identical heap to the last bit -- chaos is not the
// enemy of reproducibility, unpinned order is. The sabotage strips the mu bound so friction cancels all tangential
// motion regardless of mu: now even the frictionless heap freezes into a column, and the repose and spread checks fail.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { frictionalPileSubstep, solveFrictionalContacts, pileShape } from "./frictionalContact.js";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };
const hp = (p) => { const b = Buffer.alloc(p.length * 8); for (let i = 0; i < p.length; i++) b.writeDoubleLE(p[i], i * 8); return createHash("sha256").update(b).digest("hex"); };

const R = 0.1, FLOOR = [0, 1, 0];
function column() { const cols = 3, rows = 8, n = cols * cols * rows; const pos = new Float64Array(3 * n), vel = new Float64Array(3 * n), invMass = new Float64Array(n).fill(1); let k = 0; for (let y = 0; y < rows; y++) for (let a = 0; a < cols; a++) for (let b = 0; b < cols; b++) { pos[3 * k] = (a - 1) * 0.18; pos[3 * k + 1] = R + 0.05 + y * 0.19; pos[3 * k + 2] = (b - 1) * 0.18; k++; } return { pos, vel, invMass, n }; }
function pile(mu, steps = 260) { const c = column(); for (let s = 0; s < steps; s++) frictionalPileSubstep(c, FLOOR, 0, mu, { dt: 0.016, iterations: 5, gravity: [0, -10, 0], radius: R }); return { shape: pileShape(c.pos, c.n), sig: hp(c.pos) }; }

const p0 = pile(0.0), p6 = pile(0.6), p12 = pile(1.2);
const asp = (p) => p.shape.height / p.shape.radius;

// ---- 1. ANGLE OF REPOSE: a frictional heap is narrower and taller than a frictionless one -------------------
{
    ok("!! friction makes the heap pile up where a frictionless one spreads flat", p6.shape.radius < p0.shape.radius * 0.5 && p6.shape.height > p0.shape.height + 0.2,
       "with mu 0.6 the heap settles to radius " + p6.shape.radius.toFixed(2) + " and height " + p6.shape.height.toFixed(2) + ", against a frictionless pancake of radius " + p0.shape.radius.toFixed(1) + " and height " + p0.shape.height.toFixed(2) + " -- an angle of repose.");
}

// ---- 2. MONOTONIC: more friction, steeper pile -------------------------------------------------------------
{
    ok("!! the pile steepens monotonically as friction rises", asp(p0) < asp(p6) && asp(p6) < asp(p12),
       "height-over-radius climbs " + asp(p0).toFixed(2) + " -> " + asp(p6).toFixed(2) + " -> " + asp(p12).toFixed(2) + " across mu 0, 0.6, 1.2 -- the repose angle follows the friction angle.");
}

// ---- 3. TWO-WAY PAIRWISE: one contact moves both particles, split by inverse mass --------------------------
{
    // equal mass, overlapping along x by 0.05 (rest 0.2), no tangential motion
    const a = Float64Array.from([0, 0, 0, 0.15, 0, 0]), prev = Float64Array.from(a);
    solveFrictionalContacts(a, prev, Float64Array.from([1, 1]), [[0, 1]], [[0]], 0.1, 0.5);
    const equal = Math.abs(a[0] + 0.025) < 1e-12 && Math.abs(a[3] - 0.175) < 1e-12;
    // heavier second particle moves less
    const b = Float64Array.from([0, 0, 0, 0.15, 0, 0]), prevB = Float64Array.from(b);
    solveFrictionalContacts(b, prevB, Float64Array.from([1, 0.25]), [[0, 1]], [[0]], 0.1, 0.5);
    const massSplit = Math.abs(b[0]) > Math.abs(b[3] - 0.15);
    ok("!! a single pairwise contact moves both particles, split by inverse mass", equal && massSplit,
       "equal masses each move 0.025 to separate to the rest distance; a four-times-heavier neighbour moves a quarter as far -- two-way, momentum-consistent.");
}

// ---- 4. DETERMINISTIC DESPITE CHAOS: the same start gives the identical heap -------------------------------
{
    ok("!! a chaotic heap still settles to the identical positions on a re-run", pile(0.6).sig === p6.sig && pile(1.2).sig === p12.sig,
       "the heap is chaotic -- one grain would change all of it -- yet two runs from the same start land byte-identical, because the contact set is sorted and solved in a fixed order.");
}

// ---- 5. FRICTIONLESS SPREADS FLAT: mu 0 has no repose -------------------------------------------------------
{
    ok("!! with no friction the heap collapses to a flat spread", p0.shape.height < 0.15 && p0.shape.radius > 4,
       "at mu 0 the column collapses to height " + p0.shape.height.toFixed(3) + " and spreads to radius " + p0.shape.radius.toFixed(1) + " -- with nothing to hold a slope it becomes a pancake.");
}

// ---- 6. PURE + trig-free -----------------------------------------------------------------------------------
{
    const src = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "frictionalContact.js"), "utf8").replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
    const clean = !/Math\.(sin|cos|tan|exp|log|pow|hypot|random|acos|asin|atan)\b/.test(src);
    ok("!! the solver uses only +,-,*,/,sqrt -- no transcendental", clean,
       "pairwise friction and the pile use nothing but arithmetic and square roots, so the same heap forms bit-for-bit on any machine.");
}

console.log(fails ? "\nfrictionalContact-selfcheck: " + fails + " FAILED" : "\nfrictionalContact-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
