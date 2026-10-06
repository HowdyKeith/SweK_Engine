#!/usr/bin/env node
// WebGLEngine/render/temporalLockSumsTsl-selfcheck.mjs -- the lock-ring round
//
// THE SUMS ON THE DEVICE, HELD TO THEIR MIRROR: render/temporalLockSumsTsl.mjs's makeLumaSums against render/temporalLockSums.mjs's
// pushLumaSums, lumaSumsShiftCPU and lumaSumsMean, on the device's own frames and motion field, on both of three's
// backends; and fx/fsr/fsrTemporalTsl.mjs's `lock: "sums"`, pushed and read where the driver pushes and reads the ring.
// The mirror itself -- that the sums ARE the ring's two windows at every boundary, and what they give up between -- is
// render/temporalLockSums-selfcheck.mjs; the two were one gate until they measured 18-19 s of the sweep's 20 s cap.
"use strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runInEngineOrigin, webgpuSkipReason } from "../tools/ship/webgpuHarness.mjs";
import { makeLumaSums, pushLumaSums, lumaSumsMean, lumaSumsShiftCPU } from "./temporalLockSums.mjs";
import * as TL from "./temporalLockSumsTsl.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let fails = 0;
const ok = (label, cond, detail) => { if (!cond) fails++; console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "   " + detail : ""}`); };
const DEVICE_BYTES = { ring: (w, h, P) => 2 * w * h * Math.ceil(2 * P / 4) * 16 + 2 * w * h * 16 };   // fx/fsr/fsrTemporalTsl.mjs's memory

console.log("temporalLockSumsTsl-selfcheck -- the sums as TSL, against their mirror\n");
console.log("1. WITHOUT A DEVICE: the refusals");
{
    const refuse = (f) => { try { f(); return "no throw"; } catch (e) { return String(e.message); } };
    const c = refuse(() => TL.makeLumaSums({}, {}, { w: 1, h: 1, period: 8 }));
    const full = new Proxy({}, { get: () => () => {} });
    const d = refuse(() => TL.makeLumaSums({}, full, { w: 1, h: 1, period: 2.5 }));
    ok("makeLumaSums refuses a TSL namespace missing a name, by that name", /has no Fn\b/.test(c), c);
    ok("  and a period that is not a positive integer, as the mirror does -- a window that is not a whole jitter period has jitter left in it", /positive integer/.test(d), d);
}

console.log("\n2. ON THE DEVICE: render/temporalLockSumsTsl.mjs's makeLumaSums against pushLumaSums, on both backends");
const skip = webgpuSkipReason();
if (skip) { console.log(`  SKIP  ${skip}`); console.log("  ----  *** NOT A PASS. *** Section 1 is static."); fails++; }
else {
    const N6 = 28, D6 = 32, P6 = 8, STILL6 = 240;
    const r = await runInEngineOrigin({ engineRoot: ENG, timeoutMs: 300000, args: { N6, D6, P6, STILL6 }, script: `async (a) => {
        const THREE = await import("/vendor/three-webgpu/three.webgpu.js"); const T = await import("/vendor/three-webgpu/three.tsl.js");
        const TT = await import("/render/temporalTsl.mjs"); const TL = await import("/render/temporalLockSumsTsl.mjs");
        const out = {};
        for (const mode of ["webgpu", "webgl2"]) {
            try {
                const canvas = document.createElement("canvas"); canvas.width = a.D6; canvas.height = a.D6;
                const renderer = new THREE.WebGPURenderer({ canvas, forceWebGL: mode === "webgl2", antialias: false }); await renderer.init();
                const gl = TT.glClip(THREE, renderer), o = { frames: [], boundary: [] };
                const tgt = () => new THREE.RenderTarget(a.D6, a.D6, { type: THREE.FloatType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
                const read = async (t) => Array.from(await renderer.readRenderTargetPixelsAsync(t, 0, 0, a.D6, a.D6));
                // render/temporalLockTsl-selfcheck.mjs's wall and pulsing lamp: the light changes where nothing moves
                const scene = new THREE.Scene(); scene.background = new THREE.Color(0.05, 0.05, 0.08);
                const pulse = T.uniform(0.5), wm = new THREE.MeshBasicNodeMaterial();
                wm.colorNode = T.Fn(() => { const uv = T.uv(); const st = T.sin(uv.x.mul(40.0)).mul(0.2).add(0.4);
                    const lamp = T.select(uv.x.greaterThan(0.55).and(uv.x.lessThan(0.8)).and(uv.y.greaterThan(0.35)).and(uv.y.lessThan(0.65)), pulse, T.float(0.0));
                    return T.vec3(st.add(lamp), st.mul(0.9).add(lamp), st.mul(0.7)); })();
                scene.add(new THREE.Mesh(new THREE.PlaneGeometry(5, 5), wm));
                const cam = new THREE.PerspectiveCamera(45, 1, 0.5, 20);
                const current = tgt(), mask = tgt(), meanT = tgt(), mSyn = tgt();
                const stage = TT.makeMotionStage(THREE, T, { w: a.D6, h: a.D6, gl });
                // the field's top four rows marked INVALID, as the ring's gate does: every real pixel here is valid
                const synM = new THREE.NodeMaterial(); synM.blending = THREE.NoBlending;
                synM.fragmentNode = T.Fn(() => { const m = T.textureLoad(stage.motion.texture, T.ivec2(T.int(T.screenCoordinate.x), T.int(T.screenCoordinate.y)));
                    return T.select(T.screenCoordinate.y.lessThan(4.0), T.vec4(m.x, m.y, 0.0, m.w), m); })();
                const synSc = new THREE.Scene(); synSc.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), synM));
                const ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
                const sums = TL.makeLumaSums(THREE, T, { w: a.D6, h: a.D6, period: a.P6, currentTex: current.texture, motionTex: mSyn.texture });
                o.bytesPerPixel = sums.bytesPerPixel;
                const frame = async (k, pan, keep) => {
                    pulse.value = 0.35 + 0.3 * Math.sin(0.45 * k);
                    cam.position.set(pan, 0, 4); cam.lookAt(pan, 0, 0); cam.updateMatrixWorld();
                    renderer.setRenderTarget(current); await renderer.renderAsync(scene, cam);
                    await stage.render(renderer, scene, cam);
                    renderer.setRenderTarget(mSyn); await renderer.renderAsync(synSc, ortho);
                    await sums.push(renderer);
                    if (keep) { o.frames.push({ current: await read(current), motion: await read(mSyn), phase: sums.phase });
                        // the state, mask and mean at every boundary and on the last push, so a pass that tumbled on the wrong
                        // frame or read the wrong phase is seen where it matters and not only at the end
                        if (sums.phase === 0 || k === a.N6 - 1) { await sums.shading(renderer, mask); await sums.mean(renderer, meanT);
                            o.boundary.push({ k, state: await read(sums.state), mask: await read(mask), mean: await read(meanT) }); } }
                };
                for (let k = 0; k < a.N6; k++) await frame(k, 0.04 * k, true);
                sums.uniforms.scale.value = 0.5; await sums.shading(renderer, mask); o.maskHalf = await read(mask); sums.uniforms.scale.value = 1;
                // then STILL: one frame drawn where the camera stopped makes the field zero, and the rest are bare pushes of
                // that frame -- the fill count is all this reads, and redrawing an unchanged scene 239 times was half the section
                await frame(a.N6, 0.04 * (a.N6 - 1), false);
                for (let k = 1; k < a.STILL6; k++) await sums.push(renderer);
                o.stateLate = await read(sums.state);
                stage.dispose(); sums.dispose(); out[mode] = o; renderer.dispose();
            } catch (err) { out[mode] = { err: String(err && err.stack || err).slice(0, 700) }; }
        }
        return out;
    }` });
    ok("the harness ran the sums on BOTH backends", r.ok && r.result && !r.result.webgpu.err && !r.result.webgl2.err,
       r.ok ? `webgpu ${r.result.webgpu.err || "ok"}; webgl2 ${r.result.webgl2.err || "ok"}` : (r.reason || (r.pageErrors || []).join("; ")));
    if (r.ok && r.result) for (const mode of ["webgpu", "webgl2"]) {
        const o = r.result[mode]; if (!o || o.err) continue;
        const up = (px) => { if (mode === "webgpu") return new Float32Array(px); const f = []; for (let y = D6 - 1; y >= 0; y--) f.push(...px.slice(y * D6 * 4, (y + 1) * D6 * 4)); return new Float32Array(f); };
        const st = makeLumaSums(D6, D6, P6);
        let wState = 0, wFill = 0, wMask = 0, wMean = 0, graded = 0, fired = 0, unknown = 0, phaseBad = 0, b = 0, shadeLast = null;
        o.frames.forEach((f, k) => {
            pushLumaSums(st, { current: up(f.current), motion: up(f.motion), w: D6, h: D6 });
            if (f.phase !== st.phase) phaseBad++;
            const at = o.boundary[b]; if (!at || at.k !== k) return; b++; graded++;
            const s = up(at.state), m = up(at.mask), mn = up(at.mean), shade = lumaSumsShiftCPU(st, { scale: 1, strength: 1 }), mean = lumaSumsMean(st);
            for (let i = 0; i < D6 * D6; i++) {
                wState = Math.max(wState, Math.abs(s[i * 4] - st.cur[i]) / P6, Math.abs(s[i * 4 + 1] - st.prev[i]) / P6, Math.abs(s[i * 4 + 2] - st.prev2[i]) / P6);
                wFill = Math.max(wFill, Math.abs(s[i * 4 + 3] - st.filled[i])); wMask = Math.max(wMask, Math.abs(m[i * 4] - shade.data[i])); wMean = Math.max(wMean, Math.abs(mn[i * 4] - mean[i]));
            }
            shadeLast = shade;
        });
        for (const v of shadeLast.data) if (v >= 0.05) fired++; unknown = shadeLast.unknown;
        ok(`*** [${mode}] the device's SUMS are pushLumaSums' at ${graded} points (every boundary and the last push) over ${o.frames.length} reprojected pushes -- worst ${wState.toExponential(2)} of a mean; the fill count exactly (worst ${wFill}); the phase the driver reports is the mirror's on every push ***`,
            wState < 1e-5 && wFill === 0 && phaseBad === 0 && graded >= 4, `${o.frames.length / P6 | 0} periods closed; the ring's device row holds its slots to the same 1e-5`);
        ok(`*** [${mode}] the SHADING mask is lumaSumsShiftCPU's, worst ${wMask.toExponential(2)}, and the MEAN lumaSumsMean's, worst ${wMean.toExponential(2)} -- ${fired} pixels at 0.05 or above on the last push, ${unknown} unknown ***`,
            wMask < 1e-5 && wMean < 1e-5 && fired > 10 && unknown > 0 && unknown < D6 * D6, "the lamp pulses where nothing moves; the invalid band and the pan's entering edge are unknown");
        const half = up(o.maskHalf), sh = lumaSumsShiftCPU(st, { scale: 0.5, strength: 1 }); let wHalf = 0, more = 0;
        for (let i = 0; i < D6 * D6; i++) { wHalf = Math.max(wHalf, Math.abs(half[i * 4] - sh.data[i])); if (sh.data[i] >= 0.05) more++; }
        ok(`  [${mode}] ...and at scale 0.5 it is lumaSumsShiftCPU's at 0.5, worst ${wHalf.toExponential(2)}, ${more} pixels firing against ${fired}`,
            wHalf < 1e-5 && more > fired, "a pass that ignored the scale would pass every row above at 1");
        const late = up(o.stateLate); let wLate = 0, capped = 0, band = 0;
        for (let i = 0; i < D6 * D6; i++) { const invalid = Math.floor(i / D6) < 4, want = invalid ? 0 : Math.min(255, st.filled[i] + STILL6);
            wLate = Math.max(wLate, Math.abs(late[i * 4 + 3] - want)); if (want === 255) capped++; if (invalid) band++; }
        ok(`  [${mode}] ...and ${STILL6} still pushes later the fill count is min(255, its count + ${STILL6}) where the field is valid and 0 in the ${band}-pixel invalid band -- ${capped} at the cap`,
            wLate === 0 && capped > 0, `worst ${wLate}`);
        ok(`  [${mode}] ...and the whole state is ${o.bytesPerPixel} bytes a pixel across the ping-pong pair, at any period`, o.bytesPerPixel === 32, "one RGBA float texel, twice");
    }
}

