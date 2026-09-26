#!/usr/bin/env node
// WebGLEngine/render/temporalTsl-selfcheck.mjs -- v4727 (the depth clip and the lock ring moved to their own gates at v4730)
//
// THE TEMPORAL CHAIN FOR A THREE.JS SCENE, HELD TO THE CPU REFERENCES render/ ALREADY HAS -- one pass per round,
// and this gate grows with them. v4727 is the INPUTS: the jitter written into a three.js camera, and the motion
// field (du, dv, valid, zPrev) every later pass reads.
//
// The scene is a static floor, a box that MOVES AND TURNS, and a background -- three kinds of pixel, because the
// field is written three ways: the box by its own previous model matrix, the floor by the camera's alone, and the
// background by the far plane's completion. Each is held to the reference that owns that question:
//   background -> render/motionVectors.mjs's motionVectorsCPU, the SAME arithmetic, so float rounding only
//   surfaces   -> render/objectMotion.mjs's objectMotionCPU over the device's own depth and an id buffer, which
//                 reconstructs the point from depth where the node carries it from the vertex -- two routes to one
//                 answer, and the gap between them is stated in display pixels
// and the jitter's SENSE is measured the way fsr.html measured it: a smooth three.js scene rendered at half size,
// resolved with render/temporalResolve.mjs, against the full-size render.
"use strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runInEngineOrigin, webgpuSkipReason } from "../tools/ship/webgpuHarness.mjs";
import { motionVectorsCPU, mat4Invert } from "./motionVectors.mjs";
import { buildObjectMatrices, objectMotionCPU } from "./objectMotion.mjs";
import { resolveJitterAwareCPU } from "./temporalResolve.mjs";
import { rectifiedAccumulateCPU } from "./temporalReject.mjs";
import * as TT from "./temporalTsl.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let fails = 0;
const ok = (label, cond, detail) => { if (!cond) fails++; console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "   " + detail : ""}`); };
const report = (s) => console.log(`  ----  ${s}`);
const D = 32, R = 16, DT = 64;
const RS3 = 32, DS3 = 64, CONV3 = 32;   // v4728: render 32 -> display 64, and every one of the 32 jitter phases at 2x   // the motion field at 32x32; the jitter's sense at 32 -> 64 (multiples of 16: WebGPU pads float readback rows to 256 bytes)

console.log("\n1. WITHOUT A DEVICE: the refusals and the depth mapping");
{
    let named = null; try { TT.makeMotionNode({ VelocityNode: function () {} }, {}); } catch (e) { named = String(e.message); }
    ok("a TSL namespace missing a name is refused BY THAT NAME", named !== null && /has no Fn\b/.test(named), named || "no throw");
    const stand = Object.fromEntries(TT.TEMPORAL_TSL_NEEDS.map((k) => [k, () => {}]));
    let noVel = null; try { TT.makeMotionNode({}, stand); } catch (e) { noVel = String(e.message); }
    ok("  and a three build with no VelocityNode is refused by that name", noVel !== null && /no VelocityNode/.test(noVel), noVel || "no throw");
    let cn = null; try { TT.motionCompleteNodes({}, {}, null, null, { w: 1, h: 1, gl: false }); } catch (e) { cn = String(e.message); }
    ok("  and so is motionCompleteNodes, the far plane's completion", cn !== null && /has no Fn\b/.test(cn), cn || "no throw");
    // v4728: the resolve and the accumulate need more of TSL than the inputs do, and ask for it by name
    const standIn = Object.fromEntries(TT.TEMPORAL_TSL_NEEDS.map((k) => [k, () => {}]));
    const rr = [() => TT.resolveNode(standIn, null, { rw: 1, rh: 1, dw: 1, dh: 1 }), () => TT.accumulateNode(standIn, {}, { w: 1, h: 1 })]
        .map((f) => { try { f(); return "no throw"; } catch (e) { return String(e.message); } });
    let rq = null; try { TT.requireTsl(standIn); } catch (e) { rq = String(e.message); }
    ok("  v4730: requireTsl, the check the split-out temporal modules share, refuses the same namespace by the same name", rq !== null && rq.endsWith(`has no ${TT.RESOLVE_TSL_NEEDS[0]}`), rq || "no throw");
    ok(`  v4728: the resolve and the accumulate refuse a namespace without ${TT.RESOLVE_TSL_NEEDS[0]}() by that name`,
       rr.every((m) => m.endsWith(`has no ${TT.RESOLVE_TSL_NEEDS[0]}`)), rr.join(" | "));
    ok("clipDepth maps window depth to WebGL's [-1, 1] and leaves WebGPU's [0, 1] alone",
       TT.clipDepth(0, true) === -1 && TT.clipDepth(1, true) === 1 && TT.clipDepth(0.25, true) === -0.5 &&
       TT.clipDepth(0.25, false) === 0.25, "0 -> -1, 1 -> 1, 0.25 -> -0.5 on WebGL; identity on WebGPU");
}

console.log("\n2. ON THE DEVICE: the motion field of a three.js scene, on both backends");
const skip = webgpuSkipReason();
if (skip) { console.log(`  SKIP  ${skip}`); report("*** NOT A PASS. *** Section 1 is static; nothing here has rendered a field."); fails++; }
else {
    const r = await runInEngineOrigin({ engineRoot: ENG, timeoutMs: 180000, args: { D, R, DT }, script: `async (a) => {
        const THREE = await import("/vendor/three-webgpu/three.webgpu.js"); const T = await import("/vendor/three-webgpu/three.tsl.js");
        const TT = await import("/render/temporalTsl.mjs"); const J = await import("/render/jitter.mjs");
        const out = {};
        const flatT = (n) => new THREE.RenderTarget(n, n, { type: THREE.FloatType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
        for (const mode of ["webgpu", "webgl2"]) {
            try {
                const canvas = document.createElement("canvas"); canvas.width = a.DT; canvas.height = a.DT;
                const renderer = new THREE.WebGPURenderer({ canvas, forceWebGL: mode === "webgl2", antialias: false }); await renderer.init();
                const gl = TT.glClip(THREE, renderer), o = { gl };
                // ---- the field: a static floor, a box that moves AND turns, a background ----
                const scene = new THREE.Scene(); scene.background = new THREE.Color(0.1, 0.2, 0.3);
                const box = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicNodeMaterial({ color: 0xff8800 })); scene.add(box);
                const floor = new THREE.Mesh(new THREE.PlaneGeometry(3, 3), new THREE.MeshBasicNodeMaterial({ color: 0x3355aa }));
                floor.rotation.x = -1.2; floor.position.set(0, -0.9, -1); scene.add(floor);
                const cam = new THREE.PerspectiveCamera(50, 1, 0.5, 20);
                const pose = (t) => { cam.position.set(0.3 * t, 0.2 + 0.1 * t, 4 - 0.4 * t); cam.lookAt(0, 0, 0); cam.updateMatrixWorld();
                    box.position.set(0.25 * t, 0.1 * t, 0); box.rotation.set(0.4 + 0.3 * t, 0.6 - 0.2 * t, 0.1 * t); box.updateMatrixWorld(); floor.updateMatrixWorld(); };
                const st = TT.makeMotionStage(THREE, T, { w: a.D, h: a.D, gl });
                const vpOf = () => Array.from(new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse).elements);
                pose(0); await st.render(renderer, scene, cam);
                o.hist0 = st.hasHistory;
                o.m0 = Array.from(await renderer.readRenderTargetPixelsAsync(st.motion, 0, 0, a.D, a.D));
                o.vp0 = vpOf(); o.box0 = Array.from(box.matrixWorld.elements); o.floorM = Array.from(floor.matrixWorld.elements);
                pose(1); await st.render(renderer, scene, cam);
                o.hist1 = st.hasHistory;
                // graded on the THIRD frame against the second: a stage that kept the first frame's object matrix
                // or camera would be right on frame two and wrong here
                o.vp1 = vpOf(); o.box1 = Array.from(box.matrixWorld.elements);
                pose(2); await st.render(renderer, scene, cam);
                o.vp2 = vpOf(); o.box2 = Array.from(box.matrixWorld.elements);
                o.m1 = Array.from(await renderer.readRenderTargetPixelsAsync(st.motion, 0, 0, a.D, a.D));
                o.z1 = Array.from(await renderer.readRenderTargetPixelsAsync(st.depth, 0, 0, a.D, a.D));
                // the TURNAROUND: the camera faces a wall that was BEHIND the previous eye -- every pixel, wall and
                // sky, has no answer, and the reference says so too
                const wall = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.MeshBasicNodeMaterial({ color: 0x44aa44 }));
                wall.position.set(0, 0, 9); wall.rotation.y = Math.PI; wall.updateMatrixWorld(); scene.add(wall);
                cam.position.set(0, 0.3, 5); cam.lookAt(0, 0.3, 12); cam.updateMatrixWorld();
                await st.render(renderer, scene, cam);
                o.vpT = vpOf(); o.wallM = Array.from(wall.matrixWorld.elements);
                o.mT = Array.from(await renderer.readRenderTargetPixelsAsync(st.motion, 0, 0, a.D, a.D));
                o.zT = Array.from(await renderer.readRenderTargetPixelsAsync(st.depth, 0, 0, a.D, a.D));
                scene.remove(wall); pose(2);
                // the id buffer: the box alone, through the same camera
                floor.visible = false; const bg = scene.background; scene.background = null;
                const ids = flatT(a.D); renderer.setRenderTarget(ids); renderer.setClearColor(0x000000, 0); await renderer.renderAsync(scene, cam);
                o.ids = Array.from(await renderer.readRenderTargetPixelsAsync(ids, 0, 0, a.D, a.D));
                floor.visible = true; scene.background = bg;
                st.dispose();

                // ---- the jitter's sense: a smooth scene, rendered small and jittered, resolved, against the full render ----
                const sm = new THREE.Scene();
                const mat = new THREE.MeshBasicNodeMaterial();
                mat.colorNode = T.Fn(() => { const p = T.positionWorld; return T.vec3(T.sin(p.x.mul(3.1)).mul(0.5).add(0.5), T.sin(p.y.mul(2.3).add(p.x)).mul(0.5).add(0.5), 0.5); })();
                sm.add(new THREE.Mesh(new THREE.PlaneGeometry(6, 6), mat));
                const oc = new THREE.PerspectiveCamera(45, 1, 0.5, 20); oc.position.set(0, 0, 4); oc.lookAt(0, 0, 0); oc.updateMatrixWorld(); oc.updateProjectionMatrix();
                const base = oc.projectionMatrix.clone();
                const drawAt = async (n) => { const t = flatT(n); renderer.setRenderTarget(t); await renderer.renderAsync(sm, oc); return Array.from(await renderer.readRenderTargetPixelsAsync(t, 0, 0, n, n)); };
                const j = J.jitterSequence(8)[2];
                o.jit = j;
                o.truth = await drawAt(a.DT);
                o.low0 = await drawAt(a.R * 2);
                TT.applyJitter(oc, base, j[0], j[1], a.R * 2, a.R * 2); o.lowJ = await drawAt(a.R * 2);
                // the OTHER sense, spelt out: jitterProjection's +j, which the resolve does not expect
                oc.projectionMatrix.fromArray(J.jitterProjection(base.elements, j[0], j[1], a.R * 2, a.R * 2)); oc.projectionMatrixInverse.copy(oc.projectionMatrix).invert();
                o.lowWrong = await drawAt(a.R * 2);
                TT.restoreProjection(oc, base);
                o.restored = oc.projectionMatrix.equals(base);
                out[mode] = o;
                renderer.dispose();
            } catch (err) { out[mode] = { err: String(err && err.stack || err).slice(0, 700) }; }
        }
        return out;
    }` });
    ok("the harness rendered the field on BOTH of three's backends", r.ok && r.result && !r.result.webgpu.err && !r.result.webgl2.err,
       r.ok ? `webgpu ${r.result.webgpu.err || "ok"}; webgl2 ${r.result.webgl2.err || "ok"}` : (r.reason || (r.pageErrors || []).join("; ")));
    if (r.ok && r.result) for (const mode of ["webgpu", "webgl2"]) {
        const o = r.result[mode]; if (!o || o.err) continue;
        const up = (px, n) => { if (mode === "webgpu") return px; const f = []; for (let y = n - 1; y >= 0; y--) f.push(...px.slice(y * n * 4, (y + 1) * n * 4)); return f; };
        const lens = [o.m0, o.m1, o.z1, o.ids, o.mT, o.zT].every((p) => p.length === D * D * 4) && [o.truth].every((p) => p.length === DT * DT * 4) &&
                     [o.low0, o.lowJ, o.lowWrong].every((p) => p.length === R * 2 * R * 2 * 4);
        ok(`[${mode}] every readback is exactly w*h*4 floats`, lens, lens ? "" : "a length is off: a padded readback");
        if (!lens) continue;
        const m0 = up(o.m0, D), m1 = up(o.m1, D), z1 = up(o.z1, D), idb = up(o.ids, D);
        const depth = new Float32Array(D * D), ids = new Int32Array(D * D);
        const FAR = o.gl ? 1 : 1;   // the far plane's clip z in either convention
        let nBg = 0, nBox = 0, nFloor = 0;
        for (let i = 0; i < D * D; i++) {
            depth[i] = z1[i * 4];
            const isBg = depth[i] >= FAR - 1e-7;
            ids[i] = isBg ? 2 : idb[i * 4 + 3] > 0.5 ? 1 : 0;
            if (isBg) nBg++; else if (ids[i] === 1) nBox++; else nFloor++;
        }
        ok(`[${mode}] the scene has all three kinds of pixel -- ${nBox} box, ${nFloor} floor, ${nBg} background`, nBox > 40 && nFloor > 40 && nBg > 40, `${nBox}/${nFloor}/${nBg} of ${D * D}`);
        // frame one: no previous frame, so every surface is its own previous and the stage says so
        let z0 = 0; for (let i = 0; i < D * D; i++) if (ids[i] !== 2) z0 = Math.max(z0, Math.abs(m0[i * 4]), Math.abs(m0[i * 4 + 1]));
        ok(`[${mode}] frame one's field is zero on every surface and the stage reports no history; frame two's does`, o.hist0 === false && o.hist1 === true && z0 < 1e-6,
           `worst |motion| on frame one ${z0.toExponential(2)}; hasHistory ${o.hist0} then ${o.hist1}`);

        // background: the completion is motionVectorsCPU's own arithmetic on the far plane
        // the graded frame is the THIRD; its previous is the second
        const vp0 = new Float32Array(o.vp1), vp1 = new Float32Array(o.vp2);
        const cam = motionVectorsCPU(depth, D, D, mat4Invert(vp1), vp0).data;
        let wBg = 0, bgValid = 0;
        for (let i = 0; i < D * D; i++) if (ids[i] === 2) { for (let c = 0; c < 4; c++) wBg = Math.max(wBg, Math.abs(m1[i * 4 + c] - cam[i * 4 + c])); if (m1[i * 4 + 2] === 1) bgValid++; }
        ok(`*** [${mode}] the BACKGROUND's motion is motionVectorsCPU on the far plane, all four channels, to ${wBg.toExponential(2)} -- ${bgValid} of ${nBg} valid ***`,
           wBg < 1e-5 && bgValid === nBg, `worst ${wBg.toExponential(3)} in UV and clip z; a sky left invalid would never accumulate`);

        // surfaces: objectMotionCPU over the device's own depth and ids, the floor and the box each with their own matrices
        const mats = buildObjectMatrices({ vpCur: vp1, vpPrev: vp0, models: [new Float32Array(o.floorM), new Float32Array(o.box2)],
                                           prevModels: [new Float32Array(o.floorM), new Float32Array(o.box1)] });
        const obj = objectMotionCPU({ depth, ids, w: D, h: D, invMVPCur: mats.invMVPCur, mvpPrev: mats.mvpPrev }).data;
        let wUV = 0, wZ = 0, surfValid = 0, nSurf = 0;
        for (let i = 0; i < D * D; i++) if (ids[i] !== 2) { nSurf++;
            wUV = Math.max(wUV, Math.abs(m1[i * 4] - obj[i * 4]), Math.abs(m1[i * 4 + 1] - obj[i * 4 + 1]));
            wZ = Math.max(wZ, Math.abs(m1[i * 4 + 3] - obj[i * 4 + 3])); if (m1[i * 4 + 2] === 1) surfValid++; }
        // *** THE BOUNDS ARE IN THE UNITS THE CONSUMERS READ, BECAUSE THE FIRST ONES WERE TYPED. *** This row was
        // first written at 0.01 px and 1e-4 of clip z, and WebGL2 failed it at 1.07e-4 -- exactly twice WebGPU's
        // 5.35e-5, because it is the SAME window-depth gap and WebGL's clip range is twice as wide. So zPrev is held
        // as a fraction of the clip range (the gap is backend-independent there), and the vector at a twentieth of a
        // display pixel: the history fetch is bilinear, and a twentieth moves a tap's weight by 5%. What the row
        // exists to catch is pixels, not twentieths -- a field without the object's motion is 3.38 px off on this
        // box, and a sign error twice the motion.
        const zRange = o.gl ? 2 : 1;
        ok(`*** [${mode}] every SURFACE's motion is objectMotionCPU's to ${(wUV * D).toFixed(4)} of a display pixel, zPrev to ${(wZ / zRange).toExponential(2)} of the clip range -- the node carries the point from the vertex, the reference unprojects it from depth ***`,
           wUV * D < 0.05 && wZ / zRange < 1e-4 && surfValid === nSurf,
           `worst ${wUV.toExponential(3)} UV and ${wZ.toExponential(3)} clip z over ${nSurf} surface pixels, all ${surfValid} valid. three's own VelocityNode read the same way, before this module existed, agreed with motionVectorsCPU to 9.7e-5 UV at this size on a still box`);
        // the control: the box carries ITS OWN motion. Camera-only motion there is a different field.
        let boxGap = 0; for (let i = 0; i < D * D; i++) if (ids[i] === 1) boxGap = Math.max(boxGap, Math.hypot(m1[i * 4] - cam[i * 4], m1[i * 4 + 1] - cam[i * 4 + 1]));
        let floorGap = 0; for (let i = 0; i < D * D; i++) if (ids[i] === 0) floorGap = Math.max(floorGap, Math.hypot(m1[i * 4] - cam[i * 4], m1[i * 4 + 1] - cam[i * 4 + 1]));
        ok(`  [${mode}] ...and it is the BOX's motion on the box: ${(boxGap * D).toFixed(2)} px away from camera-only motion there, ${(floorGap * D).toFixed(4)} px on the static floor`,
           boxGap * D > 1 && floorGap * D < 0.01, "a node that ignored the object's previous matrix would read camera-only motion on the box and pass the rows above only where nothing moves");

        // the turnaround: the reference, on the device's own depth, says which pixels have no answer
        const mT = up(o.mT, D), zT = up(o.zT, D), dT = new Float32Array(D * D);
        for (let i = 0; i < D * D; i++) dT[i] = zT[i * 4];
        const refT = motionVectorsCPU(dT, D, D, mat4Invert(new Float32Array(o.vpT)), vp1).data;
        let tNode = 0, tRef = 0, tAgree = 0, tWall = 0;
        for (let i = 0; i < D * D; i++) { if (mT[i * 4 + 2] === 0) tNode++; if (refT[i * 4 + 2] === 0) tRef++;
            if ((mT[i * 4 + 2] === 0) === (refT[i * 4 + 2] === 0)) tAgree++; if (dT[i] < 1 - 1e-7) tWall++; }
        ok(`*** [${mode}] after a TURNAROUND every pixel was behind the previous eye: the node marks ${tNode} of ${D * D} invalid, the reference ${tRef}, agreeing on ${tAgree} -- ${tWall} of them the wall ***`,
           tRef === D * D && tNode === D * D && tWall > 100 && D * D - tWall > 100,
           `motionVectorsCPU's w <= 0 rule on both halves of the field -- the surfaces' node on the wall and the far plane's completion on the ${D * D - tWall} sky pixels around it`);

        // the jitter's sense
        const n = R * 2, rms = (a, b) => { let s = 0; for (let i = 0; i < DT * DT; i++) for (let c = 0; c < 3; c++) s += (a[i * 4 + c] - b[i * 4 + c]) ** 2; return Math.sqrt(s / (DT * DT * 3)); };
        const truth = up(o.truth, DT), res = (src, j) => resolveJitterAwareCPU({ src: new Float32Array(up(src, n)), rw: n, rh: n, dw: DT, dh: DT, jitter: j }).data;
        const floorE = rms(res(o.low0, [0, 0]), truth), right = rms(res(o.lowJ, o.jit), truth), wrong = rms(res(o.lowWrong, o.jit), truth);
        ok(`*** [${mode}] applyJitter's sense is the resolve's: jittered by [${o.jit.map((v) => v.toFixed(3)).join(", ")}] and resolved, ${right.toExponential(2)} rms against the full render -- the unjittered floor is ${floorE.toExponential(2)} and jitterProjection's own sense reads ${wrong.toExponential(2)} ***`,
           right < floorE * 1.5 && wrong > right * 3, `right/floor ${(right / floorE).toFixed(2)}, wrong/right ${(wrong / right).toFixed(1)} -- fsr.html measured 1.03e-3 against a floor of 8.42e-4 and 8.21e-3 the wrong way`);
        ok(`  [${mode}] ...and restoreProjection hands the camera back its unjittered projection`, o.restored === true, String(o.restored));
    }
}

