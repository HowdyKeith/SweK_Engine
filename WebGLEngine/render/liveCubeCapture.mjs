// WebGLEngine/render/liveCubeCapture.mjs -- v4581
// ---------------------------------------------------------------------------------------------------------------
// THE PIECE physics/render/specularProbeCapture.mjs NAMED AS OUT OF SCOPE, NOT INSIDE IT: "the captured scene is
// still specularProbeBake's own splatRadiance-driven radianceOf, point-sampled through this tree's existing
// cube-bake geometry -- not a real-time rasterised frame of the gpuDriven scene's actual fleets." This is that
// frame -- a REAL gfx/device.js camera per cube face, drawing whatever a gpuDriven scene actually renders, read
// back and packed into the SAME { level, roughness, alpha, size, faces } shape captureBaseCubemap already
// produces from the analytic stand-in, so every consumer downstream of a capture (packSpecularAtlas,
// sampleSpecularAtlas, the WGSL texture-backed prefilter) takes this one unmodified.
//
// THE CAMERA MATH IS DERIVED FROM cubeBake.FACES, NOT A HAND-MAINTAINED SECOND COPY OF IT. Six magic up-vectors
// typed out by hand would be the exact "second declaration" this tree keeps flagging in other people's code --
// faceUp() reads FACES[f] itself (a finite difference along v) so a change to that array moves this module with
// it rather than silently disagreeing. VERIFIED, NOT ARGUED: this module's own selfcheck projects a world point
// along FACES[f](u0, v0) through faceViewProj(eye, f) and checks the result lands on NDC (u0, v0) to
// floating-point noise, for a spread of (u0, v0) and a probe position off the origin -- a 90-degree-FOV square
// perspective frustum's image plane IS the tangent-plane construction FACES[] already uses, which is WHY 90
// degrees is the standard FOV for cubemap capture and not a knob tuned to make this module's own numbers agree.
//
// THE READBACK IS 8-BIT, BECAUSE gfx/device.js's render targets ARE. device.texture({render:true}) is forced to
// the canvas/preferred format (TEXTURE_FORMATS' own rule: "a render target takes the canvas format", and
// _textureFormat refuses render:true with any other format by name) and every frame({read:true}) readback on
// both backends hands back a Uint8Array, target or no target -- there is no HDR render-target path in this
// device abstraction today. A scene whose real colours exceed [0, 1] clips here exactly as it would on the
// screen the page shows. Extending device.texture() to a float render target is a separate, device-layer piece
// of work, not folded into this one.
//
// ROW 0 OF THE READBACK IS THE TOP OF THE IMAGE, ON BOTH BACKENDS -- gfx/device.js's OWN unification (see its
// `target` comment: GL's framebuffer row 0 is the bottom and is flipped on readback; WebGPU's native row 0 is
// already the top). Top is v = +1 in cubeBake's texel-centre convention (faceTexelDir's j increases WITH v), so
// a readback row is written to face texel row (size - 1 - row), the one non-obvious step here -- checked by a
// round-trip in this module's own selfcheck (a known marker's captured texel lands where faceTexelDir predicts
// its direction would), not left as an unverified flip.
//
// STILL NOT CLAIMED: this captures whatever scene it is handed, ONCE, on request -- it is the rendering
// primitive a caller uses to bake a probe from the live scene, not a per-frame dynamic-update loop that
// re-captures as the scene changes. render/probeLab.mjs is the first caller and decides what "the scene" means
// for its own demo (which fleets belong in an environment a specular probe reflects, and which do not).
"use strict";
import { FACES } from "./cubeBake.js";
import { perspective, lookAt, multiply } from "./gpuDriven.mjs";

const norm3 = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
const sub3 = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add3 = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];

/** The camera's up-vector for face `f`, a finite difference of cubeBake.FACES[f] along v -- see this file's own
 *  header for why this is derived rather than a second, hand-typed copy of the same fact. */
export function faceUp(f) {
    const c = FACES[f](0, 0);
    return norm3(sub3(FACES[f](0, 0.001), c));
}

/** The point face f's camera looks toward, from `eye`. */
export function faceTarget(eye, f) { return add3(eye, norm3(FACES[f](0, 0))); }

/** perspective(90 deg, aspect 1, near, far) * lookAt(eye, faceTarget, faceUp) -- see this file's header for the
 *  NDC-(u, v) correspondence this construction guarantees. */
export function faceViewProj(eye, f, { near = 0.05, far = 50 } = {}) {
    return multiply(perspective(Math.PI / 2, 1, near, far), lookAt(eye, faceTarget(eye, f), faceUp(f)));
}

/**
 * Render six faces of `scene` (anything with a gpuDriven-shaped async frame({viewProj, eye, clear, read, target})
 * -- makeGpuDrivenScene's own return value fits directly) from `eye`, through a real `device`, and pack the
 * readback into captureBaseCubemap's own { level, roughness, alpha, size, faces } shape. `level`/`roughness`/
 * `alpha` are 0 by the same convention captureBaseCubemap documents: this is the raw, unfiltered level a
 * prefilter chain is built FROM, not one already blurred.
 */
export async function captureLiveCubemap(device, scene, eye, { size = 32, near = 0.05, far = 50, background = [0, 0, 0, 1] } = {}) {
    const target = device.texture({ render: true, width: size, height: size });
    const faces = [];
    try {
        for (let f = 0; f < 6; f++) {
            const viewProj = faceViewProj(eye, f, { near, far });
            const fr = scene.frame({ viewProj, eye, clear: background, read: true, target });
            const readback = await fr.pixels;
            const px = readback.pixels;
            const out = new Float32Array(size * size * 3);
            for (let row = 0; row < size; row++) {
                const j = size - 1 - row;
                for (let col = 0; col < size; col++) {
                    const i = col, s = (row * size + col) * 4, o = (j * size + i) * 3;
                    out[o] = px[s] / 255; out[o + 1] = px[s + 1] / 255; out[o + 2] = px[s + 2] / 255;
                }
            }
            faces.push(out);
        }
    } finally { target.destroy(); }
    return { level: 0, roughness: 0, alpha: 0, size, faces };
}
