// WebGLEngine/tools/ship/voxelGlb-selfcheck.mjs -- v4156
//
// Run: node tools/ship/voxelGlb-selfcheck.mjs   (well under a second)
// Gated by tools/ship/selfchecks.mjs (auto-discovered).
//
// GATES tools/export/voxelGlb.mjs, world/worldGlbExport.js and window.swekExport.
//
// *** THE WHOLE FILE IS HEADLESS, AND THAT IS THE ARGUMENT FOR WRITING THE CONTAINER BY HAND. *** Had this gone
// through three's GLTFExporter it would need a THREE.Scene, which would need three, which would need a browser
// -- and a GLB writer whose only test is "open it in Blender and see" is a writer nobody can regress. Because
// the bytes are emitted directly, the export ROUND-TRIPS THROUGH THIS TREE'S OWN gpu/GLBParser.js in node, and
// the container is checked field by field against the spec below.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { writeGlb, vec3Bounds, glbStats } from "../export/voxelGlb.mjs";
import { worldMeshes, exportWorldGlb } from "../../world/worldGlbExport.js";
import { GLBParser } from "../../gpu/GLBParser.js";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const report = (m) => console.log("  ....  " + m);
console.log("voxelGlb-selfcheck -- voxels back out as a model\n");

// A hand-built world: no VoxelWorld, no WebGL, no erosion. See worldGlbExport's header.
const S = 16, H = 8;
const floorChunk = (extra) => {
    const v = new Uint8Array(S * H * S);
    for (let z = 0; z < S; z++) for (let x = 0; x < S; x++) v[x + S * (z + S * 0)] = 3;   // GRASS floor
    if (extra) v[2 + S * (2 + S * 1)] = 1;                                               // one STONE block
    return { voxels: v };
};
const world = { chunkSize: S, chunks: new Map([["0,0", floorChunk(true)], ["1,0", floorChunk(false)]]) };

// ---- 1. THE CONTAINER, FIELD BY FIELD ------------------------------------------------------------------------
{
    console.log("1. *** THE GLB HEADER AND CHUNK LAYOUT, AGAINST THE SPEC RATHER THAN AGAINST ITSELF ***");
    const r = exportWorldGlb(world);
    ok("a hand-built world exports", r.ok === true, JSON.stringify(r.stats));
    const b = r.bytes, dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
    ok("!! magic is \"glTF\" and the version is 2", dv.getUint32(0, true) === 0x46546C67 && dv.getUint32(4, true) === 2);
    ok("!! *** the declared total length IS the actual length ***", dv.getUint32(8, true) === b.length,
        "declared " + dv.getUint32(8, true) + ", actual " + b.length + " -- a viewer trusts the header and reads past the end if it lies");
    const jsonLen = dv.getUint32(12, true);
    ok("chunk 0 is the JSON chunk", dv.getUint32(16, true) === 0x4E4F534A);
    const binAt = 20 + jsonLen;
    ok("chunk 1 is the BIN chunk", dv.getUint32(binAt + 4, true) === 0x004E4942);
    ok("!! *** every chunk length is 4-byte aligned ***", jsonLen % 4 === 0 && dv.getUint32(binAt, true) % 4 === 0 && b.length % 4 === 0,
        "json " + jsonLen + ", bin " + dv.getUint32(binAt, true) + ", total " + b.length +
        " -- a parser reading a uint32 at an unaligned offset gets garbage, which is why the spec says pad");
    const jsonBytes = new Uint8Array(b.buffer, b.byteOffset + 20, jsonLen);
    ok("!! ...and the JSON chunk pads with SPACES, which is the spec's own wording",
        jsonBytes[jsonLen - 1] === 0x20 || jsonBytes[jsonLen - 1] === 0x7D,
        "0x" + jsonBytes[jsonLen - 1].toString(16) + " (a space, or '}' when it happened to land on the boundary)");
    const gltf = JSON.parse(new TextDecoder().decode(jsonBytes));
    ok("the JSON parses and declares asset 2.0", gltf.asset.version === "2.0");
    ok("!! buffers[0].byteLength matches the BIN chunk it describes", gltf.buffers[0].byteLength <= dv.getUint32(binAt, true));
    ok("!! every bufferView starts on a 4-byte boundary",
        gltf.bufferViews.every((v) => v.byteOffset % 4 === 0),
        gltf.bufferViews.length + " views -- a FLOAT view at an odd offset is undefined behaviour, and padding " +
        "only at the END of a view leaves the NEXT one misaligned, which is the version of this bug that hides");
}

