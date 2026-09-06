#!/usr/bin/env node
// WebGLEngine/tools/ship/probeLab-selfcheck.mjs -- v4516
//
// THE SPLAT-PROBES PAGE, AS DATA AND AS A FRAME (Probes 3): render/probeLab.mjs behind splat-probes.html. Section 1, headless: the
// two-tone cloud (warm above the horizon, cool below, by name); the lab's record count splats + probes + 1; every splat record at
// its splat with the marker radius, tone 1 or 2 in the extras and emissive 1; every probe record at its probe with the probe
// radius, tint 0, emissive 0; the mesh record last at the origin; the fleet map 0 for splats and 1 for the rest; the bake's baked
// and filled equal to the fit's open and solid; the HUD line carrying those numbers and nothing invented; the same knobs giving
// the same records twice and a different spacing a different probe count. Section 2, ON BOTH BACKENDS: the two-fleet scene drawn
// from inside the shell (the page's camera); the cull twin sees every record; the mesh's pixels (the CPU ray against the centre
// sphere) read warm above the horizon and cool below; the picture has both tones; the two backends agree.
//
// MEASURED AT v4516: 300 splats, a 9 x 9 x 9 fitted grid of 729 probes with 176 solid and filled and 553 baked from 384 texels each in
// 0.4 s, the box [-1.8, 1.8] from 14,974 occupied voxels; 1,030 records; a spacing of 1.0 gives 125 probes. The frame (200 x 120,
// the page's camera at 1.1 from the origin inside the shell): 12,603 pixels lit on both backends, the cull twin sees 293 of 1,030
// (what is behind the camera is culled), 3,388 mesh pixels keyed with 0 dark, the mesh's top r 227 b 54 against its underside
// r 61 b 220, 3,314 warm and 3,112 cool marker pixels, the two backends 1 pixel apart. THREE CORRECTIONS in the gate's first
// run: the tone hold compared Float32 colours against Float64 constants (0 of 300 matched); the cull hold asked for every record
// from INSIDE the shell (293 is the frustum's share); and the ray key's right vector was negated, which negated up and read the
// mesh upside down (the picture was right, the key was not).
//
// SABOTAGE (v4516): A  the fleet map putting the probes in fleet 0 (the emissive tone markers)   -> 1 red: the probe-record hold (0 of 729);
//                                                                                                    the picture holds do not look at the probes.
//                   B  the splat tone reversed (cool above, warm below)                          -> 3 red: the tone hold and the mesh reading
//                                                                                                    cool above on both backends.
//                   C  the mesh record dropped (radius 0)                                        -> 1 RED THE FIRST TIME: the record hold only --
//                                                                                                    the shell behind the mesh carries the same
//                                                                                                    tonal split, so warm-above stayed green. A
//                                                                                                    hold that every keyed mesh pixel is lit was
//                                                                                                    added: 3 red (2,040 dark of 3,388).
//                   D  the HUD reporting the grid's total as the baked count                     -> 1 red: the HUD hold.
//                   Each restored and the baseline re-run: 0 red.
//
// Run: node tools/ship/probeLab-selfcheck.mjs      (~20 s)
"use strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runInEngineOrigin, webgpuSkipReason } from "./webgpuHarness.mjs";
import { LAB, TONES, TINTS, labCloud, probeLab, labHud } from "../../render/probeLab.mjs";
import { EXTRA_FLOATS, cullLodCpu } from "../../render/gpuDriven.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (label, cond, detail) => { if (!cond) fails++; console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "   " + detail : ""}`); };
const report = (s) => console.log(`  ----  ${s}`);
const sec = (s) => console.log("\n" + s);

