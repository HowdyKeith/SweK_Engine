// WebGLEngine/ev/esShipModelsCore.js — v3827 (Long Silence, GLB ship assignment)
//
// THE PART OF "ASSIGN A DOWNLOADED SHIP MODEL PER CLASS" THAT HAS NO THREE.JS IN IT, so it can be pinned by an
// answer key: which class a ship is, and the per-class model assignment that persists. This mirrors, on purpose,
// how ui/planeMeshLayer.js assigns .glb aircraft on the flight radar -- classify into a small fixed set, keep a
// user choice per class in storage, fall back to procedural when none is set. The Three.js half (loading the
// glb, swapping the mesh, the picker) lives in esShipModels.js and imports this.
//
// Storage is INJECTED (localStorage in the browser, a mock in the gate) so the persistence is testable headless.

export const ES_SHIP_CLASSES = ["raider", "marauder", "corsair", "unknown"];
const STORE_KEY = "swek.esShipModels.v1";

// A ship's class from whatever field carries it: cls (string or {name}), class, name, type. Lower-cased and
// matched to the known ES set; anything else is "unknown" (the same catch-all planeMeshLayer keeps).
export function esShipClass(ship) {
    if (!ship) return "unknown";
    const raw = (ship.cls && (ship.cls.name || ship.cls)) || ship.class || ship.name || ship.type || "";
    const s = String(raw).toLowerCase().trim();
    for (const c of ES_SHIP_CLASSES) if (c !== "unknown" && s.includes(c)) return c;
    return "unknown";
}

// A filesystem/cache-safe key for a model URL, so a loader can cache one download per distinct asset.
export function kindForUrl(url) {
    return "esglb_" + String(url || "").replace(/[^a-z0-9._-]+/gi, "_").replace(/^_+|_+$/g, "");
}

// The per-class assignment store. Each entry is { url, yaw } -- yaw is a 0/90/180/270 correction because a
// downloaded model's own forward axis rarely matches the engine's (+X nose), and the picker lets the user spin
// it to face right. Unset classes return null and the caller draws the procedural hull.
export function makeModelStore(storage) {
    const store = storage || (typeof localStorage !== "undefined" ? localStorage : null);
    function load() { try { return (store && JSON.parse(store.getItem(STORE_KEY) || "{}")) || {}; } catch (e) { return {}; } }
    let map = load();
    function save() { try { if (store) store.setItem(STORE_KEY, JSON.stringify(map)); } catch (e) {} }
    return {
        get(cls) { return map[cls] || null; },
        // set(cls, url, yaw): url falsy clears the class. Returns false for an unknown class or a bad yaw.
        set(cls, url, yaw = 0) {
            if (!ES_SHIP_CLASSES.includes(cls)) return false;
            const y = ((Math.round((+yaw || 0) / 90) * 90) % 360 + 360) % 360;   // snap to 0/90/180/270
            if (url) map[cls] = { url: String(url), yaw: y }; else delete map[cls];
            save(); return true;
        },
        clear(cls) { delete map[cls]; save(); },
        all() { const o = {}; for (const k of Object.keys(map)) o[k] = { url: map[k].url, yaw: map[k].yaw }; return o; },
        // reload from storage (e.g. after another tab wrote it) -- returns the fresh map
        reload() { map = load(); return this.all(); },
    };
}
