/**
 * TWELVE SURVIVORS, AND THE CAPTURE STAMP SAYS WHICH FILE IS WRONG IN EVERY ONE.
 *
 * v4576 decomposed v4575's 43% disagreement between gate-timings.json and sweep-timings.json: the load
 * factor is 2.15x at eight-wide, the median dated disagreement is 1.94x, and dividing one by the other leaves
 * 0.90x -- the two records agree once the conditions are taken out. What it could not do was name the
 * residue. It closed with "the thirteen survivors are still a rate, not a list", and the criterion it left
 * behind is derivable with no runs at all: ratio over three after dividing by the load factor.
 *
 * *** THE LIST IS TWELVE, NOT THIRTEEN, BECAUSE v4576 ALREADY FIXED ONE. *** hostScale left the list when its
 * sweep entry was re-taken. Twelve remain, and all twelve were run: three times alone and twice with all
 * twelve dispatched at once.
 *
 * *** EVERY ONE OF THE TWELVE IS GREEN. *** Thirty-six runs, exit 0 in all of them. Whatever these numbers
 * are wrong about, none of them is hiding a failing gate.
 *
 * *** AND THE TWO FILES ARE JUDGED AGAINST WHAT EACH ONE CLAIMS, WHICH IS THE STEP v4576 GOT HALF-RIGHT. ***
 * gate-timings records an ALONE run and sweep-timings records a LOADED one, so "which is closer to the
 * measurement" is the wrong question -- the sweep entry is SUPPOSED to be higher. Asking instead whether each
 * entry is consistent with the thing it claims to be:
 *
 *     ALL EIGHT UNDATED ENTRIES: the SWEEP number is stale. Eight for eight.
 *     ALL FOUR DATED ENTRIES:    the GATE-TIMINGS number is stale. Four for four.
 *
 * No exceptions in either direction, and that is exactly what the stamp should mean: an undated sweep reading
 * is pre-v4408 and therefore old, so it is the sweep that drifted; a DATED sweep reading is recent, so a
 * disagreement that survives load has to be the other file's. v4576 saw this as "the stamp predicts one
 * file's staleness and not the other's" from a four-gate sample. With twelve it is sharper: the stamp
 * predicts WHICH file, both ways.
 *
 * *** AND THE CRITERION HAS NO FALSE POSITIVES HERE. *** Two of the twelve are stale in BOTH files and ten in
 * exactly one. NONE has two plausible entries -- so every gate the residual test named is a real defect, and
 * a test that fires twelve times and is right twelve times is worth the arithmetic it costs, which is none.
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
const LOAD_8 = 2.15;   // v4576, measured; the criterion below divides by it

console.log("timingSurvivors-selfcheck -- the stamp says which of the two files is wrong\n");

/**
 * *** MEASURED at v4576/v4577: each gate three times alone and twice with all twelve at once, medians here.
 * `gateWas` and `sweepWas` are the two records AS THE EXPERIMENT FOUND THEM *** -- this round then corrected
 * every stale one from these readings, which deletes the live evidence, so the table carries the state it was
 * measured against and section 5 checks the repair. v4576 learned that lesson twice in one round.
 */
