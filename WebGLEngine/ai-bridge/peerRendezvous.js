// ai-bridge/peerRendezvous.js — v1928
// Peer discovery WITHOUT UDP broadcast or manual entry: each box writes its own reachable address
// (LAN IP:8787, and/or its NetBird/Tailscale mesh IP, and/or its external IP) to a shared Google Drive
// folder as swek-peer-<name>.json; every other box reads that folder and adds the addresses to its peer
// list. Reuses the exact Drive-pointer pattern from cloudflareTunnel.js (uploadBytes / listFolder /
// downloadBytes). This is the "peers announce themselves via Drive" path Keith asked for - handy when
// boxes are on different networks (cousin in CA) or when WiFi eats the UDP beacon.
//
// deps (passed from server.js): { driveSync, getToken(scope)->token, folderId, selfName, fetchImpl,
//                                  addrs: () => [ "http://192.168.10.8:8787", "http://100.x.x.x:8787", ... ] }
// SECURITY: we only ever ADD candidate URLs through assetSync.addPeer, which already validates they are
// LAN/mesh/CGNAT ranges (192.168/10/172.16/127/100.64-127) - a hostile Drive file can't inject a public IP
// as a peer, and non-URL junk is ignored.
"use strict";

const CFG_KEY = "peerRvz";
let _lastWrite = 0;

// ── config: trusted email senders for the email path (~/.voxelbridge/peer-rvz.json) ──
const _fs = require("fs"), _os = require("os"), _path = require("path");
const _CFG = _path.join(_os.homedir(), ".voxelbridge", "peer-rvz.json");
function _loadCfg() { try { return JSON.parse(_fs.readFileSync(_CFG, "utf8")); } catch { return { trustedSenders: [] }; } }
function _saveCfg(c) { try { _fs.mkdirSync(_path.dirname(_CFG), { recursive: true }); _fs.writeFileSync(_CFG, JSON.stringify(c, null, 2)); } catch {} }
function getConfig() { const c = _loadCfg(); return { ok: true, trustedSenders: c.trustedSenders || [], emailEnabled: !!c.emailEnabled, driveEnabled: !!c.driveEnabled }; }
function setConfig(d) { const c = _loadCfg(); if (Array.isArray(d.trustedSenders)) c.trustedSenders = d.trustedSenders.map(s => String(s || "").toLowerCase().trim()).filter(Boolean); if (typeof d.emailEnabled === "boolean") c.emailEnabled = d.emailEnabled; if (typeof d.driveEnabled === "boolean") c.driveEnabled = d.driveEnabled; _saveCfg(c); return getConfig(); }


// write this box's reachable addresses to swek-peer-<name>.json in the shared folder.
async function writeSelf(deps) {
    if (!deps || !deps.driveSync || !deps.folderId) return { ok: false, error: "drive not configured (need folderId + token)" };
    const addrs = (typeof deps.addrs === "function" ? deps.addrs() : []) || [];
    const clean = addrs.filter(u => /^https?:\/\/[\d.]+:\d+/.test(String(u || "")));
    if (!clean.length) return { ok: true, skipped: "no addresses to advertise" };
    const name = (deps.selfName || "box").replace(/[^a-zA-Z0-9_-]/g, "") || "box";
    const body = Buffer.from(JSON.stringify({ name, addrs: clean, at: Date.now() }, null, 2), "utf8");
    // throttle: at most once/60s unless the address set changed
    const sig = clean.join("|");
    if (sig === _lastSig && Date.now() - _lastWrite < 60000) return { ok: true, skipped: "unchanged" };
    try {
        const token = await deps.getToken(deps.driveSync.WRITE_SCOPE || "https://www.googleapis.com/auth/drive.file");
        const r = await deps.driveSync.uploadBytes(token, deps.folderId, "swek-peer-" + name + ".json", body, "application/json", deps.fetchImpl);
        if (r && (r.id || r.ok)) { _lastWrite = Date.now(); _lastSig = sig; return { ok: true, wrote: "swek-peer-" + name + ".json", addrs: clean }; }
        return { ok: false, error: "upload failed", detail: r };
    } catch (e) { return { ok: false, error: String(e && e.message || e) }; }
}
let _lastSig = "";

