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


// ---- BATCH 3 (v4164): the polar warps ------------------------------------------------------------------
// *** THE SAME FILE NEEDS BOTH REMAINDERS. *** batch 2's bcs_hsb2rgb needs fmod (trunc) because its hue is
// guaranteed non-negative and mod would still be wrong in general. THE KALEIDOSCOPE NEEDS mod (floor), because
// its angle comes from atan2 and atan2 returns [-PI, PI] -- negative for half of every image, and fmod would
// put that half OUTSIDE the segment. Upstream wrote the flooring form out by hand rather than calling fmod,
// which was the right call and is easy to "tidy" into a bug.
const VORTEX_FRAG = PREAMBLE + HELPERS + `
uniform float uTime, uTwistAmount, uRadius, uSpeed, uFalloff;
void main() {
    vec2 uv = swPos() / uSize;
    float aspect = uSize.x / uSize.y;
    vec2 delta = vec2((uv.x - 0.5) * aspect, uv.y - 0.5);
    float dist = length(delta);
    float angle = uTwistAmount * exp(-(dist / uRadius) * uFalloff) + uTime * uSpeed;
    float ca = cos(angle), sa = sin(angle);
    vec2 rotated = vec2(delta.x * ca - delta.y * sa, delta.x * sa + delta.y * ca);
    rotated.x /= aspect;                                  // aspect undone, or a vortex is an ellipse
    fragColor = layerSample(clamp((rotated + 0.5) * uSize, vec2(0.0), uSize));
}`;

const KALEIDO_FRAG = PREAMBLE + HELPERS + `
uniform float uTime, uSegments, uRotation, uZoom, uAnimateSpeed;
void main() {
    vec2 uv = swPos() / uSize;
    float aspect = uSize.x / uSize.y;
    vec2 delta = vec2((uv.x - 0.5) * aspect, uv.y - 0.5);
    float angle = atan(delta.y, delta.x) + uRotation + uTime * uAnimateSpeed;   // atan2 -> atan(y,x)
    float dist = length(delta);
    float segAngle = 6.283185307179586 / uSegments;
    // FLOORING, spelled out as upstream spells it. bcs_fmod here would put every negative angle outside the
    // segment, and atan() returns [-PI, PI].
    angle = angle - segAngle * floor(angle / segAngle);
    if (angle > segAngle * 0.5) angle = segAngle - angle;
    vec2 kal = vec2(cos(angle), sin(angle)) * dist / uZoom;
    kal.x /= aspect;
    fragColor = layerSample(clamp((kal + 0.5) * uSize, vec2(0.0), uSize));
}`;


// ---- BATCH 4 (v4164): the points trap, and a control -----------------------------------------------------
// *** chromaticSplit's OWN COMMENT SAYS "0-30: pixel distance between channels" AND IT IS POINTS. *** Even its
// author thought in pixels while writing in points. Ported straight onto gl_FragCoord a 30 becomes 30 DEVICE
// pixels -- half the intended split at 2x, a third at 3x -- and it still works and still animates.
const CHROMA_FRAG = PREAMBLE + HELPERS + `
uniform float uSpread, uAngle, uEdgeOnly, uTime, uAnimate, uPointScale;
void main() {
    vec2 p = swPos();
    vec2 uv = p / uSize;
    float mask = mix(1.0, smoothstep(0.1, 0.5, distance(uv, vec2(0.5))), uEdgeOnly);
    float sp = uSpread + ((uAnimate > 0.01) ? sin(uTime * 2.0) * uSpread * 0.3 * uAnimate : 0.0);
    vec2 dir = vec2(cos(uAngle), sin(uAngle)) * (sp * mask * uPointScale);
    vec4 r = layerSample(p + dir);
    vec4 g = layerSample(p);
    vec4 b = layerSample(p - dir);
    fragColor = vec4(r.r, g.g, b.b, g.a);
}`;

