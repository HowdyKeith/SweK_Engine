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

// ---- 2. v4784: AN INSTANCED MESH WITH MORPH TARGETS ---------------------------------------------------------------
// The stage's instanced branch took the BARE geometry through the previous instance matrix, so a morphing herd carried its
// morph as motion, 1.39 to 1.67 px here. Held, both backends, against plain meshes doing the same: influences per instance
// (setMorphAt -- three's own test is count > 1 and a morphTexture) and the mesh's own, relative and absolute; and through a
// toward stage. What three itself cannot draw is the last row: per-instance influences over ABSOLUTE targets, or alongside a
// mesh-level morphTargetInfluences, throw in r185 on both backends.
console.log("\n2. ON THE DEVICE: an InstancedMesh with morph targets, per instance and shared");
if (!skip) {
    const r = await runInEngineOrigin({ engineRoot: ENG, timeoutMs: 300000, args: { D: 64, N: 4 }, script: `async (a) => {
    const THREE = await import("/vendor/three-webgpu/three.webgpu.js"); const T = await import("/vendor/three-webgpu/three.tsl.js");
    const TT = await import("/render/temporalTsl.mjs"); const out = {};
    for (const mode of ["webgpu", "webgl2"]) { try {
        const { D, N } = a, canvas = document.createElement("canvas"); canvas.width = 8; canvas.height = 8;
        const renderer = new THREE.WebGPURenderer({ canvas, forceWebGL: mode === "webgl2", antialias: false }); await renderer.init();
        const gl = TT.glClip(THREE, renderer), rd = async (t) => Array.from(await renderer.readRenderTargetPixelsAsync(t, 0, 0, D, D));
        const cam = new THREE.PerspectiveCamera(40, 1, 0.1, 50); cam.position.set(0, 0, 5); cam.lookAt(0, 0, 0); cam.updateMatrixWorld();
        const mkGeo = (relative) => { const g = new THREE.BoxGeometry(0.6, 0.6, 0.6), p = g.attributes.position, A = [], B = [];
            for (let v = 0; v < p.count; v++) { const x = p.getX(v), y = p.getY(v), z = p.getZ(v);
                A.push(relative ? 0.5 * x : 1.5 * x, relative ? 0 : y, relative ? 0 : z); B.push(relative ? 0 : x, relative ? 0.6 * y : 1.6 * y, relative ? 0 : z); }
            g.morphAttributes.position = [new THREE.Float32BufferAttribute(A, 3), new THREE.Float32BufferAttribute(B, 3)]; g.morphTargetsRelative = relative; return g; };
        const M = new THREE.Matrix4();
        const at = (i, k) => M.makeTranslation(-1.2 + (i % 2) * 2.4 + 0.2 * k * (i - 1.5), -0.8 + Math.floor(i / 2) * 1.6 + 0.1 * k, 0);
        const infl = (i, k) => [Math.min(1, 0.15 * k * (i + 1)), Math.min(1, 0.1 * k * (4 - i))];
        const fieldOf = async (scene, step, toward) => { const st = TT.makeMotionStage(THREE, T, { w: D, h: D, gl, toward: !!toward });
            for (const k of [0, 1, 2]) { step(k); await st.render(renderer, scene, cam, toward ? 0.5 : undefined); } const m = await rd(st.motion); st.dispose(); return m; };
        const cmp = (F, R) => { let w = 0, moving = 0; for (let i = 0; i < D * D; i++) { const ma = Math.hypot(F[i*4], F[i*4+1]) * D, mb = Math.hypot(R[i*4], R[i*4+1]) * D;
            if (ma > 0.01 || mb > 0.01) { moving++; w = Math.max(w, Math.hypot(F[i*4] - R[i*4], F[i*4+1] - R[i*4+1]) * D); } } return { w, moving }; };
        const o = {};
        for (const [name, relative, perInstance, toward] of [["perInstance", true, true, false], ["sharedRelative", true, false, false], ["sharedAbsolute", false, false, false], ["perInstanceToward", true, true, true]]) {
            const geo = mkGeo(relative), im = new THREE.InstancedMesh(geo, new THREE.MeshBasicNodeMaterial(), N); im.frustumCulled = false;
            if (!perInstance) im.morphTargetInfluences = [0, 0];
            const sc = new THREE.Scene(); sc.add(im); const dummy = new THREE.Mesh(geo);
            const plain = Array.from({ length: N }, () => new THREE.Mesh(geo, new THREE.MeshBasicNodeMaterial())), ps = new THREE.Scene(); for (const p of plain) ps.add(p);
            const F = await fieldOf(sc, (k) => { for (let i = 0; i < N; i++) { im.setMatrixAt(i, at(i, k));
                    if (perInstance) { dummy.morphTargetInfluences.splice(0, 2, ...infl(i, k)); im.setMorphAt(i, dummy); } }
                im.instanceMatrix.needsUpdate = true; if (perInstance) im.morphTexture.needsUpdate = true; else im.morphTargetInfluences.splice(0, 2, ...infl(0, k)); }, toward);
            const R = await fieldOf(ps, (k) => plain.forEach((p, i) => { at(i, k).decompose(p.position, p.quaternion, p.scale); p.morphTargetInfluences.splice(0, 2, ...infl(perInstance ? i : 0, k)); p.updateMatrixWorld(); }), toward);
            o[name] = cmp(F, R);
        }
        // three's own: which of these it can draw at all
        o.three = {};
        for (const [name, relative, arr] of [["perInstanceAbsolute", false, false], ["perInstanceWithMeshInfluences", true, true]]) {
            try { const geo = mkGeo(relative), im = new THREE.InstancedMesh(geo, new THREE.MeshBasicNodeMaterial(), 2); if (arr) im.morphTargetInfluences = [0, 0];
                const d = new THREE.Mesh(geo); d.morphTargetInfluences[0] = 0.5; im.setMorphAt(0, d); im.setMorphAt(1, d);
                const sc = new THREE.Scene(); sc.add(im); const t = new THREE.RenderTarget(16, 16); renderer.setRenderTarget(t); await renderer.renderAsync(sc, cam); renderer.setRenderTarget(null); t.dispose(); o.three[name] = "drawn"; }
            catch (e) { renderer.setRenderTarget(null); o.three[name] = String(e && e.message || e).slice(0, 70); } }
        out[mode] = o; renderer.dispose();
    } catch (e) { out[mode] = { err: String(e && e.stack || e).slice(0, 400) }; } }
    return out; }` });
    ok("the harness ran the instanced morphs on both backends", r.ok && r.result && !r.result.webgpu.err && !r.result.webgl2.err,
       r.ok ? `webgpu ${r.result.webgpu.err || "ok"}; webgl2 ${r.result.webgl2.err || "ok"}` : (r.reason || (r.pageErrors || []).join("; ")));
    if (r.ok && r.result && !r.result.webgpu.err && !r.result.webgl2.err) {
        for (const mode of ["webgpu", "webgl2"]) {
            const o = r.result[mode], e = (x) => x.toExponential(2);
            ok(`*** [${mode}] an InstancedMesh's PER-INSTANCE morphs carry their motion: ${e(o.perInstance.w)} px against plain meshes over ${o.perInstance.moving} pixels -- it was 1.67 px off ***`,
               o.perInstance.w < 1e-3 && o.perInstance.moving > 300, "each instance's influences at the last draw, from the stage's copy of three's morphTexture");
            ok(`*** [${mode}] ...and the MESH's own influences over instances, relative ${e(o.sharedRelative.w)} and absolute ${e(o.sharedAbsolute.w)} px ***`,
               o.sharedRelative.w < 1e-3 && o.sharedAbsolute.w < 1e-3 && o.sharedRelative.moving > 300 && o.sharedAbsolute.moving > 300, "it was 1.39 px off: the instanced branch never morphed");
            ok(`  [${mode}] ...and through a toward stage at t = 0.5, each instance's influences on the line from the last draw's: ${e(o.perInstanceToward.w)} px`,
               o.perInstanceToward.w < 1e-3 && o.perInstanceToward.moving > 300, "against plain meshes through the same stage");
        }
        const tg = r.result.webgpu.three, tw = r.result.webgl2.three;
        ok(`three's own: per-instance influences over absolute targets, or beside a mesh-level morphTargetInfluences, are NOT drawn -- webgpu ${JSON.stringify(tg)}; webgl2 ${JSON.stringify(tw)}`,
           [tg, tw].every((x) => x.perInstanceAbsolute !== "drawn" && x.perInstanceWithMeshInfluences !== "drawn"),
           "r185's morph node updates the MESH's influences on every draw whatever the shader reads; when three draws these this row goes red and the stage can be held to them");
    }
}

