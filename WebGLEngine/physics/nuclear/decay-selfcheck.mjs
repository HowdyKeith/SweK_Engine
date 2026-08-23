// physics/nuclear/decay-selfcheck.mjs
//
// v3383 -- NUCLEAR PHYSICS ENTERS THE LAB.
//
// A new field only earns a device if it can be graded against something other than itself. This one arrives with
// four keys, independent of each other rather than four faces of one formula:
//
//   BATEMAN vs RK4       the chain A -> B -> C has an exact analytic solution AND a direct numerical one.
//                        Algebra against quadrature, sharing no line. Measured agreement 4.5e-15.
//   CONSERVATION         N_A + N_B + N_C = N0 at every time, EXACTLY. Residual measured at 0.
//   SECULAR EQUILIBRIUM  an exact LIMIT, which is stronger than a value because it must be approached at a
//                        definite rate as the parent's lifetime grows.
//   THE MASS FORMULA     predicts REAL NUCLIDES. This is a key against nature rather than against the tree.
//
// *** THE FOURTH IS THE ONE WORTH THE ROUND. *** Given only the mass number, maximising Bethe-Weizsaecker
// binding over Z returns Z = 2 for A = 4, Z = 8 for A = 16, Z = 26 for A = 56 and Z = 92 for A = 238 -- helium,
// oxygen, IRON and uranium. Four correct nuclides from five constants, and the binding peak lands at A = 58 with
// 8.86 MeV against a measured iron/nickel peak near 8.79 MeV. Nothing in the tree could have told it those.

import { lambdaFromHalfLife, halfLifeFromLambda, decayN, activity, batemanChain, batemanIntegrated, activityRatio, bindingEnergy, bindingPerNucleon, mostStableZ, bindingPeak, fissionQ, SEMF, pairingTerm } from "./decay.mjs";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };

// ---- 1. THE HALF-LIFE RELATION AND SINGLE DECAY ------------------------------------------------------------------
{
    ok("!! a population halves in exactly one half-life",
        [1, 7, 1e6].every((t) => Math.abs(decayN(1, lambdaFromHalfLife(t), t) - 0.5) < 1e-15),
        "checked at half-lives spanning six orders. lambda = ln2 / t_half is a definition, so this catches a " +
        "typo rather than proving physics -- stated as such");

    ok("...and the conversion round-trips",
        [0.5, 12, 1e-9].every((t) => Math.abs(halfLifeFromLambda(lambdaFromHalfLife(t)) - t) / t < 1e-15),
        "two functions, one relation, and they must invert each other exactly");
}

// ---- 2. BATEMAN: CLOSED FORM AGAINST AN INDEPENDENT INTEGRATION -----------------------------------------------------
{
    const cases = [[0.07, 0.31, 5], [0.07, 0.31, 20], [0.4, 0.05, 30]];
    const worst = Math.max(...cases.map(([l1, l2, t]) => {
        const c = batemanChain(1, l1, l2, t), i = batemanIntegrated(1, l1, l2, t);
        return Math.max(Math.abs(c.A - i.A), Math.abs(c.B - i.B), Math.abs(c.C - i.C));
    }));
    ok("!! the Bateman closed form matches RK4 integration of the same ODEs",
        worst < 1e-12,
        `worst difference ${worst.toExponential(2)} across three chains including one where the DAUGHTER is ` +
        "longer-lived than the parent. The closed form is algebra; RK4 steps the differential equations. " +
        "Neither knows the other exists");

    const s = batemanChain(1, 0.07, 0.31, 20);
    ok("!! and nucleon number is conserved EXACTLY, not approximately",
        [1, 5, 20, 100].every((t) => {
            const x = batemanChain(1, 0.07, 0.31, t);
            return Math.abs(x.A + x.B + x.C - 1) < 1e-15;
        }),
        `residual ${(s.A + s.B + s.C - 1).toExponential(1)} at t = 20. Atoms move between species and do not ` +
        "vanish, so the three terms must sum identically -- a closed form that only conserved approximately " +
        "would have an algebra error, not a rounding one");
}

