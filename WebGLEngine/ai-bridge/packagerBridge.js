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
const buildName = require("./buildName.js");

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

// *** v4071 -- EVERY ZIP THIS BRIDGE HAS EVER MADE ON WINDOWS WAS NON-CONFORMANT, AND NOTHING NOTICED FOR AS
// LONG AS CI GRADED ITS OWN COPY. *** PowerShell's Compress-Archive (the win32 branch of _zip below) writes
// BACKSLASH path separators into the archive. The ZIP spec is explicit -- APPNOTE 4.4.17.1: "All slashes MUST
// be forward slashes '/' as opposed to backwards slashes" -- so the rig's releases have been technically
// broken since the first one. MEASURED on the published SweK_Engine_v4070.zip: 4910 entries, 4910 containing a
// backslash, ZERO containing a forward slash.
//
// IT WENT UNSEEN BECAUSE THE TOLERANT READER IS THE COMMON ONE. Info-ZIP's `unzip` prints "appears to use
// backslashes as path separators" and then repairs them, so Keith's own round trips always looked fine.
// Python's zipfile does NOT repair: `SweK_Engine_v4070/WebGLEngine/main.js` simply is not in namelist(), which
// is exactly how v4070's CI change -- the first thing ever to read the PUBLISHED archive rather than a
// locally-packed one -- found it on its very first run, through verify_zip.py.
//
// THE REPAIR IS A BYTE SWAP AND THAT IS WHY IT IS SAFE. '\\' and '/' are both one byte, so rewriting names in
// place changes no length, no local-header offset, no compressed size and no CRC -- the archive is structurally
// identical afterwards. Both copies of each name are fixed (the central directory's and the local file
// header's), because a reader may consult either. VERIFIED against the real published v4070 artifact: 34,734
// bytes swapped across 4910 entries, testzip() reports OK on every one, main.js is findable by its real path,
// and `unzip` stops warning.
//
// Fixed HERE rather than by swapping Compress-Archive for tar.exe: this repairs the archive whatever produced
// it, needs nothing installed, and could be verified end to end from a Linux box, which a Windows-only
// packer change could not have been.
function normalizeZipSeparators(zipPath) {
    const b = fs.readFileSync(zipPath);
    let eocd = -1;
    for (let i = b.length - 22; i >= 0 && i > b.length - 66000; i--) if (b.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
    if (eocd < 0) return { ok: false, error: "no end-of-central-directory record -- not a zip" };
    const count = b.readUInt16LE(eocd + 10);
    let off = b.readUInt32LE(eocd + 16), fixed = 0, seen = 0;
    const swap = (start, len) => { let n = 0; for (let i = start; i < start + len; i++) if (b[i] === 0x5c) { b[i] = 0x2f; n++; } return n; };
    for (let k = 0; k < count; k++) {
        if (b.readUInt32LE(off) !== 0x02014b50) return { ok: false, error: "central directory entry " + k + " has a bad signature" };
        const nLen = b.readUInt16LE(off + 28), eLen = b.readUInt16LE(off + 30), cLen = b.readUInt16LE(off + 32);
        const lho = b.readUInt32LE(off + 42);
        seen++;
        fixed += swap(off + 46, nLen);
        if (lho + 30 <= b.length && b.readUInt32LE(lho) === 0x04034b50) fixed += swap(lho + 30, b.readUInt16LE(lho + 26));
        off += 46 + nLen + eLen + cLen;
    }
    if (fixed) fs.writeFileSync(zipPath, b);
    return { ok: true, entries: seen, bytesFixed: fixed };
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
        ch.on("close", code => {
            if (code !== 0) return resolve({ ok: false, error: (se.slice(0, 200) || ("zip exit " + code)) });
            // EVERY archive is normalised, not just Compress-Archive's: `zip -rq` already writes forward
            // slashes so this is a no-op there (0 bytes swapped), and a future change of packer cannot
            // silently reintroduce the defect.
            const norm = normalizeZipSeparators(outZip);
            if (!norm.ok) return resolve({ ok: false, error: "packed, but the archive could not be normalised: " + norm.error });
            resolve({ ok: true, entries: norm.entries, separatorsFixed: norm.bytesFixed });
        });
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
// v4012 -- *** "SELF" NAMED A BUTTON, NOT WHAT IT SERVED. *** server.js's /self/zip route picked the
// HIGHEST-numbered SweK_Engine_vNNNN.zip (or legacy EngineProject_vNNN.zip, buildName's v2871 fix) sitting in
// the user's Downloads folder -- on the unstated assumption that whatever is currently running arrived there as
// a zip and that zip is still sitting where it landed. Both can be false at once: an install can happen by
// extraction, patch or in-place git pull with no zip left behind, or an older zip can simply be the only one
// still there after the newer one was moved or deleted post-install. Keith caught it directly: on a box whose
// own header read "running v3995", the download route served v3940 -- correctly named v3940 in the
// Content-Disposition, so the mismatch was never HIDDEN, only unnoticed next to a big "download" button beside
// a version number that reads as "get what this box is running". v2871 widened the FILENAME pattern and never
// touched the actual defect: nothing compared the candidate's version against the LIVE one, so "the biggest
// number found" and "what is running" were silently allowed to be two different claims.
//
// So the live version is read first, Downloads is searched for a zip matching THAT version EXACTLY -- not "the
// highest version present": a stale build that happens to be newer than some OTHER stale build is still stale
// -- and only when nothing there matches does this build one fresh via makeInstallable(), the same function
// githubBridge's release path already uses. The fast path (an already-current zip sitting in Downloads, the
// common case right after an update) costs nothing new; the guarantee is that what downloads now always
// matches what "running" says, never a best-effort search of a folder nothing here was watching.
//
// dlDir/liveVersion are overridable so a gate can drive this against a scratch directory and a fixed version
// rather than the real ~/Downloads and the real running engine -- the same reason makeInstallable takes opts.
//
// *** engineVersion() RETURNS "vNNNN" (WITH THE LETTER) AND parseBuildZip() RETURNS A BARE NUMBER -- CAUGHT
// BEFORE SHIPPING, NOT AFTER. *** A first draft compared them with `===` directly, which is never true: a
// string and a number are never triple-equal regardless of digits, so every Downloads zip would have silently
// missed the fast path and this would have rebuilt on EVERY download. Both are normalised to numbers here.
async function selfZipCandidate({ dlDir, liveVersion } = {}) {
    const liveRaw = liveVersion != null ? liveVersion : engineVersion();
    const liveNum = typeof liveRaw === "number" ? liveRaw : parseInt(String(liveRaw).replace(/^v/i, ""), 10);
    const home = os.homedir();
    const dir = dlDir || (home ? path.join(home, "Downloads") : null);
    let best = null;
    if (dir) {
        let files = []; try { files = fs.readdirSync(dir); } catch {}
        for (const f of files) { const p2 = buildName.parseBuildZip(f); if (p2 && p2.version === liveNum) best = { path: path.join(dir, f), name: f, version: p2.version }; }
    }
    if (best) return { ok: true, path: best.path, name: best.name, version: best.version, built: false };
    const built = await makeInstallable({});
    if (!built.ok) return { ok: false, error: "no Downloads zip matches the running build (v" + liveNum + ") and building one fresh failed: " + built.error };
    return { ok: true, path: built.path, name: path.basename(built.path), version: built.version, built: true };
}

// v4019 -- _skipFile JOINS THE EXPORTS, AND THE REASON IS THE BUG IT ALREADY CAUSED ONCE, IMMEDIATELY.
// v3948 exported SKIP_DIRS and SKIP_FILES "so that a caller asking 'would this path end up in a release?'"
// could ask. tools/ship/artifactCensus.mjs is that caller -- and asking with the two SETS ALONE gave the wrong
// answer on its first run: 4797 files against the real copy's 4792. The sets are only half the rule. The other
// half is the five PATTERN skips in _skipFile (*.zip, petfbi-*.json, *-seen.json, ha-*.json), which a caller
// cannot see and would have to re-type -- and a re-typed rule is the second copy that never gets updated.
// Exporting the PREDICATE means there is one answer to "does this file ship", not two that agree today.
module.exports = { makeGmailSafe, makeGmailSafeFromZip, makeInstallable, selfZipCandidate, progress, engineVersion, externalAssetsDir, PROJECT_ROOT, SKIP_DIRS, SKIP_FILES, _skipFile, normalizeZipSeparators };
