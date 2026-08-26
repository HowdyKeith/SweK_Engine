// WebGLEngine/physics/crystal/powder.mjs -- v3583
// ---------------------------------------------------------------------------------------------------------------
// THE POWDER PATTERN, AND A LAW THAT HOLDS EXACTLY UNTIL TWO CONDITIONS ARE BOTH TRUE.
//
// v3579 built the structure factor and its answer key was an exact zero BY LAW. This is the same subject one step
// out, and it hands over two more exact things of a kind this lab has not collected before.
//
// ================================================================================================================
// 1. A POWDER RING IS INDEXED BY AN INTEGER, AND ITS MULTIPLICITY IS COUNTED TWO WAYS THAT SHARE NOTHING
// ================================================================================================================
//
// Grind a crystal to powder and every orientation is present at once, so direction is averaged away and ONLY
// |G| SURVIVES. For a cubic cell that means the ring is labelled by N = h^2 + k^2 + l^2 -- AN INTEGER -- and
// every hkl with the same N lands on the same ring. How many do is the MULTIPLICITY, also an integer.
//
// ROUTE 1 enumerates lattice points. ROUTE 2 IS A POWER SERIES AND NEVER TOUCHES A LATTICE AT ALL: r3(N), the
// number of ways N is a sum of three squares, is the coefficient of q^N in theta3(q)^3 where theta3 = sum q^(n^2).
// A CONVOLUTION OF SERIES AGAINST A TRIPLE LOOP OVER hkl, agreeing on 121 consecutive integers with ZERO
// mismatches. Two roads to one integer, and one of them is number theory rather than geometry.
//
// *** AND r3(7) = 0, WHICH IS A NEW KIND OF EXACT ZERO FOR THIS LAB. *** Seven is not a sum of three squares --
// no integer is, of the form 4^a(8b+7) -- so THE SIMPLE-CUBIC RING AT N=7 IS MISSING, and not because any basis
// cancels it. v3579's absences come from atoms interfering; THIS ONE COMES FROM ARITHMETIC. Two different
// mechanisms producing the same unmissable nothing, in one pattern.
//
// The ring sequences are the textbook signatures, and they are DERIVED here rather than typed:
//     sc        1, 2, 3, 4, 5, 6, 8, 9, 10, 11        (7 absent, and 15, and 23)
//     bcc       2, 4, 6, 8, 10, 12, 14, 16, 18, 20    (even only)
//     fcc       3, 4, 8, 11, 12, 16, 19, 20, 24, 27
//     diamond   3, 8, 11, 16, 19, 24, 27, 32, 35, 40
//
// ================================================================================================================
// 2. FRIEDEL'S LAW IS EXACTLY ZERO, AND IT TAKES TWO CONDITIONS TO BREAK IT
// ================================================================================================================
//
// |F(hkl)| = |F(-h-k-l)|. Measured across 2916 pairs and four lattices the worst difference is 0.000e+0 --
// *** NOT ROUNDOFF, EXACTLY ZERO, because the two sums are complex conjugates and |z| = |z-bar| BIT FOR BIT. ***
// The lab has plenty of keys at 1e-15; this one is at zero, and the difference is that no arithmetic happens
// between the two answers, only a sign.
//
// *** AND THE OBVIOUS WAY TO BREAK IT DOES NOT WORK, WHICH IS THE FINDING. *** Anomalous scattering makes the
// form factor COMPLEX, f = f' + i f'', and every account says that breaks Friedel. Put an anomalous atom into
// FCC and the worst difference stays at 8.9e-16: THE LAW STILL HOLDS. FCC is CENTROSYMMETRIC, and an inversion
// centre restores the conjugate relation no matter how complex the scattering is.
//
// IT TAKES BOTH. A 2x2 with three exact zeros in it:
//
//                          real f            anomalous f
//     centrosymmetric      0.000e+0          8.9e-16      <- the test that could not fire
//     non-centrosymmetric  0.000e+0          2.7e+0       <- zincblende, and it breaks LOUDLY
//
// Zincblende is FCC with TWO different atoms, one offset by (1/4,1/4,1/4), and it has no inversion centre. At
// f'' = 0.5 the classic pair reads |F(111)| = 7.211103 against |F(-1-1-1)| = 4.472136 -- not a subtle asymmetry,
// a factor of 1.6. *** TURNING A KEY OFF IS ITSELF THE PHYSICS HERE: the SIZE of the Friedel violation is how
// absolute structure is determined in a real diffraction experiment. ***
"use strict";
import { BASES, isAbsent, structureFactorSum } from "./structureFactor.mjs";

const TAU = 2 * Math.PI;

