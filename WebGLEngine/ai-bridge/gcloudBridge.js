// FILE: ai-bridge/gcloudBridge.js
// v1665 — true GCP Compute Engine status via the gcloud CLI. Lets server.html show real instance
// state (RUNNING / TERMINATED / STOPPING / STAGING), zone, machine type, and internal/external IP,
// and start/stop an instance. Requires the gcloud CLI installed + authenticated on this box
// (gcloud auth login / a service account). Everything degrades to "gcloud not installed / not
// authenticated" when it isn't.
//
// Security: these surfaces sit behind the bridge auth gate (owner only). gcloud is invoked with a
// FIXED argv (no shell string), and instance name + zone are validated against strict patterns
// before any start/stop, so there is no shell-injection surface.

const { spawn } = require("child_process");
const WIN = process.platform === "win32";

// Run gcloud with a fixed argv. On Windows the launcher is gcloud.cmd, reachable via the PATH app
// alias, so we go through the shell there (args are fixed/validated). Resolves { code, stdout, stderr }.
function runGcloud(args, timeoutMs) {
    return new Promise((resolve) => {
        let child, done = false, out = "", err = "";
        const finish = (r) => { if (!done) { done = true; clearTimeout(t); resolve(r); } };
        const t = setTimeout(() => { try { child && child.kill(); } catch {} finish({ code: -2, stdout: out, stderr: err || "timed out" }); }, timeoutMs || 15000);
        try { child = WIN ? spawn("gcloud", args, { windowsHide: true, shell: true }) : spawn("gcloud", args, { windowsHide: true }); }
        catch (e) { return finish({ code: -1, stdout: "", stderr: "spawn failed: " + ((e && e.message) || e) }); }
        if (child.stdout) child.stdout.on("data", (d) => { out += d; if (out.length > 2000000) out = out.slice(-2000000); });
        if (child.stderr) child.stderr.on("data", (d) => { err += d; if (err.length > 20000) err = err.slice(-20000); });
        child.on("error", (e) => finish({ code: -1, stdout: out, stderr: (err || "") + " " + ((e && e.message) || e) }));
        child.on("close", (c) => finish({ code: c, stdout: out, stderr: err }));
    });
}

const NAME_RE = /^[a-z]([-a-z0-9]{0,61}[a-z0-9])?$/;   // GCE instance name rules
const ZONE_RE = /^[a-z]+-[a-z0-9]+-[a-z]$/;            // e.g. us-central1-a
const base = (u) => String(u || "").split("/").pop();

let _detectCache = null, _detectAt = 0;
async function detect(force) {
    if (!force && _detectCache && Date.now() - _detectAt < 30000) return _detectCache;
    const ver = await runGcloud(["--version"], 9000);
    const installed = ver.code === 0;
    let project = "", account = "";
    if (installed) {
        const pr = await runGcloud(["config", "get-value", "project", "--quiet"], 9000);
        project = (pr.code === 0 ? String(pr.stdout || "").trim() : "").replace(/^\(unset\)$/, "");
        const ac = await runGcloud(["auth", "list", "--filter=status:ACTIVE", "--format=value(account)", "--quiet"], 9000);
        account = ac.code === 0 ? String(ac.stdout || "").trim().split(/\r?\n/)[0] : "";
    }
    _detectCache = { ok: true, installed, authed: !!account, project, account, sdkVersion: installed ? (String(ver.stdout || "").match(/Google Cloud SDK\s+([\d.]+)/) || [])[1] || "" : "" };
    _detectAt = Date.now();
    return _detectCache;
}

async function instances(zone) {
    const d = await detect();
    if (!d.installed) return { ok: false, error: "gcloud CLI not installed", installed: false };
    if (!d.authed) return { ok: false, error: "gcloud not authenticated (run: gcloud auth login)", installed: true, authed: false };
    const args = ["compute", "instances", "list", "--format=json", "--quiet"];
    if (zone && ZONE_RE.test(zone)) args.push("--zones=" + zone);
    const r = await runGcloud(args, 25000);
    if (r.code !== 0) return { ok: false, error: (String(r.stderr || "").trim().split(/\r?\n/).pop() || "list failed").slice(-300), installed: true, authed: true };
    let arr = [];
    try { arr = JSON.parse(r.stdout || "[]"); } catch { return { ok: false, error: "could not parse gcloud output", installed: true, authed: true }; }
    const list = (Array.isArray(arr) ? arr : []).map((i) => {
        const ni = (i.networkInterfaces && i.networkInterfaces[0]) || {};
        const ac = (ni.accessConfigs && ni.accessConfigs[0]) || {};
        return { name: i.name, status: i.status || "UNKNOWN", zone: base(i.zone), machineType: base(i.machineType), internalIp: ni.networkIP || "", externalIp: ac.natIP || "" };
    });
    return { ok: true, installed: true, authed: true, project: d.project, instances: list };
}

let _op = { running: false, name: "", action: "", code: null, err: "", at: 0 };
function _lifecycle(action, name, zone) {
    if (!NAME_RE.test(String(name || ""))) return { ok: false, error: "bad instance name" };
    if (!ZONE_RE.test(String(zone || ""))) return { ok: false, error: "bad zone" };
    if (_op.running) return { ok: false, error: "another start/stop is in progress" };
    _op = { running: true, name, action, code: null, err: "", at: Date.now() };
    runGcloud(["compute", "instances", action, name, "--zone", zone, "--quiet"], 130000)
        .then((r) => { _op.running = false; _op.code = r.code; _op.err = r.code !== 0 ? String(r.stderr || "failed").trim().slice(-400) : ""; })
        .catch((e) => { _op.running = false; _op.code = -1; _op.err = String((e && e.message) || e); });
    return { ok: true, issued: true, name, action };   // fire-and-track; the UI re-polls instances to see the new status
}
function start(name, zone) { return _lifecycle("start", name, zone); }
function stop(name, zone) { return _lifecycle("stop", name, zone); }
function opStatus() { return Object.assign({ ok: true }, _op); }

module.exports = { detect, instances, start, stop, opStatus };
