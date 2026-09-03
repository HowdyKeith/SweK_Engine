// physics/backend-qa-check.mjs -- a browserless visual-regression GATE for physics backends. It runs the trajectory
// + visual divergence harnesses and asserts: (1) each backend is internally deterministic (same scene twice ->
// identical trajectory AND identical render), and (2) each backend PAIR's drift + pixel-diff stays inside a
// configured ENVELOPE. Too little divergence between two different engines means one is frozen/broken; too much
// means a regression. Runs on every ship (no Playwright), and pairs with the box3d-vs-jolt.html render-qa page for
// the on-rig screenshot version. box3d skips cleanly when its WASM is absent.
//
// WHAT THIS GATE CANNOT DO, stated plainly because it was cited as proof of something it cannot prove (v2477):
// the pair envelope is RECORDED FROM THE CODE UNDER TEST. That makes it a fine regression detector -- it will tell
// you when a backend change moves the divergence -- and a useless correctness detector. It cannot distinguish
// "two different engines differ in the last bit, as they must" from "one engine has no drag at all", because it
// records whatever it sees and calls that normal. It did exactly that: box3d shipped with zero linear damping
// against Jolt's 0.05/s, and this gate recorded the resulting drift as the expected envelope for ~200 versions.
// A BASELINE TAKEN FROM THE CODE UNDER TEST DETECTS CHANGE, NEVER WRONGNESS. That is the same trap physicsSuite
// fell into in v2455 by importing its expected values from the module it was testing.
// For correctness, each backend is held against MATHEMATICS in tools/ship/rigidSuite.mjs (the exact damped
// trajectory, the measured damping constant, bit-identical determinism) and on the rig in backend-physics-check.html.
"use strict";

import { runTrajectory, compare } from "./backendDivergence.mjs";
import { renderFrames, compareVisual } from "./backendVisualDiff.mjs";
import { ssim, edgeOverlap, pHash, hamming } from "../render/perceptual.mjs";
import { iou, scaleDelta } from "../render/silhouette.mjs";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import {fileURLToPath, pathToFileURL} from "node:url";
import path from "node:path";

