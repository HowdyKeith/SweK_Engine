// WebGLEngine/ai-bridge/sourceChainBridge.js -- v3964
//
// CLONE -> VERIFY -> (STOP) -> PUBLISH. ONE BUTTON STARTS IT; THE IRREVERSIBLE STEP STAYS BEHIND A RESULT.
//
// Keith: "a natural follow on to Github clone repo to new version dir, would be to clone, then run and auto
// export github version? so one button would start that chain?"
//
// *** THE CHAIN IS RIGHT AND THE AUTO IS NOT, FOR ONE REASON: THE MIDDLE STEP IS THE ONE THAT FAILS QUIETLY. ***
// A clone that fails says so. An upload that fails says so. A tree that is subtly broken BOOTS FINE and packages
// fine, and the only thing between it and a public release page is somebody looking. A release is also the one
// action in this tree that is genuinely hard to take back -- it is a tag, an asset, and a thing other boxes will
// fetch and install. So the chain runs clone -> verify and STOPS with a verdict; publish is a second press that
// only lights up on green.
//
// *** AND VERIFY RUNS INSIDE THE CLONE, WHICH IS THE ENTIRE POINT. *** Running this box's gates would grade the
// tree that is already running -- a tree that is by definition fine, since it is serving the page you clicked
// from. `node tools/ship/verify.mjs` is spawned with cwd set to the CLONE's WebGLEngine, so what is graded is
// what was fetched.
//
// *** THE PACKER MUST ALSO BE THE CLONE'S, AND THAT IS NOT OBVIOUS. *** packagerBridge.js computes
// PROJECT_ROOT from its OWN location (`path.resolve(ENGINE_ROOT, "..")`), so calling makeInstallable() from
// here would zip THIS tree while the verdict on screen refers to the clone -- a published artifact that was
// never the thing that passed, with a green tick in front of it. Publishing therefore spawns the CLONE's
// tools/ship/packRelease.mjs, whose packagerBridge resolves to the clone. THE TREE THAT PASSED IS THE TREE THAT
// GETS ZIPPED, because it zips itself.
//
// The upload stays HERE: the GitHub token lives in ~/.voxelbridge/github.json, outside every tree, and this box
// is the one holding it. The clone builds the artifact; this box publishes it.
//
// *** WHAT THIS DOES NOT CLAIM. *** Between a green verify and a press of Publish, nothing stops somebody
// editing the clone. The version marker is re-read at publish time and a change refuses the publish, which
// catches the honest case (a bump) and not a determined one. That gap is named rather than papered over: the
// guarantee is "built from the tree that passed, moments ago", not "byte-identical to what was graded".
"use strict";
const fs = require("fs");
const path = require("path");
const net = require("net");
const http = require("http");
const { spawn } = require("child_process");

const ENGINE_ROOT = path.resolve(__dirname, "..");
const PREFIX = "/source-chain";
const isWin = process.platform === "win32";
const isMac = process.platform === "darwin";

// One run at a time. Two clones into the same parent would race on the same `.tmp` directory, and two verifies
// would halve each other on a box that is also serving this page.
const R = {
    phase: "idle",          // idle | cloning | verifying | done
    startedAt: 0, finishedAt: 0,
    log: "",
    clone: null,            // the cloneEngineSource result
    verified: null,         // true | false | null (never run)
    verifyExit: null,
    error: "",
    publish: null,          // the last publish result, if any
    launched: null,         // {port, root, version, at} of the verify preview THIS bridge process last started
};

const MAX_LOG = 256 * 1024;
function push(s) {
    R.log += String(s);
    if (R.log.length > MAX_LOG) R.log = R.log.slice(-MAX_LOG);
}

