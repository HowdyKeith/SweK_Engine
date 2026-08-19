// falloutBridge.js — v1062
// Taps live Fallout 4 game state via the Pip-Boy Companion App protocol.
//
// HOW IT WORKS (single-player, local, read-only):
//   1. Discovery: UDP broadcast {"cmd":"autodiscover"} to port 28000. The game
//      replies over UDP with {"IsBusy":bool,"MachineType":"PC"}; the reply's
//      source IP is the game. (Or skip discovery and use a configured host —
//      the game usually runs on the same PC as the bridge, so 127.0.0.1 works.)
//   2. Connect: TCP to <gameIP>:27000.
//   3. Stream: framed messages {uint32 size, uint8 type, content[size]} (LE).
//      - type 0 heartbeat -> echo 5 zero bytes back (or the game disconnects)
//      - type 1 new-connection JSON {lang,version}
//      - type 2 busy (another companion app already connected)
//      - type 3 data-update -> a flat database of id->value nodes (the tree)
//   4. The node tree (root id 0) holds PlayerInfo, Status, Radio, Map, Special,
//      Inventory, Quests, Perks, Log, Workshop. We curate a compact snapshot.
//
// Enable in-game: Settings -> Gameplay -> "Pip-Boy App Enabled" = On, restart.
// Protocol spec: github.com/mattbaker/pipboyspec (communication.md, discovery.md).

const dgram = require("dgram");
const net   = require("net");
const fs    = require("fs");
const path  = require("path");

const DISCOVERY_PORT = 28000;
const GAME_PORT      = 27000;
const CFG_PATH = path.join(__dirname, "fallout.json");

let cfg = { enabled: false, host: "auto", autoDetect: false };   // host: "auto" = discover, else IP/hostname; autoDetect: probe + auto-connect when the game appears
try { if (fs.existsSync(CFG_PATH)) cfg = Object.assign(cfg, JSON.parse(fs.readFileSync(CFG_PATH, "utf8"))); } catch {}
function saveCfg() { try { fs.writeFileSync(CFG_PATH, JSON.stringify(cfg, null, 2)); } catch {} }

// --- node database (id -> node) ---------------------------------------------
// node: { type, value }            for primitives (type 0..6)
//       { type:7, arr:[ids] }      for arrays
//       { type:8, obj:{key:id}, _byId:{id:key} }   for objects
let nodes = new Map();
let socket = null, acc = Buffer.alloc(0);
let connected = false, curHost = null, lastUpdate = 0, connInfo = null, busy = false;
let reconnectTimer = null, rediscoverTimer = null, attempting = false;
let log = (..._a) => {};

function setLogger(fn) { if (typeof fn === "function") log = fn; }

// --- data-update parser -----------------------------------------------------
function parseDataUpdate(buf) {
    let o = 0;
    const n = buf.length;
    while (o + 5 <= n) {
        const type = buf.readUInt8(o); o += 1;
        const id = buf.readUInt32LE(o); o += 4;
        switch (type) {
            case 0: { const v = buf.readUInt8(o) !== 0; o += 1; nodes.set(id, { type, value: v }); break; }
            case 1: { const v = buf.readInt8(o);   o += 1; nodes.set(id, { type, value: v }); break; }
            case 2: { const v = buf.readUInt8(o);  o += 1; nodes.set(id, { type, value: v }); break; }
            case 3: { const v = buf.readInt32LE(o);  o += 4; nodes.set(id, { type, value: v }); break; }
            case 4: { const v = buf.readUInt32LE(o); o += 4; nodes.set(id, { type, value: v }); break; }
            case 5: { const v = buf.readFloatLE(o);  o += 4; nodes.set(id, { type, value: v }); break; }
            case 6: { let s = o; while (o < n && buf[o] !== 0) o++; const v = buf.toString("utf8", s, o); o++; nodes.set(id, { type, value: v }); break; }
            case 7: {
                const len = buf.readUInt16LE(o); o += 2;
                const arr = [];
                for (let i = 0; i < len && o + 4 <= n; i++) { arr.push(buf.readUInt32LE(o)); o += 4; }
                nodes.set(id, { type, arr });
                break;
            }
            case 8: {
                const prev = nodes.get(id);
                const obj  = (prev && prev.obj) ? prev.obj : {};
                const byId = (prev && prev._byId) ? prev._byId : {};
                const addLen = buf.readUInt16LE(o); o += 2;
                for (let i = 0; i < addLen && o + 4 <= n; i++) {
                    const cid = buf.readUInt32LE(o); o += 4;
                    let s = o; while (o < n && buf[o] !== 0) o++; const key = buf.toString("utf8", s, o); o++;
                    obj[key] = cid; byId[cid] = key;
                }
                const remLen = (o + 2 <= n) ? buf.readUInt16LE(o) : 0; o += 2;
                for (let i = 0; i < remLen && o + 4 <= n; i++) {
                    const rid = buf.readUInt32LE(o); o += 4;
                    const k = byId[rid];
                    if (k !== undefined) { if (obj[k] === rid) delete obj[k]; delete byId[rid]; }
                }
                nodes.set(id, { type, obj, _byId: byId });
                break;
            }
            default:
                // Unknown type — we can't know its length, so stop to avoid desync.
                o = n;
                break;
        }
    }
}

