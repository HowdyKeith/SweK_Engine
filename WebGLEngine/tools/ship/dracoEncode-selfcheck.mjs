// WebGLEngine/tools/ship/dracoEncode-selfcheck.mjs -- v4601
//
// Run: node tools/ship/dracoEncode-selfcheck.mjs
//
// GATES tools/export/dracoEncode.mjs, vendor/draco-encoder/{draco_encoder_nodejs.js,draco_encoder.wasm}, and
// CLOSES THE TWO GAPS tools/ship/dracoWeld-selfcheck.mjs's own closing note named and left open: "This round
// wrote no encoder either" (section 0-3 below), and "an actual Draco-compressed GLB DECODED end to end ...
// the decode still needs the full 12 MB and a browser" (section 4, which drives that exact browser+decoder
// path against a file THIS gate just wrote, not a fixture cut from someone else's asset).
"use strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { encodeDracoMesh, writeDracoGlb, DRACO_EXT } from "../export/dracoEncode.mjs";
import { peekGlb, needsDraco, MAX_JSON } from "../../gpu/glbPeek.mjs";
import { weld } from "../export/weldVertices.mjs";
import { runInEngineOrigin, webgpuSkipReason } from "./webgpuHarness.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const report = (m) => console.log("  ....  " + m);
console.log("dracoEncode-selfcheck -- the encode half dracoWeld-selfcheck.mjs said this tree did not have\n");

// A welded quad: two triangles sharing an edge, the shape weldVertices.mjs's own gate uses for exactly this
// reason ("where the saving actually comes from: co-planar quads sharing an edge").
const QUAD = {
    positions: [0,0,0,  2,0,0,  0,2,0,  2,2,0],
    indices: [0,1,2, 1,3,2],
    normals: [0,0,1, 0,0,1, 0,0,1, 0,0,1],
    uvs: [0,0, 1,0, 0,1, 1,1],
};

console.log("0. THE ENCODER MODULE ITSELF");
{
    const enc = await encodeDracoMesh({ positions: QUAD.positions, indices: QUAD.indices });
    ok("!! *** encodeDracoMesh produces a real Draco buffer, not a stub ***",
        enc.bytes.length > 0 && enc.bytes[0] === 68 && enc.bytes[1] === 82 && enc.bytes[2] === 65 && enc.bytes[3] === 67,
        enc.bytes.length + " bytes, magic " + String.fromCharCode(enc.bytes[0], enc.bytes[1], enc.bytes[2], enc.bytes[3]));
    ok("...vertex and triangle counts are reported and correct", enc.vertexCount === 4 && enc.triangleCount === 2);
    ok("...position-only gets exactly one attribute id", Object.keys(enc.attributeIds).length === 1 && enc.attributeIds.POSITION === 0);

    // *** THE REJECTED BUILD, NAMED SO NOBODY RE-TRIES IT WITHOUT READING WHY. *** vendor/draco-encoder's own
    // PROVENANCE.txt carries the full measurement; this just pins the fact that vendor/draco-encoder is what
    // got vendored and it is NOT three.js r160's own asm.js-era draco_encoder.js (which hung).
    const fs = await import("node:fs");
    const nodejsSrc = fs.readFileSync(path.join(ENG, "vendor/draco-encoder/draco_encoder_nodejs.js"), "utf8");
    ok("!! the vendored encoder is draco3d's Node build, not three.js r160's browser one",
        nodejsSrc.length > 10000 && fs.existsSync(path.join(ENG, "vendor/draco-encoder/draco_encoder.wasm")),
        (nodejsSrc.length / 1024).toFixed(0) + " KB js + a real .wasm sibling -- the rejected build was a single " +
        "928 KB js file with no .wasm at all");
    const lic = fs.readFileSync(path.join(ENG, "vendor/draco-encoder/LICENSE"), "utf8");
    ok("!! its LICENSE is vendored beside it", /Apache License/.test(lic) && /Version 2\.0/.test(lic));
}