console.log("\n3. v4728 -- THE RESOLVE AND THE ACCUMULATE, frame by frame on a moving scene, and converging on a still one");
if (!skip) {
    const N = 12, RS = 32, DS = 64, CONV = 32;
    const r = await runInEngineOrigin({ engineRoot: ENG, timeoutMs: 240000, args: { N, RS, DS, CONV }, script: `async (a) => {
        const THREE = await import("/vendor/three-webgpu/three.webgpu.js"); const T = await import("/vendor/three-webgpu/three.tsl.js");
        const TT = await import("/render/temporalTsl.mjs"); const J = await import("/render/jitter.mjs");
        const out = {};
        const tgt = (n) => new THREE.RenderTarget(n, n, { type: THREE.FloatType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
        const quad = (node) => { const m = new THREE.NodeMaterial(); m.fragmentNode = node; m.blending = THREE.NoBlending; m.depthTest = false; m.depthWrite = false;
            const s = new THREE.Scene(); s.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), m)); return s; };
        const ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
        for (const mode of ["webgpu", "webgl2"]) {
            try {
                const canvas = document.createElement("canvas"); canvas.width = a.DS; canvas.height = a.DS;
                const renderer = new THREE.WebGPURenderer({ canvas, forceWebGL: mode === "webgl2", antialias: false }); await renderer.init();
                const gl = TT.glClip(THREE, renderer), o = { frames: [] };
                const read = async (t, n) => Array.from(await renderer.readRenderTargetPixelsAsync(t, 0, 0, n, n));
                const draw = async (sc, t) => { renderer.setRenderTarget(t); await renderer.renderAsync(sc, ortho); };
                // stripes, a moving box, a background: detail the render resolution cannot carry, and motion
                const scene = new THREE.Scene(); scene.background = new THREE.Color(0.05, 0.08, 0.12);
                const st = new THREE.MeshBasicNodeMaterial();
                st.colorNode = T.Fn(() => { const s = T.sin(T.uv().x.mul(90.0).add(T.uv().y.mul(21.0))).mul(0.5).add(0.5); return T.mix(T.vec3(0.1, 0.12, 0.2), T.vec3(0.95, 0.75, 0.3), s); })();
                const floor = new THREE.Mesh(new THREE.PlaneGeometry(4, 4), st); floor.rotation.x = -1.1; floor.position.set(0, -0.6, -0.5); scene.add(floor);
                const box = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.8, 0.8), new THREE.MeshNormalNodeMaterial()); scene.add(box);
                const cam = new THREE.PerspectiveCamera(45, 1, 0.5, 20); cam.position.set(0, 0.4, 3.6); cam.lookAt(0, 0, 0); cam.updateMatrixWorld(); cam.updateProjectionMatrix();
                const base = cam.projectionMatrix.clone();
                const colour = tgt(a.RS), resolved = tgt(a.DS);
                let histA = tgt(a.DS), histB = tgt(a.DS);
                const stage = TT.makeMotionStage(THREE, T, { w: a.DS, h: a.DS, gl });
                const rs = TT.resolveNode(T, colour.texture, { rw: a.RS, rh: a.RS, dw: a.DS, dh: a.DS }), rsScene = quad(rs.node);
                // two accumulate graphs, one per ping-pong direction -- a node binds its textures when it is built
                const accAB = TT.accumulateNode(T, { current: resolved.texture, history: histA.texture, motion: stage.motion.texture }, { w: a.DS, h: a.DS, alpha: 0.1 });
                const accBA = TT.accumulateNode(T, { current: resolved.texture, history: histB.texture, motion: stage.motion.texture }, { w: a.DS, h: a.DS, alpha: 0.1 });
                const scAB = quad(accAB.node), scBA = quad(accBA.node);
                const seq = J.jitterSequence(J.jitterPhaseCount(2));
                let intoB = true;
                const step = async (k, t, keep) => {
                    box.position.set(0.3 * Math.sin(t), 0.1 * t, 0); box.rotation.set(0.5 * t, 0.7 * t, 0); box.updateMatrixWorld();
                    cam.position.set(0.15 * t, 0.4, 3.6 - 0.05 * t); cam.lookAt(0, 0, 0); cam.updateMatrixWorld();
                    const [jx, jy] = seq[k % seq.length];
                    TT.applyJitter(cam, base, jx, jy, a.RS, a.RS); renderer.setRenderTarget(colour); await renderer.renderAsync(scene, cam); TT.restoreProjection(cam, base);
                    await stage.render(renderer, scene, cam);
                    rs.uniforms.jx.value = jx; rs.uniforms.jy.value = jy; await draw(rsScene, resolved);
                    const acc = intoB ? accAB : accBA; acc.uniforms.hasHistory.value = k > 0 ? 1 : 0; acc.uniforms.alpha.value = keep.alpha(k);
                    await draw(intoB ? scAB : scBA, intoB ? histB : histA);
                    const now = intoB ? histB : histA; intoB = !intoB;
                    if (keep.read) o.frames.push({ jitter: [jx, jy], colour: await read(colour, a.RS), motion: await read(stage.motion, a.DS),
                                                  resolved: await read(resolved, a.DS), acc: await read(now, a.DS), alpha: keep.alpha(k) });
                    return now;
                };
                for (let k = 0; k < a.N; k++) await step(k, k * 0.35, { read: true, alpha: () => 0.1 });
                // the factor: the last frame's inputs again, through the ABOUT-TO-BE-WRITTEN direction, with a factor texture
                const fData = new Float32Array(a.DS * a.DS * 4);
                for (let y = 0; y < a.DS; y++) for (let x = 0; x < a.DS; x++) { const v = x < a.DS / 3 ? 0 : x < 2 * a.DS / 3 ? 0.5 : 1; fData[(y * a.DS + x) * 4] = v; fData[(y * a.DS + x) * 4 + 3] = 1; }
                const fTex = new THREE.DataTexture(fData, a.DS, a.DS, THREE.RGBAFormat, THREE.FloatType); fTex.needsUpdate = true;
                const prevHist = intoB ? histA : histB, fOut = tgt(a.DS);
                // and the field's top quarter marked INVALID, so the accumulate's valid test has pixels to act on --
                // every pixel of the moving run above is valid, the sky included
                const mSyn = tgt(a.DS);
                await draw(quad(T.Fn(() => { const m = T.textureLoad(stage.motion.texture, T.ivec2(T.int(T.screenCoordinate.x), T.int(T.screenCoordinate.y)));
                    return T.select(T.screenCoordinate.y.lessThan(a.DS / 4), T.vec4(m.x, m.y, 0.0, m.w), m); })()), mSyn);
                const accF = TT.accumulateNode(T, { current: resolved.texture, history: prevHist.texture, motion: mSyn.texture, factor: fTex }, { w: a.DS, h: a.DS, alpha: 0.1 });
                accF.uniforms.hasHistory.value = 1; await draw(quad(accF.node), fOut);
                o.factorIn = { history: await read(prevHist, a.DS) }; o.factorOut = await read(fOut, a.DS); o.factor = Array.from(fData);
                // CONVERGENCE: a still camera, every jitter phase, the running mean -- against a supersampled truth
                box.visible = false; cam.position.set(0, 0.4, 3.6); cam.lookAt(0, 0, 0); cam.updateMatrixWorld();
                const still = { read: false, alpha: (k) => 1 / (k + 1) };
                let last = null, firstResolved = null; const convColour = [], convJ = [];
                for (let k = 0; k < a.CONV; k++) { last = await step(k, 0, still); if (k === 0) firstResolved = await read(resolved, a.DS);
                    convColour.push(await read(colour, a.RS)); convJ.push(seq[k % seq.length]); }
                o.conv = { acc: await read(last, a.DS), first: firstResolved, colour: convColour, jitter: convJ, motion: await read(stage.motion, a.DS) };
                const big = tgt(a.DS * 4); renderer.setRenderTarget(big); await renderer.renderAsync(scene, cam); o.truth4 = await read(big, a.DS * 4);
                stage.dispose(); out[mode] = o; renderer.dispose();
            } catch (err) { out[mode] = { err: String(err && err.stack || err).slice(0, 700) }; }
        }
        return out;
    }` });
    ok("[v4728] the harness ran the resolve and the accumulate on BOTH backends", r.ok && r.result && !r.result.webgpu.err && !r.result.webgl2.err,
       r.ok ? `webgpu ${r.result.webgpu.err || "ok"}; webgl2 ${r.result.webgl2.err || "ok"}` : (r.reason || (r.pageErrors || []).join("; ")));
    if (r.ok && r.result) for (const mode of ["webgpu", "webgl2"]) {
        const o = r.result[mode]; if (!o || o.err) continue;
        const up = (px, n) => { if (mode === "webgpu") return px; const f = []; for (let y = n - 1; y >= 0; y--) f.push(...px.slice(y * n * 4, (y + 1) * n * 4)); return f; };
        const F = o.frames.map((f) => ({ jitter: f.jitter, alpha: f.alpha, colour: new Float32Array(up(f.colour, RS3)), motion: new Float32Array(up(f.motion, DS3)),
                                         resolved: new Float32Array(up(f.resolved, DS3)), acc: new Float32Array(up(f.acc, DS3)) }));
        const worst3 = (a, b) => { let w = 0; for (let i = 0; i < DS3 * DS3; i++) for (let c = 0; c < 3; c++) { const d = Math.abs(a[i * 4 + c] - b[i * 4 + c]); if (!(d <= w)) w = d; } return w; };
        let wRes = 0, wAcc = 0, moved = 0;
        for (let k = 0; k < F.length; k++) {
            wRes = Math.max(wRes, worst3(F[k].resolved, resolveJitterAwareCPU({ src: F[k].colour, rw: RS3, rh: RS3, dw: DS3, dh: DS3, jitter: F[k].jitter }).data));
            const ref = rectifiedAccumulateCPU({ current: F[k].resolved, history: k ? F[k - 1].acc : null, motion: F[k].motion, w: DS3, h: DS3, alpha: F[k].alpha, space: "ycocg" }).data;
            wAcc = Math.max(wAcc, worst3(F[k].acc, ref));
            for (let i = 0; i < DS3 * DS3; i++) if (F[k].motion[i * 4 + 2] && Math.hypot(F[k].motion[i * 4], F[k].motion[i * 4 + 1]) * DS3 > 0.25) { moved++; break; }
        }
        // the resolve is held where render/temporalResolve-selfcheck.mjs holds the WGSL form of the same kernel: a fiftieth
        // of an 8-bit level. It was first written at 1e-5 and read 1.49e-5 -- nine sin() taps in f32 against f64.
        ok(`*** [${mode}] the node's RESOLVE is resolveJitterAwareCPU on every one of ${F.length} jittered frames, worst ${wRes.toExponential(2)} (${(wRes * 255).toExponential(1)} of an 8-bit level) ***`,
           wRes < 1 / 255 / 50, `worst ${wRes.toExponential(3)} over ${F.length} frames of ${DS3}x${DS3}; the WGSL kernel's gate holds it to the same LSB/50`);
        ok(`*** [${mode}] the node's ACCUMULATE is rectifiedAccumulateCPU on every frame, fed the device's own inputs, worst ${wAcc.toExponential(2)} ***`, wAcc < 1e-5 && moved === F.length - 1,
           `worst ${wAcc.toExponential(3)}; ${moved} of ${F.length} frames carry motion over a quarter pixel (frame one is its own previous), so the reprojection is exercised and not a copy`);
        ok(`  [${mode}] ...and frame one, with no history, IS the resolved frame`, worst3(F[0].acc, F[0].resolved) === 0, `worst ${worst3(F[0].acc, F[0].resolved)}`);
        // the whole chain on the CPU from the device's RENDERS alone -- drift across twelve frames, not per-frame parity
        let hist = null;
        for (const f of F) { const cur = resolveJitterAwareCPU({ src: f.colour, rw: RS3, rh: RS3, dw: DS3, dh: DS3, jitter: f.jitter }).data;
            hist = rectifiedAccumulateCPU({ current: cur, history: hist, motion: f.motion, w: DS3, h: DS3, alpha: f.alpha, space: "ycocg" }).data; }
        const wChain = worst3(F[F.length - 1].acc, hist);
        ok(`  [${mode}] ...and the chain run wholly on the CPU from the device's renders lands on the device's picture after ${F.length} frames, worst ${wChain.toExponential(2)}`, wChain < 1e-4, `worst ${wChain.toExponential(3)} -- the accumulate is a contraction, so f32 error does not grow`);
        const fOut = new Float32Array(up(o.factorOut, DS3)), fHist = new Float32Array(up(o.factorIn.history, DS3)), last = F[F.length - 1];
        const fac = new Float32Array(DS3 * DS3); const fr = up(o.factor, DS3); for (let i = 0; i < DS3 * DS3; i++) fac[i] = fr[i * 4];
        const mSyn = Float32Array.from(last.motion); let nInvalid = 0;
        for (let y = 0; y < DS3 / 4; y++) for (let x = 0; x < DS3; x++) { mSyn[(y * DS3 + x) * 4 + 2] = 0; nInvalid++; }
        const refF = rectifiedAccumulateCPU({ current: last.resolved, history: fHist, motion: mSyn, factor: fac, w: DS3, h: DS3, alpha: 0.1, space: "ycocg" }).data;
        const noF = rectifiedAccumulateCPU({ current: last.resolved, history: fHist, motion: last.motion, w: DS3, h: DS3, alpha: 0.1, space: "ycocg" }).data;
        const wF = worst3(fOut, refF), gapF = worst3(refF, noF);
        let takeTop = 0; for (let i = 0; i < nInvalid; i++) if (Math.abs(fOut[i * 4] - last.resolved[i * 4]) < 1e-6) takeTop++;
        ok(`  [${mode}] ...and a FACTOR texture and an INVALID quarter act as the mirror's do, worst ${wF.toExponential(2)} -- ${gapF.toFixed(3)} away from neither, ${takeTop} of ${nInvalid} invalid pixels the current frame`,
           wF < 1e-5 && gapF > 0.01 && takeTop === nInvalid, "factor 0 on the left third (the current frame), 0.5 in the middle, 1 on the right; valid = 0 on the top quarter");
        // convergence: the running mean of every phase against a 4x4-supersampled truth
        const t4 = up(o.truth4, DS3 * 4), truth = new Float32Array(DS3 * DS3 * 4);
        for (let y = 0; y < DS3; y++) for (let x = 0; x < DS3; x++) for (let c = 0; c < 3; c++) { let sum = 0;
            for (let sy = 0; sy < 4; sy++) for (let sx = 0; sx < 4; sx++) sum += t4[((y * 4 + sy) * DS3 * 4 + x * 4 + sx) * 4 + c]; truth[(y * DS3 + x) * 4 + c] = sum / 16; }
        const rms = (a) => { let q = 0; for (let i = 0; i < DS3 * DS3; i++) for (let c = 0; c < 3; c++) q += (a[i * 4 + c] - truth[i * 4 + c]) ** 2; return Math.sqrt(q / (DS3 * DS3 * 3)); };
        const eAcc = rms(up(o.conv.acc, DS3)), eOne = rms(up(o.conv.first, DS3));
        // the SAME renders replayed on the CPU without the neighbourhood clamp -- what the clamp costs on detail finer
        // than the render resolution, which is the question FSR2's locks answer (render/temporalLock.mjs; a later round)
        const mo = new Float32Array(up(o.conv.motion, DS3));
        let hNo = null; o.conv.colour.forEach((c, k) => { const cur = resolveJitterAwareCPU({ src: new Float32Array(up(c, RS3)), rw: RS3, rh: RS3, dw: DS3, dh: DS3, jitter: o.conv.jitter[k] }).data;
            hNo = rectifiedAccumulateCPU({ current: cur, history: hNo, motion: mo, w: DS3, h: DS3, alpha: 1 / (k + 1), space: "ycocg", clampToNeighbourhood: false }).data; });
        const eNo = rms(hNo);
        // *** MEASURED, NOT PREDICTED: THE CLAMP TAKES HALF THE GAIN. *** The first draft of this row asked for 0.8 of a
        // single frame's error and got 0.82 (1.68 dB) on WebGPU and 0.87 on WebGL2. The replay says why: without the
        // neighbourhood clamp the same 32 frames reach 3.39 dB. On stripes finer than the render resolution the current
        // frame's 3x3 cannot contain the detail the history has recovered, so the clamp cuts it back every frame. That
        // is not this port's defect -- the mirror does exactly the same -- it is the reason FSR2 carries LOCKS.
        const dbAcc = 20 * Math.log10(eOne / eAcc), dbNo = 20 * Math.log10(eOne / eNo);
        ok(`*** [${mode}] TEMPORAL UPSCALING, measured: ${CONV3} jittered ${RS3}x${RS3} frames accumulated beat one resolved frame by ${dbAcc.toFixed(2)} dB against a 4x4-supersampled truth -- and the same renders WITHOUT the neighbourhood clamp by ${dbNo.toFixed(2)} dB ***`,
           eAcc < eOne && eNo < eAcc, `one frame ${eOne.toExponential(3)}, accumulated ${eAcc.toExponential(3)}, unclamped ${eNo.toExponential(3)}; a still camera and the running mean, alpha = 1/(k+1)`);
    }
}

