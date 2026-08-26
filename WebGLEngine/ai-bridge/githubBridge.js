// ai-bridge/githubBridge.js - v1126
// Manage your OWN GitHub repos from the engine: list repos, check the latest
// release ("new version" alert vs the running engine), and publish a new version
// (create a release tag + upload an asset, e.g. the Gmail-safe zip). REST API; a
// personal access token (repo scope) unlocks private repos + publishing. Default
// owner = HowdyKeith, configurable per user. Token lives in ~/.voxelbridge/
// github.json (0600), outside the engine tree, so it never ships in a copy.

const fs = require("fs");
const os = require("os");
const path = require("path");

const CFG = process.env.GITHUB_CFG || path.join(os.homedir(), ".voxelbridge", "github.json");
const SEED_REPOS = [
    "HowdyKeith/swek-ragdoll-pencil",   // the box3d rig drawn by Krbn; CI byte-compares a fresh clone
    "HowdyKeith/wavefront-tomo",        // wavefront tomography, Pages demo live
    "HowdyKeith/swek-blobulator",       // marching-cubes metaballs, 9 checks tied to README claims
    "HowdyKeith/sph-no-tension",        // the SPH tensile fix
];
// v3907 -- engineRepo WAS "" WHILE owner WAS ALREADY "HowdyKeith", and that asymmetry made the whole GitHub
// update source a silent no-op: versionCheck() returned "no repo to check (set engineRepo)" and
// fetchEngineBuild() returned "no engineRepo set", so cfg.update.autoFetch could be ON and the poller would
// call githubPull() every interval forever without ever looking at anything. A DEFAULT THAT DISABLES THE
// FEATURE IS NOT A SAFE DEFAULT, IT IS AN INVISIBLE ONE. Setting it turns on no network traffic by itself:
// cfg.update.autoFetch and cfg.update.enabled both default to false, so this only makes the manual check
// and the opt-in poller able to reach the repo they were always meant to reach.
const DEFAULTS = { owner: "HowdyKeith", token: "", defaultRepo: "", engineRepo: "HowdyKeith/SweK_Engine", showAsPeer: true, monitorRepos: SEED_REPOS.slice() };

function loadCfg() { try { if (fs.existsSync(CFG)) return Object.assign({}, DEFAULTS, JSON.parse(fs.readFileSync(CFG, "utf8"))); } catch {} return { ...DEFAULTS }; }
function saveCfg(c) { try { fs.mkdirSync(path.dirname(CFG), { recursive: true }); fs.writeFileSync(CFG, JSON.stringify(c, null, 2), { mode: 0o600 }); } catch {} }
// *** v3941 -- IT SAVED "Swek Engine" AND EVERY UPDATE SILENTLY STOPPED. ***
//
// Keith's rig ran engineUpdateSource-selfcheck and it reported engineRepo = "Swek Engine". No GitHub repo can
// be called that -- names cannot contain a space -- so versionCheck() and fetchEngineBuild() both resolved to
// /repos/HowdyKeith/Swek%20Engine, got a 404, and returned ok:false. THE POLLER SWALLOWS THAT IN A try/catch,
// so the auto-update chain was dead and the panel showed nothing wrong. That gate's own note says it: the
// error path is unobservable from outside, which is why the emptiness can only be caught before it ships.
//
// THE UI INVITED IT. The Account field's placeholder read "engine repo (for version alert)", which asks for a
// NAME, and "Swek Engine" is a perfectly good answer to that question. The real repo is SweK_Engine. A free
// text box that accepts anything and fails closed three layers down is the shape v3940's own commit message
// named: "a feature that fails closed and silent is indistinguishable from a feature nobody turned on".
//
// REFUSED AT THE WRITE, which is the only place it is still cheap. A BARE NAME STAYS LEGAL -- _split falls
// back to the configured owner for it, deliberately, and rejecting it would break a working spelling. What is
// rejected is a value that CANNOT NAME A REPOSITORY: GitHub allows [A-Za-z0-9._-] per segment, and a space is
// impossible in any of them. The check mirrors _split's own normalisation so the URL form somebody pastes from
// the address bar still works.
const REPO_SEG = /^[A-Za-z0-9._-]+$/;
function repoShapeError(v) {
    const s0 = String(v == null ? "" : v).trim();
    if (!s0) return "";                                  // empty means NOT SET, which is a legitimate state
    const cleaned = s0.replace(/^https?:\/\/(www\.)?github\.com\//i, "").replace(/\.git$/i, "").replace(/^\/+|\/+$/g, "");
    const parts = cleaned.split("/").filter(Boolean);
    if (!parts.length) return "is empty once the github.com prefix is stripped";
    if (parts.length > 2) return "has " + parts.length + " path segments; a repo is owner/name or just name";
    const bad = parts.find((x) => !REPO_SEG.test(x));
    if (bad) return "the segment \"" + bad + "\" is not a possible GitHub name -- only letters, digits, dot, dash and underscore" +
                    (/\s/.test(bad) ? " (that one contains a space, so it is probably a display name rather than the repo)" : "");
    return "";
}
function setConfig(d) {
    d = d || {};
    const c = loadCfg();
    for (const k of ["defaultRepo", "engineRepo"]) {
        if (d[k] == null) continue;
        const why = repoShapeError(d[k]);
        if (why) return Object.assign(status(), { ok: false, error: k + " " + why + ". Got: \"" + String(d[k]).trim() + "\"" });
    }
    if (d.owner != null && String(d.owner).trim() && !REPO_SEG.test(String(d.owner).trim()))
        return Object.assign(status(), { ok: false, error: "owner \"" + String(d.owner).trim() + "\" is not a possible GitHub username" });
    for (const k of ["owner", "token", "defaultRepo", "engineRepo"]) if (d[k] != null) c[k] = String(d[k]).trim();
    saveCfg(c);
    return status();
}
function effTok() { const c = loadCfg(); return c.token || process.env.GITHUB_TOKEN || ""; }  // v1130 — env token comes from the Windows vault loader
function status() { const c = loadCfg(); return { ok: true, owner: c.owner || "", defaultRepo: c.defaultRepo || "", engineRepo: c.engineRepo || "", hasToken: !!effTok(), tokenTail: effTok() ? effTok().slice(-4) : "", engineVersion: engineVersion() }; }

function _hdrs(extra) { const h = { "Accept": "application/vnd.github+json", "User-Agent": "SweK-Engine", "X-GitHub-Api-Version": "2022-11-28" }; const tk = effTok(); if (tk) h["Authorization"] = "Bearer " + tk; return Object.assign(h, extra || {}); }
function _to(url, opts, ms = 12000) { const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), ms); return fetch(url, { ...opts, signal: ctrl.signal }).finally(() => clearTimeout(t)); }
// *** v3941 -- "Validation Failed" WAS THE WHOLE MESSAGE, EVERY TIME. *** Keith pressed "Release current engine"
// and got exactly that, with no way to tell what it meant: a release already existing for the tag, a bad
// target_commitish, an org rule blocking the tag pattern, and a dozen other 422 causes all produce the SAME
// top-level j.message from GitHub -- "Validation Failed" is the category, not the reason. The reason lives in
// j.errors[], an array of {resource, field, code} (sometimes with its own `message`), and this line kept only
// the category and threw the reason away. Every caller of _api shares this formatter, not just releases --
// createRepo, putFile, issue/create all hit the same 422 shape and were all equally silent about why.
//
// PULLED OUT AS A PURE FUNCTION rather than left inline, because a fetch wrapper cannot be driven by a fixture
// and this tree's own rule is that a function nothing can call from a gate is a function nothing has checked.
function _errorDetail(j) {
    if (!Array.isArray(j && j.errors) || !j.errors.length) return "";
    return j.errors.map((e) => (e && (e.message || [e.resource, e.field, e.code].filter(Boolean).join(" "))) || "")
        .filter(Boolean).join("; ");
}
function _apiErrorText(status, j) {
    const msg = (j && j.message) || ("HTTP " + status);
    const detail = _errorDetail(j);
    return detail ? msg + ": " + detail : msg;
}
async function _api(method, p, body) {
    try {
        const r = await _to("https://api.github.com" + p, { method, headers: _hdrs(body ? { "Content-Type": "application/json" } : null), body: body ? JSON.stringify(body) : undefined });
        const txt = await r.text(); let j = {}; try { j = txt ? JSON.parse(txt) : {}; } catch { j = { raw: txt }; }
        if (!r.ok) return { ok: false, status: r.status, error: _apiErrorText(r.status, j) };
        return { ok: true, status: r.status, data: j };
    } catch (e) { return { ok: false, error: String(e && e.message || e) }; }
}

