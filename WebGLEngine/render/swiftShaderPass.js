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
//
// *** v4196 -- THE EXPONENT IS CLAMPED, AND WITHOUT THAT THIS RETURNED NaN. *** A half has five exponent
// bits and cannot represent 1e-35; the answer there is 0. Unclamped, e = -116 made exp2(e - 10) so small
// that x / q was Inf and floor(Inf + 0.5) * q was NaN -- one contagious NaN, and the pixel came out black.
// bcs_refractLens computes pow(dot, 64.0), which reaches 1e-35 for an ordinary dot of 0.28. Measured in a
// headless GL context: four pixels of the lens rendered pure black before this line.
// -14.0 is half's smallest NORMAL exponent, so subnormals land on multiples of 2^-24 and smaller values
// flush to zero -- which is what the hardware does.
float toHalf(float x) {
    if (x == 0.0) return x;
    if (abs(x) > 65504.0) return sign(x) * 65504.0;
    float e = max(floor(log2(abs(x))), -14.0);
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


// ---- BATCH 6 (v4164): the noise family, with the y flip explained by its own author ------------------------
// *** melt's COMMENT IS "negative Y = pull up = melt down", AND THAT IS TRUE ONLY Y-DOWN. *** Sampling a
// smaller y means sampling HIGHER UP and drawing it here, which reads as sagging. Against gl_FragCoord, where
// y grows up, -drip samples from BELOW and the picture melts UPWARD -- still animating, still liquid, gravity
// backwards. And `gravity = uv.y * uv.y` ("bottom melts more") peaks at the bottom only the same way up, so
// the two errors COMPOUND rather than cancel. swPos() puts both in SwiftUI's frame, once.
const MELT_FRAG = PREAMBLE + HELPERS + `
uniform float uTime, uMeltAmount, uDripScale, uSpeed, uHeat, uPointScale;
void main() {
    vec2 p = swPos();
    vec2 uv = p / uSize;
    float column = uv.x * uDripScale;
    float dripNoise = bcs_fbm(vec2(column, uTime * uSpeed * 0.3), 4);
    float dripNoise2 = bcs_fbm(vec2(column * 1.7 + 3.0, uTime * uSpeed * 0.25), 3);
    float gravity = uv.y * uv.y;                      // uv.y grows DOWN, so this peaks at the bottom
    float drip = (dripNoise * 0.7 + dripNoise2 * 0.3) * uMeltAmount * gravity * uPointScale;
    float wobble = sin(uv.y * 10.0 + uTime * uSpeed * 2.0 + dripNoise * 5.0) * uMeltAmount * 0.05 * gravity * uPointScale;
    vec4 color = layerSample(clamp(p + vec2(wobble, -drip), vec2(0.0), uSize));
    float meltFactor = drip / max(uMeltAmount, 1.0);
    color.r += toHalf(meltFactor * uHeat * 0.3);
    color.g -= toHalf(meltFactor * uHeat * 0.1);
    color.b -= toHalf(meltFactor * uHeat * 0.2);
    float dripEdge = abs(bcs_fbm(vec2(column + 0.01, uTime * uSpeed * 0.3), 4) - dripNoise);
    color.rgb += vec3(pow(dripEdge * 5.0, 3.0) * gravity * 0.4);
    fragColor = color;
}`;

const TOPO_FRAG = PREAMBLE + HELPERS + `
uniform float uTime, uLineCount, uLineWidth, uColorize, uAnimate;
void main() {
    vec2 p = swPos();
    vec4 original = layerSample(p);
    float lum = luma601(original.rgb);
    float elevation = lum + uTime * uAnimate * 0.05;
    float cv = fract(elevation * uLineCount);
    // DOUBLE-SIDED: a band on both sides of every crossing. One side only halves every line and reads as
    // hatching rather than as a contour.
    float contourLine = clamp((1.0 - smoothstep(uLineWidth, uLineWidth + 0.02, cv))
                            + (1.0 - smoothstep(uLineWidth, uLineWidth + 0.02, 1.0 - cv)), 0.0, 1.0);
    float mv = fract(elevation * uLineCount / 5.0);
    float majorLine = clamp((1.0 - smoothstep(uLineWidth * 2.0, uLineWidth * 2.0 + 0.03, mv))
                          + (1.0 - smoothstep(uLineWidth * 2.0, uLineWidth * 2.0 + 0.03, 1.0 - mv)), 0.0, 1.0);
    vec3 topo = (lum < 0.2)  ? mix(vec3(0.10, 0.30, 0.50), vec3(0.15, 0.45, 0.30), toHalf(lum * 5.0))
              : (lum < 0.5)  ? mix(vec3(0.15, 0.45, 0.30), vec3(0.80, 0.75, 0.40), toHalf((lum - 0.2) * 3.33))
              : (lum < 0.75) ? mix(vec3(0.80, 0.75, 0.40), vec3(0.65, 0.45, 0.30), toHalf((lum - 0.5) * 4.0))
                             : mix(vec3(0.65, 0.45, 0.30), vec3(0.95, 0.95, 0.97), toHalf((lum - 0.75) * 4.0));
    vec3 res = mix(original.rgb, topo, toHalf(uColorize));
    res = mix(res, vec3(0.15, 0.12, 0.10), toHalf(contourLine * 0.7));
    res = mix(res, vec3(0.05, 0.04, 0.03), toHalf(majorLine * 0.9));
    res += vec3(bcs_valueNoise(p / uSize * 200.0) * 0.06 - 0.03);
    fragColor = vec4(res, original.a);
}`;


// ---- BATCH 7 (v4164): a convolution kernel measured in points ---------------------------------------------
// *** neonEdge's SOBEL STEP IS 1.0 AND THAT IS ONE POINT. *** At 2x the original compares neighbours TWO
// device pixels apart. For an offset that is a shift; FOR A KERNEL IT CHANGES WHAT COUNTS AS AN EDGE, and the
// picture gains a wiry crawl that reads as sharpening rather than as a bug. And gy is bottom-minus-top in a
// y-down frame, so an unflipped port inverts it, rotates atan2(gy,gx), and the edges glow the WRONG COLOURS in
// the right places.
const THERMAL_FRAG = PREAMBLE + HELPERS + `
uniform float uTime, uIntensity, uShimmer, uNoiseSpeed, uPaletteShift, uPointScale;
void main() {
    vec2 p = swPos();
    vec2 uv = p / uSize;
    vec2 st = uv * 8.0;
    float sh = uShimmer * uPointScale;
    float n1 = bcs_valueNoise(st + vec2(0.0, uTime * uNoiseSpeed * 2.0));
    float n2 = bcs_valueNoise(st * 1.3 + vec2(uTime * uNoiseSpeed * 1.5, 0.0));
    // The rising bias is a NEGATIVE y offset: it samples from higher up, so the content appears to rise --
    // true only in a y-down frame, which is the third shader in this file to depend on that.
    vec2 heatDisp = vec2((n1 - 0.5) * sh, (n2 - 0.5) * sh * 0.6 - sh * 0.3);
    vec4 original = layerSample(clamp(p + heatDisp, vec2(0.0), uSize));
    float heat = luma601(original.rgb);
    heat += (bcs_valueNoise(uv * 20.0 + uTime * 0.5) - 0.5) * 0.05;
    heat = clamp(heat + uPaletteShift * 0.3, 0.0, 1.0);
    vec3 t = (heat < 0.15) ? mix(vec3(0.0), vec3(0.0, 0.0, 0.3), toHalf(heat / 0.15))
           : (heat < 0.35) ? mix(vec3(0.0, 0.0, 0.3), vec3(0.5, 0.0, 0.5), toHalf((heat - 0.15) / 0.2))
           : (heat < 0.55) ? mix(vec3(0.5, 0.0, 0.5), vec3(1.0, 0.0, 0.0), toHalf((heat - 0.35) / 0.2))
           : (heat < 0.75) ? mix(vec3(1.0, 0.0, 0.0), vec3(1.0, 0.6, 0.0), toHalf((heat - 0.55) / 0.2))
           : (heat < 0.90) ? mix(vec3(1.0, 0.6, 0.0), vec3(1.0, 1.0, 0.0), toHalf((heat - 0.75) / 0.15))
                           : mix(vec3(1.0, 1.0, 0.0), vec3(1.0), toHalf((heat - 0.9) / 0.1));
    fragColor = vec4(mix(original.rgb, t, toHalf(uIntensity)), original.a);
}`;

const NEON_FRAG = PREAMBLE + HELPERS + `
uniform float uTime, uEdgeStrength, uGlowAmount, uColorCycle, uMixOriginal, uPointScale;
void main() {
    vec2 p = swPos();
    vec4 original = layerSample(p);
    float st = 1.0 * uPointScale;                 // ONE POINT -- a kernel, not an offset
    float tl = luma601(layerSample(p + vec2(-st, -st)).rgb);
    float tc = luma601(layerSample(p + vec2(0.0, -st)).rgb);
    float tr = luma601(layerSample(p + vec2( st, -st)).rgb);
    float ml = luma601(layerSample(p + vec2(-st, 0.0)).rgb);
    float mr = luma601(layerSample(p + vec2( st, 0.0)).rgb);
    float bl = luma601(layerSample(p + vec2(-st,  st)).rgb);
    float bc = luma601(layerSample(p + vec2(0.0,  st)).rgb);
    float br = luma601(layerSample(p + vec2( st,  st)).rgb);
    float gx = -tl - 2.0 * ml - bl + tr + 2.0 * mr + br;
    float gy = -tl - 2.0 * tc - tr + bl + 2.0 * bc + br;    // bottom minus top, y-DOWN
    float edgeMag = clamp(sqrt(gx * gx + gy * gy) * uEdgeStrength, 0.0, 1.0);
    // fract() here is what makes bcs_hsb2rgb's fmod safe -- atan() returns [-PI, PI] and fract lands it in
    // [0,1). All four call sites in the upstream file do this; the gate asserts ours do too.
    float hue = fract(atan(gy, gx) / 6.2832 + uTime * uColorCycle * 0.3 + (p.y / uSize.y) * 0.5);
    vec3 neon = bcs_hsb2rgb(vec3(toHalf(hue), 1.0, 1.0));
    float bloom = pow(edgeMag, 0.7) * uGlowAmount;
    fragColor = vec4(original.rgb * toHalf(uMixOriginal * 0.5) + neon * toHalf(edgeMag + bloom), original.a);
}`;


/** The uniform each knob writes to, so a caller need not know the GLSL naming. */

// ---- BATCH 9 (v4196): five radial displacement shaders ---------------------------------------------------
//
// *** THE KNOB IS A COORDINATE. *** uTouchX/uTouchY arrive in POINTS with y measured DOWN, the same frame
// swPos() produces -- so they need the SAME scaling the fragment coordinate gets, and the caller has to hand
// over a y that was already flipped. Nothing in the shader can detect a y that was not. See the model header.
//
// *** AND `delta.x *= aspect` CONVERTS uv INTO PIXEL PROPORTIONS, IT DOES NOT ABSTRACTLY ROUND THE FIELD. ***
// So a direction spent on `position` must NOT be divided back, and one spent on a uv must be. liveRipple and
// refractLens's push ring divide back where they should not; both are reproduced as upstream wrote them and
// measured by the gate. Marked at the line in each.

const TOUCHRIPPLE_FRAG = PREAMBLE + `
uniform float uTouchX, uTouchY, uTouchAge, uAmplitude, uFrequency, uSpeed, uDecay, uPointScale;
void main() {
    vec2 p = swPos();
    // THE EARLY-OUT IS HOW THE RIPPLE ENDS -- not a guard. Clamping instead freezes a ring on screen forever.
    if (uTouchAge < 0.01 || uTouchAge > 5.0) { fragColor = layerSample(p); return; }
    vec2 touch = vec2(uTouchX, uTouchY) * uPointScale;   // POINTS, y DOWN -- the same frame as swPos()
    vec2 delta = p - touch;
    float dist = length(delta);                          // raw pixel length: no aspect term anywhere
    float distFromFront = dist - uTouchAge * uSpeed * uPointScale;
    float waveWidth = (60.0 + uTouchAge * 40.0) * uPointScale;
    float envelope = exp(-(distFromFront * distFromFront) / (2.0 * waveWidth * waveWidth));
    float timeFade = exp(-uTouchAge * uDecay);
    float wave = (sin(distFromFront * uFrequency * 0.008)
                + sin(distFromFront * uFrequency * 0.005 + 1.0) * 0.5)
                * 0.67 * envelope * timeFade * uAmplitude * uPointScale;
    vec2 dir = dist > 0.5 * uPointScale ? delta / dist : vec2(0.0);
    vec2 disp = clamp(p + dir * wave, vec2(0.0), uSize);
    vec4 c = layerSample(disp);
    float chromaAmt = abs(wave) * 0.08;
    vec4 r = layerSample(clamp(disp + dir * chromaAmt, vec2(0.0), uSize));
    vec4 b = layerSample(clamp(disp - dir * chromaAmt, vec2(0.0), uSize));
    float t = toHalf(envelope * timeFade * 0.3);
    fragColor = vec4(mix(c.r, r.r, t), c.g, mix(c.b, b.b, t), c.a);
}`;

const LIVERIPPLE_FRAG = PREAMBLE + `
uniform float uTime, uAmplitude, uFrequency, uSpeed, uDamping, uRingCount, uPointScale;
void main() {
    vec2 p = swPos();
    vec2 uv = p / uSize;
    float aspect = uSize.x / uSize.y;
    vec2 off = vec2(0.0);
    for (int i = 0; i < 8; i++) {                        // constant bound + break: this file's idiom
        if (float(i) >= uRingCount) break;
        float phase = float(i) * 1.256;
        vec2 rc = vec2(0.5) + vec2(sin(uTime * 0.3 + phase), cos(uTime * 0.4 + phase)) * 0.05;
        vec2 d = vec2((uv.x - rc.x) * aspect, uv.y - rc.y);
        float dist = length(d);
        float wave = sin(dist * uFrequency - uTime * uSpeed + phase);
        float envelope = exp(-dist * uDamping);
        vec2 dir = dist > 0.001 ? d / dist : vec2(0.0);
        dir.x /= aspect;                                 // *** THE DEFECT: d was ALREADY pixel-proportional ***
        off += dir * wave * envelope * uAmplitude * uPointScale / uRingCount;
    }
    fragColor = layerSample(clamp(p + off, vec2(0.0), uSize));
}`;

const SHOCKWAVE_FRAG = PREAMBLE + HELPERS + `
uniform float uTime, uWaveSpeed, uRingWidth, uStrength, uRepeatRate, uPointScale;
void main() {
    vec2 p = swPos();
    float aspect = uSize.x / uSize.y;
    vec2 d = vec2((p.x / uSize.x - 0.5) * aspect, p.y / uSize.y - 0.5);
    float dist = length(d) * uSize.y;
    // *** uRepeatRate == 0 MAKES EVERY PIXEL NaN. *** Upstream documents 0.5-5 and never guards it; 0 is
    // what an undragged slider reports. Reproduced -- the gate names it rather than letting it surprise.
    float cycleTime = bcs_fmod(uTime, uRepeatRate);
    float waveFront = cycleTime * uWaveSpeed * uPointScale;
    float fadeWithDist = exp(-waveFront * 0.003);
    float ringMask = 1.0 - smoothstep(0.0, uRingWidth * uPointScale, abs(dist - waveFront));
    ringMask *= ringMask; ringMask *= fadeWithDist;
    vec2 dir = dist > 0.001 ? d / length(d) : vec2(0.0);  // *** correctly NOT divided back by aspect ***
    float waveFront2 = max(cycleTime - 0.15, 0.0) * uWaveSpeed * 0.9 * uPointScale;
    float ringMask2 = 1.0 - smoothstep(0.0, uRingWidth * 0.7 * uPointScale, abs(dist - waveFront2));
    ringMask2 *= ringMask2 * fadeWithDist * 0.5;
    float amt = ringMask * uStrength * uPointScale + ringMask2 * uStrength * 0.4 * uPointScale;
    vec2 sp = clamp(p + dir * amt, vec2(0.0), uSize);
    vec4 c = layerSample(sp);
    float chromaAmt = ringMask * uStrength * 0.15 * uPointScale;
    vec4 r = layerSample(clamp(sp + dir * chromaAmt, vec2(0.0), uSize));
    vec4 b = layerSample(clamp(sp - dir * chromaAmt, vec2(0.0), uSize));
    float t = toHalf(ringMask * 0.6), flash = toHalf(ringMask * 0.15);
    fragColor = vec4(mix(c.r, r.r, t) + flash, c.g + flash, mix(c.b, b.b, t) + flash, c.a);
}`;

const GRAVITYWELLS_FRAG = PREAMBLE + `
uniform float uTime, uWellStrength, uWellCount, uOrbitSpeed, uWarpFalloff, uPointScale;
void main() {
    vec2 p = swPos();
    vec2 uv = p / uSize;
    float aspect = uSize.x / uSize.y;
    float wells = floor(clamp(uWellCount, 1.0, 5.0));     // upstream clamps BEFORE the int -- never zero trips
    vec2 total = vec2(0.0);
    for (int i = 0; i < 5; i++) {
        if (float(i) >= wells) break;
        float phase = float(i) * 6.2832 / wells;
        float sp = uOrbitSpeed * (0.7 + float(i) * 0.15);
        float orbitRadius = 0.2 + float(i) * 0.06;
        vec2 wp = vec2(0.5 + cos(uTime * sp + phase) * orbitRadius,
                       0.5 + sin(uTime * sp * 0.8 + phase * 1.3) * orbitRadius);
        vec2 d = vec2((uv.x - wp.x) * aspect, uv.y - wp.y);
        float dist = length(d);
        float pull = uWellStrength / (pow(dist, uWarpFalloff) * uSize.y + 10.0 * uPointScale);
        pull = min(pull, uWellStrength * 0.5) * uPointScale;
        vec2 dir = dist > 0.001 ? d / dist : vec2(0.0);
        total -= dir * pull;                              // *** correctly NOT divided back by aspect ***
    }
    vec2 sp2 = clamp(p + total, vec2(0.0), uSize);
    vec4 c = layerSample(sp2);
    vec2 chroma = total * 0.08;
    vec4 r = layerSample(clamp(sp2 + chroma, vec2(0.0), uSize));
    vec4 b = layerSample(clamp(sp2 - chroma, vec2(0.0), uSize));
    float t = toHalf(clamp(length(total) * 0.1 * 0.02, 0.0, 0.5));
    fragColor = vec4(mix(c.r, r.r, t), c.g, mix(c.b, b.b, t), c.a);
}`;

const REFRACTLENS_FRAG = PREAMBLE + `
uniform float uTouchX, uTouchY, uLensRadius, uRefraction, uAberration, uWobble, uPointScale;
void main() {
    vec2 p = swPos();
    vec2 uv = p / uSize;
    float aspect = uSize.x / uSize.y;
    vec2 lc = clamp(vec2(uTouchX, uTouchY) * uPointScale / uSize, vec2(0.05), vec2(0.95));
    vec2 d = vec2((uv.x - lc.x) * aspect, uv.y - lc.y);
    float dist = length(d);
    if (dist > uLensRadius * 1.3) { fragColor = layerSample(p); return; }      // 1) outside
    if (dist > uLensRadius) {                                                  // 2) the push ring
        // smoothstep with e0 > e1 -- UNDEFINED in both specs, and relied on for a descending ramp.
        float outerRing = smoothstep(uLensRadius * 1.3, uLensRadius, dist);
        vec2 pd = dist > 0.001 ? d / dist : vec2(0.0);
        pd.x /= aspect;                                   // *** WRONG HALF: this one is spent in PIXELS ***
        fragColor = layerSample(clamp(p + pd * outerRing * 8.0 * uPointScale, vec2(0.0), uSize));
        return;
    }
    float nd = dist / uLensRadius;                                             // 3) the lens
    float z = sqrt(max(0.0, 1.0 - nd * nd));
    vec3 n = normalize(vec3(d / uLensRadius, z));
    float eta = 1.0 / uRefraction;
    float cosI = n.z;
    float sinT2 = eta * eta * (1.0 - cosI * cosI);
    float k = eta * cosI - sqrt(max(0.0, 1.0 - sinT2));
    vec2 ruv = uv + vec2(k * n.x, k * n.y) * uLensRadius * 0.5;
    float chroma = uAberration * (1.0 - z) * 0.01;
    vec2 cd = normalize(d + 0.001);
    cd.x /= aspect;                                       // *** RIGHT HALF: this one is spent in UV ***
    vec4 rr = layerSample(clamp((ruv + cd * chroma) * uSize, vec2(0.0), uSize));
    vec4 gg = layerSample(clamp(ruv * uSize, vec2(0.0), uSize));
    vec4 bb = layerSample(clamp((ruv - cd * chroma) * uSize, vec2(0.0), uSize));
    vec3 lightDir = normalize(vec3(0.3, -0.3, 1.0));
    vec3 halfVec = normalize(lightDir + vec3(0.0, 0.0, 1.0));
    float add = toHalf(pow(max(dot(n, halfVec), 0.0), 64.0) * 0.6) + toHalf(pow(1.0 - z, 4.0) * 0.2);
    float rim = pow(nd, 6.0) * 0.3;
    // Additive and UNCLAMPED, as upstream leaves it -- a bright source can exceed 1.0 inside the lens.
    fragColor = vec4(rr.r + add + toHalf(rim * 0.5),
                     gg.g + add + toHalf(rim * 0.6),
                     bb.b + add + toHalf(rim * 0.8), 1.0);
}`;

/** Every shader this file can build. Defined AFTER the frags -- `const` is not hoisted. */
/* ---- BATCH 10 (v4233): the five hash-free shaders, so every one is gradeable to the pixel ---------------- */

const WAVEPOOL_FRAG = PREAMBLE + HELPERS + `
uniform float uTime, uAmplitude, uWavelength, uSpeed, uComplexity, uPointScale;
void main() {
    vec2 p = swPos();
    vec2 uv = p / uSize;
    // int(x) TRUNCATES in both languages, and the knob is a float on purpose: 2.9 is two waves.
    int waves = int(uComplexity);
    vec2 off = vec2(0.0);
    for (int i = 0; i < 8; i++) {
        if (i >= waves) break;
        float angle = float(i) * 3.14159 / float(waves);   // 3.14159, upstream's constant, not PI
        vec2 dir = vec2(cos(angle), sin(angle));
        float wave = sin(dot(uv, dir) * uWavelength + uTime * uSpeed + float(i) * 1.5);
        off += vec2(-dir.y, dir.x) * wave * uAmplitude * uPointScale / float(waves);
    }
    fragColor = layerSample(clamp(p + off, vec2(0.0), uSize));
}`;

const PULSE_FRAG = PREAMBLE + HELPERS + `
uniform float uTime, uAmplitude, uBpm, uSharpness, uGlowIntensity, uPointScale, uPremultiplied;
void main() {
    vec2 p = swPos();
    vec2 uv = p / uSize;
    vec2 d = uv - 0.5;
    float dist = length(d);
    float raw = sin(uTime * (uBpm / 60.0) * 3.14159 * 2.0);
    float beat = pow(abs(raw), 1.0 / uSharpness) * sign(raw) * 0.5 + 0.5;
    float disp = beat * uAmplitude * uPointScale * smoothstep(0.0, 0.3, dist);
    vec2 sp = p + (dist > 0.001 ? normalize(d) : vec2(0.0)) * disp;
    vec4 c = layerSample(clamp(sp, vec2(0.0), uSize));
    float edgeDist = min(min(uv.x, 1.0 - uv.x), min(uv.y, 1.0 - uv.y));
    float glow = (1.0 - smoothstep(0.0, 0.15, edgeDist)) * beat * uGlowIntensity;
    // trap 2: upstream adds into a PREMULTIPLIED sample. Straight alpha needs the same add scaled by alpha.
    float k = (uPremultiplied > 0.5 || c.a == 0.0) ? 1.0 : c.a;
    c.rgb += vec3(toHalf(glow * 0.5), toHalf(glow * 0.3), toHalf(glow * 0.6)) * k;
    fragColor = c;
}`;

const HOLOGRAPHIC_FRAG = PREAMBLE + HELPERS + `
uniform float uTime, uIntensity, uScale, uSpeed, uAngleOffset, uPremultiplied;
void main() {
    vec2 p = swPos();
    vec2 uv = p / uSize;
    vec4 c = layerSample(p);
    float phase = (uv.x * cos(uAngleOffset) + uv.y * sin(uAngleOffset)) * uScale + uTime * uSpeed;
    // 2.094h and 4.189h are 2pi/3 and 4pi/3 ALREADY ROUNDED TO HALF upstream; keep the rounding.
    vec3 rainbow = vec3(
        toHalf(toHalf(sin(phase))                  * toHalf(0.5) + toHalf(0.5)),
        toHalf(toHalf(sin(phase + toHalf(2.094)))   * toHalf(0.5) + toHalf(0.5)),
        toHalf(toHalf(sin(phase + toHalf(4.189)))   * toHalf(0.5) + toHalf(0.5)));
    float lum = dot(c.rgb, ${LUMA});
    float k = (uPremultiplied > 0.5 || c.a == 0.0) ? 1.0 : c.a;
    vec3 rgb = c.rgb + rainbow * toHalf(uIntensity * smoothstep(0.3, 0.8, lum)) * k;
    float gray = toHalf(dot(rgb, ${LUMA}));
    // mix past 1.0 -- an extrapolation, which is the saturation boost
    fragColor = vec4(vec3(gray) + (rgb - vec3(gray)) * toHalf(1.1), c.a);
}`;

// *** THE FIRST SHADER IN THIS PORT THAT USES bcs_fmod, WHICH HAS SAT UNUSED SINCE v4163 WAITING FOR IT. ***
// spiralAngle comes from atan(y,x) and so is negative across most of the image. MEASURED at 48x48: swapping
// GLSL's mod for Metal's fmod changes 87.8% of pixels, worst channel difference 255 levels of 255 -- and
// 88.5% of the image has a negative spiralAngle, which is the region where the two can differ at all. The two
// figures agreeing is what says the mechanism is understood rather than the number merely observed.
const GEOWARP_FRAG = PREAMBLE + HELPERS + `
uniform float uTime, uSpiralTight, uZoomRepeat, uRotation, uBlend, uPremultiplied;
void main() {
    vec2 uv = swPos() / uSize;
    vec2 d = uv - 0.5;
    float r = length(d);
    float logR = log(max(r, 0.0001));
    float spiralAngle = atan(d.y, d.x) + logR * uSpiralTight + uTime * 0.5 + uRotation;
    float zp = logR * uZoomRepeat + uTime * 0.2;
    float repeatedR = exp(fract(zp) / uZoomRepeat);
    float seg = 6.28 / 6.0;                                 // 6.28 is upstream's own 2*PI, kept verbatim
    float kAngle = bcs_fmod(spiralAngle, seg);
    if (bcs_fmod(floor(spiralAngle / seg), 2.0) > 0.5) kAngle = seg - kAngle;
    float finalAngle = mix(spiralAngle, kAngle, uBlend);
    vec2 warped = fract(0.5 + vec2(cos(finalAngle), sin(finalAngle)) * repeatedR * 0.3);
    vec4 c = layerSample(clamp(warped * uSize, vec2(0.0), uSize));
    float centerGlow = exp(-r * r * 8.0) * 0.15;
    float boundary = 1.0 - smoothstep(0.0, 0.02, abs(fract(zp) - 0.5) - 0.48);
    float k = (uPremultiplied > 0.5 || c.a == 0.0) ? 1.0 : c.a;
    c.rgb += vec3(toHalf(centerGlow * 0.5) + toHalf(boundary * 0.05),
                  toHalf(centerGlow * 0.7) + toHalf(boundary * 0.02),
                  toHalf(centerGlow)       + toHalf(boundary * 0.08)) * k;
    fragColor = c;
}`;

const BLACKHOLE_FRAG = PREAMBLE + HELPERS + `
uniform float uTime, uMass, uSpin, uDistortion, uRingBrightness, uPremultiplied;
void main() {
    vec2 uv = swPos() / uSize;
    float aspect = uSize.x / uSize.y;
    vec2 d = vec2((uv.x - 0.5) * aspect, uv.y - 0.5);
    float dist = length(d);
    float angle = atan(d.y, d.x);
    float rs = uMass * 0.3;
    float bend = min(rs / max(dist * dist, 0.001), 5.0);
    vec2 warped = d + (dist > 0.001 ? normalize(d) : vec2(0.0)) * bend * 0.1;
    float drag = uSpin * rs / max(dist, 0.01) * uTime;
    float cd = cos(drag), sd = sin(drag);
    warped = vec2(warped.x * cd - warped.y * sd, warped.x * sd + warped.y * cd);
    warped.x /= aspect;                                     // undone, or the hole is an ellipse
    vec4 c = layerSample(clamp((warped + 0.5) * uSize, vec2(0.0), uSize));
    float horizon = smoothstep(rs * 0.5, rs * 1.5, dist);
    float ringDist = abs(dist - rs * 2.5);
    float ring = exp(-ringDist * ringDist / (rs * rs * 0.3));
    float rp = sin(angle * 8.0 - uTime * uSpin * 3.0) * 0.5 + 0.5;
    ring *= 0.5 + (rp * rp) * 0.5;
    float ringPos = smoothstep(rs * 1.5, rs * 4.0, dist);
    vec3 ringColor = vec3(mix(toHalf(0.7),  toHalf(1.0), toHalf(ringPos)),
                          mix(toHalf(0.85), toHalf(0.6), toHalf(ringPos)),
                          mix(toHalf(1.0),  toHalf(0.2), toHalf(ringPos)));
    float k = (uPremultiplied > 0.5 || c.a == 0.0) ? 1.0 : c.a;
    fragColor = vec4(c.rgb * toHalf(horizon) + ringColor * toHalf(ring * uRingBrightness) * k, c.a);
}`;

/* ---- BATCH 11 (v4234): the last gradeable shader, and three that are shape-checked by necessity ---------- */

const WORMHOLE_FRAG = PREAMBLE + HELPERS + `
uniform float uTime, uDepth, uSpeed, uTwist, uRadius, uPremultiplied;
void main() {
    vec2 uv = swPos() / uSize;
    float aspect = uSize.x / uSize.y;
    vec2 d = vec2((uv.x - 0.5) * aspect, uv.y - 0.5);
    float dist = length(d);
    float t = uTime * uSpeed;
    float tunnelDepth = uRadius / max(dist, 0.001);
    float twistAngle = atan(d.y, d.x) + uTwist * tunnelDepth * 0.3 + t * 0.5;
    float zoomFactor = fract(tunnelDepth * uDepth * 0.1 - t * 0.3);
    float scale = mix(0.2, 2.0, zoomFactor);
    vec2 tunnelUV = fract(0.5 + vec2(cos(twistAngle), sin(twistAngle)) * scale * 0.3);
    vec4 c = layerSample(clamp(tunnelUV * uSize, vec2(0.0), uSize));
    float fog = smoothstep(0.0, uRadius * 2.0, dist);
    float ring = exp(-pow((zoomFactor - 0.5) * 8.0, 2.0)) * 0.2;
    float vignette = 1.0 - smoothstep(0.3, 0.7, dist);
    float chromaAmt = (1.0 - fog) * 3.0;
    vec2 chromaDir = dist > 0.001 ? normalize(d) * chromaAmt : vec2(0.0);
    chromaDir.x /= aspect;                                  // undone on x, as blackHole does
    vec4 rS = layerSample(clamp((tunnelUV + chromaDir * 0.003) * uSize, vec2(0.0), uSize));
    vec4 bS = layerSample(clamp((tunnelUV - chromaDir * 0.003) * uSize, vec2(0.0), uSize));
    float chromaBlend = (1.0 - fog) * 0.4;
    float k = (uPremultiplied > 0.5 || c.a == 0.0) ? 1.0 : c.a;
    float fogMul = toHalf(0.3 + fog * 0.7);
    vec3 rgb = c.rgb * fogMul + vec3(toHalf(ring * 0.5), toHalf(ring * 0.6), toHalf(ring * 1.0)) * k
                              + vec3(toHalf(vignette * 0.05)) * k;
    // the chromatic taps are sampled after the fog multiply and are NOT fogged themselves
    rgb.r = mix(rgb.r, rS.r, toHalf(chromaBlend));
    rgb.b = mix(rgb.b, bS.b, toHalf(chromaBlend));
    fragColor = vec4(rgb, c.a);
}`;

const INKBLEED_FRAG = PREAMBLE + HELPERS + `
uniform float uTime, uWarpStrength, uScale, uSpeed, uDetail, uPointScale;
void main() {
    vec2 p = swPos();
    vec2 st = (p / uSize) * uScale;
    int oct = int(uDetail);
    vec2 q = vec2(bcs_fbm(st + vec2(uTime * uSpeed * 0.1, 0.0), oct),
                  bcs_fbm(st + vec2(5.2, 1.3 + uTime * uSpeed * 0.08), oct));
    // the last term is a SCALAR added to a vec2 -- it broadcasts, in Metal and in GLSL alike
    vec2 r = vec2(bcs_fbm(st + 4.0 * q + vec2(1.7, 9.2) + uTime * uSpeed * 0.05, oct),
                  bcs_fbm(st + 4.0 * q + vec2(8.3, 2.8) + uTime * uSpeed * 0.04, oct));
    fragColor = layerSample(clamp(p + (q + r) * uWarpStrength * uPointScale, vec2(0.0), uSize));
}`;

// *** TRAP 6, LOAD-BEARING FOR THE FIRST TIME. *** Four of the five taps upstream are layer.sample(position +
// offset) with NO clamp, because Metal's layer sampling has defined edges. GL wraps unless told, so a literal
// port would pull colour from the far side of the image along every border. layerSample clamps; that is what
// makes this agree with Metal rather than with a literal reading of the Metal.
const FROSTED_FRAG = PREAMBLE + HELPERS + `
uniform float uFrostAmount, uGrainSize, uClearRadius, uClearSoftness, uPointScale, uPremultiplied;
void main() {
    vec2 p = swPos();
    vec2 uv = p / uSize;
    float dist = distance(uv, vec2(0.5));
    float mask = smoothstep(uClearRadius, uClearRadius + uClearSoftness, dist) * uFrostAmount;
    vec2 nuv = floor(uv * uGrainSize);
    float nx = bcs_hash(nuv) * 2.0 - 1.0;
    float ny = bcs_hash(nuv + vec2(7.3, 3.1)) * 2.0 - 1.0;
    float sc = mask * 8.0 * uPointScale;
    vec4 sum = layerSample(p)
             + layerSample(clamp(p + vec2(nx, ny) * sc, vec2(0.0), uSize))
             + layerSample(clamp(p + vec2(-ny, nx) * sc, vec2(0.0), uSize))
             + layerSample(clamp(p + vec2(-nx, -ny) * sc * 0.7, vec2(0.0), uSize))
             + layerSample(clamp(p + vec2(ny, -nx) * sc * 0.7, vec2(0.0), uSize));
    sum = vec4(toHalf(sum.r / 5.0), toHalf(sum.g / 5.0), toHalf(sum.b / 5.0), toHalf(sum.a / 5.0));
    vec4 orig = layerSample(p);
    float a = mix(orig.a, sum.a, toHalf(mask));
    float k = (uPremultiplied > 0.5 || a == 0.0) ? 1.0 : a;
    fragColor = vec4(mix(orig.rgb, sum.rgb, toHalf(mask)) + vec3(toHalf(mask * 0.05)) * k, a);
}`;

// *** THE FIRST SHADER IN THIS PORT THAT WRITES ALPHA, AND THE FIRST WITH A BRANCH THAT IGNORES THE SOURCE
// ENTIRELY. *** The grout returns an opaque constant; the tile scales alpha by the assemble progress. The
// premultiplied factor therefore has to come from the alpha being WRITTEN, not the one that was read.
const MOSAIC_FRAG = PREAMBLE + HELPERS + `
uniform float uTime, uPixelSize, uBevel, uAnimateAssemble, uGap, uPremultiplied;
void main() {
    vec2 uv = swPos() / uSize;
    vec2 grid = floor(uv * uSize / uPixelSize) * uPixelSize / uSize;
    vec2 cell = fract(uv * uSize / uPixelSize);
    if (uGap > 0.001) {
        vec2 e = step(vec2(uGap * 0.5), cell) * step(vec2(uGap * 0.5), 1.0 - cell);
        if (e.x * e.y < 0.5) { fragColor = vec4(toHalf(0.02), toHalf(0.02), toHalf(0.03), 1.0); return; }
    }
    vec2 tileCenter = grid + 0.5 * uPixelSize / uSize;
    float ap = clamp(uTime * 0.5 - bcs_hash(grid * 100.0) * uAnimateAssemble * 2.0, 0.0, 1.0);
    ap = ap * ap * (3.0 - 2.0 * ap);
    vec2 scattered = tileCenter + vec2(bcs_hash(grid * 200.0) - 0.5, bcs_hash(grid * 300.0) - 0.5) * 0.5 * (1.0 - ap);
    vec4 c = layerSample(clamp(scattered * uSize, vec2(0.0), uSize));
    vec2 bv = (cell - 0.5) * 2.0;
    float topLight = smoothstep(0.0, -0.8, bv.y) * uBevel;          // -0.8 is UP, because y grows down here
    float leftLight = smoothstep(0.0, -0.8, bv.x) * uBevel * 0.5;
    float bottomShadow = smoothstep(0.0, 0.8, bv.y) * uBevel;
    float edgeDist = min(min(cell.x, 1.0 - cell.x), min(cell.y, 1.0 - cell.y));
    float edgeHi = (1.0 - smoothstep(0.0, 0.08, edgeDist)) * uBevel * 0.3;
    float a = c.a * toHalf(ap * 0.5 + 0.5);
    float k = (uPremultiplied > 0.5 || a == 0.0) ? 1.0 : a;
    float add = toHalf(topLight * 0.15 + leftLight * 0.1) - toHalf(bottomShadow * 0.2) + toHalf(edgeHi);
    fragColor = vec4(c.rgb + vec3(add) * k, a);
}`;

const LIQUIDCHROME_FRAG = PREAMBLE + HELPERS + `
uniform float uTime, uDistortion, uChromeIntensity, uFlowSpeed, uReflectionScale, uPointScale, uPremultiplied;
void main() {
    vec2 p = swPos();
    vec2 st = (p / uSize) * uReflectionScale;
    vec2 t1 = vec2(uTime * uFlowSpeed * 0.2, uTime * uFlowSpeed * 0.15);
    vec2 t2 = vec2(uTime * uFlowSpeed * 0.18, uTime * uFlowSpeed * 0.22);
    float n1 = bcs_fbm(st + t1, 4);
    float n2 = bcs_fbm(st + vec2(5.0, 3.0) + t2, 4);
    float d = uDistortion * uPointScale;                 // POINTS upstream -- scaled, not assumed pixels
    vec4 c = layerSample(clamp(p + vec2(n1, n2) * d, vec2(0.0), uSize));
    float eps = 0.01;
    float h0 = bcs_fbm(st + t1, 3);
    float hx = bcs_fbm(st + vec2(eps, 0.0) + t1, 3);
    float hy = bcs_fbm(st + vec2(0.0, eps) + t1, 3);
    // normalize((gx,gy,1)).z is 1/sqrt(gx*gx+gy*gy+1) and is ALWAYS POSITIVE, so upstream's max(z,0.0) and
    // abs(dot(n,(0,0,1))) are both dead. Written as the value they reduce to -- see the model's note.
    float nz = normalize(vec3((h0 - hx) / eps, (h0 - hy) / eps, 1.0)).z;
    float specular = pow(nz, 4.0);
    float highlight = pow(1.0 - nz, 3.0) * uChromeIntensity;
    float lum = toHalf(dot(c.rgb, ${LUMA}));
    float kMix = toHalf(uChromeIntensity * 0.5);
    float gain = toHalf(0.8 + specular * 0.4);
    // Only the ADD is alpha-sensitive: the desaturating mix and the gain are linear and commute with
    // premultiplication. Scaling all three by k would be wrong in the other direction.
    float k = (uPremultiplied > 0.5 || c.a == 0.0) ? 1.0 : c.a;
    vec3 desat = vec3(toHalf(mix(c.r, lum, kMix)), toHalf(mix(c.g, lum, kMix)), toHalf(mix(c.b, lum, kMix)));
    vec3 m = vec3(toHalf(desat.r + highlight * k), toHalf(desat.g + highlight * k), toHalf(desat.b + highlight * k));
    fragColor = vec4(toHalf(m.r * gain), toHalf(m.g * gain), toHalf(m.b * gain), c.a);
}`;

const PIXELSTORM_FRAG = PREAMBLE + HELPERS + `
uniform float uTime, uPixelSize, uStormAmount, uSwirl, uPulse, uPointScale;
void main() {
    vec2 p = swPos();
    vec2 uv = p / uSize;
    // pixel_size is a BLOCK SIZE IN POINTS -> multiplied. The scanline below reads position.y, a FREQUENCY
    // per point -> divided. Trap 3 in both directions in one shader.
    float pxSize = uPixelSize * uPointScale * (1.0 + sin(uTime * uPulse) * 0.3 * uStormAmount);
    vec2 d = uv - vec2(0.5);
    float dist = length(d);
    float ang = atan(d.y, d.x);
    float sa = uSwirl * (1.0 - dist) * sin(uTime * 0.5);
    vec2 su = vec2(0.5) + dist * vec2(cos(ang + sa), sin(ang + sa));
    vec2 blk = floor(su * uSize / pxSize);          // invariant: uSize and pxSize scale together
    vec2 pu = blk * pxSize / uSize;
    float br = bcs_hash(blk);
    // NOT named 'active' -- that is a RESERVED WORD in GLSL ES and the shader failed to compile on it.
    float storming = step(1.0 - uStormAmount * 0.8, br);
    vec2 off = vec2(sin(uTime * 3.0 + br * 20.0), cos(uTime * 2.5 + br * 15.0)) * uStormAmount * pxSize * 0.5 * storming;
    vec4 c = layerSample(clamp(pu * uSize + off, vec2(0.0), uSize));
    float scan = sin((p.y / uPointScale) * 1.5707963267948966) * 0.5 + 0.5;
    float gain = toHalf(0.92 + scan * 0.08);
    fragColor = vec4(toHalf(c.r * gain), toHalf(c.g * gain), toHalf(c.b * gain), c.a);
}`;

const MAGFIELD_FRAG = PREAMBLE + HELPERS + `
uniform float uTime, uFieldStrength, uLineCount, uFieldTurbulence, uPolarity, uPointScale, uPremultiplied;
void main() {
    vec2 p = swPos();
    vec2 uv = p / uSize;
    vec2 t1 = uv - vec2(0.25, 0.5), t2 = uv - vec2(0.75, 0.5);
    float r1 = max(length(t1), 0.001), r2 = max(length(t2), 0.001);
    vec2 field = t1 / (r1 * r1) - t2 / (r2 * r2);
    // Upstream's own guard, kept: below 0.01 the quadrupole is skipped entirely, so the knob has a small
    // discontinuity AT its own guard. Replacing the branch with the mix alone would be a different shader.
    if (uPolarity > 0.01) {
        vec2 t3 = uv - vec2(0.5, 0.3), t4 = uv - vec2(0.5, 0.7);
        float r3 = max(length(t3), 0.001), r4 = max(length(t4), 0.001);
        vec2 q = t3 / (r3 * r3) - t4 / (r4 * r4);
        field = mix(field, field + q, uPolarity);
    }
    float mag = length(field);
    vec2 dir = mag > 0.001 ? field / mag : vec2(0.0);
    float stripes = sin(atan(field.y, field.x) * uLineCount + uTime * 2.0);
    stripes *= stripes;
    float turb = bcs_fbm(uv * 8.0 + uTime * 0.5, 4) * uFieldTurbulence;
    float fs = uFieldStrength * uPointScale;        // POINTS
    vec2 off = dir * fs * stripes * (0.5 + turb);
    off += vec2(-dir.y, dir.x) * sin(dot(uv, dir) * uLineCount * 10.0 + uTime) * fs * 0.15;
    vec4 c = layerSample(clamp(p + off, vec2(0.0), uSize));
    float sheen = stripes * mag * 0.3;
    float k = (uPremultiplied > 0.5 || c.a == 0.0) ? 1.0 : c.a;
    fragColor = vec4(toHalf(c.r + toHalf(sheen * 0.3) * k), toHalf(c.g + toHalf(sheen * 0.35) * k),
                     toHalf(c.b + toHalf(sheen * 0.4) * k), c.a);
}`;

const AURORA_FRAG = PREAMBLE + HELPERS + `
uniform float uTime, uIntensity, uBands, uSpeed, uColorShift, uPremultiplied;
void main() {
    vec2 p = swPos();
    vec2 uv = p / uSize;
    vec4 c = layerSample(p);                        // undisplaced -- no length in points anywhere here
    float t = uTime * uSpeed;
    float heightMask = smoothstep(0.8, 0.1, uv.y) * smoothstep(0.0, 0.15, uv.y);
    float auroraVal = 0.0, hueAccum = 0.0;
    // int(uBands) truncates the LOOP; fi / uBands does NOT truncate the SPACING. A fractional bands runs
    // four iterations spaced as if there were four and a half, and upstream means it.
    for (int i = 0; i < int(uBands); i++) {
        float fi = float(i);
        float freq = 2.0 + fi * 1.5;
        float wave = sin(uv.x * freq * 3.14159 + t * (0.8 + fi * 0.3) + fi * 1.7)
                   + sin(uv.x * freq * 1.7 + t * 0.5 + fi * 2.3) * 0.5;
        float bandDist = abs(uv.y - (0.3 + fi / uBands * 0.4 + wave * 0.08));
        float band = exp(-bandDist * bandDist * 200.0) * (0.6 + fi * 0.1);
        band *= bcs_fbm(vec2(uv.x * 3.0 + t * 0.3, fi * 5.0 + t * 0.1), 3);
        auroraVal += band; hueAccum += band * (fi / uBands);
    }
    auroraVal = clamp(auroraVal, 0.0, 1.0) * heightMask * uIntensity;
    float hue = toHalf(fract(uColorShift + hueAccum * 0.3 + 0.35));
    vec3 ac = bcs_hsb2rgb(vec3(hue, toHalf(0.7), toHalf(1.0)));
    float shimmer = toHalf(sin(uv.y * 80.0 + t * 5.0) * 0.02 * auroraVal);
    float amt = toHalf(auroraVal * 0.7);
    float k = (uPremultiplied > 0.5 || c.a == 0.0) ? 1.0 : c.a;
    fragColor = vec4(toHalf(c.r + (toHalf(ac.r * amt) + shimmer) * k),
                     toHalf(c.g + (toHalf(ac.g * amt) + shimmer) * k),
                     toHalf(c.b + (toHalf(ac.b * amt) + shimmer) * k), c.a);
}`;

const DATAMOSH_FRAG = PREAMBLE + HELPERS + `
uniform float uTime, uBlockCorruption, uSmearAmount, uColorBleed, uGlitchRate, uPointScale, uPremultiplied;
void main() {
    vec2 p = swPos();
    vec2 uv = p / uSize;
    float blockSize = 16.0 * uPointScale;            // 16 POINTS
    vec2 g = uSize / blockSize;                      // invariant: both scale together
    vec2 blockUV = floor(uv * g) / g;
    float blockHash = bcs_hash(blockUV * 73.0 + floor(uTime * uGlitchRate) * 0.1);
    vec4 orig = layerSample(p);
    if (step(1.0 - uBlockCorruption, blockHash) < 0.5) { fragColor = orig; return; }
    float ang = bcs_hash(blockUV * 137.0 + floor(uTime * uGlitchRate * 0.5) * 0.3) * 6.28;
    float blockSmear = uSmearAmount * uPointScale * (0.5 + blockHash * 0.5);
    vec2 so = vec2(cos(ang), sin(ang)) * blockSmear;
    vec4 sm = layerSample(clamp(p + so, vec2(0.0), uSize));
    vec4 rS = layerSample(clamp(p + so * (1.0 + uColorBleed * 0.3), vec2(0.0), uSize));
    vec4 bS = layerSample(clamp(p + so * (1.0 - uColorBleed * 0.2), vec2(0.0), uSize));
    float cb = toHalf(uColorBleed);
    vec3 rgb = vec3(mix(sm.r, rS.r, cb), sm.g, mix(sm.b, bS.b, cb));
    vec2 cell = fract(uv * g);
    float blockEdge = 1.0 - step(0.03, min(cell.x, cell.y));
    float k = (uPremultiplied > 0.5 || sm.a == 0.0) ? 1.0 : sm.a;
    // The quantise is NOT k-corrected: floor() does not commute with premultiplication and no scalar can
    // reconcile the two spaces. Exact upstream in premultiplied, approximate in straight -- see the model.
    vec3 q = floor(vec3(toHalf(rgb.r), toHalf(rgb.g), toHalf(rgb.b)) * 16.0) / 16.0;
    float e = toHalf(blockEdge * 0.1) * k;
    fragColor = vec4(toHalf(q.r + e), toHalf(q.g + e), toHalf(q.b + e), sm.a);
}`;

const SMOKEREVEAL_FRAG = PREAMBLE + HELPERS + `
uniform float uTime, uSmokeAmount, uSmokeScale, uWindSpeed, uSmokeTurb, uPointScale, uPremultiplied;
void main() {
    vec2 p = swPos();
    vec2 uv = p / uSize;
    vec2 su = uv * uSmokeScale;
    float w1x = bcs_fbm(su + vec2(uTime * uWindSpeed * 0.3, uTime * uWindSpeed * 0.1), 5);
    float w1y = bcs_fbm(su + vec2(uTime * uWindSpeed * 0.1, -uTime * uWindSpeed * 0.2) + 5.2, 5);
    vec2 warped = su + vec2(w1x, w1y) * uSmokeTurb;
    float dens = bcs_fbm(warped + vec2(uTime * uWindSpeed * 0.15, uTime * uWindSpeed * 0.08), 6);
    dens = clamp(dens * dens * uSmokeAmount * 1.5, 0.0, 1.0);
    float lv = bcs_valueNoise(uv * 3.0 + uTime * 0.2);
    float edgeGlow = smoothstep(0.2, 0.5, dens) - smoothstep(0.5, 0.8, dens);
    vec3 sc = vec3(toHalf(0.7 + toHalf(lv) * 0.15), toHalf(0.68 + toHalf(lv) * 0.12), toHalf(0.66 + toHalf(lv) * 0.1));
    sc = vec3(toHalf(sc.r + toHalf(edgeGlow * 0.2)), toHalf(sc.g + toHalf(edgeGlow * 0.2)), toHalf(sc.b + toHalf(edgeGlow * 0.2)));
    float dsp = 8.0 * uPointScale * dens;            // the 8.0 is POINTS
    vec4 dc = layerSample(clamp(p + vec2(w1x - 0.5, w1y - 0.5) * dsp, vec2(0.0), uSize));
    vec4 orig = layerSample(p);                      // ALPHA comes from here, colour from dc -- upstream's choice
    float ray = sin(uv.x * 8.0 + uTime * 0.3) * 0.5 + 0.5;
    ray *= smoothstep(1.0, 0.3, uv.y) * dens * 0.15;
    float k = (uPremultiplied > 0.5 || orig.a == 0.0) ? 1.0 : orig.a;
    float t = toHalf(dens);
    fragColor = vec4(toHalf(mix(dc.r, sc.r * k, t) + toHalf(ray * 0.8) * k),
                     toHalf(mix(dc.g, sc.g * k, t) + toHalf(ray * 0.7) * k),
                     toHalf(mix(dc.b, sc.b * k, t) + toHalf(ray * 0.5) * k), orig.a);
}`;

const MORPHBREATHE_FRAG = PREAMBLE + HELPERS + `
uniform float uTime, uBreatheDepth, uBreatheRate, uWarpComplexity, uOrganic, uPointScale;
void main() {
    vec2 p = swPos();
    vec2 uv = p / uSize;
    float b1 = sin(uTime * uBreatheRate) * 0.5 + 0.5;
    float b2 = sin(uTime * uBreatheRate * 0.7 + 1.5) * 0.5 + 0.5;
    float b3 = sin(uTime * uBreatheRate * 1.3 + 3.0) * 0.5 + 0.5;
    float t = uTime * uBreatheRate * 0.3;
    vec2 st = uv * uWarpComplexity;
    vec2 q = vec2(bcs_fbm(st + vec2(t * 0.5, t * 0.3), 4),
                  bcs_fbm(st + vec2(5.2, 1.3) + vec2(t * 0.4, t * 0.6), 4));
    vec2 fc = uv - vec2(0.5);
    float radialPulse = b1 * (1.0 - uOrganic) + b2 * uOrganic;
    vec2 rd = fc * (radialPulse - 0.5) * 2.0;
    vec2 od = vec2((q.x - 0.5) * 2.0 * b2, (q.y - 0.5) * 2.0 * b3);
    float edgeFade = smoothstep(0.0, 0.15, min(min(uv.x, 1.0 - uv.x), min(uv.y, 1.0 - uv.y)));
    vec2 disp = mix(rd, od, uOrganic) * uBreatheDepth * uPointScale * edgeFade;   // POINTS
    vec4 c = layerSample(clamp(p + disp, vec2(0.0), uSize));
    float rG = toHalf(1.0 + b1 * 0.05), bG = toHalf(1.0 - b1 * 0.05), gG = toHalf(1.0 + (b1 - 0.5) * 0.08);
    fragColor = vec4(toHalf(toHalf(c.r * rG) * gG), toHalf(c.g * gG), toHalf(toHalf(c.b * bG) * gG), c.a);
}`;

// ==================================================================================================================
// *** OURS, NOT UPSTREAM'S. *** Everything above is a port of krispuckett/SwiftUIShaders (MIT), named bcs_*.
// This one is SweK's own, named swk_*, and it is the first shader here with an EXTERNAL KEY -- see the model.
// ==================================================================================================================
const LYAPUNOV_FRAG = PREAMBLE + `
uniform float uRLo, uRHi, uSamples, uWarmup, uIntensity, uSeedLo, uSeedHi, uRaw, uPremultiplied;
void main() {
    vec2 p = swPos();
    vec2 uv = p / uSize;
    float r = uRLo + (uRHi - uRLo) * uv.x;
    float x = uSeedLo + (uSeedHi - uSeedLo) * uv.y;
    for (int i = 0; i < int(uWarmup); i++) x = r * x * (1.0 - x);
    float acc = 0.0;
    int n = int(uSamples);
    for (int i = 0; i < n; i++) {
        acc += log(abs(r * (1.0 - 2.0 * x)));
        x = r * x * (1.0 - x);
    }
    float lam = acc / float(n);
    if (uRaw > 0.5) {
        // 16 bits across two channels. ONE 8-bit channel resolves lambda to 4/255 = 1.6e-2, which is coarser
        // than the 8.3e-3 the iteration budget earns -- reading the key at 8 bits would measure the
        // framebuffer instead of the shader.
        float e = clamp((lam + 3.0) / 4.0, 0.0, 1.0);
        fragColor = vec4(floor(e * 255.0) / 255.0, fract(e * 255.0), 0.0, 1.0);
        return;
    }
    vec4 c = layerSample(p);
    float chaos = clamp(lam / 0.6931471805599453, -1.0, 1.0);   // exactly 1 at the r = 4 key
    float glow = max(chaos, 0.0) * uIntensity;
    float k = (uPremultiplied > 0.5 || c.a == 0.0) ? 1.0 : c.a;
    vec3 hot = vec3(0.35, 0.95, 0.85);
    fragColor = vec4(toHalf(c.r * (1.0 - 0.35 * glow) + hot.r * glow * k),
                     toHalf(c.g * (1.0 - 0.35 * glow) + hot.g * glow * k),
                     toHalf(c.b * (1.0 - 0.35 * glow) + hot.b * glow * k), c.a);
}`;

const SHADERS = { emboss: EMBOSS_FRAG, heatShimmer: SHIMMER_FRAG, solarize: SOLARIZE_FRAG, duochrome: DUOCHROME_FRAG, vortex: VORTEX_FRAG, kaleidoscope: KALEIDO_FRAG, chromaticSplit: CHROMA_FRAG, plasma: PLASMA_FRAG, echo: ECHO_FRAG, glitch: GLITCH_FRAG, melt: MELT_FRAG, topographic: TOPO_FRAG, thermal: THERMAL_FRAG, neonEdge: NEON_FRAG, touchRipple: TOUCHRIPPLE_FRAG, liveRipple: LIVERIPPLE_FRAG, shockwave: SHOCKWAVE_FRAG, gravityWells: GRAVITYWELLS_FRAG, refractLens: REFRACTLENS_FRAG,
    wavePool: WAVEPOOL_FRAG, pulse: PULSE_FRAG, holographic: HOLOGRAPHIC_FRAG,
    geometricWarp: GEOWARP_FRAG, blackHole: BLACKHOLE_FRAG,
    wormhole: WORMHOLE_FRAG, inkBleed: INKBLEED_FRAG, frosted: FROSTED_FRAG, pixelateMosaic: MOSAIC_FRAG,
    liquidChrome: LIQUIDCHROME_FRAG, pixelateStorm: PIXELSTORM_FRAG, magneticField: MAGFIELD_FRAG,
    aurora: AURORA_FRAG, datamosh: DATAMOSH_FRAG, smokeReveal: SMOKEREVEAL_FRAG,
    morphBreathe: MORPHBREATHE_FRAG, lyapunov: LYAPUNOV_FRAG };

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
    melt: { time: "uTime", meltAmount: "uMeltAmount", dripScale: "uDripScale", speed: "uSpeed", heat: "uHeat", pointScale: "uPointScale" },
    topographic: { time: "uTime", lineCount: "uLineCount", lineWidth: "uLineWidth", colorize: "uColorize", animate: "uAnimate" },
    thermal: { time: "uTime", intensity: "uIntensity", shimmer: "uShimmer", noiseSpeed: "uNoiseSpeed", paletteShift: "uPaletteShift", pointScale: "uPointScale" },
    neonEdge: { time: "uTime", edgeStrength: "uEdgeStrength", glowAmount: "uGlowAmount", colorCycle: "uColorCycle", mixOriginal: "uMixOriginal", pointScale: "uPointScale" },
    touchRipple: { touchX: "uTouchX", touchY: "uTouchY", touchAge: "uTouchAge", amplitude: "uAmplitude", frequency: "uFrequency", speed: "uSpeed", decay: "uDecay", pointScale: "uPointScale" },
    liveRipple: { time: "uTime", amplitude: "uAmplitude", frequency: "uFrequency", speed: "uSpeed", damping: "uDamping", ringCount: "uRingCount", pointScale: "uPointScale" },
    shockwave: { time: "uTime", waveSpeed: "uWaveSpeed", ringWidth: "uRingWidth", strength: "uStrength", repeatRate: "uRepeatRate", pointScale: "uPointScale" },
    gravityWells: { time: "uTime", wellStrength: "uWellStrength", wellCount: "uWellCount", orbitSpeed: "uOrbitSpeed", warpFalloff: "uWarpFalloff", pointScale: "uPointScale" },
    refractLens: { touchX: "uTouchX", touchY: "uTouchY", lensRadius: "uLensRadius", refraction: "uRefraction", aberration: "uAberration", wobble: "uWobble", pointScale: "uPointScale" },
    wavePool: { time: "uTime", amplitude: "uAmplitude", wavelength: "uWavelength", speed: "uSpeed", complexity: "uComplexity", pointScale: "uPointScale" },
    liquidChrome: { time: "uTime", distortion: "uDistortion", chromeIntensity: "uChromeIntensity", flowSpeed: "uFlowSpeed", reflectionScale: "uReflectionScale", pointScale: "uPointScale", premultiplied: "uPremultiplied" },
    pixelateStorm: { time: "uTime", pixelSize: "uPixelSize", stormAmount: "uStormAmount", swirl: "uSwirl", pulse: "uPulse", pointScale: "uPointScale" },
    magneticField: { time: "uTime", fieldStrength: "uFieldStrength", lineCount: "uLineCount", fieldTurbulence: "uFieldTurbulence", polarity: "uPolarity", pointScale: "uPointScale", premultiplied: "uPremultiplied" },
    aurora: { time: "uTime", intensity: "uIntensity", bands: "uBands", speed: "uSpeed", colorShift: "uColorShift", premultiplied: "uPremultiplied" },
    datamosh: { time: "uTime", blockCorruption: "uBlockCorruption", smearAmount: "uSmearAmount", colorBleed: "uColorBleed", glitchRate: "uGlitchRate", pointScale: "uPointScale", premultiplied: "uPremultiplied" },
    smokeReveal: { time: "uTime", smokeAmount: "uSmokeAmount", smokeScale: "uSmokeScale", windSpeed: "uWindSpeed", smokeTurb: "uSmokeTurb", pointScale: "uPointScale", premultiplied: "uPremultiplied" },
    morphBreathe: { time: "uTime", breatheDepth: "uBreatheDepth", breatheRate: "uBreatheRate", warpComplexity: "uWarpComplexity", organic: "uOrganic", pointScale: "uPointScale" },
    lyapunov: { rLo: "uRLo", rHi: "uRHi", samples: "uSamples", warmup: "uWarmup", intensity: "uIntensity", seedLo: "uSeedLo", seedHi: "uSeedHi", raw: "uRaw", premultiplied: "uPremultiplied" },
    pulse: { time: "uTime", amplitude: "uAmplitude", bpm: "uBpm", sharpness: "uSharpness", glowIntensity: "uGlowIntensity", pointScale: "uPointScale", premultiplied: "uPremultiplied" },
    holographic: { time: "uTime", intensity: "uIntensity", scale: "uScale", speed: "uSpeed", angleOffset: "uAngleOffset", premultiplied: "uPremultiplied" },
    geometricWarp: { time: "uTime", spiralTight: "uSpiralTight", zoomRepeat: "uZoomRepeat", rotation: "uRotation", blend: "uBlend", premultiplied: "uPremultiplied" },
    blackHole: { time: "uTime", mass: "uMass", spin: "uSpin", distortion: "uDistortion", ringBrightness: "uRingBrightness", premultiplied: "uPremultiplied" },
    wormhole: { time: "uTime", depth: "uDepth", speed: "uSpeed", twist: "uTwist", radius: "uRadius", premultiplied: "uPremultiplied" },
    inkBleed: { time: "uTime", warpStrength: "uWarpStrength", scale: "uScale", speed: "uSpeed", detail: "uDetail", pointScale: "uPointScale" },
    frosted: { frostAmount: "uFrostAmount", grainSize: "uGrainSize", clearRadius: "uClearRadius", clearSoftness: "uClearSoftness", pointScale: "uPointScale", premultiplied: "uPremultiplied" },
    pixelateMosaic: { time: "uTime", pixelSize: "uPixelSize", bevel: "uBevel", animateAssemble: "uAnimateAssemble", gap: "uGap", premultiplied: "uPremultiplied" },
};

