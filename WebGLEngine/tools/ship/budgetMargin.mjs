// tools/ship/budgetMargin.mjs -- v4481
//
// *** v4479 ASKED WHETHER TWO GATES SITTING 2-4% OVER THE 3000 ms BUDGET HAD DRIFTED OR WHETHER THE BOX WAS
// SLOWER, AND SAID IT HAD NOT ESTABLISHED WHICH. IT IS NEITHER. *** It is the measurement.
//
// ---- *** THE TWO HYPOTHESES, BOTH KILLED BY MEASUREMENT *** --------------------------------------------------
//
// NOT DRIFT. tools/ship/meshBVH-selfcheck.mjs has exactly ONE commit -- created at v4248 and never edited
// since -- and its work is fixed-size CPU: literal loop counts of 60,000 and 4,000, no dependence on how big
// the tree has grown. A file that has not changed, doing work that does not scale, cannot have drifted.
//
// NOT THE BOX. Twelve gates from the rotation ledger, re-timed here against the readings that ledger took:
// median now/ledger = 1.007. The container is the same speed it was when those numbers were written.
//
// *** IT IS THAT A HARD THRESHOLD IS BEING APPLIED TO A MEASUREMENT WHOSE OWN SPREAD IS WIDER THAN THE MARGIN.
// *** meshBVH-selfcheck, run SEVEN times on an idle box: 2829, 2880, 2939, 2965, 2998, 3026, 3062 ms. The
// 3000 ms cap falls INSIDE its own range: TWO runs over, five under. So whether this gate is "over budget"
// depends on which of its own runs you happen to take -- and whichever you take is written to a tracked file
// and acted on by the rotation machinery.
//
// (The first draft of this header said three over and four under, and called it a coin flip. It is two and
// five. The straddle is what the round rests on and it is unaffected, but 29% is not 50%, and the gate's own
// record check is what caught the miscount -- which is the only reason this paragraph is right.)
//
// ---- *** AND THE NEAR-CAP POPULATION IS LARGELY MANUFACTURED BY THE PARALLEL SWEEP *** -------------------------
//
// Twenty gates are recorded within 10% of the cap. Run ALONE, three times each, taking the best:
//
//     recorded / actual, median                1.5x
//     recorded at 1.5x their real cost or more   10 of 20
//     worst                                     2.3x  (artifactWeight 2933 recorded, 1277 actual)
//     recorded OVER the cap                        3, of which 1 is actually under when run alone
//     recorded UNDER the cap                      17, of which 0 are actually over
//
// *** THE ERROR IS ONE-DIRECTIONAL. *** Contention pushes a reading UP and never down, so the near-cap band
// fills from below with gates that do not belong in it. Nothing recorded under the cap turned out to be over;
// one recorded over turned out to be under. A budget check reading that file is therefore not measuring cost,
// it is measuring cost plus whatever else the box was doing, and it is doing it against a line.
//
// ---- *** WHAT THIS DOES NOT CLAIM *** ---------------------------------------------------------------------
//
// That the 3000 ms cap is wrong. A cap is a policy and this file has no opinion on where it should sit -- what
// it measures is that the READING the cap is applied to has a spread of its own, and names how many gates sit
// inside that spread. Moving the cap would move the band, not remove it.
//
// That "run alone, best of three" is the true cost either. It is a floor: the cheapest the gate was observed
// to be, on a box doing nothing else, which is the most favourable number available and still leaves ten of
// twenty gates recorded at half again that. The comparison is deliberately generous to the recorded figure.
//
// That any of this is a defect in the sweep. Running 1,100 gates in parallel is why a ship takes five minutes
// instead of an hour, and the contention is the price. What is worth naming is that the price is paid in a
// number the tree then treats as a measurement.

export const DEFAULT_CAP_MS = 3000;

/** min / median / max of a set of readings, and whether a threshold falls inside their range. */
export function spread(readings, cap = DEFAULT_CAP_MS) {
    const v = [...readings].filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
    if (!v.length) return null;
    const min = v[0], max = v[v.length - 1], median = v[Math.floor(v.length / 2)];
    return {
        n: v.length, min, max, median,
        spreadPct: min > 0 ? (100 * (max - min)) / min : 0,
        // *** THE WHOLE POINT: a gate whose range CONTAINS the cap has no stable verdict. ***
        straddles: min <= cap && max >= cap,
        over: v.filter((x) => x > cap).length,
        under: v.filter((x) => x <= cap).length,
    };
}

