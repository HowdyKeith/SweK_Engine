// FILE: ai-bridge/hostingBridge.js
// v963 — Remote-hosting helper. Detects cloudflared / Tailscale / winget,
// one-click installs them via winget (Windows), and runs a Cloudflare quick
// tunnel (cloudflared tunnel --url http://localhost:PORT), capturing the
// generated *.trycloudflare.com URL. Tailscale Funnel needs an interactive
// approve + MagicDNS/HTTPS in the admin console, so we detect + instruct rather
// than fully automate it.
//
// Security: these endpoints spawn processes and can expose the bridge — they
// sit behind the v961 auth gate, so only the authenticated owner reaches them.
// Tool names are whitelisted (no shell injection from the {tool} field).

const { spawn, spawnSync } = require("child_process");
// NOTE: `fs` is already required further down this file at module scope. resolveBin() below uses it, and that is
// safe because resolveBin only ever runs at REQUEST time -- long after the module has finished loading. Adding a
// second `const fs` here is a redeclaration and kills the whole bridge at parse time (caught by node --check).

const WIN = process.platform === "win32";
const MAC = process.platform === "darwin";   // v3741 -- install() now has a macOS branch, so the platform needs a name
const PKG = { cloudflare: "Cloudflare.cloudflared", tailscale: "tailscale.tailscale" };
// v3741 -- THE HOMEBREW NAMES, because winget ids are not formula names. Keith: "on the mac, install
// cloudflare is not working" -- and it could not: install() REFUSED ON EVERY NON-WINDOWS OS BY CONSTRUCTION
// ("winget install is Windows-only"), while server.html offered the button anyway. A BUTTON OFFERED ON A
// PLATFORM WHERE THE FUNCTION REFUSES BY DESIGN IS NOT A BROKEN FEATURE, IT IS A FEATURE THAT WAS NEVER THERE
// -- and the refusal message never reached the panel, so it read as a failure rather than as a boundary.
const BREW = { cloudflare: "cloudflared", tailscale: "tailscale" };

// Run a command, resolve { code, stdout, stderr }. code -1 = spawn error,
// -2 = timeout. On Windows we go through the shell so PATH app-execution
// aliases (winget, cloudflared) resolve; args are fixed/whitelisted.
function runProc(cmd, args, timeoutMs, opts) {
    return new Promise(resolve => {
        let child, done = false, out = "", err = "";
        const finish = (r) => { if (!done) { done = true; clearTimeout(t); resolve(r); } };
        const t = setTimeout(() => { try { child && child.kill(); } catch {} finish({ code: -2, stdout: out, stderr: err || "timed out" }); }, timeoutMs || 5000);
        try { child = spawn(cmd, args, Object.assign({ windowsHide: true }, opts || {})); }
        catch (e) { return finish({ code: -1, stdout: "", stderr: "spawn failed: " + (e && e.message) }); }
        if (child.stdout) child.stdout.on("data", d => { out += d; });
        if (child.stderr) child.stderr.on("data", d => { err += d; });
        child.on("error", e => finish({ code: -1, stdout: out, stderr: (err || "") + " " + (e && e.message) }));
        child.on("close", c => finish({ code: c, stdout: out, stderr: err }));
    });
}

// v2856 -- WHY THE MAC COULD NOT START A TUNNEL. On Windows this goes through the shell, so a PATH app-execution
// alias resolves. Everywhere else we spawn the bare name with shell:false, which resolves against THIS PROCESS'S
// PATH -- and a macOS server started from a launcher (nohup + disown, no login shell) inherits a minimal PATH:
// roughly /usr/bin:/bin:/usr/sbin:/sbin. `brew install cloudflared` puts the binary in /opt/homebrew/bin on Apple
// Silicon or /usr/local/bin on Intel. NEITHER IS ON THAT PATH. The binary is installed, `cloudflared --version`
// works fine in Terminal, and the server still cannot see it -- which is exactly the shape of bug that reads as
// "the feature is broken" rather than "the lookup is wrong".
//
// The engine ALREADY had this answer and this file never got it: server.js resolves ffmpeg through the same
// candidate list (/opt/homebrew/bin, /usr/local/bin, ...). Same fix, same reasoning, one subsystem later.
const BIN_DIRS = ["/opt/homebrew/bin", "/usr/local/bin", "/usr/bin", "/bin", "/opt/local/bin", "/snap/bin"];