// v2527 -- IS THERE A PAGE TO CLICK? Keith asked the panel to show a Pages link next to each repo, and the useful
// question is not "is Pages configured" but "is there a page there RIGHT NOW".
//
// WHY NOT THE API. GET /repos/{o}/{r}/pages needs a token even for public repos, and it reports what is CONFIGURED
// -- it will happily say "enabled" while the site 404s because a build failed or was never run. A link that
// confidently points at a 404 is worse than no link.
//
// So we ask the site. A HEAD costs nothing, needs no auth, and answers the question the user is actually asking.
//
// THE URL RULE: https://<owner-lowercased>.github.io/<repo>/. Owner is lowercased by GitHub; the repo name is NOT.
// Getting that backwards gives a 404 on every repo whose owner has a capital in it -- which is this one.
function pagesUrl(full) {
    const [owner, repo] = String(full).split("/");
    if (!owner || !repo) return null;
    return "https://" + owner.toLowerCase() + ".github.io/" + repo + "/";
}

// ================================================================================================================
// *** v3937 -- "owner/repo" WENT INTO A SLOT THAT ONLY EVER HELD "repo", AND EVERY GITHUB ACTION 404'd. ***
// ================================================================================================================
//
// Keith pressed "Release current engine" and got a bare "Not Found". The credentials were fine. TWENTY-TWO CALL
// SITES built their URL as `_repoPath(repo)`, which is correct ONLY when `repo` is a bare name --
// and the panel's own input placeholder says "owner/repo or repo", the repo list renders "HowdyKeith/SweK_Engine",
// and engineRepo is set from that same list. So the release path built:
//
//     /repos/HowdyKeith/HowdyKeith%2FSweK_Engine/releases     ->  404 Not Found
//
// createRelease ran the value through encodeURIComponent, which turns the separator into %2F -- so the slash could
// not even accidentally resolve, and GitHub's 404 (which it also returns for "no permission", to avoid leaking
// whether a repo exists) reads exactly like a credentials problem. THE ERROR NAMED THE WRONG SUSPECT.
//
// *** THE UI OFFERED A FORM THE BACKEND COULD NOT PARSE, WHICH IS THE SAME SHAPE v3908 ALREADY FIXED ONE LAYER UP:
// there the guard "refused the very path its own message recommended". Here the placeholder documents a syntax
// nothing implements. AN INPUT'S PLACEHOLDER IS A CLAIM TOO. ***
//
// This file already knew about the two-part form in exactly one place -- pagesUrl(), whose own comment is about a
// 404 -- so the knowledge was present and unshared. One resolver now, used by every call site.
/** "owner/repo", a github URL, or a bare "repo" -> {owner, repo}. Falls back to the configured owner. */
function _split(repo) {
    const s = String(repo == null ? "" : repo).trim()
        .replace(/^https?:\/\/(www\.)?github\.com\//i, "")
        .replace(/\.git$/i, "")
        .replace(/^\/+|\/+$/g, "");
    const parts = s.split("/").filter(Boolean);
    if (parts.length >= 2) return { owner: parts[0], repo: parts[1] };
    let owner = ""; try { owner = (loadCfg().owner || "").trim(); } catch {}
    return { owner, repo: parts[0] || "" };
}
/** The "/repos/<owner>/<repo>" prefix for either form. Each segment encoded ON ITS OWN so the separator survives. */
function _repoPath(repo) { const x = _split(repo); return "/repos/" + encodeURIComponent(x.owner) + "/" + encodeURIComponent(x.repo); }

const _pagesCache = new Map();   // full -> { live, url, at }
const PAGES_TTL = 10 * 60 * 1000;

async function checkPages(full, force) {
    const url = pagesUrl(full);
    if (!url) return { live: false, url: null };
    const hit = _pagesCache.get(full);
    if (!force && hit && Date.now() - hit.at < PAGES_TTL) return { live: hit.live, url: hit.url, cached: true };
    let live = false;
    try {
        // HEAD, follow redirects (a Pages site with a custom domain redirects), 8s cap. A repo without Pages
        // returns 404 from github.io itself, which is exactly the signal we want.
        const r = await _to(url, { method: "HEAD", redirect: "follow" }, 8000);
        live = r.ok;
    } catch { live = false; }
    _pagesCache.set(full, { live, url, at: Date.now() });
    return { live, url };
}

// Check a list of repos at once. Bounded concurrency: firing thirty HEADs at github.io in one tick is how you get
// rate-limited by the thing you are trying to be polite to.
async function pagesFor(fulls, force) {
    const out = {};
    const q = [...fulls];
    const worker = async () => {
        while (q.length) {
            const f = q.shift();
            out[f] = await checkPages(f, force);
        }
    };
    await Promise.all([worker(), worker(), worker(), worker()]);
    return out;
}

async function listRepos() {
    const c = loadCfg(); const tk = effTok(); if (!c.owner && !tk) return { ok: false, error: "set your GitHub username first" };
    const p = tk ? "/user/repos?per_page=100&sort=updated&affiliation=owner" : ("/users/" + encodeURIComponent(c.owner) + "/repos?per_page=100&sort=updated");
    const r = await _api("GET", p);
    if (!r.ok) return r;
    const repos = (r.data || []).map(x => ({ name: x.name, full: x.full_name, private: !!x.private, pushedAt: x.pushed_at, url: x.html_url, desc: x.description || "", stars: x.stargazers_count || 0, defaultBranch: x.default_branch }));
    return { ok: true, owner: c.owner, count: repos.length, repos };
}

// v1212 — render a repo the way GitHub shows it: metadata card + README rendered
// through GitHub's own markdown endpoint (GFM, sanitized server-side by GitHub).
async function repoPreview(repo) {
    const c = loadCfg(); const owner = c.owner; repo = repo || c.defaultRepo || c.engineRepo;
    if (!owner || !repo) return { ok: false, error: "set your GitHub username and a repo first" };
    const meta = await _api("GET", "/repos/" + encodeURIComponent(owner) + "/" + encodeURIComponent(repo));
    if (!meta.ok) return meta;
    const m = meta.data || {};
    let readmeText = "", readmeHtml = "", readmeMissing = false;
    const rd = await _api("GET", "/repos/" + encodeURIComponent(owner) + "/" + encodeURIComponent(repo) + "/readme");
    if (rd.ok && rd.data && rd.data.content) {
        try { readmeText = Buffer.from(rd.data.content, (rd.data.encoding === "base64") ? "base64" : "utf8").toString("utf8"); } catch (e) { readmeText = ""; }
    } else if (rd.status === 404) { readmeMissing = true; }
    if (readmeText) {
        try {
            const r = await _to("https://api.github.com/markdown", { method: "POST", headers: _hdrs({ "Content-Type": "application/json" }), body: JSON.stringify({ text: readmeText, mode: "gfm", context: owner + "/" + repo }) });
            if (r.ok) readmeHtml = await r.text();
        } catch (e) {}
    }
    return {
        ok: true,
        repo: {
            name: m.full_name || (owner + "/" + repo), shortName: m.name || repo, owner: owner,
            desc: m.description || "", url: m.html_url || ("https://github.com/" + owner + "/" + repo),
            stars: m.stargazers_count || 0, forks: m.forks_count || 0,
            watchers: m.subscribers_count || m.watchers_count || 0, openIssues: m.open_issues_count || 0,
            language: m.language || "", topics: m.topics || [], homepage: m.homepage || "",
            isPrivate: !!m.private, license: (m.license && (m.license.spdx_id || m.license.name)) || "",
            defaultBranch: m.default_branch || "main", updatedAt: m.pushed_at || m.updated_at || "",
        },
        readmeHtml, readmeMissing, hasReadme: !!readmeText,
    };
}

async function latestRelease(repo) {
    const c = loadCfg(); const owner = c.owner; if (!owner || !repo) return { ok: false, error: "owner/repo required" };
    const r = await _api("GET", _repoPath(repo) + "/releases/latest");
    if (r.ok) return { ok: true, repo, tag: r.data.tag_name, name: r.data.name, publishedAt: r.data.published_at, url: r.data.html_url, assets: (r.data.assets || []).map(a => ({ name: a.name, size: a.size, downloads: a.download_count, id: a.id, apiUrl: a.url, downloadUrl: a.browser_download_url })) };
    if (r.status === 404) return { ok: true, repo, tag: null, none: true };
    return r;
}

// "new version" alert: running engine version vs a repo's latest release tag.
async function versionCheck(repo) {
    const c = loadCfg(); repo = repo || c.engineRepo || c.defaultRepo;
    if (!repo) return { ok: false, error: "no repo to check (set engineRepo)" };
    const cur = engineVersion();
    const lr = await latestRelease(repo);
    if (!lr.ok) return lr;
    return { ok: true, repo, current: cur, latest: lr.tag, none: !!lr.none, behind: !!(lr.tag && cur && _verLt(cur, lr.tag)), ahead: !!(lr.tag && cur && _verLt(lr.tag, cur)), url: lr.url };
}

// v2149 -- Deno runtime version check. The GPU Brain runs on Deno, and this reports
// current-vs-latest alongside the engine's own GitHub version check. It deliberately
// does NOT auto-upgrade: the brain uses --unstable-webgpu and START_BRAIN.bat pins
// WGPU_BACKEND=vulkan to dodge a real Deno-on-Windows wgpu panic (denoland/deno
// #26144). Silently bumping the runtime under a headless-WebGPU workload is how you
// get a boot failure with no code change. Report; let the human run `deno upgrade`.
function _denoCurrent() {
    return new Promise((res) => {
        try {
            require("child_process").execFile("deno", ["--version"], { timeout: 5000 }, (err, stdout) => {
                if (err || !stdout) return res(null);
                const m = String(stdout).split(/\r?\n/)[0].match(/(\d+\.\d+\.\d+)/);
                res(m ? m[1] : null);
            });
        } catch { res(null); }
    });
}

async function denoVersionCheck() {
    const current = await _denoCurrent();
    if (!current) return { ok: true, tool: "deno", installed: false, note: "deno is not on PATH -- the GPU Brain needs it (winget install DenoLand.Deno)" };
    const r = await _api("GET", "/repos/denoland/deno/releases/latest");
    if (!r.ok) {
        const note = r.status === 403 ? "GitHub API rate limit -- set a token in the GitHub panel to raise it" : "couldn't reach the GitHub releases API";
        return { ok: true, tool: "deno", installed: true, current, latest: null, note };
    }
    const latest = String((r.data && r.data.tag_name) || "").replace(/^v/, "");
    return {
        ok: true, tool: "deno", installed: true, current, latest,
        behind: !!(latest && _verLt(current, latest)),
        url: (r.data && r.data.html_url) || "",
        upgradeCmd: "deno upgrade",
        autoUpgrade: false,
        warn: "upgrade deliberately: the brain runs --unstable-webgpu and pins WGPU_BACKEND=vulkan; re-run the kaiju demo after upgrading",
    };
}

async function createRelease({ repo, tag, name, body, draft, prerelease, target } = {}) {
    const c = loadCfg(); const owner = c.owner;
    if (!effTok()) return { ok: false, error: "a personal access token (repo scope) is required to publish" };
    if (!owner || !repo || !tag) return { ok: false, error: "owner, repo, and tag (version) are required" };
    const r = await _api("POST", _repoPath(repo) + "/releases", { tag_name: tag, name: name || tag, body: body || "", draft: !!draft, prerelease: !!prerelease, target_commitish: target || undefined });
    if (!r.ok) return r;
    return { ok: true, id: r.data.id, tag: r.data.tag_name, url: r.data.html_url, uploadUrl: r.data.upload_url };
}

async function uploadAsset({ repo, releaseId, filePath, uploadUrl } = {}) {
    const c = loadCfg(); const owner = c.owner;
    if (!effTok()) return { ok: false, error: "token required to upload" };
    if (!filePath || !fs.existsSync(filePath)) return { ok: false, error: "asset file not found: " + filePath };
    let base = uploadUrl ? uploadUrl.replace(/\{.*\}$/, "") : null;
    if (!base) { if (!releaseId) return { ok: false, error: "releaseId or uploadUrl required" }; base = "https://uploads.github.com" + _repoPath(repo) + "/releases/" + releaseId + "/assets"; }
    const fname = path.basename(filePath);
    const data = fs.readFileSync(filePath);
    try {
        const r = await _to(base + "?name=" + encodeURIComponent(fname), { method: "POST", headers: _hdrs({ "Content-Type": "application/octet-stream", "Content-Length": String(data.length) }), body: data }, 180000);
        const txt = await r.text(); let j = {}; try { j = JSON.parse(txt); } catch {}
        if (!r.ok) return { ok: false, status: r.status, error: (j && j.message) || ("upload HTTP " + r.status) };
        return { ok: true, name: j.name, size: j.size, url: j.browser_download_url };
    } catch (e) { return { ok: false, error: String(e && e.message || e) }; }
}

// one-shot: "set a version for our repo and upload a new version from our panel"
async function publishVersion({ repo, tag, name, body, assetPath, draft, prerelease } = {}) {
    const cr = await createRelease({ repo, tag, name, body, draft, prerelease });
    if (!cr.ok) return cr;
    let asset = null;
    if (assetPath) asset = await uploadAsset({ repo, releaseId: cr.id, uploadUrl: cr.uploadUrl, filePath: assetPath });
    return { ok: true, release: cr, asset };
}

// v1129 — one click: auto-tag from the running engine version, build the Gmail-safe
// engine zip, and publish it as a release asset. The whole "cut a new version" flow.
async function publishEngineBuild({ repo, notes, draft, prerelease } = {}) {
    const c = loadCfg();
    repo = repo || c.engineRepo || c.defaultRepo;
    if (!effTok()) return { ok: false, error: "a personal access token (repo scope) is required" };
    if (!repo) return { ok: false, error: "no repo (set engineRepo, or pass repo)" };
    const tag = engineVersion();
    if (!tag) return { ok: false, error: "couldn't read the engine version" };
    let assetPath = "";
    // v3907 -- WAS makeGmailSafe, WHICH RENAMES EVERY .js AND .mjs IN THE TREE AND NAMES THE ZIP
    // EngineProject_GmailSafe_vNNNN.zip. That asset is unrunnable AND invisible to the Downloads scanner that
    // feeds the installer. The release asset must be the INSTALLABLE build, whose root and filename are the
    // <prefix>_vNNNN that fetchEngineBuild's picker and scanDownloads() both expect.
    try { const packager = require("./packagerBridge.js"); const z = await packager.makeInstallable({}); if (!z.ok) return { ok: false, error: "build zip failed: " + z.error }; assetPath = z.path; }
    catch (e) { return { ok: false, error: "packager error: " + String(e && e.message || e) }; }
    const pub = await publishVersion({ repo, tag, name: tag, body: notes || ("Engine build " + tag), assetPath, draft, prerelease });
    return Object.assign({ tag, assetPath }, pub);
}

// *** v3941 -- ONE SPELLING OF THE VERSION MARKER. *** engineVersion() reads THIS tree's main.js; the source
// clone below has to read a DIFFERENT tree's. Two copies of the regex is how a marker quietly stops being found
// in one of the two places, so the parse is a pure function both call and a gate can drive.
function _parseEngineVersion(src) {
    const x = String(src || "").match(/ENGINE_VERSION\s*=\s*"(v\d+)"/);
    return x ? x[1] : "";
}
function _versionInTree(root) {
    try { return _parseEngineVersion(fs.readFileSync(path.join(root, "WebGLEngine", "main.js"), "utf8")); } catch {}
    return "";
}
function engineVersion() { try { return _parseEngineVersion(fs.readFileSync(path.join(__dirname, "..", "main.js"), "utf8")); } catch {} return ""; }

// =====================================================================================
// v3941 -- PULL THE SOURCE, BECAUSE THERE WAS NO WAY IN.
//
// Keith pressed "Release current engine" on a v3940 tree and got "Validation Failed": v3940 was already
// released. The fix was to run the newer code -- and THERE WAS NO ROUTE TO IT. The whole update chain is
// release-shaped: fetchEngineBuild downloads a release ASSET, scanDownloads finds it, the installer applies it.
// But publishEngineBuild builds that asset FROM THE LOCAL TREE, so a version can only be released from a box
// that already has it. *** CODE PUSHED TO GITHUB COULD NEVER REACH THE ENGINE, BECAUSE THE ONLY DOOR WAS A
// RELEASE AND A RELEASE NEEDED THE CODE FIRST. *** The panel had eleven buttons and not one of them could
// close that loop; the answer was three commands in a terminal, which is the shape of a missing feature.
//
// SIDE BY SIDE, NEVER OVER THE TOP. It clones into a NEW <prefix>_vNNNN folder beside the running one, the
// same layout the installer already produces, and REFUSES if that folder exists. The running engine is never
// touched -- which matters more here than usual, because a tree that has been edited in place holds work that
// is nowhere else, and this session already found several such differences on Keith's box.
//
// The folder name comes from the CLONED tree's own ENGINE_VERSION, not from a guess: clone to a temp sibling,
// read the marker, then rename. A clone that dies half-way leaves a .tmp-named folder rather than something
// that looks like a real build.
function _run(cmd, args, opts) {
    return new Promise((res) => {
        let done = false;
        const child = require("child_process").execFile(cmd, args, Object.assign({ windowsHide: true, timeout: 600000, maxBuffer: 8 * 1024 * 1024 }, opts || {}),
            (err, stdout, stderr) => { if (done) return; done = true; res({ ok: !err, out: String(stdout || ""), err: String(stderr || "") + (err ? " " + ((err && err.message) || err) : "") }); });
        child.on("error", (e) => { if (done) return; done = true; res({ ok: false, out: "", err: String((e && e.message) || e) }); });
    });
}

async function cloneEngineSource({ repo, ref, targetDir, prefix } = {}) {
    const c = loadCfg();
    repo = (repo || c.engineRepo || c.defaultRepo || "").trim();
    if (!repo) return { ok: false, error: "no repo (set engineRepo in Account, or pass repo)" };
    if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) return { ok: false, error: "repo must look like owner/name, got: " + repo };
    if (ref && !/^[\w./-]+$/.test(ref)) return { ok: false, error: "bad ref: " + ref };

    const probe = await _run("git", ["--version"]);
    if (!probe.ok) return { ok: false, error: "git is not on PATH. Install it (winget install Git.Git) and try again." };

    let sysadmin = null;
    try { sysadmin = require("./sysadminBridge.js"); } catch {}
    const parent = (targetDir || "").trim() ||
        (sysadmin && typeof sysadmin.engineParentDir === "function" ? sysadmin.engineParentDir() : path.resolve(__dirname, "..", "..", ".."));
    const pfx = (prefix || "").trim() ||
        (sysadmin && typeof sysadmin.preferredPrefix === "function" ? sysadmin.preferredPrefix() : "SweK_Engine");

    try { fs.mkdirSync(parent, { recursive: true }); } catch (e) { return { ok: false, error: "cannot create " + parent + ": " + ((e && e.message) || e) }; }

    const tmp = path.join(parent, "." + pfx + "_clone.tmp");
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {}

    // The token rides in the ENVIRONMENT, not in argv and not in the URL: a token in the remote URL is written
    // into .git/config and survives on disk, and a token in argv is visible to anything that can list processes.
    // credential.helper is disabled for this one invocation too: GIT_TERMINAL_PROMPT only suppresses git's own
    // in-terminal prompts, but Windows Git ships Git Credential Manager as the default credential.helper, and GCM
    // has its own GUI/browser/device-code sign-in flow that fires independently of http.extraHeader already
    // carrying a valid Authorization header. Clearing the helper here means the header is the only credential
    // path git has, so GCM's popup never gets a chance to run.
    const tk = effTok();
    // *** v3958 -- credential.helper IS CLEARED WHETHER OR NOT THERE IS A TOKEN, AND THAT WAS THE BUG. ***
    // It used to sit inside `if (tk)`, so a box with no token got GCM back. Both entries are unconditional now;
    // the header is the only one that depends on having something to put in it.
    const baseEnv = () => {
        const e = Object.assign({}, process.env);
        e.GIT_CONFIG_COUNT = "1";
        e.GIT_CONFIG_KEY_0 = "credential.helper";
        e.GIT_CONFIG_VALUE_0 = "";
        e.GIT_TERMINAL_PROMPT = "0";   // never hang waiting for credentials nobody is there to type
        return e;
    };
    const authedEnv = () => {
        const e = baseEnv();
        e.GIT_CONFIG_COUNT = "2";
        e.GIT_CONFIG_KEY_1 = "http.extraHeader";
        e.GIT_CONFIG_VALUE_1 = "Authorization: Bearer " + tk;
        return e;
    };

    const args = ["clone", "--depth", "1"];
    if (ref) args.push("--branch", ref);
    args.push("https://github.com/" + repo + ".git", tmp);

    // *** A PUBLIC REPO MUST NOT FAIL TO CLONE BECAUSE OF A BAD TOKEN. ***
    //
    // Keith's v3943 run: "fatal: could not read Username for 'https://github.com': terminal prompts disabled".
    // That is what a REJECTED credential looks like once GCM is out of the way -- GitHub answers 401 to the
    // Authorization header, git falls back to asking for a username, and GIT_TERMINAL_PROMPT stops it. The
    // popup was hiding this: GCM was supplying working credentials over the top of a token that does not work.
    //
    // SweK_Engine is PUBLIC (measured: an anonymous fetch of its info/refs answers 200), so the token is an
    // OPTIMISATION here -- private repos and rate limits -- and never a requirement. Failing the whole clone on
    // an expired PAT is refusing to do something that needs no permission at all. So an auth failure retries
    // WITHOUT the header, and the reply says which path worked, because "it cloned" and "your token is dead"
    // are both things you want to know and only one of them is obvious afterwards.
    const AUTH_FAIL = /could not read Username|Authentication failed|invalid username or password|401|403/i;
    let cl = tk ? await _run("git", args, { env: authedEnv() }) : await _run("git", args, { env: baseEnv() });
    let usedAnon = !tk, tokenRejected = false;
    if (!cl.ok && tk && AUTH_FAIL.test(cl.err || "")) {
        tokenRejected = true;
        try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {}   // a failed clone leaves a partial dir
        cl = await _run("git", args, { env: baseEnv() });
        usedAnon = true;
    }
    if (!cl.ok) {
        try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {}
        const tail = (cl.err || "").trim().split("\n").slice(-2).join(" ").slice(0, 300);
        return { ok: false, tokenRejected,
                 error: "clone failed: " + tail + (tokenRejected
                     ? "  -- the saved GitHub token was REJECTED and the anonymous retry failed too, so this repo is " +
                       "either private or misspelled. Fix the token in the Account tab, or check the repo name."
                     : "") };
    }

    const ver = _versionInTree(tmp);
    if (!ver) {
        try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {}
        return { ok: false, error: "cloned, but no ENGINE_VERSION in WebGLEngine/main.js -- is " + repo + " the engine repo?" };
    }

    const dest = path.join(parent, pfx + "_" + ver);
    if (fs.existsSync(dest)) {
        try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {}
        return { ok: false, exists: true, version: ver, path: dest,
                 error: pfx + "_" + ver + " already exists. Nothing was changed -- delete or rename it first if you want a fresh copy." };
    }
    try { fs.renameSync(tmp, dest); }
    catch (e) {
        try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {}
        return { ok: false, error: "could not name the clone " + dest + ": " + ((e && e.message) || e) };
    }
    return { ok: true, version: ver, path: dest, repo, ref: ref || "(default branch)", running: engineVersion(),
             auth: usedAnon ? "anonymous" : "token", tokenRejected,
             note: tokenRejected ? "cloned ANONYMOUSLY -- the saved GitHub token was rejected by GitHub (expired or wrong scope). The clone is fine; fix the token in the Account tab before anything needing private access or a release." : undefined };
}
function _num(v) { const m = String(v).match(/\d+/g); return m ? m.map(Number) : [0]; }
function _verLt(a, b) { const x = _num(a), y = _num(b); for (let i = 0; i < Math.max(x.length, y.length); i++) { const d = (x[i] || 0) - (y[i] || 0); if (d < 0) return true; if (d > 0) return false; } return false; }

