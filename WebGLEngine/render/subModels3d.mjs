// WebGLEngine/render/subModels3d.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// THE THREE.JS HALF OF "A SUBMARINE WEARS A DOWNLOADED .glb" (phase 2 of docs/SUB-GLB-MODEL-SWAP.md). render/subModelsCore.mjs does every number; this file loads the model, fits it, and puts it on a boat.
//
// *** THE PROCEDURAL HULL STAYS, HIDDEN, AND THAT IS THE DESIGN. *** render/subAquarium3d.mjs's `buildSub` group keeps its contract untouched: `userData.parts` (hull, tower, scope, planes, rudder), `poseFins`, the ballast cues,
// the depth tint, the follow camera. A model is a child of that group (`applyModel`): the five procedural parts are hidden (not removed, so `poseFins` still has something to turn and never throws, and `revertModel` is a
// set of `visible = true`), the gauge and the drop-weight slab are moved to where the model's top and keel are (cuePlacement), and a small hue marker stands on the boat. The model is RIGID: its rudder and planes do not move
// (the sub list already prints the pilot's command); that is said on the page, not hidden. While a model loads, or if it fails, the procedural hull is what is drawn.
//
// Per boat: the template scene is cloned (geometry and textures shared), every material is CLONED (so a boat's tint and the depth tint's uniforms are its own), the model's colours are moved a fraction toward the boat's hue
// (tintRgb, in sRGB, 0.3 unless `keepColours`), and applyDepthTint patches each cloned material so the model dims toward the water colour by depth like the procedural hull does.
//
// `createSubModelHost` is the orchestration: `sync(group, row)` is called once per boat per frame (a string compare when nothing changed) and starts, swaps or reverts the model when the store's resolution for the row's hull,
// or the boat's hue, changes; a load is cached per url, a failed load does not stick (the next assignment retries), and a result that arrives after the assignment changed is dropped.
// The default loader reads the bytes and parses them through gpu/gltfDraco.js, so a Draco-compressed .glb loads (the decoder is fetched only for such a file).
"use strict";
import { orientationOf, orientedBounds, fitScale, centering, cuePlacement, triangleBudget, attributionLine, tintRgb, hueRgb, HULL_LENGTH, HULL_RADIUS_FRACTION } from "./subModelsCore.mjs";
import { applyDepthTint } from "../ui/seaDepthTint.mjs";

export const WATER_COLOUR = 0x0a3b46, TINT_DENSITY = 0.045;   // render/subAquarium3d.mjs's (not imported from it: that file imports this one)
export const PROCEDURAL_PARTS = Object.freeze(["hull", "tower", "scope", "planes", "rudder"]);
export const DEFAULT_TINT = 0.3;

/** Triangle count and the bounds ({ min, max }) of a loaded scene, in the model's own frame. */
export function sceneInfo(THREE, scene) {
    let triangles = 0, meshes = 0;
    scene.traverse((n) => { if (n.isMesh && n.geometry) { meshes++; const g = n.geometry; triangles += g.index ? Math.floor(g.index.count / 3) : g.attributes.position ? Math.floor(g.attributes.position.count / 3) : 0; } });
    const box = new THREE.Box3().setFromObject(scene);
    return { triangles, meshes, bounds: { min: [box.min.x, box.min.y, box.min.z], max: [box.max.x, box.max.y, box.max.z] } };
}

const cloneMaterials = (THREE, root, mats, hueDeg, keep, amount) => {
    const tint = (m) => {
        const c = m.clone();
        if (!keep && c.color && c.color.isColor) { const cur = c.color.getRGB({ r: 0, g: 0, b: 0 }, THREE.SRGBColorSpace), t = tintRgb([cur.r, cur.g, cur.b], hueDeg, amount); c.color.setRGB(t[0], t[1], t[2], THREE.SRGBColorSpace); }
        applyDepthTint(THREE, c, { level: 0, density: TINT_DENSITY, color: WATER_COLOUR });
        mats.push(c); return c;
    };
    root.traverse((n) => { if (n.isMesh && n.material) n.material = Array.isArray(n.material) ? n.material.map(tint) : tint(n.material); });
};

