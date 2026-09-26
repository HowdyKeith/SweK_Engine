#!/usr/bin/env node
// WebGLEngine/render/temporalTsl-selfcheck.mjs -- v4727
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
import { motionVectorsCPU, mat4Invert, mat4Multiply } from "./motionVectors.mjs";
import { buildObjectMatrices, objectMotionCPU } from "./objectMotion.mjs";
import { resolveJitterAwareCPU } from "./temporalResolve.mjs";
import * as TT from "./temporalTsl.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let fails = 0;
const ok = (label, cond, detail) => { if (!cond) fails++; console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "   " + detail : ""}`); };
const report = (s) => console.log(`  ----  ${s}`);
const D = 32, R = 16, DT = 64;   // the motion field at 32x32; the jitter's sense at 32 -> 64 (multiples of 16: WebGPU pads float readback rows to 256 bytes)

console.log("\n1. WITHOUT A DEVICE: the refusals and the depth mapping");
{
    let named = null; try { TT.makeMotionNode({ VelocityNode: function () {} }, {}); } catch (e) { named = String(e.message); }
    ok("a TSL namespace missing a name is refused BY THAT NAME", named !== null && /has no Fn\b/.test(named), named || "no throw");
    const stand = Object.fromEntries(TT.TEMPORAL_TSL_NEEDS.map((k) => [k, () => {}]));
    let noVel = null; try { TT.makeMotionNode({}, stand); } catch (e) { noVel = String(e.message); }
    ok("  and a three build with no VelocityNode is refused by that name", noVel !== null && /no VelocityNode/.test(noVel), noVel || "no throw");
    let cn = null; try { TT.motionCompleteNodes({}, {}, null, null, { w: 1, h: 1, gl: false }); } catch (e) { cn = String(e.message); }
    ok("  and so is motionCompleteNodes, the far plane's completion", cn !== null && /has no Fn\b/.test(cn), cn || "no throw");
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
console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nALL GREEN");
console.log("unchecked here: SKINNED and MORPHED meshes, whose previous position three's positionPrevious carries and this gate " +
    "never draws; an ORTHOGRAPHIC camera's field; and every pass downstream of the field, which arrive one a round.");
process.exitCode = fails ? 1 : 0;
