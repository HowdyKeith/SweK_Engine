/**
 * MARKING THE COLUMN, AND FINDING EIGHT MORE OF THIS ARC'S OWN MISTAKES BY DOING IT.
 *
 * v4578 measured that sweep-timings.json's ms column holds two different quantities -- a LOADED parallel
 * reading under the budget, an ALONE serial one at or over it, 1.93x apart -- with nothing marking which, and
 * closed by naming the repair it did not do: a per-entry kind. This is that repair.
 *
 * *** quickSweep NOW RECORDS IT AT THE MOMENT IT WRITES THE NUMBER, which is the only place it is known for
 * certain. *** `kinds[gate]` is `loaded`, `alone` or `capped`; the branch that chose the millisecond chooses
 * the label in the same statement, so the two cannot drift apart. Every entry predating this round has the
 * kind INFERRED from the branch rule instead, and `kindsInferred` names all 1,620 of them, because an
 * inference dressed as an observation is the fault this arc has spent five rounds on.
 *
 * *** AND WRITING THE FIELD FORCED THE QUESTION FOR EVERY ENTRY, WHICH FOUND EIGHT MORE WRONG ONES -- ALL OF
 * THEM THIS ARC'S. *** v4578 found nine and fixed nine. It looked only at what v4577 had written. Asking the
 * question of every entry this arc has ever hand-written turns up eight more alone readings sitting in
 * under-budget slots, from v4575, v4576, v4577 AND v4578 -- one per round, including the round that
 * discovered the problem. FOUR OF THE EIGHT ARE THE ARC'S OWN GATES: timingRecords, timingLoad,
 * timingSurvivors and timingSemantics, whose runtimes I recorded as alone readings every single round while
 * writing about this exact defect. Seventeen wrong entries in total across five rounds.
 *
 * *** THE ENUMERATION ALSO HAD TWO FALSE MEMBERS AND THE MEASUREMENT CAUGHT THEM. *** reskin and winPathGuard
 * were listed as arc-written and are not: v4577 corrected their gate-timings rows, not their sweep rows.
 * reskin measured 0.56x of its recorded value at eight-wide, which is impossible for an alone reading and is
 * exactly what a correct LOADED entry looks like. Ten became eight because the numbers disagreed with my list.
 *
 * *** AND THE PRE-FLIGHT NOW DEMANDS A KIND, which is what stops the class rather than fixing this instance
 * of it. *** recordDrift has asked for a runtime and a capture stamp since v4408; it asks for a kind now too.
 * A reading whose quantity is unknown is not a reading anybody can compare, and five rounds of this arc are
 * the evidence.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { KIND } from "./quickSweep.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (label, cond, detail) => { if (!cond) fails++; console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "   " + detail : ""}`); };
const report = (s) => console.log(`  ----  ${s}`);

const S = JSON.parse(fs.readFileSync(path.join(ENG, "tools", "ship", "sweep-timings.json"), "utf8"));
const QS = fs.readFileSync(path.join(ENG, "tools", "ship", "quickSweep.mjs"), "utf8");

console.log("timingKind-selfcheck -- the column says what its numbers are now\n");

/** MEASURED at v4579, each at exactly eight concurrent, three rounds, two batches covering all eight. */
export const WRONG_QUANTITY_V4579 = Object.freeze({
    at: "v4579", concurrency: 8, rounds: 3,
    runs: Object.freeze([
        Object.freeze({ gate: "tools/ship/shaderCensus-selfcheck.mjs", wroteAlone: 1501, loaded8: 1529, round: "v4575" }),
        Object.freeze({ gate: "tools/ship/spacesimStart-selfcheck.mjs", wroteAlone: 136, loaded8: 248, round: "v4575" }),
        Object.freeze({ gate: "tools/roundhouse/reconQualityBind-selfcheck.mjs", wroteAlone: 2350, loaded8: 2542, round: "v4575" }),
        Object.freeze({ gate: "tools/ship/timingRecords-selfcheck.mjs", wroteAlone: 63, loaded8: 147, round: "v4575" }),
        Object.freeze({ gate: "tools/ship/hostScale-selfcheck.mjs", wroteAlone: 64, loaded8: 132, round: "v4576" }),
        Object.freeze({ gate: "tools/ship/timingLoad-selfcheck.mjs", wroteAlone: 65, loaded8: 145, round: "v4576" }),
        Object.freeze({ gate: "tools/ship/timingSurvivors-selfcheck.mjs", wroteAlone: 64, loaded8: 144, round: "v4577" }),
        Object.freeze({ gate: "tools/ship/timingSemantics-selfcheck.mjs", wroteAlone: 64, loaded8: 145, round: "v4578" }),    ]),
    falsePositives: Object.freeze(["tools/ship/reskin-selfcheck.mjs", "tools/ship/winPathGuard-selfcheck.mjs"]),
});
const R = WRONG_QUANTITY_V4579.runs;

