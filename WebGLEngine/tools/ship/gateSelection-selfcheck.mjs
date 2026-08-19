// WebGLEngine/tools/ship/gateSelection-selfcheck.mjs — v3285
//
// Run: node tools/ship/gateSelection-selfcheck.mjs   (~25s — MEASURED; builds the real import graph)
// Gated by tools/ship/selfchecks.mjs (tree walk).
//
// The third instrument on the proposer interface, and the one with the most tempting degenerate policy: a
// selector is rewarded for fitting inside a budget, and running NOTHING fits inside every budget. So the
// adjudicator does not ask "did it finish in time" -- it names a break, names the gate that catches it, and asks
// whether the plan contains that gate. Fast and wrong is the failure being measured.

import { selectGates, adjudicateSelection, selectionLines, costsFor, ASSUMED_CHEAP_MS } from "./gateSelection.mjs";
import { MEASURED } from "./gateBudget.mjs";
import { registerProposer, runProposer, getProposer, grantLicence, applyKnobs } from "../../physics/proposers.mjs";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };

const CHANGED = ["physics/statmech/ising.js"];

// ---- 1. REACHABILITY IS REAL, AND IT LEADS THE PLAN ----------------------------------------------------------------
{
    const s = selectGates({ changed: CHANGED, budgetMs: 180000 });
    ok("!! a change reaches gates through the REAL import graph, not a filename heuristic",
       s.reachable.length > 20 && s.reachable.includes("physics/statmech/ising-selfcheck.mjs") &&
       s.reachable.includes("physics/consistency-selfcheck.mjs"),
       s.reachable.length + " gates reachable from " + CHANGED[0] + " (including the consistency board, which imports it two levels down)");
    const firstBand = s.selected.slice(0, s.reachable.length > s.selected.length ? s.selected.length : Math.min(20, s.reachable.length));
    ok("!! reachable gates are scheduled FIRST (a truncated run still covers the change)",
       firstBand.every((g) => s.reachable.includes(g)),
       "first " + firstBand.length + " selected are all reachable");
}

// ---- 2. THE PATH-CONVENTION REGRESSION, WHICH THIS FILE EXISTS TO PIN ------------------------------------------------
// gateFiles() returns absolute paths and affectedGates() returns engine-relative ones. The first run of the
// selector matched neither against the other, reported "180 selected, 64 reachable" and had an EMPTY reachable
// band -- a plan that looked full and covered nothing.
{
    const s = selectGates({ changed: CHANGED, budgetMs: 180000 });
    const overlap = s.selected.filter((g) => s.reachable.includes(g)).length;
    ok("!! the reachable band is NOT EMPTY: selected and reachable share a path convention",
       overlap >= s.reachable.length - 5 && overlap > 0,
       overlap + " of " + s.reachable.length + " reachable gates are in the plan — when the two conventions disagreed this read 0, silently");
    ok("...and missedReachable is a NAMED FIELD, which is the only reason that bug was visible at all",
       Object.prototype.hasOwnProperty.call(s, "missedReachable") && Array.isArray(s.missedReachable),
       "64 of 64 missed is impossible to read as success; the same fact in a log line would have scrolled past");
}

// ---- 3. THE BUDGET IS HONOURED, AND SHRINKING IT SHRINKS THE PLAN ------------------------------------------------------
{
    const rows = [20000, 60000, 180000].map((b) => selectGates({ changed: CHANGED, budgetMs: b }));
    ok("!! no plan exceeds its budget",
       rows.every((s) => s.spentMs <= s.budgetMs),
       rows.map((s) => Math.round(s.spentMs / 1000) + "s/" + Math.round(s.budgetMs / 1000) + "s").join(", "));
    ok("!! a bigger budget is a strictly better plan (more gates, fewer reachable misses)",
       rows[0].selected.length < rows[1].selected.length && rows[1].selected.length < rows[2].selected.length &&
       rows[0].missedReachable.length >= rows[2].missedReachable.length,
       rows.map((s) => Math.round(s.budgetMs / 1000) + "s -> " + s.selected.length + " gates, " + s.missedReachable.length + " reachable missed").join(" | "));
}

