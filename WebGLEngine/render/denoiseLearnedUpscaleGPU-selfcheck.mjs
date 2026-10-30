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
// ROUND 73 (section 167): U_TH's passes -- the 2 x 2 average, four half-size layers, the upsample and hold -- held to the CPU the same way,
// on a seeded U_TH (the cost does not depend on its weights), and timed at 1920 x 1080: the line readH73 reads.
// ROUND 73 (section 167): G1 the down pass averaging three corners -> 2 red, G2 the upsample nearest -> 2, G3 readH73 reading U_T's
// line -> 1, G4 U_TH's layers at full size -> 4. Each restored byte-identical.
// SECTION 168: V168a the s167 reports read as carrying a U_TH line, V168b the 1080's U_T typed 47.0 -> 1 red each.
// ROUND 74 (section 169): F1 the coalesced pass's row stride the half width's -> 1 red, F2 it averaging three corners -> 2, F3 its
// dispatch one group short -> 2, F4 readH74 reading round 73's line -> 1, F5 the "fast" option building the loop pass -> 1.
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
    // round 73: readH73, section 167's rule -- U_TH's own line, the same T and counting; and it does not read U_T's line, nor U_T's its
    const both = { commit: "x", gates: [rep("45.000").gates[0], { ...rep("45.000").gates[1], measured: ["section 163: U_T at 1920 x 1080 45.000 ms (device); x", "section 167: U_TH at 1920 x 1080 3.500 ms (device); y"] }] };
    const q = G.readH73(both), q0 = G.readH73(rep("45.000"));
    ok("!! readH73, section 167's rule: U_TH's 1920 x 1080 line against T, h71's verdict rule; U_T's line is not U_TH's, nor the other way",
        q.U === 3.5 && Math.abs(q.ratio - 3.5 / 37.483) < 1e-12 && G.h71([q, q]) === "holds" && G.readH71(both).U === 45 && q0.U === null && q0.ratio === null &&
        G.readH73({ ...both, gates: [both.gates[0], { ...both.gates[1], measured: ["section 167: U_TH at 1920 x 1080 0.000 ms (device)"] }] }).U === null);
    // round 74: readH74 reads its own line, not round 73's; the dispatch fits WebGPU's 65535 groups a dimension at 1920 x 1080
    const r74 = { commit: "x", gates: [rep("45.000").gates[0], { ...rep("45.000").gates[1], measured: ["section 167: U_TH at 1920 x 1080 13.600 ms (device); x", "section 169: U_TH at 1920 x 1080 5.900 ms (device); y"] }] };
    const [gx, gy] = G.downFastGroups(540, 960);
    ok("!! readH74, section 169's rule: round 74's line (5.900), not round 73's (13.600), and neither reads the other; the coalesced pass's dispatch at 960 x 540 x 17 is within 65535 groups and covers every value",
        G.readH74(r74).U === 5.9 && G.readH73(r74).U === 13.6 && G.readH74(rep("45.000")).U === null && gx <= 65535 && gx * gy * G.DOWN_FAST_GROUP >= 960 * 540 * 17 && (gx * gy - 1) * G.DOWN_FAST_GROUP < 960 * 540 * 17 + G.DOWN_FAST_GROUP * gx &&
        /fn k_down_fast/.test(G.DOWN_FAST_WGSL) && /Y\[i\] = \(X\[a\] \+ X\[b\] \+ X\[c\] \+ X\[d\]\) \/ 4\.0;/.test(G.DOWN_FAST_WGSL), `${gx} x ${gy} groups`);
    ok("  U_TH's device buffers: its input at full size is the largest, 141,004,800 bytes at 1920 x 1080 -- over the default binding too, so temporalDevice raises it",
        G.temporalBytes(1080, 1920, true) === 1920 * 1080 * 17 * 4 && G.temporalBytes(1080, 1920, true) > 134217728 && /fn k_down/.test(G.DOWN_WGSL) && /fn k_uphold/.test(G.UPHOLD_WGSL));
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

