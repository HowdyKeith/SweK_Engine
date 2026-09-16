// WebGLEngine/tools/ship/budgetProvenance-selfcheck.mjs -- v4581
//
// Run: node tools/ship/budgetProvenance-selfcheck.mjs
// RUNTIME 84 ms ALONE (median of 105/84/74) and 132 ms AT EIGHT-WIDE (median of 117/121/132/143/145, exactly
// eight concurrent). Both, per v4580: one number without saying which of the two it is was five rounds of this arc.
//
// *** THE TABLE EVERY BUDGET IN THE TREE RESTS ON HAD FOUR KEYS WRITTEN TWICE, AND NOTHING PARSES IT. ***
//
// gateBudget.MEASURED is the curated slow tail: 62 gates whose real cost exceeds the general default, each with
// the measurement it came from written beside it in prose. tools/ship/hostScale.mjs chose it over
// gate-timings.json as the denominator for every rig budget, on the grounds that its numbers "were all obtained
// the same way" -- a sentence I wrote into hostScale-selfcheck at v4580 without measuring it. This round
// measured it.
//
// FOUR DUPLICATED KEYS. configContract, compose, assumptionMap and census each appeared twice in one object
// literal. A repeated key is not an error in JavaScript; the later one silently wins. Three re-stated the same
// number and were harmless. *** configContract RE-STATED A DIFFERENT ONE -- 78000 at one site and 72509 three
// hundred lines later -- so one typed budget was discarded with no trace, and the SMALLER reading was in force
// against the first site's own written rule: *** "the larger of the two readings is used -- a budget derived from
// the faster of two measurements is a budget that fails on the slower one." The duplicate inverted that rule
// silently, and nothing could see it, because no check in this tree had ever read the table as text.
//
// AND THE ENTRY WAS WRONG BY TWENTY-FOUR TIMES EITHER WAY. Measured here: 2997 / 2856 / 3473 ms, three runs
// alone, all exit 0, all checks passing, no skip. Both recorded readings are ~24x the gate's cost;
// hostScale-selfcheck has REPORTED it as the table's worst under-record for rounds and reporting is where it
// stopped. *** SO THE CONSERVATIVE RULE POINTED THE WRONG WAY: *** "take the larger" protects against a fast
// sample when both readings are current, and entrenches the staler one when they are not -- the accident was less
// wrong than the rule. The entry is removed, not corrected, and its first sentence had always said so: "IT NEVER
// NEEDED A BIGGER BUDGET AT ALL".
//
// THE GATE THAT GUARDS THE TABLE ASSERTED PROVENANCE AND CHECKED ARITHMETIC IT DEFINES ITSELF.
// gateBudget-selfcheck's row read `budgetFor(k) === MEASURED[k] * TAIL_HEADROOM` under the sentence "every named
// budget is derived from a recorded completion, not a guess". budgetFor's body IS that expression, so the clause
// could not fail for any entry, whatever the number was -- and the sentence is false for 50 of 62 rows, which
// have no recorded runs at all. Same shape as v4580's hostScale row: a claim about a property, pinned to
// something that cannot contradict it. Repaired in place; section 4 holds the proof.
//
// SABOTAGE: 17 mutations, 17 red, no 0-RED, nothing crashed -- after a first pass that produced FOUR 0-REDs, every
// one of them a defect in this gate rather than a gap in the tree. What the mutations break: a duplicate key
// re-planted in MEASURED at the same value and at a different one; a duplicate planted in MEASURED_RUNS, the nested
// table; the detector's brace matching walked off the end; the nested-row depth guard removed; configContract
// re-added; its gate-timings entry put back to the 4946 ms it superseded and its kind back to a runner sample; the
// frozen duplicate record trimmed; the frozen re-measure edited so nothing is an order out; the tautology restored
// in gateBudget-selfcheck as live code; that gate's ratchet baseline raised; slowestRun made to return the FASTEST
// run; one derived entry's `slowestRun(...)` spelling replaced by the literal it currently equals; and v4580's
// withdrawn claim put back into hostScale-selfcheck.
//
// *** THE FOUR 0-REDS, BECAUSE THEY ARE THE ROUND'S BEST FINDINGS ABOUT ITSELF: ***
//   - Removing the nested-row depth guard changed nothing, TWICE. The key regex is anchored at `^\s*` and the
//     first fixture put its fields mid-line, so the guard was never reached; quoting them was not enough either.
//     The fixture now writes each nested field on its own line, as gateBudget.mjs does. Two wrong fixtures before
//     one that drives the code: "I quoted the keys" was reasoning, and a control has to be shown failing.
//   - Re-adding v4580's withdrawn claim moved nothing, because that row used sourceScan.codeOnly, which EMPTIES
//     every string literal -- and the claim lives in a detail string. Section 4 asks about a condition and needs
//     strings gone; section 5 asks about prose the gate prints and needs them kept.
//   - gateBudget-selfcheck's own ratchet baseline could be raised from 50 to 60 with nothing anywhere noticing.
//     The gate that owns a bar is the one place that cannot see it widened, so the honesty check lives here.
//   - And one was the HARNESS being wrong, not the tree: it scored each mutation against one chosen gate and
//     reported "the tautology restored" as a 0-RED. gateBudget-selfcheck cannot detect its own tautology -- that
//     is the entire finding -- and this gate catches it. It now scores every mutation against both.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { noComments, codeHas } from "./sourceScan.mjs";
import { MEASURED, MEASURED_RUNS, UNRESOLVED, TAIL_HEADROOM, DEFAULT_BUDGET_MS, budgetFor } from "./gateBudget.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENG = path.resolve(HERE, "..", "..");
let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const say = (l, n = "") => console.log(`  ----  ${l}${n ? "   " + n : ""}`);

