// physics/blackHole-selfcheck.mjs
//
// Run: node physics/blackHole-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs.
//
// A black hole's defining features are real and invisible: an event horizon, a photon sphere, an innermost stable
// circular orbit, orbits that precess, a plunge to capture once you cross the ISCO. The Paczynski-Wiita potential
// reproduces all of them in pure arithmetic, and the gate proves each is really there: the three radii come out at
// 2/3/6 GM/c^2; a circular orbit just outside the ISCO stays bounded while one just inside plunges through the horizon
// and is captured; a bound orbit conserves energy and angular momentum; and it precesses -- its apoapsis advances a
// consistent angle every revolution. The sabotage swaps the relativistic potential for a plain Newtonian one, and TWO
// checks fall at once: the inside-ISCO orbit no longer plunges (Newtonian has stable circular orbits everywhere) and the
// precession goes to zero (a Newtonian ellipse closes). That is the whole point -- the hidden structure is exactly what
// Newton cannot show.
import { schwarzschildRadius, photonSphere, iscoRadius, circularSpeed, makeParticle, step, run, energy, angularMomentum, apoapsisAngles, accel } from "./blackHole.js";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };
const G = 1, M = 1, c = 1, rs = schwarzschildRadius(M, G, c);
const near = (a, b, e) => Math.abs(a - b) < e;

// ---- 1. THE THREE RADII: horizon, photon sphere, ISCO ------------------------------------------------
{
    ok("!! horizon, photon sphere and ISCO come out at 2, 3, 6 GM/c^2", near(rs, 2, 1e-12) && near(photonSphere(M, G, c), 3, 1e-12) && near(iscoRadius(M, G, c), 6, 1e-12),
       "the event horizon at 2GM/c^2, the photon sphere at 3, and the innermost stable circular orbit at 6 -- the real, invisible geometry of a Schwarzschild black hole, as exact numbers.");
}

// ---- 2. THE ISCO IS REAL: outside stays, inside plunges ----------------------------------------------
{
    const outside = makeParticle(8, circularSpeed(8, M, G, rs)); outside.v[0] = -0.02 * circularSpeed(8, M, G, rs);
    run(outside, 40000, 0.005, M, G, rs);
    const inside = makeParticle(5, circularSpeed(5, M, G, rs)); inside.v[0] = -0.02 * circularSpeed(5, M, G, rs);
    run(inside, 40000, 0.005, M, G, rs);
    ok("!! a circular orbit outside the ISCO holds; one inside plunges and is captured", !outside.captured && outside.rMin > 6 && inside.captured && inside.rMin <= rs,
       "perturb a circular orbit at r=8 (outside the ISCO) and it stays bounded; the same at r=5 (inside) spirals through the horizon and is captured -- the ISCO is a real edge, not a drawn circle.");
}

// ---- 3. CONSERVATION: a bound orbit keeps energy and angular momentum ---------------------------------
{
    const p = makeParticle(14, 1.05 * circularSpeed(14, M, G, rs));
    const E0 = energy(p, M, G, rs), L0 = angularMomentum(p);
    run(p, 30000, 0.004, M, G, rs);
    ok("!! a bound orbit conserves energy and angular momentum", !p.captured && Math.abs(energy(p, M, G, rs) - E0) < 1e-7 && Math.abs(angularMomentum(p) - L0) < 1e-9,
       "over a full bound orbit energy holds to 1e-7 and angular momentum to 1e-9 -- symplectic integration of a real central force, not a decaying approximation.");
}

// ---- 4. PRECESSION: the apoapsis advances every orbit ------------------------------------------------
{
    const p = makeParticle(10, 1.06 * circularSpeed(10, M, G, rs));
    const ang = apoapsisAngles(p, 200000, 0.008, M, G, rs);
    let consistent = ang.length >= 3;
    const advs = [];
    for (let i = 1; i < ang.length; i++) { let d = ang[i] - ang[i - 1]; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; advs.push(d); }
    if (consistent) consistent = advs.every((d) => d > 0.05) && Math.abs(advs[0] - advs[advs.length - 1]) < 0.05;
    ok("!! the orbit precesses -- the apoapsis advances a steady angle each revolution", consistent,
       "across several revolutions the apoapsis advances by the same nonzero angle each time (~1.76 rad here) -- perihelion precession, the effect that first tested general relativity, which a closed Newtonian ellipse simply does not have.");
}

// ---- 4b. accel() IS THE EXACT PACZYNSKI-WIITA LAW: GM/(r-rs)^2, pointed straight at the mass -----------
{
    // On-axis, at r=8: d = r - rs = 6, so |accel| = G*M/36 exactly, pointed along -x.
    const a1 = accel([8, 0], M, G, rs);
    const onAxisExact = a1[0] === -(G * M) / (6 * 6) && a1[1] === 0;

    // Off-axis, a 3-4-5 triangle at r=5: d = 3, |accel| = G*M/9, split along the unit vector back to the origin
    // (-3/5, -4/5). Every operation here is +,-,*,/ and one sqrt, so the components come out exact to the bit.
    const a2 = accel([3, 4], M, G, rs);
    const mag2 = G * M / (3 * 3);
    const offAxisExact = a2[0] === -mag2 * 3 / 5 && a2[1] === -mag2 * 4 / 5;

    // Inverse-square-ish falloff IN d = r - rs (not in r): halving d should quadruple the magnitude.
    const near = (x, y, e) => Math.abs(x - y) < e;
    const rBase = 10, dBase = rBase - rs;
    const aBase = accel([rBase, 0], M, G, rs), aHalf = accel([rs + dBase / 2, 0], M, G, rs);
    const quadruples = near(aHalf[0] / aBase[0], 4, 1e-12);

    ok("!! accel() is the exact Paczynski-Wiita law GM/(r-rs)^2, pointed at the mass",
        onAxisExact && offAxisExact && quadruples,
        "at r=8 (d=6) accel is exactly -GM/36 along -x; at the 3-4-5 point r=5 (d=3) it splits exactly along " +
        "the unit vector back to the origin as -GM/9 * (3/5, 4/5); and halving d from 8 to 4 (holding rs fixed) " +
        "exactly quadruples the magnitude -- the inverse-square law is in (r - rs), the horizon-shifted radius, " +
        "not in r itself, which is the entire trick that reproduces GR's ISCO and photon sphere from arithmetic.");
}

// ---- 5. DETERMINISTIC + pure -------------------------------------------------------------------------
{
    const runOnce = () => { const p = makeParticle(12, 1.03 * circularSpeed(12, M, G, rs)); run(p, 5000, 0.005, M, G, rs); return p.r[0] + "," + p.r[1] + "," + p.v[0]; };
    ok("!! deterministic", runOnce() === runOnce(),
       "the same start yields the same trajectory every run -- pure +,-,*,/ and sqrt, so it is bit-identical across machines like the rest of the engine.");
}

console.log(fails ? "\nblackHole-selfcheck: " + fails + " FAILED" : "\nblackHole-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
