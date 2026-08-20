// FILE: ai-bridge/uiTarsBridge.js
// v967 — UI-TARS integration. UI-TARS (ByteDance, Apache-2.0) is a vision-only
// GUI agent: give it a screenshot + an instruction and it returns a GUI action
// (Thought + Action: click(...) / type(...) / scroll / hotkey / finished(...)).
// It runs on its OWN device — recommended 7B via vLLM (OpenAI-compatible API at
// http://<device>:8000/v1) or an Ollama GGUF (http://<device>:11434). This
// bridge just proxies the engine's requests to that endpoint and normalizes the
// two dialects, so the rig never has to load the model itself.
//
// Config: ~/.voxelbridge/uitars.json { mode:"vllm"|"ollama", endpoint, model, system }.
//   vllm   → POST {endpoint}/chat/completions   detect GET {endpoint}/models
//   ollama → POST {endpoint}/api/chat            detect GET {endpoint}/api/tags
// No model is run here; this is a thin, owner-gated proxy (sits behind the v961
// auth gate like the other action bridges).

const fs = require("fs");
const path = require("path");
const os = require("os");
const { spawn } = require("child_process");
const WIN = process.platform === "win32";

const CFG_PATH = process.env.UITARS_CONFIG || path.join(os.homedir(), ".voxelbridge", "uitars.json");

// The standard UI-TARS action-space system prompt (compact). Overridable via
// config.system. Tells the model to answer with Thought + a single Action.
const DEFAULT_SYSTEM =
  "You are a GUI agent. You are given a screenshot and a task. Output your reasoning " +
  "in a single line starting with 'Thought:' followed by one line starting with 'Action:'. " +
  "The Action must be exactly one of: click(start_box='(x,y)'), left_double(start_box='(x,y)'), " +
  "right_single(start_box='(x,y)'), drag(start_box='(x1,y1)', end_box='(x2,y2)'), " +
  "type(content='...'), scroll(start_box='(x,y)', direction='up|down|left|right'), " +
  "hotkey(key='...'), wait(), finished(content='...'). Coordinates are pixels on the screenshot.";

const DEFAULTS = { mode: "vllm", endpoint: "http://localhost:8000/v1", model: "ByteDance-Seed/UI-TARS-1.5-7B", system: "", executeEnabled: false };

function loadCfg() {
    try { if (fs.existsSync(CFG_PATH)) return Object.assign({}, DEFAULTS, JSON.parse(fs.readFileSync(CFG_PATH, "utf8"))); } catch {}
    return Object.assign({}, DEFAULTS);
}
function saveCfg(obj) {
    try { fs.mkdirSync(path.dirname(CFG_PATH), { recursive: true }); fs.writeFileSync(CFG_PATH, JSON.stringify(obj, null, 2), { mode: 0o600 }); return true; }
    catch (e) { console.warn("[uitars] config save failed:", e.message); return false; }
}
function _endpoint(c) { return String(c.endpoint || DEFAULTS.endpoint).replace(/\/+$/, ""); }
function _sys(c) { return (c.system && c.system.trim()) ? c.system : DEFAULT_SYSTEM; }
// data:image/png;base64,XXXX  ->  bare base64 (Ollama) ; keep full data-url (vLLM)
function _bareB64(s) { const m = /^data:[^;]+;base64,(.*)$/.exec(s || ""); return m ? m[1] : (s || ""); }
function _dataUrl(s) { return /^data:/.test(s || "") ? s : ("data:image/png;base64," + (s || "")); }

async function _timedFetch(url, opts, ms) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), ms || 60000);
    try { return await fetch(url, Object.assign({ signal: ctrl.signal }, opts || {})); }
    finally { clearTimeout(t); }
}

// Reachability + model list.
async function status() {
    const c = loadCfg();
    const ep = _endpoint(c);
    const url = c.mode === "ollama" ? ep + "/api/tags" : ep + "/models";
    try {
        const r = await _timedFetch(url, { method: "GET" }, 6000);
        if (!r.ok) return { ok: true, reachable: false, mode: c.mode, endpoint: ep, model: c.model, status: r.status };
        const j = await r.json().catch(() => ({}));
        const models = c.mode === "ollama"
            ? (j.models || []).map(m => m.name || m.model).filter(Boolean)
            : (j.data || []).map(m => m.id).filter(Boolean);
        return { ok: true, reachable: true, mode: c.mode, endpoint: ep, model: c.model, models };
    } catch (e) {
        return { ok: true, reachable: false, mode: c.mode, endpoint: ep, model: c.model, error: (e && e.message) || String(e) };
    }
}

