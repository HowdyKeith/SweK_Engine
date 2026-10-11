// render/translucentLayer.mjs -- v4760 -- TRANSLUCENT THINGS IN THE WORLD, AS A LAYER OVER THE FRAME: glass, water, sparks.
//
// A frame generator splats one vector a pixel, and a pixel under a pane of glass shows two things that move otherwise -- the
// pane and what is behind it. render/temporalTsl.mjs's motion stage draws every object as a surface of its own, a translucent
// one too, so its field says the pane's motion there and what is behind it is cross-faded in place. Skipping translucent things
// in that pass -- the field then says what is behind -- is what a game's motion vectors do, and it drags a still pane's edges
// and its own pattern with the background instead. Neither single field is right, and which is less wrong turns on the content
// (fx/fsr/fsrFrameGenTranslucent-selfcheck.mjs, on six cases): drawn wins on four, skipped on two.
//
// *** SO THEY ARE NOT SPLATTED AT ALL: THEY ARE A LAYER, DRAWN AT THE GENERATED TIME. *** The path FSR3 gives a HUD, and this
// tree gave a UI (v4745, v4755) and particles (v4752): the frames the generator is given, and the motion stage's pass, are drawn
// with the translucent things hidden (hide), and each frame shown -- generated at t or real -- gets them drawn at its own time
// over transparent black (render) and composited, premultiplied: rgb + (1 - a) x frame, fx/fsr/fsrFrameGenTsl.mjs's `ui`. On a
// real frame that IS the frame rendered with them, to the bit: three blends a translucent thing over the frame as
// src x a + dst x (1 - a), and over transparent black it leaves (src x a, a), which the composite lays over the frame with the
// same two operations. Measured on both backends (render/translucentLayer-selfcheck.mjs).
//
// Two things make the layer the frame's:
//   * *** WHAT IS OPAQUE IS DRAWN FIRST, DEPTH ONLY. *** A pane behind a box that moves is hidden by it where the box is at t;
//     without the depth, the pane is laid over the box.
//   * *** AN ADDITIVE MATERIAL COVERS NOTHING, SO IT MUST LEAVE THE LAYER'S ALPHA ALONE. *** three blends AdditiveBlending's
//     alpha as One, One -- the layer's alpha becomes the spark's own, and the composite then REPLACES the frame under every
//     spark's quad with it (a generated frame's sparks at 7.9 dB where the layer is right at 51.1). For the draw its alpha is Zero, One; its
//     colour's factors are three's own for it (SrcAlpha or, premultiplied, One -- and One).
// Blending that is neither over nor adding -- Multiply, Subtractive, Custom, None -- is not a layer's: a multiply scales the
// frame per channel, which one alpha cannot carry. It is refused, by the object's name. So is an object some of whose materials
// are translucent and some not: the layer takes whole objects.
//
// What costs what: each frame shown draws the opaque scene once more, depth only, and the translucent things -- the price a HUD
// drawn at t pays, plus a geometry pass. The generator's frames are drawn WITHOUT them, which is the order a renderer draws in
// anyway: opaque first.
//
// *** v4765: WHAT READS THE FRAME BEHIND IT IS DRAWN OVER THE FRAME, NOT OVER BLACK. *** A material with a backdropNode, or with
// transmission, samples what three has drawn before it -- three puts it in its transparent list whatever its `transparent`
// says, and isTranslucent did not, so such a lens went into the generator's frames as a surface: the worst arm on every case
// fx/fsr/fsrFrameGenBackdrop-selfcheck.mjs measures, 21 to 24 dB on its pixels. readsBackdrop finds them; hide(scene) hides them
// with the translucent things; render() leaves them out (they write depth there, being surfaces); renderOver(frame) draws them at
// the scene's time over the frame itself -- copied in texel for texel, the opaque scene's depth drawn first -- which is three's
// own order: opaque, then what reads it. A real frame rebuilt so is the frame drawn with them, to the bit, on both backends;
// through the generator's `over` it beats the best single field on every case, +1.4 to +6.7 dB on the lens's pixels.
//
// *** v4767: THE OCCLUDING DEPTH NEED NOT BE A GEOMETRY PASS. *** render() and renderOver() draw the opaque scene depth-only first
// -- a whole geometry pass each generated frame, as much as rendering a real frame on this device (203 ms against 211 at a
// million triangles). `{ depth: tex }` writes it from a texture instead -- .z a clip depth, .w whether anything is there, the
// far plane where not: fx/fsr/fsrFrameGenTsl.mjs's depthAt, the generator's own splat -- with one full-screen quad, 3.5 ms at
// any size (fx/fsr/fsrFrameGenLayerCost-selfcheck.mjs). On the translucent things' pixels it is the geometry pass's to the dB;
// the frame moves only at an occluder's edge, -0.29 and -0.81 dB where a box slides in front. From the stage's own clip depth
// it is the geometry pass's to the bit, on both backends.
"use strict";
import { refreshEveryRender } from "./threeWorkarounds.mjs";

