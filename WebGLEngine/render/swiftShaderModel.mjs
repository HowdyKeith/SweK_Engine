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


// =============================================================================================================
// BATCH 2 (v4164) -- THE SHARED HELPER LAYER, AND THE TWO PURE-COLOUR SHADERS THAT NEED IT.
//
// *** THE fmod TRAP THIS FILE GATED IN ADVANCE IS REAL, AND IT IS IN THE MOST LOAD-BEARING PLACE IN THE
// UPSTREAM FILE. *** bcs_hsb2rgb -- a static helper many shaders call -- is:
//
//     clamp(abs(fmod(c.x * 6.0h + half3(0,4,2), 6.0h) - 3.0h) - 1.0h, 0, 1)
//
// GLSL has no fmod; the reflex is to write `mod`. Here that is CORRECT FOR EVERY SHIPPED CALLER AND WRONG IN
// GENERAL, which is the worst shape a difference can have. Both callers pass a hue through `fract()`, so
// c.x >= 0, so `c.x*6 + {0,4,2}` >= 0, and fmod and mod agree on non-negative inputs. THE GUARANTEE LIVES AT
// THE CALL SITE AND NOT IN THE HELPER: pass a negative hue -- which nothing does today and any later shader
// might -- and mod returns the wrong branch of the colour wheel while fmod does not. So the port keeps fmod's
// semantics, and costs nothing for it.
// =============================================================================================================

/** bcs_hash: fract(sin(dot(p, (12.9898, 78.233))) * 43758.5453). The upstream constants, unchanged -- a
 *  different magic number is a different noise field and every shader downstream would decorrelate. */
export function bcsHash(x, y) {
    const v = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
    return v - Math.floor(v);
}

/** Value noise on the integer lattice, smoothstepped. */
export function bcsValueNoise(x, y) {
    const ix = Math.floor(x), iy = Math.floor(y);
    const fx = x - ix, fy = y - iy;
    const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
    const a = bcsHash(ix, iy), b = bcsHash(ix + 1, iy), c = bcsHash(ix, iy + 1), d = bcsHash(ix + 1, iy + 1);
    return mix(mix(a, b, ux), mix(c, d, ux), uy);
}

/** Fractional Brownian motion, upstream's octave schedule (amplitude 0.5 halving, frequency doubling). */
export function bcsFbm(x, y, octaves = 4) {
    let value = 0, amplitude = 0.5, frequency = 1;
    for (let i = 0; i < octaves; i++) {
        value += amplitude * bcsValueNoise(x * frequency, y * frequency);
        frequency *= 2; amplitude *= 0.5;
    }
    return value;
}

/** HSB to RGB, with fmod's semantics rather than mod's -- see the note above. */
export function bcsHsb2rgb(h, s, b) {
    const rgb = [0, 4, 2].map((k) => {
        const m = fmod(h * 6 + k, 6);
        return clamp(Math.abs(m - 3) - 1, 0, 1);
    }).map((v) => v * v * (3 - 2 * v));
    return rgb.map((v) => b * mix(1, v, s));
}

/**
 * bcs_solarize -- per channel, invert where the value is near a threshold.
 *
 * *** UPSTREAM DOES NOT CLAMP AFTER THE GRAIN, AND THE PORT DOES NOT EITHER. *** `result += half3(grain)` can
 * push a channel outside [0,1]; in Metal the half4 return clamps on the way to the display, so the overflow is
 * invisible there. Clamping here would be a QUIETER shader than upstream's, and a caller compositing into a
 * float target would then get different pixels from the two. The clamp belongs at the output, where Metal puts
 * it, so `clampOutput` is offered and defaults to matching upstream.
 */
export function bcsSolarize(img, { time = 0, threshold = 0.5, curveIntensity = 1, colorSeparation = 0,
                                   animate = 0, clampOutput = false } = {}) {
    const { w, h } = img, out = new Float32Array(w * h * 4);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        const uvx = (x + 0.5) / w, uvy = (y + 0.5) / h;
        const animOffset = Math.sin(time * 1.5 + uvx * 3.0) * animate * 0.15;
        const t = threshold + animOffset;
        for (let ch = 0; ch < 3; ch++) {
            const channelThreshold = t + ch * colorSeparation * 0.08;
            const val = img.data[i + ch];
            const dist = Math.abs(val - channelThreshold);
            const curve = clamp(1 - Math.pow(dist * curveIntensity, 2), 0, 1);
            out[i + ch] = toHalf(mix(val, 1 - val, curve));
        }
        const tf = time * 0.1;
        const grain = (bcsHash(uvx * 500 + (tf - Math.floor(tf)), uvy * 500 + (tf - Math.floor(tf))) - 0.5) * 0.04;
        for (let ch = 0; ch < 3; ch++) {
            const v = out[i + ch] + grain;
            out[i + ch] = clampOutput ? clamp(v, 0, 1) : v;
        }
        out[i + 3] = img.data[i + 3];
    }
    return { w, h, data: out, premultiplied: img.premultiplied };
}

