// FILE: ai-bridge/iosDeviceBridge.js -- v4155
//
// *** adb, FOR iOS. *** doronz88/pymobiledevice3 is a pure-Python implementation of the protocols an iPhone
// already speaks to a trusted computer -- usbmux, lockdown, AFC, DVT. NO JAILBREAK: it talks to a device that
// has been paired the ordinary way ("Trust This Computer"), which is exactly the relationship adb has with a
// phone in developer mode.
//
// WHAT THIS DOES AND DOES NOT CHANGE. It does NOT promote the iOS peer: an iPhone still cannot run node or host
// ai-bridge/server.js, so ios-peer.html's "a subset in Safari" stands and the peer ladder is unchanged. What
// changes is the HOST's grip on the phone -- list and launch apps, read the system log, pull crash reports,
// reach the filesystem over AFC, forward a port -- a management channel iOS has never had here.
//
// ---- LICENCE ------------------------------------------------------------------------------------------------
// pymobiledevice3 is GPL-3.0. NOTHING IS VENDORED and nothing is imported: this shells out to a CLI the user
// installed with pip, the same arrangement sunshineBridge.js uses for Sunshine. The engine's zip carries none of it.
//
// ---- *** THE ALLOWLIST IS THE DESIGN, AND IT IS AN ALLOWLIST ON PURPOSE *** ----------------------------------
// pymobiledevice3 ships 29 command groups and several of them CHANGE OR DESTROY A DEVICE: `restore` can wipe an
// iPhone, `activation` alters activation state, `profile` installs configuration profiles, `amfi` toggles
// developer mode, `mounter` mounts a developer disk image. A DENYLIST WOULD BE WRONG BY CONSTRUCTION -- it is
// correct only until upstream adds the next dangerous verb, and this bridge would then pass it straight
// through. So the safe commands are named one at a time, and everything else is refused BY DEFAULT, including
// every command that does not exist yet.
//
// ---- WHAT HAS NEVER RUN -------------------------------------------------------------------------------------
// NO iPHONE HAS EVER BEEN ATTACHED TO THIS BRIDGE. This box has no USB device and no pymobiledevice3 installed.
// detect(), the allowlist and every refusal ARE gated and run -- they are the paths that must behave with
// nothing plugged in, which is this box's actual state. Everything past "the CLI answered" is unverified, and
// ios-tools.html marks it per row.
"use strict";
const os = require("os");
const { spawn, execFile } = require("child_process");

const UPSTREAM = Object.freeze({
    project: "doronz88/pymobiledevice3",
    repo: "https://github.com/doronz88/pymobiledevice3",
    license: "GPL-3.0",
    what: "pure-Python client for iOS lockdown/usbmux/AFC/DVT -- what adb is to Android",
    jailbreak: false,
    needs: "a device paired the ordinary way (Trust This Computer). Nothing is installed on the phone.",
});

const INSTALL = Object.freeze({
    cmd: "python3", args: ["-m", "pip", "install", "-U", "pymobiledevice3"],
    note: "pip, into whatever python3 is on PATH. Pure Python: no compiler, no Xcode, no device-side agent.",
});

// *** THE ALLOWLIST. *** Each entry is one command this bridge may run, with WHY it is safe. Adding a line is a
// deliberate act; nothing reaches the CLI that is not spelled here.
const ALLOWED = Object.freeze({
    "list":     { argv: ["usbmux", "list"],            reads: "which devices are attached, and their names/UDIDs" },
    "version":  { argv: ["version"],                   reads: "the installed pymobiledevice3 version" },
    "apps":     { argv: ["apps", "list"],              reads: "installed applications" },
    "processes":{ argv: ["processes", "ps"],           reads: "running processes (needs the iOS 17+ tunnel)" },
    "crashes":  { argv: ["crash", "ls"],               reads: "the names of crash reports already on the device" },
    "battery":  { argv: ["diagnostics", "battery"],    reads: "battery diagnostics" },
});

