#!/usr/bin/env node
// WebGLEngine/tools/ship/rtPipelineDiag.mjs -- v4814
//
// Run: node tools/ship/rtPipelineDiag.mjs [--cap-s 600] [--top 15]     |     node tools/ship/rtPipelineDiag.mjs --session-probe
//
// A DIAGNOSTIC, NOT A GATE: it asserts nothing and exits 0. It answers WHERE physics/render/rtPipeline-selfcheck.mjs
// spends its time on a given box, so the repair goes where the cost is rather than where it is guessed to be.
//
// What started it: the rig's clone verify of 228ff99e killed that gate at the 20 s cap alone, and the round said it took
// 4.2 s in the sandbox. THAT WAS WRONG. 4,199 ms is the record's entry from before the rtx merge grew the gate's sections
// 13 and 14; run whole here at v4814 it takes 114,623 ms, and its slowest rows are those sections' CPU-against-GPU means
// at 4-8 s each. So the question is not "why is the rig slow" but "what costs 114 s", and three things could:
//
//   1. the browser LAUNCH -- webgpuHarness.runWgslCompute starts a fresh headless Chromium per call, and on win32 with
//      WebGPU on SwiftShader (LAUNCH_ARGS) that is a process start the gate pays dozens of times;
//   2. the RUN inside the page -- adapter, compile, dispatch and readback of a path tracer on a SOFTWARE rasteriser;
//   3. the gate's own CPU work between calls -- the f64 reference renders it compares every GPU mean against.
//
// It runs the gate as a child with SWEK_WGSL_TRACE=1, which makes the harness print one line per call to stderr
// (launch / run / close ms), timestamps every line of the gate's own output, and charges each call to the row it ran
// under. A row's time minus the harness time inside it is the gate's CPU work for that row. The child gets its own cap
// (default 600 s) so the profile is whole on a box where the gate runs far past the sweep's 20 s.
"use strict";

import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { parseArgs, refusalLines } from "./cliArgs.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const GATE = "physics/render/rtPipeline-selfcheck.mjs";
// v4815 -- runnerBudget-selfcheck's population includes this file: it spawns a gate with a limit of its own (--cap-s,
// default 600 s). The limit is not gateBudget's, on purpose, and runnerReach-selfcheck went red on the round that added
// it without saying so.
export const budgetIsOwn =
    "a diagnostic runs rtPipeline-selfcheck past the sweep's cap so a box where it takes minutes is profiled whole; " +
    "--cap-s (default 600 s) is a ceiling against a hang, not a budget a verdict is read from, and nothing is asserted";
// Arguments through cliArgs.parseArgs, so a mistyped option is refused by name rather than read as the default.
const CLI = Object.freeze({ values: Object.freeze({ "--cap-s": "number", "--top": "number" }), flags: Object.freeze(["--session-probe"]) });
const cli = parseArgs(process.argv.slice(2), CLI);
if (cli.errors.length) { for (const l of refusalLines("rtPipelineDiag", cli.errors, CLI)) console.error(l); process.exit(2); }
const CAP_MS = (cli.values["--cap-s"] || 600) * 1000, TOP = cli.values["--top"] || 15;
const TRACE = /^\[wgsl-trace\] launch (\d+) ms, run (\d+) ms, close (\d+) ms, (\d+) chars, (\d+) out(, DID NOT FINISH)?/;

