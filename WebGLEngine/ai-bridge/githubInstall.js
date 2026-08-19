// ai-bridge/githubInstall.js — v1989
// Auto-install a bgServices tool directly from its GitHub Releases, cross-platform.
// Fills the gap between winget (Windows-only) and "go download it yourself":
// picks the right release asset for this OS+arch, downloads it, extracts archives,
// drops the binary in the engine's tools dir, and marks it executable.
//
// A catalog entry opts in with a `github: "owner/repo"` field plus an optional
// `ghAsset` matcher. Selection order for the asset:
//   1) explicit svc.ghAsset (string substring or {win,mac,linux} per-platform substrings)
//   2) heuristic: name contains this platform's token AND this arch's token
//      (win/windows/.exe, darwin/mac/macos, linux; x64/amd64/x86_64, arm64/aarch64)
//   3) if exactly one asset, use it.
// Then: .zip/.tar.gz/.tgz are extracted and the largest executable-looking file is
// kept; a bare binary/.exe is used as-is. Result lands in <toolsDir>/<id>/.
//
// Auth: honors a GitHub token (avoids the 60 req/hr anonymous limit) passed in as
// opts.token — the caller reads it from wherever the engine stores creds.

const fs = require("fs");
const path = require("path");
const https = require("https");
const os = require("os");
const { spawnSync } = require("child_process");

const WIN = process.platform === "win32";
const MAC = process.platform === "darwin";

function _arch() {
    const a = process.arch;
    if (a === "x64") return ["x64", "amd64", "x86_64", "x86-64"];
    if (a === "arm64") return ["arm64", "aarch64"];
    if (a === "ia32") return ["386", "i686", "x86"];
    return [a];
}
function _plat() {
    if (WIN) return ["windows", "win", "win64", "win32"];
    if (MAC) return ["darwin", "macos", "mac", "apple", "osx"];
    return ["linux", "gnu", "musl"];
}

function _ghGet(urlStr, token, redirects = 0) {
    return new Promise((resolve, reject) => {
        if (redirects > 6) return reject(new Error("too many redirects"));
        const u = new URL(urlStr);
        const headers = { "User-Agent": "SweKEngine/1.0 (+github-install)", "Accept": "application/vnd.github+json" };
        if (token) headers.Authorization = "Bearer " + token;
        https.get({ hostname: u.hostname, path: u.pathname + u.search, headers }, (res) => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                res.resume();
                return resolve(_ghGet(new URL(res.headers.location, urlStr).toString(), token, redirects + 1));
            }
            if (res.statusCode !== 200) { res.resume(); return reject(new Error("GitHub HTTP " + res.statusCode + " for " + urlStr)); }
            const chunks = []; res.on("data", d => chunks.push(d)); res.on("end", () => resolve(Buffer.concat(chunks)));
        }).on("error", reject);
    });
}
function _ghDownload(urlStr, dest, token, redirects = 0) {
    return new Promise((resolve, reject) => {
        if (redirects > 6) return reject(new Error("too many redirects"));
        const u = new URL(urlStr);
        const headers = { "User-Agent": "SweKEngine/1.0 (+github-install)", "Accept": "application/octet-stream" };
        if (token) headers.Authorization = "Bearer " + token;
        https.get({ hostname: u.hostname, path: u.pathname + u.search, headers }, (res) => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                res.resume();
                return resolve(_ghDownload(new URL(res.headers.location, urlStr).toString(), dest, token, redirects + 1));
            }
            if (res.statusCode !== 200) { res.resume(); return reject(new Error("download HTTP " + res.statusCode)); }
            const ws = fs.createWriteStream(dest);
            res.pipe(ws);
            ws.on("finish", () => ws.close(() => resolve(dest)));
            ws.on("error", reject);
        }).on("error", reject);
    });
}

// Rank candidate assets for this platform. Returns the best asset object or null.
function _pickAsset(assets, svc) {
    if (!assets || !assets.length) return null;
    const names = assets.map(a => ({ a, n: (a.name || "").toLowerCase() }));
    // 1) explicit matcher
    const want = svc && svc.ghAsset;
    if (want) {
        const sub = typeof want === "string" ? want : (WIN ? want.win : MAC ? want.mac : want.linux);
        if (sub) { const hit = names.find(x => x.n.includes(String(sub).toLowerCase())); if (hit) return hit.a; }
    }
    const plats = _plat(), archs = _arch();
    const isInstaller = (n) => /\.(msi|dmg|pkg|deb|rpm|appimage)$/i.test(n);
    // 2) platform AND arch, prefer archives / plain binaries over OS installers
    const scored = names.map(x => {
        let s = 0;
        if (plats.some(p => x.n.includes(p))) s += 4;
        if (archs.some(ar => x.n.includes(ar))) s += 3;
        if (WIN && x.n.endsWith(".exe")) s += 2;
        if (/\.(zip|tar\.gz|tgz)$/i.test(x.n)) s += 1;
        if (isInstaller(x.n)) s -= 5;                    // avoid MSIs — we can't silently run all of them here
        // penalize obvious wrong platforms
        if (!plats.some(p => x.n.includes(p)) && /(windows|darwin|macos|linux)/.test(x.n)) s -= 4;
        return { a: x.a, s };
    }).sort((p, q) => q.s - p.s);
    if (scored.length && scored[0].s > 0) return scored[0].a;
    // 3) single asset fallback
    if (assets.length === 1) return assets[0];
    return null;
}

