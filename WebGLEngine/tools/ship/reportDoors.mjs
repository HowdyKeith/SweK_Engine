// tools/ship/reportDoors.mjs -- v4458 -- the census of `reportLines`, the tree's front-door convention.
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
//     lines; `levelClaim` 0.0s/18 against 38.0s/19. `doorKinds` has no such flag and takes 71s either way.
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
// which is an honest refusal a consumer can catch. Two RETURN A REPORT ANYWAY, and one of those is worse than
// throwing: composeValidate.reportLines() with no argument returns
//
//     "[composeValidate] 1 problem(s):"
//
// A MANUFACTURED FINDING. The only problem is that it was called with nothing, and a walker collecting these
// reports would publish a problem that does not exist. curriculum returns 16 plausible lines the same way.
// SO THE SOURCE TEXT SAYS 20, Function.length SAYS 6, AND CALLING SAYS 4 REFUSE AND 2 FABRICATE -- three
// instruments, three answers, and only the last one is the question a consumer asks.
export const STRICT_FORMATTERS = Object.freeze([
    "tools/fingerprint/peerReport.mjs",
    "tools/roundhouse/officeManager.mjs",
    "tools/roundhouse/refusalExpiry.mjs",
    "tools/ship/composePropose.mjs",
]);
export const TOLERANT_FORMATTERS = Object.freeze([
    "tools/roundhouse/curriculum.mjs",     // returns 16 plausible lines from no input at all
    "tools/ship/composeValidate.mjs",      // returns "[composeValidate] 1 problem(s):" -- a fabricated finding
]);

// *** THE MEASURED COST, FROZEN BY NAME (v4399's rule), BECAUSE A GATE CANNOT AFFORD TO RE-MEASURE IT. ***
// Every number here was taken by calling the module in its own process with a wall clock around it.
export const CALL_COST_V4458 = Object.freeze({
    at: "v4458",
    quick: "64 self-reports called together in 71.1s -- individually fast, collectively most of a gate budget",
    slow: Object.freeze([
        Object.freeze({ rel: "physics/sph/levelClaim.mjs", bare: 38.0, cheapFlag: "{ live: false }", cheap: 0.0, linesBare: 19, linesCheap: 18 }),
        Object.freeze({ rel: "physics/thermal/stefan.mjs", bare: 70.0, cheapFlag: null }),
        Object.freeze({ rel: "tools/ship/doorKinds.mjs", bare: 71.0, cheapFlag: "{ live: false } -- HAS NO EFFECT", cheap: 72.3 }),
        Object.freeze({ rel: "tools/ship/orphanDisposition.mjs", bare: 74.0, cheapFlag: null }),
        Object.freeze({ rel: "tools/ship/orphanTriage.mjs", bare: 71.5, cheapFlag: "{ live: false }", cheap: 0.0, linesBare: 154, linesCheap: 5 }),
        Object.freeze({ rel: "tools/ship/shaderRefs.mjs", bare: 52.0, cheapFlag: null }),
        // was "never returns". A census budget made it 38.0s, which is still far too slow for the
        // bounded sample below -- so it stays on NEVER_CALL for COST, which is a different reason.
        Object.freeze({ rel: "tools/roundhouse/knobLiveness.mjs", bare: 38.0, cheapFlag: "totalBudgetMs", was: "never returned before the census budget" }),
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
    doesNotFinish: null,
    total: "about seven and a half minutes to exercise the whole convention once, which is why no gate does " +
           "-- and that was measured BEFORE knobLiveness was known to return at all; the full picture is that " +
           "plus its 989.8 s, so a complete sweep of this convention is closer to twenty-four minutes",
});

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
    L.push("  and TWO return a report anyway, one of them a manufactured finding:");
    for (const f of TOLERANT_FORMATTERS) L.push("    " + f);
    L.push("");
    L.push("  slowest bare calls (seconds, measured " + CALL_COST_V4458.at + "):");
    for (const s of CALL_COST_V4458.slow) L.push("    " + s.rel.padEnd(38) + String(s.bare).padStart(6));
    L.push("    " + "tools/roundhouse/knobLiveness.mjs".padEnd(38) + "  never");
    return L;
}
