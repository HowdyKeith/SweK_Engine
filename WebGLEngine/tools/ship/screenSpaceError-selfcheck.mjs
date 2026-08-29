// WebGLEngine/tools/ship/screenSpaceError-selfcheck.mjs -- v4150
//
// Run: node tools/ship/screenSpaceError-selfcheck.mjs   (well under a second)
// Gated by tools/ship/selfchecks.mjs (auto-discovered).
//
// GATES render/screenSpaceError.mjs and the growth veto it feeds in world/DynamicGridRadius.js.
//
// *** THIS GATE EXISTS BECAUSE I REPORTED A TECHNIQUE THAT WAS NOT IN THE REPOSITORY I REPORTED IT FROM. ***
// Summarising DanWatkins/Terrain3D for Keith I called its transferable idea "the screen-space-error -> tess-level
// heuristic". Its terrain.tcs.glsl is a DISTANCE RAMP: lodForChunkPos() interpolates on distance(cameraPos,
// chunkCentre) between two hand-tuned uniforms and never projects anything. Section 4 below reads that shipped
// shader out of the clone and asserts what it actually contains, so the correction is checked rather than merely
// written down -- and so that nobody later "restores" a screen-space claim about that file.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { screenSpaceError, distanceForError, chunkGeometricError, levelFor, edgeLevel,
         growthWouldBeInvisible } from "../../render/screenSpaceError.js";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const report = (m) => console.log("  ....  " + m);
const DEG = Math.PI / 180;
console.log("screenSpaceError-selfcheck -- how big a detail actually is on the screen\n");

// ---- 1. THE FORMULA, CHECKED AGAINST GEOMETRY RATHER THAN AGAINST ITSELF -----------------------------------
{
    console.log("1. *** THE ARITHMETIC IS CHECKED AGAINST AN INDEPENDENTLY DERIVED NUMBER ***");
    // At distance d with vertical FOV t, the view frustum is 2*d*tan(t/2) tall in world units. A feature of that
    // exact size must therefore fill the viewport EXACTLY -- screenHeightPx pixels. That is a fact about
    // perspective, derived without reference to the implementation, so it grades the formula rather than echoing it.
    const d = 250, fov = 60 * DEG, h = 1080;
    const frustumHeight = 2 * d * Math.tan(fov / 2);
    const px = screenSpaceError({ geometricError: frustumHeight, distance: d, screenHeightPx: h, fovYRad: fov });
    ok("!! a feature exactly as tall as the frustum measures exactly the viewport height",
        Math.abs(px - h) < 1e-9, frustumHeight.toFixed(3) + " world units at d=" + d + " -> " + px.toFixed(6) + " px (want " + h + ")");
    ok("...and half that feature measures half the screen",
        Math.abs(screenSpaceError({ geometricError: frustumHeight / 2, distance: d, screenHeightPx: h, fovYRad: fov }) - h / 2) < 1e-9);

    // The three things a distance ramp cannot see, each shown to MOVE the answer at a fixed distance.
    const base = { geometricError: 1, distance: 100, fovYRad: 60 * DEG, screenHeightPx: 1080 };
    const deck = screenSpaceError({ ...base, screenHeightPx: 800 });
    const uhd  = screenSpaceError({ ...base, screenHeightPx: 2160 });
    const zoom = screenSpaceError({ ...base, fovYRad: 20 * DEG });
    const ref  = screenSpaceError(base);
    ok("!! *** RESOLUTION CHANGES THE ANSWER -- the same feature, the same distance ***", deck < ref && uhd > ref,
        "800px " + deck.toFixed(2) + " < 1080p " + ref.toFixed(2) + " < 2160p " + uhd.toFixed(2) + " px");
    ok("!! *** AND SO DOES ZOOM -- a narrower field of view magnifies at unchanged distance ***", zoom > ref * 2.5,
        "60deg " + ref.toFixed(2) + " -> 20deg " + zoom.toFixed(2) + " px");
    report("a distance ramp returns the SAME level for all four of those, which is the entire argument for this file");
    ok("...and pixels fall off as 1/distance, exactly", (() => {
        const a = screenSpaceError({ ...base, distance: 100 }), b = screenSpaceError({ ...base, distance: 400 });
        return Math.abs(a / b - 4) < 1e-9;
    })(), "4x the distance is exactly a quarter the pixels");
    ok("!! distanceForError inverts screenSpaceError", (() => {
        const dd = distanceForError({ geometricError: 2, targetPx: 3, screenHeightPx: 900, fovYRad: 50 * DEG });
        return Math.abs(screenSpaceError({ geometricError: 2, distance: dd, screenHeightPx: 900, fovYRad: 50 * DEG }) - 3) < 1e-9;
    })(), "a round trip, not a second copy of the algebra");
}

