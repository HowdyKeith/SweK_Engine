// WebGLEngine/ai-bridge/blobBrainBridge.js -- the blob flight policy, served and remembered.
//
// Owns:
//   GET  /ai/brain/blob/policy        -> { source: "learned"|"baked", weights, score, iters, by, at }
//   POST /ai/brain/blob/policy        -> offer trained weights { weights, score, iters, by }; BEST WINS
//   POST /ai/brain/blob/policy/reset  -> forget the learned policy, back to the client's baked weights
//
// Registered BEFORE gpuBrainBridge, which owns the whole /ai/brain prefix and would swallow these silently -- the
// same trap that nearly killed /ai/brain/bench in v2155, and the same reason bzTactics and csTactics go first.
//
// P2P by default, because it costs nothing here: the store only accepts weights that scored BETTER on the held-out
// set, so any peer may offer and only an improvement lands. Point Galaxina, the Mac and PurtyGF at one of these and
// the fleet converges on whichever of them actually learned to fly best. Nobody can make it worse by shouting last.
"use strict";
const store = require("../brain/blobPolicyStore.js");

const ROUTE = "/ai/brain/blob/policy";

function register(app) {
    // app is the tiny route table the other bridges use: { get(path, fn), post(path, fn) } or a raw handler list.
    if (!app || typeof app.get !== "function") return false;
    app.get(ROUTE, (req, res) => _json(res, 200, store.serve()));
    app.post(ROUTE, (req, res, body) => {
        const sub = _body(body);
        if (!sub) return _json(res, 400, { ok: false, reason: "bad JSON" });
        const r = store.offer({ weights: sub.weights, score: sub.score, iters: sub.iters, by: sub.by || _who(req) });
        return _json(res, r.ok ? 200 : 400, r);
    });
    app.post(ROUTE + "/reset", (req, res) => _json(res, 200, store.reset()));
    return true;
}
function _who(req) { try { return (req && req.headers && (req.headers["x-swek-peer"] || req.headers["x-forwarded-for"])) || "local"; } catch { return "local"; } }
function _body(body) { try { return typeof body === "string" ? JSON.parse(body) : (body && typeof body === "object" ? body : null); } catch { return null; } }
function _json(res, code, obj) { try { res.writeHead(code, { "Content-Type": "application/json" }); res.end(JSON.stringify(obj)); } catch {} return true; }

// raw-http fallback for server.js's own dispatcher shape (same as the other brain bridges)
function handle(req, res, url, body) {
    const p = String(url || "").split("?")[0];
    if (p === ROUTE && req.method === "GET") return _json(res, 200, store.serve());
    if (p === ROUTE && req.method === "POST") {
        const sub = _body(body); if (!sub) return _json(res, 400, { ok: false, reason: "bad JSON" });
        const r = store.offer({ weights: sub.weights, score: sub.score, iters: sub.iters, by: sub.by || _who(req) });
        return _json(res, r.ok ? 200 : 400, r);
    }
    if (p === ROUTE + "/reset" && req.method === "POST") return _json(res, 200, store.reset());
    return false;
}
module.exports = { register, handle, ROUTE, store };
