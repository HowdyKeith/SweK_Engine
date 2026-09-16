#!/usr/bin/env node
// WebGLEngine/render/temporalGPU-selfcheck.mjs -- v4590
//
// Run: node render/temporalGPU-selfcheck.mjs
// RUNTIME 2700 ms ALONE (median of 2710/2700/2673 at v4591; 2766 at v4590 -- the counted entry point adds a
// second pipeline, four atomics per pixel and a 16-byte readback, and the difference is inside the noise here) -- just inside the 3000 ms sweep budget, unlike the FSR
// runner's gate, because this one dispatches 8 pictures and times 30 rather than timing 60.
//
// SABOTAGE v4591 (the counters): 6 mutations, 6 caught, no 0-RED.
//   T1 the clamped counter also added to the reused bucket -> 3 rows, including the census row at 16865 + 89 +
//      672, which is what a double-counted total looks like when something checks the sum.
//   T2 offscreen and invalid categories swapped IN THE KERNEL -> the two equality rows. The picture is
//      unchanged by that swap, so only the counters could have caught it.
//   T3 STAT_ORDER reordered in the runner and not in the kernel -> 3 rows. One place names the order and the
//      kernel's STAT_* consts index the same array; this is what "one place" is worth.
//   T4 mainCounted writes a slightly different blend -> the counting-does-not-change-the-picture row, plus a
//      parity row. That is the whole claim of a second entry point over a second kernel.
//   T5 an uncounted call returns zeroes instead of null -> the row that keeps v4590's rule alive.
//   T6 usedNames stops filtering by entry point -> the device REFUSES the run ("the shader declares storage
//      buffer stats at @group(0)...") AND tools/ship/temporalCorpus.mjs throws by name. One mutation, two
//      independent detectors, which is what says the move into render/wgslSpec.mjs is load-bearing rather than
//      tidy.
//
// SABOTAGE v4590 (the runner): 7 mutations, 7 caught, no 0-RED. Restored and md5-checked against a sentinel taken first.
//   S1 jx and jy written at each other's offsets in the 32-byte resolve uniform -> 5 rows red at 3.9e-1. A
//      uniform laid out by hand against a struct declared in another file is the thing most worth breaking.
//   S2 the chain's accumulate bound to the RAW source instead of the resolved mid -> the bit-identity row alone,
//      27,347 of 36,864 floats. That row exists for exactly this and nothing else would have caught it.
//   S3 stats returned as {reused:0, ...} instead of null -> the stats row red. This is the mutation the round
//      is about: zeroes are a measurement and null is an absence, and the page prints them differently.
//   S4 jitterAware forced on regardless of the caller -> the flag-is-not-decoration row alone.
//   S5 the device refusal removed -> the driven refusal row, with "device.compute is not a function", which is
//      the first-frame failure the door check moves to the door.
//   S6 the confidence buffer allocated but never read back -> the confidence row, which is why a second storage
//      output is READ and compared rather than assumed written.
//   S7 the RESOLVE KERNEL's workgroup narrowed to (8,4,1) so half the output is never written -> 6 rows red.
//      In the KERNEL rather than the runner, because a runner gate that only breaks its own file has not shown
//      it would notice what it wraps changing underneath it. The copy-through row correctly did NOT fire: both
//      sides of that comparison come from the same broken resolve, and it is an exact claim about the copy.
//
// *** TWO OF THE SEVENTEEN, AND THE FIRST TWO OF THE TEMPORAL ARC'S TEN. ***
//
// v4589's census found 17 dispatchable kernels reachable only from a gate, ten of them from the temporal arc --
// nineteen rounds of kernels (v4552-v4570) validated on real devices by their own gates and runnable by nothing
// in the engine. render/temporalGPU.mjs is the caller for RESOLVE_WGSL and ACCUMULATE_WGSL, the two that
// fsr.html runs on the CPU every frame. The census reads 15 with this file in the tree.
//
// WHAT THIS ASKS THAT THE KERNEL GATES DO NOT:
//
//   1. THE CHAIN. render/temporalResolve-selfcheck.mjs and render/temporalAccumulate-selfcheck.mjs each drive
//      their own kernel alone. Nothing had run resolve THEN accumulate on the device, which is the order every
//      frame of a temporal upscaler actually uses. resolveAndAccumulate() does it on one encoder and is held
//      bit-identical to the two run separately with a readback between.
//   2. *** THE STATS, WHICH THE PORT LOSES. *** temporalAccumulateCPU returns
//      { reused, rejectedOffscreen, rejectedInvalid, clamped }. ACCUMULATE_WGSL counts NOTHING -- no atomics,
//      and every rejection is an early return. fsr.html's own copy calls those counters "the diagnostic, not
//      decoration", and rejectedOffscreen reading exactly one column of 192 pixels is what proved the motion
//      vectors had the right sign at v4586. So the runner returns stats: null with a reason, and this gate
//      asserts it is NULL RATHER THAN ZEROES: a frame that reused nothing and a frame nobody counted must not
//      print the same number.
//   3. PARITY ON THE BRANCHES, not just the happy path -- no history, history, clamp on, clamp off, and the
//      jitterAware flag off, because each is a different `flags` bit and a uniform laid out by hand.
"use strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runInEngineOrigin, webgpuSkipReason } from "../tools/ship/webgpuHarness.mjs";
import { resolveJitterAwareCPU } from "./temporalResolve.mjs";
import { temporalAccumulateCPU } from "./temporalAccumulate.mjs";
import { STATS_REASON, STAT_ORDER, RESOLVE_FLAGS, ACCUMULATE_FLAGS } from "./temporalGPU.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const say = (l, n = "") => console.log(`  ----  ${l}${n ? "   " + n : ""}`);

