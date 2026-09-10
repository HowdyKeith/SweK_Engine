// WebGLEngine/render/exactHash.mjs -- v4569
//
// *** A HASH A CPU AND A GPU DRAW THE SAME NUMBER FROM. ***
//
// fract(sin(dot(p, K)) * 43758.5453) is the shape used all over the web, and it is not an approximation of a
// random number -- it is a DIFFERENT random number in float32 than in float64. sin(x) * 43758 amplifies the
// last bits of x by four orders of magnitude, so a float32 GPU and a float64 CPU twin do not round the same
// value differently, they draw unrelated values. v4558 measured it over 20,000 sample points for the BCS
// shader family: 79.4% diverged by more than 0.1 and the worst pair was 0.9960 against 0.0000.
//
// THE CONSEQUENCE IS NOT ALWAYS COSMETIC. render/grassModel.mjs exists to mirror render/grassField.js "so the
// two can be compared term by term", and its bladeHash decides `if (bladeHash < slopeSuppress) return
// { drawn: false }` -- whether a blade of grass exists. Measured over 32,000 blade origins on the 0.25 m
// lattice the field actually uses: the two halves disagree by more than 0.1 on 65.0% of them, worst delta
// 1.0000, and THE DRAWN DECISION FLIPS ON 65.4%. A model that is wrong about two thirds of the grass is not
// a model, and nothing noticed because its gate checks a different hash.
//
// ---- WHY THIS IS A THIRD COPY, AND WHY THAT IS NOT DUPLICATION ------------------------------------------
//
// v4558 shipped this arithmetic twice on purpose: bcsHash/bcsUMix in render/swiftShaderModel.mjs and
// bcs_hash/bcs_umix in the GLSL inside render/swiftShaderPass.js, with a comment on the second saying it
// "MUST stay character-for-character equivalent" and tools/ship/swiftShaders-selfcheck.mjs running both and
// comparing. That pair is gated, working, and not worth reopening to thread an import through a shader
// string. So this module is the home for every OTHER user, and the tie is a measurement rather than a
// promise: tools/ship/exactHash-selfcheck.mjs asserts exactHash2(x, y) equals bcsHash(x, y) across a sweep.
// Three copies held to one answer by two gates beats two copies and a new idiom.
//
// ---- WHAT IT DOES ---------------------------------------------------------------------------------------
//
// Quantise to a 1/256 lattice, then run an INTEGER avalanche (Wang / lowbias32). Integer arithmetic is exact
// in both precisions, so the two agree BIT FOR BIT wherever the quantised coordinate agrees -- which turns an
// everywhere-different number into an occasional boundary pixel.
//
// BOUNDED ON PURPOSE: the lattice coordinate wraps into 2^24 before the integer conversion, because 2^24 is
// the largest integer float32 represents exactly. Above it a float32 input has already lost the precision
// this hash needs, so the wrap is where the guarantee ends -- stated rather than left to be discovered. It is
// also what keeps the GLSL `uvec2(q)` conversion defined: the wrap yields a NON-NEGATIVE q, and converting a
// negative float to uint is undefined behaviour.
//
// *** IT CHANGES WHAT THE SHADERS LOOK LIKE, AND THAT IS THE TRADE. *** A different hash is a different noise
// field: grain, thinning and every fbm built on them draw a new pattern. The STRUCTURE is unchanged -- same
// lattice, same octaves, same amplitudes -- and a pattern two halves can be held to is worth more than a
// prettier one neither can.
"use strict";

/** 32-bit avalanche (Wang / lowbias32). Integer-only, so float32 and float64 agree BIT FOR BIT. */
export function umix(h) {
    h = h >>> 0;
    h = (h ^ (h >>> 16)) >>> 0;   h = Math.imul(h, 0x7feb352d) >>> 0;
    h = (h ^ (h >>> 15)) >>> 0;   h = Math.imul(h, 0x846ca68b) >>> 0;
    return (h ^ (h >>> 16)) >>> 0;
}

/**
 * The 2-D hash. `seed` decorrelates two hashes at the same coordinate, which is what the old idiom used its
 * magic constants for -- voxelrenderer draws three of them from one cell and they must not agree.
 *
 * AT seed = 0 THIS IS EXACTLY swiftShaderModel.bcsHash, because `x ^ 0` is `x`. That is deliberate: the
 * proven function is the seed-0 case of this one rather than a thing this one resembles.
 */
