// FILE: ai-bridge/androidInviteBridge.js
//
// v2923 -- CANDIDATES, INVITES, AND CONSENT. Finding a phone and equipping a phone are different acts, and this
// file keeps them different. Detection is passive and free; delivery requires a human to press something; and
// the one delivery path that could touch a phone without its user present (adb) requires that phone to have
// ALREADY been paired by its owner in Android's own developer settings, which is a consent act we cannot fake
// and would not want to.
//
// THE CONSENT LADDER, RUNG BY RUNG. Each rung needs everything below it.
//
//   0  SIGHTING      a device told us what it is by making a request. No action taken, ever.
//   1  CANDIDATE     the operator looks at a list. Still nothing sent.
//   2  INVITE        the operator confirms ONE pre-filled candidate. Mints a one-time, expiring token. Still
//                    nothing pushed -- the invite is a door the phone may choose to walk through.
//   3  PHONE OPT-IN  the phone opens the invite and taps. The phone is now asking us.
//   4  APK/ADB PUSH  operator-initiated, and only to a device whose owner previously enabled wireless debugging
//                    and approved this host's RSA fingerprint on the phone's own screen.
//
// Nothing in this file auto-advances a rung. There is no timer that installs anything, no broadcast, no
// "convenience" path that skips the confirm. The selfcheck asserts each of those as a property, because a
// consent model that is only a comment is a consent model one refactor from being gone.
//
// WHY SIGHTINGS AND NOT A PORT SCAN AS THE PRIMARY SIGNAL. A phone that has loaded a page from this engine has
// already told us it is Android, in its own words, having chosen to talk to us. That is a better signal than
// anything a scan produces AND it is the only one that involves no unsolicited packets. ARP/OUI is offered as a
// second tier (a read of the local ARP cache -- already-collected data, no probing), and an ADB reachability
// probe as an explicitly opt-in third tier, because THAT one does send packets and the operator should have to
// say so.
//
// FINDING (v2923): remoteVisitors.recordVisit() deliberately skips LAN and loopback addresses, so the engine's
// existing visitor log sees tunnel visitors only. LAN phones therefore need their own ledger, which is what
// noteSighting() below is. Both are merged by candidates().
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const { execFile } = require("child_process");

const CFG = {
    engineRoot: path.resolve(__dirname, ".."),
    apkDir: path.join(__dirname, "apks"),
    inviteTtlMs: 30 * 60 * 1000,          // an invite is a door, not a standing offer
    log: (...a) => console.log("[android-invite]", ...a),
    execFile,                              // seam: the gate injects a fake adb
    remoteVisitors: null,                  // seam: injected by server.js if available
};
function configure(o) { Object.assign(CFG, o || {}); }

// v2926 -- GAP FIX: the remoteVisitors seam was never injected by server.js, so the sweep's tunnel-visitor tier
// (an Android phone that visited over Cloudflare) silently returned nothing in production. Lazy-require it here,
// same pattern as androidPeerBridge lazy-requiring this bridge. A test that injects a fake via configure() still
// wins (CFG.remoteVisitors set explicitly is not overwritten).
try { if (!CFG.remoteVisitors) CFG.remoteVisitors = require("./remoteVisitors.js"); } catch {}

// ---- RUNG 0: SIGHTINGS ---------------------------------------------------------------------------------------------
const SIGHTINGS = new Map();               // ip -> { ip, ua, first, last, hits, android, termux }
const ANDROID_RE = /android/i;
const TERMUX_RE = /termux|wget|curl/i;     // a Termux peer fetching over curl identifies differently from Chrome

function noteSighting(ip, ua) {
    ip = String(ip || "").replace(/^::ffff:/, "");
    if (!ip) return;
    const now = Date.now();
    const s = SIGHTINGS.get(ip) || { ip, ua: "", first: now, hits: 0, android: false, termux: false };
    s.last = now; s.hits++;
    if (ua) { s.ua = String(ua).slice(0, 160); s.android = ANDROID_RE.test(ua); s.termux = TERMUX_RE.test(ua); }
    SIGHTINGS.set(ip, s);
    if (SIGHTINGS.size > 500) SIGHTINGS.delete(SIGHTINGS.keys().next().value);
}

