// WebGLEngine/physics/tomography/ambiguity.mjs -- v3612
// ---------------------------------------------------------------------------------------------------------------
// A FALLING RECONSTRUCTION SCORE IS TWO THINGS WEARING ONE LABEL: "FBP IS DOING BADLY" AND "NO METHOD COULD DO
// BETTER HERE" ARE DIFFERENT CLAIMS, AND fbpCorr CANNOT SEPARATE THEM.
//
// PROVENANCE, AND NOTHING IS ADOPTED. Keith raised Nuic, Zhang, Sager and Jakob, "Inverse Rendering for
// Discrete X-Ray Computed Tomography" (EPFL RGL, TOG 45, SIGGRAPH 2026, DOI 10.1145/3811391). NO CODE IS
// RELEASED -- a paper PDF and a supplemental and nothing else -- so there is no licence question and nothing
// to vendor. What travels is one sentence of their abstract: traditional techniques "struggle with ambiguity"
// in sparse and limited-angle scenarios. THAT SENTENCE IS TESTABLE ON THIS TREE'S OWN CT DEVICE, and the test
// needs none of their method.
//
// tomographyBind's `ct` device already sweeps quality against projection count (mode "angles", nAngles clamped
// [6,240]) and scores fbpCorr. IT HAS ONLY FBP -- no SIRT, no ART, no DART -- so a low score has always been
// reported without anybody being able to say whose fault it is.
//
// ================================================================================================================
// FINDING 1: THE GHOST IS EXACT, AND IT IS INTEGER ARITHMETIC RATHER THAN A TOLERANCE
// ================================================================================================================
//
// For lattice directions d_1..d_N, the convolution of (delta_0 - delta_{d_i}) has line sums IDENTICALLY ZERO
// along every one of those directions -- the classical switching component (Katz; Hajdu and Tijdeman). Built
// with integers, so the zero is EXACT and no tolerance enters:
//
//     directions                     cells   box     worst line sum along its own dirs   along an off direction
//     (1,0) (0,1)                        4   2x2     0                                   1
//     + (1,1)                            6   3x3     0                                   1
//     + (1,-1)                           8   4x4     0                                   2
//     + (2,1)                           12   6x5     0                                   2
//     + (1,2)                           12   7x7     0                                   2
//
// THE OFF-DIRECTION COLUMN IS THE POSITIVE CONTROL: the ghost is not the zero function, it is a function the
// chosen directions cannot see. Without that column a row of zeros would prove nothing.
//
// ================================================================================================================
// FINDING 2, AND IT IS THE ONE THAT MATTERS FOR A DISCRETE PRIOR: THE PAIR IS BINARY
// ================================================================================================================
//
// The two-direction ghost is +1 at two opposite corners and -1 at the other two, so a phantom carrying blocks
// on ONE diagonal and a phantom carrying them on the OTHER differ by exactly that ghost -- AND BOTH ARE 0/1.
// Pushed through THIS TREE'S OWN radon() on a 64x64 grid with 64 detectors:
//
//     two BINARY images differing in 256 of 4096 pixels (6.3%)
//     worst |sinogram difference| at the two lattice directions   0.000e+0     EXACTLY ZERO
//     the same pair with 45 and 135 added                         1.000e+0 relative     COMPLETELY SEPARATED
//     FBP from those two projections, scored against BOTH truths  0.238720 and 0.238720
//
// *** SO A PERFECT DISCRETE MATERIAL PRIOR DOES NOT REMOVE THE AMBIGUITY. Both candidates are already binary;
// the constraint they would be tested against is satisfied by each. The prior SHRINKS the ambiguous set, it
// does not empty it -- which is why the paper competes on reconstruction QUALITY within an ambiguity that
// provably remains, rather than claiming to resolve it. ***
//
// AND fbpCorr READS 0.238720 AGAINST BOTH TRUTHS, IDENTICAL TO SIX DECIMALS. That is the score failing to
// separate the two claims, shown rather than argued: the number is not evidence about the method.
//
// ================================================================================================================
// FINDING 3: THE AMBIGUITY IS A PROPERTY OF THE ANGLE SET, NOT OF THE ANGLE COUNT
// ================================================================================================================
//
// Adding 45 and 135 separates this pair COMPLETELY (relative difference 1.0). So "more angles" is not the
// lever -- THE RIGHT ANGLE is. A ghost lives in the null space of a PARTICULAR direction set, and the question
// for any angle set is whether a ghost supported inside the reconstruction grid exists for it. The table above
// is that question answered constructively for the lattice sets: the smallest ghost's box grows slowly with
// the direction count, so at a 64x64 grid every one of these fits with room to spare.
//
// WHAT IS NOT CLAIMED: that SweK's DEFAULT equally-spaced angle set admits this ghost. angleSet(n) gives
// theta = pi*i/n, which is not a lattice set in general, and the exact construction needs lattice directions.
// The claim is scoped to the angle sets where the null space can be EXHIBITED rather than argued -- which is
// the strongest form available and is why it is the one built.
//
// NOT BUILT, DELIBERATELY: discrete tomography itself. It needs an optimiser, a material table and a
// scattering model; SweK has no consumer for a reconstructor beyond this bench, and the greedyMesh3d rule
// applies. This round GRADES A CLAIM ABOUT AMBIGUITY on the tree's own device and adopts nothing.
// ---------------------------------------------------------------------------------------------------------------
"use strict";
import { pathToFileURL } from "node:url";
import { radon, filteredBackProjection, scoreRecon } from "./ct.js";

