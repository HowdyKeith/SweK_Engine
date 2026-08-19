// WebGLEngine/ev/esShipModels.js — v3827 (Long Silence, GLB ship assignment)
//
// USER-ASSIGNABLE .glb SHIP MODELS PER CLASS, the way the flight radar assigns aircraft (ui/planeMeshLayer.js):
// classify a ship, look up the user's chosen model for that class, draw it if present, otherwise the procedural
// hull. The user downloads a model (from anywhere), drops it in GPU_Assets/ (or picks the local file), assigns
// it to a class in the picker, and every ship of that class wears it. The classify + persistence live in the
// pure esShipModelsCore.js (gated); this file is the Three.js: load, normalize, clone, and the picker UI.
//
//   const sm = mountShipModels({ makeProcedural, onChange });
//   scene-side: const hull = sm.hullFor(ship, team);   // procedural now, glb swapped in when it loads
//   ui-side:    sm.buildPicker(container);              // per-class URL / file / facing assignment

import * as THREE from "/vendor/three/three.module.js";
import { GLTFLoader } from "/vendor/three/jsm/loaders/GLTFLoader.js";
import { esShipClass, kindForUrl, makeModelStore, ES_SHIP_CLASSES } from "/ev/esShipModelsCore.js";
import { spriteHull } from "/ev/spriteHull.js";   // v3828 -- loft the ship's own top-down art into a hull

function disposeObj(o) {
    o.traverse((n) => {
        if (n.geometry && n.geometry.dispose) n.geometry.dispose();
        if (n.material) (Array.isArray(n.material) ? n.material : [n.material]).forEach((m) => m && m.dispose && m.dispose());
    });
}

