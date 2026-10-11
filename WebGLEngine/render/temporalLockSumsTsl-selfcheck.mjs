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
const report = (s) => console.log(`  ----  ${s}`);

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

console.log("\n4. ON THE DEVICE: the driver's DEFAULT is the sums, and once they are warm it is the chain without them where nothing changes");
// *** EVERY OTHER GATE THAT BUILDS THE DRIVER RUNS INSIDE THE WARM-UP. *** At 2x the period is 32 and the sums know nothing
// before frame 63; the quality gates run 24-40 frames, so flipping the default moved none of them by a digit -- an
// absence, not a measurement. This section runs past it, on fsr-three.html's scene, 24 -> 48 at 2x: still, and with
// the knot turning (the mask must fire, or the run is as blind as the others). What the mask is WORTH there is reported,
// not asserted: measured over 128 frames at 128x128 when the default was made, -0.010 to +0.014 dB across six cases.
//
// *** THE STILL ROW WAS WRITTEN "TO THE BIT" AND THE DEVICE SAID NO, TWICE. *** First: the mask read 0.019 on a scene
// where nothing moves -- the older closed window held frames 0-31, and the driver's frame 0 on WebGPU was drawn
// UNJITTERED (0.93 from frame P's, the same phase; every later frame within 1e-6 of its period's twin): three switched
// the camera's clip convention and rebuilt its projection inside the colour pass, after the driver had jittered it.
// This fixture drew the scene twice first, which converted the camera early; then the driver compiled the scene first,
// which did the same as a side effect and was taken for a pipeline fix. The driver converts the camera itself now
// (fx/fsr/fsrTemporalTsl.mjs) -- the fixture's warm-up is gone and the row below holds the driver to it. Second:
// 3.3e-4 is not 0 -- the device fetches its
// sums bilinearly in f32 every frame even at zero motion, and the two windows' rounding differs. The mirror's still
// picture IS exact (render/temporalLockSums-selfcheck.mjs section 3, in f64). What is asserted here is what the
// picture can show: the mask never fires, and no output value moves by an 8-bit step.
if (skip) { console.log(`  SKIP  ${skip}`); console.log("  ----  *** NOT A PASS. ***"); fails++; }
else {
    const N8 = 68, D8 = 48;   // 2x: two closed periods by frame 63, then five frames with the mask live; 48 px kept the gate under its cap
    const r = await runInEngineOrigin({ engineRoot: ENG, timeoutMs: 300000, args: { N8, DW: D8, RW: D8 / 2 }, script: `async (a) => {
        const THREE = await import("/vendor/three-webgpu/three.webgpu.js"); const T = await import("/vendor/three-webgpu/three.tsl.js");
        const FT = await import("/fx/fsr/fsrTemporalTsl.mjs"); const TC = await import("/render/temporalClipTsl.mjs");
        const canvas = document.createElement("canvas"); canvas.width = a.DW; canvas.height = a.DW;
        const renderer = new THREE.WebGPURenderer({ canvas, antialias: false }); await renderer.init();
        const scene = new THREE.Scene(); scene.background = new THREE.Color(0.02, 0.03, 0.06);
        const knot = new THREE.Mesh(new THREE.TorusKnotGeometry(0.9, 0.28, 220, 24), new THREE.MeshNormalNodeMaterial()); scene.add(knot);
        const st = new THREE.MeshBasicNodeMaterial();
        st.colorNode = T.Fn(() => { const s = T.floor(T.uv().x.mul(48.0).add(T.uv().y.mul(9.0))).mod(2.0); return T.mix(T.vec3(0.05, 0.08, 0.14), T.vec3(0.95, 0.72, 0.3), s); })();
        const floor = new THREE.Mesh(new THREE.PlaneGeometry(9, 5), st); floor.rotation.x = -Math.PI / 2; floor.position.y = -1.3; scene.add(floor);
        const cam = new THREE.PerspectiveCamera(40, 1, 0.1, 50); cam.position.set(0, 0.6, 5.2); cam.lookAt(0, 0, 0); cam.updateMatrixWorld();
        const vp = Array.from(new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse).elements);
        const threshold = TC.clipGapThreshold(vp, [0, 0, 1.2], [0, -1.3, -1.0]);
        const tgt = (n) => new THREE.RenderTarget(n, n, { type: THREE.FloatType }), read = async (t, n) => Array.from(await renderer.readRenderTargetPixelsAsync(t, 0, 0, n, n));
        const out = {}, o2 = tgt(a.DW), big = tgt(a.DW * 4);
        for (const c of ["still", "turn"]) {
            out[c] = {};
            for (const which of ["default", "off"]) {
                const opts = { renderWidth: a.RW, renderHeight: a.RW, displayWidth: a.DW, displayHeight: a.DW, threshold, type: THREE.FloatType };
                if (which === "off") opts.lock = false;
                const f = FT.makeFsrTemporal(THREE, T, renderer, opts), o = { history: f.history, memory: f.memory.ring, period: f.period };
                for (let k = 0; k < a.N8; k++) { knot.rotation.set(0.4, 0.6 + (c === "turn" ? 0.01 * k : 0), 0); knot.updateMatrixWorld(); await f.render(scene, cam, o2);
                    if (c === "still" && which === "default" && (k === 0 || k === f.period)) o["resolved" + k] = await read(f.targets.resolved, a.DW); }
                o.out = await read(o2, a.DW);
                o.fired = null; o.maskMax = null;   // no mask target at all: read as null, and the rows below say so in red
                if (f.targets.shading) { const s = await read(f.targets.shading, a.DW); o.fired = 0; o.maskMax = 0; for (let i = 0; i < a.DW * a.DW; i++) { if (s[i * 4] >= 0.05) o.fired++; o.maskMax = Math.max(o.maskMax, s[i * 4]); } }
                f.dispose(); out[c][which] = o;
            }
            renderer.setRenderTarget(big); await renderer.renderAsync(scene, cam); renderer.setRenderTarget(null); out[c].truth4 = await read(big, a.DW * 4);
        }
        renderer.dispose(); return out;
    }` });
    ok("the harness ran the driver's default and the chain without a lock", r.ok && r.result, r.ok ? "ok" : (r.reason || (r.pageErrors || []).join("; ")));
    if (r.ok && r.result) {
        const { still, turn } = r.result, D = D8;
        ok(`*** the driver's DEFAULT lock is the sums: history "${still.default.history}", ${still.default.memory} bytes at ${D}x${D} -- one texel a pixel, twice -- at the 2x period ${still.default.period} ***`,
            still.default.history === "sums" && still.default.memory === 2 * D * D * 16 && still.off.history === null && still.off.memory === 0, `lock: false builds none: history ${still.off.history}`);
        let w0 = still.default.resolved0 ? 0 : Infinity;
        if (still.default.resolved0) for (let i = 0; i < still.default.resolved0.length; i++) w0 = Math.max(w0, Math.abs(still.default.resolved0[i] - still.default["resolved" + still.default.period][i]));
        ok(`*** the driver's FIRST frame is the scene: frame 0's resolve against frame ${still.default.period}'s, the same jitter phase, worst ${w0.toExponential(1)} -- frame 0 was drawn unjittered, 0.93 off, until the driver put the camera in the renderer's clip convention first ***`,
            w0 <= 1e-6, "with no warm-up of the fixture's own; the lock's older window holds frame 0 for two periods, so this is what the still row below rests on");
        let differ = 0, wOut = 0; for (let i = 0; i < still.default.out.length; i++) { if (!Object.is(still.default.out[i], still.off.out[i])) differ++; wOut = Math.max(wOut, Math.abs(still.default.out[i] - still.off.out[i])); }
        ok(`*** on a STILL scene past the warm-up (${N8} frames, the mask live from 63) the default's mask never fires -- 0.05 or above on ${still.default.fired} pixels, its largest ${still.default.maskMax === null ? "NO MASK" : still.default.maskMax.toExponential(1)} -- and no output value moves by an 8-bit step: worst ${wOut.toExponential(1)}, ${(1 / 255 / Math.max(wOut, 1e-12)).toFixed(0)}x under 1/255 ***`,
            still.default.fired === 0 && wOut < 1 / 255, `${differ} of ${still.default.out.length} values differ in f32: the device's windows round differently (see above); the mirror's are exact`);
        const t4 = turn.truth4, truth = new Float32Array(D * D * 3), cl = (v) => Math.min(1, Math.max(0, v));
        for (let y = 0; y < D; y++) for (let x = 0; x < D; x++) for (let c = 0; c < 3; c++) { let s = 0;
            for (let sy = 0; sy < 4; sy++) for (let sx = 0; sx < 4; sx++) s += t4[((y * 4 + sy) * D * 4 + x * 4 + sx) * 4 + c]; truth[(y * D + x) * 3 + c] = s / 16; }
        const psnr = (b) => { let q = 0; for (let i = 0; i < D * D; i++) for (let c = 0; c < 3; c++) q += (cl(b[i * 4 + c]) - cl(truth[i * 3 + c])) ** 2; return 10 * Math.log10(1 / (q / (D * D * 3))); };
        let moved = 0; for (let i = 0; i < turn.default.out.length; i++) if (!Object.is(turn.default.out[i], turn.off.out[i])) moved++;
        ok(`*** with the knot TURNING the default's mask is live -- ${turn.default.fired} pixels at 0.05 or above on the last frame, ${moved} output values moved -- so this run is past the warm-up the other gates sit in ***`,
            turn.default.fired > 0 && moved > 0, "a run inside the warm-up reads 0 and 0 here, which is what every other gate building the driver reads");
        report(`and what it is worth there: ${psnr(turn.default.out).toFixed(3)} dB against the supersampled last frame, ${psnr(turn.off.out).toFixed(3)} without it -- neutral, as measured over six cases when the default was made`);
    }
}