// ---- 3. THE DEGENERATE CASE HAS ITS OWN LIMIT, NOT A NEARLY-ZERO DENOMINATOR ------------------------------------------
{
    const eq = batemanChain(1, 0.2, 0.2, 10);
    const near = batemanChain(1, 0.2, 0.2000001, 10);
    ok("!! equal decay constants use the limit form rather than dividing by zero",
        eq.degenerate === true && Number.isFinite(eq.B) && Math.abs(eq.B - near.B) < 1e-5,
        `at l1 = l2 the general solution has a (l2 - l1) denominator. The limit N_B = N0 lambda t exp(-lambda t) ` +
        `gives ${eq.B.toFixed(9)}, and approaching from l2 = l1 + 1e-7 gives ${near.B.toFixed(9)} -- the two ` +
        "agree, so the special case is the actual limit and not a patch");
}

// ---- 4. SECULAR EQUILIBRIUM AS A LIMIT, APPROACHED AT A RATE ------------------------------------------------------------
{
    const ratios = [1e-2, 1e-3, 1e-4, 1e-5].map((l1) => Math.abs(activityRatio(1, l1, 0.5, 200) - 1));
    ok("!! the daughter's activity approaches the parent's as the parent outlives it",
        ratios[ratios.length - 1] < 1e-4,
        `|ratio - 1| = ${ratios.map((r) => r.toExponential(1)).join(", ")} for parent lambdas 1e-2 down to 1e-5. ` +
        "Secular equilibrium is an exact limit, and the approach being monotone in the lifetime ratio is what " +
        "makes it a check rather than a single lucky value");

    ok("...and the approach is FIRST ORDER in the lifetime ratio",
        ratios.slice(1).every((r, i) => ratios[i] / r > 5 && ratios[i] / r < 20),
        `each tenfold increase in the parent lifetime cuts the departure roughly tenfold. A different power ` +
        "would mean the limit is being reached for the wrong reason");
}

// ---- 5. THE MASS FORMULA PREDICTS REAL NUCLIDES -- a key against NATURE -------------------------------------------------
{
    const known = [[4, 2, "helium-4"], [16, 8, "oxygen-16"], [56, 26, "iron-56"], [238, 92, "uranium-238"]];
    const got = known.map(([A, Z]) => mostStableZ(A).Z);
    ok("!! maximising binding over Z returns the actual nuclide, from mass number alone",
        known.every(([A, Z], i) => got[i] === Z),
        known.map(([A, Z, n], i) => `A=${A} -> Z=${got[i]} (${n} is Z=${Z})`).join("  |  ") +
        ". Five constants, four correct nuclides. Nothing in this tree could have supplied those answers");

    const p = bindingPeak();
    ok("!! and the binding curve peaks at the iron/nickel region, found rather than assumed",
        p.A >= 54 && p.A <= 64 && p.perNucleon > 8.5 && p.perNucleon < 9.1,
        `peak at A = ${p.A} with ${p.perNucleon.toFixed(4)} MeV per nucleon, against a measured maximum near ` +
        "A = 56-62 at about 8.79 MeV. The search runs over A = 2 to 250 with no hint where to look -- this is " +
        "why fusion pays below iron and fission pays above it");

    ok("...and light and heavy nuclei are both less bound than the peak",
        bindingPerNucleon(4, 2) < p.perNucleon && bindingPerNucleon(238, 92) < p.perNucleon,
        `helium ${bindingPerNucleon(4, 2).toFixed(3)} and uranium ${bindingPerNucleon(238, 92).toFixed(3)} against ` +
        `the peak ${p.perNucleon.toFixed(3)}. The curve has to rise then fall, or there would be no energy in ` +
        "either fusion or fission");
}

