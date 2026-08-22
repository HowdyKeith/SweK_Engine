// twitchEventSub.js — Twitch EventSub over the WebSocket transport.
//
// Why WebSocket (not webhook): the webhook transport needs a public HTTPS
// callback URL, which a machine behind a home router doesn't have. The
// WebSocket transport is the one Twitch recommends for locally-hosted bots:
// you open ONE socket to wss://eventsub.wss.twitch.tv/ws, Twitch sends a
// "session_welcome" with a session id, and within ~10s you create your
// subscriptions through the Helix API pointing at that session id. Events
// then stream back over the same socket as "notification" messages.
//
// Requirements (the user supplies these in Settings → Connectors → Twitch):
//   - clientId : from a Twitch app at dev.twitch.tv/console/apps
//   - token    : a USER access token (WebSocket transport requires a user
//                token, not an app token). Scopes per event below.
//   - broadcaster : the channel login (e.g. "yourname") or numeric user id.
//
// Scopes by event:  channel.follow(v2) -> moderator:read:followers ;
//   channel.subscribe -> channel:read:subscriptions ; channel.cheer ->
//   bits:read ; channel.raid -> (none) ; stream.online -> (none).
//
// The socket is receive-only: per Twitch, the client must not send anything
// except Pong frames (the ws library answers pings automatically), so we
// never write to it.

const https = require("https");

const WS_URL = "wss://eventsub.wss.twitch.tv/ws";
const HELIX = "api.twitch.tv";

// Event catalog: type -> { version, cond(broadcasterId, userId) -> condition }.
// userId is the authenticated user (for your own channel it equals the
// broadcaster id, which is what channel.follow v2's moderator_user_id wants).
const EVENT_DEFS = {
    "stream.online":     { version: "1", cond: (b) => ({ broadcaster_user_id: b }) },
    "channel.follow":    { version: "2", cond: (b, u) => ({ broadcaster_user_id: b, moderator_user_id: u || b }) },
    "channel.subscribe": { version: "1", cond: (b) => ({ broadcaster_user_id: b }) },
    "channel.cheer":     { version: "1", cond: (b) => ({ broadcaster_user_id: b }) },
    "channel.raid":      { version: "1", cond: (b) => ({ to_broadcaster_user_id: b }) },
};
const DEFAULT_EVENTS = Object.keys(EVENT_DEFS);

class TwitchEventSub {
    constructor() {
        this.ws = null;
        this.sessionId = null;
        this.connected = false;
        this.clientId = null;
        this.token = null;
        this.broadcasterId = null;
        this.userId = null;
        this.wantEvents = DEFAULT_EVENTS.slice();
        this.subs = [];                 // [{type, id, status}]
        this.events = [];               // ring buffer of recent notifications
        this._maxEvents = 50;
        this.lastKeepalive = 0;
        this.lastError = null;
        this._onEvent = null;           // (kind, event) callback
        this._log = (..._a) => {};
        this._closing = false;
    }

    /** Look up a numeric user id from a channel login via Helix /users. */
    _resolveUserId(login) {
        return this._helix("GET", "/helix/users?login=" + encodeURIComponent(login))
            .then(j => (j && j.data && j.data[0] && j.data[0].id) || null);
    }

