// WebGLEngine/tools/export/glbConformance.mjs -- v4583
//
// *** v4583: THE CLEAN VERDICT NOW CARRIES ITS OWN DENOMINATOR, AND THE DENOMINATOR WAS 31 OF 31. ***
//
// v4550 shipped this file with a headline of "all 31 GLBs on disk are clean" and one section of its gate
// noting that RobotExpressive's 2 skins and 14 animations were outside what it checked. Both true. What
// neither said is how much of the corpus that exemption covered, and the count taken before a line of v4583
// was written is EVERY FILE: all 31 carry images, textures, samplers, materials, skins or animations, for
// which there was no rule at all; 30 declare an extension nothing consulted; and TWO were graded on ZERO of
// the accessors they declare -- one because its BIN is stripped, and gpu/fixtures/ABeautifulGame-draco.header
// .glb because all 32 of its accessors have no bufferView, which stays true of a complete copy of that file.
//
// *** SO THE SCOPE IS A FIELD OF THE RESULT NOW AND NOT A PARAGRAPH IN A GATE. *** stats.scope counts, from
// the file, how many accessors had their bytes read, which top-level properties no rule inspects, which
// declared extensions are not interpreted, and which resources the file needs served beside it. It goes out
// with every verdict -- reportLines, the CLI, and anything in a browser -- because a caveat that lives in one
// selfcheck's prose is a caveat that does not travel.
//
// *** AND THE RULES CONSULT THE EXTENSION LISTS, BECAUSE THE BASE SPEC ALONE GETS THIS CORPUS WRONG TWICE
// OVER. *** A naive reading says image/mimeType MUST be image/jpeg or image/png: run that here and it reports
// 33 findings, every one a LEGAL image in a file whose extensionsRequired names KHR_texture_basisu. The same
// instrument that calls a legal file broken will call a broken file legal the moment an unfamiliar extension
// appears, and those are one error wearing two faces.
//
// What v4583 added, each proved by breaking it alone against a file that really has the feature (29 cases) or
// against a built fixture where the tree has no subject at all (8 sparse cases, 0 of 31 files use one):
// extensionsRequired/Used consistency and a document-wide undeclared-extension walk; accessors with no data
// source; sparse accessors, INCLUDING applying the override before min/max are recomputed -- without which a
// correct sparse file reads as ACCESSOR_MIN_MISMATCH; skins and their inverse bind matrices; animation
// samplers and channels, with the exact output count checked where the target path is known; images,
// textures, samplers; and materials.
//
// ---------------------------------------------------------------------------------------------------------
// WebGLEngine/tools/export/glbConformance.mjs -- v4550
//
// *** THE CONTAINER IS CHECKED IN THIS TREE AND THE SPEC IS NOT, AND THOSE ARE DIFFERENT FAILURE MODES. ***
//
// What already exists, measured before this file was written: tools/ship/voxelGlb-selfcheck.mjs asserts the
// magic is 0x46546C67 and the version is 2 and that a FLOAT bufferView never lands at an odd offset;
// tools/ship/dracoWeld-selfcheck.mjs refuses a second spelling of the glTF magic; `componentType` appears
// four times in sceneGlb-selfcheck and three in voxelGlb-selfcheck. Every one of those is about the BYTES
// being well-formed.
//
// None of them asks whether the bytes MEAN anything legal. A file whose accessor claims a count that reads
// forty bytes past the end of its bufferView, or whose POSITION min/max disagree with the vertices actually
// in the buffer, or whose index buffer references vertex 5,000 of a 900-vertex mesh, passes all of it -- and
// then crashes, or silently renders wrong, in whichever viewer someone opens it in. AND NO VALIDATOR EXISTS
// ANYWHERE IN THE TREE: a grep for gltf-validator across package.json and every .mjs/.js returns nothing.
//
// ---- WHY THIS IS WRITTEN RATHER THAN VENDORED ----------------------------------------------------------
//
// *** THE LICENCE IS NOT STATED HERE, AND THAT IS DELIBERATE. *** The first draft of this header named the
// validator with a parenthesised licence after it, copied out of a plan document without opening the repo --
// and tools/ship/citedSources-selfcheck.mjs caught it, because `owner/repo (LICENCE)` in a module header is
// this tree's form for RECORDING A GRANT, not for naming a project in passing. Two things were wrong with
// it: the licence was unverified, and no grant was taken -- the rules below are implemented from the SPEC
// TEXT, not from that repository's code. *** AND THE FIRST ATTEMPT TO EXPLAIN THAT REPRODUCED IT: *** the
// correction quoted the offending string verbatim, which is the same `owner/repo (LICENCE)` the scanner
// looks for, so the debt stayed at 50 and this file's own gate row caught it. Third time in three rounds
// that narrating a pattern re-created it -- after a census counting a record MENTIONED in a header, and a
// typed-array row moved by prose about a byte array. The rule that keeps working: describe the shape, never
// spell it. The same round filed f82-tint-metal-fresnel with its licence
// explicitly unchecked; asserting one here would have been the identical error one file over.
//
// KhronosGroup/glTF-Validator is the reference implementation and is the right thing to check against
// if a dependency is ever wanted. It is Dart compiled to JavaScript, ships as a large single artefact, and
// would be the only build-output dependency in a tree whose whole discipline is hand-written checkable
// modules. The rules below are the subset that applies to what this tree actually WRITES (tools/export/
// voxelGlb.mjs, tools/export/sceneGlb.mjs) and READS (29 Kenney kit GLBs under vendor/, RobotExpressive),
// implemented from the spec text, each carrying the spec's own error code so a finding can be looked up.
//
// *** WHAT MAKES THIS A CHECK AND NOT A RESTATEMENT OF THE WRITER: min AND max ARE RECOMPUTED FROM THE
// BUFFER, AND EVERY INDEX IS RANGE-TESTED AGAINST THE REAL VERTEX COUNT. *** A validator that trusted the
// JSON's own numbers would agree with any writer that was internally consistent and wrong, which is exactly
// the failure a second implementation is for.
//
// Severity is the spec's own distinction and is not blurred: ERROR is a MUST, WARNING is a SHOULD.
"use strict";

export const MAGIC = 0x46546C67;        // "glTF"
export const JSON_CHUNK = 0x4E4F534A;   // "JSON"
export const BIN_CHUNK = 0x004E4942;    // "BIN\0"

/** componentType -> [bytes, TypedArray]. The spec's five, plus BYTE/SHORT which this tree never writes. */
export const COMPONENT = Object.freeze({
    5120: { size: 1, name: "BYTE", ctor: Int8Array },
    5121: { size: 1, name: "UNSIGNED_BYTE", ctor: Uint8Array },
    5122: { size: 2, name: "SHORT", ctor: Int16Array },
    5123: { size: 2, name: "UNSIGNED_SHORT", ctor: Uint16Array },
    5125: { size: 4, name: "UNSIGNED_INT", ctor: Uint32Array },
    5126: { size: 4, name: "FLOAT", ctor: Float32Array },
});

export const TYPE_COMPONENTS = Object.freeze({
    SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT2: 4, MAT3: 9, MAT4: 16,
});

/** Primitive modes. TRIANGLES is the only one this tree writes; the rest decide the count rule below. */
export const MODE = Object.freeze({
    0: { name: "POINTS", min: 1, mul: 1 }, 1: { name: "LINES", min: 2, mul: 2 },
    2: { name: "LINE_LOOP", min: 2, mul: 1 }, 3: { name: "LINE_STRIP", min: 2, mul: 1 },
    4: { name: "TRIANGLES", min: 3, mul: 3 }, 5: { name: "TRIANGLE_STRIP", min: 3, mul: 1 },
    6: { name: "TRIANGLE_FAN", min: 3, mul: 1 },
});

/**
 * *** THESE TWO SETS ARE WHAT LETS A RESULT STATE ITS OWN SCOPE, AND THEY ARE GUARDED IN BOTH DIRECTIONS. ***
 * A hand-kept list of what a checker covers is the exact shape this tree has been bitten by repeatedly -- a
 * LIST standing in for a DISCOVERY -- so glbConformance-selfcheck.mjs holds them to the source: every name in
 * INSPECTED_PROPERTIES must have a rule reading it, and every top-level property that appears in any GLB on
 * disk and is NOT in the set must have no rule at all. Adding a rule without adding its name, or the reverse,
 * goes red.
 */