// ---- baseline: record the OBSERVED drift/visual metrics with a tolerance envelope, then gate future runs against
// them. A backend change that shifts the box3d-vs-Jolt divergence outside the recorded envelope fails the gate.
function captureMetrics(backends, opts = {}) {
    const ticks = opts.ticks || 180;
    const determinism = {}, pairs = {};
    for (const b of backends) {
        const t = compare(runTrajectory(b.make, ticks), runTrajectory(b.make, ticks));
        const v = compareVisual(renderFrames(b.make, ticks, 30), renderFrames(b.make, ticks, 30));
        determinism[b.name] = { trajectory: t.identical, render: v.identical, renderDiff: v.worst };
    }
    for (let i = 0; i < backends.length; i++) for (let j = i + 1; j < backends.length; j++) {
        const A = backends[i], B = backends[j];
        const tj = compare(runTrajectory(A.make, ticks), runTrajectory(B.make, ticks));
        const fa = renderFrames(A.make, ticks, 30), fb = renderFrames(B.make, ticks, 30);
        const vv = compareVisual(fa, fb);
        // v3337 -- THE PERCEPTUAL FLOOR IS CAPTURED IN THE SAME PASS. A --update run on a rig that recorded only
        // drift and pixel-diff would leave the perceptual thresholds unmeasured for another whole round, and the
        // frames are already in hand here. Worst case over the sampled frames, which is what a floor means.
        let wIoU = 1, wScale = 0, wSsim = 1, wEdge = 1, wPh = 0;
        for (let f = 0; f < Math.min(fa.length, fb.length); f++) {
            wIoU = Math.min(wIoU, iou(fa[f], fb[f]).iou);
            wScale = Math.max(wScale, scaleDelta(fa[f], fb[f]));
            wSsim = Math.min(wSsim, ssim(fa[f], fb[f]));
            wEdge = Math.min(wEdge, edgeOverlap(fa[f], fb[f]));
            wPh = Math.max(wPh, hamming(pHash(fa[f]), pHash(fb[f])));
        }
        pairs[A.name + "|" + B.name] = { maxDrift: tj.maxDrift, visual: vv.worst,
            perceptual: { iou: wIoU, scaleDelta: wScale, ssim: wSsim, edgeOverlap: wEdge, phashBits: wPh } };
    }
    return { ticks, determinism, pairs };
}
// build envelopes around measured values (looser at the top; the bottom guards against "suspiciously identical")
function toBaseline(metrics) {
    const pairs = {};
    for (const [k, m] of Object.entries(metrics.pairs)) {
        const p = m.perceptual || null;
        pairs[k] = { driftEnvelope: [Math.max(0, m.maxDrift * 0.6 - 1), m.maxDrift * 1.5 + 2],
            visualEnvelope: [Math.max(0, m.visual * 0.4), m.visual * 1.8 + 0.03],
            measured: { maxDrift: +m.maxDrift.toFixed(3), visual: +m.visual.toFixed(4) },
            // v3337 -- envelopes bounded BOTH WAYS for the same reason as the others: a floor that only had a
            // ceiling would let two solvers become suspiciously identical without anyone noticing, and two
            // different solvers agreeing perfectly is a finding, not a success.
            perceptual: p ? {
                iouEnvelope: [Math.max(0, p.iou * 0.75), Math.min(1, p.iou * 1.15)],
                scaleEnvelope: [Math.max(0, p.scaleDelta * 0.5), p.scaleDelta * 2 + 0.02],
                ssimEnvelope: [Math.max(-1, p.ssim - Math.abs(p.ssim) * 0.25 - 0.02), Math.min(1, p.ssim + Math.abs(p.ssim) * 0.25 + 0.02)],
                edgeEnvelope: [Math.max(0, p.edgeOverlap * 0.7), Math.min(1, p.edgeOverlap * 1.2 + 0.02)],
                phashCeiling: Math.ceil(p.phashBits * 1.6) + 2,
                measured: { iou: +p.iou.toFixed(4), scaleDelta: +p.scaleDelta.toFixed(4), ssim: +p.ssim.toFixed(4),
                            edgeOverlap: +p.edgeOverlap.toFixed(4), phashBits: p.phashBits },
            } : null };
    }
    return { recorded: new Date().toISOString(), ticks: metrics.ticks, determinism: metrics.determinism, pairs };
}
function gateAgainstBaseline(baseline, metrics) {
    const checks = []; const inEnv = (v, e) => v >= e[0] && v <= e[1];
    for (const [name, d] of Object.entries(metrics.determinism)) { const ok = d.trajectory && d.render; checks.push({ name: name + " deterministic", ok, detail: (d.trajectory ? "traj ok" : "traj DIVERGED") + ", render " + (d.renderDiff * 100).toFixed(2) + "%" }); }
    for (const [k, m] of Object.entries(metrics.pairs)) { const base = baseline.pairs[k];
        // v3337 -- *** A MISSING BASELINE IS NOT A PASS. *** This reported ok:true, so the FIRST run on a rig
        // where box3d finally loads would go GREEN while measuring nothing -- a control that cannot fail, at
        // exactly the moment the measurement everyone is waiting for becomes possible. It is now UNMEASURED:
        // loud, not fatal, and it names the one command that fixes it.
        if (!base) { checks.push({ name: k + " UNMEASURED", ok: false, unmeasured: true,
            detail: "drift " + m.maxDrift.toFixed(2) + "u, visual " + (m.visual * 100).toFixed(1) + "%" +
                    (m.perceptual ? ", IoU " + m.perceptual.iou.toFixed(4) + ", SSIM " + m.perceptual.ssim.toFixed(4) +
                                    ", pHash " + m.perceptual.phashBits + " bits" : "") +
                    " -- NO ENVELOPE RECORDED. Run `node physics/backend-qa-check.mjs --update` on this rig to make these the floor." }); continue; }
        checks.push({ name: k + " drift", ok: inEnv(m.maxDrift, base.driftEnvelope), detail: m.maxDrift.toFixed(2) + "u vs baseline " + base.driftEnvelope.map((x) => x.toFixed(1)).join("..") });
        checks.push({ name: k + " visual", ok: inEnv(m.visual, base.visualEnvelope), detail: (m.visual * 100).toFixed(1) + "% vs baseline " + base.visualEnvelope.map((x) => (x * 100).toFixed(0) + "%").join("..") });
        if (base.perceptual && m.perceptual) {
            const bp = base.perceptual, mp = m.perceptual;
            checks.push({ name: k + " silhouette IoU", ok: inEnv(mp.iou, bp.iouEnvelope), detail: mp.iou.toFixed(4) + " vs " + bp.iouEnvelope.map((x) => x.toFixed(3)).join("..") });
            checks.push({ name: k + " scale delta", ok: inEnv(mp.scaleDelta, bp.scaleEnvelope), detail: mp.scaleDelta.toFixed(4) + " vs " + bp.scaleEnvelope.map((x) => x.toFixed(3)).join("..") });
            checks.push({ name: k + " SSIM", ok: inEnv(mp.ssim, bp.ssimEnvelope), detail: mp.ssim.toFixed(4) + " vs " + bp.ssimEnvelope.map((x) => x.toFixed(3)).join("..") });
            checks.push({ name: k + " edge overlap", ok: inEnv(mp.edgeOverlap, bp.edgeEnvelope), detail: mp.edgeOverlap.toFixed(4) + " vs " + bp.edgeEnvelope.map((x) => x.toFixed(3)).join("..") });
            checks.push({ name: k + " pHash bits", ok: mp.phashBits <= bp.phashCeiling, detail: mp.phashBits + " bits vs ceiling " + bp.phashCeiling });
        } else if (m.perceptual) {
            checks.push({ name: k + " perceptual UNMEASURED", ok: false, unmeasured: true,
                detail: "IoU " + m.perceptual.iou.toFixed(4) + ", SSIM " + m.perceptual.ssim.toFixed(4) + ", pHash " + m.perceptual.phashBits +
                        " bits measured but no envelope recorded -- re-run with --update to adopt them" });
        }
    }
    return { ok: checks.every((c) => c.ok), checks };
}

