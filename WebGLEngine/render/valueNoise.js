// WebGLEngine/render/valueNoise.js — v4327 (the skybox lineage's integer hash and value noise, given an owner)
//
// An integer lattice hash, trilinear value noise built on it, and fBm built on that. Integer math only, so the
// same seed gives the same bytes on every engine and every architecture. Lifted verbatim out of
// render/nebulaSkybox.js, which had owned them since v3833 and had grown four consumers.
//
// ---- *** THIS IS NOT "THE TREE'S ONE NOISE", AND THREE FILES SAID IT WAS *** -------------------------------
//
// render/greeble.js and render/hitBurst.js each imported hash3 under the comment "the tree's one integer hash",
// and hitBurst's header spelled the claim out: "already shared by the skybox, star, planet and ...". THE PLANET
// DOES NOT SHARE IT. world/procPlanet.js (v3830) carries its own hash3 and its own valueNoise3, and they are a
// different function in three separate ways:
//
//   this file            world/procPlanet.js        consequence
//   ------------------   ------------------------   -------------------------------------------------------
//   imul + ADD mixing    raw multiply + XOR         different avalanche; different values everywhere
//   fade = 3t^2 - 2t^3   fade = 6t^5 - 15t^4 + 10t^3  cubic vs QUINTIC -- a different surface between lattice
//                                                   points, and a continuous second derivative in one of them
//   fbm(x,y,z,seed,oct)  fbm3(x,y,z,{gain,lac,..})  fixed gain 0.5 / lacunarity 2 vs configurable
//
// Sampled over 360 lattice points the two hashes agree on ZERO of them -- not "mostly the same with drift", a
// different function. So the tree has TWO value noises, deliberately, and a third noise besides in GLSL
// (shaders/ashimaNoise.js, v4177). The comments claiming otherwise are now corrected at their source.
//
// *** WHICH MEANS THE OBVIOUS CLEANUP IS THE ONE THING NOT TO DO. *** Merging these two onto one hash would
// change the height field of every planet, the displacement of every asteroid, and every texel of every baked
// surface -- silently, since nothing downstream asserts a colour. That is not a tidy-up, it is a reskin of the
// universe wearing a refactor's commit message. render/valueNoise-selfcheck.mjs PINS THE DISAGREEMENT: if some
// later round unifies them, the gate fails and says why. The right time to converge them is a round that means
// to change how planets look and says so in its changelog.
//
// PURE: no Three, no GL, no DOM, no Math.random. Gated headless in render/valueNoise-selfcheck.mjs.

// Deterministic hash of an integer lattice cell -> [0, 1). Integer math only, so it is identical across engines.
export function hash3(ix, iy, iz, seed) {
    let h = (Math.imul(ix | 0, 374761393) + Math.imul(iy | 0, 668265263) + Math.imul(iz | 0, 1610612741) + Math.imul(seed | 0, 362437)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h = (h ^ (h >>> 16)) >>> 0;
    return h / 4294967296;
}

const fade = (t) => t * t * (3 - 2 * t);   // smoothstep fade for value-noise interpolation
export const lerp = (a, b, t) => a + (b - a) * t;

// Trilinear value noise at a 3D point, in [0, 1].
export function valueNoise(x, y, z, seed) {
    const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
    const fx = fade(x - ix), fy = fade(y - iy), fz = fade(z - iz);
    const c = (dx, dy, dz) => hash3(ix + dx, iy + dy, iz + dz, seed);
    const x00 = lerp(c(0, 0, 0), c(1, 0, 0), fx), x10 = lerp(c(0, 1, 0), c(1, 1, 0), fx);
    const x01 = lerp(c(0, 0, 1), c(1, 0, 1), fx), x11 = lerp(c(0, 1, 1), c(1, 1, 1), fx);
    return lerp(lerp(x00, x10, fy), lerp(x01, x11, fy), fz);
}

// Fractal Brownian motion in [0, 1]: octaves of value noise, lacunarity 2, gain 0.5, normalised by amplitude sum.
export function fbm(x, y, z, seed, octaves) {
    let sum = 0, amp = 0.5, norm = 0, f = 1;
    for (let o = 0; o < octaves; o++) {
        sum += amp * valueNoise(x * f, y * f, z * f, seed + o * 1013);
        norm += amp; amp *= 0.5; f *= 2;
    }
    return sum / norm;
}
