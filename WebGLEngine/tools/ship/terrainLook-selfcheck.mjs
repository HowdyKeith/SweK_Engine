#!/usr/bin/env node
// WebGLEngine/tools/ship/terrainLook-selfcheck.mjs -- v4481 (git terrain, step 3)
//
// GRADES THE TERRAIN'S LOOKS AND ITS WATER: render/gpuTerrain.mjs colours a fragment by its texel's Worley biome (look 1,
// the two biomes' colours lerped by the blend) or by the treemap's language biome (look 2), times the chunk's shade,
// in both languages; and a lake bed's texels (alpha = 1) are WATER_COLOUR composited over the Worley colour under
// either look. The CPU twin terrainColourAt reads the same bytes to the same colour, and waterOver is the lake's twin.
//
// *** A FLAT WATER PLANE WAS TRIED FIRST AND THIS GATE MEASURED IT WRONG. *** One sheet at the level that covers every
// lake bed sat at 0.80 and put 39 of 64 dry chunks under water, because a treemap's lakes lie at their own landmass's
// height. Each lake is flat at its own level already, so the water went into the fragment per lake texel and the
// plane is gone. The gate kept the shape of that finding: dry texels must read the plain twin, lake texels the water.
//
// THE KEY IS PIXEL AGAINST TWIN, on both backends, at every chunk: the treemap landing of krbn (233 files, 12 lakes),
// its biomes painted by the f32 twin, drawn from straight above at 512 px; the sample is the CENTRE of the chunk's
// centre texel (a chunk centre sits ON a texel boundary, and a half-pixel is 0.012 units against a texel half-width
// of 0.031), and the pixel must be the twin's colour within 3 levels under looks 0, 1 and 2. Look 0 stays the v4300
// readout (red = the centre texel's height byte), which tools/ship/gpuTerrain-selfcheck.mjs holds.
//
// SABOTAGE (v4481), each applied, run, restored byte for byte:
//   A  gpuTerrain: the WGSL lerp's blend inverted (mix(B, A, t))        -> exit=1, 5 red: look 1 on WebGPU at worst 87, look 2 at 24 (the water rides
//                                                                         on the Worley colour), the lake and dry rows, and the backends parting at 37 of 64
//   B  gpuTerrain: waterOver adding the water without fading the bed    -> exit=1, 7 red: the twin's own composition, and looks 1 and 2 and the lake rows on
//                                                                         BOTH backends at worst 113 -- the picture right, the twin wrong, red either way
//   C  orrery-gpu.html: the look select dropped from the bind          -> exit=1, 1 red: the page's wiring
//
// Run: node tools/ship/terrainLook-selfcheck.mjs      (~6 s: one browser, two backends, three looks)
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runInEngineOrigin, webgpuSkipReason } from "./webgpuHarness.mjs";
import * as T from "../../render/gpuTerrain.mjs";
import * as B from "../../render/bodyTerrain.mjs";
import * as W from "../../render/worleyWgsl.mjs";
import { BIOMES } from "../../world/worleyBiomes.js";
import { BIOME_ORDER } from "../../world/repoHeightfield.js";
import { validateWgsl } from "../../render/wgslSpec.mjs";
import { checkHostUniforms } from "../../render/wgslLayout.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
let fails = 0;
const ok = (c, name, detail) => {
    console.log(`  ${c ? "PASS" : "FAIL"}${c ? "  " : "  !! "}${name}${detail ? "   " + detail : ""}`);
    if (!c) fails++;
};
const sec = (t) => console.log("\n" + t);
const raw = JSON.parse(fs.readFileSync(path.join(ENG, "orrery.json"), "utf8"));
const body = raw.bodies.find((b) => b.name === "krbn");
const SEED = 0x5eed1234;

