// WebGLEngine/render/pcssShadow.mjs -- UNNUMBERED (the version is chosen at ship time).
//
// *** SLICE 5 OF snowflow-lift: PERCENTAGE-CLOSER SOFT SHADOWS IN WORLD UNITS, FROM Noniv/snowflow_demo (MIT, vendor/snowflow). ***
// pcssShadow searches a rotated 8-tap Poisson disc of the shadow map for blockers, converts their mean distance in front of the receiver to METRES (the cascades are orthographic over hundreds of metres, so a
// ratio of raw depth-buffer values rounds to nothing and the filter collapses to a texel -- upstream's account), sizes a 12-tap PCF kernel from it (penumbra = blocker distance x 0.0093 x softness: the sun
// subtends about half a degree), and compares every tap against the RECEIVER'S OWN PLANE extrapolated to where the tap was taken (planeNdcPerUV), which is what stops a grazing sun from reporting level snow as
// its own occluder.
//
// OURS: pcssShadow (CPU twin, f64), PCSS_KERNEL_WGSL (upstream's function body as a compute kernel over a depth map in a storage buffer, sampled bilinear and clamped like upstream's render target), sampleDepth.
// NOT LIFTED: the cascade selection and blending (shadowLookup.wgsl's sunShadow), the light-basis normal-offset bias and the Y-flip convention of Babylon's render targets (all Babylon-specific), and shadows.js.
// NOT DONE: drawing with it.
"use strict";

export const POISSON = Object.freeze([[-0.326, -0.406], [-0.840, -0.074], [-0.696, 0.457], [-0.203, 0.621], [0.962, -0.195], [0.473, -0.480], [0.519, 0.767], [0.185, -0.893], [0.507, 0.064], [0.896, 0.412], [-0.322, -0.933], [-0.792, -0.598]].map((p) => Object.freeze(p)));

/** the depth map: Float32Array(res*res); bilinear, clamp to edge, texel centres at (i + 0.5) / res: what a bilinear clamped sampler returns for textureSampleLevel */
export function sampleDepth(map, res, u, v) {
    const px = Math.min(res - 1, Math.max(0, u * res - 0.5)), py = Math.min(res - 1, Math.max(0, v * res - 0.5)), x0 = Math.floor(px), y0 = Math.floor(py), x1 = Math.min(res - 1, x0 + 1), y1 = Math.min(res - 1, y0 + 1), fx = px - x0, fy = py - y0;
    return (map[y0 * res + x0] * (1 - fx) + map[y0 * res + x1] * fx) * (1 - fy) + (map[y1 * res + x0] * (1 - fx) + map[y1 * res + x1] * fx) * fy;
}

/**
 * upstream's pcssShadow. map/res: the shadow map; uv, receiverDepth (NDC z 0..1), texelSize (one texel in uv), depthRange (m spanned by z 0..1), orthoWidth (m spanned by uv 0..1), softness,
 * noiseRot (radians), biasWorld (m), plane [dz/du, dz/dv] (NDC z per unit UV). Returns the lit fraction 0..1. `detail` (optional object) receives { blockers, blockerDist, penumbraWorld, filterR }.
 */
export function pcssShadow(map, res, uv, receiverDepth, texelSize, depthRange, orthoWidth, softness, noiseRot, biasWorld, plane, detail = null) {
    const bias = biasWorld / depthRange, maxPenumbraUV = Math.min(24 * texelSize, 1.8 / orthoWidth), cs = Math.cos(noiseRot), sn = Math.sin(noiseRot);
    const rot = (p) => [cs * p[0] + sn * p[1], -sn * p[0] + cs * p[1]], clamp01 = (x) => Math.min(1, Math.max(0, x));
    let blockerDepthSum = 0, blockerCount = 0;
    for (let i = 0; i < 8; i++) {
        const o = rot(POISSON[i]).map((c) => c * maxPenumbraUV), s = [clamp01(uv[0] + o[0]), clamp01(uv[1] + o[1])], d = sampleDepth(map, res, s[0], s[1]), cmp = receiverDepth + (o[0] * plane[0] + o[1] * plane[1]) - bias;
        if (d < cmp) { blockerDepthSum += cmp - d; blockerCount += 1; }
    }
    if (blockerCount < 0.5) { if (detail) Object.assign(detail, { blockers: 0 }); return 1; }
    const blockerDist = (blockerDepthSum / blockerCount) * depthRange, penumbraWorld = blockerDist * 0.0093 * softness, filterR = Math.min(maxPenumbraUV, Math.max(texelSize, penumbraWorld / orthoWidth));
    if (detail) Object.assign(detail, { blockers: blockerCount, blockerDist, penumbraWorld, filterR });
    let lit = 0;
    for (let i = 0; i < 12; i++) {
        const o = rot(POISSON[i]).map((c) => c * filterR), s = [clamp01(uv[0] + o[0]), clamp01(uv[1] + o[1])], d = sampleDepth(map, res, s[0], s[1]), cmp = receiverDepth + (o[0] * plane[0] + o[1] * plane[1]) - bias;
        lit += d < cmp ? 0 : 1;
    }
    return lit / 12;
}