/**
 * Default knob values, PER SHADER, taken from render/swiftShaderModel.mjs's own parameter defaults -- the CPU
 * reference each GLSL pass is graded against, so the two agree by construction rather than by my memory.
 *
 * *** IT IS KEYED BY SHADER BECAUSE A FLAT MAP IS WRONG BY CONSTRUCTION, AND THE FIRST DRAFT HERE WAS FLAT. ***
 * The same knob NAME carries different defaults in different shaders: `speed` is 2 in heatShimmer and 1 in
 * vortex and melt; `spread` is 12 in echo and 8 in chromaticSplit; `intensity` is 0.5 in glitch and 1 in
 * duochrome, plasma and thermal. One table for all fourteen cannot hold those at once, and the gate caught the
 * flat version -- both for the eighteen knobs it had no entry for at all, and it would have shipped seven more
 * with plausible WRONG values (duochrome's two hues swapped, solarize's clampOutput inverted, emboss's
 * premultiplied inverted). A GUESS THAT LOOKS LIKE A MEASUREMENT IS THE THING THIS TREE KEEPS FINDING.
 *
 * Booleans in the model are 0/1 here, because every GLSL uniform in these shaders is a float.
 * `pointScale` is 1 throughout and IS THE ONE A RETINA CALLER MUST SET: a point is not a pixel, and a default
 * cannot know the device ratio.
 */
