#!/usr/bin/env node
// WebGLEngine/tools/denoiseLayers.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// WHERE THE DENOISER'S TIME GOES ON THIS GPU, LAYER BY LAYER, AND A KERNEL SET AIMED AT THE SLOWEST. Keith: "The denoiser's slowest layers measured on a real GPU, then a
// kernel set aimed at them." denoise.html shows each layer's time on the card (render/gpuTimer.mjs); on SwiftShader the hidden 3 x 3 layers are the heaviest, but a
// software adapter's ranking is a CPU's, not a GPU's. This measures it where it is run -- the rig's real GPU is the point -- and acts on it:
//
//   1  EVERY WHOLE SET, ITS PASSES TIMED   render/denoiseDevice.mjs's timingLadder at one size, every set of TIMED_SETS this adapter and compiler can build (nativeSetsFor,
//                                          featureSetsFor), the sets taking turns; each pass on the device's own clock (timestamp queries, the unrounded clock flag)
//   2  THE AIMED SET                       per layer, the set that ran THAT LAYER fastest: a MIXED set (deviceLayers takes one set a layer). The last layer is costed
//                                          with the passes after it (a fused head_apply has no apply pass; a plain last layer has one), so sets are compared like for like
//   3  ITS IMAGE AND ITS TIME              the aimed set built, its image against the f64 network on the CPU (worst relative difference) and against the fastest whole set's,
//                                          then the two timed head to head, taking turns, on one device
//
//   node tools/denoiseLayers.mjs [--size 512] [--net shipped] [--rounds 5] [--out FILE] [--aim r18t,r15,r15,r15,r15]
//   --aim: head to head with THIS mixed set (one set a layer) instead of the one the timings aim at; the report says it was asked for
//
// It writes one JSON report (by default render/denoise-layers-<adapter>.json) and NEVER OVERWRITES ONE: a measurement is committed as written. A software adapter is said so in
// the report and on the console, first: its numbers are not the rig's. Held by tools/denoiseLayers-selfcheck.mjs (the aiming arithmetic, and a run on SwiftShader at a small size).
// The rig's commands: docs/real-hardware-denoiser-layers.md.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import * as DD from "../render/denoiseDevice.mjs";
import { denoise } from "../render/denoiseNet.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** A set's pass times as one cost a layer: layer i's own pass, and for the last layer every pass from it on (its apply, if the set has one). Pure. */
export function stagesOf(perPass, nLayers) {
    if (!Array.isArray(perPass) || perPass.length < nLayers) return null;
    return Array.from({ length: nLayers }, (_, i) => (i < nLayers - 1 ? perPass[i].ms : perPass.slice(i).reduce((a, p) => a + p.ms, 0)));
}
/** How much faster another set's kernel must run a layer than the fastest whole set's before the aimed set takes it -- a HAND-SET margin, so that timing noise between
 *  two runs of a near-equal kernel does not make a mixed set out of nothing. */
export const MARGIN = 0.05;
/** From each whole set's stage costs ({ set: [ms a layer] }) and, optionally, the kernel each set runs a layer on ({ set: [kernel] }): per layer the fastest set and every
 *  set's time; the AIMED (mixed) set -- the fastest whole set's own kernel on a layer unless another set runs it on a DIFFERENT kernel at least MARGIN faster; the
 *  slowest layers of the fastest whole set. Pure. */
export function aim(stages, nLayers, kernels = null, margin = MARGIN) {
    const sets = Object.keys(stages).filter((s) => stages[s]);
    if (!sets.length) throw new Error("denoiseLayers.aim: no set was timed on the device's clock");
    const total = (s) => stages[s].reduce((a, v) => a + v, 0), best = sets.slice().sort((p, q) => total(p) - total(q))[0];
    const kOf = (s, i) => (kernels && kernels[s] ? kernels[s][i] : s);
    const perLayer = Array.from({ length: nLayers }, (_, i) => { const by = Object.fromEntries(sets.map((s) => [s, stages[s][i]])), fastest = sets.slice().sort((p, q) => by[p] - by[q])[0];
        const set = kOf(fastest, i) !== kOf(best, i) && by[fastest] < (1 - margin) * by[best] ? fastest : best;
        return { layer: i, set, kernel: kOf(set, i), ms: by[set], fastest, bySet: by }; });
    const mixed = perLayer.map((l) => l.set), predicted = perLayer.reduce((a, l) => a + l.ms, 0);
    const slowest = stages[best].map((ms, layer) => ({ layer, ms, share: ms / total(best) })).sort((p, q) => q.ms - p.ms);
    return { best, bestMs: total(best), perLayer, mixed, predictedMs: predicted, predictedGain: total(best) / predicted, slowest, uniform: new Set(mixed).size === 1 };
}