/**
 * Put a model on a built boat (render/subAquarium3d.mjs buildSub + attachCues). `scene` is the loaded template (it is cloned, not changed); `entry` is a store entry ({ yaw, up, ... }).
 * Throws, and leaves the boat as it was, when the model is refused: too many triangles, no horizontal extent, bounds that are not finite. Answers { fit, triangles, warnings, attribution }.
 */
export function applyModel(THREE, group, scene, entry, { hue = 0, keepColours = false, tint = DEFAULT_TINT, length = HULL_LENGTH } = {}) {
    if (group.userData.model) revertModel(group);
    const info = sceneInfo(THREE, scene), budget = triangleBudget(info.triangles);
    if (budget.level === "refuse") throw new Error(budget.reason);
    const M = orientationOf({ yaw: entry.yaw, up: entry.up }), fit = fitScale(info.bounds, M, length), off = centering(info.bounds, M, fit.scale), cue = cuePlacement(info.bounds, M, fit.scale, length);
    const s = fit.scale, wrap = new THREE.Group(); wrap.name = "subModel";
    new THREE.Matrix4().set(M[0] * s, M[1] * s, M[2] * s, off[0], M[3] * s, M[4] * s, M[5] * s, off[1], M[6] * s, M[7] * s, M[8] * s, off[2], 0, 0, 0, 1).decompose(wrap.position, wrap.quaternion, wrap.scale);
    const root = scene.clone(true), mats = []; cloneMaterials(THREE, root, mats, hue, keepColours, tint); wrap.add(root);
    const R = length * HULL_RADIUS_FRACTION, markerMat = new THREE.MeshBasicMaterial({ color: 0xffffff }), c = hueRgb(hue); markerMat.color.setRGB(c[0], c[1], c[2], THREE.SRGBColorSpace);
    const marker = new THREE.Mesh(new THREE.SphereGeometry(R * 0.22, 10, 8), markerMat); marker.name = "hueMarker"; marker.position.set(0, cue.top + R * 0.3, 0);
    const P = group.userData.parts, C = group.userData.cues, was = {};
    for (const k of PROCEDURAL_PARTS) if (P && P[k]) { was[k] = P[k].visible; P[k].visible = false; }
    const cuesWere = C ? { frame: C.frame.position.clone(), fill: C.fill.position.clone(), slab: C.slab.position.clone() } : null;
    if (C) { C.frame.position.set(cue.x, cue.frameY, 0); C.fill.position.set(cue.x, cue.fillY, 0); C.slab.position.set(0, cue.slabY, 0); }
    group.add(wrap); group.add(marker);
    const warnings = [...fit.warnings]; if (budget.level === "warn") warnings.push(budget.reason);
    group.userData.model = { entry: { ...entry }, wrap, marker, mats, markerMat, was, cuesWere, fit, cue, triangles: info.triangles, warnings, attribution: attributionLine(entry) };
    return { fit, triangles: info.triangles, warnings, attribution: group.userData.model.attribution };
}

/** Take a model off a boat: the model, its cloned materials and the marker are disposed, the procedural parts are visible again and the cues are where they were. Answers true when there was a model. */
export function revertModel(group) {
    const m = group.userData.model; if (!m) return false;
    group.remove(m.wrap); group.remove(m.marker);
    for (const x of m.mats) x.dispose();
    m.marker.geometry.dispose(); m.markerMat.dispose();
    const P = group.userData.parts, C = group.userData.cues;
    for (const k of Object.keys(m.was)) if (P && P[k]) P[k].visible = m.was[k];
    if (C && m.cuesWere) { C.frame.position.copy(m.cuesWere.frame); C.fill.position.copy(m.cuesWere.fill); C.slab.position.copy(m.cuesWere.slab); }
    delete group.userData.model; return true;
}

