// FILE: gpu/khronosSamples.mjs
// VERSION: v1 -- v4175
//
// The Khronos glTF-Sample-Assets catalogue, as data this tree can reason about instead of a URL somebody
// pasted once. glb_viewer.html has streamed exactly ONE of these models since it was written -- the Fox,
// hardcoded at line 56 -- and the reason nobody remembered where that fox came from is that nothing in the
// tree ever said. This module says.
//
// *** THE FINDING THAT MADE THIS A MODULE RATHER THAN A LIST: NOT EVERY KHRONOS SAMPLE ASSET IS FREE, AND
// *** THE TWO THAT ARE NOT ARE AMONG THE BEST-KNOWN IN THE SET.
//
//   BrainStem  -- LicenseRef-Poser-EULA. Smith Micro Software's Poser EULA, not an open licence at all.
//   Duck       -- SCEA Shared Source License 1.0. Sony's, from 2006, and also not a standard permissive one.
//
// Both are in the "core" set, both appear in every glTF tutorial ever written, and the reasonable assumption
// -- it is published by Khronos as a sample, so it must be free -- IS FALSE FOR BOTH. Streaming one into a
// viewer the user opened is not the same act as vendoring it into this repository and shipping it onward,
// and a module that returned "Khronos" as though that were a licence would have made those the same act.
//
// So the posture defaults to UNKNOWN and mayVendor() FAILS CLOSED. 16 of the 150 models here have had their
// metadata.json actually read; the other 134 have not, and this module says so by name rather than guessing
// from the pattern of the ones that were. A licence is read before a model is captured, never after.
//
// STREAM vs VENDOR is the distinction the whole file is organised around, and it is the same one the orrery
// draws between a body SweK REACHES and a body SweK has CAPTURED:
//
//   STREAM  -- the browser fetches it from Khronos at the user's click. Nothing is redistributed, nothing is
//              stored, and the licence question is the user's browser's, the way any web page's is.
//   VENDOR  -- the bytes land in this repository and ship onward to everyone who clones it. That needs a
//              licence permitting redistribution, and CC-BY additionally needs the attribution carried.
//
// Everything here is data and URL construction. No fetch, no three, no GL -- so a gate can drive it offline
// and a browser can import it without pulling a loader in.

const RAW = "https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models";

/**
 * The 150 models, as [name, variantNames, tags]. Taken from the repository's own Models/model-index.json,
 * not typed by hand. Variant names matter more than they look: they are the DIRECTORY NAME, and they are how
 * a caller asks for the Draco or KTX encoding of a model rather than the plain one.
 */
