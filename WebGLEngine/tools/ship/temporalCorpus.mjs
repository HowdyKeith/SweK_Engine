/**
 * THE TEMPORAL ARC'S KERNELS, AS CROSS-BACKEND CORPUS ENTRIES.
 *
 * v4571 measured that wgslCorpus's census could see ONE of this arc's thirteen WGSL producers, because its
 * detector reads `export const X` and every module here re-exports at the foot of the file. Widening the
 * detector made crossBackend name all thirteen; this module answers them.
 *
 * *** THE BINDINGS ARE READ OUT OF EACH KERNEL'S OWN SOURCE, NOT RESTATED HERE. *** Thirteen hand-copied
 * binding tables is thirteen chances to write 2 where the shader says 3, and a wrong number in a corpus
 * entry does not fail loudly -- v4572 measured that it produces a clean pass over a buffer nobody wrote.
 * `bindingsOf` parses the @group(0) @binding(n) lines, so an entry names BUFFERS and the numbers follow the
 * shader. A renamed buffer fails at construction, which is the loud direction.
 *
 * *** TWO OF THE THIRTEEN ARE NOT KERNELS. *** LUMA_WGSL and YCOCG_WGSL are function fragments -- no entry
 * point, no bindings, spliced into the kernels below. They cannot be dispatched, so they are compileOnly
 * entries wrapped in a shell that CALLS them: a fragment spliced somewhere is only covered if the splice
 * site actually uses it, and "covered where it is used" is a claim about the other kernel, not this one.
 */
import * as LOCK from "../../render/temporalLockWgsl.mjs";
import * as REJECT from "../../render/temporalRejectWgsl.mjs";
import { ACCUMULATE_WGSL } from "../../render/temporalAccumulateWgsl.mjs";
import { RESOLVE_WGSL } from "../../render/temporalResolveWgsl.mjs";
import { MOTION_WGSL } from "../../render/motionVectorsWgsl.mjs";
import { RING_FLOOR_WGSL } from "../../render/ringFloorWgsl.mjs";
// *** v4591 -- BIND WHAT THE ENTRY POINT USES, NOT WHAT THE SOURCE DECLARES. *** bindingsOf() reads every
// @group(0) binding in the text, which was the same set as "what a dispatch needs" for as long as every kernel
// here had exactly one entry point. temporalAccumulateWgsl.mjs now has two, and the counted one's atomic
// buffer is refused by the API when bound for a pipeline built on `main` -- gfx/device.js's own note at v4466
// says so: "a bind group carrying a binding the entry never touches is refused by the API". usedNames answers
// the same question the device asks, and now lives in render/wgslSpec.mjs so both can ask it.
import { usedNames } from "../../render/wgslSpec.mjs";

/** Every @group(0) binding a kernel declares, in source order: { binding, kind, name }. */
export function bindingsOf(code) {
    const re = /@group\(0\)\s*@binding\((\d+)\)\s*var<([^>]*)>\s*(\w+)/g;
    const out = []; let m;
    while ((m = re.exec(code))) out.push({ binding: +m[1], kind: m[2].replace(/\s+/g, ""), name: m[3] });
    return out;
}

// ---- THE FIXTURE ------------------------------------------------------------------------------------------
// One 16x16 frame is enough: these kernels are per-pixel with a 3x3 or 5-tap neighbourhood, so 16x16 exercises
// every branch (interior, edge, corner) and keeps thirteen entries inside crossBackend's budget. The content is
// deterministic and NOT flat -- a flat field would make half these kernels write a constant, which is the
// shape v4572 showed a corpus cannot tell from a kernel that never ran.
export const TW = 16, TH = 16, TP = 4, TF = 2 * TP;
const at = (i) => ({ x: i % TW, y: (i / TW) | 0 });
const wave = (x, y) => 0.5 + 0.45 * Math.sin(x * 0.7) * Math.cos(y * 0.55);
const scalar = (f) => Float32Array.from({ length: TW * TH }, (_, i) => { const { x, y } = at(i); return f(x, y); });
const rgba = (f) => { const a = new Float32Array(TW * TH * 4);
    for (let i = 0; i < TW * TH; i++) { const { x, y } = at(i), v = f(x, y);
        a[i * 4] = v; a[i * 4 + 1] = v * 0.8 + 0.1; a[i * 4 + 2] = 1 - v; a[i * 4 + 3] = 1; }
    return a; };
