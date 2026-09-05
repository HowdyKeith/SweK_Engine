// WebGLEngine/mesh/lathe.mjs -- v4255
//
// *** THE TREE TOOK img2threejs's JUDGE AT v3337 AND NEVER ITS SCULPTOR. ***
//
// render/perceptual.mjs and render/silhouette.mjs both cite img2threejs (Apache-2.0) by name for the rule
// that a hard gate cannot be averaged away by soft signals, and both explicitly refuse its NUMBERS -- IoU
// < 0.85 and scale delta > 0.08, tuned on photographs of knives by a different rasteriser. So this tree has
// had a way to SCORE a reconstruction against a reference image for nine hundred rounds, and has never had
// anything to score: there is no image-to-geometry path anywhere. world/repoHeightfield.js builds terrain
// from a repo tree, not from a picture.
//
// What already exists, found by grep before writing a line:
//   ev/spriteHullCore.js   -- bitmap to a 2D outline (alphaMask, radialSilhouette, silhouetteToHull)
//   mesh/extrudePolygon.mjs -- a 2D outline to an extruded prism
// and NO LATHE ANYWHERE. Which is the gap that matters, because the objects a single photograph is most
// often OF -- a bottle, a cup, a wheel, a column, a bowl, a lamp -- are solids of revolution, and a prism is
// exactly the wrong answer for all of them.
//
// ---- THE HONEST LIMIT, STATED BEFORE THE CODE RATHER THAN IN A FOOTNOTE ---------------------------------------
//
// *** A LATHE DOES NOT RECOVER A SHAPE FROM A PHOTOGRAPH. IT ASSUMES ONE. *** Revolving a profile produces
// an object whose FRONT VIEW is the profile mirrored -- so the front-view IoU against the source image is
// high almost by construction, and is close to worthless as evidence. A single photograph cannot distinguish
// a vase from a flat cardboard cutout of a vase, and no judge scoring that one view ever will.
//
// What CAN be checked is everything else: the volume against a closed form, the rotational invariance that
// says the mesh really is a solid of revolution, and the amount the front-view score FALLS when the input is
// not revolvable -- which is the only number in the loop that carries information about the assumption.
// The gate measures all three and says plainly which of them the photograph earned.
"use strict";

/**
 * A radius-per-row profile from an occupancy mask.
 *
 * For each row, the occupied span gives a centre and a half-width. The axis of revolution is the MEAN of
 * those centres, not the image centre: an object photographed slightly off-centre is still a solid of
 * revolution, and hard-coding the frame's midpoint would tilt every profile by the framing error.
 *
 * Rows with no occupancy are dropped rather than given r = 0, because a zero-radius ring welds the surface
 * shut at that height and would turn a gap into a pinch.
 */
export function profileFromMask(m, w, h) {
    const rows = [];
    for (let j = 0; j < h; j++) {
        let lo = -1, hi = -1;
        for (let i = 0; i < w; i++) if (m[j * w + i]) { if (lo < 0) lo = i; hi = i; }
        if (lo >= 0) rows.push({ y: j, lo, hi, c: (lo + hi) / 2, r: (hi - lo + 1) / 2 });
    }
    const axis = rows.length ? rows.reduce((a, b) => a + b.c, 0) / rows.length : w / 2;
    return { axis, rows: rows.map((q) => ({ y: q.y, r: q.r })), skew: rows.length
        ? Math.max(...rows.map((q) => Math.abs(q.c - axis))) : 0 };
}

/**
 * Revolve a profile about the vertical line x = axis. Units are whatever the profile's are -- the gate keeps
 * everything in PIXELS so the projection back is the identity and no scale factor can hide a fault.
 *
 * Returns a closed shell: side quads between consecutive rings, plus a cap at each end. The caps matter for
 * the volume check -- an open tube has no enclosed volume and the divergence theorem would report garbage
 * for it rather than failing loudly.
 */
