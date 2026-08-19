// FILE: face/MediaPipeFaceTracker.js
// VERSION: v1 — round 310
//
// MediaPipe FaceLandmarker integration. Webcam → 478-landmark face mesh
// → high-level metrics suitable for driving avatars (head pose, mouth
// openness, eye blink, eyebrow raise, smile).
//
// FIRST ROUND SCOPE
//   - Lazy-load MediaPipe (~12MB WASM + model) only when .start() is called
//   - Request webcam permission
//   - Run detection at ~30Hz
//   - Expose raw landmarks via snapshot() and computed metrics via metrics()
//   - Optional preview canvas overlay with drawn landmarks
//
// NOT IN THIS ROUND (deferred to later)
//   - Wiring into HeartbeatAvatar / robotFaceAvatar / kaiju expressions
//   - Phoneme detection for lip sync
//   - Multi-face tracking
//   - Offline-packaged model files (currently fetched from CDN)
//
// Privacy
//   Nothing happens until the user calls face.start(). No camera access,
//   no MediaPipe fetch. All processing is local in-browser; no data
//   leaves the device.
//
// CDN sources
//   Tasks-vision bundle: https://cdn.jsdelivr.net/npm/@mediapipe/[email protected]
//   Model file:           https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task
//
// Public API (post-construction)
//   const f = new MediaPipeFaceTracker();
//   await f.start();                       // request perms + load
//   const m = f.metrics();                 // {mouthOpen, eyeLeft, eyeRight, ...}
//   const snap = f.snapshot();             // {landmarks: 478×{x,y,z}, blendShapes}
//   f.onUpdate(metrics => ...);            // per-frame callback
//   f.showPreview(true);                   // floating webcam preview
//   f.stop();                              // release camera, dispose

const DEFAULT_OPTS = {
    cdnBase:    "https://cdn.jsdelivr.net/npm/@mediapipe/[email protected]",
    modelUrl:   "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
    videoWidth:  640,
    videoHeight: 480,
    targetHz:    30,        // detection throttle
    outputBlendShapes: true,
    outputFaceTransform: true,
    minFaceDetectionConfidence: 0.5,
    minFacePresenceConfidence: 0.5,
};

// MediaPipe landmark indices. The face mesh has 478 landmarks; below
// are the well-known anchors we use for metric computation.
// See: https://storage.googleapis.com/mediapipe-assets/Model%20Card%20MediaPipe%20Face%20Mesh%20V2.pdf
const IDX = {
    // Eye outline (used for openness via vertical/horizontal aspect ratio)
    leftEyeTop:     159,
    leftEyeBottom:  145,
    leftEyeLeft:    33,
    leftEyeRight:   133,
    rightEyeTop:    386,
    rightEyeBottom: 374,
    rightEyeLeft:   362,
    rightEyeRight:  263,

    // Mouth
    mouthUpper:     13,    // upper lip inner
    mouthLower:     14,    // lower lip inner
    mouthLeft:      78,    // left corner
    mouthRight:     308,   // right corner

    // Eyebrow (above eye center)
    leftBrowUp:     105,
    leftBrowCenter: 107,
    rightBrowUp:    334,
    rightBrowCenter:336,

    // Head pose anchors
    noseTip:        1,
    chin:           152,
    foreheadTop:    10,
    leftCheek:      234,
    rightCheek:     454,
};

export class MediaPipeFaceTracker {
    constructor(opts = {}) {
        this.opts = { ...DEFAULT_OPTS, ...opts };
        this._enabled = false;
        this._landmarker = null;
        this._videoEl = null;
        this._stream = null;
        this._lastResult = null;
        this._lastMetrics = null;
        this._lastDetectionT = 0;
        this._rafId = 0;
        this._listeners = new Set();
        this._previewEl = null;
        this._previewCtx = null;
    }

    isActive() { return this._enabled; }

    // ----- Lifecycle -----

