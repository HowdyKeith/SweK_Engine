#!/usr/bin/env node
// WebGLEngine/render/frameGenLive-selfcheck.mjs -- path-tracer.html's live frame generation (render/frameGenLive.mjs, backlog
// denoise-framegen-page): the orbit, the worker's job, the generator as the arc measured it, the pacer driving it, and the page's
// wiring.
//
// SABOTAGED, each restored byte-identical: F1 the holes left black -> 5 red; F2 the field indexed by the older frame, F3 the field
// from two frames back, F4 every frame's render seed 1, F5 the pacer's policy asap, F6 a pair's newer frame swapped for its older,
// F8 the page's worker the module itself, F9 the display gamma 2.4 -> 1 red each; F10 the fill dropped -> 2 red; F7 the orbit turned
// the other way -> *** 0 RED at first *** (every row read the one orbitEye), then 1 with the direction row added for it.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const imp = (p) => import(pathToFileURL(path.join(ENG, p)).href);
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const t0 = Date.now();
const L = await imp("render/frameGenLive.mjs"), { makeScene, isDatasetSeed } = await imp("render/denoiseScenes.mjs"), { HOLE_FILL, motionField } = await imp("render/denoiseFrameGen.mjs");
const { interpolateFrameCPU, crossFadeCPU } = await imp("render/frameInterp.mjs"), { render } = await imp("physics/render/pathTracer.mjs");
const { scheduleCPU, makeFramePacer } = await imp("render/framePacer.mjs");

console.log("1. THE ORBIT AND THE WORKER'S JOB");
{
    const S = makeScene(L.LIVE.family, L.LIVE.seed), e0 = L.orbitEye(S, 0), e9 = L.orbitEye(S, 90), r = (e) => Math.hypot(e[0] - S.look[0], e[2] - S.look[2]);
    ok("  the orbit turns the scene's own eye round the look point: degree 0 is the eye, the radius and height kept at every angle",
        e0.every((v, i) => Math.abs(v - S.eye[i]) < 1e-12) && Math.abs(r(e9) - r(S.eye)) < 1e-12 && e9[1] === S.eye[1] &&
        Math.abs((e9[0] - S.look[0]) * (S.eye[0] - S.look[0]) + (e9[2] - S.look[2]) * (S.eye[2] - S.look[2])) < 1e-9);
    // sabotage F7 (the orbit turned the other way) went 0 red before this row: every row read the one orbitEye, so either way agreed
    const dx = S.eye[0] - S.look[0], dz = S.eye[2] - S.look[2];
    ok("  ...and a positive angle turns it from +x toward +z: 90 degrees takes (dx, dz) from the look point to (-dz, dx)",
        Math.abs(e9[0] - (S.look[0] - dz)) < 1e-12 && Math.abs(e9[2] - (S.look[2] + dx)) < 1e-12);
    ok("  the live scene is not a dataset scene, and the defaults are 128 x 128 at 2 samples, 3 degrees a frame, round 66's fill and cross-faded holes",
        !isDatasetSeed(L.LIVE.seed) && L.LIVE.w === 128 && L.LIVE.spp === 2 && L.LIVE.stepDeg === 3 && L.LIVE.fill === HOLE_FILL && L.LIVE.holes === "crossfade");
    const o = { w: 32, h: 32, spp: 1 }, j0 = L.traceJob({ ...o, k: 0 }), j2 = L.traceJob({ ...o, k: 2 }), eye2 = L.orbitEye(S, 6), eye1 = L.orbitEye(S, 3);
    const img = render(S.scene, { w: 32, h: 32, spp: 1, seed: 3, rgb: true, eye: eye2, look: S.look, up: S.up, fovDeg: S.fovDeg, sky: S.sky }), m = motionField(S, eye1, eye2, 32, 32);
    const same = (a, b) => a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
    ok("!! a job is real frame k traced at its eye (render seed k + 1) as rgba, with the scene's own motion field from frame k - 1's eye -- none for frame 0",
        j0.flow === null && j0.depth === null && j2.k === 2 && same(j2.flow, m.flow) && same(j2.depth, m.depth) && j2.eye.every((v, i) => v === eye2[i]) &&
        Array.from({ length: 32 * 32 * 3 }, (_, i) => Math.fround(img[i])).every((v, i) => v === j2.frame[Math.floor(i / 3) * 4 + (i % 3)]) && j2.frame[3] === 1);
    let bad = null; try { L.traceJob({ ...o, k: -1 }); } catch (e) { bad = e.message; }
    ok("  ...and a frame index that is not a whole number is refused", /whole number/.test(bad || ""));
}

