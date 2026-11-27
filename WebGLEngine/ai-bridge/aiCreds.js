// FILE: ai-bridge/aiCreds.js
// Reads AI API keys from the Windows Credential Manager — the SAME vault used by
// CredentialStore.bas / AIKeys.bas / CredentialStore.ps1 — by shelling the
// bundled PowerShell helper (the bridge already shells powershell.exe elsewhere).
// Falls back to existing environment variables. Windows-only; on other platforms
// it's a no-op and env vars are used as-is.

const { execFileSync } = require("child_process");
const path = require("path");

const PS_HELPER = path.join(__dirname, "CredentialStore.ps1");
const ENV_BY_PROVIDER = {
    grok:   "GROK_API_KEY",
    gemini: "GEMINI_API_KEY",
    openai: "OPENAI_API_KEY",
    claude: "ANTHROPIC_API_KEY",
};

// Read one provider's key from the vault. "" if unavailable.
function getApiKey(provider) {
    const envVar = ENV_BY_PROVIDER[provider];
    if (process.platform === "win32") {
        try {
            const out = execFileSync("powershell.exe",
                ["-NoLogo", "-NoProfile", "-ExecutionPolicy", "Bypass",
                 "-File", PS_HELPER, "-Get", "-Provider", provider],
                { encoding: "utf8", windowsHide: true, timeout: 8000 });
            const key = (out || "").trim();
            if (key) return key;
        } catch (e) {
            // PowerShell unavailable or no vault entry — fall through to env.
        }
    }
    return (envVar && process.env[envVar]) ? process.env[envVar] : "";
}

// For each provider whose env var isn't already set, pull it from the vault and
// set process.env, so existing consumers (e.g. geminiCommentator reading
// process.env.GEMINI_API_KEY) work unchanged. Returns {provider: source}.
// *** v4933 -- ONE VAULT READ PER KEY_TTL_MS, NOT ONE PER CALL. *** On Windows each provider whose env var is unset costs a powershell.exe start (about 2.5 s on the 8 GB rig), and deviceBridge asks for one provider's key at a time: a single /device/list was
// 4 providers x 4 vault reads = 16 PowerShell starts, and deviceBridge-selfcheck lists twice -- 10 of its 19.8 s on the rig, which is why the sweep killed it at the 20 s cap. The result is kept for KEY_TTL_MS (a key saved to the vault is picked up within that
// time, and saveApiKey sets the env itself at once); `{ force: true }` re-reads. Callers that want the log line once per read get exactly that.
const KEY_TTL_MS = 30000;
let _loaded = null, _loadedAt = 0;
function loadKeysIntoEnv(opts) {
    if (!(opts && opts.force) && _loaded && Date.now() - _loadedAt < KEY_TTL_MS) return { ..._loaded };
    const result = {};
    for (const [provider, envVar] of Object.entries(ENV_BY_PROVIDER)) {
        if (process.env[envVar]) { result[provider] = "env"; continue; }
        const key = getApiKey(provider);
        if (key) { process.env[envVar] = key; result[provider] = "vault"; }
        else { result[provider] = "none"; }
    }
    console.log("[aiCreds] key sources -> " +
        Object.entries(result).map(([p, s]) => `${p}:${s}`).join(" "));
    _loaded = result; _loadedAt = Date.now();
    return { ...result };
}

module.exports = { getApiKey, loadKeysIntoEnv, saveApiKey, keyStatus, KEY_TTL_MS };

// Write a key to the vault via the PowerShell helper (Windows only). Also
// updates process.env so the running bridge picks it up immediately.
function saveApiKey(provider, key) {
    if (!ENV_BY_PROVIDER[provider]) return { ok: false, error: "unknown_provider" };
    if (process.platform !== "win32") return { ok: false, error: "not_windows" };
    try {
        execFileSync("powershell.exe",
            ["-NoLogo", "-NoProfile", "-ExecutionPolicy", "Bypass",
             "-File", PS_HELPER, "-Save", "-Provider", provider, "-Secret", String(key)],
            { encoding: "utf8", windowsHide: true, timeout: 8000 });
        process.env[ENV_BY_PROVIDER[provider]] = String(key);
        return { ok: true, provider };
    } catch (e) {
        return { ok: false, error: (e?.message || String(e)).slice(0, 200) };
    }
}

// Masked status of all four providers (for the settings UI).
function keyStatus() {
    const out = {};
    for (const provider of Object.keys(ENV_BY_PROVIDER)) {
        const k = getApiKey(provider);
        out[provider] = k ? { set: true, len: k.length, tail: k.slice(-4) } : { set: false };
    }
    return out;
}
