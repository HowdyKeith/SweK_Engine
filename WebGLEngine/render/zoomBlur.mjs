// render/zoomBlur.mjs
//
// v4478 -- THE ZOOM BLUR, AND WHY THE TREE'S NEAREST THING TO ONE IS NOT ONE.
//
// THE NEAR MISS. render/bloomPass.js's GODRAYS_FS is the only radial-march-from-a-point shader in this tree,
// and it has the same loop shape as a zoom blur: step from the current pixel toward a screen-space centre,
// accumulate what you find. Every contract around that loop is inverted, and the differences are read out of
// bloomPass.js's own source by godRaysContract() below rather than described here:
//
//     god rays                                  zoom blur
//     ---------------------------------------   ------------------------------------------
//     marches toward the SUN's position         marches toward an arbitrary centre
//     gates by luminance, and the gate is       no gate: every sample counts, equally
//       ALSO the weight -- (lum - threshold)
//     gates by depth, far plane only            no depth: it is a screen-space filter
//     decays 0.965 per step                     no decay
//     ADDS brightness to the scene              REPLACES the scene
//     weights sum to nothing knowable           weights sum to exactly 1
//
// The last line is the one that matters, because it is the difference between a look and a measurement. God
// rays are a light effect: no input reproduces its output, so there is nothing to be right about. A zoom blur
// is an AVERAGE, and an average has properties that hold exactly, in floating point, with no reference image
// and no tolerance to negotiate:
//
//     P1  a flat image comes back BIT-IDENTICAL                    (partition of unity)
//     P2  strength 0 is the IDENTITY, bit-for-bit                  (so wiring it in cannot move a pixel)
//     P3  the centre pixel is a FIXED POINT at any strength        (every sample lands on it)
//     P4  an image constant along rays from the centre is a FIXED POINT  (the samples stay on the ray)
//     P5  on a radial ramp the output is STRICTLY BELOW the input  (it marches toward, not away)
//
// *** AND P1 IS NOT FREE. IT IS THE WHOLE DESIGN. *** The obvious kernel -- `for (i) acc += sample; acc /= N`
// -- DOES NOT SATISFY IT. Summing N copies of one value left to right rounds: at N = 32 the sequential sum
// fails on six of seven ordinary values (0.1 comes back 0.10000000000000005). A PAIRWISE tree over a
// power-of-two sample count is exact for all of them, because every partial sum is a doubling and a doubling
// is an exponent shift. So the sample count is required to be a power of two and the summation order is a
// tree, and both are refusals in this module rather than comments in a shader.
//
// ONE HOME FOR THE ORDER, THREE CONSUMERS. reduceTree() below performs the reduction once. The CPU oracle
// calls it with numbers; the GLSL and WGSL emitters call it with SOURCE TEXT and the same combiner shape, so
// the parenthesisation in the generated shader IS the evaluation order the oracle used. There is no second
// declaration of the order to fall out of step -- the thing this tree has found in nine files, three, and
// four is exactly a second copy nobody updates.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));

export const BLOOM_SOURCE = "render/bloomPass.js";

/**
 * SAMPLES must be a power of two: the exactness of P1 rests on every partial sum being a doubling.
 * MAX_STRENGTH is the fraction of the distance to the centre the furthest sample travels. At 1.0 the last
 * sample IS the centre, which is well defined and maximally blurred; above 1.0 it would overshoot past the
 * centre and the filter would stop being an average of the segment it claims to average.
 */
export const ZOOM = Object.freeze({
    SAMPLES: 32,
    MAX_STRENGTH: 1.0,
    DEFAULT_STRENGTH: 0.0,     // OFF. P2 makes "off" mean bit-identical, not merely close.
});

export function isPowerOfTwo(n) {
    return Number.isInteger(n) && n > 0 && (n & (n - 1)) === 0;
}

/**
 * THE ONE REDUCTION. Pairwise, left-to-right within each level, bottom-up.
 * `combine(a, b)` is `+` for numbers and string concatenation for source text, so the emitters cannot
 * describe an order the oracle did not take.
 * REFUSES a non-power-of-two length: a tree over 48 leaves has an odd level, the exactness argument dies
 * there, and a kernel that silently fell back to sequential would fail P1 without saying why.
 */
