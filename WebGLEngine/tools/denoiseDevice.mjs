// WebGLEngine/tools/denoiseDevice.mjs -- the denoiser arc's device round, from the command line
//
// Run:  node tools/denoiseDevice.mjs --export-r11 --cache <dir> --key <record>
//           round 11's seed-1 network, from its harvest's cache, as data a page can load -> render/denoise-net-r11.json
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
import { renderSplit, RESULTS_R11 } from "../render/denoiseStudy.mjs";
import { SPLITS_R11 } from "../render/denoiseScenes.mjs";
import { denoise } from "../render/denoiseNet.mjs";
import { relMSE } from "../render/denoiseStats.mjs";
import { conv2dCpu, conv2dCpuFma } from "../brain/conv2d.mjs";
import { APPLY_TOL, kernelApplyCpu, judgeHeadApply, deviceLayers, createDeviceDenoiser, encodeNet, decodeNet } from "../render/denoiseDevice.mjs";
import * as GPU from "./ship/headlessGpu.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const NET_FILE = "render/denoise-net-r11.json", RESULTS_R12 = "render/denoise-results-r12.json", RESULTS_R13 = "render/denoise-results-r13.json";
const RESULTS_R14 = "render/denoise-results-r14.json", RESULTS_R15 = "render/denoise-results-r15.json";
// each measurement, by flag: the kernel set it runs the device pass on, and the file it writes (sections 35, 39, 43, 46 and 54)
const MEASURES = { "--measure-r12": { kernels: "r12", results: RESULTS_R12 }, "--measure-r13": { kernels: "r13", results: RESULTS_R13 },
                   "--measure-r14": { kernels: "r14", results: RESULTS_R14 }, "--measure-r15": { kernels: "r15", results: RESULTS_R15 } };
const measure = Object.keys(MEASURES).find((k) => process.argv.includes(k));
// section 35's bound for D3: the device's relMSE on an image within this relative distance of the f64 network's
const D3_REL = 1e-4;
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
} else if (measure) {
    const { kernels, results: RESULTS } = MEASURES[measure];
    refuseIfExists(RESULTS);
    const shipped = JSON.parse(fs.readFileSync(path.join(ENG, NET_FILE), "utf8")), net = decodeNet(shipped.net);
    const R11 = JSON.parse(fs.readFileSync(path.join(ENG, RESULTS_R11), "utf8")), { image, sppIn, sppRef } = R11.config;
    const git = (...a) => execFileSync("git", a, { cwd: ENG, encoding: "utf8", maxBuffer: 1 << 28 });
    const dir = arg("--cache");
    const cache = dir ? openCache(path.resolve(dir), { results: RESULTS, commit: git("rev-parse", "HEAD").trim(),
                                                      diff: hashArrays([git("diff", "HEAD", "--", "render", "brain", "physics", "tools")]) }) : null;
    GPU.configureVulkanIcd();
    const { mod } = GPU.resolveWebgpu(), gpu = mod.create([]);
    const t0 = Date.now(), rows = [];
    // a set whose last pass is k_head_apply (r15) stores no logit: its head is judged through the image
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
                const input = j ? out.acts[j - 1] : Float32Array.from(x), tw = conv2dCpu(input, image, image, L), fm = conv2dCpuFma(input, image, image, L);
                let plain = 0, fused = 0, unexplained = 0;
                for (let c = 0; c < tw.length; c++) { const v = out.acts[j][c]; if (v === tw[c]) plain++; else if (v === fm[c]) fused++; else unexplained++; }
                return { kernel: L.kernel, plain, fused, unexplained };
            });
            let applyWorst = 0, applyTwin, applyMirror;
            if (fusedLast) ({ worst: applyWorst, twin: applyTwin, mirror: applyMirror } = judgeHeadApply(x, out.acts[DL.length - 2], DL[DL.length - 1], out.y, image, image));
            else { const tw = kernelApplyCpu(x, out.acts[out.acts.length - 1], image, image);
                   for (let c = 0; c < tw.length; c++) applyWorst = Math.max(applyWorst, Math.abs(out.y[c] - tw[c]) / (Math.abs(tw[c]) + 1e-30)); }
            const filter = R11.tables[name].filter[i];
            rows.push({ set: name, family: SPLITS_R11[name].family, seed: SPLITS_R11[name].seeds[i], harvestSeed1: R11.tables[name].net[0][i], cpu: rel64, device: relDev, filter,
                        layers, applyWorst, ...(fusedLast ? { applyTwin, applyMirror } : {}), ms: out.ms });
        }
    }
    const D0 = rows.every((r) => Object.is(r.cpu, r.harvestSeed1));
    const D1 = rows.every((r) => r.layers.every((l) => l.unexplained === 0));
    const D2 = Math.max(...rows.map((r) => r.applyWorst));
    const D3 = Math.max(...rows.map((r) => Math.abs(r.device / r.cpu - 1)));
    const wins = (k, set) => rows.filter((r) => r.set === set && r[k] < r.filter).map((r) => r.seed);
    const sameWins = ["T1", "T2"].every((s) => wins("device", s).join() === wins("cpu", s).join());
    const out = {
        config: { net: NET_FILE, results: RESULTS_R11, kernels, image, sppIn, sppRef, APPLY_TOL, D3_REL, images: rows.length },
        criteria: {
            D0: { ok: D0, what: "the shipped network on the CPU (f64) gives the harvest's seed-1 relMSE on every test image, bit for bit" },
            D1: { ok: D1, what: "every conv cell on the device is the twin's or the fused mirror's, given the device's own input to that layer" +
                      (fusedSet ? " -- the hidden layers' cells: the head's are never stored, and are judged through the image (D2)" : ""),
                  fused: rows.reduce((a, r) => a + r.layers.reduce((b, l) => b + l.fused, 0), 0), cells: rows.reduce((a, r) => a + r.layers.reduce((b, l) => b + l.plain + l.fused + l.unexplained, 0), 0) },
            D2: { ok: D2 <= APPLY_TOL, worst: D2, what: fusedSet
                      ? "the head and kernel pass on the device within APPLY_TOL of kernelApplyCpu on the twin's logits or the fused mirror's, from the device's own input to the head"
                      : "the kernel on the device within APPLY_TOL of its twin" },
            D3: { ok: D3 <= D3_REL && sameWins, worst: D3, sameWins, winsDevice: { T1: wins("device", "T1").length, T2: wins("device", "T2").length },
                  winsCpu: { T1: wins("cpu", "T1").length, T2: wins("cpu", "T2").length },
                  what: "the device's relMSE within D3_REL of the f64 network's on every image, and it beats the primary filter on exactly the same images" },
        },
        rows, adapter: adapterName, seconds: (Date.now() - t0) / 1000, ...(cache ? { cache: { hits: cache.hits, misses: cache.misses } } : {}),
    };
    fs.writeFileSync(path.join(ENG, RESULTS), JSON.stringify(out, null, 1) + "\n");
    // the verdict is in the file, committed before it is read -- the log says only that it was written
    console.log(`[denoiseDevice] wrote ${RESULTS}`);
    GPU.exitCleanly(0);
} else {
    console.log("usage: node tools/denoiseDevice.mjs --export-r11 --cache <dir> --key <record> | --measure-r12 [--cache <dir>] | --measure-r13 [--cache <dir>] | --measure-r14 [--cache <dir>]" +
                " | --measure-r15 [--cache <dir>]   (see render/learned-denoiser-preregistration.md, sections 35, 39, 43 and 46)");
    process.exit(2);
}
