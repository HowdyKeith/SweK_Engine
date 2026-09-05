#!/usr/bin/env node
// tools/ship/meshLine-selfcheck.mjs -- v4225
//
// Run: node tools/ship/meshLine-selfcheck.mjs      (pure geometry in node; the GL half skips with a reason)
// Gated by tools/ship/selfchecks.mjs (auto-discovered).
//
// GATES render/meshLine.mjs.
//
// *** THE PREMISE IS CHECKABLE AND IS CHECKED: gl.lineWidth DOES NOTHING. *** It is not deprecated and it
// raises no error -- the Core Profile lets an implementation support only a width of 1, and every desktop
// driver takes that option. Section 6 asks the driver directly (ALIASED_LINE_WIDTH_RANGE) and then MEASURES
// painted pixels at three widths, both ways. A premise this round is built on should not be folklore.
import {
    DEFAULTS, dedupe, normalise, miterFactor, shouldBevel, turnAngle, expandPolyline, jointsOf,
    MESHLINE_VS, MESHLINE_FS,
} from "../../render/meshLine.mjs";
import { codeOnly, noComments } from "./sourceScan.mjs";
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const near = (a, b, e = 1e-9) => Math.abs(a - b) <= e;
console.log("meshLine-selfcheck -- a line with width, and the joint that goes to infinity\n");

// ---- 1. THE MITER --------------------------------------------------------------------------------------
console.log("1. *** THE MITER LENGTH IS 1/cos(theta/2), AND IT DIVERGES ***");
{
    const dirAt = (deg) => [Math.cos(deg * Math.PI / 180), Math.sin(deg * Math.PI / 180), 0];
    const D = [1, 0, 0];
    ok("straight on is 1 -- no widening at all", near(miterFactor(D, dirAt(0)), 1));
    ok("!! a right angle is exactly sqrt(2)", near(miterFactor(D, dirAt(90)), Math.SQRT2),
        miterFactor(D, dirAt(90)).toFixed(6));
    ok("!! 120 degrees is exactly 2", near(miterFactor(D, dirAt(120)), 2, 1e-12),
        "cos(60) is 0.5, so the outer corner sits twice as far out as the line is wide");
    ok("!! *** A FULL REVERSAL IS INFINITE -- the spike every wide-line renderer has to cap ***",
        miterFactor(D, dirAt(180)) === Infinity);
    ok("...and it is already enormous just short of that", miterFactor(D, dirAt(179)) > 100,
        miterFactor(D, dirAt(179)).toFixed(1) + "x the half-width, at 179 degrees");
    ok("the factor grows monotonically with the turn", (() => {
        let prev = 0;
        for (let d = 0; d <= 175; d += 5) { const f = miterFactor(D, dirAt(d)); if (f < prev - 1e-12) return false; prev = f; }
        return true;
    })());
    ok("!! shouldBevel fires past the limit and not before", !shouldBevel(D, dirAt(120)) && shouldBevel(D, dirAt(170)),
        `limit ${DEFAULTS.miterLimit}: 120deg is ${miterFactor(D, dirAt(120)).toFixed(2)}, 170deg is ${miterFactor(D, dirAt(170)).toFixed(2)}`);
    ok("...and Infinity bevels rather than passing a comparison", shouldBevel(D, dirAt(180)));
    ok("turnAngle is the angle, in radians", near(turnAngle(D, dirAt(90)), Math.PI / 2) && near(turnAngle(D, dirAt(180)), Math.PI));
}

