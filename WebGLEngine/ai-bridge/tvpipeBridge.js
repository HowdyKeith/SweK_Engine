// WebGLEngine/ai-bridge/tvpipeBridge.js -- UNNUMBERED (the version is chosen at ship time)
//
// SWEK TO A TV THROUGH TVPIPE: Apple TV / AirPlay and Chromecast / Google Cast, mirrored with a fraction of a second of delay. Keith: "yes, start with
// steps 1 and 3" -- step 1 the bridge, step 3 its self-check. Before this the engine could hand a URL to a Chromecast through Home Assistant (/ha/cast,
// /frame/send) or to a Roku (/roku/cast), and open a stream on another SweK box (/cast); it could not reach an AirPlay receiver at all, and it could not
// MIRROR a live SweK page to any TV. tvpipe (mitsuhiko/tvpipe, Apache-2.0) does both. This drives it through its Node SDK, @tvpipe/sdk, which runs the
// tvpipe binary (installed for this platform by npm) as a separate process over its documented machine interface (docs/machine.md: JSON events out,
// commands in). SweK links none of tvpipe's code; the binary is fetched by npm, not shipped here.
//
// ROUTES (ai-bridge/server.js, trusted callers only: each one puts something on somebody's television):
//   GET  /tv/status             { ok, installed, why?, sessions: [...], pins: [...] }
//   GET  /tv/devices[?timeout=] { ok, devices: [{ name, model, addresses, protocols, video, paired, pin }] }   tvpipe's own discovery, AirPlay and Cast merged
//   POST /tv/share  { to, url } a WEB PAGE (a SweK page) rendered by tvpipe's headless Chromium ON THIS MACHINE and mirrored to the TV; so a localhost
//                               URL is right here, unlike /cast, where the PEER opens the URL
//   POST /tv/play   { to, url } a file URL or a stream (http(s), rtsp from go2rtc), through ffmpeg on this machine
//   POST /tv/pattern { to }     tvpipe's test pattern (clock, frame counter): "is the TV reachable at all", no ffmpeg needed
//   POST /tv/stop   { id? }     one session, or every session
//   POST /tv/pin    { id, pin } an Apple TV asking for the PIN it shows: the session waits here until the page answers (or PIN_WAIT_MS passes)
//   WS   /tv/live               THE ENGINE'S OWN CANVAS, LIVE (Keith: "8"): the page encodes its canvas as H.264 with WebCodecs (ui/tvLive.js) and sends each
//                               access unit here; this hands it to tvpipe's stream() (writeH264), which sends it to the TV without re-encoding -- no browser
//                               of tvpipe's own capturing the page, so less delay than /tv/share. The first message is JSON { type: "start", to, width,
//                               height, fps }; the bridge answers { type: "started", session } or { type: "error", error }; each later message is BINARY:
//                               one flags byte (1 = keyframe), the timestamp in microseconds (u64, little-endian), then the access unit in Annex B. When tvpipe
//                               asks for a keyframe (a TV joined, a packet was lost) the page is sent { type: "keyframe" }. Closing the socket ends the stream.
// `to` is a receiver name (or a unique prefix), "airplay:NAME" / "cast:NAME", an address, "browser" (tvpipe's own player page on this machine), or a list
// of up to MAX_TARGETS of those, played in sync. A new session to a TV already showing one stops the old one first: a TV shows one thing.
//
// WHAT IT WILL NOT DO: open a tunnel to the internet (tvpipe can; every option for it is refused here), take a URL carrying a password, or a scheme a
// browser or ffmpeg should not be handed (javascript:, data:, file:). Local files are not offered yet: a URL is what the engine's recordings and go2rtc
// already have.
"use strict";

const MAX_TARGETS = 8, PIN_WAIT_MS = 120000, MAX_SESSIONS = 8, DISCOVER_MS = 3000;
const INSTALL_HINT = "run `npm install @tvpipe/sdk` in WebGLEngine/ai-bridge (Node 22 or newer), or the install panel's tvpipe row";