const ringOf = () => Float32Array.from({ length: TW * TH * TF }, (_, i) => wave((i / TF) % TW, ((i / TF) / TW) | 0) + 0.01 * (i % TF));

/** Sub-texel motion on both axes, so nothing lands on the phase where half this arc's expressions coincide (v4571). */
const MOTION_FIELD = (() => { const a = new Float32Array(TW * TH * 4);
    for (let i = 0; i < TW * TH; i++) { a[i * 4] = 0.125 / TW; a[i * 4 + 1] = 0.375 / TH; a[i * 4 + 2] = 0.5; a[i * 4 + 3] = 0.5; }
    return a; })();

/**
 * *** A DEDICATED MOTION FIELD FOR THE DISOCCLUSION TEST, BECAUSE THE SHARED ONE MADE IT WRITE A CONSTANT. ***
 * The first version of this module handed every kernel MOTION_FIELD, whose w channel (the expected previous
 * depth) is a flat 0.5 while prevDepth runs 0.30..0.42 -- so `was - expect` was about -0.08 at every pixel,
 * never above the 0.02 threshold, and the kernel wrote 256 zeros. It RAN, it wrote every word, and the two
 * backends agreed perfectly on a single number. v4572's own subject one level up: liveness is not the same as
 * exercise, and a corpus entry whose output has ONE distinct value cannot show a divergence in the branch it
 * exists to cover. Here the expected depth straddles the threshold in both directions.
 */
const MOTION_DISOCC = (() => { const a = new Float32Array(TW * TH * 4);
    for (let i = 0; i < TW * TH; i++) { const { x, y } = at(i), was = 0.3 + 0.004 * (x + y);
        a[i * 4] = 0.125 / TW; a[i * 4 + 1] = 0.375 / TH; a[i * 4 + 2] = 0.5;
        a[i * 4 + 3] = was - (((x + y) & 3) < 2 ? 0.10 : -0.10); }
    return a; })();

const DATA = {
    cur: rgba(wave), current: rgba(wave), src: rgba(wave),
    hist: rgba((x, y) => wave(x + 1, y)), history: rgba((x, y) => wave(x + 1, y)),
    motion: MOTION_FIELD,
    ringIn: ringOf(), ring: ringOf(), ringOut: new Float32Array(TW * TH * TF),
    filledIn: scalar(() => TF), filled: scalar(() => TF), filledOut: new Float32Array(TW * TH),
    field: scalar(wave), mask: scalar((x, y) => ((x + y) & 1) ? 1 : 0), luma: scalar(wave),
    depth: scalar((x, y) => 0.3 + 0.004 * (x + y)), prevDepth: scalar((x, y) => 0.3 + 0.004 * (x + y)),
    factor: scalar((x, y) => 0.25 + 0.5 * (((x + y) & 3) / 3)),
    conf: new Float32Array(TW * TH),
    // *** THREE DISTINCT MASKS, WHICH IS THE POINT. *** FACTOR_WGSL multiplies (1 - clamp(m)) over whichever of
    // the three its flags admit. Fed identical fixtures, a kernel that read `reactive` where it meant `shading`
    // would produce exactly the right answer, and the corpus would agree with it on both backends. Each also
    // carries values OUTSIDE [0,1] in places, because the clamp is part of the rule and an input that never
    // leaves the range cannot show whether it happens.
    disocclusion: scalar((x, y) => ((x + y) & 3) === 0 ? 1.2 : 0),
    reactive: scalar((x) => (x < TW / 2 ? 0.25 : -0.4)),
    shading: scalar((x, y) => 0.1 * (y % 5)),
    // NOTE: ACCUMULATE_WGSL's `stats` binding needs NO fixture here. A first attempt added four zeros, and the
    // device refused the run -- "an empty read-back is not a measurement", which is the harness saying the bind
    // group did not match the layout. The binding belongs to mainCounted; main never touches it, and the filter
    // above drops it before a fixture is asked for. An inert fixture would have papered over a real rule.
};