console.log("\n3. ON THE DEVICE: fx/fsr/fsrTemporalTsl.mjs with lock \"sums\" -- the history pushed and read where the ring is");
if (skip) { console.log(`  SKIP  ${skip}`); console.log("  ----  *** NOT A PASS. ***"); fails++; }
else {
    const RW = 32, DW = 48, N7 = 40;   // 1.5x: 18 phases, two closed periods by frame 35
    const r = await runInEngineOrigin({ engineRoot: ENG, timeoutMs: 300000, args: { RW, DW, N7 }, script: `async (a) => {
        const THREE = await import("/vendor/three-webgpu/three.webgpu.js"); const T = await import("/vendor/three-webgpu/three.tsl.js");
        const FT = await import("/fx/fsr/fsrTemporalTsl.mjs"); const TC = await import("/render/temporalClipTsl.mjs");
        const canvas = document.createElement("canvas"); canvas.width = a.DW; canvas.height = a.DW;
        const renderer = new THREE.WebGPURenderer({ canvas, antialias: false }); await renderer.init();
        const read = async (t) => Array.from(await renderer.readRenderTargetPixelsAsync(t, 0, 0, a.DW, a.DW));
        const scene = new THREE.Scene(); scene.background = new THREE.Color(0.05, 0.05, 0.08);
        const pulse = T.uniform(0.2), wm = new THREE.MeshBasicNodeMaterial();
        wm.colorNode = T.Fn(() => { const uv = T.uv(); const st = T.sin(uv.x.mul(30.0)).mul(0.15).add(0.35);
            const lamp = T.select(uv.x.greaterThan(0.3).and(uv.x.lessThan(0.55)).and(uv.y.greaterThan(0.3)).and(uv.y.lessThan(0.6)), pulse, T.float(0.0));
            return T.vec3(st.add(lamp), st.add(lamp.mul(0.6)), st.mul(0.8)); })();
        const wall = new THREE.Mesh(new THREE.PlaneGeometry(6, 6), wm); wall.position.z = -1.5; scene.add(wall);
        const cam = new THREE.PerspectiveCamera(45, 1, 0.5, 20); cam.position.set(0, 0, 3.5); cam.lookAt(0, 0, 0); cam.updateMatrixWorld();
        const vp = Array.from(new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse).elements);
        const threshold = TC.clipGapThreshold(vp, [0, 0, 0.3], [0, 0, -1.5]);
        const fsr = FT.makeFsrTemporal(THREE, T, renderer, { renderWidth: a.RW, renderHeight: a.RW, displayWidth: a.DW, displayHeight: a.DW,
            threshold, lock: "sums", lockFrom: "ring", type: THREE.FloatType });
        const o = { frames: [], period: fsr.period, memory: fsr.memory, history: fsr.history };
        const outRT = new THREE.RenderTarget(a.DW, a.DW, { type: THREE.FloatType, depthBuffer: false });
        let refused = null; try { FT.makeFsrTemporal(THREE, T, renderer, { renderWidth: 2, renderHeight: 2, displayWidth: 4, displayHeight: 4, threshold, lock: "Sums" }); } catch (e) { refused = String(e.message); }
        o.refused = refused;
        for (let k = 0; k < a.N7; k++) {
            pulse.value = 0.2 + 0.2 * Math.sin(0.5 * k);
            cam.position.set(0.01 * k, 0, 3.5); cam.lookAt(0.01 * k, 0, 0); cam.updateMatrixWorld();
            await fsr.render(scene, cam, outRT);
            const f = { resolved: await read(fsr.targets.resolved), motion: await read(fsr.targets.dMotion) };
            if (k === a.N7 - 1 || fsr.ring.phase === 0) { f.shade = await read(fsr.targets.shading); f.mean = await read(fsr.targets.lumaMean); }
            o.frames.push(f);
        }
        fsr.dispose(); renderer.dispose();
        return o;
    }` });
    ok("the harness ran the driver with the sums", r.ok && r.result && !r.result.err, r.ok ? "ok" : (r.reason || (r.pageErrors || []).join("; ")));
    if (r.ok && r.result) {
        const o = r.result, st = makeLumaSums(DW, DW, o.period);
        let wSh = 0, wMn = 0, graded = 0, fired = 0, lastUnknown = 0;
        for (const f of o.frames) {
            pushLumaSums(st, { current: new Float32Array(f.resolved), motion: new Float32Array(f.motion), w: DW, h: DW });
            if (!f.shade) continue; graded++;
            const sh = lumaSumsShiftCPU(st), mn = lumaSumsMean(st), gs = f.shade, gm = f.mean;
            for (let i = 0; i < DW * DW; i++) { wSh = Math.max(wSh, Math.abs(gs[i * 4] - sh.data[i])); wMn = Math.max(wMn, Math.abs(gm[i * 4] - mn[i])); }
            fired = 0; for (const v of sh.data) if (v >= 0.05) fired++; lastUnknown = sh.unknown;
        }
        ok(`*** the driver PUSHES the sums with this frame's resolve and dilated field and reads the mask and the lock mean after -- the device's shading and lumaMean targets are the mirror's fed the device's own inputs, at ${graded} frames: worst ${wSh.toExponential(2)} / ${wMn.toExponential(2)} ***`,
            graded >= 3 && wSh < 1e-5 && wMn < 1e-5 && fired > 0, `${fired} pixels firing on the last graded frame, ${lastUnknown} unknown; the composition around it is fx/fsr/fsrTemporalTsl-selfcheck.mjs's, on the ring`);
        const px = DW * DW;
        ok(`  and it reports what it built: history "${o.history}", ${o.memory.ring} bytes -- one texel a pixel, twice (${2 * px * 16}) -- where the ring at this period would be ${DEVICE_BYTES.ring(DW, DW, o.period)}`,
            o.history === "sums" && o.memory.ring === 2 * px * 16, `period ${o.period}`);
        ok("  and it refuses a lock it does not know, by naming the four it does", o.refused !== null && /lock must be false, true \(the ring\), "ring" or "sums"/.test(o.refused), o.refused || "no throw");
    }
}

// SABOTAGE LOG -- see render/temporalLockSums-selfcheck.mjs's, which runs both gates for each.

console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nALL GREEN");
console.log("unchecked here: the sums in fx/fsr/fsrTemporalTsl-selfcheck.mjs's whole-chain composition, which runs the ring -- section 3 grades " +
    "where the driver pushes the sums and reads their mask and mean, and the passes around that are the ring's, graded there; and HalfFloat state, " +
    "which this port does not offer: half keeps 11 significant bits, so a sum near 72 lumas (3x) would be held only to 1/32 -- the state is FloatType at every ratio.");
process.exitCode = fails ? 1 : 0;