// ---- 2. THE DEGENERATE INPUT ---------------------------------------------------------------------------
console.log("\n2. *** A REPEATED POINT IS A ZERO-LENGTH SEGMENT, AND ITS DIRECTION IS 0/0 ***");
{
    ok("normalise refuses a zero vector rather than returning NaN", normalise([0, 0, 0]) === null);
    ok("...and normalises anything else", (() => { const v = normalise([3, 4, 0]); return near(v[0], 0.6) && near(v[1], 0.8); })());
    const d = dedupe([[0, 0, 0], [0, 0, 0], [1, 0, 0], [1, 0, 0], [1, 0, 0], [2, 0, 0]]);
    ok("!! consecutive duplicates are dropped", d.length === 3, JSON.stringify(d));
    ok("...but a point REVISITED later is kept -- a path may legitimately cross itself",
        dedupe([[0, 0, 0], [1, 0, 0], [0, 0, 0]]).length === 3);
    const e = expandPolyline([[0, 0, 0], [0, 0, 0], [1, 0, 0], [1, 0, 0], [2, 1, 0]]);
    ok("!! *** NO NaN REACHES THE BUFFERS *** -- one bad point would take the whole strip with it",
        [...e.position, ...e.previous, ...e.next, ...e.side, ...e.along].every(Number.isFinite));
    // *** THE NaN CHECK ALONE DOES NOT TEST dedupe, AND REMOVING dedupe LEFT IT GREEN. *** With duplicates
    // kept, the positions are still finite -- the 0/0 would only appear in the shader, which has its own
    // zero-length guard. What actually changes is measurable here: the strip carries vertices for points
    // that are not there, and the arc length STALLS across them, so a dash pattern stops advancing while the
    // line keeps going. That is the property, so that is what is asserted.
    ok("!! five raw points containing two duplicate pairs collapse to three, not five",
        e.points === 3 && e.side.length === 6,
        `${e.points} points, ${e.side.length} vertices -- without dedupe it is 5 and 10`);
    ok("...and the arc length strictly increases, so a dash never stalls",
        (() => { const a = Array.from(e.along).filter((_, i) => i % 2 === 0);
                 return a.every((v, i) => i === 0 || v > a[i - 1]); })());
    ok("a single point produces nothing rather than a broken strip", expandPolyline([[0, 0, 0]]).count === 0);
    ok("...and so does an empty path, or none at all",
        expandPolyline([]).count === 0 && expandPolyline(null).count === 0);
}

// ---- 3. THE BUFFERS ------------------------------------------------------------------------------------
console.log("\n3. the strip: two vertices per point, two triangles per segment");
{
    const pts = [[0, 0, 0], [1, 0, 0], [2, 1, 0], [3, 1, 0]];
    const e = expandPolyline(pts);
    ok("!! 4 points give 8 vertices and 18 indices (6 per segment)",
        e.side.length === 8 && e.count === 18 && e.position.length === 24);
    ok("the two vertices of a point share its position and differ only in side",
        e.position[0] === e.position[3] && e.side[0] === 1 && e.side[1] === -1);
    ok("every index is inside the vertex range", Array.from(e.index).every((i) => i >= 0 && i < e.side.length));
    ok("!! arc length runs 0 to 1, monotonically -- what a dash or a texture rides on",
        e.along[0] === 0 && near(e.along[e.along.length - 1], 1) &&
        Array.from(e.along).every((v, i, a) => i === 0 || v >= a[i - 1] - 1e-9));
    // *** THE ENDS: the hazard is previous[0] === position[0] ***
    ok("!! the first point's `previous` is EXTRAPOLATED, not a copy of itself",
        !(e.previous[0] === e.position[0] && e.previous[1] === e.position[1]),
        "a copy would give the end vertex a zero-length direction -- the same 0/0 dedupe exists to prevent");
    ok("...and the last point's `next` likewise", (() => {
        const n = e.side.length - 1;
        return !(e.next[n * 3] === e.position[n * 3] && e.next[n * 3 + 1] === e.position[n * 3 + 1]);
    })());
    const c = expandPolyline(pts, { closed: true });
    ok("!! a closed path adds the wrap point and takes its neighbours from the far end",
        c.points === pts.length + 1 && c.count === 24);
    ok("...and its first vertex's `previous` is the SECOND-TO-LAST point, which is what joins the seam",
        near(c.previous[0], pts[pts.length - 1][0]) && near(c.previous[1], pts[pts.length - 1][1]));
}