// ---- what may be handed to tvpipe ----
/** A target, or a list of them, checked: { ok, to } or { ok:false, why }. Pure. */
function checkTarget(to) {
    const list = Array.isArray(to) ? to : [to];
    if (!list.length || list.length > MAX_TARGETS) return { ok: false, why: `name 1 to ${MAX_TARGETS} receivers` };
    for (const t of list) {
        if (typeof t !== "string" || !t.trim() || t.length > 200 || /[\u0000-\u001f\u007f]/.test(t)) return { ok: false, why: "a receiver is a name, an address, airplay:NAME, cast:NAME or browser" };
        if (t.trim().startsWith("-")) return { ok: false, why: "a receiver name may not start with '-' (it would read as an option)" };
    }
    return { ok: true, to: list.map((t) => t.trim()) };
}
/** A URL for `kind` ("share": a page; "play": media), checked: { ok, url } or { ok:false, why }. Pure. */
function checkUrl(raw, kind) {
    let u; try { u = new URL(String(raw || "")); } catch { return { ok: false, why: "not a URL" }; }
    const schemes = kind === "share" ? ["http:", "https:"] : ["http:", "https:", "rtsp:", "rtsps:"];
    if (!schemes.includes(u.protocol)) return { ok: false, why: `${kind === "share" ? "a page" : "media"} must be ${schemes.map((s) => s.slice(0, -1)).join(" or ")} (got ${u.protocol.slice(0, -1)})` };
    if (u.username || u.password) return { ok: false, why: "a URL carrying a password would end up in tvpipe's logs: put it nowhere near a TV" };
    if (String(raw).length > 2000) return { ok: false, why: "a URL longer than 2000 characters" };
    return { ok: true, url: u.href };
}
/** An AirPlay PIN: 4 to 8 digits. Pure. */
const checkPin = (p) => /^\d{4,8}$/.test(String(p || ""));

// ---- the SDK ----
let _sdk = null, _sdkWhy = "";
/** Load @tvpipe/sdk (ESM) once. `importer` is the seam the gate uses. */
async function loadSdk(importer = (m) => import(m)) {
    if (_sdk) return _sdk;
    const major = Number(process.versions.node.split(".")[0]);
    if (major < 22) { _sdkWhy = `tvpipe's SDK needs Node 22 or newer (this is ${process.versions.node})`; return null; }
    try { _sdk = await importer("@tvpipe/sdk"); _sdkWhy = ""; return _sdk; }
    catch (e) {
        // FIRST USE: ask the bridge's Auto-Install registry (ai-bridge/autoInstall.js, entry "tvpipe-sdk"). With Auto-Install on (Settings, or this item
        // opted in) it starts the install and says so; otherwise it says how. Either way this call fails now and the next one, once npm is done, works.
        let r = null; try { r = ensureSdk(); } catch { /* no registry: the hint below */ }
        _sdkWhy = r && r.installing ? "tvpipe is being installed for first use (about 10 MB): try again in a minute"
            : r && r.ok === false && r.lastErr ? `@tvpipe/sdk did not install: ${r.lastErr}`
            : `@tvpipe/sdk is not installed: ${INSTALL_HINT}, or turn on Auto-Install in Settings and it installs itself on first use`;
        return null;
    }
}
function _useSdk(sdk) { _sdk = sdk; _sdkWhy = ""; }   // the gate's stand-in
let ensureSdk = () => { const A = require("./autoInstall.js"), r = A.ensure("tvpipe-sdk"), st = A.status("tvpipe-sdk"); return { ...r, lastErr: st.lastErr }; };
const _realEnsure = ensureSdk;
function _useEnsure(fn) { ensureSdk = fn || _realEnsure; }   // the gate's seam: no real npm in a self-check

