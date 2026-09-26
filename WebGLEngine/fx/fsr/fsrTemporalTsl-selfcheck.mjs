#!/usr/bin/env node
// WebGLEngine/fx/fsr/fsrTemporalTsl-selfcheck.mjs -- v4731
//
// FSR2'S CHAIN ON A THREE.JS SCENE, HELD TO fsr.html's CHAIN ON THE CPU. Every pass fx/fsr/fsrTemporalTsl.mjs composes
// is graded against its own mirror in its own gate (render/temporalTsl, temporalClipTsl, temporalLockTsl, reactiveTsl).
// What this gate grades is the COMPOSITION: the order, the ping-pongs, which frame's record and history each pass
// reads, and the history factor's three inputs. It runs the driver for 40 frames and, from the device's own renders
// and motion field alone, runs fsr.html's order with the CPU references -- resolveJitterAwareCPU, dilateCPU, pushLuma
// and shadingShiftCPU, reactiveCPU, disocclusionCPU, historyFactorCPU, rectifiedAccumulateCPU -- carrying its OWN
// history, and compares the two pictures every frame. A pass reading the wrong frame's input is a picture that drifts.
"use strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runInEngineOrigin, webgpuSkipReason } from "../../tools/ship/webgpuHarness.mjs";
import { resolveJitterAwareCPU } from "../../render/temporalResolve.mjs";
import { dilateCPU } from "../../render/dilate.mjs";
import { disocclusionCPU, historyFactorCPU, rectifiedAccumulateCPU } from "../../render/temporalReject.mjs";
import { reactiveCPU } from "../../render/reactive.mjs";
import { makeLumaState, pushLuma, shadingShiftCPU } from "../../render/temporalLock.mjs";
import { jitterPhaseCount, jitterSequence } from "../../render/jitter.mjs";
import { rcasCPU } from "./fsr.js";
import * as FT from "./fsrTemporalTsl.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (label, cond, detail) => { if (!cond) fails++; console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "   " + detail : ""}`); };
const RW = 32, DW = 48, N = 40, ALPHA = 0.1, SHARP = 0.5;   // 1.5x: 18 jitter phases, a 36-slot ring that fills inside the run

console.log("\n1. WITHOUT A DEVICE: the driver's refusal");
{
    let m = null; try { FT.makeFsrTemporal({}, {}, {}, { renderWidth: 1, renderHeight: 1, displayWidth: 2, displayHeight: 2 }); } catch (e) { m = String(e.message); }
    ok("makeFsrTemporal refuses to run without a threshold, as disocclusionCPU and reactiveCPU both do", m !== null && /threshold must be a positive clip-z gap/.test(m), m || "no throw");
}

