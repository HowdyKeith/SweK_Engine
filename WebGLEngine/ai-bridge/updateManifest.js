// FILE: ai-bridge/updateManifest.js
// Update-checker: a manifest of the integrated tools/models + a checker that
// asks npm / GitHub for the latest version. Stateless — the engine decides what
// counts as "new" by remembering the last-seen latest per id (localStorage), so
// GitHub repos (no pinned baseline) don't spuriously flag on first run.
//
// Entry: { id, name, type:"npm"|"github", ref, current, url }
//   npm    → ref = package name;  latest from registry.npmjs.org/<pkg>/latest
//   github → ref = "owner/repo";  latest release tag, else newest commit sha+date

const fs = require("fs"), os = require("os"), path = require("path");

const MANIFEST = [
    // Vendored in the engine — we DO know the installed version, so these can
    // flag an update immediately on the first check.
    { id: "aholo-viewer",     name: "Aholo Viewer (splat renderer)",   type: "npm",    ref: "@manycore/aholo-viewer",       current: "1.3.0",   url: "https://github.com/manycoretech/aholo-viewer", vendorDir: "vendor/aholo-viewer", dist: "dist" },
    { id: "three",            name: "three.js (rigged-GLB viewer)",    type: "npm",    ref: "three",                        current: "0.184.0", url: "https://github.com/mrdoob/three.js" },
    // Locally-installed tools from the Install panel catalog — no pinned sha, so
    // the engine seeds a baseline on first check and flags on later changes.
    { id: "comfyui",          name: "ComfyUI",                         type: "github", ref: "comfyanonymous/ComfyUI",       current: null,      url: "https://github.com/comfyanonymous/ComfyUI" },
    { id: "comfyui-manager",  name: "ComfyUI-Manager",                 type: "github", ref: "ltdrdata/ComfyUI-Manager",     current: null,      url: "https://github.com/ltdrdata/ComfyUI-Manager" },
    { id: "comfyui-3d-pack",  name: "ComfyUI-3D-Pack",                 type: "github", ref: "MrForExample/ComfyUI-3D-Pack", current: null,      url: "https://github.com/MrForExample/ComfyUI-3D-Pack" },
    { id: "hunyuan3d-wrapper",name: "ComfyUI-Hunyuan3DWrapper",        type: "github", ref: "kijai/ComfyUI-Hunyuan3DWrapper",current: null,      url: "https://github.com/kijai/ComfyUI-Hunyuan3DWrapper" },
    { id: "triposplat",       name: "TripoSplat",                      type: "github", ref: "VAST-AI-Research/TripoSplat",  current: null,      url: "https://github.com/VAST-AI-Research/TripoSplat" },
];

const CACHE_MS = 6 * 60 * 60 * 1000;   // 6h memory cache (force=1 bypasses)
let _cache = null, _cacheAt = 0;

function fetchWithTimeout(url, opts = {}, ms = 6000) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), ms);
    return fetch(url, { ...opts, signal: ctrl.signal }).finally(() => clearTimeout(t));
}

async function checkOne(entry) {
    const ov = _installedOverride();
    const cur = ov[entry.id] || entry.current;   // a previously-applied update wins over the pinned baseline
    const base = { id: entry.id, name: entry.name, type: entry.type, url: entry.url, current: cur, canApply: entry.type === "npm" && !!entry.vendorDir };
    try {
        if (entry.type === "npm") {
            const r = await fetchWithTimeout(`https://registry.npmjs.org/${entry.ref}/latest`, { headers: { "Accept": "application/json" } });
            if (!r.ok) throw new Error("HTTP " + r.status);
            const j = await r.json();
            return { ...base, latest: j.version || null, latestDate: j.time || null };
        }
        // github: prefer a release tag, fall back to the newest commit
        const gh = { headers: { "User-Agent": "voxelengine-updatecheck", "Accept": "application/vnd.github+json" } };
        let r = await fetchWithTimeout(`https://api.github.com/repos/${entry.ref}/releases/latest`, gh);
        if (r.ok) {
            const j = await r.json();
            return { ...base, latest: j.tag_name || null, latestDate: j.published_at || null, kind: "release" };
        }
        // 404 = no releases published; use latest commit
        r = await fetchWithTimeout(`https://api.github.com/repos/${entry.ref}/commits?per_page=1`, gh);
        if (!r.ok) throw new Error("HTTP " + r.status);
        const arr = await r.json();
        const c = Array.isArray(arr) && arr[0];
        if (!c) throw new Error("no commits");
        return { ...base, latest: String(c.sha).slice(0, 7), latestDate: c.commit?.author?.date || null, kind: "commit" };
    } catch (e) {
        return { ...base, latest: null, error: String((e && e.message) || e) };
    }
}

