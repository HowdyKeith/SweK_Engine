// ai-bridge/voiceboxBridge.js — v1547
// Use a LOCAL Voicebox (github.com/jamiepine/voicebox, MIT) as the engine's VOICE.
// Voicebox is a Tauri app with a Python FastAPI backend that serves a REST API.
//
// Verified contract (docs.voicebox.sh):
//   POST {base}/generate  body {profile_id, text, language, engine, instruct?}
//        -> generation record incl. { id, audio_path, ... }   (engine must match the
//           regex ^(qwen|qwen_custom_voice|luxtts|chatterbox|chatterbox_turbo|tada|kokoro)$)
//   GET  {base}/profiles   -> the voice profiles you created in the app (pick a profile_id)
//   GET  {base}/openapi.json -> always present on a FastAPI server (reachability probe)
//
// Default base is http://127.0.0.1:17493 (per the architecture docs) but CONFIGURABLE —
// some builds boot on a different port; set it in Settings -> Audio if the probe fails.
//
// We don't guess an audio-download endpoint: Voicebox writes the WAV to a local path
// (audio_path) and, for the local-voice use case, Voicebox runs on THIS machine, so we
// just copy that file into tts-out/ and hand back the same { ok, wav } shape ttsBridge uses.
// Config lives in ~/.voxelbridge/voicebox.json so it survives engine updates.

const fs = require("fs");
const os = require("os");
const path = require("path");

const CFG_DIR = path.join(os.homedir(), ".voxelbridge");
const CFG = path.join(CFG_DIR, "voicebox.json");
const DEF = { baseUrl: "http://127.0.0.1:17493", profileId: "", engine: "qwen", language: "en", instruct: "" };
const ENGINES = ["qwen", "qwen_custom_voice", "luxtts", "chatterbox", "chatterbox_turbo", "tada", "kokoro"];

function load() { try { return Object.assign({}, DEF, JSON.parse(fs.readFileSync(CFG, "utf8")) || {}); } catch { return Object.assign({}, DEF); } }
function save(o) { try { fs.mkdirSync(CFG_DIR, { recursive: true }); fs.writeFileSync(CFG, JSON.stringify(o, null, 2)); return true; } catch { return false; } }
function getConfig() { const c = load(); return { ok: true, config: c, engines: ENGINES }; }
function setConfig(p) {
    const c = load(); p = p || {};
    if (p.baseUrl != null) c.baseUrl = String(p.baseUrl).trim().replace(/\/+$/, "");
    if (p.profileId != null) c.profileId = String(p.profileId).trim();
    if (p.engine != null) c.engine = ENGINES.includes(String(p.engine)) ? String(p.engine) : c.engine;
    if (p.language != null) c.language = String(p.language).trim() || "en";
    if (p.instruct != null) c.instruct = String(p.instruct);
    save(c);
    return { ok: true, config: c };
}
function _base() { return (load().baseUrl || DEF.baseUrl).replace(/\/+$/, ""); }

async function _req(url, opts, ms) {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), ms || 8000);
    try {
        const r = await fetch(url, Object.assign({ signal: ac.signal }, opts || {}));
        const text = await r.text();
        let json = null; try { json = text ? JSON.parse(text) : null; } catch {}
        return { status: r.status, ok: r.ok, json, text };
    } finally { clearTimeout(t); }
}

async function status() {
    const c = load();
    try {
        const r = await _req(_base() + "/openapi.json", null, 6000);
        return { ok: true, reachable: !!r.ok, baseUrl: c.baseUrl, profileId: c.profileId, engine: c.engine,
                 title: (r.json && r.json.info && r.json.info.title) || "" };
    } catch (e) {
        return { ok: true, reachable: false, baseUrl: c.baseUrl, profileId: c.profileId, engine: c.engine, error: String((e && e.message) || e) };
    }
}

async function profiles() {
    try {
        const r = await _req(_base() + "/profiles", null, 8000);
        const list = Array.isArray(r.json) ? r.json : ((r.json && (r.json.profiles || r.json.items)) || []);
        return { ok: !!r.ok, profiles: list, raw: r.ok ? undefined : (r.text || "").slice(0, 200) };
    } catch (e) { return { ok: false, error: String((e && e.message) || e), profiles: [] }; }
}

// speakToWav(text, outDir, outUrl, override?) -> { ok, wav, engine, id } | { ok:false, error }
// Renders speech via Voicebox and copies the result into outDir (tts-out), so it slots straight
// into ttsBridge's contract. outDir/outUrl are passed by ttsBridge so there's one served folder.
async function speakToWav(text, outDir, outUrl, override) {
    const c = load(); const o = override || {};
    text = String(text || ""); if (!text.trim()) return { ok: false, error: "no text" };
    const body = {
        profile_id: (o.profileId != null ? o.profileId : c.profileId) || "",
        text,
        language: (o.language || c.language || "en"),
        engine: ENGINES.includes(o.engine) ? o.engine : (c.engine || "qwen"),
    };
    const ins = (o.instruct != null ? o.instruct : c.instruct); if (ins) body.instruct = ins;
    if (!body.profile_id) return { ok: false, error: "no Voicebox voice profile set \u2014 create one in the Voicebox app, then pick it in Settings \u2192 Audio" };

    let r;
    try { r = await _req(_base() + "/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }, 120000); }
    catch (e) { return { ok: false, error: "Voicebox unreachable at " + _base() + " (" + String((e && e.message) || e) + ") \u2014 is the app running?" }; }
    if (!r.ok || !r.json) return { ok: false, error: "Voicebox /generate failed: HTTP " + r.status + (r.text ? (" " + r.text.slice(0, 160)) : "") };

    const ap = r.json.audio_path || r.json.path || (r.json.generation && r.json.generation.audio_path);
    if (!ap) return { ok: false, error: "Voicebox returned no audio_path", id: r.json.id };
    try { fs.mkdirSync(outDir, { recursive: true }); } catch {}
    const ext = path.extname(ap) || ".wav";
    const name = "tts_" + Date.now() + ext;
    const abs = path.join(outDir, name);
    try { fs.copyFileSync(ap, abs); }
    catch (e) { return { ok: false, error: "couldn't read Voicebox audio at " + ap + " \u2014 is Voicebox on THIS machine? (" + String((e && e.message) || e) + ")", audio_path: ap }; }
    return { ok: true, wav: outUrl + "/" + name, engine: "voicebox", id: r.json.id };
}

module.exports = { getConfig, setConfig, status, profiles, speakToWav, ENGINES };