// ---- 5b. *** THE PAIRING TERM, AND THE PARITY STRUCTURE OF THE NUCLIDE CHART IT ALONE PRODUCES *** ----------
//
// v3941 -- pairingTerm was reached only THROUGH bindingEnergy, so every number above already depended on it and
// nothing named it or asked what it does. It is three lines and a sign, which is exactly the shape this tree's
// definitionGates round is about: r_s = 2M survived five gates for the same reason.
//
// The algebra is exact and is asserted with === rather than a tolerance -- there is nothing here to round.
// A % 2 === 1 gives exactly 0; even-even gives +aP/sqrt(A); even-odd gives -aP/sqrt(A).
//
// *** AND THE KEY THAT MATTERS IS NOT THE ALGEBRA, IT IS WHAT THE TERM DOES TO THE CHART. *** Nature's stable
// nuclides are overwhelmingly even-even and there are only a handful of stable odd-odd ones. Run the model's
// own argmax over Z for every even A from 20 to 240 and it picks an EVEN Z all 111 times. Subtract the pairing
// term from the same model -- the counterfactual is bindingEnergy MINUS pairingTerm, so no second spelling of
// the mass formula exists here -- and the structure collapses: 58 of 111, a coin flip, with the choice moving
// in 53 cases. THE TERM IS NOT A CORRECTION TO A NUMBER, IT IS WHAT PUTS THE PARITY IN THE ANSWER, and the
// counterfactual is what turns that from a sentence into a measurement.
{
    const aP = SEMF.aP;
    ok("!! pairingTerm is EXACT in all three cases, not approximately signed",
        pairingTerm(57, 26) === 0 &&
        pairingTerm(56, 26) === aP / Math.sqrt(56) &&
        pairingTerm(56, 27) === -aP / Math.sqrt(56),
        `odd-A ${pairingTerm(57, 26)} exactly; even-even +${pairingTerm(56, 26).toFixed(6)}; even-odd ` +
        `${pairingTerm(56, 27).toFixed(6)} -- each === aP/sqrt(A) with aP = ${aP}. Asserted with === because ` +
        "there is no integration and no tolerance to argue about: a sign flip or a missing sqrt fails outright.");

    // The model's own argmax, with and without the term. bindingEnergy - pairingTerm is the counterfactual, so
    // the five constants are never written down a second time.
    const noPair = (A, Z) => bindingEnergy(A, Z) - pairingTerm(A, Z);
    const argmaxZ = (A, f) => { let bZ = 1, b = -Infinity; for (let Z = 1; Z < A; Z++) { const v = f(A, Z); if (v > b) { b = v; bZ = Z; } } return bZ; };
    let evenA = 0, evenWith = 0, evenWithout = 0, moved = 0, oddA = 0, oddZero = 0;
    for (let A = 20; A <= 240; A += 2) {
        evenA++;
        const zw = mostStableZ(A).Z, zn = argmaxZ(A, noPair);
        if (zw % 2 === 0) evenWith++;
        if (zn % 2 === 0) evenWithout++;
        if (zw !== zn) moved++;
    }
    for (let A = 21; A <= 239; A += 2) { oddA++; if (pairingTerm(A, mostStableZ(A).Z) === 0) oddZero++; }

    ok("!! *** WITH PAIRING THE MODEL PICKS AN EVEN Z FOR EVERY EVEN A, AND WITHOUT IT THE PARITY IS A COIN FLIP ***",
        evenWith === evenA && evenWithout < evenA * 0.7 && moved > 20,
        `${evenWith} of ${evenA} even-A nuclides land on an EVEN Z with the term, ${evenWithout} of ${evenA} ` +
        `without it, and the choice moves in ${moved} cases. Nature's stable chart is overwhelmingly even-even ` +
        "with a handful of odd-odd exceptions, and THIS TERM IS WHERE THAT COMES FROM -- the counterfactual is " +
        "the model minus its own pairing term, so nothing but the term itself changed between the two columns.");

    ok("...and an odd-A nuclide gets exactly no pairing at all, which is the third case rather than a small one",
        oddZero === oddA,
        `${oddZero} of ${oddA} odd-A mass numbers return exactly 0. An unpaired nucleon is left over either ` +
        "way, so the term has nothing to say -- and a version that returned a small number here instead of " +
        "zero would shift every odd-A prediction while still looking like a pairing term.");
}

// ---- 6. FISSION Q -- RIGHT ORDER, AND THE SCOPE IS STATED -------------------------------------------------------------
{
    const q = fissionQ(238, 92);
    ok("!! symmetric fission of uranium releases a few hundred MeV",
        q > 150 && q < 250,
        `${q.toFixed(1)} MeV against a measured yield near 200 MeV. The liquid-drop model OVERSHOOTS, and it ` +
        "would: real fission is ASYMMETRIC, splitting near mass 95 and 140 rather than into equal halves, and " +
        "the shell effects that cause that asymmetry are exactly what these five smooth terms omit. Right order " +
        "from a model that does not contain the mechanism");

    ok("...and the sign is the physically meaningful part",
        fissionQ(238, 92) > 0 && fissionQ(56, 26) < 0,
        `uranium releases ${q.toFixed(0)} MeV and iron ABSORBS ${(-fissionQ(56, 26)).toFixed(0)}. Splitting iron ` +
        "costs energy, which is the same statement as the binding peak and arrives here by a different route");
}

console.log();
if (fails) { console.log("decay-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("decay-selfcheck: all checks pass");
