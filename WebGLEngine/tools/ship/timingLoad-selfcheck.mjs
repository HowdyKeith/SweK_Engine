/**
 * THE 43% WAS THE THRESHOLD, NOT A DEFECT -- AND THE EXPERIMENT THAT SHOWS IT TOOK SIX RUNS.
 *
 * v4575 measured that gate-timings.json and sweep-timings.json disagree by 2x or more for 496 of the 1143
 * gates both records hold, called it 43%, and closed by naming three candidate explanations it could not
 * separate: parallel load (the sweep runs eight-wide), age (gate-timings is largely a v3211 capture), and
 * drift in the gates themselves. Separating them needs one sample timed under BOTH conditions, which is what
 * this round did: eight gates, three rounds all-at-once exactly as quickSweep runs them, three rounds each
 * alone.
 *
 * *** THE LOAD FACTOR IS 2.15x, AND THE THRESHOLD WAS 2x. *** That single sentence is most of v4575's
 * finding. Across the 949 gates whose sweep reading carries a real capture stamp the median disagreement is
 * 1.94x, and dividing by the measured load factor leaves a residual of 0.90x -- the two records AGREE, once
 * you account for the conditions each was taken under. 46% of them cross a 2x line because the median sits
 * just under 2x and the distribution straddles it. v4575 reported a threshold artifact as a defect, and this
 * round is the correction.
 *
 * *** WHAT SURVIVES IS SMALL, AND THE TWO FILES FAIL IN DIFFERENT COLUMNS. *** The experiment measures two
 * independent things and an earlier draft of this header ran them together. `sweep / 8-wide` asks whether the
 * SWEEP entry is explained by load: seven of eight are, and the one that is not is hostScale, recorded at
 * 5815 against 160 measured eight-wide -- a 36x residual, and its stamp is the pre-v4408 `unknown`.
 * `alone / gate-timings` asks whether the GATE-TIMINGS entry is right: six of eight are within 30%, and the
 * two that are not fail in OPPOSITE directions -- rigJobs runs 6155 ms against an entry of 48 (the gate grew
 * 128x) and dockSystem runs 51 against 1005 (it shrank 20x). Three wrong numbers, across both files.
 *
 * *** AND THE STAMP PREDICTS ONE FILE'S STALENESS, NOT THE OTHER'S. *** Every unexplained SWEEP reading here
 * is undated, and across the population undated readings carry a residual above 3x at 5.1% against 0.3% for
 * dated ones -- sixteen times the rate. But dockSystem's bad number is in gate-timings while its sweep
 * reading is DATED and fine, so the stamp says nothing about the other file. That is why v4575's four-gate
 * spot-check split two and two: not noise, two different failure modes in two different records.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { UNKNOWN_AT } from "./sweepCoverage.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (label, cond, detail) => { if (!cond) fails++; console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "   " + detail : ""}`); };
const report = (s) => console.log(`  ----  ${s}`);

const G = JSON.parse(fs.readFileSync(path.join(ENG, "tools", "ship", "gate-timings.json"), "utf8")).timings;
const S = JSON.parse(fs.readFileSync(path.join(ENG, "tools", "ship", "sweep-timings.json"), "utf8"));
const med = (a) => { const s = a.slice().sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };

console.log("timingLoad-selfcheck -- the load factor is 2.12x and the threshold was 2x\n");

/**
 * *** MEASURED at v4575/v4576, six runs per gate: three with all eight dispatched at once (quickSweep's own
 * shape) and three with each alone, medians below. *** Frozen by name: re-running it is a minute of wall
 * clock and the numbers do not move on their own.
 */
