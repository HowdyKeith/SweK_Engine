// FILE: render/transitionSpec.mjs -- v4204
//
// THE GL TRANSITION SPEC v1, AS A PARSER AND A VALIDATOR. No shaders taken -- the CONTRACT is the thing worth
// having, and 80 transitions written against it are worth nothing without something that can check one.
//
// Spec and idea from gl-transitions/gl-transitions and gre/gl-transition-libs, both MIT with real LICENSE
// files (read this round, (c) 2017-present and (c) 2016-present respectively). The upstream validator uses a
// full GLSL tokenizer; this is a scanner, and section "WHAT THIS CANNOT DO" below says exactly where that
// costs something rather than leaving a reader to find out.
//
// *** THE CONTRACT IS FOUR NAMES AND ONE SIGNATURE, AND THAT IS THE WHOLE PORTABILITY STORY. *** A conforming
// file declares `vec4 transition(vec2 uv)` and may use, without declaring them:
//
//     progress          float, 0.0 -> 1.0
//     ratio             float, viewport width/height
//     getFromColor(uv)  vec4
//     getToColor(uv)    vec4
//
// The host supplies all four. That is why a transition is a dozen lines rather than a program: it never
// touches a sampler, never binds anything, and cannot know whether it is running over two videos, two DOM
// rasterisations or two framebuffers. render/transitionPass.js supplies them for this tree.
//
// *** THE SPEC STATES A LAW, AND A LAW IS A THING YOU CAN TEST. *** "When progress is 0.0, exclusively the
// `from` texture must be rendered. When progress is 1.0, exclusively the `to` texture must be rendered."
// Nothing in a GLSL compiler checks that. It is not a style rule -- a transition that fails it POPS at the
// start or the end of every play, which reads as a dropped frame and is one. evaluateEndpoints() below
// tests it numerically on the CPU, which is the only reason this module models transitions at all.
//
// *** AND getFromColor EXISTS SO THE SHADER CANNOT REACH THE TEXTURE. *** A transition doing its own
// texture2D() skips the host's ratio correction and its out-of-bounds policy, so it looks right on the square
// preview it was authored against and skews on a 16:9 one. The validator refuses a raw sampler for that
// reason and says so.
"use strict";

/** The contextual names the host provides. A conforming transition may use these without declaring them. */
export const PROVIDED = Object.freeze({
    uniforms: Object.freeze(["progress", "ratio"]),
    functions: Object.freeze(["getFromColor", "getToColor"]),
});

/**
 * Uniform types a transition parameter may have.
 *
 * *** sampler2D IS ON THIS LIST BECAUSE THE CORPUS PUT IT THERE. *** My first draft banned it outright,
 * reasoning that a transition reads through getFromColor/getToColor and therefore needs no sampler of its
 * own. Running the validator over the 100 published transitions rejected luma.glsl and displacement.glsl --
 * and luma.glsl is by gre, who wrote the spec. Both take a THIRD texture as a parameter (a luminance mask, a
 * displacement map) and still read from/to only through the provided functions. The prohibition is on
 * sampling the FROM AND TO textures directly, which is a different rule, and the one below now says so.
 */
export const PARAM_TYPES = Object.freeze(["bool", "int", "float", "vec2", "vec3", "vec4", "ivec2", "ivec3", "ivec4", "sampler2D"]);

/** Types with no literal default: the host supplies a texture, so "// = ..." is meaningless for them. */
export const UNDEFAULTABLE = Object.freeze(["sampler2D"]);

/** The one signature that makes a file a transition. */
export const ENTRY_POINT = "vec4 transition(vec2 uv)";

/** Strip // and /* *\/ comments, keeping newlines so line numbers survive. Not a tokenizer -- see the limits. */
export function stripComments(src) {
    let out = "", i = 0;
    while (i < src.length) {
        if (src[i] === "/" && src[i + 1] === "/") { while (i < src.length && src[i] !== "\n") i++; }
        else if (src[i] === "/" && src[i + 1] === "*") {
            i += 2;
            while (i < src.length && !(src[i] === "*" && src[i + 1] === "/")) { if (src[i] === "\n") out += "\n"; i++; }
            i += 2;
        } else { out += src[i]; i++; }
    }
    return out;
}