// Absolute path to a tool, or the bare name when we cannot do better (so PATH still gets its chance and the
// behaviour is never WORSE than before). Windows keeps the shell path it already had.
function resolveBin(name) {
    if (WIN) return name;
    try {
        for (const d of BIN_DIRS) {
            const p = d + "/" + name;
            try { fs.accessSync(p, fs.constants.X_OK); return p; } catch {}
        }
        // Last resort: ask a LOGIN shell, which sources the profile that puts Homebrew on PATH in the first place.
        // Cheap, bounded, and only reached when the fixed list missed -- a non-standard install prefix.
        const r = spawnSync("/bin/sh", ["-lc", "command -v " + name], { encoding: "utf8", timeout: 4000 });
        const hit = String((r && r.stdout) || "").trim().split("\n")[0];
        if (hit && hit.startsWith("/")) { try { fs.accessSync(hit, fs.constants.X_OK); return hit; } catch {} }
    } catch {}
    return name;
}

function probe(bin) { return WIN ? runProc(bin + " --version", [], 4000, { shell: true }) : runProc(resolveBin(bin), ["--version"], 4000); }

async function detectTool(bin) {
    const r = await probe(bin);
    const text = ((r.stdout || "") + " " + (r.stderr || "")).trim();
    const notFound = r.code === -1 || /not recognized|not found|no such file|ENOENT|cannot find/i.test(text);
    const installed = !notFound && (r.code === 0 || /version|\d+\.\d+/i.test(text));
    const m = installed ? text.match(/(\d+\.\d+(?:\.\d+)?)/) : null;
    return { installed: !!installed, version: m ? m[1] : null };
}

// v3819 -- *** THE SECOND OPINION. ***
// cloudflared was refused by api.trycloudflare.com at the TLS layer. Node has its OWN TLS stack -- a different
// implementation, a different cipher list, a different version policy -- so asking it to shake hands with the
// same host separates the only two hypotheses the v3815 message could do nothing but list:
//     node succeeds, cloudflared does not  ->  the binary
//     node fails too                       ->  the network path, and upgrading cloudflared cannot help
// And when the path is at fault it usually signs itself: a TLS-inspecting proxy or an antivirus with HTTPS
// scanning MUST present its own certificate, so the issuer comes back as something that is not Cloudflare.
// THE MIDDLEBOX IS NAMED BY ITS OWN CERTIFICATE rather than by asking somebody to go and look for one.
//
// rejectUnauthorized is FALSE on purpose and it is the whole point: the question is not "is this certificate
// trustworthy", it is "WHO SIGNED IT". Refusing to look would throw away the evidence. Nothing is sent over
// this socket and it is destroyed the moment the handshake resolves.
async function tlsProbe(host, port = 443, timeoutMs = 8000) {
    const tls = require("tls");
    return new Promise((resolve) => {
        let done = false;
        const finish = (v) => { if (!done) { done = true; try { sock.destroy(); } catch {} resolve(v); } };
        const t = setTimeout(() => finish({ ok: false, error: "timed out after " + timeoutMs + "ms", code: "ETIMEDOUT" }), timeoutMs);
        let sock;
        try {
            sock = tls.connect({ host, port, servername: host, rejectUnauthorized: false, timeout: timeoutMs }, () => {
                clearTimeout(t);
                let issuer = null, subject = null;
                try {
                    const c = sock.getPeerCertificate() || {};
                    issuer = (c.issuer && (c.issuer.O || c.issuer.CN)) || null;
                    subject = (c.subject && c.subject.CN) || null;
                } catch {}
                finish({ ok: true, protocol: sock.getProtocol ? sock.getProtocol() : null,
                         cipher: (sock.getCipher && sock.getCipher().name) || null, issuer, subject });
            });
        } catch (e) { clearTimeout(t); return resolve({ ok: false, error: String(e && e.message || e), code: e && e.code }); }
        sock.on("error", (e) => { clearTimeout(t); finish({ ok: false, error: String(e && e.message || e), code: e && e.code }); });
    });
}

