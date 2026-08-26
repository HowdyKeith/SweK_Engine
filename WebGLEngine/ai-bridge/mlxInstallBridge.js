// mlxInstallBridge.js — v1139 (lifecycle added v4037)
// Mac-side "install buttons + detect" for local OpenAI-compatible MLX servers, the
// counterpart to the PC asset-pipeline installer. DETECT works on any OS (it just
// probes ports). INSTALL is gated to darwin (these are Apple-Silicon tools) and shells
// out to the documented commands — rig-verify on the Mac, since the sandbox can't run
// brew/pip installs. Commands are best-effort; the panel shows them so they're auditable.
//
// v4037 -- Keith, right after the Mac System panel shipped this config: "can we fill in the qwen weights
// download for the mac too? so it will auto install as much as possible, and then be able to run. would we be
// able to have the SweK engine report [a local MLX brain] is available, and then run on demand? and then exit
// when idle?" (his own words said "GPU Brain" -- this file deliberately does NOT reuse that name: it already
// belongs to gpuBrainBridge.js's unrelated flow-field/policy fleet for the kaiju sim, and reusing it here for a
// chat brain would be exactly the naming collision this tree's own "second copy" lesson warns about.)
//
// THREE NEW PIECES, ALL GATED TO THE SAME isMac THIS FILE ALREADY REQUIRED FOR install():
//
//   pullModel(modelId)   -- installs mlx-lm if it is not already on PATH, then triggers mlx_lm's own
//                           HuggingFace download by calling `mlx_lm.load(modelId)` from a one-line python
//                           script. THIS IS WHY mlx-lm IS THE TARGET AND NOT THE OTHER THREE CATALOG ENTRIES:
//                           Rapid-MLX, Osaurus and vMLX are brew-cask GUI apps with their OWN model managers,
//                           and this bridge has no documented, scriptable way to tell any of them "fetch this
//                           HuggingFace repo" -- mlx-lm is the one entry here that is a plain pip package with a
//                           one-line python API for exactly that. "Auto install as much as possible" stops at
//                           this boundary and says so, rather than guessing a command for a GUI app's internals.
//
//   ensureRunning(base, modelId) -- THE ON-DEMAND HALF. Only engages when isMac AND base is a LOCAL address
//                           (127.0.0.1/localhost) -- i.e. only when THIS bridge process is itself running on
//                           the Mac being asked about. Keith's other documented use of this panel is pointing an
//                           engine on a DIFFERENT machine at a Mac reachable over the LAN, and this file has no
//                           way to launch a process on a box it is not running on -- so a remote base is left
//                           untouched, exactly as before this round. When local and nothing answers /v1/models,
//                           it spawns `mlx_lm.server --model <id> --port <port>` DETACHED (its own process
//                           group, so the whole group can be killed together later) and polls until it answers
//                           or 90s passes -- long enough for a model already on disk to load into RAM, short of
//                           what a COLD multi-gigabyte download would need, which is why pullModel exists as a
//                           separate, explicit, much-longer-timeout step: pre-fetch the weights via the panel's
//                           button BEFORE the first chat request ever has to wait on a download.
//
//   the idle reaper       -- touch() is called by aiProviders.mlxChat on every successful reply through a
//                           bridge-MANAGED server (never on one the reader started by hand -- _managed is only
//                           set by ensureRunning's own spawn). A 30s-interval, unref'd check (so it can never by
//                           itself keep the bridge process alive) kills the tracked process group once it has
//                           gone IDLE_MS (default 10 minutes, MLX_IDLE_MS overridable) without a touch, freeing
//                           the unified memory a loaded model was holding. _shouldReap() is kept PURE (managed
//                           record, now, limit) -> boolean specifically so a gate can assert the reap decision
//                           against synthetic timestamps rather than waiting on a real 10-minute clock.
//
// Everything new here takes its process/network calls as OPTIONAL injected params (spawnImpl, fetchImpl),
// default to the real thing, matching this tree's ollamaReadiness.mjs pattern -- so tools/ship/mlxLifecycle-
// selfcheck.mjs can drive every branch (spawn failure, timeout, already-running, remote base, non-mac) without
// a real Mac, a real pip install, or a real gigabyte download.

