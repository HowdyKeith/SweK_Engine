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
// *** THE MOTION IS THE APPLICATION'S, AND SINCE v4741 THE COLOUR'S TOO WHERE THE APPLICATION'S IS SILENT. *** FSR3
// reconciles the game's motion vectors with an optical flow of the colour, because the vectors do not see what is not
// geometry -- shadows, reflections, particles, UI, a texture scrolling on a surface that stands still. `flow: {}` runs
// render/opticalFlowTsl.mjs and render/flowReconcileTsl.mjs first and splats their field: per PIXEL, each pixel's own vector
// against its block's flow on the 3 x 3 window about it, the flow winning only by explaining it ten times better and only on
// evidence read inside the frame. fx/fsr/fsrFrameGenFlow-selfcheck.mjs measures it: +0.5 to +0.8 dB over the frame where a
// wall's texture scrolls behind the knot (+11 to +16 on the wall itself), -0.03 under a pan where every vector is exact --
// and render/flowReconcile.mjs's block rule, applied per pixel, BELOW the vectors alone where the texture scrolls, because a
// block straddling the knot's silhouette hands its one vector to the knot. It is not the default: it pays only on content
// the vectors miss, and it is a pyramid and a search every generated frame.
//
// *** THE MOTION BETWEEN TWO FRAMES IS A STRAIGHT LINE HERE, AND THE SCENE'S IS NOT. *** A turning object's points move on
// arcs; the flow is the chord, and the midpoint of a chord is not the midpoint of its arc. The gate measures the scene
// turning at the rate it does between two real frames, where the chord and the arc agree to a fraction of a pixel.
// `arc: true` (v4744) splats with a toward stage's field instead -- render/temporalTsl.mjs's makeMotionStage({ toward:
// true }), each pixel's displacement to its pose at time t -- and pays where rotation is fast: +0.68 dB at 60x the page's
// spin, +0.19 at 30x, nothing at 4x or 12x, where the arc is a hundredth of a pixel from the chord
// (fx/fsr/fsrFrameGenArc-selfcheck.mjs). It costs a second geometry pass, splat and fill, so it is not the default.
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
import { makeOpticalFlow } from "../../render/opticalFlowTsl.mjs";
import { makeFlowReconcile } from "../../render/flowReconcileTsl.mjs";

/**
 * The generator for w x h frames. generate(renderer, { prev, cur, motion, depth }, output) writes the frame at time t
 * between the textures `prev` and `cur`, where `motion` and `depth` are the NEWER frame's (render/temporalTsl.mjs's
 * convention: uvPrev - uvCurr, and clip depth). The first call has no older depth and fills with the newer one's.
 * `fill` is makeFrameInterp's, the depth textures supplied here; null generates with the holes left at zero.
 * `flow` (v4741) reconciles the vectors with an optical flow of the two frames first: { block, searchRadius, levels } for
 * render/opticalFlowTsl.mjs and { margin, mode, radius } for render/flowReconcileTsl.mjs, {} for their defaults, null for
 * the vectors alone.
 */
