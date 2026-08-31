// WebGLEngine/render/effectMerge.mjs -- v4236
//
// MERGE A RUN OF FULLSCREEN EFFECTS INTO ONE SHADER, AND REFUSE THE ONES THAT CANNOT BE MERGED.
//
// The idea is pmndrs/postprocessing's EffectPass (Zlib; its own code, derived from three.js under MIT). What
// is taken is the ARGUMENT -- that chaining fullscreen effects pays a framebuffer round trip per effect for
// no reason when the effects are pure colour transforms -- and not the code, which is a three.js binding.
//
// *** THE BACKLOG ITEM SAID "TWELVE PASSES, TWELVE ROUND TRIPS" AND THAT WAS NOT ESTABLISHED, SO IT WAS
// MEASURED FIRST -- ON THE REAL PAGE, THROUGH THE TREE'S OWN RECORDER. *** render/glCapture.mjs (v4227) was
// built to capture a context a PAGE made rather than one a gate made, and this is its first real consumer:
// index.html booted headless with installCapture() injected ahead of main.js, six seconds to let program
// compilation finish, then a five-second steady-state window. What that says:
//
//     162 rAF callbacks in 5 s, and only 18 render cycles -- the loop runs far more often than it draws
//     6 fullscreen draws per render cycle, 5 of them drawArrays(count 3) and ONE drawArrays(count 6)
//     16 bindFramebuffer per cycle for those 6 draws -- 2.7 binds per draw
//     bindTexture repeated with identical arguments 5 times running, over and over
//
// So the honest picture is SIX fullscreen draws a frame, not twelve, and the ceiling on what any merge could
// save is five draws. *** AND THE FULLSCREEN-TRIANGLE TRICK IS ALREADY IN USE FOR FIVE OF THE SIX. *** The
// one count-6 draw is a quad, paying for the duplicated fragments along its diagonal that the other five
// avoid. That is a smaller finding than the backlog item expected and it is a real one.
//
// *** CORRECTED AT v4241, AND ALL THREE PARTS OF THAT PARAGRAPH ARE WRONG. *** The classifier above counted
// any drawArrays of six vertices or fewer as "fullscreen-ish" and had no way to say WHICH FILE was calling --
// a program slot cannot be mapped back to a source file, and glCapture's byte budget drops the shader sources
// that might otherwise identify a pass. tools/ship/postChain-selfcheck.mjs wraps drawArrays on the real page
// and reads the CALL STACK instead, which names a file and a line. What it finds:
//
//   * The five triangle draws are not five effects. They are FIVE CALL SITES INSIDE bloomPass.js -- one
//     pass's downsample and upsample ladder, called from one place in main.js.
//   * Which is the single case the taxonomy below FORBIDS merging: bloom is OPAQUE.
//   * The sixth draw is gpu/VoxelMemoryGPU.js, a GPGPU decay step over a square framebuffer with depth off.
//     It was never in the post chain. It WAS a real fullscreen quad, and v4241 converted it to a triangle
//     and proved the result byte-identical.
//   * crtPass, cameraEffectsPass, swiftShaderPass, transitionPass and phosphorPass draw NOTHING at boot,
//     and SSAO is disabled. They are opt-in.
//
// *** SO effectMerge HAS NO CALLER BECAUSE NOTHING MERGEABLE IS RUNNING, NOT BECAUSE NOBODY WIRED IT. *** The
// machinery is right and the default scene has nothing for it to bite on. That is a different problem from
// the one the backlog item described, and naming it correctly is worth more than the wiring would have been.
//
// ---- THE TAXONOMY, WHICH IS THE WHOLE OF THE CORRECTNESS ARGUMENT ------------------------------------------
//
// An effect can be merged with its neighbours only if what it needs is a COLOUR. Three kinds:
//
//   COLOUR      reads the incoming vec4 and nothing else. Mergeable ANYWHERE in a run.
//   SAMPLING    reads the source texture at a uv it computes -- badTvPass's fract(p.x + offset) is one.
//               *** MERGEABLE ONLY AS THE FIRST EFFECT OF A RUN. *** After merging there is no texture
//               holding the previous effect's output to sample: there is a vec4 in a register. A sampling
//               effect placed second would silently read the ORIGINAL image at its offset, which compiles,
//               runs, and is a different picture. This is the trap the whole file exists to enforce.
//   OPAQUE      needs the full previous output as a texture -- a downsample chain, a feedback buffer, a
//               separable blur. bloomPass is this. NEVER merged; it keeps its own passes.
//
// The kind is DERIVED FROM THE SOURCE, not declared by the caller, because a caller that mislabels a
// sampling effect as colour gets a wrong picture and no error. classify() below reads the body.
//
// ---- AND MERGING IS NOT BIT-IDENTICAL TO CHAINING, WHICH IS A FINDING AND NOT A DEFECT ----------------------
//
// A chain writes its intermediate into a framebuffer. If that framebuffer is RGBA8 -- and in this tree they
// are -- the intermediate is not merely rounded on the way through. *** IT IS CLAMPED, AND I EXPECTED
// ROUNDING AND BOUNDED THE CHECK AT FOUR LEVELS AND IT MEASURED SIXTY-SIX. *** Take tear, then an exposure of
// 1.35, then a vignette that scales back down. In float the overshoot above 1.0 survives the exposure and the
// vignette brings it home. Through an 8-bit buffer the overshoot is GONE, and nothing downstream can recover
// it: those are lost highlights, not a last-digit difference.
//
// The control is what turns that into a fact rather than a story: run the same chain at exposure 0.8, where
// nothing ever exceeds 1.0, and the gap collapses from 66 levels to 1. So the eight bits are worth a level
// and the CLAMP is worth the other sixty-five.
//
// *** WHICH MEANS THE REASON TO MERGE IS NOT ONLY THE DRAW CALL. *** A merged run keeps the whole chain in a
// float register, so it is the arrangement in which an effect may legitimately overshoot and be brought back.
// Against a float chain the merge agrees to 1 level of 255; against the 8-bit chain it deliberately does not,
// and asserting bit-equality there would be asserting that the merge faithfully reproduces a defect.
"use strict";

