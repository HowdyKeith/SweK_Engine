// WebGLEngine/physics/crystal/powder-selfcheck.mjs -- v3583
//
// Run: node physics/crystal/powder-selfcheck.mjs
// RUNTIME .1s MEASURED with date +%s%N around the run. Not remembered; v3211-v3213 found 59 of 82 headers wrong.
//
// *** SECTION 4 IS THE ROUND: THE OBVIOUS WAY TO BREAK FRIEDEL'S LAW DOES NOT WORK. *** Anomalous scattering
// alone leaves it intact, because FCC is centrosymmetric. It takes BOTH conditions, and the gate drives all four
// cells of the 2x2 rather than only the one that breaks.
"use strict";
import { rings, ringG, ringTwoTheta, r3Series, isLegendreGap, friedelResidual,
         friedelBreak, structureFactorAnomalous, ZINCBLENDE, MEASURED_V3583, reportLines } from "./powder.mjs";
import { BASES, isAbsent, structureFactorSum } from "./structureFactor.mjs";

let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const report = (l, n = "") => console.log(`  ----  ${l}${n ? "   " + n : ""}`);

console.log("powder-selfcheck -- rings indexed by an integer, and a law with two conditions\n");

// ---------------------------------------------------------------------------
console.log("1. THE RING SEQUENCES ARE THE TEXTBOOK SIGNATURES, DERIVED RATHER THAN TYPED");
{
    const seq = (l) => rings(l).slice(0, 8).map((r) => r.N);
    for (const l of ["sc", "bcc", "fcc", "diamond"]) report(l.padEnd(9), seq(l).join(", "));

    ok("!! bcc rings are the even integers and fcc starts 3, 4, 8, 11",
        seq("bcc").every((n) => n % 2 === 0) && seq("fcc").slice(0, 4).join() === "3,4,8,11",
        "these come out of the ABSENCE RULES, which come out of the basis. Nothing here types a sequence -- a " +
        "hard-coded table would agree with the textbook and prove only that I can copy.");
    ok("!! ...and the four lattices give four DIFFERENT sequences",
        new Set(["sc", "bcc", "fcc", "diamond"].map((l) => seq(l).join())).size === 4,
        "*** THE SEQUENCE IS THE SIGNATURE THAT IDENTIFIES A LATTICE FROM A POWDER PHOTOGRAPH. *** If two came " +
        "out the same, the pattern could not do the one job it exists for.");
    ok("the ring radius is exact given N",
        Math.abs(ringG(4, 2) - ringG(1, 1)) < 1e-12,
        "|G| = 2 pi sqrt(N) / a, so N=4 at a=2 and N=1 at a=1 are the same ring -- an identity in the formula " +
        "rather than a coincidence of numbers");
    ok("!! a reflection beyond the wavelength's reach is REFUSED, not clamped",
        ringTwoTheta(400, 1, 5) === null && ringTwoTheta(1, 4, 1) !== null,
        "sin(theta) > 1 means the ring CANNOT EXIST at that wavelength, which is a fact about the experiment. " +
        "Clamping would draw it anyway -- navigate.js's rule, in a new subject.");
}

// ---------------------------------------------------------------------------
console.log("\n2. *** MULTIPLICITY BY TWO ROUTES, ONE OF THEM NUMBER THEORY ***");
{
    const MAX = 120;
    const ser = r3Series(MAX);
    let mism = [], checked = 0;
    // route 1: enumerate. Box radius 12 fully covers N <= 120.
    const enumerated = new Array(MAX + 1).fill(0);
    for (let h = -12; h <= 12; h++) for (let k = -12; k <= 12; k++) for (let l = -12; l <= 12; l++) {
        const N = h * h + k * k + l * l;
        if (N <= MAX) enumerated[N]++;
    }
    for (let N = 0; N <= MAX; N++) { checked++; if (ser[N] !== enumerated[N]) mism.push(N); }
    report("N checked / mismatches", checked + " / " + mism.length);

    ok("!! the theta-series cube and the lattice enumeration agree on every integer",
        mism.length === 0,
        "*** ROUTE 2 IS A CONVOLUTION OF POWER SERIES AND HAS NO h, k OR l ANYWHERE IN IT. *** r3(N) is the " +
        "coefficient of q^N in theta3(q)^3. A triple loop over a lattice against a multiplication of series: " +
        "geometry against number theory, agreeing on 121 consecutive integers.");
    ok("!! *** r3(7) = 0, AND THAT IS A SECOND KIND OF EXACT ZERO ***",
        ser[7] === 0 && ser[15] === 0 && ser[23] === 0,
        "seven is not a sum of three squares, so THE SIMPLE-CUBIC RING AT N=7 IS MISSING -- and NOT because any " +
        "basis cancels it. v3579's absences come from ATOMS INTERFERING; this one comes from ARITHMETIC. Two " +
        "different mechanisms producing the same unmissable nothing, in one pattern.");
    ok("...and the arithmetic reason is stated rather than the values just being absent",
        isLegendreGap(7) && isLegendreGap(28) && isLegendreGap(112) && !isLegendreGap(8),
        "4^a(8b+7): 7, 28 = 4*7 and 112 = 16*7 are all gaps, and 8 is not. A predicate rather than a lookup, so " +
        "it answers for an N nobody enumerated.");
    ok("!! and the gaps really are the ones the enumeration misses, checked both ways",
        [7, 15, 23, 28].every((N) => enumerated[N] === 0 && isLegendreGap(N)),
        "*** THE PREDICATE AND THE COUNT AGREE ON WHICH INTEGERS ARE EMPTY. *** Either alone would be a claim; " +
        "together they are a cross-check.");
}

