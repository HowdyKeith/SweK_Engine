// WebGLEngine/tools/ship/shaderCensus.mjs
// VERSION: v1 -- v3274
//
// HOW MANY SHADERS EXIST IN BOTH LANGUAGES, AND HOW FAR APART HAVE THEY DRIFTED.
//
// Keith raised Virtual-Machine/llvm-tutorial-book -- a working compiler front end -- and the reason it lands
// here is that SweK HAS THE PROBLEM AN IR SOLVES: 17 files carry WGSL, 82 carry GLSL, and every effect that
// runs on both backends is AUTHORED TWICE. That is this project's signature defect (nine files declaring MODES,
// three declaring the gate walk) at its largest scale, in the place where drift is hardest to see, BECAUSE BOTH
// COMPILE AND BOTH LOOK RIGHT IN ISOLATION.
//
// *** BUT AN IR THAT COVERS 80% OF THE SHADERS LEAVES YOU MAINTAINING THREE THINGS -- GLSL, WGSL, AND A COMPILER
// THAT HANDLES MOST CASES. THAT IS WORSE THAN TWO. *** So this counts before anything is built: four near-
// identical pairs means the IR is over-engineering; twenty pairs with three disagreeing means it is overdue AND
// three bugs were found on the way. Same move as v3262's settings census.

import fs from "node:fs";
import path from "node:path";

// A file "speaks" a language if it contains that language's ENTRY-POINT idioms, not merely its name. A comment
// mentioning WGSL is not a WGSL shader, and a census that counted mentions would report a fleet of imaginary pairs.
const WGSL = /@compute\b|@fragment\b|@vertex\b|fn\s+main\s*\(|var<storage|var<uniform/;
const GLSL = /gl_FragColor|gl_Position|precision\s+(highp|mediump|lowp)|\bvarying\b|\battribute\b|#version\s+300/;

// *** THIS FILE MATCHED ITSELF ON THE FIRST RUN, and it is the exact error the census is looking for: a file
// that MENTIONS both languages is not a file that IMPLEMENTS both. The detectors are string literals here, so
// the census reported itself as a shader pair -- a tool counting itself as an instance of the thing it counts.
const SKIP = /node_modules|[\\/]vendor[\\/]|-selfcheck\.mjs$|shaderCensus\.mjs$/;

export function shaderCensus(root) {
    const both = [], wgslOnly = [], glslOnly = [];
    const walk = (dir) => {
        let ents = [];
        try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
        for (const e of ents) {
            const p = path.join(dir, e.name);
            if (SKIP.test(p) || e.name.startsWith(".")) continue;
            if (e.isDirectory()) { walk(p); continue; }
            if (!/\.(js|mjs)$/.test(e.name)) continue;
            let src = "";
            try { src = fs.readFileSync(p, "utf8"); } catch { continue; }
            const w = WGSL.test(src), g = GLSL.test(src);
            const rel = path.relative(root, p);
            if (w && g) both.push(rel);
            else if (w) wgslOnly.push(rel);
            else if (g) glslOnly.push(rel);
        }
    };
    walk(root);
    return { both, wgslOnly, glslOnly };
}

/**
 * How far apart are the two halves of a file that speaks both?
 *
 * *** THIS DELIBERATELY DOES NOT DIFF THE TEXT. *** GLSL and WGSL are different languages; their sources SHOULD
 * differ everywhere, and a character diff would report 90% and mean nothing. What is comparable is the SHAPE:
 * the numeric literals and the uniform/binding names each half uses. IF ONE SIDE TUNES A CONSTANT AND THE OTHER
 * DOES NOT, THE PICTURES DIVERGE WHILE BOTH STILL COMPILE -- and that is the whole failure this census is for.
 */
export function pairShape(src) {
    const nums = (s) => [...new Set((s.match(/-?\d+\.\d+/g) || []))].sort();
    // Split on the first WGSL entry point: crude, and STATED AS CRUDE. A file interleaving both languages would
    // defeat it, and the count below says how many files that applies to so nobody trusts it blindly.
    const i = src.search(/@compute|@fragment|@vertex|fn\s+main\s*\(/);
    if (i < 0) return null;
    const a = nums(src.slice(0, i)), b = nums(src.slice(i));
    const shared = a.filter((x) => b.includes(x));
    const onlyGlsl = a.filter((x) => !b.includes(x));
    const onlyWgsl = b.filter((x) => !a.includes(x));
    return { glslConstants: a.length, wgslConstants: b.length, shared: shared.length,
             onlyGlsl, onlyWgsl };
}