console.log("\n2. ON THE DEVICE: the chain, 40 frames, against fsr.html's order on the CPU");
const skip = webgpuSkipReason();
if (skip) { console.log(`  SKIP  ${skip}`); console.log("  ----  *** NOT A PASS. *** Section 1 is static."); fails++; }
else {
    const r = await runInEngineOrigin({ engineRoot: ENG, timeoutMs: 300000, args: { RW, DW, N, ALPHA, SHARP }, script: `async (a) => {
        const THREE = await import("/vendor/three-webgpu/three.webgpu.js"); const T = await import("/vendor/three-webgpu/three.tsl.js");
        const FT = await import("/fx/fsr/fsrTemporalTsl.mjs"); const TC = await import("/render/temporalClipTsl.mjs"); const TT = await import("/render/temporalTsl.mjs");
        const out = {};
        for (const mode of ["webgpu", "webgl2"]) {
            try {
                const canvas = document.createElement("canvas"); canvas.width = a.DW; canvas.height = a.DW;
                const renderer = new THREE.WebGPURenderer({ canvas, forceWebGL: mode === "webgl2", antialias: false }); await renderer.init();
                const o = { frames: [] };
                const read = async (t, n) => Array.from(await renderer.readRenderTargetPixelsAsync(t, 0, 0, n, n));
                // a striped wall with a pulsing lamp (the shading mask's and the reactive mask's business), a box sliding past
                // it (disocclusion's), and a slow pan (the whole field moves)
                const scene = new THREE.Scene(); scene.background = new THREE.Color(0.05, 0.05, 0.08);
                const pulse = T.uniform(0.2);
                const wm = new THREE.MeshBasicNodeMaterial();
                wm.colorNode = T.Fn(() => { const uv = T.uv(); const st = T.sin(uv.x.mul(30.0)).mul(0.15).add(0.35);
                    const lamp = T.select(uv.x.greaterThan(0.3).and(uv.x.lessThan(0.55)).and(uv.y.greaterThan(0.3)).and(uv.y.lessThan(0.6)), pulse, T.float(0.0));
                    return T.vec3(st.add(lamp), st.add(lamp.mul(0.6)), st.mul(0.8)); })();
                const wall = new THREE.Mesh(new THREE.PlaneGeometry(6, 6), wm); wall.position.z = -1.5; scene.add(wall);
                const box = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.6, 0.6), new THREE.MeshNormalNodeMaterial()); scene.add(box);
                const cam = new THREE.PerspectiveCamera(45, 1, 0.5, 20); cam.position.set(0, 0, 3.5); cam.lookAt(0, 0, 0); cam.updateMatrixWorld();
                const vp = Array.from(new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse).elements);
                const threshold = TC.clipGapThreshold(vp, [0, 0, 0.3], [0, 0, -1.5]); o.threshold = threshold;
                const fsr = FT.makeFsrTemporal(THREE, T, renderer, { renderWidth: a.RW, renderHeight: a.RW, displayWidth: a.DW, displayHeight: a.DW,
                    threshold, alpha: a.ALPHA, reactive: true, lock: true, sharpness: a.SHARP, type: THREE.FloatType });
                o.period = fsr.period; o.memory = fsr.memory;
                const outRT = new THREE.RenderTarget(a.DW, a.DW, { type: THREE.FloatType, depthBuffer: false });
                const refRT = new THREE.RenderTarget(a.RW, a.RW, { type: THREE.FloatType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
                for (let k = 0; k < a.N; k++) {
                    pulse.value = 0.2 + 0.2 * Math.sin(0.5 * k);
                    box.position.set(-1 + 0.05 * k, 0.1 * Math.sin(0.3 * k), 0); box.rotation.set(0.2 * k, 0.3 * k, 0); box.updateMatrixWorld();
                    cam.position.set(0.01 * k, 0, 3.5); cam.lookAt(0.01 * k, 0, 0); cam.updateMatrixWorld();
                    const phase = fsr.phase.slice(), before = cam.projectionMatrix.clone();
                    await fsr.render(scene, cam, outRT);
                    o.restored = (o.restored === undefined ? true : o.restored) && cam.projectionMatrix.equals(before);
                    // the colour pass, redone here with applyJitter at the phase the driver reported: the SAME render,
                    // or the driver did not jitter (the CPU below resolves whatever the device drew, so it cannot tell)
                    if (k % 7 === 3) { TT.applyJitter(cam, before, phase[0], phase[1], a.RW, a.RW); renderer.setRenderTarget(refRT); await renderer.renderAsync(scene, cam);
                        TT.restoreProjection(cam, before); const mine = await read(refRT, a.RW), theirs = await read(fsr.targets.colour, a.RW);
                        let d = 0; for (let i = 0; i < mine.length; i++) d = Math.max(d, Math.abs(mine[i] - theirs[i])); o.jitterGap = Math.max(o.jitterGap || 0, d); o.jitterChecks = (o.jitterChecks || 0) + 1; }
                    const f = { phase, colour: await read(fsr.targets.colour, a.RW), depth: await read(fsr.targets.depth, a.DW), motion: await read(fsr.targets.motion, a.DW),
                                history: await read(fsr.targets.history[k % 2], a.DW) };
                    if (k === a.N - 1) Object.assign(f, { dis: await read(fsr.targets.disocclusion, a.DW), rx: await read(fsr.targets.reactive, a.DW),
                        shade: await read(fsr.targets.shading, a.DW), factor: await read(fsr.targets.factor, a.DW), out: await read(outRT, a.DW) });
                    o.frames.push(f);
                }
                fsr.dispose(); out[mode] = o; renderer.dispose();
            } catch (err) { out[mode] = { err: String(err && err.stack || err).slice(0, 700) }; }
        }
        return out;
    }` });
    ok("the harness ran the chain on BOTH backends", r.ok && r.result && !r.result.webgpu.err && !r.result.webgl2.err,
       r.ok ? `webgpu ${r.result.webgpu.err || "ok"}; webgl2 ${r.result.webgl2.err || "ok"}` : (r.reason || (r.pageErrors || []).join("; ")));
    if (r.ok && r.result) for (const mode of ["webgpu", "webgl2"]) {
        const o = r.result[mode]; if (!o || o.err) continue;
        const up = (px, n) => { if (mode === "webgpu") return new Float32Array(px); const f = []; for (let y = n - 1; y >= 0; y--) f.push(...px.slice(y * n * 4, (y + 1) * n * 4)); return new Float32Array(f); };
        const ch = (a4) => { const x = new Float32Array(a4.length / 4); for (let i = 0; i < x.length; i++) x[i] = a4[i * 4]; return x; };
        const worst = (a, b, n, c = 3) => { let w = 0; for (let i = 0; i < n; i++) for (let j = 0; j < c; j++) { const d = Math.abs(a[i * (c === 1 ? 1 : 4) + j] - b[i * (c === 1 ? 1 : 4) + j]); if (!(d <= w)) w = d; } return w; };
        ok(`[${mode}] the lock ring's period is the jitter's phase count at 1.5x, ${o.period}, and its memory is reported (${(o.memory.ring / 1048576).toFixed(2)} MB here)`,
           o.period === jitterPhaseCount(1.5) && o.memory.ring > 0, "the period may not be chosen for cost -- fsr.html's rule");
        // the phases the driver rendered with ARE render/jitter.mjs's sequence, in order -- the CPU below reads the phase
        // the driver reports, so a driver that never advanced would agree with it perfectly and still not be upscaling
        const seq = jitterSequence(o.period); let phaseOk = 0;
        o.frames.forEach((f, k) => { const want = seq[k % seq.length]; if (f.phase[0] === want[0] && f.phase[1] === want[1]) phaseOk++; });
        ok(`[${mode}] every frame's jitter is Halton(2,3)'s phase k mod ${o.period}, in order -- ${phaseOk} of ${o.frames.length}`, phaseOk === o.frames.length,
           "the sequence wraps at the phase count; each of the 18 phases is used at least twice in the run");
        ok(`[${mode}] the colour pass IS the scene through applyJitter at the reported phase -- ${o.jitterChecks} frames redrawn, worst ${o.jitterGap} -- and the camera comes back with its own projection`,
           o.jitterChecks > 3 && o.jitterGap === 0 && o.restored === true, "the CPU chain resolves whatever the device drew, so it cannot see a colour pass that forgot to jitter or a motion pass that ran jittered");
        // fsr.html's order, on the CPU, from the device's renders alone
        const st = makeLumaState(DW, DW, o.period);
        let hist = null, rec = null, wHist = 0, wAt = -1, last = null;
        for (let k = 0; k < o.frames.length; k++) {
            const f = o.frames[k];
            const cur = resolveJitterAwareCPU({ src: up(f.colour, RW), rw: RW, rh: RW, dw: DW, dh: DW, jitter: f.phase }).data;
            const dil = dilateCPU({ depth: ch(up(f.depth, DW)), motion: up(f.motion, DW), w: DW, h: DW, nearerIsLess: true });
            pushLuma(st, { current: cur, motion: dil.motion, w: DW, h: DW });
            const shade = shadingShiftCPU(st, { scale: 1, strength: 1 });
            let factor = null, dis = null, rx = null;
            if (k > 0) {
                rx = reactiveCPU({ current: cur, history: hist, motion: dil.motion, prevDepth: rec, w: DW, h: DW, threshold: o.threshold });
                dis = disocclusionCPU({ motion: dil.motion, prevDepth: rec, w: DW, h: DW, threshold: o.threshold, nearerIsLess: true });
                factor = historyFactorCPU({ disocclusion: dis.data, reactive: rx.data, shading: shade.data, n: DW * DW });
            }
            hist = rectifiedAccumulateCPU({ current: cur, history: k ? hist : null, motion: dil.motion, factor, w: DW, h: DW, alpha: ALPHA, space: "ycocg" }).data;
            rec = dil.depth;
            const w = worst(up(f.history, DW), hist, DW * DW); if (w > wHist) { wHist = w; wAt = k; }
            last = { shade, rx, dis, factor, hist };
        }
        ok(`*** [${mode}] the DEVICE's chain is fsr.html's order on the CPU, frame by frame for ${o.frames.length} frames, the CPU carrying its OWN history -- worst ${wHist.toExponential(2)} (frame ${wAt}) ***`,
           wHist < 1e-4, "a pass reading the wrong frame's record or history would drift here; the accumulate is a contraction, so f32 error does not grow");
        const lf = o.frames[o.frames.length - 1];
        const wDis = worst(ch(up(lf.dis, DW)), last.dis.data, DW * DW, 1), wRx = worst(ch(up(lf.rx, DW)), last.rx.data, DW * DW, 1);
        const wSh = worst(ch(up(lf.shade, DW)), last.shade.data, DW * DW, 1), wF = worst(ch(up(lf.factor, DW)), last.factor, DW * DW, 1);
        const genuine = last.dis.flagged - last.dis.noHistory; let shFired = 0; for (const v of last.shade.data) if (v >= 0.05) shFired++;
        ok(`*** [${mode}] and on the last frame all THREE masks are live and are the mirrors' -- disocclusion ${wDis} (${genuine} genuine), reactive ${wRx.toExponential(2)} (${last.rx.flagged} fired), shading ${wSh.toExponential(2)} (${shFired} fired), factor ${wF.toExponential(2)} ***`,
           wDis === 0 && wRx < 1e-4 && wSh < 1e-4 && wF < 1e-4 && genuine > 0 && last.rx.flagged > 0 && shFired > 0,
           `the ring is ${o.period * 2} slots and full after that many pushes, so its mask has pixels only on the run's last frames`);
        const wOut = worst(up(lf.out, DW), rcasCPU(up(lf.history, DW), DW, DW, SHARP, false).data, DW * DW);
        ok(`  [${mode}] ...and the OUTPUT is RCAS of the accumulated history, worst ${wOut.toExponential(2)}`, wOut < 1e-5, `sharpness ${SHARP}, transfer none -- the chain runs on linear values`);
    }
}