/** GLSL ES 3.00 preamble every merged program gets. The vertex stage is a single fullscreen TRIANGLE. */
export const VERT = `#version 300 es
precision highp float;
out vec2 vUv;
void main() {
    // three vertices, no buffer: gl_VertexID 0,1,2 -> (-1,-1) (3,-1) (-1,3). The triangle overhangs the
    // viewport on two sides, so the visible area is covered by ONE primitive with no diagonal seam and no
    // fragments rasterised twice. Five of the six post draws measured on the real page already do this.
    vec2 p = vec2((gl_VertexID == 1) ? 3.0 : -1.0, (gl_VertexID == 2) ? 3.0 : -1.0);
    vUv = p * 0.5 + 0.5;
    gl_Position = vec4(p, 0.0, 1.0);
}`;

export const COLOUR = "colour", SAMPLING = "sampling", OPAQUE = "opaque";

/**
 * What kind of effect is this, read off its own body?
 *
 * An effect is a function `vec4 apply(vec4 c, vec2 uv, sampler2D tex)`. If the body never mentions the
 * sampler it is a COLOUR effect. If it does, it is SAMPLING. An effect may declare itself OPAQUE, which is
 * the one direction a caller is allowed to override in -- saying "do not merge me" is always safe, saying
 * "merge me" is not.
 *
 * *** THE SAMPLER IS FOUND BY ITS PARAMETER NAME, AND COMMENTS AND STRINGS ARE STRIPPED FIRST. *** A comment
 * that says "we do not sample tex here" contains the word tex, and a classifier that read raw source would
 * call that effect SAMPLING and refuse to merge it. That is the commentFalsePass shape this tree has caught
 * in three other gates.
 */
export function classify(effect) {
    if (effect.opaque) return OPAQUE;
    const body = stripComments(String(effect.glsl || ""));
    const sampler = effect.samplerParam || "tex";
    const used = new RegExp("(^|[^A-Za-z0-9_])" + sampler + "([^A-Za-z0-9_]|$)").test(body);
    return used ? SAMPLING : COLOUR;
}

/** Comments only -- GLSL has no string literals, so there is nothing else to protect. */
export function stripComments(src) {
    return src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");
}

