// WebGLEngine/physics/mesh/uvUnwrap.mjs -- v4536
// ---------------------------------------------------------------------------------------------------------------
// AN ATLAS FOR SURFACES NOTHING EVER UNWRAPPED -- the absence three unrelated files already route around.
//
// physics/mesh/meshCSG.mjs, on the polygons a boolean creates: "freshly exposed interior that did not exist a
// moment ago and has no texture coordinates, because nothing unwrapped a surface that had not been made yet."
// tools/export/reskin.js, on RobotExpressive.glb: 7,214 vertices and no TEXCOORD_0, so "the simple path is not
// wrong, it is unavailable ON THIS ASSET" -- and route 1, vertex colours, exists because of that. And
// render/solidTexture.mjs, on a wall "that did not exist when the wall was authored, so no unwrap ever assigned
// it a coordinate". Three files, three workarounds, one missing primitive.
//
// ---- WHAT THIS ROUND DOES, AND WHAT IT DELIBERATELY DOES NOT ---------------------------------------------------
//
// It unwraps PLANAR polygons, which is not a limitation dressed up as a scope: it is the exact shape of the two
// callers that are blocked today. meshCSG's polygons are convex and planar and ALREADY CARRY THEIR PLANE (`pl`),
// and a wall is a plane. Projecting a planar polygon onto its own plane through an orthonormal basis is an
// ISOMETRY -- 3D distances come out unchanged -- so this round owes no parameterisation, no LSCM, no ABF and no
// stretch minimiser, because there is no stretch to minimise. A curved surface (RobotExpressive) needs all of
// that and is NOT attempted here; what it gets from this file is the packer and the properties.
//
// *** SO THE HEADLINE PROPERTY IS NOT "STRETCH = 1". *** Each chart is isometric on its own, and then packing
// divides every chart by ONE atlas size to reach [0,1]. The composition is a single global scale, and the
// property worth asserting is the one a texture artist actually feels: UNIFORM TEXEL DENSITY -- the ratio of a
// 3D edge's length to its UV edge's length is THE SAME NUMBER for every edge in the mesh. Not "small
// distortion", not "acceptable". One number, and the gate reports its spread rather than asserting a bound.
//
// ---- THE PACKER, AND A SECOND COPY THAT IS DECLARED RATHER THAN MERGED ------------------------------------------
//
// tools/wadWallAtlas.js:95 has a private `_shelfPack` of exactly this shape: rects in, placements out. This
// tree's own v3090 finding is that repeated shapes are a missing primitive rather than repeated mistakes, so the
// right move is one owner and two importers -- AND IT IS NOT MADE HERE, ON PURPOSE. wadWallAtlas.js has NO GATE,
// and its only consumers are ui/DoomModePanel.js and main.js, both browser paths that need a real WAD and a
// MaterialRegistry. There is no way to run it from here, so an extraction could not be shown to preserve its
// placements. CHANGING UNTESTED CODE TO SATISFY A PRINCIPLE IS THE TRADE THAT PRINCIPLE EXISTS TO PREVENT. The
// duplication is therefore declared here, with its address, so the merge is a named step somebody can take with
// a rig in front of them rather than a coincidence nobody has noticed.
//
// The difference that would survive the merge: this one SORTS BY HEIGHT DESCENDING before shelving. Unsorted
// shelf packing wastes the whole shelf on whatever tall rect happens to arrive last; the gate measures both and
// prints the occupancy of each, so the sort is a number rather than folklore.
"use strict";

/** A polygon's plane normal, taken from `pl` when meshCSG already computed it and derived otherwise. */
function normalOf(poly) {
    if (poly.pl && poly.pl.n) return poly.pl.n;
    const v = poly.vs, a = v[0], b = v[1], c = v[2];
    const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    const L = Math.hypot(n[0], n[1], n[2]) || 1;
    return [n[0] / L, n[1] / L, n[2] / L];
}

