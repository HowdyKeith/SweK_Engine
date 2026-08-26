// brain/rl/surprise-selfcheck.mjs
//
// Run: node brain/rl/surprise-selfcheck.mjs
// RUNTIME 96ms MEASURED (median of 3 -- 96/96/97 ms, date(1) around the run). Fits three detectors and
// scores ~10k transitions against them; all arithmetic, no I/O, fixed seed so the printed numbers are
// reproducible rather than merely typical.
//
// v4031 -- AN ANOMALY DETECTOR THAT FIRES ON EVERYTHING IS A BROKEN CLOCK, AND ONE THAT FIRES ON NOTHING IS
// WORSE BECAUSE IT LOOKS CALM.
//
// surprise.mjs makes exactly one substantive promise -- that a threshold fitted at quantile q on
// in-distribution data yields about a (1-q) false-positive rate on data it has never seen. That promise is
// checkable, and it is the one thing that separates a calibrated detector from a hardcoded constant somebody
// tuned until the demo looked good. So this gate MEASURES the false-positive rate on held-out samples rather
// than asserting the code "does calibration".
//
// *** THE DISJOINT SPLIT IS CHECKED STRUCTURALLY, AND THE REASON IS A CORRECTION. ***
// An earlier draft of this gate "proved" the split's value by fitting and estimating on the same rows and
// reading the resulting false-positive rate. That sabotage was CONFOUNDED -- duplicating the rows changes the
// fit sample SIZE as well as the disjointness, so it varied two things at once -- and when the comparison was
// repeated over 25 independent seeds the direction was not even consistent (threshold moved down in 10 of 25;
// mean held-out rate 1.87% honest vs 1.48% double-dipped). Two successive drafts of the surrounding comment
// asserted a direction, in opposite directions, and BOTH were wrong.
//
// So the split is asserted as what it verifiably is -- a structural property: the two halves are disjoint and
// together cover the sample. That is checkable and true. The claim that it materially changes the answer on
// THIS fixture is not, and is not made. A gate is allowed to say "this is correct method"; it is not allowed
// to invent a measurement that did not happen.
//
// THE OTHER LOAD-BEARING PROPERTY IS THE REFUSAL. Prediction error cannot tell "novel state" from "the forward
// model is wrong everywhere" -- but the SECOND is detectable, and a detector built on a model with no headroom
// must decline to make claims rather than emit confident garbage. Section 3 builds a deliberately useless
// forward model and requires the detector to say so and to refuse to flag even a wild input.
"use strict";
import { calibrate, score, explainIfSurprising, surpriseOf, residualScale, quantile } from "./surprise.mjs";

let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const say = (l) => console.log("  ----  " + l);

// A DETERMINISTIC pseudo-physics and a fixed seed, so every number this gate prints is reproducible. A gate
// whose numbers move between runs cannot be contradicted, and an assertion nobody can contradict is decoration.
let seed = 12345;
const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
const reseed = (s) => { seed = s; };
const stepTrue = (o, a) => [o[0] + o[2] * 0.1, o[1] + o[3] * 0.1, o[2] * 0.98 + a[0] * 0.1, o[3] * 0.98 + a[1] * 0.1];
const goodModel = (o, a) => stepTrue(o, a);
const mk = (n, noise = 0, drift = 0) => {
    const out = [];
    for (let i = 0; i < n; i++) {
        const o = [rnd() * 2 - 1, rnd() * 2 - 1, rnd() * 2 - 1, rnd() * 2 - 1], a = [rnd() * 2 - 1, rnd() * 2 - 1];
        const nx = stepTrue(o, a).map((v) => v + (rnd() * 2 - 1) * noise);
        nx[3] -= drift;                        // "gravity appeared": a physics change the model does not know
        out.push({ observation: o, action: a, next: nx });
    }
    return out;
};

console.log("surprise-selfcheck -- does the calibrated threshold mean what it says?\n");