const CATALOGUE = [
    ["ABeautifulGame", ["glTF","glTF-Binary","glTF-Binary-KTX-ETC1S-Draco"], ["showcase","video","extension"]],
    ["AlphaBlendModeTest", ["glTF","glTF-Binary"], ["core","testing"]],
    ["AnimatedColorsCube", ["glTF","glTF-Binary"], ["extension","testing"]],
    ["AnimatedCube", ["glTF"], ["core","testing"]],
    ["AnimatedMorphCube", ["glTF","glTF-Binary","glTF-Quantized"], ["core","testing"]],
    ["AnimatedTriangle", ["glTF","glTF-Embedded"], ["core","testing","written"]],
    ["AnimationPointerUVs", ["glTF","glTF-Binary"], ["extension","testing"]],
    ["AnisotropyBarnLamp", ["glTF","glTF-Binary","glTF-KTX-BasisU"], ["showcase","extension"]],
    ["AnisotropyDiscTest", ["glTF","glTF-Binary"], ["extension","testing"]],
    ["AnisotropyRotationTest", ["glTF","glTF-Binary"], ["extension","testing"]],
    ["AnisotropyStrengthTest", ["glTF","glTF-Binary"], ["extension","testing"]],
    ["AntiqueCamera", ["glTF","glTF-Binary"], ["core","testing","issues"]],
    ["AttenuationTest", ["glTF","glTF-Binary"], ["testing","extension"]],
    ["Avocado", ["glTF","glTF-Binary","glTF-Draco","glTF-Quantized"], ["core","testing"]],
    ["BarramundiFish", ["glTF","glTF-Binary","glTF-Draco"], ["core","testing"]],
    ["BoomBox", ["glTF","glTF-Binary","glTF-Draco"], ["core","testing"]],
    ["BoomBoxWithAxes", ["glTF"], ["core","testing"]],
    ["Box", ["glTF","glTF-Binary","glTF-Draco","glTF-Embedded"], ["core","testing"]],
    ["Box With Spaces", ["glTF"], ["core","testing"]],
    ["BoxAnimated", ["glTF","glTF-Binary","glTF-Embedded"], ["core","testing"]],
    ["BoxInterleaved", ["glTF","glTF-Binary","glTF-Embedded"], ["core","testing"]],
    ["BoxTextured", ["glTF","glTF-Binary","glTF-Embedded"], ["core","issues","testing"]],
    ["BoxTexturedNonPowerOfTwo", ["glTF","glTF-Binary","glTF-Embedded"], ["core","issues","testing"]],
    ["BoxVertexColors", ["glTF","glTF-Binary","glTF-Embedded"], ["core","testing"]],
    ["BrainStem", ["glTF","glTF-Binary","glTF-Draco","glTF-Embedded","glTF-Meshopt","glTF-Meshopt-EXT"], ["core","testing"]],
    ["Cameras", ["glTF","glTF-Embedded"], ["core","testing"]],
    ["CarConcept", ["glTF","glTF-Binary","glTF-JPG","glTF-KTX-BasisU-Draco","glTF-WEBP"], ["showcase","extension"]],
    ["CarbonFibre", ["glTF","glTF-Binary"], ["extension"]],
    ["CesiumMan", ["glTF","glTF-Binary","glTF-Draco","glTF-Embedded"], ["core","issues","testing"]],
    ["CesiumMilkTruck", ["glTF","glTF-Binary","glTF-Draco","glTF-Embedded"], ["core","issues","testing"]],
    ["ChairDamaskPurplegold", ["glTF","glTF-Binary"], ["extension"]],
    ["ChronographWatch", ["glTF","glTF-Binary","glTF-KTX-BasisU","glTF-WEBP"], ["showcase","extension"]],
    ["ClearCoatCarPaint", ["glTF","glTF-Binary"], ["extension","testing"]],
    ["ClearCoatTest", ["glTF","glTF-Binary"], ["testing","extension"]],
    ["ClearcoatWicker", ["glTF","glTF-Binary"], ["extension","testing"]],
    ["CommercialRefrigerator", ["glTF","glTF-Binary"], ["showcase","extension"]],
    ["CompareAlphaCoverage", ["glTF","glTF-Binary"], ["core","testing","pbrtest"]],
    ["CompareAmbientOcclusion", ["glTF","glTF-Binary"], ["core","testing","pbrtest"]],
    ["CompareAnisotropy", ["glTF","glTF-Binary"], ["extension","testing","pbrtest"]],
    ["CompareBaseColor", ["glTF","glTF-Binary"], ["testing","pbrtest"]],
    ["CompareClearcoat", ["glTF","glTF-Binary"], ["extension","testing","pbrtest"]],
    ["CompareDispersion", ["glTF","glTF-Binary"], ["extension","testing","pbrtest"]],
    ["CompareEmissiveStrength", ["glTF","glTF-Binary"], ["extension","testing","pbrtest"]],
    ["CompareIor", ["glTF","glTF-Binary"], ["extension","testing","pbrtest"]],
    ["CompareIridescence", ["glTF","glTF-Binary"], ["extension","testing","pbrtest"]],
    ["CompareMetallic", ["glTF","glTF-Binary"], ["core","testing","pbrtest"]],
    ["CompareNormal", ["glTF","glTF-Binary"], ["core","testing","pbrtest"]],
    ["CompareRoughness", ["glTF","glTF-Binary"], ["core","testing","pbrtest"]],
    ["CompareSheen", ["glTF","glTF-Binary"], ["extension","testing","pbrtest"]],
    ["CompareSpecular", ["glTF","glTF-Binary"], ["extension","testing","pbrtest"]],
    ["CompareTransmission", ["glTF","glTF-Binary"], ["extension","testing","pbrtest"]],
    ["CompareVolume", ["glTF","glTF-Binary"], ["extension","testing","pbrtest"]],
    ["Corset", ["glTF","glTF-Binary","glTF-Draco"], ["core","testing"]],
    ["Cube", ["glTF"], ["core","testing"]],
    ["CubeVisibility", ["glTF","glTF-Binary"], ["testing"]],
    ["DamagedHelmet", ["glTF","glTF-Binary","glTF-Embedded"], ["core","showcase","testing","video"]],
    ["DiffuseTransmissionPlant", ["glTF","glTF-Binary"], ["showcase","extension"]],
    ["DiffuseTransmissionTeacup", ["glTF","glTF-Binary"], ["showcase","extension"]],
    ["DiffuseTransmissionTest", ["glTF","glTF-Binary"], ["video","written","extension"]],
    ["DirectionalLight", ["glTF","glTF-Binary"], ["testing"]],
    ["DispersionTest", ["glTF","glTF-Binary"], ["extension","testing"]],
    ["DragonAttenuation", ["glTF","glTF-Binary","glTF-Meshopt","glTF-Meshopt-EXT"], ["extension"]],
    ["DragonDispersion", ["glTF","glTF-Binary"], ["extension"]],
    ["Duck", ["glTF","glTF-Binary","glTF-Draco","glTF-Embedded","glTF-Quantized"], ["core","testing"]],
    ["EmissiveStrengthTest", ["glTF","glTF-Binary"], ["testing","extension"]],
    ["EnvironmentTest", ["glTF","glTF-IBL"], ["testing","extension"]],
    ["FlightHelmet", ["glTF"], ["showcase","testing"]],
    ["Fox", ["glTF","glTF-Binary"], ["core","testing"]],
    ["GlamVelvetSofa", ["glTF","glTF-Binary"], ["video","extension"]],
    ["GlassBrokenWindow", ["glTF","glTF-Binary"], ["video","extension"]],
    ["GlassHurricaneCandleHolder", ["glTF","glTF-Binary"], ["video","written","showcase","extension"]],
    ["GlassVaseFlowers", ["glTF","glTF-Binary"], ["video","extension"]],
    ["IORTestGrid", ["glTF","glTF-Binary"], ["extension"]],
    ["InterpolationTest", ["glTF","glTF-Binary"], ["core","testing"]],
    ["IridescenceAbalone", ["glTF","glTF-Binary"], ["extension"]],
    ["IridescenceDielectricSpheres", ["glTF"], ["testing","extension"]],
    ["IridescenceLamp", ["glTF","glTF-Binary"], ["showcase","extension"]],
    ["IridescenceMetallicSpheres", ["glTF"], ["testing","extension"]],
    ["IridescenceSuzanne", ["glTF","glTF-Binary"], ["testing","extension"]],
    ["IridescentDishWithOlives", ["glTF","glTF-Binary"], ["showcase","video","extension"]],
    ["Lantern", ["glTF","glTF-Binary","glTF-Draco","glTF-Quantized"], ["core","testing"]],
    ["LightVisibility", ["glTF","glTF-Binary"], ["testing"]],
    ["LightsPunctualLamp", ["glTF","glTF-Binary"], ["testing","extension"]],
    ["MandarinOrange", ["glTF"], ["extension","testing"]],
    ["MaterialsVariantsShoe", ["glTF","glTF-Binary"], ["extension","showcase","written"]],
    ["MeshPrimitiveModes", ["glTF","glTF-Embedded"], ["testing"]],
    ["MeshoptCubeTest", ["glTF","glTF-Meshopt"], ["extension","testing"]],
    ["MetalRoughSpheres", ["glTF","glTF-Binary","glTF-Embedded"], ["core","testing"]],
    ["MetalRoughSpheresNoTextures", ["glTF","glTF-Binary"], ["core","testing"]],
    ["MorphPrimitivesTest", ["glTF","glTF-Binary","glTF-Draco"], ["core","testing"]],
    ["MorphStressTest", ["glTF","glTF-Binary"], ["core","testing"]],
    ["MosquitoInAmber", ["glTF","glTF-Binary"], ["showcase","extension"]],
    ["MultiUVTest", ["glTF","glTF-Binary","glTF-Embedded"], ["core","testing"]],
    ["MultipleScenes", ["glTF","glTF-Embedded"], ["core","testing"]],
    ["NegativeScaleTest", ["glTF","glTF-Binary"], ["core","testing"]],
    ["NodePerformanceTest", ["glTF","glTF-Binary"], ["testing"]],
    ["NodeVisibilityTest", ["glTF","glTF-Binary"], ["testing"]],
    ["NormalTangentMirrorTest", ["glTF","glTF-Binary"], ["core","testing"]],
    ["NormalTangentTest", ["glTF","glTF-Binary"], ["core","testing"]],
    ["OrientationTest", ["glTF","glTF-Binary","glTF-Embedded"], ["core","testing"]],
    ["PlaysetLightTest", ["glTF","glTF-Binary"], ["test"]],
    ["PointLightIntensityTest", ["glTF","glTF-Binary"], ["extension","testing"]],
    ["PotOfCoals", ["glTF","glTF-Binary"], ["showcase","extension"]],
    ["PotOfCoalsAnimationPointer", ["glTF","glTF-Binary"], ["showcase","extension"]],
    ["PrimitiveModeNormalsTest", ["glTF"], ["core","issues","testing"]],
    ["RecursiveSkeletons", ["glTF","glTF-Binary"], ["core","testing","issues"]],
    ["RiggedFigure", ["glTF","glTF-Binary","glTF-Draco","glTF-Embedded"], ["core","testing"]],
    ["RiggedSimple", ["glTF","glTF-Binary","glTF-Draco","glTF-Embedded"], ["core","testing"]],
    ["ScatteringSkull", ["glTF","glTF-Binary"], ["testing"]],
    ["SciFiHelmet", ["glTF"], ["core","testing"]],
    ["SheenChair", ["glTF","glTF-Binary"], ["showcase","video","extension"]],
    ["SheenCloth", ["glTF"], ["showcase","video","extension"]],
    ["SheenTestGrid", ["glTF","glTF-Binary"], ["extension"]],
    ["SheenWoodLeatherSofa", ["glTF","glTF-Binary"], ["showcase","extension"]],
    ["SimpleInstancing", ["glTF","glTF-Binary"], ["extension","testing"]],
    ["SimpleMaterial", ["glTF","glTF-Embedded"], ["core","testing","written"]],
    ["SimpleMeshes", ["glTF","glTF-Embedded"], ["core","testing","written"]],
    ["SimpleMorph", ["glTF","glTF-Embedded"], ["core","testing"]],
    ["SimpleSkin", ["glTF","glTF-Embedded"], ["core","testing","written"]],
    ["SimpleSparseAccessor", ["glTF","glTF-Embedded"], ["core","testing"]],
    ["SimpleTexture", ["glTF","glTF-Embedded"], ["core","testing","written"]],
    ["SpecGlossVsMetalRough", ["glTF","glTF-Binary"], ["testing","extension"]],
    ["SpecularSilkPouf", ["glTF","glTF-Binary"], ["showcase","extension"]],
    ["SpecularTest", ["glTF","glTF-Binary"], ["testing","extension"]],
    ["Sponza", ["glTF"], ["core"]],
    ["StainedGlassLamp", ["glTF","glTF-JPG-PNG","glTF-KTX-BasisU"], ["showcase","extension"]],
    ["SunglassesKhronos", ["glTF","glTF-Binary","glTF-Draco"], ["showcase","extension"]],
    ["Suzanne", ["glTF"], ["core","testing"]],
    ["TextureCoordinateTest", ["glTF","glTF-Binary","glTF-Embedded"], ["core","testing"]],
    ["TextureEncodingTest", ["glTF","glTF-Binary"], ["core","testing"]],
    ["TextureLinearInterpolationTest", ["glTF","glTF-Binary"], ["core","testing"]],
    ["TextureSettingsTest", ["glTF","glTF-Binary","glTF-Embedded"], ["core","testing"]],
    ["TextureTransformMultiTest", ["glTF","glTF-Binary"], ["testing","extension"]],
    ["TextureTransformTest", ["glTF"], ["testing","extension"]],
    ["ToyCar", ["glTF","glTF-Binary"], ["showcase","video","extension"]],
    ["TrafficCone", ["glTF"], ["extension"]],
    ["TransmissionOrderTest", ["glTF","glTF-Binary"], ["extension","testing"]],
    ["TransmissionRoughnessTest", ["glTF","glTF-Binary"], ["testing","extension"]],
    ["TransmissionTest", ["glTF","glTF-Binary"], ["testing","extension"]],
    ["TransmissionThinwallTestGrid", ["glTF","glTF-Binary"], ["extension"]],
    ["Triangle", ["glTF","glTF-Embedded"], ["core","testing","written"]],
    ["TriangleWithoutIndices", ["glTF","glTF-Embedded"], ["core","testing"]],
    ["TwoSidedPlane", ["glTF"], ["core"]],
    ["USDShaderBallForGltf", ["glTF","glTF-Binary"], ["showcase","extension"]],
    ["Unicode❤♻Test", ["glTF","glTF-Binary"], ["core","testing"]],
    ["UnlitTest", ["glTF","glTF-Binary"], ["testing","extension"]],
    ["VertexColorTest", ["glTF","glTF-Binary","glTF-Embedded"], ["core","testing"]],
    ["VirtualCity", ["glTF","glTF-Binary","glTF-Draco","glTF-Embedded"], ["core","testing"]],
    ["WaterBottle", ["glTF","glTF-Binary","glTF-Draco"], ["core","testing","written"]],
    ["XmpMetadataRoundedCube", ["glTF","glTF-Binary"], ["extension","testing"]],
];

