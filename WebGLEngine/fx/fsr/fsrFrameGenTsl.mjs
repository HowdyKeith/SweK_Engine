// fx/fsr/fsrFrameGenTsl.mjs -- v4738 -- FSR3'S FRAME GENERATION FOR A THREE.JS SCENE: the frame between two presented
// frames, made from the scene's own motion field, composed from render/frameInterpTsl.mjs (the splat and the warp) and
// render/holeFillTsl.mjs (the fill). fx/fsr/fsrFrameGen-selfcheck.mjs grades what it buys against a frame really rendered
// at the midpoint, beside the two things a frame generator has to beat: repeating the older frame, and a cross-fade.
//
// Per generated frame:
//   1. the NEWER frame's motion field and clip depth (render/temporalTsl.mjs's makeMotionStage, or FSR2's own -- the
//      driver in fx/fsr/fsrTemporalTsl.mjs keeps one at display resolution) become a per-pixel forward flow
//      (flowFromMotionNode), cur-indexed, the depth riding along for the splat's depth test
//   2. the splat, the fill and the warp at time t (makeFrameInterp with `fill`)
//   3. the newer frame's depth is kept, because the next generation's fill asks where the OLDER frame's surfaces were
//
// *** THE MOTION IS THE APPLICATION'S AND NOT AN OPTICAL FLOW, AND THAT IS WHAT A THREE.JS SCENE OFFERS FOR FREE. ***
// FSR3 reconciles the game's motion vectors with an optical flow of the colour, because the vectors do not see what is
// not geometry -- shadows, reflections, particles, UI. render/opticalFlow.mjs and render/flowReconcile.mjs are this tree's
// versions and are not ported: every surface a three.js scene draws carries its own vector here (render/temporalTsl.mjs's
// VelocityNode subclass keeps each object's previous matrix), and the gate's scene is geometry. The limit is named.
//
// *** THE MOTION BETWEEN TWO FRAMES IS A STRAIGHT LINE HERE, AND THE SCENE'S IS NOT. *** A turning object's points move on
// arcs; the flow is the chord, and the midpoint of a chord is not the midpoint of its arc. The gate measures the scene
// turning at the rate it does between two real frames, where the chord and the arc agree to a fraction of a pixel.
//
// *** THE DEFAULT FILL BLENDS BOTH FRAMES IN A HOLE, AND THAT IS THIS SCENE'S MEASUREMENT OVERRULING v4679's. *** On
// render/holeFill.mjs's slab -- an occluder TRANSLATING off a background -- the depth side mode was exact and the blend
// mixed the right answer with the occluder. On fsr-three.html's knot, TURNING and occluding itself, measured on the hole
// pixels alone against the frame rendered at the midpoint: blend 19.87 dB, depth 18.16, derived 15.98 at four times the
// page's spin; 16.56, 16.09 and 15.70 at twelve times. A one-sided rule that picks the wrong frame costs more than a
// blend that is half right, and on a self-occluding surface both frames are partly right. So the default never commits;
// `fill: { side: "depth" }` is there for content that translates. The fill itself is not optional in practice: holes left
// at zero put the frame BELOW a plain cross-fade (fx/fsr/fsrFrameGen-selfcheck.mjs).
"use strict";
import { makeFrameInterp, flowFromMotionNode } from "../../render/frameInterpTsl.mjs";

/**
 * The generator for w x h frames. generate(renderer, { prev, cur, motion, depth }, output) writes the frame at time t
 * between the textures `prev` and `cur`, where `motion` and `depth` are the NEWER frame's (render/temporalTsl.mjs's
 * convention: uvPrev - uvCurr, and clip depth). The first call has no older depth and fills with the newer one's.
 * `fill` is makeFrameInterp's, the depth textures supplied here; null generates with the holes left at zero.
 */
export function makeFrameGen(THREE, TSL, { w, h, t = 0.5, fill = { radius: 4, side: "blend" } } = {}) {
    const flat = () => new THREE.RenderTarget(w, h, { type: THREE.FloatType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: false });
    const field = flat(), depthNow = flat(), depthOld = flat();
    const quad = (node) => { const m = new THREE.NodeMaterial(); m.fragmentNode = node; m.blending = THREE.NoBlending; m.depthTest = false; m.depthWrite = false;
        const sc = new THREE.Scene(); sc.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), m)); return sc; };
    const at = (tex) => TSL.textureLoad(tex, TSL.ivec2(TSL.int(TSL.screenCoordinate.x), TSL.int(TSL.screenCoordinate.y)));
    const fi = makeFrameInterp(THREE, TSL, { w, h, block: 1, indexedBy: "cur", t,
        fill: fill ? { ...fill, depthPrev: depthOld.texture, depthCur: depthNow.texture } : null });
    const ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const scenes = new Map();
    const once = (key, make) => { if (!scenes.has(key)) scenes.set(key, make()); return scenes.get(key); };
    const draw = async (renderer, sc, target) => { renderer.setRenderTarget(target); await renderer.renderAsync(sc, ortho); };
    let generated = 0;
    return {
        interp: fi, targets: { field, depthNow, depthOld }, uniforms: fi.uniforms,
        get generated() { return generated; },
        async generate(renderer, { prev, cur, motion, depth }, output = null) {
            const keep = renderer.getRenderTarget();
            const fieldSc = once("field|" + motion.uuid + "|" + depth.uuid, () => quad(flowFromMotionNode(TSL, motion, depth, { w, h }).node));
            const copyNow = once("now|" + depth.uuid, () => quad(at(depth)));
            await draw(renderer, fieldSc, field);
            await draw(renderer, copyNow, depthNow);
            if (generated === 0) await draw(renderer, once("old0", () => quad(at(depthNow.texture))), depthOld);
            await fi.splat(renderer, field.texture);
            await fi.gather(renderer, prev, cur, output);
            await draw(renderer, once("keep", () => quad(at(depthNow.texture))), depthOld);   // the next call's older depth
            renderer.setRenderTarget(keep);
            generated++;
        },
        dispose() { fi.dispose(); for (const x of [field, depthNow, depthOld]) x.dispose(); },
    };
}
