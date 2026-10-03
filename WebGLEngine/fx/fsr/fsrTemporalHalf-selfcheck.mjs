#!/usr/bin/env node
// WebGLEngine/fx/fsr/fsrTemporalHalf-selfcheck.mjs -- v4733
//
// FSR2'S CHAIN AT THE PRECISION IT SHIPS WITH. fx/fsr/fsrTemporalTsl.mjs's makeFsrTemporal defaults its colour targets
// -- the jittered render, the resolved frame and the two histories -- to HalfFloatType, and every other gate in the arc
// replaces that with FloatType so it can grade the ARITHMETIC. So the configuration fsr-three.html actually runs was the
// one configuration nothing held to anything. This gate does, three ways:
//
//   1. THE STALL, DERIVED. A half-float history cannot move by less than half an ulp, and the accumulate moves it by
//      alpha * (current - history); so it STOPS converging once |alpha * (current - history)| < ulp/2, and the error it
//      keeps is up to ulp / (2 alpha) -- five ulps at alpha 0.1. That is arithmetic, and section 1 runs it.
//   2. THE COMPOSITION AT HALF. The CPU chain from the device's renders, as fx/fsr/fsrTemporalTsl-selfcheck.mjs runs
//      it, but ROUNDED TO HALF at exactly the three writes the device makes to a half target (text/slugAtlas.js's
//      toHalf -- round-to-nearest-even, one definition in the tree). Agreement is graded in half ulps.
//      *** v4778 RIG RUN 5: ROUNDED THE WAY THIS DEVICE ROUNDS, ASKED FIRST. *** On Keith's GTX 1080 this row read worst
//      1070.50 half ulps, 269,154 of 294,912 values off, on both backends. Direct3D converts to a smaller float format
//      toward zero, and both backends there are Direct3D; SwiftShader rounds to nearest even. Graded against a truncating
//      mirror, this box's SwiftShader reads 268,007 of 294,912 off: the rig's figure from the other side. So each backend
//      is asked how it writes half (probeHalfWrite, below) and the mirror rounds by that rule -- or the row is red, if
//      the device follows neither.
//   3. WHAT IT COSTS -- fx/fsr/fsrTemporalHalfQuality-selfcheck.mjs: the driver at FloatType and at its default, on
//      fsr-three.html's scene and on moving wires, against a supersampled truth.
//
// *** A HALF TARGET READS BACK AS ITS RAW 16-BIT WORDS. *** readRenderTargetPixelsAsync on a HalfFloatType target
// returns a Uint16Array of binary16 bit patterns, on both backends; the first measurement read them as numbers and
// found the half history "12,000 away" from the float one. They are decoded with fromHalf here.
//
// *** AND ON WEBGPU ITS ROWS ARE PADDED TO 256 BYTES, AS A FLOAT TARGET'S ARE -- AT HALF THE BYTES A TEXEL. *** A float
// row needs a width that is a multiple of 16 to come back unpadded; a half row needs a multiple of 32. The first draft
// read a 48-wide half history on WebGPU and found it "2,047 ulps" from the mirror -- the rows were 384 bytes padded to
// 512, and every row after the first was read from the wrong place. WebGL2 read the same run to 2 ulps. So section 2
// runs at 64 x 64 from 32 x 32 -- 2x, the page's default.
//
// Split v4733: section 3 -- what half COSTS against float and a truth -- is fx/fsr/fsrTemporalHalfQuality-selfcheck.mjs,
// which it had to be once the two sections together took 49 s of the sweep's 20.
"use strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runInEngineOrigin, webgpuSkipReason } from "../../tools/ship/webgpuHarness.mjs";
import { toHalf, toHalfRTZ, fromHalf } from "../../text/slugAtlas.js";
import { resolveJitterAwareCPU } from "../../render/temporalResolve.mjs";
import { dilateCPU } from "../../render/dilate.mjs";
import { disocclusionCPU, historyFactorCPU, rectifiedAccumulateCPU } from "../../render/temporalReject.mjs";
import { reactiveCPU } from "../../render/reactive.mjs";
import { newLocksCPU, makeLockState, advanceLocks, lockRelaxation } from "../../render/temporalLock.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (label, cond, detail) => { if (!cond) fails++; console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "   " + detail : ""}`); };
const h = (v) => fromHalf(toHalf(v));
const hz = (v) => fromHalf(toHalfRTZ(v));