/**
 * Licences ACTUALLY READ from each model's metadata.json, not inferred. Sixteen of a hundred and fifty.
 * `spdx` lists every distinct identifier in the model's legal block, because a model routinely has several:
 * the Fox's mesh is CC0 while its rigging and its glTF conversion are CC-BY-4.0, and the strictest one
 * governs what may be done with the whole.
 *
 * `posture` is the answer to "what may SweK do with this", collapsed to three:
 *   "public-domain" -- CC0 throughout. Stream it, vendor it, no attribution required (crediting is still
 *                      courteous and this tree does it anyway).
 *   "attribution"   -- CC-BY somewhere in it. Vendoring is permitted AND THE CREDIT MUST TRAVEL WITH IT.
 *   "restricted"    -- a EULA or a bespoke licence. Stream only. Do not vendor without reading the actual
 *                      terms, which is a person's job and not this module's.
 */
const LICENCES = {
    ABeautifulGame:           { spdx: ["CC-BY-4.0"],              posture: "attribution",   who: "MaterialX Project (ASWF); glTF conversion by Ed Mackey" },
    AntiqueCamera:            { spdx: ["CC0-1.0"],                posture: "public-domain", who: "Maximillan Kamps" },
    BrainStem:                { spdx: ["LicenseRef-Poser-EULA"],  posture: "restricted",    who: "Keith Hunter, owned by Smith Micro Software, Inc." },
    CesiumMan:                { spdx: ["CC-BY-4.0"],              posture: "attribution",   who: "Cesium" },
    ChronographWatch:         { spdx: ["CC-BY-4.0"],              posture: "attribution",   who: "Eric Chadwick" },
    DiffuseTransmissionPlant: { spdx: ["CC-BY-4.0", "CC0-1.0"],   posture: "attribution",   who: "Eric Chadwick; Rico Cilliers" },
    Duck:                     { spdx: ["SCEA"],                   posture: "restricted",    who: "Sony, SCEA Shared Source License 1.0" },
    Fox:                      { spdx: ["CC0-1.0", "CC-BY-4.0"],   posture: "attribution",   who: "PixelMannen (model, CC0); tomkranis (rig + animation); @AsoboStudio and @scurest (conversion)" },
    GlassHurricaneCandleHolder:{ spdx: ["CC-BY-4.0"],             posture: "attribution",   who: "Eric Chadwick" },
    Lantern:                  { spdx: ["CC0-1.0"],                posture: "public-domain", who: "sbtron; Frank Galligan" },
    MosquitoInAmber:          { spdx: ["CC-BY-4.0"],              posture: "attribution",   who: "Loic Norgeot, via Sketchfab" },
    PotOfCoals:               { spdx: ["CC-BY-4.0"],              posture: "attribution",   who: "Eric Chadwick" },
    RiggedFigure:             { spdx: ["CC-BY-4.0"],              posture: "attribution",   who: "Cesium" },
    SheenChair:               { spdx: ["CC0-1.0"],                posture: "public-domain", who: "Eric Chadwick" },
    StainedGlassLamp:         { spdx: ["CC-BY-4.0"],              posture: "attribution",   who: "Eric Chadwick" },
    ToyCar:                   { spdx: ["CC0-1.0"],                posture: "public-domain", who: "Guido Odendahl; Eric Chadwick" },
};

