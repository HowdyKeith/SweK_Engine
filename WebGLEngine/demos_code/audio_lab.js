// demos_code/audio_lab.js
//
// Round 219 — opens the standalone AudioLab.html as a fullscreen iframe
// overlay inside the engine. Demonstrates the full set of Web Audio API
// synthesis techniques from the voice-to-Ollama chat thread: oscillators,
// LFO modulation, biquad filters, convolution reverb, polyphonic
// subtractive synth (keyboard A-J + Z/X octave), and FM synthesis with
// carrier/modulator ratios.
//
// This is a self-contained demo — the AudioLab HTML/JS lives at
// /VoxelEngine/AudioLab.html (sibling of /wadmap.html, /face.html). The
// iframe pattern lets the demo own all the audio plumbing without
// touching the engine's audio bus.

let overlay = null;
let iframe = null;
let backBtn = null;

export default {
    id:    "audio_lab",
    label: "AUDIO LAB — WEB AUDIO SYNTH EXPLORER",
    hint:  "FM, additive, subtractive, granular, vector, filters, reverb, MIDI",
    controls: [
        "Tabs across the top — pick a synthesis tab",
        "A–J on keyboard = play notes (in the Subtractive Synth tab)",
        "Z / X = octave down / up",
        "Mic tab requires browser permission",
        "ESC or the Back button returns to the engine",
    ],

    async start(ctx) {
        if (overlay) return;

        overlay = document.createElement("div");
        overlay.id = "audio-lab-overlay";
        Object.assign(overlay.style, {
            position: "fixed", left: "0", top: "0",
            width: "100vw", height: "100vh",
            zIndex: "910",
            background: "#0a0a14",
        });
        document.body.appendChild(overlay);

        iframe = document.createElement("iframe");
        iframe.src = "./AudioLab.html";
        iframe.title = "Audio Lab";
        Object.assign(iframe.style, {
            position: "absolute",
            left: "0", top: "0",
            width: "100%", height: "100%",
            border: "0",
        });
        // sandbox attribute relaxes CORS-ish hassles for same-origin sibling
        iframe.setAttribute("allow", "microphone");
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

        // ESC handler to close
        this._escHandler = (e) => {
            if (e.key === "Escape") this.stop(ctx);
        };
        document.addEventListener("keydown", this._escHandler);

        if (ctx?.kpop?.info) {
            ctx.kpop.info("Audio Lab", "Synthesis explorer · ESC or Back to return");
        }
        console.log("[audio_lab] opened");
    },

    tick() { /* iframe owns its own RAF; no main-thread tick needed */ },

    stop(ctx) {
        if (this._escHandler) {
            document.removeEventListener("keydown", this._escHandler);
            this._escHandler = null;
        }
        if (overlay?.parentNode) overlay.parentNode.removeChild(overlay);
        overlay = null;
        iframe = null;
        backBtn = null;
        console.log("[audio_lab] closed");
    },
};
