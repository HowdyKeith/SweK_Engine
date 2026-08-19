// FILE: ui/peerLocation.js
// VERSION: v1 - share / adopt a geo location across LAN peers (Round C #9)
//
// The node's location lives in the browser (localStorage voxelengine.wxLat / wxLon, set in Settings -> Weather) and drives
// the STATUS weather line + sun. This module makes that location travel the LAN:
//   * a node that HAS a location publishes it to its OWN server (POST /self/location), which then serves it via /net/info;
//   * a node with NO location, on load, asks its peers (/peer/list -> each peer's /net/info) and adopts the first valid
//     one - so a fresh box inherits "where we are" without the user re-typing it.
// Manual entry always wins: we never overwrite a location that's already set.
//
// The pure picker + the orchestration both take injected deps so they unit-test headless (no browser, no network).

// Pure: choose a location to adopt from a list of peer-reported {lat,lon}. First valid wins. (0,0) is treated as unset.
export function pickPeerLocation(locs) {
    if (!Array.isArray(locs)) return null;
    for (const L of locs) {
        if (!L || typeof L !== "object") continue;
        const lat = Number(L.lat), lon = Number(L.lon);
        if (Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180 && !(lat === 0 && lon === 0)) {
            return { lat, lon };
        }
    }
    return null;
}

// Orchestration. deps:
//   getLocal(key)->string|null   setLocal(key,val)
//   fetchJson(url)->Promise<obj|null>   postJson(url,body)->Promise<any>
//   onAdopt(loc)  (optional) - called after adopting so the caller can refresh its weather line
export async function syncLocationWithPeers(deps) {
    const { getLocal, setLocal, fetchJson, postJson, onAdopt } = deps || {};
    if (!getLocal || !fetchJson) return { ok: false, error: "missing deps" };

    const lat = parseFloat(getLocal("voxelengine.wxLat") || "");
    const lon = parseFloat(getLocal("voxelengine.wxLon") || "");
    if (Number.isFinite(lat) && Number.isFinite(lon)) {
        // we have a location -> publish it so peers can inherit it
        try { if (postJson) await postJson("/self/location", { lat, lon }); } catch {}
        return { ok: true, action: "published", lat, lon };
    }

    // no location -> ask peers for theirs
    let peers = [];
    try { const pl = await fetchJson("/peer/list"); if (pl && pl.ok) peers = (pl.peers || []).map(p => p && p.url).filter(Boolean); } catch {}
    const locs = [];
    for (const u of peers) {
        try { const ni = await fetchJson(String(u).replace(/\/+$/, "") + "/net/info"); if (ni && ni.location) locs.push(ni.location); } catch {}
    }
    const adopt = pickPeerLocation(locs);
    if (!adopt) return { ok: true, action: "none", peers: peers.length };

    try { setLocal("voxelengine.wxLat", String(adopt.lat)); setLocal("voxelengine.wxLon", String(adopt.lon)); } catch {}
    try { if (postJson) await postJson("/self/location", adopt); } catch {}
    try { if (onAdopt) onAdopt(adopt); } catch {}
    return { ok: true, action: "adopted", lat: adopt.lat, lon: adopt.lon };
}