// ---- v4727 SABOTAGE LOG ----------------------------------------------------------------------------------------
// Each against render/temporalTsl.mjs alone, restored after; counts are FAIL rows across both backends.
//   M1  applyJitter not negated                      -> 2     M8  hasHistory counts frame one               -> 2
//   M2  du's sign flipped                            -> 4     M9  restoreProjection does not restore        -> 2
//   M3  the object's previous matrix ignored         -> 4     M10 NoBlending dropped from the override      -> 4
//   M4  valid ignores w                              -> 2     M11 the previous camera never set             -> 8
//   M5  the completion through the FORWARD matrix    -> 6     M12 an object's record never advanced         -> 2
//   M6  the completion's surface test inverted       -> 6     M13 the stage's previous camera never advanced -> 6
//   M7  WebGL's clip mapping dropped                 -> 2     M14 zPrev from the CURRENT clip               -> 2
// *** M4 AND M12 HAD NO POPULATION UNTIL THIS GATE WAS GIVEN ONE. *** The first draft graded two frames and never
// turned the camera round: no pixel was ever behind the previous eye, and with two frames an object's first record
// IS its previous one. The third frame and the turnaround are here for those two sabotages; each now reddens both
// backends. M7 reddens WebGL2 only, as it must -- WebGPU's clip range IS the window range.
//
// ---- v4728 SABOTAGE LOG ----------------------------------------------------------------------------------------
//   R1  the resolve's base texel floored, not rounded -> 4      R7  the offscreen test dropped               -> 4
//   R2  the resolve's jitter added                    -> 6      R8  the factor ignored                       -> 2
//   R3  the resolve's dering removed                  -> 4      R9  hasHistory ignored                       -> 6
//   R4  Lanczos2's zero guard removed                 -> 4      R10 the blend inverted                       -> 7
//   R5  the box in RGB, not YCoCg                     -> 6      R11 invalid motion accumulated anyway        -> 2
//   R6  the bilinear weights swapped                  -> 8      R12 the box from the history, not the frame  -> 8
//   R13 render/temporalResolveWgsl.mjs back to round() -> 1, in render/temporalResolve-selfcheck.mjs's tie row
// *** R11 HAD NO POPULATION UNTIL THE FACTOR ROW WAS GIVEN AN INVALID QUARTER. *** With the far plane completed,
// every pixel of the moving run is valid -- sky included -- so accumulating through invalid motion changed nothing
// anywhere. R5 reddens because the moving run's box is chromatic; on the still run's two-colour stripes an RGB box
// and a YCoCg box clamp identically, measured.
console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nALL GREEN");
console.log("unchecked here: SKINNED and MORPHED meshes, whose previous position three's positionPrevious carries and this gate " +
    "never draws; an ORTHOGRAPHIC camera's field; and every pass downstream of the field, which arrive one a round.");
process.exitCode = fails ? 1 : 0;
