#!/usr/bin/env node
// WebGLEngine/fx/fsr/fsr3Tsl-selfcheck.mjs -- v4742
//
// FRAME GENERATION ON FSR2'S UPSCALED FRAMES, AS FSR3 DOES IT, AGAINST A FRAME RENDERED AT THE MIDPOINT. fx/fsr/fsr3Tsl.mjs's
// makeFsr3 runs fx/fsr/fsrTemporalTsl.mjs's chain at 64 -> 128 on fsr-three.html's scene for 24 frames, then makes the frame
// between the last two upscaled frames from the chain's own display-resolution motion field; a 4 x 4-supersampled render at
// that midpoint is the truth. Against it:
//   repeat      the older upscaled frame shown again -- what a renderer that cannot keep up does
//   cross-fade  the two upscaled frames blended
//   native      makeFrameGen on the scene rendered at DISPLAY resolution -- four times the pixels drawn per real frame,
//               the frames FSR3 exists not to render
// and the upscaled frames' own quality, which a frame made from them cannot be expected to pass.
"use strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runInEngineOrigin, webgpuSkipReason } from "../../tools/ship/webgpuHarness.mjs";
import * as F3 from "./fsr3Tsl.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (label, cond, detail) => { if (!cond) fails++; console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "   " + detail : ""}`); };
const say = (s) => console.log(`  ----  ${s}`);
const DW = 128, RW = 64, N = 24;

console.log("\n1. WITHOUT A DEVICE: the refusal");
{
    let msg = "no throw";
    try { F3.makeFsr3({}, {}, {}, { field: "smoothed" }); } catch (e) { msg = String(e.message); }
    ok("makeFsr3 refuses a field it does not have, before it builds anything", /field must be "raw" or "dilated"/.test(msg), msg);
}