// *** v4814 RIG RUN 2 -- --session-probe. *** With the gate on webgpuHarness.openWgslSession, the rig HUNG on the gate's
// third GPU call -- the first to reuse a cached shader module and pipeline, and the first to ask a cached module for its
// compilation info again -- while every call ran here. This mode replays the gate's first three calls exactly (the
// v4417 monolith, then the one-sphere pipeline twice) in a FRESH session per variant, varying ONE reuse at a time, with
// a 20 s watchdog and no fallback, so the variant that hangs is named rather than waited on for ten minutes.
// RIG RESULT (2026-10-05): only "compile info RE-ASKED" timed out, at call 3; the other three passed with values equal to
// call 2. The session now asks once, and the full gate on the rig ran in 61 s against 291 s one browser per call.
if (cli.flags.has("--session-probe")) {
    const { openWgslSession, webgpuSkipReason } = await import("./webgpuHarness.mjs");
    const R = await import("../../physics/render/rtPipeline.mjs");
    const { traceWgsl, traceUniforms } = await import("../../physics/render/pathTracerGpu.mjs");
    console.log("rtPipelineDiag --session-probe -- which reuse hangs a session on this box. A diagnostic: it asserts nothing.");
    console.log(`node ${process.version} ${process.platform}`);
    const skip = webgpuSkipReason(); if (skip) { console.log("SKIP " + skip); process.exit(0); }
    const one = [R.sbtRecord({ centre: [0, 0, 0], radius: 1, albedo: 0.5 })], view = { ...R.VIEW, w: 24, h: 24 }, spp = 16, eps = 1e-4;
    const mono = { code: traceWgsl({}), outCount: 576, uniforms: traceUniforms({ spp, view, eps }), workgroups: 9 };
    const pipe = { code: R.pipelineWgsl({}), outCount: 576, uniforms: R.pipelineUniforms(one, { spp, view, eps }), workgroups: 9 };
    const VARIANTS = [
        ["v4814 default: module, its compile info and pipeline all reused", null],
        ["compile info RE-ASKED of the cached module (the first session draft)", { reaskInfo: true }],
        ["pipeline NOT cached (module and info reused)", { noPipeCache: true }],
        ["nothing cached: fresh module and pipeline, same device", { noModCache: true, noPipeCache: true }],
    ];
    for (const [label, probe] of VARIANTS) {
        console.log("");
        console.log(`== ${label}`);
        const S = await openWgslSession({ runTimeoutMs: 20000, fallback: false });
        let ref = null;
        for (const [i, job] of [["1 monolith", mono], ["2 pipeline", pipe], ["3 pipeline again", { ...pipe, probe }], ["4 pipeline a third time", { ...pipe, probe }]]) {
            const t = Date.now();
            const r = await S.run(job);
            const ms = Date.now() - t;
            if (i.startsWith("2") && r.ok) ref = r.values;
            const same = ref && r.ok && i >= "3" ? (JSON.stringify(r.values) === JSON.stringify(ref) ? ", values == call 2" : ", values DIFFER from call 2") : "";
            console.log(`   call ${i.padEnd(24)} ${r.ok ? "ok" : r.timedOut ? "TIMED OUT" : "FAILED"}  ${ms} ms${same}${r.ok || r.timedOut ? "" : "  " + r.reason}`);
            if (!r.ok) break;
        }
        await S.close();
    }
    console.log("");
    console.log("READING IT: the variant whose call 3 TIMES OUT is the reuse this box's WebGPU cannot survive; if every variant");
    console.log("passes, the hang was not a reuse of these calls and the full gate run (no flag) is the next measurement.");
    process.exit(0);
}

console.log(`rtPipelineDiag -- where ${GATE} spends its time on this box. A diagnostic: it asserts nothing.`);
console.log(`node ${process.version} ${process.platform}; child cap ${CAP_MS / 1000} s`);

const t0 = Date.now();
const rows = [];       // { at, text, calls: [] }
let pending = [];      // harness calls since the last stdout line
let outBuf = "", errBuf = "", killed = false;
// The cap is spawn's own timeout, and "killed" is read from the close event's signal rather than assumed from having
// sent one (boundaryLint's KILL_NOT_VERIFIED: a kill the code fires and never re-checks).
const child = spawn(process.execPath, [GATE], { cwd: ENG, env: { ...process.env, SWEK_WGSL_TRACE: "1" }, stdio: ["ignore", "pipe", "pipe"],
                                                 timeout: CAP_MS, killSignal: "SIGKILL" });
const eat = (buf, chunk, onLine) => { buf += chunk; let i; while ((i = buf.indexOf("\n")) >= 0) { onLine(buf.slice(0, i)); buf = buf.slice(i + 1); } return buf; };
child.stdout.on("data", (d) => { outBuf = eat(outBuf, String(d), (l) => { rows.push({ at: Date.now() - t0, text: l, calls: pending }); pending = []; }); });
child.stderr.on("data", (d) => { errBuf = eat(errBuf, String(d), (l) => {
    const m = TRACE.exec(l);
    if (m) pending.push({ launch: +m[1], run: +m[2], close: +m[3], chars: +m[4], out: +m[5], unfinished: !!m[6] });
}); });
const code = await new Promise((r) => child.on("close", (c, sig) => { killed = sig === "SIGKILL"; r(c); }));
const wall = Date.now() - t0;
if (pending.length) rows.push({ at: wall, text: "(after the last line)", calls: pending });

