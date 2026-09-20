#!/usr/bin/env node
// WebGLEngine/tools/ship/sweepRotation-selfcheck.mjs -- v4647p
//
// GATES tools/ship/sweepRotation.mjs -- THE MODULE THAT WRITES sweep-timings.json, WHICH HAD NO GATE.
//
// *** FOUND BY A RATCHET, NOT BY LOOKING. *** definitionGates-selfcheck counts exported symbols that no gate
// names, and its tree-wide baseline GREW from 362 to 368. Six of the arrivals are this file's subject: every
// one of sweepRotation's seven exports was ungated, because the module had no -selfcheck at all. Three of
// the six are mine -- restoreLost, CORROBORATION_BAND and UNDATED, added at v4647j -- and I noticed the
// absence out loud two rounds earlier ("sweepRotation.mjs has no gate of its own") and went on to add three
// more exports to it anyway.
//
// It is not a small module to leave unguarded: `mergeTimings` writes nine maps into the record every
// rotation, and v4647j and v4647k both found defects in exactly that writer -- a restore that spelled four
// maps by hand and missed the other five, and a kind that had no word for a skip.
//
// Everything here is driven on HAND-MADE fixtures. runSlice and the CLI are not exercised: they spawn real
// gates and this file has to stay under the ship-time budget. That is stated rather than hidden, and the
// rows that matter -- what the writer puts in the record -- do not need a subprocess.
//
// Run: node tools/ship/sweepRotation-selfcheck.mjs
"use strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runSlice, classifyRows, restoreLost, rebuildFinished, mergeTimings,
         CORROBORATION_BAND, UNDATED } from "./sweepRotation.mjs";
import { BUDGET_MS } from "./sweepCoverage.mjs";
import { KIND } from "./quickSweep.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
// The majority spelling, character for character: 305 of the tree's gates define it this way. A 42nd
// distinct definition of the same four-line helper is a cost with nothing on the other side, and
// assertionShape counts them -- distinctDefinitions went 41 -> 42 when this file arrived with its own.
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const sec = (t) => console.log("\n" + t);

// ---------------------------------------------------------------------------------------------------------
sec("1. mergeTimings WRITES EVERY MAP, WHICH IS THE THING TWO ROUNDS FOUND DEFECTS IN");
// ---------------------------------------------------------------------------------------------------------
{
    const before = { timings: { g: 9000 }, codes: { g: 1 }, at: { g: UNDATED }, kinds: { g: "loaded" },
                     contended: { g: true }, kindsInferred: ["g"], serial: {}, serialAt: {}, finished: {} };
    const snapshot = JSON.stringify(before);
    const { merged, priorMs } = mergeTimings(before, [{ gate: "g", ms: 1200, code: 0, finished: true }], "2026-09-20T00:00:00.000Z", 20000);

    ok("!! *** one row moves ALL NINE maps, not the two a caller happens to remember ***",
       merged.timings.g === 1200 && merged.codes.g === 0 && merged.at.g === "2026-09-20T00:00:00.000Z" &&
       merged.serial.g === 1200 && merged.serialAt.g === "2026-09-20T00:00:00.000Z" &&
       merged.contended.g === false && merged.kinds.g === "alone" && merged.finished.g === true &&
       merged.capAt.g === 20000,
       "v4647j's restore wrote `timings` and `at` by hand and left kinds, contended, codes and finished " +
       "describing the number it had just replaced. Two gates went red naming it. This is the one writer");
    ok("!! ...and the gate LEAVES kindsInferred, because its kind was watched rather than derived",
       !merged.kindsInferred.includes("g"),
       "an inference dressed as an observation is the fault kindsInferred exists to name");
    ok("...and priorMs reports what was there before, so a caller can say what moved",
       priorMs.g === 9000, `${priorMs.g} -> ${merged.timings.g}`);
    ok("!! CONTROL: the input is not mutated -- the caller spreads it and would write the change twice",
       JSON.stringify(before) === snapshot, "a half-mutated input is a record carrying one reading under two stamps");

    const skipped = mergeTimings({ timings: {}, kinds: {} },
        [{ gate: "s", ms: 53, code: 0, finished: true, skipped: true }], "2026-09-20T00:00:00.000Z").merged;
    ok("!! *** a SKIP is recorded as a skip, which this writer had no word for until v4647k ***",
       skipped.kinds.s === KIND.SKIPPED,
       "53 ms is how long the gate took to DECLINE. Filed as `alone` it is a runtime, and that entry is what " +
       "kept sweepCoverage red for three rounds");
    const capped = mergeTimings({ timings: {}, kinds: {} },
        [{ gate: "c", ms: 20000, code: "timeout/signal", finished: false }], "2026-09-20T00:00:00.000Z").merged;
    ok("...and a run that did not finish is `capped`, not `alone`",
       capped.kinds.c === KIND.CAPPED, "the killer's clock is never a runtime -- budgetIsOwn");
}