// ---- 4. THE DEGENERATE POLICY: RUNNING NOTHING FITS EVERY BUDGET ---------------------------------------------------------
{
    const breaks = {
        "Onsager T_c falsifier broken": "physics/statmech/ising-selfcheck.mjs",
        "consistency board route corrupted": "physics/consistency-selfcheck.mjs",
    };
    const runNothing = { selected: [], skipped: [], spentMs: 0, budgetMs: 180000, missedReachable: [], reachable: [] };
    const v0 = adjudicateSelection(runNothing, breaks);
    ok("!! the empty plan fits EVERY budget in zero seconds and the adjudicator REFUSES it",
       !v0.pass && v0.evidence.missed.length === 2,
       "spent 0s of 180s and missed: " + v0.evidence.missed.join(", ") + " — 'finished in time' is not the question being asked");

    const real = selectGates({ changed: CHANGED, budgetMs: 180000 });
    const v1 = adjudicateSelection(real, breaks);
    ok("!! ...while the real 180s plan covers both seeded breaks (the trap is not vacuous)",
       v1.pass, "caught " + v1.evidence.caught + "/2 in " + Math.round(real.spentMs / 1000) + "s");

    // and a budget too small to reach the break is caught, rather than passing because it "finished"
    const tiny = selectGates({ changed: CHANGED, budgetMs: 2000 });
    const v2 = adjudicateSelection(tiny, breaks);
    ok("!! a 2s budget finishes fastest of all and is refused for missing the break",
       !v2.pass, "2s plan: " + tiny.selected.length + " gates, missed " + v2.evidence.missed.length + " of 2 seeded breaks");

    ok("the adjudicator returns EVIDENCE, never a bare boolean (so it can buy a proposer licence, which refuses booleans)",
       typeof v1.evidence === "object" && typeof v1.evidence.caught === "number" && typeof v1.why === "string");
}

// ---- 5. COSTS: MEASURED BEATS ASSUMED, AND THE ASSUMPTION IS DECLARED -------------------------------------------------------
{
    const UNTIMED = "ai-bridge/assetSync-perf-selfcheck.mjs";   // a gate genuinely absent from gate-timings.json; the previous example
                                  // (consistency-selfcheck) stopped being untimed the moment this round measured it
    const { costs, guessed } = costsFor(["tools/ship/labDevices-selfcheck.mjs", UNTIMED], {});
    ok("!! a gate in the v3211 MEASURED tail uses its real completion time, not the cheap assumption",
       costs["tools/ship/labDevices-selfcheck.mjs"] === MEASURED["tools/ship/labDevices-selfcheck.mjs"],
       "labDevices " + Math.round(costs["tools/ship/labDevices-selfcheck.mjs"] / 1000) + "s from the measured table — there is ONE such table in this tree and this imports it");
    ok("...and an untimed gate is assumed cheap AND reported as a guess",
       costs[UNTIMED] === ASSUMED_CHEAP_MS && guessed.includes(UNTIMED),
       "473 of 556 timed gates came in under 1s, so the assumption is usually right — and a plan built partly on guesses that presented itself as measured would be the defect the perf ledger exists to end");
    const s = selectGates({ changed: CHANGED, budgetMs: 180000 });
    ok("...and the plan carries its guess count where a reader will see it",
       selectionLines(s).some((l) => /part guess and says so/.test(l)));
}

// ---- 6. A GATE THAT CANNOT FIT ANY SANE BUDGET IS SURFACED, NOT SWALLOWED ---------------------------------------------------
{
    const s = selectGates({ changed: CHANGED, budgetMs: 180000, includeUnreachable: false });
    const tooBig = s.missedReachable.filter((g) => (MEASURED[g] || 0) > 180000);
    ok("!! a reachable gate whose measured time exceeds the whole budget appears in missedReachable rather than silently vanishing",
       s.missedReachable.length > 0 && tooBig.length > 0,
       "e.g. " + tooBig[0] + " at " + Math.round(MEASURED[tooBig[0]] / 1000) + "s — longer than the entire 180s budget, which is a finding about the suite, not a scheduling detail");
}

// ---- 7. "NOT RUN" STAYS A THIRD STATE ----------------------------------------------------------------------------------------
{
    const s = selectGates({ changed: CHANGED, budgetMs: 20000 });
    ok("!! the report says unrun gates are NOT a claim that they pass (the v3076 rule, and the sidecar's rule)",
       selectionLines(s).some((l) => /NOT RUN -- this is not a claim that they pass/.test(l)),
       selectionLines(s)[1]);
}

// ---- 8. determinism -----------------------------------------------------------------------------------------------------------
{
    const a = selectGates({ changed: CHANGED, budgetMs: 60000 });
    const b = selectGates({ changed: CHANGED, budgetMs: 60000 });
    ok("the same change and budget give the same plan (a plan you cannot reproduce is not a plan)",
       a.selected.join("|") === b.selected.join("|"));
}

