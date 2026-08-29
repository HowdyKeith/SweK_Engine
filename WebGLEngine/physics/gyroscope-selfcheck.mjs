// physics/gyroscope-selfcheck.mjs
//
// Run: node physics/gyroscope-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs.
//
// A spinning gyroscope precesses instead of falling. The gate holds the model to the mechanics that make it do so: its
// axis sweeps around the vertical rather than tipping over; it holds its tilt and its angular-momentum magnitude while
// it does (so it precesses steadily rather than spiralling down); the change in angular momentum each step is exactly
// perpendicular to both the axis and the vertical (dL/dt = tau, and tau is the sideways gravity torque); and, the fact
// that surprises everyone, a FASTER spin precesses SLOWER, the rate going as one over the angular momentum. The
// sabotage points the torque along the axis instead of across it, and the gyroscope SPINS UP WHILE THE AXIS STAYS PUT (v3197 measured it: |L| grows seventeen hundred times faster than clean while the tilt moves by 2e-14, which is round-off -- A TORQUE PARALLEL TO L CHANGES ITS MAGNITUDE AND CANNOT ROTATE IT, so "and tips", which this sentence said until v3197, described an outcome the mechanics do not produce) instead of
// precessing -- the tilt is no longer held and the precession check fails.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { makeGyro, gyroStep, cosTilt, spinMag, axisOf } from "./gyroscope.js";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };
const hp = (a) => { const b = Buffer.alloc(a.length * 8); for (let i = 0; i < a.length; i++) b.writeDoubleLE(a[i], i * 8); return createHash("sha256").update(b).digest("hex"); };
// azimuthal sweep of the axis around the vertical, from the horizontal (x,z) projection -- sin of the swept angle
function sweep(omega, steps) {
    const g = makeGyro({ omega, I: 1 }), h0 = [g.L[0], g.L[2]], m0 = Math.sqrt(h0[0] ** 2 + h0[1] ** 2);
    for (let s = 0; s < steps; s++) gyroStep(g, { tipTorque: 12, dt: 1 / 60 });
    const h1 = [g.L[0], g.L[2]], m1 = Math.sqrt(h1[0] ** 2 + h1[1] ** 2);
    return { sinPhi: (h0[0] * h1[1] - h0[1] * h1[0]) / (m0 * m1), g };
}

// ---- 1. PRECESSION: the axis sweeps around the vertical --------------------------------------------------
{
    const s = sweep(40, 30);
    ok("!! a spinning gyroscope precesses -- its axis sweeps around the vertical", Math.abs(s.sinPhi) > 0.05,
       "the horizontal projection of the spin axis rotates through the run (sin of the swept angle " + s.sinPhi.toFixed(3) + ") -- the axis goes around the vertical rather than standing still.");
}

// ---- 2. HOLDS ITS TILT and its |L| -- it precesses, it does not fall --------------------------------------
{
    const g = makeGyro({ omega: 40, I: 1 }), t0 = cosTilt(g), L0 = spinMag(g);
    for (let s = 0; s < 400; s++) gyroStep(g, { tipTorque: 12, dt: 1 / 60 });
    ok("!! the axis holds its tilt and its angular momentum -- steady precession, not a fall", Math.abs(cosTilt(g) - t0) < 0.01 && Math.abs(spinMag(g) - L0) / L0 < 0.01,
       "over 400 steps the tilt cosine holds at " + cosTilt(g).toFixed(3) + " (from " + t0.toFixed(3) + ") and |L| within one percent -- the torque is perpendicular to L, so neither the tilt nor the spin bleeds away.");
}

// ---- 3. dL is perpendicular to both the axis and the vertical --------------------------------------------
{
    const g = makeGyro({ omega: 40, I: 1 }), before = [...g.L];
    gyroStep(g, { tipTorque: 12, dt: 1 / 60 });
    const dL = [g.L[0] - before[0], g.L[1] - before[1], g.L[2] - before[2]];
    const dotAxis = dL[0] * before[0] + dL[1] * before[1] + dL[2] * before[2], dotVert = dL[1];
    ok("!! the change in angular momentum is perpendicular to both the axis and the vertical", Math.abs(dotAxis) < 1e-9 && Math.abs(dotVert) < 1e-12,
       "dL . L = " + dotAxis.toExponential(1) + " and dL . vertical = " + dotVert.toExponential(1) + " -- the gravity torque pushes sideways, which is why the axis turns instead of dropping.");
}

