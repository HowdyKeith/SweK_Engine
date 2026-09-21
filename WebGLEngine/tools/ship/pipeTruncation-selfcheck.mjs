// WebGLEngine/tools/ship/pipeTruncation-selfcheck.mjs -- v4640
//
// Run: node tools/ship/pipeTruncation-selfcheck.mjs
//
// *** A GATE THAT CALLS process.exit() THROWS AWAY ITS OWN OUTPUT WHEN ANYTHING PIPES IT, AND THE SHIP
// RITUAL COUNTS REDS THROUGH A PIPE. ***
//
// Node's process.exit() does not flush pending asynchronous writes. A write to a FILE is synchronous and a
// write to a PIPE is not, so a gate whose report is larger than the pipe buffer keeps all of it under
// `> out.txt` and loses the tail under `| grep`. The exit CODE is unaffected, which is why the sweep's
// verdicts were never wrong and why this went unseen: what is lost is the evidence, not the judgement.
//
// MEASURED ON A REAL GATE. tools/ship/statedRuntime-selfcheck.mjs emitted 70,608 bytes to a file and 65,861
// through a pipe -- 4,747 gone, twelve lines reduced to one, and the line that vanished was its only
// `  FAIL`. The ship skill's own instruction for counting reds is
//
//     node tools/ship/<name>-selfcheck.mjs | grep -c '^  FAIL'
//
// so for that gate the prescribed count read ZERO while the gate was failing. It read zero for me: v4639's
// commit message went out describing statedRuntime as "exits 1 with no FAIL line -- a crash, not a verdict".
// It was never a crash. It is an ordinary red whose evidence the measuring instrument was deleting, and the
// correction is recorded here because a wrong reading and how it was taken is worth more than a quiet fix.
//
// This gate does not ASSERT the mechanism from documentation -- it DRIVES it, on two scripts identical but
// for their last line, so the row cannot rot when Node changes and cannot pass by describing a belief.
//
// SABOTAGES: see the log at the foot of this file.
//
// ---- v4647n -- IT WAS FILED AS "FLAKY: 1 RED IN 5" AND IT WAS RED 11 TIMES IN 12 ------------------------
//
// The phenomenon is not flaky. Re-measured over 25 runs of the identical pair, process.exit() lost output
// in 25 of 25 and process.exitCode lost exactly 0 in 25 of 25. What was flaky was this file's THRESHOLD:
// the row demanded the loss exceed 65,536 bytes, and the loss is bimodal -- 19,520 / 36,905 / 48,983 /
// 49,959 / 50,081 against 172,386 / 233,081 / 233,325 -- so the bound sat between the two modes and held
// in 8 of 25. Nothing about Node moved; the backlog's "1 in 5" was a reading of the same coin toss.
//
// THE BOUND ALSO EXCLUDED THE CASE THIS FILE WAS WRITTEN ABOUT. The header above records statedRuntime
// losing 4,747 bytes -- its only FAIL line. Against 65,536 this row would have called that no loss at all.
//
// The threshold is GONE rather than widened. How much is stranded depends on how far the reader got before
// the writer exited; that is scheduling and no constant describes it. The claim is a CONTRAST and needs no
// bound.
//
// *** AND IT IS NOT AT ZERO, WHICH IS SAID HERE RATHER THAN ROUNDED AWAY. *** After the change: 550 runs,
// 2 reds -- about 0.4%, against 11 in 12 before. NEITHER RED WAS CAPTURED. Both landed in batches run
// immediately after a file write; 320 consecutive runs with the output kept on failure did not reproduce
// one, so there is no line of evidence saying which row went and no hypothesis worth writing down. The
// threshold was the dominant cause and is settled; the remainder is a separate, unexplained thing and the
// backlog keeps it. Stating "fixed" on a 0.4% residual nobody has seen fail is how "flaky: 1 red in 5"
// came to be written about a gate that was red 92% of the time.
//
// v4647n SABOTAGES, RESULTS BY NAME (ten runs each, because the subject is a flake):
//   NA. the 65,536 bound is restored                        -> RED in 9 of 10
//   NB. the control's test becomes `lostOnCode >= 0`        -> 0 of 10   (see below)
//   NC. the control script also calls process.exit          -> RED in 10 of 10
//   ND. A prints twice as much as B                         -> RED in 10 of 10
//   NE. the premise row is deleted along with its clause    -> 0 of 10   (see below)
//
// *** ND MEASURED ZERO UNTIL A ROW WAS ADDED FOR IT. *** `fA === fB` -- the premise that makes the two pipe
// readings comparable at all -- was a clause inside the main row, and deleting it while making one script
// print twice as much changed no verdict, because `lostOnExit > 0` is still true of two scripts that have
// nothing to do with each other. It is its own row now. (A first attempt at ND also measured zero for a
// different reason: it appended a second copy of the body AFTER process.exit(1), which never runs. A
// sabotage that does not change the subject is not a sabotage.)
//
// *** NB AND NE ARE ZERO AND CANNOT BE OTHERWISE, WHICH IS A LIMIT OF THE METHOD RATHER THAN A GAP. ***
// Both replace an assertion with something that cannot fail -- a tautology, or nothing. Running the gate
// cannot detect that its own row was deleted. Those are caught by reading a diff, and they are recorded
// here as zero rather than left out, because a sabotage log that lists only the ones that worked is an
// advertisement.
"use strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { noComments } from "./sourceScan.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const report = (l) => console.log(`  ----  ${l}`);

