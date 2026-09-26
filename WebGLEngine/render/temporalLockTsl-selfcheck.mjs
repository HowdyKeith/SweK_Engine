#!/usr/bin/env node
// WebGLEngine/render/temporalLockTsl-selfcheck.mjs -- v4730
//
// THE LOCK RING FOR A THREE.JS SCENE, HELD TO ITS MIRROR: render/temporalLockTsl.mjs's makeLumaRing against
// render/temporalLock.mjs's pushLuma and shadingShiftCPU, on the device's own frames and motion field, on both of
// three's backends -- every slot of every pixel, the fill count exactly, the mask, and the cap.
"use strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runInEngineOrigin, webgpuSkipReason } from "../tools/ship/webgpuHarness.mjs";
import { makeLumaState, pushLuma, shadingShiftCPU } from "./temporalLock.mjs";
import * as TL from "./temporalLockTsl.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let fails = 0;
const ok = (label, cond, detail) => { if (!cond) fails++; console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "   " + detail : ""}`); };

console.log("\n1. WITHOUT A DEVICE: the refusals");
{
    const refuse = (f) => { try { f(); return "no throw"; } catch (e) { return String(e.message); } };
    const a = refuse(() => TL.makeLumaRing({}, {}, { w: 1, h: 1, period: 8 }));
    ok("makeLumaRing refuses a TSL namespace missing a name, by that name", /has no Fn\b/.test(a), a);
    const full = new Proxy({}, { get: () => () => {} });
    const b = refuse(() => TL.makeLumaRing({}, full, { w: 1, h: 1, period: 2.5 }));
    ok("  and a period that is not a positive integer, as makeLumaState does -- a ring that is not a whole number of jitter periods has jitter left in it", /positive integer/.test(b), b);
}
console.log("\n2. ON THE DEVICE -- THE LOCK RING: pushLuma's reprojected ring and shadingShiftCPU's mask, on a panning camera and a pulsing lamp");
const skip = webgpuSkipReason();
if (skip) { console.log(`  SKIP  ${skip}`); console.log("  ----  *** NOT A PASS. *** Section 1 is static."); fails++; }
else {
    const N5 = 24, D5 = 32, P5 = 8, STILL5 = 240;   // period 8 (render/jitter.mjs's count at 1x): the ring fills in 16 pushes
    const r = await runInEngineOrigin({ engineRoot: ENG, timeoutMs: 300000, args: { N5, D5, P5, STILL5 }, script: `async (a) => {
        const THREE = await import("/vendor/three-webgpu/three.webgpu.js"); const T = await import("/vendor/three-webgpu/three.tsl.js");
        const TT = await import("/render/temporalTsl.mjs"); const TL = await import("/render/temporalLockTsl.mjs");
        const out = {};
        for (const mode of ["webgpu", "webgl2"]) {
            try {
                const canvas = document.createElement("canvas"); canvas.width = a.D5; canvas.height = a.D5;
                const renderer = new THREE.WebGPURenderer({ canvas, forceWebGL: mode === "webgl2", antialias: false }); await renderer.init();
                const gl = TT.glClip(THREE, renderer), o = { frames: [] };
                const tgt = (w, h) => new THREE.RenderTarget(w, h, { type: THREE.FloatType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
                const read = async (t, w, h) => Array.from(await renderer.readRenderTargetPixelsAsync(t, 0, 0, w, h));
                // a striped wall, and a LAMP on it whose brightness pulses -- the light changes where nothing moves
                const scene = new THREE.Scene(); scene.background = new THREE.Color(0.05, 0.05, 0.08);
                const pulse = T.uniform(0.5);
                const wm = new THREE.MeshBasicNodeMaterial();
                wm.colorNode = T.Fn(() => { const uv = T.uv(); const st = T.sin(uv.x.mul(40.0)).mul(0.2).add(0.4);
                    const lamp = T.select(uv.x.greaterThan(0.55).and(uv.x.lessThan(0.8)).and(uv.y.greaterThan(0.35)).and(uv.y.lessThan(0.65)), pulse, T.float(0.0));
                    return T.vec3(st.add(lamp), st.mul(0.9).add(lamp), st.mul(0.7)); })();
                const wall = new THREE.Mesh(new THREE.PlaneGeometry(5, 5), wm); scene.add(wall);
                const cam = new THREE.PerspectiveCamera(45, 1, 0.5, 20);
                const current = tgt(a.D5, a.D5), mask = tgt(a.D5, a.D5), mSyn = tgt(a.D5, a.D5);
                const stage = TT.makeMotionStage(THREE, T, { w: a.D5, h: a.D5, gl });
                // the ring reads the field with its top four rows INVALID -- every real pixel here is valid (the far plane
                // is completed), so without this a ring that reprojected through invalid motion would pass (L13, 0 RED)
                const synM = new THREE.NodeMaterial(); synM.blending = THREE.NoBlending;
                synM.fragmentNode = T.Fn(() => { const m = T.textureLoad(stage.motion.texture, T.ivec2(T.int(T.screenCoordinate.x), T.int(T.screenCoordinate.y)));
                    return T.select(T.screenCoordinate.y.lessThan(4.0), T.vec4(m.x, m.y, 0.0, m.w), m); })();
                const synSc = new THREE.Scene(); synSc.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), synM));
                const ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
                const ring = TL.makeLumaRing(THREE, T, { w: a.D5, h: a.D5, period: a.P5, currentTex: current.texture, motionTex: mSyn.texture });
                o.F = ring.F; o.S = ring.S;
                const frame = async (k, pan, keep) => {
                    pulse.value = 0.35 + 0.3 * Math.sin(0.45 * k);
                    cam.position.set(pan, 0, 4); cam.lookAt(pan, 0, 0); cam.updateMatrixWorld();
                    renderer.setRenderTarget(current); await renderer.renderAsync(scene, cam);
                    await stage.render(renderer, scene, cam);
                    renderer.setRenderTarget(mSyn); await renderer.renderAsync(synSc, ortho);
                    await ring.push(renderer);
                    if (keep) o.frames.push({ current: await read(current, a.D5, a.D5), motion: await read(mSyn, a.D5, a.D5) });
                };
                for (let k = 0; k < a.N5; k++) await frame(k, 0.06 * k, true);   // ~0.6 px a push: the entering edge reprojects off the frame
                o.ring = await read(ring.ring, a.D5, a.D5 * ring.S); o.filled = await read(ring.filled, a.D5, a.D5);
                await ring.shading(renderer, mask); o.mask = await read(mask, a.D5, a.D5);
                ring.uniforms.scale.value = 0.5; await ring.shading(renderer, mask); o.maskHalf = await read(mask, a.D5, a.D5); ring.uniforms.scale.value = 1;
                // then STILL: the fill count climbs by one a push and stops at 255
                for (let k = 0; k < a.STILL5; k++) await frame(a.N5 + k, 0.06 * (a.N5 - 1), false);
                o.filledLate = await read(ring.filled, a.D5, a.D5);
                stage.dispose(); ring.dispose(); out[mode] = o; renderer.dispose();
            } catch (err) { out[mode] = { err: String(err && err.stack || err).slice(0, 700) }; }
        }
        return out;
    }` });
    ok("[v4730] the harness ran the ring on BOTH backends", r.ok && r.result && !r.result.webgpu.err && !r.result.webgl2.err,
       r.ok ? `webgpu ${r.result.webgpu.err || "ok"}; webgl2 ${r.result.webgl2.err || "ok"}` : (r.reason || (r.pageErrors || []).join("; ")));
    if (r.ok && r.result) for (const mode of ["webgpu", "webgl2"]) {
        const o = r.result[mode]; if (!o || o.err) continue;
        const upN = (px, w, h) => { if (mode === "webgpu") return new Float32Array(px); const f = []; for (let y = h - 1; y >= 0; y--) f.push(...px.slice(y * w * 4, (y + 1) * w * 4)); return new Float32Array(f); };
        const st = makeLumaState(D5, D5, P5);
        for (const f of o.frames) pushLuma(st, { current: upN(f.current, D5, D5), motion: upN(f.motion, D5, D5), w: D5, h: D5 });
        const shade = shadingShiftCPU(st, { scale: 1, strength: 1 });
        const ring = upN(o.ring, D5, D5 * o.S), filled = upN(o.filled, D5, D5), mask = upN(o.mask, D5, D5);
        let wRing = 0, wFill = 0, wMask = 0, fired = 0, full = 0;
        for (let y = 0; y < D5; y++) for (let x = 0; x < D5; x++) { const i = y * D5 + x;
            for (let k = 0; k < st.frames; k++) { const g = ring[((Math.floor(k / 4) * D5 + y) * D5 + x) * 4 + (k % 4)]; wRing = Math.max(wRing, Math.abs(g - st.ring[i * st.frames + k])); }
            wFill = Math.max(wFill, Math.abs(filled[i * 4] - st.filled[i])); wMask = Math.max(wMask, Math.abs(mask[i * 4] - shade.data[i]));
            if (shade.data[i] >= 0.05) fired++; if (st.filled[i] >= st.frames) full++; }
        ok(`*** [${mode}] the RING is pushLuma's after ${o.frames.length} reprojected pushes -- all ${st.frames} slots of all ${D5 * D5} pixels, worst ${wRing.toExponential(2)}; the fill counts exactly (worst ${wFill}) ***`,
           wRing < 1e-5 && wFill === 0 && full > 0 && full < D5 * D5, `${full} of ${D5 * D5} pixels have a full ring; the pan broke the rest, which is the ring's speed ceiling doing its job`);
        ok(`*** [${mode}] the SHADING-SHIFT mask is shadingShiftCPU's, worst ${wMask.toExponential(2)} -- ${fired} pixels at 0.05 or above, ${shade.unknown} still unknown ***`,
           wMask < 1e-5 && fired > 10 && shade.unknown > 0, "the lamp pulses where nothing moves: the light changed, and the mask says so where the ring is full and 0 where it is not");
        const half = upN(o.maskHalf, D5, D5), shadeHalf = shadingShiftCPU(st, { scale: 0.5, strength: 1 }); let wHalf = 0, moreFired = 0;
        for (let i = 0; i < D5 * D5; i++) { wHalf = Math.max(wHalf, Math.abs(half[i * 4] - shadeHalf.data[i])); if (shadeHalf.data[i] >= 0.05) moreFired++; }
        ok(`  [${mode}] ...and at scale 0.5 -- a luma range half as wide -- it is shadingShiftCPU's at 0.5, worst ${wHalf.toExponential(2)}, ${moreFired} pixels firing against ${fired}`,
           wHalf < 1e-5 && moreFired > fired, "scale is the caller's colour range, render/temporalLock.mjs's rule; at 1 it divides by one and a pass that ignored it would pass every row above");
        const late = upN(o.filledLate, D5, D5); let wLate = 0, capped = 0;
        let band = 0;
        for (let i = 0; i < D5 * D5; i++) { const invalid = Math.floor(i / D5) < 4;   // the synthetic band never becomes usable
            const want = invalid ? 0 : Math.min(255, st.filled[i] + STILL5); wLate = Math.max(wLate, Math.abs(late[i * 4] - want)); if (want === 255) capped++; if (invalid) band++; }
        ok(`  [${mode}] ...and ${STILL5} still pushes later the fill count is min(255, its count + ${STILL5}) wherever the field is valid and 0 in the ${band}-pixel invalid band -- ${capped} pixels at the cap`,
           wLate === 0 && capped > 0 && capped < D5 * D5 - band, `worst ${wLate}`);
    }
}


