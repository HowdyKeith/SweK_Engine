// mlxInstallBridge.js — v1139
// Mac-side "install buttons + detect" for local OpenAI-compatible MLX servers, the
// counterpart to the PC asset-pipeline installer. DETECT works on any OS (it just
// probes ports). INSTALL is gated to darwin (these are Apple-Silicon tools) and shells
// out to the documented commands — rig-verify on the Mac, since the sandbox can't run
// brew/pip installs. Commands are best-effort; the panel shows them so they're auditable.

const { spawn, execFile } = require("child_process");
const isMac = process.platform === "darwin";

// Known local OpenAI-compatible MLX servers. `port` is the usual default; detect also
// probes whatever base URL is saved in the Local MLX config.
const CATALOG = [
    { id: "mlx-lm", label: "MLX-LM (Apple official)", bin: "mlx_lm.server", port: 8080,
      install: ["pip3", ["install", "-U", "mlx-lm"]], run: "mlx_lm.server --model <hf-model> --port 8080",
      note: "Apple's reference MLX server. After install, run: mlx_lm.server --model mlx-community/Llama-3.2-3B-Instruct-4bit --port 8080" },
    { id: "rapid-mlx", label: "Rapid-MLX (fastest)", bin: "rapid-mlx", port: 8080,
      install: ["pip3", ["install", "-U", "rapid-mlx"]], run: "rapid-mlx serve",
      note: "Drop-in OpenAI server, ~4x faster than Ollama on Apple Silicon. Verify the exact start command in the repo." },
    { id: "osaurus", label: "Osaurus (native, MCP)", bin: "osaurus", port: 1234,
      install: ["brew", ["install", "--cask", "osaurus"]], run: "open -a Osaurus",
      note: "Native macOS runtime (Swift). If the cask name differs, grab the .dmg from the repo releases." },
    { id: "vmlx", label: "vMLX (prefix cache)", bin: "vmlx", port: 8080,
      install: ["brew", ["install", "--cask", "vmlx"]], run: "open -a vMLX",
      note: "MLX inference app with prefix caching + MCP. Cask name may vary; check the site." },
];

function _which(bin) { return new Promise((res) => { execFile(isMac || process.platform === "linux" ? "which" : "where", [bin], (e, o) => res(!e && !!String(o).trim())); }); }

async function _probe(base) {
    const url = base.replace(/\/+$/, "") + "/v1/models";
    try {
        const r = await fetch(url, { signal: AbortSignal.timeout(2500) });
        if (!r.ok) return null;
        const d = await r.json().catch(() => ({}));
        const models = (d && (d.data || d.models) || []).map(m => m.id || m.name || m).filter(Boolean).slice(0, 12);
        return { base: base.replace(/\/+$/, ""), models };
    } catch { return null; }
}

function catalog() { return { ok: true, platform: process.platform, supported: isMac, items: CATALOG.map(({ id, label, port, run, note }) => ({ id, label, port, run, note })) }; }

// Probe the saved base URL + each catalog default port for a live OpenAI server, and
// check which tool binaries are installed.
async function detect(savedBaseUrl) {
    const bases = new Set();
    if (savedBaseUrl) bases.add(savedBaseUrl);
    for (const c of CATALOG) bases.add("http://127.0.0.1:" + c.port);
    for (const p of [1234, 8000, 11432]) bases.add("http://127.0.0.1:" + p);
    const servers = (await Promise.all([...bases].map(_probe))).filter(Boolean);
    const installed = {};
    for (const c of CATALOG) installed[c.id] = await _which(c.bin);
    return { ok: true, platform: process.platform, supported: isMac, servers, installed };
}

async function install(id) {
    if (!isMac) return { ok: false, supported: false, error: "these installers are macOS-only (run on the Apple-Silicon Mac)" };
    const item = CATALOG.find(c => c.id === id);
    if (!item) return { ok: false, error: "unknown item " + id };
    return new Promise((resolve) => {
        const [cmd, args] = item.install;
        let out = "", err = "", child;
        try { child = spawn(cmd, args, { windowsHide: true }); }
        catch (e) { return resolve({ ok: false, error: "spawn: " + e.message + " (is " + cmd + " installed?)" }); }
        const t = setTimeout(() => { try { child.kill(); } catch {} resolve({ ok: false, error: "timed out", out: out.slice(-3000) }); }, 600000);
        child.stdout.on("data", d => out += d);
        child.stderr.on("data", d => err += d);
        child.on("error", e => { clearTimeout(t); resolve({ ok: false, error: cmd + ": " + e.message }); });
        child.on("close", code => { clearTimeout(t); resolve({ ok: code === 0, code, cmd: cmd + " " + args.join(" "), out: (out + err).slice(-4000), run: item.run, note: item.note }); });
    });
}

module.exports = { catalog, detect, install };