const GB_SRC = fs.readFileSync(path.join(HERE, "gateBudget.mjs"), "utf8");
const GB_GATE = fs.readFileSync(path.join(HERE, "gateBudget-selfcheck.mjs"), "utf8");
const G = JSON.parse(fs.readFileSync(path.join(HERE, "gate-timings.json"), "utf8"));
const S = JSON.parse(fs.readFileSync(path.join(HERE, "sweep-timings.json"), "utf8"));

/**
 * Every key of one object literal, WITH REPEATS, read from source.
 *
 * This is the whole instrument the table never had. `Object.keys(MEASURED)` cannot see a duplicate -- the engine
 * has already collapsed it -- so the only way to find one is to read the text. Brace-matched from the marker's
 * first `{` so a nested object (MEASURED_RUNS' rows) cannot end the scan early, and the depth check is what
 * sabotage C attacks.
 */
export function literalKeys(src, marker) {
    const at = src.indexOf(marker);
    if (at < 0) return null;
    const open = src.indexOf("{", at);
    let depth = 0, end = -1;
    for (let i = open; i < src.length; i++) {
        if (src[i] === "{") depth++;
        else if (src[i] === "}") { depth--; if (depth === 0) { end = i; break; } }
    }
    if (end < 0) return null;
    const keys = [];
    // TOP-LEVEL KEYS ONLY: a key inside a nested row (`runs:`, `{ ms, code }`) is not a table entry, and counting
    // one would make every MEASURED_RUNS row look like a duplicate of its own fields.
    let d = 0;
    for (const line of src.slice(open, end).split("\n")) {
        const before = d;
        for (const ch of line) { if (ch === "{") d++; else if (ch === "}") d--; }
        const m = line.match(/^\s*"([^"]+)":/);
        if (m && before === 1) keys.push(m[1]);
    }
    return keys;
}

const dupsOf = (keys) => {
    const seen = new Map();
    for (const k of keys) seen.set(k, (seen.get(k) || 0) + 1);
    return [...seen].filter(([, n]) => n > 1).map(([k, n]) => `${k} x${n}`);
};

console.log("budgetProvenance-selfcheck -- the denominator every budget rests on, read as text\n");