/**
 * Read the `// Author:` / `// License:` / `// Name:` header lines.
 *
 * These live in COMMENTS, which is why this reads the raw source and the uniform scan reads the stripped one.
 * A licence recorded in a comment is still the author's statement of terms, and dropping it while copying a
 * transition is how a file loses its provenance -- the failure world/reachedLicences.mjs exists about.
 */
export function parseMetadata(src) {
    const meta = {};
    for (const [key, re] of [["author", /^\s*\/\/\s*[Aa]uthor:\s*(.+?)\s*$/m],
                             ["license", /^\s*\/\/\s*[Ll]icense:\s*(.+?)\s*$/m],
                             ["name", /^\s*\/\/\s*[Nn]ame:\s*(.+?)\s*$/m]]) {
        const m = src.match(re);
        if (m) meta[key] = m[1];
    }
    return meta;
}

/**
 * Every `uniform` declaration, with its default if the author gave one.
 *
 * *** THE DEFAULT LIVES IN A COMMENT, WHICH IS THE SPEC'S ONE GENUINELY ODD DECISION AND ALSO A GOOD ONE. ***
 * `uniform float foo; // = 42.0` is valid GLSL that a compiler ignores and a host can read. The alternative
 * -- a sidecar JSON per transition -- is a second file to keep in sync, and the tree has been bitten by that
 * shape before. The cost is that the defaults are only as good as this scanner.
 *
 * Handles: one name per line, several names sharing a line, `// = v` and an inline block comment.
 */
export function parseParams(src) {
    const params = [];
    // *** THE BLOCK-COMMENT DEFAULT SITS BEFORE THE SEMICOLON, NOT AFTER, AND MY FIRST DRAFT ASSUMED AFTER. ***
    // burn.glsl is `uniform vec3 color /* = vec3(0.9, 0.4, 0.2) */;`. Matching only the trailing position let
    // the comment fall into the NAMES capture, and the comma-split then turned one real uniform into three
    // fictional ones called "color /* = vec3(0.9", "0.4" and "0.2) */". A parser that invents uniforms is
    // worse than one that misses them: the invented ones get reported as spec violations against the author.
    const re = /^[ \t]*uniform[ \t]+([A-Za-z][A-Za-z0-9_]*)[ \t]+([^;]+?)[ \t]*(?:\/\*[ \t]*=[ \t]*(.+?)[ \t]*\*\/[ \t]*)?;[ \t]*(?:\/\/[ \t]*=[ \t]*(.+?)[ \t]*)?$/gm;
    let m;
    while ((m = re.exec(src))) {
        const type = m[1];
        const dflt = m[3] !== undefined ? m[3] : (m[4] !== undefined ? m[4] : null);
        for (const raw of m[2].split(",")) {
            const name = raw.trim().replace(/\[[^\]]*\]$/, "");
            if (!name) continue;
            params.push({ name, type, default: dflt, array: /\[[^\]]*\]$/.test(raw.trim()) });
        }
    }
    return params;
}

/** Everything about a transition source: metadata, parameters, and whether it conforms. */
export function parseTransition(src) {
    const code = stripComments(src);
    return {
        meta: parseMetadata(src),
        params: parseParams(src),
        hasEntryPoint: hasEntryPoint(code),
        usesProvided: PROVIDED.functions.filter((f) => new RegExp(`\\b${f}\\s*\\(`).test(code))
            .concat(PROVIDED.uniforms.filter((u) => new RegExp(`\\b${u}\\b`).test(code))),
        problems: validateTransition(src),
    };
}

/**
 * `vec4 transition(vec2 <anything>)` FOLLOWED BY A BODY. The parameter's name is the author's choice.
 *
 * *** THE TRAILING BRACE IS NOT PEDANTRY -- WITHOUT IT A PROTOTYPE PASSES. *** `vec4 transition(vec2 uv);`
 * is a forward declaration: it satisfies every word of the spec's signature and there is nothing to run.
 * The first version of this function accepted it and validateTransition returned zero problems on a file
 * with no implementation, which is the worst kind of green.
 *
 * Whitespace-insensitive, newlines included -- a signature split across lines is found. I recorded the
 * opposite in LIMITS and section 6 of the gate, which tests each stated limit is REAL, caught me claiming
 * a limitation this module does not have.
 */
