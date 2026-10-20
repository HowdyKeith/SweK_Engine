// WebGLEngine/tools/ship/gpuTimer-selfcheck.mjs -- v4464
//
// Run: node tools/ship/gpuTimer-selfcheck.mjs
//
// Grades gfx/gpuTimer.mjs -- the GPU clock this tree has never had for its newer backend.
//
// *** THE GATE IS SPLIT THE WAY THE EVIDENCE IS. *** Sections 1-4 are arithmetic and run everywhere: the
// refusal, the floor, the statistics and the kind selection are pure functions and are graded exactly.
// Section 5 drives a REAL WebGPU device through tools/ship/webgpuHarness.mjs and is skipped, loudly, when
// there is none -- a skip that reports itself is a different thing from a check that quietly passes.
//
// *** AND THE DEVICE IS SwiftShader, WHICH IS A CPU RASTERISER. *** Section 5 proves the MECHANISM: a query
// set is written, resolved, copied, read back, and the number MOVES WITH THE WORKLOAD. It does not prove any
// magnitude, and it must not be read as a GPU benchmark. That is stated in the module, here, and in the
// section's own output, because a number with the word "GPU" beside it is the easiest thing in this tree to
// misread later.
"use strict";

import path from "node:path";
import { fileURLToPath } from "node:url";
import * as T from "../../gfx/gpuTimer.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const say = (m) => console.log("  ----  " + m);
const M = T.MEASURED_AT_V4464;

// ---- 1. *** THE REFUSAL: A SUB-FLOOR READING IS NOT A MEASUREMENT AND MUST NOT COME BACK AS ONE *** --------
{
    const floor = 150000;
    const under = T.verdict(T.stats([131962, 142336, 120000]), floor);
    const over = T.verdict(T.stats([580286, 600000, 560000]), floor);
    say(`floor ${floor} ns, margin ${M.defaultMargin}: a 131,962 ns median -> resolved ${under.resolved}, ` +
        `a 580,286 ns median -> resolved ${over.resolved}`);
    ok("!! *** A READING INSIDE THE FLOOR RETURNS ns: null, NOT A NUMBER ***",
        under.resolved === false && under.ns === null && /overhead, not the work/.test(under.reason),
        "this is render/panini.js's rule for a direction with no image, applied to time: 'returning a huge " +
        "number would look like geometry and would poison any average computed over it'. A caller cannot " +
        "accidentally average an unresolved reading, because there is no number there to average");
    ok("...and a reading that clears the floor comes back WITH its spread and sample count, never bare",
        over.resolved === true && over.ns === 580286 && over.n === 3 && over.spread > 1,
        // SABOTAGE K DROPPED `spread` FROM THE RESOLVED VERDICT AND THIS LINE THREW ON undefined.toFixed --
        // the check DID detect it, by crashing, which killed every section after it and reported a stack trace
        // instead of a name. v4434 hit exactly this ("un-exporting FILTERS crashed rather than failing by
        // name"). A detail string must never be able to throw: the assertion above is the check, this is prose.
        `${over.ns} ns over ${over.n} samples, spread ${over.spread == null ? "MISSING" : over.spread.toFixed(3)}`);
    ok("no floor at all is a REFUSAL, not a default -- an uncalibrated timer must not answer",
        T.verdict(T.stats([1e9]), null).resolved === false && T.verdict(T.stats([1e9]), null).ns === null &&
        /calibrateFloor/.test(T.verdict(T.stats([1e9]), null).reason),
        "a module that invents a floor when it has none would resolve every reading, which is the same as " +
        "having no floor and not saying so");
    ok("and no samples is a refusal too",
        T.verdict(T.stats([]), 1000).resolved === false && T.verdict(null, 1000).ns === null);
}

// ---- 2. THE FLOOR IS THE MAX OF AN EMPTY PASS, AND THAT CHOICE IS THE POINT --------------------------------
{
    say("");
    const empty = [103841, 142336, 190114];
    const f = T.calibrateFloor(empty);
    say(`empty-pass samples ${JSON.stringify(empty)} -> floor ${f} ns (max, not median ${T.median(empty)})`);
    ok("!! the floor is the MAX of the empty-pass samples, so no empty pass is ever called work",
        f === 190114 && f > T.median(empty),
        "a MEDIAN floor would put half the empty passes above it and call them measurements. The floor is the " +
        "level below which a reading cannot be told from overhead, and half of them can");
    ok("...and an empty sample set yields no floor rather than zero",
        T.calibrateFloor([]) === null && T.calibrateFloor(null) === null,
        "a floor of 0 would resolve everything; null propagates into verdict()'s refusal");
}

