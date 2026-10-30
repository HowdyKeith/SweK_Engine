#!/usr/bin/env node
// WebGLEngine/render/temporalLive-selfcheck.mjs -- path-tracer.html's temporal view (render/temporalLive.mjs, backlog
// fsr4-temporal-page, section 163): the live chain held to round 70's own example, the orbit and the sliding window, the
// worker's state machine, and the page's wiring.
//
// SABOTAGED, each restored byte-identical: L1 a window of 7 -> 1 red; L2 every frame's jitter phase 0, L3 the guides from the oldest
// eye, L4 the newest frame's EASU left jittered -> 2 red each; L5 the page's U_T image without the light composite -> 1 red.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const imp = (p) => import(pathToFileURL(path.join(ENG, p)).href);
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const t0 = Date.now();
const L = await imp("render/temporalLive.mjs"), T = await imp("render/learnedUpscaleTemporal.mjs"), D = await imp("render/denoiseScenes.mjs");
const { decodeNet } = await imp("render/denoiseDevice.mjs"), { cameraPath, FRAMES } = await imp("render/denoiseTemporal.mjs"), TU = await imp("render/denoiseTemporalUpscale.mjs");
const { orbitEye } = await imp("render/frameGenLive.mjs");
const net = decodeNet(JSON.parse(fs.readFileSync(path.join(ENG, "render", "denoise-net-r11.json"), "utf8")).net);
const tr = JSON.parse(fs.readFileSync(path.join(ENG, "render", "upscale-net-r70.json"), "utf8")), Ut = decodeNet(tr.runs.find((r) => r.seed === tr.candidate).net);
const same = (a, b) => a.length === b.length && a.every((v, i) => Object.is(v, b[i]));

console.log("1. THE LIVE CHAIN IS ROUND 70's");
{
    const W = 32, S = D.makeScene("R", 990950), P = cameraPath(S), rs = TU.temporalUpscaleSeeds(990950);
    const frames = P.eyes.map((eye, f) => L.liveFrame(S, net, { eye, jitter: TU.JITTER[f], seed: rs.half[f], W, sppIn: 2 }));
    const ex = L.liveExample(S, frames, W), ref = T.temporalExample("R", 990950, net, { W, sppIn: 2, sppRef: 4 });
    ok("!! liveExample over round 70's own eight frames (its path, jitter and seeds) is temporalExample, bit for bit: U_T's 17 channels, Bt, B1, the light sources",
        same(ex.x, ref.x) && same(ex.bt, ref.bt) && same(ex.b1, ref.b1) && same(ex.cov, ref.cov) && same(ex.E, ref.E) && ex.W === W);
    ok("  ...so U_T on the page's example is temporalChain on round 70's -- the network the test graded", same(T.temporalChain(Ut, ex), T.temporalChain(Ut, ref)));
    let bad = null; try { L.liveExample(S, frames.slice(1), W); } catch (e) { bad = e.message; }
    ok("  an example from fewer than eight frames is refused", /an example is 8 frames/.test(bad || ""));
}

console.log("\n2. THE ORBIT AND THE WINDOW");
{
    const S = D.makeScene(L.LIVE_T.family, L.LIVE_T.seed), a = L.liveFrameSpec(S, 0), b = L.liveFrameSpec(S, 11);
    ok("  the defaults: 128 x 128 traced at 64 x 64, 4 samples, 2.5 degrees a frame (inside round 32's 1.5-4), a non-dataset scene, the shipped denoiser and round 70's file",
        L.LIVE_T.W === 128 && L.LIVE_T.sppIn === 4 && L.LIVE_T.stepDeg === 2.5 && !D.isDatasetSeed(L.LIVE_T.seed) && L.LIVE_T.net === "render/denoise-net-r11.json" && L.LIVE_T.ut === "render/upscale-net-r70.json");
    ok("  frame k: its eye k steps round the orbit, round 32's jitter k mod 8, its own render seed",
        a.eye.every((v, i) => v === S.eye[i]) && b.eye.every((v, i) => v === orbitEye(S, 11 * 2.5)[i]) && b.jitter === TU.JITTER[3] && b.seed === L.LIVE_T.seedBase + 11 && a.seed !== b.seed);
    const st = L.makeLiveState({ W: 16, sppIn: 1, net, ut: Ut }), out = [];
    for (let k = 0; k < 10; k++) out.push(L.liveStep(st, k, { cpuUT: k === 9 }));
    ok("!! the window: no example until eight frames, then one a frame from the last eight -- frame 9's from frames 2-9, their jitters the eight phases",
        out.slice(0, 7).every((r, i) => !r.ready && r.have === i + 1) && out[7].ready && out[9].ready && st.frames.length === 8 &&
        st.frames.every((f, i) => f.eye.every((v, j) => v === orbitEye(st.S, (i + 2) * 2.5)[j])) && new Set(st.frames.map((f) => f.shift.join())).size === 8);
    const re = L.liveExample(st.S, st.frames, 16);
    ok("  ...frame 9's example is liveExample over those frames, and with cpuUT its U_T is temporalChain on it; without, none",
        same(out[9].ex.x, re.x) && same(out[9].ut, T.temporalChain(Ut, re)) && out[8].ut === null && Number.isFinite(out[9].ms.ut));
    let bad = null; try { L.liveStep(st, 12); } catch (e) { bad = e.message; }
    ok("  frames out of order are refused", /come in order -- expected 10, got 12/.test(bad || ""));
}

console.log("\n3. THE PAGE");
{
    const html = fs.readFileSync(path.join(ENG, "path-tracer.html"), "utf8"), wk = fs.readFileSync(path.join(ENG, "render/temporalLive-worker.mjs"), "utf8");
    ok("!! path-tracer.html has the temporal view: the worker, U_T on WebGPU through createDeviceTemporal, its image composited with the light sources, the three canvases",
        /new Worker\("\/render\/temporalLive-worker\.mjs", \{ type: "module" \}\)/.test(html) && /import \{ createDeviceTemporal \} from "\/render\/learnedUpscaleTemporalGPU\.mjs"/.test(html) &&
        /run\.gpu = await createDeviceTemporal\(dev, decodeNet\(m\.ut\), \{ H: m\.W, W: m\.W \}\)/.test(html) && /compositeEmitters\(Float64Array\.from\(o\.y\), \{ cov: m\.cov, E: m\.E \}\)/.test(html) &&
        ["tlb1", "tlbt", "tlut"].every((id) => html.includes(`id="${id}"`)));
    ok("  ...the CPU fallback when the page has no WebGPU or the box is ticked, and a line naming where U_T ran and its ms",
        /cpuUT: run\.cpu \|\| !navigator\.gpu/.test(html) && /U_T on \$\{run\.where\}/.test(html) && /U_T in \$\{utMs\.toFixed\(1\)\} ms on/.test(html) && html.includes('id="tlcpu"'));
    ok("  the worker: round 70's candidate from its committed file, the shipped denoiser, liveStep for each frame, its buffers transferred",
        /tr\.runs\.find\(\(r\) => r\.seed === tr\.candidate\)\.net/.test(wk) && /get\(LIVE_T\.net\)/.test(wk) && /get\(LIVE_T\.ut\)/.test(wk) && /liveStep\(state, m\.k, \{ cpuUT \}\)/.test(wk) && /self\.postMessage\(out, xfer\)/.test(wk));
}

console.log(`\n${fails ? "FAIL -- " + fails + " check(s)" : "ALL GREEN"} (${Date.now() - t0} ms)` +
    "\nnot closed here: what U_T costs on a real GPU. That is round 71's (section 163).");
process.exit(fails ? 1 : 0);