const { spawn, execFile } = require("child_process");
const isMac = process.platform === "darwin";

// Known local OpenAI-compatible MLX servers. `port` is the usual default; detect also
// probes whatever base URL is saved in the Local MLX config.
// v4038 -- Keith, right after the Install/Reinstall buttons: "if we install it, can we also have an uninstall
// button?" `uninstall` is the mirror of `install` on every entry where a package manager put it there in the
// first place -- pip and brew both take the command back out exactly as directly as they put it in, so this is
// one field per entry, not a new mechanism. TurboFieldfare gets none: it was never a package install (`install:
// null` already refuses that fiction below), it is a git clone plus a `swift build`, and there is no single
// command that undoes "a folder exists somewhere the reader chose to clone it" -- so `uninstall: null` refuses
// with the real removal step (delete the cloned directory) instead of a command that has nothing to act on.
const CATALOG = [
    { id: "mlx-lm", label: "MLX-LM (Apple official)", bin: "mlx_lm.server", port: 8080,
      install: ["pip3", ["install", "-U", "mlx-lm"]], uninstall: ["pip3", ["uninstall", "-y", "mlx-lm"]],
      run: "mlx_lm.server --model <hf-model> --port 8080",
      note: "Apple's reference MLX server. After install, run: mlx_lm.server --model mlx-community/Llama-3.2-3B-Instruct-4bit --port 8080" },
    { id: "rapid-mlx", label: "Rapid-MLX (fastest)", bin: "rapid-mlx", port: 8080,
      install: ["pip3", ["install", "-U", "rapid-mlx"]], uninstall: ["pip3", ["uninstall", "-y", "rapid-mlx"]],
      run: "rapid-mlx serve",
      note: "Drop-in OpenAI server, ~4x faster than Ollama on Apple Silicon. Verify the exact start command in the repo." },
    { id: "osaurus", label: "Osaurus (native, MCP)", bin: "osaurus", port: 1234,
      install: ["brew", ["install", "--cask", "osaurus"]], uninstall: ["brew", ["uninstall", "--cask", "osaurus"]],
      run: "open -a Osaurus",
      note: "Native macOS runtime (Swift). If the cask name differs, grab the .dmg from the repo releases." },
    { id: "vmlx", label: "vMLX (prefix cache)", bin: "vmlx", port: 8080,
      install: ["brew", ["install", "--cask", "vmlx"]], uninstall: ["brew", ["uninstall", "--cask", "vmlx"]],
      run: "open -a vMLX",
      note: "MLX inference app with prefix caching + MCP. Cask name may vary; check the site." },
    // v4016 -- *** THE FIRST ENTRY HERE WITH NO ONE-COMMAND INSTALL, AND SAYING SO IS THE POINT. *** Every
    // other item is a pip or brew line this bridge can spawn. TurboFieldfare (drumih/turbo-fieldfare) is a
    // Swift package built from source -- git clone, then `swift build -c release` -- plus a ~15 GB model
    // download the app itself performs on first run. `install: null` is what makes install() refuse with the
    // real steps instead of spawning a package manager that was never going to have it. Its README's own
    // stated requirements: Apple Silicon, macOS 26, Swift 6.2, Metal 4, 8 GB RAM -- and its server's default
    // port is 8080, which is already in the probe set above, so detect() finds it with nothing added.
    { id: "turbofieldfare", label: "TurboFieldfare (Gemma 4 26B in ~2 GB)", bin: "TurboFieldfareServer", port: 8080,
      install: null, uninstall: null,
      run: "swift build -c release --product TurboFieldfareServer && .build/release/TurboFieldfareServer --model scratch/gemma4.gturbo --port 8080",
      note: "Source build, not a package: git clone https://github.com/drumih/turbo-fieldfare && cd turbo-fieldfare && swift build -c release, then run TurboFieldfareMac once to download the model (~15 GB). Needs Apple Silicon + macOS 26. Streams experts from SSD, so a 26B model runs in about 2 GB of RAM.",
      uninstallNote: "delete the cloned turbo-fieldfare directory (git clone https://github.com/drumih/turbo-fieldfare) -- there is no package for a package manager to remove" },
];

