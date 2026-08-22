// ai-bridge/assetDiscovery.js — v1436
// ---------------------------------------------------------------------------
// Zero-dependency LAN auto-detect for SweK Engine bridges. Each bridge (when
// discovery is on) broadcasts a tiny UDP beacon every few seconds and listens
// for others, building a live list of engines on the same network. The Settings
// Sync panel shows them with one-click "sync" / "save as peer". The actual
// transfer still goes through the safe /sync pull (sanitised, model files only),
// so a beacon only advertises a URL — it can't push anything.
// ---------------------------------------------------------------------------

const dgram = require("dgram");
const crypto = require("crypto");
const os = require("os");

const DISC_PORT = 47474;            // UDP discovery port
const BCAST = "255.255.255.255";

// v2194 — beacon to EVERY real adapter, not just the default route. The old beacon sent one
// packet to 255.255.255.255 (the LIMITED broadcast): on a multi-homed Windows box (Ethernet +
// WiFi both up, or VMware/Hyper-V/WSL host adapters present) the OS egresses that packet out
// ONE interface — whichever the route table picks, frequently a VIRTUAL adapter — so a box
// sitting on WiFi never actually beaconed onto the WiFi segment and wireless peers looked
// "invisible" while wired ones worked. Now we compute each real interface's subnet-DIRECTED
// broadcast (addr | ~netmask, e.g. 192.168.11.255) and send the beacon to every one of them,
// plus the legacy 255.255.255.255 for anything exotic. Virtual adapters are skipped with the
// same name heuristic assetSync.lanIp uses. Targets are cached ~30s (interfaces rarely change).
function _isVirtualIf(name, addr) {
    const n = String(name || "").toLowerCase();
    if (/(vethernet|virtualbox|vmware|hyper-?v|\bwsl\b|loopback|default switch|tailscale|zerotier|tap-|tun|npcap|docker|bluetooth|awdl|llw|bridge\d|p2p|anpi)/.test(n)) return true;
    return /^169\.254\./.test(String(addr || ""));
}
function _directedBcast(addr, mask) {
    try {
        const a = String(addr).split(".").map(Number), m = String(mask).split(".").map(Number);
        if (a.length !== 4 || m.length !== 4 || a.some(isNaN) || m.some(isNaN)) return null;
        return a.map((o, i) => ((o & m[i]) | (~m[i] & 255))).join(".");
    } catch { return null; }
}
let _bcastCache = { at: 0, list: [BCAST] };
function _bcastTargets() {
    const now = Date.now();
    if (now - _bcastCache.at < 30000) return _bcastCache.list;
    const out = new Set([BCAST]);
    try {
        const ifs = os.networkInterfaces();
        for (const nm of Object.keys(ifs)) for (const a of (ifs[nm] || [])) {
            if (!a || a.family !== "IPv4" || a.internal) continue;
            if (_isVirtualIf(nm, a.address)) continue;
            const b = _directedBcast(a.address, a.netmask || "255.255.255.0");
            if (b && b !== a.address) out.add(b);
        }
    } catch {}
    _bcastCache = { at: now, list: [...out] };
    return _bcastCache.list;
}
const BEACON_MS = 5000;             // advertise every 5s
const STALE_MS = 40000;             // v1734 - hold a peer 40s through beacon gaps (was 20s) so the list/radar stop flickering

// v1600 — a random per-PROCESS id, regenerated every boot. The beacon carries it so a box can recognise
// its OWN echo by identity rather than by URL. URL-based self-detection breaks when two machines compute
// the same selfUrl (e.g. a shared virtual adapter subnet) — they'd hide each other. With an iid, only a
// box's literal own packets are dropped, so two real peers always see each other even on a URL collision.
const _instanceId = crypto.randomBytes(8).toString("hex");

let _sock = null, _beacon = null, _selfUrl = "", _on = false, _onPeer = null;
let _caps = {};                     // v1460 - this engine's capability profile
const _seen = new Map();            // url -> lastSeen (ms)
const _peerCaps = new Map();        // url -> caps profile from that peer

function onPeer(cb) { _onPeer = cb; }   // fired once when a NEW engine first appears

function start(opts = {}) {
    if (opts.selfUrl) _selfUrl = opts.selfUrl;
    if (opts.caps) _caps = opts.caps;
    if (_on) return true;
    try {
        _sock = dgram.createSocket({ type: "udp4", reuseAddr: true });
        _sock.on("error", () => { stop(); });
        _sock.on("message", (msg) => {
            let p = null; try { p = JSON.parse(msg.toString()); } catch { return; }
            if (!p || p.swek !== true || typeof p.url !== "string") return;
            // v1600 — drop our OWN echo by instance id (robust to URL collisions). Old peers (pre-v1600)
            // send no iid, so fall back to the URL check for them — their URL differs from ours anyway.
            if (p.iid) { if (p.iid === _instanceId) return; }
            else if (p.url === _selfUrl) return;
            if (!/^https?:\/\//.test(p.url)) return;   // sane URL only
            const isNew = !_seen.has(p.url);
            _seen.set(p.url, Date.now());
            if (p.caps && typeof p.caps === "object") _peerCaps.set(p.url, p.caps);
            if (isNew) { try { _onPeer && _onPeer(p.url); } catch {} }
        });
        _sock.bind(DISC_PORT, () => { try { _sock.setBroadcast(true); } catch {} });
        _beacon = setInterval(() => {
            if (!_selfUrl || !_sock) return;
            const buf = Buffer.from(JSON.stringify({ swek: true, url: _selfUrl, iid: _instanceId, ts: Date.now(), caps: _caps }));
            // v2194 — fan the beacon out to every real subnet's directed broadcast (+ the legacy
            // limited broadcast). One send per target; failures on one adapter can't stop the rest.
            for (const dst of _bcastTargets()) { try { _sock.send(buf, 0, buf.length, DISC_PORT, dst); } catch {} }
        }, BEACON_MS);
        if (_beacon.unref) _beacon.unref();
        _on = true;
        return true;
    } catch (e) { stop(); return false; }
}

function stop() {
    _on = false;
    if (_beacon) { clearInterval(_beacon); _beacon = null; }
    if (_sock) { try { _sock.close(); } catch {} _sock = null; }
}

function setSelfUrl(u) { if (u) _selfUrl = u; }
function setCaps(c) { _caps = c || {}; }   // v1460

function discovered() {
    const now = Date.now(), out = [];
    for (const [url, ts] of [..._seen]) {
        if (now - ts < STALE_MS) out.push({ url, lastSeen: ts, agoMs: now - ts, caps: _peerCaps.get(url) || {} });
        else _seen.delete(url);
    }
    return out;
}

function isOn() { return _on; }

// test hook: inject a beacon as if received (no real socket needed)
function _injectForTest(url) { if (url && url !== _selfUrl) _seen.set(url, Date.now()); }

module.exports = { start, stop, setSelfUrl, setCaps, onPeer, discovered, isOn, _injectForTest, _bcastTargets, DISC_PORT };
