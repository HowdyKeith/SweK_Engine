#!/usr/bin/env node
// WebGLEngine/tools/ship/deviceMipmaps-selfcheck.mjs -- v4464
//
// GRADES gfx/device.js's MIP CHAIN ON BOTH BACKENDS BY READING EVERY LEVEL BACK OUT OF A SHADER AND HOLDING IT TO A
// CPU BOX FILTER, THEN SAMPLING THE CHAIN THE WAY A MINIFIED DRAW DOES.
//
// *** UNTIL v4464 NEITHER BACKEND OF THE DEVICE OFFERED A MIP CHAIN. *** WebGL2 has gl.generateMipmap and the device
// never called it; WebGPU has no such call at all, so its half is a blit pipeline the backend owns -- one render pass
// per level, a full-screen triangle sampling level i-1 into level i with a linear clamped sampler. `mipmaps: true`
// on device.texture() is the one word for both, and this gate is where the two chains are shown to be THE SAME CHAIN.
//
// THE KEY IS A CPU BOX FILTER, level by level, quantised to a byte at each level as the GPU is (rgba8unorm stores
// eight bits per level, so the rounding compounds through the chain on both sides the same way). The tolerance is
// ONE BYTE per channel, stated before any number was seen: the average of four bytes is a multiple of 0.25, and
// where it lands on .5 the two rasterisers may round either way. Everything else is exact.
//
// TWO PROBES (render/texelProbe.mjs): LEVEL reads texel (x >> L, y >> L) of level L with textureLoad / texelFetch, so
// an N-wide picture of level L shows each texel 2^L times and the chain is read with no sampler in the way. SAMPLED
// draws the texture through its sampler over a picture a quarter its size, so the derivatives choose level 2; on an
// UNCHAINED control texture the same draw reads level 0 through the bilinear filter and the picture aliases -- and the
// pattern is built so the two must differ (a one-texel-wide stripe every four texels: box-averaged to 64, bilinear at
// the block centre to 0). That control is what makes "the sampled picture equals level 2" a fact about the sampler
// reading the chain rather than a picture that would have come out that way anyway.
//
// THE ROWS ARE MIRRORED BETWEEN THE BACKENDS, as deviceFormats-selfcheck says: GL's gl_FragCoord.y counts from the
// bottom and the device's readback turns the rows over, so the WebGL2 picture's row y holds texel row h-1-y. Applied by
// name below, at every level (texRow >> L), never absorbed into a tolerance.
//
// SABOTAGE LOG (v4464) -- each applied to gfx/device.js, gate run, exit read, file restored byte for byte:
//   A  the WebGPU blit never run (chain allocated, never filled)  -> exit=1, 10 red: WebGPU levels 1-5 at 3584-4096 of
//      4096 bytes beyond tolerance (the levels read the zeros they were allocated with), the sampled draw, update(),
//      the 16f chain, the cross-backend line, and the source check that names the call.
//   B  gl.generateMipmap removed                                  -> exit=1, 11 red: EVERY WebGL2 level including level 0
//      (3263 of 4096) -- a MIPMAP min filter over a texture with no chain is INCOMPLETE and texelFetch reads zeros
//      even at level 0 -- plus the sampled draw, update(), the 16f chain, the cross-backend line and the source check.
//   C  the blit's uv NOT flipped (o.uv.y = p.y * 0.5 + 0.5)        -> exit=1, 5 red, AND ONLY THE ODD LEVELS: levels 1
//      and 3 at 1024 of 4096 beyond (worst 240), levels 2 and 4 GREEN. Two flips cancel: level 2 is built from a flipped
//      level 1 and flips it back. *** THE SAMPLED DRAW AT A QUARTER SIZE READS LEVEL 2 AND STAYED GREEN. *** A gate that
//      graded only the level a minified draw lands on -- the natural first draft -- would have passed an upside-down
//      chain. Every level is read for that reason, and the reason is written here so nobody trims the loop.
"use strict";

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runInEngineOrigin, webgpuSkipReason } from "./webgpuHarness.mjs";
import { CAPABILITIES, nullBackend } from "../../gfx/device.js";
import { doubleToHalf } from "./headlessGpu.mjs";
import { levelProbeDesc, sampledProbeDesc } from "../../render/texelProbe.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
let fails = 0;
const ok = (label, cond, detail) => { if (!cond) fails++; console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "   " + detail : ""}`); };
const report = (s) => console.log(`  ----  ${s}`);
const read = (rel) => fs.readFileSync(path.join(ENG, rel), "utf8");
const codeOf = (t) => t.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");

const N = 32, M = N / 4, TOL = 1;   // a-priori: one byte per channel per the header

/* The level-0 pattern: a stripe every four texels in R (so box and bilinear part company), gradients in G and B. */
function pattern(seed) {
    const out = new Uint8Array(N * N * 4);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        const i = (y * N + x) * 4;
        out[i] = (x % 4 === seed % 4) ? 255 : 0; out[i + 1] = x * 8; out[i + 2] = y * 8; out[i + 3] = 255;
    }
    return out;
}
/** The CPU chain: 2x2 box, rounded to a byte at each level. Returns [{w, h, data: Uint8Array}] per level. */
function cpuChain(data, w, h) {
    const levels = [{ w, h, data }];
    while (levels.at(-1).w > 1 || levels.at(-1).h > 1) {
        const p = levels.at(-1), nw = Math.max(1, p.w >> 1), nh = Math.max(1, p.h >> 1), out = new Uint8Array(nw * nh * 4);
        for (let y = 0; y < nh; y++) for (let x = 0; x < nw; x++) for (let c = 0; c < 4; c++) {
            const t = (xx, yy) => p.data[(Math.min(p.h - 1, yy) * p.w + Math.min(p.w - 1, xx)) * 4 + c];
            out[(y * nw + x) * 4 + c] = Math.round((t(2 * x, 2 * y) + t(2 * x + 1, 2 * y) + t(2 * x, 2 * y + 1) + t(2 * x + 1, 2 * y + 1)) / 4);
        }
        levels.push({ w: nw, h: nh, data: out });
    }
    return levels;
}
function halfPattern() {
    const out = new Uint16Array(N * N * 4);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        const i = (y * N + x) * 4;
        out[i] = doubleToHalf((x % 4 === 0) ? 1 : 0); out[i + 1] = doubleToHalf(x / N); out[i + 2] = doubleToHalf(y / N); out[i + 3] = doubleToHalf(1);
    }
    return out;
}

console.log("\n1. THE CHAIN IS A WORD ON THE DESCRIPTOR, THE LEVEL COUNT IS THE RULE, AND THE REFUSALS ARE BY NAME");
{
    const nb = nullBackend();
    const t = nb.texture({ width: 32, height: 20, mipmaps: true, data: new Uint8Array(32 * 20 * 4) });
    ok("the null backend records mipmaps and counts levels by 1 + floor(log2(max(w, h)))", t.mipmaps === true && t.levels === 6, `${t.levels} levels for 32x20`);
    ok("  a texture without the word has one level", nb.texture({ width: 32, height: 20, data: new Uint8Array(32 * 20 * 4) }).levels === 1);
    ok("  1x1 is one level; 33x1 is six", nb.texture({ width: 1, height: 1, mipmaps: true, data: new Uint8Array(4) }).levels === 1 && nb.texture({ width: 33, height: 1, mipmaps: true, data: new Uint8Array(132) }).levels === 6);
    const refuse = (d) => { try { nb.texture(d); return "no throw"; } catch (e) { return e.message; } };
    ok("*** mipmaps on rg16uint are refused by name: an integer format cannot be filtered ***", /mipmaps on rg16uint are refused/.test(refuse({ format: "rg16uint", width: 4, height: 4, mipmaps: true, data: new Uint16Array(32) })));
    ok("  and on a render target: a target is drawn into at level 0 only", /mipmaps on a render target are refused/.test(refuse({ render: true, width: 4, height: 4, mipmaps: true })));
    for (const b of ["webgpu", "webgl2", "null"]) ok(`CAPABILITIES.${b}.mipmaps is true`, CAPABILITIES[b].mipmaps === true);
    const dev = codeOf(read("gfx/device.js"));
    ok("the WebGL2 backend calls generateMipmap after every upload and reads the chain through a MIPMAP min filter", /gl\.generateMipmap\(gl\.TEXTURE_2D\)/.test(dev) && /LINEAR_MIPMAP_LINEAR/.test(dev) && /NEAREST_MIPMAP_NEAREST/.test(dev));
    ok("  and refuses rgba16float chains without EXT_color_buffer_float, by name", /EXT_color_buffer_float/.test(dev));
    ok("*** the WebGPU backend allocates every level and builds the chain with a blit pass per level on one submit ***", /mipLevelCount: levels/.test(dev) && /baseMipLevel: i - 1, mipLevelCount: 1/.test(dev) && /baseMipLevel: i, mipLevelCount: 1/.test(dev) && /rp\.draw\(3\); rp\.end\(\);/.test(dev));
    ok("  the blit samples with a linear CLAMPED sampler (the box filter at an even level's texel centre)", /mipSampler = gpu\.createSampler\(\{ magFilter: "linear", minFilter: "linear", addressModeU: "clamp-to-edge"/.test(dev));
    ok("  and a chained texture's draw sampler filters between levels", /mipmapFilter: nearest \? "nearest" : "linear"/.test(dev) && /samplerFor\(!!nearest, mips\)/.test(dev));
    ok("  the chain is rebuilt on update() on both backends", /if \(mipmaps\) buildMips\(t, format, levels\);/.test(dev) && /upload\(t, \{ flipY: d\.flipY, width: w, height: h, \.\.\.nd \}, d\.nearest, format, mipmaps\)/.test(dev));
    // The CPU key, controlled before it grades anything.
    const ch = cpuChain(pattern(0), N, N);
    ok("CONTROL: the CPU chain of a 32x32 pattern has 6 levels ending at 1x1", ch.length === 6 && ch[5].w === 1 && ch[5].h === 1);
    ok("CONTROL: level 2 of the stripe pattern averages the stripe to 64 and level 1 to 128 or 0", ch[2].data[0] === 64 && (ch[1].data[0] === 128 && ch[1].data[4] === 0), `${ch[2].data[0]}, ${ch[1].data[0]}/${ch[1].data[4]}`);
    ok("CONTROL: a gradient's level 1 is the midpoint of its pairs", ch[1].data[1] === 4 && ch[1].data[5] === 20, `${ch[1].data[1]}, ${ch[1].data[5]}`);
}

console.log("\n2. EVERY LEVEL COMES BACK OUT WITHIN A BYTE OF THE BOX FILTER, ON BOTH BACKENDS, AND THE SAMPLER READS THE CHAIN");
{
    const skip = webgpuSkipReason();
    if (skip) {
        console.log(`  SKIP  ${skip}`);
        report("*** NOT A PASS. *** Section 1 reads source and drives the recorder. Only this one builds a chain on a real device.");
        fails++;
    } else {
        const patA = pattern(0), patB = pattern(2), halves = halfPattern();
        const r = await runInEngineOrigin({ engineRoot: ENG, args: { N, M, patA: Array.from(patA), patB: Array.from(patB), halves: Array.from(halves) }, script: `async (a) => {
            const { requestDevice } = await import("/gfx/device.js");
            const { levelProbeDesc, sampledProbeDesc } = await import("/render/texelProbe.mjs");
            const N = a.N, M = a.M, out = {};
            for (const backend of ["webgpu", "webgl2"]) {
                const cv = document.createElement("canvas"); cv.width = N; cv.height = N;
                const dev = await requestDevice(cv, { backend, offscreen: backend === "webgpu" });
                const o = { backend: dev.backend, levels: {} };
                const tex = dev.texture({ width: N, height: N, data: new Uint8Array(a.patA), mipmaps: true });
                const flat = dev.texture({ width: N, height: N, data: new Uint8Array(a.patA) });
                o.levelCount = tex.levels; o.flatLevels = flat.levels;
                const lp = dev.pipeline(levelProbeDesc());
                const readLevel = async (t, L) => Array.from((await dev.frame(({ pass }) => { pass.clear([0, 0, 0, 1]); pass.use(lp); pass.uniform("level", L); pass.texture("tex", t); pass.draw(3); }, { read: true })).pixels);
                for (let L = 0; L < tex.levels; L++) o.levels[L] = await readLevel(tex, L);
                // the sampled draw at a quarter size: the derivatives choose the level
                cv.width = M; cv.height = M;
                const sp = dev.pipeline(sampledProbeDesc());
                const sampled = async (t) => Array.from((await dev.frame(({ pass }) => { pass.clear([0, 0, 0, 1]); pass.use(sp); pass.uniform("size", M); pass.texture("tex", t); pass.draw(3); }, { read: true })).pixels);
                o.sampledChain = await sampled(tex); o.sampledFlat = await sampled(flat);
                cv.width = N; cv.height = N;
                // update() rebuilds the chain
                tex.update({ data: new Uint8Array(a.patB) });
                o.updated1 = await readLevel(tex, 1);
                // rgba16float chain
                try {
                    const ft = dev.texture({ format: "rgba16float", width: N, height: N, data: new Uint16Array(a.halves), mipmaps: true });
                    o.f16 = { ok: true, levels: ft.levels, level1: await readLevel(ft, 1), level3: await readLevel(ft, 3) };
                    ft.destroy();
                } catch (e) { o.f16 = { ok: false, error: String(e && e.message) }; }
                tex.destroy(); flat.destroy(); dev.destroy();
                out[backend] = o;
            }
            return out;
        }` });
        ok("*** both backends built a chain and ran the probes through gfx/device.js ***", r.ok && r.result && r.result.webgpu && r.result.webgl2, r.ok ? "" : r.reason);
        if (r.ok) {
            const chainA = cpuChain(patA, N, N), chainB = cpuChain(patB, N, N);
            // half -> byte for the 16f chain's key: the same box filter over the real values, rounded once at the read
            const halfToFloat = (h) => { const e = (h >> 10) & 0x1F, m = h & 0x3FF, s = h >> 15 ? -1 : 1; return e === 0 ? s * m * 2 ** -24 : e === 31 ? NaN : s * (1 + m / 1024) * 2 ** (e - 15); };
            const f16Level0 = new Float32Array(N * N * 4); for (let i = 0; i < f16Level0.length; i++) f16Level0[i] = halfToFloat(halves[i]);
            const f16Chain = [{ w: N, h: N, data: f16Level0 }];
            while (f16Chain.at(-1).w > 1) { const p = f16Chain.at(-1), nw = p.w >> 1, nh = p.h >> 1, o = new Float32Array(nw * nh * 4);
                for (let y = 0; y < nh; y++) for (let x = 0; x < nw; x++) for (let c = 0; c < 4; c++) { const t = (xx, yy) => p.data[(yy * p.w + xx) * 4 + c]; o[(y * nw + x) * 4 + c] = (t(2 * x, 2 * y) + t(2 * x + 1, 2 * y) + t(2 * x, 2 * y + 1) + t(2 * x + 1, 2 * y + 1)) / 4; }
                f16Chain.push({ w: nw, h: nh, data: o }); }
            const texRow = (b, y, size) => (b === "webgl2" ? size - 1 - y : y);
            /** Compare an N-wide picture of level L against the chain's level L; returns {bad, worst, n}. */
            const grade = (b, pixels, level, L, quant = (v) => v) => {
                let bad = 0, worst = 0, n = 0;
                for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) for (let c = 0; c < 4; c++) {
                    const tx = x >> L, ty = texRow(b, y, N) >> L;
                    const want = quant(level.data[(ty * level.w + tx) * 4 + c]), got = pixels[(y * N + x) * 4 + c];
                    const d = Math.abs(want - got); n++; if (d > TOL) bad++; if (d > worst) worst = d;
                }
                return { bad, worst, n };
            };
            for (const b of ["webgpu", "webgl2"]) {
                const o = r.result[b];
                ok(`${b}: the chain has 6 levels and the unchained control has 1`, o.levelCount === 6 && o.flatLevels === 1, `${o.levelCount} / ${o.flatLevels}`);
                let worstAll = 0, badAll = 0;
                for (let L = 0; L < 6; L++) {
                    const g = grade(b, o.levels[L], chainA[L], L);
                    worstAll = Math.max(worstAll, g.worst); badAll += g.bad;
                    ok(`${L === 0 ? "*** " : "  "}${b}: level ${L} (${chainA[L].w}x${chainA[L].h}) within a byte of the CPU box filter on every channel${L === 0 ? " ***" : ""}`, g.bad === 0, `${g.bad} of ${g.n} beyond ${TOL}, worst ${g.worst}`);
                }
                report(`${b}: worst difference across the chain ${worstAll} (of 255), ${badAll} bytes beyond tolerance`);
                // the sampled draw: level 2 through the sampler, and NOT level 0 through the bilinear filter
                let sBad = 0, sWorst = 0, ctrlDiff = 0;
                for (let y = 0; y < M; y++) for (let x = 0; x < M; x++) for (let c = 0; c < 4; c++) {
                    const want = chainA[2].data[(texRow(b, y, M) * M + x) * 4 + c], got = o.sampledChain[(y * M + x) * 4 + c], ctrl = o.sampledFlat[(y * M + x) * 4 + c];
                    const d = Math.abs(want - got); if (d > 2) sBad++; if (d > sWorst) sWorst = d;
                    if (c === 0) ctrlDiff += Math.abs(ctrl - want);
                }
                ok(`*** ${b}: drawn at a quarter size through its sampler, the chained texture reads LEVEL 2 -- within 2 of the box filter ***`, sBad === 0, `${sBad} of ${M * M * 4} beyond 2, worst ${sWorst}`);
                ok(`  ${b}: CONTROL -- the unchained texture drawn the same way does NOT (it aliases level 0)`, ctrlDiff / (M * M) > 40, `mean |R - level 2| ${(ctrlDiff / (M * M)).toFixed(1)} against ${(chainA[2].data[0])} expected of the stripe`);
                const u = grade(b, o.updated1, chainB[1], 1);
                ok(`  ${b}: update() rebuilds the chain -- level 1 of the second pattern within a byte`, u.bad === 0, `${u.bad} beyond, worst ${u.worst}`);
                if (o.f16 && o.f16.ok) {
                    const q = (v) => Math.round(Math.min(1, Math.max(0, v)) * 255);
                    const g1 = grade(b, o.f16.level1, f16Chain[1], 1, q), g3 = grade(b, o.f16.level3, f16Chain[3], 3, q);
                    ok(`*** ${b}: an rgba16float chain builds too -- levels 1 and 3 within a byte of the box filter over the real values ***`, o.f16.levels === 6 && g1.bad === 0 && g3.bad === 0, `level 1: ${g1.bad} beyond (worst ${g1.worst}); level 3: ${g3.bad} beyond (worst ${g3.worst})`);
                } else ok(`${b}: an rgba16float chain builds`, false, o.f16 ? o.f16.error : "no result");
            }
            // The two backends against each other, with the mirror applied by name, on every level.
            let mirrorDiff = 0, plainDiff = 0, worstX = 0;
            for (let L = 0; L < 6; L++) for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) for (let c = 0; c < 4; c++) {
                const g = r.result.webgpu.levels[L][(y * N + x) * 4 + c];
                // The WebGPU picture's row y shows texel row y >> L; the WebGL2 picture's row y' shows (N-1-y') >> L, so the
                // row N-1-((y >> L) << L) shows the same texel (every row of a 2^L block shows the same one).
                const yl = N - 1 - ((y >> L) << L);
                const l = r.result.webgl2.levels[L][(yl * N + x) * 4 + c], lp = r.result.webgl2.levels[L][(y * N + x) * 4 + c];
                const d = Math.abs(g - l); if (d > TOL) mirrorDiff++; if (d > worstX) worstX = d; if (g !== lp) plainDiff++;
            }
            ok("*** the two backends agree within a byte on every level once WebGL2's rows are turned over ***", mirrorDiff === 0, `${mirrorDiff} beyond ${TOL}, worst ${worstX}`);
            ok("  and NOT without the turn -- the mirror is real, not a tolerance", plainDiff > 0, `${plainDiff} differ row-for-row`);
        }
        if (r && r.pageErrors && r.pageErrors.length) report("page errors: " + r.pageErrors.slice(0, 3).join(" | "));
    }
}

console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nALL GREEN");
console.log("unchecked here: ODD-SIZED levels (a 32x32 chain halves cleanly; at an odd width the blit's linear sample is " +
    "not the box and GL's generateMipmap is unspecified there too), a chain from a `source` (canvas or image), " +
    "trilinear blending BETWEEN levels (the sampled draw lands on an integer lod by construction), presenting on " +
    "WebGPU, and a real hardware rasteriser -- both backends here are SwiftShader.");
process.exit(fails ? 1 : 0);
