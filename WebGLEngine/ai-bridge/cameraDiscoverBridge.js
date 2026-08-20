// ai-bridge/cameraDiscoverBridge.js — find IP cameras on the LAN two ways:
//   1) ONVIF WS-Discovery — a UDP multicast SOAP probe most IP cameras answer
//      with their device service URL (XAddrs), which carries the IP.
//   2) RTSP port scan — TCP-connect port 554 across the local /24(s); an open
//      554 is a strong "this is a camera/NVR" signal.
// Feeds the "Scan network for cameras" button -> one-click add to go2rtc.
// NOTE: UDP multicast panics on Bun/Windows (same issue mDNS has), so ONVIF is
// skipped under Bun and we fall back to the RTSP scan, which works everywhere.
"use strict";
const os = require("os");
const net = require("net");
const dgram = require("dgram");

const IS_BUN = !!(process.versions && process.versions.bun);

function ownSubnets() {
    const subs = new Set(), ips = [];
    const ifs = os.networkInterfaces();
    for (const name of Object.keys(ifs)) for (const a of (ifs[name] || [])) {
        if (a && a.family === "IPv4" && !a.internal && !/^169\.254\./.test(a.address)) { ips.push(a.address); const p = a.address.split("."); subs.add(p[0] + "." + p[1] + "." + p[2]); }
    }
    return { subnets: [...subs], ips };
}

// v1989 — one probe socket PER IPv4 interface. The old single unbound socket sent the multicast
// probe out the DEFAULT-ROUTE interface only; on a multi-homed box (Ethernet + WiFi + NetBird/
// Tailscale virtual adapters) the probe frequently left the wrong NIC, so ONVIF cameras showed up
// on some scans and not others — the classic "flaky discovery" symptom. Each socket binds its
// interface address and pins the multicast egress with setMulticastInterface.
function onvifDiscover(timeoutMs) {
    return new Promise((resolve) => {
        const found = {};
        if (IS_BUN) return resolve(found);
        const localIps = ownSubnets().ips;
        if (!localIps.length) return resolve(found);
        let pending = localIps.length;
        const finishOne = () => { if (--pending <= 0) resolve(found); };
        for (const localIp of localIps) _onvifProbeVia(localIp, found, timeoutMs || 3000, finishOne);
    });
}
function _onvifProbeVia(localIp, found, timeoutMs, doneCb) {
    {
        let sock; try { sock = dgram.createSocket({ type: "udp4", reuseAddr: true }); } catch { return doneCb(); }
        const probe = '<?xml version="1.0" encoding="UTF-8"?>' +
            '<e:Envelope xmlns:e="http://www.w3.org/2003/05/soap-envelope" xmlns:w="http://schemas.xmlsoap.org/ws/2004/08/addressing" xmlns:d="http://schemas.xmlsoap.org/ws/2005/04/discovery" xmlns:dn="http://www.onvif.org/ver10/network/wsdl">' +
            '<e:Header><w:MessageID>uuid:' + Math.random().toString(16).slice(2) + "-" + Date.now() + '</w:MessageID>' +
            '<w:To e:mustUnderstand="true">urn:schemas-xmlsoap-org:ws:2005:04:discovery</w:To>' +
            '<w:Action e:mustUnderstand="true">http://schemas.xmlsoap.org/ws/2005/04/discovery/Probe</w:Action></e:Header>' +
            '<e:Body><d:Probe><d:Types>dn:NetworkVideoTransmitter</d:Types></d:Probe></e:Body></e:Envelope>';
        let ended = false;
        const end = () => { if (ended) return; ended = true; try { sock.close(); } catch {} doneCb(); };
        sock.on("error", end);
        sock.on("message", (msg, rinfo) => {
            try { const s = msg.toString(); const m = s.match(/<[^>]*XAddrs[^>]*>([^<]+)</i); const xaddr = m ? m[1].trim().split(/\s+/)[0] : ""; const ip = rinfo.address; found[ip] = found[ip] || { ip, onvif: true, xaddr: "" }; found[ip].onvif = true; if (xaddr) found[ip].xaddr = xaddr; } catch {}
        });
        try {
            sock.bind(0, localIp, () => {
                try { sock.setBroadcast(true); } catch {}
                try { sock.setMulticastInterface(localIp); } catch {}   // pin the multicast egress NIC
                try { sock.setMulticastTTL(2); } catch {}
                const buf = Buffer.from(probe);
                const fire = () => { try { sock.send(buf, 0, buf.length, 3702, "239.255.255.250"); } catch {} };
                fire(); setTimeout(fire, 400);
            });
        } catch { return end(); }
        setTimeout(end, timeoutMs || 3000);
    }
}

