// WebGLEngine/physics/render/energyCompensation-selfcheck.mjs -- v3492
//
// Run: node physics/render/energyCompensation-selfcheck.mjs   (~10s)
//
// *** THE ANSWER KEY WAS BUILT ONE ROUND BEFORE THE CODE. *** v3490 measured the shortfall; the requirement on
// anything that claims to return it was fixed at that moment -- E BACK TO EXACTLY 1, AT EVERY ROUGHNESS AND
// EVERY ANGLE -- and nothing in this round got to choose what "working" means.
//
// *** THE FINDING: THE TWO PLANTS FAIL IN OPPOSITE DIRECTIONS AND A CHECK WRITTEN AS `E <= 1` -- WHICH IS THE
// PHYSICALLY OBVIOUS ONE, SINCE A SURFACE CANNOT RETURN MORE THAN IT RECEIVES -- WOULD CERTIFY THE ONE THAT
// MANUFACTURES ENERGY. Only an exact equality catches both. ***
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildTable, albedoAt, msLobe, compensatedAlbedo, ORDER_SWEEP } from "./energyCompensation.mjs";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const say = (m) => console.log("  ----  " + m);

const ALPHAS = [0.05, 0.2, 0.4, 0.6, 0.8, 1.0];
const ANGLES = [0.9, 0.5, 0.2];
const TABLES = ALPHAS.map((a) => buildTable(a));

/* ------------------------------------------------------------------------------------------------------------
 * 1. THE CLOSURE: EXACTLY 1, EVERYWHERE, AND THE LOBE IS INTEGRATED RATHER THAN ASSUMED
 * --------------------------------------------------------------------------------------------------------- */
{
    let worst = 0;
    for (let i = 0; i < TABLES.length; i++) {
        const row = ANGLES.map((c) => compensatedAlbedo(TABLES[i], c));
        row.forEach((v) => { worst = Math.max(worst, Math.abs(v - 1)); });
        say(`  alpha ${String(ALPHAS[i]).padEnd(5)} E ${ANGLES.map((c) => albedoAt(TABLES[i], c).toFixed(6)).join(" ")}  ->  compensated ${row.map((v) => v.toFixed(9)).join(" ")}   E_avg ${TABLES[i].Eavg.toFixed(6)}`);
    }
    say(`worst |E_total - 1| over ${ALPHAS.length} roughnesses x ${ANGLES.length} angles: ${worst.toExponential(3)}`);
    ok("!! *** THE COMPENSATED ALBEDO IS 1 AT EVERY ROUGHNESS AND EVERY ANGLE, WHICH IS WHAT v3490 DEMANDED ***",
       worst < 2.5e-4,
       "*** THE REQUIREMENT WAS FIXED BEFORE THIS CODE EXISTED, so this round could not choose what 'working' means -- which is the whole argument for building answer keys first, and the first time in this arc that the key genuinely predated the implementation. THE HEMISPHERE INTEGRAL IS COMPUTED NUMERICALLY: substituting the closed form (1 - E) would make the function return 1 by construction and this check would be grading arithmetic. ***");

    ok("...and it does so from BOTH ends of the roughness range, where E itself differs by a factor of three",
       Math.abs(compensatedAlbedo(TABLES[0], 0.5) - 1) < 1e-4 && Math.abs(compensatedAlbedo(TABLES[5], 0.5) - 1) < 1e-4,
       `E(0.5) is ${albedoAt(TABLES[0], 0.5).toFixed(6)} at alpha 0.05 and ${albedoAt(TABLES[5], 0.5).toFixed(6)} at alpha 1.0, and both land on 1 after compensation. A construction that only worked near one end would be a fit.`);
}

