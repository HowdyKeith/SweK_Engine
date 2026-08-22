// FILE: ui/peerBootstrap.js
// VERSION: v1 - inherit the network on first peer contact (peer bootstrap)
//
// When a SweK engine comes online it normally discovers peers one at a time via its own UDP beacon / LAN sweep - slow, and
// it competes with the heavy engine load. Instead: the moment we reach our FIRST peer, we ask IT for its whole known-peer
// map (its /peer/list is gossip - everything it has seen), seed those peers locally so the gauges/radar/panels paint the
// full network immediately, and HOLD the active scan during the rest of the load. Once the world has drawn we resume normal
// scanning. The presence memory (v1734) keeps that first snapshot from flickering while the scan is paused.
//
// Pure picker + injectable orchestration so it unit-tests headless.

// Pure: which peer URLs from the first peer's list should we adopt? Everything they know that we don't already, minus self.
export function peersToSeed(theirList, myKnown, selfUrl) {
    const norm = (u) => String(u || "").replace(/\/+$/, "");
    const self = norm(selfUrl);
    const have = new Set((Array.isArray(myKnown) ? myKnown : []).map((p) => norm(p && (p.url || p))));
    const out = [];
    const seen = new Set();
    for (const p of (Array.isArray(theirList) ? theirList : [])) {
        const u = norm(p && (p.url || p));
        if (!u || u === self || have.has(u) || seen.has(u)) continue;
        seen.add(u); out.push(u);
    }
    return out;
}

// Orchestration. deps:
//   fetchJson(url)->Promise<obj|null>     postJson(url,body)->Promise<any>
//   selfUrl()->string                     myPeers()->array (current /peer/list peers)
//   onSeeded(addedUrls)                   (optional) repaint the UI with the inherited map
//   setScanPaused(bool)                   pause/resume the active scan during load
//   waitForLoaded()->Promise              resolves when the world has drawn (or a safety timeout)
//   findFirstPeerTimeoutMs (default 12000), pollMs (default 1200)
export async function runPeerBootstrap(deps) {
    const d = deps || {};
    if (!d.fetchJson) return { ok: false, error: "missing deps" };
    const deadline = Date.now() + (d.findFirstPeerTimeoutMs || 12000);
    const pollMs = d.pollMs || 1200;

    // 1) wait until we can see our first peer (cheap local /peer/list)
    let first = null;
    while (Date.now() < deadline) {
        let peers = [];
        try { const pl = await d.fetchJson("/peer/list"); if (pl && pl.ok) peers = pl.peers || []; } catch {}
        const cand = peers.find((p) => p && p.url);
        if (cand) { first = cand.url; break; }
        await new Promise((r) => setTimeout(r, pollMs));
    }
    if (!first) return { ok: true, action: "solo" };   // nobody out there - normal discovery continues

    // 2) hold the active scan now that we have a lead, and ask the first peer for its whole map
    try { if (d.setScanPaused) d.setScanPaused(true); } catch {}
    let theirList = [];
    try { const pl = await d.fetchJson(String(first).replace(/\/+$/, "") + "/peer/list"); if (pl && pl.ok) theirList = pl.peers || []; } catch {}

    let myKnown = [];
    try { const pl = await d.fetchJson("/peer/list"); if (pl && pl.ok) myKnown = pl.peers || []; } catch {}
    const seedUrls = peersToSeed(theirList, myKnown, d.selfUrl ? d.selfUrl() : "");

    // 3) seed the inherited peers locally so the existing UI (which polls /peer/list) shows the full network at once
    let added = 0;
    for (const u of seedUrls) { try { if (d.postJson) { await d.postJson("/sync/peers/add", { url: u }); added++; } } catch {} }
    try { if (d.onSeeded) d.onSeeded(seedUrls); } catch {}

    // 4) finish loading with the scan held, then resume normal scanning
    try { if (d.waitForLoaded) await d.waitForLoaded(); } catch {}
    try { if (d.setScanPaused) d.setScanPaused(false); } catch {}

    return { ok: true, action: "bootstrapped", from: first, seeded: added, knew: theirList.length };
}
