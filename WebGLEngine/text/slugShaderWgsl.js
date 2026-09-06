// WebGLEngine/text/slugShaderWgsl.js -- v4457
// ---------------------------------------------------------------------------------------------------------------
// SLUG'S REFERENCE SHADER, PORTED TO WGSL, SO THAT gfx/device.js CAN DRAW TEXT ON ITS WebGPU BACKEND.
//
// *** THE BLOCKER THIS REMOVES WAS NAMED BY THE TREE, TWICE, BEFORE IT WAS BUILT. *** tools/ship/backendParity-
// selfcheck.mjs has asserted since v4269 that text/slugShader.js is GLSL-only -- 337 lines, zero WGSL -- and
// ui/orreryPost.mjs kept the orrery on canvas 2D at v4273 because "porting ... would also require a WGSL glyph
// renderer". A gfx/device.js pipeline carries both languages and the WebGPU backend reads d.shaders.wgsl
// unguarded, so a Slug pipeline on that backend did not degrade: it reached createShaderModule({ code: undefined }).
//
// THE PORT IS LITERAL WHERE WGSL LETS IT BE, and every departure is listed here because a port whose changes are
// scattered through the text cannot be diffed against SlugPixelShader.hlsl by eye, which is the one property the
// GLSL port promised and this one keeps:
//
//     floatBitsToUint(f)          ->  bitcast<u32>(f)
//     texelFetch(s, ivec2, 0)     ->  textureLoad(t, vec2i, 0)      (no sampler: an integer fetch needs none)
//     usampler2D                  ->  texture_2d<u32>               (rg16uint)
//     sampler2D (RGBA16F)         ->  texture_2d<f32>               (rgba16float; the load hands back f32)
//     flat in/out                 ->  @interpolate(flat)            (REQUIRED on the integer varying in WGSL)
//     in uvec2 aGlyph             ->  @location(2) glyph: vec2u     (vertex format uint32x2, same bytes)
//     uniform vec4 slug_matrix[4] ->  slug.m0 .. slug.m3            (named fields, because gfx/device.js packs a
//                                                                    uniform struct from a list of scalar and
//                                                                    vector fields and has no array element)
//     #define SLUG_EVENODD/WEIGHT ->  generated text                (WGSL has no preprocessor; slugShader.js's
//                                                                    GLSL is generated the same way)
//     `out vec2 vpos` parameter   ->  a two-field struct return     (WGSL has no out parameters)
//
// *** THE ONE STRUCTURAL DEPARTURE, AND IT IS THE REASON THE PORT CAN BE GRADED AT ALL. *** In the reference,
// SlugRender computes `fwidth(renderCoord)` itself, which makes it a fragment-only function. Here SlugRender
// takes emsPerPixel AS A PARAMETER. The fragment entry passes fwidth; the compute PROBE below passes whatever the
// gate asks. That is what lets tools/ship/slugWgsl-selfcheck.mjs run the SAME function text through a compute
// dispatch on a real device, over storage buffers holding the SAME packed bytes the textures would hold, and
// compare its coverage sample by sample with text/slugEval.js -- the tree's CPU transliteration, which is itself
// held to an independent winding number by text/slug-selfcheck.mjs. The core is one string, SLUG_CORE, and both
// entry shapes interpolate it: what is graded is what ships, not a copy of it.
//
// The two fetches are the other seam. The core calls slugFetchCurve(vec2i) -> vec4f and slugFetchBand(vec2i) ->
// vec2u, and does not say what they read. The render module defines them over textureLoad; the probe defines
// them over array<u32> with unpack2x16float, and REFUSES TO WRAP -- a read outside the texture returns zero, as
// slugEval's texelFetch does, for the reason that file gives: a harness more forgiving than the hardware
// certifies the bug it exists to catch (the wrong kLogBandTextureWidth scored perfect with a wrapping reader).
//
// kLogBandTextureWidth is injected, as in the GLSL, and MUST equal the logWidth the atlas was packed with.
// WebGPU guarantees maxTextureDimension2D >= 8192, so the reference's 4096 always fits; slugText.js's rule of
// deriving both numbers from one query still applies, and the width is a parameter rather than a constant.
//
// Slug shader code: Copyright 2017 Eric Lengyel, MIT OR Apache-2.0. slugShader.SLUG_NOTICE is the attribution a
// build must carry; it is re-exported here so a WGSL-only consumer does not have to import the GLSL to get it.
// ---------------------------------------------------------------------------------------------------------------
"use strict";

