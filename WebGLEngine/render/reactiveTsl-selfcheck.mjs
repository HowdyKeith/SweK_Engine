#!/usr/bin/env node
// WebGLEngine/render/reactiveTsl-selfcheck.mjs -- v4731
//
// THE REACTIVE MASK FOR A THREE.JS SCENE, HELD TO ITS MIRROR: render/reactiveTsl.mjs's reactiveNode against
// render/reactive.mjs's reactiveCPU, on the device's own frames and dilated field, on both of three's backends.
// The scene is built so every one of the mask's branches has pixels: a LAMP whose colour pulses where nothing moves
// (the mask fires), a box sliding past a wall (the depth gate declines what disocclusion owns), a panning camera
// (the entering edge reprojects off the frame) and a band of the field marked invalid.
"use strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runInEngineOrigin, webgpuSkipReason } from "../tools/ship/webgpuHarness.mjs";
import { reactiveCPU } from "./reactive.mjs";
import * as TR from "./reactiveTsl.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let fails = 0;
const ok = (label, cond, detail) => { if (!cond) fails++; console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "   " + detail : ""}`); };
const N = 6, D = 32;

console.log("\n1. WITHOUT A DEVICE: the refusals reactiveCPU makes");
{
    const refuse = (f) => { try { f(); return "no throw"; } catch (e) { return String(e.message); } };
    const full = new Proxy({}, { get: () => () => {} });
    const a = refuse(() => TR.reactiveNode({}, {}, { w: 1, h: 1, threshold: 1 }));
    const b = refuse(() => TR.reactiveNode(full, {}, { w: 1, h: 1, threshold: 0 }));
    const c = refuse(() => TR.reactiveNode(full, {}, { w: 1, h: 1, threshold: 1, scale: 0 }));
    ok("a TSL namespace missing a name, a threshold that is not a positive clip-z gap, and a scale that is not positive are each refused by name",
       /has no Fn\b/.test(a) && /positive clip-z gap/.test(b) && /scale must be positive/.test(c), [a, b, c].join(" | "));
}

console.log("\n2. ON THE DEVICE: the mask, frame by frame, on both backends");
const skip = webgpuSkipReason();
if (skip) { console.log(`  SKIP  ${skip}`); console.log("  ----  *** NOT A PASS. *** Section 1 is static."); fails++; }
else {
    const r = await runInEngineOrigin({ engineRoot: ENG, timeoutMs: 240000, args: { N, D }, script: `async (a) => {
        const THREE = await import("/vendor/three-webgpu/three.webgpu.js"); const T = await import("/vendor/three-webgpu/three.tsl.js");
        const TT = await import("/render/temporalTsl.mjs"); const TC = await import("/render/temporalClipTsl.mjs"); const TR = await import("/render/reactiveTsl.mjs");
        const out = {};
        const tgt = () => new THREE.RenderTarget(a.D, a.D, { type: THREE.FloatType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
        const quad = (node) => { const m = new THREE.NodeMaterial(); m.fragmentNode = node; m.blending = THREE.NoBlending; m.depthTest = false; m.depthWrite = false;
            const s = new THREE.Scene(); s.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), m)); return s; };
        const ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
        for (const mode of ["webgpu", "webgl2"]) {
            try {
                const canvas = document.createElement("canvas"); canvas.width = a.D; canvas.height = a.D;
                const renderer = new THREE.WebGPURenderer({ canvas, forceWebGL: mode === "webgl2", antialias: false }); await renderer.init();
                const gl = TT.glClip(THREE, renderer), o = { frames: [] };
                const read = async (t) => Array.from(await renderer.readRenderTargetPixelsAsync(t, 0, 0, a.D, a.D));
                const draw = async (sc, t) => { renderer.setRenderTarget(t); await renderer.renderAsync(sc, ortho); };
                const scene = new THREE.Scene(); scene.background = new THREE.Color(0.05, 0.05, 0.08);
                const pulse = T.uniform(0.3);
                const wm = new THREE.MeshBasicNodeMaterial();
                // the lamp covers a patch, the TOP band (where the field is marked invalid) and the RIGHT strip (where the
                // pan's entering edge reprojects off the frame): a declined pixel must be one whose colour DID change, or a
                // pass that forgot to decline it would write 0 anyway -- X4 and X5 scored 0 RED on a flat wall that way
                wm.colorNode = T.Fn(() => { const uv = T.uv(); const lit = uv.x.greaterThan(0.2).and(uv.x.lessThan(0.45)).and(uv.y.greaterThan(0.2)).and(uv.y.lessThan(0.5))
                        .or(uv.y.greaterThan(0.7)).or(uv.x.greaterThan(0.75));
                    const lamp = T.select(lit, pulse, T.float(0.0));
                    return T.vec3(T.float(0.3).add(lamp), T.float(0.35).add(lamp.mul(0.5)), 0.4); })();
                const wall = new THREE.Mesh(new THREE.PlaneGeometry(6, 6), wm); wall.position.z = -1.5; scene.add(wall);
                const box = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.7, 0.7), new THREE.MeshBasicNodeMaterial({ color: 0xcc7722 })); scene.add(box);
                const cam = new THREE.PerspectiveCamera(45, 1, 0.5, 20);
                const stage = TT.makeMotionStage(THREE, T, { w: a.D, h: a.D, gl });
                const cur = [tgt(), tgt()], dMot = tgt(), rec = [tgt(), tgt()], mask = tgt(), mSyn = tgt(), maskHalf = tgt();
                const dil = TC.dilateNodes(T, stage.depth.texture, stage.motion.texture, { w: a.D, h: a.D });
                const scM = quad(dil.motionNode), scD = quad(dil.depthNode);
                // the field with its top four rows INVALID, which is what the mask reads (every real pixel is valid)
                const scS = quad(T.Fn(() => { const m = T.textureLoad(dMot.texture, T.ivec2(T.int(T.screenCoordinate.x), T.int(T.screenCoordinate.y)));
                    return T.select(T.screenCoordinate.y.lessThan(4.0), T.vec4(m.x, m.y, 0.0, m.w), m); })());
                cam.position.set(0, 0, 3.5); cam.lookAt(0, 0, 0); cam.updateMatrixWorld();
                const vp = Array.from(new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse).elements);
                const threshold = TC.clipGapThreshold(vp, [0, 0, 0.35], [0, 0, -1.5]); o.threshold = threshold;
                // frame k writes cur[k % 2] and rec[k % 2]; the mask reads the other two
                const rx = [0, 1].map((k) => TR.reactiveNode(T, { current: cur[k].texture, history: cur[1 - k].texture, motion: mSyn.texture, prevDepth: rec[1 - k].texture }, { w: a.D, h: a.D, threshold }));
                const rxHalf = [0, 1].map((k) => TR.reactiveNode(T, { current: cur[k].texture, history: cur[1 - k].texture, motion: mSyn.texture, prevDepth: rec[1 - k].texture }, { w: a.D, h: a.D, threshold, scale: 0.5 }));
                const scR = rx.map((x) => quad(x.node)), scRH = rxHalf.map((x) => quad(x.node));
                // frame one reads rec[1] and cur[1] before anything was written to them. Left as zeros, the depth gate declines
                // EVERY pixel (zPrev is far beyond a record of 0) and a mask that ignored hasHistory scored 0 RED (X6). The
                // record starts at the far plane instead, so frame one's zeros are hasHistory's doing and nothing else's.
                await draw(quad(T.vec4(1.0, 0.0, 0.0, 1.0)), rec[1]);
                for (let k = 0; k < a.N; k++) {
                    const kk = k % 2;
                    pulse.value = 0.15 + 0.25 * Math.sin(1.1 * k);
                    box.position.set(-0.8 + 0.3 * k, 0, 0); box.updateMatrixWorld();
                    cam.position.set(0.1 * k, 0, 3.5); cam.lookAt(0.1 * k, 0, 0); cam.updateMatrixWorld();   // ~0.8 px a frame: the entering edge reprojects off
                    renderer.setRenderTarget(cur[kk]); await renderer.renderAsync(scene, cam);
                    await stage.render(renderer, scene, cam);
                    await draw(scM, dMot); await draw(scD, rec[kk]); await draw(scS, mSyn);
                    rx[kk].uniforms.hasHistory.value = k > 0 ? 1 : 0; rxHalf[kk].uniforms.hasHistory.value = k > 0 ? 1 : 0;
                    await draw(scR[kk], mask); await draw(scRH[kk], maskHalf);
                    o.frames.push({ cur: await read(cur[kk]), motion: await read(mSyn), rec: await read(rec[kk]), mask: await read(mask), maskHalf: await read(maskHalf) });
                }
                stage.dispose(); out[mode] = o; renderer.dispose();
            } catch (err) { out[mode] = { err: String(err && err.stack || err).slice(0, 700) }; }
        }
        return out;
    }` });
    ok("the harness ran the mask on BOTH backends", r.ok && r.result && !r.result.webgpu.err && !r.result.webgl2.err,
       r.ok ? `webgpu ${r.result.webgpu.err || "ok"}; webgl2 ${r.result.webgl2.err || "ok"}` : (r.reason || (r.pageErrors || []).join("; ")));
    if (r.ok && r.result) for (const mode of ["webgpu", "webgl2"]) {
        const o = r.result[mode]; if (!o || o.err) continue;
        const up = (px) => { if (mode === "webgpu") return new Float32Array(px); const f = []; for (let y = D - 1; y >= 0; y--) f.push(...px.slice(y * D * 4, (y + 1) * D * 4)); return new Float32Array(f); };
        const ch = (a4) => { const x = new Float32Array(D * D); for (let i = 0; i < D * D; i++) x[i] = a4[i * 4]; return x; };
        let w = 0, wH = 0, fired = 0, firedH = 0, dInv = 0, dOff = 0, dDepth = 0, zero1 = 0;
        for (let k = 0; k < o.frames.length; k++) {
            const f = o.frames[k], prev = k ? o.frames[k - 1] : null;
            const mask = ch(up(f.mask)), half = ch(up(f.maskHalf));
            if (k === 0) { for (let i = 0; i < D * D; i++) zero1 = Math.max(zero1, mask[i]); continue; }
            const args = { current: up(f.cur), history: up(prev.cur), motion: up(f.motion), prevDepth: ch(up(prev.rec)), w: D, h: D, threshold: o.threshold };
            const ref = reactiveCPU(args), refH = reactiveCPU({ ...args, scale: 0.5 });
            for (let i = 0; i < D * D; i++) { w = Math.max(w, Math.abs(mask[i] - ref.data[i])); wH = Math.max(wH, Math.abs(half[i] - refH.data[i])); }
            fired += ref.flagged; firedH += refH.flagged; dInv += ref.declinedInvalid; dOff += ref.declinedOffscreen; dDepth += ref.declinedDepth;
        }
        ok(`*** [${mode}] the node's mask is reactiveCPU's on every frame with a history, worst ${w.toExponential(2)} -- ${fired} pixels fired at 0.05 or above, and all three of its declines have pixels: ${dInv} invalid, ${dOff} off the frame, ${dDepth} depth-gated ***`,
           w < 1e-5 && fired > 20 && dInv > 0 && dOff > 0 && dDepth > 0, `threshold ${o.threshold.toExponential(3)}, a quarter of the clip-z gap between the box's front and the wall`);
        ok(`  [${mode}] ...and at scale 0.5 it is reactiveCPU's at 0.5, worst ${wH.toExponential(2)}, ${firedH} firing against ${fired}`, wH < 1e-5 && firedH > fired, "scale is the caller's colour range; at 1 it divides by one");
        ok(`  [${mode}] ...and on frame one, with no history, every pixel is 0`, zero1 === 0, `worst ${zero1}`);
    }
}

