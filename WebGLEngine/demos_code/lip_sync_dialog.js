// demos_code/lip_sync_dialog.js
//
// Round 273 — showcases the phoneme-curve lip-sync pipeline shipped in
// rounds 271-272. Plays a curated M1↔M2 dialogue with deliberately
// varied lines (vowel-heavy, plosive-heavy, fast cadence, slow drawl)
// so the audience can see the phoneme curve articulate distinct
// shapes per line. A floating panel offers route toggles:
//
//   * PowerShell — System.Speech via the bridge (default route).
//                  Mouth animation runs from the text-derived phoneme
//                  curve. The audio plays from your OS speakers, NOT
//                  through the browser tab.
//
//   * Browser    — window.speechSynthesis. Audio plays in the tab.
//                  Mouth animation runs from the phoneme curve AND
//                  re-anchors on each word-boundary event so the
//                  cadence matches the actual speech engine.
//
//   * WAV (real) — PowerShell writes a WAV file, the browser fetches
//                  and plays it, an AnalyserNode reads its amplitude
//                  per frame. Mouth follows the actual audio envelope.
//                  Path C of the audio-lipsync stack.
//
// Controls:
//   * NEXT LINE button — speak the next line in the script
//   * Auto button      — auto-play the whole script with pacing
//   * Route radios     — pick which path to use
//
// Notes:
//   * The "Browser" route requires that you've enabled
//     window.speechSynthesis voices (visit a Chrome page first to
//     prime them; first-load Chrome won't have voices ready).
//   * The "WAV (real)" route requires the PowerShell listener to be
//     running so the bridge can spawn powershell.exe and write WAVs.
//     If you see a 503 the bridge isn't reachable.

let panel = null;
let _running = false;
let _autoTimer = 0;
let _route = "powershell";   // "powershell" | "browser" | "wav"
let _lineIdx = 0;
let _autoMode = false;

// Curated dialogue. Each line picks word patterns that drive distinct
// mouth shapes — useful for SEEING the phoneme curve animate, not
// just hearing it. Designed so the visualization is obviously
// different from a generic sine wave.
const SCRIPT = [
    // Vowel-heavy line: wide-open mouth shapes dominate
    { voice: "M1", text: "Oh, hi! How are you today?", note: "vowel-heavy: a/o/i/u carry the shape" },
    // Plosive-heavy reply: sharp snap-shut transitions
    { voice: "M2", text: "Pretty good. Big day, packed schedule.", note: "plosive-heavy: p/b/d/k snap shut" },
    // Bilabial cluster: m/b/p sequences — repeated lip closures
    { voice: "M1", text: "I made my mom a peanut butter sandwich.", note: "bilabial cluster — repeated lip closures" },
    // Fricative-heavy: narrow apertures, hissing shapes
    { voice: "M2", text: "Surely she found that pretty fancy.", note: "fricatives: s/f/sh sit narrow" },
    // Fast cadence test — short words
    { voice: "M1", text: "Yes! Quick, fun, easy, done.", note: "fast cadence — short words" },
    // Slow drawl — long vowels
    { voice: "M2", text: "Yeeeah. Cooool. Awesome.", note: "slow drawl — extended vowels" },
    // Mixed sentence — the realistic case
    { voice: "M1", text: "Anyway, want to grab lunch later?", note: "mixed natural sentence" },
    { voice: "M2", text: "Absolutely. Pick a spot, I'll be there.", note: "natural reply" },
];

