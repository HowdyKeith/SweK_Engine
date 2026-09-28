#!/usr/bin/env node
// WebGLEngine/render/temporalLockTsl-selfcheck.mjs -- v4730, v4732
//
// THE LOCK FOR A THREE.JS SCENE, HELD TO ITS MIRROR: render/temporalLockTsl.mjs against render/temporalLock.mjs, on the
// device's own frames and motion field, on both of three's backends. Section 2 (v4730) is the ring -- makeLumaRing
// against pushLuma and shadingShiftCPU: every slot of every pixel, the fill count exactly, the mask, and the cap.
// Section 3 (v4732) is LOCK LIFE -- ridgesNode, newLocksNode, the ring's mean and instability, advanceLocksNode,
// lockRelaxationNode, activeMaskNode and makeLockLife against ridgesCPU, newLocksCPU, lockCandidatesFromRing,
// lumaMean, lumaInstability, advanceLocks, lockRelaxation and activeMask -- and accumulateNode's `relax` against
// rectifiedAccumulateCPU's, since a lock reaches the picture through nothing else.
"use strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runInEngineOrigin, webgpuSkipReason } from "../tools/ship/webgpuHarness.mjs";
import { makeLumaState, pushLuma, shadingShiftCPU, lumaMean, lumaInstability, ridgesCPU, newLocksCPU, lockCandidatesFromRing,
         makeLockState, advanceLocks, lockRelaxation, activeMask, nearestTexel } from "./temporalLock.mjs";
import { rectifiedAccumulateCPU } from "./temporalReject.mjs";
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
    const c = refuse(() => TL.ridgesNode(full, null, { w: 4, h: 4, margin: 0.05, maxPlateau: 9 }));
    ok("[v4732] ridgesNode refuses a maxPlateau it cannot unroll, and a per-pixel margin it does not carry", /maxPlateau must be an integer from 1 to 8/.test(c)
       && /non-negative number/.test(refuse(() => TL.ridgesNode(full, null, { w: 4, h: 4, margin: new Float32Array(16) }))), c);
    const d = refuse(() => TL.advanceLocksNode(full, { state: null, motion: null }, { w: 4, h: 4, life: 0 }));
    ok("  and advanceLocksNode a life that is not a positive number of frames", /life must be a positive number/.test(d), d);
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