function config(patch) {
    const c = loadCfg();
    if (patch && typeof patch === "object") {
        if (patch.mode != null)     c.mode = String(patch.mode) === "ollama" ? "ollama" : "vllm";
        if (patch.endpoint != null) c.endpoint = String(patch.endpoint);
        if (patch.model != null)    c.model = String(patch.model);
        if (patch.system != null)   c.system = String(patch.system);
        if (patch.executeEnabled != null) c.executeEnabled = !!patch.executeEnabled;
    }
    saveCfg(c);
    return { ok: true, config: c };
}

// v974 — "run it on THIS PC first" helpers. UI-TARS is normally a remote box,
// but you can try it locally via Ollama before dedicating hardware. detectLocal
// pings the local Ollama and looks for a UI-TARS GGUF; useLocal flips the config
// to point at it. NOTE: a 7B vision model competes with the engine + ComfyUI for
// the 8GB Pascal VRAM — fine for a look, slow under contention.
const LOCAL_OLLAMA = "http://localhost:11434";
const SUGGESTED_MODEL = "hf.co/mradermacher/UI-TARS-1.5-7B-GGUF:Q4_K_M";
const SUGGESTED_PULL = "ollama pull " + SUGGESTED_MODEL;
async function detectLocal() {
    try {
        const r = await _timedFetch(LOCAL_OLLAMA + "/api/tags", { method: "GET" }, 5000);
        if (!r.ok) return { ok: true, ollamaUp: false, status: r.status, hint: "Ollama not responding on :11434 — start it, then " + SUGGESTED_PULL };
        const j = await r.json().catch(() => ({}));
        const models = (j.models || []).map(m => m.name || m.model).filter(Boolean);
        const uiTars = models.filter(m => /ui-?tars/i.test(m));
        return {
            ok: true, ollamaUp: true, models, uiTarsModels: uiTars,
            hasUiTars: uiTars.length > 0,
            suggestedModel: uiTars[0] || SUGGESTED_MODEL,
            suggestedPull: uiTars.length ? null : SUGGESTED_PULL,
            hint: uiTars.length ? "found — call uiTars.useLocal() then uiTars.status()" : ("no UI-TARS model yet — run: " + SUGGESTED_PULL),
        };
    } catch (e) {
        return { ok: true, ollamaUp: false, error: (e && e.message) || String(e), hint: "Ollama unreachable on :11434 — start Ollama, then " + SUGGESTED_PULL };
    }
}
function useLocal(model) {
    return config({ mode: "ollama", endpoint: LOCAL_OLLAMA, model: model || SUGGESTED_MODEL });
}

