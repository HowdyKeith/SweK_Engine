// physics/xpbd/fluidKey-selfcheck.mjs
//
// v3464 -- GRADING THE TWO-WAY FLUID<->MESH COUPLING. fluid.js pushes an interpenetrating fluid particle and
// mesh node apart with ONE constraint split by inverse mass, and its header states the physics as a conservation
// law: "Two-way coupling is not bolted on; it is momentum. Drop the mesh half and the mesh is a wall the fluid
// slides off; drop the fluid half and the fluid tunnels through." Two edges, neither the tautology of grading
// the solver against itself:
//
//   MOMENTUM CONSERVED   equal-and-opposite impulses leave the mass-weighted centroid Sum(m_i*x_i) invariant to
//                        5e-18 -- Newton's third law, the reference computed from the masses, not the solver.
//   INVERSE-MASS SPLIT   |dA|/|dB| == wa/wb to 2e-16, the heavier node moving less, from the corrected positions
//                        against the declared masses.
//
// *** THE PLANT IS THE HEADER'S OWN: drop one half of the correction and momentum drifts by 2.6e-2, sixteen
// orders above the conserved run. *** And it is honest -- with no interpenetrating contact both the two-way solve
// and the one-sided plant do nothing, so momentum is conserved by both, and the plant shows only when a contact
// fires. So the positive control (contacts DO fire) is asserted first.

import { fluidKeys, momentumConservation, inverseMassSplit, bothPlantsBreak } from "./fluidKey.mjs";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };

const keys = fluidKeys();

// ---- 1. CONTACTS ACTUALLY FIRE, SO THE CONSERVATION IS NOT READ OFF AN EMPTY SOLVE -------------------------------------
{
    ok("interpenetrating contacts actually fire, so the solve does real work",
        keys.contactsFire === true && keys.plantMomentumErr > 1e-3,
        `the rig produces overlapping pairs and the one-sided plant leaks ${keys.plantMomentumErr.toExponential(3)} ` +
        "of momentum. Asserted first because with no contact every solver conserves momentum trivially -- the " +
        "positive control that the keys below are grading a solve that moved something");
}

// ---- 2. THE TWO-WAY SOLVE CONSERVES MOMENTUM --------------------------------------------------------------------------
{
    const m = momentumConservation();
    ok("!! the two-way contact solve conserves the mass-weighted centroid",
        m.momentumErr < 1e-12,
        `Sum(m_i*x_i) drifts by ${m.momentumErr.toExponential(3)} across the solve -- float roundoff, not a leak. ` +
        "The correction moves A by +wa*s*d and B by -wb*s*d, equal and opposite, so momentum is conserved by " +
        "construction; the reference is the conserved quantity computed from the masses, never the solver re-run");

    ok("!! and dropping one half of the correction breaks it",
        m.plantMomentumErr > 1e6 * m.momentumErr,
        `the header's own plant (mesh half dropped) leaks ${m.plantMomentumErr.toExponential(3)} against the ` +
        `conserved ${m.momentumErr.toExponential(3)} -- sixteen orders. A one-sided push is not an impulse pair, ` +
        "so it is a force from nowhere, and a device that only checked 'the fluid got pushed' would pass it");
}

// ---- 3. THE SPLIT IS BY INVERSE MASS --------------------------------------------------------------------------------
{
    const s = inverseMassSplit();
    ok("!! the displacement is split by inverse mass, so the heavier node moves less",
        s.splitErr < 1e-12 && s.heavierMovesLess === true,
        `|dA|/|dB| matches wa/wb to ${s.splitErr.toExponential(3)}, measured from the corrected positions against ` +
        "the declared masses -- two independent routes to one ratio, so agreement is a result and not a restatement");
}

// ---- 4. BOTH ONE-SIDED PLANTS BREAK IT, AND AN EMPTY RIG CONSERVES TRIVIALLY ------------------------------------------
{
    const b = bothPlantsBreak();
    ok("!! both the wall plant and the tunnel plant leak momentum",
        b.meshOnly > 1e-3 && b.fluidOnly > 1e-3,
        `mesh-only (the wall) leaks ${b.meshOnly.toExponential(3)} and fluid-only (the tunnel) leaks ` +
        `${b.fluidOnly.toExponential(3)} -- the two failures the header names, each caught by the same conserved ` +
        "quantity");

    ok("...and with no interpenetration there is nothing to conserve or leak",
        b.noContactsIsEmpty === true,
        "separated sets produce zero contacts, so the plant is invisible there -- which is why the positive " +
        "control above matters: the key has power only where a contact actually fires");
}

console.log();
if (fails) { console.log("fluidKey-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("fluidKey-selfcheck: all checks pass");