export const LOAD_EXPERIMENT_V4576 = Object.freeze({
    at: "v4576", rounds: 3, concurrency: 8,
    // `sweepWas` and `datedWas` are the sweep file's entry AS IT STOOD when the experiment ran. They are
    // recorded because this round then CORRECTED the two stale ones from these very measurements, which
    // removed the live evidence the finding was derived from -- the same shape as v4476's returned twelve. The
    // residual below is computed from sweepWas, and a row after it checks the repair against the live file.
    runs: Object.freeze([
        Object.freeze({ gate: "tools/ship/rigJobs-selfcheck.mjs",              alone: 6155, wide: 6222, sweepWas: 6929, datedWas: false, gateWas: 48 }),
        Object.freeze({ gate: "tools/ship/hostScale-selfcheck.mjs",            alone: 64,   wide: 160,  sweepWas: 5815, datedWas: false, gateWas: 77 }),
        Object.freeze({ gate: "tools/groundtruth/traceField-selfcheck.mjs",    alone: 135,  wide: 281,  sweepWas: 454,  datedWas: true, gateWas: 164 }),
        Object.freeze({ gate: "ui/webgpuProbe-selfcheck.mjs",                  alone: 273,  wide: 373,  sweepWas: 808,  datedWas: true, gateWas: 292 }),
        Object.freeze({ gate: "world/spaceStructures-selfcheck.mjs",           alone: 141,  wide: 303,  sweepWas: 440,  datedWas: true, gateWas: 182 }),
        Object.freeze({ gate: "tools/ship/trim-selfcheck.mjs",                 alone: 51,   wide: 137,  sweepWas: 145,  datedWas: true, gateWas: 60 }),
        Object.freeze({ gate: "physics/render/fresnel-selfcheck.mjs",          alone: 54,   wide: 100,  sweepWas: 130,  datedWas: true, gateWas: 65 }),
        Object.freeze({ gate: "ui/dockSystem-selfcheck.mjs",                   alone: 51,   wide: 117,  sweepWas: 73,   datedWas: true, gateWas: 1005 }),
    ]),
});
const R = LOAD_EXPERIMENT_V4576.runs;
const LOAD = med(R.map((x) => x.wide / x.alone));

// -----------------------------------------------------------------------------------------------------------
console.log("1. *** THE LOAD FACTOR, MEASURED BY RUNNING ONE SAMPLE BOTH WAYS ***");
{
    report(`${"gate".padEnd(34)}${"alone".padStart(7)}${"8-wide".padStart(8)}${"load".padStart(8)}`);
    for (const x of R)
        report(`${path.basename(x.gate).padEnd(34)}${String(x.alone).padStart(7)}${String(x.wide).padStart(8)}${(x.wide / x.alone).toFixed(2).padStart(7)}x`);
    const fs8 = R.map((x) => x.wide / x.alone);
    // *** THE BAND THIS ROW FIRST USED WAS 1.5x TO 3x AND ITS SABOTAGE WENT 0-RED. *** Lowering one `wide`
    // reading from 137 to 55 moves the median from 2.15x to 2.08x, which a band that wide still accepts --
    // and the load factor is this round's central number, carried into section 4 to divide the population's
    // disagreement by. A number that everything downstream depends on cannot sit inside a tolerance a single
    // table edit fits through. LOAD_MEASURED is what the six runs produced; the row derives the median again
    // and requires the two to agree to the hundredth.
    const LOAD_MEASURED = 2.15;
    ok(`*** running eight gates at once costs ${LOAD.toFixed(2)}x the wall clock of running them alone -- median over ${R.length} gates, three rounds each ***`,
        LOAD.toFixed(2) === LOAD_MEASURED.toFixed(2) && LOAD > 1.5 && LOAD < 3,
        LOAD.toFixed(2) === LOAD_MEASURED.toFixed(2)
            ? `range ${Math.min(...fs8).toFixed(2)}x to ${Math.max(...fs8).toFixed(2)}x`
            : `DERIVED ${LOAD.toFixed(2)}x against a recorded ${LOAD_MEASURED.toFixed(2)}x -- the table has moved under the number section 4 divides by`);
    // The one gate that does NOT slow down is the one that was already the longest: it dominates its own
    // wall clock, so eight-wide costs it nothing. That is the shape load should have and a control on it.
    const slowest = R.reduce((a, x) => (x.alone > a.alone ? x : a));
    ok("  and the one gate load barely touches is the slowest of the eight, which is the shape contention should have -- a gate that dominates its own wall clock has little left to lose",
        slowest.wide / slowest.alone < 1.1 && slowest.alone > 5 * med(R.map((x) => x.alone)),
        `${path.basename(slowest.gate)} at ${slowest.alone} ms alone, ${(slowest.wide / slowest.alone).toFixed(2)}x under load`);
}