const BY_NAME = new Map(CATALOGUE.map(([name, variants, tags]) => [name, { name, variants, tags }]));

/** Every model name, in the catalogue's own order. */
export function models() { return CATALOGUE.map(([n]) => n); }

/** One model's record, or null. { name, variants, tags } */
export function model(name) { const m = BY_NAME.get(name); return m ? { name: m.name, variants: m.variants.slice(), tags: m.tags.slice() } : null; }

/** Models carrying a given tag ("showcase", "core", "testing", "extension", "pbrtest", "video", ...). */
export function tagged(tag) { return CATALOGUE.filter(([, , tags]) => tags.includes(tag)).map(([n]) => n); }

/**
 * Models available in a Draco-compressed variant. Worth its own function because until v4175 this tree had
 * never seen a Draco-compressed glTF at all -- gpu/glbLoad.js routes on the extension and its gate had to
 * say so in as many words: "unchecked here: an actual Draco-compressed GLB decoded end to end. No such file
 * exists in this tree." These are where such files come from.
 */
export function dracoVariants() {
    return CATALOGUE.filter(([, vs]) => vs.some((v) => /Draco/i.test(v)))
                    .map(([name, vs]) => ({ name, variants: vs.filter((v) => /Draco/i.test(v)) }));
}

/**
 * The URL for one variant of one model. The FILENAME is derived rather than stored, because the repository's
 * own rule is that a .glb variant holds <Name>.glb and every other variant holds <Name>.gltf -- and a .gltf
 * arrives with its buffers and textures as SEPARATE FILES beside it, which a caller fetching a single URL
 * will not get. Returns { url, kind } so that is visible rather than a surprise at parse time:
 * kind "self-contained" for .glb, "needs-siblings" for .gltf.
 */