    async start() {
        if (this._enabled) {
            console.warn("[MediaPipeFace] already started");
            return;
        }
        try {
            // 1. Webcam — request first so user grants permission before
            //    we waste bandwidth fetching a 12MB model that might not
            //    be usable.
            this._stream = await navigator.mediaDevices.getUserMedia({
                video: {
                    width:  { ideal: this.opts.videoWidth  },
                    height: { ideal: this.opts.videoHeight },
                    facingMode: "user",
                },
                audio: false,
            });
        } catch (e) {
            console.error("[MediaPipeFace] webcam denied or unavailable:", e?.message ?? e);
            throw e;
        }

        // Hidden video element to feed MediaPipe
        this._videoEl = document.createElement("video");
        this._videoEl.style.cssText = "position:absolute; left:-9999px; top:-9999px;";
        this._videoEl.playsInline = true;
        this._videoEl.autoplay = true;
        this._videoEl.muted = true;
        this._videoEl.srcObject = this._stream;
        document.body.appendChild(this._videoEl);
        await new Promise(res => this._videoEl.addEventListener("loadeddata", res, { once: true }));
        await this._videoEl.play();

        // 2. Load MediaPipe bundle (~5MB JS + WASM, lazy)
        let visionModule;
        try {
            // The tasks-vision bundle exports FaceLandmarker + FilesetResolver
            visionModule = await import(/* @vite-ignore */ this.opts.cdnBase + "/vision_bundle.mjs");
        } catch (e) {
            console.error("[MediaPipeFace] failed to fetch MediaPipe bundle:", e?.message ?? e);
            this._cleanup();
            throw e;
        }
        const { FaceLandmarker, FilesetResolver } = visionModule;

        // 3. Load the model file (~7MB float16)
        try {
            const vision = await FilesetResolver.forVisionTasks(this.opts.cdnBase + "/wasm");
            this._landmarker = await FaceLandmarker.createFromOptions(vision, {
                baseOptions: {
                    modelAssetPath: this.opts.modelUrl,
                    delegate: "GPU",     // falls back to CPU if unavailable
                },
                runningMode: "VIDEO",
                outputFaceBlendshapes: this.opts.outputBlendShapes,
                outputFacialTransformationMatrixes: this.opts.outputFaceTransform,
                numFaces: 1,
                minFaceDetectionConfidence: this.opts.minFaceDetectionConfidence,
                minFacePresenceConfidence: this.opts.minFacePresenceConfidence,
            });
        } catch (e) {
            console.error("[MediaPipeFace] FaceLandmarker init failed:", e?.message ?? e);
            this._cleanup();
            throw e;
        }

        this._enabled = true;
        this._tick();
        console.log("[MediaPipeFace] started — running at ~" + this.opts.targetHz + "Hz");
    }

    stop() {
        if (!this._enabled) return;
        this._enabled = false;
        if (this._rafId) cancelAnimationFrame(this._rafId);
        this._cleanup();
        console.log("[MediaPipeFace] stopped");
    }

    _cleanup() {
        if (this._stream) {
            for (const track of this._stream.getTracks()) track.stop();
            this._stream = null;
        }
        if (this._videoEl?.parentNode) {
            this._videoEl.parentNode.removeChild(this._videoEl);
        }
        this._videoEl = null;
        if (this._landmarker?.close) {
            try { this._landmarker.close(); } catch {}
        }
        this._landmarker = null;
        if (this._previewEl?.parentNode) {
            this._previewEl.parentNode.removeChild(this._previewEl);
            this._previewEl = null;
            this._previewCtx = null;
        }
    }

    // ----- Per-frame detection -----

    _tick() {
        if (!this._enabled) return;
        this._rafId = requestAnimationFrame(() => this._tick());

        // Throttle to targetHz
        const now = performance.now();
        const minIntervalMs = 1000 / this.opts.targetHz;
        if (now - this._lastDetectionT < minIntervalMs) return;
        this._lastDetectionT = now;

        if (!this._videoEl || this._videoEl.readyState < 2 || !this._landmarker) return;

        let result;
        try {
            // v3116 -- STILL THE SYNCHRONOUS PATH, AND STILL THE DEFAULT. The worker path below is opt-in
            // (useWorker) because it cannot be verified without a browser and a camera, and replacing a working
            // detect with an unverified one would be trading a known cost for an unknown risk. When the worker
            // is running, _tick never reaches this line.
            result = this._landmarker.detectForVideo(this._videoEl, now);
        } catch (e) {
            console.warn("[MediaPipeFace] detectForVideo failed:", e?.message ?? e);
            return;
        }
        this._lastResult = result;

        // Compute high-level metrics from the 478 landmarks
        if (result.faceLandmarks && result.faceLandmarks.length > 0) {
            this._lastMetrics = computeMetrics(result.faceLandmarks[0], result);
        } else {
            this._lastMetrics = null;
        }

        // Fire listeners (defensive — one bad listener shouldn't break others)
        for (const fn of this._listeners) {
            try { fn(this._lastMetrics, result); }
            catch (e) { console.warn("[MediaPipeFace] listener threw:", e?.message ?? e); }
        }

        // Update preview
        if (this._previewEl) this._drawPreview(result);
    }

    // ----- Data access -----

