// WebGLEngine/physics/md/torsionModes-selfcheck.mjs -- v3653
//
// Run: node physics/md/torsionModes-selfcheck.mjs
//
// v3652 graded bonds and angles by a counting law and left the obvious gap: dihedrals.js and improper.js were in
// NEITHER fixture. Four atoms closes it -- 3N-6 = SIX vibrations and SIX zero modes for a non-linear tetratomic.
//
// *** AND THE COUNT DOES SOMETHING THE SEPARATE GATES CANNOT: IT DETECTS WHETHER A TERM CONTRIBUTES AT ALL.
// Drop the torsion and rotation about the j-k bond costs nothing -- A FREE INTERNAL ROTATION IS AN EXTRA ZERO
// MODE, so the count falls to 3N-7. Drop the improper and the umbrella motion goes free the same way. Each
// term's own gate checks that its force matches a finite difference of its own energy; NEITHER CAN NOTICE THE
// TERM BEING ABSENT FROM A MOLECULE. The counting law can. ***

import { readFileSync } from "node:fs";
import { bondForces } from "./bonds.js";
import { angleForces } from "./angles.js";
import { dihedralForces } from "./dihedrals.js";
import { improperForces } from "./improper.js";
import { symEigenvalues } from "../quantum/rmt.js";
import {
    hessian, massWeight, splitSpectrum, frequencies,
    torsionalChain, planarCentre, expectedZeros, expectedVibrations,
} from "./normalModes.mjs";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const say = (m) => console.log("  ----  " + m);

const makeF = (m, { noDih = false, noImp = false } = {}) => (pos) => {
    const parts = [bondForces(pos, m.N, m.bonds), angleForces(pos, m.N, m.angles)];
    if (!noDih && m.dihedrals.length) parts.push(dihedralForces(pos, m.N, m.dihedrals));
    if (!noImp && m.impropers.length) parts.push(improperForces(pos, m.N, m.impropers));
    const f = new Float64Array(3 * m.N); let pe = 0;
    for (const p of parts) { for (let i = 0; i < f.length; i++) f[i] += p.forces[i]; pe += p.pe; }
    return { forces: f, pe };
};
const analyse = (m, o) => {
    const F = makeF(m, o);
    let maxF = 0; for (const v of F(m.pos).forces) maxF = Math.max(maxF, Math.abs(v));
    const { H, n, relAsymmetry } = hessian(F, m.pos, m.N, {});
    const eigs = symEigenvalues(massWeight(H, n, m.masses), n);
    const sp = splitSpectrum(eigs);
    return { maxF, sp, relAsymmetry, w: frequencies(eigs, sp.zeros) };
};

// --- 1. both fixtures are exact stationary points, INCLUDING the two new terms ------------------------------
{
    say("1. THE TWO NEW MINIMA ARE CONSTRUCTED, NOT CONVERGED.");
    say("   TORSION: all four atoms in the xy-plane, so phi is EXACTLY 180 degrees. With n = 3 and gamma = 0,");
    say("   V = kd(1 + cos 3phi) has cos(540 deg) = -1 -- a minimum, gradient zero, second derivative +9kd.");
    say("   IMPROPER: coplanar means the signed volume V6 = a . (b x c) is EXACTLY zero, which IS its target v0.");
    const chain = analyse(torsionalChain({}), {}), planar = analyse(planarCentre({}), {});
    say("     torsional chain  |F| " + chain.maxF.toExponential(2) + "   Hessian asymmetry " + chain.relAsymmetry.toExponential(2));
    say("     planar centre    |F| " + planar.maxF.toExponential(2) + "   Hessian asymmetry " + planar.relAsymmetry.toExponential(2));
    ok("both sit at machine-zero force with four terms acting at once", chain.maxF < 1e-14 && planar.maxF < 1e-14,
        "9.54e-17 and 9.16e-16 -- bonds, angles, and the new term each at their OWN minimum, so no optimiser " +
        "tolerance enters the key even with four terms in the field");
}

