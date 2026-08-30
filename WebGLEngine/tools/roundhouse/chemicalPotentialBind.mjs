// tools/roundhouse/chemicalPotentialBind.mjs
//
// THE CAPSTONE OF THE THERMAL FAMILY. Fix the density; the same constraint sets the fugacity at every
// temperature, and the THREE gases answer it with three different functions:
//
//     n lambda^3 = z            classical        n lambda^3 = g_{3/2}(z)  bosons        = f_{3/2}(z)  fermions
//
// *** THE ORDERING IS THE STATISTICS, AND IT IS THE WHOLE DEVICE. *** mu changes sign at z = 1, and that happens
// at a DIFFERENT phase-space density for each gas: zeta(3/2) = 2.6124 for bosons, exactly 1 classically, and
// eta(3/2) = 0.7651 for fermions. Bose > classical > Fermi, because Pauli exclusion pushes mu UP and Bose
// attraction pulls it DOWN, so at fixed n and T the fugacities run z_Fermi > z_classical > z_Bose. Measured here
// at D = 0.6: 0.740489 > 0.600000 > 0.484435.
//
// TWO OF THOSE THREE CONSTANTS ARE SIBLINGS' -- crossoverBose is bec's criticalDensity and crossoverFermi is
// fermi's etaDirichlet -- so the ordering is a claim three modules make together and none makes alone.
//
// *** AND THE SOMMERFELD COEFFICIENT IS A FERMI INTEGRAL. *** mu(T)/E_F = 1 - (pi^2/12)(T/T_F)^2, and that
// pi^2/12 is EXACTLY eta(2), which is fermi.mjs's Fermi integral at s = 2. Measured agreement 1.7e-13 between a
// coefficient in a low-temperature expansion and a quadrature in another module. Neither file was written to
// make that true.
//
// *** THE PLANT IS CLASSICAL STATISTICS EVERYWHERE, AND IT DESTROYS THE ORDERING BY COLLAPSING IT. *** Maxwell-
// Boltzmann sees neither ceiling nor floor: all three crossovers become 1 and all three fugacities become equal,
// so the strict inequality that IS the statistics degenerates into equality. That is why classical statistics
// fail at low T, and it is the module's own load-bearing negative. plantKind METHOD.
//
// The Sommerfeld coefficient is BLIND to it, because it is a constant rather than a computed occupancy -- so the
// cross-module join survives the plant and keeps being a key while the thing it grades is wrong.

import {
    muOverKT, CROSSOVER_CLASSICAL, crossoverBose, crossoverFermi,
    fugacityClassical, fugacityBose, fugacityFermi,
    SOMMERFELD_MU_COEFF, sommerfeldMu, muFermiOverEF,
} from "../../physics/thermal/chemicalPotential.mjs";
import { fermiIntegral } from "../../physics/thermal/fermi.mjs";

export const CHEMPOT_OBSERVABLES = [
    "crossoverBose", "crossoverClassical", "crossoverFermi", "crossoverOrdered", "crossoverSpread",
    "zBose", "zClassical", "zFermi", "fugacityOrdered",
    "muBose", "muClassical", "muFermi",
    "sommerfeldCoeff", "fermiIntegralAt2", "sommerfeldJoinRel",
    "muSommerfeldClosed", "muSommerfeldComputed", "muSommerfeldRel",
];

const DEF = { D: 0.6, tOverTF: 0.05 };

const rel = (a, b) => Math.abs(a - b) / Math.max(1e-300, Math.abs(b));

function buildChemPot({ mode = "fugacity", config = {} } = {}) {
    const c = { ...DEF, ...config };
    // THE PLANT: every gas is Maxwell-Boltzmann. The quantum functions become the classical one, and the strict
    // ordering that encodes the statistics degenerates into three equal numbers.
    const zB = config.planted ? fugacityClassical(c.D) : fugacityBose(c.D);
    const zF = config.planted ? fugacityClassical(c.D) : fugacityFermi(c.D);
    const zC = fugacityClassical(c.D);
    const xB = config.planted ? CROSSOVER_CLASSICAL : crossoverBose();
    const xF = config.planted ? CROSSOVER_CLASSICAL : crossoverFermi();

    return {
        crossoverBose: xB, crossoverClassical: CROSSOVER_CLASSICAL, crossoverFermi: xF,
        // STRICT inequality: equality is the plant, not a near miss.
        crossoverOrdered: (xB > CROSSOVER_CLASSICAL && CROSSOVER_CLASSICAL > xF) ? 1 : 0,
        crossoverSpread: xB - xF,

        zBose: zB, zClassical: zC, zFermi: zF,
        fugacityOrdered: (zF > zC && zC > zB) ? 1 : 0,

        muBose: muOverKT(zB), muClassical: muOverKT(zC), muFermi: muOverKT(zF),

        // The join: a coefficient in a low-T expansion against a quadrature in another module.
        sommerfeldCoeff: SOMMERFELD_MU_COEFF,
        fermiIntegralAt2: fermiIntegral(2),
        sommerfeldJoinRel: rel(SOMMERFELD_MU_COEFF, fermiIntegral(2)),

        muSommerfeldClosed: sommerfeldMu(c.tOverTF),
        muSommerfeldComputed: muFermiOverEF(c.tOverTF),
        muSommerfeldRel: rel(muFermiOverEF(c.tOverTF), sommerfeldMu(c.tOverTF)),
    };
}

const CHEMICALPOTENTIAL_MODES = ["fugacity"];   // v4074 -- the single source `modes` and `defaults()` both read

export const chemicalPotentialDevice = {
    plantKind: "method",
    // v4130 -- NAMED, THE SAME COMPLETION v3851/v4088-v4129 gave the rest of this family. MEASURED, fugacity
    // mode (only mode) both arms: crossoverSpread 1.8472 -> 0 (crossoverOrdered and fugacityOrdered also flip
    // 1 -> 0, but the spread is the sharper numeric key). sommerfeldCoeff/sommerfeldJoinRel and the
    // mu-vs-Sommerfeld cross-module join stay blind BY CONSTRUCTION -- the coefficient is a typed constant
    // rather than a computed occupancy, so it survives the plant while the thing it is joined to is wrong.
    planted: { knob: "planted", observable: "crossoverSpread",
               note: "substitutes Maxwell-Boltzmann statistics for all three gases -- classical statistics see neither the Bose ceiling nor the Fermi floor, so all three crossover densities collapse to exactly 1 and the strict ordering (Bose > classical > Fermi) that IS the statistics degenerates into equality. The spread between the Bose and Fermi crossovers goes from 1.85 to exactly 0" },
    modes: CHEMICALPOTENTIAL_MODES,
    name: "chemical-potential-three-gases-one-constraint",
    observables: CHEMPOT_OBSERVABLES,
    build: buildChemPot,
    // v4074 -- ONE DECLARATION, HONOURED BY BOTH FIELDS. `defaults()` used to return `mode || "fugacity"`,
    // which ECHOES ANY STRING BACK, so checkMode asked for a nonsense mode, got it back, and concluded the
    // device declared it. A mode selects WHICH PHYSICS RUNS, so a device that accepts a name it does not
    // declare runs something else and says nothing. The list was never unknown -- it is the `modes` array
    // directly above -- and build() never reads `mode` at all, so there was no second mode to protect.
    // Both fields read MODES so a future mode cannot be added to one and missed by the other.
    defaults: ({ mode } = {}) => ({ mode: CHEMICALPOTENTIAL_MODES.includes(mode) ? mode : CHEMICALPOTENTIAL_MODES[0], config: { ...DEF } }),
};
