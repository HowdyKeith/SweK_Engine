// tools/ship/wasmTeardown.mjs -- A GATE THAT COMPILES WASM AND THEN CALLS process.exit() IS RACING V8's
// BACKGROUND COMPILER, AND ON WINDOWS THE RACE IS FATAL.
//
// v4663 -- Keith's rig, three gates in one clone-verify at v4649:
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
import { spawnSync, execFileSync } from "node:child_process";
import { treeFiles, SKIP } from "./treeRead.mjs";
import { noComments, codeOnly } from "./sourceScan.mjs";
import { resolveSpec } from "./affected.mjs";
import { gateFiles } from "./staleness.mjs";

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
/**
 * *** v4681 -- THE INSTRUMENT'S OWN RESOLUTION, BECAUSE ON WINDOWS IT CANNOT SEE WHAT THIS MODULE MEASURES. ***
 * process.cpuUsage() is getrusage() on POSIX -- microsecond steps, measured 1 us here -- and GetProcessTimes()
 * on Windows, which advances in whole scheduler ticks. The rig read 0.00 ms in forty consecutive idle 100 ms
 * windows and the burning-CPU row read "0.0 ms against a control of 0.0 ms": not a quiet compiler, an instrument
 * whose smallest step is larger than the thing measured. Spins for up to `spinMs` and returns the SMALLEST
 * nonzero step it saw, in ms -- a reading of this box, so a row can say whether it is able to answer at all.
 */