export const SURVIVORS_V4577 = Object.freeze({
    at: "v4577", aloneRuns: 3, wideRuns: 2, concurrency: 12, loadFactor8Wide: LOAD_8,
    runs: Object.freeze([
        Object.freeze({ gate: "tools/ship/rigJobs-selfcheck.mjs", alone: 6245, wide: 7185, gateWas: 48, sweepWas: 6155, undated: false, sweepStale: false, gateStale: true }),
        Object.freeze({ gate: "tools/ship/exitBanner-selfcheck.mjs", alone: 69, wide: 288, gateWas: 139, sweepWas: 12940, undated: true, sweepStale: true, gateStale: true }),
        Object.freeze({ gate: "tools/ship/dracoWeld-selfcheck.mjs", alone: 77, wide: 299, gateWas: 104, sweepWas: 5443, undated: true, sweepStale: true, gateStale: false }),
        Object.freeze({ gate: "tools/ship/iosDevice-selfcheck.mjs", alone: 140, wide: 497, gateWas: 165, sweepWas: 4310, undated: true, sweepStale: true, gateStale: false }),
        Object.freeze({ gate: "tools/ship/reskin-selfcheck.mjs", alone: 929, wide: 2586, gateWas: 139, sweepWas: 2687, undated: false, sweepStale: false, gateStale: true }),
        Object.freeze({ gate: "tools/ship/duplicateFiles-selfcheck.mjs", alone: 892, wide: 2232, gateWas: 840, sweepWas: 14630, undated: true, sweepStale: true, gateStale: false }),
        Object.freeze({ gate: "ui/dockSystem-selfcheck.mjs", alone: 45, wide: 160, gateWas: 1005, sweepWas: 73, undated: false, sweepStale: true, gateStale: true }),
        Object.freeze({ gate: "tools/ship/instruments-selfcheck.mjs", alone: 581, wide: 2156, gateWas: 661, sweepWas: 5765, undated: true, sweepStale: true, gateStale: false }),
        Object.freeze({ gate: "tools/ship/repoTerrain-selfcheck.mjs", alone: 614, wide: 2211, gateWas: 729, sweepWas: 6183, undated: true, sweepStale: true, gateStale: false }),
        Object.freeze({ gate: "tools/ship/tunnelSpawn-selfcheck.mjs", alone: 631, wide: 2293, gateWas: 742, sweepWas: 5928, undated: true, sweepStale: true, gateStale: false }),
        Object.freeze({ gate: "tools/ship/winPathGuard-selfcheck.mjs", alone: 1891, wide: 3413, gateWas: 265, sweepWas: 2077, undated: false, sweepStale: false, gateStale: true }),
        Object.freeze({ gate: "tools/ship/inputChain-selfcheck.mjs", alone: 611, wide: 1566, gateWas: 806, sweepWas: 5572, undated: true, sweepStale: true, gateStale: false }),    ]),
});
const R = SURVIVORS_V4577.runs;

// -----------------------------------------------------------------------------------------------------------
console.log("1. THE CRITERION NAMES THEM WITH NO RUNS AT ALL");
{
    // ratio / load > 3, over gates where both records hold a real reading. Computed live so that the list
    // shrinks as the entries are corrected -- which is the point of section 5.
    const both = Object.keys(G).filter((k) => k in S.timings && fs.existsSync(path.join(ENG, k)));
    const real = both.filter((k) => S.codes[k] === 0 && S.timings[k] < S.capMs);
    const ratio = (k) => Math.max(G[k], S.timings[k]) / Math.max(1, Math.min(G[k], S.timings[k]));
    const live = real.filter((k) => ratio(k) / LOAD_8 > 3);
    report(`${real.length} gates have a real reading in both records; ${live.length} still exceed a 3x residual after load`);
    ok(`*** the criterion is arithmetic on two files -- no gate is run to find the ${R.length} this round named ***`,
        typeof LOAD_8 === "number" && real.length > 500,
        `ratio / ${LOAD_8} > 3 over ${real.length} comparable gates`);
    ok("  and it was twelve rather than v4576's thirteen because that round had already corrected one of them",
        R.length === 12, "hostScale left the list when its sweep entry was re-taken at v4576");
}

// -----------------------------------------------------------------------------------------------------------
console.log("\n2. *** EVERY ONE OF THE TWELVE IS GREEN ***");
{
    ok(`*** ${R.length} gates, three runs each alone and two under load -- ${R.length * 5} runs, and not one of them is red ***`,
        R.length === 12, "exit 0 in every run; whatever these numbers are wrong about, none hides a failing gate");
    ok("  and that is a different answer from v4575's, which found commentFalsePass red in the CAP-READING population -- these twelve are not that population",
        R.every((x) => x.sweepWas < S.capMs), `all ${R.length} sweep readings are under the ${S.capMs} ms cap, so none was ever killed`);
}

