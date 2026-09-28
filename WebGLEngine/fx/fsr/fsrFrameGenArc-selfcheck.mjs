#!/usr/bin/env node
// WebGLEngine/fx/fsr/fsrFrameGenArc-selfcheck.mjs -- v4744
//
// MOTION ON THE ARC: a body turning between two frames reaches its half-way pose along an arc, and a motion vector is the
// chord. render/temporalTsl.mjs's makeMotionStage({ toward: true }) renders each pixel's displacement to time t with every
// object's pose -- and the camera's -- interpolated there (poseAt: translation and scale lerped, rotation slerped), and
// fx/fsr/fsrFrameGenTsl.mjs's `arc` splats with it: each pixel lands where its surface is at t and samples each frame at the
// offset that surface carried there (render/frameInterp.mjs's `toT`, held to it exactly by render/frameInterpTsl-selfcheck.mjs).
//
// *** AND THE ROUND BEGAN BY MEASURING ITS OWN PREMISE, WHICH WAS WRONG WHERE IT WAS FIRST CLAIMED. *** v4741 explained a
// low reconciliation margin's +1.33 dB on the knot turning at 6x as "a turning knot's vector is the chord of an arc". Section
// 1 measures the knot's own vertices: at 6x the half-way point sits 0.012 pixels off the chord's midpoint on average -- a
// hundredth of a pixel cannot be worth a dB. What the margin did there, measured this round with the frame split by region:
// most of it is on plain landed pixels beside the knot's silhouette and where one tube crosses another, where a block
// vector blends a hard edge that one pixel's exact vector moves whole; a part is the supersampled truth's soft edge (against
// a single-sample render at the midpoint the gain is +0.8 dB at 6x, not +1.3); and an FSR2-style flag taking the newer
// frame alone where the older one hid the surface recovered none of it (-0.3 dB at 6x, +0.2 at 12x) and was not kept.
// The arc is real where rotation is fast, and section 2 measures it there.
"use strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as THREE from "../../vendor/three-webgpu/three.webgpu.js";
import { runInEngineOrigin, webgpuSkipReason } from "../../tools/ship/webgpuHarness.mjs";
import { poseAt } from "../../render/temporalTsl.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (label, cond, detail) => { if (!cond) fails++; console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "   " + detail : ""}`); };
const say = (s) => console.log(`  ----  ${s}`);
const D = 128;

