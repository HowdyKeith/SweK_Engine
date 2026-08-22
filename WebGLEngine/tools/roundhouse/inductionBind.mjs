// tools/roundhouse/inductionBind.mjs
//
// v3731 -- roundhouse device: MAXWELL IN INTEGRAL FORM (physics/blobInduction.js).
//
// *** THE MODULE WAS TOLD ITS TWO FORMULAS AND ITS DOCSTRING DERIVES THEM. *** blobInduction.js states
// "closed integral of E.dl = -dPhi/dt -> E_phi * 2*pi*s = -(pi s^2) dB/dt -> E_phi = -(s/2) dB/dt" and then
// implements the RIGHT-HAND END of that chain. Grading E_phi against -(s/2)dB/dt is reading the docstring back
// to itself. Same for the Coulomb field: it is written down as k Q rhat / r^2 and returns exactly that.
//
// *** SO GRADE THE LEFT-HAND END. BOTH LAWS HERE ARE STATEMENTS ABOUT INTEGRALS OVER CLOSED CURVES AND
// SURFACES, AND THE FILE COMPUTES NEITHER -- there is no line integral, no surface integral and no quadrature
// anywhere in it. Its only checking tool is a pointwise numerical `divergence`. ***
//
//   1. FARADAY, AND THE PART THAT IS NOT IN THE DOCSTRING: the circulation around a loop depends ONLY ON THE
//      AREA IT ENCLOSES, NOT ON WHERE THE LOOP SITS. The shipped E_phi is written in terms of s, the distance
//      from the axis, so a loop at (3,-2) is in a visibly different field from one at the origin -- and yet
//      MEASURED: circulation -11.623892818 around radius 1 at the origin, at (0.7,0) and at (3,-2), against an
//      exact -(dB/dt) pi a^2 = -11.623892818, to 1.5e-16 at the off-centre one. NOTHING TOLD IT THAT.
//   2. GAUSS: the flux of the Coulomb field through a closed surface is 4 pi k Q ENCLOSED, independent of the
//      radius -- and ZERO when the charge is outside. MEASURED: 12.566402913 at R = 0.5, 1, 2 and 7, and
//      2.44e-7 for a sphere that does not contain the charge.
//
// *** AND THE TWO GAUSS NUMBERS ARE LIMITED BY DIFFERENT THINGS, WHICH IS WHY THEY GET DIFFERENT BARS
// (v3724's rule, and v3730's two-bar case again). THE RADIUS-INDEPENDENCE IS EXACT PHYSICS: the four readings
// agree with each other to ~1e-12. THE ABSOLUTE VALUE IS LIMITED BY MY QUADRATURE: all four sit 2.57e-6 above
// 4 pi k, and that offset is the lat/long grid, not the field. Asserting one bar for both would either bless a
// broken exponent or fail an honest one. THE GIVE-AWAY IS THAT THE ERROR IS THE SAME AT EVERY RADIUS -- a
// physics error would move with R; a quadrature error cannot. ***
//
// *** THE 2x2 TABLE, WHICH IS A FINDING ABOUT THE SHIPPED FILE AND NOT JUST ABOUT THESE KEYS:
//                          circulation           flux              divergence
//        induced E         -11.623892818         4.30e-18          5.55e-11
//        Coulomb E          9.89e-19             12.566402913     -1.74e-13
// EACH FIELD IS ANNIHILATED BY THE OTHER'S INTEGRAL -- the induced field has circulation and no flux, the
// Coulomb field has flux and no circulation. AND DIVERGENCE, WHICH IS THE ONLY CHECKING TOOL THE MODULE SHIPS,
// READS ZERO FOR BOTH: the operator the file provides to check its work is exactly the one that CANNOT TELL
// ITS TWO FIELDS APART. That is not a defect in blobInduction -- div E = 0 away from the charge is correct and
// the file never claimed otherwise -- but it is the reason a grade here had to be integral and not pointwise.
// ASK WHETHER THE OBSERVABLE EVER CLAIMED TO LOOK (v3715). ***
//
// NOT CLAIMED: that blobInduction.js is correct. blobCharge, blobCoulombE, radialAzimuthal and the blob-shaped
// source are UNGRADED here; these keys drive inducedE and coulombE. NOT PLANTED: the curriculum asked for a
// GRADE, and the three plants below were run against the shipped file and REVERTED.

