// brain/fleet/fleetTracker.js -- v2221 -- when a peer "sails into the fleet".
//
// The pure state machine behind the fleet-membership events. Feed it the set of peers that
// are present right now (each poll); it returns the TRANSITIONS -- a peer that just arrived
// ("in") or one that has been gone long enough to count as departed ("out"). Everything that
// could be wrong lives here (dedup so a peer sails in ONCE, and a miss-count debounce so a
// peer that briefly flaps on the LAN does not spam sail-in/sail-out), which is why it is a
// DOM-free module the selfcheck can drive directly. server.html feeds it the peer roster;
// the events drive the activity line, the peer-list badge, and the announce to peers.
//
// Peers are keyed by a STABLE id (their URL) so display-name changes never look like a
// re-arrival. The caller carries names for display separately.

export class FleetTracker {
    constructor(opts = {}) {
        this.missThreshold = Math.max(1, opts.missThreshold ?? 3);   // consecutive absences before "out"
        this.self = opts.self != null ? String(opts.self) : null;    // the local node -- never sails in/out of its own fleet
        this.run = null;
        this._in = new Map();      // id -> { misses }
    }

    // Start a fresh membership run. A peer can sail in again in a new run.
    beginRun(runId) {
        this.run = String(runId || ("run-" + Date.now().toString(36)));
        this._in.clear();
        return this.run;
    }

    // End the run: everyone still aboard "sails out".
    endRun() {
        const now = Date.now();
        const out = [...this._in.keys()].map((id) => ({ kind: "fleet", verb: "out", peer: id, run: this.run, at: now }));
        this._in.clear();
        this.run = null;
        return out;
    }

    inSet() { return [...this._in.keys()]; }
    isIn(id) { return this._in.has(String(id)); }
    // Tell the tracker which id is the local node; it will never emit sail-in/out for itself. Safe to call late.
    setSelf(id) { this.self = id != null ? String(id) : null; if (this.self) this._in.delete(this.self); return this; }

    // Observe the ids present RIGHT NOW. Returns the transition events since last observe().
    observe(present) {
        if (!this.run) this.beginRun();
        const now = Date.now();
        const set = new Set((present || []).map(String));
        if (this.self != null) set.delete(this.self);   // you are always aboard your own fleet -- don't toast yourself in/out
        const events = [];

        // arrivals: an id we have not counted as aboard -> sail in (once)
        for (const id of set) {
            const st = this._in.get(id);
            if (!st) { this._in.set(id, { misses: 0 }); events.push({ kind: "fleet", verb: "in", peer: id, run: this.run, at: now }); }
            else { st.misses = 0; }               // still here -> reset its absence count (survives a flap)
        }
        // departures: an aboard id that is absent this poll -> count a miss; only "out" past the threshold
        for (const [id, st] of [...this._in]) {
            if (set.has(id)) continue;
            st.misses++;
            if (st.misses >= this.missThreshold) { this._in.delete(id); events.push({ kind: "fleet", verb: "out", peer: id, run: this.run, at: now }); }
        }
        return events;
    }
}
