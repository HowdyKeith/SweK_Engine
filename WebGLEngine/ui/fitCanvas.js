// ui/fitCanvas.js -- make a lab canvas fill the page it lives on.
//
// v2872. Keith: "the viewport is very small to see the action". It was -- wind-tunnel drew a 110x41 lattice into
// a canvas nailed to 440x164 in a flex row, so the interesting part occupied about a fifth of a 1080p screen.
//
// THERE ARE TWO KINDS OF LAB CANVAS HERE AND THEY NEED OPPOSITE FIXES. Applying one rule to both is how you end
// up with a blurry plot or a lattice smeared into mush.
//
//   A FIELD (wind-tunnel, ising, fanbeam, ct, interferometer): the backing store IS the simulation grid. One
//   pixel is one cell, and that is the honest resolution -- there is no more detail to draw. So DO NOT enlarge
//   the backing store; enlarge the DISPLAY with CSS and keep image-rendering: pixelated, so a cell stays a
//   visible square instead of being interpolated into a smear. Making the backing store bigger here would invent
//   detail the simulation does not have, which is exactly the kind of prettier-than-true this lab avoids.
//
//   A PLOT (kepler, schrodinger, splat-lab): the canvas is a DRAWING, and its resolution is whatever you ask for.
//   CSS-scaling it just blurs the lines. So resize the BACKING STORE to the container (times devicePixelRatio)
//   and redraw at the new size -- the curve is then genuinely sharper, not stretched.
//
// Both helpers preserve aspect ratio, because a wind tunnel drawn at the wrong aspect is a lie about the flow.
"use strict";

/**
 * FIELD canvases. CSS-scale only; the backing store is left exactly as the simulation set it.
 * @param {HTMLCanvasElement} cv
 * @param {{maxWidth?: number, pixelated?: boolean}} [opts] maxWidth caps the blow-up so a 64x64 lattice does not
 *        become a wall of dinner plates on an ultrawide.
 */
export function fitField(cv, opts = {}) {
    if (!cv) return;
    const maxW = opts.maxWidth || 1400;
    const pixelated = opts.pixelated !== false;
    cv.style.width = "100%";
    cv.style.maxWidth = maxW + "px";
    cv.style.height = "auto";
    // aspect-ratio keeps the lattice honest even before the first frame paints.
    if (cv.width && cv.height) cv.style.aspectRatio = cv.width + " / " + cv.height;
    if (pixelated) {
        cv.style.imageRendering = "pixelated";
        cv.style.setProperty("image-rendering", "crisp-edges");
        cv.style.setProperty("image-rendering", "pixelated");
    }
    cv.style.display = "block";
}

/**
 * PLOT canvases. Resize the backing store to the element's CSS box times devicePixelRatio, then redraw.
 * @param {HTMLCanvasElement} cv
 * @param {function} redraw      called after every resize; must repaint from scratch
 * @param {{aspect?: number, maxWidth?: number, minWidth?: number}} [opts] aspect = h/w, defaults to the canvas's
 *        own starting ratio so an existing page keeps its proportions.
 * @returns {function} a detach function, so a page that swaps views does not leak a listener
 */
export function fitPlot(cv, redraw, opts = {}) {
    if (!cv) return () => {};
    const aspect = opts.aspect || (cv.height / cv.width) || 0.5;
    const maxW = opts.maxWidth || 1400;
    const minW = opts.minWidth || 240;
    let raf = 0;
    function apply() {
        raf = 0;
        const parent = cv.parentElement;
        const avail = Math.max(minW, Math.min(maxW, (parent ? parent.clientWidth : cv.clientWidth) || cv.width));
        // devicePixelRatio matters: on a HiDPI screen a 1:1 backing store is drawn at half resolution and looks
        // soft for reasons that have nothing to do with the maths.
        const dpr = Math.min(3, Math.max(1, window.devicePixelRatio || 1));
        const cssW = Math.round(avail), cssH = Math.round(avail * aspect);
        cv.style.width = cssW + "px";
        cv.style.height = cssH + "px";
        const bw = Math.round(cssW * dpr), bh = Math.round(cssH * dpr);
        if (cv.width !== bw || cv.height !== bh) { cv.width = bw; cv.height = bh; }
        try { redraw(cv, dpr); } catch (e) { /* a redraw that throws must not kill the resize handler */ }
    }
    const onResize = () => { if (!raf) raf = requestAnimationFrame(apply); };
    window.addEventListener("resize", onResize);
    apply();
    return () => window.removeEventListener("resize", onResize);
}