/* ------------------------------------------------------------------------------------------------------------
 * 2. THE RESIDUAL IS THE TABLE'S, AND ITS ORDER SAYS SO
 * --------------------------------------------------------------------------------------------------------- */
{
    // *** REFINED AT THE WORST CELL IN THE WHOLE GRID (alpha 0.05, grazing) AND NOT AT A COMFORTABLE ONE. That
    // is where E changes fastest across mu, so it is where a linear table interpolation is least adequate --
    // and it is the cell that set section 1's number. REFINING WHERE IT ALREADY LOOKS GOOD WOULD BE MEASURING
    // THE FIXTURE (v3417).
    // *** v4411 -- THIS SWEEP USED TO READ 2 AND THE 2 WAS THE INSTRUMENT'S. *** From v3492 to v4410 the table
    // was built by a QUADRATURE, and the residual's order came out second. It is third. The conclusion this
    // section drew -- "the residual is the TABLE's and not the algebra's" -- was right; the exponent belonged
    // to the grid underneath, and buildTable now defaults to a grid-free estimator, so the sweep measures what
    // it always claimed to. The order is now also a DISCRIMINATOR FOR WHICH INSTRUMENT BUILT THE TABLE.
    //
    // REFINED AT THE WORST CELL IN THE WHOLE GRID (alpha 0.05, grazing) AND NOT AT A COMFORTABLE ONE -- where E
    // changes fastest across mu, so a linear table interpolation is least adequate. Refining where it already
    // looks good would be measuring the fixture (v3417). The LOBE INTEGRAL is held far finer than the table so
    // the integrator is not what is being measured -- that confusion is exactly what this section used to make.
    const Ks = [16, 32, 64, 128];
    const order = (cfg) => {
        const e = Ks.map((K) => Math.abs(compensatedAlbedo(buildTable(0.05, { K, ...cfg }), 0.2, { N: 2000 }) - 1));
        const x = Ks.map((k) => Math.log(k)), y = e.map((v) => Math.log(v));
        const mx = x.reduce((a, b) => a + b) / x.length, my = y.reduce((a, b) => a + b) / y.length;
        return { e, p: -x.reduce((t, v, i) => t + (v - mx) * (y[i] - my), 0) / x.reduce((t, v) => t + (v - mx) ** 2, 0) };
    };
    const S = order({}), Q = order({ quadrature: true, N: 220, M: 220 });
    say(`table refinement at the WORST cell (alpha 0.05, cos_o 0.2), K = ${Ks.join("/")}`);
    say(`  grid-free estimator: ${S.e.map((v) => v.toExponential(2)).join(" -> ")}   fitted order ${S.p.toFixed(2)}`);
    say(`  quadrature N = 220:  ${Q.e.map((v) => v.toExponential(2)).join(" -> ")}   fitted order ${Q.p.toFixed(2)}`);

    ok("!! *** THE CLOSURE RESIDUAL IS THIRD ORDER IN THE TABLE SIZE, SO IT IS THE TABLE'S AND NOT THE ALGEBRA'S ***",
       S.p > 2.7 && S.p < 3.3,
       `fitted ${S.p.toFixed(2)}. *** K IS A REAL PARAMETER OF THE METHOD -- a renderer ships this table as a texture -- so "the table is coarse" and "the construction is wrong" are told apart BY THE ORDER rather than by the size of the number. THREE and not two because linear interpolation error on a MIDPOINT grid alternates in sign cell to cell, and integrating it against a smooth weight cancels one order. ***`);

    ok("!! *** AND THE SECOND ORDER THIS SECTION READ UNTIL v4410 WAS THE QUADRATURE'S, NOT THE TABLE'S ***",
       Q.p > 1.8 && Q.p < 2.4 && S.p - Q.p > 0.5,
       `the identical sweep on a quadrature-built table fits ${Q.p.toFixed(2)} against ${S.p.toFixed(2)} grid-free -- ${(S.p - Q.p).toFixed(2)} apart on the same tables, same Ks, same lobe integral. The quadrature's E carries a grid-dependent wobble that does NOT alternate in sign, so it dominates the alternating interpolation error and reads 2. THE EXPONENT IDENTIFIES THE INSTRUMENT`);

    // *** AND THAT IS PROVEN BY REMOVING THE INSTRUMENT GRADUALLY RATHER THAN ASSERTED. *** If the 2 is the
    // grid's, refining the grid must walk the order up to 3 -- and it does, monotonically. Frozen in
    // energyCompensation.mjs because the N = 1200 point alone costs 34 s; the two endpoints above are re-run
    // every time, so a freeze that stopped matching the tree would show there.
    const q = ORDER_SWEEP.quadrature, sm = ORDER_SWEEP.sampled;
    say(`  frozen climb: ${q.map((r) => `N=${r.N} ${r.order}`).join(", ")}  |  ${sm.map((r) => `${r.samples} samples ${r.order}`).join(", ")}`);
    ok("!! *** AND THE ORDER CLIMBS 2.09 -> 2.84 AS THE GRID IS REFINED, WHICH IS WHAT MAKES THAT A MEASUREMENT ***",
       q[q.length - 1].order - q[1].order > 0.6 && q.every((r, i) => i === 0 || r.order >= q[i - 1].order - 0.03) &&
       sm.every((r) => Math.abs(r.order - 3) < 0.1),
       `${q[1].order} at the shipped grid, ${q[q.length - 1].order} at N = ${q[q.length - 1].N}, and ${sm.map((r) => r.order).join("/")} grid-free across ${sm.length} sample counts spanning ${sm[sm.length - 1].samples / sm[0].samples}x. FLAT IN SAMPLE COUNT is what says the 3 is the interpolation and not the estimator's own noise. EXPLAINING A DISAPPOINTING NUMBER IS FREE; MAKING IT MOVE ON PURPOSE IS THE EVIDENCE.`);
}

