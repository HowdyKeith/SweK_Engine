#!/usr/bin/env node
// WebGLEngine/render/temporalTslMany-selfcheck.mjs -- v4772
//
// *** AN INSTANCEDMESH OF MORE INSTANCES THAN A UNIFORM BUFFER HOLDS, THROUGH render/temporalTsl.mjs's MOTION STAGE. *** The
// stage kept the previous instance matrices in a buffer node -- a uniform buffer, 64 bytes a matrix -- and every gate drew at
// most 160 instances. Both backends here allow a uniform buffer 65536 bytes: 1024 matrices. Past that WebGPU refused the buffer
// ("Binding size (70400) ... is larger than the maximum uniform buffer binding size") and with it the stage's whole pass -- a
// plain sphere in the same scene lost its field too -- and WebGL2 said nothing and read a field 46.5 px wrong. The previous
// matrices are a float texture now, four texels a matrix, read by the instance's index.
//   straddle   the counts either side of THIS device's limit -- the last a uniform buffer holds, the first it does not -- and
//              10000: eight boxes visible -- at indices 0, 511 and 512 (either side of the texture's first row), N/2, 1023 and
//              1024, N-2 and N-1 -- the rest scaled to nothing, each moving and turning its own way -- against six separate meshes moved the same, through a second stage; a plain sphere moving
//              in both scenes. One browser frame a step, as an application renders
//   toward     the same at 10000 through toward stages at t = 0.3, each instance on its arc
//   three's    three's own colour pass past the limit, three renders into one target in one browser frame, an instance moved
//              between them: three moves its OWN matrices to an interleaved attribute there, whose version it syncs once a browser
//              frame for each program -- after the draw's upload check, so a render uploads what the last one synced: the second
//              render of a frame is right, the third draws the second's matrices. Held as three's behaviour. The stage's field
//              follows three's current matrices -- stepped three times in one frame it is off -- so it is graded one frame a step
//   disposed   the stage's dispose() frees the textures it made for the histories it keeps: the renderer's count of textures
//              returns to what it was before the stage was made
"use strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runInEngineOrigin, webgpuSkipReason } from "../tools/ship/webgpuHarness.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let fails = 0;
const ok = (label, cond, detail) => { if (!cond) fails++; console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "   " + detail : ""}`); };
const D = 96, MANY = 10000;

console.log("\n1. ON THE DEVICE: instances either side of the uniform buffer's limit, against separate meshes, both backends");
const skip = webgpuSkipReason();
if (skip) { console.log(`  SKIP  ${skip}`); console.log("  ----  *** NOT A PASS. *** Nothing here is static."); fails++; }
else {
    const r = await runInEngineOrigin({ engineRoot: ENG, timeoutMs: 300000, args: { D, MANY, modes: ["webgpu", "webgl2"] }, script: `async (a) => {
    const THREE = await import("/vendor/three-webgpu/three.webgpu.js"); const T = await import("/vendor/three-webgpu/three.tsl.js");
    const TT = await import("/render/temporalTsl.mjs");
    const errors = [], ce = console.error; console.error = (...x) => { errors.push(x.map(String).join(" ").slice(0, 160)); ce(...x); };
    const frame = () => new Promise((q) => requestAnimationFrame(q)), out = {};
    for (const mode of a.modes) { try {
        const D = a.D, canvas = document.createElement("canvas"); canvas.width = 8; canvas.height = 8;
        const renderer = new THREE.WebGPURenderer({ canvas, forceWebGL: mode === "webgl2", antialias: false }); await renderer.init();
        const gl = TT.glClip(THREE, renderer), rd = async (t) => await renderer.readRenderTargetPixelsAsync(t, 0, 0, D, D);
        const cam = new THREE.PerspectiveCamera(45, 1, 0.5, 20); cam.position.set(0, 0, 6); cam.lookAt(0, 0, 0); cam.updateMatrixWorld();
        const limit = renderer.backend.capabilities.getUniformBufferLimit(), fit = Math.floor(limit / 64), o = { limit, fit };
        const g = new THREE.BoxGeometry(0.5, 0.5, 0.5), mat = new THREE.MeshBasicNodeMaterial({ color: 0xff8800 }), zero = new THREE.Matrix4().makeScale(0, 0, 0);
        // the field of N instances against six separate meshes: the fields must be one field
        const graded = async (N, toward) => {
            // either side of the texture's first row (512 matrices a row), of the uniform buffer's limit, and the ends
            const vis = [...new Set([0, 511, 512, Math.floor(N / 2), 1023, 1024, N - 2, N - 1].filter((i) => i >= 0 && i < N))].sort((x, y) => x - y);
            const iscene = new THREE.Scene(), sscene = new THREE.Scene(), im = new THREE.InstancedMesh(g, mat, N); iscene.add(im);
            for (let i = 0; i < N; i++) im.setMatrixAt(i, zero);
            const sep = vis.map(() => { const m = new THREE.Mesh(g, mat); m.matrixAutoUpdate = false; sscene.add(m); return m; });
            const spheres = [iscene, sscene].map((sc) => { const m = new THREE.Mesh(new THREE.SphereGeometry(0.3, 16, 8), mat); sc.add(m); return m; });
            const o3 = new THREE.Object3D();
            const place = (t) => { vis.forEach((idx, s) => { o3.position.set(-1.8 + (s % 4) * 1.2 + 0.1 * t * (s % 2 ? 1 : -1), 1.0 - Math.floor(s / 4) * 1.4 + 0.07 * t * (s - 3), 0);
                    o3.rotation.set(0.25 * t * (s + 1), 0.15 * t, 0.1 * t * s); o3.updateMatrix(); im.setMatrixAt(idx, o3.matrix); sep[s].matrix.copy(o3.matrix); sep[s].updateMatrixWorld(true); });
                im.instanceMatrix.needsUpdate = true; im.updateMatrixWorld();
                for (const m of spheres) { m.position.set(0.2 * t, -1.8, 0); m.updateMatrixWorld(); } };
            const si = TT.makeMotionStage(THREE, T, { w: D, h: D, gl, toward }), ss = TT.makeMotionStage(THREE, T, { w: D, h: D, gl, toward });
            for (let t = 0; t < 3; t++) { await frame(); place(t); await si.render(renderer, iscene, cam, toward ? 0.3 : undefined); await ss.render(renderer, sscene, cam, toward ? 0.3 : undefined); }
            const mi = await rd(si.motion), ms = await rd(ss.motion), moves = (m, p) => Math.max(Math.abs(m[p * 4]), Math.abs(m[p * 4 + 1])) * D > 0.05;
            let w = 0, movingI = 0, movingS = 0;
            for (let p = 0; p < D * D; p++) { const ai = moves(mi, p), as = moves(ms, p); if (ai) movingI++; if (as) movingS++;
                if (ai || as) w = Math.max(w, Math.abs(mi[p * 4] - ms[p * 4]) * D, Math.abs(mi[p * 4 + 1] - ms[p * 4 + 1]) * D); }
            si.dispose(); ss.dispose(); im.dispose();
            return { N, vis: vis.join(","), w, movingI, movingS };
        };
        const e0 = errors.length;
        o.fitCase = await graded(fit, false); o.overCase = await graded(fit + 1, false); o.manyCase = await graded(Math.max(a.MANY, fit + 2), false);
        o.towardCase = await graded(Math.max(a.MANY, fit + 2), true);
        o.errors = errors.slice(e0);
        // three's own colour pass, into ONE target, three renders in one browser frame: instance N-1 at x = +1, then 0, then -1, each
        // drawn over the last without a clear -- three boxes if every render drew where it was told
        const colour = async (N) => {
            const im = new THREE.InstancedMesh(g, mat, N), sc = new THREE.Scene(); sc.add(im); for (let i = 0; i < N; i++) im.setMatrixAt(i, zero);
            const tg = new THREE.RenderTarget(D, D, { type: THREE.FloatType });
            const at = async (x, clear) => { im.setMatrixAt(N - 1, new THREE.Matrix4().makeTranslation(x, 0, 0)); im.instanceMatrix.needsUpdate = true;
                renderer.setRenderTarget(tg); renderer.autoClear = clear; await renderer.renderAsync(sc, cam); renderer.autoClear = true; };
            await frame(); await at(-1, true);
            // the renders of one browser frame, told apart from several frames by three's own frame counter
            let same = false, tries = 0;
            while (!same && tries++ < 5) { await frame(); const f0 = renderer._nodes.nodeFrame.frameId; await at(1, true); await at(0, false); await at(-1, false); same = renderer._nodes.nodeFrame.frameId === f0; }
            const px = await rd(tg), cols = [0, 0, 0]; for (let p = 0; p < D * D; p++) if (px[p * 4 + 3] > 0.5) cols[Math.min(2, Math.floor((p % D) / (D / 3)))]++;
            tg.dispose(); im.dispose(); return { N, cols, sameFrame: same };
        };
        // and the stage the same way: three steps in one browser frame, not one a frame
        const unpaced = async (N) => {
            const vis = [0, N - 1], iscene = new THREE.Scene(), sscene = new THREE.Scene(), im = new THREE.InstancedMesh(g, mat, N); iscene.add(im);
            for (let i = 0; i < N; i++) im.setMatrixAt(i, zero);
            const sep = vis.map(() => { const m = new THREE.Mesh(g, mat); m.matrixAutoUpdate = false; sscene.add(m); return m; });
            const si = TT.makeMotionStage(THREE, T, { w: D, h: D, gl }), ss = TT.makeMotionStage(THREE, T, { w: D, h: D, gl }), M = new THREE.Matrix4();
            await frame();
            for (let t = 0; t < 3; t++) { vis.forEach((idx, s) => { M.makeTranslation(-1 + 2 * s + 0.1 * t, 0.05 * t, 0); im.setMatrixAt(idx, M); sep[s].matrix.copy(M); sep[s].updateMatrixWorld(true); });
                im.instanceMatrix.needsUpdate = true; await si.render(renderer, iscene, cam); await ss.render(renderer, sscene, cam); }
            const mi = await rd(si.motion), ms = await rd(ss.motion); let w = 0;
            for (let p = 0; p < D * D; p++) w = Math.max(w, Math.abs(mi[p * 4] - ms[p * 4]) * D, Math.abs(mi[p * 4 + 1] - ms[p * 4 + 1]) * D);
            si.dispose(); ss.dispose(); im.dispose(); return { N, w };
        };
        o.unpacedFit = await unpaced(fit); o.unpacedOver = await unpaced(fit + 1);
        o.colourFit = await colour(fit); o.colourOver = await colour(fit + 1);
        // disposal: the renderer's texture count before a stage is made, and after it is disposed
        { const before = renderer.info.memory.textures, st = TT.makeMotionStage(THREE, T, { w: D, h: D, gl }), im = new THREE.InstancedMesh(g, mat, fit + 1), sc = new THREE.Scene(); sc.add(im);
          for (let t = 0; t < 2; t++) { await frame(); await st.render(renderer, sc, cam); }
          const during = renderer.info.memory.textures; st.dispose(); im.dispose();
          o.textures = { before, during, after: renderer.info.memory.textures }; }
        out[mode] = o; renderer.dispose();
    } catch (err) { out[mode] = { err: String(err && err.stack || err).slice(0, 700) }; } }
    console.error = ce;
    return out; }` });
    if (!r.ok) { ok("the page ran", false, r.reason || (r.pageErrors || []).join("; ")); }
    else for (const [mode, o] of Object.entries(r.result)) {
        if (o.err) { ok(`[${mode}] the page ran`, false, o.err); continue; }
        const e = (v) => v.toExponential(2), row = (c) => `${c.N} instances: ${e(c.w)} px over ${c.movingI} moving pixels, the separate meshes' ${c.movingS}`;
        const same = (c) => c.w < 1e-4 && c.movingI === c.movingS && c.movingI > 500;
        ok(`  [${mode}] the population straddles this device's limit: a uniform buffer of ${o.limit} bytes holds ${o.fit} matrices, and the counts are ${o.fitCase.N}, ${o.overCase.N} and ${o.manyCase.N}`,
           o.fitCase.N * 64 <= o.limit && o.overCase.N * 64 > o.limit && o.manyCase.N > o.overCase.N, "boxes at indices either side of 1024 and at the end: " + o.overCase.vis);
        ok(`  [${mode}] ${o.fitCase.N}, the most a uniform buffer holds: ${row(o.fitCase)}`, same(o.fitCase));
        ok(`*** [${mode}] ${o.overCase.N} -- ONE PAST IT: ${row(o.overCase)} ***`, same(o.overCase),
           "the previous matrices a texture, four texels a matrix, read by the instance's index; as a uniform buffer WebGPU refused the whole pass here and WebGL2 read a field 46.5 px wrong");
        ok(`*** [${mode}] ${o.manyCase.N}: ${row(o.manyCase)} ***`, same(o.manyCase));
        ok(`  [${mode}] ...and through toward stages at t = 0.3, each instance on its arc: ${row(o.towardCase)}`, same(o.towardCase));
        ok(`  [${mode}] and nothing was logged as an error while they drew: ${o.errors.length ? o.errors.join(" | ") : "none"}`, o.errors.length === 0);
        const cf = o.colourFit, co = o.colourOver;
        ok(`  [${mode}] THREE'S OWN colour pass, three renders into one target in one browser frame, the instance at x = +1, 0, -1: with ${cf.N} instances all three are drawn (${cf.cols.slice().reverse().join(", ")} pixels); with ${co.N} the second and third draw the first's matrices (${co.cols.slice().reverse().join(", ")}: the centre holds only the first box's spill, ${cf.cols[1] - co.cols[1]} pixels short)`,
           cf.sameFrame && co.sameFrame && cf.cols.every((c) => c > 50) && co.cols[2] > 50 && co.cols[1] < 50 && co.cols[0] === 0,
           "past the limit three's own matrices are an interleaved attribute. r185 synced its version once a browser frame (OnFrameUpdate), after the draw's upload check, so the second render was right and the third drew the second's matrices; r186 (v4805) syncs it before a frame's first render (OnBeforeFrameUpdate), so the second and the third draw the first's -- docs/upstream-three/dev/08's symptom, held as three's behaviour. When three changes it, this row goes red");
        ok(`  [${mode}] ...so the stage stepped three times in one browser frame follows three's matrices: its field is the separate meshes' to ${e(o.unpacedFit.w)} px at ${o.unpacedFit.N} instances, and ${o.unpacedOver.w.toFixed(2)} px off at ${o.unpacedOver.N}`,
           o.unpacedFit.w < 1e-4 && o.unpacedOver.w > 1, "graded above one browser frame a step, as an application renders");
        ok(`  [${mode}] the stage's dispose() frees the textures it made for its histories: the renderer counts ${o.textures.before} textures before the stage, ${o.textures.during} while it draws, ${o.textures.after} after`,
           o.textures.during > o.textures.before && o.textures.after === o.textures.before);
    }
}
// ---- v4805 SABOTAGE LOG ----------------------------------------------------------------------------------------
// T1 the colour-pass row held to r185's symptom (the second render right, the third the second's) -> 2, both backends.
// ---- v4772 SABOTAGE LOG ----------------------------------------------------------------------------------------
// Against render/temporalTsl.mjs, here and in render/temporalTsl-selfcheck.mjs: M1 the previous matrices a uniform buffer again
// -> 8, 0 (that gate draws three instances); M2 a row not a whole number of matrices wide -> 8, 0 -- and 0 here too until the
// population had boxes either side of the texture's first row, 511 and 512; M3 the row read as the column -> 10, 4; M4 the
// texture not marked for upload -> 10, 4; M5 the neighbour's matrix read -> 10, 4; M6 under toward, the texture not marked for
// upload -> 2, 2; M7 disposeHistory freeing nothing -> 2, 0; M8 the instance textures not kept for it -> 2, 0; M9 256 matrices a
// row -> 0, 0, EQUIVALENT: the shader reads the width from the texture, so any row a whole number of matrices wide is right; 512
// is for WebGL2's least MAX_TEXTURE_SIZE, 2048, which this box (8192) does not have. Eight red, the ninth equivalent.
console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nALL GREEN");
console.log("unchecked here: a skeleton of more bones than a uniform buffer holds -- the stage's bone matrices are one uniform buffer, as " +
    "three's own skinning's are, so three cannot draw that skeleton either; a morph of more targets than one holds, the same; and a device " +
    "whose limit is not 65536, where the counts move with it but no run here has drawn them.");
process.exitCode = fails ? 1 : 0;