/**
 * An orthonormal basis (t, b) spanning the plane with normal n.
 *
 * *** THE SEED AXIS IS THE ONE n POINTS LEAST ALONG, WHICH IS NOT A STYLE CHOICE. *** Crossing n with a FIXED
 * up-vector is the textbook spelling and it degenerates exactly when n is parallel to that vector -- for a
 * y-up seed, every floor and every ceiling in the tree, which is to say the most common polygon there is. The
 * cross product's length goes to zero, normalising it divides by ~0, and the basis comes out as noise: a floor
 * would unwrap to garbage while every wall looked fine. Picking the SMALLEST component of n guarantees the
 * angle between n and the seed is at least 54.7 degrees, so the cross is never near-zero for any n.
 */
export function planeBasis(n) {
    const ax = Math.abs(n[0]), ay = Math.abs(n[1]), az = Math.abs(n[2]);
    const seed = (ax <= ay && ax <= az) ? [1, 0, 0] : (ay <= az ? [0, 1, 0] : [0, 0, 1]);
    let t = [n[1] * seed[2] - n[2] * seed[1], n[2] * seed[0] - n[0] * seed[2], n[0] * seed[1] - n[1] * seed[0]];
    const L = Math.hypot(t[0], t[1], t[2]) || 1;
    t = [t[0] / L, t[1] / L, t[2] / L];
    const b = [n[1] * t[2] - n[2] * t[1], n[2] * t[0] - n[0] * t[2], n[0] * t[1] - n[1] * t[0]];
    return { t, b };
}

/**
 * Project one planar polygon into its own plane. Returns 2D points in WORLD UNITS, origin at the polygon's
 * first vertex, plus the extent. No scaling happens here -- scale is the packer's business, and doing it per
 * polygon is precisely how texel density stops being uniform.
 */
export function projectPoly(poly) {
    const n = normalOf(poly), { t, b } = planeBasis(n), o = poly.vs[0];
    const pts = poly.vs.map((v) => {
        const d = [v[0] - o[0], v[1] - o[1], v[2] - o[2]];
        return [d[0] * t[0] + d[1] * t[1] + d[2] * t[2], d[0] * b[0] + d[1] * b[1] + d[2] * b[2]];
    });
    let minU = Infinity, minV = Infinity, maxU = -Infinity, maxV = -Infinity;
    for (const [u, v] of pts) { if (u < minU) minU = u; if (u > maxU) maxU = u; if (v < minV) minV = v; if (v > maxV) maxV = v; }
    // Re-origin to the chart's own corner so the extent starts at 0 -- the packer places extents, not points.
    const local = pts.map(([u, v]) => [u - minU, v - minV]);
    return { pts: local, w: maxU - minU, h: maxV - minV };
}

/**
 * Shelf-pack rects into a fixed-width strip, returning placements and the height used.
 *
 * Items are { w, h } in any consistent unit. `sort` orders by height descending first, which is what makes
 * shelf packing worth using at all; pass false to measure the difference rather than believe it.
 */
export function shelfPack(items, { width = 1, padding = 0, sort = true } = {}) {
    const idx = items.map((it, i) => i);
    if (sort) idx.sort((a, b) => (items[b].h - items[a].h) || (items[b].w - items[a].w) || (a - b));
    const placements = new Array(items.length);
    let shelfY = 0, shelfH = 0, shelfX = 0, ok = true;
    for (const i of idx) {
        const w = items[i].w + padding, h = items[i].h + padding;
        if (w > width) { ok = false; }               // wider than the strip: recorded, not thrown
        if (shelfX + w > width && shelfX > 0) { shelfY += shelfH; shelfH = 0; shelfX = 0; }
        placements[i] = { x: shelfX, y: shelfY, w: items[i].w, h: items[i].h };
        shelfX += w;
        if (h > shelfH) shelfH = h;
    }
    return { placements, height: shelfY + shelfH, ok };
}

/**
 * Unwrap planar polygons into one atlas.
 *
 * Returns per-polygon UV arrays in [0,1], the chart placements, and the ONE scale every chart shares -- which
 * is what makes texel density uniform and is returned so a caller can state its texels-per-world-unit rather
 * than discover it.
 */