/** The whole measurement on `gpu` (a node-webgpu GPU object). Returns the report. */
export async function measure(gpu, net, { size = 512, rounds = 5, compiler = null, aimAt = null, trace = () => {} } = {}) {
    const first = await gpu.requestAdapter(); if (!first) throw new Error("denoiseLayers: node-webgpu gave no adapter");
    const adapter = DD.adapterOf(first), n = net.layers.length;
    if (!adapter.timestamps) throw new Error(`denoiseLayers: ${adapter.name} offers no timestamp-query -- a layer's time needs the device's own clock`);
    const sets = DD.featureSetsFor(first, DD.nativeSetsFor(first, DD.TIMED_SETS, { compiler })), C = net.layers[0].Cin, H = size, W = size;
    trace(`timing ${sets.join(", ")} at ${W} x ${H} on ${adapter.name}`);
    const ladder = await DD.timingLadder(net, () => gpu.requestAdapter(), { sizes: [[W, H]], sets, rounds: 3, capMs: 1e9, capBySet: {}, totalMs: 1e9, warmup: 2, minReps: 6, maxReps: 30, budgetMs: 4000, trace });
    const stages = {}, whole = {};
    for (const s of sets) { const r = ladder.rows[s][0]; whole[s] = r.skipped ? { skipped: r.reason } : { gpuMs: r.gpu && r.gpu.median, perPass: r.perPass, passes: r.passes }; stages[s] = !r.skipped && r.perPass ? stagesOf(r.perPass, n) : null; }
    const A = aim(stages, n, Object.fromEntries(sets.map((s) => [s, DD.deviceLayers(net, s).map((L) => L.kernel)])));
    if (aimAt) { DD.deviceLayers(net, aimAt); A.mixed = aimAt.slice(); A.forced = true; A.uniform = new Set(aimAt).size === 1; A.perLayer.forEach((l, i) => { l.set = aimAt[i]; l.kernel = DD.deviceLayers(net, aimAt)[i].kernel; l.ms = l.bySet[aimAt[i]] ?? null; }); A.predictedMs = A.perLayer.every((l) => l.ms !== null) ? A.perLayer.reduce((t, l) => t + l.ms, 0) : null; A.predictedGain = A.predictedMs ? A.bestMs / A.predictedMs : null; }
    // the aimed set against the fastest whole set, on one fresh device, taking turns
    const a = await gpu.requestAdapter(), dev = await DD.timingDevice(a, DD.largestBuffer(net, H, W)), x = DD.timingInput(H, W, C);
    const got = { mixed: [], best: [] }; let image;
    try {
        const D = { mixed: await DD.createDeviceDenoiser(dev, net, { H, W, C, kernels: A.mixed, subgroupMinSize: a.info && a.info.subgroupMinSize }), best: await DD.createDeviceDenoiser(dev, net, { H, W, C, kernels: A.best, subgroupMinSize: a.info && a.info.subgroupMinSize }) };
        for (let r = 0; r < rounds; r++) for (const k of r % 2 ? ["best", "mixed"] : ["mixed", "best"]) { trace(`head to head, round ${r}: ${k}`); const t = await D[k].time(x, { warmup: r ? 1 : 2, minReps: 3, maxReps: 10, budgetMs: 2000 }); if (t.gpu) got[k].push(...t.gpu); }
        const ym = (await D.mixed.run(x)).y, yb = (await D.best.run(x)).y, y64 = denoise(net, x, H, W).y;
        let w64 = 0, wb = 0; for (let i = 0; i < y64.length; i++) { w64 = Math.max(w64, Math.abs(ym[i] - y64[i]) / (Math.abs(y64[i]) + 1e-6)); wb = Math.max(wb, Math.abs(ym[i] - yb[i]) / (Math.abs(yb[i]) + 1e-6)); }
        image = { worstVsF64: w64, worstVsBest: wb, finite: ym.every(Number.isFinite), built: D.mixed.layers.map((l) => l.kernel), wanted: DD.deviceLayers(net, A.mixed).map((l) => l.kernel) };
        D.mixed.destroy(); D.best.destroy();
    } finally { dev.destroy(); }
    const m = DD.summarize(got.mixed), b = DD.summarize(got.best);
    return { about: "tools/denoiseLayers.mjs: where the denoiser's time goes on this adapter, layer by layer, and a kernel set aimed at the slowest", adapter, software: adapter.software, compiler, size: [W, H],
        network: net.layers.map((L) => ({ Cin: L.Cin, Cout: L.Cout, k: L.k })), sets, whole, aim: A, headToHead: { rounds, mixed: m, best: b, gain: m && b ? b.median / m.median : null }, image, at: new Date().toISOString() };
}
/** The report's lines for a person. Pure. */
export function reportLines(r) {
    const L = [];
    if (r.software) L.push(`*** ${r.adapter.name} IS A SOFTWARE ADAPTER: THESE ARE A CPU'S TIMES, NOT A GPU'S ***`);
    L.push(`${r.adapter.name}, ${r.size[0]} x ${r.size[1]}, sets ${r.sets.join(", ")}; the fastest whole set ${r.aim.best}, ${r.aim.bestMs.toFixed(3)} ms on the card`);
    L.push(`  its slowest layers: ${r.aim.slowest.slice(0, 3).map((s) => `L${s.layer} ${s.ms.toFixed(3)} ms (${(100 * s.share).toFixed(0)}%)`).join(", ")}`);
    for (const l of r.aim.perLayer) L.push(`  L${l.layer}: aimed at ${l.set}'s ${l.kernel} (${l.ms.toFixed(3)} ms; fastest ${l.fastest}); ${Object.entries(l.bySet).sort((p, q) => p[1] - q[1]).map(([s, v]) => `${s} ${v.toFixed(3)}`).join(", ")}`);
    L.push(`  THE ${r.aim.forced ? "ASKED-FOR (--aim)" : "AIMED"} SET: [${r.aim.mixed.join(", ")}]${r.aim.uniform && !r.aim.forced ? ` -- ${r.aim.best} already runs every layer within ${100 * MARGIN}% of the fastest other kernel` : ""}; predicted ${r.aim.predictedMs ? r.aim.predictedMs.toFixed(3) + " ms, " + r.aim.predictedGain.toFixed(3) + " x the fastest whole set" : "(a set not timed whole)"}`);
    const h = r.headToHead; L.push(`  HEAD TO HEAD, ${h.rounds} rounds taking turns: aimed ${h.mixed ? h.mixed.median.toFixed(3) : "?"} ms, ${r.aim.best} ${h.best ? h.best.median.toFixed(3) : "?"} ms -- ${h.gain ? h.gain.toFixed(3) + " x" : "not measured"}`);
    L.push(`  its image: worst relative difference ${r.image.worstVsF64.toExponential(2)} from the f64 network on the CPU, ${r.image.worstVsBest.toExponential(2)} from ${r.aim.best}'s${r.image.finite ? "" : "; NOT FINITE"}`);
    return L;
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
    const GPU = await import("./ship/headlessGpu.mjs"), rest = process.argv.slice(2), arg = (k, d = null) => { const i = rest.indexOf("--" + k); return i >= 0 ? rest[i + 1] : d; };
    const bad = rest.filter((x) => x.startsWith("--") && !["size", "net", "rounds", "out", "aim"].includes(x.slice(2)));
    if (bad.length) { console.error(`denoiseLayers: unknown option ${bad.join(", ")}`); process.exit(2); }
    const size = Number(arg("size", 512)), rounds = Number(arg("rounds", 5));
    if (!(Number.isInteger(size) && size >= 16 && size <= 2048) || !(Number.isInteger(rounds) && rounds >= 1)) { console.error("denoiseLayers: --size is a whole number of pixels, 16 to 2048, and --rounds at least 1"); process.exit(2); }
    const netName = arg("net", "shipped"), file = path.join(ENG, DD.networkFile(netName)), net = DD.decodeNet(JSON.parse(fs.readFileSync(file, "utf8")).net);
    GPU.configureVulkanIcd();
    const W = GPU.resolveWebgpu(createRequire(import.meta.url)), FLAGS = [GPU.FINE_CLOCK_FLAG];
    if (!W.mod) { console.error(`denoiseLayers: needs a device: ${W.refused || "node-webgpu did not resolve"}`); process.exit(2); }
    const pkg = GPU.webgpuPackage(W.from), compiler = GPU.nativeCompiler({ pkg, platform: process.platform, flags: FLAGS }), gpu = W.mod.create(FLAGS);
    const probe = DD.adapterOf(await gpu.requestAdapter()), slug = probe.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "adapter";
    const out = arg("out", path.join(ENG, "render", `denoise-layers-${slug}.json`));
    if (fs.existsSync(out)) { console.error(`denoiseLayers: ${out} is already there -- a measurement is never overwritten; give --out another file`); process.exit(1); }
    if (probe.software) console.log(`*** ${probe.name} IS A SOFTWARE ADAPTER: what follows is a CPU's times, not a GPU's -- run this on the rig for the real ones ***`);
    const aimAt = arg("aim") ? arg("aim").split(",") : null;
    if (aimAt) try { DD.deviceLayers(net, aimAt); } catch (e) { console.error(`denoiseLayers: --aim ${arg("aim")}: ${e.message}`); process.exit(2); }
    const r = await measure(gpu, net, { size, rounds, compiler, aimAt, trace: (m) => console.log(`  ... ${m}`) });
    r.network = { name: netName, file: path.relative(ENG, file).split(path.sep).join("/"), layers: r.network }; r.package = pkg && pkg.version || null;
    fs.writeFileSync(out, JSON.stringify(r, null, 1) + "\n");
    for (const l of reportLines(r)) console.log(l);
    console.log(`wrote ${out}`);
    GPU.exitCleanly(r.image.finite && r.image.worstVsF64 < 1e-3 ? 0 : 1);
}
