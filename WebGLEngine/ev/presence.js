// WebGLEngine/ev/presence.js — lightweight presence multiplayer for the EV-compatible engine. Each flying client
// broadcasts a tiny state packet (id, name, system, x, y, vx, vy, heading, ship); every client renders the OTHER
// pilots in its current system as ghost ships. This is co-op PRESENCE, not authoritative combat — peers are shown,
// not simulated against. The PresenceManager is pure and unit-tested; the transports touch the network/browser.
//
// Transports:
//   broadcastTransport(room)        - same-machine tabs via BroadcastChannel. Zero server: open two tabs to test.
//   httpPresenceTransport(url,...)  - cross-network via the SweK rendezvous presence room (POST state, poll others).
// Both are tiny JSON; coords are rounded to ints to keep packets small. For always-on use, the egress-optimal path
// is WebRTC P2P over the rendezvous signaling (peers talk directly, cloud only brokers) - a later upgrade.
//
// Milestone: presence-multiplayer.

class PresenceManager {
    constructor(localId, opts = {}) { this.localId = localId; this.peers = new Map(); this.staleMs = opts.staleMs || 4000; }

    _upsert(p, now) {
        this.peers.set(p.id, {
            id: p.id, name: p.name || "pilot", system: p.system,
            x: +p.x || 0, y: +p.y || 0, vx: +p.vx || 0, vy: +p.vy || 0,
            // v2184 -- z. A ship flies in a plane and never needed one; a tank jumps. Optional, so an ES
            // packet is byte-identical to what it was, and a BZ packet is one number longer.
            z: (p.z != null ? +p.z : null),
            heading: +p.heading || 0, shipName: p.shipName || "", shipClass: (p.shipClass != null ? +p.shipClass : null), bot: !!p.bot, hp: (p.hp != null ? +p.hp : null), team: p.team || null, lastT: now,
            // v2169 -- npc replication. This sanitiser is a whitelist: anything not named here is
            // dropped, which is why `npcs` has to be named explicitly. It is stored RAW and validated
            // downstream by esAuthority.mergeRemoteNpcs, which is the only place that knows who owns
            // what. Presence must not become a second, weaker authority.
            npcs: Array.isArray(p.npcs) ? p.npcs.slice(0, 64) : null,
        });
    }
    applyMessage(msg, now = Date.now()) {
        if (!msg) return;
        if (msg.type === "snapshot" && Array.isArray(msg.peers)) {   // poll result: full peer list
            const seen = new Set();
            for (const p of msg.peers) { if (p && p.id != null && p.id !== this.localId) { this._upsert(p, now); seen.add(p.id); } }
            if (msg.authoritative) for (const id of [...this.peers.keys()]) if (!seen.has(id)) this.peers.delete(id);
            return;
        }
        if (msg.id == null || msg.id === this.localId) return;        // ignore self / malformed
        if (msg.type === "leave") { this.peers.delete(msg.id); return; }
        if (msg.type && msg.type !== "presence") return;
        this._upsert(msg, now);
    }
    prune(now = Date.now()) { for (const [id, p] of this.peers) if (now - p.lastT > this.staleMs) this.peers.delete(id); }
    count(now = Date.now()) { let n = 0; for (const p of this.peers.values()) if (now - p.lastT <= this.staleMs) n++; return n; }

    // Live pilots in a system, positions dead-reckoned forward from their last update (clamped) for smoothness.
    peersInSystem(systemId, now = Date.now()) {
        const out = [];
        for (const p of this.peers.values()) {
            if (now - p.lastT > this.staleMs || p.system !== systemId) continue;
            const dt = Math.min(0.6, (now - p.lastT) / 1000);
            out.push({ id: p.id, name: p.name, shipName: p.shipName, shipClass: p.shipClass, heading: p.heading, bot: p.bot, hp: p.hp, team: p.team, x: p.x + p.vx * dt, y: p.y + p.vy * dt, z: p.z, npcs: p.npcs, npcT: p.lastT });
        }
        return out;
    }
    localPacket(s) {
        return { type: "presence", id: this.localId, name: s.name, system: s.system,
            x: Math.round(s.x), y: Math.round(s.y), vx: Math.round(s.vx), vy: Math.round(s.vy),
            z: (s.z != null ? Math.round(s.z * 10) / 10 : undefined),
            heading: Math.round(s.heading), shipName: s.shipName, shipClass: (s.shipClass != null ? s.shipClass : undefined), hp: (s.hp != null ? s.hp : undefined), bot: s.bot || undefined,
            npcs: (Array.isArray(s.npcs) && s.npcs.length) ? s.npcs.slice(0, 64) : undefined };   // v2169 -- owned npc states
    }
    leavePacket() { return { type: "leave", id: this.localId }; }
}

