// flowHooksBridge.js — v1134
// Outbound "flow hooks": fire engine events to Power Automate (or any) webhook URLs.
//
// The integration target is Power Automate's "When an HTTP request is received"
// trigger, which hands you a POST URL. You paste that URL here, pick which engine
// events should fire it, and the engine POSTs a JSON envelope outbound whenever the
// event happens. No inbound exposure is required — the engine only makes outbound
// calls — so this works behind the access gate / a firewall with nothing opened.
//
// (That trigger is a Power Automate PREMIUM feature, and the URL is a secret, so the
// config file is written mode 600. A hook can target Teams/Planner/SharePoint/
// Dataverse/Outlook or anything else once it lands in the flow.)
//
// Envelope POSTed:  { event, ts, source:"SweKEngine", data:{...} }

const fs = require("fs");
const os = require("os");
const path = require("path");

const CFG = path.join(os.homedir(), ".voxelbridge", "flowhooks.json");
const EVENTS = ["petfbi.assembled", "petfbi.emailed", "report.posted", "rule.matched"];

function load() { try { if (fs.existsSync(CFG)) return JSON.parse(fs.readFileSync(CFG, "utf8")); } catch {} return { hooks: [] }; }
function save(o) { try { fs.mkdirSync(path.dirname(CFG), { recursive: true }); fs.writeFileSync(CFG, JSON.stringify(o), { mode: 0o600 }); return true; } catch (e) { console.warn("[flowhooks] save failed:", e.message); return false; } }

function list() {
    const c = load();
    return { ok: true, events: EVENTS, hooks: (c.hooks || []).map(h => ({ id: h.id, url: h.url || "", events: h.events || [], enabled: h.enabled !== false })) };
}

function saveHook(h) {
    h = h || {};
    const c = load(); c.hooks = c.hooks || [];
    const events = Array.isArray(h.events) ? h.events.filter(e => EVENTS.includes(e)) : [];
    if (h.id) {
        const i = c.hooks.findIndex(x => x.id === h.id);
        if (i >= 0) { c.hooks[i] = { id: h.id, url: String(h.url || "").trim(), events, enabled: h.enabled !== false }; save(c); return { ok: true, id: h.id }; }
    }
    if (!String(h.url || "").trim()) return { ok: false, error: "a webhook URL is required" };
    const id = "fh_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    c.hooks.push({ id, url: String(h.url).trim(), events, enabled: h.enabled !== false });
    save(c); return { ok: true, id };
}

function removeHook(id) { const c = load(); c.hooks = (c.hooks || []).filter(h => h.id !== id); save(c); return { ok: true }; }

async function _post(url, body) {
    const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(15000) });
    return r;
}

// Fire an event to every enabled hook subscribed to it. Fire-and-forget: never throws,
// never blocks the caller's own result.
async function fire(event, data) {
    if (!EVENTS.includes(event)) return { ok: false, error: "unknown event" };
    const c = load();
    const hooks = (c.hooks || []).filter(h => h.enabled !== false && h.url && (h.events || []).includes(event));
    if (!hooks.length) return { ok: true, fired: 0 };
    const envelope = { event, ts: Date.now(), source: "SweKEngine", data: data || {} };
    const results = [];
    await Promise.all(hooks.map(async h => {
        try { const r = await _post(h.url, envelope); results.push({ id: h.id, status: r.status }); }
        catch (e) { results.push({ id: h.id, error: String(e.message || e) }); }
    }));
    return { ok: true, fired: results.length, results };
}

async function test(id) {
    const c = load(); const h = (c.hooks || []).find(x => x.id === id);
    if (!h) return { ok: false, error: "hook not found" };
    if (!h.url) return { ok: false, error: "hook has no URL" };
    try { const r = await _post(h.url, { event: "test", ts: Date.now(), source: "SweKEngine", data: { message: "Test ping from SweK Engine flow hooks" } }); return { ok: r.ok, status: r.status }; }
    catch (e) { return { ok: false, error: String(e.message || e) }; }
}

module.exports = { EVENTS, list, saveHook, removeHook, fire, test };