function status() {
    return {
        ok: true,
        phase: R.phase,
        running: R.phase === "cloning" || R.phase === "verifying",
        startedAt: R.startedAt, finishedAt: R.finishedAt,
        clone: R.clone ? { version: R.clone.version, path: R.clone.path, repo: R.clone.repo,
                           auth: R.clone.auth, tokenRejected: !!R.clone.tokenRejected } : null,
        verified: R.verified,
        verifyExit: R.verifyExit,
        error: R.error,
        publish: R.publish,
        launched: R.launched,
        // *** THE ONE FIELD THE UI IS ALLOWED TO GATE ITS BUTTON ON, AND IT IS COMPUTED HERE. *** A UI that
        // derived "may I publish" from three separate fields would be a second copy of this rule, and the copy
        // is the one that would drift open. Everything the button needs to know is this boolean.
        canPublish: canPublish().ok,
        whyNotPublish: canPublish().why,
        note: "clone -> verify -> STOP. Publish is a separate press and only unlocks on a green verify.",
    };
}

/**
 * May the current state be published? A PURE FUNCTION OF STATE, defaulting to the live run.
 *
 * *** THE PARAMETER EXISTS SO THE REFUSALS CAN BE DRIVEN RATHER THAN DESCRIBED. *** This predicate is the whole
 * safety argument for the chain -- if it ever returns true for a tree that did not pass, the feature is worse
 * than not having it, because it puts a green tick in front of an unverified release. A gate that could only
 * reach the "nothing cloned yet" branch would pass just as happily against a version with the RED-verify branch
 * deleted. Taking the state as an argument means every branch is reachable in a test WITHOUT a network clone and
 * WITHOUT a test-only setter poked into shipping code.
 */
function canPublish(st) {
    const s = st || R;
    if (s.phase === "cloning" || s.phase === "verifying") return { ok: false, why: "the chain is still running" };
    if (!s.clone || !s.clone.path) return { ok: false, why: "nothing has been cloned yet" };
    if (s.verified !== true) return { ok: false, why: s.verified === false
        ? "the cloned tree FAILED verification -- publishing it is the thing this chain exists to prevent"
        : "the cloned tree has not been verified" };
    if (!fs.existsSync(s.clone.path)) return { ok: false, why: "the verified clone is no longer at " + s.clone.path };
    return { ok: true, why: "" };
}

function _versionInTree(root) {
    try {
        const src = fs.readFileSync(path.join(root, "WebGLEngine", "main.js"), "utf8");
        const m = src.match(/ENGINE_VERSION\s*=\s*"(v\d+)"/);
        return m ? m[1] : "";
    } catch { return ""; }
}

/** Spawn a node script inside a given tree's WebGLEngine and resolve with its exit code. */
function _spawnIn(cwd, args, label) {
    return new Promise((resolve) => {
        let child;
        try {
            child = spawn(process.execPath, args, { cwd, windowsHide: true });
        } catch (e) {
            push("[" + label + "] spawn failed: " + ((e && e.message) || e) + "\n");
            return resolve({ code: -1, spawnError: String((e && e.message) || e) });
        }
        child.on("error", (e) => { push("[" + label + "] error: " + ((e && e.message) || e) + "\n"); });
        if (child.stdout) child.stdout.on("data", push);
        if (child.stderr) child.stderr.on("data", push);
        child.on("exit", (code) => resolve({ code }));
    });
}