/**
 * v3819 -- everything needed to tell a stale binary from an intercepted network, measured rather than assumed.
 * The REASONING lives in ai-bridge/tunnelVerdict.mjs so it can be graded without a socket.
 */
async function tunnelPreflight(host = "api.trycloudflare.com") {
    const [d, tls] = await Promise.all([detect(), tlsProbe(host)]);
    const { tunnelVerdict } = await import("./tunnelVerdict.mjs");
    const v = tunnelVerdict({ platform: d.platform, cloudflared: d.cloudflared, tls, host });
    return { ok: true, host, platform: d.platform, cloudflared: d.cloudflared, tls, ...v };
}

async function detect() {
    const [winget, cloudflared, tailscale] = await Promise.all([detectTool("winget"), detectTool("cloudflared"), detectTool("tailscale")]);
    return { ok: true, platform: process.platform, winget, cloudflared, tailscale };
}

// ── Tailscale serve/funnel control (v1911) ───────────────────────────────────
// serve = private (tailnet-only) permanent https://<machine>.<tailnet>.ts.net ; funnel = same URL but PUBLIC.
// Both persist with --bg (auto-resume on reboot). Funnel only allows ports 443/8443/10000 for the PUBLIC
// listener, but `tailscale funnel --bg <localport>` proxies the public 443 to that local port — so we pass
// the SweK port as the proxy target and Tailscale fronts it on 443. status --json gives the DNS name.
function _tsArgs(a) { return WIN ? { cmd: "tailscale " + a.join(" "), args: [], opts: { shell: true } } : { cmd: "tailscale", args: a, opts: {} }; }
async function _ts(a, timeoutMs) { const x = _tsArgs(a); return runProc(x.cmd, x.args, timeoutMs || 8000, x.opts); }

async function tailscaleStatus() {
    // DNS name + backend state from `tailscale status --json`; serve/funnel state from their status.
    const r = await _ts(["status", "--json"], 8000);
    let dnsName = null, backendState = null, tailnet = null, self = null;
    try {
        const j = JSON.parse(r.stdout || "{}");
        backendState = j.BackendState || null;
        self = j.Self || null;
        if (self && self.DNSName) dnsName = String(self.DNSName).replace(/\.$/, "");   // e.g. galaxina.tailnet-name.ts.net
        if (j.CurrentTailnet && j.CurrentTailnet.Name) tailnet = j.CurrentTailnet.Name;
    } catch {}
    // is funnel/serve currently active for our port? parse the human status (json shape varies by version)
    const fr = await _ts(["funnel", "status"], 6000);
    const sr = await _ts(["serve", "status"], 6000);
    const funnelOn = /https:\/\/\S+\.ts\.net/i.test(fr.stdout || "") && !/no funnel/i.test(fr.stdout || "");
    const serveOn = /https:\/\/\S+\.ts\.net/i.test(sr.stdout || "") && !/no serve/i.test(sr.stdout || "");
    const url = dnsName ? ("https://" + dnsName) : null;
    return {
        ok: true, running: backendState === "Running", backendState, dnsName, tailnet, url,
        funnel: funnelOn, serve: serveOn,
        funnelStatusRaw: (fr.stdout || "").slice(-500), serveStatusRaw: (sr.stdout || "").slice(-500),
        loggedIn: backendState === "Running" || backendState === "Starting",
    };
}

