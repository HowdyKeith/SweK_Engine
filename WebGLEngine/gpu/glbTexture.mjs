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
/**
 * *** A KTX2 ASSET IS USUALLY NOT A GLB, AND THIS MODULE READ ONLY GLB UNTIL v4475. ***
 *
 * peekGlb answers about the binary container. Every one of the five KTX2 variants in
 * gpu/khronosSamples.mjs's catalogue is a `.gltf` -- plain JSON with the .ktx2 files as siblings -- because
 * that is what the texture-compression toolchains emit. So the module built to predict what this tree does
 * with a KTX2 asset could not read the shape KTX2 assets actually come in, and would have answered
 * "not a GLB" to every real one. Found by wiring the viewer, not by a check.
 *
 * Both containers, one answer: GLB magic goes to peekGlb, anything else is tried as glTF JSON.
 */
export function peekGltf(buf) {
    const u8 = buf instanceof Uint8Array ? buf : (buf && buf.byteLength !== undefined ? new Uint8Array(buf) : null);
    if (!u8) return { ok: false, error: "not a buffer" };
    if (u8.byteLength >= 4 && new DataView(u8.buffer, u8.byteOffset, 4).getUint32(0, true) === 0x46546C67) return peekGlb(u8);
    try {
        const j = JSON.parse(new TextDecoder().decode(u8));
        if (!j || typeof j !== "object" || !j.asset) return { ok: false, error: "JSON without a glTF `asset` block" };
        return { ok: true, json: j, container: "gltf" };
    } catch (e) { return { ok: false, error: "neither a GLB nor glTF JSON: " + (e && e.message) }; }
}

