// FILE: /ui/avatarRegistry.js
// v1016 — clean-house: a tiny, dependency-free registry that lets a per-avatar
// identity survive its .glb going missing (404) and re-apply when it returns.
//
// Keyed by the SAME url string used by avatarOrientation + favorites, so a
// user's rename and the "we've seen this file" flag live alongside (but never
// clobber) the saved rotation. When an avatar 404s, the diorama falls back to
// another rig to keep drawing — but the requested avatar's rotation + name are
// kept here, untouched, and snap back the moment the file is present again.
//
// Storage: localStorage["voxelEngine.avatarRegistry"] = { [url]: {name, missing, lastSeen} }
//
//   getName(url)        → saved rename, or null
//   setName(url, name)  → save/clear a rename (empty clears)
//   markSeen(url)       → file loaded OK: clear "missing", stamp lastSeen
//   markMissing(url)    → file 404'd / fell back: flag missing (keeps name)
//   isMissing(url)      → bool
//   listMissing()       → [url, ...] currently-missing avatars
//   info(url)           → { name, missing, lastSeen }
//   forget(url)         → drop the record entirely

const STORAGE_KEY = "voxelEngine.avatarRegistry";

function _load() { try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}"); } catch { return {}; } }
function _save(m) { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(m)); } catch {} }
function _norm(url) { return String(url || "").trim(); }
function _prune(m, url, r) { if (r && (r.name || r.missing || r.lastSeen)) m[url] = r; else delete m[url]; }

export const avatarRegistry = {
    info(url) { const r = _load()[_norm(url)] || {}; return { name: r.name || null, missing: !!r.missing, lastSeen: r.lastSeen || 0 }; },
    getName(url) { const r = _load()[_norm(url)]; return (r && r.name) || null; },
    setName(url, name) {
        url = _norm(url); if (!url) return;
        const m = _load(), r = m[url] || {};
        name = (name == null ? "" : String(name)).trim();
        if (name) r.name = name; else delete r.name;
        _prune(m, url, r); _save(m);
    },
    markSeen(url) {
        url = _norm(url); if (!url) return;
        const m = _load(), r = m[url] || {};
        r.missing = false; r.lastSeen = Date.now();
        _prune(m, url, r); _save(m);
    },
    markMissing(url) {
        url = _norm(url); if (!url) return;
        const m = _load(), r = m[url] || {};
        r.missing = true;                 // keep name + lastSeen so they restore later
        _prune(m, url, r); _save(m);
    },
    isMissing(url) { const r = _load()[_norm(url)]; return !!(r && r.missing); },
    listMissing() { const m = _load(); return Object.keys(m).filter(k => m[k] && m[k].missing); },
    forget(url) { const m = _load(); delete m[_norm(url)]; _save(m); },
};
export default avatarRegistry;
