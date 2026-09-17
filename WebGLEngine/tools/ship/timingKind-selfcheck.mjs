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
    // *** v4582 -- THREE BECAME FOUR, AND THE FOURTH ANSWERS A DIFFERENT QUESTION FROM THE OTHER THREE. ***
    // LOADED, ALONE and CAPPED all say under what conditions the number was taken. SKIPPED says the gate DECLINED
    // TO RUN, so the number measures a refusal -- three entries were filed as ordinary loaded readings at 234,
    // 164 and 175 ms while their gates printed "SKIPPED". The count is asserted, not just the spellings: a fifth
    // member arriving unnoticed is how a reader comes to switch on a value it has never seen.
    ok("quickSweep exports the four kinds a millisecond can be, so a reader asks by name instead of re-deriving the branch rule",
        KIND.LOADED === "loaded" && KIND.ALONE === "alone" && KIND.CAPPED === "capped" &&
        KIND.SKIPPED === "skipped" && Object.keys(KIND).length === 4,
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
    // *** v4637 -- `observed.length < 50` WAS THE SIZE OF ONE ROUND'S HAND-WORK, ASSERTED AS A PROPERTY. ***
    // It was written when the only observations in the file came from this arc driving the writer over a
    // handful of gates. A 1,287-gate rotation then swept the tree and observed 1,287 kinds, exactly as it is
    // supposed to, and the row went red for the machinery working -- the same count-standing-in-for-a-property
    // shape this arc has now found eight times.
    //
    // THE PROPERTY IS MEMBERSHIP, AND IT IS CHECKABLE BOTH WAYS. An entry is out of the list exactly when the
    // run that took its millisecond recorded a kind beside it. The file names that run: `captured`. So every
    // entry carrying the capture stamp must be observed, and every observed entry must either carry it or be
    // one of the few this arc hand-measured and can name. Neither side depends on how many gates a sweep ran.
    const swept = Object.keys(S.timings).filter((g) => (S.at || {})[g] === S.captured);
    const sweptButInferred = swept.filter((g) => inferred.has(g));
    const observedElsewhere = observed.filter((g) => (S.at || {})[g] !== S.captured);
    // *** v4641 -- AND `observedElsewhere.length < 50` IS THE SAME DEFECT THE PARAGRAPH ABOVE SAYS IT FIXED. ***
    // v4637 replaced `observed.length < 50` because a count had been standing in for a property; it wrote
    // `observedElsewhere.length < 50` one line down -- THE SAME MAGIC FIFTY, ONE VARIABLE OVER. The row then
    // went red for the ritual doing what the ritual says to do: step 3b rotates the over-budget pool, the
    // rotation observes those gates' kinds and stamps them with its OWN time, the quick sweep that follows
    // re-times only the under-budget gates, so every rotated gate becomes "observed with a different stamp".
    // 42 gates rotated took the count from under fifty to fifty-one and the gate said the bookkeeping was
    // wrong. It was not: the file was exactly right and the threshold was the size of a habit.
    //
    // THE PROPERTY IS MEMBERSHIP, AND THE COMMENT ABOVE ALREADY SAYS SO -- "or be one of the few this arc
    // hand-measured AND CAN NAME". So they are named. An observed entry is legitimate when the run that took
    // its millisecond watched it, and there are exactly two such runs: the quick sweep (S.captured) and the
    // ROTATION, whose own ledger records every gate it re-timed. 48 of the 51 are in that ledger. The three
    // that are not are named below, and a fourth arriving is a red -- which is what a threshold of fifty
    // could never say, in either direction.
    const ROT = (() => { try { return JSON.parse(fs.readFileSync(path.join(ENG, "tools", "ship", "sweep-rotation.json"), "utf8")); }
                         catch { return null; } })();
    const rotated = new Set((ROT && ROT.rotated || []).map((r) => r && r.gate).filter(Boolean));
    // Measured at v4641, and each is an entry the rotation ledger does not carry: observed by a --gate run
    // whose row a later merge folded away, or by this arc's own hand-driving of the writer before the
    // rotation had a ledger at all. Named rather than counted, so growth is distinguishable from regression.
    const HAND_OBSERVED_V4641 = Object.freeze([
        "tools/ship/duplicateFiles-selfcheck.mjs",
        "tools/ship/exitBanner-selfcheck.mjs",
        "tools/ship/kernelReach-selfcheck.mjs",
    ]);
    // SABOTAGE v4641: one of the three names removed, so a real entry falls out of the accounted set --
    // 1 RED, by name, printing the gate it could not account for. The row it replaces would have passed
    // that mutation at any count below fifty, which is the argument for the shape rather than for the list.
    const unaccounted = observedElsewhere.filter((g) => !rotated.has(g) && !HAND_OBSERVED_V4641.includes(g));
    ok(`*** an entry's kind is INFERRED unless the run that took its millisecond watched it, and kindsInferred is exactly that set ***`,
        inferred.size > 0 && observed.length > 0 && sweptButInferred.length === 0 &&
        ROT !== null && rotated.size > 0 && unaccounted.length === 0,
        `${swept.length} entries carry the capture stamp and ${sweptButInferred.length} of them are still called inferred; ` +
        `${observedElsewhere.length} observed entries carry an earlier stamp -- ` +
        `${observedElsewhere.filter((g) => rotated.has(g)).length} of them are in the rotation's own ledger, ` +
        `${observedElsewhere.filter((g) => HAND_OBSERVED_V4641.includes(g)).length} are the named hand-observed few, ` +
        `and ${unaccounted.length} are unaccounted for` +
        (unaccounted.length ? ": " + unaccounted.join(", ") : "") +
        ". A COUNT here would go red for the rotation doing its job, which is exactly what it did at v4641.");
    // The inference must be exactly the branch rule, or it is a third thing pretending to be the first two.
    //
    // *** v4637 -- AND THE BRANCH RULE STOPPED ASKING WHETHER THE PROCESS FINISHED BY COMPARING A NUMBER TO
    // THE CAP. *** `ms >= capMs` is a proxy, and it is the proxy KILLED_PASS_V4568's own note records getting
    // wrong: "was this killed" answered by comparing a number to the cap instead of by the fact. `finished`
    // IS the fact and has been in the file since v4568. The proxy calls a gate CAPPED whenever its runtime
    // exceeds whatever cap the file was last swept at -- and after v4637 restored the killed pass's readings
    // that is SIXTY-SEVEN entries, every one of them code 0 with `finished` true, gates that ran 20 s to 90 s
    // to completion under a 90 s cap and are read as killed by a file whose cap now says 20,000. Where
    // nothing observed whether the process finished, the cap comparison is still the only thing available.
    const wrongInference = [...inferred].filter((g) => {
        const ms = S.timings[g], code = S.codes[g] ?? 0, fin = (S.finished || {})[g];
        const killed = fin === false || code === 124 || typeof code === "string";
        const want = killed ? KIND.CAPPED
                   : fin === undefined && ms >= S.capMs ? KIND.CAPPED
                   : ms >= S.budgetMs || code !== 0 ? KIND.ALONE : KIND.LOADED;
        return S.kinds[g] !== want;
    });
    ok("  and every inferred kind IS the branch rule applied to that entry, re-derived here rather than trusted",
        wrongInference.length === 0,
        wrongInference.length ? wrongInference.slice(0, 4).join(", ") : `${inferred.size} re-derived, all agreeing`);

    // *** v4582 -- AND A SKIP CANNOT BE INFERRED AT ALL, WHICH IS WHY IT NEEDED A WRITER. ***
    //
    // The branch rule above reads a millisecond and an exit code. A skipping gate exits 0 in well under the
    // budget, so the rule can only ever call it LOADED -- the three that were mislabelled sat at 164-234 ms with
    // code 0 and looked exactly like fast passes. The evidence is the gate's own printed declaration, which
    // quickSweep discarded with `stdio: "ignore"` until v4582 kept a bounded tail. SO NO ENTRY MAY CARRY SKIPPED
    // BY INFERENCE: if one does, somebody has back-filled a label the data cannot support.
    const skippedGates = Object.keys(S.kinds).filter((g) => S.kinds[g] === KIND.SKIPPED);
    const inferredSkips = skippedGates.filter((g) => inferred.has(g));
    ok(`*** all ${skippedGates.length} skipped entries are OBSERVED, never inferred -- the branch rule cannot produce this kind ***`,
        skippedGates.length > 0 && inferredSkips.length === 0,
        skippedGates.map((g) => `${g.split("/").pop()} ${S.timings[g]}ms code ${S.codes[g] ?? 0}`).join(", ") +
        ". Each exits 0 under the budget, so ms-and-code says LOADED and only the gate's own output says otherwise." +
        (inferredSkips.length ? " BACK-FILLED: " + inferredSkips.join(", ") : ""));
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
    // *** v4637 -- THIS ROW FORBADE THE ROTATION FROM DOING ITS JOB. *** It required these eight entries to
    // still read the exact millisecond v4579 wrote AND to still carry LOADED. But a kind is a property of the
    // RUN that took the number, and two ordinary things write an ALONE reading on purpose: a gate that exits
    // non-zero gets a serial re-run, and sweepCoverage.rotation() re-times slow gates one at a time. Six of
    // the eight now read ALONE from a rotation sweep -- five of them at code 1, which is a gate that was red
    // when it was swept -- and the row called that a regression. The file is ENTITLED to move here.
    //
    // What stays frozen is what v4579 corrected and why: each of these held an ALONE reading in an
    // under-budget slot, where the quantity the column wants is the LOADED one. That claim is about a round,
    // so it is asserted from the table. What the file reads now is REPORTED, with the kind beside it, because
    // a reader should be able to see the drift without the row pretending the drift is a fault.
    report("what the file reads now: " + R.map((x) =>
        `${path.basename(x.gate)} ${S.timings[x.gate]}ms ${S.kinds[x.gate]}${(S.codes[x.gate] ?? 0) !== 0 ? " code " + S.codes[x.gate] : ""}`).join(", "));
    ok(`  and all ${R.length} were corrected AT v4579 from an alone reading to the eight-wide loaded one -- the table is the record of that round, not a requirement on every sweep since`,
        R.every((x) => x.loaded8 > x.wroteAlone && x.wroteAlone < S.budgetMs),
        `${R.filter((x) => S.kinds[x.gate] === KIND.LOADED).length} of ${R.length} still read LOADED; ` +
        `${R.filter((x) => S.kinds[x.gate] === KIND.ALONE).length} read ALONE, which is what a serial re-run or a ` +
        `rotation re-timing writes on purpose -- ${R.filter((x) => (S.codes[x.gate] ?? 0) !== 0).length} of those were red when swept`);
    ok(`  and every one is under the ${S.budgetMs} ms budget, which is what makes an alone reading the wrong quantity there rather than merely a stale one`,
        R.every((x) => x.loaded8 < S.budgetMs), `the largest is ${Math.max(...R.map((x) => x.loaded8))} ms`);
}