async function start({ repo, ref } = {}) {
    if (R.phase === "cloning" || R.phase === "verifying")
        return { ok: false, error: "busy", message: "a chain run is already " + R.phase };

    R.phase = "cloning"; R.startedAt = Date.now(); R.finishedAt = 0;
    R.log = ""; R.clone = null; R.verified = null; R.verifyExit = null; R.error = ""; R.publish = null;
    push("[chain] clone -> verify. Publishing is a SEPARATE press and needs a green verify.\n");

    let gh = null;
    try { gh = require("./githubBridge.js"); }
    catch (e) { R.phase = "done"; R.finishedAt = Date.now(); R.error = "githubBridge unavailable: " + ((e && e.message) || e); return { ok: false, error: R.error }; }

    push("[chain] cloning" + (repo ? " " + repo : "") + "…\n");
    let cl = null;
    try { cl = await gh.cloneEngineSource({ repo, ref }); }
    catch (e) { cl = { ok: false, error: String((e && e.message) || e) }; }

    if (!cl || !cl.ok) {
        R.phase = "done"; R.finishedAt = Date.now();
        R.error = (cl && cl.error) || "clone failed";
        push("[chain] clone FAILED: " + R.error + "\n");
        return { ok: false, error: R.error, exists: !!(cl && cl.exists) };
    }
    R.clone = cl;
    push("[chain] cloned " + cl.version + " to " + cl.path + "  (auth: " + (cl.auth || "?") + ")\n");
    if (cl.tokenRejected) push("[chain] NOTE: the saved GitHub token was rejected; the clone went anonymously. " +
                               "A release needs a working token -- fix it before pressing Publish.\n");

    // ---- verify, INSIDE THE CLONE ---------------------------------------------------------------------
    const cloneEngine = path.join(cl.path, "WebGLEngine");
    if (!fs.existsSync(path.join(cloneEngine, "tools", "ship", "verify.mjs"))) {
        R.phase = "done"; R.finishedAt = Date.now(); R.verified = false;
        R.error = "the clone has no tools/ship/verify.mjs -- refusing to call an unverified tree verified";
        push("[chain] " + R.error + "\n");
        return { ok: false, error: R.error };
    }
    R.phase = "verifying";
    push("\n[chain] verifying the CLONE at " + cloneEngine + "\n");
    push("[chain] (this grades what was fetched, not the tree serving this page)\n\n");

    const r = await _spawnIn(cloneEngine, [path.join("tools", "ship", "verify.mjs"), "--version", cl.version], "verify");
    R.verifyExit = r.code;
    R.verified = r.code === 0;
    R.phase = "done"; R.finishedAt = Date.now();
    push("\n[chain] verify exited " + r.code + " -- " +
         (R.verified ? "GREEN. Publish is now unlocked." : "RED. Publish stays locked; the checklist above says which line failed.") + "\n");
    return { ok: true, version: cl.version, path: cl.path, verified: R.verified, verifyExit: r.code };
}

/**
 * Pack the VERIFIED clone (with its own packer) and upload the zip from this box.
 *
 * Refuses unless canPublish() -- which is the same predicate the UI's button reads, so a caller that bypasses
 * the UI hits the identical rule. A guard that only exists in the front end is a guard that exists until
 * somebody uses curl.
 */
