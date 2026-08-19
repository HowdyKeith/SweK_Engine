// physics/centrifuge-selfcheck.mjs
//
// Run: node physics/centrifuge-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs.
//
// A centrifuge separates a mixture by sedimentation coefficient s = 2 a^2 (rho_p - rho_f) / (9 eta). The gate holds
// the model to the physics that makes it one: spun, a mixture of light-small, medium, and heavy-big particles bands
// out in that order, the heavy racing to the wall and the light lagging near the axis; the sedimentation coefficient
// grows with the SQUARE of the particle radius and linearly with excess density; a neutrally buoyant particle, with
// its density equal to the fluid's, does not sediment at all; and a faster spin separates faster. The sabotage drops
// the square -- makes s scale with a instead of a^2 -- and the a-squared law fails, because the quadratic dependence
// on size is exactly what lets a centrifuge resolve particles a real machine could not tell apart otherwise.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { sedCoeff, centrifugeStep, bandR, radialSpeed } from "./centrifuge.js";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };
const hp = (a) => { const b = Buffer.alloc(a.length * 8); for (let i = 0; i < a.length; i++) b.writeDoubleLE(a[i], i * 8); return createHash("sha256").update(b).digest("hex"); };

const RHOF = 1, ETA = 1;
const SPEC = [{ a: 0.6, rho: 1.5 }, { a: 0.9, rho: 2.0 }, { a: 1.3, rho: 2.6 }];
function mix() { const parts = []; for (let s = 0; s < 3; s++) for (let i = 0; i < 12; i++) parts.push({ r: 0.08 + 0.002 * i, a: SPEC[s].a, rho: SPEC[s].rho, species: s }); return parts; }
function spin(omega, steps) { const parts = mix(); for (let s = 0; s < steps; s++) centrifugeStep(parts, { omega, dt: 1 / 60, rhoF: RHOF, eta: ETA, rMax: 1 }); return parts; }

// ---- 1. SEPARATION: the mixture bands out ordered by sedimentation coefficient ----------------------------
{
    const p = spin(0.6, 350), lo = bandR(p, 0), mi = bandR(p, 1), hi = bandR(p, 2);
    ok("!! spun, the mixture separates into bands ordered by sedimentation coefficient", hi > mi && mi > lo,
       "the heavy-big band reaches r " + hi.toFixed(2) + ", the medium " + mi.toFixed(2) + ", the light-small " + lo.toFixed(2) + " -- the centrifuge sorts them by s, which is the only thing it exists to do.");
}

// ---- 2. THE a^2 LAW: s grows with the square of radius and linearly with excess density -------------------
{
    const bySize = sedCoeff(2, 2, RHOF, ETA) / sedCoeff(1, 2, RHOF, ETA);       // double a -> 4x
    const byDensity = sedCoeff(1, 3, RHOF, ETA) / sedCoeff(1, 2, RHOF, ETA);    // double excess density -> 2x
    ok("!! s scales as the square of radius and linearly with excess density", Math.abs(bySize - 4) < 1e-9 && Math.abs(byDensity - 2) < 1e-9,
       "doubling the radius multiplies s by " + bySize.toFixed(2) + " (the square) and doubling excess density by " + byDensity.toFixed(2) + " (linear) -- the Svedberg coefficient, exactly.");
}

// ---- 3. THE SEDIMENTATION LAW: radial speed is s * omega^2 * r --------------------------------------------
{
    const p = { r: 0.4, a: 0.9, rho: 2.0 }, omega = 0.7;
    const v = radialSpeed(p, { omega, rhoF: RHOF, eta: ETA }), expect = sedCoeff(0.9, 2.0, RHOF, ETA) * omega * omega * 0.4;
    ok("!! a particle's outward speed is exactly s * omega^2 * r", Math.abs(v - expect) < 1e-12,
       "the terminal radial speed reads " + v.toFixed(4) + ", matching s*omega^2*r to machine precision -- the overdamped balance of centrifugal force and Stokes drag.");
}

// ---- 4. NEUTRAL BUOYANCY: a particle as dense as the fluid does not sediment ------------------------------
{
    const p = [{ r: 0.5, a: 1.0, rho: RHOF, species: 0 }]; centrifugeStep(p, { omega: 1, dt: 1 / 60, rhoF: RHOF, eta: ETA, rMax: 1 });
    ok("!! a neutrally buoyant particle does not sediment", Math.abs(p[0].r - 0.5) < 1e-15,
       "with its density equal to the fluid's the excess density is zero, s is zero, and the particle holds its radius exactly -- no weight to fling outward.");
}

// ---- 5. MONOTONIC: a faster spin separates faster --------------------------------------------------------
{
    const slow = bandR(spin(0.5, 250), 2), fast = bandR(spin(0.9, 250), 2);
    ok("!! a faster spin drives the separation faster", fast > slow,
       "the heavy band sits at r " + slow.toFixed(2) + " at the slow spin and " + fast.toFixed(2) + " at the fast one -- separation scales with omega^2.");
}

// ---- 6. DETERMINISTIC + PURE -----------------------------------------------------------------------------
{
    const r1 = spin(0.7, 200).map((p) => p.r), r2 = spin(0.7, 200).map((p) => p.r);
    const src = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "centrifuge.js"), "utf8").replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
    const clean = !/Math\.(sin|cos|tan|exp|log|pow|hypot|random|acos|asin|atan)\b/.test(src);
    ok("!! the centrifuge is deterministic and uses only +,-,*,/", hp(r1) === hp(r2) && clean,
       "the run reproduces byte-for-byte and the sedimentation is pure arithmetic -- no transcendental, so it is bit-identical across machines and can join the fingerprint.");
}

console.log(fails ? "\ncentrifuge-selfcheck: " + fails + " FAILED" : "\ncentrifuge-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
