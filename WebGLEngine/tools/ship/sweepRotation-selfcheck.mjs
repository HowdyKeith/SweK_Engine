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
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runSlice, classifyRows, restoreLost, rebuildFinished, mergeTimings, writeBase,
         CORROBORATION_BAND, UNDATED, ledgerFile, LEDGER_FILE, LOCAL_LEDGER,
         hostOutlier, HOST_OUTLIER_FACTOR, RETRY_CAP_MS, HOLD_SPAN_MS } from "./sweepRotation.mjs";
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
    // v4851 -- the rotation's solo reading ends probation as the sweep's own does: under the line and finished clears the count;
    // over the line, capped, or skipped leaves it for the sweep. SABOTAGED v4851: the clearing line removed -> this row RED by
    // name (p1 still on probation after a 900 ms reading); restored.
    {
        const f = { budgetMs: 3000, timings: {}, crossings: { p1: 1, p2: 1, p3: 1, p4: 1, other: 1 } };
        const rows = [{ gate: "p1", ms: 900, code: 0, finished: true }, { gate: "p2", ms: 4200, code: 0, finished: true },
                      { gate: "p3", ms: 20000, code: "timeout/signal", finished: false }, { gate: "p4", ms: 40, code: 0, finished: true, skipped: true }];
        const c = mergeTimings(f, rows, "2026-10-13T00:00:00.000Z").merged.crossings;
        ok("!! a finished solo reading under the budget ENDS a gate's probation; over the budget, capped or skipped leaves it, and gates not read are untouched",
            !("p1" in c) && c.p2 === 1 && c.p3 === 1 && c.p4 === 1 && c.other === 1 && f.crossings.p1 === 1, JSON.stringify(c));
    }
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

// *** v4835 -- A FOREIGN WRITE MERGES INTO THIS BOX'S OWN FILE. *** Two one-gate --write runs on a box that does not own the
// shared record: the second erased the first's reading, because each merged into a fresh copy of the shared record.
// SABOTAGED: writeBase returning the shared record always -> 1 red (the first row below).
{
    console.log("\nv4835. a write on a box that does not own the record keeps that box's earlier readings");
    const shared = { host: "linux-x64-4c-16gb-142c0d", timings: { "a-selfcheck.mjs": 100 } };
    const mine = { host: "linux-x64-4c-16gb-420793", timings: { "a-selfcheck.mjs": 100, "b-selfcheck.mjs": 648 } };
    const foreign = { file: "tools/ship/sweep-timings.local.json", host: "linux-x64-4c-16gb-420793", foreign: true };
    const w = writeBase(shared, foreign, { read: () => JSON.stringify(mine) });
    const merged = mergeTimings(w.base, [{ gate: "c-selfcheck.mjs", ms: 4473, code: 0, kind: KIND.ALONE, finished: true }], "2026-10-11T00:00:00Z").merged;
    ok("!! *** the local file is the base, so b's earlier reading survives a write that timed only c ***",
        w.from === foreign.file && merged.timings["b-selfcheck.mjs"] === 648 && merged.timings["c-selfcheck.mjs"] === 4473,
        `merged from ${w.from}: b ${merged.timings["b-selfcheck.mjs"]}, c ${merged.timings["c-selfcheck.mjs"]}`);
    ok("...a local file that names ANOTHER box is not this box's, and the shared record is the base",
        writeBase(shared, foreign, { read: () => JSON.stringify({ ...mine, host: "linux-x64-4c-16gb-aaaaaa" }) }).base === shared);
    ok("...no local file yet: the shared record, as before", writeBase(shared, foreign, { read: () => { throw new Error("ENOENT"); } }).base === shared);
    ok("...and the owner's write is untouched: its base is the shared record it owns",
        writeBase(shared, { file: "tools/ship/sweep-timings.json", host: shared.host, foreign: false }, { read: () => JSON.stringify(mine) }).base === shared);
}