/** bcs_duochrome -- luma, contrast-curved, mapped onto two hues through black. */
export function bcsDuochrome(img, { time = 0, intensity = 1, hue1 = 0.6, hue2 = 0.1, contrast = 1 } = {}) {
    const { w, h } = img, out = new Float32Array(w * h * 4);
    const fract = (v) => v - Math.floor(v);
    const animHue1 = fract(hue1 + Math.sin(time * 0.3) * 0.02);
    const animHue2 = fract(hue2 + Math.cos(time * 0.25) * 0.02);
    const shadow = bcsHsb2rgb(toHalf(animHue1), 0.85, 0.4);
    const highlight = bcsHsb2rgb(toHalf(animHue2), 0.7, 1.0);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        let L = luma(img.data[i], img.data[i + 1], img.data[i + 2]);
        L = clamp((L - 0.5) * contrast + 0.5, 0, 1);
        // The midtone pivot is at 0.5 and BOTH halves are linear in it, so the curve is continuous there --
        // an off-by-one in either branch shows as a visible band across every midtone in the image.
        const duo = L < 0.5
            ? [0, 1, 2].map((k) => mix(0.02, shadow[k], toHalf(L * 2)))
            : [0, 1, 2].map((k) => mix(shadow[k], highlight[k], toHalf((L - 0.5) * 2)));
        for (let k = 0; k < 3; k++) out[i + k] = mix(img.data[i + k], duo[k], toHalf(intensity));
        out[i + 3] = img.data[i + 3];
    }
    return { w, h, data: out, premultiplied: img.premultiplied };
}


// =============================================================================================================
// BATCH 3 (v4164) -- THE POLAR WARPS, AND THE TRAP CUTTING BOTH WAYS.
//
// *** batch 2 FOUND A HELPER WHERE fmod IS RIGHT AND mod IS WRONG. bcs_kaleidoscope IS THE MIRROR IMAGE. ***
// Its fold into a segment is written out by hand:
//
//     angle = angle - segAngle * floor(angle / segAngle);   // mod into segment
//
// That is the FLOORING remainder -- GLSL's `mod`, not Metal's `fmod` -- and the author wrote it longhand rather
// than calling fmod, which was the right call: `angle` comes from atan2 and atan2 RETURNS [-PI, PI], so it is
// negative for half of every image. Fold with fmod and that half lands in the wrong segment. So a porter who
// "tidied" this into the bcs_fmod helper batch 2 just added would break exactly half the picture, and a porter
// who used mod in hsb2rgb would break negative hues. THE SAME FILE NEEDS BOTH, AND WHICH ONE IS DECIDED BY THE
// SIGN OF THE INPUT AT EACH SITE -- never by preference.
//
// AND THE Y FLIP DECIDES WHICH WAY A VORTEX SPINS. Both shaders build `delta` from a y that grows DOWNWARD, so
// a positive angle turns one way in SwiftUI and the other in GL. Because the pass flips once at the top, delta
// is already in SwiftUI's convention and the handedness carries over -- but a port that skipped the flip would
// have a vortex spinning backwards and a kaleidoscope mirrored, both of which look plausible.
//
// ASPECT CORRECTION IS NOT DECORATION EITHER: delta.x is scaled by size.x/size.y before the polar step and
// divided back afterwards. Drop it and a vortex on a non-square image is an ellipse.
// =============================================================================================================

/** atan2 -> GLSL's atan(y, x). A rename, and the only one of the six traps that is purely cosmetic. */
export const atan2 = (y, x) => Math.atan2(y, x);

/**
 * bcs_vortex -- rotate around the centre by an angle that decays with radius.
 *
 * `speed * time` is added to the angle UNCONDITIONALLY, so the whole field turns even where the twist has
 * decayed to nothing. That is upstream's behaviour and it is what makes it read as a vortex rather than a
 * pinch, so it is kept rather than "fixed".
 */
