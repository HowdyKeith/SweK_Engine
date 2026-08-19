// ai-bridge/cloudflareTunnel.js — v1910
// Two related capabilities for exposing this SweK box remotely:
//
//  (A) NAMED TUNNEL setup (permanent URL like swek.yourdomain.com). A permanent Cloudflare URL needs
//      a domain on a Cloudflare account + an INTERACTIVE `cloudflared tunnel login` (opens a browser to
//      authorize + pick the zone). We can't automate the login, so we GENERATE an OS-specific, commented
//      setup script the user runs once; it installs cloudflared, creates the named tunnel, writes a
//      config.yml mapping the hostname -> localhost:PORT, routes DNS, and installs it as an auto-start
//      service. After that the URL is permanent and survives reboots.
//
//  (B) DRIVE URL-POINTER auto-updater (free, no domain). Each box keeps a normal quick tunnel and writes
//      its CURRENT url into a fixed file in the Drive SweK-assets folder (swek-tunnels/<name>.json). The
//      *file location* is permanent even though the URL churns — so peers (and a "connect to my sister's
//      box" button) always resolve the live URL by reading the pointer. Reuses driveSync.uploadBytes.
const fs = require("fs");
const os = require("os");
const path = require("path");

const CFG_DIR = path.join(os.homedir(), ".voxelbridge");
const CFG = path.join(CFG_DIR, "cftunnel.json");
const DEF = { hostname: "", tunnelName: "swek", port: 8787, drivePointer: false, lastPointerUrl: "", lastPointerAt: 0 };

