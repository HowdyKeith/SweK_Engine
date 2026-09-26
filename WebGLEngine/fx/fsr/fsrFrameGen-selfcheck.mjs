#!/usr/bin/env node
// WebGLEngine/fx/fsr/fsrFrameGen-selfcheck.mjs -- v4738
//
// WHAT FSR3'S FRAME GENERATION BUYS A THREE.JS SCENE, AGAINST A FRAME REALLY RENDERED AT THE MIDPOINT.
// render/frameInterpTsl-selfcheck.mjs and render/holeFillTsl-selfcheck.mjs prove the passes are the CPU's; this asks what
// fx/fsr/fsrFrameGenTsl.mjs's makeFrameGen is worth. fsr-three.html's scene is drawn at frames k and k + 1 (128 x 128,
// native), the generator makes k + 1/2 from them and the scene's own motion field, and a 4 x 4-supersampled render AT
// k + 1/2 is the truth. Against it, the two things any frame generator must beat:
//   REPEAT      showing frame k again -- what a renderer that cannot keep up does
//   CROSS-FADE  (1 - t) k + t (k + 1) -- no motion at all, render/frameInterp.mjs's control arm
// on the knot turning at 4x and 12x the page's rate and on a camera panning across the whole scene; and, on the hole
// pixels alone, what each fill side mode is worth -- the reason the driver's default is the blend.
"use strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runInEngineOrigin, webgpuSkipReason } from "../../tools/ship/webgpuHarness.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (label, cond, detail) => { if (!cond) fails++; console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "   " + detail : ""}`); };
const D = 128;

console.log("\n1. ON THE DEVICE: the frame between two frames, against the frame rendered there");
const skip = webgpuSkipReason();
if (skip) { console.log(`  SKIP  ${skip}`); console.log("  ----  *** NOT A PASS. *** Nothing here is static."); fails++; }
else {
    const r = await runInEngineOrigin({ engineRoot: ENG, timeoutMs: 300000, args: { D }, script: `async (a) => {
        const THREE = await import("/vendor/three-webgpu/three.webgpu.js"); const T = await import("/vendor/three-webgpu/three.tsl.js");
        const TT = await import("/render/temporalTsl.mjs"); const FG = await import("/fx/fsr/fsrFrameGenTsl.mjs"); const FI = await import("/render/frameInterpTsl.mjs");
        const D = a.D, out = {};
        for (const mode of ["webgpu", "webgl2"]) {
            try {
                const canvas = document.createElement("canvas"); canvas.width = D; canvas.height = D;
                const renderer = new THREE.WebGPURenderer({ canvas, forceWebGL: mode === "webgl2", antialias: false }); await renderer.init();
                const tgt = (n) => new THREE.RenderTarget(n, n, { type: THREE.FloatType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
                const read = async (t, n) => await renderer.readRenderTargetPixelsAsync(t, 0, 0, n, n);
                const scene = new THREE.Scene(); scene.background = new THREE.Color(0.02, 0.03, 0.06);
                const knot = new THREE.Mesh(new THREE.TorusKnotGeometry(0.9, 0.28, 220, 24), new THREE.MeshNormalNodeMaterial()); scene.add(knot);
                const st = new THREE.MeshBasicNodeMaterial();
                st.colorNode = T.Fn(() => { const s = T.floor(T.uv().x.mul(48.0).add(T.uv().y.mul(9.0))).mod(2.0); return T.mix(T.vec3(0.05, 0.08, 0.14), T.vec3(0.95, 0.72, 0.3), s); })();
                const floor = new THREE.Mesh(new THREE.PlaneGeometry(9, 5), st); floor.rotation.x = -Math.PI / 2; floor.position.y = -1.3; scene.add(floor);
                const cam = new THREE.PerspectiveCamera(40, 1, 0.1, 50), gl = TT.glClip(THREE, renderer);
                const ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
                const quad = (node) => { const m = new THREE.NodeMaterial(); m.fragmentNode = node; m.blending = THREE.NoBlending; const s = new THREE.Scene(); s.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), m)); return s; };
                const o = {};
                for (const [cn, spin, pan] of [["spin4", 4, 0], ["spin12", 12, 0], ["pan", 1, 0.02]]) {
                    const setT = (k) => { const t = k / 60 * spin; knot.rotation.set(0.4 + t * 0.4, 0.6 + t * 0.6, 0); knot.updateMatrixWorld();
                        cam.position.set(k * pan, 0.6, 5.2); cam.lookAt(k * pan, 0, 0); cam.updateMatrixWorld(); };
                    const A = tgt(D), B = tgt(D), out2 = tgt(D);
                    setT(0); renderer.setRenderTarget(A); await renderer.renderAsync(scene, cam);
                    setT(1); renderer.setRenderTarget(B); await renderer.renderAsync(scene, cam);
                    setT(0.5); const big = tgt(D * 4); renderer.setRenderTarget(big); await renderer.renderAsync(scene, cam);
                    const t4 = await read(big, D * 4); big.dispose();
                    const truth = new Float32Array(D * D * 4);
                    for (let y = 0; y < D; y++) for (let x = 0; x < D; x++) for (let c = 0; c < 3; c++) { let s = 0;
                        for (let sy = 0; sy < 4; sy++) for (let sx = 0; sx < 4; sx++) s += t4[((y * 4 + sy) * D * 4 + x * 4 + sx) * 4 + c]; truth[(y * D + x) * 4 + c] = s / 16; }
                    // PSNR is taken HERE and only numbers come back: the first draft shipped the truth and seven images a case
                    // through the harness and took 34 s of the sweep's 20
                    const cl = (v) => Math.min(1, Math.max(0, v));
                    const psnr = (img, m) => { let q = 0, n = 0; for (let i = 0; i < D * D; i++) { if (m && !m[i]) continue; n++;
                        for (let ch = 0; ch < 3; ch++) q += (cl(img[i * 4 + ch]) - cl(truth[i * 4 + ch])) ** 2; } return n ? 10 * Math.log10(1 / (q / (n * 3))) : null; };
                    const imgs = { repeat: await read(A, D) };
                    renderer.setRenderTarget(out2); await renderer.renderAsync(quad(FI.crossFadeNode(T, A.texture, B.texture).node), ortho); imgs.crossFade = await read(out2, D);
                    let hole = null;
                    // each generator is primed with frame k's own field first, so its older depth is frame k's, as it is in use
                    // the pan opens no hole, so only the default runs there; the derived mode is measured at 4x only -- the gate
                    // builds a generator per configuration, and compiling them was most of its time
                    const configs = [["gen", {}], ["noFill", { fill: null }], ["depth", { fill: { radius: 4, side: "depth" } }], ["derived", { fill: { radius: 4, side: "derived" } }]]
                        .filter(([fn]) => cn === "spin4" || (cn === "spin12" ? fn !== "derived" : fn === "gen" || fn === "noFill"));
                    for (const [fn, cfg] of configs) {
                        const stage = TT.makeMotionStage(THREE, T, { w: D, h: D, gl }), g = FG.makeFrameGen(THREE, T, { w: D, h: D, ...cfg });
                        setT(-1); await stage.render(renderer, scene, cam); setT(0); await stage.render(renderer, scene, cam);
                        await g.generate(renderer, { prev: A.texture, cur: A.texture, motion: stage.motion.texture, depth: stage.depth.texture }, out2);
                        setT(1); await stage.render(renderer, scene, cam);
                        await g.generate(renderer, { prev: A.texture, cur: B.texture, motion: stage.motion.texture, depth: stage.depth.texture }, out2);
                        imgs[fn] = await read(out2, D);
                        // the depth the NEXT call's fill will read as the older frame's must be this call's, exactly
                        if (fn === "gen" && cn === "spin4") { const kept = await read(g.targets.depthOld, D), now = await read(stage.depth, D);
                            let bad = 0; for (let i = 0; i < D * D; i++) if (kept[i * 4] !== now[i * 4]) bad++; o.keptDepthBad = bad; }
                        if (fn === "noFill") { const v = await read(g.interp.targets.vec, D); hole = Uint8Array.from({ length: D * D }, (_, i) => v[i * 4 + 3] < 0.5 ? 1 : 0); }
                        g.dispose(); stage.dispose();
                    }
                    const c = { holes: hole.reduce((s, v) => s + v, 0), all: {}, onHoles: {} };
                    for (const [k, img] of Object.entries(imgs)) { c.all[k] = psnr(img); c.onHoles[k] = psnr(img, hole); }
                    o[cn] = c; A.dispose(); B.dispose(); out2.dispose();
                }
                out[mode] = o; renderer.dispose();
            } catch (err) { out[mode] = { err: String(err && err.stack || err).slice(0, 700) }; }
        }
        return out;
    }` });
    ok("the harness ran every case on BOTH backends", r.ok && r.result && !r.result.webgpu.err && !r.result.webgl2.err,
       r.ok ? `webgpu ${r.result.webgpu.err || "ok"}; webgl2 ${r.result.webgl2.err || "ok"}` : (r.reason || (r.pageErrors || []).join("; ")));
    if (r.ok && r.result) for (const mode of ["webgpu", "webgl2"]) {
        const o = r.result[mode]; if (!o || o.err) continue;
        const f = (v) => v.toFixed(2), d = (a, b) => (a - b >= 0 ? "+" : "") + (a - b).toFixed(2);
        // every image was read back the same way as its truth, so row order cancelled in the page
        const psnr = (c, k, m) => (m ? c.onHoles[k] : c.all[k]);
        for (const cn of ["spin4", "spin12", "pan"]) {
            const c = o[cn], g = psnr(c, "gen"), x = psnr(c, "crossFade"), rp = psnr(c, "repeat"), nf = psnr(c, "noFill");
            const holes = c.holes;
            const what = cn === "pan" ? "a camera panning across the scene" : `the knot turning at ${cn.slice(4)}x the page's rate`;
            ok(`*** [${mode}] ${what}: the GENERATED frame reads ${f(g)} dB against the frame rendered at the midpoint -- ${d(g, x)} over a cross-fade, ${d(g, rp)} over repeating the older frame ***`,
               g > x && g > rp, `${holes} holes filled; with them left at zero it reads ${f(nf)}`);
        }
        const s4 = o.spin4, s12 = o.spin12;
        ok(`  [${mode}] the driver KEEPS the newer frame's depth for the next call -- ${o.keptDepthBad} of ${D * D} texels differ from the depth it was given`,
           o.keptDepthBad === 0, "the depth side mode asks where the OLDER frame's surfaces were; a driver that forgot would compare a frame with itself from the second call on, and no quality row here can see it");
        const n4 = psnr(s4, "noFill"), n12 = psnr(s12, "noFill");
        ok(`  [${mode}] the FILL is what makes it pay: with the holes left at zero the frame falls to ${f(n4)} and ${f(n12)} dB -- below the cross-fade's ${f(psnr(s4, "crossFade"))} and ${f(psnr(s12, "crossFade"))}`,
           n4 < psnr(s4, "crossFade") && n12 < psnr(s12, "crossFade"), "a hole is a pixel no motion reaches, and a black one costs more than everything the warp gains elsewhere");
        const hp = (c, k) => psnr(c, k, true);
        ok(`  [${mode}] and on the HOLE pixels alone the BLEND is the fill that pays here -- ${f(hp(s4, "gen"))} against depth ${f(hp(s4, "depth"))} and derived ${f(hp(s4, "derived"))} at 4x; ${f(hp(s12, "gen"))} against depth ${f(hp(s12, "depth"))} at 12x -- which is why it is the default`,
           hp(s4, "gen") > hp(s4, "depth") && hp(s4, "gen") > hp(s4, "derived") && hp(s12, "gen") > hp(s12, "depth"),
           "a turning knot occludes itself, so both frames are partly right in a hole, and a one-sided rule that picks the wrong one costs more than a blend that is half right");
    }
}