// ---- 9. IT REGISTERS ON THE LAB-WIDE PROPOSER INTERFACE ---------------------------------------------------------------------
// The registry was built in v3284 with two instruments on it, both physics. If the interface only ever fits
// physics devices it is not lab-wide, it is a statmech helper with ambitions. The knob here is the BUDGET, the
// score is the degenerate one on purpose (finish fastest), and the adjudicator is the seeded-break check.
{
    const breaks = { "Onsager T_c falsifier broken": "physics/statmech/ising-selfcheck.mjs" };
    registerProposer({
        id: "gate-budget", knobs: ["budgetMs"], defaultTier: "propose",
        notes: "wall-clock budget for a pre-commit gate run",
        propose: () => [{ budgetMs: 2000 }, { budgetMs: 60000 }, { budgetMs: 180000 }],
        score: (c) => 1 / c.budgetMs,                      // DEGENERATE: fastest plan wins
        adjudicate: (c) => adjudicateSelection(selectGates({ changed: CHANGED, budgetMs: c.budgetMs }), breaks),
    });
    const r = runProposer("gate-budget");
    ok("!! the SUITE ITSELF registers on the same propose/score/adjudicate interface as a physics device",
       r.tried === 3 && r.id === "gate-budget",
       "three candidate budgets scored and adjudicated through the lab-wide registry — the interface is not statmech-only");
    ok("!! the fastest budget wins the score and the seeded break REFUSES it",
       r.best.budgetMs === 2000 && !r.verdict.pass,
       "best-scoring 2s plan missed: " + r.verdict.evidence.missed.join(", "));
    const good = getProposer("gate-budget").adjudicate({ budgetMs: 180000 });
    ok("...and the slowest candidate, which the score ranked LAST, is the one that passes",
       good.pass, "180s plan caught " + good.evidence.caught + "/1 seeded break");
    // and the licence ratchet applies here exactly as it does to a physics knob
    ok("a budget cannot be self-applied at tier 'propose'", !applyKnobs("gate-budget", { budgetMs: 180000 }).applied);
    grantLicence("gate-budget", "adopt", good, { persist: false });
    ok("!! ...and once adopted, the adjudicator still refuses the 2s plan (the licence buys the right to ask, not to be believed)",
       applyKnobs("gate-budget", { budgetMs: 180000 }).applied && !applyKnobs("gate-budget", { budgetMs: 2000 }).applied);
}

// ---- 10. v3285 -- THE DIRECT-DEPENDENCY BAND, FOUND BY RUNNING THE THING -------------------------------------------------
// With one reachable band ordered cheapest-first, a 45s plan for a change to ising.js dropped ISING-SELFCHECK
// ITSELF in favour of eighteen cheaper gates that only reach it transitively. The gate for the file you edited
// is not interchangeable with one four imports away.
{
    const s = selectGates({ changed: CHANGED, budgetMs: 45000 });
    ok("!! gates that DIRECTLY import the changed file are identified as a band of their own",
       s.directlyTests.length > 0 && s.directlyTests.includes("physics/statmech/ising-selfcheck.mjs"),
       s.directlyTests.length + " direct: " + s.directlyTests.slice(0, 4).join(", "));
    ok("!! ...and they all survive a budget that drops two dozen merely-reachable gates",
       s.directlyTests.every((g) => s.selected.includes(g)),
       "45s budget: all " + s.directlyTests.length + " direct gates kept, " + s.missedReachable.length + " transitive ones dropped");
    ok("!! the band split is a DEPENDENCY FACT, not a filename heuristic (specifiers are resolved before comparing)",
       s.directlyTests.every((g) => s.reachable.includes(g)),
       "importsOf returns raw specifiers like './ising.js'; comparing those to repo paths matches nothing and would have silently emptied the band — the same two-path-conventions bug as earlier in this file, twice in one round");
}

// ---- 11. THE COST SOURCE IS OBSERVED RUNTIME, NOT A GUESS ---------------------------------------------------------------
// The first version read only the slow-tail timeout table and guessed 1s for everything else, producing a "45
// second plan" whose first ten gates included a 27s one. gate-timings.json has carried observed runtimes for
// 564 gates since v3212 and nothing was reading it.
{
    const { costs, guessed } = costsFor(["physics/consistency-selfcheck.mjs", "physics/statmech/ising-selfcheck.mjs"], {});
    ok("!! a gate timed in gate-timings.json uses its OBSERVED runtime",
       costs["physics/consistency-selfcheck.mjs"] > 20000 && !guessed.includes("physics/consistency-selfcheck.mjs"),
       "consistency-selfcheck " + Math.round(costs["physics/consistency-selfcheck.mjs"] / 1000) + "s observed — assumed at 1s, it would have blown a 45s budget by itself");
    const s = selectGates({ changed: CHANGED, budgetMs: 45000 });
    ok("...and most of a plan is now measured rather than guessed",
       s.guessedCost.length < s.selected.length / 2,
       s.guessedCost.length + " guessed of " + s.selected.length + " selected");
}

console.log(fails ? ("[gateSelection-selfcheck] FAILED " + fails) : "[gateSelection-selfcheck] all passed");
process.exit(fails ? 1 : 0);
