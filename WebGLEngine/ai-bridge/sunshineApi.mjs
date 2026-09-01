// ai-bridge/sunshineApi.mjs -- v4214 -- a real client for the Sunshine HTTP API.
//
// *** MEASURED: ai-bridge/sunshineBridge.js HAS NEVER CALLED THE SUNSHINE API ONCE. *** Every one of its four
// references to port 47990 is string interpolation into a link it hands the user. The bridge installs
// Sunshine, starts it, and then says "here is a URL, go and click it". That was the whole integration.
//
// What prompted the look: Keith sent qiin2333/sunshine-control-panel (MIT). *** IT IS NOT A SURFACE WE CAN
// USE, AND THE REASON IS WORTH RECORDING SO NOBODY RE-EVALUATES IT: *** its Axum proxy runs on 48081 but only
// inside the Tauri desktop app, reachable through Tauri IPC -- it is a CORS shim for a Vue frontend, not a
// headless service. And what it proxies TO is port 47990, which this tree already reaches directly. Taking a
// dependency on a desktop app to get at a port we already have would be strictly worse.
//
// BUT IT PROVED SOMETHING WORTH ACTING ON: that 47990 API is rich enough to drive an entire application --
// app list, config, pairing, clients, covers, restart. So the answer is not to integrate their panel; it is
// to stop treating ours as a link.
//
// ---- WHERE THE ENDPOINT LIST COMES FROM --------------------------------------------------------------------
// LizardByte/Sunshine's own docs/api.md, read at v4214. NOT inferred from the control panel's frontend and not
// guessed: an endpoint table invented from a UI is a table of what one client happened to call.
//
// ---- LICENCE -------------------------------------------------------------------------------------------------
// Sunshine is GPL-3.0. This file vendors nothing, links nothing and reimplements nothing: it SPEAKS HTTP to a
// binary the user installed themselves, which is the arrangement sunshineBridge.js already documented and the
// reason the engine's release zip carries no Sunshine code. An endpoint path is a fact about a protocol.
//
// ---- WHAT IS PURE HERE, AND WHY --------------------------------------------------------------------------
// Building a request (url, method, headers, body) and reading a response are pure functions and live here.
// PERFORMING one is not, and does not. So the gate drives every shape, every auth header, every error
// classification and the index hazard below in node, with no Sunshine anywhere.

/** Sunshine's config web server. https, and see TLS below. */
export const DEFAULT_PORT = 47990;

/**
 * The endpoint table, from LizardByte/Sunshine docs/api.md.
 * `mutates` marks the ones that change state -- those are the ones that need the CSRF token.
 */
export const ENDPOINTS = Object.freeze({
    csrfToken:        { path: "/api/csrf-token",       method: "GET",    mutates: false },
    apps:             { path: "/api/apps",             method: "GET",    mutates: false },
    saveApp:          { path: "/api/apps",             method: "POST",   mutates: true  },
    closeApp:         { path: "/api/apps/close",       method: "POST",   mutates: true  },
    deleteApp:        { path: "/api/apps/{index}",     method: "DELETE", mutates: true  },
    browse:           { path: "/api/browse",           method: "GET",    mutates: false },
    clients:          { path: "/api/clients/list",     method: "GET",    mutates: false },
    unpair:           { path: "/api/clients/unpair",   method: "POST",   mutates: true  },
    unpairAll:        { path: "/api/clients/unpair-all", method: "POST", mutates: true  },
    updateClient:     { path: "/api/clients/update",   method: "POST",   mutates: true  },
    config:           { path: "/api/config",           method: "GET",    mutates: false },
    saveConfig:       { path: "/api/config",           method: "POST",   mutates: true  },
    configLocale:     { path: "/api/configLocale",     method: "GET",    mutates: false },
    cover:            { path: "/api/covers/{index}",   method: "GET",    mutates: false },
    uploadCover:      { path: "/api/covers/upload",    method: "POST",   mutates: true  },
    logs:             { path: "/api/logs",             method: "GET",    mutates: false },
    setPassword:      { path: "/api/password",         method: "POST",   mutates: true  },
    pin:              { path: "/api/pin",              method: "POST",   mutates: true  },
    resetDisplay:     { path: "/api/reset-display-device-persistence", method: "POST", mutates: true },
    restart:          { path: "/api/restart",          method: "POST",   mutates: true  },
    virtualInput:     { path: "/api/virtual-input/status", method: "GET", mutates: false },
});

