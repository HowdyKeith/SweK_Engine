// WebGLEngine/ui/orreryPost.mjs -- v4273, WebGPU-capable since Level 11
//
// A SHADER STAGE FOR THE ORRERY, WHICH HAS NEVER HAD ONE.
//
// ---- THE CEILING THIS LIFTS -------------------------------------------------------------------------------------
//
// ui/orreryDraw.js is canvas 2D -- getContext("2d"), 28 drawing calls, four of them fillText. That is not a
// performance problem, it is a CAPABILITY ceiling: a 2D context has no shader stage, so not one effect in this
// tree can touch the orrery, no matter how many the tree has. v4269 counted 134 GLSL-bearing modules and 39
// WGSL-bearing ones, and the orrery could use none of them.
//
// *** THE 2D DRAWING IS KEPT. *** Porting 368 lines of arcs, gradients and labels to a device pipeline would
// also require a WGSL glyph renderer -- text/slugShader.js is 337 lines of GLSL with no WGSL, which v4269
// identified as the blocker -- and would risk the one thing the orrery does well. So the canvas becomes the
// SOURCE TEXTURE of a post stage instead. The orrery keeps drawing exactly as it does; a device pipeline reads
// the result.
// (v4457: the WGSL glyph renderer now exists -- text/slugShaderWgsl.js, graded on a device -- so this reason has
// moved one file over: gfx/device.js has no blend state and no rgba16float/rg16uint upload yet. The choice to
// keep the 2D drawing stands until it does; docs/TSL-ROADMAP.md step 7 lists the order.)
//
// ---- *** THIS IS gfx/device.js's FIRST NON-DEMO CONSUMER, WHICH IS THE POINT AS MUCH AS THE EFFECT IS. *** -------
//
// v4269 measured that abstraction's reach: a 117-line unified WebGL2/WebGPU device whose promise is "a demo
// writes its render ONCE and runs on either runtime", with exactly two consumers -- gfx-device.html and
// nebula-device.html, both its own demos. v4271 rendered badTv through both backends and diffed the frames: 0
// of 4,096 pixels differ. What was still missing was anything real that wanted it.
//
// ---- AND IT SETTLES THE ORIENTATION QUESTION BY BEING A CONSUMER RATHER THAN AN ARGUMENT -------------------------
//
// v4272 measured that render/badTvPass.js and render/badTvDevicePass.mjs render the same effect as exact
// vertical mirrors, and refused to call either wrong: three's uv has v = 0 at the quad's bottom, the device
// path uses framebuffer space. It said the choice needed a consumer to decide FOR.
//
// *** A 2D CANVAS'S ROW 0 IS ITS TOP. *** So framebuffer space is not a preference here, it is the source's own
// layout: uv.y = 0 is the first row of the ImageData the orrery just drew. The device convention fits without a
// flip anywhere, and the three.js convention would need one. That is the decision, made by the shape of the
// data rather than by whoever argues last.
"use strict";

import { requestDevice, detectBackends, CAPABILITIES } from "../gfx/device.js";
import { badTvPipelineDesc, packKnobs, KNOB_ORDER, UV_CONVENTION } from "../render/badTvDevicePass.mjs";

/** Effects this stage can run. Data, so a caller can offer a menu without knowing what is in it. */
/**
 * The backends that can carry a texture, DERIVED from gfx/device.js's own capability table rather than typed
 * here. v4273 typed ["webgl2"] because the WebGPU backend could not bind a texture; Level 11 taught it to, and a
 * list restated here would have kept saying "webgl2" until somebody remembered this file. Now the device says.
 */
export const TEXTURE_CAPABLE_BACKENDS = Object.freeze(Object.keys(CAPABILITIES).filter((b) => b !== "null" && CAPABILITIES[b].textures));

export const EFFECTS = Object.freeze({
    none: Object.freeze({ id: "none", label: "off", desc: null }),
    badTv: Object.freeze({ id: "badTv", label: "bad signal", desc: badTvPipelineDesc }),
});

/** Why the stage could not attach, or null. Separated so a caller can SAY why rather than silently do nothing. */
export function postSkipReason(env = {}) {
    const doc = env.document !== undefined ? env.document : (typeof document !== "undefined" ? document : null);
    if (!doc) return "no document -- this stage needs a canvas to draw into";
    const av = env.backends || detectBackends();
    if (!av.webgpu && !av.webgl2) return "neither WebGPU nor WebGL2 is available on this origin";
    return null;
}

/**
 * Attach a post stage that reads `sourceCanvas` and presents into `targetCanvas`.
 *
 * *** IT RETURNS null RATHER THAN THROWING WHEN THERE IS NO DEVICE, AND THE ORRERY MUST STAY USABLE. ***
 * The 2D drawing is the product; this is an enhancement on top of it. A page that cannot get a device should
 * show the orrery exactly as it does today, which is why the failure is a null and a reason and not an
 * exception a caller has to catch to keep working.
 */