// ---- 4. JOINTS OF A REAL PATH --------------------------------------------------------------------------
console.log("\n4. classifying a path's joints");
{
    const j = jointsOf([[0, 0, 0], [1, 0, 0], [0.02, 0, 0], [0.02, 1, 0]]);
    ok("!! a path that doubles back reports a 180-degree joint that must bevel",
        j.length === 2 && near(j[0].turn, Math.PI, 1e-6) && j[0].bevel === true && j[0].miter === Infinity);
    ok("...and the ordinary corner beside it does not", near(j[1].turn, Math.PI / 2, 1e-6) && j[1].bevel === false);
    ok("the endpoints are not joints", jointsOf([[0, 0, 0], [1, 0, 0]]).length === 0);
}

// ---- 5. THE SHADER AGREES WITH THE BUFFERS -------------------------------------------------------------
console.log("\n5. *** THE ATTRIBUTE NAMES MUST MATCH, AND A MISMATCH IS SILENT ***");
{
    const declared = [...MESHLINE_VS.matchAll(/^in\s+\w+\s+(\w+);/gm)].map((m) => m[1]).sort();
    ok("!! the vertex shader declares exactly the five attributes expandPolyline produces",
        JSON.stringify(declared) === JSON.stringify(["aAlong", "aNext", "aPosition", "aPrevious", "aSide"]),
        declared.join(", ") + " -- getAttribLocation returns -1 for a name that does not match, and a -1 is easy to skip past");
    ok("the width uniform is there and is documented as pixels", /uniform float uWidth;\s*\/\/ in PIXELS/.test(MESHLINE_VS));
    ok("!! the offset is divided by the resolution, which is what makes the width SCREEN-space",
        /uResolution/.test(MESHLINE_VS) && /cur\.xy \+= offset/.test(MESHLINE_VS));
    ok("...and multiplied by w, so perspective divide does not shrink it with distance",
        /\* cur\.w/.test(MESHLINE_VS));
    ok("the miter is capped in the shader too, at the same limit as the CPU side",
        /abs\(m\) > 0\.25/.test(MESHLINE_VS) && DEFAULTS.miterLimit === 4);
    ok("both shaders are GLSL ES 3.00, as WebGL2 requires",
        MESHLINE_VS.startsWith("#version 300 es") && MESHLINE_FS.startsWith("#version 300 es"));
}