export const NAMES = Object.freeze(Object.keys(ENDPOINTS));

/**
 * *** EVERY ENDPOINT NEEDS BASIC AUTH, AND THE BRIDGE HAS NEVER SENT ANY. *** That is not a detail to add
 * later -- it is why "here is a URL" was the only integration that could ever have worked. An unauthenticated
 * call to any of these comes back 401, and a 401 from a self-signed HTTPS host is easy to misread as a TLS
 * problem, so classifyStatus() below separates them by name.
 */
export function basicAuthHeader(user, pass) {
    if (!user && !pass) return null;
    const raw = String(user ?? "") + ":" + String(pass ?? "");
    // Buffer in node, btoa in a browser -- this module is imported by both the bridge and its gate.
    const b64 = (typeof Buffer !== "undefined")
        ? Buffer.from(raw, "utf8").toString("base64")
        : btoa(unescape(encodeURIComponent(raw)));
    return "Basic " + b64;
}

/**
 * Build one request. Returns { url, method, headers, body } -- a description, not a call.
 *
 * @param name    a key of ENDPOINTS
 * @param opts.host / opts.port
 * @param opts.user / opts.pass    basic auth
 * @param opts.csrf                the token from /api/csrf-token, required for mutating calls
 * @param opts.params              fills {index} and friends
 * @param opts.body                object, sent as JSON
 */
export function buildRequest(name, opts = {}) {
    const ep = ENDPOINTS[name];
    if (!ep) throw new Error("unknown Sunshine endpoint: " + name);
    const host = opts.host || "127.0.0.1";
    const port = opts.port || DEFAULT_PORT;

    let path = ep.path;
    const params = opts.params || {};
    // A placeholder left unfilled would produce a literal "{index}" in the URL and a 404 that looks like a
    // missing feature rather than a missing argument.
    const missing = [];
    path = path.replace(/\{(\w+)\}/g, (_, k) => {
        if (params[k] === undefined || params[k] === null) { missing.push(k); return "{" + k + "}"; }
        return encodeURIComponent(String(params[k]));
    });
    if (missing.length) throw new Error("endpoint " + name + " needs param(s): " + missing.join(", "));

    const headers = { "Accept": "application/json" };
    const auth = basicAuthHeader(opts.user, opts.pass);
    if (auth) headers["Authorization"] = auth;
    if (ep.mutates) {
        // *** A MUTATING CALL WITHOUT THE CSRF TOKEN IS REJECTED IN A WAY THAT READS AS AN AUTH FAILURE. ***
        // Refusing here, by name, is the difference between "you forgot the token" and an afternoon spent
        // re-checking a password that was right all along.
        if (!opts.csrf) throw new Error(name + " mutates state and needs a csrf token -- GET /api/csrf-token first");
        headers["X-CSRF-Token"] = opts.csrf;
    }
    let body;
    if (opts.body !== undefined) { headers["Content-Type"] = "application/json"; body = JSON.stringify(opts.body); }

    return { url: "https://" + host + ":" + port + path, method: ep.method, headers, body, mutates: ep.mutates };
}

/**
 * *** THE INDEX HAZARD, AND IT DELETES THE WRONG APP. ***
 *
 * DELETE /api/apps/{index} addresses an application BY ITS POSITION IN THE LIST. Positions are not identity:
 * read the list, have anything add or remove an app (the Sunshine UI in another tab, a config reload, another
 * client), and index 3 is now a different program. The delete succeeds, reports success, and removes
 * something the caller never named.
 *
 * So a delete is not allowed to travel on an index alone. The caller must hand back the LISTING the index came
 * from together with the name it believes is there, and this re-checks the pairing before the request is
 * built. It is a check the API itself cannot do, because by the time the request arrives the name is gone.
 *
 * @param listing   what GET /api/apps returned (its array of apps)
 * @param index     the position to delete
 * @param expectName the name the caller believes is at that position
 */
