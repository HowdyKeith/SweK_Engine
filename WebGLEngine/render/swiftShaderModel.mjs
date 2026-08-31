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
export const HALF_MAX = 65504;                 // largest finite half
export const HALF_MIN_EXP = -14;               // exponent of the smallest NORMAL half, 2^-14
export const HALF_MIN_SUBNORMAL = Math.pow(2, -24);   // 5.96e-8 -- below half of this, a half IS zero

/**
 * Round to IEEE half (mediump). Modelled because `half(x)` in the Metal source is a deliberate quantisation.
 *
 * *** v4196 -- THIS MODELLED half'S MANTISSA AND NOT ITS EXPONENT RANGE, AND THE GLSL COPY TURNED THAT INTO
 * NaN. *** Both halves quantised to 10 mantissa bits at ANY exponent. A half has five exponent bits: it
 * cannot represent 1e-35 at all, and the true answer there is 0. The CPU version silently kept full double
 * precision; the GLSL version computed exp2(e - 10) for e = -116, and dividing by that returned Inf, so
 * floor(Inf + 0.5) * q was NaN -- a black pixel, and NaN is contagious.
 *
 * It never fired for the first fourteen ports because none raised anything to a high power. bcs_refractLens
 * does: pow(dot, 64.0) on a dot of 0.28 is about 1e-35. MEASURED in a headless GL context, not reasoned
 * about -- toHalf(pow(0.282065, 64.0)) came back NaN, and four pixels of the lens rendered pure black.
 *
 * Clamping the exponent to half's minimum NORMAL exponent fixes it in one term and is also just correct:
 * it makes subnormals quantise to multiples of 2^-24 and anything below half of that flush to zero, which is
 * what the hardware does.
 */
export function toHalf(x) {
    if (!Number.isFinite(x)) return x;
    const f = Math.fround(x);
    if (f === 0) return f;
    const a = Math.abs(f);
    if (a > HALF_MAX) return f > 0 ? HALF_MAX : -HALF_MAX;   // a real half goes to Infinity; clamped here
    const e = Math.max(Math.floor(Math.log2(a)), HALF_MIN_EXP);
    const q = Math.pow(2, e - 10);           // half carries 10 explicit mantissa bits, above 2^-14
    return Math.round(f / q) * q;
}

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const mix = (a, b, t) => a + (b - a) * t;
/**
 * GLSL/Metal smoothstep. Hoisted to module scope in v4196 -- it was a local const inside bcsPlasma, and
 * batch 9 needs it in three more shaders.
 *
 * *** IT IS CALLED WITH e0 > e1 ON PURPOSE BY bcs_refractLens, AND BOTH SPECS CALL THAT UNDEFINED. ***
 * `smoothstep(r * 1.3, r, dist)` wants a ramp that DESCENDS with distance. Metal and GLSL both define the
 * result only for e0 < e1; in practice both compute clamp((x-e0)/(e1-e0)) and a negative denominator gives
 * exactly the descending ramp upstream wants. Reproduced here because the port must match the source, and
 * written down because "works everywhere I tried" is the whole risk profile of an undefined behaviour.
 */
export const smoothstep = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };
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
// GENERAL, which is the worst shape a difference can have. Every caller passes a hue through `fract()`, so
// c.x >= 0, so `c.x*6 + {0,4,2}` >= 0, and fmod and mod agree on non-negative inputs. THE GUARANTEE LIVES AT
// THE CALL SITE AND NOT IN THE HELPER. So the port keeps fmod's semantics, and costs nothing for it.
//
// *** BATCH 7 CORRECTED THIS NOTE'S OWN EXAMPLE, AND THE CORRECTION IS WORTH MORE THAN THE ORIGINAL CLAIM. ***
// It first read: "pass a negative hue and mod returns the wrong branch of the colour wheel". The INTERMEDIATE
// certainly differs -- at hue -0.1, fmod(-0.6, 6) is -0.6 where mod gives 5.4 -- but that is not the same as
// the COLOUR differing, because `clamp(abs(m - 3) - 1, 0, 1)` can saturate both to the same answer. MEASURED
// over 4001 hues in [-2, 2]: THE FINAL COLOUR DIFFERS FOR 45.8% OF THEM, and NOT AT -0.1, where both give
// exactly (1.000, 0.000, 0.648). The honest example is hue -2.0: fmod gives WHITE and mod gives PURE RED.
//
// So the trap is real, common, and dramatic -- and the first example chosen to illustrate it happened to be
// one of the 54% where it makes no difference at all. An intermediate value diverging is not yet a defect;
// what it does downstream is the claim, and that has to be measured rather than assumed.
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


// =============================================================================================================
// BATCH 7 (v4164) -- THE POINTS TRAP INSIDE A CONVOLUTION KERNEL, AND THE hsb2rgb AUDIT COMPLETED.
//
// *** bcs_neonEdge's SOBEL USES step_x = step_y = 1.0, AND THAT 1.0 IS ONE POINT. *** On a 2x display the
// original compares neighbours TWO DEVICE PIXELS APART; a port that reads gl_FragCoord compares them ONE apart.
// For an offset that is a visible shift; FOR A CONVOLUTION KERNEL IT CHANGES WHAT COUNTS AS AN EDGE -- fine
// detail that the original smooths over becomes an edge, and the picture gains a wiry crawl that looks like
// sharpening rather than like a bug.
//
// AND ITS Y FLIP CHANGES THE COLOUR OF EDGES RATHER THAN THEIR POSITION. gy is built as bottom-minus-top in a
// y-down frame; flip it and gy's sign inverts, atan2(gy, gx) rotates, and `hue` -- which is derived from that
// angle -- lands somewhere else on the wheel. The edges appear in the right places, glowing the wrong colours,
// which is the kind of wrong nobody reports as a bug.
//
// *** AND THE hsb2rgb AUDIT IS NOW COMPLETE. *** Batch 2 found that fmod is safe there because the hue is
// non-negative, and that the guarantee lives at the CALL SITE. All four call sites in the upstream file were
// then checked: duochrome (two of them), aurora, and neonEdge -- and EVERY ONE passes its hue through fract(),
// which returns [0,1) even for the negative angle atan2 hands neonEdge. So the helper is UNSAFE BY
// CONSTRUCTION AND SAFE BY CONVENTION, and the convention is kept everywhere. The gate asserts that property of
// THIS tree's ports, so a fifth caller that skips fract is caught here rather than on somebody's screen.
// =============================================================================================================

/** The thermal palette: six bands, at upstream's breakpoints. Black -> blue -> purple -> red -> orange ->
 *  yellow -> white, which is the ironbow ramp a thermal camera actually uses. */
export function thermalColor(heat) {
    const M = (a, b, t) => a.map((v, k) => mix(v, b[k], clamp(toHalf(t), 0, 1)));
    if (heat < 0.15) return M([0, 0, 0], [0, 0, 0.3], heat / 0.15);
    if (heat < 0.35) return M([0, 0, 0.3], [0.5, 0, 0.5], (heat - 0.15) / 0.2);
    if (heat < 0.55) return M([0.5, 0, 0.5], [1, 0, 0], (heat - 0.35) / 0.2);
    if (heat < 0.75) return M([1, 0, 0], [1, 0.6, 0], (heat - 0.55) / 0.2);
    if (heat < 0.9) return M([1, 0.6, 0], [1, 1, 0], (heat - 0.75) / 0.15);
    return M([1, 1, 0], [1, 1, 1], (heat - 0.9) / 0.1);
}

/**
 * bcs_thermal -- heat-haze displacement, then the image's luminance read as temperature.
 *
 * The displacement carries a "rising bias": `- shimmer * 0.3` on y. THAT IS THE THIRD SHADER IN THIS FILE
 * WHOSE COMMENT ONLY MAKES SENSE Y-DOWN -- a negative y offset samples from higher up, so the content appears
 * to rise. Unflipped it sinks.
 */
