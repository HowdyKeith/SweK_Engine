#!/usr/bin/env node
// WebGLEngine/tools/ship/cliArgs-selfcheck.mjs -- v4647g
//
// GATES tools/ship/cliArgs.mjs -- the argument parser written because an option seven tools did not know
// about was IGNORED and the run proceeded for 1,914 s.
//
// The rows are arithmetic on hand-made argv arrays, then TWO REAL COMMAND LINES driven through spawnSync --
// quickSweep and sweepRotation -- because the whole finding is about what a command line does with a token,
// and a row that only calls parseArgs() would pass on a build whose CLI never calls it.
//
// *** THE CONTROL THAT MATTERS IS "A GOOD COMMAND LINE STILL RUNS". *** A parser that refuses everything
// makes every row above it pass and the tools unusable, which is the same shape as a runner that calls
// everything red. Both real invocations are driven both ways.
//
// v4647g SABOTAGES, RESULTS BY NAME:
//   TA. an unknown option is accepted instead of refused          -> 7 RED
//   TB. a missing value is accepted as its next token             -> 3 RED
//   TC. the next token is CONSUMED after a missing value          -> 1 RED
//   TD. a non-numeric value passes as NaN                         -> 2 RED
//   TE. zero and negatives are accepted as budgets                -> 1 RED
//   TF. nearestOption always returns the first known option       -> 5 RED
//   TG. parseArgs THROWS on a bad token instead of returning it   -> 3 RED
//   TH. the refusal is printed but the tool runs anyway           -> 1 RED
//
// *** TA IS THE MEASUREMENT THIS FILE EXISTS FOR, AND IT RAN THE WRONG THING AGAIN WHILE BEING TAKEN. ***
// With unknown options accepted, `sweepRotation --gates eulerGpu` started the 21-gate rotation -- live, the
// same wrong run the typo produced the first time -- and `quickSweep --reed w4.json` started a full sweep.
// The first sabotage harness had no bound on those spawns and HUNG for minutes. Both real-CLI rows carry a
// 20,000 ms bound now: a refusal is 81 ms, so anything slower is the tool failing to refuse, and a bound
// turns a hang into a fast red. A HANG IS NOT A VERDICT, the same rule as a crash.
//
// *** TG CRASHED THIS GATE BEFORE IT REPORTED. *** The wrapper returned a bare `{ threw }`, so row one
// failed and `r.errors.length` then killed the run: ONE FAIL line where there should have been three.
// Ninth crash-instead-of-a-finding this session, mine, in the gate written one round after the round about
// that species. A throw is a RESULT that says it threw, and every row below it still runs.
//
// Run: node tools/ship/cliArgs-selfcheck.mjs
"use strict";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { parseArgs, nearestOption, editDistance, refusalLines, silentReaders, SILENT_READER, HUNTER,
         SILENT_AT_V4647G } from "./cliArgs.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (c, name, detail) => { console.log(`  ${c ? "PASS" : "FAIL"}${c ? "  " : "  !! "}${name}${detail ? "   " + detail : ""}`); if (!c) fails++; };
const sec = (t) => console.log("\n" + t);

const SPEC = Object.freeze({
    values: Object.freeze({ "--budget": "number", "--read": "path" }),
    flags: Object.freeze(["--json", "--full"]),
});
// *** NEVER THROWS, BY CONTRACT -- AND THE WRAPPER RETURNS A WHOLE RESULT WHEN IT DOES. ***
// The first draft returned bare `{ threw }`, so sabotage TG (parseArgs throws on a bad token) made row one
// fail and then killed the gate on `r.errors.length` of undefined -- ONE FAIL line and a TypeError, where
// there should have been a FAIL line per damaged row. Ninth crash-instead-of-a-finding this session, mine,
// in the gate written one round after the round about that exact species. A throw is now a RESULT that says
// it threw, so every row below still runs and names what the throw cost it.
const run = (argv) => {
    try { return parseArgs(argv, SPEC); }
    catch (e) { return { values: {}, flags: new Set(), errors: ["THREW: " + String(e && e.message)], threw: String(e && e.message) }; }
};

