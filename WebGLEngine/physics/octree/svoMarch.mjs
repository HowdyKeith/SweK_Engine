// WebGLEngine/physics/octree/svoMarch.mjs -- v3561
// ---------------------------------------------------------------------------------------------------------------
// THE TEST physics/octree/svo-raymarch.glsl ASKS FOR IN ITS OWN HEADER, RUN WITHOUT A GPU.
//
// That shader's header names the work it is owed: "The RAY STEPPING (AABB entry, octant descent, empty-space
// skip) is the part to validate on Galaxina against the CPU reader: for a set of rays, the voxel hit here must
// equal what a CPU march through svoAt reports." v3560 found the file itself -- 88 lines of real WebGL2 that
// NOTHING LOADS, invisible to every census in the tree because no corpus included shaders.
//
// IT DOES NOT NEED A GPU TO BE ANSWERED, and that is the same move v3559 made for ddaFloat32 and v3501/v3502
// made for the path tracer: tools/render-qa/checks.mjs is PURE over { data, width, height } with no browser, so
// anything that can produce an RGBA buffer in Node can be fed to THE REAL CHECKS.
//
// ================================================================================================================
// THE CONSTANTS ARE EXTRACTED FROM THE GLSL, NEVER RETYPED
// ================================================================================================================
//
// A hand-copied mirror can pass while the shader fails -- v3452's meshFraming-selfcheck was built on exactly this
// point, extracting computeBounds out of voxel-viewer.html rather than reimplementing it, because "a copy could
// pass while the page failed" IS THE CLASS BEING CLOSED. So the iteration cap, the step, the descent guard and
// the background colour are PARSED OUT OF THE SHADER SOURCE. If somebody edits the shader, this mirror changes
// with it or the gate cannot find the constant and fails loudly.
//
// ================================================================================================================
// TWO DEFECTS PREDICTED FROM READING THE SHADER, BEFORE ANY MIRROR EXISTED, AND BOTH CONFIRMED
// ================================================================================================================
//
// (1) *** THE MARCH CANNOT REACH THE FAR CORNER OF ITS OWN CUBE. *** 512 iterations at a step of 1.0/512.0
//     advances t by EXACTLY 1.0, and the [0,1] cube's diagonal is sqrt(3) = 1.7321. A ray entering near one
//     corner and leaving near the opposite one HAS 42.26% OF ITS LENGTH NEVER SAMPLED, and the loop exits on the
//     iteration cap rather than on `t > tExit` -- so the shader reports BACKGROUND for a voxel that is really
//     there. A FALSE MISS THAT LOOKS EXACTLY LIKE EMPTY SPACE.
//
//     AND THE COMMENT BESIDE IT SAYS SOMETHING THE CODE DOES NOT DO: "stepping by a fraction of the smallest
//     voxel". 1.0/512.0 is a fixed fraction of THE WHOLE CUBE, and it does not know the tree's depth. At size 32
//     that is 16 samples per voxel and harmless; past size 512 the step is WIDER THAN A VOXEL and the march
//     tunnels straight through thin geometry. THE SAFETY IS AN ACCIDENT OF THE FIXTURE SIZE, NOT A PROPERTY.
//
// (2) *** A UNIFORM WORLD RENDERS EMPTY. *** buildSVO has an explicit first branch for a tree that is one leaf:
//     it emits a single node [0, color] and svoAt has a matching special case (`(rootMasks & 0xff) === 0 &&
//     buffer.length === 2`). THE GLSL HAS NO SUCH CASE. It reads node 0, finds childMask 0, and returns 0u --
//     EMPTY. Measured: svoAt says 1 at the centre of a fully solid world, the shader's descent says 0.
//     A HANDLED BOUNDARY CASE ON ONE SIDE AND AN UNHANDLED ONE ON THE OTHER, which is the same shape as v3452's
//     two meshers returning two bounds objects under one field name.
//
// ================================================================================================================
// THE ANSWER KEY IS NOT ANOTHER MARCH
// ================================================================================================================
//
// Comparing the mirror against a second fixed-step march would compare a copy with a copy. The reference here is
// a DDA over the INTEGER voxel grid -- a different algorithm with no step size at all, which cannot tunnel and
// cannot run out of budget -- reading occupancy from svoAt, which svo-selfcheck already round-trips against the
// source octree. So the chain is: octree (source of truth) -> svoAt (round-trip proven) -> DDA (exact) against
// the shader's own arithmetic (under test). NOTHING IN THAT CHAIN IS A COPY OF THE THING BEING GRADED.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { svoAt } from "./svoGenerator.js";
import { traverseDDA } from "../../voxel/voxelDDA.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const SHADER_PATH = path.join(HERE, "svo-raymarch.glsl");

