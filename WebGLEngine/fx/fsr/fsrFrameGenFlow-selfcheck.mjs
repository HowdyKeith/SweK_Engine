#!/usr/bin/env node
// WebGLEngine/fx/fsr/fsrFrameGenFlow-selfcheck.mjs -- v4741
//
// WHAT RECONCILING THE MOTION VECTORS WITH AN OPTICAL FLOW BUYS A GENERATED FRAME, against a frame rendered at the midpoint.
// fx/fsr/fsrFrameGen-selfcheck.mjs measures the generator on geometry, where a three.js scene's vectors are exact. This is
// the content they are SILENT about: a wall whose texture scrolls while the wall stands still -- a shadow, a reflection, a
// conveyor, a screen -- behind the turning knot. Its vectors are zero and wrong by the whole displacement; the colour moved.
//
// The arms, each makeFrameGen with the same fill:
//   vectors   flow: null -- v4738's generator, the application's field alone
//   default   flow: {} -- render/opticalFlowTsl.mjs, then render/flowReconcileTsl.mjs per PIXEL at margin 0.9
//   low       the per-pixel rule at the block rule's margin, 0.05
//   block     FSR3's rule as render/flowReconcile.mjs has it: per BLOCK at 0.05, applied per pixel
// and the two controls every frame generator is measured against, repeating the older frame and a cross-fade.
//
// *** THE MARGIN WAS CHOSEN ON OTHER SPEEDS AND THESE ROWS WERE WRITTEN BEFORE THEY RAN. *** render/flowReconcile.mjs's
// table is a sweep at 4x spin, 4 px of scroll and a 0.06 pan; the cases here are 6x, 2.9 px and 0.05, and the thresholds --
// the default at least +0.5 dB over the vectors where the texture scrolls, and within 0.1 dB of them where it does not --
// are the ones that would have made the table's choice wrong had they failed.
"use strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runInEngineOrigin, webgpuSkipReason } from "../../tools/ship/webgpuHarness.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (label, cond, detail) => { if (!cond) fails++; console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "   " + detail : ""}`); };
const say = (s) => console.log(`  ----  ${s}`);
const D = 128;

console.log("\n1. ON THE DEVICE: the frame between two frames, with and without the colour's own motion");
const skip = webgpuSkipReason();
if (skip) { console.log(`  SKIP  ${skip}`); console.log("  ----  *** NOT A PASS. *** Nothing here is static."); fails++; }
else {
    const r = await runInEngineOrigin({ engineRoot: ENG, timeoutMs: 300000, args: { D }, script: `async (a) => {
        const THREE = await import("/vendor/three-webgpu/three.webgpu.js"); const T = await import("/vendor/three-webgpu/three.tsl.js");
        const TT = await import("/render/temporalTsl.mjs"); const FG = await import("/fx/fsr/fsrFrameGenTsl.mjs"); const FI = await import("/render/frameInterpTsl.mjs");
        const D = a.D, out = {};
        for (const mode of ["webgpu"]) {
            try {
                const canvas = document.createElement("canvas"); canvas.width = D; canvas.height = D;
                const renderer = new THREE.WebGPURenderer({ canvas, forceWebGL: mode === "webgl2", antialias: false }); await renderer.init();
                const tgt = (n) => new THREE.RenderTarget(n, n, { type: THREE.FloatType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
                const read = async (t, n) => await renderer.readRenderTargetPixelsAsync(t, 0, 0, n, n);
                const scene = new THREE.Scene(); scene.background = new THREE.Color(0.02, 0.03, 0.06);
                const knot = new THREE.Mesh(new THREE.TorusKnotGeometry(0.9, 0.28, 220, 24), new THREE.MeshNormalNodeMaterial()); scene.add(knot);
                // the wall: smooth non-periodic colour noise evaluated in the shader, slid along the wall by a uniform. A texture
                // would do for eyes and not for a measurement: a float texture is not filterable and point-samples into blocks,
                // and a sum of sines is periodic enough for a block matcher to lock onto the wrong repeat -- the first two drafts
                const scroll = T.uniform(0.0), wm = new THREE.MeshBasicNodeMaterial();
                wm.colorNode = T.Fn(() => { const q = T.vec2(T.uv().x.mul(14.0).add(scroll), T.uv().y.mul(8.0)).mul(1.6);
                    const n3 = T.mx_noise_vec3(T.vec3(q.x, q.y, 0.37)).add(T.mx_noise_vec3(T.vec3(q.x.mul(2.1), q.y.mul(2.1), 4.1)).mul(0.5));
                    return T.vec3(0.5).add(n3.mul(0.3)); })();
                const wall = new THREE.Mesh(new THREE.PlaneGeometry(14, 8), wm); wall.position.z = -2; scene.add(wall);
                const cam = new THREE.PerspectiveCamera(40, 1, 0.1, 50), gl = TT.glClip(THREE, renderer);
                const ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
                const quad = (node) => { const m = new THREE.NodeMaterial(); m.fragmentNode = node; m.blending = THREE.NoBlending; const s = new THREE.Scene(); s.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), m)); return s; };
                // one generator per arm, reused across the cases: compiling them is most of what this gate costs
                const stage = TT.makeMotionStage(THREE, T, { w: D, h: D, gl });
                const arms = { vectors: FG.makeFrameGen(THREE, T, { w: D, h: D }), default: FG.makeFrameGen(THREE, T, { w: D, h: D, flow: {} }),
                               low: FG.makeFrameGen(THREE, T, { w: D, h: D, flow: { margin: 0.05 } }), block: FG.makeFrameGen(THREE, T, { w: D, h: D, flow: { mode: "block" } }) };
                const A = tgt(D), B = tgt(D), out2 = tgt(D), km = tgt(D), big = tgt(D * 4);
                const cross = quad(FI.crossFadeNode(T, A.texture, B.texture).node);
                const o = { margins: { default: arms.default.reconcile.margin, low: arms.low.reconcile.margin, block: arms.block.reconcile.margin } };
                for (const [cn, sc, spin, pan] of [["scroll", 0.12, 6, 0], ["still", 0, 6, 0], ["pan", 0, 1, 0.05], ["panScroll", 0.12, 1, 0.05]]) {
                    const setT = (k) => { const t = k / 60 * spin; knot.rotation.set(0.4 + t * 0.4, 0.6 + t * 0.6, 0); knot.updateMatrixWorld(); scroll.value = k * sc;
                        cam.position.set(k * pan, 0.6, 5.2); cam.lookAt(k * pan, 0, 0); cam.updateMatrixWorld(); };
                    setT(0); renderer.setRenderTarget(A); await renderer.renderAsync(scene, cam);
                    setT(1); renderer.setRenderTarget(B); await renderer.renderAsync(scene, cam);
                    setT(0.5); renderer.setRenderTarget(big); await renderer.renderAsync(scene, cam);
                    const t4 = await read(big, D * 4), truth = new Float32Array(D * D * 4);
                    for (let y = 0; y < D; y++) for (let x = 0; x < D; x++) for (let c = 0; c < 3; c++) { let s = 0;
                        for (let sy = 0; sy < 4; sy++) for (let sx = 0; sx < 4; sx++) s += t4[((y * 4 + sy) * D * 4 + x * 4 + sx) * 4 + c]; truth[(y * D + x) * 4 + c] = s / 16; }
                    // the wall's interior: the knot absent from both frames, six pixels clear of it and of the frame's edge
                    wall.visible = false; const bg = scene.background; scene.background = new THREE.Color(0, 0, 0);
                    setT(0); renderer.setRenderTarget(km); await renderer.renderAsync(scene, cam); const k0 = await read(km, D);
                    setT(1); renderer.setRenderTarget(km); await renderer.renderAsync(scene, cam); const k1 = await read(km, D);
                    wall.visible = true; scene.background = bg;
                    const clear = Uint8Array.from({ length: D * D }, (_, i) => k0[i * 4] + k0[i * 4 + 1] + k0[i * 4 + 2] === 0 && k1[i * 4] + k1[i * 4 + 1] + k1[i * 4 + 2] === 0 ? 1 : 0);
                    const inner = Uint8Array.from({ length: D * D }, (_, i) => { const x = i % D, y = (i / D) | 0; if (x < 6 || y < 6 || x >= D - 6 || y >= D - 6) return 0;
                        for (let dy = -6; dy <= 6; dy++) for (let dx = -6; dx <= 6; dx++) if (!clear[(y + dy) * D + x + dx]) return 0; return 1; });
                    const knotPx = Uint8Array.from({ length: D * D }, (_, i) => (k1[i * 4] + k1[i * 4 + 1] + k1[i * 4 + 2] > 0 ? 1 : 0));
                    const cl = (v) => Math.min(1, Math.max(0, v));
                    const psnr = (img, m) => { let q = 0, n = 0; for (let i = 0; i < D * D; i++) { if (m && !m[i]) continue; n++;
                        for (let ch = 0; ch < 3; ch++) q += (cl(img[i * 4 + ch]) - cl(truth[i * 4 + ch])) ** 2; } return n ? 10 * Math.log10(1 / (q / (n * 3))) : null; };
                    const imgs = { repeat: await read(A, D) };
                    renderer.setRenderTarget(out2); await renderer.renderAsync(cross, ortho); imgs.crossFade = await read(out2, D);
                    const took = {};
                    for (const [an, g] of Object.entries(arms)) {
                        // primed with frame k's own field, so the older depth is frame k's, as it is in use
                        setT(-1); await stage.render(renderer, scene, cam); setT(0); await stage.render(renderer, scene, cam);
                        await g.generate(renderer, { prev: A.texture, cur: A.texture, motion: stage.motion.texture, depth: stage.depth.texture }, out2);
                        setT(1); await stage.render(renderer, scene, cam);
                        await g.generate(renderer, { prev: A.texture, cur: B.texture, motion: stage.motion.texture, depth: stage.depth.texture }, out2);
                        imgs[an] = await read(out2, D);
                        if (g.reconcile) {
                            // which pixels the flow took: where the splatted field is not the application's own vector
                            const f = await read(g.reconcile.targets.field, D), m = await read(stage.motion, D);
                            let w = 0, wn = 0, k = 0, kn = 0;
                            for (let i = 0; i < D * D; i++) { const t2 = Math.abs(f[i * 4] + m[i * 4] * D) > 1e-3 || Math.abs(f[i * 4 + 1] + m[i * 4 + 1] * D) > 1e-3;
                                if (inner[i]) { wn++; if (t2) w++; } if (knotPx[i]) { kn++; if (t2) k++; } }
                            took[an] = { wall: [w, wn], knot: [k, kn] };
                        }
                    }
                    const c = { all: {}, wall: {}, took, innerPx: inner.reduce((q, v) => q + v, 0) };
                    for (const [k, img] of Object.entries(imgs)) { c.all[k] = psnr(img); c.wall[k] = psnr(img, inner); }
                    o[cn] = c;
                }
                for (const g of Object.values(arms)) g.dispose(); stage.dispose(); for (const t of [A, B, out2, km, big]) t.dispose();
                out[mode] = o; renderer.dispose();
            } catch (err) { out[mode] = { err: String(err && err.stack || err).slice(0, 700) }; }
        }
        return out;
    }` });
    ok("the harness ran every case", r.ok && r.result && !r.result.webgpu.err,
       r.ok ? `webgpu ${r.result.webgpu.err || "ok"}` : (r.reason || (r.pageErrors || []).join("; ")));
    if (r.ok && r.result) for (const mode of ["webgpu"]) {
        const o = r.result[mode]; if (!o || o.err) continue;
        const f = (v) => v.toFixed(2), d = (x, y) => (x - y >= 0 ? "+" : "") + (x - y).toFixed(2);
        for (const cn of ["scroll", "still", "pan", "panScroll"]) {
            const c = o[cn];
            say(`[${mode}] ${cn.padEnd(9)} whole frame: vectors ${f(c.all.vectors)}, default ${d(c.all.default, c.all.vectors)}, low ${d(c.all.low, c.all.vectors)}, block ${d(c.all.block, c.all.vectors)} (cross-fade ${f(c.all.crossFade)}, repeat ${f(c.all.repeat)}); ` +
                `wall's interior (${c.innerPx} px): vectors ${f(c.wall.vectors)}, default ${d(c.wall.default, c.wall.vectors)}; the default took ${c.took.default.wall[0]} of the wall's ${c.took.default.wall[1]} pixels and ${c.took.default.knot[0]} of the knot's ${c.took.default.knot[1]}`);
        }
        const S = o.scroll, P = o.panScroll;
        ok(`*** [${mode}] where the texture scrolls, the reconciled frame beats the vectors alone: ${d(S.all.default, S.all.vectors)} dB over the frame with the knot still turning, ${d(P.all.default, P.all.vectors)} under a pan -- and ${d(S.wall.default, S.wall.vectors)} and ${d(P.wall.default, P.wall.vectors)} on the wall's interior ***`,
           S.all.default - S.all.vectors >= 0.5 && P.all.default - P.all.vectors >= 0.5 && S.wall.default - S.wall.vectors >= 3 && P.wall.default - P.wall.vectors >= 3,
           "the wall's vectors are zero and the texture moved; the vectors-only frame there is a cross-fade of two displaced copies, and the flow's is the texture where it was at the midpoint");
        ok(`  [${mode}] ...and where no texture moves it costs next to nothing: ${d(o.still.all.default, o.still.all.vectors)} dB with the wall still, ${d(o.pan.all.default, o.pan.all.vectors)} under a pan, where every vector is exact`,
           o.still.all.default - o.still.all.vectors >= -0.1 && o.pan.all.default - o.pan.all.vectors >= -0.1,
           "the application is the incumbent: the flow takes a pixel only by explaining its window ten times better");
        ok(`  [${mode}] ...which is what the margin is for: at the block rule's 0.05 the same rule takes ${S.took.low.knot[0]} of the knot's ${S.took.low.knot[1]} pixels from their vectors (the default ${S.took.default.knot[0]}), and under the pan, where every vector is exact, that costs ${d(o.pan.all.low, o.pan.all.vectors)} dB, and ${d(P.all.low, P.all.vectors)} with the texture scrolling too`,
           S.took.low.knot[0] > 3 * S.took.default.knot[0] && o.pan.all.low < o.pan.all.default - 0.5 && P.all.low < P.all.default - 0.5,
           "a 3 x 3 window under an exact vector still carries a residual wherever the shading turns with the surface, and a small margin reads that as the vector being wrong");
        ok(`  [${mode}] ...and what the margin GIVES UP, measured rather than hidden: with the wall still and the knot turning at 6x, the low margin is ${d(o.still.all.low, o.still.all.vectors)} dB over the vectors and the default ${d(o.still.all.default, o.still.all.vectors)}`,
           o.still.all.low > o.still.all.default,
           "a turning knot's vector is the CHORD of an arc (fx/fsr/fsrFrameGenTsl.mjs's header), and the colour sees the arc; this row was written first asserting the opposite -- that the low margin costs here as under the pan -- and it failed. The default keeps the pan");
        ok(`  [${mode}] ...and FSR3's rule as the tree's mirror has it -- per BLOCK, at 0.05 -- does WORSE than the vectors alone where the texture scrolls (${d(S.all.block, S.all.vectors)} dB): a block straddling the silhouette gives its one vector to the knot's pixels`,
           S.all.block < S.all.vectors && S.all.block < S.all.default,
           "which is why the default decides per pixel; the block mode is kept as the port and as this row's control");
        ok(`  [${mode}] ...and the arms are the configurations they claim: margins ${o.margins.default}, ${o.margins.low} and ${o.margins.block}; the wall's interior is ${S.innerPx} pixels`,
           o.margins.default === 0.9 && o.margins.low === 0.05 && o.margins.block === 0.05 && S.innerPx > 2000);
    }
}