console.log("\n1d. SECTION 168: THE s167 REPORTS RAN AT cebdc006 -- NO ROUND 73 LINE, AND A COUNTING 1080 PAIR FOR ROUND 71");
{
    const rd = (k) => { const rep = JSON.parse(fs.readFileSync(path.join(ENG, `render/denoise-rig-s167-${k}.json`), "utf8")); return { h73: G.readH73(rep), h71: G.readH71(rep), pascal: /nvidia pascal/.test(rep.verdict) }; };
    const R = ["a-gtx1080", "b-gtx1080", "a-intel", "b-intel"].map(rd);
    ok("!! all four ran at cebdc006, before round 73's code (670c28bd): no U_TH line, so H73 has no verdict from them",
        R.every((r) => r.h73.commit === "cebdc006" && r.h73.counts && r.h73.U === null && r.h73.ratio === null) && G.h71(R.map((r) => r.h73)) === "no verdict");
    const N = R.filter((r) => r.pascal).map((r) => r.h71);
    ok("!! *** ...but they are a clean, counting pair on the 1080 for round 71: U_T 47.840 and 47.063 ms, U / T 1.24 and 1.23 -- H71 fails on the 1080 by its own rule too ***",
        N.length === 2 && N.every((r) => r.counts && r.commit === "cebdc006") && Math.abs(N[0].U - 47.84) < 1e-9 && Math.abs(N[1].U - 47.063) < 1e-9 && G.h71(N) === "fails",
        N.map((r) => `${r.U} / ${r.T} = ${r.ratio.toFixed(3)}`).join("; "));
}