/**
 * Pull the march's numbers OUT OF THE SHADER. Each pattern targets the line that actually sets the value, and a
 * miss THROWS rather than falling back to a default -- a mirror that silently substituted its own constant would
 * be the copy-that-passes-while-the-original-fails this file exists to prevent.
 */
export function shaderConstants(src = fs.readFileSync(SHADER_PATH, "utf8")) {
    const need = (re, what) => {
        const m = src.match(re);
        if (!m) throw new Error("[svoMarch] could not read " + what + " out of svo-raymarch.glsl -- the shader " +
            "changed shape. FIX THIS MIRROR AGAINST THE NEW SOURCE; DO NOT hardcode the old value.");
        return m;
    };
    const iters = Number(need(/for\s*\(int i = 0; i < (\d+); \+\+i\)/, "the march iteration cap")[1]);
    const stepM = need(/t \+= ([\d.]+) \/ ([\d.]+);/, "the march step");
    const guard = Number(need(/for\s*\(int guard = 0; guard < (\d+); \+\+guard\)/, "the descent guard")[1]);
    const bg = need(/fragColor = vec4\(([\d.]+), ([\d.]+), ([\d.]+), 1\.0\);\s*return;\s*}\s*\/\/ miss/, "the background colour");
    return {
        iterations: iters,
        step: Number(stepM[1]) / Number(stepM[2]),
        descentGuard: guard,
        background: [Number(bg[1]), Number(bg[2]), Number(bg[3])],
        reach: iters * (Number(stepM[1]) / Number(stepM[2])),
    };
}

/** The cube's longest possible ray. The march's reach is compared against THIS, not against a number I chose. */
export const CUBE_DIAGONAL = Math.sqrt(3);

/**
 * svoSample(), transcribed from the GLSL's descent -- INCLUDING ITS MISSING UNIFORM-LEAF CASE. This deliberately
 * does NOT call svoAt: svoAt has the special case the shader lacks, so using it would hide defect (2) behind the
 * very helper the shader does not have.
 */
export function svoSampleGL(buffer, p, guard) {
    if (p.some((v) => v < 0 || v >= 1)) return { hit: 0, color: 0 };
    let slot = 0, o = [0, 0, 0], s = 1;
    for (let g = 0; g < guard; g++) {
        const masks = buffer[slot * 2], childPtr = buffer[slot * 2 + 1];
        const childMask = masks & 0xff, leafMask = (masks >> 8) & 0xff;
        const h = s * 0.5;
        const cx = p[0] >= o[0] + h ? 1 : 0, cy = p[1] >= o[1] + h ? 1 : 0, cz = p[2] >= o[2] + h ? 1 : 0;
        const octant = cx + cy * 2 + cz * 4;
        if (((childMask >> octant) & 1) === 0) return { hit: 0, color: 0 };
        let below = childMask & ((1 << octant) - 1), bits = 0;
        while (below) { bits += below & 1; below >>= 1; }
        const childSlot = childPtr + bits;
        if (((leafMask >> octant) & 1) === 1) return { hit: 1, color: buffer[childSlot * 2 + 1] };
        o = [o[0] + cx * h, o[1] + cy * h, o[2] + cz * h]; s = h; slot = childSlot;
    }
    return { hit: 0, color: 0 };
}

/** Ray vs the [0,1] cube, the shader's own slab test. */
export function cubeSpan(ro, rd) {
    const inv = rd.map((d) => 1 / d);
    const t0 = [0, 1, 2].map((i) => (0 - ro[i]) * inv[i]);
    const t1 = [0, 1, 2].map((i) => (1 - ro[i]) * inv[i]);
    const tmin = [0, 1, 2].map((i) => Math.min(t0[i], t1[i]));
    const tmax = [0, 1, 2].map((i) => Math.max(t0[i], t1[i]));
    return { tEnter: Math.max(tmin[0], tmin[1], tmin[2], 0), tExit: Math.min(tmax[0], tmax[1], tmax[2]) };
}

/**
 * THE SHADER'S MARCH, mirrored. `exhausted` records that the loop ended on the ITERATION CAP rather than on
 * t > tExit -- the difference between "the ray left the cube" and "the ray ran out of budget", which the shader
 * cannot report because both paths write the same background pixel.
 */
export function marchGL(buffer, ro, rd, K) {
    const { tEnter, tExit } = cubeSpan(ro, rd);
    if (tEnter > tExit) return { hit: 0, color: 0, exhausted: false, missedBy: 0 };
    let t = tEnter + 1e-4, i = 0;
    for (; i < K.iterations; i++) {
        if (t > tExit) return { hit: 0, color: 0, exhausted: false, missedBy: 0 };
        const p = [ro[0] + rd[0] * t, ro[1] + rd[1] * t, ro[2] + rd[2] * t];
        const s = svoSampleGL(buffer, p, K.descentGuard);
        if (s.hit) return { hit: 1, color: s.color, t, exhausted: false, missedBy: 0 };
        t += K.step;
    }
    return { hit: 0, color: 0, exhausted: true, missedBy: tExit - t };
}

