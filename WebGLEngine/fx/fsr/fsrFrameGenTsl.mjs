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
// against its block's flow on the 3 x 3 window about it, the flow winning only by explaining it ten times better -- twice as
// well where the pixel's own vector is under 0.05 pixels (v4745: a surface that stood still on screen, where whatever moved
// is shading) -- and only on evidence read inside the frame. fx/fsr/fsrFrameGenFlow-selfcheck.mjs measures it: +0.7 to +0.8
// dB over the frame where a wall's texture scrolls behind the knot (+4 to +16 on the wall itself), -0.03 under a pan where
// every vector is exact; fx/fsr/fsrFrameGenScene-selfcheck.mjs on a shadow, +1.2 to +1.5, and a reflection, +6.1 --
// and render/flowReconcile.mjs's block rule, applied per pixel, BELOW the vectors alone where the texture scrolls, because a
// block straddling the knot's silhouette hands its one vector to the knot. It is not the default: it pays only on content
// the vectors miss, and it is a pyramid and a search every generated frame.
//
// *** WHAT THE FLOW COSTS (v4748). *** Its search is over nine tenths of its reads -- 264M a frame at 960 x 540, each 8 x 8
// block scoring 84 to 88 candidates at every level (render/flowCost.mjs, which this device's timings follow to 11%).
// `flow: { refineRadius: 2 }` searches the whole window at the coarsest level only and refines below it: 56% of the reads,
// the same shifts found (the reach is the coarsest level's), within 0.1 dB on fx/fsr/fsrFrameGenFlow-selfcheck.mjs's
// four cases. It is not the default: a plain shadow's changed pixels read 0.85 dB lower with it.
// *** v4753: EACH LEVEL ITS OWN GRID, AND THAT IS THE DEFAULT. *** The search had run every level on the finest level's
// grid, each block's coarse patch anchored at its corner and reaching 24 pixels past it -- so a coarse level measured motion
// 12 pixels from the block, and paid for every finest block at every level. `grid: "level"` (render/opticalFlow.mjs) gives
// each level a quarter of the blocks of the one below, each covering its own: 122M reads at 960 x 540 against 264M, 49M
// refining within 2. On the mirror a zoom's end-point error falls from 0.40 px to 0.15 and a turn's from 0.49 to 0.17, and
// where two motions meet 39 of 44 blocks are right against 26 (render/flowCost-selfcheck.mjs); in this generator the frame
// is no worse on any case and better where a texture scrolls (fx/fsr/fsrFlowGrid-selfcheck.mjs).
//
// *** BETWEEN ALIASED FRAMES IT FLICKERS (v4746). *** A generated frame blends two frames, which anti-aliases what a
// single-sample frame aliases, so between native frames the display alternates aliased and anti-aliased: under a pan over
// fine stripes the shown sequence alternates +1.3 / 255 more than the scene does, with the generated frames 1.6 dB closer
// to the truth than the real ones. Between FSR2's frames -- FSR3 as it is composed -- it adds none; 4x MSAA takes a turning
// knot's but not the stripes'; sharpening the generated frames makes it worse (fx/fsr/fsrFlicker-selfcheck.mjs).
//
// *** A HUD IS NOT RECONCILED, IT IS COMPOSITED (v4745). *** Every vector under a HUD is the scene's behind it, and under a
// pan the flow judges a HUD pixel at 0.9 because that vector moved, so both warp the HUD with the scene: 20.4 and 21.7 dB on
// the HUD's pixels. FSR3's answer is the one here: generate from HUD-LESS frames and give the newer frame's UI as `ui`,
// premultiplied, laid over the generated frame -- the HUD exactly, and +4.9 dB on the whole frame
// (fx/fsr/fsrFrameGenScene-selfcheck.mjs).
//
// *** A UI THAT MOVES IS DRAWN AT THE GENERATED TIME, AND A TRANSLUCENT ONE IS COMPOSITED (v4755). *** Composited over the
// generated frame, a translucent panel is exact over whatever the scene behind it does: +4.6 dB on the panels' pixels over
// drawing them into the frames. But the newer frame's UI puts anything in it that moves half a frame ahead, and the older
// frame's half a frame behind -- a marker sliding 6 pixels a frame read 10 dB on its pixels either way. `ui` as a function of
// t draws it where it is at t: 72.8 dB there, +5.1 on the whole frame (fx/fsr/fsrFrameGenUi-selfcheck.mjs). A UI draw each
// generated frame is what that costs.
//
// *** PARTICLES CARRY THEIR VECTORS ONLY AS INSTANCES, AND ARE BEST DRAWN AT THE GENERATED TIME (v4752). *** An InstancedMesh
// carries each particle's motion -- since v4752 render/temporalTsl.mjs's stage keeps the previous instance matrices itself,
// three's being the ones the material was built with (103 px on particles moving 5) -- and quads written into one buffer each
// frame carry none. Over 160 particles' pixels: instanced 14.76 dB, buffered 12.29, the flow taking the buffered ones to
// 14.74 and the instanced to 16.88; and the particles drawn at the generated time over a frame generated WITHOUT them, through
// `composite` as a HUD is, 18.65 either way (fx/fsr/fsrFrameGenParticles-selfcheck.mjs). That costs a particle draw each
// generated frame, and it is the only answer here for particles the motion stage cannot follow. v4762: particles a COMPUTE pass
// moves carry their motion when the material says where they were -- userData.previousPositionNode, a copy render/temporalTsl.mjs's
// makePreviousCopy keeps (render/temporalTslCompute-selfcheck.mjs).
//
// *** TRANSLUCENT THINGS ARE A LAYER TOO, DRAWN AT t (v4760). *** A pixel under glass shows the glass and what is behind it,
// and this generator splats one vector a pixel. render/temporalTsl.mjs's stage draws the glass as a surface -- what is behind
// is cross-faded in place -- and a pass without it drags the glass with the background; which is less wrong turns on the
// content (drawn ahead on four of fx/fsr/fsrFrameGenTranslucent-selfcheck.mjs's six cases, skipped on two) and the flow sides
// with the background. render/translucentLayer.mjs hides them from the frames and the stage, and draws them at t, the opaque
// scene depth-tested against, over transparent black: given as `ui`, a function of t, it beats the best field on every
// case's translucent pixels -- +41.7 dB on a still pane over a moving wall, +30.2 over a fine one, +28.6 on additive sparks,
// +4.4 behind a box sliding across, +4.0 and +2.5 on an etched pane, still and moving -- and over every frame. A real frame
// composited so IS the frame drawn with them (render/translucentLayer-selfcheck.mjs). That costs a depth pass of the opaque
// scene and a draw of the translucent things each generated frame.
//
// *** WHAT READS THE FRAME BEHIND IT IS DRAWN OVER THE GENERATED FRAME (v4765). *** A lens with a backdropNode or transmission
// samples what is drawn before it; laid over transparent black it samples nothing. `over`, a function of (t, the generated frame)
// returning a texture, is applied after generation and before `ui` -- render/translucentLayer.mjs's renderOver draws the lens at
// t over the frame generated without it: +6.7 and +1.4 dB on a still lens's pixels (backdrop, transmission), +4.7 and +1.4 on a
// moving one, exact against the midpoint where what is behind stands still (fx/fsr/fsrFrameGenBackdrop-selfcheck.mjs).
// v4767: the layer and the lens need the opaque scene's depth at t, and drawing it is a geometry pass as dear as a real frame.
// depthAt is this generator's own splat -- the clip depth of what lands at each pixel -- and a `ui` function is now called after
// the splat, so it can read it: render/translucentLayer.mjs's { depth: gen.depthAt }, one quad at any scene size, the same on
// the translucent things' pixels (fx/fsr/fsrFrameGenLayerCost-selfcheck.mjs).
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
//
// *** AND A HOLE THE RADIUS DOES NOT REACH IS NOT LEFT AT ZERO: THE DEFAULT REACHES 16 (v4769). *** Under a pan, content comes in
// at the frame's edge and a wall moving against a knot opens a gap behind it half the relative motion wide; past 4 px the fill
// found nothing and the pixel stayed black -- 1,721 of 16,384 under a 24 px pan. That was what v4758 measured as the flow LOSING
// to the vectors on a scrolling wall (28.25 dB against 36.98): the flow's vectors were the wall's true motion, and the gap
// they opened was left black (fx/fsr/fsrFrameGenReach-selfcheck.mjs). render/holeFill.mjs's `reach` searches again only where the
// radius found nothing, so every hole the radius fills is filled as it was: of the 21 gates that generate a frame, 18 read to
// the bit what they read before, and the three that moved all rose -- fx/fsr/fsrFlowStill-selfcheck.mjs's belts 16.7 and 8.6 dB
// over the frame, fx/fsr/fsrFlowSeed-selfcheck.mjs's fast pans 2.2 to 7.4. A radius of 8 in its place changed every hole and
// lost where the radius already did well (a shadow's changed pixels -1.6 dB). `fill: { radius: 4, side: "blend" }` is v4768's.
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
 * render/opticalFlowTsl.mjs (and v4748's refineRadius, v4753's grid) and { margin, marginStill, stillPx, mode, radius } for
 * render/flowReconcileTsl.mjs, {} for their defaults, null for the vectors alone. The grid here is "level" unless given --
 * each level of the flow's pyramid its own block grid (v4753), 46 % of the search's reads and no worse a frame on any case
 * fx/fsr/fsrFlowGrid-selfcheck.mjs measures; { grid: "block" } is the search as it was to v4752. { seed: true } (v4758) seeds the
 * flow's coarsest level with the motion field given to generate -- v4758 read +0.47 dB on a reflection under a 44 px pan and -0.24 to
 * -0.63 on a scrolling wall under 27 and 40; with v4769's reach filling what those pans left black, +1.61, +0.27 and +3.58. Not the
 * default: no round has measured it as one across the flow's gates (fx/fsr/fsrFlowSeed-selfcheck.mjs). { stillGuess: true } (v4759) guesses
 * standing still below the flow's coarsest level -- nothing in a generated frame measured here (fx/fsr/fsrFlowStill-selfcheck.mjs).
 * { retryRadius: 8 } (v4768) searches again, 8 px about its guess, at the flow's blocks below the coarsest that the window did not
 * explain: a textured square moving 16 px a frame over a still wall, which the flow loses, +12.06 dB on its pixels and +3.81 over the
 * frame -- and one block at a turning knot's edge made confidently wrong costs a scrolling wall's interior 10.75 dB, so not the
 * default (fx/fsr/fsrFlowRetry-selfcheck.mjs). `retryRatio` is the flow's, 0.3 unless given.
 * `camera` (v4750), given to generate with `flow`, is the camera's own motion (makeMotionStage({ camera: true })): the
 * reconciliation then judges a still surface in the world, so a shadow or a reflection under a pan is judged as one.
 * `depthPrev` (v4751), given to generate, is the pair's OLDER depth, in place of the one this generator kept from its last call.
 * `ui` (v4745), given to generate, is the newer frame's UI as a premultiplied w x h texture: `prev` and `cur` are then the
 * frames WITHOUT it, and the generated frame gets it composited over, exactly (render/frameInterp.mjs's compositeUiCPU).
 * v4755: or a FUNCTION of the time being generated, t in [0, 1] between the pair, returning that texture (or a promise of
 * it) -- the UI drawn AT t. Anything in a UI that moves is half a frame from where it should be in either real frame's UI;
 * drawn at t it is where it is (fx/fsr/fsrFrameGenUi-selfcheck.mjs). Mapping t to the caller's own clock is the caller's.
 * `over` (v4765), given to generate, is a function of (t, the generated frame) returning a w x h texture that replaces it before
 * `ui` is laid over -- render/translucentLayer.mjs's renderOver, for what reads the frame behind it.
 */
export function makeFrameGen(THREE, TSL, { w, h, t = 0.5, fill = { radius: 4, reach: 16, side: "blend" }, flow = null, arc = false } = {}) {
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
    const of = flow ? makeOpticalFlow(THREE, TSL, { w, h, block: flow.block ?? 8, searchRadius: flow.searchRadius ?? 4, levels: flow.levels ?? 3, refineRadius: flow.refineRadius ?? null, grid: flow.grid ?? "level", seed: !!flow.seed, stillGuess: !!flow.stillGuess,
        retryRadius: flow.retryRadius ?? null, retryRatio: flow.retryRatio }) : null;
    const rec = flow ? makeFlowReconcile(THREE, TSL, { w, h, block: flow.block ?? 8, margin: flow.margin ?? null, marginStill: flow.marginStill ?? 0.5, stillPx: flow.stillPx ?? 0.05, mode: flow.mode ?? "pixel", radius: flow.radius ?? 1 }) : null;
    // v4744: the arc -- a toward stage's field (render/temporalTsl.mjs's makeMotionStage({ toward: true })), each pixel's
    // displacement to time t in pixels, and its validity
    const toT = arc ? flat() : null;
    const toTNode = (toward) => TSL.Fn(() => { const m = at(toward); return TSL.vec4(m.x.mul(w), m.y.mul(h), 0.0, TSL.select(m.z.equal(0.0), TSL.float(0.0), TSL.float(1.0))); })();
    // v4745: the UI -- the frame generated from HUD-less frames goes to `pre`, made the first time a `ui` is given, and the
    // newer frame's premultiplied UI over it to the output (render/frameInterp.mjs's compositeUiCPU)
    const targets = { field, depthNow, depthOld, depthPair, toT, pre: null };
    const uiNode = (src, ui) => TSL.Fn(() => { const g = at(src), u = at(ui); return u.add(g.mul(TSL.float(1.0).sub(u.w))); })();
    const sized = (ui) => { if (!ui || !ui.image || ui.image.width !== w || ui.image.height !== h)
        throw new Error(`fx/fsr/fsrFrameGenTsl: ui must be a ${w} x ${h} texture, the generated frame's size -- got ${ui && ui.image ? ui.image.width + " x " + ui.image.height : "no image"}`); };
    const composite = async (renderer, src, ui, output) => { await draw(renderer, once("ui|" + src.uuid + "|" + ui.uuid, () => quad(uiNode(src, ui))), output); };
    let generated = 0;
    return {
        interp: fi, targets, uniforms: fi.uniforms, opticalFlow: of, reconcile: rec, arc,
        /** v4769: the fill this generator was built with, as given or defaulted -- null for none */
        fill: fill ? { radius: fill.radius ?? 4, reach: fill.reach ?? null, side: fill.side ?? "derived", prefer: fill.prefer ?? "farther" } : null,
        /** v4767: the generated frame's own depth at t -- .z the clip depth of what landed at each pixel, .w whether anything did:
         *  render/translucentLayer.mjs's `depth`, one quad where the opaque scene's depth pass is a geometry pass. Valid within a generate. */
        get depthAt() { return (fill ? fi.targets.filled : fi.targets.vec).texture; },
        get generated() { return generated; },
        /** v4745: `ui`, premultiplied, over the w x h texture `src`, at `output` -- what generate does with its `ui`, for a real frame. */
        async composite(renderer, src, ui, output = null) { sized(ui); const keep = renderer.getRenderTarget(); await composite(renderer, src, ui, output); renderer.setRenderTarget(keep); },
        /**
         * `t` (v4743) generates at that time instead of the one the generator was made with, and `again` says this is the
         * pair of the last call once more -- a second frame between the same two, as a pacer asks for when the display runs
         * at more than twice the real frames' rate: the field, the flow and the depth history are the last call's.
         */
        async generate(renderer, { prev, cur, motion, depth, toward = null, ui = null, over = null, camera = null, depthPrev = null }, output = null, { t: at_ = null, again = false } = {}) {
            // v4755: `ui` as a function of t is drawn at the time generated -- v4767: AFTER the splat, so it may read depthAt
            const uiAt = typeof ui === "function" ? ui : null;
            if (uiAt) ui = true;
            if (over !== null && typeof over !== "function") throw new Error("fx/fsr/fsrFrameGenTsl: over must be a function of (t, the generated frame) returning a texture");
            if (ui && !uiAt) sized(ui);
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
                // v4751: or the older depth the caller hands over -- a caller holding more than the newest pair (makeFsr3({ hold: 2 }))
                // generates for either, and the history kept here is only ever the last call's
                if (depthPrev) await draw(renderer, once("pairOf|" + depthPrev.uuid, () => quad(at(depthPrev))), depthPair);
                else await draw(renderer, once(generated === 0 ? "pair0" : "pair", () => quad(at(generated === 0 ? depthNow.texture : depthOld.texture))), depthPair);
            }
            if (of && !again) {
                // the colour's own motion, prev -> cur, and per block the one the two frames support better -- per pixel, the
                // application's own vector wherever its block kept it (render/flowReconcileTsl.mjs)
                await of.flow(renderer, cur, prev, of.seed ? motion : null);   // v4758: seeded with the application's own field
                await rec.reconcile(renderer, { lumaCur: of.pyramids.cur.targets[0].texture, lumaPrev: of.pyramids.prev.targets[0].texture,
                                                flow: of.target.texture, motion, depth, camera });
            }
            if (arc && !again) await draw(renderer, once("toT|" + toward.uuid, () => quad(toTNode(toward))), toT);
            await fi.splat(renderer, of ? rec.targets.field.texture : field.texture, arc ? toT.texture : null);
            if ((ui || over) && !targets.pre) targets.pre = flat();
            await fi.gather(renderer, prev, cur, ui || over ? targets.pre : output);
            // v4765: what reads the frame behind it, drawn over the generated frame at t -- before the UI, as three draws it
            let base = ui || over ? targets.pre.texture : null;
            if (over) { base = await over(at_ === null ? t : at_, base); sized(base); }
            if (uiAt) { ui = await uiAt(at_ === null ? t : at_); if (ui) sized(ui); }
            if (ui) await composite(renderer, base, ui, output);
            else if (base) await draw(renderer, once("over|" + base.uuid, () => quad(at(base))), output);   // `over` without a UI, or a `ui` that drew none
            if (!again) await draw(renderer, once("keep", () => quad(at(depthNow.texture))), depthOld);   // the next pair's older depth
            renderer.setRenderTarget(keep);
            generated++;
        },
        dispose() { fi.dispose(); for (const x of Object.values(targets)) if (x) x.dispose(); if (of) { of.dispose(); rec.dispose(); } },
    };
}