console.log("\n2. ON THE DEVICE: the frame between two upscaled frames");
const skip = webgpuSkipReason();
if (skip) { console.log(`  SKIP  ${skip}`); console.log("  ----  *** NOT A PASS. *** Section 1 is static."); fails++; }
else {
    const r = await runInEngineOrigin({ engineRoot: ENG, timeoutMs: 300000, args: { DW, RW, N }, script: `async (a) => {
        const THREE = await import("/vendor/three-webgpu/three.webgpu.js"); const T = await import("/vendor/three-webgpu/three.tsl.js");
        const F3 = await import("/fx/fsr/fsr3Tsl.mjs"); const FG = await import("/fx/fsr/fsrFrameGenTsl.mjs"); const FI = await import("/render/frameInterpTsl.mjs");
        const TT = await import("/render/temporalTsl.mjs"); const TC = await import("/render/temporalClipTsl.mjs");
        const out = {};
        for (const mode of ["webgpu"]) {
            try {
                const D = a.DW, canvas = document.createElement("canvas"); canvas.width = D; canvas.height = D;
                const renderer = new THREE.WebGPURenderer({ canvas, forceWebGL: mode === "webgl2", antialias: false }); await renderer.init();
                const tgt = (n) => new THREE.RenderTarget(n, n, { type: THREE.FloatType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
                const read = async (t, n) => new Float32Array(await renderer.readRenderTargetPixelsAsync(t, 0, 0, n, n));
                const scene = new THREE.Scene(); scene.background = new THREE.Color(0.02, 0.03, 0.06);
                const knot = new THREE.Mesh(new THREE.TorusKnotGeometry(0.9, 0.28, 220, 24), new THREE.MeshNormalNodeMaterial()); scene.add(knot);
                const st = new THREE.MeshBasicNodeMaterial();
                st.colorNode = T.Fn(() => { const s = T.floor(T.uv().x.mul(48.0).add(T.uv().y.mul(9.0))).mod(2.0); return T.mix(T.vec3(0.05, 0.08, 0.14), T.vec3(0.95, 0.72, 0.3), s); })();
                const floor = new THREE.Mesh(new THREE.PlaneGeometry(9, 5), st); floor.rotation.x = -Math.PI / 2; floor.position.y = -1.3; scene.add(floor);
                const cam = new THREE.PerspectiveCamera(40, 1, 0.1, 50); cam.position.set(0, 0.6, 5.2); cam.lookAt(0, 0, 0); cam.updateMatrixWorld();
                const vp = Array.from(new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse).elements);
                const threshold = TC.clipGapThreshold(vp, [0, 0, 1.2], [0, -1.3, -1.0]);
                let spin = 4, pan = 0;
                const setT = (k) => { const t = k / 60 * spin; knot.rotation.set(0.4 + t * 0.4, 0.6 + t * 0.6, 0); knot.updateMatrixWorld();
                    cam.position.set(k * pan, 0.6, 5.2); cam.lookAt(k * pan, 0, 0); cam.updateMatrixWorld(); };
                const ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
                const quad = (node) => { const m = new THREE.NodeMaterial(); m.fragmentNode = node; m.blending = THREE.NoBlending; const s = new THREE.Scene(); s.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), m)); return s; };
                // the truths: the midpoint between the last two real frames, and the last real frame itself
                const ss = async (k) => { setT(k); const big = tgt(D * 4); renderer.setRenderTarget(big); await renderer.renderAsync(scene, cam); const t4 = await read(big, D * 4); big.dispose();
                    const tr = new Float32Array(D * D * 4); for (let y = 0; y < D; y++) for (let x = 0; x < D; x++) for (let c = 0; c < 3; c++) { let s = 0;
                        for (let sy = 0; sy < 4; sy++) for (let sx = 0; sx < 4; sx++) s += t4[((y * 4 + sy) * D * 4 + x * 4 + sx) * 4 + c]; tr[(y * D + x) * 4 + c] = s / 16; } return tr; };
                const o = { cases: {} }, o2 = tgt(D);
                const fsr2 = { renderWidth: a.RW, renderHeight: a.RW, displayWidth: D, displayHeight: D, threshold, type: THREE.FloatType };
                // [spin, pan per frame, fields] -- the knot at the page's four times and twelve, and a camera panning at 4x
                for (const [cn, sp, pn, fields] of [["spin4", 4, 0, ["raw", "dilated"]], ["spin12", 12, 0, ["raw"]], ["pan", 4, 0.08, ["raw", "dilated"]]]) {
                spin = sp; pan = pn; o.cases[cn] = { psnr: {} }; const oc = o.cases[cn];
                const mid = await ss(a.N - 1.5), last = await ss(a.N - 1);
                const cl = (v) => Math.min(1, Math.max(0, v));
                const psnr = (b, truth) => { let q = 0; for (let i = 0; i < D * D; i++) for (let c = 0; c < 3; c++) q += (cl(b[i * 4 + c]) - cl(truth[i * 4 + c])) ** 2; return 10 * Math.log10(1 / (q / (D * D * 3))); };
                for (const field of fields) {
                    const f3 = F3.makeFsr3(THREE, T, renderer, { fsr2, field });
                    for (let k = 0; k < a.N; k++) {
                        setT(k); await f3.render(scene, cam, false);
                        // the generator is called after every real frame from the second on, as it would be in use: its fill
                        // reads the older frame's depth, which it keeps from the call before
                        if (k >= a.N - 3) {
                            // and it draws NO scene: every render the generation makes is of its own passes
                            let sceneRenders = 0; const orig = renderer.renderAsync.bind(renderer);
                            renderer.renderAsync = (s, c) => { if (s === scene) sceneRenders++; return orig(s, c); };
                            await f3.generate(o2); renderer.renderAsync = orig; o.sceneRenders = (o.sceneRenders || 0) + sceneRenders; o.calls = (o.calls || 0) + 1;
                        }
                    }
                    oc.psnr[field] = psnr(await read(o2, D), mid);
                    // the generator was handed the pair in order and the field this arm names
                    const L = f3.lastInputs, T2 = f3.fsr2.targets;
                    (o.inputs = o.inputs || []).push(L.cur === f3.targets.frames[(a.N - 1) % 2].texture && L.prev === f3.targets.frames[a.N % 2].texture
                        && L.motion === (field === "raw" ? T2.motion.texture : T2.dMotion.texture) && L.depth === T2.depth.texture);
                    if (field === "raw") {
                        const older = f3.targets.frames[a.N % 2], newer = f3.targets.frames[(a.N - 1) % 2];
                        oc.psnr.repeat = psnr(await read(older, D), mid);
                        oc.psnr.upscaledLast = psnr(await read(newer, D), last);
                        renderer.setRenderTarget(o2); await renderer.renderAsync(quad(FI.crossFadeNode(T, older.texture, newer.texture).node), ortho);
                        oc.psnr.crossFade = psnr(await read(o2, D), mid);
                        // the upscaled frame the generator was handed is the one FSR2 made: its field's texture and the stage's are one
                        o.fieldIsStage = f3.fsr2.targets.motion === f3.fsr2.stage.motion;
                        // render(..., target) shows the real frame it just made
                        if (cn === "spin4") { const shown = tgt(D); setT(a.N); await f3.render(scene, cam, shown);
                            const sh = await read(shown, D), made = await read(f3.targets.frames[a.N % 2], D); let md2 = 0;
                            for (let i = 0; i < D * D * 4; i++) md2 = Math.max(md2, Math.abs(sh[i] - made[i])); o.shownDiff = md2; shown.dispose(); }
                        // and one real frame in, the "frame between" is that frame
                        if (cn === "spin4") {
                        const f1 = F3.makeFsr3(THREE, T, renderer, { fsr2 });
                        let early = null; try { await f1.generate(o2); } catch (e) { early = String(e.message); }
                        setT(0); await f1.render(scene, cam, false); await f1.generate(o2);
                        const g1 = await read(o2, D), r1 = await read(f1.targets.frames[0], D);
                        let md = 0; for (let i = 0; i < D * D * 4; i++) if (i % 4 !== 3) md = Math.max(md, Math.abs(g1[i] - r1[i]));
                        o.early = early; o.oneFrameDiff = md; f1.dispose();
                        }
                    }
                    f3.dispose();
                }
                // native: the same generator on the scene rendered at display resolution, with a display-resolution field
                {
                    const stage = TT.makeMotionStage(THREE, T, { w: D, h: D, gl: TT.glClip(THREE, renderer) }), g = FG.makeFrameGen(THREE, T, { w: D, h: D });
                    const A = tgt(D), B = tgt(D);
                    setT(a.N - 3); await stage.render(renderer, scene, cam); setT(a.N - 2); renderer.setRenderTarget(A); await renderer.renderAsync(scene, cam); await stage.render(renderer, scene, cam);
                    await g.generate(renderer, { prev: A.texture, cur: A.texture, motion: stage.motion.texture, depth: stage.depth.texture }, o2);
                    setT(a.N - 1); renderer.setRenderTarget(B); await renderer.renderAsync(scene, cam); await stage.render(renderer, scene, cam);
                    await g.generate(renderer, { prev: A.texture, cur: B.texture, motion: stage.motion.texture, depth: stage.depth.texture }, o2);
                    oc.psnr.native = psnr(await read(o2, D), mid);
                    oc.psnr.nativeLast = psnr(await read(B, D), last);
                    g.dispose(); stage.dispose(); A.dispose(); B.dispose();
                }
                }
                o2.dispose(); out[mode] = o; renderer.dispose();
            } catch (err) { out[mode] = { err: String(err && err.stack || err).slice(0, 700) }; }
        }
        return out;
    }` });
    ok("the harness ran every case", r.ok && r.result && !r.result.webgpu.err,
       r.ok ? `webgpu ${r.result.webgpu.err || "ok"}` : (r.reason || (r.pageErrors || []).join("; ")));
    if (r.ok && r.result) for (const mode of ["webgpu"]) {
        const o = r.result[mode]; if (!o || o.err) continue;
        const f = (v) => v.toFixed(2), d = (x, y) => (x - y >= 0 ? "+" : "") + (x - y).toFixed(2);
        const C = o.cases, what = { spin4: "the knot at 4x the page's spin", spin12: "the knot at 12x", pan: "a camera panning" };
        for (const [cn, c] of Object.entries(C)) { const p = c.psnr;
            say(`[${mode}] ${what[cn]}: generated from upscaled frames ${f(p.raw)}${p.dilated != null ? ` (dilated field ${f(p.dilated)})` : ""}, repeat ${f(p.repeat)}, cross-fade ${f(p.crossFade)}, generated from native frames ${f(p.native)}; ` +
                `the last real frame, upscaled ${f(p.upscaledLast)} and native ${f(p.nativeLast)}`); }
        const all = Object.values(C).map((c) => c.psnr), moving = ["spin12", "pan"].map((k) => C[k].psnr);
        ok(`*** [${mode}] the frame generated from FSR2's upscaled frames beats showing one of them twice (${all.map((p) => d(p.raw, p.repeat)).join(", ")} dB) and, where things move, a cross-fade of the two (${moving.map((p) => d(p.raw, p.crossFade)).join(" at 12x, ")} under the pan) ***`,
           all.every((p) => p.raw > p.repeat) && moving.every((p) => p.raw - p.crossFade > 0.3),
           `a frame generator on the frames FSR3 generates from; at 4x the knot barely moves and the cross-fade is within ${d(C.spin4.psnr.raw, C.spin4.psnr.crossFade)} dB -- the error there is the striped floor's, in every arm`);
        ok(`  [${mode}] ...and it is as good as the upscaled REAL frames around it: ${all.map((p) => d(p.raw, p.upscaledLast)).join(", ")} dB against the newer one, each against its own truth`,
           all.every((p) => p.raw - p.upscaledLast > -0.25),
           "a generated frame worse than the frames it sits between is one a viewer sees as a flicker every other frame");
        ok(`  [${mode}] ...and against generating from NATIVE frames, which draws four times the pixels per real frame: ${all.map((p) => d(p.raw, p.native)).join(", ")} dB -- a gap that is NOT the real frames' own (${all.map((p) => d(p.upscaledLast, p.nativeLast)).join(", ")}), and the pan says why: the native generated frame reads ${f(C.pan.psnr.native)}, above the native real frame's ${f(C.pan.psnr.nativeLast)}`,
           C.pan.psnr.native > C.pan.psnr.nativeLast && all.every((p) => p.native > p.raw),
           "a frame made by blending two ALIASED frames, sampled a fraction of a pixel apart, is a two-sample anti-alias against a supersampled truth; FSR2's frames are already accumulated and have no such bonus to collect. The first draft asserted the gap would track the real frames' and was wrong under the pan");
        const dd = ["spin4", "pan"].map((k) => C[k].psnr.raw - C[k].psnr.dilated);
        ok(`  [${mode}] ...and which of FSR2's two fields it reads is a wash: raw against dilated ${dd.map((v) => (v >= 0 ? "+" : "") + v.toFixed(2)).join(" at 4x and ")} under the pan`,
           dd.every((v) => Math.abs(v) < 0.25),
           "the raw field is the default because it is the field as rendered; the dilation is FSR2's, for sampling a render-resolution history, and hands a silhouette's neighbours the nearer surface's vector -- neither helps nor hurts a splat by more than a tenth of a dB here");
        ok(`  [${mode}] ...and the generator is handed the older and the newer upscaled frame in that order, with the field its arm names (${o.inputs.filter(Boolean).length} of ${o.inputs.length} arms), and render() shows the frame it made (worst |difference| ${o.shownDiff})`,
           o.inputs.every(Boolean) && o.inputs.length === 5 && o.shownDiff === 0, "the ping-pong's parity, which no quality row can see when two consecutive frames are nearly alike");
        ok(`  [${mode}] ...and the generated frame draws NO scene (${o.sceneRenders} scene renders across its ${o.calls} calls): its field is FSR2's own (${o.fieldIsStage})`,
           o.sceneRenders === 0 && o.calls > 0 && o.fieldIsStage === true, "the motion stage FSR2 runs at display resolution is the generator's input; nothing is rendered twice");
        ok(`  [${mode}] ...and before two real frames it is honest: generate() before any refuses, and after one it is that frame, exactly (worst |difference| ${o.oneFrameDiff})`,
           /needs a real frame first/.test(o.early || "") && o.oneFrameDiff === 0, o.early);
    }
}