function backendQAGate(backends, opts = {}) {
    const ticks = opts.ticks || 180, checks = [];
    const inEnv = (v, e) => v >= e[0] && v <= e[1];
    for (const b of backends) {
        const t = compare(runTrajectory(b.make, ticks), runTrajectory(b.make, ticks));
        checks.push({ name: b.name + " trajectory deterministic", ok: t.identical, detail: t.identical ? "identical every tick" : "diverged@" + t.firstDiff });
        const v = compareVisual(renderFrames(b.make, ticks, 30), renderFrames(b.make, ticks, 30));
        checks.push({ name: b.name + " render deterministic", ok: v.identical, detail: (v.worst * 100).toFixed(2) + "% frame diff" });
    }
    for (let i = 0; i < backends.length; i++) for (let j = i + 1; j < backends.length; j++) {
        const A = backends[i], B = backends[j];
        const dEnv = opts.driftEnvelope || [0, Infinity], vEnv = opts.visualEnvelope || [0, 1];
        const tj = compare(runTrajectory(A.make, ticks), runTrajectory(B.make, ticks));
        checks.push({ name: A.name + " vs " + B.name + " drift", ok: inEnv(tj.maxDrift, dEnv), detail: tj.maxDrift.toFixed(2) + "u (envelope " + dEnv.join("..") + ")" });
        const vv = compareVisual(renderFrames(A.make, ticks, 30), renderFrames(B.make, ticks, 30));
        checks.push({ name: A.name + " vs " + B.name + " visual", ok: inEnv(vv.worst, vEnv), detail: (vv.worst * 100).toFixed(1) + "% (envelope " + vEnv.map((x) => (x * 100).toFixed(0) + "%").join("..") + ")" });
    }
    return { ok: checks.every((c) => c.ok), checks };
}