// mode: "serve" (private) | "funnel" (public). port: local SweK port. on: true=start, false=stop.
async function tailscaleExpose(mode, port, on) {
    mode = (mode === "funnel") ? "funnel" : "serve";
    port = parseInt(port, 10) || 8787;
    if (on) {
        // `tailscale <mode> --bg <localport>` -> proxies the tailnet/public 443 to http://localhost:<port>
        const r = await _ts([mode, "--bg", String(port)], 20000);
        if (r.code !== 0) {
            // common: funnel needs the tailnet HTTPS/funnel enabled -> the CLI prints a login/enable URL
            const enableUrl = ((r.stdout || "") + (r.stderr || "")).match(/https:\/\/login\.tailscale\.com\/\S+/);
            return { ok: false, error: (r.stderr || r.stdout || "failed").trim().slice(-400), enableUrl: enableUrl ? enableUrl[0] : null };
        }
        const st = await tailscaleStatus();
        return { ok: true, mode, url: st.url, dnsName: st.dnsName, note: mode === "funnel" ? "public HTTPS" : "tailnet-only" };
    } else {
        // turn it off: `tailscale <mode> --https=443 off` (or `<mode> off` for the whole config)
        const r = await _ts([mode, "off"], 12000);
        return { ok: r.code === 0, mode, off: true, error: r.code === 0 ? null : (r.stderr || r.stdout || "").trim().slice(-300) };
    }
}

// ---- install (winget, Windows only) -----------------------------------------
let _install = null;   // { tool, log, running, code, startedAt }
function install(tool) {
    if (!WIN && !MAC) return Promise.resolve({ ok: false, error: "automatic install is Windows (winget) and macOS (Homebrew) only — on this OS follow the manual instructions." });
    const id = WIN ? PKG[tool] : BREW[tool];
    if (!id) return Promise.resolve({ ok: false, error: "unknown tool" });
    if (_install && _install.running) return Promise.resolve({ ok: false, error: "an install is already running" });
    // *** v3741 -- macOS GOES THROUGH HOMEBREW, AND brew ITSELF HAS THE SAME PATH PROBLEM THE BINARY HAD.
    // v2856 fixed the LOOKUP of cloudflared through resolveBin and this function never got the same treatment,
    // so even once it could run, a nohup-launched server would not have found `brew` either -- the identical
    // bug one call deeper. resolveBin is reused rather than re-spelled. IF BREW IS ABSENT WE SAY SO BY NAME
    // instead of spawning a bare word and reporting whatever ENOENT comes back. ***
    if (!WIN) {
        const brew = resolveBin("brew");
        if (!brew.startsWith("/")) {
            return Promise.resolve({ ok: false, error: "Homebrew not found by this server. Install it from https://brew.sh, then retry — or run `brew install " + id + "` in a Terminal." });
        }
        if (_install && _install.running) return Promise.resolve({ ok: false, error: "an install is already running" });
        _install = { tool, log: "", running: true, code: null, startedAt: Date.now(), via: "brew", bin: brew };
        let mchild;
        try {
            // NONINTERACTIVE stops brew asking questions nobody is there to answer -- the panel has no stdin,
            // and a prompt would look exactly like a hang. HOMEBREW_NO_AUTO_UPDATE keeps a one-formula install
            // from turning into a full update nobody asked for.
            mchild = spawn(brew, ["install", id], {
                env: Object.assign({}, process.env, { NONINTERACTIVE: "1", HOMEBREW_NO_AUTO_UPDATE: "1" }),
            });
        } catch (e) {
            _install.running = false; _install.code = -1; _install.log += "spawn failed: " + (e && e.message);
            return Promise.resolve({ ok: false, error: "spawn failed: " + (e && e.message) });
        }
        const mcap = d => { _install.log += d; if (_install.log.length > 20000) _install.log = _install.log.slice(-20000); };
        if (mchild.stdout) mchild.stdout.on("data", mcap);
        if (mchild.stderr) mchild.stderr.on("data", mcap);
        mchild.on("error", e => { _install.running = false; _install.code = -1; _install.log += "\nerror: " + (e && e.message); });
        mchild.on("close", c => { _install.running = false; _install.code = c; });
        return Promise.resolve({ ok: true, started: true, tool, via: "brew" });
    }
    _install = { tool, log: "", running: true, code: null, startedAt: Date.now(), via: "winget" };
    const cmd = `winget install --id ${id} -e --source winget --accept-package-agreements --accept-source-agreements --disable-interactivity`;
    let child;
    try { child = spawn(cmd, [], { shell: true, windowsHide: true }); }
    catch (e) { _install.running = false; _install.code = -1; _install.log += "spawn failed: " + (e && e.message); return Promise.resolve({ ok: false, error: _install.log }); }
    const cap = d => { _install.log += d; if (_install.log.length > 20000) _install.log = _install.log.slice(-20000); };
    if (child.stdout) child.stdout.on("data", cap);
    if (child.stderr) child.stderr.on("data", cap);
    child.on("error", e => { _install.running = false; _install.code = -1; _install.log += "\nerror: " + (e && e.message); });
    child.on("close", c => { _install.running = false; _install.code = c; });
    return Promise.resolve({ ok: true, started: true, tool });
}
function installStatus() { return _install ? Object.assign({ ok: true }, _install) : { ok: true, running: false, tool: null, log: "", code: null }; }

