// WebGLEngine/render/subModels3d-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node render/subModels3d-selfcheck.mjs      (~3 s with a browser; sections 1-3 alone ~0.3 s)
//
// THE THREE.JS HALF OF A DOWNLOADED SUBMARINE MODEL (phase 2 of docs/SUB-GLB-MODEL-SWAP.md), HELD WITH THE REAL three.js:
//   1  APPLY      a template (a long hull and a sail, built here) on a boat built by render/subAquarium3d.mjs buildSub + attachCues: the five procedural parts hidden but still there, the model 16 long and centred, rigid (poseFins turns the hidden fins and
//                 moves nothing visible), every material cloned per boat and depth-tinted, the colours moved toward the boat's hue (and not with keepColours), a hue marker, the cues moved to the model's top and keel
//   2  REVERT     everything put back: parts visible, cues where they were, the cloned materials and the marker disposed; a refused model (too many triangles, nothing to measure) leaves the boat untouched
//   3  ORIENTATION a Z-up template with up 'z' fits with no warning; a yaw that turns the long side across the nose warns
//   4  THE HOST   sync/settled/release with an injected loader and a store: nothing assigned = procedural and no load; one load per url for many boats; a failed load keeps the procedural hull and retries on the next assignment; a result that arrives after the
//                 assignment changed is dropped; changing the hull or clearing the assignment swaps back
//   5  THE VIEW   (needs a browser with WebGL; SKIPPED, and said, without one) in headless Chromium through the engine's own origin: a synthetic .glb and a DRACO-COMPRESSED .glb (written with tools/export/dracoEncode.mjs) are loaded by the default loader
//                 into createView3d's boats; the frame differs from the same frame with no model; a bad url leaves the procedural hull; the model is 16 long on screen scale
//   6  THE SOURCE no DOM, no clock, no randomness; the loader goes through gpu/gltfDraco.js
//
// NOT GRADED, said plainly: how a real Sketchfab submarine looks (textures, transparency, KHR extensions, origin far from the hull); that needs a file from Keith. The synthetic model proves the plumbing, not the taste.
// SABOTAGED -- 52 mutants of render/subModels3d.mjs and of render/subAquarium3d.mjs's four lines (constants; the triangle count; the material clone, the keep-colours switch, the colour spaces, the depth tint, the array case; the re-apply, the refusal, the matrix and its offset, the marker; hiding the parts; moving each of the three cues; the warnings; the attribution; every step of the revert; the loader path and the Draco route; the host's store check, cache key, early return, revert on change, failure eviction, stale drop, failed statuses, empty scene, release, settled; the view's sync, release, setModels and getModels), each in place and restored, every one red BY NAME, identity 0. FIRST PASS: 9 read 0 red or crashed -- a redundant world-matrix update was CUT; ROWS ADDED: a shifted template (centring), the Z-up sail above the hull, non-indexed and multi-material meshes, the keepColours option, a SAME-url retry after a failure, an out-of-order stale load, a refused model and an empty file through the host, a boat leaving the tank, getModels.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as THREE from "../vendor/three/three.module.js";
import * as V3 from "./subAquarium3d.mjs";
import * as BC from "./subBallastCues.mjs";
import * as C from "./subModelsCore.mjs";
import * as M3 from "./subModels3d.mjs";
import { runInEngineOrigin, webgpuSkipReason } from "../tools/ship/webgpuHarness.mjs";
import { writeDracoGlb } from "../tools/export/dracoEncode.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let fails = 0;
const ok = (name, cond, detail) => { try { if (typeof cond === "function") cond = cond(); } catch (e) { cond = false; detail = "threw: " + e.message; } console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? "   " + detail : ""}`); if (!cond) fails++; };
const sec = (t) => console.log("\n" + t);
const J = JSON.stringify, near = (a, b, e = 1e-6) => Math.abs(a - b) < e, nearV = (a, b, e = 1e-6) => a.length === b.length && a.every((x, i) => near(x, b[i], e));
const throws = (f) => { try { f(); return false; } catch (e) { return true; } };
const mockStorage = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); } }; };
const lic = { licence: "CC-BY-4.0", name: "Test sub", author: "Gate" };

console.log("subModels3d-selfcheck -- a downloaded submarine on the procedural boat\n");

/** A template scene: a long hull (8 x 1.2 x 1.2, red) and a sail (1.6 x 0.8 x 0.5, grey) 1.0 above it. `zUp` builds the same boat with its height along +Z. */
const templateScene = ({ zUp = false } = {}) => {
    const scene = new THREE.Group(), hull = new THREE.Mesh(new THREE.BoxGeometry(8, 1.2, 1.2), new THREE.MeshStandardMaterial({ color: 0xd04020 })), sail = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.8, 0.5), new THREE.MeshStandardMaterial({ color: 0x808890 }));
    sail.position.set(0.5, 1.0, 0); scene.add(hull); scene.add(sail);
    if (zUp) { scene.rotation.x = Math.PI / 2; scene.updateMatrixWorld(true); scene.traverse((n) => { if (n.isMesh) { n.geometry = n.geometry.clone(); n.geometry.applyMatrix4(n.matrixWorld); n.position.set(0, 0, 0); n.rotation.set(0, 0, 0); n.updateMatrix(); } }); scene.rotation.set(0, 0, 0); scene.position.set(0, 0, 0); scene.updateMatrixWorld(true); }
    return scene;
};
const boat = (hue = 200) => { const geo = {}, mat = new THREE.MeshStandardMaterial({ color: 0x4488cc }), g = V3.buildSub(THREE, mat, geo); BC.attachCues(THREE, g, geo, V3.HULL_LENGTH); g.userData.hue = hue; return g; };
const entry = { url: "/GPU_Assets/subs/test.glb", yaw: 0, up: "y", ...lic };
const boxOf = (o) => new THREE.Box3().setFromObject(o);
const matsOf = (root) => { const a = []; root.traverse((n) => { if (n.isMesh) (Array.isArray(n.material) ? n.material : [n.material]).forEach((m) => a.push(m)); }); return a; };

sec("1. APPLY");
{
    const tpl = templateScene(), tplMats = matsOf(tpl), tplColour = tplMats[0].color.clone(), g = boat(), restPlaneRot = g.userData.parts.planes.rotation.z;
    const r = M3.applyModel(THREE, g, tpl, entry, { hue: 120 }), P = g.userData.parts, m = g.userData.model, box = boxOf(m.wrap);
    ok("!! a template 8 long with a sail is fitted: scale 2 (not the sail's height), 24 triangles, no warnings, an attribution line, and the model stored on the boat", r.fit.scale === 2 && r.fit.axis === "x" && r.triangles === 24 && r.warnings.length === 0 && /Test sub by Gate -- licence: CC-BY-4.0/.test(r.attribution) && !!m && m.entry.url === entry.url);
    ok("!! the five procedural parts are hidden but still in place (userData.parts intact), the model and the hue marker are children of the boat", M3.PROCEDURAL_PARTS.every((k) => P[k] && P[k].visible === false) && g.children.includes(m.wrap) && g.children.includes(m.marker) && P.hull.parent === g);
    ok("!! the model is 16 long (x -8..8), centred (y -2..2, z -1.2..1.2) after the fit and the centring", nearV([box.min.x, box.max.x, box.min.y, box.max.y, box.min.z, box.max.z], [-8, 8, -2, 2, -1.2, 1.2]));
    V3.poseFins(g, { pitch: 1, yaw: -1 });
    const box2 = boxOf(m.wrap);
    ok("!! the model is RIGID: poseFins still turns the hidden planes and rudder (it does not throw) and the model's bounds do not move", P.planes.rotation.z !== restPlaneRot && P.rudder.rotation.y !== 0 && nearV([box2.min.x, box2.max.x, box2.min.y, box2.max.y], [box.min.x, box.max.x, box.min.y, box.max.y]));
    const mine = matsOf(m.wrap);
    ok("!! every material on the boat is a CLONE (none is the template's), the template's own colour is unchanged, and each carries the depth tint (userData.sea with the tank's density and water colour, an onBeforeCompile patch)", mine.length === 2 && mine.every((x) => !tplMats.includes(x)) && tplMats[0].color.equals(tplColour) && mine.every((x) => x.userData.sea && near(x.userData.sea.uSeaDensity.value, 0.045) && typeof x.onBeforeCompile === "function") && M3.TINT_DENSITY === 0.045 && M3.WATER_COLOUR === 0x0a3b46);
    const was = tplMats[0].color.getRGB({ r: 0, g: 0, b: 0 }, THREE.SRGBColorSpace), got = mine[0].color.getRGB({ r: 0, g: 0, b: 0 }, THREE.SRGBColorSpace), want = C.tintRgb([was.r, was.g, was.b], 120, 0.3);
    ok("!! the model's colour is moved 30 percent toward the boat's hue, in sRGB, exactly as subModelsCore.tintRgb says (red hull, hue 120)", nearV([got.r, got.g, got.b], want, 1e-4) && want[1] > was.g);
    const g2 = boat(), r2 = M3.applyModel(THREE, g2, tpl, entry, { hue: 120, keepColours: true }), kept = g2.userData.model.wrap, kc = matsOf(kept)[0].color.getRGB({ r: 0, g: 0, b: 0 }, THREE.SRGBColorSpace);
    ok("!! with keepColours the model's own colours are exact (and the marker is still there); two boats of one template share no material", nearV([kc.r, kc.g, kc.b], [was.r, was.g, was.b], 1e-6) && !!g2.userData.model.marker && matsOf(kept).every((x) => !mine.includes(x)) && r2.fit.scale === 2);
    const mk = m.marker.material.color.getRGB({ r: 0, g: 0, b: 0 }, THREE.SRGBColorSpace), hr = C.hueRgb(120);
    ok("!! the hue marker is the boat's hue (subModelsCore.hueRgb) and stands above the model's top", nearV([mk.r, mk.g, mk.b], hr, 1e-4) && m.marker.position.y > m.cue.top);
    const C0 = g.userData.cues, cp = m.cue;
    ok("!! the gauge, its fill and the drop-weight slab are where subModelsCore.cuePlacement puts them for this model (frame, fill, slab y, x -1.6), not where the ellipsoid had them", near(C0.frame.position.y, cp.frameY) && near(C0.fill.position.y, cp.fillY) && near(C0.slab.position.y, cp.slabY) && near(C0.frame.position.x, -1.6) && cp.frameY !== 1.55 * 16 * 0.28);
}

{
    const shifted = templateScene(); shifted.position.set(5, 3, 2); const gs = boat(); M3.applyModel(THREE, gs, shifted, entry, {}); const bs = boxOf(gs.userData.model.wrap);
    ok("!! a template whose origin is far from its middle (shifted by 5, 3, 2) is CENTRED on the boat in all three axes: x -8..8, y -2..2, z -1.2..1.2", nearV([bs.min.x, bs.max.x, bs.min.y, bs.max.y, bs.min.z, bs.max.z], [-8, 8, -2, 2, -1.2, 1.2]));
}

sec("2. REVERT AND REFUSE");
{
    const tpl = templateScene(), g = boat(), C0 = g.userData.cues, before = { f: C0.frame.position.clone(), l: C0.fill.position.clone(), s: C0.slab.position.clone() }, kids = g.children.length;
    M3.applyModel(THREE, g, tpl, entry, { hue: 10 });
    const mats = g.userData.model.mats.slice(), marker = g.userData.model.marker; let disposed = 0; for (const x of [...mats, marker.material]) { const d = x.dispose.bind(x); x.dispose = () => { disposed++; d(); }; } let gd = 0; { const d = marker.geometry.dispose.bind(marker.geometry); marker.geometry.dispose = () => { gd++; d(); }; }
    const was = M3.revertModel(g);
    ok("!! revert puts the boat back: the five parts visible, the cues exactly where they were, the model and the marker gone (the child count is the original), userData.model deleted, and answers true", was === true && M3.PROCEDURAL_PARTS.every((k) => g.userData.parts[k].visible === true) && C0.frame.position.equals(before.f) && C0.fill.position.equals(before.l) && C0.slab.position.equals(before.s) && g.children.length === kids && g.userData.model === undefined);
    ok("!! revert disposes what the model made: both cloned materials, the marker's material and its geometry; the template's materials and geometry are NOT disposed; a second revert does nothing and answers false", disposed === 3 && gd === 1 && M3.revertModel(g) === false);
    const heavy = new THREE.Group(), geo = new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(9), 3)); geo.setIndex(new THREE.BufferAttribute(new Uint32Array(3 * 500001), 1)); heavy.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial()));
    const g3 = boat(), v = g3.children.length;
    ok("!! a model over 500,000 triangles is refused with the reason in words, and the boat is untouched (no model, parts visible, no new child)", (() => { let msg = ""; try { M3.applyModel(THREE, g3, heavy, entry, {}); } catch (e) { msg = e.message; } return /500001 triangles is over the 500000/.test(msg) && g3.userData.model === undefined && g3.children.length === v && M3.PROCEDURAL_PARTS.every((k) => g3.userData.parts[k].visible); })());
    const g4 = boat(), lineScene = new THREE.Group(); lineScene.add(new THREE.Object3D());
    ok("!! a scene with nothing to measure, and one with bounds that are not finite, are refused and leave the boat untouched", throws(() => M3.applyModel(THREE, g4, lineScene, entry, {})) && g4.userData.model === undefined && M3.PROCEDURAL_PARTS.every((k) => g4.userData.parts[k].visible) && (() => { const bad = new THREE.Group(), gg = new THREE.BufferGeometry(); gg.setAttribute("position", new THREE.BufferAttribute(new Float32Array([NaN, 0, 0, 1, 0, 0, 0, 1, 0]), 3)); bad.add(new THREE.Mesh(gg, new THREE.MeshBasicMaterial())); return throws(() => M3.applyModel(THREE, boat(), bad, entry, {})); })());
    const g5 = boat(); M3.applyModel(THREE, g5, tpl, entry, { hue: 1 }); const first = g5.userData.model.wrap; M3.applyModel(THREE, g5, tpl, { ...entry, yaw: 180 }, { hue: 1 });
    ok("!! applying a second model to the same boat reverts the first (one wrap, the old one gone)", g5.children.filter((c) => c.name === "subModel").length === 1 && !g5.children.includes(first));
}

sec("3. ORIENTATION");
{
    const zt = templateScene({ zUp: true }), g = boat(), r = M3.applyModel(THREE, g, zt, { ...entry, up: "z" }, {}), b = boxOf(g.userData.model.wrap);
    ok("!! a Z-up template declared up 'z' is turned upright: 16 long along x, 4 tall (y -2..2), 2.4 wide, no warnings, and the sail is ABOVE the hull (not below: the turn is the right way round)", r.warnings.length === 0 && near(b.max.x - b.min.x, 16) && near(b.min.y, -2) && near(b.max.y, 2) && near(b.max.z - b.min.z, 2.4) && (() => { const ms = []; g.userData.model.wrap.traverse((n) => { if (n.isMesh) ms.push(boxOf(n)); }); const sail = ms.find((x) => x.max.y > 1.9), hull = ms.find((x) => x.max.y < 1.9); return !!sail && !!hull && sail.getCenter(new THREE.Vector3()).y > hull.getCenter(new THREE.Vector3()).y; })());
    const g2 = boat(), r2 = M3.applyModel(THREE, g2, templateScene(), { ...entry, yaw: 90 }, {}), b2 = boxOf(g2.userData.model.wrap);
    ok("!! a yaw of 90 on a model whose nose is +X turns its long side across the nose axis: it still fits 16 long (now along z) and WARNS to turn it 90 or 270 degrees", r2.fit.axis === "z" && r2.warnings.some((w) => /90 or 270/.test(w)) && near(b2.max.z - b2.min.z, 16));
    const g3 = boat(), many = new THREE.Group(), geo = new THREE.BoxGeometry(8, 1.2, 1.2); geo.setIndex(new THREE.BufferAttribute(new Uint32Array(3 * 200000), 1)); many.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial()));
    ok("!! a model of 200,000 triangles is accepted with a WARNING in words (heavy for ten boats)", M3.applyModel(THREE, g3, many, entry, {}).warnings.some((w) => /heavy/.test(w)) && g3.userData.model.triangles === 200000);
}

{
    const ni = new THREE.Group(), geo = new THREE.BoxGeometry(8, 1.2, 1.2).toNonIndexed(); ni.add(new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0x336699 })));
    const gi = boat(), ri = M3.applyModel(THREE, gi, ni, entry, {});
    ok("!! a model with no index (36 positions, 12 triangles) is counted from its positions and fitted the same", ri.triangles === 12 && ri.fit.scale === 2 && M3.sceneInfo(THREE, ni).triangles === 12);
    ok("!! a mesh with an ARRAY of materials gets an array of clones, each depth-tinted and none the template's", (() => {
        const mm = new THREE.Group(), bg = new THREE.BoxGeometry(8, 1.2, 1.2), ma = new THREE.MeshStandardMaterial({ color: 0xaa3333 }), mb = new THREE.MeshStandardMaterial({ color: 0x33aa33 }); bg.clearGroups(); bg.addGroup(0, 18, 0); bg.addGroup(18, 18, 1); mm.add(new THREE.Mesh(bg, [ma, mb]));
        const gm = boat(); M3.applyModel(THREE, gm, mm, entry, { hue: 0 }); const cloned = matsOf(gm.userData.model.wrap);
        return cloned.length === 2 && !cloned.includes(ma) && !cloned.includes(mb) && cloned.every((x) => x.userData.sea) && gm.userData.model.mats.length === 2;
    })());
}

sec("4. THE HOST");
{
    const store = C.makeSubModelStore(mockStorage()); let loads = [], gate = null;
    const failing = new Set(); const loader = (url) => { loads.push(url); return url.includes("slow") ? gate.promise : failing.has(url) ? Promise.reject(new Error("no such file")) : Promise.resolve(templateScene()); };
    const host = M3.createSubModelHost(THREE, { store, load: loader }), row = (hue = 40, hull = "nominal") => ({ hull, hue });
    const a = boat(), b = boat();
    ok("!! with nothing assigned a boat stays procedural, the loader is never called, and the state says so", host.sync(a, row()).status === "procedural" && loads.length === 0 && a.userData.model === undefined);
    store.set("nominal", { ...entry, url: "/m/one.glb" });
    const s1 = host.sync(a, row()), s2 = host.sync(b, row(300));
    ok("!! assigning the tank's hull starts a load (status loading) for each boat but ONE load for the url; settled() waits; both boats then wear it and the state carries the attribution, the triangle count and no warnings", s1.status === "loading" && s2.status === "loading");
    await host.settled();
    ok("!! after settled() both boats are models, with the attribution and 24 triangles, each with its OWN cloned materials and its OWN hue marker colour (hue 40 and 300)", a.userData.modelState.status === "model" && b.userData.modelState.status === "model" && a.userData.modelState.triangles === 24 && /Test sub/.test(a.userData.modelState.attribution) && matsOf(a.userData.model.wrap).every((x) => !matsOf(b.userData.model.wrap).includes(x)) && !a.userData.model.marker.material.color.equals(b.userData.model.marker.material.color) && host.cached() === 1);
    const sameKey = host.sync(a, row());
    ok("!! a sync with nothing changed does nothing (the same state object, no new load, no re-apply: the same wrap)", sameKey === a.userData.modelState && loads.length === 1 && host.sync(a, row()) === sameKey);
    const wrapBefore = a.userData.model && a.userData.model.wrap; host.sync(a, row(41)); await host.settled();
    ok("!! a changed hue re-applies the model on that boat (a new wrap) without a new load (the url is cached), and the other boat is untouched", !!a.userData.model && a.userData.model.wrap !== wrapBefore && loads.length === 1 && b.userData.model !== undefined);
    host.sync(a, row(41, "heavy")); await host.settled();
    ok("!! a hull with no assignment of its own and no default reads procedural: the boat's model is taken off and its parts are visible again", a.userData.modelState.status === "procedural" && a.userData.model === undefined && M3.PROCEDURAL_PARTS.every((k) => a.userData.parts[k].visible));
    store.set("default", { ...entry, url: "/m/two.glb" }); host.sync(a, row(41, "heavy")); await host.settled();
    ok("!! the default entry is used for a hull without its own (a load of the second url), and the first boat still wears its own hull's model", a.userData.modelState.status === "model" && loads.includes("/m/two.glb") && loads.length === 2 && b.userData.model.entry.url === "/m/one.glb");
    { const heavy = new THREE.Group(), hg = new THREE.BufferGeometry(); hg.setAttribute("position", new THREE.BufferAttribute(new Float32Array(9), 3)); hg.setIndex(new THREE.BufferAttribute(new Uint32Array(3 * 500001), 1)); heavy.add(new THREE.Mesh(hg, new THREE.MeshBasicMaterial()));
      const s2 = C.makeSubModelStore(mockStorage()); s2.set("nominal", { ...entry, url: "/m/heavy.glb" }); s2.set("heavy", { ...entry, url: "/m/none.glb" });
      const h2 = M3.createSubModelHost(THREE, { store: s2, load: (u) => (u.includes("none") ? Promise.resolve(null) : Promise.resolve(heavy)) }), x1 = boat(), x2 = boat();
      h2.sync(x1, row(1)); h2.sync(x2, row(1, "heavy")); await h2.settled();
      ok("!! a model the view refuses (500,001 triangles) leaves the boat procedural with status failed and the reason in words; a file with no scene does the same with 'holds no scene'", x1.userData.modelState.status === "failed" && /500001 triangles/.test(x1.userData.modelState.reason) && x1.userData.model === undefined && M3.PROCEDURAL_PARTS.every((k) => x1.userData.parts[k].visible) && x2.userData.modelState.status === "failed" && /holds no scene/.test(x2.userData.modelState.reason)); }
    host.opts.keepColours = true; host.sync(b, row(300)); await host.settled(); const kcol = matsOf(b.userData.model.wrap)[0].color.getRGB({ r: 0, g: 0, b: 0 }, THREE.SRGBColorSpace); host.opts.keepColours = false; host.sync(b, row(300)); await host.settled(); const tcol = matsOf(b.userData.model.wrap)[0].color.getRGB({ r: 0, g: 0, b: 0 }, THREE.SRGBColorSpace);
    ok("!! the host's options are read on every sync: switching keepColours on re-applies the model with its own exact colours, and off again tints it (a different colour)", near(kcol.r, 0.8153, 1e-3) && !near(tcol.r, kcol.r, 1e-3) || kcol.r !== tcol.r);
    failing.add("/m/bad.glb"); store.set("nominal", { ...entry, url: "/m/bad.glb" }); host.sync(b, row(300)); await host.settled();
    ok("!! a failed load leaves the boat procedural with the reason in the state (status failed, parts visible, no model), and does not stick: assigning a good url then loads it", b.userData.modelState.status === "failed" && /no such file/.test(b.userData.modelState.reason) && b.userData.model === undefined && M3.PROCEDURAL_PARTS.every((k) => b.userData.parts[k].visible) );
    failing.delete("/m/bad.glb"); store.set("nominal", { ...entry, url: "/m/bad.glb", yaw: 90 }); host.sync(b, row(300)); await host.settled();
    ok("!! a failed url is not cached as failed: once the file is good the SAME url on the same hull loads on the next assignment", b.userData.modelState.status === "model" && b.userData.model.entry.url === "/m/bad.glb");
    store.set("nominal", { ...entry, url: "/m/three.glb" }); host.sync(b, row(300)); await host.settled();
    ok("!! after the failure, a new url on the same hull loads and the boat wears it (the failed url is not cached)", b.userData.modelState.status === "model" && b.userData.model.entry.url === "/m/three.glb");
    gate = (() => { let res; const promise = new Promise((r) => (res = r)); return { promise, res }; })();
    store.set("nominal", { ...entry, url: "/m/slow.glb" }); const c = boat(); host.sync(c, row(10)); store.set("nominal", { ...entry, url: "/m/other.glb" }); host.sync(c, row(10));
    for (let i = 0; i < 20 && !(c.userData.model && c.userData.model.entry.url === "/m/other.glb"); i++) await Promise.resolve();
    const onOther = !!(c.userData.model && c.userData.model.entry.url === "/m/other.glb"); gate.res(templateScene()); await host.settled();
    ok("!! a load that finishes after the assignment changed is DROPPED: the boat is on the newer assignment (other.glb) while the slow one is still loading, and when the slow one finally arrives the boat stays on other.glb", onOther && c.userData.model && c.userData.model.entry.url === "/m/other.glb" && c.userData.modelState.status === "model");
    const mats = a.userData.model ? a.userData.model.mats.slice() : []; let n = 0; mats.forEach((x) => { const d = x.dispose.bind(x); x.dispose = () => { n++; d(); }; });
    ok("!! release() takes the model off a boat that leaves the tank (its cloned materials are disposed) and answers true; on a boat with none it answers false; a host without a store is refused", host.release(a) === true && n === mats.length && n > 0 && host.release(boat()) === false && throws(() => M3.createSubModelHost(THREE, {})) && throws(() => M3.createSubModelHost(THREE, { store: {} })));
}

sec("5. THE VIEW (a browser, through the engine's own origin)");
{
    const skip = webgpuSkipReason();
    if (skip) console.log("  SKIP  " + skip + " -- the view rows are NOT graded on this machine");
    else {
        const glbOf = (geo) => {   // a minimal .glb of one mesh from a BoxGeometry's arrays (positions, normals, indices)
            const pos = geo.attributes.position.array, nor = geo.attributes.normal.array, idx = Uint16Array.from(geo.index.array);
            const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity]; for (let i = 0; i < pos.length; i += 3) for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], pos[i + k]); mx[k] = Math.max(mx[k], pos[i + k]); }
            const bin = Buffer.concat([Buffer.from(pos.buffer, pos.byteOffset, pos.byteLength), Buffer.from(nor.buffer, nor.byteOffset, nor.byteLength), Buffer.from(idx.buffer, idx.byteOffset, idx.byteLength)]);
            const pad4 = (b, fill) => (b.length % 4 ? Buffer.concat([b, Buffer.alloc(4 - (b.length % 4), fill)]) : b);
            const json = { asset: { version: "2.0" }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0 }], meshes: [{ primitives: [{ attributes: { POSITION: 0, NORMAL: 1 }, indices: 2, material: 0 }] }], materials: [{ pbrMetallicRoughness: { baseColorFactor: [0.8, 0.25, 0.2, 1], metallicFactor: 0.1, roughnessFactor: 0.7 } }],
                accessors: [{ bufferView: 0, componentType: 5126, count: pos.length / 3, type: "VEC3", min: mn, max: mx }, { bufferView: 1, componentType: 5126, count: nor.length / 3, type: "VEC3" }, { bufferView: 2, componentType: 5123, count: idx.length, type: "SCALAR" }],
                bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: pos.byteLength }, { buffer: 0, byteOffset: pos.byteLength, byteLength: nor.byteLength }, { buffer: 0, byteOffset: pos.byteLength + nor.byteLength, byteLength: idx.byteLength }], buffers: [{ byteLength: bin.length }] };
            const jb = pad4(Buffer.from(JSON.stringify(json)), 0x20), bb = pad4(bin, 0), head = Buffer.alloc(12), jh = Buffer.alloc(8), bh = Buffer.alloc(8);
            head.writeUInt32LE(0x46546c67, 0); head.writeUInt32LE(2, 4); head.writeUInt32LE(12 + 8 + jb.length + 8 + bb.length, 8); jh.writeUInt32LE(jb.length, 0); jh.writeUInt32LE(0x4e4f534a, 4); bh.writeUInt32LE(bb.length, 0); bh.writeUInt32LE(0x004e4942, 4);
            return new Uint8Array(Buffer.concat([head, jh, jb, bh, bb]));
        };
        const box = new THREE.BoxGeometry(8, 1.2, 1.2), plain = glbOf(box);
        const dr = await writeDracoGlb({ name: "hull", positions: box.attributes.position.array, indices: Uint32Array.from(box.index.array), normals: box.attributes.normal.array }, { quantization: { POSITION: 14, NORMAL: 10 } }), draco = dr.glb;
        const SCRIPT = `async ({ plain, draco }) => {
            const im = document.createElement("script"); im.type = "importmap"; im.textContent = JSON.stringify({ imports: { three: "/vendor/three/three.module.js" } }); document.head.appendChild(im);
            const THREE = await import("/vendor/three/three.module.js"), V = await import("/render/subAquarium3d.mjs"), C = await import("/render/subModelsCore.mjs"), H = await import("/render/subModels3d.mjs"), T = await import("/render/subAquariumSim.mjs");
            const urlOf = (a) => URL.createObjectURL(new Blob([new Uint8Array(a)])), store = C.makeSubModelStore({ getItem: () => null, setItem: () => {} });
            const tank = T.createTank(); tank.sync([{ id: "a", name: "A", hue: 30, pilot: "autopilot", from: "x", local: true, weights: null }, { id: "b", name: "B", hue: 200, pilot: "autopilot", from: "x", local: true, weights: null }]);
            for (let i = 0; i < 60; i++) tank.step(1 / 30);
            const cv = document.createElement("canvas"); cv.width = 320; cv.height = 200; document.body.appendChild(cv);
            const view = V.createView3d(THREE, cv, { length: 500, width: 300, depthMax: 50 }); view.resize(320, 200);
            const pixels = () => { view.render(tank.snapshot(), 1); const g = cv.getContext("webgl2") || cv.getContext("webgl"); const w = 320, h = 200, buf = new Uint8Array(w * h * 4); g.readPixels(0, 0, w, h, g.RGBA, g.UNSIGNED_BYTE, buf); let s = 0, nz = 0; for (let i = 0; i < buf.length; i += 4) { s += buf[i] + buf[i + 1] * 3 + buf[i + 2] * 7; if (buf[i] + buf[i + 1] + buf[i + 2] > 12) nz++; } return { s, nz }; };
            view.setFollow("a"); view.render(tank.snapshot(), 0);
            const none = pixels(), out = { none };
            const host = H.createSubModelHost(THREE, { store }); view.setModels(host);
            store.set("nominal", { url: urlOf(plain), yaw: 0, up: "y", licence: "CC0", name: "plain" });
            view.render(tank.snapshot(), 0.1); await host.settled(); const withPlain = pixels();
            const A = view.subs.get("a"), B = view.subs.get("b");
            out.plain = { status: A.userData.modelState.status, status2: B.userData.modelState.status, parts: Object.values(A.userData.parts).every((p) => p.visible === false), px: withPlain, attribution: A.userData.modelState.attribution, scale: A.userData.model.fit.scale, wrapScale: A.userData.model.wrap.scale.x, length: A.userData.model.fit.length };
            store.set("nominal", { url: urlOf(draco), yaw: 0, up: "y", licence: "CC0", name: "draco" });
            view.render(tank.snapshot(), 0.2); await host.settled(); const withDraco = pixels();
            out.draco = { status: A.userData.modelState.status, reason: A.userData.modelState.reason, tris: A.userData.modelState.triangles, px: withDraco, scale: A.userData.model ? A.userData.model.fit.scale : null, length: A.userData.model ? A.userData.model.fit.length : null };
            store.set("nominal", { url: "/no/such/file.glb", yaw: 0, up: "y", licence: "CC0", name: "bad" });
            view.render(tank.snapshot(), 0.3); await host.settled(); const bad = pixels();
            out.bad = { status: A.userData.modelState.status, reason: A.userData.modelState.reason.slice(0, 80), parts: Object.values(A.userData.parts).every((p) => p.visible === true), noModel: A.userData.model === undefined, px: bad };
            store.set("nominal", { url: urlOf(plain), yaw: 0, up: "y", licence: "CC0", name: "plain" }); view.render(tank.snapshot(), 0.35); await host.settled();
            const bMats = view.subs.get("b").userData.model.mats; let disposed = 0; bMats.forEach((m) => { const d = m.dispose.bind(m); m.dispose = () => { disposed++; d(); }; });
            tank.sync([{ id: "a", name: "A", hue: 30, pilot: "autopilot", from: "x", local: true, weights: null }]); view.render(tank.snapshot(), 0.37); out.left = { disposed, mats: bMats.length, still: view.subs.has("b") };
            out.hostIsSet = view.getModels() === host; const beforeOff = pixels(); view.setModels(null); view.render(tank.snapshot(), 0.4); const off = pixels();
            out.off = { px: off, before: beforeOff, host: view.getModels(), noModel: A.userData.model === undefined, parts: Object.values(A.userData.parts).every((p) => p.visible === true) };
            return out;
        }`;
        const out = await runInEngineOrigin({ engineRoot: ENG, script: SCRIPT, args: { plain: Array.from(plain), draco: Array.from(draco) } });
        const r = out.ok && out.result;
        if (!r) console.log("  FAIL  the browser run did not complete: " + (out.reason || (out.pageErrors || []).join(" | ")).slice(0, 300)), fails++;
        else {
            ok("!! a synthetic .glb loaded by the default loader (bytes, parseGlb, GLTFLoader) puts the model on every boat of the live view: both boats' states are 'model', the five procedural parts hidden, the attribution carried", r.plain.status === "model" && r.plain.status2 === "model" && r.plain.parts && /plain by unknown -- licence: CC0/.test(r.plain.attribution));
            ok("!! the model is fitted 16 long (an 8 long box: scale 2, on the boat in the live view whose pose is turned, so the scale is read, not a world-space box) and the frame is NOT the frame without it (the pixels differ, and something is drawn)", near(r.plain.scale, 2, 1e-6) && near(r.plain.wrapScale, 2, 1e-6) && near(r.plain.length, 8, 1e-6) && r.plain.px.s !== r.none.s && r.plain.px.nz > 100 && r.none.nz > 100);
            ok("!! a DRACO-COMPRESSED .glb (written by tools/export/dracoEncode.mjs) loads through the same path and fits the same (16 long within the quantisation), 12 triangles, and draws a frame that differs from the no-model one", r.draco.status === "model" && r.draco.tris === 12 && Math.abs(r.draco.scale - 2) < 0.05 && Math.abs(r.draco.length - 8) < 0.1 && r.draco.px.s !== r.none.s, r.draco.status === "model" ? "" : r.draco.reason);
            ok("!! a url that does not load leaves the boats procedural: status failed with a reason, the five parts visible again, no model, and the frame is the no-model frame again", r.bad.status === "failed" && r.bad.reason.length > 3 && r.bad.parts && r.bad.noModel && r.bad.px.s === r.none.s);
            ok("!! a boat that leaves the tank has its model's cloned materials disposed (release before the boat's own material is disposed) and leaves the view", r.left.mats === 1 && r.left.disposed === 1 && r.left.still === false);
            ok("!! setModels(null) takes the host off (getModels answers null), the boat still in the tank loses its model (procedural parts visible) and the frame changes", r.hostIsSet === true && r.off.host === null && r.off.noModel && r.off.parts && r.off.px.s !== r.off.before.s);
        }
        const errs = (out.pageErrors || []).filter((e) => !/status of 404/.test(e));   // the deliberately bad url answers 404 once
        if (errs.length) { console.log("  FAIL  page errors: " + errs.join(" | ").slice(0, 300)); fails++; }
        if (process.env.SUBMODELS_DEBUG && r) console.log(JSON.stringify(r));
    }
}

sec("6. THE SOURCE");
{
    const src = fs.readFileSync(path.join(ENG, "render", "subModels3d.mjs"), "utf8"), code = src.split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n"), view = fs.readFileSync(path.join(ENG, "render", "subAquarium3d.mjs"), "utf8");
    ok("!! subModels3d.mjs has no DOM, no clock and no randomness in its code, takes THREE as an argument (no import of three), and loads through gpu/gltfDraco.js and the vendored GLTFLoader", !/\b(document|window|navigator)\b/.test(code) && !/Math\.random|Date\.now|performance\.now/.test(code) && !/^import .*three/m.test(code) && /import\("\/gpu\/gltfDraco\.js"\)/.test(code) && /import\("\/vendor\/three\/jsm\/loaders\/GLTFLoader\.js"\)/.test(code) && /loadGlb\(url, GLTFLoader\)/.test(code));
    ok("!! the view takes the host as an option and by setModels, syncs every boat every frame, and releases a boat that leaves the tank BEFORE it disposes the boat's material", /models = null \} = \{\}\)/.test(view) && /if \(modelHost\) modelHost\.sync\(m, s\);/.test(view) && /if \(modelHost\) modelHost\.release\(m\); scene\.remove\(m\); m\.userData\.mat\.dispose\(\);/.test(view) && /setModels\(host\)/.test(view) && /getModels: \(\) =>/.test(view));
    ok("!! the default loader is a function, the default tint is 0.3, and the module names its parts list", typeof M3.defaultLoad === "function" && M3.DEFAULT_TINT === 0.3 && M3.PROCEDURAL_PARTS.length === 5);
    ok("!! reportLines names the design (child of the procedural boat, rigid)", /child of the procedural boat/.test(M3.reportLines()[0]) && /rigid/.test(M3.reportLines()[0]));
}

console.log(fails ? `\n${fails} FAIL` : "\nall checks pass");
process.exit(fails ? 1 : 0);