export function cpuQuantumMs(spinMs = 200) {
    let last = process.cpuUsage(), min = Infinity;
    const t0 = Date.now();
    while (Date.now() - t0 < spinMs) {
        const u = process.cpuUsage(), step = (u.user + u.system) - (last.user + last.system);
        if (step > 0) { if (step < min) min = step; last = u; }
    }
    return Number.isFinite(min) ? min / 1000 : null;
}

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
export const WASM_AT_V4663 = Object.freeze({
    at: "v4663",
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

/**
 * *** v4840 -- THE DOOR NEITHER SCREEN WALKED, CENSUSED BEFORE THE RIG WALKS IT. ***
 *
 * v4663 screened the gates that could REACH WebAssembly.instantiate by import; v4677 sampled by exitBusy. The rig found
 * tools/ship/dracoEncode-selfcheck.mjs through neither (v4832): tools/export/dracoEncode.mjs loads its Emscripten glue with
 * createRequire and a computed path, and no import graph follows that. This names that door statically, from the target:
 *
 *   COMPILERS -- every script in the tree, vendor/ included (the glue lives there and treeFiles skips it), whose code
 *                calls WebAssembly.instantiate / compile (or their Streaming forms).
 *   DOORS     -- a module that loads code through a computed specifier (createRequire, or an import() of anything but a
 *                string literal) AND names a compiler: a literal path tail of it ("dist/draco_encoder_nodejs.js"), or its
 *                bare file name beside a literal naming its folder ("box3d.js" with "box3d"). A bare "index.js" names
 *                nothing. A LITERAL import or require of the same file is not a door: every import graph follows those.
 *   REACH     -- the gates that import a door, at any depth, by a reverse walk of the tree's literal imports (and a door
 *                that is itself a gate).
 *
 * Measured at v4840: 21 compilers, 8 doors -- box3d's glue behind physics/box3d/box3dNode.mjs, ai-bridge/server.js,
 * tools/roundhouse/backendRotation.mjs and three gates that load it themselves, the Draco encoder behind
 * tools/export/dracoEncode.mjs, and wasmTeardown-selfcheck itself, which names both glues in its assertions and loads box3d
 * in-process -- and 58 gates reaching one. Live, candidates come from git grep (about 1.0 s here since v4896 -- noComments no longer looks back and doorReach reads one grep for the whole import graph, where it was 2.6 s; reading every
 * file, with the same doors and reach); every input is injectable, so the rules are driven on fixtures as well.
 */
const COMPILES = /WebAssembly\.(?:instantiate|compile)(?:Streaming)?\s*\(/;
const GENERIC = /^(?:index|main)\.(?:c?js|mjs)$/;
const COMPUTED_LOADER = /createRequire\s*\(|\bimport\s*\(\s*(?!["'`][^"'`]*["'`]\s*\))/;
const relOf = (root, p) => path.relative(root, p).replace(/\\/g, "/");
// Live only: the files under `root` (tracked or untracked, .gitignore honoured, treeRead's SKIP applied unless `vendor`) whose text
// contains one of `needles` (fixed strings, or one pattern with `regex`). git grep reads the tree in ~0.1 s where reading every
// file's text took 3.4 s; null when git is not there, and the caller reads everything instead.
function grepFiles(root, needles, { regex = false, vendor = false } = {}) {
    if (!needles.length) return [];
    try {
        const out = execFileSync("git", ["grep", "-l", "--untracked", regex ? "-E" : "-F", ...needles.flatMap((n) => ["-e", n]),
            "--", "*.js", "*.mjs", "*.cjs"], { cwd: root, encoding: "utf8", maxBuffer: 64 << 20, stdio: ["ignore", "pipe", "ignore"] });
        return out.split("\n").filter(Boolean).map((r) => path.join(root, r)).filter((p) => vendor ? !/node_modules/.test(p) : !SKIP.test(p));
    } catch (e) { return e.status === 1 ? [] : null; }
}
// Live only: [[rel path, line text]] for every line of a tracked-or-untracked script (treeRead's SKIP applied) that matches the extended regex; null when git is not there.
function grepLines(root, regex) {
    try {
        const out = execFileSync("git", ["grep", "-I", "--untracked", "-E", regex, "--", "*.js", "*.mjs", "*.cjs"],
            { cwd: root, encoding: "utf8", maxBuffer: 512 << 20, stdio: ["ignore", "pipe", "ignore"] });
        const rows = [];
        for (const row of out.split("\n")) { const k = row.indexOf(":"); if (k < 1) continue; if (SKIP.test(path.join(root, row.slice(0, k)))) continue; rows.push([row.slice(0, k), row.slice(k + 1)]); }
        return rows;
    } catch (e) { return e.status === 1 ? [] : null; }
}
const textOf = (p) => { try { return fs.readFileSync(p, "utf8"); } catch { return ""; } };

/** Every script that compiles wasm: [abs path]. vendor/ is walked here because treeFiles skips it by design. */
export function wasmCompilers({ root = ENG, files = null, vendor = null } = {}) {
    if (!files && !vendor) {
        const hits = grepFiles(root, ["WebAssembly\\.(instantiate|compile)"], { regex: true, vendor: true });
        // a tree file compiles wasm when its CODE calls the API -- strings out too, or a gate whose fixture text names the call becomes
        // a "compiler" and every module naming that gate a "door" (v4840's own section 7 did exactly that on its first run)
        if (hits) return hits.filter((p) => /[\\/]vendor[\\/]/.test(p) ? COMPILES.test(textOf(p)) : COMPILES.test(codeOnly(textOf(p))));
    }
    const out = [];
    const vend = vendor || (() => { const acc = [];
        (function walk(d) { let es = []; try { es = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
            for (const e of es) { const p = path.join(d, e.name);
                if (e.isDirectory()) { if (e.name !== "node_modules") walk(p); } else if (/\.(c?js|mjs)$/.test(e.name)) acc.push(p); } })(path.join(root, "vendor"));
        return acc.map((p) => { try { return { path: p, text: fs.readFileSync(p, "utf8") }; } catch { return { path: p, text: "" }; } }); })();
    for (const f of vend) if (COMPILES.test(f.text)) out.push(f.path);
    for (const f of (files || treeFiles(root))) if (/\.(c?js|mjs)$/.test(f.path) && COMPILES.test(f.text) && COMPILES.test(codeOnly(f.text))) out.push(f.path);
    return out;
}

/** Modules that load a compiler through a computed specifier: [{ module, glue: [rel] }]. */
export function wasmDoors({ root = ENG, files = null, compilers = null } = {}) {
    const comp = compilers || wasmCompilers({ root, files });
    // a GENERIC file name (index.js, main.mjs) names a file only with its folder in the same literal: "dist/index.js"
    const needle = (p) => GENERIC.test(path.basename(p)) ? path.basename(path.dirname(p)) + "/" + path.basename(p) : path.basename(p);
    const live = !files && grepFiles(root, [...new Set(comp.map(needle))]);
    const fl = (live ? live.map((p) => ({ path: p, text: textOf(p) })) : (files || treeFiles(root))).filter((f) => /\.(c?js|mjs)$/.test(f.path));
    const byBase = new Map();
    for (const p of comp) { const b = path.basename(p); if (!byBase.has(b)) byBase.set(b, []); byBase.get(b).push(p); }
    const doors = [];
    for (const f of fl) {
        if (![...byBase.keys()].some((b) => f.text.includes(b))) continue;        // cheap: no compiler's name, no door
        if (!COMPUTED_LOADER.test(f.text)) continue;                               // cheap: no computed loader in the raw text either
        const c = noComments(f.text);
        if (!COMPUTED_LOADER.test(c)) continue;
        const lits = new Set([...c.matchAll(/["'`]([^"'`\s]+)["'`]/g)].map((m) => m[1]));
        // every specifier this file imports or requires LITERALLY, in one pass -- a regex per literal over a 3.5 MB main.js was 3 s
        const literalSpecs = new Set([...c.matchAll(/(?:\bfrom|\bimport\s*\(|\brequire\s*\()\s*["']([^"']+)["']/g)].map((m) => m[1]));
        const glue = new Set();
        for (const lit of lits) {
            if (!/\.(c?js|mjs)$/.test(lit)) continue;
            const b = path.basename(lit);
            if (literalSpecs.has(lit)) continue;   // literal: graphs follow it
            for (const p of byBase.get(b) || []) {
                const r = relOf(root, p);
                const named = lit.includes("/") ? r.endsWith(lit.replace(/^(\.\.?\/)+/, ""))
                            : !GENERIC.test(b) && lits.has(path.basename(path.dirname(p)));
                if (named) glue.add(r);
            }
        }
        if (glue.size) doors.push({ module: relOf(root, f.path), glue: [...glue].sort() });
    }
    return { compilers: comp.map((p) => relOf(root, p)), doors };
}

/** The gates that reach a door: Map(gate rel -> door rel). Literal imports only, walked in reverse from each door. */
export function doorReach(doors, { root = ENG, files = null, gates = null } = {}) {
    const SPEC = [/\bfrom\s+["']([^"']+)["']/g, /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g, /\brequire\(\s*["']([^"']+)["']\s*\)/g, /^\s*import\s+["']([^"']+)["']/gm];
    const importsOf = (p, text) => { const out = new Set();
        for (const rx of SPEC) for (const m of text.matchAll(rx)) { const s = m[1]; if (!s.startsWith("./") && !s.startsWith("../")) continue;
            const r = resolveSpec(p, s); if (r) out.add(r); }
        return out; };
    const rev = new Map();
    const link = (from, to) => { if (!rev.has(to)) rev.set(to, new Set()); rev.get(to).add(from); };
    if (files) {
        for (const f of files.filter((x) => /\.(c?js|mjs)$/.test(x.path))) for (const r of importsOf(f.path, f.text)) link(f.path, r);
    } else {
        // live: ONE git grep for every line that holds a relative specifier, and the reverse graph built from those lines (v4896). It was a grep PER LEVEL of the walk out from the doors, each
        // followed by reading and scanning every candidate file whole: 1,097 ms, against 290 ms for this, and the same 59 gates reaching a door. The four patterns are all single-line, so
        // applying them to the matching LINES finds the edges applying them to the whole text finds (measured equal on the tree and held by wasmDoors-selfcheck's live-against-index row).
        const lines = grepLines(root, "[\"']\\.\\.?/");
        if (!lines) return doorReach(doors, { root, files: treeFiles(root), gates });
        for (const [rel, text] of lines) {
            const p = path.join(root, rel);
            for (const rx of SPEC) for (const m of text.matchAll(rx)) { const sp = m[1]; if (!sp.startsWith("./") && !sp.startsWith("../")) continue;
                const r = resolveSpec(p, sp); if (r) link(p, r); }
        }
    }
    const isGate = new Set((gates || gateFiles(root)).map((p) => path.resolve(root, p)));
    const reach = new Map();
    for (const d of doors) {
        const start = path.join(root, d.module), seen = new Set([start]), stack = [start];
        while (stack.length) {
            const cur = stack.pop();
            if (isGate.has(cur) && !reach.has(relOf(root, cur))) reach.set(relOf(root, cur), d.module);
            for (const up of rev.get(cur) || []) if (!seen.has(up)) { seen.add(up); stack.push(up); }
        }
    }
    return reach;
}

/**
 * *** v4840 -- WHAT THE CENSUS FOUND, MEASURED UNDER THE HOOK BEFORE ANYTHING WAS CHANGED. ***
 *
 * Of the 58 gates reaching a door, 44 have no process.exit() in their code or are v4663 members within their recorded
 * bail-out count. The other 14 were run under tools/ship/wasmExitHook.cjs on this box. FIVE had the crash shape --
 * wasm compiled, then process.exit() -- every one green, every one exiting 0, and each a Windows clone-verify away from
 * the assert dracoEncode-selfcheck met at v4832: racePlay, box3dFingerprint, gunnerTraceDemo, backendRotation and
 * peerBrain. All five now set process.exitCode; re-measured, none calls exit and none ran longer than before (no handle
 * held the process open). The other NINE compile no wasm on the path that exits (fingerprintBridge, raceKnob,
 * wheelJoint, observableCompare, mpmDruckerBind, jointDrive) or compile it and never call exit (raceLockstep, roster,
 * lockstepRelay): their exit calls are bail-outs, kept as v4663 kept its own, with the count recorded so a new one is seen.
 * `exitCalls` is the count left in each comment-stripped source after the round; `wasmCalls` what the hook counted.
 */
export const DOORS_AT_V4840 = Object.freeze({
    at: "v4840",
    reach: 58, measured: 14, crashShapeBefore: 5,
    members: Object.freeze([
        { gate: "ai-bridge/fingerprintBridge-selfcheck.mjs", door: "physics/box3d/box3dNode.mjs", wasmCalls: 0, exitAfterWasmBefore: false, exitCalls: 1 },
        { gate: "brain/raceLockstep-selfcheck.mjs", door: "brain/raceLockstep-selfcheck.mjs", wasmCalls: 13, exitAfterWasmBefore: false, exitCalls: 1 },
        { gate: "brain/racePlay-selfcheck.mjs", door: "brain/racePlay-selfcheck.mjs", wasmCalls: 11, exitAfterWasmBefore: true, exitCalls: 1 },   // converted
        { gate: "brain/roster-selfcheck.mjs", door: "physics/box3d/box3dNode.mjs", wasmCalls: 3, exitAfterWasmBefore: false, exitCalls: 1 },
        { gate: "physics/box3dFingerprint-selfcheck.mjs", door: "physics/box3dFingerprint-selfcheck.mjs", wasmCalls: 3, exitAfterWasmBefore: true, exitCalls: 0 },   // converted
        { gate: "physics/raceKnob-selfcheck.mjs", door: "physics/box3d/box3dNode.mjs", wasmCalls: 0, exitAfterWasmBefore: false, exitCalls: 1 },
        { gate: "physics/wheelJoint-selfcheck.mjs", door: "physics/box3d/box3dNode.mjs", wasmCalls: 0, exitAfterWasmBefore: false, exitCalls: 1 },
        { gate: "tools/fingerprint/observableCompare-selfcheck.mjs", door: "physics/box3d/box3dNode.mjs", wasmCalls: 0, exitAfterWasmBefore: false, exitCalls: 1 },
        { gate: "tools/gunnerTraceDemo-selfcheck.mjs", door: "physics/box3d/box3dNode.mjs", wasmCalls: 2, exitAfterWasmBefore: true, exitCalls: 0 },   // converted
        { gate: "tools/roundhouse/backendRotation-selfcheck.mjs", door: "tools/roundhouse/backendRotation.mjs", wasmCalls: 7, exitAfterWasmBefore: true, exitCalls: 0 },   // converted
        { gate: "tools/roundhouse/mpmDruckerBind-selfcheck.mjs", door: "physics/box3d/box3dNode.mjs", wasmCalls: 0, exitAfterWasmBefore: false, exitCalls: 1 },
        { gate: "tools/ship/jointDrive-selfcheck.mjs", door: "physics/box3d/box3dNode.mjs", wasmCalls: 0, exitAfterWasmBefore: false, exitCalls: 1 },
        { gate: "tools/ship/lockstepRelay-selfcheck.mjs", door: "physics/box3d/box3dNode.mjs", wasmCalls: 3, exitAfterWasmBefore: false, exitCalls: 1 },
        { gate: "tools/ship/peerBrain-selfcheck.mjs", door: "physics/box3d/box3dNode.mjs", wasmCalls: 3, exitAfterWasmBefore: true, exitCalls: 0 },   // converted
    ].map(Object.freeze)),
});