// read every peer's swek-peer-*.json from the shared folder -> [{name, addrs, at}].
async function readPeers(deps) {
    if (!deps || !deps.driveSync || !deps.folderId) return { ok: false, error: "drive not configured" };
    try {
        const token = await deps.getToken(deps.driveSync.SCOPE || "https://www.googleapis.com/auth/drive.readonly");
        const files = await deps.driveSync.listFolder(token, deps.folderId, deps.fetchImpl);
        const mine = (files || []).filter(f => /^swek-peer-.*\.json$/.test(f.name || ""));
        const out = [];
        for (const f of mine) {
            try {
                const buf = await deps.driveSync.downloadBytes(token, f.id, deps.fetchImpl);
                const j = JSON.parse(Buffer.from(buf).toString("utf8"));
                if (j && Array.isArray(j.addrs)) out.push({ name: j.name || f.name, addrs: j.addrs, at: j.at || 0 });
            } catch {}
        }
        return { ok: true, peers: out };
    } catch (e) { return { ok: false, error: String(e && e.message || e) }; }
}

// read the folder and hand every advertised address to addPeer (which validates range + dedupes).
// selfName is skipped so a box doesn't add itself. Returns the list of addresses that were accepted.
async function syncPeers(deps, addPeer, selfName) {
    const r = await readPeers(deps);
    if (!r.ok) return r;
    const skip = (selfName || "").replace(/[^a-zA-Z0-9_-]/g, "");
    const added = [];
    for (const p of r.peers) {
        if (skip && (p.name || "").replace(/[^a-zA-Z0-9_-]/g, "") === skip) continue;   // don't add self
        // stale guard: ignore pointers older than 7 days
        if (p.at && Date.now() - p.at > 7 * 864e5) continue;
        for (const u of (p.addrs || [])) {
            const before = null;
            try { const list = addPeer(u); if (Array.isArray(list) && list.includes(String(u).replace(/\/+$/, ""))) added.push(u); } catch {}
        }
    }
    return { ok: true, peers: r.peers.length, added: Array.from(new Set(added)) };
}

module.exports = { writeSelf, readPeers, syncPeers, getConfig, setConfig, CFG_KEY };

// ── v1929 — EMAIL path: a peer emails its address; a trusted-sender gate + addPeer validation add it ──
// This is the "peers email their IP and rules add them" path. Deliberately strict: an address is only
// accepted when ALL of these hold, so a spoofed or random email can NEVER inject a peer:
//   1. the email's From is on an explicit allowlist (trustedSenders, set by the user);
//   2. the subject contains the exact token SWEK-PEER (cuts noise, makes intent explicit);
//   3. every candidate URL still passes assetSync.addPeer's range check (LAN/mesh/CGNAT only).
// Body: one address per line or comma-separated. Bare IPs get :8787 + http:// added. Public IPs are
// dropped by addPeer regardless.
const SUBJECT_TOKEN = "SWEK-PEER";

function _extractAddrs(text) {
    const out = [];
    const s = String(text || "");
    for (const m of s.matchAll(/https?:\/\/\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}:\d{2,5}/g)) out.push(m[0]);
    for (const m of s.matchAll(/(?<![\w.\/])(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})(?::(\d{2,5}))?(?![\w.])/g)) {
        const url = "http://" + m[1] + ":" + (m[2] || "8787");
        if (!out.includes(url)) out.push(url);
    }
    return Array.from(new Set(out));
}

// email: { from, fromName, subject, body }. trustedSenders: array of email addresses.
// addPeer: assetSync.addPeer (validates range + dedupes). Returns what it did (for the audit log).
function fromEmail(email, trustedSenders, addPeer) {
    email = email || {};
    const from = String(email.from || "").toLowerCase().trim();
    const trusted = (trustedSenders || []).map(x => String(x || "").toLowerCase().trim()).filter(Boolean);
    if (!trusted.length) return { ok: false, reason: "no trusted senders configured" };
    const bare = (from.match(/<([^>]+)>/) || [null, from])[1];
    if (!trusted.includes(bare)) return { ok: false, reason: "sender not trusted", from: bare };
    if (!new RegExp(SUBJECT_TOKEN, "i").test(String(email.subject || ""))) return { ok: false, reason: "no " + SUBJECT_TOKEN + " token in subject" };
    const cands = _extractAddrs(email.body);
    if (!cands.length) return { ok: false, reason: "no address found in body" };
    const added = [];
    for (const u of cands) { try { const list = addPeer(u); if (Array.isArray(list) && list.includes(u.replace(/\/+$/, ""))) added.push(u); } catch {} }
    return { ok: true, from: bare, candidates: cands, added };
}

module.exports.fromEmail = fromEmail;
module.exports.SUBJECT_TOKEN = SUBJECT_TOKEN;
