// WebGLEngine/tools/export/glbConformance-selfcheck.mjs -- v4550
//
// Run: node tools/export/glbConformance-selfcheck.mjs
//
// *** IT LIVES BESIDE ITS MODULE AND NOT IN tools/ship/, AND THAT IS A CONSTRAINT RATHER THAN A PREFERENCE.
// *** tools/ship/registryOrphans.mjs derives a bench instrument's module from its GATE path --
// moduleFor(gate) = gate.replace(/-selfcheck\.mjs$/, ".mjs") -- so a gate in tools/ship/ naming a module in
// tools/export/ is reported as benchBroken, which is exactly what the first draft of this round did. The
// module belongs next to the two writers it grades; the gate follows it rather than the other way round.
//
// GATES tools/export/glbConformance.mjs -- spec-SEMANTICS checking for the GLBs this tree writes and reads,
// as opposed to the container checks tools/ship/voxelGlb-selfcheck.mjs and dracoWeld-selfcheck.mjs already do.
//
// *** THE RESULT ON REAL FILES IS A NULL RESULT, AND THAT IS EXACTLY WHY THE FIXTURES BELOW EXIST. *** All 31
// GLBs on disk -- 29 Kenney kit models, GPU_Assets/RobotExpressive.glb, and the two header-only fixtures --
// come back with zero errors and zero warnings, and so do both of this tree's own writers. A validator that
// has only ever said "fine" has said nothing: the number that matters is not 31 clean, it is how many of the
// spec's MUSTs this thing can actually catch when one is broken. Section 2 breaks fifteen of them, one at a
// time, against a REAL export rather than a hand-typed JSON blob, and requires the specific error code.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as GC from "./glbConformance.mjs";
import { writeGlb } from "./voxelGlb.mjs";
import { writeSceneGlb } from "./sceneGlb.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const say = (m) => console.log("  ----  " + m);

console.log("glbConformance-selfcheck -- what the bytes MEAN, not whether they are well-formed\n");

// ---- a real export to mutate, and a repacker that leaves the BIN untouched ---------------------------------
// The fixtures below start from an ACTUAL writeSceneGlb output rather than a JSON literal, because a literal
// is a second, simpler writer -- and a validator graded against a fixture nothing in this tree produces is
// graded against a file shape that does not exist here.
const CUBE = {
    positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 1, 0, 0, 0, 1, 1, 0, 1]),
    normals: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1]),
    indices: new Uint16Array([0, 1, 2, 3, 4, 5]),
    name: "fixture",
};
const GOOD = writeSceneGlb({ meshes: [CUBE] });

/** Re-pack a GLB with a mutated JSON chunk, keeping the BIN chunk byte-identical. */
function repack(bytes, mutate, { binBytes = null } = {}) {
    const s = GC.splitGlb(bytes);
    const json = JSON.parse(JSON.stringify(s.json));
    mutate(json);
    const jsonBytes = new TextEncoder().encode(JSON.stringify(json));
    const pad4 = (n) => (n + 3) & ~3;
    const jLen = pad4(jsonBytes.length);
    const bin = binBytes !== null ? binBytes : s.bin;
    const bLen = bin ? pad4(bin.byteLength) : 0;
    const total = 12 + 8 + jLen + (bin ? 8 + bLen : 0);
    const out = new Uint8Array(total);
    const dv = new DataView(out.buffer);
    dv.setUint32(0, GC.MAGIC, true); dv.setUint32(4, 2, true); dv.setUint32(8, total, true);
    dv.setUint32(12, jLen, true); dv.setUint32(16, GC.JSON_CHUNK, true);
    out.set(jsonBytes, 20);
    for (let i = jsonBytes.length; i < jLen; i++) out[20 + i] = 0x20;          // JSON pads with spaces
    if (bin) {
        const o = 20 + jLen;
        dv.setUint32(o, bLen, true); dv.setUint32(o + 4, GC.BIN_CHUNK, true);
        out.set(bin, o + 8);
    }
    return out;
}

const codesOf = (bytes, opts) => GC.validate(bytes, opts).issues.map((x) => x.code);
const has = (bytes, code, opts) => codesOf(bytes, opts).includes(code);

