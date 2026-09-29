// WebGLEngine/ui/precisionProbe.mjs -- v4612 (task #35, backlog id "device-precision-probe")
//
// This tree maintains a family of "measure the real device capability rather than assume it" probes
// (render/threeProbe.mjs, ui/webgpuProbe.mjs, ui/codecProbe.mjs) but had none for shader float/int/uint
// PRECISION specifically. Not hypothetical: this session closed two separate precision-divergence bugs
// (bcs_hash's sin/fract hash diverging up to 0.68 between f32/f64, tools/ship/noisePrecision-selfcheck.mjs's
// Ashima-noise decimal-truncation mismatch) without a standing instrument for the underlying question --
// "what does THIS device's shader precision actually do" -- each diagnosed after the fact from its own
// symptom. This module is that instrument: it does not predict either past bug (both were algorithmic
// choices, not precision-availability questions), it is what future noise/hash/precision work should consult
// before guessing.
//
// ---- THE ALGORITHM -- gkjohnson/webgl-precision (MIT, Garrett Johnson, pinned f75d0aec16332ce6d371e75077655-
// f08daa7b362), src/ComputePrecisionShader.js, hand-adapted (not vendored -- one small GLSL function, the
// same shape as this tree's other hand-transcribed shader algorithms, e.g. skeeto/hash-prospector's hash).
// MEASURES EMPIRICALLY RATHER THAN READING A SPEC: for float, starts at 1.5 and repeatedly adds a shrinking
// power-of-two epsilon to 1.0 until the device's own arithmetic can no longer represent the difference,
// counting how many halvings that took (a direct measurement of mantissa precision, not an assumption from
// "highp should mean IEEE754 single"). For int/uint, left-shifts a starting value of 1 until it overflows
// (goes negative for signed, wraps to zero for unsigned), counting the shifts. Documented by its author
// against ARM's own mobile-GPU precision benchmarking blog post (see YouiPrecisionShader.js in the same repo)
// -- this is a known, real technique, not invented here.
//
// EACH MODE IS RUN FOUR WAYS AT ONCE, which is the point: the SAME algorithm, once in a local variable and
// once in a struct field, in BOTH the vertex and fragment shader stages, packed into one RGBA8 readback
// (divided by 255, since the counts involved -- around 23-32 -- fit an 8-bit unsigned channel with room to
// spare). Two real, documented GPU-driver quirk categories this can catch that a single number cannot:
// vertex-stage precision lower than fragment-stage (some mobile GPUs), and struct-stored values computed to
// different precision than local variables (a compiler-optimization-path difference).
//
// ---- WHAT THIS MODULE IS PURE, AND WHAT IS NOT --------------------------------------------------------------
// Every function below that does not say "GPU" in its name touches no WebGL, no DOM, no browser global --
// the same "pure, every global handed in as an argument" convention ui/codecProbe.mjs's own header documents.
// buildProbeSource/parseProbeBytes/cpuFloatExponent/cpuIntBits/cpuUintBits/describePrecision are all callable
// and testable from plain Node with zero setup. The one thing that CANNOT be pure is the measurement itself:
// asking "what does this device's GPU actually do" requires a real GPU, the same reason ui/webgpuProbe.mjs's
// requestAdapter() check needs a real browser. A caller compiles buildProbeSource(mode)'s shaders on an
// actual WebGL2 context, reads back the single output pixel, and hands the bytes to parseProbeBytes.
"use strict";

/** Which of the three shader variants to compile -- GLSL preprocessor branches on this, so one shader = one mode. */
export const MODE = Object.freeze({ FLOAT: 0, INT: 1, UINT: 2 });

// The algorithm itself, GLSL ES 3.00 (matching this engine's own #version 300 es shaders, e.g.
// render/EntityMeshRenderer.js) -- functionally identical to gkjohnson/webgl-precision's computePrecision(),
// with the MODE branch driven by a real #define (injected below) rather than three.js's `defines` mechanism.
const PRECISION_FUNCTION = `
struct FloatStruct { highp float value; };
struct IntStruct { highp int value; };
struct UintStruct { highp uint value; };

vec2 computePrecision() {
#if MODE == 0
    float exponent = 0.0;
    float value = 1.5;
    while (value > 1.0) {
        exponent++;
        value = 1.0 + pow(2.0, -exponent) / 2.0;
    }
    float structExponent = 0.0;
    FloatStruct str;
    str.value = 1.5;
    while (str.value > 1.0) {
        structExponent++;
        str.value = 1.0 + pow(2.0, -structExponent) / 2.0;
    }
    return vec2(exponent, structExponent);
#elif MODE == 1
    int bits = 0;
    int value = 1;
    while (value > 0) {
        value = value << 1;
        value = value | 1;
        bits++;
    }
    int structBits = 0;
    IntStruct str;
    str.value = 1;
    while (str.value > 0) {
        str.value = str.value << 1;
        str.value = str.value | 1;
        structBits++;
    }
    return vec2(float(bits), float(structBits));
#else
    int bits = 0;
    uint value = 1u;
    while (value > 0u) {
        value = value << 1u;
        bits++;
    }
    int structBits = 0;
    UintStruct str;
    str.value = 1u;
    while (str.value > 0u) {
        str.value = str.value << 1u;
        structBits++;
    }
    return vec2(float(bits), float(structBits));
#endif
}
`;

