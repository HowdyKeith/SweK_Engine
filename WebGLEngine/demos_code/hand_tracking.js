// demos_code/hand_tracking.js
//
// MediaPipe hand tracking showcase, running IN the engine (not an iframe).
// Mirrors the face_test demo contract. Consumes window.hands (the shim wired
// in main.js around the MediaPipeHandTracker module).
//
// What it does, using only guarded blessed ctx verbs so it can never corrupt
// the world:
//   * starts the webcam hand tracker + floating preview (skeleton overlay)
//   * live gesture HUD (cursor, pinch, fist, point, open palm, two-hand)
//   * a DOM crosshair that follows your index-finger cursor on screen
//   * PINCH (edge-triggered) spawns a particle burst on the ground near you,
//     placed by your hand cursor: cursor.x -> angle around you, cursor.y ->
//     distance. Two open hands (spread) makes a bigger burst.
//
// Camera permission is only requested after the demo opens and the tracker
// starts — opening the menu entry alone does nothing.

let overlay = null;
let hud = null;
let crosshair = null;
let backBtn = null;
let started = false;
let prevPinch = false;
let cooldown = 0;

function fmt(n, d = 2) { return (typeof n === "number" ? n.toFixed(d) : "—"); }

export default {
    id:    "hand_tracking",
    label: "HAND TRACKING — MEDIAPIPE WEBCAM",
    hint:  "21 landmarks/hand → gestures. Pinch to spawn a burst near you; move your hand to aim it.",
    controls: [
        "Grant webcam permission when prompted",
        "Move your index finger — the crosshair follows it",
        "Pinch thumb+index — spawns a particle burst on the ground near you",
        "Aim: cursor X = angle around you, cursor Y = distance",
        "Show two open hands — bigger burst",
        "ESC or Back returns to the engine (releases the camera)",
    ],

    async start(ctx) {
        if (overlay) return;
        this._ctx = ctx;

        overlay = document.createElement("div");
        overlay.id = "hand-tracking-overlay";
        Object.assign(overlay.style, {
            position: "fixed", left: "0", top: "0",
            width: "0", height: "0", zIndex: "910",
            pointerEvents: "none",
        });
        document.body.appendChild(overlay);

        // Gesture HUD
        hud = document.createElement("div");
        Object.assign(hud.style, {
            position: "fixed", left: "16px", top: "16px", zIndex: "920",
            background: "rgba(10,14,26,0.9)", color: "#9fe",
            font: "12px monospace", padding: "12px 14px",
            border: "1px solid #2a6", borderRadius: "6px",
            whiteSpace: "pre", pointerEvents: "none", minWidth: "190px",
        });
        hud.textContent = "[hands] starting camera…";
        document.body.appendChild(hud);

        // Crosshair that follows the hand cursor
        crosshair = document.createElement("div");
        Object.assign(crosshair.style, {
            position: "fixed", left: "50%", top: "50%", zIndex: "915",
            width: "26px", height: "26px", marginLeft: "-13px", marginTop: "-13px",
            border: "2px solid #2fd", borderRadius: "50%",
            boxShadow: "0 0 8px rgba(40,255,210,0.6)",
            pointerEvents: "none", transition: "background 0.05s",
        });
        document.body.appendChild(crosshair);

        // Back button
        backBtn = document.createElement("button");
        backBtn.textContent = "← BACK TO ENGINE";
        Object.assign(backBtn.style, {
            position: "fixed", right: "16px", top: "12px", zIndex: "920",
            padding: "8px 16px", background: "rgba(20,30,40,0.92)",
            color: "#8fd", border: "1px solid #2a8", borderRadius: "4px",
            font: "12px monospace", cursor: "pointer", pointerEvents: "auto",
        });
        backBtn.addEventListener("click", () => this.stop(ctx));
        document.body.appendChild(backBtn);

        this._escHandler = (e) => { if (e.key === "Escape") this.stop(ctx); };
        document.addEventListener("keydown", this._escHandler);

        // Start the shared hand tracker + preview.
        started = false;
        try {
            if (!window.hands) { hud.textContent = "[hands] window.hands missing — is main.js wired?"; }
            else {
                await window.hands.start();
                window.hands.showPreview(true);
                started = true;
                if (ctx?.kpop?.info) ctx.kpop.info("Hand Tracking", "Pinch to spawn · ESC to return");
            }
        } catch (e) {
            hud.textContent = "[hands] camera denied / failed:\n" + (e?.message ?? e);
        }
        console.log("[hand_tracking] opened");
    },

    tick(ctx) {
        if (!started || !window.hands || !hud) return;
        const m = window.hands.metrics();
        if (cooldown > 0) cooldown--;

        if (!m || m.handCount === 0) {
            hud.textContent = "[hands] no hand detected\nshow your palm to the camera";
            crosshair.style.background = "transparent";
            return;
        }

        const h0 = m.hands.find(Boolean) || {};
        const g = h0.folded || {};
        hud.textContent =
            `[hands] count: ${m.handCount}\n` +
            `cursor: ${fmt(m.cursor.x)}, ${fmt(m.cursor.y)}\n` +
            `pinch:  ${m.pinch ? "YES" : "no"}  (d=${fmt(h0.pinch?.distance, 3)})\n` +
            `fist:   ${h0.fist ? "YES" : "no"}\n` +
            `point:  ${h0.pointing ? "YES" : "no"}\n` +
            `open:   ${h0.openPalm ? "YES" : "no"}\n` +
            (m.twoHand ? `two-hand: spread ${fmt(m.twoHand.spread)} roll ${fmt(m.twoHand.roll)}` : "two-hand: —");

        // Crosshair follows the cursor (normalized -> screen px).
        crosshair.style.left = (m.cursor.x * window.innerWidth) + "px";
        crosshair.style.top  = (m.cursor.y * window.innerHeight) + "px";
        crosshair.style.background = m.pinch ? "rgba(40,255,210,0.45)" : "transparent";

        // PINCH edge -> spawn a burst on the ground near the player, aimed by cursor.
        if (m.pinch && !prevPinch && cooldown === 0) {
            this._spawnBurst(ctx, m);
            cooldown = 6; // ~throttle so a held pinch doesn't machine-gun
        }
        prevPinch = m.pinch;
    },

    _spawnBurst(ctx, m) {
        if (!ctx?.spawnParticle) return;            // blessed verb — guarded
        const cam = ctx.camera;
        const cx = cam?.position?.x ?? 0;
        const cz = cam?.position?.z ?? 0;
        // Aim: cursor.x -> angle around the player, cursor.y -> distance (4..18m).
        const ang = m.cursor.x * Math.PI * 2;
        const dist = 4 + (1 - m.cursor.y) * 14;
        const wx = cx + Math.cos(ang) * dist;
        const wz = cz + Math.sin(ang) * dist;
        let wy = 8;
        if (ctx.getSurfaceY) { try { wy = ctx.getSurfaceY(wx, wz) + 1; } catch {} }
        const big = m.twoHand && m.twoHand.spread > 0.3;
        const n = big ? 40 : 18;
        for (let i = 0; i < n; i++) {
            const a = Math.random() * Math.PI * 2;
            const s = 1 + Math.random() * (big ? 5 : 3);
            ctx.spawnParticle({
                x: wx, y: wy, z: wz,
                vx: Math.cos(a) * s, vy: 2 + Math.random() * (big ? 6 : 3), vz: Math.sin(a) * s,
                ttl: 0.8 + Math.random() * 0.6, size: 0.25 + Math.random() * 0.3,
                r: 0.25, g: 0.9, b: 0.85, a: 1, gravity: 9.8,
            });
        }
    },

    stop(ctx) {
        if (this._escHandler) {
            document.removeEventListener("keydown", this._escHandler);
            this._escHandler = null;
        }
        // Release the camera (the demo is the only consumer here).
        try { window.hands?.showPreview(false); window.hands?.stop(); } catch {}
        for (const el of [overlay, hud, crosshair, backBtn]) {
            if (el?.parentNode) el.parentNode.removeChild(el);
        }
        overlay = hud = crosshair = backBtn = null;
        started = false; prevPinch = false; cooldown = 0;
        console.log("[hand_tracking] closed");
    },
};