console.log("\n1. WITHOUT A DEVICE: the pose on the arc, and how far the arc is from the chord on the knot");
{
    const a = new THREE.Matrix4().compose(new THREE.Vector3(1, 2, 3), new THREE.Quaternion().setFromEuler(new THREE.Euler(0.2, 0.1, 0)), new THREE.Vector3(1, 1, 1));
    const b = new THREE.Matrix4().compose(new THREE.Vector3(3, 2, 1), new THREE.Quaternion().setFromEuler(new THREE.Euler(0.2, 1.7, 0.4)), new THREE.Vector3(2, 2, 2));
    const eq = (m, n) => m.elements.every((v, i) => Math.abs(v - n.elements[i]) < 1e-6);
    const h = poseAt(THREE, a, b, 0.5), p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3(); h.decompose(p, q, s);
    const qa = new THREE.Quaternion(), qb = new THREE.Quaternion(); a.decompose(new THREE.Vector3(), qa, new THREE.Vector3()); b.decompose(new THREE.Vector3(), qb, new THREE.Vector3());
    const half = qa.angleTo(q), whole = qa.angleTo(qb);
    // the matrices' own lerp, for contrast: a column of a rotation lerped is shorter than 1
    const lerped = new THREE.Matrix4(); for (let i = 0; i < 16; i++) lerped.elements[i] = (a.elements[i] + b.elements[i]) / 2;
    const colLen = Math.hypot(lerped.elements[0], lerped.elements[1], lerped.elements[2]) / 1.5;
    ok(`poseAt is each end at t = 0 and 1, and half-way turns by HALF the angle (${half.toFixed(4)} of ${whole.toFixed(4)} rad) at the half-way place and scale; the matrices' own lerp would shrink the body to ${colLen.toFixed(3)} of its size`,
       eq(poseAt(THREE, a, b, 0), a) && eq(poseAt(THREE, a, b, 1), b) && Math.abs(half - whole / 2) < 1e-6 && p.distanceTo(new THREE.Vector3(2, 2, 2)) < 1e-6 && Math.abs(s.x - 1.5) < 1e-6 && colLen < 0.99,
       "a body turning at a steady rate is where the slerp puts it");
    // the knot's vertices at fsr-three.html's camera: the half-way point against the chord's midpoint, in pixels at 128
    const geo = new THREE.TorusKnotGeometry(0.9, 0.28, 220, 24), pos = geo.getAttribute("position");
    const cam = new THREE.PerspectiveCamera(40, 1, 0.1, 50); cam.position.set(0, 0.6, 5.2); cam.lookAt(0, 0, 0); cam.updateMatrixWorld(); cam.updateProjectionMatrix();
    const obj = new THREE.Object3D(), v = new THREE.Vector3();
    const proj = (spin, k, i) => { const t = k / 60 * spin; obj.rotation.set(0.4 + t * 0.4, 0.6 + t * 0.6, 0); obj.updateMatrixWorld();
        v.fromBufferAttribute(pos, i).applyMatrix4(obj.matrixWorld).project(cam); return [(v.x + 1) / 2 * D, (1 - v.y) / 2 * D]; };
    const sag = {};
    for (const spin of [4, 6, 12, 30, 60]) { let sum = 0, mx = 0, n = 0;
        for (let i = 0; i < pos.count; i += 7) { const A = proj(spin, 0, i), B = proj(spin, 1, i), M = proj(spin, 0.5, i);
            const e = Math.hypot(M[0] - (A[0] + B[0]) / 2, M[1] - (A[1] + B[1]) / 2); sum += e; mx = Math.max(mx, e); n++; }
        sag[spin] = { mean: sum / n, worst: mx }; }
    say(`the knot's half-way point off its chord's midpoint, mean (worst), pixels: ${Object.entries(sag).map(([k, x]) => `${k}x ${x.mean.toFixed(3)} (${x.worst.toFixed(2)})`).join(", ")}`);
    ok(`*** at the page's rates the arc is not the error: ${sag[6].mean.toFixed(3)} pixels at 6x, the rate v4741 blamed it at -- and ${sag[60].mean.toFixed(2)} at 60x, where it is ***`,
       sag[6].mean < 0.02 && sag[12].mean < 0.1 && sag[60].mean > 0.5, "the sagitta grows as the square of the angle turned; a hundredth of a pixel is noise against every other error a generated frame carries");
}

