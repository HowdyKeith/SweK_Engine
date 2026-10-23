// WebGLEngine/tools/denoiseDevice.mjs -- the denoiser arc's device round, from the command line
//
// Run:  node tools/denoiseDevice.mjs --export-r11 --cache <dir> --key <record>
//           round 11's seed-1 network, from its harvest's cache, as data a page can load -> render/denoise-net-r11.json
//       node tools/denoiseDevice.mjs --export-r47 --cache <dir> --key <record>
//           round 47's seed-1 w16 network (sections 116-119), the same way -> render/denoise-net-r47-w16.json
//       node tools/denoiseDevice.mjs --measure-r12 [--cache <dir>]
//           section 35's measurement: the shipped network, on the CPU and on the device, on round 11's 24 test images
//           -> render/denoise-results-r12.json
//       node tools/denoiseDevice.mjs --measure-r13 [--cache <dir>]
//           section 39's K0 (a): the same measurement on round 13's fast kernel set -> render/denoise-results-r13.json
//       node tools/denoiseDevice.mjs --measure-r14 [--cache <dir>]
//           section 43's K0 (a): the same on round 14's set (fast kernel, head kernel, k_apply_fast) -> render/denoise-results-r14.json
//       node tools/denoiseDevice.mjs --measure-r15 [--cache <dir>]
//           section 46's K0 (a): the same on round 15's set (fast kernel, then k_head_apply) -> render/denoise-results-r15.json;
//           its last pass stores no logit, so it is judged through the image (judgeHeadApply), its hidden layers cell for cell
//       node tools/denoiseDevice.mjs --measure-r18t [--cache <dir>]   (and --measure-r18u)
//           section 61's K0 (a): the same on round 18's page sets (the pixel-tiled kernel with inline weights, or the fast
//           kernel with a block written out, then k_head_apply) -> render/denoise-results-r18t.json, -r18u.json; judged as r15 is.
//           v4849 (round 19, section 66): refused, exit 2, on a D3D12 adapter whose run compiles with FXC, which builds neither
//           set (section 60) -- SWEK_WEBGPU naming a node-webgpu 0.6.2 package runs them under its DXC
//       node tools/denoiseDevice.mjs --measure-r27w [--cache <dir>]
//           v4868 -- section 83's K0w (a): the same on round 27's Winograd set (every hidden 3 x 3 layer on the Winograd kernel, then
//           k_head_apply) -> render/denoise-results-r27w.json; each hidden cell judged against the twin its kernel answers to
//           (render/denoiseDevice.mjs's twinsOf: conv2dCpuWino or its fused mirror), and D4, the restated key: the image within 1e-5
//           of the f64 network's on every value. Refused, exit 2, on a D3D12 adapter under FXC, where nobody has built its kernel
//       node tools/denoiseDevice.mjs --which
//           section 68's native caller, on this box: the adapter, the package and the compiler read off it, the adapter's key, and
//           the set nativePick takes for them (section 67's NATIVE_KERNELS_BY_ADAPTER under DXC, DEFAULT_KERNELS otherwise) -- then
//           that set built and run once on a synthetic 64 x 64 input, against the f64 network on the CPU. Writes nothing.
//       (round 16's --measure-r16a and --measure-r16b wrote render/denoise-results-r16a.json and -r16b.json at 4b8e9d92,
//       section 55; section 57 withdrew both sets, and their flags with them)
//
// The device pass is render/denoiseDevice.mjs (gated by render/denoiseDevice-selfcheck.mjs); this file only runs it on
// the images section 35 names and writes what it finds. *** IT NEVER OVERWRITES EITHER FILE. *** Each is committed as
// written, and the measurement is committed before it is read: the log says only that the file was written.
// *** ONE DEVICE PER IMAGE. *** A Dawn device reused after the JS thread has been busy for a second crashed or hung
// while this round was built (render/denoiseDevice-selfcheck.mjs's header); each image gets a fresh adapter and device,
// destroyed before its CPU checks run. It exports nothing.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { openCache, loadRecord, hashArrays } from "../render/denoiseCache.mjs";
import { renderSplit, RESULTS_R11, RESULTS_R47 } from "../render/denoiseStudy.mjs";
import { SPLITS_R11 } from "../render/denoiseScenes.mjs";
import { denoise } from "../render/denoiseNet.mjs";
import { relMSE } from "../render/denoiseStats.mjs";
import { APPLY_TOL, kernelApplyCpu, judgeHeadApply, deviceLayers, createDeviceDenoiser, createNativeDenoiser, encodeNet, decodeNet, nativeSetsFor, twinsOf, nativeAdapterKey, nativeNetworkFor, networkFile, NATIVE_NETWORKS_BY_ADAPTER, NETWORKS_DECIDED_BY } from "../render/denoiseDevice.mjs";
import * as GPU from "./ship/headlessGpu.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const NET_FILE = "render/denoise-net-r11.json", NET_FILE_W16 = "render/denoise-net-r47-w16.json", RESULTS_R12 = "render/denoise-results-r12.json", RESULTS_R13 = "render/denoise-results-r13.json";
const RESULTS_R14 = "render/denoise-results-r14.json", RESULTS_R15 = "render/denoise-results-r15.json";
const RESULTS_R18T = "render/denoise-results-r18t.json", RESULTS_R18U = "render/denoise-results-r18u.json", RESULTS_R27W = "render/denoise-results-r27w.json";
// each measurement, by flag: the kernel set it runs the device pass on, and the file it writes (sections 35, 39, 43, 46 and 61)
const MEASURES = { "--measure-r12": { kernels: "r12", results: RESULTS_R12 }, "--measure-r13": { kernels: "r13", results: RESULTS_R13 },
                   "--measure-r14": { kernels: "r14", results: RESULTS_R14 }, "--measure-r15": { kernels: "r15", results: RESULTS_R15 },
                   "--measure-r18t": { kernels: "r18t", results: RESULTS_R18T }, "--measure-r18u": { kernels: "r18u", results: RESULTS_R18U },
                   "--measure-r27w": { kernels: "r27w", results: RESULTS_R27W } };
