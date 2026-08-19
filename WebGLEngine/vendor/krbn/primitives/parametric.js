// Parametric curves: Bézier (exact carrier) and general function-defined curves
// (helix, function plot). A general parametric curve has no closed-form feature
// carrier, so it is the one primitive where per-frame, screen-adaptive sampling
// is legitimate (docs/DESIGN.md §2.3). Like a Line, a 1-D curve does not occlude.
import { aabbFromPoints } from "../math/aabb.js";
import { projectionMatrix, projectPoint } from "../math/camera.js";
import { adaptiveSample, deCasteljau } from "../curve/sample.js";
import { autoName } from "../scene/auto-id.js";
/** A general parametric curve is sampled with a uniform floor (`minDepth`) so a
 *  symmetric oscillation (a helix seen edge-on, a plotted sine) can't alias to a
 *  straight chord; adaptive refinement then resolves the tight bends. */
const PARAM_SAMPLE = { tolerancePx: 0.3, maxDepth: 20, minDepth: 5 };
/** A curve x = f(t), t ∈ [t0, t1], sampled adaptively to a polyline per frame. */
export class ParametricCurve {
    f;
    t0;
    t1;
    kind;
    id;
    autoNamed;
    opts;
    constructor(f, t0, t1, id, opts = PARAM_SAMPLE, kind = "param") {
        this.f = f;
        this.t0 = t0;
        this.t1 = t1;
        this.kind = kind;
        this.autoNamed = id === undefined;
        this.id = id ?? autoName(this.kind);
        this.opts = opts;
    }
    bounds() {
        // Coarse fixed sampling is enough for a conservative static bound.
        const n = 64;
        const pts = [];
        for (let i = 0; i <= n; i++)
            pts.push(this.f(this.t0 + ((this.t1 - this.t0) * i) / n));
        return aabbFromPoints(pts);
    }
    extractFeatures(cam) {
        const P = projectionMatrix(cam);
        const { points } = adaptiveSample(this.f, this.t0, this.t1, (p) => projectPoint(P, p).point, this.opts);
        return [
            {
                type: "boundary",
                owner: this.id,
                curve: { kind: "polyline", pts: points },
                attrs: {},
            },
        ];
    }
    hatchRegions(_cam, _light) {
        return [];
    }
    raycast(_ray) {
        return [];
    }
    projectedSilhouettes(_cam) {
        return [];
    }
}
/**
 * A Bézier curve carried *exactly* as control points (analytic until emit).
 * Sampling happens in the emit stage; extractFeatures hands over the `bezier`
 * carrier untouched.
 */
export class BezierCurve {
    control;
    kind = "bezier";
    id;
    autoNamed;
    constructor(control, id) {
        if (control.length < 2)
            throw new Error("Bézier needs at least 2 control points");
        this.control = control;
        this.autoNamed = id === undefined;
        this.id = id ?? autoName(this.kind);
    }
    bounds() {
        // The curve lies within the convex hull of its control points.
        return aabbFromPoints(this.control);
    }
    extractFeatures(_cam) {
        return [
            {
                type: "boundary",
                owner: this.id,
                curve: { kind: "bezier", pts: [...this.control] },
                attrs: {},
            },
        ];
    }
    eval(t) {
        return deCasteljau(this.control, t);
    }
    hatchRegions(_cam, _light) {
        return [];
    }
    raycast(_ray) {
        return [];
    }
    projectedSilhouettes(_cam) {
        return [];
    }
}
// --- convenience constructors ----------------------------------------------
/** A helix around `axis` through `center`, given radius, pitch (rise/turn), turns. */
export function helix(center, radius, pitch, turns, id) {
    // Axis-aligned to +z for simplicity; compose with a transform upstream if needed.
    const f = (t) => [
        center[0] + radius * Math.cos(t),
        center[1] + radius * Math.sin(t),
        center[2] + (pitch * t) / (2 * Math.PI),
    ];
    // Pass the id through (undefined stays auto-named, so the Scene re-scopes it);
    // `kind` keeps the "helix-N" prefix.
    return new ParametricCurve(f, 0, turns * 2 * Math.PI, id, PARAM_SAMPLE, "helix");
}
/** A function plot y = g(x) in the z = 0 plane over [x0, x1]. */
export function functionPlot(g, x0, x1, id) {
    const f = (x) => [x, g(x), 0];
    return new ParametricCurve(f, x0, x1, id, PARAM_SAMPLE, "plot");
}
//# sourceMappingURL=parametric.js.map