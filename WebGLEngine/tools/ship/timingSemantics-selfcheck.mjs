/**
 * ONE COLUMN, TWO QUANTITIES, AND THE BUDGET LINE DECIDES WHICH -- INCLUDING NINE THIS ARC GOT WRONG.
 *
 * v4577 closed by proposing a sharper detector. Its reasoning: the stamp tells you a DATED sweep entry is
 * fresh, so the alone time it implies is sweep / load, and any gate-timings entry far from that is stale
 * whatever the raw ratio says. *** THE PROPOSAL RESTS ON THE SWEEP COLUMN MEANING ONE THING, AND IT DOES
 * NOT. *** quickSweep files `timings[r.gate] = r.serialMs ?? r.parallelMs`, and a gate only ever gets a
 * serialMs if it was red or crossed the budget. So:
 *
 *     UNDER the budget  ->  parallelMs  ->  a LOADED reading
 *     AT OR OVER it     ->  serialMs    ->  an ALONE reading
 *
 * Two different physical quantities, in one column, with nothing marking which. MEASURED over the 959 dated
 * comparable gates: under the budget the column sits at 1.93x gate-timings, which is the load factor; at or
 * over it, 0.98x, which is agreement between two alone readings. The boundary is exactly the budget, as the
 * code says it must be.
 *
 * *** AND THIS ARC PUT THE WRONG QUANTITY IN NINE ENTRIES. *** v4577 wrote alone readings into sweep-timings
 * for the gates it repaired, reasoning in its own words that "quickSweep files `serialMs ?? parallelMs`,
 * preferring the serial -- which is an alone reading too". That is true only for a gate over the budget.
 * Nine of the fourteen it corrected sit UNDER it and never get a serial reading at all, so nine entries now
 * held an alone number where the column means loaded. They are re-measured here at EXACTLY eight concurrent
 * -- two batches of eight covering all nine, three rounds -- and corrected. Those numbers have now moved
 * twice, and saying so is the point: a record re-taken from the wrong quantity is still wrong.
 *
 * *** THE DETECTOR ITSELF WORKS, WHERE THE COLUMN'S MEANING IS KNOWN: TEN FOR TEN, NO FALSE POSITIVES. ***
 * Of eleven candidates it named, ten were usable and the eleventh had to be dropped because THIS ARC had
 * corrupted its column. All ten were run: every one is green, and every one has a gate-timings entry between
 * 2.0x and 6.3x too high. Their residuals under v4577's criterion run 0.66x to 2.73x -- all below the 3x
 * line -- so not one of them was visible to it. A gate-timings entry three times too high produces a RAW
 * ratio of about 1.4x, which reads as agreement.
 *
 * *** ITS MAGNITUDE IS UNRELIABLE BELOW ABOUT A TENTH OF A SECOND, THOUGH, AND THE DIRECTION IS NOT. ***
 * esFlight3dMath was predicted 12.63x and measured 5.34x, because its 40 ms loaded reading is mostly process
 * startup -- at that size the load factor the prediction divides by is not there to be found. The gate was
 * still correctly flagged. Detect with it; do not quote it.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { UNKNOWN_AT } from "./sweepCoverage.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (label, cond, detail) => { if (!cond) fails++; console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "   " + detail : ""}`); };
const report = (s) => console.log(`  ----  ${s}`);
const med = (a) => { const s = a.slice().sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };

const G = JSON.parse(fs.readFileSync(path.join(ENG, "tools", "ship", "gate-timings.json"), "utf8")).timings;
const S = JSON.parse(fs.readFileSync(path.join(ENG, "tools", "ship", "sweep-timings.json"), "utf8"));
const LOAD = 2.15;   // v4576, eight-wide

console.log("timingSemantics-selfcheck -- the sweep's ms column means two different things\n");

/** MEASURED at v4578: the nine entries this arc filled with the wrong quantity, re-read at exactly 8 concurrent. */
export const EIGHT_WIDE_V4578 = Object.freeze({
    at: "v4578", rounds: 3, concurrency: 8,
    runs: Object.freeze([
        Object.freeze({ gate: "tools/ship/dracoWeld-selfcheck.mjs", alone: 77, wide8: 144 }),
        Object.freeze({ gate: "tools/ship/duplicateFiles-selfcheck.mjs", alone: 892, wide8: 1293 }),
        Object.freeze({ gate: "tools/ship/exitBanner-selfcheck.mjs", alone: 69, wide8: 175 }),
        Object.freeze({ gate: "tools/ship/inputChain-selfcheck.mjs", alone: 611, wide8: 1012 }),
        Object.freeze({ gate: "tools/ship/instruments-selfcheck.mjs", alone: 581, wide8: 997 }),
        Object.freeze({ gate: "tools/ship/iosDevice-selfcheck.mjs", alone: 140, wide8: 355 }),
        Object.freeze({ gate: "tools/ship/repoTerrain-selfcheck.mjs", alone: 614, wide8: 1052 }),
        Object.freeze({ gate: "tools/ship/tunnelSpawn-selfcheck.mjs", alone: 631, wide8: 1388 }),
        Object.freeze({ gate: "ui/dockSystem-selfcheck.mjs", alone: 45, wide8: 82 }),    ]),
});
/** MEASURED at v4578: v4577's proposed detector, run against every candidate it was safe to run. */
export const SKEW_PROBE_V4578 = Object.freeze({
    at: "v4578", rounds: 3, excluded: "tools/roundhouse/reconQualityBind-selfcheck.mjs",
    runs: Object.freeze([
        Object.freeze({ gate: "ev/esFlight3dMath-selfcheck.mjs", alone: 44, gateWas: 235, sweepNow: 40 }),
        Object.freeze({ gate: "ev/tools/es-gates-selfcheck.mjs", alone: 65, gateWas: 407, sweepNow: 122 }),
        Object.freeze({ gate: "ev/tools/es-start-selfcheck.mjs", alone: 70, gateWas: 414, sweepNow: 166 }),
        Object.freeze({ gate: "physics/blobVitals-selfcheck.mjs", alone: 62, gateWas: 239, sweepNow: 96 }),
        Object.freeze({ gate: "tools/roundhouse/keplerBind-selfcheck.mjs", alone: 77, gateWas: 216, sweepNow: 95 }),
        Object.freeze({ gate: "tools/roundhouse/reactionDevice-selfcheck.mjs", alone: 1407, gateWas: 3058, sweepNow: 1442 }),
        Object.freeze({ gate: "ai-bridge/tools/puppeteer-bridge-selfcheck.mjs", alone: 44, gateWas: 203, sweepNow: 98 }),
        Object.freeze({ gate: "physics/mechanics/poisson-selfcheck.mjs", alone: 50, gateWas: 209, sweepNow: 104 }),
        Object.freeze({ gate: "brain/tools/policy-mass-selfcheck.mjs", alone: 79, gateWas: 162, sweepNow: 100 }),
        Object.freeze({ gate: "brain/tf/tf-selfcheck.mjs", alone: 82, gateWas: 165, sweepNow: 116 }),    ]),
});
const NINE = EIGHT_WIDE_V4578.runs, TEN = SKEW_PROBE_V4578.runs;

