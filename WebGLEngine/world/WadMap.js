// =============================================================================
// FILE: /world/WadMap.js
// ROUND: 217
// =============================================================================
//
// In-engine topdown minimap for WAD-generated levels, plus a broadcaster
// that emits the same data over the WSBridge so external windows (e.g.
// /wadmap.html in a second browser tab) can render the live map in
// parallel. Cross-runtime portfolio moment: the engine renders the FPS
// view in WebGL while a companion DOM canvas renders the 2D plan from
// the same data stream.
//
// Hooks:
//   • Watches OllamaLevelGenerator._lastLevel for layout changes
//   • Each frame, gathers player position from camera + bot positions
//     from BotManager + pickup positions from FPSShooter
//   • Updates a fixed-position canvas widget (top-right of viewport)
//   • Emits "wadmap:layout" (on layout change) + "wadmap:state" (per
//     frame, throttled to 30Hz) over the bridge
//
// Replay system:
//   • Records every emitted state frame into a circular buffer
//     (default 60s @ 30Hz = 1800 frames)
//   • save() returns a JSON blob; load() restores
//   • play(speed) drives playback into a separate virtual state
//
// API:
//   const wm = new WadMap({ camera, ollamaLevelGen, fpsShooter,
//                            botManager, bridge });
//   wm.start();
//   wm.tick(dt);
//   wm.startRecording();
//   wm.stopRecording();
//   wm.saveRecording();    // → JSON object
//   wm.loadRecording(json);
//   wm.play({ speed: 1.0 });
//   wm.stop();
//
// Console:
//   window.wadmap.startRecording()
//   window.wadmap.stopRecording()
//   window.wadmap.saveRecording()
//   window.wadmap.play({ speed: 2 })
//   window.wadmap.replay()  // alias for play
// =============================================================================

const STATE_EMIT_INTERVAL_MS = 33;    // ~30Hz
const REPLAY_MAX_FRAMES      = 1800;  // 60 seconds at 30Hz
const MINIMAP_SIZE           = 180;   // pixels (square)
const MINIMAP_PAD            = 16;    // pixels

export class WadMap {
    constructor({
        camera, ollamaLevelGen,
        fpsShooter = null, botManager = null, bridge = null,
        kaijuManager = null, civManager = null,
    }) {
        this.camera = camera;
        this.ollamaLevelGen = ollamaLevelGen;
        this.fpsShooter = fpsShooter;
        this.botManager = botManager;
        this.bridge = bridge;
        // v446 — always-on radar: kaiju + civ markers regardless of WAD layout
        this.kaijuManager = kaijuManager;
        this.civManager = civManager;

        this.active = false;
        this._canvasEl = null;
        this._ctx = null;
        this._wrapper = null;

        this._lastLayout = null;
        this._lastEmitMs = 0;

        // Replay
        this._recording = false;
        this._recordBuffer = [];
        this._recordStartMs = 0;

        this._playing = false;
        this._playSpeed = 1.0;
        this._playStartMs = 0;
        this._playRecording = null;
        this._playLayout = null;

        // Round 270 — damage / event pulses. Other systems push world
        // (x, z) + color + duration; we render fading rings on the
        // minimap during the lifetime. Cheap: bounded ring buffer
        // limits the maximum overhead.
        this._pulses = [];
        this._pulseCap = 40;
    }

    // Round 270 — public API for damage/event pulses. Anyone with a
    // world-space (x, z) can ping the minimap (kaiju hits, civ
    // counter-attacks, satellite strikes, etc). Stored as world coords
    // so the existing scale/offset transform handles rendering.
    addPulse(x, z, opts = {}) {
        const pulse = {
            x, z,
            color: opts.color ?? "#ff7a3a",
            radius: opts.radius ?? 12,
            durationMs: opts.durationMs ?? 900,
            startMs: (typeof performance !== "undefined") ? performance.now() : Date.now(),
        };
        if (this._pulses.length >= this._pulseCap) this._pulses.shift();
        this._pulses.push(pulse);
    }

    start() {
        if (this.active) return;
        this.active = true;
        this._buildWidget();
        // If a layout is already loaded, broadcast it immediately
        const lay = this.ollamaLevelGen?._lastLevel;
        if (lay) this._broadcastLayout(lay);
    }