async function publish({ repo, notes, draft, prerelease } = {}) {
    const gate = canPublish();
    if (!gate.ok) return { ok: false, error: "refusing to publish: " + gate.why };

    const root = R.clone.path;
    const cloneEngine = path.join(root, "WebGLEngine");

    // The honest half of the guarantee. A tree edited between verify and publish is not the tree that passed;
    // a changed version marker is the case that actually happens (somebody bumps, then presses) and it is
    // refused by name rather than published under a stale green tick.
    const nowVer = _versionInTree(root);
    if (nowVer !== R.clone.version)
        return { ok: false, error: "the clone now says " + (nowVer || "no version") + " but " + R.clone.version +
                 " is what passed verification. Re-run the chain -- a green tick from a different tree is not a green tick." };

    const packer = path.join(cloneEngine, "tools", "ship", "packRelease.mjs");
    if (!fs.existsSync(packer)) return { ok: false, error: "the clone has no tools/ship/packRelease.mjs" };

    push("\n[chain] packing the VERIFIED clone with ITS OWN packer (" + packer + ")\n");
    push("[chain] not this tree's -- packagerBridge computes its root from its own location, so the clone must zip itself\n");
    const pr = await _spawnIn(cloneEngine, [path.join("tools", "ship", "packRelease.mjs")], "pack");
    if (pr.code !== 0) {
        R.publish = { ok: false, error: "packRelease exited " + pr.code };
        return R.publish;
    }
    // packRelease prints "[packRelease] <path>" on its own line. Read the path from the LOG rather than
    // recomputing it from a naming rule -- a rule guessed here is a second declaration of what the packer names
    // its output, and the two would drift the first time a prefix changed.
    const m = R.log.match(/\[packRelease\] (\S+\.zip)\s/);
    const zip = m ? m[1] : "";
    if (!zip || !fs.existsSync(zip)) {
        R.publish = { ok: false, error: "packRelease reported success but no zip path could be read from its output" };
        return R.publish;
    }
    push("[chain] built " + zip + "\n");

    let gh = null;
    try { gh = require("./githubBridge.js"); }
    catch (e) { R.publish = { ok: false, error: "githubBridge unavailable: " + ((e && e.message) || e) }; return R.publish; }

    push("[chain] uploading as " + R.clone.version + "…\n");
    let pub = null;
    try {
        pub = await gh.publishVersion({
            repo: repo || (R.clone && R.clone.repo),
            tag: R.clone.version, name: R.clone.version,
            body: notes || ("Engine build " + R.clone.version + " -- cloned, verified, then published"),
            assetPath: zip, draft, prerelease,
        });
    } catch (e) { pub = { ok: false, error: String((e && e.message) || e) }; }

    R.publish = Object.assign({ tag: R.clone.version, zip, fromVerifiedTree: root }, pub);
    push("[chain] publish " + (pub && pub.ok ? "OK" : "FAILED: " + ((pub && pub.error) || "?")) + "\n");
    return R.publish;
}

// v4014 -- *** THE CLONE HAD A FOLDER AND NO WAY TO RUN IT. *** Keith, right after publishing a verified clone:
// "I would want to next see the button to launch new version that we just cloned." cloneEngineSource() already
// puts the new tree in its own SEPARATE folder and touches nothing running (v3941's "side by side, never over
// the top") -- the missing half was starting it.
//
// *** A NEW PORT, NOT THIS ONE. *** The running server already holds whatever PORT it was given (8787 by
// default); spawning the clone's launcher with the SAME port would either fail to bind or race for it, and
// either failure reads as "nothing happened" -- exactly the confusing state a look-at-the-new-build button must
// not produce. So this asks the OS for an unused port with listen(0) and hands it to the child via PORT.
function _freePort() {
    return new Promise((resolve, reject) => {
        const srv = net.createServer();
        srv.unref();
        srv.once("error", reject);
        srv.listen(0, "127.0.0.1", () => {
            const port = srv.address().port;
            srv.close(() => resolve(port));
        });
    });
}

// *** TIME-BOXED, NOT INDEFINITE -- v4006's rule for exactly this shape: a launch nobody can tell has hung is
// worse than one that reports it is still booting. *** Polls /health rather than trusting the spawn succeeded;
// spawn only proves the LAUNCHER started, not that the server inside it bound the port.
function _waitHealthy(port, budgetMs = 25000) {
    const deadline = Date.now() + budgetMs;
    return new Promise((resolve) => {
        const tryOnce = () => {
            const req = http.get({ host: "127.0.0.1", port, path: "/health", timeout: 1500 }, (res) => {
                res.resume();
                if (res.statusCode && res.statusCode < 500) return resolve(true);
                retry();
            });
            req.on("error", retry);
            req.on("timeout", () => { req.destroy(); retry(); });
        };
        const retry = () => { if (Date.now() >= deadline) return resolve(false); setTimeout(tryOnce, 700); };
        tryOnce();
    });
}

/**
 * Launch the cloned tree at R.clone.path on its own port, side by side with whatever is already running.
 * Returns the URL to open rather than opening it -- the caller (the panel) decides when to switch tabs, and it
 * has already learned from /health whether there is anything there to switch to.
 *
 * *** UNPROVEN ON MAC. *** The `open` command is what restart() already uses to relaunch on macOS, but `open`
 * hands off through LaunchServices and env vars passed to IT are not guaranteed to reach the .command script it
 * opens the way a direct spawn's env reaches a direct child -- this box cannot test that path at all. Windows
 * spawns `cmd /c start` directly, which does inherit the env it is given, and is the platform this was verified
 * against.
 */
