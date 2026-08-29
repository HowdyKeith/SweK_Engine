// WebGLEngine/ai-bridge/pairlaneBridge.js -- v4107
//
// kiyo-e/pairlane (MIT): HAND A FILE TO SOMEBODY WHO HAS NOTHING INSTALLED.
//
// *** WHY THIS EARNS A PLACE IN A TREE THAT ALREADY HAS THREE P2P PATHS, STATED FIRST BECAUSE IT IS THE ONLY
// QUESTION THAT MATTERS. *** This engine can already move files:
//   - webtorrentBridge.js seeds its own output folders over WebTorrent, no central server;
//   - copyparty (autoInstall.js) gives the Termux/a-Shell phone peers a file server;
//   - the trusted-peer + PIN path moves a walked directory between SweK boxes.
// EVERY ONE OF THOSE ASSUMES THE OTHER END IS EQUIPPED -- a torrent client, a phone with copyparty installed,
// or a SweK box that has already passed the trust gate. NONE of them covers "send this to a person who has a
// browser and nothing else, right now". That is the gap, and it is the only reason this file exists.
//
// *** ORCHESTRATION ONLY, WHICH IS comicTranslateBridge.js's SHAPE AND FOR THE SAME REASON. *** The transfer is
// WebRTC between two endpoints; the room/signalling is a Cloudflare Worker + Durable Object that kiyo-e already
// runs at https://getpairlane.com. NOTHING IS REIMPLEMENTED HERE. This bridge spawns the published CLI, reads
// the room URL it prints, and reports it.
//
// *** THE PLATFORM LIMIT IS THE FIRST THING status() REPORTS, AND IT IS NOT A DETAIL. *** pairlane's own README
// lists supported platforms as Linux (x86_64) and macOS (Intel / Apple Silicon). *** WINDOWS IS NOT ON THAT
// LIST, AND KEITH'S PRIMARY RIG IS WINDOWS. *** A bridge that spawned `npx pairlane` there anyway would fail
// with whatever npm says about a missing optional binary -- a confusing error that reads like a bug in SweK.
// So the refusal is explicit, named, and carries the README's own platform list. Build-from-source (`cd cli &&
// cargo run`) MIGHT work on Windows; the README does not claim it, this box cannot test it, so it is offered as
// a possibility in the refusal text rather than asserted as a fact.
//
// *** THE PRINTED URL CONTAINS THE DECRYPTION KEY. TREAT IT LIKE A TOKEN. *** Encryption is on by default and
// the key rides in the URL FRAGMENT (`#k=...`), which is exactly what makes it end-to-end: a fragment is never
// sent to the server. The consequence for THIS file is that the URL is a SECRET -- anyone holding it can pull
// the file. So it is returned to the caller that asked for it and is NEVER written to the engine's shared debug
// log or the demo-chrome ticker, both of which fan out to every connected page. The route is local-only for the
// same reason, one layer up.
"use strict";

const { spawn } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const IS_WIN = process.platform === "win32";
// The README's own list, quoted rather than paraphrased, so the refusal below cites its source.
const SUPPORTED = "Linux (x86_64), macOS (Intel / Apple Silicon)";
const DEFAULT_ENDPOINT = "https://getpairlane.com";

// Endpoint config lives OUTSIDE the engine tree -- githubBridge's rule, and sharpBridge.js's verbatim reason:
// "a file that is not in the tree cannot be swept up by anything". There is no token here (pairlane needs
// none), but a SELF-HOSTED endpoint is still a fact about this box that has no business in a release zip.
const CFG = process.env.PAIRLANE_CFG || path.join(os.homedir(), ".voxelbridge", "pairlane.json");

function loadCfg() {
    try { const c = JSON.parse(fs.readFileSync(CFG, "utf8")); return (c && typeof c === "object") ? c : {}; }
    catch { return {}; }
}
function saveCfg(c) {
    try { fs.mkdirSync(path.dirname(CFG), { recursive: true }); } catch {}
    fs.writeFileSync(CFG, JSON.stringify(c, null, 2), { mode: 0o600 });
    try { fs.chmodSync(CFG, 0o600); } catch {}
}

/**
 * Endpoint validated at the WRITE, sharpBridge.js's rule verbatim -- a malformed endpoint would otherwise fail
 * one layer out, inside a spawn, as an unexplained CLI error.
 */