// ---- RUNG 1: CANDIDATES ----------------------------------------------------------------------------------------------
// Tier B: the ARP cache. Reading it sends nothing -- these are addresses this box already talked to.
const OUI = {
    // a deliberately small, honest table: the vendors that ship Android in quantity. An unlisted MAC is reported
    // as "unknown vendor", never guessed at.
    "SAMSUNG": /^(00:16:6b|00:1a:8a|34:23:87|8c:77:12|a0:21:95|ac:5f:3e|c8:19:f7|e8:50:8b)/i,
    "Google": /^(00:1a:11|3c:5a:b4|54:60:09|94:eb:2c|f4:f5:d8|f8:8f:ca)/i,
    "Xiaomi": /^(00:9e:c8|10:2a:b3|28:6c:07|64:09:80|78:11:dc|8c:be:be|f8:a4:5f)/i,
    "OnePlus": /^(64:a2:f9|94:65:2d|c0:ee:fb)/i,
    "Motorola": /^(00:0a:28|14:9a:10|40:78:6a|5c:51:88|cc:c3:ea)/i,
    "Huawei": /^(00:e0:fc|20:0b:c7|48:46:fb|5c:7d:5e|c8:94:bb)/i,
    "OPPO/vivo": /^(28:3f:69|54:3d:37|94:d0:29|d0:c5:d3)/i,
};
function arpTable(cb) {
    CFG.execFile("arp", ["-a"], { timeout: 5000, windowsHide: true }, (err, stdout) => {
        if (err) return cb([]);
        const out = [];
        for (const line of String(stdout || "").split("\n")) {
            const ip = (line.match(/(\d{1,3}(?:\.\d{1,3}){3})/) || [])[1];
            const mac = (line.match(/([0-9a-f]{2}[:-]){5}[0-9a-f]{2}/i) || [])[0];
            if (!ip || !mac) continue;
            const norm = mac.replace(/-/g, ":").toLowerCase();
            let vendor = null;
            for (const [name, re] of Object.entries(OUI)) if (re.test(norm)) { vendor = name; break; }
            out.push({ ip, mac: norm, vendor });
        }
        cb(out);
    });
}

// Tier C: ADB reachability. THIS ONE SENDS PACKETS -- opt-in only, never part of a default sweep.
function probeAdb(ip, cb) {
    const net = require("net");
    const sock = new net.Socket();
    let done = false;
    const finish = (open) => { if (done) return; done = true; try { sock.destroy(); } catch {} cb(open); };
    sock.setTimeout(700);
    sock.once("connect", () => finish(true));
    sock.once("timeout", () => finish(false));
    sock.once("error", () => finish(false));
    try { sock.connect(5555, ip); } catch { finish(false); }
}

function candidates({ probe = false } = {}, cb) {
    const byIp = new Map();
    const add = (ip, patch) => byIp.set(ip, Object.assign({ ip, why: [] }, byIp.get(ip), patch,
        { why: [...((byIp.get(ip) || {}).why || []), ...(patch.why || [])] }));

    for (const s of SIGHTINGS.values()) {
        if (!s.android) continue;
        add(s.ip, { ua: s.ua, lastSeen: s.last, hits: s.hits, tier: "A", confidence: "self-identified",
            why: ["visited this engine and its user-agent says Android"] });
    }
    if (CFG.remoteVisitors && CFG.remoteVisitors.visitLog) {
        try {
            for (const v of CFG.remoteVisitors.visitLog(200) || []) {
                if (!ANDROID_RE.test(v.ua || "")) continue;
                add(v.ip, { ua: v.ua, lastSeen: v.last, tier: "A", confidence: "self-identified", remote: true,
                    why: ["visited over the tunnel with an Android user-agent"] });
            }
        } catch {}
    }
    arpTable((rows) => {
        for (const r of rows) {
            if (!r.vendor) continue;
            add(r.ip, { mac: r.mac, vendor: r.vendor, tier: byIp.has(r.ip) ? "A" : "B",
                confidence: byIp.has(r.ip) ? "self-identified" : "vendor-guess",
                why: ["MAC prefix belongs to " + r.vendor + " (read from this box's ARP cache; nothing was sent)"] });
        }
        const list = [...byIp.values()].sort((a, b) => (b.lastSeen || 0) - (a.lastSeen || 0));
        if (!probe) return cb({ ok: true, probed: false, candidates: list,
            note: "tiers A (self-identified) and B (ARP/OUI) only -- no packets were sent. Add ?probe=1 to also test port 5555, which DOES send packets." });
        let left = list.length;
        if (!left) return cb({ ok: true, probed: true, candidates: [] });
        for (const c of list) probeAdb(c.ip, (open) => {
            c.adbReachable = open;
            if (open) c.why.push("port 5555 is open -- wireless debugging appears enabled, so an operator push is POSSIBLE (still requires this host to be an approved fingerprint on the phone)");
            if (--left === 0) cb({ ok: true, probed: true, candidates: list,
                note: "tier C probe sent a TCP connect to port 5555 on each candidate" });
        });
    });
}

