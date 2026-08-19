// WebGLEngine/tools/ship/moduleRefs.mjs -- v3450
//
// *** ONE DEFINITION OF WHAT REFERENCES WHAT, AND THE WHOLE POINT IS THAT A REFERENCE AND A MENTION ARE
// DIFFERENT THINGS. ***
//
// v3449 proved that the orphan census could not tell them apart: it decided whether a module was dead with a
// substring match on the basename over raw file text, so `lib/derivedCache.js` read as CONSUMED because main.js
// names it INSIDE THE ENGINE_VERSION CHANGELOG STRING. The version marker extended every round was suppressing
// the census -- the gate got quieter the more the project documented itself. 164 modules are held off it by a
// sentence.
//
// THIS FILE IS THE INSTRUMENT THAT ROUND SAID MUST COME FIRST, AND IT IS BUILT AGAINST A FIXTURE RATHER THAN
// AGAINST THE TREE. The first attempt at it moved the actionable count 22 -> 97 -> 228 as it learned one route
// at a time, and a number that moves that far under its own author is not a measurement. So every route below
// is proven on a SYNTHETIC TREE WHOSE ANSWER IS KNOWN BEFORE the real one is scanned -- because on the real
// tree there is nothing to check the answer against, which is how the first attempt kept being wrong in a new
// way each time.
//
// ================================================================================================
// THE ROUTES, AND WHY THE LIST IS THIS LIST
// ================================================================================================
//
//   from "..."            static import, and `export ... from`
//   import("...")         dynamic import with a literal
//   src="..."             an html script tag
//   new Worker("...")     a worker target IS a reference, and v3449's first resolver did not know it
//   importScripts("...")  the classic-worker equivalent
//
// A specifier that is not relative (`node:fs`, a bare package name) is skipped: it cannot name a file in this
// tree. Extension completion tries the literal path, then `.js`, then `.mjs`, because this tree writes both and
// omits them in specifiers.
//
// ================================================================================================
// WHAT THIS DELIBERATELY DOES NOT DO
// ================================================================================================
//
// *** IT DOES NOT TRY TO RESOLVE A COMPOSED PATH, AND IT MUST NOT PRETEND OTHERWISE. *** `import(base + name)`
// and a spawn built from variables are real references no regex can follow, and a resolver that quietly reported
// those modules as dead would be the confident wrong answer this tree refuses. So the substring pass is KEPT --
// not as a verdict, but as its own class: MENTIONED-ONLY, meaning "nothing resolves to it AND something names
// it". That is a genuinely undecided state and it is reported as one, because a module reached by a composed
// path and a module named only in a changelog look identical from here.
//
// THREE STATES, AND THE MIDDLE ONE IS THE POINT:
//
//   REFERENCED      something resolves to it
//   MENTIONED-ONLY  nothing resolves to it, something names it -- UNDECIDED, not dead
//   UNREFERENCED    nothing resolves to it and nothing names it
"use strict";
import fs from "node:fs";
import path from "node:path";

// *** THE CORPUS IS THE CALLER'S, AND THAT IS WHY THIS FILE LOOKED BLIND TO SHADERS WHEN IT NEVER WAS (v3560). ***
// `files` is a parameter and resolveSpec tries the literal path FIRST, so a specifier naming "./x.glsl" would
// resolve today -- there simply is not one anywhere in the tree. What is narrow is every CALLER: EIGHT sites
// spell /\.(js|mjs|html)$/ by hand, so a blindness that lives in eight callers reads as a property of the
// instrument. Declared here ONCE so a caller can widen deliberately rather than by editing a regex it copied.
// NOT SWEPT INTO THE EIGHT -- a scripted rewrite of shared scanners is v3202's shape; shaderRefs-selfcheck
// COUNTS the by-hand spellings with the antidote, and the count falls as callers adopt these.
export const SOURCE_EXT = /\.(js|mjs|html)$/;
export const SHADER_EXT = /\.(glsl|wgsl|vert|frag)$/i;

export const ROUTES = ["import", "dynamic", "script", "worker", "importScripts"];
export const REF_STATES = ["referenced", "mentioned-only", "unreferenced"];

const SPEC = /from\s*["']([^"']+)["']|import\(\s*["']([^"']+)["']|src\s*=\s*["']([^"']+)["']|new\s+Worker\(\s*["']([^"']+)["']|importScripts\(\s*["']([^"']+)["']/g;

/** Every relative specifier in one file, with the route that produced it. */
export function specifiers(src) {
    const out = [];
    let m; SPEC.lastIndex = 0;
    while ((m = SPEC.exec(src || ""))) {
        const spec = m[1] || m[2] || m[3] || m[4] || m[5];
        const route = m[1] ? "import" : m[2] ? "dynamic" : m[3] ? "script" : m[4] ? "worker" : "importScripts";
        if (spec && /^[./]/.test(spec)) out.push({ spec, route });
    }
    return out;
}

/**
 * Resolve one specifier against the file that wrote it.
 *
 * A leading "/" is ROOT-RELATIVE, because that is what an html src means when the engine is served -- treating
 * it as a filesystem absolute path would resolve outside the tree and silently find nothing.
 */
export function resolveSpec(fromFile, spec, root) {
    const base = spec.startsWith("/") ? path.join(root, spec) : path.resolve(path.dirname(fromFile), spec);
    for (const cand of [base, base + ".js", base + ".mjs"]) {
        try { if (fs.statSync(cand).isFile()) return cand; } catch { /* not this one */ }
    }
    return null;
}

/**
 * Build the reference graph over a corpus.
 *
 * `exclude` is the set of files whose NAMING of a module must not count as a mention -- registers and the census
 * itself. v3223 established the rule ("A REGISTER OF ORPHANS IS NOT A CONSUMER OF THEM") and applied it to one
 * file; it is a PARAMETER here rather than a hardcoded list, so a caller states its own and the rule stops being
 * a property of whichever file happened to be noticed.
 */
export function referenceGraph(files, readText, root, { exclude = new Set() } = {}) {
    const text = new Map(files.map((f) => [f, readText(f)]));
    const refs = new Map(files.map((f) => [f, []]));          // target -> [{ from, route }]
    for (const from of files) {
        for (const { spec, route } of specifiers(text.get(from))) {
            const hit = resolveSpec(from, spec, root);
            if (hit && refs.has(hit) && hit !== from) refs.get(hit).push({ from, route });
        }
    }
    const state = new Map();
    for (const f of files) {
        const resolved = refs.get(f);
        if (resolved.length) { state.set(f, { state: "referenced", by: resolved, mentions: [] }); continue; }
        const base = path.basename(f);
        const hits = new Set(resolved.map((r) => r.from));
        const mentions = files.filter((c) => c !== f && !exclude.has(c) && !hits.has(c) && (text.get(c) || "").includes(base));
        state.set(f, { state: mentions.length ? "mentioned-only" : "unreferenced", by: [], mentions });
    }
    return { refs, state, text };
}
