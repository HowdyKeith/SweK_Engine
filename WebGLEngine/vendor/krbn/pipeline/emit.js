// Stage 5 (emit), first half: turn visibility-classified `Stroke`s into
// backend-ready `RenderStroke`s by sampling each visible/hidden interval to a
// screen polyline (docs/DESIGN.md §1.2 stage 5). Analytic curves stay analytic
// until exactly here — sampling is adaptive in screen space (`curve/sample.ts`).
//
// Styling proper is stage 4 (not built yet). Until then this module applies a
// minimal *default* policy so the engine's signature output — ghosted hidden
// lines — is already visible: solid for visible runs, faint dashed for hidden.
import { buildFeatureModel } from "./feature-curve.js";
import { projectionMatrix, projectPoint } from "../math/camera.js";
import { adaptiveSample, DEFAULT_SAMPLE } from "../curve/sample.js";
/**
 * Adaptively sample one interval of a feature model, returning both the screen
 * polyline and the object-space points (the latter drives arclength-anchored
 * wobble). Shared by the minimal emit here and the full styling pass.
 */
export function sampleInterval(model, t0, t1, P, opts = DEFAULT_SAMPLE) {
    const project = (p) => projectPoint(P, p).point;
    // A polyline model carries its own vertices (`knots`): it is piecewise-linear,
    // so sampling *at* the vertices in [t0,t1] reproduces it exactly. Re-running the
    // adaptive sampler over it would be lossy — a single-midpoint flatness test can
    // skip vertices and collapse a symmetric shape (a plotted sine, an S-curve) to a
    // straight chord. Analytic curves have no knots and stay adaptive.
    if (model.knots) {
        const params = [t0, ...model.knots.filter((k) => k > t0 && k < t1), t1];
        const points = params.map((t) => model.point3(t));
        return { path: points.map(project), points3: points };
    }
    const { points } = adaptiveSample((t) => model.point3(t), t0, t1, project, opts);
    return { path: points.map(project), points3: points };
}
/** A restrained default: solid dark for visible, faint dashed for hidden. */
export const DEFAULT_EMIT_STYLE = {
    visible: { weight: 1.5, color: "#1a1a1a", opacity: 1 },
    hidden: { weight: 1, color: "#1a1a1a", opacity: 0.32, dash: [4, 3] },
};
/** Emit one classified stroke as one render stroke per (styled) interval. */
export function emitStroke(stroke, cam, style = DEFAULT_EMIT_STYLE, opts = DEFAULT_SAMPLE) {
    const model = buildFeatureModel(stroke.feature.curve, cam);
    const P = projectionMatrix(cam);
    const out = [];
    for (const iv of stroke.intervals) {
        const s = iv.visible ? style.visible : style.hidden;
        if (!s)
            continue;
        const { path } = sampleInterval(model, iv.t0, iv.t1, P, opts);
        if (path.length >= 2)
            out.push({ path, style: s });
    }
    return out;
}
/** Emit a whole classified scene (flattened). */
export function emitScene(strokes, cam, style = DEFAULT_EMIT_STYLE, opts = DEFAULT_SAMPLE) {
    const out = [];
    for (const st of strokes)
        out.push(...emitStroke(st, cam, style, opts));
    return out;
}
//# sourceMappingURL=emit.js.map