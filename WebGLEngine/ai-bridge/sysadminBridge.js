// sysadminBridge.js — Windows system helpers for the SweK Engine bridge.
// Three features, ALL Windows-only (no-ops elsewhere), ALL off by default, and
// NOTHING silent — every system change is explicit and (for the firewall) UAC-gated:
//   1) Firewall  — read status freely; "open the port" launches an elevated helper
//                  you approve. LAN + Tailscale need the inbound rule; Cloudflared
//                  needs nothing (it's an outbound tunnel proxying to localhost).
//   2) KeepAwake — hold SetThreadExecutionState so the PC won't sleep while on.
//   3) SelfUpdate— opt-in: poll the Downloads folder for a newer EngineProject_v###.zip,
//                  extract it to a NEW folder (never overwrites the running one), and
//                  launch it; the new launcher force-kills the old bun (your v1238 fix),
//                  so the old server is the fallback if the new one fails to bind.
"use strict";
const { exec, spawn } = require("child_process");
const fs = require("fs"), path = require("path"), os = require("os");
const { robustRemove } = require("./robustRemove.js");   // v2222 — Windows-robust folder delete (clears read-only + retries + shell fallback)
const launchGuard = require("./launchGuard.js");   // v2223 — machine-wide launch cooldown so relaunches can't storm/collide on :8787

const isWin = process.platform === "win32";
const isMac = process.platform === "darwin";
let log = () => {};
function setLogger(fn){ if (typeof fn === "function") log = fn; }

const CFG_PATH = path.join(os.homedir(), ".voxelbridge", "sysadmin.json");   // v1560 — persistent across self-updates
const LEGACY_CFG = path.join(__dirname, "sysadmin.json");                     // pre-v1560 in-tree path (lost on every update)
let cfg = {
    port: 8787,
    keepAwake: false,
    loginAutostart: false,   // v1506 — launch the engine when the user logs in (HKCU Run key)
    update: { enabled: false, oneTerminal: false, autoApply: true, autoFetch: false, autoPullPeers: true, bootScan: true, autoRemoveOld: false, pauseOnRustdesk: true, downloadsDir: "", targetDir: "", intervalMin: 10, versionPrefix: "SweK_Engine" },
};
function loadCfg(){
    function deepLoad(saved) {
        // v1800 — deep-merge the update sub-object so saved keys don't stomp defaults for missing keys
        if (saved && typeof saved.update === "object") {
            const defaults = cfg.update;
            cfg.update = Object.assign({}, defaults, saved.update);
            const rest = Object.assign({}, saved); delete rest.update;
            Object.assign(cfg, rest);
        } else {
            Object.assign(cfg, saved || {});
        }
    }
    try { deepLoad(JSON.parse(fs.readFileSync(CFG_PATH, "utf8"))); return; } catch {}
    // v1560 — one-time migrate a legacy in-tree sysadmin.json
    try { deepLoad(JSON.parse(fs.readFileSync(LEGACY_CFG, "utf8"))); saveCfg(); log("migrated legacy sysadmin.json -> " + CFG_PATH); } catch {}
}
function saveCfg(){ try { fs.mkdirSync(path.dirname(CFG_PATH), { recursive: true }); fs.writeFileSync(CFG_PATH, JSON.stringify(cfg, null, 2)); } catch (e){ log("cfg save failed:", e.message); } }
loadCfg();

function sh(cmd){ return new Promise(res => exec(cmd, { windowsHide: true, timeout: 20000 }, (e, so, se) => res({ ok: !e, out: (so || "") + (se || ""), err: e ? String(e.message) : null }))); }
function writeTemp(name, content){ const p = path.join(os.tmpdir(), name); fs.writeFileSync(p, content, "utf8"); return p; }
// launch a .ps1 elevated (UAC prompt). This is the deliberate "not automatic" gate.
function runElevated(ps1Path){ return sh(`powershell -NoProfile -Command "Start-Process powershell -Verb RunAs -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-File','${ps1Path}'"`); }

// ───────────────────────── (1) FIREWALL ─────────────────────────
const RULE = "SweK Engine Bridge";
async function firewallStatus(){
    if (!isWin) return { ok: true, win: false, note: "firewall control is Windows-only" };
    const prof = await sh("netsh advfirewall show allprofiles state");
    const rule = await sh(`powershell -NoProfile -Command "Get-NetFirewallRule -DisplayName '${RULE}' -ErrorAction SilentlyContinue | Select-Object -First 1 | ForEach-Object { $_.Enabled }"`);
    const ruleExists = /True|Enabled/i.test(rule.out);
    const firewallOn = /State\s+ON/i.test(prof.out);
    return { ok: true, win: true, port: cfg.port, ruleExists, firewallOn, profiles: (prof.out || "").trim().slice(0, 600) };
}
async function firewallAllow(){
    if (!isWin) return { ok: false, error: "Windows-only" };
    // Profile Any covers the Private (LAN) and Public profiles — Tailscale traffic
    // arrives on its own interface and is typically classified Public, so Any covers
    // both LAN server mode and Tailscale. Cloudflared needs no inbound rule at all.
    const script = [
        `$ErrorActionPreference='SilentlyContinue'`,
        `Remove-NetFirewallRule -DisplayName "${RULE}" -ErrorAction SilentlyContinue`,
        `New-NetFirewallRule -DisplayName "${RULE}" -Direction Inbound -Action Allow -Protocol TCP -LocalPort ${cfg.port} -Profile Any | Out-Null`,
        `Write-Output "Opened inbound TCP ${cfg.port} (LAN + Tailscale). Cloudflared needs no rule."`,
        `Start-Sleep -Seconds 2`,
    ].join("\r\n");
    const f = writeTemp("swek_fw_allow.ps1", script);
    const r = await runElevated(f);
    return { ok: r.ok, elevated: true, port: cfg.port, note: "approve the UAC prompt to open TCP " + cfg.port, err: r.err };
}
async function firewallRemove(){
    if (!isWin) return { ok: false, error: "Windows-only" };
    const f = writeTemp("swek_fw_remove.ps1", `Remove-NetFirewallRule -DisplayName "${RULE}" -ErrorAction SilentlyContinue; Write-Output "removed"; Start-Sleep -Seconds 1`);
    const r = await runElevated(f);
    return { ok: r.ok, elevated: true, note: "approve the UAC prompt to remove the rule", err: r.err };
}

// v1503 — go2rtc firewall. The Windows "allow access?" prompt is tied to the go2rtc.exe PATH, and
// that path changes every engine version (vendor/go2rtc inside EngineProject_vNNN) — so Windows
// re-asks on every update. A PORT-based rule is path-independent: approve ONCE and it sticks across
// versions. go2rtc listens on TCP 1984 (API/HTTP), 8554 (RTSP), 8555 (WebRTC) + UDP 8555 (WebRTC).
const GO2RTC_RULE = "SweK go2rtc";
async function go2rtcFirewallStatus(){
    if (!isWin) return { ok: true, win: false };
    const r = await sh(`powershell -NoProfile -Command "if(Get-NetFirewallRule -DisplayName '${GO2RTC_RULE}' -ErrorAction SilentlyContinue){'present'}else{'missing'}"`);
    return { ok: true, win: true, present: /present/.test(r.out) };
}
async function go2rtcFirewallAllow(){
    if (!isWin) return { ok: false, error: "Windows-only" };
    const script = [
        `$ErrorActionPreference='SilentlyContinue'`,
        `Remove-NetFirewallRule -DisplayName "${GO2RTC_RULE}" -ErrorAction SilentlyContinue`,
        `Remove-NetFirewallRule -DisplayName "${GO2RTC_RULE} UDP" -ErrorAction SilentlyContinue`,
        `New-NetFirewallRule -DisplayName "${GO2RTC_RULE}" -Direction Inbound -Action Allow -Protocol TCP -LocalPort 1984,8554,8555 -Profile Any | Out-Null`,
        `New-NetFirewallRule -DisplayName "${GO2RTC_RULE} UDP" -Direction Inbound -Action Allow -Protocol UDP -LocalPort 8555 -Profile Any | Out-Null`,
        `Write-Output "Opened go2rtc ports (TCP 1984/8554/8555 + UDP 8555). Path-independent, so it survives engine updates."`,
        `Start-Sleep -Seconds 2`,
    ].join("\r\n");
    const f = writeTemp("swek_go2rtc_fw.ps1", script);
    const r = await runElevated(f);
    return { ok: r.ok, elevated: true, note: "approve the UAC prompt once to open go2rtc's ports", err: r.err };
}

// ───────────────────── (1b) LAUNCH ON LOGIN ─────────────────────
// v1506 — per-user autostart (no admin): an HKCU\...\Run value pointing at THIS build's
// START_BUN_Full.bat. Re-asserted on boot so it follows the engine when it updates to a new folder.
const RUN_KEY = "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run";
const RUN_NAME = "SweK Engine";
function engineRootDir(){ return path.resolve(__dirname, "..", ".."); }   // ai-bridge -> WebGLEngine -> EngineProject_vNNN
// v1562 — Bun vs Node boot preference. The flag lives in ~/.voxelbridge (persists across updates);
// a legacy in-tree ai-bridge/use_bun.flag is also honored. Absent = Node. This drives EVERY relaunch
// (restart button, auto-update apply, login autostart) so the choice in Settings -> Runtime sticks.
function preferBun(){
    try { if (fs.existsSync(path.join(os.homedir(), ".voxelbridge", "use_bun.flag"))) return true; } catch {}
    try { if (fs.existsSync(path.join(__dirname, "use_bun.flag"))) return true; } catch {}
    return false;
}
// v3527 -- ONE DECLARATION OF "IS THE LISTENER RUNNING", REGISTERED RATHER THAN THREADED. updateCheck has TWO
// callers (the /sys/update/apply route and the auto-check timer) and passing the fact through both would be
// two places to forget it -- the second copy is never the one that gets updated. server.js owns the sentinel
// test (_kpopAlive) and registers it here ONCE at boot.
let _kpopProbe = null;
function setKpopProbe(fn){ _kpopProbe = (typeof fn === "function") ? fn : null; return !!_kpopProbe; }