// ---------------------------------------------------------------------------
console.log("1. *** NO KEY IS WRITTEN TWICE IN ANY OF THE THREE TABLES ***");
{
    const tables = [["MEASURED", "export const MEASURED = {"],
                    ["MEASURED_RUNS", "export const MEASURED_RUNS = Object.freeze({"],
                    ["UNRESOLVED", "export const UNRESOLVED = {"]];
    const found = [];
    for (const [name, marker] of tables) {
        const keys = literalKeys(GB_SRC, marker);
        const dup = keys ? dupsOf(keys) : ["(table not found)"];
        say(`${name.padEnd(14)} rows in source ${String(keys ? keys.length : 0).padStart(4)}`,
            dup.length ? "DUPLICATES: " + dup.join(", ") : "no repeats");
        if (dup.length) found.push(`${name}: ${dup.join(", ")}`);
    }
    ok("*** the three tables are free of repeated keys, read from the TEXT and not from the object ***",
        found.length === 0,
        found.length ? found.join(" | ")
                     : "Object.keys() cannot answer this: the engine collapses a duplicate before any check " +
                       "sees it, so the only instrument is the source. That is why four repeats survived here " +
                       "for hundreds of versions while twenty rows of gateBudget-selfcheck ran over the table.");

    // AND THE SOURCE AND THE OBJECT AGREE ON THE COUNT, which is the same statement from the other side: a
    // difference between them IS a duplicate, without needing to know which key it was.
    const srcCount = literalKeys(GB_SRC, "export const MEASURED = {").length;
    ok("...and the row count in the text equals the key count in the object",
        srcCount === Object.keys(MEASURED).length,
        `${srcCount} rows of text, ${Object.keys(MEASURED).length} live keys. Before v4581 this read 66 against ` +
        "62, and the gap was the whole defect: four budgets typed, four discarded, no error anywhere.");
}

// ---------------------------------------------------------------------------
console.log("\n2. *** WHAT THE FOUR DUPLICATES WERE, AND WHICH ONE MATTERED ***");
{
    // FROZEN: read out of gateBudget.mjs at v4581 before the repair, by the detector above.
    const DUPES_V4581 = Object.freeze([
        { gate: "tools/roundhouse/compose-selfcheck.mjs", values: [109896, 109896] },
        { gate: "tools/roundhouse/assumptionMap-selfcheck.mjs", values: [333639, 333639] },
        { gate: "tools/roundhouse/census-selfcheck.mjs", values: [761728, 761728] },
        { gate: "tools/roundhouse/configContract-selfcheck.mjs", values: [78000, 72509] },
    ]);
    const disagreeing = DUPES_V4581.filter((d) => d.values[0] !== d.values[1]);
    for (const d of DUPES_V4581)
        say(d.gate.split("/").pop().padEnd(34), d.values.join(" and ") + (d.values[0] === d.values[1] ? "  (same)" : "  *** DIFFERENT ***"));

    ok("*** exactly one of the four held two different numbers, and the LATER, SMALLER one was in force ***",
        disagreeing.length === 1 && disagreeing[0].values[1] < disagreeing[0].values[0],
        "a later key wins in an object literal, so 72509 was the budget and 78000 was dead text that read as " +
        "authoritative. THE THREE HARMLESS ONES ARE WHY IT SURVIVED: a duplicate that changes nothing is a " +
        "duplicate nobody has a reason to find, and it is the same latent defect as the one that does.");

    // *** THE SITE THAT LOST STATES THE RULE THAT WOULD HAVE PREVENTED IT. *** Read from the file, not quoted
    // from memory -- v4580's finding was a module citing a number the file no longer held.
    const ruleIsWritten = GB_SRC.includes("the larger of the two readings is used");
    ok("...and the rule it violated is written in the very entry that lost, three hundred lines up",
        ruleIsWritten,
        '"the larger of the two readings is used -- a budget derived from the faster of two measurements is a ' +
        'budget that fails on the slower one." THE TABLE SAID IT AND THE LANGUAGE OVERRULED IT, quietly, because ' +
        "a rule stated in prose is enforced by whoever happens to read it.");
}

