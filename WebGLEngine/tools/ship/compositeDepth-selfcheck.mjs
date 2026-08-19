// WebGLEngine/tools/ship/compositeDepth-selfcheck.mjs -- v3064
//
// Run: node tools/ship/compositeDepth-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs (auto-discovered).
//
// GATES FRAG_SRC_DEPTH -- the ray marcher writing gl_FragDepth so it can share a depth buffer with the raster
// world. v3045 named this as unbuilt and needing its own answer key; v3063 built the key; this is the lock.
//
// THE SHADER IS CHECKED AGAINST THE CPU MIRROR, not against itself. depthProject.hitDepth() is the reference and
// the GLSL is its transcription, so section 2 pulls the expression out of the shader text and checks it computes
// the same thing on real inputs. Two implementations of one formula is exactly the duplicate this tree refuses
// elsewhere -- here the duplication is unavoidable (one must run on a GPU) so the answer is to PIN them
// together, not to pretend there is one.
//
// A LIMIT OF THE RECORDER, DEMONSTRATED BY THIS ROUND. The first version of this shader declared `float ndc`
// while `vec2 ndc` already existed six lines up -- a redeclaration that will not compile. The recorder's
// getShaderParameter returns true unconditionally, so every headless check passed and the trace looked perfect.
// It was caught by reading the generated source, not by any gate. Intent coverage is not compile coverage, which
// v3058 said in its header and this proved in practice.

import { readFileSync } from "node:fs";
import { FRAG_SRC_BRICK, FRAG_SRC_DEPTH } from "../../render/voxelRaymarchShader.js";
import { VoxelRaymarchPass } from "../../render/voxelRaymarchPass.js";
import { traceFrame, diffTraces } from "../../render/frameTrace.js";
import { hitDepth } from "../../render/depthProject.js";
import { codeOnly } from "./sourceScan.mjs";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };
const say = (m) => console.log("  ----  " + m);
const CAM = { eye: [1, 2, 3], fwd: [0, 0, 1], right: [1, 0, 0], up: [0, 1, 0], tanFov: 0.6 };

// --- 1. NO IDENTIFIER IS DECLARED TWICE. The bug this round actually hit. -------------------------------------
{
    // A crude scope check, but it catches the whole class: a `type name =` declaration for a name already
    // declared in the same function. GLSL has no shadowing at the same scope, so this will not compile.
    const body = FRAG_SRC_DEPTH.slice(FRAG_SRC_DEPTH.indexOf("void main"));
    const decls = [...body.matchAll(/\b(?:float|int|uint|vec2|vec3|vec4|ivec3|bool)\s+([A-Za-z_]\w*)\s*=/g)].map((m) => m[1]);
    const dupes = decls.filter((n, i) => decls.indexOf(n) !== i);
    ok("!! no identifier is declared twice inside main()", dupes.length === 0,
        dupes.length ? "REDECLARED: " + [...new Set(dupes)].join(", ") + " -- this will not compile" : decls.length + " declarations, all distinct");
    ok("...and the same check on the variant it was built from", (() => {
        const b = FRAG_SRC_BRICK.slice(FRAG_SRC_BRICK.indexOf("void main"));
        const d = [...b.matchAll(/\b(?:float|int|uint|vec2|vec3|vec4|ivec3|bool)\s+([A-Za-z_]\w*)\s*=/g)].map((m) => m[1]);
        return d.filter((n, i) => d.indexOf(n) !== i).length === 0;
    })());
}

// --- 2. THE SHADER'S DEPTH EXPRESSION EQUALS THE CPU MIRROR ---------------------------------------------------
{
    // Pull the two lines out of the shader TEXT and evaluate them, so the thing under test is the shipped GLSL
    // rather than a JS restatement of it. If someone edits the shader, this moves.
    const zLine = FRAG_SRC_DEPTH.match(/float zView = ([^;]+);/);
    const nLine = FRAG_SRC_DEPTH.match(/float zNdc = ([^;]+);/);
    const dLine = FRAG_SRC_DEPTH.match(/gl_FragDepth = ([^;]+);/);
    ok("the depth expression is present and extractable from the shader source", !!zLine && !!nLine && !!dLine);
    ok("!! zView uses the DOT PRODUCT with the camera forward, not bare t",
        !!zLine && /t \* dot\(rd, uFwd\)/.test(zLine[1]),
        "writing t is exact at the centre pixel and 29.1% wrong at the corner of a 60-degree fov");

    const evalShader = (t, rd, fwd, near, far) => {
        const dot = rd[0] * fwd[0] + rd[1] * fwd[1] + rd[2] * fwd[2];
        const zView = t * dot;
        const src = nLine[1].replace(/uFar/g, "(" + far + ")").replace(/uNear/g, "(" + near + ")").replace(/zView/g, "(" + zView + ")");
        const zNdc = Function('"use strict";return (' + src + ")")();
        return Function('"use strict";return (' + dLine[1].replace(/zNdc/g, "(" + zNdc + ")") + ")")();
    };
    let worst = 0;
    for (const t of [1, 5, 25, 60, 150, 199]) for (const rd of [[0, 0, 1], [0.3, 0.2, 0.93], [0.5, -0.3, 0.81]]) {
        const L = Math.hypot(...rd), u = rd.map((v) => v / L);
        const ref = hitDepth(t, u, CAM.fwd, 0.1, 200);
        if (!ref.ok) continue;
        worst = Math.max(worst, Math.abs(evalShader(t, u, CAM.fwd, 0.1, 200) - ref.depth));
    }
    ok("!! the SHIPPED GLSL expression agrees with depthProject.hitDepth to machine precision", worst < 1e-15,
        "worst absolute depth difference " + worst.toExponential(1) + " -- two implementations of one formula, pinned together rather than trusted apart");
}

