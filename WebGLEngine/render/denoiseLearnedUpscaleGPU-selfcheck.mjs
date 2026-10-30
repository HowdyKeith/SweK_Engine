#!/usr/bin/env node
// WebGLEngine/render/denoiseLearnedUpscaleGPU-selfcheck.mjs -- round 71 (pre-registration section 163): U_T on the device
//
//   1. ON THE CPU: the device layers and the hold, section 163's rule (readH71) on fixtures
//   2. ON THE DEVICE (Chromium's WebGPU through tools/ship/webgpuHarness.mjs -- SwiftShader here, the GPU on the rig), on a
//      64 x 64 sequence of family R's seed 990914 (outside every split) and the committed candidate U_T (render/upscale-net-r70.json):
//      each layer against conv2dCpu on the device's own input to it, the hold against holdCpu on the device's own residual, the
//      whole pass against temporalUpscale in f64; then U_T timed at 1920 x 1080 -- the line readH71 reads
// *** ON SWIFTSHADER THE MILLISECONDS ARE A CPU's, and the timing runs at 240 x 136 there, whose line readH71 does not read. ***
//
// SABOTAGED, each restored byte-identical: D1 the hold's scale 0.6 -> 3 red; D2 the hold reading channel 3, D3 the hold reading layer
// 2, D4 layer 1 reading the input -> 2 red each; D5 readH71's T halved, D6 the threshold 0.5, D7 readH71 reading any size's line -> 1
// red each; D8 the hardware timing at 960 x 540 -> *** 0 RED at first *** (this container's adapter is software), then 1 with
// UT_TIMING and its row.
// SECTION 165: V165a the Intel's commit typed 4c111f6b, V165b its U typed 1614.0, V165c H71 typed holds, V165d the 1080's old runs read as
// counting -> 1 red each. Each restored byte-identical.
// SECTION 166: V166a run b's U typed 45.0, V166b run a read as counting, V166c the 1080's run b read as holding -> 1 red each. Each
// restored byte-identical.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { runInEngineOrigin, webgpuSkipReason } from "../tools/ship/webgpuHarness.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const imp = (p) => import(pathToFileURL(path.join(ENG, p)).href);
let fails = 0;
const ok = (label, cond, detail) => { if (!cond) fails++; console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "   " + detail : ""}`); return !!cond; };
const say = (s) => console.log(`  ----  ${s}`);
const t0 = Date.now();
const G = await imp("render/learnedUpscaleTemporalGPU.mjs"), T = await imp("render/learnedUpscaleTemporal.mjs"), { decodeNet } = await imp("render/denoiseDevice.mjs");
const { conv2dCpu } = await imp("brain/conv2d.mjs");
const tr = JSON.parse(fs.readFileSync(path.join(ENG, "render/upscale-net-r70.json"), "utf8")), Ut = decodeNet(tr.runs.find((r) => r.seed === tr.candidate).net);

console.log("1. ON THE CPU");
{
    const L = G.deviceLayersT(Ut);
    ok("  the committed candidate's four layers on the fast kernel: 17 -> 32, 32 -> 32, 32 -> 32 at 3 x 3 with ReLU, 32 -> 3 at 1 x 1; five passes with the hold",
        L.map((l) => `${l.Cin}-${l.Cout}-${l.k}-${l.act}`).join() === "17-32-3-relu,32-32-3-relu,32-32-3-relu,32-3-1-none" && L.every((l) => l.W instanceof Float32Array));
    const r = Float64Array.of(0, 20, -3, 1e-3), x = new Float64Array(2 * 17); x[0] = 2; x[1] = 4; x[2] = 1; x[17] = 3;
    const y = G.holdCpu(x, Float64Array.of(0, 20, -3, 1e-3, 0, 0), 1, 2);
    ok("  holdCpu: A (1 + 0.5 tanh r), its argument clamped to +-15 as HOLD_WGSL's -- 20 reads as 15, within 2e-13 of the unclamped",
        y[0] === 2 && y[1] === 4 * (1 + 0.5 * Math.tanh(15)) && Math.abs(y[1] - 4 * (1 + 0.5 * Math.tanh(20))) < 1e-12 && y[2] === 1 * (1 + 0.5 * Math.tanh(-3)) && y[3] === 3 * (1 + 0.5 * Math.tanh(1e-3)) &&
        G.HOLD_CLAMP === 15 && /clamp\(R\[p \* 3u \+ c\], -15\.0, 15\.0\)/.test(G.HOLD_WGSL) && /\(1\.0 \+ 0\.5 \* tanh\(r\)\)/.test(G.HOLD_WGSL));
    const up = ["section 103: the default fill listedTile, coverage bound, rest fused, accumulation tiled; the half-size chain 35.669 ms, ratio 2.099 x; with its history 37.483 ms, ratio 1.998 x"];
    const rep = (U, okAll = true) => ({ commit: "abcdef12 x", gates: [{ gate: "render/denoiseUpscaleGPU-selfcheck.mjs", ok: true, exit: { status: 0 }, measured: up },
        { gate: "render/denoiseLearnedUpscaleGPU-selfcheck.mjs", ok: okAll, exit: { status: okAll ? 0 : 1 }, measured: U === null ? [] : [`section 163: U_T at 1920 x 1080 ${U} ms (device); layer 0 9.0, layer 1 18.0`] }] });
    const a = G.readH71(rep("45.000")), b = G.readH71(rep("9.000")), c = G.readH71(rep("9.000", false)), d = G.readH71(rep(null));
    ok("!! readH71, section 163's rule, on fixtures: U off this gate's 1920 x 1080 line, T section 103's chain with its history, the ratio U / T; a red gate does not count; a missing line gives no ratio",
        a.U === 45 && a.T === 37.483 && Math.abs(a.ratio - 45 / 37.483) < 1e-12 && a.clock === "device" && a.counts && G.h71([a, a]) === "fails" && G.h71([b, b]) === "holds" &&
        G.h71([b, a]) === "fails" && !c.counts && G.h71([b, c]) === "no verdict" && d.ratio === null && G.h71([b, d]) === "no verdict" && G.H71_RATIO === 0.25,
        `U 45 / T 37.483 = ${a.ratio.toFixed(3)}`);
    const soft = G.readH71(rep("45.000")); soft.gates = null;
    const swl = { commit: "x", gates: [{ gate: "render/denoiseUpscaleGPU-selfcheck.mjs", ok: true, exit: { status: 0 }, measured: up },
        { gate: "render/denoiseLearnedUpscaleGPU-selfcheck.mjs", ok: true, exit: { status: 0 }, measured: ["section 163: U_T at 240 x 136 812.000 ms (wall)"] }] };
    ok("  ...and a software run's line, at 240 x 136, is not read: no U, no ratio", G.readH71(swl).U === null && G.readH71(swl).ratio === null);
    // section 164: the rig's first 1080 runs printed 0.000 ms from passes that failed on the default binding limit, and readH71 read it
    const zero = G.readH71(rep("0.000"));
    ok("!! a time of 0.000 is a pass that did not run: readH71 reads no U and no ratio from it (section 164)", zero.U === null && zero.ratio === null && G.h71([zero]) === "no verdict");
    let refused = null; try { await G.createDeviceTemporal({ limits: { maxStorageBufferBindingSize: 134217728, maxBufferSize: 268435456 } }, Ut, { H: 1080, W: 1920 }); } catch (e) { refused = e.message; }
    ok("!! U_T at 1920 x 1080 binds 265,420,800 bytes, and a device with the default 128 MiB binding is refused by name before anything is built",
        G.temporalBytes(1080, 1920) === 265420800 && /binds 265420800 bytes, over this device's 134217728 -- make it with temporalDevice/.test(refused || ""), refused);
    // sabotage D8 (timed at 960 x 540 on hardware) went 0 red before this row: the container's adapter is software, so the hardware size never ran
    const [hw, hh] = G.UT_TIMING.hw, hwLine = { ...swl, gates: [swl.gates[0], { ...swl.gates[1], measured: [`section 163: U_T at ${hw} x ${hh} 40.000 ms (device)`] }] };
    ok("!! the gate times U_T on hardware at UT_TIMING.hw = 1920 x 1080, section 163's size -- the one line readH71 reads", hw === 1920 && hh === 1080 && G.readH71(hwLine).U === 40 && G.UT_TIMING.soft.join() === "240,136");
}

console.log("\n1b. SECTION 165: THE COMMITTED RIG RUNS, READ BACK");
{
    const read = (k) => { const rep = JSON.parse(fs.readFileSync(path.join(ENG, `render/denoise-rig-${k}.json`), "utf8")); return { ...G.readH71(rep), intel: /intel gen-9/.test(rep.verdict), pascal: /nvidia pascal/.test(rep.verdict) }; };
    const I = ["s164-a-intel-gen9", "s164-b-intel-gen9"].map(read);
    ok("!! *** section 165: the Intel's pair at cebdc006 counts, and H71 FAILS there -- U_T 1614.7 and 1484.3 ms against T 549.3 and 498.5, U / T 2.94 and 2.98 ***",
        I.every((r) => r.intel && r.counts && r.commit === "cebdc006" && r.clock === "device") && Math.abs(I[0].U - 1614.681) < 1e-9 && Math.abs(I[1].U - 1484.288) < 1e-9 &&
        Math.abs(I[0].T - 549.298) < 1e-9 && Math.abs(I[1].T - 498.453) < 1e-9 && I.every((r) => r.ratio > 2.9 && r.ratio < 3) && G.h71(I) === "fails",
        I.map((r) => `${r.U} / ${r.T} = ${r.ratio.toFixed(3)}`).join("; "));
    const N = ["s164-a-GTX", "s164-b-GTX", "s163-a-gtx1080", "s163-b-gtx1080"].map(read);
    ok("!! ...and the 1080 has NO verdict: its four reports all ran at 4c111f6b, before section 164's fix, every one red -- and readH71 reads no U from their 0.000 lines",
        N.every((r) => r.pascal && r.commit === "4c111f6b" && !r.counts && r.U === null && r.ratio === null) && G.h71(N) === "no verdict");
}

console.log("\n1c. SECTION 166: THE 1080's PAIR AT cebdc006, READ BACK");
{
    const rd = (k) => { const rep = JSON.parse(fs.readFileSync(path.join(ENG, `render/denoise-rig-s165-${k}-gtx1080.json`), "utf8"));
        return { ...G.readH71(rep), pascal: /nvidia pascal/.test(rep.verdict), red: rep.gates.filter((g) => !g.ok).map((g) => g.gate), enoent: rep.gates.some((g) => (g.stderrTail || []).join(" ").includes("ENOENT")) }; };
    const a = rd("a"), b = rd("b");
    ok("!! *** section 166: the 1080's run b at cebdc006 counts -- U_T 46.475 ms against T 40.026, U / T 1.16, over 0.25: P1's U 40-50 and ratio 1.0-1.4 held ***",
        b.pascal && b.commit === "cebdc006" && b.counts && b.clock === "device" && Math.abs(b.U - 46.475) < 1e-9 && Math.abs(b.T - 40.026) < 1e-9 && b.ratio > 1.1 && b.ratio < 1.2 && b.U >= 40 && b.U <= 50,
        `${b.U} / ${b.T} = ${b.ratio.toFixed(3)}`);
    ok("!! ...and run a does not count: two other denoise gates died opening committed rig reports the checkout had lost (ENOENT) -- its own line, 48.834 / 38.286 = 1.28, is reported, not counted; the 1080's pair alone gives no verdict",
        a.pascal && a.commit === "cebdc006" && !a.counts && a.enoent && a.red.join() === "render/denoiseDevice-selfcheck.mjs,render/denoiseFrameGenCost-selfcheck.mjs" &&
        Math.abs(a.U - 48.834) < 1e-9 && G.h71([a, b]) === "no verdict" && G.h71([b]) === "fails");
}

console.log("\n2. ON THE DEVICE: U_T held to the CPU, then timed at 1920 x 1080");
const skip = webgpuSkipReason();
if (skip) { console.log(`  SKIP  ${skip}`); console.log("  ----  *** NOT A PASS. *** Nothing here is static."); fails++; }
else {
    const net = decodeNet(JSON.parse(fs.readFileSync(path.join(ENG, "render", "denoise-net-r11.json"), "utf8")).net);
    const ex = T.temporalExample("R", 990914, net, { W: 64, sppIn: 2, sppRef: 4 }), Hs = 64, Ws = 64;
    const enc = (n) => n.layers.map((L) => ({ Cin: L.Cin, Cout: L.Cout, k: L.k, act: L.act, W: Array.from(L.W), b: Array.from(L.b) }));
    const r = await runInEngineOrigin({ engineRoot: ENG, timeoutMs: 900000, args: { net: enc(Ut), x: Array.from(ex.x), Hs, Ws }, script: `async (a) => {
        const TG = await import("/render/learnedUpscaleTemporalGPU.mjs");
        // section 164: the device from temporalDevice, its storage limits raised for 1920 x 1080 -- the default 128 MiB binding failed every pass
        const ad = await navigator.gpu.requestAdapter(), info = (ad && ad.info) || {}, soft = !!(ad && ad.isFallbackAdapter) || /swiftshader|llvmpipe|software/i.test([info.vendor, info.architecture, info.description].join(" "));
        const [W, H] = soft ? TG.UT_TIMING.soft : TG.UT_TIMING.hw, g = await TG.temporalDevice(ad, H, W), errs = [];
        if (!g) return { compileError: "the adapter cannot hold U_T at " + W + " x " + H };
        if (g.addEventListener) g.addEventListener("uncapturederror", (e) => errs.push(String(e.error && e.error.message).slice(0, 200)));
        const net = { layers: a.net.map((L) => ({ ...L, W: Float64Array.from(L.W), b: Float64Array.from(L.b) })) };
        let small;
        try { small = await TG.createDeviceTemporal(g, net, { H: a.Hs, W: a.Ws }); } catch (e) { return { compileError: String(e.message).slice(0, 400) }; }
        const o = await small.run(Float32Array.from(a.x), { keep: true });
        // the size: 1920 x 1080 on hardware, 240 x 136 on a software adapter (the header says why); the input synthetic -- the cost
        // does not depend on what it shows
        const big = await TG.createDeviceTemporal(g, net, { H, W });
        const xb = new Float32Array(W * H * 17); let s = 7; for (let i = 0; i < xb.length; i++) { s = (s * 1103515245 + 12345) >>> 0; xb[i] = (s >>> 8) / 16777216; }
        const tm = await big.time(xb, { warmup: 2, reps: soft ? 3 : 9 });
        small.destroy(); big.destroy();
        return { y: Array.from(o.y), r: Array.from(o.r), acts: o.acts.map((v) => Array.from(v)), tm, W, H, soft, errs, passes: big.passes,
                 adapter: [info.vendor, info.architecture, info.description].filter(Boolean).join(" / ") };
    }` });
    if (r.skipped) console.log("  SKIP  " + r.reason);
    else if (!r.ok || !r.result || r.result.compileError) ok("!! the device ran U_T", false, `${r.reason || (r.result && r.result.compileError) || "no result"} ${JSON.stringify(r.pageErrors || []).slice(0, 400)}`);
    else {
        const R = r.result, n = Hs * Ws, rel = (a, b) => { let w = 0; for (let i = 0; i < a.length; i++) w = Math.max(w, Math.abs(a[i] - b[i]) / (1 + Math.abs(b[i]))); return w; };
        say(`adapter: ${R.adapter || "unnamed"}`);
        ok("  no uncaptured WebGPU error", !R.errs.length, R.errs.join("; "));
        const L = G.deviceLayersT(Ut);
        const per = L.map((l, i) => rel(R.acts[i], conv2dCpu(i ? Float32Array.from(R.acts[i - 1]) : Float32Array.from(ex.x), Hs, Ws, l)));
        ok("!! each layer on the fast kernel is conv2dCpu (f32, its order) on the device's own input to it, within 1e-5 relative", per.every((v) => v <= 1e-5), per.map((v, i) => `layer ${i} ${v.toExponential(2)}`).join(", "));
        const yh = G.holdCpu(ex.x, R.r, Hs, Ws), wh = rel(R.y, yh);
        ok("!! the hold is A (1 + 0.5 tanh r) on the device's own residual, within 1e-5 relative", wh <= 1e-5 && R.r.length === n * 3, `worst ${wh.toExponential(2)}`);
        const yc = T.temporalUpscale(Ut, ex.x, Ws, Hs).y, wc = rel(R.y, yc);
        let moved = 0; for (let i = 0; i < yc.length; i++) if (Math.abs(yc[i] - ex.x[Math.floor(i / 3) * 17 + (i % 3)]) > 1e-6) moved++;
        ok("!! the whole pass is temporalUpscale in f64 within 1e-4 relative -- the committed U_T, which moves the frame here (it is not the identity)",
            wc <= 1e-4 && moved > n, `worst ${wc.toExponential(2)}; ${moved} of ${n * 3} values corrected`);
        const tm = R.tm, pm = tm.passMs ? tm.passMs.map((v, i) => `${["layer 0", "layer 1", "layer 2", "layer 3", "hold"][i]} ${v.toFixed(3)}`).join(", ") : "no per-pass clock";
        // section 164: the line only from a clean run -- the rig's first runs printed 0.000 from passes that had failed
        if (!R.errs.length && tm.ms > 0) say(`section 163: U_T at ${R.W} x ${R.H} ${tm.ms.toFixed(3)} ms (${tm.clock}); ${pm}`);
        ok(`  ...and its line is printed, at ${R.soft ? "240 x 136 on this software adapter, which readH71 does not read" : "1920 x 1080 on hardware, which readH71 reads"}`,
            !R.errs.length && Number.isFinite(tm.ms) && tm.ms > 0 && [R.W, R.H].join() === (R.soft ? G.UT_TIMING.soft : G.UT_TIMING.hw).join() && R.passes.length === 5);
    }
}

console.log(`\n${fails ? "FAIL -- " + fails + " check(s)" : "ALL GREEN"} (${Date.now() - t0} ms)` +
    "\nnot closed here: whether U_T fits a frame on a real GPU. That is section 163's rig runs.");
process.exit(fails ? 1 : 0);
