// physics/mesh/curvedWall.mjs
//
// A ZERO-FLUX WALL THAT CURVES, WHERE THE CONDITION IS TRUE POINTWISE AND THE ROW IS A SINGLE NUMBER.
//
// v3645 measured a FLAT zero-flux wall and found the rule exact there and worse-than-useless one wall along. Its
// scope note named the next case in as many words: A CURVED WALL, WHERE grad u . n = 0 HOLDS POINTWISE BUT THE
// NORMAL TURNS WITHIN A CELL, SO THE SINGLE ROW IS AN AVERAGE OF A VARYING CONDITION RATHER THAN A STATEMENT.
//
// *** THAT IS A THIRD CATEGORY, AND THE WHOLE POINT OF THE ROUND. v3642-v3645 had two: an assertion that is TRUE
// (exact) and one that is FALSE (worse than the refusal). This one is TRUE AND BADLY WRITTEN DOWN -- and the
// discriminator between "badly written down" and "false" needs no tolerance at all: A DISCRETISATION ERROR
// CONVERGES UNDER REFINEMENT AND A FALSE ASSERTION DOES NOT. Both are measured on the same mesh in one run. ***
//
// THE FIXTURE IS AN ANNULUS AND THE FIELD IS POTENTIAL FLOW PAST A CYLINDER:
//
//     phi(r, theta) = U (r + a^2 / r) cos(theta)
//
// whose radial derivative is U (1 - a^2/r^2) cos(theta) -- EXACTLY ZERO AT r = a, at every angle. So the INNER
// wall is a genuine zero-flux wall that curves, and the OUTER wall at r = b is not (the radial derivative there
// is U(1 - a^2/b^2) cos theta, nonzero except at two points). ONE MESH, ONE FIELD, BOTH CASES.
//
// The field is not linear, so the key is no longer exactness -- it is the ORDER. That is stated rather than
// glossed: on a curved wall the honest question was never "is it exact" but "does the error vanish".
//
// BROWSER-SAFE: no imports, no DOM, no node builtins.

/** An annulus meshed as rings of quads split into two triangles each. Deterministic, no randomness. */
export function makeAnnulus({ nr = 8, nt = 48, a = 1, b = 3 } = {}) {
    const vx = [], vy = [];
    const vid = (i, j) => i * nt + (j % nt);                 // i = ring index, j = angular index (wraps)
    for (let i = 0; i <= nr; i++) {
        const r = a + (b - a) * i / nr;
        for (let j = 0; j < nt; j++) {
            const th = 2 * Math.PI * j / nt;
            vx.push(r * Math.cos(th)); vy.push(r * Math.sin(th));
        }
    }
    const tri = [];
    for (let i = 0; i < nr; i++) for (let j = 0; j < nt; j++) {
        const p00 = vid(i, j), p01 = vid(i, j + 1), p10 = vid(i + 1, j), p11 = vid(i + 1, j + 1);
        tri.push([p00, p01, p11]); tri.push([p00, p11, p10]);
    }
    const n = tri.length;
    const cx = new Float64Array(n), cy = new Float64Array(n), area = new Float64Array(n);
    for (let t = 0; t < n; t++) {
        const [p, q, s] = tri[t];
        cx[t] = (vx[p] + vx[q] + vx[s]) / 3; cy[t] = (vy[p] + vy[q] + vy[s]) / 3;
        area[t] = 0.5 * Math.abs((vx[q] - vx[p]) * (vy[s] - vy[p]) - (vx[s] - vx[p]) * (vy[q] - vy[p]));
    }
    const key = (p, q) => (p < q ? p + ":" + q : q + ":" + p);
    const edge = new Map();
    for (let t = 0; t < n; t++) {
        const [p, q, s] = tri[t];
        for (const [x, y] of [[p, q], [q, s], [s, p]]) {
            const k = key(x, y); if (!edge.has(k)) edge.set(k, []); edge.get(k).push(t);
        }
    }
    const nbr = tri.map(() => []);
    for (const l of edge.values()) if (l.length === 2) { nbr[l[0]].push(l[1]); nbr[l[1]].push(l[0]); }
    return { vx, vy, tri, cx, cy, area, nbr, nr, nt, a, b, h: (b - a) / nr };
}

/** phi = U (r + a^2/r) cos(theta), and its exact gradient in Cartesian components. */
export function potentialFlow({ U = 1, a = 1 } = {}) {
    const phi = (x, y) => {
        const r = Math.hypot(x, y), ct = x / r, st = y / r;
        return U * (r + a * a / r) * ct;
    };
    const grad = (x, y) => {
        const r = Math.hypot(x, y), ct = x / r, st = y / r;
        const dphidr = U * (1 - a * a / (r * r)) * ct;
        const dphidt = -U * (r + a * a / r) * st;            // d/dtheta
        // cartesian: grad = dphidr * rhat + (1/r) dphidt * thetahat
        return [dphidr * ct - (dphidt / r) * st, dphidr * st + (dphidt / r) * ct];
    };
    return { phi, grad };
}

/** Cell values, sampled at the centroid. SECOND ORDER for a non-linear field -- stated, not hidden. */
export function cellValues(m, phi) {
    const u = new Float64Array(m.tri.length);
    for (let t = 0; t < m.tri.length; t++) u[t] = phi(m.cx[t], m.cy[t]);
    return u;
}

