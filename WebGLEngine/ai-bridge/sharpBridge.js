// WebGLEngine/ai-bridge/sharpBridge.js -- v3948
//
// APPLE'S ml-sharp: ONE PHOTOGRAPH -> A 3D GAUSSIAN SPLAT, IN UNDER A SECOND.
//
// *** THE REASON THIS IS A SMALL BRIDGE AND NOT A PORT: THE CONSUMER SIDE ALREADY EXISTS AND IS FINISHED. ***
// engine/splatParser.js parses the INRIA .ply layout SHARP emits -- f_dc_0/1/2, opacity, scale_0..2, rot_0..3,
// skipping f_rest_* -- and its own header names that format by the repos that produce it. SplatRenderer.js draws
// it, splat_viewer.html and universal-viewer.html show it, and .ply already travels through the asset menu and
// the install panel. Everything downstream of "a .ply appears" has been working for six hundred versions. The
// only missing piece was a PRODUCER, and that is all this file is.
//
// *** THE LICENCE IS A CONSTRAINT ON THIS PROJECT, NOT A FOOTNOTE. *** apple/ml-sharp dual-licenses: code under
// LICENSE, and the trained WEIGHTS under LICENSE_MODEL, which grants use "exclusively for Research Purposes"
// and states that this "does not include any commercial exploitation, product development or use in any
// commercial product or service." Derivatives must stay research-limited and disclose their modifications;
// redistribution must carry the agreement along. THIS ENGINE PUBLISHES PUBLIC RELEASE ZIPS, so two rules fall
// straight out and are enforced below rather than remembered:
//
//   1. THE WEIGHTS ARE NEVER VENDORED. They live in torch's own cache (~/.cache/torch/hub/checkpoints), which
//      is outside the tree and therefore outside the release zip. Nothing here downloads them into the project.
//   2. THE OUTPUTS ARE NEVER WRITTEN WHERE THE PACKER WOULD SWEEP THEM UP. A .ply that _copyTree copies rides
//      into the next release, and a release zip is a REDISTRIBUTION. So the default destination is the asset
//      library -- which assetMigrate.js's own note says "the ship ritual EXCLUDES, so a fresh build ships none"
//      -- and a destination the packer WOULD copy is REFUSED, not silently redirected.
//      *** THAT TEST IS "WOULD THE PACKER COPY IT", NOT "IS IT INSIDE THE PROJECT", and the difference is not
//      pedantry: the first version of this file asked the cruder question and refused its own default, because
//      ai-bridge/asset_library is inside the tree AND skipped. wouldBePackaged() reads SKIP_DIRS from the packer.
//
// status() reports the licence terms every time rather than hiding them behind a link, because the person who
// needs to see "non-commercial" is whoever is about to press the button, not whoever read this header once.
//
// *** WHAT IS NOT VERIFIED HERE, STATED PLAINLY: NO PREDICTION HAS EVER RUN IN THIS SANDBOX. *** There is no
// PyTorch and no weights on the box this was written on, so everything below the CLI boundary is built against
// apple/ml-sharp's documented contract (`sharp predict -i <in> -o <out>`), not against an observed run. The gate
// drives the refusals, the path safety and the licence surface, which is all that can be honestly driven from
// here; ONE REAL RUN ON GALAXINA is what turns the rest from a contract into a fact.
//
// *** AND THE FIRST THING THAT REVIEW FOUND WAS A REAL BUG, FROM READING SOMEBODY ELSE'S INTEGRATION. ***
// Sharp-ML/SHARP-ML (MIT, a Next.js app on Modal serverless GPUs) wraps this same model, and does NOT use the
// CLI: it imports create_predictor from sharp.models and calls the predictor directly, because a web service
// wants bytes in memory rather than a file on disk. That is evidence about the PACKAGE rather than the CLI --
// and it is what made this bridge's `python -m sharp` spelling visible as an ASSUMPTION. The documented surface
// is a CONSOLE SCRIPT (`sharp`), and `-m` needs a __main__.py that an entry-point-only package does not have:
// the original spelling would have reported ml-sharp as not installed on a box where it was installed and
// working. Both spellings are now tried, documented one first, and the one that answered is reported.
//
// NOT ADOPTED FROM THAT REPO: its stack. Next.js 16, Prisma/PostgreSQL, NextAuth, Vercel Blob and Three.js
// solve MULTI-TENANT HOSTING, which this engine is not -- it has its own peers, tunnel and auth, and its own
// WebGL2 SplatRenderer, so Three.js would be a second renderer for a format this tree already draws. Its MIT
// licence covers the web interface only; the weights stay under LICENSE_MODEL, so nothing above relaxes.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFile, spawn } = require("child_process");