export function exactHash2(x, y, seed = 0) {
    let qx = Math.floor(x * 256), qy = Math.floor(y * 256);
    qx -= 16777216 * Math.floor(qx / 16777216);
    qy -= 16777216 * Math.floor(qy / 16777216);
    const hy = umix(((Math.imul(qy, 0xd8163841) >>> 0) ^ (seed >>> 0)) >>> 0);
    return umix(((Math.imul(qx, 0x8da6b343) >>> 0) ^ hy) >>> 0) / 4294967296;
}

/**
 * *** THE 3-D FORM. *** A starfield hashes a CELL OF THE SKY, which is three integers, and folding one axis
 * into `seed` would make two cells that differ only in z collide whenever their seeds happened to match.
 *
 * The construction is exactHash2's, extended by one link: each axis is quantised, wrapped, multiplied by its
 * own odd constant and mixed into the chain, so every axis passes through a full avalanche before the next
 * one is folded in. Integer arithmetic throughout, so float32 and float64 agree BIT FOR BIT.
 *
 * IT IS NOT exactHash2 WITH A THIRD ARGUMENT, and the gate says so rather than leaving it to be assumed:
 * exactHash3(x, y, 0, seed) === exactHash2(x, y, umix(seed)), because at z = 0 the third link degenerates to
 * a mix of the seed alone. A stated relation between two functions beats a claim that one contains the other.
 */
export function exactHash3(x, y, z, seed = 0) {
    let qx = Math.floor(x * 256), qy = Math.floor(y * 256), qz = Math.floor(z * 256);
    qx -= 16777216 * Math.floor(qx / 16777216);
    qy -= 16777216 * Math.floor(qy / 16777216);
    qz -= 16777216 * Math.floor(qz / 16777216);
    const hz = umix(((Math.imul(qz, 0x27d4eb2f) >>> 0) ^ (seed >>> 0)) >>> 0);
    const hy = umix(((Math.imul(qy, 0xd8163841) >>> 0) ^ hz) >>> 0);
    return umix(((Math.imul(qx, 0x8da6b343) >>> 0) ^ hy) >>> 0) / 4294967296;
}

/** The 1-D form, for callers that already reduced a coordinate to one number. */
export function exactHash1(x, seed = 0) { return exactHash2(x, 0, seed); }

/**
 * The same arithmetic as GLSL, to be spliced into a shader that needs it. Character-for-character equivalent
 * to the functions above -- tools/ship/exactHash-selfcheck.mjs holds the two to each other on a device.
 */
/**
 * The WGSL form. Same arithmetic, and the differences from the GLSL are the language's, not the hash's:
 * u32 rather than uint, vec2u rather than uvec2, and `>>` on u32 is already logical so no `u` suffixes.
 */
/**
 * *** WHERE THE OLD IDIOM STILL LIVES IN SHADER CODE, CLASSIFIED BY WHAT IT FEEDS. ***
 *
 * The v4569 round fixed the three CPU/GPU TWINS -- files where a float64 model and a float32 shader computed
 * the same hash and disagreed. It filed the rest as "TEN HAVE NO GATE AT ALL". Re-counted at v4578 with the
 * line rule this module's gate already uses (a `fract(sin(` on a line that is not a comment) plus a
 * requirement that the file actually contain SHADER SOURCE rather than prose about one, the number is TWELVE,
 * and a THIRTEENTH was not ungated at all -- render/holoFoilShader.js had a CPU model that the ratchet could
 * not see, because the ratchet asks whether ONE FILE holds both halves and that pair is two files.
 *
 * *** THE CLASSIFICATION IS THE POINT, BECAUSE IT ORDERS THE WORK BY CONSEQUENCE. *** v4569 established that
 * fbm AVERAGES its noise, so a wisp drawn from an unrelated random field is still a wisp -- which is why
 * nobody looking at the picture ever caught the nebula. A THRESHOLD DOES NOT AVERAGE: grass decided a blade
 * EXISTS on `bladeHash < slopeSuppress` and 65.4% of those decisions flipped; the nebula drew a star on
 * `sv > 0.994` and 3,006 CPU stars met 2,509 GPU ones with 378 in the same place. So each site below is
 * marked by its CONSUMER, read from the code rather than guessed:
 *
 *   threshold   the hash decides whether something EXISTS. Divergence changes the picture's CONTENT, and
 *               these are the sites worth a CPU reference and a round each.
 *   continuous  the hash is averaged, mixed or added as a small offset. Divergence changes the pattern and
 *               not the structure, which is a real cost and a smaller one.
 *
 * *** THIS IS A CENSUS, NOT A DEFECT LIST. *** A shader-only site has no CPU twin to disagree with today, so
 * nothing here is wrong in the way holoFoil was wrong. What each carries is that `sin` at these magnitudes is
 * IMPLEMENTATION-DEFINED -- tools/ship/swiftShaders-selfcheck.mjs's own note, and tools/ship/webgpuHarness.mjs
 * records sin(1 * 12.9898) * 43758.5453 reading 0.921690 on a CPU and 0.240234 on a GPU -- so two devices, or
 * one page's WebGL2 and WebGPU paths, need not agree. The ratchet's job is that the set may SHRINK and may
 * not grow silently.
 */
