// ai-bridge/mdnsAdvertise.js — publish THIS engine on mDNS / Bonjour. v1 (v680).
//
// Sibling to mdnsDiscovery.js. Where that one *browses* the LAN for HA + other
// services, this one *publishes* the engine so phones / TVs / other PCs can
// reach it at a friendly name like `voxelengine.local:8787` instead of
// memorizing an IP that may change with DHCP renewals.
//
// Mechanics:
//   - Uses the same bonjour-service dep already installed for discovery.
//     bonjour-service runs its own mDNS responder, so the engine PC will
//     answer queries for `<host>.local` even if Windows Bonjour service
//     isn't installed locally.
//   - Service type `_http._tcp`, port = the bridge port.
//   - Service name + hostname both default to "voxelengine" (override via
//     MDNS_NAME env var or { name } option).
//   - TXT records advertise engine version + project URL + a couple of
//     hint flags so a future discovery UI can show what each instance is.
//
// Resolution on different OSes:
//   - macOS / iOS / iPadOS         : native mDNS, just works.
//   - Linux                        : works if Avahi is running (the default
//                                    on most desktop distros).
//   - Android (incl. Nvidia Shield): native Network Service Discovery; works.
//   - Windows                      : needs Bonjour service or mDNSResponder.
//                                    Ships with iTunes; the standalone
//                                    "Bonjour Print Services" installs just
//                                    the responder.
//   If the *client* can't resolve `.local`, they still reach the engine via
//   the raw LAN IP from /net/info. mDNS is additive, never required.
//
// Graceful degradation: if bonjour-service isn't installed or the multicast
// socket can't bind (port 5353 already in use, firewall, etc), this module
// reports unavailable + lastError and the rest of the bridge keeps running.
// UNTESTED on a real LAN from this build — verify on your network.

let bonjour = null;
let published = null;
let boundInterface = null;
let available = false;
let lastError = null;
let publishedAt = 0;
let advertisedName = "";
let advertisedHost = "";   // v1610 — the sanitized .local label (spaces/illegal chars stripped)
let advertisedPort = 0;
let _lastStartOpts = {};   // v1610 — remembered so setName() can republish on the same port/version

const _os = require("os");
const _fs = require("fs");
const _path = require("path");
const _CFG = _path.join(__dirname, "mdns.config.json");

// v1610 — persisted, user-editable mDNS name. Settings -> Network / mDNS writes here via /net/mdns/config.
function _loadCfg() { try { if (_fs.existsSync(_CFG)) return JSON.parse(_fs.readFileSync(_CFG, "utf8")) || {}; } catch {} return {}; }
function _saveCfg(o) { try { _fs.writeFileSync(_CFG, JSON.stringify(o, null, 2)); return true; } catch (e) { lastError = "mdns config save failed: " + (e && e.message); return false; } }

// Last octet of this box's real LAN IPv4 (skip loopback + the .1 virtual-adapter gateways), for a unique
// default like "SweK Engine 54". Empty string if nothing routable is found.
function _lanOctet() {
    try {
        const ifs = _os.networkInterfaces();
        for (const list of Object.values(ifs)) {
            for (const a of (list || [])) {
                if (a.family !== "IPv4" || a.internal) continue;
                const ip = a.address || "";
                if (/^169\.254\./.test(ip)) continue;          // link-local
                if (/\.1$/.test(ip)) continue;                  // typical virtual-adapter gateway
                if (/^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(ip)) return ip.split(".").pop();
            }
        }
    } catch {}
    return "";
}

// v1610 — default display name. "SweK Engine <octet>" keeps every box unique on the LAN while staying
// readable. Spaces are fine in an mDNS *instance* name; the .local host is sanitized separately.
function _defaultName() {
    // v1733 - prefer the real computer name (e.g. "Galaxina") so peers gossip it on handshake; fall back to a unique
    // "SweK Engine <octet>" only when the OS hostname is missing or generic (localhost).
    let h = ""; try { h = String(_os.hostname() || "").trim(); } catch {}
    if (h && !/^localhost(\.localdomain)?$/i.test(h)) return h;
    const o = _lanOctet(); return "SweK Engine" + (o ? " " + o : "");
}

