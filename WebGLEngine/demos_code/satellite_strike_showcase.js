// demos_code/satellite_strike_showcase.js
//
// Round 273 — sequenced showcase of every satellite type in the fleet.
// Starts the kaiju sandbox (so there's a city + kaiju to bombard),
// then launches each satellite type in sequence with on-screen
// narration explaining what each one does. Designed as a "demo reel"
// for the satellite system shipped across rounds 266-270.
//
// The 9 satellite types from SatelliteFleet:
//   detection — passive scanner, no damage
//   aiming    — targeting paint, no damage
//   ir        — infra-red imaging
//   uv        — UV scan
//   signal    — passive RF, applies _signalSuppressUntil debuff
//   laser     — direct beam, k.energy -= 0.35
//   emp       — stuns kaiju (_stunnedUntil), 0.15 damage
//   kinetic   — heavy impact, 0.50 damage
//   nuke      — AOE 18u radius with falloff, 0.80 damage at center
//
// The script enforces a deliberate pause between strikes so each one
// has a moment to read on screen — useful for capturing the full reel
// in a video or screen recording without satellites stepping on each
// other.

const STRIKE_SEQUENCE = [
    { type: "detection", title: "Detection Satellite",
      blurb: "Passive scan ping. No damage — just paints kaiju on the minimap." },
    { type: "aiming",    title: "Aiming Satellite",
      blurb: "Targeting laser-paint. Marks kaiju for incoming strikes." },
    { type: "ir",        title: "Infra-Red Imager",
      blurb: "Heat signature pass. No damage. Useful at night." },
    { type: "uv",        title: "UV Scan",
      blurb: "UV imaging sweep. Reveals certain kaiju kinds." },
    { type: "signal",    title: "Signal Jammer",
      blurb: "RF suppression. Halves kaiju attack output for 6 seconds." },
    { type: "laser",     title: "Laser Strike",
      blurb: "Direct-energy weapon. 0.35 damage on a single target." },
    { type: "emp",       title: "EMP Burst",
      blurb: "Stuns kaiju for 3.5s. They stop attacking entirely." },
    { type: "kinetic",   title: "Kinetic Impactor",
      blurb: "Tungsten rod from orbit. 0.50 damage, very large kaiju too." },
    { type: "nuke",      title: "Tactical Nuke",
      blurb: "Area-of-effect 18u radius. 0.80 at center, falls off." },
];

const STRIKE_GAP_MS = 4200;   // pacing between strikes
let _running = false;
let _scheduleTimer = 0;
let _idx = 0;
let _hud = null;
let _origRoute = false;

function _makeHud() {
    const h = document.createElement("div");
    h.className = "demo-overlay";
    Object.assign(h.style, {
        position: "fixed", left: "50%", bottom: "40px",
        transform: "translateX(-50%)",
        zIndex: "9120",
        padding: "16px 22px",
        background: "rgba(8, 14, 22, 0.94)",
        border: "1px solid #f84",
        borderRadius: "6px",
        color: "#dfe",
        fontFamily: "monospace",
        boxShadow: "0 4px 32px rgba(255,128,68,0.3)",
        textAlign: "center",
        minWidth: "420px",
    });
    h.innerHTML = `
        <div id="sss-counter" style="color:#888; font-size:11px; margin-bottom:6px;">— / —</div>
        <div id="sss-title"   style="color:#fc8; font-weight:bold; font-size:18px; letter-spacing:2px; margin-bottom:4px;">
            SATELLITE STRIKE SHOWCASE
        </div>
        <div id="sss-blurb"   style="color:#bcd; font-size:13px; line-height:1.4;">
            Initialising kaiju sandbox...
        </div>
        <div style="margin-top:10px; display:flex; gap:6px; justify-content:center;">
            <button id="sss-skip" style="
                padding:5px 12px;
                background:#1a3550; color:#dfe;
                border:1px solid #4af; border-radius:3px;
                font-family:monospace; font-size:11px; cursor:pointer;
            ">SKIP ▶</button>
            <button id="sss-restart" style="
                padding:5px 12px;
                background:#2a3550; color:#dfe;
                border:1px solid #4af; border-radius:3px;
                font-family:monospace; font-size:11px; cursor:pointer;
            ">RESTART ↺</button>
            <button id="sss-close" style="
                padding:5px 12px;
                background:#502020; color:#fcc;
                border:1px solid #944; border-radius:3px;
                font-family:monospace; font-size:11px; cursor:pointer;
            ">✕ EXIT</button>
        </div>
    `;
    document.body.appendChild(h);
    return h;
}