// ---------------------------------------------------------------------------
console.log("\n3. *** AND THE DETECTOR IS DRIVEN ON A PLANTED DUPLICATE, BECAUSE THE REAL TABLE HAS NONE LEFT ***");
{
    // The first draft of section 1 was the whole of this round's mechanical claim, and it proves nothing on its
    // own: after the repair the table is clean, so a detector that always returned [] would pass it. A control
    // that cannot fail is decoration, and an absence read as a measurement is this arc's oldest fault.
    const FIXTURE = [
        "export const FAKE = {",
        '    "a/one-selfcheck.mjs": 100,',
        '    "a/two-selfcheck.mjs": 200,',
        '    "a/one-selfcheck.mjs": 300,',
        "};",
    ].join("\n");
    const planted = dupsOf(literalKeys(FIXTURE, "export const FAKE = {"));
    ok("*** a duplicate planted in a fixture is found, and named with its count ***",
        planted.length === 1 && planted[0] === "a/one-selfcheck.mjs x2",
        JSON.stringify(planted) + " -- three rows, two distinct keys. Without this row section 1 would pass on a " +
        "detector that never looks at anything.");

    // AND THE NESTING, which is what makes MEASURED_RUNS readable at all: its rows are objects with their own
    // `runs:` and `{ ms, code }` keys, and a scanner that counted those would report every row as a duplicate of
    // its neighbours' fields. Driven on a nested fixture rather than asserted.
    // *** AND THE FIRST FIXTURE HERE PASSED FOR THE WRONG REASON, WHICH A SABOTAGE FOUND. ***
    //
    // It spelled the nested fields the way gateBudget.mjs does -- `observedHere: true`, unquoted -- and the key
    // regex only matches QUOTED keys, so those fields were never candidates and the depth guard was doing nothing.
    // Removing the guard entirely changed no result: a 0-RED sabotage. The fixture now quotes them, which is legal
    // JavaScript and the shape a future row could easily take -- AND IT STILL DID NOT EXERCISE THE GUARD, because
    // the key regex is anchored at `^\s*` and every field sat mid-line. The fixture now puts each nested field on
    // ITS OWN LINE, which is how gateBudget.mjs actually writes MEASURED_RUNS. Two wrong fixtures before one that
    // drives the code: a control has to be shown failing, and "I quoted the keys" was reasoning, not evidence.
    //
    // BOTH REASONS ARE STATED because the row depends on both: the real tables' fields are unquoted AND the depth
    // guard excludes them anyway. A row resting on one reason while claiming the other is how this happened.
    const NESTED = [
        "export const NEST = Object.freeze({",
        '    "a/one-selfcheck.mjs": Object.freeze({',
        '        "observedHere": true,',
        '        "at": "v1",',
        "    }),",
        '    "a/two-selfcheck.mjs": Object.freeze({',
        '        "observedHere": true,',
        '        "at": "v1",',
        "    }),",
        "});",
    ].join("\n");
    const nestedKeys = literalKeys(NESTED, "export const NEST = Object.freeze({");
    ok("...and a nested row's own fields are not mistaken for table entries, even when they are quoted",
        nestedKeys.length === 2 && nestedKeys.every((k) => k.endsWith("-selfcheck.mjs")),
        JSON.stringify(nestedKeys) + " -- `observedHere`, `at` and `runs` are fields of a row, not rows. Without " +
        "the depth guard this fixture yields 8 keys and reports `observedHere` as a duplicate: MEASURED_RUNS would " +
        "read as a mess of repeats and the scanner would be ignored, which is worse than no scanner.");

    // The real table, checked with the instrument the fixtures just validated.
    ok("...so the clean result on the real table is a measurement rather than an absence",
        dupsOf(literalKeys(GB_SRC, "export const MEASURED = {")).length === 0,
        "same function, same call, a file that had four repeats this morning");
}

