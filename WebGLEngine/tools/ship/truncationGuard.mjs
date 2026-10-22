// WebGLEngine/tools/ship/truncationGuard.mjs -- UNNUMBERED (the version is chosen at ship time).
//
// FINDS THE SHAPE OF THE v4895 D3D12 BUG IN WGSL SOURCE: a float that was computed by a RECIPROCAL, cut to an integer by u32() / i32() with no rounding.
//
// THE BUG: render/taaResolve.mjs (and the same line in render/snowGpu.mjs) wrote
//     fn dims() -> vec2f { return 1.0 / uniforms.invRes; }      ...      let d = dims();   let cx = clamp(x, 0, i32(d.x) - 1);   let o = u32((cy * i32(d.x) + cx) * 4);
// WGSL's u32() and i32() TRUNCATE toward zero. On a driver that divides exactly, 1.0 / (1.0 / 24.0) is 24.0 and the cut is harmless; D3D12's reciprocal gave 23.999998, the
// cut gave 23, the row stride was one short and every pixel landed in the wrong cell (worst difference 1.00e+6, the liveness sentinel in the cells nothing wrote). Nothing on the
// Linux box could see it, because the software rasteriser divides exactly. The repair is to ROUND the derived size (floor(x + 0.5)); this finds the lines that have not been.
//
// WHAT COUNTS (all of it per function body, so a name in one function does not taint another):
//   direct   u32(...) / i32(...) whose argument divides by or from a FLOAT RECIPROCAL: `1.0 / x`, `1 / x`, or a float literal on the numerator side of a `/`
//   via      u32(name...) / i32(name...) where `name` was bound in the same function by `let`/`var` from a reciprocal, or from a call to a function whose single `return` is one
//   WHAT DOES NOT: an argument wrapped in floor / round / ceil / trunc or carrying `+ 0.5`; a division of two integers (u32 / u32 is integer division, exact, and is not a float cut)
//
// NOT CLAIMED: dataflow in general. A float that reaches u32() through a struct field, a loop-carried variable or a texture read is not followed; a division by a uniform FIELD
// is not flagged unless the numerator is a float literal, because the field's type is not resolved here (u / u32 is integer division and flagging it would drown the real hits).
// This is a net for the one shape that bit, not a proof that no truncation anywhere is unsafe.
"use strict";

const SAFE = /\b(?:floor|round|ceil|trunc)\s*\(|\+\s*0\.5/;
// a division whose numerator is a float literal: 1.0 / x, 1 / x, 2.0 / x, 0.5 / x
const RECIP = /(?<![\w.])(?:\d+\.\d*|\.\d+|1)\s*\/(?!\/)/;

/** Split a source text into function bodies: [{ name, start, body }], start being the 0-based line the `fn` begins on. */
export function functionBodies(text) {
    const out = [];
    const re = /\bfn\s+(\w+)\s*\(/g;
    let m;
    while ((m = re.exec(text))) {
        const open = text.indexOf("{", m.index);
        if (open < 0) continue;
        let depth = 0, i = open;
        for (; i < text.length; i++) { const c = text[i]; if (c === "{") depth++; else if (c === "}") { depth--; if (depth === 0) break; } }
        out.push({ name: m[1], start: text.slice(0, m.index).split("\n").length - 1, bodyStart: text.slice(0, open).split("\n").length - 1, body: text.slice(open, i + 1), header: text.slice(m.index, open) });
        re.lastIndex = open + 1;
    }
    return out;
}

/** Strip // comments (WGSL, JS) so a note in a comment is not a hit. */
const noLineComments = (t) => t.split("\n").map((l) => l.replace(/(^|[^:"'])\/\/.*$/, "$1")).join("\n");

const CONV = /\b(u32|i32|vec[234][iu]|vec[234]<[iu]32>)\(/g;
const INT_BINDING = /^\s*(?:u32|i32|vec[234][iu]|vec[234]<[iu]32>)\(/;

/** The balanced argument text of the call whose "(" is at index `open` in `s`, and the index after its ")". */
function balanced(s, open) {
    let depth = 0;
    for (let i = open; i < s.length; i++) { const c = s[i]; if (c === "(") depth++; else if (c === ")") { depth--; if (depth === 0) return { arg: s.slice(open + 1, i), end: i + 1 }; } }
    return null;
}
/** Split an argument list on its top-level commas. */
function topLevelArgs(arg) {
    const out = []; let depth = 0, cur = "";
    for (const c of arg) { if (c === "(") depth++; else if (c === ")") depth--; if (c === "," && depth === 0) { out.push(cur); cur = ""; } else cur += c; }
    out.push(cur);
    return out;
}

/**
 * Every truncation of a reciprocal-derived float in a source text: [{ line, kind, name, fn, conv, text }].
 * The conversions are u32(), i32() AND the vector forms vec2i()/vec3u()/vec2<i32>() -- render/snowGpu.mjs cut the same size with `vec2i(dims())`, which the first draft of this
 * missed and a mutation of the real source found.
 */
export function findTruncations(text) {
    const src = noLineComments(String(text));
    const fns = functionBodies(src);
    // functions whose single return is a reciprocal: calling one gives a reciprocal-derived float
    const recipFns = new Set();
    for (const f of fns) {
        const r = f.body.match(/^\{\s*return\s+([^;]+);\s*\}$/);
        if (r && RECIP.test(r[1]) && !SAFE.test(r[1])) recipFns.add(f.name);
    }
    const callsRecip = (e) => [...recipFns].some((n) => new RegExp("\\b" + n + "\\s*\\(").test(e));
    const hits = [];
    for (const f of fns) {
        const tainted = new Set();
        for (const m of f.body.matchAll(/\b(?:let|var)\s+(\w+)\s*(?::\s*[\w<>]+)?\s*=\s*([^;]+);/g)) {
            const rhs = m[2];
            if (SAFE.test(rhs) || INT_BINDING.test(rhs)) continue;       // already rounded, or already cut (and reported at that binding)
            if (RECIP.test(rhs) || callsRecip(rhs)) tainted.add(m[1]);
        }
        const bodyLines = f.body.split("\n");
        bodyLines.forEach((l, k) => {
            CONV.lastIndex = 0;
            let c;
            while ((c = CONV.exec(l))) {
                const b = balanced(l, c.index + c[0].length - 1);
                if (!b) continue;
                for (const part of topLevelArgs(b.arg)) {
                    if (SAFE.test(part)) continue;
                    const id = (part.match(/^\s*(\w+)/) || [])[1];
                    let kind = null, name = null;
                    if (RECIP.test(part)) kind = "direct";
                    else if (id && tainted.has(id)) { kind = "via"; name = id; }
                    else if (id && recipFns.has(id) && new RegExp("^\\s*" + id + "\\s*\\(").test(part)) { kind = "call"; name = id; }
                    if (kind) { hits.push({ line: f.bodyStart + k + 1, kind, name, fn: f.name, conv: c[1], text: l.trim().slice(0, 160) }); break; }
                }
            }
        });
    }
    return hits;
}
