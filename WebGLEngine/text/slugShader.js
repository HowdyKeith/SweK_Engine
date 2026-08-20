// WebGLEngine/text/slugShader.js — v3823
// ---------------------------------------------------------------------------------------------------------------
// SLUG'S REFERENCE HLSL, PORTED TO GLSL ES 3.00 FOR WEBGL2.
//
// The port is deliberately literal. Every HLSL line has one GLSL line, in the same order, with the same names, so
// that this file can be diffed against SlugPixelShader.hlsl by eye when the reference is updated. The complete
// list of changes, and there is nothing else:
//
//     Texture2D.Load(int3(c,0))  ->  texelFetch(sampler, ivec2(c), 0)
//     Texture2D<uint4>           ->  usampler2D          (RG16UI: the band texture is integer data, not colour)
//     asuint(f)                  ->  floatBitsToUint(f)
//     saturate(x)                ->  clamp(x, 0.0, 1.0)
//     frac(x)                    ->  fract(x)
//     nointerpolation            ->  flat
//     float4/int2/uint2          ->  vec4/ivec2/uvec2
//
// *** THE ONE REAL DEPARTURE, AND IT IS A SIMPLIFICATION RATHER THAN A CORRECTION. *** The reference passes the
// two packed integer words inside a float4 attribute and bit-casts them in the vertex shader, because D3D vertex
// declarations of that era made a mixed-type stream awkward. WebGL2 has vertexAttribIPointer, so they arrive here
// as a genuine uvec2 and SlugUnpack loses its asuint. The bit layout is untouched: slugAtlas.packGlyphLoc and
// packGlyphFlags still produce exactly the words the reference documents, and the shader still masks band max y
// with 0xFF and still tests the E flag at bit 12 of the high word.
//
// WHAT THE PORT COULD NOT PRESERVE, AND WHAT IT COSTS. WebGL2 guarantees only a 2048 texel MAX_TEXTURE_SIZE,
// while the reference hardcodes 4096 as kLogBandTextureWidth. The width is therefore injected rather than
// hardcoded, and slugText.js queries the real limit and packs to match. Getting this wrong is not a visual
// glitch: CalcBandLoc's row wrap uses the width, so a shader compiled for 4096 reading a 2048-wide atlas
// dereferences the wrong texel for every band whose list crosses a row.
//
// Derivatives are core in GLSL ES 3.00, so fwidth() needs no extension. The fragment shader returns colour
// PREMULTIPLIED by coverage -- that is what the reference's `color * coverage` is -- so the blend function must
// be (ONE, ONE_MINUS_SRC_ALPHA). slugText.js sets it; a caller managing its own state has to know.
//
// Slug shader code: Copyright 2017 Eric Lengyel, MIT OR Apache-2.0. See slugShader.NOTICE below, which is
// reproduced into any build that ships this file.
// ---------------------------------------------------------------------------------------------------------------
"use strict";

/** Attribution required by the Slug reference distribution. Kept as data so a build step can emit it. */
export const SLUG_NOTICE = "Slug shader code Copyright 2017 by Eric Lengyel. Licensed MIT OR Apache-2.0. https://github.com/EricLengyel/Slug";

/**
 * The vertex layout, declared once and consumed three times: by the `layout(location = ...)` lines below, by the
 * VAO setup in slugText.js, and by the writer in buildVertices. Three copies of a byte offset is exactly the kind
 * of thing that drifts silently -- a stream that is off by 8 bytes still draws, it just draws wrong -- so there
 * is one copy and the other two derive from it.
 *
 * `integer` marks the attribute that goes through vertexAttribIPointer instead of vertexAttribPointer.
 */