import { inducedE, coulombE, divergence, K_COULOMB } from "../../physics/blobInduction.js";

import { pathToFileURL } from "node:url";
// v3902 -- ONE declaration of the mode list; it lived in the defaults whitelist AND in the device object.
// The FOURTH device this round carrying that duplicate (splat, multigridgpu, geometry were the others), and on
// splatBind the second copy silently coerced a new plant mode to the primary so both arms read bit-identical
// numbers. THE SECOND COPY IS NEVER THE ONE THAT GETS UPDATED.
export const INDUCTION_MODES = ["faraday", "gauss", "separation", "radialdot"];

export const INDUCTION_OBSERVABLES = [
    "circulation", "circulationExact", "circulationErr", "circulationWorstErr", "loops",
    "fluxAtRadius", "fluxExact", "fluxSpread", "fluxAbsErr", "fluxOutside", "radii",
    "circulationOfCoulomb", "fluxOfInduced", "divergenceOfInduced", "divergenceOfCoulomb", "separates",
    "dBdt", "charge", "quadN", "kind",
];

const DEF = { dBdt: 3.7, charge: 1, nLoop: 20000, nTheta: 200, nPhi: 400, h: 1e-5 };

export function inductionDefaults(hyp) {
    const h = { mode: "faraday", ...(hyp || {}) };
    const c = { ...DEF, ...(h.config || {}) };
    const num = (v, d) => (typeof v === "number" && Number.isFinite(v) ? v : d);
    c.dBdt = Math.min(1e3, Math.max(-1e3, num(c.dBdt, DEF.dBdt)));
    c.charge = Math.min(1e3, Math.max(-1e3, num(c.charge, DEF.charge)));
    c.nLoop = Math.min(2e5, Math.max(200, num(c.nLoop, DEF.nLoop) | 0));
    c.nTheta = Math.min(800, Math.max(40, num(c.nTheta, DEF.nTheta) | 0));
    c.nPhi = Math.min(1600, Math.max(80, num(c.nPhi, DEF.nPhi) | 0));
    h.config = c;
    if (!INDUCTION_MODES.includes(h.mode)) h.mode = "faraday";   // v3902 -- ONE declaration, read here and by the device
    if (!h.claim || !h.claim.observable) {
        h.claim = h.mode === "faraday" ? { observable: "circulationWorstErr", max: 1e-10 }
            : h.mode === "gauss" ? { observable: "fluxSpread", max: 1e-9 }
                : { observable: "separates", is: true };
    }
    return h;
}

/**
 * Circulation of a planar field around a circle of radius `a` centred at (cx, cy). EXPORTED so a gate drives
 * the same quadrature rather than a second spelling of it. Midpoint rule on a closed smooth curve, which is
 * SPECTRALLY accurate -- that is why the Faraday bar can be 1e-10 while the surface integral's cannot.
 */
export function circulationAround(F, cx, cy, a, n, radial = false) {
    let s = 0;
    const dt = (2 * Math.PI) / n;
    for (let i = 0; i < n; i++) {
        const t = dt * (i + 0.5), ct = Math.cos(t), st = Math.sin(t);
        const [ex, ey] = F(cx + a * ct, cy + a * st);
        // *** v3902 -- `radial` IS THE PLANT: DOT WITH rhat INSTEAD OF phihat. *** A line integral is E.dl and
        // dl points ALONG the curve; rhat is the one unit vector at every point that is perpendicular to it.
        // The slip is a single sign-and-swap away from the correct expression and produces a number, not an
        // error. THE WHOLE EXPRESSION BRANCHES rather than sharing a factored sub-expression, so the default
        // arm is bit-identical.
        s += radial ? (ex * ct + ey * st) * a * dt : (-ex * st + ey * ct) * a * dt;
    }
    return s;
}