// --- broad repo management (v1128) ---
async function whoami() { const r = await _api("GET", "/user"); if (!r.ok) return r; return { ok: true, login: r.data.login, name: r.data.name, publicRepos: r.data.public_repos, privateRepos: r.data.total_private_repos, url: r.data.html_url }; }
async function rateLimit() { const r = await _api("GET", "/rate_limit"); if (!r.ok) return r; const c = (r.data.resources && r.data.resources.core) || {}; return { ok: true, limit: c.limit, remaining: c.remaining, reset: c.reset }; }
async function createRepo({ name, description, priv, autoInit } = {}) { if (!effTok()) return { ok: false, error: "token required" }; if (!name) return { ok: false, error: "repo name required" }; const r = await _api("POST", "/user/repos", { name, description: description || "", private: !!priv, auto_init: autoInit !== false }); if (!r.ok) return r; return { ok: true, name: r.data.name, url: r.data.html_url }; }
async function updateRepo({ repo, description, homepage, priv, topics } = {}) { const c = loadCfg(); if (!effTok()) return { ok: false, error: "token required" }; if (!repo) return { ok: false, error: "repo required" }; const body = {}; if (description != null) body.description = description; if (homepage != null) body.homepage = homepage; if (priv != null) body.private = !!priv; const r = await _api("PATCH", _repoPath(repo), body); if (!r.ok) return r; let tr = null; if (Array.isArray(topics)) tr = await _api("PUT", _repoPath(repo) + "/topics", { names: topics.map(s => String(s).toLowerCase().trim()).filter(Boolean) }); return { ok: true, url: r.data.html_url, topics: tr && tr.ok ? tr.data.names : undefined }; }
async function deleteRepo({ repo, confirm } = {}) { const c = loadCfg(); if (!effTok()) return { ok: false, error: "token required" }; if (!repo) return { ok: false, error: "repo required" }; if (confirm !== repo) return { ok: false, error: "type the repo name to confirm deletion" }; const r = await _api("DELETE", _repoPath(repo)); if (!r.ok) return r; return { ok: true, deleted: repo }; }
async function listReleases({ repo } = {}) { const c = loadCfg(); if (!repo) return { ok: false, error: "repo required" }; const r = await _api("GET", _repoPath(repo) + "/releases?per_page=30"); if (!r.ok) return r; return { ok: true, releases: (r.data || []).map(x => ({ id: x.id, tag: x.tag_name, name: x.name, draft: x.draft, prerelease: x.prerelease, publishedAt: x.published_at, url: x.html_url, assets: (x.assets || []).length })) }; }
async function deleteRelease({ repo, id } = {}) { const c = loadCfg(); if (!effTok()) return { ok: false, error: "token required" }; if (!repo || !id) return { ok: false, error: "repo and id required" }; const r = await _api("DELETE", _repoPath(repo) + "/releases/" + id); if (!r.ok) return r; return { ok: true, deleted: id }; }
async function listIssues({ repo, state } = {}) { const c = loadCfg(); if (!repo) return { ok: false, error: "repo required" }; const r = await _api("GET", _repoPath(repo) + "/issues?state=" + (state || "open") + "&per_page=30"); if (!r.ok) return r; return { ok: true, issues: (r.data || []).filter(x => !x.pull_request).map(x => ({ number: x.number, title: x.title, state: x.state, url: x.html_url, comments: x.comments })) }; }
async function createIssue({ repo, title, body } = {}) { const c = loadCfg(); if (!effTok()) return { ok: false, error: "token required" }; if (!repo || !title) return { ok: false, error: "repo and title required" }; const r = await _api("POST", _repoPath(repo) + "/issues", { title, body: body || "" }); if (!r.ok) return r; return { ok: true, number: r.data.number, url: r.data.html_url }; }
async function closeIssue({ repo, number } = {}) { const c = loadCfg(); if (!effTok()) return { ok: false, error: "token required" }; if (!repo || !number) return { ok: false, error: "repo and number required" }; const r = await _api("PATCH", _repoPath(repo) + "/issues/" + number, { state: "closed" }); if (!r.ok) return r; return { ok: true, closed: number }; }
async function listCommits({ repo, branch } = {}) { const c = loadCfg(); if (!repo) return { ok: false, error: "repo required" }; const r = await _api("GET", _repoPath(repo) + "/commits?per_page=15" + (branch ? "&sha=" + encodeURIComponent(branch) : "")); if (!r.ok) return r; return { ok: true, commits: (r.data || []).map(x => ({ sha: x.sha.slice(0, 7), msg: ((x.commit && x.commit.message) || "").split("\n")[0].slice(0, 64), author: x.commit && x.commit.author && x.commit.author.name, date: x.commit && x.commit.author && x.commit.author.date })) }; }
async function listBranches({ repo } = {}) { const c = loadCfg(); if (!repo) return { ok: false, error: "repo required" }; const r = await _api("GET", _repoPath(repo) + "/branches?per_page=50"); if (!r.ok) return r; return { ok: true, branches: (r.data || []).map(x => ({ name: x.name, protected: x.protected })) }; }
async function getFile({ repo, path: fp, ref } = {}) { const c = loadCfg(); if (!repo || !fp) return { ok: false, error: "repo and path required" }; const r = await _api("GET", _repoPath(repo) + "/contents/" + fp.split("/").map(encodeURIComponent).join("/") + (ref ? "?ref=" + encodeURIComponent(ref) : "")); if (!r.ok) return r; let content = ""; try { content = Buffer.from(r.data.content || "", "base64").toString("utf8"); } catch {} return { ok: true, path: fp, sha: r.data.sha, size: r.data.size, content }; }
async function putFile({ repo, path: fp, content, message, sha, branch } = {}) { const c = loadCfg(); if (!effTok()) return { ok: false, error: "token required" }; if (!repo || !fp) return { ok: false, error: "repo and path required" }; const body = { message: message || ("update " + fp), content: Buffer.from(content || "", "utf8").toString("base64") }; if (sha) body.sha = sha; if (branch) body.branch = branch; const r = await _api("PUT", _repoPath(repo) + "/contents/" + fp.split("/").map(encodeURIComponent).join("/"), body); if (!r.ok) return r; return { ok: true, path: fp, commit: r.data.commit && r.data.commit.sha, url: r.data.content && r.data.content.html_url }; }

