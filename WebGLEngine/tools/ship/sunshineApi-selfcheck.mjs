#!/usr/bin/env node
// tools/ship/sunshineApi-selfcheck.mjs -- v4214
//
// Run: node tools/ship/sunshineApi-selfcheck.mjs      (no Sunshine, no network)
// Gated by tools/ship/selfchecks.mjs (auto-discovered).
//
// GATES ai-bridge/sunshineApi.mjs.
//
// *** MEASURED: ai-bridge/sunshineBridge.js HAD NEVER CALLED THE SUNSHINE API ONCE. *** All four of its
// references to port 47990 were string interpolation into a link. It installed Sunshine, started it, and said
// "here is a URL".
//
// The prompt was qiin2333/sunshine-control-panel, and the FIRST finding is a negative one worth keeping so
// nobody re-evaluates it: its Axum proxy is Tauri-IPC-only, not a headless service, and what it proxies to is
// 47990 -- the port this tree already reaches. There is nothing there to integrate with. What it DID prove is
// that the 47990 API is rich enough to drive a whole application, which is the thing worth doing.
//
// Three hazards get most of the assertions, because each produces a WRONG RESULT rather than an error:
//   1. DELETE /api/apps/{index} ADDRESSES BY POSITION. If the list moved between read and delete, the call
//      succeeds and removes an app the caller never named.
//   2. A mutating call with no CSRF token is refused in a way that READS AS AN AUTH FAILURE, sending the
//      reader off to re-check a password that was right.
//   3. Sunshine's certificate is SELF-SIGNED, and the usual fix for that (NODE_TLS_REJECT_UNAUTHORIZED=0)
//      disables verification for every request the process makes, forever, including ones carrying
//      credentials somewhere else entirely.
import {
    DEFAULT_PORT, ENDPOINTS, NAMES, basicAuthHeader, buildRequest, verifyAppIndex,
    classifyStatus, classifyNetworkError, appsOf, appNames,
} from "../../ai-bridge/sunshineApi.mjs";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
console.log("sunshineApi-selfcheck -- a real client for a port the bridge only ever linked to\n");

const AUTH = { host: "127.0.0.1", user: "admin", pass: "hunter2" };

