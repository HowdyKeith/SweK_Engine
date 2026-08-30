// @ts-check
// WebGLEngine/ui/domToTexture.js -- v4120
//
// RASTERISE A LIVE DOM SUBTREE INTO A CANVAS, so a shader can have it.
//
// Keith, after the CRT shader landed on pipboy-models.html: fallout.html is the OTHER Pip-Boy, and it is DOM
// and CSS rather than a canvas, so the shader had nothing to sample. This is the missing step.
//
// *** IT USES SVG <foreignObject>, WHICH IS NATIVE AND HAS NO DEPENDENCIES -- AND SHARP EDGES THAT ARE
// MEASURED HERE RATHER THAN DISCOVERED LATER. *** The alternative is html2canvas or dom-to-image, which
// RE-IMPLEMENT layout and painting in JavaScript: a large dependency that is wrong in a hundred small ways and
// has to be kept in step with CSS forever. foreignObject asks the browser's own renderer to do it, so what
// comes out is what the browser actually draws -- for the things it can draw at all.
//
// *** THE ONE THAT DECIDES WHETHER THIS IS USABLE AT ALL IS TAINTING, AND IT WAS MEASURED: IT DOES NOT
// TAINT. *** A tainted canvas cannot be read back AND cannot be uploaded as a WebGL texture, which would have
// killed the whole idea. Measured in Chromium on fallout.html's real DOM: getImageData succeeds and
// texImage2D succeeds, so render/crtPass.js can consume the result. That holds because the SVG is a self-
// contained data: URL with no external references -- which is exactly what REFUSED below is protecting.
"use strict";

/**
 * *** WHAT IT CANNOT DRAW, EACH ONE MEASURED OR NAMED. *** These are not theoretical: a page that breaks one
 * of these gets a silently WRONG picture -- a blank rectangle where content should be -- rather than an error,
 * which is the worst failure shape and the reason they are listed as data instead of prose.
 */
export const REFUSED = [
    {
        what: "the bitmap inside a <canvas>",
        why: "MEASURED: a canvas filled solid magenta inside the subtree rasterised to ZERO magenta pixels, " +
             "while ordinary text and gradients in the same subtree came through (1008 green pixels). The " +
             "serializer copies the ELEMENT, and a canvas's pixels are not part of its markup.",
        workaround: "draw that canvas separately and composite it, or give the element a CSS background image",
    },
    {
        what: "cross-origin images, fonts and stylesheets",
        why: "an <img> or @font-face inside a foreignObject is fetched by the SVG image loader, which will " +
             "not reach out to another origin -- and anything it DID fetch cross-origin would taint the " +
             "canvas, which would break the WebGL upload this exists to feed.",
        workaround: "inline them as data: URLs before rasterising",
    },
    {
        what: "external stylesheets",
        why: "the fragment is rendered in isolation and <link rel=stylesheet> is not followed, so a subtree " +
             "styled from a .css file comes out UNSTYLED rather than failing. Page <style> blocks are copied " +
             "in by inlineCss() below for exactly this reason.",
        workaround: "keep the styles in a <style> block, which is what this passes through",
    },
    {
        what: "iframes, video frames, and anything drawn by a plugin",
        why: "the same rule as a canvas: what is serialised is markup, and their content is not markup",
        workaround: "none within this approach",
    },
];

/** What it cost, where, when -- so a caller can judge the frame budget rather than guess at it. */
export const MEASURED = {
    when: "2026-08-28",
    where: "headless Chromium, fallout.html's real DOM at 512x320",
    serialiseMs: 10,
    drawMs: 2,
    tainted: false,
    webglUploadOk: true,
    note: "about 12 ms per frame for a whole page. Cheap enough for a DASHBOARD refreshed a few times a " +
          "second; NOT cheap enough to do every frame at 60 Hz, which is why callers drive it on a timer.",
};

/**
 * @typedef {{ width: number, height: number, srcWidth?: number, srcHeight?: number, css?: string }} SvgOpts
 * @typedef {{ width?: number, height?: number, css?: string | null, doc?: Document | null,
 *             exclude?: string | null, stripClasses?: string[] | null }} RasterizeOpts
 */

/** Every <style> on the page, concatenated. External sheets are NOT followed -- see REFUSED.
 * @param {Document | null} [doc] @returns {string} */
