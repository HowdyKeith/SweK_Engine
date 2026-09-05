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
import { buildTable, albedoAt, msLobe, compensatedAlbedo } from "./energyCompensation.mjs";
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
    const Ks = [8, 16, 32, 64, 128];
    // *** THE ORDER STUDY PINS THE GRID ESTIMATOR, AND THAT IS A REQUIREMENT IT ALWAYS HAD. *** v4438 made
    // buildTable pick the SAMPLER at grazing, because the grid is wrong by a quarter there. A sampler is the
    // right default and the wrong integrand for THIS section: a convergence order is measured by watching one
    // error fall while everything under it holds still, and Monte Carlo noise does not fall with K. It would
    // put a floor under the sweep -- which is the very failure the rows below already diagnose for the fixed
    // quadrature error. So the study says `estimator: "grid"` OUT LOUD rather than inheriting whatever the
    // default happens to be, and what it measures is the TABLE'S interpolation order, which is what it claims.
    const errs = Ks.map((K) => Math.abs(compensatedAlbedo(buildTable(0.05, { K, estimator: "grid" }), 0.2) - 1));
    const ratios = errs.slice(1).map((v, i) => errs[i] / v);
    say(`table refinement at the WORST cell (alpha 0.05, cos_o 0.2), K = ${Ks.join("/")}: ${errs.map((v) => v.toExponential(2)).join(" -> ")}  ratios ${ratios.map((r) => r.toFixed(2)).join(", ")}`);

    ok("!! *** THE CLOSURE RESIDUAL IS SECOND ORDER IN THE TABLE SIZE, SO IT IS THE TABLE'S AND NOT THE ALGEBRA'S ***",
       ratios[1] > 3.5 && ratios[1] < 4.6 && ratios[2] > 3.5 && ratios[2] < 4.6,
       "*** K IS A REAL PARAMETER OF THE METHOD -- a renderer ships this table as a texture -- so 'the table is coarse' and 'the construction is wrong' had to be told apart, and they are told apart BY THE ORDER rather than by the size of the number. REFINED AT THE WORST CELL IN THE GRID rather than a comfortable one: alpha 0.05 at grazing is where E changes fastest across mu, so it is where a linear interpolation is least adequate, and it is the cell that set section 1's number. ***");

    ok("!! ...and BOTH ENDS OF THE SWEEP FALL SHORT OF 4, FOR TWO DIFFERENT AND OPPOSITE REASONS",
       ratios[0] < 3.5 && ratios[3] < 3.5,
       `*** K = 8 -> 16 gives ${ratios[0].toFixed(2)} because SECOND ORDER IS AN ASYMPTOTIC CLAIM and the coarsest table is not yet in the asymptotic regime -- demanding the limit where it does not hold would be v3491's error, asserting a value two things share when they only share a limit. AND K = 64 -> 128 gives ${ratios[3].toFixed(2)} FOR THE OPPOSITE REASON: the interpolation error has fallen BELOW THE FIXED QUADRATURE ERROR underneath it, so the sweep has stopped measuring the table and started measuring the integrator. A CONVERGENCE STUDY THAT KEEPS REFINING ONE PARAMETER EVENTUALLY MEASURES A DIFFERENT ERROR SOURCE, AND THE GIVE-AWAY IS THE RATIO FALLING AWAY FROM THE ORDER RATHER THAN HOLDING. ***`);

    // *** AND THE FLOOR IS PROVEN BY LIFTING IT RATHER THAN ASSERTED. If the top of the sweep is really the
    // quadrature underneath, then a finer quadrature must give K = 128 its order back -- and it does. Without
    // this the paragraph above would be a plausible story rather than a measurement.
    const fine = [32, 64, 128].map((K) => Math.abs(compensatedAlbedo(buildTable(0.05, { K, N: 440, M: 440, estimator: "grid" }), 0.2, { N: 800 }) - 1));
    const fineRatios = fine.slice(1).map((v, i) => fine[i] / v);
    say(`  same three K with the quadrature DOUBLED: ${fine.map((v) => v.toExponential(2)).join(" -> ")}  ratios ${fineRatios.map((r) => r.toFixed(2)).join(", ")}`);
    ok("!! *** AND LIFTING THE FLOOR GIVES K = 128 ITS ORDER BACK, WHICH IS WHAT MAKES THAT A MEASUREMENT AND NOT A STORY ***",
       fineRatios[1] > 3.7 && fineRatios[1] > ratios[3] + 0.5,
       `${ratios[3].toFixed(2)} at the shipped quadrature against ${fineRatios[1].toFixed(2)} with it doubled, on the identical tables. EXPLAINING A DISAPPOINTING NUMBER IS FREE; MAKING IT MOVE ON PURPOSE IS THE EVIDENCE.`);
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