// ---- sessions ----
const sessions = new Map(), pins = new Map();
let _seq = 0;
// receivers and info are read from the SDK's session as well, at the time of asking: a stream() session resolves only once its receivers have
// connected, so their "receiver" events have already fired before a listener can be attached, and the SDK keeps the state on the session
function publicOf(s) {
    const live = s.session || {}, rec = new Map(s.receivers);
    if (live.receivers && typeof live.receivers.forEach === "function") live.receivers.forEach((v, k) => { if (!rec.has(k)) rec.set(k, { protocol: v.protocol || null, state: v.state, error: v.error || null }); });
    return { id: s.id, kind: s.kind, to: s.to, source: s.source, state: s.state, startedAt: s.startedAt, endedAt: s.endedAt || null, error: s.error || null,
        receivers: Object.fromEntries(rec), playerUrl: s.playerUrl || live.playerUrl || null, info: s.info || live.info || null, frames: s.frames || 0, backedUp: s.backedUp || 0 };
}
function status() { return { ok: true, installed: !!_sdk, why: _sdk ? undefined : _sdkWhy || `not loaded yet (${INSTALL_HINT})`, sessions: [...sessions.values()].map(publicOf), pins: [...pins.values()].map((p) => ({ id: p.id, name: p.name, address: p.address })) }; }

/** The SDK error as a sentence a page can show, keeping tvpipe's stable code. Pure. */
function errorOf(e) {
    const code = (e && e.code) || "error", msg = String((e && e.message) || e);
    const hint = { "no-receiver": "no TV by that name answered", "no-receivers": "no TV with video was found on this network", "ambiguous-receiver": "several TVs match: name one", "ffmpeg-missing": "this needs ffmpeg (the install panel's ffmpeg row)",
        "pairing-required": "this Apple TV needs pairing: start again and enter the PIN it shows", "binary-missing": `the tvpipe binary is missing: ${INSTALL_HINT}` }[code];
    return { code, message: hint ? `${hint} (${msg})` : msg };
}

/** Ask the page for a PIN; resolves when /tv/pin answers, rejects after PIN_WAIT_MS. */
function _askPin(req, sessionId) {
    const id = `pin-${++_seq}`;
    return new Promise((resolve, reject) => {
        const t = setTimeout(() => { pins.delete(id); reject(new Error("no PIN was entered in time")); }, PIN_WAIT_MS);
        if (t.unref) t.unref();
        pins.set(id, { id, name: req.name, address: req.address, sessionId, resolve: (p) => { clearTimeout(t); pins.delete(id); resolve(p); } });
    });
}
function answerPin(id, pin) {
    const p = pins.get(String(id || ""));
    if (!p) return { ok: false, error: "no PIN is being asked for under that id" };
    if (!checkPin(pin)) return { ok: false, error: "a PIN is 4 to 8 digits" };
    p.resolve(String(pin)); return { ok: true };
}

/** Stop a session (by id), or all. Resolves to the ids stopped. */
async function stop(id) {
    const list = id ? [sessions.get(String(id))].filter(Boolean) : [...sessions.values()];
    for (const s of list) { if (s.state === "playing" || s.state === "starting") { s.state = "stopping"; try { await (s.session && s.session.stop()); } catch { /* it ended on its own */ } s.state = "stopped"; s.endedAt = new Date().toISOString(); } }
    return list.map((s) => s.id);
}