// ---------------------------------------------------------------------------------------------------------
sec("1. AN UNKNOWN OPTION IS REFUSED, AND THE REFUSAL NAMES THE ONE THAT WAS MEANT");
// ---------------------------------------------------------------------------------------------------------
{
    const r = run(["--reed", "w4.json"]);
    ok(!r.threw, "!! parseArgs RETURNS its errors and does not throw", r.threw || "a throw is a crash rather than a verdict, which is the species v4647f spent a round on");
    ok(!r.threw && r.errors.length >= 1 && /unknown option --reed/.test(r.errors[0]),
       "!! *** the unknown option is an ERROR, where it used to be a silent default ***",
       r.errors[0] || "(no error)");
    ok(/did you mean --read\?/.test(r.errors[0] || ""),
       "!! ...and the nearest known option is named", "one edit away. The 1,914 s run was --read against a build with none");
    // THE REAL TYPO, kept as a row because it is the one that wrote a wrong number into the timings file.
    const rot = { values: { "--gate": "path" }, flags: [] };
    const g = parseArgs(["--gates", "eulerGpu"], rot);
    ok(/unknown option --gates -- did you mean --gate\?/.test(g.errors[0] || ""),
       "!! *** --gates against a tool whose option is --gate is refused and corrected ***",
       "the typo that ran a 21-gate rotation and recorded eulerGpu AT THE CAP -- a cap reading filed as a runtime");
    const good = run(["--read", "w4.json"]);
    ok(!good.errors.length && good.values["--read"] === "w4.json",
       "CONTROL: the correctly spelled option parses and carries its value",
       "a parser that refuses everything makes every row above it pass and the tools unusable");
}

// ---------------------------------------------------------------------------------------------------------
sec("2. A VALUE THAT IS NOT THERE IS NOT A VALUE");
// ---------------------------------------------------------------------------------------------------------
{
    const r = run(["--read"]);
    ok(r.errors.length === 1 && /--read needs a value and got nothing/.test(r.errors[0]),
       "!! a trailing option with no value is refused", r.errors[0] || "(none)");
    const r2 = run(["--budget", "--json"]);
    ok(r2.errors.some((e) => /--budget needs a value and got --json/.test(e)),
       "!! *** `--budget --json` does NOT read the flag as the budget ***",
       "it used to: Number('--json') is NaN, every gate compares ms <= NaN, and an EMPTY SWEEP REPORTS SUCCESS");
    ok(r2.flags.has("--json") && r2.errors.length === 1,
       "!! ...and the flag it swallowed is still parsed, so one mistake makes one error",
       `${r2.errors.length} error(s). Consuming the next token would report on the wrong thing twice`);
}

// ---------------------------------------------------------------------------------------------------------
sec("3. A NUMBER IS A POSITIVE FINITE NUMBER, OR IT IS A REFUSAL");
// ---------------------------------------------------------------------------------------------------------
{
    ok(run(["--budget", "abc"]).errors.some((e) => /positive number and got "abc"/.test(e)),
       "!! a non-numeric value is refused rather than becoming NaN", "NaN selects no gate and reports a clean run");
    ok(run(["--budget", "0"]).errors.length === 1 && run(["--budget", "-5"]).errors.length === 1,
       "!! ...and so are zero and negatives",
       "all three are a run that selects nothing and then says it ran. An empty sweep that says ALL GREEN is " +
       "the worst output this tree can produce");
    const good = run(["--budget", "3000"]);
    ok(!good.errors.length && good.values["--budget"] === 3000 && typeof good.values["--budget"] === "number",
       "CONTROL: a real budget parses, as a number and not a string", "3000, not \"3000\" -- the compare is numeric");
    ok(!run(["--budget", "2.5"]).errors.length,
       "CONTROL: a fractional value is a number too, and is not refused for being one", "the rule is finite and positive, not integral");
}

// ---------------------------------------------------------------------------------------------------------
sec("4. A BARE WORD BELONGS TO NOTHING");
// ---------------------------------------------------------------------------------------------------------
{
    const r = run(["w4.json"]);
    ok(r.errors.length === 1 && /unexpected argument "w4.json"/.test(r.errors[0]),
       "a value with no option is refused", "`quickSweep w4.json` is a reasonable thing to type and means nothing");
    ok(!/did you mean/.test(r.errors[0]), "...and is NOT offered a spelling correction",
       "a filename is not a misspelled option, and guessing at one would be noise");
}