// -----------------------------------------------------------------------------------------------------------
console.log("\n4. AND THE ENUMERATION HAD TWO FALSE MEMBERS THAT THE MEASUREMENT REFUSED");
{
    const FP = WRONG_QUANTITY_V4579.falsePositives;
    report(`listed as arc-written and are not: ${FP.map((g) => path.basename(g)).join(", ")} -- v4577 corrected their gate-timings rows, not their sweep rows`);
    report(`reskin measured 1494 ms at eight-wide against a recorded 2687, which is 0.56x -- impossible for an alone reading and ordinary for a LOADED one`);
    // *** v4637 -- AND THE SAME CORRECTION HERE, FOR THE SAME REASON. *** Requiring these two to read LOADED
    // forever is requiring that no rotation ever re-time them; both now carry an ALONE reading from the sweep
    // that wrote this file, at code 0 and under budget. The finding is that v4579's MEASUREMENT refused them
    // -- 1494 ms at eight-wide against a recorded 2687 cannot be an alone reading -- and that is a fact about
    // the measurement, which is frozen here. Their current kind is reported.
    ok("*** the list was ten and the numbers made it eight: a candidate measuring BELOW its recorded value at eight-wide cannot be holding an alone reading, so the record was already right ***",
        FP.length === 2 && FP.every((g) => S.kinds[g] != null),
        `${FP.map((g) => `${path.basename(g)} ${S.timings[g]}ms ${S.kinds[g]}`).join(", ")} -- neither was touched by v4579, ` +
        "and a kind that has moved since is a later run recording what IT did, not this row's business");
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