/** Start one session: kind "share" | "play" | "pattern". Resolves to { ok, session } or { ok:false, error }. */
async function start(kind, body = {}, { importer } = {}) {
    const T = checkTarget(body.to); if (!T.ok) return { ok: false, error: T.why };
    let src = null;
    if (kind === "share" || kind === "play") { const U = checkUrl(body.url, kind); if (!U.ok) return { ok: false, error: U.why }; src = U.url; }
    else if (kind !== "pattern") return { ok: false, error: `unknown kind ${kind}` };
    const sdk = await loadSdk(importer); if (!sdk) return { ok: false, error: _sdkWhy };
    // a TV shows one thing: stop whatever already plays on any of these receivers (names compared without case)
    const want = new Set(T.to.map((t) => t.toLowerCase()));
    for (const s of sessions.values()) if ((s.state === "playing" || s.state === "starting") && s.to.some((t) => want.has(t.toLowerCase()))) await stop(s.id);
    // forget ended sessions beyond the newest few
    const ended = [...sessions.values()].filter((s) => !["playing", "starting"].includes(s.state));
    while (sessions.size >= MAX_SESSIONS && ended.length) sessions.delete(ended.shift().id);
    if (sessions.size >= MAX_SESSIONS) return { ok: false, error: `already ${MAX_SESSIONS} sessions playing: stop one` };

    const rec = { id: `tv-${++_seq}`, kind, to: T.to, source: src, state: "starting", startedAt: new Date().toISOString(), receivers: new Map(), session: null };
    sessions.set(rec.id, rec);
    const opts = { to: T.to.length === 1 ? T.to[0] : T.to, onPin: (r) => _askPin(r, rec.id) };
    if (Number.isFinite(body.latency)) opts.latency = Math.max(5, Math.min(2000, Number(body.latency)));
    try {
        const s = kind === "share" ? await sdk.share(src, opts) : kind === "play" ? await sdk.play(src, opts) : await sdk.testPattern(opts);
        rec.session = s; rec.state = "playing"; rec.info = s.info || null; rec.playerUrl = s.playerUrl || null;
        if (s.on) {
            s.on("receiver", (r) => rec.receivers.set(r.name, { protocol: r.protocol || null, state: r.state, error: r.error || null }));
            s.on("error", (e) => { rec.error = errorOf(e); });
        }
        if (s.receivers && typeof s.receivers.forEach === "function") s.receivers.forEach((v, k) => rec.receivers.set(k, { protocol: v.protocol || null, state: v.state, error: v.error || null }));
        Promise.resolve(s.done).then(() => { if (rec.state !== "stopped") { rec.state = "ended"; rec.endedAt = new Date().toISOString(); } },
            (e) => { rec.state = "failed"; rec.error = errorOf(e); rec.endedAt = new Date().toISOString(); });
        return { ok: true, session: publicOf(rec) };
    } catch (e) {
        rec.state = "failed"; rec.error = errorOf(e); rec.endedAt = new Date().toISOString();
        return { ok: false, error: rec.error.message, code: rec.error.code, session: publicOf(rec) };
    }
}

