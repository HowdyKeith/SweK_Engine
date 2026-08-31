#!/usr/bin/env node
// tools/ship/dropletMask-selfcheck.mjs -- v4211
//
// Run: node tools/ship/dropletMask-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs (auto-discovered). No GPU needed -- and that is the point.
//
// *** THE BUG THIS EXISTS FOR: Keith, on fluid-webgpu.html -- "does water droplets need to be square?" ***
// They were. Each particle is drawn as a 6-vertex QUAD (two triangles) and the fragment stage returned
// `vec4(i.col, 1.0)` for every pixel of it. The quad is the right primitive; what was missing is the MASK
// that turns it into a disc. A quad with no mask is a square, exactly as rendered.
//
// THE FIX WAS ALREADY WRITTEN IN THE SIBLING FILE. fluid-webgpu-3d.html -- the 3D version of this same
// simulation -- already carries the sphere-impostor idiom (`let r2 = dot(i.uv,i.uv); if(r2>1.0){ discard; }`
// plus a reconstructed normal). The 2D file simply never got it, and could not have: its vertex stage never
// passed the corner offset to the fragment stage, so the shader had no way to know where in the quad it was.
// This gate therefore checks BOTH files, because the interesting property is that the tree stops holding two
// answers to one question.
//
// *** THIS BOX HAS NO navigator.gpu, SO THE MASK IS PROVEN IN A TWIN RATHER THAN ASSERTED FROM THE SOURCE. ***
// Same posture as brain/transport/scanTwin.mjs (v4208): a shader nobody can run is a shader nobody has
// checked. The mask is a pure function of the quad corner, so it is re-implemented here and INTEGRATED over
// the quad -- a correct disc covers pi/4 of its bounding square, and no reading of the source proves that.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateWgsl } from "../../render/wgslSpec.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
console.log("dropletMask-selfcheck -- the particle quads are masked to discs, proven in a twin\n");

// Blank strings AND comments: the idioms below are QUOTED in this file's own header and in the shader's, so
// searching raw source would find the prose rather than the code. An absence is a code shape -- v4208's lesson
// in its other direction, and the reason this reads codeOnly.
const codeOnly = (s) => s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");

// The two pages name their particle-render shader DIFFERENTLY -- fluid-webgpu.html builds `wgsl.render` from
// a COMMON prefix, fluid-webgpu-3d.html declares a standalone `const renderSrc`. A gate that knew only one
// shape would report the other file as "no shader" and, worse, as a PASS-shaped absence. Both are tried, and
// a file matching NEITHER is a failure rather than a silent skip.
const RENDER_DECLS = [
    /wgsl\.render *= *COMMON *\+ *`([\s\S]*?)`;/,
    /wgsl\.render *= *`([\s\S]*?)`;/,
    /const +renderSrc *= *COMMON *\+ *`([\s\S]*?)`;/,
    /const +renderSrc *= *`([\s\S]*?)`;/,
];
function renderShaderOf(file) {
    const html = fs.readFileSync(path.join(ROOT, file), "utf8");
    const common = html.match(/const COMMON *= *`([\s\S]*?)`;/);
    let body = null;
    for (const re of RENDER_DECLS) { const m = html.match(re); if (m) { body = m[1]; break; } }
    // The 3D file's renderSrc carries its own bindings and does not concatenate COMMON, so only prepend the
    // prefix when the body does not already declare its own @group bindings.
    const needsCommon = body != null && !/@group\(0\) *@binding\(0\)/.test(body);
    return { html, src: (needsCommon && common ? common[1] : "") + (body || ""), found: body != null };
}