const py = require("./pythonResolve.js");

const ENGINE_ROOT = path.resolve(__dirname, "..");
const PROJECT_ROOT = path.resolve(ENGINE_ROOT, "..");

// Recorded here so status() can state the terms without a network call, and so a gate can assert the engine
// has not quietly started treating research-only weights as shippable.
const LICENCE = {
    code: "apple/ml-sharp LICENSE",
    model: "apple/ml-sharp LICENSE_MODEL",
    research_only: true,
    commercial_use: false,
    summary: "The trained weights are licensed for Research Purposes only -- explicitly NOT commercial " +
             "exploitation, product development, or use in any commercial product or service. Derivatives must " +
             "stay research-limited and disclose their modifications. Weights are never bundled into a SweK " +
             "release; they are fetched by torch into its own cache on the machine that runs them.",
    url: "https://github.com/apple/ml-sharp",
};

const IMAGE_EXT = new Set([".jpg", ".jpeg", ".png", ".webp", ".bmp"]);

// *** THE ENDPOINT AND ITS TOKEN LIVE OUTSIDE THE ENGINE TREE, WHICH IS githubBridge'S RULE VERBATIM: ***
// "Token lives in ~/.voxelbridge/github.json (0600), outside the engine tree, so it never ships in a copy."
// That is stronger than relying on packagerBridge's SKIP_FILES, because a file that is not in the tree cannot
// be swept up by anything -- not the packer, not a hand-made zip, not somebody copying the folder to a stick.
const CFG = process.env.SHARP_CFG || path.join(os.homedir(), ".voxelbridge", "sharp.json");

function loadCfg() {
    try { const c = JSON.parse(fs.readFileSync(CFG, "utf8")); return (c && typeof c === "object") ? c : {}; }
    catch { return {}; }
}
function saveCfg(c) {
    try { fs.mkdirSync(path.dirname(CFG), { recursive: true }); } catch {}
    fs.writeFileSync(CFG, JSON.stringify(c, null, 2), { mode: 0o600 });
    try { fs.chmodSync(CFG, 0o600); } catch {}   // chmod separately: an EXISTING file keeps its old mode otherwise
}

/**
 * Endpoint shape is checked at the WRITE, the way githubBridge learned to check repo names after
 * engineRepo = "Swek Engine" made every update 404 silently inside a try/catch nobody read. A malformed
 * endpoint here would fail exactly as quietly, one layer further out.
 */
function endpointError(v) {
    const s = String(v == null ? "" : v).trim();
    if (!s) return "";                                    // not set is a real state
    let u = null;
    try { u = new URL(s); } catch { return "is not a URL"; }
    if (u.protocol !== "https:") return "must be https (a token would otherwise cross the network in clear)";
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
    if (d.token != null) c.token = String(d.token).trim();
    saveCfg(c);
    // The token is never echoed back -- only whether there is one. A status route that returned it would put a
    // secret into every browser tab that polls.
    return { ok: true, endpoint: c.endpoint || "", hasToken: !!c.token, path: CFG };
}

/**
 * Where a produced .ply may land. The asset library is chosen because it is ALREADY excluded from packaging for
 * a reason somebody else wrote down -- SKIP_DIRS holds "asset_library" and assetMigrate.js explains that
 * everything in one is user-accumulated. Resolved THROUGH assetLibraryBridge rather than rebuilt here, so this
 * file does not become a second opinion about where the library lives.
 */
function defaultOutDir() {
    try {
        const lib = require("./assetLibraryBridge.js");
        const s = typeof lib.status === "function" ? lib.status() : null;
        if (s && s.libDir) return path.join(s.libDir, "sharp-splats");
    } catch { /* the library is optional; fall through to a path that is still outside the tree */ }
    return path.join(os.homedir(), ".voxelbridge", "sharp-splats");
}

