// WebGLEngine/physics/octree/svoMarch-selfcheck.mjs -- v3561
//
// Run: node physics/octree/svoMarch-selfcheck.mjs
// RUNTIME 9s MEASURED with date(1) around the run. Cheap because every fixture is 32^3 at 96x96 -- the point is
// the DISAGREEMENT, and a bigger image would not make the cause any clearer. Not remembered: v3211-v3213 found a
// wrong stated runtime in 59 of 82 headers.
//
// *** THIS IS THE render-QA ROUND, WITH NO GPU. *** tools/render-qa/checks.mjs is PURE over
// { data, width, height }, so the checks that grade a screenshot on Keith's rig grade a CPU render here -- and
// the shader's own header asked for exactly this comparison. NO PIXEL INVARIANT IS REIMPLEMENTED: the real
// notAllBlack, notUniform and colorPresent are imported and run.
//
// THE TWO DEFECTS WERE PREDICTED FROM READING THE GLSL BEFORE ANY MIRROR EXISTED, and the fixtures were built to
// make each one CHANGE AN ANSWER rather than merely be describable. Section 5 is the control that stops the
// whole file being a story about my transcription.
"use strict";
import fs from "node:fs";
import { buildOctree } from "./octree.js";
import { buildSVO, svoAt } from "./svoGenerator.js";
import { shaderConstants, render, compareRays, svoSampleGL, marchGL, marchDDA,
         CUBE_DIAGONAL, SHADER_PATH, MEASURED_V3561 } from "./svoMarch.mjs";
import { notAllBlack, notUniform, colorPresent, stats, runCheck } from "../../tools/render-qa/checks.mjs";

let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const report = (l, n = "") => console.log(`  ----  ${l}${n ? "   " + n : ""}`);

console.log("svoMarch-selfcheck -- the test svo-raymarch.glsl asks for in its own header\n");
const K = shaderConstants();
const COLOR = 0xff8040;

// ---------------------------------------------------------------------------
console.log("1. THE CONSTANTS COME OUT OF THE SHADER, AND A SHAPE CHANGE FAILS LOUDLY");
{
    report("iterations / step / guard", K.iterations + " / " + K.step + " / " + K.descentGuard);
    report("march reach vs cube diagonal", K.reach.toFixed(4) + " vs " + CUBE_DIAGONAL.toFixed(4));
    ok("!! every constant is PARSED from svo-raymarch.glsl, not retyped",
        K.iterations === 512 && K.descentGuard === 32 && K.reach > 0,
        "v3452's rule: A HAND-COPIED MIRROR CAN PASS WHILE THE ORIGINAL FAILS, which is the class being closed. " +
        "meshFraming-selfcheck extracted computeBounds out of voxel-viewer.html for the same reason.");
    let threw = false;
    try { shaderConstants("// a shader with none of those lines\nvoid main() {}"); } catch { threw = true; }
    ok("!! ...and a shader whose shape changed THROWS rather than falling back to a default", threw,
        "a silent default would let this mirror keep grading the constants of a shader that no longer exists");
}

