// physics/mesh/wallCondition.mjs
//
// THE CONTROL THIS ARC OWES: A WALL WHERE ZERO-NEUMANN IS TRUE.
//
// v3642 measured a zero-Neumann repair producing a 55% wrong answer and v3643 found it WORSE THAN THE REFUSAL in
// 3D. Both rounds said the same thing about it -- "the mechanism is sound and the assertion is what is false" --
// and both named the missing measurement in as many words: A FIELD WITH A GENUINE ZERO-FLUX WALL, WHERE THE
// NEUMANN REPAIR IS EXACT AND THE HONEST CHOICE. Named three times now, deferred three times.
//
// *** IT IS THE SHAPE THIS PROJECT KEEPS FINDING TO BE THE BEST PART OF A ROUND: FIND THE REGIME WHERE THE
// EFFECT MUST VANISH AND SHOW IT VANISHING. Without it, "zero-Neumann is wrong" is a claim about ONE FIELD
// dressed as a claim about the method. ***
//
// THE FIELD: u = a + c*y, linear (so the exact key still applies -- the true gradient is the constant (0, c))
// and varying ONLY in y. On the LEFT and RIGHT walls the outward normal is +/-x, so grad u . n = 0 EXACTLY:
// those are genuine zero-flux walls. On the TOP and BOTTOM walls the normal is +/-y and grad u . n = +/-c, which
// is NOT zero.
//
// *** SO THE SAME RULE IS TRUE ON ONE WALL AND FALSE ON ANOTHER, IN THE SAME RUN, ON THE SAME FIELD -- and the
// rank-deficient corner cells touch BOTH kinds. That is what makes this fixture worth building: it separates
// "a zero-Neumann repair" from "a zero-Neumann repair applied where the wall actually is one", which every
// previous round has had to talk about instead of measure. ***
//
// BROWSER-SAFE: no imports, no DOM, no node builtins.

/** Cell values of u = a + c*y. Exact cell average on a triangle: the centroid value of a linear field. */
export function wallField(m, { a = 0.3, c = -0.4 } = {}) {
    const u = new Float64Array(m.tri.length);
    for (let t = 0; t < m.tri.length; t++) u[t] = a + c * m.cy[t];
    return { u, grad: [0, c] };
}

/** Boundary faces with their outward unit normal, tagged by which wall they belong to. */
export function wallFaces(m, { tol = 1e-9 } = {}) {
    const key = (p, q) => (p < q ? p + ":" + q : q + ":" + p);
    const count = new Map();
    for (const [a, b, c] of m.tri) for (const [p, q] of [[a, b], [b, c], [c, a]]) {
        const k = key(p, q); count.set(k, (count.get(k) || 0) + 1);
    }
    return m.tri.map((tri, t) => {
        const [a, b, c] = tri, out = [];
        for (const [p, q] of [[a, b], [b, c], [c, a]]) {
            if (count.get(key(p, q)) !== 1) continue;
            const mx = 0.5 * (m.vx[p] + m.vx[q]), my = 0.5 * (m.vy[p] + m.vy[q]);
            let nx = m.vy[q] - m.vy[p], ny = -(m.vx[q] - m.vx[p]);
            const L = Math.hypot(nx, ny); nx /= L; ny /= L;
            if (nx * (mx - m.cx[t]) + ny * (my - m.cy[t]) < 0) { nx = -nx; ny = -ny; }
            // WHICH WALL: derived from the normal itself, not from the coordinate, so a sheared mesh is handled
            // by the same test rather than by a special case.
            const kind = Math.abs(Math.abs(nx) - 1) < tol ? "x" : (Math.abs(Math.abs(ny) - 1) < tol ? "y" : "other");
            out.push({ mx, my, nx, ny, kind });
        }
        return out;
    });
}

/**
 * Least-squares gradient with optional Neumann rows on boundary faces.
 *   walls: "none" | "x" | "y" | "all"   -- which faces get a `grad u . n = 0` row.
 * The point of the parameter is that it lets the SAME rule be applied where it is true, where it is false, and
 * everywhere, in one run.
 */
export function gradientWithWalls(u, m, { walls = "none", faces = null, onlyWhere = null } = {}) {
    const F = walls === "none" ? null : (faces || wallFaces(m));
    const gx = new Float64Array(u.length), gy = new Float64Array(u.length), rank = new Int8Array(u.length);
    const rowsUsed = new Int32Array(u.length);
    for (let t = 0; t < u.length; t++) {
        const rows = [];
        for (const q of m.nbr[t]) {
            const dx = m.cx[q] - m.cx[t], dy = m.cy[q] - m.cy[t];
            rows.push([dx, dy, u[q] - u[t], 1 / (dx * dx + dy * dy)]);
        }
        if (F && (!onlyWhere || onlyWhere[t])) for (const f of F[t]) {
            if (walls === "all" || f.kind === walls) rows.push([f.nx, f.ny, 0, 1]);
        }
        rowsUsed[t] = rows.length;
        let sxx = 0, sxy = 0, syy = 0, sxu = 0, syu = 0;
        for (const [dx, dy, du, w] of rows) {
            sxx += w * dx * dx; sxy += w * dx * dy; syy += w * dy * dy; sxu += w * dx * du; syu += w * dy * du;
        }
        const det = sxx * syy - sxy * sxy, tr = sxx + syy;
        if (!(Math.abs(det) > 1e-10 * Math.max(tr * tr, 1e-300))) { rank[t] = rows.length ? 1 : 0; continue; }
        rank[t] = 2; gx[t] = (syy * sxu - sxy * syu) / det; gy[t] = (sxx * syu - sxy * sxu) / det;
    }
    return { gx, gy, rank, rowsUsed };
}

/** Error against the KNOWN constant gradient, split by deficient / healthy. */
export function wallError(m, deficientMask, opts, { a = 0.3, c = -0.4 } = {}) {
    const { u, grad } = wallField(m, { a, c });
    const g = gradientWithWalls(u, m, opts);
    const norm = Math.hypot(grad[0], grad[1]);
    let deficient = 0, healthy = 0, stillLow = 0;
    for (let t = 0; t < u.length; t++) {
        const e = Math.hypot(g.gx[t] - grad[0], g.gy[t] - grad[1]) / norm;
        if (deficientMask[t]) { deficient = Math.max(deficient, e); if (g.rank[t] < 2) stillLow++; }
        else healthy = Math.max(healthy, e);
    }
    return { deficient, healthy, stillLow };
}