/**
 * *** WOULD A FILE HERE END UP IN A RELEASE ZIP? *** Which is NOT the same question as "is it inside the
 * project", and getting those two confused is a bug this file shipped for about ten minutes: the first version
 * asked the cruder one and therefore refused ai-bridge/asset_library -- its OWN default destination -- because
 * that path is inside the tree. It is also in SKIP_DIRS, so _copyTree never copies it, and the finished release
 * zip contains zero entries matching it. Measured, not assumed.
 *
 * So the rule is READ FROM THE PACKER rather than approximated here: inside the project AND no path segment
 * skipped. A second, cruder copy of a packaging rule is the same defect as a second copy of the exclude list --
 * it just fails in the opposite direction, refusing correct paths instead of shipping wrong ones.
 */
function wouldBePackaged(p) {
    const r = path.resolve(p);
    if (r !== PROJECT_ROOT && !r.startsWith(PROJECT_ROOT + path.sep)) return false;
    let skipDirs = null;
    try { skipDirs = require("./packagerBridge.js").SKIP_DIRS; } catch {}
    // No packer to ask means no way to prove the path is excluded, and the safe answer to an unanswerable
    // question about redistributing research-licensed output is "yes, it would be packaged".
    if (!skipDirs || typeof skipDirs.has !== "function") return true;
    const rel = path.relative(PROJECT_ROOT, r);
    return !rel.split(path.sep).some((seg) => skipDirs.has(seg));
}

function _run(cmd, args, opts) {
    return new Promise((res) => {
        let done = false;
        const child = execFile(cmd, args, Object.assign({ windowsHide: true, timeout: 300000, maxBuffer: 8 * 1024 * 1024 }, opts || {}),
            (err, stdout, stderr) => { if (done) return; done = true; res({ ok: !err, out: String(stdout || ""), err: String(stderr || "") + (err ? " " + ((err && err.message) || err) : "") }); });
        child.on("error", (e) => { if (done) return; done = true; res({ ok: false, out: "", err: String((e && e.message) || e) }); });
    });
}

/**
 * *** HOW SHARP IS ACTUALLY CALLED, AND WHY THIS IS A LIST RATHER THAN A LINE. ***
 *
 * apple/ml-sharp's README documents `sharp predict -i <in> -o <out>` -- a CONSOLE SCRIPT, the entry point pip
 * installs onto PATH. The first version of this bridge spelled that as `python -m sharp predict`, which is a
 * DIFFERENT thing: `-m` needs the package to ship a __main__.py, and a console-script entry point is not one.
 * Where a package has only the entry point, `python -m sharp` fails with "No module named sharp.__main__" and
 * this bridge would have reported ml-sharp as not installed on a box where it was installed and working.
 *
 * That was caught by reading Sharp-ML/SHARP-ML, a Next.js wrapper around the same model, which does not use the
 * CLI at all -- it imports `create_predictor` from sharp.models and calls the predictor directly, because a web
 * service wants bytes in memory rather than a file on disk. Their code is evidence about the PACKAGE, not about
 * the CLI, and reading it is what made the `-m` assumption visible as an assumption.
 *
 * So both spellings are tried, documented one first, and WHICH ONE WORKED IS REPORTED -- a bridge that cannot
 * say how it invoked the thing cannot be re-diagnosed when the next install layout differs.
 */
function _invocations(cand) {
    return [
        { label: "sharp", cmd: "sharp", pre: [] },                                  // the documented console script
        { label: py.label(cand) + " -m sharp", cmd: cand.cmd, pre: [...cand.base, "-m", "sharp"] },
    ];
}

async function _resolveInvocation(cand) {
    for (const inv of _invocations(cand)) {
        // Asked for help rather than a version flag: the documented surface is `sharp predict`, and a --version
        // that does not exist would read as "not installed" on a working box.
        const probe = await _run(inv.cmd, [...inv.pre, "--help"], { timeout: 60000 });
        if (probe.ok || /predict/i.test(probe.out + probe.err)) return inv;
    }
    return null;
}

