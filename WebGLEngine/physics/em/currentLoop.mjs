// physics/em/currentLoop.mjs
//
// The magnetic field of a circular current loop, EVERYWHERE -- not just on its axis. This is the closed form
// that made elliptic integrals worth having at v3625, and it is one of the very few exact off-axis field
// solutions in all of electromagnetism.
//
// With the loop of radius a carrying current I in the z = 0 plane, at a field point (r, z) in cylindrical
// coordinates, and
//
//     A = (a + r)^2 + z^2,   B = (a - r)^2 + z^2,   m = 4 a r / A
//
//     Bz = (mu0 I) / (2 pi sqrt(A)) * [  K(m) + E(m) (a^2 - r^2 - z^2) / B ]
//     Br = (mu0 I z) / (2 pi r sqrt(A)) * [ -K(m) + E(m) (a^2 + r^2 + z^2) / B ]
//
// *** THE PARAMETER IS m AND NOT THE MODULUS k, AND THIS IS THE TRAP v3625's GATE PREDICTED, NOW STANDING IN
// REAL PHYSICS. Half the literature writes these with k where k^2 = 4ar/A, and the two conventions produce
// DIFFERENT FIELDS. What makes it dangerous here rather than merely wrong is WHERE it hides: on the axis r = 0
// gives m = 0 and K = E = pi/2 under EITHER convention, so the wrong one reproduces the elementary on-axis law
// EXACTLY, matches the centre value mu0 I / (2a) EXACTLY, and matches the far-field dipole ON AXIS exactly. It
// fails only OFF axis -- which is precisely the region this whole file exists to compute, and the only region
// where nobody has an elementary answer to check against. The gate builds that mutant and shows it passing
// three keys and failing div B. ***
//
// THE ANSWER KEYS, AND FOUR OF THE FIVE ARE OUTSIDE THIS FILE ENTIRELY:
//   1. ON AXIS the field is elementary: Bz(0, z) = mu0 I a^2 / (2 (a^2 + z^2)^(3/2)). The elliptic form must
//      REDUCE to it. Nothing about elliptic integrals is used to state that target.
//   2. AT THE CENTRE, Bz = mu0 I / (2a) exactly.
//   3. BIOT-SAVART BY QUADRATURE -- integrate the law itself around the loop. Shares no code with the elliptic
//      route: no K, no E, no Carlson. This is the AGM's role from v3625, played by a different method.
//   4. div B = 0. An EXACT IDENTITY of nature, measured here by central differences on the cylindrical
//      divergence (1/r) d(r Br)/dr + dBz/dz. It needs no reference value at all, which is what makes it the
//      check the convention mutant cannot survive.
//   5. AMPERE'S LAW: the circulation of B around a small circuit threading the wire is mu0 I -- a number set by
//      the current alone, with nothing from the geometry of the field in it.
//   6. THE FAR FIELD IS A DIPOLE with moment I * pi * a^2, and the approach is an ORDER, not an error.
//
// WHAT IT REFUSES, BY NAME:
//   * A FIELD POINT ON THE WIRE (r = a, z = 0): m = 1 there, K diverges, and so does the true field. Returning
//     a large finite number would be decoration. This returns null and says the point is on the conductor.
//   * NEGATIVE r. r is a cylindrical radius; a caller passing a signed x-coordinate wants the |r| and a sign
//     flip on Br, and doing that silently would hide the caller's own confusion.
//
// BROWSER-SAFE: imports only math/elliptic.js, which is itself import-free. No DOM, no node builtins.

import { ellipK, ellipEc } from "../../math/elliptic.js";
import { MU0 } from "./maxwell.mjs";

// mu0 IS IMPORTED, NOT RE-DECLARED. A second copy of a physical constant beside the first is this tree's most
// repeated defect -- TWO DECLARATIONS ABOUT ONE THING NOBODY EVER COMPARED -- and the fix is always to share the
// derivation rather than to write a gate that checks two literals against each other. maxwell.mjs owns it.
export { MU0 };

// The exact field. Returns { Br, Bz, m } in tesla, or null on a refusal.
export function loopField({ a = 1, I = 1, r = 0, z = 0, mu0 = MU0 } = {}) {
    if (!(a > 0) || !(r >= 0)) return null;
    const A = (a + r) * (a + r) + z * z, B = (a - r) * (a - r) + z * z;
    if (!(B > 0)) return null;                          // exactly on the wire: the true field diverges here
    const m = 4 * a * r / A;
    const K = ellipK(m), E = ellipEc(m);
    if (K === null || E === null) return null;
    const pre = mu0 * I / (2 * Math.PI * Math.sqrt(A));
    const Bz = pre * (K + E * (a * a - r * r - z * z) / B);
    // Br carries a 1/r that is a removable singularity: on the axis the field is purely axial, exactly.
    const Br = r === 0 ? 0 : pre * (z / r) * (-K + E * (a * a + r * r + z * z) / B);
    return { Br, Bz, m };
}

// KEY 1, and it owes nothing to elliptic integrals: the elementary on-axis law.
export const onAxisExact = ({ a = 1, I = 1, z = 0, mu0 = MU0 } = {}) =>
    mu0 * I * a * a / (2 * Math.pow(a * a + z * z, 1.5));

