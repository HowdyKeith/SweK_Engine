// ai-bridge/kaggleBridge.js — drives the official `kaggle` CLI (`python -m kaggle`)
// to push notebooks to Kaggle, poll status, and pull outputs into GPU_Assets/.
// v1 (EngineProject v608).
//
// Why CLI not REST: kaggle's v2 SDK switched to an RPC-over-HTTP transport
// (kernels.KernelsApiService/SaveKernel) generated from an internal schema —
// reimplementing it in Node would break every upstream change. Shelling out
// to the official client is the same pattern we use for the Python listener
// and keeps auth/retries/upload chunking owned by the maintained library.
//
// Setup (one-time, exposed as panel buttons):
//   1) phone-verify the kaggle account at kaggle.com (browser-only)
//   2) at kaggle.com/settings → "Create New API Token" -> kaggle.json
//      paste the {username, key} into the panel -> /kaggle/config
//   3) Install Python deps button -> `pip install kaggle` (allowlisted)
//
// Per-job (one click):
//   panel picks a template + params -> /kaggle/submit -> bridge writes
//   .ipynb + kernel-metadata.json to a tmp dir -> `kaggle kernels push` ->
//   status polled -> `kaggle kernels output` -> *.glb dropped into
//   WebGLEngine/GPU_Assets/ where the engine picks it up.
//
// UNTESTED against live Kaggle from the build sandbox. Verify on your box.

const { spawn, execFile } = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");

const CFG = {
    KAGGLE_USERNAME: "",
    KAGGLE_KEY: "",
    PYTHON: process.platform === "win32" ? "python" : "python3",
    OUTPUT_DIR: "",                          // resolved at start() = ../GPU_Assets relative to ai-bridge
    // v696 — per-template Kaggle Dataset slug map. When a slug is set for a
    // template id, submit() includes it in kernel-metadata.dataset_sources
    // so Kaggle mounts the dataset at /kaggle/input/<slug-tail>/ and the
    // notebook can skip the HF download. Keys are template ids, values are
    // strings like "user/dataset-name". Empty by default.
    cachedDatasets: {},
};
const CONFIG_FILE = path.join(__dirname, "kaggle.config.json");
const KAGGLE_HOME = path.join(os.homedir(), ".kaggle");
const KAGGLE_JSON = path.join(KAGGLE_HOME, "kaggle.json");
const JOBS_FILE = path.join(__dirname, "kaggle.jobs.json");

const TEMPLATES = {
    diagnostic: require("./kaggle_templates/diagnostic.js"),
    hunyuan3d:  require("./kaggle_templates/hunyuan3d.js"),
    trellis2:   require("./kaggle_templates/trellis2.js"),
    direct3d_s2: require("./kaggle_templates/direct3d_s2.js"),
    rig_anything: require("./kaggle_templates/rig_anything.js"),
    triposr:    require("./kaggle_templates/triposr.js"),
    triposg:    require("./kaggle_templates/triposg.js"),
    // v784 — TripoSplat: VAST-AI's newest, outputs Gaussian splats (.ply) not GLB
    triposplat: require("./kaggle_templates/triposplat.js"),
    instantmesh: require("./kaggle_templates/instantmesh.js"),
    stable_fast_3d: require("./kaggle_templates/stable_fast_3d.js"),
    lgm:        require("./kaggle_templates/lgm.js"),
    kimodo:     require("./kaggle_templates/kimodo.js"),
    sam3d_objects: require("./kaggle_templates/sam3d_objects.js"),
    sam3d_body: require("./kaggle_templates/sam3d_body.js"),
    // v692 — image-gen (Alibaba Z-Image + Qwen-Image) and image-to-3D (Pixal3D)
    z_image:    require("./kaggle_templates/z_image.js"),
    qwen_image: require("./kaggle_templates/qwen_image.js"),
    pixal3d:    require("./kaggle_templates/pixal3d.js"),
    // v693 — Apple LiTo (image → 3D with view-dependent lighting)
    lito:       require("./kaggle_templates/lito.js"),
    // v1930 — Sparc3D (hi-res image→3D, watertight 1024³; runs on P100 or T4) +
    // LingBot-Map (video→3D scene; needs sm_75 so T4-only, guarded against P100)
    sparc3d:    require("./kaggle_templates/sparc3d.js"),
    lingbot_map: require("./kaggle_templates/lingbot_map.js"),
};

