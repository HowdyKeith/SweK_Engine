// WebGLEngine/tools/export/glbConformance-selfcheck.mjs -- v4583
//
// *** v4583 -- TWO ROWS IN THIS FILE WENT RED BECAUSE THE INSTRUMENT GOT BETTER, AND THAT IS ONE DEFECT, NOT
// TWO ACCIDENTS. *** Section 1 required ZERO warnings on disk. Section 6 required the module to contain NO
// rule mentioning skins, animations, images, textures or samplers. Each was a fair way of stopping v4550
// overclaiming, and each was a ratchet pointing the wrong way: adding the rules made both fail on a tree that
// had strictly improved, without a single file changing. A ROW THAT ASSERTS THE STATE OF ITS SUBJECT RATHER
// THAN A PROPERTY OF ITS INSTRUMENT CANNOT SURVIVE THE SUBJECT GETTING BETTER. Both are replaced by
// reconciliations against CORPUS_AT_V4583, which still redden on a NEW kind of finding -- the case worth
// noticing -- and no longer on a fixed one.
//
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

/**
 * *** THE CORPUS AS IT STANDS, TAKEN RATHER THAN REMEMBERED, SO THAT "CLEAN" HAS A DENOMINATOR. ***
 *
 * v4550 shipped this module with a headline of "all 31 GLBs on disk are clean" and one section saying that
 * RobotExpressive's skins and animations were outside what was checked. Both were true. What neither said is
 * how much of the corpus that exemption covered, and the answer measured at v4583 is ALL OF IT: every one of
 * the 31 files carries at least one kind -- images, textures, samplers, materials, skins or animations -- for
 * which the module had no rule at all. Thirty declared an extension nothing consulted. Two were graded on
 * ZERO of the accessors they declare.
 *
 * Every field here is counted by the rows below from the files themselves. The record exists so a change in
 * the corpus is a red row rather than a silently different headline.
 */
export const CORPUS_AT_V4583 = Object.freeze({
    files: 31,
    // Warnings standing on disk, by code. Zero was the previous claim and it was a claim about the rules,
    // not about the tree -- see the note on the section 1 row.
    warningsByCode: Object.freeze({ IMAGE_EXTERNAL_URI: 28 }),
    // Files graded on fewer accessors than they declare, and how many accessor(s) went unread in total.
    partiallyRead: 2, accessorsUnread: 107, accessorsTotal: 645,
    // Of those two, ONE would still read nothing from a complete copy of the file: every accessor in
    // gpu/fixtures/ABeautifulGame-draco.header.glb declares no bufferView, because KHR_draco_mesh_compression
    // holds the geometry. The other is header-only and reverses when the release zip is unpacked.
    headerOnly: 2, filesWithAccessorsLackingBufferView: 1,
    // Files needing a resource served beside them: 28 kit GLBs, all naming the same relative texture, which
    // world/kenneyKit.mjs's 28-entry MANIFEST does not record and no gate checked before this round.
    filesNeedingExternalResource: 28, externalResource: "Textures/colormap.png",
    // Files declaring an extension no rule here interprets, and the extensions in question.
    filesWithUninterpretedExtension: 30,
    uninterpretedExtensions: Object.freeze({ KHR_texture_transform: 28, KHR_materials_transmission: 2, KHR_materials_volume: 2 }),
    // How many files carry each kind that had NO rule at all before v4583. This is the denominator the
    // v4550 headline was missing: the answer is not "RobotExpressive", it is 31 of 31.
    filesCarrying: Object.freeze({ skins: 1, animations: 1, images: 30, textures: 30, samplers: 31, materials: 31 }),
    filesCarryingSomethingPreviouslyUnruled: 31,
});

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const say = (m) => console.log("  ----  " + m);

