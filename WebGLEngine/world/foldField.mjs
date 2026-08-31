// WebGLEngine/world/foldField.mjs -- v4239
//
// BEND A STREAMED WORLD WITHOUT TOUCHING ITS DATA, AND THE ONE RULE THAT MAKES IT SAFE.
//
// The idea is Makio64/dreamfold (MIT): fold a photorealistic city map in real time, Inception-style. Its
// author's summary is the whole technique -- "it is all vertices, so we can do whatever we want with it".
// Nothing is regenerated and no source data is edited; the geometry that streamed in is bent on the way to
// the screen.
//
// *** WHAT THIS ROUND DOES NOT TAKE, AND WHY IT WAS DECIDED BEFORE ANY CODE. *** dreamfold's geometry is
// Google's photorealistic 3D tiles through Cesium Ion. The repository's MIT licence covers its own code and
// says nothing about the tiles it renders, which need an API key and arrive under someone else's terms --
// the #82 ENCUMBERED shape exactly: a permissive licence on code that is worthless without data granted
// under different terms. No Cesium, no tile pipeline, no API key.
//
// *** AND THE BACKLOG ITEM'S OTHER GUESS WAS WRONG, WHICH IS WORTH MORE THAN THE GUESS. *** It said the
// thing the tree genuinely lacks is "a 3D Tiles streaming loader -- level-of-detail geometry arriving over
// the network and being swapped in while the camera moves". The tree HAS that, in two pieces that were
// already there:
//
//   render/screenSpaceError.js (v4150)  -- the real screen-space-error metric, geometric error, level
//                                          selection, AND edgeLevel(), the crack-free edge rule
//   world/ChunkStreamer.js              -- camera-following load and unload
//
// So the only part of dreamfold left standing is the fold itself, and asking what it costs a system that
// already has LOD turns out to be the interesting question.
//
// ---- THE RULE: A FOLD MUST BE A PURE FUNCTION OF WORLD POSITION ---------------------------------------------
//
// *** TWO CHUNKS MESHED AT DIFFERENT DETAIL LEVELS MEET ALONG A SHARED EDGE, AND THEY ONLY MEET BECAUSE
// edgeLevel() MADE THEM AGREE THERE. *** That agreement is in WORLD SPACE: the coarse chunk and the fine
// chunk put vertices at the same world points along the seam. A deformation preserves it if and only if it
// maps a world point to a world point and consults nothing else. The instant a fold reads anything that
// differs between the two chunks -- a chunk-local coordinate, a vertex index, a per-chunk seed, a normal
// computed at a different resolution -- the two sides of the seam move apart and a crack opens that is
// invisible in the fold's own preview and obvious the moment the camera crosses a chunk boundary.
//
// That is not an argument, it is measurable, and the gate measures it: the same fold applied purely leaves a
// seam error of exactly zero, and the same fold with one chunk-local term in it opens a gap of up to a third
// of a chunk. The rule is enforced by construction here -- a fold is a function of (x, y, z) and receives
// nothing else -- and probed by isPurePosition() so a caller who reaches for a closure over something else
// is caught rather than trusted.
"use strict";

const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);

/** smoothstep, matching the one every shader in this tree uses. */
export function smoothstep(e0, e1, x) {
    const t = clamp((x - e0) / (e1 - e0 || 1e-12), 0, 1);
    return t * t * (3 - 2 * t);
}

/**
 * THE FOLD: rotate the world about a hinge line, by an angle that ramps up with distance past it.
 *
 * This is the Inception bend. Everything before `start` is untouched; between `start` and `start + width`
 * the rotation eases in; past that the world is fully turned. Because the angle depends only on how far a
 * point is along `axis`, and the rotation is rigid at every fixed distance, LENGTHS ALONG THE HINGE ARE
 * PRESERVED and the fold does not tear -- it is a bend, not a stretch.
 *
 * @param origin  a point on the hinge line
 * @param axis    the direction the ramp runs along, unit
 * @param hinge   the axis rotated about, unit and perpendicular to `axis`
 */
export function bendFold({ origin = [0, 0, 0], axis = [1, 0, 0], hinge = [0, 0, 1],
                           start = 0, width = 50, angle = Math.PI / 2 } = {}) {
    const f = (p) => {
        const d = [p[0] - origin[0], p[1] - origin[1], p[2] - origin[2]];
        const along = d[0] * axis[0] + d[1] * axis[1] + d[2] * axis[2];
        const t = smoothstep(start, start + width, along);
        const a = t * angle;
        if (a === 0) return [p[0], p[1], p[2]];
        // Rodrigues about `hinge`, applied to the offset from the origin
        const ca = Math.cos(a), sa = Math.sin(a);
        const k = hinge;
        const kd = k[0] * d[0] + k[1] * d[1] + k[2] * d[2];
        const cx = [k[1] * d[2] - k[2] * d[1], k[2] * d[0] - k[0] * d[2], k[0] * d[1] - k[1] * d[0]];
        return [
            origin[0] + d[0] * ca + cx[0] * sa + k[0] * kd * (1 - ca),
            origin[1] + d[1] * ca + cx[1] * sa + k[1] * kd * (1 - ca),
            origin[2] + d[2] * ca + cx[2] * sa + k[2] * kd * (1 - ca),
        ];
    };
    f.kind = "bend";
    return f;
}

