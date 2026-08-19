// WebGLEngine/tools/ship/substance.mjs — v2548
//
// THE ANTI-DUMP INDEX, IMPLEMENTED AND THEN TESTED. IT DOES NOT SURVIVE.
//
// Source: github.com/VolkanSah/Anti-Dump-Index (AGPL-3.0, Python, 120 commits, 1 star, web-verified). The idea is
// good and it is this engine's idea pointed at prompts instead of builds: score an input on Noise vs Effort,
// Context and Details, then route or reject.
//
//     ADI = (wN*Noise - (wE*Effort + wB*Bonus)) / (wC*Context + wD*Details + wP*Penalty)
//     Substance = (Effort + Details) / (Noise + PseudoTerms + 1)          <- README section 9.2
//
// Section 9.2 says the Substance Score "detects fancy but empty inputs". THIS FILE IS HERE BECAUSE IT DOES THE
// EXACT OPPOSITE, AND BECAUSE FINDING THAT OUT IS WORTH MORE THAN ADOPTING IT WOULD HAVE BEEN.
//
// ---- FINDING 1: THE README'S OWN ARITHMETIC DOES NOT CLOSE -------------------------------------------------
//
// Worked example 5.3, checked as written, with the README's own weights:
//     (0 - (2.0*1.0 + 0.5*0.5)) / (1.5*1.0 + 1.5*1.0)  =  -2.25 / 3.00  =  -0.75
// The README says -0.92. Example 5.2, which uses the UNWEIGHTED formula, closes exactly (-0.5833 vs "-0.58").
// So the simple one is right and the weighted one is not.
//
// And 5.1 prints (0.75 - 0.1) / (0 + 0) = INFINITY and calls it "Instant rejection". A ZERO DENOMINATOR IS NOT A
// HIGH SCORE. It is an undefined expression wearing one -- the routing threshold ADI > 1 catches it by accident,
// which is not the same as catching it.
//
// A tool for detecting text that sounds right but does not check out, whose worked example sounds right and does
// not check out.
//
// ---- FINDING 2: IT IS GAMEABLE, AND THAT IS STRUCTURAL, NOT A BUG -------------------------------------------
//
// Measured, using the dictionary from the WebGPU port of this idea:
//
//     an honest sentence containing a real measurement ....  0.00
//     "help plsss fix asap!!!" ..............................  0.00
//     nine keywords in a row, saying nothing ................ 10.00
//
// The empty one wins by a factor of ten, and the honest one ties with pure noise. THE SCORE MEASURES VOCABULARY,
// NOT SUBSTANCE. That is not a tuning problem: a keyword is a thing you can TYPE, and any dictionary you publish
// is a dictionary I can paste. Adding words to the dictionary makes the gap wider, not narrower.
//
// IN FAIRNESS, AND IT MATTERS: this measures the 12-word dictionary from the pasted WebGPU port, not adi.py's
// real regexes. adi.py may score these three inputs better. THE STRUCTURAL POINT IS INDEPENDENT OF THE
// DICTIONARY'S SIZE, and that is the claim being made here -- not "their code is bad".
//
// ---- WHY THE CLAIMS GATE DOES NOT HAVE THIS PROBLEM ---------------------------------------------------------
//
// claimsGate.mjs, four versions back, says it in its own header: "A claim with no kill condition is
// unfalsifiable -- a wish with a version number on it."
//
// ADI asks DOES THIS TEXT LOOK LIKE SUBSTANCE, which is answerable by typing.
// claimsGate asks CAN THIS BE KILLED, which is not, because a kill condition has to survive contact with reality.
//
// You cannot fake a falsifiable prediction. You can only make one and be wrong, which is the point.
//
// This module is therefore NOT WIRED INTO verify.mjs. A gate that can be beaten by pasting nouns would be
// decoration, and this engine has a law about that.
"use strict";

/** The WebGPU port's dictionary, used verbatim so the measurement is about THEIR categories, not mine. */
export const DICT = {
    effort: new Set(["complex", "algorithm", "architecture"]),
    details: new Set(["metrics", "v1.0.4", "benchmarks"]),
    noise: new Set(["actually", "basically", "simply"]),
    pseudo: new Set(["synergy", "disruptive", "groundbreaking"]),
};

export function tokenize(text) {
    return String(text).toLowerCase().replace(/[^a-z0-9.\s]/g, "").split(/\s+/).filter(Boolean);
}

/** README section 9.3: Noise_adj = Noise * (1 - Details/TotalWords). Implemented as written. */
export function adjustedNoise(noise, details, total) {
    return noise * (1 - details / Math.max(total, 1));
}

/** README section 9.2: Substance = (Effort + Details) / (Noise_adj + PseudoTerms + 1) */
export function substanceScore(text, dict = DICT) {
    const w = tokenize(text);
    const count = (set) => w.reduce((n, x) => n + (set.has(x) ? 1 : 0), 0);
    const effort = count(dict.effort), details = count(dict.details);
    const noise = count(dict.noise), pseudo = count(dict.pseudo);
    const nAdj = adjustedNoise(noise, details, w.length);
    return { score: (effort + details) / (nAdj + pseudo + 1), effort, details, noise, pseudo, nAdj, total: w.length };
}

/** The full weighted ADI, exactly as the README states it. */
export const ADI_WEIGHTS = { noise: 1.0, effort: 2.0, context: 1.5, details: 1.5, bonus: 0.5, penalty: 1.0 };

export function adi({ noise = 0, effort = 0, context = 0, details = 0, bonus = 0, penalty = 0 }, w = ADI_WEIGHTS) {
    const num = w.noise * noise - (w.effort * effort + w.bonus * bonus);
    const den = w.context * context + w.details * details + w.penalty * penalty;
    // The README's example 5.1 divides by zero and prints INFINITY as a score. Say so instead of pretending.
    return { value: den === 0 ? Infinity : num / den, num, den, degenerate: den === 0 };
}

/** Dump > 1, Gray 0..1, Genius < 0 -- the README's zones. */
export function zone(v) { return v > 1 ? "dump" : v < 0 ? "genius" : "gray"; }
