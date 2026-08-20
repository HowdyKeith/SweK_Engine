// FILE: ai-bridge/twitchClient.js
// VERSION: v845
//
// Minimal Twitch IRC client over TLS. No external dependencies — uses
// Node's builtin `tls` module. Single-connection (one channel at a time);
// caller can disconnect + reconnect to switch channels.
//
// Setup that the user (Geek) needs to do once:
//   1. Create a Twitch account for the bot (or reuse personal account).
//   2. Visit https://twitchtokengenerator.com/ (or dev.twitch.tv/console)
//      and generate an OAuth token with chat:read + chat:edit scopes.
//   3. Token looks like "oauth:abcd1234..." or just "abcd1234..." (we
//      add the "oauth:" prefix if missing).
//   4. Call connect({ token, nick: "your_bot_username", channel: "your_channel" }).
//
// IRC wire protocol (the parts we care about):
//   Client → Server:
//     PASS oauth:<token>\r\n
//     NICK <username>\r\n
//     JOIN #<channel>\r\n
//     PRIVMSG #<channel> :<message>\r\n
//     PONG :tmi.twitch.tv\r\n          (in response to server PING)
//     QUIT\r\n
//
//   Server → Client (lines we care about):
//     :tmi.twitch.tv 376 <user> :>            (end-of-MOTD, auth ok)
//     :tmi.twitch.tv NOTICE * :Login authentication failed
//     PING :tmi.twitch.tv
//     :<nick>!<nick>@<nick>.tmi.twitch.tv PRIVMSG #<channel> :<message>
//
// All other server-to-client lines are ignored (USERSTATE, ROOMSTATE, etc.).

const tls = require("tls");

class TwitchClient {
    constructor() {
        this._sock = null;
        this._buf = "";          // incoming line-assembly buffer
        this.connected = false;
        this.channel = null;
        this.nick = null;
        this._maxMessages = 200;
        this.messages = [];      // ring buffer of recent incoming chat messages
        this._totalReceived = 0; // monotonic counter; used as "since" cursor
        this._authOk = false;
        this._lastError = null;
        this._onMessageCallbacks = [];
    }

    /** Register a callback fired on each incoming chat message. */
    onMessage(cb) {
        if (typeof cb === "function") this._onMessageCallbacks.push(cb);
        return () => {
            const idx = this._onMessageCallbacks.indexOf(cb);
            if (idx >= 0) this._onMessageCallbacks.splice(idx, 1);
        };
    }