/** Boundary faces tagged "inner" (on r = a) or "outer" (on r = b), with outward unit normals. */
export function annulusFaces(m) {
    const key = (p, q) => (p < q ? p + ":" + q : q + ":" + p);
    const count = new Map();
    for (const [p, q, s] of m.tri) for (const [x, y] of [[p, q], [q, s], [s, p]]) {
        const k = key(x, y); count.set(k, (count.get(k) || 0) + 1);
    }
    const mid = 0.5 * (m.a + m.b);
    return m.tri.map((tri, t) => {
        const [p, q, s] = tri, out = [];
        for (const [x, y] of [[p, q], [q, s], [s, p]]) {
            if (count.get(key(x, y)) !== 1) continue;
            const mx = 0.5 * (m.vx[x] + m.vx[y]), my = 0.5 * (m.vy[x] + m.vy[y]);
            let nx = m.vy[y] - m.vy[x], ny = -(m.vx[y] - m.vx[x]);
            const L = Math.hypot(nx, ny); nx /= L; ny /= L;
            if (nx * (mx - m.cx[t]) + ny * (my - m.cy[t]) < 0) { nx = -nx; ny = -ny; }
            out.push({ mx, my, nx, ny, kind: Math.hypot(mx, my) < mid ? "inner" : "outer" });
        }
        return out;
    });
}

/**
 * HOW MUCH DOES THE NORMAL TURN WITHIN ONE FACE? The angle subtended by a boundary face at the centre, which is
 * exactly 2*pi/nt and therefore O(h) -- the quantity that decides whether the single row is a good statement of
 * a pointwise condition. Measured rather than taken from the construction.
 */
export function normalTurn(m, faces) {
    let worst = 0;
    for (let t = 0; t < m.tri.length; t++) for (const f of faces[t]) {
        if (f.kind !== "inner") continue;
        // the face's endpoints both sit on r = a; the angle between their radial directions is the turn
        const [p, q, s] = m.tri[t];
        for (const [x, y] of [[p, q], [q, s], [s, p]]) {
            const rx = Math.hypot(m.vx[x], m.vy[x]), ry = Math.hypot(m.vx[y], m.vy[y]);
            if (Math.abs(rx - m.a) > 1e-9 || Math.abs(ry - m.a) > 1e-9) continue;
            const dot = (m.vx[x] * m.vx[y] + m.vy[x] * m.vy[y]) / (rx * ry);
            worst = Math.max(worst, Math.acos(Math.max(-1, Math.min(1, dot))));
        }
    }
    return worst;
}

/** Least-squares gradient with optional zero-Neumann rows on a named wall. */
export function gradientWall(u, m, { wall = "none", faces = null } = {}) {
    const F = wall === "none" ? null : (faces || annulusFaces(m));
    const gx = new Float64Array(u.length), gy = new Float64Array(u.length), rank = new Int8Array(u.length);
    for (let t = 0; t < u.length; t++) {
        const rows = [];
        for (const q of m.nbr[t]) {
            const dx = m.cx[q] - m.cx[t], dy = m.cy[q] - m.cy[t];
            rows.push([dx, dy, u[q] - u[t], 1 / (dx * dx + dy * dy)]);
        }
        if (F) for (const f of F[t]) if (wall === "both" || f.kind === wall) rows.push([f.nx, f.ny, 0, 1]);
        let sxx = 0, sxy = 0, syy = 0, sxu = 0, syu = 0;
        for (const [dx, dy, du, w] of rows) {
            sxx += w * dx * dx; sxy += w * dx * dy; syy += w * dy * dy; sxu += w * dx * du; syu += w * dy * du;
        }
        const det = sxx * syy - sxy * sxy, tr = sxx + syy;
        if (!(Math.abs(det) > 1e-10 * Math.max(tr * tr, 1e-300))) { rank[t] = rows.length ? 1 : 0; continue; }
        rank[t] = 2; gx[t] = (syy * sxu - sxy * syu) / det; gy[t] = (sxx * syu - sxy * sxu) / det;
    }
    return { gx, gy, rank };
}

/**
 * Worst gradient error on cells touching a named wall, against the analytic gradient.
 *
 * *** NORMALISED BY A SCALE TAKEN OVER THE WHOLE WALL, NOT PER CELL, AND THAT IS NOT A DETAIL. My first version
 * divided each cell's error by ITS OWN |grad|, and on a cylinder |grad| = 2U|sin theta| at r = a -- IT VANISHES
 * AT THE TWO STAGNATION POINTS. The metric therefore diverged exactly where the physics is most benign, and the
 * UNREPAIRED error appeared to RISE under refinement (2.39e-1 -> 3.45e-1 over four meshes) which no least-squares
 * gradient on a smooth field can do. AN ERROR THAT GROWS WHEN THE MESH IMPROVES IS A FACT ABOUT THE DENOMINATOR.
 * The scale is now max|grad| over the wall's cells, which is a property of the field rather than of the cell. ***
 */
export function wallSideError(m, faces, gradFn, g, which) {
    let worst = 0, scale = 0;
    for (let t = 0; t < m.tri.length; t++) {
        if (!faces[t].some((f) => f.kind === which)) continue;
        const [tx, ty] = gradFn(m.cx[t], m.cy[t]);
        scale = Math.max(scale, Math.hypot(tx, ty));
    }
    for (let t = 0; t < m.tri.length; t++) {
        if (!faces[t].some((f) => f.kind === which)) continue;
        const [tx, ty] = gradFn(m.cx[t], m.cy[t]);
        worst = Math.max(worst, Math.hypot(g.gx[t] - tx, g.gy[t] - ty));
    }
    return worst / Math.max(scale, 1e-300);
}