/** The identity fold, which every check that needs a control uses. */
export const noFold = Object.assign((p) => [p[0], p[1], p[2]], { kind: "none" });

/**
 * Apply a fold to a flat XYZ vertex buffer, in place or into `out`.
 * Nothing here knows which chunk the vertices came from, which is the point.
 */
export function applyFold(positions, fold, out = null) {
    const dst = out || positions;
    for (let i = 0; i < positions.length; i += 3) {
        const q = fold([positions[i], positions[i + 1], positions[i + 2]]);
        dst[i] = q[0]; dst[i + 1] = q[1]; dst[i + 2] = q[2];
    }
    return dst;
}

/**
 * *** IS THIS FOLD ACTUALLY A PURE FUNCTION OF POSITION? *** Ask it the same point repeatedly, interleaved
 * with other points and in different orders, and require the same answer every time.
 *
 * NARROW ON PURPOSE, and the limit is the honest part: this catches a fold that carries state, counts calls,
 * or closes over a mutable per-chunk value -- which is what a caller reaching for a chunk-local term
 * actually writes. It CANNOT catch a fold that reads a stable global, because from the outside that IS a
 * function of position. A gate cannot see a closure; what it can see is whether the answer moves.
 */
export function isPurePosition(fold, probes = null) {
    const pts = probes || [[0, 0, 0], [13, -4, 7], [-60, 2, 31], [120, 8, -45], [5.5, 0.25, 5.5]];
    const first = pts.map((p) => fold(p));
    // Interleaved, so a fold that answers a CONSECUTIVE repeat correctly -- a memo keyed on the last
    // input -- is still caught. That interleaving is DEFENSIVE: the gate reports that removing it changes no
    // number, because re-asking each point after all the others already breaks a history-dependent fold.
    for (let round = 0; round < 3; round++) {
        for (let i = pts.length - 1; i >= 0; i--) {
            for (const other of pts) fold(other);
            const again = fold(pts[i]);
            for (let c = 0; c < 3; c++) {
                if (Math.abs(again[c] - first[i][c]) > 1e-12) {
                    return { pure: false, at: pts[i], expected: first[i], got: again };
                }
            }
        }
    }
    return { pure: true };
}

/**
 * The seam between two chunks: how far apart do points that COINCIDED before the fold end up after it?
 *
 * `edgeA` and `edgeB` are the two chunks' vertices along their shared edge, already agreed in world space --
 * which is what edgeLevel() in render/screenSpaceError.js exists to arrange. A fold that is a pure position
 * map leaves this at exactly zero, because it maps equal inputs to equal outputs and that is the whole of
 * the argument.
 */
export function seamError(edgeA, edgeB, foldA, foldB = foldA) {
    let worst = 0;
    const n = Math.min(edgeA.length, edgeB.length);
    for (let i = 0; i < n; i += 3) {
        const a = foldA([edgeA[i], edgeA[i + 1], edgeA[i + 2]]);
        const b = foldB([edgeB[i], edgeB[i + 1], edgeB[i + 2]]);
        worst = Math.max(worst, Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]));
    }
    return worst;
}

/**
 * *** THE MISTAKE, WRITTEN OUT SO IT CAN BE MEASURED RATHER THAN WARNED ABOUT. *** A fold that scales its
 * ramp by a CHUNK-LOCAL coordinate -- the obvious thing to reach for when the fold is authored per chunk --
 * is a different function in each chunk, so the two sides of a seam no longer agree. It looks correct in any
 * single-chunk preview.
 */
export function chunkLocalFold(base, chunkOrigin, chunkSize) {
    const f = (p) => {
        const local = (p[0] - chunkOrigin[0]) / chunkSize;      // 0..1 WITHIN THIS CHUNK, and that is the bug
        const q = base(p);
        return [q[0], q[1] + local * 8.0, q[2]];
    };
    f.kind = "chunkLocal";
    return f;
}

/** How much does a fold move a point? Used to say a control fold is doing something at all. */
export const displacement = (fold, p) => {
    const q = fold(p);
    return Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]);
};
