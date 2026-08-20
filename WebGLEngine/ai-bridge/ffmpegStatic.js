// ai-bridge/ffmpegStatic.js — v1917
// Direct static-binary install of ffmpeg, so an old Mac never has to compile it via Homebrew (macOS 12 is
// Homebrew "Tier 3" = no bottles = a 30-45 min source build that keeps failing). Downloads a prebuilt
// static ffmpeg from evermeet.cx (the standard macOS static-build source, Intel x86_64 — which also runs
// on Apple Silicon via Rosetta), unzips it into ~/.voxelbridge/bin/ffmpeg, and clears the Gatekeeper
// quarantine so it can execute. No sudo, no brew, no PATH pollution — go2rtc's PATH already includes this
// dir (v1917). Returns the final binary path.
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const BIN_DIR = path.join(os.homedir(), ".voxelbridge", "bin");
const FFMPEG = path.join(BIN_DIR, "ffmpeg");
// evermeet.cx release API (returns a zip containing the `ffmpeg` binary). Intel build; runs on both.
const URL = "https://evermeet.cx/ffmpeg/getrelease/zip";

function installed() { try { return fs.existsSync(FFMPEG) && fs.statSync(FFMPEG).size > 1000000; } catch { return false; } }
function binPath() { return installed() ? FFMPEG : null; }
function binDir() { return BIN_DIR; }

let _state = { installing: false, lastOk: null, lastErr: null, ts: 0 };
function status() { return Object.assign({}, _state, { installed: installed(), path: installed() ? FFMPEG : null }); }

// Download + install. macOS only (evermeet is a mac build). fetchImpl passed in to reuse the bridge fetch.
async function install(fetchImpl) {
    if (process.platform !== "darwin") return { ok: false, error: "static ffmpeg download is macOS-only" };
    if (installed()) return { ok: true, already: true, path: FFMPEG };
    if (_state.installing) return { ok: true, installing: true };
    _state = { installing: true, lastOk: null, lastErr: null, ts: Date.now() };
    const f = fetchImpl || (typeof fetch !== "undefined" ? fetch : null);
    if (!f) { _state = { installing: false, lastOk: false, lastErr: "no fetch", ts: Date.now() }; return { ok: false, error: "no fetch" }; }
    const zipPath = path.join(os.tmpdir(), "swek-ffmpeg-" + Date.now() + ".zip");
    try {
        fs.mkdirSync(BIN_DIR, { recursive: true });
        // 1) download the zip
        const r = await f(URL, { signal: AbortSignal.timeout(120000), redirect: "follow", headers: { "User-Agent": "SweK/1 ffmpeg-fetch" } });
        if (!r.ok) throw new Error("download failed: HTTP " + r.status);
        const buf = Buffer.from(await r.arrayBuffer());
        if (buf.length < 1000000) throw new Error("download too small (" + buf.length + " bytes) — not a valid zip");
        fs.writeFileSync(zipPath, buf);
        // 2) unzip (macOS ships `unzip`). Extract just the ffmpeg binary into BIN_DIR.
        const uz = spawnSync("unzip", ["-o", "-j", zipPath, "ffmpeg", "-d", BIN_DIR], { timeout: 60000 });
        if (uz.status !== 0 && !fs.existsSync(FFMPEG)) {
            // some archives name it differently; try extracting everything then find it
            spawnSync("unzip", ["-o", "-j", zipPath, "-d", BIN_DIR], { timeout: 60000 });
        }
        if (!fs.existsSync(FFMPEG)) throw new Error("ffmpeg not found in the downloaded archive");
        // 3) make executable + clear Gatekeeper quarantine so it can run
        try { fs.chmodSync(FFMPEG, 0o755); } catch {}
        try { spawnSync("xattr", ["-dr", "com.apple.quarantine", FFMPEG], { timeout: 8000 }); } catch {}
        // 4) sanity-check it runs
        const v = spawnSync(FFMPEG, ["-version"], { timeout: 8000 });
        const ver = (v.stdout || "").toString().split("\n")[0] || "";
        if (v.status !== 0) {
            // Apple Silicon may need an ad-hoc signature
            try { spawnSync("codesign", ["-s", "-", FFMPEG], { timeout: 8000 }); } catch {}
            const v2 = spawnSync(FFMPEG, ["-version"], { timeout: 8000 });
            if (v2.status !== 0) throw new Error("downloaded ffmpeg won't run (" + ((v2.stderr || "") + "").slice(0, 120) + ")");
        }
        _state = { installing: false, lastOk: true, lastErr: null, ts: Date.now() };
        return { ok: true, path: FFMPEG, version: ver };
    } catch (e) {
        _state = { installing: false, lastOk: false, lastErr: String(e && e.message || e), ts: Date.now() };
        return { ok: false, error: String(e && e.message || e) };
    } finally {
        try { fs.unlinkSync(zipPath); } catch {}
    }
}

module.exports = { install, installed, binPath, binDir, status, FFMPEG, BIN_DIR };