export function lathe(profile, segments = 64) {
    const { axis, rows } = profile;
    const P = [], I = [];
    const ring = (r, y) => {
        const base = P.length / 3;
        for (let s = 0; s < segments; s++) {
            const t = (s / segments) * Math.PI * 2;
            P.push(axis + r * Math.cos(t), y, r * Math.sin(t));
        }
        return base;
    };
    const bases = rows.map((q) => ring(q.r, q.y));
    for (let k = 1; k < bases.length; k++) {
        const a = bases[k - 1], b = bases[k];
        for (let s = 0; s < segments; s++) {
            const n = (s + 1) % segments;
            I.push(a + s, b + s, b + n, a + s, b + n, a + n);
        }
    }
    // caps: a centre vertex at each end, fanned
    const capAt = (base, y, flip) => {
        const c = P.length / 3;
        P.push(axis, y, 0);
        for (let s = 0; s < segments; s++) {
            const n = (s + 1) % segments;
            if (flip) I.push(c, base + n, base + s); else I.push(c, base + s, base + n);
        }
    };
    if (bases.length) {
        // *** THE WINDING HERE IS LOAD-BEARING FOR THE VOLUME, NOT JUST FOR LIGHTING. *** The first draft had
        // these two flags the other way round and the divergence-theorem volume came out at EXACTLY one third
        // of a cylinder's closed form -- the caps contributing -1084033 against the sides' +2168066 instead of
        // adding. And the sphere could not see it: a sphere's caps are degenerate rings at the poles, so its
        // error was 0.3% while the cylinder's was 67%.
        capAt(bases[0], rows[0].y, false);
        capAt(bases[bases.length - 1], rows[rows.length - 1].y, true);
    }
    return { positions: Float32Array.from(P), indices: Uint32Array.from(I), segments };
}

/**
 * Enclosed volume by the divergence theorem: the sum of signed tetrahedron volumes from the origin.
 *
 * Exact for any closed triangle mesh regardless of where the origin sits, which is why no centring step is
 * needed -- PROVIDED THE WINDING IS CONSISTENT across the whole surface.
 *
 * *** I WROTE THE OPPOSITE HERE FIRST, AND THE MEASUREMENT CONTRADICTED IT. *** The original comment said a
 * sign flip between caps and sides "is a bug about normals, not about how much space the object takes up".
 * That is false: the theorem sums SIGNED tetrahedra, so a backwards cap does not merely point the wrong way,
 * it SUBTRACTS its cone of volume. With the caps reversed a cylinder measured exactly one third of pi*r^2*h.
 * Taking Math.abs at the end hides the direction of the error and none of the magnitude.
 */
export function meshVolume({ positions, indices }) {
    let v = 0;
    for (let t = 0; t < indices.length; t += 3) {
        const a = indices[t] * 3, b = indices[t + 1] * 3, c = indices[t + 2] * 3;
        const ax = positions[a], ay = positions[a + 1], az = positions[a + 2];
        const bx = positions[b], by = positions[b + 1], bz = positions[b + 2];
        const cx = positions[c], cy = positions[c + 1], cz = positions[c + 2];
        v += (ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx)) / 6;
    }
    return Math.abs(v);
}

/**
 * Orthographic silhouette into an occupancy mask, viewing the mesh after spinning it `yaw` radians about its
 * own axis. Filling every projected triangle gives the union of their footprints, which for a closed mesh IS
 * the silhouette -- no depth buffer needed, because a silhouette does not care what is in front.
 */
export function silhouetteMask(mesh, w, h, { yaw = 0, axis = 0 } = {}) {
    const m = new Uint8Array(w * h);
    const { positions, indices } = mesh;
    const ca = Math.cos(yaw), sa = Math.sin(yaw);
    const px = (i) => { const x = positions[i * 3] - axis, z = positions[i * 3 + 2]; return axis + x * ca - z * sa; };
    const py = (i) => positions[i * 3 + 1];
    for (let t = 0; t < indices.length; t += 3) {
        const i0 = indices[t], i1 = indices[t + 1], i2 = indices[t + 2];
        fillTri(m, w, h, px(i0), py(i0), px(i1), py(i1), px(i2), py(i2));
    }
    return m;
}

