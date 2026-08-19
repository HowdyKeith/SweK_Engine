// WebGLEngine/ev/esAuthority.js — who owns what, in ES co-op.
//
// presence.js is explicit about its scope: "co-op PRESENCE, not authoritative combat". Peers are drawn
// as ghosts, but each client spawns its OWN hostiles, so two pilots in the same system are fighting
// different ships. Transport is not the problem — there are already four of them, WebRTC P2P included.
// AUTHORITY is the problem, and it has exactly two halves:
//
//   1. everyone must see the SAME npcs          -> deterministic spawn from a shared seed
//   2. exactly one peer must SIMULATE each npc  -> deterministic ownership from the peer set
//
// Both are solved here, with no server and no election protocol: every peer computes the same answer
// from information they all already have. That matters because the standing rule is P2P-first, and an
// election needs a coordinator.
//
// OWNERSHIP USES RENDEZVOUS (HIGHEST-RANDOM-WEIGHT) HASHING, not `peers[hash % n]`. The modulo scheme
// looks equivalent and is not: when one pilot jumps out, `n` changes and EVERY npc is reassigned, so
// the whole system stutters as ownership churns. Under HRW only the departed peer's npcs move — about
// 1/n of them. That property is tested below, because it is the entire reason for the added arithmetic.
//
// Everything here is pure and deterministic. Same inputs, same answer, on every machine.

"use strict";

