// ai-bridge/jellyfinBridge.js — detect Jellyfin, link to it, and stop there.
//
// v2209. This file is deliberately small, and the reason is the interesting part.
//
// JELLYFIN IS NOT A TRANSPORT. For sending a live stream to a device on the LAN, this engine already runs
// `go2rtc`: WebRTC at sub-second latency, no transcode, a single Go binary the bridge installs and
// autostarts. Jellyfin's live path is HLS with an ffmpeg transcode in front of it -- six to twenty seconds
// behind. Putting Jellyfin in that path would be adding a media library to solve a transport problem that is
// already solved, and would make it worse.
//
// JELLYFIN IS A LIBRARY, and that is a thing the engine does not have and will not build: metadata scraping,
// resume-where-you-left-off across devices, and native clients on Roku, Android TV and Kodi that nobody here
// is going to write. If you want that, run Jellyfin.
//
// SO THE INTEGRATION IS DETECT AND LINK, and nothing else:
//
//   * The engine does NOT proxy it. Jellyfin serves its own web app on :8096.
//   * The engine does NOT authenticate to it. It has its own accounts. TWO AUTH SYSTEMS IS WORSE THAN ONE,
//     and a bridge that held Jellyfin credentials would be a place for them to leak from.
//   * The engine does NOT transcode through it, index for it, or write to its database.
//
// What it does: say whether it is there, say where, and offer a link. If that ever stops being enough, the
// next step is a real decision and not a small one, and this comment is where it should be argued.

"use strict";

const http = require("http");

const PORT = Number(process.env.JELLYFIN_PORT || 8096);
const HOST = String(process.env.JELLYFIN_HOST || "127.0.0.1");
const TIMEOUT_MS = 1500;

// Jellyfin answers `/System/Info/Public` without any authentication, which is exactly what a detector wants:
// it proves the server is a Jellyfin and not merely something listening on 8096.
function probe(host = HOST, port = PORT) {
    return new Promise((resolve) => {
        const req = http.get({ host, port, path: "/System/Info/Public", timeout: TIMEOUT_MS }, (res) => {
            let body = "";
            res.on("data", (c) => { body += c; if (body.length > 8192) req.destroy(); });
            res.on("end", () => {
                if (res.statusCode !== 200) return resolve({ ok: false, reached: true, status: res.statusCode });
                try {
                    const j = JSON.parse(body);
                    // A server that answers this route with JSON naming itself is a Jellyfin. Anything else
                    // listening on 8096 is not, and we say so rather than linking a user at it.
                    if (!j || typeof j.Version !== "string") return resolve({ ok: false, reached: true, error: "something is on this port, and it is not Jellyfin" });
                    resolve({ ok: true, reached: true, version: j.Version, serverName: j.ServerName || null, id: j.Id || null, startupComplete: j.StartupWizardCompleted !== false });
                } catch (e) { resolve({ ok: false, reached: true, error: "not JSON: not Jellyfin" }); }
            });
        });
        req.on("timeout", () => { req.destroy(); resolve({ ok: false, reached: false, error: "timed out" }); });
        req.on("error", (e) => resolve({ ok: false, reached: false, error: e.code === "ECONNREFUSED" ? "nothing is listening" : e.message }));
    });
}

// The url a browser should open. Loopback for the host; the engine's own LAN address for anybody else, since
// `localhost` is the one address that means a different machine on every machine.
function webUrl(lanHost) {
    const h = lanHost && lanHost !== "127.0.0.1" && lanHost !== "localhost" ? lanHost : HOST;
    return `http://${h}:${PORT}/`;
}

async function status(lanHost) {
    const p = await probe();
    return {
        ok: true,
        installed: p.ok,
        running: p.reached && p.ok,
        version: p.version || null,
        serverName: p.serverName || null,
        // A fresh install answers the probe but has not been through its setup wizard. Linking someone at a
        // setup wizard and calling it a media library is how a feature gets a bad name.
        needsSetup: p.ok ? p.startupComplete === false : null,
        url: p.ok ? webUrl(lanHost) : null,
        why: p.ok ? null : (p.error || "not found"),
        // Said out loud, in the payload, because it is the thing a reader of the panel will wonder.
        note: "Jellyfin is a media LIBRARY. Live LAN streams go through go2rtc (WebRTC, sub-second); Jellyfin's live path is HLS with a transcode, 6-20s behind.",
        port: PORT,
    };
}

const ROUTES = new Set(["/jellyfin/status"]);
function owns(url) { return ROUTES.has((url || "").split("?")[0]); }

async function handle(req, res, ctx = {}) {
    const sendJson = ctx.sendJson || ((o, code = 200) => { res.writeHead(code, { "Content-Type": "application/json" }); res.end(JSON.stringify(o)); });
    if (req.method !== "GET") return sendJson({ ok: false, error: "GET" }, 405);
    // Detection is not a secret, but the LAN address it hands back is only useful to somebody already here.
    const trusted = ctx.isTrusted ? !!ctx.isTrusted(req) : true;
    if (!trusted) return sendJson({ ok: false, error: "local only" }, 403);
    return sendJson(await status(ctx.lanHost));
}

module.exports = { owns, handle, status, probe, webUrl, PORT, _routes: ROUTES };
