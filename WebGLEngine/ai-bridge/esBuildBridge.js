// WebGLEngine/ai-bridge/esBuildBridge.js — run the Endless Sky universe baker on demand.
//
// Owns:
//   GET  /es/status                  is es-universe.json present? size, counts, coverage
//   GET  /es/coverage                just the coverage block (what the adapter ignores)
//   POST /es/build  {dataDir}        run `node es-build.mjs <dataDir> es-universe.json`
//
// Mirrors the evScanBridge owns()/handle() shape so it drops into server.js with one block.
//
// Honest behaviours, all deliberate:
//   - the baker is a CHILD PROCESS with a hard timeout; a wedged bake cannot hang the bridge.
//   - dataDir is validated before spawn, and must actually contain .txt files, or we say so
//     instead of running for two minutes and producing an empty universe.
//   - the existing es-universe.json is written to a TEMP file first and only swapped in on
//     success, so a failed bake never destroys a working galaxy.
//   - a universe baked before the coverage reporter existed has no `coverage` key. We report
//     that as "not measured — rebake" rather than implying 100% coverage.

const { execFile } = require("child_process");
const https = require("https");
const zlib = require("zlib");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");                  // WebGLEngine/
const BUILDER = path.join(ROOT, "es-build.mjs");
const UNIVERSE = path.join(ROOT, "es-universe.json");
const TIMEOUT_MS = 300000;                                // 5 min: real ES data is ~1000 files
const ES_DATA_DIR = path.join(ROOT, "ev", "es-data");     // where Install puts the .txt tree
const ES_PLUGIN_DIR = path.join(ROOT, "ev", "es-plugins"); // where plugin data trees land
const GH_TARBALL = (repo, ref) => `https://codeload.github.com/${repo}/tar.gz/refs/heads/${ref}`;
const ES_TARBALL = (ref) => `https://codeload.github.com/endless-sky/endless-sky/tar.gz/refs/heads/${ref}`;

function owns(url) {
    const u = (url || "").split("?")[0];
    return u === "/es/status" || u === "/es/coverage" || u === "/es/build" || u === "/es/install"
        || u === "/es/plugins" || u === "/es/plugins/install";
}

