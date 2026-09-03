// WebGLEngine/tools/ship/shaderPairs.mjs -- v4414
//
// *** THE NUMBER v3274's IR TRIGGER ASKS FOR, AS OPPOSED TO THE ONE IT COUNTS. ***
//
// shaderCensus-selfcheck.mjs has held since v3274 that a hand-written shader pair beats an intermediate
// representation "while few files carry both languages -- if this count climbs toward twenty the arithmetic
// inverts, and THAT is when to re-open llvm-tutorial-book's three-stage shape: parse, lower to an IR, emit per
// target". It said 3 when filed. It says 14 now, and main's v4380 found the red register still recording 4 --
// then deferred the question outright: "whether the arithmetic has inverted is a decision about the engine's
// shape and belongs to a round of its own".
//
// ---- THE TRIGGER COUNTS CO-OCCURRENCE, AND THE DECISION NEEDS DUPLICATION ----------------------------------
//
// `both` is "this file's text contains WGSL markers AND GLSL markers". That is not "this file writes one
// computation twice". A file can hold a WGSL compute pass and a GLSL raster pass that share nothing --
// render/bloomFused.mjs exists precisely because WebGPU can fuse what WebGL2 cannot, so its two halves are
// DIFFERENT ALGORITHMS and no IR could emit both from one source. An IR replaces DUPLICATION. Counting
// co-occurrence and deciding about duplication is a category error, and it is the one this module fixes.
//
// *** AND THE POPULATION INCLUDES THE MACHINERY THAT WOULD BE THE IR. *** render/tslSource.mjs carries eleven
// GLSL markers because it EMITS GLSL; render/fleetTsl.mjs the same. An emitter necessarily contains text in
// every language it emits, so BUILDING THE IR RAISES THE COUNT THE TRIGGER READS. The instrument fires harder
// the more the problem is solved, which is not a threshold anyone should act on.
//
// ---- THE INSTRUMENT HERE, AND WHY IT NEEDS NO CRUDE SPLIT --------------------------------------------------
//
// shaderCensus.pairShape compares NUMERIC CONSTANTS either side of "the first WGSL entry point", and says so:
// "Split on the first WGSL entry point: crude, and STATED AS CRUDE. A file interleaving both languages would
// defeat it". This compares DECLARED FUNCTION NAMES instead, and needs no split at all -- WGSL declares
// `fn name(` and GLSL declares `<type> name(...) {` with a GLSL type keyword, and neither syntax appears in
// the other language. So both halves can be read out of the whole file with no boundary to get wrong.
//
// A NAME IS A CLAIM ABOUT WHAT THE CODE COMPUTES. Two halves that both declare `fbm` and `vnoise` are two
// spellings of one function; two halves sharing only `main` share an entry-point convention and nothing else.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { shaderCensus } from "./shaderCensus.mjs";

/** GLSL's declarable return types. WGSL uses `fn`, so these two patterns cannot collide. */
const GLSL_TYPES = "void|float|int|uint|bool|vec2|vec3|vec4|ivec2|ivec3|ivec4|uvec2|uvec3|uvec4|mat2|mat3|mat4";

export const wgslFunctions = (src) =>
    [...new Set([...src.matchAll(/\bfn\s+([A-Za-z_]\w*)\s*\(/g)].map((m) => m[1]))];
export const glslFunctions = (src) =>
    [...new Set([...src.matchAll(new RegExp("\\b(?:" + GLSL_TYPES + ")\\s+([A-Za-z_]\\w*)\\s*\\([^;)]*\\)\\s*\\{", "g"))].map((m) => m[1]))];

/**
 * Normalise a name across the two languages: case, this tree's swk_ prefix, and the wgsl/glsl/gpu suffixes a
 * twin is often given. Deliberately small -- an aggressive normaliser would manufacture matches, which is the
 * failure mode that would make this whole round wrong in the direction it wants to go.
 */
export const normaliseName = (n) => n.toLowerCase().replace(/^(swk_|gl_)/, "").replace(/(wgsl|glsl|gpu)$/, "");

/**
 * Names that mean "an entry point" rather than "a computation". A shared `main` is a shared CONVENTION: every
 * shader in both languages has one, so counting it as duplication would find duplication everywhere.
 */
export const GENERIC = Object.freeze(new Set(["main", "vs", "fs", "vert", "frag"]));

/** DUPLICATION when two or more non-generic names appear on both sides; the threshold is stated, not tuned. */
export const DUPLICATION_MIN = 2;

export function classifyPairs(root) {
    const rows = shaderCensus(root).both.map((rel) => {
        const src = fs.readFileSync(path.join(root, rel), "utf8");
        const g = glslFunctions(src).map(normaliseName);
        const w = wgslFunctions(src).map(normaliseName);
        const shared = [...new Set(g.filter((x) => w.includes(x)))];
        const real = shared.filter((x) => !GENERIC.has(x));
        return { file: rel, glsl: g.length, wgsl: w.length, shared, real,
                 verdict: real.length >= DUPLICATION_MIN ? "DUPLICATION"
                        : shared.length > 0 ? "CONVENTION" : "DISJOINT" };
    });
    return {
        rows,
        duplication: rows.filter((r) => r.verdict === "DUPLICATION"),
        convention: rows.filter((r) => r.verdict === "CONVENTION"),
        disjoint: rows.filter((r) => r.verdict === "DISJOINT"),
    };
}

/**
 * The modules that make the tree's author-once path, so the round can say which of the co-occurring files are
 * the ANSWER rather than the question. Named explicitly rather than pattern-matched: "a file with Tsl in its
 * name" would sweep in anything, and this list is short enough to be read.
 */
export const AUTHOR_ONCE = Object.freeze(["render/tslSource.mjs", "render/fleetTsl.mjs"]);
/** Files whose subject is shader TEXT -- a corpus, a spec checker, a variant table. Not shaders. */
export const ABOUT_SHADERS = Object.freeze(["render/wgslSpec.mjs", "tools/ship/wgslCorpus.mjs",
                                            "tools/roundhouse/magmapVariants.mjs"]);
