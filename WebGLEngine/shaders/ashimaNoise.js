// FILE: shaders/ashimaNoise.js -- v4177
//
// Ashima Arts' textureless GLSL simplex noise, in ONE place, so that ports which need it stop each carrying
// their own copy.
//
//   Description : Array and textureless GLSL simplex noise functions.
//        Author : Ian McEwan, Ashima Arts.
//     Copyright : Copyright (C) 2011 Ashima Arts. All rights reserved.
//       License : Distributed under the MIT License.
//        Source : https://github.com/ashima/webgl-noise
//
// The GLSL below is Ashima's, unmodified apart from whitespace. It is reproduced here under that MIT licence
// with the attribution above kept intact, which is the licence's one requirement.
//
// ---- *** WHY THIS EXPORTS TWO FUNCTIONS AND NOT ONE WITH A DIMENSION SWITCH *** ---------------------------
//
// This module was written on the belief that three ports in this tree carried THE SAME forty lines. THAT WAS
// WRONG, and checking the single constant that separates the variants is what showed it:
//
//   physics/fire/fireMesh.js   snoise(vec3)   max(0.6 - ...)   return 42.0 * dot(...)
//   Ramotion/aquarelle         snoise(vec3)   max(0.6 - ...)   return 42.0 * dot(...)   identical to fireMesh
//   felixturner/bad-tv         snoise(vec2)   max(0.5 - ...)                            A DIFFERENT FUNCTION
//
// 2D and 3D simplex are not variants of one another, and 0.5 against 0.6 is not a discrepancy to reconcile --
// each is correct for its own dimension, and each falls out of that dimension's simplex geometry. Had the
// first belief been acted on, bad-tv would have been "consolidated" onto the 3D function and ITS LOOK WOULD
// HAVE CHANGED SILENTLY, which is the exact failure this file exists to prevent. So the two are exported
// separately and named by dimension. A single entry point taking a dimension argument would re-create the
// bug by inviting the caller to think of them as interchangeable.
//
// The genuine duplication was one pair: snoise(vec3), byte-identical between fireMesh and aquarelle after
// whitespace normalisation. That pair is what this consolidates.
"use strict";

/** mod289 / permute / taylorInvSqrt -- shared by BOTH dimensions, so they are emitted once per program. */
export const NOISE_COMMON = [
    "vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }",
    "vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }",
    "vec4 permute(vec4 x) { return mod289(((x * 34.0) + 1.0) * x); }",
    "vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }",
];

/**
 * 3D simplex. The falloff radius is 0.6 and the output scale 42.0 -- BOTH belong to three dimensions and
 * neither may be borrowed by the 2D version.
 */
export const SNOISE3 = [
    "float snoise(vec3 v) {",
    "const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);",
    "const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);",
    "vec3 i  = floor(v + dot(v, C.yyy));",
    "vec3 x0 = v - i + dot(i, C.xxx);",
    "vec3 g = step(x0.yzx, x0.xyz);",
    "vec3 l = 1.0 - g;",
    "vec3 i1 = min(g.xyz, l.zxy);",
    "vec3 i2 = max(g.xyz, l.zxy);",
    "vec3 x1 = x0 - i1 + C.xxx;",
    "vec3 x2 = x0 - i2 + C.yyy;",
    "vec3 x3 = x0 - D.yyy;",
    "i = mod289(i);",
    "vec4 p = permute(permute(permute(i.z + vec4(0.0, i1.z, i2.z, 1.0)) + i.y + vec4(0.0, i1.y, i2.y, 1.0)) + i.x + vec4(0.0, i1.x, i2.x, 1.0));",
    "float n_ = 0.142857142857;",
    "vec3  ns = n_ * D.wyz - D.xzx;",
    "vec4 j = p - 49.0 * floor(p * ns.z * ns.z);",
    "vec4 x_ = floor(j * ns.z);",
    "vec4 y_ = floor(j - 7.0 * x_);",
    "vec4 x = x_ * ns.x + ns.yyyy;",
    "vec4 y = y_ * ns.x + ns.yyyy;",
    "vec4 h = 1.0 - abs(x) - abs(y);",
    "vec4 b0 = vec4(x.xy, y.xy);",
    "vec4 b1 = vec4(x.zw, y.zw);",
    "vec4 s0 = floor(b0) * 2.0 + 1.0;",
    "vec4 s1 = floor(b1) * 2.0 + 1.0;",
    "vec4 sh = -step(h, vec4(0.0));",
    "vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;",
    "vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;",
    "vec3 p0 = vec3(a0.xy, h.x);",
    "vec3 p1 = vec3(a0.zw, h.y);",
    "vec3 p2 = vec3(a1.xy, h.z);",
    "vec3 p3 = vec3(a1.zw, h.w);",
    "vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));",
    "p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;",
    "vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);",
    "m = m * m;",
    "return 42.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));",
    "}",
];

/**
 * 2D simplex. Falloff radius 0.5 and output scale 130.0 -- two dimensions, different geometry, different
 * constants. Named snoise2 rather than overloading snoise, so a shader that pulls in both gets two clearly
 * different functions instead of a GLSL overload set nobody meant to create.
 */
export const SNOISE2 = [
    "float snoise2(vec2 v) {",
    "const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);",
    "vec2 i  = floor(v + dot(v, C.yy));",
    "vec2 x0 = v -   i + dot(i, C.xx);",
    "vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);",
    "vec4 x12 = x0.xyxy + C.xxzz;",
    "x12.xy -= i1;",
    "i = mod289(vec3(i, 0.0)).xy;",
    "vec3 p = permute(permute(vec4(i.y + vec3(0.0, i1.y, 1.0), 0.0)) + vec4(i.x + vec3(0.0, i1.x, 1.0), 0.0)).xyz;",
    "vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), 0.0);",
    "m = m * m; m = m * m;",
    "vec3 x = 2.0 * fract(p * C.www) - 1.0;",
    "vec3 h = abs(x) - 0.5;",
    "vec3 ox = floor(x + 0.5);",
    "vec3 a0 = x - ox;",
    "m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);",
    "vec3 g;",
    "g.x  = a0.x  * x0.x  + h.x  * x0.y;",
    "g.yz = a0.yz * x12.xz + h.yz * x12.yw;",
    "return 130.0 * dot(m, g);",
    "}",
];

/** The 3D block a caller normally wants: helpers plus snoise(vec3). */
export const SNOISE3_BLOCK = [...NOISE_COMMON, ...SNOISE3];
/** The 2D block: the same helpers plus snoise2(vec2). */
export const SNOISE2_BLOCK = [...NOISE_COMMON, ...SNOISE2];

/** The attribution line a shipped shader should carry, so the credit travels with the code. */
export const ASHIMA_CREDIT = "// simplex noise (c) 2011 Ian McEwan, Ashima Arts -- MIT -- github.com/ashima/webgl-noise";
