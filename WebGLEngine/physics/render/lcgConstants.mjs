// WebGLEngine/physics/render/lcgConstants.mjs
//
// THE LCG'S REGEX PARSERS, SPLIT OUT SO A CALLER THAT ONLY NEEDS THE NUMBERS DOES NOT HAVE TO IMPORT A DISK READ.
//
// pathTracerWgsl.mjs's own header explains why the constants are PARSED out of furnace.mjs/occlusion.mjs rather
// than retyped: a hand-copied 1664525 would be a second declaration that could drift silently underneath the
// gate meant to catch it. That parsing needs `node:fs` to read the sibling files, which is exactly what made it
// impossible to import ANYTHING from pathTracerWgsl.mjs in a browser -- an ES module runs its whole top level on
// import, so even `import { LCG } from "./pathTracerWgsl.mjs"` for the one field failed there with the disk read
// it never asked for (found this round: physics/render/rtPipeline.mjs and physics/render/pathTracerGpu.mjs both
// import LCG this way, and neither had ever actually been loaded inside a browser page before render/rtViewer.mjs
// tried to -- every existing caller runs in Node, where the failure never surfaced).
//
// THE FIX KEEPS THE ANTI-DRIFT ARGUMENT RATHER THAN WORKING AROUND IT. The two regexes move here, taking the
// source text as a plain parameter instead of reading it themselves -- still not a second declaration, just no
// longer coupled to how the text arrives. pathTracerWgsl.mjs keeps its own `readOr`/FURNACE_PATH/OCCLUSION_PATH
// wrapper and calls these, so its own LCG/EPS are exactly the values they always were (same disk read, same
// numbers) and every one of its 11 existing importers is unaffected. `LCG`/`EPS` here are the frozen result of
// that same disk read, TAKEN ONCE rather than re-derived at import time, precisely so this file itself needs no
// node:fs and can load in a browser -- so they are exactly the kind of remembered value the header above warns
// against, UNLESS something re-checks them. tools/ship/rtViewer-selfcheck.mjs does: it imports both this file's
// frozen LCG/EPS and pathTracerWgsl.mjs's live parseLcg()/parseEps() (a Node-only gate can afford the disk read)
// and fails BY NAME if they ever disagree, which is the same guarantee the header describes, one step removed.
"use strict";

/** The LCG's three constants, lifted from furnace.mjs's one-line body. */
export function parseLcg(src) {
    const m = src.match(/Math\.imul\(\s*s\s*,\s*(\d+)\s*\)\s*\+\s*(\d+)\s*\)\s*>>>\s*0\s*;\s*return\s+s\s*\/\s*(\d+)/);
    if (!m) throw new Error("lcgConstants: furnace.mjs rng body did not parse -- the generator moved");
    return { mul: Number(m[1]), inc: Number(m[2]), div: Number(m[3]) };
}

/** raySphere's surface epsilon, lifted from occlusion.mjs's signature. */
export function parseEps(src) {
    const m = src.match(/export\s+function\s+raySphere\s*\([^)]*eps\s*=\s*([0-9.eE+-]+)/);
    if (!m) throw new Error("lcgConstants: occlusion.mjs raySphere eps did not parse");
    return Number(m[1]);
}

// Taken from a real run of pathTracerWgsl.mjs's parseLcg(readOr(FURNACE_PATH)) / parseEps(readOr(OCCLUSION_PATH))
// -- re-verified by tools/ship/rtViewer-selfcheck.mjs on every gate run, not just written down once and trusted.
export const LCG = Object.freeze({ mul: 1664525, inc: 1013904223, div: 4294967296 });
export const EPS = 0.000001;