function endpointError(v) {
    const s = String(v == null ? "" : v).trim();
    if (!s) return "";                       // unset is a real state: the CLI's own default is used
    let u = null;
    try { u = new URL(s); } catch { return "is not a URL"; }
    if (u.protocol !== "https:" && u.hostname !== "localhost" && u.hostname !== "127.0.0.1")
        return "must be https (a room URL carries the decryption key in its fragment)";
    if (!u.hostname) return "has no host";
    return "";
}

function setConfig(d) {
    d = d || {};
    const c = loadCfg();
    if (d.endpoint != null) {
        const why = endpointError(d.endpoint);
        if (why) return { ok: false, error: "endpoint " + why + '. Got: "' + String(d.endpoint).trim() + '"' };
        c.endpoint = String(d.endpoint).trim();
    }
    saveCfg(c);
    return { ok: true, endpoint: c.endpoint || "", path: CFG };
}

/**
 * *** THE PLATFORM REFUSAL, AS A PURE PREDICATE OVER AN INJECTED PLATFORM. *** canPublish()/_launchGuard()'s
 * shape, and for the identical reason: a gate can then drive the Windows branch on a Linux box, which is the
 * only branch that cannot be reached by running the real thing here.
 */
function platformSupport(plat = process.platform) {
    if (plat === "win32") {
        return {
            ok: false,
            why: "pairlane's prebuilt CLI supports " + SUPPORTED + " -- Windows is not on its own README's list. " +
                 "Building it from source (cd cli && cargo run --release) may work and is untested by this tree, " +
                 "so it is offered as a possibility rather than a claim.",
        };
    }
    if (plat === "linux" || plat === "darwin") return { ok: true, why: "" };
    return { ok: false, why: "pairlane's CLI supports " + SUPPORTED + "; this box reports platform '" + plat + "'" };
}

// One job per id. `send` BLOCKS while it waits for receivers, so these are long-lived on purpose -- a send that
// exited the moment it printed its URL would close the room before anybody could open it.
const _jobs = new Map();   // id -> { id, kind, child, log[], url, done, code, startedAt, file }
let _nextId = 1;

function _append(job, s) { job.log.push(s); if (job.log.length > 400) job.log.shift(); }