// v4037 -- a real, small mlx-community repo (verified this round the same way ui/modelRepoCandidates.js's ids
// were: cross-checked via web search rather than a live huggingface.co fetch, which this environment cannot
// make). Used ONLY when the reader has typed nothing into the model field -- the field itself always wins.
const DEFAULT_QWEN_MODEL = "mlx-community/Qwen2.5-1.5B-Instruct-4bit";
const IDLE_MS = Number(process.env.MLX_IDLE_MS) > 0 ? Number(process.env.MLX_IDLE_MS) : 10 * 60 * 1000;
const READY_POLL_MS = 90000;      // how long ensureRunning waits for an already-downloaded model to load into RAM
const PULL_TIMEOUT_MS = 30 * 60 * 1000;   // a cold multi-gigabyte download gets a much longer budget

function _which(bin) { return new Promise((res) => { execFile(isMac || process.platform === "linux" ? "which" : "where", [bin], (e, o) => res(!e && !!String(o).trim())); }); }

async function _probe(base, fetchImpl) {
    const f = fetchImpl || fetch;
    const url = base.replace(/\/+$/, "") + "/v1/models";
    try {
        const r = await f(url, { signal: AbortSignal.timeout(2500) });
        if (!r.ok) return null;
        const d = await r.json().catch(() => ({}));
        const models = (d && (d.data || d.models) || []).map(m => m.id || m.name || m).filter(Boolean).slice(0, 12);
        return { base: base.replace(/\/+$/, ""), models };
    } catch { return null; }
}

// v4037 -- pure: no fetch, no clock read. Kept separate from ensureRunning's caller so a gate can assert "which
// bases count as local" without spinning up any process.
function _isLocalBase(base) {
    try { const h = new URL(base).hostname.toLowerCase(); return h === "127.0.0.1" || h === "localhost" || h === "::1"; }
    catch { return false; }
}

function catalog() {
    return { ok: true, platform: process.platform, supported: isMac,
        items: CATALOG.map(({ id, label, port, run, note, install, uninstall, uninstallNote }) =>
            ({ id, label, port, run, note, installable: !!install, uninstallable: !!uninstall, uninstallNote: uninstallNote || null })) };
}

// Probe the saved base URL + each catalog default port for a live OpenAI server, and
// check which tool binaries are installed.
async function detect(savedBaseUrl) {
    const bases = new Set();
    if (savedBaseUrl) bases.add(savedBaseUrl);
    for (const c of CATALOG) bases.add("http://127.0.0.1:" + c.port);
    for (const p of [1234, 8000, 11432]) bases.add("http://127.0.0.1:" + p);
    const servers = (await Promise.all([...bases].map((b) => _probe(b)))).filter(Boolean);
    const installed = {};
    for (const c of CATALOG) installed[c.id] = await _which(c.bin);
    return { ok: true, platform: process.platform, supported: isMac, servers, installed };
}

