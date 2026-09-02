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

// Bake all six faces of a cubemap from a per-direction shading function. `shade(dir, f, i, j)` returns an array
// of `channels` values in [0, 1]; the result is six Uint8ClampedArrays of size*size*channels bytes.
//
// This is the loop that nebulaSkybox, proceduralStar and planetSurface each wrote out by hand. It is offered
// here rather than forced on them: the three bakes differ in what they write per texel (RGB, RGB, and four
// separate targets), and the two that fit are the two that use it.
export function bakeCubemap(size, channels, shade) {
    const faces = [];
    for (let f = 0; f < 6; f++) {
        const buf = new Uint8ClampedArray(size * size * channels);
        for (let j = 0; j < size; j++) {
            for (let i = 0; i < size; i++) {
                const c = shade(faceTexelDir(f, i, j, size), f, i, j);
                const o = (j * size + i) * channels;
                for (let k = 0; k < channels; k++) buf[o + k] = c[k] * 255;
            }
        }
        faces.push(buf);
    }
    return { size, faces };
}
