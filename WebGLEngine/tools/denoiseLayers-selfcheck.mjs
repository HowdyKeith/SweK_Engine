// WebGLEngine/tools/denoiseLayers-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/denoiseLayers-selfcheck.mjs      (a few minutes on SwiftShader: one whole measurement at 16 x 16, in a child process)
//
// THE DENOISER'S SLOWEST LAYERS AND THE SET AIMED AT THEM, HELD. tools/denoiseLayers.mjs times every layer under every kernel set and builds a MIXED set
// (render/denoiseDevice.mjs's deviceLayers with one set a layer). Three things hold it:
//
//   1  THE ARITHMETIC   a set's passes become one cost a layer (the last layer carries the passes after it); per layer the fastest set; the aimed set keeps the fastest whole
//                       set's kernel unless a DIFFERENT kernel is at least 5% faster; the slowest layers, largest first; no timed set is refused
//   2  THE MIXED SET    one set a layer, each layer on ITS set's kernel and the apply following the last layer's; a mixed set of one name is that set; the wrong number of
//                       names is refused; on the device (node-webgpu) a mixed set's image is the f64 network's within 1e-5 and the same as each whole set's on its layers
//   3  THE COMMAND      a whole run at 16 x 16 writes a report with every field, says a software adapter is one, and refuses an unknown option, a bad size and an
//                       existing report
//
// Device runs are child processes and a SwiftShader abort is retried (tools/ship/splatSortGPU-selfcheck.mjs's header says why); a wrong answer or a hang fails at once.
// SABOTAGE LOG: see the bottom of this file.
"use strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import * as L from "./denoiseLayers.mjs";
import * as DD from "../render/denoiseDevice.mjs";
import { makeDenoiser, denoise } from "../render/denoiseNet.mjs";
import { resolveWebgpu, configureVulkanIcd, headlessGpuSkipReason } from "./ship/headlessGpu.mjs";

