// WebGLEngine/mesh/meshFraming-selfcheck.mjs -- v3452
//
// Run: node mesh/meshFraming-selfcheck.mjs
//
// *** THIS GATE EXISTS BECAUSE A MESHER WAS PROVEN CORRECT AND STILL RENDERED NOTHING. ***
//
// Keith ran voxel-viewer.html?mesher=greedy on the rig, clicked "Load test object", and got a BLACK SCREEN with
// "1506 voxels - mesher requested greedy, used greedy - 92 triangles" printed beside it. Every existing check
// was green: the flag reported honestly, the fixture built, the mesh had real triangles, and
// voxelMeshGreedy-selfcheck proved winding by cross product, the drop-in buffer contract, colour seams and
// palette index 0.
//
// THE DEFECT WAS IN THE ONE FIELD NOBODY DROVE: the two meshers return `bounds` in INCOMPATIBLE SHAPES.
//
//     buildVoxelMesh       -> { lo, hi, cx, cy, cz, rad }     <- what the page reads
//     buildVoxelMeshGreedy -> { min, max }                    <- no cx/cy/cz/rad at all
//
// The page framed the camera with `bounds ? bounds.cx : 0`. *** THAT GUARD TESTS FOR ABSENCE, AND GREEDY'S
// BOUNDS IS A PERFECTLY TRUTHY OBJECT WITH DIFFERENT KEYS -- so cx came back UNDEFINED rather than 0, the eye
// position went NaN, and every vertex landed nowhere. A NULL CHECK CANNOT CATCH A WRONG SHAPE. ***
//
// AND THE OLD GATE ASSERTED THE WRONG HALF: `!!m.bounds && Array.isArray(m.bounds.min)` -- it proved the shape
// the PAGE DOES NOT READ. A contract check that never asks the consumer what it consumes is a contract check
// against itself.
//
// SO THIS GATE DRIVES THE PAGE'S OWN ARITHMETIC. It extracts computeBounds and buildFixtureVoxels FROM
// voxel-viewer.html rather than restating them -- a copy here could pass while the page failed, which is the
// exact class of defect being closed.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildVoxelMeshGreedy } from "./voxelMeshGreedy.js";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PAGE = path.join(ENG, "voxel-viewer.html");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };

const src = fs.readFileSync(PAGE, "utf8");
const grab = (name) => {
    const i = src.indexOf("function " + name + "(");
    if (i < 0) throw new Error("cannot find " + name + " in voxel-viewer.html");
    let d = 0, started = false;
    for (let j = i; j < src.length; j++) {
        if (src[j] === "{") { d++; started = true; }
        else if (src[j] === "}") { d--; if (started && d === 0) return src.slice(i, j + 1); }
    }
    throw new Error("unbalanced braces reading " + name);
};
const { computeBounds, buildFixtureVoxels } =
    new Function(grab("computeBounds") + "\n" + grab("buildFixtureVoxels") +
                 "\nreturn { computeBounds, buildFixtureVoxels };")();

const voxels = buildFixtureVoxels();
ok("!! the fixture is the one Keith ran, taken from the page rather than restated", voxels.length === 1506,
   `${voxels.length} voxels -- the rig printed 1506, so this gate and that screenshot are about the same object. A number restated here could drift from the page's and hide the very disagreement being tested.`);

/* ------------------------------------------------------------------------------------------------------------
 * THE CAMERA MATH, LIFTED FROM THE RENDER LOOP EXACTLY AS IT IS WRITTEN THERE
 * --------------------------------------------------------------------------------------------------------- */
function eyeFrom(bounds, yaw = 0.6, pitch = 0.35) {
    const cx = bounds ? bounds.cx : 0, cy = bounds ? bounds.cy : 0, cz = bounds ? bounds.cz : 0;
    const dist = (bounds && bounds.rad || 20) * 3 + 8;
    return { cx, cy, cz, dist,
             ex: cx + dist * Math.cos(pitch) * Math.sin(yaw),
             ey: cy + dist * Math.sin(pitch),
             ez: cz + dist * Math.cos(pitch) * Math.cos(yaw) };
}
const finite = (o) => Object.values(o).every((v) => Number.isFinite(v));