/**
 * The same function as a compute kernel. Bindings: 0 out (rw f32, one lit fraction per query), 1 params (uniform: res, texelSize, depthRange, orthoWidth, softness, biasWorld + 2 pad), 2 map (ro f32, res*res),
 * 3 queries (ro f32, 8 per query: u, v, receiverDepth, noiseRot, planeU, planeV, pad, pad). Dispatch ceil(n / 64).
 */
export const PCSS_KERNEL_WGSL = /* wgsl */ `
struct Params { res: f32, texelSize: f32, depthRange: f32, orthoWidth: f32, softness: f32, biasWorld: f32, pad0: f32, pad1: f32 };
@group(0) @binding(0) var<storage, read_write> outBuf: array<f32>;
@group(0) @binding(1) var<uniform> U: Params;
@group(0) @binding(2) var<storage, read> mapBuf: array<f32>;
@group(0) @binding(3) var<storage, read> queries: array<f32>;

fn mapAt(x: i32, y: i32) -> f32 {
    let r = i32(U.res);
    return mapBuf[u32(clamp(y, 0, r - 1) * r + clamp(x, 0, r - 1))];
}
// what textureSampleLevel does on a bilinear, clamp-to-edge sampler over the map
fn sampleMap(uv: vec2f) -> f32 {
    let p = clamp(uv * U.res - 0.5, vec2f(0.0), vec2f(U.res - 1.0));
    let b = floor(p);
    let f = p - b;
    let x0 = i32(b.x);
    let y0 = i32(b.y);
    return mix(mix(mapAt(x0, y0), mapAt(x0 + 1, y0), f.x), mix(mapAt(x0, y0 + 1), mapAt(x0 + 1, y0 + 1), f.x), f.y);
}

const POISSON: array<vec2f, 12> = array<vec2f, 12>(
    vec2f(-0.326, -0.406), vec2f(-0.840, -0.074), vec2f(-0.696,  0.457),
    vec2f(-0.203,  0.621), vec2f( 0.962, -0.195), vec2f( 0.473, -0.480),
    vec2f( 0.519,  0.767), vec2f( 0.185, -0.893), vec2f( 0.507,  0.064),
    vec2f( 0.896,  0.412), vec2f(-0.322, -0.933), vec2f(-0.792, -0.598)
);

// ---- upstream lib/shading.wgsl pcssShadow, body unchanged except the texture fetch
fn pcssShadow(
    uv: vec2f,
    receiverDepth: f32,
    texelSize: f32,
    depthRange: f32,
    orthoWidth: f32,
    softness: f32,
    noiseRot: f32,
    biasWorld: f32,
    planeNdcPerUV: vec2f
) -> f32 {
    let bias = biasWorld / depthRange;
    let planeAt = planeNdcPerUV;
    let maxPenumbraUV = min(24.0 * texelSize, 1.8 / orthoWidth);
    let cs = cos(noiseRot);
    let sn = sin(noiseRot);
    let rot = mat2x2f(cs, -sn, sn, cs);
    var blockerDepthSum = 0.0;
    var blockerCount = 0.0;
    for (var i = 0; i < 8; i++) {
        let off = rot * POISSON[i] * maxPenumbraUV;
        let s = clamp(uv + off, vec2f(0.0), vec2f(1.0));
        let d = sampleMap(s);
        let cmp = receiverDepth + dot(off, planeAt) - bias;
        if (d < cmp) {
            blockerDepthSum += cmp - d;
            blockerCount += 1.0;
        }
    }
    if (blockerCount < 0.5) { return 1.0; }
    let blockerDist = (blockerDepthSum / blockerCount) * depthRange;
    let penumbraWorld = blockerDist * 0.0093 * softness;
    let filterR = clamp(penumbraWorld / orthoWidth, texelSize, maxPenumbraUV);
    var lit = 0.0;
    for (var i = 0; i < 12; i++) {
        let off = rot * POISSON[i] * filterR;
        let s = clamp(uv + off, vec2f(0.0), vec2f(1.0));
        let d = sampleMap(s);
        let cmp = receiverDepth + dot(off, planeAt) - bias;
        lit += select(1.0, 0.0, d < cmp);
    }
    return lit / 12.0;
}

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3u) {
    let i = gid.x;
    if (i >= arrayLength(&queries) / 8u) { return; }
    let o = i * 8u;
    outBuf[i] = pcssShadow(vec2f(queries[o], queries[o + 1u]), queries[o + 2u], U.texelSize, U.depthRange, U.orthoWidth, U.softness, queries[o + 3u], U.biasWorld, vec2f(queries[o + 4u], queries[o + 5u]));
}
`;

/** POISSON and pcssShadow as WGSL text; a shader that includes it defines sampleMap(uv: vec2f) -> f32 over its own shadow map */
export const PCSS_WGSL = PCSS_KERNEL_WGSL.slice(PCSS_KERNEL_WGSL.indexOf("const POISSON"), PCSS_KERNEL_WGSL.indexOf("@compute"));

export function reportLines() {
    return ["[pcssShadow] percentage-closer SOFT shadows in world units: 8-tap blocker search, penumbra = blocker distance x 0.0093 x softness, 12-tap PCF, depth compared on the receiver's own plane",
        "  cascade selection, the normal-offset bias and the render-target Y flip are Babylon's and are not lifted"];
}
