#!/usr/bin/env node
// WebGLEngine/render/temporalTslMeshes-selfcheck.mjs -- v4757
//
// SKINNED AND MORPHED MESHES, AND AN ORTHOGRAPHIC CAMERA, THROUGH render/temporalTsl.mjs's MOTION STAGE. render/temporalTsl-
// selfcheck.mjs said all three were unchecked there. Each deformed mesh is held to a RIGID mesh making the same motion:
//   skinned   one bone carrying every vertex, moved by a rigid pose -- against a plain mesh moved by the same matrix; two meshes
//             sharing one skeleton; and through a toward stage at t = 0.3 against the rigid mesh on its arc
//   morphed   two targets shifting every vertex by (0.3, 0.1, 0) and (0, 0, 0.2), influences 0.5 k and 0.3 k -- against the plain
//             mesh translated by the same amount; relative targets and absolute ones; and through the toward stage
// and the orthographic camera, panning over a still scene, against render/motionVectors.mjs's motionVectorsCPU on the stage's
// own depth. Each scene is drawn before the stage each frame, as a page draws it.
// *** THE FIRST PROBE FOUND BOTH MESH KINDS WRONG. *** Skinned meshes carried NO motion: three updates a skeleton once per
// frame of its own animation loop, so a pass drawn in the same browser frame as the last one skinned with the matrices it
// had then, and the current pose was the previous one. Morphed meshes carried the WHOLE morph offset: three keeps no previous
// influences, and the "previous" point was the unmorphed one -- 2.7 px wrong here. The stage keeps both histories now.
"use strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runInEngineOrigin, webgpuSkipReason } from "../tools/ship/webgpuHarness.mjs";
import { motionVectorsCPU, mat4Invert } from "./motionVectors.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let fails = 0;
const ok = (label, cond, detail) => { if (!cond) fails++; console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "   " + detail : ""}`); };
const say = (s) => console.log(`  ----  ${s}`);
const D = 48;

console.log("\n1. ON THE DEVICE: deformed meshes against rigid ones, and an orthographic camera against the CPU");
const skip = webgpuSkipReason();
if (skip) { console.log(`  SKIP  ${skip}`); console.log("  ----  *** NOT A PASS. *** Nothing here is static."); fails++; }
else {
    const r = await runInEngineOrigin({ engineRoot: ENG, timeoutMs: 300000, args: { D }, script: `async (a) => {
        const THREE = await import("/vendor/three-webgpu/three.webgpu.js"); const T = await import("/vendor/three-webgpu/three.tsl.js");
        const TT = await import("/render/temporalTsl.mjs");
        const out = {};
        for (const mode of ["webgpu", "webgl2"]) {
            try {
                const D = a.D, canvas = document.createElement("canvas"); canvas.width = 8; canvas.height = 8;
                const renderer = new THREE.WebGPURenderer({ canvas, forceWebGL: mode === "webgl2", antialias: false }); await renderer.init();
                const gl = TT.glClip(THREE, renderer), rd = async (t) => Array.from(await renderer.readRenderTargetPixelsAsync(t, 0, 0, D, D));
                const mat = new THREE.MeshBasicNodeMaterial({ color: 0xff8800 }), scratch = new THREE.RenderTarget(D, D);
                const cam = new THREE.PerspectiveCamera(40, 1, 0.1, 50); cam.position.set(0, 0.3, 4); cam.lookAt(0, 0, 0); cam.updateMatrixWorld();
                const box = () => new THREE.BoxGeometry(0.8, 1.0, 0.6, 2, 2, 2);
                const pose = (k, dx = 0) => new THREE.Matrix4().compose(new THREE.Vector3(0.15 * k + dx, -0.08 * k, 0.1 * k), new THREE.Quaternion().setFromEuler(new THREE.Euler(0.25 * k, 0.4 * k, 0.1 * k)), new THREE.Vector3(1, 1, 1));
                // two scenes drawn frame by frame -- the scene itself first, then each stage -- and their fields read
                const pair = async (sA, sB, setK, opts = {}) => {
                    const stA = TT.makeMotionStage(THREE, T, { w: D, h: D, gl, ...opts }), stB = TT.makeMotionStage(THREE, T, { w: D, h: D, gl, ...opts });
                    for (let k = 0; k < 3; k++) { setK(k); renderer.setRenderTarget(scratch); await renderer.renderAsync(sA, cam); await renderer.renderAsync(sB, cam);
                        await stA.render(renderer, sA, cam, 0.3); await stB.render(renderer, sB, cam, 0.3); }
                    const f = { A: await rd(stA.motion), B: await rd(stB.motion) }; stA.dispose(); stB.dispose(); return f;
                };
                const skinned = (g, bone) => { const n = g.attributes.position.count;
                    g.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(new Array(n * 4).fill(0), 4));
                    g.setAttribute("skinWeight", new THREE.Float32BufferAttribute(Array.from({ length: n * 4 }, (_, i) => (i % 4 === 0 ? 1 : 0)), 4));
                    const sk = new THREE.SkinnedMesh(g, mat); sk.add(bone); return sk; };
                const o = {};
                // skinned, one mesh; then two meshes sharing one skeleton; each against rigid meshes; plain and toward
                for (const [cn, opts] of [["skin", {}], ["skinToward", { toward: true }]]) {
                    const bone = new THREE.Bone(), sk = skinned(box(), bone); sk.bind(new THREE.Skeleton([bone]));
                    const rigid = new THREE.Mesh(box(), mat); rigid.matrixAutoUpdate = false;
                    const sA = new THREE.Scene(), sB = new THREE.Scene(); sA.add(sk); sB.add(rigid);
                    o[cn] = await pair(sA, sB, (k) => { const m = pose(k); m.decompose(bone.position, bone.quaternion, bone.scale); bone.updateMatrixWorld(true); sk.updateMatrixWorld(true);
                        rigid.matrix.copy(m); rigid.updateMatrixWorld(true); }, opts);
                }
                // the bone at the scene's root and both meshes at the origin, their geometries shifted apart: each vertex is then
                // pose(k) times the geometry's point, as each rigid mesh's is
                { const bone = new THREE.Bone(), skel = new THREE.Skeleton([bone]), g1 = box().translate(-0.9, 0, 0), g2 = box().translate(0.9, 0, 0);
                  const s1 = skinned(g1, new THREE.Bone()), s2 = skinned(g2, new THREE.Bone());
                  const sA = new THREE.Scene(), sB = new THREE.Scene(); sA.add(bone); sA.add(s1); sA.add(s2); s1.bind(skel); s2.bind(skel);
                  const r1 = new THREE.Mesh(box().translate(-0.9, 0, 0), mat), r2 = new THREE.Mesh(box().translate(0.9, 0, 0), mat); r1.matrixAutoUpdate = r2.matrixAutoUpdate = false; sB.add(r1); sB.add(r2);
                  o.shared = await pair(sA, sB, (k) => { const m = pose(k); m.decompose(bone.position, bone.quaternion, bone.scale); bone.updateMatrixWorld(true); s1.updateMatrixWorld(true); s2.updateMatrixWorld(true);
                      for (const rr of [r1, r2]) { rr.matrix.copy(m); rr.updateMatrixWorld(true); } }); }
                // morphed: relative and absolute targets, plain and toward
                for (const [cn, relative, opts] of [["morph", true, {}], ["morphAbsolute", false, {}], ["morphToward", true, { toward: true }]]) {
                    const g = box(), n = g.attributes.position.count, base = g.attributes.position;
                    // two targets -- (0.3, 0.1, 0) at influence 0.5 k and (0, 0, 0.2) at 0.3 k -- so a target's place among the
                    // others is read, not only the first's
                    const tgt = (d) => new THREE.Float32BufferAttribute(Array.from({ length: n * 3 }, (_, i) => d[i % 3] + (relative ? 0 : base.array[i])), 3);
                    g.morphAttributes.position = [tgt([0.3, 0.1, 0]), tgt([0, 0, 0.2])];
                    g.morphTargetsRelative = relative;
                    const mm = new THREE.Mesh(g, mat); mm.updateMorphTargets(); const rigid = new THREE.Mesh(box(), mat);
                    const sA = new THREE.Scene(), sB = new THREE.Scene(); sA.add(mm); sB.add(rigid);
                    o[cn] = await pair(sA, sB, (k) => { mm.morphTargetInfluences[0] = 0.5 * k; mm.morphTargetInfluences[1] = 0.3 * k; rigid.position.set(0.15 * k, 0.05 * k, 0.06 * k); rigid.updateMatrixWorld(true); }, opts);
                }
                // orthographic: a still scene, the camera panning; the stage's field and depth for motionVectorsCPU
                { const oc = new THREE.OrthographicCamera(-1.6, 1.6, 1.6, -1.6, 0.1, 20), sc = new THREE.Scene();
                  const b = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.7, 0.7), mat); b.position.set(-0.6, 0, 0); b.rotation.set(0.4, 0.6, 0); sc.add(b);
                  const wall = new THREE.Mesh(new THREE.PlaneGeometry(8, 8), mat); wall.position.z = -2; sc.add(wall);
                  const st = TT.makeMotionStage(THREE, T, { w: D, h: D, gl }); const vps = [];
                  for (let k = 0; k < 2; k++) { oc.position.set(0.12 * k, 0.3 + 0.05 * k, 5); oc.lookAt(0.12 * k, 0, 0); oc.updateMatrixWorld(); oc.updateProjectionMatrix();
                      vps.push(Array.from(new THREE.Matrix4().multiplyMatrices(oc.projectionMatrix, oc.matrixWorldInverse).elements)); await st.render(renderer, sc, oc); }
                  o.ortho = { m: await rd(st.motion), z: await rd(st.depth), vps }; st.dispose(); }
                scratch.dispose(); out[mode] = o; renderer.dispose();
            } catch (err) { out[mode] = { err: String(err && err.stack || err).slice(0, 700) }; }
        }
        return out;
    }` });
    ok("the harness ran every case on BOTH backends", r.ok && r.result && !r.result.webgpu.err && !r.result.webgl2.err,
       r.ok ? `webgpu ${r.result.webgpu.err || "ok"}; webgl2 ${r.result.webgl2.err || "ok"}` : (r.reason || (r.pageErrors || []).join("; ")));
    if (r.ok && r.result) for (const mode of ["webgpu", "webgl2"]) {
        const o = r.result[mode]; if (!o || o.err) continue;
        // WebGL2 reads bottom row first
        const up = (arr) => { if (mode === "webgpu") return arr; const q = new Array(arr.length); for (let y = 0; y < D; y++) for (let x = 0; x < D * 4; x++) q[y * D * 4 + x] = arr[(D - 1 - y) * D * 4 + x]; return q; };
        const cmp = (f) => { const A = up(f.A), B = up(f.B); let w = 0, moving = 0, big = 0;
            for (let i = 0; i < D * D; i++) { for (let c = 0; c < 2; c++) w = Math.max(w, Math.abs(A[i * 4 + c] - B[i * 4 + c]) * D);
                if (Math.hypot(B[i * 4], B[i * 4 + 1]) * D > 0.5) moving++; big = Math.max(big, Math.hypot(A[i * 4], A[i * 4 + 1]) * D); }
            return { w, moving, big }; };
        const S = cmp(o.skin), ST = cmp(o.skinToward), SH = cmp(o.shared), M = cmp(o.morph), MA = cmp(o.morphAbsolute), MT = cmp(o.morphToward);
        ok(`*** [${mode}] a SKINNED mesh's field is the same motion's on a rigid mesh to ${S.w.toExponential(2)} px, over ${S.moving} pixels that moved, the largest ${S.big.toFixed(2)} px ***`,
           S.w < 1e-3 && S.moving > 150 && S.big > 3, "the stage keeps each skeleton's bone matrices from its last draw, and updates the skeleton before each: three's own previous matrices step with its animation loop, not with the passes drawn");
        ok(`  [${mode}] ...and two meshes sharing one skeleton, the skeleton stepped once a pass: ${SH.w.toExponential(2)} px over ${SH.moving} pixels`, SH.w < 1e-3 && SH.moving > 150,
           "the second mesh drawn in a pass must not find the first one's matrices already taken as its previous ones");
        ok(`  [${mode}] ...and through a toward stage at t = 0.3, each bone on its arc: ${ST.w.toExponential(2)} px, the largest ${ST.big.toFixed(2)} px`, ST.w < 1e-3 && ST.moving > 100 && ST.big < S.big * 0.9);
        ok(`*** [${mode}] a MORPHED mesh's field is the same motion's on a rigid mesh to ${M.w.toExponential(2)} px with relative targets and ${MA.w.toExponential(2)} with absolute ones, over ${M.moving} pixels, the largest ${M.big.toFixed(2)} px ***`,
           M.w < 1e-3 && MA.w < 1e-3 && M.moving > 150 && M.big > 2, "the stage keeps each mesh's influences from its last draw and morphs the geometry with them for the previous point: three keeps none, and its previous point was the unmorphed one");
        ok(`  [${mode}] ...and through the toward stage, the influences on the line to t: ${MT.w.toExponential(2)} px`, MT.w < 1e-3 && MT.moving > 100);
        const O = o.ortho, m = up(O.m), z = up(O.z), dep = new Float32Array(D * D); for (let i = 0; i < D * D; i++) dep[i] = z[i * 4];
        const ref = motionVectorsCPU(dep, D, D, mat4Invert(new Float32Array(O.vps[1])), new Float32Array(O.vps[0])).data;
        let w = 0, n = 0, big = 0; for (let i = 0; i < D * D; i++) { if (!ref[i * 4 + 2]) continue; n++; w = Math.max(w, Math.hypot(m[i * 4] - ref[i * 4], m[i * 4 + 1] - ref[i * 4 + 1]) * D); big = Math.max(big, Math.hypot(ref[i * 4], ref[i * 4 + 1]) * D); }
        ok(`*** [${mode}] under an ORTHOGRAPHIC camera the stage's field is motionVectorsCPU's at every pixel, to ${w.toExponential(2)} px -- ${n} of ${D * D} valid, the camera's motion up to ${big.toFixed(2)} px ***`,
           w < 1e-3 && n === D * D && big > 1, "the previous clip w is 1 under an orthographic projection, which the stage's `behind the eye` test reads as in front");
    }
}

