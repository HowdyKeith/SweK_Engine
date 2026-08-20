// WebGLEngine/physics/mesh/svgProfile.mjs -- v2982
//
// AN SVG PROFILE IS THE HONEST INPUT FOR A 2D WIND TUNNEL.
//
// The idea comes from bekuto3d (LittleSound), which converts SVG to 3D by extruding a vector profile. Reading it
// pointed the other way: THE TUNNEL DOES NOT WANT THE EXTRUSION. It is 2D, and v2874's GLB path has to reduce a
// solid to a slice and then carry a caveat on screen forever -- the Cd belongs to the SLICE, not the body, and a
// sphere's mid-slice is a cylinder whose Cd is roughly double.
//
// AN SVG PROFILE HAS NO SUCH CAVEAT, BECAUSE IT IS ALREADY THE 2D SHAPE BEING TESTED. Draw an aerofoil, test the
// aerofoil. The number means what it says.
//
// THE KEY THAT MAKES THIS AN INSTRUMENT RATHER THAN A FILE FORMAT: the tunnel already builds an analytic cylinder
// from a radius test. An SVG <circle> of the same radius must produce the SAME solid mask, cell for cell, by a
// completely different route -- text parsing and polygon rasterisation against a distance comparison. Two
// independent paths to one shape, which is the cross-instrument check this lab uses everywhere else.
//
// SCOPE, stated rather than discovered: <circle>, <rect>, <polygon>, <polyline>, and <path> restricted to M/L/H/V/Z
// with absolute or relative coordinates. NO curves, NO transforms, NO strokes -- fills only. A curve or a
// transform is REFUSED by name rather than silently ignored, because a shape that quietly loses half its outline
// would voxelise to a plausible body and produce a confident wrong drag.
"use strict";

/** Parse the numbers out of an attribute list like "0,0 10,0 10,10". */
const nums = (s) => (String(s).match(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi) || []).map(Number);

function attr(tag, name) {
    const m = tag.match(new RegExp("\\b" + name + '\\s*=\\s*"([^"]*)"')) ||
              tag.match(new RegExp("\\b" + name + "\\s*=\\s*'([^']*)'"));
    return m ? m[1] : null;
}

/** A circle, sampled as a polygon. segments is the only approximation and it is stated, not hidden. */
function circlePoly(cx, cy, r, segments = 256) {
    const pts = [];
    for (let i = 0; i < segments; i++) {
        const t = (i / segments) * 2 * Math.PI;
        pts.push([cx + r * Math.cos(t), cy + r * Math.sin(t)]);
    }
    return pts;
}

/** Path data, restricted to straight segments. Anything else throws BY NAME. */
function pathPoly(d) {
    const toks = String(d).match(/[MmLlHhVvZzCcSsQqTtAa]|-?\d*\.?\d+(?:e[-+]?\d+)?/gi) || [];
    const pts = [];
    let x = 0, y = 0, cmd = null, i = 0;
    while (i < toks.length) {
        const t = toks[i];
        if (/^[A-Za-z]$/.test(t)) { cmd = t; i++; }
        if (/[CcSsQqTtAa]/.test(cmd || "")) {
            throw new Error("path command '" + cmd + "' is a curve. This reader handles straight segments only (M/L/H/V/Z) -- a silently dropped curve would voxelise to a plausible body and produce a confident wrong drag.");
        }
        const rel = cmd === cmd.toLowerCase();
        if (/[Zz]/.test(cmd)) { break; }
        if (/[Mm Ll]/i.test(cmd)) {
            const a = Number(toks[i]), b = Number(toks[i + 1]); i += 2;
            x = rel ? x + a : a; y = rel ? y + b : b;
        } else if (/[Hh]/.test(cmd)) { const a = Number(toks[i]); i += 1; x = rel ? x + a : a; }
        else if (/[Vv]/.test(cmd)) { const a = Number(toks[i]); i += 1; y = rel ? y + a : a; }
        else { i++; continue; }
        pts.push([x, y]);
    }
    return pts;
}

/**
 * Parse an SVG into one or more closed polygons in SVG user units.
 * @returns {{polys: number[][][], shapes: string[]}}
 */
