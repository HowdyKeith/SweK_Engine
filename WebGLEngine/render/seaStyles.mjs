// WebGLEngine/render/seaStyles.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// THE SEA THE SUB AQUARIUM SHOWS, AS A CHOICE. Two kinds, and the page's picker lists both:
//   THE PHYSICS SEA, in three styles   calm (render/seaThree.mjs CALM_OPTIONS, what the page has always drawn), default (oceanSurface.mjs's own: 6 waves, longest 60 m, total slope 0.6) and rough (8 waves, longest 90 m, wind
//                                      0.5, total slope 0.85). Each is the SAME Gerstner surface a hull floats on, so the swell is real physics and not paint; it works on every GPU.
//   THE GPU SEA                        the vendored web-ocean sea (sea-host.html, behind the page's canvas, ui/seaFrame.mjs). WebGPU only; `gpuSeaAvailable` says whether this browser can try.
// Pure: no DOM beyond the navigator the caller passes in.
"use strict";
import { CALM_OPTIONS } from "./seaThree.mjs";

export const STYLES = Object.freeze({
    calm: CALM_OPTIONS,
    default: Object.freeze({ n: 6, longest: 60, shortest: 6, wind: 0.35, spread: 1.0, totalSlope: 0.6 }),
    rough: Object.freeze({ n: 8, longest: 90, shortest: 6, wind: 0.5, spread: 0.8, totalSlope: 0.85 }),
});
export const GPU = "gpu";
export const LABELS = Object.freeze({ calm: "calm sea (physics)", default: "default sea (physics)", rough: "rough sea (physics)", [GPU]: "GPU ocean (web-ocean, needs WebGPU)" });
export const DEFAULT_STYLE = "calm";

/** Is a name one the picker offers? */
export const isStyle = (name) => Object.prototype.hasOwnProperty.call(LABELS, name);

/** { ok, reason } -- can this browser try the GPU sea? It needs navigator.gpu and a secure origin; whether an adapter answers is only known by asking, which the page does when it loads the frame. */
export function gpuSeaAvailable(nav, secure) {
    if (!nav || !nav.gpu) return { ok: false, reason: "this browser has no WebGPU (navigator.gpu is absent)" };
    if (secure === false) return { ok: false, reason: "this origin is not secure, so the browser withholds WebGPU" };
    return { ok: true, reason: "" };
}
