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
export function readAccessor(gltf, bin, i) {
    const a = gltf.accessors?.[i];
    if (!a || a.bufferView == null) return null;                    // a sparse-only or zero-filled accessor
    const bv = gltf.bufferViews?.[a.bufferView];
    const C = COMPONENT[a.componentType];
    const n = TYPE_COMPONENTS[a.type];
    if (!bv || !C || !n || !bin) return null;
    const base = (bv.byteOffset || 0) + (a.byteOffset || 0);
    const stride = bv.byteStride || (C.size * n);
    const out = new Array(a.count * n);
    const dv = new DataView(bin.buffer, bin.byteOffset, bin.byteLength);
    const get = { 5120: "getInt8", 5121: "getUint8", 5122: "getInt16", 5123: "getUint16", 5125: "getUint32", 5126: "getFloat32" }[a.componentType];
    for (let e = 0; e < a.count; e++) {
        const at = base + e * stride;
        if (at + C.size * n > bin.byteLength) return null;
        for (let c = 0; c < n; c++) out[e * n + c] = dv[get](at + c * C.size, true);
    }
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
        if (a.bufferView == null) return;
        const n = TYPE_COMPONENTS[a.type];
        if (!n || !COMPONENT[a.componentType]) return;
        const data = readAccessor(g, bin, i);
        if (!data) return;                                            // already reported as bounds/reference
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

    const stats = {
        readable: true, truncated: !!split.truncated, headerOnly,
        buffers: buffers.length, bufferViews: views.length, accessors: accessors.length,
        meshes: meshes.length, nodes: nodes.length,
        primitives: meshes.reduce((n, m) => n + (m.primitives || []).length, 0),
        generator: g.asset?.generator || null,
        extensionsUsed: g.extensionsUsed || [],
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
export async function reportLines(result = null) {
    if (result) {
        const e = errorsOf(result), w = warningsOf(result);
        const out = [`[glbConformance] ${e.length} error(s), ${w.length} warning(s)`];
        for (const x of [...e, ...w].slice(0, 20)) out.push(`  ${x.severity.padEnd(7)} ${x.code}  ${x.path}  ${x.detail}`);
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
        let bad = 0, warn = 0, hdr = 0;
        for (const f of files) {
            const r = validate(fs.readFileSync(f));
            if (errorsOf(r).length) { bad++; out.push(`  ERROR ${path.relative(root, f)}: ${errorsOf(r).map((x) => x.code).join(", ")}`); }
            else if (warningsOf(r).length) warn++;
            if (r.stats.headerOnly) hdr++;
        }
        out.push(`  ${files.length} file(s): ${files.length - bad - warn} clean, ${warn} with warning(s), ` +
                 `${bad} with error(s), ${hdr} header-only fixture(s)`);
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
    }
    console.log(`\n${files.length} file(s), ${bad} with errors`);
    process.exit(Math.min(bad, 125));
}
