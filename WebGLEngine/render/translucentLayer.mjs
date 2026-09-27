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
"use strict";

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
 * A layer of a scene's translucent things, w x h, premultiplied: target.texture is (rgb x a, a) over transparent black, to lay
 * over a frame drawn without them -- fx/fsr/fsrFrameGenTsl.mjs's `ui`, or its composite. `select(object)` chooses the things
 * (isTranslucent unless given). hide(scene) hides them and returns what puts back each one's own visibility; render(renderer,
 * scene, camera) draws them as the scene stands, the opaque rest depth-tested against, and leaves the renderer, the scene and
 * every material as it found them.
 */
export function makeTranslucentLayer(THREE, { w, h, type = null, select = isTranslucent } = {}) {
    if (!(w >= 1 && h >= 1) || w !== Math.floor(w) || h !== Math.floor(h)) throw new Error(`render/translucentLayer: w and h must be whole numbers of pixels -- got ${w} x ${h}`);
    if (typeof select !== "function") throw new Error("render/translucentLayer: select must be a function of an object");
    const target = new THREE.RenderTarget(w, h, { type: type == null ? THREE.FloatType : type, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
    const depthOnly = new THREE.MeshBasicNodeMaterial(); depthOnly.colorWrite = false;
    const gather = (scene) => { const tr = [], op = []; scene.traverse((o) => { if (!RENDERABLE(o)) return; (select(o) ? tr : op).push(o); }); return { tr, op }; };
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
        target, texture: target.texture,
        /** Hide the scene's translucent things: the frames the generator is given and the motion stage's pass are drawn so. */
        hide(scene) { return hideAll(gather(scene).tr); },
        async render(renderer, scene, camera) {
            const { tr, op } = gather(scene);
            for (const o of tr) for (const m of materials(o)) { const b = blendOf(m);
                if (typeof b === "string") throw new Error(`render/translucentLayer: ${label(o)}'s material blends by ${b} -- a layer over a frame carries only NormalBlending (over) and AdditiveBlending (adding)`); }
            const keep = { target: renderer.getRenderTarget(), color: new THREE.Color(), alpha: renderer.getClearAlpha(), auto: renderer.autoClear, bg: scene.background, over: scene.overrideMaterial };
            renderer.getClearColor(keep.color);
            renderer.setRenderTarget(target); renderer.setClearColor(0x000000, 0); await renderer.clearAsync();
            renderer.autoClear = false; scene.background = null;
            try {
                // what is opaque, depth only: a translucent thing behind it is hidden by it
                let back = hideAll(tr); scene.overrideMaterial = depthOnly;
                try { await renderer.renderAsync(scene, camera); } finally { scene.overrideMaterial = null; back(); }
                // the translucent things alone, over transparent black
                back = hideAll(op); const undo = toLayer(tr);
                try { await renderer.renderAsync(scene, camera); } finally { undo(); back(); }
            } finally {
                scene.overrideMaterial = keep.over; scene.background = keep.bg; renderer.autoClear = keep.auto;
                renderer.setClearColor(keep.color, keep.alpha); renderer.setRenderTarget(keep.target);
            }
        },
        dispose() { target.dispose(); depthOnly.dispose(); },
    };
}