// v1502 — DOWNLOAD half of the GitHub flow (the "installer"). Follows redirects (release
// assets 302 to a signed CDN URL) and drops the auth header on the cross-host hop so the
// signed URL isn't rejected. Works for private repos too (asset API url + octet-stream).
function _downloadTo(url, headers, dest, depth) {
    depth = depth || 0;
    return new Promise((resolve, reject) => {
        if (depth > 6) return reject(new Error("too many redirects"));
        const https = require("https"), http = require("http");
        const mod = url.startsWith("http://") ? http : https;
        const req = mod.get(url, { headers: headers || {} }, (res) => {
            if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
                res.resume();
                const next = new URL(res.headers.location, url).toString();
                const h2 = Object.assign({}, headers);
                try { if (new URL(next).host !== new URL(url).host) delete h2.Authorization; } catch {}
                return _downloadTo(next, h2, dest, depth + 1).then(resolve, reject);
            }
            if (res.statusCode !== 200) { res.resume(); return reject(new Error("HTTP " + res.statusCode)); }
            const f = fs.createWriteStream(dest);
            res.pipe(f);
            f.on("finish", () => f.close(() => resolve({ ok: true, dest, size: fs.statSync(dest).size })));
            f.on("error", reject);
        });
        req.on("error", reject);
    });
}