// The room URL as printed by `send`. Matched rather than assumed: the README's own example is
// "https://getpairlane.com/r/<ROOM_ID>#k=<KEY>", and a self-hosted endpoint changes the host but not the shape.
function _scanForUrl(text) {
    const m = String(text).match(/https?:\/\/\S+\/r\/[A-Za-z0-9._~-]+(?:#k=[A-Za-z0-9._~-]+)?/);
    return m ? m[0] : null;
}

function _spawnJob(kind, args, { cwd, file } = {}) {
    const sup = platformSupport();
    if (!sup.ok) return { ok: false, error: sup.why };

    const cfg = loadCfg();
    const env = Object.assign({}, process.env);
    if (cfg.endpoint) env.PAIRLANE_ENDPOINT = cfg.endpoint;

    const id = String(_nextId++);
    const job = { id, kind, child: null, log: [], url: null, done: false, code: null, startedAt: Date.now(), file: file || null };
    let child;
    // npx resolves the published binary; the CLI is a Rust binary distributed through npm.
    try { child = spawn("npx", ["--yes", "pairlane", ...args], { cwd: cwd || os.homedir(), env, windowsHide: true }); }
    catch (e) { return { ok: false, error: "could not start pairlane: " + String((e && e.message) || e) }; }
    job.child = child;
    _jobs.set(id, job);

    const onData = (b) => {
        const s = b.toString();
        _append(job, s);
        if (!job.url) { const u = _scanForUrl(s); if (u) job.url = u; }
    };
    if (child.stdout) child.stdout.on("data", onData);
    if (child.stderr) child.stderr.on("data", onData);
    child.on("exit", (code) => { job.done = true; job.code = code; });
    child.on("error", (e) => { job.done = true; job.code = -1; _append(job, "[spawn error] " + ((e && e.message) || e) + "\n"); });
    return { ok: true, id, kind };
}

/**
 * Offer a file. Returns as soon as the job STARTS -- the room URL appears in status() once the CLI prints it,
 * which is a moment later. Polling for it rather than blocking here keeps this identical in shape to every
 * other long-running job in this tree (autoInstall.run, sharpBridge.install, comicTranslateBridge.install).
 */
function send(filePath, { encrypt = true } = {}) {
    const f = String(filePath == null ? "" : filePath).trim();
    if (!f) return { ok: false, error: "no file given" };
    if (!fs.existsSync(f)) return { ok: false, error: "no such file: " + f };
    let st = null; try { st = fs.statSync(f); } catch {}
    if (!st || !st.isFile()) return { ok: false, error: "not a file (pairlane send takes one file): " + f };

    const args = ["send", f];
    // Encryption is the CLI's default; --no-encrypt is the opt-out. Passing the flag only when asked keeps the
    // safe path the one that needs no argument.
    if (!encrypt) args.push("--no-encrypt");
    return _spawnJob("send", args, { cwd: path.dirname(f), file: f });
}

/**
 * Fetch what somebody else is offering. `outputDir` is REQUIRED rather than defaulted to the engine tree: a
 * received file landing anywhere the packer walks would ride into the next release zip, which is the exact
 * class of mistake sharpBridge.js's wouldBePackaged() exists to refuse one directory over.
 */
function receive(roomOrUrl, outputDir) {
    const r = String(roomOrUrl == null ? "" : roomOrUrl).trim();
    if (!r) return { ok: false, error: "no room id or URL given" };
    const out = String(outputDir == null ? "" : outputDir).trim();
    if (!out) return { ok: false, error: "no output directory given -- pairlane receive must be told where to write" };
    try { fs.mkdirSync(out, { recursive: true }); }
    catch (e) { return { ok: false, error: "cannot create " + out + ": " + ((e && e.message) || e) }; }
    return _spawnJob("receive", ["receive", r, "--output-dir", out], { cwd: out });
}

function stop(id) {
    const job = _jobs.get(String(id));
    if (!job) return { ok: false, error: "no such job: " + id };
    if (job.done) return { ok: false, error: "job " + id + " already finished" };
    try { job.child.kill("SIGTERM"); } catch {}
    // v4132 -- SIGTERM IS A REQUEST, NOT AN OUTCOME, and `{ok:true}` alone read as "it is stopped".
    // The handle is deliberately kept (never nulled) and _spawnJob installs child.on("exit") which sets
    // job.done, so whether the child ACTUALLY went is knowable -- it just is not known YET at this line,
    // and it will not be for as long as the child takes to honour the signal or refuse it. So this reports
    // what it did (signalled), what is true so far (done), and where the real answer arrives.
    return { ok: true, id: job.id, signalled: "SIGTERM", done: !!job.done, verifyWith: "status(" + job.id + ").done" };
}

/** One job's public shape. The URL is included -- callers that must not see it simply do not ask for it. */
function _pub(job) {
    return {
        id: job.id, kind: job.kind, file: job.file, url: job.url,
        done: job.done, code: job.code, uptimeMs: Date.now() - job.startedAt,
        tail: job.log.slice(-12).join(""),
    };
}

function status() {
    const sup = platformSupport();
    const cfg = loadCfg();
    return {
        ok: true,
        supported: sup.ok,
        why: sup.why,
        platforms: SUPPORTED,
        endpoint: cfg.endpoint || DEFAULT_ENDPOINT,
        endpointIsDefault: !cfg.endpoint,
        repo: "https://github.com/kiyo-e/pairlane",
        licence: "MIT",
        // *** SAID IN EVERY REPLY, because the person about to press Send is the one who needs to know where the
        // bytes go and who can read them. *** The transfer is browser-to-browser; the room is a third party's
        // service unless an endpoint is configured; the URL is a bearer secret.
        note: "P2P over WebRTC -- the file does not pass through the room server. Encryption is ON by default " +
              "and the key travels in the URL fragment, which is never sent to that server. THE ROOM URL IS A " +
              "BEARER SECRET: anyone who has it can fetch the file while the send is running.",
        jobs: [..._jobs.values()].map(_pub),
    };
}

module.exports = {
    status, send, receive, stop, setConfig, endpointError, platformSupport,
    CFG, DEFAULT_ENDPOINT, SUPPORTED, _scanForUrl,
};
