// WebGLEngine/gfx/gpuTimer.mjs -- v4464
//
// *** THIS TREE HAS A GPU CLOCK FOR THE OLD BACKEND AND HAS NEVER HAD ONE FOR THE NEW ONE. ***
//
// MEASURED before this file was written. ui/SystemPerfMonitor.js and ui/hud.js time the GPU through
// EXT_disjoint_timer_query_webgl2 and have since long before gfx/device.js existed. And `timestamp-query`,
// `createQuerySet` and `writeTimestamp` appear ZERO times in the whole tree. So every WebGPU-against-WebGL2
// comparison this tree could make is made with an instrument that only works on ONE SIDE -- and
// webgpu-bench.html times with performance.now() around queue.onSubmittedWorkDone(), which is CPU wall clock
// including submission and synchronisation, not GPU execution.
//
// That is this session's recurring defect in its purest form: v4448's shatterTransition reading was the
// harness, v4463's finite difference was eleven orders blunter than the analytic one, and here the tree cannot
// see the half of the pipeline it is trying to judge.
//
// ---- *** AND THE FIRST THING THE REAL DEVICE SAID IS THAT A TIMESTAMP HAS A NOISE FLOOR *** -----------------
//
// Run on the actual device this box reaches (Chromium on 127.0.0.1, adapter `swiftshader`, timestamp-query
// present), a compute pass whose inner loop was made TEN TIMES LONGER did not get slower:
//
//     iters   groups     median ns     the three runs
//        10       16       142,336     103,841 / 142,336 / 190,114
//       100       16       131,962     <-- TEN TIMES THE WORK, AND IT CAME BACK FASTER
//      1000       16       580,286
//      1000      128     3,700,618
//
// Two facts fall out of that table and they are the whole design of this module:
//
//   1. BELOW A FLOOR, THE NUMBER IS NOT MEASURING THE WORK. It is measuring pass setup, dispatch and resolve.
//      10 iterations and 100 iterations are indistinguishable. A caller handed 131,962 ns for the 100-iteration
//      pass would believe it had timed the loop, and it had not.
//   2. ONE SAMPLE IS NOT A MEASUREMENT. The same configuration read 103,841 and 190,114 in the same session --
//      a spread of 1.83x with nothing changed.
//
// So this module never returns a bare number. It takes samples, reports the median WITH its spread, and
// *** REFUSES TO CALL A SUB-FLOOR READING A MEASUREMENT *** -- verdict() returns ns: null there, the same
// refusal render/panini.js and render/stereographic.js make for a direction that has no image, and for the
// same reason: "returning a huge number would look like geometry and would poison any average computed over
// it." A plausible number is worse than no number, because only one of the two can be checked.
//
// ---- WHAT IS AND IS NOT CLAIMED --------------------------------------------------------------------------
//
// The pure half below -- stats, floors, verdicts, kind selection -- is arithmetic and is gated exactly.
// The device half is gated against a REAL WebGPU device through tools/ship/webgpuHarness.mjs.
//
// *** BUT THAT DEVICE IS SwiftShader, WHICH IS A CPU RASTERISER. *** Its timestamps are genuine WebGPU
// timestamps and the MECHANISM is real -- the query set is written, resolved, copied and read back, and the
// number moves with the workload. THE MAGNITUDE IS NOT A GPU NUMBER AND MUST NOT BE READ AS ONE. The floor
// measured here is this software device's floor. Keith's rig will have its own, probably smaller, and the
// module CALIBRATES rather than hard-coding it: calibrateFloor() is how a caller learns the local floor, and
// the frozen number below is a record of one box, not a constant of nature.
"use strict";

/** The three ways this tree can time GPU work, and the one that means it cannot. */
export const TIMER_KINDS = Object.freeze(["webgpu-timestamp", "webgl2-ext", "none"]);

/**
 * Which timer a backend can offer. Deliberately takes what it needs rather than a live device, so the choice
 * is testable without a GPU -- and so a caller cannot get a kind by asserting one.
 */
export function timerKindFor(backendName, { features = [], extensions = [] } = {}) {
    if (backendName === "webgpu") return features.includes("timestamp-query") ? "webgpu-timestamp" : "none";
    if (backendName === "webgl2") return extensions.includes("EXT_disjoint_timer_query_webgl2") ? "webgl2-ext" : "none";
    return "none";
}