// Pull the newest release's EngineProject_vNNN.zip into a folder (Downloads), but only if it's
// newer than the running engine (unless force). The existing self-update scan/apply takes it from there.
async function fetchEngineBuild({ repo, toDir, force } = {}) {
    const c = loadCfg(); repo = repo || c.engineRepo || c.defaultRepo;
    if (!repo) return { ok: false, error: "no engineRepo set (GitHub settings \u2192 engineRepo)" };
    const lr = await latestRelease(repo);
    if (!lr.ok) return lr;
    if (lr.none) return { ok: true, none: true, repo, note: "no releases published on " + repo + " yet" };
    // v2871 -- accept the CURRENT name as well as the legacy one; the release picker went blind at the rename.
    const asset = (lr.assets || []).find(a => /^(?:SweK_Engine|EngineProject)_v\d+\.zip$/i.test(a.name)) || (lr.assets || []).find(a => /\.zip$/i.test(a.name));
    if (!asset) return { ok: false, error: "the latest release (" + lr.tag + ") has no .zip asset" };
    const m = asset.name.match(/v(\d+)/i) || String(lr.tag || "").match(/v(\d+)/i);
    const latest = m ? ("v" + m[1]) : (lr.tag || "");
    const cur = engineVersion();
    const newer = latest && cur && _verLt(cur, latest);
    toDir = toDir || path.join(os.homedir(), "Downloads");
    const dest = path.join(toDir, asset.name);
    if (!force && !newer) return { ok: true, upToDate: true, current: cur, latest, tag: lr.tag, repo };
    if (!force && fs.existsSync(dest) && fs.statSync(dest).size === asset.size) return { ok: true, already: true, current: cur, latest, file: dest, repo, note: "already in Downloads" };
    try { fs.mkdirSync(toDir, { recursive: true }); } catch {}
    const tk = effTok();
    const tmp = dest + ".part";
    try {
        if (tk && asset.apiUrl) await _downloadTo(asset.apiUrl, _hdrs({ Accept: "application/octet-stream" }), tmp);
        else await _downloadTo(asset.downloadUrl, { "User-Agent": "SweK-Engine", Accept: "application/octet-stream" }, tmp);
        try { fs.renameSync(tmp, dest); } catch { fs.copyFileSync(tmp, dest); fs.unlinkSync(tmp); }
    } catch (e) { try { fs.unlinkSync(tmp); } catch {} return { ok: false, error: "download failed: " + String((e && e.message) || e) }; }
    return { ok: true, downloaded: true, file: dest, size: fs.existsSync(dest) ? fs.statSync(dest).size : 0, current: cur, latest, tag: lr.tag, repo };
}