export function bcsThermal(img, { time = 0, intensity = 1, shimmer = 4, noiseSpeed = 1, paletteShift = 0,
                                  pointScale = 1 } = {}) {
    const { w, h } = img, s = sampler(img), out = new Float32Array(w * h * 4);
    const sh = shimmer * pointScale;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const px = x + 0.5, py = y + 0.5, i = (y * w + x) * 4;
        const uvx = px / w, uvy = py / h;
        const stx = uvx * 8, sty = uvy * 8;
        const n1 = bcsValueNoise(stx, sty + time * noiseSpeed * 2);
        const n2 = bcsValueNoise(stx * 1.3 + time * noiseSpeed * 1.5, sty * 1.3);
        const dx = (n1 - 0.5) * sh;
        const dy = (n2 - 0.5) * sh * 0.6 - sh * 0.3;      // the rising bias: negative y = from above
        const c = s(clamp(px + dx, 0, w), clamp(py + dy, 0, h));
        let heat = luma(c[0], c[1], c[2]);
        heat += (bcsValueNoise(uvx * 20 + time * 0.5, uvy * 20 + time * 0.5) - 0.5) * 0.05;
        heat = clamp(heat + paletteShift * 0.3, 0, 1);
        const t = thermalColor(heat);
        for (let k = 0; k < 3; k++) out[i + k] = mix(c[k], t[k], toHalf(intensity));
        out[i + 3] = c[3];
    }
    return { w, h, data: out, premultiplied: img.premultiplied };
}

/**
 * bcs_neonEdge -- a Sobel magnitude, coloured by the edge's DIRECTION.
 *
 * `stepPoints` is upstream's 1.0 and is in POINTS; see the note above for why a convolution kernel is the
 * worst place for that to be assumed equal to a pixel.
 */
export function bcsNeonEdge(img, { time = 0, edgeStrength = 4, glowAmount = 1, colorCycle = 1,
                                   mixOriginal = 0.3, pointScale = 1 } = {}) {
    const { w, h } = img, s = sampler(img), out = new Float32Array(w * h * 4);
    const st = 1.0 * pointScale;                          // ONE POINT, not one pixel
    const L = (c) => luma(c[0], c[1], c[2]);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const px = x + 0.5, py = y + 0.5, i = (y * w + x) * 4;
        const tl = L(s(px - st, py - st)), tc = L(s(px, py - st)), tr = L(s(px + st, py - st));
        const ml = L(s(px - st, py)), mr = L(s(px + st, py));
        const bl = L(s(px - st, py + st)), bc = L(s(px, py + st)), br = L(s(px + st, py + st));
        const gx = -tl - 2 * ml - bl + tr + 2 * mr + br;
        const gy = -tl - 2 * tc - tr + bl + 2 * bc + br;   // bottom minus top, in a y-DOWN frame
        const edgeMag = clamp(Math.hypot(gx, gy) * edgeStrength, 0, 1);
        const edgeAngle = atan2(gy, gx);
        const raw = edgeAngle / 6.2832 + time * colorCycle * 0.3 + (py / h) * 0.5;
        const hue = raw - Math.floor(raw);                 // fract -- and THIS is what makes hsb2rgb's fmod safe
        const neon = bcsHsb2rgb(toHalf(hue), 1, 1);
        const bloom = Math.pow(edgeMag, 0.7) * glowAmount;
        const orig = [img.data[i], img.data[i + 1], img.data[i + 2]];
        for (let k = 0; k < 3; k++) out[i + k] = orig[k] * toHalf(mixOriginal * 0.5) + neon[k] * toHalf(edgeMag + bloom);
        out[i + 3] = img.data[i + 3];
    }
    return { w, h, data: out, premultiplied: img.premultiplied };
}

/* ============================================================================================================
 * BATCH 10 (v4233) -- THE FIVE REMAINING SHADERS THAT USE NO HASH, WHICH IS WHY THIS BATCH IS THESE FIVE.
 *
 * *** THE SELECTION IS THE FIRST DECISION AND IT WAS MADE FROM THE UPSTREAM SOURCE, NOT FROM THE NAMES. ***
 * Of the 22 unported shaders, 7 call bcs_hash and 8 call bcs_fbm (which calls bcs_hash through valueNoise).
 * v4196 established that a sin-hash shader CANNOT be verified against a CPU reference -- one float32 ULP into
 * sin() times 43758 is a different random number, measured up to 0.68 divergence on a 0..1 value. Those 15 can
 * be ported, but they can only ever be checked by SHAPE. These five touch neither, so every one of them is
 * gradeable to the pixel, and a batch of gradeable shaders is worth more than a batch of pretty ones.
 *
 * *** AND ONE OF THEM FINALLY USES fmod. *** The header's trap 5 has said since v4163 that "neither of the two
 * shaders here uses it -- the upstream file does elsewhere -- so the helper exists and is gated BEFORE a
 * shader that needs it arrives." bcs_geometricWarp is that shader, and it does not use fmod incidentally: it
 * folds an angle that comes from atan2, so the argument is NEGATIVE across half the image, which is the only
 * region where fmod and mod differ at all. Porting it with GLSL's mod would mirror one half of the picture.
 * ========================================================================================================= */

/**
 * bcs_wavePool -- N sine waves from evenly spaced directions, each displacing PERPENDICULAR to its own travel.
 *
 * Note `int waves = int(complexity)` in the Metal: the knob is a float and it TRUNCATES. complexity 2.9 is two
 * waves, not three, and the CPU reference truncates the same way rather than rounding to the nearer count.
 */
export function bcsWavePool(img, { time = 0, amplitude = 10, wavelength = 20, speed = 2, complexity = 3,
                                   pointScale = 1 } = {}) {
    const { w, h } = img, s = sampler(img), out = new Float32Array(w * h * 4);
    const waves = Math.max(0, Math.trunc(complexity));
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const px = x + 0.5, py = y + 0.5;
        const uvx = px / w, uvy = py / h;
        let ox = 0, oy = 0;
        for (let i = 0; i < waves; i++) {
            const angle = i * 3.14159 / waves;             // 3.14159, not Math.PI -- upstream's constant
            const dx = Math.cos(angle), dy = Math.sin(angle);
            const wave = Math.sin((uvx * dx + uvy * dy) * wavelength + time * speed + i * 1.5);
            // perpendicular to the direction of travel: (-dy, dx)
            ox += -dy * wave * amplitude * pointScale / waves;
            oy += dx * wave * amplitude * pointScale / waves;
        }
        const c = s(clamp(px + ox, 0, w), clamp(py + oy, 0, h)), i4 = (y * w + x) * 4;
        out[i4] = c[0]; out[i4 + 1] = c[1]; out[i4 + 2] = c[2]; out[i4 + 3] = c[3];
    }
    return { w, h, data: out, premultiplied: img.premultiplied };
}

/**
 * bcs_pulse -- a heartbeat that pushes pixels outward, plus an additive edge glow.
 *
 * *** THE GLOW IS ANOTHER `rgb +=` ON A PREMULTIPLIED SAMPLE -- TRAP 2, THE ONE bcs_emboss ALREADY PAID. ***
 * Upstream writes `color.rgb += half3(...)` on the value layer.sample returned, which is premultiplied. On a
 * straight-alpha texture the same line brightens by a different amount everywhere alpha < 1. Modelled the same
 * way emboss is: the caller declares which kind of image it handed over.
 *
 * `pow(abs(beat), 1/sharpness) * sign(beat)` is an odd-symmetric sharpening. sign(0) is 0 in both languages,
 * so the beat is exactly 0.5 at the zero crossing and no special case is needed.
 */