// v4104 -- *** THE PANEL COULD REPORT "not installed" AND NOTHING PRESSED FIXED IT. *** Keith: "for the ML-Sharp
// panel, we need an install button." status() has said so since v3948 with nothing behind it but a link to
// the repo. apple/ml-sharp's own README (fetched here, not guessed at) publishes no PyPI package -- the
// documented path is `pip install -r requirements.txt`, RUN FROM INSIDE A CHECKOUT, verified afterward with
// `sharp --help`, which is exactly the smoke test status() already runs via _resolveInvocation(). So there are
// two real steps, get a checkout and pip-install it, chained into ONE job rather than making Keith press
// Install twice -- comicTranslateBridge.js's install() for ogkalu2/comic-translate is the same shape one
// click short of this, and reading it (rather than reinventing the job bookkeeping) is what caught that a
// two-click flow was avoidable here: a clone that exits 0 can walk straight into the pip step itself.
//
// OUTSIDE THE PROJECT ROOT, same rule this file already applies to CFG and the weights cache and states in
// its own header: wouldBePackaged() would refuse a checkout INSIDE the tree the moment a prediction ran
// against it, so putting the checkout there in the first place is a trap that only springs later, on a
// different call, with a more confusing error. SHARP_SRC_DIR overrides for a gate, same convention as CFG.
const SRC_DIR = process.env.SHARP_SRC_DIR || path.join(os.homedir(), ".voxelbridge", "ml-sharp");
let _job = null;   // one install job at a time; { kind: "clone"|"pip", log:[...], done, code, startedAt }

function _appendLog(s) { if (_job) { _job.log.push(s); if (_job.log.length > 400) _job.log.shift(); } }

/** Spawn one step of the job; `onDone(code)` decides what happens next rather than the step assuming it is last. */
function _runStep(kind, cmd, args, opts, onDone) {
    _job.kind = kind;
    let child;
    try { child = spawn(cmd, args, Object.assign({ windowsHide: true }, opts || {})); }
    catch (e) { _job.done = true; _job.code = -1; _appendLog("[spawn error] " + ((e && e.message) || e) + "\n"); return; }
    const cap = (b) => _appendLog(b.toString());
    if (child.stdout) child.stdout.on("data", cap);
    if (child.stderr) child.stderr.on("data", cap);
    child.on("exit", (code) => { if (onDone) onDone(code); else { _job.done = true; _job.code = code; } });
    child.on("error", (e) => { _job.done = true; _job.code = -1; _appendLog("[spawn error] " + ((e && e.message) || e) + "\n"); });
}

function _runPip(cand) {
    const req = path.join(SRC_DIR, "requirements.txt");
    if (!fs.existsSync(req)) { _job.done = true; _job.code = -1; _appendLog("[install] repo present but requirements.txt missing at " + req + "\n"); return; }
    _runStep("pip", cand.cmd, [...cand.base, "-m", "pip", "install", "-r", "requirements.txt"], { cwd: SRC_DIR });
}

/**
 * Kick off (or resume) the install. Long-running -- returns immediately; the caller polls status().installJob.
 * A REPO ALREADY THERE SKIPS STRAIGHT TO PIP, so a failed or interrupted pip step can be retried by pressing
 * Install again without re-cloning, the same "resume rather than restart" shape portHandoff.js's heal step uses.
 */
function install() {
    if (_job && !_job.done) return { ok: false, error: "an install job is already running (" + _job.kind + ")" };
    const cand = py.resolve();
    if (!cand) return { ok: false, error: "no working Python found (tried: " + py.candidates().map(py.label).join(", ") + ")" };
    try { fs.mkdirSync(path.dirname(SRC_DIR), { recursive: true }); } catch (e) { return { ok: false, error: "cannot create " + path.dirname(SRC_DIR) + ": " + ((e && e.message) || e) }; }

    _job = { kind: "clone", log: [], done: false, code: null, startedAt: Date.now() };
    if (!fs.existsSync(path.join(SRC_DIR, ".git"))) {
        _runStep("clone", "git", ["clone", "--depth", "1", "https://github.com/apple/ml-sharp", SRC_DIR],
            { cwd: path.dirname(SRC_DIR) },
            (code) => { if (code === 0) _runPip(cand); else { _job.done = true; _job.code = code; } });
    } else {
        _runPip(cand);
    }
    return { ok: true, kind: _job.kind };
}

/** null when nothing has ever run; otherwise the live/finished state of the one job this bridge tracks. */
function installStatus() {
    return _job ? { kind: _job.kind, done: _job.done, code: _job.code, uptimeMs: Date.now() - _job.startedAt, tail: _job.log.slice(-12).join("") } : null;
}

