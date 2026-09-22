// tools/ship/wasmTeardown.mjs -- A GATE THAT COMPILES WASM AND THEN CALLS process.exit() IS RACING V8's
// BACKGROUND COMPILER, AND ON WINDOWS THE RACE IS FATAL.
//
// v4650 -- Keith's rig, three gates in one clone-verify at v4649:
//
//     physics/box3d/box3dConformance-selfcheck.mjs   all checks pass
//     tools/ship/contactOverlay-selfcheck.mjs        all checks pass
//     tools/ship/ragdollSelfCollide-selfcheck.mjs    ALL GREEN
//     Assertion failed: !(handle->flags & UV_HANDLE_CLOSING), file src\win\async.c, line 94
//
// exit 3221226505 = 0xC0000409. *** EVERY CHECK PASSED AND ALL THREE REPORTED A CRASH, *** which is the same
// worst-combination serverShutdown.mjs was written about at v4000 and is NOT the same cause.
//
// ---- WHY THE EXISTING HELPER CANNOT FIX THIS ------------------------------------------------------------------
//
// serverShutdown.mjs drains what the PROCESS owns: sockets, a listener, a child. Its liveHandles() is the
// instrument, and at the moment these three gates exit it reads
//
//     liveHandles() == []
//
// Nothing is open. Measured on this box after 600 box3d world steps, with the box3d module live. So the handle
// that trips the assert is not one of ours and no drain of ours can reach it: it is NodePlatform's own
// `flush_tasks_` async, the one a V8 BACKGROUND THREAD uses to post a finished compilation job back to the
// foreground. process.exit() tears the platform down; a background job that lands inside that window calls
// uv_async_send on a handle already flagged UV_HANDLE_CLOSING, and win/async.c asserts on exactly that.
//
// *** AND THE WINDOW IS MEASURABLE HERE EVEN THOUGH THE CRASH IS NOT. *** The main thread is put to sleep on a
// timer and the process's own CPU accounting -- which counts every thread -- is read across that sleep. An idle
// process burns nothing; a process with background compilation still in flight burns whatever it is compiling:
//
//     no wasm loaded at all                         0.6 ms of CPU across a 300 ms idle window
//     box3d loaded and 600 world steps taken       38.0 ms                    "
//     the same process 3 s later                    0.3 ms                    "
//
// Sixty times the control, decaying to nothing once the compiler is done. That is TurboFan tiering up a
// 829 KB module with 77 exports, and it is still running at the instant the gate's last line executes.
//
// ---- WHY WASM AND NOT EVERY GATE -------------------------------------------------------------------------------
//
// V8 posts the same finalisation tasks for ordinary JS, so the race is not wasm's alone and this file does not
// claim it is. What wasm changes is the SIZE of the window -- sixty times, above -- and the repair is the same
// line either way. pipeTruncation-selfcheck.mjs already names the full population (1,717 gates call
// process.exit) for its own, different reason: on POSIX that call strands piped output. So the two files agree
// on the cure and disagree about which platform shows the disease, and between them the line is indefensible:
//
//     process.exit()      loses a gate's evidence on POSIX, and can abort the process on Windows
//     process.exitCode    does neither, and costs nothing -- measured, three runs each, after real wasm work:
//                         status 1/1/1 against 1/1/1, 227/316/233 ms against 241/315/195
//
// *** THE REPAIR IS DEMONSTRATED ON THE BOX THAT CANNOT REPRODUCE THE FAILURE, WHICH IS SAID PLAINLY RATHER
// THAN ROUNDED UP. *** The assert is Windows-only: unix/async.c's uv_async_send has no such assertion, so the
// identical teardown is silent here. What this box can show is that the window is wide, that nothing we own is
// in it, and that closing the window costs nothing. THE RIG IS THE INSTRUMENT FOR THE FACT, and the verdict is
// its next clone-verify -- the same split winPathGuard's repair was recorded under.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import os from "node:os";
import { spawnSync } from "node:child_process";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const ENG = path.resolve(HERE, "..", "..");
export const HOOK = path.join(HERE, "wasmExitHook.cjs");

/**
 * CPU burned by every thread of this process while the MAIN thread is asleep.
 *
 * process.cpuUsage() is process-wide, so subtracting two readings across an awaited timer gives the work done
 * by threads other than this one -- the compiler pool, and nothing else in a gate that is doing no I/O. It is a
 * lower bound and it is a reading, not a constant: what makes it evidence is the CONTRAST with a process that
 * loaded no wasm, which is why every caller takes both.
 */
