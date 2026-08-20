// FILE: ai-bridge/vmBridge.js
// VERSION: v1523 — VMware VM power control via vmrun.
//
// Lets the engine power-cycle a local VMware Workstation / Player VM (e.g. the
// Home Assistant VM) without opening the GUI: start / stop / restart / reset /
// status. Backed by the `vmrun` CLI that ships with VMware Workstation Pro and
// Player. DESKTOP hypervisor only (-T ws / player / fusion). ESXi / vSphere /
// Proxmox are a different product and would need their own backend (govc /
// PowerCLI / the Proxmox API) — NOT handled here.
//
// Config lives in ai-bridge/vm.json: { vmrunPath, vmxPath, hostType }.
//   vmrunPath  explicit path to vmrun(.exe); blank = auto-detect common locations
//   vmxPath    the VM's .vmx config file (the HA VM); the default target
//   hostType   "ws" (Workstation, default) | "player" | "fusion"
"use strict";

const { execFile } = require("child_process");
const fs = require("fs"), path = require("path"), os = require("os");

let log = (...a) => { try { console.log("[vm]", ...a); } catch {} };
function setLogger(fn) { if (typeof fn === "function") log = fn; }

const isWin = process.platform === "win32";
const isMac = process.platform === "darwin";

const CFG_PATH = path.join(os.homedir(), ".voxelbridge", "vm.json");   // v1558 — persistent across updates
const LEGACY_CFG = path.join(__dirname, "vm.json");                     // pre-v1558 in-tree path (lost on update)
const cfg = { vmrunPath: "", vmxPath: "", hostType: process.platform === "darwin" ? "fusion" : "ws", images: [], backend: "vmware", vboxPath: "", utmctlPath: "", vmName: "" };   // v1893 — backend: vmware|virtualbox|utm; vmName = target for vbox/utm
function loadCfg() {
    try { Object.assign(cfg, JSON.parse(fs.readFileSync(CFG_PATH, "utf8"))); return; } catch {}
    // v1558 — one-time migrate a legacy in-tree vm.json into the persistent store so saved VM
    // images survive a self-update (the updater extracts a fresh folder without vm.json).
    try { const legacy = JSON.parse(fs.readFileSync(LEGACY_CFG, "utf8")); Object.assign(cfg, legacy); saveCfg(); log("migrated legacy vm.json -> " + CFG_PATH); } catch {}
}
function saveCfg() { try { fs.mkdirSync(path.dirname(CFG_PATH), { recursive: true }); fs.writeFileSync(CFG_PATH, JSON.stringify(cfg, null, 2)); } catch (e) { log("cfg save failed:", e.message); } }
loadCfg();

// Resolve the vmrun executable: explicit config, then common install paths, then PATH.
function vmrunExe() {
    if (cfg.vmrunPath && tryExists(cfg.vmrunPath)) return cfg.vmrunPath;
    const cands = isWin ? [
        "C:\\Program Files (x86)\\VMware\\VMware Workstation\\vmrun.exe",
        "C:\\Program Files\\VMware\\VMware Workstation\\vmrun.exe",
        "C:\\Program Files (x86)\\VMware\\VMware Player\\vmrun.exe",
        "C:\\Program Files\\VMware\\VMware Player\\vmrun.exe",
    ] : isMac ? [
        "/Applications/VMware Fusion.app/Contents/Library/vmrun",
    ] : [
        "/usr/bin/vmrun", "/usr/local/bin/vmrun",
    ];
    for (const c of cands) { if (tryExists(c)) return c; }
    return "vmrun";   // last resort: assume it's on PATH
}
function tryExists(p) { try { return fs.existsSync(p); } catch { return false; } }
function hostFlag() { if (process.platform === "darwin") return "fusion"; return cfg.hostType === "player" ? "player" : "ws"; }   // v1586 — on macOS the only desktop hypervisor is Fusion (also coerces a stale "ws" vm.json)
function vmx(p) { return String(p || cfg.vmxPath || "").trim(); }
// v1533 — named multi-image support. cfg.images = [{ name, vmx }] so one machine
// can expose several VMs (e.g. Home Assistant + Bliss Android). listConfigured()
// folds the legacy single vmxPath in as a fallback entry so older configs keep working.
function _vmxName(p) { return String(p || "").replace(/\\/g, "/").split("/").pop().replace(/\.vmx$/i, "") || "VM"; }
function listConfigured() {
    const imgs = Array.isArray(cfg.images) ? cfg.images.filter(i => i && i.vmx) : [];
    const out = imgs.map(i => ({ name: String(i.name || "").trim() || _vmxName(i.vmx), vmx: String(i.vmx).trim() }));
    if (cfg.vmxPath && !out.some(i => _sameVmx(i.vmx, cfg.vmxPath))) out.unshift({ name: _vmxName(cfg.vmxPath), vmx: String(cfg.vmxPath).trim(), legacy: true });
    return out;
}

