// WebGLEngine/ai-bridge/ffmpegWasmBridge.js -- v4613
//
// AN INSTALL BUTTON FOR ffmpegwasm/ffmpeg.wasm -- A REAL SOFTWARE H.264 ENCODER, COMPILED TO WASM, NEVER
// VENDORED INTO THIS TREE.
//
// tools/ship/nextRounds.mjs's own "ffmpeg-wasm-h264-encode" entry records what a PRIOR round in this session
// already proved with a real headless-Chromium run: @ffmpeg/ffmpeg@0.12.15 (the MIT JS wrapper) plus
// @ffmpeg/core@0.12.10 (the GPL-2.0-or-later WASM core -- a REAL ffmpeg built --enable-gpl --enable-libx264
// --enable-libx265, confirmed directly in the project's own package.json and Dockerfile) produces genuine
// H.264-in-MP4 on this tree's real environment -- avcC box byte-verified in the output. It ran with
// crossOriginIsolated:false and no SharedArrayBuffer: the SINGLE-THREAD core build needs nothing this tree
// doesn't already have. This bridge fetches exactly that pair and serves it back locally, forever after.
//
// *** TWO DISTINCT LICENSES, NAMED SEPARATELY, ON PURPOSE. *** The wrapper (@ffmpeg/ffmpeg) is MIT. The core
// (@ffmpeg/core) -- the actual encoder doing the work -- is GPL-2.0-or-later. Collapsing these into one
// "license" field would misstate the core's real terms, so UPSTREAM.wrapper.license and UPSTREAM.core.license
// are kept apart below, the way the task that produced this file insisted on.
//
// *** SCOPED TO THE SINGLE-THREAD CORE ONLY. *** The multi-thread @ffmpeg/core-mt build needs
// SharedArrayBuffer, which needs Cross-Origin-Opener-Policy: same-origin + Cross-Origin-Embedder-Policy:
// require-corp added to ai-bridge/server.js's MAIN static-file route (sendFile(), the one that serves every
// engine page today with no such headers) -- a real, scoped change with direct precedent (the /vpi/app/ route
// already sets exactly this pair for a different WASM tool), but a separate, not-yet-decided change outside
// this round's scope. See the REFUSED entry below. Not attempted here.
//
// *** WHY registry.npmjs.org AND NOT raw.githubusercontent.com, UNLIKE verifiedPolygonIntersectionBridge.js. ***
// ffmpeg.wasm ships its build output (dist/umd/*, the actual files this bridge needs) only inside the PUBLISHED
// npm packages -- not committed to the GitHub repo, which holds source and a webpack config, not a built
// artefact. The npm registry tarball is the canonical published build, not something rebuilt here. It also
// happens to be reachable: confirmed directly, reading this sandbox's own agent-proxy status
// (curl -sS "$HTTPS_PROXY/__agentproxy/status") just now shows unpkg.com and cdn.jsdelivr.net both rejected
// with 403 on CONNECT, while registry.npmjs.org sits in the proxy's own no_proxy allowlist -- a direct curl
// fetch against it, tried for real while writing this file, returned HTTP 200 and the exact expected tarball
// sizes for both packages.
//
// *** WHY curl AND NOT NODE'S BUILT-IN https MODULE -- THE SAME REAL, ALREADY-DIAGNOSED PITFALL AS vpi'S. ***
// This sandbox's outbound HTTPS goes through an agent proxy, and Node's own http/https modules have never
// honored HTTP_PROXY/HTTPS_PROXY -- a Node-wide gap, not specific to this sandbox (a real corporate-proxy user
// would hit the identical silent failure). curl DOES read those env vars, and every install script in this
// tree that needed this fix already shells out to it (verifiedPolygonIntersectionBridge.js, install-mac.sh,
// install-steamdeck.sh). Re-confirmed here rather than assumed: this bridge's own real-network gate section
// drives a REAL curl download of both tarballs and checks the bytes.
//
// *** WHY tar AS WELL. *** npm publishes packages as gzip'd tarballs, not loose files raw.githubusercontent.com
// could serve individually the way verified-polygon-intersection's four docs/ files could. Extracting one is a
// second real subprocess call, not a new technique for this tree: ai-bridge/emsdkBridge.js, githubInstall.js,
// updateManifest.js, sysadminBridge.js and vbaArchiveBridge.js all already shell out to `tar -xzf` for exactly
// this reason.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFile } = require("child_process");

const FFMPEG_WRAPPER_VERSION = "0.12.15";
const FFMPEG_CORE_VERSION = "0.12.10";