/** Gates whose RECORDED time sits within `frac` of the cap -- the band a single re-reading can move across. */
export function nearCap(timings, { cap = DEFAULT_CAP_MS, frac = 0.1, codes = {} } = {}) {
    return Object.entries(timings)
        .filter(([k, v]) => (codes[k] === undefined || codes[k] === 0) && v >= cap * (1 - frac) && v <= cap * (1 + frac))
        .map(([gate, recorded]) => ({ gate, recorded }))
        .sort((a, b) => b.recorded - a.recorded);
}

/**
 * Recorded against actual, for gates that have both. `actual` is a floor -- best of several runs on an idle
 * box -- so a ratio above 1 is the most conservative statement available about how inflated a reading is.
 */
export function inflation(rows, { cap = DEFAULT_CAP_MS } = {}) {
    const withBoth = rows.filter((r) => Number.isFinite(r.recorded) && Number.isFinite(r.actual) && r.actual > 0);
    const ratios = withBoth.map((r) => r.recorded / r.actual).sort((a, b) => a - b);
    const recordedOver = withBoth.filter((r) => r.recorded > cap);
    const recordedUnder = withBoth.filter((r) => r.recorded <= cap);
    return {
        n: withBoth.length,
        medianRatio: ratios.length ? ratios[Math.floor(ratios.length / 2)] : null,
        maxRatio: ratios.length ? ratios[ratios.length - 1] : null,
        inflatedHalfAgain: withBoth.filter((r) => r.recorded / r.actual >= 1.5).length,
        recordedOver: recordedOver.length,
        overButActuallyUnder: recordedOver.filter((r) => r.actual <= cap).length,
        recordedUnder: recordedUnder.length,
        underButActuallyOver: recordedUnder.filter((r) => r.actual > cap).length,
    };
}

export function reportLines(timings = null, codes = {}) {
    const L = [];
    L.push("budget margin -- how wide the reading is, against how close the line is");
    const r = MARGIN_AT_V4481;
    L.push(`  meshBVH-selfcheck, ${r.straddle.readings.length} runs on an idle box: ${r.straddle.readings.join(", ")} ms`);
    L.push(`    the ${r.cap} ms cap falls INSIDE that range -- ${r.straddle.over} over, ${r.straddle.under} under`);
    L.push(`  the box has not changed: median now/ledger ${r.boxRatio} over ${r.boxSamples} rotation gates`);
    if (timings) {
        const near = nearCap(timings, { cap: r.cap, codes });
        L.push(`  gates recorded within 10% of the cap, now: ${near.length}`);
    }
    L.push(`  of ${r.nearCap.measured} near-cap gates run alone: median recorded/actual ${r.nearCap.medianRatio}x, ` +
           `${r.nearCap.inflatedHalfAgain} at 1.5x or more, worst ${r.nearCap.maxRatio}x`);
    L.push(`  and the error is ONE-DIRECTIONAL: ${r.nearCap.overButActuallyUnder} of ${r.nearCap.recordedOver} ` +
           `recorded-over are really under; ${r.nearCap.underButActuallyOver} of ${r.nearCap.recordedUnder} ` +
           `recorded-under are really over`);
    return L;
}

export const MARGIN_AT_V4481 = Object.freeze({
    cap: 3000,
    // meshBVH-selfcheck.mjs, seven consecutive runs, nothing else on the box.
    straddle: Object.freeze({
        gate: "tools/ship/meshBVH-selfcheck.mjs",
        readings: Object.freeze([2829, 2880, 2939, 2965, 2998, 3026, 3062]),
        over: 2, under: 5, spreadPct: 8,
    }),
    boxRatio: 1.007, boxSamples: 12,      // twelve rotation gates re-timed against the ledger's own readings
    nearCap: Object.freeze({
        measured: 20, medianRatio: 1.5, maxRatio: 2.3, inflatedHalfAgain: 10,
        recordedOver: 3, overButActuallyUnder: 1,
        recordedUnder: 17, underButActuallyOver: 0,
        worst: Object.freeze({ gate: "artifactWeight-selfcheck.mjs", recorded: 2933, actual: 1277 }),
    }),
    // The file has one commit, from v4248, and does fixed-size CPU work: it cannot have drifted.
    unchangedSince: "v4248",
});