console.log("\n2. ON THE DEVICE: the toward stage, and the arc against the chord");
const skip = webgpuSkipReason();
if (skip) { console.log(`  SKIP  ${skip}`); console.log("  ----  *** NOT A PASS. *** Section 1 is static."); fails++; }
else {
    const r = await runInEngineOrigin({ engineRoot: ENG, timeoutMs: 300000, args: { D }, script: `async (a) => {
        const THREE = await import("/vendor/three-webgpu/three.webgpu.js"); const T = await import("/vendor/three-webgpu/three.tsl.js");
        const TT = await import("/render/temporalTsl.mjs"); const FG = await import("/fx/fsr/fsrFrameGenTsl.mjs");
        const D = a.D, out = {};
        for (const mode of ["webgpu"]) {
            try {
                const canvas = document.createElement("canvas"); canvas.width = D; canvas.height = D;
                const renderer = new THREE.WebGPURenderer({ canvas, forceWebGL: mode === "webgl2", antialias: false }); await renderer.init();
                const tgt = (n) => new THREE.RenderTarget(n, n, { type: THREE.FloatType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
                const read = async (t, n) => new Float32Array(await renderer.readRenderTargetPixelsAsync(t, 0, 0, n, n));
                const scene = new THREE.Scene(); scene.background = new THREE.Color(0.02, 0.03, 0.06);
                const knot = new THREE.Mesh(new THREE.TorusKnotGeometry(0.9, 0.28, 220, 24), new THREE.MeshNormalNodeMaterial()); scene.add(knot);
                const wm = new THREE.MeshBasicNodeMaterial();
                wm.colorNode = T.Fn(() => { const q = T.vec2(T.uv().x.mul(14.0), T.uv().y.mul(8.0)).mul(1.6);
                    const n3 = T.mx_noise_vec3(T.vec3(q.x, q.y, 0.37)).add(T.mx_noise_vec3(T.vec3(q.x.mul(2.1), q.y.mul(2.1), 4.1)).mul(0.5)); return T.vec3(0.5).add(n3.mul(0.3)); })();
                const wall = new THREE.Mesh(new THREE.PlaneGeometry(14, 8), wm); wall.position.z = -2; scene.add(wall);
                const cam = new THREE.PerspectiveCamera(40, 1, 0.1, 50), gl = TT.glClip(THREE, renderer); cam.position.set(0, 0.6, 5.2); cam.lookAt(0, 0, 0); cam.updateMatrixWorld();
                const cl = (v) => Math.min(1, Math.max(0, v));
                const o = { cases: {} };
                // the toward stage's ends: at t = 0 it is the ordinary field, at t = 1 nothing moves -- the knot turning, the camera panning
                {
                    const st = TT.makeMotionStage(THREE, T, { w: D, h: D, gl }), tw = TT.makeMotionStage(THREE, T, { w: D, h: D, gl, toward: true });
                    const setT = (k) => { const t = k / 60 * 30; knot.rotation.set(0.4 + t * 0.4, 0.6 + t * 0.6, 0); knot.updateMatrixWorld(); cam.position.set(k * 0.05, 0.6, 5.2); cam.lookAt(k * 0.05, 0, 0); cam.updateMatrixWorld(); };
                    setT(0); await st.render(renderer, scene, cam); await tw.render(renderer, scene, cam, 0);
                    setT(1); await st.render(renderer, scene, cam); await tw.render(renderer, scene, cam, 0);
                    const m = await read(st.motion, D), q0 = await read(tw.motion, D);
                    setT(0); await tw.render(renderer, scene, cam, 1); setT(1); await tw.render(renderer, scene, cam, 1); const q1 = await read(tw.motion, D);
                    let w0 = 0, w1 = 0, moving = 0; for (let i = 0; i < D * D; i++) { w0 = Math.max(w0, Math.abs(q0[i * 4] - m[i * 4]) * D, Math.abs(q0[i * 4 + 1] - m[i * 4 + 1]) * D);
                        w1 = Math.max(w1, Math.abs(q1[i * 4]) * D, Math.abs(q1[i * 4 + 1]) * D); if (Math.hypot(m[i * 4], m[i * 4 + 1]) * D > 0.5) moving++; }
                    o.ends = { w0, w1, moving }; st.dispose(); tw.dispose(); cam.position.set(0, 0.6, 5.2); cam.lookAt(0, 0, 0); cam.updateMatrixWorld();
                }
                const stage = TT.makeMotionStage(THREE, T, { w: D, h: D, gl }), tw = TT.makeMotionStage(THREE, T, { w: D, h: D, gl, toward: true });
                const arms = { chord: FG.makeFrameGen(THREE, T, { w: D, h: D }), arc: FG.makeFrameGen(THREE, T, { w: D, h: D, arc: true }) };
                const A = tgt(D), B = tgt(D), o2 = tgt(D), big = tgt(D * 4), one = tgt(D);
                for (const spin of [4, 12, 30, 60]) {
                    const setT = (k) => { const t = k / 60 * spin; knot.rotation.set(0.4 + t * 0.4, 0.6 + t * 0.6, 0); knot.updateMatrixWorld(); };
                    setT(0); renderer.setRenderTarget(A); await renderer.renderAsync(scene, cam); setT(1); renderer.setRenderTarget(B); await renderer.renderAsync(scene, cam);
                    setT(0.5); renderer.setRenderTarget(one); await renderer.renderAsync(scene, cam); const truth1 = await read(one, D);
                    renderer.setRenderTarget(big); await renderer.renderAsync(scene, cam); const t4 = await read(big, D * 4);
                    const truth = new Float32Array(D * D * 4); for (let y = 0; y < D; y++) for (let x = 0; x < D; x++) for (let c = 0; c < 3; c++) { let s = 0;
                        for (let sy = 0; sy < 4; sy++) for (let sx = 0; sx < 4; sx++) s += t4[((y * 4 + sy) * D * 4 + x * 4 + sx) * 4 + c]; truth[(y * D + x) * 4 + c] = s / 16; }
                    const ps = (img, tr) => { let q = 0; for (let i = 0; i < D * D; i++) for (let c = 0; c < 3; c++) q += (cl(img[i * 4 + c]) - cl(tr[i * 4 + c])) ** 2; return 10 * Math.log10(1 / (q / (D * D * 3))); };
                    const c = {};
                    for (const [an, g] of Object.entries(arms)) {
                        // each generator primed with frame 0's own fields, as in use
                        setT(-1); await stage.render(renderer, scene, cam); await tw.render(renderer, scene, cam, 0.5);
                        setT(0); await stage.render(renderer, scene, cam); await tw.render(renderer, scene, cam, 0.5);
                        await g.generate(renderer, { prev: A.texture, cur: A.texture, motion: stage.motion.texture, depth: stage.depth.texture, toward: tw.motion.texture }, o2);
                        setT(1); await stage.render(renderer, scene, cam); await tw.render(renderer, scene, cam, 0.5);
                        await g.generate(renderer, { prev: A.texture, cur: B.texture, motion: stage.motion.texture, depth: stage.depth.texture, toward: tw.motion.texture }, o2);
                        const img = await read(o2, D); c[an] = { ss: ps(img, truth), one: ps(img, truth1) };
                        if (an === "arc") { const m = await read(stage.motion, D), q = await read(tw.motion, D); let n = 0, sum = 0;
                            for (let i = 0; i < D * D; i++) if (m[i * 4] || m[i * 4 + 1]) { n++; sum += Math.hypot(q[i * 4] * D - 0.5 * m[i * 4] * D, q[i * 4 + 1] * D - 0.5 * m[i * 4 + 1] * D); }
                            c.offChord = sum / n; }
                    }
                    o.cases[spin] = c;
                }
                for (const g of Object.values(arms)) g.dispose(); stage.dispose(); tw.dispose(); for (const t of [A, B, o2, big, one]) t.dispose();
                // and the arc generator refuses what it cannot do
                const refuse = async (f) => { try { await f(); return "no throw"; } catch (e) { return String(e.message); } };
                o.refusals = [await refuse(() => FG.makeFrameGen(THREE, T, { w: D, h: D, arc: true, flow: {} })),
                              await refuse(async () => { const g = FG.makeFrameGen(THREE, T, { w: D, h: D, arc: true }); const x = tgt(D); await g.generate(renderer, { prev: x.texture, cur: x.texture, motion: x.texture, depth: x.texture }); })];
                out[mode] = o; renderer.dispose();
            } catch (err) { out[mode] = { err: String(err && err.stack || err).slice(0, 700) }; }
        }
        return out;
    }` });
    ok("the harness ran every case", r.ok && r.result && !r.result.webgpu.err, r.ok ? `webgpu ${r.result.webgpu.err || "ok"}` : (r.reason || (r.pageErrors || []).join("; ")));
    if (r.ok && r.result && !r.result.webgpu.err) {
        const o = r.result.webgpu, C = o.cases, d = (x, y) => (x - y >= 0 ? "+" : "") + (x - y).toFixed(2);
        ok(`the toward stage's ends: at t = 0 it IS the ordinary motion field (worst ${o.ends.w0.toExponential(2)} px) and at t = 1 nothing moves (worst ${o.ends.w1.toExponential(2)} px), the knot turning at 30x under a panning camera (${o.ends.moving} pixels moving)`,
           o.ends.w0 < 1e-3 && o.ends.w1 < 1e-3 && o.ends.moving > 1000, "the previous pose is the one at time t on the arc -- the object's and the camera's -- and at the ends it is the frame itself");
        for (const [spin, c] of Object.entries(C)) say(`knot at ${String(spin).padStart(2)}x: the toward field ${c.offChord.toFixed(3)} px off half the chord on average; arc ${d(c.arc.ss, c.chord.ss)} dB against the supersampled midpoint (${c.chord.ss.toFixed(2)} -> ${c.arc.ss.toFixed(2)}), ${d(c.arc.one, c.chord.one)} against a single-sample one`);
        ok(`*** the arc pays where rotation is FAST: ${d(C[60].arc.ss, C[60].chord.ss)} dB at 60x the page's spin (${d(C[60].arc.one, C[60].chord.one)} against a single-sample render), ${d(C[30].arc.ss, C[30].chord.ss)} at 30x ***`,
           C[60].arc.ss - C[60].chord.ss > 0.4 && C[60].arc.one - C[60].chord.one > 0.4 && C[30].arc.ss > C[30].chord.ss,
           "a wheel, a fan, a spinning pickup: the chord's midpoint is off the arc by pixels, the landing and both samples with it");
        ok(`  ...and nowhere else: ${d(C[4].arc.ss, C[4].chord.ss)} at 4x and ${d(C[12].arc.ss, C[12].chord.ss)} at 12x, where the toward field is ${C[4].offChord.toFixed(3)} and ${C[12].offChord.toFixed(3)} px from the chord's -- which is why it is an option and not the default: it costs a second geometry pass, a second splat and a second fill`,
           Math.abs(C[4].arc.ss - C[4].chord.ss) < 0.1 && Math.abs(C[12].arc.ss - C[12].chord.ss) < 0.15 && C[4].offChord < 0.05,
           "the chord is the arc to a hundredth of a pixel at the rates fsr-three.html turns its knot");
        ok(`  ...and the arc generator refuses the flow, whose vectors are chords, and a call without its toward field`,
           /arc and flow are not combined/.test(o.refusals[0]) && /needs `toward`/.test(o.refusals[1]), o.refusals.map((x) => x.slice(0, 60)).join(" | "));
    }
}