// v4037 -- `_isMac` is an injectable override (default: the real check) so tools/ship/mlxLifecycle-selfcheck.mjs
// can exercise the mac-gated branches of install()/uninstall() from a non-Mac CI box; production never passes
// it, so the default is always what actually runs. `spawnImpl` was already the seam ollamaReadiness.mjs's own
// pattern uses -- both functions below take it for the same reason.
async function install(id, { spawnImpl = spawn, _isMac = isMac } = {}) {
    if (!_isMac) return { ok: false, supported: false, error: "these installers are macOS-only (run on the Apple-Silicon Mac)" };
    const item = CATALOG.find(c => c.id === id);
    if (!item) return { ok: false, error: "unknown item " + id };
    // A SOURCE BUILD IS NOT A FAILED PACKAGE INSTALL. Refusing with the real steps beats spawning a package
    // manager that will report "no such formula" for something that was never in a package manager.
    if (!item.install) return { ok: false, installable: false, error: item.label + " builds from source rather than installing from a package manager", run: item.run, note: item.note };
    return new Promise((resolve) => {
        const [cmd, args] = item.install;
        let out = "", err = "", child;
        try { child = spawnImpl(cmd, args, { windowsHide: true }); }
        catch (e) { return resolve({ ok: false, error: "spawn: " + e.message + " (is " + cmd + " installed?)" }); }
        const t = setTimeout(() => { try { child.kill(); } catch {} resolve({ ok: false, error: "timed out", out: out.slice(-3000) }); }, 600000);
        child.stdout.on("data", d => out += d);
        child.stderr.on("data", d => err += d);
        child.on("error", e => { clearTimeout(t); resolve({ ok: false, error: cmd + ": " + e.message }); });
        child.on("close", code => { clearTimeout(t); resolve({ ok: code === 0, code, cmd: cmd + " " + args.join(" "), out: (out + err).slice(-4000), run: item.run, note: item.note }); });
    });
}

// v4038 -- Keith: "if we install it, can we also have an uninstall button?" The mirror of install() above,
// byte-for-byte the same shape, running `item.uninstall` instead of `item.install`. An entry with no uninstall
// command (TurboFieldfare: a git clone, not a package) refuses with the real removal step in `uninstallNote`
// rather than spawning a package manager that was never involved -- the exact same reasoning install() already
// applies for its own `install: null` case, applied to the opposite direction.
async function uninstall(id, { spawnImpl = spawn, _isMac = isMac } = {}) {
    if (!_isMac) return { ok: false, supported: false, error: "these installers are macOS-only (run on the Apple-Silicon Mac)" };
    const item = CATALOG.find(c => c.id === id);
    if (!item) return { ok: false, error: "unknown item " + id };
    if (!item.uninstall) return { ok: false, uninstallable: false, error: item.label + " has no single uninstall command" + (item.uninstallNote ? " -- " + item.uninstallNote : ""), note: item.note };
    return new Promise((resolve) => {
        const [cmd, args] = item.uninstall;
        let out = "", err = "", child;
        try { child = spawnImpl(cmd, args, { windowsHide: true }); }
        catch (e) { return resolve({ ok: false, error: "spawn: " + e.message + " (is " + cmd + " installed?)" }); }
        const t = setTimeout(() => { try { child.kill(); } catch {} resolve({ ok: false, error: "timed out", out: out.slice(-3000) }); }, 600000);
        child.stdout.on("data", d => out += d);
        child.stderr.on("data", d => err += d);
        child.on("error", e => { clearTimeout(t); resolve({ ok: false, error: cmd + ": " + e.message }); });
        child.on("close", code => { clearTimeout(t); resolve({ ok: code === 0, code, cmd: cmd + " " + args.join(" "), out: (out + err).slice(-4000) }); });
    });
}

