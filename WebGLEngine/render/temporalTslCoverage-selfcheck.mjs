#!/usr/bin/env node
// WebGLEngine/render/temporalTslCoverage-selfcheck.mjs -- v4779
//
// *** THE MOTION FIELD COVERS WHAT THE COLOUR PASS DRAWS, AND AN OBJECT'S LAST POSE IS THE LAST FRAME'S. *** render/temporalTsl.mjs's
// motion stage, on the gaps render/temporalTslZoo-selfcheck.mjs named and four it had not:
//   cut        a Sprite and a Mesh whose map is half clear, alphaTest 0.5 -- the field's pixels against three's colour pass. The
//              motion node as a fragmentNode skips three's diffuse setup and its test: the field covered the clear half too
//   back       a double-sided plane turned to show its back -- three copies a material's alpha test onto an override, not its
//              side, and the override drew front faces only: the field had no pixels there at all
//   hidden     a plain mesh hidden for a frame, shown again -- it kept the pose it was last DRAWN at, so its motion spanned every
//              frame it was away; against the same mesh drawn throughout. A batch's hidden instance, which keeps its matrix, is
//              the second row, and was right already
//   culled     a box moving into view from outside the frustum -- first drawn, it had no last pose and read no motion at all;
//              against the same box never culled
//   grown      a BatchedMesh grown by setInstanceCount (its material updated, as three itself needs) -- refused by name before;
//              followed now, against plain meshes
//   repacked   a BatchedMesh re-packed by optimize() after a geometry is deleted -- right already, held here
// Tolerances, not bits: a GPU that fuses operations can move a float32 by one rounding (v4776, Keith's rig).
"use strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runInEngineOrigin, webgpuSkipReason } from "../tools/ship/webgpuHarness.mjs";
import { gateReport } from "../tools/ship/gateReport.mjs";
const REPORT = gateReport("render/temporalTslCoverage-selfcheck.mjs");

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let fails = 0;
const ok = (label, cond, detail) => { if (!cond) fails++; console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "   " + detail : ""}`); };
const D = 64, TOL = 1e-3;

console.log("\n1. ON THE DEVICE: the field against three's colour pass and against references, both backends");
const skip = webgpuSkipReason();
if (skip) { console.log(`  SKIP  ${skip}`); console.log("  ----  *** NOT A PASS. *** Nothing here is static."); fails++; }
else {
    const r = await runInEngineOrigin({ engineRoot: ENG, timeoutMs: 300000, args: { D }, script: `async (a) => {
    const THREE = await import("/vendor/three-webgpu/three.webgpu.js"); const T = await import("/vendor/three-webgpu/three.tsl.js");
    const TT = await import("/render/temporalTsl.mjs");
    const out = {};
    for (const mode of ["webgpu", "webgl2"]) { try {
        const D = a.D, canvas = document.createElement("canvas"); canvas.width = 8; canvas.height = 8;
        const renderer = new THREE.WebGPURenderer({ canvas, forceWebGL: mode === "webgl2", antialias: false }); await renderer.init();
        const gl = TT.glClip(THREE, renderer), rd = async (t) => Array.from(await renderer.readRenderTargetPixelsAsync(t, 0, 0, D, D));
        const cam = new THREE.PerspectiveCamera(40, 1, 0.1, 50); cam.position.set(0, 0, 5); cam.lookAt(0, 0, 0); cam.updateMatrixWorld();
        const mat = () => new THREE.MeshBasicNodeMaterial({ color: 0xffffff });
        const fieldOf = async (scene, step) => { const st = TT.makeMotionStage(THREE, T, { w: D, h: D, gl });
            for (const k of [0, 1, 2]) { step(k); await st.render(renderer, scene, cam); } const m = await rd(st.motion); st.dispose(); return m; };
        const colourOf = async (scene) => { const t = new THREE.RenderTarget(D, D, { type: THREE.FloatType }); renderer.setRenderTarget(t); await renderer.renderAsync(scene, cam); const c = await rd(t); t.dispose(); renderer.setRenderTarget(null); return c; };
        const moves = (A, i) => Math.hypot(A[i * 4], A[i * 4 + 1]) * D > 0.01;
        const cmp = (A, B) => { let w = 0, moving = 0, onlyA = 0, onlyB = 0; for (let i = 0; i < D * D; i++) { const ma = moves(A, i), mb = moves(B, i);
            if (ma || mb) { moving++; w = Math.max(w, Math.hypot(A[i*4] - B[i*4], A[i*4+1] - B[i*4+1]) * D); if (!ma) onlyB++; if (!mb) onlyA++; } } return { w, moving, onlyA, onlyB }; };
        // the field's pixels against the colour pass's: those three draws, those the field moves, and the two together
        const cover = async (sc, step) => { const F = await fieldOf(sc, step); step(2); const C = await colourOf(sc); let colour = 0, field = 0, both = 0;
            for (let i = 0; i < D * D; i++) { const c = C[i * 4 + 3] > 0.5, f = moves(F, i); if (c) colour++; if (f) field++; if (c && f) both++; } return { colour, field, both }; };
        const o = {};
        // CUT: a map whose left half is opaque and right half clear, alphaTest 0.5
        const cut = new THREE.DataTexture(new Uint8Array(Array.from({ length: 256 }, (_, i) => [255, 255, 255, (i % 16) < 8 ? 255 : 0]).flat()), 16, 16); cut.needsUpdate = true;
        { const s = new THREE.Sprite(new THREE.SpriteNodeMaterial({ map: cut, alphaTest: 0.5 })); s.scale.set(1.6, 1.6, 1); const sc = new THREE.Scene(); sc.add(s);
          o.spriteCut = await cover(sc, (k) => { s.position.set(0.2 * k, 0.1 * k, 0); s.updateMatrixWorld(); }); }
        { const m = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.6), new THREE.MeshBasicNodeMaterial({ map: cut, alphaTest: 0.5 })); const sc = new THREE.Scene(); sc.add(m);
          o.meshCut = await cover(sc, (k) => { m.position.set(0.2 * k, 0.1 * k, 0); m.updateMatrixWorld(); }); }
        // BACK: a double-sided plane showing its back
        { const m = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 1.4), new THREE.MeshBasicNodeMaterial({ side: THREE.DoubleSide })); m.rotation.y = Math.PI; const sc = new THREE.Scene(); sc.add(m);
          o.back = await cover(sc, (k) => { m.position.set(0.2 * k, 0, 0); m.updateMatrixWorld(); }); }
        const gA = new THREE.BoxGeometry(0.6, 0.6, 0.6), gB = new THREE.SphereGeometry(0.35, 16, 12), M = new THREE.Matrix4();
        const at = (i, k) => M.makeTranslation(-1.2 + (i % 2) * 2.4 + 0.3 * k * (i - 1.5), -0.8 + Math.floor(i / 2) * 1.6 + 0.2 * k, 0);
        // HIDDEN: box 1 hidden at frame 1 and shown at frame 2, box 2 hidden at frame 2; the truth draws all but box 2 at frame 2
        { const vis = (i, k) => !((i === 1 && k === 1) || (i === 2 && k === 2)), truth = (i, k) => !(i === 2 && k === 2);
          const plainOf = (shown) => { const ms = [gA, gB, gA, gB].map((g) => new THREE.Mesh(g, mat())), sc = new THREE.Scene(); for (const m of ms) sc.add(m);
              return { sc, step: (k) => ms.forEach((m, i) => { at(i, k).decompose(m.position, m.quaternion, m.scale); m.visible = shown(i, k); m.updateMatrixWorld(); }) }; };
          const T0 = plainOf(truth), H = plainOf(vis), R = await fieldOf(T0.sc, T0.step);
          o.hidden = cmp(await fieldOf(H.sc, H.step), R);
          const bm = new THREE.BatchedMesh(4, 2000, 6000, mat()), ia = bm.addGeometry(gA), ib = bm.addGeometry(gB), ids = [ia, ib, ia, ib].map((g) => bm.addInstance(g));
          bm.frustumCulled = false; bm.perObjectFrustumCulled = false; const sc = new THREE.Scene(); sc.add(bm);
          o.hiddenBatch = cmp(await fieldOf(sc, (k) => ids.forEach((id, i) => { bm.setMatrixAt(id, at(i, k)); bm.setVisibleAt(id, vis(i, k)); })), R); }
        // CULLED: a box moving into view -- outside the frustum at frames 0 and 1, inside at frame 2
        { const boxOf = (culled) => { const m = new THREE.Mesh(gA, mat()); m.frustumCulled = culled; const sc = new THREE.Scene(); sc.add(m);
              return { sc, step: (k) => { m.position.set(4.2 - 1.6 * k, 0.2 * k, 0); m.updateMatrixWorld(); } }; };
          const a1 = boxOf(true), b1 = boxOf(false); o.culled = cmp(await fieldOf(a1.sc, a1.step), await fieldOf(b1.sc, b1.step)); }
        // GROWN and REPACKED batches, against plain meshes
        const plainPair = (shown) => { const ms = [gA, gB, gA, gB].map((g) => new THREE.Mesh(g, mat())), sc = new THREE.Scene(); for (const m of ms) sc.add(m);
            return { sc, step: (k) => ms.forEach((m, i) => { at(i, k).decompose(m.position, m.quaternion, m.scale); m.visible = shown(i, k); m.updateMatrixWorld(); }) }; };
        { const bm = new THREE.BatchedMesh(2, 2000, 6000, mat()), ia = bm.addGeometry(gA), ib = bm.addGeometry(gB), ids = [bm.addInstance(ia), bm.addInstance(ib)];
          bm.frustumCulled = false; bm.perObjectFrustumCulled = false; const sc = new THREE.Scene(); sc.add(bm); const P = plainPair((i) => i < 2);
          try { o.grown = cmp(await fieldOf(sc, (k) => { if (k === 2) { bm.setInstanceCount(64); bm.material.needsUpdate = true; } ids.forEach((id, i) => bm.setMatrixAt(id, at(i, k))); }), await fieldOf(P.sc, P.step)); }
          catch (e) { o.grown = { err: String(e.message).slice(0, 160) }; } }
        { const bm = new THREE.BatchedMesh(4, 2000, 6000, mat()), ia = bm.addGeometry(gA), ib = bm.addGeometry(gB), ids = [ia, ib, ia, ib].map((g) => bm.addInstance(g));
          bm.frustumCulled = false; bm.perObjectFrustumCulled = false; const sc = new THREE.Scene(); sc.add(bm); const P = plainPair((i, k) => k < 2 || i % 2 === 1);
          o.repacked = cmp(await fieldOf(sc, (k) => { if (k === 2) { bm.deleteInstance(ids[0]); bm.deleteInstance(ids[2]); bm.deleteGeometry(ia); bm.optimize(); }
              ids.forEach((id, i) => { if (k < 2 || i % 2 === 1) bm.setMatrixAt(id, at(i, k)); }); }), await fieldOf(P.sc, P.step)); }
        out[mode] = o; renderer.dispose();
    } catch (err) { out[mode] = { err: String(err && err.stack || err).slice(0, 700) }; } }
    return out; }` });
    if (!r.ok) ok("the page ran", false, r.reason || (r.pageErrors || []).join("; "));
    const covered = [], followed = [];
    if (r.ok) for (const [mode, o] of Object.entries(r.result)) {
        if (o.err) { ok(`[${mode}] the page ran`, false, o.err); continue; }
        const e = (v) => v.toExponential(2), same = (c) => !c.err && c.w < TOL && c.onlyA === 0 && c.onlyB === 0 && c.moving > 100;
        for (const [k, what] of [["spriteCut", "a Sprite"], ["meshCut", "a Mesh"]])
            ok(`*** [${mode}] CUT: ${what} whose map is half clear, alphaTest 0.5 -- the field moves ${o[k].field} pixels, three draws ${o[k].colour}, both ${o[k].both} ***`,
               o[k].colour > 300 && o[k].field === o[k].colour && o[k].both === o[k].colour, "it moved 812, the clear half as well: the stage's material now carries the motion node as its output, after three's own test");
        ok(`*** [${mode}] BACK: a double-sided plane showing its back -- the field moves ${o.back.field} pixels, three draws ${o.back.colour} ***`,
           o.back.colour > 300 && o.back.field === o.back.colour && o.back.both === o.back.colour, "it moved none: the override drew front faces only");
        ok(`*** [${mode}] HIDDEN: a plain mesh hidden a frame and shown again moves as the last frame moved it -- ${e(o.hidden.w)} px from the truth over ${o.hidden.moving} pixels ***`,
           same(o.hidden), "it was 4.72 px: it kept the pose it was last drawn at");
        ok(`  [${mode}] ...as a batch's hidden instance already did: ${e(o.hiddenBatch.w)} px over ${o.hiddenBatch.moving}`, same(o.hiddenBatch));
        ok(`*** [${mode}] CULLED: a box moving into view from outside the frustum reads its motion -- ${e(o.culled.w)} px from the box never culled, over ${o.culled.moving} pixels ***`,
           same(o.culled), "first drawn, it had no last pose and read none");
        ok(`*** [${mode}] GROWN: a batch grown by setInstanceCount is followed -- ${o.grown.err ? o.grown.err : `${e(o.grown.w)} px from plain meshes over ${o.grown.moving} pixels`} ***`, same(o.grown),
           "it was refused by name: its history is made again at the new size, the last draw's matrices kept");
        ok(`  [${mode}] REPACKED: a batch re-packed by optimize() -- ${e(o.repacked.w)} px from plain meshes over ${o.repacked.moving} pixels`, same(o.repacked));
        covered.push(...["spriteCut", "meshCut", "back"].map((k) => [mode, k, o[k].field, o[k].colour, o[k].both]));
        followed.push(...["hidden", "hiddenBatch", "culled", "grown", "repacked"].filter((k) => !o[k].err).map((k) => [mode, k, o[k].w, o[k].moving]));
    }
    REPORT.table("the field's pixels against three's colour pass", ["backend", "case", "field moves", "three draws", "both"], covered,
        "Before v4779 the cut-outs moved 812 pixels (the clear half too) and the back face none.");
    REPORT.table("the field against its reference", ["backend", "case", "worst px", "moving pixels"], followed,
        "Before v4779 the hidden plain mesh was 4.72 px off, the box entering view read no motion, and the grown batch was refused.");
}
// ---- v4779 SABOTAGE LOG ----------------------------------------------------------------------------------------
// Against render/temporalTsl.mjs, here and in render/temporalTslZoo-selfcheck.mjs (0 on every one): C1 a cutting sprite's motion
// as its fragmentNode again -> 2; C2 a cutting mesh left to the override -> 2; C3 the stage's own material front-sided -> 2; C4
// endPass keeping nothing -> 4 (hidden and culled, both backends); C5 endPass skipping hidden objects -> 2 (culled alone passes);
// C6 a grown batch never regrown -> 2; C7 the growth not keeping the last draw's matrices -> 2; C8 the override not rebuilt on
// growth -> 2; C9 the map not carried onto the cutting material -> 4. Nine, none green.
REPORT.write();
console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nALL GREEN");
console.log("unchecked here: alphaToCoverage and transmission, which cut nothing the colour pass discards; a material that changes whether " +
    "it cuts after the stage first drew it -- the stage's material is made once per source material; and a grown batch whose material " +
    "is not updated, which three itself draws from its old texture.");
process.exitCode = fails ? 1 : 0;
