// FILE: ui/HeartbeatAvatar.js
//
// Round 92 — Ollama heartbeat avatar.
//
// A small (1/4 PIP size, ~80×80px) mascot anchored just above the Pip
// character window. Shows one of four states reflecting the LLM
// pipeline's activity:
//
//   "idle"        — Ollama present and quiet. Avatar sits/sleeps, Zzz floats up.
//   "active"      — A generate request is in-flight. Avatar perks up,
//                   spinning gear orbits its head.
//   "result"      — A request just completed. Avatar jumps with a "!"
//                   bark bubble. Auto-times-out back to idle after 1.2s.
//   "offline"     — Ollama unreachable (probe failed). Dead-cat pose:
//                   on its back, four legs up, X X eyes. Stays until the
//                   ollama client reports activity again.
//
// SUBSCRIBES TO OllamaClient.onActivity():
//   "started"     -> active
//   "completed"   -> result (then back to idle after a hold)
//   "failed"      -> result (with a frown), then idle
//   "unreachable" -> offline
//
// FUTURE: replace SVG with a small 3D canvas rendering a C3D-generated
// OBJ — VariantExpander could be asked at startup for a "heartbeat_
// mascot" description, the resulting model could rotate idle / accelerate
// during requests / jump on completion. This SVG version is the always-
// works baseline.

// Round 271 — phoneme curve for text-driven OLLAMA mouth animation.
// Aliased as _phonemeBuild / _phonemeSample so the inline references
// inside the class read cleanly.
import {
    buildAmplitudeCurve as _phonemeBuild,
    sampleCurveAt       as _phonemeSample,
} from "../face/PhonemeMouth.js";

// Round 295 — module-scope scratch matrices for the 3D render path.
// Was new Float32Array(16) × 2 per frame; with the avatar visible at
// 60fps that was ~120 allocs/sec churning the GC unnecessarily.
const _HEARTBEAT_MODEL_SCRATCH = new Float32Array(16);
const _HEARTBEAT_VP_SCRATCH    = new Float32Array(16);

export class HeartbeatAvatar {
    constructor({ parent = document.body, ollama = null, assetLoader = null, assetName = "heartbeat_mascot_v1" } = {}) {
        this.ollama = ollama;
        this.assetLoader = assetLoader;
        this.assetName = assetName;     // which cached mesh to render in 3D mode
        this.state = "idle";
        this._lastEvent = null;
        this._resultTimer = null;
        // Round 93 — 3D rendering state. Populated when the C3D-generated
        // mesh becomes available in assetLoader.cache.
        this._gl = null;
        this._mesh3D = null;            // { vao, indexCount, vertexCount, hasIndex, hasNormals, hasColors, cx, cy, cz, norm }
        this._rafHandle = null;
        this._build(parent);
        if (ollama?.onActivity) {
            this._unsub = ollama.onActivity((evt) => this._onActivity(evt));
        }
        // Subscribe to mesh-replaced events so we pick up the C3D OBJ
        // as soon as it's generated + cached. Also poll on a 2s cadence
        // in case the mesh was loaded BEFORE this widget mounted.
        if (assetLoader?.onMeshReplaced) {
            assetLoader.onMeshReplaced((name) => {
                if (name === this.assetName) this._tryActivate3D();
            });
        }
        // Initial poll + periodic until 3D activates
        this._tryActivate3D();
        this._pollHandle = setInterval(() => {
            if (this._mesh3D) {
                clearInterval(this._pollHandle);
                this._pollHandle = null;
                return;
            }
            this._tryActivate3D();
        }, 2000);
        // If the ollama client has already determined offline status by
        // the time we mount, reflect that immediately.
        if (ollama && ollama.available === false) {
            this.setState("offline");
        }
        // Round 102 — dock to Pip. Pip auto-sizes with its stat bars, so
        // a fixed `bottom: 240px` drifts out of alignment when Pip grows
        // or shrinks. Polling Pip's actual bounding box every 500ms is
        // cheap and keeps the avatar visually attached to Pip's top.
        this._startDocking("tama-window", 6);

        // v852 — busy-level tracking. Concurrent AI activity count.
        // When >= 2 in flight OR a single activity has been running for
        // > 4s, escalate from "active" to "super_busy" (running legs).
        this._activeCount = 0;
        this._activeStartedAt = 0;
        this._busyEscalateTimer = null;

        // v852 — yawn timer. During IDLE, every 20-60s the llama briefly
        // yawns (stretches, opens mouth ~1s, returns to sleep). Kicks off
        // a few seconds after mount so the user sees the first yawn
        // without waiting forever.
        this._yawnTimer = null;
        this._isYawning = false;
        this._scheduleYawn(8000 + Math.random() * 4000);
        // v854 — graze timer (less frequent than yawn, alternates with it
        // naturally since both check state===idle && not-other-busy).
        this._grazeTimer = null;
        this._isGrazing = false;
        this._scheduleGraze(15000 + Math.random() * 15000);

        // v853 — error capture pipeline. Listens for engine:bridge-down,
        // engine:iframe-error, engine:error window events; logs each to
        // a ring buffer; sets state to offline (dead-eye) on each one.
        // Exposes window.heartbeat = this so user can run
        // heartbeat.exportErrors() to share the log with Claude.
        this._initErrorCapture();
    }

    // v852 — Public hook: engine can call setBusyLevel(n) where n is the
    // current concurrent AI activity count. 0 -> idle, 1 -> active,
    // >=2 -> super_busy. Internal _onActivity also drives this via
    // _activeCount tracking.
    setBusyLevel(n) {
        n = Math.max(0, Math.floor(+n || 0));
        this._activeCount = n;
        if (n >= 2) this.setState("super_busy");
        else if (n === 1) this.setState("active");
        else if (this.state === "active" || this.state === "super_busy") this.setState("idle");
    }

    // v852 — Yawn animation during idle. Briefly swaps to a stretched
    // pose by toggling a .hb-yawning class on the idle group, which
    // applies hb-yawn-stretch keyframe. After ~1s, returns to normal
    // sleep. Reschedules itself for the next yawn (20-60s window).
    _scheduleYawn(delayMs) {
        if (this._yawnTimer) clearTimeout(this._yawnTimer);
        const delay = (typeof delayMs === "number") ? delayMs : (20000 + Math.random() * 40000);
        this._yawnTimer = setTimeout(() => {
            // Only yawn if the llama is actually sleeping. If it's
            // active/super_busy/result/offline, just reschedule.
            if (this.state === "idle" && !this._isYawning) this._doYawn();
            this._scheduleYawn();
        }, delay);
    }

    _doYawn() {
        if (!this._svg) return;
        const idleGroup = this._svg.querySelector("#hb-state-idle .hb-body");
        if (!idleGroup) return;
        this._isYawning = true;
        // Apply the stretch keyframe via inline style — runs once.
        idleGroup.style.animation = "hb-yawn-stretch 1.05s ease-in-out";
        idleGroup.style.transformOrigin = "55px 78px";
        // Also briefly insert an open-mouth oval at the snout position
        // (28,52) snout is at (22,54) — overlay an open mouth there.
        const NS = "http://www.w3.org/2000/svg";
        const mouth = document.createElementNS(NS, "ellipse");
        mouth.setAttribute("cx", "20");
        mouth.setAttribute("cy", "54");
        mouth.setAttribute("rx", "2.5");
        mouth.setAttribute("ry", "2");
        mouth.setAttribute("fill", "#1a2a3a");
        mouth.setAttribute("class", "hb-yawn-mouth");
        idleGroup.appendChild(mouth);
        setTimeout(() => {
            try {
                idleGroup.style.animation = "";
                if (mouth.parentNode === idleGroup) idleGroup.removeChild(mouth);
            } catch {}
            this._isYawning = false;
        }, 1050);
    }

    // v854 — Graze idle behavior. Less frequent than yawn (every
    // ~30-90s). The llama briefly lowers its head + tilts as if
    // grazing on grass. Plays for ~1.5s then back to sleep. Reschedules.
    _scheduleGraze(delayMs) {
        if (this._grazeTimer) clearTimeout(this._grazeTimer);
        const delay = (typeof delayMs === "number") ? delayMs : (30000 + Math.random() * 60000);
        this._grazeTimer = setTimeout(() => {
            if (this.state === "idle" && !this._isYawning && !this._isGrazing) this._doGraze();
            this._scheduleGraze();
        }, delay);
    }

    _doGraze() {
        if (!this._svg) return;
        const idleGroup = this._svg.querySelector("#hb-state-idle .hb-body");
        if (!idleGroup) return;
        this._isGrazing = true;
        idleGroup.style.animation = "hb-graze 1.6s ease-in-out";
        idleGroup.style.transformOrigin = "28px 52px";  // pivot near head
        setTimeout(() => {
            try { idleGroup.style.animation = ""; } catch {}
            this._isGrazing = false;
        }, 1620);
    }

