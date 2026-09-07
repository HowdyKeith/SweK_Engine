#!/usr/bin/env node
// WebGLEngine/tools/ship/raceReplayBake-selfcheck.mjs -- v4528
//
// THE REPLAY PRE-RENDERED: a race record baked to voxels, keyframed from its own log, drawn on both backends and read back,
// written as PNG keyframes with a JSON schematic, and recorded as a WebM off the canvas -- with the route this box cannot
// take (an H.264 MP4) measured and recorded as rig-pending rather than assumed.
//
// Section 1, THE STAMP: every loop cell's y = 0 layer is filled from the surface the car drives on -- 4,400 voxels for 44
// cells, the counts by kind, the voxel at a centreline point ASH, at the kerb striped, and nothing written under the free
// cells that trackWorld had not laid; the bake is deterministic by mesh hash.
// Section 2, THE KEYFRAMES: taken from the record's own log through drivePolicy.replay's observing onTick, the playback's
// fingerprint equal to the record's, one keyframe per `every` ticks plus the last, the poses moving, the onTick unable to
// change the fingerprint; a record with one flipped input keyframes to a different fingerprint and is refused as frames.
// Section 3, THE CAR: a box the chassis' size, 24 vertices, drawn in quat mode.
// Section 4, IN THE BROWSER ON BOTH BACKENDS: the same record baked and keyframed in the page's wasm to node's fingerprint,
// six keyframes rendered and read back on WebGPU and on WebGL2 -- the car's colour at its projected pose in every frame,
// consecutive frames different, the two backends agreeing -- and a 3 s WebM recorded off the canvas (EBML bytes, a size),
// with the MP4/H.264 route probed and refused by the browser itself.
// Section 5, THE FILES: the frames written as PNGs by tools/ship/pngWrite.mjs, decoded back byte for byte, and the schematic
// naming each file with its pixel hash; the record's frames are the record's or the manifest says so.
// Section 6, THE PAGE: race-replay.html builds its own record without a bridge and says NOT REAL TIME.
//
// MEASURED AT THE ROUND (v4528, both backends through the headless Dawn harness): 44 loop cells stamp 4,400 voxels (3,470 asphalt,
// 300 kerb, 630 grass), 86 buildings, 31,230 vertices, mesh 25dd06ef; 61 keyframes every 30 of 1,800 ticks in 144 ms to the record's
// fingerprint 965b6698 (one flipped input: bc3713d5); the page's wasm keyframes the same record to 965b6698 in ~370 ms; six keyframes
// rendered and read back in 219 ms on WebGPU (compute+drawIndexedIndirect) and 100 ms on WebGL2 (cpu-twin+drawIndexed), the car's
// red at its pose 37..53 %, the two backends within 24 on 65,133 of 65,536 pixels; a 3 s WebM of 42,658 bytes, VP9, sniffed webm;
// MediaRecorder: webm true, video/mp4 true, video/mp4;codecs=avc1.42E01E FALSE (the H.264 MP4 is rig-pending by measurement); six
// PNGs of ~26.5 KB decode back byte for byte. Six runs alone: 6,744 / 6,761 / 6,753 / 6,900 / 6,867 / 6,871 ms, all exit 0.
// THREE FINDINGS ON THE WAY: (1) the device's read-back resolves to { pixels, width, height }; a draft hashed the object (six equal
// hashes) and the next guessed an ArrayBuffer (six empty frames) before the gate named both; (2) the page loaded in an iframe of the
// SAME page as the recorder and the two devices froze the renderer's main thread 4 times in 16 runs (no timer fired, the 5 s probe
// went unanswered, the last step logged was the iframe) and crawled to ~20 s the other times, while the page alone loaded 20 of 20
// times in ~1.2 s on either backend -- so the page smoke has its own browser and the gate fell from ~26 s to ~6.8 s; (3) page.evaluate
// has no timeout, so the harness now races it against timeoutMs and reads back the last step (tools/ship/webgpuHarness.mjs, v4528).
//
// SABOTAGE (the round):
//   A  VOXELS all grass (the module stamps grass everywhere and calls it asphalt)  -> 1 red at first: the asphalt check compared
//      against the sabotaged constant and the dark-pixel check counted the clear colour over the whole frame ("21044 dark"). Both
//      re-aimed: the palette's numbers written here, the picture read under the centreline's projection and at the stamp's own
//      grass voxels. Re-sabotaged -> 5 red (ids, centreline, kerb, and the picture on both backends: "0 of 194 centreline pixels dark").
//   B  keyframesOf plays the log with every throttle zeroed                          -> 7 red (fingerprint, motion 0.0 m, onTick,
//      the page's fingerprint, consecutive keyframes equal on both backends, the page line)
//   C  carMesh unscaled (a unit box for a 1.5 x 0.7 x 2.8 m chassis)               -> 3 red (extents, the car's colour at its pose on both)
//   D  encodePNG writes colour type 2 (RGB) for RGBA rows                           -> CRASHED the gate at first: decodePNG threw "bad PNG
//      filter type 218" and nothing printed FAIL. Caught now -> 1 red by name with the decoder's message.
//   E  keyframeManifest writes pixelHash null                                       -> 1 red (the schematic)
//   F  renderKeyframes never calls setKeyframe                                      -> 4 red (the car's pose and the consecutive-frames
//      check on both backends)
//   G  race-replay.html says "not quite live" instead of NOT REAL TIME              -> 1 red (the page line)
//
// Run: node tools/ship/raceReplayBake-selfcheck.mjs      (~7 s: two browsers, the first on both backends with the recorder)
"use strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runInEngineOrigin, webgpuSkipReason } from "./webgpuHarness.mjs";
import { encodePNG } from "./pngWrite.mjs";
import { decodePNG } from "./pngCoverage.mjs";
import * as R from "../../physics/raceKnob.mjs";
import * as B from "../../world/raceReplayBake.mjs";
import * as T from "../../world/raceTrack.mjs";
import * as G from "../../render/gpuDriven.mjs";
import { CAR } from "../../physics/raceCar.mjs";
import { CityGen } from "../../world/CityGen.js";
import { meshHash, miniWorld } from "../../render/voxelDevice.mjs";
import { worldFromModule } from "../../render/slugTicker.mjs";
import { mod } from "../../physics/box3d/box3dNode.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const report = (m) => console.log("  ----  " + m);
const sec = (t) => console.log("\n" + t);
const near = (a, b, e) => Math.abs(a - b) <= e;

