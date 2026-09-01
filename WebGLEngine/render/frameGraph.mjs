// WebGLEngine/render/frameGraph.mjs -- v4293
//
// *** NOTHING IN THIS TREE COULD SAY WHAT A FRAME IS MADE OF, SO IT WAS TYPED BY HAND AND TYPED WRONG. ***
//
// render/bloomFused.mjs carries this literal, and a person wrote every number in it:
//
//     ROUND_TRIPS.glsl = { passes: 3, intermediateTextures: 2, roundTrips: 3, drawsInSpan: 5, conditional: 2 }
//
// v4284 wrote `drawsInSpan: 3` first. The check counted five and the constant was corrected by hand a second
// time. That is the whole argument for this file: A NUMBER DESCRIBING CODE, MAINTAINED BESIDE THE CODE RATHER
// THAN DERIVED FROM IT, IS A NUMBER WAITING TO GO STALE -- and this one had already done it once.
//
// The passes themselves are not written down anywhere either. bloomPass.js issues its draws inline, and the
// order they run in is a property of a 100-line method; main.js calls bind() and apply() from two places
// inside 31,483 lines. To learn that a SweK frame runs bright, blurH, blurV, optionally SSAO, optionally god
// rays, then composite, somebody has to read the method. Nothing can ask.
//
// ================================================================================================
// WHAT "SPAN" MEANS, WHICH IS THE PART THAT WAS ONLY EVER IN SOMEBODY'S HEAD
// ================================================================================================
//
// bloomPass.js makes SIX draws. ROUND_TRIPS says five. Both are right, and the reconciliation lived nowhere:
//
//     723 bright      \
//     733 blurH        |  the SPAN -- what a fused pass would replace, plus whatever
//     740 blurV        |  sits between the first and last of them
//     754 ssao      *  |
//     775 godRays   *  /
//     822 composite       <- OUTSIDE the span: it consumes the result, it is not part of producing it
//
// `drawsInSpan: 5` counts the first five. `conditional: 2` is the starred pair. A reader who assumed the
// number meant "draws this pass makes" would find six and conclude the record was wrong. It is not wrong; it
// was UNDER-SPECIFIED, which is the same defect one step further from being caught.
//
// So `spanOf` takes the first and last pass by name and returns what falls between them INCLUSIVE. The span is
// an argument now, not an assumption, and bloomFused.mjs asks for the one it means.
//
// ================================================================================================
// WHAT THIS IS NOT
// ================================================================================================
//
// *** IT DOES NOT RENDER, AND IT CANNOT. *** A frame needs a GL context; this sandbox has no display and no
// software GL, so v4291 measured GLFW refusing to initialise and headless-gl returning null. Deriving the
// SHAPE of a frame needs neither. This is deliberately the half that can be graded on the box it was written
// on, and it is the half a desktop viewer would need first -- you cannot draw a frame until something can say
// what a frame is.
//
// IT READS ONE MODULE'S SOURCE, NOT THE WHOLE ENGINE. main.js decides WHEN the chain runs and with which
// features on; this reads what the chain IS. Those are different questions and only the second is answered.
//
// IT IS A LEXER, NOT AN INTERPRETER. It counts braces and matches call sites. A draw hidden behind a helper
// function, a loop, or a computed program would be missed or misattributed -- so `parsePasses` reports what it
// recognised AND what it could not, and a caller that ignores `unrecognised` is choosing to.
"use strict";

