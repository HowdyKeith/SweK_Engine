// WebGLEngine/tools/ship/slugWgsl-selfcheck.mjs -- v4457
//
// GRADES text/slugShaderWgsl.js BY RUNNING ITS OWN FUNCTION TEXT ON A GPU AND COMPARING THE COVERAGE, SAMPLE BY
// SAMPLE, WITH text/slugEval.js -- ON THE SAME PACKED BYTES.
//
// *** THE SHADER THAT SHIPS IS THE SHADER THAT IS GRADED, NOT A COPY OF IT. *** slugShaderWgsl.js keeps the Slug
// fragment core -- root code, the two solvers, CalcBandLoc, CalcCoverage, SlugRender -- as ONE string, and both
// the render module and the compute probe interpolate it. Section 1 asserts that text identity before anything
// runs, because a probe that carried its own copy of the loop would be grading itself. The probe differs from the
// fragment in exactly two seams, both declared in that file's header: emsPerPixel arrives as a parameter instead
// of fwidth(), and the two fetches read array<u32> instead of textureLoad. The array holds the atlas's own
// Uint16Arrays, so unpack2x16float hands the probe the same f32 a texture_2d<f32> load would.
//
// THE KEYS, AND WHY NEITHER IS THE SHADER GRADING ITSELF:
//   - text/slugEval.js, the CPU transliteration, held by text/slug-selfcheck.mjs to a winding number computed
//     from flattened segments -- a route with no bands, texels, offsets or root code in it. A WGSL port that
//     agrees with slugEval agrees with that.
//   - That same winding number, applied here directly to the GPU's sharp-limit answers, so the GPU claim does
//     not rest on slugEval alone: two transliterations of one HLSL file COULD share a misreading of it.
//
// TWO REGIMES, TWO CLAIMS. In the SHARP LIMIT (emsPerPixel 1e-7, so saturate(r + 0.5) is a step) coverage is
// exactly 0 or 1 in both f32 and f64, and away from the outline it cannot differ by rounding: the sample sits
// at least 2e-3 em from every curve and an f32 ulp at these magnitudes is 1e-7. So the claim there is EXACT
// EQUALITY on every sample, and one wrong sample is red. At a REAL SIZE (28 and 12 pixels per em) the GPU's f32
// and slugEval's f64 legitimately part by rounding, and the tolerance is set before the run from what the output
// is FOR: coverage feeds an 8-bit channel, so a difference under 1/512 -- half a quantisation step -- cannot
// change the byte a picture holds. It is not derived from what the run happened to produce.
//
// *** THE PLANTS ARE APPLIED BY STRING REPLACEMENT AND EACH IS ASSERTED TO HAVE APPLIED. *** v4456 found its
// fifth unreachable check of a session inside a round about unreachable checks. A plant whose replacement
// silently matched nothing would run the unmodified shader and go green for the wrong reason, so every plant
// checks the text changed before it checks the GPU went red.
//
// *** AND THE DILATION IS HELD TO A DERIVATION, NOT TO A TWIN. *** A JavaScript SlugDilate written in this session
// from the same GLSL would be a mirror. Instead the GPU's dilated corner is pushed through the full projection
// in f64 and its screen displacement is compared with what the algebra says the formula achieves:
//     |shift| = sqrt(2) * sqrt(uv) / (2 * (sqrt(uv) + (sqrt(2) - 1) * s * t))
// which is 0.5 px PER AXIS, exactly, under an orthographic matrix (t = 0), and something slightly different in
// perspective -- because slugText.buildVertices passes the corner normal as (+-1, +-1), unnormalised, and the
// reference's exact half-pixel property holds for a UNIT normal. That is a finding about the shipped vertex
// stream, and it is measured here rather than argued: the ortho case is asserted exact and the perspective
// residual is asserted against the closed form and printed.
//
// SABOTAGE LOG (v4457), each applied to the probe text by replacement and asserted to have applied, measured on
// the device against 22,045 sharp samples of the constructed font unless said otherwise:
//     root code `i1 & ~2u` -> `i1 & 2u`                         12,148 wrong   red
//     SolveHorizPoly's a == 0 branch removed                      2,205 wrong   red
//     vertical loop's early-out on .x instead of .y               1,462 wrong   red
//     probe compiled for width 256 over a width-128 Plex atlas    9,477 of 27,957 wrong   red
//     THE SAME WIDTH PLANT OVER SIX SMALL GLYPHS AT WIDTH 64      0 of 10,016 wrong   NOT RED -- unreachable,
//         because nothing wrapped; the section was rebuilt over the Plex alphabet, where 432 of 965 headers do.
//
// Run: node tools/ship/slugWgsl-selfcheck.mjs
"use strict";

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runWgslComputeNative, headlessGpuSkipReason } from "./headlessGpu.mjs";
import { validateWgsl, parseEntryPoints, parseBindings } from "../../render/wgslSpec.mjs";
import { parseFont } from "../../text/slugFont.js";
import { packAtlas, packGlyphLoc, packGlyphFlags } from "../../text/slugAtlas.js";
import { slugRender, flattenToSegments, windingNumber, distanceToSegments } from "../../text/slugEval.js";
import { VERTEX_LAYOUT, VERTEX_STRIDE, slugShaderSource } from "../../text/slugShader.js";
import { slugShaderWgsl, slugProbeWgsl, slugDilateProbeWgsl, slugCoreWgsl, SLUG_VERTEX_CORE,
         PROBE_BINDINGS, DILATE_PROBE_BINDINGS, VERTEX_FORMATS, SLUG_BINDINGS } from "../../text/slugShaderWgsl.js";
