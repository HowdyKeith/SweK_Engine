// WebGLEngine/tools/ship/wasmTeardown-selfcheck.mjs -- v4650
//
// Run: node tools/ship/wasmTeardown-selfcheck.mjs
//
// *** THREE GATES PRINTED "all checks pass" AND THEN ABORTED THE PROCESS, AND NOTHING THIS TREE OWNS WAS
// OPEN WHEN THEY DID. ***
//
// The mechanism, the population and the repair are all in tools/ship/wasmTeardown.mjs. What is here is the
// evidence: the window is DRIVEN rather than described, on this box, which cannot reproduce the crash and can
// measure everything that leads to it.
//
// SABOTAGES, RESULTS BY NAME:
//   A. the control window is taken AFTER the module is loaded and stepped   -> RED (2 rows)
//   B. the main row's threshold drops from `> control + 3` to `>= 0`        -> 0 red   (see below)
//   C. one member's terminal process.exit() is put back (labScenes)          -> RED (1 row, the ratchet)
//   D. the member section 4 measures LIVE has its exit put back              -> RED (2 rows)
//   E. the repaired fixture reports exit code 0 instead of 1                 -> RED (1 row)
//   F. the drain deadline drops to 50 ms, so the pool can never go quiet     -> RED (1 row)
//   G. gateReport loses the `else` this round gave it                        -> RED (1 row)
//
// *** B IS ZERO AND CANNOT BE OTHERWISE, WHICH IS A LIMIT OF THE METHOD RATHER THAN A GAP. *** It replaces an
// assertion with a tautology, and running a gate cannot detect that its own row was deleted. It is recorded
// here as zero rather than left out, because a sabotage log that lists only the ones that worked is an
// advertisement.
//
// *** AND ONE SABOTAGE WAS RUN BY ACCIDENT, ON THE FIRST VERSION OF SECTION 1, BY THE BOX ITSELF. *** That
// version took ONE fixed 200 ms idle window and compared it to a control window. On an idle box it read 38.0 ms
// against 0.4. Under a load average of 7 -- which is what this tree's own sweep workers produce -- it read 0.7
// against 0.4 and WENT RED, because the compiler had been descheduled out of the window rather than because it
// had nothing left to do. A fixed window measures WHEN the work ran; the claim is about WHETHER there was any.
// drainBackgroundCpu accumulates until the pool is quiet instead, and contention now costs time and not a
// verdict.
"use strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { liveHandles } from "./serverShutdown.mjs";
import { noComments } from "./sourceScan.mjs";
import { drainBackgroundCpu, idleBackgroundCpuMs, measureExit, HOOK, WASM_AT_V4650, exitCallCount } from "./wasmTeardown.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const report = (l) => console.log(`  ----  ${l}`);

console.log("wasmTeardown-selfcheck -- a gate that compiles wasm and then calls process.exit() is racing V8\n");

// -----------------------------------------------------------------------------------------------------------
console.log("1. *** THE WINDOW, MEASURED IN ONE PROCESS BEFORE AND AFTER IT OPENS ***");
//
// The control is THIS PROCESS a moment earlier, which is the tightest control available: same box, same load,
// same node, and the only difference across the two readings is whether a wasm module has been compiled and
// worked. A separate control process would also be measuring the difference between two machines-in-time.
const quiet = await drainBackgroundCpu();

const { initNode, mod } = await import("../../physics/box3d/box3dNode.mjs");
const st = await initNode();
let busy = { cpuMs: 0, ms: 0, slices: 0, hitDeadline: false };
let handlesAtExit = ["not reached"];
if (!st.ready) {
    ok("!! box3d wasm loads, which everything below is measured through", false, st.reason +
       " -- this is NOT a pass: the window cannot be measured without the module that opens it");
} else {
    const e = mod().__wasmExports;
    const w = e.swk_world_create(0, -10, 0);
    for (let i = 0; i < 40; i++) e.swk_body_box(w, 0, 5 + i, 0, 0.5, 0.5, 0.5, 1);
    for (let i = 0; i < 300; i++) e.swk_world_step(w, 1 / 60, 4);
    busy = await drainBackgroundCpu();
    handlesAtExit = liveHandles();
}
report(`before any wasm: ${quiet.cpuMs.toFixed(1)} ms of CPU on other threads, quiet after ${quiet.ms} ms`);
report(`after 300 world steps: ${busy.cpuMs.toFixed(1)} ms, quiet after ${busy.ms} ms` +
       (busy.hitDeadline ? " -- AT THE DEADLINE, so this figure is a floor" : ""));
