#!/usr/bin/env node
// WebGLEngine/tools/ship/gltfConformance-selfcheck.mjs
//
// GATES gpu/GLBParser.js's own accessor.sparse support (glTF 2.0 spec 5.9) -- task #7, the first entry in
// what tools/ship/nextRounds.mjs names as "conformance fixtures for gpu/GLBParser.js against the glTF
// feature matrix", starting with sparse accessors specifically: before this round, zero occurrences of
// `sparse` existed anywhere in that file. A bufferView-present+sparse accessor silently returned its own
// UNPATCHED base array -- no throw, no warning, just wrong numbers, disagreeing with the accessor's own
// declared max/min the moment anything checks. A bufferView-OMITTED+sparse accessor (spec 2.10.1's own
// "initialized as an array of zeros" shape) would have thrown "accessor N has no bufferView" -- a spec-valid
// shape this parser had never seen at all.
//
// SABOTAGE LOG -- each applied to gpu/GLBParser.js, gate run, exit read, file restored byte for byte:
//   A  the entire `if (acc.sparse) { ...; out = _applySparse(...); }` block removed (reverting to the
//      pre-round silent-ignore behaviour)
//        -> exit=1, 5 red: section 1's own exact-match AND max-Y checks, section 2's own implicit-zeros
//           check, and section 4's own view-ownership AND patch-correctness checks -- every check this round
//           added, none of section 3's own regression checks (correctly: nothing about the NON-sparse paths
//           changed).
//   B  _applySparse's own `const dst = idxArr[i] * compCount;` changed to `const dst = idxArr[i];` (dropping
//      the per-component stride)
//        -> exit=1, 1 red: section 1's own exact-match check, by name -- the real fixture's VEC3 accessor
//           (compCount=3, non-zero sparse indices 8/10/12) is the ONLY check with the right shape to catch
//           this; section 2's own SCALAR fixture (compCount=1) and section 4's own index-0 fixture cannot
//           distinguish `idx` from `idx*compCount`, confirmed by this exact sabotage passing there unnoticed
//           -- a real, honest gap in what those two synthetic fixtures alone can prove, closed by keeping the
//           real Khronos fixture as the PRIMARY check rather than relying on synthetic cases only.
//   C  the clone-before-mutate guard (`if (out.buffer === bin.buffer) out = new Ctor(out);`) removed entirely
//        -> exit=1, 2 red: section 4's own two checks, by name (view-ownership and shared-buffer-not-mutated)
//           -- and ONLY those two; sections 1/2/3 all stayed green, confirming section 4 is not redundant
//           with anything else in this file. Without section 4, this exact sabotage would have shipped
//           invisibly: section 1's own real-fixture check still reports the CORRECT patched values (the
//           mutation writes the right numbers, just also corrupts bin's own shared buffer for anyone else
//           reading it), so a value-only check can never see this class of bug.
//   D  the bufferView-omitted+sparse branch's own `if (acc.sparse)` condition replaced with `if (false)`
//      (forcing the pre-existing bufferView-omitted path unconditionally)
//        -> exit=1, but NOT a targeted red -- the whole gate CRASHES with an uncaught "accessor 0 has no
//           bufferView" Error, because section 2's own synthetic bufferView-omitted+sparse fixture (built
//           with no try/catch, since it is not expected to throw) hits that exact throw. A real, honestly
//           attributable result (the crash names the exact accessor and the exact pre-existing error string
//           this sabotage forced), not a silent pass.
//   E  the tightly-packed branch's own zero-copy return wrapped in a redundant `new Ctor(new Ctor(...))`
//      (forcing every accessor read, sparse or not, to defensively clone)
//        -> exit=1, 1 red: section 3a's own "still a zero-copy VIEW" check, by name.
//
// Run: node tools/ship/gltfConformance-selfcheck.mjs   (exit 0 all-pass, 1 on any fail)

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { GLBParser } from "../../gpu/GLBParser.js";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error("  FAIL  " + m); } };