console.log("\n2. ON THE DEVICE: U_T held to the CPU, then timed at 1920 x 1080");
const skip = webgpuSkipReason();
if (skip) { console.log(`  SKIP  ${skip}`); console.log("  ----  *** NOT A PASS. *** Nothing here is static."); fails++; }
else {
    const net = decodeNet(JSON.parse(fs.readFileSync(path.join(ENG, "render", "denoise-net-r11.json"), "utf8")).net);
    const ex = T.temporalExample("R", 990914, net, { W: 64, sppIn: 2, sppRef: 4 }), Hs = 64, Ws = 64;
    const enc = (n) => n.layers.map((L) => ({ Cin: L.Cin, Cout: L.Cout, k: L.k, act: L.act, W: Array.from(L.W), b: Array.from(L.b) }));
    // section 167 (round 73): U_TH -- a seeded one, its head made non-zero so the device's correction is not the identity; the cost does not
    // depend on the weights, so this does not wait for round 72's training
    const Uh = T.makeUpscalerT(73, "half"), { seededRandom } = await imp("brain/convNet.mjs"), rq = seededRandom(730);
    for (const Lr of Uh.layers) { for (let i = 0; i < Lr.W.length; i++) Lr.W[i] += 0.2 * (rq.u() - 0.5); for (let i = 0; i < Lr.b.length; i++) Lr.b[i] += 0.1 * (rq.u() - 0.5); }
    const r = await runInEngineOrigin({ engineRoot: ENG, timeoutMs: 900000, args: { net: enc(Ut), netH: enc(Uh), x: Array.from(ex.x), Hs, Ws }, script: `async (a) => {
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
        // round 73: U_TH on the same device -- its parity at 64 x 64, then its time at the round's size
        const netH = { layers: a.netH.map((L) => ({ ...L, W: Float64Array.from(L.W), b: Float64Array.from(L.b) })) };
        const smallH = await TG.createDeviceTemporal(g, netH, { H: a.Hs, W: a.Ws }), oh = await smallH.run(Float32Array.from(a.x), { keep: true });
        const bigH = await TG.createDeviceTemporal(g, netH, { H, W }), tmH = await bigH.time(xb, { warmup: 2, reps: soft ? 3 : 9 });
        const H_ = { y: Array.from(oh.y), r: Array.from(oh.r), xh: Array.from(oh.xh), acts: oh.acts.map((v) => Array.from(v)), tm: tmH, passes: bigH.passes, half: bigH.half };
        smallH.destroy(); bigH.destroy();
        // round 74 (section 169): the same U_TH with the coalesced down pass -- its output beside round 73's, then its time
        const smallF = await TG.createDeviceTemporal(g, netH, { H: a.Hs, W: a.Ws, down: "fast" }), of = await smallF.run(Float32Array.from(a.x), { keep: true });
        const bigF = await TG.createDeviceTemporal(g, netH, { H, W, down: "fast" }), tmF = await bigF.time(xb, { warmup: 2, reps: soft ? 3 : 9 });
        const F_ = { y: Array.from(of.y), xh: Array.from(of.xh), tm: tmF, passes: bigF.passes, down: bigF.down };
        smallF.destroy(); bigF.destroy();
        return { y: Array.from(o.y), r: Array.from(o.r), acts: o.acts.map((v) => Array.from(v)), tm, W, H, soft, errs, passes: big.passes, H_, F_,
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
        // ---- ROUND 73 (section 167): U_TH on the device -----------------------------------------------------------------------
        const Q = R.H_, hs = Hs / 2, ws = Ws / 2, LH = G.deviceLayersT(Uh);
        const dn = rel(Q.xh, T.halfInput(ex.x, Ws, Hs));
        ok("!! round 73: U_TH's first pass is halfInput, the 17 channels averaged over 2 x 2, within 1e-6 relative", Q.half && dn <= 1e-6 && Q.xh.length === hs * ws * 17, `worst ${dn.toExponential(2)}`);
        const perH = LH.map((l, i) => rel(Q.acts[i], conv2dCpu(i ? Float32Array.from(Q.acts[i - 1]) : Float32Array.from(Q.xh), hs, ws, l)));
        ok("!! ...its four layers at half size, 16 wide, are conv2dCpu on the device's own input to each, within 1e-5 relative",
            perH.every((v) => v <= 1e-5) && LH.map((l) => `${l.Cin}-${l.Cout}-${l.k}`).join() === "17-16-3,16-16-3,16-16-3,16-3-1", perH.map((v, i) => `layer ${i} ${v.toExponential(2)}`).join(", "));
        const yq = G.holdCpu(ex.x, Q.r, Hs, Ws, true), wq = rel(Q.y, yq);
        ok("!! ...its last pass upsamples the half-size residual bilinearly (upHalf) and holds A at full size, within 1e-5 relative of holdCpu on the device's own residual",
            wq <= 1e-5 && Q.r.length === hs * ws * 3, `worst ${wq.toExponential(2)}`);
        const yt = T.temporalUpscale(Uh, ex.x, Ws, Hs).y, wt = rel(Q.y, yt);
        let movedH = 0; for (let i = 0; i < yt.length; i++) if (Math.abs(yt[i] - ex.x[Math.floor(i / 3) * 17 + (i % 3)]) > 1e-6) movedH++;
        ok("!! ...and the whole of U_TH is temporalUpscale in f64 within 1e-4 relative, on a seeded U_TH that moves the frame", wt <= 1e-4 && movedH > n, `worst ${wt.toExponential(2)}; ${movedH} corrected`);
        const th = Q.tm, pmH = th.passMs ? th.passMs.map((v, i) => `${Q.passes[i].split(" (")[0]} ${v.toFixed(3)}`).join(", ") : "no per-pass clock";
        if (!R.errs.length && th.ms > 0) say(`section 167: U_TH at ${R.W} x ${R.H} ${th.ms.toFixed(3)} ms (${th.clock}); ${pmH}`);
        ok(`  ...and U_TH's line is printed, at ${R.soft ? "240 x 136 on this software adapter, which readH73 does not read" : "1920 x 1080 on hardware, which readH73 reads"}`,
            !R.errs.length && Number.isFinite(th.ms) && th.ms > 0 && Q.passes.length === 6 && Q.passes[0] === "down" && Q.passes[5] === "upsample and hold");
        // ---- ROUND 74 (section 169): the coalesced down pass ------------------------------------------------------------------
        const F = R.F_, sameBits = (u, v) => u.length === v.length && u.every((x, i) => Object.is(x, v[i]));
        ok("!! round 74: DOWN_FAST_WGSL's half-size input is DOWN_WGSL's bit for bit, and so U_TH's whole output is round 73's bit for bit",
            F.down === "fast" && sameBits(F.xh, Q.xh) && sameBits(F.y, Q.y), `${F.xh.length} values`);
        const tf = F.tm, pmF = tf.passMs ? tf.passMs.map((v, i) => `${F.passes[i].split(" (")[0]} ${v.toFixed(3)}`).join(", ") : "no per-pass clock";
        if (!R.errs.length && tf.ms > 0) say(`section 169: U_TH at ${R.W} x ${R.H} ${tf.ms.toFixed(3)} ms (${tf.clock}); ${pmF}`);
        ok(`  ...and its line is printed, at ${R.soft ? "240 x 136 on this software adapter, which readH74 does not read" : "1920 x 1080 on hardware, which readH74 reads"}`,
            !R.errs.length && Number.isFinite(tf.ms) && tf.ms > 0 && F.passes.length === 6);
    }
}

console.log(`\n${fails ? "FAIL -- " + fails + " check(s)" : "ALL GREEN"} (${Date.now() - t0} ms)` +
    "\nnot closed here: whether U_T fits a frame on a real GPU. That is section 163's rig runs.");
process.exit(fails ? 1 : 0);