// v2164 -- Plugins. Real plugin repos nest each plugin in its own folder, each with a data/
// dir (verified against zuckung/endless-sky-plugins: 178 data/*.txt across many plugins).
// We extract ONLY */data/**.txt and group by the plugin folder. We do NOT fetch images: a
// single plugin repo tarball is ~265MB and it is almost all art. Ship sprites already load
// from the ES repo's raw URLs at runtime; plugin art would need the same treatment and is
// deliberately left for later rather than half-done.
function extractPluginData(buf, destRoot) {
    let off = 0;
    const plugins = new Map();
    const fullPaths = new Map();     // plugin -> its path inside the repo (needed for the images root)
    const withImages = new Set();    // plugins that actually ship art
    while (off + 512 <= buf.length) {
        const hdr = buf.subarray(off, off + 512);
        if (hdr.every((b) => b === 0)) break;
        let name = hdr.subarray(0, 100).toString("utf8").replace(/\0.*$/, "");
        const prefix = hdr.subarray(345, 500).toString("utf8").replace(/\0.*$/, "");
        if (prefix) name = prefix + "/" + name;
        const size = parseInt(hdr.subarray(124, 136).toString("utf8").replace(/\0.*$/, "").trim(), 8) || 0;
        const type = String.fromCharCode(hdr[156]);
        off += 512;
        const end = off + Math.ceil(size / 512) * 512;
        if (type === "0" || type === "\0") {
            const rel = name.replace(/^[^/]+\//, "");                 // drop "<repo>-<ref>/"
            const im = /^(?:(.*)\/)?images\//i.exec(rel);
            if (im) { const f = im[1] || ""; if (f) withImages.add(f.split("/").pop()); }
            const m = /^(?:(.*)\/)?data\/(.+\.txt)$/i.exec(rel);      // <plugin?>/data/<file>.txt
            if (m && !rel.includes("..")) {
                const full = m[1] || "";                                // e.g. "myplugins/better.starts"
                const plugin = full ? full.split("/").pop() : "root";
                if (full) fullPaths.set(plugin, full);
                const out = path.join(destRoot, plugin, "data", m[2]);
                if (path.resolve(out).startsWith(path.resolve(destRoot))) {
                    fs.mkdirSync(path.dirname(out), { recursive: true });
                    fs.writeFileSync(out, buf.subarray(off, off + size));
                    plugins.set(plugin, (plugins.get(plugin) || 0) + 1);
                }
            }
        }
        off = end;
    }
    return [...plugins.entries()]
        .map(([name, files]) => ({ name, files, path: fullPaths.get(name) || "", hasImages: withImages.has(name) }))
        .sort((a, b) => b.files - a.files);
}

// raw.githubusercontent serves plugin art with `access-control-allow-origin: *` (verified), which
// the sprite baker needs to read pixels back off the canvas.
const RAW = (repo, ref, sub) => `https://raw.githubusercontent.com/${repo}/${ref}/${sub ? sub + "/" : ""}images/`;

function manifestPath() { return path.join(ES_PLUGIN_DIR, "_manifest.json"); }
function readManifest() { try { return JSON.parse(fs.readFileSync(manifestPath(), "utf8")); } catch { return {}; } }
function writeManifest(m) { try { fs.mkdirSync(ES_PLUGIN_DIR, { recursive: true }); fs.writeFileSync(manifestPath(), JSON.stringify(m, null, 2)); } catch {} }

function listPlugins() {
    if (!fs.existsSync(ES_PLUGIN_DIR)) return [];
    const man = readManifest();
    return fs.readdirSync(ES_PLUGIN_DIR, { withFileTypes: true })
        .filter((e) => e.isDirectory() && fs.existsSync(path.join(ES_PLUGIN_DIR, e.name, "data")))
        .map((e) => {
            const meta = man[e.name] || {};
            return {
                name: e.name,
                files: countTxt(path.join(ES_PLUGIN_DIR, e.name)),
                dir: path.join(ES_PLUGIN_DIR, e.name, "data"),
                repo: meta.repo || null, ref: meta.ref || null,
                hasImages: !!meta.hasImages,
                // null when the plugin ships no art -- the page must not add a base that 404s everything
                imagesBase: (meta.hasImages && meta.repo) ? RAW(meta.repo, meta.ref, meta.path) : null,
            };
        })
        .sort((a, b) => b.files - a.files);
}

// v2163 -- Install: stream the Endless Sky source tarball and extract ONLY data/*.txt.
// We parse the tar in JS rather than shelling out to `tar`: GNU tar needs --wildcards,
// Windows' bundled bsdtar does not accept it, and getting that wrong fails on ONE of
// Keith's two machines. tar is a trivial format -- 512-byte headers, 512-byte blocks.
// Nothing is written outside ES_DATA_DIR (path traversal is rejected, not sanitised).
function extractDataTxt(buf, destDir) {
    let off = 0, written = 0, bytes = 0;
    const files = [];
    while (off + 512 <= buf.length) {
        const hdr = buf.subarray(off, off + 512);
        if (hdr.every((b) => b === 0)) break;                       // end-of-archive
        let name = hdr.subarray(0, 100).toString("utf8").replace(/\0.*$/, "");
        const prefix = hdr.subarray(345, 500).toString("utf8").replace(/\0.*$/, "");
        if (prefix) name = prefix + "/" + name;
        const sizeStr = hdr.subarray(124, 136).toString("utf8").replace(/\0.*$/, "").trim();
        const size = parseInt(sizeStr, 8) || 0;
        const type = String.fromCharCode(hdr[156]);
        off += 512;
        const dataEnd = off + Math.ceil(size / 512) * 512;
        if (type === "0" || type === "\0") {
            // strip the leading "endless-sky-<ref>/" component
            const rel = name.replace(/^[^/]+\//, "");
            if (/^data\/.+\.txt$/i.test(rel) && !rel.includes("..")) {
                const out = path.join(destDir, rel);
                if (!path.resolve(out).startsWith(path.resolve(destDir))) { off = dataEnd; continue; }  // traversal
                fs.mkdirSync(path.dirname(out), { recursive: true });
                fs.writeFileSync(out, buf.subarray(off, off + size));
                written++; bytes += size; files.push(rel);
            }
        }
        off = dataEnd;
    }
    return { written, bytes, files };
}

function download(url, cb, depth) {
    if ((depth || 0) > 5) return cb(new Error("too many redirects"));
    https.get(url, { headers: { "user-agent": "swek-engine" } }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            res.resume();
            return download(res.headers.location, cb, (depth || 0) + 1);
        }
        if (res.statusCode !== 200) { res.resume(); return cb(new Error("HTTP " + res.statusCode + " from " + url)); }
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => cb(null, Buffer.concat(chunks)));
    }).on("error", cb);
}