function launcherName(){ return preferBun() ? "START_BUN_Full.bat" : "START_NODE_Engine.bat"; }
function launcherPath(){ return path.join(engineRootDir(), launcherName()); }
async function loginAutostartStatus(){
    if (isWin) {
        const r = await sh(`powershell -NoProfile -Command "(Get-ItemProperty -Path '${RUN_KEY}' -Name '${RUN_NAME}' -ErrorAction SilentlyContinue).'${RUN_NAME}'"`);
        const cur = (r.out || "").trim();
        return { ok: true, win: true, platform: "win32", enabled: !!cur, path: cur || null, launcher: launcherPath() };
    }
    if (isMac) {
        // per-user LaunchAgent — no admin. plist lives in ~/Library/LaunchAgents.
        const plist = _macPlistPath();
        const exists = fs.existsSync(plist);
        return { ok: true, win: false, mac: true, platform: "darwin", enabled: exists, path: exists ? plist : null, launcher: _macLauncherPath() };
    }
    return { ok: true, win: false, mac: false, platform: process.platform, enabled: false, note: "autostart supported on Windows + macOS" };
}
// ---- macOS LaunchAgent helpers (v1912) ----
function _macLauncherPath(){
    // prefer the .command (double-clickable + used by the relaunch path), else start-mac.sh
    const root = engineRootDir();
    const cmd = path.join(root, "Start Mac SweK Engine.command");
    if (fs.existsSync(cmd)) return cmd;
    const sh2 = path.join(root, "WebGLEngine", "start-mac.sh");
    if (fs.existsSync(sh2)) return sh2;
    return cmd;   // report the expected path even if missing
}
function _macPlistPath(){ return path.join(os.homedir(), "Library", "LaunchAgents", "com.swek.engine.plist"); }
async function loginAutostartSet(on){
    if (isWin){
        if (on){
            const lp = launcherPath();
            if (!fs.existsSync(lp)) return { ok: false, error: "launcher not found at " + lp };
            const val = ('"' + lp + '"').replace(/'/g, "''");
            const r = await sh(`powershell -NoProfile -Command "New-Item -Path '${RUN_KEY}' -Force | Out-Null; Set-ItemProperty -Path '${RUN_KEY}' -Name '${RUN_NAME}' -Value '${val}'"`);
            cfg.loginAutostart = true; saveCfg();
            return r.ok ? { ok: true, enabled: true, path: lp, note: "the engine will start when you log in" } : { ok: false, error: r.err || r.out };
        }
        const r = await sh(`powershell -NoProfile -Command "Remove-ItemProperty -Path '${RUN_KEY}' -Name '${RUN_NAME}' -ErrorAction SilentlyContinue"`);
        cfg.loginAutostart = false; saveCfg();
        return { ok: true, enabled: false, note: "autostart removed" };
    }
    if (isMac){
        const plist = _macPlistPath();
        if (on){
            const launcher = _macLauncherPath();
            if (!fs.existsSync(launcher)) return { ok: false, error: "mac launcher not found at " + launcher };
            // LaunchAgent that runs the launcher at login (RunAtLoad). KeepAlive off so a manual quit stays quit.
            const xml = [
                '<?xml version="1.0" encoding="UTF-8"?>',
                '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">',
                '<plist version="1.0"><dict>',
                '  <key>Label</key><string>com.swek.engine</string>',
                '  <key>ProgramArguments</key><array>',
                '    <string>/bin/bash</string>',
                '    <string>' + launcher.replace(/&/g, "&amp;").replace(/</g, "&lt;") + '</string>',
                '  </array>',
                '  <key>RunAtLoad</key><true/>',
                '  <key>ProcessType</key><string>Background</string>',
                '</dict></plist>',
            ].join("\n");
            try {
                fs.mkdirSync(path.dirname(plist), { recursive: true });
                fs.writeFileSync(plist, xml, "utf8");
                await sh(`launchctl unload "${plist}" 2>/dev/null; launchctl load "${plist}"`);
                cfg.loginAutostart = true; saveCfg();
                return { ok: true, enabled: true, path: plist, note: "the engine will start when you log in (LaunchAgent)" };
            } catch (e) { return { ok: false, error: String(e && e.message || e) }; }
        }
        try { await sh(`launchctl unload "${plist}" 2>/dev/null`); if (fs.existsSync(plist)) fs.unlinkSync(plist); } catch {}
        cfg.loginAutostart = false; saveCfg();
        return { ok: true, enabled: false, note: "autostart removed" };
    }
    return { ok: false, error: "autostart is supported on Windows + macOS" };
}

// ───────────────────────── (2) KEEP-AWAKE ─────────────────────────
let awakeProc = null;
function keepAwakeState(){ return { ok: true, win: isWin, awake: !!awakeProc }; }
function keepAwake(on){
    if (!isWin) return { ok: true, win: false, awake: false, note: "Windows-only" };
    if (on){
        if (awakeProc) return { ok: true, awake: true, note: "already keeping awake" };
        // ES_CONTINUOUS(0x80000000) | ES_SYSTEM_REQUIRED(0x1) — prevent system sleep
        // (display is left to its own timeout). Re-asserted every 50s; releasing is
        // automatic when this helper process exits (state is per-thread).
        const script = [
            `$sig='[DllImport("kernel32.dll")] public static extern uint SetThreadExecutionState(uint esFlags);'`,
            `$p=Add-Type -MemberDefinition $sig -Name Pwr -Namespace W32 -PassThru`,
            `while($true){ $p::SetThreadExecutionState([uint32]2147483649); Start-Sleep -Seconds 50 }`,
        ].join("\r\n");
        const f = writeTemp("swek_keepawake.ps1", script);
        try {
            awakeProc = spawn("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-WindowStyle", "Hidden", "-File", f], { windowsHide: true });
            awakeProc.on("exit", () => { awakeProc = null; });
        } catch (e){ return { ok: false, error: e.message }; }
        cfg.keepAwake = true; saveCfg();
        log("keep-awake ON (system sleep prevented)");
        return { ok: true, awake: true, note: "system sleep prevented while the bridge runs" };
    }
    if (awakeProc){ try { awakeProc.kill(); } catch {} awakeProc = null; }
    cfg.keepAwake = false; saveCfg();
    log("keep-awake OFF");
    return { ok: true, awake: false, note: "normal sleep restored" };
}

// ───────────────────────── (3) SELF-UPDATE ─────────────────────────
let lastFound = 0, lastNote = "", updTimer = null, _nextCheckAt = 0;   // v1578 — _nextCheckAt: when the poller next fires (for the server.html countdown)
// v1506 — read the BUILD's stamped version (authoritative + folder-name-independent). The old
// folder-name parse looped: if the running copy's folder wasn't named EngineProject_vNNN exactly
// (a manual extract / rename), it read as 0 and EVERY same-version zip looked "newer than 0",
// so auto-update re-installed forever. main.js is stamped per build, so it can't drift.
function currentVersion(){
    try { const m = fs.readFileSync(path.join(__dirname, "..", "main.js"), "utf8").match(/ENGINE_VERSION\s*=\s*"v(\d+)"/); if (m) return parseInt(m[1], 10); } catch {}
    const name = path.basename(path.resolve(__dirname, "..", ".."));   // the version folder, any prefix
    const m2 = name.match(/[ _]v(\d+)$/i); return m2 ? parseInt(m2[1], 10) : 0;
}