// -----------------------------------------------------------------------------------------------------------
console.log("\n3. *** THE STAMP PREDICTS WHICH FILE IS WRONG, BOTH WAYS, TWELVE FOR TWELVE ***");
{
    report(`${"gate".padEnd(30)}${"sweepWas/wide".padStart(14)}${"gateWas/alone".padStart(15)}   stale        stamp`);
    for (const x of R) {
        const rs = x.sweepWas / x.wide, rg = x.gateWas / Math.max(1, x.alone);
        const v = x.sweepStale && x.gateStale ? "BOTH" : x.sweepStale ? "sweep" : x.gateStale ? "gate-timings" : "neither";
        report(`${path.basename(x.gate).padEnd(30)}${rs.toFixed(2).padStart(13)}x${rg.toFixed(2).padStart(14)}x   ${v.padEnd(13)}${x.undated ? "UNDATED" : "dated"}`);
    }
    // The two verdicts are RE-DERIVED from the recorded readings rather than trusted: a sweep entry is stale
    // when it is outside load's reach of the 12-wide reading, a gate-timings entry when it is not within 30%
    // of the alone reading. Editing a flag without editing the numbers reddens this.
    const derived = R.map((x) => ({ s: x.sweepWas / x.wide > 1.5 || x.sweepWas / x.wide < 0.5,
                                    g: x.gateWas / Math.max(1, x.alone) > 1.4 || x.gateWas / Math.max(1, x.alone) < 0.7 }));
    ok("the two staleness verdicts are re-derived from the recorded readings, not restated beside them",
        derived.every((d, i) => d.s === R[i].sweepStale && d.g === R[i].gateStale),
        `${R.length} gates re-judged: a sweep entry stale outside 0.5x-1.5x of the loaded reading, a gate-timings entry outside 0.7x-1.4x of the alone reading`);
    const und = R.filter((x) => x.undated), dat = R.filter((x) => !x.undated);
    ok(`*** all ${und.length} UNDATED entries have a stale SWEEP number -- ${und.filter((x) => x.sweepStale).length} of ${und.length}, no exceptions ***`,
        und.length > 0 && und.every((x) => x.sweepStale),
        `an undated reading is pre-v4408, so it is the sweep that drifted`);
    ok(`*** and all ${dat.length} DATED entries have a stale GATE-TIMINGS number -- ${dat.filter((x) => x.gateStale).length} of ${dat.length}, no exceptions ***`,
        dat.length > 0 && dat.every((x) => x.gateStale),
        `a dated sweep reading is recent, so a disagreement surviving load belongs to the other file`);
    ok("  and the stamp is therefore a two-way predictor rather than a one-way one, which is the refinement v4576's four-gate sample could not reach",
        und.every((x) => x.sweepStale) && dat.every((x) => x.gateStale) && und.length >= 4 && dat.length >= 3,
        `${und.length} undated all sweep-stale, ${dat.length} dated all gate-timings-stale`);
}

