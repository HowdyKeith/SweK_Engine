// tools/render/render.js
//
// A headless deterministic renderer, and the harness that lets peers split a frame between them. This is the thing the
// whole lockstep story was building toward: if a render is deterministic, then slicing it across machines is not an
// approximation you have to blend at the seams -- it is exact. Each peer renders its band in GLOBAL pixel coordinates,
// the bands are stacked, and the result is bit-for-bit the same image a single machine would have produced alone. No
// boundary data is exchanged between peers; determinism does the stitching. And any peer's slice can be re-rendered by
// any other peer and checked hash-for-hash, so a corrupted or dishonest slice is caught, not trusted.
//
// The renderer is a small raytracer -- a few spheres, one light, Lambert shading -- written in add/subtract/multiply/
// divide and square root only. No trig, no fractional powers. So the framebuffer is cross-architecture bit-identical,
// which is exactly what makes an x86 peer's band fit flush against an ARM peer's band.

const SPHERES = [
    { c: [-0.6, 0.0, 3.0], r: 0.80, alb: 0.90 },
    { c: [0.7, 0.2, 4.0], r: 1.00, alb: 0.70 },
    { c: [0.0, -1.2, 3.5], r: 0.60, alb: 0.85 },
];
const L = (() => { const m = Math.sqrt(3); return [-1 / m, 1 / m, -1 / m]; })();   // fixed light direction, normalized

// Shade one pixel by its GLOBAL coordinates (px,py) in a WxH frame. Pure sqrt-only.
export function shadePixel(px, py, W, H) {
    const aspect = W / H;
    const u = ((px + 0.5) / W * 2 - 1) * aspect;
    const v = -((py + 0.5) / H * 2 - 1);
    let dx = u, dy = v, dz = 1.5; const dm = Math.sqrt(dx * dx + dy * dy + dz * dz); dx /= dm; dy /= dm; dz /= dm;
    let best = 1e9, hit = -1;
    for (let i = 0; i < SPHERES.length; i++) {
        const s = SPHERES[i], ocx = -s.c[0], ocy = -s.c[1], ocz = -s.c[2];
        const b = 2 * (dx * ocx + dy * ocy + dz * ocz);
        const cc = ocx * ocx + ocy * ocy + ocz * ocz - s.r * s.r;
        const disc = b * b - 4 * cc;
        if (disc >= 0) { const t = (-b - Math.sqrt(disc)) / 2; if (t > 0.001 && t < best) { best = t; hit = i; } }
    }
    if (hit < 0) return 0.05;
    const s = SPHERES[hit], hx = dx * best, hy = dy * best, hz = dz * best;
    let nx = hx - s.c[0], ny = hy - s.c[1], nz = hz - s.c[2]; const nm = Math.sqrt(nx * nx + ny * ny + nz * nz); nx /= nm; ny /= nm; nz /= nm;
    let d = nx * L[0] + ny * L[1] + nz * L[2]; if (d < 0) d = 0;
    let inten = 0.1 + 0.9 * d * s.alb; if (inten > 1) inten = 1;
    return inten;
}

// Render a rectangular region [x0,x1) x [y0,y1) of a WxH frame -- pixels shaded at their GLOBAL positions.
export function renderRegion(x0, y0, x1, y1, W, H) {
    const w = x1 - x0, h = y1 - y0, buf = new Float64Array(w * h);
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) buf[(y - y0) * w + (x - x0)] = shadePixel(x, y, W, H);
    return buf;
}
export function renderWhole(W, H) { return renderRegion(0, 0, W, H, W, H); }

// Split a frame into nSlices horizontal bands -- the work each peer takes.
export function sliceRows(H, nSlices) {
    const bands = [];
    for (let i = 0; i < nSlices; i++) bands.push([Math.floor(i * H / nSlices), Math.floor((i + 1) * H / nSlices)]);
    return bands;
}

// Distributed render: each band rendered independently (a peer), then stacked. No inter-band communication.
export function distributedRender(W, H, nSlices) {
    const full = new Float64Array(W * H);
    for (const [y0, y1] of sliceRows(H, nSlices)) {
        const tile = renderRegion(0, y0, W, y1, W, H);                       // one peer's slice
        for (let y = y0; y < y1; y++) for (let x = 0; x < W; x++) full[y * W + x] = tile[(y - y0) * W + x];
    }
    return full;
}

// A tiny order-sensitive checksum of a framebuffer -- stand-in for the fingerprint hash, enough to compare slices.
export function frameSum(buf) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < buf.length; i++) { const q = Math.round(buf[i] * 1e6); h ^= (q + i) >>> 0; h = Math.imul(h, 16777619) >>> 0; }
    return h >>> 0;
}