// ---- config persistence + ~/.kaggle/kaggle.json
function _loadCfg() {
    try {
        const j = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8"));
        for (const k of Object.keys(CFG)) if (j[k] !== undefined) CFG[k] = j[k];
    } catch (e) {}
}
function _saveCfg() {
    try { fs.writeFileSync(CONFIG_FILE, JSON.stringify(CFG, null, 2)); } catch (e) {}
}
function _writeKaggleJson() {
    try {
        fs.mkdirSync(KAGGLE_HOME, { recursive: true });
        fs.writeFileSync(KAGGLE_JSON, JSON.stringify({ username: CFG.KAGGLE_USERNAME, key: CFG.KAGGLE_KEY }));
        try { fs.chmodSync(KAGGLE_JSON, 0o600); } catch (e) {}   // best-effort on win32
    } catch (e) { return { ok: false, error: e.message }; }
    return { ok: true };
}
function _loadJobs() { try { return JSON.parse(fs.readFileSync(JOBS_FILE, "utf8")); } catch (e) { return []; } }
function _saveJobs(jobs) { try { fs.writeFileSync(JOBS_FILE, JSON.stringify(jobs, null, 2)); } catch (e) {} }

function _slugify(s) {
    return String(s || "").toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 50);
}

function _runCapture(cmd, args, opts = {}) {
    return new Promise((res) => {
        // v627 — force UTF-8 I/O on the spawned Python. The kaggle CLI prints
        // result tables that can contain emoji (e.g. 🏆 in a dataset title or a
        // medal indicator). On Windows the default console codec is cp1252, so
        // Python throws `UnicodeEncodeError: 'charmap' codec can't encode
        // character '\U0001f3c6'` while FORMATTING the output — even though the
        // network call (and auth) succeeded. PYTHONUTF8=1 + PYTHONIOENCODING
        // make stdout/stderr UTF-8 so the CLI can print anything without dying.
        // v629 — also pass the creds as KAGGLE_USERNAME / KAGGLE_KEY env vars.
        // The new kaggle CLI 2.x split auth: `datasets list` (read) accepts the
        // legacy kaggle.json, but `kernels push` (write) was preferring the new
        // OAuth flow and rejecting kaggle.json — surfacing as "push failed:
        // kaggle auth login ... KAGGLE_API_TOKEN ...". Per Kaggle's API docs the
        // KAGGLE_USERNAME/KAGGLE_KEY env vars take PRECEDENCE over kaggle.json,
        // which forces the legacy-credential path for every operation including
        // push. Set them from CFG when we have them.
        const env = { ...process.env, PYTHONUTF8: "1", PYTHONIOENCODING: "utf-8" };
        if (CFG.KAGGLE_USERNAME) env.KAGGLE_USERNAME = CFG.KAGGLE_USERNAME;
        if (CFG.KAGGLE_KEY)      env.KAGGLE_KEY = CFG.KAGGLE_KEY;
        execFile(cmd, args, { timeout: opts.timeout || 120000, maxBuffer: 8 * 1024 * 1024, windowsHide: true, cwd: opts.cwd, env, ...opts },
            (err, so, se) => res({ ok: !err, code: err && err.code, error: err && err.message, stdout: String(so || ""), stderr: String(se || "") }));
    });
}
function _kaggleArgs(sub) {
    return [["-m", "kaggle"], sub].flat();          // we spawn `python -m kaggle ...`
}