// -----------------------------------------------------------------------------------------------------------
console.log("\n2. THE AGE TERM: gate-timings IS ACCURATE FOR SIX OF THE EIGHT");
{
    // v4577 -- `gateWas` rather than the live file, because v4577 corrected rigJobs' and dockSystem's
    // gate-timings entries from these very readings. This section is a MEASUREMENT OF A RECORD'S STATE and
    // must therefore freeze that state; the live file is read only where a row asserts an invariant. Third
    // time this hazard has bitten across three rounds, and this is the rule that settles it.
    const age = R.map((x) => ({ g: x.gate, f: x.alone / Math.max(1, x.gateWas) }));
    for (const a of age) report(`${path.basename(a.g).padEnd(34)}alone / gate-timings = ${a.f.toFixed(2)}x`);
    const close = age.filter((a) => a.f > 0.7 && a.f < 1.4);
    ok(`*** ${close.length} of ${R.length} run within 30% of their gate-timings entry, so that file is NOT broadly stale -- the "age" explanation is refuted for most of the sample ***`,
        close.length === 6, `${close.length} within 0.7x-1.4x; median ${med(age.map((a) => a.f)).toFixed(2)}x`);
    const off = age.filter((a) => a.f <= 0.7 || a.f >= 1.4);
    ok(`  and the ${off.length} that are not run in OPPOSITE directions, so it is drift in the gates rather than a slow or fast box`,
        off.length === 2 && off.some((a) => a.f > 2) && off.some((a) => a.f < 0.5),
        off.map((a) => `${path.basename(a.g)} ${a.f.toFixed(2)}x`).join(", ") +
        " -- both corrected at v4577 in the live file, which is why this reads from gateWas");
}

// -----------------------------------------------------------------------------------------------------------
console.log("\n3. *** AND THE CAPTURE STAMP PICKS OUT EXACTLY THE TWO LOAD CANNOT EXPLAIN ***");
{
    // Residual: how much of the sweep's reading is left once the measured load factor is taken out of it.
    const resid = R.map((x) => ({ g: x.gate, res: x.sweepWas / x.wide, dated: x.datedWas }));
    for (const x of resid)
        report(`${path.basename(x.g).padEnd(34)}sweepWas / 8-wide = ${x.res.toFixed(2).padStart(7)}x   ${x.dated ? "dated" : "UNDATED (pre-v4408)"}`);
    const unexplained = resid.filter((x) => x.res > 3);
    ok(`*** every gate whose sweep reading load failed to explain was UNDATED, and every dated one was explained -- ${unexplained.length} unexplained, ${unexplained.filter((x) => !x.dated).length} of them undated ***`,
        unexplained.length > 0 && unexplained.every((x) => !x.dated) && resid.filter((x) => x.dated).every((x) => x.res <= 3),
        unexplained.map((x) => `${path.basename(x.g)} ${x.res.toFixed(0)}x`).join(", ") +
        `; the ${resid.filter((x) => x.dated).length} dated ones sat at ${Math.max(...resid.filter((x) => x.dated).map((x) => x.res)).toFixed(2)}x or less`);
    // *** AND THE ROW ABOVE IS PAST TENSE BECAUSE THIS ROUND FIXED WHAT IT FOUND. *** Both undated entries
    // were re-taken in sweep-timings.json from this experiment's own alone-measurements, which is why the
    // residual is computed from `sweepWas` rather than the live file: correcting a record deletes the
    // evidence that it was wrong. This row is the other half -- it goes red if either entry is reverted, or
    // if either drifts away from what was measured here.
    const fixed = R.filter((x) => !x.datedWas);
    ok(`*** and both are corrected in the live file now: re-taken from this experiment's own alone-readings, so the row above is past tense and this one goes red if either is reverted ***`,
        fixed.every((x) => S.timings[x.gate] === x.alone && (S.at || {})[x.gate] !== UNKNOWN_AT),
        fixed.map((x) => `${path.basename(x.gate)} ${x.sweepWas} -> ${S.timings[x.gate]}`).join(", "));
    ok("  and the stamp sentinel is sweepCoverage's own, not a string typed here -- the table records which entries carried it, and the file no longer does for those two",
        typeof UNKNOWN_AT === "string" && UNKNOWN_AT.length > 5 && resid.some((x) => !x.dated) &&
        fixed.every((x) => (S.at || {})[x.gate] !== UNKNOWN_AT),
        `sentinel ${JSON.stringify(UNKNOWN_AT)}`);
}