/**
 * THE SWITCHING COMPONENT. Convolving (delta_0 - delta_{d}) over the direction list gives a function whose
 * line sums vanish along every d in the list. Integer coefficients throughout, so "zero" is exact.
 */
export function ghost(dirs) {
    let g = new Map([["0,0", 1]]);
    for (const [dx, dy] of dirs) {
        const h = new Map();
        for (const [k, v] of g) {
            const [x, y] = k.split(",").map(Number);
            h.set(k, (h.get(k) || 0) + v);
            const k2 = (x + dx) + "," + (y + dy);
            h.set(k2, (h.get(k2) || 0) - v);
        }
        for (const [k, v] of [...h]) if (v === 0) h.delete(k);
        g = h;
    }
    return g;
}

/** Line sums along direction d: cells on one line share the invariant b*x - a*y. */
export function lineSums(g, [a, b]) {
    const sums = new Map();
    for (const [k, v] of g) {
        const [x, y] = k.split(",").map(Number);
        const id = b * x - a * y;
        sums.set(id, (sums.get(id) || 0) + v);
    }
    return sums;
}

export const worstLineSum = (g, dirs) => Math.max(0, ...dirs.flatMap((d) => [...lineSums(g, d).values()].map(Math.abs)));

export function ghostBox(g) {
    const xs = [...g.keys()].map((k) => +k.split(",")[0]), ys = [...g.keys()].map((k) => +k.split(",")[1]);
    return { w: Math.max(...xs) - Math.min(...xs) + 1, h: Math.max(...ys) - Math.min(...ys) + 1, cells: g.size };
}

export const DIR_SEQUENCE = [[1, 0], [0, 1], [1, 1], [1, -1], [2, 1], [1, 2]];

/** THE TABLE, AND THE OFF-DIRECTION COLUMN IS WHAT MAKES THE ZEROS MEAN ANYTHING. */
export function ghostTable(seq = DIR_SEQUENCE, off = [3, 1]) {
    const rows = [];
    for (let n = 2; n <= seq.length; n++) {
        const dirs = seq.slice(0, n), g = ghost(dirs);
        rows.push({ n, dirs, ...ghostBox(g), own: worstLineSum(g, dirs), off: worstLineSum(g, [off]) });
    }
    return rows;
}

// --- the binary pair, and it is the point ------------------------------------------------------------------------

export const PAIR = { N: 64, block: 8, ox: 20, oy: 18, nDet: 64 };

/** Blocks of 1 on a 0 background at the given ghost-cell positions. Both members are 0/1 BY CONSTRUCTION. */
export function blocks(cells, p = PAIR) {
    const f = new Float64Array(p.N * p.N);
    for (const [cx, cy] of cells)
        for (let y = 0; y < p.block; y++) for (let x = 0; x < p.block; x++)
            f[(p.oy + cy * p.block + y) * p.N + (p.ox + cx * p.block + x)] = 1;
    return f;
}

export const binaryPair = (p = PAIR) => ({ a: blocks([[1, 0], [0, 1]], p), c: blocks([[0, 0], [1, 1]], p) });

export const pixelsDiffering = (a, c) => { let n = 0; for (let i = 0; i < a.length; i++) if (a[i] !== c[i]) n++; return n; };

/** Both images through THIS TREE'S OWN radon(), so the identity is about the shipped forward model. */
export function sinogramGap(angles, p = PAIR) {
    const { a, c } = binaryPair(p);
    const sa = radon(a, p.N, angles, p.nDet), sc = radon(c, p.N, angles, p.nDet);
    let worst = 0, peak = 0;
    for (let i = 0; i < sa.length; i++) for (let d = 0; d < p.nDet; d++) {
        worst = Math.max(worst, Math.abs(sa[i][d] - sc[i][d]));
        peak = Math.max(peak, Math.abs(sa[i][d]));
    }
    return { angles: angles.length, worst, peak, relative: peak > 0 ? worst / peak : 0 };
}

export const LATTICE_ANGLES = [0, Math.PI / 2];
export const PLUS_DIAGONALS = [0, Math.PI / 4, Math.PI / 2, 3 * Math.PI / 4];

