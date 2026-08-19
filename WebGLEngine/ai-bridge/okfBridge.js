// WebGLEngine/ai-bridge/okfBridge.js — v2624
//
// SERVE THE OKF BUNDLE AS A LIVE SERVICE, not just a static zip.
//
// ---- WHY -----------------------------------------------------------------------------------------------------------
//
// v2623 built an emitter: it writes the engine's 92 claims + 52 docs as a conformant OKF v0.1 bundle to disk.
// But a bundle on disk is not a service -- another agent, or a LAN peer, cannot READ it without a filesystem
// path. OKF is a format, not a platform, and the spec's own answer is that a bundle "renders on GitHub, ships
// as a tarball, and mounts on any filesystem" -- OR is served at a stable URL like /okf/. This is the /okf/.
//
// So an agent (or a peer, or the next session over the Cloudflare tunnel) can now GET http://<engine>/okf/ and
// walk the bundle by following the markdown links, exactly as the format intends. This is also the first
// concrete instance of the "peer service" pattern Keith is circling: a machine advertises an HTTP service and
// the LAN reaches it. A Mac running Rockxy would expose itself the same way; the OKF endpoint is that pattern,
// realised, on the machine we control.
//
// ---- DISCIPLINE ----------------------------------------------------------------------------------------------------
//
//   * Read-only + public. The bundle is the engine's own published self-knowledge (predictions.html is already
//     served); there is nothing here to trust-gate. No write routes exist.
//   * Path traversal is refused: a request path is resolved and MUST stay inside the bundle dir, or 404.
//   * Lazily generated, version-keyed. The bundle is emitted once per engine version into a cache dir and
//     served from there; a version bump regenerates it, so it can never serve a stale claim set.
"use strict";
const fs = require("fs");
const path = require("path");
const os = require("os");

const ROOT = path.resolve(__dirname, "..");                 // WebGLEngine/
let _cacheDir = null;
let _cacheVersion = null;

function engineVersion() {
    try { return (fs.readFileSync(path.join(ROOT, "main.js"), "utf8").match(/ENGINE_VERSION = "(v\d+)"/) || [, "v0000"])[1]; }
    catch { return "v0000"; }
}

// Emit (once per version) via the ESM emitter, dynamically imported so this CJS bridge can call it.
async function ensureBundle() {
    const version = engineVersion();
    if (_cacheDir && _cacheVersion === version && fs.existsSync(path.join(_cacheDir, "index.md"))) return _cacheDir;
    const dir = path.join(os.tmpdir(), "swek-okf-" + version);
    const mod = await import("../tools/okf/emitOKF.mjs");    // resolves from ai-bridge/ -> tools/okf/
    mod.emitOKF(dir, { version });
    _cacheDir = dir; _cacheVersion = version;
    return dir;
}

const TYPES = { ".md": "text/markdown; charset=utf-8", ".json": "application/json", ".txt": "text/plain; charset=utf-8" };

function owns(url) {
    const p = (url || "").split("?")[0];
    return p === "/okf" || p === "/okf/" || p.startsWith("/okf/");
}

async function handle(req, res, ctx = {}) {
    const sendJson = ctx.sendJson || ((o, c = 200) => { res.writeHead(c, { "Content-Type": "application/json" }); res.end(JSON.stringify(o)); });
    let pathname;
    try { pathname = decodeURIComponent((req.url || "").split("?")[0]); } catch { pathname = (req.url || "").split("?")[0]; }

    // /okf/brief.json | /okf/brief.md -- the engine CONSUMING its own OKF bundle: read the format back and
    // summarise it (claim tally + open claims to adjudicate + recent log). This closes the produce->serve->
    // consume loop; without a consumer the bundle is write-only.
    if (pathname === "/okf/brief.json" || pathname === "/okf/brief.md") {
        const dir = await ensureBundle();
        const cons = await import("../tools/okf/okfConsume.mjs");
        const brief = cons.consumeBundle(dir);
        if (pathname === "/okf/brief.md") {
            res.writeHead(200, { "Content-Type": "text/markdown; charset=utf-8", "X-OKF-Version": "0.1" });
            res.end(cons.briefMarkdown(brief));
        } else {
            return sendJson({ ok: true, okf_version: "0.1", engine: engineVersion(), brief });
        }
        return;
    }

    // /okf/manifest.json -- a convenience index of the bundle for programmatic consumers (not part of OKF itself).
    if (pathname === "/okf/manifest.json") {
        const dir = await ensureBundle();
        const files = [];
        (function walk(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const fp = path.join(d, e.name); if (e.isDirectory()) walk(fp); else files.push("/" + path.relative(dir, fp).split(path.sep).join("/")); } })(dir);
        return sendJson({ ok: true, okf_version: "0.1", engine: engineVersion(), root: "/okf/index.md", files: files.sort() });
    }

    const dir = await ensureBundle();
    // map the request path under /okf to a file in the bundle; bare /okf or /okf/ -> index.md
    let rel = pathname.replace(/^\/okf\/?/, "");
    if (rel === "" || rel.endsWith("/")) rel += "index.md";

    // PATH TRAVERSAL GUARD: resolve and require the result to stay inside the bundle dir.
    const target = path.resolve(dir, rel);
    if (target !== dir && !target.startsWith(dir + path.sep)) {
        res.writeHead(403, { "Content-Type": "text/plain" }); res.end("forbidden"); return;
    }
    if (!fs.existsSync(target) || !fs.statSync(target).isFile()) {
        // OKF consumers tolerate broken links, so a missing concept is a plain 404, not an error.
        res.writeHead(404, { "Content-Type": "text/plain" }); res.end("not found in OKF bundle: " + rel); return;
    }
    const type = TYPES[path.extname(target)] || "text/plain; charset=utf-8";
    res.writeHead(200, { "Content-Type": type, "X-OKF-Version": "0.1", "Cache-Control": "no-cache" });
    res.end(fs.readFileSync(target));
}

module.exports = { owns, handle, ensureBundle, engineVersion, _dir: () => _cacheDir };