function _makePanel(ctx) {
    const p = document.createElement("div");
    p.className = "demo-overlay";
    Object.assign(p.style, {
        position: "fixed", left: "16px", bottom: "16px",
        zIndex: "9100",
        padding: "12px 14px",
        background: "rgba(8, 14, 22, 0.94)",
        border: "1px solid #4af",
        borderRadius: "6px",
        color: "#dfe",
        fontFamily: "monospace", fontSize: "12px",
        width: "320px",
        boxShadow: "0 4px 20px rgba(0,0,0,0.6)",
    });
    p.innerHTML = `
        <div style="color:#9cf; font-weight:bold; margin-bottom:8px; font-size:11px; letter-spacing:1px;">
            LIP-SYNC DIALOG DEMO
        </div>
        <div style="margin-bottom:8px; color:#aaa; font-size:10px; line-height:1.4;">
            Three audio routes drive the same phoneme-curve mouth.
            Watch the PIP avatars articulate per character.
        </div>
        <div style="margin-bottom:10px;">
            <div style="color:#9cf; margin-bottom:4px;">ROUTE:</div>
            <label style="display:block; margin-bottom:2px; cursor:pointer;">
                <input type="radio" name="lsd-route" value="powershell" checked>
                PowerShell (default) — OS audio
            </label>
            <label style="display:block; margin-bottom:2px; cursor:pointer;">
                <input type="radio" name="lsd-route" value="browser">
                Browser TTS — tab audio + word-boundary re-anchor
            </label>
            <label style="display:block; cursor:pointer;">
                <input type="radio" name="lsd-route" value="wav">
                WAV (real) — AnalyserNode envelope
            </label>
        </div>
        <div id="lsd-line" style="
            margin-bottom:8px; padding:6px 8px;
            background:rgba(0,0,0,0.4); border-left:3px solid #4af;
            font-size:11px; min-height:32px;
        ">Click NEXT to begin.</div>
        <div id="lsd-note" style="
            margin-bottom:8px; color:#7a8; font-size:10px; font-style:italic;
        ">&nbsp;</div>
        <div style="display:flex; gap:6px;">
            <button id="lsd-next" style="
                flex:1; padding:6px;
                background:#1a3550; color:#dfe;
                border:1px solid #4af; border-radius:3px;
                font-family:monospace; cursor:pointer;
            ">NEXT LINE ▶</button>
            <button id="lsd-auto" style="
                flex:1; padding:6px;
                background:#2a3550; color:#dfe;
                border:1px solid #4af; border-radius:3px;
                font-family:monospace; cursor:pointer;
            ">AUTO ▶▶</button>
            <button id="lsd-close" style="
                padding:6px 10px;
                background:#502020; color:#fcc;
                border:1px solid #944; border-radius:3px;
                font-family:monospace; cursor:pointer;
            ">✕</button>
        </div>
    `;
    document.body.appendChild(p);

    p.querySelectorAll("input[name='lsd-route']").forEach((r) => {
        r.addEventListener("change", (e) => {
            _route = e.target.value;
            // Sync the route into kpop client when applicable. PowerShell
            // is the default; Browser flips the kpop._useBrowserTTS
            // flag; WAV bypasses kpop.speak entirely and uses the
            // window.kpop.audioLipSync console helper.
            if (_route === "browser") {
                ctx.kpop?.useBrowser?.(true);
            } else {
                ctx.kpop?.useBrowser?.(false);
            }
            console.log(`[lip_sync_dialog] route → ${_route}`);
        });
    });

    p.querySelector("#lsd-next").addEventListener("click", () => _speakNext(ctx, p));
    p.querySelector("#lsd-auto").addEventListener("click", () => {
        _autoMode = !_autoMode;
        const b = p.querySelector("#lsd-auto");
        b.textContent = _autoMode ? "AUTO ■" : "AUTO ▶▶";
        b.style.background = _autoMode ? "#3a6075" : "#2a3550";
        if (_autoMode) _speakNext(ctx, p);
    });
    p.querySelector("#lsd-close").addEventListener("click", () => {
        const demo = ctx?._demo;
        if (demo?.stop) demo.stop(ctx);
    });

    return p;
}

async function _speakNext(ctx, p) {
    if (_lineIdx >= SCRIPT.length) {
        _lineIdx = 0;          // wrap; useful for showing all routes back-to-back
    }
    const line = SCRIPT[_lineIdx++];
    p.querySelector("#lsd-line").textContent = `[${line.voice}] ${line.text}`;
    p.querySelector("#lsd-note").textContent = line.note;

    if (_route === "wav") {
        // Path C — audio amplitude tap
        if (window.kpop?.audioLipSync) {
            try { await window.kpop.audioLipSync(line.text, line.voice); }
            catch (e) { console.warn("[lip_sync_dialog] audioLipSync failed:", e); }
        } else {
            console.warn("[lip_sync_dialog] window.kpop.audioLipSync unavailable");
        }
    } else {
        // PowerShell or Browser route — both go through kpop.speak which
        // internally picks based on _useBrowserTTS. PipAvatar wrap fires
        // the mouth animation regardless.
        try { await ctx.kpop.speak({ Voice: line.voice, Text: line.text }); }
        catch (e) { console.warn("[lip_sync_dialog] speak failed:", e); }
    }

    if (_autoMode && _running) {
        // Estimate pacing ≈ 60ms/char + 800ms breath. Browser TTS will
        // typically run a bit faster than that, but the next-line timer
        // is just for visual queueing.
        const delay = line.text.length * 60 + 800;
        _autoTimer = setTimeout(() => {
            if (_running && _autoMode) _speakNext(ctx, p);
        }, delay);
    }
}

export default {
    id:    "lip_sync_dialog",
    label: "LIP-SYNC DIALOG",
    hint:  "Demos the phoneme-curve mouth across all three audio routes (PowerShell, Browser, WAV)",
    controls: [
        "NEXT LINE — speak the next scripted line",
        "AUTO — auto-play the whole script",
        "Route radios — pick PowerShell, Browser, or WAV path",
        "Watch the robot/face PIP avatar's mouth shape per character",
    ],

    start(ctx) {
        if (_running) return;
        _running = true;
        _lineIdx = 0;
        _autoMode = false;
        panel = _makePanel(ctx);
        ctx._demo = this;
        // Make sure the robot view is on so the user sees the mouth
        // animation. Robot face has the bigger SVG ellipse so it's the
        // most readable for this demo.
        try {
            window.pipAvatar?.setListenerView?.("robot");
        } catch {}
        console.log("[lip_sync_dialog] started — pick a route + click NEXT");
    },

    stop(ctx) {
        if (!_running) return;
        _running = false;
        _autoMode = false;
        if (_autoTimer) { clearTimeout(_autoTimer); _autoTimer = 0; }
        // Restore default route on exit so we don't surprise the user
        // later.
        try { ctx.kpop?.useBrowser?.(false); } catch {}
        if (panel) { panel.remove(); panel = null; }
        console.log("[lip_sync_dialog] stopped");
    },

    tick() { /* no-op — driven by buttons + timers */ },
};