export function urlFor(name, variant = "glTF-Binary") {
    const m = BY_NAME.get(name);
    if (!m) return { ok: false, error: `no such model: ${name}` };
    if (!m.variants.includes(variant)) {
        return { ok: false, error: `${name} has no ${variant} variant (has: ${m.variants.join(", ")})` };
    }
    const binary = /Binary/i.test(variant);
    // THE FILENAME NEEDS ENCODING TOO, and the first draft encoded only the two directory segments. Two
    // models in this catalogue have names that are not URL-safe -- "Box With Spaces" (whose whole reason for
    // existing is to be awkward) and "Unicode<3>Test" -- and their filenames repeat the model name, so a
    // half-encoded URL came out with the directory escaped and raw spaces left in the file part. It would
    // have failed on exactly the two models designed to catch it.
    const file = `${encodeURIComponent(name)}.${binary ? "glb" : "gltf"}`;
    return { ok: true, url: `${RAW}/${encodeURIComponent(name)}/${encodeURIComponent(variant)}/${file}`,
             kind: binary ? "self-contained" : "needs-siblings", variant, name };
}

/** Where a person goes to read the licence themselves. Always available, even for the 134 unread ones. */
export function licenceUrlFor(name) { return `${RAW}/${encodeURIComponent(name)}/LICENSE.md`; }
export function metadataUrlFor(name) { return `${RAW}/${encodeURIComponent(name)}/metadata.json`; }

