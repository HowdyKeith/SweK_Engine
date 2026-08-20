// =============================================================================
// FILE: /ai/ColdStartPrimer.js
// ROUND: 186
// =============================================================================
//
// Parallel cold-start warmup for the local AI services. Fired at engine boot
// so the FIRST real call from the bench / engine doesn't pay the model-load
// cost (which on a 1070 Ti is ~30-60s for the OBJ model + ~minute for the
// diffuser the first time).
//
// What "warmup" actually means per service:
//
//   - Ollama:   POST /api/generate with num_predict=1 against each named model.
//               Ollama loads the model into RAM/VRAM as a side effect of the
//               first generate call, regardless of how short the request is.
//               Multiple models warmed concurrently; Ollama's scheduler
//               decides what fits in VRAM. On 8GB cards with a 7B-ish OBJ
//               model + a 4B narrative model, the second probably runs partly
//               on CPU — still better than starting fully cold.
//
//   - Diffuser: POST /api/generate at 64x64, steps=1. Forces the diffuser to
//               load the checkpoint. Expensive (~10-30s on first call) so
//               gated behind opt-in: localStorage voxelengine.coldStartDiffuser
//               = "1". Default off because the warmup uses GPU that might
//               contend with Ollama's model load.
//
//   - ComfyUI: NOT warmed here. The /comfyui/* proxy is already reachable
//              via the auto-start IIFE; the slow part is Trellis2LoadModel
//              which only loads when a workflow runs. Trellis warmup would
//              mean posting a real workflow JSON — belongs in its own round.
//
// Public API:
//   primeOllamaModels(models, opts?)
//     array of model names, fires in parallel, returns array of
//     {model, ok, elapsedMs, error?}
//
//   primeDiffuser(opts?)
//     fires a 1-step 64x64 generation; returns {ok, elapsedMs, error?}
//
//   primeAll(opts?)
//     convenience wrapper that reads localStorage prefs and dispatches.
//     Returns {ollama: [...], diffuser: ...|null, totalMs, skipped?}.
//
// localStorage controls:
//   voxelengine.coldStartPrime    = "0"  → disable everything
//   voxelengine.coldStartOllama   = "0"  → skip Ollama warmup only
//   voxelengine.coldStartDiffuser = "1"  → opt IN to Diffuser (default off)
//   voxelengine.coldStartModels   = "modelA,modelB"  → override Ollama list
// =============================================================================

const DEFAULT_OLLAMA_URL   = "http://localhost:11434";
const DEFAULT_DIFFUSER_URL = "http://localhost:9000";
const WARMUP_TIMEOUT_MS    = 120 * 1000;   // 2-min cap per request

// ----- Ollama -----

export async function primeOllamaModels(models, opts = {}) {
    const baseUrl   = opts.baseUrl   || DEFAULT_OLLAMA_URL;
    const timeoutMs = opts.timeoutMs || WARMUP_TIMEOUT_MS;
    const unique = [...new Set((models || []).filter(Boolean))];
    if (unique.length === 0) return [];
    // Fire concurrently. Ollama's scheduler handles concurrent loads;
    // if VRAM is tight it'll fall back to CPU for the loser. Still
    // better than serially warming and paying the second model's full
    // cold cost later.
    return Promise.all(unique.map(m => _primeOneOllama(baseUrl, m, timeoutMs)));
}

async function _primeOneOllama(baseUrl, model, timeoutMs) {
    const start = performance.now();
    const ctrl  = new AbortController();
    const t     = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
        const r = await fetch(`${baseUrl}/api/generate`, {
            method:  "POST",
            headers: { "Content-Type": "application/json" },
            // num_predict:1 is the cheapest valid generate. Ollama still
            // has to load the model to predict one token. stream:false
            // collapses the response to a single JSON envelope.
            body: JSON.stringify({
                model,
                prompt: "Hi",
                stream: false,
                options: { num_predict: 1 },
            }),
            signal: ctrl.signal,
        });
        clearTimeout(t);
        const elapsedMs = Math.round(performance.now() - start);
        if (!r.ok) return { model, ok: false, error: `HTTP ${r.status}`, elapsedMs };
        // Drain the body so we know the load actually finished before
        // returning — otherwise Ollama could still be background-loading.
        try { await r.json(); } catch {}
        return { model, ok: true, elapsedMs };
    } catch (e) {
        clearTimeout(t);
        const elapsedMs = Math.round(performance.now() - start);
        const err = e?.name === "AbortError" ? "timeout" : (e?.message || String(e));
        return { model, ok: false, error: err, elapsedMs };
    }
}

