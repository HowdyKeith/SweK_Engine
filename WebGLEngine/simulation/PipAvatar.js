// FILE: simulation/PipAvatar.js
// VERSION: v4 — round 260
//
// SINGLE PANEL now — the OLLAMA side slot RETIRED. The in-world Ollama
// character (HeartbeatAvatar) is the canonical Ollama presence.
//
// KPop LISTENER panel layout:
//
//   ┌────────────────────────────┐
//   │ KPop LISTENER     ≡  [▼ min] │  ← drag handle row
//   ├────────────────────────────┤
//   │  [face|robot|GLB]           │  view-mode selector
//   │                             │
//   │       (rigged robot         │
//   │        iframe @ ~50%        │
//   │        scale via radius)    │
//   │                             │
//   │  ⟿  heartbeat ECG line  ⟿  │  ← live pulse from event traffic
//   │                             │
//   │  HUNGER ▰▰▰▰░░░░░░          │  ← read from TamagotchiView state
//   │  HAPPY  ▰▰▰▰▰▰▰░░░          │
//   │  ENERGY ▰▰▰▰▰▰▰▰░░          │
//   │                             │
//   │  [FEED] [PLAY] [SLEEP]      │  ← route through tamagotchi._handleMessage
//   └────────────────────────────┘
//
// Architectural notes:
//   • OLLAMA slot removed entirely. M2 voice routing now no-ops (Ollama
//     presence is the in-world HeartbeatAvatar).
//   • Tamagotchi state surfaced inside this panel rather than its own
//     window. The TamagotchiView instance still runs the stat-decay sim
//     in background; we poll its `.stats` for display and route the
//     three action buttons through `tamagotchi._handleMessage`.
//   • Heartbeat line is a tiny canvas drawing a faux-ECG trace. Each
//     speak / event triggers a pulse spike. Idle = baseline drift.
//   • No "— IDLE —" footer, no green-dot indicator, no in-canvas hint
//     text. The user found those redundant.

const LIP_SYNC_MIN_MS  = 1500;
const LIP_SYNC_PER_CHAR_MS = 60;
const LIP_SYNC_MAX_MS  = 8000;

const VOICE_EXPRESSION = {
    M1: "wave",
    M2: "alert",
    F1: "happy",
    F2: "play",
};

const LISTENER_VIEW_URL = {
    // v970 — the phone-style diorama stage (matches control.html): rigged avatar
    // wandering among 3D gauges + ticker. Default. ?glb2= adds a 2nd avatar.
    stage: "/avatarstage.html?voice=M1&scene=diorama&camdock=1&orb=1",   // v1003 diorama + v1005 camera in the panel dock
    // v972 — shared DUO stage: two avatars approach + dance/highfive/spar/hug
    // (avatarStage scene:"duo"). Reachable via the avatar cycle button.
    duo:   "/avatarstage.html?voice=M1&glb2=BrainStem&camdock=1",
    face:  "/face.html?voice=M1",
    // v978 — robot/glb render into the diorama stage (was RobotExpressive.html, which
    // showed the old accessory-laden renderer with bad framing).
    robot: "/avatarstage.html?voice=M1&glb=RobotExpressive&camdock=1",
    glb:   "/avatarstage.html?voice=M1&glb=RobotExpressive&camdock=1",
};
const DEFAULT_LISTENER_VIEW = "stage";

function estimateSpeakMs(text) {
    if (!text) return LIP_SYNC_MIN_MS;
    return Math.max(LIP_SYNC_MIN_MS, Math.min(LIP_SYNC_MAX_MS, text.length * LIP_SYNC_PER_CHAR_MS));
}

export class PipAvatar {

    constructor({ kpop = null, tamagotchi = null, heartbeatAvatar = null,
                   listenerView = DEFAULT_LISTENER_VIEW } = {}) {
        this.kpop = kpop;
        this.tamagotchi = tamagotchi;
        this.heartbeatAvatar = heartbeatAvatar;     // round 261 — embed in slot top-right
        this._listenerView = listenerView;
        this._visible = false;
        this._minimized = false;
        this._panelState = "full";   // v1005 — full | semi | min
        this._userScale = 1;          // v1006 — user resize factor (0.6–1.6)
        this._container = null;
        this._listener = null;
        this._thoughtTimer = null;
        this._heartbeatTimer = null;
        this._heartbeatPhase = 0;
        this._heartbeatPulseMs = 0;
        this._statsTimer = null;

        // Sub-APIs for engine code
        this.listener = {
            setStatus: (msg) => { /* status row removed in v4 */ },
            setView:   (mode) => this.setListenerView(mode),
            pulse:     () => this._pulseHeartbeat(),
        };
        // OLLAMA sub-API stubs retained for callers from v259 — they now
        // route to the in-world HeartbeatAvatar via window.ollamaHeartbeat
        // if present; otherwise no-op. v260 retired the panel.
        this.ollama = {
            thought: (obj) => {
                try { window.ollamaHeartbeat?.thought?.(obj); } catch {}
            },
            setStatus: () => {},
            setClips:  () => {},
        };

        // Wrap kpop.speak so each call pulses the heartbeat + forwards
        // animations to the rigged listener.
        if (this.kpop?.speak) {
            this._origSpeak = this.kpop.speak.bind(this.kpop);
            this.kpop.speak = async (opts) => {
                opts = opts || {};
                // Round 272 — inject a boundary callback when the kpop
                // client is in BrowserTTS mode. The actual word-level
                // timing arrives via window.speechSynthesis boundary
                // events; we forward each one to the iframe so the
                // robot's phoneme curve re-anchors mid-utterance instead
                // of relying purely on the text-length estimate.
                if (this.kpop._useBrowserTTS && !opts.onBoundary) {
                    const ttsT0 = performance.now();
                    const textLen = (opts.Text || "").length || 1;
                    opts.onBoundary = (evt) => {
                        // evt: { charIndex, elapsed, name }
                        // Compute the fractional position in the text and
                        // forward to the iframe + OLLAMA mouth so they
                        // can snap their curve playback head to match
                        // actual speech progress.
                        const frac = Math.max(0, Math.min(1, (evt.charIndex ?? 0) / textLen));
                        const frame = this._listener?.iframe;
                        if (frame?.contentWindow) {
                            try {
                                frame.contentWindow.postMessage({
                                    type: "kpop:tts_boundary",
                                    fraction: frac,
                                    elapsedMs: evt.elapsed,
                                    startedAtMs: ttsT0,
                                }, "*");
                            } catch {}
                        }
                        if (this.heartbeatAvatar?._reanchorMouth) {
                            try { this.heartbeatAvatar._reanchorMouth(frac, evt.elapsed); }
                            catch {}
                        }
                    };
                }
                try { this.speak(opts); } catch (e) {
                    console.warn("[PipAvatar] speak relay failed:", e);
                }
                return this._origSpeak(opts);
            };
        }

        if (typeof window !== "undefined") {
            window.addEventListener("message", (e) => {
                const m = e?.data;
                if (!m || typeof m !== "object") return;
                if (m.type === "kpop:clipsLoaded") {
                    // No longer displayed inline (clutter), but logged
                    // for debugging visibility.
                    console.log(`[KPop LISTENER] loaded ${m.count} clips:`,
                        (m.names || []).slice(0, 5).join(", "));
                }
                // Round 269 — long-press on the robot canvas posts this
                // to cycle the listener view (robot → face → glb → robot).
                // Lets users tap the avatar to switch views without
                // aiming at the small emoji tab at top of the panel.
                else if (m.type === "kpop:cycleView") {
                    // v859 — use the dynamic cycle (built-ins + Your_Avatars
                    // + favorites + face) instead of the old 3-mode order.
                    // Long-press on the robot canvas advances through the
                    // same cycle the faceSwitcher button uses.
                    const cycle = (typeof this._pcCycle === "function") ? this._pcCycle() : null;
                    if (cycle && cycle.length) {
                        const cur = this._listenerView;
                        const idx = cycle.findIndex(c => c.key === cur);
                        const next = cycle[((idx >= 0 ? idx : -1) + 1) % cycle.length];
                        if (next && this._pcSetByKey) this._pcSetByKey(next.key);
                        console.log(`[PipAvatar] view cycled to "${next?.key}"`);
                    } else {
                        // Legacy fallback (during early init before cycle built)
                        const order = ["robot", "face", "glb"];
                        const cur = this._listenerView || "robot";
                        const next = order[(order.indexOf(cur) + 1) % order.length];
                        this.setListenerView(next);
                        console.log(`[PipAvatar] view cycled to "${next}" (legacy fallback)`);
                    }
                }
            });
        }
    }

    isVisible()   { return this._visible; }
    isMinimized() { return this._minimized; }
    getListenerView() { return this._listenerView; }

    show() {
        if (this._visible) return;
        this._visible = true;
        this._build();
        this._startHeartbeat();
        this._startStatsPoll();
    }

    hide() {
        if (!this._visible) return;
        this._visible = false;
        this._stopHeartbeat();
        this._stopStatsPoll();
        this._teardown();
    }

    toggle() {
        if (this._visible) this.hide();
        else this.show();
    }

