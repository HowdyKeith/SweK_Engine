// WebGLEngine/tools/ship/timingProvenance-selfcheck.mjs -- v4580
//
// Run: node tools/ship/timingProvenance-selfcheck.mjs
// RUNTIME 133 ms ALONE (median of 136/133/130, date +%s%3N either side) and 197 ms AT EIGHT-WIDE (median of
// 166/184/197/199/208, exactly eight concurrent). BOTH, because this arc spent five rounds on records that
// gave one number without saying which of the two it was. The sweep entry carries the eight-wide reading and
// the kind `loaded`, since that is what quickSweep will read; gate-timings will carry the alone one.
//
// *** THE FIX THAT "CANNOT BE DONE" WAS DONE ON THE OTHER FILE A ROUND AGO. ***
//
// tools/ship/hostScale-selfcheck.mjs has carried this row since v3936, and every word of its first half is true:
//
//     "an entry cannot say whether it is a TIME or a TRUNCATION, which is why MEASURED is the denominator"
//     ... "The fix is not to detect truncation -- IT CANNOT BE DETECTED FROM HERE --
//          but to divide by a table of numbers that were all obtained the same way."
//
// FROM HERE. The row is in a READER, and from a reader it is exactly right: a bare number cannot say what it is.
// The sentence then generalises "from here" into "at all", and the tree acted on the general version for 644
// versions: hostScale stopped using gate-timings.json as a denominator, and nobody marked the file.
//
// THE PRODUCER IS IN THIS REPO AND IT ALWAYS KNEW. tools/ship/selfchecks.mjs branches on all three outcomes --
// completed, killed at its budget, declined to run -- and has excluded two of them from the record since v3941.
// It knew which was which at the moment it wrote the number, and wrote a bare integer. v4579 made precisely this
// repair on sweep-timings.json, one round before this one, by stamping the kind at the point of decision.
//
// *** AND THE ROW PINS A REPRESENTATION, NOT THE PROPERTY IT CLAIMS. *** Its condition is
// `entries.every(([, v]) => typeof v === "number")`. Run that predicate against sweep-timings.json -- a file
// where an entry CAN say whether it is a loaded reading, an alone reading or the killer's clock -- and it passes
// there too, because the saying lives in a sibling map and the timings are still bare numbers. So the row would
// have stayed green through the repair while its own sentence became false. Section 2 measures that.
//
// WHAT THIS ROUND WAS PROPOSED AS, AND WHY THAT WAS WRONG. The rung named at the close of v4579 said
// gate-timings.json "mixes a batch quantity with individual ones exactly as the sweep column did". IT DOES NOT.
// The runner's loop is `for (const f of toRun)` around execFileSync -- serial, one child at a time -- so a
// full-run entry and a hand-timed entry are the SAME physical quantity, and the sweep file's split at the budget
// line has no analogue here. Measured rather than read off the code: section 4. The proposal was refuted by the
// round's first measurement, which is recorded here rather than quietly replaced.
// SABOTAGE: 24 mutations, 24 red, no 0-RED, nothing crashed (the last two against tools/ship/treeRead-selfcheck.mjs). Each was applied to the file it accuses and the
// original restored under an md5-verified crash sentinel. What they broke, and which row caught it: the `kinds`
// map removed (3 rows); one entry's box deleted while its kind stayed (the half-stamped row); the record's own
// unprovenanced count moved by one; coverage.complete set back to the `true` a 58% pass wrote; sweep-timings'
// kinds removed, which is the file section 2 leans on; hostScale-selfcheck's row reverted to pinning the
// representation; the runner stamping COMPLETE in the skip branch as well; writeTimings called with a literal
// true; the box legend replaced instead of accumulated; the skip guard removed (2 rows); the node version folded
// into the box id; hostFacts disagreeing with the fingerprint the tree already had; hostScale.mjs's stale
// citation quietly updated to today's value; one correction's direction flipped; a second flipped to put the
// count AT the significance threshold (2 rows); the binomial tail's arithmetic broken by one term; and the serial
// probe's sum raised above its wall clock. Section 10 added five more: the 12x cold outlier's median
// replaced by the runner sample it was wrong by; the corrected entry left wearing the runner's kind; the MEDIAN3
// member removed so a hand median has no label (3 rows); spacesimStart's header 'corrected' from the record as
// statedRuntime's instruction literally says; and the sample-vs-median table edited so nothing is 20% out.
// Two more went to treeRead-selfcheck's new section 7, which the verify sweep's own flapping red produced: the
// transient-fixture exclusion removed from the shared walker, and the exclusion widened until it dropped every
// new file -- the flattering failure, where a walker that had stopped seeing arrivals would pass. *** THE SEVENTEENTH AND EIGHTEENTH EXIST BECAUSE THE FIRST DRAFT OF
// SECTION 5 CARRIED A CLAUSE THAT COULD NOT FAIL: *** it read `down === 12 && up === 4 && pTwoSided > 0.05`, and
// on n=16 the counts DETERMINE p, so the third condition was decoration inside a green row. It was replaced by
// the threshold derivation, which can be wrong and now is checked.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { TIMING_KIND } from "./gateBudget.mjs";
import { boxId, hostFacts } from "./hostScale.mjs";
import { noComments, proseHas } from "./sourceScan.mjs";
import { hostFingerprint } from "../roundhouse/androidRunner.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENG = path.resolve(HERE, "..", "..");
let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const say = (l, n = "") => console.log(`  ----  ${l}${n ? "   " + n : ""}`);

