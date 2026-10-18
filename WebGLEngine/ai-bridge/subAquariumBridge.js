// WebGLEngine/ai-bridge/subAquariumBridge.js -- UNNUMBERED (the version is chosen at ship time)
//
// THE SUB AQUARIUM'S ROUTES: a tank of submarines that peers can send theirs to, and the two health endpoints the FISH BRAIN and FLY BRAIN chips on server.html poll. The rules (what a sub is, whether to admit it, where
// it is kept, what the chips say) are in subAquariumCore.js and are gated without a server; this file is the thin skin of routes, trust and disk, and its gate drives it with fake requests.
//
// Owns /subaquarium and everything under it (an unknown path there is a 404 from this bridge), plus the two health routes:
//   GET  /ai/fishbrain/health     { ok, state: "live" | "standin" | "offline", detail, ... }  -- public, like /ai/brain/health: it says what is on THIS box
//   GET  /ai/flybrain/health      { ok, state: "live" | "stale" | "offline", detail, ... }
//   GET  /subaquarium/list        { ok, subs: [full subs incl. weights], counts }          -- public: it is the tank, which the aquarium page flies
//   POST /subaquarium/arrive      a PEER sends a sub here:  { sub: { name, circuit, weights, theta, hue } }  (or the sub bare)   TRUSTED ONLY (host, session or LAN: ctx.isTrusted), 64 KB at most, 30 an
//                                 address a minute. The stored sub is stamped with the address that DIALLED, never with anything in the body; a body that says it is local is not.
//   POST /subaquarium/send        THIS box sends one of ITS OWN subs to a peer:  { peer: "http://192.168.1.7:8787", id }   TRUSTED ONLY. The peer must be a LAN / mesh address (10/8, 172.16/12, 192.168/16,
//                                 100.64/10 CGNAT, 127/8, localhost, *.local): an open proxy to the internet is exactly what this must not be. No redirects are followed, no credentials in the URL are allowed.
//   POST /subaquarium/seed        TRUSTED: offer this box's own champions (brain/pilotSub*Wip.json and the tactician theta files) as local subs.
//   POST /subaquarium/remove      TRUSTED: { id }
// Nothing here executes anything that arrives: a sub is numbers. The aquarium PAGE flies it with code it already has.
"use strict";
const fs = require("fs");
const path = require("path");
const core = require("./subAquariumCore.js");

const PREFIX = "/subaquarium";
const HEALTH = new Set(["/ai/fishbrain/health", "/ai/flybrain/health"]);
const ROUTES = new Set([...HEALTH, PREFIX + "/list", PREFIX + "/arrive", PREFIX + "/send", PREFIX + "/seed", PREFIX + "/remove"]);
// the bridge owns its whole namespace (an unknown /subaquarium/x is a 404 from HERE, not a fall-through to a 404 from somewhere else) and the two health routes; a lookalike (/subaquariumx, /subaquarium-foo/x) is not ours
const owns = (url) => { const p = String(url || "").split("?")[0]; return p === PREFIX || p.startsWith(PREFIX + "/") || HEALTH.has(p); };
const RATE_PER_MIN = 30;
const PRIVATE_V4 = /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.|127\.)/;

/** Is this peer URL one we will dial? http(s) only, no credentials, a LAN / mesh / loopback / .local host. Returns { ok, base } or { ok: false, error }. */
function checkPeer(peer) {
    let u; try { u = new URL(String(peer || "")); } catch { return { ok: false, error: "bad peer url" }; }
    if (u.protocol !== "http:" && u.protocol !== "https:") return { ok: false, error: "peer must be http(s)" };
    if (u.username || u.password) return { ok: false, error: "no credentials in the peer url" };
    const h = u.hostname.toLowerCase().replace(/^\[|\]$/g, "");
    const lan = (/^\d+\.\d+\.\d+\.\d+$/.test(h) && PRIVATE_V4.test(h) && h.split(".").every((x) => Number(x) <= 255)) || h === "localhost" || h === "::1" || /\.local$/.test(h);
    if (!lan) return { ok: false, error: "peer must be a LAN/mesh address" };
    return { ok: true, base: u.origin };
}