    // v1005 (panel stage 3b) — three view modes: "full" (docked or floating, full
    // panel), "semi" (small diorama snapped top-center), "min" (tab only). The
    // header "−" cycles full→semi→min; the minitab restores to full.
    _applyPanelState(state) {
        if (!this._container) return;
        if (state !== "full" && state !== "semi" && state !== "min") state = "full";
        this._panelState = state;
        this._minimized = (state === "min");
        const root = this._container, mt = this._miniTab;
        if (state === "min") {
            root.style.display = "none";
            if (mt) mt.style.display = "block";
        } else if (state === "semi") {
            if (mt) mt.style.display = "none";
            root.style.display = "flex";
            root.style.left = "50%"; root.style.right = "auto";
            root.style.top = "0px"; root.style.bottom = "auto";
            root.style.transformOrigin = "top center";
            root.style.transform = "translateX(-50%) scale(0.62)";
            root.style.alignItems = "center";
            if (this._header) { this._header.style.order = "2"; this._header.style.borderRadius = "0 0 12px 12px"; }   // v1007/8 — label below the diorama, rounded at the bottom
            if (this._footer) this._footer.style.display = "none";
        } else {   // full — restore docked (or floating) position
            if (mt) mt.style.display = "none";
            root.style.display = "flex";
            root.style.left = "auto"; root.style.top = "auto";
            root.style.transformOrigin = "100% 100%";   // v1006 — anchor the docked bottom-right corner
            root.style.transform = "scale(" + (this._userScale || 1) + ")";
            root.style.alignItems = "flex-end";
            root.style.right = this._dockRight || "12px";
            root.style.bottom = this._undocked ? (this._floatBottom || "72px") : "0px";
            if (this._header) { this._header.style.order = ""; this._header.style.borderRadius = ""; }   // v1007/8 — label back on top, default rounding
            if (this._footer) this._footer.style.display = "";
        }
        try { localStorage.setItem("voxelengine.pipState", state); } catch {}
    }

    _cyclePanelState() {
        const next = { full: "semi", semi: "min", min: "full" }[this._panelState || "full"];
        this._applyPanelState(next);
    }

    minimize() { this._applyPanelState("min"); }
    restore()  { this._applyPanelState("full"); }

    // v1013 — expand the diorama to a large centered overlay (and back). Resizes
    // the wrap + header/footer (the iframe fills wrap, so the canvas re-fits SHARP
    // rather than a blurry CSS scale). Restoring re-applies the saved panel state.
    _toggleExpand() {
        const root = this._container, wrap = this._listener && this._listener.wrap;
        if (!root || !wrap) return;
        const mt = this._miniTab;
        this._expanded = !this._expanded;
        if (this._expanded) {
            this._preExpand = { w: wrap.style.width, h: wrap.style.height, hw: this._header && this._header.style.width, pos: root.style.position };
            const W = "min(88vw, 760px)";
            root.style.display = "flex";
            root.style.position = "fixed";
            root.style.left = "50%"; root.style.top = "50%"; root.style.right = "auto"; root.style.bottom = "auto";
            root.style.transformOrigin = "center center";
            root.style.transform = "translate(-50%, -50%)";
            root.style.zIndex = "100000";
            wrap.style.width = W; wrap.style.height = "min(80vh, 600px)";
            if (this._header) this._header.style.width = W;
            if (this._footer) this._footer.style.width = W;
            if (this._resizeGrip) this._resizeGrip.style.display = "none";
            if (mt) mt.style.display = "none";
        } else {
            const p = this._preExpand || {};
            wrap.style.width = p.w || "240px"; wrap.style.height = p.h || "264px";
            if (this._header) this._header.style.width = p.hw || "240px";
            if (this._footer) this._footer.style.width = "240px";
            root.style.zIndex = "";
            root.style.position = p.pos || "";
            if (this._resizeGrip) this._resizeGrip.style.display = "";
            this._applyPanelState(this._panelState || "full");
        }
        if (this._expandBtn) this._expandBtn.textContent = this._expanded ? "\u2715" : "\u26F6";
        try { this._listener.iframe.contentWindow.dispatchEvent(new Event("resize")); } catch {}
    }

    toggleMinimize() {
        if (this._panelState === "min") this.restore();
        else this.minimize();
    }

    // v1002 (panel stage 2) — per-gauge VISIBILITY. localStorage
    // "voxelengine.pipGauges" is a 3-char 0/1 mask [hunger, happy, energy];
    // default "111" (all on). Settings -> Avatar toggles each bit. The same
    // mask will drive the 3D in-canvas gauges in stage 3.
    _gaugeMask() {
        try { const v = localStorage.getItem("voxelengine.pipGauges"); if (v && /^[01]{3}$/.test(v)) return v; } catch {}
        return "111";
    }

    applyGaugeVisibility() {
        // v1003 — gauges are 3D dials in the avatarstage diorama now; the Stage-2
        // DOM donut column is retired. Nudge the iframe to re-mount with the
        // toggled-on dials (it reads the same localStorage mask, same origin).
        try { if (this._listener?.statBox) this._listener.statBox.style.display = "none"; } catch {}
        try { this._listener?.iframe?.contentWindow?.postMessage({ type: "gaugeVis", mask: this._gaugeMask() }, "*"); } catch {}
    }

    speak(opts) {
        // Round 268 — speech queue. A snark line firing while palChat
        // is mid-sentence used to overlap visually (the iframe's mouth
        // animation interrupted, the zoom/gaze snapped to whatever
        // came last). Now we serialize: if a speak is already playing,
        // queue subsequent ones. Each queue item plays for its
        // estimated duration before the next dequeues. Stale items
        // expire after STALE_MS so a rapidly-firing source can't
        // build up a permanent backlog.
        if (!opts || !opts.Text) return;
        const item = { opts, enqueuedAt: this._now() };
        this._speakQueue ||= [];
        this._speakQueue.push(item);
        this._drainSpeakQueue();
    }

    _now() {
        return (typeof performance !== "undefined") ? performance.now() : Date.now();
    }

    // Round 275 — comic-style speech bubble overlay. Shows the spoken
    // text near the PIP listener so the user can READ what the robot
    // is saying — important when TTS is muted (visual-only mode), the
    // PowerShell bridge is unavailable, or when speech overlaps and
    // it's not clear which line is currently playing.
    //
    // Bubble layout: floating div anchored to top-right of the PIP
    // wrap, with a triangular tail pointing INTO the panel. Color
    // bands the speaker: M1 = soft cyan, M2 = soft amber, BOT/NPC
    // portraits get their color from the spec (passed via Portrait).
    _showSpeechBubble(Voice, Text, ms) {
        if (!Text) return;
        // Anchor target — outer wrapper of the PIP if we have it,
        // else just float top-right of viewport.
        const pipWrap = this._listener?.wrap || null;
        // Reuse a single bubble element so overlapping speech lines
        // don't pile up off-screen. If a bubble is currently showing,
        // we re-target it.
        if (!this._bubble) {
            const bubble = document.createElement("div");
            bubble.className = "demo-overlay";    // sweep on demo reset
            Object.assign(bubble.style, {
                position: "fixed",
                background: "rgba(28, 32, 48, 0.96)",
                color: "#cef",
                font: "13px system-ui, sans-serif",
                padding: "9px 13px",
                borderRadius: "14px",
                border: "1px solid #678",
                maxWidth: "260px",
                lineHeight: "1.35",
                zIndex: 9300,
                pointerEvents: "none",
                opacity: "0",
                transition: "opacity 180ms",
                boxShadow: "0 6px 18px rgba(0,0,0,0.45)",
            });
            // Tail — small CSS triangle pointing right (into the PIP)
            const tail = document.createElement("div");
            tail.style.cssText = `
                position: absolute; right: -8px; top: 14px;
                width: 0; height: 0;
                border-top: 8px solid transparent;
                border-bottom: 8px solid transparent;
                border-left: 8px solid rgba(28,32,48,0.96);
            `;
            bubble.appendChild(tail);
            const span = document.createElement("span");
            span.className = "bubble-text";
            bubble.appendChild(span);
            document.body.appendChild(bubble);
            this._bubble = bubble;
            this._bubbleTextEl = span;
        }
        // Voice-banded color
        const accent = (Voice === "M2") ? "#fc6" : "#9ef";
        this._bubble.style.color = accent;
        // Position to the LEFT of the PIP wrap so the tail points into it
        if (pipWrap) {
            const r = pipWrap.getBoundingClientRect();
            // Top: align with the upper portion of the PIP (where the
            // mouth roughly sits — robot face is the upper 60% of PIP)
            this._bubble.style.top  = `${r.top + 28}px`;
            this._bubble.style.right = `${window.innerWidth - r.left + 12}px`;
            this._bubble.style.left = "";
        } else {
            this._bubble.style.top   = "80px";
            this._bubble.style.right = "12px";
            this._bubble.style.left  = "";
        }
        this._bubbleTextEl.textContent = Text;
        // Fade in immediately; schedule fade-out at end of speech +
        // 500ms reading-tail so the user has time to finish reading.
        this._bubble.style.opacity = "1";
        if (this._bubbleHideTimer) clearTimeout(this._bubbleHideTimer);
        const totalShow = Math.max(2000, ms + 600);
        this._bubbleHideTimer = setTimeout(() => {
            if (this._bubble) this._bubble.style.opacity = "0";
        }, totalShow);
    }

