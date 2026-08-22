// =============================================================================
// FILE: /simulation/DungeonLore.js
// ROUND: 220
// =============================================================================
//
// Asks Ollama for a short atmospheric narration each time a new WAD
// dungeon is generated. Outputs go through three channels in parallel:
//
//   1. KPop /kpop/speak — TTS narration via PowerShell SAPI (M1 voice)
//   2. KPop toast — title + truncated body (so the text survives even
//      if speech is muted)
//   3. Centered fade-in/out overlay div — the player sees a 6-second
//      "intro card" effect on level start
//
// The prompt is constrained: 2 sentences, atmospheric, no rules
// numbers, no enemies named explicitly. We get a steady cadence of
// "You enter the Whispering Catacombs. Cold drafts carry the smell
// of old iron." rather than RPG flavortext that breaks the FPS pace.
//
// API:
//   const lore = new DungeonLore({ ollama, kpop });
//   const text = await lore.narrate("a small dungeon with two side rooms");
//   // text === "You enter the ... . ..."
//   lore.dispose();
//
// Internals also cache the last 8 narrations in memory so the user can
// replay them via window.lore.recent() from the console (useful for
// the documentary-recap feature in the backlog).
// =============================================================================

const LORE_PROMPT = `You are the narrator of a voxel dungeon crawler.
Given the player's description of the dungeon they are about to enter,
write exactly TWO sentences of atmospheric flavor text. Style notes:
- Address the player in second person ("You enter...", "Ahead...").
- No game mechanics (no "HP", "enemies", numbers).
- No character names. No proper nouns invented unless very evocative.
- Sensory detail (sound, smell, light, temperature) preferred.
- Output ONLY the two sentences. No prose intro, no markdown, no quotes.

Description: `;

const OVERLAY_DURATION_MS = 6000;
const OVERLAY_FADE_MS = 800;

export class DungeonLore {
    constructor({ ollama, kpop = null } = {}) {
        this.ollama = ollama;
        this.kpop = kpop;
        this._recent = [];          // last 8 { description, text, t }
        this._maxRecent = 8;
        this._overlayEl = null;
        this._overlayTimeout = null;
        this._counts = { generated: 0, spoken: 0, errors: 0 };
        this._enabled = true;
    }

    setEnabled(on) { this._enabled = !!on; }

    async narrate(description, levelNumber = null) {
        if (!this._enabled) return null;
        if (!description) return null;
        let text;
        try {
            if (this.ollama?.generate) {
                // Round 222 — pass level depth into the prompt so deeper
                // dungeons get darker, more oppressive narration.
                // Round 226 — boss levels (every 3rd) get a "champion
                // waits in the final room" hint added to the prompt.
                const interval = (typeof window !== "undefined" && window._fpsBossInterval) || 3;
                const isBossLevel = levelNumber > 0 && levelNumber % interval === 0;
                let promptBody = description;
                if (levelNumber > 1) {
                    promptBody += ` (this is dungeon level ${levelNumber}; deeper levels feel more oppressive, ancient, hostile)`;
                }
                if (isBossLevel) {
                    promptBody += ` (a CHAMPION or GUARDIAN waits in the final room — hint at its presence, but don't name it)`;
                }
                const raw = await this.ollama.generate(LORE_PROMPT + promptBody, {
                    temperature: 0.85,
                });
                text = this._sanitize(raw);
            }
        } catch (e) {
            this._counts.errors++;
            console.warn("[dungeon-lore] ollama failed:", e?.message ?? e);
        }
        // Fallback if Ollama is unavailable or returned junk
        if (!text || text.length < 8) {
            text = this._fallback(description);
        }
        this._counts.generated++;
        this._recent.unshift({ description, text, t: Date.now() });
        if (this._recent.length > this._maxRecent) this._recent.length = this._maxRecent;

        // Fire the three channels
        this._speak(text);
        this._toast(description, text);
        this._showOverlay(text);
        return text;
    }

    recent() { return this._recent.slice(); }

    last() { return this._recent[0] || null; }

