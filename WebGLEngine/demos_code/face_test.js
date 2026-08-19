// demos_code/face_test.js
//
// Round 311 — wraps face-mirror.html as a fullscreen iframe demo. The
// page demonstrates MediaPipe face tracking driving a stylized SVG
// face: webcam preview with 478 landmarks on the left, animated SVG
// mirror on the right that responds to mouth open / blink / eyebrow
// raise / head turn. Mirrors the audio_lab.js pattern (round 219).
//
// Camera permission is only requested when the user clicks "Start
// camera" inside the demo — opening the demo itself doesn't trigger
// any prompt or webcam access.

let overlay = null;
let iframe  = null;
let backBtn = null;

export default {
    id:    "face_test",
    label: "FACE MIRROR — MEDIAPIPE WEBCAM DEMO",
    hint:  "478 face landmarks → stylized mirror. Open mouth, blink, turn head.",
    controls: [
        "Click 'Start camera' inside the demo to grant webcam permission",
        "Open your mouth — mirror's mouth opens",
        "Blink — mirror's eyes close",
        "Raise eyebrows — mirror's brows rise",
        "Turn / tilt your head — mirror tracks rotation",
        "ESC or the Back button returns to the engine",
    ],

    async start(ctx) {
        if (overlay) return;

        overlay = document.createElement("div");
        overlay.id = "face-test-overlay";
        Object.assign(overlay.style, {
            position: "fixed", left: "0", top: "0",
            width: "100vw", height: "100vh",
            zIndex: "910",
            background: "#0a0e1a",
        });
        document.body.appendChild(overlay);

        iframe = document.createElement("iframe");
        iframe.src = "./face-mirror.html";
        iframe.title = "Face Mirror";
        Object.assign(iframe.style, {
            position: "absolute",
            left: "0", top: "0",
            width: "100%", height: "100%",
            border: "0",
        });
        // Camera permission must be granted to the iframe explicitly
        iframe.setAttribute("allow", "camera");
        overlay.appendChild(iframe);

        backBtn = document.createElement("button");
        backBtn.textContent = "← BACK TO ENGINE";
        Object.assign(backBtn.style, {
            position: "absolute",
            right: "16px", top: "12px",
            zIndex: "920",
            padding: "8px 16px",
            background: "rgba(40,20,20,0.92)",
            color: "#fc8",
            border: "1px solid #f84",
            borderRadius: "4px",
            fontFamily: "monospace",
            fontSize: "12px",
            cursor: "pointer",
        });
        backBtn.addEventListener("click", () => this.stop(ctx));
        overlay.appendChild(backBtn);

        this._escHandler = (e) => {
            if (e.key === "Escape") this.stop(ctx);
        };
        document.addEventListener("keydown", this._escHandler);

        if (ctx?.kpop?.info) {
            ctx.kpop.info("Face Mirror", "MediaPipe demo · ESC or Back to return");
        }
        console.log("[face_test] opened");
    },

    tick() { /* iframe owns its own RAF */ },

    stop(ctx) {
        if (this._escHandler) {
            document.removeEventListener("keydown", this._escHandler);
            this._escHandler = null;
        }
        if (overlay?.parentNode) overlay.parentNode.removeChild(overlay);
        overlay = null;
        iframe  = null;
        backBtn = null;
        console.log("[face_test] closed");
    },
};