// ---------------------------------------------------------------------------------------------------------
sec("5. THE DISTANCE IS A DISTANCE, NOT A CONSTANT");
// ---------------------------------------------------------------------------------------------------------
{
    ok(editDistance("--gates", "--gate") === 1 && editDistance("", "abc") === 3 && editDistance("abc", "abc") === 0,
       "editDistance is the real thing on three hand-checked pairs", "1, 3, 0");
    const known = ["--budget", "--read", "--json"];
    ok(nearestOption("--reed", known) === "--read", "the nearest option is the nearest one", "--reed -> --read");
    ok(nearestOption("--wildlyDifferentThing", known) === null,
       "!! ...and something nothing is near gets NO suggestion",
       "a suggestion offered for every typo is a suggestion that carries no information -- the bound is 3 edits");
}

// ---------------------------------------------------------------------------------------------------------
sec("6. TWO REAL COMMAND LINES, REFUSED AND THEN RUN");
// ---------------------------------------------------------------------------------------------------------
// The defect was IN a command line. A row that calls parseArgs directly passes on a build whose CLI never
// calls it, which is how the --json branch rotted one round ago in this very tool.
{
    const node = process.execPath;
    // *** THE TIMEOUT IS PART OF THE CLAIM. *** A refusal is 81 ms; if one of these takes longer than a few
    // seconds the tool did NOT refuse, which is the whole defect. Measured while sabotaging this gate:
    // making parseArgs accept unknown options sent the refusal row into a real 32-minute sweep and the
    // harness hung. A bound turns that into a fast red, and an unbounded one turns it into a hang -- and a
    // hang is not a verdict, the same rule this file's neighbours keep rediscovering.
    const cli = (rel, argv, ms = 20000) => spawnSync(node, [path.join(ENG, rel), ...argv], { cwd: ENG, encoding: "utf8", timeout: ms });

    const qs = cli("tools/ship/quickSweep.mjs", ["--reed", "w4.json"]);
    ok(qs.status === 2 && /unknown option --reed -- did you mean --read\?/.test(qs.stderr || ""),
       "!! *** quickSweep REFUSES the typo, exit 2, before enumerating a single gate ***",
       `exit ${qs.status}. It used to run for 1,914 s and then crash`);
    ok(/nothing was run/.test(qs.stderr || "") && !/gates under/.test(qs.stdout || ""),
       "!! ...and says so, with no sweep line anywhere in its output",
       "the refusal has to be legible or it is another silence");

    const rot = cli("tools/ship/sweepRotation.mjs", ["--gates", "eulerGpu"]);
    ok(rot.status === 2 && /did you mean --gate\?/.test(rot.stderr || ""),
       "!! *** sweepRotation refuses --gates and names --gate ***",
       `exit ${rot.status}. This tool WRITES sweep-timings.json, so an argument it misreads becomes a number the tree carries`);

    // *** AND BOTH STILL RUN. *** Driven on the cheapest true invocation each has.
    const qsGood = cli("tools/ship/quickSweep.mjs", ["--read", path.join(ENG, "tools", "ship", "cliArgs-fixture.json")]);
    ok(qsGood.status !== 2 || !/unknown option/.test(qsGood.stderr || ""),
       "CONTROL: a correctly spelled quickSweep option is not refused",
       "a missing fixture file is a different failure from a rejected argument, and only the second one is this gate's");
    // The one row that legitimately RUNS something gets its own, larger bound.
    const rotGood = cli("tools/ship/sweepRotation.mjs", ["--gate", "tools/ship/timingSemantics-selfcheck.mjs", "--budget-s", "30"], 90000);
    ok(rotGood.status === 0 && /selection by name rather than by staleness/.test(rotGood.stdout || ""),
       "CONTROL: and the rotation still runs the one gate it is asked for, dry",
       `exit ${rotGood.status}. Without this the refusal rows pass on a parser that rejects everything`);
}