    snapshot() {
        const silent = this._pump && this._pump.health(performance.now()) === "silent";
        return {
            // A silent pipeline is NOT an active tracker, whatever the enable flag says. Reporting active:true
            // here would be the tracker vouching for a component it has not heard from.
            active: this._enabled && !silent,
            landmarks: this._lastResult?.faceLandmarks?.[0] ?? null,
            blendShapes: this._lastResult?.faceBlendshapes?.[0] ?? null,
            transform: this._lastResult?.facialTransformationMatrixes?.[0] ?? null,
            metrics: this._lastMetrics,
            // v3116 -- *** A SILENT WORKER LOOKS EXACTLY LIKE AN EMPTY ROOM. *** If the worker dies or its
            // model fails to load, blendshapes simply stop arriving -- and v3114's wiring reads absent
            // blendshapes as "noface", which means "the camera works and nobody is in frame". Wrong fact,
            // wrong fix: the user goes and checks the lighting. So the PIPELINE reports on itself separately
            // from what it saw, and `active` goes false when the pipeline is silent rather than merely quiet.
            pipeline: {
                mode: this._pump ? "worker" : "sync",
                health: this._pump ? this._pump.health(performance.now()) : (this._enabled ? "alive" : "idle"),
                stats: this._pump ? this._pump.stats() : null,
                fellBack: this._workerFellBack || null,
            },
        };
    }

    metrics() { return this._lastMetrics; }

    onUpdate(fn) {
        if (typeof fn !== "function") return () => {};
        this._listeners.add(fn);
        return () => this._listeners.delete(fn);
    }

    // ----- Preview canvas (optional, draggable) -----

    showPreview(on = true) {
        if (!on) {
            if (this._previewEl?.parentNode) {
                this._previewEl.parentNode.removeChild(this._previewEl);
                this._previewEl = null;
                this._previewCtx = null;
            }
            return;
        }
        if (this._previewEl) return;     // already shown

        const root = document.createElement("div");
        root.style.cssText = [
            "position:fixed",
            "right:16px", "bottom:240px",
            "z-index:9500",
            "border:1px solid #6cc",
            "background:#000",
            "border-radius:6px",
            "padding:4px",
            "cursor:move",
            "box-shadow:0 4px 16px rgba(0,0,0,0.5)",
        ].join(";");
        const label = document.createElement("div");
        label.style.cssText = "color:#9ef; font:10px monospace; padding:2px 4px; user-select:none;";
        label.textContent = "🎭 face — drag · click ✕ to close";
        root.appendChild(label);

        const closeBtn = document.createElement("span");
        closeBtn.textContent = " ✕";
        closeBtn.style.cssText = "float:right; color:#f88; cursor:pointer;";
        closeBtn.addEventListener("click", (e) => { e.stopPropagation(); this.showPreview(false); });
        label.appendChild(closeBtn);

        const canvas = document.createElement("canvas");
        canvas.width  = 160;
        canvas.height = 120;
        canvas.style.cssText = "display:block; width:160px; height:120px; background:#000;";
        root.appendChild(canvas);

        // Simple drag handler
        let dragging = false, dragOffX = 0, dragOffY = 0;
        label.addEventListener("mousedown", (e) => {
            dragging = true;
            const r = root.getBoundingClientRect();
            dragOffX = e.clientX - r.left;
            dragOffY = e.clientY - r.top;
            e.preventDefault();
        });
        window.addEventListener("mousemove", (e) => {
            if (!dragging) return;
            root.style.left = (e.clientX - dragOffX) + "px";
            root.style.top  = (e.clientY - dragOffY) + "px";
            root.style.right = "auto";
            root.style.bottom = "auto";
        });
        window.addEventListener("mouseup", () => { dragging = false; });

        document.body.appendChild(root);
        this._previewEl = root;
        this._previewCtx = canvas.getContext("2d");
    }

    _drawPreview(result) {
        const ctx = this._previewCtx;
        if (!ctx) return;
        const w = ctx.canvas.width, h = ctx.canvas.height;

        // Webcam frame as backdrop (mirrored for natural feel)
        if (this._videoEl) {
            ctx.save();
            ctx.translate(w, 0);
            ctx.scale(-1, 1);
            ctx.drawImage(this._videoEl, 0, 0, w, h);
            ctx.restore();
        }

        // Landmarks as cyan dots
        const lms = result?.faceLandmarks?.[0];
        if (lms) {
            ctx.fillStyle = "rgba(110, 220, 255, 0.85)";
            for (const lm of lms) {
                // landmarks are in normalized [0..1] coords (already mirrored from video)
                const x = (1 - lm.x) * w;
                const y = lm.y * h;
                ctx.fillRect(x - 0.5, y - 0.5, 1.5, 1.5);
            }
        }

        // Metrics overlay text
        const m = this._lastMetrics;
        if (m) {
            ctx.fillStyle = "rgba(0,0,0,0.5)";
            ctx.fillRect(0, h - 18, w, 18);
            ctx.fillStyle = "#9ef";
            ctx.font = "9px monospace";
            ctx.fillText(
                `mouth ${m.mouthOpen.toFixed(2)}  eye ${m.eyeLeft.toFixed(2)},${m.eyeRight.toFixed(2)}  yaw ${(m.yaw*180/Math.PI).toFixed(0)}°`,
                3, h - 6
            );
        }
    }
}