// =====================================================================================
// v1640 — GitHub-as-peer: surface monitored repos in the Server-Mode peer panel with their
// latest version. The engine's self-update repo (engineRepo = the SweK repo by default) always
// leads the list; the user can add/remove more repos, or hide the whole section via showAsPeer.
// Cached ~20 min so we stay well under the 60-req/hr unauthenticated GitHub limit (a token raises
// it to 5000/hr). Version source: latest release -> latest tag -> last push date.
// v1791/v1794 — curated suggested repos to monitor. svcId links to bgServicesBridge for local detection.
// swekPage = SweK HTML page that uses or demos this service (null if no dedicated page yet).
const SUGGESTED_REPOS = [
    // Cloud & identity
    { repo: "nextcloud/server",               label: "Nextcloud",             cat: "Cloud",    desc: "Self-hosted file/cloud/calendar storage",        svcId: "nextcloud",  svcPort: 8080,  swekPage: null,                     installCmd: "docker run -d -p 8080:80 --name nextcloud nextcloud" },
    { repo: "keycloak/keycloak",              label: "Keycloak",              cat: "Auth",     desc: "Open-source identity & SSO server",              svcId: null,         svcPort: null,  swekPage: null,                     installCmd: "docker run -p 8180:8080 quay.io/keycloak/keycloak start-dev" },
    // AI inference & tooling
    { repo: "open-webui/open-webui",          label: "Open WebUI",            cat: "AI",       desc: "Browser UI for Ollama and local LLMs",           svcId: "openwebui",  svcPort: 3000,  swekPage: null,                     installCmd: "pip install open-webui && open-webui serve" },
    { repo: "vllm-project/vllm",              label: "vLLM",                  cat: "AI",       desc: "High-throughput GPU LLM inference server",       svcId: "vllm",       svcPort: 8000,  swekPage: "/aibrain.html",          installCmd: "pip install vllm" },
    { repo: "qdrant/qdrant",                  label: "QDrant",                cat: "AI",       desc: "Vector database for AI similarity search",       svcId: "qdrant",     svcPort: 6333,  swekPage: "/asset-library.html",    installCmd: "docker run -p 6333:6333 qdrant/qdrant" },
    { repo: "unclecode/crawl4ai",             label: "Crawl4AI",              cat: "AI",       desc: "LLM-optimised async web crawler / scraper",      svcId: "crawl4ai",   svcPort: 11235, swekPage: "/scrape.html",           installCmd: "pip install 'crawl4ai[all]'" },
    { repo: "ggml-org/whisper.cpp",           label: "Whisper.cpp",           cat: "Voice",    desc: "offline speech-to-text server (dictation)",     svcId: "whisper",    svcPort: 8080,  swekPage: "/dictation.html",         installCmd: "git clone https://github.com/ggml-org/whisper.cpp && cd whisper.cpp && cmake -B build && cmake --build build --config Release" },
    { repo: "home-assistant/core",            label: "Home Assistant",        cat: "Home",     desc: "open-source home automation hub (Docker)",      svcId: "homeassistant", svcPort: 8123, swekPage: "/settings.html",       installCmd: "docker run -d --name homeassistant --restart=unless-stopped -v ~/homeassistant:/config --network=host ghcr.io/home-assistant/home-assistant:stable" },
    { repo: "rustdesk/rustdesk-server",       label: "RustDesk Server",       cat: "Remote",   desc: "self-hosted remote-desktop relay (hbbs+hbbr)",  svcId: "rustdesk_server", svcPort: 21116, swekPage: "/settings.html",    installCmd: "docker run -d --name hbbs --restart=unless-stopped --net=host -v ~/rustdesk-server:/root rustdesk/rustdesk-server hbbs && docker run -d --name hbbr --restart=unless-stopped --net=host -v ~/rustdesk-server:/root rustdesk/rustdesk-server hbbr" },
    { repo: "coollabsio/coolify",             label: "Coolify",               cat: "Deploy",   desc: "self-hosted PaaS: git-push CI/CD deploy of your GitHub repos (auto SSL, DBs, PR preview envs)", svcId: "coolify", svcPort: 8000, swekPage: "/hosting.html", installCmd: "curl -fsSL https://cdn.coollabs.io/coolify/install.sh | bash" },
    { repo: "bytecodealliance/wasmtime",      label: "Wasmtime (WASM runtime)", cat: "Runtime",  desc: "reference WASI runtime: run one portable .wasm on every OS (no Docker, no per-OS binary)", svcId: "wasmtime", svcPort: null, swekPage: "/wasm-demo.html", installCmd: "curl https://wasmtime.dev/install.sh -sSf | bash" },
    { repo: "fermyon/spin",                   label: "Fermyon Spin (WASM apps)", cat: "Runtime", desc: "build/run WASM microservices + HTTP handlers (routing, KV, SQLite) - Docker-free serverless", svcId: "spin", svcPort: 3000, swekPage: "/wasm-demo.html", installCmd: "curl -fsSL https://developer.fermyon.com/downloads/install.sh | bash" },
    { repo: "",                               label: "Oracle VirtualBox",     cat: "Home",     desc: "free hypervisor for a Home Assistant OS VM (USB pass-through)", svcId: "virtualbox", svcPort: null, swekPage: "/server.html",   installCmd: "winget install Oracle.VirtualBox" },
    { repo: "",                               label: "Microsoft Hyper-V",     cat: "Home",     desc: "built-in Windows Pro hypervisor for a HAOS VM (no USB pass-through)", svcId: "hyperv", svcPort: null, swekPage: "/server.html", installCmd: "Enable-WindowsOptionalFeature -Online -FeatureName Microsoft-Hyper-V -All" },
    // Quant / finance
    { repo: "microsoft/qlib",                 label: "QLib",                  cat: "Finance",  desc: "Microsoft AI quantitative investment platform",  svcId: null,         svcPort: null,  swekPage: "/tradingfloor.html",     installCmd: "pip install pyqlib" },
    { repo: "microsoft/RD-Agent",             label: "RD-Agent",              cat: "AI",       desc: "Microsoft research & development AI agent",      svcId: null,         svcPort: null,  swekPage: null,                     installCmd: "pip install rdagent" },
    { repo: "zhulinsen/daily_stock_analysis", label: "Daily Stock Analysis",  cat: "Finance",  desc: "Python daily stock analysis automation",         svcId: null,         svcPort: null,  swekPage: "/tradingfloor.html",     installCmd: "git clone https://github.com/zhulinsen/daily_stock_analysis" },
    // Voice & audio
    { repo: "altic-dev/FluidVoice",           label: "FluidVoice",            cat: "Voice",    desc: "macOS offline voice-to-text with AI enhancement",svcId: "fluidvoice", svcPort: null,  swekPage: "/tts.html",              installCmd: "brew install --cask fluidvoice" },
    // Portfolio / documents
    // v4024 -- Keith: "lets add https://github.com/amruthpillai/reactive-resume". MIT (Amruth Pillai), a
    // self-hostable resume builder; the author also runs it free at rxresu.me, so self-hosting buys privacy
    // and your own data rather than a feature the hosted one lacks.
    // *** swekPage IS DELIBERATELY OMITTED, AND THAT IS THE v4019 GATE WORKING ON ITS AUTHOR. *** No page in
    // this tree is about Reactive Resume, and swekPage-selfcheck fails any entry pointing at a page that never
    // names its service -- six of twelve already do, which is why that gate exists. Pointing this at
    // /portfolio.html or /settings.html to fill the field would have made it seven, and the field is optional
    // (five of seventeen entries omit it). An empty field is honest; a wrong one is the Coolify button.
    // *** AND IT IS NOT A `docker run` ONE-LINER, WHICH THE installCmd HAS TO SAY. *** compose.yml brings up
    // FOUR containers -- postgres, redis, seaweedfs (S3-compatible object storage) and the app -- so the
    // command is a clone plus `docker compose up -d`, not the single-container shape most rows here carry.
    // PORT 3000 IS ALREADY CLAIMED TWICE in this very list (Open WebUI, Fermyon Spin): whichever starts second
    // fails to bind, and that is a real conflict on a box running more than one of them.
    { repo: "amruthpillai/reactive-resume",   label: "Reactive Resume",       cat: "Portfolio", desc: "self-hosted resume builder (MIT): multi-page editor, PDF export, public share links - a 4-container compose stack (app + postgres + redis + seaweedfs), NOT a single docker run", svcId: "reactive_resume", svcPort: 3000, installCmd: "git clone https://github.com/amruthpillai/reactive-resume && cd reactive-resume && cp .env.example .env && docker compose up -d" },
    // P2P / infra
    { repo: "Azure/peerd",                    label: "Peerd",                 cat: "Infra",    desc: "P2P container image distribution for AKS",       svcId: null,         svcPort: null,  swekPage: null,                     installCmd: "helm install peerd ./build/package/peerd-helm" },
];