export const INSPECTED_PROPERTIES = new Set([
    "asset", "buffers", "bufferViews", "accessors", "meshes", "nodes", "scenes", "scene",
    "skins", "animations", "images", "textures", "samplers", "materials",
    "extensions", "extensionsUsed", "extensionsRequired",
]);

/** Extensions whose PRESENCE widens a base-spec rule here. None of them is interpreted -- see stats.scope. */
export const CONSULTED_EXTENSIONS = new Set([
    "KHR_draco_mesh_compression", "KHR_texture_basisu", "EXT_texture_webp", "EXT_texture_avif",
]);

const ERROR = "ERROR", WARNING = "WARNING";

/**
 * Split a GLB into its header, JSON and BIN. Returns { ok, issues, json, bin }.
 *
 * Deliberately tolerant of a TRUNCATED file rather than throwing: gpu/fixtures/ deliberately holds
 * header-only GLBs under the PROVENANCE.md rule that assets ship in release zips and not in the repo, and a
 * validator that cannot tell "this is 2 KB of a 6 MB file" from "this file is malformed" would report the
 * tree's own discipline as a defect.
 */
export function splitGlb(bytes) {
    const issues = [];
    const add = (code, severity, detail) => issues.push({ code, severity, path: "", detail });
    if (bytes.byteLength < 12) { add("GLB_TOO_SHORT", ERROR, `${bytes.byteLength} bytes; a header is 12`); return { ok: false, issues, truncated: true }; }
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const magic = dv.getUint32(0, true), version = dv.getUint32(4, true), total = dv.getUint32(8, true);
    if (magic !== MAGIC) { add("GLB_MAGIC", ERROR, "0x" + magic.toString(16)); return { ok: false, issues }; }
    if (version !== 2) add("GLB_VERSION", ERROR, String(version));
    const truncated = total > bytes.byteLength;
    if (total !== bytes.byteLength && !truncated) add("GLB_LENGTH_MISMATCH", ERROR, `header says ${total}, file is ${bytes.byteLength}`);

    let off = 12, json = null, bin = null;
    while (off + 8 <= bytes.byteLength) {
        const len = dv.getUint32(off, true), kind = dv.getUint32(off + 4, true);
        if (len % 4 !== 0) add("GLB_CHUNK_LENGTH_UNPADDED", ERROR, `chunk at ${off} is ${len} bytes, not a multiple of 4`);
        const start = off + 8;
        if (start + len > bytes.byteLength) { if (!truncated) add("GLB_CHUNK_TRUNCATED", ERROR, `chunk at ${off} claims ${len} bytes, ${bytes.byteLength - start} remain`); break; }
        if (kind === JSON_CHUNK && json === null) json = bytes.subarray(start, start + len);
        else if (kind === BIN_CHUNK && bin === null) bin = bytes.subarray(start, start + len);
        off = start + len;
    }
    if (!json) { if (!truncated) add("GLB_NO_JSON_CHUNK", ERROR, "no JSON chunk found"); return { ok: false, issues, truncated }; }
    let parsed = null;
    try { parsed = JSON.parse(new TextDecoder().decode(json)); }
    catch (e) { add("GLB_JSON_UNPARSEABLE", ERROR, String(e.message).slice(0, 120)); return { ok: false, issues, truncated }; }
    return { ok: true, issues, json: parsed, bin, truncated };
}

const elementSize = (a) => (COMPONENT[a.componentType]?.size ?? 0) * (TYPE_COMPONENTS[a.type] ?? 0);

/**
 * Read one accessor's data out of the BIN chunk, honouring byteStride. Returns a plain array of numbers,
 * length count * components, or null when the accessor cannot be read (which the caller has already
 * reported as a bounds or reference error).
 */
const GETTER = { 5120: "getInt8", 5121: "getUint8", 5122: "getInt16", 5123: "getUint16", 5125: "getUint32", 5126: "getFloat32" };

export function readAccessor(gltf, bin, i) {
    const a = gltf.accessors?.[i];
    if (!a) return null;
    const C = COMPONENT[a.componentType];
    const n = TYPE_COMPONENTS[a.type];
    if (!C || !n || !bin) return null;
    let out;
    if (a.bufferView != null) {
        const bv = gltf.bufferViews?.[a.bufferView];
        if (!bv) return null;
        const base = (bv.byteOffset || 0) + (a.byteOffset || 0);
        const stride = bv.byteStride || (C.size * n);
        out = new Array(a.count * n);
        const dv = new DataView(bin.buffer, bin.byteOffset, bin.byteLength);
        const get = GETTER[a.componentType];
        for (let e = 0; e < a.count; e++) {
            const at = base + e * stride;
            if (at + C.size * n > bin.byteLength) return null;
            for (let c = 0; c < n; c++) out[e * n + c] = dv[get](at + c * C.size, true);
        }
    } else if (a.sparse) {
        // The spec: an accessor with sparse and no bufferView has a base of ALL ZEROS. Returning null here,
        // which this function did until v4583, silently skipped every rule that reads the data.
        out = new Array(a.count * n).fill(0);
    } else {
        return null;                                                // no data source at all -- reported above
    }
    // *** THE OVERRIDE HAS TO BE APPLIED OR EVERY min/max RULE READS THE WRONG NUMBERS. *** Without this, a
    // perfectly legal sparse file gets ACCESSOR_MIN_MISMATCH because the bounds describe the data AFTER the
    // substitution and the reader stopped before it -- the validator calling a correct writer wrong, which is
    // the failure mode a second implementation is supposed to remove rather than add.
    if (a.sparse) applySparse(gltf, bin, a, out, n, C);
    return out;
}

/** Substitute a sparse accessor's overriding elements in place. Silently does nothing if unreadable -- the
 *  structural rules in validate() report a bad sparse block, and reporting it twice from here would double. */
function applySparse(gltf, bin, a, out, n, C) {
    const sp = a.sparse;
    const iv = gltf.bufferViews?.[sp.indices?.bufferView];
    const vv = gltf.bufferViews?.[sp.values?.bufferView];
    if (!iv || !vv || !(sp.count >= 1)) return;
    const idx = readSparseIndices(iv, bin, sp);
    if (!idx) return;
    const get = GETTER[a.componentType];
    if (!get) return;
    const dv = new DataView(bin.buffer, bin.byteOffset, bin.byteLength);
    const vBase = (vv.byteOffset || 0) + (sp.values.byteOffset || 0);
    for (let k = 0; k < idx.length; k++) {
        const target = idx[k];
        if (!(target >= 0 && target < a.count)) continue;
        const at = vBase + k * C.size * n;
        if (at + C.size * n > bin.byteLength) return;
        for (let c = 0; c < n; c++) out[target * n + c] = dv[get](at + c * C.size, true);
    }
}

/**
 * Read a sparse accessor's index array out of the BIN. Separate from readAccessor because a sparse index
 * block is addressed by its OWN componentType and byteOffset rather than the accessor's, and folding the two
 * into one reader is how a validator ends up checking the wrong bytes and reporting a pass.
 */
export function readSparseIndices(view, bin, sparse) {
    const C = COMPONENT[sparse.indices?.componentType];
    if (!C || !bin || !view) return null;
    const base = (view.byteOffset || 0) + (sparse.indices.byteOffset || 0);
    if (base + sparse.count * C.size > bin.byteLength) return null;
    const dv = new DataView(bin.buffer, bin.byteOffset, bin.byteLength);
    const get = { 5121: "getUint8", 5123: "getUint16", 5125: "getUint32" }[sparse.indices.componentType];
    if (!get) return null;
    const out = new Array(sparse.count);
    for (let k = 0; k < sparse.count; k++) out[k] = dv[get](base + k * C.size, true);
    return out;
}

/**
 * The whole check. Returns { issues, stats } -- issues carry the spec's own error code, a severity, a JSON
 * pointer-ish path, and a detail naming the numbers, because a finding a reader cannot act on is noise.
 */