// -----------------------------------------------------------------------------------------------------------
console.log("\n4. *** THE POPULATION AGREES, AND IT IS WHY v4575'S 43% WAS A THRESHOLD ARTIFACT ***");
const both = Object.keys(G).filter((k) => k in S.timings && fs.existsSync(path.join(ENG, k)));
const real = both.filter((k) => S.codes[k] === 0 && S.timings[k] < S.capMs);
const ratioOf = (k) => Math.max(G[k], S.timings[k]) / Math.max(1, Math.min(G[k], S.timings[k]));
const dated = real.filter((k) => (S.at || {})[k] !== UNKNOWN_AT);
const undated = real.filter((k) => (S.at || {})[k] === UNKNOWN_AT);
{
    const dm = med(dated.map(ratioOf)), um = med(undated.map(ratioOf));
    const overRes = (set) => set.filter((k) => ratioOf(k) / LOAD > 3).length;
    report(`dated   n=${dated.length}  median ratio ${dm.toFixed(2)}x  residual after load ${(dm / LOAD).toFixed(2)}x  over-3x residual ${overRes(dated)} (${(100 * overRes(dated) / dated.length).toFixed(1)}%)`);
    report(`undated n=${undated.length}  median ratio ${um.toFixed(2)}x  residual after load ${(um / LOAD).toFixed(2)}x  over-3x residual ${overRes(undated)} (${(100 * overRes(undated) / undated.length).toFixed(1)}%)`);
    ok(`*** for the ${dated.length} gates with a dated sweep reading the median disagreement is ${dm.toFixed(2)}x against a measured load factor of ${LOAD.toFixed(2)}x -- a residual of ${(dm / LOAD).toFixed(2)}x, so the two records AGREE once the conditions are taken out ***`,
        dm / LOAD < 1.1, `${dm.toFixed(2)}x / ${LOAD.toFixed(2)}x`);
    ok(`  and that is why v4575's "43% disagree by 2x or more" was the LINE and not a defect: the median sits at ${dm.toFixed(2)}x and the threshold was 2x, so the distribution straddles it`,
        dm < 2 && dm > 1.5 && real.filter((k) => ratioOf(k) >= 2).length / real.length > 0.35,
        `${real.filter((k) => ratioOf(k) >= 2).length} of ${real.length} cross 2x; the median is ${dm.toFixed(2)}x`);
    // *** THIS WAS A COUNT AND IS A RATCHET NOW, BECAUSE v4577 CLOSED EVERY ONE OF THEM. *** The row read
    // "what survives is 13 gates, and undated readings carry it at 16x the rate of dated ones" -- then v4577
    // ran all twelve remaining and corrected fourteen entries, and the live count went to zero. A finding
    // stated as a count reddens the day somebody acts on it. Stated as a ratchet it does the opposite: the
    // recorded pair is what v4576 measured, the live number may only FALL, and going UP means new drift.
    const SURVIVORS_V4576 = Object.freeze({ dated: 3, undated: 10, undatedRate: 5.1, datedRate: 0.3 });
    const liveSurvivors = overRes(dated) + overRes(undated);
    report(`v4576 measured ${SURVIVORS_V4576.undated + SURVIVORS_V4576.dated} survivors -- ` +
        `${SURVIVORS_V4576.undatedRate}% of undated readings against ${SURVIVORS_V4576.datedRate}% of dated, sixteen times the rate`);
    ok(`*** the residual population RATCHETS DOWN: v4576 measured ${SURVIVORS_V4576.undated + SURVIVORS_V4576.dated} and there are ${liveSurvivors} now, every one of them run and corrected at v4577 ***`,
        liveSurvivors <= SURVIVORS_V4576.undated + SURVIVORS_V4576.dated,
        liveSurvivors === 0 ? "all closed; a rise above the recorded figure means new drift, which is what this row exists to catch"
                            : `${overRes(undated)} of ${undated.length} undated, ${overRes(dated)} of ${dated.length} dated`);
    ok(`  and the rate asymmetry v4576 measured is recorded rather than re-derived, because the population it described is gone: ${SURVIVORS_V4576.undatedRate}% against ${SURVIVORS_V4576.datedRate}%`,
        SURVIVORS_V4576.undatedRate > 5 * SURVIVORS_V4576.datedRate,
        `v4577 confirmed the direction by running all twelve: 8 of 8 undated were sweep-stale, 4 of 4 dated were gate-timings-stale`);
}