const R = 48, D = 96;                                  // render 48x48 -> display 96x96
const JIT = [-0.3125, 0.1875];
const SRC = new Float32Array(R * R * 4);
for (let y = 0; y < R; y++) for (let x = 0; x < R; x++) {
    const o = (y * R + x) * 4, u = x / R, v = y / R;
    SRC[o] = 0.5 + 0.5 * Math.cos(40 * ((u - 0.5) ** 2 + (v - 0.5) ** 2));   // a zone plate: detail past Nyquist
    SRC[o + 1] = ((x >> 1) + (y >> 1)) & 1 ? 0.8 : 0.15;
    SRC[o + 2] = u;
    SRC[o + 3] = 1;
}
// a history that is NOT the current frame, so a blend that ignored alpha would show
const HIST = new Float32Array(D * D * 4);
for (let i = 0; i < D * D; i++) { HIST[i * 4] = 0.25; HIST[i * 4 + 1] = 0.6; HIST[i * 4 + 2] = 0.9; HIST[i * 4 + 3] = 1; }
// motion: a uniform pan, one column off screen, and a band marked invalid -- all three rejection paths at once
const MOT = new Float32Array(D * D * 4);
for (let y = 0; y < D; y++) for (let x = 0; x < D; x++) {
    const o = (y * D + x) * 4;
    MOT[o] = 0.75 / D; MOT[o + 1] = 0;
    MOT[o + 2] = (y > 40 && y < 48) ? 0 : 1;                       // an invalid band
}

console.log("temporalGPU-selfcheck -- the temporal arc's first caller outside a gate\n");

console.log("1. THE RUNNER'S SHAPE, READ BEFORE ANYTHING IS DISPATCHED");
{
    ok("!! the flag words are NAMED, so a caller never passes a bare 3",
       RESOLVE_FLAGS.JITTER_AWARE === 1 && RESOLVE_FLAGS.DERING === 2 &&
       ACCUMULATE_FLAGS.HAS_HISTORY === 1 && ACCUMULATE_FLAGS.CLAMP === 2,
       "both kernels declare their flags as WGSL consts; these are the same numbers under the same names, and a " +
       "mismatch here is a uniform laid out by hand against a shader nobody re-read");
    ok("!! the four counters are NAMED IN ONE PLACE, in the order the kernel and the CPU both use",
       Array.isArray(STAT_ORDER) && STAT_ORDER.join(",") === "reused,rejectedOffscreen,rejectedInvalid,clamped",
       `${STAT_ORDER.join(", ")} -- the kernel's STAT_* consts index the same array, so a reordering here and a ` +
       "reordering there would have to happen together or this row and the parity rows below both fail");
    ok("...and NOT counting is still an option that returns null rather than zeroes",
       typeof STATS_REASON === "string" && /not asked for/.test(STATS_REASON) && /counted: true/.test(STATS_REASON),
       "counting costs an atomic per pixel. A caller that does not want it should not pay for it, and must not " +
       "be handed zeroes it could read as a measurement.");
}