function peerConfig() {
    const c = loadCfg();
    return { ok: true, showAsPeer: c.showAsPeer !== false, owner: c.owner || "", engineRepo: c.engineRepo || "", monitorRepos: Array.isArray(c.monitorRepos) ? c.monitorRepos : [], suggestedRepos: SUGGESTED_REPOS };
}
function setPeerConfig(d) {
    d = d || {}; const c = loadCfg();
    if (typeof d.showAsPeer === "boolean") c.showAsPeer = d.showAsPeer;
    if (Array.isArray(d.monitorRepos)) c.monitorRepos = d.monitorRepos.map(s => String(s).trim()).filter(Boolean).slice(0, 30);
    saveCfg(c); _peerCache.at = 0; return peerConfig();
}
function addMonitorRepo(repo) {
    repo = _cleanRepoEntry(repo); if (!repo) return peerConfig();
    const c = loadCfg(); const list = Array.isArray(c.monitorRepos) ? c.monitorRepos.slice() : [];
    if (!list.some(r => r.toLowerCase() === repo.toLowerCase())) list.push(repo);
    c.monitorRepos = list.slice(0, 30); saveCfg(c); _peerCache.at = 0; return peerConfig();
}
function removeMonitorRepo(repo) {
    repo = String(repo || "").trim(); const c = loadCfg();
    c.monitorRepos = (Array.isArray(c.monitorRepos) ? c.monitorRepos : []).filter(r => r.toLowerCase() !== repo.toLowerCase());
    saveCfg(c); _peerCache.at = 0; return peerConfig();
}
function _cleanRepoEntry(s) { return String(s || "").trim().replace(/^https?:\/\/github\.com\//i, "").replace(/\.git$/i, "").replace(/\/+$/, ""); }
function _parseRepo(entry, defOwner) {
    const e = _cleanRepoEntry(entry); if (!e) return null;
    const parts = e.split("/").filter(Boolean);
    if (parts.length >= 2) return { owner: parts[0], repo: parts[1] };
    if (parts.length === 1 && defOwner) return { owner: defOwner, repo: parts[0] };
    return null;
}
const _peerCache = { at: 0, data: null };
// v1806 — each step has its own short timeout (was the shared 12s default per call,
// which across 3 fallback calls could be 36s for ONE repo). 404 on the first call now
// short-circuits immediately instead of still trying tags+commit for a repo that
// doesn't exist.
// v1807 — surfaces WHY a repo lookup failed (rate-limited vs network-unreachable vs
// missing) instead of collapsing everything to "?", so a timeout/error in the UI can
// show the actual cause rather than a flat "timed out" with no explanation.
async function _repoVersion(owner, repo) {
    const base = "/repos/" + encodeURIComponent(owner) + "/" + encodeURIComponent(repo);
    let lastReason = "unknown";
    try {
        const lr = await _api("GET", base + "/releases/latest");
        if (lr.ok && lr.data && lr.data.tag_name) return { version: lr.data.tag_name, relName: lr.data.name || "", kind: "release", at: lr.data.published_at || "", url: lr.data.html_url || ("https://github.com/" + owner + "/" + repo + "/releases") };
        if (lr.status === 403) lastReason = "rate-limited (no/expired GitHub token — set one in GitHub Manager to raise the limit from 60/hr to 5000/hr)";
        else if (lr.status === 404) lastReason = "repo or releases not found, trying tags…";
        else if (!lr.ok && lr.error) lastReason = lr.error;
    } catch (e) { lastReason = "network error: " + String(e && e.message || e); }
    try {
        const tg = await _api("GET", base + "/tags?per_page=1");
        if (tg.ok && Array.isArray(tg.data) && tg.data[0]) return { version: tg.data[0].name, kind: "tag", url: "https://github.com/" + owner + "/" + repo + "/tags" };
        if (tg.status === 403) lastReason = "rate-limited (no/expired GitHub token)";
    } catch (e) { lastReason = "network error: " + String(e && e.message || e); }
    try {
        const m = await _api("GET", base);
        if (m.ok && m.data) return { version: (m.data.pushed_at || "").slice(0, 10) || "-", kind: "commit", at: m.data.pushed_at || "", url: m.data.html_url || ("https://github.com/" + owner + "/" + repo), desc: m.data.description || "" };
        if (m.status === 404) return { version: "not found", kind: "missing", error: true, reason: "repo does not exist or is private without a token" };
        if (m.status === 403) lastReason = "rate-limited (no/expired GitHub token — set one in GitHub Manager)";
    } catch (e) { lastReason = "network error: " + String(e && e.message || e); }
    return { version: "?", kind: "unknown", error: true, reason: lastReason };
}
// v1806 — was a sequential for-loop awaiting up to 3 GitHub API calls PER repo
// (releases -> tags -> commit), one repo at a time. With several monitored repos
// this could take minutes or hang the whole /github/peers route if GitHub started
// rate-limiting partway through, which froze the Settings panel that depends on
// it (the fetch never resolved or rejected, so the client-side .catch() never fired
// either). Fixed: all repos are now queried IN PARALLEL via Promise.all, and the
// whole peerRepos() call has a hard overall deadline (8s) — if it's not done by
// then, we return whatever stale cache we have (or an empty/partial result) rather
// than blocking the route forever.
async function peerRepos(force) {
    const c = loadCfg();
    if (c.showAsPeer === false) return { ok: true, showAsPeer: false, engineVersion: engineVersion(), repos: [] };
    if (!force && _peerCache.data && (Date.now() - _peerCache.at < 20 * 60000)) return _peerCache.data;
    const defOwner = c.owner || "HowdyKeith";
    const engPr = c.engineRepo ? _parseRepo(c.engineRepo, defOwner) : null;
    const engKey = engPr ? (engPr.owner + "/" + engPr.repo).toLowerCase() : "";
    const seen = new Set(), entries = [];
    const all = [].concat(c.engineRepo ? [c.engineRepo] : [], Array.isArray(c.monitorRepos) ? c.monitorRepos : []);
    for (const e of all) { const pr = _parseRepo(e, defOwner); if (!pr) continue; const key = (pr.owner + "/" + pr.repo).toLowerCase(); if (seen.has(key)) continue; seen.add(key); entries.push(pr); }

    // v1807 — fast preflight: check the rate limit BEFORE burning the timeout budget
    // on calls that will all 403 anyway. If exhausted, fail immediately with a clear
    // reason instead of a generic "timed out" after several seconds of useless calls.
    let rl = null;
    try { rl = await rateLimit(); } catch {}
    if (rl && rl.ok && rl.remaining === 0) {
        const resetIn = rl.reset ? Math.max(0, Math.round(rl.reset - Date.now() / 1000)) : null;
        const data = {
            ok: true, showAsPeer: true, engineVersion: engineVersion(), repos: [],
            error: "GitHub API rate limit exhausted (0/" + rl.limit + " remaining" +
                   (resetIn != null ? ", resets in ~" + Math.ceil(resetIn / 60) + " min" : "") +
                   "). Set a GitHub token in GitHub Manager to raise the limit from 60/hr to 5000/hr.",
            rateLimited: true,
        };
        if (_peerCache.data) return Object.assign({}, data, { repos: _peerCache.data.repos || [] });   // show stale data if we have it
        return data;
    }

    const OVERALL_DEADLINE_MS = 8000;
    const deadline = Promise.race([
        Promise.all(entries.map(async (pr) => {
            const v = await _repoVersion(pr.owner, pr.repo);
            const full = pr.owner + "/" + pr.repo;
            return Object.assign({ owner: pr.owner, repo: pr.repo, full: full, isEngine: full.toLowerCase() === engKey }, v);
        })),
        new Promise((resolve) => setTimeout(() => resolve(null), OVERALL_DEADLINE_MS)),
    ]);
    const out = await deadline;
    const data = { ok: true, showAsPeer: true, engineVersion: engineVersion(), repos: out || [], partial: out === null };
    if (out !== null) { _peerCache.at = Date.now(); _peerCache.data = data; }   // don't cache a partial/timed-out result
    else if (_peerCache.data) { return Object.assign({}, _peerCache.data, { partial: true }); }   // fall back to stale cache
    return data;
}

// v1977 — update NOTIFICATIONS across every monitored repo. peerRepos() already fetches each repo's
// latest release tag (cached ~20 min); updates() compares those tags against a persisted "seen" store
// so we can flag only GENUINELY-NEW releases (not just "behind"), which is what a notification wants.
// Seen tags live in ~/.voxelbridge/github.json under _seenTags {full: tag}. markUpdatesSeen() dismisses.
function _loadSeen() { const c = loadCfg(); return (c._seenTags && typeof c._seenTags === "object") ? c._seenTags : {}; }
function _saveSeen(seen) { const c = loadCfg(); c._seenTags = seen; saveCfg(c); }
async function updates(force) {
    const pr = await peerRepos(force);
    if (!pr || !pr.ok) return { ok: false, error: (pr && pr.error) || "peer repos failed", rateLimited: !!(pr && pr.rateLimited) };
    const seen = _loadSeen();
    const list = [];
    for (const r of (pr.repos || [])) {
        if (!r || !r.full || !r.latest) continue;
        const prev = seen[r.full.toLowerCase()] || null;
        // "new" = we have a latest tag AND (we've never recorded one, OR it changed since we last recorded).
        // First-run seeding: record current tags WITHOUT flagging them all as new (avoids a wall of
        // notifications the first time), except the ENGINE repo where "behind" is the meaningful signal.
        const isNew = prev != null && prev !== r.latest;
        list.push({
            full: r.full, repo: r.repo, owner: r.owner, latest: r.latest, current: r.current || null,
            isEngine: !!r.isEngine, behind: !!r.behind, url: r.url || ("https://github.com/" + r.full + "/releases"),
            prevSeen: prev, isNew,
        });
    }
    // seed any repo we've never seen so the NEXT change is what notifies
    let seeded = 0;
    for (const r of list) { const k = r.full.toLowerCase(); if (seen[k] == null) { seen[k] = r.latest; seeded++; } }
    if (seeded) _saveSeen(seen);
    const newOnes = list.filter(r => r.isNew);
    const behind = list.filter(r => r.isEngine && r.behind);
    return { ok: true, engineVersion: pr.engineVersion, count: list.length, updates: newOnes, behind, all: list, rateLimited: !!pr.rateLimited, partial: !!pr.partial };
}
// Dismiss: record the current latest tags as "seen" (all, or one repo) so they stop notifying.
async function markUpdatesSeen(fullOrNull) {
    const pr = await peerRepos(false);
    const seen = _loadSeen();
    for (const r of ((pr && pr.repos) || [])) {
        if (!r || !r.full || !r.latest) continue;
        const k = r.full.toLowerCase();
        if (!fullOrNull || k === String(fullOrNull).toLowerCase()) seen[k] = r.latest;
    }
    _saveSeen(seen);
    return { ok: true };
}


// ---- v2504: publish a WHOLE FOLDER as one commit -------------------------------------------------------------
//
// putFile() uses the Contents API: one file, one commit. Twelve files means twelve commits, and the engine folder
// would mean thousands. This uses the GIT DATA API instead -- blobs, then a tree, then a commit, then move the
// branch ref -- which is what `git push` actually does under the hood, minus git.
//
// WHY NO GIT: git needs a binary, a credential helper, an SSH key or a cached PAT, and a working directory it owns.
// This needs a token the panel already has. It works identically on Windows, the Mac and a headless peer, and it
// cannot leave a half-staged repo behind. The token is the only credential in play.
//
// THE NESTING TRAP, WHICH IS THE WHOLE REASON THIS EXISTS: dragging a folder onto GitHub's web uploader gives you
// repo/foldername/src/... and every relative import breaks. Same failure the ship ritual's zip verifier catches.
// This walks the folder and stores paths RELATIVE TO IT, so src/index.js lands at src/index.js. Verified below by
// refusing to commit a tree whose top level contains only one directory -- that is the nesting bug, every time.

const IGNORE = new Set(["node_modules", ".git", "__pycache__", ".DS_Store", ".venv", "dist", ".next", "coverage"]);
function walkDir(root, rel = "", out = []) {
    for (const name of fs.readdirSync(path.join(root, rel))) {
        if (IGNORE.has(name) || name.endsWith(".bak") || name.startsWith(".sweep-stranded")) continue;
        const r = rel ? rel + "/" + name : name;
        const st = fs.statSync(path.join(root, r));
        if (st.isDirectory()) walkDir(root, r, out);
        else if (st.size <= 40 * 1024 * 1024) out.push({ path: r, size: st.size });
    }
    return out;
}

// Look at a folder before doing anything to it. Non-destructive; the panel calls this first so you can SEE what
// would be published rather than find out afterwards.
function previewFolder({ dir } = {}) {
    if (!dir) return { ok: false, error: "dir required" };
    let st; try { st = fs.statSync(dir); } catch { return { ok: false, error: "no such folder: " + dir }; }
    if (!st.isDirectory()) return { ok: false, error: "not a folder: " + dir };
    const files = walkDir(dir);
    if (!files.length) return { ok: false, error: "folder is empty (after ignoring node_modules, .git, etc)" };
    const top = new Set(files.map((f) => f.path.split("/")[0]));
    const bytes = files.reduce((a, f) => a + f.size, 0);
    const nested = top.size === 1 && files.every((f) => f.path.includes("/"));
    return {
        ok: true, dir, count: files.length, bytes,
        top: [...top].sort(),
        files: files.slice(0, 400).map((f) => f.path),
        hasReadme: files.some((f) => /^readme\.md$/i.test(f.path)),
        hasLicense: files.some((f) => /^licen[cs]e$/i.test(f.path)),
        hasWorkflow: files.some((f) => f.path.startsWith(".github/workflows/")),
        nested,
        warn: nested ? "Everything sits under a single folder '" + [...top][0] + "'. You probably picked the PARENT of the project. Publishing this gives you repo/" + [...top][0] + "/... and every relative import breaks." : null,
    };
}

async function publishFolder({ dir, repo, message, description, topics, branch, priv } = {}) {
    const c = loadCfg();
    if (!effTok()) return { ok: false, error: "token required" };
    const pv = previewFolder({ dir });
    if (!pv.ok) return pv;
    if (pv.nested) return { ok: false, error: pv.warn + " Pick the project folder itself.", nested: true };
    if (!repo) return { ok: false, error: "repo name required" };
    const br = branch || "main";

    // 1. the repo, made if absent. auto_init gives us a base commit to build on.
    let created = false;
    let r = await _api("GET", _repoPath(repo));
    if (!r.ok) {
        const mk = await createRepo({ name: repo, description, priv: !!priv, autoInit: true });
        if (!mk.ok) return mk;
        created = true;
        await new Promise((res) => setTimeout(res, 1500));       // GitHub needs a beat before the ref exists
        r = await _api("GET", _repoPath(repo));
        if (!r.ok) return r;
    } else if (description) {
        await _api("PATCH", _repoPath(repo), { description });
    }
    const base = r.data.default_branch || br;

    // 2. every file becomes a blob. base64 so binaries survive -- this is not a text-only publisher.
    const tree = [];
    for (const f of pv.files.length === pv.count ? walkDir(dir) : walkDir(dir)) {
        const buf = fs.readFileSync(path.join(dir, f.path));
        const b = await _api("POST", _repoPath(repo) + "/git/blobs",
            { content: buf.toString("base64"), encoding: "base64" });
        if (!b.ok) return { ok: false, error: "blob failed for " + f.path + ": " + b.error };
        tree.push({ path: f.path, mode: "100644", type: "blob", sha: b.data.sha });
    }

    // 3. one tree, one commit, then move the branch. This is what git push does.
    const headRef = await _api("GET", _repoPath(repo) + "/git/ref/heads/" + base);
    const parent = headRef.ok ? headRef.data.object.sha : null;
    const t = await _api("POST", _repoPath(repo) + "/git/trees", { tree });
    if (!t.ok) return { ok: false, error: "tree failed: " + t.error };
    const cm = await _api("POST", _repoPath(repo) + "/git/commits",
        { message: message || "Publish " + pv.count + " files", tree: t.data.sha, parents: parent ? [parent] : [] });
    if (!cm.ok) return { ok: false, error: "commit failed: " + cm.error };
    const up = await _api("PATCH", _repoPath(repo) + "/git/refs/heads/" + base,
        { sha: cm.data.sha, force: true });
    if (!up.ok) return { ok: false, error: "ref update failed: " + up.error };

    // 4. topics, if asked. A separate endpoint; failing here must not fail the publish.
    let topicsSet = null;
    if (Array.isArray(topics) && topics.length) {
        const tp = await _api("PUT", _repoPath(repo) + "/topics", { names: topics.map((x) => String(x).toLowerCase().trim()).filter(Boolean).slice(0, 20) });
        topicsSet = tp.ok;
    }
    return { ok: true, repo, created, files: pv.count, bytes: pv.bytes, branch: base,
             commit: cm.data.sha.slice(0, 7), topicsSet,
             url: "https://github.com/" + c.owner + "/" + repo,
             warnings: [pv.hasReadme ? null : "no README.md", pv.hasLicense ? null : "no LICENSE", pv.hasWorkflow ? null : "no CI workflow (.github/workflows/)"].filter(Boolean) };
}

module.exports = { _apiErrorText, _errorDetail, repoShapeError, _parseEngineVersion, _versionInTree, cloneEngineSource, previewFolder, publishFolder, setConfig, status, listRepos, repoPreview, latestRelease, versionCheck, denoVersionCheck, createRelease, uploadAsset, publishVersion, publishEngineBuild, fetchEngineBuild, engineVersion, whoami, rateLimit, createRepo, updateRepo, deleteRepo, listReleases, deleteRelease, listIssues, createIssue, closeIssue, listCommits, listBranches, getFile, putFile, peerConfig, setPeerConfig, addMonitorRepo, removeMonitorRepo, peerRepos, updates, markUpdatesSeen , pagesFor, checkPages, pagesUrl};