export const SHADER_SINHASH_V4578 = Object.freeze({
    at: "v4578",
    // *** THE THREE STARFIELDS WERE ONE FUNCTION HAND-COPIED INTO THREE FILES, AND v4579 SHARED IT. ***
    // They are render/starField.mjs's now -- the three pages splice STARFIELD_WGSL and keep only their own
    // density cut -- so they have left this census.
    //
    // *** AND THIS ENTRY SAID THEIR CUT WAS IDENTICAL, THREE TIMES, AND IT NEVER WAS. *** The prose read
    // "the identical `hh > 0.986` cut" and all three per-line comments repeated 0.986. The n3 text WAS
    // byte-identical on all three (md5 a8bec00ebc4c); the cuts are 0.986, 0.987 and 0.985. I checked the
    // FUNCTION on all three files and the CALLER on one, then wrote "identical" about both -- and repeating
    // the wrong number on each line made it look checked rather than copied.
    threshold: Object.freeze([
        "render/skyRenderer.js",     // h > 1.0 - uStarDensity * 0.005 -> a star exists. STILL OPEN.
    ]),
    starfieldSharedAtV4579: Object.freeze(["blackhole.html", "flight-gpu.html", "wormhole.html"]),
    cutsWereNeverIdentical: Object.freeze({ "blackhole.html": 0.986, "flight-gpu.html": 0.987, "wormhole.html": 0.985 }),
    // *** AND TWO OF THE TWELVE ARE FILES NO RUNTIME CODE LOADS, WHICH THIS ENTRY COUNTED AS SITES. ***
    // Measured at v4579 across every .js/.mjs/.html outside gates and bookkeeping: nothing names either.
    // shaders/biome.frag.glsl is the one that matters -- it picks desert / plains / forest on `b < 0.33` and
    // `b < 0.66`, so it read as a threshold site worth a round, and no page runs it. Its comment "BIOME
    // DETECTION (matches JS logic conceptually)" cannot be checked against anything: the live classification
    // is world/worleyBiomes and this file is not wired to it.
    //
    // TEN of this tree's 26 standalone shader files are in that position, and NO CENSUS HERE CAN SEE IT:
    // tools/ship/orphanScan.mjs walks .js and .mjs only, so a dead .glsl is invisible to the one instrument
    // whose job is reachability. Round #31's finding (".cjs is outside every census") in a second extension.
    // FILED, NOT FIXED HERE -- and they stay in the census below, because they DO carry the idiom.
    notLoaded: Object.freeze(["shaders/biome.frag.glsl", "gpu/waterScreen.frag.glsl"]),
    continuous: Object.freeze([
        "atmosphere/AtmosphereSystem.js",   // vertical jitter on a lightning streak, through a smoothstep
        "demos_code/ant_colony.js",         // a heading nudge on the tie-break branch only
        "demos_code/slime_mold.js",         // the same nudge, the same branch
        "nebula-device.html",               // fbm, and the ONLY file carrying the idiom in GLSL and WGSL BOTH
        "render/CloudVolume.js",            // a dithered ray start, averaged over up to 48 march steps
        "render/voxelrenderer.js",          // h1/h2/h3 surface tint and a +/-4% per-voxel colour jitter
    ]),
    // *** shaders/biome.frag.glsl SAYS IT MATCHES A JS HALF AND THE COMMENT IS "conceptually". *** Its
    // `// BIOME DETECTION (matches JS logic conceptually)` is the same claim holoFoilShader.js's "matching the
    // model's hash2" turned out to be false about, hedged by one adverb. Worth a look before it is touched;
    // NOT investigated here, and recorded as unexamined rather than as a second finding.
    claimsAJsHalf: Object.freeze(["shaders/biome.frag.glsl"]),
    // The two gates that SEARCH for the idiom and therefore contain it. Excluded by name, and their existence
    // is asserted, so the exclusion cannot come to hide a deletion.
    searchers: Object.freeze(["tools/ship/exactHash-selfcheck.mjs", "tools/ship/holoFoil-selfcheck.mjs"]),
    // *** NOT CLAIMED: that twelve is a defect count. *** It is where the idiom is. What was a defect, and is
    // fixed at v4578, is render/holoFoilShader.js: its hf_hash2 was the sin-hash beneath a comment saying it
    // matched render/holoFoil.mjs's integer hash2, and over the 1,600 cells of the flake lattice the two drew
    // 29 of the model's 184 flakes in the same place -- 15.8%.
    fixedHere: "render/holoFoilShader.js",
    // *** WHY THE SIN-HASH IS WRONG FOR A THRESHOLD, MEASURED AT v4579 RATHER THAN ARGUED. *** It is uniform
    // by DECILE and deficient in the TAIL, which is the only part a star cut reads. Pooled over 1,572,864
    // integer cells in six 64^3 cubes, against a cut of 0.986 that should admit 1.400%: the sin-hash reads
    // 1.2837%, 12.4 sd low, and its per-cube readings scatter 0.077% against exact_hash3's 0.031%. A page
    // asking for 1.4% of its sky got about 1.28% of it, and how much depended on which way it looked.
    tailDeficitSd: -12.4,
});