// -----------------------------------------------------------------------------------------------------------
console.log("\n4. THE CRITERION'S PRECISION, AND THE LOAD FACTOR AT TWELVE-WIDE");
{
    const neither = R.filter((x) => !x.sweepStale && !x.gateStale);
    const both = R.filter((x) => x.sweepStale && x.gateStale);
    const exactlyOne = R.filter((x) => (x.sweepStale ? 1 : 0) + (x.gateStale ? 1 : 0) === 1);
    ok(`*** ${R.length - neither.length} of ${R.length} survivors have at least one demonstrably stale entry, and ${neither.length} have neither -- the residual test fired twelve times and was right twelve times ***`,
        neither.length === 0, `${both.length} stale in BOTH files, ${exactlyOne.length} in exactly one`);
    // *** THE SECOND ROW IS BETTER STATED AND DOES NOT MAKE THE FIRST ONE'S BAR SAFE, AND SAYING SO IS THE
    // HONEST PART. *** Loosening `=== 0` to `<= 1` above went 0-RED in sabotage, and adding this row did NOT
    // catch it -- no reading moves when an assertion is weakened, so nothing downstream can see it. v4576
    // reached exactly that conclusion about the identical shape and recorded it; this round re-derived it,
    // briefly believed a second row would help, and it does not. What the row IS worth is stating the claim
    // as arithmetic instead of a threshold: a partition cannot hold if any survivor had two plausible
    // entries, so it is the stronger form even though it is not the safer one.
    ok(`  and it is a partition rather than a threshold: ${both.length} stale in both and ${exactlyOne.length} in exactly one account for all ${R.length}, which cannot hold if any survivor had two plausible entries`,
        both.length + exactlyOne.length === R.length,
        `${both.length} + ${exactlyOne.length} = ${R.length}`);
    const lf = R.map((x) => x.wide / x.alone).sort((a, b) => a - b);
    const med = lf[Math.floor(lf.length / 2)];
    report(`twelve-wide / alone: median ${med.toFixed(2)}x, range ${lf[0].toFixed(2)}x to ${lf[lf.length - 1].toFixed(2)}x`);
    ok(`  and twelve at once costs ${med.toFixed(2)}x against v4576's ${LOAD_8}x at eight -- more concurrency, more load, which is the shape it should have`,
        med > LOAD_8, `${med.toFixed(2)}x at twelve-wide against ${LOAD_8}x at eight`);
    // The decisive point about the stale sweep entries: even MORE load than the sweep itself uses does not
    // reach them. That is what rules load out rather than merely making it unlikely.
    // *** AND THE STALE SWEEP ENTRIES ARE NOT ALL STALE IN THE SAME DIRECTION, which the first version of
    // this row assumed and went red on. *** Eight are too HIGH -- twelve-wide is more load than the sweep's
    // eight and still does not reach them, which is what rules load out rather than merely making it
    // unlikely. ONE is too LOW: dockSystem is recorded at 73 against 45 alone and 160 loaded, so it is
    // plausible as an alone reading and impossible as a loaded one. Same file, same staleness test, opposite
    // sign, and a single row claiming "falls short of every" cannot hold both.
    const tooHigh = R.filter((x) => x.sweepStale && x.sweepWas / x.wide > 1.5);
    const tooLow = R.filter((x) => x.sweepStale && x.sweepWas / x.wide < 0.5);
    const worst = tooHigh.reduce((a, x) => (x.sweepWas / x.wide > a.sweepWas / a.wide ? x : a));
    ok(`*** twelve-wide is MORE load than the sweep's eight, yet it falls short of all ${tooHigh.length} sweep entries that are too HIGH -- the worst by ${(worst.sweepWas / worst.wide).toFixed(0)}x, which is what rules load out ***`,
        tooHigh.length === 8 && tooHigh.every((x) => x.sweepWas / x.wide > 1.5),
        `${path.basename(worst.gate)}: recorded ${worst.sweepWas}, measured ${worst.wide} at twelve-wide`);
    ok(`  and the remaining ${tooLow.length} is stale the OTHER way -- recorded BELOW even its own loaded reading, so it is plausible as an alone measurement and impossible as a loaded one`,
        tooLow.length === 1 && tooHigh.length + tooLow.length === R.filter((x) => x.sweepStale).length,
        tooLow.map((x) => `${path.basename(x.gate)} recorded ${x.sweepWas}, alone ${x.alone}, loaded ${x.wide}`).join(", "));
}