/**
 * A uniform buffer as the FLOAT WORDS the two harnesses carry. Both do `new Float32Array(uniforms)`, so a
 * u32 field travels as the float with the same bits -- exact for the small counts here (16, 8, 4 are f32
 * denormals and survive the JSON hop to the browser page unchanged). A u32 above 2^24 would land in the f32
 * NaN range and lose its payload, which is why every count below is a dimension and not a hash.
 */
function packU(u32s, f32s = []) {
    const words = u32s.length + f32s.length, b = new ArrayBuffer(Math.max(16, words * 4));
    new Uint32Array(b, 0, u32s.length).set(u32s);
    if (f32s.length) new Float32Array(b, u32s.length * 4, f32s.length).set(f32s);
    return Array.from(new Float32Array(b));
}

const ident = () => { const m = new Array(16).fill(0); m[0] = m[5] = m[10] = m[15] = 1; return m; };

// ---- THE ELEVEN KERNELS -----------------------------------------------------------------------------------
// `out` names the buffer the read-back comes from. Every other storage binding is fed from DATA by name; a
// read_write binding that is NOT the read-back target (RING_PUSH's filledOut, RESOLVE's conf) is fed the same
// way and simply not read, which is what the harness's `inputs` already does.
const KERNELS = [
    { id: "temporalLock.RING_PUSH_WGSL", from: "render/temporalLockWgsl.mjs", code: LOCK.RING_PUSH_WGSL, out: "ringOut",
      why: "the ring push: a bilinear reprojection of every older slot by the motion vector, a fresh newest slot and a saturating fill count -- four storage inputs and TWO read_write outputs, the widest binding set in this tree",
      uniforms: packU([TW, TH, TP, 0]) },
    { id: "temporalLock.SHADING_SHIFT_WGSL", from: "render/temporalLockWgsl.mjs", code: LOCK.SHADING_SHIFT_WGSL, out: "dst",
      why: "the shading-shift detector: a difference of two means over the ring's halves, scaled and clamped, with an early-out on an unfilled pixel -- a divide guarded by max(scale, 1e-8), which is where two backends' reciprocals would part",
      uniforms: packU([TW, TH, TP, 0], [1, 4, 0, 0]) },
    { id: "temporalLock.RIDGE_WGSL", from: "render/temporalLockWgsl.mjs", code: LOCK.RIDGE_WGSL, out: "dst",
      why: "the ridge detector over the ring: a plateau walk in x and y with a margin test, writing a 0/1 verdict -- a BRANCH-heavy integer kernel whose output is a mask, so any divergence is total rather than a last-place bit",
      uniforms: packU([TW, TH, TP, 3], [0.05, 0, 0, 0]) },
    { id: "temporalLock.FIELD_RIDGE_WGSL", from: "render/temporalLockWgsl.mjs", code: LOCK.FIELD_RIDGE_WGSL, out: "dst",
      why: "the same walk over a plain field with an optional mask binding, exercising the useMask branch that the ring form has no equivalent of",
      uniforms: packU([TW, TH, 1, 3], [0.05, 0, 0, 0]) },
    { id: "temporalLock.COHERENT_RIDGE_WGSL", from: "render/temporalLockWgsl.mjs", code: LOCK.COHERENT_RIDGE_WGSL, out: "dst",
      why: "the band-limited ridge: a two-axis plateau walk capped by maxBand, the one kernel here whose verdict depends on a loop bound rather than a threshold",
      uniforms: packU([TW, TH, 6, 3], [0.05, 0, 0, 0]) },
    { id: "temporalReject.DISOCCLUSION_WGSL", from: "render/temporalRejectWgsl.mjs", code: REJECT.DISOCCLUSION_WGSL, out: "dst",
      why: "the disocclusion test: a reprojected depth fetch compared against a threshold with a sign flag -- a comparison whose two sides come from different buffers, so a mis-bound input reads as a valid verdict",
      data: { motion: MOTION_DISOCC }, uniforms: packU([TW, TH], [0.02]) },
    { id: "temporalReject.FACTOR_WGSL", from: "render/temporalRejectWgsl.mjs", code: REJECT.FACTOR_WGSL, out: "dst",
      why: "the history factor: three optional masks inverted and MULTIPLIED into one per-pixel weight -- the only 1D kernel in this corpus, and the one whose flags decide which of its three inputs are read at all",
      uniforms: packU([TW * TH, 7, 0, 0]),
      workgroups: [Math.ceil((TW * TH) / 64), 1] },
    { id: "temporalReject.RECTIFY_WGSL", from: "render/temporalRejectWgsl.mjs", code: REJECT.RECTIFY_WGSL, out: "dst",
      why: "the neighbourhood rectification: a YCoCg round trip, an AABB over the 3x3 neighbourhood, a clip of the history toward the current colour and a per-pixel blend factor -- the widest float surface in the arc",
      uniforms: packU([TW, TH], [0.1]).slice(0, 4) },
    { id: "temporalAccumulate.ACCUMULATE_WGSL", from: "render/temporalAccumulateWgsl.mjs", code: ACCUMULATE_WGSL, out: "dst",
      why: "the accumulate pass: a bilinear history fetch at the reprojected position blended by alpha, with the out-of-bounds branch that decides whether history exists at all",
      uniforms: packU([TW, TH, 0], [0.1]) },
    { id: "temporalResolve.RESOLVE_WGSL", from: "render/temporalResolveWgsl.mjs", code: RESOLVE_WGSL, out: "dst",
      why: "the resolve: a 3x3 Lanczos2 gather about round(s) with a jittered source position, writing colour and a confidence beside it -- v4570 measured this footprint misses 9.75% of the separable weight, which is exactly why both backends must agree on what it DOES compute",
      uniforms: packU([TW, TH, TW, TH], [0.125, 0.375]).concat([0, 0]).slice(0, 8) },
    { id: "motionVectors.MOTION_WGSL", from: "render/motionVectorsWgsl.mjs", code: MOTION_WGSL, out: "dst",
      why: "the motion vectors: two mat4x4 uniforms, a perspective divide per pixel and a previous-clip reprojection -- the only kernel in the arc whose uniform is a MATRIX, and a divide by w is where a backend's reciprocal shows",
      uniforms: [...ident(), ...ident(), ...packU([TW, TH, 0, 0])] },
    { id: "ringFloor.RING_FLOOR_WGSL", from: "render/ringFloorWgsl.mjs", code: RING_FLOOR_WGSL, out: "dst",
      why: "the derived noise floor: a two-regime bound per axis (a Taylor term in f(1-f) and a step bound in max(f,1-f)), a resolution test on the third difference, a ring term and an arithmetic clamp -- five bindings and the arc's densest arithmetic; v4571 pinned its phase law, and this holds the kernel to the mirror's shape on two backends",
      uniforms: packU([TW, TH, TP, 0], [0.25, 0, 0, 0]) },
];