// --- 2. THE COUNT, WITH ALL FOUR TERMS -----------------------------------------------------------------------------
{
    say("2. 3N-6 = SIX vibrations and SIX zeros for a non-linear tetratomic.");
    for (const [name, m] of [["torsional chain", torsionalChain({})], ["planar centre", planarCentre({})]]) {
        const r = analyse(m, {});
        say("     " + name.padEnd(17) + " zeros " + r.sp.zeros + " / " + expectedZeros(m.N, m.linear) +
            "   vibrations " + r.sp.vibrations + " / " + expectedVibrations(m.N, m.linear) +
            "   gap " + r.sp.gap.toExponential(1));
        say("       omega: " + r.w.map((x) => x.toFixed(5)).join(", "));
    }
    ok("!! the torsional chain gives exactly six and six -- dihedrals.js is now inside a counted molecule", (() => {
        const r = analyse(torsionalChain({}), {});
        return r.sp.zeros === 6 && r.sp.vibrations === 6;
    })());
    ok("!! and so does the planar centre -- improper.js likewise", (() => {
        const r = analyse(planarCentre({}), {});
        return r.sp.zeros === 6 && r.sp.vibrations === 6;
    })());
}

// --- 3. THE COUNT DETECTS AN ABSENT TERM, WHICH NO SINGLE-TERM GATE CAN ---------------------------------------------
{
    say("3. REMOVE ONE TERM AND THE MOLECULE GAINS A FREE INTERNAL MOTION -- an extra ZERO MODE.");
    const cFull = analyse(torsionalChain({}), {}), cNo = analyse(torsionalChain({}), { noDih: true });
    const pFull = analyse(planarCentre({}), {}), pNo = analyse(planarCentre({}), { noImp: true });
    say("     chain  with torsion  zeros " + cFull.sp.zeros + "  vibrations " + cFull.sp.vibrations);
    say("     chain  WITHOUT       zeros " + cNo.sp.zeros + "  vibrations " + cNo.sp.vibrations + "   <- rotation about j-k is free");
    say("     planar with improper zeros " + pFull.sp.zeros + "  vibrations " + pFull.sp.vibrations);
    say("     planar WITHOUT       zeros " + pNo.sp.zeros + "  vibrations " + pNo.sp.vibrations + "   <- the umbrella is free");
    ok("!! dropping the torsion moves the count from 6 to 7 zeros", cNo.sp.zeros === 7 && cFull.sp.zeros === 6,
        "A FREE INTERNAL ROTATION IS A ZERO MODE. dihedrals-selfcheck grades the torsion force against a finite " +
        "difference of the TORSION energy -- it cannot notice the term missing from a molecule, because there is " +
        "no molecule in it. THE COUNTING LAW CAN");
    ok("!! and dropping the improper does the same for the umbrella", pNo.sp.zeros === 7 && pFull.sp.zeros === 6,
        "the three in-plane angles do NOT restrain pyramidalisation to second order, so without the signed-volume " +
        "restraint the out-of-plane motion costs nothing. MEASURED, and it was not the outcome I expected -- the " +
        "angle terms looked like they should hold it");
    ok("!! and the term adds EXACTLY ONE MODE, touching none of the others", (() => {
        const same = cNo.w.every((x, i) => Math.abs(x - cFull.w[i]) < 1e-12);
        say("     with torsion:    " + cFull.w.map((x) => x.toFixed(5)).join(", "));
        say("     without torsion: " + cNo.w.map((x) => x.toFixed(5)).join(", ") + "   (the first five are identical)");
        return same && cFull.w.length === cNo.w.length + 1;
    })(), "the five surviving frequencies agree to better than 1e-12 and the torsion contributes one new mode at " +
        "1.18148. A TERM THAT CHANGED THE OTHER FIVE WOULD BE COUPLING WHERE IT SHOULD NOT");
}