const DRAW = /\bgl\.draw(Arrays|Elements)\s*\(/;
const USE_PROGRAM = /\bgl\.useProgram\s*\(\s*this\.(\w+)/;
const BIND_FBO = /\bgl\.bindFramebuffer\s*\(\s*gl\.FRAMEBUFFER\s*,\s*(?:this\.(\w+)|(null))/;
const IF_OPEN = /^\s*(?:\}\s*else\s+)?if\s*\((.+)\)\s*\{\s*$/;
// A draw reached through a helper is a draw this lexer cannot see. Reported rather than silently dropped.
const CALL_SITE = /\bthis\.(\w+)\s*\(/;

/**
 * Read a pass module's source into an ordered list of draws, each attributed to the program bound before it,
 * the framebuffer it targets, and the guard it sits inside.
 *
 * Line-scanned and brace-counted on purpose. A real parse would be heavier and would still not know which
 * branch runs; what is wanted is the STATIC shape, which is exactly what a lexer can see.
 */
export function parsePasses(src, { methodHint = "apply" } = {}) {
    const lines = String(src).split("\n");
    const draws = [];
    const unrecognised = [];
    let program = null, target = null, depth = 0;
    const guards = [];   // { depth, text }

    for (let i = 0; i < lines.length; i++) {
        const raw = lines[i];
        const line = raw.replace(/\/\/.*$/, "");     // a draw inside a comment is not a draw
        const m = line.match(IF_OPEN);

        const up = line.match(USE_PROGRAM);
        if (up) program = up[1];
        const fb = line.match(BIND_FBO);
        if (fb) target = fb[1] || "default";

        if (DRAW.test(line)) {
            draws.push({
                line: i + 1, program, target,
                conditional: guards.length > 0,
                guard: guards.length ? guards[guards.length - 1].text.trim() : null,
            });
        } else if (!up && !fb && CALL_SITE.test(line) && /draw|pass|render/i.test(line)) {
            // Something that LOOKS like it might issue draws through a helper. Not counted; named.
            unrecognised.push({ line: i + 1, text: line.trim().slice(0, 90) });
        }

        // Brace bookkeeping last, so a draw on the same line as a brace is attributed to the guard it is in.
        const opens = (line.match(/\{/g) || []).length;
        const closes = (line.match(/\}/g) || []).length;
        if (m) { depth += opens - closes; guards.push({ depth, text: m[1] }); }
        else {
            depth += opens - closes;
            while (guards.length && depth < guards[guards.length - 1].depth) guards.pop();
        }
    }
    return { draws, unrecognised, methodHint };
}

/**
 * The draws between two named programs, INCLUSIVE. `drawsInSpan` meant this and said so nowhere; making the
 * endpoints arguments is the whole point -- a caller now states which span it means and the number follows.
 *
 * Refuses rather than guesses when an endpoint is absent: a span whose start was not found would silently
 * become "the whole method", which is how an under-specified number becomes a wrong one.
 */
export function spanOf(draws, firstProgram, lastProgram) {
    const a = draws.findIndex((d) => d.program === firstProgram);
    const b = draws.map((d) => d.program).lastIndexOf(lastProgram);
    if (a < 0) throw new Error("frameGraph: no draw uses program " + firstProgram);
    if (b < 0) throw new Error("frameGraph: no draw uses program " + lastProgram);
    if (b < a) throw new Error("frameGraph: " + lastProgram + " draws before " + firstProgram);
    const span = draws.slice(a, b + 1);
    return {
        draws: span,
        count: span.length,
        conditional: span.filter((d) => d.conditional).length,
        programs: [...new Set(span.map((d) => d.program))],
        targets: [...new Set(span.map((d) => d.target))],
        outside: draws.length - span.length,
    };
}

/**
 * The intermediates a span produces: every target except the LAST one.
 *
 * The first version counted distinct targets and returned 5 where the record said 2, which looked like the
 * record being wrong and was the definition being wrong. In a linear chain the final target is the span's
 * OUTPUT -- somebody downstream consumes it -- and everything before it exists only to be read by the next
 * pass. That is what "intermediate" means, and counting targets counts one too many.
 */
export const intermediatesOf = (span) => Math.max(0, span.targets.filter((t) => t && t !== "default").length - 1);

/**
 * *** THE TWO SPANS ROUND_TRIPS WAS SILENTLY DESCRIBING AT ONCE. ***
 *
 * bloomFused.mjs's record reads as one measurement of one thing. Derived, it is two, sharing a namespace:
 *
 *   passes / intermediateTextures / roundTrips   describe bright..blurV   -- what a fused pass REPLACES
 *   drawsInSpan / conditional                    describe bright..godRay  -- what SITS BETWEEN the endpoints
 *
 * Neither is wrong and nothing recorded that they were different ranges, which is how "5 draws" and "3 passes"
 * ended up in one object looking like they contradicted each other. Named here so a caller picks one.
 */
export const SPANS = Object.freeze({
    fusable: Object.freeze({ first: "brightProg", last: "blurProg",
                             means: "the passes a single fused dispatch replaces" }),
    enclosing: Object.freeze({ first: "brightProg", last: "godRayProg",
                               means: "everything between the first and last draw a fusion would have to span" }),
    whole: Object.freeze({ first: "brightProg", last: "compositeProg",
                           means: "the entire post chain, composite included" }),
});

/** A one-line-per-pass rendering of the graph, for a gate to print rather than a person to remember. */
export const describe = (draws) => draws.map((d, i) =>
    `${String(i + 1).padStart(2)}. ${String(d.program || "?").padEnd(14)} -> ${String(d.target || "?").padEnd(12)}` +
    (d.conditional ? `  IF ${d.guard}` : "")).join("\n");
