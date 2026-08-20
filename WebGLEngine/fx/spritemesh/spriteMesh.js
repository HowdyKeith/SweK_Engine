// fx/spritemesh/spriteMesh.js -- turn a 2D sprite into an extruded 3D mesh (the SpriteMesh / bekuto3d idea, built
// native so we depend on neither Godot nor an external tool). This is the missing link for "offline-scan the sprites
// -> 3D": once a ship sprite is a mesh, we get true occlusion-correct vector blueprints AND a 3D-parallax filter for
// the comic reader, from art we already have.
//
// Ships (and most comic characters) are STAR-CONVEX silhouettes -- the centre sees the whole outline -- so we trace
// the outline by casting rays out from the centroid (ordered by angle, no fiddly boundary-follower), triangulate it
// as a fan, and extrude: front fan at +depth/2, back fan at -depth/2 (reversed winding), and a wall quad per outline
// edge. Verifiable: a square sprite yields a clean prism with the right vertex/face counts and bounds. Concave art
// would want ear-clipping instead of a fan -- noted for later.
"use strict";

function alphaMask(data, W, H, thresh) { thresh = thresh == null ? 24 : thresh; const m = new Uint8Array(W * H); for (let i = 0; i < W * H; i++) m[i] = data[i * 4 + 3] > thresh ? 1 : 0; return m; }
function centroid(mask, W, H) { let cx = 0, cy = 0, n = 0; for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (mask[y * W + x]) { cx += x; cy += y; n++; } return n ? { x: cx / n, y: cy / n, n } : { x: W / 2, y: H / 2, n: 0 }; }

// ordered outline: for N angles from the centroid, the farthest filled pixel along that ray (normalized to [-1,1])
function radialContour(mask, W, H, N) {
    N = N || 64; const c = centroid(mask, W, H), maxR = Math.hypot(W, H), S = Math.max(W, H) / 2, poly = [];
    for (let i = 0; i < N; i++) {
        const th = i / N * Math.PI * 2, dx = Math.cos(th), dy = Math.sin(th); let last = null;
        for (let r = 1; r < maxR; r++) { const x = Math.round(c.x + dx * r), y = Math.round(c.y + dy * r); if (x < 0 || y < 0 || x >= W || y >= H) break; if (mask[y * W + x]) last = [x, y]; }
        const p = last || [c.x + dx, c.y + dy]; poly.push([(p[0] - c.x) / S, (p[1] - c.y) / S]);   // model space centred at 0, ~[-1,1]
    }
    return { poly, cx: 0, cy: 0 };
}

// extrude the star-convex outline into a solid mesh { positions:[[x,y,z]], cells:[[a,b,c]] }
function extrude(contour, depth) {
    depth = depth || 0.35; const poly = contour.poly, N = poly.length, hz = depth / 2, pos = [], cells = [];
    for (const [x, y] of poly) pos.push([x, y, hz]);              // 0..N-1  front rim
    for (const [x, y] of poly) pos.push([x, y, -hz]);            // N..2N-1 back rim
    const fc = pos.length; pos.push([contour.cx, contour.cy, hz]);   // front centre
    const bc = pos.length; pos.push([contour.cx, contour.cy, -hz]);  // back centre
    for (let i = 0; i < N; i++) { const j = (i + 1) % N;
        cells.push([fc, i, j]);                                  // front fan (CCW)
        cells.push([bc, N + j, N + i]);                          // back fan (reversed)
        cells.push([i, N + i, N + j]); cells.push([i, N + j, j]); // wall quad -> 2 tris
    }
    return { positions: pos, cells };
}

function bounds(mesh) { const p = mesh.positions; let mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9]; for (const v of p) for (let k = 0; k < 3; k++) { if (v[k] < mn[k]) mn[k] = v[k]; if (v[k] > mx[k]) mx[k] = v[k]; } return { min: mn, max: mx }; }
function toOBJ(mesh) { let s = "# SweK spriteMesh\n"; for (const v of mesh.positions) s += "v " + v[0].toFixed(4) + " " + v[1].toFixed(4) + " " + v[2].toFixed(4) + "\n"; for (const c of mesh.cells) s += "f " + (c[0] + 1) + " " + (c[1] + 1) + " " + (c[2] + 1) + "\n"; return s; }

// convenience: sprite canvas -> mesh
function spriteToMesh(srcCanvas, opts = {}) { const W = srcCanvas.width, H = srcCanvas.height, data = srcCanvas.getContext("2d").getImageData(0, 0, W, H).data; return extrude(radialContour(alphaMask(data, W, H, opts.thresh), W, H, opts.segments || 64), opts.depth || 0.35); }

export { alphaMask, centroid, radialContour, extrude, bounds, toOBJ, spriteToMesh };
if (typeof module !== "undefined" && module.exports) module.exports = { alphaMask, centroid, radialContour, extrude, bounds, toOBJ, spriteToMesh };