export function validate(bytes, { checkNormals = true } = {}) {
    const split = splitGlb(bytes);
    const issues = [...split.issues];
    const E = (code, path, detail) => issues.push({ code, severity: ERROR, path, detail });
    const W = (code, path, detail) => issues.push({ code, severity: WARNING, path, detail });
    if (!split.ok) return { issues, stats: { readable: false, truncated: !!split.truncated } };
    const g = split.json, bin = split.bin;
    let headerOnly = false;
    let accessorsRead = 0;                 // counted, not assumed -- see stats.scope below

    // ---- asset -------------------------------------------------------------------------------------------
    if (!g.asset) E("UNDEFINED_PROPERTY", "/asset", "required");
    else if (g.asset.version !== "2.0") E("ASSET_VERSION", "/asset/version", String(g.asset.version));

    // ---- buffers and bufferViews -------------------------------------------------------------------------
    const buffers = g.buffers || [], views = g.bufferViews || [], accessors = g.accessors || [];
    buffers.forEach((b, i) => {
        // A GLB's buffer 0 is the BIN chunk and carries no uri. Its declared length must fit the chunk --
        // the chunk is padded to 4 and the declared length is NOT, so <= rather than ===.
        if (i === 0 && b.uri == null) {
            // *** A MISSING BIN CHUNK AND A SHORT ONE ARE DIFFERENT FACTS, AND THE FIRST RUN OF THIS FILE
            // REPORTED THEM AS THE SAME ONE. *** gpu/fixtures/ holds two GLBs that are the JSON of a real
            // Khronos asset with the payload STRIPPED -- 32 KB standing in for 42 MB -- under the
            // PROVENANCE.md rule that assets ship in release zips and not in the repo. They carry a
            // self-consistent 12-byte header and no BIN chunk whatsoever, and calling that "buffer declares
            // 42945692, BIN chunk holds 0" is true and useless: it reports the tree's own discipline as a
            // defect. The line drawn here is NOT an exemption by filename, which would hide a real
            // corruption the day somebody named a file that way: NO BIN CHUNK AT ALL is header-only, a BIN
            // chunk that exists and is SHORTER than the buffer it backs is still an error.
            if (bin == null) headerOnly = true;
            else if (b.byteLength > bin.byteLength)
                E("BUFFER_GLB_CHUNK_TOO_BIG", `/buffers/0`, `declares ${b.byteLength}, BIN chunk holds ${bin.byteLength}`);
            else if (bin.byteLength - b.byteLength > 3)
                W("BUFFER_GLB_PADDING", `/buffers/0`, `BIN chunk is ${bin.byteLength}, buffer declares ${b.byteLength} -- more than 3 bytes of slack is not alignment padding`);
        }
    });
    views.forEach((v, i) => {
        const p = `/bufferViews/${i}`;
        const buf = buffers[v.buffer];
        if (buf == null) { E("UNRESOLVED_REFERENCE", p + "/buffer", String(v.buffer)); return; }
        if (!(v.byteLength > 0)) E("BUFFER_VIEW_INVALID_BYTE_LENGTH", p, String(v.byteLength));
        if ((v.byteOffset || 0) + v.byteLength > buf.byteLength)
            E("BUFFER_VIEW_TOO_LONG", p, `${(v.byteOffset || 0)} + ${v.byteLength} > buffer ${buf.byteLength}`);
        if (v.byteStride != null) {
            if (v.byteStride % 4 !== 0) E("BUFFER_VIEW_INVALID_BYTE_STRIDE", p + "/byteStride", `${v.byteStride} is not a multiple of 4`);
            if (v.byteStride < 4 || v.byteStride > 252) E("BUFFER_VIEW_INVALID_BYTE_STRIDE", p + "/byteStride", `${v.byteStride} outside [4, 252]`);
            // The spec forbids byteStride on a bufferView used for indices; target 34963 is ELEMENT_ARRAY_BUFFER.
            if (v.target === 34963) E("BUFFER_VIEW_INVALID_BYTE_STRIDE", p + "/byteStride", "defined on an ELEMENT_ARRAY_BUFFER view");
        }
    });

    // ---- accessors ---------------------------------------------------------------------------------------
    const posMinMaxOwed = new Set();
    accessors.forEach((a, i) => {
        const p = `/accessors/${i}`;
        const C = COMPONENT[a.componentType], n = TYPE_COMPONENTS[a.type];
        if (!C) { E("ACCESSOR_INVALID_COMPONENT_TYPE", p + "/componentType", String(a.componentType)); return; }
        if (!n) { E("ACCESSOR_INVALID_TYPE", p + "/type", String(a.type)); return; }
        if (!(a.count >= 1)) E("ACCESSOR_INVALID_COUNT", p + "/count", String(a.count));
        // The spec: accessor.byteOffset AND (bufferView.byteOffset + accessor.byteOffset) must both be a
        // multiple of the component size. The second is the one a hand-written packer gets wrong, because
        // the first is trivially satisfied by writing 0.
        if ((a.byteOffset || 0) % C.size !== 0)
            E("ACCESSOR_OFFSET_ALIGNMENT", p + "/byteOffset", `${a.byteOffset} not a multiple of ${C.size} (${C.name})`);
        if (a.bufferView == null) return;
        const v = views[a.bufferView];
        if (!v) { E("UNRESOLVED_REFERENCE", p + "/bufferView", String(a.bufferView)); return; }
        if (((v.byteOffset || 0) + (a.byteOffset || 0)) % C.size !== 0)
            E("ACCESSOR_TOTAL_OFFSET_ALIGNMENT", p + "/byteOffset",
              `bufferView ${(v.byteOffset || 0)} + accessor ${(a.byteOffset || 0)} not a multiple of ${C.size} (${C.name})`);
        const es = elementSize(a);
        const stride = v.byteStride || es;
        if (v.byteStride != null && v.byteStride < es)
            E("BUFFER_VIEW_INVALID_BYTE_STRIDE", `/bufferViews/${a.bufferView}/byteStride`, `${v.byteStride} < element size ${es}`);
        // *** THE BOUNDS RULE THIS FILE EXISTS FOR. *** The last element must END inside the bufferView; the
        // stride applies BETWEEN elements, so the final one occupies only its own element size.
        const need = (a.byteOffset || 0) + (a.count - 1) * stride + es;
        if (a.count >= 1 && need > v.byteLength)
            E("ACCESSOR_TOO_LONG", p, `reads ${need} bytes of a ${v.byteLength}-byte bufferView ` +
              `(count ${a.count}, stride ${stride}, element ${es})`);
        // min/max shape. Presence is only REQUIRED for POSITION, which is checked at the primitive below.
        for (const k of ["min", "max"]) {
            if (a[k] == null) continue;
            if (!Array.isArray(a[k]) || a[k].length !== n)
                E("ACCESSOR_MIN_MAX_LENGTH", `${p}/${k}`, `${Array.isArray(a[k]) ? a[k].length : typeof a[k]} entries for ${a.type} (needs ${n})`);
            else if (a[k].some((x) => !Number.isFinite(x)))
                E("ACCESSOR_MIN_MAX_NON_FINITE", `${p}/${k}`, JSON.stringify(a[k]));
        }
    });

    // ---- the data itself: min/max recomputed, floats finite --------------------------------------------
    // *** RECOMPUTED FROM THE BUFFER RATHER THAN READ FROM THE JSON, WHICH IS THE DIFFERENCE BETWEEN A CHECK
    // AND A RESTATEMENT. *** A writer that computes its own bounds wrongly is internally consistent and the
    // JSON agrees with itself; only the vertices can say otherwise.
    accessors.forEach((a, i) => {
        if (a.bufferView == null && !a.sparse) return;
        const n = TYPE_COMPONENTS[a.type];
        if (!n || !COMPONENT[a.componentType]) return;
        const data = readAccessor(g, bin, i);
        if (!data) return;                                            // already reported as bounds/reference
        accessorsRead++;
        if (a.componentType === 5126) {
            const bad = data.findIndex((x) => !Number.isFinite(x));
            if (bad >= 0) E("ACCESSOR_INVALID_FLOAT", `/accessors/${i}`, `element ${Math.floor(bad / n)} component ${bad % n} is ${data[bad]}`);
        }
        for (const k of ["min", "max"]) {
            if (!Array.isArray(a[k]) || a[k].length !== n) continue;
            for (let c = 0; c < n; c++) {
                let want = data[c];
                for (let e = 1; e < a.count; e++) {
                    const x = data[e * n + c];
                    want = k === "min" ? Math.min(want, x) : Math.max(want, x);
                }
                // Float32 round-trip: the JSON carries a double that was written from a float, so compare at
                // float precision rather than demanding bit equality of a decimal literal.
                const got = a[k][c];
                const same = a.componentType === 5126 ? Math.fround(got) === Math.fround(want) : got === want;
                if (!same) {
                    E(k === "min" ? "ACCESSOR_MIN_MISMATCH" : "ACCESSOR_MAX_MISMATCH", `/accessors/${i}/${k}/${c}`,
                      `declares ${got}, data says ${want}`);
                    break;
                }
            }
        }
    });

    // ---- meshes, primitives, attributes, indices ---------------------------------------------------------
    const meshes = g.meshes || [];
    meshes.forEach((m, mi) => (m.primitives || []).forEach((prim, pi) => {
        const p = `/meshes/${mi}/primitives/${pi}`;
        const mode = prim.mode == null ? 4 : prim.mode;
        const M = MODE[mode];
        if (!M) E("MESH_PRIMITIVE_INVALID_MODE", p + "/mode", String(mode));
        if (prim.material != null && !(g.materials || [])[prim.material])
            E("UNRESOLVED_REFERENCE", p + "/material", String(prim.material));
        const attrs = prim.attributes || {};
        if (attrs.POSITION == null) E("MESH_PRIMITIVE_NO_POSITION", p, "a primitive MUST define POSITION");
        let vcount = null;
        for (const [name, ai] of Object.entries(attrs)) {
            const a = accessors[ai];
            if (!a) { E("UNRESOLVED_REFERENCE", `${p}/attributes/${name}`, String(ai)); continue; }
            if (vcount === null) vcount = a.count;
            else if (a.count !== vcount)
                E("MESH_PRIMITIVE_UNEQUAL_ACCESSOR_COUNT", `${p}/attributes/${name}`, `${a.count} against POSITION's ${vcount}`);
            if (name === "POSITION") {
                vcount = a.count;
                if (a.min == null || a.max == null)
                    E("MESH_PRIMITIVE_POSITION_ACCESSOR_WITHOUT_BOUNDS", `/accessors/${ai}`, "POSITION MUST define min and max");
                if (a.type !== "VEC3") E("MESH_PRIMITIVE_INVALID_ATTRIBUTE_TYPE", `/accessors/${ai}/type`, `POSITION is ${a.type}, must be VEC3`);
            }
            if (name === "NORMAL" && a.type !== "VEC3") E("MESH_PRIMITIVE_INVALID_ATTRIBUTE_TYPE", `/accessors/${ai}/type`, `NORMAL is ${a.type}, must be VEC3`);
            if (/^TEXCOORD_/.test(name) && a.type !== "VEC2") E("MESH_PRIMITIVE_INVALID_ATTRIBUTE_TYPE", `/accessors/${ai}/type`, `${name} is ${a.type}, must be VEC2`);
            if (/^COLOR_/.test(name) && a.type !== "VEC3" && a.type !== "VEC4")
                E("MESH_PRIMITIVE_INVALID_ATTRIBUTE_TYPE", `/accessors/${ai}/type`, `${name} is ${a.type}, must be VEC3 or VEC4`);
        }
        // NORMAL is a SHOULD, not a MUST: the spec says normals should be unit length, so this is a WARNING
        // and the tolerance is stated rather than implied.
        if (checkNormals && attrs.NORMAL != null && accessors[attrs.NORMAL]) {
            const d = readAccessor(g, bin, attrs.NORMAL);
            if (d) {
                let worst = 0, at = -1;
                for (let e = 0; e * 3 + 2 < d.length; e++) {
                    const L = Math.hypot(d[e * 3], d[e * 3 + 1], d[e * 3 + 2]);
                    if (Math.abs(L - 1) > worst) { worst = Math.abs(L - 1); at = e; }
                }
                if (worst > 1e-3) W("MESH_PRIMITIVE_NORMAL_NOT_UNIT_LENGTH", `${p}/attributes/NORMAL`,
                    `worst |len-1| = ${worst.toExponential(2)} at normal ${at}`);
            }
        }
        if (prim.indices != null) {
            const a = accessors[prim.indices];
            if (!a) E("UNRESOLVED_REFERENCE", p + "/indices", String(prim.indices));
            else {
                if (a.type !== "SCALAR") E("MESH_PRIMITIVE_INDICES_ACCESSOR_INVALID_FORMAT", `/accessors/${prim.indices}/type`, `${a.type}, must be SCALAR`);
                if (![5121, 5123, 5125].includes(a.componentType))
                    E("MESH_PRIMITIVE_INDICES_ACCESSOR_INVALID_FORMAT", `/accessors/${prim.indices}/componentType`,
                      `${COMPONENT[a.componentType]?.name || a.componentType}, must be UNSIGNED_BYTE/SHORT/INT`);
                if (M && a.count < M.min) E("MESH_PRIMITIVE_INCOMPATIBLE_MODE", p, `${a.count} indices for ${M.name}`);
                if (M && M.mul > 1 && a.count % M.mul !== 0)
                    E("MESH_PRIMITIVE_INCOMPATIBLE_MODE", p, `${a.count} indices is not a multiple of ${M.mul} for ${M.name}`);
                const v = views[a.bufferView];
                if (v && v.target != null && v.target !== 34963)
                    W("BUFFER_VIEW_TARGET_MISMATCH", `/bufferViews/${a.bufferView}/target`, `${v.target} on a view used for indices (expected 34963)`);
                // *** EVERY INDEX RANGE-TESTED AGAINST THE REAL VERTEX COUNT. *** An out-of-range index is
                // undefined behaviour: some viewers clamp, some draw garbage, some throw.
                const idx = readAccessor(g, bin, prim.indices);
                if (idx && vcount != null) {
                    let bad = -1, worstV = 0;
                    for (let k = 0; k < idx.length; k++) if (idx[k] >= vcount) { if (bad < 0) bad = k; worstV = Math.max(worstV, idx[k]); }
                    if (bad >= 0) E("ACCESSOR_INDEX_OOB", `/accessors/${prim.indices}`,
                        `index ${bad} is ${idx[bad]} and the largest is ${worstV}, against ${vcount} vertices`);
                }
            }
        } else if (vcount != null && M && M.mul > 1 && vcount % M.mul !== 0) {
            E("MESH_PRIMITIVE_INCOMPATIBLE_MODE", p, `${vcount} unindexed vertices is not a multiple of ${M.mul} for ${M.name}`);
        }
    }));

    // ---- scene graph references --------------------------------------------------------------------------
    const nodes = g.nodes || [];
    if (g.scene != null && !(g.scenes || [])[g.scene]) E("UNRESOLVED_REFERENCE", "/scene", String(g.scene));
    (g.scenes || []).forEach((s, i) => (s.nodes || []).forEach((ni, k) => {
        if (!nodes[ni]) E("UNRESOLVED_REFERENCE", `/scenes/${i}/nodes/${k}`, String(ni));
    }));
    nodes.forEach((nd, i) => {
        if (nd.mesh != null && !meshes[nd.mesh]) E("UNRESOLVED_REFERENCE", `/nodes/${i}/mesh`, String(nd.mesh));
        (nd.children || []).forEach((c, k) => { if (!nodes[c]) E("UNRESOLVED_REFERENCE", `/nodes/${i}/children/${k}`, String(c)); });
        if (nd.matrix && nd.matrix.length !== 16) E("NODE_MATRIX_LENGTH", `/nodes/${i}/matrix`, String(nd.matrix.length));
        if (nd.matrix && (nd.translation || nd.rotation || nd.scale))
            E("NODE_MATRIX_TRS", `/nodes/${i}`, "matrix and TRS are mutually exclusive");
        if (nd.rotation && Array.isArray(nd.rotation) && nd.rotation.length === 4) {
            const L = Math.hypot(...nd.rotation);
            if (Math.abs(L - 1) > 1e-3) W("NODE_ROTATION_NON_UNIT", `/nodes/${i}/rotation`, `|q| = ${L.toFixed(6)}`);
        }
    });


    // ---- extensions: the half a base-spec validator gets exactly backwards ---------------------------------
    // *** MEASURED BEFORE THIS BLOCK WAS WRITTEN, AND THE MEASUREMENT IS WHY IT CONSULTS THE EXTENSION LISTS
    // RATHER THAN THE BASE SPEC ALONE. *** A naive reading of the spec says image/mimeType MUST be image/jpeg
    // or image/png: run that over this tree and it reports 33 findings, every one of them a LEGAL image in a
    // file whose extensionsRequired names the extension that widens the rule. The same instrument that calls
    // a legal file broken will call a broken file legal the moment an extension it does not know about is
    // present, and those are the same error wearing two faces.
    const extUsed = new Set(g.extensionsUsed || []), extRequired = g.extensionsRequired || [];
    for (const e of extRequired) {
        if (!extUsed.has(e)) E("EXTENSION_REQUIRED_NOT_USED", "/extensionsRequired", `${e} is required but absent from extensionsUsed`);
    }
    // Every `extensions` object anywhere in the document MUST have its keys declared in extensionsUsed. This
    // is walked rather than checked at the places we happen to look, because an undeclared extension in a
    // corner nothing reads is exactly the one a reader will fail to apply.
    const seenExt = new Set();
    (function walkExt(o) {
        if (!o || typeof o !== "object") return;
        if (Array.isArray(o)) { for (const v of o) walkExt(v); return; }
        for (const [k, v] of Object.entries(o)) {
            if (k === "extensions" && v && typeof v === "object" && !Array.isArray(v)) for (const name of Object.keys(v)) seenExt.add(name);
            walkExt(v);
        }
    })({ ...g, extensionsUsed: undefined, extensionsRequired: undefined });
    for (const e of seenExt) if (!extUsed.has(e)) E("UNDECLARED_EXTENSION", "/extensionsUsed", `${e} is used in the document but not declared`);

    // ---- accessors with no data source, which the Draco fixture is entirely made of ------------------------
    // *** THE BASE SPEC SAYS AN ACCESSOR WITH NEITHER bufferView NOR sparse IS ALL ZEROS. *** gpu/fixtures/
    // ABeautifulGame-draco.header.glb has 32 such accessors out of 32, EIGHT of them declaring a non-zero
    // bounding box -- which contradicts "all zeros" and is nonetheless correct, because the geometry lives in
    // a KHR_draco_mesh_compression bufferView on the primitive. So the rule cannot be "no source is an error";
    // it has to ask WHICH accessors the compression extension feeds, and complain only about the rest.
    const dracoFed = new Set();
    for (const m of g.meshes || []) for (const prim of m.primitives || []) {
        const d = prim.extensions?.KHR_draco_mesh_compression;
        if (!d) continue;
        if (prim.indices != null) dracoFed.add(prim.indices);
        for (const ai of Object.values(prim.attributes || {})) dracoFed.add(ai);
    }
    accessors.forEach((a, i) => {
        if (a.bufferView != null || a.sparse) return;
        if (dracoFed.has(i)) return;
        const declared = [...(Array.isArray(a.min) ? a.min : []), ...(Array.isArray(a.max) ? a.max : [])];
        if (declared.some((x) => x !== 0))
            E("ACCESSOR_NO_DATA_SOURCE", `/accessors/${i}`,
              `no bufferView, no sparse and no compressed primitive feeds it, so every element is zero -- ` +
              `yet min/max declare a non-zero range (${JSON.stringify(a.min)} .. ${JSON.stringify(a.max)})`);
    });

    // ---- sparse accessors ---------------------------------------------------------------------------------
    // A NULL RESULT ON THIS TREE and recorded as one: zero of the 31 GLBs on disk carries a sparse accessor,
    // which is precisely why the rules are written from the spec and proved against a built fixture rather
    // than against the corpus. Sparse is the opening item of the import-side round for the same reason.
    accessors.forEach((a, i) => {
        const sp = a.sparse;
        if (!sp) return;
        const p = `/accessors/${i}/sparse`;
        if (!(sp.count >= 1)) E("ACCESSOR_SPARSE_COUNT", p + "/count", String(sp.count));
        else if (sp.count > a.count) E("ACCESSOR_SPARSE_COUNT_OUT_OF_RANGE", p + "/count", `${sp.count} > accessor count ${a.count}`);
        for (const [key, node] of [["indices", sp.indices], ["values", sp.values]]) {
            if (!node) { E("UNDEFINED_PROPERTY", `${p}/${key}`, "required"); continue; }
            const v = views[node.bufferView];
            if (!v) { E("UNRESOLVED_REFERENCE", `${p}/${key}/bufferView`, String(node.bufferView)); continue; }
            if (v.byteStride != null) E("BUFFER_VIEW_INVALID_BYTE_STRIDE", `/bufferViews/${node.bufferView}/byteStride`, `defined on a sparse ${key} view`);
        }
        if (sp.indices && ![5121, 5123, 5125].includes(sp.indices.componentType))
            E("ACCESSOR_SPARSE_INDICES_TYPE", p + "/indices/componentType",
              `${COMPONENT[sp.indices.componentType]?.name || sp.indices.componentType}, must be UNSIGNED_BYTE/SHORT/INT`);
        // The indices MUST be strictly increasing and inside the accessor. Read from the BIN, not the JSON.
        if (sp.indices && views[sp.indices.bufferView] && bin && sp.count >= 1) {
            const idx = readSparseIndices(views[sp.indices.bufferView], bin, sp);
            if (idx) {
                let prev = -1;
                for (let k = 0; k < idx.length; k++) {
                    if (idx[k] >= a.count) { E("ACCESSOR_SPARSE_INDEX_OOB", p + "/indices", `entry ${k} is ${idx[k]}, accessor holds ${a.count}`); break; }
                    if (idx[k] <= prev) { E("ACCESSOR_SPARSE_INDICES_NON_INCREASING", p + "/indices", `entry ${k} is ${idx[k]} after ${prev}`); break; }
                    prev = idx[k];
                }
            }
        }
    });

    // ---- skins --------------------------------------------------------------------------------------------
    const skins = g.skins || [];
    skins.forEach((sk, i) => {
        const p = `/skins/${i}`;
        const joints = sk.joints || [];
        if (joints.length < 1) E("UNDEFINED_PROPERTY", p + "/joints", "a skin MUST define at least one joint");
        joints.forEach((n, k) => { if (!nodes[n]) E("UNRESOLVED_REFERENCE", `${p}/joints/${k}`, String(n)); });
        if (sk.skeleton != null && !nodes[sk.skeleton]) E("UNRESOLVED_REFERENCE", p + "/skeleton", String(sk.skeleton));
        if (sk.inverseBindMatrices != null) {
            const a = accessors[sk.inverseBindMatrices];
            if (!a) E("UNRESOLVED_REFERENCE", p + "/inverseBindMatrices", String(sk.inverseBindMatrices));
            else {
                if (a.type !== "MAT4") E("SKIN_IBM_INVALID_FORMAT", `/accessors/${sk.inverseBindMatrices}/type`, `${a.type}, must be MAT4`);
                if (a.componentType !== 5126) E("SKIN_IBM_INVALID_FORMAT", `/accessors/${sk.inverseBindMatrices}/componentType`,
                    `${COMPONENT[a.componentType]?.name || a.componentType}, must be FLOAT`);
                if (a.count !== joints.length) E("SKIN_IBM_ACCESSOR_COUNT", `/accessors/${sk.inverseBindMatrices}/count`,
                    `${a.count} matrices for ${joints.length} joints`);
            }
        }
    });
    // A node carrying a skin MUST also carry a mesh, and that mesh's primitives MUST be skinned -- a skin
    // pointing at unskinned geometry is a file that renders in its bind pose and looks merely stiff.
    (g.nodes || []).forEach((nd, i) => {
        if (nd.skin == null) return;
        if (!skins[nd.skin]) E("UNRESOLVED_REFERENCE", `/nodes/${i}/skin`, String(nd.skin));
        if (nd.mesh == null) { E("NODE_SKIN_WITHOUT_MESH", `/nodes/${i}`, "a node with a skin MUST have a mesh"); return; }
        const m = meshes[nd.mesh];
        (m?.primitives || []).forEach((prim, pi) => {
            const at = prim.attributes || {};
            if (at.JOINTS_0 == null || at.WEIGHTS_0 == null)
                E("MESH_PRIMITIVE_JOINTS_WEIGHTS_MISMATCH", `/meshes/${nd.mesh}/primitives/${pi}`,
                  `used by skinned node ${i} but declares ${at.JOINTS_0 == null ? "no JOINTS_0" : "no WEIGHTS_0"}`);
        });
    });

    // ---- animations ---------------------------------------------------------------------------------------
    const PATH_TYPE = { translation: "VEC3", rotation: "VEC4", scale: "VEC3", weights: "SCALAR" };
    const INTERP_MUL = { LINEAR: 1, STEP: 1, CUBICSPLINE: 3 };
    (g.animations || []).forEach((an, ai) => {
        const p = `/animations/${ai}`;
        const samplers = an.samplers || [], channels = an.channels || [];
        if (!samplers.length) E("UNDEFINED_PROPERTY", p + "/samplers", "an animation MUST define at least one sampler");
        if (!channels.length) E("UNDEFINED_PROPERTY", p + "/channels", "an animation MUST define at least one channel");
        samplers.forEach((s, si) => {
            const sp = `${p}/samplers/${si}`;
            const interp = s.interpolation == null ? "LINEAR" : s.interpolation;
            if (INTERP_MUL[interp] == null) E("ANIMATION_SAMPLER_INVALID_INTERPOLATION", sp + "/interpolation", String(s.interpolation));
            const inA = accessors[s.input], outA = accessors[s.output];
            if (!inA) { E("UNRESOLVED_REFERENCE", sp + "/input", String(s.input)); return; }
            if (!outA) { E("UNRESOLVED_REFERENCE", sp + "/output", String(s.output)); return; }
            if (inA.type !== "SCALAR" || inA.componentType !== 5126)
                E("ANIMATION_SAMPLER_INPUT_ACCESSOR_INVALID_FORMAT", `/accessors/${s.input}`,
                  `${inA.type}/${COMPONENT[inA.componentType]?.name || inA.componentType}, must be SCALAR/FLOAT`);
            // The spec makes min/max REQUIRED on an animation input -- a player needs the clip's duration
            // without reading the whole keyframe buffer. This is the one MUST in the block that a writer
            // producing otherwise-perfect keyframes gets wrong most easily.
            if (inA.min == null || inA.max == null)
                E("ANIMATION_SAMPLER_INPUT_ACCESSOR_WITHOUT_BOUNDS", `/accessors/${s.input}`, "an animation input accessor MUST define min and max");
            // *** THE EXACT COUNT CANNOT BE CHECKED HERE AND THE FIRST DRAFT OF THIS BLOCK CHECKED IT
            // ANYWAY. *** For translation/rotation/scale the answer is input.count * interpolation stride;
            // for `weights` it is that times the MORPH TARGET COUNT of the mesh the channel drives, which a
            // sampler does not know -- so the rule went red on 6 of RobotExpressive's samplers, all of them
            // correct at 3 targets per keyframe. Worse than the bug: the probe that measured this corpus
            // before the rules were written had EXEMPTED the weights path, so it reported zero findings and
            // the exemption became an assumption one file over. What survives at the sampler is the part
            // that holds for every path -- the output must be a whole number of keyframes -- and the exact
            // count is asserted at the CHANNEL below, where the path and the target mesh are known.
            const mul = INTERP_MUL[interp] || 1;
            const per = inA.count * mul;
            if (per > 0 && outA.count % per !== 0)
                E("ANIMATION_SAMPLER_OUTPUT_ACCESSOR_INVALID_COUNT", `/accessors/${s.output}/count`,
                  `${outA.count} outputs is not a whole multiple of ${inA.count} inputs x ${mul} (${interp})`);
            if (interp === "CUBICSPLINE" && inA.count < 2)
                E("ANIMATION_SAMPLER_INVALID_INTERPOLATION", sp + "/interpolation", `CUBICSPLINE needs at least 2 keyframes, has ${inA.count}`);
        });
        channels.forEach((c, ci) => {
            const cp = `${p}/channels/${ci}`;
            const s = samplers[c.sampler];
            if (!s) { E("UNRESOLVED_REFERENCE", cp + "/sampler", String(c.sampler)); return; }
            const t = c.target || {};
            if (t.node != null && !nodes[t.node]) E("UNRESOLVED_REFERENCE", cp + "/target/node", String(t.node));
            if (PATH_TYPE[t.path] == null) { E("ANIMATION_CHANNEL_TARGET_INVALID_PATH", cp + "/target/path", String(t.path)); return; }
            const outA = accessors[s.output];
            // `weights` outputs one scalar per morph target per keyframe, so its COUNT is checked at the
            // sampler and only its TYPE is checked here; the other three paths have a fixed element type.
            if (outA && t.path !== "weights" && outA.type !== PATH_TYPE[t.path])
                E("ANIMATION_CHANNEL_TARGET_INVALID_TYPE", `/accessors/${s.output}/type`,
                  `${outA.type} driving ${t.path}, must be ${PATH_TYPE[t.path]}`);
            if (outA && t.path === "weights" && outA.type !== "SCALAR")
                E("ANIMATION_CHANNEL_TARGET_INVALID_TYPE", `/accessors/${s.output}/type`, `${outA.type} driving weights, must be SCALAR`);
            // The exact output count, now that the path is known. `weights` writes one scalar per morph
            // target per keyframe, and the target count comes from the mesh on the node this channel drives.
            const inAcc = accessors[s.input];
            if (outA && inAcc) {
                const mul = INTERP_MUL[s.interpolation == null ? "LINEAR" : s.interpolation] || 1;
                let targets = 1;
                if (t.path === "weights") {
                    const nd = nodes[t.node];
                    const mesh = nd && nd.mesh != null ? meshes[nd.mesh] : null;
                    const tgt = mesh?.primitives?.[0]?.targets?.length ?? (mesh?.weights?.length ?? 0);
                    if (!tgt) { W("ANIMATION_CHANNEL_TARGET_NO_MORPH_TARGETS", cp + "/target", `path is weights but node ${t.node} has no morph targets`); targets = 0; }
                    else targets = tgt;
                }
                const want = inAcc.count * mul * targets;
                if (targets > 0 && outA.count !== want)
                    E("ANIMATION_CHANNEL_OUTPUT_COUNT", `/accessors/${s.output}/count`,
                      `${outA.count} outputs driving ${t.path}: ${inAcc.count} keyframes x ${mul} (${s.interpolation || "LINEAR"})` +
                      (t.path === "weights" ? ` x ${targets} morph target(s)` : "") + ` = ${want}`);
            }
            if (t.path === "rotation" && outA && outA.componentType === 5126 && outA.type === "VEC4") {
                const d = readAccessor(g, bin, s.output);
                if (d) {
                    let worst = 0, at = -1;
                    for (let e = 0; e * 4 + 3 < d.length; e++) {
                        const L = Math.hypot(d[e * 4], d[e * 4 + 1], d[e * 4 + 2], d[e * 4 + 3]);
                        if (Math.abs(L - 1) > worst) { worst = Math.abs(L - 1); at = e; }
                    }
                    if (worst > 1e-3) W("ANIMATION_ROTATION_NON_UNIT", `/accessors/${s.output}`, `worst |q|-1 = ${worst.toExponential(2)} at keyframe ${at}`);
                }
            }
        });
    });

    // ---- images, textures, samplers -----------------------------------------------------------------------
    // MIME types the base spec allows, plus the ones an extension widens it to. KHR_texture_basisu is the
    // reason this is a lookup and not a two-element list: 33 of this tree's images are image/ktx2.
    const EXT_MIME = { KHR_texture_basisu: "image/ktx2", EXT_texture_webp: "image/webp", EXT_texture_avif: "image/avif" };
    const okMime = new Set(["image/jpeg", "image/png"]);
    for (const [ext, mime] of Object.entries(EXT_MIME)) if (extUsed.has(ext)) okMime.add(mime);
    const externalResources = [];
    (g.images || []).forEach((im, i) => {
        const p = `/images/${i}`;
        const hasUri = im.uri != null, hasView = im.bufferView != null;
        if (hasUri && hasView) E("IMAGE_URI_AND_BUFFERVIEW", p, "an image MUST define exactly one of uri or bufferView");
        else if (!hasUri && !hasView) E("IMAGE_NO_SOURCE", p, "an image MUST define a uri or a bufferView");
        if (hasView) {
            if (im.mimeType == null) E("IMAGE_MIME_TYPE_MISSING", p + "/mimeType", "required when the image is stored in a bufferView");
            else if (!okMime.has(im.mimeType))
                E("IMAGE_MIME_TYPE_INVALID", p + "/mimeType",
                  `${im.mimeType}; allowed here: ${[...okMime].sort().join(", ")}` +
                  (Object.values(EXT_MIME).includes(im.mimeType) ? " -- the extension that permits it is not in extensionsUsed" : ""));
            const v = views[im.bufferView];
            if (!v) E("UNRESOLVED_REFERENCE", p + "/bufferView", String(im.bufferView));
            else if (v.byteStride != null) E("BUFFER_VIEW_INVALID_BYTE_STRIDE", `/bufferViews/${im.bufferView}/byteStride`, "defined on a view holding an image");
        }
        // *** A GLB THAT NEEDS A FILE BESIDE IT IS NOT SELF-CONTAINED, AND THAT IS AN INTAKE FACT RATHER THAN
        // A SPEC VIOLATION. *** The spec permits an external uri, so this is a WARNING -- but 28 of this
        // tree's kit GLBs reference one relative texture that no manifest names, so copying the .glb files
        // alone into an asset folder yields 28 models that load, render, and are silently untextured.
        if (hasUri && !/^data:/i.test(im.uri)) { externalResources.push(im.uri); W("IMAGE_EXTERNAL_URI", p + "/uri", `${im.uri} must be served beside the GLB`); }
    });
    const MAG_FILTER = new Set([9728, 9729]);
    const MIN_FILTER = new Set([9728, 9729, 9984, 9985, 9986, 9987]);
    const WRAP = new Set([33071, 33648, 10497]);
    (g.samplers || []).forEach((sm, i) => {
        const p = `/samplers/${i}`;
        if (sm.magFilter != null && !MAG_FILTER.has(sm.magFilter)) E("SAMPLER_INVALID_FILTER", p + "/magFilter", String(sm.magFilter));
        if (sm.minFilter != null && !MIN_FILTER.has(sm.minFilter)) E("SAMPLER_INVALID_FILTER", p + "/minFilter", String(sm.minFilter));
        for (const k of ["wrapS", "wrapT"]) if (sm[k] != null && !WRAP.has(sm[k])) E("SAMPLER_INVALID_WRAP", `${p}/${k}`, String(sm[k]));
    });
    (g.textures || []).forEach((t, i) => {
        const p = `/textures/${i}`;
        if (t.source != null && !(g.images || [])[t.source]) E("UNRESOLVED_REFERENCE", p + "/source", String(t.source));
        if (t.sampler != null && !(g.samplers || [])[t.sampler]) E("UNRESOLVED_REFERENCE", p + "/sampler", String(t.sampler));
        // A texture may take its image from an extension instead (KHR_texture_basisu does exactly this), so
        // "no source" is only worth saying when there is no extension either.
        if (t.source == null && !t.extensions) W("TEXTURE_NO_SOURCE", p, "neither source nor an extension supplies an image");
    });

    // ---- materials ----------------------------------------------------------------------------------------
    const inUnit = (arr, n) => Array.isArray(arr) && arr.length === n && arr.every((x) => Number.isFinite(x) && x >= 0 && x <= 1);
    (g.materials || []).forEach((m, i) => {
        const p = `/materials/${i}`;
        if (m.alphaMode != null && !["OPAQUE", "MASK", "BLEND"].includes(m.alphaMode))
            E("MATERIAL_INVALID_ALPHA_MODE", p + "/alphaMode", String(m.alphaMode));
        if (m.alphaCutoff != null && m.alphaMode !== "MASK")
            W("MATERIAL_ALPHA_CUTOFF_UNUSED", p + "/alphaCutoff", `alphaCutoff has no effect unless alphaMode is MASK (it is ${m.alphaMode || "OPAQUE"})`);
        if (m.emissiveFactor != null && !inUnit(m.emissiveFactor, 3)) E("MATERIAL_INVALID_FACTOR", p + "/emissiveFactor", JSON.stringify(m.emissiveFactor));
        const pbr = m.pbrMetallicRoughness || {};
        if (pbr.baseColorFactor != null && !inUnit(pbr.baseColorFactor, 4)) E("MATERIAL_INVALID_FACTOR", p + "/pbrMetallicRoughness/baseColorFactor", JSON.stringify(pbr.baseColorFactor));
        for (const k of ["metallicFactor", "roughnessFactor"])
            if (pbr[k] != null && !(pbr[k] >= 0 && pbr[k] <= 1)) E("MATERIAL_INVALID_FACTOR", `${p}/pbrMetallicRoughness/${k}`, String(pbr[k]));
        const refs = [["normalTexture", m.normalTexture], ["occlusionTexture", m.occlusionTexture], ["emissiveTexture", m.emissiveTexture],
                      ["pbrMetallicRoughness/baseColorTexture", pbr.baseColorTexture], ["pbrMetallicRoughness/metallicRoughnessTexture", pbr.metallicRoughnessTexture]];
        for (const [key, ref] of refs) {
            if (!ref) continue;
            if (!(g.textures || [])[ref.index]) E("UNRESOLVED_REFERENCE", `${p}/${key}/index`, String(ref.index));
            if (ref.texCoord != null && !(Number.isInteger(ref.texCoord) && ref.texCoord >= 0))
                E("TEXTURE_INFO_INVALID_TEXCOORD", `${p}/${key}/texCoord`, String(ref.texCoord));
        }
    });

    // *** THE SCOPE IS A PROPERTY OF THE RESULT, NOT A PARAGRAPH IN A GATE. *** Until this round the honest
    // statement of what this module does not look at lived in ONE section of ONE selfcheck, and every other
    // caller -- both writers' gates, the CLI, and any browser that ever calls validate() -- got "0 errors"
    // with no way to learn that a file's 32 accessors had been skipped entire. A caveat that does not travel
    // with the verdict is not a caveat. Every field below is COUNTED from this file: nothing here is a list
    // somebody has to remember to update, which is the failure mode the whole record-provenance line of work
    // in this tree exists to close.
    const scope = {
        // Accessors whose BYTES were actually read and compared, against the number the file declares. The
        // Draco fixture reads 0 of 32: legal, because the geometry is in a compressed bufferView -- and a
        // "clean" verdict on it means the container and the JSON are consistent, not that the mesh is.
        accessorsRead, accessorsTotal: accessors.length,
        // *** TWO DIFFERENT REASONS PRODUCE accessorsRead: 0 AND CONFLATING THEM WOULD HIDE THE INTERESTING
        // ONE. *** A header-only fixture reads nothing because its BIN was stripped, which is this tree's own
        // discipline and reverses the moment the release zip is unpacked. An accessor with NO bufferView
        // reads nothing on any copy of the file, however complete -- the Draco fixture is 32 of 32 like that.
        accessorsWithoutView: accessors.filter((a) => a.bufferView == null).length,
        // Top-level glTF properties this file uses that no rule above inspects at all.
        unruled: Object.keys(g).filter((k) => !INSPECTED_PROPERTIES.has(k)).sort(),
        // Extensions the file declares that this module does not interpret. It CONSULTS the two below to
        // widen a base-spec rule; it does not implement any of them, so an error hiding inside an extension's
        // own payload is outside what a clean verdict here can mean.
        extensionsUninterpreted: [...extUsed].filter((e) => !CONSULTED_EXTENSIONS.has(e)).sort(),
        // Files this GLB needs served beside it. Empty means self-contained.
        externalResources,
    };

    const stats = {
        readable: true, truncated: !!split.truncated, headerOnly,
        buffers: buffers.length, bufferViews: views.length, accessors: accessors.length,
        meshes: meshes.length, nodes: nodes.length,
        skins: skins.length, animations: (g.animations || []).length,
        images: (g.images || []).length, textures: (g.textures || []).length,
        samplers: (g.samplers || []).length, materials: (g.materials || []).length,
        primitives: meshes.reduce((n, m) => n + (m.primitives || []).length, 0),
        generator: g.asset?.generator || null,
        extensionsUsed: g.extensionsUsed || [],
        extensionsRequired: extRequired,
        scope,
    };
    return { issues, stats };
}