// ---------------------------------------------------------------------------
console.log("\n2. *** DEFECT ONE: THE MARCH CANNOT REACH THE FAR CORNER OF ITS OWN CUBE ***");
{
    ok("!! 512 steps of 1/512 advance t by exactly 1.0, and the cube's diagonal is sqrt(3)",
        Math.abs(K.reach - 1) < 1e-12 && CUBE_DIAGONAL > 1.7,
        (100 * (1 - K.reach / CUBE_DIAGONAL)).toFixed(2) + "% of the longest possible ray is NEVER SAMPLED. " +
        "*** NEITHER NUMBER IS MINE: the reach is read out of the shader and the diagonal is the cube's own " +
        "geometry. *** The loop exits on the ITERATION CAP, not on t > tExit, so a real voxel past that point " +
        "renders as BACKGROUND -- A FALSE MISS INDISTINGUISHABLE FROM EMPTY SPACE.");

    // A FIXTURE THAT MAKES IT CHANGE AN ANSWER, not merely be describable: geometry in the FAR corner only,
    // camera outside the NEAR corner, looking down the main diagonal.
    const svo = buildSVO(buildOctree(32, (x, y, z) => (x >= 20 && y >= 20 && z >= 20) ? 1 : 0), COLOR);
    const cam = [-0.1, -0.1, -0.1], dir = [1, 1, 1];
    const gl = render({ buffer: svo.buffer, size: 32, camPos: cam, camDir: dir, engine: "gl", K });
    const dda = render({ buffer: svo.buffer, size: 32, camPos: cam, camDir: dir, engine: "dda" });
    report("shader mirror", gl.hits + " hits, " + gl.exhausted + " pixels hit the ITERATION CAP");
    report("DDA answer key", dda.hits + " hits");

    ok("!! *** THE GEOMETRY IS THERE AND THE SHADER RENDERS NOTHING ***", dda.hits > 0 && gl.hits === 0,
        "the answer key finds " + dda.hits + " lit pixels; the shader's own arithmetic finds " + gl.hits +
        ". A BLANK IMAGE OF A WORLD THAT IS NOT BLANK -- and on a GPU it would look like a correct render of " +
        "empty space, which is why nobody would have found it by looking.");

    const rays = [];
    for (let i = 0; i < 2000; i++) {
        const a = i * 0.017, b = (i % 53) * 0.021;
        const v = [1 + 0.25 * Math.cos(a), 1 + 0.25 * Math.sin(b), 1 + 0.25 * Math.sin(a)];
        const L = Math.hypot(...v);
        rays.push([cam, v.map((c) => c / L)]);
    }
    const c = compareRays(svo.buffer, 32, rays, K);
    report("per-ray", c.agree + "/" + c.n + " agree, " + c.disagree + " disagree   causes " + JSON.stringify(c.causes));
    ok("!! ...and EVERY disagreement is attributed to the budget, with none unexplained",
        c.disagree > 0 && c.causes.budgetExhausted === c.disagree && c.causes.other === 0,
        "*** `other: 0` IS THE LOAD-BEARING HALF. *** If the descent had been transcribed wrongly, " +
        "disagreements would land there instead, and this whole file would be a story about my mirror rather " +
        "than a finding about the shader. Worst ray fell short by t = " +
        (c.cases[0] ? c.cases[0].missedBy.toFixed(4) : "-") + ".");
}

// ---------------------------------------------------------------------------
console.log("\n3. *** DEFECT TWO: A FULLY SOLID WORLD RENDERS EMPTY ***");
{
    const svo = buildSVO(buildOctree(32, () => 1), COLOR);
    report("uniform world nodeCount", String(svo.nodeCount) + "   buffer " + Array.from(svo.buffer).join(", "));
    const key = svoAt(svo.buffer, svo.size, 16, 16, 16);
    const gl = svoSampleGL(svo.buffer, [0.5, 0.5, 0.5], K.descentGuard);
    report("svoAt(centre) vs shader descent", key + " vs " + gl.hit);
    ok("!! buildSVO and svoAt BOTH handle the one-leaf tree, and the GLSL does not",
        key === 1 && gl.hit === 0,
        "buildSVO's first branch emits a single node [0, color] and svoAt matches it with " +
        "`(rootMasks & 0xff) === 0 && buffer.length === 2`. THE SHADER READS node 0, FINDS childMask 0 AND " +
        "RETURNS 0u. *** A HANDLED BOUNDARY CASE ON ONE SIDE AND AN UNHANDLED ONE ON THE OTHER -- v3452's two " +
        "meshers returning two different bounds objects under one field name, in a second subsystem. ***");
    const img = render({ buffer: svo.buffer, size: 32, engine: "gl", K });
    ok("...and it is not a corner case of one pixel: the whole image is background", img.hits === 0,
        "every one of " + (img.width * img.height) + " rays reports empty in a world that is solid everywhere");
}