const DEFAULT_KNOBS = {
    emboss:         { strength: 1, angle: 0, mixAmount: 1, pointScale: 1, premultiplied: 1 },
    heatShimmer:    { time: 0, amplitude: 4, frequency: 20, speed: 2, verticalBias: 0, pointScale: 1 },
    solarize:       { time: 0, threshold: 0.5, curveIntensity: 1, colorSeparation: 0, animate: 0, clampOutput: 0 },
    duochrome:      { time: 0, intensity: 1, hue1: 0.6, hue2: 0.1, contrast: 1 },
    vortex:         { time: 0, twistAmount: 3, radius: 0.5, speed: 1, falloff: 2 },
    kaleidoscope:   { time: 0, segments: 6, rotation: 0, zoom: 1, animateSpeed: 0 },
    chromaticSplit: { spread: 8, angle: 0, edgeOnly: 0, time: 0, animate: 0, pointScale: 1 },
    plasma:         { time: 0, intensity: 1, scale: 4, speed: 1, colorMode: 0, clampOutput: 0 },
    echo:           { time: 0, echoCount: 4, spread: 12, direction: 0, fade: 0.6, pointScale: 1 },
    glitch:         { time: 0, intensity: 0.5, blockSize: 12, scanLines: 0.5, colorShift: 6, pointScale: 1 },
    melt:           { time: 0, meltAmount: 30, dripScale: 6, speed: 1, heat: 0.5, pointScale: 1 },
    topographic:    { time: 0, lineCount: 12, lineWidth: 0.05, colorize: 1, animate: 0 },
    thermal:        { time: 0, intensity: 1, shimmer: 4, noiseSpeed: 1, paletteShift: 0, pointScale: 1 },
    neonEdge:       { time: 0, edgeStrength: 4, glowAmount: 1, colorCycle: 1, mixOriginal: 0.3, pointScale: 1 },
    touchRipple:    { touchX: 0, touchY: 0, touchAge: 0, amplitude: 10, frequency: 20, speed: 200, decay: 2, pointScale: 1 },
    liveRipple:     { time: 0, amplitude: 10, frequency: 20, speed: 3, damping: 2, ringCount: 3, pointScale: 1 },
    shockwave:      { time: 0, waveSpeed: 200, ringWidth: 30, strength: 40, repeatRate: 2, pointScale: 1 },
    gravityWells:   { time: 0, wellStrength: 80, wellCount: 3, orbitSpeed: 1, warpFalloff: 2, pointScale: 1 },
    refractLens:    { touchX: 0, touchY: 0, lensRadius: 0.25, refraction: 1.5, aberration: 6, wobble: 0, pointScale: 1 },
    // Batch 10 -- copied from each function's own parameter defaults in swiftShaderModel.mjs, which is the
    // reference the GPU is graded against, so the two agree by construction rather than by my memory.
    wavePool:       { time: 0, amplitude: 10, wavelength: 20, speed: 2, complexity: 3, pointScale: 1 },
    // Batch 12 -- copied from bcsLiquidChrome's own parameter defaults in swiftShaderModel.mjs.
    liquidChrome:   { time: 0, distortion: 12, chromeIntensity: 0.6, flowSpeed: 1, reflectionScale: 4, pointScale: 1, premultiplied: 1 },
    // Batch 13 -- copied from each function's own defaults in swiftShaderModel.mjs.
    pixelateStorm:  { time: 0, pixelSize: 12, stormAmount: 0.5, swirl: 1, pulse: 1, pointScale: 1 },
    magneticField:  { time: 0, fieldStrength: 30, lineCount: 8, fieldTurbulence: 0.4, polarity: 0, pointScale: 1, premultiplied: 1 },
    aurora:         { time: 0, intensity: 0.7, bands: 4, speed: 1, colorShift: 0, premultiplied: 1 },
    // Batch 14 -- copied from each function's own defaults in swiftShaderModel.mjs.
    datamosh:       { time: 0, blockCorruption: 0.3, smearAmount: 24, colorBleed: 0.5, glitchRate: 2, pointScale: 1, premultiplied: 1 },
    smokeReveal:    { time: 0, smokeAmount: 0.6, smokeScale: 4, windSpeed: 1, smokeTurb: 1, pointScale: 1, premultiplied: 1 },
    morphBreathe:   { time: 0, breatheDepth: 20, breatheRate: 1, warpComplexity: 4, organic: 0.5, pointScale: 1 },
    // OURS -- swk_lyapunov. The budget is the measured knee; see swiftShaderModel.mjs for why 128 is worse.
    lyapunov:       { rLo: 3.4, rHi: 4.0, samples: 384, warmup: 64, intensity: 0.8, seedLo: 0.05, seedHi: 0.95, raw: 0, premultiplied: 1 },
    pulse:          { time: 0, amplitude: 15, bpm: 70, sharpness: 4, glowIntensity: 0.5, pointScale: 1, premultiplied: 1 },
    holographic:    { time: 0, intensity: 0.6, scale: 8, speed: 1, angleOffset: 0.785, premultiplied: 1 },
    geometricWarp:  { time: 0, spiralTight: 3, zoomRepeat: 1, rotation: 0, blend: 0.5, premultiplied: 1 },
    blackHole:      { time: 0, mass: 0.2, spin: 1, distortion: 60, ringBrightness: 1, premultiplied: 1 },
    // Batch 11 -- again copied from each function's own defaults in swiftShaderModel.mjs.
    wormhole:       { time: 0, depth: 4, speed: 1, twist: 2, radius: 0.25, premultiplied: 1 },
    inkBleed:       { time: 0, warpStrength: 20, scale: 4, speed: 0.5, detail: 4, pointScale: 1 },
    frosted:        { frostAmount: 0.7, grainSize: 8, clearRadius: 0.2, clearSoftness: 0.3, pointScale: 1, premultiplied: 1 },
    pixelateMosaic: { time: 0, pixelSize: 8, bevel: 0.5, animateAssemble: 0, gap: 0.08, premultiplied: 1 },
};