export function reduceTree(items, combine) {
    if (!isPowerOfTwo(items.length)) {
        throw new Error("zoomBlur.reduceTree: needs a power-of-two leaf count, got " + items.length);
    }
    let level = items.slice();
    while (level.length > 1) {
        const next = [];
        for (let i = 0; i < level.length; i += 2) next.push(combine(level[i], level[i + 1]));
        level = next;
    }
    return level[0];
}

/** The sequential sum P1 rejects. Exported so the gate can DEMONSTRATE the failure rather than assert it. */
export function reduceSequential(items, combine) {
    let acc = items[0];
    for (let i = 1; i < items.length; i++) acc = combine(acc, items[i]);
    return acc;
}

/**
 * Where sample i lands: a linear ramp from the pixel to the centre.
 * f32 throughout, because the shaders are f32 and an oracle carrying f64 intermediates would be grading a
 * computation nothing runs.
 */
export function sampleT(i, strength, samples = ZOOM.SAMPLES) {
    // *** THE STRENGTH IS ROUNDED TO f32 FIRST, AND LEAVING IT OUT COST AN HOUR. *** The uniform reaching the
    // shader is an f32: 0.7 arrives as 0.699999988079071. An oracle that multiplies by the f64 0.7 is grading a
    // computation nothing runs, and it diverged from the GPU at 11 of 32 sample positions by one ulp -- which
    // looked exactly like a hardware disagreement and was not. Every input the shader sees as f32 is rounded
    // here before it is used, not merely the intermediates.
    const s = Math.fround(strength);
    return Math.fround(Math.fround(s * i) / (samples - 1));
}

export function samplePoint(uv, centre, t) {
    return [
        Math.fround(uv[0] + Math.fround(Math.fround(centre[0] - uv[0]) * t)),
        Math.fround(uv[1] + Math.fround(Math.fround(centre[1] - uv[1]) * t)),
    ];
}

/**
 * THE ORACLE. `image(u, v)` returns a scalar; the shaders evaluate the same analytic images so the comparison
 * is of the KERNEL rather than of two texture samplers' filtering rules.
 */
export function zoomBlurCpu(image, uv, centre, strength, samples = ZOOM.SAMPLES) {
    const vals = [];
    for (let i = 0; i < samples; i++) {
        vals.push(Math.fround(image(...samplePoint(uv, centre, sampleT(i, strength, samples)))));
    }
    const sum = reduceTree(vals, (a, b) => Math.fround(a + b));
    return Math.fround(sum / samples);
}

/** The same kernel with the summation order swapped -- the one that fails P1. */
export function zoomBlurSequential(image, uv, centre, strength, samples = ZOOM.SAMPLES) {
    const vals = [];
    for (let i = 0; i < samples; i++) {
        vals.push(Math.fround(image(...samplePoint(uv, centre, sampleT(i, strength, samples)))));
    }
    const sum = reduceSequential(vals, (a, b) => Math.fround(a + b));
    return Math.fround(sum / samples);
}

/** The analytic images the properties are stated over. IMAGES[k].cpu and the shader arm k are the same image. */
export const IMAGES = Object.freeze({
    // P1. Any constant; 0.1 is chosen because it is one of the values sequential summation gets wrong.
    flat:   Object.freeze({ arm: 0, transcendental: false, cpu: () => Math.fround(0.1) }),
    // P5. Distance from the centre. sqrt is correctly rounded in IEEE-754, so this is comparable bit-for-bit.
    radial: Object.freeze({ arm: 1, transcendental: false,
        cpu: (u, v) => Math.fround(Math.sqrt(Math.fround(Math.fround(u - 0.5) * Math.fround(u - 0.5)) +
                                             Math.fround(Math.fround(v - 0.5) * Math.fround(v - 0.5)))) }),
    // A plane. Its blur has a closed form, so it grades the sample POSITIONS and not merely their agreement.
    linear: Object.freeze({ arm: 2, transcendental: false, cpu: (u, v) => Math.fround(u + v) }),
    // P4. Constant along every ray from (0.5, 0.5) -- it depends on angle alone. CPU-ONLY, and the reason is
    // stated where it is used: atan2 is not bit-identical across implementations, so a GPU comparison on this
    // image would be measuring two libraries rather than one kernel.
    angular: Object.freeze({ arm: -1, transcendental: true,
        cpu: (u, v) => Math.fround(Math.atan2(v - 0.5, u - 0.5)) }),
});