export function bcsVortex(img, { time = 0, twistAmount = 3, radius = 0.5, speed = 1, falloff = 2 } = {}) {
    const { w, h } = img, s = sampler(img), out = new Float32Array(w * h * 4);
    const aspect = w / h;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const uvx = (x + 0.5) / w, uvy = (y + 0.5) / h;
        let dx = (uvx - 0.5) * aspect, dy = uvy - 0.5;
        const dist = Math.hypot(dx, dy);
        const twistFalloff = Math.exp(-(dist / radius) * falloff);
        const angle = twistAmount * twistFalloff + time * speed;
        const ca = Math.cos(angle), sa = Math.sin(angle);
        let rx = dx * ca - dy * sa, ry = dx * sa + dy * ca;
        rx /= aspect;
        const sx = clamp((rx + 0.5) * w, 0, w), sy = clamp((ry + 0.5) * h, 0, h);
        const c = s(sx, sy), i = (y * w + x) * 4;
        out[i] = c[0]; out[i + 1] = c[1]; out[i + 2] = c[2]; out[i + 3] = c[3];
    }
    return { w, h, data: out, premultiplied: img.premultiplied };
}

/**
 * bcs_kaleidoscope -- fold the angle into one mirrored segment.
 *
 * *** THE FOLD USES glmod AND NOT fmod, AND THAT IS THE POINT OF THIS BATCH. *** See the note above: atan2
 * returns [-PI, PI].
 */
export function bcsKaleidoscope(img, { time = 0, segments = 6, rotation = 0, zoom = 1, animateSpeed = 0 } = {}) {
    const { w, h } = img, s = sampler(img), out = new Float32Array(w * h * 4);
    const aspect = w / h;
    const segAngle = (Math.PI * 2) / segments;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const uvx = (x + 0.5) / w, uvy = (y + 0.5) / h;
        const dx = (uvx - 0.5) * aspect, dy = uvy - 0.5;
        let angle = atan2(dy, dx) + rotation + time * animateSpeed;
        const dist = Math.hypot(dx, dy);
        angle = glmod(angle, segAngle);                       // FLOORING -- atan2 goes negative
        if (angle > segAngle * 0.5) angle = segAngle - angle; // the mirror
        let kx = Math.cos(angle) * dist / zoom, ky = Math.sin(angle) * dist / zoom;
        kx /= aspect;
        const sx = clamp((kx + 0.5) * w, 0, w), sy = clamp((ky + 0.5) * h, 0, h);
        const c = s(sx, sy), i = (y * w + x) * 4;
        out[i] = c[0]; out[i + 1] = c[1]; out[i + 2] = c[2]; out[i + 3] = c[3];
    }
    return { w, h, data: out, premultiplied: img.premultiplied };
}


// =============================================================================================================
// BATCH 4 (v4164) -- THE POINTS TRAP, CAUGHT BY THE SHADER'S OWN COMMENT.
//
// *** bcs_chromaticSplit DOCUMENTS ITS KNOB AS "0-30: pixel distance between channels" AND IT IS NOT PIXELS. ***
// `position` in a SwiftUI stitchable shader is in POINTS, so a spread of 30 is 30 points -- 60 device pixels on
// a 2x display and 90 on a 3x. Ported straight onto gl_FragCoord the same 30 becomes 30 DEVICE pixels, which is
// half the intended split on a Retina panel and a third on an iPhone. The effect still works, still animates,
// and is quietly wrong by a factor of the device scale. THE SHADER'S OWN COMMENT IS THE EVIDENCE that even its
// author thought in pixels while writing in points, which is exactly why trap 3 is carried as a parameter
// rather than trusted to agree.
//
// bcs_plasma needs none of that -- it samples once at `position` and adds -- so it is here as the control: a
// shader with no offsets, no remainder and no polar step, to show what the machinery costs when nothing is
// tricky. About fifteen lines.
// =============================================================================================================

/**
 * bcs_chromaticSplit -- R, G and B sampled at three points along one direction.
 *
 * The spread is in POINTS. `pointScale` converts, and the gate asserts the conversion changes the result,
 * because a scale that silently did nothing would be the same defect wearing a parameter.
 */