// .local labels can't contain spaces or most punctuation — collapse to hyphens.
function _sanitizeHost(name) { return String(name || "").trim().replace(/[^A-Za-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 63) || "SweK-Engine"; }

// The name we WILL advertise (option > saved config > env > brand default). Used by the server to display it.
function configuredName() { return _lastStartOpts.name || _loadCfg().name || process.env.MDNS_NAME || _defaultName(); }


function start(opts = {}) {
    if (published) return;
    _lastStartOpts = { port: opts.port, type: opts.type, version: opts.version, interface: opts.interface, name: opts.name };
    // v1610 — resolve the display name: explicit option > saved config (Settings) > MDNS_NAME env > brand
    // default "SweK Engine <ip-octet>". Spaces are valid in an mDNS instance name; the .local host is the
    // sanitized form. Real peer discovery uses the UDP beacon (47474), not mDNS — this is just the friendly name.
    const name = opts.name || _loadCfg().name || process.env.MDNS_NAME || _defaultName();
    const host = _sanitizeHost(name);
    const port = opts.port || 8787;
    const type = opts.type || "http";
    const version = opts.version || process.env.ENGINE_VERSION || "unknown";

    let Mod;
    try {
        Mod = require("bonjour-service");
    } catch (e) {
        available = false;
        lastError = "bonjour-service dep missing (run `npm install` in ai-bridge)";
        return;
    }

    try {
        // bonjour-service exports either {Bonjour} or a default depending on version.
        const Bonjour = Mod.Bonjour || Mod.default || Mod;
        // v1151 — on a machine with several adapters (real LAN + VMware/Hyper-V/WSL
        // virtual ones), bonjour can announce `voxelengine.local` pointing at a
        // virtual IP that phones/TVs can't route to. Pin the advertiser to one
        // interface IP via MDNS_INTERFACE (e.g. your real LAN 192.168.50.132).
        boundInterface = opts.interface || process.env.MDNS_INTERFACE || null;
        bonjour = new Bonjour(boundInterface ? { interface: boundInterface } : {}, (err) => {
            // Async error callback — surfaces bind / socket errors that don't
            // throw from the constructor (e.g. 5353 already bound).
            lastError = err && (err.message || String(err));
            available = false;
        });

        published = bonjour.publish({
            name,
            host,                       // → `${host}.local` (sanitized: no spaces/illegal chars)
            type,
            port,
            txt: {
                engine: "claude-voxel",
                version,
                bridge: "ai-bridge",
                project: "EngineProject",
            },
        });
        // bonjour-service emits 'up' when the service is announced. Until then
        // we tentatively mark available; the error callback above will flip
        // it back if the multicast socket failed.
        published.on("up", () => { available = true; publishedAt = Date.now(); });
        published.on("error", (err) => {
            lastError = err && (err.message || String(err));
            available = false;
            // v1609 — friendly one-liner instead of leaving a raw stack trace unexplained. Harmless: peer
            // discovery is unaffected (it uses the UDP beacon, not mDNS).
            if (/in use|already/i.test(lastError || "")) console.log("[mdns] '" + name + "' already on the LAN — skipping our mDNS advert (peer discovery still works via the UDP beacon)");
        });
        // v1609 — some bonjour-service builds surface a name conflict on the Bonjour instance rather than the
        // published service. Attach a handler so it can't bubble out as an unhandled error / stack trace.
        try { if (bonjour && typeof bonjour.on === "function") bonjour.on("error", (err) => { lastError = err && (err.message || String(err)); }); } catch {}

        advertisedName = name;
        advertisedHost = host;
        advertisedPort = port;
        available = true;        // optimistic — async errors will correct
        publishedAt = Date.now();
    } catch (e) {
        available = false;
        lastError = e && (e.message || String(e));
        try { if (bonjour) bonjour.destroy(); } catch {}
        bonjour = null;
        published = null;
    }
}

function status() {
    return {
        available,
        lastError,
        name: advertisedName,
        host: advertisedHost ? `${advertisedHost}.local` : null,
        port: advertisedPort,
        boundInterface,
        url: advertisedHost ? `http://${advertisedHost}.local:${advertisedPort}/` : null,
        publishedAt,
        configuredName: configuredName(),
        defaultName: _defaultName(),
    };
}

function stop() {
    try { if (published) published.stop(); } catch {}
    try { if (bonjour) bonjour.unpublishAll(); } catch {}
    try { if (bonjour) bonjour.destroy(); } catch {}
    bonjour = null;
    published = null;
    available = false;
    advertisedName = "";
    advertisedHost = "";
    advertisedPort = 0;
}

// v1610 — Settings -> Network / mDNS calls this. Persists the chosen name and republishes immediately. Pass
// "" / null to clear the override and fall back to the brand default. Returns the resulting status().
function setName(name) {
    const cfg = _loadCfg();
    const clean = String(name == null ? "" : name).trim();
    if (clean) cfg.name = clean; else delete cfg.name;
    _saveCfg(cfg);
    const wasOpts = Object.assign({}, _lastStartOpts);
    stop();
    delete wasOpts.name;   // let start() re-resolve from the freshly-saved config
    start(wasOpts);
    return status();
}

module.exports = { start, stop, status, setName, configuredName };