/** THE SCORE FAILING TO SEPARATE THEM, shown rather than argued. */
export function scoreAgainstBoth(angles = LATTICE_ANGLES, p = PAIR) {
    const { a, c } = binaryPair(p);
    const recon = filteredBackProjection(radon(a, p.N, angles, p.nDet), p.N, angles, p.nDet);
    return { vsA: scoreRecon(recon, a).corr, vsC: scoreRecon(recon, c).corr };
}

export const MEASURED_V3612 = {
    ghostIsExact: "integer line sums identically 0 along the ghost's own directions, nonzero along an off " +
        "direction -- the second half is the positive control that keeps the first from proving nothing",
    binaryPair: { differingPixels: 256, ofPixels: 4096, sinogramGapAtLattice: 0, relativeGapWithDiagonals: 1 },
    scoreTie: 0.238720,
    verdict: "TWO DIFFERENT BINARY IMAGES, DIFFERING IN 6.3% OF THEIR PIXELS, HAVE EXACTLY IDENTICAL " +
        "PROJECTIONS through this tree's own radon() at the two lattice directions -- and FBP scores 0.238720 " +
        "against BOTH truths, identical to six decimals. A falling fbpCorr is therefore TWO THINGS WEARING ONE " +
        "LABEL, and the score cannot separate them.",
    theDiscretePriorDoesNotRemoveIt: "BOTH candidates are already 0/1, so a perfect discrete material prior is " +
        "satisfied by each. The prior SHRINKS the ambiguous set and does not empty it -- which is why the paper " +
        "competes on quality within an ambiguity that provably remains rather than claiming to resolve it.",
    theLeverIsTheANGLE: "adding 45 and 135 separates this pair COMPLETELY (relative gap 1.0), so 'more angles' " +
        "is not the lever -- the RIGHT angle is. A ghost lives in the null space of a PARTICULAR direction set.",
    notClaimed: "the exact construction needs LATTICE directions; angleSet(n) = pi*i/n is not one in general, " +
        "so the claim is scoped to angle sets where the null space can be EXHIBITED rather than argued. And no " +
        "discrete tomography is built -- no optimiser, no material table, no consumer (the greedyMesh3d rule).",
};

export function reportLines() {
    const L = [], say = (s) => L.push(s);
    say("[ambiguity] two different images, identical projections -- and the score cannot tell");
    say("");
    say("1. THE GHOST IS EXACT (integer line sums), AND THE OFF-DIRECTION COLUMN IS THE CONTROL");
    say("     dirs  cells  box     worst sum ALONG its own dirs   along an off direction (3,1)");
    for (const r of ghostTable())
        say("     " + String(r.n).padStart(4) + String(r.cells).padStart(7) + "   " + (r.w + "x" + r.h).padEnd(8) +
            String(r.own).padStart(12) + String(r.off).padStart(30));
    say("     Zero along its own directions, NONZERO along one it was not built for -- so it is a function");
    say("     those directions cannot see, not the zero function.");
    say("");
    say("2. THE PAIR IS BINARY, AND THAT IS THE POINT");
    const { a, c } = binaryPair();
    say("     two 0/1 images differing in " + pixelsDiffering(a, c) + " of " + (PAIR.N * PAIR.N) + " pixels (" +
        (100 * pixelsDiffering(a, c) / (PAIR.N * PAIR.N)).toFixed(1) + "%)");
    const g1 = sinogramGap(LATTICE_ANGLES), g2 = sinogramGap(PLUS_DIAGONALS);
    say("     through THIS TREE'S OWN radon():");
    say("       at the two lattice directions   worst |gap| " + g1.worst.toExponential(3) +
        "   relative to a peak of " + g1.peak.toFixed(3) + "  -> " + g1.relative.toExponential(3));
    say("       with 45 and 135 added           worst |gap| " + g2.worst.toExponential(3) +
        "   relative " + g2.relative.toExponential(3) + "  <- COMPLETELY SEPARATED");
    const s = scoreAgainstBoth();
    say("     FBP from the two projections, scored against BOTH truths: " + s.vsA.toFixed(6) + " and " + s.vsC.toFixed(6));
    say("     A PERFECT DISCRETE MATERIAL PRIOR IS SATISFIED BY EACH -- both are already 0/1.");
    say("");
    say("  " + MEASURED_V3612.verdict);
    say("  THE PRIOR: " + MEASURED_V3612.theDiscretePriorDoesNotRemoveIt);
    say("  THE LEVER: " + MEASURED_V3612.theLeverIsTheANGLE);
    say("  NOT CLAIMED: " + MEASURED_V3612.notClaimed);
    return L;
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
    for (const l of reportLines()) console.log(l);
    process.exit(0);
}