// ---- Cloudflare quick tunnel ------------------------------------------------
let _tunnel = null;   // { proc, url, log, running, code, port, startedAt }
function tunnelStart(port) {
    // v1836 — a tunnel is only "already running" if its process is actually alive. When a
    // previous cloudflared was killed externally (not via the Stop button), _tunnel.running
    // could stay true and a real, live URL was registered — but the process is gone. Detect
    // that stale state (no proc, proc.killed, or exit code set) and clear it so Start works
    // again instead of getting stuck. If it's genuinely alive, return its URL as before.
    if (_tunnel && _tunnel.running) {
        const alive = _tunnel.proc && _tunnel.proc.killed === false && _tunnel.code === null && (typeof _tunnel.proc.exitCode !== "number" || _tunnel.proc.exitCode === null);
        if (alive) return { ok: false, error: "a tunnel is already running", url: _tunnel.url, running: true };
        // stale — reap it and fall through to start fresh
        try { if (_tunnel.proc) _tunnel.proc.kill(); } catch {}
        _tunnel.running = false;
    }
    const p = parseInt(port, 10) || 8787;
    // v2856 -- resolve the binary rather than trusting an inherited PATH (see resolveBin: a nohup-launched macOS
    // server does not have Homebrew on PATH, so the bare name never resolves).
    const bin = WIN ? "cloudflared" : resolveBin("cloudflared");
    const cmd = WIN ? `cloudflared tunnel --url http://localhost:${p}` : bin;
    const args = WIN ? [] : ["tunnel", "--url", "http://localhost:" + p];
    let proc;
    try { proc = spawn(cmd, args, { shell: WIN, windowsHide: true }); }
    catch (e) { return { ok: false, error: "spawn failed: " + (e && e.message) }; }
    _tunnel = { proc, url: null, log: "", running: true, code: null, port: p, startedAt: Date.now(), bin, reason: null };
    const scan = d => {
        _tunnel.log += String(d);
        if (_tunnel.log.length > 20000) _tunnel.log = _tunnel.log.slice(-20000);
        const found = extractTunnelUrl(_tunnel.log);
        if (found && !_tunnel.url) {
            _tunnel.url = found; _tunnel.verified = null; _tunnel.health = "checking";
            // v2277 — VERIFY the fresh URL actually answers before emailing it. Cloudflare quick tunnels come up
            // bad-gateway ~1/3 of the time; only email once it responds, and flag a dead one so it gets recycled
            // instead of us trusting (and mailing) a link that never worked.
            (async () => {
                try {
                    const v = await require("./tunnelHealth.js").verifyUrl(_tunnel.url, (u) => fetch(u, { cache: "no-store" }), { tries: 6, delayMs: 3000 });
                    _tunnel.verified = v.live; _tunnel.health = v.classification;
                    if (v.live) {
                        try { const r = require("./tunnelEmail.js").notify(_tunnel.url); if (r && r.catch) r.catch(function () {}); } catch (e) {}
                        _tunnel.log += "\n[tunnel] verified live after " + v.tries + " check(s) - emailed.";
                    } else {
                        _tunnel.log += "\n[tunnel] " + _tunnel.url + " did not verify (" + v.classification + ") after " + v.tries + " checks - NOT emailing; recycle with POST /tunnel/ensure-live.";
                    }
                } catch (e) {}
            })();
        }
    };
    if (proc.stdout) proc.stdout.on("data", scan);
    if (proc.stderr) proc.stderr.on("data", scan);   // cloudflared prints the banner/URL to stderr
    // v2856 -- A SPAWN FAILURE IS ASYNCHRONOUS, AND THAT IS WHY THIS LOOKED LIKE NOTHING HAPPENING. spawn() does
    // not throw on a missing binary; it emits 'error' on the next tick, so the try/catch above never sees it. The
    // old code set running:true, returned {ok:true, started:true} -- a SUCCESS for a process that never existed --
    // and then quietly flipped running:false. The page polled 1.5s later, saw running:false, and printed
    // "no tunnel running". THE REASON WAS IN THE LOG THE WHOLE TIME AND NOTHING CARRIED IT TO THE SCREEN.
    //
    // A control that reports success on a failure is worse than one that fails loudly. So classify it and keep it.
    proc.on("error", e => {
        _tunnel.running = false; _tunnel.code = -1;
        const msg = String((e && e.message) || e);
        _tunnel.log += "\nerror: " + msg;
        _tunnel.reason = /ENOENT/i.test(msg)
            ? "cloudflared was not found at " + bin + ". Install it (macOS: brew install cloudflared) -- or, if it IS installed, this server's PATH cannot see it: a launcher started with nohup/disown does not source your login profile, so Homebrew's bin directory is missing. Starting the server from a normal Terminal, or reinstalling cloudflared into /usr/local/bin, both fix it."
            : /EACCES/i.test(msg)
            ? "cloudflared at " + bin + " is not executable by this user (EACCES). chmod +x it, or reinstall it."
            : "cloudflared could not be started: " + msg;
    });
    proc.on("close", c => {
        _tunnel.running = false; _tunnel.code = c;
        // A non-zero exit with no URL is also a real answer -- surface cloudflared's own last words rather than
        // letting the page fall back to the generic "no tunnel running".
        //
        // v3809 -- *** THE OLD GUARD `&& c` STILL LEFT ONE DOOR OPEN TO THE VERY MESSAGE v2856 SET OUT TO
        // KILL. *** c is 0 on a clean-but-URL-less exit and null when the process is KILLED by a signal rather
        // than exiting -- both falsy, both leaving reason null, both landing on "no tunnel running" for a start
        // that genuinely failed. A URL-less close is a failure whatever the code; the ONE close that is not is a
        // user pressing Stop, which now flags _tunnel.stopped so we can tell the two apart instead of guessing
        // from the exit code. So: reason on every URL-less, non-stopped close.
        if (!_tunnel.url && !_tunnel.reason && !_tunnel.stopped) {
            const tail = String(_tunnel.log || "").trim().split("\n").slice(-3).join(" ").slice(0, 300);
            // v3815 -- name the CAUSE first when cloudflared gave one. A tail of log is evidence; a classified
            // cause is an instruction, and the tail is kept after it so nothing is hidden by the summary.
            const cause = classifyTunnelFailure(_tunnel.log);
            _tunnel.reason = (cause ? cause + " " : "") +
                (c ? ("cloudflared exited with code " + c) : "cloudflared stopped (killed by signal or exited 0)") +
                " before giving a URL." +
                (tail ? " Last output: " + tail : " No output was captured -- confirm cloudflared is installed and on this server's PATH.");
        }
    });
    return { ok: true, started: true, port: p, bin };
}
// v3815 -- *** THE URL SCANNER READ THE ERROR MESSAGE AS AN ADDRESS. ***
//
// Keith's tunnel went to "starting" and then to "no tunnel running", with the answer sitting in cloudflared's
// own output: `failed to request quick Tunnel: Post "https://api.trycloudflare.com/tunnel": remote error: tls:
// internal error`. REPRODUCED WITH A STUB cloudflared THAT PRINTS EXACTLY THAT AND EXITS 1, and the bridge
// recorded url = "https://api.trycloudflare.com".
//
// The old pattern was /https:\/\/[a-z0-9-]+\.trycloudflare\.com/i, and `api` matches [a-z0-9-]+. So THE HOST
// CLOUDFLARED TALKS TO WAS HARVESTED OUT OF THE SENTENCE SAYING IT COULD NOT BE REACHED, and three things
// followed from that one match:
//   1. the close handler's guard is `if (!_tunnel.url ...)` -- a URL was set, so THE v3809 REASON NEVER FIRED
//      and the panel fell through to the generic "no tunnel running" that v2856 and v3809 both set out to kill;
//   2. verifyUrl() was pointed at Cloudflare's control plane, and had it answered 200 the tunnel would have
//      been marked live;
//   3. *** AND tunnelEmail.notify() WOULD HAVE EMAILED KEITH https://api.trycloudflare.com AS HIS TUNNEL. ***
//      A failure that mails you a working-looking link is worse than one that mails nothing.
//
// TWO RULES, AND NEITHER CAN REJECT A GENUINE BANNER URL -- which is the property that matters, because a
// scanner that misses the real address turns a working tunnel into a silent one:
//   (a) a line that is REPORTING A FAILURE is not advertising an address. cloudflared's success banner says
//       "Your quick Tunnel has been created! Visit it at" and contains none of these words.
//   (b) `api` is Cloudflare's control plane and is never a tunnel hostname. Quick tunnels get random words.
// Deliberately NOT used as a rule: "a real one contains a hyphen". It is true of every quick tunnel I have
// seen and it is A GUESS ABOUT SOMEBODY ELSE'S NAMING, and the failure mode of guessing wrong is the worst
// one available here -- a live tunnel the panel refuses to show.
const NOT_A_TUNNEL_HOST = new Set(["api", "dash", "www", "developers", "developer", "blog"]);
function extractTunnelUrl(log) {
    for (const line of String(log || "").split(/\r?\n/)) {
        if (/fail|error|refus|timeout|unable|cannot|Post\s+"/i.test(line)) continue;
        const m = line.match(/https:\/\/([a-z0-9-]+)\.trycloudflare\.com/i);
        if (m && !NOT_A_TUNNEL_HOST.has(m[1].toLowerCase())) return m[0];
    }
    return null;
}

// v3815 -- cloudflared's last words, turned into something a person can act on. Same shape as the ENOENT and
// EACCES branches above: the point of a classifier is that the panel says WHAT TO DO, not just what happened.
function classifyTunnelFailure(log) {
    const t = String(log || "");
    if (/remote error: tls|tls: internal error|tls: handshake failure/i.test(t)) {
        // v3819 -- THE GUESS CAME OUT OF THIS SENTENCE. It used to end "most often an out-of-date cloudflared:
        // update it (macOS: brew upgrade cloudflared)", which was a statistic about other machines plus a
        // command that cannot be typed on Windows. The panel now runs tunnelPreflight() when it shows this,
        // and that MEASURES which of the two it is -- they have opposite fixes. So this says only what the
        // log actually establishes and hands the rest to the measurement.
        return "Cloudflare refused the quick-tunnel request at the TLS layer (the alert came from " +
               "api.trycloudflare.com, not from this machine). THIS IS NOT YOUR SERVER -- the local port was " +
               "never even tried. It is either the cloudflared binary or something intercepting TLS on the way " +
               "out, AND THOSE HAVE OPPOSITE FIXES, so the panel measures which rather than guessing.";
    }
    if (/failed to request quick Tunnel/i.test(t)) {
        return "Cloudflare would not issue a quick tunnel. This is the account-less trycloudflare service, " +
               "which carries no uptime guarantee -- retry, or use a named tunnel.";
    }
    if (/429|rate limit/i.test(t)) return "Cloudflare rate-limited the quick-tunnel request. Wait and retry.";
    return null;
}

// v2708 — WHY won't the tunnel attach? Probe cloudflared's actual target (http://127.0.0.1:PORT/health) and classify.
// A stuck-502 tunnel almost always means the server isn't listening on localhost (bound to the LAN IP only), which is
// exactly what cloudflared tunnels to. Ready to wire to a button on the Cloud & Hosting panel.
async function diagnoseTunnelTarget(port) {
    const p = parseInt(port, 10) || (_tunnel && _tunnel.port) || 8787;
    let probe;
    try { const r = await fetch("http://127.0.0.1:" + p + "/health", { cache: "no-store" }); probe = { ok: r.ok, status: r.status }; }
    catch (e) { probe = { error: String((e && e.message) || e) }; }
    const cls = require("./tunnelHealth.js").classifyTarget(probe);
    const msg = cls === "target-reachable" ? "Server answers on localhost:" + p + " -- cloudflared can attach. A 502 is transient or a Cloudflare-edge issue."
        : cls === "target-unreachable" ? "Nothing answers on http://127.0.0.1:" + p + " -- cloudflared tunnels to localhost, so it cannot attach. Your server is likely bound to the LAN IP only; bind it to 0.0.0.0 (or add 127.0.0.1)."
        : "Could not determine the local target state.";
    return { ok: true, port: p, classification: cls, probe, message: msg };
}

function tunnelStop() { if (_tunnel && _tunnel.proc) { try { _tunnel.stopped = true; _tunnel.proc.kill(); } catch {} _tunnel.running = false; } return { ok: true, stopped: true }; }
function tunnelStatus() { return _tunnel ? { ok: true, running: _tunnel.running, url: _tunnel.url, verified: _tunnel.verified, health: _tunnel.health, port: _tunnel.port, code: _tunnel.code, bin: _tunnel.bin || null, reason: _tunnel.reason || null, log: _tunnel.log.slice(-4000) } : { ok: true, running: false, url: null, reason: null, log: "" }; }

// v2277 — if no external URL is verified-live, make a fresh one (tunnelStart verifies + emails it). Recycles a
// running-but-bad-gateway tunnel. Safe to call from a button or a timer; the endgame "no live url -> make one
// and email it" the operator asked for.
async function ensureLiveTunnel(port) {
    let aliveUrls = [];
    try { aliveUrls = require("./tunnelRegistry.js").aliveUrls() || []; } catch {}
    const curVerified = (_tunnel && _tunnel.running && _tunnel.verified === true && _tunnel.url) ? [_tunnel.url] : [];
    const live = [...aliveUrls, ...curVerified].filter(Boolean);
    // a tunnel that's up but still verifying (born < 45s ago) gets the benefit of the doubt -- don't thrash it.
    if (_tunnel && _tunnel.running && _tunnel.verified === null && (Date.now() - (_tunnel.startedAt || 0) < 45000)) {
        return { ok: true, action: "verifying", url: _tunnel.url, note: "a fresh tunnel is still being checked" };
    }
    const plan = require("./tunnelHealth.js").planEnsure(live);
    if (!plan.needNew) return { ok: true, action: "kept", liveUrls: live };
    if (_tunnel && _tunnel.running) { try { tunnelStop(); } catch {} }   // stop a dead/bad-gateway one first
    const r = tunnelStart(port || (_tunnel && _tunnel.port) || 8787);
    return { ok: !!(r && r.ok), action: "made-new", start: r, note: "the new URL will be emailed once it verifies live" };
}


// v1682 — which SweK page the public (Cloudflare) tunnel serves at its root URL. Default: the Server console.
const fs = require("fs");
const os = require("os");
const path = require("path");
const _LAND_PATH = path.join(os.homedir(), ".voxelbridge", "hosting.json");
let _landing = null;
function getLanding() {
    if (_landing) return _landing;
    try { const j = JSON.parse(fs.readFileSync(_LAND_PATH, "utf8")); if (j && j.landing) { _landing = String(j.landing); return _landing; } } catch {}
    _landing = "server.html"; return _landing;
}
function setLanding(page) {
    page = String(page || "server.html").replace(/^\/+/, "").trim() || "server.html";
    _landing = page;
    try { fs.mkdirSync(path.dirname(_LAND_PATH), { recursive: true }); fs.writeFileSync(_LAND_PATH, JSON.stringify({ landing: page }), { mode: 0o600 }); } catch {}
    return { ok: true, page };
}

module.exports = { extractTunnelUrl, classifyTunnelFailure, tlsProbe, tunnelPreflight, diagnoseTunnelTarget, detect, install, installStatus, tunnelStart, tunnelStop, tunnelStatus, ensureLiveTunnel, getLanding, setLanding, tailscaleStatus, tailscaleExpose, PKG };
