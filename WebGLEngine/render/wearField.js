// WebGLEngine/render/wearField.js — v3838 (a persistent toroidal accumulation buffer)
//
// This is the snowflow toroidal DEFORM BUFFER proper -- the persistent half the stateless wave (v3837) could not
// do. A world-locked field addressed by wraparound so an N x N buffer covers a `size` x `size` window that FOLLOWS
// a moving reference (a ship, the camera) without ever being copied: a world point maps to a texel by
// floor(world/cell) mod N, so the buffer tiles the world with period `size`. Wear/scorch/visibility ACCUMULATES
// into it over frames and DECAYS -- unlike the wave, which recomputes from scratch each step.
//
// The one subtle, bug-prone piece -- and the reason this is worth gating rather than eyeballing -- is the
// SCROLL-AND-CLEAR: when the window recenters on the moved reference, a texel whose in-window world position jumps
// to a different tile is NEWLY EXPOSED and holds stale data for a world position no longer shown; it must be
// zeroed, while every texel still in the window keeps its accumulation. Clearing the whole buffer loses the trail;
// clearing nothing shows ghosts of world you have left and come back to. This computes exactly the newly-exposed
// set. snowflow does it on the GPU in one pass; the LOGIC is identical and lives here, pure and gated. No GL, no
// Three, no DOM. Gated in render/wearField-selfcheck.mjs.

export function wrapIndex(i, N) { return ((i % N) + N) % N; }
export function cellSize(size, N) { return size / N; }

// The texel a world coordinate maps to on one axis -- floor(world/cell) folded toroidally. Center-independent:
// the buffer is a fixed toroidal tiling of the world, which is what lets the window move without a copy.
export function worldToTexelAxis(w, size, N) { return wrapIndex(Math.floor(w / cellSize(size, N)), N); }

// The unique world coordinate that texel `t` represents inside the current window [center - size/2, center +
// size/2). As the center moves, this shifts continuously until it crosses the window edge, where it jumps by
// `size` to the next tile -- and that jump is exactly a newly-exposed texel.
export function representativeWorldAxis(t, center, size, N) {
    const cell = cellSize(size, N), w0 = t * cell + cell * 0.5, lo = center - size * 0.5;
    return w0 + Math.ceil((lo - w0) / size) * size;
}

// The texel columns (per axis) that become NEWLY EXPOSED when the center moves from cOld to cNew: those whose
// representative world coordinate jumped to a different tile. These are the ones to zero on scroll.
export function newlyExposedAxis(cOld, cNew, size, N) {
    const out = [];
    for (let t = 0; t < N; t++) {
        if (Math.abs(representativeWorldAxis(t, cOld, size, N) - representativeWorldAxis(t, cNew, size, N)) > 1e-9) out.push(t);
    }
    return out;
}

// Zero every texel whose column OR row is newly exposed after the window recenters from (oldX,oldZ) to
// (newX,newZ). Texels still in the window keep their accumulated value -- that is the persistence.
export function scrollClear(buf, N, oldX, oldZ, newX, newZ, size) {
    const clrX = new Set(newlyExposedAxis(oldX, newX, size, N));
    const clrZ = new Set(newlyExposedAxis(oldZ, newZ, size, N));
    if (!clrX.size && !clrZ.size) return buf;
    for (let ty = 0; ty < N; ty++) {
        const rowExposed = clrZ.has(ty);
        for (let tx = 0; tx < N; tx++) if (rowExposed || clrX.has(tx)) buf[ty * N + tx] = 0;
    }
    return buf;
}

// Accumulate a Gaussian stamp at a WORLD position (wear, a scorch mark, a visibility ping). Adds, wrapping
// toroidally, so a stamp near a tile boundary spills across it. Optionally clamps to `max`.
export function splatWorld(buf, N, wx, wz, size, radius, amp, max = Infinity) {
    const cx = worldToTexelAxis(wx, size, N), cy = worldToTexelAxis(wz, size, N);
    const sigma = Math.max(radius / 2, 0.5), r2 = radius * radius;
    for (let dy = -radius; dy <= radius; dy++) for (let dx = -radius; dx <= radius; dx++) {
        const d2 = dx * dx + dy * dy;
        if (d2 > r2) continue;
        const i = wrapIndex(cy + dy, N) * N + wrapIndex(cx + dx, N);
        buf[i] = Math.min(max, buf[i] + amp * Math.exp(-d2 / (2 * sigma * sigma)));
    }
    return buf;
}

// Read the accumulated value at a world position.
export function sampleWorld(buf, N, wx, wz, size) { return buf[worldToTexelAxis(wz, size, N) * N + worldToTexelAxis(wx, size, N)]; }

// Fade the whole field toward zero by `rate` in [0,1] per call (wear healing, scorch cooling, fog forgetting).
export function decay(buf, rate) { const k = 1 - rate; for (let i = 0; i < buf.length; i++) buf[i] *= k; return buf; }