// ----- Diffuser -----

export async function primeDiffuser(opts = {}) {
    const baseUrl   = opts.baseUrl   || DEFAULT_DIFFUSER_URL;
    const timeoutMs = opts.timeoutMs || WARMUP_TIMEOUT_MS;
    const start = performance.now();
    const ctrl  = new AbortController();
    const t     = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
        // Tiniest plausible generate — 64×64, 1 step. Body shape mirrors
        // what OllamaDiffuserClient uses for normal generation so the
        // diffuser server doesn't choke on missing fields.
        const r = await fetch(`${baseUrl}/api/generate`, {
            method:  "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                prompt: "test",
                width:  64,
                height: 64,
                steps:  1,
            }),
            signal: ctrl.signal,
        });
        clearTimeout(t);
        const elapsedMs = Math.round(performance.now() - start);
        if (!r.ok) return { ok: false, error: `HTTP ${r.status}`, elapsedMs };
        // Drain body (don't need the image, but the generate must
        // actually complete for subsequent calls to be warm).
        try { await r.arrayBuffer(); } catch {}
        return { ok: true, elapsedMs };
    } catch (e) {
        clearTimeout(t);
        const elapsedMs = Math.round(performance.now() - start);
        const err = e?.name === "AbortError" ? "timeout" : (e?.message || String(e));
        return { ok: false, error: err, elapsedMs };
    }
}

// ----- ComfyUI (Round 201) -----
//
// Pre-warm strategy for ComfyUI is intentionally light: just probe
// reachability and capture the VRAM state. The full "load the Trellis
// model weights" pre-warm would require running a minimal Trellis
// workflow, which takes 5+ minutes on Pascal-class GPUs even at lowest
// settings — too expensive to do unconditionally at boot.
//
// What this DOES provide:
//   • Confirms ComfyUI is reachable before the first user-triggered
//     Trellis run, surfacing config issues in the cold-start log
//   • Captures the baseline VRAM state so the memory HUD has a
//     starting line to compare against
//
// Opt-in for the full Trellis weight pre-warm (sends a 256-res 4-step
// pipeline to force model loading) via voxelengine.coldStartTrellis="1".
// Default off because of the Pascal time cost.

export async function primeComfyUI(opts = {}) {
    const statsUrl  = opts.statsUrl  || "/system/stats";
    const timeoutMs = opts.timeoutMs || WARMUP_TIMEOUT_MS;
    const start = performance.now();
    const ctrl  = new AbortController();
    const t     = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
        const r = await fetch(statsUrl, { signal: ctrl.signal, cache: "no-store" });
        clearTimeout(t);
        const elapsedMs = Math.round(performance.now() - start);
        if (!r.ok) return { ok: false, error: `HTTP ${r.status}`, elapsedMs };
        const json = await r.json();
        const c = json?.comfyui;
        if (!c || c.reachable === false) {
            return { ok: false, error: "comfyui not reachable", elapsedMs, reachable: false };
        }
        return {
            ok: true,
            elapsedMs,
            reachable: true,
            vramFree:  c.vramFree  ?? null,
            vramTotal: c.vramTotal ?? null,
        };
    } catch (e) {
        clearTimeout(t);
        const elapsedMs = Math.round(performance.now() - start);
        const err = e?.name === "AbortError" ? "timeout" : (e?.message || String(e));
        return { ok: false, error: err, elapsedMs };
    }
}

// ----- Trellis pre-warm (Round 202, opt-in) -----
//
// Forces ComfyUI to load all Trellis 2 model weights into VRAM by running
// a full pipeline at the lowest practical settings (resolution=256,
// steps=4). On Pascal-class GPUs this takes ~5-8 minutes — too expensive
// to do unconditionally at boot, so it's gated behind explicit opt-in:
//     localStorage.voxelengine.coldStartTrellis = "1"
// OR by calling primeTrellis() directly from a UI button.
//
// The value is twofold:
//   1. Validates the entire pipeline end-to-end BEFORE the user commits
//      to a 20-min real run. Catches o_voxel / shape_slat_decoder /
//      texture-loading failures during a low-stakes test instead of in
//      the middle of a real generation.
//   2. Models stay loaded in VRAM, so the next real Trellis run skips
//      ~60-90s of model loading (modest savings on Pascal where
//      sampling dominates, but still nice).
//
// Result is persisted to localStorage so the memory HUD and bench can
// reference it: "warmed N min ago, took X min".