/** Median of a copy. Never sorts the caller's array -- a stats function with a side effect is a trap. */
export function median(xs) {
    if (!xs || xs.length === 0) return null;
    const s = [...xs].sort((a, b) => a - b);
    const m = s.length >> 1;
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/**
 * Summarise samples. `spread` is max/min -- the number that says whether one sample would have done, and on
 * the device measured above it was 1.83 for a configuration that never changed.
 */
export function stats(samples) {
    const xs = (samples || []).filter((x) => Number.isFinite(x) && x >= 0);
    if (xs.length === 0) return { n: 0, median: null, min: null, max: null, spread: null };
    const min = Math.min(...xs), max = Math.max(...xs);
    return { n: xs.length, median: median(xs), min, max, spread: min > 0 ? max / min : Infinity };
}

/**
 * The floor, from samples of a pass that does NO WORK. Whatever an empty pass costs is what every pass costs
 * before the first instruction runs, so a reading at or under it has not measured anything.
 *
 * Taken as the MAX of the empty-pass samples, not the median: the floor is the level below which a reading
 * cannot be distinguished from overhead, and a median floor would call half the empty passes "work".
 */
export function calibrateFloor(emptyPassSamples) {
    const st = stats(emptyPassSamples);
    return st.n === 0 ? null : st.max;
}

/**
 * *** THE REFUSAL. *** A reading is a measurement only if it clears the floor by a margin. Below that, ns is
 * null and the reason says why -- never a number the caller could mistake for a timing.
 *
 * `margin` is how many times the floor a reading must reach. 2 is the default and it is a CHOICE, not a
 * derivation: at exactly the floor a pass has done nothing, and the table in this file's header shows two
 * workloads a factor of ten apart sitting inside one floor. It is a parameter so a caller with a quieter box
 * can tighten it, and so this sentence has to be read rather than assumed.
 */
export function verdict(st, floorNs, { margin = 2 } = {}) {
    if (!st || st.n === 0) return { resolved: false, ns: null, reason: "no samples" };
    if (floorNs == null) return { resolved: false, ns: null, reason: "no floor calibrated -- call calibrateFloor() first" };
    if (st.median <= floorNs * margin) {
        return { resolved: false, ns: null,
                 reason: `median ${Math.round(st.median)} ns is inside ${margin}x the ${Math.round(floorNs)} ns floor -- ` +
                         "this timed the pass overhead, not the work" };
    }
    return { resolved: true, ns: st.median, reason: null, spread: st.spread, n: st.n };
}

/** The WebGPU side: what a caller must add to a compute pass descriptor. Returned as data so it can be gated. */
export function timestampWrites(querySet, beginIndex = 0, endIndex = 1) {
    if (beginIndex === endIndex) throw new Error("gfx/gpuTimer: begin and end indices must differ");
    return { querySet, beginningOfPassWriteIndex: beginIndex, endOfPassWriteIndex: endIndex };
}

/**
 * Elapsed nanoseconds from a resolved pair of timestamps, as BigInt64 read back from the resolve buffer.
 * *** RETURNS null RATHER THAN A NEGATIVE NUMBER. *** A backwards pair means the queries were disjoint or the
 * device reordered them, and a negative duration presented as a duration is the exact failure this file
 * exists to prevent.
 */
export function elapsedFrom(pair) {
    if (!pair || pair.length < 2) return null;
    const d = BigInt(pair[1]) - BigInt(pair[0]);
    return d > 0n ? Number(d) : null;
}

/**
 * The WebGL2 side, which is ASYNCHRONOUS and can be INVALID, and both of those are load-bearing.
 * ui/SystemPerfMonitor.js has done this correctly since long before device.js existed and this mirrors it:
 * a query result is only usable when QUERY_RESULT_AVAILABLE is true AND GPU_DISJOINT_EXT is false. A disjoint
 * result is not a slow frame, it is NO frame -- the GPU was interrupted and the counter is meaningless.
 */
export function glReadable({ available, disjoint }) {
    return !!available && !disjoint;
}

/** What v4464 measured, on the one device this box can reach. NOT a constant of nature -- see the header. */
export const MEASURED_AT_V4464 = Object.freeze({
    device: "chromium/swiftshader",     // a CPU rasteriser: the mechanism is real, the magnitude is not a GPU's
    adapterHasTimestampQuery: true,
    // the table in the header, medians of three
    ns10iters16groups: 142336,
    ns100iters16groups: 131962,         // TEN TIMES THE WORK OF THE ROW ABOVE, AND LOWER
    ns1000iters16groups: 580286,
    ns1000iters128groups: 3700618,
    worstOneConfigSpread: 1.83,         // 190114 / 103841, same configuration, same session
    defaultMargin: 2,
    // The claim the whole module rests on, stated so the gate can hold it:
    tenTimesWorkInsideTheFloor: true,
});
