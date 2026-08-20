// ============================================================================
// ai/ComfyUIClient.js
//
// Round 170 — Client for ComfyUI, the node-graph workflow engine for
// stable-diffusion-style models. Used in this engine specifically as the
// host for Trellis 2 (Microsoft's image-to-3D model) so we can turn the
// OllamaDiffuser's portrait outputs into actual GLB meshes.
//
// ComfyUI's API differs from Ollama's in shape:
//   - POST /prompt  with { prompt: <workflow_json>, client_id } → { prompt_id }
//   - GET  /history/<prompt_id>  → execution results (poll until present)
//   - GET  /view?filename=...&type=output  → fetch a generated artifact
//   - GET  /system_stats  → liveness probe + GPU/RAM totals
//   - GET  /object_info  → catalog of installed node types + their inputs
//
// All HTTP calls in this file go through the bridge proxy at /comfyui/*
// instead of hitting 127.0.0.1:8188 directly. That avoids CORS issues
// since the engine is served from the bridge (port 8787) and ComfyUI
// lives at a different origin (port 8188). The bridge transparently
// forwards. If the user is running standalone (no bridge), the client
// falls back to direct origin access — works when ComfyUI is configured
// with --enable-cors-header.
//
// API parity with OllamaClient/OllamaDiffuserClient where relevant:
//   - probe()    → boolean reachable
//   - setPaused()/isPaused()
//   - setBaseUrl()
//   - on/off/_emit event hooks
//
// New methods specific to ComfyUI:
//   - listObjectInfo()  → all installed node types + their inputs/outputs
//   - findTrellisNode() → detects the Trellis 2 node name in this install
//   - queueWorkflow(workflow, opts) → submit + wait for completion
//   - runImageToGLB(imageBytes, opts) → high-level Trellis 2 pipeline
//
// Why proxy through the bridge rather than direct: ComfyUI's default
// install doesn't send CORS headers. Without proxy, the browser blocks
// every request. The user would have to know to launch with
// `python main.py --listen 0.0.0.0 --enable-cors-header *`. With the
// proxy, it just works out of the box.
// ============================================================================

const DEFAULT_BASE_URL = "/comfyui";   // proxied via bridge

// Round 202 — Trellis run history. Every call to runImageToGLB pushes
// an entry here so warmup and real runs can be compared visually.
// Kept on window so the memory HUD and the dev console can read it
// without importing this module.
const TRELLIS_HISTORY_CAP = 50;
function _recordTrellisRun(entry) {
    if (typeof window === "undefined") return;
    if (!window.__trellisHistory) window.__trellisHistory = [];
    window.__trellisHistory.push(entry);
    while (window.__trellisHistory.length > TRELLIS_HISTORY_CAP) {
        window.__trellisHistory.shift();
    }
    // Persist a small summary so it survives reload — useful when
    // diagnosing whether warmup helped after a session.
    try {
        const summary = {
            lastWarmupMs:  null,
            lastRealMs:    null,
            warmupCount:   0,
            realCount:     0,
        };
        for (const r of window.__trellisHistory) {
            if (r.warmup) { summary.lastWarmupMs = r.elapsedMs; summary.warmupCount++; }
            else          { summary.lastRealMs   = r.elapsedMs; summary.realCount++; }
        }
        localStorage.setItem("voxelengine.trellisStats", JSON.stringify(summary));
    } catch {}
    const tag = entry.warmup ? "🔥 warmup" : "🎨 trellis";
    const verdict = entry.ok ? "✓" : "✗";
    console.log(`[ComfyUI] ${tag} ${verdict} — ${(entry.elapsedMs / 1000).toFixed(1)}s @ ${entry.settings.resolution}res/${entry.settings.steps}steps${entry.error ? ` (${entry.error})` : ""}`);
}