function readUniverseMeta() {
    if (!fs.existsSync(UNIVERSE)) return { present: false };
    const st = fs.statSync(UNIVERSE);
    let counts = null, coverage = null, source = null;
    try {
        const j = JSON.parse(fs.readFileSync(UNIVERSE, "utf8"));
        counts = j.counts || null;
        coverage = j.coverage || null;
        source = j.source || null;
    } catch (e) { return { present: true, bytes: st.size, parseError: e.message }; }
    return {
        present: true, bytes: st.size, mtime: st.mtimeMs, source, counts,
        coverage,
        coverageMeasured: !!coverage,
        note: coverage ? null : "this universe was baked before the coverage reporter existed — rebake to measure what the adapter ignores",
    };
}

function countTxt(dir) {
    let n = 0;
    (function walk(d) {
        let ents; try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
        for (const e of ents) {
            const p = path.join(d, e.name);
            if (e.isDirectory()) walk(p);
            else if (/\.txt$/i.test(e.name)) n++;
        }
    })(dir);
    return n;
}

function handle(req, res, ctx = {}) {
    const sendJson = ctx.sendJson || ((o, code = 200) => {
        res.writeHead(code, { "Content-Type": "application/json" });
        res.end(JSON.stringify(o));
    });
    const p = (req.url || "").split("?")[0];

    if (req.method === "GET" && p === "/es/status") {
        return sendJson(Object.assign({ ok: true, builder: fs.existsSync(BUILDER) }, readUniverseMeta()));
    }

    if (req.method === "GET" && p === "/es/coverage") {
        const m = readUniverseMeta();
        if (!m.present) return sendJson({ ok: false, error: "no es-universe.json — build one first" }, 404);
        if (!m.coverage) return sendJson({ ok: true, measured: false, note: m.note });
        return sendJson({ ok: true, measured: true, coverage: m.coverage });
    }

    if (req.method === "GET" && p === "/es/plugins") {
        return sendJson({ ok: true, plugins: listPlugins(), dir: ES_PLUGIN_DIR });
    }

    if (req.method === "POST" && p === "/es/plugins/install") {
        let body = "";
        req.on("data", (c) => { body += c; if (body.length > 4096) body = body.slice(0, 4096); });
        req.on("end", () => {
            let repo = "", ref = "main";
            try {
                const j = JSON.parse(body || "{}");
                repo = String(j.repo || "").trim().replace(/^https?:\/\/github\.com\//i, "").replace(/\.git$/, "").replace(/\/+$/, "");
                if (j.ref && /^[\w.\-\/]{1,60}$/.test(j.ref)) ref = j.ref;
            } catch {}
            if (!/^[\w.\-]+\/[\w.\-]+$/.test(repo)) return sendJson({ ok: false, error: "repo must look like owner/name (or a github.com URL)" }, 400);
            const started = Date.now();
            const tryRef = (r, fallback) => download(GH_TARBALL(repo, r), (err, gz) => {
                if (err && fallback) return tryRef(fallback, null);
                if (err) return sendJson({ ok: false, error: "download failed: " + err.message }, 502);
                let tar;
                try { tar = zlib.gunzipSync(gz); } catch (e) { return sendJson({ ok: false, error: "not a gzip archive" }, 502); }
                let found;
                try {
                    fs.mkdirSync(ES_PLUGIN_DIR, { recursive: true });
                    found = extractPluginData(tar, ES_PLUGIN_DIR);
                } catch (e) { return sendJson({ ok: false, error: "extract failed: " + e.message }, 500); }
                if (!found.length) return sendJson({ ok: false, error: "no */data/*.txt found in " + repo + "@" + r + " — is it an Endless Sky plugin repo?" }, 502);
                const man = readManifest();
                for (const pl of found) man[pl.name] = { repo, ref: r, path: pl.path, hasImages: pl.hasImages, installedAt: Date.now() };
                writeManifest(man);
                sendJson({
                    ok: true, repo, ref: r, ms: Date.now() - started,
                    downloadKb: Math.round(gz.length / 1024),
                    plugins: found,
                    note: "data only. Plugin art is NOT downloaded (a plugin repo tarball is ~265MB and mostly images).",
                });
            });
            tryRef(ref, ref === "main" ? "master" : null);   // most plugin repos use main; some use master
        });
        return;
    }

    if (req.method === "POST" && p === "/es/install") {
        let body = "";
        req.on("data", (c) => { body += c; if (body.length > 4096) body = body.slice(0, 4096); });
        req.on("end", () => {
            let ref = "master";
            try { const j = JSON.parse(body || "{}"); if (j.ref && /^[\w.\-\/]{1,60}$/.test(j.ref)) ref = j.ref; } catch {}
            const started = Date.now();
            download(ES_TARBALL(ref), (err, gz) => {
                if (err) return sendJson({ ok: false, error: "download failed: " + err.message }, 502);
                let tar;
                try { tar = zlib.gunzipSync(gz); }
                catch (e) { return sendJson({ ok: false, error: "not a gzip archive: " + e.message }, 502); }
                let out;
                try {
                    fs.rmSync(ES_DATA_DIR, { recursive: true, force: true });   // clean install, no stale files
                    fs.mkdirSync(ES_DATA_DIR, { recursive: true });
                    out = extractDataTxt(tar, ES_DATA_DIR);
                } catch (e) { return sendJson({ ok: false, error: "extract failed: " + e.message }, 500); }
                if (!out.written) return sendJson({ ok: false, error: "archive contained no data/*.txt — wrong ref?" }, 502);
                sendJson({
                    ok: true, ref, ms: Date.now() - started,
                    dataDir: path.join(ES_DATA_DIR, "data"),
                    files: out.written, bytes: out.bytes, kb: Math.round(out.bytes / 1024),
                    downloadKb: Math.round(gz.length / 1024),
                    note: "Endless Sky is GPLv3; this fetches its freely-redistributable data. No content ships with SweK.",
                });
            });
        });
        return;
    }

    if (req.method === "POST" && p === "/es/build") {
        let body = "";
        req.on("data", (c) => { body += c; if (body.length > 8192) body = body.slice(0, 8192); });
        req.on("end", () => {
            let dataDir = "";
            try { dataDir = String((JSON.parse(body || "{}").dataDir) || "").trim(); } catch {}
            if (!dataDir) return sendJson({ ok: false, error: "dataDir required (path to the Endless Sky `data` folder)" }, 400);
            if (!fs.existsSync(dataDir)) return sendJson({ ok: false, error: "no such directory: " + dataDir }, 400);
            const txt = countTxt(dataDir);
            if (!txt) return sendJson({ ok: false, error: "no .txt files under " + dataDir + " — is that the ES `data` folder?" }, 400);
            if (!fs.existsSync(BUILDER)) return sendJson({ ok: false, error: "es-build.mjs not found" }, 500);

            // bake to a temp file; only swap in on success, so a failed bake never destroys
            // a working galaxy.
            // v2164 -- optional plugin data dirs, appended AFTER the base so later definitions win
            let pluginDirs = [];
            try {
                const want = JSON.parse(body || "{}").plugins;
                if (Array.isArray(want) && want.length) {
                    const have = listPlugins();
                    pluginDirs = want.map((n) => (have.find((h) => h.name === n) || {}).dir).filter(Boolean);
                }
            } catch {}

            const tmp = UNIVERSE + ".building";
            const started = Date.now();
            execFile(process.execPath, [BUILDER, dataDir, tmp, ...pluginDirs], {
                cwd: ROOT, timeout: TIMEOUT_MS, maxBuffer: 16 * 1024 * 1024,
            }, (err, stdout, stderr) => {
                const log = String(stdout || "") + (stderr ? "\n" + String(stderr) : "");
                if (err) {
                    try { fs.unlinkSync(tmp); } catch {}
                    const why = /timed out|ETIMEDOUT/i.test(err.message) ? `bake exceeded ${TIMEOUT_MS / 1000}s` : err.message;
                    return sendJson({ ok: false, error: why, log: log.slice(-4000) }, 500);
                }
                let meta = null;
                try {
                    const j = JSON.parse(fs.readFileSync(tmp, "utf8"));
                    meta = { source: j.source, counts: j.counts || null, coverage: j.coverage || null };
                    if (j.source !== "endless-sky") throw new Error("baked file is not an endless-sky universe");
                } catch (e) {
                    try { fs.unlinkSync(tmp); } catch {}
                    return sendJson({ ok: false, error: "bake produced an unusable file: " + e.message, log: log.slice(-4000) }, 500);
                }
                fs.renameSync(tmp, UNIVERSE);   // atomic swap
                const st = fs.statSync(UNIVERSE);
                sendJson({
                    ok: true, ms: Date.now() - started, txtFiles: txt, plugins: pluginDirs.length,
                    bytes: st.size, kb: Math.round(st.size / 1024),
                    counts: meta.counts, coverage: meta.coverage,
                    coverageMeasured: !!meta.coverage,
                    log: log.slice(-6000),
                });
            });
        });
        return;
    }
}

module.exports = { owns, handle, extractPluginData, listPlugins, extractDataTxt };