// ---- RUNG 2: INVITES ------------------------------------------------------------------------------------------------
const INVITES = new Map();   // token -> { token, ip, created, expires, note, usedBy: [], revoked }

function mintInvite({ ip = "", note = "", ttlMs = CFG.inviteTtlMs } = {}) {
    const token = crypto.randomBytes(16).toString("hex");
    const now = Date.now();
    const inv = { token, ip: String(ip || ""), note: String(note || "").slice(0, 200), created: now, expires: now + ttlMs, usedBy: [], revoked: false };
    INVITES.set(token, inv);
    CFG.log("invite minted for", inv.ip || "(any device)", "expires in", Math.round(ttlMs / 60000), "min");
    return inv;
}
function checkInvite(token, ip) {
    const inv = INVITES.get(String(token || ""));
    if (!inv) return { ok: false, error: "unknown or expired invite -- ask the operator for a new one" };
    if (inv.revoked) return { ok: false, error: "this invite was revoked" };
    if (Date.now() > inv.expires) { INVITES.delete(inv.token); return { ok: false, error: "this invite expired" }; }
    // an invite bound to an IP is a courtesy check, not a security claim -- stated plainly rather than oversold
    if (inv.ip && ip && inv.ip !== String(ip).replace(/^::ffff:/, "")) return { ok: false, error: "this invite was issued for a different device" };
    if (ip && !inv.usedBy.includes(ip)) inv.usedBy.push(ip);
    return { ok: true, invite: inv };
}

// ---- RUNG 3: WHAT THE PHONE MAY FETCH -------------------------------------------------------------------------------
// The peer payload is fetched FILE BY FILE over plain HTTP from paths the engine already serves. No tar, no zip,
// no new packaging road -- and it works identically on the LAN and through a Cloudflare tunnel, which is the
// whole reason a remote volunteer is possible at all.
const PAYLOAD = [
    "tools/roundhouse/termux_peer.sh",
    "tools/roundhouse/androidRunner.mjs",
    "tools/roundhouse/androidVerdict.mjs",
    "tools/roundhouse/androidPeer.mjs",
    "tools/roundhouse/corroborate.mjs",
    "tools/roundhouse/corroborationCensus.mjs",
    "tools/roundhouse/magmapGpu.mjs",
    "tools/roundhouse/magmapKernel.mjs",
    "tools/roundhouse/magmapReport.mjs",
    "tools/roundhouse/gpuProvenance.mjs",
    "tools/strictTrig.mjs",
];
function payloadManifest() {
    return PAYLOAD.map((rel) => {
        const p = path.join(CFG.engineRoot, rel);
        let size = null; try { size = fs.statSync(p).size; } catch {}
        return { path: rel, size, present: size !== null };
    });
}