/**
 * The refusals, as a pure predicate over an injectable clone record -- canPublish()'s own shape, so the same
 * gate technique that drives every branch of THAT guard without a network clone can drive this one too.
 */
function _launchGuard(clone) {
    if (!clone || !clone.path) return { ok: false, why: "nothing has been cloned yet" };
    if (!fs.existsSync(clone.path)) return { ok: false, why: "the clone is no longer at " + clone.path };
    return { ok: true, why: "" };
}

// v4103 -- *** "SIDE BY SIDE, NEVER OVER THE TOP" MEANT PRODUCTION. IT ALSO MEANT EVERY OLDER PREVIEW, WHICH
// NOBODY ASKED FOR. *** Keith: "old swek launcher is still running, and old kpop listener is still running too,
// not closing" -- then, when the obvious workaround was floated, "closing manually would be dangerous as a user
// could not easily tell which is old." Both are correct, and both trace to the same line: _freePort() hands out
// a FRESH OS PORT on every call, by design (v4014, so a preview never fights production for :8787), but nothing
// ever recorded what an earlier call had started. Click "launch" three times and there are three live engines,
// three console windows, and -- because kpop-guard.ps1's alive check has no way to know which one is "current" --
// no signal telling a human which window is safe to close.
//
// THE FIX IS NOT TO STOP TOUCHING PRODUCTION -- that guarantee is exactly right and stays. It is to stop treating
// EVERY PAST PREVIEW as equally sacred: this bridge process is the only thing that ever calls launch(), so it is
// the one place that can know "the preview I started five minutes ago is superseded by the one I am starting
// now" without guessing. So the SECOND launch stops the FIRST -- reusing portHandoff's freePort(), the same
// battle-tested kill-whatever-is-listening-here helper the production handoff already relies on, pointed at the
// port THIS bridge itself recorded rather than a port a human has to identify by eye. A launch this bridge never
// made (production, or a preview from a process that has since restarted) is never touched, because R.launched
// only ever names what THIS launch() wrote.
async function launch() {
    const guard = _launchGuard(R.clone);
    if (!guard.ok) return { ok: false, error: guard.why };
    const root = R.clone.path;

    if (R.launched && R.launched.port) {
        push("[chain] stopping the previous verify preview (v" + R.launched.version + " on :" + R.launched.port + ") before starting this one\n");
        try { require("./portHandoff.js").freePort(R.launched.port, (m) => push("[chain] " + m + "\n")); } catch {}
        R.launched = null;
    }

    let port;
    try { port = await _freePort(); }
    catch (e) { return { ok: false, error: "could not find a free port: " + String((e && e.message) || e) }; }

    const env = Object.assign({}, process.env, { PORT: String(port) });
    // A REAL TITLE, NOT THE EMPTY STRING `start` NEEDS AS ITS DUMMY FIRST ARG. Auto-stopping this bridge's own
    // previous preview closes the ordinary case; a title naming the version and port is what makes any preview
    // that DOES linger (a crash between launches, a manual close that missed) identifiable at a glance instead of
    // indistinguishable from production, which is the actual danger Keith named.
    const title = "SweK Verify v" + (R.clone.version || "?") + " :" + port;

    if (isWin) {
        let sysadmin = null; try { sysadmin = require("./sysadminBridge.js"); } catch {}
        // *** v4016 -- RESOLVE THE NAME AGAINST THE CLONE, NOT AGAINST THE TREE DOING THE LAUNCHING. *** This
        // called launcherName() with no argument, so it answered for the RUNNING tree and the answer was then
        // looked for inside the clone -- two different directories, one name. On Keith's rig the running tree
        // has START_NODE_Engine.bat (rig-local, untracked) and a git clone never does, so the check below failed
        // on every clone this feature was built for.
        const name = (sysadmin && typeof sysadmin.launcherName === "function")
            ? sysadmin.launcherName(root) : "START_NODE_Engine.bat";
        const bat = path.join(root, name);
        if (!fs.existsSync(bat)) {
            const tried = (sysadmin && typeof sysadmin.launcherCandidates === "function")
                ? sysadmin.launcherCandidates() : [name];
            return { ok: false, error: "no launcher found in " + root + " -- looked for: " + tried.join(", ") };
        }
        try {
            const c = spawn("cmd", ["/c", "start", title, "/d", root, name], { detached: true, windowsHide: false, stdio: "ignore", env });
            c.unref();
        } catch (e) { return { ok: false, error: "launch failed: " + String((e && e.message) || e) }; }
    } else if (isMac) {
        const cmd = path.join(root, "Start Mac SweK Engine.command");
        if (!fs.existsSync(cmd)) return { ok: false, error: "launcher not found at " + cmd };
        try { fs.chmodSync(cmd, 0o755); } catch {}
        try {
            const c = spawn("open", [cmd], { detached: true, stdio: "ignore", env });
            c.unref();
        } catch (e) { return { ok: false, error: "launch failed: " + String((e && e.message) || e) }; }
    } else {
        return { ok: false, error: "no launcher known for " + process.platform + " -- this feature is Windows/Mac only, same as restart()" };
    }

    const healthy = await _waitHealthy(port);
    R.launched = { port, root, version: R.clone.version, at: Date.now() };
    push("[chain] launched verify preview v" + R.clone.version + " on :" + port + (healthy ? " (answered /health)" : " (did not answer /health yet)") + "\n");
    return {
        ok: true, port, path: root, version: R.clone.version,
        url: "http://127.0.0.1:" + port + "/server.html",
        healthy,
        note: healthy ? "answered /health on :" + port
                       : "spawned, but it did not answer /health within the wait -- it may still be starting; try :" + port + " in a moment",
    };
}