export function bcsPulse(img, { time = 0, amplitude = 15, bpm = 70, sharpness = 4, glowIntensity = 0.5,
                                pointScale = 1, premultiplied = true } = {}) {
    const { w, h } = img, s = sampler(img), out = new Float32Array(w * h * 4);
    const beatFreq = bpm / 60;
    const raw = Math.sin(time * beatFreq * 3.14159 * 2);
    const sharp = Math.pow(Math.abs(raw), 1 / sharpness) * Math.sign(raw);
    const beat = sharp * 0.5 + 0.5;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const px = x + 0.5, py = y + 0.5;
        const uvx = px / w, uvy = py / h;
        const dx = uvx - 0.5, dy = uvy - 0.5;
        const dist = Math.hypot(dx, dy);
        const disp = beat * amplitude * pointScale * smoothstep(0, 0.3, dist);
        let sx = px, sy = py;
        if (dist > 0.001) { sx += (dx / dist) * disp; sy += (dy / dist) * disp; }
        const c = s(clamp(sx, 0, w), clamp(sy, 0, h)), i = (y * w + x) * 4;
        const edgeDist = Math.min(Math.min(uvx, 1 - uvx), Math.min(uvy, 1 - uvy));
        const edgeGlow = (1 - smoothstep(0, 0.15, edgeDist)) * beat * glowIntensity;
        const a = c[3], k = premultiplied || a === 0 ? 1 : a;
        out[i]     = c[0] + toHalf(edgeGlow * 0.5) * k;
        out[i + 1] = c[1] + toHalf(edgeGlow * 0.3) * k;
        out[i + 2] = c[2] + toHalf(edgeGlow * 0.6) * k;
        out[i + 3] = a;
    }
    return { w, h, data: out, premultiplied: img.premultiplied };
}

/**
 * bcs_holographic -- three phase-offset sines make a rainbow, gated by the source's own luminance.
 *
 * *** THE CONSTANTS ARE `half` LITERALS (trap 4), AND I FIRST WROTE THAT PORTING THE EXACT THIRDS INSTEAD
 * WOULD SHIFT THE PHASE. CHECKED, AND IT WOULD NOT. *** toHalf(2.094) and toHalf(2*PI/3) are the SAME number,
 * 2.09375, and toHalf(4.189) and toHalf(4*PI/3) are both 4.1875: the rounding to half swallows the difference
 * between upstream's decimal literal and the exact constant. Even unrounded the gap is 0.000645 rad, worth
 * 0.08 levels of 255 at the steepest point of the sine -- BELOW the quantisation floor, so it could not show
 * on an 8-bit output whatever was chosen.
 *
 * So this is a trap that is NOT one here, and saying so is worth more than implying a danger that measurement
 * does not support. The same shape as the hsb2rgb audit: unsafe by construction, safe on the shipped domain.
 * The toHalf calls stay because the `h` suffix is real and a future constant might not be so forgiving.
 *
 * The final `mix(half3(gray), rgb, 1.1h)` EXTRAPOLATES past 1, which is a saturation boost and not a blend.
 */
export function bcsHolographic(img, { time = 0, intensity = 0.6, scale = 8, speed = 1, angleOffset = 0.785,
                                      premultiplied = true } = {}) {
    const { w, h } = img, out = new Float32Array(w * h * 4);
    const ca = Math.cos(angleOffset), sa = Math.sin(angleOffset);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        const uvx = (x + 0.5) / w, uvy = (y + 0.5) / h;
        const phase = (uvx * ca + uvy * sa) * scale + time * speed;
        const rb = toHalf(toHalf(Math.sin(phase)) * toHalf(0.5) + toHalf(0.5));
        const gb = toHalf(toHalf(Math.sin(phase + toHalf(2.094))) * toHalf(0.5) + toHalf(0.5));
        const bb = toHalf(toHalf(Math.sin(phase + toHalf(4.189))) * toHalf(0.5) + toHalf(0.5));
        const r = img.data[i], g = img.data[i + 1], b = img.data[i + 2], a = img.data[i + 3];
        const lum = luma(r, g, b);
        const mask = smoothstep(0.3, 0.8, lum);
        const k = premultiplied || a === 0 ? 1 : a;
        const gain = toHalf(intensity * mask);
        let rr = r + rb * gain * k, gg = g + gb * gain * k, bbv = b + bb * gain * k;
        const gray = toHalf(luma(rr, gg, bbv));
        // mix(gray, c, 1.1) = gray + (c - gray) * 1.1 -- an extrapolation, on purpose
        out[i]     = gray + (rr - gray) * toHalf(1.1);
        out[i + 1] = gray + (gg - gray) * toHalf(1.1);
        out[i + 2] = gray + (bbv - gray) * toHalf(1.1);
        out[i + 3] = a;
    }
    return { w, h, data: out, premultiplied: img.premultiplied };
}

/**
 * bcs_geometricWarp -- a log-polar spiral folded into kaleidoscope segments. *** THE fmod SHADER. ***
 *
 * spiralAngle = theta + log(r)*tight + ... , and theta is atan2's [-PI, PI]. Both folds run on that:
 *
 *     kAngle = fmod(spiralAngle, seg)                       -- NEGATIVE wherever spiralAngle is
 *     if (fmod(floor(spiralAngle / seg), 2.0) > 0.5) ...    -- mirror every other segment
 *
 * With GLSL's mod the first is always in [0, seg) and the second never sees a negative input, so the mirror
 * flips on the wrong segments over the half of the image where the angle is negative. Neither version fails to
 * compile and both look like a kaleidoscope, which is trap 5 exactly: it changes the picture silently.
 *
 * `6.28` is upstream's approximation of 2*PI and is kept verbatim -- 6.283185 would rotate the segment
 * boundaries by 0.03% of a turn per segment, which is visible where the mirrored seams meet.
 */
export function bcsGeometricWarp(img, { time = 0, spiralTight = 3, zoomRepeat = 1, rotation = 0, blend = 0.5,
                                        premultiplied = true } = {}) {
    const { w, h } = img, s = sampler(img), out = new Float32Array(w * h * 4);
    const SEG = 6.28 / 6.0;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        const uvx = (x + 0.5) / w, uvy = (y + 0.5) / h;
        const dx = uvx - 0.5, dy = uvy - 0.5;
        const r = Math.hypot(dx, dy);
        const theta = Math.atan2(dy, dx);
        const logR = Math.log(Math.max(r, 0.0001));
        const spiralAngle = theta + logR * spiralTight + time * 0.5 + rotation;
        const zp = logR * zoomRepeat + time * 0.2;
        const zoomPhase = zp - Math.floor(zp);                      // fract
        const repeatedR = Math.exp(zoomPhase / zoomRepeat);
        let kAngle = fmod(spiralAngle, SEG);                        // *** fmod, NOT glmod ***
        if (fmod(Math.floor(spiralAngle / SEG), 2.0) > 0.5) kAngle = SEG - kAngle;
        const finalAngle = mix(spiralAngle, kAngle, blend);
        let wx = 0.5 + Math.cos(finalAngle) * repeatedR * 0.3;
        let wy = 0.5 + Math.sin(finalAngle) * repeatedR * 0.3;
        wx -= Math.floor(wx); wy -= Math.floor(wy);                 // fract
        const c = s(clamp(wx * w, 0, w), clamp(wy * h, 0, h));
        const centerGlow = Math.exp(-r * r * 8.0) * 0.15;
        const bphase = zp - Math.floor(zp);
        const boundary = 1.0 - smoothstep(0, 0.02, Math.abs(bphase - 0.5) - 0.48);
        const a = c[3], k = premultiplied || a === 0 ? 1 : a;
        out[i]     = c[0] + (toHalf(centerGlow * 0.5) + toHalf(boundary * 0.05)) * k;
        out[i + 1] = c[1] + (toHalf(centerGlow * 0.7) + toHalf(boundary * 0.02)) * k;
        out[i + 2] = c[2] + (toHalf(centerGlow)       + toHalf(boundary * 0.08)) * k;
        out[i + 3] = a;
    }
    return { w, h, data: out, premultiplied: img.premultiplied };
}

