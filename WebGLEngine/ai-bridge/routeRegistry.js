// ai-bridge/routeRegistry.js -- v4030 -- A PRECONDITION IS A DECLARED THING, NOT A LINE COPIED INTO EVERY
// HANDLER THAT NEEDS IT.
//
// Lifted from hermes-agent's tool registry, whose registration is (name, schema, handler, check_fn): the
// check_fn runs BEFORE the handler, so a reader can see what a route requires without reading its body.
//
// *** THIS TREE ALREADY HAD HALF THE IDEA, INFORMALLY, AND THE INFORMAL HALF HAD ALREADY DRIFTED. ***
// server.js hands `isTrusted: _isTrustedReq` into bzBridge/rocketBridge/fleetBridge/puppeteerBridge/
// jellyfinBridge specifically so "the bridge must not be able to decide for itself" (server.js's own comment
// at the rocketBridge wiring). That IS a check_fn -- it was just conventional, and every call site wrote out
// its own copy of the guard by hand.
//
// MEASURED at v4030, grepping ai-bridge/server.js for the refusal those hand-written guards produce:
//     "trusted only"                      89 sites
//     "local only"                        61 sites
//     "auth required"                     34 sites
//     "trusted"                            2 sites
//     "trusted or known mesh peer only"    1 site
// ONE PRECONDITION, FIVE SPELLINGS. Not because the rule differs -- because nothing made the check a single
// reusable thing. That is v3527's rule ("the second copy is never the one that gets updated") wearing a
// permission check: 187 copies of one guard is 187 places the wording or the logic can drift apart, and it
// already has. A CLIENT CANNOT BRANCH ON A REFUSAL THAT IS SPELLED FIVE WAYS.
//
// gpuBrainBridge.js separately hand-rolls the same body-read-and-clamp seven times, each with its limit typed
// inline at the call site (4096, 65536, 1024*1024...) rather than declared with the route it belongs to.
//
// *** WHAT THIS DELIBERATELY DOES NOT DO. ***
//   - It does NOT replace server.js's top-level `if (X.owns(url)) X.handle(req,res,ctx)` dispatch chain. That
//     stays exactly as it is. This is an INTERNAL helper one bridge module uses to build its own owns()/
//     handle() pair, so migrating a bridge touches that bridge's file and nothing else, and the external
//     contract server.js depends on is byte-for-byte unchanged.
//   - It does NOT implement or prepare for a wire protocol. tools/roundhouse/capabilityCard-selfcheck.mjs
//     already settled that question for this tree: "putting a second transport with its own auth on the
//     trusted path is the reasoning that kept copyparty and A2A off it. If something later wants to speak MCP
//     to this, that is a SHIM OVER THIS, not an architecture." A registry is what such a shim would READ --
//     but no `mcp:` field, description field, or export exists here, because MCP IS NOT DECIDED AND BUILDING
//     SCAFFOLDING FOR AN UNDECIDED FUTURE IS THE THING THIS TREE'S "wire it or delete it" RULE PREVENTS.
"use strict";

/**
 * Named preconditions: (req, ctx) => null | { error, detail }.
 *
 * null means proceed. The `error` is a STABLE MACHINE CODE, identical for every route requiring the same
 * thing -- that is the whole point, and it is what collapses the 89/61/34/2/1 split into one string a client
 * can actually branch on. `detail` is the per-route human sentence, which is how a route keeps a genuinely
 * more informative message (rocketBridge's "/rocket/* controls processes and is host, session or LAN only"
 * says more than "trusted-only" and that information should not be thrown away to win uniformity).
 *
 * ONE CODE TO BRANCH ON, ONE SENTENCE TO READ. Collapsing both into one string is what produced five
 * spellings; keeping only the code would delete real information.
 *
 * *** checks.trusted FAILS CLOSED. *** ctx.isTrusted is READ, never imported -- the existing discipline, kept.
 * A bridge whose ctx carries no isTrusted denies EVERY request rather than allowing every one. An absent
 * capability must read as "nothing is trusted here", never as "everything is": the failure mode of the
 * inverse is a process-spawning route open to the internet because a wiring line was forgotten.
 */