function fillTri(m, w, h, x0, y0, x1, y1, x2, y2) {
    const minX = Math.max(0, Math.floor(Math.min(x0, x1, x2)));
    const maxX = Math.min(w - 1, Math.ceil(Math.max(x0, x1, x2)));
    const minY = Math.max(0, Math.floor(Math.min(y0, y1, y2)));
    const maxY = Math.min(h - 1, Math.ceil(Math.max(y0, y1, y2)));
    const d = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0);
    if (Math.abs(d) < 1e-12) return;                       // edge-on triangle covers nothing
    for (let j = minY; j <= maxY; j++) {
        for (let i = minX; i <= maxX; i++) {
            const cx = i + 0.5, cy = j + 0.5;
            let a = ((x1 - cx) * (y2 - cy) - (x2 - cx) * (y1 - cy)) / d;
            let b = ((x2 - cx) * (y0 - cy) - (x0 - cx) * (y2 - cy)) / d;
            const c = 1 - a - b;
            if (a >= -1e-9 && b >= -1e-9 && c >= -1e-9) m[j * w + i] = 1;
        }
    }
}

/** IoU between two occupancy masks, in the same terms render/silhouette.mjs uses on RGBA buffers. */
export function maskIoU(a, b) {
    let inter = 0, union = 0;
    const n = Math.min(a.length, b.length);
    for (let i = 0; i < n; i++) { if (a[i] && b[i]) inter++; if (a[i] || b[i]) union++; }
    return union === 0 ? 1 : inter / union;
}

/**
 * *** THE ONLY NUMBER IN THE LOOP THAT TESTS THE ASSUMPTION RATHER THAN THE ARITHMETIC. ***
 *
 * How far the mask departs from mirror symmetry about the profile's own axis. A solid of revolution
 * photographed square-on is symmetric; anything else is not, and the size of the asymmetry bounds how much
 * of the object a lathe was ever going to reproduce. Reported as a fraction of occupied area, so it is
 * comparable across shapes of different sizes.
 */
/*
 * *** v4383 -- TWO FUNCTIONS IN THIS FILE DISAGREED ABOUT WHERE A PIXEL IS, AND NOTHING HAD EVER CROSSED THEM. ***
 *
 * silhouetteMask rasterises at pixel CENTRES: it tests (i + 0.5, j + 0.5) against the triangle. asymmetry
 * mirrored pixel INDICES: 2*axis - i. Those two conventions differ by exactly one pixel, and the difference is
 * invisible until the output of one is handed to the other -- which v4255's own gate never did. Its fixtures
 * are masks painted from index-space predicates like |i - CX| <= r, which ARE index-symmetric, so the function
 * read exactly 0 on them and looked correct.
 *
 * mesh/songLathe.mjs handed it a silhouetteMask of a perfect solid of revolution and it reported 0.098833 on a
 * smooth profile and 0.590698 on a spectrum-shaped one -- a large asymmetry FLOOR on objects that are symmetric
 * by construction, from the number this file's own header calls "THE ONLY NUMBER IN THE LOOP THAT TESTS THE
 * ASSUMPTION". With the mirror taken about pixel centres (2*axis - 1 - i) both read exactly 0.000000. The floor
 * is not a constant, which is worse than if it were: it scales with how much of the shape sits near the axis,
 * so it would have read as a property of the object rather than as an offset.
 *
 * The default is UNCHANGED, deliberately. Silently switching conventions would move every number this file's
 * two existing gates already record, and the index convention is genuinely right for an index-space axis such
 * as profileFromMask's (lo + hi) / 2. What was missing is that a caller has to SAY which space its axis is in,
 * so `centres: true` is how a caller with a silhouetteMask says so, and passing neither is now a choice rather
 * than an accident.
 */
export function asymmetry(m, w, h, axis, { centres = false } = {}) {
    let diff = 0, area = 0;
    for (let j = 0; j < h; j++) {
        for (let i = 0; i < w; i++) {
            const v = m[j * w + i];
            if (v) area++;
            const mi = Math.round(2 * axis - (centres ? 1 : 0) - i);
            const mv = (mi >= 0 && mi < w) ? m[j * w + mi] : 0;
            if (v !== mv) diff++;
        }
    }
    return area === 0 ? 0 : diff / area;
}
