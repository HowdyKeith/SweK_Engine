// WebGLEngine/ev/spriteHullCore-selfcheck.mjs — v3828
//
// Answer key for the sprite-loft geometry, on synthetic silhouettes with known shapes: the mask threshold, the
// centroid, the radial ring, and the normalize step's three promises -- centered on origin, scaled to size, and
// NOSE ALONG +X (an up-pointing sprite must come out pointing +X, because the hull convention is +X-forward).

import { alphaMask, centroid, radialSilhouette, signedArea, normalizeSilhouette, silhouetteToHull } from "./spriteHullCore.js";

let pass = 0, fail = 0;
const near = (a, b, e = 1e-6) => Math.abs(a - b) <= e;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error("  FAIL  " + m); } };

// build an RGBA frame from a predicate fill(x,y)->bool (alpha 255/0)
function frame(w, h, fill) {
    const rgba = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const o = (y * w + x) * 4; rgba[o] = rgba[o + 1] = rgba[o + 2] = 255; rgba[o + 3] = fill(x, y) ? 255 : 0; }
    return rgba;
}

// 1) MASK -- alpha over threshold only.
{
    const rgba = new Uint8ClampedArray([0, 0, 0, 10, 0, 0, 0, 40, 0, 0, 0, 255, 0, 0, 0, 0]);
    const m = alphaMask(rgba, 4, 1, 32);
    ok(m[0] === 0 && m[1] === 1 && m[2] === 1 && m[3] === 0, "alphaMask thresholds on alpha");
}

// 2) CENTROID -- a centered filled disk centroids at the middle; empty -> frame center, count 0.
{
    const W = 41, H = 41, cx = 20, cy = 20, R = 12;
    const disk = frame(W, H, (x, y) => (x - cx) ** 2 + (y - cy) ** 2 <= R * R);
    const c = centroid(alphaMask(disk, W, H), W, H);
    ok(near(c.cx, cx, 0.5) && near(c.cy, cy, 0.5) && c.count > 100, "centroid of centered disk is centered");
    ok(centroid(new Uint8Array(9), 3, 3).count === 0, "empty mask -> count 0");
}

// 3) RADIAL RING -- for a disk every sampled radius is ~equal (a circle).
{
    const W = 61, H = 61, cx = 30, cy = 30, R = 20;
    const disk = alphaMask(frame(W, H, (x, y) => (x - cx) ** 2 + (y - cy) ** 2 <= R * R), W, H);
    const ring = radialSilhouette(disk, W, H, 48);
    const rad = ring.map(([x, y]) => Math.hypot(x - cx, y - cy));
    const mn = Math.min(...rad), mx = Math.max(...rad);
    ok(mx - mn <= 2.5 && mn > R - 3, "disk radial ring is ~constant radius (circle)");
}

// 4) NOSE -> +X and CENTERING/SCALE -- an UP-POINTING triangle (apex at small y) must normalize so its apex is
//    the max +X point, the polygon is centered on the origin, and its extent equals size.
{
    const W = 60, H = 60;
    // triangle: apex at top (y small, x center), base at bottom -- points "up" like ES art
    const tri = alphaMask(frame(W, H, (x, y) => { const half = (y / H) * 22; return y >= 6 && Math.abs(x - 30) <= half; }), W, H);
    const ring = radialSilhouette(tri, W, H, 72);
    const norm = normalizeSilhouette(ring, W, H, 2.2);
    // apex = the +X-most vertex; it should be near x = +extent/2 and near y = 0 (on the nose axis)
    let apex = norm.points[0]; for (const p of norm.points) if (p.x > apex.x) apex = p;
    ok(apex.x > 0.6 && Math.abs(apex.y) < 0.35, "up-pointing sprite -> nose at +X on the axis");
    // centered on origin
    let sx = 0, sy = 0; for (const p of norm.points) { sx += p.x; sy += p.y; } sx /= norm.points.length; sy /= norm.points.length;
    ok(Math.abs(sx) < 0.35 && Math.abs(sy) < 0.2, "normalized outline is centered on origin");
    // scaled to size
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const p of norm.points) { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y); }
    ok(near(Math.max(maxX - minX, maxY - minY), 2.2, 0.01), "normalized to target size");
    ok(signedArea(norm.points) > 0, "outline wound CCW for THREE.Shape");
}

// 5) FULL PIPELINE -- empty art -> null (keep procedural); real art -> a usable polygon.
{
    ok(silhouetteToHull(new Uint8ClampedArray(20 * 20 * 4), 20, 20) === null, "empty sprite -> null (procedural fallback)");
    const W = 50, H = 50;
    const ship = frame(W, H, (x, y) => Math.abs(x - 25) <= (H - y) / 3 + 2 && y >= 5 && y <= 44);
    const hull = silhouetteToHull(ship, W, H, { rays: 48 });
    ok(hull && hull.points.length >= 12 && near(hull.extent, 2.2, 0.01), "real sprite -> centered unit +X hull polygon");
}

if (fail) { console.error(`\nspriteHullCore-selfcheck: ${pass} pass, ${fail} FAIL`); process.exit(1); }
console.log(`spriteHullCore-selfcheck: all ${pass} pass`);