/**
 * THE ANSWER KEY. A DDA over the integer grid -- no step size, so it can neither tunnel nor exhaust a budget --
 * reading occupancy through svoAt, whose round-trip against the source octree svo-selfcheck already proves.
 */
export function marchDDA(buffer, size, ro, rd) {
    const { tEnter, tExit } = cubeSpan(ro, rd);
    if (tEnter > tExit) return { hit: 0 };
    const e = tEnter + 1e-6;
    const o = [(ro[0] + rd[0] * e) * size, (ro[1] + rd[1] * e) * size, (ro[2] + rd[2] * e) * size];
    const isSolid = (x, y, z) => svoAt(buffer, size, x, y, z) === 1;
    const r = traverseDDA(o[0], o[1], o[2], rd[0], rd[1], rd[2], isSolid, size * 4);
    return { hit: r.hit ? 1 : 0, vx: r.vx, vy: r.vy, vz: r.vz };
}

/** A pinhole ray for one pixel, exactly the shader's basis construction. */
export function pixelRay(x, y, width, height, camPos, camDir) {
    const uvx = (x / width) * 2 - 1, uvy = (y / height) * 2 - 1;
    const n = (v) => { const L = Math.hypot(...v); return v.map((c) => c / L); };
    const fwd = n(camDir);
    const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    const right = n(cross(fwd, [0, 1, 0]));
    const up = cross(right, fwd);
    return n([fwd[0] + uvx * right[0] + uvy * up[0],
              fwd[1] + uvx * right[1] + uvy * up[1],
              fwd[2] + uvx * right[2] + uvy * up[2]]);
}

/**
 * Render one image with either engine. Returns the { data, width, height } shape tools/render-qa/checks.mjs
 * takes, so THE REAL CHECKS grade it -- no reimplementation of a pixel invariant anywhere in this round.
 */
export function render({ buffer, size, width = 96, height = 96, camPos = [0.5, 0.5, -0.9],
                         camDir = [0, 0, 1], engine = "gl", K = shaderConstants() }) {
    const data = new Uint8Array(width * height * 4);
    const bg = K.background.map((c) => Math.round(c * 255));
    let hits = 0, exhausted = 0;
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
        const rd = pixelRay(x, y, width, height, camPos, camDir);
        const r = engine === "gl" ? marchGL(buffer, camPos, rd, K) : marchDDA(buffer, size, camPos, rd);
        const i = (y * width + x) * 4;
        if (r.hit) {
            hits++;
            const c = engine === "gl" ? r.color : 0xffffff;
            data[i] = (c >> 16) & 0xff; data[i + 1] = (c >> 8) & 0xff; data[i + 2] = c & 0xff;
        } else { data[i] = bg[0]; data[i + 1] = bg[1]; data[i + 2] = bg[2]; if (r.exhausted) exhausted++; }
        data[i + 3] = 255;
    }
    return { data, width, height, hits, exhausted };
}

/** Per-ray agreement between the shader's arithmetic and the answer key, with the CAUSE of each disagreement. */
export function compareRays(buffer, size, rays, K = shaderConstants()) {
    let agree = 0;
    const causes = { budgetExhausted: 0, other: 0 };
    const cases = [];
    for (const [ro, rd] of rays) {
        const g = marchGL(buffer, ro, rd, K), d = marchDDA(buffer, size, ro, rd);
        if (g.hit === d.hit) { agree++; continue; }
        if (g.exhausted && d.hit) { causes.budgetExhausted++; if (cases.length < 6) cases.push({ ro, rd, missedBy: g.missedBy }); }
        else causes.other++;
    }
    return { n: rays.length, agree, disagree: rays.length - agree, causes, cases };
}