// ---- SABOTAGE LOG ----------------------------------------------------------------------------------------------
// ---- v4730 SABOTAGE LOG ----------------------------------------------------------------------------------------
//   L1  luma as Rec.601, not the ring's (0.25, 0.5, 0.25) -> 6   L8  the fill count uncapped                 -> 2
//   L2  the push does not shift                         -> 6     L9  the halves split one slot early         -> 4
//   L3  the slice's last slot from its own slice        -> 6     L10 an unfilled ring reports anyway         -> 4
//   L4  the newest slot not this frame's luma           -> 6     L11 scale ignored                           -> 2
//   L5  the first push reprojects nothing               -> 2     L12 the ring's bilinear weights swapped     -> 6
//   L6  a broken history restarts at 0, not this luma   -> 2     L13 invalid motion reprojected anyway       -> 8
//   L7  the fill count's texel rounded, not floored     -> 2
// *** THREE ROWS HAD NO POPULATION ON THE FIRST DRAFT, AND ONE SABOTAGE PROVED IT. *** At a 0.03 pan no pixel ever
// reprojected off the frame, so every ring filled and every count reached the cap -- the population rows failed
// rather than passing on nothing. Scale 1 divides by one, so a pass ignoring scale passed; the 0.5 readout is for
// L11. And L13 scored 0 RED: every real pixel's motion is valid, so the ring reads a field whose top four rows are
// marked invalid -- after which the cap row's own expectation had to learn that those rows never fill.
// Taken in render/temporalTsl-selfcheck.mjs and RE-TAKEN HERE after the split: identical, all thirteen. The split's own
// row: S2, makeLumaRing taking any period -> 1 red.
console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nALL GREEN");
console.log("unchecked here: the ring at a real 2x period (32, 64 slots, sixteen slices) -- this gate runs period 8 so it fills in 16 pushes; " +
    "and advanceLocks / lockRelaxation, which have no caller in this tree and are not ported.");
process.exitCode = fails ? 1 : 0;