/**
 * What is known about a model's licence. An unread model returns posture "unknown" WITH the URL to read --
 * never a guess, and never the posture of the models around it.
 */
export function licenceFor(name) {
    const rec = LICENCES[name];
    if (rec) return { ...rec, spdx: rec.spdx.slice(), read: true, licenceUrl: licenceUrlFor(name) };
    return { spdx: [], posture: "unknown", who: null, read: false, licenceUrl: licenceUrlFor(name),
             note: "not read yet -- read LICENSE.md and metadata.json before vendoring; streaming is unaffected" };
}

/**
 * Streaming is a fetch the user's own browser makes; nothing is redistributed. Permitted for any model in
 * the catalogue, whatever its licence, exactly as opening the Khronos page in a tab would be.
 */
export function mayStream(name) { return BY_NAME.has(name); }

/**
 * *** FAILS CLOSED, AND THAT IS THE ENTIRE POINT OF THIS FUNCTION. *** Vendoring puts the bytes in this
 * repository and ships them to everyone who clones it. Only a model whose licence has actually been READ and
 * found permissive returns true; "unknown" returns false, because not having looked is not the same as
 * having found nothing wrong. BrainStem and Duck return false having been read -- which is the case that
 * proves the default is not merely cautious about the unread.
 */
export function mayVendor(name) {
    const l = licenceFor(name);
    const ok = l.read && (l.posture === "public-domain" || l.posture === "attribution");
    return { ok, posture: l.posture, needsAttribution: l.posture === "attribution",
             who: l.who, licenceUrl: l.licenceUrl,
             why: !l.read ? "licence not read yet -- read it before vendoring; streaming needs no such check"
                : ok ? (l.posture === "attribution" ? "permitted, and the credit must ship with the bytes" : "public domain")
                : `licence is ${l.spdx.join(", ")} -- stream only, do not vendor without reading the actual terms` };
}

/** Counts, so a caller (and the gate) can see how much of the catalogue has been read rather than assume. */
export function licenceCoverage() {
    const total = CATALOGUE.length, read = Object.keys(LICENCES).length;
    const byPosture = {};
    for (const k of Object.keys(LICENCES)) { const p = LICENCES[k].posture; byPosture[p] = (byPosture[p] || 0) + 1; }
    return { total, read, unread: total - read, byPosture };
}

export const KHRONOS_RAW_BASE = RAW;