const measure = Object.keys(MEASURES).find((k) => process.argv.includes(k));
// section 35's bound for D3: the device's relMSE on an image within this relative distance of the f64 network's
const D3_REL = 1e-4;
// v4868 -- section 83's restated key, D4: the device's image within this of the f64 network's on every value, relative, with a floor of
// 1e-12 -- the bound render/denoiseDevice-selfcheck.mjs has held every set's image to since section 35, and for r27w the bridge to r15
const D4_REL = 1e-5;
const args = process.argv.slice(2), arg = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const refuseIfExists = (f) => { if (fs.existsSync(path.join(ENG, f))) { console.log(`[denoiseDevice] ${f} exists -- it is never overwritten`); process.exit(2); } };

if (args.includes("--export-r11")) {
    refuseIfExists(NET_FILE);
    const dir = arg("--cache"), key = arg("--key");
    if (!dir || !key) { console.log("[denoiseDevice] --export-r11 needs --cache <the round 11 harvest's cache> and --key <its seed-1 network record>"); process.exit(2); }
    const net = loadRecord(path.resolve(dir), key), R11 = JSON.parse(fs.readFileSync(path.join(ENG, RESULTS_R11), "utf8"));
    if (!net) { console.log(`[denoiseDevice] no record ${key} in ${dir}`); process.exit(2); }
    const { score, ...filter } = R11.filter;
    fs.writeFileSync(path.join(ENG, NET_FILE), JSON.stringify({
        about: "The denoiser arc's round 11 network (pre-registration sections 32-34): the large kernel-predicting network trained on 96 scenes of family R " +
               "and 96 of family C together, seed 1, as render/denoiseDevice.mjs decodes it. Trained on R and C only -- nothing in the arc says it works on any other scene.",
        source: { results: RESULTS_R11, harvest: "88fa9228", seed: 1, cacheKey: key },
        filter, scenes: { families: ["R", "C"], image: R11.config.image, sppIn: R11.config.sppIn, emitterMask: true },
        net: encodeNet(net),
    }) + "\n");
    console.log(`[denoiseDevice] wrote ${NET_FILE}`);
} else if (args.includes("--export-r47")) {
    // round 49 (section 119): round 47's seed-1 network, 16 channels wide, as --export-r11 wrote round 11's -- the same record format,
    // the filter its harvest tuned (round 11's setting exactly), and refused unless the record is that harvest's w16 shape
    refuseIfExists(NET_FILE_W16);
    const dir = arg("--cache"), key = arg("--key");
    if (!dir || !key) { console.log("[denoiseDevice] --export-r47 needs --cache <the round 47 harvest's cache> and --key <its seed-1 w16 network record>"); process.exit(2); }
    const net = loadRecord(path.resolve(dir), key), R47 = JSON.parse(fs.readFileSync(path.join(ENG, RESULTS_R47), "utf8"));
    if (!net) { console.log(`[denoiseDevice] no record ${key} in ${dir}`); process.exit(2); }
    if (net.layers.map((L) => L.Cout).join("/") !== "16/16/16/16/81") { console.log(`[denoiseDevice] ${key} is not a w16 network: ${net.layers.map((L) => L.Cout).join("/")}`); process.exit(2); }
    const { score, ...filter } = R47.filter;
    fs.writeFileSync(path.join(ENG, NET_FILE_W16), JSON.stringify({
        about: "The denoiser arc's round 47 network (pre-registration sections 116 and 118): the kernel-predicting network 16 channels wide, trained on round 11's 96 scenes " +
               "of family R and 96 of family C, seed 1, as render/denoiseDevice.mjs decodes it. Trained on R and C only; on them, 1.117 x the shipped network's error on R and 1.297 x on C.",
        source: { results: RESULTS_R47, harvest: "c912e1ff", seed: 1, cacheKey: key },
        filter, scenes: { families: ["R", "C"], image: R47.config.image, sppIn: R47.config.sppIn, emitterMask: true },
        net: encodeNet(net),
    }) + "\n");
    console.log(`[denoiseDevice] wrote ${NET_FILE_W16}`);
} else if (args.includes("--which")) {
    // v4852 -- round 20 (section 68): the native caller, run once. The compiler is read off the package with the flags the device
    // is made with (none: Dawn as shipped), as the gates read it; the pick is render/denoiseDevice.mjs's nativePick.
    GPU.configureVulkanIcd();
    const W = GPU.resolveWebgpu(), FLAGS = [];
    if (!W.mod) { console.log(`[denoiseDevice] --which needs a device: ${W.refused || "node-webgpu did not resolve"}`); process.exit(2); }
    const pkg = GPU.webgpuPackage(W.from), compiler = GPU.nativeCompiler({ pkg, platform: process.platform, flags: FLAGS });
    const gpu = W.mod.create([...FLAGS]), adapter = await gpu.requestAdapter();
    if (!adapter) { console.log("[denoiseDevice] --which: node-webgpu gave no adapter"); GPU.exitCleanly(2); }
    const info = adapter.info || {}, dev = await adapter.requestDevice();
    console.log(`[denoiseDevice] --which: adapter ${[info.vendor, info.architecture, info.description].filter(Boolean).join(" / ") || "(unnamed)"}; ` +
                `node-webgpu ${(pkg && pkg.version) || "(version unread)"} from ${W.from}; compiler ${compiler || `none on ${process.platform}`}`);
    // round 53 (section 124): the network this adapter's key names in NATIVE_NETWORKS_BY_ADAPTER, else the shipped one -- said on a
    // line of its own, so the pick line keeps the shape the rig's earlier --which logs were parsed by
    const nKey = nativeAdapterKey(info, process.platform), netName = nativeNetworkFor(nKey);
    console.log(`[denoiseDevice] --which: network ${netName} -- ${Object.hasOwn(NATIVE_NETWORKS_BY_ADAPTER, nKey || "") ? `the table's for ${nKey} (${NETWORKS_DECIDED_BY[nKey]})` : `no entry for ${nKey || "(no key)"}, the shipped network`}`);
    const net = decodeNet(JSON.parse(fs.readFileSync(path.join(ENG, networkFile(netName)), "utf8")).net), N = 64, C = 10;
    // a fixed synthetic input: nine channels of smooth values and an emitter mask of zeros, so the pass is the same on every box
    const x = new Float32Array(N * N * C);
    for (let i = 0; i < N * N; i++) for (let c = 0; c < C - 1; c++) x[i * C + c] = 0.5 + 0.4 * Math.sin(0.37 * i + 1.3 * c);
    let picked, out, worst = 0;
    try {
        picked = await createNativeDenoiser(adapter, dev, net, { H: N, W: N, C, compiler, platform: process.platform });
        console.log(`[denoiseDevice] --which: key ${picked.key || "(none)"}; kernels ${picked.kernels} -- ${picked.why}`);
        out = await picked.denoiser.run(x); picked.denoiser.destroy();
    } finally { dev.destroy(); }
    const y64 = denoise(net, x, N, N).y;
    for (let c = 0; c < y64.length; c++) worst = Math.max(worst, Math.abs(out.y[c] - y64[c]) / (Math.abs(y64[c]) + 1e-6));
    const finite = out.y.every(Number.isFinite);
    console.log(`[denoiseDevice] --which: ${picked.kernels} built and ran one ${N} x ${N} pass in ${out.ms.toFixed(3)} ms; ` +
                `worst relative difference from the f64 network on the CPU ${worst.toExponential(2)}${finite ? "" : "; NOT FINITE"}`);
    GPU.exitCleanly(finite ? 0 : 1);
} else if (measure) {
    const { kernels, results: RESULTS } = MEASURES[measure];
    refuseIfExists(RESULTS);
    // v4849 -- round 19 (section 66): the device's package, and the compiler the run compiles with, read off it with the flags the
    // device is made with (FLAGS: none, Dawn as shipped) -- before anything is read, cached or built. --measure-r18t and
    // --measure-r18u built on a Dawn made as shipped and never asked: on a D3D12 adapter under FXC, r18t's kernel stops the build and
    // r18u's crashes it (section 60), an image in. A set nativeSetsFor drops for this adapter and compiler is refused here, by
    // name; 0.6.2's DXC built both (section 65). render/denoiseDevice-selfcheck.mjs reads this source: no gate runs this file.
    GPU.configureVulkanIcd();
    const W = GPU.resolveWebgpu(), FLAGS = [];
    if (!W.mod) { console.log(`[denoiseDevice] ${measure} needs a device: ${W.refused || "node-webgpu did not resolve"}`); process.exit(2); }
    const pkg = GPU.webgpuPackage(W.from), compiler = GPU.nativeCompiler({ pkg, platform: process.platform, flags: FLAGS });
    const gpu = W.mod.create([...FLAGS]), first = await gpu.requestAdapter();
    if (!nativeSetsFor(first, [kernels], { compiler }).length) {
        console.log(`[denoiseDevice] ${measure} refused: ${kernels} is one of FXC_UNBUILT_SETS or FXC_UNTRIED_SETS and this run compiles with ${compiler || "FXC"} on a D3D12 adapter ` +
                    `(${(first && first.info && first.info.description) || "?"}; node-webgpu ${(pkg && pkg.version) || "(version unread)"} from ${W.from}), which does not build its kernel (section 60) or never has (section 83) -- ` +
                    `set ${GPU.WEBGPU_ENV} to the directory of a node-webgpu 0.6.2 package, which ships its DXC beside dawn.node`);
        GPU.exitCleanly(2);
    }
    const shipped = JSON.parse(fs.readFileSync(path.join(ENG, NET_FILE), "utf8")), net = decodeNet(shipped.net);
    const R11 = JSON.parse(fs.readFileSync(path.join(ENG, RESULTS_R11), "utf8")), { image, sppIn, sppRef } = R11.config;
    const git = (...a) => execFileSync("git", a, { cwd: ENG, encoding: "utf8", maxBuffer: 1 << 28 });
    const dir = arg("--cache");
    const cache = dir ? openCache(path.resolve(dir), { results: RESULTS, commit: git("rev-parse", "HEAD").trim(),
                                                      diff: hashArrays([git("diff", "HEAD", "--", "render", "brain", "physics", "tools")]) }) : null;
    const t0 = Date.now(), rows = [];
    // a set whose last pass is k_head_apply (r15, r18t, r18u) stores no logit: its head is judged through the image
    const fusedSet = deviceLayers(net, kernels).at(-1).kernel === "head_apply";
    let adapterName = null;
    for (const name of ["T1", "T2"]) {
        // the harvest's own renders of its test scenes -- the same keys, so a cache made from the harvest's serves them
        const ims = renderSplit(SPLITS_R11[name], { harvest: true, image, sppIn, sppRef, ref2: true, emitterMask: true, cache });
        for (let i = 0; i < ims.length; i++) {
            const im = ims[i], x = im.x;
            // the device first, on its own fresh device, destroyed before the CPU work below
            const adapter = await gpu.requestAdapter(), dev = await adapter.requestDevice(), info = adapter.info || {};
            adapterName = adapterName || [info.vendor, info.architecture, info.description].filter(Boolean).join(" / ");
            let out;
            try { const Dn = await createDeviceDenoiser(dev, net, { H: image, W: image, C: 10, kernels }); out = await Dn.run(x, { keep: true }); Dn.destroy(); }
            finally { dev.destroy(); }
            const y64 = denoise(net, x, image, image).y, rel64 = relMSE(y64, im.ref), relDev = relMSE(out.y, im.ref);
            const DL = deviceLayers(net, kernels), fusedLast = DL[DL.length - 1].kernel === "head_apply";
            const layers = DL.map((L, j) => {
                // a fused last pass (k_head_apply) stores no cell: it is judged through the image, below
                if (L.kernel === "head_apply") return { kernel: L.kernel, plain: 0, fused: 0, unexplained: 0, image: true };
                // v4868 -- the twin and mirror this layer's kernel answers to: the Winograd pair for r27w's hidden layers (section 83)
                const input = j ? out.acts[j - 1] : Float32Array.from(x), T = twinsOf(L), tw = T.twin(input, image, image, L), fm = T.mirror(input, image, image, L);
                let plain = 0, fused = 0, unexplained = 0;
                for (let c = 0; c < tw.length; c++) { const v = out.acts[j][c]; if (v === tw[c]) plain++; else if (v === fm[c]) fused++; else unexplained++; }
                return { kernel: L.kernel, plain, fused, unexplained };
            });
            let applyWorst = 0, applyTwin, applyMirror;
            if (fusedLast) ({ worst: applyWorst, twin: applyTwin, mirror: applyMirror } = judgeHeadApply(x, out.acts[DL.length - 2], DL[DL.length - 1], out.y, image, image));
            else { const tw = kernelApplyCpu(x, out.acts[out.acts.length - 1], image, image);
                   for (let c = 0; c < tw.length; c++) applyWorst = Math.max(applyWorst, Math.abs(out.y[c] - tw[c]) / (Math.abs(tw[c]) + 1e-30)); }
            const filter = R11.tables[name].filter[i];
            let imageWorst = 0; for (let c = 0; c < y64.length; c++) imageWorst = Math.max(imageWorst, Math.abs(out.y[c] - y64[c]) / (Math.abs(y64[c]) + 1e-12));
            rows.push({ set: name, family: SPLITS_R11[name].family, seed: SPLITS_R11[name].seeds[i], harvestSeed1: R11.tables[name].net[0][i], cpu: rel64, device: relDev, filter,
                        layers, applyWorst, ...(fusedLast ? { applyTwin, applyMirror } : {}), imageWorst, ms: out.ms });
        }
    }
    const D0 = rows.every((r) => Object.is(r.cpu, r.harvestSeed1));
    const D1 = rows.every((r) => r.layers.every((l) => l.unexplained === 0));
    const D2 = Math.max(...rows.map((r) => r.applyWorst));
    const D3 = Math.max(...rows.map((r) => Math.abs(r.device / r.cpu - 1)));
    const D4 = Math.max(...rows.map((r) => r.imageWorst));
    const wins = (k, set) => rows.filter((r) => r.set === set && r[k] < r.filter).map((r) => r.seed);
    const sameWins = ["T1", "T2"].every((s) => wins("device", s).join() === wins("cpu", s).join());
    const out = {
        config: { net: NET_FILE, results: RESULTS_R11, kernels, image, sppIn, sppRef, APPLY_TOL, D3_REL, D4_REL, images: rows.length },
        criteria: {
            D0: { ok: D0, what: "the shipped network on the CPU (f64) gives the harvest's seed-1 relMSE on every test image, bit for bit" },
            D1: { ok: D1, what: "every conv cell on the device is the twin's or the fused mirror's -- the pair its kernel answers to (twinsOf) -- given the device's own input to that layer" +
                      (fusedSet ? " -- the hidden layers' cells: the head's are never stored, and are judged through the image (D2)" : ""),
                  fused: rows.reduce((a, r) => a + r.layers.reduce((b, l) => b + l.fused, 0), 0), cells: rows.reduce((a, r) => a + r.layers.reduce((b, l) => b + l.plain + l.fused + l.unexplained, 0), 0) },
            D2: { ok: D2 <= APPLY_TOL, worst: D2, what: fusedSet
                      ? "the head and kernel pass on the device within APPLY_TOL of kernelApplyCpu on the twin's logits or the fused mirror's, from the device's own input to the head"
                      : "the kernel on the device within APPLY_TOL of its twin" },
            D3: { ok: D3 <= D3_REL && sameWins, worst: D3, sameWins, winsDevice: { T1: wins("device", "T1").length, T2: wins("device", "T2").length },
                  winsCpu: { T1: wins("cpu", "T1").length, T2: wins("cpu", "T2").length },
                  what: "the device's relMSE within D3_REL of the f64 network's on every image, and it beats the primary filter on exactly the same images" },
            D4: { ok: D4 <= D4_REL, worst: D4, what: "the device's image within D4_REL of the f64 network's on every value (relative, floor 1e-12) -- section 83's restated key" },
        },
        rows, adapter: adapterName, seconds: (Date.now() - t0) / 1000, ...(cache ? { cache: { hits: cache.hits, misses: cache.misses } } : {}),
    };
    fs.writeFileSync(path.join(ENG, RESULTS), JSON.stringify(out, null, 1) + "\n");
    // the verdict is in the file, committed before it is read -- the log says only that it was written
    console.log(`[denoiseDevice] wrote ${RESULTS}`);
    GPU.exitCleanly(0);
} else {
    console.log("usage: node tools/denoiseDevice.mjs --export-r11 --cache <dir> --key <record> | --measure-r12 [--cache <dir>] | --measure-r13 [--cache <dir>] | --measure-r14 [--cache <dir>]" +
                " | --measure-r15 | --measure-r18t | --measure-r18u | --measure-r27w [--cache <dir>] | --which   (see render/learned-denoiser-preregistration.md, sections 35, 39, 43, 46, 61, 68 and 83)");
    process.exit(2);
}
