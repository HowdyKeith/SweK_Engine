// FILE: ai-bridge/driveSync.js
// VERSION: v1 - pull incremental updates from a Google Drive folder using a SERVICE ACCOUNT (2LO, no user consent).
//
// Flow (verified against Google docs):
//   1. Sign a JWT with the service-account private key (RS256): {iss:client_email, scope, aud:token-url, iat, exp}.
//   2. Exchange it at https://oauth2.googleapis.com/token (grant_type=jwt-bearer) for a short-lived Bearer access token.
//   3. Drive v3 files.list  q="'<folderId>' in parents and name contains '.swekupdate.json' and trashed=false".
//   4. Download the newest with files.get ?alt=media, JSON.parse it, and hand it to the engine's incremental-update
//      pipeline (which version-gates, validates, and rolls back on failure). Scope is drive.READONLY - we only pull.
//
// Setup (rig): create a service account in a GCP project, download its JSON key, SHARE your updates folder with the
// service account's client_email, then point ai-bridge/drive.json at { keyFile, folderId, pollMs, enabled }.
//
// The network functions take an injectable fetch + are split from the pure JWT/selection logic so the orchestration can
// be unit-tested without touching the network. The live Drive calls are rig-only (sandbox can't reach googleapis.com).

const crypto = require("crypto");

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const DRIVE_FILES = "https://www.googleapis.com/drive/v3/files";
const SCOPE = "https://www.googleapis.com/auth/drive.readonly";

function _b64url(buf) { return Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); }

// PURE: build + sign the service-account JWT assertion (RS256). saKey is the parsed SA JSON ({ client_email, private_key }).
function buildJwt(saKey, scope, nowSec, lifetimeSec) {
    if (!saKey || !saKey.client_email || !saKey.private_key) throw new Error("invalid service-account key (need client_email + private_key)");
    const now = nowSec || Math.floor(Date.now() / 1000);
    const exp = now + (lifetimeSec || 3600);
    const header = { alg: "RS256", typ: "JWT" };
    const claims = { iss: saKey.client_email, scope: scope || SCOPE, aud: TOKEN_URL, iat: now, exp };
    const input = _b64url(JSON.stringify(header)) + "." + _b64url(JSON.stringify(claims));
    const signer = crypto.createSign("RSA-SHA256"); signer.update(input); signer.end();
    return input + "." + _b64url(signer.sign(saKey.private_key));
}

// PURE: the files.list query for *.swekupdate.json in a folder.
function listQuery(folderId) { return "'" + String(folderId) + "' in parents and name contains '.swekupdate.json' and trashed = false"; }

// PURE: newest file by modifiedTime (RFC3339 sorts lexically), or null.
function pickNewest(files) {
    if (!Array.isArray(files) || !files.length) return null;
    return files.slice().sort((a, b) => String(b.modifiedTime || "").localeCompare(String(a.modifiedTime || "")))[0];
}

// RIG (network): exchange the signed JWT for a Bearer access token.
async function getAccessToken(saKey, scope, fetchImpl) {
    const f = fetchImpl || fetch;
    const jwt = buildJwt(saKey, scope || SCOPE);
    const body = "grant_type=" + encodeURIComponent("urn:ietf:params:oauth:grant-type:jwt-bearer") + "&assertion=" + encodeURIComponent(jwt);
    const r = await f(TOKEN_URL, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body });
    let j = {}; try { j = await r.json(); } catch (e) {}
    if (!r.ok || !j.access_token) throw new Error("token exchange failed: " + (j.error_description || j.error || ("HTTP " + r.status)));
    return j.access_token;
}

// RIG (network): list *.swekupdate.json in the folder, newest first.
async function listUpdates(token, folderId, fetchImpl) {
    const f = fetchImpl || fetch;
    const u = DRIVE_FILES + "?q=" + encodeURIComponent(listQuery(folderId)) +
        "&fields=" + encodeURIComponent("files(id,name,modifiedTime,size)") +
        "&orderBy=" + encodeURIComponent("modifiedTime desc") +
        "&pageSize=20&supportsAllDrives=true&includeItemsFromAllDrives=true";
    const r = await f(u, { headers: { Authorization: "Bearer " + token } });
    let j = {}; try { j = await r.json(); } catch (e) {}
    if (!r.ok) throw new Error("list failed: " + ((j.error && j.error.message) || ("HTTP " + r.status)));
    return j.files || [];
}

