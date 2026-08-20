// eveBridge.js — v1247
// Live EVE Online pilot telemetry via the official ESI API + SSO (OAuth2).
// Unlike the Fallout/Starfield/X4 connectors (local game ports), EVE is a cloud API:
//   1) Register an app at https://developers.eveonline.com  -> Client ID + Secret,
//      callback URL  http://localhost:8787/eve/callback , scopes:
//        esi-location.read_location.v1, esi-location.read_ship_type.v1,
//        esi-location.read_online.v1, esi-wallet.read_character_wallet.v1
//   2) Put the Client ID/Secret in eve.json (or POST /eve/config), then hit /eve/login
//      ONCE in a browser to authorise. We store the long-lived refresh token and mint
//      access tokens as needed.
// ESI gives pilot/ship/system/online/wallet on ~5s caches. It does NOT expose live
// shield/armor/hull — this is a pilot dashboard, not a combat HUD. Disabled by default.

const fs   = require("fs");
const path = require("path");

const SSO_AUTH  = "https://login.eveonline.com/v2/oauth/authorize";
const SSO_TOKEN = "https://login.eveonline.com/v2/oauth/token";
const ESI       = "https://esi.evetech.net/latest";
const DEFAULT_SCOPES = [
    "esi-location.read_location.v1",
    "esi-location.read_ship_type.v1",
    "esi-location.read_online.v1",
    "esi-wallet.read_character_wallet.v1",
];

const CFG_PATH = path.join(__dirname, "eve.json");
let cfg = {
    enabled: false,
    clientId: "",
    clientSecret: "",
    callbackUrl: "http://localhost:8787/eve/callback",
    scopes: DEFAULT_SCOPES.slice(),
    characterId: null,
    characterName: null,
    refreshToken: null,
    pollMs: 6000,
};
try { if (fs.existsSync(CFG_PATH)) cfg = Object.assign(cfg, JSON.parse(fs.readFileSync(CFG_PATH, "utf8"))); } catch {}
function saveCfg() { try { fs.writeFileSync(CFG_PATH, JSON.stringify(cfg, null, 2)); } catch {} }

let accessToken = null, accessExp = 0;
let state = null, lastUpdate = 0, lastError = null, polling = false, timer = null;
let pendingState = null;   // OAuth CSRF state token
const nameCache = new Map();   // "system:30000142" -> "Jita"
let log = () => {};
function setLogger(fn) { if (typeof fn === "function") log = fn; }

const b64 = s => Buffer.from(s, "utf8").toString("base64");
function decodeJwtSub(jwt) {
    try { const p = JSON.parse(Buffer.from(jwt.split(".")[1], "base64").toString("utf8")); return p.sub || null; }
    catch { return null; }
}

// ---- OAuth2 ---------------------------------------------------------------
function authUrl() {
    pendingState = Math.random().toString(36).slice(2) + Date.now().toString(36);
    const q = new URLSearchParams({
        response_type: "code",
        redirect_uri: cfg.callbackUrl,
        client_id: cfg.clientId,
        scope: (cfg.scopes || DEFAULT_SCOPES).join(" "),
        state: pendingState,
    });
    return SSO_AUTH + "?" + q.toString();
}

async function tokenRequest(params) {
    const r = await fetch(SSO_TOKEN, {
        method: "POST",
        headers: {
            "Authorization": "Basic " + b64(cfg.clientId + ":" + cfg.clientSecret),
            "Content-Type": "application/x-www-form-urlencoded",
            "Host": "login.eveonline.com",
        },
        body: new URLSearchParams(params).toString(),
    });
    const j = await r.json();
    if (!r.ok) throw new Error("token " + r.status + ": " + (j.error_description || j.error || JSON.stringify(j)));
    return j;
}

async function handleCallback(code, stateTok) {
    if (pendingState && stateTok && stateTok !== pendingState) throw new Error("state mismatch");
    const j = await tokenRequest({ grant_type: "authorization_code", code });
    accessToken = j.access_token; accessExp = Date.now() + (j.expires_in || 1200) * 1000 - 30000;
    if (j.refresh_token) cfg.refreshToken = j.refresh_token;
    const sub = decodeJwtSub(j.access_token);            // "CHARACTER:EVE:12345"
    const m = sub && sub.match(/(\d+)\s*$/);
    if (m) cfg.characterId = parseInt(m[1], 10);
    try { if (cfg.characterId) { const ci = await esiPublic("/characters/" + cfg.characterId + "/"); cfg.characterName = ci && ci.name || null; } } catch {}
    cfg.enabled = true; saveCfg();
    log("authorised character", cfg.characterId, cfg.characterName);
    pollOnce();
    return { ok: true, characterId: cfg.characterId, characterName: cfg.characterName };
}

async function ensureToken() {
    if (accessToken && Date.now() < accessExp) return accessToken;
    if (!cfg.refreshToken) throw new Error("not authorised — open /eve/login");
    const j = await tokenRequest({ grant_type: "refresh_token", refresh_token: cfg.refreshToken });
    accessToken = j.access_token; accessExp = Date.now() + (j.expires_in || 1200) * 1000 - 30000;
    if (j.refresh_token && j.refresh_token !== cfg.refreshToken) { cfg.refreshToken = j.refresh_token; saveCfg(); }
    return accessToken;
}

