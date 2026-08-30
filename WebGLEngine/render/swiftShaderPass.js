// FILE: render/swiftShaderPass.js
// VERSION: v4163 -- the GLSL half of the SwiftUIShaders port. Shaped like crtPass.js, and checked against
// render/swiftShaderModel.mjs the way crtPass is checked against crtModel.
//
// Ported from krispuckett/SwiftUIShaders (MIT). The six Metal->GLSL traps are argued in the model; this file
// applies them, and each is marked at the line where it lands so a reader of the SHADER sees them too.
"use strict";

const VERT = `#version 300 es
in vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }`;

/** Rec.601, the weights the Metal source spells out. Shared by both shaders and by the CPU model. */
const LUMA = "vec3(0.299, 0.587, 0.114)";

// *** THE FLIP LIVES HERE, ONCE. *** SwiftUI's position.y grows downward and gl_FragCoord.y grows upward, so
// every shader below is written in SwiftUI's convention and this preamble converts into it -- the same choice
// crtPass.js made, for the same reason: one coordinate convention across the GPU and the CPU reference.
const PREAMBLE = `#version 300 es
precision highp float;
uniform sampler2D uTex;
uniform vec2 uSize;
out vec4 fragColor;
// SwiftUI-space fragment centre: y measured DOWN from the top, in POINTS.
vec2 swPos() { return vec2(gl_FragCoord.x, uSize.y - gl_FragCoord.y); }
// layer.sample(): NEAREST and CLAMPED. Nearest so the CPU model can be compared exactly; clamped because
// Metal's layer sampling has defined edges and GL wraps without being told.
vec4 layerSample(vec2 p) {
    ivec2 t = ivec2(clamp(floor(p), vec2(0.0), uSize - 1.0));
    return texelFetch(uTex, t, 0);
}
// half(x) in the Metal source is a DELIBERATE quantisation to mediump, not an accident of typing.
float toHalf(float x) {
    if (x == 0.0) return x;
    float e = floor(log2(abs(x)));
    float q = exp2(e - 10.0);
    return floor(x / q + 0.5) * q;
}`;

const EMBOSS_FRAG = PREAMBLE + `
uniform float uStrength, uAngle, uMixAmount, uPointScale, uPremultiplied;
void main() {
    vec2 p = swPos();
    vec2 dir = vec2(cos(uAngle), sin(uAngle));
    float off = 1.5 * uPointScale;             // 1.5 POINTS upstream -- scaled, not assumed equal to pixels
    vec4 a = layerSample(p + dir * off);
    vec4 b = layerSample(p - dir * off);
    vec4 c = layerSample(p);
    float e = toHalf((dot(a.rgb, ${LUMA}) - dot(b.rgb, ${LUMA})) * uStrength);
    // PREMULTIPLIED: upstream adds to the stored colour. STRAIGHT: alpha 0 has no colour to move.
    float add = (uPremultiplied > 0.5) ? e : (c.a > 0.0 ? e : 0.0);
    fragColor = vec4(mix(c.rgb, c.rgb + vec3(add), uMixAmount), c.a);
}`;

const SHIMMER_FRAG = PREAMBLE + `
uniform float uTime, uAmplitude, uFrequency, uSpeed, uVerticalBias, uPointScale;
void main() {
    vec2 p = swPos();
    vec2 uv = p / uSize;                        // uv.y measured DOWN, so verticalBias fades downward as upstream
    float bias = mix(1.0, 1.0 - uv.y, uVerticalBias);
    float amp = uAmplitude * uPointScale;
    float wave1 = sin(uv.y * uFrequency + uTime * uSpeed) * amp * bias;
    float wave2 = sin(uv.y * uFrequency * 1.7 + uTime * uSpeed * 0.8 + 2.0) * amp * 0.5 * bias;
    float waveY = cos(uv.x * uFrequency * 0.5 + uTime * uSpeed * 1.2) * amp * 0.3 * bias;
    vec2 d = clamp(p + vec2(wave1 + wave2, waveY), vec2(0.0), uSize);   // upstream clamps by hand
    fragColor = layerSample(d);
}`;