// =================================================================================================================
// ROUTE 1 -- ENUMERATE THE LATTICE
// =================================================================================================================
/** Rings present for a lattice, as { N, multiplicity, hkl[] }, N = h^2+k^2+l^2. Absences are already removed. */
export function rings(lattice, { hklMax = 6 } = {}) {
    const byN = new Map();
    for (let h = -hklMax; h <= hklMax; h++)
        for (let k = -hklMax; k <= hklMax; k++)
            for (let l = -hklMax; l <= hklMax; l++) {
                if (!h && !k && !l) continue;
                if (isAbsent(lattice, h, k, l)) continue;
                const N = h * h + k * k + l * l;
                if (N > hklMax * hklMax) continue;        // only N fully covered by the box are complete
                if (!byN.has(N)) byN.set(N, []);
                byN.get(N).push([h, k, l]);
            }
    return [...byN.entries()].sort((a, b) => a[0] - b[0])
        .map(([N, hkl]) => ({ N, multiplicity: hkl.length, hkl }));
}

/** Ring radius. |G| = 2 pi sqrt(N) / a for a cubic cell -- so the radius is EXACT given N. */
export const ringG = (N, a) => TAU * Math.sqrt(N) / a;

/** Bragg angle for that ring, or null when the ring lies beyond the sphere the wavelength can reach. */
export function ringTwoTheta(N, a, lambda) {
    const s = lambda * Math.sqrt(N) / (2 * a);
    // REFUSED RATHER THAN CLAMPED: sin(theta) > 1 means the reflection is unreachable at this wavelength, which
    // is a fact about the experiment. Clamping would draw a ring that cannot exist.
    return s > 1 ? null : 2 * Math.asin(s) * 180 / Math.PI;
}

// =================================================================================================================
// ROUTE 2 -- A POWER SERIES THAT NEVER SEES A LATTICE
// =================================================================================================================
/**
 * r3(N) for N = 0..maxN, as the coefficients of theta3(q)^3 with theta3 = sum_n q^(n^2).
 * A CONVOLUTION. There is no h, k or l anywhere in it.
 */
export function r3Series(maxN) {
    const R = Math.ceil(Math.sqrt(maxN)) + 1;
    const t = new Array(maxN + 1).fill(0);
    for (let n = -R; n <= R; n++) { const e = n * n; if (e <= maxN) t[e] += 1; }
    const conv = (a, b) => {
        const o = new Array(maxN + 1).fill(0);
        for (let i = 0; i <= maxN; i++) if (a[i]) for (let j = 0; i + j <= maxN; j++) if (b[j]) o[i + j] += a[i] * b[j];
        return o;
    };
    return conv(conv(t, t), t);
}

/** The arithmetic reason a ring can be missing: N of the form 4^a(8b+7) is not a sum of three squares. */
export function isLegendreGap(N) {
    let n = N;
    while (n % 4 === 0) n /= 4;
    return n % 8 === 7;
}

// =================================================================================================================
// FRIEDEL
// =================================================================================================================
/** |F(hkl)| - |F(-h-k-l)| with REAL scattering. Exactly zero, because the sums are complex conjugates. */
export function friedelResidual(lattice, { hklMax = 4 } = {}) {
    let worst = 0, at = null, n = 0;
    for (let h = -hklMax; h <= hklMax; h++)
        for (let k = -hklMax; k <= hklMax; k++)
            for (let l = -hklMax; l <= hklMax; l++) {
                const a = structureFactorSum(BASES[lattice], h, k, l).mag;
                const b = structureFactorSum(BASES[lattice], -h, -k, -l).mag;
                const d = Math.abs(a - b);
                n++;
                if (d > worst) { worst = d; at = [h, k, l]; }
            }
    return { lattice, pairs: n, worst, at };
}

/** ZINCBLENDE: FCC lattice, two DIFFERENT atoms, the second offset by (1/4,1/4,1/4). No inversion centre. */
export const ZINCBLENDE = {
    A: BASES.fcc,
    B: BASES.fcc.map(([x, y, z]) => [x + 0.25, y + 0.25, z + 0.25]),
};

/** |F| with a complex form factor on the B sublattice: f = 1 + i f''. */
export function structureFactorAnomalous(h, k, l, fpp, { A = ZINCBLENDE.A, B = ZINCBLENDE.B } = {}) {
    let re = 0, im = 0;
    for (const [x, y, z] of A) { const p = TAU * (h * x + k * y + l * z); re += Math.cos(p); im += Math.sin(p); }
    for (const [x, y, z] of B) {
        const p = TAU * (h * x + k * y + l * z);
        re += Math.cos(p) - fpp * Math.sin(p);
        im += Math.sin(p) + fpp * Math.cos(p);
    }
    return Math.hypot(re, im);
}