// v2286 — the version-folder scheme is now <prefix>_v<NNNN> for ANY prefix (default "SweK_Engine", but a user
// can set their own, e.g. "Jons_Canoe_on_Waterfall_Game"). These helpers keep the updater prefix-agnostic so a
// rename can never break auto-apply again.
function _runningVersionFolder(){ return path.basename(path.resolve(__dirname, "..", "..")); }   // "SweK_Engine_v2284"
function _prefixOf(nameOrZip){ const m = String(nameOrZip).replace(/\.zip$/i, "").match(/^(.*?)[ _]v\d+$/i); return m ? m[1] : null; }
function preferredPrefix(){ return ((cfg.update.versionPrefix || "").trim() || _prefixOf(_runningVersionFolder()) || "SweK_Engine"); }
// match a version zip/folder: the built-in names + the user's configured prefix (escaped), so a stray zip in
// Downloads is never mistaken for a build.
// *** v3921 -- THE BROWSER RENAMES THE SECOND DOWNLOAD AND THE SCANNER STOPPED SEEING IT. ***
//
// Keith: "when I had tried to autoupdate the new version in downloads, it wasn't reported as update so I
// extracted it and ran swek." The zip was ROOTED CORRECTLY and NAMED CORRECTLY -- and every browser on every
// platform appends a disambiguator when a file of that name is already there. MEASURED against this regex:
//
//     SweK_Engine_v3918.zip            MATCH
//     SweK_Engine_v3918 (1).zip        MISS      <- Chrome, Edge, Firefox on a second download
//     SweK_Engine_v3918(1).zip         MISS
//     SweK_Engine_v3918-1.zip          MISS
//     SweK_Engine_v3918 copy.zip       MISS      <- macOS Finder duplicate
//     9e6077e1-SweK_Engine_v3918.zip   MATCH     (the pattern is unanchored, so a prefix was always fine)
//
// A SUFFIX BREAKS IT AND A PREFIX DOES NOT, because the version group is followed immediately by \.zip$. The
// asymmetry is the whole bug: nobody prefixes a download and every browser suffixes one.
//
// COPY_SUFFIX is deliberately NARROW. The partial-download extensions live in PARTIAL_SUFFIXES and are scanned
// SEPARATELY on purpose -- "nothing downstream may ever hand a partial file to the installer" -- so this must
// never grow to admit them. It matches only what a file manager adds to disambiguate a COMPLETED file.
// THERE WERE FOUR COPIES OF THIS PATTERN AND ONLY ONE OF THEM WAS THE BUILDER. _zipForVersionInDownloads (the
// prune safety net), _scanEngineParentZips and patchScan's isBuild each spelled it out inline with the same
// \.zip$ glued to the version, so widening the builder alone would have fixed the scanner and left three
// siblings blind -- which is v3919's "there is one table" arriving again in a different file, one round later.
// All four now come from _versionRe. The prune path keeps its START ANCHOR on purpose: it authorises a
// DELETION, and a stricter match there fails toward not deleting.
const COPY_SUFFIX = "(?:\\s*\\(\\d+\\)|\\s*-\\s*\\d+|\\s+copy(?:\\s*\\d+)?)?";
function _versionRe(anchorStart, suffix){
    const names = ["EngineProject", "SweK[ _]Engine"];
    const p = (cfg.update.versionPrefix || "").trim();
    if (p && !/^(EngineProject|SweK)$/i.test(p) && !/^SweK[ _]Engine$/i.test(p)) names.push(p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    return new RegExp((anchorStart ? "^" : "") + "(?:" + names.join("|") + ")[ _]v(\\d+)" + (suffix ? COPY_SUFFIX + suffix : ""), "i");
}

// *** AND A SILENT "no update" IS THE THING THAT MADE THIS TAKE A ROUND TO FIND. *** The status said nothing
// except that there was nothing, which is indistinguishable from an empty folder, a wrong folder, a partial
// download and a name the pattern cannot read. Every zip in the scanned directory that this scanner DECLINED is
// now reported with the reason, so the next miss is answerable from the status instead of from the source.
function scanDownloadsRejects(){
    const out = []; const dir = downloadsDir(); const re = _versionRe(false, "\\.zip$");
    try {
        for (const f of fs.readdirSync(dir)){
            if (re.test(f)) continue;
            if (!/\.zip(\.\w+)?$/i.test(f)) continue;
            let why = "no <prefix>_vNNNN before the extension";
            if (/\.zip\.\w+$/i.test(f)) why = "still downloading (partial suffix) -- reported separately, never installed";
            else if (/v\d+/i.test(f)) why = "has a version but the name around it does not match the prefix pattern";
            out.push({ file: f, why });
        }
    } catch { /* unreadable directory is reported by downloadsDir itself */ }
    return out.slice(0, 20);
}

// where a new version should land: the PARENT of the running <prefix>_vNNNN folder (so it extracts beside the
// current one), prefix-agnostic. Falls back to config/target.
function engineParentDir(){
    const vf = path.resolve(__dirname, "..", "..").replace(/\\/g, "/");
    const name = vf.split("/").pop();
    if (/[ _]v\d+$/i.test(name)) return path.normalize(vf.replace(/\/[^/]+$/, ""));
    return cfg.update.targetDir || (isWin ? "C:\\" : os.homedir());
}
// v3054 -- A DOWNLOAD IN FLIGHT IS NOT AN ABSENT DOWNLOAD.
//
// Chrome writes <name>.zip.crdownload and renames to .zip only once the transfer is fully resolved -- including
// any "keep this file" safety hold, which macOS Chrome applies far more often than Windows. This scan required
// \.zip$, so a newer build being fetched right now was INVISIBLE, and the panel reported the newest COMPLETE zip
// with "(not newer)". Every word of that was true and the whole sentence was misleading: it answered "what is
// the newest finished file" while the reader was asking "is a new version here yet".
//
// Keith hit exactly this: clicked check, got "Downloads has v3052 (not newer)" while v3053 was mid-flight in the
// same folder, and reasonably concluded the Mac was reading the wrong directory. It was reading the right one.
// The auto-poller found it minutes later purely because the rename had happened by then.
//
// scanDownloads() still returns ONLY completed zips -- nothing downstream may ever hand a partial file to the
// installer. The in-flight version is reported SEPARATELY so the UI can say "v3053 still downloading" instead of
// a true-but-useless "not newer". Keeping them apart is the point: one is a file you can install, the other is a
// fact about the world.
const PARTIAL_SUFFIXES = ["\\.crdownload", "\\.part", "\\.download", "\\.opdownload"];

function scanDownloads(){
    let best = null; const dir = downloadsDir(); const re = _versionRe(false, "\\.zip$");
    try { for (const f of fs.readdirSync(dir)){ const m = f.match(re); if (m){ const v = parseInt(m[1], 10); if (!best || v > best.v) best = { v, file: path.join(dir, f) }; } } } catch {}
    return best;
}

// The newest version whose zip is still ARRIVING. Returns { v, file } or null. Never fed to the installer.
function scanDownloadsPartial(){
    let best = null; const dir = downloadsDir();
    const re = _versionRe(false, "\\.zip(?:" + PARTIAL_SUFFIXES.join("|") + ")$");
    try { for (const f of fs.readdirSync(dir)){ const m = f.match(re); if (m){ const v = parseInt(m[1], 10); if (!best || v > best.v) best = { v, file: path.join(dir, f) }; } } } catch {}
    return best;
}
// v1532 — free disk bytes on the volume holding `dir` (fail-open on old runtimes).
function _freeBytes(dir){ try { if (typeof fs.statfsSync !== "function") return Infinity; const s = fs.statfsSync(dir); return (s.bavail != null ? s.bavail : s.bfree) * s.bsize; } catch { return Infinity; } }
const ENGINE_DISK_MARGIN = 128 * 1024 * 1024;   // keep >=128MB free after landing an engine zip
// v1532 — peer auto-pull bookkeeping so we don't re-download the same version on
// every discovery tick. Cleared once currentVersion catches up (after apply+restart).
let _lastPeerPull = null;   // { version, url, at }
function downloadsDir(){ return cfg.update.downloadsDir || path.join(os.homedir(), "Downloads"); }

// v1631 — opt-in housekeeping. Once a newer build supersedes an older one, the old EngineProject_vNNN
// FOLDER is dead weight IF its zip is still in Downloads (you can always re-extract from the zip). With
// autoRemoveOld on, those old folders are deleted on boot. Deliberately paranoid about what it will touch:
//   - exact "EngineProject_vNNN" folder names only (a stray rename or unrelated folder is never matched)
//   - strictly OLDER than the running build's stamped version
//   - never the folder this process is running from
//   - ONLY when the matching EngineProject_vNNN.zip is present in Downloads (the zip is the safety net)
// Anything failing a check is reported, not removed.
let _lastPrune = null;
function _zipForVersionInDownloads(v){
    try { const dir = downloadsDir(); for (const f of fs.readdirSync(dir)){ const m = f.match(_versionRe(true, "\\.zip$")); if (m && parseInt(m[1], 10) === v) return path.join(dir, f); } } catch {}
    return null;
}
function _oldVersionFolders(){
    const cur = currentVersion();
    const running = path.resolve(engineRootDir());
    const out = []; const seen = new Set();
    for (const base of [engineParentDir(), downloadsDir()]){
        let names = []; try { names = fs.readdirSync(base); } catch { continue; }
        for (const name of names){
            const m = name.match(_versionRe(true, "$")); if (!m) continue;
            const full = path.resolve(path.join(base, name));
            if (seen.has(full)) continue; seen.add(full);
            const v = parseInt(m[1], 10);
            let isDir = false; try { isDir = fs.statSync(full).isDirectory(); } catch {}
            let reason = "";
            if (!isDir) reason = "not a directory";
            else if (v >= cur) reason = "not older than running v" + cur;
            else if (full === running) reason = "this is the running folder";
            else if (!_zipForVersionInDownloads(v)) reason = "no matching zip in Downloads";
            out.push({ v, path: full, eligible: !reason, reason });
        }
    }
    return { current: cur, running, folders: out };
}
const _heldMemo = new Map();   // v3406 -- path -> { mtimeMs, error, at }: a folder held open, and the state it was held in
function pruneOldVersions(opts){
    opts = opts || {};
    const scan = _oldVersionFolders();
    const eligible = scan.folders.filter(f => f.eligible);
    const skipped = scan.folders.filter(f => !f.eligible).map(f => ({ v: f.v, path: f.path, reason: f.reason }));
    if (!opts.apply) return { ok: true, dryRun: true, current: scan.current, candidates: eligible.map(f => ({ v: f.v, path: f.path })), skipped };
    const removed = [], failed = [], deferred = [], held = [];
    for (const f of eligible){
        // v3406 -- *** (2) A FOLDER THAT IS HELD IS RE-ATTEMPTED EVERY BOOT AT FULL COST, AND FAILS IDENTICALLY.
        // *** Keith's logs show C:\Intel\SweK_Engine_v3286 EBUSY on EVERY boot he has sent -- so the whole
        // expensive dance (recursive chmod, recursive unlink, six retries, then a 20-second `rmdir /s /q`) runs,
        // fails, and runs again forever, on a folder something is permanently holding open.
        //
        // THE MEMO IS KEYED ON WHAT WOULD MAKE THE ANSWER DIFFERENT: the folder's own mtime. If nothing inside
        // has changed since the attempt that failed, NOTHING CAN HAVE RELEASED IT in a way this would notice, so
        // asking again buys nothing. If the mtime moves -- a process let go, a file was written -- the memo is
        // stale by construction and the attempt runs. NOT A PERMANENT SKIP LIST: `_heldMemo.clear()` or a touch
        // of the folder re-opens it, and the count is reported so a held folder is VISIBLE rather than silent.
        try {
            const st = fs.statSync(f.path);
            const memo = _heldMemo.get(f.path);
            if (memo && memo.mtimeMs === st.mtimeMs) {
                held.push({ path: f.path, error: memo.error, since: memo.at });
                continue;
            }
        } catch { /* cannot stat -> fall through and let the remover decide */ }
        // v2222 — the old fs.rmSync({recursive,force}) threw EPERM on Windows read-only trees (force
        // does NOT clear the read-only attribute) and never retried a transient Defender/indexer lock.
        // robustRemove walks depth-first, makes each entry writable first, retries the retryable codes,
        // and as a last resort hands a stubborn folder to `rmdir /s /q`.
        const r = robustRemove(f.path, { retries: 6, delayMs: 150, winFallback: true, log });
        if (r.ok){ removed.push(f.path); log("auto-removed old version folder (its zip is still in Downloads):", f.path + (r.fellBackToShell ? " [via rmdir /s /q]" : "")); }
        else {
            const why = (r.failed && r.failed.length) ? (r.failed[0].error + " on " + r.failed[0].path) : "still present after retries";
            failed.push({ path: f.path, error: why });
            try { _heldMemo.set(f.path, { mtimeMs: fs.statSync(f.path).mtimeMs, error: why, at: Date.now() }); } catch {}
            log("could NOT remove", f.path, "-", why, "(read-only cleared + retried" + (process.platform === "win32" ? " + rmdir /s /q fallback" : "") + "; if it still won't go, a live process is holding a handle inside it)");
        }
    }
    if (held.length) log("autoRemoveOld: " + held.length + " folder(s) SKIPPED -- held by a live process and unchanged since the last attempt (" +
        held.map(h => h.path.split(/[\\/]/).pop()).join(", ") + "). They are retried the moment anything inside them changes.");
    _lastPrune = { at: Date.now(), removed, failed, held, deferred, current: scan.current };
    return { ok: true, current: scan.current, removed, failed, held, deferred, skipped };
}
// v3457 -- PARTIAL DOWNLOADS ARE SWEPT BY THE SAME DOOR THAT PRUNES OLD VERSIONS, not by a second cleaner.
// Keith: "we need to remove these partial files we are sometimes trailing" (EngineProject_v3455.zip.part).
//
// THE DECISION LIVES IN ai-bridge/partialSweep.mjs AND IS FIXTURE-GATED; only the walk and the removal are here,
// beside robustRemove which already owns the retries, the read-only clearing and the Windows rmdir fallback.
// *** THE HARD PART IS NOT FINDING THEM, IT IS NOT DELETING A LIVE ONE: write-then-rename means a transfer in
// flight IS a .part, and a sweep matching the suffix alone would break the very transfers the idiom protects.
// Age is the only cheap evidence and the default is deliberately generous. ***
//
// DRY RUN BY DEFAULT, like pruneOldVersions above -- a cleanup whose default is to delete is a cleanup somebody
// runs once by accident.
async function prunePartials(opts){
    opts = opts || {};
    const { stalePartials, reclaimable, PARTIAL_RE } = await import("./partialSweep.mjs");
    const entries = [];
    for (const base of [engineParentDir(), downloadsDir()]){
        let names = []; try { names = fs.readdirSync(base); } catch { continue; }
        for (const name of names){
            if (!PARTIAL_RE.test(name)) continue;
            const full = path.resolve(path.join(base, name));
            try { const st = fs.statSync(full); if (st.isFile()) entries.push({ path: full, mtimeMs: st.mtimeMs, bytes: st.size }); }
            catch { /* vanished between readdir and stat -- that is fine, it is gone */ }
        }
    }
    const { sweep, keep } = stalePartials(entries, { minAgeMs: opts.minAgeMs });
    const bytes = reclaimable(sweep);
    if (!opts.apply) return { ok: true, dryRun: true, candidates: sweep, kept: keep, bytes };

    const removed = [], failed = [];
    for (const f of sweep){
        const r = robustRemove(f.path, { retries: 4, delayMs: 150, winFallback: true, log });
        if (r.ok) { removed.push(f.path); log("swept partial download:", f.path, "(" + f.reason + ")"); }
        else failed.push({ path: f.path, error: (r.failed && r.failed[0] && r.failed[0].error) || "still present after retries" });
    }
    return { ok: true, removed, failed, kept: keep, bytes };
}

async function updateCheck(apply, opts){
    opts = opts || {}; const silent = !!opts.silent;   // v2229 — auto-applies pass silent:true (minimized relaunch + quiet flag); manual stays loud
    const u = cfg.update, cur = currentVersion();
    // v1498 — the SCAN + report (and an explicit apply) work regardless of u.enabled; the
    // `enabled` flag only governs the silent auto-poller (startUpdatePoller). So the client can
    // always check + offer a one-click install even with auto-update left off.
    const found = scanDownloads();
    // v3054 -- an in-flight newer zip is reported alongside, never instead. It is a fact about the folder, not a
    // file anyone may install, so it never becomes `found`.
    const partial = scanDownloadsPartial();
    const arriving = (partial && partial.v > cur && (!found || partial.v > found.v)) ? partial.v : null;
    const base = { ok: true, enabled: u.enabled, autoApply: u.autoApply, current: cur, downloadsDir: downloadsDir(), arriving };
    if (!found){
        lastNote = arriving ? ("v" + arriving + " is still downloading into " + downloadsDir()) : ("no version zip in " + downloadsDir());
        return { ...base, note: lastNote };
    }
    lastFound = found.v;
    if (found.v <= cur){
        // Say the ARRIVING version first when there is one. "up to date" is the answer to a question nobody asked
        // while a newer build is landing in the same folder.
        lastNote = arriving
            ? ("v" + arriving + " is still downloading (have v" + cur + "; newest complete zip v" + found.v + ")")
            : ("up to date (have v" + cur + ", newest in Downloads v" + found.v + ")");
        return { ...base, found: found.v, updateAvailable: false, note: lastNote };
    }
    if (!apply){ lastNote = "v" + found.v + " available in Downloads (current v" + cur + ")"; return { ...base, found: found.v, updateAvailable: true, note: lastNote }; }
    if (!isWin && !isMac) return { ok: false, error: "apply is Windows/macOS-only" };
    // v2223 — LAUNCH COOLDOWN. The window-storm was auto-apply spawning a new launcher whose bridge
    // dies on EADDRINUSE (:8787 still held by the old server), over and over. If a relaunch fired
    // recently, do NOT spawn another one -- one handoff at a time. Mark the launch up front so a
    // second concurrent apply is suppressed too.
    if (launchGuard.shouldSuppress()) {
        lastNote = "launch of v" + found.v + " suppressed \u2014 a relaunch fired " + Math.round(launchGuard.lockAgeMs() / 1000) + "s ago (avoiding a port-8787 collision storm; retries after the cooldown)";
        log(lastNote);
        return { ok: true, skipped: true, suppressed: true, version: found.v, current: cur, note: lastNote };
    }
    launchGuard.markLaunch(found.v);
    // APPLY: extract beside the current folder, then name the result <preferredPrefix>_vNNNN. The zip's own top
    // folder (zipRoot) may differ from the preferred prefix (e.g. a "SweK_Engine_vNNNN.zip" downloaded onto a box
    // that prefers "Jons_Canoe"); we extract then rename so the folder always matches the prefix.
    // v2286 — prefix-agnostic so renaming the scheme can never break auto-apply again.
    const tgt = (cfg.update.targetDir && cfg.update.targetDir !== "C:\\") ? cfg.update.targetDir : engineParentDir();
    const zipRoot = path.basename(found.file).replace(/\.zip$/i, "");   // the zip's actual top folder
    let folder = path.join(tgt, preferredPrefix() + "_v" + found.v);
    // Extract: tar (bsdtar, Win10+) is FAR faster than Expand-Archive on a big multi-file zip and
    // won't blow the 20s sh() timeout that was killing the old path. Fall back to Expand-Archive
    // with a long timeout. If the launcher already exists afterward, proceed even on a warning.
    const cp = require("child_process");
    const _execFileAsync = (cmd, args, o) => new Promise((res, rej) => cp.execFile(cmd, args, o, (e) => e ? rej(e) : res()));
    let exErr = "";
    // v3280 — was execFileSync: extracting a full engine zip synchronously blocked the event loop for
    // as long as it took (the blame profiler caught ~26s in one updatePoller tick). The apply still
    // proceeds in order via await, but the loop keeps serving during the extract.
    try { await _execFileAsync("tar", ["-xf", found.file, "-C", tgt], { windowsHide: true, timeout: 300000, stdio: "ignore" }); }
    catch (e1) {
        exErr = "tar: " + ((e1 && e1.message) || e1);
        try { await _execFileAsync("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command",
                "Expand-Archive -LiteralPath '" + found.file.replace(/'/g, "''") + "' -DestinationPath '" + tgt.replace(/'/g, "''") + "' -Force"],
                { windowsHide: true, timeout: 300000, stdio: "ignore" }); }
        catch (e2) { exErr += " | expand-archive: " + ((e2 && e2.message) || e2); }
    }
    // The zip extracted somewhere under tgt; its top folder may NOT match the zip's FILENAME (peer-pulled saves
    // are renamed to a normalized EngineProject_vN.zip while the real root is <prefix>_vN). So FIND the folder it
    // produced -- a fresh <anything>_v<found.v> dir that contains WebGLEngine -- then rename it to our prefix.
    let extractedPath = path.join(tgt, zipRoot);
    if (!fs.existsSync(path.join(extractedPath, "WebGLEngine"))) {
        try { for (const n of fs.readdirSync(tgt)) { const mm = n.match(/[ _]v(\d+)$/i); if (mm && parseInt(mm[1], 10) === found.v && fs.existsSync(path.join(tgt, n, "WebGLEngine"))) { extractedPath = path.join(tgt, n); break; } } } catch {}
    }
    if (path.normalize(extractedPath) !== path.normalize(folder)) {
        try { if (!fs.existsSync(folder) && fs.existsSync(extractedPath)) fs.renameSync(extractedPath, folder); }
        catch (e) { exErr += " | rename: " + ((e && e.message) || e); }
        if (!fs.existsSync(path.join(folder, "WebGLEngine")) && fs.existsSync(extractedPath)) folder = extractedPath;   // fall back to the extracted name
    }
    const bat = path.join(folder, launcherName());
    if (!fs.existsSync(bat)) return { ok: false, error: "extract did not produce the launcher" + (exErr ? " (" + exErr + ")" : " at " + bat) };
    // v1503 — the shipped zip strips node_modules (keeps it ~8MB), so a fresh copy would have to
    // `bun install` on first launch — and that fresh install (native/postinstall deps like
    // discord.js, libsodium, ffmpeg-static, node-unrar-js) is exactly where Bun was erroring with
    // no Node fallback, leaving a dead window. Copy our KNOWN-GOOD node_modules into the new copy
    // so its launcher skips install and starts with proven deps.
    try {
        const srcNM = path.join(__dirname, "node_modules");
        const dstNM = path.join(folder, "WebGLEngine", "ai-bridge", "node_modules");
        if (fs.existsSync(srcNM) && !fs.existsSync(dstNM)) {
            // robocopy is fast + handles long paths; it exits 1-7 on SUCCESS (throws here), so we
            // judge success by whether the destination got populated, then fall back to fs.cpSync.
            try { cp.execFileSync("robocopy", [srcNM, dstNM, "/E", "/NFL", "/NDL", "/NJH", "/NJS", "/NC", "/NS", "/MT:8"], { windowsHide: true, timeout: 300000 }); } catch {}
            if (!fs.existsSync(dstNM)) { try { fs.cpSync(srcNM, dstNM, { recursive: true }); } catch {} }
            log(fs.existsSync(dstNM) ? "copied node_modules into v" + found.v + " (skips first-run install)" : "WARN: could not pre-copy node_modules; the new launcher will bun-install");
        }
    } catch {}
    // v2241 — carry the render-qa harness's node_modules forward too, so a one-time `npm install` in
    // tools/render-qa SURVIVES auto-updates instead of reverting to "not installed" every version. The
    // update only copied ai-bridge/node_modules before, so render-qa's install was silently lost each
    // update. (Playwright's Chromium lives in a user-level cache already shared across versions.)
    try {
        const srcQA = path.join(__dirname, "..", "tools", "render-qa", "node_modules");
        const dstQA = path.join(folder, "WebGLEngine", "tools", "render-qa", "node_modules");
        if (fs.existsSync(srcQA) && !fs.existsSync(dstQA)) {
            try { cp.execFileSync("robocopy", [srcQA, dstQA, "/E", "/NFL", "/NDL", "/NJH", "/NJS", "/NC", "/NS", "/MT:8"], { windowsHide: true, timeout: 300000 }); } catch {}
            if (!fs.existsSync(dstQA)) { try { fs.cpSync(srcQA, dstQA, { recursive: true }); } catch {} }
            log(fs.existsSync(dstQA) ? "copied render-qa node_modules into v" + found.v + " (render-qa stays installed)" : "note: render-qa node_modules not carried forward; re-run its install if needed");
        }
    } catch {}
    // v1507 — tell the OLD console window to exit quietly (not hang on the error prompt) and the
    // NEW launcher to skip opening a duplicate browser tab; the existing page reloads onto the new build.
    // v2418 -- the flag now carries the NEW build's folder (it used to be "1"). Existence checks still pass, so
    // nothing that reads it breaks; a supervisor launcher can now exec straight into the new version (one window).
// v3250 -- THE AGE OF THIS FLAG IS WHAT MATTERS, AND mtime ALREADY CARRIES IT.
// swek_exit_report.bat reads this file and, if it merely EXISTS, closes the launcher window WITHOUT PAUSING on
// the grounds that "an auto-update replaced this instance" -- the only branch in that file that does not pause,
// so THE LEAST VERIFIABLE SIGNAL SILENCED THE MOST USEFUL OUTPUT. %TEMP% survives reboots, so a flag left by an
// update that did not finish its handoff made EVERY later launch claim the new build was already running, exit
// 0, and vanish -- on every version, because the flag is in %TEMP% and not in the folder.
//
// *** I STARTED TO STAMP THE CONTENTS AND THAT WOULD HAVE BEEN A FOURTH MECHANISM BESIDE TWO CORRECT ONES. ***
// SweK_Run.bat line 47 and server.js line 1292 BOTH already judge this flag by LastWriteTime/mtime, and both
// already use 90 SECONDS. The fix belonged in the one reader that was not asking.
    try { fs.writeFileSync(path.join(os.tmpdir(), "swek_superseded.flag"), String(folder)); } catch {}
    // v3527 -- RECORD WHETHER THE KPOP LISTENER WAS RUNNING, BECAUSE THE SUCCESSOR CANNOT ASK AFTERWARDS.
    // launcherName() starts THE ENGINE ONLY, so an auto-update has never restarted the listener; the two
    // places that do start it are a double-click (Start_Everything.bat) and a button (POST /kpop/launch).
    // The successor restores it ONLY IF THIS MACHINE ALREADY HAD IT -- an update restores state, it does not
    // choose it -- and the one moment that fact is knowable is HERE, before this process steps aside.
    // Liveness comes from the caller so this file holds no second copy of what "running" means.
    try { require("./kpopHandoff.js").recordBeforeHandoff(!!(_kpopProbe && _kpopProbe())); } catch {}
    if (silent) { try { fs.writeFileSync(path.join(os.tmpdir(), "swek_silent.flag"), "1"); } catch {} }   // v2229 — start the new build minimized/quiet
    if (isMac) {
        // macOS: open the NEW build's launcher (a fresh Terminal runs its bridge). It frees :8787
        // before binding; we step aside after a beat so the port is clear. Old server is the fallback.
        if (process.env.SWEK_SUPERVISOR === "1") {
            // v2418 -- running under swek-run.sh: no new Terminal. Write the marker, step aside, and the supervisor
            // REPLACES itself with the new build's script (exec) -- one window, the old process simply becomes the new.
            lastNote = "handoff to v" + found.v + " (supervisor, same window)";
            log(lastNote); setTimeout(() => process.exit(0), 800);
            return { ok: true, launched: true, version: found.v, folder, note: lastNote, supervisor: true };
        }
        try {
            const cmd = path.join(folder, "Start Mac SweK Engine.command");
            try { fs.chmodSync(cmd, 0o755); } catch {}   // extracted zips can drop the +x bit
            // v1544 — strip the com.apple.quarantine xattr so Gatekeeper doesn't block the unsigned
            // .command ("cannot be opened because it is from an unidentified developer"). We extracted
            // this build ourselves from a trusted LAN peer, so de-quarantining the new folder is safe.
            try { cp.execFileSync("xattr", ["-dr", "com.apple.quarantine", folder], { timeout: 30000, stdio: "ignore" }); } catch {}
            const c = spawn("open", [cmd], { detached: true, stdio: "ignore" }); c.unref();
        } catch (e){ return { ok: false, error: "launch failed: " + e.message + " (old server still running)" }; }
        lastNote = "launched v" + found.v + " from " + folder;
        log(lastNote + " — this (old) server will exit so the new one can bind 8787");
        setTimeout(() => process.exit(0), 1500);
        return { ok: true, launched: true, version: found.v, folder, note: lastNote };
    }
    try {
        // v2229 — a SILENT auto-update launches the new window MINIMIZED (start /MIN) and drops a
        // swek_silent.flag the machine's launcher/KPopListener can read to start quiet. The SweK window
        // is minimized either way; the KPop side needs the launcher to honour the flag (it's machine-side).
        if (silent) { try { fs.writeFileSync(path.join(os.tmpdir(), "swek_silent.flag"), "1"); } catch {} }
        const startArgs = silent
            ? ["/c", "start", "", "/MIN", "/d", folder, launcherName()]
            : ["/c", "start", "", "/d", folder, launcherName()];
        const child = spawn("cmd", startArgs, { detached: true, windowsHide: false, stdio: "ignore" });
        child.unref();
    } catch (e){ return { ok: false, error: "launch failed: " + e.message + " (old server still running)" }; }
    lastNote = "launched v" + found.v + " from " + folder + (silent ? " (silent)" : "");
    // v3522 -- THE OLD MESSAGE WAS NOT WRONG, IT WAS UNVERIFIABLE, AND KEITH'S LOG IS 21 HOURS OF IT. This
    // process does NOT exit here and that is correct: portHandoff (v2224) makes the SUCCESSOR take the port --
    // it waits on EADDRINUSE and after 8s frees the port itself -- so the old server holding on is what
    // guarantees there is never a moment with no server at all. What was missing is any way to find out
    // whether the successor got far enough to try. It now says so on disk and we read it back.
    log(lastNote + " — the successor takes :" + (process.env.PORT || 8787) + " (portHandoff v2224); watching for it");
    const _launchedAt = Date.now();
    setTimeout(() => {
        let v = null;
        try { v = require("./bootTrace.js").classify(folder, _launchedAt); } catch (e) { v = null; }
        if (!v) { log("[handoff] could not read the boot trace — verdict unknown"); return; }
        if (v.state === "BOUND")  { log("[handoff] v" + found.v + " IS SERVING — " + v.detail); return; }
        if (v.state === "BOOTED") {
            // node ran and never bound: the port fight is the problem, not the launcher.
            log("[handoff] v" + found.v + " STARTED BUT NEVER BOUND — " + v.detail +
                ". This one is portHandoff's escalation or a different PORT, NOT a launcher failure.");
            return;
        }
        // Nothing from that folder reported starting at all.
        log("[handoff] v" + found.v + " NEVER STARTED — " + v.detail +
            ". node did not run from that folder, so nothing could take the port and this server will keep " +
            "serving. The launcher, not the port, is the thing to look at.");
    }, 30000);
    return { ok: true, launched: true, version: found.v, folder, note: lastNote };
}
// v3070 -- `found` IS WHAT THE SCAN JUST FOUND, not what a scan once found.
//
// This read `if (f) lastFound = f.v` and then reported `found = lastFound`, so when the zip was deleted, moved
// or renamed the panel kept naming the last version it had ever seen -- a REMEMBERED RESULT PRESENTED AS A
// CURRENT MEASUREMENT, which is the same class as the count that was really a cap (v3043) and the reason
// lib/derivedCache.js (v3065) makes "a derive that returns nothing leaves nothing" a rule rather than a habit.
//
// It is worse here than a wrong number, because the panel offers an INSTALL for what it reports. Offering to
// install a file that is no longer on disk is a failure the user meets, not one they read about.
//
// lastFound is KEPT and still returned, because "the newest we have ever seen" is a genuinely different and
// useful fact -- it is simply not the answer to "is there an update sitting in Downloads". The two are now
// separate fields instead of one field wearing both meanings, and updateAvailable follows the CURRENT scan.
function updateStatus(){ const u = cfg.update; const cur = currentVersion(); const f = scanDownloads(); if (f) lastFound = f.v; const _p = scanDownloadsPartial(); const arriving = (_p && _p.v > cur && (!f || _p.v > f.v)) ? _p.v : null; const found = f ? f.v : null; const rejected = f ? [] : scanDownloadsRejects(); const pollActive = (isWin || isMac) && !!(u.enabled || u.autoApply); return { oneTerminal: oneTerminalOn(),  ok: true, win: isWin, mac: isMac, enabled: u.enabled, autoApply: u.autoApply, autoPullPeers: u.autoPullPeers !== false, bootScan: u.bootScan !== false, autoRemoveOld: !!u.autoRemoveOld, pauseOnRustdesk: u.pauseOnRustdesk !== false, lastPrune: _lastPrune, current: cur, found, lastFound, rejected, updateAvailable: (found || 0) > cur, arriving, pollActive, nextCheckAt: (pollActive && _nextCheckAt) ? _nextCheckAt : null, downloadsDir: downloadsDir(), targetDir: u.targetDir || engineParentDir(), intervalMin: u.intervalMin, versionPrefix: u.versionPrefix || preferredPrefix(), note: lastNote }; }