function scanPort(host, port, timeoutMs) {
    return new Promise((resolve) => {
        const sock = new net.Socket(); let done = false;
        const fin = (ok) => { if (done) return; done = true; try { sock.destroy(); } catch {} resolve(ok); };
        sock.setTimeout(timeoutMs || 500);
        sock.once("connect", () => fin(true));
        sock.once("timeout", () => fin(false));
        sock.once("error", () => fin(false));
        try { sock.connect(port, host); } catch { fin(false); }
    });
}

async function scanSubnetRtsp(subnet, ports, perHostTimeout, concurrency) {
    ports = ports || [554]; const hits = {};
    const hosts = []; for (let i = 1; i <= 254; i++) hosts.push(subnet + "." + i);
    let idx = 0; const C = concurrency || 48;
    async function worker() { while (idx < hosts.length) { const host = hosts[idx++]; for (const p of ports) { if (await scanPort(host, p, perHostTimeout)) { hits[host] = hits[host] || { ip: host, ports: [] }; hits[host].ports.push(p); } } } }
    await Promise.all(Array.from({ length: C }, worker));
    return hits;
}

async function discover(opts) {
    opts = opts || {};
    const { subnets, ips } = ownSubnets();
    const merged = {};
    const onvifP = onvifDiscover(opts.onvifMs || 3000);
    // v1989 — 450ms per-host connect was too tight on WiFi (ARP resolution alone can eat 300-500ms
    // when 48 probes storm the AP at once), so cameras dropped in and out between scans. 900ms +
    // lower concurrency trades ~15s of scan time for repeatable results.
    const scanP = Promise.all(subnets.map(s => scanSubnetRtsp(s, opts.ports || [554], opts.timeout || 900, opts.concurrency || 24)));
    const [onvif, scans] = await Promise.all([onvifP, scanP]);
    for (const ip of Object.keys(onvif)) { merged[ip] = merged[ip] || { ip }; merged[ip].onvif = true; if (onvif[ip].xaddr) merged[ip].xaddr = onvif[ip].xaddr; }
    for (const sc of scans) for (const ip of Object.keys(sc)) { merged[ip] = merged[ip] || { ip }; merged[ip].rtsp = sc[ip].ports.indexOf(554) >= 0; merged[ip].ports = sc[ip].ports; }
    // v1179 — on Bun, ONVIF UDP was skipped; fold in whatever a Node primer
    // (bun-prime.js) cached so ONVIF-only cameras still show up.
    let primed = false;
    if (IS_BUN) { try { const cache = JSON.parse(require("fs").readFileSync(require("path").join(__dirname, "discovery-cache.json"), "utf8")); if (cache && Array.isArray(cache.cameras) && (Date.now() - (cache.ts || 0) < 30 * 60 * 1000)) { for (const c of cache.cameras) { if (!c || !c.ip) continue; merged[c.ip] = merged[c.ip] || { ip: c.ip }; if (c.onvif) merged[c.ip].onvif = true; if (c.xaddr) merged[c.ip].xaddr = c.xaddr; merged[c.ip].primed = true; primed = true; } } } catch {} }
    const list = Object.keys(merged).map(ip => { const c = merged[ip]; c.suggest = "rtsp://USER:PASS@" + ip + ":554/"; return c; }).sort((a, b) => a.ip.localeCompare(b.ip, undefined, { numeric: true }));
    return { ok: true, ownIps: ips, subnets, bun: IS_BUN, primed, count: list.length, cameras: list, note: IS_BUN ? ("ONVIF UDP discovery is skipped on Bun (socket panic) — RTSP port scan" + (primed ? " + Node-primed ONVIF cache." : " only; run bun-prime.js on Node to add ONVIF.")) : undefined };
}