// ---- 1. THE ENDPOINT TABLE ---------------------------------------------------------------------------------
console.log("1. the endpoint table, and the mutates flag that drives the CSRF rule");
{
    ok("the table is populated", NAMES.length >= 20, NAMES.length + " endpoints");
    ok("the port is Sunshine's config server", DEFAULT_PORT === 47990);
    let badPath = NAMES.filter((n) => !/^\/api\//.test(ENDPOINTS[n].path));
    ok("every path is under /api/", badPath.length === 0, badPath.join(","));
    let badMethod = NAMES.filter((n) => !["GET", "POST", "DELETE"].includes(ENDPOINTS[n].method));
    ok("every method is one Sunshine actually uses", badMethod.length === 0, badMethod.join(","));
    // The flag has to correlate with the method or it is decoration: a GET does not mutate.
    const getsThatMutate = NAMES.filter((n) => ENDPOINTS[n].method === "GET" && ENDPOINTS[n].mutates);
    ok("!! no GET is marked as mutating", getsThatMutate.length === 0, getsThatMutate.join(","));
    const writesThatDont = NAMES.filter((n) => ENDPOINTS[n].method !== "GET" && !ENDPOINTS[n].mutates);
    ok("!! and every POST/DELETE IS -- so the CSRF rule below cannot be skipped by mislabelling one",
        writesThatDont.length === 0, writesThatDont.join(","));
    ok("the csrf-token endpoint itself does NOT require a token, or nothing could ever start",
        ENDPOINTS.csrfToken.mutates === false);
}

// ---- 2. AUTH: THE THING THE BRIDGE NEVER SENT --------------------------------------------------------------
console.log("\n2. *** EVERY ENDPOINT NEEDS BASIC AUTH, AND THE BRIDGE HAS NEVER SENT ANY ***");
{
    ok("!! the header is real base64 of user:pass",
        basicAuthHeader("admin", "hunter2") === "Basic " + Buffer.from("admin:hunter2").toString("base64"),
        basicAuthHeader("admin", "hunter2"));
    ok("no credentials at all yields null rather than an empty Basic header, which would be a WRONG " +
       "credential rather than an absent one", basicAuthHeader("", "") === null && basicAuthHeader() === null);
    ok("a password containing a colon still round-trips (the colon separates USER from PASS, once)",
        Buffer.from(basicAuthHeader("admin", "a:b").slice(6), "base64").toString() === "admin:a:b");
    ok("non-ASCII in a password does not throw",
        typeof basicAuthHeader("admin", "pässwörd") === "string");

    const r = buildRequest("apps", AUTH);
    ok("!! a built request carries the Authorization header", !!r.headers.Authorization);
    ok("...and points at https on the right port", r.url === "https://127.0.0.1:47990/api/apps", r.url);
    ok("...with the right method", r.method === "GET");
    const anon = buildRequest("apps", { host: "127.0.0.1" });
    ok("a request with no credentials simply has no Authorization header -- it is buildable, and it will 401",
        !anon.headers.Authorization);
}

// ---- 3. CSRF: REFUSED BY NAME, BEFORE THE CALL -------------------------------------------------------------
console.log("\n3. *** A MUTATING CALL WITHOUT A CSRF TOKEN IS REJECTED IN A WAY THAT READS AS AN AUTH FAILURE ***");
{
    let threw = null;
    try { buildRequest("restart", AUTH); } catch (e) { threw = e; }
    ok("!! *** a mutating call with no token is refused HERE, by name, rather than sending a request that " +
       "comes back looking like a wrong password ***",
        !!threw && /csrf/i.test(threw.message), threw && threw.message);
    const withTok = buildRequest("restart", { ...AUTH, csrf: "tok123" });
    ok("with a token it builds, and carries it", withTok.headers["X-CSRF-Token"] === "tok123");
    ok("a read-only call needs no token", !!buildRequest("config", AUTH));
    ok("...and does not carry one even if handed one",
        buildRequest("config", { ...AUTH, csrf: "tok" }).headers["X-CSRF-Token"] === undefined);
    // Every mutating endpoint, not just the one that happened to be tested.
    const unguarded = NAMES.filter((n) => {
        if (!ENDPOINTS[n].mutates) return false;
        try { buildRequest(n, { ...AUTH, params: { index: 0 } }); return true; } catch { return false; }
    });
    ok("!! EVERY mutating endpoint refuses without a token, not merely the sampled one",
        unguarded.length === 0, "unguarded: " + unguarded.join(","));
}

// ---- 4. PATH PARAMETERS ------------------------------------------------------------------------------------
console.log("\n4. an unfilled placeholder must not become a literal in the URL");
{
    const r = buildRequest("cover", { ...AUTH, params: { index: 3 } });
    ok("a filled placeholder is substituted", r.url.endsWith("/api/covers/3"), r.url);
    let threw = null;
    try { buildRequest("cover", AUTH); } catch (e) { threw = e; }
    ok("!! *** a MISSING placeholder throws rather than requesting /api/covers/{index}, which would 404 and " +
       "read as a missing feature rather than a missing argument ***",
        !!threw && /needs param/.test(threw.message), threw && threw.message);
    const odd = buildRequest("cover", { ...AUTH, params: { index: "a b/c" } });
    ok("a parameter is URL-encoded, so it cannot escape its path segment",
        odd.url.endsWith("/api/covers/a%20b%2Fc"), odd.url);
    let unknown = null;
    try { buildRequest("nosuchthing", AUTH); } catch (e) { unknown = e; }
    ok("an unknown endpoint name throws instead of building a plausible wrong URL", !!unknown);
}

// ---- 5. *** THE INDEX HAZARD: THE ONE THAT DELETES THE WRONG APP *** ---------------------------------------
console.log("\n5. *** DELETE /api/apps/{index} ADDRESSES BY POSITION, AND POSITIONS ARE NOT IDENTITY ***");
{
    const before = { apps: [{ name: "Desktop" }, { name: "Steam" }, { name: "Firefox" }] };
    ok("an index that still holds what the caller expects is allowed",
        verifyAppIndex(before, 1, "Steam").ok === true);

    // Somebody removed an app in the Sunshine UI in another tab between the read and the delete.
    const after = { apps: [{ name: "Desktop" }, { name: "Firefox" }] };
    const v = verifyAppIndex(after, 1, "Steam");
    ok("!! *** the list moved, and index 1 now holds Firefox -- the delete is REFUSED rather than removing an "
       + "app the caller never named ***", v.ok === false && /Firefox/.test(v.reason), v.reason);
    ok("...and the reason says what is actually there, so the caller can re-read and retry", /now holds/.test(v.reason));

    ok("an index past the end is refused", verifyAppIndex(after, 9, "Steam").ok === false);
    ok("a negative index is refused", verifyAppIndex(after, -1, "Desktop").ok === false);
    ok("a non-integer index is refused", verifyAppIndex(after, 1.5, "Firefox").ok === false);
    ok("no listing at all is refused rather than assumed fine", verifyAppIndex(null, 0, "Desktop").ok === false);
    ok("a bare array listing works as well as {apps:[...]}", verifyAppIndex(before.apps, 0, "Desktop").ok === true);
    // The check must be able to FAIL on the same data it passes on, or it is not checking.
    ok("!! the same listing and index REFUSE a different expected name -- the check reads the name, not the "
       + "index alone", verifyAppIndex(before, 1, "Firefox").ok === false);
}

// ---- 6. TELLING THE TWO FIRST-CONTACT FAILURES APART -------------------------------------------------------
console.log("\n6. *** THE TWO FAILURES A FRESH SUNSHINE ACTUALLY GIVES, AND THEY ARE ROUTINELY CONFUSED ***");
{
    ok("2xx is ok", classifyStatus(200).ok && classifyStatus(204).ok);
    ok("!! 401 is named as MISSING CREDENTIALS, with the fix", classifyStatus(401).kind === "auth"
        && /username and password/.test(classifyStatus(401).reason));
    ok("!! *** 403 is named as a CSRF problem and explicitly NOT a wrong password -- these are the two that "
       + "get confused, and they have completely different fixes ***",
        classifyStatus(403).kind === "csrf" && /not a wrong password/.test(classifyStatus(403).reason));
    ok("404 is a build without that endpoint, not a network problem", classifyStatus(404).kind === "missing");
    ok("5xx is Sunshine's own error", classifyStatus(500).kind === "server" && classifyStatus(503).kind === "server");
    ok("anything else is reported as itself rather than guessed at", classifyStatus(418).kind === "http");

    const tls = classifyNetworkError(new Error("unable to verify the first certificate: DEPTH_ZERO_SELF_SIGNED_CERT"));
    ok("!! *** a self-signed certificate is named, because it is the FIRST thing anybody hits ***",
        tls.kind === "tls-selfsigned");
    ok("!! ...and the reason warns against NODE_TLS_REJECT_UNAUTHORIZED=0 BY NAME -- the usual fix disables "
       + "verification for every request the process ever makes, including ones carrying other credentials",
        /NODE_TLS_REJECT_UNAUTHORIZED=0/.test(tls.reason));
    ok("a refused connection is 'Sunshine is not running', not a TLS problem",
        classifyNetworkError(new Error("connect ECONNREFUSED 127.0.0.1:47990")).kind === "down");
    ok("an unreachable host is its own answer",
        classifyNetworkError({ code: "EHOSTUNREACH" }).kind === "unreachable");
    ok("an unrecognised error is passed through rather than mislabelled",
        classifyNetworkError(new Error("something new")).kind === "network");
}

// ---- 7. RESPONSE SHAPES ------------------------------------------------------------------------------------
console.log("\n7. reading the app list, whichever shape it arrives in");
{
    ok("an {apps:[...]} payload", appsOf({ apps: [{ name: "A" }] }).length === 1);
    ok("a bare array payload", appsOf([{ name: "A" }, { name: "B" }]).length === 2);
    ok("junk yields an empty list rather than throwing", appsOf(null).length === 0 && appsOf(42).length === 0);
    ok("names are extracted and blanks dropped",
        appNames({ apps: [{ name: "A" }, {}, { name: "B" }] }).join(",") === "A,B");
}

// ---- 8. THIS MODULE MUST NOT BE THE THING THAT DISABLES TLS ------------------------------------------------
console.log("\n8. the module does not do the dangerous thing it warns about");
{
    const src = fs.readFileSync(path.join(ROOT, "ai-bridge", "sunshineApi.mjs"), "utf8");
    // An ABSENCE is a code shape, and the warning above QUOTES the variable it warns against -- so this must
    // read code with strings and comments stripped, or it goes red against its own prose. v4208's lesson.
    const codeOnly = src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1 ")
                        .replace(/"(?:[^"\\]|\\.)*"/g, '""').replace(/'(?:[^'\\]|\\.)*'/g, "''");
    ok("!! *** the module never SETS NODE_TLS_REJECT_UNAUTHORIZED -- it names the hazard and leaves the "
       + "scoping to the caller (this reads codeOnly, because the warning quotes the variable) ***",
        !/NODE_TLS_REJECT_UNAUTHORIZED/.test(codeOnly));
    ok("...and never sets rejectUnauthorized either", !/rejectUnauthorized/.test(codeOnly));
    ok("!! and it performs no request at all -- no fetch, no http.request; it describes them",
        !/\bfetch\s*\(/.test(codeOnly) && !/https?\.request/.test(codeOnly));
}

console.log("\nsunshineApi-selfcheck: " + (fails ? fails + " FAILED" : "all checks pass"));
process.exit(fails ? 1 : 0);