const RENDERABLE = (o) => !!(o && (o.isMesh || o.isLine || o.isPoints || o.isSprite));
const materials = (o) => (Array.isArray(o.material) ? o.material : [o.material]).filter(Boolean);
const label = (o) => (o.name ? JSON.stringify(o.name) : `a ${o.type || "object"}`);

/** Whether a three.js object is drawn translucent: a mesh, line, points or sprite whose materials are transparent. */
export function isTranslucent(object) {
    if (!RENDERABLE(object)) return false;
    const ms = materials(object), n = ms.filter((m) => m.transparent === true).length;
    if (n > 0 && n < ms.length) throw new Error(`render/translucentLayer: ${label(object)} has ${n} translucent material(s) of ${ms.length} -- a layer takes whole objects; split it`);
    return n > 0;
}

/**
 * v4765: whether a three.js object reads the frame behind it -- a material with a backdropNode, or transmission. three draws
 * these after the opaque scene, sampling what is already drawn; over transparent black they have nothing to sample, so they
 * are not a layer's: renderOver draws them over the frame itself.
 */
export function readsBackdrop(object) {
    if (!RENDERABLE(object)) return false;
    return materials(object).some((m) => (m.backdropNode && m.backdropNode.isNode) || m.transmission > 0 || (m.transmissionNode && m.transmissionNode.isNode));
}

/**
 * A layer of a scene's translucent things, w x h, premultiplied: target.texture is (rgb x a, a) over transparent black, to lay
 * over a frame drawn without them -- fx/fsr/fsrFrameGenTsl.mjs's `ui`, or its composite. `select(object)` chooses the things
 * (isTranslucent unless given). hide(scene) hides them and returns what puts back each one's own visibility; render(renderer,
 * scene, camera) draws them as the scene stands, the opaque rest depth-tested against, and leaves the renderer, the scene and
 * every material as it found them.
 * v4765: things that read their backdrop (readsBackdrop) are never the layer's: hide(scene) hides them too, and
 * renderOver(renderer, scene, camera, frame) draws them over `frame` -- a w x h texture, the generated frame or a real one drawn
 * without them -- the opaque scene's depth first, and returns overTarget.texture: fx/fsr/fsrFrameGenTsl.mjs's `over`.
 */