async function status() {
    const cand = py.resolve();
    const python = py.label(cand);
    const pythonVersion = cand ? py.version(cand) : "";
    const cfg = loadCfg();
    const out = {
        ok: true, licence: LICENCE, outDir: defaultOutDir(),
        python: cand ? python : "", pythonVersion,
        sharpInstalled: false, sharpVersion: "", invocation: "", weightsCached: false, weightsDir: "",
        remote: !!cfg.endpoint, remoteEndpoint: cfg.endpoint || "", remoteHasToken: !!cfg.token,
        where: "", ready: false, why: "",
        installJob: installStatus(), srcDir: SRC_DIR,
    };

    // *** THE REMOTE PATH IS CHECKED FIRST BECAUSE IT IS THE ONE THAT MAKES THIS FEATURE EXIST OFF GALAXINA. ***
    // A configured Modal endpoint means a Mac with no CUDA, or the Shield, can still turn a photo into a .ply.
    // Local PyTorch is the fallback, not the other way round -- and `where` says which, so a caller never has to
    // infer it from which fields happen to be filled in.
    if (cfg.endpoint) {
        out.where = "modal";
        out.ready = !!cfg.token;
        out.why = cfg.token ? "" : "a Modal endpoint is configured but no token -- the endpoint refuses " +
                  "unauthenticated calls on purpose, because an open one is somebody else's GPU bill and " +
                  "research-licensed weights served to the public";
        return out;
    }

    if (!cand) { out.why = "no working Python found (tried: " + py.candidates().map(py.label).join(", ") + ")"; return out; }

    const inv = await _resolveInvocation(cand);
    out.sharpInstalled = !!inv;
    out.invocation = inv ? inv.label : "";
    if (!out.sharpInstalled) {
        out.why = "ml-sharp is not installed for " + python + " -- tried " +
                  _invocations(cand).map((i) => i.label).join(" and ") + ". See " + LICENCE.url +
                  " (install it into a venv; it pulls PyTorch, which is multi-GB and must not go in the engine tree)";
        return out;
    }
    const wd = path.join(os.homedir(), ".cache", "torch", "hub", "checkpoints");
    out.weightsDir = wd;
    try { out.weightsCached = fs.existsSync(wd) && fs.readdirSync(wd).some((f) => /sharp/i.test(f)); } catch {}
    out.where = "local";
    out.ready = true;
    out.why = out.weightsCached ? "" : "weights are not cached yet -- the first prediction downloads them into " + wd +
              " (torch's own cache, deliberately outside this tree)";
    return out;
}

/**
 * The Modal path. The endpoint returns .ply BYTES rather than a path, because it has no shared disk with this
 * machine -- which is exactly why the file is written HERE, on the side where wouldBePackaged() has already
 * refused any destination the packer would sweep into a release. Doing the write remotely would have moved the
 * output out from behind that rule.
 */
async function _predictRemote(img, dest, before) {
    const cfg = loadCfg();
    let raw = null;
    try { raw = fs.readFileSync(img); } catch (e) { return { ok: false, error: "cannot read " + img + ": " + ((e && e.message) || e) }; }

    let res = null, body = null;
    try {
        res = await fetch(cfg.endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            // The token rides in the BODY rather than the URL: a query string lands in proxy logs and browser
            // history, and this one is the only thing standing between a stranger and a rented GPU.
            body: JSON.stringify({ token: cfg.token || "", image_b64: raw.toString("base64") }),
            signal: AbortSignal.timeout(600000),
        });
        body = await res.json().catch(() => null);
    } catch (e) {
        return { ok: false, error: "Modal endpoint did not answer: " + String((e && e.message) || e) };
    }
    if (!res.ok || !body || body.ok === false) {
        const detail = (body && (body.detail || body.error)) || ("HTTP " + (res && res.status));
        return { ok: false, error: "Modal endpoint refused: " + String(detail).slice(0, 200) +
                 (res && res.status === 401 ? " -- check the token matches the SHARP_TOKEN secret you deployed with" : "") };
    }
    if (!body.ply_b64) return { ok: false, error: "Modal endpoint answered ok but sent no ply_b64 -- treating that as a failure rather than writing an empty file" };

    // Named from the source image so two photographs do not overwrite each other, and de-duplicated against
    // what was already there rather than trusting the name to be free.
    const base = path.basename(img).replace(/\.[^.]+$/, "").replace(/[^\w.-]/g, "_") || "splat";
    let name = base + ".ply", n = 1;
    while (before.has(name) || fs.existsSync(path.join(dest, name))) name = base + "_" + (++n) + ".ply";
    const ply = path.join(dest, name);
    try { fs.writeFileSync(ply, Buffer.from(body.ply_b64, "base64")); }
    catch (e) { return { ok: false, error: "could not write " + ply + ": " + ((e && e.message) || e) }; }

    let bytes = 0; try { bytes = fs.statSync(ply).size; } catch {}
    if (!bytes) { try { fs.rmSync(ply, { force: true }); } catch {} return { ok: false, error: "the endpoint's .ply decoded to zero bytes; the empty file was removed rather than left looking like a build" }; }
    return { ok: true, ply, name, bytes, mb: +(bytes / 1048576).toFixed(2), image: img, outDir: dest,
             invocation: "modal:" + cfg.endpoint, licence: LICENCE, alsoWrote: [] };
}

