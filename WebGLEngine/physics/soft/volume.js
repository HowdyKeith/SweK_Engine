// WebGLEngine/physics/soft/volume.js — v2562
//
// "what about the stefan banach-tarski paradox? i know it's been solved but what to point it out as a thing"
//
// IT IS NOT SOLVED. IT IS A THEOREM, AND IT IS TRUE.
//
// A solid ball can be cut into five pieces and reassembled, by rigid motions alone -- no stretching -- into two
// balls identical to the original. That is proved. It follows from the Axiom of Choice.
//
// The reason it does not destroy mathematics is the part worth pointing at: THE PIECES HAVE NO VOLUME. Not zero
// volume -- NO volume. They are non-measurable: no number can be assigned to them without contradiction. So
// volume is not violated. VOLUME WAS NEVER DEFINED ON THOSE PIECES TO BEGIN WITH.
//
// AND IT CANNOT HAPPEN HERE, FOR A STRUCTURAL REASON. Banach-Tarski needs uncountably many choices from
// uncountably many sets. Floats are COUNTABLE. Every set this engine can represent -- every particle bag, every
// voxel, every marched triangle -- is measurable by construction. THE PARADOX IS UNREACHABLE FROM A FINITE
// MACHINE. This engine gets volume conservation free, as a consequence of being unable to express the
// counterexample.
//
// WHICH IS EXACTLY WHY IT IS WORTH POINTING AT. v2538 claimed "the hybrid preserves volume, which the spring
// cannot do at any stiffness". Banach-Tarski is the sharpest possible statement that VOLUME IS AN ASSUMPTION YOU
// ARE ENTITLED TO, NOT A FACT ABOUT SHAPES. This engine is entitled to it because of floats. And it breaks
// volume constantly anyway -- not by paradox, BY DISCRETISATION. That part is measurable, so measure it.
//
// ---- WHAT THE MEASUREMENT SAYS (500 particles, two bones, 40 steps) -------------------------------------------
//
//     grid    mesh vol   field vol   error
//       16     0.59643     0.66095   -9.76%
//       24     0.62355     0.61412   +1.54%
//       32     0.63059     0.62847   +0.34%
//       48     0.65031     0.65999   -1.47%
//       64     0.66197     0.66303   -0.16%
//
// TWO THINGS, NEITHER COMFORTABLE.
//
// THE ERROR IS NOT MONOTONIC. 32 beats 48. Refining the grid is not reliably an improvement, so "use a finer
// grid" is not a fix, it is a coin toss with better odds.
//
// AND LOOK AT THE FIELD COLUMN. The "true" volume itself wanders -- 0.661, 0.614, 0.628, 0.660, 0.663 -- as the
// grid refines. THE SHAPE DID NOT CHANGE. THE MEASUREMENT DID. That is Banach-Tarski's lesson at a scale that can
// actually bite: volume is not a property of a shape, it is a property of A SHAPE AND A RULER. The paradox is the
// extreme case, where the pieces are so pathological that no ruler exists. This is the ordinary case: the ruler
// exists, and the answer depends on which one you pick.
//
// flesh.html marches at cells = 28 -- BETWEEN the +1.54% sample and the +0.34% one, in the band where the error
// CHANGES SIGN. So "the hybrid preserves volume" needs the question: compared to WHAT?
"use strict";

/**
 * Signed volume of a closed triangle mesh, by summing tetrahedra to the origin. Exact for any closed surface,
 * and no approximation is hiding in here -- if the mesh is closed, this is its volume.
 * @param {Float32Array|number[]} P flat positions, 9 floats per triangle
 */
export function meshVolume(P) {
    let v = 0;
    for (let i = 0; i < P.length; i += 9) {
        const ax = P[i], ay = P[i + 1], az = P[i + 2];
        const bx = P[i + 3], by = P[i + 4], bz = P[i + 5];
        const cx = P[i + 6], cy = P[i + 7], cz = P[i + 8];
        v += (ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx)) / 6;
    }
    return Math.abs(v);
}

/**
 * The volume the FIELD claims, by counting cells below the isolevel. This is the "ruler" the mesh is compared
 * against -- and the point of the exercise is that IT IS ALSO A RULER, not the truth.
 */
export function fieldVolume(field, cellSize, iso = 0) {
    let inside = 0;
    for (let i = 0; i < field.length; i++) if (field[i] < iso) inside++;
    return inside * cellSize * cellSize * cellSize;
}

/**
 * Is a mesh closed? An unclosed mesh has no volume in the only sense that matters, and meshVolume() would
 * cheerfully return a number for it anyway. Counts directed edges: in a closed manifold every edge appears
 * exactly twice, once in each direction.
 * @returns {{closed: boolean, boundaryEdges: number, edges: number}}
 */
export function meshClosure(P) {
    const key = (a, b) => a + ":" + b;
    const seen = new Map();
    const vid = new Map();
    const idOf = (x, y, z) => {
        // quantise to fuse the shared corners marching cubes emits per-triangle
        const k = Math.round(x * 1e5) + "," + Math.round(y * 1e5) + "," + Math.round(z * 1e5);
        if (!vid.has(k)) vid.set(k, vid.size);
        return vid.get(k);
    };
    for (let i = 0; i < P.length; i += 9) {
        const a = idOf(P[i], P[i + 1], P[i + 2]);
        const b = idOf(P[i + 3], P[i + 4], P[i + 5]);
        const c = idOf(P[i + 6], P[i + 7], P[i + 8]);
        for (const [u, v] of [[a, b], [b, c], [c, a]]) seen.set(key(u, v), (seen.get(key(u, v)) || 0) + 1);
    }
    let boundary = 0;
    for (const [k, n] of seen) {
        const [u, v] = k.split(":");
        if (n !== (seen.get(key(v, u)) || 0)) boundary++;
    }
    return { closed: boundary === 0, boundaryEdges: boundary, edges: seen.size };
}
