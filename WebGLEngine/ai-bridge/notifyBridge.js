// notifyBridge.js -- v3332. The hub can WAKE THE iOS PEER, which is the one thing that page says it cannot do.
//   GET  /notify          -> { ok, state, server, topic, authed, why, last }   status; NEVER returns the token
//   POST /notify/send     -> { ok, accepted, id, why }                          publish one short verdict line
//
// WHY THIS EXISTS. ios-peer.html's own header lists what the iOS peer CANNOT do: "a background compute daemon,
// AN APP PUSH, the full spawning suite." The first and third are properties of the platform. THE SECOND IS NOT --
// it is simply something nothing here had ever built. Before this file, the whole tree had ZERO hits for ntfy,
// Notification.requestPermission, serviceWorker, web-push, FCM or APNs. Not a capability nobody reached for; a
// capability that was absent.
//
// IT IS THE LIGHTHOUSE MOVE ONE STEP FURTHER. v2953 built push-checkin because a NAT'd peer cannot be DIALLED,
// so it dials us. A phone can be neither dialled NOR kept listening -- so THE OS BECOMES THE LISTENER. ntfy
// (binwiederhier/ntfy) is an HTTP pub-sub service whose native app the OS wakes; the hub PUTs to a topic.
//
// *** AND IT IS A DOORBELL, NOT A DAEMON. THIS IS THE CLAIM THIS FILE REFUSES TO OVERSTATE. *** The notification
// lands in ntfy's OWN app, not in ios-peer.html, which is a browser page. A person still taps it, which opens the
// page. So this converts "the phone is unreachable" into "the phone can be SUMMONED BY A HUMAN" -- real, and
// worth having, and NOT a background worker. ios-peer.html line 47 stays true and is deliberately left standing.
//
// SCOPED TO iOS ON PURPOSE. On Android, Termux + Termux:Boot (v2935) already gives a real background worker, so
// a notification adds little there. On iOS it is the only option. A round scoped to "notify both phones" would
// have built for Android something Android already has.
//
// NOT A TRANSPORT. ntfy has attachments; the Grab does not use them. A 70 MB build with per-chunk SHA-256, Range
// resume and chunkAudit moved through a notification service is a SECOND TRANSPORT WITH A SECOND FAILURE MODEL --
// the same reasoning that kept copyparty off the engine-to-engine path. This publishes a SHORT LINE, capped.
"use strict";
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

// The config lives OUTSIDE the tree, beside the other hub state (~/.voxelbridge), for the reason signRelease
// keeps its private key out: a token that lives in the repo rides into every zip that repo ever ships.
const CONF = path.join(os.homedir(), ".voxelbridge", "ntfy.json");

// A notification is a VERDICT LINE, never a report. Gate output can carry absolute paths and, one day, something
// worse; a cap that is enforced here cannot be forgotten at a call site.
const MAX_MESSAGE = 400;
const MAX_TITLE = 120;

// Hosts whose topics are PRIVATE because the network is. Everything else is treated as public-by-default, which
// is what ntfy.sh actually is.
function isPrivateHost(h) {
    const host = String(h || "").toLowerCase();
    return host === "localhost" || host === "127.0.0.1" || host === "::1" ||
        /^10\./.test(host) || /^192\.168\./.test(host) ||
        /^172\.(1[6-9]|2[0-9]|3[01])\./.test(host) || /\.local$/.test(host);
}

function readConfig() {
    const env = {
        server: process.env.SWEK_NTFY_SERVER,
        topic: process.env.SWEK_NTFY_TOPIC,
        token: process.env.SWEK_NTFY_TOKEN,
    };
    let file = {};
    try { file = JSON.parse(fs.readFileSync(CONF, "utf8")); } catch { file = {}; }
    return {
        server: env.server || file.server || "",
        topic: env.topic || file.topic || "",
        token: env.token || file.token || "",
    };
}

// *** THREE STATES, NOT A BOOLEAN. UNCONFIGURED IS NOT FAILED AND NEITHER IS REFUSED. ***
// "nothing is set up here" and "it is set up and I will not use it" and "it broke" are three different facts with
// three different responses, and a caller that sees one flag cannot tell them apart. This is the same distinction
// v3076 drew between a timeout and a failure, and the one v3048 drew between NEVER RUN and PASS.
function evaluate(cfg) {
    if (!cfg.server || !cfg.topic) {
        return { state: "unconfigured", why: "no ntfy server or topic set. Write " + CONF + " as {\"server\":\"https://...\",\"topic\":\"...\",\"token\":\"<paste yours>\"} or set SWEK_NTFY_SERVER / SWEK_NTFY_TOPIC / SWEK_NTFY_TOKEN." };
    }
    let host = "";
    try { host = new URL(cfg.server).hostname; } catch {
        return { state: "refused", why: "server is not a URL: " + cfg.server };
    }
    // *** THE REFUSAL THAT EARNS ITS KEEP: A TOPIC NAME IS NOT A SECRET. *** On a public ntfy instance an
    // unauthenticated topic is readable AND WRITABLE by anyone who guesses or overhears the name. Publishing gate
    // verdicts there is a leak; accepting that anyone can publish TO it is an injection vector, and the fleet
    // already re-grades foreign ledgers rather than trusting them (v2968) for exactly this reason. So a public
    // host with no token is REFUSED BY NAME rather than working quietly and being discovered later.
    if (!isPrivateHost(host) && !cfg.token) {
        return { state: "refused", host, why: "public ntfy host (" + host + ") with NO auth token. A topic name is not a secret: anyone who knows it can read AND publish. Self-host on the LAN, or set a token." };
    }
    return { state: "ready", host, why: "" };
}

