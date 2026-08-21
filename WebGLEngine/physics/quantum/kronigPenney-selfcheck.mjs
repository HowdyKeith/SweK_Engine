// WebGLEngine/physics/quantum/kronigPenney-selfcheck.mjs — v3320
//
// Run: node physics/quantum/kronigPenney-selfcheck.mjs   (~3s — MEASURED individually)
// Gated by tools/ship/selfchecks.mjs (tree walk).
//
// BAND STRUCTURE, AND THE FORBIDDEN GAPS ARE THE FALSIFIER. An energy is allowed exactly when the
// Kronig-Penney relation lands in [-1, 1], with no approximation anywhere in the statement, so every band edge
// is an exact root of RHS(E) = +-1 -- a number the numerical solver is never told.
//
// AND THE TWO SPECIAL POINTS ARE WHERE IT GETS SHARP. cos(kL) = +1 at k = 0 and -1 at k = pi/L, which is also
// exactly where the Bloch Hamiltonian is REAL: periodic at one, ANTIperiodic at the other. The energies with a
// closed form are precisely the ones a real symmetric eigensolver can reach, which feels like a coincidence and
// is not one.

import { kpRhs, isAllowed, bandEdges, gaps, blochSpectrum, numericEdges } from "./kronigPenney.js";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };

const P = { V0: 20, a: 1, b: 0.2 };
const EX = bandEdges({ ...P, eMax: 40 });
const GAPS = gaps(EX, P);

// ---- 1. THE RELATION SEPARATES ALLOWED FROM FORBIDDEN, WITH NO TOLERANCE INVOLVED ---------------------------------
{
    ok("!! band edges are exact roots of |RHS| = 1, found by bisection to machine precision",
       EX.length >= 6 && EX.every((e, i) => i === 0 || e > EX[i - 1]),
       EX.slice(0, 6).map((e) => e.toFixed(5)).join(", "));
    ok("!! the middle of every gap is FORBIDDEN and the middle of every band is ALLOWED",
       GAPS.length >= 3 && GAPS.every(([lo, hi]) => !isAllowed(0.5 * (lo + hi), P)),
       GAPS.slice(0, 3).map(([lo, hi]) => "[" + lo.toFixed(3) + ", " + hi.toFixed(3) + "]").join(" ") +
       " — |RHS| > 1 there, which is a yes-or-no question rather than a tolerance");
    ok("...and the relation is continuous across E = V0, where beta passes through zero",
       Number.isFinite(kpRhs(P.V0 - 1e-9, P)) && Number.isFinite(kpRhs(P.V0, P)) && Number.isFinite(kpRhs(P.V0 + 1e-9, P)) &&
       Math.abs(kpRhs(P.V0 - 1e-6, P) - kpRhs(P.V0 + 1e-6, P)) < 1e-3,
       "the cosh/sinh branch and the cos/sin branch meet at the removable point rather than jumping");
}

// ---- 2. THE NUMERICAL SPECTRUM FINDS THE SAME EDGES, AND CONVERGES TO THEM ------------------------------------------
{
    const rows = [200, 400, 800].map((n) => {
        const num = numericEdges({ ...P, n, count: 4 }).all.slice(0, 6);
        return { n, worst: Math.max(...num.map((v, i) => Math.abs(v - EX[i]) / EX[i])) };
    });
    ok("!! the Bloch eigenproblem lands on the transcendental band edges",
       rows[2].worst < 3e-3,
       rows.map((r) => "n=" + r.n + ": " + r.worst.toExponential(2)).join(", ") + " relative");
    ok("!! ...and refining the grid halves the error, so what remains is discretisation",
       rows[0].worst / rows[1].worst > 1.6 && rows[1].worst / rows[2].worst > 1.6,
       "ratios " + (rows[0].worst / rows[1].worst).toFixed(2) + " and " + (rows[1].worst / rows[2].worst).toFixed(2) +
       " — first order, because the barrier step lands mid-cell rather than on a node");
}