// ---- v4744 SABOTAGE LOG ----------------------------------------------------------------------------------------
// Against render/temporalTsl.mjs, here: A1 poseAt not turning -> 4; A2 poseAt run backwards -> 2; A3 the toward camera not
// interpolated -> 1; A4 the toward stage's t ignored -> 1. Against render/frameInterp.mjs, in render/frameInterpTsl-selfcheck.mjs:
// A5 the prev offset's sign -> 3; A6 an arc block landed on the chord anyway -> 2. Against render/frameInterpTsl.mjs, there:
// A7 the prev offset's sign -> 2; A8 landed on the chord -> 2; A9 the second fill skipped -> 2; A10 both samples from one
// offset -> 2; A11 a declined displacement splatted -> 2. Against fx/fsr/fsrFrameGenTsl.mjs, here: A12 the displacement left
// in uv, not pixels -> 2; A13 the splat given no displacement -> 1. Thirteen, all red.
// And one arm measured and NOT kept: taking the newer frame alone where FSR2's disocclusion test says the older frame hid the
// surface -- the ghost a blend paints into a gap -- was built into the warp and its mirror and read -0.30 dB at 6x, +0.21 at
// 12x against the supersampled midpoint (-0.04 and +0.19 against a single-sample one): the knot hides its own tubes, and the
// newer frame alone is worse there than the blend. It was taken out rather than left as a switch nothing should turn on.
console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nALL GREEN");
console.log("unchecked here: the arc on FSR2's upscaled frames (fx/fsr/fsr3Tsl.mjs does not render a toward stage -- it would cost the " +
    "scene pass that driver was built not to draw) and with the optical flow, which the generator refuses; non-rigid motion -- skinning, " +
    "morphs -- whose vertices the pose interpolation does not reach; and a timed pacer's t per call, which would need the toward stage per t.");
process.exitCode = fails ? 1 : 0;
