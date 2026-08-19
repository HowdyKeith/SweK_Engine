// mpOgre.js — v1481, multi-seat crew v1483, per-seat views + trust gating v1485
// OGRE remote-commander relay, CREWED. The engine running the wargame is the HOST: it
// publishes OGRE state and applies crew orders. Crew SEATS — driver (steer), gunner
// (fire; optionally per-turret as "gunner:main" / "gunner:under"), engineer (nanite
// repair/convert), and the legacy all-in-one "commander" — can each be taken by a
// human or an AI, friendly or ENEMY.
//
// Per-seat views (v1485): getState shapes the published state for the requesting seat.
// Each seat sees a small always-on base (OGRE pose) PLUS the info "sections" owned by
// other seats — but a section whose seat is held by an ENEMY AI is WITHHELD from the
// friendly crew (a compromised gunner stops sharing target intel, etc.). Empty or
// friendly-held seats share normally. The host and commander see everything.
//
// State flows UP, orders flow DOWN, each order tagged with the sender's seat. Defenders
// are NEVER network-controlled.

const ROOM_TTL_MS = 30 * 60 * 1000;
const MAX_ORDERS  = 64;
const SEAT_RE = /^(host|driver|engineer|commander|gunner(:[A-Za-z0-9_-]+)?)$/;

// Which published-state fields belong to which seat's "section".
const SECTION_FIELDS = {
    nav:     ["hq", "commanded", "defendersCentroid"],   // driver
    targets: ["defendersList", "firing"],                // gunner(s)
    eng:     ["sensors", "nanites", "ammo"],             // engineer
};
const BASE_FIELDS = ["ogre", "variant", "ts"];           // always shared (situational awareness)

const rooms = new Map();   // room -> { seats:{}, alleg:{}, state, stateTs, orders[], createdAt, touchedAt }

function _now() { return Date.now(); }
function _gc() { const t = _now(); for (const [k, r] of rooms) if (t - r.touchedAt > ROOM_TTL_MS) rooms.delete(k); }
function _room(room) {
    _gc();
    let r = rooms.get(room);
    if (!r) { r = { seats: {}, alleg: {}, state: null, stateTs: 0, orders: [], createdAt: _now(), touchedAt: _now() }; rooms.set(room, r); }
    r.touchedAt = _now();
    return r;
}
function _seatOf(r, token) { for (const s of Object.keys(r.seats)) if (r.seats[s] === token) return s; return null; }
function _occ(r) { const o = {}; for (const s of Object.keys(r.seats)) if (r.seats[s]) o[s] = r.alleg[s] || "friendly"; return o; }

// Is the seat that owns this section held by an enemy?
function _sectionEnemy(r, section) {
    if (section === "nav") return r.alleg["driver"] === "enemy";
    if (section === "eng") return r.alleg["engineer"] === "enemy";
    if (section === "targets") { for (const s of Object.keys(r.seats)) if (s.startsWith("gunner") && r.alleg[s] === "enemy") return true; return false; }
    return false;
}
// Does this seat own (have primary interest in) this section?
function _ownsSection(seat, section) {
    if (!seat) return false;
    if (seat === "commander") return true;
    if (section === "nav") return seat === "driver";
    if (section === "targets") return seat.startsWith("gunner");
    if (section === "eng") return seat === "engineer";
    return false;
}

// Seat a token. allegiance: "friendly" (default) | "enemy".
function join(room, token, role, allegiance) {
    if (!room || !token) return { ok: false, error: "room_and_token_required" };
    const r = _room(room);
    role = String(role || "");
    if (!SEAT_RE.test(role)) return { ok: false, error: "bad_seat", seats: _occ(r) };
    if (r.seats[role] && r.seats[role] !== token) return { ok: false, error: role + "_taken", role: "spectator", seats: _occ(r) };
    r.seats[role] = token;
    r.alleg[role] = (allegiance === "enemy") ? "enemy" : "friendly";
    return { ok: true, role, room, seats: _occ(r) };
}

function publish(room, token, state) {
    if (!room || !token) return { ok: false, error: "room_and_token_required" };
    const r = _room(room);
    if (r.seats.host && r.seats.host !== token) return { ok: false, error: "not_host" };
    if (!r.seats.host) { r.seats.host = token; r.alleg.host = "friendly"; }
    r.state = (state && typeof state === "object") ? state : null;
    r.stateTs = _now();
    return { ok: true, pending: r.orders.length };
}

// Per-seat view of the published state. host/commander see all; others see base + the
// sections they own + sections whose owning seat is not enemy-held.
function getState(room, token) {
    const r = _room(room);
    const full = r.state || {};
    const seat = token ? _seatOf(r, token) : null;
    if (seat === "host" || seat === "commander") {
        return { ok: true, seat, state: full, stateTs: r.stateTs, seats: _occ(r), pending: r.orders.length };
    }
    const view = {};
    for (const k of BASE_FIELDS) if (k in full) view[k] = full[k];
    const withheld = [];
    for (const section of Object.keys(SECTION_FIELDS)) {
        const visible = _ownsSection(seat, section) || !_sectionEnemy(r, section);
        if (visible) { for (const f of SECTION_FIELDS[section]) if (f in full) view[f] = full[f]; }
        else withheld.push(section);
    }
    return { ok: true, seat, state: view, withheld, stateTs: r.stateTs, seats: _occ(r), pending: r.orders.length };
}

// A seated crew member posts an order, tagged with their seat (and, for a "gunner:slot"
// seat, the turret slot). order kinds: steer/halt/release · fire{targetId,slot} · repair/
// repairStop/convert/nanite.
function command(room, token, order) {
    if (!room || !token) return { ok: false, error: "room_and_token_required" };
    const r = _room(room);
    const seat = _seatOf(r, token);
    if (!seat || seat === "host") return { ok: false, error: "not_seated" };
    if (order && typeof order === "object") {
        const o = Object.assign({}, order, { seat, ts: _now() });
        if (seat.startsWith("gunner:") && o.slot == null) o.slot = seat.slice(7);   // turret from seat name
        r.orders.push(o);
        while (r.orders.length > MAX_ORDERS) r.orders.shift();
    }
    return { ok: true, seat, pending: r.orders.length };
}

function drainCommands(room, token) {
    const r = _room(room);
    if (r.seats.host && r.seats.host !== token) return { ok: false, error: "not_host", orders: [] };
    const out = r.orders;
    r.orders = [];
    return { ok: true, orders: out };
}

function leave(room, token) {
    const r = rooms.get(room);
    if (r) for (const s of Object.keys(r.seats)) if (r.seats[s] === token) { r.seats[s] = null; delete r.alleg[s]; }
    return { ok: true };
}

function reset(room) { rooms.delete(room); return { ok: true }; }

function list() {
    _gc();
    return [...rooms.entries()].map(([room, r]) => ({
        room, seats: _occ(r), hasState: !!r.state, pending: r.orders.length,
        stateAgeMs: r.stateTs ? _now() - r.stateTs : null,
    }));
}

module.exports = { join, publish, getState, command, drainCommands, leave, reset, list };