await R.ready();
const worldFrom = () => worldFromModule(mod(), [0, -9.81, 0]);
const rec = R.replay(0.5, { seconds: 30 });
report(`the record: the lab's accepted driver (speedGain 0.5), seed ${rec.seed}, ${rec.seconds} s, ${rec.ticks} ticks, fingerprint ${rec.fingerprint}`);

// ---------------------------------------------------------------------------------------------------------------------------------
sec("1. THE STAMP: every loop cell filled from the surface the car drives on, nothing else touched");
let baked = null; const grassVoxels = [];   // the stamp's own grass columns in the loop cells, for the picture check in section 4
{
    const t0 = performance.now(); baked = B.bakeReplayWorld(rec, CityGen); const ms = performance.now() - t0;
    const s = baked.stamped, cells = baked.track.cells.length;
    report(`${cells} loop cells: ${s.asphalt} asphalt, ${s.kerb} kerb, ${s.grass} grass voxels; ${baked.rects.length} buildings; ${baked.packed.vertices} vertices; mesh ${meshHash(baked.packed.mesh)} in ${ms.toFixed(0)} ms`);
    ok("*** every loop cell's hundred voxels are written, by kind, and the kinds are the surface's ***", s.asphalt + s.kerb + s.grass === cells * T.TILE * T.TILE && s.asphalt > s.kerb && s.kerb > 0 && s.grass > 0);
    // sabotage A (v4528): the first draft compared against B.VOXELS, so a module that stamped grass everywhere and SAID it was
    // asphalt passed this line. The ids are world/chunkMesherCore.js's PALETTE, written here as the numbers they are.
    const STONE = 1, GRASS = 3, SNOW = 5, ASH = 6;
    ok("  the module's ids are the palette's: asphalt ASH 6, kerb STONE 1 / SNOW 5, grass 3", B.VOXELS.asphalt === ASH && B.VOXELS.kerbA === STONE && B.VOXELS.kerbB === SNOW && B.VOXELS.grass === GRASS && T.FLOOR_ID === GRASS);
    const line = T.centreline(baked.track), onLine = line.every(([x, z]) => baked.world.voxelAt(Math.floor(x), 0, Math.floor(z)) === ASH);
    ok("  the voxel under every centreline point is asphalt (ASH)", onLine, `${line.length} points`);
    let kerbs = 0, striped = 0;
    for (const [cx, cz] of baked.track.cells) { const x0 = cx * T.TILE - baked.track.cols * T.TILE / 2, z0 = cz * T.TILE - baked.track.rows * T.TILE / 2; for (let x = x0; x < x0 + T.TILE; x++) for (let z = z0; z < z0 + T.TILE; z++) { const v = baked.world.voxelAt(x, 0, z); if (v === STONE || v === SNOW) { kerbs++; if (v === (((x + z) & 1) ? STONE : SNOW)) striped++; } } }
    ok("  the kerb is striped STONE / SNOW by parity, every kerb voxel", kerbs === s.kerb && striped === kerbs && kerbs > 0, `${kerbs} kerb voxels`);
    // the free cells: trackWorld's floor, untouched by the stamp
    const plain = miniWorld(); T.trackWorld(baked.track, plain, CityGen); let same = 0, total = 0;
    const [x0, z0, x1, z1] = T.floorBounds(baked.track), loop = new Set(baked.track.cells.map((c) => c.join(",")));
    for (let x = x0; x < x1; x += 3) for (let z = z0; z < z1; z += 3) { const c = T.cellAt(baked.track, x + 0.5, z + 0.5); if (!c || loop.has(c.join(","))) continue; total++; if (plain.voxelAt(x, 0, z) === baked.world.voxelAt(x, 0, z)) same++; }
    ok("  under the free cells the floor is trackWorld's, untouched", total > 100 && same === total, `${same} of ${total} sampled columns`);
    ok("  the bake is deterministic: a second bake meshes to the same hash", meshHash(B.bakeReplayWorld(rec, CityGen).packed.mesh) === meshHash(baked.packed.mesh));
    for (const [cx, cz] of baked.track.cells) { const x0 = cx * T.TILE - baked.track.cols * T.TILE / 2, z0 = cz * T.TILE - baked.track.rows * T.TILE / 2; for (let x = x0; x < x0 + T.TILE; x++) for (let z = z0; z < z0 + T.TILE; z++) if (baked.world.voxelAt(x, 0, z) === GRASS) grassVoxels.push([x, z]); }
}