// ---- 1. THE REAL KHRONOS FIXTURE -- "Simple Sparse Accessor" (CC-BY-4.0, Marco Hutter 2017), converted
// losslessly from its own .gltf+.bin pair into a .glb via this tree's own tools/export/voxelGlb.mjs's own
// packGlb() -- see gpu/fixtures/PROVENANCE.md's own entry for this fixture for the full derivation. ----
{
    const buf = fs.readFileSync(path.join(ENG, "gpu/fixtures/SimpleSparseAccessor.glb"));
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    const parsed = await GLBParser.parse(ab, {});
    // Hand-decoded directly from the fixture's own raw BIN bytes before writing this check, not assumed from
    // the JSON's own max/min: sparse.indices (bufferView 2, byte offset 240, 3x uint16) = [8, 10, 12];
    // sparse.values (bufferView 3, byte offset 248, 3x vec3 float32) = [[1,2,0], [3,3,0], [5,4,0]].
    const expected = [
        0, 0, 0,  1, 0, 0,  2, 0, 0,  3, 0, 0,  4, 0, 0,  5, 0, 0,  6, 0, 0,   // y=0 row, untouched by sparse
        0, 1, 0,  1, 2, 0,  2, 1, 0,  3, 3, 0,  4, 1, 0,  5, 4, 0,  6, 1, 0,   // y=1 row, indices 8/10/12 patched
    ];
    ok(parsed.positions.length === 42, `parsed 14 vertices (42 floats), got ${parsed.positions.length}`);
    const positions = [...parsed.positions];
    const mismatches = positions.filter((v, i) => Math.abs(v - expected[i]) > 1e-6).length;
    ok(mismatches === 0,
        `!! the sparse-patched POSITION accessor matches the hand-decoded expected array exactly (all 14 ` +
        `vertices, not just the 3 overridden ones) -- ${mismatches} of 42 floats differ. got ${JSON.stringify(positions)}`);
    // The spec-provided cross-check, independent of this gate's own hand-decoded array: the accessor's own
    // declared `max` is [6,4,0], but the UNPATCHED base data alone never exceeds y=1 -- so a reader that
    // silently ignores `sparse` produces a max the file's own JSON already says is wrong.
    const maxY = Math.max(...positions.filter((_, i) => i % 3 === 1));
    ok(Math.abs(maxY - 4) < 1e-6,
        `!! max Y reaches 4, the accessor's own declared max[1] -- an unpatched reader tops out at 1 (the ` +
        `real max of the base data alone), got maxY=${maxY}`);
}

// ---- 2. THE OTHER SPEC-VALID SHAPE -- bufferView OMITTED entirely, sparse the ONLY data the accessor
// carries (spec 2.10.1: the base is an implicit array of zeros). No small Khronos sample fixture exists for
// this shape; built inline instead, no file and no licence question -- the same "no bytes to licence"
// reasoning gpu/fixtures/PROVENANCE.md already states for fbxIngest.ascii.fbx/regressionTri.glb. ----
{
    const idxBytes = new Uint8Array(4);
    new DataView(idxBytes.buffer).setUint16(0, 1, true);
    new DataView(idxBytes.buffer).setUint16(2, 3, true);
    const valBytes = new Uint8Array(8);
    new DataView(valBytes.buffer).setFloat32(0, 9.5, true);
    new DataView(valBytes.buffer).setFloat32(4, -2.25, true);
    const bin = new Uint8Array(12);
    bin.set(idxBytes, 0);
    bin.set(valBytes, 4);
    const json = {
        accessors: [{ componentType: 5126, type: "SCALAR", count: 4, sparse: {
            count: 2,
            indices: { bufferView: 0, componentType: 5123 },
            values: { bufferView: 1 },
        } }],
        bufferViews: [
            { byteOffset: 0, byteLength: 4 },
            { byteOffset: 4, byteLength: 8 },
        ],
    };
    const out = GLBParser._readAccessor(json, bin, 0);
    const expected = [0, 9.5, 0, -2.25];
    ok([...out].every((v, i) => Math.abs(v - expected[i]) < 1e-6),
        `!! a bufferView-omitted sparse accessor starts from an implicit all-zero base and patches indices ` +
        `[1,3] -- got ${JSON.stringify([...out])}, expected ${JSON.stringify(expected)}`);
}

