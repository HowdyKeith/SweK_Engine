// FILE: face/MediaPipeHandTracker.js
// MediaPipe hand tracking — the hand sibling of MediaPipeFaceTracker.
//
// Lazy-loaded, opt-in. Nothing fetches a model or asks for the webcam
// until .start() is called. After that, 21 landmarks per hand (up to 2)
// plus computed gesture metrics (pinch, grab point, fist, point, open
// palm, a normalized cursor, and two-hand spread/roll) become available
// for any engine system that wants to read them.
//
// Mirrors MediaPipeFaceTracker so it plugs in identically:
//   import { MediaPipeHandTracker } from "./face/MediaPipeHandTracker.js";
//   const h = new MediaPipeHandTracker();
//   await h.start();                       // grants camera, loads model
//   h.onUpdate(m => console.log(m.cursor));// per-frame callback
//   h.showPreview(true);                   // floating webcam preview + skeleton
//   h.metrics();                           // latest gesture metrics
//   h.stop();                              // release camera, dispose
//
// First-round scope is data plumbing only — cursor→raycast, pinch→grab,
// etc. are consumer wiring for a later round (same as the face tracker did).

const DEFAULT_OPTS = {
    cdnBase:    "https://cdn.jsdelivr.net/npm/@mediapipe/[email protected]",
    // Mirrors the face model path convention; bump /1/ -> /latest/ if Google
    // retires the pin. This is the "full" hand model (most accurate).
    modelUrl:   "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
    videoWidth:  640,
    videoHeight: 480,
    targetHz:    30,        // detection throttle
    numHands:    2,         // 2 enables two-hand zoom/rotate gestures
    // v4485 -- PINCH IS A FRACTION OF THE HAND NOW, NOT A CONSTANT. v3850 measured what the constant cost and
    // declined to change it (v3679: a round must not move a verdict it is not about), recording the numbers so
    // the call could be made: pinch.distance is homogeneous of degree 1 in apparent hand size, so an ABSOLUTE
    // threshold has a critical scale s* = pinchThreshold/d(1) -- and A CLOSED FIST CROSSED IT AT 0.63x, reading
    // as a pinch purely for being far from the camera. Keith called it. The fold family never had this problem
    // because it is a RATIO test; this makes pinch one too.
    pinchThreshold: 0.06,   // ABSOLUTE fallback: used when pinchRelative is false, or the span is unusable
    pinchRelative: true,    // compare against pinchSpanFraction * palmSpan instead of pinchThreshold
    // The span is dist(WRIST, MIDDLE_MCP) -- the palm, which is RIGID: it reads 0.160200 identically across
    // open / fist / point / pinch on the device fixture, where wrist->MIDDLE_TIP collapses 0.278115 -> 0.131352
    // on a curl. A span that shortens when you close your hand would make the pinch threshold depend on THE
    // OTHER FINGERS, which is circular. It also excludes the thumb, one of the two points being measured.
    // *** 0.375 IS DERIVED, NOT PICKED: it reproduces the shipped 0.06 at nominal fixture size to 0.125%
    // (0.375 * 0.160200 = 0.060075), so this is a GENERALIZATION OF THE SHIPPED VERDICT AND NOT A RETUNE --
    // every fixture pose classifies exactly as before at nominal, and now also at every other distance. Read
    // anatomically it is a ~3.75cm thumb-index gap on a ~10cm palm. *** See handsBind.mjs: the fixture's palm
    // LENGTH is anatomically close (ratio 1.483 vs ~1.389) which is what licenses this number; confirming it
    // against real MediaPipe landmarks is NOT DONE and is named as required follow-up.
    pinchSpanFraction: 0.375,
    minHandDetectionConfidence: 0.5,
    minHandPresenceConfidence:  0.5,
    minTrackingConfidence:      0.5,
    mirror: true,           // webcam is a mirror; flip X so right feels right
    // v3850 -- A DECLARED DEFECT KNOB, OFF BY DEFAULT, for tools/roundhouse/handsBind.mjs's plant mode.
    // Dropping the z term is the most tempting real edit to this file (MediaPipe's z is by far its noisiest
    // coordinate, and every metric here would still "work"), so it is the defect the gate should be able to
    // prove it would catch. NOTHING SHIPS WITH THIS ON -- see _dist3D for why it branches the long way.
    flatDistance: false,
    // v4026 -- A SECOND DECLARED DEFECT KNOB, OFF BY DEFAULT, for tools/roundhouse/handsBind.mjs.
    // The fold test below references every finger to THE WRIST, and this file's own comment says that is what
    // makes it rotation-tolerant. It is also what makes it TRANSLATION-invariant: move the whole hand and every
    // wrist-relative distance is unchanged. Anchoring to a fixed point in the image instead is the same shape of
    // tempting edit as flatDistance -- "the wrist landmark is the jitteriest joint in the chain, use the image
    // centre as a stable reference" -- and it leaves every metric returning a plausible number while making the
    // classification depend on WHERE THE HAND IS. False, or a { x, y, z } point. NOTHING SHIPS WITH THIS ON.
    fixedAnchor: false,
    // v4027 -- A THIRD DECLARED DEFECT KNOB, OFF BY DEFAULT. _dist3D is a Euclidean hypot, and Euclidean
    // distance is EXACTLY invariant under rotation in any plane -- which is why in-plane roll reads 0/64 under
    // every plant so far. The L1 (Manhattan) sum is the classic cheap substitute, and it is NOT rotation
    // invariant: |dx|+|dy| changes as a rigid pair turns even though the pair has not moved. "hypot is a square
    // root per landmark pair, use the taxicab sum" is the same shape of edit as dropping z.
    manhattan: false,
    // v4027 -- A FOURTH. The mirror x -> 1-x is applied at three sites, and this file's own gate says the
    // involution test "catches the mirror being applied to one side of a difference and not the other". Half of
    // it -- forgetting mx() on the grab point while keeping it on the cursor -- is the single most ordinary slip
    // available here, and every gesture still returns a number in range.
    mirrorHalf: false,
};