// ───────────────────────── one-terminal flag (v3739) ───────────────────────
// Keith: Avast dislikes the single-terminal construction, so START_NODE_Engine.bat's self-relaunch into a
// Windows Terminal tab is OPT-IN from v3739 and the three-window launch (engine + KPop + GPU Brain) is the
// default. The launcher tests `if exist WebGLEngine\ai-bridge\swek_one_terminal.flag`; ABSENT MEANS OFF, so
// every existing install gets the old behaviour without anyone touching a setting.
const ONE_TERM_FLAG = path.join(__dirname, "swek_one_terminal.flag");
function oneTerminalOn(){ try { return fs.existsSync(ONE_TERM_FLAG); } catch { return false; } }
function setOneTerminalFlag(on){
    if (on) fs.writeFileSync(ONE_TERM_FLAG, "written by server.html Boot Options -- delete this file to go back to three windows\n");
    else if (fs.existsSync(ONE_TERM_FLAG)) fs.unlinkSync(ONE_TERM_FLAG);
    // Read back rather than trusting the write: THE DISK IS THE SETTING, because the disk is what the .bat reads.
    if (oneTerminalOn() !== !!on) throw new Error("flag file did not reach the state asked for");
}

// ───────────────────────── restart / exit (server-mode controls) ─────────────────────────
function restart(){
    if (isWin){
        const root = path.resolve(__dirname, "..", "..");        // ai-bridge -> WebGLEngine -> EngineProject_vNNN
        const launcher = launcherName();
        const bat = path.join(root, launcher);
        if (!fs.existsSync(bat)) return { ok: false, error: "launcher not found at " + bat };
        try { fs.writeFileSync(path.join(os.tmpdir(), "swek_superseded.flag"), "1"); } catch {}   // v1507 — old window exits quietly + no duplicate tab
        try { const c = spawn("cmd", ["/c", "start", "", "/d", root, launcher], { detached: true, windowsHide: false, stdio: "ignore" }); c.unref(); }
        catch (e){ return { ok: false, error: "relaunch failed: " + e.message }; }
        setTimeout(() => process.exit(0), 900);                  // new launcher frees 8787 + rebinds; we step aside
        return { ok: true, note: "relaunching under " + (preferBun() ? "Bun" : "Node") + " — the new launcher frees the port, this server exits" };
    }
    if (isMac){
        const root = path.resolve(__dirname, "..", "..");
        const cmd = path.join(root, "Start Mac SweK Engine.command");
        if (!fs.existsSync(cmd)) return { ok: false, error: "launcher not found at " + cmd };
        try { fs.writeFileSync(path.join(os.tmpdir(), "swek_superseded.flag"), "1"); } catch {}
        try { fs.chmodSync(cmd, 0o755); } catch {}
        try { const c = spawn("open", [cmd], { detached: true, stdio: "ignore" }); c.unref(); }
        catch (e){ return { ok: false, error: "relaunch failed: " + e.message }; }
        setTimeout(() => process.exit(0), 1200);
        return { ok: true, note: "relaunching via Start Mac SweK Engine.command — this server exits to free the port" };
    }
    setTimeout(() => process.exit(0), 300);
    return { ok: true, note: "exiting (no relauncher for this OS)" };
}
function exitNow(){ setTimeout(() => process.exit(0), 250); return { ok: true, note: "server exiting" }; }
// v1502 — GitHub "installer": pull the newest published release zip into Downloads so the
// scan/apply chain below can land it. Reuses githubBridge (token-aware, private repos ok).
async function githubPull(force){
    try { const gh = require("./githubBridge.js"); return await gh.fetchEngineBuild({ toDir: downloadsDir(), force: !!force }); }
    catch (e){ return { ok: false, error: String((e && e.message) || e) }; }
}
async function githubStatus(){
    try { const gh = require("./githubBridge.js"); const vc = await gh.versionCheck(); return Object.assign({ autoFetch: !!cfg.update.autoFetch }, vc); }
    catch (e){ return { ok: false, error: String((e && e.message) || e), autoFetch: !!cfg.update.autoFetch }; }
}
function startUpdatePoller(){
    if (updTimer) { clearInterval(updTimer); updTimer = null; }
    // v1535 — run when EITHER enabled or autoApply is on. The user-facing toggle is
    // "Auto-update from Downloads" (autoApply); it used to set autoApply WITHOUT
    // enabled, so the poller never started and updates only applied when the browser
    // triggered them. A newer zip only lands in Downloads deliberately (user download,
    // opt-in peer-pull, or GitHub autoFetch), so applying it autonomously is the intent.
    if (!(isWin || isMac) || !(cfg.update.enabled || cfg.update.autoApply)) { _nextCheckAt = 0; return; }   // v1539 — run on macOS too; updateCheck() has a darwin apply path
    const ms = Math.max(2, cfg.update.intervalMin || 10) * 60000;
    _nextCheckAt = Date.now() + ms;
    updTimer = setInterval(() => {
        _nextCheckAt = Date.now() + ms;
        (async () => {
            if (cfg.update.autoFetch) { try { await githubPull(false); } catch {} }
            updateCheck(!!cfg.update.autoApply, { silent: true }).catch(() => {});
        })();
    }, ms);
    log("self-update poller every " + (cfg.update.intervalMin || 10) + " min (autoApply=" + cfg.update.autoApply + ", autoFetch=" + cfg.update.autoFetch + ")");
}