// RIG (network): download a file's bytes (alt=media) as text.
async function downloadText(token, fileId, fetchImpl) {
    const f = fetchImpl || fetch;
    const r = await f(DRIVE_FILES + "/" + encodeURIComponent(fileId) + "?alt=media&supportsAllDrives=true", { headers: { Authorization: "Bearer " + token } });
    if (!r.ok) throw new Error("download failed: HTTP " + r.status);
    return await r.text();
}

// v1885 — dataset transfer primitives (binary), for shipping the competition data via Drive.
// list ANY files in a folder (not just *.swekupdate.json), newest first, with size.
async function listFolder(token, folderId, fetchImpl) {
    const f = fetchImpl || fetch;
    const q = "'" + String(folderId) + "' in parents and trashed = false";
    const u = DRIVE_FILES + "?q=" + encodeURIComponent(q) +
        "&fields=" + encodeURIComponent("files(id,name,size,modifiedTime,mimeType)") +
        "&orderBy=modifiedTime desc&pageSize=1000&supportsAllDrives=true&includeItemsFromAllDrives=true";
    const r = await f(u, { headers: { Authorization: "Bearer " + token } });
    const j = await r.json();
    if (!r.ok) throw new Error("list failed: " + ((j.error && j.error.message) || ("HTTP " + r.status)));
    return j.files || [];
}

// download a file's bytes as a Buffer (for tar/zip payloads).
async function downloadBytes(token, fileId, fetchImpl) {
    const f = fetchImpl || fetch;
    const r = await f(DRIVE_FILES + "/" + encodeURIComponent(fileId) + "?alt=media&supportsAllDrives=true", { headers: { Authorization: "Bearer " + token } });
    if (!r.ok) throw new Error("download failed: HTTP " + r.status);
    const ab = await r.arrayBuffer();
    return Buffer.from(ab);
}

// upload a Buffer as a new file in a folder (multipart). Returns { id, name }.
// Uses WRITE_SCOPE (drive.file) — the app can only touch files it created.
async function uploadBytes(token, folderId, name, buf, mimeType, fetchImpl) {
    const f = fetchImpl || fetch;
    const boundary = "swek" + Date.now().toString(36) + Math.random().toString(36).slice(2);
    const meta = JSON.stringify({ name: String(name), parents: [String(folderId)] });
    const head = Buffer.from(
        "--" + boundary + "\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n" + meta +
        "\r\n--" + boundary + "\r\nContent-Type: " + (mimeType || "application/octet-stream") + "\r\n\r\n", "utf8");
    const tail = Buffer.from("\r\n--" + boundary + "--\r\n", "utf8");
    const body = Buffer.concat([head, buf, tail]);
    const r = await f("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true", {
        method: "POST",
        headers: { Authorization: "Bearer " + token, "Content-Type": "multipart/related; boundary=" + boundary, "Content-Length": String(body.length) },
        body,
    });
    const j = await r.json();
    if (!r.ok) throw new Error("upload failed: " + ((j.error && j.error.message) || ("HTTP " + r.status)));
    return { id: j.id, name: j.name };
}

// ORCHESTRATION (testable via injected deps): run one check cycle.
//   deps = { saKey, folderId, applyPackage(pkgObj)->result, lastFileId?, lastApplied?,
//            getToken?, list?, download? }   // the network fns default to the real ones above
async function checkOnce(deps) {
    deps = deps || {};
    if (!deps.folderId || (!deps.saKey && !deps.getToken)) return { ok: false, reason: "drive not configured" };
    const getToken = deps.getToken || ((k) => getAccessToken(k, SCOPE));
    const list = deps.list || ((t, fid) => listUpdates(t, fid));
    const download = deps.download || ((t, id) => downloadText(t, id));
    let token; try { token = await getToken(deps.saKey); } catch (e) { return { ok: false, reason: "auth: " + (e && e.message) }; }
    let files; try { files = await list(token, deps.folderId); } catch (e) { return { ok: false, reason: "list: " + (e && e.message) }; }
    const newest = pickNewest(files);
    if (!newest) return { ok: true, found: false };
    if (deps.lastFileId && newest.id === deps.lastFileId && deps.lastApplied) return { ok: true, found: true, fileId: newest.id, name: newest.name, skipped: "already applied" };
    let text; try { text = await download(token, newest.id); } catch (e) { return { ok: false, reason: "download: " + (e && e.message), fileId: newest.id }; }
    let pkg; try { pkg = JSON.parse(text); } catch (e) { return { ok: false, reason: "bad package JSON: " + (e && e.message), fileId: newest.id }; }
    let result; try { result = await deps.applyPackage(pkg); } catch (e) { return { ok: false, reason: "apply: " + (e && e.message), fileId: newest.id }; }
    return { ok: !!(result && result.ok), found: true, fileId: newest.id, name: newest.name, result };
}

