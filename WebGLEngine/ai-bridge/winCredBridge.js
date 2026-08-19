// ai-bridge/winCredBridge.js - v1130
// Store/read secrets (GitHub token, Gmail app password) in the Windows Credential
// Manager via cred-manager.ps1, so they live in the OS vault instead of plaintext
// json. loadIntoEnv() pulls the known secrets into process.env at boot; the github
// and gmail bridges read those as a fallback. The browser never reads a secret back
// (status returns only whether one exists) — only set/delete/load are exposed.

const { spawn } = require("child_process");
const path = require("path");

const PS1 = path.join(__dirname, "cred-manager.ps1");
const PREFIX = "SweKEngine:";
// known secret targets -> the env var the bridges read
const KNOWN = { githubToken: "GITHUB_TOKEN", gmailPass: "GMAIL_APP_PASSWORD", ocisAdminPw: "OCIS_ADMIN_PASSWORD", driveClientSecret: "DRIVE_CLIENT_SECRET", driveRefreshToken: "DRIVE_REFRESH_TOKEN" };

function _run(action, target, secret) {
    return new Promise((resolve) => {
        if (process.platform !== "win32") return resolve({ ok: false, error: "Windows Credential Manager needs Windows" });
        let out = "", err = "", done = false, child;
        const env = Object.assign({}, process.env);
        if (secret != null) env.CRED_SECRET = String(secret);
        const t = setTimeout(() => { if (done) return; done = true; try { child && child.kill("SIGKILL"); } catch {} resolve({ ok: false, error: "credential timeout" }); }, 15000);
        try { child = spawn("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", PS1, "-Action", action, "-Target", PREFIX + target], { windowsHide: true, env }); }
        catch (e) { clearTimeout(t); return resolve({ ok: false, error: "powershell: " + e.message }); }
        child.stdout.on("data", d => out += d);
        child.stderr.on("data", d => err += d);
        child.on("error", e => { if (done) return; done = true; clearTimeout(t); resolve({ ok: false, error: String(e && e.message) }); });
        child.on("close", () => { if (done) return; done = true; clearTimeout(t); const line = (out.trim().split(/\r?\n/).pop() || "").trim(); try { resolve(JSON.parse(line)); } catch { resolve({ ok: false, error: "no JSON from cred-manager", stderr: err.slice(0, 200), raw: out.slice(0, 200) }); } });
    });
}

function setSecret(target, secret) { if (!target || secret == null) return Promise.resolve({ ok: false, error: "target + secret required" }); return _run("set", target, secret); }
function getSecret(target) { return _run("get", target); }
function delSecret(target) { return _run("del", target); }

// status without leaking the secret: which known targets exist (+ masked tail)
async function status() {
    if (process.platform !== "win32") return { ok: true, available: false, reason: "not Windows", items: {} };
    const items = {};
    for (const key of Object.keys(KNOWN)) {
        const r = await getSecret(key);
        items[key] = { stored: !!(r && r.found), tail: (r && r.found && r.secret) ? String(r.secret).slice(-4) : "" };
    }
    return { ok: true, available: true, items };
}

// pull known secrets into process.env so the bridges can use them
async function loadIntoEnv() {
    if (process.platform !== "win32") return { ok: false, error: "not Windows" };
    const loaded = [];
    for (const [key, envVar] of Object.entries(KNOWN)) {
        try { const r = await getSecret(key); if (r && r.found && r.secret) { process.env[envVar] = r.secret; loaded.push(key); } } catch {}
    }
    return { ok: true, loaded };
}

module.exports = { setSecret, getSecret, delSecret, status, loadIntoEnv, KNOWN, PREFIX };
