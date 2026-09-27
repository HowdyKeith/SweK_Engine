#!/usr/bin/env node
// WebGLEngine/render/temporalTslZoo-selfcheck.mjs -- v4761
//
// THE REST OF THE MESH ZOO THROUGH render/temporalTsl.mjs's MOTION STAGE, each held to a reference the stage already gets right:
//   multibone  a SkinnedMesh of three bones, each vertex's weight spread over up to three of them, the bones moving and turning
//              otherwise -- against a mesh carrying three's OWN CPU skinning (getVertexPosition) at both frames, through the
//              morph path (base the last frame's points, one relative target to this frame's; held to rigid at v4757)
//   skinMorph  the same mesh morphed as well, the influence moving -- against three's CPU morph-then-skin the same way
// Three frames each, the field read at the last: a history kept and never stepped reads right after two.
//   batched    a BatchedMesh, two geometries, four instances each moved and turned by its own matrix, at depths three's sort
//              reverses (so the draw id is not the instance's) -- against four plain
//              meshes moved by the same matrices; and through a toward stage at t = 0.3, against them through one
//   points     Points, one pixel each in three's WebGPU renderer -- against points carried by the morph path
//   sprites    six Sprites, moving toward the camera and growing, three spinning, three not attenuating with depth, two off-centre, under a turned
//              camera -- against quads through the corners three's sprite material makes, computed on the CPU at both
//              frames; and toward t = 0.3 against the stage from the pose at t
//   twoSkins, twoMorphs  two skinned meshes of one layout on two skeletons, and two meshes of one morphed geometry -- one
//              program each pair, since three keys programs by layout and bone count
// *** THE FIRST PROBE FOUND TWO WRONG, AND THE SECOND THREE MORE. *** (Each figure is this gate's, run on the stage as v4760 left
// it.) A BatchedMesh's field was 32.7 px off: three applies each instance's matrix to the
// current point and not to positionPrevious, so the previous point was the bare geometry's. A Sprite's was 5.74 px off, and most of
// the pixels it draws carried none: the override draws a sprite as the flat quad its geometry is -- it is three's
// sprite material that turns it to the camera. The stage keeps a BatchedMesh's previous matrices, and draws each sprite with
// a sprite material of its own carrying the motion node, which places each corner as three does, now and at the last draw.
// Then two skinned meshes sharing a program read 44.7 px off and two meshes of one morphed geometry 1.06:
// v4757's histories were buffers built INTO the program for the first object, and three shares a program between objects of
// one layout. They are per-draw nodes now, filled before each object's draw. And three itself binds a sprite's centre the same
// way: its colour pass draws a centred sprite after an off-centre one at the other's centre. The stage draws where the
// application put each sprite, and the row measuring three's pass says so.
"use strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runInEngineOrigin, webgpuSkipReason } from "../tools/ship/webgpuHarness.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let fails = 0;
const ok = (label, cond, detail) => { if (!cond) fails++; console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "   " + detail : ""}`); };
const D = 64;

console.log("\n1. ON THE DEVICE: the zoo against references the stage already gets right");
const skip = webgpuSkipReason();
if (skip) { console.log(`  SKIP  ${skip}`); console.log("  ----  *** NOT A PASS. *** Nothing here is static."); fails++; }
else {
    const r = await runInEngineOrigin({ engineRoot: ENG, timeoutMs: 300000, args: { D, modes: ["webgpu", "webgl2"] }, script: `async (a) => {
    const THREE = await import("/vendor/three-webgpu/three.webgpu.js"); const T = await import("/vendor/three-webgpu/three.tsl.js");
    const TT = await import("/render/temporalTsl.mjs");
    const out = {};
    for (const mode of a.modes) { try {
        const D = a.D, canvas = document.createElement("canvas"); canvas.width = 8; canvas.height = 8;
        const renderer = new THREE.WebGPURenderer({ canvas, forceWebGL: mode === "webgl2", antialias: false }); await renderer.init();
        const gl = TT.glClip(THREE, renderer), rd = async (t) => Array.from(await renderer.readRenderTargetPixelsAsync(t, 0, 0, D, D));
        const cam = new THREE.PerspectiveCamera(40, 1, 0.1, 50); cam.position.set(0, 0, 5); cam.lookAt(0, 0, 0); cam.updateMatrixWorld();
        const mat = () => new THREE.MeshBasicNodeMaterial({ color: 0xffffff });
        // the field of a scene, step(k) posing it at frame k -- with t, through a toward stage: each surface's displacement to its
        // pose at t between the last two frames. THREE frames, 0, 1 and 2, the field read at the last: a history that is kept but never stepped reads right after two
        const fieldOf = async (scene, step, t = null) => { const st = TT.makeMotionStage(THREE, T, { w: D, h: D, gl, toward: t !== null });
            for (const k of [0, 1, 2]) { step(k); await st.render(renderer, scene, cam, t ?? 0.5); }
            const m = await rd(st.motion); st.dispose(); return m; };
        const colourOf = async (scene) => { const t = new THREE.RenderTarget(D, D, { type: THREE.FloatType }); renderer.setRenderTarget(t); await renderer.renderAsync(scene, cam); const c = await rd(t); t.dispose(); renderer.setRenderTarget(null); return c; };
        const cmp = (A, B) => { let w = 0, moving = 0, big = 0, onlyA = 0, onlyB = 0; for (let i = 0; i < D * D; i++) { const ma = Math.hypot(A[i*4], A[i*4+1]) * D, mb = Math.hypot(B[i*4], B[i*4+1]) * D;
            if (ma > 0.01 || mb > 0.01) { moving++; big = Math.max(big, mb); w = Math.max(w, Math.hypot(A[i*4] - B[i*4], A[i*4+1] - B[i*4+1]) * D); if (ma <= 0.01) onlyB++; if (mb <= 0.01) onlyA++; } } return { w, moving, big, onlyA, onlyB }; };
        // a reference mesh: base P, one relative target C - P, influence 0 then 1 -- the morph path, held exact to rigid at v4757
        const reference = (P, C, index) => { const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(P, 3)); if (index) g.setIndex(index);
            const d = new Float32Array(P.length); for (let i = 0; i < P.length; i++) d[i] = C[i] - P[i]; g.morphAttributes.position = [new THREE.Float32BufferAttribute(d, 3)]; g.morphTargetsRelative = true;
            const m = new THREE.Mesh(g, mat()); m.morphTargetInfluences = [0]; return m; };
        const cpu = (mesh) => { const n = mesh.geometry.attributes.position.count, o = new Float32Array(n * 3), v = new THREE.Vector3(); mesh.updateMatrixWorld(true);
            for (let i = 0; i < n; i++) { mesh.getVertexPosition(i, v); o[i*3] = v.x; o[i*3+1] = v.y; o[i*3+2] = v.z; } return o; };
        const o = {};
        // FIRST, before any sprite has built a program: three's own colour pass, an off-centre sprite first, then a centred one with a like material, then one with an unlike
        { const meanX = async (sc) => { const t = new THREE.RenderTarget(D, D, { type: THREE.FloatType }); renderer.setRenderTarget(t); await renderer.renderAsync(sc, cam); const c = await rd(t); t.dispose();
              renderer.setRenderTarget(null); let n = 0, sx = 0; for (let i = 0; i < D * D; i++) if (c[i * 4] > 0.5) { n++; sx += i % D; } return sx / n; };
          const one = (cx, unlike) => { const m = new THREE.SpriteNodeMaterial({ color: 0xfffffe }); if (unlike) m.alphaTest = 0.01; const s = new THREE.Sprite(m); s.scale.set(0.8, 0.8, 1); s.center.set(cx, 0.5);
              const sc = new THREE.Scene(); sc.add(s); return sc; };
          o.threeCentre = { off: await meanX(one(0.0, false)), likeCentred: await meanX(one(0.5, false)), unlikeCentred: await meanX(one(0.5, true)) }; }
        // 1. SKINNED, three bones along x, each vertex's weight spread over up to three of them; and 2. the same mesh morphed as well
        for (const [cn, morph] of [["multibone", false], ["skinMorph", true]]) {
            const g = new THREE.PlaneGeometry(3, 1, 30, 4), n = g.attributes.position.count, si = [], sw = [];
            for (let i = 0; i < n; i++) { const x = g.attributes.position.getX(i); const w = [0, 1, 2].map((b) => Math.max(0, 1 - Math.abs(x - (b - 1) * 1.2) / 1.3)); const s = w[0] + w[1] + w[2];
                si.push(0, 1, 2, 0); sw.push(w[0] / s, w[1] / s, w[2] / s, 0); }
            g.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(si, 4)); g.setAttribute("skinWeight", new THREE.Float32BufferAttribute(sw, 4));
            if (morph) { const d = new Float32Array(n * 3); for (let i = 0; i < n; i++) { const x = g.attributes.position.getX(i); d[i*3+1] = 0.3 * Math.sin(x * 2); d[i*3+2] = 0.2; }
                g.morphAttributes.position = [new THREE.Float32BufferAttribute(d, 3)]; g.morphTargetsRelative = true; }
            const bones = [0, 1, 2].map((b) => { const bn = new THREE.Bone(); bn.position.set((b - 1) * 1.2, 0, 0); return bn; });
            const sm = new THREE.SkinnedMesh(g, mat()); const sc = new THREE.Scene(); for (const b of bones) sc.add(b); sc.add(sm); sm.bind(new THREE.Skeleton(bones));
            if (morph) sm.morphTargetInfluences = [0];
            const pose = (k) => { bones[0].position.y = 0.1 * k; bones[1].rotation.z = 0.25 * k; bones[2].position.set(1.2 + 0.2 * k, -0.3 * k, 0); bones[2].rotation.z = -0.3 * k;
                if (morph) sm.morphTargetInfluences[0] = 0.2 + 0.5 * k; for (const b of bones) b.updateMatrixWorld(true); sm.skeleton.update(); };
            pose(1); const P = cpu(sm); pose(2); const C = cpu(sm);
            const F = await fieldOf(sc, pose);
            const ref = reference(P, C, g.index), rs = new THREE.Scene(); rs.add(ref);
            const R = await fieldOf(rs, (k) => { ref.morphTargetInfluences[0] = k === 2 ? 1 : 0; });
            o[cn] = cmp(F, R);
        }
        // SHARED PROGRAMS: three keys a compiled program by the material's properties and the geometry's layout -- a skinned mesh
        // by its bone count, not its skeleton -- so two skinned meshes of one layout, or two meshes of one morphed geometry, are
        // drawn by ONE program. Anything held per object must reach the draw per draw, not be built into the program
        { const mk = () => { const g = new THREE.CylinderGeometry(0.25, 0.25, 2.4, 12, 12), n = g.attributes.position.count, si = [], sw = [];
              for (let i = 0; i < n; i++) { const y = g.attributes.position.getY(i), w1 = Math.min(1, Math.max(0, (y + 0.6) / 1.2)); si.push(0, 1, 0, 0); sw.push(1 - w1, w1, 0, 0); }
              g.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(si, 4)); g.setAttribute("skinWeight", new THREE.Float32BufferAttribute(sw, 4)); return g; };
          const g = mk(), sc = new THREE.Scene(), rigs = [];
          for (const [x, dir] of [[-0.9, 1], [0.9, -1]]) { const b0 = new THREE.Bone(), b1 = new THREE.Bone(); b0.position.set(x, -0.6, 0); b1.position.set(0, 1.2, 0); b0.add(b1); sc.add(b0);
              const sm = new THREE.SkinnedMesh(g, mat()); sm.position.set(0, dir > 0 ? 0 : 0.3, 0); sm.updateMatrixWorld(); sc.add(sm); sm.bind(new THREE.Skeleton([b0, b1])); rigs.push({ sm, b0, b1, x, dir }); }
          const pose = (k) => { for (const q of rigs) { q.b0.position.x = q.x + 0.15 * k * q.dir; q.b1.rotation.z = 0.35 * k * q.dir; q.b0.updateMatrixWorld(true); q.sm.skeleton.update(); } };
          pose(1); const P = rigs.map((q) => cpu(q.sm)); pose(2); const C = rigs.map((q) => cpu(q.sm));
          const F = await fieldOf(sc, pose), rs = new THREE.Scene(), refs = rigs.map((q, i) => { const m = reference(P[i], C[i], g.index); m.position.copy(q.sm.position); return m; }); for (const m of refs) rs.add(m);
          o.twoSkins = cmp(F, await fieldOf(rs, (k) => { for (const m of refs) m.morphTargetInfluences[0] = k === 2 ? 1 : 0; })); }
        { const g = new THREE.PlaneGeometry(1.2, 1.2, 8, 8), n = g.attributes.position.count, d = new Float32Array(n * 3);
          for (let i = 0; i < n; i++) { d[i * 3 + 1] = 0.4 * g.attributes.position.getX(i); d[i * 3 + 2] = 0.3; } g.morphAttributes.position = [new THREE.Float32BufferAttribute(d, 3)]; g.morphTargetsRelative = true;
          const sc = new THREE.Scene(), ms = [[-0.8, 0.2, 0.5], [0.8, 0.9, -0.4]].map(([x, a0, da]) => { const m = new THREE.Mesh(g, mat()); m.position.x = x; m.morphTargetInfluences = [a0]; m.userData.a = [a0, da]; sc.add(m); return m; });
          const set = (k) => { for (const m of ms) m.morphTargetInfluences[0] = m.userData.a[0] + m.userData.a[1] * k; };
          set(1); const P = ms.map(cpu); set(2); const C = ms.map(cpu);
          const F = await fieldOf(sc, set), rs = new THREE.Scene(), refs = ms.map((m, i) => { const r = reference(P[i], C[i], g.index); r.position.copy(m.position); rs.add(r); return r; });
          o.twoMorphs = cmp(F, await fieldOf(rs, (k) => { for (const m of refs) m.morphTargetInfluences[0] = k === 2 ? 1 : 0; })); }
        // 3. BATCHED: two geometries, four instances, each moved by its own matrix -- against four plain meshes moved the same
        { const gA = new THREE.BoxGeometry(0.6, 0.6, 0.6), gB = new THREE.SphereGeometry(0.35, 16, 12);
          const bm = new THREE.BatchedMesh(4, 2000, 6000, mat()); const ia = bm.addGeometry(gA), ib = bm.addGeometry(gB); const ids = [ia, ib, ia, ib].map((gid) => bm.addInstance(gid));
          const sc = new THREE.Scene(); sc.add(bm); bm.perObjectFrustumCulled = false; bm.frustumCulled = false;
          const plain = [gA, gB, gA, gB].map((gg) => new THREE.Mesh(gg, mat())), ps = new THREE.Scene(); for (const p of plain) ps.add(p);
          const M = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s1 = new THREE.Vector3(1, 1, 1);
          const at = (i, k) => M.compose(new THREE.Vector3(-1.2 + (i % 2) * 2.4 + 0.3 * k * (i - 1.5), -0.8 + Math.floor(i / 2) * 1.6 + 0.2 * k, 0.3 * i), q.setFromEuler(e.set(0.3 * k * i, 0.5 * k, 0)), s1);
          const F = await fieldOf(sc, (k) => { ids.forEach((id, i) => bm.setMatrixAt(id, at(i, k))); });
          const R = await fieldOf(ps, (k) => { plain.forEach((p, i) => { at(i, k).decompose(p.position, p.quaternion, p.scale); p.updateMatrixWorld(); }); });
          o.batched = cmp(F, R);
          const place = (k) => { ids.forEach((id, i) => bm.setMatrixAt(id, at(i, k))); }, placePlain = (k) => { plain.forEach((p, i) => { at(i, k).decompose(p.position, p.quaternion, p.scale); p.updateMatrixWorld(); }); };
          o.batchedToward = cmp(await fieldOf(sc, place, 0.3), await fieldOf(ps, placePlain, 0.3)); }
        // 4. POINTS and 5. SPRITES translating: the field against their coverage in colour and the displacement they make
        cam.position.set(2.5, 1.8, 4.2); cam.lookAt(0, 0, 0); cam.updateMatrixWorld();
        // 4. POINTS (one pixel each in three's WebGPU renderer), against their coverage and each point's own displacement
        { const pg = new THREE.BufferGeometry(); const pp = []; for (let i = 0; i < 12; i++) pp.push(-1.2 + (i % 4) * 0.8, -0.6 + Math.floor(i / 4) * 0.6, 0);
          pg.setAttribute("position", new THREE.Float32BufferAttribute(pp, 3)); const obj = new THREE.Points(pg, new THREE.PointsNodeMaterial({ color: 0xffffff })); const sc = new THREE.Scene(); sc.add(obj);
          const step = (k) => { obj.position.set(0.2 * k, 0.1 * k, 0); obj.updateMatrixWorld(true); };
          const F = await fieldOf(sc, step); step(2); const Cc = await colourOf(sc);
          const at = (k) => Float32Array.from(pp.map((v, i) => v + (i % 3 === 0 ? 0.2 * k : i % 3 === 1 ? 0.1 * k : 0))), ref = reference(at(1), at(2), null);
          const rp = new THREE.Points(ref.geometry, new THREE.PointsNodeMaterial({ color: 0xffffff })); rp.morphTargetInfluences = [0]; const rs = new THREE.Scene(); rs.add(rp);
          const R = await fieldOf(rs, (k) => { rp.morphTargetInfluences[0] = k === 2 ? 1 : 0; });
          let colour = 0; for (let i = 0; i < D * D; i++) if (Cc[i * 4] > 0.5) colour++; o.points = { colour, ...cmp(F, R) }; }
        // 5. SPRITES: moving, scaled, some spinning, some not attenuating -- against quads through the corners three's sprite
        //    material makes, computed on the CPU at both frames and carried by the morph path
        { const sc = new THREE.Scene(), grp = new THREE.Group(); sc.add(grp); const sp = [];
          for (let i = 0; i < 6; i++) { const m = new THREE.SpriteNodeMaterial({ color: 0xffffff, sizeAttenuation: i % 2 === 0 }); const s = new THREE.Sprite(m);
              s.userData.base = [i % 2 === 0 ? 0.5 : 0.1, i % 2 === 0 ? 0.35 : 0.08]; if (i % 3 === 0) s.center.set(0.3, 0.7); s.position.set(-1.0 + (i % 3) * 1.0, -0.5 + Math.floor(i / 3) * 1.0, 0); grp.add(s); sp.push(s); }
          const step = (k) => { grp.position.set(0.2 * k, 0.1 * k, 0.3 * k); sp.forEach((s, i) => { s.material.rotation = (i < 3 ? 0.4 : 0) * k; s.scale.set(s.userData.base[0] * (1 + 0.15 * k), s.userData.base[1] * (1 + 0.15 * k), 1); }); grp.updateMatrixWorld(true); };
          const corners = () => { const out = []; const v = new THREE.Vector3(), mv = new THREE.Vector3();
              for (const s of sp) { mv.setFromMatrixPosition(s.matrixWorld).applyMatrix4(cam.matrixWorldInverse);
                  const sx = new THREE.Vector3().setFromMatrixColumn(s.matrixWorld, 0).length(), sy = new THREE.Vector3().setFromMatrixColumn(s.matrixWorld, 1).length(), att = s.material.sizeAttenuation ? 1 : -mv.z;
                  const c = Math.cos(s.material.rotation), sn = Math.sin(s.material.rotation);
                  for (const [ax, ay] of [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]]) { const x = (ax - (s.center.x - 0.5)) * sx * att, y = (ay - (s.center.y - 0.5)) * sy * att;
                      v.set(mv.x + c * x - sn * y, mv.y + sn * x + c * y, mv.z).applyMatrix4(cam.matrixWorld); out.push(v.x, v.y, v.z); } }
              return Float32Array.from(out); };
          step(1); const P = corners(); step(2); const C = corners(); const idx = []; for (let i = 0; i < 6; i++) idx.push(i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3);
          const own = sp.map((q) => q.material);
          const F = await fieldOf(sc, step); step(2); const Cc = await colourOf(sc); o.spritesOwn = sp.every((q, i) => q.material === own[i]);
          const ref = reference(P, C, idx); ref.material.side = THREE.DoubleSide; const rs = new THREE.Scene(); rs.add(ref);
          const R = await fieldOf(rs, (k) => { ref.morphTargetInfluences[0] = k === 2 ? 1 : 0; });
          let colour = 0; for (let i = 0; i < D * D; i++) if (Cc[i * 4] > 0.5) colour++; o.sprites = { colour, ...cmp(F, R) };
          // toward t: the same as the plain stage from the pose at t -- position and rotation both move on a line here
          o.spritesToward = cmp(await fieldOf(sc, step, 0.3), await fieldOf(sc, (k) => step(k === 1 ? 1.3 : k))); }
        if (mode === "webgpu") {
            // what the stage cannot follow, refused by the object's name
            const refused = async (build) => { const sc = new THREE.Scene(), st = TT.makeMotionStage(THREE, T, { w: D, h: D, gl }), after = build(sc);
                try { await st.render(renderer, sc, cam); if (after) { after(); await st.render(renderer, sc, cam); } return "drawn"; } catch (e) { return String(e.message); } finally { st.dispose(); } };
            o.refusals = {
                points: await refused((sc) => { const s = new THREE.Sprite(new THREE.PointsNodeMaterial({ color: 0xffffff })); s.name = "dots"; sc.add(s); }),
                placed: await refused((sc) => { const m = new THREE.SpriteNodeMaterial(); m.positionNode = T.vec3(0.1, 0, 0); const s = new THREE.Sprite(m); s.name = "placed"; sc.add(s); }),
                grown: await refused((sc) => { const b = new THREE.BatchedMesh(4, 100, 300, mat()); b.name = "crowd"; b.addInstance(b.addGeometry(new THREE.BoxGeometry(0.3, 0.3, 0.3))); sc.add(b);
                    return () => { b.setInstanceCount(64); }; }),
            };
        }
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
            ok(`*** [${mode}] a BATCHED mesh's field is four plain meshes' moved by the same matrices to ${e(o.batched.w)} px, over ${o.batched.moving} pixels, the largest ${o.batched.big.toFixed(2)} px -- it was 32.7 px off ***`,
               same(o.batched) && o.batched.moving > 300 && o.batched.big > 5, "the stage keeps each instance's previous matrix, read as three reads the current one");
            ok(`  [${mode}] ...and through a toward stage at t = 0.3, each instance on its arc: ${e(o.batchedToward.w)} px over ${o.batchedToward.moving} -- it was 34.2`, same(o.batchedToward) && o.batchedToward.moving > 300);
            ok(`*** [${mode}] SPRITES: the field covers exactly the ${o.sprites.moving} pixels the CPU's corners do and is theirs to ${e(o.sprites.w)} px, the largest ${o.sprites.big.toFixed(2)} -- moving, growing, spinning, not attenuating, off-centre -- it was 5.74 px off ***`,
               o.sprites.w < 2e-3 && o.sprites.onlyA === 0 && o.sprites.onlyB === 0 && o.sprites.moving > 500, "each sprite drawn with a sprite material of the stage's whose vertexNode places each corner as three means to, from per-draw uniforms");
            const tc = o.threeCentre;
            ok(`  [${mode}] ...where THREE's own colour pass does not: a centred sprite drawn after an off-centre one with a like material is drawn at the other's centre -- mean x ${tc.likeCentred.toFixed(1)} px, as the off-centre one's ${tc.off.toFixed(1)}; with an unlike material ${tc.unlikeCentred.toFixed(1)}`,
               Math.abs(tc.likeCentred - tc.off) < 0.01 && Math.abs(tc.unlikeCentred - tc.off) > 3,
               "three builds reference('center', ..., object) into a program every like sprite shares -- measured, not fixed here; when three fixes it this row goes red and says so");
            ok(`  [${mode}] ...and after the stage's pass every sprite has its own material again: ${o.spritesOwn}`, o.spritesOwn === true);
            ok(`  [${mode}] ...and toward t = 0.3, the stage from the pose at t: ${e(o.spritesToward.w)} px over ${o.spritesToward.moving}`, same(o.spritesToward) && o.spritesToward.moving > 250);
            ok(`  [${mode}] a SkinnedMesh with each vertex over up to three bones is three's own CPU skinning to ${e(o.multibone.w)} px over ${o.multibone.moving} pixels, and skinned and morphed ${e(o.skinMorph.w)} over ${o.skinMorph.moving}`,
               same(o.multibone) && same(o.skinMorph) && o.multibone.moving > 800 && o.skinMorph.moving > 800, "right before this round: the rows are the zoo's census, not a fix");
            ok(`*** [${mode}] meshes that share ONE PROGRAM keep their own histories: two skinned meshes of one layout on two skeletons ${e(o.twoSkins.w)} px over ${o.twoSkins.moving}, two meshes of one morphed geometry ${e(o.twoMorphs.w)} over ${o.twoMorphs.moving} -- they were 44.7 and 1.06 px off ***`,
               same(o.twoSkins) && same(o.twoMorphs) && o.twoSkins.moving > 800 && o.twoMorphs.moving > 800, "three keys a program by layout and bone count; the stage's per-object values reach each draw through per-draw nodes, as previousModelWorldMatrix does");
            ok(`  [${mode}] Points, a pixel each: ${o.points.moving} of ${o.points.colour} drawn, ${e(o.points.w)} px`, same(o.points) && o.points.moving === o.points.colour && o.points.colour === 12);
        }
        const rf = r.result.webgpu.refusals, named = (k, ...w) => typeof rf[k] === "string" && w.every((x) => rf[k].includes(x));
        ok(`what the stage cannot follow is refused by name: a sprite drawn with a points material, one placed by positionNode, a BatchedMesh whose instances outgrew its matrices texture`,
           named("points", '"dots"', "points material") && named("placed", '"placed"', "positionNode") && named("grown", '"crowd"', "re-made its matrices texture"), rf.grown);
    }
}