const checks = {
    none: () => null,
    trusted: (req, ctx) => ((typeof ctx.isTrusted === "function" && ctx.isTrusted(req)) ? null : { error: "trusted-only" }),
};

/**
 * Build a registry for one bridge. `prefix` is passed in rather than hardcoded so this file assumes nothing
 * about any one bridge's URL space.
 */
function createRegistry(prefix) {
    const routes = new Map();   // "METHOD /path" -> spec

    /**
     * spec:
     *   check         (req, ctx) => null|{error,detail}   default checks.none
     *   denyDetail    string                              human sentence attached to this route's refusal
     *   maxBodyBytes  number                              default 65536; replaces the hand-copied clamps
     *   schema        (data) => string|null               null == valid, a string is the reason it is not
     *   handler       (data, req, res, ctx) => any
     */
    function register(method, path, spec) {
        if (typeof spec.handler !== "function") throw new Error("route " + method + " " + path + " has no handler");
        const key = method + " " + path;
        // A DUPLICATE REGISTRATION IS A THROW, NOT A SILENT OVERWRITE. Two handlers for one route means one of
        // them is dead code, and a Map.set would pick the later one without saying so -- the exact shape of
        // bug bridgeWiring-selfcheck exists to catch one level up.
        if (routes.has(key)) throw new Error("route " + key + " is already registered");
        routes.set(key, Object.assign({ check: checks.none, schema: null, maxBodyBytes: 65536, denyDetail: "" }, spec));
    }
    const get = (path, spec) => register("GET", path, spec);
    const post = (path, spec) => register("POST", path, spec);

    /** Exact-match only: a registry owns the routes it registered, never a prefix wildcard. A bridge that
     *  owns a whole namespace keeps its own owns() and delegates only the migrated paths here, which is what
     *  makes route-at-a-time migration possible. */
    function owns(url) { return routes.has("GET " + _p(url)) || routes.has("POST " + _p(url)); }
    const _p = (url) => String(url || "").split("?")[0];

    function dispatch(spec, data, req, res, ctx) {
        if (spec.schema) {
            const err = spec.schema(data);
            if (err) { ctx.sendJson({ ok: false, error: "schema", detail: err }, 400); return; }
        }
        try {
            const r = spec.handler(data, req, res, ctx);
            if (r && typeof r.catch === "function") {
                r.catch((e) => ctx.sendJson({ ok: false, error: "handler", detail: String((e && e.message) || e).slice(0, 200) }, 500));
            }
        } catch (e) {
            ctx.sendJson({ ok: false, error: "handler", detail: String((e && e.message) || e).slice(0, 200) }, 500);
        }
    }

    function handle(req, res, ctx) {
        const p = _p(req.url);
        const spec = routes.get(req.method + " " + p);
        if (!spec) { ctx.sendJson({ ok: false, error: "no-such-route", detail: req.method + " " + p }, 404); return; }

        // *** THE PRECONDITION RUNS FIRST, BEFORE THE BODY IS READ OR PARSED. *** Checking after parsing would
        // mean a request that was always going to be refused still got to spend the server's memory and CPU
        // being understood first. The ORDERING is the discipline, not the saved work.
        const denied = spec.check(req, ctx);
        if (denied) {
            ctx.sendJson({ ok: false, error: denied.error, detail: spec.denyDetail || denied.detail || "" }, 403);
            return;
        }

        if (req.method === "GET") { dispatch(spec, new URL(req.url, "http://x").searchParams, req, res, ctx); return; }

        let body = "";
        req.on("data", (c) => { body += c; if (body.length > spec.maxBodyBytes) body = body.slice(0, spec.maxBodyBytes); });
        req.on("end", () => {
            let data;
            try { data = JSON.parse(body || "{}"); }
            catch { ctx.sendJson({ ok: false, error: "bad-json", detail: "body did not parse as JSON" }, 400); return; }
            dispatch(spec, data, req, res, ctx);
        });
    }

    /** The registered routes, for gates and for a bridge's own census. Returned as a fresh array of plain
     *  strings so a caller cannot mutate the live Map. */
    function list() { return [...routes.keys()].sort(); }

    return { get, post, owns, handle, list, prefix };
}

module.exports = { createRegistry, checks };