/**
 * bcs_blackHole -- gravitational lensing, frame dragging, and an accretion ring.
 *
 * The aspect correction is applied to delta.x and UNDONE before sampling, the same shape bcsVortex uses, or a
 * round hole is an ellipse on a non-square canvas. `bendStrength` is capped at 5 upstream, which matters: at
 * dist -> 0 the unclamped term is schwarzschild/0.001 and the sample would fly off the image.
 */
export function bcsBlackHole(img, { time = 0, mass = 0.2, spin = 1, distortion = 60, ringBrightness = 1,
                                    premultiplied = true } = {}) {
    const { w, h } = img, s = sampler(img), out = new Float32Array(w * h * 4);
    const aspect = w / h;
    const schwarzschild = mass * 0.3;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        const uvx = (x + 0.5) / w, uvy = (y + 0.5) / h;
        const dx = (uvx - 0.5) * aspect, dy = uvy - 0.5;
        const dist = Math.hypot(dx, dy);
        const angle = Math.atan2(dy, dx);
        const bend = Math.min(schwarzschild / Math.max(dist * dist, 0.001), 5.0);
        let wx = dx, wy = dy;
        if (dist > 0.001) { wx += (dx / dist) * bend * 0.1; wy += (dy / dist) * bend * 0.1; }
        const drag = spin * schwarzschild / Math.max(dist, 0.01) * time;
        const cd = Math.cos(drag), sd = Math.sin(drag);
        const rx = wx * cd - wy * sd, ry = wx * sd + wy * cd;
        const c = s(clamp((rx / aspect + 0.5) * w, 0, w), clamp((ry + 0.5) * h, 0, h));
        const horizon = smoothstep(schwarzschild * 0.5, schwarzschild * 1.5, dist);
        const ringDist = Math.abs(dist - schwarzschild * 2.5);
        let ring = Math.exp(-ringDist * ringDist / (schwarzschild * schwarzschild * 0.3));
        let rp = Math.sin(angle * 8.0 - time * spin * 3.0) * 0.5 + 0.5;
        rp = rp * rp;
        ring *= 0.5 + rp * 0.5;
        const ringPos = smoothstep(schwarzschild * 1.5, schwarzschild * 4.0, dist);
        const rc = [mix(toHalf(0.7), toHalf(1.0), toHalf(ringPos)),
                    mix(toHalf(0.85), toHalf(0.6), toHalf(ringPos)),
                    mix(toHalf(1.0), toHalf(0.2), toHalf(ringPos))];
        const a = c[3], k = premultiplied || a === 0 ? 1 : a;
        const gain = toHalf(ring * ringBrightness);
        for (let ch = 0; ch < 3; ch++) out[i + ch] = c[ch] * toHalf(horizon) + rc[ch] * gain * k;
        out[i + 3] = a;
    }
    return { w, h, data: out, premultiplied: img.premultiplied };
}

/* ============================================================================================================
 * BATCH 11 (v4234) -- THE LAST GRADEABLE SHADER, AND THREE THAT CAN ONLY EVER BE CHECKED BY SHAPE.
 *
 * *** v4233's NOTE SAID TWO UNPORTED SHADERS WERE STILL GRADEABLE. RECOUNTED FROM THE BODIES: ONE. ***
 * bcs_liquidMirror calls bcs_valueNoise, which calls bcs_hash, so it joins the fifteen that cannot be
 * verified against a CPU reference on any two implementations. bcs_wormhole is the only one left that touches
 * no hash at all, and after this batch there are NONE: every remaining shader is shape-checked by necessity,
 * and that is a property of the upstream file rather than a standard being lowered here.
 * ========================================================================================================= */

/**
 * bcs_wormhole -- a log-ish tunnel with frame-dragging twist, depth fog, ring highlights and chromatic
 * aberration at the edges. The last shader in this port that can be graded to the pixel.
 *
 * THREE SAMPLES, not one, and the two chromatic ones are taken at tunnelUV BEFORE the fract() wrap is undone
 * -- upstream adds chromaDir to the already-wrapped tunnelUV, so a sample can leave [0,1] and is then clamped
 * to the image rather than wrapped. Reproduced exactly: clamping and wrapping differ at the seam.
 */
export function bcsWormhole(img, { time = 0, depth = 4, speed = 1, twist = 2, radius = 0.25,
                                   premultiplied = true } = {}) {
    const { w, h } = img, s = sampler(img), out = new Float32Array(w * h * 4);
    const aspect = w / h;
    const t = time * speed;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        const uvx = (x + 0.5) / w, uvy = (y + 0.5) / h;
        const dx = (uvx - 0.5) * aspect, dy = uvy - 0.5;
        const dist = Math.hypot(dx, dy);
        const angle = Math.atan2(dy, dx);
        const tunnelDepth = radius / Math.max(dist, 0.001);
        const twistAngle = angle + twist * tunnelDepth * 0.3 + t * 0.5;
        const zf = tunnelDepth * depth * 0.1 - t * 0.3;
        const zoomFactor = zf - Math.floor(zf);                     // fract
        const scale = mix(0.2, 2.0, zoomFactor);
        let tx = 0.5 + Math.cos(twistAngle) * scale * 0.3;
        let ty = 0.5 + Math.sin(twistAngle) * scale * 0.3;
        tx -= Math.floor(tx); ty -= Math.floor(ty);                 // fract, the "wrapping feel"
        const c = s(clamp(tx * w, 0, w), clamp(ty * h, 0, h));
        const fog = smoothstep(0, radius * 2.0, dist);
        const ringPattern = zoomFactor;                             // the same fract, upstream recomputes it
        const ring = Math.exp(-Math.pow((ringPattern - 0.5) * 8.0, 2.0)) * 0.2;
        const vignette = 1.0 - smoothstep(0.3, 0.7, dist);
        // chromatic aberration: the offset is built in aspect-corrected space and undone on x, like blackHole
        const chromaAmt = (1.0 - fog) * 3.0;
        let cdx = 0, cdy = 0;
        if (dist > 0.001) { cdx = (dx / dist) * chromaAmt / aspect; cdy = (dy / dist) * chromaAmt; }
        const rS = s(clamp((tx + cdx * 0.003) * w, 0, w), clamp((ty + cdy * 0.003) * h, 0, h));
        const bS = s(clamp((tx - cdx * 0.003) * w, 0, w), clamp((ty - cdy * 0.003) * h, 0, h));
        const chromaBlend = (1.0 - fog) * 0.4;
        const a = c[3], k = premultiplied || a === 0 ? 1 : a;
        const fogMul = toHalf(0.3 + fog * 0.7);
        let r = c[0] * fogMul, g = c[1] * fogMul, b = c[2] * fogMul;
        r += (toHalf(ring * 0.5) + toHalf(vignette * 0.05)) * k;
        g += (toHalf(ring * 0.6) + toHalf(vignette * 0.05)) * k;
        b += (toHalf(ring * 1.0) + toHalf(vignette * 0.05)) * k;
        // *** THE CHROMATIC TAPS ARE MIXED RAW. *** Upstream fog-multiplies `color` at step 1 and then mixes
        // against rSamp.r / bSamp.b, which are sampled AFTER that and never touched by the fog. Multiplying
        // them too -- which the first draft here did -- darkens the aberration by the fog a second time.
        out[i]     = mix(r, rS[0], toHalf(chromaBlend));
        out[i + 1] = g;
        out[i + 2] = mix(b, bS[2], toHalf(chromaBlend));
        out[i + 3] = a;
    }
    return { w, h, data: out, premultiplied: img.premultiplied };
}

