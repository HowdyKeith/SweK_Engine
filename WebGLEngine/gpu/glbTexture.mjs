// FILE: gpu/glbTexture.mjs
// VERSION: v1 -- v4473
//
// *** THE TEXTURE HALF OF THE QUESTION gpu/glbPeek.mjs ANSWERS FOR GEOMETRY. ***
//
// glbPeek reads a GLB header and says whether KHR_draco_mesh_compression is needed, so gpu/gltfDraco.js can
// attach a 256 KB decoder ONLY to the files that need one. The texture extension has had no such module:
// glbPeek knows exactly one extension by name, DRACO_EXT, and nothing in this tree has ever named
// KHR_texture_basisu.
//
// *** THE VENDORED LOADER ALREADY SPEAKS THE EXTENSION. WHAT IS MISSING IS THE TRANSCODER. *** three r160's
// GLTFLoader carries GLTFTextureBasisUExtension, setKTX2Loader and the spec link. No KTX2Loader is vendored,
// nothing in this tree calls setKTX2Loader, and so every KHR_texture_basisu asset lands in one of three
// outcomes -- none of which is "it works", and only one of which says why.
//
// ---- THE THREE OUTCOMES, READ OUT OF THE VENDORED SOURCE RATHER THAN ASSUMED -------------------------------
//
//   1. REQUIRED, no transcoder. GLTFTextureBasisUExtension.loadTexture throws
//      "setKTX2Loader must be called before loading KTX2 textures". LOUD AND CORRECT: the message names the
//      missing thing.
//
//   2. OPTIONAL, with a fallback `source`. The extension returns null; GLTFParser._invokeOne treats a falsy
//      result as "not handled" (`if (result) return result;`) and keeps going, with the parser itself pushed
//      LAST, so GLTFParser.loadTexture loads the PNG/JPEG fallback. THIS ONE GENUINELY WORKS, and it works
//      because of the dispatcher's falsy-means-next rule rather than because anything checked.
//
//   3. OPTIONAL, with NO fallback `source`. *** THE LOADER'S OWN COMMENT IS AN UNCHECKED ASSUMPTION, AND THIS
//      IS WHAT HAPPENS WHEN IT IS FALSE. *** The comment reads "Assumes that the extension is optional and
//      that a fallback texture is present". Nothing verifies that. The extension returns null, the fall-through
//      reaches GLTFParser.loadTexture, and there:
//
//          const sourceIndex = textureDef.source;          // undefined
//          const sourceDef   = json.images[ sourceIndex ]; // undefined
//          if ( sourceDef.uri )                            // TypeError
//
//      The load dies with "Cannot read properties of undefined (reading 'uri')" -- AN ERROR THAT NAMES THE
//      WRONG THING. Nothing in it says Basis, KTX2, or transcoder; it reads like a corrupt file. The glTF spec
//      does not require `source` on a texture, so this asset is legal.
//
// *** WHAT THIS MODULE DOES NOT DO: TRANSCODE ANYTHING. *** It reads a header and predicts. Whether this tree
// should carry a Basis transcoder at all is a question with a measurement attached, and the measurement says
// not for these assets -- see BUDGET below.
"use strict";
import { peekGlb, extensionsOf } from "./glbPeek.mjs";

export const BASISU_EXT = "KHR_texture_basisu";

/** The outcomes, named once so a caller compares against a constant rather than a spelling. */
export const OUTCOME = Object.freeze({
    NONE:     "none",            // the file does not use the extension
    THROWS:   "throws",          // required, no transcoder: a clear error naming setKTX2Loader
    FALLBACK: "fallback",        // optional, and a `source` the base parser can load
    TYPEERROR: "typeerror",      // optional, no `source`: dies on sourceDef.uri, naming the wrong thing
});

/**
 * What this tree would do with a GLB's textures TODAY -- that is, with no KTX2Loader attached.
 *
 * Returns { ok, declared, required, textures: [...], outcome, why }. Never throws: like peekGlb, its whole
 * job is to answer questions about files that may be broken.
 */
