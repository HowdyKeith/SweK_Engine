// tools/roundhouse/structureFactorBind.mjs
//
// DIFFRACTION FROM A LATTICE -- THE ONLY SUBJECT IN THIS LAB WHOSE ANSWER KEY IS AN EXACT ZERO BY LAW.
//
// Every other instrument here hunts for agreements with no tolerance in them: integer root counts, flip counts,
// rank equalities. *** CRYSTALLOGRAPHY HANDS THEM OVER FOR FREE. A SYSTEMATIC ABSENCE IS NOT A SMALL NUMBER, IT
// IS A REFLECTION THAT CANNOT EXIST. *** An FCC lattice produces NO signal at mixed-parity hkl; BCC none where
// h+k+l is odd; diamond kills a further class. The sum over the basis is ALGEBRAICALLY zero, and a structure
// returning anything there is wrong about the crystal rather than imprecise about the arithmetic.
//
// MEASURED, AND THE SEPARATION IS THE WHOLE POINT:
//
//     FCC, 540 mixed-parity reflections     worst |F| = 9.797e-16
//     smallest ALLOWED |F| anywhere         4.000000
//     *** A GAP OF 4.1e15 ***
//
// There is no epsilon to argue about: any tolerance between 1e-14 and 1 gives the identical verdict, which is
// what it means for a key to be EXACT rather than tight. BCC's odd class comes in at 4.900e-15 and diamond's at
// 6.432e-15, all against a floor of 4, 2 and 5.657 respectively.
//
// *** THE PLANT IS THE ERROR THAT MAKES ABSENCES INTO PEAKS: one basis atom off its site. *** Displace the FCC
// face-centre at [0, 0.5, 0.5] by a fraction of a cell and the destructive interference stops being exact --
// forbidden reflections light up, which is a crystal that is not the crystal you named. plantKind KNOB: the
// displacement is a config value, and the census can see it.
//
// AND TWO OF THE FOUR ROUTES ARE BLIND TO IT, WHICH IS HOW THE DISAGREEMENT IS LOCALISED.
//
//   THE DIRECT SUM      adds phasors over atom positions and knows nothing about parity -- IT MOVES.
//   THE CLOSED FORM     is the parity rule and never touches an atom -- BLIND.
//   THE RECIPROCAL IDENTITIES  a_i . b_j = 2 pi delta_ij, a fact about the LATTICE VECTORS -- BLIND, because
//                       moving an atom inside the cell does not move the cell.
//
// So the plant is caught as a DISAGREEMENT BETWEEN TWO ROUTES rather than by either alone, and the reciprocal
// residual stays at its exact zero throughout -- a reference that moved with the thing it grades would not be
// one. A device carrying only the closed form would report a perfect crystal while the atoms were in the wrong
// places.

import {
    BASES, structureFactorSum, structureFactorClosed, isAbsent, absenceSweep, reciprocalResidual,
} from "../../physics/crystal/structureFactor.mjs";

export const SF_OBSERVABLES = [
    "nAbsent", "nAllowed", "worstAbsent", "minAllowed", "absenceGap",
    "closedVsSumWorst", "reciprocalResidualCubic", "reciprocalResidualTriclinic",
    "forbiddenLitUp",
];

const DEF = { lattice: "fcc", hklMax: 4, displace: 0 };

// reciprocalResidual reports the two ways a_i . b_j can be wrong SEPARATELY -- a diagonal that missed 2 pi and an
// off-diagonal that failed to vanish. Neither alone is the residual; the worse of them is.
function recipWorst(a1, a2, a3) {
    const r = reciprocalResidual(a1, a2, a3);
    return r.ok ? Math.max(r.diagonal, r.offDiagonal) : Infinity;
}