export const VERTEX_LAYOUT = [
    { name: "aPos",   location: 0, size: 4, type: "float", offset: 0 },
    { name: "aTex",   location: 1, size: 2, type: "float", offset: 16 },
    { name: "aGlyph", location: 2, size: 2, type: "uint",  offset: 24, integer: true },
    { name: "aJac",   location: 3, size: 4, type: "float", offset: 32 },
    { name: "aBnd",   location: 4, size: 4, type: "float", offset: 48 },
    { name: "aCol",   location: 5, size: 4, type: "float", offset: 64 }
];

/** Attribute locations by name, for readability at the call sites. */
export const ATTRIB = Object.fromEntries(VERTEX_LAYOUT.map((a) => [a.name.slice(1).toUpperCase(), a.location]));

/** Bytes per vertex: vec4 pos + vec2 tex + uvec2 glyph + vec4 jac + vec4 bnd + vec4 col. */
export const VERTEX_STRIDE = 80;

/* ------------------------------------------------------------------------------------------------------------
 * Vertex shader
 * --------------------------------------------------------------------------------------------------------- */

export const VERTEX_SOURCE = `#version 300 es
// Slug reference vertex shader, ported. Copyright 2017 Eric Lengyel, MIT OR Apache-2.0.
precision highp float;
precision highp int;

layout(location = 0) in vec4 aPos;      // xy = object-space position, zw = outward normal for dilation
layout(location = 1) in vec2 aTex;      // em-space sample coordinates
layout(location = 2) in uvec2 aGlyph;   // x = glyph data location, y = band maxima and flags
layout(location = 3) in vec4 aJac;      // inverse Jacobian (00, 01, 10, 11)
layout(location = 4) in vec4 aBnd;      // band scale xy, band offset zw
layout(location = 5) in vec4 aCol;      // vertex colour

uniform vec4 slug_matrix[4];            // the four rows of the MVP, each used as (m0, m1, -, m3)
uniform vec2 slug_viewport;             // viewport size in pixels

out vec4 vColor;
out vec2 vTexcoord;
flat out vec4 vBanding;
flat out ivec4 vGlyph;

void SlugUnpack(uvec2 g, out ivec4 vgly)
{
    vgly = ivec4(g.x & 0xFFFFu, g.x >> 16u, g.y & 0xFFFFu, g.y >> 16u);
}

// Dynamic dilation. The quad is pushed outward along the vertex normal by however much a half pixel is worth in
// object space AT THIS VERTEX, under the actual projection -- which is why it needs rows 0, 1 and 3 of the MVP
// and not just a scale. A fixed padding is correct only for an axis-aligned unprojected quad; this is correct for
// text lying on a plane in perspective, which is the case that made Slug worth having.
vec2 SlugDilate(vec4 pos, vec2 tex, vec4 jac, vec4 m0, vec4 m1, vec4 m3, vec2 dim, out vec2 vpos)
{
    vec2 n = normalize(pos.zw);
    float s = dot(m3.xy, pos.xy) + m3.w;
    float t = dot(m3.xy, n);

    float u = (s * dot(m0.xy, n) - t * (dot(m0.xy, pos.xy) + m0.w)) * dim.x;
    float v = (s * dot(m1.xy, n) - t * (dot(m1.xy, pos.xy) + m1.w)) * dim.y;

    float s2 = s * s;
    float st = s * t;
    float uv = u * u + v * v;
    vec2 d = pos.zw * (s2 * (st + sqrt(uv)) / (uv - st * st));

    vpos = pos.xy + d;
    return vec2(tex.x + dot(d, jac.xy), tex.y + dot(d, jac.zw));
}

void main()
{
    vec2 p;
    vTexcoord = SlugDilate(aPos, aTex, aJac, slug_matrix[0], slug_matrix[1], slug_matrix[3], slug_viewport, p);

    gl_Position.x = p.x * slug_matrix[0].x + p.y * slug_matrix[0].y + slug_matrix[0].w;
    gl_Position.y = p.x * slug_matrix[1].x + p.y * slug_matrix[1].y + slug_matrix[1].w;
    gl_Position.z = p.x * slug_matrix[2].x + p.y * slug_matrix[2].y + slug_matrix[2].w;
    gl_Position.w = p.x * slug_matrix[3].x + p.y * slug_matrix[3].y + slug_matrix[3].w;

    SlugUnpack(aGlyph, vGlyph);
    vBanding = aBnd;
    vColor = aCol;
}
`;