export const errorsOf = (r) => r.issues.filter((x) => x.severity === ERROR);
export const warningsOf = (r) => r.issues.filter((x) => x.severity === WARNING);

/**
 * *** CALLABLE WITH NO ARGUMENT, WHICH IS A REQUIREMENT AND NOT A CONVENIENCE. *** tools/ship/registryOrphans.mjs
 * draws a line v3933 found the hard way: "a reportLines THAT REQUIRES A RESULT IS A FORMATTER, NOT A READABLE
 * MODULE" -- officeManager and composePropose both export reportLines(r), and called with nothing they throw,
 * which is a bench page rendering an error where a reader expected a measurement. The first draft of this
 * function took a required `result` and was exactly that.
 *
 * *** IT IS ASYNC SO THE NODE IMPORTS CAN BE DYNAMIC, WHICH KEEPS THIS MODULE BROWSER-SAFE. *** The whole
 * point of having no static node imports is that ui/cityPack.js could call validate() in a page; a top-level
 * `import fs from "node:fs"` to serve a bench report would have taken that away for a convenience. In a
 * browser the import simply fails and the report says what it could not do rather than throwing.
 */
/**
 * The one-or-two lines that say what a verdict did NOT cover, formatted from stats.scope. Pure, so the CLI,
 * the selfchecks and a browser all print the same sentence rather than three drifting paraphrases of it.
 */