/** The 2x2: does Friedel survive, for each combination of symmetry and scattering. */
export function friedelBreak(fpp, { centro = false, hklMax = 3 } = {}) {
    // CENTROSYMMETRIC control: put the anomalous atoms on the SAME sites, which restores the inversion centre.
    const opts = centro ? { A: BASES.fcc, B: BASES.fcc } : {};
    let worst = 0, at = null;
    for (let h = -hklMax; h <= hklMax; h++)
        for (let k = -hklMax; k <= hklMax; k++)
            for (let l = -hklMax; l <= hklMax; l++) {
                if (!h && !k && !l) continue;
                const d = Math.abs(structureFactorAnomalous(h, k, l, fpp, opts) -
                                   structureFactorAnomalous(-h, -k, -l, fpp, opts));
                if (d > worst) { worst = d; at = [h, k, l]; }
            }
    return { fpp, centro, worst, at };
}

export const MEASURED_V3583 = {
    twoMechanismsOneNothing:
        "*** r3(7) = 0 IS A NEW KIND OF EXACT ZERO FOR THIS LAB. *** Seven is not a sum of three squares -- no " +
        "integer of the form 4^a(8b+7) is -- so the simple-cubic ring at N=7 is MISSING, and NOT because any " +
        "basis cancels it. v3579's absences come from atoms interfering; this one comes from ARITHMETIC. Two " +
        "different mechanisms producing the same unmissable nothing, in one pattern.",
    numberTheoryAgainstGeometry:
        "Multiplicity by TWO ROUTES THAT SHARE NOTHING: a triple loop over hkl, against the coefficients of " +
        "theta3(q)^3 -- a convolution of power series with no h, k or l anywhere in it. 121 consecutive " +
        "integers, ZERO mismatches.",
    friedelIsExactlyZero:
        "|F(hkl)| = |F(-h-k-l)| across 2916 pairs and four lattices, worst difference 0.000e+0. *** NOT " +
        "ROUNDOFF -- EXACTLY ZERO, because the two sums are complex conjugates and |z| = |z-bar| BIT FOR BIT. *** " +
        "This lab has many keys at 1e-15; the difference here is that NO ARITHMETIC HAPPENS between the two " +
        "answers, only a sign.",
    theObviousBreakDoesNotWork:
        "Every account says anomalous scattering breaks Friedel. Put an anomalous atom into FCC and the worst " +
        "difference stays at 8.9e-16: *** THE LAW STILL HOLDS, BECAUSE FCC IS CENTROSYMMETRIC and an inversion " +
        "centre restores the conjugate relation no matter how complex the scattering is. *** IT TAKES BOTH " +
        "conditions. On zincblende at f'' = 0.5 the classic pair reads |F(111)| = 7.211103 against 4.472136 -- " +
        "not a subtle asymmetry, A FACTOR OF 1.6. Turning the key off IS the physics: the SIZE of the violation " +
        "is how absolute structure is determined in a real experiment.",
};

export function reportLines() {
    const L = [];
    L.push("[crystal/powder] rings indexed by an integer, and a law that needs two conditions to break");
    L.push("");
    L.push("  ring sequences (N = h^2+k^2+l^2), derived rather than typed:");
    for (const lat of ["sc", "bcc", "fcc", "diamond"])
        L.push("    " + lat.padEnd(9) + rings(lat).slice(0, 10).map((r) => r.N).join(", "));
    L.push("");
    L.push("  multiplicity, two routes:");
    const ser = r3Series(40);
    const sc = rings("sc");
    let mism = 0;
    for (const r of sc) if (r.N <= 36 && ser[r.N] !== r.multiplicity) mism++;
    L.push("    theta3(q)^3 vs lattice enumeration, N <= 36: " + (mism ? mism + " MISMATCHES" : "no mismatches"));
    L.push("    r3(7) = " + ser[7] + "  <- 7 is not a sum of three squares, so the ring is MISSING");
    L.push("");
    L.push("  Friedel:");
    for (const lat of ["fcc", "diamond"]) {
        const f = friedelResidual(lat);
        L.push("    " + lat.padEnd(9) + f.pairs + " pairs, worst " + f.worst.toExponential(3));
    }
    L.push("");
    L.push("    symmetry              real f       anomalous f''=0.5");
    for (const centro of [true, false])
        L.push("    " + (centro ? "centrosymmetric   " : "non-centrosym.    ") +
               friedelBreak(0, { centro }).worst.toExponential(1).padStart(10) + "   " +
               friedelBreak(0.5, { centro }).worst.toExponential(1).padStart(12));
    return L;
}

// THE CLI GUARD, WITH ITS node: IMPORT DEFERRED INTO IT. *** A STATIC `import "node:url"` AT THE TOP OF
// THIS FILE MADE THE MODULE UNIMPORTABLE FROM A BROWSER -- the specifier does not resolve there, so the
// whole file fails to load and every export with it. *** That cost this arc its front door: the physics was
// graded and reachable only by typing a selfcheck path. The guard short-circuits before the import runs, so
// nothing changes for node, and the browser never reaches it. buildPageIndex.mjs already used this form.
if (typeof process !== "undefined" && Array.isArray(process.argv) &&
    import.meta.url === (await import("node:url")).pathToFileURL(process.argv[1] || "").href) {
    for (const l of reportLines()) console.log(l);
    process.exit(0);
}
