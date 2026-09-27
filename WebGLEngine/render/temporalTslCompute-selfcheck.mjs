#!/usr/bin/env node
// WebGLEngine/render/temporalTslCompute-selfcheck.mjs -- v4762
//
// POSITIONS A NODE WRITES -- A COMPUTE PASS'S PARTICLES -- THROUGH render/temporalTsl.mjs's MOTION STAGE. three draws a
// material's positionNode as the local position and keeps no previous one, so the stage had nothing to say where such a point
// was: it refused a sprite placed by a node, and took a mesh's bare geometry as its last point. The hook: the material's
// userData.previousPositionNode, the whole local position as it was -- or, none given, the positionNode itself, a node that
// stands still -- and makePreviousCopy, which keeps a storage buffer's last contents for it. Held to references the stage
// already gets right, three frames each, the field read at the last:
//   sprites     24 particles, positions and velocities in storage, a compute step a frame, drawn as ONE Sprite of count 24
//               placed by the positions and sized by scaleNode -- against 24 plain Sprites at the positions the CPU works out
//               (render/temporalTslZoo-selfcheck.mjs holds those); without the hook, and through a toward stage at t = 0.3
//   instanced   an InstancedMesh placed by positionLocal + the positions, its previousPositionNode positionGeometry + the copy
//               -- against an InstancedMesh whose instance matrices carry the positions (v4752's)
//   displaced   a mesh displaced by a positionNode that stands still, the mesh moving -- against a mesh displaced by its geometry
// *** WEBGPU AND WEBGL2 BOTH, EACH SYSTEM IN A RENDERER OF ITS OWN. *** three's WebGL2 backend runs only the first particle
// system a renderer makes: a second one's compute leaves its buffer as it was. Measured here (the last row), and not this
// tree's to fix.
"use strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runInEngineOrigin, webgpuSkipReason } from "../tools/ship/webgpuHarness.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let fails = 0;
const ok = (label, cond, detail) => { if (!cond) fails++; console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "   " + detail : ""}`); };
const D = 64;

console.log("\n1. ON THE DEVICE: particles a compute pass moves, against references the stage already gets right");
const skip = webgpuSkipReason();
if (skip) { console.log(`  SKIP  ${skip}`); console.log("  ----  *** NOT A PASS. *** Nothing here is static."); fails++; }
else {
    const r = await runInEngineOrigin({ engineRoot: ENG, timeoutMs: 300000, args: { D, modes: ["webgpu", "webgl2"] }, script: `async (a) => {
    const THREE = await import("/vendor/three-webgpu/three.webgpu.js"); const T = await import("/vendor/three-webgpu/three.tsl.js");
    const TT = await import("/render/temporalTsl.mjs"); const out = {};
    for (const mode of a.modes) { try {
        const D = a.D, canvas = document.createElement("canvas"); canvas.width = 8; canvas.height = 8;
        // a renderer of its own for each particle system: three's WebGL2 backend runs only the FIRST system's compute (measured below)
        let renderer = null; const fresh = async () => { if (renderer) renderer.dispose(); const cv = document.createElement("canvas"); cv.width = 8; cv.height = 8; renderer = new THREE.WebGPURenderer({ canvas: cv, forceWebGL: mode === "webgl2", antialias: false }); await renderer.init(); };
        await fresh(); const gl = TT.glClip(THREE, renderer), rd = async (t) => Array.from(await renderer.readRenderTargetPixelsAsync(t, 0, 0, D, D));
        const cam = new THREE.PerspectiveCamera(40, 1, 0.1, 50); cam.position.set(2.0, 1.4, 4.6); cam.lookAt(0, 0, 0); cam.updateMatrixWorld();
        const mat = () => new THREE.MeshBasicNodeMaterial({ color: 0xffffff });
        const fieldOf = async (scene, step, t = null) => { const st = TT.makeMotionStage(THREE, T, { w: D, h: D, gl, toward: t !== null });
            for (const k of [0, 1, 2]) { await step(k); await st.render(renderer, scene, cam, t ?? 0.5); } const m = await rd(st.motion); st.dispose(); return m; };
        const cmp = (A, B) => { let w = 0, moving = 0, big = 0, onlyA = 0, onlyB = 0; for (let i = 0; i < D * D; i++) { const ma = Math.hypot(A[i*4], A[i*4+1]) * D, mb = Math.hypot(B[i*4], B[i*4+1]) * D;
            if (ma > 0.01 || mb > 0.01) { moving++; big = Math.max(big, mb); w = Math.max(w, Math.hypot(A[i*4] - B[i*4], A[i*4+1] - B[i*4+1]) * D); if (ma <= 0.01) onlyB++; if (mb <= 0.01) onlyA++; } } return { w, moving, big, onlyA, onlyB }; };
        const N = 24, p0 = [], v = [];
        for (let i = 0; i < N; i++) { p0.push(-1.5 + (i % 6) * 0.6, -0.8 + Math.floor(i / 6) * 0.55, 0.2 * Math.sin(i)); v.push(0.08 * Math.cos(i * 1.3), 0.06 * Math.sin(i * 0.7), 0.1 * Math.cos(i)); }
        const at = (i, k) => new THREE.Vector3(p0[i*3] + v[i*3] * k, p0[i*3+1] + v[i*3+1] * k, p0[i*3+2] + v[i*3+2] * k);
        // a compute particle system: positions and velocities in storage, one step a frame (the renderer read at each call)
        const system = () => { const pos = T.instancedArray(new Float32Array(p0), "vec3"), vel = T.instancedArray(new Float32Array(v), "vec3");
            const move = T.Fn(() => { pos.element(T.instanceIndex).addAssign(vel.element(T.instanceIndex)); })().compute(N);
            const prev = TT.makePreviousCopy(THREE, T, pos, N); return { pos, move, prev, async step(k) { await prev.step(renderer); if (k > 0) await renderer.computeAsync(move); } }; };
        const o = {};
        // A. SPRITES, count N, placed by the positions -- with the hook, without it, and toward
        const plainSprites = () => { const sc = new THREE.Scene(), sp = []; for (let i = 0; i < N; i++) { const s = new THREE.Sprite(new THREE.SpriteNodeMaterial({ color: 0xffffff })); s.scale.set(0.2, 0.2, 1); sc.add(s); sp.push(s); }
            return { sc, step: async (k) => { sp.forEach((s, i) => { s.position.copy(at(i, k)); s.updateMatrixWorld(); }); } }; };
        for (const [cn, hook, t] of [["sprites", true, null], ["spritesNoHook", false, null], ["spritesToward", true, 0.3]]) {
            await fresh(); const sys = system(), m = new THREE.SpriteNodeMaterial({ color: 0xffffff }); m.positionNode = sys.pos.toAttribute(); if (hook) m.userData.previousPositionNode = sys.prev.node.toAttribute();
            m.scaleNode = T.float(0.2); const s = new THREE.Sprite(m); s.count = N; const sc = new THREE.Scene(); sc.add(s);
            const F = await fieldOf(sc, (k) => sys.step(k), t); const ps = plainSprites(); const R = await fieldOf(ps.sc, ps.step, t); o[cn] = cmp(F, R); }
        // B. a mesh displaced by a positionNode that stands still, the mesh moving -- against a mesh moved the same, displaced by its geometry
        { const g = new THREE.BoxGeometry(0.5, 0.5, 0.5), m = mat(); m.positionNode = T.positionLocal.add(T.vec3(0.6, 0.2, 0.0)); const me = new THREE.Mesh(g, m); const sc = new THREE.Scene(); sc.add(me);
          const g2 = g.clone(); g2.translate(0.6, 0.2, 0); const re = new THREE.Mesh(g2, mat()); const rs = new THREE.Scene(); rs.add(re);
          const mv = (q) => async (k) => { q.position.set(-0.3 + 0.25 * k, 0.1 * k, 0); q.rotation.y = 0.3 * k; q.updateMatrixWorld(); };
          o.displaced = cmp(await fieldOf(sc, mv(me)), await fieldOf(rs, mv(re))); }
        // C. INSTANCED boxes placed by the positions -- against instance matrices carrying them
        { await fresh(); const sys = system(), g = new THREE.BoxGeometry(0.15, 0.15, 0.15), m = mat(); m.positionNode = T.positionLocal.add(sys.pos.element(T.instanceIndex));
          m.userData.previousPositionNode = T.positionGeometry.add(sys.prev.node.element(T.instanceIndex));
          const im = new THREE.InstancedMesh(g, m, N); const sc = new THREE.Scene(); sc.add(im);
          const rm = new THREE.InstancedMesh(g, mat(), N), rs = new THREE.Scene(); rs.add(rm); const M = new THREE.Matrix4();
          o.instanced = cmp(await fieldOf(sc, (k) => sys.step(k)), await fieldOf(rs, async (k) => { for (let i = 0; i < N; i++) rm.setMatrixAt(i, M.makeTranslation(at(i, k))); rm.instanceMatrix.needsUpdate = true; })); }
        // D. refused: an InstancedMesh placed by a positionNode with no previous
        { const m = mat(); m.positionNode = T.positionLocal.add(T.vec3(0.1, 0, 0)); const im = new THREE.InstancedMesh(new THREE.BoxGeometry(0.2, 0.2, 0.2), m, 4); im.name = "swarm"; const sc = new THREE.Scene(); sc.add(im);
          const st = TT.makeMotionStage(THREE, T, { w: D, h: D, gl }); try { await st.render(renderer, sc, cam); o.refused = "drawn"; } catch (e) { o.refused = String(e.message); } st.dispose(); }
        // three's own: two particle systems in one renderer, each stepped twice -- which of them moved
        { await fresh(); const moved = []; for (let j = 0; j < 2; j++) { const sys = system(); for (const k of [0, 1, 2]) await sys.step(k);
              const P = new Float32Array(await renderer.getArrayBufferAsync(sys.pos.value)); moved.push(Math.abs(P[0] - (p0[0] + 2 * v[0])) < 1e-5); } o.twoSystems = moved; }
        out[mode] = o; renderer.dispose();
    } catch (err) { out[mode] = { err: String(err && err.stack || err).slice(0, 900) }; } }
    return out;
}` });
    ok("the harness ran every case on BOTH backends", r.ok && r.result && !r.result.webgpu.err && !r.result.webgl2.err,
       r.ok ? `webgpu ${r.result.webgpu.err || "ok"}; webgl2 ${r.result.webgl2.err || "ok"}` : (r.reason || (r.pageErrors || []).join("; ")));
    if (r.ok && r.result && !r.result.webgpu.err && !r.result.webgl2.err) {
        const e = (v) => v.toExponential(2), same = (c) => c.w < 1e-3 && c.onlyA === 0 && c.onlyB === 0;
        for (const mode of ["webgpu", "webgl2"]) {
            const o = r.result[mode];
            ok(`*** [${mode}] SPRITES a compute pass moves carry its motion: ${e(o.sprites.w)} px against plain sprites over ${o.sprites.moving} pixels, the largest ${o.sprites.big.toFixed(2)} px -- without previousPositionNode, the whole ${o.spritesNoHook.w.toFixed(2)} px is missing ***`,
               same(o.sprites) && o.sprites.moving > 200 && o.spritesNoHook.w > 1.5 && o.spritesNoHook.onlyB === o.spritesNoHook.moving,
               "material.userData.previousPositionNode = makePreviousCopy(...).node.toAttribute(), the copy stepped before the pass that moves them");
            ok(`  [${mode}] ...and through a toward stage at t = 0.3, each particle on the line from where it was: ${e(o.spritesToward.w)} px over ${o.spritesToward.moving}`, same(o.spritesToward) && o.spritesToward.moving > 200);
            ok(`*** [${mode}] an INSTANCED mesh placed by the positions is instance matrices carrying them to ${e(o.instanced.w)} px over ${o.instanced.moving} pixels ***`, same(o.instanced) && o.instanced.moving > 150);
            ok(`*** [${mode}] a mesh DISPLACED by a positionNode that stands still is a mesh displaced by its geometry to ${e(o.displaced.w)} px over ${o.displaced.moving}, the largest ${o.displaced.big.toFixed(2)} -- it was 11.57 px off ***`,
               same(o.displaced) && o.displaced.moving > 80, "the node itself is the last position where none is given -- the stage had taken the bare geometry, and carried the displacement as motion");
            ok(`  [${mode}] a positionNode over instances with no previous one is refused by name`, typeof o.refused === "string" && o.refused.includes('"swarm"') && o.refused.includes("previousPositionNode"), o.refused);
        }
        const tw = r.result.webgpu.twoSystems, tg = r.result.webgl2.twoSystems;
        ok(`three's own: two particle systems in one renderer, stepped twice each -- moved on webgpu ${tw.join(", ")}, on webgl2 ${tg.join(", ")}`,
           tw.every((x) => x === true) && tg[0] === true && tg[1] === false,
           "three's WebGL2 backend runs only the first system's compute; when three fixes it this row goes red and says so, and the gate can share a renderer");
    }
}