// ---------------------------------------------------------------------------------------------------------
sec("1. THE PALETTES ARE THE SHIPPED TABLES', THE SHADERS CARRY THEM, AND THE TWIN READS THE BYTES");
// ---------------------------------------------------------------------------------------------------------
{
    ok(Object.keys(T.WORLEY_COLOURS).length === 8 && T.WORLEY_COLOURS[BIOMES.jungle.id] === BIOMES.jungle.color, "the Worley palette is worleyBiomes.BIOMES's colours by id, not retyped");
    ok(Object.keys(T.LANGUAGE_COLOURS).length === BIOME_ORDER.length && T.LANGUAGE_COLOURS[1][2] === T.WATER_COLOUR[2] && T.LANGUAGE_COLOURS[2] === BIOMES[BIOME_ORDER[1]].color, "the language palette follows repoHeightfield.BIOME_ORDER + 1, index 1 the water colour");
    ok(validateWgsl(T.TERRAIN_WGSL).length === 0 && checkHostUniforms(T.TERRAIN_WGSL, T.terrainPipelineDesc().uniforms).ok && /fn worleyColour/.test(T.TERRAIN_WGSL) && /fn languageColour/.test(T.TERRAIN_WGSL) && /vec3 worleyColour/.test(T.TERRAIN_FRAGMENT_GLSL),
       "TERRAIN_WGSL validates with `look` in its struct, and both languages carry both palettes as if-chains");
    ok(T.TERRAIN_WGSL.includes("if (i == 8)") && T.TERRAIN_FRAGMENT_GLSL.includes("if (i == 9)"), "  eight Worley branches and nine language branches");
    ok(T.TERRAIN_WGSL.includes("if (a == 1)") && T.TERRAIN_FRAGMENT_GLSL.includes("if (a == 1)") && T.TERRAIN_WGSL.includes(T.WATER_COLOUR[3].toFixed(6)) && typeof T.WATER_WGSL === "undefined",
       "a lake bed (alpha 1) is water over the Worley colour in BOTH fragment stages, at WATER_COLOUR's opacity -- and no plane pipeline exists any more");
    // the twin on a hand-made field: one texel, known bytes
    const P = { originX: 0, originZ: 0, extent: 1, heightScale: 1 };
    const f = { width: 1, height: 1, data: Uint8Array.from([128, 5 * 16 + 6, 128, 2]) };
    const sh = T.shadeAtTexel(f, P, 0, 0, T.LIGHT);
    const c1 = T.terrainColourAt(f, P, 0, 0, T.LIGHT, T.LOOK.worley), A = BIOMES.forest.color, Bc = BIOMES.desert.color;
    ok(Math.abs(c1[0] - (A[0] + (Bc[0] - A[0]) * (128 / 255)) * sh) < 1e-12, "look 1: green 5*16+6 and blue 128 is forest lerped halfway to desert, times the shade", c1.map((v) => v.toFixed(3)).join(","));
    const c2 = T.terrainColourAt(f, P, 0, 0, T.LIGHT, T.LOOK.language);
    ok(Math.abs(c2[1] - BIOMES.forest.color[1] * sh) < 1e-12, "look 2: alpha 2 is BIOME_ORDER[1] = forest, times the shade");
    const c0 = T.terrainColourAt(f, P, 0, 0, T.LIGHT, T.LOOK.height);
    ok(Math.abs(c0[0] - 128 / 255) < 1e-12 && Math.abs(c0[1] - sh) < 1e-12, "look 0: the v4300 readout, red the height byte and green the shade");
    const wo = T.waterOver([1, 0, 0]);
    ok(Math.abs(wo[0] - (1 * (1 - T.WATER_COLOUR[3]) + T.WATER_COLOUR[0] * T.WATER_COLOUR[3])) < 1e-12 && wo[2] > wo[0] * 0.5, "waterOver composes premultiplied water over a ground colour");
    const lake = { width: 1, height: 1, data: Uint8Array.from([128, 5 * 16 + 6, 128, 1]) };
    const l1 = T.terrainColourAt(lake, P, 0, 0, T.LIGHT, T.LOOK.worley), l2 = T.terrainColourAt(lake, P, 0, 0, T.LIGHT, T.LOOK.language);
    ok(l1.every((v, k) => Math.abs(v - T.waterOver(c1)[k]) < 1e-12) && l2.every((v, k) => Math.abs(v - l1[k]) < 1e-12), "a lake texel is waterOver(the Worley colour) under look 1 AND look 2 -- the same water whichever look");
}