export function hasEntryPoint(code) {
    return /\bvec4\s+transition\s*\(\s*vec2\s+[A-Za-z_][A-Za-z0-9_]*\s*\)\s*\{/.test(code);
}

/** Everything wrong with a transition source. Empty means it conforms as far as a scanner can tell. */
export function validateTransition(src) {
    const p = [];
    if (typeof src !== "string" || !src.trim()) return ["empty source"];
    const code = stripComments(src);
    if (!hasEntryPoint(code)) p.push(`no entry point -- the spec requires exactly "${ENTRY_POINT}"`);
    // *** A TRANSITION MAY NOT SAMPLE A TEXTURE IT DID NOT DECLARE. *** That is the portable rule, and it is
    // narrower than the one I first wrote ("may not touch a texture at all"). The host owns ratio correction
    // and the out-of-bounds policy for FROM and TO; a shader reaching those directly bypasses both, looks
    // right on the square preview it was authored against and skews on a 16:9 one. But a transition taking
    // its OWN third texture -- a luma mask, a displacement map -- is squarely within the spec, and banning it
    // rejected two of the published transitions including one by the spec's own author.
    const declaredSamplers = new Set(parseParams(src).filter((x) => x.type === "sampler2D").map((x) => x.name));
    // *** AND A USER FUNCTION NAMED `texture` IS NOT A TEXTURE FETCH. *** FilmBurn.glsl defines
    // `vec4 texture(vec2 p)` as a local blur helper -- legal in GLSL ES 1.0, where the builtin is texture2D --
    // and my first draft flagged it for calling "texture(" at all. That is matching a NAME where the rule is
    // about a SHAPE: a fetch takes a sampler as its first argument, and this one takes a vec2.
    const definesOwnTexture = /\b(?:vec4|vec3|vec2|float)\s+texture\s*\(\s*vec[234]\b/.test(code);
    const fetches = [...code.matchAll(/\btexture(?:2D|Cube)?\s*\(\s*([A-Za-z_][A-Za-z0-9_]*)\s*,/g)].map((x) => x[1]);
    for (const sampler of new Set(fetches)) {
        if (declaredSamplers.has(sampler)) continue;
        if (definesOwnTexture && sampler === "texture") continue;
        p.push(`samples "${sampler}", which it never declared -- from and to are read through getFromColor/getToColor, ` +
               `and any other texture must be a declared sampler2D parameter`);
    }
    // Redeclaring a provided name shadows the host's and compiles, which is why nothing else would catch it.
    for (const u of PROVIDED.uniforms) {
        if (new RegExp(`\\buniform\\s+\\w+\\s+[^;]*\\b${u}\\b`).test(code)) {
            p.push(`redeclares "${u}", which the host already provides -- the host's value would be shadowed`);
        }
    }
    for (const f of PROVIDED.functions) {
        if (new RegExp(`\\bvec4\\s+${f}\\s*\\(`).test(code)) p.push(`redefines ${f}(), which the host already provides`);
    }
    if (!PROVIDED.functions.some((f) => new RegExp(`\\b${f}\\s*\\(`).test(code))) {
        p.push("reads neither getFromColor nor getToColor -- it cannot be a transition between two things");
    }
    for (const par of parseParams(src)) {
        if (!PARAM_TYPES.includes(par.type)) p.push(`uniform ${par.name}: type "${par.type}" is not a transition parameter type`);
        // A texture parameter has no literal default -- "// = <value>" cannot name an image. Requiring one
        // put luma.glsl and displacement.glsl in the wrong column for a reason that could never be fixed.
        if (par.default === null && !UNDEFAULTABLE.includes(par.type)) {
            p.push(`uniform ${par.name}: no default -- the spec wants "uniform ${par.type} ${par.name}; // = <value>"`);
        }
    }
    return p;
}

/**
 * Wrap a transition body in everything the spec says the host provides.
 *
 * *** THE RATIO CORRECTION IS THE HALF NOBODY REMEMBERS, AND IT IS WHY getFromColor IS A FUNCTION. *** uv is
 * always 0..1 in both axes, so a shape computed in uv space is stretched by the viewport. The spec's answer
 * is to hand the transition `ratio` and let IT decide; the host's job is only to sample honestly and to say
 * what happens outside 0..1. Both policies are here, in one place, rather than in 80 shaders.
 */
export function assemble(src, { precision = "highp", outOfBounds = "black" } = {}) {
    const oob = outOfBounds === "clamp"
        ? "uv = clamp(uv, 0.0, 1.0);"
        : "if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) return vec4(0.0);";
    return `precision ${precision} float;
varying vec2 vUv;
uniform sampler2D uFrom;
uniform sampler2D uTo;
uniform float progress;
uniform float ratio;

vec4 getFromColor(vec2 uv) { ${oob} return texture2D(uFrom, uv); }
vec4 getToColor(vec2 uv)   { ${oob} return texture2D(uTo, uv); }

${src}

void main() { gl_FragColor = transition(vUv); }
`;
}

/**
 * *** THE ENDPOINT LAW, TESTED NUMERICALLY. ***
 *
 * The spec says progress 0 must show exclusively `from` and progress 1 exclusively `to`. A GLSL compiler
 * cannot check that and neither can a scanner, so this evaluates a JS transition -- the same function the
 * shader implements -- over a grid and reports the worst deviation at each end.
 *
 * @param fn      (uv, ctx) => [r,g,b,a], where ctx has progress, ratio, getFromColor, getToColor
 * @returns { atZero, atOne, ok } worst absolute channel error at each endpoint
 */
export function evaluateEndpoints(fn, { ratio = 1, grid = 16, tolerance = 1e-6 } = {}) {
    // Two distinguishable constant images, so "showed the wrong one" is a large error and not a rounding one.
    const FROM = [1, 0, 0, 1], TO = [0, 0, 1, 1];
    const ctx = (progress) => ({ progress, ratio, getFromColor: () => FROM.slice(), getToColor: () => TO.slice() });
    const worst = (progress, expect) => {
        let m = 0;
        for (let j = 0; j < grid; j++) for (let i = 0; i < grid; i++) {
            const out = fn([(i + 0.5) / grid, (j + 0.5) / grid], ctx(progress));
            for (let c = 0; c < 4; c++) m = Math.max(m, Math.abs(out[c] - expect[c]));
        }
        return m;
    };
    const atZero = worst(0, FROM), atOne = worst(1, TO);
    return { atZero, atOne, ok: atZero <= tolerance && atOne <= tolerance, tolerance };
}

// *** WHAT THIS CANNOT DO, STATED RATHER THAN DISCOVERED. ***
//
// It is a SCANNER over text, not a GLSL parser, and three things follow that a reader should know before
// trusting a green result:
//
//   - A uniform declared inside a #if block is read as declared. Preprocessing is not evaluated.
//   - An entry point is recognised by its signature and the brace that follows. A body that is empty, or
//     that never returns on some path, still counts as an implementation.
//   - It cannot tell whether the GLSL COMPILES. Nothing here type-checks; a conforming file can still fail
//     glCompileShader, and render/transitionPass.js reports that separately.
//
// A fourth one I WROTE DOWN AND THEN MEASURED AS FALSE: "the signature must be on one line". It need not --
// \s matches newlines and a split signature is found. The gate's section 6 tests that each stated limit is
// real, and it caught that claim. An invented limitation is as misleading as a hidden one.
//
// The upstream gl-transition-utils uses a real tokenizer and does not have the first two limits. Taking it
// would mean taking a parser dependency into a tree that has none, to check a contract that is four names
// and one signature. The limits are the price of that, and they are written here so the price is visible.
export const LIMITS = Object.freeze([
    "preprocessor directives are not evaluated -- a uniform inside #if reads as declared",
    "an entry point is its signature plus a brace -- an empty body still counts as an implementation",
    "conformance is not compilation -- a conforming file can still fail to compile",
]);