// ---- HOW THIS DEVICE WRITES HALF (rig run 5) ---------------------------------------------------------------------------
// The page renders known f32 values into a one-row HalfFloatType target and hands back the raw binary16 words (one row, so
// WebGPU's 256-byte row padding never applies and WebGL2's flipped rows are the same row). Two values are exact in half --
// controls: anything else is a probe that did not write what it meant to -- and four sit between halves:
//   1 + 0.25 ulp  ->  1           under both rules (a third control, on the direction)
//   1 + 0.75 ulp  ->  1 + 1 ulp   to nearest,  1          toward zero
//   1 + 1.5 ulp   ->  1 + 2 ulp   to nearest (the tie goes to even),  1 + 1 ulp  toward zero
//   0.5 + 0.75 of 0.5's ulp, the same question an octave down
// Kept in this gate rather than a module: it is the only consumer, and tools/ship/graveyard-selfcheck.mjs counted the
// module this first was as an orphan utility (189 against 188), which is what a helper only a gate imports is.
const PROBE_VALUES = [1, 1 + 2 ** -10, 1 + 0.25 * 2 ** -10, 1 + 0.75 * 2 ** -10, 1 + 1.5 * 2 ** -10, 0.5 + 0.75 * 2 ** -11];
const PROBE_CONTROLS = 3;
function halfRoundingOf(words) {
    const w = Array.from(words || []);
    if (w.length < PROBE_VALUES.length) return { rule: "other", why: `read ${w.length} words, wanted ${PROBE_VALUES.length}`, words: w };
    const ne = PROBE_VALUES.map(toHalf), z = PROBE_VALUES.map(toHalfRTZ);
    for (let i = 0; i < PROBE_CONTROLS; i++) if (w[i] !== ne[i]) return { rule: "other", why: `control ${PROBE_VALUES[i]} wrote ${fromHalf(w[i])}, not itself`, words: w };
    const is = (v) => v.every((x, i) => x === w[i]);
    if (is(ne)) return { rule: "rtne", why: "to nearest, ties to even", words: w };
    if (is(z)) return { rule: "rtz", why: "toward zero", words: w };
    return { rule: "other", why: `wrote ${w.slice(PROBE_CONTROLS).map(fromHalf).join(", ")} for ${PROBE_VALUES.slice(PROBE_CONTROLS).join(", ")}`, words: w };
}
const ROUND = { rtne: h, rtz: hz };
/** One ulp of binary16 at |v| (normal range; the subnormal spacing below 2^-14). */
const ulp = (v) => { const a = Math.abs(v); if (a < 2 ** -14) return 2 ** -24; return 2 ** (Math.floor(Math.log2(a)) - 10); };
const ALPHA = 0.1;

console.log("\n1. WITHOUT A DEVICE: where a half-float history stops converging");
{
    // the accumulate on one value, at half: hist <- h(hist + alpha * (target - hist)), from far below and far above
    let worst = 0, worstUlps = 0, n = 0, reached = 0;
    for (let t = 0.013; t < 1.9; t += 0.0371) {
        const target = h(t);
        for (const start of [0, 2]) {
            let hist = h(start);
            for (let k = 0; k < 400; k++) hist = h(hist + ALPHA * (target - hist));
            const e = Math.abs(hist - target), bound = ulp(target) / (2 * ALPHA);
            n++; if (e <= bound) reached++;
            worst = Math.max(worst, e); worstUlps = Math.max(worstUlps, e / ulp(target));
        }
    }
    ok(`*** a half history stalls short of its target by up to ${worstUlps.toFixed(1)} ulps (worst ${worst.toExponential(2)}), and never by more than ulp / (2 alpha) = ${(1 / (2 * ALPHA)).toFixed(0)} ulps -- ${reached} of ${n} runs inside it ***`,
       reached === n && worstUlps > 1, "the step alpha * (target - history) rounds to nothing once it is under half an ulp; the stall is the precision's, not the chain's");
    // rig run 5: and toward zero, the rule a Direct3D device writes half by. A step under a whole ulp truncates to nothing,
    // so a history climbing to its target stalls up to ulp / alpha short; one coming down still moves, since truncation
    // rounds a positive value down. The bound doubles: a statement about the rounding rule, not half precision alone.
    let zWorst = 0, zReached = 0, zn = 0;
    for (let t = 0.013; t < 1.9; t += 0.0371) {
        const target = hz(t);
        for (const start of [0, 2]) {
            let hist = hz(start);
            for (let k = 0; k < 400; k++) hist = hz(hist + ALPHA * (target - hist));
            const e = Math.abs(hist - target);
            zn++; if (e <= ulp(target) / ALPHA) zReached++;
            zWorst = Math.max(zWorst, e / ulp(target));
        }
    }
    ok(`*** ...and truncating, it stalls by up to ${zWorst.toFixed(1)} ulps, never more than ulp / alpha = ${(1 / ALPHA).toFixed(0)} -- ${zReached} of ${zn} runs inside it, and past to-nearest's ${(1 / (2 * ALPHA)).toFixed(0)} ***`,
       zReached === zn && zWorst > 1 / (2 * ALPHA), "toward zero, a step must reach a whole ulp to count; this is the bound a Direct3D device's history keeps");
}

