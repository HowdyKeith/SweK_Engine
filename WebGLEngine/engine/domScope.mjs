// WebGLEngine/engine/domScope.mjs -- v4252
//
// *** THE DIRTY FLAG HAS BEEN HELD OPEN FOR TWENTY ROUNDS BY A CARTOON MASCOT ON A CLOCK IT DOES NOT OWN. ***
//
// #60 asked for three things: guard the animators, examine the rest, then MEASURE before enabling. v4231 did
// the first two. v4232 did the measurement and got 0.0% skippable in every scenario, with the last holder
// named as "domAnimation -- a CSS animation in the page chrome". That was as far as a four-second window
// could go, and it was reported as a wall rather than as a verdict.
//
// v4250 built a deterministic rAF, which is what makes the next step possible: the engine's frame count
// stops being a thing that happens to you and becomes a thing you choose. Measured on the real index.html
// with that clock (tools/ship/domScope-selfcheck.mjs holds the numbers):
//
//   - 14 animations run, 10 of them ENDLESS. They are an SVG mascot (swekBob, swekDomeHalo, swekDomeCore,
//     swekAntTip, swekBlink), a watermark fade, and four background-colour transitions. NONE is in the
//     canvas, and nothing rasterises any of them into a texture.
//
//   - *** THE TWO CLOCKS ARE INDEPENDENT, AND THIS IS THE MEASUREMENT THE WHOLE FILE RESTS ON. *** With
//     ZERO frames stepped, the mascot's pixels still differ between two consecutive screenshots. CSS
//     animations are driven by the compositor's own timeline; replacing requestAnimationFrame does not
//     replace it. So the engine cannot advance that animation by drawing, and cannot stop it by skipping.
//
//   - Meanwhile the 3D picture is measurably STILL. See the gate for the frame counts.
//
// So the flag is being held dirty, every frame, by movement the frame it wants to skip does not produce.
// That is not a wall. It is a category error, and it has a shape:
//
// *** document.getAnimations() ANSWERS "IS THE DOCUMENT MOVING". THE FLAG NEEDS "IS THE RENDER STALE". ***
//
// ---- WHAT THIS FILE DOES NOT DO, AND WHY THAT MATTERS MORE THAN WHAT IT DOES ---------------------------------
//
// It does not conclude that DOM animations never matter. There is a real path from the DOM to the scene in
// this tree and v4120 built it: ui/domToTexture.js rasterises a live subtree through SVG <foreignObject> so
// crtPass can sample it, and fallout.html uses exactly that. An animation inside a subtree somebody is
// rasterising IS in the picture, and skipping the draw there freezes a screen that should be alive.
//
// So the question is not "DOM or not" but WHICH SUBTREE, and the honest default is the one frameDirty
// already has: an animation this file cannot read is UNKNOWN, and UNKNOWN votes dirty. Narrowing a probe is
// the one change that can freeze a screen, so every uncertainty here resolves towards drawing.
"use strict";

/** What an animation can do to the RENDERED FRAME -- not to the document, which is a different picture. */
export const CHROME   = "chrome";     // the compositor draws it; the WebGL frame is not involved
export const SAMPLED  = "sampled";    // it is inside a subtree someone rasterises into a texture
export const GEOMETRY = "geometry";   // it can change the canvas's own box
export const UNKNOWN  = "unknown";    // cannot tell -- and so it draws

/** Only these four vote clean-eligible; everything else in the union means "draw". */
export const MAY_SKIP = Object.freeze([CHROME]);

/**
 * Properties that can change an element's BOX. A transform is deliberately absent: transforming an ancestor
 * of the canvas moves and scales the COMPOSITED result, and the compositor does that from the pixels the
 * last draw already produced. The drawing buffer is unchanged, so a redraw would produce the same pixels.
 *
 * *** THE ENTRIES BELOW ARE NOT AN ASSERTION THAT THEY RESIZE THE CANVAS. *** They are an assertion that
 * they can change a box, and that this tree resizes its canvas from box changes somewhere. Whether a given
 * page actually has that path wired is not something this file can see, so a layout animation on an ancestor
 * of the canvas votes DRAW rather than being reasoned about.
 */