/**
 * bcs_inkBleed -- domain warping: fbm feeding fbm. SHAPE-CHECKED ONLY, because bcs_fbm reaches the sin-hash.
 *
 * `st + 4.0 * q + float2(1.7, 9.2) + time * speed * 0.05` adds a SCALAR to a float2 on the last term, which
 * broadcasts in both Metal and GLSL. Written out per component here so the broadcast is visible rather than
 * assumed.
 */
export function bcsInkBleed(img, { time = 0, warpStrength = 20, scale = 4, speed = 0.5, detail = 4,
                                   pointScale = 1 } = {}) {
    const { w, h } = img, s = sampler(img), out = new Float32Array(w * h * 4);
    const oct = Math.max(1, Math.trunc(detail));
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const px = x + 0.5, py = y + 0.5;
        const stx = (px / w) * scale, sty = (py / h) * scale;
        const qx = bcsFbm(stx + time * speed * 0.1, sty, oct);
        const qy = bcsFbm(stx + 5.2, sty + 1.3 + time * speed * 0.08, oct);
        const rx = bcsFbm(stx + 4 * qx + 1.7 + time * speed * 0.05, sty + 4 * qy + 9.2 + time * speed * 0.05, oct);
        const ry = bcsFbm(stx + 4 * qx + 8.3 + time * speed * 0.04, sty + 4 * qy + 2.8 + time * speed * 0.04, oct);
        const ox = (qx + rx) * warpStrength * pointScale, oy = (qy + ry) * warpStrength * pointScale;
        const c = s(clamp(px + ox, 0, w), clamp(py + oy, 0, h)), i = (y * w + x) * 4;
        out[i] = c[0]; out[i + 1] = c[1]; out[i + 2] = c[2]; out[i + 3] = c[3];
    }
    return { w, h, data: out, premultiplied: img.premultiplied };
}

/**
 * bcs_frosted -- a five-tap scatter blur whose offsets come from a per-cell hash. SHAPE-CHECKED ONLY.
 *
 * *** THE FIRST SHADER IN THIS PORT WHOSE UPSTREAM DOES NOT CLAMP ITS SAMPLES AT ALL -- TRAP 6, LOAD-BEARING
 * RATHER THAN ANTICIPATED. *** Four of the five taps are `layer.sample(position + offset)` with no clamp
 * anywhere, because Metal's layer sampling has DEFINED edge behaviour. GL wraps unless told otherwise, so a
 * literal port would pull colour from the opposite side of the image along every border. This clamps, which
 * is what makes it agree with Metal rather than with a literal reading of the source.
 */
export function bcsFrosted(img, { frostAmount = 0.7, grainSize = 8, clearRadius = 0.2, clearSoftness = 0.3,
                                  pointScale = 1, premultiplied = true } = {}) {
    const { w, h } = img, s = sampler(img), out = new Float32Array(w * h * 4);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        const px = x + 0.5, py = y + 0.5;
        const uvx = px / w, uvy = py / h;
        const dist = Math.hypot(uvx - 0.5, uvy - 0.5);
        const mask = smoothstep(clearRadius, clearRadius + clearSoftness, dist) * frostAmount;
        const nux = uvx * grainSize, nuy = uvy * grainSize;
        const nx = bcsHash(Math.floor(nux), Math.floor(nuy)) * 2 - 1;
        const ny = bcsHash(Math.floor(nux) + 7.3, Math.floor(nuy) + 3.1) * 2 - 1;
        const sc = mask * 8.0 * pointScale;
        const taps = [[0, 0], [nx * sc, ny * sc], [-ny * sc, nx * sc],
                      [-nx * sc * 0.7, -ny * sc * 0.7], [ny * sc * 0.7, -nx * sc * 0.7]];
        const sum = [0, 0, 0, 0];
        for (const [ox, oy] of taps) {
            const c = s(clamp(px + ox, 0, w), clamp(py + oy, 0, h));
            for (let k = 0; k < 4; k++) sum[k] += c[k];
        }
        for (let k = 0; k < 4; k++) sum[k] = toHalf(sum[k] / 5);
        const orig = s(px, py);
        const a = mix(orig[3], sum[3], toHalf(mask));
        const k2 = premultiplied || a === 0 ? 1 : a;
        for (let k = 0; k < 3; k++) out[i + k] = mix(orig[k], sum[k], toHalf(mask)) + toHalf(mask * 0.05) * k2;
        out[i + 3] = a;
    }
    return { w, h, data: out, premultiplied: img.premultiplied };
}

/**
 * bcs_pixelateMosaic -- tiles, grout, a scatter-in animation and bevel lighting. SHAPE-CHECKED ONLY.
 *
 * *** THE FIRST SHADER IN THIS PORT THAT WRITES A VARYING ALPHA -- AND THE FIRST DRAFT OF THIS PARAGRAPH SAID
 * "THE FIRST THAT WRITES ALPHA AT ALL", WHICH IS FALSE. *** bcs_refractLens has returned a hard alpha 1.0
 * from its lens interior since v4196 and nobody noticed for four batches, because a constant 1.0 is
 * invisible on the opaque test image every gate used until v4234. Measured on a flat-alpha image, exactly
 * three of the 28 touch alpha: refractLens by 0.4 (the constant), frosted by 0.0001 (half quantisation of a
 * mix between two equal values, i.e. not a write), and this one by 0.3.
 *
 * This one does `tileColor.a *= half(assembleProgress * 0.5 + 0.5)`, and the grout branch returns a fully
 * OPAQUE constant regardless of what was underneath. That matters twice over: the premultiplied scale has to
 * be taken from the alpha the shader is about to write rather than the one it read -- refractLens gets away
 * with adding unscaled only because the alpha IT writes is 1, so the factor would have been 1 -- and a gate
 * that only ever compares RGB would not see either behaviour at all.
 *
 * The bevel is a y-flip case: topLight = smoothstep(0.0, -0.8, bevelUV.y) is the TOP of the tile only because
 * SwiftUI's y grows downward, which is why every coordinate here stays in the file's one convention.
 */
