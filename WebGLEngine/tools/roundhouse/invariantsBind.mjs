// WebGLEngine/tools/roundhouse/invariantsBind.mjs -- v3425
// ---------------------------------------------------------------------------------------------------------------
// RELATIVISTIC INVARIANTS AS A LAB DEVICE. Its own registry row because nothing in the tree shares the
// substrate: clocks is Schwarzschild proper time, kerr is a metric, and neither has a four-momentum in it.
//
// *** THE HEADLINE KEY IS AN IDENTITY RATHER THAN A TOLERANCE: s DOES NOT CHANGE UNDER A BOOST. *** Boost every
// four-momentum in a system by an arbitrary beta and the invariant mass squared is the same number -- to the
// last bit, in every frame. That is a parameter-that-must-not-matter key (md's alphaFree shape) in its purest
// form, because the parameter here is THE OBSERVER.
//
// AND THE ROUND'S REAL FINDING IS NUMERICAL RATHER THAN PHYSICAL: THERE ARE THREE ALGEBRAICALLY IDENTICAL WAYS
// TO COMPUTE s AND ONLY ONE OF THEM SURVIVES A COSMIC RAY. At 1e11 GeV against a 1e-12 GeV photon --- the actual
// GZK problem --- squaring the summed four-vector returns EXACTLY 0.0, and it does it silently. See the
// "precision" mode; the module header carries the mechanism.
// ---------------------------------------------------------------------------------------------------------------
"use strict";
import {
    gammaOf, fromMassBeta, massless, add, massSq, invariantS, invariantSPair,
    boostX, addBeta, thresholdHeadOn, sHeadOnPhoton, naiveEcm,
} from "../../physics/particle/invariants.mjs";

export const INV_MODES = ["invariance", "composition", "naive", "precision", "gzk"];

// Masses in GeV and a CMB photon energy in GeV. THESE ARE INPUTS, NOT ANSWER KEYS: no check below compares a
// result against a remembered threshold. Every key compares two INDEPENDENT ROUTES to each other, so the
// numbers here set up the question and never stand in for its answer.
const DEF = {
    mIn: 0.938272, mPion: 0.134977, ePhoton: 6.35e-13,
    beta: 0.9, betas: [0.1, 0.5, 0.9, 0.99, 0.999], b1: 0.6, b2: 0.7,
};

export const INV_OBSERVABLES = [
    "sRest", "sDriftWorst", "sDriftWorstWrong", "shellDriftWorst", "shellDriftWorstWrong", "framesChecked",
    "composed", "composeGapWorst", "composeStaysSubluminal",
    "naiveOverRootS", "gammaAt", "naiveRatioGapWorst", "naiveExactAtRest",
    "ratios", "sSumSquare", "sExpanded", "sMassCarry", "sumSquareCollapsed", "routesAgreeAtParity",
    "thresholdClosed", "thresholdBisected", "thresholdRelErr", "thresholdEeV", "sAtThreshold", "targetSq",
    "planted",
];

export function defaults({ mode = "invariance", config = {} } = {}) {
    if (!INV_MODES.includes(mode)) return null;   // a refusal, not a silent substitution
    return { mode, config: { ...DEF, ...config } };
}