// ---- v4731 SABOTAGE LOG ----------------------------------------------------------------------------------------
//   X1  the accumulate's four-tap bilinear instead of sample3's -> 0     X6  hasHistory ignored               -> 2
//   X2  the depth gate's sign flipped                           -> 4     X7  red only, not the largest channel -> 4
//   X3  the depth gate dropped                                  -> 4     X8  scale ignored                     -> 2
//   X4  the offscreen test dropped                              -> 4     X9  the gate's texel rounded          -> 4
//   X5  invalid motion not declined                             -> 4
// *** X1 IS A 0-RED THAT CORRECTED A CLAIM, NOT A HOLE. *** render/reactiveTsl.mjs's header said sharing the
// accumulate's sampler would agree with one mirror and not the other. It does not: the two orders differ by rounding,
// under 1e-5 -- the header now says the order is kept for fidelity and nothing more. *** X4, X5 AND X6 SCORED 0 RED
// FIRST, AND THE FIXTURE WAS THE REASON EACH TIME. *** On a flat wall a declined pixel's colour had not changed, so
// forgetting to decline it still wrote 0 (X4, X5): the lamp now covers the invalid band and the entering edge. And on
// frame one the unwritten depth record of 0 made the depth gate decline EVERY pixel, so hasHistory had nothing to do
// (X6): the record now starts at the far plane.
console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nALL GREEN");
console.log("unchecked here: the APPLICATION-declared mask fsr.html can use instead (FSR2's primary path, which a three.js " +
    "scene would supply as its own target); and whether the mask HELPS on this content, which fsr.html measured for its own.");
process.exitCode = fails ? 1 : 0;
