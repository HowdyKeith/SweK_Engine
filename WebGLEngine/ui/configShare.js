// FILE: ui/configShare.js
// VERSION: v1 - non-secret config auto-share (build step #2)
//
// Generalises the location adopt-on-load (#9) to a small ALLOW-LIST of PORTABLE, non-secret preferences, plus the cloud
// rendezvous URL (the URL only - NEVER the token). On load a box publishes its shareable prefs; a box that hasn't set a
// given pref fills that blank from a peer. Manual settings always win - we only fill blanks, never overwrite.
//
// Deliberately conservative: the allow-list is hand-picked visual/behaviour prefs. It excludes machine-specific values
// (local service URLs, install paths), per-box identity, and anything secret. The ADOPTING side only ever reads keys that
// are on this list, so a peer can't push an arbitrary or malicious setting onto us.

export const SHAREABLE_KEYS = [
    "voxelengine.wxUnit",     // weather unit (f / c)
    "voxelengine.bloom",      // bloom on/off
    "voxelengine.clouds",     // volumetric clouds on/off
    "voxelengine.cloudsFx",   // cloud FX
    "voxelengine.autoFog",    // auto fog
    "voxelengine.castGreen",  // green cast / tone
    "voxelengine.llmDialect", // narration dialect preference
    "voxelengine.welcomeSeen", // v1972 — first-run decision: once one box has answered, recognized peers inherit "seen" and don't re-ask
];

// Pure: read MY shareable prefs into a {key:value} map (only keys that are actually set).
export function readShareable(getLocal, keys) {
    const out = {};
    // v1972 — respect the welcome "Remember my decision" opt-out: if welcomeShare === "0", don't publish
    // welcomeSeen to peers (this box still won't re-ask itself, it just won't decide for the others).
    const shareWelcome = getLocal("voxelengine.welcomeShare") !== "0";
    for (const k of (keys || SHAREABLE_KEYS)) {
        if (k === "voxelengine.welcomeSeen" && !shareWelcome) continue;
        const v = getLocal(k); if (v != null && v !== "") out[k] = v;
    }
    return out;
}

// Pure: for each shareable key I DON'T have set, the first peer value seen. Only allow-listed keys are ever considered.
export function pickPeerConfig(getLocal, peerConfigs, keys) {
    const adopt = {}; const ks = keys || SHAREABLE_KEYS;
    const cfgs = Array.isArray(peerConfigs) ? peerConfigs : [];
    for (const k of ks) {
        const mine = getLocal(k); if (mine != null && mine !== "") continue;   // never overwrite a set value
        for (const cfg of cfgs) { if (cfg && cfg[k] != null && cfg[k] !== "") { adopt[k] = String(cfg[k]); break; } }
    }
    return adopt;
}

// Pure: adopt a peer's cloud rendezvous URL only if I have none.
export function pickCloudUrl(mineUrl, peerUrls) {
    if (mineUrl && String(mineUrl).trim()) return null;
    for (const u of (Array.isArray(peerUrls) ? peerUrls : [])) { if (u && String(u).trim()) return String(u).trim(); }
    return null;
}

// Orchestration. deps: getLocal, setLocal, fetchJson, postJson
export async function syncConfigWithPeers(deps) {
    const d = deps || {};
    const { getLocal, setLocal, fetchJson, postJson } = d;
    if (!getLocal || !fetchJson) return { ok: false, error: "missing deps" };

    // 1) publish my shareable prefs so peers can inherit them
    try { if (postJson) await postJson("/self/config", { config: readShareable(getLocal) }); } catch {}

    // 2) anything to fill? (a blank pref, or no cloud URL)
    const blanks = SHAREABLE_KEYS.filter((k) => { const v = getLocal(k); return v == null || v === ""; });
    let myCloudUrl = ""; try { const cc = await fetchJson("/cloud/config"); myCloudUrl = (cc && cc.url) || ""; } catch {}
    if (blanks.length === 0 && myCloudUrl) return { ok: true, action: "published", adopted: 0 };

    // 3) gather peers' published config + cloud URLs
    let peers = []; try { const pl = await fetchJson("/peer/list"); if (pl && pl.ok) peers = (pl.peers || []).map((p) => p && p.url).filter(Boolean); } catch {}
    const peerConfigs = []; const peerCloudUrls = [];
    for (const u of peers) {
        try { const ni = await fetchJson(String(u).replace(/\/+$/, "") + "/net/info"); if (ni) { if (ni.config) peerConfigs.push(ni.config); if (ni.cloudUrl) peerCloudUrls.push(ni.cloudUrl); } } catch {}
    }

    // 4) fill blank prefs
    const adopt = pickPeerConfig(getLocal, peerConfigs);
    let n = 0; for (const k of Object.keys(adopt)) { try { setLocal(k, adopt[k]); n++; } catch {} }

    // 5) fill the cloud URL if we have none (URL only - the token comes later via the secure key move)
    let cloud = false; const cu = pickCloudUrl(myCloudUrl, peerCloudUrls);
    if (cu) { try { if (postJson) { await postJson("/cloud/config", { url: cu }); cloud = true; } } catch {} }

    return { ok: true, action: "adopted", adopted: n, cloudUrl: cloud };
}