    // ─── v853: Dead-eye error capture pipeline ──────────────────────
    //
    // The dead-llama "offline" artwork is repurposed as a generic error
    // indicator: the llama goes dead-eye when ANY of these fail —
    //   - Ollama unreachable (existing: case "unreachable")
    //   - Engine bridge WS disconnect (new)
    //   - Iframe (kpavatar) load failure on Shield or PC (new)
    //   - Generic engine errors dispatched by main.js (new)
    //
    // Each error gets logged to a ring buffer (last 100). The user can
    // call window.heartbeat.exportErrors() to copy the log to clipboard
    // for sharing with Claude when debugging Shield glb load problems.
    //
    // Wired via window events (loose coupling) — main.js / PipAvatar
    // dispatch the events; the avatar listens passively. This means
    // HeartbeatAvatar doesn't need bridge/iframe refs in its constructor.
    _initErrorCapture() {
        this._errorLog = [];        // ring buffer of {ts, source, message, detail}
        this._errorLogMax = 100;
        this._errorSource = null;   // most recent reason llama is dead-eye

        // Bridge disconnect / reconnect — engine main.js dispatches these
        window.addEventListener("engine:bridge-down", (e) => {
            const detail = e?.detail || {};
            this.recordError({ source: "bridge", message: detail.reason || "WS disconnected", detail });
            this._errorSource = "bridge";
            this.setState("offline");
        });
        window.addEventListener("engine:bridge-up", () => {
            // If we went offline FOR bridge reasons specifically, recover.
            // Don't overwrite ollama-unreachable offline state.
            if (this._errorSource === "bridge" && this.state === "offline") {
                this._errorSource = null;
                this.setState("idle");
            }
        });

        // Iframe error — PipAvatar dispatches when iframe.onerror fires
        // or when RobotExpressive.html postMessages an error.
        window.addEventListener("engine:iframe-error", (e) => {
            const detail = e?.detail || {};
            this.recordError({
                source: "iframe",
                message: detail.message || "iframe error",
                detail,
            });
            this._errorSource = "iframe";
            this.setState("offline");
        });

        // Generic engine errors — main.js can dispatch this for any
        // serious runtime problem (renderer crash, asset pipeline fail,
        // etc) that warrants a visual indicator + log entry.
        window.addEventListener("engine:error", (e) => {
            const detail = e?.detail || {};
            this.recordError({
                source: detail.source || "engine",
                message: detail.message || "engine error",
                detail,
            });
            this._errorSource = detail.source || "engine";
            this.setState("offline");
        });

        // Expose the export API on window for console access. User can
        // run `heartbeat.exportErrors()` and paste the JSON into Claude.
        try { window.heartbeat = this; } catch {}

        // ─── v861: Generator-side concurrency for the busy counter ──
        //
        // Listen to window "ai:activity" events from non-Ollama sources
        // (Diffuser, ComfyUI). Ollama events also fire on this channel
        // but we skip them here because OllamaClient.onActivity already
        // drives _activeCount via the direct callback path (_onActivity).
        // Skipping ollama here avoids double-counting.
        //
        // Per-source counter so we can show which generator is busy
        // and so a fail event correctly decrements its own source.
        // Total concurrent = ollama _activeCount + sum of these.
        this._extraActiveCounts = { diffuser: 0, comfyui: 0 };
        window.addEventListener("ai:activity", (e) => {
            const d = e?.detail || {};
            const src = String(d.source || "");
            if (!src || src === "ollama") return;          // Ollama is via direct callback
            if (!(src in this._extraActiveCounts)) {
                this._extraActiveCounts[src] = 0;          // dynamic-add unknown sources
            }
            const evt = d.event;
            if (evt === "started") {
                this._extraActiveCounts[src]++;
                this._refreshBusyFromAllSources();
            } else if (evt === "completed" || evt === "failed") {
                this._extraActiveCounts[src] = Math.max(0, this._extraActiveCounts[src] - 1);
                this._refreshBusyFromAllSources();
            }
        });
    }

    // v861 — recompute state from the combined per-source counts
    // (ollama + non-ollama). Total >=2 → super_busy; 1 → active;
    // 0 → idle. Mirrors the existing _onActivity escalation logic
    // but works across all generators.
    _refreshBusyFromAllSources() {
        const ollama = this._activeCount || 0;
        const extras = Object.values(this._extraActiveCounts || {})
            .reduce((a, n) => a + n, 0);
        const total = ollama + extras;
        // Only escalate FORWARD here; don't tear down active result
        // animations or override offline. If we're currently in result
        // (just finished a generation) keep that until its hold timer.
        if (this.state === "result") return;
        if (this.state === "offline") return;
        if (total >= 2) this.setState("super_busy");
        else if (total === 1 && this.state !== "active") this.setState("active");
        else if (total === 0 && (this.state === "active" || this.state === "super_busy")) {
            this.setState("idle");
        }
    }

    // Public: record an error in the ring buffer. Source is a short tag
    // ("bridge" | "iframe" | "ollama" | "engine" | "shield" | etc).
    // Returns the entry that was added.
    recordError({ source = "unknown", message = "", detail = null } = {}) {
        if (!Array.isArray(this._errorLog)) this._errorLog = [];
        const entry = {
            ts: Date.now(),
            iso: new Date().toISOString(),
            source: String(source),
            message: String(message).slice(0, 500),
            detail: detail || null,
        };
        this._errorLog.push(entry);
        // Trim to ring-buffer max
        while (this._errorLog.length > (this._errorLogMax || 100)) {
            this._errorLog.shift();
        }
        // Also surface via console for debugability — visible in the
        // engine page's devtools.
        try { console.warn(`[heartbeat:${source}]`, message, detail || ""); } catch {}
        return entry;
    }

    // Public: get the current error log (snapshot, safe to log/paste).
    getErrors() {
        return Array.isArray(this._errorLog) ? this._errorLog.slice() : [];
    }

    // Public: export the error log as JSON. Tries clipboard first,
    // falls back to console. Returns the JSON string so the caller can
    // also stash it. Truncates each entry's detail to ~1KB to keep the
    // export pastable into a chat box.
    async exportErrors() {
        const trim = (d) => {
            if (d == null) return null;
            try {
                const s = JSON.stringify(d);
                return s.length > 1024 ? s.slice(0, 1024) + "…[trimmed]" : d;
            } catch { return String(d).slice(0, 1024); }
        };
        const snap = this.getErrors().map(e => ({ ...e, detail: trim(e.detail) }));
        const payload = {
            version: "v853",
            exportedAt: new Date().toISOString(),
            state: this.state,
            errorSource: this._errorSource,
            entries: snap,
        };
        const json = JSON.stringify(payload, null, 2);
        try {
            if (navigator.clipboard && navigator.clipboard.writeText) {
                await navigator.clipboard.writeText(json);
                console.log(`[heartbeat] exported ${snap.length} errors to clipboard`);
                return { ok: true, copied: true, count: snap.length, json };
            }
        } catch (e) {
            console.warn("[heartbeat] clipboard write failed:", e?.message);
        }
        // Fallback: log to console; user can right-click → copy
        console.log("[heartbeat] error export (copy from below):\n" + json);
        return { ok: true, copied: false, count: snap.length, json };
    }

    // Public: clear the error log + reset error source. Called by user
    // after resolving the issue, or by the avatar when bridge-up fires.
    clearErrors() {
        this._errorLog = [];
        this._errorSource = null;
    }

    _startDocking(targetId, gap = 6) {
        const sync = () => {
            const target = document.getElementById(targetId);
            if (!target) return;
            const rect = target.getBoundingClientRect();
            if (rect.width === 0) return;        // hidden
            const newBottom = Math.round(window.innerHeight - rect.top + gap);
            const newRight  = Math.round(window.innerWidth  - rect.right);
            if (this._lastDockBottom !== newBottom) {
                this.root.style.bottom = newBottom + "px";
                this._lastDockBottom = newBottom;
            }
            if (this._lastDockRight !== newRight) {
                this.root.style.right = newRight + "px";
                this._lastDockRight = newRight;
            }
        };
        sync();
        this._dockTimer = setInterval(sync, 500);
    }

    setState(s) {
        if (this.state === s) return;
        this.state = s;
        this._render();
        // Round 260 — drive the llama overlay per state
        this._renderLlama();
        // Round 261 — fire a heartbeat pulse on every state change
        // (catches "started"/"completed"/"failed" activity transitions)
        this._hbLastPulseMs = (typeof performance !== "undefined") ? performance.now() : Date.now();
    }

    // Round 266 — public API for PipAvatar to drive the OLLAMA lip-sync.
    // Pulses the SVG mouth ellipse to mimic talking. Round 271 — now
    // accepts the spoken text so the animation follows a phoneme
    // curve instead of a generic sine wave. Vowels open wide, m/b/p
    // close, etc.
    startMouthSync(durationMs, text = "") {
        if (!this._mouthOverlay || !this._mouthShape) return;
        const dur = Math.max(200, Math.min(8000, durationMs || 1500));
        const now0 = performance.now();
        this._mouthStartMs = now0;
        this._mouthEndMs = now0 + dur;
        // Build a phoneme curve scoped to this utterance. If text is
        // empty (e.g. an emoted "snark" without actual words) we fall
        // back to a synthetic placeholder so the mouth still animates.
        const txt = text || "ahaha";          // 5 vowels — gentle animation
        this._mouthCurve = _phonemeBuild(txt, dur);
        this._mouthCurveDuration = dur;       // round 272 — re-anchor needs this
        this._mouthTimeOffset = 0;
        this._mouthOverlay.style.opacity = "1";
        if (this._mouthAnimRunning) return;
        this._mouthAnimRunning = true;
        const loop = () => {
            const now = performance.now();
            if (now >= this._mouthEndMs) {
                this._mouthShape.setAttribute("ry", "2");
                this._mouthOverlay.style.opacity = "0";
                this._mouthAnimRunning = false;
                this._mouthCurve = null;
                return;
            }
            // Sample the phoneme curve. Map 0..1 → ry 2..6.5 (the
            // OLLAMA mouth is a smaller ellipse than the robot's).
            // _mouthTimeOffset is updated by _reanchorMouth so TTS
            // boundary events keep our playback head aligned with
            // actual word timing.
            const curveT = (now - this._mouthStartMs) + (this._mouthTimeOffset || 0);
            const amp = _phonemeSample(this._mouthCurve, curveT);
            const jitter = (Math.random() - 0.5) * 0.4;
            const ry = Math.max(2, Math.min(6.5, 2 + amp * 4.5 + jitter));
            this._mouthShape.setAttribute("ry", ry.toFixed(2));
            requestAnimationFrame(loop);
        };
        requestAnimationFrame(loop);
    }

    // Round 272 — re-anchor the mouth phoneme curve from a TTS
    // boundary event. PipAvatar calls this each time the browser
    // SpeechSynthesis fires onboundary. We adjust _mouthTimeOffset
    // so the next sampled position matches the actual speech progress,
    // blended 10% so we don't jerk on every boundary.
    _reanchorMouth(fraction, elapsedMs) {
        if (!this._mouthCurve || !this._mouthCurveDuration) return;
        const expectedCurveT = fraction * this._mouthCurveDuration;
        const naturalCurveT  = elapsedMs;
        const wantOffset     = expectedCurveT - naturalCurveT;
        this._mouthTimeOffset = (this._mouthTimeOffset || 0) * 0.9 + wantOffset * 0.1;
    }

    // Round 266 — viewport center coords of the OLLAMA panel. PipAvatar
    // uses this to compute the gaze angle for the robot's camera when
    // the panels are dragged apart on screen.
    getScreenCenter() {
        if (!this.root) return null;
        const r = this.root.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }

    isUndocked() { return !!this._undocked; }