// ---------------------------------------------------------------------------------------------------------------------------------
sec("2. THE KEYFRAMES: from the record's own log, to the record's fingerprint");
let kf = null;
{
    const t0 = performance.now(); kf = B.keyframesOf(worldFrom, rec, { every: 30 }); const ms = performance.now() - t0;
    report(`${kf.frames.length} keyframes every 30 of ${rec.ticks} ticks in ${ms.toFixed(0)} ms; playback ${kf.fingerprint}`);
    ok("*** the playback's fingerprint is the record's, so the frames are the race ***", kf.same && kf.fingerprint === rec.fingerprint);
    ok("  one keyframe per 30 ticks plus the last, ticks ascending, one pose per car with a unit quaternion", kf.frames.length === Math.ceil(rec.ticks / 30) + (rec.ticks % 30 === 0 ? 1 : 0) - 0 && kf.frames[0].tick === 0 && kf.frames[kf.frames.length - 1].tick === rec.ticks - 1 && kf.frames.every((f, i) => (i === 0 || f.tick > kf.frames[i - 1].tick) && f.poses.length === 1 && near(Math.hypot(...f.poses[0].quat), 1, 1e-3)));
    const d = Math.hypot(kf.frames[20].poses[0].pos[0] - kf.frames[0].poses[0].pos[0], kf.frames[20].poses[0].pos[2] - kf.frames[0].poses[0].pos[2]);
    ok("  the car moves between keyframes (10 s later it is metres away)", d > 20, `${d.toFixed(1)} m`);
    const bad = JSON.parse(JSON.stringify(rec)); bad.log[600][0].steer = 0.9;
    const kb = B.keyframesOf(worldFrom, bad, { every: 30 });
    ok("  a record with one flipped input keyframes to a DIFFERENT fingerprint, and says it is not the same", !kb.same && kb.fingerprint !== rec.fingerprint, kb.fingerprint);
    ok("  the observing onTick cannot move the fingerprint: keyframing again is the same fingerprint", B.keyframesOf(worldFrom, rec, { every: 7 }).fingerprint === rec.fingerprint);
}

