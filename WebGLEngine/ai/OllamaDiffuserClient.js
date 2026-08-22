// ai/OllamaDiffuserClient.js — REST client for OllamaDiffuser.
//
// Mirrors the OllamaClient.js pattern (probe/availability/quiet failure)
// for the local OllamaDiffuser HTTP server, which serves Z-Image-Turbo
// and other diffusion models at http://localhost:8000 by default.
//
// API assumption (validated against OllamaDiffuser 0.x as of May 2026):
//   POST /api/generate
//     Body: { "prompt": "string", "width": 512, "height": 512,
//             "steps": 4, "seed": null|number }
//     Response (JSON): { "image": "base64-encoded-png-bytes" }
//   GET  /api/health   → { "status": "ok", "model": "z-image-turbo" }
//
// If the local OllamaDiffuser returns a different envelope (some forks
// wrap differently), adjust the response-parsing line in _generate().
// The client is otherwise format-agnostic.
//
// CORS: like Ollama, OllamaDiffuser allows localhost:* origins by
// default. For cross-origin serves, start with ALLOW_ORIGINS=*.
//
// Reachability: first failure marks available=false and short-circuits
// subsequent generate() calls to null until probe() succeeds. Same
// quiet-failure pattern as OllamaClient — keeps the loop calm when
// the daemon isn't running.

const DEFAULT_URL    = "http://localhost:9000";   // Round 162: was 8000
const DEFAULT_WIDTH  = 512;
const DEFAULT_HEIGHT = 512;
const DEFAULT_STEPS  = 4;        // Z-Image-Turbo: 4 steps is sweet spot
// Round 162 — CPU inference on stable-diffusion-1.5 takes 30-90s for a
// 512x512 / 20-step image. The old 30s default aborted real generations.
const DEFAULT_TIMEOUT_MS = 600_000;     // 10 min hard ceiling, like Ollama

export class OllamaDiffuserClient {
    constructor(opts = {}) {
        // Round 162 — restore the user's last-used URL so a manual port
        // change in the demo survives reload. opts.baseUrl wins (callers
        // can force a specific URL); next localStorage; then default.
        let restoredUrl = null;
        try { restoredUrl = localStorage.getItem("voxelengine.diffuserUrl"); } catch {}
        this.baseUrl   = opts.baseUrl   ?? restoredUrl ?? DEFAULT_URL;
        // Round 162 — pause flag. The AI Chain demo toggles this on
        // when running so engine-side generate() calls (texture_studio,
        // skybox_gen) return cleanly without competing for the diffuser.
        this._paused = false;
        this.width     = opts.width     ?? DEFAULT_WIDTH;
        this.height    = opts.height    ?? DEFAULT_HEIGHT;
        this.steps     = opts.steps     ?? DEFAULT_STEPS;
        this.timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;

        // Round 159 — restore last-used texture model from localStorage
        // so the user's pick survives reloads. listModels() can change
        // it later if the configured one isn't installed.
        let restored = null;
        try { restored = localStorage.getItem("voxelengine.diffuserModel"); } catch {}
        this.model = opts.model ?? restored ?? null;

        this.available = null;   // null = unknown, true/false = probed
        this.totalCalls = 0;
        this.totalFails = 0;
        this.totalDurationMs = 0;
        this._warned = false;
        // Round 162 — track in-flight AbortControllers so setPaused(true)
        // cancels them. Diffuser generations are LONG (30-90s on CPU),
        // so this matters even more than for Ollama.
        this._activeAborters = new Set();
    }

    // Round 159 — set the active texture/image model and persist it.
    setModel(name) {
        if (!name || typeof name !== "string") return false;
        this.model = name;
        try { localStorage.setItem("voxelengine.diffuserModel", name); } catch {}
        return true;
    }

    // Round 162 — pause/resume + URL/timeout setters for the AI Chain
    // demo. When paused, generate() returns a synthetic "paused" error
    // so engine-side callers (texture_studio, skybox_gen) don't compete
    // for the diffuser while the demo is measuring baselines. Pausing
    // also cancels in-flight requests so a 60s SD generation actually
    // stops, not just blocks new ones.
    setPaused(b) {
        const wasPaused = !!this._paused;
        this._paused = !!b;
        if (this._paused && !wasPaused) {
            for (const ctrl of this._activeAborters) {
                try { ctrl.abort(); } catch {}
            }
            this._activeAborters.clear();
        }
    }
    isPaused()   { return this._paused; }
    setBaseUrl(url) {
        if (!url || typeof url !== "string") return false;
        this.baseUrl = url.replace(/\/+$/, "");
        this.available = null;   // re-probe on next call
        this._warned = false;
        try { localStorage.setItem("voxelengine.diffuserUrl", this.baseUrl); } catch {}
        return true;
    }
    setTimeoutMs(ms) {
        if (!Number.isFinite(ms) || ms <= 0) return false;
        this.timeoutMs = ms;
        return true;
    }