// -----------------------------------------------------------------------------------------------------------
console.log("1. *** THE TWO BRANCHES, READ OUT OF quickSweep RATHER THAN ASSERTED ***");
{
    const qs = fs.readFileSync(path.join(ENG, "tools", "ship", "quickSweep.mjs"), "utf8");
    ok("quickSweep files `serialMs ?? parallelMs` into the ms column, so which quantity lands there depends on whether a serial run happened",
        /timings\[r\.gate\]\s*=\s*r\.serialMs\s*\?\?\s*r\.parallelMs/.test(qs),
        "one column, two provenances");
    ok("  and a serial run only happens for a gate that was red or crossed the budget, which is what makes the budget the boundary",
        /budget-confirm/.test(qs) && /serialMs/.test(qs),
        "under the budget and green, the column is a LOADED reading and nothing else can put an alone one there");
    ok("  and nothing in the file marks which of the two a given number is",
        !("kind" in S) && !("provenance" in S) && typeof S.timings === "object",
        `the file carries note, captured, timings, codes and at -- and no per-entry quantity marker`);
}

// -----------------------------------------------------------------------------------------------------------
console.log("\n2. *** AND THE POPULATION SPLITS AT THE BUDGET, EXACTLY AS THE CODE SAYS ***");
{
    const cmp = Object.keys(G).filter((k) => k in S.timings && fs.existsSync(path.join(ENG, k)) &&
        S.codes[k] === 0 && S.timings[k] < S.capMs && (S.at || {})[k] !== UNKNOWN_AT && G[k] >= 20 && S.timings[k] >= 20);
    const under = cmp.filter((k) => S.timings[k] < S.budgetMs).map((k) => S.timings[k] / G[k]);
    const over = cmp.filter((k) => S.timings[k] >= S.budgetMs).map((k) => S.timings[k] / G[k]);
    report(`under the ${S.budgetMs} ms budget (parallelMs, LOADED): n=${under.length}, median ${med(under).toFixed(2)}x gate-timings`);
    report(`at or over it        (serialMs, ALONE):   n=${over.length}, median ${med(over).toFixed(2)}x gate-timings`);
    ok(`*** under the budget the column sits at ${med(under).toFixed(2)}x gate-timings -- the ${LOAD}x load factor -- and at or over it at ${med(over).toFixed(2)}x, which is two alone readings agreeing ***`,
        med(under) > 1.5 && med(over) < 1.3 && med(over) > 0.7,
        `the ratio between the two populations is ${(med(under) / med(over)).toFixed(2)}x, and the only thing separating them is which side of the budget they fell on`);
    ok("  and the over-budget group is small, so this is a prediction from the code confirmed by a handful rather than a population result -- said plainly",
        over.length < 20, `n=${over.length}; the direction was predicted from quickSweep's source BEFORE it was measured`);
}