// ---------------------------------------------------------------------------
console.log("\n4. *** THE GATE GUARDING THE TABLE CHECKED budgetFor AGAINST budgetFor'S OWN BODY ***");
{
    // Read budgetFor's body out of the module and show the retired clause was a restatement of it. Anchored in
    // the source so this section cannot be reasoning about a function that has since changed.
    const body = (GB_SRC.match(/export function budgetFor\(rel\) \{[\s\S]*?\n\}/) || [""])[0];
    const bodyExpr = /return m \? m \* TAIL_HEADROOM : DEFAULT_BUDGET_MS;/.test(body);
    say("budgetFor's body", body.split("\n").filter((l) => /return/.test(l)).join(" ").trim());
    ok("budgetFor returns MEASURED[k] * TAIL_HEADROOM by construction, read from its own source",
        bodyExpr,
        "so `budgetFor(k) === MEASURED[k] * TAIL_HEADROOM` is not a check of anything -- it is the definition, " +
        "restated as an assertion. It passed for every entry in the table including the one that was 24x wrong.");

    // *** codeOnly, AND IT TOOK THREE INSTRUMENTS TO ASK ONE QUESTION HONESTLY. *** Checking the ABSENCE of a
    // retired clause against the raw file finds it in the comment that records its retirement -- so the gate would
    // demand the history be deleted to go green, the one trade this tree refuses. v4580 hit that and fixed it with
    // noComments. Both anchor rows here hit it again on the first run, and noComments was STILL not enough for this
    // one: the retired expression also appears inside gateBudget-selfcheck's own DETAIL STRING, where the new row
    // explains what it replaced. sourceScan.codeHas strips comments AND string literals, which is the instrument
    // this question actually needs, and it already existed. A lesson applied at one site is not a lesson learned.
    const retired = codeHas(GB_GATE, /budgetFor\(k\) === MEASURED\[k\] \* TAIL_HEADROOM/);
    // *** AND THE RATCHET NEXT TO IT COULD BE LOOSENED WITH NOTHING WATCHING, WHICH A SABOTAGE FOUND. ***
    // gateBudget-selfcheck now counts the entries with no recorded runs against a frozen baseline of 50. Raising
    // that baseline to 60 moved NOTHING: the gate holding the ratchet cannot see its own bar being widened, and
    // widening a bar to absorb an arrival is this tree's most repeated defect. gateQuality-selfcheck solved this
    // years ago for its prose debt -- "the baseline is honest: it matches what is actually there" -- so the same
    // rule is applied here from OUTSIDE the gate that holds it.
    const baselineInGate = Number((GB_GATE.match(/BARE_BASELINE_V4581 = (\d+)/) || [])[1]);
    const bareNow = Object.keys(MEASURED).filter((k) => !MEASURED_RUNS[k]).length;
    ok("...and that gate's bare-runs baseline is HONEST -- it equals what is actually there, checked from outside it",
        baselineInGate === bareNow,
        `baseline ${baselineInGate}, derived ${bareNow}. A ratchet whose bar can be raised to meet an arrival is a ` +
        "ratchet holding nothing (v3195), and the gate that owns the bar is the one place that cannot notice. When " +
        "this row goes red the answer is to find what was added, never to re-freeze the number.");
    const branchChecked = /budgetFor\(outsider\) === DEFAULT_BUDGET_MS/.test(GB_GATE);
    ok("*** and the tautology is gone from gateBudget-selfcheck, replaced by a BRANCH check that can fail ***",
        !retired && branchChecked,
        "a gate in the table must not receive the default and a gate outside it must receive exactly the " +
        "default. That breaks when the lookup key stops matching -- the separator bug hostScale spent v3941 on " +
        "-- which is a real failure mode, where the arithmetic was not one.");

    // *** AND THE FIRST DRAFT OF THE NEXT ROW WAS THE SAME TAUTOLOGY THIS SECTION IS ABOUT. ***
    //
    // It read `MEASURED[k] === slowestRun(k)`. The table's derived rows ARE spelled `slowestRun("...")`, so that
    // compares the function to itself and passes whatever the runs say -- written into the gate that exists to
    // report exactly this, one screen below the paragraph describing it. gateBudget-selfcheck got this right and
    // has since v4526: it re-implements the maximum locally as `maxOf(row.runs)`. Copied from there.
    //
    // TWO CLAUSES, EACH WITH A FAILURE MODE. The local maximum catches slowestRun being wrong (make it return the
    // MINIMUM and MEASURED holds a min while this holds a max). The spelling catches the value being detached from
    // its evidence -- a literal typed over `slowestRun("...")` would still equal the max on the day it was typed
    // and would then sit there while the runs changed underneath it, which is how the other 50 rows came to be.
    const derived = Object.keys(MEASURED_RUNS);
    const localMax = (k) => MEASURED_RUNS[k].runs.reduce((m, r) => (r.ms > m ? r.ms : m), 0);
    const MEASURED_BLOCK = GB_SRC.slice(GB_SRC.indexOf("export const MEASURED = {"));
    const spelledDerived = derived.filter((k) => new RegExp('"' + k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") +
                                                            '":\\s*slowestRun\\(').test(MEASURED_BLOCK));
    ok("...and the twelve entries that do carry runs are each the SLOWEST of them, computed here from the runs",
        derived.length === 12 && derived.every((k) => MEASURED[k] === localMax(k)) &&
        derived.every((k) => MEASURED_RUNS[k].runs.every((r) => r.code === 0)),
        `${derived.length} rows, ${derived.reduce((n, k) => n + MEASURED_RUNS[k].runs.length, 0)} recorded runs, ` +
        "every one a completion. The maximum is re-implemented in this file rather than read back through " +
        "slowestRun, because comparing a table to the function that built it is not a check.");
    ok("...and every one of them is SPELLED as the call, so the value cannot be detached from its evidence",
        spelledDerived.length === derived.length,
        `${spelledDerived.length} of ${derived.length} written as \`slowestRun("...")\` in the table text. A ` +
        "literal typed in its place would agree on the day it was typed and drift silently after -- which is the " +
        "difference between these twelve rows and the fifty that are bare numbers.");
}