// SABOTAGE LOG -- see render/temporalLockSums-selfcheck.mjs's, which runs both gates for each. Section 4's, when the
// driver's default became the sums, against fx/fsr/fsrTemporalTsl.mjs and this gate's own fixture, baseline 0 red:
//   F1  the default back to no lock                          3 red (it first CRASHED the gate on a missing mask, which
//                                                            is red but hides the rows behind it; a missing mask is now
//                                                            read as null and named)
//   F2  the default the ring                                 1 red: the history row, 1,253,376 bytes at 48x48
//   F3  the driver never draws the shading mask              2 red, section 3's push-and-read row and the turning row
//   F4  (as first written, against the fixture) its two warm-up renders removed -> 1 red: the still mask reached 1.9e-2
//       and the picture moved 5.8e-3, past an 8-bit step. The fixture's warm-up is gone since; the driver compiles first.
//   F5  the driver's coordinate-system conversion removed -> 2 red: frame 0 is 9.1e-1 from its twin and the still mask
//       reaches 1.9e-2 again. (First run against a compileAsync that did the conversion as a side effect: the same 2.)

console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nALL GREEN");
console.log("unchecked here: the sums in fx/fsr/fsrTemporalTsl-selfcheck.mjs's whole-chain composition, which runs the ring -- section 3 grades " +
    "where the driver pushes the sums and reads their mask and mean, and the passes around that are the ring's, graded there; and HalfFloat state, " +
    "which this port does not offer: half keeps 11 significant bits, so a sum near 72 lumas (3x) would be held only to 1/32 -- the state is FloatType at every ratio.");
process.exitCode = fails ? 1 : 0;