// ---- BATCH 2 (v4164): the shared helper layer -----------------------------------------------------------
// *** GLSL HAS NO fmod AND THE REFLEX IS `mod`. HERE THAT IS RIGHT FOR EVERY SHIPPED CALLER AND WRONG IN
// GENERAL. *** bcs_hsb2rgb is fmod(hue*6 + {0,4,2}, 6); both callers pass the hue through fract() so it is
// non-negative and the two agree. Pass a negative hue -- nothing does today, any later shader might -- and at
// hue -0.1 fmod gives -0.60 where mod gives 5.40, which is a different colour entirely. The guarantee lives at
// the CALL SITE, so the helper keeps fmod's semantics and costs nothing for it.
const HELPERS = `
float bcs_fmod(float a, float b) { return a - b * trunc(a / b); }
float bcs_hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
float bcs_valueNoise(vec2 st) {
    vec2 i = floor(st), f = fract(st), u = f * f * (3.0 - 2.0 * f);
    float a = bcs_hash(i), b = bcs_hash(i + vec2(1.0, 0.0));
    float c = bcs_hash(i + vec2(0.0, 1.0)), d = bcs_hash(i + vec2(1.0, 1.0));
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float bcs_fbm(vec2 st, int octaves) {
    float value = 0.0, amplitude = 0.5, frequency = 1.0;
    for (int i = 0; i < 8; i++) { if (i >= octaves) break;
        value += amplitude * bcs_valueNoise(st * frequency); frequency *= 2.0; amplitude *= 0.5; }
    return value;
}
vec3 bcs_hsb2rgb(vec3 c) {
    vec3 rgb = clamp(abs(vec3(bcs_fmod(c.x * 6.0 + 0.0, 6.0),
                              bcs_fmod(c.x * 6.0 + 4.0, 6.0),
                              bcs_fmod(c.x * 6.0 + 2.0, 6.0)) - 3.0) - 1.0, 0.0, 1.0);
    rgb = rgb * rgb * (3.0 - 2.0 * rgb);
    return c.z * mix(vec3(1.0), rgb, c.y);
}
float luma601(vec3 c) { return dot(c, ${LUMA}); }
`;

const SOLARIZE_FRAG = PREAMBLE + HELPERS + `
uniform float uTime, uThreshold, uCurveIntensity, uColorSeparation, uAnimate, uClampOutput;
void main() {
    vec2 p = swPos();
    vec4 original = layerSample(p);
    vec2 uv = p / uSize;
    float t = uThreshold + sin(uTime * 1.5 + uv.x * 3.0) * uAnimate * 0.15;
    vec3 result;
    for (int ch = 0; ch < 3; ch++) {
        float channelThreshold = t + float(ch) * uColorSeparation * 0.08;
        float val = original[ch];
        float d = abs(val - channelThreshold);
        float curve = clamp(1.0 - pow(d * uCurveIntensity, 2.0), 0.0, 1.0);
        result[ch] = toHalf(mix(val, 1.0 - val, curve));
    }
    // Upstream does NOT clamp after the grain: half4 clamps on the way to the display instead. Clamping here
    // unconditionally would make this a quieter shader than upstream's.
    float ft = fract(uTime * 0.1);
    result += vec3((bcs_hash(uv * 500.0 + ft) - 0.5) * 0.04);
    fragColor = vec4(uClampOutput > 0.5 ? clamp(result, 0.0, 1.0) : result, original.a);
}`;

const DUOCHROME_FRAG = PREAMBLE + HELPERS + `
uniform float uTime, uIntensity, uHue1, uHue2, uContrast;
void main() {
    vec4 original = layerSample(swPos());
    float L = clamp((luma601(original.rgb) - 0.5) * uContrast + 0.5, 0.0, 1.0);
    float animHue1 = fract(uHue1 + sin(uTime * 0.30) * 0.02);
    float animHue2 = fract(uHue2 + cos(uTime * 0.25) * 0.02);
    vec3 shadowColor = bcs_hsb2rgb(vec3(toHalf(animHue1), 0.85, 0.4));
    vec3 highlightColor = bcs_hsb2rgb(vec3(toHalf(animHue2), 0.7, 1.0));
    // Both halves are linear in L and meet at 0.5, so the curve is continuous there -- an off-by-one in either
    // branch shows as a band across every midtone in the picture.
    vec3 duo = (L < 0.5) ? mix(vec3(0.02), shadowColor, toHalf(L * 2.0))
                         : mix(shadowColor, highlightColor, toHalf((L - 0.5) * 2.0));
    fragColor = vec4(mix(original.rgb, duo, toHalf(uIntensity)), original.a);
}`;

const SHADERS = { emboss: EMBOSS_FRAG, heatShimmer: SHIMMER_FRAG, solarize: SOLARIZE_FRAG, duochrome: DUOCHROME_FRAG };

/** The uniform each knob writes to, so a caller need not know the GLSL naming. */
const KNOBS = {
    emboss: { strength: "uStrength", angle: "uAngle", mixAmount: "uMixAmount", pointScale: "uPointScale", premultiplied: "uPremultiplied" },
    heatShimmer: { time: "uTime", amplitude: "uAmplitude", frequency: "uFrequency", speed: "uSpeed", verticalBias: "uVerticalBias", pointScale: "uPointScale" },
    solarize: { time: "uTime", threshold: "uThreshold", curveIntensity: "uCurveIntensity", colorSeparation: "uColorSeparation", animate: "uAnimate", clampOutput: "uClampOutput" },
    duochrome: { time: "uTime", intensity: "uIntensity", hue1: "uHue1", hue2: "uHue2", contrast: "uContrast" },
};

module.exports = { VERT, SHADERS, KNOBS, PREAMBLE, HELPERS, LUMA, EMBOSS_FRAG, SHIMMER_FRAG, SOLARIZE_FRAG, DUOCHROME_FRAG };