function handleMessage(type, content) {
    if (type === 0) { try { socket.write(Buffer.from([0, 0, 0, 0, 0])); } catch {} return; }   // heartbeat echo
    if (type === 1) { try { connInfo = JSON.parse(content.toString("utf8")); } catch {} return; }
    if (type === 2) { busy = true; log("Fallout: server busy (another companion app connected)"); return; }
    if (type === 3) { parseDataUpdate(content); lastUpdate = Date.now(); return; }
    // type 4 (local map image) and type 6 (command response) are ignored for now.
}

// --- tree resolution --------------------------------------------------------
function valNode(node, depth) {
    if (!node) return null;
    if (node.type <= 6) return node.value;
    if (depth <= 0) return node.type === 7 ? "[array]" : "[object]";
    if (node.type === 7) {
        const a = node.arr || [];
        const cap = Math.min(a.length, 256);
        const out = [];
        for (let i = 0; i < cap; i++) out.push(valNode(nodes.get(a[i]), depth - 1));
        return out;
    }
    if (node.type === 8) {
        const out = {};
        for (const k in node.obj) out[k] = valNode(nodes.get(node.obj[k]), depth - 1);
        return out;
    }
    return null;
}
function nodeByPath(parts) {
    let cur = nodes.get(0);
    for (const key of parts) {
        if (!cur || cur.type !== 8 || cur.obj[key] == null) return null;
        cur = nodes.get(cur.obj[key]);
    }
    return cur;
}

// Curated, compact snapshot of the useful bits for the engine.
function getState() {
    if (!connected) return { connected: false, ready: false, host: curHost, busy };
    const root = nodes.get(0);
    if (!root || root.type !== 8) return { connected: true, ready: false, host: curHost, busy };

    const player = valNode(nodeByPath(["PlayerInfo"]), 1);
    const status = valNode(nodeByPath(["Status"]), 2);

    let radio = null;
    const radioNode = nodeByPath(["Radio"]);
    if (radioNode && radioNode.type === 7) {
        const stations = radioNode.arr.map(id => valNode(nodes.get(id), 2)).filter(Boolean);
        const active = stations.find(s => s && s.active);
        radio = { stations: stations.length, active: active ? (active.text || active.name || null) : null };
    }

    let playerPos = valNode(nodeByPath(["Map", "World", "Player"]), 1);

    let locations = null;
    const locNode = nodeByPath(["Map", "World", "Locations"]);
    if (locNode && locNode.type === 7) {
        let disc = 0;
        for (const id of locNode.arr) { const o = valNode(nodes.get(id), 1); if (o && o.Discovered) disc++; }
        locations = { total: locNode.arr.length, discovered: disc };
    }

    let special = null;
    const spNode = nodeByPath(["Special"]);
    if (spNode && spNode.type === 7) {
        special = {};
        for (const id of spNode.arr) { const o = valNode(nodes.get(id), 1); if (o && o.Name != null) special[o.Name] = o.Value; }
    }

    return {
        connected: true, ready: true, host: curHost, at: Date.now(),
        ageMs: lastUpdate ? Date.now() - lastUpdate : null,
        info: connInfo, player, status, radio, playerPos, locations, special,
    };
}

