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

const SHADERS = { emboss: EMBOSS_FRAG, heatShimmer: SHIMMER_FRAG };

/** The uniform each knob writes to, so a caller need not know the GLSL naming. */
const KNOBS = {
    emboss: { strength: "uStrength", angle: "uAngle", mixAmount: "uMixAmount", pointScale: "uPointScale", premultiplied: "uPremultiplied" },
    heatShimmer: { time: "uTime", amplitude: "uAmplitude", frequency: "uFrequency", speed: "uSpeed", verticalBias: "uVerticalBias", pointScale: "uPointScale" },
};

module.exports = { VERT, SHADERS, KNOBS, PREAMBLE, LUMA, EMBOSS_FRAG, SHIMMER_FRAG };