export function makeTranslucentLayer(THREE, { w, h, type = null, select = isTranslucent } = {}) {
    if (!(w >= 1 && h >= 1) || w !== Math.floor(w) || h !== Math.floor(h)) throw new Error(`render/translucentLayer: w and h must be whole numbers of pixels -- got ${w} x ${h}`);
    if (typeof select !== "function") throw new Error("render/translucentLayer: select must be a function of an object");
    const target = new THREE.RenderTarget(w, h, { type: type == null ? THREE.FloatType : type, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
    const depthOnly = new THREE.MeshBasicNodeMaterial(); depthOnly.colorWrite = false;
    // v4809: every backdrop reader the layer meets is marked so three r186 refreshes it at every render -- drawn into the generator's
    // targets one after another, a transmission material otherwise samples the previous target's frame (render/threeWorkarounds.mjs,
    // docs/upstream-three/dev/17). prepare(scene) marks them before an application's first render; gather marks any that arrive later
    const mark = (objs) => { for (const o of objs) for (const m of materials(o)) refreshEveryRender(THREE, m); return objs; };
    const gather = (scene) => { const tr = [], bd = [], op = []; scene.traverse((o) => { if (!RENDERABLE(o)) return; (readsBackdrop(o) ? bd : select(o) ? tr : op).push(o); }); mark(bd); return { tr, bd, op }; };
    // v4765: the frame the backdrop readers are drawn over, copied in exactly (a texel a pixel), with a depth buffer of its own
    const overTarget = new THREE.RenderTarget(w, h, { type: type == null ? THREE.FloatType : type, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
    const L = THREE.TSL, ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1), copies = new Map(), depthQuads = new Map();
    // v4767: the occluding depth from a texture -- .z a clip depth, .w whether anything is there (render/frameInterpTsl.mjs's splat,
    // fx/fsr/fsrFrameGenTsl.mjs's depthAt) -- written into the depth buffer by one full-screen quad, where nothing is there the far
    // plane. It stands in for the depth pass of the opaque scene, which is a whole geometry pass
    const depthQuad = (tex, gl) => { const key = tex.uuid + (gl ? "|gl" : ""); let sc = depthQuads.get(key); if (!sc) { const m = new THREE.NodeMaterial();
        const v = L.textureLoad(tex, L.ivec2(L.int(L.screenCoordinate.x), L.int(L.screenCoordinate.y))), win = gl ? v.z.mul(0.5).add(0.5) : v.z;
        m.fragmentNode = L.vec4(0.0, 0.0, 0.0, 0.0); m.depthNode = L.select(v.w.greaterThan(0.5), win, L.float(1.0));
        m.colorWrite = false; m.depthTest = true; m.depthWrite = true; m.depthFunc = THREE.AlwaysDepth; m.blending = THREE.NoBlending;
        sc = new THREE.Scene(); sc.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), m)); depthQuads.set(key, sc); } return sc; };
    const occluders = async (renderer, scene, camera, hideThese, depth) => {
        if (depth) { await renderer.renderAsync(depthQuad(depth, renderer.coordinateSystem === THREE.WebGLCoordinateSystem), ortho); return; }
        const back = hideAll(hideThese); scene.overrideMaterial = depthOnly;
        try { await renderer.renderAsync(scene, camera); } finally { scene.overrideMaterial = null; back(); }
    };
    const copyOf = (tex) => { let sc = copies.get(tex); if (!sc) { const m = new THREE.NodeMaterial();
        m.fragmentNode = L.textureLoad(tex, L.ivec2(L.int(L.screenCoordinate.x), L.int(L.screenCoordinate.y))); m.blending = THREE.NoBlending; m.depthTest = false; m.depthWrite = false;
        sc = new THREE.Scene(); sc.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), m)); copies.set(tex, sc); } return sc; };
    const hideAll = (objs) => { const was = objs.map((o) => o.visible); for (const o of objs) o.visible = false; return () => objs.forEach((o, i) => { o.visible = was[i]; }); };
    const blendOf = (m) => {
        if (m.blending === THREE.NormalBlending || m.blending === THREE.AdditiveBlending) return m.blending;
        const names = { [THREE.NoBlending]: "NoBlending", [THREE.SubtractiveBlending]: "SubtractiveBlending", [THREE.MultiplyBlending]: "MultiplyBlending", [THREE.CustomBlending]: "CustomBlending" };
        return names[m.blending] || String(m.blending);
    };
    // an additive material's draw into the layer: its colour's factors, and its alpha left alone
    const FIELDS = ["blending", "blendSrc", "blendDst", "blendEquation", "blendSrcAlpha", "blendDstAlpha", "blendEquationAlpha"];
    const toLayer = (objs) => {
        const kept = new Map();
        for (const o of objs) for (const m of materials(o)) {
            if (kept.has(m) || m.blending !== THREE.AdditiveBlending) continue;
            kept.set(m, FIELDS.map((f) => m[f]));
            m.blending = THREE.CustomBlending; m.blendEquation = THREE.AddEquation; m.blendEquationAlpha = THREE.AddEquation;
            m.blendSrc = m.premultipliedAlpha ? THREE.OneFactor : THREE.SrcAlphaFactor; m.blendDst = THREE.OneFactor;
            m.blendSrcAlpha = THREE.ZeroFactor; m.blendDstAlpha = THREE.OneFactor;
        }
        return () => { for (const [m, v] of kept) FIELDS.forEach((f, i) => { m[f] = v[i]; }); };
    };
    return {
        target, texture: target.texture, overTarget,
        /** v4809: mark the scene's backdrop readers for three r186 (render/threeWorkarounds.mjs) before its first render; returns how many. */
        prepare(scene) { return gather(scene).bd.length; },
        /** Hide the scene's translucent things and its backdrop readers: the generator's frames and the motion stage's pass are drawn so. */
        hide(scene) { const { tr, bd } = gather(scene); return hideAll([...tr, ...bd]); },
        async renderOver(renderer, scene, camera, frame, { depth = null } = {}) {
            if (!frame || !frame.image || frame.image.width !== w || frame.image.height !== h)
                throw new Error(`render/translucentLayer: renderOver's frame must be a ${w} x ${h} texture -- got ${frame && frame.image ? frame.image.width + " x " + frame.image.height : "no image"}`);
            const { tr, bd, op } = gather(scene);
            const keep = { target: renderer.getRenderTarget(), auto: renderer.autoClear, bg: scene.background, over: scene.overrideMaterial };
            try {
                // the frame, copied in; then what is opaque, depth only; then the backdrop readers, sampling the frame as it stands
                renderer.setRenderTarget(overTarget); await renderer.renderAsync(copyOf(frame), ortho);
                renderer.autoClear = false; scene.background = null;
                await occluders(renderer, scene, camera, [...tr, ...bd], depth);
                const back = hideAll([...op, ...tr]);
                try { await renderer.renderAsync(scene, camera); } finally { back(); }
            } finally {
                scene.overrideMaterial = keep.over; scene.background = keep.bg; renderer.autoClear = keep.auto; renderer.setRenderTarget(keep.target);
            }
            return overTarget.texture;
        },
        async render(renderer, scene, camera, { depth = null } = {}) {
            const { tr, bd, op } = gather(scene);
            for (const o of tr) for (const m of materials(o)) { const b = blendOf(m);
                if (typeof b === "string") throw new Error(`render/translucentLayer: ${label(o)}'s material blends by ${b} -- a layer over a frame carries only NormalBlending (over) and AdditiveBlending (adding)`); }
            const keep = { target: renderer.getRenderTarget(), color: new THREE.Color(), alpha: renderer.getClearAlpha(), auto: renderer.autoClear, bg: scene.background, over: scene.overrideMaterial };
            renderer.getClearColor(keep.color);
            renderer.setRenderTarget(target); renderer.setClearColor(0x000000, 0); await renderer.clearAsync();
            renderer.autoClear = false; scene.background = null;
            try {
                // what is opaque, depth only: a translucent thing behind it is hidden by it -- and a backdrop reader, a surface too;
                // or (v4767) that depth from a texture, one quad in place of a geometry pass
                await occluders(renderer, scene, camera, tr, depth);
                // the translucent things alone, over transparent black -- never a backdrop reader, which renderOver draws
                const back = hideAll([...op, ...bd]); const undo = toLayer(tr);
                try { await renderer.renderAsync(scene, camera); } finally { undo(); back(); }
            } finally {
                scene.overrideMaterial = keep.over; scene.background = keep.bg; renderer.autoClear = keep.auto;
                renderer.setClearColor(keep.color, keep.alpha); renderer.setRenderTarget(keep.target);
            }
        },
        dispose() { target.dispose(); overTarget.dispose(); depthOnly.dispose(); for (const sc of [...copies.values(), ...depthQuads.values()]) sc.children[0].material.dispose(); },
    };
}