// ---- 3. *** THE MEASUREMENT THAT MADE THIS MODULE: TEN TIMES THE WORK, INSIDE ONE FLOOR *** ----------------
{
    say("");
    const floor = T.calibrateFloor([103841, 142336, 190114]);
    const v10 = T.verdict(T.stats([M.ns10iters16groups]), floor);
    const v100 = T.verdict(T.stats([M.ns100iters16groups]), floor);
    const v1000 = T.verdict(T.stats([M.ns1000iters16groups]), floor);
    const v128 = T.verdict(T.stats([M.ns1000iters128groups]), floor);
    say(`10 iters ${M.ns10iters16groups} ns, 100 iters ${M.ns100iters16groups} ns, ` +
        `1000 iters ${M.ns1000iters16groups} ns, 1000x128 ${M.ns1000iters128groups} ns`);
    ok("!! *** THE 100-ITERATION PASS CAME BACK FASTER THAN THE 10-ITERATION ONE ***",
        M.ns100iters16groups < M.ns10iters16groups && M.tenTimesWorkInsideTheFloor === true,
        "ten times the inner loop, measured on the real device, and the number went DOWN. That is the whole " +
        "argument for a floor: without one, a caller reads 131,962 ns and believes it timed the loop");
    ok("...so both of those refuse, and both of the larger ones resolve",
        v10.resolved === false && v100.resolved === false && v1000.resolved === true && v128.resolved === true,
        "the floor separates the two pairs exactly where the physics does -- the two that are overhead, and " +
        "the two where the work dominates");
    const ratio = M.ns1000iters128groups / M.ns1000iters16groups;
    ok("and eight times the groups is SUBLINEAR, which is a finding rather than a defect",
        ratio > 4 && ratio < 8,
        `${ratio.toFixed(2)}x for 8x the dispatch -- fixed cost is still a visible part of the larger pass too. ` +
        "Reported, because a reader who expected 8 should learn where the other 1.6 went");
    ok("one configuration read 1.83x apart with nothing changed, so one sample is never a measurement",
        Math.abs(M.worstOneConfigSpread - 190114 / 103841) < 0.01 && M.worstOneConfigSpread > 1.5,
        "190,114 against 103,841, same shader, same size, same session. stats() reports spread for this reason");
}

// ---- 4. KIND SELECTION, WHICH MUST NOT BE OBTAINABLE BY ASSERTING IT ---------------------------------------
{
    say("");
    ok("a backend gets a timer only when it really carries the feature",
        T.timerKindFor("webgpu", { features: ["timestamp-query"] }) === "webgpu-timestamp" &&
        T.timerKindFor("webgpu", { features: [] }) === "none" &&
        T.timerKindFor("webgl2", { extensions: ["EXT_disjoint_timer_query_webgl2"] }) === "webgl2-ext" &&
        T.timerKindFor("webgl2", { extensions: [] }) === "none" &&
        T.timerKindFor("null", { features: ["timestamp-query"] }) === "none",
        "and every kind it can return is in TIMER_KINDS: " + T.TIMER_KINDS.join(", "));
    ok("!! a backwards timestamp pair is null, never a negative duration",
        T.elapsedFrom([100n, 50n]) === null && T.elapsedFrom([50n, 100n]) === 50 && T.elapsedFrom([5n, 5n]) === null,
        "disjoint or reordered queries produce a backwards pair. A negative number presented as a duration is " +
        "the same species of lie as a huge number presented as geometry");
    ok("!! the WebGL2 side needs BOTH available and not-disjoint, which is the half that is easy to drop",
        T.glReadable({ available: true, disjoint: false }) === true &&
        T.glReadable({ available: true, disjoint: true }) === false &&
        T.glReadable({ available: false, disjoint: false }) === false,
        "a DISJOINT result is not a slow frame, it is NO frame -- the GPU was interrupted and the counter is " +
        "meaningless. ui/SystemPerfMonitor.js has had this right since long before gfx/device.js existed");
    ok("timestampWrites refuses a descriptor that would write both ends to one slot",
        (() => { try { T.timestampWrites({}, 0, 0); return false; } catch { return true; } })() &&
        T.timestampWrites({}, 0, 1).endOfPassWriteIndex === 1);
    ok("median does not sort the caller's array",
        (() => { const a = [3, 1, 2]; T.median(a); return a[0] === 3 && a[2] === 2; })(),
        "a stats helper with a side effect on its input is a trap somebody finds at 2am");
}

