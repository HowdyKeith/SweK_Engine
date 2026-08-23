// WebGLEngine/tools/ship/gateSelection-selfcheck.mjs — v3285
//
// Run: node tools/ship/gateSelection-selfcheck.mjs   (~7.1s — MEASURED v3941, was ~41s; builds the real import graph)
//
// v3941 -- the header said ~7s. It builds the import graph over the whole tree, and the tree went from ~600
// gates to 1111, so the number aged out with the corpus rather than with anything in this file. Re-measured
// rather than left standing: a stale runtime in a header is how a budget gets set from a memory.
// Gated by tools/ship/selfchecks.mjs (tree walk).
//
// The third instrument on the proposer interface, and the one with the most tempting degenerate policy: a
// selector is rewarded for fitting inside a budget, and running NOTHING fits inside every budget. So the
// adjudicator does not ask "did it finish in time" -- it names a break, names the gate that catches it, and asks
// whether the plan contains that gate. Fast and wrong is the failure being measured.

import { selectGates, adjudicateSelection, selectionLines, costsFor, ASSUMED_CHEAP_MS, OBSERVED } from "./gateSelection.mjs";
import { gateFiles } from "./staleness.mjs";
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
    // *** v3941 -- THE THRESHOLD WAS A COVERAGE CLAIM WEARING A CONVENTION CHECK'S NAME. *** It required
    // `overlap >= reachable.length - 5`, which says "at most five reachable gates may miss the budget" -- a fact
    // about how much reachable work fits in 180s, not about whether two path conventions agree. The tree grew;
    // 102 gates are now reachable from ising.js and ten of them do not fit; the line went red WITH THE
    // CONVENTIONS AGREEING PERFECTLY. Meanwhile the defect it exists to catch reads ZERO, and zero was never
    // within five of anything.
    //
    // The property is STRUCTURAL and cannot drift with the tree's size: every reachable gate is EITHER in the
    // plan OR named in missedReachable, and the two account for all of it. If the conventions disagreed, the
    // overlap would be 0 and missedReachable would hold the entire band -- which still ACCOUNTS, so the
    // non-empty overlap is asserted beside it. Together they pin the regression without pinning the budget.
    const accounted = overlap + s.missedReachable.length;
    ok("!! the reachable band is NOT EMPTY: selected and reachable share a path convention",
       overlap > 0 && accounted === s.reachable.length,
       overlap + " of " + s.reachable.length + " reachable gates are in the plan and " + s.missedReachable.length +
       " are named as missed — " + accounted + " accounted for, which is ALL of them. When the two conventions " +
       "disagreed this read 0, silently. THE COUNT THAT FITS THE BUDGET IS NOT ASSERTED: it falls as the tree " +
       "grows and says nothing about whether the two sets are spelled the same way.");
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

    // *** v3941 -- 180s WAS A TYPED BUDGET AND THE REACHABLE BAND OUTGREW IT. *** consistency-selfcheck costs
    // 21s, is reachable, and no longer fits: the cheapest-first order inside the reachable band fills 180s with
    // 304 cheaper gates first. So the plan caught 1 of 2 and this line reddened -- NOT because the adjudicator
    // stopped working, but because a number typed against a smaller tree stopped being big enough. The
    // vacuity this check exists to refute is about the ADJUDICATOR, and a budget is the wrong place to state it.
    //
    // The budget is DERIVED: the cost of the whole reachable band, which is by construction enough to hold every
    // gate that can catch a break reachable from the change. What is asserted is the CONTRAST -- a plan big
    // enough catches both, the empty plan catches none, and the 2s plan below catches none either.
    const reachOnly = selectGates({ changed: CHANGED, budgetMs: 1, includeUnreachable: false });
    const bandCosts = costsFor(reachOnly.reachable, {}).costs;   // ONE call, not one per gate
    const bandMs = reachOnly.reachable.reduce((a, g) => a + (bandCosts[g] || 0), 0);
    const real = selectGates({ changed: CHANGED, budgetMs: Math.ceil(bandMs * 1.1), includeUnreachable: false });
    const v1 = adjudicateSelection(real, breaks);
    ok("!! ...while a plan that holds the whole reachable band covers both seeded breaks (the trap is not vacuous)",
       v1.pass, "caught " + v1.evidence.caught + "/2 in " + Math.round(real.spentMs / 1000) + "s, on a budget of " +
       Math.round(bandMs / 1000) + "s DERIVED from the reachable band rather than typed. A TYPED 180s caught 1/2 " +
       "here: the band is " + reachOnly.reachable.length + " gates and no longer fits, which is a fact about the " +
       "tree's size and not about the adjudicator this line is testing.");

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
    // *** v3941 -- BOTH LINES HERE NAMED AN EXAMPLE, AND THE TREE KEPT MOVING THE EXAMPLES OUT FROM UNDER THEM. ***
    //
    // The first asserted `costs[labDevices] === MEASURED[labDevices]` and said "there is ONE such table in this
    // tree and this imports it". THERE ARE TWO, and costsFor prefers the other one on purpose: its ladder is
    // ledger -> OBSERVED (gate-timings.json, written by every full suite run) -> MEASURED (the curated slow
    // tail) -> assumed cheap. labDevices sits in BOTH -- 123s observed against 254s measured -- so the observed
    // number wins, correctly, and the assertion demanding the other one failed.
    //
    // The second named ai-bridge/assetSync-perf-selfcheck.mjs as "a gate genuinely absent from gate-timings.json"
    // AND ITS OWN COMMENT RECORDED THIS HAPPENING BEFORE: "the previous example (consistency-selfcheck) stopped
    // being untimed the moment this round measured it". assetSync-perf has since been timed at 2383ms. SECOND
    // TIME, PREDICTED IN WRITING BY THE LINE THAT DID IT. A fixture whose subject is "a thing nobody has measured
    // yet" is a fixture the tree is actively working to destroy.
    //
    // So the examples are DERIVED from the two tables at run time, and what is pinned is the LADDER.
    const allGates = gateFiles().map((g) => String(g).replace(/\\/g, "/").replace(/^.*?WebGLEngine\//, ""));
    // *** IN BOTH TABLES, WITH DIFFERENT NUMBERS -- WHICH IS THE ONLY POPULATION THAT CAN TEST A PRECEDENCE. ***
    // My first version of this line took the first gate with an OBSERVED entry, which is almost never also in
    // MEASURED -- so inverting the ladder in costsFor changed nothing and the check passed a planted inversion.
    // The plant found the weak key, which is what plants are for. labDevices, the example the old line named,
    // was in both at 123s observed against 254s measured: that overlap is the fixture, and it is derived here
    // rather than named, because the old line's subject is exactly the kind that moves.
    const inBoth = allGates.find((g) => OBSERVED[g] != null && MEASURED[g] != null && OBSERVED[g] !== MEASURED[g]);
    const inObserved = inBoth || allGates.find((g) => OBSERVED[g] != null);
    const measuredOnly = allGates.find((g) => OBSERVED[g] == null && MEASURED[g] != null);
    const UNTIMED = allGates.find((g) => OBSERVED[g] == null && MEASURED[g] == null);
    const { costs, guessed } = costsFor([inObserved, measuredOnly, UNTIMED].filter(Boolean), {});

    ok("!! an OBSERVED gate uses its real completion time, and OBSERVED BEATS MEASURED where both have one",
       !!inObserved && costs[inObserved] === OBSERVED[inObserved] && costs[inObserved] !== ASSUMED_CHEAP_MS &&
       (!inBoth || costs[inBoth] !== MEASURED[inBoth]),
       inObserved + " -> " + costs[inObserved] + "ms from gate-timings.json" +
       (inBoth ? ", against " + MEASURED[inBoth] + "ms in the curated table -- THE OBSERVED NUMBER WINS, which " +
                 "is the ladder costsFor documents and the direction the old line had backwards. " +
                 allGates.filter((g) => OBSERVED[g] != null && MEASURED[g] != null && OBSERVED[g] !== MEASURED[g]).length +
                 " gates sit in both tables with different numbers, so this is derived from a real population"
               : " (no gate is in both tables with differing values today, so the PRECEDENCE half of this line " +
                 "is unexercised and says so)") +
       ". " + Object.keys(OBSERVED).length + " gates carry an observed runtime.");

    ok("!! ...and MEASURED is the FALLBACK below it, not the first choice",
       measuredOnly
         ? costs[measuredOnly] === MEASURED[measuredOnly] && costs[measuredOnly] !== ASSUMED_CHEAP_MS
         : allGates.every((g) => OBSERVED[g] != null || MEASURED[g] == null),
       measuredOnly
         ? measuredOnly + " -> " + Math.round(costs[measuredOnly] / 1000) + "s from the curated table, which is " +
           "consulted only because gate-timings has no entry for it. *** THERE IS EXACTLY " +
           allGates.filter((g) => OBSERVED[g] == null && MEASURED[g] != null).length + " SUCH GATE IN THE TREE " +
           "TODAY: when a sweep times it, this rung of the ladder becomes untestable and this line must say so " +
           "rather than quietly stop meaning anything."
         : "NO gate is in MEASURED without also being in OBSERVED, so this rung cannot be exercised today -- " +
           "REPORTED AS UNTESTABLE rather than passed, which is the state the old typed example hid.");

    ok("...and an untimed gate is assumed cheap AND reported as a guess",
       UNTIMED
         ? costs[UNTIMED] === ASSUMED_CHEAP_MS && guessed.includes(UNTIMED)
         : allGates.every((g) => OBSERVED[g] != null || MEASURED[g] != null),
       UNTIMED
         ? UNTIMED + " -> " + ASSUMED_CHEAP_MS + "ms assumed and NAMED in guessed[] (" +
           allGates.filter((g) => OBSERVED[g] == null && MEASURED[g] == null).length + " gates have no evidence " +
           "of either kind). The assumption is usually right, and a plan built partly on guesses that presented " +
           "itself as measured would be the defect the perf ledger exists to end."
         : "every gate in the tree now carries a timing, so there is no untimed gate to exercise this with -- " +
           "REPORTED, not passed.");
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