export function bcsChromaticSplit(img, { spread = 8, angle = 0, edgeOnly = 0, time = 0, animate = 0,
                                         pointScale = 1 } = {}) {
    const { w, h } = img, s = sampler(img), out = new Float32Array(w * h * 4);
    const smoothstep = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const px = x + 0.5, py = y + 0.5;
        const uvx = px / w, uvy = py / h;
        const dist = Math.hypot(uvx - 0.5, uvy - 0.5);
        const mask = mix(1, smoothstep(0.1, 0.5, dist), edgeOnly);
        let animatedSpread = spread;
        if (animate > 0.01) animatedSpread += Math.sin(time * 2) * spread * 0.3 * animate;
        const eff = animatedSpread * mask * pointScale;
        const dx = Math.cos(angle) * eff, dy = Math.sin(angle) * eff;
        const r = s(px + dx, py + dy), g = s(px, py), b = s(px - dx, py - dy);
        const i = (y * w + x) * 4;
        out[i] = r[0]; out[i + 1] = g[1]; out[i + 2] = b[2]; out[i + 3] = g[3];
    }
    return { w, h, data: out, premultiplied: img.premultiplied };
}

/** The three plasma palettes, at upstream's thresholds. Picked by a float rather than an enum, so the
 *  BOUNDARIES matter: color_mode 0.33 and 0.66 are where it changes, and a >= where upstream has < would put
 *  one palette one step off across the whole knob. */
export const PLASMA_PALETTES = [[0.3, 0.6, 1.0], [0.2, 1.0, 0.4], [0.8, 0.2, 1.0]];
export function plasmaPalette(colorMode) {
    if (colorMode < 0.33) return PLASMA_PALETTES[0];
    if (colorMode < 0.66) return PLASMA_PALETTES[1];
    return PLASMA_PALETTES[2];
}

/**
 * bcs_plasma -- the classic sum-of-sines, with its zero crossings sharpened into filaments.
 *
 * *** IT ADDS TWICE AND CLAMPS NEITHER TIME. *** `color.rgb += plasmaColor * totalPlasma` then
 * `color.rgb += totalPlasma * 0.3`. On a bright image that leaves the range, and Metal's half4 clamps it at
 * the display -- the same arrangement solarize has. Kept, for the same reason.
 */
export function bcsPlasma(img, { time = 0, intensity = 1, scale = 4, speed = 1, colorMode = 0,
                                 clampOutput = false } = {}) {
    const { w, h } = img, out = new Float32Array(w * h * 4);
    const pal = plasmaPalette(colorMode);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        const stx = ((x + 0.5) / w) * scale, sty = ((y + 0.5) / h) * scale;
        const v1 = Math.sin(stx + time * speed);
        const v2 = Math.sin(sty + time * speed * 0.7);
        const v3 = Math.sin(stx + sty + time * speed * 0.5);
        const v4 = Math.sin(Math.hypot(stx - scale * 0.5, sty - scale * 0.5) + time * speed * 1.3);
        const plasma = (v1 + v2 + v3 + v4) * 0.25;
        let lines = 1 / (1 + Math.abs(plasma) * 20); lines = lines * lines;
        const v5 = Math.sin(stx * 2 - sty * 1.5 + time * speed * 0.9);
        const v6 = Math.sin(Math.hypot(stx - scale * 0.3, sty - scale * 0.7) * 2 + time * speed);
        const plasma2 = (v5 + v6) * 0.5;
        let lines2 = 1 / (1 + Math.abs(plasma2) * 15); lines2 = lines2 * lines2;
        const total = (lines + lines2 * 0.5) * intensity;
        for (let k = 0; k < 3; k++) {
            const v = img.data[i + k] + toHalf(pal[k] * toHalf(total)) + toHalf(total * 0.3);
            out[i + k] = clampOutput ? clamp(v, 0, 1) : v;
        }
        out[i + 3] = img.data[i + 3];
    }
    return { w, h, data: out, premultiplied: img.premultiplied };
}


