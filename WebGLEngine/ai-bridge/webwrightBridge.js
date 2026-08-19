// ai-bridge/webwrightBridge.js — v953
// Webwright (Microsoft's terminal-native web-agent framework) as the scraper-
// AUTHORING layer, plus a SKILLS LIBRARY that stores and runs the re-runnable
// Playwright scrapers it produces.
//
// Webwright shares the Camoufox venv (its deps are just httpx/pydantic/
// playwright/typer, and it drives Playwright Firefox — i.e. Camoufox). Its
// durable output is a final_script.py; you save that here as a named skill and
// re-run it (parameterized) forever. The agentic "craft" step needs a model
// backend key and Webwright's CLI, so it's gated + configurable; the library
// (save / list / run / delete) works on its own and is the verifiable core.

const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { VENV_DIR, VENV_PY } = require("./camoufoxBridge.js");   // reuse the Camoufox venv

const WW_DIR = process.env.WEBWRIGHT_DIR || path.join(VENV_DIR, "Webwright");
const SKILLS_DIR = process.env.WEBWRIGHT_SKILLS || path.join(__dirname, "scrapers");
const KEY_ENVS = ["ANTHROPIC_API_KEY", "OPENAI_API_KEY", "OPENROUTER_API_KEY"];
// Model-backend key lives in the user's home dir, NOT the project tree — so when
// the engine is packaged and shared with other admins it never travels with it.
// Each admin sets their OWN key on their own machine.
const SECRETS = process.env.WEBWRIGHT_SECRETS || path.join(os.homedir(), ".voxelbridge", "webwright.json");
function loadSecrets() { try { if (fs.existsSync(SECRETS)) return JSON.parse(fs.readFileSync(SECRETS, "utf8")); } catch {} return null; }
function saveSecrets(obj) { try { fs.mkdirSync(path.dirname(SECRETS), { recursive: true }); fs.writeFileSync(SECRETS, JSON.stringify(obj), { mode: 0o600 }); return true; } catch (e) { console.warn("[webwright] secrets save failed:", e.message); return false; } }
function setKey(d) {
    d = d || {};
    const provider = String(d.provider || "").toLowerCase();
    const key = String(d.key || "").trim();
    if (!["anthropic", "openai", "openrouter"].includes(provider)) return { ok: false, error: "provider must be anthropic | openai | openrouter" };
    if (!key) return { ok: false, error: "key required" };
    const ok = saveSecrets({ provider, key, model: String(d.model || "").trim(), modelCfg: String(d.modelCfg || "").trim() });
    return ok ? { ok: true, provider, where: SECRETS } : { ok: false, error: "could not write secrets file" };
}
function clearKey() { try { if (fs.existsSync(SECRETS)) fs.unlinkSync(SECRETS); } catch {} return { ok: true }; }

function runProc(cmd, args, timeoutMs, opts) {
    return new Promise((resolve) => {
        let out = "", err = "", done = false, child;
        const finish = (code) => { if (done) return; done = true; clearTimeout(t); resolve({ code, stdout: out, stderr: err }); };
        const t = setTimeout(() => { try { child && child.kill("SIGKILL"); } catch {} finish(-2); }, timeoutMs);
        try { child = spawn(cmd, args, Object.assign({ windowsHide: true }, opts || {})); }
        catch (e) { clearTimeout(t); return resolve({ code: -1, stdout: "", stderr: "spawn failed: " + (e && e.message) }); }
        child.stdout && child.stdout.on("data", d => { out += d; });
        child.stderr && child.stderr.on("data", d => { err += d; });
        child.on("error", e => { err += (err ? "\n" : "") + (e && e.message); finish(-1); });
        child.on("close", code => finish(code == null ? -1 : code));
    });
}

// Recursively find the most-recently-modified file named `base` under `dir`.
function newestFile(dir, base) {
    let best = null, bestM = -1;
    (function walk(d) {
        let ents; try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
        for (const e of ents) {
            const p = path.join(d, e.name);
            if (e.isDirectory()) walk(p);
            else if (e.name === base) { try { const m = fs.statSync(p).mtimeMs; if (m > bestM) { bestM = m; best = p; } } catch {} }
        }
    })(dir);
    return best;
}