module.exports = { discover, onvifStreamUri };

// v1962 — ONVIF GetStreamUri: the REAL way to get a camera's exact RTSP path automatically (no guessing
// among vendor path styles). Given the camera IP (+ the ONVIF password), we do the ONVIF SOAP dance:
//   GetCapabilities -> Media service URL -> GetProfiles -> GetStreamUri(profile) -> rtsp://... URI.
// Uses WS-Security UsernameToken digest (PasswordDigest = Base64(SHA1(nonce + created + password))),
// which is what almost all cameras require. Pure Node http + crypto, no external deps.
const _crypto = require("crypto");
const _http = require("http");

function _wsSecurity(user, pass) {
    if (!user) return "";
    const created = new Date().toISOString();
    const nonceBuf = _crypto.randomBytes(16);
    const nonceB64 = nonceBuf.toString("base64");
    const digest = _crypto.createHash("sha1").update(Buffer.concat([nonceBuf, Buffer.from(created, "utf8"), Buffer.from(pass || "", "utf8")])).digest("base64");
    return '<s:Header><Security s:mustUnderstand="1" xmlns="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd">' +
        '<UsernameToken><Username>' + _xesc(user) + '</Username>' +
        '<Password Type="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-username-token-profile-1.0#PasswordDigest">' + digest + '</Password>' +
        '<Nonce EncodingType="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-soap-message-security-1.0#Base64Binary">' + nonceB64 + '</Nonce>' +
        '<Created xmlns="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-utility-1.0.xsd">' + created + '</Created>' +
        '</UsernameToken></Security></s:Header>';
}
function _xesc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }

function _soap(url, body, action, timeoutMs) {
    return new Promise((resolve) => {
        let u; try { u = new URL(url); } catch { return resolve({ ok: false, error: "bad service url" }); }
        const payload = '<?xml version="1.0" encoding="UTF-8"?>' +
            '<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope">' + body + '</s:Envelope>';
        const req = _http.request({
            host: u.hostname, port: u.port || 80, path: u.pathname + (u.search || ""), method: "POST",
            headers: { "Content-Type": 'application/soap+xml; charset=utf-8; action="' + (action || "") + '"', "Content-Length": Buffer.byteLength(payload) },
            timeout: timeoutMs || 5000,
        }, (res) => { let d = ""; res.on("data", c => d += c); res.on("end", () => resolve({ ok: res.statusCode < 400, status: res.statusCode, body: d })); });
        req.on("error", e => resolve({ ok: false, error: String(e && e.message || e) }));
        req.on("timeout", () => { try { req.destroy(); } catch {} resolve({ ok: false, error: "timeout" }); });
        req.write(payload); req.end();
    });
}

// v1989 — resolve Media service URL CANDIDATES. The old version had a fallback loop that
// `return`ed on its FIRST iteration ("/onvif/media_service" always, never the alternates, never
// verified) — so any camera whose media endpoint lives elsewhere failed GetProfiles with the
// misleading "wrong password or ONVIF not enabled?" error. Now we return every plausible URL and
// the caller tries each until one answers GetProfiles.
async function _mediaUrlCandidates(deviceUrl, user, pass) {
    const cands = [];
    const add = (u) => { if (u && cands.indexOf(u) === -1) cands.push(u); };
    const body = _wsSecurity(user, pass) + '<s:Body><GetCapabilities xmlns="http://www.onvif.org/ver10/device/wsdl"><Category>Media</Category></GetCapabilities></s:Body>';
    const r = await _soap(deviceUrl, body, "http://www.onvif.org/ver10/device/wsdl/GetCapabilities");
    if (r.ok && r.body) { const m = r.body.match(/<[^>]*Media[^>]*>[\s\S]*?<[^>]*XAddr[^>]*>([^<]+)</i) || r.body.match(/Media[\s\S]{0,200}?<[^>]*XAddr[^>]*>([^<]+)</i); if (m) add(m[1].trim()); }
    try { const u = new URL(deviceUrl); for (const p of ["/onvif/media_service", "/onvif/Media", "/onvif/media"]) add(u.origin + p); } catch {}
    add(deviceUrl);
    return cands;
}

