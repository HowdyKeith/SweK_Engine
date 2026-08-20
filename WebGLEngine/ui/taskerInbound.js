// FILE: ui/taskerInbound.js
// v941 (R3) — INBOUND: the engine reacts to phone/Tasker events (AutoNotification,
// AutoVoice, or any Tasker task that POSTs the bridge at /tasker/event). Mirrors
// openUrlListener: polls GET /tasker/event every ~2s and acts on a new seq.
//
// On each new event the engine:
//   1. fires window CustomEvent "tasker:event" (detail = the event) so ANY engine
//      system can hook in (wire your own window.addEventListener handlers),
//   2. applies the inbound ACTION MAP (Settings → Tasker → Inbound; localStorage),
//   3. shows a toast so you can see it landed.
//
// Rule shape: { match, matchType: "command" | "voice", action }
//   command → event.command === match (exact)
//   voice   → event.text (lowercased) includes match (lowercased keyword)
//   action  → one of the safe built-ins below, or "event" (CustomEvent + toast only)

const POLL_MS = 2000;
let lastSeq = 0;

function getRules() {
    try { const j = JSON.parse(localStorage.getItem("voxelengine.tasker.inbound") || "[]"); return Array.isArray(j) ? j : []; }
    catch { return []; }
}
function setRules(arr) {
    try { localStorage.setItem("voxelengine.tasker.inbound", JSON.stringify(arr || [])); } catch {}
}
function say(msg) { try { window.toast?.show?.(msg); } catch {} console.log("[tasker-in] " + msg); }

// v942 — voice arg-capture. A rule action of "weather:*" / "time:*" pulls the
// argument out of the spoken phrase (whole-word match) so one rule handles
// natural phrasing ("make it rain", "set the weather to snow", "good night").
const WEATHER_WORDS = { rain: "rain", raining: "rain", storm: "rain", rainy: "rain", snow: "snow", snowing: "snow", snowy: "snow", mist: "mist", fog: "mist", foggy: "mist", misty: "mist", clear: "clear", sunny: "clear", sun: "clear", sunshine: "clear" };
const TIME_WORDS = { dawn: "dawn", sunrise: "dawn", morning: "dawn", noon: "noon", midday: "noon", noonday: "noon", dusk: "dusk", sunset: "dusk", evening: "dusk", twilight: "dusk", night: "midnight", midnight: "midnight", nighttime: "midnight" };
function pickWord(text, map) {
    const toks = String(text || "").toLowerCase().split(/[^a-z]+/).filter(Boolean);
    for (const tk of toks) { if (map[tk]) return map[tk]; }
    return null;
}
function resolveWildcard(action, ev) {
    if (action === "weather:*") { const v = pickWord(ev.text, WEATHER_WORDS); return v ? "weather:" + v : null; }
    if (action === "time:*")    { const v = pickWord(ev.text, TIME_WORDS);    return v ? "time:" + v    : null; }
    return action;
}

// Safe, verified built-in reactions. Everything also fires the CustomEvent.
function runAction(action, ev) {
    const a = resolveWildcard(String(action || "event"), ev);
    if (!a) { say("📲 heard but no match: " + (ev.text || "")); return; }
    try {
        if (a === "toast") { say("📲 " + (ev.text || ev.command || ev.kind)); return; }
        if (a.startsWith("weather:")) { window.weather?.force?.(a.slice(8)); say("weather → " + a.slice(8)); return; }
        if (a.startsWith("time:")) { const f = a.slice(5); if (window.dayNight && typeof window.dayNight[f] === "function") { window.dayNight[f](); say("time → " + f); } return; }
        if (a === "kaiju:start") { window.kaijuSim?.start?.(); say("kaiju sim → start"); return; }
        if (a === "kaiju:stop")  { window.kaijuSim?.stop?.();  say("kaiju sim → stop"); return; }
        // "event" / unknown → CustomEvent only (already fired by dispatch)
    } catch (e) { console.warn("[tasker-in] action failed:", a, e); }
}

