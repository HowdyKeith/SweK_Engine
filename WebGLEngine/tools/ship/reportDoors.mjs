// tools/ship/reportDoors.mjs -- v4459 -- the census of `reportLines`, the tree's front-door convention.
//
// *** SEVENTY-SEVEN MODULES EXPORT reportLines AND NOTHING STATES ITS CONTRACT. *** server.html,
// instrument-bench.html, fleet-report.mjs and the fingerprint bridge all consume it; every knob, meter, bind
// and census in the tree provides it. It is how a module says what it knows. It is also the largest untested
// convention in the tree, and the reason is measurable rather than cultural: EXERCISING IT COSTS ABOUT SEVEN
// AND A HALF MINUTES, so no gate has ever exercised it.
//
// ---- *** WHAT MEASURING IT FOUND, AND THE FIRST FINDING IS ABOUT HOW TO MEASURE IT *** --------------------
//
// (1) READING THE SIGNATURE IS THE WRONG INSTRUMENT. Twenty modules declare a parameter; only SIX require
//     one. The other fourteen have defaults -- `{ live = true } = {}`, `opts = {}`, `root = ROOT` -- so they
//     are callable bare, and a census built on the source text would have called fourteen of them formatters
//     and been wrong about every one. `Function.length` answers the question a consumer actually asks: CAN I
//     CALL THIS WITH NOTHING? The source text answers a different one.
//
// (2) SIX CANNOT BE CALLED THE WAY THE CONVENTION IS CONSUMED, and they are a different kind of thing:
//     peerReport(cmp), curriculum(opts), officeManager(r), refusalExpiry(rows), composePropose(r) and
//     composeValidate(comp, opts) are FORMATTERS -- they render a result somebody else computed. A walker
//     that calls reportLines() across the population throws on all six. They are registered here BY NAME so
//     the distinction is a declaration rather than a surprise.
//
// (3) THE COST IS ENTIRELY IN THE CALL, NOT THE IMPORT. Importing all 77 is free -- 0.0s each, measured.
//     Calling the 64 quick self-reports takes 71 SECONDS TOGETHER; six more take 37 to 74 seconds EACH; and
//     tools/roundhouse/knobLiveness.mjs DOES NOT FINISH IN NINETY. A front door nobody can open in under a
//     minute is a front door nobody opens.
//
// (4) AND TWO OF THE SLOW ONES ALREADY HAVE A CHEAP PATH THAT NOTHING RECORDS -- WHICH RETURNS A DIFFERENT
//     REPORT. `orphanTriage.reportLines({ live: false })` returns in 0.0s with 5 lines against 71.5s and 154
//     lines; `levelClaim` 0.0s/18 against 38.0s/19. `doorKinds` has NO PARAMETER AT ALL -- v4458 recorded a flag for it that has nowhere to go, and
//     timed 71s and 72.3s, which is the same call twice.
//     So "call it cheaply" exists for some members and not others, the cheap call is NOT the same report,
//     and until now nothing said which is which.
//
// THIS MODULE IS A MEMBER OF THE POPULATION IT COUNTS -- it exports its own reportLines() below -- which is
// the cheapest possible check that the convention it describes is one a module can actually satisfy.
"use strict";

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const SIG = /^export (?:async )?function reportLines\s*\(([^)]*)\)/m;
const SIG_CONST = /^export const reportLines = (?:async )?\(([^)]*)\)/m;
const SKIP_DIR = /^(node_modules|vendor|\.git|\.venv)$/;

/** Every module that exports reportLines, derived from the tree rather than listed. */
export function population(root) {
    const out = [];
    const walk = (dir) => {
        let ents; try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
        for (const e of ents) {
            const p = path.join(dir, e.name);
            if (e.isDirectory()) { if (!SKIP_DIR.test(e.name)) walk(p); continue; }
            if (!/\.(js|mjs)$/.test(e.name) || /selfcheck/.test(e.name)) continue;
            let src; try { src = fs.readFileSync(p, "utf8"); } catch { continue; }
            const m = SIG.exec(src) || SIG_CONST.exec(src);
            if (!m) continue;
            const args = m[1].trim();
            out.push({
                rel: path.relative(root, p).replace(/\\/g, "/"),
                abs: p,
                declared: args,
                // what the SOURCE says -- kept because the disagreement with the runtime arity is the finding
                declaredParams: args === "" ? 0 : args.split(",").filter((a) => a.trim()).length,
                hasGate: fs.existsSync(p.replace(/\.(js|mjs)$/, "-selfcheck.mjs")),
            });
        }
    };
    walk(root);
    return out.sort((a, b) => a.rel.localeCompare(b.rel));
}

