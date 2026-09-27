#!/usr/bin/env node
// WebGLEngine/render/translucentLayer-selfcheck.mjs -- v4760
//
// render/translucentLayer.mjs's layer, held to what it claims on BOTH of three's backends: a frame drawn without the scene's
// translucent things, with the layer composited over it (fx/fsr/fsrFrameGenTsl.mjs's composite), IS the frame drawn with them
// -- over a panel, a premultiplied panel, an additive spark and a premultiplied one, part of the panel behind an opaque box --
// and the layer's alpha is what each covers: the panel's opacity, nothing under a spark, nothing where the box hides the panel.
// And it leaves the renderer, the scene and every material as it found them, keeps a thing hidden that was, and refuses by name
// what a layer cannot carry. fx/fsr/fsrFrameGenTranslucent-selfcheck.mjs measures what it is worth to a generated frame.
"use strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runInEngineOrigin, webgpuSkipReason } from "../tools/ship/webgpuHarness.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let fails = 0;
const ok = (label, cond, detail) => { if (!cond) fails++; console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "   " + detail : ""}`); };
const D = 128;

console.log("\n1. ON THE DEVICE: the layer over the frame without them, against the frame with them");
const skip = webgpuSkipReason();
if (skip) { console.log(`  SKIP  ${skip}`); console.log("  ----  *** NOT A PASS. *** Nothing here is static."); fails++; }
else {
    const r = await runInEngineOrigin({ engineRoot: ENG, timeoutMs: 300000, args: { D }, script: `async (a) => {
        const THREE = await import("/vendor/three-webgpu/three.webgpu.js"); const T = await import("/vendor/three-webgpu/three.tsl.js");
        const TL = await import("/render/translucentLayer.mjs"); const FG = await import("/fx/fsr/fsrFrameGenTsl.mjs");
        const D = a.D, out = {};
        const FIELDS = ["blending", "blendSrc", "blendDst", "blendEquation", "blendSrcAlpha", "blendDstAlpha", "blendEquationAlpha"];
        for (const mode of ["webgpu", "webgl2"]) {
            try {
                const canvas = document.createElement("canvas"); canvas.width = 8; canvas.height = 8;
                const renderer = new THREE.WebGPURenderer({ canvas, forceWebGL: mode === "webgl2", antialias: false }); await renderer.init();
                const gl = renderer.coordinateSystem === THREE.WebGLCoordinateSystem;
                const tgt = () => new THREE.RenderTarget(D, D, { type: THREE.FloatType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
                // top row first on both backends
                const read = async (t) => { const px = await renderer.readRenderTargetPixelsAsync(t, 0, 0, D, D); if (!gl) return px; const o = new Float32Array(D * D * 4);
                    for (let y = 0; y < D; y++) o.set(px.subarray((D - 1 - y) * D * 4, (D - y) * D * 4), y * D * 4); return o; };
                const scene = new THREE.Scene(), bgColor = new THREE.Color(0.02, 0.03, 0.06); scene.background = bgColor;
                const bgm = new THREE.MeshBasicNodeMaterial(); bgm.colorNode = T.Fn(() => { const q = T.uv().mul(T.vec2(14.0, 8.0)).mul(6.4); return T.vec3(0.4).add(T.mx_noise_vec3(T.vec3(q.x, q.y, 0.37)).mul(0.25)); })();
                const bg = new THREE.Mesh(new THREE.PlaneGeometry(14, 8), bgm); bg.name = "wall"; scene.add(bg);
                const pane = (name, w, x, y, z, color, opacity, premultipliedAlpha) => { const m = new THREE.MeshBasicNodeMaterial({ transparent: true, premultipliedAlpha });
                    m.colorNode = T.vec3(...color); m.opacityNode = T.float(opacity); const p = new THREE.Mesh(new THREE.PlaneGeometry(w, w), m); p.name = name; p.position.set(x, y, z); scene.add(p); return p; };
                const spark = (name, x, y, opacity, premultipliedAlpha) => { const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, premultipliedAlpha });
                    m.colorNode = T.Fn(() => { const d = T.uv().sub(0.5); return T.vec3(1.0, 0.6, 0.2).mul(T.exp(d.dot(d).div(-0.02))); })(); m.opacityNode = T.float(opacity);
                    const s = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.6), m); s.name = name; s.position.set(x, y, 0.7); scene.add(s); return s; };
                const glass = pane("glass", 1.6, 0.3, 0.3, 0.5, [0.55, 0.75, 1.0], 0.35, false), tinted = pane("tinted", 0.8, 0.9, -0.2, 0.6, [1.0, 0.5, 0.4], 0.5, true);
                // v4765: a rippled lens reading the frame behind it, behind the panels (three draws it first)
                const lm = new THREE.MeshBasicNodeMaterial(); lm.backdropNode = T.viewportSharedTexture(T.screenUV.add(T.vec2(T.sin(T.uv().y.mul(25.0)).mul(0.02), 0.0))).rgb.mul(T.vec3(0.7, 0.85, 1.0));
                const lens = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.9), lm); lens.name = "lens"; lens.position.set(1.1, -0.9, 0.3); scene.add(lens);
                const hidden = pane("hidden", 0.5, 1.3, 1.3, 0.5, [0.2, 1.0, 0.2], 0.8, false); hidden.visible = false;
                const s1 = spark("spark", -1.2, -0.9, 1.0, false), s2 = spark("spark2", -1.2, 0.9, 0.6, true);
                const box = new THREE.Mesh(new THREE.BoxGeometry(0.5, 2.4, 0.3), new THREE.MeshNormalNodeMaterial()); box.name = "box"; box.position.set(-0.2, 0, 1.0); scene.add(box);
                const cam = new THREE.PerspectiveCamera(40, 1, 0.1, 50); cam.position.set(0, 0, 5.2); cam.lookAt(0, 0, 0); cam.updateMatrixWorld();
                scene.updateMatrixWorld(true);
                const px = (x, y, z) => { const v = new THREE.Vector3(x, y, z).project(cam); return Math.floor((1 - v.y) / 2 * D) * D + Math.floor((v.x + 1) / 2 * D); };
                const at = { lensOnly: px(1.3, -1.2, 0.3), glassOnly: px(0.8, 0.8, 0.5), boxOverGlass: px(-0.2, 0.6, 1.15), spark: px(-1.2, -0.9, 0.7), spark2: px(-1.2, 0.9, 0.7), hidden: px(1.3, 1.3, 0.5), wall: px(-1.6, 0.0, 0.0) };
                const layer = TL.makeTranslucentLayer(THREE, { w: D, h: D }), gen = FG.makeFrameGen(THREE, T, { w: D, h: D });
                const withT = tgt(), without = tgt(), comp = tgt(), park = tgt();
                renderer.setRenderTarget(withT); await renderer.renderAsync(scene, cam);
                const restore = layer.hide(scene), hiddenWhile = [glass, tinted, s1, s2, hidden, lens].map((o) => o.visible), openWhile = [bg, box].map((o) => o.visible);
                renderer.setRenderTarget(without); await renderer.renderAsync(scene, cam); restore();
                const afterRestore = [glass, tinted, s1, s2, hidden, bg, box, lens].map((o) => o.visible);
                // the state render() must leave as it found it
                renderer.setRenderTarget(park); renderer.setClearColor(new THREE.Color(0.2, 0.3, 0.4), 0.7);
                const mats = [glass, tinted, s1, s2, hidden].map((o) => o.material), before = mats.map((m) => FIELDS.map((f) => m[f]));
                await layer.render(renderer, scene, cam);
                const cc = new THREE.Color(); renderer.getClearColor(cc);
                const state = { target: renderer.getRenderTarget() === park, clear: [cc.r, cc.g, cc.b, renderer.getClearAlpha()].map((v) => +v.toFixed(6)), auto: renderer.autoClear,
                    background: scene.background === bgColor, override: scene.overrideMaterial === null, materials: mats.every((m, i) => FIELDS.every((f, j) => m[f] === before[i][j])),
                    visible: [glass, tinted, s1, s2, hidden, bg, box, lens].map((o) => o.visible) };
                // v4765: in three's order -- the frame without them, the lens drawn over it, the layer composited over that
                renderer.setRenderTarget(park); const overTex = await layer.renderOver(renderer, scene, cam, without.texture); state.overKept = renderer.getRenderTarget() === park && renderer.autoClear === true && scene.background === bgColor;
                await gen.composite(renderer, overTex, layer.texture, comp);
                const W = await read(withT), L = await read(layer.target), C = await read(comp);
                // where two panels overlap -- the layer's alpha 0.35 + 0.5 x 0.65 -- and where one thing covers
                let mx = 0, n = 0, mxOne = 0, nTwo = 0; for (let i = 0; i < D * D; i++) { const two = L[i * 4 + 3] > 0.6; if (two) nTwo++;
                    for (let c = 0; c < 3; c++) { const d = Math.abs(C[i * 4 + c] - W[i * 4 + c]); if (d > 0) n++; mx = Math.max(mx, d); if (!two) mxOne = Math.max(mxOne, d); } }
                const pix = Object.fromEntries(Object.entries(at).map(([k, i]) => [k, Array.from(L.subarray(i * 4, i * 4 + 4))]));
                let covered = 0; for (let i = 0; i < D * D; i++) if (L[i * 4 + 3] > 0) covered++;
                const o = { maxDiff: mx, differ: n, maxOne: mxOne, twoPx: nTwo, pix, covered, state, hiddenWhile, openWhile, afterRestore };
                if (mode === "webgpu") {
                    // what a layer cannot carry, refused by the object's name
                    const refusals = {};
                    for (const [bn, b] of [["MultiplyBlending", THREE.MultiplyBlending], ["SubtractiveBlending", THREE.SubtractiveBlending], ["CustomBlending", THREE.CustomBlending], ["NoBlending", THREE.NoBlending]]) {
                        const sc = new THREE.Scene(), m = new THREE.MeshBasicNodeMaterial({ transparent: true, blending: b, premultipliedAlpha: true }), q = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), m); q.name = "q-" + bn; sc.add(q);
                        try { await layer.render(renderer, sc, cam); refusals[bn] = "drawn"; } catch (e) { refusals[bn] = String(e.message); }
                    }
                    const mixed = new THREE.Mesh(new THREE.BoxGeometry(), [new THREE.MeshBasicNodeMaterial({ transparent: true }), new THREE.MeshBasicNodeMaterial()]); mixed.name = "mixed";
                    try { TL.isTranslucent(mixed); refusals.mixed = "taken"; } catch (e) { refusals.mixed = String(e.message); }
                    try { TL.makeTranslucentLayer(THREE, { w: 0, h: D }); refusals.size = "made"; } catch (e) { refusals.size = String(e.message); }
                    try { TL.makeTranslucentLayer(THREE, { w: D, h: D, select: true }); refusals.select = "made"; } catch (e) { refusals.select = String(e.message); }
                    try { const small = new THREE.RenderTarget(8, 8); await layer.renderOver(renderer, scene, cam, small.texture); refusals.overSize = "drawn"; } catch (e) { refusals.overSize = String(e.message); }
                    const pts = new THREE.Points(new THREE.BufferGeometry(), new THREE.PointsNodeMaterial({ transparent: true }));
                    const line = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicNodeMaterial({ transparent: true, opacity: 0.5 }));
                    const tx = new THREE.Mesh(new THREE.PlaneGeometry(), new THREE.MeshPhysicalNodeMaterial({ transmission: 1 }));
                    o.backdrop = { lens: TL.readsBackdrop(lens), transmission: TL.readsBackdrop(tx), glass: TL.readsBackdrop(glass), box: TL.readsBackdrop(box), lensTranslucent: TL.isTranslucent(lens) };
                    o.kinds = { group: TL.isTranslucent(new THREE.Group()), opaque: TL.isTranslucent(box), glass: TL.isTranslucent(glass), points: TL.isTranslucent(pts), line: TL.isTranslucent(line), sprite: TL.isTranslucent(new THREE.Sprite(new THREE.SpriteNodeMaterial())) };
                    o.refusals = refusals;
                }
                layer.dispose(); gen.dispose(); for (const t of [withT, without, comp, park]) t.dispose();
                out[mode] = o; renderer.dispose();
            } catch (err) { out[mode] = { err: String(err && err.stack || err).slice(0, 700) }; }
        }
        return out;
    }` });
    ok("the harness ran on BOTH backends", r.ok && r.result && !r.result.webgpu.err && !r.result.webgl2.err,
       r.ok ? `webgpu ${r.result.webgpu.err || "ok"}; webgl2 ${r.result.webgl2.err || "ok"}` : (r.reason || (r.pageErrors || []).join("; ")));
    if (r.ok && r.result && !r.result.webgpu.err && !r.result.webgl2.err) {
        const f = (v) => v.toFixed(6);
        for (const mode of ["webgpu", "webgl2"]) {
            const o = r.result[mode], p = o.pix;
            ok(`*** [${mode}] the frame drawn without them with the layer composited over it IS the frame drawn with them where one thing covers -- to the bit, ${o.covered - o.twoPx} pixels -- and within a rounding where two panels overlap: ${o.differ} channel values of ${D * D * 3} differ, by at most ${o.maxDiff.toExponential(2)} ***`,
               o.maxOne === 0 && o.maxDiff <= 2 ** -23 && o.twoPx > 0, `a panel, a premultiplied panel, an additive spark and a premultiplied one, part of the panel behind a box, and a lens reading the frame behind it drawn over the frame first (renderOver); over two panels (${o.twoPx} pixels) the layer associates what the frame nests`);
            ok(`  [${mode}] its alpha is what each covers: the panel alone ${f(p.glassOnly[3])}, under each spark ${f(p.spark[3])} and ${f(p.spark2[3])} with the sparks' light ${f(p.spark[0])} and ${f(p.spark2[0])}`,
               Math.abs(p.glassOnly[3] - 0.35) < 1e-6 && p.spark[3] === 0 && p.spark2[3] === 0 && p.spark[0] > 0.3 && p.spark2[0] > 0.2,
               "an additive material covers nothing: its alpha is drawn Zero, One, and its colour's factors are three's own");
            ok(`  [${mode}] and nothing where the box hides the panel (${p.boxOverGlass.map(f).join(", ")}), where the hidden panel would be (${f(p.hidden[3])}), on the wall (${f(p.wall[3])}), or where only the lens is (${f(p.lensOnly[3])})`,
               p.boxOverGlass.every((v) => v === 0) && p.hidden.every((v) => v === 0) && p.wall.every((v) => v === 0) && p.lensOnly.every((v) => v === 0), "what is opaque is drawn first, depth only");
            const s = o.state;
            ok(`  [${mode}] render() leaves the renderer, the scene and the materials as it found them: ${JSON.stringify({ ...s, visible: undefined }).replace(/"/g, "")}`,
               s.target && s.clear.join() === "0.2,0.3,0.4,0.7" && s.auto === true && s.background && s.override && s.materials && s.visible.join() === "true,true,true,true,false,true,true,true" && s.overKept === true,
               "the render target, the clear colour and alpha, autoClear, the background, the override, each additive material's blend factors, every object's visibility");
            ok(`  [${mode}] hide() hides the translucent things and not the rest, and its restore keeps hidden what was: ${o.hiddenWhile.join()} / ${o.openWhile.join()} / ${o.afterRestore.join()}`,
               o.hiddenWhile.every((v) => v === false) && o.openWhile.every((v) => v === true) && o.afterRestore.join() === "true,true,true,true,false,true,true,true");
        }
        const g = r.result.webgpu, rf = g.refusals;
        ok(`isTranslucent takes meshes, points, lines and sprites whose materials are transparent: ${JSON.stringify(g.kinds).replace(/"/g, "")}`,
           g.kinds.group === false && g.kinds.opaque === false && g.kinds.glass && g.kinds.points && g.kinds.line && g.kinds.sprite);
        const named = (k, ...words) => typeof rf[k] === "string" && words.every((w) => rf[k].includes(w));
        ok(`what a layer cannot carry is refused by name: ${["MultiplyBlending", "SubtractiveBlending", "CustomBlending", "NoBlending"].filter((b) => named(b, "q-" + b, b)).length} of 4 blendings, a mixed object ${named("mixed", '"mixed"') ? "yes" : "no"}`,
           ["MultiplyBlending", "SubtractiveBlending", "CustomBlending", "NoBlending"].every((b) => named(b, '"q-' + b + '"', b)) && named("mixed", '"mixed"', "1 translucent material(s) of 2"),
           rf.MultiplyBlending);
        ok("and a layer of no size, or chosen by what is not a function, is refused", named("size", "whole numbers") && named("select", "function"));
        const bk = g.backdrop;
        ok(`v4765: readsBackdrop takes a backdropNode and transmission, and not a panel or a box -- ${JSON.stringify(bk).replace(/"/g, "")}; a lens is never the layer's`,
           bk.lens && bk.transmission && !bk.glass && !bk.box && bk.lensTranslucent === false);
        ok("  ...and renderOver refuses a frame not the layer's size", named("overSize", "renderOver's frame must be a " + D + " x " + D), rf.overSize);
    }
}