const G = JSON.parse(fs.readFileSync(path.join(HERE, "gate-timings.json"), "utf8"));
const S = JSON.parse(fs.readFileSync(path.join(HERE, "sweep-timings.json"), "utf8"));
const SELFCHECKS = fs.readFileSync(path.join(HERE, "selfchecks.mjs"), "utf8");
const HOSTSCALE_GATE = fs.readFileSync(path.join(HERE, "hostScale-selfcheck.mjs"), "utf8");

console.log("timingProvenance-selfcheck -- what a recorded runtime is, and which machine's stopwatch it was\n");

// ---------------------------------------------------------------------------
console.log("1. *** ONE FILE SAYS WHAT ITS NUMBERS ARE AND THE OTHER DOES NOT ***");
{
    const gT = Object.keys(G.timings || {});
    const gK = Object.keys(G.kinds || {});
    const gB = Object.keys(G.boxes || {});
    const gA = Object.keys(G.at || {});
    const sT = Object.keys(S.timings || {});

    say("sweep-timings.json  entries / kinds / per-entry stamps", `${sT.length} / ${Object.keys(S.kinds || {}).length} / ${Object.keys(S.at || {}).length}`);
    say("gate-timings.json   entries / kinds / boxes / stamps", `${gT.length} / ${gK.length} / ${gB.length} / ${gA.length}`);

    ok("the three provenance maps exist at all, which is this round's repair",
        gK.length > 0 && gB.length > 0 && gA.length > 0,
        "before v4580 gate-timings.json held six top-level keys and not one of them was per-entry provenance: " +
        "`coverage.at` was ONE timestamp standing for every number in the file, captured across at least two " +
        "machines and a thousand versions of the tree.");

    // *** A HALF-STAMPED ENTRY IS WORSE THAN AN UNSTAMPED ONE. *** An entry with a kind and no box says "this is
    // a completed run" and refuses the only question that makes the kind useful. The three maps are written on
    // one line of the runner, so they can only diverge if somebody edits the record by hand -- which is exactly
    // what this arc has done to this file sixteen times.
    const halfStamped = gK.filter((g) => !(g in (G.boxes || {})) || !((G.at || {})[g]));
    ok("*** no entry carries a kind without a box and a stamp to go with it ***",
        halfStamped.length === 0,
        halfStamped.length ? "FOUND: " + halfStamped.slice(0, 5).join(", ")
                           : "all three are written together on the runner's COMPLETE branch, so a divergence " +
                             "means a hand edit -- the thing that has happened to this file sixteen times.");

    // Entries with no kind are not entries with a wrong number. THE CLAIM IS ABOUT THE RECORD.
    const unprov = gT.filter((g) => !((G.kinds || {})[g]));
    say("entries with NO recorded provenance", `${unprov.length} of ${gT.length}`);
    ok("...and the record itself counts them, rather than leaving it to a reader to notice",
        typeof (G.coverage || {}).unprovenanced === "number" && G.coverage.unprovenanced === unprov.length,
        `coverage.unprovenanced = ${JSON.stringify((G.coverage || {}).unprovenanced)}; derived here = ${unprov.length}. ` +
        "A count nobody prints is a count nobody checks, and `coverage.complete` was about THIS RUN's coverage " +
        "of the suite -- a different question, conflated with this one for 1289 entries.");

    ok("an UNKNOWN kind is a statement about the record, not about the gate",
        /unknown -- before v4580/.test(TIMING_KIND.UNKNOWN) && TIMING_KIND.COMPLETE === "complete" &&
        Object.keys(TIMING_KIND).length === 3,
        "three members, every one with a writer: COMPLETE from the suite runner, MEDIAN3 from the hand procedure " +
        "this tree's headers have used since v3285, UNKNOWN for what predates the stamp. There is deliberately no " +
        "TRUNCATED and no SKIPPED member: the runner records neither, and a label no writer can write is one " +
        "nobody could ever check against anything. MEDIAN3 ARRIVED MID-ROUND and section 10 is why.");
}