/** The runtime arity, which is the only one that answers "can a consumer call this with nothing?". */
export async function classify(root) {
    const rows = [];
    for (const m of population(root)) {
        let mod, err = null;
        try { mod = await import(pathToFileURL(m.abs).href); } catch (e) { err = e.message; }
        const fn = mod && mod.reportLines;
        rows.push({ ...m, arity: fn ? fn.length : null, kind: fn ? (fn.length > 0 ? "formatter" : "self-report") : "unimportable", err });
    }
    return rows;
}

/** Call one self-report and check the contract: a non-empty array of ASCII strings. */
export function contractOf(lines) {
    if (!Array.isArray(lines)) return "not an array (" + typeof lines + ")";
    if (lines.length === 0) return "empty";
    if (!lines.every((x) => typeof x === "string")) return "not all strings";
    if (lines.some((x) => /[^\x00-\x7F]/.test(x))) return "non-ASCII";
    return null;
}

// *** THE FORMATTERS, REGISTERED BY NAME. *** A formatter renders a result somebody else computed, so a bare
// call throws and SHOULD throw. Adding one is a deliberate act a reviewer can see, which is the difference
// between a convention with two kinds in it and a convention that is quietly broken for six members.
export const FORMATTERS = Object.freeze([
    "tools/fingerprint/peerReport.mjs",
    "tools/roundhouse/curriculum.mjs",
    "tools/roundhouse/officeManager.mjs",
    "tools/roundhouse/refusalExpiry.mjs",
    "tools/ship/composePropose.mjs",
    "tools/ship/composeValidate.mjs",
]);

// *** AND Function.length CANNOT TELL THE LAST TWO FROM THE FIRST FOUR EITHER, WHICH IS THE THIRD INSTRUMENT
// AND THE THIRD ANSWER. *** Four of the six REFUSE a bare call -- "Cannot read properties of undefined" --
// which is an honest refusal a consumer can catch. Two RETURN A REPORT ANYWAY.
//
// *** v4459 -- AND WHAT v4458 SAID ABOUT THOSE TWO WAS WRONG, FROM READING ONE LINE OF THE OUTPUT AND
// STOPPING. *** It recorded composeValidate.reportLines() as returning "A MANUFACTURED FINDING ... a defect
// that does not exist", on the strength of its first line:
//
//     [composeValidate] 1 problem(s):
//       (root): not an object -- a composition is { avatar, scene, pet, room, gauges, props }
//
// THE SECOND LINE NAMES ITS OWN CAUSE, and the report is exactly right: it was handed a non-composition and
// said so. Nor is the count canned -- an actual (empty) composition reports SIX problems against this one, so
// the module is distinguishing "you gave me nothing" from "you gave me something with six holes". The claim
// was a headline promoted to a property, which is the same error this file's own round made twice about
// knobLiveness, committed once more one file over.
//
// NEITHER OF THE TWO FABRICATES, AND THEY RETURN FOR TWO DIFFERENT REASONS -- measured, not read:
//
//   curriculum(opts)          THE PARAMETER IS OPTIONAL IN FACT AND REQUIRED IN THE DECLARATION. propose()
//                             defaults every field ({ perKind = 3, slow = false, onPhase = null } = {}), so
//                             reportLines() and reportLines({}) return the IDENTICAL 16 lines. Function.length
//                             reads the signature; the default lives one call deeper.
//   composeValidate(comp)     THE PARAMETER IS GENUINELY REQUIRED, and the absence is handled honestly rather
//                             than crashed on or papered over.
//
// WHAT SURVIVES IS NARROWER AND STILL WORTH KNOWING: a walker that prints these reports under a heading of
// its own publishes "1 problem(s)" in a context where the problem is THE WALKER'S OWN EMPTY CALL. That is a
// hazard of the reporting context, not a defect in the module, and the gate now asserts the thing that would
// make it one -- that the bare report NAMES ITS OWN CAUSE.
export const STRICT_FORMATTERS = Object.freeze([
    "tools/fingerprint/peerReport.mjs",
    "tools/roundhouse/officeManager.mjs",
    "tools/roundhouse/refusalExpiry.mjs",
    "tools/ship/composePropose.mjs",
]);
export const TOLERANT_FORMATTERS = Object.freeze([
    "tools/roundhouse/curriculum.mjs",
    "tools/ship/composeValidate.mjs",
]);

