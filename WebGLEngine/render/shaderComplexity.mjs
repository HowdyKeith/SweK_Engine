// WebGLEngine/render/shaderComplexity.mjs -- v4299 (Level 11)
//
// SHADER COMPLEXITY AS AN ENCODED SCALE. DERIVE THE ORDERING, NEVER TYPE IT.
//
// Every ordering of shaders by cost in this tree was TYPED: ai/AutoQualityController.js declares
// `TIER_ORDER = ["fast", "balanced", "quality"]  // ascending difficulty`, and a LOD ladder is conventionally an
// array whose index IS the rank. A typed order is a claim about cost that nobody measures, and it stays true
// exactly until somebody edits one of the shaders it ranks. This module reads the shader and produces the
// number the ordering should have been derived from.
//
// ---- THE MODEL, STATED SO IT CAN BE ARGUED WITH -------------------------------------------------------------
//
// The score is a static estimate of per-invocation work: each operation class has a weight, and everything
// inside a loop is multiplied by the loop's trip count (the literal bound when the header has one, and an
// assumed UNKNOWN_TRIPS when it does not -- an unbounded loop is expensive by assumption, not free by
// ignorance). Loops nest multiplicatively. The weights are relative, not milliseconds: a texture sample is
// counted as sixteen ALU ops, a transcendental as eight, a branch as two. Those are the textbook ratios for
// a GPU and they are WRONG for any particular GPU, which is why the score is never shown as a number a user
// would read -- it is ENCODED onto a coarse log2 scale (class 0, 1, 2, ...) where two shaders differing by
// less than a doubling land in the same class. A scale that claims precision it does not have is a typed
// ordering with extra steps.
//
// It reads WGSL and GLSL with one scanner, because the point is comparing a pair across languages: the
// tree's signature defect is two declarations of one thing that nobody compares, and a GLSL/WGSL pair
// landing in different classes is that defect showing up as cost.
"use strict";

/** Relative weights, per operation. Exported so a gate can state them back and a reader can dispute one. */
export const WEIGHTS = Object.freeze({
    alu: 1, branch: 2, derivative: 4, transcendental: 8, atomic: 8, sample: 16, barrier: 16,
});
/** The trip count assumed for a loop whose bound is not a literal in its header. */
export const UNKNOWN_TRIPS = 8;

