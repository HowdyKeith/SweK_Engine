// WebGLEngine/ev/spriteHullCore.js — v3828 (Long Silence, sprite-lofted hulls)
//
// TURN A TOP-DOWN SHIP SPRITE INTO A 3D HULL OUTLINE, the part with no canvas and no Three.js in it so it can be
// pinned by an answer key. Every ES ship already has licensed top-down art (ev/esSprites.js loads it); this reads
// the alpha silhouette and produces a centered, unit-scaled 2D outline whose NOSE POINTS +X -- ready for the
// Three.js half (spriteHull.js) to bevel and extrude into a flat plate. Zero new asset sourcing: the ship's own
// art becomes its hull.
//
// The outline is taken by RADIAL SAMPLING from the silhouette's centroid (n rays, farthest opaque pixel per
// ray), not boundary tracing. That is deliberate: it is star-convex and cannot produce a self-intersecting or
// degenerate polygon from noisy art, so ExtrudeGeometry never chokes. It convex-bridges deep notches (a fidelity
// limit, not a correctness one) -- a true marching-squares contour is a later upgrade. It still captures each
// ship's actual proportions -- long, pointed, broad -- which is the whole point over the generic hull.
//
// Orientation: ES art faces "up" (image -y). The hull's local nose must be +X (the engine convention shared by
// the procedural hull and the glb normalizer), so a sprite pixel (px,py) maps to shape (cy-py, px-cx): image-up
// becomes +X, image-x becomes sideways +Y.

// Binary opacity mask from RGBA bytes (alpha over threshold). Returns a Uint8Array of 0/1, length w*h.
export function alphaMask(rgba, w, h, threshold = 32) {
    const m = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) m[i] = rgba[i * 4 + 3] >= threshold ? 1 : 0;
    return m;
}

// Centroid (and pixel count) of the opaque region. Empty mask -> center of the frame, count 0.
export function centroid(mask, w, h) {
    let sx = 0, sy = 0, n = 0;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (mask[y * w + x]) { sx += x; sy += y; n++; }
    if (!n) return { cx: (w - 1) / 2, cy: (h - 1) / 2, count: 0 };
    return { cx: sx / n, cy: sy / n, count: n };
}

// n boundary points by radial sweep from the centroid: for each angle, the farthest opaque pixel. Returns image-
// space [x,y] points in angular order. A ray that hits nothing contributes the centroid (radius 0).
export function radialSilhouette(mask, w, h, n = 56) {
    const { cx, cy } = centroid(mask, w, h);
    const maxR = Math.hypot(w, h), pts = [];
    for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2, dx = Math.cos(a), dy = Math.sin(a);
        let far = 0;
        for (let r = 1; r <= maxR; r++) {
            const x = Math.round(cx + dx * r), y = Math.round(cy + dy * r);
            if (x < 0 || y < 0 || x >= w || y >= h) break;
            if (mask[y * w + x]) far = r;
        }
        pts.push([cx + dx * far, cy + dy * far]);
    }
    return pts;
}

// Signed area (shoelace); >0 is counter-clockwise in a y-up frame.
export function signedArea(points) {
    let a = 0;
    for (let i = 0, n = points.length; i < n; i++) {
        const p = points[i], q = points[(i + 1) % n];
        a += (p.x !== undefined ? p.x : p[0]) * (q.y !== undefined ? q.y : q[1]) - (q.x !== undefined ? q.x : q[0]) * (p.y !== undefined ? p.y : p[1]);
    }
    return a / 2;
}

// Map image-space silhouette points to a centered, unit-scaled, +X-nosed shape polygon, wound CCW so
// THREE.Shape triangulates it face-up. size is the target max extent (Three units). Returns { points:[{x,y}],
// scale, extent }.
export function normalizeSilhouette(imgPoints, imgW, imgH, size = 2.2) {
    const { cx, cy } = centroidOfPoints(imgPoints);
    // image (px,py) -> shape (forward = cy-py, side = px-cx)
    let pts = imgPoints.map(([px, py]) => ({ x: cy - py, y: px - cx }));
    // scale so the larger extent == size
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const p of pts) { if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x; if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y; }
    const extent = Math.max(maxX - minX, maxY - minY) || 1, scale = size / extent;
    const mx = (minX + maxX) / 2, my = (minY + maxY) / 2;
    pts = pts.map((p) => ({ x: (p.x - mx) * scale, y: (p.y - my) * scale }));
    if (signedArea(pts) < 0) pts.reverse();   // THREE.Shape wants CCW
    return { points: pts, scale, extent: extent * scale };
}

function centroidOfPoints(pts) {
    let sx = 0, sy = 0; for (const p of pts) { sx += (p[0] !== undefined ? p[0] : p.x); sy += (p[1] !== undefined ? p[1] : p.y); }
    const n = pts.length || 1; return { cx: sx / n, cy: sy / n };
}

// The whole pure pipeline: RGBA + dims -> normalized +X-nosed hull outline (or null if the sprite is empty).
export function silhouetteToHull(rgba, w, h, opts = {}) {
    const mask = alphaMask(rgba, w, h, opts.threshold);
    const c = centroid(mask, w, h);
    if (c.count < 8) return null;   // essentially empty art -> caller keeps the procedural hull
    const ring = radialSilhouette(mask, w, h, opts.rays || 56);
    return normalizeSilhouette(ring, w, h, opts.size || 2.2);
}