async function detect() {
    const r = {
        ok: true, venvDir: VENV_DIR, venvPython: VENV_PY, webwrightDir: WW_DIR, skillsDir: SKILLS_DIR,
        venv: { exists: fs.existsSync(VENV_PY) }, webwright: { installed: false }, backend: { configured: false },
        skillCount: 0, ready: false,
    };
    if (r.venv.exists) {
        const pk = await runProc(VENV_PY, ["-c", "import webwright; print(getattr(webwright,'__version__','installed'))"], 20000);
        if (pk.code === 0) r.webwright = { installed: true, version: (pk.stdout || "").trim() || "installed" };
        else r.webwright = { installed: false, error: ((pk.stderr || "").trim().split("\n").pop() || "not importable") };
    }
    // model backend key: process env, then the saved home-dir secrets, then a .env in the Webwright dir
    let provider = null, keySource = null;
    const envK = KEY_ENVS.find(k => process.env[k]);
    if (envK) { provider = envK.replace("_API_KEY", "").toLowerCase(); keySource = "env"; }
    else {
        const sec = loadSecrets();
        if (sec && sec.key && sec.provider) { provider = sec.provider; keySource = "saved"; }
        else { try { const ep = path.join(WW_DIR, ".env"); if (fs.existsSync(ep)) { const t = fs.readFileSync(ep, "utf8"); const k = KEY_ENVS.find(k => new RegExp("^\\s*" + k + "\\s*=", "m").test(t)); if (k) { provider = k.replace("_API_KEY", "").toLowerCase(); keySource = "ww-env"; } } } catch {} }
    }
    r.backend = provider ? { configured: true, provider, source: keySource } : { configured: false };
    try { r.skillCount = listSkills().length; } catch {}
    r.ready = !!(r.venv.exists && r.webwright.installed);   // backend only needed to CRAFT, not to run saved skills
    return r;
}

const STEPS = {
    clone: async () => {
        if (fs.existsSync(path.join(WW_DIR, ".git")) || fs.existsSync(path.join(WW_DIR, "pyproject.toml")))
            return { ok: true, step: "clone", skipped: true, stdout: "already cloned at " + WW_DIR };
        const x = await runProc("git", ["clone", "--depth", "1", "https://github.com/microsoft/Webwright.git", WW_DIR], 600000);
        return { ok: x.code === 0, step: "clone", code: x.code, stdout: x.stdout, stderr: x.stderr };
    },
    deps: async () => {
        if (!fs.existsSync(VENV_PY)) return { ok: false, step: "deps", error: "Camoufox venv missing — install Camoufox first (/camoufox.html)" };
        if (!fs.existsSync(WW_DIR)) return { ok: false, step: "deps", error: "clone Webwright first" };
        const x = await runProc(VENV_PY, ["-m", "pip", "install", "-e", WW_DIR], 900000);
        return { ok: x.code === 0, step: "deps", code: x.code, stdout: x.stdout, stderr: x.stderr };
    },
    browser: async () => {
        if (!fs.existsSync(VENV_PY)) return { ok: false, step: "browser", error: "Camoufox venv missing — install Camoufox first" };
        // Webwright's default Playwright environment uses Chromium; install it into the venv.
        const x = await runProc(VENV_PY, ["-m", "playwright", "install", "chromium"], 900000);
        return { ok: x.code === 0, step: "browser", code: x.code, stdout: x.stdout, stderr: x.stderr };
    },
};
async function install(step) {
    const fn = STEPS[step];
    if (!fn) return { ok: false, error: "unknown step '" + step + "' (expected clone | deps | browser)" };
    try { return await fn(); } catch (e) { return { ok: false, step, error: (e && e.message) || String(e) }; }
}

// ---- skills library ----
function safeName(n) { n = String(n == null ? "" : n).trim(); return /^[A-Za-z0-9_\-]{1,64}$/.test(n) ? n : null; }
function ensureSkills() { if (!fs.existsSync(SKILLS_DIR)) fs.mkdirSync(SKILLS_DIR, { recursive: true }); }
function _metaPath(n) { return path.join(SKILLS_DIR, n + ".json"); }
function _readMeta(n) { try { const p = _metaPath(n); if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, "utf8")); } catch {} return {}; }

function listSkills() {
    ensureSkills();
    const out = [];
    for (const f of fs.readdirSync(SKILLS_DIR)) {
        if (!f.endsWith(".py")) continue;
        const name = f.slice(0, -3); const st = fs.statSync(path.join(SKILLS_DIR, f)); const meta = _readMeta(name);
        out.push({ name, bytes: st.size, mtime: st.mtimeMs, task: meta.task || "", params: meta.params || [] });
    }
    return out.sort((a, b) => b.mtime - a.mtime);
}
function getSkill(name) {
    const n = safeName(name); if (!n) return { ok: false, error: "bad name" };
    ensureSkills(); const p = path.join(SKILLS_DIR, n + ".py");
    if (!fs.existsSync(p)) return { ok: false, error: "not found" };
    return { ok: true, name: n, code: fs.readFileSync(p, "utf8"), meta: _readMeta(n) };
}
function saveSkill(input) {
    const n = safeName(input && input.name); if (!n) return { ok: false, error: "bad name (A-Za-z0-9_- , <=64 chars)" };
    if (typeof (input && input.code) !== "string" || !input.code.trim()) return { ok: false, error: "empty code" };
    ensureSkills();
    fs.writeFileSync(path.join(SKILLS_DIR, n + ".py"), input.code);
    if (input.meta && typeof input.meta === "object") fs.writeFileSync(_metaPath(n), JSON.stringify(input.meta));
    return { ok: true, name: n };
}
function removeSkill(name) {
    const n = safeName(name); if (!n) return { ok: false, error: "bad name" };
    ensureSkills(); let removed = false;
    for (const ext of [".py", ".json"]) { const p = path.join(SKILLS_DIR, n + ext); if (fs.existsSync(p)) { fs.unlinkSync(p); removed = true; } }
    return { ok: removed, name: n };
}
async function runSkill(name, args) {
    const n = safeName(name); if (!n) return { ok: false, error: "bad name" };
    ensureSkills(); const p = path.join(SKILLS_DIR, n + ".py");
    if (!fs.existsSync(p)) return { ok: false, error: "skill not found" };
    if (!fs.existsSync(VENV_PY)) return { ok: false, error: "Camoufox venv missing — install Camoufox first (/camoufox.html)" };
    const argv = Array.isArray(args) ? args.map(String) : [];
    const x = await runProc(VENV_PY, [p, ...argv], 180000);
    let result = null;
    try { result = JSON.parse((x.stdout || "").trim().split("\n").filter(Boolean).pop()); } catch {}
    return { ok: x.code === 0, name: n, exitCode: x.code, stdout: x.stdout, stderr: x.stderr, result };
}