// *** THE REASON EACH ONE RETURNS, AS DATA RATHER THAN AS AN ADJECTIVE IN A print STATEMENT. *** v4458's
// front door summarised these two as "one of them a manufactured finding" and the correction that retired
// that phrase, one round later, changed this file's header, the changelog, main.js and brain.js -- FOUR
// COPIES OF THE PROSE -- and did not change the print statement, which is the only copy a consumer sees.
// The summary line is built from this map now, so a reason cannot be corrected in one place and shipped
// from another. The gate asserts every tolerant formatter has an entry and that nothing else does.
export const RETURNS_BARE_BECAUSE = Object.freeze({
    "tools/roundhouse/curriculum.mjs":
        "optional in fact, required in the declaration -- bare and {} give the identical 16 lines",
    "tools/ship/composeValidate.mjs":
        "genuinely required, and the absence is reported accurately: \"(root): not an object\"",
});

// *** THE MEASURED COST, FROZEN BY NAME (v4399's rule), BECAUSE A GATE CANNOT AFFORD TO RE-MEASURE IT. ***
// Every number here was taken by calling the module in its own process with a wall clock around it.
//
// *** v4459 -- AND THE CHEAP-PATH COLUMN HAD TWO DIFFERENT STATES WEARING ONE LABEL, INSIDE A RECORD
// PRESENTED AS FACT. *** v4458 wrote `cheapFlag: null` for stefan, orphanDisposition and shaderRefs, and
// `cheapFlag: "{ live: false } -- HAS NO EFFECT"` with `cheap: 72.3` for doorKinds. The second is a
// MEASUREMENT -- 71.0 s bare against 72.3 s with the flag, both taken. THE FIRST THREE WERE NEVER MEASURED
// AT ALL, and `null` was typed because nothing was known. Reading the three signatures settles the question
// and does not excuse the record: all three are `export function reportLines()` with NO PARAMETER, so there
// is nothing to pass and a cheap path is IMPOSSIBLE rather than merely absent. *** null WAS RIGHT FOR A
// REASON NOBODY HAD CHECKED, WHICH IS NOT THE SAME AS BEING RIGHT. ***
//
// *** AND THE GATE BELOW FAILED ON ITS FIRST RUN AND MADE IT WORSE THAN THAT. *** doorKinds is
// `export async function reportLines()` TOO. So four of the seven entries are the same state, and the one
// that carried a flag, a verdict and a number was the most wrong of the four -- the seconds made it look
// like the best-supported row in the table when they were the bare call timed a second time.
//
// The column is an explicit state now, with four values and no null:
//
//   IMPOSSIBLE   reportLines takes no parameter. *** DERIVED FROM THE LIVE SIGNATURE BY THE GATE, IN BOTH
//                DIRECTIONS, so it cannot be typed onto a member that does take one and cannot be omitted
//                from one that does not. ***
//   MEASURED     a flag exists and was measured to help. Carries the flag, the ARGUMENT ITSELF, the seconds
//                and both line counts. *** THE GATE RE-TAKES THIS MEASUREMENT EVERY RUN *** -- see below;
//                MEASURED is not a thing that can be typed.
//   NONE         a flag exists and was measured NOT to help. Carries the flag and the seconds. *** THIS
//                STATE IS CURRENTLY EMPTY, and the one entry that appeared to be in it was not: see
//                doorKinds below, which has no parameter and never had a flag. ***
//   UNMEASURED   a parameter exists and nobody has tried it. *** THE STATE v4458's SHAPE COULD NOT SAY ***,
//                which is why three entries said something else. It carries no seconds, and the gate
//                asserts it carries none, so an unmeasured entry cannot be read as a measured one.
export const CALL_COST_V4459 = Object.freeze({
    at: "v4458",                 // when the SECONDS were taken -- they have not been re-measured
    stateAt: "v4459",            // when the cheap-path column stopped conflating two states
    quick: "64 self-reports called together in 71.1s -- individually fast, collectively most of a gate budget",
    slow: Object.freeze([
        Object.freeze({ rel: "physics/sph/levelClaim.mjs", bare: 38.0,
            cheap: "MEASURED", cheapFlag: "{ live: false }", cheapArg: Object.freeze({ live: false }),
            cheapSeconds: 0.0, linesBare: 19, linesCheap: 18 }),
        Object.freeze({ rel: "physics/thermal/stefan.mjs", bare: 70.0,
            cheap: "IMPOSSIBLE" }),
        // *** THE ENTRY THAT LOOKED BEST-SUPPORTED IN v4458's TABLE WAS THE MOST WRONG ONE. *** It read
        // `cheapFlag: "{ live: false } -- HAS NO EFFECT", cheap: 72.3` -- a flag, a verdict and a number,
        // where the other three unmeasured entries had only a null. Its signature is `export async function
        // reportLines()`, WITH NO PARAMETER, so the 72.3 s was taken by passing an argument to a function
        // that has nowhere to put one: the bare call, timed twice, 71.0 and 72.3, and the 1.3 s between them
        // is run-to-run noise. A number beside a claim made the claim look measured. This module's own
        // header said "doorKinds has no such flag" in prose the whole time.
        Object.freeze({ rel: "tools/ship/doorKinds.mjs", bare: 71.0,
            cheap: "IMPOSSIBLE",
            was: "recorded as a flag that HAS NO EFFECT, with 72.3s beside it -- that was the bare call timed twice" }),
        Object.freeze({ rel: "tools/ship/orphanDisposition.mjs", bare: 74.0,
            cheap: "IMPOSSIBLE" }),
        Object.freeze({ rel: "tools/ship/orphanTriage.mjs", bare: 71.5,
            cheap: "MEASURED", cheapFlag: "{ live: false }", cheapArg: Object.freeze({ live: false }),
            cheapSeconds: 0.0, linesBare: 154, linesCheap: 5 }),
        Object.freeze({ rel: "tools/ship/shaderRefs.mjs", bare: 52.0,
            cheap: "IMPOSSIBLE" }),
        // was "never returns". A census budget made it 38.0s, which is still far too slow for the
        // bounded sample below -- so it stays on NEVER_CALL for COST, which is a different reason.
        // UNMEASURED rather than MEASURED: the 38.0 s ALREADY carries an internal budget the front door sets
        // for itself (FRONT_DOOR_CENSUS_MS = 25000), and `totalBudgetMs` is a caller-side flag that buys a
        // LONGER look, not a cheaper one. Nobody has measured a cheap call here, and the record says so.
        Object.freeze({ rel: "tools/roundhouse/knobLiveness.mjs", bare: 38.0,
            cheap: "UNMEASURED", cheapFlag: "totalBudgetMs -- buys a longer census, not a cheaper one",
            was: "never returned before the census budget" }),
    ]),
    // *** THIS ENTRY IS RETIRED, LATER IN THE SAME ROUND, AND WHAT IT CAUSED IS WHY. *** It read "still running at 90s,
    // killed -- the only member of the population with no measured cost at all, because it has never been
    // observed to return." Measuring THAT found the mechanism: knobLiveness's budget is spent PER DEVICE and
    // the registry holds 129 of them, so the front door was attempting a census with nothing bounding their
    // sum. *** AND RUNNING IT TO COMPLETION CORRECTED THIS RECORD TWICE OVER: it is not a hang, it RETURNS
    // AFTER 989.8 SECONDS -- 16.5 minutes, 767 lines -- against the 43-minute worst case the arithmetic
    // suggested. "Never returns" was an observation at 90 seconds promoted to a property; the truth is a cost
    // nobody had paid. *** The census has a budget of its own now and reportLines() returns in 38.0s covering
    // 19 of 129 devices and saying which. A record that names a defect is doing its job when the defect stops
    // being true and the record has to change.
    //
    // *** AND v4459 FOUND THAT THE RETIREMENT NEVER REACHED THE ONE COPY ANYBODY RUNS. *** reportLines()
    // below printed a hand-typed eighth row, `tools/roundhouse/knobLiveness.mjs   never`, underneath the
    // seventh row that this table derives at 38.0 -- so the module's front door published the retired claim
    // AND a duplicate of the member it was about, in the file whose subject is front doors, sixty lines under
    // the paragraph retiring it. The printer is derived from this table now and prints no literal of its own.
    doesNotFinish: null,
    total: "about seven and a half minutes to exercise the whole convention once, which is why no gate does " +
           "-- and that was measured BEFORE knobLiveness was known to return at all; the full picture is that " +
           "plus its 989.8 s, so a complete sweep of this convention is closer to twenty-four minutes",
});