/** Flux of a 3D field through a sphere of radius R centred at (cx, cy, cz). Lat/long grid, midpoint in both. */
export function fluxThrough(F, R, cx, cy, cz, nTheta, nPhi) {
    let s = 0;
    const dth = Math.PI / nTheta, dph = (2 * Math.PI) / nPhi;
    for (let i = 0; i < nTheta; i++) {
        const th = dth * (i + 0.5), st = Math.sin(th), ct = Math.cos(th);
        for (let j = 0; j < nPhi; j++) {
            const ph = dph * (j + 0.5);
            const nx = st * Math.cos(ph), ny = st * Math.sin(ph), nz = ct;
            const [ex, ey, ez] = F(cx + R * nx, cy + R * ny, cz + R * nz);
            s += (ex * nx + ey * ny + ez * nz) * R * R * st * dth * dph;
        }
    }
    return s;
}

const LOOPS = [[0, 0, 1], [0, 0, 2.5], [0.7, 0, 1], [3, -2, 1], [5, 5, 0.25], [0, 0, 0.1]];
const RADII = [0.5, 1, 2, 7];

export async function buildInduction(hyp, base = {}) {
    const h = inductionDefaults({ ...hyp, config: { ...(base || {}), ...(hyp && hyp.config) } });
    const c = h.config;
    const Eind2 = (x, y) => inducedE(x, y, c.dBdt);
    const Eind3 = (x, y) => { const [a, b] = inducedE(x, y, c.dBdt); return [a, b, 0]; };
    const Ecoul = (x, y, z) => coulombE(x, y, z, c.charge);

    if (h.mode === "faraday" || h.mode === "radialdot") {
        const radial = h.mode === "radialdot";
        const rows = LOOPS.map(([cx, cy, a]) => {
            const got = circulationAround(Eind2, cx, cy, a, c.nLoop, radial);
            const exact = -c.dBdt * Math.PI * a * a;         // -dPhi/dt: THE AREA, and nothing about where
            return { cx, cy, a, got, exact, err: Math.abs(got - exact) / Math.abs(exact) };
        });
        if (rows.some((r) => !Number.isFinite(r.err))) return { error: "circulation-not-finite" };
        const one = rows[0];
        return {
            kind: "faraday",
            circulation: one.got, circulationExact: one.exact, circulationErr: one.err,
            circulationWorstErr: Math.max(...rows.map((r) => r.err)),
            loops: rows.length, dBdt: c.dBdt, quadN: c.nLoop,
        };
    }

    if (h.mode === "gauss") {
        const f = RADII.map((R) => fluxThrough(Ecoul, R, 0, 0, 0, c.nTheta, c.nPhi));
        if (f.some((v) => !Number.isFinite(v))) return { error: "flux-not-finite" };
        const exact = 4 * Math.PI * K_COULOMB * c.charge;
        // a sphere of radius 1 about the origin with the charge moved to x = 5: ENCLOSING NOTHING
        const outside = fluxThrough((x, y, z) => coulombE(x - 5, y, z, c.charge), 1, 0, 0, 0, c.nTheta, c.nPhi);
        return {
            kind: "gauss",
            fluxAtRadius: f[0], fluxExact: exact,
            fluxSpread: (Math.max(...f) - Math.min(...f)) / Math.abs(exact),   // EXACT physics
            fluxAbsErr: Math.abs(f[0] - exact) / Math.abs(exact),              // MY QUADRATURE
            fluxOutside: Math.abs(outside) / Math.abs(exact),
            radii: RADII.slice(), charge: c.charge, quadN: c.nTheta * c.nPhi,
        };
    }

    // *** THE 2x2 TABLE. Each field against the OTHER's integral, plus the operator the module ships. ***
    const circInd = circulationAround(Eind2, 0, 0, 1, c.nLoop);
    const circCoul = circulationAround((x, y) => { const [a, b] = coulombE(x, y, 0.3, c.charge); return [a, b]; }, 0, 0, 1, c.nLoop);
    const fluxInd = fluxThrough(Eind3, 1, 0, 0, 0, c.nTheta, c.nPhi);
    const fluxCoul = fluxThrough(Ecoul, 1, 0, 0, 0, c.nTheta, c.nPhi);
    const divInd = divergence(Eind3, 1, 2, 3, c.h);
    const divCoul = divergence(Ecoul, 1, 2, 3, c.h);
    const scale = Math.abs(4 * Math.PI * K_COULOMB * c.charge);
    return {
        kind: "separation",
        circulation: circInd, circulationOfCoulomb: Math.abs(circCoul) / Math.abs(circInd || 1),
        fluxAtRadius: fluxCoul, fluxOfInduced: Math.abs(fluxInd) / scale,
        divergenceOfInduced: divInd, divergenceOfCoulomb: divCoul,
        // THE CLAIM: the two INTEGRALS separate the fields and the pointwise operator does not.
        separates: Math.abs(circInd) > 1 && Math.abs(circCoul) < 1e-9 &&
            Math.abs(fluxCoul) > 1 && Math.abs(fluxInd) / scale < 1e-9 &&
            Math.abs(divInd) < 1e-6 && Math.abs(divCoul) < 1e-6,
        dBdt: c.dBdt, charge: c.charge, quadN: c.nLoop,
    };
}