const skip = webgpuSkipReason();
console.log("\n2. ON THE DEVICE: the chain at half, against the CPU chain rounded to half where the device writes half");
if (skip) { console.log(`  SKIP  ${skip}`); console.log("  ----  *** NOT A PASS. ***"); fails++; }
else {
    const RW = 32, DW = 64, N = 24;   // 2x, the page's default -- and widths a multiple of 32, see the header
    const r = await runInEngineOrigin({ engineRoot: ENG, timeoutMs: 300000, args: { RW, DW, N, ALPHA, PROBE: PROBE_VALUES }, script: `async (a) => {
        const THREE = await import("/vendor/three-webgpu/three.webgpu.js"); const T = await import("/vendor/three-webgpu/three.tsl.js");
        const FT = await import("/fx/fsr/fsrTemporalTsl.mjs"); const TC = await import("/render/temporalClipTsl.mjs");
        // rig run 5: write a.PROBE into a one-row half target, read the words back. A SUM OF ONE-LEVEL SELECTS, each its value
        // at its own texel and 0 elsewhere -- adding zeros is exact in f32. Nested selects are the obvious spelling, and the
        // WebGL2 backend's node builder throws on them in this three.js ("Cannot read properties of undefined (reading
        // 'addToStack')"): the target was never written and the probe read six zeros.
        const probeHalfWrite = async (renderer) => {
            const n = a.PROBE.length;
            const rt = new THREE.RenderTarget(n, 1, { type: THREE.HalfFloatType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: false });
            const x = T.int(T.screenCoordinate.x);
            let v = T.float(0);
            for (let i = 0; i < n; i++) v = v.add(T.select(x.equal(T.int(i)), T.float(a.PROBE[i]), T.float(0)));
            const m = new THREE.NodeMaterial(); m.fragmentNode = T.vec4(v, v, v, 1); m.blending = THREE.NoBlending; m.depthTest = false; m.depthWrite = false;
            const sc = new THREE.Scene(); sc.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), m));
            const was = renderer.getRenderTarget();
            renderer.setRenderTarget(rt); await renderer.renderAsync(sc, new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)); renderer.setRenderTarget(was);
            const px = await renderer.readRenderTargetPixelsAsync(rt, 0, 0, n, 1);
            rt.dispose(); m.dispose();
            return Array.from({ length: n }, (_, i) => px[i * 4]);
        };
        const out = {};
        for (const mode of ["webgpu", "webgl2"]) {
            try {
                const canvas = document.createElement("canvas"); canvas.width = a.DW; canvas.height = a.DW;
                const renderer = new THREE.WebGPURenderer({ canvas, forceWebGL: mode === "webgl2", antialias: false }); await renderer.init();
                const o = { frames: [] };
                // rig run 5: how this backend writes half, before anything is held to a mirror that writes it
                o.halfWords = await probeHalfWrite(renderer);
                const read = async (t, n) => { const px = await renderer.readRenderTargetPixelsAsync(t, 0, 0, n, n); o.kinds = o.kinds || {}; o.kinds[t.texture.type === THREE.HalfFloatType ? "half" : "float"] = px.constructor.name; return Array.from(px); };
                // fx/fsr/fsrTemporalTsl-selfcheck.mjs's scene: a striped wall with a pulsing lamp, a box sliding past, a slow pan
                const scene = new THREE.Scene(); scene.background = new THREE.Color(0.05, 0.05, 0.08);
                const pulse = T.uniform(0.2);
                const wm = new THREE.MeshBasicNodeMaterial();
                wm.colorNode = T.Fn(() => { const uv = T.uv(); const st = T.sin(uv.x.mul(30.0)).mul(0.15).add(0.35);
                    const lamp = T.select(uv.x.greaterThan(0.3).and(uv.x.lessThan(0.55)).and(uv.y.greaterThan(0.3)).and(uv.y.lessThan(0.6)), pulse, T.float(0.0));
                    return T.vec3(st.add(lamp), st.add(lamp.mul(0.6)), st.mul(0.8)); })();
                const wall = new THREE.Mesh(new THREE.PlaneGeometry(6, 6), wm); wall.position.z = -1.5; scene.add(wall);
                const box = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.6, 0.6), new THREE.MeshNormalNodeMaterial()); scene.add(box);
                const cam = new THREE.PerspectiveCamera(45, 1, 0.5, 20); cam.position.set(0, 0, 3.5); cam.lookAt(0, 0, 0); cam.updateMatrixWorld();
                const vp = Array.from(new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse).elements);
                const threshold = TC.clipGapThreshold(vp, [0, 0, 0.3], [0, 0, -1.5]); o.threshold = threshold;
                // the DEFAULT type: no \`type\` passed
                const fsr = FT.makeFsrTemporal(THREE, T, renderer, { renderWidth: a.RW, renderHeight: a.RW, displayWidth: a.DW, displayHeight: a.DW, threshold, alpha: a.ALPHA });
                o.colType = fsr.targets.history[0].texture.type === THREE.HalfFloatType ? "half" : "other"; o.lockFrom = fsr.lockFrom; o.lockLife = fsr.locks.life;
                const outRT = new THREE.RenderTarget(a.DW, a.DW, { type: THREE.FloatType, depthBuffer: false });
                for (let k = 0; k < a.N; k++) {
                    pulse.value = 0.2 + 0.2 * Math.sin(0.5 * k);
                    box.position.set(-1 + 0.05 * k, 0.1 * Math.sin(0.3 * k), 0); box.rotation.set(0.2 * k, 0.3 * k, 0); box.updateMatrixWorld();
                    cam.position.set(0.01 * k, 0, 3.5); cam.lookAt(0.01 * k, 0, 0); cam.updateMatrixWorld();
                    const phase = fsr.phase.slice();
                    await fsr.render(scene, cam, outRT);
                    o.frames.push({ phase, colour: await read(fsr.targets.colour, a.RW), depth: await read(fsr.targets.depth, a.DW), motion: await read(fsr.targets.motion, a.DW),
                                    history: await read(fsr.targets.history[k % 2], a.DW) });
                }
                fsr.dispose(); out[mode] = o; renderer.dispose();
            } catch (err) { out[mode] = { err: String(err && err.stack || err).slice(0, 700) }; }
        }
        return out;
    }` });
    ok("the harness ran the chain at its default precision on BOTH backends", r.ok && r.result && !r.result.webgpu.err && !r.result.webgl2.err,
       r.ok ? `webgpu ${r.result.webgpu.err || "ok"}; webgl2 ${r.result.webgl2.err || "ok"}` : (r.reason || (r.pageErrors || []).join("; ")));
    if (r.ok && r.result) for (const mode of ["webgpu", "webgl2"]) {
        const o = r.result[mode]; if (!o || o.err) continue;
        ok(`[${mode}] the driver's default colour targets ARE half float, and a half target reads back as a ${o.kinds.half}`,
           o.colType === "half" && o.kinds.half === "Uint16Array" && o.kinds.float === "Float32Array", "the colour, resolved and history targets; motion, depth and the masks are float at any setting");
        const hr = halfRoundingOf(o.halfWords), hd = ROUND[hr.rule] || h;
        ok(`[${mode}] the device writes half by a rule the mirror knows: ${hr.rule} -- ${hr.why}`, hr.rule !== "other",
           `the probe's words ${(hr.words || []).map((w) => "0x" + w.toString(16)).join(" ")}; SwiftShader rounds to nearest even, a Direct3D device toward zero`);
        const flip = (px, n) => { if (mode === "webgpu") return px; const f = []; for (let y = n - 1; y >= 0; y--) f.push(...px.slice(y * n * 4, (y + 1) * n * 4)); return f; };
        const dec = (px, n) => Float64Array.from(flip(px, n), fromHalf), flt = (px, n) => new Float32Array(flip(px, n));
        const ch = (a4) => { const x = new Float32Array(a4.length / 4); for (let i = 0; i < x.length; i++) x[i] = a4[i * 4]; return x; };
        const N2 = DW * DW, ls = makeLockState(DW, DW);
        let hist = null, rec = null, worstU = 0, worstAbs = 0, off = 0, total = 0, frames = 0;
        o.frames.forEach((f, k) => {
            // the three writes the device makes to a half target: the render (read back as it is), the resolve, the accumulate
            const cur = resolveJitterAwareCPU({ src: dec(f.colour, RW), rw: RW, rh: RW, dw: DW, dh: DW, jitter: f.phase }).data.map(hd);
            const dil = dilateCPU({ depth: ch(flt(f.depth, DW)), motion: flt(f.motion, DW), w: DW, h: DW, nearerIsLess: true });
            let factor = null, dis = null;
            if (k > 0) {
                const rx = reactiveCPU({ current: cur, history: hist, motion: dil.motion, prevDepth: rec, w: DW, h: DW, threshold: o.threshold });
                dis = disocclusionCPU({ motion: dil.motion, prevDepth: rec, w: DW, h: DW, threshold: o.threshold, nearerIsLess: true });
                factor = historyFactorCPU({ disocclusion: dis.data, reactive: rx.data, n: N2 });
            }
            const cand = newLocksCPU({ current: cur, w: DW, h: DW, margin: 0.05 });
            advanceLocks(ls, { motion: dil.motion, disocclusion: dis ? dis.data : null, newLocks: cand.data, w: DW, h: DW, life: o.lockLife });
            hist = rectifiedAccumulateCPU({ current: cur, history: k ? hist : null, motion: dil.motion, factor, relax: lockRelaxation(ls, { life: o.lockLife }),
                                           w: DW, h: DW, alpha: ALPHA, space: "ycocg" }).data.map(hd);
            rec = dil.depth;
            const g = dec(f.history, DW); frames++;
            for (let i = 0; i < N2; i++) for (let c = 0; c < 3; c++) { const a = g[i * 4 + c], b = hist[i * 4 + c], d = Math.abs(a - b); total++;
                if (d > 0) off++; worstAbs = Math.max(worstAbs, d); worstU = Math.max(worstU, d / ulp(Math.max(Math.abs(a), Math.abs(b)))); }
        });
        ok(`*** [${mode}] the device's HALF chain is the CPU chain rounded to half (${hr.rule}, as the device does) at the device's three half writes -- ${frames} frames, worst ${worstU.toFixed(2)} half ulps (${worstAbs.toExponential(2)}); ${off} of ${total} values differ at all ***`,
           worstU <= 2 && off < total * 0.01,
           "the device computes in f32 and the mirror in f64, so a value on a rounding boundary can land one half ulp either side; the accumulate is a contraction, so that does not grow");
    }
}