    getStats() { return { ...this._counts, cached: this._recent.length }; }

    dispose() {
        this._clearOverlay();
        this._recent = [];
    }

    // ------------------------------------------------------------------

    _sanitize(raw) {
        if (!raw) return null;
        let s = String(raw).trim();
        // Strip surrounding quotes if model wrapped output
        s = s.replace(/^["'`]/, "").replace(/["'`]$/, "");
        // Strip markdown bold/italic
        s = s.replace(/\*+/g, "");
        // Strip preamble like "Here's your text:" by removing everything
        // up to and including a colon if the first line is short and ends with :
        const lines = s.split(/\n+/);
        if (lines.length > 1 && lines[0].length < 40 && lines[0].endsWith(":")) {
            s = lines.slice(1).join(" ").trim();
        }
        // Collapse whitespace
        s = s.replace(/\s+/g, " ").trim();
        // Clamp length — UX overlay can't display essays
        if (s.length > 320) s = s.slice(0, 317) + "...";
        return s;
    }

    _fallback(description) {
        // Deterministic minimal narration for when Ollama is offline
        const adjectives = ["damp", "silent", "cold", "echoing", "forgotten", "iron-scented"];
        const verbs = ["greets you", "presses in", "stretches before you", "yawns open"];
        const a = adjectives[Math.floor(Math.random() * adjectives.length)];
        const v = verbs[Math.floor(Math.random() * verbs.length)];
        const trimmedDesc = description.replace(/^(a |an |the )/i, "").trim();
        return `You step into ${trimmedDesc}. The ${a} air ${v}.`;
    }

    _speak(text) {
        if (!this.kpop?.speak) return;
        // Two sentences split — speak both, but keep total payload modest
        this.kpop.speak({ Voice: "M1", Text: text }).catch(() => {});
        this._counts.spoken++;
    }

    _toast(description, text) {
        if (!this.kpop?.info) return;
        // Truncate body for toast envelope (toasts are small)
        const body = text.length > 120 ? text.slice(0, 117) + "..." : text;
        this.kpop.info(`Entering: ${description}`, body).catch(() => {});
    }

    _showOverlay(text) {
        if (typeof document === "undefined") return;
        this._clearOverlay();
        const el = document.createElement("div");
        el.id = "dungeon-lore-overlay";
        Object.assign(el.style, {
            position: "fixed",
            left: "50%", top: "30%",
            transform: "translate(-50%, -50%)",
            maxWidth: "520px",
            minWidth: "320px",
            padding: "18px 28px",
            background: "rgba(8,8,14,0.88)",
            border: "1px solid #4a6",
            borderRadius: "6px",
            color: "#e8e8ed",
            fontFamily: "Georgia, 'Times New Roman', serif",
            fontSize: "16px",
            fontStyle: "italic",
            lineHeight: "1.55",
            textAlign: "center",
            zIndex: "9200",
            pointerEvents: "none",
            opacity: "0",
            transition: `opacity ${OVERLAY_FADE_MS}ms ease-out`,
            boxShadow: "0 0 32px rgba(80,200,160,0.18)",
        });
        el.textContent = text;
        document.body.appendChild(el);
        this._overlayEl = el;
        // Fade in
        requestAnimationFrame(() => { el.style.opacity = "1"; });
        // Fade out + remove after duration
        this._overlayTimeout = setTimeout(() => {
            if (el) el.style.opacity = "0";
            setTimeout(() => {
                if (el?.parentNode) el.parentNode.removeChild(el);
                if (this._overlayEl === el) this._overlayEl = null;
            }, OVERLAY_FADE_MS);
        }, OVERLAY_DURATION_MS - OVERLAY_FADE_MS);
    }

    _clearOverlay() {
        if (this._overlayTimeout) {
            clearTimeout(this._overlayTimeout);
            this._overlayTimeout = null;
        }
        if (this._overlayEl?.parentNode) {
            this._overlayEl.parentNode.removeChild(this._overlayEl);
        }
        this._overlayEl = null;
    }
}