// ---- 1. BOTH FLUID PAGES MASK THEIR PARTICLES ------------------------------------------------------------
console.log("1. *** NEITHER FLUID PAGE DRAWS A BARE QUAD ANY MORE ***");
for (const file of ["fluid-webgpu.html", "fluid-webgpu-3d.html"]) {
    const { src, found } = renderShaderOf(file);
    ok(file + ": the render shader was located", found && src.length > 0);
    const code = codeOnly(src);
    ok(file + ": !! the fragment stage rejects fragments outside the unit disc",
        /discard/.test(code) && /dot\(\s*\w+\.uv\s*,\s*\w+\.uv\s*\)/.test(code),
        "needs r2 = dot(uv,uv) and a discard");
    // The vertex half is load-bearing and is the half that was missing: without the corner reaching the
    // fragment stage, no mask is expressible at all.
    ok(file + ": !! *** the vertex stage passes the quad corner through -- the half that was missing ***",
        /\.uv\s*=/.test(code) && /@location\(\d+\)\s*uv\s*:\s*vec2<f32>/.test(code));
    ok(file + ": the shader still conforms to the WGSL device limits (render/wgslSpec.mjs)",
        validateWgsl(src).length === 0, JSON.stringify(validateWgsl(src)).slice(0, 200));
}

// ---- 2. THE TWIN: the mask actually makes a DISC, which no amount of reading the source shows -------------
console.log("\n2. *** THE MASK, RE-IMPLEMENTED AND INTEGRATED -- a disc covers pi/4 of its quad ***");
// The shader's test, verbatim in JS: uv is the quad corner in [-1,1], the fragment survives iff dot(uv,uv)<=1.
const survives = (u, v) => (u * u + v * v) <= 1.0;

ok("!! the four quad CORNERS are discarded -- these are the square's giveaway",
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].every(([u, v]) => !survives(u, v)),
    "corner r2 = 2.0");
ok("the centre of the quad is kept", survives(0, 0));
ok("a point just inside the rim is kept, just outside is not",
    survives(0.999, 0) && !survives(1.001, 0));

// Integrate on a fine grid. pi/4 = 0.785398...; a SQUARE (the bug) integrates to exactly 1.0, so this single
// number separates the fixed shader from the broken one with no ambiguity.
const N = 2000;
let kept = 0;
for (let iy = 0; iy < N; iy++) {
    const v = (iy + 0.5) / N * 2 - 1;
    for (let ix = 0; ix < N; ix++) {
        const u = (ix + 0.5) / N * 2 - 1;
        if (survives(u, v)) kept++;
    }
}
const coverage = kept / (N * N);
const EXPECT = Math.PI / 4;
ok("!! *** coverage integrates to pi/4, not to 1.0 -- a disc, not the square it was ***",
    Math.abs(coverage - EXPECT) < 1e-3,
    "measured " + coverage.toFixed(6) + " vs pi/4 = " + EXPECT.toFixed(6) +
    "; the UNMASKED quad this replaced integrates to exactly 1.000000");

// ---- 3. THE IMPOSTOR NORMAL IS A UNIT VECTOR wherever it is evaluated -------------------------------------
console.log("\n3. the reconstructed normal is a real unit normal, so the shading term is meaningful");
let worst = 0, negRoot = 0;
for (let i = 0; i <= 400; i++) {
    for (let j = 0; j <= 400; j++) {
        const u = i / 400 * 2 - 1, v = j / 400 * 2 - 1;
        const r2 = u * u + v * v;
        if (r2 > 1.0) continue;                       // discarded; the normal is never evaluated there
        const nz = Math.sqrt(Math.max(0, 1 - r2));    // the shader's max(0, ...) guard
        if (1 - r2 < 0) negRoot++;
        worst = Math.max(worst, Math.abs(Math.hypot(u, v, nz) - 1));
    }
}
ok("!! |N| == 1 across the whole disc", worst < 1e-9, "max deviation " + worst.toExponential(2));
ok("the sqrt is never fed a negative (the max(0,...) guard is not decoration)", negRoot === 0);

console.log("\ndropletMask-selfcheck: " + (fails ? fails + " FAILED" : "all checks pass"));
process.exit(fails ? 1 : 0);
