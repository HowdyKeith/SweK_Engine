// googleHomeBridge.js — v1162
// Mint the ha-google-home "master token" from a Google email + app password, and
// stash all three (email / app password / master token) in the OS credential
// vault. The master token is the painful part of ha-google-home setup; this turns
// it into one button. Shells the gpsoauth-based python helper; password goes over
// stdin so it never appears in argv. Windows-only for the vault (no-op elsewhere).
const { spawn } = require("child_process");
const path = require("path");
const winCred = require("./winCredBridge.js");

const PY_SCRIPT = path.join(__dirname, "tools", "google_master_token.py");
const T_EMAIL = "googleHomeEmail", T_APPPW = "googleHomeAppPassword", T_TOKEN = "googleHomeMasterToken";
function _python() { return process.platform === "win32" ? "python" : "python3"; }

function _mint(email, password, androidId) {
    return new Promise((resolve) => {
        let py;
        try { py = spawn(_python(), [PY_SCRIPT], { windowsHide: true }); }
        catch (e) { return resolve({ ok: false, error: "python not found: " + e.message }); }
        let out = "", err = "";
        py.stdout.on("data", d => out += d);
        py.stderr.on("data", d => err += d);
        py.on("error", e => resolve({ ok: false, error: "python not found: " + e.message }));
        py.on("close", () => { const line = (out.trim().split(/\r?\n/).pop() || "").trim(); try { resolve(JSON.parse(line)); } catch { resolve({ ok: false, error: (err || out || "no output from helper").slice(0, 300) }); } });
        try { py.stdin.write(JSON.stringify({ email, password, androidId })); py.stdin.end(); } catch {}
    });
}

function _ensureGpsoauth() {
    return new Promise((resolve) => {
        let pip; try { pip = spawn(_python(), ["-m", "pip", "install", "--quiet", "gpsoauth"], { windowsHide: true }); }
        catch { return resolve(false); }
        pip.on("error", () => resolve(false));
        pip.on("close", c => resolve(c === 0));
    });
}

// Mint, auto-installing gpsoauth on first use, then vault email/app-password/token.
async function mintAndStore(email, password, androidId) {
    email = String(email || "").trim();
    if (!email || !password) return { ok: false, error: "email and app password are required" };
    let r = await _mint(email, password, androidId);
    if (!r.ok && r.needInstall) { const ok = await _ensureGpsoauth(); if (!ok) return { ok: false, error: "couldn't install gpsoauth (pip). Run: python -m pip install gpsoauth" }; r = await _mint(email, password, androidId); }
    if (r.ok && r.masterToken) {
        try { await winCred.setSecret(T_EMAIL, email); await winCred.setSecret(T_APPPW, password); await winCred.setSecret(T_TOKEN, r.masterToken); r.stored = process.platform === "win32"; }
        catch (e) { r.stored = false; r.storeError = String(e && e.message || e); }
    }
    return r;   // { ok, masterToken, email, stored } or { ok:false, error }
}

async function status() {
    const sec = async (t) => { try { const x = await winCred.getSecret(t); return (x && (x.secret || x.value)) || ""; } catch { return ""; } };
    const email = await sec(T_EMAIL), tok = await sec(T_TOKEN);
    const tail = (s) => s ? ("\u2022\u2022\u2022" + String(s).slice(-6)) : null;
    return { ok: true, vault: process.platform === "win32", email: email || null, hasToken: !!tok, tokenTail: tail(tok) };
}

async function forget() {
    try { await winCred.delSecret(T_EMAIL); await winCred.delSecret(T_APPPW); await winCred.delSecret(T_TOKEN); return { ok: true }; }
    catch (e) { return { ok: false, error: String(e && e.message || e) }; }
}

module.exports = { mintAndStore, status, forget };