// MediaPipe hand landmark indices (21 points per hand).
const IDX = {
    WRIST: 0,
    THUMB_CMC: 1,  THUMB_MCP: 2,  THUMB_IP: 3,   THUMB_TIP: 4,
    INDEX_MCP: 5,  INDEX_PIP: 6,  INDEX_DIP: 7,  INDEX_TIP: 8,
    MIDDLE_MCP: 9, MIDDLE_PIP: 10, MIDDLE_DIP: 11, MIDDLE_TIP: 12,
    RING_MCP: 13,  RING_PIP: 14,  RING_DIP: 15,  RING_TIP: 16,
    PINKY_MCP: 17, PINKY_PIP: 18, PINKY_DIP: 19, PINKY_TIP: 20,
};

// Per-finger (tip, pip) pairs for the four non-thumb fingers.
const FINGERS = [
    { name: "index",  tip: IDX.INDEX_TIP,  pip: IDX.INDEX_PIP },
    { name: "middle", tip: IDX.MIDDLE_TIP, pip: IDX.MIDDLE_PIP },
    { name: "ring",   tip: IDX.RING_TIP,   pip: IDX.RING_PIP },
    { name: "pinky",  tip: IDX.PINKY_TIP,  pip: IDX.PINKY_PIP },
];

// Skeleton edges for the preview overlay.
const HAND_CONNECTIONS = [
    [0,1],[1,2],[2,3],[3,4],         // thumb
    [0,5],[5,6],[6,7],[7,8],         // index
    [5,9],[9,10],[10,11],[11,12],    // middle
    [9,13],[13,14],[14,15],[15,16],  // ring
    [13,17],[17,18],[18,19],[19,20], // pinky
    [0,17],                          // palm base
];