/** The four states the cheap-path column can hold, and the two of them that require seconds beside them. */
// *** AND SABOTAGE S WENT 0 RED, WHICH IS WHY MEASURED CARRIES cheapArg. *** The first version of the gate
// checked that a MEASURED entry has the SHAPE of a measurement -- a flag and a finite number. Moving
// knobLiveness from UNMEASURED to `MEASURED, cheapFlag: "totalBudgetMs", cheapSeconds: 38.0` satisfied every
// one of those checks and nothing went red. *** A CONTROL AGAINST "AN UNMEASURED ENTRY CANNOT LOOK MEASURED"
// DOES NOT CATCH A FABRICATED MEASUREMENT, AND A FABRICATED MEASUREMENT IS EXACTLY WHAT v4458's 72.3 WAS. ***
// The repair is that MEASURED is no longer a claim: the gate APPLIES cheapArg, times the call and compares
// the line counts, every run. Both cheap calls cost 0.0s, so verifying them is free -- and an entry claiming
// a cheap path the gate cannot afford to take is by definition not one anybody has verified, so a member of
// NEVER_CALL may not be MEASURED at all.
export const CHEAP_STATES = Object.freeze(["IMPOSSIBLE", "MEASURED", "NONE", "UNMEASURED"]);
export const CHEAP_STATES_WITH_SECONDS = Object.freeze(["MEASURED", "NONE"]);