console.log("\n1. EVERY ATTRIBUTE COMBINATION KEEPS ITS OWN DRACO ID");
{
    const posOnly = await encodeDracoMesh({ positions: QUAD.positions, indices: QUAD.indices });
    const withN = await encodeDracoMesh({ positions: QUAD.positions, indices: QUAD.indices, normals: QUAD.normals });
    const withAll = await encodeDracoMesh({ positions: QUAD.positions, indices: QUAD.indices,
        normals: QUAD.normals, uvs: QUAD.uvs, colors: [1,0,0, 0,1,0, 0,0,1, 1,1,0] });
    ok("!! *** ids are assigned in ADD order, not by attribute TYPE, and this is why they must be captured ***",
        posOnly.attributeIds.POSITION === 0 && withN.attributeIds.POSITION === 0 && withN.attributeIds.NORMAL === 1 &&
        withAll.attributeIds.POSITION === 0 && withAll.attributeIds.NORMAL === 1 &&
        withAll.attributeIds.TEX_COORD === 2 && withAll.attributeIds.COLOR === 3,
        "position-only: " + JSON.stringify(posOnly.attributeIds) + "; all four: " + JSON.stringify(withAll.attributeIds));
    // Raw, UNINDEXED triangle soup -- 6 vertices, deliberately NOT quad-shaped (QUAD's 4 vertices only make
    // sense with its own indices; a vertex count that is not a multiple of 3 would silently drop a trailing
    // partial triangle under the 0..N-1 fallback, which is a different thing to test).
    const soup = [0,0,0, 1,0,0, 0,1,0,  1,0,0, 1,1,0, 0,1,0];
    const unindexed = await encodeDracoMesh({ positions: soup });
    ok("...an unindexed mesh gets the same trivial 0..N-1 face fallback DRACOExporter.js uses",
        unindexed.triangleCount === 2 && unindexed.vertexCount === 6);
}

console.log("\n2. THE GLB CONTAINER, CHECKED THE SAME WAY voxelGlb-selfcheck.mjs CHECKS ITS OWN");
{
    const { glb, stats } = await writeDracoGlb({ name: "quad", ...QUAD });
    const p = peekGlb(glb);
    ok("!! a Draco-written GLB parses as a valid container", p.ok && p.version === 2, p.ok ? "json " + p.jsonLength + "B, total " + p.totalLength + "B" : p.error);
    ok("...JSON chunk length is 4-byte aligned", p.jsonLength % 4 === 0, p.jsonLength);
    ok("...total length is 4-byte aligned", p.totalLength % 4 === 0, p.totalLength);
    ok("...well under the header-peek's own sanity cap", p.jsonLength < MAX_JSON);

    const d = needsDraco(glb);
    ok("!! *** the file this tree's OWN reader recognises as Draco, from its header alone ***",
        d.needsDraco && d.inUsed && d.inRequired && d.dracoPrimitives === 1 && d.totalPrimitives === 1 && !d.declaredButUnused,
        JSON.stringify(d));

    const j = p.json;
    const gltfAttrs = j.meshes[0].primitives[0].attributes;
    const dracoAttrs = j.meshes[0].primitives[0].extensions[DRACO_EXT].attributes;
    // *** THE REGRESSION FOR THE BUG THIS ROUND FOUND: the extension's key spelling, not just its presence. ***
    // gltf's own KHR_draco_mesh_compression spec (and vendor/three/jsm/loaders/GLTFLoader.js's
    // GLTFDracoMeshCompressionExtension, read directly) keys `attributes` by the SAME NAMES as
    // primitive.attributes -- TEXCOORD_0, COLOR_0 -- not Draco's generic type names TEX_COORD/COLOR. POSITION
    // and NORMAL are spelled identically both ways, which is exactly what let a first draft's TEX_COORD/COLOR
    // keys hide behind them: the position and normal round-tripped, the uv silently came back as zeros.
    ok("!! *** the extension's attribute keys match primitive.attributes' keys exactly, not Draco's names ***",
        Object.keys(gltfAttrs).sort().join(",") === Object.keys(dracoAttrs).sort().join(","),
        "primitive.attributes: " + JSON.stringify(gltfAttrs) + " vs extensions." + DRACO_EXT + ".attributes: " + JSON.stringify(dracoAttrs));
    ok("...specifically TEXCOORD_0, not TEX_COORD", dracoAttrs.TEXCOORD_0 !== undefined && dracoAttrs.TEX_COORD === undefined);

    const withColor = await writeDracoGlb({ positions: QUAD.positions, indices: QUAD.indices, colors: [1,0,0, 0,1,0, 0,0,1, 1,1,0] });
    const dc = peekGlb(withColor.glb).json.meshes[0].primitives[0].extensions[DRACO_EXT].attributes;
    ok("...and the same holds for COLOR_0, driven directly rather than inferred from the TEXCOORD_0 case",
        dc.COLOR_0 !== undefined && dc.COLOR === undefined, JSON.stringify(dc));

    ok("!! accessors carry NO bufferView -- the spec's own contract for a Draco-compressed attribute",
        j.accessors.every((a) => a.bufferView === undefined));
    ok("...and the POSITION accessor still carries min/max, which glTF 2.0 5.3 requires unconditionally",
        Array.isArray(j.accessors[0].min) && Array.isArray(j.accessors[0].max));
    ok("!! the compressed bufferView carries no `target` -- it is opaque bytes, not a GPU-bindable array",
        j.bufferViews[0].target === undefined);
    report("compressed: " + stats.bytes.length + " bytes for a 4-vertex/2-triangle quad with position+normal+uv " +
           "(96 + 48 + 32 = 176 bytes of raw float attributes alone, before indices) -- a tiny mesh pays Draco's " +
           "own per-file header cost disproportionately; section 5 measures a mesh large enough for the real saving.");
}

