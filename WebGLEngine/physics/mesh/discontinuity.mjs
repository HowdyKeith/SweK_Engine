// physics/mesh/discontinuity.mjs
//
// THE VERTEX STENCIL ON TRIAL. v3642 and v3643 recommended it twice -- it is the only repair for an undetermined
// gradient that needs no boundary data at all -- and both rounds named the same untested assumption in as many
// words: IT ASSUMES THE FIELD IS SMOOTH ENOUGH THAT A DISTANT CELL IS INFORMATIVE. Across a material interface or
// a shock that is exactly the assumption that fails, and here it is the WIDENING rather than the boundary
// condition that is being measured.
//
// *** THE KEY IS EXACT AND IT NEEDS NO TOLERANCE, WHICH IS WHY THIS IS MEASURABLE AT ALL. The field is
// PIECEWISE LINEAR: one linear field left of an interface, a different one right of it, with a jump between. On
// either side the true gradient is a KNOWN CONSTANT. So any cell whose whole stencil lies on ONE side must
// return that side's gradient EXACTLY -- and any cell that returns something else has been CONTAMINATED. The
// question is not how big the error is, it is HOW MANY CELLS ARE WRONG AND HOW FAR THE DAMAGE REACHES. ***
//
// THE INTERFACE IS PLACED ON A MESH LINE ON PURPOSE. With the unsheared mesh a vertical line at x = k*h is
// exactly a union of cell edges, so NO CELL STRADDLES IT and every cell's average is exactly its own side's
// linear field at its centroid. That removes the one thing that would otherwise blur the measurement -- a
// straddling cell whose true average is neither side's value -- and it is stated rather than hidden, because a
// sheared mesh does NOT have that property and the gate reports that case separately.
//
// BROWSER-SAFE: no imports, no DOM, no node builtins.

/** Which side of the interface a point is on: -1 left, +1 right. */
export const sideOf = (x, xi) => (x < xi ? -1 : 1);

/**
 * A piecewise-linear field: gradA left of x = xi, gradB right of it, with `jump` added on the right.
 * Cell values are the field at the centroid, which IS the exact cell average when the cell lies wholly on one
 * side of a straight interface -- true for every cell when the interface sits on a mesh line.
 */
export function piecewiseCells(m, { xi = 10, gradA = [0.7, -0.4], gradB = [-0.3, 0.9], jump = 2.5, a = 0.3 } = {}) {
    const u = new Float64Array(m.tri.length), side = new Int8Array(m.tri.length);
    for (let t = 0; t < m.tri.length; t++) {
        const s = sideOf(m.cx[t], xi);
        side[t] = s;
        u[t] = s < 0 ? a + gradA[0] * m.cx[t] + gradA[1] * m.cy[t]
            : a + jump + gradB[0] * (m.cx[t] - xi) + gradB[1] * m.cy[t];
    }
    return { u, side };
}

/** Does any cell in this stencil sit on the other side? Cells whose stencil is clean must be exact. */
export function stencilCrosses(m, neighbours, side) {
    const out = new Uint8Array(m.tri.length);
    for (let t = 0; t < m.tri.length; t++) {
        for (const q of neighbours[t]) if (side[q] !== side[t]) { out[t] = 1; break; }
    }
    return out;
}

/** Straight-line distance from a cell centroid to the interface, in units of the mesh spacing. */
export function distanceToInterface(m, xi) {
    const d = new Float64Array(m.tri.length);
    for (let t = 0; t < m.tri.length; t++) d[t] = Math.abs(m.cx[t] - xi) / m.h;
    return d;
}

/**
 * The census this round exists for. For a given neighbour list, split every cell into:
 *   clean      -- stencil wholly on one side. MUST be exact; any error here is a defect in the method.
 *   crossing   -- stencil spans the interface. Contaminated by construction; the question is HOW MANY.
 * and report the reach: the largest distance-to-interface at which a cell is still crossing.
 */
// *** `skipMask` EXISTS BECAUSE MY FIRST CENSUS MIXED TWO DEFECTS. It reported worstClean = 1.000 for the FACE
// stencil and 3.296e-15 for the VERTEX one, which reads as the discontinuity punishing the narrow stencil -- and
// it is nothing of the kind. The 1.000 is the RANK-DEFICIENT CORNER CELLS from v3640 returning a zero gradient,
// a defect the vertex stencil REPAIRS (v3642) and which has no connection to the interface at all. TWO DEFECTS IN
// ONE NUMBER, and the one that was really being measured was the wrong one. Cells that the FACE stencil cannot
// determine are excluded from BOTH columns, so the comparison is about the discontinuity and nothing else. ***
export function contaminationCensus(m, neighbours, { xi = 10, gradA = [0.7, -0.4], gradB = [-0.3, 0.9], jump = 2.5, gradFn, skipMask = null } = {}) {
    const { u, side } = piecewiseCells(m, { xi, gradA, gradB, jump });
    const cross = stencilCrosses(m, neighbours, side);
    const dist = distanceToInterface(m, xi);
    const g = gradFn(u, m, neighbours);
    let nClean = 0, nCross = 0, worstClean = 0, worstCross = 0, reach = 0, sumCross = 0;
    const normA = Math.hypot(...gradA), normB = Math.hypot(...gradB);
    for (let t = 0; t < m.tri.length; t++) {
        if (neighbours[t].length === 0) continue;
        if (skipMask && skipMask[t]) continue;
        const truth = side[t] < 0 ? gradA : gradB;
        const norm = side[t] < 0 ? normA : normB;
        const e = Math.hypot(g.gx[t] - truth[0], g.gy[t] - truth[1]) / norm;
        if (cross[t]) { nCross++; worstCross = Math.max(worstCross, e); sumCross += e; reach = Math.max(reach, dist[t]); }
        else { nClean++; worstClean = Math.max(worstClean, e); }
    }
    // sumCross is the INTEGRATED damage: a peak error over a narrow band and a smaller one over a wide band are
    // not comparable by their peaks alone, and this round's whole question is which trade the widening makes.
    return { nClean, nCross, worstClean, worstCross, sumCross, reach, total: m.tri.length };
}