console.log("\n2. ON THE DEVICE: both kernels against their CPU references, on every branch");
const skip = webgpuSkipReason();
if (skip) { console.log(`  SKIP  ${skip}`); say("*** NOT A PASS. *** Nothing here has run."); fails++; }
else {
    const r = await runInEngineOrigin({ engineRoot: ENG, args: { R, D, JIT, src: Array.from(SRC), hist: Array.from(HIST), mot: Array.from(MOT) }, script: `async (a) => {
        const { requestDevice } = await import("/gfx/device.js");
        const { TemporalGPU } = await import("/render/temporalGPU.mjs");
        const cv = document.createElement("canvas"); cv.width = 8; cv.height = 8;
        const dev = await requestDevice(cv, { backend: "webgpu", offscreen: true });
        const errs = []; if (dev.gpu && dev.gpu.addEventListener) dev.gpu.addEventListener("uncapturederror", (e) => errs.push(String(e.error && e.error.message).slice(0, 200)));
        const G = new TemporalGPU(dev);
        const src = new Float32Array(a.src), hist = new Float32Array(a.hist), mot = new Float32Array(a.mot);

        const res = await G.resolve({ src, rw: a.R, rh: a.R, dw: a.D, dh: a.D, jitter: a.JIT });
        const resNoJit = await G.resolve({ src, rw: a.R, rh: a.R, dw: a.D, dh: a.D, jitter: a.JIT, jitterAware: false });
        const accFirst = await G.accumulate({ current: res.data, history: null, motion: null, w: a.D, h: a.D, alpha: 0.1 });
        const acc = await G.accumulate({ current: res.data, history: hist, motion: mot, w: a.D, h: a.D, alpha: 0.1, counted: true });
        const accUncounted = await G.accumulate({ current: res.data, history: hist, motion: mot, w: a.D, h: a.D, alpha: 0.1 });
        const accNoClamp = await G.accumulate({ current: res.data, history: hist, motion: mot, w: a.D, h: a.D, alpha: 0.1, clampToNeighbourhood: false });
        const chain = await G.resolveAndAccumulate({ src, rw: a.R, rh: a.R, dw: a.D, dh: a.D, jitter: a.JIT,
                                                     history: hist, motion: mot, alpha: 0.1, counted: true });
        let refused = null;
        try { new TemporalGPU({ backend: "webgl2" }); } catch (e) { refused = String(e.message).slice(0, 140); }

        const time = async (fn, n) => { await fn(); const t = performance.now(); for (let i = 0; i < n; i++) await fn(); return (performance.now() - t) / n; };
        const REPS = 15;
        const msChain = await time(() => G.resolveAndAccumulate({ src, rw: a.R, rh: a.R, dw: a.D, dh: a.D, jitter: a.JIT, history: hist, motion: mot, alpha: 0.1 }), REPS);
        const msTwo = await time(async () => { const x = await G.resolve({ src, rw: a.R, rh: a.R, dw: a.D, dh: a.D, jitter: a.JIT });
                                               return G.accumulate({ current: x.data, history: hist, motion: mot, w: a.D, h: a.D, alpha: 0.1 }); }, REPS);

        return { res: Array.from(res.data), conf: Array.from(res.confidence), resNoJit: Array.from(resNoJit.data),
                 accFirst: Array.from(accFirst.data), acc: Array.from(acc.data), accNoClamp: Array.from(accNoClamp.data),
                 chain: Array.from(chain.data), accStats: acc.stats, chainStats: chain.stats,
                 uncountedStats: accUncounted.stats, uncountedReason: accUncounted.statsReason,
                 accUncountedSame: (() => { for (let i = 0; i < acc.data.length; i++) if (acc.data[i] !== accUncounted.data[i]) return false; return true; })(), refused, errs, backend: dev.backend, msChain, msTwo, reps: REPS,
                 adapter: (dev.adapterInfo && (dev.adapterInfo.description || dev.adapterInfo.vendor)) || "unknown" };
    }` });

    ok("the runner ran on a real WebGPU device", r.ok && r.result && r.result.backend === "webgpu" && (r.result.errs || []).length === 0,
       r.ok ? `${r.result && r.result.backend}, adapter ${r.result && r.result.adapter}; errors ${(r.result && r.result.errs || []).join(" | ")}`
            : (r.reason || (r.pageErrors || []).join("; ")));

    if (r.ok && r.result) {
        const G = r.result;
        const worst = (a, b, n) => { let w = 0; for (let i = 0; i < n; i++) w = Math.max(w, Math.abs(a[i] - b[i])); return w; };
        const cRes = resolveJitterAwareCPU({ src: SRC, rw: R, rh: R, dw: D, dh: D, jitter: JIT });
        const cResNoJit = resolveJitterAwareCPU({ src: SRC, rw: R, rh: R, dw: D, dh: D, jitter: JIT, jitterAware: false });
        const cFirst = temporalAccumulateCPU({ current: cRes.data, history: null, motion: null, w: D, h: D, alpha: 0.1 });
        const cAcc = temporalAccumulateCPU({ current: cRes.data, history: HIST, motion: MOT, w: D, h: D, alpha: 0.1 });
        const cNoClamp = temporalAccumulateCPU({ current: cRes.data, history: HIST, motion: MOT, w: D, h: D, alpha: 0.1, clampToNeighbourhood: false });

        const wRes = worst(G.res, cRes.data, D * D * 4), wConf = worst(G.conf, cRes.confidence, D * D);
        ok(`*** resolve() is resolveJitterAwareCPU's picture, to ${wRes.toExponential(2)} ***`, wRes < 1e-4,
           `worst ${wRes.toExponential(3)} over ${D * D * 4} floats -- f32 on the device against f64 in JS through a Lanczos2 3x3`);
        ok(`...and its CONFIDENCE buffer matches too, to ${wConf.toExponential(2)}`, wConf < 1e-4,
           `worst ${wConf.toExponential(3)}. The second storage output is the one a caller forgets to bind: it is ` +
           "read back and compared rather than assumed written.");
        ok("!! ...and jitterAware:false really changes the answer, so the flag is not decoration",
           worst(G.res, G.resNoJit, D * D * 4) > 1e-3 && worst(G.resNoJit, cResNoJit.data, D * D * 4) < 1e-4,
           `the two GPU pictures differ by ${worst(G.res, G.resNoJit, D * D * 4).toExponential(2)} and the ` +
           "flagged-off one matches the CPU's flagged-off one -- a uniform bit that changed nothing would pass " +
           "a parity row and mean nothing");

        // *** THE COPY-THROUGH PATH IS ASSERTED EXACTLY, AGAINST THE GPU'S OWN INPUT. ***
        // The first draft compared it to the CPU's first frame at a 1e-6 tolerance and went red at 1.73e-6 --
        // and the tolerance was not the mistake, the REASONING was. With no history the kernel copies `current`
        // straight out, so the claim "it copies" is exact only against the buffer it was HANDED; comparing to
        // the CPU's first frame measures the RESOLVE's f32 error and calls it the accumulate's. Two rows now:
        // the copy is bit-identical to the GPU's own resolve output, and the CPU parity sits at its siblings'
        // 1e-4 because that is the quantity it actually measures.
        let copyDiff = 0;
        for (let i = 0; i < D * D * 4; i++) if (G.accFirst[i] !== G.res[i]) copyDiff++;
        ok("!! *** with NO history the kernel copies `current` through, bit for bit ***", copyDiff === 0,
           `${copyDiff} of ${D * D * 4} floats differ from the resolve output it was handed. The honest first ` +
           "frame is the current frame, not a blend with zeros -- and 'copies' is an exact claim, so it is " +
           "asserted against the input rather than against a CPU run of a different pass.");
        const wFirst = worst(G.accFirst, cFirst.data, D * D * 4);
        ok(`...and it matches the CPU's first frame to ${wFirst.toExponential(2)}, which is the RESOLVE's error`,
           wFirst < 1e-4,
           `worst ${wFirst.toExponential(3)}, the same 1.73e-6 the resolve row reports -- because that is what ` +
           "this comparison is made of, both sides having copied their own resolve output through unchanged.");
        const wAcc = worst(G.acc, cAcc.data, D * D * 4), wNC = worst(G.accNoClamp, cNoClamp.data, D * D * 4);
        ok(`*** accumulate() with history, a pan, an offscreen column and an invalid band matches, to ${wAcc.toExponential(2)} ***`,
           wAcc < 1e-4, `worst ${wAcc.toExponential(3)}. CPU stats for the same call: reused ${cAcc.stats.reused}, ` +
           `offscreen ${cAcc.stats.rejectedOffscreen}, invalid ${cAcc.stats.rejectedInvalid}, clamped ${cAcc.stats.clamped} ` +
           "-- all three rejection paths are exercised by this fixture, which is why they are all in it");
        ok(`...and with the neighbourhood clamp OFF, to ${wNC.toExponential(2)}`, wNC < 1e-4,
           `worst ${wNC.toExponential(3)}, and the two GPU pictures differ by ` +
           `${worst(G.acc, G.accNoClamp, D * D * 4).toExponential(2)}, so the clamp bit does something`);

        // ---- THE CHAIN ---------------------------------------------------------------------------------
        let diff = 0;
        for (let i = 0; i < D * D * 4; i++) if (G.chain[i] !== G.acc[i]) diff++;
        ok("!! *** resolve-then-accumulate on ONE encoder is bit-identical to the two run separately ***",
           diff === 0,
           `${diff} of ${D * D * 4} floats differ. Nothing had run these two kernels back to back on a device at ` +
           "all -- each gate drives its own alone -- and that order is what every frame of a temporal upscaler " +
           "uses. Same kernels, same order, same device: f32-against-f64 is no excuse and equality is exact.");

        // ---- THE COUNTERS, WHICH v4590 COULD ONLY DECLARE MISSING -----------------------------------------
        const same = (a, b) => STAT_ORDER.every((k) => a && b && a[k] === b[k]);
        ok("!! *** the device's counters EQUAL the CPU's, exactly, on a fixture that takes all three branches ***",
           same(G.accStats, cAcc.stats),
           `device ${JSON.stringify(G.accStats)} against CPU ${JSON.stringify(cAcc.stats)}. These are integers ` +
           "counted per pixel, so the claim is EQUALITY and not a tolerance -- f32 against f64 buys nothing " +
           "here, and one pixel taking a different branch on the device would show as a difference of one.");
        ok("...and the chained form counts the same, so the counter follows the pass and not the call site",
           same(G.chainStats, cAcc.stats),
           `chained ${JSON.stringify(G.chainStats)}. The counted entry point is dispatched from two places; a ` +
           "counter that only worked in one of them would be a counter nobody could trust in the other.");
        ok("!! ...and the reused + rejected counts account for EVERY pixel, which is what makes them a census",
           G.accStats && (G.accStats.reused + G.accStats.rejectedOffscreen + G.accStats.rejectedInvalid) === D * D,
           `${G.accStats && G.accStats.reused} + ${G.accStats && G.accStats.rejectedOffscreen} + ` +
           `${G.accStats && G.accStats.rejectedInvalid} = ${D * D}. clamped is a SECOND AXIS and is deliberately ` +
           "not in that sum: a reused pixel can also be clamped, and the CPU counts them separately too.");
        ok("!! *** counting does not change the picture, which is the whole claim of a second entry point ***",
           G.accUncountedSame === true,
           "the counted and uncounted dispatches produced bit-identical output. accumulateAt() decides once and " +
           "returns what it did; the two entry points differ only in whether they record it. If counting moved " +
           "a pixel, the counter would be measuring a different pass from the one that ships.");
        ok("...and an uncounted call still returns null with a reason, not zeroes",
           G.uncountedStats === null && typeof G.uncountedReason === "string",
           `stats ${JSON.stringify(G.uncountedStats)}. A frame that reused nothing and a frame nobody counted ` +
           "must not print the same number -- that rule survives the counters arriving.");

        say(`SPEED at ${R}x${R} -> ${D}x${D}, mean of ${G.reps}`,
            `chained ${G.msChain.toFixed(2)} ms, the two separately ${G.msTwo.toFixed(2)} ms ` +
            `(${(100 * (G.msTwo - G.msChain) / G.msTwo).toFixed(0)}% saved: one ${D}x${D} readback and upload not taken)`);
        ok("!! the chain does strictly less I/O than the two-call form, which is the part that is not hardware",
           G.msChain <= G.msTwo * 1.2,
           `chained ${G.msChain.toFixed(2)} ms against ${G.msTwo.toFixed(2)} ms -- slack for timing noise on a ` +
           "software adapter, not a performance claim");
        ok("...and the refusal is DRIVEN: a non-webgpu device throws at construction",
           typeof G.refused === "string" && /webgpu/.test(G.refused), G.refused || "it did NOT throw");
    }
}

console.log(fails ? `\ntemporalGPU-selfcheck: ${fails} FAILED` : "\ntemporalGPU-selfcheck: ALL GREEN");
console.log("unchecked here: the COST of counting -- an atomic per pixel is a real price and nobody has measured " +
            "it against the uncounted entry point on hardware that contends, which this box's software adapter " +
            "cannot show; the counters under a RACE, since four atomics over one workgroup-wide dispatch is the " +
            "easy case and a tiled or multi-pass accumulate would not be; and the temporal arc's other EIGHT " +
            "unreachable kernels (temporalLock's four, temporalReject's two, MOTION_WGSL and RING_FLOOR_WGSL), " +
            "which tools/ship/kernelReach-selfcheck.mjs counts at 15.");
process.exit(fails ? 1 : 0);
