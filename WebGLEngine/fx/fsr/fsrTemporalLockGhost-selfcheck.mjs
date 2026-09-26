#!/usr/bin/env node
// WebGLEngine/fx/fsr/fsrTemporalLockGhost-selfcheck.mjs -- v4735
//
// THE CASE A LOCK IS DANGEROUS IN, DRAWN THROUGH THE DRIVER. render/temporalLock-selfcheck.mjs section 5 measured a
// lock detector that cannot tell a thin feature from a texture at the pixel scale -- every chequer cell reads as a
// ridge -- and on such a picture, with an occluder moving across it, locks made the ghost 26% WORSE. That chain used
// disocclusion only to kill locks. fx/fsr/fsrTemporalTsl.mjs ships locks ON by default, and its chain also discards
// history on disocclusion and on the reactive mask; v4732 said so and drew no row. This draws it: a chequer of 1.13
// render pixels, a box sliding across it, 64 -> 128 over 32 frames, against a 4x4-supersampled render of the last frame,
// on the whole frame and on the TRAIL -- the pixels the box covered in any of the eight frames before the last and no
// longer does, which is where a ghost lives.
//
// MEASURED FIRST (webgpu, 40 frames, trail PSNR, locks from the frame against none):
//     the chain as it ships                     14.589 -> 14.578   -0.011 dB   (-0.002 at 2.5x the speed)
//     the depth clip off (threshold 1e9)        14.434 -> 14.355   -0.079 dB
//     the depth clip AND the reactive mask off  12.744 -> 11.868   -0.876 dB   (the ring's locks: -0.075)
// So the ghost is REAL here too -- 11% more RMS on the trail when the clamp is the only defence -- and the two masks are
// what remove it, BOTH of them: the sabotages below take one away at a time and each leaves a cost (-0.19, -0.35 dB). The frame's locks hold the clamp open on 70% of this frame (the chequer is ridges everywhere); the
// masks throw the trail's history away before the relaxation can let it through. The ring's locks, which fewer pixels
// hold, cost -0.075 with the clamp alone; the gate runs the frame's, the default, and 32 frames, to stay under 20 s.
"use strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runInEngineOrigin, webgpuSkipReason } from "../../tools/ship/webgpuHarness.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (label, cond, detail) => { if (!cond) fails++; console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "   " + detail : ""}`); };
const DW = 128, RW = 64, N = 32, CELL = 1.13, SPEED = 0.04;

console.log("\n1. ON THE DEVICE: a pixel-scale chequer, a box sliding across it, with and without locks and with and without the masks");
const skip = webgpuSkipReason();
if (skip) { console.log(`  SKIP  ${skip}`); console.log("  ----  *** NOT A PASS. *** Nothing here is static."); fails++; }
else {
    const r = await runInEngineOrigin({ engineRoot: ENG, timeoutMs: 300000, args: { DW, RW, N, CELL, SPEED }, script: `async (a) => {
        const THREE = await import("/vendor/three-webgpu/three.webgpu.js"); const T = await import("/vendor/three-webgpu/three.tsl.js");
        const FT = await import("/fx/fsr/fsrTemporalTsl.mjs"); const TC = await import("/render/temporalClipTsl.mjs");
        const out = {};
        for (const mode of ["webgpu", "webgl2"]) {
            try {
                const canvas = document.createElement("canvas"); canvas.width = a.DW; canvas.height = a.DW;
                const renderer = new THREE.WebGPURenderer({ canvas, forceWebGL: mode === "webgl2", antialias: false }); await renderer.init();
                const D = a.DW, tgt = (n) => new THREE.RenderTarget(n, n, { type: THREE.FloatType });
                const read = async (t, n) => Array.from(await renderer.readRenderTargetPixelsAsync(t, 0, 0, n, n));
                // a view 4 units wide at the wall over 64 render pixels: 16 a unit, so a cell of CELL render pixels
                const cam = new THREE.PerspectiveCamera(2 * Math.atan(2 / 5) * 180 / Math.PI, 1, 0.5, 20); cam.position.set(0, 0, 5); cam.lookAt(0, 0, 0); cam.updateMatrixWorld();
                const scene = new THREE.Scene(); scene.background = new THREE.Color(0.02, 0.02, 0.03);
                const cellU = a.CELL / 16, wm = new THREE.MeshBasicNodeMaterial();
                wm.colorNode = T.Fn(() => { const p = T.positionWorld; const s = T.floor(p.x.div(cellU)).add(T.floor(p.y.div(cellU))).mod(2.0);
                    return T.mix(T.vec3(0.1, 0.1, 0.12), T.vec3(0.9, 0.85, 0.75), s); })();
                scene.add(new THREE.Mesh(new THREE.PlaneGeometry(8, 8), wm));
                const occM = new THREE.MeshBasicNodeMaterial(); occM.colorNode = T.vec3(0.3, 0.55, 0.9);
                const occ = new THREE.Mesh(new THREE.BoxGeometry(1.0, 2.5, 0.4), occM); occ.position.z = 1.2; scene.add(occ);
                const setT = (k) => { occ.position.x = -1.2 + k * a.SPEED; occ.updateMatrixWorld(); };
                const vp = Array.from(new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse).elements);
                const threshold = TC.clipGapThreshold(vp, [0, 0, 1.0], [0, 0, 0]);
                // the trail, from the box alone drawn white on black at each of the eight frames before the last
                const mask = new THREE.Scene(); mask.background = new THREE.Color(0, 0, 0);
                const mOcc = new THREE.Mesh(occ.geometry, new THREE.MeshBasicNodeMaterial({ color: 0xffffff })); mask.add(mOcc);
                const covered = async (k) => { mOcc.position.set(-1.2 + k * a.SPEED, 0, 1.2); mOcc.updateMatrixWorld(); const t = tgt(D);
                    renderer.setRenderTarget(t); await renderer.renderAsync(mask, cam); const px = await renderer.readRenderTargetPixelsAsync(t, 0, 0, D, D); t.dispose(); return px; };
                // reduced here rather than shipped: nine masks and a 512 x 512 truth through the harness's JSON were most of
                // this gate's first 28 s
                const o = {}, now = await covered(a.N - 1), trail = new Array(D * D).fill(0);
                for (let j = 2; j <= 9; j++) { const c = await covered(a.N - j); for (let i = 0; i < D * D; i++) if (c[i * 4] > 0.5 && now[i * 4] < 0.5) trail[i] = 1; }
                o.trail = trail;
                setT(a.N - 1);
                const big = tgt(D * 4); renderer.setRenderTarget(big); await renderer.renderAsync(scene, cam);
                const t4 = await renderer.readRenderTargetPixelsAsync(big, 0, 0, D * 4, D * 4); big.dispose();
                const truth = new Array(D * D * 4).fill(0);
                for (let y = 0; y < D; y++) for (let x = 0; x < D; x++) for (let c = 0; c < 3; c++) { let s = 0;
                    for (let sy = 0; sy < 4; sy++) for (let sx = 0; sx < 4; sx++) s += t4[((y * 4 + sy) * D * 4 + x * 4 + sx) * 4 + c]; truth[(y * D + x) * 4 + c] = s / 16; }
                o.truth = truth;
                // the chain as it ships, and the chain with only the clamp between the history and a ghost
                const configs = { shipNone: { lockFrom: null }, shipFrame: {}, clampNone: { lockFrom: null, reactive: false, off: true },
                                  clampFrame: { reactive: false, off: true } };
                for (const [fn, cfg] of Object.entries(configs)) {
                    const { off, ...opts } = cfg;
                    const f2 = FT.makeFsrTemporal(THREE, T, renderer, { renderWidth: a.RW, renderHeight: a.RW, displayWidth: D, displayHeight: D,
                        threshold: off ? 1e9 : threshold, type: THREE.FloatType, ...opts });
                    const o2 = tgt(D);
                    for (let k = 0; k < a.N; k++) { setT(k); await f2.render(scene, cam, o2); }
                    o[fn] = { out: await read(o2, D), relax: f2.targets.relax ? await read(f2.targets.relax, D) : null };
                    f2.dispose(); o2.dispose();
                }
                out[mode] = o; renderer.dispose();
            } catch (err) { out[mode] = { err: String(err && err.stack || err).slice(0, 700) }; }
        }
        return out;
    }` });
    ok("the harness ran every configuration on BOTH backends", r.ok && r.result && !r.result.webgpu.err && !r.result.webgl2.err,
       r.ok ? `webgpu ${r.result.webgpu.err || "ok"}; webgl2 ${r.result.webgl2.err || "ok"}` : (r.reason || (r.pageErrors || []).join("; ")));
    if (r.ok && r.result) for (const mode of ["webgpu", "webgl2"]) {
        const o = r.result[mode]; if (!o || o.err) continue;
        const D = DW, P = D * D;
        // every readback here is read the same way, so row order cancels
        const trail = o.trail, truth = o.truth;
        let nTrail = 0; for (const v of trail) nTrail += v;
        const cl = (v) => Math.min(1, Math.max(0, v));
        const psnr = (b, m) => { let q = 0, n = 0; for (let i = 0; i < P; i++) { if (m && !m[i]) continue; n++; for (let c = 0; c < 3; c++) q += (cl(b[i * 4 + c]) - cl(truth[i * 4 + c])) ** 2; } return 10 * Math.log10(1 / (q / (n * 3))); };
        const t = (k) => psnr(o[k].out, trail), f = (v) => v.toFixed(3), d = (a, b) => (a - b >= 0 ? "+" : "") + (a - b).toFixed(3);
        let held = 0, heldTrail = 0; for (let i = 0; i < P; i++) if (o.shipFrame.relax[i * 4] > 0) { held++; if (trail[i]) heldTrail++; }
        ok(`[${mode}] the chequer is ridges everywhere, as render/temporalLock.mjs said it would be: the frame's locks hold the clamp open on ${(held / P * 100).toFixed(0)}% of the frame and ${heldTrail} of the trail's ${nTrail} pixels`,
           held > P * 0.4 && heldTrail > 0 && nTrail > 500, "a lock detector cannot tell a thin feature from a texture at the pixel scale -- the rows below are what that costs");
        ok(`*** [${mode}] WITH ONLY THE CLAMP between the history and a ghost -- the depth clip and the reactive mask off -- the frame's locks cost the trail ${d(t("clampFrame"), t("clampNone"))} dB (${f(t("clampNone"))} -> ${f(t("clampFrame"))}) ***`,
           t("clampNone") - t("clampFrame") > 0.4, `${((10 ** ((t("clampNone") - t("clampFrame")) / 20) - 1) * 100).toFixed(0)}% more RMS on the trail: render/temporalLock-selfcheck.mjs section 5's ghost, reproduced through the driver`);
        ok(`*** [${mode}] and AS THE DRIVER SHIPS -- both masks on -- the same locks move it ${d(t("shipFrame"), t("shipNone"))} dB (${f(t("shipNone"))} -> ${f(t("shipFrame"))}), and the whole frame ${d(psnr(o.shipFrame.out), psnr(o.shipNone.out))} ***`,
           Math.abs(t("shipFrame") - t("shipNone")) < 0.1 && Math.abs(psnr(o.shipFrame.out) - psnr(o.shipNone.out)) < 0.1,
           "the masks discard the trail's history before the relaxation can let it through -- which is why the default can be locks ON, and why it could not be in a chain without them");
    }
}

