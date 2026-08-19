// WebGLEngine/tools/roundhouse/zetaBind.mjs -- v3198
//
// THE PI-ZETA BRIDGE AS A GRADED DEVICE, AND ITS CONTROL IS A NUMBER WITH NO CLOSED FORM.
//
// v3195's census named this one. zeta(2) = pi^2/6 is Euler's, and a routine that merely RECITED pi formulas
// would satisfy every even-argument check ever written.
//
// *** SO THE CONTROL IS zeta(3). *** Apery's constant has NO closed form -- no pi, no rational multiple of
// anything -- so a routine cannot recite it. Landing on 1.2020569031595942 to 1.1e-15 IS THE PROOF THAT THE
// SERIES IS BEING SUMMED. Without that mode, every other number here could come from a lookup table.
//
//   "even"        Euler's: zeta(2) = pi^2/6, and pi BACK OUT as sqrt(6 zeta(2)) -- the circle constant from a
//                 sum with no circle in it.
//   "apery"       *** THE CONTROL. *** zeta(3) against Apery, which cannot be recited.
//   "higher"      zeta(4), zeta(6), zeta(8) against pi^2n times 1/90, 1/945, 1/9450.
//   "corrections" *** THE LOAD-BEARING NEGATIVE. *** Drop the Euler-Maclaurin correction terms and the error
//                 collapses from 2.4e-15 to 9.6e-5 -- FORTY BILLION TIMES WORSE. If K made no difference, the
//                 accuracy would be coming from somewhere other than the summation, and every check above
//                 would be measuring a constant table.
//
// EVERY KEY IS EITHER A CLOSED FORM OR A PUBLISHED CONSTANT. Nothing is remembered from a previous run.

import { zeta, piFromZeta, evenZetaCoefficient } from "../../physics/zeta.js";

// Apery's constant, to more digits than a double can hold, so the comparison is limited by OUR arithmetic and
// not by the reference. OEIS A002117.
const APERY = 1.2020569031595942854;

export const ZETA_OBSERVABLES = [
    "s", "M", "K", "value", "closedForm", "errAbs", "errFrac",
    "piRecovered", "piErrAbs", "hasClosedForm",
    "errNoCorrection", "errWithCorrection", "correctionGain", "worstHigherErr",
];

const DEF = { M: 12, K: 5 };
export const ZETA_MODES = ["even", "apery", "higher", "corrections"];

export function zetaDefaults(cfg = {}) {
    const want = cfg && cfg.mode;
    return { mode: ZETA_MODES.includes(want) ? want : "even", M: (cfg && cfg.M) || DEF.M, K: (cfg && cfg.K) || DEF.K };
}

export async function buildZeta(args = {}) {
    const cfg = args.config || {};
    const M = (cfg && cfg.M) || DEF.M, K = (cfg && cfg.K) || DEF.K;
    const mode = args.mode || zetaDefaults(cfg).mode;
    const base = { M, K };

    if (mode === "apery") {
        // *** THE CONTROL. zeta(3) HAS NO CLOSED FORM, so this number cannot be recited from a pi identity.
        // hasClosedForm is reported as 0 ON PURPOSE: it is the property that makes the mode worth having, and
        // a reader who sees only the error would not know why this argument was chosen. ***
        const v = zeta(3, { M, K });
        return { ...base, s: 3, value: v, closedForm: APERY,
                 errAbs: Math.abs(v - APERY), errFrac: Math.abs(v - APERY) / APERY,
                 piRecovered: -1, piErrAbs: -1, hasClosedForm: 0,
                 errNoCorrection: -1, errWithCorrection: -1, correctionGain: -1, worstHigherErr: -1 };
    }

    if (mode === "higher") {
        // WORST OF THE THREE, not the mean. One even value drifting while two hold is a broken coefficient, and
        // an average would let the two carry it.
        let worst = 0;
        for (const twoN of [4, 6, 8]) {
            const closed = Math.PI ** twoN * evenZetaCoefficient(twoN);
            worst = Math.max(worst, Math.abs(zeta(twoN, { M, K }) - closed));
        }
        const v4 = zeta(4, { M, K }), c4 = Math.PI ** 4 * evenZetaCoefficient(4);
        return { ...base, s: 4, value: v4, closedForm: c4, errAbs: Math.abs(v4 - c4),
                 errFrac: Math.abs(v4 - c4) / c4, piRecovered: -1, piErrAbs: -1, hasClosedForm: 1,
                 errNoCorrection: -1, errWithCorrection: -1, correctionGain: -1, worstHigherErr: worst };
    }

    if (mode === "corrections") {
        // *** THE LOAD-BEARING NEGATIVE. *** K = 0 is the bare tail with no Euler-Maclaurin correction. If the
        // gain were small, the accuracy would not be coming from the summation at all.
        const target = Math.PI ** 2 / 6;
        const bad = Math.abs(zeta(2, { M, K: 0 }) - target);
        const good = Math.abs(zeta(2, { M, K }) - target);
        return { ...base, s: 2, value: zeta(2, { M, K }), closedForm: target, errAbs: good, errFrac: good / target,
                 piRecovered: -1, piErrAbs: -1, hasClosedForm: 1,
                 errNoCorrection: bad, errWithCorrection: good,
                 // GUARDED: a machine-precision `good` could be exactly zero, and a ratio would be Infinity --
                 // a number no threshold can compare and no reader can interpret.
                 correctionGain: bad / Math.max(good, Number.EPSILON),
                 worstHigherErr: -1 };
    }

    const target = Math.PI ** 2 / 6;
    const v = zeta(2, { M, K });
    const pi = piFromZeta();
    return { ...base, s: 2, value: v, closedForm: target, errAbs: Math.abs(v - target),
             errFrac: Math.abs(v - target) / target,
             piRecovered: pi, piErrAbs: Math.abs(pi - Math.PI), hasClosedForm: 1,
             errNoCorrection: -1, errWithCorrection: -1, correctionGain: -1, worstHigherErr: -1 };
}

export const zetaDevice = {
    name: "pi-zeta-bridge",
    modes: ZETA_MODES,
    observables: ZETA_OBSERVABLES,
    build: buildZeta,
    defaults: zetaDefaults,
};
