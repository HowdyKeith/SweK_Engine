// FILE: ai/OllamaClient.js
// VERSION: v1 - LLM NARRATION CLIENT (BROWSER → OLLAMA)
//
// Wraps fetch to a local Ollama daemon (default localhost:11434). Used
// by NarrativeEngine to rephrase civ events as varied prose instead of
// the five hand-rolled templates in v1.
//
// Why a thin client (not just inline fetch): the rest of the AI layer
// shouldn't care about how the LLM is reached. Swapping providers
// (different port, different schema, OpenAI-style endpoint) means
// editing this one file.
//
// CORS: Ollama allows localhost:* origins by default. If you serve the
// page from a different host, set the OLLAMA_ORIGINS env var when
// starting the daemon: `OLLAMA_ORIGINS=* ollama serve`.
//
// Reachability: the first failure logs once and sets `available=false`.
// Subsequent generate() calls short-circuit to null until a future
// `probe()` succeeds. This keeps the loop quiet when Ollama isn't
// running and avoids hammering a dead endpoint.

const DEFAULT_URL   = "http://localhost:11434";
const DEFAULT_MODEL = "llama3.2";
// Round 160 — bumped from 4s. Modern thinking models (qwen3, deepseek-r1)
// spend 5-30s on internal reasoning tokens before producing output. The
// old 4s timeout aborted every call before the model finished thinking.
// 30s is generous for narrative; generateOBJ() overrides to 90s.
//
// Round 161 — with streaming, this is now the TOTAL safety cap. Real
// timeout control happens via DEFAULT_IDLE_TIMEOUT_MS (no-new-token
// detection), which works regardless of model speed.
const DEFAULT_TIMEOUT_MS = 600_000;          // 10 min hard ceiling
const DEFAULT_IDLE_TIMEOUT_MS = 45_000;      // 45s no-token-progress
const DEFAULT_NUM_PREDICT = 32;     // ~1-2 sentences

// Round 159 — patterns we use to auto-recommend a model for a given
// task when the user hasn't explicitly chosen. Tested against the
// installed model names (case-insensitive substring match).
//
// OBJ generation benefits from code/structure-aware models. Narrative
// works best with general-purpose chat models. Texture work happens on
// OllamaDiffuser, not here.
//
// Round 160 — narrative hint order matters: earlier wins. gemma3:4b
// is a fast non-thinking model and is preferred over qwen3 (which is
// a thinking model that needs much longer timeouts).
export const TASK_RECOMMENDATION_HINTS = {
    obj:       ["c3d", "code", "cad", "3d", "coder", "deepseek-coder", "starcoder"],
    narrative: ["gemma", "llama", "mistral", "phi", "nemo", "qwen"],
};

export class OllamaClient {
    // Round 176 — static parse-fail hook list. Modules that want to
    // be notified whenever generateOBJ() fails to parse can register
    // here. Used by FailedOBJStore to capture raw outputs for later
    // parser-improvement work without OllamaClient knowing about it.
    //
    // Callers: `OllamaClient.onParseFail(item => store.capture(item))`
    // Item shape: { model, prompt, rawText, reason }
    static _parseFailCallbacks = [];
    static onParseFail(cb) {
        if (typeof cb === "function") OllamaClient._parseFailCallbacks.push(cb);
    }
    static _notifyParseFail(item) {
        for (const cb of OllamaClient._parseFailCallbacks) {
            try { cb(item); } catch (e) {
                console.warn("[OllamaClient] parse-fail callback threw:", e);
            }
        }
    }

    constructor(opts = {}) {
        // Round 162 — restore base URL too. Lets the demo's URL field
        // survive reloads independent of the model pick.
        let restoredUrl = null;
        try { restoredUrl = localStorage.getItem("voxelengine.ollamaUrl"); } catch {}
        this.baseUrl = opts.baseUrl ?? restoredUrl ?? DEFAULT_URL;
        // Round 59 - restore last-used model from localStorage if present.
        // Round 159 — also restore per-task OBJ model preference.
        let restored = null, restoredObj = null;
        try { restored    = localStorage.getItem("voxelengine.ollamaModel"); } catch {}
        try { restoredObj = localStorage.getItem("voxelengine.ollamaObjModel"); } catch {}
        this.model = opts.model ?? restored ?? DEFAULT_MODEL;
        // Round 159 — optional separate model for OBJ generation. When
        // unset, generateOBJ() uses this.model. When set, it takes
        // precedence — lets you keep llama for narrative and use a
        // code-trained model for 3D output.
        this.objModel = restoredObj ?? null;
        this.timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
        // Round 161 — idle timeout fires if no streamed token arrives for
        // this long. Independent of total timeout: a model that streams
        // 100 tokens over 5 minutes is fine; one that pauses 60s mid-gen
        // is broken.
        this.idleTimeoutMs = opts.idleTimeoutMs ?? DEFAULT_IDLE_TIMEOUT_MS;

        this.available = null;       // null = unknown, true/false = probed
        this.totalCalls   = 0;
        this.totalFails   = 0;
        this.totalLatencyMs = 0;
        this._warnedDown = false;
        // Round 162 — track in-flight AbortControllers so setPaused(true)
        // can cancel pending fetches (e.g. when the AI Chain demo wants
        // the engine's pending C3D generation to stop competing for CPU).
        this._activeAborters = new Set();
        // v919 — protocol dialect. "ollama" = native /api/* (default).
        // "openai" = OpenAI-compatible /v1/* (LlamaStash, LM Studio, raw
        // llama-server). LlamaStash's proxy listens on :11434 too, so the
        // same baseUrl works — only the dialect flips.
        let restoredDialect = null;
        try { restoredDialect = localStorage.getItem("voxelengine.llmDialect"); } catch {}
        this.dialect = opts.dialect ?? restoredDialect ?? "ollama";
    }

    // v919 — switch protocol dialect ("ollama" | "openai"). Persisted; resets
    // the probe so the next call re-checks against the new endpoint shape.
    setDialect(d) {
        if (d !== "ollama" && d !== "openai") return false;
        this.dialect = d;
        try { localStorage.setItem("voxelengine.llmDialect", d); } catch {}
        this.available = null;
        return true;
    }
    getDialect() { return this.dialect; }

    // v919 — OpenAI-compatible reachability probe (GET /v1/models).
    async _probeOpenAI() {
        try {
            const ctrl = new AbortController();
            const t = setTimeout(() => ctrl.abort(), this.timeoutMs);
            const res = await fetch(`${this.baseUrl}/v1/models`, { signal: ctrl.signal });
            clearTimeout(t);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            this.available = true; this._warnedDown = false;
            return true;
        } catch (e) {
            this.available = false;
            if (!this._warnedDown) {
                console.warn(`[OllamaClient] OpenAI-compatible endpoint not reachable at ${this.baseUrl} ` +
                    `— narrative falls back to templates. Start a server (e.g. \`llamastash start <model>\`).`);
                this._warnedDown = true;
            }
            return false;
        }
    }