// ───────────────────────── config + lifecycle ─────────────────────────
function getConfig(){
    const c = JSON.parse(JSON.stringify(cfg));
    // *** v3739 -- oneTerminal IS REPORTED FROM THE DISK, NOT FROM MEMORY. The .bat reads the FLAG FILE, so the
    // flag is the setting and this object is a copy of it. If someone deletes the flag by hand (which the file
    // itself invites -- it says so in its own contents), the checkbox must follow the launcher rather than
    // insist on what was last clicked. TWO DECLARATIONS ABOUT ONE THING, and this is the one that reads BOTH. ***
    if (c.update) c.update.oneTerminal = oneTerminalOn();
    return c;
}
function setConfig(patch){
    if (!patch || typeof patch !== "object") return cfg;
    if (typeof patch.port === "number") cfg.port = patch.port;
    if (patch.update && typeof patch.update === "object"){
        const u = cfg.update;
        if (typeof patch.update.enabled === "boolean") u.enabled = patch.update.enabled;
        if (typeof patch.update.autoApply === "boolean") u.autoApply = patch.update.autoApply;
        if (typeof patch.update.pauseOnRustdesk === "boolean") u.pauseOnRustdesk = patch.update.pauseOnRustdesk;
        if (typeof patch.update.autoFetch === "boolean") u.autoFetch = patch.update.autoFetch;
        if (typeof patch.update.downloadsDir === "string") u.downloadsDir = patch.update.downloadsDir;
        if (typeof patch.update.targetDir === "string") u.targetDir = patch.update.targetDir;
        if (typeof patch.update.intervalMin === "number") u.intervalMin = patch.update.intervalMin;
        if (typeof patch.update.bootScan === "boolean") u.bootScan = patch.update.bootScan;
        if (typeof patch.update.versionPrefix === "string") { const p = patch.update.versionPrefix.trim().replace(/[^A-Za-z0-9_+\-]/g, "_"); u.versionPrefix = p || "SweK_Engine"; }
        if (typeof patch.update.autoRemoveOld === "boolean") u.autoRemoveOld = patch.update.autoRemoveOld;
        // *** v3739 -- ONE-TERMINAL MODE. The setting lives here like the others, BUT THE .bat CANNOT READ
        // THIS JSON -- it is cmd, and parsing JSON in batch is how launchers acquire bugs. So the boolean is
        // MIRRORED TO A FLAG FILE the launcher tests with `if exist`, which is the mechanism kpop_minimize.flag
        // already established rather than a new one invented here.
        // *** THE FLAG IS THE ONE THE LAUNCHER READS, SO THE WRITE IS THE LOAD-BEARING HALF: if it fails, the
        // checkbox would show a state the next boot does not honour -- TWO DECLARATIONS ABOUT ONE THING. The
        // failure is therefore REPORTED rather than swallowed, and getConfig() re-reads the flag from disk
        // below so the UI shows WHAT THE LAUNCHER WILL ACTUALLY DO, not what was last asked for. ***
        if (typeof patch.update.oneTerminal === "boolean") {
            u.oneTerminal = patch.update.oneTerminal;
            try { setOneTerminalFlag(u.oneTerminal); }
            catch (e) { log("oneTerminal: FLAG WRITE FAILED -- the launcher will not honour this: " + (e && e.message)); }
        }
        if (typeof patch.update.autoPullPeers === "boolean") u.autoPullPeers = patch.update.autoPullPeers;   // v1796 — was missing; autoPullPeers never persisted
    }
    saveCfg(); startUpdatePoller();
    return getConfig();
}
function start(){
    if (cfg.keepAwake) { try { keepAwake(true); } catch {} }   // re-assert across restarts
    // v2514 -- DO NOT DELETE THE FLAG HERE. This line was the other half of the auto-update race, and it is the
    // reason an update ends with the old window printing "exited with code -1" and sitting on a pause forever:
    //
    //   1. the updater writes the flag, then kills the old node
    //   2. THIS server starts and deletes it, within about a second
    //   3. the OLD SweK_Run.bat finally notices its node died, looks for the flag, and finds nothing
    //   4. so it reports a real crash -- pointing at [autoPull] chatter as "the reason above this line"
    //
    // It is a node-vs-batch race, which is why fixing only the .bat would not have closed it. v1507 added this to
    // stop a STALE flag making a normal launch look like a handoff; FRESHNESS does that job without deleting
    // something another process is still waiting to read. Both sides now check the age (90s) and only the window
    // that CONSUMES a handoff deletes it.
    // v2229 — the launcher starts KPop AFTER the ai-bridge, so clear the silent flag on a delay: KPop
    // needs a window to read it. One-shot silence, then back to normal on the next launch.
    setTimeout(() => { try { fs.unlinkSync(path.join(os.tmpdir(), "swek_silent.flag")); } catch {} }, 45000);
    // v1506 — if autostart is on, re-point the Run key at THIS build's launcher (the folder changes
    // each version, so the key would otherwise go stale after an update).
    if (isWin && cfg.loginAutostart) { try { loginAutostartSet(true); } catch {} }
    startUpdatePoller();
    // v1502 — a fresh boot should grab the newest published build without waiting a poll interval.
    if (isWin && cfg.update.enabled && cfg.update.autoFetch) {
        setTimeout(() => { githubPull(false).then(r => { if (r && r.downloaded) { log("pulled " + (r.latest || "?") + " from GitHub into Downloads"); updateCheck(!!cfg.update.autoApply, { silent: true }).catch(() => {}); } }).catch(() => {}); }, 30000);
    }
    // v1516 — boot-time AWARENESS scan. Independent of the auto-update flags: one LOCAL scan of
    // Downloads a few seconds after boot, logged to the console only when a newer build is sitting
    // there. Never fetches from GitHub, never applies — it just makes sure a downloaded zip can't
    // go unnoticed when auto-update is off. Disable with update.bootScan:false.
    if ((isWin || isMac) && cfg.update.bootScan !== false) {
        setTimeout(() => {
            // autoApply on (default) -> apply the newest Downloads build now; off -> just announce it.
            updateCheck(!!cfg.update.autoApply, { silent: true }).then(r => {
                if (!cfg.update.autoApply && r && r.updateAvailable && r.found) {
                    log("=== UPDATE WAITING: v" + r.found + " is in Downloads (running v" + r.current + "). Apply from the engine-update panel or the server.html checkbox, or POST /sys/update/apply. ===");
                }
            }).catch(() => {});
        }, 4000);
    }
    // v1631 — opt-in: after a settled boot (a few seconds in, past the update-check so we don't prune a
    // folder mid-relaunch), delete superseded EngineProject_vNNN folders whose zip is still in Downloads.
    if ((isWin || isMac) && cfg.update.autoRemoveOld) {
        // v3406 -- *** (1) OFF THE EVENT LOOP, AND (3) LONG AFTER THE PAGE. ***
        //
        // robustRemove is SYNCHRONOUS FROM END TO END: recursive chmodSync + unlinkSync/rmdirSync over a tree of
        // ~17,000 files, six retries, then execFileSync("cmd /c rmdir /s /q") WITH A TWENTY-SECOND TIMEOUT. Every
        // one of those blocks the loop, and Keith's boot log shows exactly what that costs -- `[lag] event loop
        // blocked 29720ms at 43s` landing on the robustRemove line, then four static files each reporting
        // `took 7082x ms`. THOSE WERE NOT SLOW FILE SERVES. Four requests reporting the SAME seventy seconds are
        // four requests queued behind one blocking call, which is what the lag line says in words: "every
        // request in flight waited exactly this long." A JS file is a disk read; it is never 71 seconds.
        //
        // SO THE DELETION RUNS IN A DETACHED CHILD. It does not need to be in this process: nothing waits on the
        // result, the folder is superseded by definition, and a deletion that outlives a restart is FINE where a
        // deletion that freezes the server for a minute is not. The child is unref'd so it never holds the
        // server open, and its stdio is ignored so a full pipe cannot stall it.
        //
        // AND IT RUNS AT NINETY SECONDS RATHER THAN NINE. The old delay was chosen when the work was assumed
        // cheap; the page was served at 13s and the loop went away at 43s, so the grace was covering the wrong
        // interval entirely. THE PAGE COMES FIRST -- the same rule v3271 applied to the peer version check.
        setTimeout(() => {
            try {
                const r = pruneOldVersions({ apply: false });          // DRY RUN ONLY: cheap, and it does the deciding
                const targets = (r.candidates || []).map(c => c.path);
                if (!targets.length) return;
                const child = require("child_process").spawn(process.execPath,
                    [require("path").join(__dirname, "pruneWorker.js"), ...targets],
                    { detached: true, stdio: "ignore" });
                child.unref();
                log("autoRemoveOld: handed " + targets.length + " old version folder(s) to a detached worker (this process never blocks on a delete).");
            } catch (e) { log("autoRemoveOld prune failed:", (e && e.message) || e); }
        }, 90000);
    }
}
function stop(){ if (awakeProc){ try { awakeProc.kill(); } catch {} awakeProc = null; } if (updTimer){ clearInterval(updTimer); updTimer = null; } }