// ---- per row: its interval, the harness time inside it, and the rest ------------------------------------------
let prev = 0;
const sum = (xs, k) => xs.reduce((a, x) => a + x[k], 0);
for (const r of rows) {
    r.dt = r.at - prev; prev = r.at;
    r.launch = sum(r.calls, "launch"); r.run = sum(r.calls, "run"); r.close = sum(r.calls, "close");
    r.harness = r.launch + r.run + r.close;
    r.cpu = Math.max(0, r.dt - r.harness);
}
const calls = rows.flatMap((r) => r.calls);
const H = { launch: sum(calls, "launch"), run: sum(calls, "run"), close: sum(calls, "close") };
const harness = H.launch + H.run + H.close;
const pct = (x) => `${(100 * x / Math.max(1, wall)).toFixed(1)}%`;

console.log("");
console.log(`gate exit ${killed ? "KILLED at the diagnostic's cap" : code}, wall ${(wall / 1000).toFixed(1)} s, ${rows.length} output lines`);
console.log(`harness calls: ${calls.length}` + (calls.some((c) => c.unfinished) ? `, ${calls.filter((c) => c.unfinished).length} DID NOT FINISH` : ""));
console.log(`  browser launch  ${(H.launch / 1000).toFixed(1)} s  ${pct(H.launch)}   mean ${(H.launch / Math.max(1, calls.length)).toFixed(0)} ms a call`);
console.log(`  run in the page ${(H.run / 1000).toFixed(1)} s  ${pct(H.run)}   (adapter, compile, dispatch, readback on this box's WebGPU)`);
console.log(`  browser close   ${(H.close / 1000).toFixed(1)} s  ${pct(H.close)}`);
console.log(`  the gate's own CPU work between calls  ${((wall - harness) / 1000).toFixed(1)} s  ${pct(wall - harness)}`);

// ---- by section: a line opening with "N." or "Na." starts one --------------------------------------------------
const SEC = /^\s*(?:-+\s+)?(\d+[a-z]?)\.\s/;
const bySec = new Map();
let cur = "preamble";
for (const r of rows) {
    const m = SEC.exec(r.text); if (m) cur = m[1].replace(/[a-z]$/, "");
    const s = bySec.get(cur) || { dt: 0, harness: 0, run: 0, launch: 0, cpu: 0, calls: 0 };
    s.dt += r.dt; s.harness += r.harness; s.run += r.run; s.launch += r.launch; s.cpu += r.cpu; s.calls += r.calls.length;
    bySec.set(cur, s);
}
console.log("");
console.log("by section (section = the number a row's label opens with):");
console.log("  section     wall s   launch s   run s   cpu s   calls");
for (const [k, s] of [...bySec].sort((a, b) => b[1].dt - a[1].dt))
    console.log(`  ${k.padEnd(10)} ${(s.dt / 1000).toFixed(1).padStart(7)} ${(s.launch / 1000).toFixed(1).padStart(9)} ${(s.run / 1000).toFixed(1).padStart(7)} ${(s.cpu / 1000).toFixed(1).padStart(7)} ${String(s.calls).padStart(7)}`);

console.log("");
console.log(`the ${TOP} slowest rows:`);
for (const r of [...rows].sort((a, b) => b.dt - a.dt).slice(0, TOP))
    console.log(`  ${(r.dt / 1000).toFixed(1).padStart(6)} s  (launch ${(r.launch / 1000).toFixed(1)}, run ${(r.run / 1000).toFixed(1)}, cpu ${(r.cpu / 1000).toFixed(1)}, ${r.calls.length} calls)  ${r.text.trim().slice(0, 90)}`);

const reds = rows.filter((r) => /^\s*FAIL\s/.test(r.text));
console.log("");
console.log(reds.length ? `the gate printed ${reds.length} FAIL line(s) -- first: ${reds[0].text.trim().slice(0, 140)}` : "the gate printed no FAIL line");
console.log("READING IT: launch-heavy means the per-call browser is the cost (reuse one page); run-heavy means the box's WebGPU");
console.log("is (fewer or smaller dispatches); cpu-heavy means the gate's own f64 references are (cache or shrink them).");
process.exit(0);