const UPSTREAM = Object.freeze({
    wrapper: Object.freeze({
        pkg: "@ffmpeg/ffmpeg",
        version: FFMPEG_WRAPPER_VERSION,
        license: "MIT",
        licenseVerified: "2026-09-14 -- package.json's own \"license\" field, read directly from the real npm " +
                         "registry tarball (registry.npmjs.org/@ffmpeg/ffmpeg/-/ffmpeg-0.12.15.tgz), fetched by " +
                         "curl and extracted: \"license\": \"MIT\". The npm tarball carries no separate LICENSE " +
                         "file (only dist/ and package.json), so this is the declaration itself, not a badge.",
        repo: "https://github.com/ffmpegwasm/ffmpeg.wasm",
        what: "the MIT JS wrapper (an FFmpeg class + Worker glue) that drives the WASM core from a normal page",
    }),
    core: Object.freeze({
        pkg: "@ffmpeg/core",
        version: FFMPEG_CORE_VERSION,
        license: "GPL-2.0-or-later",
        licenseVerified: "2026-09-14 -- package.json's own \"license\" field, read directly from the real npm " +
                         "registry tarball (registry.npmjs.org/@ffmpeg/core/-/core-0.12.10.tgz), fetched by curl " +
                         "and extracted: \"license\": \"GPL-2.0-or-later\". Same no-LICENSE-file-in-the-tarball " +
                         "situation as the wrapper; this is the same package.json declaration tools/ship/" +
                         "nextRounds.mjs's own ffmpeg-wasm-h264-encode entry already cites (\"confirmed directly " +
                         "in the WASM project's own package.json and Dockerfile\").",
        repo: "https://github.com/ffmpegwasm/ffmpeg.wasm",
        what: "a REAL ffmpeg compiled --enable-gpl --enable-libx264 --enable-libx265 to WebAssembly -- a genuine " +
              "software H.264/H.265 encoder, not a browser VideoEncoder codec-registry entry",
        buildKind: "single-thread (SharedArrayBuffer-free) build only -- see this file's header for why the " +
                   "multi-thread core-mt build is deliberately out of scope this round",
    }),
    verifiedByPriorRound: "a prior round in this session ran a real headless-Chromium `ffmpeg -f lavfi -i " +
                          "testsrc=... -c:v libx264 -pix_fmt yuv420p out.mp4` against exactly this pair and " +
                          "walked the output MP4's boxes by hand: avc1 at offset 24, avcC (the definitive " +
                          "H.264 marker) at offset 2362 inside moov -- with crossOriginIsolated:false and " +
                          "SharedArrayBuffer undefined throughout.",
});

const MAINTENANCE = Object.freeze({
    checked: "2026-09-14",
    howPinned: "exact, immutable npm registry versions -- not a git commit like verifiedPolygonIntersectionBridge" +
              ".js/grdpwasmBridge.js use. Once published, a specific npm package version's tarball bytes cannot " +
              "change, which is a stronger pin than a mutable branch tip and does not need a commit SHA to get it.",
    howChecked: "curl to registry.npmjs.org (confirmed directly in this sandbox's own agent-proxy no_proxy " +
               "allowlist, reachable with no proxy hop -- unlike unpkg.com/cdn.jsdelivr.net, both seen 403'd on " +
               "CONNECT in this same proxy's own status log) for both tarballs, then dist/umd/* read from the " +
               "real extracted contents -- not assumed from a README.",
});

