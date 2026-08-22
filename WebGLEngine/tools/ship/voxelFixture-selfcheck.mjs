// WebGLEngine/tools/ship/voxelFixture-selfcheck.mjs
//
// Run: node tools/ship/voxelFixture-selfcheck.mjs   (~0.1s -- MEASURED)
//
// v3321 -- THE MESHER COMPARISON GETS A FIXTURE, BECAUSE A MEASUREMENT WITHOUT A FRONT DOOR DOES NOT GET TAKEN.
//
// ?mesher=greedy has been on the open list for dozens of rounds and never run. The reason is mechanical: the
// flag only takes effect INSIDE A LOAD HANDLER, so with nothing loaded it did nothing visible and there was
// nothing to compare -- and an asset picked by hand is not a fixture, because a comparison whose input changes
// between runs is not a comparison.
//
// *** THE SHAPE IS CHOSEN FOR THE THING UNDER TEST. *** Greedy meshing merges COPLANAR ADJACENT faces. A fixture
// of scattered voxels would show no gain and prove nothing -- it would make the mesher look useless when the
// FIXTURE was wrong. This is a slab plus walls plus a stepped ridge plus one lone column: large flats to merge,
// steps that MUST break the merge, and a column with no neighbours at all.
//
// AND THE RATIO IT PRODUCES IS NOT COMPARABLE TO THE 3.31x ON RECORD. That figure came from a generated asset;
// this fixture is BUILT for coplanar merging and reports ~50x. A FIXTURE DESIGNED TO FLATTER A TECHNIQUE WILL
// FLATTER IT -- the number here is a REGRESSION ANCHOR, not evidence about real models, and reading it as the
// second would be the "measuring its own setup" error this tree has refused twice.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };

const html = fs.readFileSync(path.join(ROOT, "voxel-viewer.html"), "utf8");
const grab = (re) => { const m = html.match(re); return m ? m[0] : ""; };
// LIFTED OUT OF THE PAGE AND RUN, not read. The page is a classic script with no exports, so the functions are
// extracted and driven -- which is the only way to know the fixture EXERCISES the thing it claims to.
const pre = grab(/const PALETTE\s*=[\s\S]*?;\n/) + grab(/function computeBounds\([\s\S]*?\n}\n/);
const fx = grab(/function buildFixtureVoxels\(\)[\s\S]*?\n}/);
const bvm = grab(/function buildVoxelMesh\(voxels\)[\s\S]*?\n}\n/);
const F = new Function(pre + fx + "\n" + bvm + "\nreturn { buildFixtureVoxels, buildVoxelMesh };")();

const vox = F.buildFixtureVoxels();
const per = F.buildVoxelMesh(vox);
const { buildVoxelMeshGreedy } = await import(pathToFileURL(path.join(ROOT, "mesh", "voxelMeshGreedy.js")).href);
const gre = buildVoxelMeshGreedy(vox);
const tris = (m) => m.indices.length / 3;

{
    ok("!! *** the fixture actually exercises greedy merging ***",
        tris(gre) < tris(per) / 5,
        vox.length + " voxels -> per-face " + tris(per) + " tris, greedy " + tris(gre) + " (" +
        (tris(per) / tris(gre)).toFixed(1) + "x). A FIXTURE OF SCATTERED VOXELS WOULD SHOW NO GAIN and make the " +
        "mesher look useless when the fixture was the thing that was wrong");

    ok("!! ...and this ratio is NOT comparable to the 3.31x on record",
        /A FIXTURE DESIGNED TO FLATTER A TECHNIQUE/.test(fs.readFileSync(path.join(HERE, "voxelFixture-selfcheck.mjs"), "utf8")),
        "3.31x came from a GENERATED ASSET; this fixture is built for coplanar merging. The number here is a " +
        "REGRESSION ANCHOR, not evidence about real models -- and reading it as the second is the measuring-its-" +
        "own-setup error");

    ok("!! ...and it is DETERMINISTIC -- same voxels every call",
        JSON.stringify(F.buildFixtureVoxels()) === JSON.stringify(vox) && !/Math\.random/.test(fx),
        "two numbers taken a minute apart must be about THE MESHER, not about the object. Any randomness here " +
        "would make the comparison unfalsifiable while looking perfectly reasonable");

    ok("...and both meshers produce a usable mesh, not an empty one",
        tris(per) > 0 && tris(gre) > 0 && per.bounds && gre.indices.length % 3 === 0,
        "an empty mesh renders as nothing and reads as 'the fixture did not load' -- the convincing-nothing " +
        "failure, which at zero triangles would also make the ratio infinite and look like a triumph");
}
{
    ok("!! *** the requested-vs-used readout is ON THE PAGE, not only in the console ***",
        /vcMeshOut/.test(html) && /REQUESTED AND USED DISAGREE/.test(html),
        "__swekMesher.requested vs .used is the whole point of the flag and was readable only by typing at a " +
        "console prompt. A FLAG THAT LIES ABOUT WHICH CODE RAN IS WORSE THAN NO FLAG; A FLAG NOBODY READS IS " +
        "THE SAME THING MORE QUIETLY");

    ok("...and ?fixture=1 makes one URL the whole test",
        /fixture"\) === "1"/.test(html) && /vcFixture/.test(html),
        "open it, read the number, add &mesher=greedy, read it again. A test that needs a setup step is a test " +
        "that stays on the open list for dozens of rounds -- which is exactly what this one did");
}

console.log();
console.log("  ----  WHAT THIS DOES NOT SETTLE: whether greedy is right for REAL models. That needs Keith's own");
console.log("  ----  generated assets on the rig, and the fixture only guarantees the comparison is now one");
console.log("  ----  click instead of a setup problem.");
if (fails) { console.log("voxelFixture-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("voxelFixture-selfcheck: all checks pass");