// ---- v4741 SABOTAGE LOG ----------------------------------------------------------------------------------------
// Against fx/fsr/fsrFrameGenTsl.mjs:
//   G7  the flow taken of prev against cur, its sense reversed      -> 4
//   G8  the generator's margin 0.05, not the mode's own             -> 5
//   G9  the generator's mode the block's                            -> 6
//   G10 the two frames' luma swapped into the reconciliation        -> 3
//   G11 the splat given a field the flow path never drew            -> 5
// and render/flowReconcileTsl.mjs's pixel-mode default margin put back to 0.05 (its R13) -> 5.
// *** ONE PRE-REGISTERED ROW FAILED, AND IT WAS THE ROW'S PREMISE. *** It asserted that the low margin costs where "the vectors
// are right", and counted the knot turning over a still wall among those cases. At 6x it gains +1.33 dB there: the vector is
// the chord and the colour follows the arc. The row now says so, as its own finding, and the pan -- a straight line, where
// the vectors ARE the motion -- is the control.
// *** WEBGPU ONLY, AND WHY. *** The first run took 31 s over both backends and read the same figures on both to 0.05 dB; the
// passes are held to their mirrors on both by render/opticalFlowTsl-selfcheck.mjs and render/flowReconcileTsl-selfcheck.mjs,
// and what is measured here is what the arithmetic buys, which is one number.
console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nALL GREEN");
console.log("unchecked here: a SHADOW or a REFLECTION, which move differently from the surface they fall on and are this round's reason " +
    "as much as a scrolling texture is -- the wall is the case three.js draws most simply, and the rule decides per pixel from colour, " +
    "so it cannot tell them apart; UI and particles over a moving scene, where a pixel's colour belongs to neither layer; and the cost: " +
    "the flow is a pyramid and a search every generated frame, which fsr-three.html's frame time shows and this gate does not measure.");
process.exitCode = fails ? 1 : 0;