// ---- 2. THE REFUSALS: A BAD INPUT MUST NOT BECOME A PLAUSIBLE PIXEL COUNT -----------------------------------
{
    console.log("\n2. AN UNANSWERABLE QUESTION RETURNS NaN RATHER THAN A NUMBER SOMEBODY WOULD ACT ON");
    for (const [why, args] of [
        ["distance 0 (the eye is inside it)", { geometricError: 1, distance: 0, screenHeightPx: 1080, fovYRad: 1 }],
        ["negative distance",                 { geometricError: 1, distance: -5, screenHeightPx: 1080, fovYRad: 1 }],
        ["zero viewport",                     { geometricError: 1, distance: 10, screenHeightPx: 0, fovYRad: 1 }],
        ["negative error",                    { geometricError: -1, distance: 10, screenHeightPx: 1080, fovYRad: 1 }],
        ["a 180-degree field of view",        { geometricError: 1, distance: 10, screenHeightPx: 1080, fovYRad: Math.PI }],
        ["NaN in",                            { geometricError: 1, distance: NaN, screenHeightPx: 1080, fovYRad: 1 }],
    ]) ok("refuses: " + why, Number.isNaN(screenSpaceError(args)));
    ok("!! *** the 180-degree case matters because tan(t/2) DIVERGES there, and Infinity would read as 'infinite detail needed' ***",
        Number.isNaN(screenSpaceError({ geometricError: 1, distance: 10, screenHeightPx: 1080, fovYRad: Math.PI })) &&
        Number.isNaN(screenSpaceError({ geometricError: 1, distance: 10, screenHeightPx: 1080, fovYRad: Math.PI * 1.5 })),
        "the most expensive possible answer, produced by a division that failed rather than by a scene that needed it");
    ok("a full-detail mesh has EXACTLY zero error, not merely a small one", chunkGeometricError(1, 1) === 0,
        "step 1 is the reference the coarser meshes are wrong AGAINST, so its error is 0 by definition");
    ok("...and a coarser step is wrong by half what it skipped", chunkGeometricError(5, 2) === 4, "(5-1)/2 * 2");
}

// ---- 3. THE LADDER MOVES, AND IT PICKS THE CHEAPEST LEVEL THAT FITS ----------------------------------------
{
    console.log("\n3. *** THE LEVEL CHOSEN IS THE COARSEST THAT STILL FITS, AND IT ACTUALLY MOVES ***");
    const L = [1, 2, 4, 8, 16], h = 1080, fov = 60 * DEG;
    const steps = [200, 500, 2000, 4000, 8000].map((d) => levelFor({ levels: L, distance: d, screenHeightPx: h, fovYRad: fov }));
    ok("!! it is MONOTONE: never finer as the thing gets further away",
        steps.every((s, i) => i === 0 || s >= steps[i - 1]), "d 200/500/2000/4000/8000 -> step " + steps.join(", "));
    ok("!! ...and it genuinely SPANS the ladder rather than parking on one end",
        steps[0] === 1 && steps[steps.length - 1] === 16,
        "a chooser that returned the same level everywhere would pass a monotonicity check and be useless");
    ok("!! every chosen level's error really is within the target, checked one by one", (() => {
        for (const d of [200, 500, 2000, 4000, 8000]) {
            const s = levelFor({ levels: L, distance: d, screenHeightPx: h, fovYRad: fov });
            const px = screenSpaceError({ geometricError: chunkGeometricError(s, 1), distance: d, screenHeightPx: h, fovYRad: fov });
            if (px > 1 + 1e-9) return false;
        }
        return true;
    })(), "the claim is the PIXELS, not the ladder position");
    ok("!! ...and it is the COARSEST such level -- the next one up would overshoot", (() => {
        for (const d of [500, 2000, 4000]) {
            const s = levelFor({ levels: L, distance: d, screenHeightPx: h, fovYRad: fov });
            const next = L[L.indexOf(s) + 1];
            if (next === undefined) continue;
            const px = screenSpaceError({ geometricError: chunkGeometricError(next, 1), distance: d, screenHeightPx: h, fovYRad: fov });
            if (px <= 1) return false;              // a cheaper level fitted and was not taken
        }
        return true;
    })(), "coarsest-that-fits, not nearest -- the point is to spend as little as the target allows");
    ok("a looser target buys coarser meshes at the same distance",
        levelFor({ levels: L, distance: 1000, screenHeightPx: h, fovYRad: fov, targetPx: 2 }) >
        levelFor({ levels: L, distance: 1000, screenHeightPx: h, fovYRad: fov, targetPx: 1 }));
    ok("!! an unanswerable question yields the FINEST level, never the cheapest", (() => {
        return levelFor({ levels: L, distance: 0, screenHeightPx: h, fovYRad: fov }) === 1 &&
               levelFor({ levels: L, distance: NaN, screenHeightPx: h, fovYRad: fov }) === 1;
    })(), "*** THE FAILURE DIRECTION IS THE WHOLE POINT: a broken measurement must cost frames, never correctness. ***");
    ok("...and an empty ladder is null rather than an invented step", levelFor({ levels: [], distance: 10, screenHeightPx: 1, fovYRad: 1 }) === null);
}