console.log("\n3. REFUSALS");
{
    let threw = false;
    try { await encodeDracoMesh({ positions: [] }); } catch { threw = true; }
    ok("!! empty positions is refused, not silently encoded as nothing", threw);
    threw = false;
    try { await writeDracoGlb({ positions: new Float32Array(0) }); } catch { threw = true; }
    ok("!! writeDracoGlb refuses the same way", threw);
}

console.log("\n4. *** THE GAP dracoWeld-selfcheck.mjs LEFT OPEN: A REAL DRACO GLB, DECODED END TO END ***");
{
    const skip = webgpuSkipReason();
    if (skip) { console.log("  SKIP  " + skip); fails++; }
    else {
        const mesh = { name: "quad", positions: QUAD.positions, indices: QUAD.indices, normals: QUAD.normals, uvs: QUAD.uvs };
        const { glb } = await writeDracoGlb(mesh, { quantization: { POSITION: 16, NORMAL: 16, TEX_COORD: 16 } });

        // *** THE PAGE HAS TO SUPPLY ITS OWN IMPORT MAP. *** GLTFLoader.js and vendor/draco/DRACOLoader.js both
        // bare-import 'three' -- resolved elsewhere in this tree by an <script type="importmap"> baked into
        // pages like universal-viewer.html, which runInEngineOrigin's own minimal shell does not carry.
        // Registered here rather than argued about, because the alternative (an unresolved bare specifier) is
        // a page error, not a silent wrong answer -- this was found by running it, not by reading the spec.
        const SCRIPT = `async ({ glbBytes }) => {
            const im = document.createElement("script");
            im.type = "importmap";
            im.textContent = JSON.stringify({ imports: { "three": "/vendor/three/three.module.js" } });
            document.head.appendChild(im);
            const { GLTFLoader } = await import("/vendor/three/jsm/loaders/GLTFLoader.js");
            const { parseGlb } = await import("/gpu/gltfDraco.js");
            const buf = new Uint8Array(glbBytes).buffer;
            const gltf = await parseGlb(buf, GLTFLoader, { path: "/" });
            const m = gltf.scene.children[0];
            const geo = m.geometry;
            const pos = geo.getAttribute("position"), nrm = geo.getAttribute("normal"), uv = geo.getAttribute("uv");
            const idx = geo.getIndex();
            return { ok: true, swekDraco: gltf.swekDraco,
                     positions: Array.from(pos.array), normals: nrm ? Array.from(nrm.array) : null,
                     uvs: uv ? Array.from(uv.array) : null, indices: idx ? Array.from(idx.array) : null,
                     vertexCount: pos.count };
        }`;
        const out = await runInEngineOrigin({ engineRoot: ENG, script: SCRIPT, args: { glbBytes: Array.from(glb) } });
        ok("!! *** the SHIPPED decode path (three's real GLTFLoader + the vendored DRACOLoader.js) actually decodes it ***",
            out.ok && out.result && out.result.ok, out.ok ? "decoded " + out.result.vertexCount + " vertices" : out.reason);

        if (out.ok && out.result && out.result.ok) {
            const r = out.result;
            ok("   ...and the router itself agrees this file needed the decoder",
                r.swekDraco && r.swekDraco.needsDraco && r.swekDraco.inRequired && r.swekDraco.dracoPrimitives === 1);

            // *** GEOMETRIC EQUALITY, NOT ARRAY EQUALITY. *** Draco's edgebreaker traversal renumbers vertices
            // and reorders faces on purpose -- measured directly: this exact round-trip came back as vertices
            // [3,2,1,0] of the input, not [0,1,2,3]. So the check reconstructs each triangle as its three
            // (position,normal,uv) corners, canonicalises a triangle by SORTING its three corners (order- and
            // winding-independent, since a triangle is the same triangle from either side here), and compares
            // the SORTED SET of canonical triangles -- which is invariant to exactly the reordering Draco does
            // and to nothing else.
            const corner = (P, N, U, i) => JSON.stringify([
                [P[i*3], P[i*3+1], P[i*3+2]],
                N ? [Math.round(N[i*3]*1000), Math.round(N[i*3+1]*1000), Math.round(N[i*3+2]*1000)] : null,
                U ? [Math.round(U[i*2]*1000), Math.round(U[i*2+1]*1000)] : null,
            ]);
            const triKey = (P, N, U, idx, t) => {
                const corners = [corner(P,N,U,idx[t*3]), corner(P,N,U,idx[t*3+1]), corner(P,N,U,idx[t*3+2])];
                return corners.sort().join("|");
            };
            const inTris = new Set(); for (let t = 0; t < QUAD.indices.length / 3; t++) inTris.add(triKey(QUAD.positions, QUAD.normals, QUAD.uvs, QUAD.indices, t));
            const outTris = new Set(); for (let t = 0; t < r.indices.length / 3; t++) outTris.add(triKey(r.positions, r.normals, r.uvs, r.indices, t));
            ok("!! *** the decoded mesh is the SAME two triangles -- same corners, same normals, same UVs -- reordering and all ***",
                inTris.size === 2 && outTris.size === 2 && [...inTris].every((k) => outTris.has(k)),
                inTris.size + " input triangles, " + outTris.size + " decoded, " +
                [...inTris].filter((k) => outTris.has(k)).length + " matched exactly (16-bit-quantization-rounded)");
        }
    }
}