// ---------------------------------------------------------------------------------------------------------------------------------
sec("1. headless: the cloud, the records, the fleets, the HUD");
const lab = probeLab();
{
    const { cloud, colours, tone } = labCloud();
    let warmAbove = 0, coolBelow = 0, wrong = 0;
    for (let i = 0; i < cloud.count; i++) { const up = cloud.positions[i * 3 + 1] > 0, c = [colours[i * 3], colours[i * 3 + 1], colours[i * 3 + 2]].join(), f32 = (t) => t.map(Math.fround).join(); if (up && c === f32(TONES.warm) && tone[i] === 1) warmAbove++; else if (!up && c === f32(TONES.cool) && tone[i] === 2) coolBelow++; else wrong++; }
    ok("every splat above the horizon is warm (tone 1) and every one below cool (tone 2)", wrong === 0 && warmAbove > 100 && coolBelow > 100, `${warmAbove} warm, ${coolBelow} cool`);
    ok("TINTS is [warm, cool] so tint 1 is warm and tint 2 cool in the lit chain", TINTS[0] === TONES.warm && TINTS[1] === TONES.cool);
    const N = lab.counts.splats, P = lab.counts.probes;
    ok(`the lab has splats + probes + 1 records: ${N} + ${P} + 1 = ${lab.count}`, lab.count === N + P + 1 && lab.records.length === lab.count * 4 && lab.extras.length === lab.count * EXTRA_FLOATS && lab.fleetOf.length === lab.count);
    let sOk = 0; for (let i = 0; i < N; i++) { const r = i * 4, e = i * EXTRA_FLOATS; if (lab.records[r] === lab.cloud.positions[i * 3] && lab.records[r + 1] === lab.cloud.positions[i * 3 + 1] && lab.records[r + 2] === lab.cloud.positions[i * 3 + 2] && lab.records[r + 3] === Math.fround(LAB.splatMarker) && lab.extras[e + 1] === lab.tone[i] && lab.extras[e + 3] === 1 && lab.fleetOf[i] === 0) sOk++; }
    ok("every splat record sits at its splat with the marker radius, its tone and emissive 1, in fleet 0", sOk === N, `${sOk} of ${N}`);
    let pOk = 0; for (let p = 0; p < P; p++) { const i = N + p, r = i * 4, e = i * EXTRA_FLOATS; if (lab.records[r] === lab.grid.positions[p * 3] && lab.records[r + 1] === lab.grid.positions[p * 3 + 1] && lab.records[r + 2] === lab.grid.positions[p * 3 + 2] && lab.records[r + 3] === Math.fround(LAB.probeRadius) && lab.extras[e + 1] === 0 && lab.extras[e + 3] === 0 && lab.fleetOf[i] === 1) pOk++; }
    ok("every probe record sits at its probe with the probe radius, tint 0 and emissive 0, in fleet 1", pOk === P, `${pOk} of ${P}`);
    const m = (lab.count - 1) * 4;
    ok("the last record is the mesh at the origin with the mesh radius, in fleet 1", lab.records[m] === 0 && lab.records[m + 1] === 0 && lab.records[m + 2] === 0 && lab.records[m + 3] === Math.fround(LAB.meshRadius) && lab.fleetOf[lab.count - 1] === 1);
    ok("the bake's baked and filled are the fit's open and solid, and they sum to the probes", lab.bake.baked === lab.fit.open && lab.bake.filled === lab.fit.solid && lab.fit.open + lab.fit.solid === P, `${lab.bake.baked} baked, ${lab.bake.filled} filled of ${P}`);
    const hud = labHud(lab);
    report(hud);
    ok("the HUD names the probe count, the grid, the solid count, the baked count, the texels per probe, the box and the splat count", hud.includes(`${P} probes (${lab.grid.counts.join(" x ")})`) && hud.includes(`${lab.fit.solid} solid`) && hud.includes(`${lab.bake.baked} baked from ${LAB.faceSize * LAB.faceSize * 6} texels`) && hud.includes(`${lab.fit.box.occupied} occupied`) && hud.includes(`${N} splats`) && hud.includes(lab.fit.box.min[0].toFixed(2)));
    const again = probeLab();
    ok("the same knobs give the same records, extras and packed volume twice", again.records.every((v, i) => v === lab.records[i]) && again.extras.every((v, i) => v === lab.extras[i]) && again.packed.data.every((v, i) => v === lab.packed.data[i]));
    const coarse = probeLab({ spacing: 1 });
    ok("a spacing of 1 gives fewer probes than 0.5 and the same splats", coarse.counts.probes < lab.counts.probes / 4 && coarse.counts.splats === lab.counts.splats, `${coarse.counts.probes} at 1.0, ${lab.counts.probes} at 0.5`);
    ok("the packed volume is the fitted grid's", lab.packed.counts.join() === lab.grid.counts.join() && lab.packed.data.length === 7 * P * 4);
}

