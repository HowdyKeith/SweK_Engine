// WebGLEngine/ui/orreryPost.mjs -- v4273
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

import { requestDevice, detectBackends } from "../gfx/device.js";
import { badTvPipelineDesc, packKnobs, KNOB_ORDER, UV_CONVENTION } from "../render/badTvDevicePass.mjs";

/** Effects this stage can run. Data, so a caller can offer a menu without knowing what is in it. */
/** The backend constraint, as data, so a caller and a gate read the same fact. */
export const TEXTURE_CAPABLE_BACKENDS = Object.freeze(["webgl2"]);

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
    // *** WebGL2 IS REQUESTED FIRST, AND THAT IS A MEASURED CONSTRAINT RATHER THAN A PREFERENCE. ***
    // gfx/device.js's WebGPU backend cannot bind textures: pass.texture was `() => {}` until v4273 -- the
    // pipeline built, the call ran, nothing bound, the frame drew without its source. Attaching this stage is
    // what surfaced it, because a post effect is a texture consumer by definition. It refuses by name now,
    // which is honest and still means this stage cannot use that backend. So the order is explicit here, with
    // the reason attached, instead of taking whatever requestDevice prefers and failing at the first frame.
    // *** AND THE OPTION IS `backend`, NOT `backends`. *** The first draft passed an ARRAY under a key
    // requestDevice does not read -- gfx/device.js takes `opts.backend` (a hard choice) or `opts.prefer`
    // (an order) -- so the request was ignored and the stage was handed WebGPU, the default. The probe that
    // was supposed to have established this passed `{backends: ["webgpu"]}` and got WebGPU, which is what it
    // would have got with no options at all: a test whose expected answer is also its failure mode confirms
    // nothing. The gate caught it on the first real attach.
    //
    // `backend` and not `prefer`, because this is not a preference: the stage cannot use WebGPU at all until
    // that backend can bind a texture, so falling back to it would only defer the failure by one frame.
    const wanted = opts.backend || TEXTURE_CAPABLE_BACKENDS[0];
    let device = null;
    try {
        device = await requestDevice(targetCanvas, { ...(opts.deviceOpts || {}), backend: wanted });
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

    // Named so a caller can report it, and so the gate can assert the constraint is stated rather than implied.
    const textureCapable = device.backend === "webgl2";
    if (!textureCapable) {
        try { device.destroy?.(); } catch {}
        return { ok: false, device: null,
                 reason: `got the ${device.backend} backend, which cannot bind textures in gfx/device.js ` +
                         `(see its pass.texture). A post stage needs the source as a texture, so this would ` +
                         `draw the effect over nothing. Request webgl2.` };
    }

    let current = EFFECTS.none, pipeline = null, knobs = packKnobs({ time: 0 }), srcTex = null;

    function setEffect(id) {
        const eff = EFFECTS[id];
        if (!eff) return { ok: false, reason: `no effect named "${id}" -- have ${Object.keys(EFFECTS).join(", ")}` };
        current = eff;
        pipeline = null;               // rebuilt lazily on the next frame
        return { ok: true, effect: eff.id };
    }

    function draw(tSeconds = 0) {
        if (current.id === "none") return { drawn: false, why: "effect is off -- the 2D canvas is the picture" };
        if (!pipeline) {
            const desc = current.desc();
            pipeline = device.pipeline(desc);
        }
        knobs = packKnobs({ time: tSeconds });
        // *** THE SOURCE IS RE-UPLOADED EVERY FRAME, ON PURPOSE. *** The orrery redraws its 2D canvas whenever
        // the view or the clock moves, so a texture cached across frames would show a stale system. v4273 added
        // `source` to gfx/device.js's texture() for exactly this -- before it, the only route from a canvas was
        // getImageData(), a full readback per frame to produce bytes the GL call can take from the canvas
        // directly. flipY stays FALSE: a 2D canvas's row 0 is its top, which is what UV_CONVENTION expects.
        srcTex = device.texture({ source: sourceCanvas, flipY: false });
        device.frame(({ pass }) => {
            pass.clear([0, 0, 0, 1]);
            pass.use(pipeline);
            for (let i = 0; i < KNOB_ORDER.length; i++) pass.uniform(KNOB_ORDER[i], knobs[i]);
            pass.texture("tDiffuse", srcTex, 0);
            pass.draw(3);              // the full-screen triangle both shader stages synthesise
        });
        return { drawn: true, effect: current.id, backend: device.backend };
    }

    return {
        ok: true, device, backend: device.backend, uvConvention: UV_CONVENTION,
        effects: Object.keys(EFFECTS),
        get effect() { return current.id; },
        setEffect, draw,
        destroy() { try { device.destroy(); } catch {} },
    };
}