/**
 * The vertex+fragment GLSL source for one MODE, ready to compile and link against an attributeless
 * full-screen triangle (the `gl_VertexID` big-triangle trick, matching this tree's other headless-harness
 * shaders -- e.g. tools/ship/bloomFused-selfcheck.mjs's VS_ATTRIBUTELESS). Renders to a 1x1 target: the
 * algorithm produces the same answer at every pixel, so one is all a caller needs.
 * @param {number} mode - one of MODE.FLOAT/INT/UINT
 * @returns {{vertex: string, fragment: string}}
 */
export function buildProbeSource(mode) {
    if (mode !== MODE.FLOAT && mode !== MODE.INT && mode !== MODE.UINT) {
        throw new Error("precisionProbe: buildProbeSource needs MODE.FLOAT/INT/UINT, got " + mode);
    }
    const header = `#version 300 es\n#define MODE ${mode}\nprecision highp float;\nprecision highp int;\n`;
    const vertex = header + PRECISION_FUNCTION + `
out vec2 vPrecision;
void main() {
    vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2)) * 2.0 - 1.0;
    gl_Position = vec4(p, 0.0, 1.0);
    vPrecision = computePrecision();
}
`;
    const fragment = header + PRECISION_FUNCTION + `
in vec2 vPrecision;
out vec4 fragColor;
void main() {
    vec2 fPrecision = computePrecision();
    fragColor = vec4(vPrecision, fPrecision) / 255.0;
}
`;
    return { vertex, fragment };
}

/**
 * Decode a single readback pixel (4 UNSIGNED_BYTE channels, 0-255) back into the four raw counts the shader
 * packed. Inverts the shader's own `/255.0` exactly (byte/255*255 recovers the integer for any input in
 * [0,255], the only range these counts ever take -- checked, not assumed, by the gate's own stability check).
 * @param {ArrayLike<number>} bytes - at least 4 values, first 4 used (RGBA of one pixel)
 */
export function parseProbeBytes(bytes) {
    return { vertex: bytes[0], vertexStruct: bytes[1], fragment: bytes[2], fragmentStruct: bytes[3] };
}

/**
 * The CPU ground truth for MODE.FLOAT -- the SAME algorithm as the shader's `#if MODE == 0` branch, run in
 * real IEEE754 single precision via Math.fround at every step (not float64, which would silently answer a
 * different question). This is what a spec-compliant highp-float GPU (WebGL2 requires highp in fragment
 * shaders) SHOULD report; a real device's own answer is compared against it, not assumed to match.
 */
export function cpuFloatExponent() {
    let exponent = 0, value = Math.fround(1.5);
    while (value > 1.0) {
        exponent++;
        value = Math.fround(1.0 + Math.fround(Math.fround(Math.pow(2.0, -exponent)) / 2.0));
    }
    return exponent;
}

/** The CPU ground truth for MODE.INT -- real 32-bit signed wraparound via Int32Array, mirroring the shader exactly. */
export function cpuIntBits() {
    const buf = new Int32Array(1);
    buf[0] = 1;
    let bits = 0;
    while (buf[0] > 0) { buf[0] = (buf[0] << 1) | 1; bits++; }
    return bits;
}

/** The CPU ground truth for MODE.UINT -- real 32-bit unsigned wraparound via Uint32Array, mirroring the shader exactly. */
export function cpuUintBits() {
    const buf = new Uint32Array(1);
    buf[0] = 1;
    let bits = 0;
    while (buf[0] > 0) { buf[0] = buf[0] << 1; bits++; }
    return bits;
}

/**
 * Compose the three modes' parsed readbacks into a human-readable finding -- the actual point of the
 * instrument. Names each of the three real quirk categories this technique can catch, rather than just
 * reporting numbers: a stage mismatch (vertex vs fragment), a storage mismatch (local var vs struct field),
 * and a divergence from the IEEE754/int32/uint32 ground truth a spec-compliant device should report.
 * @param {{float: object, int: object, uint: object}} results - each a parseProbeBytes() return value
 */
export function describePrecision({ float, int, uint }) {
    const expected = { float: cpuFloatExponent(), int: cpuIntBits(), uint: cpuUintBits() };
    const rows = [
        { name: "float", got: float, expectedBits: expected.float },
        { name: "int", got: int, expectedBits: expected.int },
        { name: "uint", got: uint, expectedBits: expected.uint },
    ];
    const findings = [];
    for (const r of rows) {
        if (r.got.vertex !== r.got.fragment) {
            findings.push(`${r.name}: vertex stage (${r.got.vertex}) and fragment stage (${r.got.fragment}) disagree`);
        }
        if (r.got.vertex !== r.got.vertexStruct || r.got.fragment !== r.got.fragmentStruct) {
            findings.push(`${r.name}: a struct-stored value (${r.got.vertexStruct}/${r.got.fragmentStruct}) disagrees with a local variable (${r.got.vertex}/${r.got.fragment})`);
        }
        if (r.got.fragment !== r.expectedBits) {
            findings.push(`${r.name}: fragment stage measured ${r.got.fragment}, expected ${r.expectedBits} for a spec-compliant highp ${r.name}`);
        }
    }
    return {
        float, int, uint, expected,
        matchesSpec: findings.length === 0,
        findings,
        summary: findings.length === 0
            ? `float=${float.fragment}bit int=${int.fragment}bit uint=${uint.fragment}bit, all stages/storage agree, matches IEEE754/int32/uint32`
            : findings.join("; "),
    };
}