const REFUSED = Object.freeze([
    { what: "vendoring ffmpeg.wasm's own source (its TypeScript, C, or build scripts) into this tree or a " +
            "release zip -- anything beyond the four published dist/umd/* build outputs",
      why: "only the four PREBUILT UMD/WASM files the npm tarballs already ship in dist/umd/ are ever copied " +
           "out, onto the user's own machine, outside the tree -- the same non-vendoring discipline every other " +
           "install button on this shelf (verifiedPolygonIntersectionBridge.js, grdpwasmBridge.js) already " +
           "follows. Nothing of ffmpeg.wasm's own source ever enters this engine's own repo or process." },
    { what: "running any version but the pinned ones (@ffmpeg/ffmpeg@0.12.15, @ffmpeg/core@0.12.10) without a " +
            "deliberate edit here",
      why: "this exact pair is what a prior round in this session byte-verified produces genuine H.264-in-MP4 " +
           "(avcC located and walked by hand) in this tree's real environment. Fetching whatever the registry's " +
           "latest dist-tag currently points to would run an unreviewed GPL-2.0 software encoder on a real " +
           "machine tomorrow. FFMPEG_WRAPPER_VERSION/FFMPEG_CORE_VERSION only move when this file is edited to " +
           "move them." },
    { what: "fetching or attempting to build the multi-thread @ffmpeg/core-mt WASM core",
      why: "needs SharedArrayBuffer, which needs Cross-Origin-Opener-Policy: same-origin + Cross-Origin-" +
           "Embedder-Policy: require-corp added to ai-bridge/server.js's MAIN static-file route (sendFile(), " +
           "which serves index.html and every engine page today with no such headers) -- a real, scoped change " +
           "with direct precedent (/vpi/app/ already sets exactly this pair for a different tool) but a " +
           "separate, not-yet-decided change outside THIS round's scope. The prior round measured the single-" +
           "thread core needs none of this; that is the only build this bridge ever fetches." },
    { what: "fetching ffmpeg.js/ffmpeg-core.js/ffmpeg-core.wasm from unpkg/jsdelivr or any CDN at runtime -- " +
            "the shape ffmpeg.wasm's own README examples default to (toBlobURL against a CDN URL)",
      why: "this tree's own LAN-server deployment model should not depend on external network access once " +
           "installed, and unpkg.com/cdn.jsdelivr.net sit outside this sandbox's own CDN allowlist besides. " +
           "install() fetches once from the real npm registry into a local cache; every runtime load after " +
           "that (render/ffmpegWasmExport.mjs) is served back from THIS engine's own server, never a CDN." },
]);

// Overridable for the gate, same convention as VPI_SRC_DIR/GRDPWASM_SRC_DIR.
const SRC_DIR = process.env.FFMPEG_WASM_SRC_DIR || path.join(os.homedir(), ".voxelbridge", "ffmpeg-wasm");

// The four files this bridge fetches, stored FLAT in SRC_DIR (not one subfolder per npm package) because
// ffmpeg.js's own UMD bundle auto-detects its "public path" from its own <script> tag's src and then resolves
// 814.ffmpeg.js, ffmpeg-core.js and ffmpeg-core.wasm as SIBLINGS of it at runtime -- confirmed by reading the
// bundle's own webpack publicPath-detection IIFE (`e.p=t` derived from `document.currentScript.src`) and its
// Worker construction (`new Worker(new URL(e.p+e.u(814), e.b))`). Serving all four from one flat /ffwasm/app/
// directory is what lets that relative resolution just work with no rewriting of upstream's own bundle.
//
// minBytes floors are comfortably below the REAL measured sizes (see the gate's own EXACT-size section), so a
// truncated fetch is caught without hardcoding an exact byte count that would break on ffmpeg.wasm's own next
// patch release for this exact pinned pair -- ffmpeg-core.wasm's real size is 32,232,419 bytes (~30.8 MB,
// "tens of MB" per this bridge's own design brief); the floor here is well under that.
const ARTEFACTS = Object.freeze([
    { rel: "ffmpeg.js", minBytes: 3000 },
    { rel: "814.ffmpeg.js", minBytes: 2000 },
    { rel: "ffmpeg-core.js", minBytes: 80000 },
    { rel: "ffmpeg-core.wasm", minBytes: 25000000 },
]);

function _npmTarballUrl(pkg, version) {
    const short = pkg.split("/")[1]; // "@ffmpeg/ffmpeg" -> "ffmpeg"
    return "https://registry.npmjs.org/" + pkg + "/-/" + short + "-" + version + ".tgz";
}

function _run(cmd, args) {
    return new Promise((resolve, reject) => {
        execFile(cmd, args, { windowsHide: true }, (err, _stdout, stderr) => {
            if (err) reject(new Error(cmd + " " + args.join(" ") + " failed: " + ((err && err.message) || err) +
                                       (stderr ? " -- " + String(stderr).slice(0, 300) : "")));
            else resolve();
        });
    });
}

let _job = null; // one install job at a time

function _appendLog(s) { if (_job) { _job.log.push(s); if (_job.log.length > 400) _job.log.shift(); } }

/** Download one npm tarball (curl), extract it (tar), and copy the named dist/umd/* files into SRC_DIR. */
async function _fetchTarballAndCopy(pkg, version, files, scratchDir) {
    const tgz = path.join(scratchDir, pkg.split("/")[1] + ".tgz");
    const url = _npmTarballUrl(pkg, version);
    _appendLog("[install]   " + pkg + "@" + version + " <- " + url + "\n");
    await _run("curl", ["-fsSL", "--max-time", "120", "-o", tgz, url]);
    const extractDir = path.join(scratchDir, pkg.split("/")[1] + "-extracted");
    fs.mkdirSync(extractDir, { recursive: true });
    await _run("tar", ["-xzf", tgz, "-C", extractDir]);
    for (const f of files) {
        const src = path.join(extractDir, "package", "dist", "umd", f);
        const dst = path.join(SRC_DIR, f);
        fs.copyFileSync(src, dst);
        const size = fs.statSync(dst).size;
        _appendLog("[install]   " + f + " -- " + size + " bytes\n");
    }
}