// The control: one sample, no offsets, no remainder, no polar step. What the machinery costs when nothing is
// tricky -- and it still needs the flip, because uv.y feeds the sines.
const PLASMA_FRAG = PREAMBLE + HELPERS + `
uniform float uTime, uIntensity, uScale, uSpeed, uColorMode, uClampOutput;
void main() {
    vec2 p = swPos();
    vec4 color = layerSample(p);
    vec2 st = (p / uSize) * uScale;
    float v1 = sin(st.x + uTime * uSpeed);
    float v2 = sin(st.y + uTime * uSpeed * 0.7);
    float v3 = sin(st.x + st.y + uTime * uSpeed * 0.5);
    float v4 = sin(length(st - vec2(uScale * 0.5)) + uTime * uSpeed * 1.3);
    float plasma = (v1 + v2 + v3 + v4) * 0.25;
    float lines = 1.0 / (1.0 + abs(plasma) * 20.0); lines = lines * lines;
    float v5 = sin(st.x * 2.0 - st.y * 1.5 + uTime * uSpeed * 0.9);
    float v6 = sin(length(st - vec2(uScale * 0.3, uScale * 0.7)) * 2.0 + uTime * uSpeed);
    float plasma2 = (v5 + v6) * 0.5;
    float lines2 = 1.0 / (1.0 + abs(plasma2) * 15.0); lines2 = lines2 * lines2;
    float total = (lines + lines2 * 0.5) * uIntensity;
    // The boundaries are < and not <=, matching upstream: a >= here shifts one palette across the whole knob.
    vec3 pal = (uColorMode < 0.33) ? vec3(0.3, 0.6, 1.0)
             : (uColorMode < 0.66) ? vec3(0.2, 1.0, 0.4)
                                   : vec3(0.8, 0.2, 1.0);
    vec3 rgb = color.rgb + pal * toHalf(total) + vec3(toHalf(total * 0.3));
    fragColor = vec4(uClampOutput > 0.5 ? clamp(rgb, 0.0, 1.0) : rgb, color.a);
}`;


// ---- BATCH 5 (v4164): the multi-sample family, and the edge rule's first case -----------------------------
// *** glitch CLAMPS AND THEN UN-CLAMPS ITSELF. *** `displaced` is clamped, and the channel shift is added
// AFTER, so the red and blue taps land outside the layer at every border. Metal's layer sampling has defined
// edges; GL WRAPS without CLAMP_TO_EDGE, and a glitch pulling the left edge into the right one LOOKS
// DELIBERATE -- the only one of the six traps a viewer would forgive as an artistic choice. layerSample() has
// clamped since batch 1, so nothing needed fixing here; what it needed was a case, and this is it.
const ECHO_FRAG = PREAMBLE + HELPERS + `
uniform float uTime, uEchoCount, uSpread, uDirection, uFade, uPointScale;
void main() {
    vec2 p = swPos();
    vec4 base = layerSample(p);
    float sp = uSpread * uPointScale;
    vec2 dir = vec2(cos(uDirection), sin(uDirection)) * sp;
    vec3 acc = base.rgb;
    float totalWeight = 1.0;                       // starts at 1 for the base: an AVERAGE, not a bloom
    for (int i = 1; i <= 8; i++) {
        if (float(i) > uEchoCount) break;
        float weight = pow(uFade, float(i));
        vec2 off = dir * float(i)
                 + vec2(sin(uTime * 2.0 + float(i) * 1.5), cos(uTime * 1.7 + float(i) * 2.0)) * sp * 0.1;
        vec4 e = layerSample(clamp(p - off, vec2(0.0), uSize));   // clamped BEFORE the sample, unlike glitch
        acc.r += toHalf(e.r * toHalf(1.0 - float(i) * 0.08)) * toHalf(weight);
        acc.g += e.g * toHalf(weight);
        acc.b += toHalf(e.b * toHalf(1.0 + float(i) * 0.05)) * toHalf(weight);
        totalWeight += weight;
    }
    fragColor = vec4(acc / totalWeight, base.a);
}`;