export function bcsPixelateMosaic(img, { time = 0, pixelSize = 8, bevel = 0.5, animateAssemble = 0, gap = 0.08,
                                         premultiplied = true } = {}) {
    const { w, h } = img, s = sampler(img), out = new Float32Array(w * h * 4);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        const uvx = (x + 0.5) / w, uvy = (y + 0.5) / h;
        const gx = Math.floor(uvx * w / pixelSize) * pixelSize / w;
        const gy = Math.floor(uvy * h / pixelSize) * pixelSize / h;
        const cx = (uvx * w / pixelSize) - Math.floor(uvx * w / pixelSize);
        const cy = (uvy * h / pixelSize) - Math.floor(uvy * h / pixelSize);
        if (gap > 0.001) {
            const ex = (cx >= gap * 0.5 ? 1 : 0) * (1 - cx >= gap * 0.5 ? 1 : 0);
            const ey = (cy >= gap * 0.5 ? 1 : 0) * (1 - cy >= gap * 0.5 ? 1 : 0);
            if (ex * ey < 0.5) {   // grout: an opaque constant, whatever was underneath
                out[i] = toHalf(0.02); out[i + 1] = toHalf(0.02); out[i + 2] = toHalf(0.03); out[i + 3] = 1;
                continue;
            }
        }
        const tcx = gx + 0.5 * pixelSize / w, tcy = gy + 0.5 * pixelSize / h;
        const tileHash = bcsHash(gx * 100, gy * 100);
        let ap = clamp(time * 0.5 - tileHash * animateAssemble * 2.0, 0, 1);
        ap = ap * ap * (3 - 2 * ap);
        const sx = tcx + (bcsHash(gx * 200, gy * 200) - 0.5) * 0.5 * (1 - ap);
        const sy = tcy + (bcsHash(gx * 300, gy * 300) - 0.5) * 0.5 * (1 - ap);
        const c = s(clamp(sx * w, 0, w), clamp(sy * h, 0, h));
        const bvx = (cx - 0.5) * 2, bvy = (cy - 0.5) * 2;
        const topLight = smoothstep(0, -0.8, bvy) * bevel;
        const leftLight = smoothstep(0, -0.8, bvx) * bevel * 0.5;
        const bottomShadow = smoothstep(0, 0.8, bvy) * bevel;
        const edgeDist = Math.min(Math.min(cx, 1 - cx), Math.min(cy, 1 - cy));
        const edgeHi = (1 - smoothstep(0, 0.08, edgeDist)) * bevel * 0.3;
        // the alpha this pixel will CARRY, which is what the premultiplied scale must use
        const a = c[3] * toHalf(ap * 0.5 + 0.5);
        const k = premultiplied || a === 0 ? 1 : a;
        const add = toHalf(topLight * 0.15 + leftLight * 0.1) - toHalf(bottomShadow * 0.2) + toHalf(edgeHi);
        for (let ch = 0; ch < 3; ch++) out[i + ch] = c[ch] + add * k;
        out[i + 3] = a;
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

// ============================================================================================================
// BATCH 9 (v4196) -- FIVE RADIAL DISPLACEMENT SHADERS, AND A CORRECTION I NEARLY SHIPPED BACKWARDS
// ============================================================================================================
//
// *** THE NEW TRAP: A KNOB CAN BE A COORDINATE TOO. ***
//
// Every coordinate trap argued so far -- the y flip, the point scale -- was about `position`, which the
// shader DERIVES. bcs_touchRipple and bcs_refractLens take `touchPos` as a PARAMETER, documented "touch
// location in pixels". It is neither pixels nor in our frame: it is POINTS, measured with y growing DOWN.
//
// So the fix does not live in the shader at all. It lives at the API boundary, in whatever hands the touch
// point over -- and that is what makes it dangerous. A port whose shader body is letter-perfect still puts
// the ripple at the vertical MIRROR of where the user touched, and it still expands, still decays, still
// reads as a ripple. Nothing looks broken. It is simply centred somewhere nobody pointed.
//
// Modelled here as two scalar knobs, touchX and touchY, because that is what the pass machinery carries --
// and because splitting them makes the y the caller has to think about impossible to pass by accident.
//
// ------------------------------------------------------------------------------------------------------
// *** AND THE ASPECT FINDING, WHICH I FIRST WROTE DOWN INVERTED. ***
//
// Reading the twelve radial shaders, they appear to split into "corrects the aspect and converts back" and
// "corrects and forgets to convert back", and the second group looks like an obvious bug. That reading is
// wrong, and measuring it says so in one line:
//
//     delta = uv - centre;  delta.x *= size.x/size.y
//       =>  ((cx - w/2)/w * w/h,  (cy - h/2)/h)  =  (pixelDelta.x / h,  pixelDelta.y / h)
//
// *** `delta.x *= aspectRatio` DOES NOT MAKE THE FIELD ABSTRACTLY CIRCULAR. IT CONVERTS A uv DELTA INTO A
// PIXEL DELTA. *** So normalize() of it is ALREADY the true radial direction in pixel space, and dividing x
// back out is what breaks it. The question is not whether a shader un-corrects. It is WHAT SPACE THE RESULT
// IS CONSUMED IN:
//
//   consumed as `position + dir * k`   (PIXELS)  -> must NOT divide x back
//   consumed as `uv + dir * k`, then `* size`    -> must divide x back
//
// On that criterion, audited across all twelve:
//
//   right, uv-consumed, divides back      vortex, kaleidoscope, blackHole, wormhole
//   right, pixel-consumed, does not       shockwave, gravityWells
//   right, no aspect term at all          touchRipple, wavePool, magneticField, underwaterCaustics
//   WRONG, pixel-consumed, divides back   liveRipple, and refractLens's outer push ring
//
// *** refractLens IS THE ONE WORTH STOPPING ON: IT DIVIDES x BACK TWICE, AND ONLY ONE OF THE TWO IS RIGHT. ***
// `pushDir` feeds `position + pushDir * n` -- pixels, so dividing back is wrong. `chromaDir` feeds
// `(refractedUV +/- chromaDir * n) * size` -- uv, so dividing back is right. Same function, same idiom, two
// different answers, because the two results are spent in different spaces.
//
// Measured, as the angle between the direction actually pushed and the true pixel radial direction:
// 0.00 deg on a square canvas, 19.47 deg at 2:1, 30.00 deg at 3:1. *** IT IS EXACTLY ZERO WHEN width ==
// height, WHICH IS WHY IT SURVIVES REVIEW *** -- a square preview is the one canvas on which the bug is
// invisible.
//
// *** PORTED FAITHFULLY RATHER THAN FIXED, AND THAT IS DELIBERATE. *** These are ports; a port that silently
// improves its source is a port nobody can check against the source. The gate pins the angle as a measured
// number instead, so it is recorded rather than hidden -- and so that if upstream ever fixes it, our copy
// goes red and says which shader moved.
//
// It is also why fourteen ports went by without this surfacing: the two radial shaders already done, vortex
// and kaleidoscope, are both uv-consumed, where dividing back is correct.

/**
 * bcs_touchRipple -- an expanding gaussian ring from a touch point, with a chromatic lip.
 *
 * No aspect term anywhere: `dist` is a raw pixel length throughout, which is self-consistent and correct
 * for a ripple. The shader that needs no conversion is the one that never leaves pixel space.
 *
 * *** THE EARLY-OUT IS PART OF THE EFFECT, NOT A GUARD. *** touchAge outside [0.01, 5] returns the layer
 * untouched, which is how the ripple ENDS. Porting it as a clamp would leave a ring frozen on screen forever.
 */
export function bcsTouchRipple(img, { touchX = 0, touchY = 0, touchAge = 0, amplitude = 10, frequency = 20,
                                      speed = 200, decay = 2, pointScale = 1 } = {}) {
    const { w, h } = img, s = sampler(img), out = new Float32Array(w * h * 4);
    const px = touchX * pointScale, py = touchY * pointScale;   // the knob is in POINTS, y DOWN
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const cx = x + 0.5, cy = y + 0.5, i = (y * w + x) * 4;
        if (touchAge < 0.01 || touchAge > 5.0) {
            const c = s(cx, cy);
            out[i] = c[0]; out[i + 1] = c[1]; out[i + 2] = c[2]; out[i + 3] = c[3];
            continue;
        }
        const dx = cx - px, dy = cy - py;
        const dist = Math.hypot(dx, dy);
        const rippleRadius = touchAge * speed * pointScale;
        const distFromFront = dist - rippleRadius;
        const waveWidth = (60.0 + touchAge * 40.0) * pointScale;
        const envelope = Math.exp(-(distFromFront * distFromFront) / (2.0 * waveWidth * waveWidth));
        const timeFade = Math.exp(-touchAge * decay);
        const wave1 = Math.sin(distFromFront * frequency * 0.008);
        const wave2 = Math.sin(distFromFront * frequency * 0.005 + 1.0) * 0.5;
        const wave = (wave1 + wave2) * 0.67 * envelope * timeFade * amplitude * pointScale;
        const guard = 0.5 * pointScale;
        const dirx = dist > guard ? dx / dist : 0, diry = dist > guard ? dy / dist : 0;
        const dispx = clamp(cx + dirx * wave, 0, w), dispy = clamp(cy + diry * wave, 0, h);
        const c = s(dispx, dispy);
        const chromaAmt = Math.abs(wave) * 0.08;
        const r = s(clamp(dispx + dirx * chromaAmt, 0, w), clamp(dispy + diry * chromaAmt, 0, h));
        const b = s(clamp(dispx - dirx * chromaAmt, 0, w), clamp(dispy - diry * chromaAmt, 0, h));
        const t = toHalf(envelope * timeFade * 0.3);
        out[i]     = mix(c[0], r[0], t);
        out[i + 1] = c[1];
        out[i + 2] = mix(c[2], b[2], t);
        out[i + 3] = c[3];
    }
    return { w, h, data: out, premultiplied: img.premultiplied };
}