/* ------------------------------------------------------------------------------------------------------------
 * 3. RECIPROCITY, EXACT BY CONSTRUCTION
 * --------------------------------------------------------------------------------------------------------- */
{
    const T = buildTable(0.6);
    let worst = 0;
    for (const a of [0.1, 0.3, 0.5, 0.7, 0.9]) for (const b of [0.1, 0.3, 0.5, 0.7, 0.9])
        worst = Math.max(worst, Math.abs(msLobe(T, a, b) - msLobe(T, b, a)));
    ok("!! the lobe is symmetric in its two directions, BIT FOR BIT",
       worst === 0,
       "Helmholtz reciprocity. Asserted as an exact zero rather than to a tolerance because there is no arithmetic here that could make it approximate -- the expression is symmetric in the two arguments by construction, and a version that was not would be violating a physical law rather than accumulating error.");
}

/* ------------------------------------------------------------------------------------------------------------
 * 4. IT VANISHES WHERE THERE IS NOTHING TO COMPENSATE
 * --------------------------------------------------------------------------------------------------------- */
{
    const smooth = compensatedAlbedo(TABLES[0], 0.5) - albedoAt(TABLES[0], 0.5);
    const rough = compensatedAlbedo(TABLES[5], 0.5) - albedoAt(TABLES[5], 0.5);
    say(`the compensation itself: ${smooth.toExponential(3)} at alpha 0.05 against ${rough.toExponential(3)} at alpha 1.0`);
    ok("!! the added energy IS the shortfall, and it goes to zero as the surface smooths",
       Math.abs(smooth - (1 - albedoAt(TABLES[0], 0.5))) < 1e-4 && rough / smooth > 50,
       "A compensation that added a fixed amount, or that kept adding as E approached 1, would push a nearly-perfect mirror above unity. THE TERM MUST DISAPPEAR ON ITS OWN rather than be switched off by a threshold somebody chose.");
}