function _extract(archive, outDir) {
    const lower = archive.toLowerCase();
    try {
        if (lower.endsWith(".zip")) {
            if (WIN) spawnSync("powershell", ["-NoProfile", "-Command", `Expand-Archive -LiteralPath '${archive}' -DestinationPath '${outDir}' -Force`], { timeout: 120000 });
            else spawnSync("unzip", ["-o", archive, "-d", outDir], { timeout: 120000 });
            return true;
        }
        if (lower.endsWith(".tar.gz") || lower.endsWith(".tgz")) {
            spawnSync("tar", ["-xzf", archive, "-C", outDir], { timeout: 120000 });
            return true;
        }
    } catch {}
    return false;
}

// Find the most likely binary in a freshly-extracted dir (largest file whose name
// matches the service id / repo, else largest executable-ish file).
function _findBinary(dir, hint) {
    let best = null;
    const walk = (d) => {
        let ents = []; try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
        for (const e of ents) {
            const full = path.join(d, e.name);
            if (e.isDirectory()) { walk(full); continue; }
            const n = e.name.toLowerCase();
            if (/\.(txt|md|json|yml|yaml|sha256|sig|license|1)$/i.test(n)) continue;
            let size = 0; try { size = fs.statSync(full).size; } catch {}
            const wantExe = WIN ? n.endsWith(".exe") : true;
            const hinted = hint && n.includes(hint.toLowerCase());
            const score = size + (hinted ? 1e9 : 0) + (wantExe ? 5e8 : 0);
            if (!best || score > best.score) best = { full, score, size };
        }
    };
    walk(dir);
    return best && best.full;
}

// Main entry. svc = catalog entry (needs svc.github "owner/repo"). Returns
// { ok, binPath?, version?, asset?, error? }.
async function installFromGithub(id, svc, opts = {}) {
    if (!svc || !svc.github) return { ok: false, error: "no github repo on this service" };
    const token = opts.token || process.env.GITHUB_TOKEN || null;
    const toolsDir = opts.toolsDir || path.join(os.homedir(), ".swek", "tools");
    const outDir = path.join(toolsDir, id);
    try { fs.mkdirSync(outDir, { recursive: true }); } catch {}

    let rel;
    try {
        const body = await _ghGet(`https://api.github.com/repos/${svc.github}/releases/latest`, token);
        rel = JSON.parse(body.toString());
    } catch (e) {
        return { ok: false, error: "couldn't read latest release (" + (e && e.message) + ")" +
            (String(e && e.message).includes("403") ? " — set a GitHub token to lift the 60/hr anonymous rate limit" : "") };
    }
    const asset = _pickAsset(rel.assets || [], svc);
    if (!asset) {
        return { ok: false, error: "no matching asset for " + process.platform + "/" + process.arch +
            " in " + svc.github + "@" + (rel.tag_name || "latest") + ". Assets: " +
            (rel.assets || []).map(a => a.name).join(", ").slice(0, 300) };
    }
    const dlPath = path.join(outDir, asset.name);
    try { await _ghDownload(asset.browser_download_url, dlPath, token); }
    catch (e) { return { ok: false, error: "download failed: " + (e && e.message) }; }

    let binPath = dlPath;
    if (/\.(zip|tar\.gz|tgz)$/i.test(asset.name)) {
        const exDir = path.join(outDir, "x");
        try { fs.mkdirSync(exDir, { recursive: true }); } catch {}
        if (!_extract(dlPath, exDir)) return { ok: false, error: "couldn't extract " + asset.name + " (need unzip/tar on PATH)" };
        const found = _findBinary(exDir, id) || _findBinary(exDir, (svc.github.split("/")[1] || ""));
        if (!found) return { ok: false, error: "extracted but couldn't locate a binary in " + asset.name };
        binPath = found;
    }
    if (!WIN) { try { fs.chmodSync(binPath, 0o755); } catch {} }

    // record where we put it so bgServices' resolveBin can find it later
    try { fs.writeFileSync(path.join(outDir, ".swek-bin"), binPath); } catch {}
    return { ok: true, binPath, version: rel.tag_name || "latest", asset: asset.name, via: "github", toolsDir: outDir };
}

// Best-effort: where did we install <id> to, if we did?
function installedBin(id, toolsDir) {
    const dir = path.join(toolsDir || path.join(os.homedir(), ".swek", "tools"), id);
    try { const p = fs.readFileSync(path.join(dir, ".swek-bin"), "utf8").trim(); if (p && fs.existsSync(p)) return p; } catch {}
    return null;
}

module.exports = { installFromGithub, installedBin, _pickAsset /* exported for tests */ };
