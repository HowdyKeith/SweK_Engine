// fx/avatar/fleetReactions.js -- Avataro reacts to the REAL fleet. When one of your machines sails in, it waves; when
// one drops off, it nods; when the herd is with it, the herd perks up too. It rides the same FleetTracker the server
// dashboard uses -- the pure state machine that dedupes arrivals and debounces LAN flapping -- so the avatar never
// waves twice at the same peer and never twitches when a peer briefly blinks. The poller is injectable, so the mapping
// and the firing are verifiable headless, without a network.
"use strict";
import { FleetTracker } from "../../brain/fleet/fleetTracker.js";

// what a fleet event makes the avatar (and the herd) do
const FLEET_MOVES = { in: "wave", out: "nod" };
const HERD_MOVES = { in: "perk", out: "wag" };

function makeFleetReactor(avatar, opts = {}) {
    const tracker = new FleetTracker({ missThreshold: opts.missThreshold || 3 });
    const fetchPeers = opts.fetchPeers || (async () => {
        const r = await fetch("/sys/peer-versions", { cache: "no-store" }).then(r => r.json());
        const peers = (r && (r.peers || r.list)) || [];
        return peers.map(p => ({ id: p.url || p.name, name: p.name || p.url }));
    });
    const whoami = opts.whoami || (async () => { try { const j = await fetch("/self/whoami").then(r => r.json()); return j && (j.name || j.id); } catch (e) { return null; } });
    const herd = opts.herd || null;
    const onEvent = opts.onEvent || null;
    let selfSet = false, names = new Map();

    function moveFor(evt) { return FLEET_MOVES[evt.verb] || null; }
    // one poll: read who's present, let the tracker decide the transitions, react to each
    async function poll() {
        if (!selfSet) { const me = await whoami(); if (me) tracker.setSelf(me); selfSet = true; }   // never react to ourselves sailing in
        let peers = [];
        try { peers = await fetchPeers(); } catch (e) { return []; }
        for (const p of peers) names.set(p.id, p.name || p.id);
        const events = tracker.observe(peers.map(p => p.id));
        for (const e of events) {
            const mv = moveFor(e); if (mv) avatar.react(mv);
            if (herd && herd.members) { const hm = HERD_MOVES[e.verb]; if (hm) for (const m of herd.members) if (Math.random() < 0.6) m.pet.react(hm); }
            if (onEvent) onEvent({ verb: e.verb, peer: e.peer, name: names.get(e.peer) || e.peer, move: mv });
        }
        return events;
    }
    function start(ms = 4000) { const t = setInterval(poll, ms); poll(); return () => clearInterval(t); }
    return { poll, start, tracker, moveFor, FLEET_MOVES, HERD_MOVES };
}
export { makeFleetReactor, FLEET_MOVES, HERD_MOVES };