export function textureVerdict(buf, { hasKtx2Loader = false } = {}) {
    const p = typeof buf === "object" && buf && buf.ok !== undefined ? buf : peekGlb(buf);
    if (!p.ok) return { ok: false, error: p.error, declared: false, required: false, textures: [], outcome: OUTCOME.NONE };
    const j = p.json || {};
    const used = j.extensionsUsed || [], req = j.extensionsRequired || [];
    const declared = used.includes(BASISU_EXT) || req.includes(BASISU_EXT);
    const required = req.includes(BASISU_EXT);

    const textures = (j.textures || []).map((t, i) => {
        const ext = t && t.extensions && t.extensions[BASISU_EXT];
        return {
            index: i,
            usesBasisu: !!ext,
            // The glTF spec makes `source` optional on a texture, so absent and 0 must not be confused: index
            // 0 is a perfectly good image and `!t.source` would call it missing.
            hasFallback: !!t && typeof t.source === "number",
            basisuSource: ext && typeof ext.source === "number" ? ext.source : null,
        };
    });
    const using = textures.filter((t) => t.usesBasisu);

    let outcome = OUTCOME.NONE, why = "no texture carries " + BASISU_EXT;
    if (hasKtx2Loader && declared) {
        outcome = OUTCOME.NONE;
        why = "a KTX2Loader is attached, so the extension handles its own textures";
    } else if (required) {
        outcome = OUTCOME.THROWS;
        why = BASISU_EXT + " is in extensionsRequired and no KTX2Loader is attached: GLTFTextureBasisUExtension " +
              "throws 'setKTX2Loader must be called before loading KTX2 textures', which names the missing thing";
    } else if (using.length) {
        const orphan = using.filter((t) => !t.hasFallback);
        if (orphan.length) {
            outcome = OUTCOME.TYPEERROR;
            why = orphan.length + " of " + using.length + " basisu texture(s) carry NO fallback `source`. The " +
                  "extension returns null, _invokeOne falls through to GLTFParser.loadTexture, and " +
                  "`json.images[undefined].uri` throws a TypeError naming 'uri' -- an error that says nothing " +
                  "about Basis. The loader's comment assumes a fallback is present and nothing checks it";
        } else {
            outcome = OUTCOME.FALLBACK;
            why = using.length + " basisu texture(s), every one with a fallback `source` the base parser loads. " +
                  "This works because _invokeOne treats a falsy result as 'not handled' and the parser runs last";
        }
    } else if (declared) {
        // glbPeek reports the same shape for Draco and says why: somebody's exporter wrote a declaration it
        // does not use. Reported rather than smoothed over.
        outcome = OUTCOME.NONE;
        why = BASISU_EXT + " is DECLARED and no texture uses it -- an exporter wrote a declaration it did not need";
    }
    return { ok: true, declared, required, textures, usingBasisu: using.length, extensions: extensionsOf(p), outcome, why };
}

/** Does this file need a transcoder attached before it will load? The gltfDraco question, for textures. */
export function needsKtx2(buf) {
    const v = textureVerdict(buf);
    return v.ok && v.outcome !== OUTCOME.NONE;
}

/**
 * *** THE MEASUREMENT THAT SAYS NOT YET, TAKEN BEFORE ANYTHING WAS BUILT. ***
 *
 * The case for Basis/KTX2 is usually made in download bytes, and for THIS tree that case is empty: 16 PNGs
 * and one JPEG, 0.37 MB encoded, which no compression scheme is going to improve enough to matter.
 *
 * The honest case is VRAM, because a PNG's size on disk is not what it costs on a GPU -- it is decoded to
 * RGBA8 and, with mips, costs 4/3 of that forever. Measured over every image in the tree:
 *
 *     on disk (encoded)      0.37 MB
 *     decoded RGBA8          3.19 MB      8.6x the disk figure
 *     with a full mip chain  4.25 MB
 *     ETC1S equivalent       0.53 MB      UASTC equivalent  1.06 MB
 *
 * *** AND THEN THE DISTRIBUTION KILLS EVEN THAT ARGUMENT. *** ONE FILE --
 * tools/RobotWoman_handsfeet_preview.png, 880x770 -- is 81% of the decoded total, and it is REFERENCED
 * NOWHERE IN THE TREE: a preview image sitting in tools/, never loaded as a GPU texture. Excluding it, every
 * texture this engine actually loads decodes to well under a megabyte, and an 8x saving on that is a rounding
 * error on any GPU this engine has ever run on.
 *
 * SO THE VERDICT IS NOT YET, AND IT IS A MEASUREMENT RATHER THAN A PREFERENCE. What would change it is
 * STREAMED assets -- gpu/khronosSamples.mjs's catalogue, city packs, avatars -- whose textures are not in this
 * repository and were NOT measured here. That is the number to take before this is reconsidered, and taking it
 * is a round of its own.
 */
export const BUDGET = Object.freeze({
    at: "v4473",
    files: 17, diskBytes: 388_000,
    decodedRgbaBytes: 3_344_000, withMipsBytes: 4_456_000,
    etc1sBytes: 557_000, uastcBytes: 1_114_000,
    dominatedBy: "tools/RobotWoman_handsfeet_preview.png",
    dominatedByShare: 0.81,
    dominatedByIsLoaded: false,
    verdict: "NOT YET, on the tree's own assets. The saving is real (8x on VRAM) and the base is too small for " +
             "it to matter: excluding one unreferenced preview PNG, everything this engine actually loads " +
             "decodes to under a megabyte.",
    notMeasured: "streamed glTF assets -- khronosSamples, city packs, avatars -- which are where texture " +
                 "weight actually lives and are not in this repository",
});
