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
//      is asked how it writes half (fx/fsr/fsrTemporalTsl.mjs probeHalfWrite) and the mirror rounds by that rule -- or the row is red, if
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
import { toHalf, toHalfRTZ, fromHalf, HALF_PROBE_VALUES, halfRuleOf } from "../../text/slugAtlas.js";
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

// How this device writes half: fx/fsr/fsrTemporalTsl.mjs's probeHalfWrite renders text/slugAtlas.js's HALF_PROBE_VALUES
// into a half target in the page, and halfRuleOf names the rule from the words (both say how). They live beside the
// driver and toHalf rather than in this gate because fsrTemporalHalfQuality-selfcheck asks the same question, and not
// in a module of their own because a module only gates import is an orphan to tools/ship/graveyard-selfcheck.mjs.
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
    const r = await runInEngineOrigin({ engineRoot: ENG, timeoutMs: 300000, args: { RW, DW, N, ALPHA, PROBE: HALF_PROBE_VALUES }, script: `async (a) => {
        const THREE = await import("/vendor/three-webgpu/three.webgpu.js"); const T = await import("/vendor/three-webgpu/three.tsl.js");
        const FT = await import("/fx/fsr/fsrTemporalTsl.mjs"); const TC = await import("/render/temporalClipTsl.mjs");
        const out = {};
        for (const mode of ["webgpu", "webgl2"]) {
            try {
                const canvas = document.createElement("canvas"); canvas.width = a.DW; canvas.height = a.DW;
                const renderer = new THREE.WebGPURenderer({ canvas, forceWebGL: mode === "webgl2", antialias: false }); await renderer.init();
                const o = { frames: [] };
                // rig run 5: how this backend writes half, before anything is held to a mirror that writes it
                o.halfWords = await FT.probeHalfWrite(THREE, T, renderer, a.PROBE);
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
        const hr = halfRuleOf(o.halfWords), hd = ROUND[hr.rule] || h;
        ok(`[${mode}] the device writes half by a rule the mirror knows: ${hr.rule} -- ${hr.why}`, hr.rule !== "other",
           `the probe's words ${(hr.words || []).map((w) => "0x" + w.toString(16)).join(" ")}; SwiftShader rounds to nearest even, a Direct3D device toward zero`);
        const flip = (px, n) => { if (mode === "webgpu") return px; const f = []; for (let y = n - 1; y >= 0; y--) f.push(...px.slice(y * n * 4, (y + 1) * n * 4)); return f; };
        const dec = (px, n) => Float64Array.from(flip(px, n), fromHalf), flt = (px, n) => new Float32Array(flip(px, n));
        const ch = (a4) => { const x = new Float32Array(a4.length / 4); for (let i = 0; i < x.length; i++) x[i] = a4[i * 4]; return x; };
        const N2 = DW * DW;
        // The CPU chain from the device's renders, rounding by `round` at the resolve and the accumulate; one history per frame.
        const mirror = (round) => {
            const ls = makeLockState(DW, DW), out = [];
            let hist = null, rec = null;
            o.frames.forEach((f, k) => {
                // the three writes the device makes to a half target: the render (read back as it is), the resolve, the accumulate
                const cur = resolveJitterAwareCPU({ src: dec(f.colour, RW), rw: RW, rh: RW, dw: DW, dh: DW, jitter: f.phase }).data.map(round);
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
                                               w: DW, h: DW, alpha: ALPHA, space: "ycocg" }).data.map(round);
                rec = dil.depth; out.push(hist);
            });
            return out;
        };
        // How far apart two chains' histories are, over every frame's RGB.
        const compare = (A, B) => { let worstU = 0, worstAbs = 0, off = 0, total = 0;
            A.forEach((ha, k) => { const hb = B[k]; for (let i = 0; i < N2; i++) for (let c = 0; c < 3; c++) { const a = ha[i * 4 + c], b = hb[i * 4 + c], d = Math.abs(a - b); total++;
                if (d > 0) off++; worstAbs = Math.max(worstAbs, d); worstU = Math.max(worstU, d / ulp(Math.max(Math.abs(a), Math.abs(b)))); } });
            return { worstU, worstAbs, off, total, frames: A.length };
        };
        const device = o.frames.map((f) => dec(f.history, DW));
        const mine = mirror(hd);
        const m = compare(device, mine);
        // *** RIG RUN 5c -- THE NOISE FLOOR OF THE RULE, MEASURED ON THIS RUN. *** The mirror again, every value nudged by one
        // f32 ulp, up, down or not at all (seeded), before it is rounded -- what f32 against f64 arithmetic can do to it. To
        // nearest, the boundaries are midpoints a value seldom sits on. Toward zero, they are the representable halves
        // themselves, which is exactly where a stalled history sits, and a nudge either side moves it a whole ulp. On this
        // box's frames that nudge moves a truncating chain on 19.8% of values, worst 32 ulps; the GTX 1080's device
        // disagreed with its truncating mirror on 2.4%, worst 21 (WebGPU) and 10 (WebGL2). What a device must beat is its
        // own rule's floor, taken here, not a constant argued for the other rule. It is a floor, not the whole of f32's
        // reach: to nearest, this box's device differs on 239 values where the nudged mirror moves 13 -- error carried
        // through the chain is more than one ulp at the last step -- and to nearest keeps its stricter row for that reason.
        let seed = 0x5eed;
        const rnd = () => { seed = (Math.imul(seed, 1103515245) + 12345) >>> 0; return seed / 2 ** 32; };
        const F = new Float32Array(1), U = new Uint32Array(F.buffer);
        const nudge = (v) => { if (v === 0 || !Number.isFinite(v)) return v; F[0] = v; const r = rnd(); if (r < 1 / 3) U[0]--; else if (r < 2 / 3) U[0]++; return F[0]; };
        const floor = compare(mine, mirror((v) => hd(nudge(v))));
        console.log(`  ----  [${mode}] the ${hr.rule} mirror against itself nudged one f32 ulp: ${floor.off} of ${floor.total} values move, worst ${floor.worstU.toFixed(2)} half ulps (${floor.worstAbs.toExponential(2)})`);
        // ...and a floor that would pass anything is no floor: it must sit well under what the OTHER rule's mirror reads
        // against this device, or a device passing under it has not shown which rule it follows.
        const other = hr.rule === "rtz" ? "rtne" : "rtz", wrong = compare(device, mirror(ROUND[other]));
        ok(`  [${mode}] the floor tells the rules apart: the ${other} mirror reads ${wrong.off} of ${wrong.total} off this device, the ${hr.rule} floor ${floor.off}`,
           hr.rule !== "other" && floor.off * 2 < wrong.off, "so a device inside the floor follows the rule it was probed for, and not merely f32 noise");
        const head = `*** [${mode}] the device's HALF chain is the CPU chain rounded to half (${hr.rule}, as the device does) at the device's three half writes -- ${m.frames} frames, worst ${m.worstU.toFixed(2)} half ulps (${m.worstAbs.toExponential(2)}); ${m.off} of ${m.total} values differ at all`;
        if (hr.rule === "rtz")
            ok(head + `, inside the rule's own floor (${floor.off} values, worst ${floor.worstU.toFixed(2)}) ***`,
               m.off <= floor.off && m.worstU <= floor.worstU && m.worstAbs <= floor.worstAbs,
               "toward zero, a value on a representable half lands a whole ulp either side of it on f32 noise, and a stalled history sits there; the floor is that noise, measured on this run's frames");
        else
            ok(head + " ***", m.worstU <= 2 && m.off < m.total * 0.01,
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
// v4778 RIG RUN 5, on the real files, each restored and md5 verified. The probe is fx/fsr/fsrTemporalTsl.mjs's
// probeHalfWrite and the classifier text/slugAtlas.js's halfRuleOf, shared with fsrTemporalHalfQuality-selfcheck.mjs:
//   T1 toHalfRTZ rounds to nearest                              -> 1, section 1's truncating stall ("up to 5.0 ulps")
//   P1 the probe never renders                                  -> 1, the harness row (WebGPU's readback throws on a
//                                                                     target nothing drew); the quality gate 1, the same
//   P2 the probe's words read one texel over                    -> 4, both probe rows ("control 1 wrote 1.0009765625")
//                                                                     and both floor rows; the quality gate 2, its probe rows
//   P3 halfRuleOf calls a to-nearest device truncating          -> 4, both composition rows (268,007 and 267,980 off,
//                                                                     the rig's figure mirrored) and both floor rows (the
//                                                                     rtz floor 58,262 against the rtne mirror's 239)
//   F1 the floor's nudge a 2.5% scaling, not an f32 ulp         -> 2, both floor rows (floor 291,161 against 268,007)
// The mirror ignoring the probe's rule, and the truncating composition row passing, cannot be driven from a to-nearest
// box: the rig is where they show.
console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nALL GREEN");
console.log("unchecked here: half with the LOCK RING on (the ring, the fill count and the lock state are float at any setting, and only " +
    "their inputs are half); and a history above 2, where an ulp is 2^-9 and the stall bound four times what it is below 1.");
process.exitCode = fails ? 1 : 0;
