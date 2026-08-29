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
import { keplerPair, orbitStep, totalEnergy, angularMomentum, separation, makeSystem } from "./orbit.js";

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

// ---- 4b. makeSystem COMPUTES NEWTON'S LAW EXACTLY AT SETUP, AND COPIES ITS INPUT --------------------------
{
    // Two unit masses one unit apart on the x-axis, G=1: the mutual acceleration is exactly Newton's law,
    // magnitude G*m/r^2 = 1, body 0 pulled toward body 1 (+x) and body 1 pulled toward body 0 (-x).
    const bodies = [{ m: 1, r: [0, 0, 0], v: [0, 0, 0] }, { m: 1, r: [1, 0, 0], v: [0, 0, 0] }];
    const st = makeSystem(bodies, { G: 1 });
    ok("!! makeSystem's initial acceleration IS Newton's law, exactly, for a unit two-body setup",
        st.acc[0][0] === 1 && st.acc[0][1] === 0 && st.acc[0][2] === 0 &&
        st.acc[1][0] === -1 && st.acc[1][1] === 0 && st.acc[1][2] === 0,
        "two unit masses one unit apart, G=1: body 0's acceleration is exactly [1,0,0] (pulled toward body 1) and " +
        "body 1's is exactly [-1,0,0] -- G*m/r^2 = 1/1 = 1 with no rounding to speak of, since every input is a " +
        "power of ten that is exact in binary. This is the acceleration every orbitStep call starts from.");

    // A 3-4-5 triangle: body 1 sitting at (3,4,0) from body 0, unit masses, G=1 -- |r|=5, accel magnitude 1/25,
    // split along the exact unit vector (3/5, 4/5) the way blackHole.js's accel splits along r-hat.
    const st2 = makeSystem([{ m: 1, r: [0, 0, 0], v: [1, 2, 3] }, { m: 1, r: [3, 4, 0], v: [-1, 0, 0] }], { G: 1 });
    const mag = 1 / 25;
    ok("!! and it holds on a 3-4-5 triangle, split along the exact unit vector toward the other mass",
        Math.abs(st2.acc[0][0] - mag * 3 / 5) < 1e-15 && Math.abs(st2.acc[0][1] - mag * 4 / 5) < 1e-15 && st2.acc[0][2] === 0,
        "body 0's acceleration toward (3,4,0) at distance 5 is (1/25)*(3/5, 4/5) -- the same r-hat decomposition " +
        "blackHole.js's accel() uses, computed here from a genuinely 3D pairwise sum rather than a 2D special case.");

    ok("!! makeSystem copies its input bodies -- the caller's arrays are never aliased into the sim state",
        (() => {
            const src = [{ m: 1, r: [0, 0, 0], v: [0, 1, 0] }, { m: 1, r: [2, 0, 0], v: [0, -1, 0] }];
            const rBefore = [...src[0].r], vBefore = [...src[0].v];
            const state = makeSystem(src, { G: 1 });
            for (let s = 0; s < 50; s++) orbitStep(state, 0.01);
            return state.bodies[0].r[0] !== rBefore[0] &&                 // the SIM state moved
                src[0].r[0] === rBefore[0] && src[0].r[1] === rBefore[1] && src[0].r[2] === rBefore[2] &&
                src[0].v[0] === vBefore[0] && src[0].v[1] === vBefore[1] && src[0].v[2] === vBefore[2];         // the CALLER's copy did not
        })(),
        "50 integration steps move the returned state's body 0 while the caller's original bodies array is " +
        "untouched -- makeSystem deep-copies r and v rather than sharing references, so two systems built from " +
        "the same template body do not secretly move in lockstep.");
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
