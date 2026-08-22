// WebGLEngine/render/fogOfWar.js — v3839 (fog of war: line-of-sight FOV + a toroidal explored-memory buffer)
//
// The last of the wearField family: point the persistent toroidal buffer at VISIBILITY instead of scorch. Two
// layers. The current field of view is recomputed every frame by RECURSIVE SHADOWCASTING (Bergstrom's 8-octant
// algorithm) so walls actually occlude -- a cell behind a wall is dark, and vision does not leak diagonally
// through a corner. The EXPLORED memory is the toroidal wearField buffer (v3838): a cell seen once is remembered
// (dim) until the viewer travels far enough that it scrolls out of the window and is forgotten -- which is why a
// fixed buffer that follows the viewer is the right structure, not an infinite map.
//
// Three states per cell: 0 unseen, 1 explored-but-not-visible (remembered), 2 currently visible. PURE: no GL, no
// Three, no DOM. Reuses wearField's addressing so there is one owner of the wraparound math. Gated in
// render/fogOfWar-selfcheck.mjs.

import { worldToTexelAxis, wrapIndex } from "./wearField.js";

// One cell per world unit, so the explored buffer's `size` equals its resolution N.
export function fowTexel(wx, wy, N) { return worldToTexelAxis(wy, N, N) * N + worldToTexelAxis(wx, N, N); }

// The eight octant transforms (xx, xy, yx, yy) recursive shadowcasting scans.
const OCT = [[1, 0, 0, 1], [0, 1, 1, 0], [0, -1, 1, 0], [-1, 0, 0, 1], [-1, 0, 0, -1], [0, -1, -1, 0], [0, 1, -1, 0], [1, 0, 0, -1]];

function castLight(cx, cy, row, startSlope, endSlope, radius, xx, xy, yx, yy, vis, isOpaque) {
    if (startSlope < endSlope) return;
    let start = startSlope, newStart = 0;
    for (let i = row; i <= radius; i++) {
        let dx = -i - 1, dy = -i, blocked = false;
        while (dx <= 0) {
            dx++;
            const X = cx + dx * xx + dy * xy, Y = cy + dx * yx + dy * yy;
            const lSlope = (dx - 0.5) / (dy + 0.5), rSlope = (dx + 0.5) / (dy - 0.5);
            if (start < rSlope) continue;
            if (endSlope > lSlope) break;
            if (dx * dx + dy * dy <= radius * radius) vis.add(X + "," + Y);
            if (blocked) {
                if (isOpaque(X, Y)) { newStart = rSlope; continue; }
                blocked = false; start = newStart;
            } else if (isOpaque(X, Y) && i < radius) {
                blocked = true;
                castLight(cx, cy, i + 1, start, lSlope, radius, xx, xy, yx, yy, vis, isOpaque);
                newStart = rSlope;
            }
        }
        if (blocked) break;
    }
}

// The set of world cells visible from (cx, cy) within `radius`, respecting opaque cells. isOpaque(x, y) -> bool.
// Returns a Set of "x,y" strings. The origin is always visible; walls occlude; no diagonal corner leak.
export function computeFOV(cx, cy, radius, isOpaque) {
    const vis = new Set([cx + "," + cy]);
    for (const m of OCT) castLight(cx, cy, 1, 1.0, 0.0, radius, m[0], m[1], m[2], m[3], vis, isOpaque);
    return vis;
}

// Mark every currently-visible cell as explored in the toroidal memory buffer (1 = explored). Monotone within the
// window: once set it stays, until scrollClear forgets it when it leaves the window.
export function markExplored(explored, N, visSet) {
    for (const key of visSet) { const c = key.split(","), wx = +c[0], wy = +c[1]; explored[fowTexel(wx, wy, N)] = 1; }
    return explored;
}

// The fog state of a world cell: 2 visible, 1 explored (remembered), 0 unseen.
export function fogState(explored, N, visSet, wx, wy) {
    if (visSet.has(wx + "," + wy)) return 2;
    return explored[fowTexel(wx, wy, N)] ? 1 : 0;
}