import { testFontBytes } from "../../text/slugTestFont.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
let fails = 0;
const ok = (label, cond, detail) => { if (!cond) fails++; console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "   " + detail : ""}`); };
const say = (s) => console.log(`  ----  ${s}`);
const f32 = Math.fround;

/** The a-priori tolerances. Stated here, once, before any number is seen. */
const TINY = f32(1e-7);            // the sharp limit: saturate(r + 0.5) is a step at 1e7 pixels per em
const BOUNDARY_EM = 2e-3;          // samples nearer the outline than this are not compared in the sharp limit
const HALF_STEP_8BIT = 1 / 512;    // half an 8-bit quantisation step: below this no byte in a picture can move
const PX_TOL = 1e-3;               // pixels; f32 on screen coordinates of a few hundred px carries ~4e-5

const skip = headlessGpuSkipReason();
if (skip) {
    console.log(`  SKIP  no headless GPU here: ${skip}`);
    console.log("  a skip is not a pass -- this gate's claims are made only where a device answers");
    process.exit(0);
}

/* ============================================================================================================
 * 1. THE PORT'S TEXT: one core, two hosts, and the reference's constants where the reference has them
 * ========================================================================================================= */
console.log("\n1. ONE CORE, TWO HOSTS");
const core12 = slugCoreWgsl(12);
const render = slugShaderWgsl(12);
const probe = slugProbeWgsl(12);
{
    ok("*** the render module contains the core text verbatim ***", render.wgsl.includes(core12));
    ok("*** and the probe contains the SAME core text verbatim ***", probe.includes(core12),
        "what the probe runs on the device is the string the fragment shader ships");
    ok("both hosts carry the shared vertex-side core too", render.wgsl.includes(SLUG_VERTEX_CORE) && probe.includes(SLUG_VERTEX_CORE),
        "SlugUnpack runs in the probe on the packed vertex words, exactly as the vertex entry runs it");
    const core11 = slugCoreWgsl(11);
    const diff = core12.split("\n").filter((l, i) => l !== core11.split("\n")[i]);
    ok("a different logWidth changes exactly one line of the core", diff.length === 1 && /kLogBandTextureWidth/.test(diff[0]),
        diff.length === 1 ? diff[0].trim() : `${diff.length} lines differ`);

    // The reference's constants, present in the GLSL port and present here, character for character.
    const glsl = slugShaderSource(12).fragment;
    for (const c of ["0x2E74", "0x0101", "1.0 / 65536.0", "0x00FF", "-0.5"]) {
        ok(`the constant ${c} appears in both ports`, glsl.includes(c) && core12.includes(c));
    }
    ok("the even-odd flag 0x1000 appears in the GLSL (under #if) and in the WGSL even-odd variant (generated), and NOT in the default core",
        glsl.includes("0x1000") && slugCoreWgsl(12, { evenOdd: true }).includes("(flags & 0x1000) == 0") && !core12.includes("0x1000"),
        "WGSL has no preprocessor, so the branch the GLSL leaves in the text under #if is generated only when asked for");
    ok("no ternary and no select(): the reference has no branch a select could invert",
        !/\?/.test(core12) && !/select\(/.test(core12) && !/\?/.test(glsl.replace(/\/\/.*$/gm, "")),
        "badTvWgsl's gate needed a select-order check; this port has nothing to check there, and says so");
    ok("the sign bits come from bitcast<u32>, the WGSL of floatBitsToUint", /bitcast<u32>\(y1\) >> 31u/.test(core12));
    ok("*** the integer varying is @interpolate(flat), which WGSL REQUIRES and GLSL merely wants ***",
        /@location\(3\) @interpolate\(flat\) glyph: vec4i/.test(render.wgsl) && /@location\(2\) @interpolate\(flat\) banding: vec4f/.test(render.wgsl));
    ok("both loops break on the hull test and both are written against the axis of their own ray",
        /max\(max\(p12\.x, p12\.z\), p3\.x\) \* pixelsPerEm\.x < -0\.5/.test(core12) &&
        /max\(max\(p12\.y, p12\.w\), p3\.y\) \* pixelsPerEm\.y < -0\.5/.test(core12));

    // The vertex layout is derived, not retyped.
    ok("VERTEX_FORMATS is derived from slugShader.VERTEX_LAYOUT: six attributes, stride 80",
        VERTEX_FORMATS.length === VERTEX_LAYOUT.length && VERTEX_STRIDE === 80 &&
        VERTEX_FORMATS.every((f, i) => f.offset === VERTEX_LAYOUT[i].offset && f.shaderLocation === VERTEX_LAYOUT[i].location));
    ok("  and the glyph words are uint32x2 at offset 24, the one integer attribute",
        VERTEX_FORMATS[2].format === "uint32x2" && VERTEX_FORMATS[2].offset === 24 &&
        VERTEX_FORMATS.filter((f) => f.format.startsWith("uint")).length === 1);
    for (const f of VERTEX_FORMATS) {
        ok(`  @location(${f.shaderLocation}) is declared in the vertex input`, new RegExp(`@location\\(${f.shaderLocation}\\) \\w+: vec\\d[fu]`).test(render.wgsl));
    }

    // Parsed by the tree's own scanner, in the shape gfx/device.js reads.
    const v = validateWgsl(render.wgsl);
    ok("wgslSpec accepts the render module", v.length === 0, v.join(" | ") || "0 problems");
    const vp = validateWgsl(probe);
    ok("  and the probe", vp.length === 0, vp.join(" | ") || "0 problems");
    const vd = validateWgsl(slugDilateProbeWgsl());
    ok("  and the dilation probe", vd.length === 0, vd.join(" | ") || "0 problems");
    const eps = parseEntryPoints(render.wgsl);
    ok("entries vs and fs, the names gfx/device.js defaults to",
        eps.some((e) => e.name === "vs" && e.stage === "vertex") && eps.some((e) => e.name === "fs" && e.stage === "fragment"));
    const b = parseBindings(render.wgsl);
    const byName = Object.fromEntries(b.map((x) => [x.name, x]));
    ok("bindings by name at group 0: uniforms 0, curveTexture 1 (texture_2d<f32>), bandTexture 2 (texture_2d<u32>)",
        byName.slug?.binding === SLUG_BINDINGS.uniforms && byName.slug?.addressSpace === "uniform" &&
        byName.curveTexture?.binding === SLUG_BINDINGS.curveTexture && byName.curveTexture?.type === "texture_2d<f32>" &&
        byName.bandTexture?.binding === SLUG_BINDINGS.bandTexture && byName.bandTexture?.type === "texture_2d<u32>",
        b.map((x) => `${x.binding}:${x.name}:${x.type}`).join(" "));
    ok("  and no sampler: both fetches are integer loads, which need none", !b.some((x) => x.type === "sampler"));
    ok("a logWidth outside [1, 14] is refused by name", (() => { try { slugCoreWgsl(0); return false; } catch (e) { return /logWidth/.test(String(e)); } })());
}

/* ============================================================================================================
 * 2. COMPILED BY A REAL DRIVER
 * ========================================================================================================= */
console.log("\n2. COMPILED BY A REAL DRIVER");
let adapterName = "?";
{
    for (const [name, code] of [["render module", render.wgsl],
                                ["render module with SLUG_EVENODD and SLUG_WEIGHT", slugShaderWgsl(12, { evenOdd: true, weight: true }).wgsl],
                                ["render module at logWidth 11", slugShaderWgsl(11).wgsl],
                                ["coverage probe", probe],
                                ["dilation probe", slugDilateProbeWgsl()]]) {
        const r = await runWgslComputeNative({ code, outCount: 1, compileOnly: true });
        if (r.adapter?.description) adapterName = r.adapter.description;
        ok(`the ${name} compiles`, r.ok, r.ok ? r.adapter.description : `${r.reason} ${(r.errors || []).join(" || ")}`);
    }
    say(`adapter: ${adapterName} -- Dawn on SwiftShader, the same implementation Chromium carries (headlessGpu.mjs)`);
}

/* ============================================================================================================
 * The fonts and the sampling
 * ========================================================================================================= */
const testFont = parseFont(testFontBytes());
const plexBytes = fs.readFileSync(path.join(ENG, "vendor/fonts/IBMPlexSerif-Regular.ttf"));
const plex = parseFont(new Uint8Array(plexBytes));
const LABEL_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789%#.-";   // ev/esShipLabels.js's alphabet, minus the space

function glyphList(font, chars) {
    const seen = new Map();
    for (const ch of chars) {
        const gi = font.glyphIndex(ch.codePointAt(0));
        if (!seen.has(gi)) seen.set(gi, { key: gi, contours: font.outline(gi).contours });
    }
    return [...seen.values()];
}

/**
 * Build the probe's inputs for a set of (glyph, x, y, emsPerPixel) samples. Every coordinate is rounded to f32
 * FIRST and the same rounded value is handed to slugEval, so the two sides evaluate one point, not two neighbours.
 */
function makeSamples(atlas, list, gridPerGlyph, emsPerPixel, { sharp, segsOf }) {
    const samples = [], words = [], banding = [], meta = [];
    let skipped = 0;
    for (const g of list) {
        const e = atlas.glyphs.get(g.key);
        if (!e || e.empty) continue;
        const bb = e.bbox, N = gridPerGlyph(e);
        const segs = sharp ? segsOf(g) : null;
        const loc = packGlyphLoc(e.loc[0], e.loc[1]), flg = packGlyphFlags(e.bandMax[0], e.bandMax[1], false);
        for (let iy = 0; iy < N; iy++) for (let ix = 0; ix < N; ix++) {
            const x = f32(bb.x0 + (bb.x1 - bb.x0) * (ix + 0.5) / N);
            const y = f32(bb.y0 + (bb.y1 - bb.y0) * (iy + 0.5) / N);
            if (sharp && distanceToSegments(segs, x, y) < BOUNDARY_EM) { skipped++; continue; }
            samples.push(x, y, emsPerPixel[0], emsPerPixel[1]);
            words.push(loc, flg);
            banding.push(f32(e.transform[0]), f32(e.transform[1]), f32(e.transform[2]), f32(e.transform[3]));
            meta.push({ e, g, x, y, segs });
        }
    }
    return { samples: new Float32Array(samples), words: new Uint32Array(words), banding: new Float32Array(banding), meta, skipped };
}

async function runProbe(code, atlas, S) {
    const count = S.meta.length;
    if (atlas.format !== "16f") throw new Error("the probe reads rgba16float halves; pack the atlas with format 16f");
    const r = await runWgslComputeNative({
        code, outCount: count, workgroups: Math.ceil(count / 64),
        uniforms: new Float32Array([count, atlas.curveTexels, atlas.bandTexels, 0]),
        inputs: [
            { binding: PROBE_BINDINGS.curveData, data: atlas.curveData },
            { binding: PROBE_BINDINGS.bandData, data: atlas.bandData },
            { binding: PROBE_BINDINGS.samples, data: S.samples },
            { binding: PROBE_BINDINGS.glyphWords, data: S.words },
            { binding: PROBE_BINDINGS.banding, data: S.banding },
        ],
    });
    if (!r.ok) throw new Error(`probe failed: ${r.reason} ${(r.errors || []).join(" || ")}`);
    return r.values;
}

function cpuCoverage(atlas, S, emsPerPixel) {
    return S.meta.map((m) => slugRender(atlas, m.e, m.x, m.y, emsPerPixel));
}

function compare(gpu, cpu) {
    let worst = 0, sum = 0, exact = 0, straddle = 0, worstAt = -1;
    for (let i = 0; i < cpu.length; i++) {
        const d = Math.abs(gpu[i] - cpu[i]);
        if (d === 0) exact++;
        if (d > worst) { worst = d; worstAt = i; }
        sum += d;
        if (Math.round(gpu[i] * 255) !== Math.round(cpu[i] * 255)) straddle++;
    }
    return { worst, mean: cpu.length ? sum / cpu.length : 0, exact, straddle, worstAt, n: cpu.length };
}

/* ============================================================================================================
 * 3. THE SHARP LIMIT: EXACT, ON EVERY SAMPLE, AGAINST BOTH KEYS
 * ========================================================================================================= */
console.log("\n3. THE SHARP LIMIT, EXACT AGAINST slugEval AND AGAINST THE WINDING NUMBER");
const testList = glyphList(testFont, "ABCDEF");
const testAtlas = packAtlas(testList, { logWidth: 12 });
const plexList = glyphList(plex, LABEL_CHARS);
const plexAtlas = packAtlas(plexList, { logWidth: 12 });
let sharpTest = null;
{
    const segCache = new Map();
    const segsOf = (steps) => (g) => { if (!segCache.has(g)) segCache.set(g, flattenToSegments(g.contours, steps)); return segCache.get(g); };

    for (const [name, atlas, list, N, steps] of [["the constructed font (A-F)", testAtlas, testList, 61, 128],
                                                 ["IBM Plex Serif, the ship-label alphabet", plexAtlas, plexList, 31, 32]]) {
        const S = makeSamples(atlas, list, () => N, [TINY, TINY], { sharp: true, segsOf: segsOf(steps) });
        const gpu = await runProbe(probe, atlas, S);
        const cpu = cpuCoverage(atlas, S, [TINY, TINY]);
        const c = compare(gpu, cpu);
        let windingBad = 0, nonBinary = 0;
        for (let i = 0; i < S.meta.length; i++) {
            const m = S.meta[i];
            const w = windingNumber(m.segs, m.x, m.y) !== 0 ? 1 : 0;
            if (gpu[i] !== w) windingBad++;
            if (gpu[i] !== 0 && gpu[i] !== 1) nonBinary++;
        }
        say(`${name}: ${list.length} glyphs, ${S.meta.length} samples compared (${S.skipped} within ${BOUNDARY_EM} em of the outline set aside), ` +
            `curve texels ${atlas.curveTexels} row(s), band texels ${atlas.bandTexels} row(s) at width ${atlas.width}`);
        ok(`*** ${name}: the GPU equals slugEval EXACTLY on every sample ***`, c.exact === c.n && c.n > 1000,
            `${c.exact} of ${c.n} identical, worst difference ${c.worst}`);
        ok(`  and equals the flattened-segment winding number on every sample`, windingBad === 0,
            `${windingBad} disagree -- the key with no bands, texels, offsets or root code in it`);
        ok(`  and every answer is exactly 0 or 1, as the sharp limit demands`, nonBinary === 0, `${nonBinary} between`);
        const inside = gpu.filter((v) => v === 1).length;
        ok(`  and the sample set has both insides and outsides to tell apart`, inside > c.n * 0.1 && inside < c.n * 0.9,
            `${inside} inside, ${c.n - inside} outside`);
        if (atlas === testAtlas) sharpTest = S;
    }
}

/* ============================================================================================================
 * 4. A REAL SIZE: f32 AGAINST f64, INSIDE HALF AN 8-BIT STEP
 * ========================================================================================================= */
console.log("\n4. COVERAGE AT 28 AND 12 PIXELS PER EM");
{
    for (const [name, atlas, list] of [["constructed font", testAtlas, testList], ["Plex", plexAtlas, plexList]]) {
        for (const PX of [28, 12]) {
            const ems = f32(1 / PX);
            // Pixel centres across the em, restricted to each glyph's box: the samples a real 28 px glyph pays for.
            const S = makeSamples(atlas, list, (e) => Math.max(4, Math.ceil(Math.max(e.bbox.x1 - e.bbox.x0, e.bbox.y1 - e.bbox.y0) * PX)),
                                  [ems, ems], { sharp: false });
            const gpu = await runProbe(probe, atlas, S);
            const cpu = cpuCoverage(atlas, S, [ems, ems]);
            const c = compare(gpu, cpu);
            const partial = cpu.filter((v) => v > 0.02 && v < 0.98).length;
            say(`${name} at ${PX} px/em: ${c.n} samples, ${partial} of them partial coverage (antialiased edge), ` +
                `${c.exact} bit-identical, worst |gpu - cpu| ${c.worst.toExponential(3)}, mean ${c.mean.toExponential(3)}, ` +
                `${c.straddle} would round to a different 8-bit byte`);
            ok(`*** ${name} at ${PX} px/em: the worst difference is under half an 8-bit step (${HALF_STEP_8BIT}) ***`,
                c.worst < HALF_STEP_8BIT && c.n > 300, `worst ${c.worst.toExponential(3)} at sample ${c.worstAt}`);
            ok(`  and the edge is actually antialiased in this regime, so the tolerance is doing work`, partial > c.n * 0.05,
                `${partial} of ${c.n} partial -- if this ever drops to zero the samples have all landed off the edge and the claim is empty`);
        }
    }
    say("the 8-bit straddle count is REPORTED and not asserted: two values a hair either side of a rounding " +
        "boundary land on different bytes for a difference far below the tolerance, and asserting zero there would " +
        "be asserting a property of the sample grid rather than of the shader.");
}

/* ============================================================================================================
 * 5. THE ROW WRAP: a narrow atlas whose band lists cross rows, and the plant that reads it with the wrong width
 * ========================================================================================================= */
console.log("\n5. CalcBandLoc's ROW WRAP, ON AN ATLAS THAT NEEDS IT");
{
    // *** SIX SMALL GLYPHS NEVER LEAVE THEIR FIRST ROW, AND THE FIRST DRAFT OF THIS SECTION PACKED EXACTLY THOSE. ***
    // It measured 0 wrapping lists and its plant went 0 of 10016 wrong -- the plant was unreachable, which is
    // v4456's finding again, one file over. slug-selfcheck.mjs says why in its own plant 3 ("a single small glyph
    // never leaves its first row") and packs rosettes; this section packs the 66 Plex label glyphs at width 128,
    // which is the geometry a 4096-wide atlas only reaches after a few hundred glyphs.
    const narrowLog = 7;
    const narrow = packAtlas(plexList, { logWidth: narrowLog });
    let wrapping = 0, headers = 0;
    for (const e of narrow.glyphs.values()) {
        if (e.empty) continue;
        const H = e.bandMax[1] + 1, V = e.bandMax[0] + 1;
        for (let i = 0; i < H + V; i++) {
            const t = e.loc[1] * narrow.width + e.loc[0] + i;
            const count = narrow.bandData[t * 2], off = narrow.bandData[t * 2 + 1];
            headers++;
            if (count > 0 && e.loc[0] + off >= narrow.width) wrapping++;
        }
    }
    ok("the narrow atlas has band lists that live on a later row than their header", wrapping > 0,
        `${wrapping} of ${headers} band headers point past their own row; ${narrow.bandTexels} band rows at width ${narrow.width}`);
    const S = makeSamples(narrow, plexList, () => 21, [TINY, TINY], { sharp: true, segsOf: (g) => flattenToSegments(g.contours, 32) });
    const right = compare(await runProbe(slugProbeWgsl(narrowLog), narrow, S), cpuCoverage(narrow, S, [TINY, TINY]));
    ok(`*** the probe compiled for width ${narrow.width} reads the width-${narrow.width} atlas exactly ***`, right.exact === right.n && right.n > 1000,
        `${right.exact} of ${right.n}`);
    const lying = compare(await runProbe(slugProbeWgsl(narrowLog + 1), narrow, S), cpuCoverage(narrow, S, [TINY, TINY]));
    ok(`!! PLANT: the probe compiled for width ${narrow.width * 2} reading the SAME atlas is wrong on a large fraction of samples`,
        lying.n - lying.exact > lying.n * 0.05,
        `${lying.n - lying.exact} of ${lying.n} wrong -- the width lives in the shader and nowhere in the data; slug-selfcheck's plant 3 on the CPU side, now on a device`);
}