/* eslint-disable no-undef */
/** Compile one shader stage, throwing with the log rather than returning a silently-null shader. */
function compile(gl, type, src) {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
        const log = gl.getShaderInfoLog(sh);
        gl.deleteShader(sh);
        throw new Error("swiftShaderPass compile: " + log);
    }
    return sh;
}

/**
 * *** v4169 -- THE RUNTIME THIS FILE'S OWN HEADER ALREADY CLAIMED IT HAD. ***
 *
 * The header says "Shaped like crtPass.js". It was not: crtPass exports `makeCrtPass()`, which builds a real
 * GL pass, and this file exported nothing but GLSL STRINGS through `module.exports`. So the fourteen ports
 * had no way to run, and -- worse -- `module.exports` at top level is a ReferenceError in a browser ES
 * module, SO THE FILE COULD NOT BE LOADED BY A PAGE AT ALL. It ran in exactly one place: the gate, through
 * Node's createRequire, which is the single environment where CommonJS works. A SHADER CHECKED ONLY WHERE IT
 * CANNOT SHIP IS CHECKED IN THE WRONG PLACE, and referenceKind is what noticed, by counting the file as an
 * orphan held out of the census by a sentence in main.js's changelog.
 *
 * This is crtPass's factory, deliberately line-for-line in its shape: its own canvas and WebGL2 context, one
 * full-screen triangle, NEAREST + CLAMP_TO_EDGE so the GPU result can be compared exactly against the CPU
 * model, UNPACK_FLIP_Y_WEBGL false so texel row 0 is the source's first row, and readPixels flipped once on
 * the way out so callers get image order.
 *
 * @param {string} name one of SHADERS' keys
 * @param {number} width @param {number} height
 * @param {{ canvas?: HTMLCanvasElement }} [opts]
 */