// ---------------------------------------------------------------------------
console.log("\n3. FRIEDEL'S LAW IS EXACTLY ZERO, NOT MERELY SMALL");
{
    const rs = ["sc", "bcc", "fcc", "diamond"].map((l) => friedelResidual(l));
    for (const r of rs) report(r.lattice.padEnd(9), r.pairs + " pairs, worst " + r.worst.toExponential(3));

    ok("!! |F(hkl)| = |F(-h-k-l)| with worst difference EXACTLY 0.000e+0",
        rs.every((r) => r.worst === 0),
        "*** THIS LAB HAS MANY KEYS AT 1e-15. THIS ONE IS AT ZERO. *** The two sums are complex conjugates and " +
        "|z| = |z-bar| BIT FOR BIT, because no arithmetic happens between the two answers -- only a sign on " +
        "every phase.");
    ok("...and it is not zero because the magnitudes are zero",
        structureFactorSum(BASES.fcc, 1, 1, 1).mag > 3,
        "|F(111)| for FCC is 4. A law that held because everything vanished would be no law at all.");
}

// ---------------------------------------------------------------------------
console.log("\n4. *** AND THE OBVIOUS WAY TO BREAK IT DOES NOT WORK ***");
{
    const cells = [
        ["centrosymmetric  ", true, 0], ["centrosymmetric  ", true, 0.5],
        ["non-centrosym.   ", false, 0], ["non-centrosym.   ", false, 0.5],
    ].map(([lab, centro, fpp]) => ({ lab, ...friedelBreak(fpp, { centro }) }));
    for (const c of cells) report(c.lab + " f''=" + c.fpp, "worst " + c.worst.toExponential(2));

    ok("!! anomalous scattering ALONE leaves Friedel intact",
        cells[1].worst < 1e-12,
        "*** EVERY ACCOUNT SAYS ANOMALOUS SCATTERING BREAKS FRIEDEL. PUT AN ANOMALOUS ATOM INTO FCC AND THE " +
        "LAW STILL HOLDS. *** FCC is CENTROSYMMETRIC, and an inversion centre restores the conjugate relation " +
        "no matter how complex the scattering is. The prediction was incomplete, not wrong.");
    ok("!! non-centrosymmetry ALONE leaves it intact too",
        cells[2].worst < 1e-12,
        "zincblende with REAL scattering: 0.000e+0. Neither condition on its own does anything.");
    ok("!! *** IT TAKES BOTH, AND THEN IT BREAKS LOUDLY ***",
        cells[3].worst > 1,
        "worst difference " + cells[3].worst.toFixed(3) + " on zincblende at f'' = 0.5. THREE EXACT ZEROS AND " +
        "ONE LARGE NUMBER in a 2x2 -- and a test that had only run the fourth cell would have called the law " +
        "'broken by anomalous scattering' and been wrong about why.");
    ok("!! the classic pair is a factor of 1.6, not a subtle asymmetry",
        (() => { const a = structureFactorAnomalous(1, 1, 1, 0.5), b = structureFactorAnomalous(-1, -1, -1, 0.5);
                 return Math.abs(a / b - 1.6) < 0.1; })(),
        "|F(111)| = 7.211103 against |F(-1-1-1)| = 4.472136. *** TURNING THE KEY OFF IS ITSELF THE PHYSICS: " +
        "the SIZE of the Friedel violation is how absolute structure is determined in a real experiment. ***");
    ok("...and the violation grows with f'', so it tracks the cause",
        friedelBreak(0.05, {}).worst < friedelBreak(0.2, {}).worst &&
        friedelBreak(0.2, {}).worst < friedelBreak(1.0, {}).worst,
        "monotone in the imaginary part. A break that appeared at full size regardless of f'' would be a bug in " +
        "the model rather than the effect.");
    ok("nothing is ratcheted", !("baseline" in MEASURED_V3583),
        "every number is recomputed from the bases each run");
}

// ---------------------------------------------------------------------------
console.log("\n5. THE RINGS AGREE WITH v3579'S ABSENCES, WHICH IS THE JOIN");
{
    let joined = true;
    for (const lat of ["bcc", "fcc", "diamond"])
        for (const r of rings(lat).slice(0, 6))
            for (const [h, k, l] of r.hkl)
                if (isAbsent(lat, h, k, l)) joined = false;
    ok("!! no ring contains a reflection the structure factor forbids",
        joined,
        "the powder pattern is built ON v3579's absence rule rather than beside it -- so a change to the rule " +
        "moves the rings, and the two cannot drift apart into a second opinion about the same lattice");
    ok("the report prints", reportLines().length > 12,
        "v3327's split: a reporting tool prints, the gate beside it is what exits nonzero");
}

console.log(fails ? `\npowder-selfcheck: ${fails} FAILED` : "\npowder-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