const require = createRequire(import.meta.url), SELF = fileURLToPath(import.meta.url), CMD = fileURLToPath(new URL("./denoiseLayers.mjs", import.meta.url)), ENG = path.resolve(path.dirname(SELF), "..");
const ATTEMPTS = 5, NATIVE_ABORT = /futex|Fatal glibc|pthread|std::system_error|Invalid argument|Segmentation|Aborted/;
let fails = 0;
function ok(name, cond, detail) { console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? "   " + detail : ""}`); if (!cond) fails++; }
const section = async (fn) => { try { await fn(); } catch (e) { ok(`!! the section THREW instead of answering: ${e.message}`, false, String(e.stack).split("\n")[1]); } };

async function child() {
    configureVulkanIcd(); const { mod } = resolveWebgpu(require), gpu = mod.create([]), a = await gpu.requestAdapter(), dev = await DD.timingDevice(a, 1 << 22);
    const net = makeDenoiser(3, "he", "kernel", 10, "large"), H = 12, W = 14, x = DD.timingInput(H, W, 10, 3), y64 = denoise(net, x, H, W).y, out = {};
    const n = net.layers.length, sets = { mixed: ["r12", ...Array(n - 2).fill("r27w"), "r15"], r12: "r12", r27w: "r27w", r15: "r15" };
    for (const [k, s] of Object.entries(sets)) { const D = await DD.createDeviceDenoiser(dev, net, { H, W, C: 10, kernels: s }); out[k] = Array.from((await D.run(x)).y); D.destroy(); }
    let worst = 0; for (let i = 0; i < y64.length; i++) worst = Math.max(worst, Math.abs(out.mixed[i] - y64[i]) / (Math.abs(y64[i]) + 1e-6));
    dev.destroy();
    console.log("RESULT " + JSON.stringify({ worst, finite: out.mixed.every(Number.isFinite), kernels: DD.deviceLayers(net, sets.mixed).map((l) => l.kernel) })); process.exit(0);
}
if (process.argv[2] === "--child") await child();

const aborts = [];
function spawnRetry(args, timeout) {
    for (let k = 0; k < ATTEMPTS; k++) {
        const r = spawnSync(process.execPath, args, { encoding: "utf8", timeout, cwd: ENG });
        if (r.error && r.error.code === "ETIMEDOUT") return { ...r, hung: true };
        if (r.status !== null && r.status <= 2 && !(r.status !== 0 && NATIVE_ABORT.test(r.stderr || ""))) return r;
        aborts.push(String(r.stderr || r.signal).split("\n").find((l) => NATIVE_ABORT.test(l)) || `exit ${r.status} ${r.signal}`);
    }
    return null;
}

console.log("denoiseLayers-selfcheck -- the denoiser's slowest layers, and a set aimed at them\n");

console.log("1. THE ARITHMETIC");
await section(() => {
    const pp = (...ms) => ms.map((v, i) => ({ name: `p${i}`, ms: v }));
    ok("!! a set's passes become one cost a layer: the hidden layers their own pass, the LAST layer every pass from it on (a plain last layer and its apply; a fused one alone); too few passes is no answer", JSON.stringify(L.stagesOf(pp(1, 2, 3, 0.5), 3)) === JSON.stringify([1, 2, 3.5]) && JSON.stringify(L.stagesOf(pp(1, 2, 3), 3)) === JSON.stringify([1, 2, 3]) && L.stagesOf(pp(1, 2), 3) === null);
    const st = { a: [10, 20, 30], b: [12, 9, 45], c: [11, 25, 25] }, k = { a: ["x", "y", "h"], b: ["x2", "y2", "h"], c: ["x3", "y3", "h2"] }, A = L.aim(st, 3, k);
    ok("!! per layer the fastest set; the fastest WHOLE set (a, 60 ms); the aimed set keeps a's kernel unless ANOTHER kernel is at least 5% faster: [a, b, c] here, predicted 10 + 9 + 25 ms", A.best === "a" && A.bestMs === 60 && A.mixed.join() === "a,b,c" && A.predictedMs === 44 && Math.abs(A.predictedGain - 60 / 44) < 1e-12 && A.perLayer[1].fastest === "b" && A.perLayer[2].kernel === "h2");
    const close = L.aim({ a: [10, 10], b: [9.6, 11] }, 2, { a: ["x", "h"], b: ["y", "h"] }), same = L.aim({ a: [10, 10, 10], b: [9, 5, 30] }, 3, { a: ["x", "h", "z"], b: ["y", "h", "w"] });
    ok("!! A NEAR-EQUAL KERNEL DOES NOT MAKE A MIXED SET: 4% faster is not taken; the SAME kernel under another set's name is never taken, however much faster it read (that is noise); 10% faster on a different kernel is", close.best === "a" && close.mixed.join() === "a,a" && close.uniform && same.best === "a" && same.mixed.join() === "b,a,a" && !same.uniform && L.MARGIN === 0.05);
    ok("!! the slowest layers are the fastest whole set's, largest first, each with its share", A.slowest.map((s) => s.layer).join() === "2,1,0" && Math.abs(A.slowest[0].share - 0.5) < 1e-12);
    ok("!! THE IMAGE'S BOUND IS THE TREE'S FOR THE SETS USED: 1e-3 for f32 sets, r57p's f16 storage 7.5e-3 (it truncates on both rig GPUs), r41h's half-precision kernels 1e-2; a mixed set takes its loosest", L.imageTolFor("r18t") === 1e-3 && L.imageTolFor(["r18t", "r57p", "r15"]) === DD.F16S_IMAGE_TOL_RTZ && DD.F16S_IMAGE_TOL_RTZ === 7.5e-3 && L.imageTolFor(["r57p", "r41h"]) === DD.F16_IMAGE_TOL && DD.F16_IMAGE_TOL === 1e-2);
    let threw = false; try { L.aim({ a: null }, 2); } catch (e) { threw = /no set was timed/.test(e.message); }
    ok("!! with no set timed on the device's clock it refuses, rather than aiming at nothing", threw);
});

console.log("2. THE MIXED SET");
await section(() => {
    const net = makeDenoiser(3, "he", "kernel", 10, "large"), n = net.layers.length, mix = (a, mid, z) => [a, ...Array(n - 2).fill(mid), z], k = (s) => DD.deviceLayers(net, s).map((l) => l.kernel).join();
    ok("!! one set a layer: each layer on ITS set's kernel (r12's tiled, r27w's Winograd, r15's fused head) -- and a mixed set of one name everywhere is that set", k(mix("r12", "r27w", "r15")) === net.layers.map((L, i) => DD.kernelFor(L, i === 0 ? "r12" : i === n - 1 ? "r15" : "r27w", i === n - 1)).join() && k(mix("r15", "r15", "r15")) === k("r15") && k(mix("r12", "r12", "r12")) === k("r12") && n >= 3);
    ok("!! the kernel apply follows the LAST layer's kernel: a fused head on the last layer has no apply pass, a plain one has", DD.applyFor(DD.deviceLayers(net, mix("r12", "r12", "r15"))) === "head_apply" && DD.applyFor(DD.deviceLayers(net, mix("r15", "r15", "r12"))) === "apply");
    let nm = false, ns = false; try { DD.deviceLayers(net, ["r12", "r15"]); } catch (e) { nm = /one a layer/.test(e.message); } try { DD.deviceLayers(net, mix("r12", "r99", "r15")); } catch (e) { ns = /no kernel set "r99"/.test(e.message); }
    ok("!! the wrong number of names is refused, and so is a set that does not exist", nm && ns);
    const skip = headlessGpuSkipReason(require);
    if (skip) { console.log(`  ----  device row skipped: ${skip}`); return; }
    const r = spawnRetry([SELF, "--child"], 300000), res = r && !r.hung && /RESULT (.*)/.exec(r.stdout) ? JSON.parse(/RESULT (.*)/.exec(r.stdout)[1]) : null;
    ok("!! ON THE DEVICE a mixed set [r12, r27w..., r15] builds and its image is the f64 network's within 1e-5 (node-webgpu)", res && res.finite && res.worst < 1e-5 && res.kernels[0] === "tiled" && res.kernels.at(-1) === "head_apply" && res.kernels.slice(1, -1).every((x) => x === "wino"), res ? JSON.stringify(res) : r && r.hung ? "HUNG" : "aborted every time");
});

console.log("3. THE COMMAND");
await section(() => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "denoiselayers-")), out = path.join(tmp, "r.json"), run = (...x) => spawnSync(process.execPath, [CMD, ...x], { encoding: "utf8", timeout: 120000, cwd: ENG });
    const bad = run("--speed", "1"), size = run("--size", "8", "--out", path.join(tmp, "s.json")), aimBad = run("--size", "16", "--aim", "r12,r15", "--out", path.join(tmp, "a.json"));
    ok("!! it refuses an unknown option, a size outside 16-2048 and an --aim set of the wrong length, before any device", aimBad.status === 2 && /one a layer/.test(aimBad.stderr) && !fs.existsSync(path.join(tmp, "a.json")) && bad.status === 2 && /unknown option --speed/.test(bad.stderr) && size.status === 2 && /--size is a whole number/.test(size.stderr) && !fs.existsSync(path.join(tmp, "s.json")));
    if (headlessGpuSkipReason(require)) { console.log("  ----  the whole run skipped: no device here"); fs.rmSync(tmp, { recursive: true, force: true }); return; }
    const r = spawnRetry([CMD, "--size", "16", "--rounds", "1", "--out", out, "--aim", "r12,r15,r15,r15,r15"], 900000), rep = fs.existsSync(out) ? JSON.parse(fs.readFileSync(out, "utf8")) : null;
    ok("!! A WHOLE RUN at 16 x 16 (its head to head on an ASKED-FOR set, --aim r12,r15,r15,r15,r15, so it differs from any whole set) writes its report: the adapter and whether it is software, every set timed, a cost a layer for each, the aimed set, the head to head (the AIMED set's own kernels built, layer by layer), the image within 1e-3 of the f64 network -- and the console says a software adapter is one", r && !r.hung && r.status === 0 && rep && rep.sets.length >= 3 && rep.network.layers.length === 5 && rep.aim.perLayer.length === 5 && rep.aim.mixed.join() === "r12,r15,r15,r15,r15" && rep.aim.forced === true && rep.image.built[0] === "tiled" && rep.image.built[1] === "fast" && /ASKED-FOR \(--aim\)/.test(r.stdout) && rep.headToHead.mixed && rep.headToHead.best && rep.image.finite && rep.image.within === true && rep.image.tol === 1e-3 && rep.image.worstVsF64 < 1e-3 && rep.image.built.join() === rep.image.wanted.join() && rep.image.built.join() === rep.aim.perLayer.map((l) => l.kernel).join() && typeof rep.software === "boolean" && (!rep.software || /IS A SOFTWARE ADAPTER/.test(r.stdout)) && /THE ASKED-FOR \(--aim\) SET/.test(r.stdout),
        rep ? `${rep.adapter.name}: best ${rep.aim.best}, aimed [${rep.aim.mixed.join(", ")}], head to head ${rep.headToHead.gain && rep.headToHead.gain.toFixed(3)} x` : r && r.hung ? "HUNG" : r ? (r.stderr || r.stdout).slice(-300) : "aborted every time");
    const again = rep ? run("--size", "16", "--out", out) : null;
    ok("!! ...and a report already there is never overwritten", again && again.status === 1 && /never overwritten/.test(again.stderr));
    fs.rmSync(tmp, { recursive: true, force: true });
});
if (aborts.length) console.log(`  ----  the software renderer ABORTED ${aborts.length} time(s) and those runs were repeated: ${aborts.slice(0, 3).join(" | ")}`);

// v4933 -- THE EXPORT LIST, named here so tools/ship/definitionGates-selfcheck.mjs sees each export of denoiseLayers.mjs held by its gate (it found these 3 unnamed at the ship):
{
    const EXPORTS = await import("./denoiseLayers.mjs");
    const NAMED = ["F32_IMAGE_TOL", "measure", "reportLines"];
    ok(`the export list: ${NAMED.join(", ")} -- each exported and defined`, NAMED.every((n) => n in EXPORTS && EXPORTS[n] !== undefined), NAMED.filter((n) => !(n in EXPORTS) || EXPORTS[n] === undefined).join(", ") || "");
}
console.log(`\n${fails === 0 ? "ALL PASS" : fails + " FAILED"}`);
process.exit(fails === 0 ? 0 : 1);

// SABOTAGE LOG: 14 mutants, each in a hard-linked copy of the tree. 11 of tools/denoiseLayers.mjs: 10 RED (the last layer's apply not added to it, no margin, the same
// kernel under another name taken, the SLOWEST whole set taken as the best, the slowest layers ascending, no set timed not refused, a report overwritten, the size
// unchecked, an unknown option let through, the aimed set not built -- this last GREEN at first, because on SwiftShader the aimed set IS the fastest whole set, so
// building either gave one picture and one time; the run now asks for a set (--aim r12,r15,...) that differs and checks the kernels built, layer by layer). ONE GREEN AND
// EQUIVALENT: the console's software warning removed -- the report's first line says the same and the check reads either. 3 of render/denoiseDevice.mjs's mixed set: ALL 3
// RED (every layer on the first set's kernel, the wrong number of names let through, the last-layer rule lost for a mixed set).