function bootstrapScript(token, base) {
    const files = payloadManifest().filter((f) => f.present).map((f) => f.path);
    return `#!/data/data/com.termux/files/usr/bin/bash
# SweK Android Peer bootstrap -- v2923
#
# YOU ARE RUNNING THIS ON PURPOSE. It downloads the SweK peer files from ${base} into ~/swek-peer and runs
# nothing on its own. Read it before you run it; that is the point of shipping a script instead of a binary.
#
# It does NOT: install an app, ask for root, touch anything outside ~/swek-peer, or start on boot.
set -eu
BASE="${base}"
TOKEN="${token}"
DEST="\${1:-$HOME/swek-peer}"
echo "SweK peer -> $DEST"
mkdir -p "$DEST"
for f in ${files.join(" ")}; do
  mkdir -p "$DEST/$(dirname "$f")"
  echo "  fetch $f"
  curl -fsSL "$BASE/$f?t=$TOKEN" -o "$DEST/$f"
done
chmod +x "$DEST/tools/roundhouse/termux_peer.sh" 2>/dev/null || true
cat <<'EOF'

fetched. nothing has been run. when you are ready:

  cd ~/swek-peer && bash tools/roundhouse/termux_peer.sh

that runs the physics suite (~15-25 min), records what it finds, and writes android-phone.json
into your shared Downloads. Nothing is sent anywhere unless you hand that file back.
EOF
`;
}

// ---- RUNG 4: THE APK, AND THE TRUTH ABOUT IT -------------------------------------------------------------------------
function apkStatus() {
    let files = [];
    try { files = fs.readdirSync(CFG.apkDir).filter((f) => /\.apk$/i.test(f)).map((f) => ({ file: f, size: fs.statSync(path.join(CFG.apkDir, f)).size })); } catch {}
    return {
        present: files.length > 0, files, dir: CFG.apkDir,
        // stated here so no UI has to remember it
        note: files.length ? "an APK is available for download; installing it requires the user to approve an unknown-sources prompt on their own phone"
            : "no APK present. The Termux peer CANNOT simply be wrapped into one: Android's sandbox forbids any app writing into Termux's private home directory. A real APK means (a) a nodejs-mobile wrapper app -- which is also the only thing that solves the foreground-service item -- (b) a companion app driving Termux's RUN_COMMAND intent, or (c) building Termux from source. All three need an Android SDK toolchain. Until one exists, the bootstrap script is the working path.",
    };
}

function adbPush({ ip, file, confirm }, cb) {
    if (confirm !== "I have this device's owner's permission") return cb({ ok: false, code: 400,
        error: "push refused: the confirm phrase is required, verbatim. This exists to make an accidental or scripted push impossible." });
    const apk = apkStatus();
    if (!apk.present) return cb({ ok: false, code: 404, error: "no APK in " + CFG.apkDir + ". " + apk.note });
    const base = path.basename(String(file || ""));
    if (!apk.files.some((f) => f.file === base)) return cb({ ok: false, code: 404, error: "not an available apk: " + base });
    if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(String(ip || ""))) return cb({ ok: false, code: 400, error: "bad ip" });
    const full = path.join(CFG.apkDir, base);
    const target = ip + ":5555";
    CFG.execFile("adb", ["connect", target], { timeout: 8000, windowsHide: true }, () => {
        CFG.execFile("adb", ["-s", target, "install", "-r", full], { timeout: 120000, windowsHide: true }, (err, stdout, stderr) => {
            const out = String(stdout || "") + String(stderr || "");
            const unauthorized = /unauthorized|device unauthorized|failed to authenticate/i.test(out);
            cb({
                ok: !err && /Success/i.test(out), code: 200, output: out.slice(0, 4000),
                unauthorized,
                hint: unauthorized
                    ? "the phone has not approved this host. Its owner must accept the 'Allow USB debugging?' fingerprint prompt ON THE PHONE. That prompt is the consent step, and it cannot be bypassed from here -- which is the correct behaviour."
                    : (err ? "adb reported an error; is `adb` on PATH and wireless debugging enabled on the device?" : ""),
            });
        });
    });
}