// ───────────────────────── (4) FLEET PROPAGATION ─────────────────────────
// v1499 — let an updated machine hand its new EngineProject_vNNN.zip to peers, so the whole
// LAN of SweK boxes can roll forward. updateOffer() = "here's the newest zip I can give you";
// /update/zip streams it; pullFrom(peerUrl) fetches a newer peer's zip into THIS Downloads so
// the normal apply flow (scanDownloads) picks it up.
// v1989 — the offer used to come ONLY from scanDownloads() (newest zip in Downloads). A box that
// updated via a Drive package / incremental update, or whose zip was cleaned up, had NOTHING to
// offer even though /package/info advertised it as newer — so pullNewestPeer picked it as the best
// candidate and then failed every 5 min with "peer has no update to offer". Now we also scan the
// engine PARENT dir (where EngineProject_vNNNN.zip lands beside the extracted build) and offer the
// newest zip found in either place.
function _scanEngineParentZips(){
    let best = null; const dir = engineParentDir();
    try { for (const f of fs.readdirSync(dir)){ const m = f.match(_versionRe(false, "\\.zip$")); if (m){ const v = parseInt(m[1], 10); if (!best || v > best.v) best = { v, file: path.join(dir, f) }; } } } catch {}
    return best;
}
function _bestOfferZip(){
    const a = scanDownloads(), b = _scanEngineParentZips();
    if (a && b) return a.v >= b.v ? a : b;
    return a || b || null;
}
function updateOffer(){ const f = _bestOfferZip(); if (!f) return { ok: true, available: false, current: currentVersion() }; return { ok: true, available: true, version: f.v, zipName: path.basename(f.file), current: currentVersion() }; }
function updateZipPath(){ const f = _bestOfferZip(); return f ? f.file : null; }
// v3249 -- the one JSON GET this file needs, shaped like the http.get already above it rather than a second
// HTTP style. A five-second ceiling because THIS RUNS BETWEEN A COMPLETED DOWNLOAD AND ITS RENAME: a peer that
// hangs must not strand a good zip in .part forever, so a timeout falls through to hashChecked:false with the
// reason, which is exactly the "reported, not refused" line the caller already handles.
function _fetchJson(url){
    return new Promise((resolve) => {
        try {
            const rq = http.get(url, (r) => {
                if (r.statusCode !== 200) { try { r.resume(); } catch {} return resolve(null); }
                let body = ""; r.on("data", (d) => body += d);
                r.on("end", () => { let j = null; try { j = JSON.parse(body); } catch {} resolve(j); });
            });
            rq.on("error", () => resolve(null));
            rq.setTimeout(5000, () => { try { rq.destroy(); } catch {} resolve(null); });
        } catch { resolve(null); }
    });
}

