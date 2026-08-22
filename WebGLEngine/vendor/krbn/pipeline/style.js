// Stage 4 — styling. Resolves a per-element `StyleSpec` (weight, colour, wobble,
// dash/ghost, hatch) and emits a classified `Stroke` as styled `RenderStroke`s:
// one run per visibility interval, visible solid / hidden ghosted, with seeded
// wobble applied to the sampled polyline (docs/DESIGN.md §2.8, §4).
//
// `importance`/`role` do not set style directly (that is the abstraction stage's
// job, §2.8); but `role` still supplies sensible styling defaults now — a
// `context` element is drawn lighter and more ghosted than a `subject`.
import { buildFeatureModel } from "./feature-curve.js";
import { cameraFrame, projectionMatrix } from "../math/camera.js";
import { sampleInterval } from "./emit.js";
import { defaultWobble, hashSeed } from "./wobble.js";
import { defaultWidth, depthEmphasis } from "./width.js";
import { DEFAULT_SAMPLE } from "../curve/sample.js";
/** Engine defaults (a restrained technical-drawing look). */
export const BASE_STYLE = {
    weight: 1.5,
    color: "#1a1a1a",
    wobble: 0,
    variableWidth: true,
    hidden: "ghost",
    ghostOpacity: 0.32,
    hiddenDash: [4, 3],
    hatch: null,
    hatchWeight: 0.7,
    hatchOpacity: 0.55,
};
/** Role-driven default overrides (§2.8: context is quieter, subject is bolder). */
export const ROLE_STYLE = {
    subject: { weight: 1.7 },
    context: { weight: 1.0, ghostOpacity: 0.2 },
    default: {},
};
/** Merge style layers over the base (later layers win). */
export function resolveStyle(...layers) {
    let out = { ...BASE_STYLE };
    for (const layer of layers)
        if (layer)
            out = { ...out, ...layer };
    return out;
}
/** Turn a resolved spec into the two concrete render styles (visible / hidden). */
export function toRenderStyles(spec) {
    const visible = { weight: spec.weight, color: spec.color, opacity: 1 };
    if (spec.visibleDash)
        visible.dash = spec.visibleDash;
    const hidden = spec.hidden === "drop"
        ? null
        : { weight: spec.weight * 0.9, color: spec.color, opacity: spec.ghostOpacity, dash: spec.hiddenDash };
    return { visible, hidden };
}
/** Emit a classified stroke as styled, wobbled render strokes. */
export function emitStyledStroke(stroke, cam, spec, opts = DEFAULT_SAMPLE, wobble = defaultWobble, width = defaultWidth) {
    const model = buildFeatureModel(stroke.feature.curve, cam);
    const P = projectionMatrix(cam);
    // Suggestive contours read as lighter "form lines" and are dropped where hidden
    // (not ghosted), per DeCarlo et al.
    const eff = stroke.feature.type === "suggestive" ? { ...spec, weight: spec.weight * 0.55, hidden: "drop" } : spec;
    const styles = toRenderStyles(eff);
    // Threshold fades (temporal coherence): the abstraction fade band and the
    // feature's own salience both scale opacity, so borderline strokes dissolve
    // smoothly instead of popping between frames.
    const fade = Math.max(0, Math.min(1, (stroke.fade ?? 1) * (stroke.feature.attrs.strength ?? 1)));
    if (fade <= 0)
        return [];
    if (fade < 1) {
        styles.visible = { ...styles.visible, opacity: styles.visible.opacity * fade };
        if (styles.hidden)
            styles.hidden = { ...styles.hidden, opacity: styles.hidden.opacity * fade };
    }
    // Seed per element (owner), NOT per feature type — so an element's silhouette,
    // rims, generators, etc. share one field and join at their common vertices.
    const seed = hashSeed(stroke.feature.owner);
    // Camera-space depth reference for the depth-emphasis cue (eye→target = focus).
    const fwd = cameraFrame(cam).forward;
    const eye = cam.eye;
    const camDepth = (p) => (p[0] - eye[0]) * fwd[0] + (p[1] - eye[1]) * fwd[1] + (p[2] - eye[2]) * fwd[2];
    const refDepth = camDepth(cam.target);
    const out = [];
    for (const iv of stroke.intervals) {
        const base = iv.visible ? styles.visible : styles.hidden;
        if (!base)
            continue;
        const sampled = sampleInterval(model, iv.t0, iv.t1, P, opts);
        if (sampled.path.length < 2)
            continue;
        const path = wobble.apply({ path: sampled.path, points3: sampled.points3, seed, amount: spec.wobble });
        if (path.length < 2)
            continue;
        // Depth emphasis (always on): nearer strokes bolder, farther thinner — folded
        // into the weight so it shows on ruler strokes and ribbons alike.
        let sum = 0;
        for (const p of sampled.points3)
            sum += camDepth(p);
        const depthScale = depthEmphasis(sum / sampled.points3.length, refDepth);
        const style = depthScale === 1 ? base : { ...base, weight: base.weight * depthScale };
        // Variable width rides the same hand knob and only the solid, non-dashed runs
        // (a filled ribbon can't be dashed); hidden/ghost runs stay uniform strokes.
        // `variableWidth: false` opts out entirely (plotter-safe constant lines).
        const w = spec.variableWidth && spec.wobble > 0 && iv.visible && !style.dash
            ? width.widths({ path, seed, baseWidth: style.weight, amount: spec.wobble })
            : undefined;
        out.push(w ? { path, style, width: w } : { path, style });
    }
    return out;
}
//# sourceMappingURL=style.js.map