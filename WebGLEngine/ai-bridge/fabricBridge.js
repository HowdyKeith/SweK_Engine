// ai-bridge/fabricBridge.js — backend for the "fabric" showpiece (fabric.html).
// It exposes the three things the page needs to make the architecture VISIBLE, all real:
//   1) identity()      — who am I (box name) + is a tunnel active (can a remote viewer see me).
//   2) runOnPeer(...)  — forward the SAME computation to a peer's bridge server-side (no CORS) and
//                        return the peer's answer + the peer's box name (proves it moved boxes).
//   3) shared state    — a tiny in-memory blackboard any device can read/write (proves cross-device
//                        control: a phone POSTs the input, this page GETs it and recomputes).
"use strict";
const crypto = require("crypto");

// --- the one trivial, verifiable computation threaded through every hop: sha256(input) ---
// Same input -> same hash everywhere (proves it's the identical computation); the accompanying
// box name changes per hop (proves WHERE it ran).
function compute(input) {
    return crypto.createHash("sha256").update(String(input == null ? "" : input), "utf8").digest("hex");
}

// tiny in-memory shared blackboard (not persisted — it's a live control channel, not storage)
const _state = { input: "hello fabric", by: "", at: 0, seq: 0 };
function getState() { return { ..._state }; }
function setState(input, by) {
    _state.input = String(input == null ? "" : input).slice(0, 200);
    _state.by = String(by || "someone").slice(0, 60);
    _state.at = Date.now();
    _state.seq++;
    return getState();
}

module.exports = (deps) => {
    // deps: { peerIdentity, loadPeers, selfTunnelUrl, PORT }
    const { peerIdentity, loadPeers, selfTunnelUrl } = deps;

    function identity() {
        let name = "this box", id = "";
        try { const s = peerIdentity.self(); name = s.name || name; id = s.id || ""; } catch (e) {}
        let tunnel = "";
        try { tunnel = selfTunnelUrl() || ""; } catch (e) {}
        return { name, id, tunnel, hasTunnel: !!tunnel };
    }

    function peers() {
        let list = [];
        try { list = (loadPeers() || []).map(u => String(u).replace(/\/+$/, "")); } catch (e) {}
        return Array.from(new Set(list));
    }

    // v2290 -- MESH FORK-BOMB FIX. /fabric/whoami used to call livePeers(), which fetches /fabric/whoami on
    // every peer -- and each of THOSE hits re-ran livePeers on the receiving box, fanning out again. One hit
    // became N, then N^2, cascading across the fleet until the ephemeral port pool was exhausted (SYN_SENT
    // flood -> browser can't even reach localhost -> ERR_CONNECTION_REFUSED). Two guards break it: (1) probe
    // peers with ?probe=1 so the receiver returns identity ONLY and does NOT fan out again (recursion stops at
    // depth 1), and (2) cache the live-peer result for 30s so a burst of whoami hits can't re-storm.
    // v2291 -- two more: (3) DEAD-PEER BACKOFF: a peer that fails to answer is skipped on future sweeps with
    // exponential backoff (30s, 60s, 2m, ... capped 15m), so we stop hammering offline boxes every cycle and
    // stop piling SYN_SENT to the dead ones. (4) SELF-EXCLUSION: if a probe comes back with our own identity
    // id, drop it -- never connect to / list ourselves (that was the source of the CLOSE_WAIT-to-self pile).
    const _peerHealth = new Map();   // url -> { fails, nextTry }
    let _livePeersCache = { at: 0, val: [] };
    // v2292 -- opts.force (set by explicit user actions like "Pull from peer now") bypasses BOTH the 30s cache
    // AND the dead-peer backoff, so a just-recovered peer that was backed off during a fleet restart is still
    // tried immediately. Automatic sweeps pass nothing and keep the cache + backoff.
    async function livePeers(opts) {
        const force = !!(opts && opts.force);
        const now = Date.now();
        if (!force && now - _livePeersCache.at < 30000) return _livePeersCache.val;
        let myId = ""; try { myId = (peerIdentity.self() || {}).id || ""; } catch (e) {}
        const all = peers().filter((base) => { if (force) return true; const h = _peerHealth.get(base); return !(h && h.nextTry > now); });   // skip backed-off dead peers unless forced
        const checks = await Promise.all(all.map(async (base) => {
            try {
                const w = await fetch(base + "/fabric/whoami?probe=1", { signal: AbortSignal.timeout(2500) }).then(r => r.json()).catch(() => null);
                if (w && (w.ok || w.name)) {
                    _peerHealth.delete(base);                                   // reachable -> clear any backoff
                    if (myId && w.id && w.id === myId) return null;            // that's us -- never list/connect self
                    return { url: base, name: w.name || base };
                }
            } catch (e) {}
            const h = _peerHealth.get(base) || { fails: 0 };                    // unreachable -> exponential backoff
            h.fails++;
            h.nextTry = now + Math.min(15 * 60 * 1000, 30000 * Math.pow(2, h.fails - 1));
            _peerHealth.set(base, h);
            return null;
        }));
        const live = checks.filter(Boolean);
        _livePeersCache = { at: now, val: live };   // a forced probe also refreshes the cache for everyone
        return live;
    }

    // Forward compute to a peer: hit the peer's /wasm/sha256 (already exists) for the value, and its
    // /fabric/whoami for the box name. Returns { ok, peer, name, hash } — the SAME hash we'd get here.
    async function runOnPeer(peerUrl, input) {
        const base = String(peerUrl || "").replace(/\/+$/, "");
        if (!/^https?:\/\//.test(base)) return { ok: false, error: "bad peer url" };
        try {
            const timeout = (ms) => AbortSignal.timeout(ms);
            // /fabric/compute returns { hash, by:<peer box name> } — one cheap call, no peer-side probing.
            const res = await fetch(base + "/fabric/compute", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ input }), signal: timeout(6000) }).then(r => r.json()).catch(() => null);
            const hash = res && res.hash;
            if (!hash) return { ok: false, error: "peer did not return a hash (is it a SweK bridge?)", peer: base };
            return { ok: true, peer: base, name: (res && res.by) || base, hash, verified: true };
        } catch (e) { return { ok: false, error: String((e && e.message) || e), peer: base }; }
    }

    return { compute, identity, peers, livePeers, runOnPeer, getState, setState };
};
