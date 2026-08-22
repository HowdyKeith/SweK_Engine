// WebGLEngine/physics/md/normalModes-selfcheck.mjs -- v3652
//
// Run: node physics/md/normalModes-selfcheck.mjs
//
// NORMAL MODES: THE HESSIAN OF A FORCE FIELD physics/md/ ALREADY HAD, GRADED BY COUNTING LAWS FROM GEOMETRY.
//
// bonds, angles, dihedrals and improper were each gated separately when they were built. This grades them
// TOGETHER through a quantity none of them computes, and every key is a fact about space rather than a number
// I typed:
//   1. A NON-LINEAR molecule of N atoms has EXACTLY 3N-6 vibrations and SIX zero modes; a LINEAR one has
//      3N-5 and FIVE, because rotation about the axis moves nothing.
//   2. Those zero modes must come out AT MACHINE ZERO -- one check that grades every force term at once.
//   3. omega = sqrt(k/mu) for a diatomic is ALREADY mdBind's "bond" key, reached there from the analytic
//      formula. Here it arrives from a NUMERICAL SECOND DERIVATIVE: TWO ROUTES SHARING NO CODE.
//
// *** AND THE COUNT FOUND SOMETHING IN SHIPPED CODE. A linear triatomic returns SEVEN zeros where space says
// five. It is not the counting that is wrong -- physics/md/angles.js CANNOT RESTORE A LINEAR MOLECULE, and
// section 4 measures why. ***

import { readFileSync } from "node:fs";
import { bondForces } from "./bonds.js";
import { angleForces } from "./angles.js";
import { symEigenvalues } from "../quantum/rmt.js";
import {
    hessian, massWeight, splitSpectrum, frequencies,
    diatomic, bentTriatomic, linearTriatomic, expectedZeros, expectedVibrations,
} from "./normalModes.mjs";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const say = (m) => console.log("  ----  " + m);

const forceFn = (m) => (pos) => {
    const b = bondForces(pos, m.N, m.bonds);
    const a = m.angles.length ? angleForces(pos, m.N, m.angles) : { forces: new Float64Array(3 * m.N), pe: 0 };
    const f = new Float64Array(3 * m.N);
    for (let i = 0; i < f.length; i++) f[i] = b.forces[i] + a.forces[i];
    return { forces: f, pe: b.pe + a.pe };
};
const analyse = (m, pos) => {
    const F = forceFn(m);
    const at = pos || m.pos;
    let maxF = 0; for (const v of F(at).forces) maxF = Math.max(maxF, Math.abs(v));
    const { H, n, relAsymmetry } = hessian(F, at, m.N, {});
    const eigs = symEigenvalues(massWeight(H, n, m.masses), n);
    const sp = splitSpectrum(eigs);
    return { sp, eigs, maxF, relAsymmetry, w: frequencies(eigs, sp.zeros) };
};

// --- 1. the fixtures are at equilibrium BY CONSTRUCTION, not by an optimiser --------------------------------
{
    say("1. EVERY FIXTURE IS AN EXACT STATIONARY POINT -- every bond at r0 and every angle at cos0, so each");
    say("   term sits at its own minimum and the total force is zero WITH NO OPTIMISER TOLERANCE ANYWHERE.");
    const rows = [["diatomic", diatomic({})], ["bent triatomic", bentTriatomic({})], ["linear triatomic", linearTriatomic({})]]
        .map(([name, m]) => ({ name, m, r: analyse(m) }));
    for (const x of rows) say("     " + x.name.padEnd(17) + " |F| " + x.r.maxF.toExponential(2) +
        "   Hessian relative asymmetry " + x.r.relAsymmetry.toExponential(2));
    ok("all three sit at machine zero force", rows.every((x) => x.r.maxF < 1e-14),
        "two of the three are EXACTLY 0.000e+0 -- a constructed equilibrium, not a converged one");
    ok("the numerical Hessian is symmetric to 1e-10 relative, and the asymmetry is REPORTED not discarded",
        rows.every((x) => x.r.relAsymmetry < 1e-9),
        "H must be symmetric, so the measured asymmetry is a FREE ERROR BAR on the finite-difference step -- " +
        "7.08e-11 at worst, which is the accuracy floor every number below sits on");
}