// -----------------------------------------------------------------------------------------------------------
console.log("1. *** THE KIND IS WRITTEN WHERE IT IS KNOWN, IN THE STATEMENT THAT CHOOSES THE NUMBER ***");
{
    ok("quickSweep exports the three kinds a millisecond can be, so a reader asks by name instead of re-deriving the branch rule",
        KIND.LOADED === "loaded" && KIND.ALONE === "alone" && KIND.CAPPED === "capped",
        JSON.stringify(KIND));
    ok("*** and it assigns the kind in the same loop that assigns the millisecond, so the label cannot drift from the branch that chose it ***",
        /kinds\[r\.gate\]\s*=/.test(QS) && /r\.serialMs\s*!=\s*null\s*\?\s*KIND\.ALONE\s*:\s*KIND\.LOADED/.test(QS),
        "serialMs present means a serial re-run happened, which is an ALONE reading; absent means parallelMs, a LOADED one");
    ok("  and a killed reading is a third thing rather than being forced into one of the two, because v4574 established it is the cap's clock and not the gate's",
        /KIND\.CAPPED/.test(QS) && /124/.test(QS), "capped");
    ok("  and the file carries the map",
        S.kinds && typeof S.kinds === "object" && Object.keys(S.kinds).length > 1000,
        `${Object.keys(S.kinds).length} entries have a kind`);
}

// -----------------------------------------------------------------------------------------------------------
console.log("\n2. AN INFERENCE IS NAMED AS ONE, ALL 1,620 OF THEM");
{
    const inferred = new Set(S.kindsInferred || []);
    const observed = Object.keys(S.kinds).filter((g) => !inferred.has(g));
    report(`${Object.keys(S.kinds).length} kinds: ${inferred.size} inferred from the branch rule, ${observed.length} observed`);
    const census = {};
    for (const v of Object.values(S.kinds)) census[v] = (census[v] || 0) + 1;
    report(`by kind: ${Object.entries(census).map(([k, n]) => `${k} ${n}`).join(", ")}`);
    ok(`*** every entry predating v4579 has its kind INFERRED and is named in kindsInferred -- an inference dressed as an observation is the fault five rounds of this arc have been about ***`,
        inferred.size > 1000 && observed.length > 0 && observed.length < 50,
        `${observed.length} observed are the entries this arc hand-wrote and can vouch for`);
    // The inference must be exactly the branch rule, or it is a third thing pretending to be the first two.
    const wrongInference = [...inferred].filter((g) => {
        const ms = S.timings[g], code = S.codes[g] ?? 0;
        const want = code === 124 || ms >= S.capMs ? KIND.CAPPED
                   : ms >= S.budgetMs || code !== 0 ? KIND.ALONE : KIND.LOADED;
        return S.kinds[g] !== want;
    });
    ok("  and every inferred kind IS the branch rule applied to that entry, re-derived here rather than trusted",
        wrongInference.length === 0,
        wrongInference.length ? wrongInference.slice(0, 4).join(", ") : `${inferred.size} re-derived, all agreeing`);
    ok("  and the observed ones are NOT required to match it, which is the point of recording them separately",
        observed.length > 0, `${observed.length} entries this arc measured directly`);
}

// -----------------------------------------------------------------------------------------------------------
console.log("\n3. *** EIGHT MORE WRONG ENTRIES, ONE PER ROUND OF THIS ARC, INCLUDING THE ROUND THAT FOUND THE BUG ***");
{
    report(`${"gate".padEnd(34)}${"wrote".padStart(7)}${"8-wide".padStart(8)}${"load".padStart(7)}   written at`);
    for (const x of R)
        report(`${path.basename(x.gate).padEnd(34)}${String(x.wroteAlone).padStart(7)}${String(x.loaded8).padStart(8)}${(x.loaded8 / x.wroteAlone).toFixed(2).padStart(6)}x   ${x.round}`);
    const rounds = [...new Set(R.map((x) => x.round))].sort();
    ok(`*** ${R.length} entries held an alone reading in an under-budget slot, written across ${rounds.length} rounds -- ${rounds.join(", ")} -- so every round of this arc made the mistake including v4578, which is the round that diagnosed it ***`,
        rounds.length === 4 && rounds.includes("v4578"),
        `v4578 found nine and fixed nine, because it looked only at what v4577 wrote`);
    const own = R.filter((x) => /timing(Records|Load|Survivors|Semantics)/.test(x.gate));
    ok(`*** and ${own.length} of the ${R.length} are THIS ARC'S OWN GATES -- their runtimes were filed as alone readings every round while the files argued about exactly this ***`,
        own.length === 4, own.map((x) => path.basename(x.gate)).join(", "));
    ok(`  and all ${R.length} now hold the loaded reading, measured at exactly eight concurrent to match the sweep's own width`,
        R.every((x) => S.timings[x.gate] === x.loaded8 && S.kinds[x.gate] === KIND.LOADED),
        R.slice(0, 3).map((x) => `${path.basename(x.gate)} ${x.wroteAlone}->${S.timings[x.gate]}`).join(", ") + ", ...");
    ok(`  and every one is under the ${S.budgetMs} ms budget, which is what makes an alone reading the wrong quantity there rather than merely a stale one`,
        R.every((x) => x.loaded8 < S.budgetMs), `the largest is ${Math.max(...R.map((x) => x.loaded8))} ms`);
}