function _showStrike(strike, idx) {
    if (!_hud) return;
    _hud.querySelector("#sss-counter").textContent = `${idx + 1} / ${STRIKE_SEQUENCE.length}`;
    _hud.querySelector("#sss-title").textContent = strike.title.toUpperCase();
    _hud.querySelector("#sss-blurb").textContent = strike.blurb;
}

function _runNext(ctx) {
    if (!_running) return;
    if (_idx >= STRIKE_SEQUENCE.length) {
        // Finished — final state
        if (_hud) {
            _hud.querySelector("#sss-counter").textContent = "complete";
            _hud.querySelector("#sss-title").textContent   = "FULL FLEET REEL COMPLETE";
            _hud.querySelector("#sss-blurb").textContent   = "All 9 satellite types demonstrated. Click RESTART to loop or EXIT.";
        }
        return;
    }
    const strike = STRIKE_SEQUENCE[_idx++];
    _showStrike(strike, _idx - 1);
    // Fire the satellite
    try {
        window.satellites?.launch?.(strike.type);
    } catch (e) {
        console.warn("[sat_showcase] launch failed:", e);
    }
    // Snark commentary via kpop if available — fires a voiced line
    // explaining what the satellite is doing. Wrapped in try because
    // kpop being disabled is a normal state and we don't want to abort
    // the showcase if it fails.
    if (ctx.kpop?.speak) {
        ctx.kpop.speak({
            Voice: "M2",
            Text: strike.title + ". " + strike.blurb,
        }).catch(() => {});
    }
    _scheduleTimer = setTimeout(() => _runNext(ctx), STRIKE_GAP_MS);
}

export default {
    id:    "satellite_strike_showcase",
    label: "SATELLITE STRIKE SHOWCASE",
    hint:  "Demos all 9 satellite types in sequence with narration",
    controls: [
        "Auto-plays — sit back and watch",
        "SKIP — jump to next strike immediately",
        "RESTART — start the sequence over",
        "EXIT — close the demo + leave the kaiju sandbox running",
    ],

    async start(ctx) {
        if (_running) return;
        _running = true;
        _idx = 0;
        _hud = _makeHud();
        ctx._demo = this;

        // Persist the user's original kpop route, then force browser
        // TTS for narration so it doesn't clash with whatever the
        // sandbox's own ambient narration does on the PowerShell side.
        _origRoute = !!(ctx.kpop?._useBrowserTTS);

        // Start the kaiju sandbox if it isn't already up. We need kaiju
        // for the satellites to target — without targets the strikes
        // are visual-only and not as compelling.
        try {
            if (!window.kaijuSandbox?.active?.()) {
                window.kaijuSandbox?.start?.({});
                // Give the sandbox a tick to spawn its city + kaiju
                await new Promise(r => setTimeout(r, 1500));
            }
        } catch (e) {
            console.warn("[sat_showcase] sandbox start failed:", e);
        }

        // Wire button handlers (deferred to here so ctx is in scope)
        _hud.querySelector("#sss-skip").addEventListener("click", () => {
            if (_scheduleTimer) { clearTimeout(_scheduleTimer); _scheduleTimer = 0; }
            _runNext(ctx);
        });
        _hud.querySelector("#sss-restart").addEventListener("click", () => {
            if (_scheduleTimer) { clearTimeout(_scheduleTimer); _scheduleTimer = 0; }
            _idx = 0;
            _runNext(ctx);
        });
        _hud.querySelector("#sss-close").addEventListener("click", () => {
            if (this.stop) this.stop(ctx);
        });

        // Give the user 2 seconds to see the HUD before the first
        // strike — otherwise the visual is gone before they can read
        // it.
        _hud.querySelector("#sss-blurb").textContent = "Beginning sequence...";
        _scheduleTimer = setTimeout(() => _runNext(ctx), 2000);
        console.log("[sat_showcase] started — 9 strikes in sequence, ~4s apart");
    },

    stop(ctx) {
        if (!_running) return;
        _running = false;
        if (_scheduleTimer) { clearTimeout(_scheduleTimer); _scheduleTimer = 0; }
        if (_hud) { _hud.remove(); _hud = null; }
        // Note: we do NOT stop the sandbox itself — the user might want
        // to keep playing in it after the demo. They can stop it via
        // window.kaijuSandbox.stop() if they want.
        try { ctx.kpop?.useBrowser?.(_origRoute); } catch {}
        console.log("[sat_showcase] stopped");
    },

    tick() { /* timer-driven */ },
};
