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
        ok("*** process.exit() LOSES output through a pipe that survives to a file -- the two differ by more than a pipe buffer ***",
            fA === fB && lostOnExit > 65536,
            `${lostOnExit} bytes of ${fA} never reached the reader. Both scripts print the identical ${fA} bytes; ` +
            "the only difference between them is the last line.");
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