// ---- public surface
async function status() {
    const hasCreds = !!(CFG.KAGGLE_USERNAME && CFG.KAGGLE_KEY);
    let kaggleInstalled = false, kaggleVersion = null, authOk = false, authError = null;
    const v = await _runCapture(CFG.PYTHON, ["-m", "kaggle", "--version"]);
    if (v.ok) { kaggleInstalled = true; kaggleVersion = (v.stdout || v.stderr || "").trim().split("\n")[0]; }
    if (hasCreds && kaggleInstalled) {
        // v626 — smoke-test auth with `datasets list` rather than `kernels list -m`.
        // `kernels list -m` (list MY kernels) is a poor probe: on a fresh account
        // with no kernels, and on the newer kaggle CLI 2.2.0, it can exit non-zero
        // for reasons unrelated to auth — which surfaced as a confusing
        // "Command failed: python -m kaggle kernels list -m -p 1 --csv". Listing
        // public datasets is the canonical "is my token valid" call (and the one
        // Kaggle's own docs use). A bad token still returns 401/403 here.
        const r = await _runCapture(CFG.PYTHON, ["-m", "kaggle", "datasets", "list", "-p", "1", "--csv"]);
        const blob = ((r.stderr || "") + " " + (r.stdout || "")).toLowerCase();
        authOk = r.ok && !/401|403|unauthorized|forbidden|invalid|authenticat/i.test(blob);
        if (!authOk) {
            // Surface the most useful line of the real output so the user can see
            // WHY (expired key, wrong username, proxy, etc.) instead of just "✗".
            const lines = (r.stderr || r.stdout || r.error || "").split("\n").map(s => s.trim()).filter(Boolean);
            authError = (lines.find(l => /401|403|unauthor|forbidden|invalid|error/i.test(l)) || lines[0] || "auth check failed").slice(0, 160);
        }
    }
    return {
        configured: hasCreds,
        username: hasCreds ? CFG.KAGGLE_USERNAME : null,
        kaggleInstalled, kaggleVersion, authOk, authError,
        templates: Object.keys(TEMPLATES),
        outputDir: CFG.OUTPUT_DIR,
        jobCount: _loadJobs().length,
    };
}

function setConfig({ username, key }) {
    if (username !== undefined) CFG.KAGGLE_USERNAME = String(username || "").trim();
    if (key !== undefined)      CFG.KAGGLE_KEY      = String(key || "").trim();
    _saveCfg();
    const w = _writeKaggleJson();
    return { ok: w.ok, error: w.error };
}