const GLITCH_FRAG = PREAMBLE + HELPERS + `
uniform float uTime, uIntensity, uBlockSize, uScanLines, uColorShift, uPointScale;
void main() {
    vec2 p = swPos();
    float glitchTime = floor(uTime * 10.0);
    float glitchActive = step(1.0 - uIntensity * 0.5, bcs_hash(vec2(glitchTime, 0.0)));
    float bs = uBlockSize * uPointScale;
    float blockY = floor((p.y / uSize.y) * (uSize.y / bs));
    float blockRand = bcs_hash(vec2(blockY, glitchTime));
    vec2 d = p;
    d.x += (blockRand - 0.5) * 2.0 * uIntensity * glitchActive * bs * 2.0;
    if (bcs_hash(vec2(blockY + 100.0, glitchTime)) > 0.95 && glitchActive > 0.5)
        d.y += (bcs_hash(vec2(blockY, glitchTime + 50.0)) - 0.5) * bs;
    d = clamp(d, vec2(0.0), uSize);
    float shift = uColorShift * uPointScale * glitchActive;
    // THE SHIFT IS APPLIED AFTER THE CLAMP, as upstream does. layerSample clamps, which is Metal's edge rule.
    vec4 r = layerSample(d + vec2(shift, 0.0));
    vec4 g = layerSample(d);
    vec4 b = layerSample(d - vec2(shift, 0.0));
    vec3 res = vec3(r.r, g.g, b.b);
    // The scanline is a function of position.y IN POINTS, so its FREQUENCY follows the point scale -- the same
    // trap as chromaticSplit's spread, in a place nobody looks because it reads as a frequency not a distance.
    float scanLine = pow(sin((p.y / uPointScale) * 6.283185307179586) * 0.5 + 0.5, 4.0);
    res *= 1.0 - toHalf(scanLine * uScanLines * 0.3);
    if (blockRand > 0.92 && glitchActive > 0.5) res += vec3(0.15);
    fragColor = vec4(res, g.a);
}`;

const SHADERS = { emboss: EMBOSS_FRAG, heatShimmer: SHIMMER_FRAG, solarize: SOLARIZE_FRAG, duochrome: DUOCHROME_FRAG, vortex: VORTEX_FRAG, kaleidoscope: KALEIDO_FRAG, chromaticSplit: CHROMA_FRAG, plasma: PLASMA_FRAG, echo: ECHO_FRAG, glitch: GLITCH_FRAG };

/** The uniform each knob writes to, so a caller need not know the GLSL naming. */
const KNOBS = {
    emboss: { strength: "uStrength", angle: "uAngle", mixAmount: "uMixAmount", pointScale: "uPointScale", premultiplied: "uPremultiplied" },
    heatShimmer: { time: "uTime", amplitude: "uAmplitude", frequency: "uFrequency", speed: "uSpeed", verticalBias: "uVerticalBias", pointScale: "uPointScale" },
    solarize: { time: "uTime", threshold: "uThreshold", curveIntensity: "uCurveIntensity", colorSeparation: "uColorSeparation", animate: "uAnimate", clampOutput: "uClampOutput" },
    duochrome: { time: "uTime", intensity: "uIntensity", hue1: "uHue1", hue2: "uHue2", contrast: "uContrast" },
    vortex: { time: "uTime", twistAmount: "uTwistAmount", radius: "uRadius", speed: "uSpeed", falloff: "uFalloff" },
    kaleidoscope: { time: "uTime", segments: "uSegments", rotation: "uRotation", zoom: "uZoom", animateSpeed: "uAnimateSpeed" },
    chromaticSplit: { spread: "uSpread", angle: "uAngle", edgeOnly: "uEdgeOnly", time: "uTime", animate: "uAnimate", pointScale: "uPointScale" },
    plasma: { time: "uTime", intensity: "uIntensity", scale: "uScale", speed: "uSpeed", colorMode: "uColorMode", clampOutput: "uClampOutput" },
    echo: { time: "uTime", echoCount: "uEchoCount", spread: "uSpread", direction: "uDirection", fade: "uFade", pointScale: "uPointScale" },
    glitch: { time: "uTime", intensity: "uIntensity", blockSize: "uBlockSize", scanLines: "uScanLines", colorShift: "uColorShift", pointScale: "uPointScale" },
};

module.exports = { VERT, SHADERS, KNOBS, PREAMBLE, HELPERS, LUMA, EMBOSS_FRAG, SHIMMER_FRAG, SOLARIZE_FRAG, DUOCHROME_FRAG, VORTEX_FRAG, KALEIDO_FRAG, CHROMA_FRAG, PLASMA_FRAG, ECHO_FRAG, GLITCH_FRAG };