// execFile (arg array, no shell) so .vmx paths with spaces need no quoting.
function runVmrun(args, timeoutMs) {
    return new Promise((resolve) => {
        const exe = vmrunExe();
        execFile(exe, args, { windowsHide: true, timeout: timeoutMs || 30000 }, (e, so, se) => {
            resolve({ ok: !e, out: String(so || ""), err: e ? String((se || e.message || e)) : null, exe });
        });
    });
}

// v1893 — VirtualBox + UTM backends. Same shape as the VMware path, but keyed on a VM NAME/UUID
// (cfg.vmName or the passed target) instead of a .vmx path. VMware stays the default + unchanged.
function backend() { return (cfg.backend === "virtualbox" || cfg.backend === "utm" || cfg.backend === "hyperv") ? cfg.backend : "vmware"; }
function target(p) { return String(p || cfg.vmName || cfg.vmxPath || "").trim(); }
function vboxExe() {
    if (cfg.vboxPath && tryExists(cfg.vboxPath)) return cfg.vboxPath;
    const cands = process.platform === "win32"
        ? ["C:\\Program Files\\Oracle\\VirtualBox\\VBoxManage.exe"]
        : ["/usr/local/bin/VBoxManage", "/opt/homebrew/bin/VBoxManage", "/usr/bin/VBoxManage", "/Applications/VirtualBox.app/Contents/MacOS/VBoxManage"];
    for (const c of cands) if (tryExists(c)) return c;
    return "VBoxManage";
}
function utmctlExe() {
    if (cfg.utmctlPath && tryExists(cfg.utmctlPath)) return cfg.utmctlPath;
    const cands = ["/Applications/UTM.app/Contents/MacOS/utmctl", "/opt/homebrew/bin/utmctl", "/usr/local/bin/utmctl"];
    for (const c of cands) if (tryExists(c)) return c;
    return "utmctl";
}
function _run(exe, args, timeoutMs) {
    return new Promise((resolve) => {
        execFile(exe, args, { windowsHide: true, timeout: timeoutMs || 30000 }, (e, so, se) => {
            resolve({ ok: !e, out: String(so || ""), err: e ? String((se || e.message || e)) : null, exe });
        });
    });
}

