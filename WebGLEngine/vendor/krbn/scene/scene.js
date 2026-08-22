// The Scene: the authoring model and the one place the full styled pipeline runs
// (docs/DESIGN.md §2.8). It holds elements (FeatureSource + semantics), resolves a
// per-element style, and renders: classify → styled/wobbled emit → hatch (clipped
// to the visible surface) → SVG.
//
// Deferred (need intersection curves / more machinery, §2.5): `scene.intersect`
// and `scene.highlight` from the design sketch are not implemented yet.
import { Element } from "./element.js";
import { Quadric } from "../primitives/quadric.js";
import { Polygon } from "../primitives/polygon.js";
import { IntersectionCurve, intersectPlanes, intersectQuadricPlane, intersectQuadrics, } from "../primitives/intersection.js";
import { classifyFeature, classifyScene, isOccluded, sceneScale } from "../pipeline/visibility.js";
import { assignDefaultFeatureIds } from "../pipeline/identity.js";
import { consolidateLines } from "../pipeline/consolidate.js";
import { emitStyledStroke, resolveStyle, ROLE_STYLE } from "../pipeline/style.js";
import { defaultHatch, hatchAngles, toneToSpacing } from "../pipeline/hatch.js";
import { defaultWobble, hashSeed } from "../pipeline/wobble.js";
import { defaultWidth } from "../pipeline/width.js";
import { applyAbstraction, quantizeTone } from "../pipeline/abstract.js";
import { renderItemsSVG } from "../backend/svg.js";
import { cameraFrame, projectionMatrix, projectPoint, unproject } from "../math/camera.js";
import { distance, dot, normalize } from "../math/vec3.js";
import { EPS_DEPTH_REL } from "../curve/epsilon.js";
const HATCH_STEP_PX = 4; // sample spacing when clipping a hatch line to visibility
const HATCH_WOBBLE_SCALE = 0.6; // hatch wobble is subtler than the outline's
export class Scene {
    elements = [];
    byId = new Map();
    highlights = [];
    // per-kind occurrence counter → scene-local ids (`quadric-0`, `quadric-1`, …),
    // so identity (and thus wobble) is scene-scoped, not process-global.
    kindCounts = new Map();
    light;
    defaultStyle;
    sample;
    svgOptions;
    wobble;
    width;
    hatch;
    abstraction;
    constructor(opts = {}) {
        this.light = opts.light ?? { direction: normalize([-0.5, -1, -0.8]) };
        this.defaultStyle = { ...opts.style };
        this.sample = opts.sample;
        this.svgOptions = opts.svg;
        this.wobble = opts.wobble ?? defaultWobble;
        this.width = opts.width ?? defaultWidth;
        this.hatch = opts.hatch ?? defaultHatch;
        this.abstraction = opts.abstraction ?? {};
    }
    /** Add a feature source to the scene; returns its element for configuration. */
    add(source, opts) {
        // Re-scope an auto-named source to a deterministic scene-local id, so the
        // scene's appearance never depends on how many sources were built before it
        // elsewhere in the process (wobble seeds on this id).
        if (source.autoNamed) {
            const kind = source.kind ?? "element";
            const n = this.kindCounts.get(kind) ?? 0;
            this.kindCounts.set(kind, n + 1);
            source.id = `${kind}-${n}`;
            source.autoNamed = false;
        }
        const el = new Element(source, opts);
        this.elements.push(el);
        this.byId.set(el.id, el);
        return el;
    }
    sources() {
        return this.elements.map((e) => e.source);
    }
    /**
     * Emphasize an element: its features are re-extracted and drawn heavier and
     * *on top of everything* (docs/DESIGN.md §2.8). With `dashWhenHidden`, occluded
     * parts are dashed rather than dropped — an x-ray highlight.
     */
    highlight(el, opts = {}) {
        this.highlights.push({ id: el.id, opts });
        return this;
    }
    /**
     * Add the intersection curve of two elements as a first-class feature
     * (docs/DESIGN.md §2.5). Supports quadric ∩ plane, quadric ∩ quadric (radical-
     * plane conic where the quadratic parts match, otherwise the traced quartic),
     * and plane ∩ plane. `emphasis: 'bold'` draws the waterline heavier.
     */
    intersect(a, b, opts = {}) {
        const sections = this.sectionsFor(a.source, b.source);
        const source = new IntersectionCurve(sections, `intersect:${a.id}∩${b.id}`);
        const emphasis = opts.emphasis === "bold" ? { weight: 2.6 } : {};
        return this.add(source, { style: { ...emphasis, ...opts.style } });
    }
    sectionsFor(sa, sb) {
        const one = (s) => (s ? [s] : []);
        const qA = sa instanceof Quadric;
        const qB = sb instanceof Quadric;
        const pA = sa instanceof Polygon;
        const pB = sb instanceof Polygon;
        if (qA && pB)
            return one(intersectQuadricPlane(sa.Q, sb.vertices[0], sb.normal));
        if (pA && qB)
            return one(intersectQuadricPlane(sb.Q, sa.vertices[0], sa.normal));
        if (qA && qB)
            return intersectQuadrics(sa.Q, sb.Q, sa.bounds(), sb.bounds());
        if (pA && pB) {
            const ba = sa.bounds();
            const bb = sb.bounds();
            const extent = Math.max(distance(ba.min, ba.max), distance(bb.min, bb.max));
            return one(intersectPlanes(sa.vertices[0], sa.normal, sb.vertices[0], sb.normal, extent));
        }
        throw new Error(`scene.intersect: unsupported pair ${sa.constructor.name} ∩ ${sb.constructor.name}`);
    }
    /** Fully-resolved style for an owner: base ← role ← scene default ← element. */
    resolveSpec(owner) {
        const el = this.byId.get(owner);
        return resolveStyle(el ? ROLE_STYLE[el.role] : undefined, this.defaultStyle, el?.styleOverride);
    }
    /** Run the whole pipeline and return strokes, render strokes, and SVG.
     *  `opts.reconcileFeatures` is the temporal-coherence seam — see
     *  `classifyScene`; a `FrameSession` supplies it to carry identity across
     *  frames. A bare `render(cam)` stays a pure function of the camera. */
    render(cam, opts = {}) {
        const sources = this.sources();
        const classified = classifyScene(sources, cam, opts.reconcileFeatures);
        const scale = sceneScale(sources);
        // Stage 3: importance-scaled screen-size thresholding.
        let strokes = applyAbstraction(classified, {
            minFeaturePx: this.abstraction.minFeaturePx ?? 0,
            importanceOf: (owner) => this.byId.get(owner)?.importance ?? 0.5,
        });
        // Stage 3: cross-primitive consolidation — merge coincident lines, then
        // re-classify each merged 3-D segment for exact visibility.
        if (this.abstraction.consolidate) {
            const { singles, merged } = consolidateLines(strokes, cam);
            strokes = [
                ...singles,
                ...merged.map((m) => classifyFeature({
                    type: m.type,
                    owner: m.owner,
                    // identity anchors on the minimal member (a persistent id when a
                    // FrameSession is driving), so the merged stroke stays nameable
                    // across frames despite cluster-fringe churn
                    id: `${m.memberIds[0] ?? `${m.owner}/${m.type}`}~merged`,
                    curve: { kind: "line", a: m.a, b: m.b },
                    attrs: {},
                }, cam, sources, scale)),
            ];
        }
        // `output: false` elements still occlude (they are in `sources` above and so
        // classify everything else) but emit no strokes of their own — the per-colour
        // layer split for multi-pen plotting. Gate every emit path on it (outlines,
        // hatch, highlights); visibility/occlusion upstream is untouched.
        const outlineStrokes = [];
        for (const st of strokes) {
            if (this.byId.get(st.feature.owner)?.output === false)
                continue;
            outlineStrokes.push(...emitStyledStroke(st, cam, this.resolveSpec(st.feature.owner), this.sample, this.wobble, this.width));
        }
        const hatchStrokes = [];
        const lightDir = normalize(this.light.direction);
        for (const el of this.elements) {
            if (!el.output)
                continue;
            const spec = this.resolveSpec(el.id);
            if (!spec.hatch)
                continue;
            const levels = this.abstraction.toneLevels ?? 0;
            const hstyle = { weight: spec.hatchWeight, color: spec.color, opacity: spec.hatchOpacity };
            const nLayers = hatchAngles(spec.hatch.mode, spec.hatch.angle).length;
            // Hatch shares the outline's coherent wobble field, scaled down (finer
            // lines) and seeded *per hatch line* so adjacent lines vary independently
            // instead of warping in lockstep. Off (amount 0) leaves the run crisp.
            const wobbleAmt = spec.wobble * HATCH_WOBBLE_SCALE;
            const ownerSeed = hashSeed(el.id);
            // Seeds key on the *line's* stable identity (atlas streamline key, offset
            // index from the region anchor), never on emission order — so a run count
            // change (visibility clip, region growth) cannot re-deal every line's
            // wobble (temporal coherence). Runs clipped from one line share the seed;
            // the object-anchored wobble field keeps them mutually coherent.
            const emitHatch = (run, lineKey) => {
                if (run.path.length < 2)
                    return;
                if (wobbleAmt <= 0) {
                    hatchStrokes.push({ path: run.path, style: { ...hstyle } });
                    return;
                }
                const seed = ownerSeed ^ hashSeed(lineKey);
                const path = this.wobble.apply({ path: run.path, points3: run.points3, seed, amount: wobbleAmt });
                // hatch width rides the same (scaled) hand knob as its wobble — unless the
                // element opts out of variable width (plotter-safe), then stays a plain line.
                if (!spec.variableWidth) {
                    hatchStrokes.push({ path, style: { ...hstyle } });
                    return;
                }
                const width = this.width.widths({ path, seed, baseWidth: hstyle.weight, amount: wobbleAmt });
                hatchStrokes.push({ path, style: { ...hstyle }, width });
            };
            // Prefer a primitive's exact curved direction field (rings/rulings/…) when
            // it exposes one; the iso-curves follow surface curvature and their hidden
            // half falls out of the same front-face + occlusion test. Otherwise fall
            // back to straight parallel hatch over the flat/quadric footprint. §2.6
            const regions = el.source.hatchRegions(cam, this.light);
            // Object-anchor the straight-hatch phase (temporal coherence): the family
            // runs through the projection of the source's bounds centre, so panning
            // moves hatch *with* the object. Sources may supply a better anchor.
            if (regions.length) {
                const b = el.source.bounds();
                const anchorPx = projectPoint(projectionMatrix(cam), [
                    (b.min[0] + b.max[0]) / 2,
                    (b.min[1] + b.max[1]) / 2,
                    (b.min[2] + b.max[2]) / 2,
                ]).point;
                for (const r of regions)
                    r.anchorPx ??= anchorPx;
            }
            const baseTone = regions[0]?.tone ?? 0.5;
            const fieldTone = levels > 0 ? quantizeTone(baseTone, levels) : baseTone;
            const spacingPx = spec.hatch.spacingPx ?? toneToSpacing(fieldTone);
            const field = spec.hatch.field === false ? undefined : el.source.hatchField?.(cam, { spacingPx, maxFamilies: nLayers });
            if (field && field.length > 0) {
                for (let layer = 0; layer < Math.min(nLayers, field.length); layer++) {
                    const maxDiffuse = layerBrightness(layer, nLayers);
                    const curves = field[layer].curves;
                    for (let ci = 0; ci < curves.length; ci++) {
                        const curve = curves[ci];
                        const lineKey = `f${layer}:${curve.key ?? ci}`;
                        for (const run of clipHatchField(curve, cam, sources, scale, lightDir, maxDiffuse))
                            emitHatch(run, lineKey);
                    }
                }
                continue;
            }
            for (const region of regions) {
                const tone = levels > 0 ? quantizeTone(region.tone, levels) : region.tone;
                const spacingOpts = spec.hatch.spacingPx != null ? { spacingPx: spec.hatch.spacingPx } : {};
                // Tonal layering: draw one angle set per layer, each clipped to the part
                // of the surface dark enough for that layer, so curved surfaces shade
                // light→dark (flat faces get a uniform number of layers). §2.6
                const angles = hatchAngles(spec.hatch.mode, spec.hatch.angle);
                for (let layer = 0; layer < angles.length; layer++) {
                    const maxDiffuse = layerBrightness(layer, angles.length);
                    const single = { ...region, mode: "single", angle: angles[layer], tone };
                    const lines = this.hatch.generateLines?.(single, spacingOpts) ?? this.hatch.generate(single, spacingOpts).map((seg, i) => ({ seg, key: `i${i}` }));
                    for (const line of lines) {
                        const lineKey = `s${layer}:${line.key}`;
                        for (const run of clipHatchTonal(line.seg, el.source, cam, sources, scale, lightDir, maxDiffuse))
                            emitHatch(run, lineKey);
                    }
                }
            }
        }
        // Highlights: re-extract + re-classify each highlighted element and draw it
        // last (on top), heavier, dashed-where-hidden if requested. The optional halo
        // is emitted as ONE opacity group per highlight, so its overlapping
        // semi-transparent segments composite once instead of compounding at the ends.
        const haloGroups = [];
        const crispStrokes = [];
        for (const h of this.highlights) {
            const el = this.byId.get(h.id);
            if (!el)
                continue;
            if (!el.output)
                continue;
            const base = this.resolveSpec(h.id);
            const spec = resolveStyle(base, {
                weight: h.opts.weight ?? base.weight * 1.6,
                color: h.opts.color ?? base.color,
                hidden: h.opts.dashWhenHidden ? "ghost" : "drop",
                ghostOpacity: 0.55,
                hatch: null,
            });
            const halo = h.opts.halo;
            const haloSpec = halo ? resolveStyle(spec, { weight: halo.weight ?? spec.weight * 3.5, color: halo.color ?? spec.color, hidden: "ghost" }) : null;
            const haloMembers = [];
            for (const feature of assignDefaultFeatureIds(el.source.extractFeatures(cam))) {
                const stroke = classifyFeature(feature, cam, sources, scale, el.source);
                if (haloSpec) {
                    // a continuous glow around the whole contour: opaque members, one group opacity
                    for (const rs of emitStyledStroke(stroke, cam, haloSpec, this.sample, this.wobble)) {
                        haloMembers.push({ path: rs.path, style: { weight: rs.style.weight, color: rs.style.color, opacity: 1 } });
                    }
                }
                crispStrokes.push(...emitStyledStroke(stroke, cam, spec, this.sample, this.wobble, this.width));
            }
            if (haloMembers.length)
                haloGroups.push({ opacity: halo?.opacity ?? 0.25, strokes: haloMembers });
        }
        // draw order: hatch, outlines, halo glow, crisp highlights on top
        const items = [...hatchStrokes, ...outlineStrokes, ...haloGroups, ...crispStrokes];
        const renderStrokes = [...hatchStrokes, ...outlineStrokes, ...haloGroups.flatMap((g) => g.strokes), ...crispStrokes];
        const svg = renderItemsSVG(items, cam.viewport, this.svgOptions);
        return { strokes, renderStrokes, svg };
    }
    /** Convenience: render directly to an SVG string. */
    toSVG(cam) {
        return this.render(cam).svg;
    }
}
/** The front surface hit (point + normal) seen at a pixel on the owner source,
 *  or null. The depth floor is relative to scene scale (matches the QI self-hit
 *  skip). */