// ---- 6. THE PREMISE, AND THE PROOF ---------------------------------------------------------------------
console.log("\n6. *** ASKING THE DRIVER, AND THEN COUNTING PIXELS ***");
{
    const { resolvePlaywright, browserSkipReason, HEADLESS_SHELL } = await import("./playwrightResolve.mjs");
    const skip = browserSkipReason(require);
    if (skip) {
        console.log("  ----  SKIPPED, WITH A REASON: " + skip);
        console.log("        Sections 1-5 gate the geometry and the shader source. What only a GL context can");
        console.log("        show is that gl.lineWidth is ignored and that this is not -- which is the claim");
        console.log("        the whole round rests on, so it is measured rather than asserted from a spec.");
    } else {
        const { chromium } = resolvePlaywright(require);
        const browser = await chromium.launch({ executablePath: HEADLESS_SHELL, args: ["--use-gl=swiftshader"] });
        try {
            const page = await browser.newPage();
            await page.setContent("<!doctype html><body></body>");
            const src = fs.readFileSync(path.join(ROOT, "render", "meshLine.mjs"), "utf8");
            const r = await page.evaluate(async (source) => {
                const M = await import("data:text/javascript;base64," + btoa(unescape(encodeURIComponent(source))));
                const cv = document.createElement("canvas"); cv.width = 200; cv.height = 120;
                const gl = cv.getContext("webgl2");
                if (!gl) return { noGL: true };
                const range = gl.getParameter(gl.ALIASED_LINE_WIDTH_RANGE);
                const compile = (vs, fs2) => {
                    const pr = gl.createProgram();
                    for (const [t, s] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs2]]) {
                        const sh = gl.createShader(t); gl.shaderSource(sh, s); gl.compileShader(sh);
                        if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh));
                        gl.attachShader(pr, sh);
                    }
                    gl.linkProgram(pr);
                    if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(pr));
                    return pr;
                };
                const rows = () => {
                    const px = new Uint8Array(200 * 120 * 4);
                    gl.readPixels(0, 0, 200, 120, gl.RGBA, gl.UNSIGNED_BYTE, px);
                    const s = new Set();
                    for (let y = 0; y < 120; y++) { const i = (y * 200 + 100) * 4; if (px[i] > 20 || px[i + 1] > 20 || px[i + 2] > 20) s.add(y); }
                    return s.size;
                };
                const PATH = [[-0.9, 0, 0], [0.9, 0, 0]];
                const IDENT = new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]);
                const naive = {}, mesh = {};
                const np = compile("#version 300 es\nin vec3 aPosition; void main(){ gl_Position=vec4(aPosition,1.0); }",
                                   "#version 300 es\nprecision highp float; out vec4 f; void main(){ f=vec4(1.0); }");
                const nb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, nb);
                gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([...PATH[0], ...PATH[1]]), gl.STATIC_DRAW);
                for (const w of [1, 8, 20]) {
                    gl.viewport(0, 0, 200, 120); gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT);
                    gl.useProgram(np);
                    const loc = gl.getAttribLocation(np, "aPosition");
                    gl.bindBuffer(gl.ARRAY_BUFFER, nb); gl.enableVertexAttribArray(loc);
                    gl.vertexAttribPointer(loc, 3, gl.FLOAT, false, 0, 0);
                    gl.lineWidth(w); gl.drawArrays(gl.LINES, 0, 2);
                    naive[w] = rows();
                }
                const m = M.expandPolyline(PATH);
                const mp = compile(M.MESHLINE_VS, M.MESHLINE_FS);
                const mk = (d, t = gl.ARRAY_BUFFER) => { const bb = gl.createBuffer(); gl.bindBuffer(t, bb); gl.bufferData(t, d, gl.STATIC_DRAW); return bb; };
                const bp = mk(m.position), bpr = mk(m.previous), bn = mk(m.next), bs = mk(m.side), ba = mk(m.along);
                const bi = mk(m.index, gl.ELEMENT_ARRAY_BUFFER);
                const att = (bb, n, sz) => { const l = gl.getAttribLocation(mp, n); if (l < 0) return false;
                    gl.bindBuffer(gl.ARRAY_BUFFER, bb); gl.enableVertexAttribArray(l);
                    gl.vertexAttribPointer(l, sz, gl.FLOAT, false, 0, 0); return true; };
                let bound = 0;
                for (const w of [1, 8, 20]) {
                    gl.viewport(0, 0, 200, 120); gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT);
                    gl.useProgram(mp);
                    bound = [att(bp, "aPosition", 3), att(bpr, "aPrevious", 3), att(bn, "aNext", 3),
                             att(bs, "aSide", 1), att(ba, "aAlong", 1)].filter(Boolean).length;
                    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, bi);
                    gl.uniformMatrix4fv(gl.getUniformLocation(mp, "uViewProj"), false, IDENT);
                    gl.uniform2f(gl.getUniformLocation(mp, "uResolution"), 200, 120);
                    gl.uniform1f(gl.getUniformLocation(mp, "uWidth"), w);
                    gl.uniform1f(gl.getUniformLocation(mp, "uDash"), 0);
                    gl.uniform4f(gl.getUniformLocation(mp, "uColor"), 1, 1, 1, 1);
                    gl.drawElements(gl.TRIANGLES, m.count, gl.UNSIGNED_INT, 0);
                    mesh[w] = rows();
                }
                return { range: [range[0], range[1]], naive, mesh, bound, err: gl.getError() };
            }, src);
            if (r.noGL) { console.log("  ----  SKIPPED: no WebGL2 context in this browser build"); }
            else {
                console.log(`  driver ALIASED_LINE_WIDTH_RANGE: [${r.range[0]}, ${r.range[1]}]`);
                console.log(`  painted rows, gl.LINES + gl.lineWidth(w): ${JSON.stringify(r.naive)}`);
                console.log(`  painted rows, meshLine uWidth = w       : ${JSON.stringify(r.mesh)}`);
                ok("!! *** THE DRIVER ITSELF SAYS IT SUPPORTS ONLY WIDTH 1 ***", r.range[1] <= 1,
                    "ALIASED_LINE_WIDTH_RANGE -- not folklore, the value the context reports");
                ok("!! *** gl.lineWidth CHANGES NOTHING: the same painted width at 1, 8 and 20 ***",
                    r.naive[1] === r.naive[8] && r.naive[8] === r.naive[20],
                    `${r.naive[1]}, ${r.naive[8]}, ${r.naive[20]} rows -- the call succeeds and does nothing`);
                ok("!! *** THE MESH LINE PAINTS THE WIDTH IT WAS ASKED FOR ***",
                    r.mesh[8] === 8 && r.mesh[20] === 20,
                    `${r.mesh[1]}, ${r.mesh[8]}, ${r.mesh[20]} rows for widths 1, 8, 20`);
                ok("...and all five attributes bound, so nothing was silently skipped", r.bound === 5);
                ok("no GL error was raised", r.err === 0);
            }
        } finally { await browser.close(); }
    }
}