/** Every GLB in the tree, walked once and cached -- three sections read the same corpus. */
let _glbs = null;
function glbsOnDisk() {
    if (_glbs) return _glbs;
    const out = [];
    (function walk(d) {
        let e; try { e = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
        for (const x of e) {
            if (x.name === "node_modules" || x.name.startsWith(".")) continue;
            const q = path.join(d, x.name);
            if (x.isDirectory()) walk(q); else if (x.name.endsWith(".glb")) out.push(q);
        }
    })(ENG);
    return (_glbs = out.sort());
}

/**
 * The corpus census CORPUS_AT_V4583 is compared against. Everything is counted here from stats.scope, which
 * is itself counted from the file -- so the record is guarded by two derivations and no typed constant.
 */
function corpusCensus() {
    const KINDS = ["skins", "animations", "images", "textures", "samplers", "materials"];
    const c = { files: 0, partial: 0, unread: 0, tot: 0, hdr: 0, noView: 0, ext: 0, uninterp: 0, carrying: 0, byKind: {} };
    for (const k of KINDS) c.byKind[k] = 0;
    for (const f of glbsOnDisk()) {
        const r = GC.validate(fs.readFileSync(f));
        const sc = r.stats.scope;
        c.files++; c.tot += sc.accessorsTotal; c.unread += sc.accessorsTotal - sc.accessorsRead;
        if (sc.accessorsRead < sc.accessorsTotal) c.partial++;
        if (r.stats.headerOnly) c.hdr++;
        if (sc.accessorsWithoutView) c.noView++;
        if (sc.externalResources.length) c.ext++;
        if (sc.extensionsUninterpreted.length) c.uninterp++;
        let any = false;
        for (const k of KINDS) if (r.stats[k]) { c.byKind[k]++; any = true; }
        if (any) c.carrying++;
    }
    return c;
}


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

    const glbs = glbsOnDisk();
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
    // *** THIS ROW USED TO REQUIRE ZERO WARNINGS ON DISK AND IT WENT RED THE MOMENT THE INSTRUMENT GOT
    // BETTER, WHICH IS A DEFECT IN THE ROW AND NOT IN THE TREE. *** Its previous form was
    // `warned.length === 0 && <the channel fires on a fixture>`: a fair claim while the only warning rules
    // were about geometry, and a trap as soon as a rule was added that finds something real. v4583 added
    // IMAGE_EXTERNAL_URI and 28 kit files went from silent to warning WITHOUT ANY FILE CHANGING -- so the
    // row failed on an improvement. Its sibling in section 6 failed the same run for the same reason, and
    // both are instances of one shape: A ROW THAT ASSERTS THE CURRENT STATE OF THE TREE RATHER THAN A
    // PROPERTY OF THE INSTRUMENT CANNOT SURVIVE THE INSTRUMENT IMPROVING.
    //
    // What replaces it is a reconciliation rather than a zero: every warning standing on disk must be a code
    // this gate ACCOUNTS FOR, with the count frozen in CORPUS_AT_V4583, and the channel must still be shown
    // to fire from a fixture. A brand-new warning kind -- the thing worth noticing -- still reddens it.
    const warnFixture = GC.validate(repack(GOOD, (j) => { j.nodes[0].rotation = [0, 0, 0, 2]; }));
    const byCode = {};
    for (const { r } of rows) for (const w of GC.warningsOf(r)) byCode[w.code] = (byCode[w.code] || 0) + 1;
    const unaccounted = Object.keys(byCode).filter((c) => CORPUS_AT_V4583.warningsByCode[c] == null);
    const moved = Object.keys(CORPUS_AT_V4583.warningsByCode).filter((c) => (byCode[c] || 0) !== CORPUS_AT_V4583.warningsByCode[c]);
    say(`warnings on disk by code: ${Object.entries(byCode).map(([c, n]) => `${c} x${n}`).join(", ") || "none"}`);
    ok("!! every warning standing on disk is ACCOUNTED FOR, and the channel fires from a fixture",
        unaccounted.length === 0 && moved.length === 0 && GC.warningsOf(warnFixture).length > 0,
        unaccounted.length ? `unaccounted warning code(s): ${unaccounted.join(", ")} -- a NEW kind of finding, which is the case this row exists for`
        : moved.length ? `count moved for ${moved.map((c) => `${c}: record ${CORPUS_AT_V4583.warningsByCode[c]}, live ${byCode[c] || 0}`).join("; ")}`
        : `${Object.values(byCode).reduce((a, b) => a + b, 0)} warning(s) across ${glbs.length} files, all of ` +
          `codes this gate names, and a non-unit node quaternion still produces ` +
          `${GC.warningsOf(warnFixture).map((x) => x.code).join(", ")} from a fixture. Zero was never the ` +
          `claim worth making -- an unused channel and a clean tree look identical from a zero.`);
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
    // *** v4583: THE FILES THE KITS NEED BESIDE THEM, CHECKED ON DISK RATHER THAN TAKEN ON TRUST. ***
    // stats.scope.externalResources says 28 of these GLBs name a relative texture. Saying so is not the same
    // as knowing it is there, and the module cannot know -- it has no filesystem by design. This gate does.
    // The row resolves each uri against the GLB's own directory, which is how a viewer resolves it, and is
    // the check that would have caught a kit copied without its Textures/ folder.
    const needed = [];
    for (const { e, p: file, r } of rows) {
        for (const uri of r.stats.scope.externalResources) {
            needed.push({ file: e.file, uri, at: path.resolve(path.dirname(file), decodeURIComponent(uri)) });
        }
    }
    const absent = needed.filter((n) => !fs.existsSync(n.at));
    const distinct = new Set(needed.map((n) => n.at));
    say(`${needed.length} external resource reference(s) across ${rows.length} manifest files, ${distinct.size} distinct target(s)`);
    ok("!! *** EVERY FILE THE KIT GLBs NEED BESIDE THEM IS ACTUALLY THERE -- and 28 of them need one ***",
        needed.length > 0 && absent.length === 0,
        absent.length ? absent.slice(0, 3).map((n) => `${n.file} needs ${n.uri}, absent`).join("; ")
        : needed.length === 0 ? "no manifest file declares an external resource, so this row has no subject"
        : `${needed.length} references resolving to ${distinct.size} file(s) on disk: ` +
          `${[...distinct].map((d) => path.relative(ENG, d)).sort().join(", ")}. ` +
          `world/kenneyKit.mjs's MANIFEST records kit, file, span, role, bytes, sha, verts, tris and tile ` +
          `for each entry and does NOT record this dependency -- so the module's own documented workflow ` +
          `("drop GLBs into GPU_Assets/<pack>/") loses it, and 28 models render untextured with nothing red.`);

    ok("!! ...and the manifest's recorded vertex counts agree with the accessors in the files themselves",
        withCounts.length >= 20 && mismatched.length === 0,
        mismatched.length ? mismatched.slice(0, 3).map(({ e }) => e.file + " manifest says " + e.verts).join(", ")
                          : `${withCounts.length} entries cross-checked. The manifest was written by one pass ` +
                            `over these files and this is a second, independent read of the same number.`);
}