// Main entry: given camera IP (and optional xaddr + creds), return the exact RTSP URI(s).
async function onvifStreamUri(opts) {
    opts = opts || {};
    const ip = String(opts.ip || "").trim();
    const user = opts.user || "admin";
    const pass = opts.pass || "";
    if (!ip && !opts.xaddr) return { ok: false, error: "camera ip required" };
    // device service URL: prefer the discovered xaddr, else the ONVIF default (port 8000 is common; 80 too)
    let deviceUrl = opts.xaddr || "";
    if (!deviceUrl) { const port = opts.onvifPort || 8000; deviceUrl = "http://" + ip + ":" + port + "/onvif/device_service"; }
    try {
        // v1989 — try every media-URL candidate until one answers GetProfiles (was: single guess).
        const cands = await _mediaUrlCandidates(deviceUrl, user, pass);
        let mediaUrl = null, pr = null, lastErr = null;
        for (const cand of cands) {
            const r = await _soap(cand, _wsSecurity(user, pass) + '<s:Body><GetProfiles xmlns="http://www.onvif.org/ver10/media/wsdl"/></s:Body>', "http://www.onvif.org/ver10/media/wsdl/GetProfiles");
            if (r.ok) { mediaUrl = cand; pr = r; break; }
            lastErr = r.error || r.status;
            // 401/400 with a Fault usually means the endpoint EXISTS but auth failed — no point trying alternates
            if (r.status === 401) { mediaUrl = cand; pr = r; break; }
        }
        if (!pr || !pr.ok) return { ok: false, error: "GetProfiles failed (" + (lastErr || (pr && pr.status)) + ") — wrong password, ONVIF disabled, or camera clock skewed >5min (WS-Security digest is time-sensitive)?", deviceUrl, tried: cands };
        const tokens = []; const re = /token="([^"]+)"/g; let m; while ((m = re.exec(pr.body))) tokens.push(m[1]);
        if (!tokens.length) return { ok: false, error: "no media profiles returned", mediaUrl };
        // GetStreamUri for each profile
        const streams = [];
        for (const tok of tokens.slice(0, 4)) {
            const body = _wsSecurity(user, pass) +
                '<s:Body><GetStreamUri xmlns="http://www.onvif.org/ver10/media/wsdl">' +
                '<StreamSetup><Stream xmlns="http://www.onvif.org/ver10/schema">RTP-Unicast</Stream>' +
                '<Transport xmlns="http://www.onvif.org/ver10/schema"><Protocol>RTSP</Protocol></Transport></StreamSetup>' +
                '<ProfileToken>' + _xesc(tok) + '</ProfileToken></GetStreamUri></s:Body>';
            const sr = await _soap(mediaUrl, body, "http://www.onvif.org/ver10/media/wsdl/GetStreamUri");
            if (sr.ok && sr.body) { const um = sr.body.match(/<[^>]*Uri[^>]*>([^<]+)</i); if (um) streams.push({ profile: tok, uri: um[1].trim() }); }
        }
        if (!streams.length) return { ok: false, error: "profiles found but no RTSP URI returned", mediaUrl, profiles: tokens };
        return { ok: true, ip, mediaUrl, streams, count: streams.length };
    } catch (e) { return { ok: false, error: String(e && e.message || e) }; }
}
