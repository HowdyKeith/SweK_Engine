// FILE: gpu/gltfDraco.js
// VERSION: v4163 -- a GLTFLoader that fetches a 256 KB Draco decoder ONLY for files that contain Draco.
//
// *** NOTHING HERE DECODES ANYTHING. *** three r160's GLTFLoader, vendored in this tree since long before
// today, already implements KHR_draco_mesh_compression completely -- setDRACOLoader, the extension class, the
// attribute remap. What it never had was an instance to hand it, so every Draco GLB died on "No DRACOLoader
// instance provided". mrdoob/draco.js (MIT, vendored unmodified at vendor/draco/) is that instance.
//
// *** THE LAZINESS IS THE DESIGN, NOT AN OPTIMISATION. *** setDRACOLoader wants the instance UP FRONT, so the
// obvious wiring makes every page that opens any model pay 256 KB for a decoder it will almost never run --
// and this tree has eight pages on the GLTFLoader path. An import map cannot defer that and neither can a
// static import. What can: ASK THE FILE FIRST. A GLB declares its extensions in a JSON chunk in its opening
// bytes, so gpu/glbPeek.mjs answers "does this need Draco" from the header, before a vertex is touched.
// Uncompressed files never fetch the decoder; Draco files fetch it once and it is cached thereafter.
import { needsDraco, peekGlb, extensionsOf } from "./glbPeek.mjs";

let _dracoPromise = null;
/** Fetched at most once per page, on the first Draco file, and shared by every later one. */
export function dracoLoader() {
    if (!_dracoPromise) {
        _dracoPromise = import("/vendor/draco/DRACOLoader.js")
            .then((m) => new m.DRACOLoader())
            .catch((e) => { _dracoPromise = null; throw new Error("Draco decoder failed to load: " + (e && e.message)); });
    }
    return _dracoPromise;
}

/**
 * Parse an already-fetched GLB with a loader configured for what the FILE actually contains.
 *
 * `GLTFLoaderCtor` is injected rather than imported so this module stays testable and so a page that already
 * has a loader instance is not made to build a second one.
 */
export async function parseGlb(buffer, GLTFLoaderCtor, { path = "" } = {}) {
    const verdict = needsDraco(buffer);
    if (!verdict.ok) throw new Error("not a readable GLB: " + verdict.error);
    const loader = new GLTFLoaderCtor();
    if (verdict.needsDraco) loader.setDRACOLoader(await dracoLoader());
    return await new Promise((resolve, reject) => {
        loader.parse(buffer, path, resolve, reject);
    }).then((gltf) => Object.assign(gltf, { swekDraco: verdict }));
}

/** Fetch and parse in one call. Returns the three.js gltf, with `swekDraco` carrying what the peek found. */
export async function loadGlb(url, GLTFLoaderCtor) {
    const res = await fetch(url);
    if (!res.ok) throw new Error("GLB fetch failed: " + res.status + " " + url);
    return parseGlb(await res.arrayBuffer(), GLTFLoaderCtor, { path: url.replace(/[^/]*$/, "") });
}

/** What a file needs, for a page that wants to say so before loading it. Pure -- no fetch, no decoder. */
export function describeGlb(buffer) {
    const p = peekGlb(buffer);
    if (!p.ok) return { ok: false, error: p.error };
    const d = needsDraco(p);
    return {
        ok: true, extensions: extensionsOf(p), needsDraco: d.needsDraco,
        dracoPrimitives: d.dracoPrimitives, totalPrimitives: d.totalPrimitives,
        declaredButUnused: d.declaredButUnused,
        note: d.declaredButUnused
            ? "declares KHR_draco_mesh_compression but compresses no primitive -- the decoder would be fetched " +
              "for nothing, which is the exporter's bug and not this reader's"
            : d.needsDraco ? "Draco decoder will be fetched" : "no decoder needed",
    };
}
