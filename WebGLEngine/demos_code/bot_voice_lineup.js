// demos_code/bot_voice_lineup.js
//
// Round 273 — spawns one of every BOT_KIND in a semicircle facing the
// player and cycles through them, speaking their spawn/engage/death
// lines in their distinct VoiceProfile. Demonstrates the per-NPC
// voice variations shipped in round 272.
//
// Each kind has a {tag, pitch, rate} voice spec on its BOT_KINDS
// entry. The BrowserTTS route forwards those to window.speechSynthesis
// so each bot speaks with a recognizable timbre — heavy is gruff
// (pitch 0.75), miniboss is theatrical (0.65), turret is robotic
// (1.4), plane is a crisp pilot (1.1 on the M1 voice), and so on.
//
// The demo FORCES the browser-TTS route on entry so the voice
// profiles actually take effect (they're a no-op on the PowerShell
// route — System.Speech doesn't accept pitch/rate from our pipe
// payload). On exit, the previous route is restored.
//
// Controls:
//   * PLAY ALL — cycle through every bot in sequence
//   * Click a label — speak that bot's lines once
//   * SHIFT-click — speak only the spawn line (skips engage/death)

const KINDS = [
    "bot_grunt",
    "bot_sniper",
    "bot_heavy",
    "bot_miniboss",
    "bot_turret",
    "bot_tank",
    "bot_plane",
];

const SEMICIRCLE_RADIUS = 6;
const SEMICIRCLE_FORWARD = -10;   // 10 units in front of the player

let _running = false;
let _hud = null;
let _origRoute = false;
let _spawned = [];       // ids of bots we spawned (so stop() can despawn them)
let _labels = [];        // DOM label elements above each bot
let _ctx = null;
let _busy = false;       // serialize speech so they don't talk over each other
let _autoTimer = 0;

function _makeHud() {
    const h = document.createElement("div");
    h.className = "demo-overlay";
    Object.assign(h.style, {
        position: "fixed", left: "16px", top: "80px",
        zIndex: "9120",
        padding: "12px 14px",
        background: "rgba(8, 14, 22, 0.94)",
        border: "1px solid #fc8",
        borderRadius: "6px",
        color: "#dfe",
        fontFamily: "monospace", fontSize: "11px",
        width: "260px",
        boxShadow: "0 4px 20px rgba(0,0,0,0.6)",
    });
    h.innerHTML = `
        <div style="color:#fc8; font-weight:bold; font-size:11px; letter-spacing:1px; margin-bottom:6px;">
            BOT VOICE LINEUP
        </div>
        <div style="color:#bbb; font-size:10px; line-height:1.4; margin-bottom:8px;">
            7 bot kinds in a semicircle, each with its own VoiceProfile.
            Browser TTS route required — auto-enabled.
        </div>
        <div id="bvl-current" style="
            padding:6px 8px; background:rgba(0,0,0,0.4);
            border-left:3px solid #fc8;
            font-size:11px; min-height:48px; margin-bottom:8px;
        ">Click PLAY ALL to begin.</div>
        <div style="display:flex; gap:6px;">
            <button id="bvl-play" style="
                flex:1; padding:6px;
                background:#1a3550; color:#dfe;
                border:1px solid #4af; border-radius:3px;
                font-family:monospace; cursor:pointer;
            ">PLAY ALL ▶</button>
            <button id="bvl-close" style="
                padding:6px 10px;
                background:#502020; color:#fcc;
                border:1px solid #944; border-radius:3px;
                font-family:monospace; cursor:pointer;
            ">✕</button>
        </div>
    `;
    document.body.appendChild(h);
    return h;
}

function _makeLabel(kind, color, x, z) {
    const lbl = document.createElement("div");
    Object.assign(lbl.style, {
        position: "fixed",
        zIndex: "9119",
        padding: "3px 8px",
        background: "rgba(0,0,0,0.78)",
        border: `1px solid rgb(${Math.round(color[0]*255)},${Math.round(color[1]*255)},${Math.round(color[2]*255)})`,
        borderRadius: "3px",
        color: "#dfe",
        fontFamily: "monospace", fontSize: "10px",
        pointerEvents: "auto",
        cursor: "pointer",
        userSelect: "none",
        transform: "translate(-50%, -50%)",
        whiteSpace: "nowrap",
    });
    lbl.textContent = kind.replace(/^bot_/, "").toUpperCase();
    lbl.dataset.kind = kind;
    lbl.dataset.worldX = String(x);
    lbl.dataset.worldZ = String(z);
    document.body.appendChild(lbl);
    return lbl;
}

