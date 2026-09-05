// WebGLEngine/text/slugCurve.mjs -- v4491
//
// *** CURVED SLUG TEXT BY TESSELLATED STRIPS WITH A PER-STRIP JACOBIAN -- NEVER BY BENDING THE QUAD'S VERTICES. ***
// (docs/TSL-ROADMAP.md step 7 item 10, task 10.) SlugDilate pushes every corner half a pixel outward in object space
// and converts that push to em space through the vertex's inverse Jacobian (aJac, four floats: d(tex)/d(object)). The
// fragment then interpolates the corners' texcoords linearly across each triangle. Both steps assume the map from em
// space to object space is AFFINE over the quad: a constant Jacobian, a linear texcoord. Bending a glyph's four corners
// onto a curve breaks both at once -- the interior of the quad no longer lies where the texcoord says it does, and the
// half-pixel push lands in the wrong place by the same amount. So the glyph is cut into STRIPS along the baseline.
// Inside one strip the frame is the strip's midpoint frame (tangent T, normal N at its middle arc length), the corners
// are placed at the strip's two edge arc lengths with each edge's own normal (so adjacent strips share their edge
// exactly: no crack, no overlap), the Jacobian is the midpoint frame's rotation over the size, and the outward push
// direction (aPos.zw) is that frame's -- rotated so SlugDilate pushes half a pixel along the strip's own axes. Interior
// edges push only along the normal (nx = 0), so a shared edge dilates identically from both sides and the premultiplied
// composite never double-counts a seam.
//
// The error of the approximation is the difference between the texcoord the fragment interpolates and the texcoord of
// the point's TRUE flat position (the curve's inverse). It shrinks with the strip width; tools/ship/slugCurve-selfcheck.mjs
// measures it against the exact inverse of a circular arc and holds the convergence, then draws the strips through
// render/slugDevice.mjs on both backends against the same key the flat gate uses. stripsFor() is the a-priori bound
// (chord sag w^2 / 8r under a pixel tolerance); the gate says what the bound actually buys.
"use strict";
import { VERTEX_STRIDE } from "./slugShader.js";
import { packGlyphLoc, packGlyphFlags } from "./slugAtlas.js";

/**
 * A circular arc as a curve in vertex space (y up), parametrised by ARC LENGTH from theta0. `r` is the radius,
 * `ccw` the direction the baseline advances (true: counter-clockwise, text reads along the top of a circle when
 * theta0 is near pi/2 + text length / 2r). pointAt(u), tangentAt(u), normalAt(u) = perp(T) so that at T = (1, 0)
 * N = (0, 1), matching the flat quad's y axis. invert(px, py, uHint) -> [u, v]: the arc length whose normal passes
 * through the point (the branch nearest uHint) and the signed offset along that normal -- closed form, which is why
 * the gate uses a circle.
 */
export function arcCurve({ cx = 0, cy = 0, r = 100, theta0 = Math.PI / 2, ccw = false } = {}) {
    if (!(r > 0)) throw new Error("slugCurve: arcCurve needs a positive radius");
    const dir = ccw ? 1 : -1;
    const ang = (u) => theta0 + dir * u / r;
    const pointAt = (u) => { const a = ang(u); return [cx + r * Math.cos(a), cy + r * Math.sin(a)]; };
    // tangent along advancing arc length; normal = perp so that (T, N) is right-handed like (x, y)
    const tangentAt = (u) => { const a = ang(u); return [-dir * Math.sin(a), dir * Math.cos(a)]; };
    const normalAt = (u) => { const [tx, ty] = tangentAt(u); return [-ty, tx]; };
    // uHint: the arc length the caller believes is near (a strip's midpoint); the branch of the angle nearest it is
    // taken, so text longer than pi * r inverts to the right turn of the circle (without it the nearest branch to
    // theta0 wins, and a 202 px line on r = 60 read 377 px wrong at v4491's first probe)
    const invert = (px, py, uHint = 0) => {
        const dx = px - cx, dy = py - cy, a = Math.atan2(dy, dx), d = Math.hypot(dx, dy);
        let da = a - ang(uHint); da -= 2 * Math.PI * Math.round(da / (2 * Math.PI));   // nearest branch to the hint
        const u = uHint + dir * da * r;
        // N at u points (-ty, tx) = ( -dir cos a, -dir sin a ) = -dir * radial. So v = N . (p - c) - N . (P - c) = -dir (d - r).
        return [u, -dir * (d - r)];
    };
    return Object.freeze({ kind: "arc", cx, cy, r, theta0, ccw, pointAt, tangentAt, normalAt, invert, radiusAt: () => r });
}

