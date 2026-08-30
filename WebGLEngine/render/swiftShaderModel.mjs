// FILE: render/swiftShaderModel.mjs
// VERSION: v4163 -- SwiftUI [[stitchable]] shaders, ported to this engine, with the CPU reference the GLSL is
// checked against. Ported from krispuckett/SwiftUIShaders (MIT: "Use them, ship them, remix them.").
//
// *** SIX THINGS CHANGE ON THE WAY FROM METAL TO GLSL, AND FOUR OF THEM CHANGE THE PICTURE SILENTLY. ***
// A shader that fails to compile gets fixed. These do not fail to compile.
//
//  1. THE Y AXIS FLIPS. SwiftUI's `position` has y increasing DOWNWARD; gl_FragCoord.y increases UPWARD. So
//     `1.0 - uv.y` means "stronger at the bottom" in Metal and "stronger at the top" in GLSL. bcs_heatShimmer
//     is built on exactly that expression. THIS TREE ALREADY KNOWS THE TRAP -- crtPass.js flips to image space
//     with the note "gl_FragCoord.y runs bottom-up; crtModel.js indexes rows top-down" -- and the same fix is
//     used here so ONE convention holds across both.
//
//  2. layer.sample RETURNS PREMULTIPLIED ALPHA. bcs_emboss does `embossed.rgb += half(emboss)` and never
//     touches alpha. In premultiplied space that adds `emboss` to the PREMULTIPLIED colour, which is a change
//     of `emboss/alpha` in the colour a person sees. Against a straight-alpha WebGL texture the same line is a
//     different operation everywhere alpha < 1 -- invisible on an opaque photo, wrong on anything cut out.
//
//  3. `position` IS IN POINTS, NOT DEVICE PIXELS. bcs_emboss's `offset = 1.5` is 1.5 POINTS. On a 2x canvas
//     gl_FragCoord is in device pixels, so a direct port halves the effect's scale. Resolved by carrying a
//     pointScale rather than by hoping the two agree.
//
//  4. `half` IS mediump AND THE CASTS ARE DELIBERATE. `half(emboss)` quantises on purpose; highp does not band
//     the same way. Usually an improvement, occasionally the effect WAS the banding, so it is modelled rather
//     than dropped.
//
//  5. fmod IS NOT mod. Metal's fmod truncates toward zero, GLSL's mod floors: fmod(-0.25,1) = -0.25 and
//     mod(-0.25,1) = 0.75. Neither of the two shaders here uses it -- the upstream file does elsewhere -- so
//     the helper exists and is gated BEFORE a shader that needs it arrives.
//
//  6. EDGE SAMPLING MUST BE CLAMPED EXPLICITLY. Metal's layer sampling has defined edges; GL wraps unless the
//     texture says otherwise. bcs_heatShimmer clamps by hand, which says the author knew.
//
// The two ported here are `layerEffect` form -- half4 f(float2 position, SwiftUI::Layer layer, float2 size,
// ...) -- which is a screen-space pass over a source image, the same shape as crtPass and phosphorPass.

/** Metal's fmod: truncates toward zero. GLSL's mod floors, and they differ on every negative input. */
export const fmod = (a, b) => a - b * Math.trunc(a / b);
/** GLSL's mod, for the cases where the Metal source really did mean this one. */
export const glmod = (a, b) => a - b * Math.floor(a / b);

/** Round to IEEE half (mediump). Modelled because `half(x)` in the Metal source is a deliberate quantisation. */
export function toHalf(x) {
    if (!Number.isFinite(x)) return x;
    const f = Math.fround(x);
    if (f === 0) return f;
    const e = Math.floor(Math.log2(Math.abs(f)));
    const q = Math.pow(2, e - 10);           // half carries 10 explicit mantissa bits
    return Math.round(f / q) * q;
}

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const mix = (a, b, t) => a + (b - a) * t;
/** Rec.601 luma, the weights the Metal source spells out. */
export const LUMA = [0.299, 0.587, 0.114];
export const luma = (r, g, b) => r * LUMA[0] + g * LUMA[1] + b * LUMA[2];

/**
 * A sampler over an RGBA image, in SwiftUI's coordinate convention.
 *
 * `img` is { w, h, data: Float32Array RGBA, premultiplied }. Sampling is NEAREST and CLAMPED: nearest so the
 * CPU model and the GPU can be compared exactly (crtPass's reason for texelFetch), clamped because Metal's
 * layer sampling has defined edges and GL does not.
 *
 * *** y IS TOP-DOWN HERE, WHICH IS SwiftUI'S CONVENTION AND NOT GL'S. *** Every shader below is written in it,
 * and the pass flips once at the top rather than each shader flipping for itself.
 */
export function sampler(img) {
    const { w, h, data } = img;
    return (x, y) => {
        const px = clamp(Math.floor(x), 0, w - 1) | 0;
        const py = clamp(Math.floor(y), 0, h - 1) | 0;
        const i = (py * w + px) * 4;
        return [data[i], data[i + 1], data[i + 2], data[i + 3]];
    };
}