export function build({ mode = "invariance", config = {} } = {}) {
    if (!INV_MODES.includes(mode)) throw new Error("invariants: undeclared mode " + mode);
    const c = { ...DEF, ...config };
    const wrong = !!c.planted;
    const B = (p, b) => boostX(p, b, { wrong });
    const blank = { planted: wrong };

    if (mode === "invariance") {
        // A system with something happening in it: a moving proton and a photon coming the other way.
        const sys = [fromMassBeta(c.mIn, c.beta, [1, 0, 0]), massless(0.5, [-1, 0, 0])];
        const s0 = invariantS(sys);
        let worst = 0, shellWorst = 0;
        for (const b of c.betas) {
            const moved = sys.map((p) => B(p, b));
            worst = Math.max(worst, Math.abs(invariantS(moved) - s0) / Math.abs(s0));
            // THE MASS SHELL IS THE SECOND HALF: a boost may not change what a particle IS.
            const m2 = massSq(B(sys[0], b)), m2Exact = c.mIn * c.mIn;
            shellWorst = Math.max(shellWorst, Math.abs(m2 - m2Exact) / m2Exact);
        }
        return {
            ...blank, sRest: s0, framesChecked: c.betas.length,
            [wrong ? "sDriftWorstWrong" : "sDriftWorst"]: worst,
            [wrong ? "shellDriftWorstWrong" : "shellDriftWorst"]: shellWorst,
        };
    }

    if (mode === "composition") {
        // BOOSTING TWICE IS BOOSTING ONCE BY THE RELATIVISTIC SUM. Two routes to one state, and the second knows
        // nothing about the first: one applies two transforms, the other applies one to a combined beta.
        const p = fromMassBeta(c.mIn, 0.4, [1, 0, 0]);
        const pairs = [[0.3, 0.4], [c.b1, c.b2], [0.9, 0.95]];
        let worst = 0, subluminal = true;
        for (const [a, b] of pairs) {
            const two = B(B(p, a), b), one = B(p, addBeta(a, b));
            worst = Math.max(worst, Math.abs(two.E - one.E) / Math.abs(one.E),
                                    Math.abs(two.px - one.px) / Math.abs(one.px));
            if (!(Math.abs(addBeta(a, b)) < 1)) subluminal = false;
        }
        return { ...blank, composed: addBeta(c.b1, c.b2), composeGapWorst: worst, composeStaysSubluminal: subluminal };
    }

    if (mode === "naive") {
        // *** THE NAIVE CENTRE-OF-MASS ENERGY IS WRONG BY EXACTLY THE BOOST'S gamma, WHICH IS A PREDICTED FACTOR
        // AND NOT A VAGUE ERROR. *** Adding lab energies is right in the CM frame and nowhere else: a system at
        // rest has total momentum zero, so boosting multiplies its total energy by gamma while leaving s alone.
        // It agrees EXACTLY at rest, which is why it survives casual testing.
        const at = [fromMassBeta(c.mIn, 0), fromMassBeta(c.mPion, 0)];
        const restRatio = naiveEcm(at) / Math.sqrt(invariantS(at));
        let gapWorst = 0, ratioAt = 0, gammaAt = 0;
        for (const b of c.betas.filter((x) => x < 0.9999)) {
            const moved = at.map((p) => B(p, b));
            const ratio = naiveEcm(moved) / Math.sqrt(invariantS(moved)), g = gammaOf(b);
            gapWorst = Math.max(gapWorst, Math.abs(ratio - g) / g);
            if (b === c.beta) { ratioAt = ratio; gammaAt = g; }
        }
        return { ...blank, naiveOverRootS: ratioAt, gammaAt, naiveRatioGapWorst: gapWorst, naiveExactAtRest: restRatio };
    }

    if (mode === "precision") {
        // *** THREE ALGEBRAICALLY IDENTICAL ROUTES, AND ONLY ONE SURVIVES A COSMIC RAY. *** They agree to machine
        // precision when the energies are comparable, which is exactly why nobody notices.
        const rows = [1e2, 1e6, 1e9, 1e11].map((E) => {
            const pr = { E, px: Math.sqrt(Math.max(0, E * E - c.mIn * c.mIn)), py: 0, pz: 0 };
            const ph = massless(c.ePhoton, [-1, 0, 0]);
            return {
                ratio: E / c.ePhoton,
                sumSquare: invariantS([pr, ph]), expanded: invariantSPair(pr, ph),
                massCarry: sHeadOnPhoton(c.mIn, E, c.ePhoton),
            };
        });
        const top = rows[rows.length - 1], bottom = rows[0];
        return {
            ...blank,
            ratios: rows.map((r) => r.ratio),
            sSumSquare: top.sumSquare, sExpanded: top.expanded, sMassCarry: top.massCarry,
            // AT THE COSMIC-RAY ENERGY THE NAIVE ROUTE RETURNS EXACTLY ZERO. Not nearly zero.
            sumSquareCollapsed: top.sumSquare === 0,
            // AND AT COMPARABLE ENERGIES ALL THREE AGREE, which is what makes the failure invisible.
            routesAgreeAtParity: Math.abs(bottom.sumSquare - bottom.massCarry) / bottom.massCarry < 1e-12,
        };
    }

    // gzk -- THE THRESHOLD BY TWO INDEPENDENT ROUTES. Bisection asks "has the channel opened", which is a
    // BIFURCATION and reads only the sign of a comparison; the closed form inverts the algebra. Neither is told
    // the other's answer, and no remembered value appears anywhere.
    const mOut = c.mIn + c.mPion, targetSq = mOut * mOut;
    const closed = thresholdHeadOn(c.mIn, mOut, c.ePhoton);
    let lo = 1e5, hi = 1e14;
    for (let i = 0; i < 200; i++) {
        const mid = (lo + hi) / 2;
        if (sHeadOnPhoton(c.mIn, mid, c.ePhoton) < targetSq) lo = mid; else hi = mid;
    }
    const bisected = (lo + hi) / 2;
    return {
        ...blank,
        thresholdClosed: closed, thresholdBisected: bisected,
        thresholdRelErr: Math.abs(bisected - closed) / closed,
        // REPORTED IN EeV BECAUSE THAT IS THE UNIT THE LITERATURE USES, AND ASSERTED AGAINST NOTHING: this
        // device compares its two routes to each other. Citing a remembered cutoff would be exactly the
        // fabricated provenance this tree refuses.
        thresholdEeV: closed / 1e9,
        sAtThreshold: sHeadOnPhoton(c.mIn, closed, c.ePhoton), targetSq,
    };
}

export const invariantsDevice = {
    // KNOB PLANT: `planted` replaces the BOOST -- E' = gamma E instead of gamma(E - beta p), which is what you
    // write if you think of a boost as "scale everything by gamma". It is EXACTLY RIGHT at beta = 0 and it
    // breaks the invariance and the mass shell together. The whole path from the wrong transform to every
    // reported number is graded.
    plantKind: "knob",
    // v4121 -- NAMED, THE SAME COMPLETION v3851/v4088-v4120 gave the rest of this family. MEASURED before
    // declaring: `naive` mode looked like a second route to the same plant (it calls the same boost) but is
    // BLIND -- both the naive Ecm and root-s pass through the identical wrong boost, so the ratio between them
    // is untouched (a mirror, v3201's trap). The real target is `invariance` mode (the default), which uses a
    // COMPUTED KEY NAME rather than a value swap: honest returns sDriftWorst (7.1e-15) and planted returns
    // sDriftWorstWrong (559.2) instead -- sDriftWorst is simply ABSENT (undefined, not present) under the
    // plant. probeLiveness still catches this correctly (a number turning into undefined counts as moved),
    // which is why sDriftWorst is the declared observable despite never taking a large value itself.
    planted: { knob: "planted", observable: "sDriftWorst",
               note: "the boost is E' = gamma*E instead of gamma*(E - beta*p) -- exactly right at beta=0, which is why it survives casual testing, and wrong everywhere else. Under the plant this device renames its own drift observable to sDriftWorstWrong rather than reporting a corrupted number under the honest name, so the plant's signature is the KEY going missing, not a value changing" },
    modes: INV_MODES, name: "relativistic-invariants",
    observables: INV_OBSERVABLES, build, defaults,
};
export default invariantsDevice;