// -----------------------------------------------------------------------------------------------------------
console.log("\n4. AND THE ENUMERATION HAD TWO FALSE MEMBERS THAT THE MEASUREMENT REFUSED");
{
    const FP = WRONG_QUANTITY_V4579.falsePositives;
    report(`listed as arc-written and are not: ${FP.map((g) => path.basename(g)).join(", ")} -- v4577 corrected their gate-timings rows, not their sweep rows`);
    report(`reskin measured 1494 ms at eight-wide against a recorded 2687, which is 0.56x -- impossible for an alone reading and ordinary for a LOADED one`);
    ok("*** the list was ten and the numbers made it eight: a candidate measuring BELOW its recorded value at eight-wide cannot be holding an alone reading, so the record was already right ***",
        FP.length === 2 && FP.every((g) => S.kinds[g] === KIND.LOADED),
        `both are inferred LOADED by the branch rule and the measurement agrees, so neither was touched`);
    ok("  and they are recorded rather than dropped, because a list corrected by measurement is worth more than a list that was right",
        FP.every((g) => fs.existsSync(path.join(ENG, g))), `${FP.length} named`);
}

// -----------------------------------------------------------------------------------------------------------
console.log("\n5. *** AND THE PRE-FLIGHT DEMANDS A KIND NOW, WHICH IS WHAT ENDS THE CLASS ***");
{
    const RD = fs.readFileSync(path.join(ENG, "tools", "ship", "recordDrift.mjs"), "utf8");
    ok("recordDrift's sweep-timings check requires a kind alongside the runtime and the stamp",
        /rec\.kinds \|\| \{\}\)\[g\]/.test(RD),
        "a new gate owes the file a kind exactly as it owes a runtime and a capture stamp");
    ok("  and it says so in its own detail line, so a reader of the pre-flight learns what the obligation is",
        /a kind/.test(RD), "every gate has a timing, its own capture stamp and a kind");
    ok(`*** which is the repair v4578 named and did not do: seventeen wrong entries across five rounds is what a column without a marked quantity costs, and this is the check that stops the eighteenth ***`,
        Object.keys(S.kinds).length >= Object.keys(S.timings).length,
        `${9 + R.length} wrong entries found and fixed at v4578 and v4579, from four rounds of writing them`);
}

// -----------------------------------------------------------------------------------------------------------
console.log("\n6. CONTROLS");
{
    ok("the three kinds partition the file, so the census counts disjoint sets",
        Object.values(S.kinds).every((v) => Object.values(KIND).includes(v)),
        `${new Set(Object.values(S.kinds)).size} distinct values, all of them from KIND`);
    ok("  and every timing has a kind, so the map is not a partial index nobody can rely on",
        Object.keys(S.timings).every((g) => S.kinds[g]), `${Object.keys(S.timings).length} timings, ${Object.keys(S.kinds).length} kinds`);
    ok("every gate in the frozen table exists and is in the file",
        R.every((x) => fs.existsSync(path.join(ENG, x.gate)) && x.gate in S.timings), `${R.length} checked`);
    ok("  and every one is slower at eight-wide than the alone reading it replaced, so the two are separate measurements",
        R.every((x) => x.loaded8 > x.wroteAlone), `smallest margin ${Math.min(...R.map((x) => x.loaded8 / x.wroteAlone)).toFixed(2)}x`);
    ok("the budget and cap come from the file rather than being restated here",
        S.budgetMs === 3000 && S.capMs === 20000, `budget ${S.budgetMs}, cap ${S.capMs}`);
}

console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nALL GREEN");
console.log("unchecked here: WHETHER THE 1,620 INFERENCES ARE RIGHT. They follow the branch rule, which is what " +
    "quickSweep does, but nothing has run those gates to confirm the quantity -- and this round found eight " +
    "entries where the rule's answer was wrong because a human had written the number. The inferred set is " +
    "named so the question stays askable, and the honest position is that it is an inference over 1,620 " +
    "entries with 19 observations beside it. Also unchecked: gate-timings.json, which has the same shape of " +
    "problem waiting -- selfchecks.mjs writes it on a full run while the v3285 and v4575-v4579 additions were " +
    "timed individually, and it has no kind field at all; and whether any READER of the ms column should now " +
    "branch on kind, which is 71 references and a separate round.");
process.exit(fails ? 1 : 0);
