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
    catch (e) { _sdkWhy = `@tvpipe/sdk is not installed: ${INSTALL_HINT}`; return null; }
}
function _useSdk(sdk) { _sdk = sdk; _sdkWhy = ""; }   // the gate's stand-in

// ---- sessions ----
const sessions = new Map(), pins = new Map();
let _seq = 0;
const publicOf = (s) => ({ id: s.id, kind: s.kind, to: s.to, source: s.source, state: s.state, startedAt: s.startedAt, endedAt: s.endedAt || null, error: s.error || null,
    receivers: Object.fromEntries(s.receivers), playerUrl: s.playerUrl || null, info: s.info || null });
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

/** The receivers on the network, by tvpipe's discovery. */
async function devices({ timeout = DISCOVER_MS, importer } = {}) {
    const sdk = await loadSdk(importer); if (!sdk) return { ok: false, error: _sdkWhy, devices: [] };
    try {
        const list = await sdk.discover({ timeout: Math.max(500, Math.min(10000, Number(timeout) || DISCOVER_MS)) });
        return { ok: true, devices: (list || []).map((d) => ({ name: d.name, model: d.model || null, addresses: d.addresses || [], protocols: d.protocols || [], video: !!d.video, paired: d.paired ?? null, pin: d.pin ?? null })) };
    } catch (e) { const er = errorOf(e); return { ok: false, error: er.message, code: er.code, devices: [] }; }
}

function _reset() { sessions.clear(); pins.clear(); _sdk = null; _sdkWhy = ""; _seq = 0; }

module.exports = { MAX_TARGETS, PIN_WAIT_MS, MAX_SESSIONS, INSTALL_HINT, checkTarget, checkUrl, checkPin, errorOf, loadSdk, status, devices, start, stop, answerPin, _useSdk, _reset };