async function checkUpdates(force = false) {
    const now = Date.now();
    if (!force && _cache && (now - _cacheAt) < CACHE_MS) {
        return { ok: true, cached: true, checkedAt: _cacheAt, items: _cache };
    }
    const items = await Promise.all(MANIFEST.map(checkOne));
    _cache = items; _cacheAt = now;
    return { ok: true, cached: false, checkedAt: now, items };
}

// v1500 — installed-version override: applied tool updates are recorded here so the checker stops
// flagging them (the MANIFEST `current` is a hardcoded baseline that can't know what we applied).
const _OVR = path.join(os.homedir(), ".voxelbridge", "tool-versions.json");
function _installedOverride() { try { return JSON.parse(fs.readFileSync(_OVR, "utf8")) || {}; } catch { return {}; } }
function _recordInstalled(id, ver) { let o = {}; try { o = JSON.parse(fs.readFileSync(_OVR, "utf8")) || {}; } catch {} o[id] = ver; try { fs.mkdirSync(path.dirname(_OVR), { recursive: true }); fs.writeFileSync(_OVR, JSON.stringify(o, null, 2)); } catch {} }

// v1500 — APPLY a vendored-npm tool update (e.g. Aholo Viewer): fetch the latest tarball, extract,
// and drop its dist/* into the engine's vendor folder, keeping the old folder as <dir>.bak for
// rollback. Only npm entries with a vendorDir are appliable; GitHub tools are external installs.
async function applyUpdate(id) {
    const e = MANIFEST.find(x => x.id === id);
    if (!e) return { ok: false, error: "unknown tool" };
    if (e.type !== "npm" || !e.vendorDir) return { ok: false, error: "this tool can't be auto-applied (external install — use the link)" };
    const https = require("https"), cp = require("child_process");
    let tmp = null;
    try {
        const meta = await fetchWithTimeout(`https://registry.npmjs.org/${e.ref}`, { headers: { Accept: "application/json" } }, 12000);
        if (!meta.ok) return { ok: false, error: "registry HTTP " + meta.status };
        const mj = await meta.json();
        const latest = mj["dist-tags"] && mj["dist-tags"].latest;
        const v = mj.versions && mj.versions[latest];
        const tarball = v && v.dist && v.dist.tarball;
        if (!tarball) return { ok: false, error: "no tarball for latest" };
        tmp = fs.mkdtempSync(path.join(os.tmpdir(), "swek-tool-"));
        const tgz = path.join(tmp, "pkg.tgz");
        await new Promise((res, rej) => { const f = fs.createWriteStream(tgz); https.get(tarball, (r) => { if (r.statusCode !== 200) { rej(new Error("download HTTP " + r.statusCode)); return; } r.pipe(f); f.on("finish", () => f.close(res)); }).on("error", rej); });
        cp.execFileSync("tar", ["-xzf", tgz, "-C", tmp], { timeout: 120000 });
        const distDir = path.join(tmp, "package", e.dist || "");
        if (!fs.existsSync(distDir)) return { ok: false, error: "dist folder not found in package" };
        const vendorPath = path.join(__dirname, "..", e.vendorDir);
        try { fs.rmSync(vendorPath + ".bak", { recursive: true, force: true }); if (fs.existsSync(vendorPath)) fs.cpSync(vendorPath, vendorPath + ".bak", { recursive: true }); } catch {}
        try { fs.mkdirSync(vendorPath, { recursive: true }); } catch {}
        let copied = 0;
        for (const f of fs.readdirSync(distDir)) { if (/\.(js|mjs|wasm|json)$/i.test(f)) { fs.copyFileSync(path.join(distDir, f), path.join(vendorPath, f)); copied++; } }
        _recordInstalled(id, latest);
        _cache = null;   // force a fresh check next time
        return { ok: true, id, name: e.name, from: e.current, to: latest, files: copied, vendor: e.vendorDir, rollback: e.vendorDir + ".bak" };
    } catch (err) {
        return { ok: false, error: String((err && err.message) || err) };
    } finally { if (tmp) { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {} } }
}

module.exports = { MANIFEST, checkUpdates, applyUpdate };