// v4037 -- fetch the actual weights, not just the server. Reuses install()'s own pip step when mlx_lm.server is
// not yet on PATH (one installer, not a second copy of the pip-spawn dance), then triggers mlx-lm's own
// HuggingFace fetch via `from mlx_lm import load; load(<model>)` -- the one line mlx-lm's own docs give for
// "make sure this repo is downloaded and cached", which is exactly the state ensureRunning's later spawn needs
// to find already true so its much-shorter 90s readiness window is spent loading into RAM, not downloading.
// v4037 -- `_isMac` defaults to the real platform check but is an injectable param (like spawnImpl/fetchImpl
// below) precisely so tools/ship/mlxLifecycle-selfcheck.mjs can drive the mac-gated branches from a Linux CI
// box: production code never passes it, so the default is always what actually runs.
async function pullModel(modelId, { spawnImpl = spawn, whichImpl = _which, _isMac = isMac } = {}) {
    if (!_isMac) return { ok: false, supported: false, error: "model pulls are macOS-only (run on the Apple-Silicon Mac)" };
    const model = String(modelId || "").trim() || DEFAULT_QWEN_MODEL;
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]*\/[A-Za-z0-9][A-Za-z0-9._-]*$/.test(model))
        return { ok: false, error: "expected a HuggingFace model id like owner/name, got " + JSON.stringify(model) };
    let installLog = null;
    if (!(await whichImpl("mlx_lm.server"))) {
        const r = await install("mlx-lm");
        if (!r.ok) return { ok: false, error: "mlx-lm install failed: " + (r.error || "see log"), installLog: r };
        installLog = r;
    }
    return new Promise((resolve) => {
        const code = "from mlx_lm import load\nload(" + JSON.stringify(model) + ")\nprint('MLX_PULL_OK')\n";
        let out = "", err = "", child;
        try { child = spawnImpl("python3", ["-c", code], { windowsHide: true }); }
        catch (e) { resolve({ ok: false, error: "spawn: " + e.message, installLog }); return; }
        const t = setTimeout(() => { try { child.kill(); } catch {} resolve({ ok: false, error: "timed out (a large model over a slow connection can take a while)", out: (out + err).slice(-3000), installLog }); }, PULL_TIMEOUT_MS);
        child.stdout.on("data", d => out += d);
        child.stderr.on("data", d => err += d);   // huggingface_hub's own download progress prints here
        child.on("error", e => { clearTimeout(t); resolve({ ok: false, error: "python3: " + e.message, installLog }); });
        child.on("close", exitCode => {
            clearTimeout(t);
            const ok = exitCode === 0 && /MLX_PULL_OK/.test(out);
            resolve({ ok, model, out: (out + err).slice(-4000), installLog });
        });
    });
}

// v4037 -- THE MANAGED SLOT. One at a time: the Local MLX config is a single base URL, so there is only ever
// one server this bridge itself would have launched. `proc` is kept (not just the pid) so exit/error listeners
// can clear the slot the moment the process dies on its own, and touch()/managedStatus() never have to guess
// whether a stale pid is still the process that owns it.
let _managed = null;

function touch() { if (_managed) _managed.lastUsedAt = Date.now(); }

function managedStatus() {
    if (!_managed) return { ok: true, managed: false, idleLimitMs: IDLE_MS };
    const now = Date.now();
    return {
        ok: true, managed: true, pid: _managed.pid, model: _managed.model, port: _managed.port, base: _managed.base,
        startedAt: _managed.startedAt, lastUsedAt: _managed.lastUsedAt,
        idleMs: now - _managed.lastUsedAt, idleLimitMs: IDLE_MS,
        log: _managed.log.slice(-2000),
    };
}

// v4037 -- kills the whole DETACHED PROCESS GROUP (spawn's own pid becomes the group id when detached:true),
// because mlx_lm.server can fork worker processes and killing only the parent would leave those running and
// still holding the memory this whole reaper exists to free. Falls back to a plain child.kill() if the group
// kill is refused (e.g. already gone, or a platform where negative-pid kill is not meaningful).
function stopManaged(reason) {
    if (!_managed) return { ok: true, wasRunning: false };
    const pid = _managed.pid, proc = _managed.proc;
    try { process.kill(-pid, "SIGTERM"); }
    catch { try { proc.kill(); } catch {} }
    _managed = null;
    return { ok: true, wasRunning: true, pid, reason: reason || "manual" };
}