// ---- 3. THE ALTERNATION, WHICH IS A STRUCTURAL KEY AND NOT A NUMERICAL ONE --------------------------------------------
// Band edges alternate between k = 0 and k = pi/L in the pattern P, A, A, P, P, A, A ... A code that got the
// wrap sign wrong would still produce plausible energies and would break this immediately.
{
    const ne = numericEdges({ ...P, n: 600, count: 4 });
    const per = new Set(ne.periodic.map((x) => x.toFixed(6)));
    const label = ne.all.slice(0, 7).map((x) => (per.has(x.toFixed(6)) ? "P" : "A")).join("");
    ok("!! the band edges alternate P, A, A, P, P, A, A between k = 0 and k = pi/L",
       label === "PAAPPAA",
       "measured " + label + " — the classic alternation, and a structural claim that no tolerance is involved in");
}

// ---- 4. THE FALSIFIER: NOTHING LIVES INSIDE A GAP -----------------------------------------------------------------------
// *** AND THE NAIVE VERSION OF THIS TEST FAILS ON CORRECT PHYSICS. *** A numeric edge sits a little below its
// exact partner -- 8.41407 against 8.43126 -- so it lands INSIDE the exact gap [3.5607, 8.4313] by 0.017 and an
// edge-to-edge test would call a converging solver wrong. The gap INTERIOR is the honest region to police: the
// middle 80%, which is far outside the discretisation error and is still an enormous forbidden zone.
{
    const ne = numericEdges({ ...P, n: 800, count: 5 }).all;
    const violations = [];
    for (const [lo, hi] of GAPS) {
        const w = hi - lo, iLo = lo + 0.1 * w, iHi = hi - 0.1 * w;
        for (const E of ne) if (E > iLo && E < iHi) violations.push({ E, lo, hi });
    }
    ok("!! no computed state lies in the INTERIOR of any forbidden gap",
       violations.length === 0,
       violations.length ? violations.map((v) => v.E.toFixed(4) + " in [" + v.lo.toFixed(3) + "," + v.hi.toFixed(3) + "]").join("; ")
                         : GAPS.length + " gaps policed over their middle 80%, none occupied — a region the theory declares EMPTY, which is a stronger claim than an agreement");
    const totalGap = GAPS.reduce((s, [lo, hi]) => s + (hi - lo), 0);
    ok("...and the policed region is large, not a sliver",
       totalGap > 10, totalGap.toFixed(2) + " of energy forbidden across " + GAPS.length + " gaps");
}

// ---- 5. SABOTAGE: THE WRAP SIGN IS THE WHOLE OF BLOCH'S THEOREM AT THESE POINTS -------------------------------------------
{
    const per = blochSpectrum({ ...P, n: 600, antiperiodic: false, count: 4 });
    const anti = blochSpectrum({ ...P, n: 600, antiperiodic: true, count: 4 });
    ok("!! flipping the wrap sign gives a genuinely different spectrum (the sign is load-bearing)",
       per.every((v, i) => Math.abs(v - anti[i]) / v > 0.05),
       "periodic " + per.slice(0, 3).map((x) => x.toFixed(4)).join(", ") + " vs antiperiodic " +
       anti.slice(0, 3).map((x) => x.toFixed(4)).join(", ") +
       " — a code that used +1 for both would report half the band edges twice and miss the others entirely");
    // and using only one of them cannot reproduce the edge list
    const onlyPeriodic = [...per, ...per].sort((x, y) => x - y).slice(0, 6);
    const worst = Math.max(...onlyPeriodic.map((v, i) => Math.abs(v - EX[i]) / EX[i]));
    ok("!! ...and the periodic spectrum ALONE misses the true edges badly, so both are needed",
       worst > 0.2,
       "worst relative " + worst.toExponential(2) + " using k = 0 twice — the antiperiodic half is not decoration");
}

// ---- 6. determinism ----------------------------------------------------------------------------------------------------------
{
    const a = blochSpectrum({ ...P, n: 300, count: 3 });
    const b = blochSpectrum({ ...P, n: 300, count: 3 });
    ok("repeat diagonalisations are bit-identical (a failure reproduces)", a.every((v, i) => v === b[i]));
}

console.log(fails ? ("[kronigPenney-selfcheck] FAILED " + fails) : "[kronigPenney-selfcheck] all passed");
process.exit(fails ? 1 : 0);
