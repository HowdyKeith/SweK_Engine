// WebGLEngine/tools/ship/thrownRow-selfcheck.mjs -- v4662
//
// Run: node tools/ship/thrownRow-selfcheck.mjs
//
// *** A GATE THAT THROWS REPORTS NOTHING, AND THE SHIP COUNTS FAIL ROWS. ***
//
// Every claim here is DRIVEN on a real child process, because the thing under test is what a process PRINTS
// and what it EXITS with, and neither can be asked of a function call in this one.
//
// SABOTAGES, RESULTS BY NAME:
//   A. the net sets process.exitCode = 0, so a dead gate leaves green    -> RED (6 rows)
//   B. the unhandledRejection handler is deleted                          -> 0 red   (see below)
//   C. describeThrow falls back to String(e) for a non-Error              -> RED (6 rows)
//   D. the FAIL row is written to stderr instead of stdout                -> RED (6 rows)
//   E. the re-entry guard is removed                                      -> RED (1 row)
//   F. the net calls process.exit(1) instead of setting the code          -> RED (2 rows)
//   G. one of the four netted gates loses its reportThrows line           -> RED (1 row)
//
// *** B IS ZERO AND THE ZERO IS THE FINDING, NOT A GAP. *** This section was headed "one handler is half a
// net" and deleting half of it changed nothing, because on node 22.22.2 the default --unhandled-rejections
// mode is `throw` and a rejection is delivered to uncaughtException once a handler is installed there.
// Measured both ways. The second handler is kept for a node started with --unhandled-rejections=warn, where
// it is the only door -- and it is NOT called the fix, which is v3436's rule and serverShutdown's precedent.
// There is now a row that drives that fact rather than a header that asserted the opposite.
//
// *** AND E's FIRST FIXTURE WAS A SABOTAGE THAT DID NOT CHANGE THE SUBJECT. *** It threw from the CLEANUP,
// which cannot re-enter the handler -- the cleanup runs inside a try/catch there and is swallowed -- so
// deleting the guard went 0 red. The shape that really prints two verdicts is a SECOND throw arriving from
// a timer the first did not cancel, which is what a gate holding an open browser has. Re-pointed, the guard
// is load-bearing and the sabotage bites.
"use strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { codeOnly } from "./sourceScan.mjs";
import { describeThrow } from "./thrownRow.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const MOD = path.join(ENG, "tools", "ship", "thrownRow.mjs");
let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const report = (l) => console.log(`  ----  ${l}`);

console.log("thrownRow-selfcheck -- a gate that throws reports nothing, and the ship counts FAIL rows\n");

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "thrownrow-"));
/**
 * Run a one-off gate-shaped script and report what a reader, and the ritual, would actually see.
 *
 * *** ONE SPAWN, NOT TWO, AND THE REASON IS THE BUDGET. *** The first version ran each fixture twice -- once
 * for stdout+stderr together and once for stdout alone, because the ritual's own instruction is
 * `node <gate> | grep -c '^  FAIL'` and grep reads stdout only. Fourteen fixtures became twenty-eight node
 * starts and the gate came in at 3,117 ms against a 3,000 ms membership threshold, which would have exiled
 * it from every ship -- the exact defect the round beside this one is about. spawnSync separates the two
 * streams in one run, so the distinction is kept and the second start is not.
 */