export async function makeOrreryPost(sourceCanvas, targetCanvas, opts = {}) {
    const skip = postSkipReason(opts.env || {});
    if (skip) return { ok: false, reason: skip, device: null };
    // *** Level 11 -- WebGPU IS NO LONGER REFUSED. *** From v4273 to v4296 this stage asked for webgl2 BY NAME,
    // because gfx/device.js's WebGPU backend could not bind a texture (pass.texture was `() => {}` and then a
    // refusal). That backend binds now -- bindings are derived from the shader and the bind group is built from
    // what the pass bound by name -- so the request is a PREFERENCE again, resolved by the device's own order
    // (WebGPU first, WebGL2 fallback), and the capability check below reads the device's table rather than
    // this file's memory of it. `backend` is still honoured as a hard choice for a caller or a gate that wants
    // one route in particular.
    //
    // *** AND THE OPTION IS `backend`, NOT `backends`. *** The first draft passed an ARRAY under a key
    // requestDevice does not read -- gfx/device.js takes `opts.backend` (a hard choice) or `opts.prefer`
    // (an order) -- so the request was ignored and the stage was handed WebGPU, the default. A test whose
    // expected answer is also its failure mode confirms nothing. The gate caught it on the first real attach.
    const wanted = opts.backend || null;
    let device = null;
    try {
        device = await requestDevice(targetCanvas, { ...(opts.deviceOpts || {}), ...(wanted ? { backend: wanted } : {}) });
    } catch (e) {
        return { ok: false, reason: "requestDevice threw: " + String(e && e.message).slice(0, 120), device: null };
    }
    // *** THE null BACKEND IS NOT A DEVICE FOR THIS PURPOSE. *** gfx/device.js falls back to a recorder that
    // implements the whole interface and draws nothing, which is right for a headless test and wrong for a
    // page: presenting an empty canvas over a correct 2D one would be a regression wearing a success.
    if (!device || device.backend === "null") {
        try { device?.destroy?.(); } catch {}
        return { ok: false, reason: "only the null (recording) backend is available -- nothing would be drawn",
                 device: null };
    }

    // Read from the device's capability table, so a backend that loses the feature is refused here by name.
    const textureCapable = !!(CAPABILITIES[device.backend] && CAPABILITIES[device.backend].textures);
    if (!textureCapable) {
        try { device.destroy?.(); } catch {}
        return { ok: false, device: null,
                 reason: `got the ${device.backend} backend, which cannot bind textures in gfx/device.js ` +
                         `(see its CAPABILITIES). A post stage needs the source as a texture, so this would ` +
                         `draw the effect over nothing. Request one of ${TEXTURE_CAPABLE_BACKENDS.join(", ")}.` };
    }

    let current = EFFECTS.none, pipeline = null, knobs = packKnobs({ time: 0 }), srcTex = null;

    function setEffect(id) {
        const eff = EFFECTS[id];
        if (!eff) return { ok: false, reason: `no effect named "${id}" -- have ${Object.keys(EFFECTS).join(", ")}` };
        current = eff;
        pipeline = null;               // rebuilt lazily on the next frame
        return { ok: true, effect: eff.id };
    }

    function draw(tSeconds = 0, o = {}) {
        if (current.id === "none") return { drawn: false, why: "effect is off -- the 2D canvas is the picture" };
        if (!pipeline) {
            const desc = current.desc();
            pipeline = device.pipeline(desc);
        }
        knobs = packKnobs({ time: tSeconds });
        // *** THE SOURCE IS RE-UPLOADED EVERY FRAME, ON PURPOSE -- INTO ONE TEXTURE. *** The orrery redraws its
        // 2D canvas whenever the view or the clock moves, so a texture cached across frames would show a stale
        // system. v4273 added `source` to gfx/device.js's texture() for exactly this -- before it, the only route
        // from a canvas was getImageData(), a full readback per frame. Until Level 11 this line CREATED a new
        // texture every frame and never freed the last one: a leak of one canvas-sized texture per frame on both
        // backends, invisible in a gate that draws twice. update() re-uploads into the texture it already has.
        // flipY stays FALSE: a 2D canvas's row 0 is its top, which is what UV_CONVENTION expects.
        if (!srcTex || srcTex.w !== sourceCanvas.width || srcTex.h !== sourceCanvas.height) {
            try { srcTex?.destroy?.(); } catch {}
            srcTex = device.texture({ source: sourceCanvas, flipY: false });
            srcTex.w = sourceCanvas.width; srcTex.h = sourceCanvas.height;
        } else srcTex.update({ source: sourceCanvas });
        const read = device.frame(({ pass }) => {
            pass.clear([0, 0, 0, 1]);
            pass.use(pipeline);
            for (let i = 0; i < KNOB_ORDER.length; i++) pass.uniform(KNOB_ORDER[i], knobs[i]);
            pass.texture("tDiffuse", srcTex, 0);
            pass.draw(3);              // the full-screen triangle both shader stages synthesise
        }, o.read ? { read: true } : undefined);
        return { drawn: true, effect: current.id, backend: device.backend, ...(o.read ? { pixels: read } : {}) };
    }

    return {
        ok: true, device, backend: device.backend, uvConvention: UV_CONVENTION,
        effects: Object.keys(EFFECTS),
        get effect() { return current.id; },
        setEffect, draw,
        destroy() { try { srcTex?.destroy?.(); } catch {} try { device.destroy(); } catch {} },
    };
}