    // Round 159 — list models the diffuser server has loaded/available.
    // OllamaDiffuser exposes them at /api/models (newer builds) or
    // /api/tags (older ones, mirroring Ollama's API). We try both and
    // normalize to [{name, size?}, ...]. Returns [] on any failure.
    async listModels() {
        const tryEndpoints = ["/api/models", "/api/tags"];
        for (const ep of tryEndpoints) {
            try {
                const ctrl = new AbortController();
                const t = setTimeout(() => ctrl.abort(), 2500);
                const r = await fetch(this.baseUrl + ep, { signal: ctrl.signal });
                clearTimeout(t);
                if (!r.ok) continue;
                const j = await r.json();
                // Accept a few common shapes
                let list = null;
                if (Array.isArray(j.models))   list = j.models;
                else if (Array.isArray(j))     list = j;
                else if (Array.isArray(j.tags)) list = j.tags;
                if (!list) continue;
                // Normalize entries
                return list.map(item => {
                    if (typeof item === "string") return { name: item };
                    return { name: item.name ?? item.id ?? "(unnamed)",
                             size: item.size ?? null };
                });
            } catch {
                // try next endpoint
            }
        }
        return [];
    }

    // Lightweight reachability check. Updates this.available.
    async probe(force) {
        const _now = Date.now();
        // v1185 — breaker: while known-down (backoff to 60s), skip the doomed
        // fetch so the browser stops logging connection-refused. generate()'s
        // self-heal passes force=true to bypass it after its 20s warm-up wait.
        if (!force && this._downUntil && _now < this._downUntil) return false;
        try {
            const ctrl = new AbortController();
            const t = setTimeout(() => ctrl.abort(), 2500);
            const r = await fetch(this.baseUrl + "/api/health", {
                method: "GET",
                signal: ctrl.signal,
            });
            clearTimeout(t);
            if (r.ok) {
                this.available = true;
                this._warned = false;
                this._unavailableSince = 0;
                this._downUntil = 0; this._downCooldown = 0;
                this._reportSvc(true, "running");
                return true;
            }
        } catch (e) {
            // fall through
        }
        if (!this._warned) {
            console.warn("[OllamaDiffuser] not reachable at " + this.baseUrl +
                         ". Start with: ollamadiffuser run <model>  (default port 9000)");
            this._warned = true;
        }
        this.available = false;
        this._unavailableSince = _now;
        this._downCooldown = Math.min((this._downCooldown || 10000) * 2, 60000);
        this._downUntil = _now + this._downCooldown;
        this._reportSvc(false, "not running", "ollamadiffuser run <model> (:9000)");
        return false;
    }

    _reportSvc(ok, reason, hint) { try { if (typeof window !== "undefined" && window.serviceStatus) window.serviceStatus.set("ollamadiffuser", { label: "OllamaDiffuser", ok, reason, hint }); } catch (e) {} }