    // Round 270 — per-NPC portrait label. When a bot speaks (M2 voice
    // with a Portrait field), the caption swaps from "OLLAMA" to the
    // bot's name in the bot's accent color for the duration of the
    // speech, then fades back. Cheap visual that identifies WHICH NPC
    // is doing the talking when many bots are around. Multiple
    // overlapping calls extend the end time but keep the latest name.
    showPortrait({ name, color, durationMs = 1500 } = {}) {
        if (!this._captionEl) return;
        const cap = this._captionEl;
        cap.textContent = (name || "NPC").toUpperCase();
        if (color) {
            // Accept either CSS color string or RGB array
            let css = color;
            if (Array.isArray(color) && color.length >= 3) {
                const [r, g, b] = color;
                css = `rgb(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)})`;
            }
            cap.style.color = css;
            cap.style.background = "rgba(20, 20, 30, 0.7)";
        }
        clearTimeout(this._portraitTimer);
        this._portraitTimer = setTimeout(() => {
            cap.textContent = "OLLAMA";
            cap.style.color = "#7fd";
            cap.style.background = "rgba(40, 80, 100, 0.45)";
        }, durationMs);
    }

    // Round 261 — draw the small ECG canvas at the bottom of the
    // OLLAMA panel. Mirrors the KPop LISTENER's heartbeat style but
    // tinier (52×14). Pulses on activity transitions.
    //
    // v705 — multi-pulse mode. The number of simultaneous moving
    // pulses scales with the engine's pending queue depth:
    //   0 queue items → 1 baseline pulse (700ms period)
    //   1 queue item  → 2 pulses
    //   3+ queue items → up to MAX_PULSES (4) pulses, evenly spaced
    // Each pulse has its own progression along the strip, giving a
    // "heart racing under load" feel instead of just one fast spike.
    _drawHbCanvas() {
        const cv = this._hbCanvas;
        if (!cv) return;
        const ctx = cv.getContext("2d");
        if (!ctx) return;
        const w = cv.width, h = cv.height;
        ctx.clearRect(0, 0, w, h);
        const now = (typeof performance !== "undefined") ? performance.now() : Date.now();
        // v705 — gather queue depth from a few sources, sum, clamp.
        let queueDepth = 0;
        try {
            const ai = window.assetService?.status?.();
            if (ai) queueDepth += (ai.queued || 0) + (ai.kagglePending || 0) + (ai.inflight?.length || 0);
            const wp = window.meshPP?.stats?.();
            if (wp) queueDepth += (wp.pending || 0);
        } catch {}
        const MAX_PULSES = 4;
        const pulseCount = Math.max(1, Math.min(MAX_PULSES, 1 + Math.floor(queueDepth)));
        // The classic single-pulse path stays as pulse 0 — fired on
        // every state change (sincePulse < 700 short-circuits to the
        // boosted spike below). Extra pulses are derived from a
        // continuous clock so they look like a steady stream.
        const sincePulse = now - this._hbLastPulseMs;
        const explicitPulseActive = sincePulse < 700;
        ctx.strokeStyle = (this.state === "offline")
            ? "#666"
            : (explicitPulseActive ? "#ffeb3b" : "#5eff8a");
        ctx.lineWidth = 1.1;
        ctx.beginPath();
        const mid = h / 2;
        // Each background pulse cycles every PERIOD_MS, phase-offset by
        // 1/pulseCount so they're evenly spaced across the strip.
        const PERIOD_MS = 1200;
        for (let x = 0; x < w; x++) {
            let y = mid + Math.sin((x / w) * 2 + this._hbPhase * 0.3) * 0.3;
            // Auto background pulses (when nothing explicit is firing)
            if (!explicitPulseActive) {
                for (let p = 0; p < pulseCount; p++) {
                    const t = ((now + (p / pulseCount) * PERIOD_MS) % PERIOD_MS) / PERIOD_MS;
                    const spikeX = t * w;
                    const dx = x - spikeX;
                    if (dx >= 0 && dx < 2)      y += -h * 0.32;
                    else if (dx >= 2 && dx < 5) y += h * 0.14;
                }
            } else {
                // Explicit pulse override — single boosted spike on
                // state change, kept identical to the v261 behaviour.
                const spikeX = (sincePulse / 700) * w;
                const dx = x - spikeX;
                if (dx >= 0 && dx < 2) y += -h * 0.38;
                else if (dx >= 2 && dx < 5) y += h * 0.16;
            }
            if (x === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.stroke();
    }

    // Round 260 — show a thought bubble for 2 seconds. Accepts string
    // or object { name, label }. Used by window.pip.thought() routing
    // from OllamaLevelGenerator and other "newly acquired" events.
    thought(obj) {
        if (!this._thoughtEl) return;
        const label = (typeof obj === "string")
            ? obj
            : (obj?.name || obj?.label || JSON.stringify(obj).slice(0, 40));
        this._thoughtEl.textContent = `💭 ${label}`;
        this._thoughtEl.style.opacity = "1";
        this._thoughtEl.style.transform = "translateY(0)";
        if (this._thoughtTimer) clearTimeout(this._thoughtTimer);
        this._thoughtTimer = setTimeout(() => {
            this._thoughtEl.style.opacity = "0";
            this._thoughtEl.style.transform = "translateY(-4px)";
        }, 2000);
    }

    // Round 260 — drive the llama emoji per state. The zzz floater
    // only shows during idle. Active jiggles, result tilts, offline
    // greys out.
    // v1167 — Dogmeat stand-in: recolor the llama to a German-Shepherd palette
    // (tan coat, dark legs/ears/snout). A stopgap until a real shepherd .glb.
    // Remaps SVG fills directly so it survives the state-driven filter/opacity
    // changes in _renderLlama (which only touch filter/transform/opacity).
    setDogmeat(on) {
        if (!this._llamaEl) return { ok: false, error: "avatar not ready" };
        const MAP = { "#d9c3a5": "#bd8a4e", "#c2a780": "#9c6b34", "#a88a5e": "#3d2a16", "#5a3f2a": "#140d06" };
        this._llamaEl.querySelectorAll("[fill]").forEach((el) => {
            const cur = (el.getAttribute("fill") || "").toLowerCase();
            if (on) { if (!el.dataset.origFill) el.dataset.origFill = el.getAttribute("fill"); if (MAP[cur]) el.setAttribute("fill", MAP[cur]); }
            else if (el.dataset.origFill) { el.setAttribute("fill", el.dataset.origFill); delete el.dataset.origFill; }
        });
        this._dogmeat = !!on;
        try { if (this._captionEl) this._captionEl.textContent = on ? "DOGMEAT" : "OLLAMA"; } catch {}
        return { ok: true, dogmeat: this._dogmeat };
    }

    _renderLlama() {
        if (!this._llamaEl) return;
        const zzzVisible = (this.state === "idle");
        if (this._zzzEl) this._zzzEl.style.display = zzzVisible ? "block" : "none";
        // Reset animations
        this._llamaEl.style.animation = "none";
        this._llamaEl.style.opacity = "1";
        this._llamaEl.style.transform = "";
        // Force reflow so re-applying animation actually restarts
        // (read offsetHeight to flush)
        void this._llamaEl.offsetHeight;
        // v852 — no more hb-jiggle on the body (that was the
        // heartbeat-pulse-looking rotation). Head-bob is INSIDE the
        // active SVG group so the panel itself stays still. result
        // tilt + offline grey still apply; super_busy + active stay
        // visually quiet at the outer-element level (motion is all
        // inside the SVG).
        switch (this.state) {
            case "result":
                this._llamaEl.style.transform = "rotate(-6deg)";
                break;
            case "offline":
                this._llamaEl.style.opacity = "0.4";
                this._llamaEl.style.filter = "grayscale(1)";
                break;
            default:
                this._llamaEl.style.filter = "none";
        }
    }

    // ---- internal --------------------------------------------------

    _onActivity(evt) {
        this._lastEvent = evt;
        if (this._resultTimer) {
            clearTimeout(this._resultTimer);
            this._resultTimer = null;
        }
        switch (evt) {
            case "started":
                // v852 — track concurrent count. >=2 → super_busy.
                // Single activity → active. Also start a watchdog so a
                // single activity running >4s escalates to super_busy
                // (i.e. "this generate is taking a while, llama is
                // running flat-out").
                this._activeCount = (this._activeCount || 0) + 1;
                // v861 — total includes non-ollama generators too
                {
                    const extras = Object.values(this._extraActiveCounts || {}).reduce((a,n)=>a+n, 0);
                    const total = this._activeCount + extras;
                    if (total >= 2) {
                        this.setState("super_busy");
                    } else {
                        this.setState("active");
                        this._activeStartedAt = Date.now();
                        if (this._busyEscalateTimer) clearTimeout(this._busyEscalateTimer);
                        this._busyEscalateTimer = setTimeout(() => {
                            if (this.state === "active") this.setState("super_busy");
                        }, 4000);
                    }
                }
                break;
            case "completed":
                this._activeCount = Math.max(0, (this._activeCount || 1) - 1);
                if (this._busyEscalateTimer) {
                    clearTimeout(this._busyEscalateTimer);
                    this._busyEscalateTimer = null;
                }
                this.setState("result");
                this._resultTimer = setTimeout(() => {
                    // Only revert to idle if no new request has started since
                    if (this.state === "result") {
                        // v861 — combined total drives the post-result state
                        const extras = Object.values(this._extraActiveCounts || {}).reduce((a,n)=>a+n, 0);
                        const total = this._activeCount + extras;
                        if (total >= 2) this.setState("super_busy");
                        else if (total === 1) this.setState("active");
                        else this.setState("idle");
                    }
                }, 1200);
                break;
            case "failed":
                this._activeCount = Math.max(0, (this._activeCount || 1) - 1);
                if (this._busyEscalateTimer) {
                    clearTimeout(this._busyEscalateTimer);
                    this._busyEscalateTimer = null;
                }
                this.setState("result");
                this._resultTimer = setTimeout(() => {
                    if (this.state === "result") {
                        // After a failed result, transition based on whether
                        // the client is now flagged as available
                        if (this.ollama && this.ollama.available === false) {
                            this.setState("offline");
                        } else {
                            // v861 — combined total
                            const extras = Object.values(this._extraActiveCounts || {}).reduce((a,n)=>a+n, 0);
                            const total = this._activeCount + extras;
                            if (total >= 2)     this.setState("super_busy");
                            else if (total === 1) this.setState("active");
                            else                  this.setState("idle");
                        }
                    }
                }, 1200);
                break;
            case "unreachable":
                this._activeCount = 0;
                this.setState("offline");
                break;
            // Round 102 — Ollama just transitioned offline → online
            // (probe() succeeded after having failed). Wake the avatar
            // back up regardless of current state. Auto-reprobe runs
            // every 30s by default so this fires shortly after the
            // user starts the daemon or pulls the missing model.
            case "reachable":
                this.setState("idle");
                break;
        }
    }

    _build(parent) {
        const root = document.createElement("div");
        root.id = "ollama-heartbeat-avatar";
        Object.assign(root.style, {
            position: "fixed",
            // Round 102 — initial position. Updated dynamically by
            // _startDocking() to track Pip's actual top edge so the
            // avatar always sits flush above Pip regardless of Pip's
            // current height (Pip auto-sizes with its stat bars).
            right: "14px",
            bottom: "240px",
            width: "70px",
            // Round 105 — caption bar at top adds ~14px to total height
            // so the cat fits with a clear "OLLAMA" label above it.
            height: "84px",
            background: "rgba(0, 0, 0, 0.45)",
            border: "1px solid rgba(120, 200, 255, 0.35)",
            borderRadius: "8px",
            zIndex: "25500",
            overflow: "hidden",
            cursor: "pointer",
            transition: "opacity 200ms",
            opacity: "0.85",
            display: "flex",
            flexDirection: "column",
        });
        root.title = "Ollama heartbeat — hover for state";
        root.addEventListener("mouseenter", () => { root.style.opacity = "1"; });
        root.addEventListener("mouseleave", () => { root.style.opacity = "0.85"; });

        // Round 266 — drag-to-undock. When the user drags this avatar
        // out of the PIP dock, we detach it from the dock and move it
        // into document.body as a free-floating overlay. From that
        // point on the OLLAMA panel lives wherever the user puts it,
        // and PipAvatar.directional-gaze code uses both panels' screen
        // positions to make the robot turn toward OLLAMA (and OLLAMA's
        // lip-sync to react to which direction speech is coming from).
        //
        // Threshold (6px) prevents an accidental click from undocking.
        // Once undocked, state persists via localStorage so the panel
        // stays where the user put it across reloads.
        this._undocked = false;
        const DRAG_KEY = "voxelengine.ollamaPanelPos";
        try {
            const stored = localStorage.getItem(DRAG_KEY);
            if (stored) {
                const pos = JSON.parse(stored);
                if (pos.left != null) {
                    this._undocked = true;
                    // Apply later, after _build mounts root. Stash for
                    // the post-build hook.
                    this._pendingDragPos = pos;
                }
            }
        } catch {}

        let dragStart = null;
        let dragged   = false;
        root.addEventListener("mousedown", (e) => {
            // Skip drag if the click target is the state-cycler button-
            // sized rectangle of the click listener — actually that's
            // the root itself. We use a movement threshold below to
            // distinguish click from drag.
            dragStart = {
                x: e.clientX, y: e.clientY,
                startLeft: parseInt(root.style.left || "0", 10) || root.getBoundingClientRect().left,
                startTop:  parseInt(root.style.top  || "0", 10) || root.getBoundingClientRect().top,
            };
            dragged = false;
            // v4223 -- *** THE DRAG HANDLERS LIVE FOR THE DRAG, NOT FOR THE PAGE. *** They used to be installed
            // on `document` here at construction and never removed, so every mousemove ANYWHERE on the page
            // ran onDragMove for the life of the tab -- it returned immediately on `if (!dragStart) return`,
            // which is why nothing ever looked wrong. Attaching on mousedown and removing on mouseup is the
            // same behaviour with none of the idle cost. Both use the SAME function references, because
            // removeEventListener matches on identity and a fresh wrapper would remove nothing at all.
            document.addEventListener("mousemove", onDragMove);
            document.addEventListener("mouseup", onDragUp);
            // Suppress the state-cycle click that would otherwise fire
            // on mouseup; only suppress if we actually drag.
            e.stopPropagation();
        });
        const onDragMove = (e) => {
            if (!dragStart) return;
            const dx = e.clientX - dragStart.x;
            const dy = e.clientY - dragStart.y;
            const dist2 = dx * dx + dy * dy;
            if (!dragged && dist2 < 36) return;        // 6px threshold
            dragged = true;
            // First drag past threshold → undock if still docked.
            if (!this._undocked) {
                this._undocked = true;
                // Re-parent to body. Capture current viewport rect so
                // the panel doesn't jump when detached.
                const r = root.getBoundingClientRect();
                document.body.appendChild(root);
                root.style.position = "fixed";
                root.style.right = "auto";
                root.style.bottom = "auto";
                root.style.left = `${Math.round(r.left)}px`;
                root.style.top  = `${Math.round(r.top)}px`;
                // Update dragStart anchor to the new coord frame
                dragStart.startLeft = r.left;
                dragStart.startTop  = r.top;
                console.log("[HeartbeatAvatar] undocked from PIP");
            }
            root.style.left = `${dragStart.startLeft + dx}px`;
            root.style.top  = `${dragStart.startTop  + dy}px`;
        };
        const onDragUp = () => {
            if (dragStart && dragged) {
                try {
                    localStorage.setItem(DRAG_KEY, JSON.stringify({
                        left: root.style.left, top: root.style.top,
                    }));
                } catch {}
                // Mark so the subsequent click event doesn't cycle state
                this._justDragged = true;
            }
            dragStart = null;
            // v4223 -- released, so stop listening. See the note on mousedown.
            document.removeEventListener("mousemove", onDragMove);
            document.removeEventListener("mouseup", onDragUp);
        };
        // Installed on `document` rather than on the avatar, so a drag continues when the cursor leaves the
        // small target -- but only BETWEEN mousedown and mouseup, which is the whole of v4223's point.
        // Expose getter for PipAvatar to read screen position
        this._undockedGetter = () => this._undocked;

        // Round 105 — caption strip. "OLLAMA" centered at top so the
        // avatar window is self-identifying. Matches the style of
        // PalChatAvatar's label so the two widgets read as a family.
        const caption = document.createElement("div");
        caption.textContent = "OLLAMA";
        Object.assign(caption.style, {
            fontFamily: "ui-monospace, Consolas, monospace",
            fontSize: "9px",
            fontWeight: "bold",
            letterSpacing: "0.12em",
            color: "#7fd",
            textAlign: "center",
            padding: "2px 0",
            background: "rgba(40, 80, 100, 0.45)",
            borderBottom: "1px solid rgba(120, 200, 255, 0.25)",
            flexShrink: "0",
            transition: "color 220ms, background 220ms",
        });
        root.appendChild(caption);
        // Round 270 — expose caption so PipAvatar.speak() can swap it
        // to a per-NPC portrait label when a bot is the speaker.
        this._captionEl = caption;
        // Click cycles state for testing — only when we didn't just
        // drag, otherwise dragging would also cycle the state.
        root.addEventListener("click", (e) => {
            if (this._justDragged) {
                this._justDragged = false;
                e.stopPropagation();
                return;
            }
            const cycle = ["idle", "active", "result", "offline"];
            const i = cycle.indexOf(this.state);
            this.setState(cycle[(i + 1) % cycle.length]);
        });

        // SVG container that holds all four state graphics overlaid;
        // visibility toggled per state.
        const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        svg.setAttribute("viewBox", "0 0 100 100");
        svg.setAttribute("width", "70");
        svg.setAttribute("height", "70");
        svg.innerHTML = this._svgGroups();
        // Round 260 — hide the underlying cat SVG. The llama emoji
        // overlay below is the canonical avatar now. SVG is kept in
        // the DOM so state-tracking + animations still tick.
        svg.style.display = "none";
        root.appendChild(svg);
        this._svg = svg;

        // Round 260 — llama avatar overlay. Big emoji centered in the
        // body area. State drives subtle animations (jiggle on active,
        // tilt on result, fade on offline). The "z" zzz floater still
        // shows during idle state.
        // Round 265 — wrap holds two stacked emoji elements so we can
        // animate one off-screen left while the new one slides in from
        // the right. Active emoji is chosen by the most recent
        // ai:activity event's model name.
        const llamaWrap = document.createElement("div");
        Object.assign(llamaWrap.style, {
            flex: "1",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "32px",       // round 261 — smaller (embedded slot is smaller now)
            lineHeight: "1",
            position: "relative",
            overflow: "hidden",     // hides emojis that slide off-frame
            userSelect: "none",
        });
        const avatarEl = document.createElement("div");
        avatarEl.textContent = "🦙";
        Object.assign(avatarEl.style, {
            position: "relative",
            transition: "transform 380ms cubic-bezier(0.5, 0, 0.5, 1), opacity 380ms",
            transform: "translateX(0%)", opacity: "1",
        });
        llamaWrap.appendChild(avatarEl);

        // Round 266 — SVG mouth overlay for lip-sync. Positioned over
        // the bottom-third of the emoji's bounding area. Animated by
        // startMouthSync(durationMs) called by PipAvatar when M2 voice
        // (Ollama) is speaking. Visually similar to the RobotExpressive
        // mouth — small ellipse that pulses on a sine wave.
        const mouthOverlay = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        mouthOverlay.setAttribute("viewBox", "0 0 30 18");
        Object.assign(mouthOverlay.style, {
            position: "absolute",
            // Roughly at the llama's snout — bottom-center of the emoji
            top: "55%", left: "50%",
            transform: "translate(-50%, -50%)",
            width: "20px", height: "12px",
            pointerEvents: "none",
            opacity: "0",
            transition: "opacity 180ms",
            zIndex: "10",
        });
        const mouthShape = document.createElementNS("http://www.w3.org/2000/svg", "ellipse");
        mouthShape.setAttribute("cx", "15");
        mouthShape.setAttribute("cy", "9");
        mouthShape.setAttribute("rx", "8");
        mouthShape.setAttribute("ry", "2");
        mouthShape.setAttribute("fill", "#3a1a05");
        mouthShape.setAttribute("stroke", "rgba(60,30,10,0.9)");
        mouthShape.setAttribute("stroke-width", "0.4");
        mouthOverlay.appendChild(mouthShape);
        llamaWrap.appendChild(mouthOverlay);
        this._mouthOverlay = mouthOverlay;
        this._mouthShape   = mouthShape;
        this._mouthAnimRunning = false;
        this._mouthEndMs = 0;
        root.appendChild(llamaWrap);
        this._llamaEl = llamaWrap;
        this._avatarEl = avatarEl;
        this._currentEmoji = "🦙";

        // Round 265 — model→emoji map. Substring match (case-insensitive)
        // so "gemma3:4b", "gemma3:12b", "llama3.2:1b", "qwen2.5:7b", etc.
        // all hit the right glyph. Falls back to 🦙 for unknown models.
        const MODEL_EMOJI = [
            { rx: /gemma/i,   emoji: "🐭" },     // small fast — mouse
            { rx: /qwen/i,    emoji: "🐲" },     // dragon (qwen is great)
            { rx: /llama/i,   emoji: "🦙" },
            { rx: /mistral/i, emoji: "💨" },
            { rx: /phi/i,     emoji: "🦔" },
            { rx: /granite/i, emoji: "🪨" },
            { rx: /code/i,    emoji: "💻" },
            { rx: /vision|llava/i, emoji: "👁️" },
            { rx: /trellis/i, emoji: "🐉" },
            { rx: /comfy|sdxl|sd_/i, emoji: "🎨" },
        ];
        const pickEmoji = (modelName) => {
            if (!modelName) return "🦙";
            for (const m of MODEL_EMOJI) if (m.rx.test(modelName)) return m.emoji;
            return "🦙";
        };
        this._swapAvatarTo = (newEmoji) => {
            if (newEmoji === this._currentEmoji) return;
            if (this._avatarSwapping) {
                this._pendingEmoji = newEmoji;
                return;
            }
            this._avatarSwapping = true;
            // Walk off to the left
            avatarEl.style.transform = "translateX(-140%)";
            avatarEl.style.opacity = "0";
            setTimeout(() => {
                avatarEl.textContent = newEmoji;
                this._currentEmoji = newEmoji;
                // Snap to right side (no transition), then animate in
                const prev = avatarEl.style.transition;
                avatarEl.style.transition = "none";
                avatarEl.style.transform = "translateX(140%)";
                // Force layout to commit the snap
                // eslint-disable-next-line no-unused-expressions
                avatarEl.offsetHeight;
                avatarEl.style.transition = prev;
                avatarEl.style.transform = "translateX(0%)";
                avatarEl.style.opacity = "1";
                setTimeout(() => {
                    this._avatarSwapping = false;
                    if (this._pendingEmoji && this._pendingEmoji !== this._currentEmoji) {
                        const next = this._pendingEmoji;
                        this._pendingEmoji = null;
                        this._swapAvatarTo(next);
                    }
                }, 380);
            }, 380);
        };
        // Wire the ai:activity event. Each "started" event with a model
        // name updates the avatar. We ignore "completed" / "failed" so
        // the avatar reflects whatever model ran last (until something
        // else runs).
        if (typeof window !== "undefined") {
            window.addEventListener("ai:activity", (ev) => {
                const d = ev?.detail;
                if (!d) return;
                if (d.event === "started" && d.model) {
                    const want = pickEmoji(d.model);
                    this._swapAvatarTo(want);
                }
            });
        }

        // Zzz floater for idle (positioned absolutely so it doesn't
        // affect the llama's centering)
        const zzzEl = document.createElement("div");
        Object.assign(zzzEl.style, {
            position: "absolute",
            top: "12px", right: "4px",
            fontSize: "9px",
            color: "#bcd8ff",
            fontFamily: "monospace",
            opacity: "1",
            pointerEvents: "none",
            animation: "hb-zzz 2.2s ease-out infinite",
        });
        zzzEl.textContent = "z";
        llamaWrap.appendChild(zzzEl);
        this._zzzEl = zzzEl;

        // v739 — heartbeat ECG strip removed per request. The OLLAMA panel
        // avatar no longer shows the pulse canvas at the bottom; the
        // _drawHbCanvas method early-returns since this._hbCanvas stays
        // null. Avatar animation + Zzz + state transitions are untouched.
        this._hbCanvas = null;
        this._hbPhase = 0;
        this._hbLastPulseMs = 0;
        this._hbLastAutoBeatMs = 0;
        // No interval timer started — heartbeat draw loop is disabled.
        // Round 263c — auto-pulse cadence driven by systemPerf gpu/task
        // stress. Resting heart rate ~50bpm (slower than KPop's 60 to
        // reflect that OLLAMA is the calmer, more reflective brain);
        // accelerates up to ~200bpm under heavy AI activity. When the
        // browser exposes GPU draw time via EXT_disjoint_timer_query, we
        // use it; otherwise fall back to taskStress01 (long-task
        // observer pressure), which catches Trellis/ComfyUI inference
        // that's saturating the main thread.
        // v739 — heartbeat draw timer disabled along with the canvas.
        this._hbDrawTimer = null;

        // Thought bubble — overlays the entire root, anchored above
        // the avatar. Hidden by default; appears for 2s on .thought().
        const bubble = document.createElement("div");
        Object.assign(bubble.style, {
            position: "absolute",
            top: "-32px", left: "-90px",
            minWidth: "100px", maxWidth: "180px",
            background: "rgba(255, 255, 255, 0.94)",
            color: "#222",
            padding: "5px 10px",
            borderRadius: "12px",
            fontSize: "10px",
            fontFamily: "monospace",
            opacity: "0",
            transform: "translateY(-4px)",
            transition: "opacity 0.25s, transform 0.25s",
            pointerEvents: "none",
            zIndex: "26000",
            boxShadow: "0 2px 6px rgba(0,0,0,0.4)",
            wordBreak: "break-word",
            textAlign: "center",
        });
        root.appendChild(bubble);
        this._thoughtEl = bubble;

        // Inject keyframes once
        if (!document.getElementById("hb-keyframes")) {
            const s = document.createElement("style");
            s.id = "hb-keyframes";
            s.textContent = `
                @keyframes hb-bob       { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-2px)} }
                @keyframes hb-zzz       { 0%{opacity:0;transform:translate(0,0) scale(0.6)} 50%{opacity:1} 100%{opacity:0;transform:translate(8px,-22px) scale(1.1)} }
                @keyframes hb-spin      { 0%{transform:rotate(0deg)} 100%{transform:rotate(360deg)} }
                @keyframes hb-jiggle    { 0%,100%{transform:rotate(-2deg)} 50%{transform:rotate(2deg)} }
                @keyframes hb-jump      { 0%,100%{transform:translateY(0)} 30%{transform:translateY(-12px)} 60%{transform:translateY(-6px)} }
                @keyframes hb-bark      { 0%{opacity:0;transform:scale(0.4)} 25%{opacity:1;transform:scale(1.1)} 100%{opacity:0;transform:scale(1.2)} }
                /* v852 — llama-specific motion. hb-headbob replaces the
                   heart-pulse-looking hb-jiggle on the active body: subtle
                   head + neck bob, "alive" without being heart-shaped. */
                @keyframes hb-headbob   { 0%,100%{transform:translateY(0) rotate(0)} 50%{transform:translateY(-1.5px) rotate(-2deg)} }
                /* Super-busy running legs. Two co-running animations:
                   blur ovals scale rapidly (motion blur feel), flicker
                   ghosts step through positions (stop-motion cartoon). */
                @keyframes hb-leg-blur    { 0%{transform:scaleY(1)} 100%{transform:scaleY(0.65)} }
                @keyframes hb-leg-flicker { 0%{transform:translateX(0)} 33%{transform:translateX(-2px)} 66%{transform:translateX(2px)} 100%{transform:translateX(0)} }
                /* Running-bob: body bobs up/down rapidly while running. */
                @keyframes hb-runbob    { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-1px)} }
                /* v854 — side-to-side running for super_busy. The whole
                   llama group translates horizontally across the panel
                   and flips horizontally at each end so it faces the
                   direction of travel. Cubic-easing so it pauses briefly
                   at each turnaround. 4s round-trip feels lively
                   without being frantic. */
                @keyframes hb-run-sideways {
                    0%   { transform: translateX(-15px) scaleX(1); }
                    48%  { transform: translateX(15px)  scaleX(1); }
                    50%  { transform: translateX(15px)  scaleX(-1); }
                    98%  { transform: translateX(-15px) scaleX(-1); }
                    100% { transform: translateX(-15px) scaleX(1); }
                }
                /* v854 — graze: occasional idle behavior where the
                   sleeping llama briefly lowers its head as if grazing.
                   Plays for ~1.5s then back to normal sleep. */
                @keyframes hb-graze {
                    0%,100% { transform: translateY(0) rotate(0); }
                    20%     { transform: translateY(2px) rotate(8deg); }
                    50%     { transform: translateY(3px) rotate(10deg); }
                    80%     { transform: translateY(2px) rotate(6deg); }
                }
                /* Yawn: open mouth briefly during idle. Played by toggling
                   .hb-yawning class on the idle group; the SVG snout
                   ellipse grows + a dark oval appears for the mouth. */
                @keyframes hb-yawn-stretch {
                    0%   { transform: scale(1, 1) translateY(0); }
                    25%  { transform: scale(1, 0.92) translateY(0.5px); }
                    55%  { transform: scale(1.05, 1.06) translateY(-1px); }
                    100% { transform: scale(1, 1) translateY(0); }
                }
            `;
            document.head.appendChild(s);
        }

        parent.appendChild(root);
        this.root = root;

        // Round 266 — if user had previously undocked + saved a position,
        // re-parent to body now (don't sit inside the PIP dock) and
        // restore the saved coords.
        if (this._pendingDragPos) {
            try {
                document.body.appendChild(root);
                root.style.position = "fixed";
                root.style.right = "auto";
                root.style.bottom = "auto";
                root.style.left = this._pendingDragPos.left;
                root.style.top  = this._pendingDragPos.top;
                this._undocked = true;
                this._pendingDragPos = null;
                console.log("[HeartbeatAvatar] restored undocked position from localStorage");
            } catch (e) {
                console.warn("[HeartbeatAvatar] failed to restore drag pos:", e);
            }
        }

        this._render();
    }

    // Single SVG document holding all four state groups. _render()
    // toggles display on each <g> by id.
    // Round 95 — each state group's body shapes are wrapped in
    // <g class="hb-body"> and icon overlays in <g class="hb-icon"> so
    // 3D mode can hide the body (canvas takes over the body slot)
    // while keeping the icon visible as a corner overlay.
    _svgGroups() {
        // v852 — Llama redesign. Five states; no heartbeat-style pulse
        // on the body (the v739 ECG canvas is gone and the old hb-jiggle
        // is replaced with a head-bob). Cream/beige palette. Visible
        // legs in standing states; motion-blur ovals in super_busy;
        // legs tucked in idle. Cat is deferred to a Settings option in
        // a future round per the user's "I don't recall seeing a cat
        // for a while" note — llama is now the default.
        return `
            <!-- IDLE: lying llama, eyes closed, neck curled down, Zzz emitter -->
            <g id="hb-state-idle">
                <g class="hb-body">
                    <!-- body lying on the ground -->
                    <ellipse cx="55" cy="74" rx="22" ry="9" fill="#d9c3a5"/>
                    <!-- belly shading -->
                    <ellipse cx="55" cy="77" rx="20" ry="5" fill="#c2a780" opacity="0.5"/>
                    <!-- neck curled down toward chest -->
                    <path d="M 38 70 Q 28 64 30 56" stroke="#d9c3a5" stroke-width="8" fill="none" stroke-linecap="round"/>
                    <!-- head resting -->
                    <ellipse cx="28" cy="52" rx="8" ry="6.5" fill="#d9c3a5"/>
                    <!-- snout -->
                    <ellipse cx="22" cy="54" rx="4" ry="3" fill="#c2a780"/>
                    <!-- closed eye (sleeping arc) -->
                    <path d="M 24 51 Q 27 53 30 51" stroke="#1a2a3a" stroke-width="1.2" fill="none" stroke-linecap="round"/>
                    <!-- ears (folded back, small) -->
                    <polygon points="27,44 30,42 30,48" fill="#a88a5e"/>
                    <polygon points="32,44 35,43 34,49" fill="#a88a5e"/>
                    <!-- nostril -->
                    <circle cx="20" cy="55" r="0.7" fill="#5a3f2a"/>
                    <!-- tail flopped down -->
                    <path d="M 75 71 Q 80 78 76 82" stroke="#c2a780" stroke-width="3.5" fill="none" stroke-linecap="round"/>
                </g>
                <g class="hb-icon">
                    <!-- Zzz floating up — sleep indicator. Slightly larger -->
                    <text x="82" y="20" font-size="11" font-family="monospace"
                          fill="#bcd8ff" text-anchor="middle"
                          style="animation: hb-zzz 2.2s ease-out infinite">z</text>
                </g>
            </g>

            <!-- ACTIVE: standing llama, alert eyes, 4 legs, head-bob (NOT body-pulse) -->
            <g id="hb-state-active" style="display:none">
                <g class="hb-body">
                    <!-- 4 legs (drawn first so body covers tops) -->
                    <rect x="38" y="68" width="3.2" height="14" fill="#a88a5e" rx="1.2"/>
                    <rect x="46" y="68" width="3.2" height="14" fill="#a88a5e" rx="1.2"/>
                    <rect x="56" y="68" width="3.2" height="14" fill="#a88a5e" rx="1.2"/>
                    <rect x="64" y="68" width="3.2" height="14" fill="#a88a5e" rx="1.2"/>
                    <!-- hooves at the bottom of each leg -->
                    <rect x="37.5" y="80" width="4.2" height="2.5" fill="#5a3f2a" rx="1"/>
                    <rect x="45.5" y="80" width="4.2" height="2.5" fill="#5a3f2a" rx="1"/>
                    <rect x="55.5" y="80" width="4.2" height="2.5" fill="#5a3f2a" rx="1"/>
                    <rect x="63.5" y="80" width="4.2" height="2.5" fill="#5a3f2a" rx="1"/>
                    <!-- body oval -->
                    <ellipse cx="52" cy="62" rx="20" ry="11" fill="#d9c3a5"/>
                    <!-- v852: head + neck wrapped in a group so we can
                         animate the WHOLE head with a gentle bob (was
                         hb-jiggle on body — a heartbeat-looking pulse).
                         New motion is a subtle head bob: alive but not
                         heart-pulse-like. -->
                    <g style="animation: hb-headbob 1.6s ease-in-out infinite; transform-origin: 36px 56px;">
                        <!-- neck (from front-top of body up to head) -->
                        <path d="M 38 57 Q 32 46 33 36" stroke="#d9c3a5" stroke-width="8" fill="none" stroke-linecap="round"/>
                        <!-- head -->
                        <ellipse cx="32" cy="32" rx="9" ry="7.5" fill="#d9c3a5" transform="rotate(-12 32 32)"/>
                        <!-- snout -->
                        <ellipse cx="24" cy="35" rx="4.5" ry="3.2" fill="#c2a780"/>
                        <!-- alert eye -->
                        <circle cx="31" cy="31" r="1.5" fill="#1a2a3a"/>
                        <!-- pointy ears (perked up) -->
                        <polygon points="30,22 33,18 32,28" fill="#a88a5e"/>
                        <polygon points="35,22 38,19 36,28" fill="#a88a5e"/>
                        <!-- inner ear (lighter) -->
                        <polygon points="31,23 32.5,21 32,27" fill="#d9c3a5"/>
                        <!-- nostril -->
                        <circle cx="22" cy="36" r="0.8" fill="#5a3f2a"/>
                        <!-- small smile -->
                        <path d="M 22 38 Q 24 39.5 26 38" stroke="#1a2a3a" stroke-width="0.9" fill="none" stroke-linecap="round"/>
                    </g>
                    <!-- tail (small upward curve at back) -->
                    <path d="M 72 56 Q 78 50 76 60" stroke="#c2a780" stroke-width="3.5" fill="none" stroke-linecap="round"/>
                </g>
                <g class="hb-icon">
                    <!-- Spinning gear, top-right corner. Single AI activity. -->
                    <g style="transform-origin: 82px 20px; animation: hb-spin 1.1s linear infinite;">
                        <circle cx="82" cy="20" r="5" fill="none" stroke="#ffdc70" stroke-width="1.6"/>
                        <line x1="82" y1="14" x2="82" y2="15.5" stroke="#ffdc70" stroke-width="1.6"/>
                        <line x1="82" y1="24.5" x2="82" y2="26" stroke="#ffdc70" stroke-width="1.6"/>
                        <line x1="76" y1="20" x2="77.5" y2="20" stroke="#ffdc70" stroke-width="1.6"/>
                        <line x1="86.5" y1="20" x2="88" y2="20" stroke="#ffdc70" stroke-width="1.6"/>
                    </g>
                </g>
            </g>

            <!-- SUPER_BUSY: running llama with cartoon motion-blur legs.
                 v852 — new 5th state. Fires when AI activity is sustained
                 OR when >=2 concurrent requests are in-flight. Setter
                 setBusyLevel(n) drives this. Body tilts forward, legs
                 become semi-transparent ovals (Road Runner style). -->
            <g id="hb-state-super-busy" style="display:none">
                <!-- v854 — side-to-side running. Outer group translates
                     horizontally + flips scaleX at each end so the llama
                     faces the direction of travel. Inner group has the
                     existing running visuals (motion blur legs, dust,
                     panting head etc). transform-origin centers the
                     flip so the body stays in frame. -->
                <g class="hb-body" style="animation: hb-run-sideways 4s ease-in-out infinite; transform-origin: 50px 64px;">
                    <!-- motion lines behind (dust trail) -->
                    <g opacity="0.55">
                        <line x1="84" y1="72" x2="92" y2="72" stroke="#c2a780" stroke-width="1.3" stroke-linecap="round"/>
                        <line x1="84" y1="76" x2="94" y2="76" stroke="#c2a780" stroke-width="1.3" stroke-linecap="round"/>
                        <line x1="82" y1="80" x2="90" y2="80" stroke="#c2a780" stroke-width="1.3" stroke-linecap="round"/>
                    </g>
                    <!-- cartoon spinning-legs blur (single oval per leg pair, animated) -->
                    <g style="animation: hb-leg-blur 0.12s linear infinite alternate;">
                        <ellipse cx="44" cy="78" rx="9" ry="5" fill="#a88a5e" opacity="0.45"/>
                        <ellipse cx="62" cy="78" rx="9" ry="5" fill="#a88a5e" opacity="0.45"/>
                    </g>
                    <!-- a few visible leg-line ghosts (cartoon stop-motion feel) -->
                    <g style="animation: hb-leg-flicker 0.18s steps(3) infinite;">
                        <line x1="40" y1="70" x2="42" y2="80" stroke="#a88a5e" stroke-width="1.4" opacity="0.6" stroke-linecap="round"/>
                        <line x1="48" y1="70" x2="46" y2="80" stroke="#a88a5e" stroke-width="1.4" opacity="0.6" stroke-linecap="round"/>
                        <line x1="58" y1="70" x2="60" y2="80" stroke="#a88a5e" stroke-width="1.4" opacity="0.6" stroke-linecap="round"/>
                        <line x1="66" y1="70" x2="64" y2="80" stroke="#a88a5e" stroke-width="1.4" opacity="0.6" stroke-linecap="round"/>
                    </g>
                    <!-- body, tilted forward, with subtle vertical bobbing -->
                    <g style="animation: hb-runbob 0.22s ease-in-out infinite; transform-origin: 52px 64px;">
                        <ellipse cx="52" cy="62" rx="20" ry="10.5" fill="#d9c3a5" transform="rotate(-4 52 62)"/>
                        <!-- neck (leaned forward) -->
                        <path d="M 36 58 Q 28 46 30 36" stroke="#d9c3a5" stroke-width="8" fill="none" stroke-linecap="round"/>
                        <!-- head (more horizontal — running posture) -->
                        <ellipse cx="28" cy="34" rx="9" ry="7" fill="#d9c3a5" transform="rotate(-20 28 34)"/>
                        <!-- snout, forward -->
                        <ellipse cx="20" cy="38" rx="4.5" ry="3" fill="#c2a780"/>
                        <!-- alert wide eye -->
                        <circle cx="28" cy="33" r="2" fill="#1a2a3a"/>
                        <circle cx="28.4" cy="32.5" r="0.6" fill="#fff"/>
                        <!-- ears pinned back (running posture) -->
                        <polygon points="32,26 35,24 33,30" fill="#a88a5e"/>
                        <polygon points="36,26 39,25 37,30" fill="#a88a5e"/>
                        <!-- open mouth (panting) -->
                        <ellipse cx="20" cy="40" rx="2" ry="1.4" fill="#1a2a3a"/>
                        <!-- tongue -->
                        <ellipse cx="20" cy="40.5" rx="1.4" ry="0.8" fill="#d04545"/>
                        <!-- tail streaming behind -->
                        <path d="M 72 56 Q 82 54 86 60" stroke="#c2a780" stroke-width="3.5" fill="none" stroke-linecap="round"/>
                    </g>
                </g>
                <g class="hb-icon">
                    <!-- Multiple spinning gears for "super busy" -->
                    <g style="transform-origin: 82px 18px; animation: hb-spin 0.5s linear infinite;">
                        <circle cx="82" cy="18" r="4" fill="none" stroke="#ffb050" stroke-width="1.4"/>
                        <line x1="82" y1="13" x2="82" y2="14.5" stroke="#ffb050" stroke-width="1.4"/>
                        <line x1="82" y1="21.5" x2="82" y2="23" stroke="#ffb050" stroke-width="1.4"/>
                        <line x1="77" y1="18" x2="78.5" y2="18" stroke="#ffb050" stroke-width="1.4"/>
                        <line x1="85.5" y1="18" x2="87" y2="18" stroke="#ffb050" stroke-width="1.4"/>
                    </g>
                    <g style="transform-origin: 70px 26px; animation: hb-spin 0.7s linear infinite reverse;">
                        <circle cx="70" cy="26" r="3" fill="none" stroke="#ff7d40" stroke-width="1.2"/>
                        <line x1="70" y1="22" x2="70" y2="23" stroke="#ff7d40" stroke-width="1.2"/>
                        <line x1="70" y1="29" x2="70" y2="30" stroke="#ff7d40" stroke-width="1.2"/>
                        <line x1="66" y1="26" x2="67" y2="26" stroke="#ff7d40" stroke-width="1.2"/>
                        <line x1="73" y1="26" x2="74" y2="26" stroke="#ff7d40" stroke-width="1.2"/>
                    </g>
                </g>
            </g>

            <!-- RESULT: jumping llama, "!" bark bubble -->
            <g id="hb-state-result" style="display:none">
                <g class="hb-body">
                    <g style="animation: hb-jump 0.9s ease-out;">
                        <!-- legs (tucked, jumping pose) -->
                        <rect x="40" y="66" width="3" height="10" fill="#9ad77a" rx="1" transform="rotate(-15 41.5 71)"/>
                        <rect x="48" y="66" width="3" height="10" fill="#9ad77a" rx="1" transform="rotate(-8 49.5 71)"/>
                        <rect x="56" y="66" width="3" height="10" fill="#9ad77a" rx="1" transform="rotate(8 57.5 71)"/>
                        <rect x="64" y="66" width="3" height="10" fill="#9ad77a" rx="1" transform="rotate(15 65.5 71)"/>
                        <!-- body (happy green tint) -->
                        <ellipse cx="52" cy="60" rx="20" ry="11" fill="#b9ee9c"/>
                        <!-- neck up -->
                        <path d="M 38 55 Q 32 44 33 34" stroke="#b9ee9c" stroke-width="8" fill="none" stroke-linecap="round"/>
                        <!-- head -->
                        <ellipse cx="32" cy="30" rx="9" ry="7.5" fill="#b9ee9c" transform="rotate(-8 32 30)"/>
                        <!-- snout -->
                        <ellipse cx="24" cy="33" rx="4.5" ry="3.2" fill="#9ad77a"/>
                        <!-- happy eye (curve up) -->
                        <path d="M 28 29 Q 31 27 33 29" stroke="#1a2a3a" stroke-width="1.4" fill="none" stroke-linecap="round"/>
                        <!-- ears -->
                        <polygon points="30,21 33,18 32,26" fill="#7ab85a"/>
                        <polygon points="35,21 38,18 36,26" fill="#7ab85a"/>
                        <!-- open smile mouth -->
                        <ellipse cx="22" cy="35" rx="2" ry="1.4" fill="#1a2a3a"/>
                        <!-- tail wagging up -->
                        <path d="M 72 54 Q 80 46 78 56" stroke="#9ad77a" stroke-width="3.5" fill="none" stroke-linecap="round"/>
                    </g>
                </g>
                <g class="hb-icon">
                    <!-- Bark "!" bubble — top-right corner -->
                    <g style="transform-origin: 82px 20px; animation: hb-bark 1.1s ease-out;">
                        <ellipse cx="82" cy="20" rx="8" ry="7" fill="#fff"/>
                        <polygon points="74,23 76,28 79,25" fill="#fff"/>
                        <text x="82" y="24" font-size="12" font-family="monospace" font-weight="bold"
                              text-anchor="middle" fill="#1a2a3a">!</text>
                    </g>
                </g>
            </g>

            <!-- OFFLINE / DEAD-EYE: llama lying on back, legs straight up, X eyes.
                 v852 — kept for offline (Ollama unreachable). v853 will
                 extend this artwork's TRIGGER set to also include bridge
                 disconnect + iframe load errors, so this becomes the
                 generic "something is broken — look at the error log"
                 indicator. Color stays grey to read as "dead". -->
            <g id="hb-state-offline" style="display:none">
                <g class="hb-body-always">
                    <!-- body lying horizontal (on its back) -->
                    <ellipse cx="52" cy="64" rx="22" ry="9" fill="#8e8e8e"/>
                    <!-- 4 legs sticking straight up (llama proportions —
                         longer than the cat's; small hooves at the tips) -->
                    <line x1="36" y1="62" x2="34" y2="40" stroke="#7a7a7a" stroke-width="3" stroke-linecap="round"/>
                    <line x1="46" y1="60" x2="44" y2="36" stroke="#7a7a7a" stroke-width="3" stroke-linecap="round"/>
                    <line x1="58" y1="60" x2="60" y2="36" stroke="#7a7a7a" stroke-width="3" stroke-linecap="round"/>
                    <line x1="68" y1="62" x2="70" y2="40" stroke="#7a7a7a" stroke-width="3" stroke-linecap="round"/>
                    <!-- hooves at leg tips -->
                    <ellipse cx="34" cy="40" rx="2.2" ry="1.2" fill="#5a3a2a"/>
                    <ellipse cx="44" cy="36" rx="2.2" ry="1.2" fill="#5a3a2a"/>
                    <ellipse cx="60" cy="36" rx="2.2" ry="1.2" fill="#5a3a2a"/>
                    <ellipse cx="70" cy="40" rx="2.2" ry="1.2" fill="#5a3a2a"/>
                    <!-- neck flopped down to the side -->
                    <path d="M 36 64 Q 24 70 18 64" stroke="#8e8e8e" stroke-width="8" fill="none" stroke-linecap="round"/>
                    <!-- head, eyes are X's -->
                    <ellipse cx="14" cy="62" rx="9" ry="7" fill="#9a9a9a"/>
                    <!-- snout -->
                    <ellipse cx="6" cy="65" rx="4" ry="2.5" fill="#8e8e8e"/>
                    <!-- X X eyes -->
                    <line x1="10" y1="58" x2="14" y2="62" stroke="#1a2a3a" stroke-width="1.5" stroke-linecap="round"/>
                    <line x1="10" y1="62" x2="14" y2="58" stroke="#1a2a3a" stroke-width="1.5" stroke-linecap="round"/>
                    <line x1="16" y1="58" x2="20" y2="62" stroke="#1a2a3a" stroke-width="1.5" stroke-linecap="round"/>
                    <line x1="16" y1="62" x2="20" y2="58" stroke="#1a2a3a" stroke-width="1.5" stroke-linecap="round"/>
                    <!-- limp tongue out -->
                    <ellipse cx="4" cy="68" rx="2.5" ry="1.2" fill="#d04545"/>
                    <!-- floppy ears -->
                    <polygon points="14,55 17,52 16,58" fill="#7a7a7a"/>
                </g>
            </g>
        `;
    }

    _render() {
        if (!this._svg) return;
        // v852 — five states; super_busy added between active and offline.
        const ids = ["idle", "active", "super-busy", "result", "offline"];
        const have3D = !!this._mesh3D;
        for (const id of ids) {
            const g = this._svg.querySelector(`#hb-state-${id}`);
            if (!g) continue;
            // Show the state-group for the active state, hide others.
            // Internal state name uses underscore (super_busy) but the
            // SVG id uses hyphen (super-busy) to read as a valid id.
            const stateId = this.state.replace(/_/g, "-");
            g.style.display = (id === stateId) ? "block" : "none";
            // Round 95 — within the active state-group, control body vs
            // icon visibility separately for 3D mode. The body slot is
            // taken over by the WebGL canvas when 3D mode is live; icons
            // stay visible as corner overlays regardless of mode.
            // hb-body-always (offline body) bypasses this — it ALWAYS
            // shows when offline so the dead-cat survives both modes.
            const body = g.querySelector(".hb-body");
            if (body) {
                body.style.display = have3D ? "none" : "block";
            }
            const icon = g.querySelector(".hb-icon");
            if (icon) {
                icon.style.display = "block";       // always visible while state active
            }
        }
        // In 3D mode, hide canvas during offline so SVG dead-cat shows
        if (have3D && this._canvas3D) {
            this._canvas3D.style.display = (this.state === "offline") ? "none" : "block";
        }
        // Idle bob — gentle 2.4s loop on the WHOLE panel
        if (this.state === "idle") {
            this.root.style.animation = "hb-bob 2.4s ease-in-out infinite";
        } else if (this.state === "result") {
            // Round 93/95 — bounce the whole panel on result so the
            // celebration reads in BOTH 2D and 3D modes. (The inner
            // body's hb-jump animation only fires for 2D mode now.)
            this.root.style.animation = "hb-jump 0.9s ease-out";
        } else {
            this.root.style.animation = "";
        }
        // Update tooltip
        // v853 — offline tooltip mentions the specific error source so
        // hover tells the user what to debug.
        const offlineTip = this._errorSource
            ? `Dead-eye — ${this._errorSource} error (heartbeat.exportErrors() to share)`
            : "Ollama unreachable — start `ollama serve`";
        const titles = {
            idle:       have3D ? "Ollama idle (C3D mascot rendered)" : "Ollama idle (no requests in-flight)",
            active:     "Ollama working...",
            super_busy: "Ollama running flat-out (multiple AI tasks in flight)",
            result:     "Ollama returned a result",
            offline:    offlineTip,
        };
        this.root.title = titles[this.state] ?? "Ollama";
    }

    // ============================================================
    // Round 93 — 3D rendering of the C3D-generated mascot OBJ.
    // ============================================================
    // The body of the avatar (cat in SVG) is replaced by a live render
    // of a mesh produced by the meta-loop: Ollama describes the mascot
    // → C3D generates the OBJ → asset loader caches it → this method
    // uploads + renders it in a tiny WebGL canvas overlayed on the panel.
    // State drives rotation speed (idle slow, active fast) and a brief
    // bounce for "result". Offline always falls back to SVG dead-cat.

    _tryActivate3D() {
        if (this._mesh3D) return;     // already active
        if (!this.assetLoader) return;
        const mesh = this.assetLoader.cache?.get?.(this.assetName);
        if (!mesh || !mesh._rawPositions || !mesh._rawIndices) return;
        // We have a mesh. Build a tiny GL2 context and upload.
        if (!this._canvas3D) this._buildCanvas3D();
        if (!this._gl) return;        // GL setup failed
        const m = this._uploadMesh(mesh);
        if (!m) return;
        this._mesh3D = m;
        // Hide SVG body groups; the state badge handles state indication
        // while the 3D mesh handles the body. Offline state still uses
        // SVG (the C3D mascot doesn't "die" on its own).
        this._canvas3D.style.display = "block";
        this._render();
        if (!this._rafHandle) this._loop3D();
        console.log(`[HeartbeatAvatar] 3D mode activated using "${this.assetName}" (${mesh.vertexCount} verts)`);
    }

    _buildCanvas3D() {
        const canvas = document.createElement("canvas");
        canvas.width = 70;
        canvas.height = 70;
        Object.assign(canvas.style, {
            position: "absolute",
            top: "0",
            left: "0",
            width: "70px",
            height: "70px",
            display: "none",         // hidden until mesh loads
            pointerEvents: "none",
            zIndex: "1",
        });
        this.root.insertBefore(canvas, this.root.firstChild);
        this._canvas3D = canvas;
        const gl = canvas.getContext("webgl2", { antialias: true, alpha: true });
        if (!gl) {
            console.warn("[HeartbeatAvatar] webgl2 unavailable; staying in SVG-only mode");
            return;
        }
        this._gl = gl;
        // Compile minimal shaders. Vertex transforms by model+vp, fragment
        // does flat-shaded lighting from a fixed sun direction. Uses
        // per-vertex color when present, else a default tint.
        const vsrc = `#version 300 es
            in vec3 aPos;
            in vec3 aNorm;
            in vec3 aColor;
            uniform mat4 uModel;
            uniform mat4 uVP;
            out vec3 vN;
            out vec3 vC;
            void main() {
                vN = mat3(uModel) * aNorm;
                vC = aColor;
                gl_Position = uVP * uModel * vec4(aPos, 1.0);
            }`;
        const fsrc = `#version 300 es
            precision mediump float;
            in vec3 vN;
            in vec3 vC;
            uniform int uHasNorms;
            uniform int uHasColors;
            out vec4 outColor;
            void main() {
                vec3 baseCol = (uHasColors == 1) ? vC : vec3(0.55, 0.78, 0.95);
                vec3 N;
                if (uHasNorms == 1) {
                    N = normalize(vN);
                } else {
                    // dFdx normals fallback (flat shading from screen-space derivatives)
                    vec3 dx = dFdx(gl_FragCoord.xyz);
                    vec3 dy = dFdy(gl_FragCoord.xyz);
                    N = normalize(cross(dx, dy));
                }
                vec3 L = normalize(vec3(0.4, 1.0, 0.6));
                float diff = max(0.18, dot(N, L));
                outColor = vec4(baseCol * diff, 1.0);
            }`;
        const vs = this._compile(gl.VERTEX_SHADER, vsrc);
        const fs = this._compile(gl.FRAGMENT_SHADER, fsrc);
        if (!vs || !fs) { this._gl = null; return; }
        const prog = gl.createProgram();
        gl.attachShader(prog, vs);
        gl.attachShader(prog, fs);
        gl.linkProgram(prog);
        if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
            console.warn("[HeartbeatAvatar] shader link failed:", gl.getProgramInfoLog(prog));
            this._gl = null;
            return;
        }
        this._prog = prog;
        this._attr = {
            aPos:   gl.getAttribLocation(prog, "aPos"),
            aNorm:  gl.getAttribLocation(prog, "aNorm"),
            aColor: gl.getAttribLocation(prog, "aColor"),
        };
        this._u = {
            model:    gl.getUniformLocation(prog, "uModel"),
            viewProj: gl.getUniformLocation(prog, "uVP"),
            hasNorms: gl.getUniformLocation(prog, "uHasNorms"),
            hasColors:gl.getUniformLocation(prog, "uHasColors"),
        };
        gl.enable(gl.DEPTH_TEST);
        gl.clearColor(0, 0, 0, 0);   // transparent background
    }

    _compile(type, src) {
        const gl = this._gl;
        const s = gl.createShader(type);
        gl.shaderSource(s, src);
        gl.compileShader(s);
        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
            console.warn("[HeartbeatAvatar] shader compile failed:", gl.getShaderInfoLog(s));
            return null;
        }
        return s;
    }