export function unwrap(polys, { padding = 0.02, sort = true } = {}) {
    if (!polys || !polys.length) return { uvs: [], charts: [], scale: 0, atlas: { w: 0, h: 0 }, occupancy: 0 };
    const charts = polys.map(projectPoly);
    const rects = charts.map((c) => ({ w: c.w, h: c.h }));
    const area = charts.reduce((s, c) => s + (c.w + padding) * (c.h + padding), 0);
    const widest = charts.reduce((m, c) => Math.max(m, c.w + padding), 0);
    // *** THE STRIP WIDTH IS SEARCHED, NOT GUESSED, AND THE FIRST GUESS WAS MEASURABLY WRONG. ***
    // width = max(widest, sqrt(area)) reads like the obvious choice and it produced an atlas TALLER THAN WIDE
    // ON EVERY INPUT TRIED -- 1.44x2.04, 2.28x3.06, 4.67x6.12, at every polygon count from 2 to 21. A texture
    // is square, so the wasted band is (1 - w/h) of its width: 24% at 21 charts, and it never showed up as a
    // failure because occupancy was being measured against the STRIP rather than against the texture the strip
    // is padded out to. The tell was a sabotage that would not fire: `span = Math.max(width, height)` never
    // once took its first arm, an unreachable branch of the kind vacuity.mjs exists to name.
    // So candidate widths are packed and the one giving the smallest SQUARE is kept. Shelf height falls as the
    // strip widens and the square is min at the crossover; a scan is cheap (each candidate is one pack of a few
    // hundred rects) and it removes the guess rather than tuning it.
    let width = Math.max(widest, Math.sqrt(area)), packed = shelfPack(rects, { width, padding, sort }), best = Math.max(width, packed.height);
    for (let k = 1; k <= 12; k++) {
        const w = Math.max(widest, Math.sqrt(area) * (1 + 0.25 * k));
        const p = shelfPack(rects, { width: w, padding, sort });
        const span = Math.max(w, p.height);
        if (span < best) { best = span; width = w; packed = p; }
    }
    // ONE scale for the whole atlas -- the longer side, so both axes land inside [0,1] without stretching
    // either one independently. Scaling u and v by different numbers is exactly how an atlas acquires
    // anisotropic texel density while every individual chart still looks correct.
    const span = Math.max(width, packed.height) || 1;
    const scale = 1 / span;
    const uvs = charts.map((c, i) => {
        const p = packed.placements[i];
        return c.pts.map(([u, v]) => [(p.x + u) * scale, (p.y + v) * scale]);
    });
    const used = charts.reduce((s, c) => s + c.w * c.h, 0);
    // TWO occupancies, because reporting only the first is what hid the letterboxing for a whole draft.
    // `occupancy` is chart area over the STRIP -- how well the shelves packed. `textureOccupancy` is chart area
    // over the SQUARE the UVs actually address, which is what a texture costs in memory. They differ by exactly
    // the wasted band, and only the second one falls when the atlas goes long and thin.
    return { uvs, charts: packed.placements, scale, atlas: { w: width, h: packed.height },
             occupancy: used / (width * (packed.height || 1)),
             textureOccupancy: used / (span * span), ok: packed.ok };
}

/**
 * The measurement this file exists to be judged by: 3D edge length divided by UV edge length, over every edge
 * of every polygon. Uniform texel density means this set is ONE VALUE, so the spread is the finding and the
 * mean is the texels-per-world-unit a caller needs. Degenerate edges (zero length either side) are counted
 * separately rather than folded in as a ratio of zeros.
 */
export function texelDensity(polys, uvs) {
    const ratios = [];
    let degenerate = 0;
    for (let i = 0; i < polys.length; i++) {
        const vs = polys[i].vs, uv = uvs[i];
        for (let j = 0; j < vs.length; j++) {
            const k = (j + 1) % vs.length;
            const a = vs[j], b = vs[k];
            const d3 = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
            const d2 = Math.hypot(uv[k][0] - uv[j][0], uv[k][1] - uv[j][1]);
            if (d3 === 0 || d2 === 0) { degenerate++; continue; }
            ratios.push(d3 / d2);
        }
    }
    if (!ratios.length) return { n: 0, min: 0, max: 0, mean: 0, spread: 0, degenerate };
    const min = Math.min(...ratios), max = Math.max(...ratios);
    const mean = ratios.reduce((s, r) => s + r, 0) / ratios.length;
    return { n: ratios.length, min, max, mean, spread: (max - min) / (mean || 1), degenerate };
}