    // v460 — show/hide the minimap widget without tearing it down. Demos that
    // don't use a map (clean rooms, build viewer, etc.) hide it; kaiju/WAD/etc.
    // show it. Non-destructive so toggling back is instant.
    setVisible(on) {
        this._hidden = !on;
        if (this._wrapper) this._wrapper.style.display = on ? "" : "none";
    }

    stop() {
        this.active = false;
        if (this._wrapper) {
            this._wrapper.remove();
            this._wrapper = null;
            this._canvasEl = null;
            this._ctx = null;
        }
        if (this._recording) this.stopRecording();
        if (this._playing) this._playing = false;
    }

    tick(dt) {
        if (!this.active) return;

        const layout = this.ollamaLevelGen?._lastLevel;
        if (layout && layout !== this._lastLayout) {
            this._lastLayout = layout;
            this._broadcastLayout(layout);
        }

        // Build state snapshot
        const state = this._buildState();
        const nowMs = performance.now();
        if (nowMs - this._lastEmitMs >= STATE_EMIT_INTERVAL_MS) {
            this._lastEmitMs = nowMs;
            this._broadcastState(state);
            if (this._recording) this._recordFrame(state, nowMs);
        }

        // Playback overrides display state if active
        const drawState = this._playing ? this._playbackState(nowMs) : state;
        if (this._ctx) this._drawMinimap(this._playing ? this._playLayout : layout, drawState);

        // v446 — KAIJU ALERT ticker: flash on the collapsed compass whenever
        // kaiju are present; hidden while expanded (the red blips show then).
        if (this._alertEl) {
            const kaijuPresent = (drawState?.kaiju?.length || 0) > 0;
            this._alertEl.style.display = (kaijuPresent && !this._expanded) ? "block" : "none";
        }
    }

    _buildState() {
        const cam = this.camera?.position;
        const bots = [];
        if (this.botManager?.bots) {
            for (const b of this.botManager.bots.values()) {
                bots.push({ id: b.entityId, x: b.x, z: b.z, kind: b.kind, hp: b.hp, state: b.state });
            }
        }
        const fps = this.fpsShooter ? {
            health: this.fpsShooter.health,
            ammo:   this.fpsShooter.ammo,
            kills:  this.fpsShooter.kills,
            active: this.fpsShooter.active,
        } : null;
        // v446 — kaiju + civ markers so the minimap is a live radar in any
        // mode (kaiju world, OGRE, CS, WAD), not just WAD-generated levels.
        const kaiju = [];
        try {
            const km = this.kaijuManager;
            const it = km?.kaiju?.values ? km.kaiju.values() : (Array.isArray(km?.kaiju) ? km.kaiju : []);
            for (const k of it) {
                const p = k?.position || k;
                if (p && p.x != null && p.z != null) kaiju.push({ x: p.x, z: p.z, name: k.name, kind: k.kind });
            }
        } catch {}
        const civs = [];
        try {
            const list = this.civManager?.getAll?.() || [];
            for (const c of list) {
                const ctr = c?.center || c?.position || c;
                if (ctr && ctr.x != null && ctr.z != null) civs.push({ x: ctr.x, z: ctr.z });
            }
        } catch {}
        return {
            t: performance.now(),
            player: cam ? { x: cam.x, y: cam.y, z: cam.z, yaw: this.camera.yaw } : null,
            bots,
            fps,
            kaiju,
            civs,
        };
    }

    _broadcastLayout(layout) {
        if (!this.bridge?.emit) return;
        try {
            this.bridge.emit("wadmap:layout", { layout, t: performance.now() });
        } catch (e) {}
    }

    _broadcastState(state) {
        if (!this.bridge?.emit) return;
        try { this.bridge.emit("wadmap:state", state); } catch (e) {}
    }

    // ----- Replay -----

    startRecording() {
        this._recording = true;
        this._recordBuffer = [];
        this._recordStartMs = performance.now();
        this._recordLayoutSnapshot = JSON.parse(JSON.stringify(this._lastLayout || null));
        if (this.bridge?.emit) this.bridge.emit("wadmap:record_start", { t: this._recordStartMs });
        console.log("[wadmap] recording started");
    }