export class MediaPipeHandTracker {
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
            console.warn("[MediaPipeHand] already started");
            return;
        }
        try {
            this._stream = await navigator.mediaDevices.getUserMedia({
                video: {
                    width:  { ideal: this.opts.videoWidth  },
                    height: { ideal: this.opts.videoHeight },
                    facingMode: "user",
                },
                audio: false,
            });
        } catch (e) {
            console.error("[MediaPipeHand] webcam denied or unavailable:", e?.message ?? e);
            throw e;
        }

        this._videoEl = document.createElement("video");
        this._videoEl.style.cssText = "position:absolute; left:-9999px; top:-9999px;";
        this._videoEl.playsInline = true;
        this._videoEl.autoplay = true;
        this._videoEl.muted = true;
        this._videoEl.srcObject = this._stream;
        document.body.appendChild(this._videoEl);
        await new Promise(res => this._videoEl.addEventListener("loadeddata", res, { once: true }));
        await this._videoEl.play();

        let visionModule;
        try {
            // Same bundle the face tracker loads — shared + cached if both run.
            visionModule = await import(/* @vite-ignore */ this.opts.cdnBase + "/vision_bundle.mjs");
        } catch (e) {
            console.error("[MediaPipeHand] failed to fetch MediaPipe bundle:", e?.message ?? e);
            this._cleanup();
            throw e;
        }
        const { HandLandmarker, FilesetResolver } = visionModule;

        try {
            const vision = await FilesetResolver.forVisionTasks(this.opts.cdnBase + "/wasm");
            this._landmarker = await HandLandmarker.createFromOptions(vision, {
                baseOptions: {
                    modelAssetPath: this.opts.modelUrl,
                    delegate: "GPU",     // falls back to CPU if unavailable
                },
                runningMode: "VIDEO",
                numHands: this.opts.numHands,
                minHandDetectionConfidence: this.opts.minHandDetectionConfidence,
                minHandPresenceConfidence:  this.opts.minHandPresenceConfidence,
                minTrackingConfidence:      this.opts.minTrackingConfidence,
            });
        } catch (e) {
            console.error("[MediaPipeHand] HandLandmarker init failed:", e?.message ?? e);
            this._cleanup();
            throw e;
        }

        this._enabled = true;
        this._tick();
        console.log("[MediaPipeHand] started — running at ~" + this.opts.targetHz + "Hz");
    }

    stop() {
        this._enabled = false;
        if (this._rafId) cancelAnimationFrame(this._rafId);
        this._rafId = 0;
        this._cleanup();
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

        const now = performance.now();
        const minIntervalMs = 1000 / this.opts.targetHz;
        if (now - this._lastDetectionT < minIntervalMs) return;
        this._lastDetectionT = now;

        if (!this._videoEl || this._videoEl.readyState < 2 || !this._landmarker) return;

        let result;
        try {
            result = this._landmarker.detectForVideo(this._videoEl, now);
        } catch (e) {
            console.warn("[MediaPipeHand] detectForVideo failed:", e?.message ?? e);
            return;
        }
        this._lastResult = result;

        if (result.landmarks && result.landmarks.length > 0) {
            this._lastMetrics = computeHandMetrics(result.landmarks, result, this.opts);
        } else {
            this._lastMetrics = null;
        }

        for (const fn of this._listeners) {
            try { fn(this._lastMetrics, result); }
            catch (e) { console.warn("[MediaPipeHand] listener threw:", e?.message ?? e); }
        }

        if (this._previewEl) this._drawPreview(result);
    }

    // ----- Data access -----

    snapshot() {
        return {
            active: this._enabled,
            landmarks: this._lastResult?.landmarks ?? null,     // array of hands (raw, unmirrored)
            worldLandmarks: this._lastResult?.worldLandmarks ?? null,
            handedness: this._lastResult?.handedness ?? null,
            metrics: this._lastMetrics,
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
        if (on) {
            if (this._previewEl) return;
            const el = document.createElement("canvas");
            el.width = 192; el.height = 144;
            el.style.cssText =
                "position:fixed; right:16px; bottom:16px; width:192px; height:144px;" +
                "border:1px solid rgba(255,255,255,0.25); border-radius:8px; z-index:99999;" +
                "background:#000; cursor:grab; transform:scaleX(-1);"; // mirror to match user
            document.body.appendChild(el);
            this._previewEl = el;
            this._previewCtx = el.getContext("2d");

            // Drag-to-move (read coords pre-mirror, so undo the scaleX flip)
            let dragging = false, ox = 0, oy = 0;
            el.addEventListener("mousedown", (e) => {
                dragging = true; el.style.cursor = "grabbing";
                const r = el.getBoundingClientRect();
                ox = e.clientX - r.left; oy = e.clientY - r.top;
                e.preventDefault();
            });
            window.addEventListener("mousemove", (e) => {
                if (!dragging) return;
                el.style.left = (e.clientX - ox) + "px";
                el.style.top  = (e.clientY - oy) + "px";
                el.style.right = "auto"; el.style.bottom = "auto";
            });
            window.addEventListener("mouseup", () => { dragging = false; el.style.cursor = "grab"; });
        } else {
            if (this._previewEl?.parentNode) this._previewEl.parentNode.removeChild(this._previewEl);
            this._previewEl = null;
            this._previewCtx = null;
        }
    }

    _drawPreview(result) {
        const ctx = this._previewCtx, el = this._previewEl;
        if (!ctx || !el || !this._videoEl) return;
        const w = el.width, h = el.height;
        ctx.drawImage(this._videoEl, 0, 0, w, h);

        const hands = result?.landmarks ?? [];
        for (const lm of hands) {
            if (!lm) continue;
            ctx.strokeStyle = "rgba(0,255,200,0.85)";
            ctx.lineWidth = 1.5;
            for (const [a, b] of HAND_CONNECTIONS) {
                ctx.beginPath();
                ctx.moveTo(lm[a].x * w, lm[a].y * h);
                ctx.lineTo(lm[b].x * w, lm[b].y * h);
                ctx.stroke();
            }
            ctx.fillStyle = "rgba(255,80,120,0.95)";
            for (const p of lm) {
                ctx.beginPath();
                ctx.arc(p.x * w, p.y * h, 2.2, 0, Math.PI * 2);
                ctx.fill();
            }
        }
    }
}