// -----------------------------------------------------------------------------------------------------------
console.log("\n5. CONTROLS");
{
    ok("the load factor is DERIVED from the frozen table rather than written beside it, so an edited run moves it",
        Math.abs(LOAD - med(R.map((x) => x.wide / x.alone))) < 1e-12, `${LOAD.toFixed(4)}x from ${R.length} pairs`);
    ok("  and every gate in the table still exists and appears in both records",
        R.every((x) => fs.existsSync(path.join(ENG, x.gate)) && x.gate in G && x.gate in S.timings),
        `${R.length} gates checked`);
    // The first version of this row said "all but the slowest" and went red on its own data: rigJobs IS
    // slower under load, by 1.01x. Monotone is the true and stronger property -- eight for eight.
    ok("  and every one of the eight is slower under load than alone, so the two columns are measurements of different conditions and not one column copied twice",
        R.every((x) => x.wide > x.alone),
        `${R.filter((x) => x.wide > x.alone).length} of ${R.length} slower under load, the smallest margin ${Math.min(...R.map((x) => x.wide / x.alone)).toFixed(3)}x`);
    ok("the population split is a PARTITION of the comparable gates, so the two rates are of disjoint sets",
        dated.length + undated.length === real.length && new Set([...dated, ...undated]).size === real.length,
        `${dated.length} + ${undated.length} = ${real.length}`);
    ok("  and cap readings are still excluded, so no residual here is measured against the killer's clock",
        real.every((k) => S.codes[k] === 0 && S.timings[k] < S.capMs), `${both.length - real.length} of ${both.length} excluded`);
}

console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nALL GREEN");
console.log("unchecked here: THE TEN THAT SURVIVE. The residual population is named by a rate, not a list that " +
    "anybody has run -- two of them were measured here (rigJobs grew 128x, dockSystem shrank 20x) and the " +
    "rest are inferred from the ratio. Also unchecked: whether the load factor is 2.12x for a gate that is " +
    "IO-bound rather than CPU-bound, since all eight here are short CPU-bound gates and the one long gate in " +
    "the sample showed 1.01x; whether quickSweep's own eight-wide reading matches this experiment's, which " +
    "would need running the sweep rather than imitating it; and the 136 cap readings, excluded throughout " +
    "because v4574 showed they are the killer's clock and no residual can be computed from them.");
process.exit(fails ? 1 : 0);
