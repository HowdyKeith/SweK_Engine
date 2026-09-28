#!/usr/bin/env node
// WebGLEngine/render/temporalTslNodes-selfcheck.mjs -- v4770
//
// WHAT render/temporalTsl.mjs's MOTION STAGE REFUSED, FOLLOWED -- each held to a reference the stage already gets right:
//   turned     three Sprites turned by a ROTATION NODE, the last angle their material's userData.previousRotationNode -- against the
//              same sprites turned by the rotation property (v4761's path, exact to CPU corners); and one with no last angle,
//              which stands still -- against the property held at its angle
//   points     a Sprite of six sized POINTS (PointsNodeMaterial, sprite.count, a positionNode placing each and a sizeNode sizing
//              each in pixels), their last centres the userData.previousPositionNode -- against quads through the corners three's
//              points material makes, computed on the CPU at both frames and carried by the morph path; in pixels and attenuated
//   displaced  a positionNode displacing what three's morphing and instancing make, the last position given as a FUNCTION of
//              the point the stage keeps -- against the same displacement made by moving the object; and a skinned mesh's
//              identity, against the plain skinned mesh
// Before v4770 the stage threw on each: "a sprite turned by a node has no last pose", "a points material on a sprite sizes it in
// pixels", and a positionNode over morphs or instances needed the whole last position, which over a skin no application has.
"use strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runInEngineOrigin, webgpuSkipReason } from "../tools/ship/webgpuHarness.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let fails = 0;
const ok = (label, cond, detail) => { if (!cond) fails++; console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "   " + detail : ""}`); };
const D = 64;

console.log("\n1. ON THE DEVICE: what the stage refused, against references it already gets right");
const skip = webgpuSkipReason();
if (skip) { console.log(`  SKIP  ${skip}`); console.log("  ----  *** NOT A PASS. *** Nothing here is static."); fails++; }
else {
    const r = await runInEngineOrigin({ engineRoot: ENG, timeoutMs: 300000, args: { D, modes: ["webgpu", "webgl2"] }, script: `async (a) => {
    const THREE = await import("/vendor/three-webgpu/three.webgpu.js"); const T = await import("/vendor/three-webgpu/three.tsl.js");
    const TT = await import("/render/temporalTsl.mjs");
    const out = {};
    for (const mode of a.modes) { try {
        // the canvas is the target's size: three sizes an attenuated point by half the canvas height
        const D = a.D, canvas = document.createElement("canvas"); canvas.width = D; canvas.height = D;
        const renderer = new THREE.WebGPURenderer({ canvas, forceWebGL: mode === "webgl2", antialias: false }); await renderer.init(); renderer.setSize(D, D, false);
        const gl = TT.glClip(THREE, renderer), rd = async (t) => Array.from(await renderer.readRenderTargetPixelsAsync(t, 0, 0, D, D));
        const cam = new THREE.PerspectiveCamera(40, 1, 0.1, 50); cam.position.set(0.6, 0.4, 5); cam.lookAt(0, 0, 0); cam.updateMatrixWorld();
        const mat = () => new THREE.MeshBasicNodeMaterial({ color: 0xffffff });
        // three frames, the field read at the last (render/temporalTslZoo-selfcheck.mjs's)
        const fieldOf = async (scene, step) => { const st = TT.makeMotionStage(THREE, T, { w: D, h: D, gl });
            for (const k of [0, 1, 2]) { step(k); await st.render(renderer, scene, cam); }
            const m = await rd(st.motion); st.dispose(); return m; };
        const colourOf = async (scene) => { const t = new THREE.RenderTarget(D, D, { type: THREE.FloatType }); renderer.setRenderTarget(t); await renderer.renderAsync(scene, cam); const c = await rd(t); t.dispose(); renderer.setRenderTarget(null); return c; };
        const cmp = (A, B) => { let w = 0, moving = 0, big = 0, onlyA = 0, onlyB = 0; for (let i = 0; i < D * D; i++) { const ma = Math.hypot(A[i*4], A[i*4+1]) * D, mb = Math.hypot(B[i*4], B[i*4+1]) * D;
            if (ma > 0.01 || mb > 0.01) { moving++; big = Math.max(big, mb); w = Math.max(w, Math.hypot(A[i*4] - B[i*4], A[i*4+1] - B[i*4+1]) * D); if (ma <= 0.01) onlyB++; if (mb <= 0.01) onlyA++; } } return { w, moving, big, onlyA, onlyB }; };
        const reference = (P, C, index) => { const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(P, 3)); if (index) g.setIndex(index);
            const d = new Float32Array(P.length); for (let i = 0; i < P.length; i++) d[i] = C[i] - P[i]; g.morphAttributes.position = [new THREE.Float32BufferAttribute(d, 3)]; g.morphTargetsRelative = true;
            const m = new THREE.Mesh(g, mat()); m.material.side = THREE.DoubleSide; m.morphTargetInfluences = [0]; return m; };
        const o = {};
        // 1. TURNED BY A NODE: three sprites spinning, each by its own uniform, the last angle another -- and the same by the property
        { const mk = (byNode) => { const sc = new THREE.Scene(), sp = [];
              for (let i = 0; i < 3; i++) { const m = new THREE.SpriteNodeMaterial({ color: 0xffffff }); const s = new THREE.Sprite(m); s.scale.set(0.9, 0.5, 1); s.position.set(-1.1 + i * 1.1, 0.2 * i - 0.2, 0);
                  if (byNode) { const u = T.uniform(0), p = T.uniform(0); m.rotationNode = u; m.userData.previousRotationNode = p; s.userData.u = [u, p]; } sc.add(s); sp.push(s); }
              const step = (k) => sp.forEach((s, i) => { const a = (0.3 + 0.2 * i) * k, a0 = (0.3 + 0.2 * i) * (k - 1); if (byNode) { s.userData.u[0].value = a; s.userData.u[1].value = a0; } else s.material.rotation = a; s.updateMatrixWorld(); });
              return { sc, step }; };
          const N = mk(true), P = mk(false); o.turned = cmp(await fieldOf(N.sc, N.step), await fieldOf(P.sc, P.step));
          // no last angle: the node stands still -- against the property held at the angle it has at the frame read
          const S = mk(true); S.sc.children.forEach((s) => { s.material.userData.previousRotationNode = null; });
          const H = mk(false); o.turnedStill = cmp(await fieldOf(S.sc, S.step), await fieldOf(H.sc, (k) => H.step(2))); }
        // 2. SIZED POINTS ON A SPRITE: six, placed by a positionNode and sized in pixels by a sizeNode, their last centres a second array
        // at a pixel ratio of 2, which three multiplies a point's size by: at 1 the stage could forget it and read the same
        renderer.setPixelRatio(2);
        for (const [cn, atten] of [["points", false], ["pointsAttenuated", true]]) {
            const n = 6, now = [], was = [], sizes = []; for (let i = 0; i < n; i++) { now.push(new THREE.Vector3()); was.push(new THREE.Vector3()); sizes.push(3 + i); }
            const posU = T.uniformArray(now, "vec3"), prevU = T.uniformArray(was, "vec3"), sizeU = T.uniformArray(sizes, "float");
            const m = new THREE.PointsNodeMaterial({ color: 0xffffff, sizeAttenuation: atten }); m.positionNode = posU.element(T.instanceIndex);
            m.userData.previousPositionNode = prevU.element(T.instanceIndex);
            // in pixels: a size node each and a rotation node turning, its last angle given; attenuated: the material's size, one for all
            const angle = T.uniform(0), angle0 = T.uniform(0), SIZE = 0.35;
            if (atten) m.size = SIZE; else { m.sizeNode = sizeU.element(T.instanceIndex); m.rotationNode = angle; m.userData.previousRotationNode = angle0; }
            const sp = new THREE.Sprite(m); sp.count = n; const sc = new THREE.Scene(); sc.add(sp);
            const at = (i, k) => new THREE.Vector3(-1.2 + (i % 3) * 1.2 + 0.15 * k, -0.5 + Math.floor(i / 3) * 1.0 + 0.1 * k, (i % 2 ? 0.4 : -0.3) * k);
            const step = (k) => { for (let i = 0; i < n; i++) { now[i].copy(at(i, k)); was[i].copy(at(i, k - 1)); } angle.value = 0.35 * k; angle0.value = 0.35 * (k - 1); };
            // the corners three's points material makes: the centre through the camera, each corner size px (attenuated: x half the
            // canvas height over the view depth) about it, over half the viewport, times the clip w; then back to the world at the centre's depth
            const corners = (k) => { const out = [], v = new THREE.Vector4(), inv = new THREE.Matrix4().copy(cam.projectionMatrixInverse);
                for (let i = 0; i < n; i++) { const c = at(i, k), mv = c.clone().applyMatrix4(cam.matrixWorldInverse), clip = new THREE.Vector4(mv.x, mv.y, mv.z, 1).applyMatrix4(cam.projectionMatrix);
                    const ps = (atten ? SIZE * (D / 2) / -mv.z : sizes[i]) * renderer.getPixelRatio(), a = atten ? 0 : 0.35 * k, co = Math.cos(a), sn = Math.sin(a);
                    for (const [bx, by] of [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]]) { const ax = co * bx - sn * by, ay = sn * bx + co * by;
                        v.set(clip.x + ax * ps / (D / 2) * clip.w, clip.y + ay * ps / (D / 2) * clip.w, clip.z, clip.w).applyMatrix4(inv); v.divideScalar(v.w);
                        const wpt = new THREE.Vector3(v.x, v.y, v.z).applyMatrix4(cam.matrixWorld); out.push(wpt.x, wpt.y, wpt.z); } }
                return Float32Array.from(out); };
            const F = await fieldOf(sc, step); step(2); const Cc = await colourOf(sc);
            const idx = []; for (let i = 0; i < n; i++) idx.push(i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3);
            const ref = reference(corners(1), corners(2), idx), rs = new THREE.Scene(); rs.add(ref);
            const R = await fieldOf(rs, (k) => { ref.morphTargetInfluences[0] = k === 2 ? 1 : 0; });
            let colour = 0; for (let i = 0; i < D * D; i++) if (Cc[i * 4] > 0.5) colour++; o[cn] = { colour, ...cmp(F, R) };
        }
        renderer.setPixelRatio(1);
        // 3. DISPLACED OVER MORPHS AND INSTANCES, the last position a function of the kept point: against the object moved instead
        { const off = T.uniform(new THREE.Vector3()), offPrev = T.uniform(new THREE.Vector3()), d = (k) => new THREE.Vector3(0.25 * k, -0.1 * k, 0.15 * k);
          // a morphed plane: the influence moves and the positionNode displaces -- against the influence moving and the mesh moved
          const plane = () => { const g = new THREE.PlaneGeometry(1.6, 1, 8, 4), t = g.attributes.position.array.slice(); for (let i = 0; i < t.length; i += 3) t[i + 2] = 0.3 * Math.sin(t[i] * 2);
              for (let i = 0; i < t.length; i++) t[i] -= g.attributes.position.array[i]; g.morphAttributes.position = [new THREE.Float32BufferAttribute(t, 3)]; g.morphTargetsRelative = true; return g; };
          const mA = new THREE.Mesh(plane(), mat()); mA.morphTargetInfluences = [0]; mA.material.positionNode = T.positionLocal.add(off); mA.material.userData.previousPositionNode = (p) => p.add(offPrev); mA.material.side = THREE.DoubleSide;
          const mB = new THREE.Mesh(plane(), mat()); mB.morphTargetInfluences = [0]; mB.material.side = THREE.DoubleSide;
          const sA = new THREE.Scene(); sA.add(mA); const sB = new THREE.Scene(); sB.add(mB);
          o.morphed = cmp(await fieldOf(sA, (k) => { mA.morphTargetInfluences[0] = 0.5 * k; off.value.copy(d(k)); offPrev.value.copy(d(k - 1)); }),
                          await fieldOf(sB, (k) => { mB.morphTargetInfluences[0] = 0.5 * k; mB.position.copy(d(k)); mB.updateMatrixWorld(); }));
          // three instances moving by their matrices, displaced by the node -- against the displacement in the matrices
          const box = new THREE.BoxGeometry(0.4, 0.4, 0.4), iA = new THREE.InstancedMesh(box, mat(), 3), iB = new THREE.InstancedMesh(box, mat(), 3), q = new THREE.Matrix4();
          iA.material.positionNode = T.positionLocal.add(off); iA.material.userData.previousPositionNode = (p) => p.add(offPrev);
          const place = (im, k, extra) => { for (let i = 0; i < 3; i++) { q.makeRotationY(0.3 * k + i); q.setPosition(-1 + i + 0.1 * k + (extra ? d(k).x : 0), 0.2 * i + (extra ? d(k).y : 0), extra ? d(k).z : 0); im.setMatrixAt(i, q); } im.instanceMatrix.needsUpdate = true; };
          const s2A = new THREE.Scene(); s2A.add(iA); const s2B = new THREE.Scene(); s2B.add(iB);
          o.instanced = cmp(await fieldOf(s2A, (k) => { place(iA, k, false); off.value.copy(d(k)); offPrev.value.copy(d(k - 1)); }), await fieldOf(s2B, (k) => place(iB, k, true)));
          // a skinned mesh, two bones: the positionNode the identity and the last position the identity of the kept point -- against the plain mesh
          const skinned = (withNode) => { const g = new THREE.PlaneGeometry(2, 0.6, 20, 2), cnt = g.attributes.position.count, si = [], sw = [];
              for (let i = 0; i < cnt; i++) { const x = g.attributes.position.getX(i), w = Math.min(1, Math.max(0, (x + 0.5)));
                  si.push(0, 1, 0, 0); sw.push(1 - w, w, 0, 0); }
              g.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(si, 4)); g.setAttribute("skinWeight", new THREE.Float32BufferAttribute(sw, 4));
              const b0 = new THREE.Bone(), b1 = new THREE.Bone(); b1.position.x = 0.8; b0.add(b1); const m = new THREE.SkinnedMesh(g, mat()); m.add(b0); m.bind(new THREE.Skeleton([b0, b1]));
              if (withNode) { m.material.positionNode = T.positionLocal; m.material.userData.previousPositionNode = (p) => p; }
              const sc = new THREE.Scene(); sc.add(m); return { sc, step: (k) => { b1.rotation.z = 0.3 * k; b0.position.y = 0.1 * k; m.updateMatrixWorld(true); } }; };
          const kA = skinned(true), kB = skinned(false); o.skinned = cmp(await fieldOf(kA.sc, kA.step), await fieldOf(kB.sc, kB.step));
          // a function over a batch is refused by name
          const bm = new THREE.BatchedMesh(2, 64, 128, mat()); bm.material.positionNode = T.positionLocal; bm.material.userData.previousPositionNode = (p) => p;
          const bs = new THREE.Scene(); bs.add(bm); const st = TT.makeMotionStage(THREE, T, { w: D, h: D, gl });
          try { await st.render(renderer, bs, cam); o.batchRefused = "no throw"; } catch (e) { o.batchRefused = String(e.message).slice(0, 160); } st.dispose(); }
        out[mode] = o; renderer.dispose();
    } catch (err) { out[mode] = { err: String(err && err.stack || err).slice(0, 900) }; } }
    return out; }` });
    ok("the harness ran every case on BOTH backends", r.ok && r.result && !r.result.webgpu.err && !r.result.webgl2.err,
       r.ok ? `webgpu ${r.result.webgpu.err || "ok"}; webgl2 ${r.result.webgl2.err || "ok"}` : (r.reason || (r.pageErrors || []).join("; ")));
    if (r.ok && r.result) for (const mode of ["webgpu", "webgl2"]) {
        const o = r.result[mode]; if (!o || o.err) continue; const e = (v) => v.toExponential(1), same = (c) => c.onlyA === 0 && c.onlyB === 0;
        ok(`*** [${mode}] SPRITES TURNED BY A ROTATION NODE: the field is the rotation property's to ${e(o.turned.w)} px over ${o.turned.moving} pixels, the largest ${o.turned.big.toFixed(2)} px -- the stage refused them ***`,
           same(o.turned) && o.turned.w < 1e-4 && o.turned.moving > 300,
           "three's sprite material reads the rotation node in place of the property; the stage places each corner turned by it, and at the last draw by material.userData.previousRotationNode");
        ok(`  [${mode}] ...and one given no last angle stands still, as a positionNode given no last position does: ${o.turnedStill.moving} pixels move, as the property held at its angle`,
           same(o.turnedStill) && o.turnedStill.w === 0 && o.turnedStill.moving === 0, "the node itself is the last angle where none is given");
        for (const [cn, what] of [["points", "sized in pixels by a size node and turning by a rotation node"], ["pointsAttenuated", "the material's size, attenuated with depth"]])
            ok(`${cn === "points" ? "***" : " "} [${mode}] SIZED POINTS ON A SPRITE, ${what}: the field covers exactly the ${o[cn].colour} pixels three's points material draws and is the CPU's corners' to ${e(o[cn].w)} px, the largest ${o[cn].big.toFixed(2)} px${cn === "points" ? " -- the stage refused them ***" : ""}`,
               same(o[cn]) && o[cn].moving === o[cn].colour && o[cn].w < 2e-3 && o[cn].moving > (cn === "points" ? 400 : 60),
               "PointsNodeMaterial's own placement, at a pixel ratio of 2: the centre through the camera, each corner its size in pixels about it -- times the pixel ratio, attenuated by half the canvas height over the view depth, turned by the rotation node -- over half the viewport, times the clip w; at the last draw from material.userData.previousPositionNode and previousRotationNode. The turning points' 1.8e-3 px is the rotation's sine and cosine in f32 on the device against f64 on the CPU, render/temporalTslZoo-selfcheck.mjs's bound for its turning sprites");
        ok(`*** [${mode}] A POSITION NODE DISPLACING WHAT THREE MORPHS AND INSTANCES, the last position a function of the point the stage keeps: the object moved instead to ${e(o.morphed.w)} and ${e(o.instanced.w)} px over ${o.morphed.moving} and ${o.instanced.moving} pixels; over a skin, the identity the plain skin's to ${e(o.skinned.w)} ***`,
           same(o.morphed) && same(o.instanced) && same(o.skinned) && o.morphed.w < 1e-3 && o.instanced.w < 1e-3 && o.skinned.w < 1e-3 && o.morphed.moving > 300 && o.instanced.moving > 100 && o.skinned.moving > 200,
           "material.userData.previousPositionNode = (p) => p.add(offsetBefore): p is the geometry through the previous influences, bone matrices or instance matrix -- the application says how it displaced the point, the stage has where the point was");
        ok(`  [${mode}] ...and a function over a batch, whose points the stage does not keep, is refused by name`, /previousPositionNode as a function over a batch/.test(o.batchRefused || ""), o.batchRefused);
    }
}
// ---- v4770 SABOTAGE LOG ----------------------------------------------------------------------------------------
// Against render/temporalTsl.mjs, here (and render/temporalTslZoo-selfcheck.mjs, 0 on every one: its sprites are the property's):
// N1 the rotation node not read now -> 4; N2 the last angle not read -> 4; N3 a node's last angle the property's -> 6; N4 the pixel
// ratio forgotten -> 4; N5 attenuation ignored -> 2; N6 attenuated by the full canvas height -> 2; N7 a point's last centre its
// centre now -> 4; N8 its last corner at this frame's rotation -> 2; N9 its corner not times the clip w -> 4; N10 a points
// material drawn as a sprite's -> 4; N11 the material's size not copied -> 2; N12 the rotation node not copied -> 4; N13 the last
// angle not copied -> 4; N14 the function given the bare geometry -> 2; N15 the kept instance point through this frame's matrix
// -> 2; N16 a function over a batch not refused -> 2. Sixteen, none green.
// *** THREE OF THEM WERE GREEN ON THE FIRST DRAFT OF THIS GATE, WHICH HAD NO POPULATION FOR THEM. *** It ran at a pixel ratio of 1,
// where forgetting it (N4) reads the same; its points did not turn (N8); and every one had a size node, so the material's size
// (N11) was never read. The points are drawn at a pixel ratio of 2 now, the pixel-sized ones turn, and the attenuated ones take
// the material's size.
console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nALL GREEN");
console.log("unchecked here: a size node that CHANGES, whose last value the stage does not keep -- a point is taken to have its size now at " +
    "the last draw too; points drawn by THREE.Points, one pixel each in three's WebGPU renderer and render/temporalTslZoo-selfcheck.mjs's; " +
    "and the batch, whose points the stage does not keep.");
process.exitCode = fails ? 1 : 0;