// ---- 7. WHAT THE TREE ALREADY HAD ----------------------------------------------------------------------
console.log("\n7. the claim about the gap, kept honest");
{
    const beam = fs.readFileSync(path.join(ROOT, "render", "BeamRibbonRenderer.js"), "utf8");
    const spine = fs.readFileSync(path.join(ROOT, "render", "sweptSpine.js"), "utf8");
    ok("BeamRibbonRenderer exists and is a WORLD-space single quad, not a polyline",
        /width axis/.test(beam) && /constant in world units/.test(beam));
    ok("sweptSpine exists and is a world-space TUBE along a spine", /profileRing|rotationMinimizingFrames/.test(spine));
    // the gap is the intersection: joins, and a width in pixels
    const files = [];
    (function walk(d) {
        for (const e of fs.readdirSync(d, { withFileTypes: true })) {
            if (["node_modules", ".git", "vendor"].includes(e.name)) continue;
            const p = path.join(d, e.name);
            if (e.isDirectory()) walk(p); else if (/\.(js|mjs)$/.test(e.name)) files.push(p);
        }
    })(ROOT);
    const miterers = files.filter((f) => /miterFactor|shouldBevel/.test(codeOnly(fs.readFileSync(f, "utf8"))))
        .map((f) => path.relative(ROOT, f)).filter((f) => !f.includes("selfcheck"));
    ok("!! exactly one module in the tree computes a miter, and it is this one",
        miterers.length === 1 && miterers[0] === path.join("render", "meshLine.mjs"), miterers.join(", ") || "none");
    // COUNT CALL SITES, NOT FILES, AND EXCLUDE THIS ONE. Two files draw twice, and this gate contains the
    // string in order to check for it -- so a naive file count says 6 where the module header says seven
    // places. The header is right; the first version of this check was counting itself.
    const SELF = path.join("tools", "ship", "meshLine-selfcheck.mjs");
    let sites = 0;
    const users = [];
    for (const f of files) {
        const rel = path.relative(ROOT, f);
        if (rel === SELF) continue;
        const n = (codeOnly(fs.readFileSync(f, "utf8")).match(/gl\.LINES|gl\.LINE_STRIP|gl\.LINE_LOOP/g) || []).length;
        if (n) { sites += n; users.push(`${rel}${n > 1 ? " x" + n : ""}`); }
    }
    console.log(`  still drawing gl.LINES, all one pixel wide: ${sites} call sites in ${users.length} files -- ${users.join(", ")}`);

    // *** v4472 -- ONE ASSERTION WAS CARRYING TWO CLAIMS, AND IT REPORTED THE WRONG ONE AS FALSE. ***
    //
    // This read `sites === 7 && users.length === 5` under the label "the seven call sites the module header
    // names are still there". Those are different claims: the label is about THE NAMED SEVEN (nothing was
    // silently converted or deleted), the arithmetic is a tree-wide ratchet (nothing new appeared). When
    // gfx/device.js arrived the gate printed "the seven call sites... are still there -- 8 sites in 6 files",
    // which reads as though some of the seven had gone missing. ALL SEVEN ARE EXACTLY WHERE THEY WERE. The
    // gate was right that something changed and wrong about what, and it was in the exiled bucket -- recorded
    // OWED at v4425 -- so the misreport sat there unread.
    //
    // *** AND THE ARRIVAL IS NOT AN EIGHTH CALL SITE. *** gfx/device.js does not draw anything: line 151 is
    // the device layer's topology switch, `d.topology === "line-list" ? gl.LINES : gl.TRIANGLES`, added at
    // v4301 -- seventy-six versions after this module's header enumerated the tree. It is a DIFFERENT KIND of
    // thing and a worse one for this module's purposes: a named call site is one place that chose a one-pixel
    // line, while a topology switch is every pipeline that ever asks for "line-list", which an enumeration of
    // call sites structurally cannot see. So it is named as its own fact rather than folded into a count that
    // would make it look like a seventh wireframe.
    const NAMED = Object.freeze({
        "ev/galaxyMap.js": 2, "rig/RigSystem.js": 2, "demos/p3d/p3dDemo.js": 1,
        "render/entityDebugRenderer.js": 1, "render/voxelhighlight.js": 1,
    });
    const GENERIC_PATHS = Object.freeze(["gfx/device.js"]);
    const countIn = (rel) => {
        try { return (codeOnly(fs.readFileSync(path.join(ROOT, rel), "utf8")).match(/gl\.LINES|gl\.LINE_STRIP|gl\.LINE_LOOP/g) || []).length; }
        catch { return 0; }
    };
    // One function does the comparing, so the control below exercises the SAME instance the live check does
    // rather than a second copy of the rule -- v4471's lesson, from a repair whose control re-implemented the
    // thing it controlled and passed while the live one was sabotaged.
    const disagreementsIn = (table) => Object.entries(table).filter(([rel, n]) => countIn(rel) !== n);
    const missing = disagreementsIn(NAMED);
    ok("!! the seven call sites the module header names are still there, and still one pixel wide",
        missing.length === 0 && Object.values(NAMED).reduce((a, b) => a + b, 0) === 7,
        missing.length
            ? missing.map(([rel, n]) => `${rel}: header says ${n}, tree has ${countIn(rel)}`).join("; ")
            : `7 draws in ${Object.keys(NAMED).length} files, each counted where the header names it -- ` +
              Object.entries(NAMED).map(([r, n]) => r.split("/").pop() + (n > 1 ? " x" + n : "")).join(", "));

    // *** THE COMPARISON IS PROVED TO FAIL, BECAUSE EVERY ROW OF NAMED AGREES AND AGREEMENT IS NOT EVIDENCE.
    // *** Sabotaging `missing` to a literal `[]` went 0 RED: on a table where nothing disagrees, the computed
    // answer and the empty literal are the same value. The control feeds disagreementsIn a count that is
    // deliberately wrong for a file that really exists, so the function is shown finding a disagreement rather
    // than merely reporting none. WHAT THIS STILL DOES NOT CATCH is hardcoding the CALL above -- no check can
    // tell a computation from the literal it currently equals, and past that point the edit is to the check.
    const control = disagreementsIn({ "render/voxelhighlight.js": 99 });
    ok("  and that comparison is shown FAILING, since a table where every row agrees proves nothing",
        control.length === 1 && control[0][0] === "render/voxelhighlight.js",
        `the same disagreementsIn(), given voxelhighlight at 99 draws, returns ${control.length} disagreement(s) -- ` +
        `so the empty answer above is a measurement and not the shape of the function`);
    // *** AND THE COUNTER IS PROVED TO READ THE TREE RATHER THAN THE TABLE, WHICH THE CONTROL ABOVE DOES NOT
    // ESTABLISH. *** Sabotaging countIn to `return NAMED[rel] ?? 0` went 0 RED past both checks above: the
    // live comparison agrees with itself, and the control's deliberately wrong 99 still differs from the
    // table's 1, so it still finds its one disagreement. THE MEASUREMENT AND THE EXPECTATION HAD BECOME ONE
    // OBJECT and every check downstream was comparing NAMED with NAMED.
    //
    // gfx/device.js settles it because it is the one file in this section with a draw that is DELIBERATELY
    // ABSENT from NAMED -- it is a mechanism, not a call site. A counter that consults the table answers 0 for
    // it; a counter that reads the file answers 1.
    ok("  and the counter reads the TREE, not the table -- checked on the one drawing file NAMED omits",
        countIn("gfx/device.js") === 1 && !("gfx/device.js" in NAMED),
        `countIn("gfx/device.js") = ${countIn("gfx/device.js")} while NAMED has no entry for it. A counter ` +
        `that returned the expected value would say 0 here and agree with every other check in this section`);

    const normalisedRel = (u) => u.replace(/ x\d+$/, "");
    const unexpected = users.map(normalisedRel).filter((r) => !(r in NAMED) && !GENERIC_PATHS.includes(r));
    ok("  and nothing outside them draws a one-pixel line, except the device layer's topology switch",
        unexpected.length === 0,
        unexpected.length
            ? "NEW: " + unexpected.join(", ") + " -- a new one-pixel draw, which is the thing render/meshLine.mjs exists to stop being necessary"
            : `${sites} sightings in ${users.length} files: the named 7, plus ${GENERIC_PATHS.filter((g) => users.some((u) => normalisedRel(u) === g)).join(", ") || "none"}`);

    ok("  and the device-layer switch is a MECHANISM, not a call site, so it is counted apart from the seven",
        // *** noComments, NOT codeOnly, AND THE FIRST DRAFT USED THE WRONG ONE. *** sourceScan's codeOnly
        // blanks STRING BODIES as well as comments, which is what makes it right for "does this file name a
        // vendor path" and wrong for this: the construct being asserted CONTAINS a string literal, so under
        // codeOnly the text "line-list" is gone before the regex sees it and this check COULD NEVER PASS. It
        // failed on a tree where the line is plainly present, which is the only reason the mistake surfaced.
        // noComments keeps the code and drops the prose, so line 150's comment about the switch cannot satisfy
        // a check about the switch.
        GENERIC_PATHS.every((g) => {
            const src = noComments(fs.readFileSync(path.join(ROOT, g), "utf8"));
            return /topology\s*===\s*"line-list"\s*\?\s*gl\.LINES/.test(src);
        }),
        `gfx/device.js turns topology "line-list" into gl.LINES for ANY pipeline that asks. The header's ` +
        `enumeration is of places that chose a line; this is the place that grants one, and counting it as an ` +
        `eighth wireframe would say the tree drew one more debug overlay when what it grew was a general path`);
}

console.log("\n----  WHAT THIS DOES NOT CLAIM");
console.log("      THAT ANY EXISTING CALL SITE HAS BEEN CONVERTED. None has. The seven gl.LINES draws, in");
console.log("      five files, are debug wireframes, a galaxy map and a rig overlay, and each has its own");
console.log("      question -- whether a thicker line reads better or merely bigger -- that a gate cannot");
console.log("      answer. What is here is the geometry, the shader, a page drawing both ways side by side,");
console.log("      and a measurement of which one honours the width. Round joins and caps are NOT here: the");
console.log("      miter is capped by falling back to the limit, a bevel in effect rather than by name.");

console.log("\nmeshLine-selfcheck: " + (fails ? fails + " FAILED" : "all checks pass"));
process.exit(fails ? 1 : 0);