module.exports = { buildJwt, listQuery, pickNewest, getAccessToken, listUpdates, downloadText, checkOnce, createFolder, verifyFolder, listFolder, downloadBytes, uploadBytes, SCOPE, TOKEN_URL, DRIVE_FILES };

// v1814 — create a folder on Drive and return its ID. Requires a WRITE scope
// (drive.file — narrow: only files THIS app creates). The default auto-update
// flow uses drive.readonly, so this only succeeds if the service-account key has
// been granted write access; otherwise Google returns 403 and we surface it.
const WRITE_SCOPE = "https://www.googleapis.com/auth/drive.file";
async function createFolder(deps, name, parentId, fetchImpl) {
    const f = fetchImpl || fetch;
    if (!name) return { ok: false, error: "folder name required" };
    // get a write-scoped token
    let token;
    try {
        if (deps.getToken) token = await deps.getToken(WRITE_SCOPE);          // oauth path passes a scope-aware getter
        else if (deps.saKey) token = await getAccessToken(deps.saKey, WRITE_SCOPE, f);
        else return { ok: false, error: "no service-account key or oauth configured" };
    } catch (e) {
        return { ok: false, error: "auth: " + (e && e.message || e) + " (the key may lack a write scope)" };
    }
    const meta = { name: String(name), mimeType: "application/vnd.google-apps.folder" };
    if (parentId) meta.parents = [String(parentId)];
    try {
        const r = await f(DRIVE_FILES + "?fields=id,name", {
            method: "POST",
            headers: { "Authorization": "Bearer " + token, "Content-Type": "application/json" },
            body: JSON.stringify(meta),
        });
        let j = {}; try { j = await r.json(); } catch (e) {}
        if (!r.ok || !j.id) {
            const msg = (j.error && (j.error.message || j.error.status)) || ("HTTP " + r.status);
            return { ok: false, error: msg + (r.status === 403 ? " (the credential is read-only — grant a write scope to create folders)" : "") };
        }
        return { ok: true, id: j.id, name: j.name };
    } catch (e) {
        return { ok: false, error: String(e && e.message || e) };
    }
}

// v1814 — verify a folder still exists + is reachable with the current creds.
// Uses the read scope (works with the default readonly setup). 404 => deleted.
async function verifyFolder(deps, folderId, fetchImpl) {
    const f = fetchImpl || fetch;
    if (!folderId) return { ok: false, error: "no folderId" };
    let token;
    try {
        if (deps.getToken) token = await deps.getToken(SCOPE);
        else if (deps.saKey) token = await getAccessToken(deps.saKey, SCOPE, f);
        else return { ok: false, error: "drive not configured" };
    } catch (e) { return { ok: false, error: "auth: " + (e && e.message || e) }; }
    try {
        const r = await f(DRIVE_FILES + "/" + encodeURIComponent(folderId) + "?fields=id,name,mimeType", {
            headers: { "Authorization": "Bearer " + token },
        });
        if (r.status === 404) return { ok: false, exists: false, error: "folder not found (deleted?)" };
        let j = {}; try { j = await r.json(); } catch (e) {}
        if (!r.ok || !j.id) return { ok: false, error: (j.error && j.error.message) || ("HTTP " + r.status) };
        return { ok: true, exists: true, id: j.id, name: j.name, isFolder: j.mimeType === "application/vnd.google-apps.folder" };
    } catch (e) { return { ok: false, error: String(e && e.message || e) }; }
}

// v1885 — augment exports now that WRITE_SCOPE (drive.file) is declared above.
module.exports.WRITE_SCOPE = WRITE_SCOPE;