const TRANSCENDENTAL = /\b(sin|cos|tan|asin|acos|atan|atan2|sinh|cosh|tanh|exp|exp2|log|log2|pow|sqrt|inverseSqrt|inversesqrt|normalize|length|distance)\s*\(/g;
const SAMPLE = /\b(textureSample\w*|textureLoad|textureGather\w*|texture|texture2D|texture2DLod|textureLod|textureGrad|texelFetch|textureProj)\s*\(/g;
const DERIVATIVE = /\b(dpdx|dpdy|fwidth|dpdxCoarse|dpdyCoarse|dpdxFine|dpdyFine|dFdx|dFdy)\s*\(/g;
const BRANCH = /\b(if|else\s+if|switch|select|mix|step|smoothstep|clamp)\s*\(?/g;
const ATOMIC = /\batomic\w*\s*\(|\batomic(Add|Sub|Max|Min|And|Or|Xor|Exchange|CompSwap|Counter)\b/g;
const BARRIER = /\b(workgroupBarrier|storageBarrier|textureBarrier|barrier|memoryBarrier\w*)\s*\(/g;
const ALU = /\+\+|--|[-+*\/%]=|-(?!>)|[+*\/%]|\b(dot|cross|abs|floor|ceil|fract|min|max|sign|round|trunc|fma|mad|saturate|reflect|refract|faceForward|faceforward|transpose|determinant|inverse)\s*\(/g;
const LOOP_HEAD = /\b(for|while|loop|do)\b/g;

/** Strip line comments, block comments and string literals so prose never counts as work. */
export function stripComments(src) {
    return String(src).replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ").replace(/"(?:[^"\\]|\\.)*"/g, '""');
}

const count = (text, re) => { re.lastIndex = 0; let n = 0; while (re.exec(text)) n++; return n; };

/** Find the `{ ... }` block that opens at or after `from`; returns [openIndex, closeIndex] or null. */
function blockAfter(text, from) {
    const open = text.indexOf("{", from); if (open < 0) return null;
    let depth = 0;
    for (let i = open; i < text.length; i++) {
        const ch = text[i];
        if (ch === "{") depth++;
        else if (ch === "}") { depth--; if (depth === 0) return [open, i]; }
    }
    return null;
}

/**
 * The trip count a loop header states, or UNKNOWN_TRIPS. Reads `i < N`, `i <= N`, `i != N` with a literal N and
 * a literal start (`= 0` or `= 0u`), in both `for (var i = 0u; i < 6u; i++)` and `for (int i = 0; i < 6; ++i)`.
 * Anything else -- a uniform bound, a `while`, a `loop` with a break -- is UNKNOWN by design.
 */
export function tripCount(header) {
    const m = /=\s*(\d+)u?\s*;\s*\w+\s*(<=?|!=)\s*(\d+)/.exec(header);
    if (!m) return { trips: UNKNOWN_TRIPS, literal: false };
    const start = Number(m[1]), bound = Number(m[3]);
    const trips = Math.max(0, m[2] === "<=" ? bound - start + 1 : bound - start);
    return { trips, literal: true };
}

/**
 * Score a block of code: loops are found, their bodies scored recursively and multiplied by the trip count,
 * then removed; what remains is counted flat. Returns the counts as well as the score, so a reader can see
 * WHAT was expensive rather than only that something was.
 */
export function scoreBlock(text, depth = 0) {
    const counts = { alu: 0, branch: 0, derivative: 0, transcendental: 0, atomic: 0, sample: 0, barrier: 0, loops: 0, maxLoopDepth: depth, unknownLoops: 0 };
    let score = 0, rest = "";
    let cursor = 0;
    LOOP_HEAD.lastIndex = 0;
    for (;;) {
        LOOP_HEAD.lastIndex = cursor;
        const m = LOOP_HEAD.exec(text);
        if (!m) { rest += text.slice(cursor); break; }
        // A word that happens to be a loop keyword in an identifier ("format", "floor") is excluded by \b; a
        // keyword inside a type or name like `forward` is too. What remains is a real loop or a `do` block.
        const blk = blockAfter(text, m.index);
        if (!blk) { rest += text.slice(cursor, m.index + m[0].length); cursor = m.index + m[0].length; continue; }
        const header = text.slice(m.index, blk[0]);
        const isDo = m[1] === "do";
        const tc = (m[1] === "for") ? tripCount(header) : { trips: UNKNOWN_TRIPS, literal: false };
        const inner = scoreBlock(text.slice(blk[0] + 1, blk[1]), depth + 1);
        rest += text.slice(cursor, m.index) + " " + header.replace(/\bfor\b|\bwhile\b|\bloop\b|\bdo\b/g, " ") + " ";
        counts.loops += 1 + inner.counts.loops;
        counts.unknownLoops += (tc.literal ? 0 : 1) + inner.counts.unknownLoops;
        counts.maxLoopDepth = Math.max(counts.maxLoopDepth, inner.counts.maxLoopDepth);
        for (const k of ["alu", "branch", "derivative", "transcendental", "atomic", "sample", "barrier"]) counts[k] += inner.counts[k] * tc.trips;
        score += inner.score * tc.trips;
        cursor = blk[1] + 1;
        // `do { } while (cond);` -- the trailing condition is flat code and stays in `rest`.
        if (isDo) { /* nothing extra: the while(...) after the block has no body */ }
    }
    const flat = {
        sample: count(rest, SAMPLE), transcendental: count(rest, TRANSCENDENTAL), derivative: count(rest, DERIVATIVE),
        branch: count(rest, BRANCH), atomic: count(rest, ATOMIC), barrier: count(rest, BARRIER), alu: count(rest, ALU),
    };
    for (const k of Object.keys(flat)) { counts[k] += flat[k]; score += flat[k] * WEIGHTS[k]; }
    return { score, counts };
}

/** The encoded scale: class = floor(log2(1 + score)). Two shaders within a doubling share a class. */
export function classOf(score) { return Math.floor(Math.log2(1 + Math.max(0, score))); }

/**
 * Complexity of one shader (WGSL or GLSL; the scanner does not care which). `entry` restricts the scan to one
 * entry point's body when the module holds several -- a vs/fs pair in one WGSL string scores its fragment
 * stage when asked for "fs", and the whole module otherwise.
 */
/** Every function the module defines: name -> body text. WGSL `fn name(` and GLSL `type name(` both. */
export function functionBodies(code) {
    const out = {};
    const re = /\b(?:fn|void|float|int|uint|bool|vec[234]|ivec[234]|uvec[234]|mat[234](?:x[234])?)\s+([A-Za-z_]\w*)\s*\(/g;
    let m;
    while ((m = re.exec(code))) {
        const blk = blockAfter(code, m.index);
        if (!blk) continue;
        // The header must not contain a `;` before the block, or this is a declaration / variable, not a function.
        if (code.slice(m.index, blk[0]).includes(";")) continue;
        out[m[1]] = code.slice(blk[0] + 1, blk[1]);
    }
    return out;
}

/**
 * Complexity of one shader (WGSL or GLSL; the scanner does not care which). `entry` restricts the scan to one
 * entry point AND EVERYTHING IT CALLS, transitively, each callee counted once -- a vs/fs pair in one WGSL string
 * scores its fragment stage and the helpers that stage reaches when asked for "fs", and the whole module
 * otherwise. A helper called from inside a loop is counted once, not per trip: the scanner follows calls, it
 * does not inline them, and that is stated here rather than hidden in a number.
 */
export function complexityOf(src, { entry = null } = {}) {
    let code = stripComments(src);
    let reached = null;
    if (entry) {
        const bodies = functionBodies(code);
        if (bodies[entry] != null) {
            const seen = new Set([entry]), queue = [entry]; const parts = [];
            while (queue.length) {
                const name = queue.shift(), body = bodies[name]; parts.push(body);
                const call = /\b([A-Za-z_]\w*)\s*\(/g; let c;
                while ((c = call.exec(body))) if (bodies[c[1]] != null && !seen.has(c[1])) { seen.add(c[1]); queue.push(c[1]); }
            }
            code = parts.join("\n"); reached = [...seen];
        }
    }
    const r = scoreBlock(code);
    return { score: r.score, class: classOf(r.score), counts: r.counts, chars: code.length, reached };
}

/**
 * Order things by derived complexity, MOST EXPENSIVE FIRST, with ties broken by name so the result is a total
 * order that does not depend on the input order. `sourceOf(item)` returns the shader text (or null for an
 * item with no shader, which ranks as class 0). Returns a NEW array of { item, score, class, rank }.
 *
 * This is the function a ladder calls instead of typing its order. Feed it the same items in any order and
 * the ranks come back the same -- the gate proves that by shuffling.
 */
export function orderByComplexity(items, sourceOf, nameOf = (x, i) => String(i)) {
    const scored = items.map((item, i) => { const s = sourceOf(item, i); const c = s ? complexityOf(s) : { score: 0, class: 0, counts: null };
        return { item, index: i, name: nameOf(item, i), score: c.score, class: c.class, counts: c.counts }; });
    scored.sort((a, b) => (b.score - a.score) || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    return scored.map((s, rank) => ({ ...s, rank }));
}

/** A one-line rendering for logs and gates: "C7 (score 131: 3 samples, 2 transcendentals, 1 loop)". */
export function describe(c) {
    const k = c.counts || {};
    const bits = [];
    if (k.sample) bits.push(`${k.sample} sample${k.sample === 1 ? "" : "s"}`);
    if (k.transcendental) bits.push(`${k.transcendental} transcendental${k.transcendental === 1 ? "" : "s"}`);
    if (k.loops) bits.push(`${k.loops} loop${k.loops === 1 ? "" : "s"}${k.unknownLoops ? ` (${k.unknownLoops} unbounded)` : ""}`);
    if (k.branch) bits.push(`${k.branch} branch${k.branch === 1 ? "" : "es"}`);
    if (k.atomic) bits.push(`${k.atomic} atomic${k.atomic === 1 ? "" : "s"}`);
    if (k.barrier) bits.push(`${k.barrier} barrier${k.barrier === 1 ? "" : "s"}`);
    return `C${c.class} (score ${c.score}${bits.length ? ": " + bits.join(", ") : ""})`;
}