console.log("\n2. THE GENERATOR, AS THE ARC MEASURED IT");
const W = 64, SPP = 2, a = L.traceJob({ w: W, h: W, spp: SPP, k: 4 }), b = L.traceJob({ w: W, h: W, spp: SPP, k: 5 });
{
    const g = L.generateBetween(a, b), direct = interpolateFrameCPU({ prev: a.frame, cur: b.frame, w: W, h: W, flow: b.flow, bw: W, bh: W, block: 1, depthBlock: b.depth, indexedBy: "cur", t: 0.5, fill: HOLE_FILL, holes: "crossfade" });
    ok("!! the half-way frame is interpolateFrameCPU's, bit for bit: indexed by the newer frame, the scene's own field, round 66's fill, holes cross-faded",
        g.frame.every((v, i) => Object.is(v, direct.frame[i])) && g.holes === direct.holes);
    const z = L.generateBetween(a, b, { holes: "zero" }), x = crossFadeCPU({ prev: a.frame, cur: b.frame, w: W, h: W, t: 0.5 });
    let holeOk = true, nh = 0; for (let p = 0; p < W * W; p++) if (z.hole[p]) { nh++; for (let c = 0; c < 3; c++) holeOk &&= z.frame[p * 4 + c] === 0 && Math.abs(g.frame[p * 4 + c] - x[p * 4 + c]) < 1e-6; }
    ok("  ...and where it leaves a hole, the live view shows the cross-fade, not the black the generator's default leaves", holeOk, `${nh} holes of ${W * W}`);
    ok("  t = 0 and t = 1 give the older and the newer frame exactly", L.generateBetween(a, b, { t: 0 }).frame.every((v, i) => v === a.frame[i]) && L.generateBetween(a, b, { t: 1 }).frame.every((v, i) => v === b.frame[i]));
    let bad = null; try { L.generateBetween(a, L.traceJob({ w: W, h: W, spp: 1, k: 7 })); } catch (e) { bad = e.message; }
    ok("  a pair that is not two consecutive frames is refused, and frame 0 (no field) cannot be the newer", /consecutive/.test(bad || "") && (() => { try { L.generateBetween(b, L.traceJob({ w: W, h: W, spp: 1, k: 0 })); } catch (e) { return /motion field/.test(e.message); } return false; })());
    // the view's own claim, measured: against the frame traced AT the half-way eye (64 samples), the generated frame is nearer than
    // showing the older frame again -- what the page shows without generation -- and nearer than the cross-fade
    const S = makeScene(L.LIVE.family, L.LIVE.seed), mid = L.orbitEye(S, 4.5 * L.LIVE.stepDeg);
    const truth = render(S.scene, { w: W, h: W, spp: 64, seed: 99, rgb: true, eye: mid, look: S.look, up: S.up, fovDeg: S.fovDeg, sky: S.sky });
    const disp = (v) => Math.pow(Math.min(1, Math.max(0, v)), 1 / 2.2), err = (f) => { let s = 0; for (let p = 0; p < W * W; p++) for (let c = 0; c < 3; c++) s += (disp(f[p * 4 + c]) - disp(truth[p * 3 + c])) ** 2; return s / (W * W * 3); };
    const eG = err(g.frame), eR = err(a.frame), eX = err(x);
    ok("!! against the frame traced at the half-way eye, the generated frame is nearer than the older frame held (no generation) and than the cross-fade, in the page's display space",
        eG < eR && eG < eX, `generated ${eG.toExponential(3)}, held ${eR.toExponential(3)}, cross-fade ${eX.toExponential(3)}`);
}