export function mountShipModels(opts = {}) {
    const makeProcedural = opts.makeProcedural || (() => new THREE.Group());
    const onChange = opts.onChange || (() => {});
    const assetListUrl = opts.assetListUrl || "/assets/list";
    const store = makeModelStore(opts.storage);
    const teamColor = opts.teamColor || ((t) => (t === "A" ? 0x4fd0ff : t === "B" ? 0xff9a4f : 0x9fb4c8));
    const loader = new GLTFLoader();
    const templates = new Map();   // cacheKey -> Promise<Object3D|null>

    // Load a glb once, normalize it to ~unit size, centre it, and apply the class's facing correction so its
    // nose ends up along +X (the engine's ship-forward). Cached by url+yaw. Resolves null on any load error, so
    // the caller silently keeps the procedural hull.
    function loadTemplate(url, yaw) {
        const key = kindForUrl(url) + "_y" + (yaw || 0);
        if (templates.has(key)) return templates.get(key);
        const p = new Promise((resolve) => {
            let done = false; const finish = (v) => { if (!done) { done = true; resolve(v); } };
            try {
                loader.load(url, (gltf) => {
                    try {
                        const inner = gltf.scene || (gltf.scenes && gltf.scenes[0]);
                        if (!inner) return finish(null);
                        const box = new THREE.Box3().setFromObject(inner);
                        const size = box.getSize(new THREE.Vector3()), center = box.getCenter(new THREE.Vector3());
                        const maxDim = Math.max(size.x, size.y, size.z) || 1, s = 2.2 / maxDim;
                        inner.scale.setScalar(s); inner.position.sub(center.multiplyScalar(s));
                        const g = new THREE.Group(); g.add(inner);
                        g.rotation.y = (yaw || 0) * Math.PI / 180;   // user facing correction toward +X nose
                        finish(g);
                    } catch (e) { finish(null); }
                }, undefined, () => finish(null));
            } catch (e) { finish(null); }
        });
        templates.set(key, p);
        return p;
    }

    // A hull Group the caller positions/orients. Procedural is added immediately (never blocks a frame); if the
    // ship's class has a model assigned, the glb clone swaps in when it finishes loading.
    function hullFor(ship, team) {
        const g = new THREE.Group();
        const proc = makeProcedural(team); g.add(proc);
        const a = store.get(esShipClass(ship));
        if (a && a.url) {
            const swap = (obj) => { if (!obj) return; if (g.children.includes(proc)) { g.remove(proc); disposeObj(proc); } g.add(obj); };
            if (/^sprite:/i.test(a.url)) {
                // v3828 -- loft the ES sprite art itself into the hull (nose already +X); tint by team.
                spriteHull(a.url.replace(/^sprite:/i, "").trim(), { color: teamColor(team), yaw: a.yaw }).then(swap);
            } else {
                loadTemplate(a.url, a.yaw).then((tpl) => swap(tpl ? tpl.clone(true) : null));
            }
        }
        return g;
    }

    function setModel(cls, url, yaw) { store.set(cls, url, yaw); onChange(); }
    function clearModel(cls) { store.clear(cls); onChange(); }

    // ---- picker UI (the assignment surface) ----
    async function fetchAssetList() {
        try {
            const r = await fetch(assetListUrl); if (!r.ok) return [];
            const j = await r.json();
            const arr = Array.isArray(j) ? j : (j && (j.assets || j.files || j.list)) || [];
            return arr.map((x) => (typeof x === "string" ? x : (x && (x.url || x.path || x.file)))).filter((u) => u && /\.(glb|gltf)$/i.test(u));
        } catch (e) { return []; }
    }

    function buildPicker(container) {
        container.innerHTML = "";
        const wrap = document.createElement("div");
        wrap.style.cssText = "font:11px ui-monospace,monospace;color:#cfe0f5;display:flex;flex-direction:column;gap:8px;min-width:300px;";
        const head = document.createElement("div");
        head.style.cssText = "color:#8de0c0;";
        head.textContent = "Assign a .glb model per ship class \u2014 download one, drop it in GPU_Assets/ or pick the file, and set the facing so the nose points forward. Unassigned classes use the procedural hull.";
        wrap.appendChild(head);

        const dl = document.createElement("datalist"); dl.id = "esGlbList"; wrap.appendChild(dl);
        fetchAssetList().then((list) => { for (const u of list) { const o = document.createElement("option"); o.value = u; dl.appendChild(o); } });

        for (const cls of ES_SHIP_CLASSES) {
            const row = document.createElement("div");
            row.style.cssText = "display:flex;gap:6px;align-items:center;flex-wrap:wrap;border-top:1px solid #16223c;padding-top:6px;";
            const cur = store.get(cls);
            const label = document.createElement("b"); label.style.cssText = "width:74px;color:#9fe6c0;text-transform:capitalize;"; label.textContent = cls;
            const url = document.createElement("input"); url.type = "text"; url.placeholder = "/GPU_Assets/ships/x.glb or https://\u2026"; url.value = cur ? cur.url : "";
            url.setAttribute("list", "esGlbList"); url.style.cssText = "flex:1;min-width:150px;background:#0b1424;color:#cfe0f5;border:1px solid #2f486c;border-radius:4px;padding:2px 5px;font:inherit;";
            const yaw = document.createElement("select"); yaw.style.cssText = "background:#0b1424;color:#cfe0f5;border:1px solid #2f486c;border-radius:4px;font:inherit;";
            for (const y of [0, 90, 180, 270]) { const o = document.createElement("option"); o.value = y; o.textContent = y + "\u00b0"; if (cur && cur.yaw === y) o.selected = true; yaw.appendChild(o); }
            const assign = document.createElement("button"); assign.textContent = "Assign"; btn(assign);
            const file = document.createElement("input"); file.type = "file"; file.accept = ".glb,.gltf"; file.style.cssText = "width:150px;font:inherit;color:#7d8fa8;";
            const clr = document.createElement("button"); clr.textContent = "\u2715"; btn(clr); clr.title = "clear (use procedural)";

            assign.onclick = () => { if (url.value.trim()) setModel(cls, url.value.trim(), +yaw.value); };
            file.onchange = () => { const f = file.files && file.files[0]; if (f) { const u = URL.createObjectURL(f); url.value = f.name + " (this session)"; setModel(cls, u, +yaw.value); } };
            clr.onclick = () => { url.value = ""; clearModel(cls); };

            row.append(label, url, yaw, assign, file, clr);
            wrap.appendChild(row);

            // v3828 -- loft the ship's own top-down ES art into a hull (zero asset sourcing). A sprite path like
            // "ship/sparrow" resolves via ev/esSprites.js and is stored as a "sprite:" assignment.
            const srow = document.createElement("div");
            srow.style.cssText = "display:flex;gap:6px;align-items:center;flex-wrap:wrap;padding-left:80px;";
            const sp = document.createElement("input"); sp.type = "text"; sp.placeholder = "loft ES sprite, e.g. ship/sparrow";
            const cs = cur && /^sprite:/i.test(cur.url) ? cur.url.replace(/^sprite:/i, "") : "";
            sp.value = cs; sp.style.cssText = "flex:1;min-width:150px;background:#0b1424;color:#cfe0f5;border:1px solid #2f486c;border-radius:4px;padding:2px 5px;font:inherit;";
            const loft = document.createElement("button"); loft.textContent = "Loft art"; btn(loft);
            loft.onclick = () => { if (sp.value.trim()) setModel(cls, "sprite:" + sp.value.trim(), +yaw.value); };
            srow.append(sp, loft); wrap.appendChild(srow);
        }
        const note = document.createElement("div"); note.style.cssText = "color:#5f7590;";
        note.innerHTML = "URL/path assignments persist; a picked local file lasts the session (its blob URL dies on reload). Static-mesh .glb works best; nose faces +X after the facing you set.";
        wrap.appendChild(note);
        container.appendChild(wrap);
        function btn(b) { b.style.cssText = "background:#152136;color:#b9d4ff;border:1px solid #2f486c;border-radius:4px;cursor:pointer;font:inherit;padding:2px 8px;"; }
    }

    return { store, hullFor, setModel, clearModel, models: () => store.all(), classify: esShipClass, classes: ES_SHIP_CLASSES, buildPicker };
}