// ---- v4731 SABOTAGE LOG ----------------------------------------------------------------------------------------
// Each against fx/fsr/fsrTemporalTsl.mjs alone -- the composition, not the passes, which have their own gates.
//   D1  reactive reads THIS frame's history          -> 4     D8  dilation skipped                          -> 4
//   D2  disocclusion reads THIS frame's record       -> 4     D9  the ring pushed with the raw field        -> 4
//   D3  the accumulate reads THIS frame's history    -> 4     D10 the jitter never advanced                 -> 2
//   D4  the factor without the reactive mask         -> 4     D11 frame one blends a history it does not have -> 4
//   D5  the factor without the shading mask          -> 4     D12 RCAS at full sharpness whatever was asked  -> 2
//   D6  the colour pass not jittered                 -> 2     D13 the ring's period from ratio 1            -> 4
//   D7  the projection not restored before the motion pass -> 6
// *** D6, D7 AND D11 SCORED 0 RED FIRST, AND EACH WAS THE COMPARISON'S BLIND SPOT RATHER THAN THE CHAIN'S. *** The
// CPU chain resolves whatever colour the device drew with whatever phase the driver reported, and reads the device's
// own motion field -- so a colour pass that forgot to jitter (D6) and a motion pass run through the jittered camera
// (D7) were consistent with themselves. The colour pass is now redrawn here with applyJitter at the reported phase and
// must be the same render, and the camera must come back with its own projection. D11 hid behind the record: frame
// one's disocclusion read an unwritten record of zeros and discarded every pixel's history whatever hasHistory said,
// so the driver now starts its record at the far plane and hasHistory is what decides frame one. D10 is here because
// the CPU reads the reported phase: a driver that never advanced would agree with it perfectly.
console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nALL GREEN");
console.log("unchecked here: whether the chain HELPS a three.js scene, frame against truth -- fsr.html measured its own content; " +
    "HalfFloat targets, the driver's default, which this gate replaces with FloatType to grade the arithmetic; and the 2x ring, " +
    "whose 64 slots at display size are why the driver ships with it off.");
process.exitCode = fails ? 1 : 0;