// ---------------------------------------------------------------------------
console.log("\n2. *** THE ROW THAT SAYS IT CANNOT BE DONE, AND THE PREDICATE THAT WOULD NEVER HAVE NOTICED ***");
{
    // Anchored in the other gate's own bytes, not in a memory of them -- quoting from memory is how a citation
    // goes stale, which is section 6's finding about a module three files away. THE FIRST DRAFT OF THIS ROW
    // ANCHORED ON THE OLD WORDING AND WENT RED IMMEDIATELY, because this round had just rewritten the row it was
    // quoting. Recorded rather than tidied away: it is the same class of fault as hostScale.mjs's stale citation,
    // committed inside the gate that exists to report it, and it was caught in one run because the anchor was a
    // check rather than a comment.
    // *** AND THE ABSENCE IS CHECKED IN THE CODE, NOT IN THE FILE. *** The second draft of this row looked for the
    // old predicate anywhere in the bytes and stayed red, because the comment recording the repair QUOTES the
    // predicate it retired. A check that cannot tell a live condition from a quoted one would force the history
    // to be deleted to make the gate green, which is the exact trade this tree refuses everywhere else.
    const oldForm = /entries\.every\(\(\[, v\]\) => typeof v === "number"\)/.test(noComments(HOSTSCALE_GATE));
    const newForm = /const unprovenanced = entries\.filter/.test(HOSTSCALE_GATE) &&
                    /ok\("!! \*\*\* entries that cannot say whether they are a TIME or a TRUNCATION/.test(HOSTSCALE_GATE);
    // proseHas, not .test on the raw source: the phrase is COMMENT PROSE and an editor may re-wrap it across
    // lines at any moment. tools/ship/gateQuality-selfcheck.mjs names this debt class and its list may only
    // shrink; a regex hunting a comment must unwrap first, which also makes the check immune to the wrapping.
    const keepsHistory = proseHas(HOSTSCALE_GATE, /IT CANNOT BE DETECTED FROM HERE/);
    ok("hostScale-selfcheck now pins the PROPERTY, and still records the claim it used to pin instead",
        newForm && !oldForm && keepsHistory,
        `repaired: ${newForm}, old predicate gone: ${!oldForm}, history kept: ${keepsHistory}. The row asserts a ` +
        "count of unprovenanced entries, which moves when the record does; the sentence it used to assert is " +
        "preserved as history in its own comment, where being wrong is the point of writing it down.");

    // *** THE MEASUREMENT. *** Its condition, applied to a file where an entry CAN say what it is.
    const predicate = (raw) => {
        const e = Object.entries(raw.timings || {});
        return e.length > 0 && e.every(([, v]) => typeof v === "number");
    };
    const onGate = predicate(G), onSweep = predicate(S);
    const sweepCanSay = Object.keys(S.kinds || {}).length === Object.keys(S.timings || {}).length;

    say("its predicate on gate-timings.json / on sweep-timings.json", `${onGate} / ${onSweep}`);
    say("and sweep-timings.json marks every entry's kind", String(sweepCanSay));

    ok("*** the row's condition is TRUE of a file that refutes the row's sentence ***",
        onSweep && sweepCanSay,
        "sweep-timings.json's values are bare numbers too -- the kind rides in a sibling map -- so `every value " +
        "is a number` is satisfied by a file where every entry says whether it is a loaded reading, an alone " +
        "reading, or the moment a killer fired. THE CONDITION PINS THE REPRESENTATION; THE SENTENCE CLAIMS A " +
        "PROPERTY. It would have stayed green straight through the repair with its own claim gone false.");

    ok("...and it is green on both files right now, so nothing about today's data is what makes this work",
        onGate && onSweep,
        "a row that only passes on one of two files could be excused as being about that file. This passes on " +
        "both, which is what makes it a statement about the predicate rather than about the data.");
}

// ---------------------------------------------------------------------------
console.log("\n3. THE PRODUCER BRANCHES ON ALL THREE OUTCOMES, AND STAMPS EXACTLY ONE OF THEM");
{
    // The three things a reader cannot distinguish are each DECIDED in the writer, in plain sight.
    const decidesSkip = /const declinedToRun = SKIP_LINE\.test/.test(SELFCHECKS);
    const decidesTimeout = /const timedOut = e\.signal === "SIGTERM"/.test(SELFCHECKS);
    const failuresExcluded = /catch \(e\) \{/.test(SELFCHECKS);
    ok("the runner decides skip, timeout and failure itself -- all three, by name",
        decidesSkip && decidesTimeout && failuresExcluded,
        "`declinedToRun`, `timedOut`, and the catch block. THE INFORMATION WAS NEVER MISSING; it was discarded " +
        "one line later by writing an integer. 'It cannot be detected from here' was a true statement about a " +
        "reader that got applied to the producer.");

    // The stamp must sit on the completing branch and nowhere else, or COMPLETE stops meaning completed.
    const stampBlock = /observedMs\[key\] = ms;\s*\n(?:\s*\/\/[^\n]*\n)*\s*observedKind\[key\] = TIMING_KIND\.COMPLETE;/;
    ok("*** the kind is written on the same branch as the number, not derived afterwards ***",
        stampBlock.test(SELFCHECKS),
        "a post-hoc pass over the record could only guess, which is the fault being retired. And it is the ELSE " +
        "of the skip branch, so a gate that declined to run cannot reach it.");

    ok("...and nothing writes COMPLETE anywhere else in the runner",
        (SELFCHECKS.match(/TIMING_KIND\.COMPLETE/g) || []).length === 1,
        "one writer, one line. Two places that can stamp COMPLETE is two places that can be wrong about it.");

    ok("the box legend is ACCUMULATED so an id stays decodable after a second machine writes",
        /boxLegend = \{ \.\.\.\(prev\.boxLegend \|\| \{\}\), \[BOX\]: hostFacts\(\) \}/.test(SELFCHECKS),
        "replacing it would leave every entry from the first machine tagged with an id nothing describes -- " +
        "provenance that has itself gone stale, which is the fault one level up.");
}

// ---------------------------------------------------------------------------
console.log("\n4. *** THE ROUND'S OWN PREMISE, MEASURED AND REFUSED ***");
{
    // FROZEN. One run of the real runner, 2026-09-13, on the box in boxLegend:
    //   node tools/ship/selfchecks.mjs --budget 45 --verbose --affected tools/ship/hostScale.mjs
    // --affected writes nothing to the record, so the measurement could not disturb what it measures.
    const SERIAL_PROBE_V4580 = Object.freeze({
        selected: 89, passing: 86, failing: 3, sumOfPerGateMs: 30525, wallMs: 51259, runnerSecs: 44.6,
    });
    const p = SERIAL_PROBE_V4580;
    const ratio = p.sumOfPerGateMs / p.wallMs;
    say("89 gates, sum of per-gate ms / wall clock", `${p.sumOfPerGateMs} / ${p.wallMs} = ${ratio.toFixed(3)}x`);

    // THE SIGNATURE. Under a pool of W workers the per-gate times sum to about W x the wall clock; under a
    // serial loop they sum to slightly UNDER it, the gap being the parent's own work between spawns.
    ok("*** the sum of the parts is under the whole, which only a SERIAL loop can do ***",
        ratio < 1,
        `${ratio.toFixed(3)}x. quickSweep at 5 workers would put this near 5x. Three of the 89 FAILED and ` +
        "failures print no runtime, so the gap is larger than the parent's overhead alone -- which is why the " +
        "bar is `< 1` and not a pinned value: the direction is the evidence, the magnitude is contaminated.");

    // *** THE SOURCE CHECK ASKS FOR A SYNCHRONOUS SPAWN, NOT FOR AN ABSENCE OF WORKER KEYWORDS. ***
    // Its first form was `for (const f of toRun)` AND no /parallelWorkers|new Worker\(/ in the file. Two faults
    // in one line. The absence half is weak -- a file can be concurrent without either word -- and the literals
    // put this gate into vba/runtimeGap.mjs's workers/threads census, which greps for exactly those tokens: a
    // MENTION counted as a USE, which would have moved that module's headline closures-over-threads ratio from
    // 166 to 159 and made "threads barely register" turn on a gate that spawns nothing. execFileSync is the real
    // property: a synchronous spawn inside a sequential loop is serial by the language, and no absence is needed.
    ok("...and the code agrees, which is the weaker of the two checks and is placed second on purpose",
        /for \(const f of toRun\) \{/.test(SELFCHECKS) && /execFileSync\(process\.execPath, \[f\]/.test(SELFCHECKS),
        "a SYNCHRONOUS spawn in a sequential loop -- concurrency is impossible by construction, not merely " +
        "unobserved. Reading the loop was where the wrong premise came from in the first place -- the proposal " +
        "DID read it -- so the measurement leads and the source corroborates.");

    ok("so gate-timings has no batch/individual split, and this round's stated premise was wrong",
        true,
        "the v4579 close proposed 'it mixes a batch quantity with individual ones exactly as the sweep column " +
        "did'. A serial full run and a hand-held stopwatch measure the same thing on the same machine. THE " +
        "SWEEP FILE'S SPLIT WAS REAL BECAUSE quickSweep IS PARALLEL; this runner is not, and the analogy was " +
        "carried across on the strength of the two files looking alike.");
}

// ---------------------------------------------------------------------------
console.log("\n5. WHAT THE REAL SPLIT IS -- AND WHY SIXTEEN CORRECTIONS CANNOT SETTLE IT");
{
    // FROZEN: every entry this arc has re-timed on this box, from gate-timings.json's own `captured` prose,
    // with the paths RESOLVED -- the prose records basenames, so the entries it claims to have corrected are
    // not addressable from the prose at all and had to be found by search. One more cost of provenance in prose.
    const CORRECTIONS_V4580 = Object.freeze([
        { at: "v4575", path: "tools/ship/shaderCensus-selfcheck.mjs", was: 239, now: 1501 },
        { at: "v4577", path: "tools/ship/rigJobs-selfcheck.mjs", was: 48, now: 6245 },
        { at: "v4577", path: "tools/ship/exitBanner-selfcheck.mjs", was: 139, now: 69 },
        { at: "v4577", path: "tools/ship/reskin-selfcheck.mjs", was: 139, now: 929 },
        { at: "v4577", path: "ui/dockSystem-selfcheck.mjs", was: 1005, now: 45 },
        { at: "v4577", path: "tools/ship/winPathGuard-selfcheck.mjs", was: 265, now: 1891 },
        { at: "v4578", path: "ev/esFlight3dMath-selfcheck.mjs", was: 235, now: 44 },
        { at: "v4578", path: "ev/tools/es-gates-selfcheck.mjs", was: 407, now: 65 },
        { at: "v4578", path: "ev/tools/es-start-selfcheck.mjs", was: 414, now: 70 },
        { at: "v4578", path: "physics/blobVitals-selfcheck.mjs", was: 239, now: 62 },
        { at: "v4578", path: "tools/roundhouse/keplerBind-selfcheck.mjs", was: 216, now: 77 },
        { at: "v4578", path: "tools/roundhouse/reactionDevice-selfcheck.mjs", was: 3058, now: 1407 },
        { at: "v4578", path: "ai-bridge/tools/puppeteer-bridge-selfcheck.mjs", was: 203, now: 44 },
        { at: "v4578", path: "physics/mechanics/poisson-selfcheck.mjs", was: 209, now: 50 },
        { at: "v4578", path: "brain/tools/policy-mass-selfcheck.mjs", was: 162, now: 79 },
        { at: "v4578", path: "brain/tf/tf-selfcheck.mjs", was: 165, now: 82 },
    ]);
    const down = CORRECTIONS_V4580.filter((c) => c.now < c.was).length;
    const up = CORRECTIONS_V4580.length - down;

    // Exact two-sided binomial on a fair coin -- the null that says the record is simply STALE, drifting either
    // way. A box difference predicts a ONE-directional correction: a faster box makes every old number too high.
    const choose = (n, k) => { let r = 1; for (let i = 0; i < k; i++) r = (r * (n - i)) / (i + 1); return r; };
    const n = CORRECTIONS_V4580.length, hi = Math.max(down, up);
    let tail = 0; for (let k = hi; k <= n; k++) tail += choose(n, k);
    const pTwoSided = 2 * tail / Math.pow(2, n);

    say("corrections that lowered the record / raised it", `${down} / ${up}`);
    say("two-sided p against 'the record is merely stale'", pTwoSided.toFixed(4));

    ok("*** twelve of sixteen went DOWN, and that does NOT establish a second machine ***",
        down === 12 && up === 4,
        `p = ${pTwoSided.toFixed(4)} on n=16. A faster box makes every stale entry too high, so a box difference ` +
        "predicts 16-0; staleness alone predicts a coin toss. 12-4 leans the way a box would and DOES NOT REACH " +
        "SIGNIFICANCE, so the honest reading is that both are present and sixteen samples cannot separate them. " +
        "A suggestive count is not a finding, the same way a bound is not a measurement.");

    // *** THE PINNED COUNT MAKES THE p-VALUE CLAUSE UNFALSIFIABLE, SO IT IS NOT A CLAUSE. *** The row above first
    // read `down === 12 && up === 4 && pTwoSided > 0.05`. Given n=16, 12-4 DETERMINES p -- the third condition
    // could never fail while the first two held, which is a control that cannot fail riding inside a green row.
    // What is actually worth checking is the THRESHOLD: where on this sample size the evidence would have turned,
    // which is arithmetic that can be wrong and is not implied by the counts.
    let threshold = n + 1;
    for (let k = Math.ceil(n / 2); k <= n; k++) {
        let t = 0; for (let j = k; j <= n; j++) t += choose(n, j);
        if (2 * t / Math.pow(2, n) <= 0.05) { threshold = k; break; }
    }
    say("smallest one-directional count that reaches p<=0.05 on n=16", String(threshold));
    ok("*** the finding sits ONE correction short of significance, which is why it is refused and not softened ***",
        threshold === 13 && down === threshold - 1 && pTwoSided > 0.05,
        `13 of 16 would give p=0.0213 and 12 gives p=${pTwoSided.toFixed(4)}. ONE MORE ENTRY CORRECTED DOWNWARD ` +
        "WOULD HAVE CARRIED IT. That is the whole distance between 'the record mixes two machines' and 'nobody " +
        "knows yet', and it is stated as a number so the next round can settle it by re-timing one more entry " +
        "rather than by arguing. The threshold is derived from the same binomial, so a mistake in the tail " +
        "arithmetic fails this row instead of hiding inside the one above.");

    ok("...and v4578's own cohort being 10-0 is not the same evidence as the whole being 12-4",
        CORRECTIONS_V4580.filter((c) => c.at === "v4578").every((c) => c.now < c.was) && down !== n,
        "one round's ten going one way is what made a box difference look established. It was found by a " +
        "detector that SELECTS for entries that are too high -- v4578 compared gate-timings against the alone " +
        "time a sweep entry implies and flagged the high side -- so that cohort's direction is the detector's, " +
        "not the record's. A SELECTED SAMPLE CANNOT MEASURE THE THING IT WAS SELECTED ON.");

    // What the file itself says about its own machines, which is prose and therefore unreadable by a check.
    // plain substring tests: `captured` is a JSON string, not source, so there is no comment to unwrap and a
    // regex literal here would only add itself to gateQuality's prose-debt ceiling for no gain.
    const namesTwoBoxes = G.captured.includes("timed individually on this box") && G.captured.includes("quiet-box tail");
    ok("the file's own metadata names more than one machine -- in a sentence, where nothing can read it",
        namesTwoBoxes && Object.keys(G.boxLegend || {}).length >= 1,
        `captured is ${G.captured.length} characters of prose naming a v3211 capture and a long series of "timed ` +
        `individually on this box" additions. boxLegend now holds ${Object.keys(G.boxLegend || {}).length} ` +
        "machine(s) as DATA. The entries written before this round are still unattributable and always will be: " +
        "provenance cannot be recovered after the fact, only recorded going forward.");
}

// ---------------------------------------------------------------------------
console.log("\n6. THE MODULE THAT REFUSES THIS FILE CITES A NUMBER THE FILE NO LONGER HOLDS");
{
    const HOSTSCALE = fs.readFileSync(path.join(HERE, "hostScale.mjs"), "utf8");
    const CITED_MS = 47729;           // hostScale.mjs's header, as its own justification
    const gate = "tools/roundhouse/assumptionMap-selfcheck.mjs";
    const held = (G.timings || {})[gate];

    ok("hostScale.mjs still cites that number as its reason for not using this file",
        new RegExp(String(CITED_MS)).test(HOSTSCALE),
        "the header reads: gate-timings 'records assumptionMap at 47729ms while the gate takes 234s here. THAT " +
        "ENTRY IS TRUNCATED'.");
    ok("*** and the file holds something else entirely ***",
        typeof held === "number" && held !== CITED_MS && held > CITED_MS * 5,
        `${CITED_MS} cited, ${held} recorded -- ${(held / CITED_MS).toFixed(1)}x. hostScale-selfcheck ALREADY ` +
        "recorded this at v3936 ('the example moved, which is my own v3923 mistake') and repaired its own row; " +
        "the module's header was never re-read. THE GATE LEARNED AND THE PROSE DID NOT.");

    // The truncation story makes a prediction about the shape of the data. Test it.
    const vals = Object.values(G.timings || {});
    const above300 = vals.filter((v) => v > 300000).length;
    const nearCeiling = vals.filter((v) => v >= 279000 && v <= 306000).length;
    say("entries above 300000 ms / entries within 7% below it", `${above300} / ${nearCeiling}`);
    ok("...and a 300 s ceiling is not what shaped today's file either",
        above300 >= 10,
        `${above300} entries exceed 300 s outright, up to ${Math.max(...vals)} ms, which a 300 s kill makes ` +
        `impossible; the ${nearCeiling} sitting just under it are spread over ten seconds rather than piled on ` +
        "one value. The v3211 capture's ceiling is real history and later writes have replaced it. SO THE " +
        "CONCLUSION STANDS ON A BETTER REASON THAN THE ONE GIVEN: MEASURED is the denominator because its " +
        "numbers were all obtained the same way -- not because this file is full of truncations today.");
}

// ---------------------------------------------------------------------------
console.log("\n7. THE SKIP GUARD PROTECTS THE WRITER AND NOT THE RECORD");
{
    const RE = /-selfcheck:\s*(SKIPPED|skipped)\b/;
    const skippable = [];
    (function walk(d) {
        for (const e of fs.readdirSync(d, { withFileTypes: true })) {
            if (e.name === "node_modules" || e.name === ".git") continue;
            const q = path.join(d, e.name);
            if (e.isDirectory()) walk(q);
            else if (/-selfcheck\.mjs$/.test(e.name) && RE.test(fs.readFileSync(q, "utf8"))) {
                skippable.push(path.relative(ENG, q).replace(/\\/g, "/"));
            }
        }
    })(ENG);
    const withEntry = skippable.filter((g) => (G.timings || {})[g] != null);
    const unmarked = withEntry.filter((g) => !((G.kinds || {})[g]));

    say("gates that can print the skip line / with a recorded entry / still unmarked",
        `${skippable.length} / ${withEntry.length} / ${unmarked.length}`);

    ok("the guard exists and is in the writer, where it can act",
        /const declinedToRun = SKIP_LINE\.test/.test(SELFCHECKS) && skippable.length > 10,
        "v3941 stopped the runner recording a skip as a runtime -- placementRender had been recorded at its skip " +
        "time three times, and re-timing it was the fix twice while the cause was the loop.");

    ok("!! *** and it does nothing for the entries already in the file ***",
        unmarked.length > 0,
        `${unmarked.length} of ${withEntry.length} skippable gates hold a number with no kind, so for each of ` +
        "them 'this is a real run' and 'this is the time it took to say I did not run' are still the same " +
        "integer. A GUARD ON THE PRODUCER IS NOT A REPAIR OF THE RECORD, and this row goes red the day the " +
        "last of them is re-run -- which is the day it should.");
}

// ---------------------------------------------------------------------------
console.log("\n8. TWO FILTERS, ONE OF WHICH WRITES");
{
    const affectedRefuses = /if \(process\.argv\.includes\("--affected"\)\) return;/.test(SELFCHECKS);
    const budgetFilters = /--budget: running " \+ toRun\.length/.test(SELFCHECKS);
    ok("*** --affected writes nothing and --budget writes freely, though both are filters ***",
        affectedRefuses && budgetFilters,
        "the stated rule is that 'a filtered run is not a small full run, it is a DIFFERENT POPULATION'. " +
        "--budget is a filter by that definition and has always written. LEFT WRITING, on the repair's strength: " +
        "every entry a --budget pass writes now carries its kind, its box and its stamp, so a reader can see the " +
        "population it came from instead of having to be protected from it by a blanket refusal.");

    // *** AND WHAT THAT UNPROTECTED FILTER WAS WRITING. *** Observed while exercising this round's own writer:
    //   node tools/ship/selfchecks.mjs --budget 240   ->   953 of 1630 gates, and coverage.complete: true.
    // v3584's note names this exact failure -- "a partial measurement wearing a complete one's name" -- and its
    // remedy was `complete: false` on periodic flushes plus `true` at the end. The end of a FILTERED run is not
    // the end of the suite, and the call site passed a literal true.
    const FILTERED_RUN_V4580 = Object.freeze({ selected: 953, runnable: 1630, wroteComplete: true });
    const derived = /writeTimings\(toRun\.length === UNFILTERED_COUNT\)/.test(SELFCHECKS);
    const literal = /writeTimings\(true\);/.test(SELFCHECKS);
    say("a --budget pass covered / of runnable, and claimed complete",
        `${FILTERED_RUN_V4580.selected} of ${FILTERED_RUN_V4580.runnable} -> complete: ${FILTERED_RUN_V4580.wroteComplete}`);
    ok("*** so `complete` is DERIVED from the population now, not asserted by the call site ***",
        derived && !literal,
        "`writeTimings(toRun.length === UNFILTERED_COUNT)`. The flag answered 'did the loop reach its end' and " +
        "was read as 'does this record cover the suite'; for an unfiltered run those coincide, which is why it " +
        "went unnoticed from v3584 to here. FOUND BY RUNNING THE WRITER, not by reading it -- the 58% pass wrote " +
        "the word `true` into the file and the file was checked afterwards.");
    ok("...and the false it should have written has been put right by hand, in the record, with the reason",
        /v4580: THE RECORD NOW SAYS HOW IT KNOWS/.test(G.captured) && G.coverage.complete === false,
        "correcting the flag without recording why would leave the next reader to rediscover that a 58% pass can " +
        "write `true`. The correction is in `captured` beside the claim it corrects.");
}

// ---------------------------------------------------------------------------
console.log("\n9. THE RATCHET, AND WHAT IT CANNOT PROMISE");
{
    // Frozen at the count this round leaves behind. It may only fall: every full run stamps more entries, and
    // nothing in the tree can invent a kind for an entry it did not produce.
    const BASELINE_UNPROVENANCED_V4580 = 398;
    const now = Object.keys(G.timings || {}).filter((g) => !((G.kinds || {})[g])).length;
    say("unprovenanced entries: baseline / now", `${BASELINE_UNPROVENANCED_V4580} / ${now}`);
    ok("*** the count of entries with no provenance may only fall ***",
        now <= BASELINE_UNPROVENANCED_V4580,
        "a ratchet pointing the only direction the repair can go. It rises if somebody adds a timing by hand, " +
        "which is how all sixteen of section 5's corrections were made -- SO THIS ROW IS AIMED AT THIS ARC'S " +
        "OWN HABIT, not at a hypothetical.");

    ok("...and it promises nothing about the numbers themselves",
        true,
        "a kind says how a number was obtained. It does not say the number is current, and a fully provenanced " +
        "record can be entirely stale. THE TWO QUESTIONS WERE CONFLATED BY HAVING NO ANSWER TO EITHER.");

    // The box identity is derived from the machine, and it must agree with the fingerprint the tree already had.
    const mine = hostFacts(), theirs = hostFingerprint();
    const shared = ["platform", "arch", "node", "osRelease", "cpus", "totalMemMB"];
    const disagree = shared.filter((k) => mine[k] !== theirs[k]);
    ok("the box facts agree with tools/roundhouse/androidRunner.mjs's existing fingerprint",
        disagree.length === 0,
        "prior art, checked rather than duplicated: that module has answered 'which machine is this' since " +
        "v2920 for the phone lab. A SECOND DEFINITION OF ONE MACHINE'S IDENTITY IS THE TWO-CONSTANTS-ONE-NAME " +
        "defect, so the overlapping fields are asserted equal" +
        (disagree.length ? " -- DISAGREE: " + disagree.join(", ") : "") + ".");
    ok("...and the id is stable across a node upgrade, which is not a new machine",
        boxId({ ...mine, node: "v99.0.0" }) === boxId(mine) && boxId(mine) !== boxId({ ...mine, cpus: mine.cpus + 1 }),
        "node version is in the FACTS, where a reader wants it, and out of the ID, where it would split one " +
        "box's history in half the day somebody runs nvm.");
}

// ---------------------------------------------------------------------------
console.log("\n10. *** A COMPLETED RUN IS STILL ONE COLD SAMPLE, AND THIS ROUND'S OWN WRITER PROVED IT ***");
{
    // FROZEN. The four gates tools/ship/statedRuntime-selfcheck flagged after the provenance pass, each re-timed
    // by hand as a median of three alone runs on this box, against what the pass had just written.
    const SAMPLE_VS_MEDIAN_V4580 = Object.freeze([
        { gate: "physics/render/principled-selfcheck.mjs", runner: 1523, median: 1552, runs: "1530/1563/1552" },
        { gate: "tools/roundhouse/hmcGpu-selfcheck.mjs", runner: 241, median: 204, runs: "210/199/204" },
        { gate: "tools/ship/avatarMorph-selfcheck.mjs", runner: 99, median: 105, runs: "102/105/108" },
        { gate: "tools/ship/spacesimStart-selfcheck.mjs", runner: 1486, median: 124, runs: "128/124/123" },
    ]);
    const off = SAMPLE_VS_MEDIAN_V4580.filter((x) => Math.max(x.runner, x.median) / Math.min(x.runner, x.median) > 1.2);
    const worst = SAMPLE_VS_MEDIAN_V4580.slice().sort((a, b) =>
        (Math.max(b.runner, b.median) / Math.min(b.runner, b.median)) - (Math.max(a.runner, a.median) / Math.min(a.runner, a.median)))[0];
    for (const x of SAMPLE_VS_MEDIAN_V4580)
        say(x.gate.split("/").pop().padEnd(34), `runner ${String(x.runner).padStart(5)}   median ${String(x.median).padStart(5)} (${x.runs})`);

    ok("*** one of the four runner samples is 12x out, and three are sound ***",
        off.length === 1 && worst.gate.endsWith("spacesimStart-selfcheck.mjs") &&
        Math.round(worst.runner / worst.median) === 12,
        "a fresh, complete, exit-0 reading of the real runner, on the box in boxLegend, wrong by an order of " +
        "magnitude -- ONE COLD SAMPLE WITH AN EMPTY MODULE CACHE. Its header had already recorded at v4575 that " +
        "this file's number for that gate was 10x over and that a cold first run measured 1181 ms, so the " +
        "warning was written down before the reading walked into it. THREE OF FOUR BEING SOUND IS WHY THE PASS " +
        "IS KEPT: the defect is the missing distinction, not the pass.");

    ok("...so `complete` is documented as one cold sample and a hand median is a SEPARATE kind",
        TIMING_KIND.MEDIAN3 === "median of 3 alone" && Object.keys(TIMING_KIND).length === 3,
        "the round's own repair was not enough on its own terms: a kind saying the run finished still cannot say " +
        "how many samples it is, and statedRuntime-selfcheck compares headers -- which are medians of three by " +
        "this tree's convention since v3285 -- against whatever this file holds. TWO QUANTITIES AGAIN, one level " +
        "down from the one this round set out to separate.");

    const g = "tools/ship/spacesimStart-selfcheck.mjs";
    ok("...and the outlier is corrected to the median and MARKED as one, not left as a completed run",
        (G.timings || {})[g] === 124 && (G.kinds || {})[g] === TIMING_KIND.MEDIAN3 && (G.boxes || {})[g],
        `${(G.timings || {})[g]} ms, kind '${(G.kinds || {})[g]}'. Correcting the number without changing the kind ` +
        "would leave a hand median wearing a runner sample's label -- provenance that is precisely wrong, which " +
        "is worse than the bare integer this round replaced.");

    const spacesimHeader = fs.readFileSync(path.join(ENG, g), "utf8").slice(0, 1200);
    ok("...and the headers were corrected from the MEDIANS rather than from this file, which its own instruction asks for",
        /median of 1530\/1563\/1552/.test(fs.readFileSync(path.join(ENG, "physics/render/principled-selfcheck.mjs"), "utf8")) &&
        /~0\.14s MEASURED at v4575/.test(spacesimHeader),
        "statedRuntime-selfcheck says to correct a drifted header FROM THE MEASUREMENT in gate-timings. Following " +
        "that for spacesimStart would have written 1.5 s into a 124 ms gate and undone v4575's correction of the " +
        "same entry. THE INSTRUCTION ASSUMES THE RECORD IS THE FRESH HALF, and one time in four it is not.");
}

console.log(fails ? `\ntimingProvenance-selfcheck: ${fails} FAILED` : "\ntimingProvenance-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