// ---- v4742 SABOTAGE LOG ----------------------------------------------------------------------------------------
// Against fx/fsr/fsr3Tsl.mjs:
//   F1 the older frame never used, the newer blended with itself     -> 3    F5 render() shows the other target       -> 1
//   F2 the older and newer frames swapped                            -> 3    F6 generate() before any real frame      -> 1
//   F3 the raw arm reads the dilated field                           -> 1    F7 an unknown field accepted             -> 1
//   F4 one frame in, the generator's output shown, not the frame     -> 1
// *** F3 NEEDED A ROW OF ITS OWN, AND SO DID F5. *** The two fields are within a tenth of a dB of each other, so a raw arm
// reading the dilated field changes no quality row; and the view shows generated frames, so which target render() shows
// was read by nothing. The generator's inputs are exposed as lastInputs and compared by identity.
// *** TWO ROWS WERE WRONG ON THE FIRST RUN AND THE MEASUREMENTS STAND. *** The pan was 0.03 a frame, under a pixel, and a
// cross-fade of two frames that close is within 0.2 dB of anything -- it is 0.08 now. And a row asserted that generating
// from upscaled frames costs what upscaling costs the real frames; under the pan the native GENERATED frame beat the native
// real one by 3 dB, the blend acting as an anti-alias the upscaled frames had already had. The row reports that now.
// WEBGPU ONLY: the first run read both backends within 0.16 dB of each other and took 25 s; every pass is held to its
// mirror on both backends by its own gate.
console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nALL GREEN");
console.log("unchecked here: PACING -- a generated frame is worth having only if it is SHOWN halfway between the two it came from, " +
    "which is fsr-three.html's and a later round's; content the vectors do not see, which makeFrameGen's `flow` handles and " +
    "fx/fsr/fsrFrameGenFlow-selfcheck.mjs measures on native frames; and the generated frame's own temporal stability.");
process.exitCode = fails ? 1 : 0;
