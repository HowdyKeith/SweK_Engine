// tools/roundhouse/csgBind.mjs
//
// v3519 -- THE CSG DEVICE (Round 2). physics/mesh/csg.mjs is a tree of EXACT signed-distance primitives with
// ANALYTIC gradients -- built so a mesh can be graded against a corner whose position is known in closed form,
// rather than against a finer mesh of itself. It had a selfcheck but no device; this is its lab reach and its
// numeric verdict.
//
// MODE "tree" grades four exact facts of an SDF tree, and one of them is the whole reason the file exists:
//
//   CORNER      *** THE ONE PLACE THIS ROUND MEASURES. *** Outside a box corner the EXACT distance is the
//               Euclidean distance to the corner (1.1e-16). A box built from max() alone -- the cheap SDF
//               everyone writes first -- UNDERESTIMATES it there, by 0.29 on this fixture. cornerErr is the key
//               that separates the exact box from the cheap one.
//   EIKONAL     an exact Euclidean distance has |grad| = 1 everywhere; the sphere's analytic gradient is a unit
//               radial vector to 1.1e-16. The gradient IS the Hermite normal a mesher needs -- a FACT, not a
//               finite difference.
//   CROSSING    edgeCrossing lands ON the surface (|p - c| = r to 1e-12), found by BISECTION on the sign rather
//               than lerping the values across a crease's kink.
//   IDEMPOTENCE union(A, A) = A to the bit, because min(x, x) = x exactly. A set identity, on the register.
//
// THE PLANT IS THE MODULE'S OWN NAMED SHORTCUT: build the box from max() alone. cornerErr jumps from 1.1e-16 to
// 0.29 -- wrong exactly at the corners -- while the sphere's eikonal, crossing and idempotence keys, which never
// touch the box, stay green. The exact corner distance is what makes CSG a gradeable ANSWER rather than a mesh
// compared against a finer copy of itself.

import { sphere, box, union, edgeCrossing } from "../../physics/mesh/csg.mjs";

const len3 = (v) => Math.hypot(v[0], v[1], v[2]);
// The module's own anti-pattern: the cheap box that is only a bound, wrong at the corners.
const boxMax = (c, h) => ({ f: (p) => Math.max(Math.abs(p[0] - c[0]) - h[0], Math.abs(p[1] - c[1]) - h[1], Math.abs(p[2] - c[2]) - h[2]) });

export const CSG_OBSERVABLES = [
    "cornerErr", "eikonalErr", "crossingErr", "idempotenceErr",
    "boxExactAtCorner", "unitGradient", "crossingOnSurface", "idempotent", "unionMembership", "planted",
];

function csgKeys(planted) {
    const H = [0.6, 0.6, 0.6], BC = [0, 0, 0];
    const B = planted ? boxMax(BC, H) : box(BC, H);
    // CORNER: exact box distance == true Euclidean distance to the nearest corner, for points outside on all axes.
    const corners = [[1, 1, 1], [1.2, 0.9, 1.1], [-1, 1, 1], [1.4, -1.2, 1.3]];
    let cornerErr = 0;
    for (const p of corners) {
        const nc = [Math.sign(p[0]) * H[0], Math.sign(p[1]) * H[1], Math.sign(p[2]) * H[2]];
        cornerErr = Math.max(cornerErr, Math.abs(B.f(p) - len3([p[0] - nc[0], p[1] - nc[1], p[2] - nc[2]])));
    }
    // EIKONAL: the sphere's analytic gradient is a unit vector everywhere.
    const S = sphere([0.1, -0.2, 0.3], 0.5);
    let eikonalErr = 0;
    for (const p of [[1, 0, 0], [0.5, 0.5, 0.5], [-0.3, 0.8, 0.1], [2, -1, 0.4]]) eikonalErr = Math.max(eikonalErr, Math.abs(len3(S.g(p)) - 1));
    // CROSSING: edgeCrossing lands on the sphere surface, |p - c| = r.
    const cr = edgeCrossing(S, [0.1, -0.2, 0.3], [3, 2, 1]);
    const crossingErr = Math.abs(len3([cr.p[0] - 0.1, cr.p[1] + 0.2, cr.p[2] - 0.3]) - 0.5);
    // IDEMPOTENCE: union(A, A) = A to the bit.
    const U = union(S, S);
    let idempotenceErr = 0;
    for (const p of [[0, 0, 0], [1, 1, 1], [0.3, 0.3, 0.3], [2, 0, 0]]) idempotenceErr = Math.max(idempotenceErr, Math.abs(U.f(p) - S.f(p)));
    // MEMBERSHIP (positive control on union semantics): a point inside one of two disjoint shapes is inside the union.
    const A2 = sphere([0, 0, 0], 0.5), C2 = sphere([3, 0, 0], 0.5);
    const unionMembership = union(A2, C2).f([0.1, 0, 0]) < 0;
    return {
        cornerErr, eikonalErr, crossingErr, idempotenceErr,
        boxExactAtCorner: cornerErr < 1e-9,
        unitGradient: eikonalErr < 1e-9,
        crossingOnSurface: crossingErr < 1e-9,
        idempotent: idempotenceErr === 0,
        unionMembership,
        planted,
    };
}

function buildCsg({ mode = "tree", config = {} } = {}) {
    const blank = {
        cornerErr: null, eikonalErr: null, crossingErr: null, idempotenceErr: null,
        boxExactAtCorner: null, unitGradient: null, crossingOnSurface: null, idempotent: null, unionMembership: null,
        planted: !!config.planted,
    };
    if (mode === "tree") return { ...blank, ...csgKeys(!!config.planted) };
    return blank;
}

export const csgDevice = {
    // v3519 -- METHOD PLANT: the perturbation swaps the exact box for the cheap max() box, a whole-method
    // substitution upstream of the corner measurement.
    plantKind: "method",
    modes: ["tree"],
    name: "csg-exact-signed-distance",
    observables: CSG_OBSERVABLES,
    build: buildCsg,
    // GUARDED: an undeclared mode returns null rather than a silent substitution.
    defaults: ({ mode } = {}) => {
        const m = mode == null ? "tree" : mode;
        return m === "tree" ? { mode: m, config: {} } : null;
    },
};