export { backendQAGate, captureMetrics, toBaseline, gateAgainstBaseline };

// runnable: gate Jolt (+ box3d if built) against the recorded baseline. --update re-records the baseline.
if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
    const { createJoltBackend } = await import("./jolt/joltLoader.js");
    const UPDATE = process.argv.includes("--update");
    const BASE = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "tools", "render-qa", "backend-baseline.json");
    const jolt = await createJoltBackend();
    const backends = [{ name: "Jolt", make: () => jolt.createWorld({ gravity: [0, -9.8, 0] }) }];
    // *** v4400 -- THIS BLOCK NEVER LOADED box3d, AND SAID SO IN THE WRONG WORDS FOR AS LONG AS IT EXISTED. ***
    // It called createWorld WITHOUT init(), so box3dLoader threw "box3d: call init() first" -- a USAGE error --
    // and the catch printed it as the artifact being absent. So the cross-backend envelope this file exists to
    // record has only ever held ONE backend, and its own header at line 87 warns about exactly that shape:
    // "a run where box3d finally loads would go GREEN while measuring nothing -- a control that cannot fail".
    // The reason is now taken from the loader's own status rather than assumed from the fact that something
    // failed.
    try {
        // v4400 -- through the NODE DOOR. box3dLoader's own init() uses a browser-absolute URL that cannot
        // resolve here, and it must stay that way: it is browser-reachable, so it cannot import a Node module
        // (browserNodeGuard walks the graph from every page and says so). backendNode.mjs is the Node-only
        // module that loads the wasm by a module-relative path and hands it to the shared loader.
        const mod = await import("./box3d/box3dLoader.js");
        const { adoptBox3dInNode } = await import("./backendNode.mjs");
        const st = await adoptBox3dInNode();
        if (!st || !st.ready) throw new Error(st && st.reason ? st.reason : "box3d reported not ready");
        const w = mod.box3d.createWorld({ gravity: [0, -9.8, 0] });
        w.destroy && w.destroy();
        backends.push({ name: "box3d", make: () => mod.box3d.createWorld({ gravity: [0, -9.8, 0] }) });
    } catch (e) {
        console.log("(box3d unavailable -> Jolt baseline only. The loader said: " +
                    String(e.message || e).slice(0, 160) + ")");
    }

    const metrics = captureMetrics(backends, { ticks: 180 });
    if (UPDATE) {
        // merge: keep existing baseline pairs we can't re-measure here, overwrite the ones we can
        let prev = {}; try { prev = JSON.parse(readFileSync(BASE, "utf8")); } catch {}
        const fresh = toBaseline(metrics);
        fresh.pairs = { ...(prev.pairs || {}), ...fresh.pairs };
        writeFileSync(BASE, JSON.stringify(fresh, null, 2));
        console.log("baseline updated -> " + BASE);
        for (const [k, p] of Object.entries(fresh.pairs)) console.log("  " + k + ": drift " + p.driftEnvelope.map((x) => x.toFixed(1)).join("..") + "u, visual " + p.visualEnvelope.map((x) => (x * 100).toFixed(0) + "%").join(".."));
    } else {
        const baseline = existsSync(BASE) ? JSON.parse(readFileSync(BASE, "utf8")) : { pairs: {} };
        const r = gateAgainstBaseline(baseline, metrics);
        for (const c of r.checks) console.log((c.ok ? "  PASS " : "  FAIL ") + c.name + " -- " + c.detail);
        console.log("GATE: " + (r.ok ? "GREEN" : "RED"));
    }
}