    _drainSpeakQueue() {
        if (this._speakPlaying) return;
        const STALE_MS = 6000;
        while (this._speakQueue && this._speakQueue.length > 0) {
            const item = this._speakQueue.shift();
            if (this._now() - item.enqueuedAt > STALE_MS) continue;
            this._speakPlaying = true;
            const ms = this._fireSpeak(item.opts);
            // Schedule next drain after this one's estimated duration
            // + a small breath (250ms) so the rig has a moment to
            // settle between lines.
            setTimeout(() => {
                this._speakPlaying = false;
                this._drainSpeakQueue();
            }, ms + 250);
            return;
        }
    }

    // Round 270 — drop everything pending. Useful when a long palChat
    // dialog needs to be aborted (player engages combat, scene change,
    // etc) or for tests.
    clearSpeechQueue() {
        const dropped = this._speakQueue?.length ?? 0;
        if (this._speakQueue) this._speakQueue.length = 0;
        return dropped;
    }

    _fireSpeak({ Voice = "M1", Text = "", Portrait = null } = {}) {
        if (!Text) return 0;
        const ms = estimateSpeakMs(Text);
        const action = VOICE_EXPRESSION[Voice] || "speak";
        // Round 270 — stash portrait so the M2 branch below can hand
        // it to HeartbeatAvatar.showPortrait().
        this._currentPortrait = Portrait;

        // Round 274 — duck engine audio so speech is audible over the
        // background ambience. Refcount inside EngineAudio handles
        // overlapping speakers; unduck fires after ms + 400ms breath.
        try { window.audioManager?.duckForSpeech?.(0.30); } catch {}
        setTimeout(() => {
            try { window.audioManager?.unduckSpeech?.(); } catch {}
        }, ms + 400);

        // Round 274 — head-lock during speech. Tell the iframe to
        // suppress gaze-override + radius-override transitions until
        // ms+200 has elapsed. The robot's head stays where it is while
        // the mouth animates.
        const lockFrame = this._listener?.iframe;
        if (lockFrame?.contentWindow) {
            try {
                lockFrame.contentWindow.postMessage({
                    type: "kpop:headLock", durationMs: ms + 200,
                }, "*");
            } catch {}
        }

        // Round 275 — comic-style speech bubble. Renders the spoken
        // text near the PIP listener panel for the duration of the
        // utterance. Without the bubble, the user couldn't tell WHAT
        // the robot was saying when TTS was muted (or when audio
        // failed). Bubble auto-clears at end-of-speech.
        this._showSpeechBubble(Voice, Text, ms);

        // Round 266 — directional gaze. If OLLAMA's heartbeat avatar
        // has been undocked from the PIP, find its screen center, then
        // the PIP's own screen center, and compute the angle from PIP
        // → OLLAMA. Send to the RobotExpressive iframe as a gaze message so
        // the robot's camera yaw turns to "look at" the OLLAMA panel.
        // When OLLAMA is still docked inside the PIP, no message is
        // sent and the robot stays at its default forward yaw.
        let gazeYaw = null;
        try {
            if (this.heartbeatAvatar?.isUndocked?.() && this._listener?.wrap) {
                const ollamaCenter = this.heartbeatAvatar.getScreenCenter();
                const pipRect = this._listener.wrap.getBoundingClientRect();
                const pipCenter = {
                    x: pipRect.left + pipRect.width / 2,
                    y: pipRect.top  + pipRect.height / 2,
                };
                if (ollamaCenter) {
                    // Screen-x increases right, world-yaw increases CCW
                    // looking down +Y. We just need a horizontal swivel
                    // proportional to the screen-x offset between
                    // panels. Map dx ∈ [-window.innerWidth, +innerWidth]
                    // to yaw ∈ [-π/3, +π/3] (60° each side), enough to
                    // read as "looking that way" without spinning the
                    // robot's back to us.
                    const dx = ollamaCenter.x - pipCenter.x;
                    const norm = Math.max(-1, Math.min(1, dx / (window.innerWidth * 0.4)));
                    gazeYaw = norm * (Math.PI / 3);
                }
            }
        } catch (e) {
            // Geometry probe failed — just skip the gaze hint.
            gazeYaw = null;
        }

        if (Voice === "M1") {
            const frame = this._listener?.iframe;
            if (frame?.contentWindow) {
                try {
                    frame.contentWindow.postMessage({
                        type: "kpop:speak", voice: Voice, text: Text,
                        action, durationMs: ms,
                    }, "*");
                    // Round 267 — mix face-shot and body-shot zooms.
                    // ~70% of speak events go for the tighter face
                    // zoom (head fills the frame), the rest stay on
                    // the body zoom we had before. Action-emotion
                    // hints bias the pick: "alert"/"play"/"dance"
                    // stay body (need to see limbs); "happy"/"wave"/
                    // "sad"/"feed" prefer face.
                    const FACE_BIAS = {
                        alert: 0.1, play: 0.1, dance: 0.0,
                        happy: 0.85, wave: 0.85, sad: 0.85, feed: 0.85,
                    };
                    const faceProb = FACE_BIAS[action] ?? 0.65;
                    const mode = Math.random() < faceProb ? "face" : "body";
                    frame.contentWindow.postMessage({
                        type: "kpop:zoom",
                        mode, durationMs: ms,
                        scale: mode === "face" ? 0.42 : 0.72,
                    }, "*");
                    if (gazeYaw != null) {
                        frame.contentWindow.postMessage({
                            type: "kpop:gaze", yaw: gazeYaw, durationMs: ms + 400,
                        }, "*");
                    }
                } catch {}
            }
            this._pulseHeartbeat();
        }
        // Round 266 — M2 voice is the Ollama side of the dialog. Trigger
        // OLLAMA mouth lip-sync, pulse the heartbeat ECG, and ALSO send
        // a gaze hint to the RobotExpressive so the robot turns to "look at"
        // OLLAMA while it's listening to it speak. The robot's mouth
        // stays closed during the M2 turn — only OLLAMA articulates.
        else if (Voice === "M2") {
            if (this.heartbeatAvatar?.startMouthSync) {
                this.heartbeatAvatar.startMouthSync(ms, Text);
            }
            // Round 270 — per-NPC portrait. If the caller (BotManager,
            // typically) passed a Portrait field, swap the OLLAMA panel
            // caption to the NPC's name in their accent color for the
            // duration of the line. Identifies WHICH bot is speaking
            // when several are around.
            const portrait = this._currentPortrait;
            if (portrait && this.heartbeatAvatar?.showPortrait) {
                this.heartbeatAvatar.showPortrait({
                    name: portrait.name,
                    color: portrait.color,
                    durationMs: ms + 500,
                });
            }
            const frame = this._listener?.iframe;
            if (frame?.contentWindow && gazeYaw != null) {
                try {
                    frame.contentWindow.postMessage({
                        type: "kpop:gaze", yaw: gazeYaw, durationMs: ms + 400,
                    }, "*");
                } catch {}
            }
            this._pulseHeartbeat();
        }
        // F1 / F2 still pulse the heartbeat so cross-voice traffic is
        // reflected, but no panel of their own.
        else this._pulseHeartbeat();
        return ms;
    }

    setExpression({ Voice = "M1", expression = "neutral" } = {}) {
        if (Voice !== "M1") return;
        const frame = this._listener?.iframe;
        if (frame?.contentWindow) {
            try {
                frame.contentWindow.postMessage({
                    type: "kpop:expression", voice: Voice, action: expression,
                }, "*");
            } catch {}
        }
    }

    setListenerView(mode) {
        // v859 — backward-compatible. Existing callers pass "face" /
        // "robot" / "glb" mode keys. The new dynamic cycle has these
        // keys for the built-ins, so we route through _pcSetByKey
        // first (which updates the cycle index + iframe src + repaints).
        // Fall back to the legacy LISTENER_VIEW_URL path for unknowns
        // (e.g. an external module setting a mode we don't yet know).
        if (this._pcSetByKey && this._pcSetByKey(mode)) return;
        if (!LISTENER_VIEW_URL[mode]) return;
        this._listenerView = mode;
        if (this._listener?.iframe) {
            this._listener.iframe.src = LISTENER_VIEW_URL[mode];
        }
        if (this._listener?.viewBtns) {
            for (const [k, btn] of Object.entries(this._listener.viewBtns)) {
                btn.style.background = (k === mode)
                    ? "rgba(80,120,200,0.85)"
                    : "rgba(40,60,80,0.65)";
            }
        }
    }

    // ---- Heartbeat ECG canvas ---------------------------------------