// ---- VirtualBox (VBoxManage) ----
async function vboxList() {
    const r = await _run(vboxExe(), ["list", "runningvms"], 15000);
    // lines look like:  "HAOS" {uuid}
    const running = r.out.split(/\r?\n/).map(s => (s.match(/^"([^"]+)"/) || [])[1]).filter(Boolean);
    return { ok: r.ok, running, count: running.length, raw: r.out, error: r.err };
}
async function vboxStatus(p, probeGuest) {
    const t = target(p);
    const l = await vboxList();
    if (!l.ok) return { ok: false, error: l.error || "VBoxManage failed (is VirtualBox installed?)", configured: t || null, resolved: vboxExe() };
    const running = !!t && l.running.some(v => v === t);
    const out = { ok: true, backend: "virtualbox", configured: t || null, running, runningVms: l.running, count: l.count };
    if (t) {
        if (!running) out.phase = "off";
        else if (!probeGuest) out.phase = "running";
        else {
            // guest IP via guestproperty (needs Guest Additions); best-effort
            let ip = "";
            try { const g = await _run(vboxExe(), ["guestproperty", "get", t, "/VirtualBox/GuestInfo/Net/0/V4/IP"], 10000); const m = (g.out || "").match(/Value:\s*([0-9.]+)/); if (m) ip = m[1]; } catch {}
            out.ip = ip; out.phase = ip ? "ready" : "booting";
        }
    }
    return out;
}
async function vboxStart(p, gui) {
    const t = target(p);
    if (!t) return { ok: false, error: "no VM name configured (set vmName via POST /vm/config)" };
    const r = await _run(vboxExe(), ["startvm", t, "--type", gui ? "gui" : "headless"], 60000);
    if (r.ok) log("vbox started", t);
    return { ok: r.ok, action: "start", vm: t, out: r.out, error: r.err };
}
async function vboxStop(p, mode) {
    const t = target(p);
    if (!t) return { ok: false, error: "no VM name configured" };
    const sub = mode === "hard" ? "poweroff" : "acpipowerbutton";
    const r = await _run(vboxExe(), ["controlvm", t, sub], 60000);
    if (r.ok) log("vbox stopped (" + sub + ")", t);
    return { ok: r.ok, action: "stop", vm: t, out: r.out, error: r.err };
}

// ---- UTM (utmctl, macOS) ----
async function utmList() {
    const r = await _run(utmctlExe(), ["list"], 15000);
    // utmctl list prints a table: UUID  Status  Name. Collect names of "started" rows.
    const running = [];
    for (const line of r.out.split(/\r?\n/)) {
        const m = line.match(/\bstarted\b\s+(.+?)\s*$/i);
        if (m) running.push(m[1].trim());
    }
    return { ok: r.ok, running, count: running.length, raw: r.out, error: r.err };
}
async function utmStatus(p, probeGuest) {
    const t = target(p);
    if (process.platform !== "darwin") return { ok: false, error: "UTM is macOS only", backend: "utm" };
    let st = "";
    try { const s = await _run(utmctlExe(), ["status", t], 12000); if (s.ok) st = (s.out || "").trim().toLowerCase(); } catch {}
    const running = /start/.test(st);
    const out = { ok: true, backend: "utm", configured: t || null, running, statusRaw: st };
    if (t) out.phase = running ? "running" : "off";
    return out;
}
async function utmStart(p) {
    const t = target(p);
    if (!t) return { ok: false, error: "no VM name/UUID configured (set vmName via POST /vm/config)" };
    const r = await _run(utmctlExe(), ["start", t], 60000);
    if (r.ok) log("utm started", t);
    return { ok: r.ok, action: "start", vm: t, out: r.out, error: r.err };
}
async function utmStop(p, mode) {
    const t = target(p);
    if (!t) return { ok: false, error: "no VM name/UUID configured" };
    const args = mode === "hard" ? ["stop", t, "--force"] : ["stop", t];
    const r = await _run(utmctlExe(), args, 60000);
    if (r.ok) log("utm stopped", t);
    return { ok: r.ok, action: "stop", vm: t, out: r.out, error: r.err };
}

// ---- Hyper-V (PowerShell cmdlets, Windows Pro/Enterprise) ----
// No single CLI binary — Hyper-V is driven by PowerShell. All calls run elevated-agnostic
// cmdlets (Get-VM/Start-VM/Stop-VM) which work for the current user if they're in the
// Hyper-V Administrators group. Target = the VM's Name (cfg.vmName).
function _ps(cmd, timeoutMs) {
    return new Promise((resolve) => {
        execFile("powershell", ["-NoProfile", "-NonInteractive", "-Command", cmd], { windowsHide: true, timeout: timeoutMs || 30000 }, (e, so, se) => {
            resolve({ ok: !e, out: String(so || ""), err: e ? String((se || e.message || e)) : null });
        });
    });
}
function _psQuote(s) { return "'" + String(s).replace(/'/g, "''") + "'"; }   // single-quote escape for PowerShell
async function hypervList() {
    if (process.platform !== "win32") return { ok: false, running: [], error: "Hyper-V is Windows only" };
    const r = await _ps("Get-VM | Where-Object {$_.State -eq 'Running'} | Select-Object -ExpandProperty Name", 15000);
    const running = r.out.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
    return { ok: r.ok, running, count: running.length, raw: r.out, error: r.err };
}
async function hypervStatus(p, probeGuest) {
    const t = target(p);
    if (process.platform !== "win32") return { ok: false, error: "Hyper-V is Windows only", backend: "hyperv" };
    const l = await hypervList();
    if (!l.ok) return { ok: false, error: l.error || "Get-VM failed (is Hyper-V enabled + are you in the Hyper-V Administrators group?)", configured: t || null };
    const running = !!t && l.running.some(v => v === t);
    const out = { ok: true, backend: "hyperv", configured: t || null, running, runningVms: l.running, count: l.count };
    if (t) {
        if (!running) out.phase = "off";
        else if (!probeGuest) out.phase = "running";
        else {
            let ip = "";
            try { const g = await _ps("(Get-VMNetworkAdapter -VMName " + _psQuote(t) + ").IPAddresses | Select-Object -First 1", 10000); const m = (g.out || "").match(/[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+/); if (m) ip = m[0]; } catch {}
            out.ip = ip; out.phase = ip ? "ready" : "booting";
        }
    }
    return out;
}
async function hypervStart(p) {
    const t = target(p);
    if (!t) return { ok: false, error: "no VM name configured (set vmName via POST /vm/config)" };
    const r = await _ps("Start-VM -Name " + _psQuote(t), 60000);
    if (r.ok) log("hyperv started", t);
    return { ok: r.ok, action: "start", vm: t, out: r.out, error: r.err };
}
async function hypervStop(p, mode) {
    const t = target(p);
    if (!t) return { ok: false, error: "no VM name configured" };
    const cmd = mode === "hard" ? ("Stop-VM -Name " + _psQuote(t) + " -TurnOff -Force") : ("Stop-VM -Name " + _psQuote(t) + " -Force");
    const r = await _ps(cmd, 60000);
    if (r.ok) log("hyperv stopped (" + (mode === "hard" ? "turnoff" : "shutdown") + ")", t);
    return { ok: r.ok, action: "stop", vm: t, out: r.out, error: r.err };
}

async function list() {
    if (backend() === "virtualbox") { const r = await vboxList(); return { ok: r.ok, running: r.running, count: r.count, raw: r.raw, error: r.error }; }
    if (backend() === "utm") { const r = await utmList(); return { ok: r.ok, running: r.running, count: r.count, raw: r.raw, error: r.error }; }
    if (backend() === "hyperv") { const r = await hypervList(); return { ok: r.ok, running: r.running, count: r.count, raw: r.raw, error: r.error }; }
    const r = await runVmrun(["-T", hostFlag(), "list"], 15000);
    const running = r.out.split(/\r?\n/).map(s => s.trim()).filter(l => /\.vmx$/i.test(l));
    return { ok: r.ok, running, count: running.length, raw: r.out, error: r.err };
}

function _sameVmx(a, b) {
    try { return path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase(); } catch { return String(a).toLowerCase() === String(b).toLowerCase(); }
}

// v1585 — guest readiness probe. Powered-on (in `vmrun list`) is NOT the same as the guest OS
// having finished booting. checkToolsState reports "running" once VMware Tools (open-vm-tools) is
// up inside the guest; getGuestIPAddress returns an address only after the guest network is live.
// Either signal means the guest is genuinely ready. No guest credentials required.
// NOTE: depends on VMware Tools / open-vm-tools being installed in the guest; without it the VM
// will read "booting" (power-on is still confirmed) and you fall back to reaching the service.
async function guest(p) {
    const target = vmx(p);
    let toolsState = "", ip = "";
    try { const t = await runVmrun(["-T", hostFlag(), "checkToolsState", target], 12000); if (t.ok) toolsState = (t.out || "").trim().split(/\r?\n/).pop().trim(); } catch {}
    try { const a = await runVmrun(["-T", hostFlag(), "getGuestIPAddress", target], 12000); if (a.ok) { const line = (a.out || "").trim().split(/\r?\n/).pop().trim(); if (/^[0-9.]+$/.test(line) || /:/.test(line)) ip = line; } } catch {}
    return { toolsState, ip };
}

async function status(p, probeGuest) {
    if (backend() === "virtualbox") return vboxStatus(p, probeGuest);
    if (backend() === "utm") return utmStatus(p, probeGuest);
    if (backend() === "hyperv") return hypervStatus(p, probeGuest);
    const target = vmx(p);
    const l = await list();
    if (!l.ok) return { ok: false, error: l.error || "vmrun list failed (is VMware installed?)", configured: target || null, resolvedVmrun: vmrunExe() };
    const running = !!target && l.running.some(v => _sameVmx(v, target));
    const out = { ok: true, configured: target || null, running, runningVms: l.running, count: l.count };
    // v1585 — readiness phase. Probe the guest ONLY when asked (the UI) and only when running, so the
    // fast power-state callers (restart polling, HA detection) aren't slowed by extra vmrun calls.
    if (target) {
        if (!running) out.phase = "off";
        else if (!probeGuest) out.phase = "running";
        else { const g = await guest(target); out.tools = g.toolsState; out.ip = g.ip; out.phase = (g.toolsState === "running" || g.ip) ? "ready" : "booting"; }
    }
    return out;
}

async function start(p, gui) {
    if (backend() === "virtualbox") return vboxStart(p, gui);
    if (backend() === "utm") return utmStart(p);
    if (backend() === "hyperv") return hypervStart(p);
    const target = vmx(p);
    if (!target) return { ok: false, error: "no .vmx path configured (set one via POST /vm/config)" };
    const r = await runVmrun(["-T", hostFlag(), "start", target, gui ? "gui" : "nogui"], 60000);
    if (r.ok) log("started", target);
    return { ok: r.ok, action: "start", vmx: target, out: r.out, error: r.err };
}

async function stop(p, mode) {
    if (backend() === "virtualbox") return vboxStop(p, mode);
    if (backend() === "utm") return utmStop(p, mode);
    if (backend() === "hyperv") return hypervStop(p, mode);
    const target = vmx(p);
    if (!target) return { ok: false, error: "no .vmx path configured" };
    const r = await runVmrun(["-T", hostFlag(), "stop", target, mode === "hard" ? "hard" : "soft"], 60000);
    if (r.ok) log("stopped (" + (mode === "hard" ? "hard" : "soft") + ")", target);
    return { ok: r.ok, action: "stop", vmx: target, out: r.out, error: r.err };
}

async function reset(p, mode) {
    if (backend() !== "vmware") return restart(p, mode);   // vbox/utm: reset = stop+start
    const target = vmx(p);
    if (!target) return { ok: false, error: "no .vmx path configured" };
    const r = await runVmrun(["-T", hostFlag(), "reset", target, mode === "hard" ? "hard" : "soft"], 60000);
    return { ok: r.ok, action: "reset", vmx: target, out: r.out, error: r.err };
}

// restart = graceful stop, poll until powered off (a soft ACPI shutdown takes
// time), then start. Best-effort: if it never reports off we still try to start.
async function restart(p, mode) {
    const target = vmx(p);
    if (!target) return { ok: false, error: "no .vmx path configured" };
    const s = await stop(target, mode);   // ignore "not powered on" — we start regardless
    let off = false;
    for (let i = 0; i < 15; i++) {
        await new Promise(r => setTimeout(r, 2000));
        const st = await status(target);
        if (st.ok && !st.running) { off = true; break; }
    }
    const st = await start(target, false);
    return { ok: st.ok, action: "restart", vmx: target, poweredOff: off, stop: s, start: st, error: st.error };
}

function getConfig() {
    return { ok: true, backend: backend(), vmName: cfg.vmName || "", vboxPath: cfg.vboxPath || "", resolvedVbox: vboxExe(), utmctlPath: cfg.utmctlPath || "", resolvedUtmctl: utmctlExe(), vmrunPath: cfg.vmrunPath || "", resolvedVmrun: vmrunExe(), vmxPath: cfg.vmxPath || "", hostType: hostFlag(), platform: process.platform, images: Array.isArray(cfg.images) ? cfg.images : [], configured: listConfigured() };
}
function setConfig(p) {
    if (p && typeof p === "object") {
        if (typeof p.backend === "string" && ["vmware", "virtualbox", "utm", "hyperv"].includes(p.backend)) cfg.backend = p.backend;
        if (typeof p.vmName === "string") cfg.vmName = p.vmName.trim();
        if (typeof p.vboxPath === "string") cfg.vboxPath = p.vboxPath.trim();
        if (typeof p.utmctlPath === "string") cfg.utmctlPath = p.utmctlPath.trim();
        if (typeof p.vmxPath === "string") cfg.vmxPath = p.vmxPath.trim();
        if (typeof p.vmrunPath === "string") cfg.vmrunPath = p.vmrunPath.trim();
        if (typeof p.hostType === "string" && ["ws", "player", "fusion"].includes(p.hostType)) cfg.hostType = p.hostType;
        if (Array.isArray(p.images)) {
            // v1533 — sanitize: keep only {name, vmx} with a non-empty vmx, cap at 24.
            cfg.images = p.images
                .filter(i => i && typeof i.vmx === "string" && i.vmx.trim())
                .slice(0, 24)
                .map(i => ({ name: String(i.name || "").trim().slice(0, 60) || _vmxName(i.vmx), vmx: i.vmx.trim().slice(0, 400) }));
        }
        saveCfg();
    }
    return getConfig();
}

// v1559 — auto-discover .vmx machines from VMware's own bookkeeping files so a user
// never has to retype paths. Sources:
//   preferences.ini   pref.mruVMN.filename   (recently opened, Workstation/Player)
//   favorites.vmls    vmlistN.config         (library sidebar, Workstation/Player)
//   vmInventory       vmlistN.config         (library, Fusion on macOS)
//   vmrun -T ws list                          (what's running right now)
function _readKv(p) {
    const map = {};
    try {
        for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
            const m = line.match(/^\s*([\w.]+)\s*=\s*(.*)$/);
            if (!m) continue;
            let v = m[2].trim();
            if (v.length >= 2 && v[0] === '"' && v[v.length - 1] === '"') v = v.slice(1, -1);
            map[m[1].toLowerCase()] = v;
        }
    } catch {}
    return map;
}
function _vmwareDirs() {
    const dirs = [];
    if (isWin) { const ad = process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming"); dirs.push(path.join(ad, "VMware")); }
    else if (isMac) { dirs.push(path.join(os.homedir(), "Library", "Application Support", "VMware Fusion"), path.join(os.homedir(), "Library", "Preferences", "VMware Fusion")); }
    return dirs;
}
async function discover() {
    const norm = (p) => String(p || "").replace(/\\/g, "/").toLowerCase();
    const found = new Map();   // normalized vmx -> { vmx, name, sources[] }
    const add = (vmxPath, name, source) => {
        const v = String(vmxPath || "").trim();
        if (!v || !/\.vmx$/i.test(v)) return;
        const k = norm(v);
        if (!found.has(k)) found.set(k, { vmx: v, name: (String(name || "").trim() || _vmxName(v)), sources: [] });
        const e = found.get(k);
        if (name && (!e.name || e.name === _vmxName(v))) e.name = String(name).trim();
        if (!e.sources.includes(source)) e.sources.push(source);
    };
    const dirs = _vmwareDirs();
    for (const dir of dirs) {
        const prefs = _readKv(path.join(dir, "preferences.ini"));
        for (const key in prefs) { const m = key.match(/^pref\.mruvm(\d+)\.filename$/); if (m) add(prefs[key], prefs["pref.mruvm" + m[1] + ".displayname"], "recent (preferences.ini)"); }
        for (const file of ["favorites.vmls", "vmInventory"]) {
            const kv = _readKv(path.join(dir, file));
            for (const key in kv) { const m = key.match(/^vmlist(\d+)\.config$/); if (m) add(kv[key], kv["vmlist" + m[1] + ".displayname"], file === "favorites.vmls" ? "library (favorites.vmls)" : "library (Fusion inventory)"); }
        }
    }
    let running = [];
    try { const r = await list(); if (r && r.ok && Array.isArray(r.running)) running = r.running.map(norm); } catch {}
    const discovered = [...found.values()].map(e => ({ name: e.name, vmx: e.vmx, sources: e.sources, running: running.includes(norm(e.vmx)), exists: tryExists(e.vmx) }));
    discovered.sort((a, b) => (b.running - a.running) || a.name.localeCompare(b.name));
    return { ok: true, platform: process.platform, dirs, scanned: dirs.length, found: discovered.length, discovered };
}

module.exports = { setLogger, list, status, start, stop, reset, restart, getConfig, setConfig, listConfigured, discover };
