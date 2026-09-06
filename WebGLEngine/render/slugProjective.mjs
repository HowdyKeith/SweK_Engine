// WebGLEngine/render/slugProjective.mjs -- v4496
//
// *** SLUG TEXT ROTATED AND IN PERSPECTIVE, HELD ON THE DEVICE (task 42). *** The shipped vertex stage reads four
// matrix rows as (x, y, -, w) and SlugDilate uses rows 0, 1 and 3 -- the projective case is what Lengyel designed
// the dilation for ("text lying on a plane in perspective") -- but until this round only the orthographic case was
// drawn and gated (tools/ship/slugDevice-selfcheck.mjs, dilation 3.8e-6 px from half a pixel). This module is the
// CPU side of the projective case: the shader's SlugDilate written once more on the CPU (dilateCpu), row builders for
// a 2-D rotation and for a text plane tilted under a real perspective projection, projection of a vertex-space point
// to screen pixels through the rows, and a rasteriser model that interpolates texcoords PERSPECTIVE-CORRECTLY (tex/w
// and 1/w affine in screen space, then divided) -- the thing the flat gate's affine model could not do, and what a
// GPU does for every varying under a w that varies across the triangle. tools/ship/slugProjective-selfcheck.mjs
// holds the model to the fragment's own texcoord (captured as bits) on both backends and the frame to slugEval
// through it; slug-projective.html draws the two cases.
"use strict";

/** the shader's SlugDilate, on the CPU: pos = [x, y, nx, ny], tex = [u, v], jac = [00, 01, 10, 11], rows m0/m1/m3 = [x, y, -, w], dim = [W, H] */
export function dilateCpu(pos, tex, jac, m0, m1, m3, dim) {
    const L = Math.hypot(pos[2], pos[3]), nx = pos[2] / L, ny = pos[3] / L;
    const s = m3[0] * pos[0] + m3[1] * pos[1] + m3[3];
    const t = m3[0] * nx + m3[1] * ny;
    const u = (s * (m0[0] * nx + m0[1] * ny) - t * (m0[0] * pos[0] + m0[1] * pos[1] + m0[3])) * dim[0];
    const v = (s * (m1[0] * nx + m1[1] * ny) - t * (m1[0] * pos[0] + m1[1] * pos[1] + m1[3])) * dim[1];
    const s2 = s * s, st = s * t, uv = u * u + v * v;
    const k = s2 * (st + Math.sqrt(uv)) / (uv - st * st);
    const dx = pos[2] * k, dy = pos[3] * k;
    return { pos: [pos[0] + dx, pos[1] + dy], tex: [tex[0] + dx * jac[0] + dy * jac[1], tex[1] + dx * jac[2] + dy * jac[3]], d: [dx, dy] };
}

/** clip -> screen: the rows applied to (x, y, 1), divided by w, mapped to pixels with y down. Returns { sx, sy, w, ndc } */
export function project(rows, x, y, W, H) {
    const r = (i) => rows[i * 4] * x + rows[i * 4 + 1] * y + rows[i * 4 + 3];
    const cx = r(0), cy = r(1), cz = r(2), cw = r(3);
    return { sx: (cx / cw + 1) * 0.5 * W, sy: (1 - cy / cw) * 0.5 * H, w: cw, z: cz / cw };
}

/** orthographic pixel rows with the origin at (ox, oy) screen px, y up in vertex space */
export function placeRows(W, H, ox, oy) {
    return new Float32Array([2 / W, 0, 0, (2 / W) * ox - 1, 0, 2 / H, 0, 1 - (2 / H) * oy, 0, 0, 0, 0, 0, 0, 0, 1]);
}

/** the same, with the vertex space rotated by `angle` radians (counter-clockwise on screen) about the origin */
export function rotatedRows(W, H, ox, oy, angle) {
    const c = Math.cos(angle), s = Math.sin(angle);
    // screen = ortho * R: x' = c x - s y, y' = s x + c y
    return new Float32Array([(2 / W) * c, (2 / W) * -s, 0, (2 / W) * ox - 1, (2 / H) * s, (2 / H) * c, 0, 1 - (2 / H) * oy, 0, 0, 0, 0, 0, 0, 0, 1]);
}

/**
 * A text plane in perspective: the vertex space (px units, y up) laid on the plane z = 0, the plane tilted about its
 * x axis by `tilt` radians and pushed `dist` units in front of a pinhole camera with vertical field of view `fov`,
 * the origin of the text at (ox, oy) on the plane in front of the camera's centre. Returns the sixteen row floats
 * of the full 4x4 applied to (x, y, 0, 1) -- the shader reads (x, y, -, w) of each row, so the z column is dropped.
 */
