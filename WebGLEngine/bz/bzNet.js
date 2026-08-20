// WebGLEngine/bz/bzNet.js — a tank on the wire.
//
// Round five put the GPU Brain in a room. This is what the browser needs to join it, and it is small,
// because none of the hard parts are BZFlag's. `ev/presence.js` carries the tank; `ev/esAuthority.js`
// carries the damage. Both were written for a game about spaceships and neither had to change.
//
// THE RULE, unchanged since the Endless Sky co-op layer: a peer may SHOOT anything, and may only APPLY
// damage to what it OWNS. A tank's id is `<peerId>:0` -- a private wing of one -- so `ownerOf` hands it
// straight back to its pilot without a hash. When your shot lands on somebody else's tank you do not kill
// it. You report the hit, addressed to them, and they decide what it did.
//
// Everything here is pure so bz/tools/bz-net-selfcheck.mjs can prove it, and so bz/tools/bz-live-probe.mjs
// can play the browser's part with no browser: a headless peer that fires at a real brain process and gets
// killed by it uses exactly this file.

"use strict";

import { wingId, damageEvent, validateDamage, noteAccepted } from "../ev/esAuthority.js";
import { pointInTank } from "./bzCombat.js";

const SYSTEM = 0;               // a .bzw is one world; presence scopes by `system`, and a tank lives in 0
const DEG = 180 / Math.PI;
const RAD = Math.PI / 180;
const MAX_INBOUND = 256;        // a flood costs a frame's worth of events, never the loop

// A tank's id. One tank per peer, so the wing is a wing of one.
function tankId(peerId) { return wingId(peerId, 0); }

// What we put on the presence packet. `heading` goes out in DEGREES because presence rounds it to an
// integer, and a radian rounded to an integer is not a heading at all -- it is 0 or 1.
function packTank(tank, name) {
    return {
        name: name || "tank", system: SYSTEM,
        x: tank.pos[0], y: tank.pos[1], z: tank.pos[2],
        vx: 0, vy: 0,
        heading: Math.round(tank.angle * DEG),
        hp: tank.dead ? 0 : 100,
    };
}

// The other tanks in the room, shaped the way bz/bzPilot.js and bz/bzCombat.js want them. A peer's
// `heading` came back as degrees; its box has to be turned the same way ours is, or a shot down its flank
// misses and a shot at its nose hits.
function peerTanks(peers, myId, spec) {
    const out = [];
    for (const p of peers) {
        if (p.id === myId) continue;
        out.push({
            id: p.id,
            tankId: tankId(p.id),
            pos: [p.x, p.y, p.z != null ? p.z : 0],
            angle: (p.heading || 0) * RAD,
            spec,
            dead: p.hp === 0,
            onGround: p.z == null || p.z <= 0.01,
            bot: !!p.bot,
            name: p.name,
        });
    }
    return out;
}

function makeNetState() {
    return {
        seq: 0,               // our own damage sequence. Never restarts: a peer's replay guard drops any
        seen: new Map(),      // sequence it has already passed, so a reset would make every hit look stale.
        inbox: [],
        prevHp: new Map(),
    };
}

// Our shots, against their tanks. A hit is CONSUMED here -- the shot dies on our screen the moment it
// lands -- and reported. We never touch their hull.
function reportHits(shots, ghosts, myId, state, nowMs) {
    const events = [];
    for (const s of shots) {
        if (s.dead) continue;
        for (const g of ghosts) {
            if (g.dead) continue;
            if (!pointInTank(s.pos, g)) continue;
            events.push(damageEvent(g.tankId, myId, ++state.seq, 1, 0, SYSTEM, nowMs));
            s.dead = true;
            break;
        }
    }
    return events;
}

// Queue an event addressed to anybody. Bounded, because the sender may be hostile or merely broken.
function queueDamage(state, ev) {
    if (!ev || ev.npcId == null) return false;
    if (ev.system != null && ev.system !== SYSTEM) return false;
    if (state.inbox.length >= MAX_INBOUND) return false;
    state.inbox.push(ev);
    return true;
}

// Drain the queue. `validateDamage` is the suspicious part -- ownership, finiteness, a cap, a per-shooter
// replay guard -- and everything it rejects is dropped in silence. A peer with a bug should cost us
// nothing, and a peer with malice should cost us nothing either.
//
// The amount is ignored on purpose. One shot kills. Sending a number that MEANS "definitely fatal" is how
// v2184's shooter tripped validateDamage's 2000 cap and killed nobody for sixteen straight hits.
function ingestDamage(state, myTankId, myId, peerIds) {
    const q = state.inbox;
    state.inbox = [];
    let killedBy = null, taken = 0, dropped = 0;
    for (const ev of q) {
        const v = validateDamage(ev, myId, peerIds, { seen: state.seen, maxDamage: 2000 });
        if (!v.ok) { dropped++; continue; }
        noteAccepted(state.seen, ev);
        if (ev.npcId !== myTankId) { dropped++; continue; }   // somebody else's tank, somebody else's problem
        taken++;
        if (!killedBy) killedBy = String(ev.from);
    }
    return { killedBy, taken, dropped };
}

// Which peers died since the last look. A peer's hp reaching zero in front of us is a kill; a peer who
// merely LEAVES is not, and scores nothing. Mutates `state.prevHp`, and forgets anyone who left.
function deadPeers(state, peers) {
    const out = [], live = new Set();
    for (const p of peers) {
        if (p.id == null || p.hp == null) continue;
        live.add(p.id);
        const was = state.prevHp.get(p.id);
        if (was != null && was > 0 && p.hp <= 0) out.push(p.id);
        state.prevHp.set(p.id, p.hp);
    }
    for (const id of [...state.prevHp.keys()]) if (!live.has(id)) state.prevHp.delete(id);
    return out;
}

export { SYSTEM, MAX_INBOUND, tankId, packTank, peerTanks, makeNetState, reportHits, queueDamage, ingestDamage, deadPeers };
if (typeof module !== "undefined" && module.exports)
    module.exports = { SYSTEM, MAX_INBOUND, tankId, packTank, peerTanks, makeNetState, reportHits, queueDamage, ingestDamage, deadPeers };