// ---------------------------------------------------------------------------
console.log("\n4. *** THE REAL render-QA CHECKS GRADE BOTH IMAGES -- NO GPU, NO REIMPLEMENTATION ***");
{
    const svo = buildSVO(buildOctree(32, (x, y, z) => (x >= 20 && y >= 20 && z >= 20) ? 1 : 0), COLOR);
    const cam = [-0.1, -0.1, -0.1], dir = [1, 1, 1];
    const gl = render({ buffer: svo.buffer, size: 32, camPos: cam, camDir: dir, engine: "gl", K });
    const dda = render({ buffer: svo.buffer, size: 32, camPos: cam, camDir: dir, engine: "dda" });

    const glBlack = notAllBlack(gl, { minNonBlackFrac: 0.02 });
    const ddaBlack = notAllBlack(dda, { minNonBlackFrac: 0.02 });
    report("notAllBlack(shader mirror)", (glBlack.ok ? "PASS" : "FAIL") + "  " + glBlack.msg);
    report("notAllBlack(answer key)", (ddaBlack.ok ? "PASS" : "FAIL") + "  " + ddaBlack.msg);

    // *** THE FIRST FIXTURE HERE FAILED THIS LINE AND THE FIXTURE WAS THE THING THAT MOVED, NOT THE CHECK. ***
    // Geometry at x,y,z >= 26 lit only 42 of 9216 pixels -- nonBlackFrac 0.0046 -- so notAllBlack correctly
    // failed the CORRECT image too, and the comparison proved nothing. The honest fix is a fixture whose right
    // answer clears the harness's SHIPPED default (0.02), not a threshold lowered until my fixture passed.
    // LOWERING minNonBlackFrac WOULD HAVE BEEN TUNING A CHECK TO AGREE WITH ME.
    ok("!! *** THE HARNESS THAT NEEDS A GPU JUST CAUGHT THIS WITHOUT ONE ***",
        ddaBlack.ok && !glBlack.ok,
        "the SAME notAllBlack that grades a screenshot on Galaxina passes the answer key and FAILS the " +
        "shader's arithmetic. checks.mjs is pure over { data, width, height } and says so in its own header; " +
        "v3501/v3502 fed a converged path trace to it and v3559 used the same split for ddaFloat32. *** THE " +
        "SHADER'S HEADER ASKED FOR THIS COMPARISON ON THE RIG. IT DID NOT NEED THE RIG. ***");

    const uni = notUniform(dda, { minUniqueColors: 2 });
    const col = colorPresent(gl, { rgb: [255, 128, 64], tol: 24, minFrac: 0.001 });
    report("notUniform(answer key)", (uni.ok ? "PASS" : "FAIL") + "  " + uni.msg);
    report("colorPresent(shader, the voxel colour)", (col.ok ? "PASS" : "FAIL") + "  " + col.msg);
    ok("!! ...and colorPresent confirms WHICH WAY the failure runs: the voxel colour is absent from the shader image",
        !col.ok && uni.ok,
        "notAllBlack alone cannot tell 'nothing drew' from 'the background drew'. THE VOXEL COLOUR 0xff8040 IS " +
        "SIMPLY NOT ON SCREEN, which is the specific claim -- and the answer key's image is not uniform, so " +
        "the comparison is between two real renders and not between two blank ones.");

    // TWO MORE READINGS THAT CHANGE HOW BAD THIS IS, BOTH MEASURED HERE RATHER THAN ASSERTED.
    const near = buildSVO(buildOctree(32, (x, y, z) => (x >= 14 && y >= 14 && z >= 14) ? 1 : 0), COLOR);
    const nGl = render({ buffer: near.buffer, size: 32, camPos: cam, camDir: dir, engine: "gl", K });
    const nDda = render({ buffer: near.buffer, size: 32, camPos: cam, camDir: dir, engine: "dda" });
    report("geometry reaching closer (>=14)", "shader " + nGl.hits + " hits vs answer key " + nDda.hits +
        "   MISSING " + (100 * (1 - nGl.hits / nDda.hits)).toFixed(1) + "%");
    ok("!! *** AND A PARTIAL RENDER IS WORSE NEWS THAN A BLANK ONE ***",
        nGl.hits > 0 && nGl.hits < nDda.hits && notAllBlack(nGl, {}).ok,
        "the shader draws " + nGl.hits + " of " + nDda.hits + " pixels -- MISSING " +
        (100 * (1 - nGl.hits / nDda.hits)).toFixed(1) + "% of the geometry -- AND PASSES notAllBlack at " +
        "nonBlackFrac " + stats(nGl).nonBlackFrac.toFixed(4) + ". *** A BLANK IMAGE IS AT LEAST SUSPICIOUS; A " +
        "PLAUSIBLE IMAGE SILENTLY MISSING MORE THAN HALF ITS GEOMETRY PASSES EVERY WHOLE-IMAGE INVARIANT THERE " +
        "IS. THAT IS WHY THE ANSWER KEY IS THE ROUND AND A PIXEL INVARIANT ALONE WOULD NOT HAVE FOUND THIS -- " +
        "the same reason v3452's black screen needed a reproduction rather than a null check. ***");

    const slab = buildSVO(buildOctree(32, (x, y, z) => z >= 24 ? 1 : 0), COLOR);
    const sGl = render({ buffer: slab.buffer, size: 32, camPos: [0.5, 0.5, -0.6], camDir: [0, 0, 1], engine: "gl", K });
    const sDda = render({ buffer: slab.buffer, size: 32, camPos: [0.5, 0.5, -0.6], camDir: [0, 0, 1], engine: "dda" });
    ok("!! ...and a HEAD-ON camera agrees perfectly, which is why this survived unnoticed",
        sGl.hits === sDda.hits && sGl.hits > 0,
        "an axis-aligned view crosses at most 1.0 of t, so the budget never binds and the shader is exactly " +
        "right (" + sGl.hits + " = " + sDda.hits + "). THE DEFECT ONLY APPEARS ON DIAGONAL VIEWS -- the ones " +
        "nobody sets up first when checking whether a new renderer works.");

    ok("the checks are the SHIPPED ones, reached through runCheck as the harness reaches them",
        runCheck(dda, { type: "notAllBlack", minNonBlackFrac: 0.02 }).ok === ddaBlack.ok,
        "routed through the manifest dispatcher, so this cannot drift from what render-qa.mjs actually runs");
}