/** Do two placed charts overlap? Touching edges do not count -- shelves share boundaries by construction. */
export const rectsOverlap = (a, b) =>
    a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/**
 * A cube's six faces, as this module's own default subject.
 *
 * *** A BENCH ROW THAT RENDERS "PASS ME SOMETHING" IS A ROW THAT MEASURES NOTHING. *** instrument-bench.html
 * calls reportLines() with no argument, so the no-argument case has to BE a measurement rather than an
 * apology for not having one. The fixture is stated in the output, is built here rather than imported (this
 * module depends on no other), and is deliberately the simplest shape whose answer is checkable by hand: six
 * unit-square faces of a 2x2x2 cube, total area 24.
 */
export function defaultSubject() {
    const faces = [[0, 4, 6, 2], [1, 3, 7, 5], [0, 1, 5, 4], [2, 6, 7, 3], [0, 2, 3, 1], [4, 5, 7, 6]];
    const v = (i) => [(i & 1 ? 1 : -1), (i & 2 ? 1 : -1), (i & 4 ? 1 : -1)];
    return faces.map((f) => ({ vs: f.map(v) }));
}

/**
 * *** THE CALLER THAT ASKED FOR THIS, ANSWERED. ***
 *
 * physics/mesh/meshCSG.mjs tags every polygon a boolean produces SKIN or CUT, and says why in its own header:
 * the CUT faces are "freshly exposed interior that did not exist a moment ago and has no texture coordinates,
 * because nothing unwrapped a surface that had not been made yet". It has carried that tag, and that
 * sentence, waiting for something to be able to use it.
 *
 * This turns a boolean's output into a mesh with UVs. The polygons are convex and planar -- meshCSG guarantees
 * both, and its `pl` field already carries each plane -- so a fan triangulation is exact and the planar
 * unwrapper above is a complete answer rather than an approximation: projection into a polygon's own plane is
 * an isometry, so these UVs carry no distortion at all.
 *
 * `only` selects which faces to unwrap. Passing "cut" gives exactly the surface meshCSG says has no
 * coordinates, and leaves a caller's existing SKIN parameterisation alone.
 */
export function polysToMesh(polys, { only = null, ...opts } = {}) {
    const chosen = only ? polys.filter((p) => p.src === only) : polys.slice();
    if (!chosen.length) return { positions: new Float32Array(0), indices: new Uint32Array(0),
                                 uvs: new Float32Array(0), polys: 0, triangles: 0 };
    const r = unwrap(chosen, opts);
    const positions = [], indices = [], uvs = [];
    chosen.forEach((poly, i) => {
        const uv = r.uvs[i];
        if (!uv) return;
        const base = positions.length / 3;
        for (let k = 0; k < poly.vs.length; k++) {
            positions.push(poly.vs[k][0], poly.vs[k][1], poly.vs[k][2]);
            uvs.push(uv[k][0], uv[k][1]);
        }
        // fan from the first corner: exact for a convex polygon, which is what a BSP boolean emits
        for (let k = 1; k + 1 < poly.vs.length; k++) indices.push(base, base + k, base + k + 1);
    });
    return { positions: Float32Array.from(positions), indices: Uint32Array.from(indices),
             uvs: Float32Array.from(uvs), polys: chosen.length, triangles: indices.length / 3,
             atlas: r.atlas, textureOccupancy: r.textureOccupancy };
}

export function reportLines(polys = null) {
    const out = ["[uvUnwrap] planar charts, one atlas, one scale"];
    let subject = "given";
    if (!polys) { polys = defaultSubject(); subject = "this module's default subject: the six faces of a 2x2x2 cube, 24 world units of area"; }
    out.push("  subject         " + subject);
    const r = unwrap(polys);
    const d = texelDensity(polys, r.uvs);
    out.push(`  polygons        ${polys.length}`);
    out.push(`  atlas           ${r.atlas.w.toFixed(4)} x ${r.atlas.h.toFixed(4)} world units, occupancy ${(r.occupancy * 100).toFixed(1)}%`);
    out.push(`  texel density   ${d.mean.toFixed(6)} world units per UV unit, spread ${d.spread.toExponential(2)} over ${d.n} edges`);
    return out;
}