// ---- v4735 SABOTAGE LOG ----------------------------------------------------------------------------------------
// Against fx/fsr/fsrTemporalTsl.mjs -- the claim is that the MASKS make the default safe, so they are what is broken:
//   G1 disocclusion no longer discards history        -> 2   locks now cost the trail -0.189 dB as shipped
//   G2 the reactive mask no longer discards history    -> 2   -0.350 dB
//   G3 neither does                                    -> 2   -0.871 dB -- the clamp-only row's number, through the ship path
//   G4 a lock does not die on disocclusion             -> 0
// *** IT TAKES BOTH MASKS, AND THAT IS THE FINDING THE SABOTAGES ADDED. *** Either one alone leaves the locks a real
// cost on the trail; the header's "the masks remove it" is two masks, not one with a spare.
// *** G4 IS 0 RED BECAUSE THE CHAIN MAKES THE RULE REDUNDANT, NOT BECAUSE THE ROW CANNOT SEE IT. *** Where disocclusion
// fires, the history factor is 0 and the history is discarded outright; a lock that survived there relaxes the clamp on
// a history nobody reads. advanceLocks' kill rule matters in a chain like render/temporalLock-selfcheck.mjs's, where
// disocclusion only kills locks -- and it is held to its mirror in render/temporalLockTsl-selfcheck.mjs (K12) for that.
console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nALL GREEN");
console.log("unchecked here: other speeds and cell sizes (measured at v4735: 2.5x the speed and a 2.5-pixel cell cost at most 0.063 dB " +
    "on the trail as shipped); an occluder whose own colour is inside the chequer's box, which the clamp could not reject even with no lock; " +
    "and why the masks cost this picture 0.2 dB over the whole frame with no lock at all (17.03 against 16.82) -- noted, not chased.");
process.exitCode = fails ? 1 : 0;
