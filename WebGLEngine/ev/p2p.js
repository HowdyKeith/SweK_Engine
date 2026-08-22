// WebGLEngine/ev/p2p.js — WebRTC peer-to-peer presence transport. The egress-free, PREFERRED path: pilots find each
// other through a tiny roster heartbeat on the rendezvous, do the SDP/ICE handshake over the rendezvous /signal
// mailbox, then stream position DIRECTLY to each other over RTCDataChannels. Position never touches the cloud, so
// the only server traffic is the small heartbeat + the one-time handshake - it stays well inside the 1 GB/mo cap.
//
// Plugs into makeNet exactly like the other transports ({ kind, send, onMessage, close }). No TURN is configured
// (only public STUN), so peers behind symmetric NAT may fail to connect directly - that's the P2P trade-off, and the
// relay transports (HTTP rendezvous / Supabase) remain available as fallbacks. Rig-only (needs a browser's
// RTCPeerConnection); the pure decision helpers below are unit-tested.
//
// Milestone: P2P presence.

// Glare avoidance: of any two peers, the one with the lexicographically lower id makes the offer; the other answers.
function shouldInitiate(myId, peerId) { return String(myId) < String(peerId); }

// Given the room roster and who we're already connected to, decide who to dial and who to drop. Pure.
function diffRoster(rosterIds, connectedIds, myId) {
    const roster = new Set(rosterIds.filter((x) => x != null && x !== myId));
    const have = new Set(connectedIds);
    const add = [], remove = [];
    for (const id of roster) if (!have.has(id)) add.push(id);
    for (const id of connectedIds) if (!roster.has(id)) remove.push(id);
    return { add, remove };
}

function p2pTransport(baseUrl, room, id, opts = {}) {
    const ICE = opts.iceServers || [{ urls: "stun:stun.l.google.com:19302" }];
    const tok = opts.token ? "&token=" + encodeURIComponent(opts.token) : "";
    const qs = "room=" + encodeURIComponent(room);
    let cb = null, closed = false, rosterTimer = null, signalTimer = null;
    const peers = new Map();   // peerId -> { pc, dc }

    const post = (path, b) => fetch(baseUrl + path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) }).catch(() => {});
    const sig = (to, kind, data) => post("/signal?" + qs + tok, { to, from: id, kind, data });

    function wireChannel(dc) { dc.onmessage = (e) => { if (cb) { try { cb(JSON.parse(e.data)); } catch (_) {} } }; }
    function makePeer(peerId) {
        const pc = new RTCPeerConnection({ iceServers: ICE });
        const entry = { pc, dc: null }; peers.set(peerId, entry);
        pc.onicecandidate = (e) => { if (e.candidate) sig(peerId, "ice", e.candidate); };
        pc.onconnectionstatechange = () => { const s = pc.connectionState; if (s === "failed" || s === "closed" || s === "disconnected") dropPeer(peerId); };
        pc.ondatachannel = (e) => { entry.dc = e.channel; wireChannel(entry.dc); };
        return entry;
    }
    async function dial(peerId) {
        const entry = makePeer(peerId);
        const dc = entry.pc.createDataChannel("ev"); entry.dc = dc; wireChannel(dc);
        const offer = await entry.pc.createOffer(); await entry.pc.setLocalDescription(offer);
        sig(peerId, "offer", entry.pc.localDescription);
    }
    async function onSignal(msg) {
        const from = msg && msg.from; if (!from || from === id) return;
        let entry = peers.get(from);
        try {
            if (msg.kind === "offer") {
                if (!entry) entry = makePeer(from);
                await entry.pc.setRemoteDescription(msg.data);
                const ans = await entry.pc.createAnswer(); await entry.pc.setLocalDescription(ans);
                sig(from, "answer", entry.pc.localDescription);
            } else if (msg.kind === "answer") { if (entry) await entry.pc.setRemoteDescription(msg.data); }
            else if (msg.kind === "ice") { if (entry && msg.data) await entry.pc.addIceCandidate(msg.data); }
        } catch (_) {}
    }
    function dropPeer(peerId) {
        const e = peers.get(peerId); if (!e) return;
        try { if (e.dc) e.dc.close(); } catch (_) {} try { e.pc.close(); } catch (_) {}
        peers.delete(peerId); if (cb) cb({ type: "leave", id: peerId });
    }

    async function rosterTick() {
        if (closed) return;
        post("/presence?" + qs + tok, { type: "presence", id, name: opts.name || "", roster: true });   // discovery heartbeat (no position)
        try {
            const r = await fetch(baseUrl + "/presence?" + qs + "&id=" + encodeURIComponent(id) + tok);
            if (r.ok) { const j = await r.json(); const ids = (j.peers || []).map((p) => p.id).filter(Boolean);
                const { add, remove } = diffRoster(ids, [...peers.keys()], id);
                for (const pid of add) if (shouldInitiate(id, pid)) dial(pid).catch(() => {});
                for (const pid of remove) dropPeer(pid);
            }
        } catch (_) {}
        if (!closed) rosterTimer = setTimeout(rosterTick, opts.rosterMs || 2500);
    }
    async function signalTick() {
        if (closed) return;
        try { const r = await fetch(baseUrl + "/signal?id=" + encodeURIComponent(id) + tok); if (r.ok) { const j = await r.json(); for (const m of (j.msgs || [])) await onSignal(m); } } catch (_) {}
        if (!closed) signalTimer = setTimeout(signalTick, opts.signalMs || 700);
    }
    rosterTick(); signalTick();

    return {
        kind: "p2p",
        send: (m) => { const s = JSON.stringify(m); for (const e of peers.values()) if (e.dc && e.dc.readyState === "open") { try { e.dc.send(s); } catch (_) {} } },
        onMessage: (f) => { cb = f; },
        connections: () => peers.size,
        close: () => { closed = true; if (rosterTimer) clearTimeout(rosterTimer); if (signalTimer) clearTimeout(signalTimer); for (const pid of [...peers.keys()]) dropPeer(pid); post("/presence?" + qs + tok, { type: "leave", id }); },
    };
}

export { shouldInitiate, diffRoster, p2pTransport };