    /**
     * Connect + auth + join channel. Returns a Promise that resolves
     * once auth succeeds (server sends 376 end-of-MOTD) or rejects on
     * NOTICE auth-failed within 5 seconds.
     */
    connect({ token, nick, channel }) {
        // Idempotency: if already connected to the same channel, no-op.
        if (this.connected && this.channel === channel && this.nick === nick) {
            return Promise.resolve({ ok: true, alreadyConnected: true });
        }
        // If connected to a different channel, disconnect first.
        if (this._sock) {
            try { this._sock.destroy(); } catch {}
            this._sock = null;
        }
        if (!token || !nick || !channel) {
            return Promise.resolve({ ok: false, error: "token, nick, and channel are required" });
        }
        const oauth = token.startsWith("oauth:") ? token : ("oauth:" + token);
        this.connected = false;
        this.channel = channel.toLowerCase().replace(/^#/, "");
        this.nick = nick.toLowerCase();
        this._authOk = false;
        this._lastError = null;
        this._buf = "";

        return new Promise((resolve) => {
            let settled = false;
            const settle = (result) => {
                if (settled) return;
                settled = true;
                resolve(result);
            };
            // 5-second auth timeout
            const authTimer = setTimeout(() => {
                settle({ ok: false, error: "auth timeout after 5s" });
            }, 5000);
            try {
                this._sock = tls.connect(6697, "irc.chat.twitch.tv", () => {
                    // TLS handshake done — send auth
                    this._sock.write(`PASS ${oauth}\r\n`);
                    this._sock.write(`NICK ${this.nick}\r\n`);
                    this._sock.write(`JOIN #${this.channel}\r\n`);
                });
                this._sock.setEncoding("utf8");
                this._sock.on("data", (chunk) => {
                    this._buf += chunk;
                    let nl;
                    while ((nl = this._buf.indexOf("\r\n")) >= 0) {
                        const line = this._buf.slice(0, nl);
                        this._buf = this._buf.slice(nl + 2);
                        this._handleLine(line, settle, authTimer);
                    }
                });
                this._sock.on("error", (err) => {
                    this._lastError = err?.message || String(err);
                    this.connected = false;
                    clearTimeout(authTimer);
                    settle({ ok: false, error: this._lastError });
                });
                this._sock.on("close", () => {
                    this.connected = false;
                    this._authOk = false;
                });
            } catch (e) {
                clearTimeout(authTimer);
                settle({ ok: false, error: e?.message || "connect failed" });
            }
        });
    }

    _handleLine(line, settle, authTimer) {
        // Server PING — must respond promptly or we get disconnected
        if (line.startsWith("PING")) {
            const rest = line.slice(4).trim();
            this._sock.write("PONG " + rest + "\r\n");
            return;
        }
        // End of MOTD (auth ok)
        if (/:tmi\.twitch\.tv 376/.test(line)) {
            this._authOk = true;
            this.connected = true;
            clearTimeout(authTimer);
            settle({ ok: true, channel: this.channel, nick: this.nick });
            return;
        }
        // Auth-failed NOTICE
        if (/:tmi\.twitch\.tv NOTICE \* :Login authentication failed/i.test(line)) {
            this._lastError = "Login authentication failed (token invalid or expired)";
            this.connected = false;
            clearTimeout(authTimer);
            settle({ ok: false, error: this._lastError });
            return;
        }
        // Incoming chat message
        // Format: :nick!nick@nick.tmi.twitch.tv PRIVMSG #channel :message
        const m = line.match(/^:([A-Za-z0-9_]+)![^ ]+ PRIVMSG #([A-Za-z0-9_]+) :(.*)$/);
        if (m) {
            const [, nick, channel, message] = m;
            const entry = {
                idx: this._totalReceived,
                ts: Date.now(),
                nick,
                channel,
                message,
            };
            this._totalReceived++;
            this.messages.push(entry);
            if (this.messages.length > this._maxMessages) {
                this.messages.splice(0, this.messages.length - this._maxMessages);
            }
            // Fire registered callbacks
            for (const cb of this._onMessageCallbacks) {
                try { cb(entry); } catch (e) { /* swallow */ }
            }
        }
    }

    /** Send a PRIVMSG to the joined channel. Returns {ok} or {error}. */
    post(message) {
        if (!this.connected || !this._sock) return { ok: false, error: "not connected" };
        if (typeof message !== "string") return { ok: false, error: "message must be string" };
        // Twitch chat message limit ~500 chars; truncate defensively
        const m = message.length > 480 ? message.slice(0, 477) + "..." : message;
        try {
            this._sock.write(`PRIVMSG #${this.channel} :${m}\r\n`);
            return { ok: true };
        } catch (e) {
            return { ok: false, error: e?.message || "write failed" };
        }
    }

    disconnect() {
        if (this._sock) {
            try { this._sock.write("QUIT\r\n"); } catch {}
            try { this._sock.destroy(); } catch {}
        }
        this._sock = null;
        this.connected = false;
        this._authOk = false;
    }

    status() {
        return {
            connected: this.connected,
            channel: this.channel,
            nick: this.nick,
            messageCount: this._totalReceived,
            recentMessages: this.messages.slice(-10),
            lastError: this._lastError,
        };
    }

    /** Return messages with idx > since. */
    messagesSince(since) {
        const s = Number.isFinite(+since) ? +since : -1;
        return this.messages.filter(m => m.idx > s);
    }
}

module.exports = { TwitchClient };
