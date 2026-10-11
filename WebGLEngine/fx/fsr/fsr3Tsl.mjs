// fx/fsr/fsr3Tsl.mjs -- v4742 -- FSR3 FOR A THREE.JS SCENE: FSR2'S UPSCALED FRAMES, AND THE FRAME BETWEEN EACH TWO OF THEM.
// fx/fsr/fsrTemporalTsl.mjs's makeFsrTemporal renders each frame at render resolution and brings it up to display
// resolution; fx/fsr/fsrFrameGenTsl.mjs's makeFrameGen makes the frame between two frames. Until this module the second
// ran only on NATIVE frames -- the scene rendered at display resolution -- which is not what FSR3 is: FSR3 generates from
// the frames it upscaled, so the only full-resolution rendering in the pipeline is the upscaler's, and the generated frame
// costs no scene render at all. fx/fsr/fsr3Tsl-selfcheck.mjs measures what that gives up against generating from native
// frames, and what it buys against showing an upscaled frame twice.
//
// Per real frame: FSR2's chain into one of two display-resolution targets, the newer of the pair. Per generated frame: the
// frame at time t between the older and the newer, from the MOTION FIELD AND DEPTH FSR2 ALREADY HAS -- its motion stage
// runs at display resolution through the unjittered camera, which is the geometry an upscaled frame shows -- so the
// generator costs no extra scene pass either. `field` picks which of FSR2's two fields: "raw", the stage's own, or
// "dilated", FSR2's nearest-surface dilation of it (render/temporalClipTsl.mjs's dilateNodes). Neither pays: the gate reads
// them within a tenth of a dB of each other, raw ahead on the turning knot and dilated under a pan, and "raw" -- the field
// as rendered -- is the default.
//
// *** WHAT IT GIVES UP AGAINST NATIVE FRAMES IS NOT WHAT THE UPSCALER GIVES UP, AND THE GATE FOUND WHY. *** Against a
// supersampled truth, a frame generated from two NATIVE frames under a pan beat the native real frame by 1.4 dB: blending
// two aliased frames sampled a fraction of a pixel apart is a two-sample anti-alias. FSR2's frames are already accumulated
// and collect no such bonus, so the generated frame is as good as the upscaled frames around it -- within 0.2 dB, above
// them on the turning knot -- and the gap to native generation is wider than the gap between the real frames.
"use strict";
import { makeFsrTemporal } from "./fsrTemporalTsl.mjs";
import { makeFrameGen } from "./fsrFrameGenTsl.mjs";

/**
 * FSR2 with frame generation. `fsr2` is makeFsrTemporal's options (the display size is the generator's too), `frameGen`
 * makeFrameGen's ({ t, fill, flow }), `field` "raw" or "dilated". render(scene, camera, output) runs FSR2 for the next real
 * frame and shows it at `output` (null, the canvas; false, nowhere); generate(output) writes the frame between the last two
 * real frames -- call it after EVERY real frame, because the generator keeps the older frame's depth from the call before.
 * Returns { fsr2, frameGen, targets: { frames }, render, generate, frames, dispose }.
 * `hold` (v4751) is how many pairs it keeps to generate between: 1, the newest, or 2 -- the newest and the one before it, for a
 * pacer whose line sits in the older one right after each real frame arrives (render/framePacer.mjs's pairs "two"). With 2
 * it keeps three frames and, for each, a copy of the field and the depth the generator reads -- three full-screen copies a
 * real frame -- and generate({ pair }) names the pair by its newer frame.
 */
