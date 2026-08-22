// Orchestration facade: scene → classified strokes → emitted render strokes →
// SVG. This is the one place the whole Phase-1 pipeline is wired end to end
// (extract → visibility → emit → backend); keeping it here leaves the backend
// pure (docs/DESIGN.md §4).
import { classifyScene } from "./visibility.js";
import { emitScene, DEFAULT_EMIT_STYLE } from "./emit.js";
import { renderStrokesSVG } from "../backend/svg.js";
export function renderScene(sources, cam, opts = {}) {
    const strokes = classifyScene(sources, cam);
    const style = opts.style ?? DEFAULT_EMIT_STYLE;
    const renderStrokes = emitScene(strokes, cam, style, opts.sample);
    const svg = renderStrokesSVG(renderStrokes, cam.viewport, opts.svg);
    return { strokes, renderStrokes, svg };
}
/** Convenience: scene → SVG string. */
export function renderSceneSVG(sources, cam, opts = {}) {
    return renderScene(sources, cam, opts).svg;
}
//# sourceMappingURL=render.js.map