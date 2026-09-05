// FILE: gpu/gltfKtx2.js
// VERSION: v4475 -- a GLTFLoader that fetches a 560 KB Basis transcoder ONLY for files that contain KTX2.
//
// *** NOTHING HERE TRANSCODES ANYTHING, AND THAT IS THE SAME SENTENCE gpu/gltfDraco.js OPENS WITH. ***
// three r160's GLTFLoader has implemented KHR_texture_basisu the whole time -- GLTFTextureBasisUExtension,
// setKTX2Loader, the spec link. What it never had was an INSTANCE to hand it, so every KTX2 asset died on
// "setKTX2Loader must be called before loading KTX2 textures". This module is that instance, and it is the
// texture twin of the module that did the same for geometry two hundred versions ago.
//
// *** THE LAZINESS IS THE DESIGN, NOT AN OPTIMISATION -- gltfDraco's words, and the cost here is worse. ***
// The Draco decoder is 256 KB. The Basis transcoder is 562 KB across a wasm and its wrapper, plus ktx-parse
// and zstddec. setKTX2Loader wants the instance UP FRONT, so the obvious wiring taxes every page that opens
// any model. What can defer it: ASK THE FILE FIRST. gpu/glbTexture.mjs answers "does this need a transcoder"
// from a GLB header before a pixel is touched, exactly as glbPeek does for Draco.
//
// *** AND THE ANSWER IS WORTH THE BYTES, WHICH v4474 MEASURED RATHER THAN ASSUMED. *** Three Khronos sample
// models cost 71.7 to 91.6 MB of VRAM as PNG and 8.5 to 22.5 MB transcoded -- a saving of exactly 32/bpp,
// 8x to a 4 bpp target and 4x to an 8 bpp one. One of those models is twenty times this whole repository's
// own texture budget. The transcoder is fetched once per page and shared thereafter.
//
// *** WHAT detectSupport IS FOR, AND WHY IT TAKES A RENDERER. *** A KTX2 file is not a GPU format; it is a
// container the client transcodes INTO one. Which one depends on what the device supports -- BC7 on desktop,
// ASTC or ETC2 on mobile -- so KTX2Loader has to be shown a renderer before it can choose. That is why this
// module will not build a loader without one, rather than defaulting to something and being wrong quietly.
//
// The vendored KTX2Loader.detectSupport already branches on `renderer.isWebGPURenderer` and asks
// `renderer.hasFeature('texture-compression-astc' | '-etc2' | '-bc')` there, falling back to the WebGL2
// extension list otherwise. So BOTH BACKENDS OF THIS ENGINE ARE ALREADY SERVED by the upstream file, and
// nothing here needs to know which one it is holding.
import { needsKtx2, textureVerdict, OUTCOME } from "./glbTexture.mjs";

export const TRANSCODER_PATH = "/vendor/three/jsm/libs/basis/";

let _ktx2Promise = null;
/** Fetched at most once per page, on the first KTX2 file, and shared by every later one. */
export function ktx2Loader(renderer) {
    if (!renderer) throw new Error("gltfKtx2: a renderer is required -- KTX2Loader.detectSupport(renderer) is " +
        "how the transcode target is chosen, and guessing it is how a texture arrives in a format the device cannot sample");
    if (!_ktx2Promise) {
        _ktx2Promise = import("/vendor/three/jsm/loaders/KTX2Loader.js")
            .then((m) => new m.KTX2Loader().setTranscoderPath(TRANSCODER_PATH).detectSupport(renderer))
            .catch((e) => { _ktx2Promise = null; throw new Error("Basis transcoder failed to load: " + (e && e.message)); });
    }
    return _ktx2Promise;
}

/** Drop the memoised loader. For a page that swaps renderers -- the transcode target would be stale. */
export function resetKtx2Loader() { _ktx2Promise = null; }

/**
 * Parse an already-fetched GLB with a loader configured for what the FILE actually contains.
 *
 * `GLTFLoaderCtor` is injected rather than imported, for gltfDraco's stated reasons: this module stays
 * testable, and a page that already has a loader instance is not made to build a second one.
 */
export async function parseGlb(buffer, GLTFLoaderCtor, { renderer = null, path = "", ktx2 = ktx2Loader } = {}) {
    const verdict = textureVerdict(buffer);
    if (!verdict.ok) throw new Error("not a readable GLB: " + verdict.error);
    const loader = new GLTFLoaderCtor();
    // `ktx2` is injectable for the same reason GLTFLoaderCtor is, and for one more: the real factory does a
    // dynamic import of a browser path, so a gate running under node could otherwise only inspect this
    // module's SOURCE and never its BEHAVIOUR. The decision -- attach when and only when the header says a
    // transcoder is needed -- is the whole of what this module contributes, and it is the part worth running.
    if (verdict.outcome !== OUTCOME.NONE) loader.setKTX2Loader(await ktx2(renderer));
    return await new Promise((resolve, reject) => {
        loader.parse(buffer, path, resolve, reject);
    }).then((gltf) => Object.assign(gltf, { swekKtx2: verdict }));
}

/** Fetch and parse in one call. Returns the three.js gltf, with `swekKtx2` carrying what the peek found. */
export async function loadGlb(url, GLTFLoaderCtor, { renderer = null, ktx2 = ktx2Loader } = {}) {
    const res = await fetch(url);
    if (!res.ok) throw new Error("GLB fetch failed: " + res.status + " " + url);
    return parseGlb(await res.arrayBuffer(), GLTFLoaderCtor, { renderer, ktx2, path: url.replace(/[^/]*$/, "") });
}

/**
 * What a file needs, for a page that wants to say so before loading it. Pure -- no fetch, no transcoder.
 *
 * *** THE THIRD OUTCOME IS REPORTED SEPARATELY BECAUSE IT IS THE ONE THAT LIES. *** A required-but-untranscoded
 * file throws a message naming setKTX2Loader; an optional one with no fallback `source` dies instead on
 * `json.images[undefined].uri`, naming neither Basis nor KTX2. Attaching a transcoder fixes both, and a page
 * that cannot attach one should at least be able to say which it is looking at.
 */
export function describeGlb(buffer) {
    const v = textureVerdict(buffer);
    if (!v.ok) return { ok: false, error: v.error };
    return {
        ok: true, extensions: v.extensions, needsKtx2: needsKtx2(buffer), outcome: v.outcome,
        basisuTextures: v.usingBasisu, required: v.required,
        note: v.outcome === OUTCOME.NONE ? "no transcoder needed"
            : v.outcome === OUTCOME.THROWS ? "transcoder will be fetched; without one this throws, naming setKTX2Loader"
            : v.outcome === OUTCOME.FALLBACK ? "transcoder will be fetched; without one the fallback PNG/JPEG loads instead"
            : "transcoder will be fetched; WITHOUT ONE THIS DIES ON json.images[undefined].uri, an error naming neither Basis nor KTX2",
    };
}
