// WebGLEngine/render/genGateVerdicts.mjs -- v4704: what the learned-gate arc FOUND, in a form the page reads.
//
// *** SIX HYPOTHESES WERE MEASURED AND THE PAGE SAID NOTHING ABOUT ANY OF THEM. *** fsr.html offered three learned
// gate arms labelled only by the weights they load, and its readout reported "GATE ... kept N of M blocks" as if
// that were a feature. Every verdict lived in a closing in tools/ship/gateSweep.mjs, which is exactly where v4688
// found six gates' findings reaching nobody for up to eleven rounds. So the verdicts are here, the page labels its
// arms and writes its readout from this table, and tools/ship/genGateVerdicts-selfcheck.mjs grades every entry
// against the record it came from: each closing must carry each number, and H4-H6 are re-derived from the
// committed result files, so this table cannot say more than the measurements did.
//
// Browser-safe: no node imports. The page imports it directly.
"use strict";

/** The six, in the order they were measured. `numbers` must each appear in the named closing's verdict. */
export const VERDICTS = Object.freeze([
    Object.freeze({ id: "H1", round: "v4691", closing: "since375", doc: "render/learned-preregistration.md", verdict: "refuted",
        claim: "a learned per-block gate beats ungated generation on a scene it never trained on",
        evidence: "+0.0530 dB, paired t p 0.144, sign p 0.636", numbers: Object.freeze(["0.0530", "0.144", "0.636"]),
        weights: "render/genGate-weights.json" }),
    Object.freeze({ id: "H2", round: "v4693", closing: "since376", doc: "render/learned-calibration-preregistration.md", verdict: "refuted",
        claim: "the gate's conservatism is its threshold, fixable by choosing one on validation",
        evidence: "validation AUC 0.4214, worse than a coin", numbers: Object.freeze(["0.4214"]),
        weights: "render/genGate-weights-v2.json" }),
    Object.freeze({ id: "H3", round: "v4696", closing: "since378", doc: "render/learned-transfer-preregistration.md", verdict: "not reported",
        claim: "a scale-free feature set transfers across content, by pooled AUC",
        evidence: "control C8 fired: shuffled labels scored 0.2451, so the pooled statistic was invalid", numbers: Object.freeze(["0.2451"]) }),
    Object.freeze({ id: "H4", round: "v4699", closing: "since381", doc: "render/learned-folds-preregistration.md", verdict: "not supported",
        claim: "over seven folds, the scale-free set transfers and beats the absolute set",
        evidence: "6 of 7 folds, sign p 8/128, and the absolute set beat it on 5 of 7", numbers: Object.freeze(["8/128"]) }),
    Object.freeze({ id: "H5", round: "v4701", closing: "since383", doc: "render/learned-absolute-preregistration.md", verdict: "not supported",
        claim: "the absolute set beats its own shuffled twin on fresh data (slab speed x4)",
        evidence: "4 of 7 folds, mean -0.0386", numbers: Object.freeze(["-0.0386"]) }),
    Object.freeze({ id: "H6", round: "v4703", closing: "since385", doc: "render/gate-rule-preregistration.md", verdict: "not supported",
        claim: "a rule with nothing fitted -- motion's gain over standing still -- ranks the decision",
        evidence: "below chance on 5 of 7 scenes at both speeds, mean AUC-0.5 -0.0797 at x2", numbers: Object.freeze(["-0.0797"]) }),
]);

/** Which page arm stands on which hypothesis. `oracle` and `never` are CONTROLS, not hypotheses, and are absent. */
export const ARM_HYPOTHESIS = Object.freeze({ cpu: "H1", device: "H1", cpu2: "H2" });

/** Where the arc stands, and the closing that says so. */
export const ARC = Object.freeze({ closedAt: "v4703", closing: "since385",
    finding: "no per-block gate over the chain's own matching errors has been shown to transfer to unseen content, fitted or not" });

export function verdictFor(mode) {
    const id = ARM_HYPOTHESIS[mode];
    return id ? VERDICTS.find((v) => v.id === id) || null : null;
}

/** The weights file an arm loads -- the page reads it from here, so the arm and its verdict cannot come apart. */
export function armWeights(mode) {
    const v = verdictFor(mode);
    if (!v || !v.weights) throw new Error(`genGateVerdicts.armWeights: "${mode}" is not an arm that loads weights`);
    return v.weights;
}

/** The suffix each arm's option label carries. */
export function optionSuffix(mode) {
    const v = verdictFor(mode);
    return v ? ` -- ${v.id} ${v.verdict.toUpperCase()} at ${v.round}` : "";
}

/** The sentence the readout carries whenever a learned arm is running. Empty for off and for the two controls. */
export function readoutNote(mode) {
    const v = verdictFor(mode);
    if (!v) return "";
    return ` THIS ARM IS A RECORD, NOT A FEATURE: ${v.id} -- ${v.claim} -- was ${v.verdict.toUpperCase()} at ${v.round} ` +
           `(${v.evidence}; ${v.doc}). As of ${ARC.closedAt}, ${ARC.finding}.`;
}