// ---- ESI ------------------------------------------------------------------
async function esiAuth(p) {
    const tok = await ensureToken();
    const r = await fetch(ESI + p, { headers: { "Authorization": "Bearer " + tok, "Accept": "application/json" } });
    if (!r.ok) throw new Error("esi " + p + " " + r.status);
    return r.json();
}
async function esiPublic(p) {
    const r = await fetch(ESI + p, { headers: { "Accept": "application/json" } });
    if (!r.ok) throw new Error("esi " + p + " " + r.status);
    return r.json();
}
async function resolveName(kind, id) {
    if (id == null) return null;
    const key = kind + ":" + id;
    if (nameCache.has(key)) return nameCache.get(key);
    try {
        const path = kind === "system" ? "/universe/systems/" + id + "/" : "/universe/types/" + id + "/";
        const j = await esiPublic(path);
        const name = j && j.name || null; if (name) nameCache.set(key, name); return name;
    } catch { return null; }
}

async function pollOnce() {
    if (polling || !cfg.enabled || !cfg.refreshToken || !cfg.characterId) return; polling = true;
    try {
        const id = cfg.characterId;
        const [loc, ship, online, wallet] = await Promise.all([
            esiAuth("/characters/" + id + "/location/").catch(() => null),
            esiAuth("/characters/" + id + "/ship/").catch(() => null),
            esiAuth("/characters/" + id + "/online/").catch(() => null),
            esiAuth("/characters/" + id + "/wallet/").catch(() => null),
        ]);
        const systemName = loc ? await resolveName("system", loc.solar_system_id) : null;
        const shipTypeName = ship ? await resolveName("type", ship.ship_type_id) : null;
        state = {
            character: cfg.characterName, characterId: id,
            online: online ? !!online.online : null,
            system: systemName, systemId: loc ? loc.solar_system_id : null,
            ship: ship ? (ship.ship_name || shipTypeName) : null,
            shipType: shipTypeName, shipTypeId: ship ? ship.ship_type_id : null,
            isk: (typeof wallet === "number") ? wallet : null,
        };
        lastUpdate = Date.now(); lastError = null;
    } catch (e) { lastError = String(e && e.message || e); }
    finally { polling = false; }
}

function start(opts) {
    if (opts && typeof opts.log === "function") setLogger(opts.log);
    if (timer) clearInterval(timer);
    timer = setInterval(() => { if (cfg.enabled) pollOnce(); }, Math.max(5000, cfg.pollMs || 6000));
    if (cfg.enabled) pollOnce();
}
function stop() { if (timer) { clearInterval(timer); timer = null; } }

function fresh() { return lastUpdate > 0 && (Date.now() - lastUpdate) < 30000; }
function getState() {
    const ready = !!state && fresh();
    return { connected: ready, ready, authorised: !!cfg.refreshToken, at: Date.now(),
             ageMs: lastUpdate ? Date.now() - lastUpdate : null, error: lastError, data: ready ? state : null };
}
function status() {
    return { enabled: cfg.enabled, authorised: !!cfg.refreshToken, configured: !!(cfg.clientId && cfg.clientSecret),
             characterId: cfg.characterId, characterName: cfg.characterName, connected: fresh(),
             lastUpdate, ageMs: lastUpdate ? Date.now() - lastUpdate : null, error: lastError, callbackUrl: cfg.callbackUrl };
}
async function detect() { return { ok: true, running: fresh(), authorised: !!cfg.refreshToken, ageMs: lastUpdate ? Date.now() - lastUpdate : null }; }
function getConfig() { const c = JSON.parse(JSON.stringify(cfg)); c.clientSecret = c.clientSecret ? "***" : ""; c.refreshToken = c.refreshToken ? "***" : null; return c; }
function setConfig(next) {
    if (next && typeof next === "object") {
        if (typeof next.enabled === "boolean") cfg.enabled = next.enabled;
        if (typeof next.clientId === "string") cfg.clientId = next.clientId.trim();
        if (typeof next.clientSecret === "string" && next.clientSecret && next.clientSecret !== "***") cfg.clientSecret = next.clientSecret.trim();
        if (typeof next.callbackUrl === "string" && next.callbackUrl.trim()) cfg.callbackUrl = next.callbackUrl.trim();
        if (Array.isArray(next.scopes) && next.scopes.length) cfg.scopes = next.scopes;
        if (Number.isFinite(next.pollMs)) cfg.pollMs = Math.max(5000, next.pollMs | 0);
        if (next.logout === true) { cfg.refreshToken = null; cfg.characterId = null; cfg.characterName = null; accessToken = null; state = null; lastUpdate = 0; }
    }
    saveCfg();
    if (cfg.enabled) pollOnce();
    return getConfig();
}

module.exports = { start, stop, getState, status, getConfig, setConfig, detect, authUrl, handleCallback, setLogger };
