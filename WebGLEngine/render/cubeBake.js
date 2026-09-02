// WebGLEngine/render/cubeBake.js — v4327 (the cube-bake geometry, lifted out of the skybox that owned it)
//
// THE SIX-FACE CUBE, AND NOTHING ELSE. Given a face index and a texel, this hands back the unit DIRECTION that
// texel looks along. That is the whole module, and it is the hinge the seamless property turns on: if every
// texel's colour is a pure function of its direction, then two texels that meet at a face edge are handed the
// same direction and get the same colour, so the six faces agree there BY CONSTRUCTION rather than by a fudge.
//
// ---- *** WHY THIS IS ITS OWN FILE, WHEN IT WAS WORKING FINE WHERE IT WAS *** ------------------------------
//
// It lived in render/nebulaSkybox.js (v3833) because the skybox needed it first. Then proceduralStar.js (v3835)
// imported it, then planetSurface.js (v3842), and two selfchecks besides. FOUR MODULES REACHED INTO A BACKDROP
// GENERATOR FOR GEOMETRY THAT IS NOT ABOUT BACKDROPS -- and the star and the planet's surface are not backdrops.
// Nothing was broken by that; the import graph simply said something false about the tree, which is that cube
// geometry belongs to the sky. A reader chasing faceTexelDir had to know the sky owned it, and a reader deleting
// the skybox would have taken the star and the planet with it.
//
// So this is a MOVE, not a rewrite: the bytes below are the bytes that were in nebulaSkybox.js, and the gate
// that proves it (render/cubeBake-selfcheck.mjs) carries the digests measured BEFORE the move. A refactor that
// changes one texel of a shipped planet is not a refactor.
//
// PURE: no Three, no GL, no DOM, no Math.random. Gated headless in render/cubeBake-selfcheck.mjs.

// The six cubemap faces, in GL order. Each maps (u, v) in [-1, 1] to a 3D direction (pre-normalisation).
export const FACES = [
    (u, v) => [1, -v, -u],   // +X
    (u, v) => [-1, -v, u],   // -X
    (u, v) => [u, 1, v],     // +Y
    (u, v) => [u, -1, -v],   // -Y
    (u, v) => [u, -v, 1],    // +Z
    (u, v) => [-u, -v, -1],  // -Z
];

// Unit direction for texel (i, j) of face `f` in a size x size face. Texel CENTRES, so (i+0.5)/size.
export function faceTexelDir(f, i, j, size) {
    const u = ((i + 0.5) / size) * 2 - 1;
    const v = ((j + 0.5) / size) * 2 - 1;
    const d = FACES[f](u, v);
    const inv = 1 / Math.hypot(d[0], d[1], d[2]);
    return [d[0] * inv, d[1] * inv, d[2] * inv];
}

// Bake all six faces into ONE OR MORE targets from a single walk. `channelCounts` gives the channels per target
// (e.g. [3] for RGB, or [3, 3, 1, 1] for albedo/normal/roughness/height); `sample(dir, f, i, j)` returns one
// array per target, each of values in [0, 1]. The result is { size, targets: [[face x6], ...] } with each face a
// Uint8ClampedArray of size*size*channels bytes.
//
// *** WHY THE MULTI-TARGET FORM IS THE PRIMITIVE AND THE SINGLE-TARGET ONE IS THE WRAPPER. *** v4333 shipped
// only bakeCubemap(size, channels, shade) and it had exactly ONE consumer -- the skybox it was lifted from --
// which is the "written for one caller" shape this tree keeps flagging in other people's code. The reason the
// other two did not adopt it is worth recording rather than fixing quietly: proceduralStar fits and simply had
// not been changed, but planetSurface writes FOUR targets from ONE surfaceSample per texel, and a single-target
// helper would have made it call that sample four times -- roughly four times the work, to look tidier. THAT IS
// A HELPER MAKING THE CALLER WORSE, and it is why the honest generalisation is the number of targets rather
// than the number of callers. One walk, one sample per texel, N buffers written.
export function bakeCubemapTargets(size, channelCounts, sample) {
    const targets = channelCounts.map(() => []);
    for (let f = 0; f < 6; f++) {
        const bufs = channelCounts.map((ch) => new Uint8ClampedArray(size * size * ch));
        for (let j = 0; j < size; j++) {
            for (let i = 0; i < size; i++) {
                const out = sample(faceTexelDir(f, i, j, size), f, i, j);
                const k = j * size + i;
                for (let t = 0; t < channelCounts.length; t++) {
                    const ch = channelCounts[t], buf = bufs[t], v = out[t], o = k * ch;
                    for (let c = 0; c < ch; c++) buf[o + c] = v[c] * 255;
                }
            }
        }
        for (let t = 0; t < targets.length; t++) targets[t].push(bufs[t]);
    }
    return { size, targets };
}

// The single-target case, which is what the skybox and the star want: six faces of `channels` bytes per texel.
// A thin wrapper over the walk above rather than a second copy of it -- the answer key in
// render/cubeBake-selfcheck.mjs is what proves the wrapper did not change a byte.
export function bakeCubemap(size, channels, shade) {
    const { targets } = bakeCubemapTargets(size, [channels], (dir, f, i, j) => [shade(dir, f, i, j)]);
    return { size, faces: targets[0] };
}