export function makeFrameGen(THREE, TSL, { w, h, t = 0.5, fill = { radius: 4, side: "blend" }, flow = null, arc = false } = {}) {
    if (arc && flow) throw new Error("fx/fsr/fsrFrameGenTsl: arc and flow are not combined -- the flow's vectors are chords, and a pixel the flow took has no displacement to time t");
    const flat = () => new THREE.RenderTarget(w, h, { type: THREE.FloatType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: false });
    // depthOld: the newest depth seen, kept for the NEXT pair; depthPair: the older depth of the pair being generated, which
    // the fill reads -- two targets, so a pair can be generated again at another t (v4743) without losing its older depth
    const field = flat(), depthNow = flat(), depthOld = flat(), depthPair = flat();
    const quad = (node) => { const m = new THREE.NodeMaterial(); m.fragmentNode = node; m.blending = THREE.NoBlending; m.depthTest = false; m.depthWrite = false;
        const sc = new THREE.Scene(); sc.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), m)); return sc; };
    const at = (tex) => TSL.textureLoad(tex, TSL.ivec2(TSL.int(TSL.screenCoordinate.x), TSL.int(TSL.screenCoordinate.y)));
    const fi = makeFrameInterp(THREE, TSL, { w, h, block: 1, indexedBy: "cur", t, arc,
        fill: fill ? { ...fill, depthPrev: depthPair.texture, depthCur: depthNow.texture } : null });
    const ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const scenes = new Map();
    const once = (key, make) => { if (!scenes.has(key)) scenes.set(key, make()); return scenes.get(key); };
    const draw = async (renderer, sc, target) => { renderer.setRenderTarget(target); await renderer.renderAsync(sc, ortho); };
    const of = flow ? makeOpticalFlow(THREE, TSL, { w, h, block: flow.block ?? 8, searchRadius: flow.searchRadius ?? 4, levels: flow.levels ?? 3 }) : null;
    const rec = flow ? makeFlowReconcile(THREE, TSL, { w, h, block: flow.block ?? 8, margin: flow.margin ?? null, mode: flow.mode ?? "pixel", radius: flow.radius ?? 1 }) : null;
    // v4744: the arc -- a toward stage's field (render/temporalTsl.mjs's makeMotionStage({ toward: true })), each pixel's
    // displacement to time t in pixels, and its validity
    const toT = arc ? flat() : null;
    const toTNode = (toward) => TSL.Fn(() => { const m = at(toward); return TSL.vec4(m.x.mul(w), m.y.mul(h), 0.0, TSL.select(m.z.equal(0.0), TSL.float(0.0), TSL.float(1.0))); })();
    let generated = 0;
    return {
        interp: fi, targets: { field, depthNow, depthOld, depthPair, toT }, uniforms: fi.uniforms, opticalFlow: of, reconcile: rec, arc,
        get generated() { return generated; },
        /**
         * `t` (v4743) generates at that time instead of the one the generator was made with, and `again` says this is the
         * pair of the last call once more -- a second frame between the same two, as a pacer asks for when the display runs
         * at more than twice the real frames' rate: the field, the flow and the depth history are the last call's.
         */
        async generate(renderer, { prev, cur, motion, depth, toward = null }, output = null, { t: at_ = null, again = false } = {}) {
            if (arc && !toward) throw new Error("fx/fsr/fsrFrameGenTsl: an arc generator needs `toward`, the displacement to time t -- a toward stage's motion");
            if (arc && at_ !== null && at_ !== t) throw new Error("fx/fsr/fsrFrameGenTsl: an arc generator's time is its toward stage's -- render that stage at the new t instead");
            const keep = renderer.getRenderTarget();
            if (at_ !== null && !(at_ >= 0 && at_ <= 1)) throw new Error(`fx/fsr/fsrFrameGenTsl: t must be in [0, 1] -- got ${at_}`);
            fi.uniforms.t.value = at_ === null ? t : at_;                                // each call's own: the made-with t unless given
            if (again && generated === 0) throw new Error("fx/fsr/fsrFrameGenTsl: `again` needs a pair generated before it");
            if (!again) {
                const copyNow = once("now|" + depth.uuid, () => quad(at(depth)));
                if (!of) await draw(renderer, once("field|" + motion.uuid + "|" + depth.uuid, () => quad(flowFromMotionNode(TSL, motion, depth, { w, h }).node)), field);
                await draw(renderer, copyNow, depthNow);
                // the pair's older depth: the last pair's newer one, or this frame's own on the first call
                await draw(renderer, once(generated === 0 ? "pair0" : "pair", () => quad(at(generated === 0 ? depthNow.texture : depthOld.texture))), depthPair);
            }
            if (of && !again) {
                // the colour's own motion, prev -> cur, and per block the one the two frames support better -- per pixel, the
                // application's own vector wherever its block kept it (render/flowReconcileTsl.mjs)
                await of.flow(renderer, cur, prev);
                await rec.reconcile(renderer, { lumaCur: of.pyramids.cur.targets[0].texture, lumaPrev: of.pyramids.prev.targets[0].texture,
                                                flow: of.target.texture, motion, depth });
            }
            if (arc && !again) await draw(renderer, once("toT|" + toward.uuid, () => quad(toTNode(toward))), toT);
            await fi.splat(renderer, of ? rec.targets.field.texture : field.texture, arc ? toT.texture : null);
            await fi.gather(renderer, prev, cur, output);
            if (!again) await draw(renderer, once("keep", () => quad(at(depthNow.texture))), depthOld);   // the next pair's older depth
            renderer.setRenderTarget(keep);
            generated++;
        },
        dispose() { fi.dispose(); for (const x of [field, depthNow, depthOld, depthPair, toT]) if (x) x.dispose(); if (of) { of.dispose(); rec.dispose(); } },
    };
}