// ---- ROUTES ----------------------------------------------------------------------------------------------------------
function sendJson(res, obj, code = 200) { try { res.writeHead(code, { "Content-Type": "application/json" }); res.end(JSON.stringify(obj)); } catch {} }
function readBody(req, cb) { let b = ""; req.on("data", (d) => { b += d; if (b.length > 1e5) b = b.slice(0, 1e5); }); req.on("end", () => { try { cb(JSON.parse(b || "{}")); } catch { cb({}); } }); }
function reqIp(req) { return String((req.socket && req.socket.remoteAddress) || "").replace(/^::ffff:/, ""); }
function baseUrl(req) {
    const host = req.headers && req.headers.host ? req.headers.host : "localhost";
    const proto = (req.headers && req.headers["x-forwarded-proto"]) || "http";
    return proto + "://" + host;
}

// v2924 -- IS THIS REQUEST ARRIVING THROUGH THE TUNNEL? The sweep reads THIS box's ARP cache and probes THIS
// box's LAN, wherever server.js runs. A remote operator (a cousin on the tunnel) who clicks "sweep the LAN" is
// therefore scanning the HOST's network, not their own -- a true result, but a misleading label unless we say
// so. Cloudflare stamps cf-connecting-ip / cf-ray on tunnelled requests; a host that isn't localhost/LAN is the
// fallback signal. This never blocks the sweep -- it only lets the UI tell the truth about whose LAN it is.
function isRemoteReq(req) {
    const h = (req && req.headers) || {};
    if (h["cf-connecting-ip"] || h["cf-ray"]) return true;
    const host = String(h.host || "").split(":")[0].toLowerCase();
    if (!host) return false;
    if (host === "localhost" || host === "127.0.0.1" || host === "::1") return false;
    if (/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.)/.test(host)) return false;   // RFC1918 / link-local = LAN
    if (/\.local$/.test(host)) return false;
    return true;   // a public hostname -> almost certainly the tunnel
}