/** Every artefact, checked by EXISTENCE AND SIZE rather than by a fetch's own reported success. */
function built() {
    return ARTEFACTS.every((a) => {
        try { return fs.statSync(path.join(SRC_DIR, a.rel)).size >= a.minBytes; }
        catch { return false; }
    });
}

/**
 * Fetch both npm tarballs and extract the four dist/umd/* files into SRC_DIR. Returns as soon as the job
 * STARTS; the panel polls installStatus(), the same fire-and-poll shape verifiedPolygonIntersectionBridge.js/
 * grdpwasmBridge.js/galaxyProfileBridge use. This one genuinely does take real seconds (a real ~20 MB
 * gzip'd download), unlike vpi's sub-second job, but the shape stays the same for the caller.
 */
function install() {
    if (_job && !_job.done) return { ok: false, error: "an install is already running", job: installStatus().job };
    _job = { kind: "fetch", log: [], done: false, code: null, startedAt: Date.now() };
    try { fs.mkdirSync(SRC_DIR, { recursive: true }); } catch (e) {
        _job.done = true; _job.code = -1;
        _appendLog("[install] could not create " + SRC_DIR + ": " + ((e && e.message) || e) + "\n");
        return { ok: true, started: true, srcDir: SRC_DIR };
    }
    _appendLog("[install] fetching @ffmpeg/ffmpeg@" + FFMPEG_WRAPPER_VERSION + " + @ffmpeg/core@" +
               FFMPEG_CORE_VERSION + " from registry.npmjs.org...\n");
    (async () => {
        let scratch = null;
        try {
            scratch = fs.mkdtempSync(path.join(os.tmpdir(), "ffwasm-install-"));
            await _fetchTarballAndCopy("@ffmpeg/ffmpeg", FFMPEG_WRAPPER_VERSION, ["ffmpeg.js", "814.ffmpeg.js"], scratch);
            await _fetchTarballAndCopy("@ffmpeg/core", FFMPEG_CORE_VERSION, ["ffmpeg-core.js", "ffmpeg-core.wasm"], scratch);
            _job.done = true;
            _job.code = built() ? 0 : -1;
            if (_job.code !== 0) _appendLog("[install] all fetches completed but built() still reports missing/undersized artefacts\n");
            else _appendLog("[install] done -- all 4 files present at expected size\n");
        } catch (e) {
            _job.done = true; _job.code = -1;
            _appendLog("[install] FAILED: " + ((e && e.message) || e) + "\n");
        } finally {
            if (scratch) { try { fs.rmSync(scratch, { recursive: true, force: true }); } catch {} }
        }
    })();
    return { ok: true, started: true, srcDir: SRC_DIR };
}

function installStatus() {
    if (!_job) return { ok: true, job: null };
    return { ok: true, job: { kind: _job.kind, done: _job.done, code: _job.code,
                              ms: Date.now() - _job.startedAt, log: _job.log.join("").slice(-8000) } };
}

function status() {
    return {
        ok: true,
        srcDir: SRC_DIR,
        built: built(),
        missingArtefacts: ARTEFACTS.filter((a) => {
            try { return fs.statSync(path.join(SRC_DIR, a.rel)).size < a.minBytes; } catch { return true; }
        }).map((a) => a.rel),
        appBase: built() ? "/ffwasm/app/" : null,
        upstream: UPSTREAM,
        maintenance: MAINTENANCE,
        refused: REFUSED,
        installJob: installStatus().job,
    };
}

/** Serve one artefact from SRC_DIR, or null if it isn't (yet) installed / isn't a recognized file. */
function readArtefact(rel) {
    const known = ARTEFACTS.find((a) => a.rel === rel);
    if (!known) return null;
    const p = path.join(SRC_DIR, rel);
    try { return fs.readFileSync(p); } catch { return null; }
}

module.exports = { install, installStatus, status, built, readArtefact,
                   UPSTREAM, MAINTENANCE, REFUSED, SRC_DIR, ARTEFACTS,
                   FFMPEG_WRAPPER_VERSION, FFMPEG_CORE_VERSION };
