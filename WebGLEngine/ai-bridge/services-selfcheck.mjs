// WebGLEngine/ai-bridge/services-selfcheck.mjs — v2629
//
// Run: node ai-bridge/services-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs.
//
// Proves the peer-services registry advertises this box, aggregates peers, surfaces an externally-advertised
// service (the Mac-Rockxy case), and survives a dead peer.
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const services = require("./servicesBridge.js");

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };

function mockRes() { return { code: 0, headers: {}, body: "", writeHead(c, h) { this.code = c; this.headers = h || {}; }, end(x) { if (x != null) this.body += x.toString(); } }; }
async function get(url, ctx) { const res = mockRes(); await services.handle({ url }, res, ctx); try { return { code: res.code, json: JSON.parse(res.body) }; } catch { return { code: res.code, json: null }; }}

// a LAN of two peers: one awake (a Mac advertising Rockxy), one asleep (unreachable)
const MAC = "http://mac.local:8787", SLEEPY = "http://galaxina.local:8787";
const ctx = {
    selfId: () => "engine-box",
    caps: () => ({ text2voxel: true, ha: false }),          // one live capability, one off
    listPeers: () => [MAC, SLEEPY],
    fetchPeer: async (base) => {
        if (base === MAC) return { ok: true, services: [{ name: "rockxy", url: "http://mac.local:9000", kind: "external", desc: "macOS HTTPS debugging proxy" }] };
        throw new Error("connect ETIMEDOUT");                 // the sleepy peer
    },
};

// ---- 1. NAMESPACE ------------------------------------------------------------------------------------------------
ok("!! owns /services and /services/self, not /serviceX", services.owns("/services") && services.owns("/services/self") && !services.owns("/serviceX") && !services.owns("/service"),
   "the registry claims exactly its namespace; over-matching would swallow unrelated routes.");

// ---- 2. /services/self ADVERTISES THIS BOX -----------------------------------------------------------------------
{
    const r = await get("/services/self", ctx);
    const names = (r.json && r.json.services || []).map((s) => s.name);
    ok("!! /services/self lists this box's services (okf + live caps)", r.code === 200 && names.includes("okf") && names.includes("okf-brief") && names.includes("text2voxel") && !names.includes("ha"),
       "self advertises [" + names.join(", ") + "]. Built-in endpoints (okf, brief, manifest) plus live proxy-caps (text2voxel on, ha off) -- a peer asking what this box offers gets a straight answer.");
}

// ---- 3. /services AGGREGATES THE LAN, AND THE MAC's ROCKXY SHOWS UP -----------------------------------------------
{
    const r = await get("/services", ctx);
    const macEntry = (r.json && r.json.peers || []).find((p) => p.peer === MAC);
    const hasRockxy = macEntry && macEntry.services.some((s) => s.name === "rockxy");
    ok("!! /services surfaces a peer's advertised service (the Mac's Rockxy)", r.code === 200 && macEntry && macEntry.reachable && hasRockxy,
       hasRockxy ? "the Mac's rockxy service appears under its peer, reachable, with its url -- the LAN now KNOWS the Mac runs Rockxy and how to reach it. This is Keith's Mac-services thread, working." : "rockxy did NOT surface from the Mac peer.");
}

// ---- 4. A DEAD PEER IS REPORTED, NOT FATAL -----------------------------------------------------------------------
{
    const r = await get("/services", ctx);
    const sleepy = (r.json && r.json.peers || []).find((p) => p.peer === SLEEPY);
    const macOk = (r.json && r.json.peers || []).find((p) => p.peer === MAC && p.reachable);
    ok("!! an unreachable peer marks reachable:false without sinking the registry", r.code === 200 && sleepy && sleepy.reachable === false && !!macOk,
       "the sleepy peer threw ETIMEDOUT -> reachable:false, empty services; the Mac still came back fine in the same response. A REGISTRY ONE DEAD PEER CAN TAKE DOWN IS NOT A REGISTRY.");
}

// ---- 5. THE COUNT SPANS THE WHOLE LAN ----------------------------------------------------------------------------
{
    const r = await get("/services", ctx);
    const selfN = r.json.self.services.length;
    ok("!! count is self + every reachable peer's services", r.code === 200 && r.json.count === selfN + 1,
       "count = " + r.json.count + " = " + selfN + " self services + 1 from the Mac (the sleepy peer contributes 0). One number for 'what does the whole LAN offer'.");
}

console.log(fails ? "\nservices-selfcheck: " + fails + " FAILED" : "\nservices-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
