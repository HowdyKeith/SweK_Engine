#!/usr/bin/env node
// WebGLEngine/tools/ship/litSphere-selfcheck.mjs -- v4473
//
// GATES render/litSphere.mjs: the sphere mesh with normals, the lit pipeline on BOTH real backends, and the CPU
// shading twin -- the first of the 3D orrery's six steps (docs/TSL-ROADMAP.md step 9).
//
// THE KEY IS A SPHERE THAT WAS NEVER RENDERED. For a known camera (eye on +z, looking at the origin) and a known
// light, the point under each covered pixel is the ray's first hit on the analytic sphere, and its shade is
// shadeAt()'s answer. Every covered pixel well inside the silhouette is held to that number on WebGPU and on
// WebGL2 -- so a backend lighting with the wrong sign, the wrong ambient or a zeroed normal is wrong against the
// arithmetic, not merely different from its twin (the deviceBlend lesson: both backends can agree on a mistake).
//
// THE CONTROLS: the same sphere drawn by gpuDriven's flat pipeline has ONE intensity level (no normal reaches it);
// the same sphere with extra.w = 1 (emissive) is flat again under the lit pipeline; and the silhouette covers
// what a disc of the same radius covers, to a stated fraction, because a sphere seen from anywhere IS a disc.
//
// SABOTAGE (v4473), each applied to render/litSphere.mjs, run, restored byte for byte:
//   A  the WGSL fragment's dot negated (max(0, -dot(...)))   -> exit=1, 4 red: the two stages no longer spell one term; WebGPU's centre
//                                                              pixel 51 with ONE level; the key at mean 158.6/255, worst 204; and the two
//                                                              backends part (25176 of 25600 within 2) -- WebGL2 was left correct
//   B  litPipelineDesc over LAYOUTS.flat                       -> exit=1, 2 red: the descriptor check, and gfx/device.js REFUSING the draw --
//                                                              a 40-byte vertex buffer under a 28-byte layout is caught at encode, by name
//   C  shadeAt's ambient floor dropped (max(0, dot) alone)     -> exit=1, 5 red: three of the twin's own facts, and the key on BOTH
//                                                              backends at mean 10.9/255, worst 24 -- the picture was right and the twin wrong,
//                                                              which the key cannot tell from the reverse, and says so by failing either way
//
// Run: node tools/ship/litSphere-selfcheck.mjs      (2.3-2.9 s over five runs: one browser, two backends)
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runInEngineOrigin, webgpuSkipReason } from "./webgpuHarness.mjs";
import * as G from "../../render/gpuDriven.mjs";
import * as L from "../../render/litSphere.mjs";
import { validateWgsl } from "../../render/wgslSpec.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
let fails = 0;
const ok = (c, name, detail) => {
    console.log(`  ${c ? "PASS" : "FAIL"}${c ? "  " : "  !! "}${name}${detail ? "   " + detail : ""}`);
    if (!c) fails++;
};
const sec = (t) => console.log("\n" + t);

// ---------------------------------------------------------------------------------------------------------
sec("1. THE MESH: a closed unit sphere whose normals are its positions");
// ---------------------------------------------------------------------------------------------------------
{
    for (const n of [1, 2, 3]) {
        const m = L.sphereMesh(n);
        const V = m.positions.length / 3, F = m.indices.length / 3;
        const edges = new Set();
        for (let i = 0; i < F; i++) for (let k = 0; k < 3; k++) { const a = m.indices[i * 3 + k], b = m.indices[i * 3 + (k + 1) % 3]; edges.add(a < b ? a + ":" + b : b + ":" + a); }
        let unit = true, same = true;
        for (let i = 0; i < V; i++) {
            const r = Math.hypot(m.positions[i * 3], m.positions[i * 3 + 1], m.positions[i * 3 + 2]);
            if (Math.abs(r - 1) > 1e-6) unit = false;
            for (let k = 0; k < 3; k++) if (m.normals[i * 3 + k] !== m.positions[i * 3 + k]) same = false;
        }
        ok(V === 10 * 4 ** n + 2 && F === 20 * 4 ** n && V - edges.size + F === 2,
           `sphereMesh(${n}): ${V} vertices, ${F} faces, V - E + F = ${V - edges.size + F}`, "10*4^n+2 and 20*4^n, Euler's 2");
        ok(unit && same, `  every vertex on the unit sphere, and its normal IS its position`);
    }
    const packed = G.packMeshes([L.sphereMesh(2)], G.LAYOUTS.lit);
    ok(packed.missing.length === 0 && packed.stride === 40,
       "packed in LAYOUTS.lit nothing is missing: p, color, n -- 40 bytes a vertex", `missing: [${packed.missing.join(", ")}]`);
    const flat = G.packMeshes([L.sphereMesh(2)], G.LAYOUTS.flat);
    ok(flat.missing.length === 0 && flat.stride === 28,
       "CONTROL: the same mesh packs in the flat layout too (the normals simply do not travel)");
}