export function verifyAppIndex(listing, index, expectName) {
    const apps = Array.isArray(listing) ? listing : (listing && Array.isArray(listing.apps) ? listing.apps : null);
    if (!apps) return { ok: false, reason: "no app listing to check the index against" };
    if (!Number.isInteger(index) || index < 0 || index >= apps.length) {
        return { ok: false, reason: "index " + index + " is outside a listing of " + apps.length };
    }
    const at = apps[index] && (apps[index].name ?? apps[index]["name"]);
    if (at !== expectName) {
        return {
            ok: false,
            reason: "index " + index + " now holds " + JSON.stringify(at) + ", not " + JSON.stringify(expectName)
                  + " -- the list changed since it was read, and deleting by this index would remove the wrong app",
        };
    }
    return { ok: true, reason: "index " + index + " still holds " + JSON.stringify(expectName) };
}

/**
 * Classify an HTTP status into something a caller can act on.
 *
 * Separated by NAME rather than left as a number because the two most likely failures against a freshly
 * installed Sunshine -- no credentials, and a self-signed certificate -- produce completely different fixes
 * and are routinely confused for each other.
 */
export function classifyStatus(status) {
    if (status >= 200 && status < 300) return { ok: true, kind: "ok" };
    if (status === 401) return { ok: false, kind: "auth", reason: "401 -- Sunshine needs the admin username and password set in its own web UI" };
    if (status === 403) return { ok: false, kind: "csrf", reason: "403 -- usually a missing or stale CSRF token on a state-changing call, not a wrong password" };
    if (status === 404) return { ok: false, kind: "missing", reason: "404 -- this Sunshine build does not have that endpoint" };
    if (status >= 500) return { ok: false, kind: "server", reason: status + " -- Sunshine itself errored" };
    return { ok: false, kind: "http", reason: "HTTP " + status };
}

/**
 * Classify a THROWN network error. The self-signed certificate is the first thing anybody hits.
 *
 * *** Sunshine's web server uses a SELF-SIGNED certificate, so node's fetch rejects it outright. *** The fix
 * is to not verify for THIS host only. Turning verification off globally -- NODE_TLS_REJECT_UNAUTHORIZED=0,
 * which is what most snippets on the internet reach for -- disables it for every request the whole process
 * ever makes, including any that carry credentials somewhere else. This module never sets it; it names the
 * error so the caller can scope an agent to one host.
 */
export function classifyNetworkError(err) {
    const msg = String((err && (err.message || err.code)) || err || "");
    if (/DEPTH_ZERO_SELF_SIGNED_CERT|SELF_SIGNED_CERT_IN_CHAIN|self.signed/i.test(msg)) {
        return { ok: false, kind: "tls-selfsigned",
                 reason: "Sunshine's certificate is self-signed -- scope an https agent to THIS host; never set "
                       + "NODE_TLS_REJECT_UNAUTHORIZED=0, which disables verification for the whole process" };
    }
    if (/ECONNREFUSED/i.test(msg)) return { ok: false, kind: "down", reason: "nothing is listening -- Sunshine is not running" };
    if (/EHOSTUNREACH|ENETUNREACH|ETIMEDOUT|EAI_AGAIN|ENOTFOUND/i.test(msg)) {
        return { ok: false, kind: "unreachable", reason: "host unreachable: " + msg };
    }
    return { ok: false, kind: "network", reason: msg };
}

/** Pull the app list out of whatever shape GET /api/apps returned. */
export function appsOf(payload) {
    if (Array.isArray(payload)) return payload;
    if (payload && Array.isArray(payload.apps)) return payload.apps;
    return [];
}

/** Names only, for a picker. */
export function appNames(payload) { return appsOf(payload).map((a) => (a && a.name) || "").filter(Boolean); }

export default {
    DEFAULT_PORT, ENDPOINTS, NAMES, basicAuthHeader, buildRequest, verifyAppIndex,
    classifyStatus, classifyNetworkError, appsOf, appNames,
};