function surfaceHit(source, cam, pt, scale) {
    const hits = source.raycast(unproject(cam, pt));
    const floor = EPS_DEPTH_REL * scale;
    for (const h of hits)
        if (h.t > floor)
            return h;
    return null;
}
/** Brightness ceiling for tonal layer `i` of `n`: layer 0 covers all but the
 *  brightest highlight, deeper layers only progressively darker surface. */
function layerBrightness(i, n) {
    return 0.95 * ((n - i) / n);
}
/**
 * Split a hatch segment into the runs that survive both tests, sampled along the
 * segment: (1) visible — on the owner's front surface and not occluded by
 * anything nearer (gaps reveal what is behind, §2.6); (2) dark enough — the local
 * Lambert term N·L is below `maxDiffuse`, which is what shades curved surfaces
 * light→dark across the tonal layers.
 */
function clipHatchTonal(seg, owner, cam, sources, scale, lightDir, maxDiffuse) {
    const [a, b] = seg;
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const k = Math.max(2, Math.ceil(len / HATCH_STEP_PX));
    const runs = [];
    let run = { path: [], points3: [] };
    for (let i = 0; i <= k; i++) {
        const t = i / k;
        const pt = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
        const hit = surfaceHit(owner, cam, pt, scale);
        let keep = false;
        if (hit && !isOccluded(hit.point, cam, sources, scale)) {
            const diffuse = Math.max(0, -(hit.normal[0] * lightDir[0] + hit.normal[1] * lightDir[1] + hit.normal[2] * lightDir[2]));
            keep = diffuse < maxDiffuse;
        }
        if (keep && hit) {
            run.path.push(pt);
            run.points3.push(hit.point);
        }
        else {
            if (run.path.length >= 2)
                runs.push(run);
            run = { path: [], points3: [] };
        }
    }
    if (run.path.length >= 2)
        runs.push(run);
    return runs;
}
/**
 * Clip one exact iso-parameter *field* curve (a ring, ruling, poloidal circle…)
 * to the runs that render. Unlike straight hatch, each sample carries its own
 * surface point + normal, so a point survives when it is (1) front-facing,
 * (2) not occluded — by this surface or any other, which drops each curve's
 * hidden half exactly — and (3) dark enough for the tonal layer (N·L below
 * `maxDiffuse`). Surviving samples are projected and emitted as screen runs.
 */
function clipHatchField(curve, cam, sources, scale, lightDir, maxDiffuse) {
    const P = projectionMatrix(cam);
    const persp = cam.projection === "perspective";
    const forward = cameraFrame(cam).forward;
    const runs = [];
    let run = { path: [], points3: [] };
    for (const { p, n } of curve.samples) {
        const view = persp ? normalize([p[0] - cam.eye[0], p[1] - cam.eye[1], p[2] - cam.eye[2]]) : forward;
        const front = dot(n, view) < 0;
        let keep = false;
        if (front && !isOccluded(p, cam, sources, scale)) {
            const diffuse = Math.max(0, -(n[0] * lightDir[0] + n[1] * lightDir[1] + n[2] * lightDir[2]));
            keep = diffuse < maxDiffuse;
        }
        if (keep) {
            run.path.push(projectPoint(P, p).point);
            run.points3.push([p[0], p[1], p[2]]);
        }
        else {
            if (run.path.length >= 2)
                runs.push(run);
            run = { path: [], points3: [] };
        }
    }
    if (run.path.length >= 2)
        runs.push(run);
    return runs;
}
//# sourceMappingURL=scene.js.map