// ---------------------------------------------------------------------------------------------------------
sec("2. THE TWIN: shadeAt is the fragment stage's arithmetic");
// ---------------------------------------------------------------------------------------------------------
{
    const light = [0, 0, 6, 0.2];
    const facing = L.shadeAt([0, 0, 1], [0, 0, 0.5], light), away = L.shadeAt([0, 0, -1], [0, 0, -0.5], light);
    const h = Math.SQRT1_2, grazing = L.shadeAt([h, 0, h], [0.5 * h, 0, 0.5 * h], light);   // 45 degrees off the light's axis
    const sixty = L.shadeAt([Math.sin(Math.PI / 3), 0, Math.cos(Math.PI / 3)], [0, 0, 0], light);
    ok(Math.abs(facing - 1) < 1e-12, "a normal toward the light shades 1", facing.toFixed(6));
    ok(Math.abs(away - 0.2) < 1e-12, "a normal away from it shades the AMBIENT floor, not 0", away.toFixed(6));
    ok(grazing < facing && grazing > away, "45 degrees off the axis is between the two", grazing.toFixed(4));
    ok(Math.abs(sixty - (0.2 + 0.8 * Math.cos(Math.PI / 3))) < 1e-9, "at 60 degrees the Lambert term is cos 60 over the ambient floor", sixty.toFixed(6));
    ok(L.shadeAt([0, 0, -1], [0, 0, -0.5], light, 1) === 1 && Math.abs(L.shadeAt([0, 0, -1], [0, 0, -0.5], light, 0.5) - 0.6) < 1e-12,
       "emissive 1 is full colour whatever the light; 0.5 is the mix", "the sun at the centre is the consumer");
    const p = validateWgsl(L.LIT_WGSL);
    ok(p.length === 0 && /\@location\(4\) n: vec3<f32>/.test(L.LIT_WGSL) && /\@location\(5\) extra/.test(L.LIT_WGSL),
       "LIT_WGSL validates and reads the normal at location 4 and the extras at 5 -- the slots layoutBuffers assigns", p.join("; "));
    ok(L.LIT_FRAGMENT_GLSL.includes("max(0.0, dot(normalize(vN), l))") && L.LIT_WGSL.includes("max(0.0, dot(normalize(v.n), l))"),
       "and the two fragment stages spell the same Lambert term");
    const desc = L.litPipelineDesc();
    ok(desc.buffers[0].stride === 40 && desc.buffers[0].attributes.some((a) => a.name === "n" && a.location === 4) && desc.uniforms.length === 2 && desc.uniforms[1].name === "light",
       "litPipelineDesc: the lit layout's two slots and the light uniform after viewProj");
    // v4478 -- tints: a palette baked into both shaders as an if-chain on extra.y
    const tints = L.tintsFromHex(["#9fe6c0", "#ff6b5e", "#33ccff"]);
    ok(tints.length === 3 && Math.abs(tints[1][0] - 1) < 1e-9 && Math.abs(tints[1][1] - 0x6b / 255) < 1e-9 && Math.abs(tints[2][2] - 1) < 1e-9, "tintsFromHex reads #rrggbb into 0..1 channels");
    const tinted = L.litPipelineDesc({ tints });
    ok(validateWgsl(tinted.shaders.wgsl).length === 0 && /if \(i == 3\)/.test(tinted.shaders.wgsl) && /if \(i == 3\)/.test(tinted.shaders.glsl.fragment) && !/if \(i == 4\)/.test(tinted.shaders.wgsl),
       "a three-tint palette is three branches in BOTH languages and no fourth");
    ok((() => { try { L.litPipelineDesc({ tints: new Array(L.MAX_TINTS + 1).fill([0, 0, 0]) }); return false; } catch (e) { return /tints/.test(e.message); } })() &&
       (() => { try { L.tintsFromHex(["red"]); return false; } catch (e) { return /rrggbb/.test(e.message); } })(), "nine tints and a colour name are refused by name");
    ok(L.LIT_WGSL === L.litWgsl(null) && !/if \(i == 1\)/.test(L.LIT_WGSL), "CONTROL: the untinted constant the corpus compiles is the empty chain");
}

