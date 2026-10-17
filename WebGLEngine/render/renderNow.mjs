// WebGLEngine/render/renderNow.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// renderer.renderAsync(scene, camera) without the deprecation. three r181 deprecated it ("THREE.Renderer: renderAsync() has been deprecated. Use render() and await renderer.init() when creating the
// renderer", logged once per load by three.webgpu.js -- the console line Keith's rig showed on fsr-three.html), and r186's renderAsync is `await this.init(); this.render(scene, camera);` and nothing
// else. This is that, under our own name: it awaits the backend's init unless the renderer says it is initialised (a renderer that does not say is asked: init() is idempotent), renders
// synchronously, and returns a promise like the call it replaces, so every `await renderer.renderAsync(a, b)` becomes `await renderNow(renderer, a, b)` with the order of events unchanged.
"use strict";
export async function renderNow(renderer, scene, camera) {
    if (renderer.initialized !== true) await renderer.init();
    renderer.render(scene, camera);
}
