// humanizerBridge.js — v1551
// Front-end for blader/humanizer (https://github.com/blader/humanizer, Claude Code skill):
// it's a pure SKILL.md (instructions, no binary/API) that removes signs of AI-generated
// writing. So the engine front-end (a) installs the skill (git clone -> the agent skills dir,
// so coding agents get it too) and (b) makes it a REAL feature: it reads the skill's guidance
// and runs the de-AI rewrite through the engine's own Ollama LLM (llmHost). The route passes
// the Ollama base in; no cross-module dependency.
"use strict";
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");

const CFG = path.join(os.homedir(), ".voxelbridge", "humanizer.json");
const DEFAULT_DIR = path.join(os.homedir(), ".claude", "skills", "humanizer");
const REPO = "https://github.com/blader/humanizer.git";
function load() { try { if (fs.existsSync(CFG)) return JSON.parse(fs.readFileSync(CFG, "utf8")); } catch {} return {}; }
function save(o) { try { fs.mkdirSync(path.dirname(CFG), { recursive: true }); fs.writeFileSync(CFG, JSON.stringify(o)); return true; } catch { return false; } }
function getConfig() { const c = load(); return { ok: true, skillDir: c.skillDir || DEFAULT_DIR, model: c.model || "" }; }
function setConfig(d) { const c = load(); if (d && typeof d.skillDir === "string") c.skillDir = String(d.skillDir).trim(); if (d && typeof d.model === "string") c.model = String(d.model).trim(); save(c); return getConfig(); }
function _dir() { return load().skillDir || DEFAULT_DIR; }
function _skillFile() { const d = _dir(); for (const n of ["SKILL.md", "skill.md", "SKILL_PROFESSIONAL.md"]) { const p = path.join(d, n); if (fs.existsSync(p)) return p; } return ""; }

const FALLBACK_GUIDE = [
    "You remove signs of AI-generated writing, making text sound natural and human.",
    "Avoid: em-dash overuse, 'It's not just X, it's Y' framing, 'In today's fast-paced world', 'delve', 'tapestry',",
    "'testament to', 'navigating the landscape', 'underscores', empty summarising conclusions, uniform sentence",
    "length, tidy rule-of-three lists, and over-hedged corporate tone.",
    "Vary sentence length (burstiness). Cut filler. Keep concrete nouns and the original meaning and facts.",
].join(" ");

// install: clone the skill into the agent skills dir (serves coding agents AND this bridge).
function install() {
    return new Promise((resolve) => {
        const dir = _dir();
        const exists = fs.existsSync(path.join(dir, ".git"));
        let child, buf = "", done = false;
        const args = exists ? ["-C", dir, "pull", "--ff-only"] : ["clone", "--depth", "1", REPO, dir];
        if (!exists) { try { fs.mkdirSync(path.dirname(dir), { recursive: true }); } catch {} }
        const t = setTimeout(() => { if (!done) { done = true; try { child && child.kill(); } catch {} resolve({ ok: false, error: "git timed out" }); } }, 120000);
        try { child = spawn("git", args, { windowsHide: true }); }
        catch (e) { clearTimeout(t); return resolve({ ok: false, error: "git not found (" + (e && e.message) + ")" }); }
        child.stdout.on("data", d => buf += d); child.stderr.on("data", d => buf += d);
        child.on("error", e => { if (done) return; done = true; clearTimeout(t); resolve({ ok: false, error: "git not found (" + (e && e.message) + ")" }); });
        child.on("close", code => { if (done) return; done = true; clearTimeout(t); const ok = (code === 0) && !!_skillFile(); resolve({ ok, code, skillDir: dir, skill: _skillFile() ? path.basename(_skillFile()) : null, log: String(buf).slice(-400) }); });
    });
}

async function _resolveModel(ollamaBase, model) {
    if (model) return model;
    const c = load(); if (c.model) return c.model;
    if (process.env.OLLAMA_MODEL) return process.env.OLLAMA_MODEL;
    try {
        const r = await fetch(ollamaBase + "/api/tags", { signal: AbortSignal.timeout(2500) });
        const j = await r.json();
        return (j && j.models && j.models[0] && j.models[0].name) || null;
    } catch { return null; }
}

async function status(ollamaBase) {
    const dir = _dir();
    const sf = _skillFile();
    let llm = { base: ollamaBase || "", reachable: false, model: null };
    if (ollamaBase) {
        try { const r = await fetch(ollamaBase + "/api/tags", { signal: AbortSignal.timeout(2000) }); const j = await r.json(); llm.reachable = !!(j && j.models); llm.model = (j && j.models && j.models[0] && j.models[0].name) || null; } catch {}
    }
    return { ok: true, installed: !!sf, skillDir: dir, skill: sf ? path.basename(sf) : null, llm };
}

// humanize: rewrite AI-sounding text into natural human text via the engine's Ollama LLM,
// guided by the installed skill (or a built-in fallback guide if the skill isn't cloned yet).
async function humanize(o) {
    o = o || {};
    const text = String(o.text || "").trim();
    if (!text) return { ok: false, error: "no text to humanize" };
    const ollamaBase = String(o.ollamaBase || "http://localhost:11434").replace(/\/+$/, "");
    const model = await _resolveModel(ollamaBase, o.model);
    if (!model) return { ok: false, error: "no LLM model available — start Ollama (set the LLM host in Network settings) and pull a model", need: "ollama" };

    let guide = FALLBACK_GUIDE;
    const sf = _skillFile();
    if (sf) { try { guide = fs.readFileSync(sf, "utf8").slice(0, 6000); } catch {} }

    const voice = String(o.voiceSample || "").trim();
    const tone = String(o.tone || "").trim();
    const prompt =
        guide + "\n\n" +
        (voice ? ("Here is a sample of the user's own writing — match its rhythm, word choices, and quirks:\n" + voice.slice(0, 1500) + "\n\n") : "") +
        (tone ? ("Desired tone: " + tone + ".\n") : "") +
        "Rewrite the text below to remove signs of AI-generated writing while preserving its meaning and facts. Output ONLY the rewritten text — no preamble, no notes.\n\nTEXT:\n" + text;

    const num_predict = Math.max(256, Math.min(2048, Math.round(text.length / 3) + 256));
    try {
        const r = await fetch(ollamaBase + "/api/generate", {
            method: "POST", headers: { "Content-Type": "application/json" }, signal: AbortSignal.timeout(120000),
            body: JSON.stringify({ model, prompt, stream: false, options: { temperature: 0.7, num_predict } }),
        });
        if (!r.ok) return { ok: false, error: "LLM HTTP " + r.status };
        const j = await r.json();
        const outText = String(j && j.response || "").trim();
        if (!outText) return { ok: false, error: "LLM returned empty" };
        return { ok: true, humanized: outText, model, usedSkill: !!sf };
    } catch (e) { return { ok: false, error: "LLM call failed: " + ((e && e.message) || e) }; }
}

module.exports = { getConfig, setConfig, install, status, humanize };
