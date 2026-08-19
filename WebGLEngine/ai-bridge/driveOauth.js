// FILE: ai-bridge/driveOauth.js
// VERSION: v1 - OAuth installed-app (desktop) token source for Drive auto-pull.
//
// OOB (manual copy/paste) is fully deprecated; loopback redirect (http://127.0.0.1:<port>) is the supported DESKTOP flow,
// hardened with PKCE. One-time consent yields a refresh token; thereafter refreshAccessToken() mints short-lived access
// tokens from the stored refresh token + client id/secret. The resulting token feeds the SAME driveSync.checkOnce - only
// the token source differs from the service-account path.
//
// Verified against Google docs: auth endpoint accounts.google.com/o/oauth2/v2/auth with access_type=offline & prompt=consent
// (to receive a refresh token) and code_challenge/_method=S256 (PKCE); token endpoint oauth2.googleapis.com/token with
// grant_type=authorization_code (exchange) and grant_type=refresh_token (refresh).
//
// Pure pieces (verifier/challenge/url/parse) are unit-tested; the network + interactive consent are rig-only.

const crypto = require("crypto");
const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SCOPE = "https://www.googleapis.com/auth/drive.readonly https://www.googleapis.com/auth/youtube.upload";   // youtube.upload added so one consent also allows video upload

function _b64url(buf) { return Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); }

// PURE: PKCE code_verifier (43 chars from 32 random bytes, all unreserved) + S256 challenge.
function genVerifier() { return _b64url(crypto.randomBytes(32)); }
function challenge(verifier) { return _b64url(crypto.createHash("sha256").update(String(verifier)).digest()); }

// PURE: build the consent URL.
function buildAuthUrl(o) {
    const p = new URLSearchParams({
        client_id: o.clientId, redirect_uri: o.redirectUri, response_type: "code",
        scope: o.scope || SCOPE, access_type: "offline", prompt: "consent",
        code_challenge: o.codeChallenge, code_challenge_method: "S256", state: o.state || "",
    });
    return AUTH_URL + "?" + p.toString();
}

// PURE: pull { code, state, error } from a redirect URL or "/path?query".
function parseCode(reqUrl) {
    let q; try { q = new URL(reqUrl, "http://127.0.0.1").searchParams; } catch (e) { q = new URLSearchParams(); }
    return { code: q.get("code") || "", state: q.get("state") || "", error: q.get("error") || "" };
}

// RIG (network): exchange the auth code for tokens (PKCE). Returns { access_token, refresh_token, expires_in, ... }.
async function exchangeCode(o, fetchImpl) {
    const f = fetchImpl || fetch;
    const body = new URLSearchParams({ code: o.code, redirect_uri: o.redirectUri, client_id: o.clientId, client_secret: o.clientSecret, code_verifier: o.codeVerifier, grant_type: "authorization_code" });
    const r = await f(TOKEN_URL, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: body.toString() });
    let j = {}; try { j = await r.json(); } catch (e) {}
    if (!r.ok || !j.access_token) throw new Error("code exchange failed: " + (j.error_description || j.error || ("HTTP " + r.status)));
    return j;
}

// RIG (network): mint a fresh access token from the stored refresh token.
async function refreshAccessToken(o, fetchImpl) {
    const f = fetchImpl || fetch;
    const body = new URLSearchParams({ client_id: o.clientId, client_secret: o.clientSecret, refresh_token: o.refreshToken, grant_type: "refresh_token" });
    const r = await f(TOKEN_URL, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: body.toString() });
    let j = {}; try { j = await r.json(); } catch (e) {}
    if (!r.ok || !j.access_token) throw new Error("token refresh failed: " + (j.error_description || j.error || ("HTTP " + r.status)));
    return j.access_token;
}