    _startHeartbeat() {
        if (this._heartbeatTimer) return;
        this._lastAutoBeatMs = 0;
        const tick = () => {
            this._heartbeatPhase += 0.04;
            // Round 263c — auto-pulse driven by systemPerf.cpuLoad01.
            // Resting heartbeat ~60bpm; under heavy CPU load (long-tasks,
            // frame stretching) accelerates up to ~200bpm. The pulse
            // interval is recomputed every tick so a sudden spike kicks
            // in fast. Manual _pulseHeartbeat() (from speak events etc.)
            // still works on top of the auto rhythm.
            const sp = (typeof window !== "undefined") ? window.systemPerf?.snapshot?.() : null;
            // Combine CPU load + long-task stress; long-task is a strong
            // "the page is actually struggling" signal so weight it 1.5x.
            const load = sp ? Math.min(1, (sp.cpuLoad01 || 0) * 0.6 + (sp.taskStress01 || 0) * 0.9) : 0;
            const bpm  = 60 + load * 140;                  // 60 → 200
            const intervalMs = 60000 / bpm;
            const now = (typeof performance !== "undefined") ? performance.now() : Date.now();
            if (now - this._lastAutoBeatMs >= intervalMs) {
                this._heartbeatPulseMs = now;
                this._lastAutoBeatMs = now;
            }
            this._drawHeartbeat();
        };
        this._heartbeatTimer = setInterval(tick, 50);   // 20Hz
    }
    _stopHeartbeat() {
        if (this._heartbeatTimer) clearInterval(this._heartbeatTimer);
        this._heartbeatTimer = null;
    }
    _pulseHeartbeat() {
        this._heartbeatPulseMs = (typeof performance !== "undefined")
            ? performance.now() : Date.now();
    }
    _drawHeartbeat() {
        const cv = this._listener?.heartbeatCanvas;
        if (!cv) return;
        const ctx = cv.getContext("2d");
        if (!ctx) return;
        const w = cv.width, h = cv.height;
        ctx.clearRect(0, 0, w, h);
        const now = (typeof performance !== "undefined") ? performance.now() : Date.now();
        const sincePulse = now - this._heartbeatPulseMs;
        const pulseActive = sincePulse < 800;
        ctx.strokeStyle = pulseActive ? "#ffeb3b" : "#5eff8a";
        ctx.lineWidth = 1.3;
        ctx.beginPath();
        // Round 261 — classic ECG look: mostly flat baseline with
        // sharp QRS-style spike when active. Removed the always-wavy
        // sine wave (was reading as "rolling" rather than "pulse").
        const mid = h / 2;
        const spikeT = this._heartbeatPhase % 6.28;
        for (let x = 0; x < w; x++) {
            let y = mid;
            // Idle: faint baseline drift only (very subtle)
            const t = (x / w) * 2 + this._heartbeatPhase * 0.3;
            y += Math.sin(t) * 0.3;
            // QRS spike — sharp negative dip then positive peak then
            // back to baseline. Travels across the canvas during pulse.
            if (pulseActive) {
                const spikeX = (sincePulse / 800) * w;
                const dx = x - spikeX;
                // Negative wave (P-Q)
                if (dx > -8 && dx < -3) y += 1.5;
                // Q dip
                else if (dx >= -3 && dx < 0) y += -2;
                // R peak (the big spike)
                else if (dx >= 0 && dx < 2) y += -h * 0.40;
                // S dip
                else if (dx >= 2 && dx < 5) y += h * 0.18;
                // T wave
                else if (dx >= 5 && dx < 11) y += -2.5;
            }
            if (x === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.stroke();
    }

    // ---- Stats polling -----------------------------------------------

    _startStatsPoll() {
        if (this._statsTimer) return;
        this._statsTimer = setInterval(() => this._renderStats(), 800);
    }
    _stopStatsPoll() {
        if (this._statsTimer) clearInterval(this._statsTimer);
        this._statsTimer = null;
    }
    _renderStats() {
        const stats = this.tamagotchi?.stats;
        if (!stats || !this._listener?.bars) return;
        const set = (bar, value) => {
            if (!bar?.fill) return;
            bar.fill.style.width = Math.max(0, Math.min(100, value)) + "%";
        };
        // Round 265 — HAPPY now blends the tamagotchi sim's value with
        // engine health. errorsPerSec from SystemPerfMonitor maps to a
        // "sad" multiplier: 0 errors/sec → ×1 (no penalty), 2+ → ×0
        // (totally unhappy). Visual cue: when the system is throwing
        // errors, the robot's HAPPY ring tanks; we also fire an
        // attention-getting wave expression for ~1s if errorsPerSec
        // crosses a threshold, since users might be looking elsewhere.
        const sp = (typeof window !== "undefined") ? window.systemPerf?.snapshot?.() : null;
        const errorsPerSec = sp?.errorsPerSec ?? 0;
        const errorPenalty = Math.max(0, Math.min(1, 1 - errorsPerSec / 2));   // 0..1
        const blendedHappy = stats.happiness * errorPenalty;
        set(this._listener.bars.hunger,    stats.hunger);
        set(this._listener.bars.happiness, blendedHappy);
        set(this._listener.bars.energy,    stats.energy);
        // v970 — also feed the stage iframe (avatarstage.html) so its 3D dials
        // track the same vitals as the DOM bars.
        try { this._listener?.iframe?.contentWindow?.postMessage({ type: "tama", hunger: stats.hunger, happiness: blendedHappy, energy: stats.energy }, "*"); } catch {}

        // Attention spike — debounced so we don't spam the iframe with
        // wave events every poll tick. Only fires on rising-edge cross.
        const wasOK = this._lastErrorOK ?? true;
        const isOK  = errorsPerSec < 1.0;
        if (wasOK && !isOK) {
            // Errors just started piling up — wave + zoom in briefly
            const frame = this._listener?.iframe;
            if (frame?.contentWindow) {
                try {
                    frame.contentWindow.postMessage({
                        type: "kpop:speak", voice: "M1",
                        action: "alert", durationMs: 1400,
                    }, "*");
                    frame.contentWindow.postMessage({
                        type: "kpop:zoom", durationMs: 1400, scale: 0.78,
                    }, "*");
                } catch {}
            }
        }
        this._lastErrorOK = isOK;
    }

    // ---- DOM build ----------------------------------------------------

    _build() {
        if (typeof document === "undefined") return;
        const root = document.createElement("div");
        root.id = "pip-avatar-root";
        Object.assign(root.style, {
            position: "fixed",
            right: "12px", bottom: "0px",   // v1001 — docked to the bottom edge
            display: "flex", flexDirection: "column", alignItems: "flex-end",
            gap: "6px",
            zIndex: "9300",
            pointerEvents: "none",
            fontFamily: "monospace",
        });
        const header = this._buildHeader(root);
        this._header = header;   // v1007 — semi mode moves it to the bottom
        root.appendChild(header);
        const slotRow = document.createElement("div");
        Object.assign(slotRow.style, { display: "flex", gap: "8px", pointerEvents: "none" });
        this._slotRow = slotRow;
        this._listener = this._buildListenerSlot();
        slotRow.appendChild(this._listener.wrap);
        root.appendChild(slotRow);
        // v989 — LCARS footer bar closes the panel (header top + footer bottom =
        // the classic LCARS sandwich around the avatar).
        const footer = document.createElement("div");
        footer.className = "lcars-panel-footer";
        footer.style.width = "240px";
        this._footer = footer;   // v1007 — hidden in semi mode
        root.appendChild(footer);
        // Round 263c — drag from the inner KPop LISTENER title bar too
        // (set up after _buildListenerSlot stashed the source). Same
        // handler shape as the outer header so position persists to
        // localStorage on mouseup.
        if (this._innerDragSrc) {
            this._installDragHandlers(this._innerDragSrc, root, null);
        }
        try {
            const saved = localStorage.getItem("voxelengine.pipPos");
            if (saved) {
                const pos = JSON.parse(saved);
                if (pos.right) { root.style.right = pos.right; this._dockRight = pos.right; }
                if (pos.undocked) { this._undocked = true; this._floatBottom = pos.bottom || "72px"; root.style.bottom = this._floatBottom; }
                else { this._undocked = false; root.style.bottom = "0px"; }
            }
        } catch {}
        document.body.appendChild(root);
        this._container = root;
        // v989 — LCARS minitab, docked along the top edge just LEFT of the pink
        // AI Brain tab (which sits at left:792). Hidden until minimized; click to
        // restore. This replaces the old in-panel min bar entirely.
        const miniTab = document.createElement("div");
        miniTab.className = "lcars-minitab edge-top color-gold";
        miniTab.style.left = "672px";
        miniTab.style.top = "0";
        miniTab.style.bottom = "auto";
        miniTab.style.display = "none";
        miniTab.textContent = "\u25BE KPop Listener";
        miniTab.title = "Restore the avatar panel";
        miniTab.addEventListener("click", () => this.restore());
        document.body.appendChild(miniTab);
        this._miniTab = miniTab;

        // v1006 (stage 3c) — resize grip at the top-left (opposite the bottom-right
        // dock anchor). Drag it up/left to scale the whole panel up; the avatar +
        // 3D dials scale with it since the iframe canvas resizes + camera re-fits.
        try { const us = parseFloat(localStorage.getItem("voxelengine.pipScale")); if (us >= 0.6 && us <= 1.6) this._userScale = us; } catch {}
        const grip = document.createElement("div");
        grip.textContent = "\u2921";   // ⤡
        grip.title = "Drag to resize the panel";
        Object.assign(grip.style, {
            position: "absolute", left: "0", top: "0",
            width: "16px", height: "16px", lineHeight: "13px", textAlign: "center",
            fontSize: "11px", color: "#9cf", cursor: "nwse-resize",
            background: "rgba(10,16,30,0.85)", border: "1px solid #3a5a7a",
            borderRadius: "4px", pointerEvents: "auto", zIndex: "10", userSelect: "none",
        });
        let _rs = null;
        grip.addEventListener("mousedown", (e) => {
            e.stopPropagation();
            _rs = { x: e.clientX, y: e.clientY, s: this._userScale || 1 };
            const mv = (ev) => {
                if (!_rs) return;
                const d = (_rs.x - ev.clientX) + (_rs.y - ev.clientY);   // up-left = bigger
                this._userScale = Math.max(0.6, Math.min(1.6, _rs.s + d / 320));
                if (this._panelState === "full") this._applyPanelState("full");
            };
            const up = () => {
                _rs = null;
                try { localStorage.setItem("voxelengine.pipScale", String(this._userScale)); } catch {}
                document.removeEventListener("mousemove", mv);
                document.removeEventListener("mouseup", up);
            };
            document.addEventListener("mousemove", mv);
            document.addEventListener("mouseup", up);
        });
        root.appendChild(grip);
        this._resizeGrip = grip;
        try { const st = localStorage.getItem("voxelengine.pipState"); if (st === "min" || st === "semi") this._applyPanelState(st); } catch {}
        this._renderStats();
    }

    _buildHeader(root) {
        // v989 — LCARS header: the iconic colored block, doubling as the drag
        // handle. Minimizing now hides the whole panel and drops an LCARS
        // minitab beside the AI Brain (see _build); the old PIP min-bar / shrink-
        // to-fidget dock is gone.
        const header = document.createElement("div");
        header.className = "lcars-panel-header";
        Object.assign(header.style, {
            width: "240px", boxSizing: "border-box",
            cursor: "move", pointerEvents: "auto", letterSpacing: "0.12em",
        });
        const title = document.createElement("div");
        title.textContent = "KPop Listener";
        title.style.textTransform = "none";   // v999 — keep the deliberate "KPop" mixed case
        header.appendChild(title);
        const minBtn = document.createElement("div");
        minBtn.className = "lcars-panel-header-id";
        minBtn.textContent = "\u2212";
        minBtn.style.cursor = "pointer";
        minBtn.title = "Minimize to a tab beside the AI Brain";
        minBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            this._cyclePanelState();   // v1005 — full → semi → min
        });
        header.appendChild(minBtn);
        this._tabBtn = minBtn;
        this._installDragHandlers(header, root, minBtn);
        return header;
    }