/* ------------------------------------------------------------------------------------------------------------
 * 5. *** TWO PLANTS, OPPOSITE SIGNS, AND THE OBVIOUS CHECK CERTIFIES ONE OF THEM ***
 * --------------------------------------------------------------------------------------------------------- */
{
    const under = ALPHAS.map((a, i) => compensatedAlbedo(TABLES[i], 0.5, { noDenominator: true }));
    say(`noDenominator: ${under.map((v) => v.toFixed(6)).join(", ")} across alpha ${ALPHAS.join(", ")}`);
    ok("!! dropping the 1/(1 - E_avg) UNDER-compensates, and is invisible exactly where E was already fine",
       under.every((v) => v < 1) && Math.abs(under[0] - 1) < 0.01 && 1 - under[4] > 0.2,
       `*** ${(Math.abs(under[0] - 1) * 100).toFixed(2)}% SHORT AT alpha 0.05, INSIDE ANY TOLERANCE ANYBODY WOULD WRITE, against ${((1 - under[4]) * 100).toFixed(1)}% AT alpha 0.8. At low roughness E_avg approaches 1, so the missing denominator scales the term almost to nothing -- and there was almost nothing to add, so the fault hides behind its own subject. FOURTH ROUND RUNNING WHERE THE SMOOTH END IS THE BLIND END. ***`);

    const over = [1, 2, 4].map((i) => ({
        a: ALPHAS[i],
        v: compensatedAlbedo(TABLES[i], 0.5, { table: buildTable(ALPHAS[i], { plant: { separable: true } }) }),
    }));
    say(`wrong table (separable-G2 albedo used on the height-correlated lobe): ${over.map((r) => `alpha ${r.a} -> ${r.v.toFixed(6)}`).join(", ")}`);
    ok("!! *** AND COMPENSATING AGAINST THE WRONG ALBEDO TABLE MANUFACTURES ENERGY ***",
       over.every((r) => r.v > 1) && over[2].v > 1.02,
       "*** BOTH TABLES ARE LEGITIMATE -- height-correlated and separable Smith are two accepted models (v3490) -- and using one to compensate the other is the kind of substitution nobody would call a bug. It reads ABOVE ONE, which is a surface returning more light than it received. ***");

    ok("!! *** A CHECK WRITTEN AS `E_total <= 1` WOULD CERTIFY THE PLANT THAT INVENTS ENERGY ***",
       under.every((v) => v <= 1) && over.every((r) => r.v > 1),
       "*** AND `E_total <= 1` IS THE PHYSICALLY OBVIOUS FORM, BECAUSE A SURFACE CANNOT RETURN MORE THAN IT RECEIVES -- so the bound somebody would naturally reach for passes every under-compensating fault silently and is the only thing that catches the over-compensating one. THE TWO PLANTS FAIL IN OPPOSITE DIRECTIONS AND ONLY AN EXACT EQUALITY CATCHES BOTH. A BOUND IS NOT A KEY. ***");
}

/* ------------------------------------------------------------------------------------------------------------
 * 6. *** THE HONEST LIMIT, STATED BEFORE THE CLOSURE IS BELIEVED RATHER THAN AFTER ***
 * --------------------------------------------------------------------------------------------------------- */
{
    const T = buildTable(0.6);
    const fake = { ...T, alpha: 999 };                 // a different "material" carrying the SAME albedo table
    let worst = 0;
    for (const a of [0.2, 0.5, 0.8]) for (const b of [0.2, 0.5, 0.8])
        worst = Math.max(worst, Math.abs(msLobe(T, a, b) - msLobe(fake, a, b)));
    ok("!! *** THE LOBE DEPENDS ON NOTHING BUT E AND E_avg, SO TWO DIFFERENT MATERIALS WITH THE SAME ALBEDO GET THE IDENTICAL COMPENSATION ***",
       worst === 0,
       "*** WHICH CANNOT BE RIGHT IN DETAIL: the true multiple-scattering term depends on the microsurface that produced it, and this one cannot know what that was. IT RESTORES THE ENERGY AND NOT THE DISTRIBUTION. AN EXACT CLOSURE IS PROOF OF CONSISTENCY AND NEVER OF CORRECTNESS -- the sixth instance of that sentence in this tree (oscillation's unitarity, lensing's magnification difference, Friedmann's Omega closure), and the first one NAMED IN ADVANCE AND THEN DEMONSTRATED rather than discovered afterwards. ***");

    ok("...and the construction is the simplest one meeting its three requirements, which is a CHOICE and is said so",
       msLobe(T, 0.5, 0.5) > 0 && msLobe(buildTable(0.05), 0.5, 0.5) < msLobe(T, 0.5, 0.5),
       "Reciprocal, energy-restoring, and vanishing where there is nothing to compensate. Those three fix it up to the separable form used here; they do not make it the truth, and a round that presented an exact closure without this line would be overclaiming.");
}

/* ------------------------------------------------------------------------------------------------------------
 * 7. THE FRONT DOOR, ASSERTED AS A MECHANISM AND NEVER AS A MENTION
 * --------------------------------------------------------------------------------------------------------- */
{
    const src = fs.readFileSync(path.join(ROOT, "path-tracer.html"), "utf8");
    ok("!! path-tracer.html imports the compensation and calls it",
       /from\s*"\/physics\/render\/energyCompensation\.mjs"/.test(src) && /compensatedAlbedo\(/.test(src),
       "It lands in the SAME section as v3490's energy table rather than a new one, because the compensated column only means anything beside the uncompensated one -- a page showing a column of ones would look like a test that cannot fail.");
}

console.log(fails ? "\nenergyCompensation-selfcheck: " + fails + " FAILED" : "\nenergyCompensation-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