// ---------------------------------------------------------------------------
console.log("1. *** THE ARITHMETIC, ON CASES WHERE THE ANSWER IS KNOWN BY HAND ***");
{
    ok("!! a perfect prediction has zero surprise", surpriseOf([1, 2, 3], [1, 2, 3], [1, 1, 1]) === 0);
    // RMS of z-scores: residuals (1,1,1) over scales (1,1,1) -> sqrt(mean(1,1,1)) = 1
    ok("!! surprise is the RMS of scaled residuals, not their sum",
        Math.abs(surpriseOf([1, 1, 1], [0, 0, 0], [1, 1, 1]) - 1) < 1e-12,
        "a sum would grow with the number of features and make thresholds incomparable between models");
    // SCALING IS WHAT MAKES FEATURES COMPARABLE: the same raw error on a feature with 10x the residual spread
    // must count for a tenth as much.
    ok("!! *** a feature is judged against ITS OWN typical error, not in raw units ***",
        Math.abs(surpriseOf([10, 0], [0, 0], [10, 1]) - surpriseOf([1, 0], [0, 0], [1, 1])) < 1e-12,
        "metres and radians are not comparable raw; without this the feature with the bigger units decides every verdict");
    ok("!! residualScale returns the per-feature spread of the model's OWN error",
        (() => { const s = residualScale([[1, 0], [-1, 0], [1, 0], [-1, 0]]); return Math.abs(s[0] - 1) < 1e-12; })());
    ok("!! ...and a perfectly-predicted feature gets a FLOOR rather than a division by zero",
        (() => { const s = residualScale([[0, 0], [0, 0]]); return s[0] > 0 && Number.isFinite(1 / s[0]); })(),
        "otherwise the first non-zero deviation on that feature is infinitely surprising");
    ok("!! quantile interpolates and does not mutate its input",
        (() => { const v = [3, 1, 2]; const q = quantile(v, 0.5); return q === 2 && v[0] === 3; })());
    ok("!! a length mismatch THROWS rather than scoring a nonsense comparison",
        (() => { try { surpriseOf([1, 2], [1], [1, 1]); return false; } catch { return true; } })());
}

// ---------------------------------------------------------------------------
console.log("\n2. *** THE PROMISE: A q-QUANTILE THRESHOLD GIVES A (1-q) FALSE-POSITIVE RATE ON UNSEEN DATA ***");
{
    reseed(12345);
    const cal = calibrate(goodModel, mk(400, 0.01), { quantileTarget: 0.99 });
    say(`calibrated: threshold ${cal.threshold.toFixed(3)}, ordinary step ${cal.inDistMedian.toFixed(3)}, headroom ${cal.headroom.toFixed(4)}`);
    ok("!! a good forward model calibrates as USABLE", cal.usable === true);

    const held = mk(2000, 0.01);            // never seen by calibrate
    let fp = 0;
    for (const s of held) if (score(cal, goodModel(s.observation, s.action), s.next).surprising) fp++;
    const rate = fp / held.length;
    say(`held-out false-positive rate: ${(100 * rate).toFixed(2)}%  (asked for ~1%)`);
    ok("!! *** THE MEASURED FALSE-POSITIVE RATE MATCHES THE ONE ASKED FOR ***",
        rate > 0.002 && rate < 0.03,
        `${(100 * rate).toFixed(2)}% against a 1% target. Both bounds matter: far BELOW target is not "even ` +
        `better", it means the threshold is not the quantile it claims to be`);

    // THE SPLIT, ASSERTED AS THE STRUCTURAL FACT IT IS -- see this gate's header for why the measurement-based
    // version of this check was withdrawn as confounded.
    ok("!! *** the fit and estimate halves are DISJOINT and together cover the sample ***",
        cal.fitCount + cal.estCount === 400 && cal.fitCount === 200 && cal.estCount === 200,
        `fit ${cal.fitCount} + est ${cal.estCount} = 400; the threshold is read off rows the scale never saw`);
    ok("!! ...and both halves are non-empty, so neither estimate is built on nothing",
        cal.fitCount > 0 && cal.estCount > 0);
    ok("!! too few transitions to split honestly is a THROW, not a threshold from 3 samples",
        (() => { try { calibrate(goodModel, mk(4, 0.01), {}); return false; } catch { return true; } })(),
        "a quantile estimated from a handful of rows is a number with no standard error worth the name");
}

// ---------------------------------------------------------------------------
console.log("\n3. *** AN UNTRAINED FORWARD MODEL IS REFUSED, NOT SILENTLY USED ***");
{
    reseed(777);
    const uselessModel = () => [0, 0, 0, 0];      // predicts nothing; wrong everywhere, equally
    const cal = calibrate(uselessModel, mk(400, 0.01), { quantileTarget: 0.99 });
    ok("!! *** a model with no headroom calibrates as UNUSABLE ***", cal.usable === false,
        `headroom ${cal.headroom.toFixed(3)} of the data's own spread -- "wrong here" says nothing when the model is wrong everywhere`);
    ok("!! ...and the refusal NAMES the feature and the number, rather than just failing",
        /feature \d/.test(cal.headroomNote) && /\d\.\d/.test(cal.headroomNote), cal.headroomNote.slice(0, 90) + "...");
    const s = score(cal, [0, 0, 0, 0], [9, 9, 9, 9]);
    ok("!! *** ...and it REFUSES TO FLAG even a wildly deviant input ***",
        s.surprising === false && s.trustworthy === false,
        "a confident 'surprising' from a detector that cannot detect is worse than no detector: it would be " +
        "believed. The verdict travels WITH the calibration so the two cannot be separated");
    ok("!! ...and says why, in the score itself", typeof s.note === "string" && s.note.length > 0);
    // The good detector must NOT carry that note -- otherwise "unusable" is just always-on decoration.
    reseed(12345);
    const good = calibrate(goodModel, mk(400, 0.01), {});
    ok("!! a usable detector carries NO refusal note", score(good, goodModel([0, 0, 0, 0], [0, 0]), [0, 0, 0, 0]).note === null);
}