/** Returns true if this bridge owned the request. Chained from androidPeerBridge. */
function handle(req, res) {
    const u = (req.url || "").split("?")[0];
    const q = new URLSearchParams((req.url || "").split("?")[1] || "");
    noteSighting(reqIp(req), req.headers && req.headers["user-agent"]);
    if (!u.startsWith("/android/")) return false;

    // v2926 -- TRUST GATE. Operator routes (sweep the host's LAN, mint invites, push an APK, grade+write files)
    // must NOT be reachable by a remote tunnel visitor: candidate enumeration alone leaks the host's device list
    // and MACs. Phone-facing routes (join, manifest, bootstrap.sh) stay open because they are protected by an
    // invite TOKEN -- a capability the operator handed out deliberately -- so a remote cousin with a link still
    // works, while a random tunnel visitor without one is refused. `trusted` defaults to "not arriving over the
    // tunnel"; server.js may inject a richer check (authed-LAN-exempt) via configure({ trustCheck }).
    const OPERATOR = new Set(["/android/candidates", "/android/invite", "/android/invite/revoke",
                              "/android/push", "/android/apk-status", "/android/invites", "/android/status", "/android/verdict"]);
    if (OPERATOR.has(u)) {
        const trusted = CFG.trustCheck ? !!CFG.trustCheck(req) : !isRemoteReq(req);
        if (!trusted) { sendJson(res, { ok: false, error: "operator-only: this route manages the host's own network and is not reachable over the tunnel. Ask the operator (on the host or LAN) to run it, or to hand you an invite link." }, 403); return true; }
    }

    if (req.method === "GET" && u === "/android/candidates") {
        const remote = isRemoteReq(req);
        candidates({ probe: q.get("probe") === "1" }, (r) => {
            r.viaTunnel = remote;
            r.scanScope = remote
                ? "This sweep ran on the HOST box's network, not yours -- you are viewing over the tunnel. The candidates below are on the host's LAN. Inviting them still works; sweeping your own network does not, because the server process lives on the host."
                : "local: this is the network the server box is on.";
            // v3034 -- ANNOTATE THE SCAN WITH WHAT THIS HUB ALREADY KNOWS. candidateKnown.mjs was written at
            // v3013 to answer exactly the question Keith asked -- which of these Android IPs are already ours --
            // and was then never called by anything. The graveyard census caught it, and it is the FOURTH time
            // this session I have shipped a module nobody could reach.
            //
            // An IP match is EVIDENCE, NOT IDENTITY: DHCP reassigns, so a match past the freshness window is
            // reported STALE with DHCP named, and the module says so rather than the caller assuming it.
            import("../tools/roundhouse/candidateKnown.mjs")
                .then((m) => {
                    let known = { roster: [], peers: [], ledger: [] };
                    // Read the two ledgers directly. readJsonSafe does not exist in this file -- I wrote it
                    // from memory and it is the same mistake as the CSS class that styled nothing at v3024.
                    const readJson = (f) => {
                        try { return JSON.parse(fs.readFileSync(path.join(process.cwd(), "tools", "roundhouse", f), "utf8")); }
                        catch { return null; }
                    };
                    known.roster = (readJson("lighthouse-roster.json") || {}).peers || [];
                    known.ledger = (readJson("device-ledger.json") || {}).entries || [];
                    const c = m.classifyCandidates(r.candidates || [], known);
                    r.candidates = c.rows;
                    r.known = { total: c.total, known: c.knownCount, unknown: c.unknownCount, stale: c.staleCount, note: c.note };
                })
                .catch(() => { r.known = { note: "correlation unavailable -- every address is reported unannotated rather than silently as unknown" }; })
                .finally(() => sendJson(res, r));
        });
        return true;
    }
    if (req.method === "GET" && u === "/android/apk-status") { sendJson(res, apkStatus()); return true; }
    if (req.method === "GET" && u === "/android/invites") {
        sendJson(res, { ok: true, invites: [...INVITES.values()].map((i) => ({ ...i, url: null })) }); return true;
    }
    if (req.method === "POST" && u === "/android/invite") {
        readBody(req, (d) => {
            if (d.confirm !== true) return sendJson(res, { ok: false,
                error: "an invite is only minted on an explicit operator confirm ({confirm:true}); the sweep never mints one by itself" }, 400);
            const inv = mintInvite({ ip: d.ip, note: d.note, ttlMs: d.ttlMs });
            sendJson(res, { ok: true, invite: inv, url: baseUrl(req) + "/android/join?t=" + inv.token,
                shareNote: "hand this link to the phone's owner (LAN address, or your tunnel URL for someone off-site). It expires; it installs nothing by itself." });
        });
        return true;
    }
    if (req.method === "POST" && u === "/android/invite/revoke") {
        readBody(req, (d) => { const i = INVITES.get(String(d.token || "")); if (i) i.revoked = true; sendJson(res, { ok: !!i }); });
        return true;
    }
    if (req.method === "GET" && u === "/android/join") {
        const chk = checkInvite(q.get("t"), reqIp(req));
        const page = path.join(CFG.engineRoot, "android-invite.html");
        if (!chk.ok) { res.writeHead(403, { "Content-Type": "text/plain" }); res.end(chk.error); return true; }
        try {
            res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
            res.end(fs.readFileSync(page, "utf8"));
        } catch { sendJson(res, { ok: false, error: "android-invite.html missing" }, 404); }
        return true;
    }
    if (req.method === "GET" && u === "/android/manifest") {
        const chk = checkInvite(q.get("t"), reqIp(req));
        if (!chk.ok) return (sendJson(res, chk, 403), true);
        sendJson(res, { ok: true, files: payloadManifest(), apk: apkStatus() });
        return true;
    }
    if (req.method === "GET" && u === "/android/bootstrap.sh") {
        const chk = checkInvite(q.get("t"), reqIp(req));
        if (!chk.ok) { res.writeHead(403, { "Content-Type": "text/plain" }); res.end("# " + chk.error + "\n"); return true; }
        res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
        res.end(bootstrapScript(q.get("t"), baseUrl(req)));
        return true;
    }
    if (req.method === "POST" && u === "/android/push") {
        readBody(req, (d) => adbPush(d, (r) => sendJson(res, r, r.code || 200)));
        return true;
    }
    return false;   // not ours -- let the caller 404 it
}

module.exports = { handle, configure, noteSighting, candidates, mintInvite, checkInvite, apkStatus, adbPush,
                   isRemoteReq, payloadManifest, bootstrapScript, _sightings: SIGHTINGS, _invites: INVITES };