export const EXACT_HASH_WGSL = `
fn exact_umix(hi: u32) -> u32 {
    var h = hi;
    h ^= h >> 16u;   h *= 0x7feb352du;
    h ^= h >> 15u;   h *= 0x846ca68bu;
    h ^= h >> 16u;
    return h;
}
fn exact_hash(p: vec2f, seed: u32) -> f32 {
    var q = floor(p * 256.0);
    q -= 16777216.0 * floor(q * (1.0 / 16777216.0));   // 2^24: the last integer f32 holds exactly
    let u = vec2u(q);                                   // defined only because the wrap made q non-negative
    return f32(exact_umix((u.x * 0x8da6b343u) ^ exact_umix((u.y * 0xd8163841u) ^ seed))) * (1.0 / 4294967296.0);
}
`;

export const EXACT_HASH_GLSL = `
uint exact_umix(uint h) {
    h ^= h >> 16u;   h *= 0x7feb352du;
    h ^= h >> 15u;   h *= 0x846ca68bu;
    h ^= h >> 16u;
    return h;
}
float exact_hash(vec2 p, uint seed) {
    vec2 q = floor(p * 256.0);
    q -= 16777216.0 * floor(q * (1.0 / 16777216.0));   // 2^24: the last integer float32 holds exactly
    uvec2 u = uvec2(q);                                 // defined only because the wrap made q non-negative
    return float(exact_umix((u.x * 0x8da6b343u) ^ exact_umix((u.y * 0xd8163841u) ^ seed))) * (1.0 / 4294967296.0);
}
`;

export const EXACT_HASH3_WGSL = `
fn exact_hash3(p: vec3f, seed: u32) -> f32 {
    var q = floor(p * 256.0);
    q -= 16777216.0 * floor(q * (1.0 / 16777216.0));   // 2^24: the last integer f32 holds exactly
    let u = vec3u(q);                                   // defined only because the wrap made q non-negative
    let hz = exact_umix((u.z * 0x27d4eb2fu) ^ seed);
    let hy = exact_umix((u.y * 0xd8163841u) ^ hz);
    return f32(exact_umix((u.x * 0x8da6b343u) ^ hy)) * (1.0 / 4294967296.0);
}
`;

/** The GLSL form, for the WebGL2 half of the tree. Same chain; uvec3 rather than vec3u. */
export const EXACT_HASH3_GLSL = `
float exact_hash3(vec3 p, uint seed) {
    vec3 q = floor(p * 256.0);
    q -= 16777216.0 * floor(q * (1.0 / 16777216.0));
    uvec3 u = uvec3(q);
    uint hz = exact_umix((u.z * 0x27d4eb2fu) ^ seed);
    uint hy = exact_umix((u.y * 0xd8163841u) ^ hz);
    return float(exact_umix((u.x * 0x8da6b343u) ^ hy)) * (1.0 / 4294967296.0);
}
`;

