#!/usr/bin/env node
// WebGLEngine/fx/fsr/fsrFrameGenBackdrop-selfcheck.mjs -- v4765
//
// WHAT READS THE FRAME BEHIND IT, IN THE GENERATOR: a lens with a backdropNode (a rippled, tinted read of the frame behind) and a
// MeshPhysicalNodeMaterial with transmission, lit. Three draws them after the opaque scene, sampling what is drawn; v4760's layer
// draws over transparent black, where they have nothing to sample, and until v4765 they were not the layer's at all -- three
// takes them as transparent whatever their `transparent` says, render/translucentLayer.mjs's isTranslucent did not, and they
// went into the generator's frames as surfaces. Three cases each, a background moving 8.45 px a frame unless said: the lens
// still over it; the lens moving over a still one; the lens behind an opaque box sliding across. Four arms, graded against the
// midpoint 4 x 4-supersampled, on the lens's pixels and over the frame:
//   drawn    the vectors, the stage drawing the lens as it does       flow     the flow on the same (`flow: {}`)
//   skipped  the vectors, the stage's pass drawn without the lens
//   over     frames and the stage's pass WITHOUT the lens, and the lens drawn at t over the generated frame -- the generator's
//            `over`, render/translucentLayer.mjs's renderOver: the frame copied in, the opaque scene's depth, the lens
// *** "OVER" BEATS EVERY FIELD ON EVERY CASE, AND A REAL FRAME REBUILT SO IS THE FRAME DRAWN WITH THE LENS, TO THE BIT. ***
// WEBGPU ONLY: render/translucentLayer-selfcheck.mjs holds renderOver on both backends.
// v4805, ON r186: *** THREE DRAWS A TRANSMISSION LENS FROM A STALE COPY OF THE FRAME BEHIND IT, AND THE GATE SAYS SO RATHER THAN GRADING IT. ***
// After renders to other targets, three's lens samples the frame it copied for one of them (bisected to #34162; still so on dev). The
// rebuild is checked where three draws it right, beside a row that holds three's stale read; the transmission cases' figures print as
// three's, and the rows that grade arms hold the backdrop's three cases until that row goes red.
"use strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runInEngineOrigin, webgpuSkipReason } from "../../tools/ship/webgpuHarness.mjs";
import { gateReport } from "../../tools/ship/gateReport.mjs";
const REPORT = gateReport("fx/fsr/fsrFrameGenBackdrop-selfcheck.mjs");

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (label, cond, detail) => { if (!cond) fails++; console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "   " + detail : ""}`); };
const say = (s) => console.log(`  ----  ${s}`);
const D = 128, CASES = ["backdrop:still", "backdrop:moving", "backdrop:occluded", "transmission:still", "transmission:moving", "transmission:occluded"], ARMS = ["drawn", "flow", "skipped", "over"];

console.log("\n1. ON THE DEVICE: lenses that read the frame behind them, generated four ways");
const skip = webgpuSkipReason();
if (skip) { console.log(`  SKIP  ${skip}`); console.log("  ----  *** NOT A PASS. *** Nothing here is static."); fails++; }
else {
    const r = await runInEngineOrigin({ engineRoot: ENG, timeoutMs: 300000, args: { D }, script: `async (a) => {
    const THREE = await import("/vendor/three-webgpu/three.webgpu.js"); const T = await import("/vendor/three-webgpu/three.tsl.js");
    const TT = await import("/render/temporalTsl.mjs"); const FG = await import("/fx/fsr/fsrFrameGenTsl.mjs"); const TL = await import("/render/translucentLayer.mjs");
    const D = a.D, canvas = document.createElement("canvas"); canvas.width = 8; canvas.height = 8;
    const renderer = new THREE.WebGPURenderer({ canvas, antialias: false }); await renderer.init();
    const tgt = (n) => new THREE.RenderTarget(n, n, { type: THREE.FloatType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
    const read = async (t, n) => { const px = await renderer.readRenderTargetPixelsAsync(t, 0, 0, n, n), s = Math.ceil(n / 16) * 16, o = new Float32Array(n * n * 4);
        for (let y = 0; y < n; y++) for (let x = 0; x < n * 4; x++) o[y * n * 4 + x] = px[y * s * 4 + x]; return o; };
    const cl = (v) => Math.min(1, Math.max(0, v)), gl = TT.glClip(THREE, renderer);
    const stage = TT.makeMotionStage(THREE, T, { w: D, h: D, gl, camera: true });
    const gen = { drawn: FG.makeFrameGen(THREE, T, { w: D, h: D }), flow: FG.makeFrameGen(THREE, T, { w: D, h: D, flow: {} }), skipped: FG.makeFrameGen(THREE, T, { w: D, h: D }), over: FG.makeFrameGen(THREE, T, { w: D, h: D }) };
    const A = tgt(D), B = tgt(D), A2 = tgt(D), B2 = tgt(D), o2 = tgt(D), big = tgt(D * 4), older = tgt(D);
    const layer = TL.makeTranslucentLayer(THREE, { w: D, h: D });
    const ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1), at = (tex) => T.textureLoad(tex, T.ivec2(T.int(T.screenCoordinate.x), T.int(T.screenCoordinate.y)));
    const quad = (node) => { const m = new THREE.NodeMaterial(); m.fragmentNode = node; m.blending = THREE.NoBlending; m.depthTest = false; m.depthWrite = false; const s = new THREE.Scene(); s.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), m)); return s; };
    const keepScene = quad(at(stage.depth.texture));
    const cam = new THREE.PerspectiveCamera(40, 1, 0.1, 50); cam.position.set(0, 0, 5.2); cam.lookAt(0, 0, 0); cam.updateMatrixWorld();
    const out = {}, t0 = performance.now();
    for (const kind of ["backdrop", "transmission"]) for (const [cn, cs] of Object.entries({ still: { bg: 0.25, lens: 0 }, moving: { bg: 0, lens: 0.25 }, occluded: { bg: 0.25, lens: 0, box: 0.3 } })) {
        const scene = new THREE.Scene(); scene.background = new THREE.Color(0.02, 0.03, 0.06);
        const bm = new THREE.MeshBasicNodeMaterial(); bm.colorNode = T.Fn(() => { const q = T.uv().mul(T.vec2(14.0, 8.0)).mul(6.4); return T.vec3(0.4).add(T.mx_noise_vec3(T.vec3(q.x, q.y, 0.37)).mul(0.25)); })();
        const bg = new THREE.Mesh(new THREE.PlaneGeometry(14, 8), bm); scene.add(bg);
        const box = cs.box ? new THREE.Mesh(new THREE.BoxGeometry(0.5, 2.4, 0.3), new THREE.MeshNormalNodeMaterial()) : null; if (box) { box.position.z = 1.0; scene.add(box); }
        let lm;
        if (kind === "backdrop") { lm = new THREE.MeshBasicNodeMaterial(); const off = T.vec2(T.sin(T.uv().y.mul(25.0)).mul(0.02), 0.0);
            lm.backdropNode = T.viewportSharedTexture(T.screenUV.add(off)).rgb.mul(T.vec3(0.7, 0.85, 1.0)); }
        else { lm = new THREE.MeshPhysicalNodeMaterial({ color: 0xffffff, transmission: 1, roughness: 0.0, ior: 1.5, thickness: 0.4, metalness: 0 }); }
        if (kind !== "backdrop") { scene.add(new THREE.AmbientLight(0xffffff, 1)); const dl = new THREE.DirectionalLight(0xffffff, 1); dl.position.set(1, 2, 3); scene.add(dl); }
        const lens = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.6, 1, 1), lm); lens.position.z = 0.5; scene.add(lens);
        const setT = (k) => { bg.position.x = k * cs.bg; bg.updateMatrixWorld(); lens.position.x = k * cs.lens; lens.updateMatrixWorld(); if (box) { box.position.x = -0.9 + k * cs.box; box.updateMatrixWorld(); } };
        const draw = async (k, target, without) => { setT(k); const back = without ? layer.hide(scene) : null; renderer.setRenderTarget(target); await renderer.renderAsync(scene, cam); if (back) back(); };
        await draw(0, A); await draw(1, B); await draw(0, A2, true); await draw(1, B2, true);
        // the REAL frame rebuilt: the frame without the lens, the lens drawn over it -- against the frame drawn with it. v4805: here,
        // before any render at another size: on r186 three's own copy of the frame behind goes stale after one (rebuiltLate, below)
        const rebuild = async () => { setT(0); const rb = await read({ texture: await layer.renderOver(renderer, scene, cam, A2.texture) } && layer.overTarget, D), a0 = await read(A, D);
            let mx = 0, nd = 0; for (let i = 0; i < D * D; i++) for (let q = 0; q < 3; q++) { const d = Math.abs(rb[i * 4 + q] - a0[i * 4 + q]); if (d > 0) nd++; mx = Math.max(mx, d); } return { mx, nd }; };
        const rebuilt = await rebuild();
        await draw(0.5, big); const t4 = await read(big, D * 4);
        const truth = new Float32Array(D * D * 4); for (let y = 0; y < D; y++) for (let x = 0; x < D; x++) for (let c = 0; c < 3; c++) { let s = 0;
            for (let sy = 0; sy < 4; sy++) for (let sx = 0; sx < 4; sx++) s += t4[((y * 4 + sy) * D * 4 + x * 4 + sx) * 4 + c]; truth[(y * D + x) * 4 + c] = s / 16; }
        await draw(0.5, o2, true); const nov = await read(o2, D); await draw(0.5, o2); const truth1 = await read(o2, D);
        const mk = Uint8Array.from({ length: D * D }, (_, i) => (Math.abs(truth1[i * 4] - nov[i * 4]) + Math.abs(truth1[i * 4 + 1] - nov[i * 4 + 1]) + Math.abs(truth1[i * 4 + 2] - nov[i * 4 + 2]) > 0.03 ? 1 : 0));
        const ps = (img, tr, m) => { let q = 0, n = 0; for (let i = 0; i < D * D; i++) { if (m && !m[i]) continue; n++; for (let c = 0; c < 3; c++) q += (cl(img[i * 4 + c]) - cl(tr[i * 4 + c])) ** 2; } return 10 * Math.log10(1 / (q / (n * 3))); };
        const c = { px: mk.reduce((q, v) => q + v, 0) };
        // ...and v4805: the same rebuild here, after the 4x render and two at this size -- where it was until v4805
        c.rebuilt = rebuilt; c.rebuiltLate = await rebuild();
        for (const [stageWithout, names] of [[false, ["drawn", "flow"]], [true, ["skipped", "over"]]]) {
            const st = async (k) => { setT(k); const back = stageWithout ? layer.hide(scene) : null; await stage.render(renderer, scene, cam); if (back) back(); };
            const fr = (n) => (n === "over" ? [A2, B2] : [A, B]);
            await st(0); renderer.setRenderTarget(older); await renderer.renderAsync(keepScene, ortho); await st(1);
            for (const n of names) {
                // the over arm: the lens drawn at t over the frame generated without it -- the generator's over, render/translucentLayer.mjs's renderOver
                const over = n === "over" ? async (t, frame) => { setT(t); return layer.renderOver(renderer, scene, cam, frame); } : null;
                await gen[n].generate(renderer, { prev: fr(n)[0].texture, cur: fr(n)[1].texture, motion: stage.motion.texture, depth: stage.depth.texture, depthPrev: older.texture, camera: gen[n].reconcile ? stage.camera.texture : null, over }, o2);
                const img = await read(o2, D);
                c[n] = { all: +ps(img, truth).toFixed(2), see: +ps(img, truth, mk).toFixed(2), see1: +ps(img, truth1, mk).toFixed(2) };
            }
        }
        out[kind + ":" + cn] = c;
    }
    out.ms = performance.now() - t0; layer.dispose(); stage.dispose(); for (const g of Object.values(gen)) g.dispose();
    return out;
}` });
    ok("the harness ran all six cases", r.ok && r.result && !r.result.err, r.ok ? `in ${r.result && r.result.ms ? (r.result.ms / 1000).toFixed(1) : "?"} s` : (r.reason || (r.pageErrors || []).join("; ")));
    if (r.ok && r.result) {
        const o = r.result, f = (v) => (v === null || v === Infinity ? "exact" : v.toFixed(2)), d = (x, y) => (x - y >= 0 ? "+" : "") + (x - y).toFixed(2);
        say("dB on the lens's pixels against the supersampled midpoint (over the frame):");
        for (const cn of CASES) say(`${cn.padEnd(22)} ${String(o[cn].px).padStart(4)} px  ${ARMS.map((k) => `${k} ${f(o[cn][k].see)} (${f(o[cn][k].all)})`).join("  ")}`);
        REPORT.table("dB on the lens's pixels and over the frame, against the supersampled midpoint (Infinity: exact)",
            ["case", "lens px", ...ARMS.flatMap((k) => [`${k}: lens`, `${k}: frame`])],
            CASES.map((cn) => [cn, o[cn].px, ...ARMS.flatMap((k) => [o[cn][k].see ?? Infinity, o[cn][k].all ?? Infinity])]));
        ok(`*** a REAL frame rebuilt -- drawn without the lens, the lens drawn over it -- is the frame drawn with it, on every case: ${CASES.map((cn) => o[cn].rebuilt.nd).join(", ")} channel values differ ***`,
           CASES.every((cn) => o[cn].rebuilt.mx === 0), "three's backdrop reads the render target as it stands, and renderOver hands it the frame");
        // v4805: *** r186 BROKE THE SAME REBUILD DONE LATER, AND IT IS THREE'S, NOT renderOver'S. *** After a render at another size and one
        // to another target, a transmission lens samples the frame three copied for that other target: three's own render does it as
        // much as renderOver (scratchpad probe: a plain render after the same sequence, 2700 channel values of 2700; and two renders to two new
        // targets with the wall moved 0.25 between: the lens's centre changed by 0.0599 on r185, by 0 on r186). Bisected between
        // r185 and r186 to #34162, "WebGPURenderer: Introduce refresh types for render objects": a SHARED refresh updates the shared
        // uniform buffers and not the sampled texture three's viewport node switches to per render target. Still so on dev.
        // v4806: drafted as docs/upstream-three/dev/17-transmission-backdrop-other-target.md, with a patch that makes a shared refresh
        // follow a texture node that switched textures; its reproduction prints lensMoved 0 on r186 and 8 patched, on both backends.
        const late = CASES.map((cn) => o[cn].rebuiltLate.nd), stale = (cn) => cn.startsWith("transmission:") && cn !== "transmission:moving";
        ok(`  THREE'S OWN (r186): the same rebuild after a render at 4x and two at this size: ${late.join(", ")} channel values differ -- a transmission lens reads the frame three copied for the render before, where the wall moved between`,
           CASES.every((cn) => (stale(cn) ? o[cn].rebuiltLate.nd > 0 : o[cn].rebuiltLate.nd === 0)),
           "r185 read its own frame; #34162 made it stale. Held as three's behaviour, not this tree's: when three changes it, this row goes red");
        const best = (cn) => Math.max(o[cn].drawn.see, o[cn].flow.see, o[cn].skipped.see), bestAll = (cn) => Math.max(o[cn].drawn.all, o[cn].flow.all, o[cn].skipped.all);
        ok(`*** OVER beats the best field on every case's lens pixels -- ${CASES.map((cn) => `${cn} ${d(o[cn].over.see, best(cn))}`).join(", ")} -- and over the frame, ${CASES.map((cn) => d(o[cn].over.all, bestAll(cn))).join(", ")} ***`,
           CASES.every((cn) => o[cn].over.see - best(cn) > 1 && o[cn].over.all - bestAll(cn) > 0.2),
           "through the generator's `over`: what reads its backdrop, drawn at t over the frame generated without it");
        // v4805: on r186 the transmission lens in the frames, and in the midpoint drawn at this resolution, is drawn by three from a stale
        // copy (the row above): until three draws it from its own, the two rows below hold the cases it draws right -- the backdrop's
        // three -- and print the transmission cases' figures as three's. When that row goes red, hold all six again, as v4765 did.
        const trusted = CASES.filter((cn) => !cn.startsWith("transmission:") || late.every((n) => n === 0));
        ok(`  ...and against the frame rendered at the midpoint at this resolution, a moving lens over a still wall is ${f(o["backdrop:moving"].over.see1)}${trusted.includes("transmission:moving") ? "" : `; the transmission lens's midpoint is three's stale one on r186 (${f(o["transmission:moving"].over.see1)}, exact on r185)`}`,
           trusted.filter((cn) => cn.endsWith(":moving")).every((cn) => o[cn].over.see1 === null || o[cn].over.see1 === Infinity), "where what is behind stands still, the generated frame IS the real one");
        ok(`  ...and the lens drawn as a surface is the worst arm on every case three draws right: ${trusted.map((cn) => f(o[cn].drawn.see)).join(", ")} dB${trusted.length < CASES.length ? ` (transmission on r186, three's stale lens in the frames: ${CASES.filter((cn) => !trusted.includes(cn)).map((cn) => `drawn ${f(o[cn].drawn.see)}, flow ${f(o[cn].flow.see)}`).join("; ")})` : ""}`,
           trusted.length >= 3 && trusted.every((cn) => o[cn].drawn.see < Math.min(o[cn].flow.see, o[cn].skipped.see, o[cn].over.see)), "what the tree did with them before v4765 -- in the frames, and in the stage's pass");
    }
}

