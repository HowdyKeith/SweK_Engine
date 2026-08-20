// ai-bridge/airWatchBridge.js (v1313) — watches a PM2.5 air-quality sensor in Home Assistant.
// Always polls the configured entity (so /air/status + the air:level broadcast feed the avatar
// haze visual), and — when "react" is on — fires an avatar cough/quip + optional air-purifier
// switch when PM2.5 crosses a threshold (with hysteresis so it doesn't chatter).
"use strict";
const fs = require("fs"), path = require("path");
const CONFIG = path.join(__dirname, "air-watch.json");

let cfg = { entity: "", threshold: 35, react: false, purifier: "", hysteresis: 8, autoOff: false, speak: true, haSpeaker: true };
try { if (fs.existsSync(CONFIG)) cfg = Object.assign(cfg, JSON.parse(fs.readFileSync(CONFIG, "utf8"))); } catch {}
function saveCfg() { try { fs.writeFileSync(CONFIG, JSON.stringify(cfg), { mode: 0o600 }); } catch {} }

let deps = null, timer = null, lastVal = null, lastTs = 0, over = false, coughSeq = 0;

function severityFor(v) { return isFinite(v) ? Math.max(0, Math.min(1, v / 150)) : 0; }   // ~0 clean .. 1 hazardous (150 ug/m3)

async function readValue() {
    if (!cfg.entity || !deps || !deps.states) return null;
    try {
        const list = await deps.states(String(cfg.entity).split(".")[0]);
        const s = (list || []).find(e => e.entity_id === cfg.entity);
        if (!s) return null;
        const v = parseFloat(s.state);
        return isFinite(v) ? v : null;
    } catch { return null; }
}

function say(text) {
    if (cfg.speak && deps.speak) { try { deps.speak(text); } catch {} }                 // PC TTS voice
    if (cfg.haSpeaker && deps.haSpeak) { try { deps.haSpeak(text); } catch {} }          // mirror to the HA speaker
}
function fireBad(v) {
    const n = Math.round(v);
    coughSeq++;                                                                          // bump so avatar pages play a real cough SFX
    try { deps.pushAvatarEvent({ kind: "toast", title: "\uD83C\uDF2B\uFE0F Air quality alert", message: "PM2.5 up to " + n, level: "warn" }); } catch {}
    try { deps.pushAvatarEvent({ kind: "quip", text: "*cough* the air's getting rough \u2014 PM2.5 is up to " + n + "." }); } catch {}
    say("Ahem! Cough, cough. The air's getting rough \u2014 P M 2.5 is up to " + n + ". You might want to crack a window.");
    if (cfg.purifier && deps.haCall) { try { deps.haCall(String(cfg.purifier).split(".")[0], "turn_on", cfg.purifier); } catch {} }
}
function fireClear(v) {
    const n = Math.round(v);
    try { deps.pushAvatarEvent({ kind: "quip", text: "Air's clearing up \u2014 PM2.5 back down to " + n + "." }); } catch {}
    say("Ahh, that's better. The air's clearing up \u2014 P M 2.5 back down to " + n + ".");
    if (cfg.autoOff && cfg.purifier && deps.haCall) { try { deps.haCall(String(cfg.purifier).split(".")[0], "turn_off", cfg.purifier); } catch {} }
}

async function tick() {
    const v = await readValue();
    if (v == null) return;
    lastVal = v; lastTs = Date.now();
    try { deps.broadcast({ type: "air:level", value: v, severity: severityFor(v) }); } catch {}
    const hi = cfg.threshold, lo = Math.max(0, cfg.threshold - (cfg.hysteresis || 8));
    if (!cfg.react) { over = v >= hi; return; }                 // track state, but don't fire when reactions are off
    if (!over && v >= hi) { over = true; fireBad(v); }
    else if (over && v <= lo) { over = false; fireClear(v); }
}

function start(d) {
    deps = d;
    if (timer) { clearInterval(timer); timer = null; }
    if (cfg.entity) { tick(); timer = setInterval(tick, 30000); }
}
function status() { return { ok: true, value: lastVal, severity: lastVal == null ? 0 : severityFor(lastVal), over, threshold: cfg.threshold, entity: cfg.entity, react: cfg.react, purifier: cfg.purifier, ts: lastTs, coughSeq }; }
function getConfig() { return { ok: true, entity: cfg.entity, threshold: cfg.threshold, react: cfg.react, purifier: cfg.purifier, hysteresis: cfg.hysteresis, autoOff: cfg.autoOff, speak: cfg.speak, haSpeaker: cfg.haSpeaker }; }
function setConfig(p) {
    if (p && typeof p === "object") {
        if ("entity" in p) cfg.entity = String(p.entity || "");
        if ("threshold" in p) cfg.threshold = Math.max(1, parseFloat(p.threshold) || 35);
        if ("react" in p) cfg.react = !!p.react;
        if ("purifier" in p) cfg.purifier = String(p.purifier || "");
        if ("hysteresis" in p) cfg.hysteresis = Math.max(0, parseFloat(p.hysteresis) || 8);
        if ("autoOff" in p) cfg.autoOff = !!p.autoOff;
        if ("speak" in p) cfg.speak = !!p.speak;
        if ("haSpeaker" in p) cfg.haSpeaker = !!p.haSpeaker;
    }
    saveCfg();
    if (deps) start(deps);
    return status();
}

module.exports = { start, status, getConfig, setConfig };