// ---- the live canvas ----
/** A live stream's size and rate, checked: even, at most 3840 x 2160, 1 to 60 frames a second. Pure. */
function checkLive(o = {}) {
    const w = Number(o.width), h = Number(o.height), fps = Number(o.fps);
    if (!(Number.isInteger(w) && Number.isInteger(h) && w > 0 && h > 0 && w % 2 === 0 && h % 2 === 0)) return { ok: false, why: "width and height must be positive, whole and even (H.264 needs it)" };
    if (w > 3840 || h > 2160) return { ok: false, why: "at most 3840 x 2160" };
    if (!(fps >= 1 && fps <= 60)) return { ok: false, why: "1 to 60 frames a second" };
    return { ok: true, width: w, height: h, fps };
}
/** One binary message from the page: flags (1 = keyframe), the timestamp in microseconds (u64 LE), then the access unit. Pure. */
function parseLiveFrame(buf) {
    const b = Buffer.isBuffer(buf) ? buf : Buffer.from(buf);
    if (b.length < 10) return null;
    return { keyframe: (b[0] & 1) === 1, ptsUs: Number(b.readBigUInt64LE(1)), au: b.subarray(9) };
}
/** Serve one /tv/live socket: start on its first message, then feed every frame to tvpipe; the socket closing ends the stream. */
function attachLive(ws, { importer } = {}) {
    let rec = null, s = null, waitingKey = false, ended = false;
    const send = (o) => { try { ws.send(JSON.stringify(o)); } catch { /* the page has gone */ } };
    const finish = async () => { if (ended) return; ended = true; if (s) { try { await s.end(); } catch { try { await s.stop(); } catch { /* already over */ } } } if (rec && rec.state !== "failed") { rec.state = "stopped"; rec.endedAt = new Date().toISOString(); } };
    ws.on("close", () => { finish(); });
    ws.on("message", async (data, isBinary) => {
        if (!isBinary) {
            let m; try { m = JSON.parse(String(data)); } catch { return send({ type: "error", error: "not JSON" }); }
            if (m.type !== "start" || rec) return send({ type: "error", error: rec ? "already started" : "the first message is { type: 'start', to, width, height, fps }" });
            const T = checkTarget(m.to); if (!T.ok) return send({ type: "error", error: T.why });
            const L = checkLive(m); if (!L.ok) return send({ type: "error", error: L.why });
            const sdk = await loadSdk(importer); if (!sdk) return send({ type: "error", error: _sdkWhy });
            const want = new Set(T.to.map((t) => t.toLowerCase()));
            for (const o of sessions.values()) if ((o.state === "playing" || o.state === "starting") && o.to.some((t) => want.has(t.toLowerCase()))) await stop(o.id);
            rec = { id: `tv-${++_seq}`, kind: "live", to: T.to, source: `canvas ${L.width}x${L.height}@${L.fps}`, state: "starting", startedAt: new Date().toISOString(), receivers: new Map(), session: null };
            sessions.set(rec.id, rec);
            try {
                s = await sdk.stream({ to: T.to.length === 1 ? T.to[0] : T.to, video: { width: L.width, height: L.height, fps: L.fps, codec: "h264" }, onPin: (r) => _askPin(r, rec.id) });
                rec.session = s; rec.state = "playing"; rec.info = s.info || null;
                if (s.on) {
                    s.on("keyframe", () => { waitingKey = true; send({ type: "keyframe" }); });
                    rec.askKeyframe = () => { waitingKey = true; send({ type: "keyframe" }); };   // the same request, for a caller that needs a fresh picture now
                    s.on("receiver", (r) => rec.receivers.set(r.name, { protocol: r.protocol || null, state: r.state, error: r.error || null }));
                    s.on("error", (e) => { rec.error = errorOf(e); });
                }
                Promise.resolve(s.done).then(() => { if (rec.state === "playing") { rec.state = "ended"; rec.endedAt = new Date().toISOString(); } send({ type: "ended" }); try { ws.close(); } catch { /* gone */ } },
                    (e) => { rec.state = "failed"; rec.error = errorOf(e); rec.endedAt = new Date().toISOString(); send({ type: "error", error: rec.error.message, code: rec.error.code }); try { ws.close(); } catch { /* gone */ } });
                send({ type: "started", session: publicOf(rec) });
            } catch (e) { rec.state = "failed"; rec.error = errorOf(e); send({ type: "error", error: rec.error.message, code: rec.error.code }); try { ws.close(); } catch { /* gone */ } }
            return;
        }
        if (!s || rec.state !== "playing") return;
        const f = parseLiveFrame(data); if (!f) return;
        // after tvpipe asked for a keyframe, frames that cannot start a picture are dropped until one arrives: the TV could not decode them anyway
        if (waitingKey && !f.keyframe) return;
        if (f.keyframe) waitingKey = false;
        const okWrite = s.writeH264(f.au, { keyframe: f.keyframe, ptsUs: f.ptsUs, annexB: true });
        rec.frames = (rec.frames || 0) + 1;
        if (okWrite === false) { rec.backedUp = (rec.backedUp || 0) + 1; waitingKey = true; send({ type: "keyframe" }); }   // backed up: skip to the next keyframe rather than fall behind
    });
}

/** The receivers on the network, by tvpipe's discovery. */
async function devices({ timeout = DISCOVER_MS, importer } = {}) {
    const sdk = await loadSdk(importer); if (!sdk) return { ok: false, error: _sdkWhy, devices: [] };
    try {
        const list = await sdk.discover({ timeout: Math.max(500, Math.min(10000, Number(timeout) || DISCOVER_MS)) });
        return { ok: true, devices: (list || []).map((d) => ({ name: d.name, model: d.model || null, addresses: d.addresses || [], protocols: d.protocols || [], video: !!d.video, paired: d.paired ?? null, pin: d.pin ?? null })) };
    } catch (e) { const er = errorOf(e); return { ok: false, error: er.message, code: er.code, devices: [] }; }
}

function _sessionsForTest() { return sessions; }
function _reset() { sessions.clear(); pins.clear(); _sdk = null; _sdkWhy = ""; _seq = 0; }

module.exports = { MAX_TARGETS, PIN_WAIT_MS, MAX_SESSIONS, INSTALL_HINT, checkTarget, checkUrl, checkPin, checkLive, parseLiveFrame, errorOf, loadSdk, status, devices, start, stop, answerPin, attachLive, _useSdk, _useEnsure, _reset, _sessionsForTest };