// Project world coords to screen using the engine's camera.
// We use the cheap approach: read camera.position + yaw and approximate
// the screen position with a perspective approximation. This is just
// a label hint, not a precise overlay, so it doesn't need to be exact.
function _updateLabels() {
    const cam = window._camera || window.camera;
    if (!cam?.position) return;
    const yaw = cam.yaw ?? 0;
    const pitch = cam.pitch ?? 0;
    const cosY = Math.cos(yaw), sinY = Math.sin(yaw);
    for (const lbl of _labels) {
        const wx = parseFloat(lbl.dataset.worldX);
        const wz = parseFloat(lbl.dataset.worldZ);
        // World → camera-local (XZ rotation by -yaw)
        const dx = wx - cam.position.x;
        const dz = wz - cam.position.z;
        // Apply -yaw rotation. Camera yaw=0 means looking down -Z.
        const cx =  dx * cosY - dz * sinY;
        const cz = -dx * sinY - dz * cosY;     // forward axis (positive = ahead)
        if (cz < 1) {
            // Behind the camera — hide
            lbl.style.display = "none";
            continue;
        }
        // Simple perspective: screen x ∝ cx/cz, scaled by viewport half-width
        const fov = Math.PI / 3;
        const halfW = window.innerWidth / 2;
        const halfH = window.innerHeight / 2;
        const focalLen = halfW / Math.tan(fov / 2);
        const sx = halfW + (cx / cz) * focalLen;
        const sy = halfH - (1.6 / cz) * focalLen;     // 1.6u above ground; ignores pitch
        lbl.style.display = "block";
        lbl.style.left = `${sx}px`;
        lbl.style.top  = `${sy}px`;
    }
}

async function _speakBot(kind, spec, lineKey) {
    if (!_ctx?.kpop?.speak) return;
    const text = spec.speech?.[lineKey];
    if (!text) return;
    const portrait = { name: kind.replace(/^bot_/, ""), color: spec.color };
    const profile = spec.voice ?? null;
    if (_hud) {
        _hud.querySelector("#bvl-current").innerHTML =
            `<div style="color:#fc8; font-weight:bold;">${kind.replace(/^bot_/, "").toUpperCase()}</div>` +
            `<div style="color:#bbb; font-size:9px; margin-top:2px;">` +
                `voice: ${profile?.tag ?? "M2"} ` +
                `pitch=${profile?.pitch ?? 1.0} ` +
                `rate=${profile?.rate ?? 1.0}` +
            `</div>` +
            `<div style="margin-top:4px;">"${text}"</div>`;
    }
    try {
        await _ctx.kpop.speak({
            Voice: profile?.tag ?? "M2",
            Text: text,
            Portrait: portrait,
            VoiceProfile: profile,
        });
    } catch (e) {
        console.warn(`[bot_voice_lineup] speak ${kind} ${lineKey} failed:`, e);
    }
}

async function _playOne(kind, spec, lines = ["spawn", "engage", "death"]) {
    if (_busy) return;
    _busy = true;
    try {
        for (const k of lines) {
            await _speakBot(kind, spec, k);
            // Estimated breath between lines — long enough that BrowserTTS
            // has time to finish each utterance before the next starts.
            const text = spec.speech?.[k] || "";
            await new Promise((r) => setTimeout(r, text.length * 65 + 600));
        }
    } finally {
        _busy = false;
    }
}

async function _playAll(getSpec) {
    for (let i = 0; i < KINDS.length; i++) {
        if (!_running) return;
        const kind = KINDS[i];
        const spec = getSpec(kind);
        if (!spec) continue;
        // Highlight the label briefly while this kind talks
        const lbl = _labels[i];
        if (lbl) lbl.style.boxShadow = "0 0 12px #fc8";
        await _playOne(kind, spec);
        if (lbl) lbl.style.boxShadow = "";
    }
    if (_hud) {
        _hud.querySelector("#bvl-current").innerHTML =
            `<div style="color:#bcd;">All ${KINDS.length} voices played.</div>` +
            `<div style="color:#888; font-size:10px; margin-top:2px;">Click a label to replay one.</div>`;
    }
}