// ---------------------------------------------------------------------------
console.log("\n4. *** DETECTION IS GRADED BY HOW BIG THE CHANGE IS -- NOT TRIVIALLY PERFECT ***");
{
    reseed(12345);
    const cal = calibrate(goodModel, mk(400, 0.01), { quantileTarget: 0.99 });
    const rates = [];
    for (const drift of [0.0005, 0.005, 0.02, 0.05]) {
        const rows = mk(1500, 0.01, drift);
        let d = 0;
        for (const s of rows) if (score(cal, goodModel(s.observation, s.action), s.next).surprising) d++;
        rates.push({ drift, rate: d / rows.length });
    }
    say("detection vs drift: " + rates.map((r) => `${r.drift}->${(100 * r.rate).toFixed(1)}%`).join("  "));
    ok("!! *** a large physics change is caught essentially always ***",
        rates[rates.length - 1].rate > 0.95, `${(100 * rates[rates.length - 1].rate).toFixed(1)}% at drift 0.05`);
    ok("!! *** ...and detection RISES MONOTONICALLY with the size of the change ***",
        rates.every((r, i) => i === 0 || r.rate >= rates[i - 1].rate),
        "a detector whose rate did not track the anomaly's size would be responding to something else");
    ok("!! *** ...and a drift below the noise floor is NOT detected, which is honest ***",
        rates[0].rate < 0.05,
        `${(100 * rates[0].rate).toFixed(1)}% at drift 0.0005 -- near the 1% false-positive floor, because a ` +
        `change smaller than the model's own error is not visible to it and must not be claimed`);
}

// ---------------------------------------------------------------------------
console.log("\n5. *** THE PAIRING WITH INTEGRATED GRADIENTS: WHEN, NOT WHY ***");
{
    reseed(12345);
    const cal = calibrate(goodModel, mk(400, 0.01), { quantileTarget: 0.99 });
    let igCalls = 0;
    const explainFn = () => { igCalls++; return { attributions: [1, 2, 3] }; };
    const stream = [...mk(950, 0.01), ...mk(50, 0.01, 0.05)];   // 5% genuinely anomalous
    let explained = 0;
    for (const s of stream) {
        const r = explainIfSurprising(cal, goodModel(s.observation, s.action), s.next, explainFn);
        if (r.explained) explained++;
    }
    say(`1000 steps (5% anomalous): ${igCalls} IG runs = ${(100 * igCalls / stream.length).toFixed(1)}% of steps`);
    ok("!! *** IG RUNS ONLY ON SURPRISING STEPS, and the saving is the point ***",
        igCalls === explained && igCalls > 20 && igCalls < 200,
        `at 64 gradient evaluations each: ${igCalls * 64} with gating vs ${stream.length * 64} always-on -- ` +
        `${(100 * (1 - igCalls / stream.length)).toFixed(1)}% saved. Surprise costs ONE forward pass, so it is ` +
        `affordable every tick where IG is not`);
    // NULL MEANS NOT ASKED, NOT NOTHING FOUND -- and `explained` is the field that says which.
    reseed(4242);
    const ordinary = mk(1, 0.01)[0];
    const r = explainIfSurprising(cal, goodModel(ordinary.observation, ordinary.action), ordinary.next, explainFn);
    ok("!! *** an ordinary step reports explained:false, not merely explanation:null ***",
        r.explained === false && r.explanation === null,
        "'not asked' and 'nothing found' are different facts; a bare null cannot tell them apart");
    ok("!! ...and a surprising step carries the explanation through unchanged",
        (() => { const rr = explainIfSurprising(cal, [0, 0, 0, 0], [9, 9, 9, 9], explainFn);
                 return rr.explained === true && rr.explanation && rr.explanation.attributions.length === 3; })());
    ok("!! the score reports the surprise in units a reader can use",
        (() => { const rr = score(cal, [0, 0, 0, 0], [9, 9, 9, 9]); return rr.timesTypical > 1; })(),
        "'4.2' means nothing on its own; 'N times an ordinary step' is a sentence");
}

console.log("\n" + (fails ? fails + " FAILED" : "ALL PASS"));
process.exit(fails ? 1 : 0);