    // v919 — non-streaming generation via /v1/chat/completions. Returns the
    // text string (or null), matching generate()'s contract. Honors
    // opts.system / opts.temperature / opts.model and reports a one-shot
    // onProgress when the reply lands.
    async _generateOpenAI(prompt, opts = {}) {
        this.totalCalls++;
        const t0 = (typeof performance !== "undefined" ? performance.now() : Date.now());
        const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now());
        const ctrl = new AbortController();
        this._activeAborters.add(ctrl);
        const totalTimeoutMs = opts.timeoutMs || this.timeoutMs;
        const idleTimeoutMs  = opts.idleTimeoutMs || this.idleTimeoutMs;
        let idleTimer = null;
        const totalTimer = setTimeout(() => ctrl.abort(), totalTimeoutMs);
        const resetIdle = () => { if (idleTimer) clearTimeout(idleTimer); idleTimer = setTimeout(() => ctrl.abort(), idleTimeoutMs); };
        try {
            const messages = [];
            if (opts.system) messages.push({ role: "system", content: opts.system });
            messages.push({ role: "user", content: prompt });
            const body = { model: opts.model || this.model, messages, stream: true };
            if (Number.isFinite(opts.temperature)) body.temperature = opts.temperature;
            resetIdle();
            const res = await fetch(`${this.baseUrl}/v1/chat/completions`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
                signal: ctrl.signal,
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);

            // ---- SSE read loop: lines of `data: {json}` / `data: [DONE]` ----
            const reader = res.body.getReader();
            const decoder = new TextDecoder();
            let buffer = "", fullText = "", tokenCount = 0;
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                resetIdle();
                buffer += decoder.decode(value, { stream: true });
                let nl;
                while ((nl = buffer.indexOf("\n")) !== -1) {
                    const line = buffer.slice(0, nl).trim();
                    buffer = buffer.slice(nl + 1);
                    if (!line || !line.startsWith("data:")) continue;
                    const payload = line.slice(5).trim();
                    if (payload === "[DONE]") { buffer = ""; break; }
                    let j; try { j = JSON.parse(payload); } catch { continue; }
                    const delta = j?.choices?.[0]?.delta?.content;
                    if (typeof delta === "string" && delta) {
                        fullText += delta; tokenCount++;
                        if (typeof opts.onProgress === "function") {
                            try { opts.onProgress({ tokensReceived: tokenCount, elapsedMs: now() - t0, lastToken: delta, fullText }); } catch {}
                        }
                    }
                }
            }
            this.available = true; this._warnedDown = false;
            this.totalLatencyMs += (now() - t0);
            const text = fullText.trim();
            return text || null;
        } catch (e) {
            this.totalFails++;
            this.available = false;
            return null;
        } finally {
            clearTimeout(totalTimer);
            if (idleTimer) clearTimeout(idleTimer);
            this._activeAborters.delete(ctrl);
        }
    }

    // Round 159 — task-specific model setters. Persist to localStorage
    // so the per-task choice survives reloads independent of the
    // "default" model. setNarrativeModel is an alias for setModel
    // (this.model IS the narrative/generic model); setObjModel sets a
    // separate override that generateOBJ() prefers.
    setNarrativeModel(name) { return this.setModel(name); }
    setObjModel(name) {
        if (!name || typeof name !== "string") return false;
        this.objModel = name;
        try { localStorage.setItem("voxelengine.ollamaObjModel", name); } catch {}
        return true;
    }

    // Round 162 — pause/resume + setter helpers for the AI Chain demo.
    // While paused, every generate() returns null immediately so engine
    // systems (narrative, OBJ asset loader, palchat) get clean "no
    // response" results and fall back to their template/placeholder
    // paths instead of queuing up while the demo holds the wire.
    setPaused(b) {
        const wasPaused = !!this._paused;
        this._paused = !!b;
        // Round 162 — entering pause aborts pending fetches so the
        // engine's slow generations don't keep working in the background
        // while the demo holds the wire. Exiting pause is a no-op (new
        // calls just work again).
        if (this._paused && !wasPaused) {
            for (const ctrl of this._activeAborters) {
                try { ctrl.abort(); } catch {}
            }
            this._activeAborters.clear();
        }
    }
    isPaused()   { return !!this._paused; }
    setBaseUrl(url) {
        if (!url || typeof url !== "string") return false;
        this.baseUrl = url.replace(/\/+$/, "");
        this.available = null;
        this._modelMissing = false;
        this._warnedDown = false;
        this._warnedGenFail = false;
        try { localStorage.setItem("voxelengine.ollamaUrl", this.baseUrl); } catch {}
        return true;
    }
    setTimeoutMs(ms) {
        if (Number.isFinite(ms) && ms > 0) { this.timeoutMs = ms; return true; }
        return false;
    }
    setIdleTimeoutMs(ms) {
        if (Number.isFinite(ms) && ms > 0) { this.idleTimeoutMs = ms; return true; }
        return false;
    }
    // Resolve the model to use for a given task. narrative/(none) use
    // this.model; obj uses objModel when set.
    modelFor(task) {
        if (task === "obj") return this.objModel || this.model;
        return this.model;
    }
    // Recommend an installed model for a task based on name patterns.
    // Returns the best-matching name or null. Caller decides whether to
    // apply it (we don't change the user's pick automatically).
    recommendModelFor(task, installedNames) {
        const hints = TASK_RECOMMENDATION_HINTS[task];
        if (!hints || !Array.isArray(installedNames)) return null;
        // Earlier-listed hints win
        for (const hint of hints) {
            const m = installedNames.find(n =>
                n.toLowerCase().includes(hint.toLowerCase()));
            if (m) return m;
        }
        return null;
    }

    // Optional: ask the server for /api/tags to confirm reachability.
    // Called automatically by generate() the first time if available is
    // still null. Safe to call multiple times.
    //
    // Round 156 — also checks whether the currently-selected model is
    // actually pulled. If the daemon is up but our model is missing,
    // sets _modelMissing so future generate() calls short-circuit
    // without spamming 404s into the console.
    async probe() {
        if (this.dialect === "openai") return this._probeOpenAI();
        const wasAvailable = this.available;
        try {
            const ctrl = new AbortController();
            const t = setTimeout(() => ctrl.abort(), this.timeoutMs);
            const res = await fetch(`${this.baseUrl}/api/tags`, { signal: ctrl.signal });
            clearTimeout(t);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            this.available = true;
            // Round 156 — check that our model is in the tag list. If not,
            // mark it as missing so we don't hammer /api/generate with
            // requests that will all return 404. Strip ":tag" suffix when
            // matching since users often type "llama3.2" but the tag is
            // "llama3.2:latest".
            try {
                const j = await res.clone().json();
                const haveModels = Array.isArray(j.models) ? j.models : [];
                const target = this.model.split(":")[0];
                // Round 165 — exclude models that 404'd in a prior
                // /api/generate. Stale /api/tags entries (e.g. after an
                // Ollama reinstall) get filtered out here so haveExact
                // doesn't falsely succeed.
                // Round 166 — canonicalize by stripping ":tag" before
                // comparing. The blacklist often holds "llama3.2" but
                // /api/tags reports "llama3.2:latest"; without this
                // normalization the filter no-ops.
                const bl = this._blacklistedModels;
                const blMatch = (fullName) => {
                    if (!bl) return false;
                    if (bl.has(fullName)) return true;
                    const stem = fullName.split(":")[0];
                    for (const banned of bl) {
                        if (banned.split(":")[0] === stem) return true;
                    }
                    return false;
                };
                const haveExact = haveModels.some(m => {
                    const n = (m.name || "").split(":")[0];
                    return n === target && !blMatch(m.name);
                });
                if (!haveExact) {
                    // Round 158 — auto-fallback. If the configured model
                    // isn't pulled but OTHER models are, switch to the
                    // first available rather than fail every generate().
                    // Round 160 — but be smart about which model to pick:
                    //   1. Exclude OBJ-targeted models (c3d, code, coder)
                    //      from narrative selection. Those are trained
                    //      for code/3D output and produce bad narrative.
                    //   2. Among non-OBJ models, prefer the recommended
                    //      narrative pattern (gemma is first → fast,
                    //      non-thinking). Otherwise take the first.
                    //   3. Also auto-assign the FIRST matching OBJ model
                    //      as the OBJ-task default, so generateOBJ()
                    //      uses the right tool without user intervention.
                    if (haveModels.length > 0) {
                        // Round 165 — drop blacklisted models from the
                        // auto-assign candidate pool. Round 166 — use
                        // the normalized matcher so "llama3.2" blacklist
                        // also drops "llama3.2:latest" from candidates.
                        const installedNames = haveModels.map(m => m.name)
                            .filter(n => !blMatch(n));
                        if (installedNames.length === 0) {
                            // Every installed model has 404'd. Fall through
                            // to "no models" branch below.
                            this._modelMissing = true;
                            if (!this._warnedAllBlacklisted) {
                                this._warnedAllBlacklisted = true;
                                console.warn(
                                    "[OllamaClient] all installed models 404'd. " +
                                    "Try `ollama pull gemma3:4b` then refresh the AI MODELS panel.");
                            }
                            this.available = haveModels.length > 0;
                            return this.available;
                        }
                        // Identify OBJ-suited models for separate assignment
                        const objHints = TASK_RECOMMENDATION_HINTS.obj;
                        const objModel = installedNames.find(n =>
                            objHints.some(h => n.toLowerCase().includes(h.toLowerCase())));
                        // Narrative candidates = everything that's NOT obj-tagged
                        const narrativeCandidates = installedNames.filter(n => n !== objModel);
                        const pick = this.recommendModelFor("narrative", narrativeCandidates)
                                  || narrativeCandidates[0]
                                  || installedNames[0];
                        const prev = this.model;
                        this.model = pick;
                        this._modelMissing = false;

                        // Auto-assign OBJ model if one was found and the user hasn't
                        // explicitly set one yet (objModel is null from constructor)
                        if (objModel && !this.objModel) {
                            this.objModel = objModel;
                            try { localStorage.setItem("voxelengine.ollamaObjModel", objModel); } catch {}
                        }

                        if (!this._warnedAutoSwitch) {
                            this._warnedAutoSwitch = true;
                            const all = installedNames.join(", ");
                            console.log(
                                `[OllamaClient] configured model "${prev}" not pulled. ` +
                                `Auto-assigning narrative→"${pick}"` +
                                (objModel ? `, OBJ→"${objModel}"` : "") +
                                ` (available: ${all}). ` +
                                `Override via the AI MODELS panel.`);
                        }
                        try { localStorage.setItem("voxelengine.ollamaModel", pick); } catch {}
                    } else {
                        // Daemon up but no models pulled at all.
                        this._modelMissing = true;
                        if (!this._warnedModelMissing) {
                            this._warnedModelMissing = true;
                            console.warn(
                                `[OllamaClient] daemon is up but no models are pulled. ` +
                                `Run \`ollama pull llama3.2\` (or any model) to enable LLM features.`);
                        }
                    }
                } else {
                    this._modelMissing = false;
                }
            } catch { /* tag parse failed; leave _modelMissing as-is */ }
            // Round 102 — fire "reachable" when probe transitions false->true
            // so HeartbeatAvatar can flip offline -> idle. Without this, once
            // the avatar transitions to dead/X-eyes there's no event that ever
            // brings it back even if the LLM comes online later.
            if (wasAvailable === false) {
                this._warnedDown = false;
                this._warnedGenFail = false;
                this._emit("reachable");
            }
            return true;
        } catch (e) {
            this.available = false;
            if (!this._warnedDown) {
                this._warnedDown = true;
                console.warn(`[OllamaClient] not reachable at ${this.baseUrl} — narrative falls back to templates. Start ollama with \`ollama serve\` or \`OLLAMA_ORIGINS=* ollama serve\` to enable.`);
            }
            // Round 92 — heartbeat hook: tell listeners we're offline so
            // the avatar can transition to its dead/X-eyes pose.
            this._emit("unreachable");
            return false;
        }
    }

    // Round 92 — activity event subscription. Subscribers receive one of:
    //   "started"     — a generate request was just dispatched
    //   "completed"   — a generate request returned text (or empty)
    //   "failed"      — request threw / non-OK status / timed out
    //   "unreachable" — probe() failed and marked available=false
    // Use for status indicators like HeartbeatAvatar that need to know
    // when the LLM pipeline is doing work.
    onActivity(fn) {
        if (!this._activityListeners) this._activityListeners = new Set();
        this._activityListeners.add(fn);
        return () => this._activityListeners.delete(fn);
    }

    _emit(eventName, detail = null) {
        if (this._activityListeners) {
            for (const fn of this._activityListeners) {
                try { fn(eventName, detail); } catch (e) {
                    console.warn("[OllamaClient] activity listener threw:", e);
                }
            }
        }
        // Round 265 — also dispatch a CustomEvent on window so the
        // OLLAMA avatar in HeartbeatAvatar can update its expression /
        // emoji to reflect which model is in use. Listeners can choose
        // to map e.g. "gemma3:4b" to a specific glyph.
        if (typeof window !== "undefined" && typeof window.CustomEvent === "function") {
            try {
                window.dispatchEvent(new CustomEvent("ai:activity", {
                    detail: {
                        source: "ollama",
                        event:  eventName,
                        model:  detail?.model ?? this.model,
                        ...detail,
                    },
                }));
            } catch {}
        }
    }

    // Round 59 - enumerate installed models on the local Ollama daemon.
    // Returns array of { name, size, modified } objects when reachable,
    // [] when daemon is up but zero models pulled, null when daemon
    // can't be reached. (Round 66 — null vs [] distinction lets the UI
    // tell "offline" from "online but empty", which leads to better
    // hint text.)
    async listModels() {
        if (this.dialect === "openai") {
            try {
                const ctrl = new AbortController();
                const t = setTimeout(() => ctrl.abort(), this.timeoutMs);
                const res = await fetch(`${this.baseUrl}/v1/models`, { signal: ctrl.signal });
                clearTimeout(t);
                if (!res.ok) return null;
                const j = await res.json();
                // OpenAI /v1/models → { data: [{ id, ... }] }
                return Array.isArray(j.data) ? j.data.map(m => ({ name: m.id, size: null, modified: null })) : [];
            } catch { return null; }
        }
        try {
            const ctrl = new AbortController();
            const t = setTimeout(() => ctrl.abort(), this.timeoutMs);
            const res = await fetch(`${this.baseUrl}/api/tags`, { signal: ctrl.signal });
            clearTimeout(t);
            if (!res.ok) return null;
            const j = await res.json();
            // Ollama /api/tags returns { models: [{ name, size, modified_at, digest, ... }] }
            return Array.isArray(j.models) ? j.models.map(m => ({
                name: m.name,
                size: m.size,
                modified: m.modified_at,
            })) : [];
        } catch {
            return null;
        }
    }

    // Round 59 - swap the active model name. Persisted to localStorage so
    // subsequent sessions remember the choice. The narrative engine uses
    // `this.model` directly so just updating the field is enough.
    setModel(name) {
        if (!name || typeof name !== "string") return false;
        this.model = name;
        try { localStorage.setItem("voxelengine.ollamaModel", name); } catch {}
        // Reset the available state so the next generate() re-probes,
        // letting users recover from "Ollama wasn't running so I marked
        // it offline" after starting the daemon. Round 66 — also clears
        // _warnedGenFail so the user gets a fresh diagnostic warning if
        // the NEW model also fails (e.g., picked one that isn't pulled).
        this.available = null;
        this._warnedDown = false;
        this._warnedGenFail = false;
        // Round 156 — re-probe will check whether the new model is
        // installed, so clear the missing-model flags here.
        this._modelMissing = false;
        this._warnedModelMissing = false;
        return true;
    }

    // Round 66 — auto-re-probe loop. Runs in the background and, if
    // we've previously marked ourselves unavailable, periodically rechecks
    // /api/tags to see if Ollama has come back online or had a model
    // pulled while the page was open. On success it just resets the
    // available flag — the next generate() call will re-attempt without
    // the user touching anything. We never force-switch the model,
    // because the user may have picked one explicitly and we shouldn't
    // override that.
    startAutoReprobe(intervalMs = 30000) {
        if (this._reprobeId) return;
        this._reprobeId = setInterval(async () => {
            if (this.available !== false) return;     // only when stuck-offline
            const models = await this.listModels();
            if (!models || models.length === 0) return;
            // Round 66 — if our currently-selected model isn't actually
            // installed (very common path: user defaulted to llama3.2 but
            // pulled phi3), auto-switch to the best available. We only
            // do this when "stuck offline" — i.e. previous generate()
            // failed — so a user who deliberately picked a model that
            // works isn't overridden.
            const have = models.some(m =>
                m.name === this.model || m.name.startsWith(`${this.model}:`));
            if (!have) {
                const best = await this.pickBestModel();
                if (best) {
                    console.log(`[OllamaClient] re-probe: current model "${this.model}" not installed; switching to "${best}".`);
                    this.setModel(best);
                    return;       // setModel already cleared the warned flags
                }
            }
            console.log(`[OllamaClient] re-probe: ${models.length} model(s) now available, retrying narration.`);
            this.available = null;        // probed next time generate() runs
            this._warnedGenFail = false;
            this._warnedDown = false;
        }, intervalMs);
    }

    stopAutoReprobe() {
        if (this._reprobeId) {
            clearInterval(this._reprobeId);
            this._reprobeId = null;
        }
    }

    // Round 59 - preferred model order. The picker UI shows the topmost
    // installed match as "Recommended". Picked for narrative quality at
    // small sizes; smaller models first so first-run is fast on modest
    // hardware. Add to / reorder this list freely without breaking the
    // engine; "recommended" just means "first available from this list."
    static PREFERRED_MODELS = [
        "llama3.2",        // 3B - fast, surprisingly capable
        "llama3.1",        // 8B - higher quality if installed
        "llama3",          // older but widely installed
        "phi3",            // small, fast
        "mistral",         // 7B - strong general model
        "gemma2",          // 9B
        "qwen2.5",         // 7B
    ];

    // Round 59 - pick the best available model from the preferred list,
    // falling back to any installed model. Returns null if Ollama isn't
    // reachable OR has no models installed at all. Doesn't modify state
    // — caller decides whether to setModel() with the result.
    async pickBestModel() {
        const installed = await this.listModels();
        if (!installed || installed.length === 0) return null;
        // Match by prefix because Ollama tags include version suffixes
        // (e.g., "llama3.2:latest"). We want "llama3.2" to match
        // "llama3.2:latest" or "llama3.2:1b".
        for (const fav of OllamaClient.PREFERRED_MODELS) {
            const m = installed.find(x => x.name === fav || x.name.startsWith(`${fav}:`));
            if (m) return m.name;
        }
        // No favorite installed — return the first one as a fallback
        return installed[0].name;
    }


    // Generate a single completion. Returns the response string, or null
    // on failure / timeout / Ollama-not-running. Never throws.
    async generate(prompt, opts = {}) {
        if (this.available === false) return null;
        // Round 162 — bail before any side effects when paused. Demo
        // controls when engine AI fires; this stops narrative/OBJ
        // requests from racing the demo's measured baseline.
        if (this._paused) return null;
        // v919 — OpenAI-compatible dialect (LlamaStash etc.): non-streaming
        // /v1/chat/completions. generateOBJ() delegates here, so OBJ works too.
        if (this.dialect === "openai") return this._generateOpenAI(prompt, opts);

        // Round 162 — relaxed concurrency. The old _inFlight lock
        // serialized ALL generate() calls to one at a time. That made
        // sense with a 4s non-streaming timeout (5 fails ≈ 20s gone)
        // but is catastrophic with streaming: one slow C3D request
        // can hold the lock for 60s+ while every other call rejects
        // instantly. Now the only serialization is the probe — and it
        // only runs once anyway.
        //
        // Concurrent OBJ + narrative + texture against Ollama is fine;
        // Ollama queues internally and the OS can keep the CPU busy
        // (user explicitly opted in to this — "let CPU be used as much
        // as possible, it's great to see it busy").
        if (this.available === null) {
            if (this._probing) {
                // Another caller is already probing; wait for it to finish
                // (or give up after ~10s in case probe itself is stuck).
                const waitStart = Date.now();
                while (this._probing && Date.now() - waitStart < 10_000) {
                    await new Promise(r => setTimeout(r, 50));
                }
            } else {
                this._probing = true;
                try { await this.probe(); }
                finally { this._probing = false; }
            }
            if (this.available === false) {
                this._emit("unreachable");
                return null;
            }
        }

        // Round 168 — request serialization. Wait for any in-flight
        // generate() on this client to finish before starting this one.
        //
        // Why: when C3D (7B, ~4.7GB VRAM) and gemma3:4b (~3GB) are both
        // running concurrently they overcommit an 8GB GPU. Ollama starts
        // evicting layers and performance collapses from 11 tok/s to
        // 0.7 tok/s, then stalls past the idle timeout. Serializing
        // ensures each model gets the full GPU during its window.
        //
        // The FIFO ordering is automatic: multiple callers all `await
        // this._activeGen`; when it resolves, the first microtask to
        // run sees it null and claims the slot, others see the new
        // promise and wait again. Single-threaded JS makes this safe
        // without locks. Pause-state and abort are checked AFTER the
        // gate so cancellation doesn't stall behind queued work.
        // opts.bypassQueue lets internal callers (e.g. probe) skip.
        if (!opts.bypassQueue) {
            while (this._activeGen) {
                try { await this._activeGen; } catch {}
            }
            // Re-check pause/availability after the wait — queue could
            // have been long-running and state may have changed.
            if (this._paused) return null;
            if (this.available === false) return null;
            let resolveActive;
            this._activeGen = new Promise(res => { resolveActive = res; });
            // Save resolver so the finally block (down at the function
            // exit) can release the gate.
            this._activeGenResolve = resolveActive;
        }

        try {
            // Round 92 — fire "started" so listeners (HeartbeatAvatar) can
            // switch to the active animation. Round 168 — moved inside the
            // try block so the gate releases if a listener throws.
            // Round 265 — pass the resolved model name so listeners can
            // pick an appropriate avatar.
            const _resolvedModel = opts.model ?? this.model;
            this._emit("started", { model: _resolvedModel });
            // Round 162 — probe already happened above (probe-only lock).
            // Just check the resulting state.
            if (this._modelMissing) {
                // Round 156 — short-circuit when the daemon is up but the
                // model isn't pulled. probe() set this flag.
                this._emit("failed");
                return null;
            }

            const body = {
                model: opts.model ?? this.model,
                prompt,
                // Round 161 — stream NDJSON tokens. Lets us:
                //  - reset an idle timer per token (no-progress = real stall)
                //  - report progress to opts.onProgress (UI integration)
                //  - log token/sec stats for diagnostics
                // Existing callers still get back a single assembled string;
                // they don't need to know streaming is happening.
                stream: true,
                options: {
                    num_predict: opts.num_predict ?? DEFAULT_NUM_PREDICT,
                    temperature: opts.temperature ?? 0.7,
                    top_k: opts.top_k ?? 40,
                    stop: opts.stop ?? ["\n\n"],
                },
            };
            // Round 169 — pass keep_alive through if caller specified one.
            // Ollama accepts strings ("30s", "5m") or numbers (seconds).
            // 0 = unload immediately. Default behavior (no field) = 5min.
            if (opts.keep_alive !== undefined) {
                body.keep_alive = opts.keep_alive;
            }

            const t0 = performance.now();
            const ctrl = new AbortController();
            // Round 162 — register in active set so setPaused(true) can
            // cancel us. Removed in both success and failure paths below.
            this._activeAborters.add(ctrl);
            // Round 161 — two timers:
            //   totalTimer: hard ceiling (10 min default) — safety against
            //               runaway models or zombie connections.
            //   idleTimer:  resets on each chunk. If no token arrives for
            //               idleTimeoutMs (45s default), abort. This is the
            //               real timeout control — total budget doesn't
            //               matter as long as progress is happening.
            const totalTimeoutMs = opts.timeoutMs ?? this.timeoutMs;
            const idleTimeoutMs  = opts.idleTimeoutMs ?? this.idleTimeoutMs;
            let abortReason = null;          // "idle" | "total" | "stop" | null
            let idleTimer = null;
            const resetIdle = () => {
                if (idleTimer) clearTimeout(idleTimer);
                idleTimer = setTimeout(() => {
                    abortReason = "idle";
                    ctrl.abort();
                }, idleTimeoutMs);
            };
            const totalTimer = setTimeout(() => {
                abortReason = "total";
                ctrl.abort();
            }, totalTimeoutMs);
            resetIdle();

            try {
                const res = await fetch(`${this.baseUrl}/api/generate`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(body),
                    signal: ctrl.signal,
                });
                if (!res.ok) {
                    clearTimeout(totalTimer);
                    clearTimeout(idleTimer);
                    this._activeAborters.delete(ctrl);
                    throw new Error(`HTTP ${res.status}`);
                }

                // ---- streaming NDJSON read loop ----
                const reader  = res.body.getReader();
                const decoder = new TextDecoder();
                let buffer = "";        // partial-line buffer
                let fullText = "";      // accumulated response
                let tokenCount = 0;
                let doneFlag = false;
                let finalMeta = null;   // metadata from {done: true} chunk

                try {
                    while (true) {
                        const { done, value } = await reader.read();
                        if (done) break;     // stream ended
                        resetIdle();         // tokens flowing — reset stall detector
                        buffer += decoder.decode(value, { stream: true });
                        // Parse complete NDJSON lines from buffer
                        let nl;
                        while ((nl = buffer.indexOf("\n")) !== -1) {
                            const line = buffer.slice(0, nl).trim();
                            buffer = buffer.slice(nl + 1);
                            if (!line) continue;
                            let j;
                            try { j = JSON.parse(line); }
                            catch { continue; }    // malformed line, skip
                            if (typeof j.response === "string" && j.response) {
                                fullText += j.response;
                                tokenCount++;
                                if (typeof opts.onProgress === "function") {
                                    try {
                                        opts.onProgress({
                                            tokensReceived: tokenCount,
                                            elapsedMs:      performance.now() - t0,
                                            lastToken:      j.response,
                                            fullText,
                                        });
                                    } catch { /* progress callback must never break the stream */ }
                                }
                            }
                            if (j.done) {
                                doneFlag = true;
                                finalMeta = j;
                            }
                        }
                        if (doneFlag) break;
                    }
                } finally {
                    try { reader.releaseLock(); } catch {}
                }
                clearTimeout(idleTimer);
                clearTimeout(totalTimer);
                this._activeAborters.delete(ctrl);

                this.totalCalls++;
                const durMs = performance.now() - t0;
                this.totalLatencyMs += durMs;
                this._emit("completed");

                // Round 161 — log streaming stats for visibility.
                // Single line per generation; not spammy.
                // Round 163 — log the actual model used (body.model),
                // not this.model. Otherwise OBJ requests for c3dv0
                // log as gemma3:4b which is misleading.
                const tps = tokenCount > 0 && durMs > 0
                    ? (tokenCount / (durMs / 1000)).toFixed(1)
                    : "?";
                console.log(
                    `[OllamaClient] ${body.model} streamed ${tokenCount} tokens in ${(durMs/1000).toFixed(1)}s (${tps} tok/s)` +
                    (finalMeta?.eval_count != null ? `, eval=${finalMeta.eval_count}` : ""));

                const text = fullText.trim();
                return text || null;
            } catch (e) {
                clearTimeout(totalTimer);
                clearTimeout(idleTimer);
                this._activeAborters.delete(ctrl);
                this.totalCalls++;
                this.totalFails++;
                const msg = (e && e.message) ? e.message : "";
                const isHttpStatus = /^HTTP \d+/i.test(msg);
                // Only mark unavailable on REAL network errors (not timeouts,
                // not HTTP status codes — those mean server is up, just
                // unhappy with this specific request).
                if (!isHttpStatus && !abortReason) {
                    this.available = false;
                }
                // Round 156 — 404 means model isn't pulled
                if (/HTTP 404/i.test(msg)) {
                    // Round 165 — track which models 404'd so probe
                    // can exclude them on re-evaluation. /api/tags can
                    // be stale after a reinstall (the model name is
                    // still listed but the file is gone). Without the
                    // blacklist, re-probing would just keep selecting
                    // the same broken model.
                    if (!this._blacklistedModels) this._blacklistedModels = new Set();
                    this._blacklistedModels.add(body.model);
                    this._modelMissing = true;
                    this.available = null;
                    this._warnedAutoSwitch = false;
                }
                this._emit("failed");
                if (!this._warnedGenFail) {
                    this._warnedGenFail = true;
                    if (abortReason === "idle") {
                        console.warn(
                            `[OllamaClient] generate stalled (no token for ${idleTimeoutMs}ms) with model "${this.model}". ` +
                            `Model is running but not producing output — likely confused or out of memory. ` +
                            `Try a smaller model or shorter prompt via the AI MODELS panel.`);
                    } else if (abortReason === "total") {
                        console.warn(
                            `[OllamaClient] generate exceeded total budget (${(totalTimeoutMs/1000).toFixed(0)}s) with model "${this.model}". ` +
                            `Tokens were flowing but generation ran longer than the safety cap.`);
                    } else {
                        const reason = msg || "unknown";
                        console.warn(
                            `[OllamaClient] generate failed (${reason}) with model "${this.model}". ` +
                            `Narrative falls back to templates.`);
                    }
                }
                return null;
            }
        } finally {
            // Round 168 — release the serialization gate so the next
            // queued generate() can claim the slot. Done even on error
            // paths so a failing request doesn't deadlock the queue.
            if (this._activeGenResolve) {
                const r = this._activeGenResolve;
                this._activeGenResolve = null;
                this._activeGen = null;
                r();
            }
        }
    }

    // Round 45 — generate an OBJ mesh from a description. Returns the
    // raw OBJ text (a string starting with "v " or "# ..."), or null
    // on failure. Larger num_predict than narrative since OBJ files
    // are dense. Strips any markdown fences / preamble the model
    // wraps around the geometry.
    // ---- v1989: llama-server (native /completion) with GBNF grammar --------
    // Returns OBJ text on success, null when llama-server isn't configured or
    // isn't reachable (caller falls back to the Ollama path). Configure with
    // localStorage voxelengine.llamaServerUrl, e.g. "http://127.0.0.1:8080".
    llamaServerUrl() {
        try { return (typeof localStorage !== "undefined" && localStorage.getItem("voxelengine.llamaServerUrl")) || null; } catch { return null; }
    }
    setLlamaServerUrl(url) {
        try { url ? localStorage.setItem("voxelengine.llamaServerUrl", String(url).replace(/\/+$/, "")) : localStorage.removeItem("voxelengine.llamaServerUrl"); } catch {}
    }
    async _objGrammar() {
        if (this._objGrammarText) return this._objGrammarText;
        try {
            const r = await fetch("/ai/grammars/obj.gbnf", { cache: "no-store" });
            if (r.ok) { this._objGrammarText = await r.text(); return this._objGrammarText; }
        } catch {}
        return null;
    }
    async _llamaServerOBJ(description, opts = {}) {
        const base = (opts.llamaServerUrl || this.llamaServerUrl() || "").replace(/\/+$/, "");
        if (!base) return null;
        const grammar = await this._objGrammar();
        if (!grammar) { console.warn("[OllamaClient] llama-server configured but /ai/grammars/obj.gbnf missing — using Ollama path"); return null; }
        const prompt = `You are a 3D modeling assistant. Output a Wavefront OBJ mesh for: ${description}\n` +
            `Low-poly, 20-80 vertices, centered near origin, fits in a 2-unit cube, Y up, sits on y=0.\n` +
            `Output only "v x y z" and "f i j k" lines.\n\n`;
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 6 * 60 * 1000);
        try {
            const res = await fetch(base + "/completion", {
                method: "POST", headers: { "Content-Type": "application/json" }, signal: ctrl.signal,
                body: JSON.stringify({
                    prompt, grammar, stream: false,
                    n_predict: opts.num_predict ?? 1024,
                    temperature: opts.temperature ?? 0.4,
                    top_k: 50,
                }),
            });
            if (!res.ok) { console.warn(`[OllamaClient] llama-server /completion HTTP ${res.status} — falling back to Ollama`); return null; }
            const j = await res.json();
            const text = (j && (j.content ?? j.completion ?? "")).trim();
            if (!text || !/^v /m.test(text) || !/^f /m.test(text)) return null;   // grammar should prevent this; belt+braces
            console.log(`[OllamaClient] OBJ via llama-server + GBNF grammar (${text.split(/\n/).length} lines)`);
            return text;
        } catch (e) {
            console.warn(`[OllamaClient] llama-server unreachable at ${base} (${e && e.message}) — falling back to Ollama`);
            return null;
        } finally { clearTimeout(timer); }
    }

    async generateOBJ(description, opts = {}) {
        // v1989 — llama-server path with a GBNF grammar. When a llama-server URL is
        // configured (voxelengine.llamaServerUrl / opts.llamaServerUrl), OBJ generation
        // goes to its native /completion endpoint with /ai/grammars/obj.gbnf, which
        // constrains decoding so malformed OBJ is IMPOSSIBLE (no fences, no prose, no
        // bad indices). Grammar guarantees format, not quality — the QC gate still runs.
        // Skipped for C3D-style models (they're fine-tuned to emit Blender Python, and
        // grammar-forcing them into raw OBJ produces well-formed junk geometry).
        const useModelEarly = opts.model || this.objModel || this.model;
        if (!/c3d|cad/i.test(useModelEarly)) {
            const viaLlama = await this._llamaServerOBJ(description, opts);
            if (viaLlama != null) return viaLlama;   // null = not configured/unreachable → fall through to Ollama
        }
        // Round 165 — pick a prompt + stop set that fits the model's
        // training. C3D-class models (joshuaokolo/C3Dv0, anything with
        // "c3d" or "cad" in the name) are fine-tuned to emit Blender
        // Python pseudocode, NOT raw OBJ. Asking them for OBJ produces
        // either nothing or a markdown fence that gets clipped by our
        // stop sequence (eval=1, 0 tokens received). For these models,
        // we ask for Python in their native style and let c3dPythonToOBJ
        // synthesize the OBJ from extracted primitives.
        const useModel = opts.model || this.objModel || this.model;
        // Round 165 — match substrings, not word boundaries. The model
        // joshuaokolo/C3Dv0:latest has C3D followed by 'v', so \bc3d\b
        // wouldn't match. We just want any substring presence.
        const isC3D = /c3d|cad/i.test(useModel);

        const prompt = isC3D
? `Build a 3D model of: ${description}

Use bpy.data.objects.new() with these primitive factories: cone_factory, sphere_factory, cube_factory.
For each part, set .location = (x, y, z) and optionally .translate((dx, dy, dz)).
Keep all coordinates between -1 and +1. Make 6-15 parts.

Output the Python code only. No prose, no comments above or below.
`
: `You are a 3D modeling assistant. Output a Wavefront OBJ mesh for the following description.

Description: ${description}

Rules:
- Output ONLY OBJ text. No markdown fences, no commentary, no explanation.
- Use "v x y z" for vertices and "f i j k" or "f i j k l" for faces (1-based indices).
- Keep the mesh between 20-80 vertices total. Low-poly is fine.
- Center the mesh near origin (0,0,0). Scale so it fits in a 2-unit cube (-1 to +1 on each axis).
- Y is up. The mesh should sit on the y=0 plane (no negative-y vertices).
- No materials, no textures, no groups. Just v and f directives.

Output:
`;

        // Stop sequences differ by mode. For C3D-style Python output we
        // CAN'T include "```" because the model's natural first token is
        // often a code fence, which would clip the entire response. We
        // also lengthen the blank-line stop to handle the model's habit
        // of putting multi-line breaks between primitives.
        const defaultStops = isC3D
            ? ["\n\n\n\n"]                  // very long blank-run only
            : ["\n\n\n", "```"];

        const raw = await this.generate(prompt, {
            // Round 159 — use the OBJ-task-specific model when one is
            // configured. The generic this.model is for narrative;
            // letting users wire a code/3D-trained model for meshes is
            // the whole point of the per-task picker.
            // Round 163 — opts.model wins over both, so the AI Pipeline
            // Bench can pin a specific model for measurement without
            // mutating the client's persisted preference.
            model: useModel,
            // Round 161 — OBJ generation streams like narrative. The
            // idle timeout is generous (60s) because:
            //  - C3D-style models think hard about geometry between lines
            //  - Cold-load (first token) often takes 20-40s on CPU
            //  - We just need *some* progress; we'll bail if stuck.
            // Total budget is the client default (10 min), which is fine.
            // Round 169 — bump first-token tolerance to 90s. Ollama is
            // single-model-loaded by default (OLLAMA_MAX_LOADED_MODELS=1)
            // so when an OBJ request follows a narrative one, the swap
            // out of gemma3 + load of C3D can take 60s+ on the user's
            // 1070 Ti. The old 60s cap was catching the load, not the
            // generation.
            idleTimeoutMs: opts.idleTimeoutMs ?? 90_000,
            num_predict: opts.num_predict ?? 1024,
            temperature: opts.temperature ?? 0.4,
            top_k: 50,
            stop: opts.stop ?? defaultStops,
            onProgress: opts.onProgress,
            // Round 169 — keep_alive:0 unloads the OBJ model from VRAM
            // immediately after each request. On an 8GB GPU like the
            // 1070 Ti, C3D 7B (~4.7GB) and gemma3:4b (~3GB) can't both
            // stay loaded — Ollama evicts one when the other is needed,
            // and that swap is the 60s "stall" we kept seeing on the
            // narrative step. Forcing C3D to unload after each OBJ
            // means narrative requests always start with VRAM free and
            // gemma3 can stay resident. Cost: OBJ requests pay a fresh
            // 30-60s load every time. Worth it for predictable behavior.
            keep_alive: opts.keep_alive ?? 0,
        });
        if (!raw) return null;

        // Strip markdown fences if the model added them despite instructions.
        let text = raw.trim();
        text = text.replace(/^```(?:obj|python|py)?\s*/i, "").replace(/```\s*$/i, "");
        // Drop any preamble lines before the first "v " or "# " directive.
        const lines = text.split(/\r?\n/);
        let firstObjLine = -1;
        for (let i = 0; i < lines.length; i++) {
            const t = lines[i].trim();
            if (t.startsWith("v ") || t.startsWith("# ")) { firstObjLine = i; break; }
        }
        if (firstObjLine === -1) {
            // Round 160 — before giving up, try parsing C3D-style Python
            // output. joshuaokolo/C3Dv0 (and similar 3D-tuned models)
            // emit Blender-flavored pseudo-Python instead of raw OBJ:
            //   X = bpy.data.objects.new("X", bpy.data.mesh.cone_factory("cone", 0.5))
            //   X.location = (0.2, 0.3, 0.2)
            //   X.translate((0, 0, 0.2))
            // We can lift shape/size/position out of that and synthesize
            // an OBJ from primitives.
            const fromPython = c3dPythonToOBJ(text);
            if (fromPython) {
                console.log("[OllamaClient] generateOBJ: parsed C3D Python output into OBJ");
                return fromPython;
            }
            // Round 166 — dump a slice of what we got so the parser can
            // be extended. Without this we're blind to which Python
            // flavor the model is producing (bpy.data.objects.new vs
            // bpy.ops.mesh.primitive_*_add vs raw vertex arrays).
            const head = text.slice(0, 400).replace(/\n/g, " ⏎ ");
            const tail = text.length > 400 ? " … [+" + (text.length - 400) + " chars]" : "";
            console.warn("[OllamaClient] generateOBJ: response had no v/# directives and no parseable Python primitives");
            console.warn("[OllamaClient]   first ~400 chars: " + head + tail);
            return null;
        }
        text = lines.slice(firstObjLine).join("\n");
        // Sanity check: must contain at least one v and one f
        if (!text.includes("v ") || !text.includes("f ")) {
            // Round 167 — also try the Python parser here. C3D's output
            // often begins with `# Create the X` comments, which fool
            // the v/# detector into thinking it's a valid OBJ. We only
            // discover the misclassification when the v/f scan comes up
            // empty. Try the Python extractor on the ORIGINAL text
            // (raw, not the truncated slice) before giving up.
            const fromPython = c3dPythonToOBJ(raw);
            if (fromPython) {
                console.log("[OllamaClient] generateOBJ: parsed C3D Python output into OBJ (recovered from misclassified comment)");
                return fromPython;
            }
            // Round 166 — dump the head of the response so we can see
            // why parse failed. Common patterns we've seen but don't
            // yet handle: bpy.ops.mesh.primitive_cone_add(), raw vertex
            // arrays without faces, function-wrapped output.
            const head = text.slice(0, 400).replace(/\n/g, " ⏎ ");
            const tail = text.length > 400 ? " … [+" + (text.length - 400) + " chars]" : "";
            console.warn("[OllamaClient] generateOBJ: response missing v or f directives");
            console.warn("[OllamaClient]   first ~400 chars: " + head + tail);
            // Round 176 — notify any registered parse-fail listeners
            // (FailedOBJStore is the only one in practice). We pass
            // both the description and the raw text so the listener
            // has enough context to make the entry useful for parser
            // improvement work later.
            OllamaClient._notifyParseFail({
                model:   useModel,
                prompt:  description,
                rawText: text,
                reason:  "response missing v or f directives",
                source:  opts.source ?? "engine",   // overridable by caller
            });
            return null;
        }
        return text;
    }

    // Re-enable LLM calls after a transient outage. Forces the next
    // generate() to re-probe instead of short-circuiting on
    // available=false. Useful if you start ollama / pull a model after
    // the page is already running.
    reset() {
        this.available = null;
        this._warnedGenFail = false;
        this._warnedDown = false;
    }

    snapshot() {
        return {
            available: this.available,
            model: this.model,
            calls: this.totalCalls,
            fails: this.totalFails,
            avgLatencyMs: this.totalCalls > 0
                ? Math.round(this.totalLatencyMs / Math.max(1, this.totalCalls - this.totalFails))
                : 0,
        };
    }
}