export const inductionDevice = {
    // *** THE INDUCED FIELD IS PURELY AZIMUTHAL, SO DOTTING WITH rhat DOES NOT DEGRADE THE ANSWER -- IT
    // ANNIHILATES IT. *** MEASURED: circulation -1.162389e+1 -> -7.871036e-19, which is zero to the width of
    // the quadrature, against an exact -11.623892818 that does not move. circulationWorstErr therefore goes
    // 1.677432e-13 -> 1.0000000000000044: the relative error SATURATING AT UNITY, which is what "the answer is
    // gone" looks like as a ratio rather than "the answer is wrong". The 2x2 table in the header is the same
    // fact from the other side: each field is annihilated by the OTHER's integral, and this plant simply
    // applies the wrong one of the two to the induced field.
    plantMode: "radialdot", plantFlips: "circulationWorstErr", plantKind: "reader",
    modes: INDUCTION_MODES,
    name: "induction-integral-forms",
    observables: INDUCTION_OBSERVABLES,
    build: buildInduction,
    defaults: inductionDefaults,
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    const f = await buildInduction({ mode: "faraday" });
    const g = await buildInduction({ mode: "gauss" });
    const s = await buildInduction({ mode: "separation" });
    console.log("[induction] THE INTEGRAL FORMS, WHICH THE MODULE STATES IN PROSE AND NEVER COMPUTES\n");
    console.log("  FARADAY -- circulation depends ONLY on the enclosed area, not on where the loop sits");
    console.log("    worst relative error over", f.loops, "loops (including one centred at (3,-2)):",
        f.circulationWorstErr.toExponential(3));
    console.log("    at the origin:", f.circulation.toFixed(9), "vs -(dB/dt) pi a^2 =", f.circulationExact.toFixed(9));
    console.log("\n  GAUSS -- flux through a closed surface is 4 pi k Q ENCLOSED");
    console.log("    across radii", g.radii.join(", ") + ":  SPREAD", g.fluxSpread.toExponential(3),
        "(exact physics)  vs ABSOLUTE offset", g.fluxAbsErr.toExponential(3), "(my quadrature)");
    console.log("    a sphere with the charge OUTSIDE it:", g.fluxOutside.toExponential(3), "of 4 pi k -- Gauss's other half");
    console.log("\n  THE 2x2 TABLE -- each field is annihilated by the OTHER's integral");
    console.log("    circulation: induced", s.circulation.toFixed(6), " coulomb", s.circulationOfCoulomb.toExponential(3), "(relative)");
    console.log("    flux:        coulomb", s.fluxAtRadius.toFixed(6), " induced", s.fluxOfInduced.toExponential(3), "(relative)");
    console.log("    divergence:  induced", s.divergenceOfInduced.toExponential(3), " coulomb", s.divergenceOfCoulomb.toExponential(3));
    console.log("    *** THE OPERATOR THE MODULE SHIPS TO CHECK ITS WORK IS THE ONE THAT CANNOT TELL ITS TWO");
    console.log("        FIELDS APART. That is not a defect -- div E = 0 away from the charge is correct and the");
    console.log("        file never claimed otherwise -- it is why this grade had to be integral, not pointwise. ***");
}
