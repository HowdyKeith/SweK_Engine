// WebGLEngine/ai-bridge/fleetBridge.js -- v2221 -- tell the peers when one sails into the fleet.
//
// server.html detects a peer arriving/leaving (via FleetTracker over the peer roster) and POSTs
// the transition here; this fans it out to the LAN as a normal announcement so the OTHER boxes --
// including the one that just joined -- see it (toast / peer-activity), the same fan-out the
// disk-low and update announcements already use. No new transport, no new receive path.
//
// Owns:  POST /fleet/announce   { verb:"in"|"out", peer:<name>, run?:<id> }
//
// TRUSTED-ONLY: this triggers a broadcast to every peer, so it is behind `_isTrustedReq`, handed
// in by server.js. The actual broadcast function is ALSO handed in (bound to announceBridge +
// the peer list + this box's url) so the bridge never has to know the peer set -- it only shapes
// and validates the message. The peer name is sanitised before it becomes toast text on another
// machine; a name is a label, not markup.

"use strict";

const RE_PEER = /^[\w .:\/@()-]{1,80}$/;   // a peer's display name/url: no <>, no control chars
const VERBS = new Set(["in", "out"]);

function fleetText(verb, peer, host) {
    const who = host ? (host + "'s fleet") : "the fleet";
    return verb === "in" ? `${peer} sailed into ${who}` : `${peer} sailed out of ${who}`;
}

function validate(body) {
    const verb = String((body && body.verb) || "").toLowerCase();
    if (!VERBS.has(verb)) return { ok: false, error: "verb must be 'in' or 'out'" };
    const peer = String((body && body.peer) || "").trim();
    if (!RE_PEER.test(peer)) return { ok: false, error: "peer is a short name/url (no angle brackets or control chars)" };
    const run = String((body && body.run) || "").slice(0, 60);
    return { ok: true, verb, peer, run };
}

const ROUTES = new Set(["/fleet/announce"]);
function owns(url) { return ROUTES.has((url || "").split("?")[0]); }

function readBody(req) {
    return new Promise((resolve) => {
        let b = ""; req.on("data", (c) => { b += c; if (b.length > 16384) b = b.slice(0, 16384); });
        req.on("end", () => { try { resolve(JSON.parse(b || "{}")); } catch { resolve({}); } });
    });
}

async function handle(req, res, ctx = {}) {
    const sendJson = ctx.sendJson || ((o, code = 200) => { res.writeHead(code, { "Content-Type": "application/json" }); res.end(JSON.stringify(o)); });
    const p = (req.url || "").split("?")[0];

    const trusted = ctx.isTrusted ? !!ctx.isTrusted(req) : false;
    if (!trusted) return sendJson({ ok: false, error: "not trusted: /fleet/* fans out to peers and is host, session or LAN only" }, 403);
    if (req.method !== "POST") return sendJson({ ok: false, error: "POST" }, 405);
    if (p !== "/fleet/announce") return sendJson({ ok: false, error: "no such route" }, 404);

    const v = validate(await readBody(req));
    if (!v.ok) return sendJson(v, 400);

    const text = fleetText(v.verb, v.peer, ctx.host || null);
    const event = { kind: "fleet", verb: v.verb, peer: v.peer, run: v.run, at: Date.now() };
    // ctx.announce is bound in server.js to announceBridge.broadcast(payload, _announcePeers(), selfUrl).
    let sent = null;
    if (typeof ctx.announce === "function") {
        try { sent = await ctx.announce({ kind: "fleet", text, gestures: v.verb === "in" ? ["wave", "speak"] : ["bow"], fleet: event }); } catch (e) { sent = { ok: false, error: String(e && e.message || e) }; }
    }
    return sendJson({ ok: true, event, text, broadcast: sent });
}

module.exports = { owns, handle, validate, fleetText, _routes: ROUTES };