export async function idleBackgroundCpuMs(idleMs = 300) {
    const before = process.cpuUsage();
    await new Promise((r) => setTimeout(r, idleMs));
    const d = process.cpuUsage(before);
    return (d.user + d.system) / 1000;
}

/**
 * Run a gate under the hook and report what it compiled and how it left. THE PROPERTY, MEASURED -- not a regex
 * over its source, because `process.exit(1)` on the line that bails out when the wasm failed to load is correct
 * and a scan cannot tell it from the one that ends a green run.
 *
 * @returns { ok, code, wasmCalls, exitCalled, exitAfterWasm } -- ok:false means no marker was written, which a
 *          caller must treat as UNKNOWN rather than as a pass. A gate killed at a cap writes nothing.
 */
export function measureExit(gateRel, { capMs = 45000, cwd = ENG } = {}) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "swek-wasmexit-"));
    const out = path.join(dir, "marker.json");
    const r = spawnSync(process.execPath, ["--require", HOOK, gateRel], {
        cwd, timeout: capMs, stdio: "ignore", env: { ...process.env, SWEK_WASM_EXIT_OUT: out },
    });
    let m = null;
    try { m = JSON.parse(fs.readFileSync(out, "utf8")); } catch { /* no marker: killed, or crashed before exit */ }
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
    if (!m) return { ok: false, code: r.status, wasmCalls: 0, exitCalled: false, exitAfterWasm: false };
    return { ok: true, code: m.exitCode, wasmCalls: m.wasmCalls, wasmBytes: m.wasmBytes,
             how: m.how, exitCalled: m.exitCalled, exitAfterWasm: m.exitAfterWasm };
}

/**
 * *** WAIT FOR THE COMPILER POOL TO GO QUIET, AND REPORT WHAT IT BURNED GETTING THERE. ***
 *
 * The first version of this took ONE 200 ms idle window and compared it to a control window. On an idle box it
 * read 38.0 ms against 0.4 and the contrast was overwhelming; under a load average of 7 -- which is what the
 * ship sweep's own workers produce -- it read 0.7 against 0.4 AND THE ROW WENT RED. The work had not stopped
 * happening; it had been descheduled out of the window the reading was taken in. A fixed window measures WHEN
 * the compiler ran, and the claim is about WHETHER it had anything left to run.
 *
 * So this accumulates instead, in slices, until the pool has been quiet for two of them or the deadline is
 * reached. Contention makes it take longer and does not change the total. Bounded, because a gate that can
 * spin is worse than one that reads low: the deadline is reported alongside the figure so a reading taken at
 * the ceiling is visible as one.
 */
export async function drainBackgroundCpu({ sliceMs = 100, quietSlices = 2, deadlineMs = 1000 } = {}) {
    const t0 = Date.now();
    let total = 0, quiet = 0, slices = 0;
    while (Date.now() - t0 < deadlineMs) {
        const d = await idleBackgroundCpuMs(sliceMs);
        total += d; slices++;
        if (d < 1) { if (++quiet >= quietSlices) break; } else quiet = 0;
    }
    return { cpuMs: total, ms: Date.now() - t0, slices, hitDeadline: Date.now() - t0 >= deadlineMs };
}

/** How many times a COMMENT-STRIPPED source calls process.exit(). The strip matters: this file, and every gate
 *  repaired by this round, explains the defect in prose that names the call. */