console.log("\n3. [v4732] ON THE DEVICE -- LOCK LIFE: the ridge test, the candidates, advanceLocks, the relaxation and the relaxed accumulate");
if (skip) { console.log(`  SKIP  ${skip}`); console.log("  ----  *** NOT A PASS. ***"); fails++; }
else {
    const N6 = 24, D6 = 32, P6 = 8, LA = 6, LB = 4, KILL = 0.04, MARGIN = 0.05;
    const r = await runInEngineOrigin({ engineRoot: ENG, timeoutMs: 300000, args: { N6, D6, P6, LA, LB, KILL, MARGIN }, script: `async (a) => {
        const THREE = await import("/vendor/three-webgpu/three.webgpu.js"); const T = await import("/vendor/three-webgpu/three.tsl.js");
        const TT = await import("/render/temporalTsl.mjs"); const TL = await import("/render/temporalLockTsl.mjs"); const J = await import("/render/jitter.mjs");
        const out = {};
        for (const mode of ["webgpu", "webgl2"]) {
            try {
                const canvas = document.createElement("canvas"); canvas.width = a.D6; canvas.height = a.D6;
                const renderer = new THREE.WebGPURenderer({ canvas, forceWebGL: mode === "webgl2", antialias: false }); await renderer.init();
                const gl = TT.glClip(THREE, renderer), o = { frames: [], plateau: {} };
                const tgt = (w, h) => new THREE.RenderTarget(w, h, { type: THREE.FloatType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: false });
                const read = async (t) => Array.from(await renderer.readRenderTargetPixelsAsync(t, 0, 0, a.D6, a.D6));
                const ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
                const quad = (node) => { const m = new THREE.NodeMaterial(); m.fragmentNode = node; m.blending = THREE.NoBlending; const s = new THREE.Scene(); s.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), m)); return s; };
                const draw = async (sc, t) => { renderer.setRenderTarget(t); await renderer.renderAsync(sc, ortho); };
                const px = () => T.ivec2(T.int(T.screenCoordinate.x), T.int(T.screenCoordinate.y));
                // (a) THE RIDGE TEST ALONE, on a field quantised to 1/32 -- exact in float, so a decision cannot flip on
                // rounding, and one step (0.031) sits inside the 0.05 margin while two (0.063) do not: plateaus everywhere,
                // and the walk reaches the frame's edge and wraps
                const field = tgt(a.D6, a.D6);
                await draw(quad(T.Fn(() => { const x = T.floor(T.screenCoordinate.x), y = T.floor(T.screenCoordinate.y);
                    const v = T.mod(x.mul(7.0).add(y.mul(13.0)).add(T.floor(x.mul(y).mul(0.25))), 6.0).div(32.0);
                    return T.vec4(v, 0.0, 0.0, 1.0); })()), field);
                o.field = await read(field);
                const rt = tgt(a.D6, a.D6);
                for (const mp of [1, 2, 3]) { await draw(quad(TL.ridgesNode(T, field.texture, { w: a.D6, h: a.D6, margin: a.MARGIN, maxPlateau: mp }).node), rt); o.plateau[mp] = await read(rt); }
                // (b) THE CHAIN: thin wires in front of a striped wall, a jittered camera panning past, a synthetic
                // disocclusion band that walks across, and the field's top four rows marked invalid
                const scene = new THREE.Scene(); scene.background = new THREE.Color(0.05, 0.05, 0.08);
                const wm = new THREE.MeshBasicNodeMaterial();
                wm.colorNode = T.Fn(() => { const uv = T.uv(); const st = T.sin(uv.x.mul(22.0)).mul(0.12).add(0.3); return T.vec3(st, st.mul(0.9), st.mul(0.7)); })();
                const wall = new THREE.Mesh(new THREE.PlaneGeometry(6, 6), wm); scene.add(wall);
                const lit = new THREE.MeshBasicNodeMaterial(); lit.colorNode = T.vec3(0.95, 0.9, 0.8);
                for (let i = 0; i < 4; i++) { const c = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 5, 6), lit); c.position.set(-1.2 + i * 0.75, 0, 0.5); c.rotation.z = (i - 1.5) * 0.1; scene.add(c); }
                for (let i = 0; i < 2; i++) { const c = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 5, 6), lit); c.position.set(0, -0.6 + i * 1.1, 0.6); c.rotation.z = Math.PI / 2 + (i - 0.5) * 0.08; scene.add(c); }
                const cam = new THREE.PerspectiveCamera(45, 1, 0.5, 20), base = new THREE.Matrix4();
                const current = new THREE.RenderTarget(a.D6, a.D6, { type: THREE.FloatType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter }), mSyn = tgt(a.D6, a.D6), dis = tgt(a.D6, a.D6), meanT = tgt(a.D6, a.D6), instT = tgt(a.D6, a.D6);
                const candR = tgt(a.D6, a.D6), candF = tgt(a.D6, a.D6), relaxT = tgt(a.D6, a.D6), actT = tgt(a.D6, a.D6), hist = [tgt(a.D6, a.D6), tgt(a.D6, a.D6)];
                const stage = TT.makeMotionStage(THREE, T, { w: a.D6, h: a.D6, gl });
                // and rows 4-7 moving EXACTLY half a texel a frame: u*w lands on a texel boundary, the tie floor(u*w) and
                // v4559's condemned round(u*w - 0.5) break differently -- a camera's own field never lands on one (K11b, 0 RED).
                // Written a component at a time: a vec4 select nested in a vec4 select drew NOTHING on WebGL2 (three 0.185.1),
                // every channel 0 but the fourth, where one select alone draws correctly -- measured, not worked out
                const synSc = quad(T.Fn(() => { const m = T.textureLoad(stage.motion.texture, px()), y = T.screenCoordinate.y;
                    const invalid = y.lessThan(4.0), tie = y.greaterThanEqual(4.0).and(y.lessThan(8.0));
                    return T.vec4(T.select(tie, T.float(0.5 / a.D6), m.x), T.select(tie, T.float(0.0), m.y),
                                  T.select(invalid, T.float(0.0), T.select(tie, T.float(1.0), m.z)), m.w); })());
                const band = T.uniform(0.0);
                const disSc = quad(T.Fn(() => { const x = T.floor(T.screenCoordinate.x);
                    return T.vec4(T.select(x.greaterThanEqual(band).and(x.lessThan(band.add(3.0))), T.float(1.0), T.float(0.0)), 0.0, 0.0, 1.0); })());
                const ring = TL.makeLumaRing(THREE, T, { w: a.D6, h: a.D6, period: a.P6, currentTex: current.texture, motionTex: mSyn.texture });
                const candRSc = quad(TL.ridgesNode(T, meanT.texture, { w: a.D6, h: a.D6, margin: a.MARGIN }).node);
                const candFSc = quad(TL.newLocksNode(T, current.texture, { w: a.D6, h: a.D6, margin: a.MARGIN }).node);
                const lifeA = TL.makeLockLife(THREE, T, { w: a.D6, h: a.D6, motionTex: mSyn.texture, candidatesTex: candR.texture, disocclusionTex: dis.texture,
                                                          instabilityTex: instT.texture, life: a.LA, instabilityKill: a.KILL });
                const lifeB = TL.makeLockLife(THREE, T, { w: a.D6, h: a.D6, motionTex: mSyn.texture, candidatesTex: candF.texture, life: a.LB });
                // the state the FIRST advance reads is filled with a life of 5 first: a fresh lock life must read nothing
                // from it, as a fresh makeLockState holds zeros -- and a new target is zeroed on both backends, so without
                // this a first advance that trusted its state would pass (K15, 0 RED)
                const junk = quad(T.vec4(5.0, 0.0, 0.0, 1.0));
                for (const L of [lifeA, lifeB]) await draw(junk, L.targets[1]);
                const acc = [0, 1].map((k) => TT.accumulateNode(T, { current: current.texture, history: hist[1 - k].texture, motion: mSyn.texture, relax: relaxT.texture }, { w: a.D6, h: a.D6, alpha: 0.1 }));
                const accSc = acc.map((x) => quad(x.node));
                // eight scalar fields read back as two -- a readback costs more than the passes it reads, and this section
                // reads every frame; the disocclusion band is not read at all, since the mirror knows where it put it
                const packA = tgt(a.D6, a.D6), packB = tgt(a.D6, a.D6);
                const x4 = (t) => T.textureLoad(t.texture, px()).x;
                const packASc = quad(T.vec4(x4(meanT), x4(instT), x4(candR), x4(candF)));
                const packBSc = [0, 1].map((k) => quad(T.vec4(x4(lifeA.targets[k]), x4(lifeB.targets[k]), x4(relaxT), x4(actT))));
                const jit = J.makeJitterState(1);
                for (let k = 0; k < a.N6; k++) {
                    const pan = 0.055 * k; cam.position.set(pan, 0, 4); cam.lookAt(pan, 0, 0); cam.updateMatrixWorld(); base.copy(cam.projectionMatrix);
                    const [jx, jy] = J.jitterCurrent(jit); TT.applyJitter(cam, base, jx, jy, a.D6, a.D6);
                    renderer.setRenderTarget(current); await renderer.renderAsync(scene, cam); TT.restoreProjection(cam, base);
                    await stage.render(renderer, scene, cam); await draw(synSc, mSyn);
                    band.value = (5 * k) % 29; await draw(disSc, dis);
                    await ring.push(renderer); await ring.mean(renderer, meanT); await ring.instability(renderer, instT);
                    await draw(candRSc, candR); await draw(candFSc, candF);
                    await lifeA.advance(renderer); await lifeB.advance(renderer); await lifeA.relaxation(renderer, relaxT); await lifeA.active(renderer, actT);
                    acc[k % 2].uniforms.hasHistory.value = k > 0 ? 1 : 0; await draw(accSc[k % 2], hist[k % 2]);
                    await draw(packASc, packA); await draw(packBSc[k % 2], packB);
                    o.frames.push({ current: await read(current), motion: await read(mSyn), a: await read(packA), b: await read(packB), hist: await read(hist[k % 2]) });
                    J.advanceJitter(jit);
                }
                stage.dispose(); ring.dispose(); lifeA.dispose(); lifeB.dispose(); out[mode] = o; renderer.dispose();
            } catch (err) { out[mode] = { err: String(err && err.stack || err).slice(0, 700) }; }
        }
        return out;
    }` });
    ok("[v4732] the harness ran lock life on BOTH backends", r.ok && r.result && !r.result.webgpu.err && !r.result.webgl2.err,
       r.ok ? `webgpu ${r.result.webgpu.err || "ok"}; webgl2 ${r.result.webgl2.err || "ok"}` : (r.reason || (r.pageErrors || []).join("; ")));
    if (r.ok && r.result) for (const mode of ["webgpu", "webgl2"]) {
        const o = r.result[mode]; if (!o || o.err) continue;
        const up = (px) => { if (mode === "webgpu") return new Float32Array(px); const f = []; for (let y = D6 - 1; y >= 0; y--) f.push(...px.slice(y * D6 * 4, (y + 1) * D6 * 4)); return new Float32Array(f); };
        const ch = (a4, c = 0) => { const x = new Float32Array(a4.length / 4); for (let i = 0; i < x.length; i++) x[i] = a4[i * 4 + c]; return x; };
        const N = D6 * D6;
        // (a) the ridge test, every pixel and both axes, at three plateau bounds
        const field = ch(up(o.field));
        let wrong = 0, ridges = {}, axes = 0, wrapDecided = 0;
        for (const mp of [1, 2, 3]) { const cpu = ridgesCPU(field, D6, D6, MARGIN, mp), g = up(o.plateau[mp]); ridges[mp] = cpu.count;
            for (let i = 0; i < N; i++) if (g[i * 4] !== cpu.data[i] || g[i * 4 + 1] !== cpu.axisX[i] || g[i * 4 + 2] !== cpu.axisY[i]) wrong++;
            if (mp === 2) for (let i = 0; i < N; i++) if (cpu.axisX[i] && cpu.axisY[i]) axes++; }
        // THE WRAP'S POPULATION, counted with the walk's other reading -- a wrapped step read as leaving the frame. This
        // is the counterfactual only; the grade above is against ridgesCPU itself.
        { const m = MARGIN; for (let y = 1; y < D6 - 1; y++) for (const x of [1, D6 - 2]) { const i = y * D6 + x, c = field[i];
            for (const s of [-1, 1]) { const n1 = field[i + s] - c; if (Math.abs(n1) > m) continue; if ((s < 0 && x !== 1) || (s > 0 && x !== D6 - 2)) continue;
                const n2 = field[i + 2 * s] - c; if (Math.abs(n2) > m) wrapDecided++; } } }
        ok(`*** [${mode}] the RIDGE TEST is ridgesCPU's on every pixel, both axes, at maxPlateau 1, 2 and 3 -- ${wrong} disagreements; ${ridges[1]}, ${ridges[2]} and ${ridges[3]} ridges, ${axes} on both axes, ${wrapDecided} walks decided across the row wrap ***`,
           wrong === 0 && ridges[1] > 0 && ridges[2] > ridges[1] && ridges[3] !== ridges[2] && axes > 0 && wrapDecided > 0,
           "a field in steps of 1/32 against a 0.05 margin: one step is a plateau and two are not, so the walk decides most pixels and a bound of 1 is the old strict test");
        // (b) the chain, frame by frame: the mirror carries its OWN lock states and history, taking the device's
        // candidates and instability as its inputs (each graded against its own mirror in the same loop)
        const st = makeLumaState(D6, D6, P6), lsA = makeLockState(D6, D6), lsB = makeLockState(D6, D6);
        let hist = null, wMean = 0, wInst = 0, candRBad = 0, candROwn = 0, candFBad = 0, wLifeA = 0, wLifeB = 0, wRelax = 0, actBad = 0, wHist = 0;
        let nR = 0, nF = 0, decayed = 0, killedDis = 0, killedInst = 0, killedInvalid = 0, moved = 0, ties = 0, relaxedChanged = 0;
        o.frames.forEach((fr, k) => {
            const cur = up(fr.current), mot = up(fr.motion), pa = up(fr.a), pb = up(fr.b), mean = ch(pa, 0), inst = ch(pa, 1);
            const band = (5 * k) % 29, dis = new Float32Array(N); for (let i = 0; i < N; i++) { const x = i % D6; dis[i] = x >= band && x < band + 3 ? 1 : 0; }
            pushLuma(st, { current: cur, motion: mot, w: D6, h: D6 });
            const cm = lumaMean(st), ci = lumaInstability(st);
            for (let i = 0; i < N; i++) { wMean = Math.max(wMean, Math.abs(mean[i] - cm[i])); wInst = Math.max(wInst, Math.abs(inst[i] - ci[i])); }
            const cR = ridgesCPU(mean, D6, D6, MARGIN), own = lockCandidatesFromRing(st, { margin: MARGIN }), cF = newLocksCPU({ current: cur, w: D6, h: D6, margin: MARGIN });
            const gR = ch(pa, 2), gF = ch(pa, 3);
            for (let i = 0; i < N; i++) { if (gR[i] !== cR.data[i]) candRBad++; if (gR[i] !== own.data[i]) candROwn++; if (gF[i] !== cF.data[i]) candFBad++; }
            nR += cR.count; nF += cF.count;
            // the kill rules' populations, each counted against the same step with that rule taken away
            const prevA = lsA.life.slice();
            const noDis = { w: D6, h: D6, life: prevA.slice() }, noInst = { w: D6, h: D6, life: prevA.slice() };
            advanceLocks(noDis, { motion: mot, instability: inst, newLocks: gR, w: D6, h: D6, life: LA, instabilityKill: KILL });
            advanceLocks(noInst, { motion: mot, disocclusion: dis, newLocks: gR, w: D6, h: D6, life: LA });
            const valid = mot.slice(); for (let i = 0; i < N; i++) valid[i * 4 + 2] = 1;
            const allValid = { w: D6, h: D6, life: prevA.slice() };
            advanceLocks(allValid, { motion: valid, disocclusion: dis, instability: inst, newLocks: gR, w: D6, h: D6, life: LA, instabilityKill: KILL });
            advanceLocks(lsA, { motion: mot, disocclusion: dis, instability: inst, newLocks: gR, w: D6, h: D6, life: LA, instabilityKill: KILL });
            advanceLocks(lsB, { motion: mot, newLocks: gF, w: D6, h: D6, life: LB });
            const gA = ch(pb, 0), gB = ch(pb, 1), gRel = ch(pb, 2), gAct = ch(pb, 3);
            const rel = lockRelaxation(lsA, { life: LA }), act = activeMask(lsA);
            for (let i = 0; i < N; i++) {
                wLifeA = Math.max(wLifeA, Math.abs(gA[i] - lsA.life[i])); wLifeB = Math.max(wLifeB, Math.abs(gB[i] - lsB.life[i]));
                wRelax = Math.max(wRelax, Math.abs(gRel[i] - rel[i])); if (gAct[i] !== act.data[i]) actBad++;
                if (lsA.life[i] > 0 && lsA.life[i] < LA) decayed++;
                if (noDis.life[i] > 0 && lsA.life[i] === 0) killedDis++;
                if (noInst.life[i] > 0 && lsA.life[i] === 0) killedInst++;
                if (allValid.life[i] > 0 && lsA.life[i] === 0 && mot[i * 4 + 2] === 0) killedInvalid++;
                const x = i % D6, y = (i / D6) | 0;
                if (k > 0 && lsA.life[i] > 0 && lsA.life[i] < LA && nearestTexel((x + 0.5) / D6 + mot[i * 4], (y + 0.5) / D6 + mot[i * 4 + 1], D6, D6) !== i) moved++;
                const t = ((x + 0.5) / D6 + mot[i * 4]) * D6;
                if (k > 0 && lsA.life[i] > 0 && lsA.life[i] < LA && mot[i * 4 + 2] !== 0 && t === Math.floor(t)) ties++;
            }
            const acc = rectifiedAccumulateCPU({ current: cur, history: k ? hist : null, motion: mot, relax: gRel, w: D6, h: D6, alpha: 0.1, space: "ycocg" });
            const hard = rectifiedAccumulateCPU({ current: cur, history: k ? hist : null, motion: mot, w: D6, h: D6, alpha: 0.1, space: "ycocg" });
            for (let i = 0; i < N * 4; i++) if (i % 4 === 0 && Math.max(...[0, 1, 2].map((c) => Math.abs(acc.data[i + c] - hard.data[i + c]))) > 1e-3) relaxedChanged++;
            hist = acc.data;
            const g = up(fr.hist); for (let i = 0; i < N; i++) for (let c = 0; c < 3; c++) wHist = Math.max(wHist, Math.abs(g[i * 4 + c] - hist[i * 4 + c]));
        });
        ok(`[${mode}] the ring's MEAN and INSTABILITY are lumaMean's and lumaInstability's every frame -- worst ${wMean.toExponential(2)} and ${wInst.toExponential(2)}`,
           wMean < 1e-5 && wInst < 1e-5, "the two fields the ring candidates and the instability kill read");
        ok(`*** [${mode}] the CANDIDATES are the mirrors' on every pixel of ${o.frames.length} frames -- ring ${candRBad} wrong (${nR} found; ${candROwn} against lockCandidatesFromRing on the mirror's OWN ring), single frame ${candFBad} wrong (${nF} found) ***`,
           candRBad === 0 && candROwn === 0 && candFBad === 0 && nR > 0 && nF > 0, "ridgesCPU over the device's mean, and newLocksCPU over the device's frame");
        ok(`*** [${mode}] LOCK LIFE is advanceLocks' on every pixel of every frame -- worst ${wLifeA} (life ${LA}, every kill on) and ${wLifeB} (life ${LB}, none) ***`,
           wLifeA === 0 && wLifeB === 0 && decayed > 0 && moved > 0 && ties > 0 && killedDis > 0 && killedInst > 0 && killedInvalid > 0,
           `${decayed} lock-frames decayed, ${moved} of them carried from ANOTHER texel by the pan and ${ties} across an exact texel tie; killed by disocclusion ${killedDis}, by instability ${killedInst}, by invalid motion ${killedInvalid} -- each counted against the same step with that rule taken away`);
        ok(`  [${mode}] ...its RELAXATION is lockRelaxation's (worst ${wRelax.toExponential(2)}) and its ACTIVE MASK activeMask's (${actBad} wrong)`, wRelax < 1e-6 && actBad === 0);
        ok(`*** [${mode}] and the RELAXED ACCUMULATE is rectifiedAccumulateCPU's with that relax, the mirror carrying its own history -- worst ${wHist.toExponential(2)}; ${relaxedChanged} pixel-frames where the relax moved the result off the hard clamp by more than 1e-3 ***`,
           wHist < 1e-5 && relaxedChanged > 0, "cl + (b - cl) * rx per channel in YCoCg -- accumulateNode's `relax`, the only way a lock reaches the picture");
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
// ---- v4732 SABOTAGE LOG ----------------------------------------------------------------------------------------
// Against render/temporalLockTsl.mjs, and K20-K21 against render/temporalTsl.mjs's accumulateNode.
//   K1  the ridge walk does not wrap across rows     -> 4    K12 disocclusion does not kill              -> 4
//   K2  the walk takes the LAST decisive step         -> 4    K13 instability does not kill               -> 4
//   K3  a ridge needs both axes                       -> 4    K14 invalid motion carried anyway           -> 4
//   K4  the frame's border counted as interior        -> 4    K15 the first advance trusts its state      -> 4
//   K5b a walk off the frame reads the clamped edge   -> 4    K16 a new lock gets life - 1                -> 4
//   K6  the frame's luma as Rec.601                   -> 2    K17 the relaxation not divided by the life  -> 2
//   K7  the mean over the OLDER period                -> 4    K18 the active mask counts a dead lock      -> 2
//   K8  instability about zero, not the mean          -> 4    K19 the advance reads the state it writes   -> 5
//   K9  a carried lock does not decay                 -> 4    K20 the relax lerps the wrong way           -> 2
//   K10 the lock carried from its own pixel           -> 4    K21 the relax ignored                       -> 2
//   K11b the nearest texel as round(t - 0.5)          -> 4    K11c the nearest texel as round(t)          -> 4
// *** THREE SCORED 0 RED ON THE FIRST DRAFT, AND NONE WAS A BLIND SPOT OF THE PORT. ***
//   K5  "a walk that leaves the frame is not decisive" is an EQUIVALENT MUTANT: a vertical walk that has left the frame
//       stays out of it, so every later step is out too and the answer is 0 either way. K5b takes the out test away
//       altogether -- the clamped edge then decides -- and is red.
//   K11 was written as floor(t + 1e-7), which is floor; K11b is the real condemned form, round(t - 0.5), and it scored
//       0 RED TOO: it differs from floor only where u*w lands EXACTLY on a texel boundary, and a camera-derived field
//       in f32 never did. Rows 4-7 of the field now move exactly half a texel a frame, 93 carried lock-frames cross a
//       tie, and K11b is red on both backends -- the tie v4559 found in the ring's fill count, held here for the lock.
//   K15 is the first advance reading its state as if it had one: a new target is zeroed on both backends, so it read
//       zeros. The state is now filled with a life of 5 before the first advance, and a fresh lock life must ignore it.
// Adding the tie band cost a finding of its own: written as a vec4 select nested in a vec4 select it drew nothing on
// WebGL2 -- every channel 0 but the fourth -- where one select alone draws; it is written a component at a time.
// The full set was re-run after both fixture changes.
console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nALL GREEN");
console.log("unchecked here: the ring at a real 2x period (32, 64 slots, sixteen slices) -- this gate runs period 8 so it fills in 16 pushes; " +
    "ridgesCPU's per-pixel margin, which is not carried; and whether the locks HELP -- fx/fsr/fsrTemporalLocks-selfcheck.mjs measures that.");
process.exitCode = fails ? 1 : 0;