export default {
    id:    "bot_voice_lineup",
    label: "BOT VOICE LINEUP",
    hint:  "7 bot kinds in a semicircle, each speaks with its own voice profile",
    controls: [
        "PLAY ALL — cycle through all 7 bots",
        "Click a label — replay that bot's lines",
        "SHIFT-click a label — spawn line only",
        "Requires Browser TTS (auto-enabled on start)",
    ],

    async start(ctx) {
        if (_running) return;
        _running = true;
        _ctx = ctx;
        _spawned = [];
        _labels = [];
        ctx._demo = this;

        // Force Browser TTS — that's the only route where VoiceProfile
        // pitch/rate matters. Save original so we can restore on exit.
        _origRoute = !!(ctx.kpop?._useBrowserTTS);
        try { ctx.kpop?.useBrowser?.(true); } catch {}

        // Position bots in a semicircle in front of the player.
        const cam = window._camera || window.camera;
        const px = cam?.position?.x ?? 0;
        const pz = cam?.position?.z ?? 0;
        const yaw = cam?.yaw ?? 0;
        // Place center of the semicircle SEMICIRCLE_FORWARD units AHEAD
        // of the player. "Ahead" with yaw=0 = -Z direction.
        const ahead = SEMICIRCLE_FORWARD;
        const centerX = px + Math.sin(yaw) * ahead;
        const centerZ = pz - Math.cos(yaw) * ahead;

        const bots = window.bots;
        if (!bots?.spawn) {
            console.warn("[bot_voice_lineup] window.bots.spawn unavailable; demo will use labels only");
        }
        // Get the BotManager spec table — used to read voice profiles
        // for the speech calls. window.bots.specFor was added in r273.
        const getSpec = (kind) => window.bots?.specFor?.(kind) ?? null;

        // Spread the 7 kinds across a 180° arc in front of the player
        for (let i = 0; i < KINDS.length; i++) {
            const kind = KINDS[i];
            const t = (KINDS.length === 1) ? 0.5 : i / (KINDS.length - 1);
            const angleFromCenter = (t - 0.5) * Math.PI;   // -90° to +90°
            const bx = centerX + Math.sin(yaw + angleFromCenter) * SEMICIRCLE_RADIUS;
            const bz = centerZ - Math.cos(yaw + angleFromCenter) * SEMICIRCLE_RADIUS;
            let spec = getSpec(kind);
            // Fall back to spawning + reading color from bot itself
            if (bots?.spawn) {
                const bot = bots.spawn({ x: bx, z: bz, kind });
                if (bot?.id != null) _spawned.push(bot.id);
                if (!spec && bot?.spec) spec = bot.spec;
            }
            const color = spec?.color || [1, 1, 1];
            const lbl = _makeLabel(kind, color, bx, bz);
            lbl.addEventListener("click", (e) => {
                if (_busy) return;
                const lines = e.shiftKey ? ["spawn"] : ["spawn", "engage", "death"];
                _playOne(kind, spec, lines);
            });
            _labels.push(lbl);
        }

        _hud = _makeHud();
        _hud.querySelector("#bvl-play").addEventListener("click", () => {
            if (_busy) return;
            _playAll(getSpec);
        });
        _hud.querySelector("#bvl-close").addEventListener("click", () => {
            if (this.stop) this.stop(ctx);
        });

        console.log(`[bot_voice_lineup] started — ${_spawned.length} bots spawned`);
    },

    stop(ctx) {
        if (!_running) return;
        _running = false;
        if (_autoTimer) { clearTimeout(_autoTimer); _autoTimer = 0; }
        // Despawn the bots we created
        const bots = window.bots;
        if (bots?.despawn) {
            for (const id of _spawned) {
                try { bots.despawn(id); } catch {}
            }
        }
        _spawned = [];
        for (const lbl of _labels) lbl.remove();
        _labels = [];
        if (_hud) { _hud.remove(); _hud = null; }
        // Restore previous route
        try { ctx.kpop?.useBrowser?.(_origRoute); } catch {}
        _ctx = null;
        console.log("[bot_voice_lineup] stopped");
    },

    tick(ctx, dt) {
        // Per-frame: keep label positions in sync with camera movement.
        _updateLabels();
    },
};