// ---- v4757 SABOTAGE LOG ----------------------------------------------------------------------------------------
// Against render/temporalTsl.mjs, each against this gate (both backends):
//   K1 the skeleton not updated before the draw       -> 6    K6 absolute targets read as relative            -> 2
//   K2 the skeleton stepped at every mesh, not a pass -> 2    K7 each target read at the first one's place     -> 4
//   K3 three's previous skin, not the stage's         -> 6    K8 the morph toward line from the current end    -> 2
//   K4 each bone's pose at 1 - t                      -> 2    K9 three's frameId for the pass, not its renderId -> 6
//   K5 the previous influences the current ones       -> 4    K10 an orthographic w read as behind the eye    -> 2
// *** THE FIRST DRAFT'S MORPHED MESH WAS NOT DRAWN AT ALL. *** Its previous influences were a uniform array of f32, which WGSL
// refuses -- a uniform array's elements must be 16 bytes apart -- so the pipeline failed and the stage showed the background
// where the mesh was: zero motion, which read like the history being wrong. They are vec4s now, each in .x, as three packs its
// own. The fixture has TWO morph targets for K7: with one, a target's place among the others is always zero.
// And the first shared-skeleton fixture was the fixture's error, not the stage's: the bone was a child of one mesh, so its
// matrix carried that mesh's offset. It is at the scene's root now.
console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nALL GREEN");
console.log("unchecked here: skinning with more than one bone a vertex -- every vertex here has one, weight 1, which the four-bone sum " +
    "passes through; morph NORMALS, which a motion field does not read; a BatchedMesh; and a mesh both skinned and morphed at once.");
process.exitCode = fails ? 1 : 0;
