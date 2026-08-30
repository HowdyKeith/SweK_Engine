// FILE: gpu/glbPeek.mjs
// VERSION: v4163 -- read a GLB's JSON chunk WITHOUT decoding it, so a 256 KB decoder is fetched only when a
// file actually needs one.
//
// *** THE VENDORED GLTFLoader ALREADY SPEAKS KHR_draco_mesh_compression IN FULL. *** three r160's loader has
// setDRACOLoader, GLTFDracoMeshCompressionExtension and the spec's whole attribute-remap dance. The only
// missing piece in this tree was an instance to hand it -- which is why a Draco GLB currently fails with
// "No DRACOLoader instance provided" on that path and "accessor 0 has no bufferView" on gpu/GLBParser.js's.
// Neither message contains the word Draco, and both are the last thing a person sees before giving up.
//
// *** THE DECODER IS 256 KB OF JAVASCRIPT AND MOST FILES DO NOT NEED IT. *** setDRACOLoader wants an instance
// UP FRONT, so the obvious wiring makes every page that ever opens a model pay for a decoder it will almost
// never run. An import map cannot make that lazy and neither can a static import. What CAN: look at the file
// first. A GLB names its extensions in `extensionsUsed` / `extensionsRequired` in a JSON chunk that sits in
// the first few kilobytes, so the question "does this need Draco" is answerable from a header read, before a
// single vertex is touched and before the decoder is fetched.
//
// The three container constants come from tools/export/voxelGlb.mjs -- the WRITER this tree already had -- so
// the reader and the writer cannot drift about what a "glTF" magic is.
import { MAGIC, JSON_CHUNK } from "../tools/export/voxelGlb.mjs";

export const DRACO_EXT = "KHR_draco_mesh_compression";

/** How far in we are willing to look for the JSON chunk. The chunk is always FIRST in a valid GLB (glTF 2.0
 *  4.4.1), so this is a sanity bound and not a search window: a file whose JSON header is not in the first
 *  megabyte is malformed, and reading further would be reading a mesh. */
export const MAX_JSON = 1 << 20;

/**
 * Parse just the header and JSON chunk of a GLB.
 *
 * Returns { ok, json, jsonLength, totalLength } or { ok:false, error }. NEVER throws on a bad buffer: this
 * runs before anything is known about the bytes, and its whole job is to answer questions about files that
 * may be broken.
 */
export function peekGlb(buf) {
    const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    if (u8.byteLength < 20) return { ok: false, error: "too short to be a GLB (" + u8.byteLength + " bytes)" };
    const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    if (dv.getUint32(0, true) !== MAGIC) return { ok: false, error: "not a GLB -- magic is not 'glTF'" };
    const version = dv.getUint32(4, true);
    const totalLength = dv.getUint32(8, true);
    const jsonLength = dv.getUint32(12, true);
    if (dv.getUint32(16, true) !== JSON_CHUNK) return { ok: false, error: "first chunk is not JSON" };
    if (jsonLength > MAX_JSON) return { ok: false, error: "JSON chunk implausibly large (" + jsonLength + " bytes)" };
    if (20 + jsonLength > u8.byteLength) return { ok: false, error: "JSON chunk runs past the end of the buffer" };
    let json;
    try { json = JSON.parse(new TextDecoder().decode(u8.subarray(20, 20 + jsonLength))); }
    catch (e) { return { ok: false, error: "JSON chunk does not parse: " + (e && e.message) }; }
    return { ok: true, json, version, jsonLength, totalLength };
}

/**
 * Does this GLB need a Draco decoder?
 *
 * *** extensionsREQUIRED AND extensionsUSED ARE DIFFERENT PROMISES AND BOTH ARE CHECKED. *** `required` means
 * a reader that cannot do it must refuse the file; `used` means it appears somewhere. A Draco file in practice
 * lists it in both, but a file listing it only in `used` still contains Draco-compressed primitives that this
 * engine would render as nothing -- so answering from `required` alone would send exactly the quiet-failure
 * case down the path with no decoder. The primitives are checked too, because the arrays are declarations and
 * the primitive is the fact.
 */
export function needsDraco(buf) {
    const p = typeof buf === "object" && buf && buf.ok !== undefined ? buf : peekGlb(buf);
    if (!p.ok) return { ...p, needsDraco: false };
    const j = p.json || {};
    const inUsed = Array.isArray(j.extensionsUsed) && j.extensionsUsed.includes(DRACO_EXT);
    const inRequired = Array.isArray(j.extensionsRequired) && j.extensionsRequired.includes(DRACO_EXT);
    let prims = 0, total = 0;
    for (const m of j.meshes || []) for (const pr of m.primitives || []) {
        total++;
        if (pr.extensions && pr.extensions[DRACO_EXT]) prims++;
    }
    return {
        ok: true, needsDraco: inUsed || inRequired || prims > 0,
        inUsed, inRequired, dracoPrimitives: prims, totalPrimitives: total,
        // A file that DECLARES the extension but compresses nothing is legal and wastes a 256 KB fetch, so it
        // is reported rather than smoothed over -- somebody's exporter is writing a declaration it does not use.
        declaredButUnused: (inUsed || inRequired) && total > 0 && prims === 0,
    };
}

/** Every extension a file names, for a diagnostic that can say what it could not do rather than only that it
 *  failed. `used` minus what a reader handles is the list worth printing. */
export function extensionsOf(buf) {
    const p = typeof buf === "object" && buf && buf.ok !== undefined ? buf : peekGlb(buf);
    if (!p.ok) return [];
    const j = p.json || {};
    return [...new Set([...(j.extensionsUsed || []), ...(j.extensionsRequired || [])])].sort();
}