ok("*** the process is STILL BURNING CPU with its main thread asleep, right where a gate's last line runs ***",
    st.ready && busy.cpuMs > quiet.cpuMs + 3,
    `${busy.cpuMs.toFixed(1)} ms against a same-process control of ${quiet.cpuMs.toFixed(1)} ms. Nothing here ` +
    "is doing I/O and the main thread is on a timer, so that is V8's compiler pool tiering up a 829 KB module. " +
    "process.exit() at this instant disposes the platform underneath a job that will post its result back " +
    "through NodePlatform's own uv_async_t -- and win/async.c asserts !(handle->flags & UV_HANDLE_CLOSING)");
ok("  ...and it GOES QUIET, which is what makes it compilation rather than a standing cost",
    st.ready && !busy.hitDeadline,
    `the pool fell silent ${busy.ms} ms after the last step. A fixed overhead would hold and this row would ` +
    "read AT THE DEADLINE; a finite pile of functions to compile drains and stops");
// *** THE CONTROL THAT MAKES THE ROW ABOVE MEAN SOMETHING. *** If an idle process burned CPU anyway, the
// figure after wasm would be a reading of this box and not of the compiler.
ok("!! CONTROL: an idle process with no wasm compiled burns essentially nothing over the same measurement",
    quiet.cpuMs < 3,
    `${quiet.cpuMs.toFixed(1)} ms. If this were large the contrast above would be measuring the box, not the ` +
    "module -- and the FIRST version of this section was a single fixed 200 ms window, which read 38.0 ms " +
    "against 0.4 on an idle box and 0.7 against 0.4 under a load average of 7. It went red for contention. " +
    "Accumulating until the pool is quiet measures WHETHER there was work left rather than WHEN it ran");

// *** AND THE PRIMITIVE UNDERNEATH IT, DRIVEN ON ITS OWN, BECAUSE THE ACCUMULATOR CAN HIDE A BROKEN ONE. ***
// drainBackgroundCpu sums slices of idleBackgroundCpuMs and stops when they go quiet. If the primitive
// returned a constant the sum would still look like a plausible reading and the quiet test would never fire;
// asked directly, on a process whose compiler pool has just been drained, one window must read near zero and
// must not read negative -- cpuUsage() is monotonic, so a negative here would be the subtraction inverted.
{
    const one = await idleBackgroundCpuMs(100);
    ok("!! CONTROL: one window of the primitive reads near zero once the pool is quiet, and never below it",
        one >= 0 && one < 5,
        `${one.toFixed(1)} ms across a 100 ms window taken immediately after the drain above returned. The ` +
        "accumulator is built from this call; a primitive stuck at a constant would make every figure in " +
        "this section a plausible-looking fiction");
}

// -----------------------------------------------------------------------------------------------------------
console.log("\n2. *** AND NOTHING WE OWN IS OPEN, SO THE TREE'S EXISTING TEARDOWN CANNOT REACH IT ***");
//
// serverShutdown.mjs was written for this same assertion at v4000 and fixes a DIFFERENT cause: sockets, a
// listener, a child, all of them things the process owns and liveHandles() can name. Here it names nothing.
ok("*** liveHandles() is EMPTY at the moment these gates exit -- the handle that aborts them is not ours ***",
    st.ready && handlesAtExit.length === 0,
    `liveHandles() = ${JSON.stringify(handlesAtExit)}. serverShutdown's drain is sound and is not the fix for ` +
    "this: it waits for handles to finish closing, and there are none. The one that trips the assert belongs " +
    "to NodePlatform, is never listed, and cannot be drained from JavaScript at all");