export function perspectiveRows(W, H, { tilt = 0, yaw = 0.6, dist = 180, fov = 1.0, scale = 1, ox = 0, oy = 0 } = {}) {
    const f = 1 / Math.tan(fov / 2), aspect = W / H, near = 1, far = 10000;
    // P (row-major)
    const P = [[f / aspect, 0, 0, 0], [0, f, 0, 0], [0, 0, -(far + near) / (far - near), -2 * far * near / (far - near)], [0, 0, -1, 0]];
    // model: scale, translate the text origin on the plane, yaw the plane about y (the line recedes to the right), tilt it
    // about x, push to z = -dist. yaw is the strong case: w varies along the 200 px of text, not across its 30 px height.
    const ct = Math.cos(tilt), st = Math.sin(tilt), cy = Math.cos(yaw), sy = Math.sin(yaw);
    const Mrow = (x, y) => { const X = scale * x + ox, Y = scale * y + oy; return [cy * X, ct * Y, st * Y + sy * X - dist, 1]; };   // (x, y, 0, 1) -> eye space
    // compose P * M as a 4x4 acting on (x, y, 0, 1): columns for x, y, 1
    const col = (cx, cy, c1) => cx, rows = new Float32Array(16);
    const ex = Mrow(1, 0), ey = Mrow(0, 1), e1 = Mrow(0, 0);
    const bx = [ex[0] - e1[0], ex[1] - e1[1], ex[2] - e1[2], 0], by = [ey[0] - e1[0], ey[1] - e1[1], ey[2] - e1[2], 0];
    for (let i = 0; i < 4; i++) {
        const dot = (v) => P[i][0] * v[0] + P[i][1] * v[1] + P[i][2] * v[2] + P[i][3] * v[3];
        rows[i * 4] = dot(bx); rows[i * 4 + 1] = dot(by); rows[i * 4 + 2] = 0; rows[i * 4 + 3] = dot(e1);
    }
    void col;
    return rows;
}

/** the width of w across a set of points under the rows: 1 for an affine placement, more than 1 in perspective */
export function wRange(rows, points, W, H) {
    let lo = Infinity, hi = -Infinity; for (const [x, y] of points) { const w = project(rows, x, y, W, H).w; lo = Math.min(lo, w); hi = Math.max(hi, w); } return { lo, hi, ratio: hi / lo };
}

/**
 * The rasteriser model for one quad under arbitrary rows: dilated corners projected and snapped to 1/Q px, and per
 * triangle a PERSPECTIVE-CORRECT texcoord: tex/w and 1/w affine over the screen triangle, divided at the pixel.
 * `quad` is { corners: [{ pos:[x,y,nx,ny], tex:[u,v], jac:[4] }] x 4 } in vertex space. Returns the two triangles.
 */
export function quadTriangles(quad, rows, W, H, Q) {
    const m0 = rows.subarray ? rows.subarray(0, 4) : rows.slice(0, 4), m1 = rows.subarray ? rows.subarray(4, 8) : rows.slice(4, 8), m3 = rows.subarray ? rows.subarray(12, 16) : rows.slice(12, 16);
    const C = quad.corners.map((c) => {
        const d = dilateCpu(c.pos, c.tex, c.jac, m0, m1, m3, [W, H]);
        const p = project(rows, d.pos[0], d.pos[1], W, H);
        let sx = p.sx, sy = p.sy; if (isFinite(Q)) { sx = Math.round(sx * Q) / Q; sy = Math.round(sy * Q) / Q; }
        return { sx, sy, iw: 1 / p.w, txw: d.tex[0] / p.w, tyw: d.tex[1] / p.w, tex: d.tex, dil: d, screen: p };
    });
    const tris = [];
    for (const [a, b, c] of [[0, 1, 2], [0, 2, 3]]) {
        const A = C[a], B = C[b], K = C[c];
        const det = (B.sx - A.sx) * (K.sy - A.sy) - (K.sx - A.sx) * (B.sy - A.sy);
        const dx = (k) => ((B[k] - A[k]) * (K.sy - A.sy) - (K[k] - A[k]) * (B.sy - A.sy)) / det;
        const dy = (k) => ((K[k] - A[k]) * (B.sx - A.sx) - (B[k] - A[k]) * (K.sx - A.sx)) / det;
        const m = {}; for (const k of ["iw", "txw", "tyw"]) { m[k + "dx"] = dx(k); m[k + "dy"] = dy(k); m[k + "0"] = A[k] - m[k + "dx"] * A.sx - m[k + "dy"] * A.sy; }
        const at = (x, y) => { const iw = m.iw0 + m.iwdx * x + m.iwdy * y; return [(m.txw0 + m.txwdx * x + m.txwdy * y) / iw, (m.tyw0 + m.tywdx * x + m.tywdy * y) / iw]; };
        const inside = (x, y) => { const s1 = (B.sx - A.sx) * (y - A.sy) - (B.sy - A.sy) * (x - A.sx), s2 = (K.sx - B.sx) * (y - B.sy) - (K.sy - B.sy) * (x - B.sx), s3 = (A.sx - K.sx) * (y - K.sy) - (A.sy - K.sy) * (x - K.sx);
            return (s1 >= 0 && s2 >= 0 && s3 >= 0) || (s1 <= 0 && s2 <= 0 && s3 <= 0); };
        tris.push({ at, inside, corners: C });
    }
    return { tris, corners: C };
}

/** the quads of a buildVertices stream, decoded (20 floats a vertex, four a quad) */
export function quadsOf(built) {
    const f = new Float32Array(built.buffer), out = [];
    for (let q = 0; q < built.quadCount; q++) {
        const corners = [];
        for (let k = 0; k < 4; k++) { const o = (q * 4 + k) * 20; corners.push({ pos: [f[o], f[o + 1], f[o + 2], f[o + 3]], tex: [f[o + 4], f[o + 5]], jac: [f[o + 8], f[o + 9], f[o + 10], f[o + 11]] }); }
        out.push({ corners, q });
    }
    return out;
}