// ---- v4762 SABOTAGE LOG ----------------------------------------------------------------------------------------
// Against render/temporalTsl.mjs, here (and render/temporalTslZoo-selfcheck.mjs green through every one): C1 a sprite's last
// centre its current one -> 4; C2 the hook not handed to the stage's sprite material -> 4; C3 its positionNode not handed ->
// 4; C4 its scaleNode not handed, C5 the scaleNode left out of the corner -> 4 each; C6 toward not lerped, C7 its t never set ->
// 2 each; C8 a displaced mesh's last point the bare geometry (as it was) -> 4; C9 the hook ignored on a mesh -> 2; C10 a
// positionNode over instances not refused -> 2; C11 makePreviousCopy copying element 0 to every particle -> 3 (a copy that
// copies nothing left the WebGL2 page unable to build, which hid the rows -- not counted); C12 the centre not the positionNode
// -> 4. Twelve, none green.
console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nALL GREEN");
console.log("unchecked here: a sprite turned by rotationNode (refused); a scaleNode or positionNode that CHANGES with no previous " +
    "one given, which the stage takes to stand still and cannot tell from one that does; sized points (a PointsNodeMaterial on " +
    "a Sprite), whose size is in pixels; and a positionNode over skinning or morphs, which the application must give whole.");
process.exitCode = fails ? 1 : 0;