// ---- v4761 SABOTAGE LOG ----------------------------------------------------------------------------------------
// Against render/temporalTsl.mjs, all here: Z1 a BatchedMesh's history never kept -> 4; Z2 kept and never stepped -> 4 (red
// only since the gate runs three frames -- after two it read right); Z3 its texture not uploaded -> 4; Z4 the draw id read in
// place of three's indirect index -> 4 (red only since the instances stand at depths three's sort reverses); Z5 toward not
// slerped -> 2; Z6 the batched path off -> 4. Z7 sprites not given the stage's material -> 5; Z8 the sprite path off -> 2; Z9
// no rotation history, Z10 toward not lerped, Z11 the last rotation not kept, Z14 the rotation not copied -> 2 each; Z12
// attenuation ignored -> 2; Z13 the centre ignored and Z15 the last scale taken from this frame -> 2 each (red only since
// sprites are off-centre and grow); Z19 their own materials not put back -> 2; Z23 the centre not per draw -> 2; Z24 the stage's
// sprite drawn by three's vertex stage -> 2. Z20 the skin's per-draw buffer not filled -> 4; Z21 the bind matrices not per draw
// -> 2 (red only since one mesh's bind matrix is not the identity); Z22 the morph's not filled -> 4. Z16 a points material,
// Z17 positionNode, Z18 a re-made matrices texture not refused -> 1 each. Twenty-four, none green.
console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nALL GREEN");
console.log("unchecked here: a sprite placed or turned by a node (positionNode, rotationNode, scaleNode) and sized points on a sprite -- " +
    "refused, and the compute-driven particles they are for are the next round's; a sprite's alpha test, which the stage's sprite " +
    "material does not carry; a BatchedMesh's per-instance visibility changing between frames; and geometry a BatchedMesh re-packs.");
process.exitCode = fails ? 1 : 0;