// v4037 -- PURE, on purpose: (managed record, now, idle limit) -> boolean, with no clock read and no process
// kill inside it. tools/ship/mlxLifecycle-selfcheck.mjs asserts this against synthetic timestamps rather than
// waiting out a real 10-minute idle window.
function _shouldReap(managed, nowMs, idleLimitMs) {
    return !!managed && (nowMs - managed.lastUsedAt) > idleLimitMs;
}

let _reaperStarted = false;
function _startReaperOnce() {
    if (_reaperStarted) return;
    _reaperStarted = true;
    // unref'd: a timer that exists only to free memory must never be the reason this bridge process itself
    // cannot exit -- the same reasoning gpuBrainBridge.js's own lazy-save interval already applies.
    setInterval(() => { if (_shouldReap(_managed, Date.now(), IDLE_MS)) stopManaged("idle"); }, 30000).unref?.();
}

// v4037 -- THE ON-DEMAND HALF. Only ever spawns a process when isMac AND base is local -- see this file's own
// header for why a remote (LAN) base is deliberately left untouched. Returns without throwing in every branch;
// a caller (aiProviders.mlxChat) that ignores the result gets exactly today's pre-v4037 behaviour on failure.
async function ensureRunning(base, modelId, { spawnImpl = spawn, fetchImpl, _isMac = isMac } = {}) {
    if (!_isMac) return { ok: false, supported: false, error: "on-demand start is macOS-only" };
    if (!_isLocalBase(base)) return { ok: false, skipped: true, error: "not a local address -- this bridge can only launch a server on the machine it is itself running on" };
    if (await _probe(base, fetchImpl)) { touch(); return { ok: true, alreadyRunning: true }; }
    if (!_managed) {
        const port = (() => { try { return Number(new URL(base).port) || 8080; } catch { return 8080; } })();
        const model = String(modelId || "").trim() || DEFAULT_QWEN_MODEL;
        let child;
        try { child = spawnImpl("mlx_lm.server", ["--model", model, "--port", String(port)], { detached: true, stdio: ["ignore", "pipe", "pipe"] }); }
        catch (e) { return { ok: false, error: "spawn: " + e.message + " (is mlx-lm installed? see Detect/Install above)" }; }
        _managed = { proc: child, pid: child.pid, model, port, base, startedAt: Date.now(), lastUsedAt: Date.now(), log: "" };
        const mine = _managed;
        child.stdout && child.stdout.on("data", d => { mine.log = (mine.log + d).slice(-4000); });
        child.stderr && child.stderr.on("data", d => { mine.log = (mine.log + d).slice(-4000); });
        child.on("exit", () => { if (_managed === mine) _managed = null; });
        child.on("error", () => { if (_managed === mine) _managed = null; });
        _startReaperOnce();
    }
    // Poll for readiness. A model already pulled via pullModel() just needs to load into RAM; one never pulled
    // will likely still be downloading when this window closes -- reported as stillStarting rather than killed,
    // because the process is left running and a later call (or /mlx/status) can still catch it coming up.
    const deadline = Date.now() + READY_POLL_MS;
    while (Date.now() < deadline) {
        if (await _probe(base, fetchImpl)) { touch(); return { ok: true, started: true, pid: _managed && _managed.pid, model: _managed && _managed.model }; }
        await new Promise((r) => setTimeout(r, 1000));
    }
    return {
        ok: false, stillStarting: true, pid: _managed && _managed.pid,
        error: "no answer within " + Math.round(READY_POLL_MS / 1000) + "s yet -- it may still be loading (or, if the weights were never pre-pulled, downloading them now); it is left running in the background, check /mlx/status",
    };
}

module.exports = {
    catalog, detect, install, uninstall,
    DEFAULT_QWEN_MODEL, pullModel, ensureRunning, touch, managedStatus, stopManaged,
    _isLocalBase, _shouldReap,   // exported for tools/ship/mlxLifecycle-selfcheck.mjs; not part of the HTTP surface
};