// RIG (interactive): one-time loopback consent. Opens a browser to the consent URL, catches the redirect on a loopback
// port, exchanges the code (PKCE), resolves with the tokens (incl. refresh_token). Thin - reuses the pure helpers.
function runConsent(o, opts) {
    opts = opts || {};
    const http = require("http");
    return new Promise((resolve, reject) => {
        const verifier = genVerifier(), state = _b64url(crypto.randomBytes(16));
        let done = false, captured = false, closeTimer = null;
        const finish = (fn) => { if (done) return; done = true; if (closeTimer) clearTimeout(closeTimer); try { server.close(); } catch (e) {} fn(); };
        const server = http.createServer(async (req, res) => {
            const { code, state: st, error } = parseCode(req.url);
            // v1864 — ignore favicon / probe / duplicate hits (Chrome fires extras). Only the request that
            // carries the auth code (or an error) matters; everything else gets a friendly 200 so the port
            // never "refuses". We do NOT close the server on the first hit anymore — a short linger after
            // capture lets Chrome's follow-up requests land instead of hitting a closed port.
            if (!code && !error) { res.writeHead(200, { "Content-Type": "text/html" }); res.end("<html><body style='font-family:sans-serif;padding:2rem'><h3>SweK Drive</h3><p>Waiting for Google\u2026 you can close this tab.</p></body></html>"); return; }
            if (captured) { res.writeHead(200, { "Content-Type": "text/html" }); res.end("<html><body style='font-family:sans-serif;padding:2rem'><h3>SweK Drive</h3><p>Already received \u2014 you can close this tab.</p></body></html>"); return; }
            captured = true;
            res.writeHead(200, { "Content-Type": "text/html" });
            res.end("<html><body style='font-family:sans-serif;padding:2rem'><h3>SweK Drive authorization " + (error ? "failed" : "complete") + "</h3><p>You can close this tab and return to SweK.</p></body></html>");
            // linger ~1.5s so any duplicate browser request still gets a response, THEN exchange + close.
            const port = server.address() ? server.address().port : opts.port;
            if (error) { closeTimer = setTimeout(() => finish(() => reject(new Error("consent error: " + error))), 300); return; }
            if (st !== state) { closeTimer = setTimeout(() => finish(() => reject(new Error("state mismatch (possible CSRF) - aborted"))), 300); return; }
            try {
                const tok = await exchangeCode({ code, redirectUri: "http://127.0.0.1:" + port, clientId: o.clientId, clientSecret: o.clientSecret, codeVerifier: verifier }, opts.fetchImpl);
                closeTimer = setTimeout(() => finish(() => resolve(tok)), 1200);
            } catch (e) { closeTimer = setTimeout(() => finish(() => reject(e)), 300); }
        });
        server.on("error", (e) => { if (!done) { done = true; reject(e); } });
        // bind to all loopback (Google may hit 127.0.0.1 or localhost); "127.0.0.1" host is the safe default.
        server.listen(opts.port || 0, "127.0.0.1", () => {
            const port = server.address().port;
            const url = buildAuthUrl({ clientId: o.clientId, redirectUri: "http://127.0.0.1:" + port, scope: o.scope || SCOPE, codeChallenge: challenge(verifier), state });
            if (opts.onUrl) opts.onUrl(url); else console.log("\nOpen this URL to authorize SweK to read your Drive updates folder:\n\n" + url + "\n");
            // v1864 — open the browser safely. On Windows, `start "" "<url>"` (with the empty title arg and
            // quotes) prevents cmd from splitting the URL at its & characters; rundll32 is an even safer
            // fallback that never touches the shell. Best-effort — the UI also shows a clickable link.
            try {
                const { spawn } = require("child_process");
                if (process.platform === "win32") {
                    try { spawn("rundll32", ["url.dll,FileProtocolHandler", url], { detached: true, stdio: "ignore" }).unref(); }
                    catch { spawn("cmd", ["/c", "start", "", url], { windowsHide: true, detached: true, stdio: "ignore" }).unref(); }
                } else {
                    const cmd = process.platform === "darwin" ? "open" : "xdg-open";
                    spawn(cmd, [url], { detached: true, stdio: "ignore" }).unref();
                }
            } catch (e) {}
        });
        if (opts.timeoutMs) setTimeout(() => { if (!done && !captured) { finish(() => reject(new Error("consent timed out"))); } }, opts.timeoutMs);
    });
}

module.exports = { genVerifier, challenge, buildAuthUrl, parseCode, exchangeCode, refreshAccessToken, runConsent, SCOPE, AUTH_URL, TOKEN_URL };