function createBridge({ root = path.resolve(__dirname, ".."), now = () => Date.now(), fetchImpl = null, registry = null } = {}) {
    const reg = registry || core.createRegistry({ now });
    const arrivals = new Map();   // address -> [timestamps in the last minute]
    const exists = (rel) => { try { return fs.existsSync(path.join(root, rel)); } catch { return false; } };
    const read = (rel) => { try { return JSON.parse(fs.readFileSync(path.join(root, rel), "utf8")); } catch { return null; } };
    const listJson = (dir) => { try { return fs.readdirSync(path.join(root, dir)).filter((f) => /\.json$/i.test(f)); } catch { return []; } };

    const flyHealth = () => core.flyBrainHealth({ circuit: exists("vendor/male-cns/giant-fiber-circuit.json"), weights: exists("brain/pilotFlightWeightsDefault.json") });
    const fishHealth = () => {
        const pilots = listJson("brain").filter((f) => /^pilotSubWeights.*Wip\.json$/.test(f)).map((f) => "brain/" + f), fishCircuit = listJson("vendor/zebrafish").length > 0, flyCircuit = exists("vendor/male-cns/giant-fiber-circuit.json");
        return Object.assign(core.fishBrainHealth({ fishCircuit, flyCircuit, pilots }, reg.counts()), { circuit: { fish: fishCircuit, fly: flyCircuit }, pilots });
    };

    function readBody(req) {
        return new Promise((resolve) => {
            let b = "", n = 0, big = false;
            req.on("data", (c) => { n += c.length; if (n > core.MAX_BODY) { big = true; return; } b += c; });
            req.on("end", () => { if (big) return resolve({ tooBig: true }); try { resolve({ body: JSON.parse(b || "{}") }); } catch { resolve({ bad: true }); } });
            req.on("error", () => resolve({ bad: true }));
        });
    }
    const addrOf = (req) => String((req.socket && req.socket.remoteAddress) || "").replace(/^::ffff:/, "");
    const publicSub = (e) => ({ id: e.id, name: e.name, circuit: e.circuit, weights: e.weights, theta: e.theta, hue: e.hue, pilot: e.pilot, from: e.from, local: e.local, arrivedAt: e.arrivedAt });

    async function handle(req, res, ctx = {}) {
        const sendJson = ctx.sendJson || ((o, code = 200) => { res.writeHead(code, { "Content-Type": "application/json" }); res.end(JSON.stringify(o)); });
        const p = String(req.url || "").split("?")[0], method = req.method, trusted = ctx.isTrusted ? !!ctx.isTrusted(req) : false;
        const need = (m) => { if (method !== m) { sendJson({ ok: false, error: m }, 405); return false; } return true; };
        const needTrust = (what) => { if (!trusted) { sendJson({ ok: false, error: "not trusted: " + what + " is host, session or LAN only" }, 403); return false; } return true; };

        if (p === "/ai/fishbrain/health") { if (!need("GET")) return; return sendJson(Object.assign({ ok: true }, fishHealth())); }
        if (p === "/ai/flybrain/health") { if (!need("GET")) return; return sendJson(Object.assign({ ok: true }, flyHealth())); }
        if (p === "/subaquarium/list") { if (!need("GET")) return; return sendJson({ ok: true, subs: reg.list().map(publicSub), counts: reg.counts() }); }

        if (p === "/subaquarium/arrive") {
            if (!need("POST") || !needTrust("/subaquarium/arrive")) return;
            const from = addrOf(req), t = now(), recent = (arrivals.get(from) || []).filter((x) => t - x < 60000);
            if (recent.length >= RATE_PER_MIN) return sendJson({ ok: false, error: `too many subs from ${from}: ${RATE_PER_MIN} a minute` }, 429);
            const r = await readBody(req);
            if (r.tooBig) return sendJson({ ok: false, error: `body over ${core.MAX_BODY} bytes` }, 413);
            if (r.bad) return sendJson({ ok: false, error: "body is not JSON" }, 400);
            const v = core.validateSub(r.body && r.body.sub && typeof r.body.sub === "object" ? r.body.sub : r.body);
            if (!v.ok) return sendJson({ ok: false, error: v.error }, 400);
            recent.push(t); arrivals.set(from, recent);
            const a = reg.add(v.sub, { from, local: false });
            return sendJson({ ok: true, id: a.id, replaced: a.replaced, counts: reg.counts() });
        }

        if (p === "/subaquarium/seed") {
            if (!need("POST") || !needTrust("/subaquarium/seed")) return;
            const s = core.seedSubs(read); let added = 0;
            for (const sub of s.subs) { reg.add(sub, { from: "this-box", local: true }); added++; }
            return sendJson({ ok: true, added, skipped: s.skipped, counts: reg.counts() });
        }

        if (p === "/subaquarium/remove") {
            if (!need("POST") || !needTrust("/subaquarium/remove")) return;
            const r = await readBody(req); if (r.bad || r.tooBig) return sendJson({ ok: false, error: "body is not JSON" }, 400);
            return sendJson({ ok: true, removed: reg.remove(String((r.body && r.body.id) || "")), counts: reg.counts() });
        }

        if (p === "/subaquarium/send") {
            if (!need("POST") || !needTrust("/subaquarium/send")) return;
            const r = await readBody(req); if (r.bad || r.tooBig) return sendJson({ ok: false, error: "body is not JSON" }, 400);
            const e = reg.get(String((r.body && r.body.id) || ""));
            if (!e) return sendJson({ ok: false, error: "no such sub" }, 404);
            if (!e.local) return sendJson({ ok: false, error: "only this box's own subs can be sent on" }, 400);
            const pc = checkPeer(r.body && r.body.peer); if (!pc.ok) return sendJson({ ok: false, error: pc.error }, 400);
            const doFetch = fetchImpl || ctx.fetch || globalThis.fetch;
            if (typeof doFetch !== "function") return sendJson({ ok: false, error: "no fetch available" }, 500);
            const sub = { name: e.name, circuit: e.circuit, weights: e.weights, theta: e.theta, hue: e.hue };
            let reply;
            try {
                const rr = await doFetch(pc.base + "/subaquarium/arrive", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sub }), redirect: "error", signal: AbortSignal.timeout(10000) });
                reply = await rr.json().catch(() => null);
            } catch (err) { return sendJson({ ok: false, error: "peer unreachable: " + String((err && err.message) || err).slice(0, 120) }, 502); }
            if (!reply || !reply.ok) return sendJson({ ok: false, error: "peer refused: " + String((reply && reply.error) || "no answer").slice(0, 160) }, 502);
            return sendJson({ ok: true, peer: pc.base, id: e.id, reply: { id: reply.id, replaced: !!reply.replaced } });
        }
        return sendJson({ ok: false, error: "no such route" }, 404);
    }
    return { owns, handle, registry: reg, checkPeer, fishHealth, flyHealth };
}

module.exports = { owns, createBridge, checkPeer, PREFIX, ROUTES, RATE_PER_MIN };
