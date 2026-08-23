// ai-bridge/packagerBridge.js - v1125
// Make a Gmail-safe copy of the whole engine: copy the project tree, rename every
// Gmail-blocked extension (.js/.bat/.ps1/.vbs/...) to <name>.<ext>.txt, and zip it.
// Recipients run _SETUP.bat (Windows) or "make Gmail safe zip run again.sh" (macOS) to rename back. Non-interactive
// (no pause/choice prompts), so it's safe to drive from a button. Output defaults
// to the external assets folder (stable, outside the engine), overridable.
//
// SAFER than the raw .bat: also strips in-tree runtime/secret files (gmail.json,
// tts.json, *-seen.json, board state, etc.) so nothing private rides along in a
// copy you're emailing out. The real credential vault lives in ~/.voxelbridge,
// outside the tree, so it is never copied either.

const { spawn } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const ENGINE_ROOT = path.resolve(__dirname, "..");      // WebGLEngine/
const PROJECT_ROOT = path.resolve(ENGINE_ROOT, "..");   // EngineProject_vNNN/
// v1568 - live progress for the Gmail-safe packaging (polled by the settings dialog).
let _prog = { step: "", label: "", ts: 0 };
const STEP_LABELS = { prepare: "Preparing zip for Gmail", safe: "Making Gmail Safe", zip: "Zipping up the Gmail Archive", clean: "Cleaning House", done: "Done" };
function _setProg(step) { _prog = { step, label: STEP_LABELS[step] || step, ts: Date.now() }; }
function progress() { return { ok: true, step: _prog.step, label: _prog.label, ts: _prog.ts }; }

const BLOCKED = ["bat", "cmd", "ps1", "vbs", "vbe", "wsf", "wsh", "hta", "lnk", "exe", "dll", "scr", "com", "msi", "js", "mjs", "jse", "sct", "shb", "wsc"];
const BLOCKED_SET = new Set(BLOCKED);
const SKIP_DIRS = new Set(["node_modules", ".git", "__pycache__", "asset_library", "tts-out", "doc-out", ".kpop-wav"]);
const SKIP_FILES = new Set([".DS_Store", "Thumbs.db", "gmail.json", "github.json", "tts.json", "stt.json", "wled.json", "rgb.config.json", "discord-voice.json", "camera.json", "twitch-eventsub.json", "gen-queue.json", "processes.json", "clip-queue.json", "fallout.json", "starfield.json", "toasts.json", "uitars.json", "use_bun.flag"]);
// pattern-based skips: per-run state that may hold names/emails
function _skipFile(name) {
    if (SKIP_FILES.has(name)) return true;
    if (/\.zip$/i.test(name)) return true;
    if (/^petfbi-.*\.json$/i.test(name)) return true;
    if (/-seen\.json$/i.test(name)) return true;
    if (/^ha-.*\.json$/i.test(name)) return true;
    return false;
}

function engineVersion() {
    try { const m = fs.readFileSync(path.join(ENGINE_ROOT, "main.js"), "utf8"); const x = m.match(/ENGINE_VERSION\s*=\s*"(v\d+)"/); if (x) return x[1]; } catch {}
    return "";
}
function externalAssetsDir() {  // mirror server.js resolution
    const env = (process.env.VOXEL_ASSETS_DIR || "").trim(); if (env) return env;
    try { const c = JSON.parse(fs.readFileSync(path.join(os.homedir(), ".voxelbridge", "config.json"), "utf8")); return (c.assetsDir || "").trim(); } catch {}
    return "";
}

function _copyTree(src, dest) {
    let copied = 0;
    const walk = (s, d) => {
        fs.mkdirSync(d, { recursive: true });
        let ents; try { ents = fs.readdirSync(s, { withFileTypes: true }); } catch { return; }
        for (const e of ents) {
            if (e.isDirectory()) {
                if (SKIP_DIRS.has(e.name) || e.name.startsWith("EngineProject_GmailSafe_")) continue;
                walk(path.join(s, e.name), path.join(d, e.name));
            } else if (e.isFile()) {
                if (_skipFile(e.name)) continue;
                try { fs.copyFileSync(path.join(s, e.name), path.join(d, e.name)); copied++; } catch {}
            }
        }
    };
    walk(src, dest);
    return copied;
}

function _renameBlocked(dir) {
    let n = 0;
    const walk = (d) => {
        let ents; try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
        for (const e of ents) {
            const p = path.join(d, e.name);
            if (e.isDirectory()) walk(p);
            else if (e.isFile()) { const ext = path.extname(e.name).toLowerCase().replace(/^\./, ""); if (BLOCKED_SET.has(ext)) { try { fs.renameSync(p, p + ".txt"); n++; } catch {} } }
        }
    };
    walk(dir);
    return n;
}