console.log("\n3. THE PACER DRIVING IT");
{
    const refresh = 1000 / 60, durations = [50, 50, 50, 50, 50, 50], jobs = [0, 1, 2, 3, 4, 5].map((k) => L.traceJob({ w: 16, h: 16, spp: 1, k }));
    const run = (generate) => { const v = L.makeLiveFrameGen({ refresh, generate }), shown = []; let start = 0, k = 0, nextReady = durations[0];
        const end = durations.reduce((q, d) => q + d, 0) + 8 * refresh;
        for (let n = 0; n * refresh <= end; n++) { const time = n * refresh;
            while (k < durations.length && nextReady <= time + 1e-6) { v.real(jobs[k], start, nextReady); start = nextReady; k++; nextReady = start + (durations[k] ?? 0); }
            shown.push(v.at(time)); }
        return { v, shown }; };
    const G = run(true), N = run(false), ref = scheduleCPU({ durations, refresh, policy: "midpoint", tail: 8 }).shown;
    const kinds = (xs) => xs.map((s) => `${s.kind}${s.k}`).join(" ");
    ok("!! the live view shows what the pacer's own schedule shows, refresh for refresh: midpoint policy, real frames back to back",
        G.shown.slice(0, ref.length).every((s, i) => s.kind === ref[i].kind && s.k === ref[i].k), kinds(G.shown.slice(0, 24)));
    const gens = G.shown.filter((s) => s.kind === "gen"), reals = new Set(G.shown.filter((s) => s.kind === "real").map((s) => s.k));
    ok("!! with generation every pair's half-way frame goes up once, before its newer frame, at t = 0.5 -- twice the new images a second of the real frames alone",
        gens.length === 5 && gens.every((s) => s.t === 0.5 && s.frame.length === 16 * 16 * 4) && G.v.generated === 5 && reals.size === 6 &&
        N.shown.filter((s) => s.kind === "gen").length === 0 && new Set(N.shown.filter((s) => s.kind === "real").map((s) => s.k)).size === 6 &&
        gens.every((s) => G.shown.findIndex((q) => q.kind === "gen" && q.k === s.k) < G.shown.findIndex((q) => q.kind === "real" && q.k === s.k)),
        `${gens.length + reals.size} new images against ${reals.size}`);
    const gen3 = gens.find((s) => s.k === 3);
    ok("  ...and each is generated between ITS pair, bit for bit", gen3.frame.every((v, i) => Object.is(v, L.generateBetween(jobs[2], jobs[3]).frame[i])));
    let bad = null; try { const v = L.makeLiveFrameGen({ refresh }); v.real(jobs[1], 0, 1); } catch (e) { bad = e.message; }
    ok("  real frames out of order are refused", /arrive in order/.test(bad || ""));
    const by = L.toBytes(Float32Array.of(0.18, 1, 4, 1), 1, 1);
    ok("  the display bytes are the page's own paint: gamma 2.2, clipped", by[0] === Math.round(255 * Math.pow(0.18, 1 / 2.2)) && by[1] === 255 && by[2] === 255 && by[3] === 255);
}

console.log("\n4. THE PAGE");
{
    const html = fs.readFileSync(path.join(ENG, "path-tracer.html"), "utf8"), wk = fs.readFileSync(path.join(ENG, "render/frameGenLive-worker.mjs"), "utf8");
    ok("!! path-tracer.html has the live view: frameGenLive's makeLiveFrameGen and toBytes, the worker, the browser's clock through makeLivePacing, on requestAnimationFrame",
        /import \{[^}]*makeLiveFrameGen[^}]*\} from "\/render\/frameGenLive\.mjs"/.test(html) && /new Worker\("\/render\/frameGenLive-worker\.mjs", \{ type: "module" \}\)/.test(html) &&
        /makeLivePacing/.test(html) && /refreshFromStamps|\.refresh\(\)/.test(html) && /requestAnimationFrame\(fgTick\)/.test(html) && /toBytes\(/.test(html) && /id="fgcv"/.test(html));
    ok("  ...a switch for the generation (off: the real frames alone), and a line that reports new images a second against real frames a second",
        /id="fggen"/.test(html) && /generate: \$\("fggen"\)\.checked/.test(html) && /new images/.test(html) && /real frames/.test(html));
    ok("  the worker runs traceJob and transfers its buffers", /import \{ traceJob \} from "\.\/frameGenLive\.mjs"/.test(wk) && /self\.postMessage\(\{ \.\.\.job, ms \}, \[job\.frame\.buffer/.test(wk));
}

console.log(`\n${fails ? "FAIL -- " + fails + " check(s)" : "ALL GREEN"} (${Date.now() - t0} ms)`);
process.exit(fails ? 1 : 0);