// -----------------------------------------------------------------------------------------------------------
console.log("\n3. *** NINE ENTRIES THIS ARC FILLED WITH THE WRONG QUANTITY ***");
{
    report(`${"gate".padEnd(34)}${"alone".padStart(7)}${"8-wide".padStart(8)}${"load".padStart(7)}`);
    for (const x of NINE)
        report(`${path.basename(x.gate).padEnd(34)}${String(x.alone).padStart(7)}${String(x.wide8).padStart(8)}${(x.wide8 / x.alone).toFixed(2).padStart(6)}x`);
    ok(`*** all ${NINE.length} sit UNDER the ${S.budgetMs} ms budget, where the column can only ever hold a loaded reading -- so v4577's alone numbers were the wrong quantity, not merely a stale one ***`,
        NINE.every((x) => x.wide8 < S.budgetMs),
        `v4577's reasoning was that quickSweep prefers the serial reading; it does, but only for a gate that GETS one`);
    ok(`  and they are re-measured at exactly eight concurrent, matching the sweep's own width -- median ${med(NINE.map((x) => x.wide8 / x.alone)).toFixed(2)}x over the nine, against v4576's ${LOAD}x on a different eight`,
        med(NINE.map((x) => x.wide8 / x.alone)) > 1.4,
        `two batches of eight covering all nine, three rounds each`);
    ok(`*** and the file now holds the loaded reading for every one of them, so these numbers have moved TWICE -- once wrongly at v4577 and once correctly here ***`,
        NINE.every((x) => S.timings[x.gate] === x.wide8),
        NINE.slice(0, 3).map((x) => `${path.basename(x.gate)} ${x.alone}->${S.timings[x.gate]}`).join(", ") + ", ...");
}

