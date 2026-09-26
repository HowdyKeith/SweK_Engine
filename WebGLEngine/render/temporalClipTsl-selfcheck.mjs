#!/usr/bin/env node
// WebGLEngine/render/temporalClipTsl-selfcheck.mjs -- v4729, split out of render/temporalTsl-selfcheck.mjs at v4730
//
// THE DEPTH CLIP FOR A THREE.JS SCENE, HELD TO ITS MIRRORS: render/temporalClipTsl.mjs's dilateNodes, disocclusionNode
// and historyFactorNode against render/dilate.mjs's dilateCPU and render/temporalReject.mjs's disocclusionCPU and
// historyFactorCPU, on the device's own depth and motion (render/temporalTsl.mjs's input stage), on both of three's
// backends. Selections, not arithmetic -- so the rows ask for worst 0.
"use strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runInEngineOrigin, webgpuSkipReason } from "../tools/ship/webgpuHarness.mjs";
import { mat4Multiply, transform4 } from "./motionVectors.mjs";
import { disocclusionCPU, historyFactorCPU } from "./temporalReject.mjs";
import { dilateCPU } from "./dilate.mjs";
import * as TC from "./temporalClipTsl.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let fails = 0;
const ok = (label, cond, detail) => { if (!cond) fails++; console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "   " + detail : ""}`); };

console.log("\n1. WITHOUT A DEVICE: the refusals and the threshold");
{
    const refuse = (f) => { try { f(); return "no throw"; } catch (e) { return String(e.message); } };
    const rs = [() => TC.dilateNodes({}, null, null, { w: 1, h: 1 }), () => TC.disocclusionNode({}, null, null, { w: 1, h: 1, threshold: 1 }), () => TC.historyFactorNode({}, {})].map(refuse);
    ok("every node refuses a TSL namespace missing a name, by that name", rs.every((m) => /has no Fn\b/.test(m)), rs.join(" | "));
    const full = new Proxy({}, { get: () => () => {} });
    const noT = refuse(() => TC.disocclusionNode(full, null, null, { w: 1, h: 1, threshold: 0 }));
    ok("  and disocclusionNode refuses a threshold that is not a positive clip-z gap, as disocclusionCPU does", /positive clip-z gap/.test(noT), noT);
}
{
        const f = 1 / Math.tan(Math.PI / 8), n = 0.5, fa = 20;
        const P = new Float32Array([f, 0, 0, 0, 0, f, 0, 0, 0, 0, -(fa + n) / (fa - n), -1, 0, 0, -2 * fa * n / (fa - n), 0]);   // GL-style, column-major
        const V = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, -3.5, 1]);
        const vp = mat4Multiply(P, V), zOf = (p) => { const q = transform4(vp, p[0], p[1], p[2], 1); return q[2] / q[3]; };
        const want = 0.25 * Math.abs(zOf([0, 0, 0.4]) - zOf([0, 0, -1.5]));
        const got = TC.clipGapThreshold(Array.from(vp), [0, 0, 0.4], [0, 0, -1.5]);
        ok(`  v4729: clipGapThreshold is a quarter of the clip-z gap, ${got.toExponential(4)} -- and null where the two points are closer than the clip test can separate`,
           Math.abs(got - want) < 1e-12 && TC.clipGapThreshold(Array.from(vp), [0, 0, 0.4], [0, 0, 0.4 - 1e-6]) === null, `independently ${want.toExponential(4)}`);
    }

console.log("\n2. ON THE DEVICE -- THE DEPTH CLIP: dilation, disocclusion and the history factor, on a box sliding past a wall");
const skip = webgpuSkipReason();
if (skip) { console.log(`  SKIP  ${skip}`); console.log("  ----  *** NOT A PASS. *** Section 1 is static."); fails++; }
else {
    const N4 = 6, D4 = 64;
    const r = await runInEngineOrigin({ engineRoot: ENG, timeoutMs: 240000, args: { N4, D4 }, script: `async (a) => {
        const THREE = await import("/vendor/three-webgpu/three.webgpu.js"); const T = await import("/vendor/three-webgpu/three.tsl.js");
        const TT = await import("/render/temporalTsl.mjs"); const TC = await import("/render/temporalClipTsl.mjs");
        const out = {};
        const tgt = (n) => new THREE.RenderTarget(n, n, { type: THREE.FloatType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
        const quad = (node) => { const m = new THREE.NodeMaterial(); m.fragmentNode = node; m.blending = THREE.NoBlending; m.depthTest = false; m.depthWrite = false;
            const s = new THREE.Scene(); s.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), m)); return s; };
        const ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
        for (const mode of ["webgpu", "webgl2"]) {
            try {
                const canvas = document.createElement("canvas"); canvas.width = a.D4; canvas.height = a.D4;
                const renderer = new THREE.WebGPURenderer({ canvas, forceWebGL: mode === "webgl2", antialias: false }); await renderer.init();
                const gl = TT.glClip(THREE, renderer), o = { frames: [] };
                const read = async (t) => Array.from(await renderer.readRenderTargetPixelsAsync(t, 0, 0, a.D4, a.D4));
                const draw = async (sc, t) => { renderer.setRenderTarget(t); await renderer.renderAsync(sc, ortho); };
                const scene = new THREE.Scene(); scene.background = new THREE.Color(0.1, 0.1, 0.1);
                // a TILTED wall filling the frame (depth falls toward one edge, so the edge rule has pixels to act on), a
                // box sliding past it, and a FACE-ON square spinning in its own plane -- constant depth, varying motion,
                // which is the only place dilation's tie rule decides anything
                const wall = new THREE.Mesh(new THREE.PlaneGeometry(9, 9), new THREE.MeshBasicNodeMaterial({ color: 0x335577 })); wall.position.z = -1.5; wall.rotation.y = 0.35; scene.add(wall);
                const box = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.8, 0.8), new THREE.MeshBasicNodeMaterial({ color: 0xcc7722 })); scene.add(box);
                const spin = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.7), new THREE.MeshBasicNodeMaterial({ color: 0x88cc44 })); spin.position.set(0.6, 0.55, 0.3); scene.add(spin);
                const cam = new THREE.PerspectiveCamera(45, 1, 0.5, 20); cam.position.set(0, 0, 3.5); cam.lookAt(0, 0, 0); cam.updateMatrixWorld();
                const stage = TT.makeMotionStage(THREE, T, { w: a.D4, h: a.D4, gl });
                const vp = Array.from(new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse).elements);
                const threshold = TC.clipGapThreshold(vp, [0, 0, 0.4], [0, 0, -1.5]);
                o.threshold = threshold; o.vp = vp;
                const dMot = tgt(a.D4), rec = [tgt(a.D4), tgt(a.D4)], mask = tgt(a.D4), fac = tgt(a.D4);
                const dil = TC.dilateNodes(T, stage.depth.texture, stage.motion.texture, { w: a.D4, h: a.D4 });
                const scM = quad(dil.motionNode), scD = quad(dil.depthNode);
                // one disocclusion graph per record direction: it reads LAST frame's record while this frame's is written
                const dis = [0, 1].map((k) => TC.disocclusionNode(T, dMot.texture, rec[1 - k].texture, { w: a.D4, h: a.D4, threshold }));
                const scX = dis.map((d) => quad(d.node));
                const scF = quad(TC.historyFactorNode(T, { disocclusion: mask.texture }).node);
                for (let k = 0; k < a.N4; k++) {
                    box.position.set(-0.9 + 0.35 * k, 0.1 * Math.sin(k), 0); box.rotation.set(0.3, 0.2 * k, 0); box.updateMatrixWorld();
                    spin.rotation.z = 0.4 * k; spin.updateMatrixWorld();
                    cam.position.set(0.04 * k, 0.02 * k, 3.5); cam.lookAt(0.04 * k, 0.02 * k, 0); cam.updateMatrixWorld();
                    await stage.render(renderer, scene, cam);
                    await draw(scM, dMot); await draw(scD, rec[k % 2]);
                    const f = { depth: await read(stage.depth), motion: await read(stage.motion), dMotion: await read(dMot), dDepth: await read(rec[k % 2]) };
                    if (k > 0) { await draw(scX[k % 2], mask); await draw(scF, fac); f.mask = await read(mask); f.factor = await read(fac); }
                    o.frames.push(f);
                }
                // the last frame's dilated field with its top quarter INVALID, through the same test
                const mSyn = tgt(a.D4), mask2 = tgt(a.D4), last = (a.N4 - 1) % 2;
                await draw(quad(T.Fn(() => { const m = T.textureLoad(dMot.texture, T.ivec2(T.int(T.screenCoordinate.x), T.int(T.screenCoordinate.y)));
                    return T.select(T.screenCoordinate.y.lessThan(a.D4 / 4), T.vec4(m.x, m.y, 0.0, m.w), m); })()), mSyn);
                await draw(quad(TC.disocclusionNode(T, mSyn.texture, rec[1 - last].texture, { w: a.D4, h: a.D4, threshold }).node), mask2);
                o.invalidMask = await read(mask2);
                stage.dispose(); out[mode] = o; renderer.dispose();
            } catch (err) { out[mode] = { err: String(err && err.stack || err).slice(0, 700) }; }
        }
        return out;
    }` });
    ok("[v4729] the harness ran the depth clip on BOTH backends", r.ok && r.result && !r.result.webgpu.err && !r.result.webgl2.err,
       r.ok ? `webgpu ${r.result.webgpu.err || "ok"}; webgl2 ${r.result.webgl2.err || "ok"}` : (r.reason || (r.pageErrors || []).join("; ")));
    if (r.ok && r.result) for (const mode of ["webgpu", "webgl2"]) {
        const o = r.result[mode]; if (!o || o.err) continue;
        const up = (px) => { if (mode === "webgpu") return new Float32Array(px); const f = []; for (let y = D4 - 1; y >= 0; y--) f.push(...px.slice(y * D4 * 4, (y + 1) * D4 * 4)); return new Float32Array(f); };
        const ch = (a4, c) => { const out = new Float32Array(D4 * D4); for (let i = 0; i < D4 * D4; i++) out[i] = a4[i * 4 + c]; return out; };
        let wDil = 0, moved = 0, wMask = 0, genuine = 0, noHist = 0, wFac = 0, discarded = 0;
        let prevRecord = null;
        for (let k = 0; k < o.frames.length; k++) {
            const f = o.frames[k], depth = ch(up(f.depth), 0), motion = up(f.motion), dM = up(f.dMotion), dD = ch(up(f.dDepth), 0);
            const ref = dilateCPU({ depth, motion, w: D4, h: D4, nearerIsLess: true });
            for (let i = 0; i < D4 * D4; i++) { wDil = Math.max(wDil, Math.abs(dD[i] - ref.depth[i])); for (let c = 0; c < 4; c++) wDil = Math.max(wDil, Math.abs(dM[i * 4 + c] - ref.motion[i * 4 + c])); }
            moved += ref.moved;
            if (k > 0) {
                const dis = disocclusionCPU({ motion: dM, prevDepth: prevRecord, w: D4, h: D4, threshold: o.threshold, nearerIsLess: true });
                const m = ch(up(f.mask), 0), fac = ch(up(f.factor), 0), refF = historyFactorCPU({ disocclusion: dis.data, n: D4 * D4 });
                for (let i = 0; i < D4 * D4; i++) { wMask = Math.max(wMask, Math.abs(m[i] - dis.data[i])); wFac = Math.max(wFac, Math.abs(fac[i] - refF[i])); if (fac[i] === 0) discarded++; }
                genuine += dis.flagged - dis.noHistory; noHist += dis.noHistory;
            }
            prevRecord = dD;
        }
        ok(`*** [${mode}] DILATION is dilateCPU on every frame -- depth and all four motion channels from the same texel, ${moved} pixels taking a neighbour's -- worst ${wDil.toExponential(2)} ***`,
           wDil === 0 && moved > 50, `worst ${wDil}; a selection, not arithmetic, so the device and the mirror agree to the bit or not at all`);
        ok(`*** [${mode}] DISOCCLUSION is disocclusionCPU against LAST frame's dilated record, worst ${wMask} -- ${genuine} genuine disocclusions and ${noHist} with no history over ${o.frames.length - 1} frames, threshold ${o.threshold.toExponential(3)} ***`,
           wMask === 0 && genuine > 20, `the threshold is a quarter of the clip-z gap between the box's front and the wall, clipGapThreshold's rule and fsr.html's`);
        ok(`  [${mode}] ...and the HISTORY FACTOR is historyFactorCPU's, worst ${wFac} -- ${discarded} pixels' history thrown away`, wFac === 0 && discarded === genuine + noHist, `discarded ${discarded} = genuine ${genuine} + no-history ${noHist}`);
        const lastF = o.frames[o.frames.length - 1], mSyn = up(lastF.dMotion);
        for (let y = 0; y < D4 / 4; y++) for (let x = 0; x < D4; x++) mSyn[(y * D4 + x) * 4 + 2] = 0;
        const refI = disocclusionCPU({ motion: mSyn, prevDepth: ch(up(o.frames[o.frames.length - 2].dDepth), 0), w: D4, h: D4, threshold: o.threshold, nearerIsLess: true });
        const mI = ch(up(o.invalidMask), 0); let wI = 0, topOnes = 0;
        for (let i = 0; i < D4 * D4; i++) { wI = Math.max(wI, Math.abs(mI[i] - refI.data[i])); if (i < D4 * D4 / 4 && mI[i] === 1) topOnes++; }
        ok(`  [${mode}] ...and a field whose top quarter is INVALID is flagged there, all ${topOnes} of ${D4 * D4 / 4}, as the mirror flags it -- worst ${wI}`, wI === 0 && topOnes === D4 * D4 / 4, "no reprojection is no history, whatever the depth says");
    }
}