/**
 * bcs_liveRipple -- N concentric ripple sources drifting near the centre.
 *
 * *** THIS IS THE ONE WITH THE DEFECT, AND IT READS LIKE THE CAREFUL ONE. *** `delta.x *= aspect` has
 * already put the delta in pixel proportions, so normalize() is the true pixel radial direction. The extra
 * `dir.x /= aspect` then pushes it off that direction -- by up to 19.47 degrees on a 2:1 canvas, and by
 * exactly nothing on a square one. Reproduced as upstream wrote it; the gate measures the angle.
 *
 * The loop bound comes from a knob. Ported with a CONSTANT bound and an early break, which is this file's
 * established idiom (bcs_fbm, bcs_echo) and the only form GLSL ES will unroll.
 */
export function bcsLiveRipple(img, { time = 0, amplitude = 10, frequency = 20, speed = 3,
                                     damping = 2, ringCount = 3, pointScale = 1 } = {}) {
    const { w, h } = img, s = sampler(img), out = new Float32Array(w * h * 4);
    const aspect = w / h;
    const rings = Math.min(8, Math.trunc(ringCount));
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const cx = x + 0.5, cy = y + 0.5;
        const uvx = cx / w, uvy = cy / h;
        let offx = 0, offy = 0;
        for (let k = 0; k < rings; k++) {
            const phase = k * 1.256;
            const rcx = 0.5 + Math.sin(time * 0.3 + phase) * 0.05;
            const rcy = 0.5 + Math.cos(time * 0.4 + phase) * 0.05;
            let dx = (uvx - rcx) * aspect, dy = uvy - rcy;
            const dist = Math.hypot(dx, dy);
            const wave = Math.sin(dist * frequency - time * speed + phase);
            const envelope = Math.exp(-dist * damping);
            let dirx = dist > 0.001 ? dx / dist : 0, diry = dist > 0.001 ? dy / dist : 0;
            dirx /= aspect;                                   // *** THE DEFECT: delta was ALREADY pixel-proportional ***
            const g = wave * envelope * amplitude * pointScale / ringCount;
            offx += dirx * g; offy += diry * g;
        }
        const c = s(clamp(cx + offx, 0, w), clamp(cy + offy, 0, h)), i = (y * w + x) * 4;
        out[i] = c[0]; out[i + 1] = c[1]; out[i + 2] = c[2]; out[i + 3] = c[3];
    }
    return { w, h, data: out, premultiplied: img.premultiplied };
}

/**
 * bcs_shockwave -- a repeating ring expanding from the centre, with a chromatic lip and a flash.
 *
 * *** IT NEVER DIVIDES x BACK, AND THAT IS CORRECT. *** `delta.x *= aspect` has already converted the uv
 * delta into pixel proportions, so `normalize(delta)` is the true pixel radial direction and `position +
 * dir * ...` pushes exactly outward. The shader that looks like it forgot a step is the one that did not
 * need it -- see the header, and liveRipple above for the same idiom used wrongly.
 *
 * *** AND repeat_rate = 0 MAKES THE ENTIRE FRAME NaN. *** fmod(time, 0) is NaN, which propagates through
 * waveFront, ringMask and the displacement to every pixel. Upstream documents the knob as "0.5-5" and never
 * guards it; 0 is exactly the value a slider that has not been dragged yet reports. Ported faithfully, and
 * the gate pins it as a known, named cliff rather than a surprise.
 */
export function bcsShockwave(img, { time = 0, waveSpeed = 200, ringWidth = 30, strength = 40,
                                    repeatRate = 2, pointScale = 1 } = {}) {
    const { w, h } = img, s = sampler(img), out = new Float32Array(w * h * 4);
    const aspect = w / h;
    const cycleTime = fmod(time, repeatRate);                 // NaN when repeatRate is 0 -- upstream's shape
    const waveFront = cycleTime * waveSpeed * pointScale;
    const fadeWithDist = Math.exp(-waveFront * 0.003);
    const waveFront2 = Math.max(cycleTime - 0.15, 0.0) * waveSpeed * 0.9 * pointScale;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const cx = x + 0.5, cy = y + 0.5;
        const dx = (cx / w - 0.5) * aspect, dy = cy / h - 0.5;
        const dist = Math.hypot(dx, dy) * h;
        let ringMask = 1.0 - smoothstep(0.0, ringWidth * pointScale, Math.abs(dist - waveFront));
        ringMask *= ringMask; ringMask *= fadeWithDist;
        const dirx = dist > 0.001 ? dx / Math.hypot(dx, dy) : 0;   // *** correctly NOT divided back ***
        const diry = dist > 0.001 ? dy / Math.hypot(dx, dy) : 0;
        let ringMask2 = 1.0 - smoothstep(0.0, ringWidth * 0.7 * pointScale, Math.abs(dist - waveFront2));
        ringMask2 *= ringMask2 * fadeWithDist * 0.5;
        const amt = ringMask * strength * pointScale + ringMask2 * strength * 0.4 * pointScale;
        const sxp = clamp(cx + dirx * amt, 0, w), syp = clamp(cy + diry * amt, 0, h);
        const c = s(sxp, syp);
        const chromaAmt = ringMask * strength * 0.15 * pointScale;
        const r = s(clamp(sxp + dirx * chromaAmt, 0, w), clamp(syp + diry * chromaAmt, 0, h));
        const b = s(clamp(sxp - dirx * chromaAmt, 0, w), clamp(syp - diry * chromaAmt, 0, h));
        const t = toHalf(ringMask * 0.6), flash = toHalf(ringMask * 0.15), i = (y * w + x) * 4;
        out[i]     = mix(c[0], r[0], t) + flash;
        out[i + 1] = c[1] + flash;
        out[i + 2] = mix(c[2], b[2], t) + flash;
        out[i + 3] = c[3];
    }
    return { w, h, data: out, premultiplied: img.premultiplied };
}

/**
 * bcs_gravityWells -- N orbiting attractors, each pulling the image inward by an inverse power law.
 *
 * Pixel-consumed and correctly does not divide x back, like shockwave. `well_count` is clamped to 1..5 by
 * upstream BEFORE the int conversion, so unlike liveRipple this one cannot be handed a zero trip count --
 * worth noting because the two shaders sit beside each other and only one is guarded.
 *
 * `pow(dist, falloff)` at dist 0 is 0 for any positive falloff, and the +10 in the denominator is what keeps
 * the pull finite at the centre. That constant is in POINTS: it is added to `pow(dist, f) * size.y`.
 */