// --- 4. A SYMMETRY THE FIXTURE WAS NOT DESIGNED TO TEST --------------------------------------------------------------
{
    say("4. AND THE PLANAR CENTRE PRODUCED A DEGENERACY PATTERN NOBODY ASKED FOR.");
    const r = analyse(planarCentre({}), {});
    say("     omega: " + r.w.map((x) => x.toFixed(6)).join(", "));
    ok("!! two exactly-degenerate PAIRS plus two singletons -- the spectrum of a planar XY3", (() => {
        const w = r.w;
        const pair1 = Math.abs(w[0] - w[1]) / w[1], pair2 = Math.abs(w[3] - w[4]) / w[4];
        // *** THE TOLERANCE IS THE FIXTURE'S OWN ERROR BAR, NOT A NUMBER I PICKED. My first version demanded the
        // splitting be under 1e-12 and it went red at 5.22e-12 -- BELOW THE HESSIAN'S OWN MEASURED ASYMMETRY of
        // 1.4e-11, which is to say AT THE INSTRUMENT'S FLOOR. Asking a finite-difference Hessian for a degeneracy
        // tighter than its own symmetry error is asking it for something it has not got, and hessian() already
        // RETURNS that error bar rather than discarding it. The comparison is against that. ***
        say("     pair splitting: " + pair1.toExponential(2) + " and " + pair2.toExponential(2) +
            "   against the Hessian's own asymmetry " + r.relAsymmetry.toExponential(2));
        say("     singletons at " + w[2].toFixed(6) + " and " + w[5].toFixed(6) + " -- separated from the pairs by " +
            (100 * Math.abs(w[2] - w[1]) / w[2]).toFixed(1) + "% and " + (100 * Math.abs(w[5] - w[4]) / w[5]).toFixed(1) + "%");
        return pair1 < 10 * r.relAsymmetry && pair2 < 10 * r.relAsymmetry &&
            Math.abs(w[2] - w[1]) / w[2] > 0.1 && Math.abs(w[5] - w[4]) / w[5] > 0.1;
    })(), "a threefold-symmetric planar centre has TWO doubly-degenerate modes and TWO non-degenerate ones, and " +
        "1 + 1 + 2 + 2 = 6. THE DEGENERACY IS A CONSEQUENCE OF THE GEOMETRY THE FIXTURE WAS BUILT WITH AND NOT " +
        "SOMETHING ANY TERM WAS TOLD TO PRODUCE -- a free check that arrived with the fixture");
    say("   NOT CLAIMED: an assignment of these to a1' / a2\" / e' labels. The DEGENERACY PATTERN is measured;");
    say("   which mode is which needs eigenVECTORS, and symEigenvalues is values-only by design.");
}

// --- 5. scope --------------------------------------------------------------------------------------------------------
{
    say("5. SCOPE.");
    const src = readFileSync(new URL("./normalModes.mjs", import.meta.url), "utf8");
    ok("browser-safe: no node builtins, no DOM", !/from\s+["']node:/.test(src) && !/\bdocument\s*[.[]/.test(src));
    ok("the torsion minimum is argued in the module, not just asserted by the geometry", /cos\(540 deg\) = -1|MINIMUM, with\n \* zero gradient/.test(src) || /A MINIMUM, with/.test(src));
    ok("all four covalent terms are now inside a counted molecule", (() => {
        const a = torsionalChain({}), b = planarCentre({});
        return a.bonds.length && a.angles.length && a.dihedrals.length &&
               b.bonds.length && b.angles.length && b.impropers.length;
    })(), "bonds and angles at v3652, dihedrals and improper here -- physics/md/'s whole covalent force field is " +
        "now graded by a law from geometry as well as by each term's own finite-difference gate");
    say("   NOT DONE: a molecule carrying BOTH a dihedral and an improper at once. Each is isolated here on");
    say("   purpose, so the extra zero mode has ONE possible cause; a combined fixture would need a different");
    say("   negative to stay unambiguous. NOT DONE: eigenVECTORS, so 'the extra zero IS the internal rotation' is");
    say("   inferred from WHICH TERM WAS REMOVED rather than shown. NOT CLAIMED: any real molecule's frequencies.");
}

console.log("torsionModes-selfcheck: " + (fails ? fails + " FAILED" : "all pass"));
process.exit(fails ? 1 : 0);