/* ------------------------------------------------------------------------------------------------------------
 * Fragment shader
 * --------------------------------------------------------------------------------------------------------- */

function fragmentSource(logWidth, defines) {
    const flags = [];
    if (defines.evenOdd) flags.push("#define SLUG_EVENODD");
    if (defines.weight) flags.push("#define SLUG_WEIGHT");

    return `#version 300 es
// Slug reference fragment shader, ported. Copyright 2017 Eric Lengyel, MIT OR Apache-2.0.
precision highp float;
precision highp int;
precision highp sampler2D;
precision highp usampler2D;

#define kLogBandTextureWidth ${logWidth}
${flags.join("\n")}

uniform sampler2D curveTexture;         // RGBA16F control points
uniform usampler2D bandTexture;         // RG16UI band headers and curve lists

in vec4 vColor;
in vec2 vTexcoord;
flat in vec4 vBanding;
flat in ivec4 vGlyph;

out vec4 fragColor;

uint CalcRootCode(float y1, float y2, float y3)
{
    uint i1 = floatBitsToUint(y1) >> 31u;
    uint i2 = floatBitsToUint(y2) >> 30u;
    uint i3 = floatBitsToUint(y3) >> 29u;

    uint shift = (i2 & 2u) | (i1 & ~2u);
    shift = (i3 & 4u) | (shift & ~4u);

    return ((0x2E74u >> shift) & 0x0101u);
}

vec2 SolveHorizPoly(vec4 p12, vec2 p3)
{
    vec2 a = p12.xy - p12.zw * 2.0 + p3;
    vec2 b = p12.xy - p12.zw;
    float ra = 1.0 / a.y;
    float rb = 0.5 / b.y;

    float d = sqrt(max(b.y * b.y - a.y * p12.y, 0.0));
    float t1 = (b.y - d) * ra;
    float t2 = (b.y + d) * ra;

    if (abs(a.y) < 1.0 / 65536.0) { t1 = p12.y * rb; t2 = t1; }

    return vec2((a.x * t1 - b.x * 2.0) * t1 + p12.x, (a.x * t2 - b.x * 2.0) * t2 + p12.x);
}

vec2 SolveVertPoly(vec4 p12, vec2 p3)
{
    vec2 a = p12.xy - p12.zw * 2.0 + p3;
    vec2 b = p12.xy - p12.zw;
    float ra = 1.0 / a.x;
    float rb = 0.5 / b.x;

    float d = sqrt(max(b.x * b.x - a.x * p12.x, 0.0));
    float t1 = (b.x - d) * ra;
    float t2 = (b.x + d) * ra;

    if (abs(a.x) < 1.0 / 65536.0) { t1 = p12.x * rb; t2 = t1; }

    return vec2((a.y * t1 - b.y * 2.0) * t1 + p12.y, (a.y * t2 - b.y * 2.0) * t2 + p12.y);
}

ivec2 CalcBandLoc(ivec2 glyphLoc, uint offset)
{
    ivec2 bandLoc = ivec2(glyphLoc.x + int(offset), glyphLoc.y);
    bandLoc.y += bandLoc.x >> kLogBandTextureWidth;
    bandLoc.x &= (1 << kLogBandTextureWidth) - 1;
    return bandLoc;
}

float CalcCoverage(float xcov, float ycov, float xwgt, float ywgt, int flags)
{
    float coverage = max(abs(xcov * xwgt + ycov * ywgt) / max(xwgt + ywgt, 1.0 / 65536.0), min(abs(xcov), abs(ycov)));

    #if defined(SLUG_EVENODD)
        if ((flags & 0x1000) == 0)
        {
    #endif

            coverage = clamp(coverage, 0.0, 1.0);

    #if defined(SLUG_EVENODD)
        }
        else
        {
            coverage = 1.0 - abs(1.0 - fract(coverage * 0.5) * 2.0);
        }
    #endif

    #if defined(SLUG_WEIGHT)
        coverage = sqrt(coverage);
    #endif

    return coverage;
}

float SlugRender(vec2 renderCoord, vec4 bandTransform, ivec4 glyphData)
{
    int curveIndex;

    vec2 emsPerPixel = fwidth(renderCoord);
    vec2 pixelsPerEm = 1.0 / emsPerPixel;

    ivec2 bandMax = glyphData.zw;
    bandMax.y &= 0x00FF;

    ivec2 bandIndex = clamp(ivec2(renderCoord * bandTransform.xy + bandTransform.zw), ivec2(0, 0), bandMax);
    ivec2 glyphLoc = glyphData.xy;

    float xcov = 0.0;
    float xwgt = 0.0;

    uvec2 hbandData = texelFetch(bandTexture, ivec2(glyphLoc.x + bandIndex.y, glyphLoc.y), 0).xy;
    ivec2 hbandLoc = CalcBandLoc(glyphLoc, hbandData.y);

    for (curveIndex = 0; curveIndex < int(hbandData.x); curveIndex++)
    {
        ivec2 curveLoc = ivec2(texelFetch(bandTexture, ivec2(hbandLoc.x + curveIndex, hbandLoc.y), 0).xy);

        vec4 p12 = texelFetch(curveTexture, curveLoc, 0) - vec4(renderCoord, renderCoord);
        vec2 p3 = texelFetch(curveTexture, ivec2(curveLoc.x + 1, curveLoc.y), 0).xy - renderCoord;

        if (max(max(p12.x, p12.z), p3.x) * pixelsPerEm.x < -0.5) break;

        uint code = CalcRootCode(p12.y, p12.w, p3.y);
        if (code != 0u)
        {
            vec2 r = SolveHorizPoly(p12, p3) * pixelsPerEm.x;

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

    float ycov = 0.0;
    float ywgt = 0.0;

    uvec2 vbandData = texelFetch(bandTexture, ivec2(glyphLoc.x + bandMax.y + 1 + bandIndex.x, glyphLoc.y), 0).xy;
    ivec2 vbandLoc = CalcBandLoc(glyphLoc, vbandData.y);

    for (curveIndex = 0; curveIndex < int(vbandData.x); curveIndex++)
    {
        ivec2 curveLoc = ivec2(texelFetch(bandTexture, ivec2(vbandLoc.x + curveIndex, vbandLoc.y), 0).xy);

        vec4 p12 = texelFetch(curveTexture, curveLoc, 0) - vec4(renderCoord, renderCoord);
        vec2 p3 = texelFetch(curveTexture, ivec2(curveLoc.x + 1, curveLoc.y), 0).xy - renderCoord;

        if (max(max(p12.y, p12.w), p3.y) * pixelsPerEm.y < -0.5) break;

        uint code = CalcRootCode(p12.x, p12.z, p3.x);
        if (code != 0u)
        {
            vec2 r = SolveVertPoly(p12, p3) * pixelsPerEm.y;

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

void main()
{
    float coverage = SlugRender(vTexcoord, vBanding, vGlyph);
    fragColor = vColor * coverage;
}
`;
}

/**
 * Build the shader pair for a given atlas width and feature set.
 * `logWidth` MUST equal the logWidth the atlas was packed with -- CalcBandLoc's row wrap depends on it.
 */
export function slugShaderSource(logWidth = 12, defines = {}) {
    return { vertex: VERTEX_SOURCE, fragment: fragmentSource(logWidth, defines), logWidth, defines };
}
