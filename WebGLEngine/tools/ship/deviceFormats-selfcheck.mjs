#!/usr/bin/env node
// WebGLEngine/tools/ship/deviceFormats-selfcheck.mjs -- v4459
//
// GRADES gfx/device.js's TEXTURE FORMATS AND DEPTH STATE BY DRIVING THE SHIPPING MODULE THROUGH BOTH BACKENDS AND
// READING THE UPLOADED BITS BACK OUT OF A SHADER, EXACTLY.
//
// *** UNTIL v4459 device.texture() MADE rgba8unorm OF WHATEVER BYTES IT WAS HANDED, AND THE WebGL2 PIPELINE WROTE
// DEPTH WHATEVER depthWrite SAID. *** The Slug atlas (text/slugAtlas.js) is rgba16float control points and rg16uint
// band headers read with textureLoad, so the WGSL twin (v4457) and the blend state (v4458) still had nothing to
// read. And a translucent overlay wants depthWrite false on both backends; the WebGPU pipeline has honoured it
// since Level 12 and the WebGL2 one had no gl.depthMask at all.
//
// THE KEY IS THE UPLOADED BITS THEMSELVES. Two probe pipelines (render/texelProbe.mjs), both languages, read a texel with textureLoad /
// texelFetch and write its BITS as bytes: the half-float channels through pack2x16float / packHalf2x16, the uint
// channels split into low and high bytes. A half loaded from an rgba16float texture and packed again is the same
// sixteen bits, so the comparison is exact on every byte of every texel, with no tolerance and no model between
// the upload and the readback. The two backends are also diffed against each other, row for row.
//
// *** AND THE ROWS ARE MIRRORED BETWEEN THE BACKENDS, ON PURPOSE, AND THE GATE SAYS SO INSTEAD OF HIDING IT. ***
// The probes fetch the texel at the fragment's own position. WebGPU's position.y counts from the top; GL's
// gl_FragCoord.y counts from the bottom, and the device's readback turns GL's rows over so both pictures have
// row 0 at the top. So the WebGL2 picture's row y holds texel row h-1-y and the WebGPU picture's row y holds
// texel row y. That is v4272's orientation finding again, at the fetch instead of the sample, and the mapping
// is applied by name below rather than absorbed into a "close enough".
//
// DEPTH: two opaque quads through render/gpuDriven.mjs's flat pipeline, the first NEARER with depthWrite false,
// the second farther. With the first writing no depth the second passes the test and the picture is the second's
// colour; with the default (write) it fails and the picture is the first's. depthCompare "always" makes the
// second win regardless. Same scene, both backends, one expected byte per case.
"use strict";

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runInEngineOrigin, webgpuSkipReason } from "./webgpuHarness.mjs";
import { CAPABILITIES, TEXTURE_FORMATS, DEPTH_COMPARES, nullBackend } from "../../gfx/device.js";
import { doubleToHalf } from "./headlessGpu.mjs";
import { floatProbeDesc, uintProbeDesc } from "../../render/texelProbe.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
let fails = 0;
const ok = (label, cond, detail) => { if (!cond) fails++; console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "   " + detail : ""}`); };
const report = (s) => console.log(`  ----  ${s}`);
const read = (rel) => fs.readFileSync(path.join(ENG, rel), "utf8");
const codeOf = (t) => t.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");

const N = 16;

/* The patterns. Half floats from real values (no NaN, no Inf), uints covering the ends of the range. */
function halfPattern(seed) {
    const out = new Uint16Array(N * N * 4);
    let r = seed;
    for (let i = 0; i < out.length; i++) { r = (r * 1103515245 + 12345) & 0x7FFFFFFF; const v = (r / 0x7FFFFFFF) * 8 - 4; out[i] = doubleToHalf(v); }
    out[0] = doubleToHalf(0); out[1] = doubleToHalf(-0.0); out[2] = doubleToHalf(1); out[3] = doubleToHalf(1 / 1024);   // zero, negative zero, one, a subnormal-adjacent
    return out;
}
function uintPattern(seed) {
    const out = new Uint16Array(N * N * 2);
    let r = seed;
    for (let i = 0; i < out.length; i++) { r = (r * 1103515245 + 12345) & 0x7FFFFFFF; out[i] = r & 0xFFFF; }
    out[0] = 0; out[1] = 65535; out[2] = 4096; out[3] = 255; out[4] = 256;
    return out;
}

console.log("\n1. THE FORMATS ARE A TABLE, THE FILTER RULE IS DATA, AND THE REFUSALS ARE BY NAME");
{
    ok("TEXTURE_FORMATS carries rgba8unorm, rgba16float, rg16uint", Object.keys(TEXTURE_FORMATS).join(",") === "rgba8unorm,rgba16float,rg16uint");
    ok("  rg16uint is NOT filterable and the two float formats are", TEXTURE_FORMATS.rg16uint.filterable === false && TEXTURE_FORMATS.rgba16float.filterable === true && TEXTURE_FORMATS.rgba8unorm.filterable === true);
    ok("  row pitch per texel: 4, 8, 4 bytes", TEXTURE_FORMATS.rgba8unorm.bytes === 4 && TEXTURE_FORMATS.rgba16float.bytes === 8 && TEXTURE_FORMATS.rg16uint.bytes === 4);
    for (const b of ["webgpu", "webgl2", "null"]) ok(`CAPABILITIES.${b}.formats lists the three`, Array.isArray(CAPABILITIES[b].formats) && CAPABILITIES[b].formats.length === 3);
    const nb = nullBackend();
    const t = nb.texture({ format: "rg16uint", width: 2, height: 2, data: new Uint16Array(8) });
    ok("the null backend records the format and FORCES nearest on the integer format", t.format === "rg16uint" && t.nearest === true);
    ok("  and leaves a float texture linear unless asked", nb.texture({ format: "rgba16float", width: 2, height: 2, data: new Uint16Array(16) }).nearest === false);
    const refuse = (d) => { try { nb.texture(d); return "no throw"; } catch (e) { return e.message; } };
    ok("*** an unknown format is refused by name, naming the three ***", /unknown texture format "r8unorm"/.test(refuse({ format: "r8unorm" })) && /rgba8unorm, rgba16float, rg16uint/.test(refuse({ format: "r8unorm" })));
    ok("  a `source` with a 16-bit format is refused: a canvas is 8-bit by nature", /8-bit by nature/.test(refuse({ format: "rgba16float", source: { width: 1, height: 1 } })));
    ok("  a render target with a 16-bit format is refused: a target takes the canvas format", /takes the canvas format/.test(refuse({ format: "rg16uint", render: true })));
    ok("the null pipeline records depthWrite and depthCompare, defaulting to write and less",
        nb.pipeline({}).depthWrite === true && nb.pipeline({}).depthCompare === "less" && nb.pipeline({ depthWrite: false, depthCompare: "always" }).depthWrite === false);
    let msg = ""; try { nb.pipeline({ depthCompare: "lt" }); } catch (e) { msg = e.message; }
    ok("  and an unknown depthCompare is refused, naming the eight", /unknown depthCompare "lt"/.test(msg) && DEPTH_COMPARES.length === 8);
    const dev = codeOf(read("gfx/device.js"));
    ok("the WebGL2 backend uploads through the table's enums and forces NEAREST on a non-filterable format", /gl\[G\.internal\]/.test(dev) && /!F\.filterable\) \? gl\.NEAREST/.test(dev));
    ok("  and sets gl.depthMask and gl.depthFunc at use()", /gl\.depthMask\(p\.depthWrite !== false\)/.test(dev) && /gl\.depthFunc\(/.test(dev));
    ok("  the WebGPU backend creates the texture in the named format and writes rows at the table's pitch", /format: d\.render \? fmt : format/.test(dev) && /bytesPerRow: w \* F\.bytes/.test(dev));
}

console.log("\n2. THE BITS COME BACK OUT, EXACTLY, ON BOTH BACKENDS");
let result = null;
{
    const skip = webgpuSkipReason();
    if (skip) {
        console.log(`  SKIP  ${skip}`);
        report("*** NOT A PASS. *** Section 1 reads source and drives the recorder. Only this one uploads a format to a real device.");
        fails++;
    } else {
        const halfA = halfPattern(7), uintA = uintPattern(11), uintB = uintPattern(23);
        const r = await runInEngineOrigin({ engineRoot: ENG, args: { N, halfA: Array.from(halfA), uintA: Array.from(uintA), uintB: Array.from(uintB) }, script: `async (a) => {
            const { requestDevice } = await import("/gfx/device.js");
            const { renderPipelineDesc } = await import("/render/gpuDriven.mjs");
            const { floatProbeDesc, uintProbeDesc } = await import("/render/texelProbe.mjs");
            const N = a.N;
            const out = {};
            for (const backend of ["webgpu", "webgl2"]) {
                const cv = document.createElement("canvas"); cv.width = N; cv.height = N;
                const dev = await requestDevice(cv, { backend, offscreen: backend === "webgpu" });
                const o = { backend: dev.backend };
                // --- rgba16float, both halves of the texel ---
                const ft = dev.texture({ format: "rgba16float", width: N, height: N, data: new Uint16Array(a.halfA) });
                const fp = dev.pipeline(floatProbeDesc());
                for (const pair of [0, 1]) {
                    const fr = await dev.frame(({ pass }) => { pass.clear([0, 0, 0, 1]); pass.use(fp); pass.uniform("pair", pair); pass.texture("tex", ft); pass.draw(3); }, { read: true });
                    o["half" + pair] = Array.from(fr.pixels);
                }
                o.floatNearest = ft.nearest;
                // --- rg16uint, then update() with a second pattern ---
                const ut = dev.texture({ format: "rg16uint", width: N, height: N, data: new Uint16Array(a.uintA) });
                o.uintNearest = ut.nearest;
                const up = dev.pipeline(uintProbeDesc());
                const drawU = () => dev.frame(({ pass }) => { pass.clear([0, 0, 0, 1]); pass.use(up); pass.texture("utex", ut); pass.draw(3); }, { read: true });
                o.uint = Array.from((await drawU()).pixels);
                ut.update({ data: new Uint16Array(a.uintB) });
                o.uintUpdated = Array.from((await drawU()).pixels);
                // --- depth: near quad first, far quad second, three cases ---
                const quad = (z, c) => { const v = []; const tri = (x, y) => v.push(x, y, z, c[0], c[1], c[2], c[3]);
                    tri(-1, -1); tri(1, -1); tri(1, 1); tri(-1, -1); tri(1, 1); tri(-1, 1); return new Float32Array(v); };
                const near = dev.buffer({ usage: "vertex", data: quad(0.25, [1, 0, 0, 1]) }), far = dev.buffer({ usage: "vertex", data: quad(0.75, [0, 0, 1, 1]) });
                const rec = new Float32Array(12); rec[3] = 1; const ib = dev.buffer({ usage: "vertex", data: rec });
                const I = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
                const plain = dev.pipeline(renderPipelineDesc()), noWrite = dev.pipeline(renderPipelineDesc({ depthWrite: false })), always = dev.pipeline(renderPipelineDesc({ depthCompare: "always" }));
                const scene = async (first, second) => { const fr = await dev.frame(({ pass }) => {
                    pass.clear([0, 0, 0, 1]);
                    pass.use(first); pass.uniform("viewProj", I); pass.vertices(near); pass.instances(ib); pass.draw(6, 1);
                    pass.use(second); pass.uniform("viewProj", I); pass.vertices(far); pass.instances(ib); pass.draw(6, 1);
                }, { read: true }); return [fr.pixels[0], fr.pixels[2]]; };
                o.depthDefault = await scene(plain, plain);
                o.depthNoWrite = await scene(noWrite, plain);
                o.depthAlways = await scene(plain, always);
                dev.destroy();
                out[backend] = o;
            }
            return out;
        }` });
        ok("*** both backends ran the probes through gfx/device.js ***", r.ok && r.result && r.result.webgpu && r.result.webgl2, r.ok ? "" : r.reason);
        if (r.ok) {
            result = r.result;
            // texel row for picture row y, per backend -- the mirror the header describes
            const texRow = (b, y) => (b === "webgl2" ? N - 1 - y : y);
            for (const b of ["webgpu", "webgl2"]) {
                const o = result[b];
                let bad = 0, checked = 0;
                for (const pair of [0, 1]) for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
                    const ti = (texRow(b, y) * N + x) * 4 + pair * 2, pi = (y * N + x) * 4;
                    const want = [halfA[ti] & 0xFF, halfA[ti] >> 8, halfA[ti + 1] & 0xFF, halfA[ti + 1] >> 8];
                    for (let c = 0; c < 4; c++) { checked++; if (o["half" + pair][pi + c] !== want[c]) bad++; }
                }
                ok(`*** ${b}: every half-float bit of every texel comes back exactly (${checked} bytes) ***`, bad === 0 && checked === N * N * 8, `${bad} wrong`);
                let ubad = 0, ubad2 = 0;
                for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
                    const ti = (texRow(b, y) * N + x) * 2, pi = (y * N + x) * 4;
                    const want = [uintA[ti] & 0xFF, uintA[ti] >> 8, uintA[ti + 1] & 0xFF, uintA[ti + 1] >> 8];
                    const want2 = [uintB[ti] & 0xFF, uintB[ti] >> 8, uintB[ti + 1] & 0xFF, uintB[ti + 1] >> 8];
                    for (let c = 0; c < 4; c++) { if (o.uint[pi + c] !== want[c]) ubad++; if (o.uintUpdated[pi + c] !== want2[c]) ubad2++; }
                }
                ok(`*** ${b}: every rg16uint channel comes back exactly, 0 and 65535 included ***`, ubad === 0, `${ubad} wrong of ${N * N * 4}`);
                ok(`  ${b}: update() re-uploads the integer texture and the second pattern comes back exactly`, ubad2 === 0, `${ubad2} wrong`);
                ok(`  ${b}: the integer texture reports nearest whatever was asked, the float one does not`, o.uintNearest === true && o.floatNearest === false);
                ok(`  ${b}: depth -- default writes: the nearer red quad holds`, o.depthDefault[0] === 255 && o.depthDefault[1] === 0, o.depthDefault.join(","));
                ok(`*** ${b}: depthWrite false on the near quad lets the far blue quad through ***`, o.depthNoWrite[0] === 0 && o.depthNoWrite[1] === 255, o.depthNoWrite.join(","));
                ok(`  ${b}: depthCompare "always" on the far quad wins regardless`, o.depthAlways[0] === 0 && o.depthAlways[1] === 255, o.depthAlways.join(","));
            }
            // The two backends, against each other, with the mirror applied by name.
            let mirrorDiff = 0, plainDiff = 0;
            for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) for (let c = 0; c < 4; c++) {
                const g = result.webgpu.uint[(y * N + x) * 4 + c], l = result.webgl2.uint[((N - 1 - y) * N + x) * 4 + c], lp = result.webgl2.uint[(y * N + x) * 4 + c];
                if (g !== l) mirrorDiff++; if (g !== lp) plainDiff++;
            }
            ok("*** the two backends agree byte for byte once WebGL2's rows are turned over ***", mirrorDiff === 0, `${mirrorDiff} differ`);
            ok("  and NOT without the turn -- the mirror is real, not a tolerance", plainDiff > 0, `${plainDiff} differ row-for-row: v4272's orientation finding, at the fetch`);
        }
        if (r && r.pageErrors && r.pageErrors.length) report("page errors: " + r.pageErrors.slice(0, 3).join(" | "));
    }
}

console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nALL GREEN");
console.log("unchecked here: MIPMAPS (neither backend offers them; WebGPU has no generateMipmap, so that is a blit " +
    "pipeline of its own and its own task), filtered sampling of rgba16float (only textureLoad is exercised; Slug " +
    "needs no more), presenting to a canvas on WebGPU, and the six depthCompare words between less and always -- " +
    "the mapping is a table and two of its entries are exercised.");
process.exit(fails ? 1 : 0);
