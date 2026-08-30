// tools/roundhouse/sackurTetrodeBind.mjs
//
// SACKUR-TETRODE JOINS THE ROUNDHOUSE -- the classical ideal gas that BOTH bec.mjs AND fermi.mjs become when hot
// and thin, and therefore the rung that gives the next two an independent key instead of a typed constant. The
// same service blackbody just did for debye.
//
// *** THE PLANT IS THE GIBBS PARADOX, AND IT IS INVISIBLE TO ANY SINGLE BOX. *** Without Stirling's 1/N! the
// entropy is ln V instead of ln(V/N) and STOPS BEING EXTENSIVE: double the box and the atoms together and you
// gain a spurious N k ln 2, the entropy of "mixing" a gas with itself. Measured here at exactly 2N ln 2 =
// 138.629436 for N = 100.
//
// The blindness is the physics, not a gap. Entropy PER PARTICLE at a single density is identical under both
// treatments -- the 5/2 constant, the zero-crossing at e^{5/2}, the exchange EOS all read the same, because the
// paradox is a statement about how entropy SCALES, not about any one measurement. A device that looked at one
// box could not see it at all, and section 4 asserts that those observables stay bit-identical so that nobody
// later "improves" the plant into something a single-box check could catch.
//
// *** AND THE CROSS-MODULE OBSERVABLE IS THE ONE THE MODULE'S OWN HEADER ARGUES FOR: THE ALARM IS LATE. ***
// Sackur-Tetrode announces its own death by going NEGATIVE at n*lambda^3 = e^{5/2} = 12.1825 -- a negative
// absolute entropy is impossible, so the classical gas is saying it has left its domain. But bec's condensation
// threshold is n*lambda^3 = zeta(3/2) = 2.612, reached through bec.criticalDensity(), and it arrives FIRST. At
// that point Sackur-Tetrode still reads a comfortable positive number. THE FIRE STARTED 4.66x EARLIER THAN THE
// ALARM, and the factor is computed from a sibling module's constant rather than written down here.

import {
    sackurTetrode, NEG_ENTROPY_THRESHOLD, EXCHANGE_DENOM, quantumEOS,
    entropyExtensive, entropyDistinguishable,
} from "../../physics/thermal/sackurTetrode.mjs";
import { criticalDensity } from "../../physics/thermal/bec.mjs";

export const SACKUR_OBSERVABLES = [
    "sackurAtUnity", "zeroCrossingS", "eosBoson", "eosFermion", "eosSymmetryRel",
    "becThresholdPhi", "sackurAtBecThreshold", "lateAlarmFactor",
    "entropyOneBox", "entropyDoubled", "extensivityRel", "spuriousMixing", "spuriousOverNln2",
];

const DEF = { V: 1000, N: 100, lambda: 1, phiEOS: 0.5 };

const rel = (a, b) => Math.abs(a - b) / Math.max(1e-300, Math.abs(b));

function buildSackur({ mode = "classical", config = {} } = {}) {
    const c = { ...DEF, ...config };
    // THE PLANT: drop Stirling's 1/N!. Distinguishable atoms, ln V instead of ln(V/N) -- Gibbs's own paradox.
    const S = config.planted ? entropyDistinguishable : entropyExtensive;

    const phiC = criticalDensity();                    // zeta(3/2), computed by bec, not typed here
    const one = S(c.V, c.N, c.lambda);
    const two = S(2 * c.V, 2 * c.N, c.lambda);
    const spurious = two - 2 * one;

    return {
        // Per-particle, single density: blind to the plant BY CONSTRUCTION, and that is the Gibbs point.
        sackurAtUnity: sackurTetrode(1),                          // exactly 5/2
        zeroCrossingS: sackurTetrode(NEG_ENTROPY_THRESHOLD),      // exactly 0 at e^{5/2}
        eosBoson: quantumEOS(c.phiEOS, -1),                       // < 1: clustering, statistical attraction
        eosFermion: quantumEOS(c.phiEOS, +1),                     // > 1: Pauli exclusion, statistical repulsion
        // The two corrections are equal and opposite: the sign is the only thing remembering which gas it was.
        eosSymmetryRel: rel((quantumEOS(c.phiEOS, -1) + quantumEOS(c.phiEOS, +1)) / 2, 1),

        becThresholdPhi: phiC,
        sackurAtBecThreshold: sackurTetrode(phiC),
        lateAlarmFactor: NEG_ENTROPY_THRESHOLD / phiC,

        // Extensivity: the ONLY place the plant can show, because it needs two sizes to compare.
        entropyOneBox: one, entropyDoubled: two,
        extensivityRel: rel(two, 2 * one),
        spuriousMixing: spurious,
        // HOW MANY UNITS OF THE TEXTBOOK GIBBS TERM ARE PRESENT: 0 honestly, EXACTLY 1 under the plant. Stated
        // this way round on purpose -- the first draft reported rel(spurious, 2N ln2), which reads 1.0 when
        // there is no spurious term at all and 6e-16 when there is. An observable whose meaning INVERTS between
        // nominal and planted is a trap for whoever reads the census next, and the census is the audience.
        spuriousOverNln2: spurious / (2 * c.N * Math.LN2),
    };
}

const SACKURTETRODE_MODES = ["classical"];   // v4074 -- the single source `modes` and `defaults()` both read

export const sackurTetrodeDevice = {
    plantKind: "method",
    // v4130 -- NAMED, THE SAME COMPLETION v3851/v4088-v4129 gave the rest of this family. MEASURED, classical
    // mode (only mode) both arms: spuriousOverNln2 0 -> 1.0000000000, exactly one unit of the textbook Gibbs
    // term appearing where none should be. extensivityRel also moves (0 -> 0.0824) but is the weaker of the two
    // -- spuriousOverNln2 is declared because the header explicitly designed it to invert cleanly rather than
    // read as a small number in both arms (the earlier draft it replaced, rel(spurious, 2N ln2), read 1.0 with
    // NO defect present and 6e-16 with one -- an inverted trap this device's own comment calls out by name).
    // Every per-particle single-density observable (sackurAtUnity, the EOS pair, the BEC-threshold comparison)
    // is blind BY CONSTRUCTION: the Gibbs paradox is about how entropy SCALES, not about any one measurement.
    planted: { knob: "planted", observable: "spuriousOverNln2",
               note: "drops Stirling's 1/N! from the entropy, so it reads ln V instead of ln(V/N) and stops being extensive -- doubling the box and the atoms together gains a spurious N k ln 2 of 'mixing entropy' with nothing having mixed. Invisible to any single-box measurement (the 5/2 constant, the zero-crossing, the exchange EOS all read identically under the plant); only comparing two box sizes reveals it" },
    modes: SACKURTETRODE_MODES,
    name: "sackur-tetrode-and-the-gibbs-paradox",
    observables: SACKUR_OBSERVABLES,
    build: buildSackur,
    // v4074 -- ONE DECLARATION, HONOURED BY BOTH FIELDS. `defaults()` used to return `mode || "classical"`,
    // which ECHOES ANY STRING BACK, so checkMode asked for a nonsense mode, got it back, and concluded the
    // device declared it. A mode selects WHICH PHYSICS RUNS, so a device that accepts a name it does not
    // declare runs something else and says nothing. The list was never unknown -- it is the `modes` array
    // directly above -- and build() never reads `mode` at all, so there was no second mode to protect.
    // Both fields read MODES so a future mode cannot be added to one and missed by the other.
    defaults: ({ mode } = {}) => ({ mode: SACKURTETRODE_MODES.includes(mode) ? mode : SACKURTETRODE_MODES[0], config: { ...DEF } }),
};
