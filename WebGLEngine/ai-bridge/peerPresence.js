// FILE: ai-bridge/peerPresence.js
// VERSION: v1 - sticky peer presence (Round C #8)
//
// Any sighting of a peer - a discovery beacon, a saved entry, or an active inbound link - marks it "present" for a grace
// window. So a brief gap in ONE source (the classic case: a "linked" peer whose inbound link blips for a scan) no longer
// drops it off the list/count and pops it back. This is the list/gauge equivalent of the radar's blip-persistence: we
// hold memory that a recently-seen peer is still there instead of trusting a single momentary scan.
//
// Pure + clock-injectable so it unit-tests headless.

class PeerPresence {
    constructor(opts = {}) {
        this.graceMs = opts.graceMs || 40000;          // remember a peer this long after its last sighting
        this.now = opts.now || (() => Date.now());      // injectable clock for tests
        this._seen = new Map();                         // url -> { url, lastSeen, info }
    }

    // Record a sighting. `info` is merged (so caps/ip accumulated across sources are kept).
    mark(url, info) {
        if (!url) return;
        const u = String(url);
        const e = this._seen.get(u) || { url: u, info: {} };
        e.lastSeen = this.now();
        if (info && typeof info === "object") e.info = Object.assign(e.info || {}, info);
        this._seen.set(u, e);
    }

    // Peers seen within the grace window, most-recently-seen first. Expired entries are pruned as a side effect.
    list(graceMs) {
        const g = graceMs || this.graceMs, t = this.now(), out = [];
        for (const [u, e] of this._seen) {
            const age = t - e.lastSeen;
            if (age <= g) out.push({ url: u, lastSeen: e.lastSeen, agoMs: age, info: e.info || {} });
            else this._seen.delete(u);
        }
        out.sort((a, b) => a.agoMs - b.agoMs);
        return out;
    }

    has(url, graceMs) { const e = this._seen.get(String(url)); return !!e && (this.now() - e.lastSeen) <= (graceMs || this.graceMs); }
    size() { return this._seen.size; }
}

module.exports = { PeerPresence };
