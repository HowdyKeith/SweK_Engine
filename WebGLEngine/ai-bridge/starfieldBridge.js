// starfieldBridge.js — v1063
// Taps live Starfield state via the SFSE "Console API and Web Application" plugin
// (nexusmods.com/starfield/mods/4280), which runs a tiny HTTP server with a single
//   POST /console
// endpoint on 127.0.0.1:55555. You send a console command as the body and get the
// console's text output back. We poll a few read-only commands and parse the numbers.
//
// Requires, on the rig: SFSE installed, the Console API plugin in
//   <Starfield>\Data\SFSE\plugins\, and the game launched via sfse_loader.exe.
// Single-player, local. Console commands are powerful, so this only talks to the
// configured host (default 127.0.0.1) and is disabled by default.

const http = require("http");
const fs   = require("fs");
const path = require("path");

const CFG_PATH = path.join(__dirname, "starfield.json");
let cfg = {
    enabled: false,
    host: "127.0.0.1",
    port: 55555,
    // Read-only metrics to poll. label -> console command. The last number in the
    // response text is parsed out. Defaults use reliable player actor-values.
    metrics: {
        health: "player.getav Health",
        o2:     "player.getav O2",
        level:  "player.getlevel",
        posX:   "player.getpos x",
        posY:   "player.getpos y",
        posZ:   "player.getpos z",
    },
    pollMs: 3000,
};
try { if (fs.existsSync(CFG_PATH)) cfg = Object.assign(cfg, JSON.parse(fs.readFileSync(CFG_PATH, "utf8"))); } catch {}
function saveCfg() { try { fs.writeFileSync(CFG_PATH, JSON.stringify(cfg, null, 2)); } catch {} }

let connected = false, lastUpdate = 0, lastError = null;
let state = {};            // label -> number
let raw = {};              // label -> raw text (debug)
let timer = null, polling = false;
let log = () => {};
function setLogger(fn) { if (typeof fn === "function") log = fn; }

// POST a single console command, resolve with the response text.
function command(cmd) {
    return new Promise((resolve, reject) => {
        const body = Buffer.from(String(cmd), "utf8");
        const req = http.request({
            host: cfg.host, port: cfg.port, path: "/console", method: "POST",
            headers: { "Content-Type": "text/plain", "Content-Length": body.length },
            timeout: 4000,
        }, (res) => {
            const chunks = [];
            res.on("data", c => chunks.push(c));
            res.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
        });
        req.on("timeout", () => req.destroy(new Error("timeout")));
        req.on("error", reject);
        req.write(body); req.end();
    });
}

const lastNumber = (text) => {
    if (text == null) return null;
    const m = String(text).match(/-?\d+(?:\.\d+)?/g);
    return (m && m.length) ? parseFloat(m[m.length - 1]) : null;
};

// v1129 — one-shot "is Starfield running?" probe. The SFSE Console API only answers
// when the game is live with the plugin loaded, so a valid GetSFSEVersion reply ==
// Starfield is up. Independent of the enabled/polling state.
async function detect() {
    try {
        const ver = await command("GetSFSEVersion");
        const running = /SFSE version/i.test(ver) || /Command:/i.test(ver);
        return { ok: true, running, version: running ? (String(ver).split(/\r?\n/)[0] || "").slice(0, 80) : null, host: cfg.host, port: cfg.port };
    } catch (e) {
        return { ok: true, running: false, error: String(e.message || e), host: cfg.host, port: cfg.port };
    }
}

async function pollOnce() {
    if (polling) return; polling = true;
    try {
        // Connectivity probe (cheap, always available when the plugin is loaded).
        const ver = await command("GetSFSEVersion");
        connected = /SFSE version/i.test(ver) || /Command:/i.test(ver);
        lastError = null;
        if (connected) {
            const next = {}, nraw = {};
            for (const label in cfg.metrics) {
                try { const t = await command(cfg.metrics[label]); nraw[label] = t; const v = lastNumber(t); if (v != null) next[label] = v; }
                catch (e) { /* skip this metric */ }
            }
            state = next; raw = nraw; lastUpdate = Date.now();
        }
    } catch (e) {
        connected = false; lastError = String(e.message || e);
    } finally { polling = false; }
}

function start(opts) {
    if (opts && typeof opts.log === "function") setLogger(opts.log);
    if (timer) clearInterval(timer);
    timer = setInterval(() => { if (cfg.enabled) pollOnce(); }, Math.max(1000, cfg.pollMs || 3000));
    if (cfg.enabled) pollOnce();
}
function stop() { if (timer) { clearInterval(timer); timer = null; } }

function getState() {
    const ready = connected && lastUpdate > 0;
    let player = null;
    if (ready) {
        player = {
            health: state.health != null ? state.health : null,
            o2:     state.o2 != null ? state.o2 : null,
            level:  state.level != null ? state.level : null,
            pos:    (state.posX != null || state.posY != null || state.posZ != null)
                    ? { x: state.posX ?? null, y: state.posY ?? null, z: state.posZ ?? null } : null,
        };
    }
    return { connected, ready, host: cfg.host, port: cfg.port, at: Date.now(),
             ageMs: lastUpdate ? Date.now() - lastUpdate : null, error: lastError, player, metrics: state };
}
function status() {
    return { enabled: cfg.enabled, host: cfg.host, port: cfg.port, connected,
             lastUpdate, ageMs: lastUpdate ? Date.now() - lastUpdate : null, error: lastError };
}
function getConfig() { return JSON.parse(JSON.stringify(cfg)); }
function setConfig(next) {
    const wasEnabled = cfg.enabled;
    if (next && typeof next === "object") {
        if (typeof next.enabled === "boolean") cfg.enabled = next.enabled;
        if (typeof next.host === "string" && next.host.trim()) cfg.host = next.host.trim();
        if (Number.isFinite(next.port)) cfg.port = next.port | 0;
        if (Number.isFinite(next.pollMs)) cfg.pollMs = Math.max(1000, next.pollMs | 0);
        if (next.metrics && typeof next.metrics === "object") cfg.metrics = next.metrics;
    }
    saveCfg();
    if (cfg.enabled && !wasEnabled) pollOnce();
    if (!cfg.enabled) { connected = false; state = {}; raw = {}; lastUpdate = 0; }
    return getConfig();
}

module.exports = { start, stop, getState, status, getConfig, setConfig, command, setLogger, detect };
