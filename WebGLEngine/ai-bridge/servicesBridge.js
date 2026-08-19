// WebGLEngine/ai-bridge/servicesBridge.js — v2629
//
// A PEER-SERVICES REGISTRY: every box advertises the services it exposes, and the LAN discovers them.
//
// ---- WHY -----------------------------------------------------------------------------------------------------------
//
// The engine already has a capability system (/sync/caps): "I can do text2voxel FOR you." That is a proxyable
// capability -- you send work, the peer runs it. A SERVICE is different: an endpoint a box exposes that others
// reach DIRECTLY. The OKF bundle at /okf/ is one. A Mac running Rockxy is another. Keith's Mac-services thread
// is exactly this: run something on the Mac, have the LAN know it is there and how to reach it.
//
// So this is the registry. /services/self is what THIS box exposes. /services is the union across the LAN: self
// plus every reachable peer's /services/self, each tagged with the peer that offers it and whether it answered.
// A Mac advertises {name:"rockxy", url:"http://mac:9000"} in its services.local.json and it shows up here, next
// to this engine's okf endpoint -- same owns/handle shape as every other bridge, no new peer machinery invented.
//
// ---- DISCIPLINE ----------------------------------------------------------------------------------------------------
//
//   * Read-only + public: it advertises where things are, it does not run them. No trust gate.
//   * Dependency-injected: the peer list and the peer-fetch come in through ctx, so the server wires in the real
//     _chatPeers/_peerJSON and the gate wires in mocks. The bridge holds no peer machinery of its own.
//   * An unreachable peer is REPORTED, never fatal: a Mac that is asleep marks reachable:false, it does not hang
//     or error the whole registry. A REGISTRY THAT ONE DEAD PEER CAN TAKE DOWN IS NOT A REGISTRY.
"use strict";
const fs = require("fs");
const path = require("path");

// This box's built-in services -- the endpoints the engine itself exposes.
const BUILTIN = [
    { name: "okf", path: "/okf/", kind: "knowledge", desc: "OKF v0.1 self-knowledge bundle" },
    { name: "okf-brief", path: "/okf/brief.json", kind: "knowledge", desc: "session brief consumed from the OKF bundle" },
    { name: "okf-manifest", path: "/okf/manifest.json", kind: "knowledge", desc: "machine index of the OKF bundle" },
];

// Extra services a box declares locally (e.g. a Mac advertising Rockxy). Optional file; absent is fine.
function localServices() {
    try {
        const p = path.join(__dirname, "services.local.json");
        if (!fs.existsSync(p)) return [];
        const j = JSON.parse(fs.readFileSync(p, "utf8"));
        return Array.isArray(j) ? j : (Array.isArray(j && j.services) ? j.services : []);
    } catch { return []; }
}

// The services THIS box exposes: built-ins + locally-declared + any live proxy-caps handed in via ctx.
function selfServices(ctx = {}) {
    const out = BUILTIN.slice();
    for (const s of localServices()) if (s && s.name) out.push({ name: s.name, path: s.path, url: s.url, kind: s.kind || "external", desc: s.desc || "" });
    const caps = (ctx.caps && ctx.caps()) || {};
    for (const [name, on] of Object.entries(caps)) if (on) out.push({ name, kind: "capability", desc: "proxyable capability (send work via /sync)" });
    return out;
}

function owns(url) {
    const p = (url || "").split("?")[0];
    return p === "/services" || p === "/services/" || p === "/services/self";
}

async function handle(req, res, ctx = {}) {
    const sendJson = ctx.sendJson || ((o, c = 200) => { res.writeHead(c, { "Content-Type": "application/json" }); res.end(JSON.stringify(o)); });
    const pathname = (req.url || "").split("?")[0];
    const selfId = (ctx.selfId && ctx.selfId()) || "this-box";
    const self = { peer: selfId, services: selfServices(ctx) };

    if (pathname === "/services/self") return sendJson({ ok: true, ...self });

    // /services -- aggregate self + each peer's /services/self. One dead peer must not sink the registry.
    const peers = (ctx.listPeers && ctx.listPeers()) || [];
    const fetchPeer = ctx.fetchPeer || (async () => ({ ok: false, unreachable: true }));
    const results = await Promise.all(peers.map(async (base) => {
        try {
            const r = await fetchPeer(base, "/services/self");
            if (r && r.ok && Array.isArray(r.services)) return { peer: base, reachable: true, services: r.services };
            return { peer: base, reachable: false, services: [] };
        } catch { return { peer: base, reachable: false, services: [] }; }
    }));
    const total = self.services.length + results.reduce((n, p) => n + (p.services ? p.services.length : 0), 0);
    return sendJson({ ok: true, self, peers: results, count: total });
}

module.exports = { owns, handle, selfServices, BUILTIN };