function _zip(srcFolder, outZip) {
    return new Promise((resolve) => {
        let cmd, args, opts;
        if (process.platform === "win32") {
            cmd = "powershell";
            args = ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", `Compress-Archive -Path '${srcFolder}' -DestinationPath '${outZip}' -CompressionLevel Optimal -Force`];
            opts = { windowsHide: true };
        } else {
            cmd = "zip"; args = ["-rq", outZip, path.basename(srcFolder)]; opts = { cwd: path.dirname(srcFolder) };
        }
        let se = ""; let ch;
        try { ch = spawn(cmd, args, opts); } catch (e) { return resolve({ ok: false, error: String(e && e.message) }); }
        ch.stderr.on("data", d => se += d);
        ch.on("error", e => resolve({ ok: false, error: String(e && e.message) }));
        ch.on("close", code => resolve(code === 0 ? { ok: true } : { ok: false, error: (se.slice(0, 200) || ("zip exit " + code)) }));
    });
}

function _unzip(srcZip, destDir) {
    return new Promise((resolve) => {
        let cmd, args, opts = {};
        if (process.platform === "win32") {
            cmd = "powershell";
            args = ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", `Expand-Archive -LiteralPath '${srcZip.replace(/'/g, "''")}' -DestinationPath '${destDir.replace(/'/g, "''")}' -Force`];
            opts = { windowsHide: true };
        } else {
            cmd = "unzip"; args = ["-q", "-o", srcZip, "-d", destDir];
        }
        let se = ""; let ch;
        try { ch = spawn(cmd, args, opts); } catch (e) { return resolve({ ok: false, error: String(e && e.message) }); }
        ch.stderr.on("data", d => se += d);
        ch.on("error", e => resolve({ ok: false, error: String(e && e.message) }));
        ch.on("close", code => resolve(code === 0 ? { ok: true } : { ok: false, error: (se.slice(0, 200) || ("unzip exit " + code)) }));
    });
}

async function makeGmailSafe(opts = {}) {
    const ver = engineVersion() || new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const folderName = "EngineProject_GmailSafe_" + ver;
    const dest = path.join(os.tmpdir(), folderName);
    _setProg("prepare");
    try { fs.rmSync(dest, { recursive: true, force: true }); } catch {}
    _setProg("safe");
    const copied = _copyTree(PROJECT_ROOT, dest);
    const renamed = _renameBlocked(dest);

    let outDir = (opts.outDir || "").trim() || externalAssetsDir() || path.resolve(PROJECT_ROOT, "..");
    if (path.resolve(outDir).startsWith(path.resolve(PROJECT_ROOT) + path.sep)) outDir = path.resolve(PROJECT_ROOT, "..");
    try { fs.mkdirSync(outDir, { recursive: true }); } catch {}
    const outZip = path.join(outDir, folderName + ".zip");
    try { fs.rmSync(outZip, { force: true }); } catch {}

    _setProg("zip");
    const z = await _zip(dest, outZip);
    let bytes = 0; try { bytes = fs.statSync(outZip).size; } catch {}
    _setProg("clean");
    try { fs.rmSync(dest, { recursive: true, force: true }); } catch {}
    _setProg("done");
    if (!z.ok) return { ok: false, error: "zip failed: " + z.error, copied, renamed };
    return { ok: true, path: outZip, bytes, mb: +(bytes / 1048576).toFixed(1), copied, renamed, version: ver, outSource: opts.outDir ? "chosen" : (externalAssetsDir() ? "external-assets" : "parent") };
}

// v1567 — take an EXISTING engine .zip archive, extract it to temp, run the same Gmail-safe
// conversion (strip secrets + rename blocked extensions), zip into "My Documents" (overridable),
// then delete the extracted temp tree and the working copy. Lets you Gmail-safe an archived build
// without it being the live engine.
// v3907 -- THE INSTALLABLE BUILD, WHICH IS NOT THE GMAIL-SAFE ONE, AND publishEngineBuild WAS SHIPPING THE WRONG
// ONE. makeGmailSafe exists to get an engine THROUGH EMAIL: it renames every extension in BLOCKED, and BLOCKED
// contains "js" and "mjs" -- SO IT RENAMES EVERY JAVASCRIPT FILE IN THE TREE. That is correct for its own job and
// catastrophic as a release asset: main.js arrives as main.js.txt and nothing runs. It also names the zip
// EngineProject_GmailSafe_vNNNN.zip, which sysadminBridge's scanDownloads() CANNOT SEE -- its pattern needs the
// version to follow the prefix directly -- so the installer would ignore the file even if it were runnable.
//
// Nobody noticed because the publish path had never once been run: the repo had zero releases. THE BUG WAS
// REACHABLE ONLY BY DOING THE THING FOR THE FIRST TIME.
//
// This is the same copy, the same secret-skipping (SKIP_FILES holds github.json, gmail.json and the rest -- which
// matters far more for a PUBLIC release asset than for an email), and NO RENAMING. The folder and the zip are
// named <prefix>_vNNNN so the zip root, the asset picker and the Downloads scanner all agree.
async function makeInstallable(opts = {}) {
    const ver = engineVersion() || new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const prefix = (opts.prefix || "SweK_Engine").trim() || "SweK_Engine";
    const folderName = prefix + "_" + ver;
    const dest = path.join(os.tmpdir(), folderName);
    _setProg("prepare");
    try { fs.rmSync(dest, { recursive: true, force: true }); } catch {}
    const copied = _copyTree(PROJECT_ROOT, dest);
    let outDir = (opts.outDir || "").trim() || externalAssetsDir() || path.resolve(PROJECT_ROOT, "..");
    if (path.resolve(outDir).startsWith(path.resolve(PROJECT_ROOT) + path.sep)) outDir = path.resolve(PROJECT_ROOT, "..");
    try { fs.mkdirSync(outDir, { recursive: true }); } catch {}
    const outZip = path.join(outDir, folderName + ".zip");
    try { fs.rmSync(outZip, { force: true }); } catch {}
    _setProg("zip");
    const z = await _zip(dest, outZip);
    let bytes = 0; try { bytes = fs.statSync(outZip).size; } catch {}
    _setProg("clean");
    try { fs.rmSync(dest, { recursive: true, force: true }); } catch {}
    _setProg("done");
    if (!z.ok) return { ok: false, error: "zip failed: " + z.error, copied };
    return { ok: true, path: outZip, bytes, mb: +(bytes / 1048576).toFixed(1), copied, renamed: 0, version: ver, root: folderName };
}