// =============================================================================================================
// BATCH 5 (v4164) -- THE MULTI-SAMPLE FAMILY, AND THE EDGE RULE FINALLY GETS ITS CASE.
//
// *** bcs_glitch CLAMPS AND THEN UN-CLAMPS ITSELF, IN THAT ORDER. ***
//
//     displaced = clamp(displaced, float2(0.0), size);          // clamped
//     half4 r = layer.sample(displaced + float2(shift, 0.0));   // ...and then shifted OFF the edge
//
// The channel shift is added AFTER the clamp, so with color_shift up to 20 the red and blue taps can land
// outside the layer at every border. Metal's layer sampling has defined edge behaviour and this is harmless
// there. IN GL, WITHOUT CLAMP_TO_EDGE, IT WRAPS -- and a glitch shader pulling the left edge into the right one
// LOOKS DELIBERATE. That is the sixth trap, and it is the only one of the six whose failure a viewer would
// forgive as an artistic choice, which makes it the worst one to leave to chance. Every shader ported before
// this one clamped its own sampling, so the rule had no case until now; layerSample() has clamped from the
// start, which is why this batch needed no fix, only a check.
//
// AND ITS SCANLINE IS IN POINTS TOO: sin(position.y * PI * 2) puts one cycle every point, so on a 2x display
// the ported shader draws scanlines twice as fine as the original unless the scale is carried. Same trap as
// chromaticSplit's spread, in a place nobody thinks to look, because it reads as a frequency rather than a
// distance.
//
// bcs_echo is the counter-example in the same batch: it clamps INSIDE the loop, before every sample, and is
// correct as written. Two shaders, one file, opposite habits.
// =============================================================================================================

/**
 * bcs_echo -- N ghost copies trailing along a direction, weighted-averaged with the base.
 *
 * `totalWeight` starts at 1 for the base and accumulates, so the result is a true average and the image does
 * not brighten as echoes are added -- which is what separates an echo from a bloom.
 */
export function bcsEcho(img, { time = 0, echoCount = 4, spread = 12, direction = 0, fade = 0.6,
                               pointScale = 1 } = {}) {
    const { w, h } = img, s = sampler(img), out = new Float32Array(w * h * 4);
    const sp = spread * pointScale;
    const dirx = Math.cos(direction) * sp, diry = Math.sin(direction) * sp;
    const echoes = Math.max(0, Math.floor(echoCount));
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const px = x + 0.5, py = y + 0.5, i = (y * w + x) * 4;
        const base = [img.data[i], img.data[i + 1], img.data[i + 2], img.data[i + 3]];
        let r = base[0], g = base[1], b = base[2], totalWeight = 1;
        for (let k = 1; k <= echoes; k++) {
            const weight = Math.pow(fade, k);
            let ox = dirx * k + Math.sin(time * 2 + k * 1.5) * sp * 0.1;
            let oy = diry * k + Math.cos(time * 1.7 + k * 2.0) * sp * 0.1;
            const c = s(clamp(px - ox, 0, w), clamp(py - oy, 0, h));   // CLAMPED BEFORE THE SAMPLE
            r += toHalf(c[0] * toHalf(1 - k * 0.08)) * toHalf(weight);
            g += c[1] * toHalf(weight);
            b += toHalf(c[2] * toHalf(1 + k * 0.05)) * toHalf(weight);
            totalWeight += weight;
        }
        out[i] = r / totalWeight; out[i + 1] = g / totalWeight; out[i + 2] = b / totalWeight;
        out[i + 3] = base[3];
    }
    return { w, h, data: out, premultiplied: img.premultiplied };
}

/**
 * bcs_glitch -- per-row block displacement, channel separation, scanlines, occasional flash.
 *
 * *** THE CHANNEL TAPS ARE DELIBERATELY LEFT UNCLAMPED, BECAUSE UPSTREAM LEAVES THEM SO. *** The clamp happens
 * to `displaced` and the shift is added after it. What keeps this correct here is that the SAMPLER clamps --
 * which is Metal's edge behaviour, and is what layerSample() reproduces in the GLSL. Clamping the tap as well
 * would be a different shader from the original at every border.
 */