async function submit({ template, params, title }) {
    if (!CFG.KAGGLE_USERNAME || !CFG.KAGGLE_KEY) throw new Error("not configured (paste your kaggle.json creds first)");
    const tpl = TEMPLATES[template];
    if (!tpl) throw new Error("unknown template: " + template);

    const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const niceTitle = (title || `voxelengine ${template} ${ts}`).slice(0, 50);
    const slug = "voxelengine-" + _slugify(template + "-" + ts);             // becomes username/voxelengine-...
    const tmpDir = path.join(os.tmpdir(), "kaggle-job-" + slug);
    fs.mkdirSync(tmpDir, { recursive: true });

    const nb = tpl.buildNotebook(params || {}, { slug, title: niceTitle, username: CFG.KAGGLE_USERNAME });
    const codeFile = `${slug}.ipynb`;
    fs.writeFileSync(path.join(tmpDir, codeFile), JSON.stringify(nb));
    // v696 — per-template cached-dataset slug takes precedence over the
    // static defaultDatasets list. params.dataset_sources (caller-supplied)
    // wins over both, in case Kaggle Lab wants to force a specific cache.
    const userCachedSlug = CFG.cachedDatasets && CFG.cachedDatasets[template];
    const datasetSources = (params && params.dataset_sources)
        || (userCachedSlug ? [userCachedSlug] : null)
        || tpl.defaultDatasets
        || [];
    const metadata = {
        id: `${CFG.KAGGLE_USERNAME}/${slug}`,
        title: niceTitle,
        code_file: codeFile,
        language: "python",
        kernel_type: "notebook",
        is_private: true,
        enable_gpu: tpl.gpu !== false,
        enable_internet: true,
        dataset_sources: datasetSources,
        model_sources: (params && params.model_sources) || [],
        competition_sources: [],
        kernel_sources: [],
    };
    fs.writeFileSync(path.join(tmpDir, "kernel-metadata.json"), JSON.stringify(metadata, null, 2));

    const push = await _runCapture(CFG.PYTHON, ["-m", "kaggle", "kernels", "push", "-p", tmpDir]);
    const out = (push.stdout + "\n" + push.stderr).trim();
    const urlMatch = out.match(/https:\/\/www\.kaggle\.com\/code\/[^\s"]+/);
    const ok = push.ok && /successfully pushed|kernel version/i.test(out);
    const job = {
        slug: `${CFG.KAGGLE_USERNAME}/${slug}`,
        template, title: niceTitle,
        url: urlMatch ? urlMatch[0] : `https://www.kaggle.com/code/${CFG.KAGGLE_USERNAME}/${slug}`,
        submittedAt: Date.now(),
        lastStatus: ok ? "queued" : "error",
        pushLog: out.slice(-2000),
        // v645 — caller-supplied tags (e.g. ["lab"]) + free-form note (e.g.
        // the original prompt or "test 2026-05-29"). Lets the Kaggle Lab
        // separate its jobs from the AAS pipeline's without needing a
        // second storage. Both default to safe empty values.
        tags: Array.isArray(params?.tags) ? params.tags.slice(0, 6).map(String) : [],
        note: params?.note ? String(params.note).slice(0, 200) : null,
    };
    const jobs = _loadJobs(); jobs.unshift(job); _saveJobs(jobs.slice(0, 50));
    if (!ok) throw new Error("push failed: " + out.slice(-400));
    return job;
}

async function kernelStatus(slug) {
    if (!slug) throw new Error("slug required");
    const r = await _runCapture(CFG.PYTHON, ["-m", "kaggle", "kernels", "status", slug]);
    const blob = (r.stdout + " " + r.stderr).toLowerCase();
    // v631 — tolerant status parse. The old code required the exact phrase
    // `has status "running"`, but the classic CLI (1.8.x + kagglesdk) and the
    // 2.x CLI print the state in several shapes: `has status "complete"`,
    // `status: running`, `KernelWorkerStatus.RUNNING`, or a bare quoted token.
    // Grab the first status-ish token after the word "status" (allowing a
    // quote / colon / dot / enum prefix), then bucket it. This is why jobs were
    // stuck showing "unknown" even though they pushed and were running.
    let phase = "unknown";
    const m = blob.match(/status['":.\s]*"?\s*(complete\w*|running|queued|busy|pending|error|cancel\w*|fail\w*|killed)/);
    const tok = m ? m[1] : "";
    if (/complete/.test(tok)) phase = "complete";
    else if (/(running|queued|busy|pending)/.test(tok)) phase = "running";
    else if (/(error|cancel|fail|killed)/.test(tok)) phase = "error";
    // update cached job entry
    const jobs = _loadJobs();
    const idx = jobs.findIndex(j => j.slug === slug);
    if (idx >= 0) { jobs[idx].lastStatus = phase; jobs[idx].lastChecked = Date.now(); _saveJobs(jobs); }
    return { slug, phase, raw: (r.stdout || r.stderr || "").trim().slice(0, 600) };
}

async function downloadOutput(slug) {
    if (!slug) throw new Error("slug required");
    const dest = CFG.OUTPUT_DIR || path.join(__dirname, "..", "GPU_Assets");
    fs.mkdirSync(dest, { recursive: true });
    const r = await _runCapture(CFG.PYTHON, ["-m", "kaggle", "kernels", "output", slug, "-p", dest], { timeout: 600000 });
    const out = (r.stdout + "\n" + r.stderr).trim();
    if (!r.ok) throw new Error("output download failed: " + out.slice(-400));
    // count what landed
    let files = [];
    try { files = fs.readdirSync(dest).filter(f => /\.(glb|gltf|obj|ply|png|jpg|wav|mp3|flac|ogg|mp4|webm|mov)$/i.test(f)); } catch (e) {}

    // v802 — auto-ingest into the Universal Asset Library. Each output
    // file becomes a library asset with source="kaggle", tagged with
    // the slug for traceability. Type inferred from extension.
    let ingested = 0;
    try {
        const assetLibrary = require("./assetLibraryBridge.js");
        for (const f of files) {
            try {
                const filePath = path.join(dest, f);
                const ext = (f.split(".").pop() || "").toLowerCase();
                const name = f.replace(/\.[^.]+$/, "");
                // Skip if already ingested (idempotent — re-running download
                // doesn't double-add). Match on the kaggle:<slug>:<name> tag.
                const tag = `kaggle:${slug}:${name}`;
                const existing = assetLibrary.list({ tag }).assets || [];
                if (existing.length > 0) continue;
                let type, payload;
                if (ext === "glb" || ext === "gltf" || ext === "obj") {
                    type = "mesh";
                    const buf = fs.readFileSync(filePath);
                    payload = { dataBase64: buf.toString("base64"), dataExt: ext };
                } else if (ext === "ply") {
                    type = "splat";
                    const buf = fs.readFileSync(filePath);
                    payload = { dataBase64: buf.toString("base64"), dataExt: ext };
                } else if (ext === "png" || ext === "jpg" || ext === "jpeg") {
                    type = "image";
                    const buf = fs.readFileSync(filePath);
                    payload = { dataBase64: buf.toString("base64"), dataExt: ext };
                } else if (ext === "wav" || ext === "mp3" || ext === "flac" || ext === "ogg") {
                    type = "audio";
                    const buf = fs.readFileSync(filePath);
                    payload = { dataBase64: buf.toString("base64"), dataExt: ext };
                } else if (ext === "mp4" || ext === "webm" || ext === "mov") {
                    type = "video";
                    const buf = fs.readFileSync(filePath);
                    payload = { dataBase64: buf.toString("base64"), dataExt: ext };
                } else {
                    continue;       // unknown extension, skip
                }
                const result = assetLibrary.add({
                    name, type, source: "kaggle",
                    tags: ["kaggle-gen", `kaggle:${slug}`, tag],
                    ...payload,
                });
                if (result?.meta) ingested++;
            } catch (e) {
                console.warn(`[kaggle] couldn't ingest ${f}:`, e?.message);
            }
        }
    } catch (e) {
        console.warn("[kaggle] asset library auto-ingest skipped:", e?.message);
    }

    return { slug, dest, files: files.slice(-20), ingested, log: out.slice(-1200) };
}

// v649 — fetch the kernel's execution log (Python stdout/stderr + tracebacks)
// without writing output files anywhere durable. Uses `kaggle kernels output`
// into a temp dir, captures the CLI's printed log output, then nukes the temp.
// Caches the captured log on the job record under .errorLog so subsequent
// calls return immediately. This is what surfaces "why did my Kaggle notebook
// fail" — the bridge had been throwing away the actual Python traceback.
async function fetchLog(slug) {
    if (!slug) throw new Error("slug required");
    const jobs = _loadJobs();
    const idx = jobs.findIndex(j => j.slug === slug);
    // Return cached log if we already grabbed it (subsequent panel opens
    // are cheap).
    if (idx >= 0 && jobs[idx].errorLog && jobs[idx].errorLogAt && (Date.now() - jobs[idx].errorLogAt) < 24 * 3600 * 1000) {
        return { slug, log: jobs[idx].errorLog, cached: true, at: jobs[idx].errorLogAt };
    }
    const tmpDir = path.join(os.tmpdir(), "kaggle-log-" + slug.replace(/[^\w.-]+/g, "_"));
    try { fs.mkdirSync(tmpDir, { recursive: true }); } catch {}
    const r = await _runCapture(CFG.PYTHON, ["-m", "kaggle", "kernels", "output", slug, "-p", tmpDir, "-q"], { timeout: 180_000 });
    const out = (r.stdout + "\n" + r.stderr).trim();
    // The Python stdout from the kernel is what we want — strip the CLI's
    // own progress noise so the user sees the traceback first.
    let log = out;
    // Try to find a traceback or the last cell output. If we see "Traceback"
    // grab from there to the end (that's almost always what the user wants).
    const tb = log.lastIndexOf("Traceback");
    if (tb >= 0) log = log.slice(tb);
    log = log.slice(-4000);
    // Persist the log on the job record so the UI can re-display without a
    // second CLI call.
    if (idx >= 0) {
        jobs[idx].errorLog = log;
        jobs[idx].errorLogAt = Date.now();
        _saveJobs(jobs);
    }
    // Best-effort temp cleanup (don't fail the fetch if rmSync trips on a
    // Windows file lock).
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
    return { slug, log, cached: false, at: Date.now(), cliOk: !!r.ok };
}

function listJobs() { return _loadJobs(); }

// v640 — background poll for non-terminal jobs. The user reported jobs that
// failed earlier still showing 'queued' — that was because lastStatus only
// updated when the kaggleInfoPanel polled them, and if the panel was closed
// the cache went stale. This loop fixes that: every 60s, scan jobs and
// re-poll any whose lastStatus isn't complete/error. kernelStatus() already
// writes the new phase back to JOBS_FILE, so all callers see the fresh state.
// Six-hour cutoff: jobs still 'queued' after 6h are almost certainly stuck
// in Kaggle's free-tier queue (or zombie); we stop polling so we don't spam.
const POLL_INTERVAL_MS  = 60_000;
const POLL_STALE_CUTOFF = 6 * 60 * 60 * 1000;   // 6 hours
let _pollTimer = null;
async function _pollPendingJobs() {
    try {
        const jobs = _loadJobs();
        const terminal = new Set(["complete", "error"]);
        const now = Date.now();
        const pending = jobs.filter(j => j.slug
            && !terminal.has(String(j.lastStatus || "").toLowerCase())
            && (!j.submittedAt || (now - j.submittedAt) < POLL_STALE_CUTOFF));
        if (!pending.length) return;
        // Throttle internally: 1 status call per second so a backlog doesn't
        // spike the Kaggle CLI all at once.
        for (const j of pending) {
            try { await kernelStatus(j.slug); } catch (e) {}
            await new Promise(r => setTimeout(r, 1000));
        }
    } catch (e) { /* swallow — best effort */ }
}
function _startJobPoller() {
    if (_pollTimer) return;
    _pollTimer = setInterval(_pollPendingJobs, POLL_INTERVAL_MS);
    // First sweep ~10s after boot so the bridge has time to settle.
    setTimeout(_pollPendingJobs, 10_000);
}
_startJobPoller();

async function start() {
    _loadCfg();
    if (!CFG.OUTPUT_DIR) CFG.OUTPUT_DIR = path.join(__dirname, "..", "GPU_Assets");
    if (CFG.KAGGLE_USERNAME && CFG.KAGGLE_KEY) _writeKaggleJson();   // re-sync ~/.kaggle/kaggle.json on boot
    // v696 — guarantee CFG.cachedDatasets is always a plain object even on
    // configs persisted before this field existed.
    if (!CFG.cachedDatasets || typeof CFG.cachedDatasets !== "object") CFG.cachedDatasets = {};
    console.log("[kaggleBridge] ready" + (CFG.KAGGLE_USERNAME ? " (user: " + CFG.KAGGLE_USERNAME + ")" : " (not configured)"));
}

// v696 — accessors for the per-template Kaggle-Dataset slug map. The slug
// format is "username/dataset-name" (the same form Kaggle uses everywhere).
// Setting a value to empty/null clears that template's cache association.
function getCachedDatasets() {
    return { cachedDatasets: { ...(CFG.cachedDatasets || {}) }, knownTemplates: Object.keys(TEMPLATES) };
}
function setCachedDataset({ template, slug }) {
    if (!template) return { ok: false, error: "template required" };
    if (!TEMPLATES[template]) return { ok: false, error: "unknown template: " + template };
    if (!CFG.cachedDatasets) CFG.cachedDatasets = {};
    const trimmed = String(slug || "").trim();
    if (trimmed) {
        // Light validation — Kaggle dataset slugs look like "username/name"
        // with lowercase + digits + dashes only.
        if (!/^[a-z0-9][a-z0-9-]{0,79}\/[a-z0-9][a-z0-9-]{0,79}$/i.test(trimmed)) {
            return { ok: false, error: "slug must look like 'username/dataset-name' (lowercase, digits, dashes only)" };
        }
        CFG.cachedDatasets[template] = trimmed;
    } else {
        delete CFG.cachedDatasets[template];
    }
    _saveCfg();
    return { ok: true, template, slug: CFG.cachedDatasets[template] || null };
}

module.exports = { start, status, setConfig, submit, kernelStatus, downloadOutput, fetchLog, listJobs, getCachedDatasets, setCachedDataset };