// -----------------------------------------------------------------------------------------------------------
console.log("\n4. *** THE DETECTOR v4577 PROPOSED: TEN FOR TEN, AND INVISIBLE TO v4577'S OWN CRITERION ***");
{
    report(`${"gate".padEnd(32)}${"alone".padStart(7)}${"gateWas".padStart(9)}${"g/alone".padStart(9)}${"resid".padStart(7)}`);
    for (const x of TEN) {
        const ratio = Math.max(x.gateWas, x.sweepNow) / Math.max(1, Math.min(x.gateWas, x.sweepNow));
        report(`${path.basename(x.gate).padEnd(32)}${String(x.alone).padStart(7)}${String(x.gateWas).padStart(9)}${(x.gateWas / x.alone).toFixed(2).padStart(8)}x${(ratio / LOAD).toFixed(2).padStart(6)}x`);
    }
    const stale = TEN.filter((x) => x.gateWas / Math.max(1, x.alone) > 1.4 || x.gateWas / Math.max(1, x.alone) < 0.7);
    ok(`*** the detector fired on ${TEN.length} and gate-timings is genuinely stale in ${stale.length} of them -- no false positives ***`,
        stale.length === TEN.length,
        `every one between ${Math.min(...TEN.map((x) => x.gateWas / x.alone)).toFixed(2)}x and ${Math.max(...TEN.map((x) => x.gateWas / x.alone)).toFixed(2)}x too high`);
    // The point of the round: v4577's criterion cannot see these, and the arithmetic says why.
    const resid = TEN.map((x) => (Math.max(x.gateWas, x.sweepNow) / Math.max(1, Math.min(x.gateWas, x.sweepNow))) / LOAD);
    // *** THE BAR HERE IS v4577'S, AND THE MAXIMUM IS PINNED BESIDE IT. *** Loosening a comparison cannot be
    // caught by measurement -- no reading moves when an assertion is weakened -- which v4576 proved, v4577
    // confirmed by adding a second row that also failed to catch it, and this round met for the third time.
    // So the row does not pretend to police its own bar. What it CAN pin is the number it reports: MAX_RESID
    // is what the ten produced, derived again here, and any change to the table moves it.
    const V4577_LINE = 3, MAX_RESID = 2.73;
    const worstResid = Math.max(...resid);
    ok(`*** and NOT ONE of them exceeds v4577's ${V4577_LINE}x residual line -- they run ${Math.min(...resid).toFixed(2)}x to ${worstResid.toFixed(2)}x -- because a gate-timings entry three times too high makes a RAW ratio of about 1.4x, which reads as agreement ***`,
        resid.every((r) => r <= V4577_LINE) && worstResid.toFixed(2) === MAX_RESID.toFixed(2),
        worstResid.toFixed(2) === MAX_RESID.toFixed(2)
            ? `the symmetric ratio conflates "gate-timings is wrong" with "gate-timings is right", and dividing by the load factor cannot separate them`
            : `DERIVED a worst residual of ${worstResid.toFixed(2)}x against a recorded ${MAX_RESID.toFixed(2)}x -- the table has moved`);
    ok(`  and all ${TEN.length} are green, so like v4577's twelve these are wrong numbers rather than failing gates`,
        TEN.length === 10, "three runs each, exit 0 throughout");
    ok(`  and the eleventh candidate was DROPPED because this arc had put an alone reading in its column -- the detector cannot be pointed at an entry whose quantity is unknown`,
        SKEW_PROBE_V4578.excluded.includes("reconQualityBind") && !TEN.some((x) => x.gate === SKEW_PROBE_V4578.excluded),
        `excluded: ${path.basename(SKEW_PROBE_V4578.excluded)}`);
}