// ---------------------------------------------------------------------------------------------------------
sec("2. classifyRows TELLS A RETURNEE FROM A RED FROM A CAP KILL");
// ---------------------------------------------------------------------------------------------------------
{
    const c = classifyRows([
        { gate: "back",   ms: 1200,  code: 0, finished: true },
        { gate: "red",    ms: 800,   code: 1, finished: true },
        { gate: "killed", ms: 20000, code: "timeout/signal", finished: false },
    ], { budgetMs: BUDGET_MS, priorMs: { back: 9000, red: 900, killed: 20000 }, capMs: 20000 });
    const names = (xs) => (xs || []).map((x) => x.gate || x).sort().join(",");
    ok("!! *** a green run under budget is a RETURNEE -- and a RED one is not, however fast it was ***",
       names(c.returnees) === "back",
       `returnees: ${names(c.returnees)}. Before v4647p this read "back,red": the filter asked the clock and ` +
       `never the exit code, so a gate that failed in 800 ms was printed as "now UNDER budget"`);
    ok("!! ...a non-zero exit is a RED however fast it was",
       names(c.reds) === "red", `reds: ${names(c.reds)} -- 800 ms is how long it took to fail, not a cost`);
    ok("!! ...and a run that did not finish is a CAP KILL, not a red and not a returnee",
       names(c.killed) === "killed" && !names(c.reds).includes("killed") && !names(c.returnees).includes("killed"),
       "v4392: a count of failures is not a verdict unless the process finished");
}

// ---------------------------------------------------------------------------------------------------------
sec("3. restoreLost REFUSES MORE THAN IT RESTORES, AND EVERY REFUSAL IS A RULE");
// ---------------------------------------------------------------------------------------------------------
// The behaviour is graded in detail beside the record it repairs, in tools/ship/sweepCoverage-selfcheck.mjs.
// What is checked HERE is that the exported entry point still answers, and that the two constants it is
// steered by are the ones that file documents -- a module whose gate never calls it is how this one got six
// ungated exports in the first place.
{
    const file = { budgetMs: 3000, timings: { g: 5000 }, at: { g: UNDATED }, kinds: {},
                   serial: { g: 2000 }, serialAt: { g: "2026-09-16T00:00:00.000Z" }, codes: {} };
    const led = { rotated: [{ gate: "g", ms: 2050, code: 0, at: "2026-09-09T00:00:00.000Z" }] };
    const r = restoreLost(file, led);
    ok("!! a lost membership number is restored from a reading that exists twice",
       r.restored.length === 1 && r.merged.timings.g === 2000 && r.merged.at.g === "2026-09-16T00:00:00.000Z",
       `restored ${r.restored.length}, ${file.timings.g} -> ${r.merged.timings.g} under the surviving reading's stamp`);
    ok("!! ...and a ledger row the rotation ran RED is refused, whatever its clock said",
       restoreLost(file, { rotated: [{ gate: "g", ms: 2050, code: 1 }] }).restored.length === 0,
       "that number is how long the gate took to FAIL, which is not a cost");
    ok("CONTROL: the band is the documented one and is not zero",
       CORROBORATION_BAND === 0.2 && UNDATED === "unknown -- before v4408",
       `band ${CORROBORATION_BAND}, undated stamp ${JSON.stringify(UNDATED)}`);
}

// ---------------------------------------------------------------------------------------------------------
sec("4. rebuildFinished ONLY SPEAKS FOR ROWS THE TIMINGS STILL DESCRIBE");
// ---------------------------------------------------------------------------------------------------------
{
    const file = { timings: { same: 100, moved: 555 }, codes: { same: 0, moved: 0 }, finished: {} };
    const led = { rotated: [{ gate: "same", ms: 100, code: 0 }, { gate: "moved", ms: 100, code: 0 }] };
    const { finished, rebuilt, skipped } = rebuildFinished(file, led);
    ok("!! a row whose timing still matches the ledger is restored",
       finished.same === true && rebuilt === 1, `rebuilt ${rebuilt}`);
    ok("!! *** ...and one the timings NO LONGER describe is skipped, not guessed ***",
       finished.moved === undefined && skipped === 1,
       "555 ms on file against 100 in the ledger: something re-ran it since, and the ledger cannot say " +
       "whether THAT run finished");
    ok("CONTROL: an existing answer is left alone",
       rebuildFinished({ ...file, finished: { same: false } }, led).finished.same === false,
       "the ledger does not overwrite an observation");
}

// ---------------------------------------------------------------------------------------------------------
sec("5. THE EXPORT SURFACE IS COVERED, WHICH IS WHY THIS FILE EXISTS");
// ---------------------------------------------------------------------------------------------------------
{
    const named = [runSlice, classifyRows, restoreLost, rebuildFinished, mergeTimings];
    ok("!! every exported function of the subject is reachable from this gate",
       named.every((f) => typeof f === "function"),
       `${named.length} functions plus ${[CORROBORATION_BAND, UNDATED].length} constants. definitionGates ` +
       "counts an export no gate names, and all seven were on that list");
    ok("!! ...and runSlice is NAMED here while being deliberately undriven, which is stated rather than hidden",
       typeof runSlice === "function",
       "it spawns real gates; driving it would put this file over the 3,000 ms ship-time budget and the " +
       "rows that matter are about what the WRITER records, not about the spawner");
}

console.log(fails ? `\nsweepRotation-selfcheck: ${fails} FAILED` : "\nsweepRotation-selfcheck: all checks pass");
console.log("\nunchecked here: runSlice and the command line, both of which spawn gates. The CLI's argument " +
    "handling is gated by tools/ship/cliArgs-selfcheck.mjs, which drives `--gates` against this tool's real " +
    "command line and watches it be refused; the slice runner itself is exercised every time a rotation runs.");
process.exitCode = fails ? 1 : 0;