// KEY 2: the centre.
export const centreExact = ({ a = 1, I = 1, mu0 = MU0 } = {}) => mu0 * I / (2 * a);

// KEY 6: the far field is a point dipole of moment I * pi * a^2. Written in the spherical form so that it is a
// statement about a DIPOLE rather than a rearrangement of the loop formula.
export function dipoleField({ a = 1, I = 1, r = 0, z = 0, mu0 = MU0 } = {}) {
    const mDip = I * Math.PI * a * a, R = Math.hypot(r, z);
    if (R === 0) return null;
    const ct = z / R, st = r / R, pre = mu0 * mDip / (4 * Math.PI * R * R * R);
    return { Bz: pre * (3 * ct * ct - 1), Br: pre * (3 * ct * st) };
}

// ------------------------------------------------------------------------------------------------------------
// KEY 3 -- BIOT-SAVART BY QUADRATURE. The law itself, integrated around the loop. Nothing here calls K or E.
//
//   dB = (mu0 I / 4 pi) dl x R / |R|^3,  dl = a (-sin p, cos p, 0) dp,  R = (r - a cos p, -a sin p, z)
//   the y component cancels by symmetry, leaving
//     Br = (mu0 I a z / 4 pi) INT cos p / |R|^3 dp
//     Bz = (mu0 I a / 4 pi) INT (a - r cos p) / |R|^3 dp
//
// Composite Simpson on [0, 2pi]. It gets slow and inaccurate near the wire, where |R| nearly vanishes -- that
// is a property of the quadrature and not of the field, and the gate reports where it stops being a witness
// rather than quietly widening a tolerance.
// ------------------------------------------------------------------------------------------------------------
export function loopFieldBiotSavart({ a = 1, I = 1, r = 0, z = 0, mu0 = MU0, n = 20000 } = {}) {
    if (n % 2) n++;
    const h = 2 * Math.PI / n;
    let sr = 0, sz = 0;
    for (let i = 0; i <= n; i++) {
        const p = i * h, c = Math.cos(p);
        const R2 = r * r + a * a - 2 * a * r * c + z * z;
        if (!(R2 > 0)) return null;
        const inv3 = 1 / (R2 * Math.sqrt(R2));
        const w = (i === 0 || i === n) ? 1 : (i % 2 ? 4 : 2);
        sr += w * c * inv3;
        sz += w * (a - r * c) * inv3;
    }
    const k = mu0 * I * a / (4 * Math.PI) * h / 3;
    return { Br: k * z * sr, Bz: k * sz };
}

// ------------------------------------------------------------------------------------------------------------
// KEY 4 -- div B, in cylindrical coordinates, by central differences on the shipped field:
//     div B = (1/r) d(r Br)/dr + dBz/dz
// This needs NO reference value, which is exactly why it is the check that catches a wrong convention: a field
// that is not a magnetic field has nowhere to hide. Returned NORMALISED by |B|/a so it is dimensionless and
// comparable across radii -- a raw divergence in tesla per metre says nothing about how wrong it is.
// ------------------------------------------------------------------------------------------------------------
export function divergence({ a = 1, I = 1, r = 0.5, z = 0.3, h = 1e-4, field = loopField } = {}) {
    const at = (rr, zz) => field({ a, I, r: rr, z: zz });
    const p1 = at(r + h, z), m1 = at(r - h, z), q1 = at(r, z + h), q2 = at(r, z - h), c = at(r, z);
    if (!p1 || !m1 || !q1 || !q2 || !c) return null;
    const drRBr = ((r + h) * p1.Br - (r - h) * m1.Br) / (2 * h);
    const dzBz = (q1.Bz - q2.Bz) / (2 * h);
    const div = drRBr / r + dzBz;
    const scale = Math.hypot(c.Br, c.Bz) / a;
    return { div, relative: Math.abs(div) / Math.max(scale, 1e-300) };
}

// ------------------------------------------------------------------------------------------------------------
// KEY 5 -- AMPERE'S LAW. Circulate B around a small circle of radius rho in the (r, z) half-plane, centred on
// the wire at (a, 0), and the result must be mu0 I regardless of rho. The circuit encircles the conductor, so
// the answer is fixed by the CURRENT ALONE and by nothing about the field's shape.
//
// Parametrise the circuit by t: (r, z) = (a + rho cos t, rho sin t), tangent (-sin t, cos t) rho dt, so
//     INT B . dl = rho INT [ -Br sin t + Bz cos t ] dt
// ------------------------------------------------------------------------------------------------------------
export function ampereCirculation({ a = 1, I = 1, rho = 0.05, mu0 = MU0, n = 40000, field = loopField } = {}) {
    if (n % 2) n++;
    const h = 2 * Math.PI / n;
    let s = 0;
    for (let i = 0; i <= n; i++) {
        const t = i * h, ct = Math.cos(t), st = Math.sin(t);
        const f = field({ a, I, r: a + rho * ct, z: rho * st, mu0 });
        if (!f) return null;
        const w = (i === 0 || i === n) ? 1 : (i % 2 ? 4 : 2);
        s += w * (-f.Br * st + f.Bz * ct);
    }
    return rho * s * h / 3;
}