// ---- v4805 SABOTAGE LOG ----------------------------------------------------------------------------------------
// B1 the late rebuild taken where the early one is -> 2 (three's row reads 0 stale everywhere; the arms row, trusting transmission
// again); B2 the transmission cases trusted on r186 -> 2 (its midpoint not exact; drawn not the worst arm); B3 the rebuild checked late,
// where it was until v4805 -> 1 (10800 and 10080 channel values differ). None green.
// ---- v4765 SABOTAGE LOG ----------------------------------------------------------------------------------------
// Against render/translucentLayer.mjs, here and in render/translucentLayer-selfcheck.mjs: L18 a backdropNode not read -> 3, 3;
// L19 transmission not read -> 1, 3; L20 hide() leaving them in the frames -> 4, 4; L21 no depth pass under them -> 0, 2 (the
// layer's lens stands clear of the box; the occluded cases here do not); L22 the frame not copied in -> 2, 4; L23 the layer
// drawing them too -> 4, 0; L24 autoClear left off -> 2, 4. Against fx/fsr/fsrFrameGenTsl.mjs, here: G22 `over` never called
// -> 3; G23 called at t = 0 -> 2; G24 its frame not written out without a `ui` -> 2. Ten, none green.
REPORT.write();
console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nALL GREEN");
console.log("unchecked here: a translucent panel BEHIND a lens, which three draws first and the lens refracts -- here the lens is drawn " +
    "before the layer, and such a panel is missing behind it; a transmission lens's own motion blur of what it shows; and the cost " +
    "of the depth pass and the lens's draw each generated frame, which is v4767's.");
process.exitCode = fails ? 1 : 0;