export class ComfyUIClient {
    constructor(opts = {}) {
        // Allow overriding base URL via constructor, localStorage, or
        // default to the bridge proxy path. A direct URL like
        // "http://127.0.0.1:8188" also works if the user has CORS
        // configured on ComfyUI itself.
        let restored = null;
        try { restored = localStorage.getItem("voxelengine.comfyuiUrl"); } catch {}
        this.baseUrl = (opts.baseUrl ?? restored ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
        this.clientId = opts.clientId ?? this._makeClientId();
        this.available = null;       // tri-state: null=unknown, true=up, false=down
        this._paused = false;
        this._warnedDown = false;
        this._listeners = new Map();
        // Cache the /object_info dump — it can be 1-3MB on installs with
        // many custom nodes, no point fetching repeatedly. Re-fetched on
        // re-probe or explicit refresh.
        this._objectInfoCache = null;
        this._objectInfoFetchedAt = 0;
        // Per-prompt-id activity tracking so pause can abort polling.
        this._activePolls = new Set();
    }

    _makeClientId() {
        // ComfyUI requires a stable client_id per session for websocket
        // matching. We don't use WS yet, but pass a consistent one anyway.
        return "voxelengine-" + Math.random().toString(36).slice(2, 10);
    }

    on(event, fn) {
        if (!this._listeners.has(event)) this._listeners.set(event, new Set());
        this._listeners.get(event).add(fn);
    }
    off(event, fn) {
        this._listeners.get(event)?.delete(fn);
    }
    _emit(event, payload) {
        for (const fn of (this._listeners.get(event) || [])) {
            try { fn(payload); } catch {}
        }
        // v861 — also dispatch ai:activity window event so HeartbeatAvatar
        // can see ComfyUI concurrency. Normalize ComfyUI's event names
        // ("started"/"completed"/"failed"/etc.) into the same vocabulary
        // OllamaClient uses, with source tag "comfyui" to distinguish.
        if (typeof window !== "undefined" && typeof window.CustomEvent === "function") {
            try {
                window.dispatchEvent(new CustomEvent("ai:activity", {
                    detail: {
                        source: "comfyui",
                        event,
                        ...(payload || {}),
                    },
                }));
            } catch {}
        }
    }

    setPaused(b) {
        this._paused = !!b;
    }
    isPaused() { return !!this._paused; }

    setBaseUrl(url) {
        if (!url || typeof url !== "string") return false;
        this.baseUrl = url.replace(/\/+$/, "");
        this.available = null;
        this._warnedDown = false;
        this._objectInfoCache = null;
        try { localStorage.setItem("voxelengine.comfyuiUrl", this.baseUrl); } catch {}
        return true;
    }

    // Liveness probe. Returns true if ComfyUI responds with valid
    // system_stats JSON. Cached in this.available so subsequent calls
    // don't re-probe; clear via setBaseUrl() or new ComfyUIClient().
    async probe(force) {
        if (this._paused) return false;
        const _now = Date.now();
        // v1185 — breaker: skip the fetch while known-down (backoff to 60s) so a
        // dead ComfyUI stops emitting connection-refused noise. force=true probes now.
        if (!force && this._downUntil && _now < this._downUntil) return false;
        try {
            const ctrl = new AbortController();
            const t = setTimeout(() => ctrl.abort(), 4000);
            const r = await fetch(`${this.baseUrl}/system_stats`, { signal: ctrl.signal });
            clearTimeout(t);
            if (!r.ok) { this._comfyDown(`HTTP ${r.status}`); return false; }
            const j = await r.json();
            // system_stats has shape: { system: {...}, devices: [...] }
            this.available = !!j?.system;
            this._lastSystemStats = j;
            this._warnedDown = false;
            this._downUntil = 0; this._downCooldown = 0;
            this._reportSvc(this.available, this.available ? "running" : "no system stats");
            return this.available;
        } catch (e) {
            this._comfyDown("");
            return false;
        }
    }

    _comfyDown(extra) {
        this.available = false;
        if (!this._warnedDown) {
            this._warnedDown = true;
            console.warn(`[ComfyUI] not reachable at ${this.baseUrl}${extra ? " (" + extra + ")" : ""}. Start ComfyUI (default port 8188).`);
        }
        this._downCooldown = Math.min((this._downCooldown || 10000) * 2, 60000);
        this._downUntil = Date.now() + this._downCooldown;
        this._reportSvc(false, "not running", "start ComfyUI (:8188)");
    }

    _reportSvc(ok, reason, hint) { try { if (typeof window !== "undefined" && window.serviceStatus) window.serviceStatus.set("comfyui", { label: "ComfyUI", ok, reason, hint }); } catch (e) {} }

    // The probe call also captures stats — return cached version.
    getSystemStats() { return this._lastSystemStats; }

    // Round 181 — fetch the tail of ComfyUI's on-disk log file via the
    // bridge's /comfyui/log/tail endpoint. Returns the last n lines (or
    // null if the log can't be found — e.g. ComfyUI never started, or
    // the install path isn't what we expected). Used by the bench when
    // the Trellis step fails: instead of telling the user to open
    // notepad and scroll, we surface the tail inline next to the error.
    //
    // The path served is C:\VoxelBAK\ComfyUI_windows_portable\ComfyUI\
    // user\comfyui.log (or whichever path the bridge discovered).
    async fetchLogTail(n = 200) {
        try {
            const r = await fetch(`/comfyui/log/tail?n=${encodeURIComponent(n)}`);
            if (!r.ok) return null;
            const j = await r.json();
            if (!j.ok) return null;
            return j;   // { ok, path, totalLines, returnedLines, lines: [...] }
        } catch {
            return null;
        }
    }

    // Round 194 — POST /interrupt aborts whatever Trellis (or any
    // ComfyUI workflow) is currently running. Used by the bench's
    // Cancel button when a Trellis run is taking too long or the
    // user wants to free up the GPU. The current run path already
    // handles "execution_interrupted" as a non-error completion, so
    // any waiting runTrellis() will resolve cleanly.
    async interrupt() {
        try {
            const r = await fetch(`${this.baseUrl}/interrupt`, { method: "POST" });
            if (r.ok) {
                console.log("[ComfyUI] interrupt sent");
                return true;
            }
            console.warn(`[ComfyUI] interrupt returned HTTP ${r.status}`);
        } catch (e) {
            console.warn(`[ComfyUI] interrupt failed:`, e?.message || e);
        }
        return false;
    }

    // Fetch the full object_info dump. This catalogs every installed
    // node type, including custom ones. We use it to discover what
    // Trellis nodes are present (could be "TRELLIS2 Image to 3D",
    // "TrellisPipeline", or any of a half-dozen names depending on
    // which custom-nodes pack the user installed).
    //
    // The dump can be large (1-3MB) so it's cached with a TTL.
    async listObjectInfo(opts = {}) {
        const ttl = opts.ttlMs ?? 60_000;
        if (this._objectInfoCache && (Date.now() - this._objectInfoFetchedAt) < ttl) {
            return this._objectInfoCache;
        }
        try {
            const r = await fetch(`${this.baseUrl}/object_info`);
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            const j = await r.json();
            this._objectInfoCache = j;
            this._objectInfoFetchedAt = Date.now();
            return j;
        } catch (e) {
            console.warn(`[ComfyUI] listObjectInfo failed: ${e.message}`);
            return null;
        }
    }

    // Round 170 — discover what the user's actual Trellis node is called.
    // The community has shipped several wrappers under different names:
    //   - PozzettiAndrea/ComfyUI-TRELLIS   →  "TrellisLoader", "TrellisGen3D"
    //   - vidiotsneverdie/ComfyUI-TRELLIS  →  "TRELLIS2_ImageTo3D"
    //   - kijai/ComfyUI-Trellis            →  "TrellisPipelineLoader", etc.
    //   - IF-AI/ComfyUI-Trellis2-main      →  "Trellis2MeshWithVoxelGenerator"
    //                                         + 60+ other Trellis2* nodes
    //                                         all categorized "Trellis2Wrapper"
    //
    // Round 172 update — the IF-AI fork has the most thorough node set
    // and is what this user has installed. Its entry point is
    // "Trellis2MeshWithVoxelGenerator" (takes IMAGE, returns
    // MESHWITHVOXEL + BVH). To actually get a usable mesh out we'd then
    // call Trellis2MeshWithVoxelToTrimesh + Trellis2ExportMesh — but
    // that's a multi-stage workflow problem, separate from discovery.
    //
    // Tiered match — prefer high-level "do everything" nodes over
    // decomposed steps so callers don't have to wire multi-stage
    // workflows themselves:
    //   Tier 1: explicit Image-to-3D / ImageTo3D nodes
    //   Tier 2: "MeshWithVoxelGenerator" / "MeshGenerator" family,
    //           preferring the basic variant over advanced/cascade/MV
    //   Tier 3: anything else with "trellis" in the name
    async findTrellisNode() {
        const info = await this.listObjectInfo();
        if (!info) return null;
        const names = Object.keys(info);
        // Tier 1
        let pick = names.find(n =>
            /trellis/i.test(n) && /image.*3d|image_to_3d|imageto3d/i.test(n));
        if (pick) return { name: pick, spec: info[pick] };
        // Tier 2 — basic generator. Exclude variants that have
        // additional setup (advanced/cascade/multiview/refiner)
        pick = names.find(n =>
            /trellis/i.test(n)
            && /meshwithvoxel.*generator|mesh.*generator|gen.*mesh/i.test(n)
            && !/advanced|cascade|multiview|refiner/i.test(n));
        if (pick) return { name: pick, spec: info[pick] };
        // Tier 3 — fallback
        pick = names.find(n => /trellis/i.test(n));
        if (pick) return { name: pick, spec: info[pick] };
        return null;
    }

    // Round 170 — list all loadable GGUF / Diffusion model files known
    // to ComfyUI. Returns the values offered by typical loader nodes
    // (UnetLoaderGGUF, CheckpointLoaderSimple). Useful for the panel's
    // "what's installed in ComfyUI" view.
    async listInstalledModels() {
        const info = await this.listObjectInfo();
        if (!info) return { unet: [], checkpoints: [], vae: [], loras: [] };
        const out = { unet: [], checkpoints: [], vae: [], loras: [] };
        // UNet GGUF loader
        const ugguf = info["UnetLoaderGGUF"]
                   ?? info["Unet Loader (GGUF)"];
        if (ugguf?.input?.required?.unet_name) {
            const v = ugguf.input.required.unet_name[0];
            if (Array.isArray(v)) out.unet = v;
        }
        // Checkpoint loader
        const cp = info["CheckpointLoaderSimple"];
        if (cp?.input?.required?.ckpt_name) {
            const v = cp.input.required.ckpt_name[0];
            if (Array.isArray(v)) out.checkpoints = v;
        }
        // VAE
        const vae = info["VAELoader"];
        if (vae?.input?.required?.vae_name) {
            const v = vae.input.required.vae_name[0];
            if (Array.isArray(v)) out.vae = v;
        }
        // LoRA
        const lora = info["LoraLoader"];
        if (lora?.input?.required?.lora_name) {
            const v = lora.input.required.lora_name[0];
            if (Array.isArray(v)) out.loras = v;
        }
        return out;
    }

    // Submit a workflow to ComfyUI's queue. The workflow is a JSON object
    // matching ComfyUI's prompt graph format. Returns the prompt_id used
    // for status tracking. Caller polls pollHistory() until results appear.
    async queueWorkflow(workflow, opts = {}) {
        if (this._paused) return null;
        try {
            const r = await fetch(`${this.baseUrl}/prompt`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    prompt: workflow,
                    client_id: opts.clientId ?? this.clientId,
                }),
            });
            if (!r.ok) {
                // Round 180 — ComfyUI returns structured errors on 400.
                // The body is JSON with `error` + `node_errors` keys.
                // Surface the node-level breakdown so callers can show
                // "Trellis2LoadModel: value_not_in_list (model: 'unknown' not in [...])"
                // instead of just "HTTP 400".
                let parsed = null;
                try { parsed = JSON.parse(await r.text()); } catch {}
                if (parsed?.node_errors) {
                    throw new Error(this._formatNodeErrors(parsed, workflow));
                }
                throw new Error(`HTTP ${r.status}${parsed?.error?.message ? ": " + parsed.error.message : ""}`);
            }
            const j = await r.json();
            if (j.error) {
                if (j.node_errors) throw new Error(this._formatNodeErrors(j, workflow));
                throw new Error(`ComfyUI: ${JSON.stringify(j.error).slice(0, 300)}`);
            }
            return j.prompt_id;
        } catch (e) {
            console.warn(`[ComfyUI] queueWorkflow failed: ${e.message}`);
            this._emit("failed", { reason: e.message });
            return null;
        }
    }

    // Round 180 — format a ComfyUI structured-error response into a
    // human-readable message. The shape is:
    //   { error: {type, message, details, extra_info},
    //     node_errors: { "nodeId": {
    //         class_type: "Trellis2LoadModel",
    //         errors: [{ type, message, details, extra_info }, ...],
    //     }}}
    // We surface up to the first 3 node errors with class_type +
    // the most specific text we can extract.
    _formatNodeErrors(payload, workflow) {
        const parts = [];
        const nodeErrors = payload.node_errors || {};
        const ids = Object.keys(nodeErrors).slice(0, 3);
        for (const id of ids) {
            const ne = nodeErrors[id];
            const cls = ne.class_type
                ?? workflow?.[id]?.class_type
                ?? "?";
            const first = ne.errors?.[0];
            const detail = first?.details || first?.message || first?.type || "unknown error";
            parts.push(`node ${id} (${cls}): ${detail}`);
        }
        const overflow = Object.keys(nodeErrors).length - parts.length;
        if (overflow > 0) parts.push(`(+${overflow} more)`);
        const topLevel = payload.error?.message || payload.error?.type;
        return (topLevel ? topLevel + " — " : "") + parts.join(" · ");
    }

    // Poll /history/{prompt_id} until the workflow finishes (or fails).
    // ComfyUI returns the prompt_id in /history once execution completes;
    // before that, the key is absent. We poll every 1s with a generous
    // total budget (Trellis 2 on a 1070 Ti can take 5-15 minutes).
    async pollHistory(promptId, opts = {}) {
        if (!promptId) return null;
        const intervalMs   = opts.intervalMs ?? 1500;
        const maxWaitMs    = opts.maxWaitMs  ?? 15 * 60 * 1000;
        const start = Date.now();
        const onProgress = opts.onProgress || (() => {});
        this._activePolls.add(promptId);
        try {
            let lastTick = 0;
            while (true) {
                if (this._paused) return null;
                const elapsed = Date.now() - start;
                if (elapsed > maxWaitMs) {
                    console.warn(`[ComfyUI] poll timeout after ${(elapsed/1000).toFixed(0)}s for prompt ${promptId}`);
                    return null;
                }
                // Throttled progress callbacks (every ~2s) so UI can
                // show elapsed time without hammering the function.
                if (Date.now() - lastTick > 2000) {
                    onProgress({ elapsedMs: elapsed, promptId });
                    lastTick = Date.now();
                }
                try {
                    const r = await fetch(`${this.baseUrl}/history/${promptId}`);
                    if (r.ok) {
                        const j = await r.json();
                        const entry = j?.[promptId];
                        if (entry) {
                            // Done — return the full history entry. Outputs
                            // live in entry.outputs, keyed by node_id, each
                            // containing { images: [...], gltf: [...], etc. }
                            return entry;
                        }
                    }
                } catch { /* keep polling */ }
                await new Promise(r => setTimeout(r, intervalMs));
            }
        } finally {
            this._activePolls.delete(promptId);
        }
    }

    // Round 180 — execution-error extractor. ComfyUI history entries
    // include a `status.messages` array of [type, payload] tuples.
    // The interesting types here are:
    //   - "execution_error"  → traceback + node info from a Python exception
    //   - "execution_interrupted" → user cancelled (not really an error)
    // Returns a human-readable string or null if no error found.
    _extractExecutionError(entry) {
        const messages = entry?.status?.messages || [];
        for (const m of messages) {
            const [type, payload] = m;
            if (type === "execution_error" && payload) {
                const nodeType = payload.node_type ?? "?";
                const nodeId   = payload.node_id ?? "?";
                const exType   = payload.exception_type ?? "Exception";
                const exMsg    = payload.exception_message ?? "(no message)";
                // Try to extract a useful nodes.py hint. Tracebacks
                // are arrays of frame strings; the last one with
                // "nodes.py" or "ComfyUI-Trellis" in it is usually
                // the one the user can act on.
                let pyHint = "";
                const traceback = Array.isArray(payload.traceback) ? payload.traceback : [];
                for (let i = traceback.length - 1; i >= 0; i--) {
                    const line = String(traceback[i]);
                    const m = line.match(/File "([^"]*nodes\.py)", line (\d+)/);
                    if (m) {
                        // Shorten the path — show the last 2 components
                        const parts = m[1].split(/[\\/]/);
                        const shortPath = parts.slice(-2).join("/");
                        pyHint = ` [${shortPath}:${m[2]}]`;
                        break;
                    }
                }
                return `${nodeType} (node ${nodeId}) raised ${exType}: ${exMsg}${pyHint}`;
            }
        }
        return null;
    }

    // Convenience: build a fetch URL for an artifact ComfyUI generated
    // (image, mesh, etc). Workflow history entries reference outputs by
    // filename + subfolder + type ("output", "temp", "input").
    artifactUrl({ filename, subfolder = "", type = "output" }) {
        const q = new URLSearchParams({ filename, subfolder, type });
        return `${this.baseUrl}/view?${q.toString()}`;
    }

    // High-level helper: take an image (as a File/Blob), upload it,
    // then run the discovered Trellis node and return the GLB artifact
    // URL. Returns null if Trellis isn't installed or generation fails.
    //
    // Note: this builds a MINIMAL workflow. The user can override with
    // a full workflow JSON via opts.workflow if their Trellis variant
    // needs specific params (resolution, steps, low_vram, etc.).
    // Round 202 — public entry point with timing instrumentation.
    // Wraps the original implementation so every Trellis run (warmup
    // or real) gets recorded into window.__trellisHistory. The bench
    // and live pipeline pick up the tracking for free. Pass
    // opts._warmup = true from the warmup module to tag those runs
    // distinctly in the history.
    async runImageToGLB(imageBlob, opts = {}) {
        const start = (typeof performance !== "undefined" ? performance.now() : Date.now());
        const isWarmup = !!opts._warmup;
        const settings = {
            resolution: opts.resolution ?? 512,
            steps:      opts.steps      ?? 25,
            lowVRAM:    opts.lowVRAM    ?? true,
        };
        let result = null, error = null;
        try {
            result = await this._runImageToGLBImpl(imageBlob, opts);
            return result;
        } catch (e) {
            error = e?.message || String(e);
            throw e;
        } finally {
            const elapsedMs = Math.round(
                (typeof performance !== "undefined" ? performance.now() : Date.now()) - start
            );
            try {
                _recordTrellisRun({
                    ts:        Date.now(),
                    elapsedMs,
                    ok:        result != null,
                    error,
                    settings,
                    warmup:    isWarmup,
                });
            } catch {}
        }
    }

    // --- v468 helpers -------------------------------------------------------

    // Decode a data: URL into a Blob (browser-only; atob may be absent in
    // Node, but these run live in the engine, not the test harness).
    _dataUrlToBlob(dataUrl) {
        try {
            const [head, b64] = String(dataUrl).split(",");
            if (!b64) return null;
            const mime = (head.match(/data:([^;]+)/) || [])[1] || "image/png";
            const bin = atob(b64);
            const arr = new Uint8Array(bin.length);
            for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
            return new Blob([arr], { type: mime });
        } catch { return null; }
    }

    // v468 — the live pipeline + bench have always CALLED runTrellis(dataUrl,
    // info, opts) but the method never existed; only runImageToGLB(blob, opts)
    // did, so the Trellis stage threw "runTrellis is not a function" every
    // time, regardless of whether ComfyUI was up. This is the convenience
    // wrapper those call sites expected: dataURL in, GLB out. `trellisInfo`
    // is advisory — runImageToGLB rediscovers the node + builds the workflow.
    async runTrellis(albedoDataUrl, trellisInfo, opts = {}) {
        const blob = this._dataUrlToBlob(albedoDataUrl);
        if (!blob) throw new Error("Trellis: could not decode albedo data URL");
        const glb = await this.runImageToGLB(blob, opts);
        if (!glb?.url) throw new Error("Trellis returned no GLB url");
        return glb;
    }

    // v468 — HiTem3D (Hi3D) is a ComfyUI custom node too (the
    // GeekatplayStudio/comfyui-hitem3d wrapper, which calls the HiTem3D Open
    // Platform API server-side). Discover its node the same tiered way as
    // Trellis. Matches hitem3d / hi3d / sparc3d / ultra3d node names.
    async findHitem3dNode() {
        const info = await this.listObjectInfo();
        if (!info) return null;
        const names = Object.keys(info);
        let pick = names.find(n =>
            /(hitem3d|hi3d|sparc3d|ultra3d)/i.test(n)
            && /(image.*3d|to.?3d|mesh|gen)/i.test(n));
        if (pick) return { name: pick, spec: info[pick] };
        pick = names.find(n => /(hitem3d|hi3d|sparc3d|ultra3d)/i.test(n));
        if (pick) return { name: pick, spec: info[pick] };
        return null;
    }

    // v468 — generic single-node image→3D workflow: LoadImage feeds the
    // target node's first IMAGE input; every other REQUIRED scalar gets its
    // spec default (enums take the first option). Node-typed required inputs
    // we can't satisfy generically are left unset — if the node truly needs
    // them the run errors out and the optional stage degrades to OBJ. Good
    // enough to drive a typical image-in / mesh-out wrapper like HiTem3D.
    _buildGenericImageTo3DWorkflow({ imageFilename, nodeType, nodeSpec }) {
        if (!nodeType || !nodeSpec) return null;
        const required = (nodeSpec.input && nodeSpec.input.required) || {};
        const node = { class_type: nodeType, inputs: {} };
        let imageInput = null;
        for (const [inName, def] of Object.entries(required)) {
            const t    = Array.isArray(def) ? def[0] : def;
            const meta = (Array.isArray(def) && def[1]) ? def[1] : {};
            if (t === "IMAGE" && !imageInput) { imageInput = inName; node.inputs[inName] = ["1", 0]; continue; }
            if (Array.isArray(t)) { node.inputs[inName] = t[0]; }                     // enum → first option
            else if (meta.default !== undefined) { node.inputs[inName] = meta.default; }
            else if (t === "INT")     { node.inputs[inName] = 0; }
            else if (t === "FLOAT")   { node.inputs[inName] = 0.0; }
            else if (t === "STRING")  { node.inputs[inName] = ""; }
            else if (t === "BOOLEAN") { node.inputs[inName] = false; }
            // else: a node-typed input we can't fabricate — leave it out.
        }
        if (!imageInput) return null;   // not an image-driven node
        return {
            "1": { class_type: "LoadImage", inputs: { image: imageFilename } },
            "2": node,
        };
    }

    // v468 — HiTem3D runner, parallel to runTrellis. dataURL in, GLB out.
    // Reuses the same upload → queue → poll → GLB-scan machinery via
    // runImageToGLB(opts.workflow), just targeting the HiTem3D node.
    async runHitem3d(albedoDataUrl, hitemInfo, opts = {}) {
        const blob = this._dataUrlToBlob(albedoDataUrl);
        if (!blob) throw new Error("HiTem3D: could not decode albedo data URL");
        const info = hitemInfo || await this.findHitem3dNode();
        if (!info) throw new Error("HiTem3D node not found (install comfyui-hitem3d)");
        const fname = `hitem3d-${Date.now()}.png`;
        const workflow = this._buildGenericImageTo3DWorkflow({
            imageFilename: fname, nodeType: info.name, nodeSpec: info.spec,
        });
        if (!workflow) throw new Error(`HiTem3D node "${info.name}" exposes no IMAGE input — cannot drive generically`);
        const glb = await this.runImageToGLB(blob, { ...opts, workflow, filename: fname });
        if (!glb?.url) throw new Error("HiTem3D returned no GLB url");
        return glb;
    }

    async _runImageToGLBImpl(imageBlob, opts = {}) {
        if (this._paused) return null;
        // Round 180 — clear any stale error from a previous call so
        // callers checking `lastError` after a successful run see
        // null rather than an old failure's message.
        this.lastError = null;
        // 1. Upload image
        const uploadName = opts.filename ?? `engine-${Date.now()}.png`;
        const uploaded = await this.uploadImage(imageBlob, uploadName);
        if (!uploaded) return null;

        // 2. Build workflow targeting the discovered Trellis node. We
        // pass the full object_info dump in so the IF-AI multi-node
        // builder can verify all required nodes are present.
        const trellis = await this.findTrellisNode();
        if (!trellis) {
            console.warn("[ComfyUI] no Trellis node found. Install ComfyUI-TRELLIS or similar.");
            return null;
        }
        const allObjectInfo = await this.listObjectInfo();
        let workflow = opts.workflow;
        if (!workflow) {
            workflow = this._buildMinimalImageToGLBWorkflow({
                imageFilename:   uploaded.name,
                trellisNodeType: trellis.name,
                trellisSpec:     trellis.spec,
                resolution:      opts.resolution ?? 512,
                steps:           opts.steps ?? 25,
                lowVRAM:         opts.lowVRAM ?? true,
                allObjectInfo,
            });
            if (!workflow) {
                console.warn("[ComfyUI] workflow construction failed — missing required Trellis2 nodes.");
                return null;
            }
        }

        // Round 174 — strip the non-spec _predictedFilename hints
        // from each node before submitting; they'd confuse ComfyUI's
        // validator. Keep a copy so we can read them after the run.
        const predictedFiles = [];
        const cleanWorkflow = {};
        for (const [nodeId, node] of Object.entries(workflow)) {
            const cleanNode = { class_type: node.class_type, inputs: node.inputs };
            cleanWorkflow[nodeId] = cleanNode;
            if (node._predictedFilename) {
                predictedFiles.push({
                    nodeId,
                    filename:  node._predictedFilename,
                    subfolder: node._predictedSubfolder ?? "",
                });
            }
        }

        // 3. Queue
        const promptId = await this.queueWorkflow(cleanWorkflow);
        if (!promptId) return null;

        // 4. Poll until done
        const entry = await this.pollHistory(promptId, {
            onProgress: opts.onProgress,
            maxWaitMs:  opts.maxWaitMs ?? 15 * 60 * 1000,
        });
        if (!entry) return null;

        // Round 180 — check for execution errors in the history entry.
        // ComfyUI logs Python tracebacks here when a node throws. Bench
        // sees these as "no GLB output" without the cause, so surface
        // the node-level error with class_type so the user knows where
        // to look in nodes.py.
        const execErr = this._extractExecutionError(entry);
        if (execErr) {
            // Attach to a side channel — runImageToGLB returns null,
            // and bench reads .lastError to display the cue.
            this.lastError = execErr;
            console.warn(`[ComfyUI] execution error: ${execErr}`);
            return null;
        }

        // 5. Find the GLB artifact.
        // Strategy A — history outputs key on GLB-like field names
        // (kijai's fork emits this). Cover the common ones.
        const outputs = entry.outputs || {};
        for (const nodeId of Object.keys(outputs)) {
            const out = outputs[nodeId];
            for (const key of ["gltf", "glb", "mesh", "model_3d", "3d"]) {
                if (Array.isArray(out[key]) && out[key].length > 0) {
                    const a = out[key][0];
                    return { url: this.artifactUrl(a), nodeId, promptId, artifact: a };
                }
            }
        }
        // Strategy B — IF-AI's Trellis2ExportMesh returns STRING paths
        // rather than emitting GLB metadata. Use the filename we
        // predicted when building the workflow (ComfyUI's
        // get_save_image_path produces deterministic counters when the
        // prefix is unique).
        for (const pf of predictedFiles) {
            const candidate = { filename: pf.filename, subfolder: pf.subfolder, type: "output" };
            const url = this.artifactUrl(candidate);
            // HEAD the URL to confirm the file exists; if it does we
            // return immediately. If not we fall through to a more
            // forgiving search by enumerating likely counter values.
            try {
                const r = await fetch(url, { method: "HEAD" });
                if (r.ok) {
                    return { url, nodeId: pf.nodeId, promptId, artifact: candidate };
                }
            } catch { /* try counter sweep */ }
            // Counter sweep — 00001 should be right but ComfyUI may
            // have already used that prefix on a prior failed run, so
            // try the first 10 counters in sequence.
            const base = pf.filename.replace(/_(\d{5})_\.glb$/, "");
            for (let i = 1; i <= 10; i++) {
                const counter = String(i).padStart(5, "0");
                const fn = `${base}_${counter}_.glb`;
                const c2 = { filename: fn, subfolder: pf.subfolder, type: "output" };
                const u2 = this.artifactUrl(c2);
                try {
                    const r2 = await fetch(u2, { method: "HEAD" });
                    if (r2.ok) {
                        return { url: u2, nodeId: pf.nodeId, promptId, artifact: c2 };
                    }
                } catch {}
            }
        }
        console.warn("[ComfyUI] workflow completed but no GLB output found via history or predicted-path probes.");
        return null;
    }

    async uploadImage(blob, filename = "engine.png") {
        try {
            const form = new FormData();
            form.append("image", blob, filename);
            form.append("overwrite", "true");
            const r = await fetch(`${this.baseUrl}/upload/image`, {
                method: "POST",
                body: form,
            });
            if (!r.ok) {
                throw new Error(`HTTP ${r.status}`);
            }
            const j = await r.json();
            // Response is { name: filename, subfolder, type }
            return j;
        } catch (e) {
            console.warn(`[ComfyUI] uploadImage failed: ${e.message}`);
            return null;
        }
    }

    // Build a minimal workflow JSON that:
    //   - Loads the uploaded image
    //   - Pipes through the discovered Trellis node
    //   - Saves the GLB output
    //
    // This is intentionally bare-bones because we don't know the exact
    // input/output names for every Trellis fork. We inspect trellisSpec
    // to find the image input + GLB output, and wire those. If the user
    // has a more elaborate workflow (background removal, multi-view,
    // mesh simplification), they should pass it via opts.workflow.
    // Build a workflow JSON for image → GLB. The fork detection done
    // upstream tells us which Trellis node was found; here we shape the
    // graph based on whether that node needs a separate "load model"
    // step or runs end-to-end on its own.
    //
    // Round 174 — IF-AI/ComfyUI-Trellis2 case (the one the user has
    // installed). That fork's generator (`Trellis2MeshWithVoxelGenerator`)
    // requires a `pipeline` input of type TRELLIS2PIPELINE, which is
    // the output of `Trellis2LoadModel`. So the workflow is:
    //
    //     LoadImage ─┐
    //                ▼
    //   Trellis2LoadModel ─→ Trellis2MeshWithVoxelGenerator
    //                                    │
    //                                    ▼
    //                       Trellis2MeshWithVoxelToTrimesh
    //                                    │
    //                                    ▼
    //                          Trellis2ExportMesh (glb)
    //
    // For 8GB VRAM (1070 Ti / 1080 / 2070) we pick:
    //   - pipeline_type "512" (smallest, fits in budget)
    //   - low_vram = True
    //   - conv_backend = "spconv" (avoids flex_gemm install — flex_gemm
    //     needs C++ build tools and the deal isn't worth it)
    //   - backend = "sdpa" (works without flash_attn / xformers)
    //   - sparse_backend = "xformers" (most installs have it)
    //
    // For other forks that have a one-shot Image-to-3D node (kijai's
    // TrellisPipelineLoader+Sample, or PozzettiAndrea's combined
    // generator), we fall back to a simpler graph that just wires
    // LoadImage → TrellisNode.
    _buildMinimalImageToGLBWorkflow({
        imageFilename, trellisNodeType, trellisSpec,
        resolution, steps, lowVRAM, allObjectInfo,
    }) {
        const inputs = trellisSpec?.input?.required ?? {};
        // Detect the IF-AI fork: its generator requires a TRELLIS2PIPELINE
        // input. The presence of that input type is the unambiguous signal.
        const needsPipelineLoader = Object.values(inputs).some(v =>
            Array.isArray(v) && v[0] === "TRELLIS2PIPELINE");
        if (needsPipelineLoader) {
            return this._buildIFAITrellis2Workflow({
                imageFilename, generatorNode: trellisNodeType,
                resolution, allObjectInfo,
            });
        }
        // Fallback for one-shot forks
        return this._buildSimpleImageToGLBWorkflow({
            imageFilename, trellisNodeType, trellisSpec,
            resolution, steps, lowVRAM,
        });
    }

    // The IF-AI fork's 5-node workflow. Includes safety checks: if a
    // required node (LoadModel, ToTrimesh, ExportMesh) isn't present
    // in object_info, we return null so the caller can surface a clear
    // error message instead of submitting a workflow ComfyUI will reject.
    _buildIFAITrellis2Workflow({
        imageFilename, generatorNode, resolution, allObjectInfo,
    }) {
        const want = ["Trellis2LoadModel", "Trellis2MeshWithVoxelToTrimesh", "Trellis2ExportMesh"];
        const missing = want.filter(n => allObjectInfo && !allObjectInfo[n]);
        if (missing.length > 0) {
            console.warn(`[ComfyUI] IF-AI Trellis2 fork detected but missing nodes: ${missing.join(", ")}`);
            return null;
        }
        // Pipeline type — for 8GB we always pick the smallest. The
        // "512" string is correct here (the node spec lists it as a
        // string-valued enum, not an int).
        const pipelineType = "512";
        // Unique filename prefix so the resulting GLB is easy to find
        // in /output. ComfyUI's get_save_image_path() starts the
        // counter at 00001 for never-before-seen prefixes, so we know
        // the final file lives at output/3D/bench_<ts>_00001_.glb.
        const ts = Date.now();
        const filenamePrefix = `3D/bench_${ts}`;
        return {
            // ---- 1. Load the input image
            "1": {
                class_type: "LoadImage",
                inputs: { image: imageFilename, choose_file_to_upload: "image" },
            },
            // ---- 2. Load the Trellis pipeline (model weights, etc.)
            // First run pulls microsoft/TRELLIS.2-4B from HuggingFace,
            // which is several GB. Subsequent runs are fast since the
            // pack saves a HuggingFace cache locally.
            "2": {
                class_type: "Trellis2LoadModel",
                inputs: {
                    modelname:           "microsoft/TRELLIS.2-4B",
                    backend:             "sdpa",       // no flash_attn dep
                    device:              "cuda",
                    low_vram:            true,
                    keep_models_loaded:  true,
                    conv_backend:        "spconv",     // not flex_gemm
                    sparse_backend:      "xformers",
                    use_reconviagen:     false,
                },
            },
            // ---- 3. The actual image-to-3D generator. Wires the
            // pipeline output of node 2 + the image output of node 1.
            // The unusual params I'm setting reflect what the spec
            // exposes; sticking close to defaults except for low-VRAM
            // overrides.
            "3": {
                class_type: generatorNode,    // "Trellis2MeshWithVoxelGenerator"
                inputs: {
                    pipeline:                    ["2", 0],
                    image:                       ["1", 0],
                    seed:                        0,
                    pipeline_type:               pipelineType,
                    sparse_structure_steps:      12,
                    shape_steps:                 12,
                    texture_steps:               12,
                    max_num_tokens:              49152,
                    max_views:                   1,
                    sparse_structure_resolution: 32,
                    generate_texture_slat:       true,
                    use_tiled_decoder:           true,
                    sampler:                     "euler",
                    fill_holes:                  true,
                    hole_iterations:             1,
                    hole_fill_algorithm:         "flood_fill",
                    keep_only_shell:             true,
                },
            },
            // ---- 4. Convert the voxel mesh to a Trimesh (so export
            // gives us a real GLB rather than the wrapper format).
            "4": {
                class_type: "Trellis2MeshWithVoxelToTrimesh",
                inputs: {
                    mesh:               ["3", 0],
                    reorient_vertices:  "90 degrees",   // GLB convention
                },
            },
            // ---- 5. Export to disk as GLB. The output appears at
            // ComfyUI/output/3D/bench_<ts>_00001_.glb which we then
            // fetch over the proxy.
            "5": {
                class_type: "Trellis2ExportMesh",
                inputs: {
                    trimesh:         ["4", 0],
                    filename_prefix: filenamePrefix,
                    file_format:     "glb",
                },
                // Stash the predicted filename in a non-spec field so
                // runImageToGLB can read it back. ComfyUI ignores
                // unknown keys at the top level of a node entry, so
                // this is safe.
                _predictedFilename: `bench_${ts}_00001_.glb`,
                _predictedSubfolder: "3D",
            },
        };
    }

    // Fallback workflow builder for forks that expose a single
    // "do everything" node (kijai's pipeline-based fork, etc.).
    // Same as the v170 minimal builder.
    _buildSimpleImageToGLBWorkflow({
        imageFilename, trellisNodeType, trellisSpec,
        resolution, steps, lowVRAM,
    }) {
        const inputs = trellisSpec?.input?.required ?? {};
        const imageInputKey = Object.keys(inputs).find(k =>
            /^image[s]?$|input_image|ref_image/i.test(k)) ?? "image";
        return {
            "1": {
                class_type: "LoadImage",
                inputs: { image: imageFilename },
            },
            "2": {
                class_type: trellisNodeType,
                inputs: {
                    [imageInputKey]: ["1", 0],
                    ...(inputs.width      ? { width: resolution } : {}),
                    ...(inputs.height     ? { height: resolution } : {}),
                    ...(inputs.resolution ? { resolution } : {}),
                    ...(inputs.steps      ? { steps } : {}),
                    ...(inputs.num_inference_steps ? { num_inference_steps: steps } : {}),
                    ...(inputs.low_vram   ? { low_vram: lowVRAM } : {}),
                    ...(inputs.low_vram_mode ? { low_vram_mode: lowVRAM } : {}),
                },
            },
        };
    }
}
