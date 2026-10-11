#!/usr/bin/env node
// WebGLEngine/fx/fsr/fsrFlicker-selfcheck.mjs -- v4746
//
// FLICKER BETWEEN REAL AND GENERATED FRAMES. Every other frame-generation gate grades one frame against the frame rendered
// at its time; this grades the SEQUENCE a display shows -- real, generated, real, generated -- with render/flicker.mjs,
// against the sequence rendered at the same times (4 x 4 supersampled). The measure is `excess`: how much the shown
// sequence alternates at half the display rate beyond what the scene itself does, in luma (printed times 255).
//
// On fsr-three.html's knot and striped floor, 128 x 128, 12 shown frames after 16 to settle, two motions -- the knot
// turning at the page's 4x with the camera still, and a camera pan of 0.08 a frame -- and five arms:
//   repeat    each real frame shown twice: no generation, the control -- judder
//   native    fx/fsr/fsrFrameGenTsl.mjs between single-sample frames rendered at display size
//   msaa      the same between frames rendered with 4x MSAA (half float: WebGPU does not multisample rgba32float)
//   rcas      native, with RCAS at 0.5 over the generated frames only -- the obvious fix for a soft frame between sharp ones
//   fsr3      fx/fsr/fsr3Tsl.mjs: FSR2 at 64 x 64 and the generator between its frames, as FSR3 composes them
//
// *** THE THRESHOLDS ARE ABOUT HALF WHAT THE PROBE READ. *** The probe (the same scene, three motions) is where the claims
// were found; the rows are the ones that would have made its reading wrong. WEBGPU ONLY: what is measured is what the
// sequence looks like, and the passes are held to their mirrors on both backends by their own gates.
"use strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runInEngineOrigin, webgpuSkipReason } from "../../tools/ship/webgpuHarness.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (label, cond, detail) => { if (!cond) fails++; console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "   " + detail : ""}`); };
const say = (s) => console.log(`  ----  ${s}`);
const D = 128, RW = 64, W0 = 16, K = 6;

console.log("\n1. ON THE DEVICE: the sequence shown, against the sequence rendered");
const skip = webgpuSkipReason();
if (skip) { console.log(`  SKIP  ${skip}`); console.log("  ----  *** NOT A PASS. *** Nothing here is static."); fails++; }
else {
    const r = await runInEngineOrigin({ engineRoot: ENG, timeoutMs: 300000, args: { D, RW, W0, K }, script: `async (a) => {
        const THREE = await import("/vendor/three-webgpu/three.webgpu.js"); const T = await import("/vendor/three-webgpu/three.tsl.js");
        const F3 = await import("/fx/fsr/fsr3Tsl.mjs"); const FG = await import("/fx/fsr/fsrFrameGenTsl.mjs"); const FS = await import("/fx/fsr/fsrTsl.mjs");
        const TT = await import("/render/temporalTsl.mjs"); const TC = await import("/render/temporalClipTsl.mjs"); const FL = await import("/render/flicker.mjs");
        const out = {};
        for (const mode of ["webgpu"]) {
            try {
                const D = a.D, canvas = document.createElement("canvas"); canvas.width = D; canvas.height = D;
                const renderer = new THREE.WebGPURenderer({ canvas, antialias: false }); await renderer.init();
                const tgt = (n, o = {}) => new THREE.RenderTarget(n, n, { type: THREE.FloatType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, ...o });
                const read = async (t, n) => new Float32Array(await renderer.readRenderTargetPixelsAsync(t, 0, 0, n, n));
                const ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
                const quad = (node) => { const m = new THREE.NodeMaterial(); m.fragmentNode = node; m.blending = THREE.NoBlending; const s = new THREE.Scene(); s.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), m)); return s; };
                const at = (tex) => T.textureLoad(tex, T.ivec2(T.int(T.screenCoordinate.x), T.int(T.screenCoordinate.y)));
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
                const big = tgt(D * 4), one = tgt(D), o2 = tgt(D), o3 = tgt(D);
                const ss = async (k) => { setT(k); renderer.setRenderTarget(big); await renderer.renderAsync(scene, cam); const t4 = await read(big, D * 4);
                    const tr = new Float32Array(D * D * 4); for (let y = 0; y < D; y++) for (let x = 0; x < D; x++) { for (let c = 0; c < 3; c++) { let s = 0;
                        for (let sy = 0; sy < 4; sy++) for (let sx = 0; sx < 4; sx++) s += t4[((y * 4 + sy) * D * 4 + x * 4 + sx) * 4 + c]; tr[(y * D + x) * 4 + c] = s / 16; } tr[(y * D + x) * 4 + 3] = 1; } return tr; };
                const cl = (v) => Math.min(1, Math.max(0, v));
                const psnr = (b, tr) => { let q = 0; for (let i = 0; i < D * D; i++) for (let c = 0; c < 3; c++) q += (cl(b[i * 4 + c]) - cl(tr[i * 4 + c])) ** 2; return 10 * Math.log10(1 / (q / (D * D * 3))); };
                const grade = (seq, truths) => { const f = FL.flickerCPU({ frames: seq, truths, w: D, h: D }), ps = seq.map((b, j) => psnr(b, truths[j]));
                    const mean = (x) => x.reduce((p, q) => p + q, 0) / x.length;
                    return { shown: f.shown * 255, truth: f.truth * 255, excess: f.excess * 255, error: f.error * 255,
                             real: mean(ps.filter((_, j) => j % 2 === 0)), gen: mean(ps.filter((_, j) => j % 2 === 1)) }; };
                // one native generator and stage for every arm and case: each loop primes them two frames before its window
                const shared = { stage: TT.makeMotionStage(THREE, T, { w: D, h: D, gl: TT.glClip(THREE, renderer) }), g: FG.makeFrameGen(THREE, T, { w: D, h: D }) };
                const rcas = quad(FS.rcasNode(T, o2.texture, { w: D, h: D, sharpness: 0.5 }).node);
                const o = {};
                for (const [cn, sp, pn] of [["spin", 4, 0], ["pan", 4, 0.08]]) {
                    spin = sp; pan = pn; const res = o[cn] = {};
                    const truths = []; for (let j = 0; j < 2 * a.K; j++) truths.push(await ss(a.W0 + j / 2));
                    // native frames, single-sample and 4x MSAA: the shown sequence real(W0), gen(W0, W0 + 1), real(W0 + 1) ...
                    for (const msaa of [0, 4]) {
                        const stage = shared.stage, g = shared.g;
                        const fr = [0, 1].map(() => tgt(D, msaa ? { type: THREE.HalfFloatType, samples: msaa } : {})), copy = fr.map((f) => quad(at(f.texture)));
                        const seq = [], rep = [], sharp = [];
                        for (let k = a.W0 - 2; k <= a.W0 + a.K; k++) {
                            setT(k); const cur = fr[k % 2], prev = fr[(k + 1) % 2];
                            renderer.setRenderTarget(cur); await renderer.renderAsync(scene, cam); await stage.render(renderer, scene, cam);
                            await g.generate(renderer, { prev: k > a.W0 - 2 ? prev.texture : cur.texture, cur: cur.texture, motion: stage.motion.texture, depth: stage.depth.texture }, o2);
                            if (k > a.W0) { seq.push(await read(o2, D)); rep.push(rep[rep.length - 1]);
                                if (!msaa) { renderer.setRenderTarget(o3); await renderer.renderAsync(rcas, ortho); sharp.push(await read(o3, D)); } }
                            if (k >= a.W0 && k < a.W0 + a.K) { renderer.setRenderTarget(one); await renderer.renderAsync(copy[k % 2], ortho); const rf = await read(one, D);
                                seq.push(rf); rep.push(rf); if (!msaa) sharp.push(rf); }
                        }
                        const n = 2 * a.K;
                        if (msaa) res.msaa = grade(seq.slice(0, n), truths);
                        else { res.native = grade(seq.slice(0, n), truths); res.repeat = grade(rep.slice(0, n), truths); res.rcas = grade(sharp.slice(0, n), truths); }
                        fr.forEach((f) => f.dispose());
                    }
                    // FSR3: FSR2's frames and the generator between them
                    const f3 = F3.makeFsr3(THREE, T, renderer, { fsr2: { renderWidth: a.RW, renderHeight: a.RW, displayWidth: D, displayHeight: D, threshold, type: THREE.FloatType } });
                    const seq = [];
                    for (let k = 0; k <= a.W0 + a.K; k++) {
                        // the generator only from the frame before the window: it needs the older depth, not the warm-up's frames
                        setT(k); await f3.render(scene, cam, false); if (k >= a.W0 - 1) await f3.generate(o2);
                        if (k > a.W0) seq.push(await read(o2, D));
                        if (k >= a.W0 && k < a.W0 + a.K) seq.push(await read(f3.targets.frames[k % 2], D));
                    }
                    res.fsr3 = grade(seq.slice(0, 2 * a.K), truths); f3.dispose();
                }
                shared.g.dispose(); shared.stage.dispose(); for (const t of [big, one, o2, o3]) t.dispose();
                out[mode] = o; renderer.dispose();
            } catch (err) { out[mode] = { err: String(err && err.stack || err).slice(0, 700) }; }
        }
        return out;
    }` });
    ok("the harness ran every case", r.ok && r.result && !r.result.webgpu.err,
       r.ok ? `webgpu ${r.result.webgpu.err || "ok"}` : (r.reason || (r.pageErrors || []).join("; ")));
    if (r.ok && r.result) for (const mode of ["webgpu"]) {
        const o = r.result[mode]; if (!o || o.err) continue;
        const f = (v) => v.toFixed(2), s = (v) => (v >= 0 ? "+" : "") + v.toFixed(2);
        for (const cn of ["spin", "pan"]) for (const an of ["repeat", "native", "msaa", "rcas", "fsr3"]) {
            const m = o[cn][an];
            say(`[${mode}] ${cn.padEnd(4)} ${an.padEnd(6)} shown ${f(m.shown)}, scene ${f(m.truth)}: excess ${s(m.excess)} (x 1/255); real frames ${f(m.real)} dB, ${an === "repeat" ? "held" : "generated"} ${f(m.gen)}`);
        }
        const S = o.spin, P = o.pan;
        ok(`*** [${mode}] FSR3 as it is composed -- generated between FSR2's frames -- adds NO flicker: excess ${s(S.fsr3.excess)} with the knot turning and ${s(P.fsr3.excess)} under the pan ***`,
           S.fsr3.excess <= 0.1 && P.fsr3.excess <= 0.1 && S.fsr3.excess < S.native.excess,
           "FSR2's frames are a temporal accumulation and the generated frame a blend of two of them: the real and the generated frames are the same kind of picture, within 0.3 dB of each other. Under the pan the sequence alternates LESS than the scene -- the stripes' own shimmer is filtered out, a loss of detail and not a flicker");
        ok(`*** [${mode}] between NATIVE single-sample frames it does, under the pan: ${s(P.native.excess)} / 255 over the scene, where FSR3's is ${s(P.fsr3.excess)} -- and its generated frames are ${s(P.native.gen - P.native.real)} dB CLOSER to the truth than the real frames around them ***`,
           P.native.excess >= 0.6 && P.native.gen - P.native.real >= 0.8,
           "a generated frame blends two frames, which anti-aliases the stripes the real frames alias: the display alternates aliased and anti-aliased, every other refresh. The quality rows grade the generated frame as better, and it is");
        ok(`  [${mode}] ...and 4x MSAA on the real frames takes the knot's (${s(S.native.excess)} to ${s(S.msaa.excess)}) but not the pan's (${s(P.msaa.excess)})`,
           S.msaa.excess < S.native.excess / 2 && P.msaa.excess >= 0.6,
           `the stripes at 128 pixels are finer than four samples resolve, and the generated frame still blends two of them -- ${s(P.msaa.gen - P.msaa.real)} dB over the MSAA frames`);
        ok(`  [${mode}] ...and SHARPENING the generated frames, the obvious fix for a soft frame between sharp ones, makes it worse in both: ${s(S.rcas.excess)} and ${s(P.rcas.excess)}, and costs them ${s(S.rcas.gen - S.native.gen)} and ${s(P.rcas.gen - P.native.gen)} dB`,
           S.rcas.excess > S.native.excess && P.rcas.excess > P.native.excess && S.rcas.gen < S.native.gen && P.rcas.gen < P.native.gen,
           "the generated frame is not too soft; the real frame is aliased. RCAS at 0.5 sharpens the blend's anti-aliasing back toward the alias it removed, and each generated frame differs from its neighbours more");
        ok(`  [${mode}] ...and the control reads what a held frame is: judder, ${s(S.repeat.excess)} over the scene with the knot turning, which generation takes to ${s(S.native.excess)}`,
           S.repeat.excess >= 0.2 && S.repeat.excess > 2 * S.native.excess,
           "render/flicker-selfcheck.mjs: a frame held for two refreshes reads a quarter of the scene's step. NOT under the pan, where it read +0.46 on one window and -0.88 on another: the distant stripes cross nearly half their period a shown frame, so the scene has half-rate content of its own there, and a held frame's reading depends on the phase the window catches");
    }
}

// ---- v4746 SABOTAGE LOG ----------------------------------------------------------------------------------------
// render/flicker.mjs's eight are logged in render/flicker-selfcheck.mjs; two reach this gate: the value in place of its
// second difference (L1) -> 1, and excess taken as a magnitude (L5) -> 1, which only FSR3 under the pan can show.
// *** THREE THINGS THIS GATE WAS WRONG ABOUT BEFORE IT WAS RIGHT. *** The probe's first metric was the plain alternating
// sum, and read the truth itself as flickering (a moving scene's trend); the second, untapered, read a held frame under the
// pan at +0.30 on one window and -1.14 on another; and 4x MSAA on rgba32float read back black -- WebGPU does not
// multisample it, so the MSAA frames are half float.
console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nALL GREEN");
console.log("unchecked here: a display that is not twice the real frames' rate, where the pacer's timed frames are not every other one " +
    "(render/framePacer.mjs) and the alternation this measures is spread across a cadence; what a viewer perceives, which this signal " +
    "measure does not model; and content finer than these stripes, where even FSR2's frames shimmer.");
process.exitCode = fails ? 1 : 0;