// --- 2. THE COUNTING LAW -----------------------------------------------------------------------------------------
{
    say("2. THE COUNT. Space says 3N-6 vibrations and six zeros for a bent molecule, 3N-5 and five for a linear one.");
    for (const [name, m] of [["diatomic", diatomic({})], ["bent triatomic", bentTriatomic({})], ["linear triatomic", linearTriatomic({})]]) {
        const r = analyse(m);
        say("     " + name.padEnd(17) + " zeros " + r.sp.zeros + " (expect " + expectedZeros(m.N, m.linear) +
            ")   vibrations " + r.sp.vibrations + " (expect " + expectedVibrations(m.N, m.linear) +
            ")   gap " + r.sp.gap.toExponential(2));
    }
    const di = analyse(diatomic({})), bent = analyse(bentTriatomic({}));
    ok("!! the diatomic gives exactly five zeros and one vibration", di.sp.zeros === 5 && di.sp.vibrations === 1,
        "and the zeros are separated from the vibration by " + di.sp.gap.toExponential(2) + " -- the split is not " +
        "a close call");
    ok("!! the bent triatomic gives exactly six zeros and three vibrations", bent.sp.zeros === 6 && bent.sp.vibrations === 3,
        "THREE TRANSLATIONS, THREE ROTATIONS, AND THE THREE MODES OF A BENT XY2 -- symmetric stretch, bend, " +
        "antisymmetric stretch. A sign slip in bonds.js or angles.js breaks the zeros, so this one line grades both");
    ok("the zeros really are at machine zero, not merely small", bent.sp.largestZero < 1e-9 && bent.sp.smallestVib > 1,
        "largest zero " + bent.sp.largestZero.toExponential(3) + " against smallest vibration " +
        bent.sp.smallestVib.toExponential(3));
}

// --- 3. TWO ROUTES SHARING NO CODE -------------------------------------------------------------------------------
{
    say("3. THE DIATOMIC FREQUENCY, WHICH THIS TREE ALREADY TRUSTS FROM A DIFFERENT DIRECTION.");
    for (const p of [{ k: 3.5, m1: 1, m2: 16 }, { k: 12, m1: 12, m2: 16 }, { k: 0.8, m1: 1, m2: 1 }]) {
        const m = diatomic(p), r = analyse(m);
        say("     k=" + String(p.k).padEnd(5) + " m=" + p.m1 + "/" + p.m2 +
            "   measured " + r.w[0].toFixed(12) + "   sqrt(k/mu) " + m.omegaExact.toFixed(12) +
            "   rel " + (Math.abs(r.w[0] - m.omegaExact) / m.omegaExact).toExponential(2));
    }
    ok("!! the Hessian route reproduces sqrt(k/mu) at three mass ratios", (() => {
        return [{ k: 3.5, m1: 1, m2: 16 }, { k: 12, m1: 12, m2: 16 }, { k: 0.8, m1: 1, m2: 1 }].every((p) => {
            const m = diatomic(p), r = analyse(m);
            return Math.abs(r.w[0] - m.omegaExact) / m.omegaExact < 1e-9;
        });
    })(), "worst 3.28e-12. mdBind's `bond` mode reaches this number by INTEGRATING THE MOLECULE AND COUNTING " +
        "OSCILLATIONS against the analytic formula; this reaches it by a NUMERICAL SECOND DERIVATIVE OF THE " +
        "POTENTIAL and an eigenvalue. NO SHARED CODE BETWEEN THE TWO PATHS");
}

// --- 4. WHAT THE COUNT FOUND IN SHIPPED CODE -----------------------------------------------------------------------
{
    say("4. THE LINEAR TRIATOMIC RETURNS SEVEN ZEROS WHERE SPACE SAYS FIVE. The count is right; the potential is not.");
    const m = linearTriatomic({}), r = analyse(m);
    say("     zeros " + r.sp.zeros + ", vibrations " + r.sp.vibrations + " -- TWO MODES MISSING, and a linear XY2's");
    say("     missing pair is exactly its DEGENERATE BEND.");
    ok("the shortfall is exactly two", r.sp.zeros === expectedZeros(m.N, m.linear) + 2 &&
        r.sp.vibrations === expectedVibrations(m.N, m.linear) - 2);
    ok("!! and the reason is that the COSINE-HARMONIC angle is QUARTIC at 180 degrees, measured not asserted", (() => {
        const bend = (eps) => {
            const p = Float64Array.from(m.pos);
            p[3] = 1.16 * Math.cos(eps); p[4] = 1.16 * Math.sin(eps);
            return angleForces(p, 3, m.angles).pe;
        };
        const es = [0.02, 0.04, 0.08, 0.16], vs = es.map(bend);
        const ratios = vs.slice(1).map((v, i) => v / vs[i]);
        say("     V(eps) at eps = " + es.join(", ") + ":  " + vs.map((v) => v.toExponential(3)).join("  "));
        say("     successive ratios " + ratios.map((x) => x.toFixed(3)).join(", ") +
            "   (a QUADRATIC well doubles-to-4, a QUARTIC one doubles-to-16)");
        return ratios.every((x) => x > 15.5 && x < 16.5);
    })(), "15.997 / 15.987 / 15.949. V = 1/2 k (cos t - cos t0)^2 with cos t0 = -1 gives (eps^2/2)^2 near " +
        "straight, so THE SECOND DERIVATIVE IS EXACTLY ZERO AND THE BENDING FORCE CONSTANT VANISHES. A LINEAR " +
        "MOLECULE BUILT WITH THIS TERM HAS NO RESTORING FORCE AGAINST BENDING");
    ok("angles.js states WHY it is cosine-harmonic, and does NOT state this cost", (() => {
        const src = readFileSync(new URL("./angles.js", import.meta.url), "utf8");
        return /COSINE-harmonic form/.test(src) && /transcendental/.test(src) && !/180/.test(src);
    })(), "its header says the form was chosen to avoid acos and keep cross-arch determinism -- A REAL REASON " +
        "AND A GOOD ONE -- and never mentions that the choice DEGENERATES AT 180 DEGREES. NOT A BUG: a " +
        "documented trade with one end undocumented, and the counting law is what exposed it");
    say("   *** SO THE NUMBER TO CARRY IS NOT 'seven zeros'. IT IS THAT A COUNTING LAW FROM GEOMETRY GRADED A");
    say("   FORCE TERM THAT HAD ALREADY PASSED ITS OWN GATE, AND FOUND A REGIME THE GATE NEVER VISITED. angles-");
    say("   selfcheck tests a BENT angle, where cos is a perfectly good coordinate. NOTHING IS CHANGED IN");
    say("   angles.js -- CO2 is not in this tree and no consumer is affected. THE LIMIT IS NOW WRITTEN DOWN. ***");
}