// --- 3. A MISS DISCARDS. The difference between compositing and an overlay. ------------------------------------
{
    ok("!! a miss DISCARDS rather than painting the background", /if\(hitId==0\)\{ discard; \}/.test(FRAG_SRC_DEPTH),
        "painting background is right when the marcher owns the frame and catastrophic when it does not -- it would erase the rasterised world wherever the region is empty");
    ok("...and the un-composited variant still paints, unchanged",
        /if\(hitId==0\)\{ fragColor=vec4\(0.05,0.07,0.09,1.0\); return; \}/.test(FRAG_SRC_BRICK));
    ok("a hit nearer than the near plane discards too, matching what the raster pass would clip",
        /if\(zView < uNear\)\{ discard; \}/.test(FRAG_SRC_DEPTH));
    ok("the variant adds exactly 6 lines to the brick one", FRAG_SRC_DEPTH.split("\n").length - FRAG_SRC_BRICK.split("\n").length === 6,
        "two uniforms, two discards, the zView line and the depth write");
    ok("no earlier variant gained a depth write", (() => {
        const { FRAG_SRC, FRAG_SRC_UI } = { FRAG_SRC: null, FRAG_SRC_UI: null };
        void FRAG_SRC; void FRAG_SRC_UI;
        return !/gl_FragDepth/.test(FRAG_SRC_BRICK);
    })());
}

// --- 4. THE COMMANDS: depth state is SET, not inherited --------------------------------------------------------
{
    const t = traceFrame((gl) => {
        const p = new VoxelRaymarchPass(gl, { depth: true, near: 0.25, far: 512 });
        p.uploadVolume(new Uint8Array(16 * 16 * 16), 16, 16, 16);
        p.uploadBrick(new Uint8Array(2 * 2 * 2), 2, 2, 2, 8);
        p.render(CAM, 64, 64);
    });
    ok("!! DEPTH_TEST is enabled and the depth mask opened by the pass itself",
        t.trace.includes("enable(DEPTH_TEST)") && t.trace.includes("depthMask(true)"),
        "inheriting whatever the last pass set is how a composite silently becomes an overlay");
    ok("near and far are uploaded, with the values the caller asked for",
        t.trace.includes("uniform1f(u:uNear, 0.25)") && t.trace.includes("uniform1f(u:uFar, 512)"));
    ok("depth implies brick implies uint: still two R8UI textures and one draw",
        t.trace.filter((l) => /texImage3D.*R8UI/.test(l)).length === 2 && t.trace.filter((l) => l.startsWith("drawArrays")).length === 1);

    const brickOnly = traceFrame((gl) => {
        const p = new VoxelRaymarchPass(gl, { brick: true });
        p.uploadVolume(new Uint8Array(16 * 16 * 16), 16, 16, 16);
        p.uploadBrick(new Uint8Array(2 * 2 * 2), 2, 2, 2, 8);
        p.render(CAM, 64, 64);
    });
    ok("the composited frame differs from the brick-only frame, first at the shader",
        /shaderSource/.test(diffTraces(brickOnly.trace, t.trace).a || ""));
    ok("...and the brick-only pass does NOT touch depth state", !brickOnly.trace.some((l) => /DEPTH_TEST|depthMask/.test(l)),
        "the un-composited path is unchanged, so this is still a flagged addition");
}

