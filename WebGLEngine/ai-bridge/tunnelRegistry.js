// ai-bridge/tunnelRegistry.js — v1797
// Persists peer Cloudflare/tunnel URLs across SweK version updates.
// Stored outside the engine tree in ~/.voxelbridge/tunnel-registry.json so it
// survives in-place updates and re-extracts. Each entry tracks when a tunnel was
// first seen, last seen alive, and last checked. Dead tunnels are removed after
// DEAD_STRIKES failed probes.
"use strict";
const fs   = require("fs");
const os   = require("os");
const path = require("path");

const REG_PATH = process.env.SWEK_TUNNEL_REG ||
    path.join(os.homedir(), ".voxelbridge", "tunnel-registry.json");

const PROBE_INTERVAL_MS = 5 * 60 * 1000;   // probe every 5 minutes
const DEAD_STRIKES      = 3;                // remove after 3 consecutive failures
const PROBE_TIMEOUT_MS  = 6000;

// ── persistence ──────────────────────────────────────────────────────────────
function _load() {
    try {
        if (fs.existsSync(REG_PATH)) return JSON.parse(fs.readFileSync(REG_PATH, "utf8"));
    } catch {}
    return {};
}
function _save(reg) {
    try {
        fs.mkdirSync(path.dirname(REG_PATH), { recursive: true });
        fs.writeFileSync(REG_PATH, JSON.stringify(reg, null, 2), { mode: 0o600 });
    } catch {}
}