// ---------------------------------------------------------------------------
console.log("\n5. THE CONTROL: THE MIRROR IS A MIRROR, AND NOTHING WAS FIXED");
{
    // If the transcription were wrong, section 2's finding would be about this file. So: on a fixture where the
    // budget is NOT the limit, the two engines must agree exactly.
    const svo = buildSVO(buildOctree(32, (x, y, z) => (x >= 8 && x < 24 && y >= 8 && y < 24 && z >= 8 && z < 24) ? 1 : 0), COLOR);
    const gl = render({ buffer: svo.buffer, size: 32, engine: "gl", K });
    const dda = render({ buffer: svo.buffer, size: 32, engine: "dda" });
    report("centred box, head-on camera", "shader " + gl.hits + " hits, answer key " + dda.hits + " hits");
    ok("!! where the budget is not the limit, the shader's descent agrees with the answer key EXACTLY",
        gl.hits === dda.hits && gl.hits > 0,
        "*** THIS IS WHAT MAKES SECTION 2 A FINDING ABOUT THE SHADER RATHER THAN ABOUT MY TRANSCRIPTION. *** " +
        "The buffer addressing -- node read, bitCount child offset, octant descent -- is faithful, which is " +
        "also what the shader's header claims is the ALREADY-VERIFIED half. Only the MARCH is broken.");

    const src = fs.readFileSync(SHADER_PATH, "utf8");
    ok("!! *** THE SHADER IS NOT EDITED, DELIBERATELY ***",
        /for \(int i = 0; i < 512; \+\+i\)/.test(src) && /t \+= 1\.0 \/ 512\.0;/.test(src),
        "both defects are REPORTED with the fixtures that produce them. *** THIS FILE CANNOT RUN THE SHADER. " +
        "Shipping a change to 88 lines of unrunnable GLSL on the strength of a CPU mirror is exactly the " +
        "confidence this tree refuses. *** The budget fix is a DESIGN CALL -- raise the cap, make the step " +
        "depth-relative, or add the Laine-Karras empty-node skip the header already names as the real answer -- " +
        "and the uniform-leaf fix is four lines. KEITH'S, ON THE RIG.");
    ok("...and the step's own comment is recorded as wrong rather than quietly corrected",
        /fraction of the smallest voxel/.test(src) && MEASURED_V3561.stepIsNotVoxelRelative.length > 0,
        "1.0/512.0 is a fraction of THE WHOLE CUBE and knows nothing of the tree's depth. At size 32 that is 16 " +
        "samples per voxel; past size 512 the step is wider than a voxel and the march tunnels. THE SAFETY IS " +
        "AN ACCIDENT OF THE FIXTURE SIZE.");
}

console.log(fails ? `\nsvoMarch-selfcheck: ${fails} FAILED` : "\nsvoMarch-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
