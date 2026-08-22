// terminalBridge.js — v1154
// A localhost-only, opt-in shell behind the engine's WebSocket. Pairs with
// terminal.html (xterm.js + WebGL addon) to give a GPU-accelerated terminal in
// the browser — and, mirrored onto a screen wall, a real shell running inside
// the 3D world.
//
// SAFETY (this is remote code execution, so it's deliberately locked down):
//   - Only 127.0.0.1 / ::1 clients are accepted. LAN devices (phone, Shield)
//     are refused — they can use everything else, just not the shell.
//   - OFF by default. Must be enabled in Settings (writes terminal.json).
//
// No PTY (so no native module to compile): a persistent shell reads command
// lines from stdin and streams stdout/stderr. Each command is followed by a
// sentinel write so the client knows when to re-show its prompt. Full-screen
// TUIs (vim/htop) won't work without a PTY; ordinary commands do.

const { spawn } = require("child_process");
const fs = require("fs"), os = require("os"), path = require("path");

const CFG = path.join(os.homedir(), ".voxelbridge", "terminal.json");
const SENT = "VOXTERM_END_b3f9c1:";   // per-command completion marker

function load() { try { return JSON.parse(fs.readFileSync(CFG, "utf8")); } catch { return {}; } }
function save(o) { try { fs.mkdirSync(path.dirname(CFG), { recursive: true }); fs.writeFileSync(CFG, JSON.stringify(o)); } catch {} }
function isEnabled() { return load().enabled === true; }      // default OFF
function setEnabled(on) { const c = load(); c.enabled = !!on; save(c); return { ok: true, enabled: c.enabled }; }
function lanAllowed() { return load().allowLan === true; }    // default OFF
function setLanAllowed(on) { const c = load(); c.allowLan = !!on; save(c); return { ok: true, allowLan: c.allowLan }; }
function shellName() { return process.platform === "win32" ? "powershell.exe" : (process.env.SHELL || "bash"); }
function status() { return { ok: true, enabled: isEnabled(), allowLan: lanAllowed(), localhostOnly: !lanAllowed(), platform: process.platform, shell: shellName(), assets: assetsStatus() }; }

// ---- offline assets: vendor xterm.js locally so the terminal works with no
// internet (detect / install / uninstall), instead of always pulling the CDN.
const VENDOR = path.join(__dirname, "..", "vendor", "xterm");   // -> WebGLEngine/vendor/xterm (served at /vendor/xterm/)
const ASSETS = [
    { file: "xterm.min.js", url: "https://cdn.jsdelivr.net/npm/@xterm/xterm@5.5.0/lib/xterm.min.js" },
    { file: "xterm.min.css", url: "https://cdn.jsdelivr.net/npm/@xterm/xterm@5.5.0/css/xterm.min.css" },
    { file: "addon-fit.min.js", url: "https://cdn.jsdelivr.net/npm/@xterm/addon-fit@0.10.0/lib/addon-fit.min.js" },
    { file: "addon-webgl.min.js", url: "https://cdn.jsdelivr.net/npm/@xterm/addon-webgl@0.18.0/lib/addon-webgl.min.js" },
];
function assetsStatus() { const present = ASSETS.every(a => { try { return fs.statSync(path.join(VENDOR, a.file)).size > 0; } catch { return false; } }); return { vendored: present, files: ASSETS.map(a => a.file) }; }
async function assetsInstall() {
    try {
        fs.mkdirSync(VENDOR, { recursive: true });
        for (const a of ASSETS) {
            const r = await fetch(a.url);
            if (!r.ok) throw new Error(a.file + ": HTTP " + r.status);
            fs.writeFileSync(path.join(VENDOR, a.file), Buffer.from(await r.arrayBuffer()));
        }
        return { ok: true, vendored: true, files: ASSETS.map(a => a.file) };
    } catch (e) { return { ok: false, error: (e && e.message) || "download failed" }; }
}
function assetsUninstall() {
    try { for (const a of ASSETS) { try { fs.unlinkSync(path.join(VENDOR, a.file)); } catch {} } try { fs.rmdirSync(VENDOR); } catch {} return { ok: true, vendored: false }; }
    catch (e) { return { ok: false, error: (e && e.message) || "remove failed" }; }
}

