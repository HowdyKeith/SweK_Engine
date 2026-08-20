// ai-bridge/netbirdBridge.js — v1923
// Detect the NetBird CLIENT agent on this box and read its mesh status, so SweK can show whether this
// machine is on a NetBird WireGuard mesh and offer its mesh IP (100.x) as a peer link — the P2P path that
// mirrors how Tailscale is used here. This talks ONLY to the local `netbird` CLI; it never hosts anything.
// Repo: netbirdio/netbird (BSD-3). Server self-hosting is a separate, heavier thing (see bgServices).
const { spawnSync } = require("child_process");
const os = require("os");
const path = require("path");

const WIN = process.platform === "win32";
const CANDIDATES = WIN
    ? ["netbird", "C:\\Program Files\\NetBird\\netbird.exe"]
    : ["/usr/local/bin/netbird", "/opt/homebrew/bin/netbird", "/usr/bin/netbird", "netbird"];

function _bin() {
    for (const c of CANDIDATES) {
        try { const r = spawnSync(c, ["version"], { timeout: 4000 }); if (r.status === 0 || (r.stdout && r.stdout.length)) return c; } catch {}
    }
    return null;
}

function detect() {
    const bin = _bin();
    if (!bin) return { ok: true, installed: false };
    let version = ""; try { const r = spawnSync(bin, ["version"], { timeout: 4000 }); version = (r.stdout || "").toString().trim().split("\n")[0] || ""; } catch {}
    return { ok: true, installed: true, bin, version };
}

// `netbird status --json` -> { management: {connected}, peers, netbirdIp, ... } (shape varies by version).
function status() {
    const bin = _bin();
    if (!bin) return { ok: true, installed: false, connected: false };
    // try JSON first
    try {
        const r = spawnSync(bin, ["status", "--json"], { timeout: 6000 });
        const txt = (r.stdout || "").toString();
        if (txt.trim().startsWith("{")) {
            const j = JSON.parse(txt);
            const ip = j.netbirdIp || j.ip || (j.peers && j.peers.self && j.peers.self.netbirdIp) || "";
            const connected = /connected/i.test(j.management && j.management.connected ? "connected" : (j.status || "")) || !!ip;
            const peerCount = (j.peers && (j.peers.total || (Array.isArray(j.peers.details) ? j.peers.details.length : 0))) || 0;
            return { ok: true, installed: true, connected: !!connected, netbirdIp: ip, peers: peerCount, raw: undefined };
        }
    } catch {}
    // fall back to plain-text parse
    try {
        const r = spawnSync(bin, ["status"], { timeout: 6000 });
        const txt = (r.stdout || "").toString();
        const ipm = txt.match(/NetBird IP:\s*([0-9.]+)/i) || txt.match(/\b(100\.\d+\.\d+\.\d+)\b/);
        const connected = /Management:\s*Connected/i.test(txt) || /Signal:\s*Connected/i.test(txt) || !!ipm;
        const peers = (txt.match(/Peers count:\s*(\d+)/i) || [])[1];
        return { ok: true, installed: true, connected: !!connected, netbirdIp: ipm ? ipm[1] : "", peers: peers ? parseInt(peers, 10) : 0 };
    } catch (e) { return { ok: true, installed: true, connected: false, error: String(e && e.message || e) }; }
}

// bring this box up on the mesh (interactive SSO happens in the user's browser). setupKey optional.
function up(setupKey, mgmtUrl) {
    const bin = _bin(); if (!bin) return { ok: false, error: "netbird client not installed" };
    const args = ["up"]; if (setupKey) args.push("--setup-key", String(setupKey)); if (mgmtUrl) args.push("--management-url", String(mgmtUrl));
    try { const r = spawnSync(bin, args, { timeout: 30000 }); return { ok: r.status === 0, out: ((r.stdout || "") + (r.stderr || "")).toString().slice(-600) }; }
    catch (e) { return { ok: false, error: String(e && e.message || e) }; }
}
function down() {
    const bin = _bin(); if (!bin) return { ok: false, error: "netbird client not installed" };
    try { const r = spawnSync(bin, ["down"], { timeout: 15000 }); return { ok: r.status === 0, out: ((r.stdout || "") + (r.stderr || "")).toString().slice(-300) }; }
    catch (e) { return { ok: false, error: String(e && e.message || e) }; }
}

module.exports = { detect, status, up, down };