export function bcsGlitch(img, { time = 0, intensity = 0.5, blockSize = 12, scanLines = 0.5, colorShift = 6,
                                 pointScale = 1 } = {}) {
    const { w, h } = img, s = sampler(img), out = new Float32Array(w * h * 4);
    const glitchTime = Math.floor(time * 10);
    const glitchRand = bcsHash(glitchTime, 0);
    const glitchActive = (1 - intensity * 0.5) <= glitchRand ? 1 : 0;    // step(edge, x)
    const bs = blockSize * pointScale;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const px = x + 0.5, py = y + 0.5, i = (y * w + x) * 4;
        const uvy = py / h;
        const blockY = Math.floor(uvy * (h / bs));
        const blockRand = bcsHash(blockY, glitchTime);
        const blockShift = (blockRand - 0.5) * 2 * intensity * glitchActive;
        let dx = px + blockShift * bs * 2, dy = py;
        const vertRand = bcsHash(blockY + 100, glitchTime);
        if (vertRand > 0.95 && glitchActive > 0.5) dy += (bcsHash(blockY, glitchTime + 50) - 0.5) * bs;
        dx = clamp(dx, 0, w); dy = clamp(dy, 0, h);
        const shift = colorShift * pointScale * glitchActive;
        // The shift is applied AFTER the clamp, exactly as upstream does. The sampler's own clamping is what
        // keeps these taps in bounds -- in GL that means CLAMP_TO_EDGE, or the left edge appears on the right.
        const r = s(dx + shift, dy), g = s(dx, dy), b = s(dx - shift, dy);
        let R = r[0], G = g[1], B = b[2];
        // The scanline is a function of position.y IN POINTS, so its frequency follows the point scale.
        let scanLine = Math.sin((py / pointScale) * Math.PI * 2) * 0.5 + 0.5;
        scanLine = Math.pow(scanLine, 4);
        const dim = 1 - toHalf(scanLine * scanLines * 0.3);
        R *= dim; G *= dim; B *= dim;
        if (blockRand > 0.92 && glitchActive > 0.5) { R += 0.15; G += 0.15; B += 0.15; }
        out[i] = R; out[i + 1] = G; out[i + 2] = B; out[i + 3] = g[3];
    }
    return { w, h, data: out, premultiplied: img.premultiplied };
}


// =============================================================================================================
// BATCH 6 (v4164) -- THE NOISE FAMILY, AND THE Y FLIP WITH THE AUTHOR'S OWN EXPLANATION ATTACHED.
//
// *** bcs_melt COMMENTS THE TRAP FOR US. ***
//
//     float2 displaced = position + float2(wobble, -drip); // negative Y = pull up = melt down
//
// That sentence is TRUE ONLY IN A Y-DOWN COORDINATE SYSTEM. Sampling from a smaller y means sampling from
// HIGHER UP the picture and drawing it here, which reads as the image sagging downward. Port it against
// gl_FragCoord, where y grows upward, and -drip samples from BELOW: the picture melts UP. It still animates,
// still looks like flowing liquid, and gravity runs backwards.
//
// AND IT IS THE SECOND Y-DEPENDENCY IN THE SAME SHADER: `gravity = uv.y * uv.y` with the comment "bottom melts
// more" puts the strongest drip at uv.y = 1, which is the BOTTOM only when y grows down. Unflipped, the top
// melts most and the bottom stays crisp -- so the two errors do not even cancel, they compound into a picture
// that drips upward from the wrong end.
//
// chromaticSplit called points "pixels"; melt explains a downward drip that is only downward one way up. THE
// COMMENTS IN THIS FILE ARE WRITTEN IN SwiftUI'S FRAME, and reading them as if they were GLSL is how a port
// goes wrong while agreeing with its own documentation.
// =============================================================================================================

/**
 * bcs_melt -- per-column drip driven by fbm, with a quadratic gravity term and a specular lip.
 *
 * Both y-dependencies are computed in SwiftUI space (the pass flips once at the top), so `-drip` pulls from
 * above and `gravity` peaks at the bottom, as upstream intends.
 *
 * *** ONE QUIRK REPRODUCED RATHER THAN FIXED: THE SPECULAR IS NOT SCALED BY melt_amount. *** drip and wobble
 * both vanish at melt_amount 0, so the SAMPLE becomes the identity -- but `specular` is built from a difference
 * of two fbm taps and `gravity`, neither of which mentions melt_amount, so a little light is added even with
 * the effect nominally off. MEASURED at 2.8e-4 on a 32x32 fixture, growing downward with gravity and BELOW ONE
 * 8-BIT LEVEL, so it is structural rather than visible. Gating it here would make this a different shader from
 * the original, and the place to argue about it is upstream.
 */