// ---------------------------------------------------------------------------------------------------------
sec("3. ON BOTH BACKENDS: the pixels of a rendered sphere against the sphere the twin computes");
// ---------------------------------------------------------------------------------------------------------
const skip = webgpuSkipReason();
if (skip) { console.log(`  SKIP  ${skip}`); fails++; }
else {
    const W = 160, RAD = 0.5, DIST = 6, FOV = Math.PI / 3, AMB = 0.2;
    const r = await runInEngineOrigin({ engineRoot: ENG, args: { W, RAD, DIST, FOV, AMB, BACKENDS: ["webgpu", "webgl2"] }, script: `async (a) => {
        const G = await import("/render/gpuDriven.mjs"); const L = await import("/render/litSphere.mjs"); const { requestDevice } = await import("/gfx/device.js");
        const out = {};
        for (const backend of a.BACKENDS) {
            const cv = document.createElement("canvas"); cv.width = a.W; cv.height = a.W;
            const dev = await requestDevice(cv, { backend, offscreen: backend === "webgpu" });
            const errs = []; if (dev.gpu && dev.gpu.addEventListener) dev.gpu.addEventListener("uncapturederror", (e) => errs.push(String(e.error && e.error.message).slice(0, 200)));
            const eye = [0, 0, a.DIST], light = [0, 0, a.DIST, a.AMB];
            const cam = { viewProj: G.multiply(G.perspective(a.FOV, 1, 0.1, 300), G.lookAt(eye, [0, 0, 0])), eye };
            const shoot = async (mesh, { lit, emissive = 0 } = {}) => {
                const extras = new Float32Array(G.EXTRA_FLOATS); extras[3] = emissive;
                const sc = G.makeGpuDrivenScene(dev, { lods: [{ name: "only", mesh }], thresholds: [], records: Float32Array.from([0, 0, 0, a.RAD]),
                    ...(lit ? { layout: G.LAYOUTS.lit, pipeline: L.litPipelineDesc(), bind: L.litBind(light) } : {}), headings: { cpu: () => extras } });
                const f = await sc.frame({ ...cam, read: true, clear: [0, 0, 0, 1] }).pixels;
                return { px: f.pixels, path: sc.path };
            };
            const WHITE = [1, 1, 1, 1];
            const lit = await shoot(L.sphereMesh(3, WHITE), { lit: true });
            const flat = await shoot(L.sphereMesh(3, WHITE), { lit: false });
            const emis = await shoot(L.sphereMesh(3, WHITE), { lit: true, emissive: 1 });
            const disc = await shoot(G.discMesh(64, WHITE), { lit: false });
            // v4478 -- a tinted, emissive sphere is the palette's colour flat, and index 0 keeps the mesh's own
            const TINTS = [[0.2, 0.4, 0.8], [1.0, 0.42, 0.37]];
            const shootTint = async (idx) => { const extras = new Float32Array(G.EXTRA_FLOATS); extras[1] = idx; extras[3] = 1;
                const sc = G.makeGpuDrivenScene(dev, { lods: [{ name: "only", mesh: L.sphereMesh(3, WHITE) }], thresholds: [], records: Float32Array.from([0, 0, 0, a.RAD]),
                    layout: G.LAYOUTS.lit, pipeline: L.litPipelineDesc({ tints: TINTS }), bind: L.litBind(light), headings: { cpu: () => extras } });
                const f = await sc.frame({ ...cam, read: true, clear: [0, 0, 0, 1] }).pixels; const c = ((a.W / 2) * a.W + a.W / 2) * 4; return [f.pixels[c], f.pixels[c + 1], f.pixels[c + 2]]; };
            const tint = { t0: await shootTint(0), t1: await shootTint(1), t2: await shootTint(2), want: TINTS.map((t) => t.map((v) => Math.round(v * 255))) };
            const covered = (px) => { let c = 0; for (let i = 0; i * 4 < px.length; i++) if (px[i * 4] + px[i * 4 + 1] + px[i * 4 + 2] > 24) c++; return c; };
            const levels = (px) => { const s = new Set(); for (let i = 0; i * 4 < px.length; i++) if (px[i * 4] > 8) s.add(px[i * 4]); return s.size; };
            // THE KEY: for every pixel whose ray hits the sphere at least 1.5 px inside the silhouette, the twin's shade.
            const t = Math.tan(a.FOV / 2); let n = 0, sum = 0, worst = 0, worstAt = -1;
            const limbPx = (a.W / 2) * (a.RAD / (a.DIST * t)) / Math.sqrt(1 - (a.RAD / a.DIST) ** 2);   // the silhouette's radius in pixels (the tangent cone, not the centre's projection)
            for (let y = 0; y < a.W; y++) for (let x = 0; x < a.W; x++) {
                const rx = x + 0.5 - a.W / 2, ry = y + 0.5 - a.W / 2;
                if (Math.hypot(rx, ry) > limbPx - 1.5) continue;
                const d = [rx / (a.W / 2) * t, -ry / (a.W / 2) * t, -1]; const dl = Math.hypot(d[0], d[1], d[2]); d[0] /= dl; d[1] /= dl; d[2] /= dl;
                // |eye + s d|^2 = RAD^2, the nearer root
                const b = 2 * (eye[0] * d[0] + eye[1] * d[1] + eye[2] * d[2]), c = eye[0] ** 2 + eye[1] ** 2 + eye[2] ** 2 - a.RAD * a.RAD;
                const disc2 = b * b - 4 * c; if (disc2 < 0) continue;
                const s = (-b - Math.sqrt(disc2)) / 2;
                const hit = [eye[0] + s * d[0], eye[1] + s * d[1], eye[2] + s * d[2]];
                const nrm = [hit[0] / a.RAD, hit[1] / a.RAD, hit[2] / a.RAD];
                const want = Math.round(255 * L.shadeAt(nrm, hit, light));
                const got = lit.px[(y * a.W + x) * 4];
                const e = Math.abs(got - want); n++; sum += e; if (e > worst) { worst = e; worstAt = y * a.W + x; }
            }
            out[backend] = { path: lit.path, errs, covered: { lit: covered(lit.px), flat: covered(flat.px), disc: covered(disc.px), emissive: covered(emis.px) },
                             levels: { lit: levels(lit.px), flat: levels(flat.px), emissive: levels(emis.px) },
                             centre: lit.px[((a.W / 2) * a.W + a.W / 2) * 4], flatCentre: flat.px[((a.W / 2) * a.W + a.W / 2) * 4],
                             key: { n, mean: n ? sum / n : null, worst, worstAt }, tint, lit: Array.from(lit.px) };
        }
        return out;
    }` });
    if (!r.ok) { ok(false, "the browser ran the scene", r.reason || (r.pageErrors || []).join(" | ")); }
    else {
        const R = r.result;
        for (const b of ["webgpu", "webgl2"]) {
            const o = R[b]; if (!o) { ok(false, `${b}: ran`); continue; }
            ok(o.errs.length === 0, `${b}: no device errors, drew by ${o.path}`, o.errs.join(" | "));
            const ratio = o.covered.lit / Math.max(1, o.covered.disc);
            ok(ratio > 0.94 && ratio < 1.03,
               `${b}: the sphere's silhouette covers what a 64-gon disc covers (a 1280-triangle icosphere's limb is a polygon too)`,
               `sphere ${o.covered.lit}, disc ${o.covered.disc}, ratio ${ratio.toFixed(4)}`);
            ok(o.centre >= 250 && o.levels.lit >= 24,
               `${b}: lit, the centre pixel faces the light (${o.centre}/255) and the sphere carries a gradient of ${o.levels.lit} intensity levels`);
            ok(o.levels.flat === 1 && o.flatCentre === 255,
               `${b}: CONTROL: the same mesh through the flat pipeline is ONE level -- no normal reaches it`, `${o.levels.flat} level(s), centre ${o.flatCentre}`);
            ok(o.levels.emissive === 1 && o.covered.emissive === o.covered.lit,
               `${b}: CONTROL: extra.w = 1 (emissive) makes the lit pipeline flat again, covering the same pixels`, `${o.levels.emissive} level(s)`);
            const tOk = (got, want) => got.every((c, k) => Math.abs(c - want[k]) <= 2);
            ok(tOk(o.tint.t1, o.tint.want[0]) && tOk(o.tint.t2, o.tint.want[1]) && tOk(o.tint.t0, [255, 255, 255]),
               `${b}: tint 1 and 2 paint the palette's colours flat (emissive) and tint 0 keeps the mesh's white`, `${o.tint.t1.join(",")} / ${o.tint.t2.join(",")} / ${o.tint.t0.join(",")}`);
            ok(o.key.n >= 250 && o.key.mean <= 2.0 && o.key.worst <= 8,
               `*** ${b}: ${o.key.n} pixels inside the silhouette against the twin's sphere -- mean error ${o.key.mean == null ? "?" : o.key.mean.toFixed(3)}/255, worst ${o.key.worst} ***`,
               `light at the eye, ambient ${AMB}: the twin says 255 at the centre and ${Math.round(255 * AMB)} at the limb`);
        }
        if (R.webgpu && R.webgl2) {
            let same = 0, worst = 0, n = 0;
            for (let i = 0; i < R.webgpu.lit.length; i += 4) { n++; const d = Math.abs(R.webgpu.lit[i] - R.webgl2.lit[i]); if (d <= 2) same++; if (d > worst) worst = d; }
            ok(same / n > 0.995 && worst <= 24,
               "*** and the two backends agree pixel for pixel ***", `${same}/${n} within 2, worst ${worst} -- both rasterise here on SwiftShader, so this is the harnesses agreeing, not two drivers`);
        }
    }
}

console.log(fails ? `\nFAIL -- ${fails} check(s)` : "\nall checks pass");
console.log("unchecked here: any GPU but this box's software rasteriser; specular, shadows and a second light, which the module does not claim; the orrery page itself, which tools/ship/shippedLadder-selfcheck.mjs reads and which draws these spheres at its own ladder.");
process.exit(fails ? 1 : 0);