export function inlineCss(doc = typeof document !== "undefined" ? document : null) {
    if (!doc) return "";
    return [...doc.querySelectorAll("style")].map((s) => s.textContent || "").join("\n");
}

/**
 * Build the SVG document that wraps a serialised subtree.
 *
 * Exported separately from the drawing so the gate can inspect the STRING without needing a browser: the
 * XHTML namespace and the viewBox are the two things that silently produce a blank image when wrong, and a
 * blank image is indistinguishable from a page that happens to be dark.
 * @param {string} xml @param {SvgOpts} opts @returns {string}
 */
export function buildSvg(xml, { width, height, srcWidth, srcHeight, css = "" }) {
    const vw = srcWidth || width, vh = srcHeight || height;
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${vw} ${vh}">` +
           `<foreignObject width="${vw}" height="${vh}">` +
           // *** THE xmlns ON THE INNER div IS NOT OPTIONAL. *** Without it the content is parsed as SVG
           // rather than XHTML and NOTHING renders -- silently, as an empty rectangle.
           `<div xmlns="http://www.w3.org/1999/xhtml">${css ? "<style>" + css + "</style>" : ""}${xml}</div>` +
           `</foreignObject></svg>`;
}

/**
 * Rasterise `el` into a canvas of `width` x `height`.
 *
 * Resolves to null rather than throwing when the browser will not load the SVG -- a caller that cannot have
 * the picture should fall back to showing the DOM, not lose the page.
 * @param {Element} el @param {RasterizeOpts} [opts] @returns {Promise<HTMLCanvasElement | null>}
 */
export async function rasterize(el, { width, height, css = null, doc = null,
                                      exclude = null, stripClasses = null } = {}) {
    if (!el || typeof document === "undefined") return null;
    const d = doc || document;
    const w = width || el.clientWidth || 512, h = height || el.clientHeight || 320;

    // cloneNode()'s declared return type is the looser Node, not Element -- true for any node in general, but
    // el IS an Element and cloning one always yields another one. Asserted once here rather than at every
    // Element-only call below (querySelectorAll, classList).
    const clone = /** @type {Element} */ (el.cloneNode(true));
    // Scripts must go: they would be serialised into the SVG, and an SVG image never executes them anyway --
    // but their TEXT would be laid out as content if the markup came through oddly.
    clone.querySelectorAll("script").forEach((n) => n.remove());

    // *** `exclude` AND `stripClasses` EXIST BECAUSE OF A BUG THAT SHIPPED BLACK. ***
    // The first version of fallout.html's CRT mode hid the page with `body.crt-shader > * { visibility:hidden }`
    // and then rasterised document.body -- so the snapshot faithfully captured the HIDDEN page and the CRT
    // view came out empty except for its own toggle button. The display state and the captured state are two
    // different things, and anything that hides the DOM for the viewer must be undone on the CLONE, which is
    // ours to edit. Doing it here rather than by toggling the real DOM avoids a visible flash and a layout
    // pass every frame.
    if (exclude) { try { clone.querySelectorAll(exclude).forEach((n) => n.remove()); } catch (e) {} }
    if (stripClasses && clone.classList) for (const c of stripClasses) clone.classList.remove(c);
    let xml;
    try { xml = new XMLSerializer().serializeToString(clone); } catch (e) { return null; }
    // <body> is not valid inside a foreignObject div; swap the tag while keeping the attributes so the page's
    // own body styling still applies to the fragment.
    xml = xml.replace(/^<body\b/, "<div").replace(/<\/body>\s*$/, "</div>");

    const svg = buildSvg(xml, {
        width: w, height: h,
        srcWidth: el.clientWidth || w, srcHeight: el.clientHeight || h,
        css: css === null ? inlineCss(d) : css,
    });

    // data:, never blob: -- a self-contained data URL with no external references is what keeps the result
    // untainted, and untainted is the whole reason this is usable as a texture.
    const url = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
    const img = new Image();
    const loaded = await new Promise((res) => { img.onload = () => res(true); img.onerror = () => res(false); img.src = url; });
    if (!loaded) return null;

    const cv = d.createElement("canvas");
    cv.width = w; cv.height = h;
    const ctx = cv.getContext("2d");
    if (!ctx) return null;
    try { ctx.drawImage(img, 0, 0, w, h); } catch (e) { return null; }
    return cv;
}