// ---- v4738 SABOTAGE LOG ----------------------------------------------------------------------------------------
// Against fx/fsr/fsrFrameGenTsl.mjs:
//   G1 the default leaves the holes at zero              -> 6    G4 the older depth never kept              -> 2
//   G2 the default fill one-sided by depth               -> 2    G5 the frame made at t = 0.25, not 0.5     -> 6
//   G3 prev and cur swapped into the warp                -> 6    G6 the field taken as prev-indexed         -> 2
// *** G4 SCORED 0 RED FIRST, TWICE OVER. *** The gate generated once after priming, and priming already puts the right
// depth in place -- the kept depth matters from the THIRD call on -- and the only row that reads the depth mode asserts
// the blend beats it, which a broken depth mode can only help. A direct row now reads the kept depth back against the one
// the call was given. The quality rows cannot see it, and say so.
// And the gate first took 34 s: it shipped the truth and seven images a case through the harness. PSNR is taken in the
// page now, and the configurations nothing needs (the pan has no hole) are not built -- 17 s.
console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nALL GREEN");
console.log("unchecked here: content the motion field does not describe -- shadows, reflections, particles, UI -- which is what FSR3's " +
    "optical flow is for and which this driver does not port (render/opticalFlow.mjs); frame generation on FSR2's upscaled output rather " +
    "than a native frame; and PACING, since a generated frame is only worth having if it is shown between the two it came from.");
process.exitCode = fails ? 1 : 0;