import { VERTEX_LAYOUT, VERTEX_STRIDE, SLUG_NOTICE } from "./slugShader.js";

export { VERTEX_LAYOUT, VERTEX_STRIDE, SLUG_NOTICE };

/** Bind group 0 of the render module, by name, in the shape gfx/device.js derives bindings from. */
export const SLUG_BINDINGS = Object.freeze({ uniforms: 0, curveTexture: 1, bandTexture: 2, fillSampler: 3, fillTexture: 4 });   // 3 and 4 exist only under defines.fill

/** The texture formats the two atlas textures must be created with. RGBA16F and RG16UI in WebGL2's words. */
export const SLUG_TEXTURE_FORMATS = Object.freeze({ curve: "rgba16float", band: "rg16uint" });

/**
 * The WebGPU vertex buffer layout, DERIVED from slugShader.VERTEX_LAYOUT rather than written a second time --
 * the same rule that file states for its own three consumers of a byte offset.
 */
export const VERTEX_FORMATS = Object.freeze(VERTEX_LAYOUT.map((a) => Object.freeze({
    shaderLocation: a.location,
    offset: a.offset,
    format: (a.type === "uint" ? "uint32" : "float32") + "x" + a.size,
})));

/* ------------------------------------------------------------------------------------------------------------
 * Vertex-side functions, shared by the vertex entry and the dilation probe
 * --------------------------------------------------------------------------------------------------------- */

export const SLUG_VERTEX_CORE = `
fn SlugUnpack(g: vec2u) -> vec4i
{
    return vec4i(i32(g.x & 0xFFFFu), i32(g.x >> 16u), i32(g.y & 0xFFFFu), i32(g.y >> 16u));
}

struct SlugDilated { tex: vec2f, pos: vec2f };

// Dynamic dilation: the quad corner is pushed outward along its normal by what a half pixel is worth in object
// space AT THIS VERTEX under the actual projection, which needs rows 0, 1 and 3 of the MVP and not just a scale.
fn SlugDilate(pos: vec4f, tex: vec2f, jac: vec4f, m0: vec4f, m1: vec4f, m3: vec4f, dim: vec2f) -> SlugDilated
{
    let n = normalize(pos.zw);
    let s = dot(m3.xy, pos.xy) + m3.w;
    let t = dot(m3.xy, n);

    let u = (s * dot(m0.xy, n) - t * (dot(m0.xy, pos.xy) + m0.w)) * dim.x;
    let v = (s * dot(m1.xy, n) - t * (dot(m1.xy, pos.xy) + m1.w)) * dim.y;

    let s2 = s * s;
    let st = s * t;
    let uv = u * u + v * v;
    let d = pos.zw * (s2 * (st + sqrt(uv)) / (uv - st * st));

    var o: SlugDilated;
    o.pos = pos.xy + d;
    o.tex = vec2f(tex.x + dot(d, jac.xy), tex.y + dot(d, jac.zw));
    return o;
}
`;

/* ------------------------------------------------------------------------------------------------------------
 * The fragment core. One string, interpolated into both entry shapes.
 * --------------------------------------------------------------------------------------------------------- */

/**
 * The core: root code, the two solvers, CalcBandLoc, CalcCoverage and SlugRender.
 *
 * Expects the host module to define `slugFetchCurve(vec2i) -> vec4f` and `slugFetchBand(vec2i) -> vec2u`.
 * `logWidth` MUST equal the logWidth the atlas was packed with -- CalcBandLoc's row wrap depends on it.
 */