function makeSwiftShaderPass(name, width, height, opts = {}) {
    const frag = SHADERS[name];
    if (!frag) throw new Error("swiftShaderPass: no shader named " + name + " (have: " + Object.keys(SHADERS).join(", ") + ")");
    const canvas = opts.canvas || (typeof document !== "undefined" ? document.createElement("canvas") : null);
    if (!canvas) return null;
    canvas.width = width; canvas.height = height;
    const gl = canvas.getContext("webgl2", { alpha: true, antialias: false, preserveDrawingBuffer: true });
    if (!gl) return null;

    const prog = gl.createProgram();
    gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, frag));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error("swiftShaderPass link: " + gl.getProgramInfoLog(prog));

    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const aPos = gl.getAttribLocation(prog, "aPos");
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    // NEAREST and CLAMP_TO_EDGE, matching layerSample() in the PREAMBLE. Both are load-bearing: nearest so
    // the CPU model can be compared exactly, clamped because Metal's layer sampling has defined edges and GL
    // wraps unless told otherwise -- the sixth of the six traps, and the one bcs_glitch walks into.
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    const knobMap = KNOBS[name] || {};
    const defaults = DEFAULT_KNOBS[name] || {};
    const U = { uTex: gl.getUniformLocation(prog, "uTex"), uSize: gl.getUniformLocation(prog, "uSize") };
    for (const uni of Object.values(knobMap)) U[uni] = gl.getUniformLocation(prog, uni);

    const GL = gl, CV = canvas;

    /** @param {TexImageSource | Uint8Array | Uint8ClampedArray} source @param {Record<string, number>} [knobs] */
    function render(source, knobs = {}) {
        GL.bindTexture(GL.TEXTURE_2D, tex);
        GL.pixelStorei(GL.UNPACK_FLIP_Y_WEBGL, false);
        if (source instanceof Uint8Array || source instanceof Uint8ClampedArray) {
            GL.texImage2D(GL.TEXTURE_2D, 0, GL.RGBA, CV.width, CV.height, 0, GL.RGBA,
                          GL.UNSIGNED_BYTE, source instanceof Uint8Array ? source : new Uint8Array(source));
        } else {
            GL.texImage2D(GL.TEXTURE_2D, 0, GL.RGBA, GL.RGBA, GL.UNSIGNED_BYTE, source);
        }
        GL.viewport(0, 0, CV.width, CV.height);
        GL.useProgram(prog);
        GL.bindVertexArray(vao);
        GL.uniform1i(U.uTex, 0);
        GL.uniform2f(U.uSize, CV.width, CV.height);
        // EVERY knob the shader declares is written on every draw, from DEFAULT_KNOBS where the caller gave
        // none. An unwritten uniform is 0 in GL, and 0 is a meaningful value for most of these -- a caller
        // who set only `time` would silently get pointScale 0 and a shader that samples one texel forever.
        for (const [knob, uni] of Object.entries(knobMap)) {
            const v = (typeof knobs[knob] === "number" && Number.isFinite(knobs[knob]))
                ? knobs[knob] : defaults[knob];
            GL.uniform1f(U[uni], typeof v === "number" ? v : 0);
        }
        GL.drawArrays(GL.TRIANGLES, 0, 3);
        return CV;
    }

    /** Read back in IMAGE ORDER (top row first) -- readPixels is bottom-up, so it is flipped here once. */
    function readPixels() {
        const w = CV.width, h = CV.height;
        const raw = new Uint8Array(w * h * 4);
        GL.readPixels(0, 0, w, h, GL.RGBA, GL.UNSIGNED_BYTE, raw);
        const out = new Uint8ClampedArray(w * h * 4);
        for (let y = 0; y < h; y++) out.set(raw.subarray((h - 1 - y) * w * 4, (h - y) * w * 4), y * w * 4);
        return out;
    }

    return {
        name, canvas, gl,
        knobs: Object.keys(knobMap),
        render, readPixels,
        resize(w, h) { CV.width = w; CV.height = h; },
        dispose() { try { GL.getExtension("WEBGL_lose_context")?.loseContext(); } catch (e) {} },
    };
}