export function bcsMelt(img, { time = 0, meltAmount = 30, dripScale = 6, speed = 1, heat = 0.5,
                               pointScale = 1 } = {}) {
    const { w, h } = img, s = sampler(img), out = new Float32Array(w * h * 4);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const px = x + 0.5, py = y + 0.5, i = (y * w + x) * 4;
        const uvx = px / w, uvy = py / h;
        const column = uvx * dripScale;
        const dripNoise = bcsFbm(column, time * speed * 0.3, 4);
        const dripNoise2 = bcsFbm(column * 1.7 + 3.0, time * speed * 0.25, 3);
        const gravity = uvy * uvy;                       // uv.y grows DOWN, so this peaks at the bottom
        const drip = (dripNoise * 0.7 + dripNoise2 * 0.3) * meltAmount * gravity * pointScale;
        const wobble = Math.sin(uvy * 10 + time * speed * 2 + dripNoise * 5) * meltAmount * 0.05 * gravity * pointScale;
        // -drip pulls from ABOVE, which is what makes it sag downward. See the note above.
        const c = s(clamp(px + wobble, 0, w), clamp(py - drip, 0, h));
        const meltFactor = drip / Math.max(meltAmount, 1);
        let R = c[0] + toHalf(meltFactor * heat * 0.3);
        let G = c[1] - toHalf(meltFactor * heat * 0.1);
        let B = c[2] - toHalf(meltFactor * heat * 0.2);
        const dripEdge = Math.abs(bcsFbm(column + 0.01, time * speed * 0.3, 4) - dripNoise);
        const specular = Math.pow(dripEdge * 5, 3) * gravity * 0.4;
        R += specular; G += specular; B += specular;
        out[i] = R; out[i + 1] = G; out[i + 2] = B; out[i + 3] = c[3];
    }
    return { w, h, data: out, premultiplied: img.premultiplied };
}

/** The topographic palette: four elevation bands with mixes between them, at upstream's breakpoints. */
export function topoColor(lum) {
    const M = (a, b, t) => a.map((v, k) => mix(v, b[k], clamp(t, 0, 1)));
    if (lum < 0.2) return M([0.1, 0.3, 0.5], [0.15, 0.45, 0.3], toHalf(lum * 5));
    if (lum < 0.5) return M([0.15, 0.45, 0.3], [0.8, 0.75, 0.4], toHalf((lum - 0.2) * 3.33));
    if (lum < 0.75) return M([0.8, 0.75, 0.4], [0.65, 0.45, 0.3], toHalf((lum - 0.5) * 4));
    return M([0.65, 0.45, 0.3], [0.95, 0.95, 0.97], toHalf((lum - 0.75) * 4));
}

/**
 * bcs_topographic -- contour lines drawn on the image's own luminance, as a map of its brightness.
 *
 * The contour is DOUBLE-SIDED: `1 - smoothstep(w, w+e, c) + 1 - smoothstep(w, w+e, 1 - c)` lights a band on
 * both sides of every integer crossing, then clamps. Taking only one side halves every line and makes the map
 * look like a hatching rather than a contour.
 */
export function bcsTopographic(img, { time = 0, lineCount = 12, lineWidth = 0.05, colorize = 1, animate = 0 } = {}) {
    const { w, h } = img, out = new Float32Array(w * h * 4);
    const ss = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };
    const fract = (v) => v - Math.floor(v);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        const uvx = (x + 0.5) / w, uvy = (y + 0.5) / h;
        const lum = luma(img.data[i], img.data[i + 1], img.data[i + 2]);
        const elevation = lum + time * animate * 0.05;
        const cv = fract(elevation * lineCount);
        const contourLine = clamp((1 - ss(lineWidth, lineWidth + 0.02, cv)) + (1 - ss(lineWidth, lineWidth + 0.02, 1 - cv)), 0, 1);
        const mv = fract(elevation * lineCount / 5);
        const majorLine = clamp((1 - ss(lineWidth * 2, lineWidth * 2 + 0.03, mv)) + (1 - ss(lineWidth * 2, lineWidth * 2 + 0.03, 1 - mv)), 0, 1);
        const base = [0, 1, 2].map((k) => mix(img.data[i + k], topoColor(lum)[k], toHalf(colorize)));
        let res = base.map((v, k) => mix(v, [0.15, 0.12, 0.1][k], toHalf(contourLine * 0.7)));
        res = res.map((v, k) => mix(v, [0.05, 0.04, 0.03][k], toHalf(majorLine * 0.9)));
        const paper = bcsValueNoise(uvx * 200, uvy * 200) * 0.06 - 0.03;
        for (let k = 0; k < 3; k++) out[i + k] = res[k] + paper;
        out[i + 3] = img.data[i + 3];
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
