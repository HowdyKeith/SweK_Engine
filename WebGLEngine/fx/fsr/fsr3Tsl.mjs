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
 */
export function makeFsr3(THREE, TSL, renderer, { fsr2 = {}, frameGen = {}, field = "raw" } = {}) {
    if (field !== "raw" && field !== "dilated") throw new Error(`fx/fsr/fsr3Tsl: field must be "raw" or "dilated" -- got ${JSON.stringify(field)}`);
    const up = makeFsrTemporal(THREE, TSL, renderer, fsr2);
    const dw = fsr2.displayWidth, dh = fsr2.displayHeight;
    const colType = fsr2.type == null ? THREE.HalfFloatType : fsr2.type;
    const frames2 = [0, 1].map(() => new THREE.RenderTarget(dw, dh, { type: colType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: false }));
    const gen = makeFrameGen(THREE, TSL, { w: dw, h: dh, ...frameGen });
    const quad = (node) => { const m = new THREE.NodeMaterial(); m.fragmentNode = node; m.blending = THREE.NoBlending; m.depthTest = false; m.depthWrite = false;
        const s = new THREE.Scene(); s.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), m)); return s; };
    const ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const show = frames2.map((f) => quad(TSL.textureLoad(f.texture, TSL.ivec2(TSL.int(TSL.screenCoordinate.x), TSL.int(TSL.screenCoordinate.y)))));
    let frames = 0, lastInputs = null;
    // the NEWER frame's field, as makeFrameGen asks: FSR2's stage holds the last real frame's, which is the newer of the pair
    // *** THE DEPTH IS THE STAGE'S IN BOTH MODES, ONLY THE MOTION IS DILATED. *** FSR2's record -- the dilated depth -- is a
    // ping-pong pair and the one this frame wrote is record[k % 2]; reading it here would tie the generator to the chain's
    // internal parity for a depth the splat only uses to order surfaces, which the stage's own depth does exactly.
    const fieldOf = () => ({ motion: field === "dilated" ? up.targets.dMotion.texture : up.targets.motion.texture, depth: up.targets.depth.texture });
    return {
        fsr2: up, frameGen: gen, field, targets: { frames: frames2 },
        get frames() { return frames; },
        /** What the last generate() handed the generator: { prev, cur, motion, depth }, the textures themselves. */
        get lastInputs() { return lastInputs; },
        /** The next real frame: FSR2 into the newer target, shown at `output` if given. */
        async render(scene, camera, output = null) {
            const k = frames % 2;
            await up.render(scene, camera, frames2[k]);
            if (output !== undefined && output !== false) { const keep = renderer.getRenderTarget(); renderer.setRenderTarget(output); await renderer.renderAsync(show[k], ortho); renderer.setRenderTarget(keep); }
            frames++;
        },
        /** The frame between the last two real frames, at `output`. With one real frame so far it is that frame. */
        async generate(output = null) {
            if (frames === 0) throw new Error("fx/fsr/fsr3Tsl: generate needs a real frame first -- call render");
            const cur = frames2[(frames - 1) % 2], prev = frames >= 2 ? frames2[frames % 2] : cur;
            const { motion, depth } = fieldOf();
            lastInputs = { prev: prev.texture, cur: cur.texture, motion, depth };
            await gen.generate(renderer, lastInputs, output);
            // one real frame in there is nothing to be between: the call above only primed the generator's older depth, and
            // what is shown is the frame itself
            if (frames === 1) { const keep = renderer.getRenderTarget(); renderer.setRenderTarget(output); await renderer.renderAsync(show[0], ortho); renderer.setRenderTarget(keep); }
        },
        dispose() { up.dispose(); gen.dispose(); for (const f of frames2) f.dispose(); },
    };
}