const TRELLIS_WARMUP_KEY = "voxelengine.lastTrellisWarmup";

// Build a tiny test image to feed Trellis. Browser-side: canvas 256x256
// with a simple gradient + circle so Trellis has SOMETHING to interpret
// as 3D. Node-side: returns null and primeTrellis short-circuits.
async function _buildWarmupImage() {
    if (typeof document === "undefined") return null;
    try {
        const canvas = document.createElement("canvas");
        canvas.width = 256;
        canvas.height = 256;
        const ctx = canvas.getContext("2d");
        const grad = ctx.createLinearGradient(0, 0, 256, 256);
        grad.addColorStop(0, "#ff8866");
        grad.addColorStop(1, "#66ccff");
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, 256, 256);
        ctx.fillStyle = "#222";
        ctx.beginPath();
        ctx.arc(128, 128, 60, 0, Math.PI * 2);
        ctx.fill();
        // Add a smaller offset circle for asymmetry
        ctx.fillStyle = "#ffd884";
        ctx.beginPath();
        ctx.arc(160, 96, 24, 0, Math.PI * 2);
        ctx.fill();
        return await new Promise(resolve => canvas.toBlob(resolve, "image/png"));
    } catch (e) {
        console.warn("[primeTrellis] couldn't build warmup image:", e?.message || e);
        return null;
    }
}

export async function primeTrellis(opts = {}) {
    const start = performance.now();

    // Caller may inject a ComfyUI client; otherwise import the default one
    let comfyClient = opts.comfyClient;
    if (!comfyClient) {
        try {
            const mod = await import("./ComfyUIClient.js");
            comfyClient = new mod.ComfyUIClient({ baseUrl: opts.baseUrl });
        } catch (e) {
            return { ok: false, error: "couldn't import ComfyUIClient", elapsedMs: Math.round(performance.now() - start) };
        }
    }

    const imageBlob = opts.imageBlob || await _buildWarmupImage();
    if (!imageBlob) {
        return { ok: false, error: "no test image (call from browser context)", elapsedMs: Math.round(performance.now() - start) };
    }

    // Phase timings: tracked via onProgress heartbeats. Each heartbeat
    // gives us elapsedMs since prompt-queued, so phase deltas are
    // computed as (current - previous). Phases inferred from ComfyUI's
    // log lines which we tail via the existing /comfyui/log/tail endpoint.
    const phaseTimings = [];
    const phaseLog = [];
    let lastHeartbeat = 0;
    const onProgress = (info) => {
        phaseLog.push({ elapsedMs: info.elapsedMs, dt: info.elapsedMs - lastHeartbeat });
        lastHeartbeat = info.elapsedMs;
        if (opts.onProgress) opts.onProgress(info);
    };

    let result;
    try {
        result = await comfyClient.runImageToGLB(imageBlob, {
            resolution: opts.resolution ?? 256,    // lowest practical
            steps:      opts.steps      ?? 4,      // minimal sampling
            lowVRAM:    true,
            onProgress,
            maxWaitMs:  opts.maxWaitMs ?? 30 * 60 * 1000,  // 30 min ceiling for Pascal
        });
    } catch (e) {
        const elapsedMs = Math.round(performance.now() - start);
        return { ok: false, error: e?.message || String(e), elapsedMs, phaseLog };
    }

    const elapsedMs = Math.round(performance.now() - start);
    const ok = !!result?.url;

    // Persist for cross-session reference (memory HUD, bench comparison)
    try {
        const record = {
            timestamp:  Date.now(),
            elapsedMs,
            ok,
            resolution: opts.resolution ?? 256,
            steps:      opts.steps ?? 4,
            heartbeats: phaseLog.length,
        };
        localStorage.setItem(TRELLIS_WARMUP_KEY, JSON.stringify(record));
    } catch {}

    return { ok, elapsedMs, phaseLog, glbUrl: result?.url || null };
}