export function slugCoreWgsl(logWidth = 12, defines = {}) {
    if (!Number.isInteger(logWidth) || logWidth < 1 || logWidth > 14) {
        throw new Error("slugShaderWgsl: logWidth must be an integer in [1, 14], got " + logWidth);
    }
    const coverageRule = defines.evenOdd
        ? `    if ((flags & 0x1000) == 0)
    {
        coverage = clamp(coverage, 0.0, 1.0);
    }
    else
    {
        coverage = 1.0 - abs(1.0 - fract(coverage * 0.5) * 2.0);
    }`
        : `    coverage = clamp(coverage, 0.0, 1.0);`;
    const weightRule = defines.weight ? `    coverage = sqrt(coverage);` : ``;

    return `
// Slug reference fragment shader, ported. Copyright 2017 Eric Lengyel, MIT OR Apache-2.0.
const kLogBandTextureWidth: u32 = ${logWidth}u;

fn CalcRootCode(y1: f32, y2: f32, y3: f32) -> u32
{
    let i1 = bitcast<u32>(y1) >> 31u;
    let i2 = bitcast<u32>(y2) >> 30u;
    let i3 = bitcast<u32>(y3) >> 29u;

    var shift = (i2 & 2u) | (i1 & ~2u);
    shift = (i3 & 4u) | (shift & ~4u);

    return ((0x2E74u >> shift) & 0x0101u);
}

fn SolveHorizPoly(p12: vec4f, p3: vec2f) -> vec2f
{
    let a = p12.xy - p12.zw * 2.0 + p3;
    let b = p12.xy - p12.zw;
    let ra = 1.0 / a.y;
    let rb = 0.5 / b.y;

    let d = sqrt(max(b.y * b.y - a.y * p12.y, 0.0));
    var t1 = (b.y - d) * ra;
    var t2 = (b.y + d) * ra;

    if (abs(a.y) < 1.0 / 65536.0) { t1 = p12.y * rb; t2 = t1; }

    return vec2f((a.x * t1 - b.x * 2.0) * t1 + p12.x, (a.x * t2 - b.x * 2.0) * t2 + p12.x);
}

fn SolveVertPoly(p12: vec4f, p3: vec2f) -> vec2f
{
    let a = p12.xy - p12.zw * 2.0 + p3;
    let b = p12.xy - p12.zw;
    let ra = 1.0 / a.x;
    let rb = 0.5 / b.x;

    let d = sqrt(max(b.x * b.x - a.x * p12.x, 0.0));
    var t1 = (b.x - d) * ra;
    var t2 = (b.x + d) * ra;

    if (abs(a.x) < 1.0 / 65536.0) { t1 = p12.x * rb; t2 = t1; }

    return vec2f((a.y * t1 - b.y * 2.0) * t1 + p12.y, (a.y * t2 - b.y * 2.0) * t2 + p12.y);
}

fn CalcBandLoc(glyphLoc: vec2i, offset: u32) -> vec2i
{
    var bandLoc = vec2i(glyphLoc.x + i32(offset), glyphLoc.y);
    bandLoc.y += bandLoc.x >> kLogBandTextureWidth;
    bandLoc.x &= (1i << kLogBandTextureWidth) - 1;
    return bandLoc;
}

fn CalcCoverage(xcov: f32, ycov: f32, xwgt: f32, ywgt: f32, flags: i32) -> f32
{
    var coverage = max(abs(xcov * xwgt + ycov * ywgt) / max(xwgt + ywgt, 1.0 / 65536.0), min(abs(xcov), abs(ycov)));

${coverageRule}
${weightRule}
    return coverage;
}

// emsPerPixel is a PARAMETER here rather than fwidth(renderCoord) computed inside -- see the module header.
fn SlugRender(renderCoord: vec2f, emsPerPixel: vec2f, bandTransform: vec4f, glyphData: vec4i) -> f32
{
    let pixelsPerEm = 1.0 / emsPerPixel;

    var bandMax = glyphData.zw;
    bandMax.y &= 0x00FF;

    let bandIndex = clamp(vec2i(renderCoord * bandTransform.xy + bandTransform.zw), vec2i(0, 0), bandMax);
    let glyphLoc = glyphData.xy;

    var xcov = 0.0;
    var xwgt = 0.0;

    let hbandData = slugFetchBand(vec2i(glyphLoc.x + bandIndex.y, glyphLoc.y));
    let hbandLoc = CalcBandLoc(glyphLoc, hbandData.y);

    for (var curveIndex = 0i; curveIndex < i32(hbandData.x); curveIndex++)
    {
        let curveLoc = vec2i(slugFetchBand(vec2i(hbandLoc.x + curveIndex, hbandLoc.y)));

        let p12 = slugFetchCurve(curveLoc) - vec4f(renderCoord, renderCoord);
        let p3 = slugFetchCurve(vec2i(curveLoc.x + 1, curveLoc.y)).xy - renderCoord;

        if (max(max(p12.x, p12.z), p3.x) * pixelsPerEm.x < -0.5) { break; }

        let code = CalcRootCode(p12.y, p12.w, p3.y);
        if (code != 0u)
        {
            let r = SolveHorizPoly(p12, p3) * pixelsPerEm.x;

            if ((code & 1u) != 0u)
            {
                xcov += clamp(r.x + 0.5, 0.0, 1.0);
                xwgt = max(xwgt, clamp(1.0 - abs(r.x) * 2.0, 0.0, 1.0));
            }

            if (code > 1u)
            {
                xcov -= clamp(r.y + 0.5, 0.0, 1.0);
                xwgt = max(xwgt, clamp(1.0 - abs(r.y) * 2.0, 0.0, 1.0));
            }
        }
    }

    var ycov = 0.0;
    var ywgt = 0.0;

    let vbandData = slugFetchBand(vec2i(glyphLoc.x + bandMax.y + 1 + bandIndex.x, glyphLoc.y));
    let vbandLoc = CalcBandLoc(glyphLoc, vbandData.y);

    for (var curveIndex = 0i; curveIndex < i32(vbandData.x); curveIndex++)
    {
        let curveLoc = vec2i(slugFetchBand(vec2i(vbandLoc.x + curveIndex, vbandLoc.y)));

        let p12 = slugFetchCurve(curveLoc) - vec4f(renderCoord, renderCoord);
        let p3 = slugFetchCurve(vec2i(curveLoc.x + 1, curveLoc.y)).xy - renderCoord;

        if (max(max(p12.y, p12.w), p3.y) * pixelsPerEm.y < -0.5) { break; }

        let code = CalcRootCode(p12.x, p12.z, p3.x);
        if (code != 0u)
        {
            let r = SolveVertPoly(p12, p3) * pixelsPerEm.y;

            if ((code & 1u) != 0u)
            {
                ycov -= clamp(r.x + 0.5, 0.0, 1.0);
                ywgt = max(ywgt, clamp(1.0 - abs(r.x) * 2.0, 0.0, 1.0));
            }

            if (code > 1u)
            {
                ycov += clamp(r.y + 0.5, 0.0, 1.0);
                ywgt = max(ywgt, clamp(1.0 - abs(r.y) * 2.0, 0.0, 1.0));
            }
        }
    }

    return CalcCoverage(xcov, ycov, xwgt, ywgt, glyphData.w);
}
`;
}