let _last = null;   // the last publish ATTEMPT, whatever became of it -- an absent one reads as "never tried"

function status() {
    const cfg = readConfig();
    const ev = evaluate(cfg);
    // The token is READ here and never leaves. `authed` reports WHETHER there is one, which is the only part of
    // it a caller has any business knowing.
    return {
        ok: true,
        state: ev.state,
        server: cfg.server || null,
        topic: cfg.topic || null,
        authed: !!cfg.token,
        why: ev.why || null,
        configPath: CONF,
        last: _last,
    };
}

async function publish(o) {
    const cfg = readConfig();
    const ev = evaluate(cfg);
    if (ev.state !== "ready") {
        _last = { at: Date.now(), accepted: false, state: ev.state, why: ev.why };
        return { ok: false, accepted: false, state: ev.state, why: ev.why };
    }
    const title = String(o.title || "SweK").slice(0, MAX_TITLE);
    const message = String(o.message || "").slice(0, MAX_MESSAGE);
    if (!message) return { ok: false, accepted: false, state: "ready", why: "empty message -- a notification with nothing in it is worse than none" };

    const url = cfg.server.replace(/\/+$/, "") + "/" + encodeURIComponent(cfg.topic);
    const headers = { "Content-Type": "text/plain", Title: title };
    if (cfg.token) headers.Authorization = "Bearer " + cfg.token;
    if (o.tags) headers.Tags = String(o.tags).slice(0, 120);
    if (o.priority) headers.Priority = String(o.priority).slice(0, 8);

    try {
        const ctl = AbortSignal.timeout ? AbortSignal.timeout(8000) : undefined;
        const r = await fetch(url, { method: "POST", headers, body: message, signal: ctl });
        const body = await r.text();
        let id = null;
        try { id = JSON.parse(body).id || null; } catch { id = null; }
        // *** ACCEPTED IS NOT DELIVERED, AND THE FIELD IS NAMED `accepted` SO NOBODY CAN READ IT AS DELIVERY. ***
        // A 200 here means THE NTFY SERVER TOOK THE MESSAGE. Whether a phone ever displayed it depends on APNs,
        // the device being reachable, the app being installed and the user's notification settings -- none of
        // which this process can see. Calling this "delivered" would be the two-things-wearing-one-label defect
        // in the place it does the most damage: somebody would stop checking whether the phone got told.
        const out = { ok: r.ok, accepted: r.ok, status: r.status, id, why: r.ok ? null : ("ntfy answered " + r.status + " " + body.slice(0, 200)) };
        _last = { at: Date.now(), accepted: out.accepted, status: r.status, id: out.id, why: out.why };
        return out;
    } catch (e) {
        // A publish that fails is NAMED. A swallowed notification failure is indistinguishable from a phone that
        // was told and ignored it.
        const why = "publish failed: " + (e && e.message ? e.message : String(e));
        _last = { at: Date.now(), accepted: false, why };
        return { ok: false, accepted: false, state: "ready", why };
    }
}

// *** THE HUB HAS VERDICTS AND, UNTIL NOW, NONE OF THEM NOTIFIED ANYTHING. *** v3332 built the pipe and left
// publish() with zero callers, which is the "module with no caller is unfinished" law failing on the half that
// is easiest to forget: a bridge with a front door still has nobody CALLING it in anger.
//
// event() is the call site's door. It exists so a call site does not have to know about config, refusals, states
// or ntfy at all -- it names WHAT HAPPENED and gets on with its work.
//
// *** IT NEVER THROWS AND NEVER REJECTS, AND THAT IS DELIBERATE. *** These calls sit on paths that matter more
// than the notification does -- the auto-update restart being the first one. A notifier that can throw turns
// "the phone was not told" into "the update did not happen", which inverts the priority. The promise is
// swallowed here so no caller has to remember to.
function event(kind, message, opts) {
    try {
        const o = Object.assign({ title: "SweK " + String(kind || "event"), message: String(message || "") }, opts || {});
        return Promise.resolve(publish(o)).then((r) => {
            // A publish that did not happen is LOGGED, never silent -- a swallowed notification failure is
            // indistinguishable from a phone that was told and ignored it.
            if (!r || !r.accepted) console.log("[notify] not sent (" + ((r && r.state) || "?") + "): " + ((r && r.why) || "no reason given"));
            return r;
        }).catch((e) => { console.log("[notify] threw: " + (e && e.message)); return { ok: false, accepted: false, why: String(e && e.message) }; });
    } catch (e) { console.log("[notify] threw: " + (e && e.message)); return Promise.resolve({ ok: false, accepted: false, why: String(e && e.message) }); }
}

function owns(url) {
    const p = String(url || "").split("?")[0];
    return p === "/notify" || p === "/notify/send";
}

function handle(req, res, ctx) {
    const send = (ctx && ctx.sendJson) ? ctx.sendJson : ((o, c) => { res.writeHead(c || 200, { "Content-Type": "application/json" }); res.end(JSON.stringify(o)); });
    const p = String(req.url || "").split("?")[0];
    if (req.method === "GET" && p === "/notify") { send(status()); return; }
    if (req.method === "POST" && p === "/notify/send") {
        let d = "";
        req.on("data", (c) => { d += c; if (d.length > 64 * 1024) req.destroy(); });
        req.on("end", async () => {
            let o = {};
            try { o = JSON.parse(d || "{}"); } catch { send({ ok: false, accepted: false, why: "bad body" }, 400); return; }
            send(await publish(o));
        });
        return;
    }
    send({ ok: false, why: "GET /notify or POST /notify/send" }, 405);
}

module.exports = { owns, handle, status, publish, event, evaluate, isPrivateHost, readConfig, MAX_MESSAGE, MAX_TITLE, CONF };