// *** NAMED SO THE PAGE CAN SHOW WHAT IS DELIBERATELY OUT OF REACH, rather than leaving it to be discovered. ***
const REFUSED = Object.freeze([
    { what: "restore, DFU, erase or activation",
      why: "`pymobiledevice3 restore` CAN WIPE AN IPHONE. There is no version of this button worth the one time " +
           "somebody presses it on the wrong device, and nothing the engine wants is on the other side of it." },
    { what: "install configuration profiles",
      why: "a profile can enrol a device in management, pin a proxy, or install a root certificate. That is a " +
           "decision about a person's phone, not a convenience." },
    { what: "toggle developer mode, mount a developer disk image, or run anything under sudo",
      why: "the iOS 17+ tunnel needs root on Linux and Windows because it creates a TUN interface. THIS BRIDGE " +
           "NEVER ELEVATES: it reports that a tunnel is required and leaves starting it to a person in a " +
           "terminal, who can see what they are agreeing to. On macOS no sudo is needed at all." },
    { what: "back up or restore device data",
      why: "a backup is a copy of somebody's whole phone. Where it lands and who can read it are questions this " +
           "bridge has no standing to answer on its own." },
    { what: "anything not on the allowlist above",
      why: "REFUSED BY DEFAULT, including commands upstream has not written yet. A denylist would be correct " +
           "only until the next dangerous verb was added, and would then pass it straight through." },
]);

function _run(cmd, args, timeout = 20000) {
    return new Promise((resolve) => {
        try {
            execFile(cmd, args, { timeout, windowsHide: true, maxBuffer: 8 * 1024 * 1024 }, (err, stdout, stderr) => {
                resolve({ ok: !err, out: String(stdout || ""), errOut: String(stderr || ""), err: err && err.message });
            });
        } catch (e) { resolve({ ok: false, out: "", errOut: "", err: String((e && e.message) || e) }); }
    });
}

/** How to invoke it: the console script if present, else `python3 -m`. Both spellings, like sharpBridge's rule. */
async function _resolveCli() {
    const direct = await _run("pymobiledevice3", ["version"], 12000);
    if (direct.ok) return { cmd: "pymobiledevice3", pre: [] };
    const viaPy = await _run("python3", ["-m", "pymobiledevice3", "version"], 20000);
    if (viaPy.ok) return { cmd: "python3", pre: ["-m", "pymobiledevice3"] };
    return null;
}

async function detect() {
    const cli = await _resolveCli();
    if (!cli) {
        return { ok: true, found: false, platform: process.platform,
                 tried: ["pymobiledevice3", "python3 -m pymobiledevice3"],
                 hint: INSTALL.note };
    }
    const r = await _run(cli.cmd, [...cli.pre, "version"], 20000);
    const m = /(\d+\.\d+(?:\.\d+)?)/.exec(r.out + r.errOut);
    return { ok: true, found: true, via: cli.cmd + (cli.pre.length ? " " + cli.pre.join(" ") : ""),
             version: m ? m[1] : null };
}

let _job = null;
function installStatus() { return _job ? { ok: true, running: !_job.done, code: _job.code, log: _job.log.slice(-80) } : null; }

function install() {
    if (_job && !_job.done) return { ok: false, error: "an install is already running" };
    _job = { done: false, code: null, log: [] };
    const push = (s) => { _job.log.push(String(s).trimEnd()); if (_job.log.length > 400) _job.log.shift(); };
    push("$ " + INSTALL.cmd + " " + INSTALL.args.join(" "));
    let child;
    try { child = spawn(INSTALL.cmd, INSTALL.args, { windowsHide: true }); }
    catch (e) { _job.done = true; _job.code = -1; push(String((e && e.message) || e)); return { ok: false, error: "could not spawn " + INSTALL.cmd }; }
    child.stdout && child.stdout.on("data", (b) => push(b));
    child.stderr && child.stderr.on("data", (b) => push(b));
    child.on("error", (e) => { push("spawn error: " + ((e && e.message) || e)); _job.done = true; _job.code = -1; });
    child.on("exit", (code) => { _job.done = true; _job.code = code; push("exit " + code); });
    return { ok: true, started: true, note: INSTALL.note };
}

/**
 * Run ONE allowlisted command. `name` is a key of ALLOWED and nothing else -- no caller-supplied argv ever
 * reaches the CLI, which is what makes the allowlist meaningful rather than decorative.
 */
