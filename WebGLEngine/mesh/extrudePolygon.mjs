// WebGLEngine/mesh/extrudePolygon.mjs
// VERSION: v1 -- v3279
//
// A CLOSED POLYGON, EXTRUDED INTO A WATERTIGHT SOLID -- THE HALF OF SVG-TO-3D THAT HAS AN ANSWER KEY.
//
// Keith asked about renatoworks/3dsvg's SVG-to-extruded-3D technique. That repo fails the no-npm bar (React +
// Next.js), but the technique splits in two and the halves are NOT the same kind of work:
//
//   SVG path -> polygon   beziers, arcs, holes, winding rules. A PARSER. Subtle, and correctness is a judgement.
//   polygon  -> solid     triangulate, cap both ends, build side walls. ARITHMETIC, WITH AN ANSWER KEY.
//
// *** THIS IS THE SECOND HALF ONLY, AND SAYING SO IS THE POINT. *** A module that claimed to do SVG would be
// claiming the parser too, and the parser is where a wrong answer looks right. three's SVGLoader is NOT vendored
// here (only GLTFLoader is), so nothing is pretending otherwise.
//
// THE ANSWER KEY: a prism's volume is its cross-sectional area times its depth, and the cross-sectional area of
// a simple polygon is the SHOELACE FORMULA -- exact, closed-form, independent of how the triangulation went. So
// the mesh can be checked against a number that OWES NOTHING TO THE CODE THAT BUILT IT, which is the difference
// between a test and a restatement.

/** Signed area by the shoelace formula. Sign carries the winding, and the winding decides the normals. */
export function shoelace(pts) {
    let a = 0;
    for (let i = 0, n = pts.length; i < n; i++) {
        const p = pts[i], q = pts[(i + 1) % n];
        a += p[0] * q[1] - q[0] * p[1];
    }
    return a / 2;
}

/** Ear-clipping triangulation for a simple polygon. Returns index triples into `pts`. */
export function triangulate(pts) {
    const n = pts.length;
    if (n < 3) return [];
    // *** WORK IN A KNOWN WINDING RATHER THAN HANDLING BOTH. *** Ear clipping's convexity test flips sign with
    // the winding, and a routine that tried to support either would be two routines sharing a name.
    const ccw = shoelace(pts) > 0;
    const idx = [...Array(n).keys()];
    if (!ccw) idx.reverse();

    const at = (i) => pts[idx[i]];
    const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const inTri = (p, a, b, c) =>
        cross(a, b, p) >= 0 && cross(b, c, p) >= 0 && cross(c, a, p) >= 0;

    const out = [];
    let guard = idx.length * idx.length + 16;   // BOUNDED: a degenerate polygon must fail, not hang the caller.
    while (idx.length > 3 && guard-- > 0) {
        let clipped = false;
        for (let i = 0; i < idx.length; i++) {
            const ia = (i + idx.length - 1) % idx.length, ib = i, ic = (i + 1) % idx.length;
            const a = at(ia), b = at(ib), c = at(ic);
            if (cross(a, b, c) <= 0) continue;                       // reflex, not an ear
            let contains = false;
            for (let j = 0; j < idx.length; j++) {
                if (j === ia || j === ib || j === ic) continue;
                if (inTri(at(j), a, b, c)) { contains = true; break; }
            }
            if (contains) continue;
            out.push([idx[ia], idx[ib], idx[ic]]);
            idx.splice(ib, 1);
            clipped = true;
            break;
        }
        if (!clipped) break;   // NO EAR FOUND: self-intersecting or degenerate. Stop rather than loop.
    }
    if (idx.length === 3) out.push([idx[0], idx[1], idx[2]]);
    return out;
}

/**
 * Extrude a closed 2D polygon to depth `d`, centred on z=0.
 *
 * @returns { positions: Float32Array, indices: Uint32Array, tris, volume }
 *
 * *** THE SIDE WALLS USE THE SAME VERTEX RING AS THE CAPS, WHICH IS WHAT MAKES IT WATERTIGHT. *** Generating
 * fresh vertices for the walls would produce a mesh that LOOKS identical and has a seam of duplicate points --
 * invisible until something asks whether it is closed, or until a normal is smoothed across it.
 */
export function extrudePolygon(pts, d = 1) {
    if (!Array.isArray(pts) || pts.length < 3) throw new TypeError("extrudePolygon needs at least 3 points");
    const n = pts.length;
    const tri = triangulate(pts);
    const positions = new Float32Array(n * 2 * 3);
    for (let i = 0; i < n; i++) {
        positions[i * 3] = pts[i][0];         positions[i * 3 + 1] = pts[i][1];         positions[i * 3 + 2] = -d / 2;
        const j = (n + i) * 3;
        positions[j] = pts[i][0];             positions[j + 1] = pts[i][1];             positions[j + 2] = +d / 2;
    }
    const idx = [];
    // Back cap reversed so both caps face outward -- opposite ends of a prism cannot share a winding.
    for (const [a, b, c] of tri) { idx.push(a, c, b); idx.push(n + a, n + b, n + c); }
    for (let i = 0; i < n; i++) {
        const a = i, b = (i + 1) % n;
        idx.push(a, b, n + b);
        idx.push(a, n + b, n + a);
    }
    return { positions, indices: new Uint32Array(idx), tris: idx.length / 3,
             // THE ANSWER KEY TRAVELS WITH THE RESULT, so a caller can check without re-deriving it.
             volume: Math.abs(shoelace(pts)) * d };
}

/** Is every edge shared by exactly two triangles? The definition of watertight, asked directly. */
export function watertight(indices) {
    const edges = new Map();
    for (let i = 0; i < indices.length; i += 3) {
        const t = [indices[i], indices[i + 1], indices[i + 2]];
        for (let e = 0; e < 3; e++) {
            const a = t[e], b = t[(e + 1) % 3];
            const key = a < b ? a + ":" + b : b + ":" + a;
            edges.set(key, (edges.get(key) || 0) + 1);
        }
    }
    const bad = [...edges.entries()].filter(([, c]) => c !== 2);
    return { ok: bad.length === 0, edges: edges.size, unshared: bad.length };
}