/** The straight line y = 0 along +x: the control. Curved vertices on it are the flat quads, cut into strips. */
export function lineCurve() {
    return Object.freeze({ kind: "line", pointAt: (u) => [u, 0], tangentAt: () => [1, 0], normalAt: () => [0, 1], invert: (px, py, _uHint) => [px, py], radiusAt: () => Infinity });
}

/**
 * Strips per glyph from the chord-sag bound: a chord of width w on radius r sags w^2 / (8 r) from the arc, so a
 * tolerance of tol pixels allows a strip width sqrt(8 r tol). Minimum 1. The gate measures what this buys in
 * texcoord error, which is the number that matters and is not this one.
 */
export function stripsFor(widthPx, radiusPx, tolPx = 0.25) {
    if (!(widthPx > 0) || !isFinite(radiusPx)) return 1;
    return Math.max(1, Math.ceil(widthPx / Math.sqrt(8 * radiusPx * tolPx)));
}

/**
 * Build the interleaved vertex stream (text/slugShader.js VERTEX_LAYOUT, 80 bytes a vertex) for laid-out glyphs
 * bent along `curve`. `glyphs` are layoutText's (x along the baseline in the caller's units, y the baseline, size),
 * and the flat baseline coordinate x becomes ARC LENGTH along the curve; the flat y becomes the offset along the
 * curve's normal. opts: { color, evenOdd, strips (per glyph, default stripsFor at opts.tol), tol }.
 * Returns { buffer, indices, vertexCount, quadCount, strips, records } where records lists every strip's corners
 * (object position, outward direction, texcoord, jacobian) for a CPU model to read without decoding the buffer.
 */