export function makeFsr3(THREE, TSL, renderer, { fsr2 = {}, frameGen = {}, field = "raw", hold = 1 } = {}) {
    if (field !== "raw" && field !== "dilated") throw new Error(`fx/fsr/fsr3Tsl: field must be "raw" or "dilated" -- got ${JSON.stringify(field)}`);
    if (hold !== 1 && hold !== 2) throw new Error(`fx/fsr/fsr3Tsl: hold must be 1 or 2 pairs -- got ${JSON.stringify(hold)}`);
    // v4750: with the optical flow, FSR2's stage renders the camera's own motion too, and the reconciliation judges a still
    // surface in the world (render/flowReconcile.mjs)
    const up = makeFsrTemporal(THREE, TSL, renderer, { ...fsr2, cameraMotion: fsr2.cameraMotion ?? !!frameGen.flow });
    const dw = fsr2.displayWidth, dh = fsr2.displayHeight;
    const colType = fsr2.type == null ? THREE.HalfFloatType : fsr2.type;
    const N = hold + 1;                 // real frames kept: the pairs' frames
    const frames2 = Array.from({ length: N }, () => new THREE.RenderTarget(dw, dh, { type: colType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: false }));
    const gen = makeFrameGen(THREE, TSL, { w: dw, h: dh, ...frameGen });
    const quad = (node) => { const m = new THREE.NodeMaterial(); m.fragmentNode = node; m.blending = THREE.NoBlending; m.depthTest = false; m.depthWrite = false;
        const s = new THREE.Scene(); s.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), m)); return s; };
    const ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const show = frames2.map((f) => quad(TSL.textureLoad(f.texture, TSL.ivec2(TSL.int(TSL.screenCoordinate.x), TSL.int(TSL.screenCoordinate.y)))));
    let frames = 0, lastInputs = null, lastPair = -1;
    // v4751: with hold 2, each real frame's field, depth and camera motion copied as it is made -- FSR2's stage overwrites its own
    const flat = () => new THREE.RenderTarget(dw, dh, { type: THREE.FloatType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: false });
    const at = (tex) => TSL.textureLoad(tex, TSL.ivec2(TSL.int(TSL.screenCoordinate.x), TSL.int(TSL.screenCoordinate.y)));
    const kept = hold === 2 ? Array.from({ length: N }, () => ({ motion: flat(), depth: flat(), camera: up.stage.camera ? flat() : null })) : null;
    const copies = new Map(), copy = async (src, dst) => { if (!copies.has(src)) copies.set(src, quad(at(src))); renderer.setRenderTarget(dst); await renderer.renderAsync(copies.get(src), ortho); };
    // the NEWER frame's field, as makeFrameGen asks: FSR2's stage holds the last real frame's, which is the newer of the pair
    // *** THE DEPTH IS THE STAGE'S IN BOTH MODES, ONLY THE MOTION IS DILATED. *** FSR2's record -- the dilated depth -- is a
    // ping-pong pair and the one this frame wrote is record[k % 2]; reading it here would tie the generator to the chain's
    // internal parity for a depth the splat only uses to order surfaces, which the stage's own depth does exactly.
    const fieldOf = () => ({ motion: field === "dilated" ? up.targets.dMotion.texture : up.targets.motion.texture, depth: up.targets.depth.texture });
    return {
        fsr2: up, frameGen: gen, field, hold, targets: { frames: frames2, kept },
        get frames() { return frames; },
        /** What the last generate() handed the generator: { prev, cur, motion, depth } and (v4750, with the flow) camera, the textures themselves. */
        get lastInputs() { return lastInputs; },
        /** The next real frame: FSR2 into the newer target, shown at `output` if given. */
        async render(scene, camera, output = null) {
            const k = frames % N;
            await up.render(scene, camera, frames2[k]);
            if (kept) { const keep = renderer.getRenderTarget(), F = fieldOf(), K = kept[k];
                await copy(F.motion, K.motion); await copy(F.depth, K.depth); if (K.camera) await copy(up.stage.camera.texture, K.camera); renderer.setRenderTarget(keep); }
            if (output !== undefined && output !== false) { const keep = renderer.getRenderTarget(); renderer.setRenderTarget(output); await renderer.renderAsync(show[k], ortho); renderer.setRenderTarget(keep); }
            frames++;
        },
        /**
         * The frame between the last two real frames, at `output` -- at `t` if given (v4743: a pacer's), the generator's own
         * otherwise. With one real frame so far it is that frame. A second call before the next real frame is a second frame
         * between the same two, and the generator is told so. `ui` (v4745) is the newer frame's UI, premultiplied, at display
         * size, composited over whatever is shown -- FSR2 renders the scene alone, so the frames are HUD-less as the generator
         * then needs. v4755: or a function of the time generated, as makeFrameGen takes it -- the UI drawn at t; with one real
         * frame so far, what is shown is that frame, and its UI is the function's at t = 1. `pair` (v4751, with hold 2) is the pair's NEWER real frame: the newest, frames - 1, by default, or the one
         * before it.
         */
        async generate(output = null, { t = null, ui = null, pair = null } = {}) {
            if (frames === 0) throw new Error("fx/fsr/fsr3Tsl: generate needs a real frame first -- call render");
            const p = pair === null ? frames - 1 : pair;
            if (!(p === frames - 1 || (hold === 2 && p === frames - 2 && p >= 1)))
                throw new Error(`fx/fsr/fsr3Tsl: generate holds ${hold === 2 ? `the pairs ending at ${frames - 2} and ${frames - 1}` : `the pair ending at ${frames - 1}`} -- got ${pair}`);
            const cur = frames2[p % N], prev = p >= 1 ? frames2[(p - 1) % N] : cur;
            let motion, depth, camera, depthPrev = null;
            if (kept) { const K = kept[p % N]; motion = K.motion.texture; depth = K.depth.texture; camera = K.camera ? K.camera.texture : null; if (p >= 1) depthPrev = kept[(p - 1) % N].depth.texture; }
            else { ({ motion, depth } = fieldOf()); camera = up.stage.camera ? up.stage.camera.texture : null; }
            lastInputs = { prev: prev.texture, cur: cur.texture, motion, depth, ...(camera ? { camera } : {}), ...(depthPrev ? { depthPrev } : {}) };
            // with one real frame the call below only primes the generator, and the UI goes over the frame shown after it
            await gen.generate(renderer, ui && frames > 1 ? { ...lastInputs, ui } : lastInputs, output, { t, again: lastPair === p });
            lastPair = p;
            // one real frame in there is nothing to be between: the call above only primed the generator's older depth, and
            // what is shown is the frame itself
            if (frames === 1) { if (ui) await gen.composite(renderer, frames2[0].texture, typeof ui === "function" ? await ui(1) : ui, output);
                else { const keep = renderer.getRenderTarget(); renderer.setRenderTarget(output); await renderer.renderAsync(show[0], ortho); renderer.setRenderTarget(keep); } }
        },
        /** Show real frame k again at `output` -- one of the last hold + 1, which this holds. */
        async show(k, output = null) {
            if (!(k <= frames - 1 && k >= frames - N && k >= 0)) throw new Error(`fx/fsr/fsr3Tsl: show holds the last ${N} real frames, ${Math.max(0, frames - N)} to ${frames - 1} -- got ${k}`);
            const keep = renderer.getRenderTarget(); renderer.setRenderTarget(output); await renderer.renderAsync(show[k % N], ortho); renderer.setRenderTarget(keep);
        },
        dispose() { up.dispose(); gen.dispose(); for (const f of frames2) f.dispose(); if (kept) for (const K of kept) for (const x of Object.values(K)) if (x) x.dispose(); },
    };
}