// =============================================================================================================
console.log("\n6. *** WHAT A CLEAN VERDICT RESTS ON, CARRIED BY THE VERDICT ITSELF ***");
{
    // *** THE ROW THAT USED TO STAND HERE REQUIRED THE GAP TO STILL BE OPEN, AND SO IT WENT RED THE MOMENT
    // THE GAP WAS CLOSED. *** Its condition was `!rulesForUnchecked` -- the module's comment-stripped source
    // must contain NO rule mentioning skins, animations, images, textures or samplers. As a way of stopping
    // v4550 from overclaiming it was exactly right, and as a standing check it was a ratchet pointing the
    // wrong way: adding the rules made it fail, on a tree that had strictly improved. Section 1's warning row
    // failed the same run for the same reason. ONE SHAPE, TWO INSTANCES: a row that asserts the state of the
    // subject rather than a property of the instrument cannot survive the subject getting better.
    //
    // What replaces it asserts the thing that stays true either way: THE RESULT STATES ITS OWN SCOPE, the
    // statement is DERIVED from the file rather than typed, and it travels with every verdict instead of
    // living in this file's prose. When the next gap is closed these rows keep passing; when a rule is added
    // without being declared, or declared without being added, they go red.
    const robot = path.join(ENG, "GPU_Assets", "RobotExpressive.glb");
    const src = fs.readFileSync(path.join(ENG, "tools", "export", "glbConformance.mjs"), "utf8");
    ok("!! the module says out loud that it is a SUBSET of the spec, not a replacement for the validator",
        /subset/i.test(src) && /glTF-Validator/.test(src) &&
        !/glTF-Validator\s*\((?:MIT|Apache)/.test(src),
        "KhronosGroup/glTF-Validator is the reference implementation and is named as the thing to " +
        "check against if a dependency is ever wanted. Claiming completeness here would be the more " +
        "dangerous error: a file this passes is not thereby valid glTF.");

    // *** THE DECLARED SET IS HELD TO THE SOURCE IN BOTH DIRECTIONS, BECAUSE A HAND-KEPT LIST OF WHAT A
    // CHECKER COVERS IS THE FAILURE THIS TREE KEEPS RE-FINDING. *** INSPECTED_PROPERTIES could drift from the
    // rules two ways and only one of them is obvious: a name left in after its rule is deleted overclaims,
    // and a rule added without its name makes stats.scope.unruled report a gap that no longer exists. Both
    // are red here.
    const bare = src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");
    // *** THIS DETECTOR WAS TOO NARROW ON ITS FIRST RUN AND SAID SO, WHICH IS WHAT IT IS FOR. *** It began as
    // `g.<k>` / `<k>.forEach` / `const <k> =` and reported `extensions` as declared-without-a-rule -- wrongly:
    // the undeclared-extension rule walks the whole document and matches the key as a STRING, so the property
    // is genuinely read and never spelled `g.extensions`. The quoted form is accepted too. It is matched
    // against COMMENT-STRIPPED source, so a property discussed in a header cannot pass for a property checked.
    const readsProperty = (k) => new RegExp(`g\\.${k}\\b|\\b${k}\\.forEach|\\bconst ${k} =|"${k}"`).test(bare);
    const declaredWithoutRule = [...GC.INSPECTED_PROPERTIES].filter((k) => !readsProperty(k));
    // Everything that actually appears at the top level of a GLB in this tree, so the other direction is
    // measured against real files rather than against a second typed list.
    const seenProps = new Set();
    for (const f of glbsOnDisk()) for (const k of Object.keys(GC.splitGlb(fs.readFileSync(f)).json || {})) seenProps.add(k);
    const ruledWithoutDeclaring = [...seenProps].filter((k) => !GC.INSPECTED_PROPERTIES.has(k) && readsProperty(k));
    say(`top-level properties across the corpus: ${[...seenProps].sort().join(", ")}`);
    ok("!! *** INSPECTED_PROPERTIES IS HELD TO THE SOURCE BOTH WAYS -- no name without a rule, no rule without a name ***",
        declaredWithoutRule.length === 0 && ruledWithoutDeclaring.length === 0,
        declaredWithoutRule.length ? `declared but no rule reads it: ${declaredWithoutRule.join(", ")}`
        : ruledWithoutDeclaring.length ? `a rule reads it but it is not declared, so stats.scope.unruled lies: ${ruledWithoutDeclaring.join(", ")}`
        : `${GC.INSPECTED_PROPERTIES.size} declared, each with a rule in the source; ${seenProps.size} distinct ` +
          `top-level properties appear across the ${CORPUS_AT_V4583.files} files and the ones outside the set ` +
          `(${[...seenProps].filter((k) => !GC.INSPECTED_PROPERTIES.has(k)).sort().join(", ") || "none"}) have no rule.`);

    // *** THE SCOPE IS DERIVED, PROVED BY MOVING THE FILE AND WATCHING THE NUMBER FOLLOW. *** A stats field
    // that happened to hold the right constant would pass a comparison against the record and tell a reader
    // nothing; the only way to know it is counted is to change the input.
    if (fs.existsSync(robot)) {
        const base = GC.validate(fs.readFileSync(robot));
        const j = GC.splitGlb(fs.readFileSync(robot)).json;
        const stripped = GC.validate(repack(fs.readFileSync(robot), (m) => { m.accessors[5].bufferView = undefined; delete m.accessors[5].bufferView; }));
        const withCam = GC.validate(repack(fs.readFileSync(robot), (m) => { m.cameras = [{ type: "perspective", perspective: { yfov: 1, znear: 0.1 } }]; }));
        say(`RobotExpressive: ${(j.skins || []).length} skins, ${(j.animations || []).length} animations, ` +
            `${(j.accessors || []).length} accessors, ${GC.errorsOf(base).length} findings, ` +
            `scope reads ${base.stats.scope.accessorsRead} of ${base.stats.scope.accessorsTotal}`);
        ok("!! *** stats.scope IS COUNTED FROM THE FILE: take one accessor's bufferView away and the count drops ***",
            base.stats.scope.accessorsRead === (j.accessors || []).length &&
            stripped.stats.scope.accessorsRead === base.stats.scope.accessorsRead - 1 &&
            stripped.stats.scope.accessorsWithoutView === 1 &&
            withCam.stats.scope.unruled.includes("cameras") && !base.stats.scope.unruled.includes("cameras"),
            `${base.stats.scope.accessorsRead} of ${base.stats.scope.accessorsTotal} read normally, ` +
            `${stripped.stats.scope.accessorsRead} with one accessor's bufferView removed, and adding a ` +
            `camera -- a property this module has no rule for -- makes it appear in scope.unruled where it ` +
            `was absent before. None of the three numbers is typed anywhere.`);

        // The claim v4550's row was reaching for, said in the form that survives the fix: what a clean
        // verdict rests on is now IN the verdict.
        const draco = path.join(ENG, "gpu", "fixtures", "ABeautifulGame-draco.header.glb");
        const dr = fs.existsSync(draco) ? GC.validate(fs.readFileSync(draco)) : null;
        ok("!! *** A CLEAN RESULT CARRIES ITS OWN DENOMINATOR NOW, AND ON ONE FILE THAT DENOMINATOR IS ZERO ***",
            dr !== null && GC.errorsOf(dr).length === 0 && dr.stats.scope.accessorsRead === 0 &&
            dr.stats.scope.accessorsTotal === 32 && dr.stats.scope.accessorsWithoutView === 32 &&
            GC.scopeLines(dr).some((l) => /0 of 32/.test(l)),
            dr === null ? "the Draco fixture is not on disk"
            : `gpu/fixtures/ABeautifulGame-draco.header.glb grades CLEAN having read 0 of its 32 accessors -- ` +
              `all 32 declare no bufferView because KHR_draco_mesh_compression holds the geometry, so this is ` +
              `true of a complete copy of the file and not only of the stripped fixture. reportLines and the ` +
              `CLI both print that sentence beside the verdict; before v4583 the verdict travelled alone.`);
    }

    // The corpus record, reconciled field by field against a fresh read of the files.
    const live = corpusCensus();
    const drift = Object.entries({
        files: live.files, partiallyRead: live.partial, accessorsUnread: live.unread, accessorsTotal: live.tot,
        headerOnly: live.hdr, filesWithAccessorsLackingBufferView: live.noView,
        filesNeedingExternalResource: live.ext, filesWithUninterpretedExtension: live.uninterp,
        filesCarryingSomethingPreviouslyUnruled: live.carrying,
    }).filter(([k, v]) => CORPUS_AT_V4583[k] !== v);
    ok("!! *** THE DENOMINATOR THE v4550 HEADLINE WAS MISSING: 31 OF 31 FILES CARRY SOMETHING IT HAD NO RULE FOR ***",
        drift.length === 0 && live.carrying === live.files,
        drift.length ? drift.map(([k, v]) => `${k}: record ${CORPUS_AT_V4583[k]}, live ${v}`).join("; ")
        : `${live.carrying} of ${live.files} files carry images, textures, samplers, materials, skins or ` +
          `animations -- every one of them. ${live.unread} of ${live.tot} accessors go unread across ` +
          `${live.partial} files, ${live.ext} files need ${CORPUS_AT_V4583.externalResource} served beside ` +
          `them, and ${live.uninterp} declare an extension no rule interprets. "31 clean" was a true ` +
          `sentence about a subset nobody had counted.`);
}

// =============================================================================================================
console.log("\n7. *** THE RULES ADDED AT v4583, BROKEN ONE AT A TIME ON FILES THAT REALLY HAVE THE FEATURE ***");
{
    // *** THE SUBJECT IS A REAL FILE IN EVERY CASE, WHICH IS NOT A STYLE CHOICE. *** Section 6's predecessor
    // began as a test that the strings "skins" and "animations" were absent from a six-vertex cube's stats --
    // true of every tree ever built and evidence of nothing. A skin rule is worth exactly as much as the
    // skinned file it has been run against, so these mutate GPU_Assets/RobotExpressive.glb (2 skins, 14
    // animations, 283 accessors), a Kenney kit GLB (images, textures, samplers, materials) and the Draco
    // fixture (extensionsRequired), and each case must produce ITS OWN code.
    const robotPath = path.join(ENG, "GPU_Assets", "RobotExpressive.glb");
    const kitPath = glbsOnDisk().find((f) => /kenney-\w+[\\/]models[\\/]/.test(f));
    const dracoPath = path.join(ENG, "gpu", "fixtures", "ABeautifulGame-draco.header.glb");
    const load = (p) => (fs.existsSync(p) ? new Uint8Array(fs.readFileSync(p)) : null);
    const ROBOT = load(robotPath), KIT = kitPath ? load(kitPath) : null, DRACO = load(dracoPath);

    // Each case: [subject, code, what was broken, mutation]
    const cases = [
        // ---- extensions -------------------------------------------------------------------------------
        [DRACO, "EXTENSION_REQUIRED_NOT_USED", "an extension required but not declared as used",
            (j) => { j.extensionsUsed = j.extensionsUsed.filter((e) => e !== "KHR_draco_mesh_compression"); }],
        [DRACO, "UNDECLARED_EXTENSION", "an extension used deep in the document and never declared",
            (j) => { j.meshes[0].primitives[0].extensions.KHR_texture_transform = { offset: [0, 0] }; }],
        // ---- an accessor with nothing behind it ---------------------------------------------------------
        [ROBOT, "ACCESSOR_NO_DATA_SOURCE", "an accessor with a bounding box and no bytes to justify it",
            (j) => { delete j.accessors[1].bufferView; j.accessors[1].min = [0, 0, 1]; j.accessors[1].max = [1, 1, 1]; }],
        // ---- skins ---------------------------------------------------------------------------------------
        [ROBOT, "SKIN_IBM_ACCESSOR_COUNT", "43 joints against 42 inverse bind matrices",
            (j) => { j.accessors[j.skins[0].inverseBindMatrices].count = 42; }],
        [ROBOT, "SKIN_IBM_INVALID_FORMAT", "inverse bind matrices stored as VEC4 instead of MAT4",
            (j) => { j.accessors[j.skins[0].inverseBindMatrices].type = "VEC4"; }],
        [ROBOT, "NODE_SKIN_WITHOUT_MESH", "a node carrying a skin and no mesh",
            (j) => { const n = j.nodes.findIndex((x) => x.skin != null); delete j.nodes[n].mesh; }],
        [ROBOT, "MESH_PRIMITIVE_JOINTS_WEIGHTS_MISMATCH", "a skinned node pointing at unskinned geometry",
            (j) => { const n = j.nodes.find((x) => x.skin != null); delete j.meshes[n.mesh].primitives[0].attributes.WEIGHTS_0; }],
        [ROBOT, "UNRESOLVED_REFERENCE", "a joint index past the end of the node list",
            (j) => { j.skins[0].joints[3] = 99999; }],
        // ---- animations ------------------------------------------------------------------------------------
        [ROBOT, "ANIMATION_SAMPLER_INPUT_ACCESSOR_WITHOUT_BOUNDS", "keyframe times with no min/max, so nothing knows the clip length",
            (j) => { delete j.accessors[j.animations[0].samplers[0].input].min; }],
        [ROBOT, "ANIMATION_SAMPLER_INPUT_ACCESSOR_INVALID_FORMAT", "keyframe times stored as VEC3",
            (j) => { j.accessors[j.animations[0].samplers[0].input].type = "VEC3"; }],
        [ROBOT, "ANIMATION_SAMPLER_INVALID_INTERPOLATION", "an interpolation mode that is not one of the three",
            (j) => { j.animations[0].samplers[0].interpolation = "SMOOTH"; }],
        [ROBOT, "ANIMATION_SAMPLER_OUTPUT_ACCESSOR_INVALID_COUNT", "an output that is not a whole number of keyframes",
            (j) => { j.accessors[j.animations[0].samplers[0].output].count -= 1; }],
        [ROBOT, "ANIMATION_CHANNEL_OUTPUT_COUNT", "a weights channel whose output no longer matches keyframes x targets",
            (j) => { const s = j.animations[0].samplers[0]; j.accessors[s.output].count = j.accessors[s.input].count; }],
        [ROBOT, "ANIMATION_CHANNEL_TARGET_INVALID_PATH", "a channel driving a property that does not exist",
            (j) => { j.animations[0].channels[0].target.path = "colour"; }],
        [ROBOT, "ANIMATION_CHANNEL_TARGET_INVALID_TYPE", "VEC3 output driving a rotation",
            (j) => { const c = j.animations[0].channels.find((x) => x.target.path === "rotation");
                     j.accessors[j.animations[0].samplers[c.sampler].output].type = "VEC3"; }],
        [ROBOT, "UNRESOLVED_REFERENCE", "a channel pointing at a sampler the animation does not have",
            (j) => { j.animations[0].channels[0].sampler = 4242; }],
        // ---- images, textures, samplers ---------------------------------------------------------------------
        [KIT, "IMAGE_URI_AND_BUFFERVIEW", "an image claiming both a uri and a bufferView",
            (j) => { j.images[0].bufferView = 0; }],
        [KIT, "IMAGE_NO_SOURCE", "an image with neither",
            (j) => { delete j.images[0].uri; }],
        [KIT, "IMAGE_MIME_TYPE_MISSING", "an embedded image with no mimeType",
            (j) => { delete j.images[0].uri; j.images[0].bufferView = 0; }],
        [KIT, "IMAGE_MIME_TYPE_INVALID", "an embedded image claiming a type no declared extension permits",
            (j) => { delete j.images[0].uri; j.images[0].bufferView = 0; j.images[0].mimeType = "image/ktx2"; }],
        [KIT, "SAMPLER_INVALID_FILTER", "a minFilter that is not a GL enum",
            (j) => { j.samplers[0].minFilter = 9999; }],
        [KIT, "SAMPLER_INVALID_WRAP", "a wrap mode that is not a GL enum",
            (j) => { j.samplers[0].wrapS = 5; }],
        [KIT, "UNRESOLVED_REFERENCE", "a texture pointing at an image that is not there",
            (j) => { j.textures[0].source = 7; }],
        [KIT, "TEXTURE_NO_SOURCE", "a texture with no image and no extension to supply one",
            (j) => { delete j.textures[0].source; }],
        // ---- materials ---------------------------------------------------------------------------------------
        [KIT, "MATERIAL_INVALID_ALPHA_MODE", "an alphaMode outside the three the spec names",
            (j) => { j.materials[0].alphaMode = "DITHER"; }],
        [KIT, "MATERIAL_INVALID_FACTOR", "a metallicFactor above 1",
            (j) => { j.materials[0].pbrMetallicRoughness.metallicFactor = 1.5; }],
        [KIT, "MATERIAL_ALPHA_CUTOFF_UNUSED", "an alphaCutoff on a material that is not MASK",
            (j) => { j.materials[0].alphaCutoff = 0.5; }],
        [KIT, "TEXTURE_INFO_INVALID_TEXCOORD", "a negative UV set index",
            (j) => { j.materials[0].pbrMetallicRoughness.baseColorTexture.texCoord = -1; }],
        [KIT, "UNRESOLVED_REFERENCE", "a material pointing at a texture that is not there",
            (j) => { j.materials[0].pbrMetallicRoughness.baseColorTexture.index = 9; }],
    ];

    let fired = 0, missed = [];
    const cleanCodes = new Set();
    for (const b of [ROBOT, KIT, DRACO]) if (b) for (const x of GC.validate(b).issues) cleanCodes.add(x.code);
    for (const [subject, code, what, mutate] of cases) {
        if (!subject) { ok("   " + code + " -- " + what, false, "subject file is not on disk"); continue; }
        const codes = codesOf(repack(subject, mutate));
        const hit = codes.includes(code);
        if (hit) fired++; else missed.push(code + " (" + what + ")");
        ok((hit ? "   " : "!! ") + code + " -- " + what, hit, hit ? "" : "produced: " + [...new Set(codes)].join(", "));
    }
    ok("!! *** ALL " + cases.length + " FIRE, AND NONE OF THEM IS PRODUCED BY THE UNMUTATED FILES ***",
        missed.length === 0 && cases.every(([, code]) => code === "UNRESOLVED_REFERENCE" || !cleanCodes.has(code)),
        missed.length ? "missed: " + missed.join("; ")
        : `${fired} rules, each broken alone against a file that really carries the feature. The three ` +
          `subjects produce ${[...cleanCodes].join(", ") || "nothing"} unmutated, so no case is passing on a ` +
          `finding that was already there. UNRESOLVED_REFERENCE is the one code reused across cases -- it is ` +
          `the spec's own code for a dangling index and the PATH distinguishes them, which the details above show.`);
}

// =============================================================================================================
console.log("\n8. *** SPARSE ACCESSORS: ZERO ON DISK, SO THE FIXTURE IS BUILT AND THE NULL RESULT IS STATED ***");
{
    // *** NOT ONE OF THE 31 GLBs IN THIS TREE USES A SPARSE ACCESSOR. *** That is why the sparse rules are
    // written from the spec and proved here against a fixture assembled on top of a REAL writeSceneGlb export
    // rather than against the corpus: a rule with no subject anywhere in the tree is exactly the rule that
    // will be wrong the first time somebody imports a file that has one, and sparse is the opening item of
    // the import-side round for the same reason.
    //
    // The fixture overrides POSITION elements 1 and 4 with values OUTSIDE the original bounding box and
    // updates min/max to match. That is deliberate: if the substitution is not applied, the recomputed
    // min/max disagree and the file reads as broken -- so the fixture being CLEAN is itself the proof that
    // readAccessor honours sparse, which it did not before v4583.
    const SUB = { 1: [9, 9, 9], 4: [-8, -8, -8] };
    // The index pair is a parameter rather than a constant so that the ORDERING rule and the RANGE rule each
    // get a fixture that breaks only itself. The first attempt reached the ordering rule by shortening the
    // index view and re-reading it as bytes, which produced a non-increasing pair on the way to an
    // out-of-range one -- two faults in one file, and the row that wanted the second passed on the first.
    function sparseFixture(mutate = () => {}, { indices = [1, 4] } = {}) {
        const s = GC.splitGlb(GOOD);
        const bin = s.bin;
        const idxBytes = new Uint8Array(new Uint16Array(indices).buffer);                         // 4 bytes
        const valBytes = new Uint8Array(new Float32Array([...SUB[1], ...SUB[4]]).buffer);          // 24 bytes
        const newBin = new Uint8Array(bin.byteLength + idxBytes.length + valBytes.length);
        newBin.set(bin, 0);
        newBin.set(idxBytes, bin.byteLength);
        newBin.set(valBytes, bin.byteLength + idxBytes.length);
        return repack(GOOD, (j) => {
            const at = bin.byteLength;
            const bvIdx = j.bufferViews.push({ buffer: 0, byteOffset: at, byteLength: idxBytes.length }) - 1;
            const bvVal = j.bufferViews.push({ buffer: 0, byteOffset: at + idxBytes.length, byteLength: valBytes.length }) - 1;
            j.buffers[0].byteLength = newBin.byteLength;
            const ai = j.meshes[0].primitives[0].attributes.POSITION;
            j.accessors[ai].sparse = {
                count: 2,
                indices: { bufferView: bvIdx, byteOffset: 0, componentType: 5123 },
                values: { bufferView: bvVal, byteOffset: 0 },
            };
            // The bounds now describe the substituted data, which is what the spec requires.
            const base = [...CUBE.positions];
            for (const [k, v] of Object.entries(SUB)) for (let c = 0; c < 3; c++) base[k * 3 + c] = v[c];
            for (let c = 0; c < 3; c++) {
                j.accessors[ai].min[c] = Math.min(...[0, 1, 2, 3, 4, 5].map((e) => base[e * 3 + c]));
                j.accessors[ai].max[c] = Math.max(...[0, 1, 2, 3, 4, 5].map((e) => base[e * 3 + c]));
            }
            mutate(j, { ai, bvIdx, bvVal });
        }, { binBytes: newBin });
    }

    const good = sparseFixture();
    const rGood = GC.validate(good);
    ok("!! *** A VALID SPARSE ACCESSOR IS CLEAN, WHICH PROVES THE OVERRIDE IS APPLIED AND NOT SKIPPED ***",
        GC.errorsOf(rGood).length === 0,
        GC.errorsOf(rGood).length
            ? GC.errorsOf(rGood).map((x) => x.code + " " + x.path + " " + x.detail).join("; ")
            : `Two of six positions are substituted to values outside the original box and min/max follow ` +
              `them. Until v4583 readAccessor returned the BASE data and this fixture would have read as ` +
              `ACCESSOR_MIN_MISMATCH -- a correct file called broken, which is the error a second ` +
              `implementation is meant to remove rather than introduce.`);

    // The control: take the sparse block away and leave the bounds. Now the declared box really is wrong,
    // and the min/max rule must say so -- which is what says the substitution was doing work above.
    const noSub = GC.validate(sparseFixture((j, { ai }) => { delete j.accessors[ai].sparse; }));
    ok("!! ...and removing the substitution while keeping its bounds is caught, so the fixture is not vacuous",
        codesOf(sparseFixture((j, { ai }) => { delete j.accessors[ai].sparse; })).some((c) => c === "ACCESSOR_MIN_MISMATCH" || c === "ACCESSOR_MAX_MISMATCH"),
        `${GC.errorsOf(noSub).map((x) => x.code).join(", ")} -- the bounds describe data that is only there ` +
        `because of the sparse block, so dropping it makes them wrong.`);

    const sparseCases = [
        ["ACCESSOR_SPARSE_COUNT", "a sparse block overriding zero elements", (j, { ai }) => { j.accessors[ai].sparse.count = 0; }],
        ["ACCESSOR_SPARSE_COUNT_OUT_OF_RANGE", "more overrides than the accessor has elements", (j, { ai }) => { j.accessors[ai].sparse.count = 99; }],
        ["ACCESSOR_SPARSE_INDICES_TYPE", "sparse indices stored as floats", (j, { ai }) => { j.accessors[ai].sparse.indices.componentType = 5126; }],
        ["ACCESSOR_SPARSE_INDEX_OOB", "an override aimed past the end of the accessor", null, { indices: [1, 9] }],
        ["ACCESSOR_SPARSE_INDICES_NON_INCREASING", "overrides listed out of order, which the spec forbids", null, { indices: [4, 1] }],
        ["UNRESOLVED_REFERENCE", "sparse values pointing at a bufferView that is not there", (j, { ai }) => { j.accessors[ai].sparse.values.bufferView = 77; }],
        ["UNDEFINED_PROPERTY", "a sparse block with no values at all", (j, { ai }) => { delete j.accessors[ai].sparse.values; }],
        ["BUFFER_VIEW_INVALID_BYTE_STRIDE", "a byteStride on the view holding sparse indices", (j, { bvIdx }) => { j.bufferViews[bvIdx].byteStride = 4; }],
    ];
    let sMissed = [];
    for (const [code, what, mutate, opts] of sparseCases) {
        const codes = codesOf(sparseFixture(mutate || (() => {}), opts));
        const hit = codes.includes(code);
        if (!hit) sMissed.push(code);
        ok((hit ? "   " : "!! ") + code + " -- " + what, hit, hit ? "" : "produced: " + [...new Set(codes)].join(", "));
    }
    ok("!! *** ALL " + sparseCases.length + " SPARSE RULES FIRE, ON A FEATURE NO FILE IN THIS TREE USES ***",
        sMissed.length === 0,
        sMissed.length ? "missed: " + sMissed.join(", ")
        : `${sparseCases.length} rules with zero subjects in the corpus, each broken alone against a built ` +
          `fixture. A NULL RESULT on disk is recorded as one: 0 of ${CORPUS_AT_V4583.files} files carries a ` +
          `sparse accessor, so nothing here was measured against this tree's own habits.`);
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
    "question from whether the instrument exists. " +
    "\n*** WHAT v4583 FOUND ON THE WAY AND IS WORTH MORE THAN THE RULES: 28 OF THIS TREE'S KIT GLBs ARE NOT " +
    "SELF-CONTAINED. *** Each names one relative texture, Textures/colormap.png, which world/kenneyKit.mjs's " +
    "28-entry MANIFEST does not record and no gate checked before this round. The module's own documented " +
    "workflow is to drop .glb files into GPU_Assets/<pack>/ -- and doing exactly that, without also copying " +
    "the sibling Textures/ folder, yields 28 models that fetch, parse, validate, render, and are silently " +
    "untextured. That is not a spec violation, which is why it is a WARNING and a stats.scope.externalResources " +
    "entry rather than an error: the spec permits an external uri. It is an INTAKE fact, and it is now stated " +
    "by the verdict instead of discovered by a person wondering why the city is grey. " +
    "\nWHAT IS STILL OUTSIDE THE RULES, counted rather than claimed: cameras and extras have no rule here " +
    "(0 files use either); KHR_texture_transform, KHR_materials_transmission and KHR_materials_volume are " +
    "declared by 30 files and INTERPRETED by nothing, so an error inside one of those payloads is outside " +
    "what a clean verdict here can mean; and 2 files are still graded on 0 accessors, one of them for a " +
    "reason no complete copy of the file would fix. All four numbers come out of stats.scope.");
process.exit(fails ? 1 : 0);