/**
 * One image in, one .ply out. Every refusal below happens BEFORE anything is spawned or written.
 */
async function predict({ image, outDir } = {}) {
    const img = String(image || "").trim();
    if (!img) return { ok: false, error: "no image given" };
    if (!fs.existsSync(img)) return { ok: false, error: "no such image: " + img };
    let st = null; try { st = fs.statSync(img); } catch {}
    if (!st || !st.isFile()) return { ok: false, error: "not a file: " + img };
    if (!IMAGE_EXT.has(path.extname(img).toLowerCase()))
        return { ok: false, error: "not an image this accepts (" + [...IMAGE_EXT].join(" ") + "): " + path.basename(img) };

    const dest = String(outDir || "").trim() || defaultOutDir();
    // *** THE PACKAGING REFUSAL, AND IT REFUSES RATHER THAN REDIRECTING. *** A .ply written into the project is
    // swept into the next release zip by _copyTree, and a release is a REDISTRIBUTION of research-only-licensed
    // model output. Quietly moving the caller's chosen path would hide that; saying no explains it once.
    if (wouldBePackaged(dest))
        return { ok: false, error: "refusing to write splats somewhere the packer would sweep into a release (" + dest + "): " +
                 "a release zip is a REDISTRIBUTION, and the ml-sharp weights that produced the file are " +
                 "research-licensed. Use the asset library (the default, which the packer skips) or any path " +
                 "outside " + PROJECT_ROOT };

    const s = await status();
    if (!s.ready) return { ok: false, error: s.why || "ml-sharp is not ready on this box", status: s };

    try { fs.mkdirSync(dest, { recursive: true }); } catch (e) { return { ok: false, error: "cannot create " + dest + ": " + ((e && e.message) || e) }; }

    // What is already there, so the new file is identified by APPEARING rather than by guessing SHARP's naming.
    const before = new Set();
    try { for (const f of fs.readdirSync(dest)) if (f.toLowerCase().endsWith(".ply")) before.add(f); } catch {}

    // *** ONE DECISION ABOUT WHERE THIS RUNS, AND status() ALREADY MADE IT. *** predict() does not re-derive
    // local-vs-remote from the config: it uses the `where` status() reported, so the two can never disagree.
    // A status saying "modal" while the run shells out to a local python is the two-declarations defect with a
    // green light in front of it -- the same shape the `-m` fix closed one layer down.
    const t0 = Date.now();
    if (s.where === "modal") {
        const rr = await _predictRemote(img, dest, before);
        return Object.assign({ ms: Date.now() - t0, where: "modal" }, rr);
    }

    const cand = py.resolve();
    const inv = await _resolveInvocation(cand);
    if (!inv) return { ok: false, error: "ml-sharp went missing between the status check and the run" };
    const r = await _run(inv.cmd, [...inv.pre, "predict", "-i", img, "-o", dest], { timeout: 600000 });
    const ms = Date.now() - t0;
    if (!r.ok) return { ok: false, error: "sharp predict failed: " + (r.err || "").trim().split("\n").slice(-3).join(" ").slice(0, 400), ms };

    let made = [];
    try { made = fs.readdirSync(dest).filter((f) => f.toLowerCase().endsWith(".ply") && !before.has(f)); } catch {}
    if (!made.length)
        return { ok: false, error: "sharp reported success but wrote no .ply into " + dest + " -- treating that as a failure rather than reporting a file that is not there", ms, out: r.out.slice(0, 400) };

    const ply = path.join(dest, made[0]);
    let bytes = 0; try { bytes = fs.statSync(ply).size; } catch {}
    return { ok: true, ply, name: made[0], bytes, mb: +(bytes / 1048576).toFixed(2), ms, image: img, outDir: dest,
             invocation: inv.label, licence: LICENCE, alsoWrote: made.slice(1) };
}

module.exports = { status, predict, setConfig, endpointError, defaultOutDir, wouldBePackaged, LICENCE, PROJECT_ROOT, CFG,
    install, installStatus, SRC_DIR };