const DEVICE_SCRIPT = `async () => {
    const ad = await navigator.gpu.requestAdapter();
    if (!ad) return { adapter: "none", hasTs: false };
    const hasTs = ad.features.has("timestamp-query");
    if (!hasTs) return { adapter: (ad.info && ad.info.architecture) || "?", hasTs: false };
    const dev = await ad.requestDevice({ requiredFeatures: ["timestamp-query"] });
    const src = (iters) => \`@group(0) @binding(0) var<storage, read_write> o: array<f32>;
      @compute @workgroup_size(64) fn main(@builtin(global_invocation_id) g: vec3u) {
        var a = f32(g.x); for (var i = 0u; i < \${iters}u; i++) { a = a * 1.0000001 + 0.000001; } o[g.x] = a; }\`;
    async function timeIt(iters, groups) {
      const pipe = dev.createComputePipeline({ layout: "auto",
        compute: { module: dev.createShaderModule({ code: src(iters) }), entryPoint: "main" } });
      const buf = dev.createBuffer({ size: groups * 64 * 4, usage: GPUBufferUsage.STORAGE });
      const bg = dev.createBindGroup({ layout: pipe.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: buf } }] });
      const qs = dev.createQuerySet({ type: "timestamp", count: 2 });
      const rs = dev.createBuffer({ size: 16, usage: GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC });
      const rd = dev.createBuffer({ size: 16, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
      const enc = dev.createCommandEncoder();
      const p = enc.beginComputePass({ timestampWrites: { querySet: qs, beginningOfPassWriteIndex: 0, endOfPassWriteIndex: 1 } });
      p.setPipeline(pipe); p.setBindGroup(0, bg); p.dispatchWorkgroups(groups); p.end();
      enc.resolveQuerySet(qs, 0, 2, rs, 0); enc.copyBufferToBuffer(rs, 0, rd, 0, 16);
      dev.queue.submit([enc.finish()]);
      await rd.mapAsync(GPUMapMode.READ);
      const t = new BigUint64Array(rd.getMappedRange().slice(0)); rd.unmap();
      return Number(t[1] - t[0]);
    }
    const med = (a) => { const s = [...a].sort((x, y) => x - y); return s[s.length >> 1]; };
    const emptyRuns = []; for (let k = 0; k < 5; k++) emptyRuns.push(await timeIt(1, 1));
    const lightRuns = []; for (let k = 0; k < 3; k++) lightRuns.push(await timeIt(10, 16));
    const heavyRuns = []; for (let k = 0; k < 3; k++) heavyRuns.push(await timeIt(1000, 128));
    return { adapter: (ad.info && ad.info.architecture) || "?", hasTs: true,
             floor: Math.max(...emptyRuns), light: med(lightRuns), heavy: med(heavyRuns) };
  }`;

// ---- 5. THE REAL DEVICE. SKIPPED LOUDLY WHEN THERE IS NONE, AND NEVER SILENTLY PASSED -----------------------
{
    say("");
    let skip = null, H = null;
    try { H = await import("./webgpuHarness.mjs"); skip = H.webgpuSkipReason(); }
    catch (e) { skip = "harness unavailable: " + String(e && e.message).slice(0, 80); }
    if (skip) {
        say(`SKIPPED, and this is reported rather than passed: ${skip}`);
        ok("the device section declares its own absence instead of going quiet",
            typeof skip === "string" && skip.length > 0,
            "a section that vanishes when its dependency is missing is a check that cannot fail, which this " +
            "tree has shipped before and now names");
    } else {
        const r = await H.runInEngineOrigin({ engineRoot: ENG, timeoutMs: 180000, script: DEVICE_SCRIPT });
        if (!r.ok) {
            ok("the real device ran the timestamp probe", false, String(r.reason).slice(0, 160));
        } else {
            const d = r.result;
            say(`adapter ${d.adapter}, timestamp-query ${d.hasTs}; empty-pass floor ${d.floor} ns; ` +
                `light ${d.light} ns, heavy ${d.heavy} ns`);
            ok("!! *** THE MECHANISM WORKS ON A REAL DEVICE: WRITTEN, RESOLVED, COPIED, READ BACK ***",
                d.hasTs === true && Number.isFinite(d.heavy) && d.heavy > 0,
                "a query set really is written by the pass and really does come back as two nanosecond stamps");
            ok("!! ...and the number MOVES WITH THE WORKLOAD, which is what makes it a clock and not a constant",
                d.heavy > d.floor * 2 && d.heavy / Math.max(d.light, 1) > 1.5,
                `heavy/light = ${(d.heavy / Math.max(d.light, 1)).toFixed(2)}x. A timer that returns the same ` +
                "number for every workload would pass every check above and measure nothing");
            ok("the module's verdict agrees with the device: the heavy pass resolves, the empty one never does",
                T.verdict(T.stats([d.heavy]), d.floor).resolved === true &&
                T.verdict(T.stats([d.floor]), d.floor).resolved === false,
                "the pure half and the device half are held against each other rather than each against itself");
            // *** SABOTAGE M DELETED THE SwiftShader CAVEAT FROM THE MODULE AND COST ZERO RED. *** Nothing
            // held the recorded provenance against the observed one, so MEASURED_AT_V4464.device could be
            // rewritten to "a real GPU" and every check still passed -- and the numbers in that table would
            // then read as a GPU's. The caveat is the most important sentence in the module and it was the
            // one thing not checked. It is checked against the DEVICE ITSELF now, not against its own spelling.
            ok("!! *** THE MODULE'S RECORDED DEVICE MATCHES THE DEVICE THAT PRODUCED THE NUMBERS ***",
                typeof M.device === "string" && M.device.toLowerCase().includes(String(d.adapter).toLowerCase()),
                `module records "${M.device}", adapter reports "${d.adapter}". A provenance line that cannot ` +
                "disagree with reality is decoration: rewriting it to 'a real GPU' passed every other check here");
            say(`  NOT A GPU BENCHMARK: this adapter is ${d.adapter}. SwiftShader is a CPU rasteriser, so the ` +
                "MECHANISM is proven and the MAGNITUDE is a software device's. The rig has its own floor.");
        }
    }
}

console.log("gpuTimer-selfcheck: " + (fails ? fails + " FAILED" : "all pass"));
process.exit(fails ? 1 : 0);