/* ============================================================================================================
 * 6. PLANTS IN THE TEXT, EACH ASSERTED TO HAVE APPLIED
 * ========================================================================================================= */
console.log("\n6. THREE TRANSLITERATION MISTAKES, PLANTED, EACH RED ON THE DEVICE");
{
    const S = sharpTest;
    const cpu = cpuCoverage(testAtlas, S, [TINY, TINY]);
    const plants = [
        { name: "root code: `i1 & ~2u` written as `i1 & 2u` (the complement dropped)",
          from: "var shift = (i2 & 2u) | (i1 & ~2u);", to: "var shift = (i2 & 2u) | (i1 & 2u);" },
        { name: "the a == 0 branch dropped from SolveHorizPoly (straight lines are EXACTLY a = 0 by construction)",
          from: "    if (abs(a.y) < 1.0 / 65536.0) { t1 = p12.y * rb; t2 = t1; }\n", to: "" },
        { name: "the vertical loop's early-out tests .x instead of .y (the copy-paste between two near-identical loops)",
          from: "if (max(max(p12.y, p12.w), p3.y) * pixelsPerEm.y < -0.5) { break; }",
          to:   "if (max(max(p12.x, p12.z), p3.x) * pixelsPerEm.y < -0.5) { break; }" },
    ];
    for (const p of plants) {
        const planted = probe.replace(p.from, p.to);
        ok(`  the plant applied: ${p.name}`, planted !== probe && probe.includes(p.from),
            "a replacement that matched nothing would run the unmodified shader and pass for the wrong reason");
        let c;
        try { c = compare(await runProbe(planted, testAtlas, S), cpu); }
        catch (e) { c = { n: S.meta.length, exact: -1, failedToRun: String(e).slice(0, 120) }; }
        ok(`!! PLANT goes red: ${p.name}`, c.failedToRun ? true : (c.n - c.exact > 50),
            c.failedToRun ? `refused by the driver: ${c.failedToRun}` : `${c.n - c.exact} of ${c.n} samples wrong`);
    }
}