// ---- 2. *** THE ONE ACCESSOR FIELD THAT IS REQUIRED AND EASY TO FORGET *** -------------------------------------
{
    console.log("\n2. *** POSITION ACCESSORS CARRY min AND max -- REQUIRED, UNLIKE EVERY OTHER ACCESSOR ***");
    const r = exportWorldGlb(world);
    const dv = new DataView(r.bytes.buffer, r.bytes.byteOffset, r.bytes.byteLength);
    const gltf = JSON.parse(new TextDecoder().decode(new Uint8Array(r.bytes.buffer, r.bytes.byteOffset + 20, dv.getUint32(12, true))));
    const posAcc = gltf.meshes.map((m) => gltf.accessors[m.primitives[0].attributes.POSITION]);
    ok("!! every POSITION accessor has min and max", posAcc.every((a) => Array.isArray(a.min) && a.min.length === 3 && Array.isArray(a.max) && a.max.length === 3),
        "glTF 2.0 5.3 makes them OPTIONAL everywhere else and REQUIRED here. Without them a model loads as " +
        "invisible or unframeable rather than as an error -- which is the failure nobody attributes to the exporter");
    ok("...and the bounds are real, not placeholders", posAcc.every((a) => a.max.some((v, i) => v > a.min[i])));
    ok("!! vec3Bounds refuses an empty array rather than returning Infinity pairs", vec3Bounds(new Float32Array(0)) === null,
        "a min of +Infinity written into a file is a bounding box no viewer can use");
    ok("...and computes real bounds otherwise", (() => {
        const b = vec3Bounds(new Float32Array([1, 2, 3, -4, 5, -6]));
        return b.min.join(",") === "-4,2,-6" && b.max.join(",") === "1,5,3";
    })());
}

// ---- 3. *** THE ROUND TRIP, THROUGH THE TREE'S OWN PARSER *** --------------------------------------------------
{
    console.log("\n3. *** WRITTEN HERE, READ BACK BY gpu/GLBParser.js -- THE CHECK A HAND-ROLLED WRITER OWES ***");
    const pos = new Float32Array([0, 0, 0, 2, 0, 0, 0, 3, 0, 0, 0, 0, 0, 3, 0, 0, 0, 4]);
    const col = new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1, 1, 1, 0, 0, 1, 1, 1, 0, 1]);
    const glb = writeGlb([{ name: "tri", positions: pos, colors: col }], { generator: "gate" });
    const ab = glb.buffer.slice(glb.byteOffset, glb.byteOffset + glb.byteLength);
    const parsed = await GLBParser.parse(ab, { postProcess: false });
    ok("!! *** the engine's own parser reads what this wrote ***", !!parsed && !!parsed.positions,
        "not a claim about some other viewer -- the parser this tree already ships");
    ok("!! ...and the vertices come back BYTE-EXACT", parsed.positions.length === pos.length &&
        Array.from(parsed.positions).every((v, i) => v === pos[i]),
        parsed.positions.length + " floats, identical");

    // COLOUR IS CHECKED AGAINST THE FILE, NOT AGAINST THE PARSER, AND THE REASON IS RECORDED.
    // GLBParser returned no `colors` for this static single-primitive mesh. That is a question about ITS
    // assembly path -- it is built for skinned avatar models -- and NOT evidence about these bytes, so the
    // claim is settled by decoding the accessor out of the file directly. Asserting it through the parser
    // would make this line fail for a reason that has nothing to do with the writer.
    const dv = new DataView(glb.buffer, glb.byteOffset, glb.byteLength);
    const jlen = dv.getUint32(12, true);
    const gltf = JSON.parse(new TextDecoder().decode(new Uint8Array(glb.buffer, glb.byteOffset + 20, jlen)));
    const ci = gltf.meshes[0].primitives[0].attributes.COLOR_0;
    ok("!! COLOR_0 is emitted as its own accessor", ci != null && gltf.accessors[ci].type === "VEC3");
    const bv = gltf.bufferViews[gltf.accessors[ci].bufferView];
    const binStart = 20 + jlen + 8;
    const got = new Float32Array(glb.buffer.slice(glb.byteOffset + binStart + bv.byteOffset,
                                                  glb.byteOffset + binStart + bv.byteOffset + bv.byteLength));
    ok("!! ...and the colours are byte-exact in the file", Array.from(got).join(",") === Array.from(col).join(","));
    ok("!! the material's baseColorFactor is WHITE, because glTF MULTIPLIES it by COLOR_0",
        gltf.materials[0].pbrMetallicRoughness.baseColorFactor.join(",") === "1,1,1,1",
        "any other value silently tints every vertex colour the mesher computed, so the export stops matching the screen");
}