// v3284 -- the local update policy (pinned public key, tier). Read fresh each time so rotating a key does not
// need a restart, and ABSENT is a valid answer: no policy means no pinned key, which peerTrust treats as
// "external builds may stage, never apply".
function _updatePolicy(){
    try {
        const p = path.join(__dirname, "..", "tools", "roundhouse", "update-policy.json");
        return JSON.parse(fs.readFileSync(p, "utf8"));
    } catch { return null; }
}

function pullFrom(peerUrl){
    return new Promise((resolve) => {
        try {
            const base = String(peerUrl || "").replace(/\/+$/, "");
            if (!base) return resolve({ ok: false, error: "no url" });
            const http = require(base.startsWith("https") ? "https" : "http");
            http.get(base + "/update/offer", (res) => {
                let body = ""; res.on("data", d => body += d); res.on("end", () => {
                    let off = null; try { off = JSON.parse(body); } catch {}
                    if (!off || !off.available || !off.version) return resolve({ ok: false, error: "peer has no update to offer" });
                    if (off.version <= currentVersion()) return resolve({ ok: true, skipped: true, reason: "peer not newer", peerVersion: off.version, current: currentVersion() });
                    const zipName = "EngineProject_v" + off.version + ".zip";   // v2229 -- normalize peer-pulled saves so any box recognizes them regardless of the offer name
                    // v3248 -- *** DOWNLOAD TO .part AND RENAME ON SUCCESS, SO A HALF FILE CANNOT BE SEEN. ***
                    // scanDownloads picks the newest zip in Downloads and offers it to the apply flow. A pull
                    // that died mid-stream used to leave a SHORT .zip sitting there with a fresh mtime -- the
                    // newest thing in the folder, and therefore the next thing installed. A truncated zip often
                    // still opens and yields its first entries before the central directory goes bad, WHICH IS
                    // HOW A PARTIAL TREE GETS EXTRACTED INSTEAD OF A CLEAN FAILURE.
                    //
                    // The failure mode does not get DETECTED here, it stops EXISTING: nothing but a completed,
                    // length-checked transfer is ever named *.zip.
                    const dest = path.join(downloadsDir(), zipName);
                    const part = dest + ".part";
                    try { fs.unlinkSync(part); } catch {}
                    const file = fs.createWriteStream(part);
                    http.get(base + "/update/zip", (zr) => {
                        if (zr.statusCode !== 200) { try { file.close(); fs.unlinkSync(part); } catch {} return resolve({ ok: false, error: "zip http " + zr.statusCode }); }
                        // v1532 — disk guard before we commit the download to disk.
                        const need = parseInt(zr.headers["content-length"] || "0", 10) || 0;
                        const free = _freeBytes(downloadsDir());
                        if (free !== Infinity && need && free < need + ENGINE_DISK_MARGIN) {
                            try { zr.destroy(); } catch {}
                            try { file.close(); fs.unlinkSync(part); } catch {}
                            return resolve({ ok: false, error: "insufficient disk space for engine zip", needBytes: need, freeBytes: free });
                        }
                        zr.pipe(file);
                        file.on("finish", () => { file.close(async () => {
                            // *** content-length WAS READ AND THEN ONLY USED FOR THE DISK CHECK. *** `finish`
                            // fires when the stream ends -- INCLUDING WHEN IT ENDS EARLY -- so a dropped
                            // connection resolved ok:true, pulled:true, and the apply flow took it from there.
                            // A TRUNCATED DOWNLOAD AND A COMPLETE ONE RETURNED THE SAME THING.
                            let got = 0;
                            try { got = fs.statSync(part).size; } catch {}
                            if (need && got !== need) {
                                try { fs.unlinkSync(part); } catch {}
                                // BOTH NUMBERS, because "truncated" alone sends nobody anywhere: 22.5 MB of 22.5
                                // MB is a different problem from 3 MB of 22.5 MB.
                                return resolve({ ok: false, error: "truncated engine zip -- transfer ended early",
                                                 gotBytes: got, expectedBytes: need, peer: peerUrl });
                            }
                            // v3249 -- *** THE SIZE CHECK ANSWERS "DID IT ALL ARRIVE", NOT "IS IT THE SAME
                            // FILE". *** chunkVerify.mjs's own words, and it has guarded the peer Grab since
                            // v3143 while the updater -- which replaces the ENGINE -- used none of it. A proxy
                            // serving a same-length error body, a partial write later padded, a flipped bit in
                            // flight: all arrive at exactly the expected length.
                            //
                            // *** A PEER WITH NO MANIFEST IS REPORTED, NOT REFUSED. *** chunkVerify's own law is
                            // to refuse unverified bytes, and that is right for the Grab. Here it would mean a
                            // box can NEVER update from an older peer, which breaks the fleet on the way to
                            // making it safe -- so an absent manifest sets hashChecked:false and says why, the
                            // same shape as lengthChecked. THE CALLER CAN SEE THE DIFFERENCE; nothing is hidden.
                            let hashChecked = false, hashWhy = "";
                            try {
                                const man = await _fetchJson(peerUrl.replace(/\/$/, "") + "/update/zip/manifest");
                                if (man && man.ok && man.whole) {
                                    const cv = await import("./chunkVerify.mjs");
                                    const verdict = cv.acceptOrRefuse(man, fs.readFileSync(part));
                                    if (!verdict.ok) {
                                        try { fs.unlinkSync(part); } catch {}
                                        return resolve({ ok: false, error: "engine zip failed verification -- " + verdict.reason,
                                                         peer: peerUrl, gotBytes: got, expectedBytes: need });
                                    }
                                    hashChecked = true;
                                } else hashWhy = "peer served no manifest (pre-v3249 build)";
                            } catch (e) { hashWhy = "manifest unavailable: " + String((e && e.message) || e).slice(0, 60); }

                            try { fs.renameSync(part, dest); }
                            catch (e) { try { fs.unlinkSync(part); } catch {} return resolve({ ok: false, error: "could not place engine zip: " + String((e && e.message) || e) }); }

                            // v3284 -- *** WHO IS ALLOWED TO HAND THIS MACHINE A BUILD. ***
                            // Until now, pairing a peer granted PERMANENT update-source trust: any paired peer
                            // claiming a higher version got its zip downloaded and auto-applied. On a LAN that is
                            // a considered trade; over a cloudflared tunnel it is remote code execution granted by
                            // one pairing click. The fleet path had ALREADY built the answer (signRelease +
                            // updatePolicy + applyStaged) and THIS path did not consult it -- two implementations
                            // of one fact, with the weaker one facing the internet.
                            //
                            // DECIDED: LAN keeps trust-on-pair, external requires an ed25519 manifest signature
                            // verifying against the locally pinned key, and an unsigned external build is STAGED
                            // WITH ITS SOURCE NAMED rather than auto-applied. peerTrust.mjs owns the decision and
                            // IMPORTS the fleet verifier; nothing is reimplemented here.
                            //
                            // The zip is kept either way -- staging is not refusing -- but `applicable` is what the
                            // apply flow reads, so an unsigned external build sits on disk until a human says yes.
                            let trust = null;
                            try {
                                const { decidePeerUpdate, peerUpdateLine } = await import("./peerTrust.mjs");
                                const bytes = fs.readFileSync(dest);
                                trust = decidePeerUpdate({ peerUrl: base, offer: off, bytes, policy: _updatePolicy() });
                                trust.line = peerUpdateLine(trust);
                                lastNote = trust.line;
                            } catch (e) {
                                // A TRUST MODULE THAT FAILS TO LOAD MUST NOT MEAN "TRUSTED". Failing closed here
                                // costs an operator one click; failing open costs the machine.
                                trust = { action: "stage-only", origin: "unknown", peer: base,
                                          why: "peer-trust check unavailable (" + String((e && e.message) || e).slice(0, 80) + ") -- failing closed",
                                          line: "STAGED, NOT APPLIED -- the trust check could not run" };
                                lastNote = trust.line;
                            }
                            if (trust.action === "refuse") {
                                try { fs.unlinkSync(dest); } catch {}
                                return resolve({ ok: false, error: trust.why, peer: base, trust });
                            }
                            resolve({ ok: true, pulled: true, saved: dest, version: off.version, zipName, bytes: got,
                                      // NAMED so a caller can tell a CHECKED transfer from one that merely finished:
                                      // a peer that sends no content-length is not the same as one that sent it all.
                                      lengthChecked: !!need, hashChecked, hashWhy,
                                      // v3284 -- the apply flow reads `applicable`; staged builds wait for a human.
                                      trust, applicable: trust.action === "may-apply", stagedOnly: trust.action === "stage-only" });
                        }); });   // v1989 — `pulled` flag: server.js's autoPull log checked r.pulled, which was never set
                    }).on("error", (e) => { try { file.close(); fs.unlinkSync(part); } catch {} resolve({ ok: false, error: String(e && e.message || e) }); });
                });
            }).on("error", (e) => resolve({ ok: false, error: String(e && e.message || e) }));
        } catch (e) { resolve({ ok: false, error: String(e && e.message || e) }); }
    });
}