// ---- SABOTAGE LOGS ---------------------------------------------------------------------------------------------
// ---- v4729 SABOTAGE LOG -- taken in render/temporalTsl-selfcheck.mjs, RE-TAKEN HERE after the v4730 split: identical,
// all eleven. And the split's own row: S1, disocclusionNode taking any threshold -> 1 red. ----------------------------------------------------------------------------------------
//   C1  the tie rule lets an equal neighbour win      -> 2      C7  the threshold ignored                    -> 6
//   C2  off-frame neighbours allowed to win           -> 2      C8  invalid motion not flagged               -> 2
//   C3  dilation keeps the FARTHEST                   -> 2      C9  the factor is the mask, not 1 - mask     -> 2
//   C4  motion from the centre, depth from the best   -> 2      C10 clipGapThreshold a half, not a quarter   -> 1
//   C5  the disocclusion gap's sign flipped           -> 6      C11 the reprojected texel rounded, not floored -> 2
//   C6  the offscreen test dropped                    -> 6
// *** THE FIXTURE WAS GROWN BEFORE THESE RAN, ON REASONING RATHER THAN ON AN OBSERVED 0-RED -- SAID SO RATHER THAN
// CLAIMED AS A CATCH. *** The first scene (a flat wall, a static camera) left three rules with no population: on a
// wall of constant depth the tied neighbours carry IDENTICAL motion, so C1 could not show; with nothing moving at the
// frame's edge an off-frame read loads the same zero, so C2 could not; and with the far plane completed nothing is
// invalid, so C8 could not. The spinning face-on square, the tilted wall under a moving camera and the invalid
// quarter are for those three, and each reddens both backends.
console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nALL GREEN");
console.log("unchecked here: a REVERSED-Z camera (nearerIsLess false), which three can build and this gate never draws; and a threshold for a " +
    "scene whose surfaces are not two the caller can name -- clipGapThreshold needs a near and a far point.");
process.exitCode = fails ? 1 : 0;