export function buildCurvedVertices(glyphs, entryFor, curve, opts = {}) {
    const color = opts.color || [1, 1, 1, 1];
    const evenOdd = !!opts.evenOdd;
    const tol = opts.tol == null ? 0.25 : opts.tol;
    const quads = [];
    for (const g of glyphs) {
        const e = entryFor(g.glyphIndex);
        if (!e || e.empty) continue;
        const bb = e.bbox;
        if (!(bb.x1 > bb.x0) || !(bb.y1 > bb.y0)) continue;
        const s = g.size, xa = g.x + bb.x0 * s, xb = g.x + bb.x1 * s;
        const n = opts.strips != null ? Math.max(1, opts.strips | 0) : stripsFor(xb - xa, curve.radiusAt((xa + xb) / 2), tol);
        for (let k = 0; k < n; k++) quads.push({ g, e, bb, xa: xa + (xb - xa) * k / n, xb: xa + (xb - xa) * (k + 1) / n, first: k === 0, last: k === n - 1 });
    }
    const vertexCount = quads.length * 4;
    const buffer = new ArrayBuffer(vertexCount * VERTEX_STRIDE);
    const f32 = new Float32Array(buffer), u32 = new Uint32Array(buffer);
    const indices = new Uint32Array(quads.length * 6);
    const FLOATS = VERTEX_STRIDE / 4;
    const records = [];
    let v = 0, i = 0, stripCount = 0;
    for (const { g, e, bb, xa, xb, first, last } of quads) {
        const s = g.size, invS = 1 / s;
        const loc = packGlyphLoc(e.loc[0], e.loc[1]);
        const flags = packGlyphFlags(e.bandMax[0], e.bandMax[1], evenOdd);
        const um = (xa + xb) / 2, T = curve.tangentAt(um), N = curve.normalAt(um);
        const jac = [T[0] * invS, T[1] * invS, N[0] * invS, N[1] * invS];
        const ya = g.y + bb.y0 * s, yb = g.y + bb.y1 * s;
        // corners in the order (0,0) (1,0) (1,1) (0,1) of (edge, height); each edge at its own arc-length frame
        const corners = [[xa, ya, first ? -1 : 0, -1], [xb, ya, last ? 1 : 0, -1], [xb, yb, last ? 1 : 0, 1], [xa, yb, first ? -1 : 0, 1]];
        const base = v, rec = { e, g, xa, xb, jac, corners: [] };
        for (const [x, y, nx, ny] of corners) {
            const P = curve.pointAt(x), Ne = curve.normalAt(x), Te = curve.tangentAt(x);
            const px = P[0] + Ne[0] * y, py = P[1] + Ne[1] * y;
            const ox = nx * Te[0] + ny * Ne[0], oy = nx * Te[1] + ny * Ne[1];               // outward, in the edge's frame
            const ex = (x - g.x) * invS, ey = (y - g.y) * invS;
            const o = v * FLOATS;
            f32[o + 0] = px; f32[o + 1] = py; f32[o + 2] = ox; f32[o + 3] = oy;
            f32[o + 4] = ex; f32[o + 5] = ey;
            u32[o + 6] = loc; u32[o + 7] = flags;
            f32[o + 8] = jac[0]; f32[o + 9] = jac[1]; f32[o + 10] = jac[2]; f32[o + 11] = jac[3];
            f32[o + 12] = e.transform[0]; f32[o + 13] = e.transform[1]; f32[o + 14] = e.transform[2]; f32[o + 15] = e.transform[3];
            f32[o + 16] = color[0]; f32[o + 17] = color[1]; f32[o + 18] = color[2]; f32[o + 19] = color[3];
            rec.corners.push({ px, py, ox, oy, ex, ey });
            v++;
        }
        indices[i++] = base; indices[i++] = base + 1; indices[i++] = base + 2;
        indices[i++] = base; indices[i++] = base + 2; indices[i++] = base + 3;
        records.push(rec); stripCount++;
    }
    return { buffer, indices, vertexCount, quadCount: quads.length, strips: stripCount, records };
}

/**
 * THE TEXCOORD ERROR OF THE TESSELLATION, MEASURED ON THE CPU: for every strip, the texcoord a fragment would
 * interpolate (affine over each triangle from the three corners, UNDILATED here -- the dilation is the shader's and is
 * exact per strip) against the texcoord of the sample's true flat position (curve.invert), at `samples` x `samples`
 * points inside each triangle. Returns { worstEm, worstPx, meanPx, samples, strips } with px = em * size.
 */
export function tessellationError(built, curve, samples = 6) {
    let worstEm = 0, sumPx = 0, n = 0;
    for (const rec of built.records) {
        const C = rec.corners, s = rec.g.size;
        for (const [a, b, c] of [[0, 1, 2], [0, 2, 3]]) {
            const A = C[a], B = C[b], K = C[c];
            for (let p = 1; p < samples; p++) for (let q = 1; q < samples - p; q++) {
                const wb = p / samples, wk = q / samples, wa = 1 - wb - wk;
                const px = wa * A.px + wb * B.px + wk * K.px, py = wa * A.py + wb * B.py + wk * K.py;
                const ex = wa * A.ex + wb * B.ex + wk * K.ex, ey = wa * A.ey + wb * B.ey + wk * K.ey;
                const [u, vv] = curve.invert(px, py, (rec.xa + rec.xb) / 2);
                const tx = (u - rec.g.x) / s, ty = (vv - rec.g.y) / s;
                const err = Math.hypot(tx - ex, ty - ey);
                if (err > worstEm) worstEm = err;
                sumPx += err * s; n++;
            }
        }
    }
    return { worstEm, worstPx: worstEm * (built.records[0] ? built.records[0].g.size : 0), meanPx: n ? sumPx / n : 0, samples: n, strips: built.strips };
}