    _uploadMesh(meshEntry) {
        const gl = this._gl;
        if (!gl || !this._prog) return null;

        const positions = meshEntry._rawPositions;
        const indices   = meshEntry._rawIndices;
        const normals   = meshEntry._rawNormals;
        const colors    = meshEntry._rawColors;

        const vao = gl.createVertexArray();
        gl.bindVertexArray(vao);

        // Positions
        const vbo = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
        gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);
        if (this._attr.aPos >= 0) {
            gl.enableVertexAttribArray(this._attr.aPos);
            gl.vertexAttribPointer(this._attr.aPos, 3, gl.FLOAT, false, 0, 0);
        }

        // Normals (optional)
        let hasNormals = false;
        if (normals && normals.length === positions.length) {
            const nbo = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, nbo);
            gl.bufferData(gl.ARRAY_BUFFER, normals, gl.STATIC_DRAW);
            if (this._attr.aNorm >= 0) {
                gl.enableVertexAttribArray(this._attr.aNorm);
                gl.vertexAttribPointer(this._attr.aNorm, 3, gl.FLOAT, false, 0, 0);
            }
            hasNormals = true;
        } else if (this._attr.aNorm >= 0) {
            gl.disableVertexAttribArray(this._attr.aNorm);
            gl.vertexAttrib3f(this._attr.aNorm, 0, 1, 0);
        }

        // Colors (optional)
        let hasColors = false;
        if (colors && colors.length === positions.length) {
            const cbo = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, cbo);
            gl.bufferData(gl.ARRAY_BUFFER, colors, gl.STATIC_DRAW);
            if (this._attr.aColor >= 0) {
                gl.enableVertexAttribArray(this._attr.aColor);
                gl.vertexAttribPointer(this._attr.aColor, 3, gl.FLOAT, false, 0, 0);
            }
            hasColors = true;
        } else if (this._attr.aColor >= 0) {
            gl.disableVertexAttribArray(this._attr.aColor);
            gl.vertexAttrib3f(this._attr.aColor, 0.55, 0.78, 0.95);
        }

        const ibo = gl.createBuffer();
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);

        gl.bindVertexArray(null);

        // Bounds → center + scale for fit-in-cube. Same approach as
        // assetGallery preview, fixed in v2.89.1 for rotation room.
        const b = meshEntry.bounds || { minX:-1,minY:-1,minZ:-1,maxX:1,maxY:1,maxZ:1 };
        const cx = (b.minX + b.maxX) * 0.5;
        const cy = (b.minY + b.maxY) * 0.5;
        const cz = (b.minZ + b.maxZ) * 0.5;
        const maxDim = Math.max(b.maxX - b.minX, b.maxY - b.minY, b.maxZ - b.minZ) || 1;
        const norm = 0.9 / maxDim;

        return {
            vao,
            indexCount: indices.length,
            hasIndex: true,
            vertexCount: positions.length / 3,
            hasNormals, hasColors,
            cx, cy, cz, norm,
        };
    }

    _loop3D() {
        const tick = (t) => {
            this._rafHandle = requestAnimationFrame(tick);
            if (!this._gl || !this._mesh3D) return;
            this._draw3D(t);
        };
        this._rafHandle = requestAnimationFrame(tick);
    }

    _draw3D(t) {
        const gl = this._gl;
        const m = this._mesh3D;
        if (!gl || !m) return;
        // Offline state: skip GL draw, the SVG dead-cat is showing instead
        if (this.state === "offline") {
            gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
            return;
        }
        gl.viewport(0, 0, this._canvas3D.width, this._canvas3D.height);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        gl.useProgram(this._prog);

        // Rotation speed by state. result has a quick spin in addition to
        // its CSS bounce animation.
        const speedByState = {
            idle:   0.0004,
            active: 0.0028,
            result: 0.005,
            offline:0.0,
        };
        const yaw = t * (speedByState[this.state] ?? 0.0004);
        const tilt = -0.4;
        const c = Math.cos(yaw),  s = Math.sin(yaw);
        const ct = Math.cos(tilt), st = Math.sin(tilt);
        const norm = m.norm;
        // Round 295 — pooled at module scope; see top of file.
        const model = _HEARTBEAT_MODEL_SCRATCH;
        // Build R_X(tilt) * R_Y(yaw) * S(norm) (column-major)
        model[0]  = c*norm;     model[1]  = st*s*norm; model[2]  = -ct*s*norm; model[3]  = 0;
        model[4]  = 0;          model[5]  = ct*norm;   model[6]  = st*norm;    model[7]  = 0;
        model[8]  = s*norm;     model[9]  = -st*c*norm;model[10] = ct*c*norm;  model[11] = 0;
        const tx = -(model[0]*m.cx + model[4]*m.cy + model[8]*m.cz);
        const ty = -(model[1]*m.cx + model[5]*m.cy + model[9]*m.cz);
        const tz = -(model[2]*m.cx + model[6]*m.cy + model[10]*m.cz);
        model[12] = tx; model[13] = ty; model[14] = tz; model[15] = 1;

        // Simple ortho projection scaled to fit clip space
        const vp = _HEARTBEAT_VP_SCRATCH;
        vp.fill(0);
        vp[0] = 0.85; vp[5] = 0.85; vp[10] = -0.5; vp[14] = 0.0; vp[15] = 1;

        gl.uniformMatrix4fv(this._u.viewProj, false, vp);
        gl.uniformMatrix4fv(this._u.model,    false, model);
        gl.uniform1i(this._u.hasNorms,  m.hasNormals ? 1 : 0);
        gl.uniform1i(this._u.hasColors, m.hasColors  ? 1 : 0);
        gl.bindVertexArray(m.vao);
        gl.drawElements(gl.TRIANGLES, m.indexCount, gl.UNSIGNED_INT, 0);
        gl.bindVertexArray(null);
    }

    destroy() {
        if (this._unsub) this._unsub();
        if (this._resultTimer) clearTimeout(this._resultTimer);
        if (this._pollHandle) clearInterval(this._pollHandle);
        if (this._rafHandle) cancelAnimationFrame(this._rafHandle);
        try { if (this._gl) { const _ext = this._gl.getExtension("WEBGL_lose_context"); if (_ext) _ext.loseContext(); this._gl = null; } } catch {}   // v2778 - release context on destroy
        if (this.root && this.root.parentNode) this.root.parentNode.removeChild(this.root);
    }
}
