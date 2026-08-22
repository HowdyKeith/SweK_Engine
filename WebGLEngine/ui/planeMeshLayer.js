// ui/planeMeshLayer.js — v1447
// Real 3D aircraft in the world view, tracked off the live ADS-B feed. The ADS-B
// layer (adsbLayer.js) calls window.planeMesh.sync(list) every poll/frame with each
// contact's world position + heading + class; this layer spawns one mesh entity per
// aircraft (via the same entity:spawnMesh / ecs Position path the demos use), moves
// it, and despawns it when the contact drops.
//
// MODELS, per class (airliner / jet / turboprop / prop / heli / unknown):
//   - default: a small PROCEDURAL voxel silhouette (built + registered here).
//   - override: the user can assign any library mesh asset (.glb) to a class via
//     window.planeMesh.setModel(cls, assetId) — so jets can be sci-fi jets, props
//     biplanes, unknowns UFOs, etc. Persisted in localStorage.
//
// API: window.planeMesh.sync(list) / .setModel(cls, assetId|null) / .models()
//      / .clear() / .status()   where list = [{ hex, x, y, z, yaw, cls }]

import { buildVoxelMesh } from "../gpu/voxelCreature.js";

const CLASSES = ["airliner", "jet", "turboprop", "prop", "heli", "unknown"];

// ---- procedural voxel silhouettes (nose toward -Z = forward; y up; x = wings) ----
// colour index is 0..7 into the creature palette; shape matters more than colour here.
function line(out, x0, x1, y, z, ci) { for (let x = x0; x <= x1; x++) out.push([x, y, z, ci]); }
function genJet() {
    const v = []; const body = 1, wing = 5, tail = 6;
    for (let z = -3; z <= 3; z++) v.push([0, 0, z, body]);        // fuselage
    line(v, -3, 3, 0, 1, wing);                                   // swept main wing (mid-aft)
    line(v, -1, 1, 1, 3, tail);                                   // tailplane
    v.push([0, 1, 3, tail]);                                      // fin
    v.push([0, 0, -3, 4]);                                        // nose tip
    return v;
}
function genAirliner() {
    const v = []; const body = 1, wing = 5, tail = 6;
    for (let z = -4; z <= 4; z++) v.push([0, 0, z, body]);        // long fuselage
    line(v, -5, 5, 0, 0, wing);                                   // long straight wing (mid)
    line(v, -2, 2, 0, 4, tail);                                   // tailplane
    v.push([0, 1, 4, tail]); v.push([0, 1, 3, tail]);            // tall fin
    return v;
}
function genProp() {
    const v = []; const body = 2, wing = 3, tail = 6;
    for (let z = -2; z <= 3; z++) v.push([0, 0, z, body]);        // short fuselage
    line(v, -3, 3, 0, 0, wing);                                   // straight wing forward
    line(v, -1, 1, 0, 3, tail);                                   // tailplane
    v.push([0, 1, 3, tail]);                                      // fin
    v.push([0, 0, -3, 4]); v.push([-1, 0, -3, 4]); v.push([1, 0, -3, 4]); // prop disc at nose
    return v;
}
function genHeli() {
    const v = []; const body = 2, rotor = 7, tail = 6;
    for (let z = -1; z <= 1; z++) for (let x = -1; x <= 1; x++) v.push([x, 0, z, body]); // boxy cabin
    for (let z = 2; z <= 5; z++) v.push([0, 0, z, body]);         // tail boom
    line(v, -4, 4, 2, 0, rotor);                                  // main rotor bar (raised)
    line(v, -1, 1, 1, 5, tail);                                   // tail rotor
    return v;
}
const GEN = { jet: genJet, airliner: genAirliner, turboprop: genProp, prop: genProp, heli: genHeli, unknown: genJet };

const DEG = Math.PI / 180;
const LS_KEY = "voxelengine.planeModels";