/* ============================================================================================================
 * 7. THE DILATION, AGAINST ITS OWN DERIVATION
 * ========================================================================================================= */
console.log("\n7. SlugDilate ON THE DEVICE, HELD TO WHAT THE ALGEBRA SAYS IT ACHIEVES");
{
    // 4x4 helpers, row-major, f64. The Slug shader reads rows 0, 1, 2, 3 of the MVP as (x, y, -, w).
    const mul = (A, B) => { const C = new Array(16).fill(0); for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) for (let k = 0; k < 4; k++) C[i * 4 + j] += A[i * 4 + k] * B[k * 4 + j]; return C; };
    const row = (M, i) => M.slice(i * 4, i * 4 + 4);
    const perspective = (fovy, aspect, n, f) => { const t = 1 / Math.tan(fovy / 2); return [t / aspect, 0, 0, 0, 0, t, 0, 0, 0, 0, (f + n) / (n - f), 2 * f * n / (n - f), 0, 0, -1, 0]; };
    const translate = (x, y, z) => [1, 0, 0, x, 0, 1, 0, y, 0, 0, 1, z, 0, 0, 0, 1];
    const rotateY = (a) => [Math.cos(a), 0, Math.sin(a), 0, 0, 1, 0, 0, -Math.sin(a), 0, Math.cos(a), 0, 0, 0, 0, 1];
    const W = 640, H = 400;
    const ortho = [2 * 40 / W, 0, 0, -0.3, 0, 2 * 40 / H, 0, 0.1, 0, 0, 0, 0, 0, 0, 0, 1];   // 40 px per object unit, square pixels
    const persp = mul(perspective(Math.PI / 3, W / H, 0.1, 100), mul(translate(0.2, -0.1, -3), rotateY(0.6)));

    const clip = (M, x, y) => [0, 1, 2, 3].map((i) => M[i * 4] * x + M[i * 4 + 1] * y + M[i * 4 + 3]);
    const pixel = (c) => [(c[0] / c[3] + 1) / 2 * W, (c[1] / c[3] + 1) / 2 * H];

    // A quad's four corners with the normals buildVertices writes: (+-1, +-1), UNNORMALISED, and jac = (1/s) I.
    const s = 0.5, invS = 1 / s;
    const corners = [[-0.3, -0.2, -1, -1], [0.4, -0.2, 1, -1], [0.4, 0.5, 1, 1], [-0.3, 0.5, -1, 1]];
    const cases = new Float32Array(corners.length * 12);
    corners.forEach(([px, py, nx, ny], i) => {
        cases.set([px, py, nx, ny, 0.1, 0.2, 0, 0, invS, 0, 0, invS], i * 12);   // pos, tex, pad, jac
    });

    for (const [name, M, exactPerAxis] of [["orthographic, square pixels", ortho, true], ["perspective, plane turned 0.6 rad", persp, false]]) {
        const uni = new Float32Array([...row(M, 0), ...row(M, 1), ...row(M, 2), ...row(M, 3), W, H, corners.length, 0]);
        const r = await runWgslComputeNative({ code: slugDilateProbeWgsl(), outCount: corners.length * 8, workgroups: 1, uniforms: uni,
                                               inputs: [{ binding: DILATE_PROBE_BINDINGS.cases, data: cases }] });
        ok(`${name}: the dilation probe ran`, r.ok, r.ok ? "" : `${r.reason} ${(r.errors || []).join(" || ")}`);
        if (!r.ok) continue;
        let worstAxis = 0, worstClosed = 0, worstTex = 0, signOk = true, outward = true;
        const m0 = row(M, 0), m1 = row(M, 1), m3 = row(M, 3);
        corners.forEach(([px, py, nx, ny], i) => {
            const o = r.values.slice(i * 8, i * 8 + 8);
            const dp = [o[0], o[1]], dt = [o[2], o[3]], gpuClip = o.slice(4, 8);
            const before = pixel(clip(M, px, py)), after = pixel(gpuClip);
            const shift = [after[0] - before[0], after[1] - before[1]];
            // The closed form of what the formula achieves for a normal of length sqrt(2) -- see the header.
            const nlen = Math.hypot(nx, ny), n = [nx / nlen, ny / nlen];
            const sv = m3[0] * px + m3[1] * py + m3[3], t = m3[0] * n[0] + m3[1] * n[1];
            const u = (sv * (m0[0] * n[0] + m0[1] * n[1]) - t * (m0[0] * px + m0[1] * py + m0[3])) * W;
            const v = (sv * (m1[0] * n[0] + m1[1] * n[1]) - t * (m1[0] * px + m1[1] * py + m1[3])) * H;
            const suv = Math.hypot(u, v);
            const closedForm = nlen * suv / (2 * (suv + (nlen - 1) * sv * t));
            worstClosed = Math.max(worstClosed, Math.abs(Math.hypot(shift[0], shift[1]) - closedForm));
            worstAxis = Math.max(worstAxis, Math.abs(Math.abs(shift[0]) - 0.5), Math.abs(Math.abs(shift[1]) - 0.5));
            if (Math.sign(shift[0]) !== Math.sign(nx) || Math.sign(shift[1]) !== Math.sign(ny)) signOk = false;
            // Outward in object space: the displacement has the normal's signs.
            if (Math.sign(dp[0] - px) !== Math.sign(nx) || Math.sign(dp[1] - py) !== Math.sign(ny)) outward = false;
            // The texture coordinate moves by d . jac, which with jac = (1/s) I is the displacement over s.
            const dd = [dp[0] - px, dp[1] - py];
            worstTex = Math.max(worstTex, Math.abs((dt[0] - 0.1) - dd[0] * invS), Math.abs((dt[1] - 0.2) - dd[1] * invS));
            if (i === 0) say(`${name}: corner 0 moves (${shift[0].toFixed(5)}, ${shift[1].toFixed(5)}) px on screen; |shift| ${Math.hypot(shift[0], shift[1]).toFixed(5)}, closed form ${closedForm.toFixed(5)}`);
        });
        ok(`  ${name}: the screen displacement matches the closed form on every corner`, worstClosed < PX_TOL, `worst ${worstClosed.toExponential(2)} px`);
        ok(`  ${name}: the push is outward, with the normal's signs, in object space and on screen`, signOk && outward);
        ok(`  ${name}: the texture coordinate moves by d . jac`, worstTex < 1e-5, `worst ${worstTex.toExponential(2)} em`);
        if (exactPerAxis) {
            ok(`*** ${name}: HALF A PIXEL PER AXIS, EXACTLY, at every corner ***`, worstAxis < PX_TOL, `worst departure ${worstAxis.toExponential(2)} px`);
        } else {
            ok(`  ${name}: per-axis shifts are within a tenth of a pixel of 0.5 (NOT claimed exact -- see the header)`, worstAxis < 0.1,
                `worst departure ${worstAxis.toExponential(2)} px: the residual of an unnormalised (+-1, +-1) normal under a projective w`);
        }
    }
}

/* ============================================================================================================
 * Verdict
 * ========================================================================================================= */
console.log(fails ? `\n${fails} FAILED` : "\nALL GREEN");
console.log("unchecked here: A FRAME. Nothing binds the two textures to the render module, runs the six-attribute " +
    "vertex stream through it, or diffs a picture against text/slugShader.js's WebGL2 draw -- that is the device-path " +
    "round, and it needs blend state gfx/device.js does not have and rgba16float/rg16uint uploads its texture path " +
    "does not do. Also unchecked: fwidth() on the device (the probe supplies emsPerPixel), the even-odd and weight " +
    "variants beyond compiling, and any timing -- the adapter is a software rasteriser.");
process.exit(fails ? 1 : 0);