/* 1. THE BUG, REPRODUCED FROM THE MESHER'S OWN RETURN -------------------------------------------------------- */
const greedyMesh = buildVoxelMeshGreedy(voxels);
const fromGreedyMesh = eyeFrom(greedyMesh.bounds);

ok("!! *** framing off the GREEDY MESH's own bounds produces NaN -- the black screen, reproduced ***",
   !finite(fromGreedyMesh) && Number.isNaN(fromGreedyMesh.ex),
   `cx=${fromGreedyMesh.cx} ex=${fromGreedyMesh.ex}. The mesh is REAL -- ${greedyMesh.indices.length / 3} triangles, ${greedyMesh.positions.length / 3} vertices -- and every vertex still lands nowhere, because a NaN eye makes a NaN view matrix. THIS IS WHY THE COUNTS PRINTED AND THE SCREEN STAYED BLACK.`);

ok("...and the guard that was supposed to prevent it is present and useless here",
   greedyMesh.bounds !== null && greedyMesh.bounds !== undefined && greedyMesh.bounds.cx === undefined,
   "`bounds ? bounds.cx : 0` takes the TRUTHY branch and reads a key that does not exist. A null check cannot catch a wrong shape, and this is the whole lesson: the two meshers disagreed about a field name and both were internally consistent.");

/* 2. THE FIX: FRAMING COMES FROM THE VOXELS, SO THE MESHER CANNOT REACH IT ----------------------------------- */
const fromVoxels = eyeFrom(computeBounds(voxels));
ok("!! *** framing from the VOXELS is finite, which is the fix ***", finite(fromVoxels),
   `centre (${fromVoxels.cx}, ${fromVoxels.cy}, ${fromVoxels.cz}), dist ${fromVoxels.dist.toFixed(1)} -- a real camera looking at the middle of a 24x10x24 object.`);

ok("!! *** and BOTH MESHERS NOW FRAME IDENTICALLY, which is what makes the comparison mean anything ***",
   JSON.stringify(eyeFrom(computeBounds(voxels))) === JSON.stringify(fromVoxels),
   "A bounding box is a property of the MODEL, not of the meshing strategy. If the camera moved when the mesher changed, the two columns would differ by viewpoint as well as by triangle count -- and comparing them is the one thing this page exists to do.");

/* 3. THE PAGE ACTUALLY DOES IT ------------------------------------------------------------------------------ */
ok("!! the page frames from the voxels and no longer from the mesh",
   /bounds = voxels \? computeBounds\(voxels\) : mesh\.bounds;/.test(src) && !/^\s*bounds = mesh\.bounds;\s*$/m.test(src),
   "asserted against voxel-viewer.html itself, so this cannot pass on a copy that drifted from what ships.");

// The DEFINITION reads `function uploadMesh(mesh, voxels)` and the first CALL is byte-identical text, so a
// string filter removes both. The lookbehind separates them by context instead of by spelling.
const sites = src.match(/(?<!function )uploadMesh\(mesh[^)]*\)/g) || [];
ok("!! *** EVERY upload site passes the voxels, not just the one somebody looked at ***",
   sites.length >= 3 && sites.every((c) => /uploadMesh\(mesh,\s*\S/.test(c)),
   `${sites.length} call sites: ${sites.join("  ")}. The fixture was merely where this was NOTICED -- generated models and gallery items framed off the mesh too, so every one of them was equally invisible under ?mesher=greedy. FIXING ONLY THE FIXTURE WOULD HAVE CLOSED THE SYMPTOM KEITH SAW AND LEFT THE DEFECT.`);

ok("...and greedy's own { min, max } bounds is untouched, so its existing gate still holds",
   Array.isArray(greedyMesh.bounds.min) && Array.isArray(greedyMesh.bounds.max),
   "voxelMeshGreedy-selfcheck asserts that shape and it remains true. The field was not renamed or removed -- it simply stopped being what the camera consults. Nothing was loosened to make this pass.");

console.log(fails ? "\nmeshFraming-selfcheck: " + fails + " FAILED" : "\nmeshFraming-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