export function installPlaneMesh() {
    let registered = false;
    const procKind = {};                 // cls -> procedural kind name
    const tracked = new Map();           // hex -> { id, kind }
    const glbKind = {};                  // cls -> loaded glb kind name (or null)
    let userModels = loadModels();       // cls -> assetId (user choice)
    let loadingGlb = {};                 // cls -> Promise (in-flight glb load)

    function loadModels() { try { return JSON.parse(localStorage.getItem(LS_KEY) || "{}") || {}; } catch { return {}; } }
    function saveModels() { try { localStorage.setItem(LS_KEY, JSON.stringify(userModels)); } catch {} }

    function registerKinds() {
        if (registered) return true;
        const al = window.assetLoader;
        if (!al || !al.gl || !al.cache || !al._createMesh) return false;
        for (const cls of CLASSES) {
            const kind = "plane_" + cls;
            if (!al.cache.get(kind)) {
                try {
                    const g = buildVoxelMesh(GEN[cls]());
                    const mesh = al._createMesh(g.positions.buffer, g.indices.buffer, g.normals.buffer, g.colors.buffer,
                        { name: kind, vertexCount: g.vertexCount, indexCount: g.indices.length, hasNormals: true, hasColors: true });
                    if (mesh) { al.cache.set(kind, mesh); al._ollamaRequested?.add?.(kind); }
                } catch (e) { console.warn("[planeMesh] register " + kind + ":", e && e.message); }
            }
            procKind[cls] = kind;
        }
        registered = true;
        return true;
    }

    // load a user-chosen model as a spawnable kind (lazy, cached). The assetId is
    // either a curated asset-library id OR a GPU_Assets folder URL like
    // "/GPU_Assets/f15.glb" (v1515 — folder drops now selectable in the picker).
    async function ensureGlb(cls) {
        const assetId = userModels[cls];
        if (!assetId) { glbKind[cls] = null; return null; }
        const kind = "plane_glb_" + String(assetId).replace(/[^a-z0-9._-]+/gi, "_");
        if (window.assetLoader?.cache?.get?.(kind)) { glbKind[cls] = kind; return kind; }
        if (loadingGlb[cls]) return loadingGlb[cls];
        loadingGlb[cls] = (async () => {
            try {
                const norm = { normalize: { targetSize: 4, anchor: "center" } };
                if (/^(https?:)?\//.test(String(assetId))) {
                    // GPU_Assets folder file (dropped into the assets dir) — fetch + load by URL.
                    const resp = await fetch(assetId);
                    if (!resp.ok) throw new Error("HTTP " + resp.status);
                    await window.assetLoader._loadGLBFromBytes(kind, await resp.arrayBuffer(), norm);
                } else {
                    // curated asset-library mesh (base64 data via assetLibrary.get).
                    const lib = await window.assetLibrary?.get?.(assetId);
                    if (!lib || lib.error || typeof lib.data !== "string") throw new Error("asset unavailable");
                    const bin = atob(lib.data); const bytes = new Uint8Array(bin.length);
                    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
                    await window.assetLoader._loadGLBFromBytes(kind, bytes.buffer, norm);
                }
                glbKind[cls] = kind; return kind;
            } catch (e) { console.warn("[planeMesh] glb load (" + cls + "):", e && e.message); glbKind[cls] = null; return null; }
            finally { delete loadingGlb[cls]; }
        })();
        return loadingGlb[cls];
    }

    function kindFor(cls) {
        const c = CLASSES.includes(cls) ? cls : "unknown";
        if (userModels[c]) { ensureGlb(c); if (glbKind[c]) return glbKind[c]; }   // glb if ready, else fall back to procedural this frame
        return procKind[c] || procKind.unknown;
    }

    function _setTransform(id, x, y, z, yaw) {
        try { const ecs = window.ecsWorld; if (!ecs?.getComponent) return; const pos = ecs.getComponent(id, "Position");
            if (pos) { pos.x = x; pos.y = y; pos.z = z; if (yaw !== undefined) pos.yaw = yaw; } } catch {}
    }
    function _spawn(kind, x, y, z, yaw) {
        try { const r = window.router?.exec?.({ type: "entity:spawnMesh", assetId: kind, kind, x, y, z, scaleX: 1, scaleY: 1, scaleZ: 1, yaw }); return r && r.id; } catch { return null; }
    }
    function _despawn(id) { try { window.router?.exec?.({ type: "entity:despawn", id }); } catch {} }

    // list = [{ hex, x, y, z, yaw, cls }]  (yaw already in radians)
    function sync(list) {
        if (!registerKinds()) return { ok: false, error: "asset loader not ready" };
        const seen = new Set();
        for (const p of (list || [])) {
            if (!p || p.hex == null) continue;
            seen.add(p.hex);
            const wantKind = kindFor(p.cls);
            let t = tracked.get(p.hex);
            if (t && t.kind !== wantKind) { _despawn(t.id); tracked.delete(p.hex); t = null; }   // class/model changed -> respawn
            if (!t) {
                const id = _spawn(wantKind, p.x, p.y, p.z, p.yaw);
                if (id != null) tracked.set(p.hex, { id, kind: wantKind });
            } else {
                _setTransform(t.id, p.x, p.y, p.z, p.yaw);
            }
        }
        for (const [hex, t] of [...tracked]) if (!seen.has(hex)) { _despawn(t.id); tracked.delete(hex); }
        return { ok: true, tracked: tracked.size };
    }

    function clear() { for (const [, t] of tracked) _despawn(t.id); tracked.clear(); return { ok: true }; }

    function setModel(cls, assetId) {
        const c = CLASSES.includes(cls) ? cls : null; if (!c) return { ok: false, error: "unknown class " + cls };
        if (assetId) userModels[c] = String(assetId); else delete userModels[c];
        glbKind[c] = null; saveModels();
        // re-skin any tracked planes of this class on the next sync (force respawn)
        if (assetId) ensureGlb(c);
        return { ok: true, models: models() };
    }
    function models() { const out = {}; for (const c of CLASSES) out[c] = { procedural: "plane_" + c, glb: userModels[c] || null }; return out; }
    function status() { return { ok: true, registered, tracked: tracked.size, classes: CLASSES, models: models() }; }

    window.planeMesh = { sync, clear, setModel, models, status, CLASSES, classToYaw: (heading) => (heading || 0) * DEG };
    console.log("[planeMesh] window.planeMesh.sync(list) / .setModel(cls, assetId) — 3D aircraft (procedural + user .glb per class)");
}