// ---------------------------------------------------------------------------------------------------------
sec("7. THE CENSUS OF WHAT IS STILL SILENT, DERIVED RATHER THAN CLAIMED");
// ---------------------------------------------------------------------------------------------------------
// *** THE FIRST DRAFT OF THIS SECTION WAS WRONG THREE WAYS AND THE GATE CAUGHT ALL THREE. *** It grepped
// for `const arg = (n`, which (a) matched cliArgs.mjs, whose header QUOTES the idiom it hunts -- the third
// hunter this session to fire on the prose describing its own quarry -- (b) matched the two REPAIRED tools,
// whose new reader is spelled the same way, and (c) MISSED packRelease, ship and refreshReleases, which
// commit the defect under different spellings. The detector is a SHAPE now: argv indexOf'd, next element
// returned. 5 hand-typed names became 13 derived ones.
{
    const fs = await import("node:fs");
    const live = silentReaders(path.join(ENG, "tools", "ship"), { fs: fs.default, path });
    const recorded = [...SILENT_AT_V4647G.tools].sort();
    ok(JSON.stringify(live) === JSON.stringify(recorded),
       "!! *** the tools still taking arguments the silent way are DERIVED, and match the record ***",
       `live ${live.length}, recorded ${recorded.length}. The first draft said ${SILENT_AT_V4647G.firstDraftSaid}`);
    ok(live.length > SILENT_AT_V4647G.firstDraftSaid,
       "...and the derived population is LARGER than the hand-typed one it replaced",
       `${live.length} against ${SILENT_AT_V4647G.firstDraftSaid}. A list typed from a grep is a claim about ` +
       `a spelling; three tools commit this under spellings that grep did not match`);
    ok(SILENT_AT_V4647G.adopted.every((m) => !live.includes(m)),
       "!! neither adopted tool is on the list, so the detector does not fire on the repair",
       SILENT_AT_V4647G.adopted.join(", ") + " -- their reader is `(n in cli.values ...)`, and the first " +
       "detector matched it anyway");
    ok(!live.includes(HUNTER) && SILENT_READER.test(fs.default.readFileSync(path.join(ENG, HUNTER), "utf8")),
       "!! *** the hunter EXCLUDES ITSELF BY PATH, and the exclusion is load-bearing ***",
       "cliArgs.mjs matches its own pattern -- its header quotes the idiom. Excluded by path and said so, " +
       "exactly as the licence scan was after it flagged the comment explaining it");

    // Three spellings the shape catches and a name-grep does not. Named, because they are the evidence.
    for (const m of ["tools/ship/packRelease.mjs", "tools/ship/ship.mjs", "tools/ship/refreshReleases.mjs"])
        ok(live.includes(m), `...including ${m.split("/").pop()}, which the first detector missed`,
           "a different helper name, or indexOf('--' + name), or a local argv -- same defect");

    const spell = SILENT_AT_V4647G.gateSpellings;
    const livesIn = (opt, mod) => new RegExp(`"${opt}"`).test(fs.default.readFileSync(path.join(ENG, mod), "utf8"));
    ok(spell["--gates"].every((m) => livesIn("--gates", m)) && spell["--gate"].every((m) => livesIn("--gate", m)),
       "!! *** both spellings of the gate option are still live in this directory, and the record says which is where ***",
       "--gates in failLines and recordInputs (a LIST), --gate in sweepRotation (ONE). NOT unified: two " +
       "different asks, and merging them would be a silent widening. Refused and corrected instead");
    ok(refusalLines("t", ["x"], SPEC).some((l) => /options: --budget --read/.test(l)),
       "the refusal lists the options the tool actually takes", "a refusal that does not say what IS accepted is half a message");
}

console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nALL GREEN");
console.log("unchecked here: the thirteen tools in SILENT_AT_V4647G. They still ignore an unknown option, and " +
    "that is a CEILING rather than a target -- the two converted are the two whose silence cost something " +
    "measured (32 minutes of sweep; a cap reading written into the timings file). Converting eleven more in " +
    "the round that found the first two would be a change made on a hunch, and the DERIVED census above is " +
    "what keeps them countable instead of forgotten -- a hand-typed one already said five.");
process.exit(fails ? 1 : 0);