// Read the last persisted warmup result. Returns null if never run or
// if localStorage is unavailable. Used by the memory HUD + bench to
// show comparison baselines.
export function getLastTrellisWarmup() {
    try {
        const raw = localStorage.getItem(TRELLIS_WARMUP_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch { return null; }
}

// ----- Combined entry point -----

export async function primeAll(opts = {}) {
    const start = performance.now();

    const ls = (k, d) => {
        try { return localStorage.getItem(k) ?? d; } catch { return d; }
    };
    if (ls("voxelengine.coldStartPrime", "1") === "0") {
        return { skipped: "voxelengine.coldStartPrime=0", totalMs: 0 };
    }
    const ollamaEnabled   = ls("voxelengine.coldStartOllama", "1")   !== "0";
    const diffuserEnabled = ls("voxelengine.coldStartDiffuser", "0") === "1";
    const comfyEnabled    = ls("voxelengine.coldStartComfyUI", "1")  !== "0";    // Round 201 — default on
    const trellisEnabled  = ls("voxelengine.coldStartTrellis", "0")  === "1";   // Round 202 — opt-in, default OFF

    // Resolve which models to prime. Default = narrative + OBJ from the
    // engine's existing prefs (set by the OllamaClient model picker /
    // AI panel). Override via voxelengine.coldStartModels CSV.
    let models = [];
    const override = ls("voxelengine.coldStartModels", null);
    if (override) {
        models = override.split(",").map(s => s.trim()).filter(Boolean);
    } else {
        const narr = ls("voxelengine.ollamaModel",    "gemma3:4b");
        const obj  = ls("voxelengine.ollamaObjModel", "joshuaokolo/C3Dv0:latest");
        models = [narr, obj].filter(Boolean);
    }

    const tasks = [];
    if (ollamaEnabled && models.length > 0) {
        tasks.push(
            primeOllamaModels(models, opts.ollama || {})
                .then(r => ["ollama", r])
        );
    }
    if (diffuserEnabled) {
        tasks.push(
            primeDiffuser(opts.diffuser || {})
                .then(r => ["diffuser", r])
        );
    }
    if (comfyEnabled) {
        tasks.push(
            primeComfyUI(opts.comfyui || {})
                .then(r => ["comfyui", r])
        );
    }
    if (trellisEnabled) {
        tasks.push(
            primeTrellis(opts.trellis || {})
                .then(r => ["trellis", r])
        );
    }
    if (tasks.length === 0) {
        return { skipped: "all services disabled", totalMs: 0 };
    }

    const settled = await Promise.allSettled(tasks);
    const out = {
        ollama: null,
        diffuser: null,
        comfyui: null,
        trellis: null,
        totalMs: Math.round(performance.now() - start),
    };
    for (const s of settled) {
        if (s.status !== "fulfilled") continue;
        const [tag, result] = s.value;
        out[tag] = result;
    }
    return out;
}

// Pretty-print results to console. Caller passes the object returned by
// primeAll(). Format matches the diffuser/comfyui auto-start log style.
export function logPrimeResults(result, prefix = "[coldstart]") {
    if (result.skipped) {
        console.log(`${prefix} skipped — ${result.skipped}`);
        return;
    }
    const parts = [];
    if (Array.isArray(result.ollama)) {
        for (const r of result.ollama) {
            const sec = (r.elapsedMs / 1000).toFixed(1) + "s";
            parts.push(r.ok
                ? `ollama:${r.model} ✓ ${sec}`
                : `ollama:${r.model} ✗ ${r.error} (${sec})`);
        }
    }
    if (result.diffuser) {
        const sec = (result.diffuser.elapsedMs / 1000).toFixed(1) + "s";
        parts.push(result.diffuser.ok
            ? `diffuser ✓ ${sec}`
            : `diffuser ✗ ${result.diffuser.error} (${sec})`);
    }
    if (result.comfyui) {
        const sec = (result.comfyui.elapsedMs / 1000).toFixed(1) + "s";
        if (result.comfyui.ok) {
            const vramMsg = (result.comfyui.vramTotal != null)
                ? ` (VRAM ${((result.comfyui.vramTotal - result.comfyui.vramFree) / 1024 / 1024 / 1024).toFixed(1)}/${(result.comfyui.vramTotal / 1024 / 1024 / 1024).toFixed(1)} GB used)`
                : "";
            parts.push(`comfyui ✓ ${sec}${vramMsg}`);
        } else {
            parts.push(`comfyui ✗ ${result.comfyui.error} (${sec})`);
        }
    }
    if (result.trellis) {
        const min = (result.trellis.elapsedMs / 60000).toFixed(1) + "min";
        parts.push(result.trellis.ok
            ? `trellis-prewarm ✓ ${min}`
            : `trellis-prewarm ✗ ${result.trellis.error} (${min})`);
    }
    const total = (result.totalMs / 1000).toFixed(1) + "s";
    console.log(`${prefix} done in ${total} — ${parts.join(" · ")}`);
}