// ---- v4733 SABOTAGE LOG ----------------------------------------------------------------------------------------
// H1-H3 and H7 against fx/fsr/fsrTemporalTsl.mjs, each also run against fx/fsr/fsrTemporalHalfQuality-selfcheck.mjs; H5
// against text/slugAtlas.js, whose toHalf both this gate's mirror and its stall derivation use.
//                                                             here   quality gate
//   H1 the default precision is float                          -> 2      4
//   H2 the histories float while the colour is half            -> 4      4
//   H3 the resolved frame kept at float                        -> 2      0
//   H5 toHalf truncates instead of rounding to nearest even    -> 3      --
//   H7 the default precision is 8-bit                          -> 4      4
// H3 is the one only the composition sees: a resolve kept at float moves the history by an ulp or two a frame, 393
// ulps worst against a mirror that rounds where the device should, and no PSNR can see that. H5 reddens section 1 as
// well as section 2 -- a truncating half stalls at nine ulps, not five, so the stall bound is a statement about
// round-to-nearest-even and not about half precision alone.
// v4778 RIG RUN 5, against text/slugAtlas.js and this file, each restored and md5 verified:
//   T1 toHalfRTZ rounds to nearest                              -> 1, section 1's truncating stall ("up to 5.0 ulps")
//   T2 the probe never renders                                  -> 1, the harness row (WebGPU's readback throws on a
//                                                                     target nothing drew)
//   T3 every device classified toward zero                      -> 2, both composition rows, 268,007 and 267,980 of
//                                                                     294,912 off -- the rule the mirror rounds by is
//                                                                     load-bearing, and this is the rig's figure mirrored
//   T4 the probe's words read one texel over                    -> 2, both probe rows, "control 1 wrote 1.0009765625"
// The mirror ignoring the probe's rule cannot be driven red here: this box rounds to nearest and so does the default.
// The rig is where it shows.
console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nALL GREEN");
console.log("unchecked here: half with the LOCK RING on (the ring, the fill count and the lock state are float at any setting, and only " +
    "their inputs are half); and a history above 2, where an ulp is 2^-9 and the stall bound four times what it is below 1.");
process.exitCode = fails ? 1 : 0;