const drive = (body) => {
    const f = path.join(dir, "g" + FIXTURES++ + ".mjs");
    fs.writeFileSync(f, body);
    const r = spawnSync(process.execPath, [f], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    const stdout = r.stdout || "";
    return { status: r.status, out: stdout + (r.stderr || ""), stdout,
             failRows: (stdout.match(/^ {2}FAIL/gm) || []).length };
};
let FIXTURES = 0;
const OK_LINE = 'const ok = (l,c,n="") => console.log(`  ${c?"PASS":"FAIL"}  ${l}${n?"   "+n:""}`);\n';
const NET = `import { reportThrows } from ${JSON.stringify(MOD)};\n`;

try {
// -----------------------------------------------------------------------------------------------------------
console.log("1. *** THE DEFECT, DRIVEN: A GATE THAT THROWS EXITS 1 AND THE RITUAL COUNTS ZERO REDS ***");
{
    // *** THE THROWN VALUE IS AN OBJECT AND NOT AN Error, WHICH IS WHAT COMES BACK ACROSS A page.evaluate. ***
    const body = OK_LINE + 'ok("the source half is fine", true);\nthrow { code: "ERR_X", detail: { port: 8787 } };\n';
    const bare = drive(body);
    report(`without the net: exit ${bare.status}, ${bare.failRows} FAIL row(s) on stdout`);
    ok("*** a gate that throws exits NONZERO and prints NOT ONE FAIL ROW -- the ritual counts it as green ***",
        bare.status === 1 && bare.failRows === 0,
        "exit " + bare.status + ", " + bare.failRows + " rows. `node <gate> | grep -c '^  FAIL'` is the " +
        "ship skill's own instruction for counting reds, and on this gate it reads ZERO while the gate has " +
        "failed. failLines calls this CRASHED rather than RED for exactly that reason: there is no finding");
    // *** AND THE STACK IS NOT MERELY UNHELPFUL, IT IS ABSENT. *** A thrown Error prints frames; a thrown
    // object prints its own inspection and nothing else, so nobody can say which line threw.
    ok("  ...and because it threw an OBJECT rather than an Error, node prints NO STACK AT ALL",
        !/\bat \S+:\d+:\d+/.test(bare.out) && /ERR_X/.test(bare.out),
        "node's uncaught handler shows the value and no frames. THAT is why the repair is a described line " +
        "and not just a try/catch: catching it and printing String(e) gives `[object Object]`");

    const netted = drive(NET + OK_LINE + 'reportThrows("probe-selfcheck");\nok("the source half is fine", true);\nthrow { code: "ERR_X", detail: { port: 8787 } };\n');
    report(`with the net:    exit ${netted.status}, ${netted.failRows} FAIL row(s) on stdout`);
    ok("*** with the net the SAME throw becomes a FAIL ROW ON STDOUT, and the exit code is unchanged ***",
        netted.status === 1 && netted.failRows === 1,
        "exit " + netted.status + ", " + netted.failRows + " row. The verdict a sweep reads did not move; " +
        "what moved is whether there is anything to read beside it");
    ok("  ...and the row carries what the object held, which is the only evidence a stackless throw has",
        /ERR_X/.test(netted.stdout) && /8787/.test(netted.stdout) && /NO STACK/.test(netted.stdout),
        "the row names the keys, says outright that there is no stack, and says the value was not an Error");
    // *** THE CONTROL THAT KEEPS THE NET FROM BEING A BLANKET. *** A handler that swallowed everything would
    // make a gate that threw look like a gate that passed, which is worse than the defect.
    ok("!! CONTROL: the net does NOT turn a throwing gate green -- the exit code still says 1",
        netted.status === 1,
        "if this ever reads 0, reportThrows has become a way of hiding a dead gate rather than reporting one");
}

// -----------------------------------------------------------------------------------------------------------
console.log("\n2. *** BOTH SHAPES NODE HAS -- AND MEASURED, EITHER HANDLER ALONE CATCHES BOTH ***");
{
    const rejected = drive(NET + OK_LINE +
        'reportThrows("probe-selfcheck");\nok("one row ran", true);\nPromise.reject(new TypeError("page closed"));\nawait new Promise(r => setTimeout(r, 50));\n');
    ok("*** an UNHANDLED REJECTION is caught too, not only a synchronous throw ***",
        rejected.status === 1 && rejected.failRows === 1 && /page closed/.test(rejected.stdout),
        "a browser half is all promises, so the rejection path is the one it will actually take. " +
        "exit " + rejected.status + ", " + rejected.failRows + " row");
    ok("  ...and an Error keeps its STACK FRAME, which an object cannot have",
        /\bat \S+/.test(rejected.stdout) && /TypeError/.test(rejected.stdout),
        "the two branches of describeThrow say different things because the two cases carry different " +
        "evidence -- printing 'no stack' for an Error would throw away the one thing it has");
    // *** AND THE SECOND HANDLER IS NOT LOAD-BEARING ON THIS NODE, WHICH IS SAID RATHER THAN IMPLIED. ***
    // The section above used to be headed "one handler is half a net", and deleting the unhandledRejection
    // line went ZERO RED across the whole gate. It is not a gap in the sabotage: on node 22.22.2 the default
    // --unhandled-rejections mode is `throw`, so a rejection nobody handled is delivered to
    // uncaughtException once a handler is installed there. Measured both ways, alone:
    //
    //     only uncaughtException  installed -> a REJECTION reaches it
    //     both                    installed -> unhandledRejection is the one that fires
    //
    // So the second handler is REACHED and is not dead, and it is also not what makes the net work here.
    // It is kept for the box this measurement cannot reach: --unhandled-rejections=warn is a supported mode
    // and a fleet member could be started under it, and there the rejection arrives ONLY through the
    // rejection handler. Same argument serverShutdown's steps 1 and 2 are kept under -- and the same rule,
    // v3436's: an advertised thing that moves no observable is a documented defect, so it is documented.
    const soloSync = drive(NET + OK_LINE +
        'process.removeAllListeners("unhandledRejection");\nreportThrows("probe-selfcheck");\nprocess.removeAllListeners("unhandledRejection");\nPromise.reject(new TypeError("page closed"));\nawait new Promise(r => setTimeout(r, 50));\n');
    ok("!! *** with the REJECTION handler removed the rejection still lands, because node routes it to uncaughtException ***",
        soloSync.status === 1 && soloSync.failRows === 1,
        "exit " + soloSync.status + ", " + soloSync.failRows + " row. This is the row that stops the second " +
        "handler being sold as the fix: it is a fallback for a node started with --unhandled-rejections=warn, " +
        "not the thing that catches a rejection today");
    // *** AND A GATE THAT DOES NOT THROW MUST BE UNTOUCHED, or the net is a permanent red. ***
    const clean = drive(NET + OK_LINE + 'reportThrows("probe-selfcheck");\nok("all fine", true);\nconsole.log("probe-selfcheck: all checks pass");\n');
    ok("!! CONTROL: a gate that does NOT throw is unchanged -- exit 0, no row, its own verdict intact",
        clean.status === 0 && clean.failRows === 0 && /all checks pass/.test(clean.stdout),
        "exit " + clean.status + ", " + clean.failRows + " rows. Installing the net on 1,700 gates would be " +
        "worthless if it cost one of them a false red");
    // *** ONE VERDICT, NOT TWO. *** The handler fires for the throw AND could fire again for a cleanup that
    // throws, and a gate printing two contradicting verdict lines is the defect pipeTruncation found at v4640.
    // *** AND THE FIXTURE FOR THIS WAS WRONG THE FIRST TIME, WHICH IS HOW THE GUARD GOT ITS REAL REASON. ***
    // It threw from the CLEANUP, and that cannot produce a second verdict: the cleanup runs inside a try/catch
    // in the handler, so it is swallowed and the handler never re-enters. Deleting the `fired` guard went
    // ZERO RED against it -- a sabotage that does not change the subject. The shape that DOES produce two
    // verdicts is a SECOND throw arriving later, from a timer the first throw did not cancel, which is
    // exactly what a gate with an open browser has: measured on a bare handler, two throws print two
    // verdicts. That is a gate contradicting itself in its own output, and it is what `fired` is for.
    const twice = drive(NET + OK_LINE +
        'reportThrows("probe-selfcheck");\nsetTimeout(() => { throw new Error("second, from a timer"); }, 30);\nthrow new Error("first");\nawait new Promise(r => setTimeout(r, 80));\n');
    ok("*** a SECOND throw arriving later does not print a second verdict line ***",
        (twice.stdout.match(/probe-selfcheck: 1 FAILED/g) || []).length === 1 &&
        /first/.test(twice.stdout) && !/second, from a timer/.test(twice.stdout),
        "one verdict, naming the FIRST failure. Without the guard the same script prints two, and a gate " +
        "whose last two lines contradict each other is what v4640 found when process.exit was swapped for " +
        "process.exitCode -- the same defect from the other end");
}

// -----------------------------------------------------------------------------------------------------------
console.log("\n3. *** IT SETS THE CODE RATHER THAN CALLING process.exit, FOR v4661's REASON ***");
{
    const src = codeOnly(fs.readFileSync(MOD, "utf8"));
    ok("*** reportThrows sets process.exitCode and never calls process.exit ***",
        /process\.exitCode = 1/.test(src) && !/process\.exit\s*\(/.test(src),
        "this handler runs in a process that may have a wasm module behind it, and v4661 measured what " +
        "exiting there does: V8's compiler pool is still working, and disposing the platform underneath it " +
        "trips win/async.c's UV_HANDLE_CLOSING assertion. A net that aborts the process is not a net");
    // Driven rather than read: a source scan cannot tell a call that is there from one that runs.
    const drained = drive(NET + OK_LINE +
        'reportThrows("probe-selfcheck");\nsetTimeout(() => console.log("  ----  the loop kept running"), 30);\nthrow new Error("boom");\n');
    ok("  ...and the loop really does drain afterwards, which is what the code being set rather than forced means",
        drained.status === 1 && /the loop kept running/.test(drained.stdout),
        "a timer scheduled before the throw still fires, and the process still leaves with 1. " +
        "process.exit() would have killed the timer and the pending flush with it");
}

// -----------------------------------------------------------------------------------------------------------
console.log("\n4. *** describeThrow ON EVERY SHAPE A THROW CAN BE ***");
{
    const cases = [
        ["an Error", new TypeError("nope"), /THREW TypeError: nope.*at /],
        ["a bare object", { a: 1 }, /THREW an Object, NOT AN ERROR.*\{"a":1\}/],
        ["a string", "just a string", /THREW a String, NOT AN ERROR/],
        ["null", null, /THREW a null, NOT AN ERROR/],
        ["undefined", undefined, /THREW an undefined, NOT AN ERROR/],
    ];
    for (const [name, value, re] of cases) {
        const line = describeThrow(value);
        ok(`  ${name} is described, on one line, with what it carries`, re.test(line), line.slice(0, 120));
    }
    // *** A CIRCULAR OBJECT IS THE ONE THAT BREAKS A NAIVE DESCRIBER, and the describer runs inside the
    // handler for a gate that has already failed -- a throw in there would leave no output at all. ***
    const circ = { name: "loop" }; circ.self = circ;
    let line = "";
    let threw = false;
    try { line = describeThrow(circ); } catch { threw = true; }
    ok("!! *** a CIRCULAR object does not make the describer throw inside the handler that is describing a throw ***",
        !threw && /not serialisable|loop/.test(line),
        threw ? "describeThrow itself threw -- the gate would print nothing at all" : line.slice(0, 120));
}

// -----------------------------------------------------------------------------------------------------------
console.log("\n5. *** WHO CARRIES THE NET, AND THE HONEST SIZE OF WHO DOES NOT ***");
{
    const walk = (d, out = []) => {
        for (const e of fs.readdirSync(d, { withFileTypes: true })) {
            if (/node_modules|^\.|vendor|GPU_Assets|demos_code/.test(e.name)) continue;
            const f = path.join(d, e.name);
            if (e.isDirectory()) walk(f, out); else if (/-selfcheck\.mjs$/.test(e.name)) out.push(f);
        }
        return out;
    };
    const gates = walk(ENG);
    // *** PRE-FILTERED ON THE RAW TEXT BEFORE LEXING, AND THAT IS A BUDGET FACT. *** codeOnly is a
    // character-by-character lexer and this section asks two questions of 1,761 files; running it over all of
    // them cost more than a second, on a gate whose whole point is that it must stay inside the 3,000 ms
    // membership threshold. The literal is a NECESSARY condition for every match, so skipping the files
    // without it costs one indexOf -- the same move windowsImport-selfcheck records for the same reason.
    const src = new Map();
    const textOf = (f) => { let t = src.get(f); if (t === undefined) { t = fs.readFileSync(f, "utf8"); src.set(f, t); } return t; };
    const launchers = gates.filter((f) => { const t = textOf(f);
        return t.includes("chromium.launch") && /chromium\.launch\s*\(/.test(codeOnly(t)); });
    // *** THE NET'S POPULATION IS NOT THE LAUNCHERS' POPULATION, AND THE FIRST VERSION OF THIS SECTION
    // CONFLATED THEM AND WENT RED FOR IT. *** It counted the net only among browser-launching gates and then
    // compared that to a list of four, one of which -- boot-trace -- launches no browser at all: it spawns
    // node children and binds a port. 3 against a floor of 4, and the gate was right. A throw is a throw;
    // what needs the net is a gate that reaches OUT OF THIS PROCESS, and a browser is one way of several.
    // *** AND THIS FILE IS EXCLUDED BY IDENTITY, because it counted ITSELF on the first run. *** It writes
    // `reportThrows` into the fixtures it drives and into the regex that finds the population, so a raw scan
    // reported five netted gates when four carry the net -- the scanner reading its own prose, which is the
    // trap this tree has now walked into in a comment, in a string, in a test fixture and in a census regex.
    // codeOnly blanks string CONTENT and not regex literals, so the strip alone is not enough here: the
    // exclusion is by import.meta.url, so a rename cannot silently re-open it.
    const SELF = fileURLToPath(import.meta.url);
    const carries = (f) => { if (f === SELF) return false; const t = textOf(f);
        return t.includes("reportThrows") && /reportThrows\s*\(/.test(codeOnly(t)); };
    const netted = gates.filter(carries);
    const nettedLaunchers = launchers.filter(carries);
    report(`${gates.length} gates, ${netted.length} carry the net; ${launchers.length} launch a browser and ` +
        `${nettedLaunchers.length} of those are netted`);
    // *** A RATCHET AND NOT A TARGET, and the reason is measured rather than asserted: this box cannot
    // reproduce a single one of these throws. Every gate named below is GREEN here. Installing the net on a
    // hundred and ten gates on that evidence would be a hundred and ten untested edits to close a defect
    // nobody here can see, which is how a repair becomes the next round's finding. What ships is the four
    // the rig actually filed, and a floor that cannot fall.
    const NETTED_AT_V4662 = Object.freeze([
        "ai-bridge/tools/boot-trace-selfcheck.mjs",
        // *** THE ONE CAUGHT ON THIS BOX RATHER THAN ON THE RIG, which is why it is the one with a diagnosis:
        // a fixed 6,000 ms sleep used as a readiness test, then a dereference of the dock tab that had not
        // appeared under six-way load. Green alone, dead in company, and dead WITHOUT A FAIL ROW. Found by
        // v4662's run of the 361 gates outside the sweep, repaired to wait for the thing, and netted.
        "simulation/carrySpawn-selfcheck.mjs",
        "tools/roundhouse/magmapDefault-selfcheck.mjs",
        "tools/ship/atmosphere-selfcheck.mjs",
        "tools/ship/perspectiveWarp-selfcheck.mjs",
    ]);
    const missing = NETTED_AT_V4662.filter((r) => !/reportThrows\s*\(/.test(fs.readFileSync(path.join(ENG, r), "utf8")));
    ok("*** every gate MEASURED to have died without a FAIL row carries the net ***",
        missing.length === 0 && NETTED_AT_V4662.length === 5,
        missing.length ? "lost it: " + missing.join(", ")
                       : NETTED_AT_V4662.length + " named by a real crash -- four from the rig's capture and " +
                         "one from this box's own exiled-gate pass -- all netted");
    ok("  ...and the netted count is a FLOOR that cannot fall",
        netted.length >= NETTED_AT_V4662.length,
        `${netted.length} gates carry it against a floor of ${NETTED_AT_V4662.length}`);
    report(`NOT NETTED: ${launchers.length - nettedLaunchers.length} gates launch a browser without it. That is the ` +
        "exposed population and it is REPORTED rather than ratcheted to zero: every one of them is green on " +
        "this box, so there is no evidence here to edit them against, and a hundred blind edits is how a " +
        "repair becomes the next round's finding. The rig names them one at a time and they get the net one " +
        "at a time.");
}

console.log(fails ? `\nthrownRow-selfcheck: ${fails} FAILED` : "\nthrownRow-selfcheck: all checks pass");
console.log("\nunchecked here: WHAT THE RIG'S GATES ACTUALLY THROW. Not one of the four reproduces on this " +
    "box -- all four are green here and all four came back CRASHED from Windows -- so this round ships the " +
    "instrument and not the diagnosis. The next clone-verify prints the line. Also unchecked: whether a " +
    "throw inside the cleanup of a gate holding a real browser leaves the browser open, since the fixtures " +
    "here hold no browser and asserting that needs the thing it is asserting about.");
} finally { fs.rmSync(dir, { recursive: true, force: true }); }
process.exitCode = fails ? 1 : 0;