console.log("pipeTruncation-selfcheck -- a gate that exits before it flushes deletes its own evidence\n");

// -----------------------------------------------------------------------------------------------------------
console.log("1. *** THE MECHANISM, DRIVEN RATHER THAN DESCRIBED ***");
let lostOnExit = 0, lostOnCode = 0;
{
    // The scratch lives in os.tmpdir(), NOT under ENG: a fixture inside the engine root is what v4639 was
    // about, and a gate about output that vanishes should not leave files behind to make the point.
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pipetrunc-"));
    try {
        const body = (last) => 'for (let i = 0; i < 4000; i++) console.log("x".repeat(60));\n' + last + "\n";
        const A = path.join(dir, "exit.mjs"), B = path.join(dir, "code.mjs");
        fs.writeFileSync(A, body("process.exit(1);"));
        fs.writeFileSync(B, body("process.exitCode = 1;"));
        const toFile = (f) => {
            const o = path.join(dir, "o.txt");
            try { execFileSync(process.execPath, [f], { stdio: ["ignore", fs.openSync(o, "w"), "ignore"] }); } catch { /* exit 1 is the point */ }
            return fs.statSync(o).size;
        };
        const toPipe = (f) => {
            try { return execFileSync(process.execPath, [f], { maxBuffer: 1 << 26 }).length; }
            catch (e) { return (e.stdout || "").length; }
        };
        const fA = toFile(A), pA = toPipe(A);
        const fB = toFile(B), pB = toPipe(B);
        lostOnExit = fA - pA; lostOnCode = fB - pB;
        report(`process.exit(1)       file ${fA}  pipe ${pA}  lost ${lostOnExit}`);
        report(`process.exitCode = 1  file ${fB}  pipe ${pB}  lost ${lostOnCode}`);
        // *** v4647n -- THE BOUND WAS 65,536 AND IT EXCLUDED THE CASE THIS FILE WAS WRITTEN ABOUT. ***
        //
        // The header twenty lines up records the real instance: statedRuntime-selfcheck emitted 70,608 bytes
        // to a file and 65,861 through a pipe -- 4,747 gone, and the line that vanished was its only FAIL.
        // The row demanded the loss exceed 65,536. Against its own motivating measurement it would have
        // said "no loss here".
        //
        // And it made the gate a coin toss. MEASURED, 25 runs of the identical pair on an idle box:
        //
        //     process.exit()      lost 19,520 / 36,905 / 48,983 / 49,959 / 50,081 / 172,386 / 233,081 / 233,325
        //                         min 19,520, median 50,081, max 233,325 -- LOSS IN 25 OF 25
        //     process.exitCode    lost 0, in 25 of 25, exactly
        //     above the old bound 8 of 25
        //
        // So the PHENOMENON reproduces 100% of the time and the THRESHOLD reproduces 32% of the time. The
        // gate was filed as "flaky: 1 red in 5"; re-measured it is red 11 times in 12, because the loss
        // distribution is bimodal and the bound sits between the two modes. Nothing about Node moved.
        //
        // *** THE THRESHOLD IS GONE, NOT WIDENED. *** How much is stranded depends on how far the reader
        // got before the writer exited -- it is scheduling, and no constant describes it. What the file
        // claims is a CONTRAST, and the contrast needs no bound: the same 244,000 bytes, the same reader,
        // two scripts differing only in their last line, one losing output and the other losing none. A
        // Node that flushed on exit would make `lostOnExit` zero and fail this row; a Node that lost
        // everything would fail the next one. The magnitude is REPORTED, because it is a reading and not a
        // property.
        // *** THE PREMISE, ASSERTED SEPARATELY, BECAUSE SABOTAGE ND SHOWED IT WAS NOT. *** The whole
        // comparison rests on the two scripts writing the SAME bytes -- otherwise a difference between the
        // pipe readings says nothing about exit(). It was a clause inside the row below; deleting it and
        // making one script print twice as much went ZERO RED across ten runs, because the surviving clause
        // (`lostOnExit > 0`) is still true of two scripts that have nothing to do with each other.
        ok("*** the two scripts write the IDENTICAL number of bytes to a file, which is what makes the pipe readings comparable ***",
            fA === fB && fA > 0,
            `${fA} bytes each, to a file, where nothing is lost either way. They differ only in their last ` +
            "line; if they differed in output the comparison below would be measuring the scripts, not exit()");
        // *** v4649 -- THE LOSS IS A POSIX PROPERTY, AND ON WINDOWS THIS ROW WAS A SABOTAGE THAT MEASURED
        // ZERO. *** Keith's rig reported "0 bytes of 244000 never reached the reader" and the row went red
        // for it. That is not a failure to lose output: Node's stdout contract says pipes and sockets are
        // ASYNCHRONOUS on POSIX and SYNCHRONOUS on Windows, so exit() cannot strand a pipe write there. The
        // row was asserting one platform's scheduling as a universal.
        //
        // It is not skipped on Windows and it is not weakened. It asserts the OTHER fact -- that nothing is
        // lost -- from the same measurement, so a Node that made Windows pipes asynchronous goes red on that
        // box, which is exactly when somebody needs to know: the ship ritual counts reds through a pipe, and
        // that counting is SAFE on Windows for this reason and UNSAFE on POSIX, which is why statedRuntime
        // had to be repaired in the first place.
        const POSIX = process.platform !== "win32";
        ok(POSIX
            ? "*** process.exit() LOSES output through a pipe that survives to a file, and the control loses none ***"
            : "*** win32: process.exit() loses NOTHING through a pipe, because pipe writes are synchronous here ***",
            fA === fB && (POSIX ? lostOnExit > 0 : lostOnExit === 0),
            POSIX
              ? `${lostOnExit} bytes of ${fA} never reached the reader. Both scripts print the identical ${fA} ` +
                "bytes; the only difference between them is the last line. The amount is scheduling -- 19,520 " +
                "to 233,325 across 25 runs here -- so it is reported and the row asserts the contrast instead. " +
                "THE CONSEQUENCE: counting reds through `| grep -c` loses evidence on this platform"
              : `${lostOnExit} bytes of ${fA} lost, and ZERO is the right answer on this platform -- Node's ` +
                "stdout contract makes pipes and sockets synchronous on Windows and asynchronous on POSIX. " +
                "The same script strands tens of thousands of bytes on a POSIX box. If this ever reads " +
                "non-zero here, the ritual's `| grep -c '^  FAIL'` has started losing rows on this box too");
        // *** AND THE ARM THIS BOX DOES NOT TAKE IS ASSERTED FALSE, SO NEITHER IS A WAY OUT. *** A row that
        // changes its claim by platform can hide a vacuous branch: if the win32 arm were reached on a box
        // that DOES lose output it would simply be wrong, and nothing would say so. Checking the other arm
        // against this same reading is what keeps both honest -- and on POSIX it is also the instrument for
        // task #51's residual, the 0.4% of runs that lost nothing and were never captured. If that happens
        // here, this row names it instead of leaving a mystery red.
        ok("!! CONTROL: the arm this platform does NOT take is FALSE of this box's own measurement",
            (POSIX ? lostOnExit === 0 : lostOnExit > 0) === false,
            POSIX ? `lost ${lostOnExit} on ${process.platform}, so the win32 claim (lose nothing) is false here ` +
                    "-- the two arms are not interchangeable and this box cannot pass under the wrong one. " +
                    "A red on THIS row with a POSIX platform is the unexplained residual, captured at last"
                  : `lost ${lostOnExit} on win32, so the POSIX claim (lose something) is false here`);
        ok("  ...and process.exitCode loses NOTHING, so the repair is the line and not the volume",
            lostOnCode === 0,
            `${fB} bytes written, ${pB} read. Setting the code lets the process end normally, and a normal end flushes.`);
        ok("  and the exit STATUS is the same either way, which is why a sweep's verdict was never wrong",
            (() => { const st = (f) => { try { execFileSync(process.execPath, [f], { stdio: "ignore" }); return 0; } catch (e) { return e.status; } };
                     return st(A) === 1 && st(B) === 1; })(),
            "both exit 1. Only the EVIDENCE was lost, which is the half a reader needs and a ratchet does not");
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

// -----------------------------------------------------------------------------------------------------------
console.log("\n2. *** AND THE GATE IT ACTUALLY BIT ***");
{
    const SR = path.join(ENG, "tools", "ship", "statedRuntime-selfcheck.mjs");
    // *** COMMENT-STRIPPED, BECAUSE THE FIRST VERSION OF THIS ROW READ ITS OWN SUBJECT'S PROSE AS CODE. ***
    // statedRuntime's repair carries a note explaining what `process.exit(1)` did to it, and a raw-text scan
    // found that literal and reported the gate unrepaired. The tree names this trap in sourceScan.mjs and
    // this file walked into it on its first run, which is the shortest distance between a rule and its
    // counterexample in this session.
    const src = noComments(fs.readFileSync(SR, "utf8"));
    ok("*** statedRuntime-selfcheck sets process.exitCode rather than calling process.exit ***",
        /process\.exitCode = 1/.test(src) && !/process\.exit\(1\)/.test(src),
        "it emitted 70,608 bytes to a file and 65,861 through a pipe before v4640, and the 4,747 that " +
        "vanished contained its only FAIL line");
    // *** AND THE `else` IS A ROW, BECAUSE THE FIRST VERSION OF THE REPAIR DID NOT HAVE ONE. ***
    // process.exit() stopped execution and process.exitCode does not, so leaving the two final lines
    // sequential made a failing run print "1 FAILURES" and then "all checks pass" -- a gate contradicting
    // itself in its last two lines, introduced by the round that was repairing its output.
    ok("  ...and the pass line is an `else`, so a failing run cannot also claim to pass",
        /process\.exitCode = 1; \}\s*\n\s*else console\.log/.test(src),
        "the repair that makes output survive also makes the code after it run, which is the trap in " +
        "swapping one for the other");
}

// -----------------------------------------------------------------------------------------------------------
console.log("\n3. *** HOW BIG THE EXPOSED POPULATION ACTUALLY IS, MEASURED ONCE AND NAMED WITH ITS GAP ***");
{
    // *** 1,717 GATES CALL process.exit(). THAT IS THE EXPOSURE, NOT THE DAMAGE. *** The mechanism only bites
    // a gate whose output exceeds the pipe buffer, so the question that matters is how many do. Every gate in
    // the tree was run once and its stdout+stderr measured, 4 workers at a 20 s cap:
    //
    //     1,737 measured, 137 cut off at the cap (size unknown)
    //     OVER 65,536 bytes: ONE -- tools/ship/statedRuntime-selfcheck.mjs at 70,608
    //     largest that FINISHED and is under: murmurKit-selfcheck at 32,803, less than half the buffer
    //
    // So the damage is one gate, and it is the gate that made this round happen. The 137 are the honest gap
    // and are NOT waved at: a gate slow enough to hit a 20 s cap is exactly the kind that prints a line per
    // item, and any one of them could be over. Re-deriving this costs a full serial pass, which is why the
    // set is frozen with its date rather than recomputed here.
    const MEASURED_V4640 = Object.freeze({
        at: "v4640", gates: 1737, capMs: 20000, cutOff: 137, pipeBuffer: 65536,
        over: Object.freeze(["tools/ship/statedRuntime-selfcheck.mjs"]),
        largestUnder: Object.freeze({ gate: "tools/ship/murmurKit-selfcheck.mjs", bytes: 32803 }),
    });
    report(`${MEASURED_V4640.gates} gates measured at v4640, ${MEASURED_V4640.cutOff} cut off at the ` +
        `${MEASURED_V4640.capMs} ms cap; ${MEASURED_V4640.over.length} over a ${MEASURED_V4640.pipeBuffer}-byte buffer`);
    // The PROPERTY, over the set that was measured: anything above the buffer must not call process.exit().
    // A count would go stale the moment a gate got chattier; this asks the thing that matters of each member.
    const offenders = MEASURED_V4640.over.filter((g) => {
        const src = noComments(fs.readFileSync(path.join(ENG, g), "utf8"));
        return /process\.exit\s*\(/.test(src);
    });
    ok("*** every gate measured OVER the pipe buffer sets its exit code instead of calling process.exit ***",
        MEASURED_V4640.over.length > 0 && offenders.length === 0,
        offenders.length ? "still calling process.exit: " + offenders.join(", ")
                         : `${MEASURED_V4640.over.length} over the buffer, ${offenders.length} still truncating`);
    ok("  ...and the set is not empty, which would make the row above vacuous",
        MEASURED_V4640.over.length > 0,
        "a population of zero would pass this check while saying nothing; the one member is real and measured");
    report(`NOT MEASURED: ${MEASURED_V4640.cutOff} gates were cut off at the cap and their output size is ` +
        "unknown. A gate slow enough to be killed is the shape most likely to be verbose, so this figure is a " +
        "FLOOR on the exposed population and not a count of it.");
}

console.log(fails ? `\npipeTruncation-selfcheck: ${fails} FAILED` : "\npipeTruncation-selfcheck: all checks pass");
console.log("\nunchecked here: WHICH OTHER GATES ARE EXPOSED. Every gate over the pipe buffer that calls " +
    "process.exit() has this, and the population is being measured separately -- this file drives the " +
    "mechanism and holds the one gate known to have lost output to it. Also unchecked: whether any FROZEN " +
    "capture of a gate's stdout was taken through a pipe and is therefore short -- tools/ship/register-audit.mjs " +
    "stores such captures, and v4639 found one of them had already lost text for an unrelated reason.");
process.exitCode = fails ? 1 : 0;