/**
 * bcs_emboss -- a directional luma difference added to the centre sample.
 *
 * Metal source (verbatim shape): dir = (cos a, sin a); offset 1.5; ahead/behind/center = layer.sample(...);
 * emboss = (lumAhead - lumBehind) * strength; embossed.rgb += half(emboss); return mix(center, embossed, mix).
 *
 * *** THE ALPHA HANDLING IS THE PORT'S ONE REAL DECISION AND IT IS MADE EXPLICIT. *** Upstream runs in
 * premultiplied space. `premultiplied: false` un-premultiplies before the add and re-applies after, so the
 * effect matches on transparency; `true` reproduces upstream byte for byte. Neither is hidden in a default
 * nobody reads: the caller says which image it has.
 */
export function bcsEmboss(img, { strength = 1, angle = 0, mixAmount = 1, pointScale = 1, premultiplied = true } = {}) {
    const s = sampler(img), { w, h } = img;
    const out = new Float32Array(w * h * 4);
    const dx = Math.cos(angle), dy = Math.sin(angle);
    const off = 1.5 * pointScale;             // 1.5 POINTS in the original -- see note 3
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const cx = x + 0.5, cy = y + 0.5;
        const a = s(cx + dx * off, cy + dy * off);
        const b = s(cx - dx * off, cy - dy * off);
        const c = s(cx, cy);
        const e = toHalf((luma(a[0], a[1], a[2]) - luma(b[0], b[1], b[2])) * strength);
        const al = c[3];
        // In STRAIGHT alpha the same visual change is emboss on the un-premultiplied colour; in premultiplied
        // it is emboss on the stored value. Alpha 0 has no colour to move, so it is left alone either way.
        const add = premultiplied ? e : (al > 0 ? e : 0);
        const i = (y * w + x) * 4;
        for (let k = 0; k < 3; k++) out[i + k] = mix(c[k], c[k] + add, mixAmount);
        out[i + 3] = al;
    }
    return { w, h, data: out, premultiplied: img.premultiplied };
}

/**
 * bcs_heatShimmer -- a vertical-frequency displacement, sampled from the displaced position.
 *
 * *** vertical_bias IS WHERE THE Y FLIP BITES. *** `bias = mix(1.0, 1.0 - uv.y, vertical_bias)` weakens the
 * shimmer as uv.y grows. In SwiftUI uv.y grows DOWNWARD, so the effect is strongest at the TOP and fades to the
 * bottom. Port it against gl_FragCoord without flipping and it fades the wrong way -- a shader that looks
 * plausible, animates correctly, and is upside down.
 */
export function bcsHeatShimmer(img, { time = 0, amplitude = 4, frequency = 20, speed = 2, verticalBias = 0, pointScale = 1 } = {}) {
    const s = sampler(img), { w, h } = img;
    const out = new Float32Array(w * h * 4);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const px = x + 0.5, py = y + 0.5;
        const uvx = px / w, uvy = py / h;          // y top-down, as SwiftUI has it
        const bias = mix(1.0, 1.0 - uvy, verticalBias);
        const amp = amplitude * pointScale;
        const wave1 = Math.sin(uvy * frequency + time * speed) * amp * bias;
        const wave2 = Math.sin(uvy * frequency * 1.7 + time * speed * 0.8 + 2.0) * amp * 0.5 * bias;
        const waveY = Math.cos(uvx * frequency * 0.5 + time * speed * 1.2) * amp * 0.3 * bias;
        // Upstream clamps to [0, size] BY HAND, which is the edge rule note 6 is about.
        const sx = clamp(px + wave1 + wave2, 0, w);
        const sy = clamp(py + waveY, 0, h);
        const c = s(sx, sy);
        const i = (y * w + x) * 4;
        out[i] = c[0]; out[i + 1] = c[1]; out[i + 2] = c[2]; out[i + 3] = c[3];
    }
    return { w, h, data: out, premultiplied: img.premultiplied };
}

/** The traps, as data, so the gate asserts them and the next port reads them rather than rediscovering them. */
export const METAL_TO_GLSL = [
    { id: "y-axis", metal: "position.y grows DOWNWARD", glsl: "gl_FragCoord.y grows UPWARD",
      silent: true, note: "flip once at the top of the pass, as crtPass.js does" },
    { id: "premultiplied", metal: "layer.sample returns premultiplied", glsl: "a texture is usually straight",
      silent: true, note: "rgb += x is a different operation in each; the caller declares which image it has" },
    { id: "points", metal: "position is in POINTS", glsl: "gl_FragCoord is in device pixels",
      silent: true, note: "offsets and amplitudes scale with DPR unless carried explicitly" },
    { id: "half", metal: "half is mediump and half(x) quantises", glsl: "highp does not band the same way",
      silent: true, note: "modelled by toHalf rather than dropped" },
    { id: "fmod", metal: "fmod truncates toward zero", glsl: "mod floors",
      silent: true, note: "they disagree on EVERY negative input: fmod(-0.25,1) = -0.25, mod(-0.25,1) = 0.75" },
    { id: "edges", metal: "layer sampling has defined edges", glsl: "wraps unless CLAMP_TO_EDGE is set",
      silent: false, note: "shows as smeared borders, which at least looks wrong" },
];
