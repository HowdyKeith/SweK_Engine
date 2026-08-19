// physics/mesh/rankRepair.mjs
//
// WHAT TO DO AT A CELL WHOSE GRADIENT IS UNDETERMINED -- v3640 named three options and tested none, and v3641
// made the question sharper by finding 6n of them in 3D where 2D has two.
//
// The three, and the whole point is that THEY ARE NOT THE SAME KIND OF THING:
//
//   VERTEX STENCIL   widen the neighbourhood from cells sharing a FACE to cells sharing a VERTEX. PURE GEOMETRY.
//                    It asserts nothing about the physics and needs no boundary data at all.
//   DIRICHLET        the boundary supplies the FIELD VALUE on the face. One extra equation, from data a solver
//                    genuinely has on a Dirichlet boundary.
//   NEUMANN          the boundary supplies the NORMAL DERIVATIVE -- most often as zero. Also one extra equation,
//                    and it looks like the cheapest of the three.
//
// *** BUT A NEUMANN CONDITION IS NOT A FREE REPAIR: IT ASSERTS A PHYSICAL FACT. `grad u . n = 0` closes the rank
// deficiency whether or not the field actually has zero normal derivative there, so on a field that does not, it
// does not merely fail to help -- IT MANUFACTURES A CONFIDENT WRONG ANSWER where the refusal was at least honest.
// The exact key measures exactly that: a linear field with a nonzero normal derivative at the boundary. ***
//
// THE KEY IS THE SAME ONE THIS WHOLE ARC HAS USED: reproduce a linear field exactly, or do not.
//
// BROWSER-SAFE: no imports, no DOM, no node builtins.

/** Cells sharing at least one VERTEX -- a strictly larger neighbourhood than the face neighbours. */
export function vertexNeighbours(m) {
    const byVert = new Map();
    for (let t = 0; t < m.tri.length; t++) for (const v of m.tri[t]) {
        if (!byVert.has(v)) byVert.set(v, []);
        byVert.get(v).push(t);
    }
    return m.tri.map((verts, t) => {
        const s = new Set();
        for (const v of verts) for (const q of byVert.get(v)) if (q !== t) s.add(q);
        return [...s];
    });
}

/** The outward unit normal of a cell's boundary faces, and the face midpoints, for the two data-supplied repairs. */
export function boundaryFaces(m) {
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
            out.push({ mx, my, nx, ny });
        }
        return out;
    });
}

/**
 * A weighted least-squares gradient from an arbitrary list of (dx, dy, du) rows plus optional hard rows from a
 * boundary condition. Returns the gradient and the rank, so a repair that FAILS to restore rank says so instead
 * of writing zero -- v3640's law, kept.
 */
function solveRows(rows) {
    let sxx = 0, sxy = 0, syy = 0, sxu = 0, syu = 0, tr;
    for (const [dx, dy, du, w] of rows) {
        sxx += w * dx * dx; sxy += w * dx * dy; syy += w * dy * dy;
        sxu += w * dx * du; syu += w * dy * du;
    }
    tr = sxx + syy;
    const det = sxx * syy - sxy * sxy;
    if (!(Math.abs(det) > 1e-10 * Math.max(tr * tr, 1e-300))) return { gx: 0, gy: 0, rank: rows.length ? 1 : 0 };
    return { gx: (syy * sxu - sxy * syu) / det, gy: (sxx * syu - sxy * sxu) / det, rank: 2 };
}

/**
 * mode: "none" | "vertex" | "dirichlet" | "neumann".
 *   dirichlet needs `field(x, y)` -- the boundary value a solver would have.
 *   neumann uses `normalDeriv` (default 0), which is THE ASSERTION being tested.
 */
export function gradientRepaired(u, m, {
    mode = "none", field = null, normalDeriv = 0, vnbr = null, bfaces = null,
    // *** APPLY THE REPAIR WHERE IT IS NEEDED, OR EVERYWHERE? A repair is usually written as a boundary rule and
    // applied to every boundary cell, and v3642 measures what that costs: 92 of the 94 boundary cells were
    // ALREADY EXACT, so a rule applied to all of them can only damage them. `onlyWhereDeficient` takes the mask
    // and applies the extra row ONLY where the face stencil could not determine a gradient. ***
    onlyWhereDeficient = null, trueGrad = null,
} = {}) {
    const VN = mode === "vertex" ? (vnbr || vertexNeighbours(m)) : null;
    const BF = (mode === "dirichlet" || mode === "neumann") ? (bfaces || boundaryFaces(m)) : null;
    const gx = new Float64Array(u.length), gy = new Float64Array(u.length), rank = new Int8Array(u.length);
    const stencil = new Int32Array(u.length);
    for (let t = 0; t < u.length; t++) {
        const rows = [];
        const list = mode === "vertex" ? VN[t] : m.nbr[t];
        for (const q of list) {
            const dx = m.cx[q] - m.cx[t], dy = m.cy[q] - m.cy[t];
            rows.push([dx, dy, u[q] - u[t], 1 / (dx * dx + dy * dy)]);
        }
        const applyBC = !onlyWhereDeficient || onlyWhereDeficient[t];
        if (BF && applyBC) for (const f of BF[t]) {
            if (mode === "dirichlet") {
                if (!field) continue;
                const dx = f.mx - m.cx[t], dy = f.my - m.cy[t];
                rows.push([dx, dy, field(f.mx, f.my) - u[t], 1 / (dx * dx + dy * dy)]);
            } else {
                // grad u . n = normalDeriv, written as a row with unit lever so it weighs like a close neighbour.
                // `trueGrad` supplies the HONEST normal derivative, which separates "the mechanism is broken"
                // from "the assertion is false" -- two different verdicts and only one of them is about Neumann.
                const nd = trueGrad ? (trueGrad[0] * f.nx + trueGrad[1] * f.ny) : normalDeriv;
                rows.push([f.nx, f.ny, nd, 1]);
            }
        }
        stencil[t] = rows.length;
        const s = solveRows(rows);
        gx[t] = s.gx; gy[t] = s.gy; rank[t] = s.rank;
    }
    return { gx, gy, rank, stencil };
}

/** Worst relative error against a KNOWN linear gradient, split by whether the cell was deficient to begin with. */
export function repairError(m, deficientMask, opts, { b = 0.7, c = -0.4, a = 0.3 } = {}) {
    if (opts && opts.honestNeumann) opts = { ...opts, trueGrad: [b, c] };
    const field = (x, y) => a + b * x + c * y;
    const u = new Float64Array(m.tri.length);
    for (let t = 0; t < u.length; t++) u[t] = field(m.cx[t], m.cy[t]);   // exact cell average of a linear field
    const g = gradientRepaired(u, m, { ...opts, field });
    const norm = Math.hypot(b, c);
    let deficient = 0, healthy = 0, stillRank1 = 0, maxStencil = 0;
    for (let t = 0; t < u.length; t++) {
        const e = Math.hypot(g.gx[t] - b, g.gy[t] - c) / norm;
        if (deficientMask[t]) { deficient = Math.max(deficient, e); if (g.rank[t] < 2) stillRank1++; }
        else healthy = Math.max(healthy, e);
        maxStencil = Math.max(maxStencil, g.stencil[t]);
    }
    return { deficient, healthy, stillRank1, maxStencil };
}