// ===========================================================================
// Round 160 — C3D Python-to-OBJ parser.
//
// joshuaokolo/C3Dv0 and similar 3D-tuned models are trained to emit
// Blender Python (specifically, a hallucinated bpy.data.mesh.X_factory
// API; the calls aren't real but the structure is consistent). The
// engine wants raw Wavefront OBJ. This parser bridges the gap: it
// extracts shape/size/position triples from the Python and synthesizes
// an OBJ from low-poly primitives (octahedra for spheres, cones for
// cones, cubes for everything else).
//
// Output isn't faithful — the model's own intent is fuzzy and often
// repetitive ("cat_tail_tip", "cat_tail_tip2", many at identical
// positions). But the result is a real OBJ with positioned primitives
// that beats falling back to a generic placeholder cube.
//
// Exported for testing; production callers use OllamaClient.generateOBJ.
export function c3dPythonToOBJ(text) {
    if (!text || typeof text !== "string") return null;
    // Detect Python: must have bpy. usage somewhere. Cheap gate.
    if (!/\bbpy\.|\bimport\s+bpy\b/.test(text)) return null;

    // Parts indexed by variable name so .location / .translate can find them.
    const parts = new Map();   // varName → {shape, size, pos:[x,y,z]}

    // ----- Strategy A: canonical bpy.data.mesh.SHAPE_factory("name", SIZE) -----
    // VAR = bpy.data.objects.new("name", bpy.data.mesh.<shape>_factory("...", SIZE
    // Tolerates the model collapsing multiple statements onto one line.
    const objRe = /(\w+)\s*=\s*bpy\.data\.objects\.new\s*\(\s*"[^"]*"\s*,\s*bpy\.data\.mesh\.(\w+)_factory\s*\(\s*"\w+"\s*,\s*(-?[\d.]+)/g;
    for (const m of text.matchAll(objRe)) {
        const varName = m[1];
        const shape   = m[2].toLowerCase();
        const size    = Math.max(0.05, parseFloat(m[3]) || 0.3);
        if (!parts.has(varName)) {
            parts.set(varName, { shape, size, pos: [0, 0, 0] });
        }
    }

    // ----- Strategy C: hallucinated factory patterns (round 169 / v664) -----
    // Recent C3D outputs frequently emit patterns the canonical regex doesn't
    // match. Two flavors observed in the wild:
    //
    //   C1) Bare factory reference (no function call):
    //         cone_factory   = bpy.data.objects.new('cone',   cone_primitive_factory)
    //         sphere_factory = bpy.data.objects.new('sphere', sphere_primitive_factory)
    //
    //   C2) name=/type= keyword args:
    //         cone_factory   = bpy.data.objects.new(name="cone",   type="CONE")
    //         sphere_factory = bpy.data.objects.new(name="sphere", type="SPHERE")
    //         cube_factory   = bpy.data.objects.new(name="cube",   type="CUBE")
    //
    // Both extract the shape from the first string literal and default size
    // to 0.3 (no size info available in the constructor itself; .scale()
    // calls handled later may amend it).
    //
    // C1 — positional first arg is the shape string
    const c1Re = /(\w+)\s*=\s*bpy\.data\.objects\.new\s*\(\s*['"](\w+)['"]\s*,\s*\w+_(?:primitive_)?factory\s*\)/g;
    for (const m of text.matchAll(c1Re)) {
        const varName = m[1];
        const shape   = m[2].toLowerCase();
        if (!parts.has(varName)) {
            parts.set(varName, { shape, size: 0.3, pos: [0, 0, 0] });
        }
    }
    // C2 — name="..." keyword
    const c2Re = /(\w+)\s*=\s*bpy\.data\.objects\.new\s*\(\s*name\s*=\s*['"](\w+)['"]/g;
    for (const m of text.matchAll(c2Re)) {
        const varName = m[1];
        const shape   = m[2].toLowerCase();
        if (!parts.has(varName)) {
            parts.set(varName, { shape, size: 0.3, pos: [0, 0, 0] });
        }
    }

    // ----- Strategy B: def-style fallback -----
    // C3D often emits function-defined hierarchies that NEVER call
    // bpy.data.objects.new in a parseable form. See _extractDefStyleParts
    // for examples. Only runs if A and C both produced nothing.
    if (parts.size === 0) {
        const defParts = _extractDefStyleParts(text);
        for (const [varName, part] of defParts) parts.set(varName, part);
    }

    if (parts.size === 0) return null;

    // ----- Position evaluation -----
    // Round 169 — `random.uniform(MIN, MAX)` arguments are common in the
    // hallucinated outputs. Evaluate them deterministically using a small
    // seeded RNG keyed off the input text so the same prompt produces the
    // same mesh across reloads (asset caching depends on this).
    const rng = _mulberry32(_hashString(text));
    const evalNum = (raw) => {
        const t = raw.trim();
        if (/^-?[\d.]+$/.test(t)) return parseFloat(t);
        const uni = t.match(/random\.uniform\s*\(\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*\)/);
        if (uni) {
            const lo = parseFloat(uni[1]), hi = parseFloat(uni[2]);
            return lo + (hi - lo) * rng();
        }
        const ru = t.match(/random\.random\s*\(\s*\)/);
        if (ru) return rng();
        return 0;   // unrecognised expression
    };

    // Match: VAR.location = (EXPR, EXPR, EXPR) where EXPR can be a literal
    // or random.uniform(a,b). Captures the 3-arg group lazily and splits.
    const locRe = /(\w+)\.location\s*=\s*\(\s*([^)]+(?:\([^)]*\)[^)]*)?)\s*\)/g;
    for (const m of text.matchAll(locRe)) {
        const p = parts.get(m[1]);
        if (!p) continue;
        const args = _splitTopLevelCommas(m[2]);
        if (args.length === 3) {
            p.pos = [evalNum(args[0]), evalNum(args[1]), evalNum(args[2])];
        }
    }
    // Match: VAR.translate((EXPR, EXPR, EXPR)) — additive over location.
    // Also catches the `VAR = VAR.translate(...)` reassignment form C2 uses.
    const transRe = /(\w+)(?:\s*=\s*\w+)?\.translate\s*\(\s*\(\s*([^)]+(?:\([^)]*\)[^)]*)?)\s*\)/g;
    for (const m of text.matchAll(transRe)) {
        const p = parts.get(m[1]);
        if (!p) continue;
        const args = _splitTopLevelCommas(m[2]);
        if (args.length === 3) {
            p.pos[0] += evalNum(args[0]);
            p.pos[1] += evalNum(args[1]);
            p.pos[2] += evalNum(args[2]);
        }
    }
    // Match: VAR = VAR.scale(N) — multiplies size. The model's scale() takes
    // either a single scalar or a (sx, sy, sz) tuple; we treat both as a
    // uniform multiplier (use max for the tuple case).
    const scaleRe = /(\w+)\s*=\s*\w+\.scale\s*\(\s*([^)]+(?:\([^)]*\)[^)]*)?)\s*\)/g;
    for (const m of text.matchAll(scaleRe)) {
        const p = parts.get(m[1]);
        if (!p) continue;
        const args = _splitTopLevelCommas(m[2]);
        let mul = 1;
        if (args.length === 1) mul = evalNum(args[0]) || 1;
        else                   mul = Math.max(...args.map(evalNum).map(v => Math.abs(v) || 1));
        p.size *= mul;
        if (!Number.isFinite(p.size) || p.size <= 0.01) p.size = 0.3;   // sanity
    }

    // Build OBJ by stacking primitives. Each primitive's vertices are
    // appended to a shared list; faces use 1-based indices offset by
    // baseIdx so they reference the correct verts after concatenation.
    const verts = [];   // [[x,y,z], ...]
    const faces = [];   // [[i,j,k], ...]
    for (const p of parts.values()) {
        const baseIdx = verts.length;
        if (p.shape === "sphere" || p.shape === "ball" || p.shape === "icosphere") _addOctahedron(verts, faces, p.pos, p.size, baseIdx);
        else if (p.shape === "cone" || p.shape === "pyramid")                       _addCone(verts, faces, p.pos, p.size, baseIdx);
        else if (p.shape === "cube" || p.shape === "box")                           _addCube(verts, faces, p.pos, p.size, baseIdx);
        else                                                                         _addCube(verts, faces, p.pos, p.size, baseIdx);   // fallback
    }
    if (verts.length === 0) return null;

    // Center + uniform-scale to fit a 2-unit cube. Also lift so the
    // mesh's lowest vertex sits on y=0 (engine convention from the OBJ
    // prompt rules; renders sit flush on the ground plane).
    _normalizeOBJ(verts);

    let obj = `# Generated by C3D Python parser (${parts.size} primitives)\n`;
    for (const v of verts) obj += `v ${v[0].toFixed(3)} ${v[1].toFixed(3)} ${v[2].toFixed(3)}\n`;
    for (const f of faces) obj += `f ${f[0]} ${f[1]} ${f[2]}\n`;
    return obj;
}