// *** THE NEVER-CALL LIST, AND IT IS ABSOLUTE RATHER THAN DERIVED. *** Found by sabotaging this round's own
// gate: classify members by their SOURCE SIGNATURE instead of Function.length and knobLiveness lands in a set
// the gate calls bare -- and the gate HANGS instead of going red. It hung for real, twice, before this list
// existed. A guard that sits downstream of a classification cannot protect against a defect in that
// classification, so this list is consulted at EVERY call site regardless of how a module was sorted.
// THE REASON CHANGED AND THE ENTRY DID NOT. Before v4458 knobLiveness never returned; after the census budget it
// returns in 38.0s, which is still an order of magnitude past what a bounded sample can spend. A do-not-call
// list that empties the moment a hang becomes a mere expense would have to be rebuilt the next time either
// appears, so it holds both reasons and each entry carries its own.
export const NEVER_CALL = Object.freeze(["tools/roundhouse/knobLiveness.mjs"]);

/** The three that provide the convention and have no gate of their own to check it. */
export const NO_GATE_V4458 = Object.freeze([
    "physics/xpbd/clothSoak.mjs",
    "tools/ship/bootTraceReport.mjs",
    "tools/ship/morphCounter.mjs",
]);

/** This module's own front door -- it is a member of the population it counts. */
export function reportLines() {
    const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");
    const pop = population(root);
    const L = [];
    L.push("[reportDoors] the reportLines convention, counted rather than assumed");
    L.push("");
    L.push("  members                 " + pop.length);
    L.push("  declare a parameter     " + pop.filter((p) => p.declaredParams > 0).length + "  (source text)");
    L.push("  REQUIRE one             " + FORMATTERS.length + "  (Function.length -- the one a caller feels)");
    L.push("  no sibling gate         " + pop.filter((p) => !p.hasGate).length);
    L.push("");
    L.push("  the six formatters render a result somebody else computed. FOUR refuse a bare call:");
    for (const f of STRICT_FORMATTERS) L.push("    " + f);
    L.push("  and TWO return a report anyway -- NEITHER of them fabricates, for two different reasons:");
    for (const f of TOLERANT_FORMATTERS) L.push("    " + f.padEnd(38) + RETURNS_BARE_BECAUSE[f]);
    L.push("");
    // *** EVERY ROW BELOW IS DERIVED FROM CALL_COST_V4459.slow AND THIS LOOP TYPES NO MEMBER NAME OF ITS
    // OWN. *** v4458's version appended a hand-written eighth row reading "knobLiveness   never" after this
    // loop had already printed knobLiveness at 38.0 -- a retired claim and a duplicate, in the front door of
    // the module that counts front doors. A literal here is how a table and its printer disagree.
    L.push("  slowest bare calls (seconds, measured " + CALL_COST_V4459.at +
           "; cheap-path state " + CALL_COST_V4459.stateAt + "):");
    for (const s of CALL_COST_V4459.slow) {
        const cheap = s.cheap === "IMPOSSIBLE" ? "no parameter -- nothing to pass"
            : s.cheap === "UNMEASURED" ? "nobody has tried: " + s.cheapFlag
            : s.cheapFlag + " -> " + s.cheapSeconds.toFixed(1) + "s" +
              (s.cheap === "NONE" ? "  (NO HELP)" : "");
        L.push("    " + s.rel.padEnd(38) + String(s.bare).padStart(6) + "   " + s.cheap.padEnd(11) + cheap);
    }
    return L;
}