    _installDragHandlers(header, root, minBtn) {
        let dragStart = null;
        const onMove = (e) => {
            if (!dragStart) return;
            const dx = e.clientX - dragStart.x;
            const dy = e.clientY - dragStart.y;
            // v1008 — dragging the top-docked SEMI view pulls it off into a
            // floating full panel (this is how you "undock from the top").
            if (this._panelState === "semi") {
                if (Math.abs(dx) + Math.abs(dy) < 8) return;
                this._undocked = true; this._dockRight = "60px"; this._floatBottom = "120px";
                this._applyPanelState("full");
                dragStart = { x: e.clientX, y: e.clientY, right: 60, bottom: 120 };
                return;
            }
            // v1005 — slide horizontally along the bottom; lift it off the bottom
            // edge (drag UP past ~48px) to UNDOCK and free-float; drag back down
            // to the edge to RE-DOCK.
            const newRight = Math.max(0, dragStart.right - dx);
            const newBottom = Math.max(0, dragStart.bottom - dy);   // up = larger bottom = higher
            const DOCK = 48;
            this._undocked = (newBottom > DOCK);
            root.style.right = newRight + "px";
            root.style.bottom = (this._undocked ? newBottom : 0) + "px";
            this._dockRight = root.style.right;
            if (this._undocked) this._floatBottom = newBottom + "px";
        };
        const onUp = () => {
            if (!dragStart) return;
            try {
                localStorage.setItem("voxelengine.pipPos",
                    JSON.stringify({ right: root.style.right, bottom: root.style.bottom, undocked: !!this._undocked }));
            } catch {}
            this._dockRight = root.style.right;
            dragStart = null;
            document.removeEventListener("mousemove", onMove);
            document.removeEventListener("mouseup", onUp);
        };
        header.addEventListener("mousedown", (e) => {
            if (minBtn && e.target === minBtn) return;
            // Round 263c — also skip drag if user clicked the
            // face-switcher icon (it has its own click handler that
            // stops propagation, but defense in depth)
            if (e.target?.closest?.("svg")) return;
            dragStart = {
                x: e.clientX, y: e.clientY,
                right:  parseInt(root.style.right  || "12", 10),
                bottom: parseInt(root.style.bottom || "12", 10),
            };
            document.addEventListener("mousemove", onMove);
            document.addEventListener("mouseup", onUp);
        });
    }