/* ------------------------------------------------------------------------------------------------------------
 * The render module: vertex + fragment, the shape gfx/device.js takes (entries vs / fs, bindings at group 0)
 * --------------------------------------------------------------------------------------------------------- */

/**
 * Build the render module for a given atlas width and feature set.
 *
 * Returns { wgsl, vs, fs, logWidth, defines, bindings, vertexFormats, stride }. The uniform struct is
 *   { m0, m1, m2, m3: vec4f (the four ROWS of the MVP, each used as (x, y, -, w)), viewport: vec2f (pixels) }
 * which is 72 bytes of fields in an 80-byte buffer under WGSL's uniform rule; render/wgslLayout.mjs computes it.
 */
export function slugShaderWgsl(logWidth = 12, defines = {}) {
    // v4500 (task 47): under defines.fill the struct gains fillRect (a vec4 after the vec2: std140 puts it at 80) and the
    // fragment a sampler and a texture at bindings 3 and 4, sampled nearest at the em coordinates mapped through fillRect.
    const fillStruct = defines.fill ? ", fillRect: vec4f" : "";
    const fillBind = defines.fill ? `@group(0) @binding(${SLUG_BINDINGS.fillSampler}) var fillSampler: sampler;
@group(0) @binding(${SLUG_BINDINGS.fillTexture}) var fillTexture: texture_2d<f32>;   // the fill (task 47)
` : "";
    const wgsl = `${SLUG_VERTEX_CORE}
struct SlugUniforms { m0: vec4f, m1: vec4f, m2: vec4f, m3: vec4f, viewport: vec2f${fillStruct} };
@group(0) @binding(${SLUG_BINDINGS.uniforms}) var<uniform> slug: SlugUniforms;
@group(0) @binding(${SLUG_BINDINGS.curveTexture}) var curveTexture: texture_2d<f32>;   // rgba16float control points
@group(0) @binding(${SLUG_BINDINGS.bandTexture}) var bandTexture: texture_2d<u32>;     // rg16uint band headers and curve lists
${fillBind}
struct VSIn {
    @location(0) pos: vec4f,      // xy = object-space position, zw = outward normal for dilation
    @location(1) tex: vec2f,      // em-space sample coordinates
    @location(2) glyph: vec2u,    // x = glyph data location, y = band maxima and flags
    @location(3) jac: vec4f,      // inverse Jacobian (00, 01, 10, 11)
    @location(4) bnd: vec4f,      // band scale xy, band offset zw
    @location(5) col: vec4f,      // vertex colour
};

struct VSOut {
    @builtin(position) position: vec4f,
    @location(0) color: vec4f,
    @location(1) texcoord: vec2f,
    @location(2) @interpolate(flat) banding: vec4f,
    @location(3) @interpolate(flat) glyph: vec4i,
};

@vertex
fn vs(in: VSIn) -> VSOut
{
    let dl = SlugDilate(in.pos, in.tex, in.jac, slug.m0, slug.m1, slug.m3, slug.viewport);
    let p = dl.pos;

    var o: VSOut;
    o.position = vec4f(p.x * slug.m0.x + p.y * slug.m0.y + slug.m0.w,
                       p.x * slug.m1.x + p.y * slug.m1.y + slug.m1.w,
                       p.x * slug.m2.x + p.y * slug.m2.y + slug.m2.w,
                       p.x * slug.m3.x + p.y * slug.m3.y + slug.m3.w);
    o.texcoord = dl.tex;
    o.glyph = SlugUnpack(in.glyph);
    o.banding = in.bnd;
    o.color = in.col;
    return o;
}

fn slugFetchCurve(loc: vec2i) -> vec4f { return textureLoad(curveTexture, loc, 0); }
fn slugFetchBand(loc: vec2i) -> vec2u { return textureLoad(bandTexture, loc, 0).xy; }
${slugCoreWgsl(logWidth, defines)}
@fragment
fn fs(in: VSOut) -> @location(0) vec4f
{
    let coverage = SlugRender(in.texcoord, fwidth(in.texcoord), in.banding, in.glyph);
${defines.fill ? `    let fuv = clamp((in.texcoord - slug.fillRect.xy) / (slug.fillRect.zw - slug.fillRect.xy), vec2f(0.0), vec2f(1.0));
    let fill = textureSample(fillTexture, fillSampler, vec2f(fuv.x, 1.0 - fuv.y));
    return in.color * fill * coverage;` : `    // Premultiplied by coverage, as the reference's color * coverage is: blend (ONE, ONE_MINUS_SRC_ALPHA).
    return in.color * coverage;`}
}
`;
    return { wgsl, vs: "vs", fs: "fs", logWidth, defines: { ...defines }, bindings: SLUG_BINDINGS,
             vertexFormats: VERTEX_FORMATS, stride: VERTEX_STRIDE };
}