// ---------------------------------------------------------------------------
console.log("\n5. THE SENTENCE THAT WAS FALSE, AND THE COUNT THAT MAKES IT FALSE");
{
    const names = Object.keys(MEASURED);
    const bare = names.filter((k) => !MEASURED_RUNS[k]);
    const notHere = Object.keys(MEASURED_RUNS).filter((k) => MEASURED_RUNS[k].observedHere === false);
    say("MEASURED entries / with recorded runs / with none", `${names.length} / ${names.length - bare.length} / ${bare.length}`);
    say("and of those with runs, recorded on ANOTHER machine", String(notHere.length));

    ok("*** most of this table cannot say how its number was obtained ***",
        bare.length > names.length / 2 && bare.length === 50,
        `${bare.length} of ${names.length}. "Every named budget is derived from a recorded completion, not a guess" ` +
        "was the sentence over the retired row; it is true of twelve. The prose beside each entry often names a " +
        "round and a stopwatch, and prose is not a field -- no check can read it, which is the whole lesson of " +
        "v4580 arriving one table over.");

    ok("...and three of the twelve say outright that they were NOT observed here",
        notHere.length === 3,
        notHere.map((k) => k.split("/").pop()).join(", ") + " carry observedHere:false. So even the provenanced " +
        "twelve are not 'all obtained the same way' -- a row-level flag cannot describe a row whose runs came " +
        "from different machines, which is the same shape as gate-timings' one timestamp for 1289 entries.");

    // *** THE CLAIM I WROTE AT v4580 AND DID NOT MEASURE. ***
    const HS = fs.readFileSync(path.join(HERE, "hostScale-selfcheck.mjs"), "utf8");
    // *** noComments HERE AND codeHas IN SECTION 4, AND A SABOTAGE IS WHY. *** The withdrawn claim lived in a
    // DETAIL STRING, not in a condition, so the right instrument keeps strings and drops comments. This row was
    // briefly written with codeOnly for symmetry with section 4 -- and sourceScan.codeOnly empties every string
    // literal, so re-adding the claim to the live detail text moved nothing at all: a 0-RED sabotage, caught by
    // running the mutation rather than by reading the row. Section 4 asks about a CONDITION and needs strings gone;
    // this asks about PROSE THE GATE PRINTS and needs them kept. One file, two questions, opposite instruments.
    ok("*** and v4580's stated reason for preferring this table is withdrawn where it was written ***",
        !noComments(HS).includes("all obtained the same way") &&
        HS.includes("AND THE REASON v4580 GAVE FOR PREFERRING MEASURED WAS NOT CHECKED, AND IS WRONG"),
        "I wrote \"the denominator stays MEASURED because its numbers were all obtained the same way\" into " +
        "hostScale-selfcheck one round ago, in the row that exists to name unprovenanced records, and did not " +
        "check it. Corrected at the site rather than noted here, so the next reader of that row is not misled by " +
        "it while a different file holds the correction.");
}