// ---------------------------------------------------------------------------------------------------------------------------------
sec("2. ON BOTH BACKENDS: the page's frame from inside the shell");
{
    const skip = webgpuSkipReason();
    if (skip) { console.log(`  SKIP  ${skip}`); report("*** NOT A PASS. ***"); fails++; }
    else {
        const W = 200, H = 120, FOV = 1.0, R = LAB.eyeDist, yaw = 0.4, pitch = 0.15;
        const eye = [Math.sin(yaw) * Math.cos(pitch) * R, Math.sin(pitch) * R, Math.cos(yaw) * Math.cos(pitch) * R];
        const r = await runInEngineOrigin({ engineRoot: ENG, args: { W, H, FOV, eye, records: Array.from(lab.records), extras: Array.from(lab.extras), fleetOf: Array.from(lab.fleetOf), packed: { ...lab.packed, data: Array.from(lab.packed.data) } }, script: `async (a) => {
            const { requestDevice } = await import("/gfx/device.js");
            const G = await import("/render/gpuDriven.mjs");
            const { labFleets } = await import("/render/probeLab.mjs");
            const { W, H, FOV, eye } = a; const out = {};
            for (const backend of ["webgpu", "webgl2"]) {
                const cv = document.createElement("canvas"); cv.width = W; cv.height = H;
                const dev = await requestDevice(cv, { backend, offscreen: backend === "webgpu" });
                const errs = []; if (dev.gpu && dev.gpu.addEventListener) dev.gpu.addEventListener("uncapturederror", (e) => errs.push(String(e.error && e.error.message).slice(0, 300)));
                const lab = { packed: { ...a.packed, data: Float32Array.from(a.packed.data) } };
                const { fleets } = labFleets(dev, lab);
                const sc = G.makeGpuDrivenScene(dev, { fleets, fleetOf: Uint32Array.from(a.fleetOf), thresholds: [], records: Float32Array.from(a.records), headings: Float32Array.from(a.extras) });
                const cam = { viewProj: G.multiply(G.perspective(FOV, W / H, 0.05, 50), G.lookAt(eye, [0, 0, 0])), eye };
                const fr = sc.frame({ ...cam, read: true, clear: [0, 0, 0, 1] }), f = await fr.pixels;
                out[backend] = { path: sc.path, errs, pixels: Array.from(f.pixels), uniforms: Array.from(fr.uniforms || []) };
                dev.destroy();
            }
            return out;
        }` });
        ok("both backends built the two-fleet scene and drew the frame", r.ok && r.result && r.result.webgpu && r.result.webgl2 && r.result.webgpu.errs.length === 0, r.ok ? (r.result.webgpu.errs || []).join(" | ").slice(0, 300) : (r.reason || r.error || (r.pageErrors || []).join(" | ")).slice(0, 400));
        if (r.ok && r.result.webgpu && r.result.webgl2) {
            // the CPU ray against the centre sphere, through the page's camera: forward = -eye normalised, right and up from lookAt's frame
            const fwd = [-eye[0], -eye[1], -eye[2]], fl = Math.hypot(...fwd); fwd[0] /= fl; fwd[1] /= fl; fwd[2] /= fl;
            // right = normalize(cross(fwd, worldUp)) = (-fwd.z, 0, fwd.x); up = cross(right, fwd). (The first draft negated right, which
            // negates up too and mirrors the key top for bottom -- the picture was right and the key was upside down.)
            const right = [-fwd[2], 0, fwd[0]], rl = Math.hypot(...right); right[0] /= rl; right[1] /= rl; right[2] /= rl;
            const up = [right[1] * fwd[2] - right[2] * fwd[1], right[2] * fwd[0] - right[0] * fwd[2], right[0] * fwd[1] - right[1] * fwd[0]];
            const t = Math.tan(FOV / 2), RAD = LAB.meshRadius, hits = [];
            for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
                const sx = (x + 0.5 - W / 2) / (H / 2) * t, sy = -(y + 0.5 - H / 2) / (H / 2) * t;
                const d = [fwd[0] + right[0] * sx + up[0] * sy, fwd[1] + right[1] * sx + up[1] * sy, fwd[2] + right[2] * sx + up[2] * sy], dl = Math.hypot(...d); d[0] /= dl; d[1] /= dl; d[2] /= dl;
                const b = 2 * (eye[0] * d[0] + eye[1] * d[1] + eye[2] * d[2]), c = eye[0] ** 2 + eye[1] ** 2 + eye[2] ** 2 - RAD * RAD, disc = b * b - 4 * c; if (disc < 0) continue;
                const s = (-b - Math.sqrt(disc)) / 2, hit = [eye[0] + s * d[0], eye[1] + s * d[1], eye[2] + s * d[2]];
                // 1.5 px inside the limb: the ray's closest approach well under the radius
                const tca = -(eye[0] * d[0] + eye[1] * d[1] + eye[2] * d[2]), dist2 = eye[0] ** 2 + eye[1] ** 2 + eye[2] ** 2 - tca * tca; if (dist2 > (RAD * 0.9) ** 2) continue;
                hits.push({ px: y * W + x, ny: hit[1] / RAD });
            }
            for (const bk of ["webgpu", "webgl2"]) {
                const f = r.result[bk], px = f.pixels; let lit = 0; for (let p = 0; p < W * H; p++) if (px[p * 4] + px[p * 4 + 1] + px[p * 4 + 2] > 24) lit++;
                const u = f.uniforms.length ? cullLodCpu(lab.records, Float32Array.from(f.uniforms), lab.fleetOf, lab.extras).visible : -1;
                report(`${bk} (${f.path}): ${lit} of ${W * H} pixels lit, ${hits.length} mesh pixels keyed, the cull twin sees ${u} of ${lab.count} (the camera is INSIDE the shell: what is behind it is culled)`);
                ok(`*** ${bk}: the cull twin sees a frustum's worth of the records from inside the shell (a fifth to four fifths) and the frame is lit ***`, u > lab.count * 0.2 && u < lab.count * 0.8 && lit > W * H * 0.2);
                // the mesh's keyed pixels are ALL lit: the shell behind the mesh has black gaps between its markers, so a missing mesh
                // (sabotage C's first run: the backdrop carries the same tonal split and the warm/cool hold stayed green) shows as dark pixels here
                let dark = 0; for (const h of hits) if (px[h.px * 4] + px[h.px * 4 + 1] + px[h.px * 4 + 2] <= 24) dark++;
                ok(`  ${bk}: every keyed mesh pixel is lit (the mesh is there, not the shell's gaps behind it)`, dark === 0 && hits.length > 1000, `${dark} dark of ${hits.length}`);
                const top = hits.filter((h) => h.ny > 0.5), bot = hits.filter((h) => h.ny < -0.5), avg = (list, c) => list.reduce((s, h) => s + px[h.px * 4 + c], 0) / Math.max(1, list.length);
                ok(`  ${bk}: the mesh's pixels read warm above the horizon and cool below`, top.length > 50 && bot.length > 50 && avg(top, 0) > avg(bot, 0) + 40 && avg(bot, 2) > avg(top, 2) + 40, `top r ${avg(top, 0).toFixed(0)} b ${avg(top, 2).toFixed(0)} (${top.length} px); bottom r ${avg(bot, 0).toFixed(0)} b ${avg(bot, 2).toFixed(0)} (${bot.length} px)`);
                let warm = 0, cool = 0; for (let p = 0; p < W * H; p++) { const R_ = px[p * 4], B_ = px[p * 4 + 2]; if (R_ > 200 && B_ < 60) warm++; else if (B_ > 200 && R_ < 60) cool++; }
                ok(`  ${bk}: the splat markers put both tones on the picture at full colour (emissive)`, warm > 100 && cool > 100, `${warm} warm, ${cool} cool pixels`);
            }
            let po = 0; const A = r.result.webgpu.pixels, B = r.result.webgl2.pixels; for (let p = 0; p < W * H; p++) if (Math.abs(A[p * 4] - B[p * 4]) > 8 || Math.abs(A[p * 4 + 1] - B[p * 4 + 1]) > 8 || Math.abs(A[p * 4 + 2] - B[p * 4 + 2]) > 8) po++;
            ok("  the two backends agree within 8 of 255 on all but edge pixels (fewer than 3 %)", po < W * H * 0.03, `${po} apart`);
        }
        if (r && r.pageErrors && r.pageErrors.length) report("page errors: " + r.pageErrors.slice(0, 3).join(" | "));
    }
}

console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nall checks pass");
console.log("unchecked here: the exact shade of the mesh (probeLit's gate holds the sampler pixel for pixel); the page's drag camera (eyeballed); a loaded splat scene (the lab bakes the shell).");
process.exit(fails ? 1 : 0);