console.log(fails ? `\nsweepRotation-selfcheck: ${fails} FAILED` : "\nsweepRotation-selfcheck: all checks pass");
// ---------------------------------------------------------------------------------------------------------
console.log("\nTHE SERIAL RING: THE LAST THREE READINGS, BECAUSE ONE WAS STANDING IN FOR A PROPERTY (v4648)");
// ---------------------------------------------------------------------------------------------------------
{
    let f = { timings: {}, serial: {}, serialRing: {} };
    const row = (ms) => [{ gate: "g-selfcheck.mjs", ms, code: 0, finished: true, skipped: false }];
    for (const ms of [100, 200, 300]) f = mergeTimings(f, row(ms), "2026-01-01T00:00:00.000Z").merged;
    ok("the ring accumulates readings across merges rather than replacing one",
       JSON.stringify(f.serialRing["g-selfcheck.mjs"]) === "[100,200,300]",
       JSON.stringify(f.serialRing["g-selfcheck.mjs"]));
    f = mergeTimings(f, row(400), "2026-01-01T00:00:00.000Z").merged;
    ok("!! *** and it is BOUNDED at three: the oldest falls off, so a gate that really slows is seen ***",
       JSON.stringify(f.serialRing["g-selfcheck.mjs"]) === "[200,300,400]",
       `${JSON.stringify(f.serialRing["g-selfcheck.mjs"])} -- an unbounded ring would average a real ` +
       `regression into the past forever, which is the opposite failure from the one this fixes`);
    ok("...and `serial` still holds the LATEST reading, so no existing consumer changed",
       f.serial["g-selfcheck.mjs"] === 400 && f.timings["g-selfcheck.mjs"] === 400,
       "the ring is additive; costOf and every budget comparison read exactly what they read before");
}