async function run(name, o = {}) {
    const spec = ALLOWED[name];
    if (!spec) {
        return { ok: false, refused: true, error: "not on the allowlist: " + String(name),
                 allowed: Object.keys(ALLOWED),
                 why: "refused by default -- see REFUSED. A caller cannot compose its own command here." };
    }
    const udid = (o.udid || "").trim();
    if (udid && !/^[\w-]{1,64}$/.test(udid)) return { ok: false, error: "bad udid: " + udid };
    const cli = await _resolveCli();
    if (!cli) return { ok: false, error: "pymobiledevice3 is not installed. Press Install, or `pip install -U pymobiledevice3`." };

    const args = [...cli.pre, ...spec.argv];
    if (udid) args.push("--udid", udid);
    const r = await _run(cli.cmd, args, 30000);
    const out = (r.out || "") + (r.errOut || "");
    // *** A DEVICE THAT IS NOT THERE IS THE COMMON CASE AND MUST READ AS ITSELF. *** pymobiledevice3 exits
    // nonzero with its own message for "no device"; reporting that as a bridge failure would send somebody
    // debugging the engine when the answer is a cable.
    const noDevice = /NoDeviceConnected|no device|DeviceNotFound|Device is not connected/i.test(out);
    const needsTunnel = /tunnel|RemoteXPC|start-tunnel/i.test(out) && !r.ok;
    return {
        ok: r.ok, command: cli.cmd + " " + args.join(" "), reads: spec.reads,
        output: out.slice(0, 8000),
        noDevice: noDevice || undefined,
        needsTunnel: needsTunnel || undefined,
        hint: noDevice ? "no device answered. Plug it in, unlock it, and accept Trust This Computer."
            : needsTunnel ? "this one needs the iOS 17+ tunnel, which needs root on Linux/Windows (no sudo on macOS). " +
                            "This bridge never elevates -- run `sudo python3 -m pymobiledevice3 remote tunneld` yourself."
            : undefined,
    };
}

async function status() {
    const d = await detect();
    return {
        ok: true, upstream: UPSTREAM,
        installed: d.found, via: d.via || null, version: d.version || null,
        install: INSTALL, installJob: installStatus(),
        allowed: Object.entries(ALLOWED).map(([k, v]) => ({ name: k, runs: "pymobiledevice3 " + v.argv.join(" "), reads: v.reads })),
        refused: REFUSED,
        platform: process.platform,
        tunnelNeedsRoot: process.platform !== "darwin",
        verified: "detection, the allowlist and every refusal are gated and run. NO iPHONE HAS EVER BEEN " +
                  "ATTACHED TO THIS BRIDGE, and pymobiledevice3 is not installed on the box it was written on, " +
                  "so every row past 'the CLI answered' is unverified.",
        peerLadder: "UNCHANGED. An iPhone still cannot run node or host the engine; ios-peer.html's 'a subset " +
                    "in Safari' stands. This is a management channel for the HOST, not a promotion for the phone.",
    };
}

// ---- the door ------------------------------------------------------------------------------------------------
const PREFIX = "/iosdev";
function owns(url) { return typeof url === "string" && (url === PREFIX || url.startsWith(PREFIX + "/") || url.startsWith(PREFIX + "?")); }
const ROUTES = Object.freeze([
    "GET  " + PREFIX + "/status", "POST " + PREFIX + "/install",
    "GET  " + PREFIX + "/install/status", "POST " + PREFIX + "/run",
]);

async function handle(req, res, ctx) {
    const sendJson = ctx && ctx.sendJson, readJson = ctx && ctx.readJson;
    const route = String(req.url || "").split("?")[0];
    if (req.method === "GET" && (route === PREFIX + "/status" || route === PREFIX)) { sendJson(await status()); return; }
    if (req.method === "GET" && route === PREFIX + "/install/status") { sendJson(installStatus() || { ok: true, running: false, note: "no install has been started" }); return; }
    if (req.method === "POST" && route === PREFIX + "/install") { const r = install(); sendJson(r, r.ok ? 200 : 400); return; }
    if (req.method === "POST" && route === PREFIX + "/run") {
        if (typeof readJson !== "function") { sendJson({ ok: false, error: "no body reader" }, 500); return; }
        readJson(async (d) => { const r = await run((d && d.name) || "", d || {}); sendJson(r, r.ok ? 200 : 400); });
        return;
    }
    sendJson({ ok: false, error: "unknown route", routes: ROUTES }, 404);
}

module.exports = { owns, handle, PREFIX, ROUTES, detect, install, installStatus, run, status,
                   UPSTREAM, INSTALL, ALLOWED, REFUSED };
