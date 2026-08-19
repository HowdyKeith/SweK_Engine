// FILE: ui/workerActivity.js
// VERSION: v1 — round 283
//
// Lightweight activity registry for Web Workers + idle-scheduler tasks.
// Powers the ECG HUD widget — each registered source records its
// last send / last recv timestamps + cumulative counts, the widget
// renders these as a tiny pulse waveform per source.
//
// The tracker is NON-INVASIVE: it monkey-patches `worker.postMessage`
// once at registration and adds a "message" listener. Existing worker
// code keeps working unchanged. Idle-scheduler tasks bump the counters
// manually via `bumpActivity(name)` from their tick functions if they
// care to show on the ECG (otherwise just appear as inactive).
//
// API:
//   registerWorker(name, worker)  — track an actual Web Worker
//   bumpActivity(name)            — manual ping from non-worker tasks
//   getActivity()                 — { name: { lastSendMs, lastRecvMs,
//                                            sendCount, recvCount } }
//   getRecentlyActive(windowMs)   — list of names active in window
//
// Sources can be added/removed any time. Activity records persist
// for the page lifetime — no expiry, but the HUD only draws what's
// been pinged recently anyway.

const _activity = Object.create(null);   // name → ActivityRecord

function _now() {
    return (typeof performance !== "undefined") ? performance.now() : Date.now();
}

function _ensureRecord(name) {
    if (!_activity[name]) {
        _activity[name] = {
            name,
            lastSendMs: 0,
            lastRecvMs: 0,
            sendCount: 0,
            recvCount: 0,
            // Ring buffer of recent activity blips for the ECG waveform.
            // Each entry is { t, kind: 'send'|'recv' }. Cap at 64.
            blips: [],
        };
    }
    return _activity[name];
}

function _pushBlip(rec, kind) {
    rec.blips.push({ t: _now(), kind });
    if (rec.blips.length > 64) rec.blips.shift();
}

// Register a Web Worker for activity tracking. Patches postMessage
// (idempotent — registering the same worker twice is a no-op) and
// listens for replies. Pass a stable `name` — that's the label the
// ECG widget shows. Returns the registered worker (chainable).
export function registerWorker(name, worker) {
    if (!worker || typeof worker.postMessage !== "function") return worker;
    if (worker._activityTrackedAs) return worker;     // already registered
    const rec = _ensureRecord(name);
    const origPost = worker.postMessage.bind(worker);
    worker.postMessage = function patchedPostMessage(...args) {
        rec.lastSendMs = _now();
        rec.sendCount++;
        _pushBlip(rec, "send");
        return origPost(...args);
    };
    worker.addEventListener?.("message", () => {
        rec.lastRecvMs = _now();
        rec.recvCount++;
        _pushBlip(rec, "recv");
    });
    worker._activityTrackedAs = name;
    return worker;
}

// Manual ping for non-Worker sources (idle-scheduler tasks, async
// pipelines, anything that wants to show on the ECG without going
// through a worker). Call from inside a tick function with the same
// name on every iteration.
export function bumpActivity(name, kind = "recv") {
    const rec = _ensureRecord(name);
    const now = _now();
    if (kind === "send") { rec.lastSendMs = now; rec.sendCount++; }
    else                  { rec.lastRecvMs = now; rec.recvCount++; }
    _pushBlip(rec, kind);
}

export function getActivity() {
    return _activity;
}

export function getRecentlyActive(windowMs = 1000) {
    const now = _now();
    const out = [];
    for (const rec of Object.values(_activity)) {
        const last = Math.max(rec.lastSendMs, rec.lastRecvMs);
        if (now - last < windowMs) out.push(rec);
    }
    return out;
}

export function listSources() {
    return Object.keys(_activity);
}