// ---- craft (agentic authoring — now LIVE) ----
// Runs Webwright's real CLI:
//   <venv>/python -m webwright.run.cli -c base.yaml -c model_<backend>.yaml
//       -t "<task>" [--start-url <url>] --task-id <id> -o <outdir>
// then captures the produced final_script.py and saves it into the skills
// library. The exact command can be overridden with WEBWRIGHT_CRAFT_CMD (use
// {py} {task} {dir} {out} placeholders) if your Webwright version differs.
const MODEL_CFG = { anthropic: "model_claude.yaml", openai: "model_openai.yaml", openrouter: "model_openrouter.yaml" };

async function craft(task, opts) {
    opts = opts || {};
    const det = await detect();
    if (!det.webwright.installed) return { ok: false, error: "Webwright not installed — run the install steps (clone · deps · browser) first" };
    if (!det.backend.configured) return { ok: false, error: "no model backend key — set ANTHROPIC_API_KEY / OPENAI_API_KEY / OPENROUTER_API_KEY (Webwright doesn't take a Gemini key)" };
    const t = String(task || "").trim();
    if (!t) return { ok: false, error: "empty task" };

    let modelCfg = MODEL_CFG[det.backend.provider] || "model_claude.yaml";
    // If the key came from the saved home-dir secrets (not the process env),
    // inject it into the child's env and honor any saved model-config override.
    const extraEnv = {};
    if (det.backend.source === "saved") {
        const sec = loadSecrets() || {};
        if (sec.provider && sec.key) extraEnv[sec.provider.toUpperCase() + "_API_KEY"] = sec.key;
        if (sec.modelCfg) modelCfg = sec.modelCfg;
        if (sec.model) extraEnv.WEBWRIGHT_MODEL = sec.model;
    }
    const taskId = "craft_" + Date.now().toString(36);
    const outDir = path.join(WW_DIR, "outputs", "engine");
    // Phrase it as a CRAFT (reusable, parameterized, JSON-emitting) task.
    const craftTask =
        "Write a reusable, parameterized Python CLI scraper using argparse (Google-style docstring) that accomplishes: " + t +
        ". The final script MUST print exactly one final line of JSON containing the extracted data.";

    let cmd, args;
    const tmpl = process.env.WEBWRIGHT_CRAFT_CMD;
    if (tmpl) {
        const parts = tmpl
            .replace(/\{py\}/g, VENV_PY).replace(/\{dir\}/g, WW_DIR).replace(/\{out\}/g, outDir).replace(/\{task\}/g, craftTask)
            .split(" ").filter(Boolean);
        cmd = parts[0]; args = parts.slice(1);
    } else {
        cmd = VENV_PY;
        args = ["-m", "webwright.run.cli", "-c", "base.yaml", "-c", modelCfg, "-t", craftTask, "--task-id", taskId, "-o", outDir];
        if (opts.startUrl) { args.push("--start-url", String(opts.startUrl)); }
    }

    const x = await runProc(cmd, args, 1800000, { cwd: WW_DIR, env: Object.assign({}, process.env, extraEnv) });   // 30-min ceiling; run inside the repo so configs resolve

    // Capture the produced script and save it as a skill.
    const script = newestFile(outDir, "final_script.py");
    let savedSkill = null, saveErr = null;
    if (script) {
        const code = fs.readFileSync(script, "utf8");
        const name = (opts.name && safeName(opts.name)) || ("craft_" + taskId.slice(-6));
        const r = saveSkill({ name, code, meta: { task: t, source: "webwright", craftedAt: Date.now() } });
        if (r.ok) savedSkill = r.name; else saveErr = r.error;
    }
    return {
        ok: x.code === 0 && !!savedSkill,
        exitCode: x.code, taskId, savedSkill, scriptPath: script || null,
        error: savedSkill ? undefined : (saveErr || (script ? "saved-skill failed" : "Webwright produced no final_script.py — check stderr")),
        stdout: (x.stdout || "").slice(-3000),
        stderr: savedSkill ? undefined : (x.stderr || "").slice(-3000),
    };
}

module.exports = { detect, install, listSkills, getSkill, saveSkill, removeSkill, runSkill, craft, setKey, clearKey, WW_DIR, SKILLS_DIR, SECRETS };