export function exitCallCount(strippedSrc) {
    return (strippedSrc.match(/process\.exit\s*\(/g) || []).length;
}

/**
 * *** THE POPULATION, MEASURED BY RUNNING IT, WITH ITS GAP NAMED. ***
 *
 * A static walk was tried first and is not in this file, because it was a count standing in for a property:
 * 206 gates can REACH a file that calls WebAssembly.instantiate -- taichi, quickjs, three's basis, meshopt and
 * zstd decoders -- and 18 of them compile anything. Reaching a compiler is not calling one. And the walk MISSED
 * the whole box3d population at the same time, because box3dNode.mjs loads its glue through a dynamic import
 * with a computed path, which no import graph follows.
 *
 * So both sets were run under tools/ship/wasmExitHook.cjs instead, and this is what the processes did:
 *
 *     246 gates screened (the static-reachability set and the box3dNode importers, together)
 *      61 measured under the hook at a 90 s cap
 *      56 COMPILED a wasm module
 *      48 of those 56 called process.exit() WITH THAT MODULE BEHIND THEM -- the crash shape, and all 48 are
 *         repaired in this round
 *      29 were killed at the 45 s cap of the first screening pass and wrote no marker: UNKNOWN, not clean
 *
 *  is the SYNCHRONOUS door only. WebAssembly.instantiateStreaming takes a Response and there is no
 * byte count to read from it, so a gate whose only route is streaming reports the 48,643 bytes of node's own
 * cjs-module-lexer wasm and not box3d's 829,117. The figure is a report; membership is what the rows are for.
 *
 *  is the number of process.exit() calls left in each member's COMMENT-STRIPPED source, and they are
 * not zero: what remains is BAIL-OUTS -- "box3d wasm not loadable", "the .wasm is not present", "the contact
 * exports are absent". Those run when the substrate is missing, before or instead of any physics, and on a box
 * where box3d loads they are not reached at all. The hook measures what a run DID, which is why the census can
 * say the property holds while the calls are still there. The number is recorded so that a member growing a new
 * one is visible, and the honest response to that is to re-run the census rather than to read the diff.
 */
export const WASM_AT_V4650 = Object.freeze({
    at: "v4650",
    screened: 246,
    candidates: 61,
    capMs: 90000,
    noMarker: 29,
    exitAfterWasmBefore: 48,
    compilers: Object.freeze([
        { gate: "ai-bridge/tools/lab-scene-run-selfcheck.mjs", exitCalls: 0, wasmBytes: 48643 },
        { gate: "brain/gunnerPolicy-selfcheck.mjs", exitCalls: 1, wasmBytes: 48643 },
        { gate: "physics/adaptiveKnob-selfcheck.mjs", exitCalls: 1, wasmBytes: 48643 },
        { gate: "physics/backendLimits-selfcheck.mjs", exitCalls: 0, wasmBytes: 2070220 },
        { gate: "physics/backendRouting-selfcheck.mjs", exitCalls: 0, wasmBytes: 2070220 },
        { gate: "physics/box3d/box3dConformance-selfcheck.mjs", exitCalls: 1, wasmBytes: 2487351 },
        { gate: "physics/box3d/sensorsCcd-selfcheck.mjs", exitCalls: 0, wasmBytes: 48643 },
        { gate: "physics/box3d/wasmBuild-selfcheck.mjs", exitCalls: 1, wasmBytes: 829117 },
        { gate: "physics/centrifugeKnob-selfcheck.mjs", exitCalls: 0, wasmBytes: 48643 },
        { gate: "physics/control/controlStability-selfcheck.mjs", exitCalls: 0, wasmBytes: 48643 },
        { gate: "physics/diffusionKnob-selfcheck.mjs", exitCalls: 0, wasmBytes: 48643 },
        { gate: "physics/em/fresnelJoin-selfcheck.mjs", exitCalls: 0, wasmBytes: 48643 },
        { gate: "physics/gyroKnob-selfcheck.mjs", exitCalls: 0, wasmBytes: 48643 },
        { gate: "physics/jolt/jolt-ragdoll-selfcheck.mjs", exitCalls: 0, wasmBytes: 2021577 },
        { gate: "physics/jolt/jolt-ragdoll-vs-wall-selfcheck.mjs", exitCalls: 0, wasmBytes: 2021577 },
        { gate: "physics/jolt/jolt-selfcheck.mjs", exitCalls: 0, wasmBytes: 2021577 },
        { gate: "physics/jolt/jolt-structures-selfcheck.mjs", exitCalls: 0, wasmBytes: 2021577 },
        { gate: "physics/knobRegistry-selfcheck.mjs", exitCalls: 0, wasmBytes: 48643 },
        { gate: "physics/labKnobs-selfcheck.mjs", exitCalls: 0, wasmBytes: 48643 },
        { gate: "physics/labScenes-selfcheck.mjs", exitCalls: 0, wasmBytes: 48643 },
        { gate: "physics/mechanics/contactImpulse-selfcheck.mjs", exitCalls: 2, wasmBytes: 48643 },
        { gate: "physics/mechanics/contactKeys-selfcheck.mjs", exitCalls: 2, wasmBytes: 48643 },
        { gate: "physics/mechanics/reposeOps-selfcheck.mjs", exitCalls: 0, wasmBytes: 48643 },
        { gate: "physics/mechanics/rigidKeys-selfcheck.mjs", exitCalls: 1, wasmBytes: 48643 },
        { gate: "physics/pileKnob-selfcheck.mjs", exitCalls: 0, wasmBytes: 48643 },
        { gate: "physics/scoreDirection-selfcheck.mjs", exitCalls: 0, wasmBytes: 48643 },
        { gate: "physics/spellAmmo-selfcheck.mjs", exitCalls: 1, wasmBytes: 48643 },
        { gate: "physics/vibrationKnob-selfcheck.mjs", exitCalls: 0, wasmBytes: 48643 },
        { gate: "physics/xpbd/rigidCouple-selfcheck.mjs", exitCalls: 0, wasmBytes: 48643 },
        { gate: "render/perceptual-selfcheck.mjs", exitCalls: 0, wasmBytes: 2021577 },
        { gate: "render/tools/meshopt-selfcheck.mjs", exitCalls: 1, wasmBytes: 12273 },
        { gate: "simulation/life/paramecium3d-selfcheck.mjs", exitCalls: 0, wasmBytes: 1658234 },
        { gate: "simulation/life/parameciumBox3d-selfcheck.mjs", exitCalls: 1, wasmBytes: 4145585 },
        { gate: "simulation/life/parameciumDrive-selfcheck.mjs", exitCalls: 1, wasmBytes: 4145585 },
        { gate: "tools/crossarchBox3d-selfcheck.mjs", exitCalls: 1, wasmBytes: 2487351 },
        { gate: "tools/roundhouse/box3dBind-selfcheck.mjs", exitCalls: 2, wasmBytes: 1658234 },
        { gate: "tools/ship/contactOverlay-selfcheck.mjs", exitCalls: 1, wasmBytes: 48643 },
        { gate: "tools/ship/crashDamage-selfcheck.mjs", exitCalls: 1, wasmBytes: 48643 },
        { gate: "tools/ship/drivePolicy-selfcheck.mjs", exitCalls: 1, wasmBytes: 48643 },
        { gate: "tools/ship/eulerGpu-selfcheck.mjs", exitCalls: 0, wasmBytes: 48643 },
        { gate: "tools/ship/fleetRouting-selfcheck.mjs", exitCalls: 1, wasmBytes: 48643 },
        { gate: "tools/ship/gateReport-selfcheck.mjs", exitCalls: 0, wasmBytes: 48643 },
        { gate: "tools/ship/hookupState-selfcheck.mjs", exitCalls: 0, wasmBytes: 48643 },
        { gate: "tools/ship/labHome-selfcheck.mjs", exitCalls: 0, wasmBytes: 48643 },
        { gate: "tools/ship/raceCar-selfcheck.mjs", exitCalls: 1, wasmBytes: 48643 },
        { gate: "tools/ship/raceKnob-selfcheck.mjs", exitCalls: 0, wasmBytes: 48643 },
        { gate: "tools/ship/raceReplayBake-selfcheck.mjs", exitCalls: 0, wasmBytes: 48643 },
        { gate: "tools/ship/raceTurret-selfcheck.mjs", exitCalls: 1, wasmBytes: 48643 },
        { gate: "tools/ship/ragdollSelfCollide-selfcheck.mjs", exitCalls: 1, wasmBytes: 48643 },
        { gate: "tools/ship/ragdollStep-selfcheck.mjs", exitCalls: 1, wasmBytes: 48643 },
        { gate: "tools/ship/ribbonRoad-selfcheck.mjs", exitCalls: 0, wasmBytes: 48643 },
        { gate: "tools/ship/slugNapalm-selfcheck.mjs", exitCalls: 0, wasmBytes: 48643 },
        { gate: "tools/ship/slugShatter-selfcheck.mjs", exitCalls: 0, wasmBytes: 48643 },
        { gate: "tools/ship/slugTicker-selfcheck.mjs", exitCalls: 0, wasmBytes: 48643 },
        { gate: "tools/ship/voxelBodies-selfcheck.mjs", exitCalls: 0, wasmBytes: 48643 },
        { gate: "world/buildingTopple-selfcheck.mjs", exitCalls: 1, wasmBytes: 48643 },
    ].map(Object.freeze)),
});
