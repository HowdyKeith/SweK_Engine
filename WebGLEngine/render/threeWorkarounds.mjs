// WebGLEngine/render/threeWorkarounds.mjs -- v4809
//
// *** TWO THINGS THREE r186 DRAWS WRONG, AND THE ENGINE'S WAY AROUND EACH UNTIL THREE TAKES THE PATCH. *** Both are drafted for three
// with a patch (docs/upstream-three/dev/17-*.md and 18-*.md); both are held as three's behaviour, and these workarounds held to the
// frame drawn right, by render/threeWorkarounds-selfcheck.mjs on both backends.
//
//   * ISSUE 17 (r186, #34162): a material that reads the frame behind it through transmission, drawn into one render target and then
//     into another, samples the first target's copy. A render object that did not change takes a SHARED refresh, which never rebinds
//     the texture the viewport node switched to -- and three forces a FULL refresh on a material that holds a node in ANY property.
//     refreshEveryRender gives it one that nothing reads: no pixel changes, and every render rebinds. Measured: marked and unmarked
//     draw the same bytes; marked after its first render it takes effect only once the material is rebuilt, so it sets needsUpdate.
//   * ISSUE 18 (WebGL 2, r185 and since): after readRenderTargetPixelsAsync the WebGL backend skips the next bind of the same target,
//     and the frame copy a transmission material samples reads the default framebuffer. One render into another framebuffer rebinds:
//     readTargetPixels reads, then draws an empty scene into a 1x1 target of its own -- never the canvas, which an app is showing.
"use strict";

/** The property refreshEveryRender sets: a node three never reads, there only to make three's observer refresh every render. */
export const REFRESH_MARK = "swekRefreshEveryRender";

/**
 * Mark a material so three r186 refreshes its bindings at every render (issue 17). Idempotent; returns whether it marked it now.
 * `THREE` is three.webgpu.js (its TSL namespace makes the node). Marking a material that has drawn rebuilds it once (needsUpdate).
 */
export function refreshEveryRender(THREE, material) {
    if (!material || material[REFRESH_MARK]) return false;
    material[REFRESH_MARK] = THREE.TSL.float(0);
    material.needsUpdate = true;
    return true;
}

const scratchOf = new WeakMap(), EMPTY = new WeakMap();

/**
 * readRenderTargetPixelsAsync, and on the WebGL 2 backend one empty render into a 1x1 target afterwards, so the next render into
 * `target` binds it for real (issue 18). The render target bound before the call is bound again after it. Returns the pixels.
 */
export async function readTargetPixels(THREE, renderer, target, x, y, w, h, index) {
    const px = index === undefined ? await renderer.readRenderTargetPixelsAsync(target, x, y, w, h)
                                   : await renderer.readRenderTargetPixelsAsync(target, x, y, w, h, index);
    if (renderer.backend && renderer.backend.isWebGLBackend) {
        let s = scratchOf.get(renderer); if (!s) { s = new THREE.RenderTarget(1, 1); scratchOf.set(renderer, s); }
        let e = EMPTY.get(renderer); if (!e) { e = { scene: new THREE.Scene(), camera: new THREE.Camera() }; EMPTY.set(renderer, e); }
        const keep = renderer.getRenderTarget();
        renderer.setRenderTarget(s); await renderer.renderAsync(e.scene, e.camera); renderer.setRenderTarget(keep);
    }
    return px;
}