export function scopeLines(result) {
    const sc = result?.stats?.scope;
    if (!sc) return [];
    const out = [];
    const read = `${sc.accessorsRead} of ${sc.accessorsTotal} accessor(s) had their bytes read`;
    const why = [];
    if (result.stats.headerOnly) why.push("no BIN chunk in this file");
    if (sc.accessorsWithoutView) why.push(`${sc.accessorsWithoutView} accessor(s) declare no bufferView at all`);
    out.push(`  scope: ${read}${why.length ? " -- " + why.join("; ") : ""}`);
    if (sc.unruled.length) out.push(`  scope: no rule here inspects ${sc.unruled.join(", ")}`);
    if (sc.extensionsUninterpreted.length) out.push(`  scope: extension(s) declared and NOT interpreted: ${sc.extensionsUninterpreted.join(", ")}`);
    if (sc.externalResources.length) out.push(`  scope: needs served beside it: ${sc.externalResources.join(", ")}`);
    return out;
}

export async function reportLines(result = null) {
    if (result) {
        const e = errorsOf(result), w = warningsOf(result);
        const out = [`[glbConformance] ${e.length} error(s), ${w.length} warning(s)`];
        for (const x of [...e, ...w].slice(0, 20)) out.push(`  ${x.severity.padEnd(7)} ${x.code}  ${x.path}  ${x.detail}`);
        // *** THE SCOPE GOES OUT WITH THE VERDICT, WHICH IS THE WHOLE POINT OF PUTTING IT IN THE RESULT. ***
        // "0 errors" beside "0 of 32 accessors read" is a different sentence from "0 errors" alone, and until
        // this round only one gate's prose said so while every other caller got the shorter one.
        for (const l of scopeLines(result)) out.push(l);
        return out;
    }
    const out = ["[glbConformance] glTF 2.0 spec-semantics over every GLB in the tree",
                 "  what a container check cannot see: accessor bounds, min/max RECOMPUTED from the buffer,",
                 "  every index range-tested against the real vertex count, attribute types, references, NaN"];
    let fs, path, fileURLToPath;
    try {
        fs = (await import("node:fs")).default;
        path = (await import("node:path")).default;
        // *** fileURLToPath, NOT new URL(...).pathname -- tools/ship/winPathGuard-selfcheck.mjs caught the
        // second form here and was right to. *** On Windows a file URL's pathname is "/C:/x/y", with a
        // leading slash and a drive letter, so path.resolve builds something that does not exist. It is
        // imported DYNAMICALLY, like the two above, because this module's zero static node imports are what
        // let ui/cityPack.js call validate() in a browser -- a portability fix that cost that would be a
        // trade, and this one does not.
        ({ fileURLToPath } = await import("node:url"));
    }
    catch { out.push("  (no filesystem here -- in a browser, pass a validate() result instead)"); return out; }
    try {
        const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
        const files = [];
        (function walk(d) {
            for (const e of fs.readdirSync(d, { withFileTypes: true })) {
                if (e.name === "node_modules" || e.name.startsWith(".")) continue;
                const q = path.join(d, e.name);
                if (e.isDirectory()) walk(q); else if (e.name.endsWith(".glb")) files.push(q);
            }
        })(root);
        let bad = 0, warn = 0, hdr = 0, partial = 0, unread = 0, totalAcc = 0, external = 0, uninterp = 0;
        for (const f of files) {
            const r = validate(fs.readFileSync(f));
            if (errorsOf(r).length) { bad++; out.push(`  ERROR ${path.relative(root, f)}: ${errorsOf(r).map((x) => x.code).join(", ")}`); }
            else if (warningsOf(r).length) warn++;
            if (r.stats.headerOnly) hdr++;
            const sc = r.stats.scope;
            if (sc) {
                totalAcc += sc.accessorsTotal;
                unread += sc.accessorsTotal - sc.accessorsRead;
                if (sc.accessorsRead < sc.accessorsTotal) partial++;
                if (sc.externalResources.length) external++;
                if (sc.extensionsUninterpreted.length) uninterp++;
            }
        }
        out.push(`  ${files.length} file(s): ${files.length - bad - warn} clean, ${warn} with warning(s), ` +
                 `${bad} with error(s), ${hdr} header-only fixture(s)`);
        out.push(`  scope across the tree: ${partial} file(s) graded on FEWER accessors than they declare ` +
                 `(${unread} unread of ${totalAcc}), ${external} needing a file served beside them, ` +
                 `${uninterp} declaring an extension no rule here interprets`);
    } catch (e) { out.push("  (could not walk the tree: " + String(e.message).slice(0, 80) + ")"); }
    return out;
}