/* ------------------------------------------------------------------------------------------------------------
 * The probes: the same core, driven by a compute dispatch so a gate can read numbers back
 * --------------------------------------------------------------------------------------------------------- */

/** Where the coverage probe expects its inputs, for tools/ship/headlessGpu.mjs's `inputs` option. */
export const PROBE_BINDINGS = Object.freeze({ out: 0, uniforms: 1, curveData: 2, bandData: 3, samples: 4, glyphWords: 5, banding: 6 });

/**
 * The coverage probe. One invocation per sample:
 *   samples[i]    = (x, y, emsPerPixel.x, emsPerPixel.y)   in em space, what the fragment would see
 *   glyphWords[i] = the two packed vertex words (packGlyphLoc, packGlyphFlags) -- SlugUnpack runs here too
 *   banding[i]    = the glyph's band transform
 *   out[i]        = SlugRender's coverage
 * uniforms (f32): [count, curveRows, bandRows, 0]. curveData/bandData are the atlas's own Uint16Arrays viewed
 * as u32 words: two rgba16float halves, or two rg16uint channels, per word -- the bytes a texture would hold.
 * The fetches refuse to wrap: a read outside the texture returns zero, which is what makes a wrong logWidth
 * visible (see slugEval.js's texelFetch, whose earlier wrapping draft certified that exact bug).
 */