export function bcsGravityWells(img, { time = 0, wellStrength = 80, wellCount = 3, orbitSpeed = 1,
                                       warpFalloff = 2, pointScale = 1 } = {}) {
    const { w, h } = img, s = sampler(img), out = new Float32Array(w * h * 4);
    const aspect = w / h;
    const wells = Math.trunc(clamp(wellCount, 1, 5));
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const cx = x + 0.5, cy = y + 0.5;
        const uvx = cx / w, uvy = cy / h;
        let tdx = 0, tdy = 0;
        for (let k = 0; k < wells; k++) {
            const phase = k * 6.2832 / wells;
            const sp = orbitSpeed * (0.7 + k * 0.15);
            const orbitRadius = 0.2 + k * 0.06;
            const wx = 0.5 + Math.cos(time * sp + phase) * orbitRadius;
            const wy = 0.5 + Math.sin(time * sp * 0.8 + phase * 1.3) * orbitRadius;
            const dx = (uvx - wx) * aspect, dy = uvy - wy;
            const dist = Math.hypot(dx, dy);
            let pull = wellStrength / (Math.pow(dist, warpFalloff) * h + 10.0 * pointScale);
            pull = Math.min(pull, wellStrength * 0.5) * pointScale;
            const dirx = dist > 0.001 ? dx / dist : 0, diry = dist > 0.001 ? dy / dist : 0;
            tdx -= dirx * pull; tdy -= diry * pull;           // *** correctly NOT divided back ***
        }
        const sxp = clamp(cx + tdx, 0, w), syp = clamp(cy + tdy, 0, h);
        const c = s(sxp, syp);
        const dispMag = Math.hypot(tdx, tdy) * 0.1;
        const chx = tdx * 0.08, chy = tdy * 0.08;
        const r = s(clamp(sxp + chx, 0, w), clamp(syp + chy, 0, h));
        const b = s(clamp(sxp - chx, 0, w), clamp(syp - chy, 0, h));
        const t = toHalf(clamp(dispMag * 0.02, 0, 0.5)), i = (y * w + x) * 4;
        out[i]     = mix(c[0], r[0], t);
        out[i + 1] = c[1];
        out[i + 2] = mix(c[2], b[2], t);
        out[i + 3] = c[3];
    }
    return { w, h, data: out, premultiplied: img.premultiplied };
}

/**
 * bcs_refractLens -- a glass sphere over the layer: Snell refraction, chromatic edges, specular and Fresnel.
 *
 * The second shader whose CENTRE IS A KNOB, and the one that divides x back TWICE with only one of the two
 * correct: `pushDir` is spent in PIXELS (`position + pushDir * n`), where dividing back is wrong;
 * `chromaDir` is spent in UV (`(refractedUV +/- chromaDir * n) * size`), where it is right. Both are
 * reproduced as written -- see the header.
 *
 * *** THREE EARLY EXITS, AND THEY ARE THE SHAPE OF THE EFFECT. *** Outside 1.3r the layer passes through
 * untouched; between r and 1.3r there is a push-only ring; inside r is the lens proper. Flattening those
 * into one branch is how a lens turns into a smear.
 *
 * The specular and Fresnel terms are ADDITIVE and unclamped, exactly as upstream leaves them, so a bright
 * source can exceed 1.0 inside the lens. That is upstream's look; clamping it here would be a silent change.
 */
export function bcsRefractLens(img, { touchX = 0, touchY = 0, lensRadius = 0.25, refraction = 1.5,
                                      aberration = 6, wobble = 0, pointScale = 1 } = {}) {
    const { w, h } = img, s = sampler(img), out = new Float32Array(w * h * 4);
    const aspect = w / h;
    // The knob is in POINTS with y DOWN -- scaled here, and normalised the way upstream does.
    let lcx = clamp((touchX * pointScale) / w, 0.05, 0.95);
    let lcy = clamp((touchY * pointScale) / h, 0.05, 0.95);
    const lightN = (() => { const l = [0.3, -0.3, 1.0], m = Math.hypot(l[0], l[1], l[2]); return [l[0]/m, l[1]/m, l[2]/m]; })();
    const hv = (() => { const v = [lightN[0], lightN[1], lightN[2] + 1], m = Math.hypot(v[0], v[1], v[2]); return [v[0]/m, v[1]/m, v[2]/m]; })();
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const cx = x + 0.5, cy = y + 0.5, i = (y * w + x) * 4;
        const uvx = cx / w, uvy = cy / h;
        const dx = (uvx - lcx) * aspect, dy = uvy - lcy;
        const dist = Math.hypot(dx, dy);
        if (dist > lensRadius * 1.3) {                        // 1) outside: untouched
            const c = s(cx, cy);
            out[i] = c[0]; out[i + 1] = c[1]; out[i + 2] = c[2]; out[i + 3] = c[3];
            continue;
        }
        if (dist > lensRadius) {                              // 2) the outer push ring
            const outerRing = smoothstep(lensRadius * 1.3, lensRadius, dist);   // e0 > e1 -- see smoothstep
            let pdx = dist > 0.001 ? dx / dist : 0, pdy = dist > 0.001 ? dy / dist : 0;
            pdx /= aspect;                                    // *** WRONG HALF: this one is spent in PIXELS ***
            const push = outerRing * 8.0 * pointScale;
            const c = s(clamp(cx + pdx * push, 0, w), clamp(cy + pdy * push, 0, h));
            out[i] = c[0]; out[i + 1] = c[1]; out[i + 2] = c[2]; out[i + 3] = c[3];
            continue;
        }
        // 3) the lens: a sphere normal, then Snell
        const nd = dist / lensRadius;
        const z = Math.sqrt(Math.max(0, 1.0 - nd * nd));
        const nx0 = dx / lensRadius, ny0 = dy / lensRadius;
        const nm = Math.hypot(nx0, ny0, z) || 1;
        const nx = nx0 / nm, ny = ny0 / nm, nz = z / nm;
        const eta = 1.0 / refraction;
        const cosI = nz;                                      // -dot(normal, (0,0,-1))
        const sinT2 = eta * eta * (1.0 - cosI * cosI);
        const k = eta * cosI - Math.sqrt(Math.max(0.0, 1.0 - sinT2));
        const rx = k * nx, ry = k * ny;                       // eta * incident contributes only to z
        const ruvx = uvx + rx * lensRadius * 0.5, ruvy = uvy + ry * lensRadius * 0.5;
        const chroma = aberration * (1.0 - z) * 0.01;
        const cdm = Math.hypot(dx + 0.001, dy + 0.001) || 1;
        let cdx = (dx + 0.001) / cdm, cdy = (dy + 0.001) / cdm;
        cdx /= aspect;                                        // *** RIGHT HALF: this one is spent in UV ***
        const rr = s(clamp((ruvx + cdx * chroma) * w, 0, w), clamp((ruvy + cdy * chroma) * h, 0, h));
        const gg = s(clamp(ruvx * w, 0, w), clamp(ruvy * h, 0, h));
        const bb = s(clamp((ruvx - cdx * chroma) * w, 0, w), clamp((ruvy - cdy * chroma) * h, 0, h));
        const spec = Math.pow(Math.max(nx * hv[0] + ny * hv[1] + nz * hv[2], 0.0), 64.0);
        const fresnel = Math.pow(1.0 - z, 4.0);
        const rim = Math.pow(nd, 6.0) * 0.3;
        const add = toHalf(spec * 0.6) + toHalf(fresnel * 0.2);
        out[i]     = rr[0] + add + toHalf(rim * 0.5);
        out[i + 1] = gg[1] + add + toHalf(rim * 0.6);
        out[i + 2] = bb[2] + add + toHalf(rim * 0.8);
        out[i + 3] = 1.0;                                     // upstream returns alpha 1 from the lens
    }
    return { w, h, data: out, premultiplied: img.premultiplied };
}