// ---- SOURCE EMITTERS -- both drive reduceTree, so neither can describe an order the oracle did not take ----

function sumExpression(name, samples) {
    const leaves = [];
    for (let i = 0; i < samples; i++) leaves.push(`${name}[${i}]`);
    return reduceTree(leaves, (a, b) => `(${a} + ${b})`);
}

/** The parenthesised sum, exported so the gate can compare the three consumers' order directly. */
export function sumTreeShape(samples = ZOOM.SAMPLES) { return sumExpression("s", samples); }

export function glslSource({ samples = ZOOM.SAMPLES } = {}) {
    if (!isPowerOfTwo(samples)) throw new Error("zoomBlur.glslSource: samples must be a power of two");
    return `#version 300 es
precision highp float;
in vec2 vUV;
out vec4 outColor;

uniform sampler2D uScene;
uniform vec2  uCentre;      // the point everything zooms toward, in UV
uniform float uStrength;    // 0 = identity (bit-for-bit), 1 = the last sample IS the centre

const int N_SAMPLES = ${samples};

// v4478 -- THE SUM IS A TREE, NOT A RUNNING TOTAL, AND IT IS GENERATED.
// Summing ${samples} copies of one value left to right rounds; a pairwise tree over a power-of-two count does
// not, because every partial sum is a doubling. That is what makes a flat image come back bit-identical and
// what makes uStrength = 0 an exact identity. The parenthesisation below came out of reduceTree() in
// render/zoomBlur.mjs -- the same call the CPU oracle makes -- so this order cannot drift from that one.
void main() {
    vec3 s[N_SAMPLES];
    for (int i = 0; i < N_SAMPLES; i++) {
        float t = uStrength * float(i) / float(N_SAMPLES - 1);
        s[i] = texture(uScene, vUV + (uCentre - vUV) * t).rgb;
    }
    vec3 total = ${sumExpression("s", samples)};
    outColor = vec4(total / float(N_SAMPLES), 1.0);
}`;
}

/**
 * THE GPU CASE TABLE. One dispatch covers every (image, strength) pair, and the reason is not tidiness.
 *
 * *** MEASURED: THIS BOX'S GPU CANNOT SERVE TWO PROCESSES AT ONCE. *** Eight concurrent runs of this gate all
 * failed; backendParity-selfcheck failed every time any GPU gate ran beside it. The ship sweep runs gates
 * EIGHT-WAY PARALLEL, so a gate that acquires a device nineteen times does not merely take longer -- it
 * poisons every other GPU gate in the sweep, and two ship verdicts named five and six false reds because of
 * exactly that. Collapsing the matrix into ONE dispatch is the repair. It is not a budget dodge: the gate
 * still runs every case, and what shrinks is the number of times it takes the device.
 */
export const GPU_ARMS = Object.freeze(["flat", "radial", "linear"]);
export const GPU_STRENGTHS = Object.freeze([0, 0.25, 0.5, 0.7, 0.9, 1.0]);

/** (image, strength) pairs in dispatch order, so the gate reads cases out of the same list the shader was built from. */
export function gpuCases() {
    const out = [];
    for (const key of GPU_ARMS) for (const strength of GPU_STRENGTHS) out.push({ key, strength, arm: IMAGES[key].arm });
    return out;
}

/**
 * The WGSL arm exists to be RUN. It evaluates the same analytic images the oracle does, so what the gate
 * compares is one kernel against itself on two machines rather than two texture samplers against each other.
 * The strength and image for a case are read from generated tables -- the same gpuCases() the gate walks --
 * so the shader and the comparison cannot disagree about which cell is which.
 */
