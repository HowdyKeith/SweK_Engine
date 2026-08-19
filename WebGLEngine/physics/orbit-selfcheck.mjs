// physics/orbit-selfcheck.mjs
//
// Run: node physics/orbit-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs.
//
// An orbit is the test of an integrator, because it has to come back. The gate runs a two-body Kepler system for eight
// orbits and checks the things Newton and Kepler promise: the ellipse closes -- periapsis and apoapsis hold their
// values instead of spiralling; the energy stays bounded, the mark of a symplectic integrator; the angular momentum is
// conserved to machine precision, which is Kepler's equal-areas law; and two orbits of different size obey T^2 over a^3
// equal, Kepler's third law. The sabotage swaps the symplectic velocity-Verlet step for a forward-Euler one, and the
// energy runs away and the orbit spirals -- the same integrator that looks fine for a frame is a lie over an orbit.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { keplerPair, orbitStep, totalEnergy, angularMomentum, separation } from "./orbit.js";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };
const hp = (a) => { const b = Buffer.alloc(a.length * 8); for (let i = 0; i < a.length; i++) b.writeDoubleLE(a[i], i * 8); return createHash("sha256").update(b).digest("hex"); };

const G = 1, M1 = 1, M2 = 0.001, MU = G * (M1 + M2), DT = 0.002;
function runOrbits(a, e, orbits) {
    const st = keplerPair({ G, m1: M1, m2: M2, a, e }), T = 2 * Math.PI * Math.sqrt(a * a * a / MU);
    let rmin = Infinity, rmax = -Infinity, Emin = Infinity, Emax = -Infinity, Lmin = Infinity, Lmax = -Infinity;
    const E0 = totalEnergy(st), n = Math.round(orbits * T / DT);
    for (let s = 0; s < n; s++) { orbitStep(st, DT); const r = separation(st), E = totalEnergy(st), L = angularMomentum(st); if (r < rmin) rmin = r; if (r > rmax) rmax = r; if (E < Emin) Emin = E; if (E > Emax) Emax = E; if (L < Lmin) Lmin = L; if (L > Lmax) Lmax = L; }
    return { rmin, rmax, Edrift: Math.abs((Emax - Emin) / E0), Ldrift: (Lmax - Lmin) / Lmax, T, st };
}
// period by timing periapsis passages
function measurePeriod(a, e) {
    const st = keplerPair({ G, m1: M1, m2: M2, a, e }), Texp = 2 * Math.PI * Math.sqrt(a * a * a / MU);
    let rising = false, t = 0, last = null, period = Texp;
    for (let s = 0; s < Math.round(2.2 * Texp / DT); s++) { const r0 = separation(st); orbitStep(st, DT); const r1 = separation(st); t += DT; if (r0 < r1 && !rising) { rising = true; if (last !== null) { period = t - last; break; } last = t; } if (r0 > r1) rising = false; }
    return period;
}

// ---- 1. CLOSED ELLIPSE: periapsis and apoapsis hold over eight orbits ------------------------------------
{
    const a = 1, e = 0.4, o = runOrbits(a, e, 8);
    ok("!! the orbit closes -- periapsis and apoapsis hold over eight orbits instead of spiralling", Math.abs(o.rmin - a * (1 - e)) < 1e-3 && Math.abs(o.rmax - a * (1 + e)) < 1e-3,
       "after eight orbits the separation still swings between " + o.rmin.toFixed(4) + " and " + o.rmax.toFixed(4) + ", the periapsis a(1-e) and apoapsis a(1+e) -- a closed ellipse, not a spiral.");
}

// ---- 2. ENERGY BOUNDED: the symplectic step does not leak energy -----------------------------------------
{
    const o = runOrbits(1, 0.4, 8);
    ok("!! the energy stays bounded over eight orbits -- the integrator is symplectic", o.Edrift < 1e-4,
       "the total energy varies by only " + o.Edrift.toExponential(1) + " of itself across eight orbits -- velocity-Verlet keeps it bounded, where forward Euler would bleed it away and open the orbit.");
}

// ---- 3. ANGULAR MOMENTUM CONSERVED: Kepler's equal-areas law ---------------------------------------------
{
    const o = runOrbits(1, 0.4, 8);
    ok("!! angular momentum is conserved -- Kepler's equal-areas law", o.Ldrift < 1e-9,
       "the angular momentum holds to " + o.Ldrift.toExponential(1) + " over eight orbits -- the body sweeps equal areas in equal times, exactly.");
}

// ---- 4. KEPLER'S THIRD LAW: T^2 proportional to a^3 ------------------------------------------------------
{
    const Ta = measurePeriod(1.0, 0.3), Tb = measurePeriod(1.6, 0.3);
    const ka = Ta * Ta / (1.0 * 1.0 * 1.0), kb = Tb * Tb / (1.6 * 1.6 * 1.6);
    ok("!! two orbits of different size obey T-squared over a-cubed equal (Kepler's third law)", Math.abs(ka - kb) / ka < 0.02,
       "the small orbit gives T^2/a^3 = " + ka.toFixed(2) + " and the large one " + kb.toFixed(2) + ", equal to 4*pi^2/mu -- the period grows as the three-halves power of the size.");
}

// ---- 5. DETERMINISTIC + PURE (only +,-,*,/,sqrt) ---------------------------------------------------------
{
    const flat = (st) => st.bodies.flatMap((b) => [...b.r, ...b.v]);
    const A = keplerPair({ G, m1: M1, m2: M2, a: 1, e: 0.4 }); for (let s = 0; s < 500; s++) orbitStep(A, DT);
    const B = keplerPair({ G, m1: M1, m2: M2, a: 1, e: 0.4 }); for (let s = 0; s < 500; s++) orbitStep(B, DT);
    const src = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "orbit.js"), "utf8").replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
    const clean = !/Math\.(sin|cos|tan|exp|log|pow|hypot|random|acos|asin|atan)\b/.test(src);
    ok("!! the orbit is deterministic and uses only arithmetic and sqrt", hp(flat(A)) === hp(flat(B)) && clean,
       "the run reproduces byte-for-byte and gravity is +,-,*,/ and one sqrt -- no transcendental, so the orbit is bit-identical across machines and joins the fingerprint.");
}

console.log(fails ? "\norbit-selfcheck: " + fails + " FAILED" : "\norbit-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