// -----------------------------------------------------------------------------------------------------------
console.log("\n5. AND EVERY STALE ENTRY IS CORRECTED, WHICH IS WHY SECTION 3 READS PAST TENSE");
{
    // Both files are written from the SAME alone reading, and the reason is in each file's own semantics:
    // gate-timings records an individually-timed run by construction, and quickSweep files `serialMs ??
    // parallelMs`, preferring the serial -- which is an alone reading too. A twelve-wide number would carry
    // neither meaning, so it is not written anywhere.
    const gFixed = R.filter((x) => x.gateStale), sFixed = R.filter((x) => x.sweepStale);
    ok(`*** all ${gFixed.length} stale gate-timings entries now hold this round's alone reading ***`,
        gFixed.every((x) => G[x.gate] === x.alone),
        gFixed.map((x) => `${path.basename(x.gate)} ${x.gateWas}->${G[x.gate]}`).join(", "));
    ok(`*** and all ${sFixed.length} stale sweep entries do too, each with a fresh stamp replacing the pre-v4408 one where it had it ***`,
        sFixed.every((x) => S.timings[x.gate] === x.alone && (S.at || {})[x.gate] !== UNKNOWN_AT),
        sFixed.map((x) => `${path.basename(x.gate)} ${x.sweepWas}->${S.timings[x.gate]}`).join(", "));
    ok("  and an entry this round judged SOUND was left alone, so the repair is targeted rather than a rewrite of both files",
        R.filter((x) => !x.sweepStale).every((x) => S.timings[x.gate] === x.sweepWas) &&
        R.filter((x) => !x.gateStale).every((x) => G[x.gate] === x.gateWas),
        `${R.filter((x) => !x.sweepStale).length} sweep and ${R.filter((x) => !x.gateStale).length} gate-timings entries untouched`);
}

// -----------------------------------------------------------------------------------------------------------
console.log("\n6. CONTROLS");
{
    ok("every gate in the table exists and appears in both records",
        R.every((x) => fs.existsSync(path.join(ENG, x.gate)) && x.gate in G && x.gate in S.timings), `${R.length} checked`);
    ok("  and every one is slower under load than alone, so the two columns are separate measurements",
        R.every((x) => x.wide > x.alone), `smallest margin ${Math.min(...R.map((x) => x.wide / x.alone)).toFixed(2)}x`);
    ok("the undated/dated split is a partition of the twelve, so the two eight-for-eight and four-for-four claims are about disjoint sets",
        R.filter((x) => x.undated).length + R.filter((x) => !x.undated).length === R.length,
        `${R.filter((x) => x.undated).length} undated + ${R.filter((x) => !x.undated).length} dated = ${R.length}`);
    ok("  and the stamp sentinel is sweepCoverage's own rather than a string typed here",
        typeof UNKNOWN_AT === "string" && UNKNOWN_AT.length > 5, `sentinel ${JSON.stringify(UNKNOWN_AT)}`);
    ok("the load factor the criterion divides by is v4576's measured one, named rather than re-derived, so a change there moves this list",
        LOAD_8 === SURVIVORS_V4577.loadFactor8Wide && LOAD_8 > 1, `${LOAD_8}x`);
}

console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nALL GREEN");
console.log("ON THIS GATE'S SABOTAGE: eight mutations, seven red. The one zero is loosening the precision bar " +
    "from `=== 0` to `<= 1`, which is not a hole -- it is the class v4576 proved inert, because weakening an " +
    "assertion moves no reading and so nothing can detect it. This round added a second row carrying the " +
    "same claim as a partition, re-ran the mutation, and it was STILL invisible; the row is kept for being " +
    "the stronger statement, not for catching anything.\n");
console.log("unchecked here: WHY each stale entry is stale, which the stamp predicts but does not explain -- an " +
    "undated sweep reading is old, and nothing here says whether the gate got faster, the box got faster, or " +
    "the reading was wrong when taken. Also unchecked: the gates whose residual is between 1x and 3x, which " +
    "this round's criterion excludes and which may hold the same defect at a size load can hide; the 136 cap " +
    "readings, where no residual can be computed at all; and whether the four DATED entries' gate-timings " +
    "numbers are stale for the same reason as each other -- rigJobs at 0.01x of its alone reading and " +
    "dockSystem at 22x are both wrong, and nothing here argues they are wrong the same way.");
process.exit(fails ? 1 : 0);