// ---- v4818: THE LEDGER FOLLOWS THE RECORD'S OWNER ------------------------------------------------------------
// SABOTAGED v4818: ledgerFile always the shared file -> the first row red; the CLI's write put back on the literal
// path -> the second row red. Both restored.
{
    ok("v4818: a box the record refuses writes its ledger to the ignored local file, and the owner to the shared one",
       ledgerFile({ foreign: true }) === LOCAL_LEDGER && ledgerFile({ foreign: false }) === LEDGER_FILE &&
       LOCAL_LEDGER !== LEDGER_FILE && /\.local\.json$/.test(LOCAL_LEDGER),
       `foreign -> ${ledgerFile({ foreign: true })}, owner -> ${ledgerFile({ foreign: false })}`);
    const src = fs.readFileSync(path.join(ENG, "tools", "ship", "sweepRotation.mjs"), "utf8");
    const gi = fs.readFileSync(path.join(ENG, "..", ".gitignore"), "utf8");
    ok("  ...and the command line's ledger write goes through it, and git ignores the local file",
       /const ledgerOut = ledgerFile\(target\)/.test(src) && /writeFileSync\(path\.join\(ENG, ledgerOut\)/.test(src) &&
       !/writeFileSync\(path\.join\(ENG, "tools", "ship", "sweep-rotation\.json"\)/.test(src) &&
       gi.includes("WebGLEngine/tools/ship/sweep-rotation.local.json"),
       "PR #12's box and the v4818 rotation each wrote the shared ledger from a box the record refused");
}

console.log("\n*** v4824 -- THE CAP IS A KILL THE GATE CANNOT REFUSE ***");
{
    // runSlice's millisecond is the wall clock around redCensus.runGate, so a gate that survives the cap's signal
    // writes ITS OWN runtime into the record as though it were the cap's. A browser gate does exactly that with
    // SIGTERM (playwright-core's handler closes browsers and does not exit): fsrFrameGenBackdrop was filed at
    // 311,726 ms beside a 20,000 ms cap at v4821. The stand-in below traps SIGTERM and would run 8 s; written to the
    // OS temp directory, never into the tree, because a planted -selfcheck file is something four gates refuse.
    // SABOTAGED: runGate's killSignal removed -> RED here, the slice reading 8,045 ms against a 1,500 ms cap when measured; restored.
    const os = await import("node:os");
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "swek-rotation-cap-"));
    const stub = path.join(dir, "trapsSigterm.mjs");
    fs.writeFileSync(stub, 'process.on("SIGTERM", () => {}); setTimeout(() => process.exit(0), 8000);\n');
    try {
        const [row] = runSlice([stub], { capMs: 600 });
        ok("!! *** a gate that catches SIGTERM is still stopped AT the cap, and recorded as killed ***",
            row.code === "timeout/signal" && row.finished === false && row.ms < 600 + 1400,
            `${row.ms} ms against a 600 ms cap, code ${row.code}`);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

console.log("\n*** v4916 -- ONE BOX ID, MORE THAN ONE MACHINE: A CAP IS RETRIED, AND AN OUTLIER IS HELD ONCE ***");
{
    // The readings below are v4915's own, from the rotation that was not committed: subAquariumPage's ring was
    // [3820, 3306, 5377] and this host timed it at 32628; dogfightPage [5667, 5395, 17122] and 12369.
    ok("a reading is an outlier only past the factor, on either side, and only against a ring of two or more",
        HOST_OUTLIER_FACTOR === 2 && hostOutlier([3820, 3306, 5377], 32628) === "slow" && hostOutlier([15214, 11163, 13036], 6000) === "fast" &&
        hostOutlier([3820, 3306, 5377], 7639) === null && hostOutlier([3820, 3306, 5377], 7641) === "slow" &&
        hostOutlier([5000], 50000) === null && hostOutlier(undefined, 50000) === null && hostOutlier([5667, 5395, 17122], 12369) === "slow",
        "the median, so one earlier outlier in the ring (17122) does not make a third reading look normal");
    const file = { budgetMs: 3000, timings: { g: 5377, r: 5000, n: 4000 }, codes: { g: 0, r: 0, n: 0 }, at: { g: "T0", r: "T0", n: "T0" },
                   serialRing: { g: [3820, 3306, 5377], r: [5000, 5100, 4900], n: [4000] }, finished: { g: true, r: true, n: true } };
    const rows = [{ gate: "g", ms: 32628, code: 0, finished: true }, { gate: "r", ms: 30000, code: 1, finished: true }, { gate: "n", ms: 30000, code: 0, finished: true }];
    const D0 = "2026-11-15T16:00:00.000Z", D4h = "2026-11-15T20:00:00.000Z", D1d = "2026-11-16T16:00:00.000Z";
    const first = mergeTimings(file, rows, D0, 20000, { heldBefore: {} });
    ok("!! *** the first slow reading is HELD: the record's timing, ring and stamp for that gate are untouched ***",
        first.held.length === 1 && first.held[0].gate === "g" && first.merged.timings.g === 5377 && first.merged.at.g === "T0" &&
        JSON.stringify(first.merged.serialRing.g) === "[3820,3306,5377]" && first.heldOut.g.ms === 32628 && first.heldOut.g.side === "slow" && first.heldOut.g.median === 3820 && first.heldOut.g.count === 1,
        JSON.stringify(first.heldOut.g));
    ok("!! a RED is never held, however far from its ring, and neither is a gate with one prior reading",
        first.merged.timings.r === 30000 && first.merged.codes.r === 1 && first.merged.timings.n === 30000 && !("r" in first.heldOut) && !("n" in first.heldOut),
        "a failing gate's verdict is not a host's opinion, and one reading is not a history");
    // v4917 -- four hours later on the same host is the same host: held again, counted, the first date kept
    const soon = mergeTimings(file, [rows[0]], D4h, 20000, { heldBefore: first.heldOut });
    ok("!! *** v4917: a SECOND slow reading four hours later is STILL HELD -- one host saying it twice -- and counted from the first ***",
        HOLD_SPAN_MS === 86400000 && soon.held.length === 1 && soon.merged.timings.g === 5377 && soon.heldOut.g.count === 2 && soon.heldOut.g.since === D0 && soon.heldOut.g.at === D4h,
        JSON.stringify(soon.heldOut.g));
    const second = mergeTimings(file, [rows[0]], D1d, 20000, { heldBefore: soon.heldOut });
    ok("!! *** a slow reading a DAY after the first held one is WRITTEN, and the hold is cleared ***",
        second.held.length === 0 && second.merged.timings.g === 32628 && second.merged.at.g === D1d && !("g" in second.heldOut) &&
        JSON.stringify(second.merged.serialRing.g) === "[3306,5377,32628]", JSON.stringify(second.merged.serialRing.g));
    const old = mergeTimings(file, [rows[0]], D1d, 20000, { heldBefore: { g: { ms: 29616, at: D0, side: "slow", median: 3820 } } });
    ok("a hold written by v4916, which carried no `since`, is read as starting at its own stamp", old.held.length === 0 && old.merged.timings.g === 32628);
    // v4926 -- the rig's own readings (win32-x64-12c-32gb-b70b27, 2026-11-19): pilotLateness recorded red (exit 1) by a verify, re-run
    // alone green at 5800 ms against a ring whose median is 2548; slugMorph recorded red (exit 3221225477) and re-run green at 32980
    // against 2857. Both were HELD, so both reds stayed and the next verify would have read them again.
    const redFile = { budgetMs: 3000, timings: { pl: 2400, sm: 2900 }, codes: { pl: 1, sm: 3221225477 }, at: { pl: "T0", sm: "T0" },
                      serialRing: { pl: [2548, 2400, 2700], sm: [2857, 2800, 2900] }, finished: { pl: true, sm: true } };
    const cleared = mergeTimings(redFile, [{ gate: "pl", ms: 5800, code: 0, finished: true }, { gate: "sm", ms: 32980, code: 0, finished: true }], D0, 20000, { heldBefore: {} });
    ok("!! *** v4926: a GREEN reading of a gate the record calls RED is written, not held, however slow -- the red is cleared ***",
        cleared.held.length === 0 && cleared.merged.codes.pl === 0 && cleared.merged.codes.sm === 0 && cleared.merged.timings.pl === 5800 &&
        cleared.merged.timings.sm === 32980 && !("pl" in cleared.heldOut) && !("sm" in cleared.heldOut) && hostOutlier(redFile.serialRing.pl, 5800) === "slow",
        `held ${cleared.held.length}; codes now ${cleared.merged.codes.pl} and ${cleared.merged.codes.sm}`);
    // SABOTAGE (v4926), against sweepRotation.mjs, restored by copy: S1 the recordedRed test removed (v4925's rule) -> 1 red, this row
    // by name ('held 2'). S2 red read as exit 1 only -> 1 red, this row ('held 1': slugMorph's 3221225477 crash is a red too).
    const back = mergeTimings(file, [{ gate: "g", ms: 4100, code: 0, finished: true }], D4h, 20000, { heldBefore: first.heldOut });
    const flip = mergeTimings(file, [{ gate: "g", ms: 900, code: 0, finished: true }], D1d, 20000, { heldBefore: first.heldOut });
    ok("a normal reading after a hold is written and clears it; an outlier on the OTHER side starts its own count, however late",
        back.merged.timings.g === 4100 && !("g" in back.heldOut) && flip.held.length === 1 && flip.heldOut.g.side === "fast" && flip.heldOut.g.count === 1 && flip.merged.timings.g === 5377);
    const legacy = mergeTimings(file, rows, "T1", 20000);
    ok("a caller that passes no hold state gets the writer it always had: every row written",
        legacy.held.length === 0 && legacy.merged.timings.g === 32628 && Object.keys(legacy.heldOut).length === 0);
    // the retry, on a stand-in runner: killed at the first cap, finished at the second
    const calls = []; const slow = (g, { timeoutMs }) => { calls.push(timeoutMs); return timeoutMs >= 1000 ? { code: 0 } : { code: "timeout/signal" }; };
    const [again] = runSlice(["x"], { capMs: 200, retryCapMs: 1000, run: slow });
    const [once] = runSlice(["x"], { capMs: 200, run: slow });
    const [dead] = runSlice(["x"], { capMs: 200, retryCapMs: 1000, run: () => ({ code: "timeout/signal" }) });
    ok("!! *** a gate killed at the cap is run ONCE more at the longer cap, and a finish there is the row ***",
        JSON.stringify(calls.slice(0, 2)) === "[200,1000]" && again.finished === true && again.code === 0 && again.retriedFrom === 200 && again.capMs === 1000 && RETRY_CAP_MS === 120000,
        `calls at ${calls.slice(0, 2).join(" then ")} ms`);
    ok("with no retry cap the kill is recorded as it always was; killed twice is a kill, once, with the retry's cap on the row",
        once.finished === false && once.retriedFrom === undefined && dead.finished === false && dead.code === "timeout/signal" && dead.capMs === 1000);
    const capped = mergeTimings({ budgetMs: 3000 }, [again], "T3", 200);
    ok("and the record's capAt for a retried gate is the cap it actually ran under", capped.merged.capAt.x === 1000 && capped.merged.kinds.x === "alone");
    // v4917 -- the scale entries a write orphans. Pass P stamped g1 and g2 serially ("S") and by `at` ("A"); re-timing
    // g1 alone leaves both keys alive, re-timing g2 as well leaves "A" on nothing and "S" on nothing: both go. And the
    // window itself: g2 keeps its `at` stamp but not its serial one, so "A" would survive as an alias with no twin.
    const sc = { scale: 1.1, n: 40, measured: true };
    const bfile = { budgetMs: 3000, timings: { g1: 5000, g2: 5000 }, at: { g1: "A", g2: "A" }, serialAt: { g1: "S", g2: "S" }, serialRing: {}, boxScale: { S: sc, A: sc, GONE: sc } };
    const one = mergeTimings(bfile, [{ gate: "g1", ms: 5100, code: 0, finished: true }], "T9", 20000).merged.boxScale;
    const two = mergeTimings(bfile, [{ gate: "g1", ms: 5100, code: 0, finished: true }, { gate: "g2", ms: 5100, code: 0, finished: true }], "T9", 20000).merged.boxScale;
    const win = mergeTimings({ ...bfile, serialAt: { g1: "S", g2: "S2" } }, [{ gate: "g1", ms: 5100, code: 0, finished: true }], "T9", 20000).merged.boxScale;
    ok("!! *** a rotation prunes the scale entries it orphans: a key no gate carries goes, and so does an `at` alias whose serial twin went ***",
        JSON.stringify(Object.keys(one).sort()) === '["A","S"]' && Object.keys(two).length === 0 && Object.keys(win).length === 0 &&
        mergeTimings({ budgetMs: 3000 }, [], "T9").merged.boxScale === undefined,
        `one gate re-timed keeps ${Object.keys(one).sort()}; both re-timed keeps ${Object.keys(two).length}; an alias left without its twin keeps ${Object.keys(win).length}`);
    // SABOTAGE (v4917): the twin test removed (an `at` alias kept while any gate carries it) -> 1 red, this row.
    // SABOTAGE (v4916), each against sweepRotation.mjs, restored by copy:
    //   v4917, the day's span: the span test removed (same side is enough, v4916's rule) -> 1 red, "STILL HELD"; the
    //   span never satisfied -> 2 red ("a DAY after" and the v4916-format row).
    //   v4916's seven, re-run on v4917's rule where they still apply:
    //   1 a second outlier held like the first -> 1 red (the SECOND row). 2 a held reading written anyway -> 2 red.
    //   3 a red may be held -> 2 red, "a RED is never held" by name. 4 the retry never runs -> 3 red.
    //   5 the factor ten -> 2 red. 6 capAt ignoring the row's own cap -> 1 red. 7 the mean in place of the median ->
    //   1 red: dogfightPage's ring holds one 17122 and the mean lets 12369 through.
}

console.log("\nunchecked here: the command line, and runSlice against real gates (v4916's retry is driven on a stand-in runner). The CLI's argument " +
    "handling is gated by tools/ship/cliArgs-selfcheck.mjs, which drives `--gates` against this tool's real " +
    "command line and watches it be refused; the slice runner itself is exercised every time a rotation runs.");
process.exitCode = fails ? 1 : 0;