/**
 * Split a chain into the fewest runs that can each become one draw.
 *
 * A run starts fresh; a SAMPLING effect may open one but never join one already carrying an effect; an OPAQUE
 * effect is a run of its own and breaks the chain on both sides.
 *
 * @returns {{effects:Object[],kind:string}[]} one entry per DRAW the plan needs
 */
export function planRuns(effects) {
    const runs = [];
    let cur = null;
    for (const e of effects) {
        const k = classify(e);
        if (k === OPAQUE) { cur = null; runs.push({ effects: [e], kind: OPAQUE }); continue; }
        if (k === SAMPLING) {
            // may LEAD a run, never join one
            cur = { effects: [e], kind: SAMPLING };
            runs.push(cur);
            continue;
        }
        if (!cur) { cur = { effects: [e], kind: COLOUR }; runs.push(cur); }
        else cur.effects.push(e);
    }
    return runs;
}

/** How many draws the chain costs unmerged, and merged. The number the whole idea rests on. */
export function planCost(effects) {
    const runs = planRuns(effects);
    return { chained: effects.length, merged: runs.length, saved: effects.length - runs.length, runs };
}

const uniqName = (e, i) => "e" + i + "_" + String(e.name || "fx").replace(/[^A-Za-z0-9_]/g, "");

/**
 * Build one fragment shader for a run.
 *
 * Uniform names are PREFIXED per effect. Two effects that both call their knob `uAmount` are not a conflict to
 * be resolved by whoever declares last -- they are two knobs, and the caller sets them through the returned
 * map rather than by guessing the mangled name.
 */
export function mergeRun(run, opts = {}) {
    const effects = run.effects;
    if (run.kind === OPAQUE) throw new Error("mergeRun: an opaque effect is not merged, it keeps its own pass");
    const parts = [], uniforms = {}, decls = [];
    effects.forEach((e, i) => {
        const pfx = uniqName(e, i);
        const map = {};
        for (const [knob, uni] of Object.entries(e.uniforms || {})) {
            const mangled = pfx + "_" + uni;
            map[knob] = mangled;
            decls.push("uniform " + (e.types && e.types[knob] ? e.types[knob] : "float") + " " + mangled + ";");
        }
        uniforms[e.name] = map;
        let body = String(e.glsl || "");
        // Rename this effect's uniform references to the prefixed ones. The sort is longest-first, and that is
        // a GUARD rather than the thing that makes it work: the rewrite is anchored on both sides with
        // [^A-Za-z0-9_], so the rule for uAmount cannot reach into uAmount2 whatever order they run in.
        // Reversing the sort changes no number in the gate, which is exactly what a defensive line looks like.
        const names = Object.values(e.uniforms || {}).sort((a, b) => b.length - a.length);
        for (const uni of names) {
            body = body.replace(new RegExp("(^|[^A-Za-z0-9_])" + uni + "([^A-Za-z0-9_]|$)", "g"),
                                (m, a, b) => a + pfx + "_" + uni + b);
        }
        parts.push("vec4 " + pfx + "_apply(vec4 c, vec2 uv, sampler2D tex) {\n" + body + "\n}");
    });
    const calls = effects.map((e, i) => "    c = " + uniqName(e, i) + "_apply(c, vUv, uTex);").join("\n");
    const frag = "#version 300 es\nprecision highp float;\n" +
        "uniform sampler2D uTex;\nuniform vec2 uSize;\n" + decls.join("\n") + "\n" +
        (opts.helpers || "") + "\n" +
        parts.join("\n\n") + "\n\n" +
        "in vec2 vUv;\nout vec4 fragColor;\nvoid main() {\n    vec4 c = texture(uTex, vUv);\n" +
        calls + "\n    fragColor = c;\n}";
    return { frag, uniforms, names: effects.map((e) => e.name) };
}

/** The whole plan: one merged program per run, opaque effects passed through untouched. */
export function mergeChain(effects, opts = {}) {
    return planRuns(effects).map((run) =>
        run.kind === OPAQUE ? { kind: OPAQUE, effect: run.effects[0] }
                            : { kind: run.kind, ...mergeRun(run, opts) });
}

/** The unmerged form of one effect, for the chained comparison the gate needs. */
export function soloFrag(effect, opts = {}) {
    return mergeRun({ effects: [effect], kind: classify(effect) }, opts).frag;
}