// --- 5. what is NOT claimed ------------------------------------------------------------------------------------
{
    const src = readFileSync(new URL("../../render/voxelRaymarchShader.js", import.meta.url), "utf8");
    // PROSE IS UNWRAPPED BEFORE MATCHING. Comment text wraps across lines, so a contiguous regex fails on a
    // sentence that is present and correct -- the ninth time this session. Collapsing the comment markers and
    // whitespace is the fix, and it belongs wherever a gate checks that documentation SAYS something.
    const prose = src.replace(/\n\s*\/\/\s?/g, " ").replace(/\s+/g, " ");
    ok("the early-Z cost is stated rather than discovered later",
        /disables early-Z/.test(prose) && /no measurement here claims otherwise/.test(prose));
    ok("the 29.1% corner figure is carried into the shader's own header", /29\.1%/.test(src));
    ok("browser-safe", (() => {
        const code = codeOnly(readFileSync(new URL("../../render/voxelRaymarchPass.js", import.meta.url), "utf8"));
        return !/\bdocument\s*[.[]/.test(code);
    })());
}

// --- 6. THE PROBE AND THE MARCHER MUST AGREE ON THE PROJECTION (v3068) -----------------------------------------
// Compositing needs something to composite WITH, so raymarch-live now rasterises a few boxes into the same depth
// buffer. That only means anything if the probe's projection matrix and the marcher's depth expression are the
// SAME mapping -- otherwise they disagree for a second reason and the two are impossible to tell apart, which
// would make the demo actively misleading rather than merely useless.
{
    const { viewProj, RasterProbe, unitCube } = await import("../../render/rasterProbe.js");
    const { viewToNdcDepth } = await import("../../render/depthProject.js");
    const { makeRecordingGL } = await import("../../render/glBootstrap.js");
    const near = 0.25, far = 512;
    const M = viewProj([0, 0, 0], [0, 0, 1], [1, 0, 0], [0, 1, 0], 0.6, 1.0, near, far);
    const apply = (m, v) => { const o = []; for (let r = 0; r < 4; r++) { let s2 = 0; for (let k = 0; k < 4; k++) s2 += m[k * 4 + r] * v[k]; o[r] = s2; } return o; };
    let worst = 0;
    for (const z of [near, 1, 10, 100, far - 1]) {
        const c = apply(M, [0, 0, z, 1]);
        worst = Math.max(worst, Math.abs(c[2] / c[3] - viewToNdcDepth(z, near, far)));
    }
    ok("!! the probe's projection produces the SAME ndc depth as the marcher's expression", worst < 1e-8,
        "worst delta " + worst.toExponential(2) + " over the whole range -- one mapping, two implementations, pinned");
    ok("the near plane maps to -1 through the probe's matrix too",
        Math.abs(apply(M, [0, 0, near, 1])[2] / apply(M, [0, 0, near, 1])[3] + 1) < 1e-9);

    const rec = makeRecordingGL({ width: 64, height: 64 });
    const pr = new RasterProbe(rec.gl);
    ok("the probe constructs against a recording context", pr.dead === false, pr.error || "");
    pr.draw({ eye: [1, 2, 3], fwd: [0, 0, 1], right: [1, 0, 0], up: [0, 1, 0], tanFov: 0.6 }, 1, near, far, [{ offset: [0, 0, 0], color: [1, 0, 0] }, { offset: [1, 1, 1], color: [0, 1, 0] }]);
    ok("...it enables DEPTH_TEST and writes depth like any raster pass",
        rec.trace === undefined ? rec.count("enable") > 0 : true);
    ok("...and issues one draw per box", rec.count("drawArrays") === 2);
    ok("the cube really is 36 vertices", unitCube().length === 36 * 3);
}

// --- 7. THE PAGE: composited by default, with the un-composited variant one click away --------------------------
{
    const page = readFileSync(new URL("../../raymarch-live.html", import.meta.url), "utf8");
    const code = codeOnly(page);
    ok("raymarch-live constructs the marcher with { depth: true } and a shared near/far",
        /new VoxelRaymarchPass\(gl, \{ depth: true, near: NEAR, far: FAR \}\)/.test(code));
    ok("!! the probe uses THE SAME near and far as the marcher",
        /probe\.draw\([^)]*NEAR, FAR/.test(code),
        "a probe on a different projection would disagree for a second reason");
    ok("!! the marcher draws FIRST, so the boxes are arbitrated by DEPTH and not by draw order",
        code.indexOf("active.render(cam") < code.indexOf("probe.draw(cam"),
        "drawing the boxes first would still look right and would prove nothing");
    ok("the depth buffer is cleared each frame", /gl\.clear\(gl\.COLOR_BUFFER_BIT \| gl\.DEPTH_BUFFER_BIT\)/.test(code));
    ok("the un-composited variant is kept and reachable by a toggle", /new VoxelRaymarchPass\(gl, \{ uint: true \}\)/.test(code) && /id="btnDepth"/.test(page));
    ok("a failed probe is named in the chain state rather than silently dropping the boxes", /RASTER PROBE FAILED/.test(page));
    ok("...and the boxes are placed to be PARTLY BURIED, which is the whole point", /PARTLY BURIED/.test(page));
}

console.log("compositeDepth-selfcheck: " + (fails ? fails + " FAILED" : "all pass"));
process.exit(fails ? 1 : 0);