function buildSF({ mode = "absences", config = {} } = {}) {
    const c = { ...DEF, ...config };
    // THE PLANT: one basis atom off its site. `displace` is a real knob -- 0 is the true crystal.
    const d = config.planted ? (c.displace || 0.05) : c.displace;
    const basis = BASES[c.lattice].map((p, i) => (i === 1 ? [p[0] + d, p[1], p[2]] : p));

    const sweep = absenceSweep(c.lattice, { hklMax: c.hklMax });

    // Walk the same hkl range the sweep does, comparing the two routes on the PLANTED basis.
    let closedVsSumWorst = 0, forbiddenLitUp = 0;
    const M = c.hklMax;
    for (let h = -M; h <= M; h++) for (let k = -M; k <= M; k++) for (let l = -M; l <= M; l++) {
        if (h === 0 && k === 0 && l === 0) continue;
        const sum = structureFactorSum(basis, h, k, l).mag;
        const closed = Math.abs(structureFactorClosed(c.lattice, h, k, l));
        closedVsSumWorst = Math.max(closedVsSumWorst, Math.abs(sum - closed));
        // A reflection the law forbids that is nevertheless producing signal.
        if (isAbsent(c.lattice, h, k, l) && sum > 1e-9) forbiddenLitUp++;
    }

    return {
        nAbsent: sweep.nAbsent, nAllowed: sweep.nAllowed,
        worstAbsent: sweep.worstAbsent, minAllowed: sweep.minAllowed,
        // The separation, as one number. null when a lattice has no absences at all (sc).
        absenceGap: sweep.worstAbsent > 0 ? sweep.minAllowed / sweep.worstAbsent : Infinity,
        closedVsSumWorst,
        // The lattice is untouched by a basis displacement, so these are the reference that must not move.
        //
        // *** v4066 -- AN OBSERVABLE CENSUS FLAGGED BOTH OF THESE AS MOVED BY NOTHING, AND THAT IS CORRECT AND
        // INTENDED. *** The cells are typed here on purpose: they are REFERENCES, so no knob reaches them and
        // the displacement plant cannot touch them. A number that changed with `lattice` or `displace` would
        // be the defect. This is mpmstep.nu's shape -- flat BECAUSE the claim is true -- and the entry exists
        // so the next census does not re-open a question already answered.
        //
        // *** AND THE CONTROL WAS MEASURED FOR TEETH RATHER THAN ASSUMED TO HAVE THEM, because a reference
        // that cannot fail is worth nothing and looks identical to one that cannot be moved. *** Against a
        // deliberately wrong reciprocal, scaling the true b by s, the diagonal residual reads:
        //     s = 2         -> 6.283      (exactly TAU, the whole identity gone)
        //     s = 1.001     -> 6.28e-3
        //     s = 1 + 1e-9  -> 6.28e-9
        // against a noise floor of 8.88e-16 on the triclinic cell. SEVEN ORDERS OF MAGNITUDE of sensitivity to
        // a wrong reciprocal, so the zero is a measurement and not an accident of arithmetic.
        //
        // THE TRICLINIC CELL IS THE LOAD-BEARING ONE AND THE CUBIC IS NOT, which the same measurement shows:
        // an orthonormal basis makes every dot product exact, so reciprocalResidualCubic is EXACTLY 0 and
        // would stay 0 under a reciprocal that only got general cells wrong. The triclinic residual is
        // 8.88e-16 -- nonzero, i.e. actually exercising the cross products and the 1/volume normalisation.
        // A device carrying only the cubic reference would be carrying a check that cannot see the bug class
        // it exists for. (A coplanar cell is refused outright, ok:false, so the singular guard fires too.)
        reciprocalResidualCubic: recipWorst([1, 0, 0], [0, 1, 0], [0, 0, 1]),
        reciprocalResidualTriclinic: recipWorst([1, 0, 0], [0.3, 1.1, 0], [0.2, 0.4, 0.9]),
        forbiddenLitUp,
    };
}

const STRUCTUREFACTOR_MODES = ["absences"];   // v4074 -- the single source `modes` and `defaults()` both read

export const structureFactorDevice = {
    // *** v4034 -- DERIVED FROM THE TABLE THE VALIDITY GUARD ALREADY CONSULTS, NOT COPIED BESIDE IT. ***
    // compose's choices (v4033) name OTHER devices, so they are written out literally and the gate checks them
    // against the lab -- a claim about somebody else's modes and observables rots the moment that device is
    // renamed. This knob is the opposite case: the set of values it accepts is a table in reach of this file,
    // and the guard above decides validity by reading it. Deriving the choices from THE SAME TABLE means they
    // cannot drift from what the device accepts, and adding an entry to the table extends the probe for free.
    // A literal copy here would be a second list to keep in step, which is the thing worth avoiding.
    // BASES: sc, bcc, fcc (default), diamond -- and the lattice IS the answer key here, since which
    // reflections are forbidden is a property of the lattice and of nothing else.
    knobChoices: { lattice: Object.keys(BASES) },

    plantKind: "knob",
    modes: STRUCTUREFACTOR_MODES,
    name: "systematic-absences-exact-zero-by-law",
    observables: SF_OBSERVABLES,
    build: buildSF,
    // v4074 -- ONE DECLARATION, HONOURED BY BOTH FIELDS. `defaults()` used to return `mode || "absences"`,
    // which ECHOES ANY STRING BACK, so checkMode asked for a nonsense mode, got it back, and concluded the
    // device declared it. A mode selects WHICH PHYSICS RUNS, so a device that accepts a name it does not
    // declare runs something else and says nothing. The list was never unknown -- it is the `modes` array
    // directly above -- and build() never reads `mode` at all, so there was no second mode to protect.
    // Both fields read MODES so a future mode cannot be added to one and missed by the other.
    defaults: ({ mode } = {}) => ({ mode: STRUCTUREFACTOR_MODES.includes(mode) ? mode : STRUCTUREFACTOR_MODES[0], config: { ...DEF } }),
};
