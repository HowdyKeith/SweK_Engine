// ai-bridge/mdnsDiscovery.js — true mDNS / Zeroconf LAN discovery. v1 (v601).
//
// Uses bonjour-service (pure JS — no native build) to actively browse the LAN
// for Home Assistant + other common services and keep a live cache. Exposed via
// /net/mdns. This is the real thing: it finds the HA box by its broadcast, not
// just echoing a configured URL — HA advertises `_home-assistant._tcp` with its
// base_url / version / uuid in TXT records.
//
// Graceful: if bonjour-service isn't installed, or multicast (224.0.0.251:5353)
// is blocked/unavailable, discovery just reports unavailable and nothing breaks.
// UNTESTED on a real LAN from this build — verify on your network.

const TYPES = [
    { type: "home-assistant", protocol: "tcp" },   // the one we care about most
    // v4063 — the Enphase IQ Gateway (Envoy) advertises itself with its serial in the TXT record
    // ("serialnum"), which is how Home Assistant discovers it too. envoySolar.js reads the LAN
    // solar/battery truth straight off that gateway and asks THIS browser where it lives, rather
    // than opening a second socket on 224.0.0.251:5353 — two browsers on the multicast group is the
    // shape that produces the "UDP panics on Bun/Windows" bug the camera and Roku discoverers
    // already carry notes about. envoySolar.MDNS_TYPE must equal the `type` here; its gate asserts
    // that rather than trusting this comment.
    { type: "enphase-envoy", protocol: "tcp" },
    { type: "http",        protocol: "tcp" },
    { type: "https",       protocol: "tcp" },
    { type: "hap",         protocol: "tcp" },       // HomeKit accessories
    { type: "googlecast",  protocol: "tcp" },       // Chromecast / Google
    { type: "workstation", protocol: "tcp" },
    { type: "ipp",         protocol: "tcp" },        // printers
    { type: "ssh",         protocol: "tcp" },
];

let bonjour = null, browsers = [], available = false, lastError = null;
const cache = new Map();   // key -> shaped service

function keyOf(s) { return (s.fqdn || (s.name + "." + s.type)) + "@" + s.type; }
function shape(s) {
    return {
        name: s.name, type: s.type, protocol: s.protocol,
        host: s.host, port: s.port, fqdn: s.fqdn,
        addresses: (s.addresses || []).filter(a => /^\d+\.\d+\.\d+\.\d+$/.test(a)),   // IPv4 for display
        txt: s.txt || {},
        seen: Date.now(),
    };
}

function start() {
    if (bonjour) return;
    let Mod;
    try { const m = require("bonjour-service"); Mod = m.Bonjour || m.default || m; }
    catch (e) { lastError = "bonjour-service not installed (run `npm install bonjour-service` in ai-bridge)"; console.warn("[mdns]", lastError); return; }
    try {
        bonjour = new Mod({}, (err) => { lastError = String((err && err.message) || err); console.warn("[mdns] socket error:", lastError); });
        for (const t of TYPES) {
            const br = bonjour.find(t, (svc) => { try { cache.set(keyOf(svc), shape(svc)); } catch (e) {} });
            try { br.on("down", (svc) => { try { cache.delete(keyOf(svc)); } catch (e) {} }); } catch (e) {}
            browsers.push(br);
        }
        available = true;
        console.log("[mdns] discovery started — browsing " + TYPES.length + " service types");
    } catch (e) { lastError = String(e.message || e); available = false; console.warn("[mdns] start failed:", lastError); }
}

function rescan() { for (const br of browsers) { try { br.update && br.update(); } catch (e) {} } }

function list(typeFilter) {
    const all = [...cache.values()].sort((a, b) => (a.type + a.name).localeCompare(b.type + b.name));
    return typeFilter ? all.filter(s => s.type === typeFilter) : all;
}

function haInstances() {
    return list("home-assistant").map(s => ({
        name: s.name,
        host: s.host,
        port: s.port,
        addresses: s.addresses,
        url: s.txt.base_url || s.txt.internal_url || s.txt.external_url ||
             (s.addresses[0] ? `http://${s.addresses[0]}:${s.port}` : (s.host ? `http://${s.host}:${s.port}` : null)),
        version: s.txt.version || null,
        uuid: s.txt.uuid || null,
    }));
}

function status() { return { available, lastError, count: cache.size, types: TYPES.map(t => t.type) }; }

module.exports = { start, rescan, list, haInstances, status };
