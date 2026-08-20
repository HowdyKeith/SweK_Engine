// bun-prime.js — one-shot Node "primer" for the Bun runtime.
//
// Bun-on-Windows panics on dgram/UDP, so the engine skips UDP discovery (mDNS,
// ONVIF cameras, Roku SSDP, Fallout autodiscover) when running under Bun. This
// script runs that UDP discovery ON NODE, writes the results to
// discovery-cache.json, and exits. START_BUN.bat runs it before launching Bun,
// so the Bun engine starts with pre-discovered hosts/cameras even though it
// can't do the UDP itself. Node does the part Bun can't, then gets out of the way.
//
// Safe to run anytime; it only writes the cache and exits. No-op under Bun.
"use strict";
const fs = require("fs"), path = require("path");
const CACHE = path.join(__dirname, "discovery-cache.json");
const IS_BUN = !!(process.versions && process.versions.bun);

(async () => {
    if (IS_BUN) { console.log("[bun-prime] running under Bun — nothing to prime (run me on Node)"); process.exit(0); }
    const t0 = Date.now();
    const out = { ts: t0, cameras: [], mdns: [], roku: [], falloutHost: "" };
    // Run all four discoveries in PARALLEL (~3s total) so the launcher isn't held
    // up and we finish well before the hard-stop below.
    await Promise.all([
        (async () => { try { const cam = require("./cameraDiscoverBridge.js"); const r = await cam.discover({ onvifMs: 2500, timeout: 400 }); if (r && r.ok) out.cameras = r.cameras || []; } catch (e) { out.cameraErr = String((e && e.message) || e); } })(),
        (async () => { try { const mdns = require("./mdnsDiscovery.js"); mdns.start(); await new Promise(r => setTimeout(r, 2500)); out.mdns = mdns.list() || []; } catch (e) { out.mdnsErr = String((e && e.message) || e); } })(),
        (async () => { try { out.roku = await discoverRoku(2500); } catch (e) { out.rokuErr = String((e && e.message) || e); } })(),
        (async () => { try { out.falloutHost = await new Promise(r => { let done = false; const fin = (v) => { if (done) return; done = true; r(v || ""); }; try { require("./falloutBridge.js").discover(2500, ip => fin(ip)); } catch { fin(""); } setTimeout(() => fin(""), 3000); }); } catch (e) { out.falloutErr = String((e && e.message) || e); } })(),
    ]);
    out.tookMs = Date.now() - t0;
    try { fs.writeFileSync(CACHE, JSON.stringify(out)); } catch (e) { console.warn("[bun-prime] cache write failed:", e.message); }
    console.log("[bun-prime] cached " + out.cameras.length + " camera(s) + " + out.mdns.length + " mDNS + " + out.roku.length + " Roku" + (out.falloutHost ? " + Fallout@" + out.falloutHost : "") + " -> discovery-cache.json (" + out.tookMs + "ms)");
    process.exit(0);
})();

// Roku SSDP discovery (Node-only — dgram). Returns [{ip,name}].
function discoverRoku(timeoutMs) {
    return new Promise((resolve) => {
        const dgram = require("dgram"), http = require("http");
        const found = new Map();
        const probe = (ip) => new Promise(r2 => { const rq = http.request({ host: ip, port: 8060, path: "/query/device-info", method: "GET", timeout: 1000 }, rs => { if (rs.statusCode !== 200) { rs.resume(); return r2(null); } let b = ""; rs.on("data", c => b += c); rs.on("end", () => { if (!/<device-info|roku/i.test(b)) return r2(null); const fm = b.match(/<friendly-device-name>([^<]+)</) || b.match(/<user-device-name>([^<]+)</); const mm = b.match(/<model-name>([^<]+)</); r2({ ip, name: fm ? fm[1].trim() : "(roku)", model: mm ? mm[1].trim() : "" }); }); }); rq.on("error", () => r2(null)); rq.on("timeout", () => { rq.destroy(); r2(null); }); rq.end(); });
        let sock; try { sock = dgram.createSocket({ type: "udp4", reuseAddr: true }); } catch { return resolve([]); }
        const msearch = Buffer.from('M-SEARCH * HTTP/1.1\r\nHOST: 239.255.255.250:1900\r\nMAN: "ssdp:discover"\r\nST: roku:ecp\r\nMX: 2\r\n\r\n');
        sock.on("message", async (msg, rinfo) => { if (/roku/i.test(msg.toString()) && !found.has(rinfo.address)) { found.set(rinfo.address, { ip: rinfo.address }); const d = await probe(rinfo.address); if (d) found.set(rinfo.address, d); } });
        sock.on("error", () => {});
        try { sock.bind(() => { try { sock.setBroadcast(true); } catch {} try { sock.send(msearch, 0, msearch.length, 1900, "239.255.255.250"); } catch {} }); } catch { try { sock.close(); } catch {} return resolve([]); }
        setTimeout(() => { try { sock.close(); } catch {} resolve([...found.values()]); }, timeoutMs || 2500);
    });
}

// Never hang the launcher — hard stop (parallel discovery finishes ~3-4s).
setTimeout(() => { try { process.exit(0); } catch {} }, 12000);