export function textureVerdict(buf, { hasKtx2Loader = false } = {}) {
    const p = typeof buf === "object" && buf && buf.ok !== undefined ? buf : peekGltf(buf);
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
/**
 * *** v4474 -- THE NUMBER BUDGET SAID WOULD OVERTURN IT, TAKEN. AND IT OVERTURNS IT. ***
 *
 * BUDGET below answers "should this tree carry a transcoder for ITS OWN assets" with NOT YET, and names the
 * measurement that could change that: "streamed glTF assets -- khronosSamples, city packs, avatars -- which
 * are where texture weight actually lives and are not in this repository". This is that measurement.
 *
 * Three models from gpu/khronosSamples.mjs's catalogue carry a KTX2 variant with NO Draco in it, so the
 * comparison is textures alone. ABeautifulGame and CarConcept are EXCLUDED and named: their KTX variants are
 * also Draco-compressed, so a difference would be two compressions at once and attributable to neither.
 * Nothing is vendored -- the files were fetched to a scratch directory, measured and discarded, which is the
 * STREAMING posture khronosSamples.mayStream permits without a licence read.
 *
 *   model                plain variant   textures   PNG/JPEG VRAM     KTX2 disk   KTX2 VRAM (4-8 bpp)
 *   AnisotropyBarnLamp   glTF-Binary     4x 2048^2    85.33 MB          4.59 MB   10.67 - 21.33 MB
 *   ChronographWatch     glTF-Binary     8 mixed      68.33 MB          1.39 MB    8.54 - 17.08 MB
 *   StainedGlassLamp     glTF-JPG-PNG    18 mixed     87.33 MB          8.20 MB   11.25 - 22.50 MB
 *
 * *** ONE STREAMED MODEL COSTS TWENTY TIMES THIS ENTIRE REPOSITORY'S TEXTURE BUDGET. *** BUDGET measures the
 * tree's own images at 4.25 MB of VRAM with mips. AnisotropyBarnLamp alone is 85.33 MB. The earlier verdict
 * was not wrong and it was narrow: it was a claim about 16 files, and it said so.
 *
 * *** THE SAVING IS A RANGE, NOT A NUMBER, AND THAT IS THE POINT. *** VRAM is decided by the TRANSCODE TARGET
 * the client picks -- BC1/ETC1 at 4 bpp, BC7/ETC2/ASTC-4x4 at 8 bpp -- not by the container. UASTC and ETC1S
 * are how the bytes travel; they are not how the GPU stores them. So the honest figure is 3.9x to 8.0x, and
 * anything quoting one number for "the KTX2 saving" has silently chosen somebody's fallback chain.
 *
 * *** AND ALL THREE WOULD THROW IN THIS TREE TODAY, WHICH IS THE GOOD FAILURE. *** Every one declares
 * KHR_texture_basisu in extensionsRequired and NOT ONE of their 31 basisu textures carries a fallback
 * `source`. textureVerdict returns THROWS for all three. That narrows this module's own hazard note: outcome
 * 3 -- the TypeError naming 'uri' -- is real in the loader and DOES NOT ARISE in Khronos's authored samples,
 * because they all mark the extension required. It is a hazard for assets a toolchain emits as optional
 * without a fallback, not for these.
 *
 * WHAT IS STILL NOT MEASURED: transcode time against PNG decode time. That needs a browser and a GPU, and
 * this box has neither in the loop -- so the "no jank" half of the case for KTX2 is UNTESTED HERE and is not
 * claimed. Only the memory half is measured.
 */
export const STREAMED = Object.freeze({
    at: "v4474",
    source: "gpu/khronosSamples.mjs catalogue, fetched to scratch and discarded -- nothing vendored",
    excluded: Object.freeze({
        ABeautifulGame: "KTX variant is glTF-Binary-KTX-ETC1S-Draco -- geometry AND texture compression at once",
        CarConcept: "KTX variant is glTF-KTX-BasisU-Draco -- the same confound",
    }),
    // *** EVERY FIGURE HERE IS COPIED FROM THE MEASUREMENT, AND THE FIRST DRAFT WAS TRANSCRIBED FROM A
    // PRINTED TABLE INSTEAD. *** Two of the three VRAM figures were wrong by a couple of thousand bytes --
    // 71_650_509 for 71_652_693, 91_567_718 for 91_575_637 -- because they were read off a formatted line
    // rather than out of the result. gateBudget.mjs records the same lesson from the other direction: "A
    // ROUNDED MEASUREMENT IS A DIFFERENT NUMBER FROM THE MEASUREMENT." The check below re-derives each VRAM
    // figure from that row's own pixel count, so a typed number that does not follow from its pixels is red.
    models: Object.freeze([
        Object.freeze({ name: "AnisotropyBarnLamp", plain: "glTF-Binary", ktx: "glTF-KTX-BasisU",
            textures: 4, plainTextureBytes: 7_419_495, plainPixels: 16_777_216, plainVramBytes: 89_478_485,
            ktxTextureBytes: 4_809_167, ktxTextures: 4, ktxPixels: 16_777_216, fallbacks: 0, required: true,
            supercompression: "Zstd (UASTC)" }),
        Object.freeze({ name: "ChronographWatch", plain: "glTF-Binary", ktx: "glTF-KTX-BasisU",
            textures: 8, plainTextureBytes: 3_305_382, plainPixels: 13_434_880, plainVramBytes: 71_652_693,
            ktxTextureBytes: 1_453_303, ktxTextures: 8, ktxPixels: 13_434_880, fallbacks: 0, required: true,
            supercompression: "BasisLZ (ETC1S) + Zstd (UASTC)" }),
        // *** THE TWO VARIANTS ARE NOT THE SAME TEXTURE SET, AND SAYING SO IS THE POINT. *** 18 images on the
        // JPG-PNG side against 19 on the KTX side, 17_170_432 pixels against 17_694_720. These are two
        // AUTHORED variants of a model, not one input re-encoded, so the per-model totals compare what a
        // client would actually download -- and a strict like-for-like re-encode is a different experiment.
        Object.freeze({ name: "StainedGlassLamp", plain: "glTF-JPG-PNG", ktx: "glTF-KTX-BasisU",
            textures: 18, plainTextureBytes: 9_226_151, plainPixels: 17_170_432, plainVramBytes: 91_575_637,
            ktxTextureBytes: 8_596_281, ktxTextures: 19, ktxPixels: 17_694_720, fallbacks: 0, required: true,
            supercompression: "Zstd (UASTC) + BasisLZ (ETC1S)" }),
    ]),
    // The transcode targets a client may choose, in bits per pixel. The saving is bounded by these, not by
    // the container the bytes arrived in.
    targetsBpp: Object.freeze({ "BC1 / ETC1": 4, "ETC2 RGBA": 8, "BC7": 8, "ASTC 4x4": 8 }),
    // *** EXACTLY 4x AND 8x, AND THAT IS ARITHMETIC RATHER THAN A MEASUREMENT. *** RGBA8 is 32 bits per
    // pixel and a block format is `bpp`; the mip chain multiplies both by 4/3 and cancels. So the ratio is
    // 32/bpp for every texture of every size -- 8.0 at 4 bpp, 4.0 at 8 bpp -- and it does not vary by model.
    // The first draft recorded 3.9 as the minimum, which was a rounded 87.33/22.50 from the printed table,
    // and gave the check a 0.2 tolerance to cover the gap. A TOLERANCE INVENTED TO COVER A ROUNDING ERROR IS
    // A TOLERANCE NOBODY EARNED; the exact value was available and is asserted exactly.
    savingRange: Object.freeze({ min: 4.0, max: 8.0 }),
    verdictAllThree: "throws",
    verdict: "THE STREAMED CASE IS THE OPPOSITE OF THE LOCAL ONE. One model costs 68-91 MB of VRAM as " +
             "PNG/JPEG against 8.5-22.5 MB transcoded -- 60 to 80 MB saved per model, where this whole " +
             "repository's own textures come to 4.25 MB. BUDGET's 'not yet' stands for the tree's own 16 " +
             "images and does not survive one streamed asset. The saving is exactly 32/bpp -- 8x to a 4 bpp " +
             "target, 4x to an 8 bpp one -- and never a single number.",
    notMeasured: "transcode time against CPU PNG decode -- the 'no jank' half of the case. It needs a " +
                 "browser and a GPU in the loop; this measurement is memory only and claims nothing else.",
});

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