/** dst stride, read off the kernel rather than declared: a kernel writing dst[o] is RGBA, dst[i] is scalar. */
/**
 * *** DOES THE DISPATCH ACTUALLY COVER THE PICTURE? *** Asked at construction, because NOTHING ELSE CAN ASK IT.
 *
 * v4594 gave this module a per-entry `workgroups` after FACTOR_WGSL arrived as the first 1D kernel here, and a
 * sabotage put the hardcoded 2D shape back to see what would notice. NOTHING DID: crossBackend compares two
 * harnesses against each other, so both ran the same short dispatch, both left the same half of the output
 * untouched, and both agreed. A comparison of two backends cannot see an error they share.
 *
 * A pure invocation count would not catch it either -- [2,2] over @workgroup_size(64,1,1) is 256 invocations,
 * exactly the picture -- because the kernel reads only g.x and the y axis is thrown away. So the axes the
 * SHADER USES decide: a kernel that never mentions g.y is 1D and only its x extent counts.
 */
function coverageOf(code, workgroups) {
    const m = /@workgroup_size\(\s*(\d+)\s*(?:,\s*(\d+)\s*)?(?:,\s*(\d+)\s*)?\)/.exec(code);
    if (!m) throw new Error("temporalCorpus: a kernel declares no @workgroup_size, so no dispatch can be checked against it");
    const size = [Number(m[1]), Number(m[2] || 1), Number(m[3] || 1)];
    const uses2D = /\bg\.y\b/.test(code);
    const wg = [workgroups[0] || 1, workgroups[1] || 1];
    return uses2D ? (wg[0] * size[0]) * (wg[1] * size[1]) : wg[0] * size[0];
}