// =============================================================================
// Metric computation (PURE — no MediaPipe dependency, just landmark math)
//
// Exported so unit tests can verify the math without needing a webcam.
// =============================================================================

export function computeMetrics(landmarks, result = null) {
    if (!landmarks || landmarks.length < 478) return null;

    // Eye openness: vertical-eye / horizontal-eye distance (EAR-like)
    const eyeLeft  = _eyeOpenness(landmarks, IDX.leftEyeTop,  IDX.leftEyeBottom,  IDX.leftEyeLeft,  IDX.leftEyeRight);
    const eyeRight = _eyeOpenness(landmarks, IDX.rightEyeTop, IDX.rightEyeBottom, IDX.rightEyeLeft, IDX.rightEyeRight);

    // Mouth openness: lip distance / face height
    const mouthHeight = _dist3D(landmarks[IDX.mouthUpper], landmarks[IDX.mouthLower]);
    const faceHeight  = _dist3D(landmarks[IDX.foreheadTop], landmarks[IDX.chin]);
    const mouthOpen   = faceHeight > 0 ? mouthHeight / faceHeight : 0;

    // Smile / mouth width: mouth corners distance / face width
    const mouthWidth = _dist3D(landmarks[IDX.mouthLeft], landmarks[IDX.mouthRight]);
    const faceWidth  = _dist3D(landmarks[IDX.leftCheek], landmarks[IDX.rightCheek]);
    const mouthWide  = faceWidth > 0 ? mouthWidth / faceWidth : 0;

    // Eyebrow raise: brow Y relative to eye top Y, normalized by face height
    const browLeft  = (landmarks[IDX.leftEyeTop].y  - landmarks[IDX.leftBrowCenter].y)  / Math.max(faceHeight, 1e-6);
    const browRight = (landmarks[IDX.rightEyeTop].y - landmarks[IDX.rightBrowCenter].y) / Math.max(faceHeight, 1e-6);

    // Head pose: nose tip relative to face centroid for yaw,
    // and forehead/chin relative for pitch. (Rough; if MediaPipe
    // supplied a facialTransformationMatrix, use that instead.)
    let yaw = 0, pitch = 0, roll = 0;
    const m = result?.facialTransformationMatrixes?.[0]?.data;
    if (m && m.length >= 16) {
        // m is a 4x4 column-major transform. Extract Euler angles from
        // the rotation portion. Convention: yaw=Y, pitch=X, roll=Z.
        const r00 = m[0], r10 = m[1], r20 = m[2];
        const r21 = m[6];
        const r22 = m[10];
        pitch = Math.atan2(-r20, Math.sqrt(r00*r00 + r10*r10));
        yaw   = Math.atan2(r10, r00);
        roll  = Math.atan2(r21, r22);
    } else {
        // Cheap fallback: yaw from horizontal offset of nose tip
        // relative to mid-eye, normalized by face width.
        const noseX  = landmarks[IDX.noseTip].x;
        const eyeMidX = (landmarks[IDX.leftEyeLeft].x + landmarks[IDX.rightEyeRight].x) / 2;
        const dx = (noseX - eyeMidX);
        // Map dx in [-0.06, +0.06] approx → yaw ≈ ±0.6 rad
        yaw = Math.max(-1, Math.min(1, dx * 10));
        // pitch from nose tip Y vs forehead+chin midpoint
        const midY = (landmarks[IDX.foreheadTop].y + landmarks[IDX.chin].y) / 2;
        const noseY = landmarks[IDX.noseTip].y;
        pitch = Math.max(-1, Math.min(1, (noseY - midY) * 6));
    }

    return {
        eyeLeft, eyeRight,
        mouthOpen, mouthWide,
        browLeft, browRight,
        yaw, pitch, roll,
    };
}

function _dist3D(a, b) {
    if (!a || !b) return 0;
    const dx = a.x - b.x, dy = a.y - b.y, dz = (a.z ?? 0) - (b.z ?? 0);
    return Math.hypot(dx, dy, dz);
}

// EAR-like: vertical lid distance / horizontal eye width.
// At rest ≈ 0.30. Closed → 0.08 or lower. Wide-open ≈ 0.45.
function _eyeOpenness(landmarks, topIdx, bottomIdx, leftIdx, rightIdx) {
    const vert  = _dist3D(landmarks[topIdx], landmarks[bottomIdx]);
    const horiz = _dist3D(landmarks[leftIdx], landmarks[rightIdx]);
    if (horiz < 1e-6) return 0;
    return vert / horiz;
}

export function makeMediaPipeFaceTracker(opts) {
    return new MediaPipeFaceTracker(opts);
}