/** The shaders this file can build, for a caller that wants to offer a list without importing SHADERS. */
function swiftShaderNames() { return Object.keys(SHADERS); }
// *** OURS, AND KEPT OUT OF EVERY COUNT ABOUT UPSTREAM COVERAGE. *** swk_lyapunov renders through the same
// pass and is graded by the same gate, but it is NOT one of krispuckett/SwiftUIShaders' 41 -- so "35 of 41
// ported" must not quietly become 36 because we added a shader of our own. A coverage number that counts
// our own work as upstream's is the same defect as a baseline that absorbs its own drift.
const SWK_OWN = ["lyapunov"];
/** The upstream ports only -- what "N of 41" is allowed to count. */
function portedShaderNames() { return Object.keys(SHADERS).filter((n) => !SWK_OWN.includes(n)); }

export {
    makeSwiftShaderPass, swiftShaderNames, portedShaderNames, SWK_OWN, DEFAULT_KNOBS,
    VERT, SHADERS, KNOBS, PREAMBLE, HELPERS, LUMA,
    EMBOSS_FRAG, SHIMMER_FRAG, SOLARIZE_FRAG, DUOCHROME_FRAG, VORTEX_FRAG, KALEIDO_FRAG, CHROMA_FRAG,
    PLASMA_FRAG, ECHO_FRAG, GLITCH_FRAG, MELT_FRAG, TOPO_FRAG, THERMAL_FRAG, NEON_FRAG,
    TOUCHRIPPLE_FRAG, LIVERIPPLE_FRAG, SHOCKWAVE_FRAG, GRAVITYWELLS_FRAG, REFRACTLENS_FRAG,
    WAVEPOOL_FRAG, PULSE_FRAG, HOLOGRAPHIC_FRAG, GEOWARP_FRAG, BLACKHOLE_FRAG, LIQUIDCHROME_FRAG,
    PIXELSTORM_FRAG, MAGFIELD_FRAG, AURORA_FRAG, DATAMOSH_FRAG, SMOKEREVEAL_FRAG, MORPHBREATHE_FRAG,
    LYAPUNOV_FRAG,
    WORMHOLE_FRAG, INKBLEED_FRAG, FROSTED_FRAG, MOSAIC_FRAG,
};