// ---- 4. *** SUCCUMB TO YOUR NEIGHBOUR, AND WHAT THAT SHADER ACTUALLY SAYS *** -------------------------------
{
    console.log("\n4. *** THE ONE IDEA TAKEN FROM Terrain3D -- AND THE CORRECTION TO WHAT I SAID IT CONTAINED ***");
    ok("!! a shared edge takes the FINER of the two levels (numerically the smaller step)",
        edgeLevel(2, 8) === 2 && edgeLevel(8, 2) === 2 && edgeLevel(4, 4) === 4,
        "*** BACKWARDS THIS PRODUCES TERRAIN THAT IS CORRECT IN A SCREENSHOT AND CRACKS WHENEVER THE CAMERA " +
        "MOVES: take the coarser and the finer patch's extra edge vertices land on nothing -- a T-junction, " +
        "seen as a one-pixel seam of background between two triangles meant to be touching. ***");
    ok("...and a missing neighbour (the edge of the world) yields the level we do have", edgeLevel(4, NaN) === 4 && edgeLevel(NaN, 4) === 4);
    ok("!! it is symmetric, which is what makes BOTH patches agree without talking to each other",
        [[1, 16], [16, 1], [2, 4], [4, 2]].every(([a, b]) => edgeLevel(a, b) === edgeLevel(b, a)),
        "each patch computes the shared edge independently and they must land on the same number");

    // *** THE CORRECTION, CHECKED AGAINST THE SHIPPED SHADER RATHER THAN REMEMBERED. ***
    const clone = process.env.TERRAIN3D_DIR || "";
    const tcs = clone ? path.join(clone, "Deployment", "Shaders", "terrain", "terrain.tcs.glsl") : "";
    if (tcs && fs.existsSync(tcs)) {
        const src = fs.readFileSync(tcs, "utf8");
        ok("!! *** Terrain3D's level chooser is a DISTANCE RAMP, not a screen-space measure ***",
            /distance\s*\(\s*cameraPos/.test(src) && /lodNear/.test(src) && /lodFar/.test(src) &&
            !/projection|viewport|screenHeight|tan\s*\(/i.test(src),
            "read out of the clone: distance() between two tuned uniforms, no projection, no field of view, " +
            "no viewport height. I NAMED A TECHNIQUE THAT FILE DOES NOT CONTAIN.");
        ok("...and the neighbour rule really is in there, which is the part worth taking", /succumb to your neighbor/i.test(src));
    } else {
        report("NOT CHECKED HERE: the assertion above about Terrain3D's own shader. It needs the clone, and this " +
               "tree does not vendor a no-licence-file repository to satisfy a gate. Point TERRAIN3D_DIR at a " +
               "checkout of DanWatkins/Terrain3D and this section verifies the correction against the real file; " +
               "it was run that way when written, and both checks passed.");
    }
}

// ---- 5. THE GROWTH VETO IS ONE-DIRECTIONAL, AND WIRED --------------------------------------------------------
{
    console.log("\n5. *** THE VETO CAN ONLY REFUSE TO GROW -- IT CAN NEVER FORCE A SHRINK ***");
    const fov = 60 * DEG, h = 800;
    ok("!! a near ring is NOT vetoed", growthWouldBeInvisible({ ringDistance: 500, chunkSize: 16, screenHeightPx: h, fovYRad: fov }) === false);
    ok("!! ...and a ring far enough to be sub-pixel IS", growthWouldBeInvisible({ ringDistance: 20000, chunkSize: 16, screenHeightPx: h, fovYRad: fov }) === true);
    ok("!! *** an unanswerable measurement does NOT veto -- the frame-rate loop stays in charge ***",
        growthWouldBeInvisible({ ringDistance: NaN, chunkSize: 16, screenHeightPx: h, fovYRad: fov }) === false &&
        growthWouldBeInvisible({ ringDistance: 500, chunkSize: 16, screenHeightPx: 0, fovYRad: fov }) === false,
        "a veto that fired when it could not see would silently pin the view distance and look like a stuck engine");
    ok("a bigger screen vetoes LATER, because it resolves more", (() => {
        const d = 6000;
        return growthWouldBeInvisible({ ringDistance: d, chunkSize: 16, screenHeightPx: 400, fovYRad: fov }) === true &&
               growthWouldBeInvisible({ ringDistance: d, chunkSize: 16, screenHeightPx: 4000, fovYRad: fov }) === false;
    })());

    const dgr = fs.readFileSync(path.join(ENG, "world", "DynamicGridRadius.js"), "utf8");
    ok("!! DynamicGridRadius consults the veto", /growthWouldBeInvisible/.test(dgr));
    ok("!! *** ...and ONLY on the grow path -- the shrink branch does not mention it ***", (() => {
        const shrink = (dgr.match(/shrinkGrid[\s\S]{0,600}/g) || []).join("\n");
        return !/growthWouldBeInvisible/.test(shrink);
    })(), "a veto that could also shrink could fight the FPS loop and oscillate; refusing to grow can at worst " +
          "leave the view where it already was");
    ok("...and it is optional, so a caller that supplies no viewport behaves exactly as before",
        /sse\s*&&|opts\.sse|this\._sse/.test(dgr), "an engine with no screen metrics must keep the v291 behaviour");
    report("NOT RUN HERE: a rendered frame. This is arithmetic and a wiring check; whether the vetoed ring was " +
           "genuinely invisible is a thing only a real GPU and a real panel can settle, and it wants the rig.");
}

// ---- 6. *** AND AT THIS ENGINE'S ACTUAL SCALE THE VETO CANNOT FIRE, WHICH IS MEASURED AND SAID *** ---------
{
    console.log("\n6. *** THE HONEST LIMIT: WIRED, CORRECT, AND INERT AT TODAY'S NUMBERS ***");
    // *** A FEATURE THAT NEVER FIRES AND IS DESCRIBED AS WORKING IS WORSE THAN NO FEATURE. *** DynamicGridRadius
    // caps maxRadius at 12 and this engine's chunks are 16 voxels, so the furthest ring a grow could ever add
    // sits 208 world units out. A whole chunk there subtends 25 pixels on the Steam Deck's 800-pixel panel and
    // 67 on a 4K one. The distance at which it would fall to one pixel is thousands of units away -- TENS OF
    // TIMES FURTHER THAN THIS ENGINE HAS EVER DRAWN.
    //
    // So the veto is real, one-directional, gated, and does nothing today. That is recorded HERE, as an
    // assertion with the numbers in it, rather than left for somebody to discover by wondering why _sseVetoes
    // is always zero. It becomes live the day the draw distance grows by an order of magnitude, or the day a
    // per-chunk mesh level of detail exists and the error fed in is a MESH STEP's rather than a whole chunk's --
    // which is the feature this metric was actually built for and which this tree does not have yet.
    const fov = 60 * DEG, cs = 16, maxRadius = 12;
    const furthest = (maxRadius + 1) * cs;
    const err = chunkGeometricError(cs, 1);
    const atDeck = screenSpaceError({ geometricError: err, distance: furthest, screenHeightPx: 800, fovYRad: fov });
    const crossover = distanceForError({ geometricError: err, targetPx: 1, screenHeightPx: 800, fovYRad: fov });
    ok("!! *** at the furthest ring this engine can draw, a chunk is still TENS of pixels -- nowhere near sub-pixel ***",
        atDeck > 10, furthest + " world units -> " + atDeck.toFixed(1) + " px on an 800-pixel panel");
    ok("!! ...so the one-pixel crossover is far outside anything this engine draws",
        crossover > furthest * 10,
        "crossover at d=" + crossover.toFixed(0) + ", which is " + (crossover / furthest).toFixed(0) +
        "x the furthest ring. THE VETO IS INERT AT THESE NUMBERS AND THAT IS THE MEASUREMENT, NOT A GUESS.");
    ok("...and the veto agrees with that arithmetic rather than disagreeing with it",
        growthWouldBeInvisible({ ringDistance: furthest, chunkSize: cs, screenHeightPx: 800, fovYRad: fov }) === false,
        "if this ever returns true the numbers above have changed and this section is what should be re-read");
    report("WHAT WOULD MAKE IT LIVE: a per-chunk mesh level of detail. world/chunkMesherCore.js meshes every " +
           "chunk at one voxel step, so there is no coarser mesh to choose and no step-sized error to measure -- " +
           "the error fed in here is a WHOLE CHUNK's, which is the crudest question the metric can be asked.");
}

console.log("\n" + (fails ? fails + " FAILED" : "screenSpaceError-selfcheck: all checks pass"));
process.exit(fails ? 1 : 0);