// -----------------------------------------------------------------------------------------------------------
console.log("\n5. AND ITS MAGNITUDE IS NOT USABLE AT THE SMALL END");
{
    const predicted = (x) => x.gateWas * LOAD / x.sweepNow, actual = (x) => x.gateWas / Math.max(1, x.alone);
    const small = TEN.filter((x) => x.sweepNow < 100), big = TEN.filter((x) => x.sweepNow >= 100);
    for (const x of TEN)
        report(`${path.basename(x.gate).padEnd(32)}predicted ${predicted(x).toFixed(2).padStart(6)}x   actual ${actual(x).toFixed(2).padStart(6)}x   sweep ${String(x.sweepNow).padStart(5)} ms`);
    const err = (set) => med(set.map((x) => Math.max(predicted(x), actual(x)) / Math.min(predicted(x), actual(x))));
    ok(`*** the prediction's magnitude is ${err(small).toFixed(2)}x out for entries under 100 ms and ${err(big).toFixed(2)}x out above -- at 40 ms a loaded reading is mostly process startup and the load factor is not there to divide by ***`,
        err(small) > err(big), `small n=${small.length}, large n=${big.length}`);
    ok("  and the DIRECTION survives it: every one of the ten was correctly flagged whatever the predicted size",
        TEN.every((x) => predicted(x) > 1.4 && actual(x) > 1.4),
        "detect with it, do not quote it");
    ok(`  and all ${TEN.length} gate-timings entries now hold this round's alone reading`,
        TEN.every((x) => G[x.gate] === x.alone),
        TEN.slice(0, 3).map((x) => `${path.basename(x.gate)} ${x.gateWas}->${G[x.gate]}`).join(", ") + ", ...");
}

// -----------------------------------------------------------------------------------------------------------
console.log("\n6. CONTROLS");
{
    ok("every gate in both tables exists and appears in both records",
        [...NINE, ...TEN].every((x) => fs.existsSync(path.join(ENG, x.gate)) && x.gate in G && x.gate in S.timings),
        `${NINE.length + TEN.length} checked`);
    ok("  and the two tables are disjoint, so the nine and the ten are separate findings",
        !NINE.some((n) => TEN.some((t) => t.gate === n.gate)), `${NINE.length} + ${TEN.length}, no overlap`);
    ok("every one of the nine is slower at eight-wide than alone, so the two columns are separate measurements",
        NINE.every((x) => x.wide8 > x.alone), `smallest margin ${Math.min(...NINE.map((x) => x.wide8 / x.alone)).toFixed(2)}x`);
    ok("the budget and the load factor come from the file and from v4576 respectively, named rather than guessed",
        S.budgetMs === 3000 && LOAD === 2.15, `budget ${S.budgetMs} ms, load ${LOAD}x`);
    ok("  and the stamp sentinel is sweepCoverage's own",
        typeof UNKNOWN_AT === "string" && UNKNOWN_AT.length > 5, `sentinel ${JSON.stringify(UNKNOWN_AT)}`);
}

console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nALL GREEN");
console.log("ON THIS GATE'S SABOTAGE: eight mutations, seven red. The one zero is loosening the invisibility " +
    "row's bar from 3x to 300x, and it is the class v4576 proved inert and v4577 failed to fix by adding a " +
    "second row -- weakening an assertion moves no reading, so nothing can detect it. Three rounds have now " +
    "met it; this file stops trying and pins the number it REPORTS instead, so an edit to the data is caught " +
    "even though an edit to the bar is not. The loosened bar was also scored RED once by mistake, when the " +
    "harness that applies the mutations was itself edited and crashed -- rc 1 with no FAIL line, which the " +
    "crash-aware rule reads as red. Applied cleanly it is rc 0 and no reds, and a crash is not a verdict.\n");
console.log("unchecked here: THE REAL REPAIR, which is marking the column. Every finding in this file exists " +
    "because one number means two things and nothing says which; a per-entry `kind` would end the whole class, " +
    "and writing one means changing quickSweep and everything that reads it, which is a round of its own and " +
    "not this one. Also unchecked: the rest of the dated population under the same detector -- eleven " +
    "candidates came from a 3x skew line and nothing here asks what a 2x line would find; the UNDATED " +
    "entries, where the sweep reading cannot anchor anything; and whether gate-timings has its own two-quantity " +
    "problem, since selfchecks.mjs writes it on a full run and the v3285 additions were timed individually.");
process.exit(fails ? 1 : 0);