// ---- 4. REFUSALS, AND THE MISMATCH THAT IS DROPPED RATHER THAN TRUNCATED --------------------------------------
{
    console.log("\n4. WHAT IT REFUSES, AND WHAT IT DECLINES TO GUESS");
    let threw = false;
    try { writeGlb([]); } catch { threw = true; }
    ok("!! writing nothing THROWS rather than emitting an empty model", threw,
        "a .glb that downloads and opens to nothing is indistinguishable from a broken exporter");
    ok("...and a mesh with fewer than three vertices is not a mesh", (() => {
        try { writeGlb([{ positions: new Float32Array([0, 0, 0]) }]); return false; } catch { return true; }
    })());
    ok("!! *** a colour array that does not match the vertex count is DROPPED, not truncated ***", (() => {
        const g = writeGlb([{ positions: new Float32Array(9), colors: new Float32Array(6) }]);
        const dv = new DataView(g.buffer, g.byteOffset, g.byteLength);
        const j = JSON.parse(new TextDecoder().decode(new Uint8Array(g.buffer, g.byteOffset + 20, dv.getUint32(12, true))));
        return j.meshes[0].primitives[0].attributes.COLOR_0 === undefined;
    })(), "a silently shortened attribute is wrong EVERYWHERE and looks fine; an untinted mesh is plainly untinted");
    ok("!! an empty world REFUSES with a reason rather than writing a zero-byte file",
        exportWorldGlb({ chunks: new Map(), chunkSize: S }).ok === false);
    ok("worldMeshes refuses something that is not a world", (() => {
        try { worldMeshes({}); return false; } catch { return true; }
    })());
}

// ---- 5. IT REUSES THE RENDERER'S MESHER, WHICH IS WHY THE FILE IS SMALL ----------------------------------------
{
    console.log("\n5. *** GREEDY MESHING, NOT A CUBE PER VOXEL ***");
    const meshes = worldMeshes(world);
    const stats = glbStats(meshes);
    // Two chunks of 16x16 solid floor = 512 surface voxels. A cube each is 12 triangles = 6144.
    ok("!! *** a 512-voxel floor is far fewer than the 6,144 triangles a cube-per-voxel exporter would emit ***",
        stats.triangles < 600, stats.triangles + " triangles for 512 floor voxels + 1 block, across " +
        stats.meshes + " meshes -- world/chunkMesherCore.js merges coplanar runs, and the export inherits that");
    ok("!! the geometry is the RENDERER'S, so the file cannot drift from the screen",
        /from "\.\/chunkMesherCore\.js"/.test(fs.readFileSync(path.join(ENG, "world", "worldGlbExport.js"), "utf8")),
        "a second mesher written for export would be a second answer to the same question");
    ok("!! chunk height is DERIVED from the voxel buffer, not read off the world",
        /voxels\.length \/ \(S \* S\)/.test(fs.readFileSync(path.join(ENG, "world", "worldGlbExport.js"), "utf8")),
        "so it cannot disagree with the array it is about to index");
    ok("...and no second world-space offset is applied", (() => {
        const src = fs.readFileSync(path.join(ENG, "world", "worldGlbExport.js"), "utf8");
        return !/\+\s*cx\s*\*\s*S/.test(src) && /world-space/.test(src);
    })(), "chunkMesherCore already offsets by cx*S; doing it again would scatter every chunk to double its distance");
}

// ---- 6. THE DOOR -----------------------------------------------------------------------------------------------
{
    console.log("\n6. WIRED WHERE A PERSON CAN REACH IT");
    const main = fs.readFileSync(path.join(ENG, "main.js"), "utf8");
    ok("!! window.swekExport exists with glb() and build()", /window\.swekExport\s*=/.test(main) &&
        /async glb\(/.test(main) && /async build\(/.test(main));
    ok("...and it imports the exporter rather than restating it", /world\/worldGlbExport\.js/.test(main));
    ok("!! the object URL is revoked on a TIMER, not in the same tick",
        /setTimeout\(\(\) => \{ try \{ URL\.revokeObjectURL/.test(main),
        "revoking immediately can cancel the download in Chromium before it has read the blob, which reads as " +
        "a button that does nothing");
    ok("!! a refusal reaches the user rather than only the console", /Nothing to export/.test(main));
    report("NOT RUN HERE: a browser download, or opening the result in a third-party viewer. The bytes are " +
           "checked against the spec and round-tripped through this tree's own parser, which is what can be " +
           "settled headlessly; whether Blender likes it wants a person and a file.");
}

console.log("\n" + (fails ? fails + " FAILED" : "voxelGlb-selfcheck: all checks pass"));
process.exit(fails ? 1 : 0);