    stopRecording() {
        if (!this._recording) return;
        this._recording = false;
        if (this.bridge?.emit) {
            this.bridge.emit("wadmap:record_stop", { frames: this._recordBuffer.length });
        }
        console.log(`[wadmap] recording stopped — ${this._recordBuffer.length} frames`);
    }

    _recordFrame(state, nowMs) {
        if (this._recordBuffer.length >= REPLAY_MAX_FRAMES) {
            this._recordBuffer.shift();
        }
        this._recordBuffer.push({
            dt: nowMs - this._recordStartMs,
            state,
        });
    }

    saveRecording() {
        return {
            version: 1,
            durationMs: this._recordBuffer.length > 0
                ? this._recordBuffer[this._recordBuffer.length - 1].dt : 0,
            layout: this._recordLayoutSnapshot,
            frames: this._recordBuffer.map(f => ({ dt: f.dt, state: f.state })),
        };
    }

    loadRecording(obj) {
        if (!obj || obj.version !== 1 || !Array.isArray(obj.frames)) {
            console.warn("[wadmap] invalid recording");
            return false;
        }
        this._playRecording = obj;
        this._playLayout = obj.layout || null;
        return true;
    }

    play({ speed = 1.0 } = {}) {
        if (!this._playRecording && this._recordBuffer.length === 0) {
            console.warn("[wadmap] no recording to play");
            return;
        }
        if (!this._playRecording) {
            // Use the in-memory recording
            this._playRecording = this.saveRecording();
        }
        this._playSpeed = speed;
        this._playStartMs = performance.now();
        this._playing = true;
        console.log(`[wadmap] playback started — ${this._playRecording.frames.length} frames @ ${speed}x`);
    }

    _playbackState(nowMs) {
        if (!this._playRecording) return null;
        const elapsed = (nowMs - this._playStartMs) * this._playSpeed;
        const frames = this._playRecording.frames;
        // Find the closest frame <= elapsed
        let idx = 0;
        for (let i = 0; i < frames.length; i++) {
            if (frames[i].dt > elapsed) break;
            idx = i;
        }
        // End of playback
        if (idx >= frames.length - 1 && elapsed > (frames[frames.length-1]?.dt ?? 0) + 200) {
            this._playing = false;
            return null;
        }
        return frames[idx].state;
    }

    replay() { return this.play(); }

    // ----- Rendering -----