// ---------------------------------------------------------------------------
console.log("\n6. *** WHAT THE TABLE'S NUMBERS ACTUALLY MEASURE UP TO, WHICH IS BETTER THAN THE PROSE GAP SUGGESTS ***");
{
    // The round found a bad process and must not imply a bad table. Compared against the two independent records,
    // taking the LARGER of them as the observation: a sweep reading only counts when it is a real one (exit 0,
    // under the cap), per v4574.
    const rows = [];
    for (const k of Object.keys(MEASURED)) {
        const g = G.timings[k];
        const s = (S.codes[k] === 0 && S.timings[k] < S.capMs) ? S.timings[k] : null;
        const obs = [g, s].filter((v) => typeof v === "number");
        if (obs.length) rows.push({ k, m: MEASURED[k], obs: Math.max(...obs), ratio: MEASURED[k] / Math.max(...obs) });
    }
    rows.sort((a, b) => b.ratio - a.ratio);
    const band = (lo, hi) => rows.filter((r) => r.ratio >= lo && r.ratio < hi).length;
    say("entries with an independent observation", `${rows.length} of ${Object.keys(MEASURED).length}`);
    for (const [lo, hi, n] of [[10, Infinity, "10x or more"], [3, 10, "3x - 10x"], [1.5, 3, "1.5x - 3x"],
                               [0.7, 1.5, "within 1.5x"], [0, 0.7, "MEASURED is LOWER"]])
        say("  " + n.padEnd(18), String(band(lo, hi)).padStart(4));
    say("worst remaining", `${rows[0].ratio.toFixed(1)}x  ${rows[0].k.split("/").pop()} (${rows[0].m} against ${rows[0].obs})`);

    ok("*** no entry is more than about 3x its observed cost now, and NONE is lower ***",
        band(10, Infinity) === 0 && band(0, 0.7) === 0 && rows[0].ratio < 3.2,
        "the 12.6x outlier was configContract and it is gone. NONE LOWER IS THE HALF THAT MATTERS FOR SAFETY: a " +
        "budget under the gate's real cost manufactures a timeout, and a budget over it only wastes patience. " +
        "MEASURED is a slowest-of-runs and the records are single readings, so entries sitting somewhat high is " +
        "the rule working, not drift.");

    ok("...so the round's finding is about the PROCESS, not the numbers, and says which",
        band(0.7, 1.5) >= 40 && Object.keys(MEASURED_RUNS).length === 12,
        `${band(0.7, 1.5)} of ${rows.length} within 1.5x. Four repeated keys, one 24x entry and a tautological ` +
        "guard are all real; 'the table is rotten' would not have survived being measured, and this row is what " +
        "stops the round claiming it.");
}

// ---------------------------------------------------------------------------
console.log("\n7. configContract, REMOVED RATHER THAN CORRECTED, AND WHY THAT DIRECTION");
{
    // FROZEN: three runs alone on this box at v4581, date +%s%3N either side.
    const REMEASURE_V4581 = Object.freeze({ runs: [2997, 2856, 3473], median: 2997, code: 0 });
    const gate = "tools/roundhouse/configContract-selfcheck.mjs";
    const wasLarger = 78000, wasSmaller = 72509;
    const ratio = wasLarger / REMEASURE_V4581.median;
    say("re-measured alone", `${REMEASURE_V4581.runs.join(" / ")} ms, median ${REMEASURE_V4581.median}`);
    say("was recorded at", `${wasLarger} and ${wasSmaller} -- ${ratio.toFixed(0)}x and ${(wasSmaller / REMEASURE_V4581.median).toFixed(0)}x the median`);

    ok("*** both recorded readings were about 24x the gate's real cost ***",
        Math.round(ratio) === 26 || Math.round(ratio) === 25 || Math.round(ratio) === 24,
        `${ratio.toFixed(1)}x. Two independent readings agreeing with each other and both wrong by the same ` +
        "order is what a stale pair looks like -- AGREEMENT BETWEEN TWO OLD NUMBERS IS NOT EVIDENCE, which is " +
        "exactly what the original note took it for ('two independent runs agreeing within a few seconds').");

    ok("...and it is out of the table, so it takes the general default -- a RAISE, not a tightening",
        !(gate in MEASURED) && budgetFor(gate) === DEFAULT_BUDGET_MS,
        `${budgetFor(gate)} ms against the 145,018 it had. Correcting it in place to 3473 x ${TAIL_HEADROOM} would ` +
        "have given 6,946 ms to a gate observed at 5,769 ms under load: the tightening that manufactures a " +
        "timeout out of a check that is fine. THE TABLE IS THE SLOW TAIL AND A 3 s GATE IS THE POPULATION.");

    ok("...and the measurement outlives the entry, in the record built for it",
        G.timings[gate] === REMEASURE_V4581.median && G.kinds[gate] === "median of 3 alone" && G.boxes[gate],
        `gate-timings holds ${G.timings[gate]} ms as '${G.kinds[gate]}'. v4580 added that kind for a hand median; ` +
        "this is the first entry written with it deliberately rather than to correct a cold sample.");

    ok("...and the entry's own first sentence had said it was unnecessary from the day it was written",
        GB_SRC.includes("IT NEVER NEEDED A BIGGER BUDGET AT ALL"),
        "preserved verbatim in the removal note. The reason it stayed is that nothing re-reads a table it " +
        "believes is working -- and no instrument existed that could have disagreed with it.");
}

console.log(fails ? `\nbudgetProvenance-selfcheck: ${fails} FAILED` : "\nbudgetProvenance-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