export function wgslSource({ samples = ZOOM.SAMPLES, n = 64, cases = gpuCases() } = {}) {
    if (!isPowerOfTwo(samples)) throw new Error("zoomBlur.wgslSource: samples must be a power of two");
    const px = n * n;
    const armTable = cases.map((c) => `${c.arm}.0`).join(", ");
    const strTable = cases.map((c) => (Number.isInteger(c.strength) ? c.strength + ".0" : String(c.strength))).join(", ");
    return `struct U { cx: f32, cy: f32, pad0: f32, pad1: f32 };
@group(0) @binding(0) var<storage, read_write> outBuf: array<f32>;
@group(0) @binding(1) var<uniform> u: U;

const ARMS = array<f32, ${cases.length}>(${armTable});
const STRENGTHS = array<f32, ${cases.length}>(${strTable});

fn image(arm: f32, p: vec2<f32>) -> f32 {
    if (arm < 0.5) { return 0.1; }
    if (arm < 1.5) { let d = p - vec2<f32>(0.5, 0.5); return sqrt(d.x * d.x + d.y * d.y); }
    return p.x + p.y;
}

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let idx = gid.x;
    if (idx >= ${cases.length}u * ${px}u) { return; }
    let cs = idx / ${px}u;
    let pix = idx % ${px}u;
    let arm = ARMS[cs];
    let strength = STRENGTHS[cs];
    let uv = vec2<f32>(f32(pix % ${n}u) / ${n}.0, f32(pix / ${n}u) / ${n}.0);
    let centre = vec2<f32>(u.cx, u.cy);
    var s: array<f32, ${samples}>;
    for (var i = 0u; i < ${samples}u; i = i + 1u) {
        let t = strength * f32(i) / f32(${samples} - 1);
        s[i] = image(arm, uv + (centre - uv) * t);
    }
    let total = ${sumExpression("s", samples)};
    outBuf[idx] = total / f32(${samples});
}`;
}

// ---- THE NEAR MISS, READ OUT OF bloomPass.js RATHER THAN DESCRIBED --------------------------------------

export function readBloom() {
    return fs.readFileSync(path.join(HERE, "bloomPass.js"), "utf8");
}

/**
 * The god-ray contract, DERIVED from bloomPass.js's own text. Every field is a match against the shipped
 * source, so the comparison table in this file's header cannot quietly become a description of a shader that
 * has since changed. A field reading null means the source no longer says what this claim rests on.
 */
export function godRaysContract(src = readBloom()) {
    const body = (src.match(/const GODRAYS_FS = `([\s\S]*?)`;/) || [])[1] || "";
    const num = (re) => { const m = body.match(re); return m ? Number(m[1]) : null; };
    return {
        found: body.length > 0,
        marchesTowardAPoint: /uv\s*-=\s*deltaUV/.test(body) && /vUV\s*-\s*uSunPosUV/.test(body),
        centreIsTheSun: /uniform vec2 uSunPosUV/.test(src),
        luminanceGate: /lum\s*>\s*uThreshold/.test(body),
        // The gate is ALSO the weight, which is why the weights sum to nothing knowable.
        gateIsAlsoTheWeight: /col\s*\+=\s*c\s*\*\s*illum\s*\*\s*\(lum\s*-\s*uThreshold\)/.test(body),
        depthGate: /d\s*>=\s*0\.999/.test(body),
        decay: num(/const float DECAY = ([\d.]+)/),
        samples: num(/const int N_SAMPLES = (\d+)/),
        // Additive at composite time: it never replaces the scene.
        additiveAtComposite: /col\s*\+=\s*gr\s*\*\s*uGodRayStrength/.test(src),
        replacesScene: false,
    };
}

/**
 * What a zoom blur is, in the same fields, so the two can be compared field by field instead of in prose.
 * DERIVED from this module's own emitted GLSL wherever the answer is visible there.
 */
export function zoomBlurContract(glsl = glslSource()) {
    return {
        found: glsl.length > 0,
        marchesTowardAPoint: /vUV \+ \(uCentre - vUV\) \* t/.test(glsl),
        centreIsTheSun: /uSunPosUV/.test(glsl),
        luminanceGate: /uThreshold/.test(glsl),
        gateIsAlsoTheWeight: false,
        depthGate: /uSceneDepth/.test(glsl),
        decay: /DECAY/.test(glsl) ? 1 : null,
        samples: Number((glsl.match(/const int N_SAMPLES = (\d+)/) || [])[1]) || null,
        additiveAtComposite: false,
        replacesScene: /outColor = vec4\(total \/ float\(N_SAMPLES\)/.test(glsl),
    };
}