// ---- 3. v4785: MORPH TARGETS IN THE HUNDREDS AND THOUSANDS ---------------------------------------------------------
// The stage summed the targets one unrolled texture read each, and past a few hundred the vertex stage did not survive it:
// NO motion read from 150 targets on WebGPU and 256 on WebGL2 while three morphed to its own limit. And three's own limit is
// the renderer's array-texture layers (read here from the renderer, never assumed): past it WebGPU draws nothing and WebGL2
// draws the mesh UNMORPHED without a word. Held: at 1, 200, L and L + 1 targets the field is a one-target reference's where
// three morphs, and still where three does not -- the field describes what three drew.
console.log("\n3. ON THE DEVICE: hundreds and thousands of morph targets, to the renderer's own limit and one past it");
if (!skip) {
    const r = await runInEngineOrigin({ engineRoot: ENG, timeoutMs: 400000, args: { D: 48 }, script: `async (a) => {
    const THREE = await import("/vendor/three-webgpu/three.webgpu.js"); const T = await import("/vendor/three-webgpu/three.tsl.js");
    const TT = await import("/render/temporalTsl.mjs"); const out = {};
    for (const mode of ["webgpu", "webgl2"]) { try {
        const D = a.D, canvas = document.createElement("canvas"); canvas.width = 8; canvas.height = 8;
        const renderer = new THREE.WebGPURenderer({ canvas, forceWebGL: mode === "webgl2", antialias: false }); await renderer.init();
        const b = renderer.backend, L = b.gl ? b.gl.getParameter(b.gl.MAX_ARRAY_TEXTURE_LAYERS) : b.device.limits.maxTextureArrayLayers;
        const gl = TT.glClip(THREE, renderer), rd = async (t) => Array.from(await renderer.readRenderTargetPixelsAsync(t, 0, 0, D, D));
        const cam = new THREE.PerspectiveCamera(40, 1, 0.1, 50); cam.position.set(0, 0, 5); cam.lookAt(0, 0, 0); cam.updateMatrixWorld();
        const cover = async (sc) => { const t = new THREE.RenderTarget(D, D, { type: THREE.FloatType }); renderer.setRenderTarget(t); await renderer.renderAsync(sc, cam); const c = await rd(t); t.dispose(); renderer.setRenderTarget(null); let n = 0; for (let i = 0; i < D * D; i++) if (c[i*4+3] > 0.5) n++; return n; };
        const field = async (sc, step) => { const st = TT.makeMotionStage(THREE, T, { w: D, h: D, gl }); try { for (const k of [0, 1, 2]) { step(k); await st.render(renderer, sc, cam); } return await rd(st.motion); } finally { st.dispose(); } };
        const quad = (n) => { const g = new THREE.PlaneGeometry(1, 1), c = g.attributes.position.count, targets = [];
            for (let t = 0; t < n; t++) targets.push(new THREE.Float32BufferAttribute(new Float32Array(c * 3).map((_, i) => (t === n - 1 && i % 3 === 0) ? 0.6 : 0), 3));
            g.morphAttributes.position = targets; g.morphTargetsRelative = true; const m = new THREE.Mesh(g, new THREE.MeshBasicNodeMaterial()); const sc = new THREE.Scene(); sc.add(m); return { m, sc }; };
        const ref = quad(1), R = await field(ref.sc, (k) => { ref.m.morphTargetInfluences[0] = 0.3 * k; });
        const o = { L, cases: {} };
        for (const n of [1, 200, L, L + 1]) {
            const q = quad(n), still = await cover(q.sc); q.m.morphTargetInfluences[n - 1] = 0.6; const moved = await cover(q.sc); q.m.morphTargetInfluences[n - 1] = 0;
            const F = await field(q.sc, (k) => { q.m.morphTargetInfluences[n - 1] = 0.3 * k; });
            let w = 0, mv = 0; for (let i = 0; i < D * D; i++) { if (Math.hypot(F[i*4], F[i*4+1]) * D > 0.01) mv++; w = Math.max(w, Math.hypot(F[i*4] - R[i*4], F[i*4+1] - R[i*4+1]) * D); }
            o.cases[n] = { drawn: still, morphed: moved !== still, moving: mv, offRef: w };
        }
        out[mode] = o; renderer.dispose();
    } catch (e) { out[mode] = { err: String(e && e.stack || e).slice(0, 400) }; } }
    return out; }` });
    ok("the harness ran the target counts on both backends", r.ok && r.result && !r.result.webgpu.err && !r.result.webgl2.err,
       r.ok ? `webgpu ${r.result.webgpu.err || "ok"}; webgl2 ${r.result.webgl2.err || "ok"}` : (r.reason || (r.pageErrors || []).join("; ")));
    if (r.ok && r.result && !r.result.webgpu.err && !r.result.webgl2.err) {
        for (const mode of ["webgpu", "webgl2"]) {
            const { L, cases } = r.result[mode], c = (n) => cases[n], e = (x) => x.toExponential(2);
            ok(`*** [${mode}] where three morphs, the field IS a one-target quad's: 1, 200 and ${L} targets ${e(c(1).offRef)}, ${e(c(200).offRef)}, ${e(c(L).offRef)} px ***`,
               [1, 200, L].every((n) => c(n).drawn > 100 && c(n).morphed && c(n).offRef < 1e-3 && c(n).moving > 100),
               "the sum over targets is a loop in the shader; unrolled (as before v4785) the field read no motion from 150 targets on webgpu and from 256 on webgl2");
            const x = c(L + 1);
            ok(`*** [${mode}] one target past this renderer's ${L} layers three ${x.drawn === 0 ? "draws NOTHING" : x.morphed ? "still morphs" : "draws the mesh UNMORPHED"} -- and the field moves on ${x.moving} pixels ***`,
               (x.drawn === 0 || !x.morphed) && x.moving === 0,
               "the field describes what three drew: past the renderer's array-texture limit, read from the renderer, the stage morphs nothing either");
        }
    }
}

// ---- v4785 SABOTAGE LOG, against render/temporalTsl.mjs ---------------------------------------------------------
// L1 the sum over targets unrolled again -> 3; L2 the renderer's layer limit never read -> 2; L3 the limit off by one
// (< not <=) -> 3. Three, none green.
// ---- v4784 SABOTAGE LOG, against render/temporalTsl.mjs ---------------------------------------------------------
// I1 the instanced branch left unmorphed (as it was) -> 7; I2 each instance's weights read from texel t, the base column, not
// t + 1 -> 5; I3 the copy of the morphTexture never stepped -> 5; I4 the last draw's weights never kept -> 5; I5 no lerp under
// toward -> 3. Five, none green.
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
console.log("unchecked here: morph NORMALS, which a motion field does not read. Skinning over several bones a vertex, a mesh both " +
    "skinned and morphed, a BatchedMesh, and two meshes sharing one program -- named here until v4761 -- are " +
    "render/temporalTslZoo-selfcheck.mjs's, which found the last wrong: the histories here were built into the program for its first mesh.");
process.exitCode = fails ? 1 : 0;
