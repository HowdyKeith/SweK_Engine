// ai-bridge/ttsBridge.js — v1026
// Local text-to-speech for the bridge + browser clients. Two engines:
//   "sapi"  → Windows SAPI via say.vbs (zero install; speak aloud or render WAV)
//   "piper" → rhasspy/piper neural TTS (cross-platform; better quality; needs the
//             piper binary + a voice model .onnx). Always renders a WAV.
// Rendered WAVs go to WebGLEngine/tts-out (served by the bridge) so browser
// clients can fetch + play them. Config in ~/.voxelbridge/tts.json.

const { spawn } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const VBS = process.env.TTS_VBS || path.join(__dirname, "say.vbs");
const OUT_DIR = process.env.TTS_OUT || path.join(__dirname, "..", "tts-out");   // under WebGLEngine -> served at /tts-out/
const OUT_URL = "/tts-out";
const CFG = process.env.TTS_CONFIG || path.join(os.homedir(), ".voxelbridge", "tts.json");

function loadCfg() { try { if (fs.existsSync(CFG)) return JSON.parse(fs.readFileSync(CFG, "utf8")); } catch {} return { engine: "sapi", piperBin: "piper", piperModel: "", rate: 0, voice: "" }; }
function setConfig(d) {
    d = d || {}; const c = loadCfg();
    if (d.engine) c.engine = (["piper", "voicebox", "sapi", "say"].includes(d.engine)) ? d.engine : "sapi";
    for (const k of ["piperBin", "piperModel", "voice"]) if (d[k] != null) c[k] = String(d[k]);
    if (d.rate != null && d.rate !== "") c.rate = parseInt(d.rate, 10) || 0;
    try { fs.mkdirSync(path.dirname(CFG), { recursive: true }); fs.writeFileSync(CFG, JSON.stringify(c, null, 2), { mode: 0o600 }); } catch {}
    return status();
}
function status() { const c = loadCfg(); return { ok: true, engine: c.engine || "sapi", piperBin: c.piperBin || "piper", piperModel: c.piperModel || "", rate: c.rate || 0, voice: c.voice || "" }; }

function spawnP(cmd, args, opts, stdin) {
    return new Promise((resolve) => {
        let out = "", err = "", child, done = false;
        const t = setTimeout(() => { if (done) return; done = true; try { child && child.kill("SIGKILL"); } catch {} resolve({ code: -2, out, err: "timeout" }); }, (opts && opts.timeout) || 60000);
        try { child = spawn(cmd, args, { windowsHide: true }); }
        catch (e) { clearTimeout(t); return resolve({ code: -1, out: "", err: cmd + " spawn: " + e.message }); }
        if (stdin != null) { try { child.stdin.write(stdin); child.stdin.end(); } catch {} }
        child.stdout.on("data", d => out += d);
        child.stderr.on("data", d => err += d);
        child.on("error", e => { if (done) return; done = true; clearTimeout(t); resolve({ code: -1, out, err: cmd + ": " + e.message }); });
        child.on("close", code => { if (done) return; done = true; clearTimeout(t); resolve({ code, out: (out || "").trim(), err: (err || "").trim() }); });
    });
}

function freshWav() { try { fs.mkdirSync(OUT_DIR, { recursive: true }); } catch {} const n = "tts_" + Date.now() + ".wav"; return { abs: path.join(OUT_DIR, n), url: OUT_URL + "/" + n }; }

async function sapiSpeak(text, rate, voice, wav) {
    const tmp = path.join(os.tmpdir(), "tts_" + Date.now() + ".txt");
    try { fs.writeFileSync(tmp, text, { encoding: "utf8" }); } catch (e) { return { ok: false, error: "temp write: " + e.message }; }
    let w = null; if (wav) w = freshWav();
    const args = [VBS, tmp, w ? w.abs : "", (rate != null && rate !== "") ? String(rate) : "", voice || ""];
    const r = await spawnP("cscript", ["//NoLogo", "//B", ...args]);
    try { fs.unlinkSync(tmp); } catch {}
    if (r.code !== 0) return { ok: false, error: (r.err || "tts exit " + r.code + " (Windows/SAPI only)").slice(0, 300) };
    return w ? { ok: true, wav: w.url, engine: "sapi" } : { ok: true, spoke: true, engine: "sapi" };
}

async function piperSpeak(text, cfg) {
    if (!cfg.piperModel) return { ok: false, error: "piper needs a voice model — tts.config({piperModel:'/path/voice.onnx'})" };
    const w = freshWav();
    const r = await spawnP(cfg.piperBin || "piper", ["--model", cfg.piperModel, "--output_file", w.abs], { timeout: 60000 }, text);
    if (r.code !== 0) return { ok: false, error: (r.err || "piper exit " + r.code + " (is piper installed + model path right?)").slice(0, 300) };
    return { ok: true, wav: w.url, engine: "piper" };
}