// v977 — DRIVER executor. UI-TARS only *emits* actions; this performs them on
// the Windows desktop (mouse move/click, keystrokes). DOUBLE-GATED for safety:
// it is a NO-OP dry-run unless config.executeEnabled is true (set deliberately
// on the rig via uiTars.config({executeEnabled:true})). The client must ALSO
// choose to call this. Until both are true, nothing touches the desktop.
// Windows-only (SetCursorPos + mouse_event + SendKeys via PowerShell). Untested
// in CI — verify on the rig; start with the visualize/dry-run loop first.
function _psEscapeSendKeys(s) {
    // SendKeys treats + ^ % ~ ( ) { } [ ] specially — wrap each in braces.
    return String(s || "").replace(/[+^%~(){}\[\]]/g, ch => "{" + ch + "}");
}
function _psSingleQuote(s) { return "'" + String(s || "").replace(/'/g, "''") + "'"; }
function _buildPs(a) {
    const head = "Add-Type -AssemblyName System.Windows.Forms; " +
        "Add-Type -Namespace W -Name M -MemberDefinition '[DllImport(\"user32.dll\")]public static extern bool SetCursorPos(int x,int y);[DllImport(\"user32.dll\")]public static extern void mouse_event(uint f,uint x,uint y,uint d,int e);'; ";
    const move = (x, y) => `[W.M]::SetCursorPos(${x|0},${y|0}); Start-Sleep -Milliseconds 60; `;
    const LMB_DOWN = "0x02", LMB_UP = "0x04", RMB_DOWN = "0x08", RMB_UP = "0x10", WHEEL = "0x0800";
    switch (a && a.kind) {
        case "click":
            return head + move(a.x, a.y) + `[W.M]::mouse_event(${LMB_DOWN},0,0,0,0); [W.M]::mouse_event(${LMB_UP},0,0,0,0);`;
        case "left_double":
            return head + move(a.x, a.y) + `1..2 | % { [W.M]::mouse_event(${LMB_DOWN},0,0,0,0); [W.M]::mouse_event(${LMB_UP},0,0,0,0); Start-Sleep -Milliseconds 80 };`;
        case "right_single":
            return head + move(a.x, a.y) + `[W.M]::mouse_event(${RMB_DOWN},0,0,0,0); [W.M]::mouse_event(${RMB_UP},0,0,0,0);`;
        case "type":
            return head + `[System.Windows.Forms.SendKeys]::SendWait(${_psSingleQuote(_psEscapeSendKeys(a.content))});`;
        case "hotkey": {
            const map = { enter: "{ENTER}", tab: "{TAB}", esc: "{ESC}", escape: "{ESC}", space: " ", backspace: "{BACKSPACE}", del: "{DEL}", "ctrl+a": "^a", "ctrl+v": "^v", "ctrl+c": "^c" };
            const k = map[String(a.key || "").toLowerCase()] || String(a.key || "");
            return head + `[System.Windows.Forms.SendKeys]::SendWait(${_psSingleQuote(k)});`;
        }
        case "scroll": {
            const amt = /up/i.test(a.direction) ? 240 : -240;
            return head + move(a.x, a.y) + `[W.M]::mouse_event(${WHEEL},0,0,[uint32]${amt},0);`;
        }
        default: return null;   // wait / finished / unknown → nothing to do
    }
}
async function execute(action) {
    const c = loadCfg();
    if (!c.executeEnabled) {
        return { ok: true, executed: false, dryRun: true, action, reason: "execution disabled — uiTars.config({executeEnabled:true}) on the rig to arm" };
    }
    if (!WIN) return { ok: false, error: "desktop execution is Windows-only (PowerShell input)" };
    if (!action || /^(wait|finished|unknown)$/.test(action.kind || "")) return { ok: true, executed: false, noop: true, action };
    const ps = _buildPs(action);
    if (!ps) return { ok: true, executed: false, noop: true, action };
    return new Promise(resolve => {
        let err = "", done = false;
        const finish = r => { if (!done) { done = true; clearTimeout(t); resolve(r); } };
        const t = setTimeout(() => finish({ ok: false, executed: false, error: "timeout", action }), 8000);
        let ch;
        try { ch = spawn("powershell", ["-NoProfile", "-NonInteractive", "-Command", ps], { windowsHide: true }); }
        catch (e) { return finish({ ok: false, error: "spawn failed: " + e.message }); }
        ch.stderr.on("data", d => { err += d; });
        ch.on("error", e => finish({ ok: false, error: (err || "") + " " + e.message }));
        ch.on("close", code => finish({ ok: code === 0, executed: code === 0, code, action, error: code === 0 ? undefined : (err.slice(0, 200) || "exit " + code) }));
    });
}

// screenshot: base64 png (with or without data: prefix). instruction: task text.
async function act({ screenshot, instruction } = {}) {
    const c = loadCfg();
    const ep = _endpoint(c);
    if (!instruction) return { ok: false, error: "no instruction" };
    if (!screenshot)  return { ok: false, error: "no screenshot" };
    try {
        let url, body;
        if (c.mode === "ollama") {
            url = ep + "/api/chat";
            body = {
                model: c.model, stream: false, options: { temperature: 0 },
                messages: [
                    { role: "system", content: _sys(c) },
                    { role: "user", content: instruction, images: [_bareB64(screenshot)] },
                ],
            };
        } else {
            url = ep + "/chat/completions";
            body = {
                model: c.model, max_tokens: 512, temperature: 0,
                messages: [
                    { role: "system", content: _sys(c) },
                    { role: "user", content: [
                        { type: "image_url", image_url: { url: _dataUrl(screenshot) } },
                        { type: "text", text: instruction },
                    ] },
                ],
            };
        }
        const r = await _timedFetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }, 120000);
        const j = await r.json().catch(() => ({}));
        if (!r.ok) return { ok: false, error: "UI-TARS " + r.status, raw: j };
        const text = c.mode === "ollama" ? (j.message && j.message.content) : (j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content);
        return { ok: true, action: (text || "").trim(), raw: j };
    } catch (e) {
        return { ok: false, error: (e && e.message) || String(e) };
    }
}

module.exports = { status, config, act, loadCfg, detectLocal, useLocal, execute };
