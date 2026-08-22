// keepAwakeBridge.js — v1149
// Keep the machine awake while a long REMOTE job (a Kaggle 3D build) is in flight.
// The job itself runs on Kaggle's GPU, but THIS bridge has to stay alive to keep
// polling status and run the download → voxelize → ingest chain when it finishes —
// if the PC sleeps, that whole tail stalls until you come back and wake it. So we
// hold a system wake-lock for the duration and release it the moment the job ends.
//
// Windows : SetThreadExecutionState(ES_CONTINUOUS|ES_SYSTEM_REQUIRED|ES_AWAYMODE) via
//           a held PowerShell process (state persists while that thread lives).
// macOS   : `caffeinate -i` (prevent idle sleep) held for the duration.
// Config  : ~/.voxelbridge/keepawake.json { enabled } — default ON. Ref-counted so
//           overlapping jobs don't release each other early.

const { spawn } = require("child_process");
const fs = require("fs"), os = require("os"), path = require("path");

const CFG = path.join(os.homedir(), ".voxelbridge", "keepawake.json");
const supported = process.platform === "win32" || process.platform === "darwin";
let _proc = null, _reason = "", _holders = 0;

function _load() { try { return JSON.parse(fs.readFileSync(CFG, "utf8")); } catch { return {}; } }
function _save(o) { try { fs.mkdirSync(path.dirname(CFG), { recursive: true }); fs.writeFileSync(CFG, JSON.stringify(o)); } catch {} }
function isEnabled() { return _load().enabled !== false; }     // default true
function setEnabled(on) { const c = _load(); c.enabled = !!on; _save(c); if (!on) release(true); return { ok: true, enabled: c.enabled }; }

function _start() {
    if (_proc) return;
    try {
        if (process.platform === "win32") {
            // 0x80000041 = ES_CONTINUOUS | ES_SYSTEM_REQUIRED | ES_AWAYMODE_REQUIRED
            const ps = '$s=Add-Type -MemberDefinition \'[DllImport("kernel32.dll")] public static extern uint SetThreadExecutionState(uint e);\' -Name P -Namespace W -PassThru; while($true){ [void]$s::SetThreadExecutionState(0x80000041); Start-Sleep -Seconds 30 }';
            _proc = spawn("powershell", ["-NoProfile", "-NonInteractive", "-Command", ps], { windowsHide: true, stdio: "ignore" });
        } else if (process.platform === "darwin") {
            _proc = spawn("caffeinate", ["-i"], { stdio: "ignore" });
        }
        if (_proc) _proc.on("error", () => { _proc = null; });
    } catch (e) { console.warn("[keepAwake] start failed:", e.message); _proc = null; }
}

function acquire(reason) {
    if (!supported || !isEnabled()) return { ok: false, held: false, reason: "disabled or unsupported" };
    _holders++;
    _reason = reason || _reason || "long job";
    _start();
    if (_holders === 1 && _proc) console.log("[keepAwake] holding system awake —", _reason);
    return { ok: true, held: !!_proc, reason: _reason };
}

function release(force) {
    _holders = force ? 0 : Math.max(0, _holders - 1);
    if (_holders === 0 && _proc) {
        try { _proc.kill(); } catch {}
        _proc = null;
        console.log("[keepAwake] released — sleep allowed again");
        _reason = "";
    }
    return { ok: true, held: !!_proc };
}

function status() { return { ok: true, supported, enabled: isEnabled(), held: !!_proc, reason: _reason, holders: _holders, platform: process.platform }; }

module.exports = { acquire, release, status, isEnabled, setEnabled, supported };