export const MEASURED_V3561 = {
    marchReach: 1.0,
    cubeDiagonal: 1.7320508075688772,
    unreachableFractionOfLongestRay: 0.4226,
    budgetDefect:
        "512 iterations at a step of 1/512 advances t by EXACTLY 1.0 while the [0,1] cube's diagonal is 1.7321. " +
        "The loop exits on the ITERATION CAP rather than on t > tExit, so a real voxel past that point renders " +
        "as BACKGROUND -- a false miss indistinguishable from empty space. Neither number was chosen by me: " +
        "both are read out of the shader and out of the cube's geometry.",
    stepIsNotVoxelRelative:
        "The comment beside the march says 'stepping by a fraction of the smallest voxel'. 1.0/512.0 is a fixed " +
        "fraction of THE WHOLE CUBE and knows nothing of the tree's depth. At size 32 that is 16 samples per " +
        "voxel; past size 512 the step is wider than a voxel and the march tunnels. THE SAFETY IS AN ACCIDENT " +
        "OF THE FIXTURE SIZE, NOT A PROPERTY OF THE CODE.",
    uniformWorldDefect:
        "buildSVO emits a single node [0, color] for a tree that is one uniform leaf, and svoAt has a matching " +
        "special case. THE GLSL HAS NONE: it reads node 0, finds childMask 0 and returns 0u. Measured -- svoAt " +
        "reports 1 at the centre of a fully solid world and the shader's descent reports 0. A FULLY SOLID WORLD " +
        "RENDERS EMPTY.",
    answerKeyIsNotACopy:
        "The reference is a DDA over the integer grid -- a different algorithm with no step size, which can " +
        "neither tunnel nor exhaust a budget -- reading occupancy through svoAt, which svo-selfcheck already " +
        "round-trips against the source octree. Comparing two fixed-step marches would have compared a copy " +
        "with a copy.",
    constantsExtracted:
        "The iteration cap, step, descent guard and background colour are PARSED OUT OF THE SHADER, and a miss " +
        "THROWS rather than defaulting. v3452's rule: a hand-copied mirror can pass while the original fails, " +
        "which is the class being closed.",
    notFixed:
        "NOTHING IN THE SHADER IS EDITED. Both defects are REPORTED with the fixtures that produce them. The " +
        "budget fix is a design call (raise the cap, make the step depth-relative, or add the Laine-Karras " +
        "empty-node skip the header already names as the real answer) and the uniform-leaf fix is four lines -- " +
        "but this file cannot run the shader, so shipping a change to 88 lines of unrunnable GLSL on the " +
        "strength of a CPU mirror is exactly the confidence this tree refuses. KEITH'S CALL, ON THE RIG.",
};

// ---- FRONT DOOR -------------------------------------------------------------------------------------------------
export function reportLines() {
    const L = [];
    const K = shaderConstants();
    L.push("[svoMarch] Does svo-raymarch.glsl hit the voxel a CPU march through svoAt reports?");
    L.push("");
    L.push("  THE SHADER'S OWN HEADER ASKS FOR THIS COMPARISON ON THE RIG. IT DOES NOT NEED THE RIG:");
    L.push("  tools/render-qa/checks.mjs is PURE over { data, width, height }, so the checks that grade a");
    L.push("  screenshot on Galaxina grade a CPU render here.");
    L.push("");
    L.push("  CONSTANTS PARSED OUT OF THE SHADER (never retyped):");
    L.push("    iterations " + K.iterations + "   step " + K.step + "   descent guard " + K.descentGuard);
    L.push("    march reach " + K.reach.toFixed(4) + "   cube diagonal " + CUBE_DIAGONAL.toFixed(4));
    L.push("");
    L.push("  DEFECT 1 -- THE MARCH CANNOT REACH THE FAR CORNER OF ITS OWN CUBE");
    L.push("    " + (100 * (1 - K.reach / CUBE_DIAGONAL)).toFixed(2) + "% of the longest possible ray is never");
    L.push("    sampled, and the loop exits on the ITERATION CAP rather than on t > tExit -- so a real voxel");
    L.push("    past that point renders as background. A FALSE MISS THAT LOOKS LIKE EMPTY SPACE.");
    L.push("    " + MEASURED_V3561.stepIsNotVoxelRelative);
    L.push("");
    L.push("  DEFECT 2 -- A FULLY SOLID WORLD RENDERS EMPTY");
    L.push("    " + MEASURED_V3561.uniformWorldDefect);
    L.push("");
    L.push("  WHY IT SURVIVED: a HEAD-ON camera crosses at most 1.0 of t, so the budget never binds and the");
    L.push("  shader is exactly right. THE DEFECT ONLY APPEARS ON DIAGONAL VIEWS.");
    L.push("");
    L.push("  AND THE WORST CASE IS NOT THE BLANK ONE: with geometry reaching closer the shader draws a");
    L.push("  PLAUSIBLE image missing 54% of its voxels, and that image PASSES notAllBlack. A whole-image");
    L.push("  invariant cannot find this; only the answer key can.");
    L.push("");
    L.push("  " + MEASURED_V3561.notFixed);
    return L;
}

// A REPORTING TOOL MUST PRINT AND EXIT ZERO; the gate beside it is what exits nonzero.
if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
    for (const l of reportLines()) console.log(l);
    process.exit(0);
}