// ---- support helpers for Strategy C (round 169) ----

// Deterministic seeded RNG (mulberry32) so the same input text produces
// the same `random.uniform(...)` evaluations across reloads — critical
// for asset caching: the same prompt must yield the same mesh.
function _mulberry32(seed) {
    let a = seed >>> 0;
    return function() {
        a = (a + 0x6D2B79F5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
function _hashString(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return h >>> 0;
}
// Split "a, b, random.uniform(-1, 1)" into ["a", "b", "random.uniform(-1, 1)"]
// — naive splits on every comma would break the function call's internal commas.
// We track paren depth and only split at depth 0.
function _splitTopLevelCommas(s) {
    const out = [];
    let depth = 0, start = 0;
    for (let i = 0; i < s.length; i++) {
        const c = s[i];
        if (c === "(" || c === "[" || c === "{") depth++;
        else if (c === ")" || c === "]" || c === "}") depth--;
        else if (c === "," && depth === 0) {
            out.push(s.slice(start, i));
            start = i + 1;
        }
    }
    out.push(s.slice(start));
    return out.map(x => x.trim()).filter(x => x.length);
}

// ---- primitive builders (1-based face indices) ----

// Octahedron — 6 verts, 8 tris. Stand-in for "sphere".
function _addOctahedron(verts, faces, pos, size, baseIdx) {
    const [x, y, z] = pos, r = size;
    const v0 = baseIdx + 1;
    verts.push([x,     y + r, z    ]);    // top
    verts.push([x + r, y,     z    ]);    // +X
    verts.push([x,     y,     z + r]);    // +Z
    verts.push([x - r, y,     z    ]);    // -X
    verts.push([x,     y,     z - r]);    // -Z
    verts.push([x,     y - r, z    ]);    // bottom
    faces.push([v0,     v0 + 1, v0 + 2]);
    faces.push([v0,     v0 + 2, v0 + 3]);
    faces.push([v0,     v0 + 3, v0 + 4]);
    faces.push([v0,     v0 + 4, v0 + 1]);
    faces.push([v0 + 5, v0 + 2, v0 + 1]);
    faces.push([v0 + 5, v0 + 3, v0 + 2]);
    faces.push([v0 + 5, v0 + 4, v0 + 3]);
    faces.push([v0 + 5, v0 + 1, v0 + 4]);
}

// Cone — apex + 6-segment base ring. 7 verts, 12 tris (6 side + 6 fan base).
function _addCone(verts, faces, pos, size, baseIdx) {
    const [x, y, z] = pos, r = size;
    const v0 = baseIdx + 1;
    verts.push([x, y + r, z]);           // apex
    const segs = 6;
    for (let i = 0; i < segs; i++) {
        const a = (i / segs) * Math.PI * 2;
        verts.push([x + r * Math.cos(a), y, z + r * Math.sin(a)]);
    }
    // Side faces (apex → ring[i] → ring[i+1])
    for (let i = 0; i < segs; i++) {
        const a = v0 + 1 + i;
        const b = v0 + 1 + ((i + 1) % segs);
        faces.push([v0, a, b]);
    }
    // Base (fan around ring[0])
    for (let i = 1; i < segs - 1; i++) {
        faces.push([v0 + 1, v0 + 1 + i + 1, v0 + 1 + i]);
    }
}

// Unit cube — 8 verts, 12 tris.
function _addCube(verts, faces, pos, size, baseIdx) {
    const [x, y, z] = pos, s = size;
    const v0 = baseIdx + 1;
    verts.push([x - s, y - s, z - s]);   // 0: ---
    verts.push([x + s, y - s, z - s]);   // 1: +--
    verts.push([x + s, y + s, z - s]);   // 2: ++-
    verts.push([x - s, y + s, z - s]);   // 3: -+-
    verts.push([x - s, y - s, z + s]);   // 4: --+
    verts.push([x + s, y - s, z + s]);   // 5: +-+
    verts.push([x + s, y + s, z + s]);   // 6: +++
    verts.push([x - s, y + s, z + s]);   // 7: -++
    const tri = (a, b, c) => faces.push([v0 + a, v0 + b, v0 + c]);
    // -Z face
    tri(0, 2, 1); tri(0, 3, 2);
    // +Z face
    tri(4, 5, 6); tri(4, 6, 7);
    // -X face
    tri(0, 4, 7); tri(0, 7, 3);
    // +X face
    tri(1, 2, 6); tri(1, 6, 5);
    // -Y face
    tri(0, 1, 5); tri(0, 5, 4);
    // +Y face
    tri(3, 7, 6); tri(3, 6, 2);
}

// Center the mesh on (0, y_lift, 0) and scale to fit [-1, 1]^3, with
// the lowest vertex sitting at y = 0 (sit-on-ground convention).
function _normalizeOBJ(verts) {
    if (verts.length === 0) return;
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    let minZ = Infinity, maxZ = -Infinity;
    for (const [x, y, z] of verts) {
        if (x < minX) minX = x;  if (x > maxX) maxX = x;
        if (y < minY) minY = y;  if (y > maxY) maxY = y;
        if (z < minZ) minZ = z;  if (z > maxZ) maxZ = z;
    }
    const cx = (minX + maxX) / 2;
    const cz = (minZ + maxZ) / 2;
    const sx = maxX - minX, sy = maxY - minY, sz = maxZ - minZ;
    const maxDim = Math.max(sx, sy, sz, 1e-6);
    const scale = 2 / maxDim;   // fit longest axis into [-1, 1]
    for (const v of verts) {
        v[0] = (v[0] - cx) * scale;
        v[1] = (v[1] - minY) * scale;     // lift floor to y=0
        v[2] = (v[2] - cz) * scale;
    }
}

// ===========================================================================
// Round 167 — Strategy B for c3dPythonToOBJ. Used as a fallback when the
// canonical `var = bpy.data.objects.new("X", bpy.data.mesh.Y_factory(...))`
// regex matches nothing. Many C3D outputs in practice look like:
//
//     def create_head(kaiju):
//         head = bpy.data.objects.new("Head", None)
//         head = head.union(cone_factory(kaiju, 0.1))
//         head = head.union(sphere_factory(kaiju, 0.1))
//         head = head.union(cube_factory(kaiju, 0.1))
//
// — function-wrapped, factories called with positional args, no .location.
// Strategy A would miss this entirely. Strategy B reads it as a parts list:
// each `def create_X(...)` is one anatomical part, and each {cone,sphere,
// cube}_factory inside its body adds a primitive to that part's bundle.
// Positions come from the part NAME via anatomical priors (head=top,
// body=middle, leg=bottom, tail=behind, tusk/horn=on head, etc.). The
// result is a recognizable, well-arranged creature blob, even though
// the model's code wouldn't run in Blender.
// ===========================================================================
function _extractDefStyleParts(text) {
    const parts = new Map();
    // Match `def create_<name>(...)` and capture up to the next `def ` or end.
    const defRe = /def\s+(?:create_)?(\w+)\s*\([^)]*\)\s*:([\s\S]*?)(?=\n\s*def\s|$)/g;
    const counters = new Map();   // partKey → numeric suffix for duplicates
    let defMatch;
    while ((defMatch = defRe.exec(text)) !== null) {
        const rawName = defMatch[1].toLowerCase();
        const body    = defMatch[2];
        // Skip the top-level wrapper (`create_kaiju`, `create_civ`, etc.)
        // — it doesn't contain primitives directly, only sub-part calls.
        if (rawName === "kaiju" || rawName === "civ" || rawName === "structure") continue;

        // Count cone/sphere/cube factory calls inside this def body.
        // Round 169 — also recognize cadex-style hallucinations:
        //   cadex_factory.cone(...) / cadex_factory.sphere(...) / .cube(...)
        //   cadex_primitive.Cone / .Sphere / .Cube
        // Same semantics — a primitive of that shape was requested. Less
        // signal on size (Cone() with no args = unknown size) so we fall
        // back to the default baseSize for those.
        const factoryRe = /\b(?:(cone|sphere|cube)_factory|cadex_factory\.(cone|sphere|cube)|cadex_primitive\.(Cone|Sphere|Cube)|\.\s*(cone|sphere|cube)\s*\()\s*\(?/gi;
        const factories = [];
        for (const m of body.matchAll(factoryRe)) {
            const raw = m[1] || m[2] || m[3] || m[4];
            if (raw) factories.push([m[0], raw.toLowerCase()]);
        }
        if (factories.length === 0) continue;

        // The size argument is the second positional: `cone_factory(kaiju, 0.1)`.
        // Pull it from the first factory call; default to 0.15 if absent.
        const sizeMatch = body.match(/\b(?:cone|sphere|cube)_factory\s*\([^,)]*,\s*(-?[\d.]+)/);
        const baseSize  = sizeMatch ? Math.max(0.05, parseFloat(sizeMatch[1]) || 0.15) : 0.15;

        // Compute anatomical center + axis-direction for the named part.
        const layout = _anatomicalLayout(rawName);

        // One primitive per factory call. Spread them along the part's
        // long axis so e.g. a "body" with 3 cubes makes a torso-like
        // segmented row rather than 3 overlapping cubes.
        const n = Math.min(factories.length, 8);   // cap to keep mesh small
        for (let i = 0; i < n; i++) {
            const t = (n === 1) ? 0 : (i / (n - 1)) - 0.5;   // [-0.5, +0.5]
            const offset = layout.axis.map(a => a * t * layout.spread);
            const pos = [
                layout.pos[0] + offset[0],
                layout.pos[1] + offset[1],
                layout.pos[2] + offset[2],
            ];
            const shape = factories[i][1].toLowerCase();
            const key = `${rawName}_${i}`;
            const suffix = (counters.get(key) || 0);
            counters.set(key, suffix + 1);
            // Slight size jitter per primitive so segments aren't identical
            const size = baseSize * (0.8 + 0.4 * (i / Math.max(1, n - 1)));
            parts.set(`${key}_${suffix}`, { shape, size, pos });
        }
    }
    return parts;
}

// Anatomical priors used by the def-style extractor. Returns a default
// position, an axis direction along which to spread multiple primitives,
// and a total spread distance. Coordinates are in a unit cube centered
// at origin; _normalizeOBJ() will re-fit afterward.
function _anatomicalLayout(partName) {
    const n = partName.toLowerCase();
    // Head-cluster: head, skull, face, jaw, neck
    if (/^(head|skull|face|jaw|neck|brain)/.test(n))
        return { pos: [0,  0.55, 0],   axis: [0, 0.2, 0], spread: 0.15 };
    // Body / torso / chest / belly — the central mass, spread along Y
    if (/^(body|torso|chest|belly|core|abdomen)/.test(n))
        return { pos: [0,  0.2,  0],   axis: [0, 0.4, 0], spread: 0.4 };
    // Spine plates / dorsal — top of body, spread along Z (front-to-back)
    if (/spine|dorsal|plate|fin/.test(n))
        return { pos: [0,  0.45, 0],   axis: [0, 0, 0.5], spread: 0.7 };
    // Tail / whip — behind, spread along Z
    if (/tail|whip/.test(n))
        return { pos: [0,  0.15, 0.6], axis: [0, 0.1, 0.5], spread: 0.5 };
    // Tusks / horns / spikes — on the head, spread along X
    if (/tusk|horn|spike|antler/.test(n))
        return { pos: [0,  0.65, 0.05], axis: [0.5, 0, 0], spread: 0.3 };
    // Wings — sides of body, spread along X
    if (/wing/.test(n))
        return { pos: [0,  0.4, -0.1], axis: [0.6, 0, 0], spread: 0.9 };
    // Legs / limbs — bottom of body. Index in name (leg1, leg2, ...)
    // decides quadrant; default to front-left if no number.
    if (/^(leg|limb|paw|foot|claw|arm|hand)/.test(n)) {
        const m = n.match(/(\d+)/);
        const idx = m ? (parseInt(m[1], 10) % 4) : 0;
        const x = (idx === 0 || idx === 3) ? -0.3 : 0.3;
        const z = (idx === 0 || idx === 1) ?  0.2 : -0.2;
        return { pos: [x, -0.15, z], axis: [0, -0.4, 0], spread: 0.4 };
    }
    // Ring / wall — annulus, spread in a circle (degenerate axis means
    // we don't really stretch them; they end up clustered at center).
    if (/ring|wall|fence|fortif/.test(n))
        return { pos: [0,  0.1,  0],   axis: [0, 0.3, 0], spread: 0.3 };
    // Tower / pillar / spire — vertical stack
    if (/tower|pillar|spire|column|obelisk|monolith/.test(n))
        return { pos: [0,  0.4,  0],   axis: [0, 0.6, 0], spread: 0.7 };
    // Plaza / floor — flat low spread along X/Z
    if (/plaza|floor|pad|platform/.test(n))
        return { pos: [0,  0.05, 0],   axis: [0.4, 0, 0.4], spread: 0.5 };
    // Default — small jitter cluster at origin
    return { pos: [0,  0.3,  0], axis: [0.2, 0.2, 0.2], spread: 0.3 };
}