    _buildWidget() {
        if (typeof document === "undefined") return;
        const w = document.createElement("div");
        w.id = "wadmap-widget";
        // Round 260 — compass mode. Default is a small 60×60 circle in
        // the top-right showing just player position + heading. On
        // hover, expands to the full MINIMAP_SIZE square. Mouse-leave
        // collapses back. The canvas stays full-size internally; CSS
        // scales it down with object-fit so the same draw code works.
        //
        // Round 263b — back up to top edge per user feedback "compass
        // can move up to the top and 1/4 inch to the right". top stays
        // at MINIMAP_PAD (16px); right pulled in 24px (1/4 inch) so it
        // sits ~22px from the screen's right edge.
        const COMPASS_SIZE = 60;
        const COMPASS_R    = COMPASS_SIZE / 2;
        Object.assign(w.style, {
            position: "fixed",
            // v446 — moved down ~0.5in and left ~1in per request.
            top:   `${MINIMAP_PAD + 48}px`,
            right: `98px`,
            width: `${COMPASS_SIZE}px`,
            height: `${COMPASS_SIZE}px`,
            background: "rgba(0,0,0,0.65)",
            border: "1px solid rgba(200,200,255,0.3)",
            borderRadius: "50%",   // circle in compass mode
            zIndex: "8500",
            pointerEvents: "auto",   // need hover events
            transition: "width 0.20s, height 0.20s, border-radius 0.20s",
            overflow: "hidden",
            cursor: "pointer",
        });
        const c = document.createElement("canvas");
        c.width = MINIMAP_SIZE;
        c.height = MINIMAP_SIZE;
        Object.assign(c.style, {
            width: "100%", height: "100%",
            display: "block",
            objectFit: "cover",
        });
        w.appendChild(c);
        const label = document.createElement("div");
        Object.assign(label.style, {
            position: "absolute", top: "2px", left: "6px",
            color: "#9cf", fontFamily: "monospace", fontSize: "10px",
            textShadow: "0 0 4px rgba(0,0,0,1)",
            opacity: "0",   // hidden in compass mode
            transition: "opacity 0.15s",
            pointerEvents: "none",
        });
        label.textContent = "MINIMAP";
        w.appendChild(label);
        // v446 — KAIJU ALERT ticker. A red band that flashes across the
        // compass whenever kaiju are present, so threats are obvious even
        // while the map is collapsed. tick() toggles its visibility.
        if (!document.getElementById("_minimap_alert_kf")) {
            const kf = document.createElement("style");
            kf.id = "_minimap_alert_kf";
            kf.textContent = "@keyframes minimapAlertFlash{0%,100%{opacity:0.35}50%{opacity:1}}";
            document.head.appendChild(kf);
        }
        const alertEl = document.createElement("div");
        Object.assign(alertEl.style, {
            position: "absolute", left: "0", right: "0", bottom: "0",
            height: "16px", lineHeight: "16px",
            background: "rgba(200,20,20,0.85)", color: "#fff",
            fontFamily: "monospace", fontSize: "8px", fontWeight: "700",
            letterSpacing: "1px", textAlign: "center", whiteSpace: "nowrap",
            overflow: "hidden", pointerEvents: "none",
            display: "none", animation: "minimapAlertFlash 0.7s infinite",
        });
        alertEl.textContent = "⚠ KAIJU ALERT";
        w.appendChild(alertEl);
        this._alertEl = alertEl;
        // Hover expand
        let _expanded = false;
        this._expanded = false;
        w.addEventListener("mouseenter", () => {
            _expanded = true; this._expanded = true;
            w.style.width  = MINIMAP_SIZE + "px";
            w.style.height = MINIMAP_SIZE + "px";
            w.style.borderRadius = "4px";
            label.style.opacity = "1";
            if (this._alertEl) this._alertEl.style.display = "none";   // blips show instead
        });
        w.addEventListener("mouseleave", () => {
            _expanded = false; this._expanded = false;
            w.style.width  = COMPASS_SIZE + "px";
            w.style.height = COMPASS_SIZE + "px";
            w.style.borderRadius = "50%";
            label.style.opacity = "0";
        });
        document.body.appendChild(w);
        this._wrapper = w;
        this._canvasEl = c;
        this._ctx = c.getContext("2d");

        // Round 272 — click-to-teleport. Translate the click into world
        // coords using the stored inverse transform, then move the
        // engine camera to that point. Only fires when the map is
        // EXPANDED (compass-mode clicks are too coarse — easy to misfire
        // when reaching for the mouse). Shift+click skips the surface
        // clamp so you can teleport into mid-air for cinematic shots.
        c.addEventListener("click", (e) => {
            if (!_expanded) return;
            if (!this._invTransform) return;
            const rect = c.getBoundingClientRect();
            // Canvas is CSS-scaled to fit its wrapper. Convert the click
            // from CSS pixels to canvas-internal pixels first.
            const sx = (e.clientX - rect.left) * (c.width  / rect.width);
            const sy = (e.clientY - rect.top)  * (c.height / rect.height);
            const { offX, offZ, scale } = this._invTransform;
            if (scale <= 0) return;
            const wx = (sx - offX) / scale;
            const wz = (sy - offZ) / scale;
            const camera = (typeof window !== "undefined") ? window._camera : null;
            if (!camera?.position) {
                console.warn("[WadMap] no camera ref — can't teleport");
                return;
            }
            camera.position.x = wx;
            camera.position.z = wz;
            // Lift to surface so the player isn't inside a hill.
            // Shift+click skips this (for mid-air or freecam shots).
            if (!e.shiftKey && typeof window._clampCameraToGround === "function") {
                window._clampCameraToGround(camera, { minBuffer: 2, maxLift: 60 });
            }
            console.log(`[WadMap] teleport → (${wx.toFixed(1)}, ${camera.position.y.toFixed(1)}, ${wz.toFixed(1)})`);
        });
        // Hover cue — pointer cursor when expanded
        c.addEventListener("mouseenter", () => { c.style.cursor = "crosshair"; });
        c.addEventListener("mouseleave", () => { c.style.cursor = ""; });
    }