export const LAYOUT_PROPS = Object.freeze([
    "width", "height", "min-width", "min-height", "max-width", "max-height",
    "padding", "padding-top", "padding-right", "padding-bottom", "padding-left",
    "margin", "margin-top", "margin-right", "margin-bottom", "margin-left",
    "border-width", "font-size", "flex", "flex-basis", "flex-grow", "grid-template-columns",
    "grid-template-rows", "inset", "top", "right", "bottom", "left", "zoom",
]);

const norm = (s) => String(s || "").trim().toLowerCase();

/**
 * Classify ONE animation from a plain descriptor.
 *
 * The descriptor is built in the browser (ui/domAnimate.js) and this function is pure, so the rule can be
 * tested in Node against cases no real page happens to contain -- which is the only way the sampled and
 * geometry branches get exercised at all, since index.html has neither.
 *
 * @param {{name?: string, properties?: string[], readable?: boolean,
 *          inSampledRoot?: boolean, isCanvasAncestor?: boolean}} d
 */
export function classify(d) {
    if (!d || typeof d !== "object") return UNKNOWN;
    // An unreadable animation is the case the whole fail-safe exists for: it is checked FIRST, so no later
    // branch can talk it into a clean vote.
    if (d.readable === false) return UNKNOWN;
    if (!Array.isArray(d.properties)) return UNKNOWN;
    if (d.inSampledRoot) return SAMPLED;
    if (d.isCanvasAncestor && d.properties.some((p) => LAYOUT_PROPS.includes(norm(p)))) return GEOMETRY;
    return CHROME;
}

/**
 * Classify a whole list, and say whether the frame must be drawn.
 *
 * `mustRedraw` is the only thing a caller should act on. It is TRUE unless every single animation is CHROME,
 * because one sampled animation in a list of a hundred still means the picture is stale.
 */
export function scopeOf(list) {
    const counts = { [CHROME]: 0, [SAMPLED]: 0, [GEOMETRY]: 0, [UNKNOWN]: 0 };
    const verdicts = [];
    for (const d of list || []) { const v = classify(d); counts[v]++; verdicts.push({ name: d && d.name, verdict: v }); }
    const mustRedraw = counts[SAMPLED] > 0 || counts[GEOMETRY] > 0 || counts[UNKNOWN] > 0;
    return { counts, verdicts, mustRedraw, total: verdicts.length };
}

// ---- THE REGISTRY, WHICH IS THE HALF THAT MAKES THE NARROWING SAFE -------------------------------------------
//
// Nothing above can tell whether a subtree is being rasterised; only the rasteriser knows. So the rasteriser
// says so. The registry starts EMPTY and that is the dangerous direction, so it is stated plainly here: an
// empty registry means "nobody has claimed a subtree", and every animation outside the canvas box then reads
// CHROME. A caller of ui/domToTexture.js that forgets to register is a frozen CRT screen, which is why
// registration lives in domToTexture itself rather than in its callers.

const _roots = new Set();

/** Claim a subtree as rasterised into the scene. Returns a release function. */
export function claimSampled(el) {
    if (!el) return () => {};
    _roots.add(el);
    return () => { _roots.delete(el); };
}

/** Everything currently claimed. */
export const sampledRoots = () => Array.from(_roots);

/** Is this node inside any claimed subtree? The DOM test lives here so the callers do not each write it. */
export function inSampledRoot(node) {
    if (!node) return false;
    for (const r of _roots) { if (r === node || (r.contains && r.contains(node))) return true; }
    return false;
}

/** For tests and for a page that tears everything down. */
export function clearSampled() { _roots.clear(); }
