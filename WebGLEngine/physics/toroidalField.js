// WebGLEngine/physics/toroidalField.js — v3837 (a toroidal deform buffer: wave sim on a wraparound grid)
//
// The parked idea from Noniv/snowflow_demo finally gets a consumer. A TOROIDAL BUFFER is a field addressed with
// wraparound (modulo) indexing, so it has no edges: a texel leaving one side re-enters the other, the domain is
// periodic, and a moving read window costs nothing -- you shift the read origin instead of copying the buffer.
// Here that buffer runs a real 2D wave equation, and because a wrapped N x N grid IS a torus topologically, it
// maps onto a torus surface with no seam -- a fluid/wave sim on a curved surface, for free.
//
// PURE: no GL, no Three, no DOM. The field is a flat Float64Array; every neighbour lookup wraps. The front-door
// page (toroidal-wave.html) runs this on the CPU and displaces a Three torus by it -- the GPU ping-pong-texture
// version is the rig's optimisation, this is the concept, fully gated. Gated in physics/toroidalField-selfcheck.mjs.

// Wrap an index into [0, N) toroidally: -1 -> N-1, N -> 0, N+3 -> 3.
export function wrapIndex(i, N) { return ((i % N) + N) % N; }

// Flat array index for grid cell (x, y) with wraparound on both axes.
export function idx(x, y, N) { return wrapIndex(y, N) * N + wrapIndex(x, N); }

// 5-point discrete Laplacian at (x, y) with WRAPAROUND neighbours -- the heart of the toroidal buffer. Dropping
// the wrap (clamping at the edge) is exactly what turns a seamless periodic domain back into a walled box.
export function laplacianAt(f, N, x, y) {
    return f[idx(x + 1, y, N)] + f[idx(x - 1, y, N)] + f[idx(x, y + 1, N)] + f[idx(x, y - 1, N)] - 4 * f[idx(x, y, N)];
}

// One leapfrog step of the 2D wave equation on the toroidal grid: next = 2*cur - prev + (c*dt)^2 * lap(cur), with
// optional velocity damping. Stability needs the CFL condition c*dt <= 1/sqrt(2) ~ 0.707 (so (c*dt)^2 <= 0.5);
// the default c=0.5, dt=1 sits safely inside it. Returns a fresh Float64Array.
export function stepWave(prev, cur, N, opts = {}) {
    const c = opts.c === undefined ? 0.5 : opts.c;
    const dt = opts.dt === undefined ? 1 : opts.dt;
    const damp = opts.damping === undefined ? 0 : opts.damping;
    const k = (c * dt) * (c * dt);
    const next = new Float64Array(N * N);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        const i = y * N + x;
        next[i] = (2 * cur[i] - prev[i] + k * laplacianAt(cur, N, x, y)) - damp * (cur[i] - prev[i]);
    }
    return next;
}

// Add a Gaussian bump (a "drop") centred at (cx, cy), wrapping toroidally so a drop near an edge spills across it.
export function splat(f, N, cx, cy, radius, amp) {
    const sigma = Math.max(radius / 2, 0.5), r2 = radius * radius;
    for (let dy = -radius; dy <= radius; dy++) for (let dx = -radius; dx <= radius; dx++) {
        const d2 = dx * dx + dy * dy;
        if (d2 > r2) continue;
        f[idx(cx + dx, cy + dy, N)] += amp * Math.exp(-d2 / (2 * sigma * sigma));
    }
    return f;
}

// The MOVING WINDOW WITHOUT A COPY: read the field at (x, y) offset by a scroll origin (ox, oy), wrapping. Scroll
// the origin to move the whole field under a fixed viewport; a full-period scroll returns exactly to identity.
export function readScrolled(f, N, ox, oy, x, y) { return f[idx(x + ox, y + oy, N)]; }

// Map a grid cell (u, v in [0,1)) onto a torus of major radius R and minor radius r. u and v wrap seamlessly, so
// the toroidal grid tiles the torus surface with no seam -- the natural curved, periodic home for this buffer.
export function torusPoint(u, v, R, r) {
    const a = u * 2 * Math.PI, b = v * 2 * Math.PI, cr = R + r * Math.cos(b);
    return [cr * Math.cos(a), r * Math.sin(b), cr * Math.sin(a)];
}