// =============================================================================================================
console.log("1. *** BOTH OF THIS TREE'S WRITERS, AND ALL 31 GLBs ON DISK, ARE SPEC-CLEAN ***");
{
    const rGood = GC.validate(GOOD);
    ok("!! writeSceneGlb's output has zero errors and zero warnings",
        GC.errorsOf(rGood).length === 0 && GC.warningsOf(rGood).length === 0,
        JSON.stringify(rGood.issues.slice(0, 3)));
    const rVox = GC.validate(writeGlb([{ name: "v", positions: CUBE.positions }]));
    ok("!! ...and so does writeGlb's, which is a different writer sharing only the container",
        GC.errorsOf(rVox).length === 0 && GC.warningsOf(rVox).length === 0,
        JSON.stringify(rVox.issues.slice(0, 3)));

    const glbs = [];
    (function walk(d) {
        let e; try { e = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
        for (const x of e) {
            if (x.name === "node_modules" || x.name.startsWith(".")) continue;
            const p = path.join(d, x.name);
            if (x.isDirectory()) walk(p); else if (x.name.endsWith(".glb")) glbs.push(p);
        }
    })(ENG);
    const rows = glbs.map((f) => ({ f, r: GC.validate(fs.readFileSync(f)) }));
    const bad = rows.filter(({ r }) => GC.errorsOf(r).length);
    const warned = rows.filter(({ r }) => GC.warningsOf(r).length);
    const hdr = rows.filter(({ r }) => r.stats.headerOnly);
    say(`${glbs.length} GLBs on disk: ${rows.length - bad.length - warned.length} clean, ${warned.length} with warnings, ` +
        `${bad.length} with errors, ${hdr.length} header-only fixtures`);
    ok("!! *** NO GLB IN THIS TREE VIOLATES A SPEC MUST -- 29 kit models, RobotExpressive, and both fixtures ***",
        glbs.length >= 20 && bad.length === 0,
        bad.length ? bad.map(({ f, r }) => path.basename(f) + ": " + GC.errorsOf(r)[0].code).join(", ")
                   : `A NULL RESULT, and section 2 is what makes it one worth having. The kits are Kenney ` +
                     `output and Khronos-derived, so clean is the expected answer; the value of running it is ` +
                     `that ui/cityPack.js now has something to run when a kit is ADDED.`);
    // *** THE FIRST DRAFT OF THIS ROW WAS `warned.length === 0 || warned.length < glbs.length`, WHICH IS TRUE
    // OF EVERY POSSIBLE TREE. *** Zero warnings on disk only means something if the warning channel can fire
    // at all, so it is tied to a warning actually being produced rather than to an inequality that cannot fail.
    const warnFixture = GC.validate(repack(GOOD, (j) => { j.nodes[0].rotation = [0, 0, 0, 2]; }));
    ok("!! zero warnings on disk is a RESULT, because the warning channel demonstrably fires",
        warned.length === 0 && GC.warningsOf(warnFixture).length > 0,
        `0 of ${glbs.length} files warn, while a non-unit node quaternion produces ` +
        `${GC.warningsOf(warnFixture).map((x) => x.code).join(", ")}. An unused channel and a clean tree ` +
        `look identical from the count alone.`);
}

// =============================================================================================================
console.log("\n2. *** FIFTEEN SPEC VIOLATIONS, ONE AT A TIME, EACH REQUIRING ITS OWN ERROR CODE ***");
{
    const iPos = (j) => j.meshes[0].primitives[0].attributes.POSITION;
    const iIdx = (j) => j.meshes[0].primitives[0].indices;
    const cases = [
        ["ACCESSOR_TOO_LONG", "an accessor that reads past the end of its bufferView",
            (j) => { j.accessors[iPos(j)].count = 4096; }],
        ["ACCESSOR_MIN_MISMATCH", "*** POSITION min that disagrees with the vertices in the buffer ***",
            (j) => { j.accessors[iPos(j)].min[0] = -99; }],
        ["ACCESSOR_MAX_MISMATCH", "*** POSITION max that disagrees with the vertices in the buffer ***",
            (j) => { j.accessors[iPos(j)].max[1] = 99; }],
        // NOTE this one is driven from the BIN and not the JSON -- see section 3. Shrinking POSITION's count
        // would also produce it, and would have been a fixture about two rules at once.
        ["ACCESSOR_INDEX_OOB", "*** an index referencing a vertex the mesh does not have ***", null],
        ["MESH_PRIMITIVE_POSITION_ACCESSOR_WITHOUT_BOUNDS", "POSITION with min/max deleted",
            (j) => { delete j.accessors[iPos(j)].min; delete j.accessors[iPos(j)].max; }],
        ["MESH_PRIMITIVE_UNEQUAL_ACCESSOR_COUNT", "NORMAL with a different count from POSITION",
            (j) => { j.accessors[j.meshes[0].primitives[0].attributes.NORMAL].count = 2; }],
        ["UNRESOLVED_REFERENCE", "a primitive pointing at a material that does not exist",
            (j) => { j.meshes[0].primitives[0].material = 7; }],
        ["MESH_PRIMITIVE_INCOMPATIBLE_MODE", "an index count that is not a multiple of 3 for TRIANGLES",
            (j) => { j.accessors[iIdx(j)].count = 5; }],
        ["BUFFER_VIEW_TOO_LONG", "a bufferView reaching past the end of its buffer",
            (j) => { j.bufferViews[0].byteLength = 1 << 20; }],
        ["ACCESSOR_TOTAL_OFFSET_ALIGNMENT", "a FLOAT accessor at an offset that is not a multiple of 4",
            (j) => { j.accessors[iPos(j)].byteOffset = 2; j.accessors[iPos(j)].count = 1; }],
        ["MESH_PRIMITIVE_INDICES_ACCESSOR_INVALID_FORMAT", "FLOAT indices",
            (j) => { j.accessors[iIdx(j)].componentType = 5126; }],
        ["ASSET_VERSION", "asset.version that is not 2.0",
            (j) => { j.asset.version = "1.0"; }],
        ["NODE_MATRIX_TRS", "a node carrying both a matrix and a TRS component",
            (j) => { j.nodes[0].matrix = new Array(16).fill(0); j.nodes[0].translation = [1, 2, 3]; }],
        ["MESH_PRIMITIVE_INVALID_ATTRIBUTE_TYPE", "TEXCOORD_0 declared VEC3",
            (j) => { j.meshes[0].primitives[0].attributes.TEXCOORD_0 = iPos(j); }],
        ["NODE_ROTATION_NON_UNIT", "a node rotation quaternion that is not unit length",
            (j) => { j.nodes[0].rotation = [0, 0, 0, 2]; }],
    ];
    let caught = 0;
    // The OOB fixture edits the index BUFFER rather than any count: index 0 is made to point at vertex 999.
    const oobBin = new Uint8Array(GC.splitGlb(GOOD).bin);
    {
        const j = GC.splitGlb(GOOD).json;
        const ia = j.accessors[j.meshes[0].primitives[0].indices];
        const at = (j.bufferViews[ia.bufferView].byteOffset || 0) + (ia.byteOffset || 0);
        new DataView(oobBin.buffer).setUint16(at, 999, true);
    }
    for (const [code, what, mutate] of cases) {
        const bytes = mutate === null ? repack(GOOD, () => {}, { binBytes: oobBin }) : repack(GOOD, mutate);
        const got = codesOf(bytes);
        const hit = got.includes(code);
        if (hit) caught++;
        ok((code.startsWith("ACCESSOR_MIN") || code.startsWith("ACCESSOR_MAX") || code === "ACCESSOR_INDEX_OOB" ? "!! " : "   ") +
            code + " -- " + what,
            hit, hit ? "" : "got " + JSON.stringify(got.slice(0, 4)));
    }
    ok("!! *** ALL FIFTEEN FIRE, AND THE UNMUTATED FILE FIRES NONE OF THEM ***",
        caught === cases.length && GC.validate(GOOD).issues.length === 0,
        `${caught} of ${cases.length} caught; the clean original reports ${GC.validate(GOOD).issues.length} issue(s). ` +
        `A fixture set where the CLEAN file also trips something would prove the checks fire, not that they discriminate.`);
}

// =============================================================================================================
console.log("\n3. *** THE THREE CHECKS THAT NEED THE BUFFER, NOT THE JSON -- WHICH IS THE WHOLE POINT ***");
{
    // A writer that computes its own bounds wrongly is internally consistent: the JSON agrees with itself and
    // every reference resolves. Only the vertices can contradict it, so these three are the reason this
    // module reads the BIN chunk at all rather than checking a schema.
    const s = GC.splitGlb(GOOD);
    const binNaN = new Uint8Array(s.bin);
    new DataView(binNaN.buffer).setFloat32(0, NaN, true);
    ok("!! *** A NaN IN THE VERTEX BUFFER IS FOUND, AND NOTHING IN THE JSON CHANGED ***",
        has(repack(GOOD, () => {}, { binBytes: binNaN }), "ACCESSOR_INVALID_FLOAT"),
        "the spec forbids non-finite floats in an accessor; a schema check cannot see this and neither can a " +
        "container check -- the file is perfectly well-formed");

    // And the min/max recomputation must follow the DATA when the data moves, not only when the JSON does.
    const binMoved = new Uint8Array(s.bin);
    new DataView(binMoved.buffer).setFloat32(0, -50, true);      // move vertex 0's x below the declared min
    ok("!! *** MOVING A VERTEX BREAKS min WITHOUT TOUCHING THE JSON AT ALL ***",
        has(repack(GOOD, () => {}, { binBytes: binMoved }), "ACCESSOR_MIN_MISMATCH"),
        "this is the same finding as the min fixture in section 2 approached from the other side: there, the " +
        "declaration lied about the data; here, the data left the declaration behind. A check that only " +
        "compared min to max, or min to a schema, would pass both.");

    // The float comparison is at FLOAT precision on purpose -- a min written from a Float32 and re-read as a
    // JSON double is not bit-equal to the double, and demanding that would redden every honest export.
    const exact = GC.validate(writeSceneGlb({ meshes: [{ positions: new Float32Array([0.1, 0.2, 0.3, 1.1, 2.2, 3.3, -0.7, 0.05, 9.9]) }] }));
    ok("!! ...and the tolerance is FLOAT ROUND-TRIP, so awkward decimals do not read as mismatches",
        GC.errorsOf(exact).length === 0,
        "0.1, 0.2, 0.3, -0.7, 0.05, 9.9 through Float32 and back: " + JSON.stringify(GC.errorsOf(exact).slice(0, 2)) +
        ". Comparing the JSON double to the stored float bit-for-bit would fail every real export.");
}

// =============================================================================================================
console.log("\n4. *** A STRIPPED FIXTURE AND A CORRUPT FILE ARE DIFFERENT FACTS, AND THE FIRST DRAFT BLURRED THEM ***");
{
    // gpu/fixtures/ holds two GLBs that are the JSON of a real Khronos asset with the payload removed, under
    // the PROVENANCE.md rule that assets ship in release zips. The first run of this validator reported both
    // as BUFFER_GLB_CHUNK_TOO_BIG -- "declares 42945692, BIN chunk holds 0" -- which is true and useless: it
    // reads the tree's own discipline as a defect.
    const hdrs = ["gpu/fixtures/ABeautifulGame-plain.header.glb", "gpu/fixtures/ABeautifulGame-draco.header.glb"]
        .map((f) => path.join(ENG, f)).filter((f) => fs.existsSync(f));
    say(`${hdrs.length} header-only fixture(s) on disk`);
    const hres = hdrs.map((f) => GC.validate(fs.readFileSync(f)));
    ok("!! a header-only fixture is CLASSIFIED, not excused -- no BIN chunk at all is a known shape",
        hdrs.length === 2 && hres.every((r) => r.stats.headerOnly && GC.errorsOf(r).length === 0),
        hres.map((r, i) => path.basename(hdrs[i]) + " headerOnly=" + r.stats.headerOnly + " errors=" + GC.errorsOf(r).length).join(", "));

    // *** AND THE LINE IS NOT DRAWN BY FILENAME, WHICH WOULD HIDE A REAL CORRUPTION. *** A BIN chunk that
    // EXISTS and is shorter than the buffer it backs is still an error, and this is the fixture that says so.
    const s = GC.splitGlb(GOOD);
    const shortBin = s.bin.subarray(0, 8);
    const r = GC.validate(repack(GOOD, () => {}, { binBytes: shortBin }));
    ok("!! *** ...WHILE A BIN CHUNK THAT EXISTS AND IS TOO SHORT IS STILL AN ERROR ***",
        GC.errorsOf(r).some((x) => x.code === "BUFFER_GLB_CHUNK_TOO_BIG") && !r.stats.headerOnly,
        "headerOnly=" + r.stats.headerOnly + ", codes " + JSON.stringify([...new Set(GC.errorsOf(r).map((x) => x.code))]) +
        ". The distinction is NO BIN CHUNK versus A SHORT ONE, which is a property of the file. Excusing " +
        "*.header.glb by name would have passed this fixture the moment somebody named a corrupt file that way.");
}

// =============================================================================================================
console.log("\n5. *** THE INTAKE WIRING: EVERY GLB world/kenneyKit.mjs's MANIFEST NAMES, CHECKED HERE ***");
{
    // *** THIS ROW LIVES IN THIS GATE AND NOT IN kenneyKit-selfcheck.mjs, AND THE REASON IS A MEASUREMENT.
    // *** That gate is recorded at 11,003 ms against a 3,000 ms ship-time budget -- 8 seconds over -- so it
    // does not run at ship time at all. Putting the intake check there would have placed it exactly where
    // the previous round found 43 of this tree's 94 frozen records sitting: guarded on paper by something
    // the ritual cannot afford to run. The whole cost of validating the manifest is 42 ms, so it belongs in
    // a gate that actually runs.
    const K = await import("../../world/kenneyKit.mjs");
    const rows = K.MANIFEST.map((e) => ({ e, p: path.join(ENG, K.modelPath(e)) }))
        .filter(({ p }) => fs.existsSync(p))
        .map(({ e, p }) => ({ e, p, r: GC.validate(fs.readFileSync(p)) }));
    const bad = rows.filter(({ r }) => GC.errorsOf(r).length);
    const missing = K.MANIFEST.length - rows.length;
    say(`${rows.length} of ${K.MANIFEST.length} manifest entries present on disk, across ${Object.keys(K.KITS).length} kits`);
    ok("!! *** EVERY KIT GLB THE MANIFEST NAMES IS SPEC-VALID, CHECKED BEFORE ui/cityPack.js WOULD PLACE IT ***",
        rows.length >= 20 && bad.length === 0 && missing === 0,
        bad.length ? bad.map(({ e, r }) => e.file + ": " + GC.errorsOf(r)[0].code).join(", ")
                   : `${rows.length} files, 0 errors. ui/cityPack.js fetches these at RUNTIME in a browser and ` +
                     `hands them to the asset loader with no inspection; this is the build-time half, which is ` +
                     `where a bad kit file should be caught rather than on a user's frame.`);
    // The manifest already records verts and tris per entry. Cross-checking them against the accessor counts
    // in the FILE is a second reading of the same fact from a different source -- which is the only kind of
    // agreement worth asserting.
    const withCounts = rows.filter(({ e }) => e.verts != null);
    const mismatched = withCounts.filter(({ e, p }) => {
        const g = GC.splitGlb(fs.readFileSync(p)).json;
        let v = 0;
        for (const m of g.meshes || []) for (const pr of m.primitives || []) {
            const a = g.accessors[pr.attributes?.POSITION];
            if (a) v += a.count;
        }
        return v !== e.verts;
    });
    ok("!! ...and the manifest's recorded vertex counts agree with the accessors in the files themselves",
        withCounts.length >= 20 && mismatched.length === 0,
        mismatched.length ? mismatched.slice(0, 3).map(({ e }) => e.file + " manifest says " + e.verts).join(", ")
                          : `${withCounts.length} entries cross-checked. The manifest was written by one pass ` +
                            `over these files and this is a second, independent read of the same number.`);
}

// =============================================================================================================
console.log("\n6. *** WHAT THIS DOES NOT CHECK, NAMED RATHER THAN LEFT TO BE DISCOVERED ***");
{
    const src = fs.readFileSync(path.join(ENG, "tools", "export", "glbConformance.mjs"), "utf8");
    // Sparse accessors are the one glTF feature this tree's PARSER is known not to support -- it is the
    // opening item of the gltf-conformance-fixtures round -- and this validator does not check them either.
    // *** AND IT NAMES THE REFERENCE WITHOUT CLAIMING A LICENCE FOR IT. *** `owner/repo (LICENCE)` in a
    // header is this tree's form for RECORDING A GRANT; the first draft wrote "(MIT)" from a plan document
    // without opening the repository, and tools/ship/citedSources-selfcheck.mjs went red at 50 against a
    // baseline of 49 -- correctly, because a round that takes from a new source without registering it moves
    // that debt up. Nothing was taken: these rules come from the spec text. So the licence claim went, and
    // this row keeps it gone.
    ok("!! the module says out loud that it is a SUBSET of the spec, not a replacement for the validator",
        /subset/i.test(src) && /glTF-Validator/.test(src) &&
        !/glTF-Validator\s*\((?:MIT|Apache)/.test(src),
        "KhronosGroup/glTF-Validator is the reference implementation and is named as the thing to " +
        "check against if a dependency is ever wanted. Claiming completeness here would be the more " +
        "dangerous error: a file this passes is not thereby valid glTF.");
    // *** THE LIMIT IS MEASURED ON A FILE THAT REALLY HAS THE UNCHECKED FEATURES, NOT ASSERTED ABOUT A CUBE.
    // *** The first draft of this row tested that the strings "skins" and "animations" were absent from a
    // six-vertex export's stats, which is true of every tree and says nothing about coverage.
    const robot = path.join(ENG, "GPU_Assets", "RobotExpressive.glb");
    if (fs.existsSync(robot)) {
        const j = GC.splitGlb(fs.readFileSync(robot)).json;
        const r = GC.validate(fs.readFileSync(robot));
        const src2 = src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");
        const rulesForUnchecked = /skins|animations|\bimages\b|\btextures\b|samplers/.test(src2);
        say(`RobotExpressive: ${(j.skins || []).length} skins, ${(j.animations || []).length} animations, ` +
            `${(j.accessors || []).length} accessors -- and ${GC.errorsOf(r).length} findings`);
        ok("!! *** A CLEAN RESULT IS NARROWER THAN IT LOOKS, AND THE NUMBERS SAY HOW MUCH ***",
            (j.skins || []).length > 0 && (j.animations || []).length > 0 &&
            GC.errorsOf(r).length === 0 && !rulesForUnchecked,
            `${(j.skins || []).length} skins and ${(j.animations || []).length} animations across ` +
            `${(j.accessors || []).length} accessors, and this module contains NO rule mentioning skins, ` +
            `animations, images, textures or samplers (checked against its comment-stripped source). So the ` +
            `"clean" above means the geometry rules found nothing, not that the file is valid glTF -- and a ` +
            `reader who took it for the second would be wrong in exactly the way section 5 exists to prevent.`);
    }
}

console.log("\n" + (fails ? "FAIL -- " + fails + " check(s)" : "ALL GREEN") +
    "\nWIRED, in the three places the ritual can actually reach: tools/ship/voxelGlb-selfcheck.mjs and " +
    "tools/ship/sceneGlb-selfcheck.mjs now grade their own writers against the spec rather than only against " +
    "the container and this tree's own reader -- and the wiring was proved by breaking each WRITER (a min " +
    "off by one, an index set to 60000) and watching the WRITER'S OWN gate go red -- plus section 5 above " +
    "for the 28 kit files. *** THE INTAKE ROW IS IN THIS GATE AND NOT IN kenneyKit-selfcheck.mjs FOR A " +
    "MEASURED REASON: that gate is 11,003 ms against a 3,000 ms budget, 8 seconds over, so it does not run " +
    "at ship time *** -- putting the check there would have parked it exactly where the previous round found " +
    "43 of 94 frozen records sitting, guarded on paper by something the ritual cannot afford to run. The " +
    "whole manifest costs 42 ms to validate. " +
    "\nSTILL NOT WIRED, and named rather than assumed: ui/cityPack.js fetches kit GLBs at RUNTIME in a " +
    "browser and hands them straight to the asset loader. Nothing checks a file that arrives by any route " +
    "other than the manifest -- a GLB dropped into GPU_Assets/ is discovered by filename and loaded " +
    "unexamined. glbConformance.mjs has zero node imports and would run in a browser as-is; what is missing " +
    "is a decision about whether a runtime check is worth its cost on a user's frame, which is a different " +
    "question from whether the instrument exists.");
process.exit(fails ? 1 : 0);