    _drawMinimap(layout, state) {
        const ctx = this._ctx;
        if (!ctx) return;
        ctx.clearRect(0, 0, MINIMAP_SIZE, MINIMAP_SIZE);

        // Compute world→canvas transform
        const bounds = this._computeBounds(layout, state);
        if (!bounds) return;
        const { minX, minZ, maxX, maxZ } = bounds;
        const wWidth = Math.max(1, maxX - minX);
        const wDepth = Math.max(1, maxZ - minZ);
        const scaleX = (MINIMAP_SIZE - 16) / wWidth;
        const scaleZ = (MINIMAP_SIZE - 16) / wDepth;
        const scale  = Math.min(scaleX, scaleZ);
        const offX = (MINIMAP_SIZE - wWidth * scale) / 2 - minX * scale;
        const offZ = (MINIMAP_SIZE - wDepth * scale) / 2 - minZ * scale;
        const w2c = (x, z) => ({
            cx: offX + x * scale,
            cy: offZ + z * scale,
        });
        // Round 272 — store the inverse transform so the click handler
        // can turn a canvas-relative click into world coords for teleport.
        this._invTransform = { offX, offZ, scale };

        // Draw rooms
        // Round 248 — color-code rooms by their terrain / platforming
        // attributes so the player can see at a glance which rooms are
        // flat boxes vs natural-looking vs pit-of-platforms vs flooded.
        if (layout?.rooms) {
            ctx.lineWidth = 1;
            for (const r of layout.rooms) {
                const a = w2c(r.x, r.z);
                const b = w2c(r.x + r.w, r.z + r.d);
                const { fill, stroke, glyph } = this._roomStyleFor(r);
                ctx.fillStyle = fill;
                ctx.strokeStyle = stroke;
                ctx.fillRect(a.cx, a.cy, b.cx - a.cx, b.cy - a.cy);
                ctx.strokeRect(a.cx, a.cy, b.cx - a.cx, b.cy - a.cy);
                // Glyph marker top-right (visual hint for terrain kind)
                if (glyph) {
                    ctx.fillStyle = stroke;
                    ctx.font = "8px monospace";
                    ctx.fillText(glyph, b.cx - 9, a.cy + 8);
                }
                ctx.fillStyle = "rgba(200,220,255,0.6)";
                ctx.font = "9px monospace";
                ctx.fillText(r.id ?? "", a.cx + 2, a.cy + 10);
            }
        }
        // Corridors
        if (layout?.corridors && layout?.rooms) {
            const byId = {};
            for (const r of layout.rooms) byId[r.id] = r;
            ctx.strokeStyle = "rgba(180,140,80,0.7)";
            ctx.lineWidth = 2;
            for (const c of layout.corridors) {
                const a = byId[c.from], b = byId[c.to];
                if (!a || !b) continue;
                const ap = w2c(a.x + a.w/2, a.z + a.d/2);
                const bp = w2c(b.x + b.w/2, b.z + b.d/2);
                ctx.beginPath();
                ctx.moveTo(ap.cx, ap.cy);
                ctx.lineTo(bp.cx, bp.cy);
                ctx.stroke();
            }
        }
        // Bots
        if (state?.bots) {
            for (const b of state.bots) {
                const p = w2c(b.x, b.z);
                ctx.fillStyle = b.kind === "bot_sniper" ? "#8df" :
                                b.kind === "bot_heavy"  ? "#f84" : "#fb4";
                ctx.beginPath();
                ctx.arc(p.cx, p.cy, 3, 0, Math.PI * 2);
                ctx.fill();
            }
        }
        // Round 270 — damage / event pulses. Drawn under the player
        // dot so it never obscures the player. Expanding ring +
        // fading alpha; despawn when life elapsed.
        if (this._pulses.length > 0) {
            const nowMs = (typeof performance !== "undefined") ? performance.now() : Date.now();
            for (let i = this._pulses.length - 1; i >= 0; i--) {
                const p = this._pulses[i];
                const age = nowMs - p.startMs;
                if (age >= p.durationMs) { this._pulses.splice(i, 1); continue; }
                const t = age / p.durationMs;          // 0..1
                const r = p.radius * (0.4 + t * 1.4);  // grows
                const alpha = 1 - t;                   // fades
                const c = w2c(p.x, p.z);
                ctx.globalAlpha = alpha;
                ctx.strokeStyle = p.color;
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.arc(c.cx, c.cy, r, 0, Math.PI * 2);
                ctx.stroke();
            }
            ctx.globalAlpha = 1;
        }
        // v446 — civilizations (cyan squares) under the player/kaiju layer.
        if (state?.civs) {
            ctx.fillStyle = "#3cf";
            for (const c of state.civs) {
                const p = w2c(c.x, c.z);
                ctx.fillRect(p.cx - 2.5, p.cy - 2.5, 5, 5);
            }
        }
        // v447 — RADAR SWEEP. A beam rotates from the radar center (~one
        // revolution every 4s); kaiju the beam has just passed flash brighter
        // and fade until the next pass, like a real radar scope.
        const _sweep = ((performance.now() / 1000) * (Math.PI * 2 / 4)) % (Math.PI * 2);
        const _pc = state?.player ? w2c(state.player.x, state.player.z) : { cx: MINIMAP_SIZE / 2, cy: MINIMAP_SIZE / 2 };
        // v446 — kaiju (red dots) with a radar-ping glow when the beam passes.
        if (state?.kaiju && state.kaiju.length) {
            for (const k of state.kaiju) {
                const p = w2c(k.x, k.z);
                let ang = Math.atan2(p.cy - _pc.cy, p.cx - _pc.cx);
                ang = (ang + Math.PI * 2) % (Math.PI * 2);
                let d = (_sweep - ang + Math.PI * 2) % (Math.PI * 2);   // 0 = just passed
                const ping = d < 1.0 ? (1 - d / 1.0) : 0;
                ctx.fillStyle = `rgba(255,60,60,${(0.18 + 0.3 * ping).toFixed(3)})`;
                ctx.beginPath(); ctx.arc(p.cx, p.cy, 6 + ping * 5, 0, Math.PI * 2); ctx.fill();
                const g = Math.round(48 - ping * 48);
                ctx.fillStyle = `rgb(255,${g},${g})`;
                ctx.beginPath(); ctx.arc(p.cx, p.cy, 3.5, 0, Math.PI * 2); ctx.fill();
            }
        }
        // Sweep beam + fading trail, drawn over the blips.
        {
            const R = MINIMAP_SIZE * 0.72;
            for (let i = 0; i < 10; i++) {
                const a = _sweep - (i / 10) * 0.85;
                ctx.strokeStyle = `rgba(90,255,130,${((1 - i / 10) * 0.15).toFixed(3)})`;
                ctx.lineWidth = 2;
                ctx.beginPath(); ctx.moveTo(_pc.cx, _pc.cy); ctx.lineTo(_pc.cx + Math.cos(a) * R, _pc.cy + Math.sin(a) * R); ctx.stroke();
            }
            ctx.strokeStyle = "rgba(150,255,180,0.7)"; ctx.lineWidth = 1.5;
            ctx.beginPath(); ctx.moveTo(_pc.cx, _pc.cy); ctx.lineTo(_pc.cx + Math.cos(_sweep) * R, _pc.cy + Math.sin(_sweep) * R); ctx.stroke();
        }
        // Player (always drawn last, on top)
        if (state?.player) {
            const p = w2c(state.player.x, state.player.z);
            ctx.fillStyle = "#4f8";
            ctx.beginPath();
            ctx.arc(p.cx, p.cy, 4, 0, Math.PI * 2);
            ctx.fill();
            // Yaw indicator
            const yaw = state.player.yaw ?? 0;
            const dx = Math.sin(yaw) * 8;
            const dz = Math.cos(yaw) * 8;
            ctx.strokeStyle = "#4f8";
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(p.cx, p.cy);
            ctx.lineTo(p.cx + dx, p.cy + dz);
            ctx.stroke();
        }
        // Playback indicator
        if (this._playing) {
            ctx.fillStyle = "#f33";
            ctx.font = "9px monospace";
            ctx.fillText("▶ PLAYBACK", 4, MINIMAP_SIZE - 5);
        } else if (this._recording) {
            ctx.fillStyle = "#f33";
            ctx.beginPath();
            ctx.arc(MINIMAP_SIZE - 10, 8, 4, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = "#fff";
            ctx.font = "9px monospace";
            ctx.fillText("REC", MINIMAP_SIZE - 35, 11);
        }
    }

    // Round 248 — pick fill/stroke/glyph based on the room's terrain
    // and platforming flags. Layered priority:
    //   • water=5+      → submerged blue (overrides terrain)
    //   • platforming   → orange (stands out as a hazard)
    //   • terrain=rough → ochre with chevron glyph
    //   • terrain=hills → moss-green with bump glyph
    //   • water=3-4     → muted blue with wave glyph
    //   • water=1-2     → pale blue tint
    //   • default       → original muted blue
    _roomStyleFor(r) {
        const water = r.water | 0;
        if (water >= 5) {
            return { fill: "rgba(40,80,150,0.45)", stroke: "rgba(120,180,240,0.9)", glyph: "≈" };
        }
        if (r.platforming) {
            return { fill: "rgba(180,90,40,0.30)", stroke: "rgba(240,160,80,0.9)", glyph: "✦" };
        }
        if (r.terrain === "rough") {
            return { fill: "rgba(150,110,50,0.30)", stroke: "rgba(220,170,90,0.9)", glyph: "^" };
        }
        if (r.terrain === "hills") {
            return { fill: "rgba(70,130,80,0.30)", stroke: "rgba(140,200,140,0.9)", glyph: "~" };
        }
        if (water >= 3) {
            return { fill: "rgba(60,100,160,0.30)", stroke: "rgba(140,180,220,0.8)", glyph: "≈" };
        }
        if (water >= 1) {
            return { fill: "rgba(80,140,200,0.30)", stroke: "rgba(150,180,220,0.8)", glyph: null };
        }
        return { fill: "rgba(80,140,200,0.25)", stroke: "rgba(150,180,220,0.8)", glyph: null };
    }

    _computeBounds(layout, state) {
        let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
        if (layout?.rooms?.length) {
            for (const r of layout.rooms) {
                if (r.x < minX) minX = r.x;
                if (r.z < minZ) minZ = r.z;
                if (r.x + r.w > maxX) maxX = r.x + r.w;
                if (r.z + r.d > maxZ) maxZ = r.z + r.d;
            }
        }
        // Also include player + bots so they don't get clipped
        if (state?.player) {
            minX = Math.min(minX, state.player.x - 4);
            minZ = Math.min(minZ, state.player.z - 4);
            maxX = Math.max(maxX, state.player.x + 4);
            maxZ = Math.max(maxZ, state.player.z + 4);
        }
        if (state?.bots) {
            for (const b of state.bots) {
                minX = Math.min(minX, b.x - 2);
                minZ = Math.min(minZ, b.z - 2);
                maxX = Math.max(maxX, b.x + 2);
                maxZ = Math.max(maxZ, b.z + 2);
            }
        }
        if (!isFinite(minX)) return null;
        // v446 — when there's no WAD layout (kaiju world / OGRE / sandbox),
        // show a fixed-radius radar centered on the player so nearby kaiju and
        // civs are always visible at a useful zoom instead of a tight crop.
        if (!(layout?.rooms?.length) && state?.player) {
            const R = 150;
            return {
                minX: state.player.x - R, minZ: state.player.z - R,
                maxX: state.player.x + R, maxZ: state.player.z + R,
            };
        }
        // Pad
        const pad = 4;
        return { minX: minX - pad, minZ: minZ - pad, maxX: maxX + pad, maxZ: maxZ + pad };
    }

    getStats() {
        return {
            active: this.active,
            recording: this._recording,
            playing: this._playing,
            recordedFrames: this._recordBuffer.length,
            playSpeed: this._playSpeed,
        };
    }
}