// ---- CLI: node tools/export/glbConformance.mjs <file-or-dir> ... --------------------------------------------
// On-demand use, because the round that built this could wire it into three gates and not into every future
// place somebody drops a GLB. Exit code is the number of files carrying an ERROR, capped at 125.
if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const targets = process.argv.slice(2);
    if (!targets.length) { for (const l of await reportLines()) console.log(l); console.log("  usage: node tools/export/glbConformance.mjs <file.glb | directory> ..."); process.exit(0); }
    const files = [];
    const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        if (e.name === "node_modules" || e.name.startsWith(".")) continue;
        const p = path.join(d, e.name);
        if (e.isDirectory()) walk(p); else if (e.name.endsWith(".glb")) files.push(p);
    } };
    for (const t of targets) { const st = fs.statSync(t); st.isDirectory() ? walk(t) : files.push(t); }
    let bad = 0;
    for (const f of files.sort()) {
        const r = validate(fs.readFileSync(f));
        const e = errorsOf(r), w = warningsOf(r);
        if (e.length) bad++;
        const tag = e.length ? "ERROR  " : w.length ? "WARN   " : r.stats.headerOnly ? "header " : "ok     ";
        console.log(`${tag}${f}${e.length || w.length ? "  " + [...e, ...w].length + " issue(s)" : ""}`);
        for (const x of [...e, ...w].slice(0, 6)) console.log(`         ${x.severity} ${x.code} ${x.path} -- ${x.detail}`);
        // An `ok` line with nothing under it is the claim this round exists to stop overstating, so the CLI
        // prints the scope whenever the verdict rests on fewer bytes than the file contains.
        const sc = r.stats.scope;
        if (sc && (sc.accessorsRead < sc.accessorsTotal || sc.unruled.length || sc.extensionsUninterpreted.length))
            for (const l of scopeLines(r)) console.log("       " + l.trim());
    }
    console.log(`\n${files.length} file(s), ${bad} with errors`);
    process.exit(Math.min(bad, 125));
}