// ── record a live tunnel URL seen from a peer ─────────────────────────────────
// key = tunnelUrl (the stable unique identifier — peer LAN url may change)
function recordTunnel(peerName, peerLanUrl, tunnelUrl) {
    if (!tunnelUrl || !/^https?:\/\//.test(tunnelUrl)) return;
    const reg = _load();
    const key = tunnelUrl.replace(/\/+$/, "");
    // v2194 — soft cap: a hostile/buggy peer gossiping endless URLs can't flood the registry.
    // Existing entries always update; NEW learned entries stop at 64 (manual adds bypass this).
    if (!reg[key] && Object.keys(reg).length >= 64) return;
    const now = Date.now();
    const existing = reg[key] || {};
    // v3809 -- *** A PEER BEING REACHABLE ON THE LAN SAYS NOTHING ABOUT WHETHER ITS cloudflared TUNNEL IS
    // STILL UP. *** This is called every /hosting/peers/tunnels poll with whatever tunnel URL a peer's whoami
    // advertises -- and a peer keeps advertising its LAST tunnel URL after that quick-tunnel has died. The old
    // code stamped alive:true, strikes:0 on every such record, so the probe loop's strikes were wiped before
    // they could reach 3 and the dead trycloudflare link sat there GREEN with a fresh "29s ago" forever, both
    // in the saved list and in the External-services quick links (which filter on alive). Only the probe --
    // which actually GETs the URL -- may assert alive. A brand-new URL we have never seen is optimistically
    // alive and gets probed within the loop; an entry the probe already killed STAYS dead until the probe
    // itself revives it, and its lastSeen is left where the probe put it so the age reflects last-seen-ALIVE.
    const wasDead = existing.alive === false;
    reg[key] = Object.assign({}, existing, {
        tunnelUrl: key,
        peerName:  String(peerName || existing.peerName || "").slice(0, 80),
        peerLanUrl: String(peerLanUrl || existing.peerLanUrl || "").slice(0, 200),
        firstSeen: existing.firstSeen || now,
        lastSeen:  wasDead ? (existing.lastSeen || now) : now,
        lastChecked: existing.lastChecked || now,
        alive: !wasDead,          // new -> alive (optimistic, probe confirms); probe-killed -> stays dead
        strikes: existing.strikes || 0,   // never wipe accumulated strikes on unverified gossip
    });
    _save(reg);
}

// ── list all known tunnels with status ────────────────────────────────────────
function list() {
    const reg = _load();
    return Object.values(reg).sort((a, b) => (b.lastSeen || 0) - (a.lastSeen || 0));
}

// ── v2194: manually-added EXTERNAL peer (a friend's cloudflared URL) ──────────
// Same store as learned tunnels, but flagged manual: true — the 3-strike pruner
// marks these dead instead of deleting them (the user typed it in; a quick-tunnel
// restart or a laptop going to sleep must not silently forget it).
function addManual(url, peerName) {
    const key = String(url || "").trim().replace(/\/+$/, "");
    if (!/^https?:\/\/[\w.-]+(?::\d+)?$/.test(key)) return { ok: false, error: "bad url (want https://host or http://host:port)" };
    const reg = _load();
    const now = Date.now();
    const existing = reg[key] || {};
    reg[key] = Object.assign({}, existing, {
        tunnelUrl: key,
        peerName: String(peerName || existing.peerName || "").slice(0, 80),
        peerLanUrl: existing.peerLanUrl || "",
        firstSeen: existing.firstSeen || now,
        lastSeen: existing.lastSeen || now,
        lastChecked: existing.lastChecked || 0,
        alive: existing.alive !== false,
        strikes: existing.strikes || 0,
        manual: true,
    });
    _save(reg);
    return { ok: true, added: key };
}

// ── v2194: tunnel URLs usable as PEER targets (gossip / introduce / update) ───
// Alive learned tunnels + every manual entry (probe loop revives dead manuals),
// minus our own self entry.
function aliveUrls() {
    try { return list().filter(t => t && t.tunnelUrl && !t.self && (t.alive !== false || t.manual)).map(t => t.tunnelUrl); } catch { return []; }
}

// ── remove a specific tunnel URL ─────────────────────────────────────────────
function remove(tunnelUrl) {
    const key = (tunnelUrl || "").replace(/\/+$/, "");
    const reg = _load();
    if (reg[key]) { delete reg[key]; _save(reg); return { ok: true, removed: key }; }
    return { ok: false, error: "not found" };
}

// ── v3809: forget saved peer tunnels in one action ───────────────────────────
// The dead-link complaint: four trycloudflare peer tunnels that were long gone still lined the panel. The
// per-row X existed but clearing four-at-a-time by hand is the kind of chore a control should absorb.
// LEARNED entries are safe to drop wholesale because they REPOPULATE: any peer still actually serving a tunnel
// re-adds it on the very next /hosting/peers/tunnels poll (~30s), so "clear" keeps the live ones and only the
// dead ones stay gone. MANUAL entries are the user's own typed-in URLs and are never swept -- `all:true` is
// the explicit opt-in for those. Returns how many went and the surviving list.
function clear(opts) {
    const includeManual = !!(opts && opts.all);
    const reg = _load();
    let removed = 0;
    for (const key of Object.keys(reg)) {
        if (reg[key].self) continue;                       // never drop our own node's entry
        if (reg[key].manual && !includeManual) continue;   // manual survives unless explicitly asked
        delete reg[key]; removed++;
    }
    _save(reg);
    return { ok: true, removed, tunnels: Object.values(reg).sort((a, b) => (b.lastSeen || 0) - (a.lastSeen || 0)) };
}

// ── probe one tunnel: GET /health, update status ──────────────────────────────
async function probeOne(tunnelUrl) {
    const key = (tunnelUrl || "").replace(/\/+$/, "");
    const reg = _load();
    if (!reg[key]) return;
    const now = Date.now();
    try {
        const ac = new AbortController();
        const t  = setTimeout(() => ac.abort(), PROBE_TIMEOUT_MS);
        const r  = await fetch(key + "/health", { signal: ac.signal, cache: "no-store" }).finally(() => clearTimeout(t));
        const cls = require("./tunnelHealth.js").classifyProbe({ ok: r && r.ok, status: r && r.status });
        if (cls === "live") {
            reg[key].alive      = true;
            reg[key].strikes    = 0;
            reg[key].badGateway = false;
            reg[key].lastSeen   = now;
            reg[key].lastChecked = now;
        } else {
            reg[key].badGateway = (cls === "bad-gateway");   // v2277 — a 502/CF-edge tunnel is dead for good
            _strike(reg, key, now, cls === "bad-gateway");
        }
    } catch {
        _strike(reg, key, now);
    }
    _save(reg);
}

function _strike(reg, key, now, hard) {
    reg[key].alive       = false;
    reg[key].strikes     = (reg[key].strikes || 0) + 1;
    reg[key].lastChecked = now;
    const limit = hard ? 2 : DEAD_STRIKES;   // v2277 — a definitive bad-gateway is pruned faster than a transient blip
    if (reg[key].strikes >= limit && !reg[key].manual) {
        delete reg[key];   // gone — remove from registry (manual entries survive as dead; only the user removes them)
    }
}

// ── background probe loop ────────────────────────────────────────────────────
let _probeTimer = null;
function startProbing() {
    if (_probeTimer) return;
    async function _tick() {
        const reg = _load();
        for (const key of Object.keys(reg)) {
            await probeOne(key).catch(() => {});
        }
    }
    _probeTimer = setInterval(() => { _tick().catch(() => {}); }, PROBE_INTERVAL_MS);
    if (_probeTimer.unref) _probeTimer.unref();
    // first probe 30s after start so we don't block boot
    setTimeout(() => { _tick().catch(() => {}); }, 30000);
}

module.exports = { recordTunnel, addManual, aliveUrls, list, remove, clear, probeOne, startProbing };