// ---- 4. FASTER SPIN, SLOWER PRECESSION: rate goes as 1/|L| ------------------------------------------------
{
    const slow = sweep(30, 15).sinPhi, fast = sweep(60, 15).sinPhi, ratio = slow / fast;
    ok("!! a faster spin precesses slower -- the rate goes as one over the spin", Math.abs(ratio - 2) < 0.05,
       "doubling the spin from 30 to 60 halves the precession: the swept angle drops by " + ratio.toFixed(2) + "x -- the gyroscope's counterintuitive signature, rate = mgl/|L|.");
}

// ---- 4b. axisOf IS L/|L| EXACTLY, ON A CONSTRUCTED 3-4-5 ANGULAR-MOMENTUM VECTOR --------------------------
{
    // L = (3, 4, 0) is a 3-4-5 triangle: |L| = 5, and the unit axis is (0.6, 0.8, 0) -- both components
    // exactly representable in binary, so this is bit equality, not a tolerance.
    const a1 = axisOf({ L: [3, 4, 0] });
    ok("!! axisOf(L) is L/|L| exactly, for a constructed 3-4-5 angular-momentum vector", a1[0] === 0.6 && a1[1] === 0.8 && a1[2] === 0,
       "L = (3,4,0) has |L| = 5, so the spin axis is exactly (0.6, 0.8, 0) -- 3/5 and 4/5 are each correctly " +
       "rounded to the same double as the 0.6 and 0.8 literals, so this is bit equality, not an approximation.");

    // A second exact case with all three components live: L = (2, 3, 6), |L| = sqrt(4+9+36) = 7.
    const a2 = axisOf({ L: [2, 3, 6] });
    ok("!! and on a fully 3D vector, L = (2,3,6) with |L| = 7 exactly", a2[0] === 2 / 7 && a2[1] === 3 / 7 && a2[2] === 6 / 7,
       "2^2+3^2+6^2 = 49 = 7^2 exactly, so |L| is an exact integer and each axis component is bit-identical to " +
       "the corresponding division computed independently here.");

    // Tie it to the quantity the rest of this gate already trusts: cosTilt(state) is defined as L[1]/|L|,
    // which is exactly the y-component of axisOf(state) -- the tilt IS the vertical component of the unit axis.
    const g = makeGyro({ omega: 40, I: 1 }); for (let s = 0; s < 100; s++) gyroStep(g, { tipTorque: 12, dt: 1 / 60 });
    ok("!! axisOf(state)[1] IS cosTilt(state) -- the tilt cosine is the vertical component of the unit spin axis",
        axisOf(g)[1] === cosTilt(g),
        "cosTilt is defined as L[1]/|L|; axisOf is L/|L|; its y-component is the same division by construction. " +
        "After 100 steps of real precession this still holds exactly, tying the untested axis directly to the " +
        "tilt quantity checks 2 and 4 above already grade.");

    // And it is always a unit vector, for an L that has actually precessed (not just at t=0).
    const m = Math.sqrt(axisOf(g)[0] ** 2 + axisOf(g)[1] ** 2 + axisOf(g)[2] ** 2);
    ok("!! axisOf always returns a unit vector", Math.abs(m - 1) < 1e-14, "|axisOf(state)| = " + m.toFixed(15) + " after 100 steps of precession.");
}

// ---- 5. DETERMINISTIC + PURE (no trig) -------------------------------------------------------------------
{
    const g1 = makeGyro({ omega: 40, I: 1 }); for (let s = 0; s < 200; s++) gyroStep(g1, { tipTorque: 12, dt: 1 / 60 });
    const g2 = makeGyro({ omega: 40, I: 1 }); for (let s = 0; s < 200; s++) gyroStep(g2, { tipTorque: 12, dt: 1 / 60 });
    const src = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "gyroscope.js"), "utf8").replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
    const clean = !/Math\.(sin|cos|tan|exp|log|pow|hypot|random|acos|asin|atan)\b/.test(src);
    ok("!! the gyroscope is deterministic and uses only +,-,*,/,sqrt", hp(g1.L) === hp(g2.L) && clean,
       "the run reproduces byte-for-byte and the integration is cross products and one square root -- no trig, so it is bit-identical across machines and can join the fingerprint.");
}

console.log(fails ? "\ngyroscope-selfcheck: " + fails + " FAILED" : "\ngyroscope-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