function matches(rule, ev) {
    if (!rule || !rule.match) return false;
    if (rule.matchType === "voice") {
        return String(ev.text || "").toLowerCase().includes(String(rule.match).toLowerCase());
    }
    return String(ev.command || "") === String(rule.match);   // default: command exact
}

function dispatch(ev) {
    if (!ev) return;
    // v942 — round-trip reply? Resolve the matching pending taskerRequest and stop.
    const rid = ev.replyId || (ev.params && ev.params.replyId);
    if (rid && _pending.has(rid)) {
        const pend = _pending.get(rid);
        clearTimeout(pend.timer); _pending.delete(rid);
        try { window.dispatchEvent(new CustomEvent("tasker:event", { detail: ev })); } catch {}
        pend.resolve(ev);
        return;
    }
    try { window.dispatchEvent(new CustomEvent("tasker:event", { detail: ev })); } catch {}
    const rules = getRules();
    let acted = 0;
    for (const r of rules) { if (matches(r, ev)) { runAction(r.action, ev); acted++; } }
    if (!acted) say("📲 inbound: " + (ev.command || ev.text || ev.kind) + (rules.length ? " (no rule matched)" : ""));
}

async function poll() {
    if (typeof window !== "undefined" && window.__swekPollsPaused) return;   // v1870 — hold while Settings is open
    try {
        const r = await fetch("/tasker/event", { cache: "no-store" });
        if (!r.ok) return;
        const j = await r.json();
        const ev = j && j.event;
        if (ev && ev.seq > lastSeq) { lastSeq = ev.seq; dispatch(ev); }
    } catch { /* bridge busy — retry next tick */ }
}

// v942 — round-trip request/response. taskerRequest fires an outbound command
// carrying a generated replyId; the matching inbound event (Tasker echoes replyId
// after reading the screen via AutoInput) resolves the promise. dispatch() above
// short-circuits to resolve pending requests.
const _pending = new Map();   // replyId → { resolve, reject, timer }
window.taskerRequest = function (command, params, opts) {
    opts = opts || {};
    const replyId = "rq_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
    const timeoutMs = opts.timeoutMs || 15000;
    const p = new Promise((resolve, reject) => {
        const timer = setTimeout(() => { _pending.delete(replyId); reject(new Error("timeout waiting for Tasker reply")); }, timeoutMs);
        _pending.set(replyId, { resolve, reject, timer });
    });
    try { window.taskerTrigger?.(command, Object.assign({}, params || {}, { replyId })); }
    catch (e) { const pend = _pending.get(replyId); if (pend) { clearTimeout(pend.timer); _pending.delete(replyId); pend.reject(e); } }
    return p;
};

window.taskerInbound = {
    rules: { get: getRules, set: setRules },
    actions: ["event", "toast", "weather:*", "weather:rain", "weather:mist", "weather:snow", "weather:clear",
              "time:*", "time:dawn", "time:noon", "time:dusk", "time:midnight", "kaiju:start", "kaiju:stop"],
    // Simulate an inbound event end-to-end (POSTs the bridge so it flows the real path).
    simulate(ev) {
        return fetch("/tasker/event", { method: "POST", headers: { "Content-Type": "application/json" },
                                        body: JSON.stringify(ev || { kind: "voice", text: "test" }) })
            .then(r => r.json()).catch(e => ({ ok: false, error: String(e) }));
    },
};

// Skip whatever event already exists at load so we don't replay a stale one.
(async function init() {
    try { const r = await fetch("/tasker/event", { cache: "no-store" }); if (r.ok) { const j = await r.json(); if (j && j.event) lastSeq = j.event.seq || 0; } } catch {}
    setInterval(poll, POLL_MS);
})();

console.log("[tasker] inbound ready — window.taskerInbound; listen via window.addEventListener('tasker:event', e => …)");

export {};