console.log("\n5. THE SAVING A VOXEL EXPORT ACTUALLY GETS -- MEASURED, NOT ASSUMED");
{
    // A GREEDY-MESHING-SHAPED FIXTURE: a 6x6 grid of unit quads on one plane, sharing edges -- exactly
    // weldVertices.mjs's own "where the saving actually comes from" shape, at a size worth reading a ratio
    // off of. Built unwelded (each quad's own 4 corners, duplicated at shared edges) and then welded, so the
    // comparison is apples to apples with what voxelGlb.mjs's writeGlb({weld:true}) already produces.
    const N = 6;
    const positions = [], indices = [], normals = [];
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        const base = positions.length / 3;
        positions.push(x,y,0, x+1,y,0, x+1,y+1,0, x,y+1,0);
        for (let k = 0; k < 4; k++) normals.push(0,0,1);
        indices.push(base,base+1,base+2, base,base+2,base+3);
    }
    const raw = { positions: Float32Array.from(positions), indices: Uint32Array.from(indices), normals: Float32Array.from(normals) };
    const w = weld(raw);
    ok("!! the fixture actually welds -- 144 unwelded corners down to the grid's own shared vertices",
        w.before === N * N * 4 && w.after < w.before, w.before + " -> " + w.after);

    const plainBytes = w.positions.length * 4 + w.normals.length * 4 + w.indices.length * 4;   // FLOAT + FLOAT + index (uncompressed, as voxelGlb.mjs's own writer would store it)
    const { bytes } = await encodeDracoMesh({ positions: w.positions, indices: w.indices, normals: w.normals,
        quantization: { POSITION: 14, NORMAL: 8 } });
    ok("!! *** Draco beats the raw attribute bytes on real, welded, greedy-meshing-shaped geometry ***",
        bytes.length < plainBytes,
        bytes.length + " compressed against " + plainBytes + " raw (positions+normals+indices as FLOAT/uint32) " +
        "-- " + (100 * (1 - bytes.length / plainBytes)).toFixed(1) + "% smaller, on " + (w.after) + " vertices / " +
        (w.indices.length / 3) + " triangles");
}

console.log("\n" + (fails ? "FAIL -- " + fails + " check(s)" : "ALL GREEN") +
    "\nunchecked here: whether tools/export/voxelGlb.mjs's own writeGlb should gain a draco option directly " +
    "(kept as a separate async writer instead -- see this file's own header and dracoEncode.mjs's, on the " +
    "sync/async API-shape mismatch that would otherwise force every existing writeGlb caller to change); " +
    "attribute quantization bit-depths beyond what section 5 tried; point-cloud encoding " +
    "(EncodePointCloudToDracoBuffer exists in the vendored module and is untouched here); and Draco's own " +
    "compression ratio on a mesh with real (non-planar, non-axis-aligned) geometry, which a synthetic grid " +
    "cannot speak to as directly as a real voxelized asset would.");
process.exit(fails ? 1 : 0);