// v4765: the lens (a backdropNode) and renderOver's sabotages are in fx/fsr/fsrFrameGenBackdrop-selfcheck.mjs's log, with what each reads here.
// ---- v4760 SABOTAGE LOG ----------------------------------------------------------------------------------------
// Against render/translucentLayer.mjs, here and in fx/fsr/fsrFrameGenTranslucent-selfcheck.mjs: L1 no depth pass -> 4, 1 (the
// panel over the box, 0.35 of it); L2 an additive material drawn as three blends it -> 4, 1 (the layer's alpha under the sparks
// 1.0 and 0.6, and their pixels in a generated frame at 7.92 dB); L3 a premultiplied additive's colour factor SrcAlpha -> 2, 0;
// L4 its alpha's source factor One -> 4, 1; L5 the clear colour, L6 the materials' blend factors, L11 the background, L13 the
// render target not put back -> 2, 0 each; L12 autoClear not put back -> 2, 3; L7 the background drawn into the layer -> 6, 2;
// L16 the layer cleared opaque -> 6, 2; L17 the depth pass's override left on for the translucent things -> 4, 2; L8 restore
// showing everything -> 8, 0; L15 hide hiding nothing -> 4, 4; L9 a mixed object taken, L10 any blending taken, L14 sprites not
// renderable -> 1, 0 each. Seventeen, none green.
console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nALL GREEN");
console.log("unchecked here: an OPAQUE sprite or points in the depth pass -- they are drawn with a mesh material there, and a sprite's " +
    "billboarding is its own material's; blending that scales the frame (Multiply), which one alpha cannot carry; and the order of " +
    "two translucent things against each other, which is three's in both draws.");
process.exitCode = fails ? 1 : 0;