// v1532 — auto-pull the engine from the NEWEST newer peer on the LAN. Called on a
// timer by server.js with assetDiscovery.discovered() (each peer's caps carry its
// engine version, v1499). Lands the zip in Downloads; the existing apply flow
// (autoApply / bootScan / watchDownloads) installs it on the next poll/restart.
// Gated by cfg.update.enabled && cfg.update.autoPullPeers so it only runs where the
// machine opted into auto-updates. Idempotent within a version: won't re-download a
// version it already pulled until currentVersion() catches up.
// v1586 — peer auto-pull now follows the same auto-update opt-in as Downloads (autoApply), not the
// stricter `enabled` flag. A machine that auto-applies a build it DOWNLOADED should also auto-apply
// one a LAN peer advertises (fleet roll-forward). `autoPullPeers` stays as the explicit per-machine
// opt-out for JUST peer pulls. Fixes the Mac: it had autoApply on but enabled off, so it detected
// newer peers yet never pulled/applied — only direct downloads updated it.
function autoPullPeersOn(){ return !!((cfg.update.enabled || cfg.update.autoApply) && cfg.update.autoPullPeers !== false); }
async function pullNewestPeer(peers, opts){
    if (!(opts && opts.force) && !autoPullPeersOn()) return { ok: true, skipped: true, reason: "auto-pull-peers off" };
    const cur = currentVersion();
    const cand = (Array.isArray(peers) ? peers : [])
        .map(p => ({ url: p && p.url, v: ((p && p.caps && p.caps.version) | 0) }))
        .filter(p => p.url && p.v > cur)
        .sort((a, b) => b.v - a.v);
    if (!cand.length) return { ok: true, skipped: true, reason: "no newer peer", current: cur };
    const best = cand[0];
    // already pulled this exact version and we haven't applied/restarted yet -> don't re-fetch
    if (_lastPeerPull && _lastPeerPull.version === best.v && cur < best.v) {
        return { ok: true, skipped: true, reason: "already pulled v" + best.v + " (awaiting apply)", current: cur };
    }
    const r = await pullFrom(best.url);
    if (r && r.ok && !r.skipped) {
        _lastPeerPull = { version: best.v, url: best.url, at: Date.now() };
        lastNote = (r.trust && r.trust.line) ? r.trust.line : ("auto-pulled v" + best.v + " from " + best.url);
        try { log("=== AUTO-PULL: fetched v" + best.v + " from peer " + best.url + " into Downloads ==="); } catch {}
        // v1535 — apply autonomously so the DOS/bridge updates WITHOUT the browser
        // being open. updateCheck(true) extracts the new build beside this one and
        // relaunches via its boot-mode-aware .bat. Windows-only (the extract+relaunch
        // path); gated by autoApply so it's the user's existing opt-in.
        //
        // v3284 -- *** AND NOW ALSO GATED ON WHO OFFERED IT. *** autoApply is the user's consent to install
        // WITHOUT THE BROWSER OPEN; it was never consent to install whatever an internet-reachable peer claims
        // is newer. r.applicable is peerTrust's verdict: true for a LAN peer (trust-on-pair, kept) or an
        // external peer whose manifest signature verifies against the locally pinned key. An unsigned external
        // build stays on disk, ATTRIBUTED, until a human acts -- which is the whole point of the decision.
        if (cfg.update.autoApply && (isWin || isMac) && r.applicable) {
            try { log("=== AUTO-APPLY: installing v" + best.v + " (autoApply on) -- the bridge will relaunch ==="); } catch {}
            setTimeout(() => { updateCheck(true, { silent: true }).catch(() => {}); }, 2500);
        } else if (cfg.update.autoApply && r.stagedOnly) {
            try { log("=== STAGED, NOT APPLIED: v" + best.v + " from " + best.url + " -- " + ((r.trust && r.trust.why) || "unverified source")); } catch {}
        }
    }
    return Object.assign({ from: best.url, peerVersion: best.v, current: cur }, r);
}

// v3377 -- *** PATCHES IN Downloads, AND WHETHER THEIR CLAIMS CAN BE AUDITED AT ALL. ***
// v3374 established the three states and v3376 made them readable from an UNEXTRACTED zip. This is the route
// half: the bridge already knows where Downloads is, and this is the only place a REAL patch path exists.
//
// TWO THINGS IT DOES NOT DO, both deliberate:
//   NO ZIP LOGIC LIVES HERE. It awaits patchBase, which delegates to safeExtract and moduleHistory --
//   moduleHistory's own gate asserts that this bridge holds no zip reading, and that assertion is why the
//   import is here rather than a fourth reader.
//   IT DOES NOT APPLY ANYTHING. Reporting whether a patch declares a base is a READ, and the apply path is
//   applyStaged's with its own signature check. A scanner that could also install would be two capabilities
//   wearing one route.
//
// AND A FULL BUILD IS NOT A PATCH: scanDownloads already reports SweK_Engine_vNNNN.zip, so those are EXCLUDED
// by name here. Reporting a build as an unstated patch would manufacture a finding out of a file that was
// never claiming anything.
async function patchScan(){
    const dir = downloadsDir();
    let names = []; try { names = fs.readdirSync(dir); } catch (e) { return { ok: false, dir, why: "cannot read " + dir + ": " + e.code, rows: [] }; }
    const isBuild = _versionRe(true, "\\.zip$");
    const cand = names.filter((n) => /\.zip$/i.test(n) && !isBuild.test(n));
    if (!cand.length) return { ok: true, dir, rows: [], note: "no patch-shaped zip in " + dir + " (full builds are excluded by name and are the update panel's business)" };
    let mod; try { mod = await import("../tools/ship/patchBase.mjs"); }
    catch (e) { return { ok: false, dir, why: "patchBase did not load: " + e.message, rows: [] }; }
    const tree = mod.treeVersionOf(path.join(__dirname, "..")) || null;
    const rows = [];
    for (const n of cand.sort()) {
        let r; try { r = mod.auditableZip(path.join(dir, n), tree); }
        catch (e) { r = { verdict: "unstated", claimsAuditable: false, why: "unreadable: " + e.message }; }
        rows.push({ file: n, base: r.base || null, verdict: r.verdict, claimsAuditable: !!r.claimsAuditable, why: r.why, entries: r.entries || 0 });
    }
    return { ok: true, dir, tree, rows };
}

module.exports = {
    start, stop, setLogger, getConfig, setConfig,
    firewallStatus, firewallAllow, firewallRemove,
    go2rtcFirewallStatus, go2rtcFirewallAllow,
    loginAutostartStatus, loginAutostartSet,
    keepAwake, keepAwakeState,
    updateCheck, updateStatus, pruneOldVersions, prunePartials,
    githubPull, githubStatus,
    updateOffer, updateZipPath, pullFrom, pullNewestPeer, autoPullPeersOn,
    restart, exitNow, downloadsDir, patchScan, setKpopProbe,
};