// ----- Pure metric computation (headless-testable) -----

// landmarksArray: result.landmarks — an array (1 or 2) of 21-point hands.
// Each point is { x, y, z } with x,y normalized to [0,1] and z relative to
// the wrist. Returns null if no hands. opts carries pinchThreshold + mirror.
export function computeHandMetrics(landmarksArray, result = null, opts = {}) {
    if (!landmarksArray || landmarksArray.length === 0) return null;
    const pinchThreshold = opts.pinchThreshold ?? DEFAULT_OPTS.pinchThreshold;
    const mirror = opts.mirror ?? DEFAULT_OPTS.mirror;
    const mx = (x) => mirror ? 1.0 - x : x;
    // v3850 -- the declared defect knob; see DEFAULT_OPTS. `false` here means every call below takes the
    // three-argument path character for character, which is what makes the default verifiable.
    const flat = opts.flatDistance ?? DEFAULT_OPTS.flatDistance;
    // v4027 -- the metric knob. Like `flat` it branches the WHOLE call rather than reshaping the default's
    // arithmetic, so the Euclidean path is entered character for character when nothing is asked for.
    const l1 = opts.manhattan ?? DEFAULT_OPTS.manhattan;
    const dist = l1 ? (a, b) => _distL1(a, b) : (a, b) => _dist3D(a, b, flat);
    const halfMirror = opts.mirrorHalf ?? DEFAULT_OPTS.mirrorHalf;
    // The grab point's own mirror, separable from the cursor's. `mx` when the knob is off -- the same function.
    const gx = halfMirror ? (x) => x : mx;
    // v4026 -- the second declared defect knob; see DEFAULT_OPTS. When it is false the fold reference below is
    // THE WRIST OBJECT ITSELF, so the default path is not merely equivalent to the old one, it is the same call
    // on the same operand -- the discipline _dist3D's comment sets out, applied to an operand instead of an
    // argument count.
    const anchorOpt = opts.fixedAnchor ?? DEFAULT_OPTS.fixedAnchor;
    // v4485 -- see DEFAULT_OPTS. `pinchRelative: false` restores the pre-v4485 absolute comparison EXACTLY.
    const pinchRelative = opts.pinchRelative ?? DEFAULT_OPTS.pinchRelative;
    const pinchSpanFraction = opts.pinchSpanFraction ?? DEFAULT_OPTS.pinchSpanFraction;

    const hands = [];
    for (let i = 0; i < landmarksArray.length && i < 2; i++) {
        const lm = landmarksArray[i];
        if (!lm || lm.length < 21) { hands.push(null); continue; }

        const wrist = lm[IDX.WRIST];
        const thumbTip = lm[IDX.THUMB_TIP];
        const indexTip = lm[IDX.INDEX_TIP];

        // Pinch: thumb-tip to index-tip, compared against a limit that SCALES WITH THE HAND (v4485).
        // palmSpan is wrist->MIDDLE_MCP: rigid under finger curl, and thumb-free, so the reference cannot move
        // with the gesture being measured. It goes through `dist` like everything else, so the declared defect
        // knobs (flatDistance, manhattan) reach it too rather than it being a privileged second metric.
        const pinchDist = dist(thumbTip, indexTip);
        const palmSpan = dist(wrist, lm[IDX.MIDDLE_MCP]);
        // *** THE FALLBACK IS NOT DEFENSIVE PADDING, IT IS THE DEGENERATE CASE. *** A zero or non-finite span
        // means the palm landmarks collapsed, and scaling by it would make the limit 0 so NOTHING would ever
        // read as pinched -- silently, and hardest exactly where tracking is already worst.
        const spanUsable = pinchRelative && Number.isFinite(palmSpan) && palmSpan > 0;
        const pinchLimit = spanUsable ? pinchSpanFraction * palmSpan : pinchThreshold;
        const pinchActive = pinchDist < pinchLimit;

        // Grab point: midpoint of thumb+index (mirrored X).
        const grabPoint = {
            x: gx((thumbTip.x + indexTip.x) / 2),
            y: (thumbTip.y + indexTip.y) / 2,
            z: (thumbTip.z + indexTip.z) / 2,
        };

        // Finger curl via wrist distance (rotation-tolerant): a finger is
        // folded when its tip is closer to the wrist than its PIP joint.
        const folded = {};
        const foldRef = anchorOpt || wrist;      // the wrist itself when the knob is off
        for (const f of FINGERS) {
            folded[f.name] = dist(foldRef, lm[f.tip]) < dist(foldRef, lm[f.pip]);
        }
        const fist = folded.index && folded.middle && folded.ring && folded.pinky;
        const openPalm = !folded.index && !folded.middle && !folded.ring && !folded.pinky;
        const pointing = !folded.index && folded.middle && folded.ring && folded.pinky;

        const handedness = result?.handedness?.[i]?.[0]?.categoryName ?? null;

        hands.push({
            handedness,                  // raw MediaPipe label (mirror-flipped vs user; see notes)
            cursor: { x: mx(indexTip.x), y: indexTip.y },  // index-tip pointer, mirrored
            // v4485 -- `limit`, `span`, `ratio` and `relative` are ADDITIVE, so no existing reader breaks.
            // `ratio` is the scale-free quantity: pinchDist expressed in palms, the number that means the same
            // thing at any distance from the camera. `ratio < pinchSpanFraction` is exactly `active`.
            pinch: {
                active: pinchActive, distance: pinchDist,
                limit: pinchLimit, span: palmSpan,
                ratio: palmSpan > 0 ? pinchDist / palmSpan : Infinity,
                relative: spanUsable,
            },
            grab: { active: pinchActive, point: grabPoint },
            fist, openPalm, pointing,
            folded,
        });
    }

    const primary = hands.find(Boolean) ?? null;

    // Two-hand gesture (zoom/rotate) — uses wrists for stability.
    let twoHand = null;
    if (hands[0] && hands[1] && landmarksArray[0] && landmarksArray[1]) {
        const w0 = landmarksArray[0][IDX.WRIST];
        const w1 = landmarksArray[1][IDX.WRIST];
        const spread = dist(w0, w1);
        // Roll angle of the line between hands (use mirrored X so it matches view).
        const roll = Math.atan2(w1.y - w0.y, mx(w1.x) - mx(w0.x));
        twoHand = { spread, roll };
    }

    return {
        handCount: hands.filter(Boolean).length,
        hands,                                  // up to 2 (may contain nulls if malformed)
        cursor: primary?.cursor ?? { x: 0.5, y: 0.5 },
        pinch: primary?.pinch?.active ?? false,
        twoHand,
    };
}