async function makeGmailSafeFromZip(opts = {}) {
    const srcZip = String(opts.srcZip || "").trim();
    if (!srcZip) return { ok: false, error: "no source .zip selected" };
    if (!fs.existsSync(srcZip)) return { ok: false, error: "source zip not found: " + srcZip };
    if (!/\.zip$/i.test(srcZip)) return { ok: false, error: "pick a .zip archive" };

    const stamp = Date.now().toString(36);
    const exDir = path.join(os.tmpdir(), "_engine_gmailsafe_extract_" + stamp);
    try { fs.rmSync(exDir, { recursive: true, force: true }); } catch {}
    try { fs.mkdirSync(exDir, { recursive: true }); } catch {}
    _setProg("prepare");

    const ex = await _unzip(srcZip, exDir);
    if (!ex.ok) { try { fs.rmSync(exDir, { recursive: true, force: true }); } catch {} return { ok: false, error: "extract failed: " + ex.error }; }

    // find the project root inside the extraction (the EngineProject_* folder, or a sole top dir, else exDir)
    let projRoot = exDir;
    try {
        const top = fs.readdirSync(exDir, { withFileTypes: true }).filter(e => e.isDirectory());
        const eng = top.find(e => /^EngineProject_/i.test(e.name)) || (top.length === 1 ? top[0] : null);
        if (eng) projRoot = path.join(exDir, eng.name);
    } catch {}

    const baseName = path.basename(projRoot);
    const verMatch = baseName.match(/v\d+/i);
    const ver = verMatch ? verMatch[0] : (engineVersion() || new Date().toISOString().slice(0, 10).replace(/-/g, ""));
    const folderName = "EngineProject_GmailSafe_" + ver;

    const dest = path.join(os.tmpdir(), folderName);
    try { fs.rmSync(dest, { recursive: true, force: true }); } catch {}
    _setProg("safe");
    const copied = _copyTree(projRoot, dest);
    const renamed = _renameBlocked(dest);

    // default output: the user's "My Documents" (fallback: home), overridable via opts.outDir
    let outDir = String(opts.outDir || "").trim();
    if (!outDir) { const docs = path.join(os.homedir(), "Documents"); outDir = fs.existsSync(docs) ? docs : os.homedir(); }
    try { fs.mkdirSync(outDir, { recursive: true }); } catch {}
    const outZip = path.join(outDir, folderName + ".zip");
    try { fs.rmSync(outZip, { force: true }); } catch {}

    _setProg("zip");
    const z = await _zip(dest, outZip);
    let bytes = 0; try { bytes = fs.statSync(outZip).size; } catch {}

    // cleanup the extracted temp set + the working copy
    _setProg("clean");
    try { fs.rmSync(dest, { recursive: true, force: true }); } catch {}
    try { fs.rmSync(exDir, { recursive: true, force: true }); } catch {}
    _setProg("done");

    if (!z.ok) return { ok: false, error: "zip failed: " + z.error, copied, renamed };
    return { ok: true, path: outZip, bytes, mb: +(bytes / 1048576).toFixed(1), copied, renamed, version: ver, srcZip, outDir };
}

// v3948 -- SKIP_DIRS and SKIP_FILES are EXPORTED so that a caller asking "would this path end up in a release?"
// can read the answer instead of retyping the rule. sharpBridge needs exactly that question: it writes Gaussian
// splats produced from research-licensed model weights, and a release zip is a redistribution. The first version
// of that check used "is it under PROJECT_ROOT" as a proxy and was WRONG IN THE SAFE DIRECTION-LOOKING WAY --
// it refused ai-bridge/asset_library, which is inside the project and skipped right here, so the bridge would
// have refused its own default destination. A proxy for the real rule is not the real rule.
module.exports = { makeGmailSafe, makeGmailSafeFromZip, makeInstallable, progress, engineVersion, externalAssetsDir, PROJECT_ROOT, SKIP_DIRS, SKIP_FILES };
