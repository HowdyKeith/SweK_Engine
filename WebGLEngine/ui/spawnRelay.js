// ui/spawnRelay.js — v949
// Engine-side drainer for the spawn relay. A standalone library page
// (asset-library.html — possibly on a phone or the Shield TV, or just another
// browser tab) POSTs an asset id to the bridge (/spawn/push). THIS running
// engine polls /spawn/pending, which the bridge drains, and spawns each asset
// via window.spawnAssetFromLibrary(id, opts) — the same rig+place pipeline the
// console and the in-engine panel use (handles voxel, mesh, and splat assets).
//
// Imported only by main.js, so phone/TV pages are never drainers; it also
// guards on the function existing, so the module is inert until the engine's
// spawn pipeline is ready.

let _timer = null;

async function poll() {
    if (typeof window !== "undefined" && window.__swekPollsPaused) return;   // v1870 — hold while Settings is open
    if (typeof window.spawnAssetFromLibrary !== "function") return;   // not the engine, or not ready yet
    let spawns;
    try {
        const r = await fetch("/spawn/pending", { cache: "no-store" });
        if (!r.ok) return;
        const j = await r.json();
        spawns = (j && j.spawns) || [];
    } catch { return; /* bridge busy — retry next tick */ }
    for (const s of spawns) {
        if (!s || !s.id) continue;
        try {
            const res = await window.spawnAssetFromLibrary(s.id, s.opts || {});
            if (res && res.ok) {
                try { window.toast && window.toast("🚀 spawned '" + s.id + "'"); } catch {}
            } else {
                console.warn("[spawnRelay] spawn failed:", s.id, res && res.error);
                try { window.toast && window.toast("⚠ spawn failed: " + ((res && res.error) || s.id)); } catch {}
            }
        } catch (e) {
            console.warn("[spawnRelay] spawn threw:", s.id, e && e.message);
        }
    }
}

export function startSpawnRelay(intervalMs = 2000) {
    if (_timer) return;
    _timer = setInterval(poll, intervalMs);
    console.log("[spawnRelay] engine draining /spawn/pending every " + intervalMs + "ms");
}
export function stopSpawnRelay() { if (_timer) { clearInterval(_timer); _timer = null; } }

window.spawnRelay = { start: startSpawnRelay, stop: stopSpawnRelay, poll };

// Self-start (side-effect import, like openUrlListener). poll() guards on
// window.spawnAssetFromLibrary, so it no-ops until the engine is ready.
startSpawnRelay();