// ---- 3. REGRESSION -- the non-sparse code paths this round's own refactor touched are UNCHANGED. ----
{
    // 3a. Tightly packed, non-sparse: still a zero-copy VIEW onto the BIN buffer, not a defensive clone
    // every accessor read now silently pays for.
    const bin = new Float32Array([1, 2, 3, 4, 5, 6]);
    const bytes = new Uint8Array(bin.buffer);
    const json = { accessors: [{ bufferView: 0, componentType: 5126, type: "VEC3", count: 2 }],
                    bufferViews: [{ byteOffset: 0, byteLength: 24 }] };
    const out = GLBParser._readAccessor(json, bytes, 0);
    ok(out.buffer === bytes.buffer,
        "!! a plain, non-sparse, tightly-packed accessor still returns a zero-copy VIEW onto the BIN buffer " +
        "-- this round's own sparse handling must not silently turn every accessor read into a defensive copy");
    ok(out[0] === 1 && out[5] === 6, "and the values themselves are unchanged");

    // 3b. bufferView omitted, NO sparse: still throws exactly the pre-existing error, not silently treated
    // as an implicit-zero sparse accessor it never asked to be.
    const jsonNoSparse = { accessors: [{ componentType: 5126, type: "VEC3", count: 2 }], bufferViews: [] };
    let threw = null;
    try { GLBParser._readAccessor(jsonNoSparse, bytes, 0); } catch (e) { threw = e.message; }
    ok(threw === "accessor 0 has no bufferView",
        `!! bufferView omitted with NO sparse still throws the pre-existing error unchanged, got: ${JSON.stringify(threw)}`);
}

// ---- 4. THE CLONE-BEFORE-PATCH GUARD -- a tightly-packed, SPARSE accessor must own its own memory before
// being patched, not mutate the shared BIN buffer any OTHER accessor may still read from. Section 1's own
// real-fixture check cannot see this: it never re-reads the same bytes a second way, so a patch applied
// straight onto bin's own buffer would still report the correct VALUES there, just corrupt bin itself for
// anyone else. Proven directly here instead. ----
{
    // 2x vec3 base (24 bytes, offset 0) + 1 sparse index (u16, offset 24) + 2 bytes padding (Float32Array
    // needs its own byteOffset a multiple of 4) + 1 sparse value (vec3, offset 28).
    const combined = new Uint8Array(24 + 2 + 2 + 12);
    new Float32Array(combined.buffer, 0, 6).set([1, 2, 3, 4, 5, 6]);
    new DataView(combined.buffer).setUint16(24, 0, true);     // sparse index: patch element 0
    new Float32Array(combined.buffer, 28, 3).set([9, 9, 9]);  // sparse value: [9,9,9]
    const bufferViews = [
        { byteOffset: 0, byteLength: 24 },
        { byteOffset: 24, byteLength: 2 },
        { byteOffset: 28, byteLength: 12 },
    ];
    const json = { accessors: [{ bufferView: 0, componentType: 5126, type: "VEC3", count: 2, sparse: {
        count: 1, indices: { bufferView: 1, componentType: 5123 }, values: { bufferView: 2 } } }], bufferViews };

    const out = GLBParser._readAccessor(json, combined, 0);
    ok(out.buffer !== combined.buffer,
        "!! a tightly-packed, SPARSE accessor does NOT return a view onto the shared BIN buffer -- it must " +
        "own its own memory before being patched, or the patch would corrupt bin itself for any other " +
        "accessor still reading from the same bytes");
    ok(out[0] === 9 && out[1] === 9 && out[2] === 9 && out[3] === 4 && out[4] === 5 && out[5] === 6,
        `the patch itself is still correct: element 0 -> [9,9,9], element 1 untouched -- got ${JSON.stringify([...out])}`);

    // The direct proof: re-read the IDENTICAL bufferView bytes through a fresh, non-sparse accessor. If the
    // sparse patch above had mutated `combined` in place, this would come back [9,9,9,...] instead of the
    // original base data.
    const rereadJson = { accessors: [{ bufferView: 0, componentType: 5126, type: "VEC3", count: 2 }], bufferViews };
    const reread = GLBParser._readAccessor(rereadJson, combined, 0);
    ok(reread[0] === 1 && reread[1] === 2 && reread[2] === 3,
        `!! the shared BIN buffer's own bytes were NOT mutated by the sparse patch -- a plain re-read of the ` +
        `identical bufferView still shows the ORIGINAL base data, got ${JSON.stringify([...reread].slice(0, 3))}`);
}

console.log(`gltfConformance-selfcheck: ${pass} passed, ${fail} failed`);
console.log("unchecked here: sparse accessors combined with an INTERLEAVED (byteStride) bufferView, and " +
    "sparse on a non-FLOAT componentType -- named honestly as remaining scope for whichever round widens " +
    "this file's own feature matrix next (see gpu/fixtures/PROVENANCE.md's own entry for SimpleSparseAccessor.glb), " +
    "not silently assumed covered. This is the FIRST entry in glTF conformance fixtures against the feature " +
    "matrix (task #7) -- sparse accessors specifically; other feature-matrix gaps, if any survive a future " +
    "audit, are separate work.");
process.exit(fail ? 1 : 0);