    /** Minimal Helix request helper. Returns parsed JSON (or throws). */
    _helix(method, path, body) {
        return new Promise((resolve, reject) => {
            const data = body ? JSON.stringify(body) : null;
            const req = https.request({
                hostname: HELIX, path, method,
                headers: Object.assign({
                    "Authorization": "Bearer " + this.token,
                    "Client-Id": this.clientId,
                }, data ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(data) } : {}),
            }, (res) => {
                let b = ""; res.on("data", c => b += c);
                res.on("end", () => {
                    let j = null; try { j = b ? JSON.parse(b) : {}; } catch {}
                    if (res.statusCode >= 200 && res.statusCode < 300) resolve(j);
                    else reject(new Error("helix " + res.statusCode + ": " + (j && (j.message || j.error) || b.slice(0, 120))));
                });
            });
            req.on("error", reject);
            req.setTimeout(8000, () => { try { req.destroy(new Error("helix timeout")); } catch {} });
            if (data) req.write(data);
            req.end();
        });
    }

    /**
     * Connect and subscribe.
     * opts: { clientId, token, broadcasterId|broadcasterLogin, userId?, events?, onEvent?, log? }
     */
    async connect(opts = {}) {
        let WS;
        try { WS = require("ws"); } catch (e) { return { ok: false, error: "the 'ws' package is not installed on the bridge" }; }
        this.clientId = String(opts.clientId || this.clientId || "").trim();
        this.token = String(opts.token || this.token || "").trim().replace(/^oauth:/i, "");
        if (!this.clientId || !this.token) return { ok: false, error: "clientId and a user token are required" };
        if (Array.isArray(opts.events) && opts.events.length) this.wantEvents = opts.events.filter(e => EVENT_DEFS[e]);
        if (typeof opts.onEvent === "function") this._onEvent = opts.onEvent;
        if (typeof opts.log === "function") this._log = opts.log;

        // Resolve broadcaster id (and reuse it as the authenticated user id for
        // own-channel subscriptions) from a login if a numeric id wasn't given.
        this.broadcasterId = String(opts.broadcasterId || this.broadcasterId || "").trim();
        const login = String(opts.broadcasterLogin || "").trim().replace(/^#/, "").toLowerCase();
        if (!this.broadcasterId && login) {
            try { this.broadcasterId = await this._resolveUserId(login); }
            catch (e) { return { ok: false, error: "could not resolve channel '" + login + "': " + e.message }; }
        }
        if (!this.broadcasterId) return { ok: false, error: "broadcaster id or login required" };
        this.userId = String(opts.userId || this.userId || this.broadcasterId);

        this._closing = false;
        this.disconnect(true);          // drop any prior socket silently
        return this._open(WS, WS_URL);
    }

    _open(WS, url) {
        return new Promise((resolve) => {
            let settled = false;
            try { this.ws = new WS(url); } catch (e) { return resolve({ ok: false, error: String(e.message || e) }); }
            this.ws.on("message", (raw) => this._onMessage(raw, resolve, (v) => { settled = v; }, () => settled));
            this.ws.on("error", (err) => { this.lastError = String(err && err.message || err); this._log("[twitch-eventsub] ws error: " + this.lastError); if (!settled) { settled = true; resolve({ ok: false, error: this.lastError }); } });
            this.ws.on("close", () => { this.connected = false; this._log("[twitch-eventsub] socket closed"); });
            // Safety net: if no welcome arrives in 10s, fail.
            setTimeout(() => { if (!settled) { settled = true; try { this.ws.close(); } catch {} resolve({ ok: false, error: "no session_welcome within 10s" }); } }, 10000);
        });
    }

    async _onMessage(raw, resolve, setSettled, getSettled) {
        let msg = null; try { msg = JSON.parse(raw.toString()); } catch { return; }
        const type = msg && msg.metadata && msg.metadata.message_type;
        if (type === "session_welcome") {
            this.sessionId = msg.payload.session.id;
            this.connected = true;
            this.lastKeepalive = Date.now();
            this._log("[twitch-eventsub] welcome — session " + this.sessionId);
            // Create the requested subscriptions; report which stuck.
            const results = [];
            for (const ev of this.wantEvents) {
                const def = EVENT_DEFS[ev]; if (!def) continue;
                try {
                    const j = await this._helix("POST", "/helix/eventsub/subscriptions", {
                        type: ev, version: def.version,
                        condition: def.cond(this.broadcasterId, this.userId),
                        transport: { method: "websocket", session_id: this.sessionId },
                    });
                    const sub = j && j.data && j.data[0];
                    results.push({ type: ev, ok: true, id: sub && sub.id, status: sub && sub.status });
                } catch (e) {
                    results.push({ type: ev, ok: false, error: e.message });
                    this._log("[twitch-eventsub] subscribe " + ev + " failed: " + e.message);
                }
            }
            this.subs = results;
            if (!getSettled()) { setSettled(true); resolve({ ok: true, sessionId: this.sessionId, subscriptions: results }); }
        } else if (type === "session_keepalive") {
            this.lastKeepalive = Date.now();
        } else if (type === "notification") {
            this.lastKeepalive = Date.now();
            const kind = (msg.payload && msg.payload.subscription && msg.payload.subscription.type) || (msg.metadata && msg.metadata.subscription_type) || "unknown";
            const event = (msg.payload && msg.payload.event) || {};
            const entry = { ts: Date.now(), kind, event };
            this.events.push(entry);
            if (this.events.length > this._maxEvents) this.events.splice(0, this.events.length - this._maxEvents);
            this._log("[twitch-eventsub] event " + kind);
            if (this._onEvent) { try { this._onEvent(kind, event); } catch {} }
        } else if (type === "session_reconnect") {
            // Twitch is asking us to move to a fresh URL; keep the old socket
            // open until the new one welcomes us.
            const url = msg.payload && msg.payload.session && msg.payload.session.reconnect_url;
            this._log("[twitch-eventsub] reconnect requested");
            if (url) { const WS = require("ws"); const old = this.ws; this._open(WS, url).then(() => { try { old && old.close(); } catch {} }); }
        } else if (type === "revocation") {
            this._log("[twitch-eventsub] subscription revoked: " + (msg.payload && msg.payload.subscription && msg.payload.subscription.status));
        }
    }

    disconnect(silent) {
        this._closing = true;
        if (this.ws) { try { this.ws.close(); } catch {} this.ws = null; }
        this.connected = false;
        if (!silent) { this.sessionId = null; this.subs = []; }
        return { ok: true };
    }

    recentEvents(n = 20) { return this.events.slice(-Math.max(1, Math.min(n, this._maxEvents))); }

    status() {
        return {
            connected: this.connected,
            sessionId: this.sessionId,
            broadcasterId: this.broadcasterId,
            clientIdSet: !!this.clientId,
            tokenSet: !!this.token,
            events: this.wantEvents,
            subscriptions: this.subs,
            lastKeepaliveAgoMs: this.lastKeepalive ? (Date.now() - this.lastKeepalive) : null,
            recent: this.recentEvents(5),
            lastError: this.lastError,
        };
    }
}

module.exports = { TwitchEventSub, EVENT_DEFS, DEFAULT_EVENTS };