function owns(url) {
    const p = String(url || "").split("?")[0];
    return p === PREFIX || p.startsWith(PREFIX + "/");
}

function _readJson(req, limit = 16384) {
    return new Promise((resolve) => {
        let s = "";
        req.on("data", (c) => { s += c; if (s.length > limit) { s = s.slice(0, limit); req.destroy(); } });
        req.on("end", () => { try { resolve(s ? JSON.parse(s) : {}); } catch { resolve({}); } });
        req.on("error", () => resolve({}));
    });
}

function handle(req, res, sendJson) {
    if (!owns(req.url)) return false;
    const route = String(req.url).split("?")[0].slice(PREFIX.length) || "/";
    if (req.method === "GET" && (route === "/" || route === "/status")) { sendJson(status()); return true; }
    if (req.method === "GET" && route === "/log") { sendJson({ ok: true, phase: R.phase, log: R.log.slice(-131072) }); return true; }
    if (req.method === "POST" && route === "/start") {
        _readJson(req).then((d) => start(d || {}).then(sendJson).catch((e) => sendJson({ ok: false, error: String((e && e.message) || e) })));
        return true;
    }
    if (req.method === "POST" && route === "/publish") {
        _readJson(req).then((d) => publish(d || {}).then(sendJson).catch((e) => sendJson({ ok: false, error: String((e && e.message) || e) })));
        return true;
    }
    if (req.method === "POST" && route === "/launch") {
        launch().then(sendJson).catch((e) => sendJson({ ok: false, error: String((e && e.message) || e) }));
        return true;
    }
    sendJson({ ok: false, error: "unknown source-chain route: " + route });
    return true;
}

module.exports = { status, start, publish, launch, canPublish, owns, handle, PREFIX, ENGINE_ROOT,
    _launchGuard, _freePort, _waitHealthy };