export function slugProbeWgsl(logWidth = 12, defines = {}) {
    const B = PROBE_BINDINGS;
    return `${SLUG_VERTEX_CORE}
struct ProbeU { count: f32, curveRows: f32, bandRows: f32, pad: f32 };
@group(0) @binding(${B.out}) var<storage, read_write> out: array<f32>;
@group(0) @binding(${B.uniforms}) var<uniform> u: ProbeU;
@group(0) @binding(${B.curveData}) var<storage, read> curveData: array<u32>;
@group(0) @binding(${B.bandData}) var<storage, read> bandData: array<u32>;
@group(0) @binding(${B.samples}) var<storage, read> samples: array<vec4f>;
@group(0) @binding(${B.glyphWords}) var<storage, read> glyphWords: array<vec2u>;
@group(0) @binding(${B.banding}) var<storage, read> banding: array<vec4f>;

const kProbeWidth: i32 = ${1 << logWidth}i;

fn slugFetchCurve(loc: vec2i) -> vec4f
{
    if (loc.x < 0 || loc.y < 0 || loc.x >= kProbeWidth || loc.y >= i32(u.curveRows)) { return vec4f(0.0); }
    let i = u32(loc.y * kProbeWidth + loc.x) * 2u;
    return vec4f(unpack2x16float(curveData[i]), unpack2x16float(curveData[i + 1u]));
}

fn slugFetchBand(loc: vec2i) -> vec2u
{
    if (loc.x < 0 || loc.y < 0 || loc.x >= kProbeWidth || loc.y >= i32(u.bandRows)) { return vec2u(0u); }
    let w = bandData[u32(loc.y * kProbeWidth + loc.x)];
    return vec2u(w & 0xFFFFu, w >> 16u);
}
${slugCoreWgsl(logWidth, defines)}
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3u)
{
    let i = gid.x;
    if (i >= u32(u.count)) { return; }
    let s = samples[i];
    out[i] = SlugRender(s.xy, s.zw, banding[i], SlugUnpack(glyphWords[i]));
}
`;
}

/** Where the dilation probe expects its inputs. */
export const DILATE_PROBE_BINDINGS = Object.freeze({ out: 0, uniforms: 1, cases: 2 });

/**
 * The dilation probe. One invocation per case; cases[i] = { pos: vec4f, tex: vec2f, pad: vec2f, jac: vec4f }
 * (48 bytes, twelve f32s). uniforms (f32): m0, m1, m2, m3 (four vec4 rows), viewport (2), count, pad = 20 floats.
 * out[i * 8 ..] = dilated pos (2), dilated tex (2), the vertex entry's clip position (4).
 */
export function slugDilateProbeWgsl() {
    const B = DILATE_PROBE_BINDINGS;
    return `${SLUG_VERTEX_CORE}
struct DilateU { m0: vec4f, m1: vec4f, m2: vec4f, m3: vec4f, viewport: vec2f, count: f32, pad: f32 };
struct DilateCase { pos: vec4f, tex: vec2f, pad: vec2f, jac: vec4f };
@group(0) @binding(${B.out}) var<storage, read_write> out: array<f32>;
@group(0) @binding(${B.uniforms}) var<uniform> u: DilateU;
@group(0) @binding(${B.cases}) var<storage, read> cases: array<DilateCase>;

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3u)
{
    let i = gid.x;
    if (i >= u32(u.count)) { return; }
    let c = cases[i];
    let dl = SlugDilate(c.pos, c.tex, c.jac, u.m0, u.m1, u.m3, u.viewport);
    let p = dl.pos;
    let o = i * 8u;
    out[o + 0u] = p.x;
    out[o + 1u] = p.y;
    out[o + 2u] = dl.tex.x;
    out[o + 3u] = dl.tex.y;
    out[o + 4u] = p.x * u.m0.x + p.y * u.m0.y + u.m0.w;
    out[o + 5u] = p.x * u.m1.x + p.y * u.m1.y + u.m1.w;
    out[o + 6u] = p.x * u.m2.x + p.y * u.m2.y + u.m2.w;
    out[o + 7u] = p.x * u.m3.x + p.y * u.m3.y + u.m3.w;
}
`;
}