/** The default loader: the url's bytes parsed through gpu/gltfDraco.js (Draco files get the decoder, others do not). Browser only: the loader files import 'three' bare, which the page's import map resolves. */
export async function defaultLoad(url) {
    const [{ loadGlb }, { GLTFLoader }] = await Promise.all([import("/gpu/gltfDraco.js"), import("/vendor/three/jsm/loaders/GLTFLoader.js")]);
    const gltf = await loadGlb(url, GLTFLoader);
    return gltf.scene || (gltf.scenes && gltf.scenes[0]) || null;
}

/**
 * The host the view calls. `store` is a render/subModelsCore.mjs store; `load(url)` answers a Promise of a loaded scene (default: defaultLoad). Options: keepColours (the model's own colours), tint (0..1, 0.3), length (the drawn hull length).
 * sync(group, row) -> the boat's state { status: "procedural" | "loading" | "model" | "failed", reason, attribution, warnings, triangles }; release(group) takes the model off (for a boat leaving the tank);
 * settled() -> a Promise that resolves when no load is in flight (for a gate); options are read on every sync, so a page can change them.
 */
export function createSubModelHost(THREE, { store, load = defaultLoad, keepColours = false, tint = DEFAULT_TINT, length = HULL_LENGTH } = {}) {
    if (!store || typeof store.resolve !== "function") throw new Error("subModels3d.createSubModelHost: a store with resolve() is needed");
    const cache = new Map(), inflight = new Set(), opts = { keepColours, tint, length };
    const template = (url) => {
        if (!cache.has(url)) {
            const p = Promise.resolve().then(() => load(url)).then((scene) => { if (!scene) throw new Error("the file holds no scene"); return scene; });
            p.catch(() => { if (cache.get(url) === p) cache.delete(url); });   // a failed load does not stick: the next assignment retries
            cache.set(url, p);
        }
        return cache.get(url);
    };
    return {
        opts,
        sync(group, row) {
            const entry = store.resolve(row && row.hull), st = group.userData.modelState || (group.userData.modelState = { key: "", status: "procedural", reason: "", attribution: "", warnings: [], triangles: 0 });
            const key = entry ? JSON.stringify([entry.url, entry.yaw, entry.up, row.hue, opts.keepColours, opts.tint, opts.length]) : "";
            if (st.key === key) return st;
            st.key = key; st.reason = ""; st.attribution = ""; st.warnings = []; st.triangles = 0;
            if (group.userData.model) revertModel(group);
            if (!entry) { st.status = "procedural"; return st; }
            st.status = "loading";
            const job = template(entry.url).then((scene) => {
                if (st.key !== key) return;   // the assignment changed while this was loading
                try { const r = applyModel(THREE, group, scene, entry, { hue: row.hue, keepColours: opts.keepColours, tint: opts.tint, length: opts.length }); st.status = "model"; st.attribution = r.attribution; st.warnings = r.warnings; st.triangles = r.triangles; }
                catch (e) { st.status = "failed"; st.reason = String((e && e.message) || e).slice(0, 200); }
            }, (e) => { if (st.key === key) { st.status = "failed"; st.reason = String((e && e.message) || e).slice(0, 200); } });
            inflight.add(job); job.finally(() => inflight.delete(job));
            return st;
        },
        release(group) { const st = group.userData.modelState; if (st) { st.key = ""; st.status = "procedural"; } return revertModel(group); },
        settled: async () => { while (inflight.size) await Promise.all([...inflight]); },
        cached: () => cache.size,
    };
}

export function reportLines() {
    return ["[subModels3d] a model is a child of the procedural boat: the five parts hidden, the cues moved to its top and keel, a hue marker, per-boat cloned and depth-tinted materials; rigid; the procedural hull is the fallback"];
}