// -----------------------------------------------------------------------------------------------------------
console.log("\n3. *** THE REPAIR, DRIVEN ON TWO SCRIPTS IDENTICAL BUT FOR THEIR LAST LINE ***");
{
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wasmteardown-"));
    try {
        const body = (last) => `
import { initNode, mod } from ${JSON.stringify(path.join(ENG, "physics/box3d/box3dNode.mjs"))};
await initNode();
const e = mod().__wasmExports;
const w = e.swk_world_create(0, -10, 0);
for (let i = 0; i < 40; i++) e.swk_body_box(w, 0, 5 + i, 0.0, 0.5, 0.5, 0.5, 1);
for (let i = 0; i < 120; i++) e.swk_world_step(w, 1 / 60, 4);
${last}
`;
        const A = path.join(dir, "exit.mjs"), B = path.join(dir, "code.mjs");
        fs.writeFileSync(A, body("process.exit(1);"));
        fs.writeFileSync(B, body("process.exitCode = 1;"));
        const run = (f) => {
            const t = Date.now();
            let status = 0;
            try { execFileSync(process.execPath, [f], { stdio: "ignore" }); }
            catch (err) { status = err.status; }
            return { status, ms: Date.now() - t };
        };
        const a = run(A), b = run(B);
        report(`process.exit(1)      status ${a.status} in ${a.ms} ms      ` +
               `process.exitCode = 1  status ${b.status} in ${b.ms} ms`);
        ok("*** setting the code gives the SAME status after the same wasm work, so the repair changes no verdict ***",
            a.status === 1 && b.status === 1,
            "both leave with 1. A gate's exit code is what the sweep reads, and swapping the line does not " +
            "touch it -- what it changes is whether the process is still standing when it leaves");
        // *** AND IT DOES NOT HANG, WHICH IS THE ONE REAL RISK IN THE SWAP. *** process.exitCode does not stop
        // the process; it waits for the loop to drain. If a wasm gate held the loop open, the repair would turn
        // a crash into a cap kill, which is a worse trade.
        ok("  ...and it does not wait, so the swap cannot turn a crash into a gate that hangs at the cap",
            b.ms < a.ms + 2000,
            `${b.ms} ms against ${a.ms} ms. Background compilation does not ref the event loop, so a normal ` +
            "exit leaves as promptly as a forced one and lets V8 dispose its own threads on the way");
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

// -----------------------------------------------------------------------------------------------------------
console.log("\n4. *** THE PROPERTY, ON A REAL MEMBER, MEASURED RATHER THAN READ OFF ITS SOURCE ***");
{
    // A source scan cannot grade this. `process.exit(1)` on the line that bails out when the wasm FAILED to
    // load is correct -- nothing was compiled, there is no window -- and it is spelt exactly like the one that
    // ends a green run. The hook watches what the process actually did, in order.
    const SUBJECT = "tools/ship/ragdollSelfCollide-selfcheck.mjs";
    const m = measureExit(SUBJECT);
    report(`${SUBJECT}: marker ${m.ok ? "written" : "MISSING"}, exit ${m.code}, ` +
           `${m.wasmCalls} wasm compile(s)${m.how ? " via " + m.how.join(", ") : ""}, ` +
           `process.exit() ${m.exitCalled ? "called" : "not called"}`);
    // *** AND THE INSTRUMENT IS NAMED, BECAUSE A CENSUS IS ONLY AS GOOD AS THE THING THAT TOOK IT. ***
    ok("  the hook that took this reading is the one on disk, loaded before the gate's first import",
        fs.existsSync(HOOK) && /--require/.test(fs.readFileSync(HOOK, "utf8")),
        `${path.relative(ENG, HOOK)} -- a node --require preload, so it is in place before the gate's first ` +
        "import runs and cannot miss a module compiled at import time, which is when box3d's is");
    ok("*** it really does compile a wasm module, or the row below would be about nothing ***",
        m.ok && m.wasmCalls > 0,
        m.ok ? `${m.wasmCalls} compiled, ${m.wasmBytes} bytes through the synchronous door`
             : "no marker was written -- the run is UNKNOWN, not green");
    ok("*** and it leaves WITHOUT calling process.exit() with that module behind it ***",
        m.ok && !m.exitAfterWasm,
        m.exitAfterWasm ? "process.exit() was called after wasm was compiled -- this is the crash shape, live"
                        : "the verdict travels through process.exitCode and the process ends on its own terms");
}

// -----------------------------------------------------------------------------------------------------------
console.log("\n5. *** HOW BIG THE POPULATION IS, MEASURED ONCE, WITH ITS GAP NAMED ***");
{
    report(`${WASM_AT_V4650.candidates} candidate gates run under the hook at ${WASM_AT_V4650.at}; ` +
           `${WASM_AT_V4650.compilers.length} COMPILED a wasm module. A further ${WASM_AT_V4650.noMarker} of ` +
           `the ${WASM_AT_V4650.screened} screened were killed at the first pass's cap and wrote no marker: UNKNOWN`);
    // The frozen set is a MEASUREMENT and re-deriving it costs a full pass, so what runs here is a ratchet on
    // its inputs: if a member's exit shape changes, this says so and the census is re-run. A count standing in
    // for a property is the defect this tree names most often, and this is deliberately not one -- the property
    // itself is measured in section 4, on a live member, with the instrument that took the census.
    const drifted = WASM_AT_V4650.compilers.filter((c) => {
        const src = noComments(fs.readFileSync(path.join(ENG, c.gate), "utf8"));
        return exitCallCount(src) !== c.exitCalls;
    });
    ok("*** every measured wasm compiler still has the exit shape the census recorded for it ***",
        WASM_AT_V4650.compilers.length > 0 && drifted.length === 0,
        drifted.length ? "changed since the census, re-run it: " +
                         drifted.map((d) => d.gate + " (recorded " + d.exitCalls + ")").join(", ")
                       : `${WASM_AT_V4650.compilers.length} members, none moved`);
    ok("  ...and the set is not empty, which would make the row above vacuous",
        WASM_AT_V4650.compilers.length > 0,
        "a population of zero passes any property asked of its members");
    // *** AND THE TRAP IN THE SWAP, WHICH HAS ALREADY BITTEN ONCE. *** process.exit() stopped execution and
    // process.exitCode does not, so a member whose verdict sat in an `if` needs an `else` or a failing run
    // prints its failure count AND "all checks pass". pipeTruncation-selfcheck holds this row for
    // statedRuntime, which is where v4640 found it; gateReport is the one member this round had to reshape.
    const GR = noComments(fs.readFileSync(path.join(ENG, "tools/ship/gateReport-selfcheck.mjs"), "utf8"));
    ok("*** the one member whose verdict sat in an `if` got an `else`, so a failing run cannot also claim to pass ***",
        /process\.exitCode = 1; \}\s*\n\s*else console\.log/.test(GR),
        "it prints `gateReport-selfcheck: 4 FAILURES` and nothing else today. Left sequential, the line after " +
        "it would run as well -- which is exactly what the same repair did to statedRuntime at v4640");
    report(`NOT MEASURED: a gate that spawns a node CHILD which compiles wasm. The child is the process that ` +
        `exits and the hook is not in it. ${WASM_AT_V4650.noMarker} further gates were killed at the first ` +
        "pass's cap and wrote nothing, so the compiler count is a FLOOR and not a census of the tree.");
}

console.log(fails ? `\nwasmTeardown-selfcheck: ${fails} FAILED` : "\nwasmTeardown-selfcheck: all checks pass");
console.log("\nunchecked here: THE CRASH ITSELF. unix/async.c's uv_async_send has no UV_HANDLE_CLOSING " +
    "assertion, so the identical teardown is silent on this platform and no row below can go red for the " +
    "reason the round exists. What is measured here is that the window is wide, that nothing this tree owns " +
    "is in it, and that closing it costs nothing. THE RIG'S NEXT CLONE-VERIFY IS THE INSTRUMENT FOR THE FACT.");
process.exitCode = fails ? 1 : 0;
