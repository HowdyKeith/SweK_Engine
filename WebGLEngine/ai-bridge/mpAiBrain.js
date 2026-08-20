// ai-bridge/mpAiBrain.js — v1461 (Phase 2)
// Distributed enemy-AI: other SweK engines on the LAN register as AI WORKERS;
// this host parcels out enemy "brain" slots by capability score and consumes
// the intents the workers compute. Graceful: with no workers registered, the
// host's own AI runs unchanged (see tickOgreSimulation's fallback).
//
//   nearest-N enemies (need the most smarts) -> the highest-score worker (brain)
//   the rest (grunts)                        -> round-robin across the others
//
// The nearest-combatant LOD insight: only a small "smart" slice goes to the
// fastest CPU; the cheap many spread across the slower machines.

const WORKER_TTL = 12000;   // ms — a worker that stops checking in is dropped
const INTENT_TTL = 4000;    // ms — a stale intent falls back to local AI

const _workers = new Map();   // url -> { url, score, host, lastSeen }
const _intents = new Map();   // enemyId -> { intent, worker, ts, state }
const _flow = [];             // ring buffer of narrated activity events
const _lastAssign = new Map(); // enemyId -> worker (to log only on change)
function _hostOf(url) { const w = _workers.get(String(url || "").replace(/\/+$/, "")); return (w && w.host) || (url || "").replace(/^https?:\/\//, "").split(":")[0] || "engine"; }
function logEvent(kind, text, data) { _flow.push({ t: Date.now(), kind, text, data: data || null }); if (_flow.length > 80) _flow.shift(); }

function registerWorker(w) {
    if (!w || !w.url) return null;
    const url = String(w.url).replace(/\/+$/, "");
    const isNew = !_workers.has(url);
    _workers.set(url, { url, score: +w.score || 0, host: w.host || "", lastSeen: Date.now() });
    if (isNew) logEvent("register", (w.host || _hostOf(url)) + " enlisted as a brain", { url, score: +w.score || 0 });
    return url;
}

function liveWorkers() {
    const now = Date.now(); const out = [];
    for (const [url, w] of _workers) { if (now - w.lastSeen < WORKER_TTL) out.push(w); else _workers.delete(url); }
    return out.sort((a, b) => b.score - a.score);   // fastest first
}

// enemies: [{ id, dist }] (dist = distance to the player/threat; nearest = smartest).
// returns { enemyId: workerUrl }. Pure + deterministic given the live worker set.
function assignBrains(enemies, opts = {}) {
    const map = {};
    const workers = liveWorkers();
    if (!workers.length || !Array.isArray(enemies) || !enemies.length) return map;
    const smartN = opts.smartN || 3;
    const sorted = enemies.slice().sort((a, b) => (a.dist ?? 1e9) - (b.dist ?? 1e9));
    const brain = workers[0];                                   // fastest CPU = smartest brain
    const grunts = workers.length > 1 ? workers.slice(1) : workers;
    sorted.forEach((e, i) => {
        map[e.id] = (i < smartN) ? brain.url : grunts[(i - smartN) % grunts.length].url;
    });
    return map;
}

function noteAssignments(map) {
    for (const [eid, url] of Object.entries(map || {})) {
        if (_lastAssign.get(eid) !== url) { _lastAssign.set(eid, url); logEvent("assign", "Host tasked " + _hostOf(url) + " with " + eid, { enemyId: eid, worker: url }); }
    }
}
function recordIntent(enemyId, intent, worker) {
    if (!enemyId) return;
    const eid = String(enemyId); const st = (intent && intent.state) || null; const md = (intent && intent.model) || null;
    const prev = _intents.get(eid);
    _intents.set(eid, { intent: intent || {}, worker: worker || "", ts: Date.now(), state: st, model: md });
    if (st && (!prev || prev.state !== st)) {
        const verbs = { searching: "is searching for prey", advancing: "closes the distance", circling: "circles its target", closing: "moves in for the kill", attacking: "strikes!", retreating: "falls back", spreading: "spreads out", reinforce: "calls reinforcements", guard: "guards the king" };
        logEvent("state", _hostOf(worker) + ": " + eid + " " + (verbs[st] || st), { enemyId: eid, worker: worker || "", state: st });
    }
}

function intentFor(enemyId) {
    const it = _intents.get(String(enemyId));
    if (!it) return null;
    if (Date.now() - it.ts > INTENT_TTL) { _intents.delete(String(enemyId)); return null; }
    return it.intent;
}

function status() { return { workers: liveWorkers(), intents: _intents.size }; }
function flow() {
    return {
        events: _flow.slice(-40),
        workers: liveWorkers(),
        enemies: Array.from(_intents.entries()).map(([id, it]) => ({ id, brain: it.worker, host: _hostOf(it.worker), state: it.state, model: it.model, ageMs: Date.now() - it.ts })),
    };
}

module.exports = { registerWorker, liveWorkers, assignBrains, noteAssignments, recordIntent, intentFor, status, flow, logEvent, _workers, _intents };