// Same-machine multi-tab transport (no server).
function broadcastTransport(room = "default") {
    let bc = null, cb = null;
    try { bc = new BroadcastChannel("swek-ev:" + room); bc.onmessage = (e) => cb && cb(e.data); } catch (_) { bc = null; }
    return { kind: "broadcast", send: (m) => { try { if (bc) bc.postMessage(m); } catch (_) {} }, onMessage: (f) => { cb = f; }, close: () => { try { if (bc) bc.close(); } catch (_) {} } };
}

// Cross-network transport against the rendezvous presence room.
function httpPresenceTransport(baseUrl, room, id, opts = {}) {
    const tok = opts.token ? "&token=" + encodeURIComponent(opts.token) : "";
    const qs = "room=" + encodeURIComponent(room);
    let cb = null, timer = null, closed = false;
    const post = (m) => fetch(baseUrl + "/presence?" + qs + tok, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(m) }).catch(() => {});
    async function poll() {
        if (closed) return;
        try { const r = await fetch(baseUrl + "/presence?" + qs + "&id=" + encodeURIComponent(id) + tok); if (r.ok) { const j = await r.json(); if (cb) cb({ type: "snapshot", authoritative: true, peers: j.peers || [] }); } } catch (_) {}
        if (!closed) timer = setTimeout(poll, opts.pollMs || 300);
    }
    poll();
    return { kind: "http", send: (m) => post(m), onMessage: (f) => { cb = f; }, close: () => { closed = true; if (timer) clearTimeout(timer); try { post({ type: "leave", id }); } catch (_) {} } };
}

// Glue a manager + transport into the { send, peers, count, close } object the flight view consumes.
function makeNet(mgr, transport, opts = {}) {
    transport.onMessage((m) => mgr.applyMessage(m));
    const prune = setInterval(() => mgr.prune(), opts.pruneMs || 1000);
    return {
        kind: transport.kind,
        send: (state) => transport.send(mgr.localPacket(state)),
        peers: (systemId) => mgr.peersInSystem(systemId),
        count: () => mgr.count(),
        // v2169 -- co-op authority needs the peer SET, not just their positions. Scoped to the system:
        // a pilot three jumps away must not own hostiles they cannot see. Sorted so the list is a set,
        // not an order (esAuthority.ownerOf is order-independent anyway, but callers may compare).
        // Views can disagree for a beat while presence propagates; HRW tolerates that -- the worst case
        // is one npc briefly simulated twice, not a permanent split.
        myId: () => mgr.localId,
        peerIds: (systemId) => [mgr.localId, ...mgr.peersInSystem(systemId).map((p) => p.id)].sort(),
        // v2171 -- the ring for the SHARED world, which is not the same list. HRW only distributes
        // ships every peer spawned identically, and a headless brain never spawned them: it has no
        // universe. Handing it one is how 2 of 8 hostiles froze in v2170. Bots own the wing they
        // spawned (its ids carry their name; see esAuthority.spawnerOf) and nothing else.
        worldPeerIds: (systemId) => [mgr.localId, ...mgr.peersInSystem(systemId).filter((p) => !p.bot).map((p) => p.id)].sort(),
        close: () => { clearInterval(prune); try { transport.close(); } catch (_) {} },
    };
}

// Cross-network transport via Supabase Realtime Broadcast (managed - no server of your own). Loads the supabase-js
// client from a CDN on first use, joins a channel, and relays our presence packets as broadcast events. Free tier
// (~500 MB bandwidth/mo, project pauses after 7 days idle) is fine for a few pilots; revisit if it's exceeded.
// Needs the project URL + a publishable/anon key. Rig-only (browser + a Supabase project + CDN reachable).
function supabaseTransport(url, anonKey, room, id, opts = {}) {
    let cb = null, client = null, channel = null, ready = false, closed = false, queue = [];
    (async () => {
        try {
            const mod = await import(opts.cdn || "https://esm.sh/@supabase/supabase-js@2");
            if (closed) return;
            client = mod.createClient(url, anonKey, { realtime: { params: { eventsPerSecond: 15 } } });
            channel = client.channel("swek-ev-" + room, { config: { broadcast: { self: false } } });
            channel.on("broadcast", { event: "ev" }, (m) => { if (cb && m && m.payload) cb(m.payload); });
            channel.subscribe((status) => {
                if (status === "SUBSCRIBED") { ready = true; for (const p of queue) channel.send({ type: "broadcast", event: "ev", payload: p }); queue = []; }
            });
        } catch (e) { if (opts.onError) opts.onError(e); }
    })();
    const out = (m) => { if (ready && channel) channel.send({ type: "broadcast", event: "ev", payload: m }); else if (queue.length < 30) queue.push(m); };
    return { kind: "supabase", send: out, onMessage: (f) => { cb = f; }, close: () => { closed = true; try { if (channel) out({ type: "leave", id }); if (client && channel) client.removeChannel(channel); } catch (_) {} } };
}

export { PresenceManager, broadcastTransport, httpPresenceTransport, supabaseTransport, makeNet };