const outCountOf = (code, name) =>
    new RegExp(`${name}\\[o`).test(code) ? TW * TH * 4
    : new RegExp(`${name}\\[i \\* F`).test(code) || new RegExp(`${name}\\[i \\* u`).test(code) ? TW * TH * TF
    : TW * TH;

export function temporalEntries() {
    const out = KERNELS.map((k) => {
        const bs = bindingsOf(k.code);
        const outB = bs.find((b) => b.name === k.out);
        const uniB = bs.find((b) => b.kind.includes("uniform"));
        if (!outB) throw new Error(`temporalCorpus: ${k.id} declares no binding named ${JSON.stringify(k.out)} -- the kernel was renamed and this entry was not`);
        if (!uniB) throw new Error(`temporalCorpus: ${k.id} declares no uniform binding`);
        // ENTRY POINT: every kernel here dispatches `main`, which is what the harnesses run. A binding only a
        // second entry point touches is not part of this pipeline and must not be bound.
        const used = new Set(usedNames(k.code, bindingsOf(k.code).map((b) => ({ ...b })), ["main"])
                             .filter((b) => b.used).map((b) => b.name));
        const inputs = bs.filter((b) => b !== outB && b !== uniB && used.has(b.name)).map((b) => {
            const data = (k.data && k.data[b.name]) || DATA[b.name];
            if (!data) throw new Error(`temporalCorpus: ${k.id} binds ${JSON.stringify(b.name)} and this module has no fixture for it`);
            return { binding: b.binding, data };
        });
        const wg = k.workgroups || [Math.ceil(TW / 8), Math.ceil(TH / 8)];
        const covered = coverageOf(k.code, wg);
        if (covered < TW * TH)
            throw new Error(`temporalCorpus: ${k.id} dispatches ${wg.join("x")} over ` +
                `@workgroup_size, reaching ${covered} of ${TW * TH} elements -- the rest of its output would be ` +
                "compared as untouched on BOTH backends, which is agreement about nothing");
        return { id: k.id, from: k.from, why: k.why,
                 opts: { code: k.code, outCount: outCountOf(k.code, k.out),
                         outBinding: outB.binding, uniformBinding: uniB.binding,
                         uniforms: k.uniforms, inputs,
                         // *** PER ENTRY, BECAUSE THE ARC STOPPED BEING ALL-8x8. *** This was hardcoded to
                         // [ceil(TW/8), ceil(TH/8)] for every kernel, which was right while every kernel here
                         // was @workgroup_size(8,8,1) over a w-by-h picture. FACTOR_WGSL is a per-ELEMENT
                         // product with no 2D structure at all, declared @workgroup_size(64,1,1), and a [2,2]
                         // dispatch would have run 128 of its 256 invocations and left the rest of the output
                         // untouched -- on BOTH backends, so the comparison would have agreed about a buffer
                         // half of which nobody wrote.
                         workgroups: wg } };
    });
    // The two fragments: compiled on both backends inside a shell that CALLS them, so a fragment that stopped
    // compiling could not hide behind a splice site that never used it.
    const shell = (frag, body) => `${frag}
@group(0) @binding(0) var<storage,read_write> dst:array<f32>;
@compute @workgroup_size(1) fn main() { ${body} }`;
    out.push({ id: "temporalLock.LUMA_WGSL", from: "render/temporalLockWgsl.mjs", compileOnly: true,
        why: "a FUNCTION FRAGMENT, not a kernel: lumaOf() has no entry point and no bindings, so it is compiled on both backends inside a shell that calls it rather than dispatched",
        opts: { code: shell(LOCK.LUMA_WGSL, "dst[0] = lumaOf(vec3<f32>(0.2, 0.5, 0.9));"), compileOnly: true, outCount: 0 } });
    out.push({ id: "temporalReject.YCOCG_WGSL", from: "render/temporalRejectWgsl.mjs", compileOnly: true,
        why: "the other FUNCTION FRAGMENT: rgb2ycocg and its inverse, compiled on both backends inside a shell that calls BOTH -- the inverse is the half a splice site can leave unused, and an unused function is not evidence",
        opts: { code: shell(REJECT.YCOCG_WGSL, "dst[0] = ycocg2rgb(rgb2ycocg(vec3<f32>(0.2, 0.5, 0.9))).x;"), compileOnly: true, outCount: 0 } });
    return out;
}