export function parseSVG(text) {
    const src = String(text);
    if (!/<svg[\s>]/i.test(src)) throw new Error("not an SVG (no <svg> element)");
    if (/\btransform\s*=/.test(src)) {
        throw new Error("this SVG uses transform=, which this reader does not apply. Flatten transforms in your editor first -- applying them wrongly would move the body inside the tunnel without saying so.");
    }
    const polys = [], shapes = [];
    for (const m of src.matchAll(/<(circle|rect|polygon|polyline|path)\b([^>]*)>/gi)) {
        const kind = m[1].toLowerCase(), tag = m[0];
        if (kind === "circle") {
            const cx = Number(attr(tag, "cx") || 0), cy = Number(attr(tag, "cy") || 0), r = Number(attr(tag, "r") || 0);
            if (r > 0) { polys.push(circlePoly(cx, cy, r)); shapes.push("circle"); }
        } else if (kind === "rect") {
            const x = Number(attr(tag, "x") || 0), y = Number(attr(tag, "y") || 0);
            const w = Number(attr(tag, "width") || 0), h = Number(attr(tag, "height") || 0);
            if (w > 0 && h > 0) { polys.push([[x, y], [x + w, y], [x + w, y + h], [x, y + h]]); shapes.push("rect"); }
        } else if (kind === "polygon" || kind === "polyline") {
            const n = nums(attr(tag, "points") || "");
            const p = []; for (let i = 0; i + 1 < n.length; i += 2) p.push([n[i], n[i + 1]]);
            if (p.length >= 3) { polys.push(p); shapes.push(kind); }
        } else if (kind === "path") {
            const p = pathPoly(attr(tag, "d") || "");
            if (p.length >= 3) { polys.push(p); shapes.push("path"); }
        }
    }
    if (!polys.length) throw new Error("no usable shape found. Supported: circle, rect, polygon, polyline, and path with straight segments only.");
    return { polys, shapes };
}

/** Even-odd point-in-polygon. Same parity rule as the 3D ray fill, for the same reason: it works for any closed outline. */
export function inPolygon(px, py, poly) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const [xi, yi] = poly[i], [xj, yj] = poly[j];
        if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
}

export function bounds(polys) {
    let lo = [Infinity, Infinity], hi = [-Infinity, -Infinity];
    for (const p of polys) for (const [x, y] of p) {
        if (x < lo[0]) lo[0] = x; if (y < lo[1]) lo[1] = y;
        if (x > hi[0]) hi[0] = x; if (y > hi[1]) hi[1] = y;
    }
    return { lo, hi };
}

/**
 * Rasterise a profile into the same {nx, ny, solidAt, filled} shape crossSection() returns, so it drops straight
 * into the wind tunnel's existing solid slot without the tunnel needing to know which produced it.
 *
 * fit:"contain" scales the profile into the grid preserving aspect; lo/hi override it entirely.
 */
export function rasterProfile(polys, { nx, ny, pad = 0.05, lo, hi } = {}) {
    if (!(nx > 0 && ny > 0)) throw new Error("rasterProfile needs positive nx, ny");
    let b = { lo, hi };
    if (!lo || !hi) {
        b = bounds(polys);
        const sx = (b.hi[0] - b.lo[0]) * pad || 1e-6, sy = (b.hi[1] - b.lo[1]) * pad || 1e-6;
        b = { lo: [b.lo[0] - sx, b.lo[1] - sy], hi: [b.hi[0] + sx, b.hi[1] + sy] };
    }
    const cw = (b.hi[0] - b.lo[0]) / nx, ch = (b.hi[1] - b.lo[1]) / ny;
    const mask = new Uint8Array(nx * ny);
    let filled = 0;
    for (let j = 0; j < ny; j++) {
        const py = b.lo[1] + (j + 0.5) * ch;
        for (let i = 0; i < nx; i++) {
            const px = b.lo[0] + (i + 0.5) * cw;
            // Even-odd across ALL polygons together, so a hole drawn inside an outline is a hole.
            let inside = false;
            for (const p of polys) if (inPolygon(px, py, p)) inside = !inside;
            if (inside) { mask[j * nx + i] = 1; filled++; }
        }
    }
    return { mask, nx, ny, lo: b.lo, hi: b.hi, cell: [cw, ch], filled,
             solidAt: (x, y) => !!mask[y * nx + x] };
}

/** Area implied by a rasterised profile -- the quantity graded against the analytic shape. */
export const profileArea = (p) => p.filled * p.cell[0] * p.cell[1];

/** Convenience: SVG text straight to a tunnel-ready mask. */
export function profileFromSVG(text, opts) { return rasterProfile(parseSVG(text).polys, opts); }