function load() { try { return Object.assign({}, DEF, JSON.parse(fs.readFileSync(CFG, "utf8")) || {}); } catch { return Object.assign({}, DEF); } }
function save(o) { try { fs.mkdirSync(CFG_DIR, { recursive: true }); fs.writeFileSync(CFG, JSON.stringify(o, null, 2), { mode: 0o600 }); } catch {} }
function getConfig() { return { ok: true, config: load() }; }
function setConfig(p) {
    const c = load();
    if (p && typeof p.hostname === "string") c.hostname = p.hostname.trim().replace(/^https?:\/\//, "").replace(/\/+$/, "");
    if (p && typeof p.tunnelName === "string" && p.tunnelName.trim()) c.tunnelName = p.tunnelName.trim().replace(/[^a-zA-Z0-9_-]/g, "");
    if (p && p.port) c.port = parseInt(p.port, 10) || 8787;
    if (p && typeof p.drivePointer === "boolean") c.drivePointer = p.drivePointer;
    save(c);
    return getConfig();
}

// ── (A) generate the named-tunnel setup script for the given OS ───────────────
// Returns { script, filename, steps } — the user saves + runs it, doing the one interactive login.
function setupScript(opts) {
    const c = load();
    opts = opts || {};
    const host = (opts.hostname || c.hostname || "swek.example.com").trim().replace(/^https?:\/\//, "").replace(/\/+$/, "");
    const name = (opts.tunnelName || c.tunnelName || "swek").replace(/[^a-zA-Z0-9_-]/g, "");
    const port = parseInt(opts.port || c.port || 8787, 10);
    const plat = opts.platform || process.platform;

    const steps = [
        "You need a domain already added to your Cloudflare account (free plan is fine).",
        "Run this script once. It will pause at `cloudflared tunnel login` — a browser opens; pick your domain and authorize.",
        "After it finishes, https://" + host + " is permanent and auto-starts on boot.",
    ];

    if (plat === "win32") {
        const home = "%USERPROFILE%";
        const script = [
            "@echo off",
            "REM === SweK permanent Cloudflare tunnel setup (Windows) ===",
            "REM Target: https://" + host + "  ->  http://localhost:" + port,
            "",
            "echo [1/6] Installing cloudflared (winget)...",
            "winget install --id Cloudflare.cloudflared -e --accept-package-agreements --accept-source-agreements",
            "",
            "echo [2/6] Login (a browser will open - pick your domain and authorize)...",
            "cloudflared tunnel login",
            "",
            "echo [3/6] Creating the named tunnel '" + name + "' (skips if it exists)...",
            "cloudflared tunnel create " + name,
            "",
            "echo [4/6] Routing DNS " + host + " -> this tunnel...",
            "cloudflared tunnel route dns " + name + " " + host,
            "",
            "echo [5/6] Writing config.yml...",
            "for /f \"tokens=*\" %%i in ('cloudflared tunnel list ^| findstr /i \"" + name + "\"') do set TUN=%%i",
            "(",
            "echo tunnel: " + name,
            "echo credentials-file: " + home + "\\.cloudflared\\<UUID>.json",
            "echo ingress:",
            "echo   - hostname: " + host,
            "echo     service: http://localhost:" + port,
            "echo   - service: http_status:404",
            ") > \"" + home + "\\.cloudflared\\config.yml\"",
            "echo NOTE: edit " + home + "\\.cloudflared\\config.yml and replace <UUID> with the id from: cloudflared tunnel list",
            "",
            "echo [6/6] Installing as an auto-start service...",
            "cloudflared service install",
            "net start cloudflared",
            "",
            "echo Done. Your permanent URL: https://" + host,
            "pause",
        ].join("\r\n");
        return { ok: true, filename: "swek-cloudflare-setup.bat", script, steps, host, note: "Run in an ADMIN Command Prompt (service install needs it). One manual edit: put the tunnel UUID into config.yml where it says <UUID>." };
    }

    // macOS / Linux
    const isMac = plat === "darwin";
    const install = isMac
        ? "  brew install cloudflared"
        : "  curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg | sudo tee /usr/share/keyrings/cloudflare-main.gpg >/dev/null\n" +
          "  echo \"deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared any main\" | sudo tee /etc/apt/sources.list.d/cloudflared.list\n" +
          "  sudo apt-get update && sudo apt-get install -y cloudflared";
    const svc = isMac
        ? "sudo cloudflared service install && sudo launchctl start com.cloudflare.cloudflared || cloudflared service install"
        : "sudo cloudflared service install && sudo systemctl enable --now cloudflared";
    const script = [
        "#!/usr/bin/env bash",
        "set -e",
        "# === SweK permanent Cloudflare tunnel setup (" + (isMac ? "macOS" : "Linux") + ") ===",
        "# Target: https://" + host + "  ->  http://localhost:" + port,
        "HOST=\"" + host + "\"; NAME=\"" + name + "\"; PORT=" + port,
        "",
        "echo \"[1/6] Installing cloudflared...\"",
        "if ! command -v cloudflared >/dev/null 2>&1; then",
        install,
        "fi",
        "",
        "echo \"[2/6] Login (a browser opens — pick your domain and authorize)...\"",
        "cloudflared tunnel login",
        "",
        "echo \"[3/6] Creating named tunnel '$NAME' (ok if it already exists)...\"",
        "cloudflared tunnel create \"$NAME\" || true",
        "",
        "echo \"[4/6] Routing DNS $HOST -> tunnel...\"",
        "cloudflared tunnel route dns \"$NAME\" \"$HOST\"",
        "",
        "echo \"[5/6] Writing ~/.cloudflared/config.yml...\"",
        "UUID=$(cloudflared tunnel list | awk -v n=\"$NAME\" '$2==n {print $1}')",
        "cat > ~/.cloudflared/config.yml <<EOF",
        "tunnel: $UUID",
        "credentials-file: $HOME/.cloudflared/$UUID.json",
        "ingress:",
        "  - hostname: $HOST",
        "    service: http://localhost:$PORT",
        "  - service: http_status:404",
        "EOF",
        "",
        "echo \"[6/6] Installing as an auto-start service...\"",
        svc,
        "",
        "echo \"Done. Permanent URL: https://$HOST\"",
    ].join("\n");
    return { ok: true, filename: "swek-cloudflare-setup.sh", script, steps, host, note: "chmod +x swek-cloudflare-setup.sh then ./swek-cloudflare-setup.sh . The DNS-route + service steps may prompt for your password." };
}

// ── (B) Drive URL-pointer: write this box's current tunnel URL to a fixed Drive file ──
// deps: { driveSync, getToken(scope)->token, folderId, selfName }
// currentUrl: the live tunnel URL (named or quick). Writes swek-tunnels/<name>.json with {url, at, name}.
let _lastWrite = 0;
async function writePointer(deps, currentUrl) {
    const c = load();
    if (!c.drivePointer) return { ok: true, skipped: "pointer disabled" };
    if (!currentUrl || !/^https?:\/\//.test(currentUrl)) return { ok: false, error: "no valid current url" };
    if (currentUrl === c.lastPointerUrl && Date.now() - _lastWrite < 60000) return { ok: true, skipped: "unchanged" };
    if (!deps || !deps.driveSync || !deps.folderId) return { ok: false, error: "drive not configured (need folderId + token)" };
    const name = (deps.selfName || "box").replace(/[^a-zA-Z0-9_-]/g, "") || "box";
    const body = Buffer.from(JSON.stringify({ name, url: currentUrl, at: Date.now() }, null, 2), "utf8");
    try {
        const token = await deps.getToken(deps.driveSync.WRITE_SCOPE || "https://www.googleapis.com/auth/drive.file");
        // find-or-create a swek-tunnels subfolder, then upload/replace <name>.json
        let folderId = deps.folderId;
        const r = await deps.driveSync.uploadBytes(token, folderId, "swek-tunnel-" + name + ".json", body, "application/json", deps.fetchImpl);
        if (r && (r.id || r.ok)) { c.lastPointerUrl = currentUrl; c.lastPointerAt = Date.now(); _lastWrite = Date.now(); save(c); return { ok: true, wrote: "swek-tunnel-" + name + ".json", url: currentUrl }; }
        return { ok: false, error: "upload failed", detail: r };
    } catch (e) { return { ok: false, error: String(e && e.message || e) }; }
}

// read all peer tunnel pointers from the Drive folder -> [{name, url, at}]
async function readPointers(deps) {
    if (!deps || !deps.driveSync || !deps.folderId) return { ok: false, error: "drive not configured" };
    try {
        const token = await deps.getToken(deps.driveSync.SCOPE || "https://www.googleapis.com/auth/drive.readonly");
        const files = await deps.driveSync.listFolder(token, deps.folderId, deps.fetchImpl);
        const ptrs = (files || []).filter(f => /^swek-tunnel-.*\.json$/.test(f.name || ""));
        const out = [];
        for (const f of ptrs) {
            try { const buf = await deps.driveSync.downloadBytes(token, f.id, deps.fetchImpl); const j = JSON.parse(Buffer.from(buf).toString("utf8")); if (j && j.url) out.push({ name: j.name || f.name, url: j.url, at: j.at || 0 }); } catch {}
        }
        return { ok: true, pointers: out };
    } catch (e) { return { ok: false, error: String(e && e.message || e) }; }
}

module.exports = { getConfig, setConfig, setupScript, writePointer, readPointers };