// --- connection -------------------------------------------------------------
function cleanupSocket() {
    if (socket) { try { socket.removeAllListeners(); socket.destroy(); } catch {} socket = null; }
    acc = Buffer.alloc(0);
}
function scheduleReconnect() {
    if (!cfg.enabled) return;
    if (reconnectTimer) return;
    reconnectTimer = setTimeout(() => { reconnectTimer = null; begin(); }, 5000);
}
function connectTo(host) {
    cleanupSocket();
    curHost = host;
    busy = false;
    const s = net.connect({ host, port: GAME_PORT }, () => {
        connected = true; attempting = false;
        log("Fallout: connected to " + host + ":" + GAME_PORT);
    });
    s.on("data", (chunk) => {
        acc = Buffer.concat([acc, chunk]);
        while (acc.length >= 5) {
            const size = acc.readUInt32LE(0);
            if (acc.length < 5 + size) break;
            const type = acc.readUInt8(4);
            const content = acc.slice(5, 5 + size);
            acc = acc.slice(5 + size);
            try { handleMessage(type, content); } catch (e) { /* keep stream alive */ }
        }
    });
    const drop = () => { connected = false; attempting = false; cleanupSocket(); scheduleReconnect(); };
    s.on("error", drop);
    s.on("close", drop);
    socket = s;
}
function discover(timeoutMs, cb) {
    // v1177 — dgram/UDP multicast panics on Bun/Windows ("No handlers set on
    // Socket") and takes down the whole process, exactly like mDNS. Skip UDP
    // auto-discovery on Bun; the TCP connect path still works if a game IP is set
    // (cfg.host = an address, not "auto"), and it runs normally on Node.
    if (typeof Bun !== "undefined" || (process.versions && process.versions.bun)) {
        // Bun can't do UDP; use a Node-primed game IP if bun-prime.js cached one.
        try { const cache = JSON.parse(require("fs").readFileSync(require("path").join(__dirname, "discovery-cache.json"), "utf8")); if (cache && cache.falloutHost && (Date.now() - (cache.ts || 0) < 30 * 60 * 1000)) { log("Fallout: using Node-primed game IP " + cache.falloutHost); return cb(cache.falloutHost); } } catch {}
        return cb(null);
    }
    let done = false;
    let sock;
    try { sock = dgram.createSocket({ type: "udp4", reuseAddr: true }); } catch (e) { return cb(null); }
    const finish = (ip, meta) => { if (done) return; done = true; try { sock.close(); } catch {} cb(ip, meta); };
    sock.on("error", () => finish(null));
    sock.on("message", (msg, rinfo) => {
        let j = {}; try { j = JSON.parse(msg.toString("utf8")); } catch {}
        if (j && j.MachineType) finish(rinfo.address, j);
    });
    sock.bind(() => {
        try { sock.setBroadcast(true); } catch {}
        const payload = Buffer.from(JSON.stringify({ cmd: "autodiscover" }));
        try { sock.send(payload, 0, payload.length, DISCOVERY_PORT, "255.255.255.255"); } catch {}
    });
    setTimeout(() => finish(null), timeoutMs || 3000);
}
function begin() {
    if ((!cfg.enabled && !cfg.autoDetect) || attempting || connected) return;
    attempting = true;
    if (cfg.enabled && cfg.host && cfg.host !== "auto") { connectTo(cfg.host); return; }
    discover(3000, (ip) => {
        if (ip) { if (cfg.autoDetect && !cfg.enabled) log("Fallout: game auto-detected at " + ip); connectTo(ip); }
        else if (cfg.enabled) { log("Fallout: no game discovered, trying 127.0.0.1"); connectTo("127.0.0.1"); }
        else { attempting = false; }   // autoDetect-only: nothing found, wait for the next probe
    });
}

function start(opts) {
    if (opts && typeof opts.log === "function") setLogger(opts.log);
    if ((typeof Bun !== "undefined" || (process.versions && process.versions.bun)) && (cfg.enabled || cfg.autoDetect) && (cfg.host === "auto" || !cfg.host)) log("Fallout: UDP auto-discovery skipped on Bun (set a game IP in Settings, or run on Node)");
    if (rediscoverTimer) clearInterval(rediscoverTimer);
    rediscoverTimer = setInterval(() => { if ((cfg.enabled || cfg.autoDetect) && !connected) begin(); }, 15000);
    if (cfg.enabled || cfg.autoDetect) begin();
}
function stop() {
    if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
    cleanupSocket();
    connected = false; attempting = false;
}

function getConfig() { return { ...cfg }; }
function setConfig(next) {
    const prev = { enabled: cfg.enabled, host: cfg.host, autoDetect: cfg.autoDetect };
    cfg = Object.assign(cfg, next || {});
    saveCfg();
    const active = cfg.enabled || cfg.autoDetect;
    if (!active) { stop(); nodes = new Map(); }
    else if (prev.enabled !== cfg.enabled || prev.host !== cfg.host) { stop(); nodes = new Map(); begin(); }
    else if (!connected) begin();   // autoDetect newly on (or still probing) -> start/continue probing
    return { ...cfg };
}
function status() {
    return { enabled: cfg.enabled, host: cfg.host, autoDetect: cfg.autoDetect, connected, curHost, busy,
             nodes: nodes.size, lastUpdate, ageMs: lastUpdate ? Date.now() - lastUpdate : null };
}

module.exports = { start, stop, getState, status, getConfig, setConfig, setLogger, discover };