// v1166 — Microsoft Coreutils for Windows (winget pkg Microsoft.Coreutils): a
// single multi-call binary bundling Rust uutils/coreutils + findutils + grep,
// so ls / cat / cp / grep / find / sed work natively in PowerShell/CMD. Detect
// + one-click winget install, surfaced in the terminal. (Build 2026, preview;
// needs PowerShell 7.4+.) On non-Windows hosts these no-op cleanly.
function _run(cmd, args, timeoutMs) {
    return new Promise((resolve) => {
        let out = "", err = "", done = false, p;
        const finish = (o) => { if (!done) { done = true; resolve(o); } };
        try { p = spawn(cmd, args, { windowsHide: true }); }
        catch (e) { return finish({ code: -1, out: "", err: String((e && e.message) || e) }); }
        const to = setTimeout(() => { try { p.kill(); } catch {} finish({ code: -1, out, err: err + "\n[timeout]" }); }, timeoutMs || 120000);
        p.stdout && p.stdout.on("data", d => out += d);
        p.stderr && p.stderr.on("data", d => err += d);
        p.on("error", e => { clearTimeout(to); finish({ code: -1, out, err: String((e && e.message) || e) }); });
        p.on("close", code => { clearTimeout(to); finish({ code, out, err }); });
    });
}
async function coreutilsStatus() {
    if (process.platform !== "win32") return { ok: true, supported: false, installed: false, platform: process.platform, pkg: "Microsoft.Coreutils", note: "Coreutils for Windows is a Windows package \u2014 this host isn't Windows." };
    const r = await _run("coreutils", ["--version"], 8000);
    let installed = r.code === 0 && /coreutils|uutils/i.test(r.out + r.err);
    let version = installed ? ((r.out || "").trim().split(/\r?\n/)[0] || "") : "";
    if (!installed) { const w = await _run("where.exe", ["coreutils"], 8000); if (w.code === 0 && (w.out || "").trim()) installed = true; }
    return { ok: true, supported: true, installed, version, platform: "win32", pkg: "Microsoft.Coreutils", needs: "PowerShell 7.4+" };
}
async function coreutilsInstall() {
    if (process.platform !== "win32") return { ok: false, error: "Windows only. On your PC run:  winget install --id=Microsoft.Coreutils -e" };
    const r = await _run("winget", ["install", "--id=Microsoft.Coreutils", "-e", "--accept-package-agreements", "--accept-source-agreements"], 300000);
    const okWords = /successfully installed|already installed/i.test(r.out + r.err);
    return { ok: r.code === 0 || okWords, code: r.code, output: ((r.out || "") + (r.err ? "\n" + r.err : "")).slice(-4000) };
}

function isLocal(req) {
    const ra = (req && req.socket && req.socket.remoteAddress) || "";
    return ra === "127.0.0.1" || ra === "::1" || ra === "::ffff:127.0.0.1" || ra.endsWith(":127.0.0.1");
}

function handle(ws, req, ctx) {
    ctx = ctx || {};
    const send = (o) => { try { ws.send(JSON.stringify(o)); } catch {} };
    if (!ctx.local && !ctx.lanOk) {
        send({ type: "error", data: ctx.lanAttempt
            ? "LAN terminal access needs an access password set (Settings \u2192 Security) AND \u201cAllow LAN\u201d on \u2014 and you must be logged in on this device."
            : "Terminal is localhost-only \u2014 open it on the machine running the bridge, or turn on \u201cAllow LAN\u201d (with a password) to use it from your phone." });
        try { ws.close(); } catch {} return;
    }
    if (!isEnabled()) { send({ type: "error", data: "Terminal is OFF. Enable it in Settings \u2192 Diagnostics \u2192 Terminal first, then reload." }); try { ws.close(); } catch {} return; }

    const win = process.platform === "win32";
    let sh;
    try {
        sh = win
            ? spawn("powershell.exe", ["-NoLogo", "-NoProfile"], { windowsHide: true })
            : spawn(shellName(), [], { env: { ...process.env } });
    } catch (e) { send({ type: "error", data: "could not start a shell: " + e.message }); try { ws.close(); } catch {} return; }

    // Quiet the shell's own prompt so only our sentinel drives the client prompt.
    try { sh.stdin.write(win ? "function prompt { '' }\n" : "PS1=''\n"); } catch {}
    send({ type: "info", data: "Connected to " + shellName() + " (localhost).\r\n" });
    send({ type: "ready", code: "" });

    let buf = "";
    const onChunk = (d) => {
        buf += d.toString();
        let idx;
        while ((idx = buf.indexOf(SENT)) !== -1) {
            const before = buf.slice(0, idx);
            if (before) send({ type: "output", data: before });
            const rest = buf.slice(idx + SENT.length);
            const nl = rest.indexOf("\n");
            if (nl === -1) { buf = buf.slice(idx); return; }    // sentinel split across chunks — wait
            const code = rest.slice(0, nl).trim();
            buf = rest.slice(nl + 1);
            send({ type: "ready", code });
        }
        // flush everything except a possible partial trailing sentinel
        const keep = buf.length - SENT.length;
        if (keep > 0) { send({ type: "output", data: buf.slice(0, keep) }); buf = buf.slice(keep); }
    };
    sh.stdout.on("data", onChunk);
    sh.stderr.on("data", onChunk);
    sh.on("close", () => { send({ type: "exit" }); try { ws.close(); } catch {} });
    sh.on("error", (e) => { send({ type: "error", data: "shell error: " + e.message }); });

    ws.on("message", (m) => {
        let d; try { d = JSON.parse(m.toString()); } catch { return; }
        if (d.type === "input") {
            const cmd = String(d.data == null ? "" : d.data);
            try {
                sh.stdin.write(cmd + "\n");
                if (win) sh.stdin.write('Write-Output ("' + SENT + '" + $LASTEXITCODE)\n');
                else sh.stdin.write("printf '" + SENT + "%s\\n' \"$?\"\n");
            } catch {}
        } else if (d.type === "signal" && d.data === "SIGINT") {
            try { if (win) sh.stdin.write("\x03"); else sh.kill("SIGINT"); } catch {}
        }
    });

    const kill = () => { try { sh.kill(); } catch {} };
    ws.on("close", kill); ws.on("error", kill);
}

module.exports = { handle, status, setEnabled, isEnabled, lanAllowed, setLanAllowed, assetsStatus, assetsInstall, assetsUninstall, coreutilsStatus, coreutilsInstall };