// v4027 -- the L1 substitute, as its own function for the reason _dist3D's comment gives about argument counts:
// a knob that reshapes the default's arithmetic is not a knob. This is entered only when a caller asks by name.
function _distL1(a, b) {
    if (!a || !b) return 0;
    return Math.abs(a.x - b.x) + Math.abs(a.y - b.y) + Math.abs((a.z ?? 0) - (b.z ?? 0));
}

function _dist3D(a, b, flat = false) {
    if (!a || !b) return 0;
    const dx = a.x - b.x, dy = a.y - b.y, dz = (a.z ?? 0) - (b.z ?? 0);
    // *** THE BRANCH IS ON THE WHOLE CALL, NOT ON A ZEROED dz, AND THAT IS NOT TIDINESS. ***
    // Math.hypot(dx, dy, 0) and Math.hypot(dx, dy) are different operations over different argument counts and
    // are not obliged to agree in the last ulp. Writing this as `Math.hypot(dx, dy, flat ? 0 : dz)` would put
    // the knob INSIDE the default's arithmetic, and A KNOB THAT MOVES THE DEFAULT IS NOT A KNOB (v3845's
    // flip3d lesson, same shape). The `flat` path is entered only when a caller asks for it by name.
    if (flat) return Math.hypot(dx, dy);
    return Math.hypot(dx, dy, dz);
}

export function makeMediaPipeHandTracker(opts) {
    return new MediaPipeHandTracker(opts);
}