    // Generate an image. Returns:
    //   { ok: true,  dataUrl: "data:image/png;base64,...", duration_ms }
    //   { ok: false, error: "string" }
    //
    // Options override per-call width/height/steps/seed. Otherwise
    // uses constructor defaults.
    async generate(prompt, opts = {}) {
        this.totalCalls++;
        if (this._paused) {
            // Round 162 — silent return when demo holds the pause.
            return { ok: false, error: "diffuser paused (AI chain demo running)" };
        }
        if (this.available === false) {
            // Round 194 — re-probe if marked unavailable more than 20s ago.
            // Services typically take 30-60s to warm up after launch; a
            // permanent-until-page-reload failure caused user frustration
            // when retrying the bench's texture step immediately after
            // opening it. Stale-aware probe lets the bench self-heal.
            const since = Date.now() - (this._unavailableSince || 0);
            if (since < 20000) {
                const wait = Math.ceil((20000 - since) / 1000);
                return { ok: false, error: `diffuser still warming up — retry in ${wait}s` };
            }
            // 20s elapsed since last probe — try again
            this.available = null;
        }
        if (this.available === null) {
            const ok = await this.probe(true);
            if (!ok) return { ok: false, error: "diffuser still starting — retry in 20s" };
        }

        const body = {
            prompt: String(prompt ?? ""),
            width:  opts.width  ?? this.width,
            height: opts.height ?? this.height,
            steps:  opts.steps  ?? this.steps,
            seed:   opts.seed   ?? null,
        };
        // Round 159 — include model when set so the diffuser picks the
        // configured pipeline rather than its default. Omit when null so
        // older diffuser builds that don't accept the field still work.
        const model = opts.model ?? this.model;
        if (model) body.model = model;

        const start = performance.now();
        const ctrl = new AbortController();
        // Round 162 — register so setPaused(true) can cancel this fetch.
        this._activeAborters.add(ctrl);
        // v861 — fire ai:activity window event so HeartbeatAvatar's
        // busy counter sees diffuser concurrency. Source tag "diffuser"
        // distinguishes from "ollama" (text gen) and "comfyui".
        try {
            window.dispatchEvent(new CustomEvent("ai:activity", {
                detail: { source: "diffuser", event: "started", model: model || null },
            }));
        } catch {}
        let _diffusionResult = null;
        try {
            const t = setTimeout(() => ctrl.abort(), this.timeoutMs);
            const r = await fetch(this.baseUrl + "/api/generate", {
                method:  "POST",
                headers: { "Content-Type": "application/json" },
                body:    JSON.stringify(body),
                signal:  ctrl.signal,
            });
            clearTimeout(t);
            if (!r.ok) {
                this.totalFails++;
                this._activeAborters.delete(ctrl);
                _diffusionResult = { ok: false, error: "HTTP " + r.status };
                return _diffusionResult;
            }
            // Response can be either JSON envelope or raw bytes; sniff
            // Content-Type and decode accordingly.
            const ct = r.headers.get("content-type") || "";
            let dataUrl = null;
            if (ct.includes("application/json")) {
                const j = await r.json();
                // Accept several common envelopes — OllamaDiffuser uses
                // {image}; older forks use {images:[...]} or {data}.
                const b64 = j.image ?? j.images?.[0] ?? j.data ?? null;
                if (!b64) {
                    this.totalFails++;
                    this._activeAborters.delete(ctrl);
                    _diffusionResult = { ok: false, error: "no image field in response" };
                    return _diffusionResult;
                }
                dataUrl = b64.startsWith("data:")
                    ? b64
                    : "data:image/png;base64," + b64;
            } else if (ct.startsWith("image/")) {
                // Raw image bytes
                const blob = await r.blob();
                dataUrl = await new Promise((res, rej) => {
                    const fr = new FileReader();
                    fr.onload  = () => res(fr.result);
                    fr.onerror = rej;
                    fr.readAsDataURL(blob);
                });
            } else {
                this.totalFails++;
                this._activeAborters.delete(ctrl);
                _diffusionResult = { ok: false, error: "unexpected content-type: " + ct };
                return _diffusionResult;
            }

            const duration_ms = performance.now() - start;
            this.totalDurationMs += duration_ms;
            this._activeAborters.delete(ctrl);
            _diffusionResult = { ok: true, dataUrl, duration_ms };
            return _diffusionResult;
        } catch (e) {
            this.totalFails++;
            this._activeAborters.delete(ctrl);
            const name = e?.name === "AbortError" ? "timeout" : (e?.message || "error");
            _diffusionResult = { ok: false, error: name };
            return _diffusionResult;
        } finally {
            // v861 — Always fire completed/failed even on early returns.
            // Result is set on every path above; finally fires after the
            // try-catch but BEFORE the return — but JS finally runs
            // synchronously after return-value capture, so this works.
            try {
                window.dispatchEvent(new CustomEvent("ai:activity", {
                    detail: {
                        source: "diffuser",
                        event: (_diffusionResult && _diffusionResult.ok) ? "completed" : "failed",
                        model: model || null,
                        error: _diffusionResult?.error,
                    },
                }));
            } catch {}
        }
    }

    stats() {
        const avg = this.totalCalls > 0 ? (this.totalDurationMs / Math.max(1, this.totalCalls - this.totalFails)) : 0;
        return {
            available: this.available,
            totalCalls: this.totalCalls,
            totalFails: this.totalFails,
            avgDurationMs: avg.toFixed(0),
        };
    }
}