// --- deterministic RNG ------------------------------------------------------------------
// mulberry32: small, fast, and — the only property that matters here — identical everywhere.
// combat.js already takes an injectable `rnd`, so a seeded stream makes spawnFromDudes reproducible.
function makeRng(seed) {
    let a = (seed >>> 0) || 1;
    return function rnd() {
        a |= 0; a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

// FNV-1a over a string. Stable across machines and JS engines (32-bit, no floats).
function hashStr(s) {
    let h = 0x811c9dc5;
    const str = String(s);
    for (let i = 0; i < str.length; i++) {
        h ^= str.charCodeAt(i) & 0xff;
        h = Math.imul(h, 0x01000193);
    }
    return h >>> 0;
}

// The seed every peer in a room derives for a given system. Room + system, nothing else: no clock, no
// peer list. Two pilots who jump into the same system an hour apart still meet the same hostiles.
function spawnSeed(room, systemId) { return hashStr(String(room) + "|" + String(systemId)); }

// --- ownership: rendezvous hashing -------------------------------------------------------
// weight(npc, peer) is a pure hash; the peer with the highest weight owns the npc. Ties broken by id
// so the answer is total, not merely probable.
//
// v2168 -- the first version was hashStr(npcId + "@" + peerId), and the selfcheck's own distribution
// test caught it: with peers "a".."d" the last peer owned 49.4% of npcs and a departure churned 49.2%
// of them — almost exactly the modulo failure this whole scheme exists to avoid. FNV over strings that
// differ only in their final characters produces correlated hashes, so concatenating peer id onto npc
// id leaks that correlation straight into the weight. Hash the two INDEPENDENTLY, combine with an odd
// multiplier, then run a murmur3 finalizer to avalanche the bits.
function weight(npcId, peerId) {
    let h = hashStr(npcId) ^ Math.imul(hashStr(peerId), 0x9E3779B1);
    h ^= h >>> 16; h = Math.imul(h, 0x85EBCA6B);
    h ^= h >>> 13; h = Math.imul(h, 0xC2B2AE35);
    h ^= h >>> 16;
    return h >>> 0;
}

// --- private wings: the spawner owns what only it has ------------------------------------
// HRW distributes a world every peer spawned IDENTICALLY. That premise holds for the deterministic
// dude wing (same room + system -> same ships) and it is simply false for anything one peer conjured
// alone: the GPU Brain's hostiles, a mission escort, an npc from a plug-in only one client loaded.
// Hashing those across the ring hands a ship to a peer that has never heard of it.
//
// v2170, measured: one browser + one brain in a room. The ring gave the brain 2 of the browser's 8
// hostiles -- nobody simulated them, so they hung motionless in space -- and gave the browser 5 of the
// brain's 8, for which it had no entity, no stats, and drew nothing. Both halves were silent.
//
// So an id may name its spawner: "<peerId>:<n>". Those are owned by that peer, unconditionally and
// without a hash. Bare ids stay on the ring, unchanged. If the spawner leaves, its wing is owned by
// nobody and goes stale -- which is right, because no survivor has the stats to fly it.
const WING_RE = /^([^:]+):/;
function spawnerOf(npcId) { const m = WING_RE.exec(String(npcId)); return m ? m[1] : null; }
function wingId(peerId, n) {
    const p = String(peerId);
    if (p.indexOf(":") >= 0) throw new Error("peer id must not contain ':' -- it is the wing separator");
    return p + ":" + n;
}

// v2172 -- move a freshly spawned group into this peer's private wing, in place. For ships that ONLY
// this client has: mission npcs (gated on a mission state nobody else shares), unique persons (gated
// on whether THIS player has killed them). Ambient traffic is not namespaced -- it is deterministic
// from (room, system), so every peer spawns it identically and it belongs on the ring.
function namespaceWing(entities, peerId, tag) {
    if (!peerId || !Array.isArray(entities)) return entities || [];
    for (const e of entities) if (e && e.id != null) e.id = wingId(peerId, String(tag || "") + e.id);
    return entities;
}

function ownerOf(npcId, peerIds) {
    const sp = spawnerOf(npcId);
    if (sp) return sp;                                     // a private wing needs no election
    if (!Array.isArray(peerIds) || !peerIds.length) return null;
    let best = null, bestW = -1;
    for (const p of peerIds) {
        if (p == null) continue;
        const w = weight(npcId, p);
        if (w > bestW || (w === bestW && String(p) < String(best))) { bestW = w; best = p; }
    }
    return best;
}

// `me` simulates this npc. Everyone else renders it from the owner's broadcasts.
function ownsNpc(me, npcId, peerIds) {
    const o = ownerOf(npcId, peerIds);
    return o != null && String(o) === String(me);
}

// Split a list of npcs into the ones I drive and the ones I merely draw. One pass, no allocation games.
function partition(me, npcs, peerIds) {
    const mine = [], theirs = [];
    for (const n of npcs || []) (ownsNpc(me, n.id, peerIds) ? mine : theirs).push(n);
    return { mine, theirs };
}

// --- damage authority --------------------------------------------------------------------
// A peer may SHOOT anything. A peer may only APPLY damage to what it owns. Otherwise two clients both
// decrement the same hull and the ship dies twice as fast — the classic co-op desync, and it is
// invisible until someone notices kills happening early.
//
// So: a hit on someone else's npc becomes a damage EVENT addressed to the owner. The owner validates
// and applies. This function is the validator, and it is deliberately suspicious.
function validateDamage(ev, me, peerIds, opts = {}) {
    if (!ev || typeof ev !== "object") return { ok: false, reason: "not an object" };
    if (ev.npcId == null) return { ok: false, reason: "no npcId" };
    if (!ownsNpc(me, ev.npcId, peerIds)) return { ok: false, reason: "not my npc" };

    const ds = Number(ev.dmgShield), da = Number(ev.dmgArmor);
    if (!Number.isFinite(ds) || !Number.isFinite(da)) return { ok: false, reason: "damage not finite" };
    if (ds < 0 || da < 0) return { ok: false, reason: "negative damage" };
    const max = opts.maxDamage ?? 10000;
    if (ds + da > max) return { ok: false, reason: "damage above cap" };
    if (ev.from != null && String(ev.from) === String(me)) return { ok: false, reason: "self-reported hit on own npc" };

    // Replay guard: each shooter numbers its own events. An event we have already seen, or one from the
    // future of a sequence we have not reached, is dropped rather than trusted.
    if (opts.seen && ev.from != null && ev.seq != null) {
        const last = opts.seen.get(String(ev.from));
        if (last != null && ev.seq <= last) return { ok: false, reason: "stale or replayed seq" };
    }
    return { ok: true };
}

// Record that we accepted an event, so its sequence can never be replayed.
function noteAccepted(seen, ev) {
    if (!seen || ev.from == null || ev.seq == null) return;
    seen.set(String(ev.from), ev.seq);
}

// The packet a shooter sends when its shot lands on someone else's ship. `seq` is per-shooter and
// strictly increasing for the life of the client; the owner's replay guard is the whole reason it
// exists. Damage is rounded to ints: the wire is JSON, and a hull is not measured in millionths.
function damageEvent(npcId, from, seq, dmgShield, dmgArmor, systemId, nowMs) {
    return {
        type: "npcHit", npcId, from: String(from), seq,
        dmgShield: Math.max(0, Math.round(+dmgShield || 0)),
        dmgArmor: Math.max(0, Math.round(+dmgArmor || 0)),
        system: systemId != null ? systemId : undefined,
        t: nowMs || Date.now(),
    };
}

// Shields absorb first, overflow spills to armor. Returns true if the ship is destroyed.
//
// This is combat.applyDamage's rule, written out rather than imported: esAuthority has no imports by
// design, so a node tool can require it on its own. A copied rule is a rule that can drift, so
// es-damage-selfcheck asserts the two agree across a grid of hulls and damages.
function applyDamageEvent(npc, ev) {
    const total = (+ev.dmgShield || 0) + (+ev.dmgArmor || 0);
    const s = (npc.shield || 0) - total;
    if (s < 0) { npc.armor = (npc.armor || 0) + s; npc.shield = 0; } else npc.shield = s;
    return (npc.armor || 0) <= 0;
}

// --- announcing the dead ------------------------------------------------------------------
// An owner that simply stops broadcasting a ship it killed leaves a corpse flying on every other
// screen: they last heard it alive, and dead-reckon it forever. So a kill is ANNOUNCED for a grace
// window -- long enough to survive a few dropped packets, short enough to keep the packet small.
const DEAD_GRACE_MS = 3000;
function makeDeadBoard() { return new Map(); }
// `by` is the peer whose reported hit finished it. It rides the announcement so the SHOOTER -- who
// swallowed its own shot and never touched the hull -- can finally score the kill it earned. Nobody
// else acts on it: a peer that is not named simply sees a ship die.
function noteDead(board, npc, nowMs, by) {
    if (!board || !npc || npc.id == null) return;
    const t = nowMs || Date.now();
    const pk = { ...packNpc(npc), shield: 0, armor: 0, dead: 1 };
    if (by != null) pk.by = String(by).slice(0, 64);
    board.set(npc.id, { pk, until: t + DEAD_GRACE_MS });
}
function deadPack(board, nowMs) {
    const out = [], t = nowMs || Date.now();
    if (!board) return out;
    for (const [id, v] of board) { if (t > v.until) board.delete(id); else out.push(v.pk); }
    return out;
}

// --- npc state replication ----------------------------------------------------------------
// The owner broadcasts its npcs; everyone else renders ghosts. Two rules keep this honest:
//
//   1. NEVER trust a packet about an npc the sender does not own. Otherwise any peer can teleport
//      your ships, or resurrect the one you just killed. Ownership is computable by the receiver, so
//      there is nothing to negotiate: we simply drop the claim.
//   2. Bound everything. A hostile peer -- or a buggy one -- must not be able to hand us 10,000 npcs
//      or a coordinate of 1e308 and take the frame down with it.
const MAX_NPCS_PER_PACKET = 64;

function packNpc(e) {
    const p = {
        id: e.id,
        x: Math.round(e.x || 0), y: Math.round(e.y || 0),
        vx: Math.round(e.vx || 0), vy: Math.round(e.vy || 0),
        heading: Math.round(e.heading || 0),
        shield: Math.round(e.shield || 0), armor: Math.round(e.armor || 0),
        dead: e.dead ? 1 : undefined,
    };
    // v2252 -- INTENT: the maneuver the owner is applying (turn -1|0|1, thrust 0|1) plus the three flight
    // stats needed to replay it. With these a receiver traces the CURVED path via the flight model instead
    // of a straight velocity ray, so one broadcast stays honest for seconds, not the ~0.5s a ray survives.
    if (e._intent) {
        p.tu = e._intent.tu | 0;
        p.tt = e._intent.tt ? 1 : 0;
        const st = e.stats;
        if (st) { p.st = Math.round(st.turn || 0); p.sa = Math.round(st.accel || 0); p.ss = Math.round(st.speed || 0); }
    }
    return p;
}

// Owner-side: what I broadcast this tick. Only what I own, only what exists.
function packNpcs(npcs, me, peerIds) {
    const out = [];
    for (const e of npcs || []) {
        if (!e || e.id == null) continue;
        if (!ownsNpc(me, e.id, peerIds)) continue;
        out.push(packNpc(e));
        if (out.length >= MAX_NPCS_PER_PACKET) break;
    }
    return out;
}

const finite = (v) => (Number.isFinite(+v) ? +v : 0);

function sanitizeNpc(n) {
    if (!n || n.id == null) return null;
    const lim = 1e7;                       // a system is not a million units across; anything bigger is junk
    const c = (v) => Math.max(-lim, Math.min(lim, finite(v)));
    const r = {
        id: n.id, x: c(n.x), y: c(n.y), vx: c(n.vx), vy: c(n.vy),
        heading: finite(n.heading), shield: Math.max(0, finite(n.shield)), armor: Math.max(0, finite(n.armor)),
        dead: !!n.dead,
        by: n.by != null ? String(n.by).slice(0, 64) : undefined,   // v2172 -- kill credit; bounded like everything else
    };
    // v2252 -- intent passthrough (optional): turn is clamped to the flight model's own -1..1, thrust to 0/1,
    // the three stats to non-negative. A junk-filled intent degrades to the linear ghost, never to nonsense.
    if (n.tu != null && n.st != null) {
        r.tu = Math.max(-1, Math.min(1, finite(n.tu)));
        r.tt = n.tt ? 1 : 0;
        r.st = Math.max(0, finite(n.st)); r.sa = Math.max(0, finite(n.sa)); r.ss = Math.max(0, finite(n.ss));
    }
    return r;
}

// Receiver-side: fold every peer's broadcast into one id -> state map, dropping any claim the sender
// has no authority over. `packets` is [{ from, npcs, t }].
function mergeRemoteNpcs(packets, me, peerIds, opts = {}) {
    const out = new Map();
    let dropped = 0, taken = 0;
    for (const pk of packets || []) {
        if (!pk || pk.from == null || !Array.isArray(pk.npcs)) continue;
        if (String(pk.from) === String(me)) continue;                 // our own echo
        let n = 0;
        for (const raw of pk.npcs) {
            if (++n > MAX_NPCS_PER_PACKET) break;
            const s = sanitizeNpc(raw);
            if (!s) { dropped++; continue; }
            // THE rule: the sender must own what it claims.
            if (!ownsNpc(pk.from, s.id, peerIds)) { dropped++; continue; }
            s.t = pk.t || opts.now || Date.now();
            const prev = out.get(s.id);
            if (!prev || s.t >= prev.t) out.set(s.id, s);              // freshest wins
            taken++;
        }
    }
    return { states: out, taken, dropped };
}


// A non-owned npc is dead-reckoned from the last state its owner sent. We extrapolate position only:
// guessing at heading or hull state invents facts, and a ghost that shoots is a ghost that desyncs.
function ghostAt(state, nowMs) {
    if (!state) return null;
    const dt = Math.max(0, (nowMs - (state.t || nowMs))) / 1000;
    const cap = 0.5;                                  // never extrapolate more than half a second
    const k = Math.min(dt, cap);
    return {
        id: state.id, x: (state.x || 0) + (state.vx || 0) * k, y: (state.y || 0) + (state.vy || 0) * k,
        heading: state.heading || 0, shield: state.shield, armor: state.armor,
        dead: !!state.dead, by: state.by, ghost: true, stale: dt > cap,
    };
}

// v2252 -- owner-side: broadcast a ship only when its INTENT changed since we last sent it, or a keepalive
// window has elapsed (a re-anchor even when nothing changed). `memo` is caller-held per-ship state. This is
// the bandwidth win: a fleet holding steady courses goes quiet, and receivers extrapolate the silent gaps.
// NOTE: safe to adopt ONLY once receivers retain ghosts across ticks (see retainGhosts); otherwise a ship
// that isn't re-sent would vanish from a consumer that rebuilds purely from the current packet.
function intentKeyOf(e) {
    const dead = e && e.dead ? 1 : 0;
    return (e && e._intent) ? ((e._intent.tu | 0) + "|" + (e._intent.tt ? 1 : 0) + "|" + dead) : ("s|" + dead);
}
function packNpcsDirty(npcs, me, peerIds, memo, nowMs, keepaliveMs = 1000) {
    memo = memo || {};
    const out = [];
    for (const e of npcs || []) {
        if (!e || e.id == null || !ownsNpc(me, e.id, peerIds)) continue;
        const k = intentKeyOf(e), prev = memo[e.id];
        if (prev && prev.k === k && (nowMs - prev.t) < keepaliveMs) continue;   // unchanged + within keepalive -> stay quiet
        memo[e.id] = { k, t: nowMs };
        out.push(packNpc(e));
        if (out.length >= MAX_NPCS_PER_PACKET) break;
    }
    return out;
}

// v2252 -- consumer-side companion to packNpcsDirty: keep last-known ghosts across ticks so a ship that was
// not re-sent this tick does not blink out. Merges `fresh` (a Map from mergeRemoteNpcs) into a caller-held
// `store`, then drops any entry whose owner has left the ring, that the owner marked dead, or that has aged
// past ttl. Under the every-tick pack this is a no-op (every ship is fresh each tick); it only changes
// behaviour once owners go quiet between intent changes. Returns the live Map.
function retainGhosts(store, fresh, peerIds, nowMs, ttlMs = 3000) {
    store = store || new Map();
    if (fresh && typeof fresh.forEach === "function") fresh.forEach((v, id) => { const s = Object.assign({}, v); if (!(s.t > 0)) s.t = nowMs; store.set(id, s); });
    const havePeers = Array.isArray(peerIds) && peerIds.length;
    for (const [id, s] of store) {
        const owner = spawnerOf(id);
        const ownerGone = havePeers && owner && !peerIds.some((p) => String(p) === String(owner));
        if (s.dead || ownerGone || (nowMs - (s.t || 0)) > ttlMs) store.delete(id);
    }
    return store;
}

export { makeRng, hashStr, spawnSeed, ownerOf, ownsNpc, partition, validateDamage, noteAccepted, ghostAt, weight,
    packNpc, packNpcs, packNpcsDirty, retainGhosts, sanitizeNpc, mergeRemoteNpcs, MAX_NPCS_PER_PACKET,
    spawnerOf, wingId, namespaceWing, damageEvent, applyDamageEvent, makeDeadBoard, noteDead, deadPack, DEAD_GRACE_MS };

// ESM for the browser (flightView imports it); CJS guard so node tooling can require it too. Unlike
// brain/tacticsPolicy.js, no CJS bridge requires this file, so ESM-first is safe here.
if (typeof module !== "undefined" && module.exports)
    module.exports = { makeRng, hashStr, spawnSeed, ownerOf, ownsNpc, partition, validateDamage, noteAccepted, ghostAt, weight,
    packNpc, packNpcs, packNpcsDirty, retainGhosts, sanitizeNpc, mergeRemoteNpcs, MAX_NPCS_PER_PACKET,
    spawnerOf, wingId, namespaceWing, damageEvent, applyDamageEvent, makeDeadBoard, noteDead, deadPack, DEAD_GRACE_MS };