// ---------------------------------------------------------------------------------------------------------
sec("2. ON BOTH BACKENDS: at every chunk the pixel IS the twin's colour, under both looks, dry and under water");
// ---------------------------------------------------------------------------------------------------------
const skip = webgpuSkipReason();
if (skip) { console.log(`  SKIP  ${skip}`); fails++; }
else {
    const N = 512, SIDE = 8;
    const bt = B.landingFor(body, "treemap");
    W.paintField(bt.field, W.fieldCpuF32({ originX: bt.params.originX, originZ: bt.params.originZ, extent: bt.params.extent, size: bt.field.width, cellScale: bt.params.extent / 4, seed: SEED }), (i) => bt.repo.biomes[i] + 1);
    let lakeTexels = 0; for (let i = 0; i < bt.field.width * bt.field.height; i++) if (bt.field.data[i * 4 + 3] === 1) lakeTexels++;
    ok(bt.repo.lakes.length >= 5 && lakeTexels > 0, `the treemap has water: ${bt.repo.lakes.length} data files as lakes, and with the unlaid margin as sea, ${lakeTexels} of ${bt.field.width * bt.field.height} texels carry alpha 1`);
    // the samples: the centre of each chunk's centre texel (the chunk centre is a texel boundary; its texel is the one the shader shades by)
    const texel = bt.params.extent / bt.field.width, samples = [];
    for (let j = 0; j < SIDE; j++) for (let i = 0; i < SIDE; i++) {
        const c0x = bt.params.originX + (i + 0.5) * bt.params.extent / SIDE, c0z = bt.params.originZ + (j + 0.5) * bt.params.extent / SIDE;
        const ct = T.texelOf(bt.field, bt.params, c0x, c0z);
        const cx = bt.params.originX + (ct[0] + 0.5) * texel, cz = bt.params.originZ + (ct[1] + 0.5) * texel;
        const lake = bt.field.data[(ct[1] * bt.field.width + ct[0]) * 4 + 3] === 1;
        samples.push({ i, j, x: cx, z: cz, y: bt.heightAt(cx, cz) * bt.params.heightScale, tx: ct[0], tz: ct[1], lake,
                       want: [0, 1, 2].map((m) => T.terrainColourAt(bt.field, bt.params, ct[0], ct[1], T.LIGHT, m, ct)) });
    }
    const r = await runInEngineOrigin({ engineRoot: ENG, args: { N, SIDE, field: { width: bt.field.width, height: bt.field.height, data: Array.from(bt.field.data) }, params: bt.params, samples: samples.map((s) => ({ x: s.x, y: s.y, z: s.z })) }, script: `async (a) => {
        const G = await import("/render/gpuDriven.mjs"); const T = await import("/render/gpuTerrain.mjs"); const { requestDevice } = await import("/gfx/device.js");
        const field = { width: a.field.width, height: a.field.height, data: Uint8Array.from(a.field.data) };
        const L = { records: T.chunkRecords(a.params, a.SIDE), params: T.terrainParams(a.params) };
        const eye = [0, 40, 0.01], viewProj = G.multiply(G.perspective(0.3, 1, 0.1, 100), G.lookAt(eye, [0, 0, 0]));
        const out = {};
        for (const backend of ["webgpu", "webgl2"]) {
            const cv = document.createElement("canvas"); cv.width = a.N; cv.height = a.N;
            const dev = await requestDevice(cv, { backend, offscreen: backend === "webgpu" });
            const tex = dev.texture({ width: field.width, height: field.height, data: field.data, nearest: true });
            let mode = 0;
            const sc = G.makeGpuDrivenScene(dev, { lods: [{ name: "coarse", mesh: T.skirtedQuadMesh(1) }, { name: "fine", mesh: T.skirtedQuadMesh(6) }], thresholds: [0.02], records: L.records, pipeline: T.terrainPipelineDesc(),
                bind: (pass) => { pass.uniform("terrain", L.params); pass.uniform("light", new Float32Array(T.LIGHT)); pass.uniform("look", T.lookParams(mode)); pass.texture("heightTex", tex, 0); } });
            const shoot = async (m) => { mode = m; const f = sc.frame({ viewProj, eye, read: true, clear: [0, 0, 0, 1] }); const px = (await f.pixels).pixels;
                return a.samples.map((s) => { const q = G.project(viewProj, [s.x, s.y, s.z]); const X = Math.floor((q[0] * 0.5 + 0.5) * a.N), Y = Math.floor((1 - (q[1] * 0.5 + 0.5)) * a.N); const o = (Y * a.N + X) * 4; return [px[o], px[o + 1], px[o + 2]]; }); };
            out[backend] = { path: sc.path, looks: [await shoot(0), await shoot(1), await shoot(2)] };
            sc.destroy(); tex.destroy(); dev.destroy();
        }
        return out;
    }` });
    ok(r.ok && r.result.webgpu && r.result.webgl2, "the harness ran both backends", r.ok ? "" : (r.reason || (r.pageErrors || []).join("; ")));
    if (r.ok) {
        const to255 = (c) => c.map((v) => Math.round(Math.max(0, Math.min(1, v)) * 255));
        const worstOf = (got, want) => { let w = 0, at = -1; got.forEach((g, k) => { const d = Math.max(...[0, 1, 2].map((c) => Math.abs(g[c] - want[k][c]))); if (d > w) { w = d; at = k; } }); return { w, at }; };
        const names = ["look 0 (the v4300 height readout)", "look 1 (Worley: the two biomes lerped by the blend, times the shade)", "look 2 (language: the treemap's biome per file)"];
        for (const b of ["webgpu", "webgl2"]) {
            const R = r.result[b];
            for (const m of [1, 2, 0]) {
                const wm = worstOf(R.looks[m], samples.map((s) => to255(s.want[m])));
                ok(wm.w <= 3, `${m ? "*** " : "  "}${b}: ${names[m]} -- every chunk's pixel is the twin's colour within 3 levels${m ? " ***" : ""}`, `worst ${wm.w} at chunk ${wm.at}${wm.w > 3 ? ` got ${R.looks[m][wm.at]} want ${to255(samples[wm.at].want[m])}` : ""}`);
            }
            const lakes = samples.map((s, k) => k).filter((k) => samples[k].lake), dry = samples.map((s, k) => k).filter((k) => !samples[k].lake);
            const wl = worstOf(lakes.map((k) => R.looks[1][k]), lakes.map((k) => to255(T.waterOver(samples[k].want[1].map((v, c) => v)))));   // want[1] is already water for a lake; waterOver again would double it, so compare against the twin's own answer
            ok(lakes.length >= 1 && worstOf(lakes.map((k) => R.looks[1][k]), lakes.map((k) => to255(samples[k].want[1]))).w <= 3, `*** ${b}: the ${lakes.length} chunks centred on lake beds read WATER over the Worley colour ***`);
            ok(dry.length >= 1 && worstOf(dry.map((k) => R.looks[1][k]), dry.map((k) => to255(samples[k].want[1]))).w <= 3, `  ${b}: and the ${dry.length} dry chunks read the plain Worley colour -- nothing floods`);
            const distinct = new Set(R.looks[1].map((c) => c.join(","))).size;
            ok(distinct >= 6, `CONTROL: ${b}: the Worley look has many colours across the ground (${distinct} distinct at the chunk samples)`);
        }
        let agree = 0; r.result.webgpu.looks[1].forEach((c, k) => { const d = r.result.webgl2.looks[1][k]; if (Math.max(...[0, 1, 2].map((i) => Math.abs(c[i] - d[i]))) <= 2) agree++; });
        ok(agree === samples.length, "the two backends agree at every sample within 2 levels", `${agree} of ${samples.length}`);
    }
    const page = fs.readFileSync(path.join(ENG, "orrery-gpu.html"), "utf8");
    ok(/id="terrainLook"/.test(page) && /pass\.uniform\("look", T\.lookParams\(Number\(document\.getElementById\("terrainLook"\)\.value\)\)\)/.test(page), "orrery-gpu.html binds the look from a select");
    ok(/lakes as water/.test(page) && !/waterPipelineDesc/.test(page), "  and says how many lakes are water; no plane is drawn");
}

console.log(fails ? `\nFAIL -- ${fails} check(s)` : "\nall checks pass");
console.log("unchecked here: reflections, waves, a shoreline, which the water does not claim; and the biome BLEND across a border under look 2, which has none (a file is one language).");
process.exit(fails ? 1 : 0);