// ---------------------------------------------------------------------------------------------------------------------------------
sec("3. THE CAR: a box the chassis' size");
{
    const m = B.carMesh();
    const ext = (k) => { let lo = Infinity, hi = -Infinity; for (let i = k; i < m.positions.length; i += 3) { lo = Math.min(lo, m.positions[i]); hi = Math.max(hi, m.positions[i]); } return hi - lo; };
    ok("24 vertices, 36 indices, extents 2 x CAR.half", m.positions.length === 72 && m.indices.length === 36 && [0, 1, 2].every((k) => near(ext(k), CAR.half[k] * 2, 1e-5)), `${ext(0).toFixed(2)} x ${ext(1).toFixed(2)} x ${ext(2).toFixed(2)}`);
}

// ---------------------------------------------------------------------------------------------------------------------------------
sec("4. IN THE BROWSER ON BOTH BACKENDS: baked and keyframed in the page's wasm, rendered and read back, recorded as a WebM");
const W = 256, H = 256, PICK = [0, 12, 24, 36, 48, 60];
let browser = null;
{
    const skip = webgpuSkipReason();
    if (skip) { console.log(`  SKIP  ${skip}`); report("*** NOT A PASS. ***"); fails++; }
    else {
        const r = await runInEngineOrigin({ engineRoot: ENG, timeoutMs: 150000, args: { rec, W, H, PICK }, script: `async (a) => {
            const { requestDevice } = await import("/gfx/device.js"); const G = await import("/render/gpuDriven.mjs"); const L = await import("/render/litSphere.mjs");
            const B = await import("/world/raceReplayBake.mjs"); const { CityGen } = await import("/world/CityGen.js"); const { box3d } = await import("/physics/box3d/box3dLoader.js");
            const { worldFromModule } = await import("/render/slugTicker.mjs"); const REC = await import("/render/blobRecorder.js");
            const step = (w) => { globalThis.__swekStep = w; console.log("[swek-step] " + w); };   // read back by the harness if this script never returns
            step("box3d.init"); const st = await box3d.init(); if (!st.ready) return { error: "box3d: " + st.reason };
            const worldFrom = () => worldFromModule(box3d._mod, [0, -9.81, 0]);
            const b64 = (u8) => { let s = ""; for (let i = 0; i < u8.length; i += 8192) s += String.fromCharCode.apply(null, u8.subarray(i, i + 8192)); return btoa(s); };
            // every await that touches the device or the recorder is raced against a clock, so a step that never resolves is
            // an error NAMING THE STEP rather than a gate held to the outer kill (v4528: it hung three times in ten runs)
            const within = (ms, what, p) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(what + " did not resolve in " + ms + " ms")), ms))]);
            const out = { backends: {} };
            step("bake"); const t0 = performance.now(); const baked = B.bakeReplayWorld(a.rec, CityGen); step("keyframesOf"); const kf = B.keyframesOf(worldFrom, a.rec, { every: 30 }); out.bakeMs = performance.now() - t0; out.fingerprint = kf.fingerprint; out.frames = kf.frames.length;
            out.picked = a.PICK.map((i) => ({ tick: kf.frames[i].tick, pos: kf.frames[i].poses[0].pos }));
            for (const bk of ["webgpu", "webgl2"]) {
                const cvs = document.createElement("canvas"); cvs.width = a.W; cvs.height = a.H; document.body.appendChild(cvs);
                // offscreen on WebGPU: this box loses the device on a pass that targets the canvas (device-present, v4462)
                let dev; step(bk + " requestDevice"); try { dev = await within(20000, bk + " requestDevice", requestDevice(cvs, { backend: bk, offscreen: bk === "webgpu" })); } catch (e) { out.backends[bk] = { error: e.message }; continue; }
                if (dev.backend !== bk) { out.backends[bk] = { error: "got " + dev.backend }; continue; }
                const sc = B.replayScene(dev, baked, G, L), cam = B.overheadCamera(G, a.W, a.H);
                let rendered; const t1 = performance.now(); step(bk + " renderKeyframes");
                try { rendered = await within(30000, bk + " renderKeyframes", B.renderKeyframes(sc, a.PICK.map((i) => kf.frames[i]), cam)); } catch (e) { out.backends[bk] = { error: e.message }; continue; }
                const renderMs = performance.now() - t1;
                step(bk + " b64"); const row = { path: sc.scene.path, renderMs, frames: rendered.map((f) => ({ tick: f.tick, hash: f.hash, png: b64(f.pixels) })) };
                if (bk === "webgl2") {
                    // the video: the slideshow on the PRESENTING canvas while MediaRecorder listens -- WebGL2 here, because the
                    // WebGPU device above is offscreen and never presents on this box
                    let j = 0; const timer = setInterval(() => { sc.setKeyframe(kf.frames[j++ % kf.frames.length]); sc.scene.frame({ viewProj: cam.viewProj, eye: cam.eye, clear: [0.03, 0.05, 0.08, 1] }); }, 50);
                    step("recordCanvas");
                    try { const v = await within(15000, "recordCanvas", REC.recordCanvas(cvs, 3000, 20)); step("blob.arrayBuffer"); const bytes = new Uint8Array(await within(10000, "blob.arrayBuffer", v.blob.arrayBuffer()));
                          row.video = { bytes: bytes.length, container: v.container, codec: v.codec, sniff: REC.sniffContainer(bytes), playsOnTv: v.playsOnTv, note: v.note }; }
                    catch (e) { row.video = { error: e.message }; }
                    clearInterval(timer);
                    step("probeRecording"); row.probe = REC.probeRecording(); row.h264 = MediaRecorder.isTypeSupported("video/mp4;codecs=avc1.42E01E"); row.mp4 = MediaRecorder.isTypeSupported("video/mp4");
                }
                out.backends[bk] = row;
                if (bk === "webgpu") { try { dev.destroy(); } catch (e) {} }   // the offscreen device is done
            }
            step("done");
            return out;
        }` });
        // THE PAGE IN ITS OWN BROWSER. The first draft loaded race-replay.html in an iframe of the page above, after the WebGPU
        // device, the WebGL2 canvas and the MediaRecorder: the renderer's main thread FROZE there 4 times in 16 runs (no timer
        // fired, no probe answered, the last step logged was the iframe), while the same page alone loaded 20 of 20 times on
        // either backend in about 1.2 s. The interaction is the browser's; the measurement is kept apart from it.
        const rp = r.ok ? await runInEngineOrigin({ engineRoot: ENG, timeoutMs: 45000, script: `async () => {
            const f = document.createElement("iframe"); f.style.width = "900px"; f.style.height = "600px"; f.src = "/race-replay.html?webgl=1"; document.body.appendChild(f);
            const pt = performance.now(); let d = null;
            while (performance.now() - pt < 20000) { await new Promise((r) => setTimeout(r, 250)); d = f.contentDocument; const el = d && d.getElementById("at"); if (el && /keyframe \\d+ of/.test(el.textContent)) break; }
            const txt = (id) => { const el = d && d.getElementById(id); return el ? el.textContent : ""; };
            return { be: txt("be"), src: txt("src"), out: txt("out"), at: txt("at"), pageMs: performance.now() - pt };
        }` }) : null;
        if (r.ok && r.result && !r.result.error) r.result.page = rp && rp.ok ? rp.result : { be: "", src: "", out: "", at: "", error: (rp && rp.reason) || "no page run" };
        if (!r.ok || !r.result || r.result.error) ok("the browser baked, rendered and recorded", false, (r.result && r.result.error) || r.reason || (r.pageErrors || []).join(" | "));
        else {
            browser = r.result;
            report(`bake + keyframes in the page's wasm: ${browser.frames} keyframes, fingerprint ${browser.fingerprint} in ${browser.bakeMs.toFixed(0)} ms`);
            ok("*** the page's wasm keyframes the record to node's fingerprint ***", browser.fingerprint === rec.fingerprint && browser.frames === kf.frames.length);
            const cam = B.overheadCamera(G, W, H), red = (c) => c[0] > c[1] * 1.8 && c[0] > c[2] * 1.8 && c[0] > 90;
            const decode = (s) => Uint8Array.from(Buffer.from(s, "base64"));
            for (const bk of ["webgpu", "webgl2"]) {
                const row = browser.backends[bk];
                if (!row || row.error) { ok(`${bk}: rendered`, false, row && row.error); continue; }
                row.pixels = row.frames.map((f) => decode(f.png));
                const shares = row.frames.map((f, i) => { const [cx, cy] = B.projectPoint(cam, browser.picked[i].pos); const px = row.pixels[i]; let n = 0, t = 0; for (let y = cy - 3; y <= cy + 3; y++) for (let x = cx - 3; x <= cx + 3; x++) { if (x < 0 || y < 0 || x >= W || y >= H) continue; t++; const o = (y * W + x) * 4; if (red([px[o], px[o + 1], px[o + 2]])) n++; } return n / Math.max(1, t); });
                report(`${bk} (${row.path}): ${row.frames.length} keyframes in ${row.renderMs.toFixed(0)} ms; the car's red at its pose ${shares.map((v) => (v * 100).toFixed(0) + "%").join(", ")}`);
                ok(`${bk}: *** the car's colour sits at its projected pose in every keyframe ***`, shares.every((v) => v > 0.15), shares.map((v) => (v * 100).toFixed(0) + "%").join(", "));
                ok(`${bk}: consecutive keyframes differ and the pixel hashes say so`, row.frames.every((f, i) => i === 0 || f.hash !== row.frames[i - 1].hash) && row.frames.every((f, i) => f.hash === B.pixelHash(row.pixels[i])));
                // sabotage A (v4528): the first draft counted dark pixels over the whole frame, and the clear colour is dark, so a
                // stamp of grass everywhere still read "21044 of 65536 dark". Read the picture WHERE the stamp is: under the
                // centreline's projection the asphalt, and at the stamp's own grass voxels the green.
                const px0 = row.pixels[0], at = (p) => { const [x, y] = B.projectPoint(cam, p); if (x < 0 || y < 0 || x >= W || y >= H) return null; const o = (y * W + x) * 4; return [px0[o], px0[o + 1], px0[o + 2]]; };
                const lineC = T.centreline(baked.track).map(([x, z]) => at([x, 1, z])).filter(Boolean), roadDark = lineC.filter((c) => c[0] < 80 && c[1] < 80).length;
                const grassC = grassVoxels.map(([x, z]) => at([x + 0.5, 1, z + 0.5])).filter(Boolean), grassGreen = grassC.filter((c) => c[1] > c[0] + 20 && c[1] > c[2] + 20 && c[1] > 60).length;
                ok(`${bk}: the asphalt reads dark under the centreline and the stamp's grass reads green -- the stamp is on the picture`, lineC.length > 100 && roadDark > lineC.length * 0.7 && grassC.length > 100 && grassGreen > grassC.length * 0.6, `${roadDark} of ${lineC.length} centreline pixels dark, ${grassGreen} of ${grassC.length} grass pixels green`);
            }
            if (browser.backends.webgpu.pixels && browser.backends.webgl2.pixels) {
                let agree = 0; const A = browser.backends.webgpu.pixels[2], C = browser.backends.webgl2.pixels[2];
                for (let i = 0; i < W * H; i++) if (Math.abs(A[i * 4] - C[i * 4]) <= 24 && Math.abs(A[i * 4 + 1] - C[i * 4 + 1]) <= 24 && Math.abs(A[i * 4 + 2] - C[i * 4 + 2]) <= 24) agree++;
                ok("the two backends draw the same keyframe (98% of pixels within 24)", agree > W * H * 0.98, `${agree} of ${W * H}`);
            }
            const v = browser.backends.webgl2.video;
            report(`video: ${v && !v.error ? `${v.bytes} bytes of ${v.codec} in ${v.container} (sniffed ${v.sniff}), plays on a TV: ${v.playsOnTv}` : "failed: " + (v && v.error)}; mp4 supported ${browser.backends.webgl2.mp4}, h264 ${browser.backends.webgl2.h264}`);
            ok("*** a WebM is recorded off the canvas here: EBML bytes and a real size ***", v && !v.error && v.bytes > 2000 && v.sniff === "webm" && v.container === "webm");
            ok("*** and the H.264 MP4 a TV plays is refused by this browser, so it is RIG-PENDING by measurement, not by assumption ***", browser.backends.webgl2.h264 === false && v.playsOnTv === false && /RIG-PENDING|rig-pending|libx264/i.test(B.MEASURED_V4528.rigPending + " " + v.note));
            ok("the page builds its own record without a bridge, keyframes it to its own fingerprint, and says NOT REAL TIME", /no bridge: a record built here/.test(browser.page.src) && /= the record's/.test(browser.page.out) && /NOT REAL TIME/.test(browser.page.out) && /keyframe 1 of/.test(browser.page.at), browser.page.out.slice(0, 160));
        }
        if (r.pageErrors && r.pageErrors.filter((e) => !/404/.test(e)).length) report("page errors: " + r.pageErrors.filter((e) => !/404/.test(e)).slice(0, 3).join(" | "));
    }
}

// ---------------------------------------------------------------------------------------------------------------------------------
sec("5. THE FILES: PNG keyframes and the schematic, written and read back");
{
    if (!browser || !browser.backends.webgpu.pixels || !browser.backends.webgpu.pixels.every((px) => px.length === W * H * 4)) { ok("frames to write", false, "the browser section produced none, or empty ones"); }
    else {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), "swek-race-keyframes-")), row = browser.backends.webgpu;
        const files = row.pixels.map((px, i) => { const f = `keyframe-${String(row.frames[i].tick).padStart(5, "0")}.png`; fs.writeFileSync(path.join(dir, f), encodePNG(W, H, px)); return f; });
        const sizes = files.map((f) => fs.statSync(path.join(dir, f)).size);
        report(`${files.length} PNGs in ${dir}: ${sizes.join(", ")} bytes`);
        // sabotage D (v4528): an IHDR that lied about its colour type made decodePNG THROW, and the first draft let the throw end
        // the gate with no FAIL line. A picture that does not decode is a red by name.
        let decodeErr = null; const decoded = files.map((f) => { try { return decodePNG(fs.readFileSync(path.join(dir, f))); } catch (e) { decodeErr = decodeErr || e.message; return null; } });
        ok("*** every keyframe decodes back to the bytes the device read back ***", decoded.every((d, i) => d && d.width === W && d.height === H && d.channels === 4 && Buffer.compare(Buffer.from(d.data), Buffer.from(row.pixels[i])) === 0), decodeErr || "");
        ok("  the PNGs are real files a fifth of the raw size or smaller", sizes.every((s) => s > 500 && s < W * H * 4 / 5));
        const picked = PICK.map((i) => kf.frames[i]), rendered = row.frames.map((f, i) => ({ tick: f.tick, hash: f.hash }));
        const man = B.keyframeManifest(rec, picked, rendered, { every: 30, files, W, H });
        fs.writeFileSync(path.join(dir, "keyframes.json"), JSON.stringify(man, null, 1));
        ok("  the schematic names each file with its pixel hash, the ticks, the seconds, every pose, and the record's fingerprint, and says NOT REAL TIME", man.kind === "swek-race-keyframes" && man.fingerprint === rec.fingerprint && man.keyframes.length === files.length && man.keyframes.every((k, i) => k.file === files[i] && k.pixelHash === rendered[i].hash && k.tick === picked[i].tick && k.poses.length === 1) && /NOT REAL TIME/.test(man.note));
        ok("  the manifest is a small file beside the pictures", fs.statSync(path.join(dir, "keyframes.json")).size < 8000);
        fs.rmSync(dir, { recursive: true, force: true });
    }
}

console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nall checks pass");
console.log("unchecked here: the WebM's frames as pictures (the container and its size are measured, its decoded frames are not -- no decoder in node); the H.264 MP4 itself (rig-pending, libx264 on the rig; the refusal here is the measurement); a race of several cars (the record has one; the scene takes N).");
process.exit(fails ? 1 : 0);