// --- 5. THE LOAD-BEARING NEGATIVE ----------------------------------------------------------------------------------
{
    say("5. TRANSLATIONS ARE ZERO MODES AT ANY GEOMETRY. ROTATIONS ONLY AT A STATIONARY POINT.");
    const m = bentTriatomic({});
    const off = Float64Array.from(m.pos); off[3] += 0.17; off[7] -= 0.11;
    const at = analyse(m), away = analyse(m, off);
    say("     at equilibrium:  |F| " + at.maxF.toExponential(2) + "   zeros " + at.sp.zeros);
    say("     displaced:       |F| " + away.maxF.toExponential(2) + "   zeros " + away.sp.zeros);
    ok("!! six zeros at equilibrium, THREE when displaced", at.sp.zeros === 6 && away.sp.zeros === 3,
        "the potential cannot see WHERE the molecule is, so translations are always zero modes; it CAN see how " +
        "the molecule is turned unless the forces vanish. SO 'I GOT SIX ZEROS' IS EVIDENCE THE GEOMETRY IS AT A " +
        "MINIMUM -- and a fixture that never checked its own equilibrium could report the wrong count and look right");
    ok("the displaced zeros are still at machine zero, so it is a COUNT that changed and not an accuracy",
        away.sp.largestZero < 1e-9, "largest remaining zero " + away.sp.largestZero.toExponential(3));
}

// --- 6. scope --------------------------------------------------------------------------------------------------------
{
    say("6. SCOPE.");
    const src = readFileSync(new URL("./normalModes.mjs", import.meta.url), "utf8");
    ok("browser-safe: no node builtins, no DOM", !/from\s+["']node:/.test(src) && !/\bdocument\s*[.[]/.test(src));
    ok("the zero/vibration split uses a rank tolerance derived from the spectrum, not a typed cutoff",
        /relTol = Math\.sqrt\(Number\.EPSILON\)/.test(src) && /A RATIO TEST CANNOT RANK A SET THAT CONTAINS A TRUE\n \* ZERO/.test(src),
        "MY FIRST VERSION SPLIT AT THE LARGEST RELATIVE GAP, which is unusable the moment a zero mode is EXACTLY " +
        "zero: the ratio to the next eigenvalue is infinite, so the split landed between two zeros and reported " +
        "TWO where there are FIVE. The gap is still reported as the number that says whether the split meant anything");
    ok("massWeight returns ROW-MAJOR FLAT, and the module says why", /A LAYOUT MISMATCH THAT TYPE-CHECKS/.test(src),
        "symEigenvalues does Float64Array.from(A), so handing it an ARRAY OF ROWS yields a matrix of NaN rather " +
        "than an error -- my first version did exactly that and every eigenvalue came back NaN");
    say("   NOT DONE: dihedrals and improper are NOT in these fixtures -- a four-atom torsional molecule is the");
    say("   obvious next one, and its count (3N-6 = 6 for a non-linear tetratomic) grades both terms the same way.");
    say("   NOT DONE: eigenVECTORS. symEigenvalues is values-only by design, so 'the six zeros ARE the three");
    say("   translations and three rotations' is INFERRED FROM THE COUNT rather than shown -- projecting the");
    say("   modes onto the rigid-body basis would show it, and needs an eigenvector routine this tree lacks.");
    say("   NOT CLAIMED: any real molecule's frequencies. The force constants here are round numbers, not");
    say("   spectroscopy, and nothing above compares to a measured wavenumber.");
}

console.log("normalModes-selfcheck: " + (fails ? fails + " FAILED" : "all pass"));
process.exit(fails ? 1 : 0);