// v1888 — native macOS TTS via the built-in `say` command (no install, high-quality voices).
// `say` speaks aloud directly, or renders to a file. We ask for WAVE PCM so the rendered file
// works with the existing HA media_player + browser-avatar paths unchanged (say defaults to AIFF).
async function saySpeak(text, rate, voice, wav) {
    if (process.platform !== "darwin") return { ok: false, error: "the 'say' engine is macOS only" };
    const base = [];
    if (voice) base.push("-v", voice);
    if (rate != null && rate !== "" && !isNaN(parseInt(rate, 10))) {
        // map our SAPI-style rate (-10..10) to say's words-per-minute (~175 default).
        const wpm = Math.max(90, Math.min(360, 175 + parseInt(rate, 10) * 15));
        base.push("-r", String(wpm));
    }
    if (wav) {
        const w = freshWav();
        // WAVE container, 16-bit LE PCM @ 22.05kHz — a normal .wav the rest of the stack can play.
        const r = await spawnP("say", [...base, "-o", w.abs, "--file-format=WAVE", "--data-format=LEI16@22050", text], { timeout: 60000 });
        if (r.code !== 0) return { ok: false, error: (r.err || "say exit " + r.code + " (macOS only)").slice(0, 300) };
        return { ok: true, wav: w.url, engine: "say" };
    }
    const r = await spawnP("say", [...base, text], { timeout: 60000 });
    if (r.code !== 0) return { ok: false, error: (r.err || "say exit " + r.code + " (macOS only)").slice(0, 300) };
    return { ok: true, spoke: true, engine: "say" };
}

// speak({text, rate, voice, wav, engine}) -> {ok, wav?|spoke}
async function speak(d) {
    d = d || {}; const text = String(d.text || ""); if (!text.trim()) return { ok: false, error: "no text" };
    const cfg = loadCfg();
    const engine = d.engine || cfg.engine || "sapi";
    if (engine === "voicebox") {
        // v1547 — render through the local Voicebox app; it writes into tts-out so the rest of the
        // engine (avatar lines, console, alerts) plays it like any other TTS, with no rewiring.
        try { return await require("./voiceboxBridge.js").speakToWav(text, OUT_DIR, OUT_URL, { engine: d.vbEngine, profileId: d.profileId, instruct: d.instruct, language: d.language }); }
        catch (e) { return { ok: false, error: "voicebox: " + ((e && e.message) || e) }; }
    }
    if (engine === "piper") return piperSpeak(text, cfg);
    if (engine === "say") return saySpeak(text, d.rate != null ? d.rate : cfg.rate, d.voice || cfg.voice, !!d.wav);
    // v1888 — on macOS, if the config still says "sapi" (the Windows default) fall through to `say`
    // so the Mac speaks with zero setup instead of failing with a Windows-only error.
    if (engine === "sapi" && process.platform === "darwin") return saySpeak(text, d.rate != null ? d.rate : cfg.rate, d.voice || cfg.voice, !!d.wav);
    return sapiSpeak(text, d.rate != null ? d.rate : cfg.rate, d.voice || cfg.voice, !!d.wav);   // piper is wav-only; sapi can speak aloud or wav
}

async function listVoices() {
    const cfg = loadCfg();
    if ((cfg.engine || "sapi") === "piper") return { ok: true, engine: "piper", voices: cfg.piperModel ? [path.basename(cfg.piperModel)] : [], note: "Piper voice = the configured .onnx model." };
    if ((cfg.engine === "say") || (process.platform === "darwin" && (cfg.engine || "sapi") === "sapi")) {
        // macOS: `say -v ?` lists installed voices, e.g. "Samantha  en_US  # Hello". Take the name (first token).
        const r = await spawnP("say", ["-v", "?"], { timeout: 15000 });
        if (r.code !== 0) return { ok: false, error: (r.err || "say -v ? failed (macOS only)").slice(0, 200) };
        const voices = (r.out || "").split(/\r?\n/).map(s => (s.trim().match(/^(.+?)\s{2,}/) || [])[1]).filter(Boolean);
        return { ok: true, engine: "say", voices };
    }
    const r = await spawnP("cscript", ["//NoLogo", "//B", VBS, "@voices"], { timeout: 15000 });
    if (r.code !== 0) return { ok: false, error: (r.err || "no SAPI / Windows only").slice(0, 200) };
    return { ok: true, engine: "sapi", voices: r.out.split(/\r?\n/).map(s => s.trim()).filter(Boolean) };
}

async function detect() {
    const c = loadCfg(); const isMac = process.platform === "darwin";
    const out = { ok: true, engine: c.engine || (isMac ? "say" : "sapi"), sapi: process.platform === "win32", say: isMac, piper: false };
    if (c.piperBin) { const r = await spawnP(c.piperBin, ["--version"], { timeout: 8000 }); out.piper = (r.code === 0) || /piper/i.test((r.out || "") + (r.err || "")); }
    return out;
}

module.exports = { speak, listVoices, setConfig, status, detect };