    _buildListenerSlot() {
        // Round 263c — bigger slot (vertical) to give the robot more
        // headroom; drag the inner title too; circle gauges replace bars;
        // hover the HUNGER/HAPPY/ENERGY label to swap it for the
        // FEED/PLAY/SLEEP button.
        const wrap = document.createElement("div");
        Object.assign(wrap.style, {
            width: "240px", height: "264px",
            background: "rgba(8,12,20,0.92)",
            border: "1px solid #468", borderRadius: "0",  // v989 LCARS: square between header/footer
            overflow: "hidden", position: "relative",
            display: "flex", flexDirection: "column",      // v999 — let the avatar frame flex to fill
            pointerEvents: "auto",
            boxShadow: "0 0 16px rgba(80,160,200,0.20)",
            color: "#cef", fontFamily: "monospace",
        });

        // Title bar — face-switcher icon on the right, also serves as a
        // drag handle (round 263c) so users can grab the visible title
        // text rather than the outer "≡ PIP" header.
        const titleBar = document.createElement("div");
        Object.assign(titleBar.style, {
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "3px 8px",
            fontSize: "10px", letterSpacing: "1.2px",
            color: "#9cf",
            background: "rgba(0,0,0,0.4)",
            borderBottom: "1px solid #234",
            cursor: "move",   // drag affordance
        });
        const titleLabel = document.createElement("span");
        titleLabel.textContent = "KPop Listener";
        titleLabel.style.textTransform = "none";   // v999 — mixed case, matches the header

        // v859 — Avatar cycle parity with phone. The PC PipAvatar's
        // listener cycle now matches phones avatarSwitch behavior:
        // built-ins + Your_Avatars folder scan + window.kpopFavorites.
        // The faceSwitcher button (already in titleBar) advances
        // through this dynamic list instead of the old 3-mode cycle.
        // Cycle live-rebuilds on favorites changes (subscribe below).
        //
        // CYCLE entry shape: { key, url, label, icon }
        //   - "face" entry maps to face.html (procedural)
        //   - "robot"/"glb" entries map to RobotExpressive.html with ?asset=
        //   - customs map to RobotExpressive.html with ?glb=<path>
        //   - favorites map to either ?asset= or ?glb= depending on URL form
        //
        // Persist current pick in localStorage under
        // voxelengine.pcAvatarCycle (separate key from phone).
        const PC_AVATAR_KEY = "voxelengine.pcAvatarCycle";
        const FALLBACK_CYCLE = [
            { key: "stage",       url: LISTENER_VIEW_URL.stage, label: "Avatar (big focus)", icon: "🎭" },
            { key: "fidget",      url: "/avatarstage.html?voice=M1&fidget=1", label: "Fidget Stage (avatar + dials)", icon: "🎛" },
            { key: "duo",         url: LISTENER_VIEW_URL.duo,   label: "Duo Stage (two avatars)", icon: "👯" },
            // v978 — robot man/woman now render INTO the diorama stage (same
            // dials, correct framing, no old-renderer accessories) instead of
            // navigating to RobotExpressive.html. The `glb` field lets the switcher
            // swap them in-place without an iframe reload.
            // v982 — five delivered defaults: RobotExpressive (rich, three.js,
            // CC0) + the procedurally-derived boxy family (man/woman, ± hands+feet).
            { key: "robot",        url: "/avatarstage.html?voice=M1&glb=RobotExpressive", glb: "RobotExpressive", label: "Robot Man (rich)", icon: "🤖" },
            { key: "robot_man",    url: "/avatarstage.html?voice=M1&glb=RobotMan",        glb: "RobotMan",        label: "Stick Man (classic)", icon: "🧍" },
            { key: "robot_man_hf", url: "/avatarstage.html?voice=M1&glb=RobotManHF",      glb: "RobotManHF",      label: "Stick Man (hands+feet)", icon: "🙋" },
            { key: "robot_woman",  url: "/avatarstage.html?voice=M1&glb=RobotWoman",      glb: "RobotWoman",      label: "Stick Woman (classic)", icon: "👗" },
            { key: "robot_woman_hf", url: "/avatarstage.html?voice=M1&glb=RobotWomanHF",  glb: "RobotWomanHF",    label: "Stick Woman (skirt+hands+feet)", icon: "👩‍🚀" },
            { key: "surf",        url: "/avatarstage.html?voice=M1&surf=1", label: "Surf (board on the sea)", icon: "🏄" },
        ];
        const FACE_CYCLE = [
            { key: "face",        url: LISTENER_VIEW_URL.face,  label: "Expressive Face (2D)", icon: "😀" },
        ];

        // Build a full cycle from the static parts + dynamic favorites
        // + Your_Avatars folder. Customs are fetched asynchronously;
        // first apply uses just the static parts to avoid a blank state.
        let _pcCycle = FALLBACK_CYCLE.concat(FACE_CYCLE);
        let _pcCycleIdx = 0;
        let _pcCustomsCache = [];
        // v980 — assets that actually exist right now (top-level + Your_Avatars,
        // incl. the external dir via the bridge's union). Favorites for assets
        // NOT in this set are skipped so a fresh/clean directory doesn't try to
        // rotate to avatars that aren't there.
        let _pcKnownAssets = new Set();
        const _pcAssetKnown = (u) => {
            if (!_pcKnownAssets.size) return true;   // not loaded yet → don't over-filter
            const s = String(u || "");
            const base = s.split(/[\\/]/).pop().replace(/\.(glb|gltf)$/i, "").toLowerCase();
            return _pcKnownAssets.has(base) || _pcKnownAssets.has(s.toLowerCase());
        };

        const _pcRebuildCycle = (customs) => {
            const favEntries = [];
            try {
                const fav = (typeof window !== "undefined") ? window.kpopFavorites : null;
                if (fav && fav.list) {
                    const used = new Set();
                    for (const c of customs) used.add(c.url);
                    for (const built of FALLBACK_CYCLE) {
                        used.add(built.url);
                        const m = built.url.match(/[?&]asset=([^&]+)/);
                        if (m) used.add(decodeURIComponent(m[1]));
                    }
                    for (const f of fav.list()) {
                        if (used.has(f.url)) continue;
                        if (!_pcAssetKnown(f.url)) continue;   // v980 — skip favorites whose asset is missing
                        const isPath = /[\\/]/.test(f.url);
                        const url = "/avatarstage.html?voice=M1&glb=" + encodeURIComponent(f.url);
                        favEntries.push({
                            key: "fav_" + (f.label || f.url).toLowerCase().replace(/[^a-z0-9]/g, "_"),
                            url, glb: f.url,
                            label: (f.label || f.url) + " (★ favorite)",
                            icon: "★",
                        });
                    }
                }
            } catch {}
            _pcCycle = FALLBACK_CYCLE.concat(customs).concat(favEntries).concat(FACE_CYCLE);
        };

        const _pcApplyCycleEntry = (allowInPlace = true) => {
            const entry = _pcCycle[_pcCycleIdx];
            if (!entry) return;
            const ifr = this._listener?.iframe;
            if (ifr) {
                // v978 — if the stage page is already loaded and this entry is a
                // glb avatar, swap it INTO the same diorama (postMessage) instead
                // of reloading the iframe — old avatar leaves, new one enters,
                // dials/pet/ticker all persist. Otherwise navigate the iframe.
                const onStage = /avatarstage\.html/.test(ifr.getAttribute("src") || "");
                if (allowInPlace && entry.glb && onStage && ifr.contentWindow) {
                    try { ifr.contentWindow.postMessage({ type: "setAvatar", glb: entry.glb }, "*"); }
                    catch { ifr.src = entry.url; }
                } else {
                    ifr.src = entry.url;
                }
            }
            this._listenerView = entry.key;
            try { localStorage.setItem(PC_AVATAR_KEY, entry.key); } catch {}
            // v980 — every avatarstage view (focus / fidget / surf / duo / glb)
            // is a self-contained 3D panel, so the PIP's DOM donut gauges + the
            // heartbeat ECG line are redundant clutter → hide them. Only the 2D
            // face keeps them.
            const stageFamily = /avatarstage\.html/.test(entry.url || "") || !!entry.glb;
            try { if (this._listener?.statBox) this._listener.statBox.style.display = "none"; } catch {}   // v1004 — DOM donuts retired; 3D dials in the diorama
            try { if (this._listener?.heartbeatCanvas) this._listener.heartbeatCanvas.style.display = stageFamily ? "none" : ""; } catch {}
            // Repaint the switcher icon to reflect current entry
            if (faceSwitcher) faceSwitcher.textContent = entry.icon || "🤖";
        };

        // Fetch Your_Avatars + top-level and complete the cycle build
        const _pcFetchCustoms = () => {
            return Promise.all([
                fetch("/GPU_Assets/list/Your_Avatars", { cache: "no-store" }).then(r => r.json()).catch(() => ({ ok: false })),
                fetch("/GPU_Assets/list", { cache: "no-store" }).then(r => r.json()).catch(() => ({ ok: false })),
            ]).then(([yj, tj]) => {
                    // v980 — record which assets exist (basename, lowercased)
                    const known = new Set();
                    const addFiles = (j) => { if (j && j.ok && Array.isArray(j.files)) for (const fn of j.files) known.add(fn.replace(/\.(glb|gltf)$/i, "").toLowerCase()); };
                    addFiles(yj); addFiles(tj);
                    _pcKnownAssets = known;
                    const j = yj;
                    const customs = [];
                    if (j && j.ok && Array.isArray(j.files)) {
                        for (const fn of j.files) {
                            const base = fn.replace(/\.(glb|gltf)$/i, "");
                            customs.push({
                                key: "custom_" + base.toLowerCase().replace(/[^a-z0-9]/g, "_"),
                                url: "/avatarstage.html?voice=M1&glb=" +
                                     encodeURIComponent("/GPU_Assets/Your_Avatars/" + fn),
                                glb: "/GPU_Assets/Your_Avatars/" + fn,
                                label: base + " (your avatar)",
                                icon: "🎭",
                            });
                        }
                    }
                    _pcCustomsCache = customs;
                    _pcRebuildCycle(customs);
                    // Restore previous selection if possible
                    let saved = "";
                    try { saved = localStorage.getItem(PC_AVATAR_KEY) || ""; } catch {}
                    const i = saved ? _pcCycle.findIndex(c => c.key === saved) : -1;
                    if (i >= 0) {
                        _pcCycleIdx = i;
                        _pcApplyCycleEntry(false);
                    }
                });
        };
        // Kick the customs fetch in the background; the initial cycle
        // (built-ins + face) is already usable.
        Promise.resolve().then(_pcFetchCustoms);

        // Subscribe to favorites changes so add/remove rebuilds + may
        // update the current entry. Falls back to polling for the
        // singleton (which loads as a module asynchronously).
        let _pcFavUnsub = null;
        const _pcWatchFavs = () => {
            let tries = 0;
            const iv = setInterval(() => {
                tries++;
                const fav = (typeof window !== "undefined") ? window.kpopFavorites : null;
                if (fav && fav.onChange) {
                    clearInterval(iv);
                    _pcFavUnsub = fav.onChange(() => {
                        const curKey = _pcCycle[_pcCycleIdx]?.key;
                        _pcRebuildCycle(_pcCustomsCache);
                        const i = _pcCycle.findIndex(c => c.key === curKey);
                        _pcCycleIdx = (i >= 0) ? i : 0;
                        _pcApplyCycleEntry();
                    });
                } else if (tries > 25) {
                    clearInterval(iv);
                }
            }, 200);
        };
        _pcWatchFavs();

        // ── faceSwitcher ── advance the dynamic cycle on click
        const faceSwitcher = document.createElement("div");
        const VIEW_ICONS = { stage: "🎭", duo: "👯", face: "😀", robot: "🤖", glb: "🦾", robot_woman: "👩‍🚀" };
        faceSwitcher.textContent = VIEW_ICONS[this._listenerView] ?? _pcCycle[0]?.icon ?? "🤖";
        Object.assign(faceSwitcher.style, {
            fontSize: "14px", cursor: "pointer",
            opacity: "0.7", transition: "opacity 120ms",
            userSelect: "none",
            padding: "0 2px",
        });
        faceSwitcher.title = "Cycle KPop avatar (built-ins + your_avatars + ★ favorites)";
        faceSwitcher.addEventListener("mouseenter", () => faceSwitcher.style.opacity = "1");
        faceSwitcher.addEventListener("mouseleave", () => faceSwitcher.style.opacity = "0.7");
        faceSwitcher.addEventListener("click", (e) => {
            e.stopPropagation();   // don't initiate drag
            if (!_pcCycle.length) return;
            _pcCycleIdx = (_pcCycleIdx + 1) % _pcCycle.length;
            _pcApplyCycleEntry();
            faceSwitcher.title = "Avatar: " + (_pcCycle[_pcCycleIdx].label || "?") + " (click to cycle)";
        });

        // Save references on `this` so setListenerView (called externally)
        // can update _pcCycleIdx + repaint when a mode key is requested
        this._pcCycle = () => _pcCycle;
        this._pcSetByKey = (key) => {
            const i = _pcCycle.findIndex(c => c.key === key);
            if (i >= 0) {
                _pcCycleIdx = i;
                _pcApplyCycleEntry();
                return true;
            }
            return false;
        };

        // Round 274 — TTS mute toggle. 🔊/🔇 cycles.
        // v336 — UNIVERSAL MUTE. The button now toggles ALL audio
        // sources: AudioManager (sfx + ambient + speech), kpop TTS,
        // procedural music, room ambience, master gain. The icon's
        // state reflects window._muteState.muted (set by muteAllAudio)
        // rather than just kpop._ttsMuted alone. The visual mouth
        // animation still fires regardless — you'll see WHEN the
        // robot would have spoken even with audio off.
        const ttsMuteBtn = document.createElement("div");
        const restoreMuted = (() => {
            try { return localStorage.getItem("voxelengine.muteAll") === "1"
                       || localStorage.getItem("voxelengine.ttsMuted") === "1"; }
            catch { return false; }
        })();
        ttsMuteBtn.textContent = restoreMuted ? "🔇" : "🔊";
        Object.assign(ttsMuteBtn.style, {
            fontSize: "14px", cursor: "pointer",
            opacity: "0.7", transition: "opacity 120ms",
            userSelect: "none", padding: "0 2px",
        });
        ttsMuteBtn.title = "Mute ALL audio (sfx + speech + ambient + music)";
        ttsMuteBtn.addEventListener("mouseenter", () => ttsMuteBtn.style.opacity = "1");
        ttsMuteBtn.addEventListener("mouseleave", () => ttsMuteBtn.style.opacity = "0.7");
        ttsMuteBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            // v336 — toggle universal mute (falls back to kpop-only if
            // the helper isn't on window yet, but it should always be
            // by the time the user can click).
            let muted;
            if (typeof window.toggleMuteAll === "function") {
                muted = window.toggleMuteAll();
            } else if (this.kpop) {
                this.kpop._ttsMuted = !this.kpop._ttsMuted;
                muted = this.kpop._ttsMuted;
                try { localStorage.setItem("voxelengine.ttsMuted",
                    muted ? "1" : "0"); } catch {}
            }
            ttsMuteBtn.textContent = muted ? "🔇" : "🔊";
        });

        // Round 274 — toast on/off toggle. 🍞/🚫 cycles. When off, the
        // bridge's /kpop/toast endpoint is skipped — no Windows
        // notifications fire. Useful when you're debugging and don't
        // want a parade of OS toasts.
        const toastBtn = document.createElement("div");
        const restoreToasts = (() => {
            try { return localStorage.getItem("voxelengine.toastsOff") === "1"; }
            catch { return false; }
        })();
        if (this.kpop && restoreToasts) this.kpop._toastsOff = true;
        toastBtn.textContent = restoreToasts ? "🚫" : "🍞";
        Object.assign(toastBtn.style, {
            fontSize: "14px", cursor: "pointer",
            opacity: "0.7", transition: "opacity 120ms",
            userSelect: "none", padding: "0 2px",
        });
        toastBtn.title = "Toggle Windows toasts on/off";
        toastBtn.addEventListener("mouseenter", () => toastBtn.style.opacity = "1");
        toastBtn.addEventListener("mouseleave", () => toastBtn.style.opacity = "0.7");
        toastBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            if (!this.kpop) return;
            this.kpop._toastsOff = !this.kpop._toastsOff;
            toastBtn.textContent = this.kpop._toastsOff ? "🚫" : "🍞";
            try { localStorage.setItem("voxelengine.toastsOff",
                this.kpop._toastsOff ? "1" : "0"); } catch {}
        });

        titleBar.append(titleLabel);
        titleBar.style.display = "none";   // v1007 — drop the redundant 2nd "KPop Listener" line (outer LCARS header is the label)
        wrap.appendChild(titleBar);
        // Defer drag-handler install — we need the outer root reference
        // which is set up in _build() after _buildListenerSlot returns.
        this._innerDragSrc = titleBar;

        // v999 — tools move OUT of the sub-header into a LEFT vertical dock
        // over the avatar area (mute / toast / avatar-cycle). Vertically
        // centered so they clear the iframe's own top-left camera button.
        const toolDock = document.createElement("div");
        Object.assign(toolDock.style, {
            position: "absolute", left: "4px", top: "50%",
            transform: "translateY(-50%)", zIndex: "6",
            display: "flex", flexDirection: "column", gap: "6px",
            pointerEvents: "auto",
        });
        // v1005 — unify the avatar selfie camera into the panel's left dock
        // (was only inside the iframe). Posts to avatarstage.html, which fires
        // its stageHandle.selfie(); the in-iframe button is hidden via camdock=1.
        const camBtn = document.createElement("div");
        camBtn.textContent = "\uD83D\uDCF7";
        camBtn.title = "Selfie — capture the avatar";
        camBtn.style.cursor = "pointer";
        camBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            try { this._listener?.iframe?.contentWindow?.postMessage({ type: "selfie" }, "*"); } catch {}
        });
        // v1007 — CC (closed captions) toggle: when on, the avatar's spoken text
        // shows over the top of the canvas (in the name-overlay space).
        const ccBtn = document.createElement("div");
        ccBtn.textContent = "CC";
        ccBtn.title = "Closed captions for the avatar's speech";
        ccBtn.style.cursor = "pointer";
        ccBtn.style.fontSize = "11px";
        ccBtn.style.fontWeight = "700";
        this._ccOn = false;
        ccBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            this._ccOn = !this._ccOn;
            ccBtn.style.color = this._ccOn ? "#9cf" : "";
            ccBtn.style.borderColor = this._ccOn ? "#9cf" : "";
            try { this._listener?.iframe?.contentWindow?.postMessage({ type: "cc", on: this._ccOn }, "*"); } catch {}
        });
        // v1013 — expand: pop the diorama to a large centered overlay so the room
        // + fidget-scene rotations read big; click again to restore.
        const galleryBtn = document.createElement("div");
        galleryBtn.textContent = "\uD83D\uDDBC\uFE0F";   // 🖼
        galleryBtn.title = "Selfie gallery";
        galleryBtn.style.cursor = "pointer";
        galleryBtn.addEventListener("click", (e) => { e.stopPropagation(); try { (window.selfieGallery && window.selfieGallery.open()); } catch {} });
        this._galleryBtn = galleryBtn;
        const expandBtn = document.createElement("div");
        expandBtn.textContent = "\u26F6";   // ⛶
        expandBtn.title = "Expand the diorama (large view); click again to restore";
        expandBtn.style.cursor = "pointer";
        expandBtn.addEventListener("click", (e) => { e.stopPropagation(); this._toggleExpand(); });
        this._expandBtn = expandBtn;
        for (const btn of [camBtn, ccBtn, ttsMuteBtn, toastBtn, galleryBtn, expandBtn, faceSwitcher]) {
            Object.assign(btn.style, {
                width: "26px", height: "26px", boxSizing: "border-box",
                display: "flex", alignItems: "center", justifyContent: "center",
                background: "rgba(10,16,30,0.80)", border: "1px solid #3a5a7a",
                borderRadius: "6px", padding: "0", margin: "0",
            });
            toolDock.appendChild(btn);
        }
        this._toolDock = toolDock;

        // Robot iframe — 130px tall (was 112) per "robot top/bottom
        // centering not letting the robot be seen". Aspect ~1.54 at
        // 200x130 with the existing FOV gives visible Y range ~3.2u,
        // robot 0..2u fits with ~0.6u headroom each side.
        const frameWrap = document.createElement("div");
        Object.assign(frameWrap.style, {
            width: "100%", flex: "1 1 auto", minHeight: "150px",   // v999 — fill the panel (was fixed 130px → squished avatar)
            position: "relative",
            background: "radial-gradient(circle at center, #1a1230 0%, #06040d 80%)",
        });
        const iframe = document.createElement("iframe");
        iframe.src = LISTENER_VIEW_URL[this._listenerView] ?? LISTENER_VIEW_URL[DEFAULT_LISTENER_VIEW];
        iframe.setAttribute("allowtransparency", "true");
        Object.assign(iframe.style, {
            width: "100%", height: "100%",
            border: "0", background: "transparent",
        });
        // v853 — capture iframe-level failures (CSP block, network 404,
        // CORS denial) so the llama can show dead-eye + log the cause.
        // The Shield-side glb load bug surfaces here when the iframe
        // can't load RobotExpressive.html at all (rare); the more common case
        // (iframe loads but glb inside fails) gets caught by the inner
        // postMessage listener below.
        iframe.addEventListener("error", (ev) => {
            try {
                window.dispatchEvent(new CustomEvent("engine:iframe-error", {
                    detail: {
                        message: "iframe failed to load: " + (iframe.src || "?"),
                        kind: "iframe-load",
                        src: iframe.src,
                    },
                }));
            } catch {}
        });
        frameWrap.appendChild(iframe);

        // v853 — listen for RobotExpressive.html postMessages that signal a
        // glb load failure or runtime error inside the iframe. The iframe
        // installs a console error wrap that postMessages out; we just
        // forward to the engine:iframe-error window event so HeartbeatAvatar
        // logs + flips to dead-eye.
        window.addEventListener("message", (ev) => {
            const m = ev?.data;
            if (!m || typeof m !== "object") return;
            if (m.type === "kpavatar:error" || m.type === "kpavatar:glb-error") {
                try {
                    window.dispatchEvent(new CustomEvent("engine:iframe-error", {
                        detail: {
                            message: m.message || "kpavatar reported an error",
                            kind: m.type,
                            stack: m.stack || null,
                            url: m.url || null,
                        },
                    }));
                } catch {}
            }
        });

        // OLLAMA heartbeat avatar dock
        const ollamaDock = document.createElement("div");
        ollamaDock.id = "pip-ollama-dock";
        Object.assign(ollamaDock.style, {
            position: "absolute", top: "4px", right: "4px",
            zIndex: "5",
            pointerEvents: "auto",
        });
        frameWrap.appendChild(ollamaDock);
        if (this._toolDock) frameWrap.appendChild(this._toolDock);
        // v1001 (panel stage 2) — body row: avatar fills the center, the 1-3 stat
        // gauges dock to the RIGHT column (statBox is appended into `body` below).
        const body = document.createElement("div");
        Object.assign(body.style, { display: "flex", flexDirection: "row", flex: "1 1 auto", minHeight: "0" });
        body.appendChild(frameWrap);
        wrap.appendChild(body);
        this._gaugeBody = body;

        // Heartbeat ECG canvas
        const heartbeatCanvas = document.createElement("canvas");
        heartbeatCanvas.width = 190; heartbeatCanvas.height = 22;
        Object.assign(heartbeatCanvas.style, {
            display: "block", margin: "3px auto", width: "190px", height: "22px",
            background: "rgba(0,0,0,0.4)",
            borderTop: "1px solid #234", borderBottom: "1px solid #234",
        });
        wrap.appendChild(heartbeatCanvas);

        // Circle gauges row (v846) — parity with phone control.html
        // tama-meter row. Horizontal layout, conic-gradient donuts at
        // 36×36 (matched to phone), click-to-fire with emoji burst.
        // Same color schemes + same action routing as phone:
        //   HUNGER click  → tama:feed  + 🍎 burst
        //   HAPPY  click  → tama:play  + 💖 burst + wave expression
        //   ENERGY click  → tama:sleep + ⚡ burst + halo glow
        const statBox = document.createElement("div");
        Object.assign(statBox.style, {
            display: "flex", flexDirection: "column", gap: "12px",
            padding: "8px 6px", alignItems: "center", justifyContent: "center",
            flex: "0 0 auto",   // v1001 — right-hand gauge column inside the body row
        });
        const makeGauge = (label, action, c2Color, hoverBurst) => {
            const meter = document.createElement("div");
            Object.assign(meter.style, {
                display: "flex", flexDirection: "column",
                alignItems: "center", gap: "2px", cursor: "pointer",
            });
            meter.dataset.key = action === "feed" ? "hunger" :
                                 action === "play" ? "happiness" : "energy";
            // Conic-gradient donut (matches phone CSS exactly)
            const donut = document.createElement("div");
            Object.assign(donut.style, {
                width: "36px", height: "36px", borderRadius: "50%",
                position: "relative",
                background: `conic-gradient(${c2Color} 0%, rgba(255,255,255,0.06) 0)`,
                transition: "background 0.5s ease-out, transform 120ms",
            });
            // Inner hole (matches phone's inset:5px on the inner span)
            const hole = document.createElement("span");
            Object.assign(hole.style, {
                position: "absolute", inset: "5px",
                background: "#0c0f14", borderRadius: "50%",
            });
            donut.appendChild(hole);
            const lbl = document.createElement("span");
            lbl.textContent = label;
            Object.assign(lbl.style, {
                font: "600 10px ui-monospace,monospace",
                color: "#9cf", letterSpacing: "0.06em",
            });
            meter.append(donut, lbl);
            // Click → fire tama action (same path as phone's flashMeter)
            meter.addEventListener("click", () => {
                // Emoji burst animation matching phone
                const burst = document.createElement("span");
                Object.assign(burst.style, {
                    position: "absolute", inset: "0",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: "20px", pointerEvents: "none",
                    transition: "transform 0.5s ease-out, opacity 0.5s ease-out",
                });
                burst.textContent = hoverBurst;
                donut.appendChild(burst);
                requestAnimationFrame(() => {
                    burst.style.transform = "translateY(-22px) scale(1.6)";
                    burst.style.opacity = "0";
                });
                setTimeout(() => { try { burst.remove(); } catch {} }, 600);
                // Tap-feedback scale
                donut.style.transform = "scale(0.92)";
                setTimeout(() => { donut.style.transform = ""; }, 140);
                // Route through tamagotchi sim (same as the old hover button)
                if (this.tamagotchi?._handleMessage) {
                    this.tamagotchi._handleMessage({ action });
                }
                this._pulseHeartbeat();
                this._renderStats();
                // HAPPY → also trigger wave expression on the iframe
                // (matches phone behavior)
                if (action === "play" && this._iframe?.contentWindow) {
                    try {
                        this._iframe.contentWindow.postMessage(
                            { type: "kpop:expression", expression: "wave" }, "*");
                    } catch {}
                }
            });
            statBox.appendChild(meter);
            // Back-compat shim — `bars[x].fill.style.width = "NN%"`
            // becomes a conic-gradient % update.
            const fakeFillStyle = new Proxy({}, {
                set(_t, prop, val) {
                    if (prop !== "width") return true;
                    const pct = Math.max(0, Math.min(100, parseFloat(val) || 0));
                    donut.style.background =
                        `conic-gradient(${c2Color} ${pct}%, rgba(255,255,255,0.06) 0)`;
                    return true;
                },
            });
            return { row: meter, fill: { style: fakeFillStyle } };
        };
        const bars = {
            hunger:    makeGauge("HUNGER", "feed",  "#fa3", "🍎"),
            happiness: makeGauge("HAPPY",  "play",  "#fd5", "💖"),
            energy:    makeGauge("ENERGY", "sleep", "#a6f", "⚡"),
        };
        (this._gaugeBody || wrap).appendChild(statBox);   // v1001 — into the right column

        // Round 265 — drop a .glb file on the PIP and the RobotExpressive
        // iframe loads it. Prevents the browser's default (open the
        // file as a navigation) and converts to a blob URL so we don't
        // need to upload anywhere. The iframe receives a postMessage.
        wrap.addEventListener("dragover", (e) => {
            e.preventDefault();
            wrap.style.outline = "2px dashed #6df";
        });
        wrap.addEventListener("dragleave", () => {
            wrap.style.outline = "";
        });
        wrap.addEventListener("drop", (e) => {
            e.preventDefault();
            wrap.style.outline = "";
            const file = e.dataTransfer?.files?.[0];
            if (!file) return;
            if (!/\.glb$/i.test(file.name)) {
                console.warn("[PipAvatar] drop ignored — only .glb files supported, got:", file.name);
                return;
            }
            const url = URL.createObjectURL(file);
            console.log(`[PipAvatar] custom GLB loaded: ${file.name} → ${url}`);
            // Make sure we're in GLB view mode so the iframe is rendering RobotExpressive
            this.setListenerView("glb");
            // Iframe may have just been swapped — wait a frame for it
            // to be ready before posting.
            setTimeout(() => {
                const f = this._listener?.iframe;
                if (f?.contentWindow) {
                    try {
                        f.contentWindow.postMessage({ type: "kpop:loadGlb", url }, "*");
                    } catch (err) {
                        console.warn("[PipAvatar] kpop:loadGlb post failed:", err);
                    }
                }
            }, 50);
        });

        // OLLAMA dock attachment — moved into the dock if we have a ref
        // AND the user hasn't dragged it out. _undocked is set by
        // HeartbeatAvatar's drag handler; we also skip dock if there's
        // a saved undocked position (HeartbeatAvatar restores it from
        // localStorage during its own _build).
        if (this.heartbeatAvatar?.root && ollamaDock && !this.heartbeatAvatar._undocked) {
            try {
                const r = this.heartbeatAvatar.root;
                r.style.position = "static";
                r.style.right = ""; r.style.bottom = "";
                r.style.top = ""; r.style.left = "";
                r.style.width = "56px"; r.style.height = "72px";
                ollamaDock.appendChild(r);
            } catch (e) {
                console.warn("[PipAvatar] failed to dock heartbeat avatar:", e);
            }
        }

        // v972/v978 — initial chrome visibility for the boot view (the apply
        // path handles every later change). Diorama (stage / glb avatars) has
        // its own 3D dials + ticker → hide the redundant donut + heartbeat.
        try {
            const _e = _pcCycle[_pcCycleIdx];
            const _diorama = _e && (_e.key === "stage" || !!_e.glb);
            statBox.style.display = "none";   // v1004 — DOM donuts retired; 3D dials in the diorama
            heartbeatCanvas.style.display = _diorama ? "none" : "";
        } catch {}
        statBox.style.display = "none";   // v1003 — retired: 3D dials in the diorama replace the DOM donuts
        return { wrap, iframe, frameWrap, viewBtns: { faceSwitcher }, bars, heartbeatCanvas, statBox };
    }

    _teardown() {
        if (this._container?.parentNode) {
            try { this._container.parentNode.removeChild(this._container); } catch {}
        }
        this._container = null;
        this._listener = null;
        this._slotRow = null;
        this._tabBtn = null;
        if (this._thoughtTimer) { clearTimeout(this._thoughtTimer); this._thoughtTimer = null; }
    }
}
