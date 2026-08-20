// FILE: ai/PalChat.js
// Round 100 — Ollama-driven M1↔M2 dialogue generator
//
// Wraps OllamaClient.generate to produce short two-line exchanges
// between M1 (a thoughtful person) and M2 (a small dog). Each line is
// then spoken via kpop.speak (System.Speech on the PowerShell side).
// Subscribed avatars react to onLine() events to animate the speaking
// character.
//
// This replaces the canned dialogue array in KPopPalChat.psm1
// v3/KPopPal/ — same M1/M2 framing, but now responsive to whatever
// engine context the caller passes in. The PowerShell side just
// handles speech synthesis; LLM and orchestration are browser-side.
//
// Usage:
//
//   const palChat = new PalChat({ ollama, kpop, onLine });
//   palChat.setEnabled(true);
//   await palChat.generate("Mascot just finished rendering in 3D.");
//   // → Ollama produces something like:
//   //   M1: "The new mascot looks great in three dimensions."
//   //   M2: "Woof! It's so round, I want to chase it!"
//   // → Each line speaks in its own voice; onLine fires twice so
//   //   the right avatar can animate.

export class PalChat {
    constructor({ ollama, kpop, onLine } = {}) {
        this.ollama  = ollama  ?? null;
        this.kpop    = kpop    ?? null;
        this.onLine  = onLine  ?? (() => {});
        this._enabled = false;
        // Keep a rolling history so consecutive exchanges feel coherent.
        // Capped — old context just falls off the back.
        this.history = [];
        this.maxHistory = 6;
        // Per-call cooldown to prevent spamming Ollama if many events
        // fire in quick succession.
        this._lastGenMs = 0;
        this.minIntervalMs = 4000;
        // Single in-flight guard. If a previous generate is still
        // running when a new event fires, the new request is dropped.
        this._inFlight = false;
    }

    setEnabled(on) {
        this._enabled = !!on;
        if (this._enabled) {
            console.log("[palchat] enabled — engine events will now generate M1↔M2 dialogue");
        }
    }

    isEnabled() { return this._enabled; }

    // Main entry point — generate one exchange from a context string,
    // emit onLine events for each character, and speak both via kpop.
    // Returns { m1, m2 } on success, null on skip / failure.
    async generate(context) {
        if (!this._enabled) return null;
        if (!this.ollama)   return null;
        if (this._inFlight) return null;
        const now = performance.now();
        if (now - this._lastGenMs < this.minIntervalMs) return null;
        this._inFlight = true;
        this._lastGenMs = now;

        try {
            const prompt = this._buildPrompt(context);
            let response;
            try {
                response = await this.ollama.generate(prompt, { max_tokens: 100 });
            } catch (e) {
                console.warn("[palchat] ollama generate failed:", e?.message ?? e);
                return null;
            }
            const text = typeof response === "string" ? response : (response?.response ?? "");
            const parsed = this._parseDialogue(text);
            if (!parsed.m1 || !parsed.m2) {
                console.warn("[palchat] couldn't parse M1/M2 lines from:", text);
                return null;
            }

            this.history.push({ context, m1: parsed.m1, m2: parsed.m2 });
            if (this.history.length > this.maxHistory) this.history.shift();

            // Emit + speak M1 first
            try { this.onLine("M1", parsed.m1); } catch (e) { console.warn("[palchat] onLine M1 threw:", e); }
            if (this.kpop?.isEnabled?.()) {
                this.kpop.speak({ Voice: "M1", Text: parsed.m1 });
            }

            // Estimate M1's speaking duration and wait before M2 so
            // the dog responds AFTER the person speaks. Rough heuristic:
            // ~3 chars per 100ms at default rate, plus a 400ms beat.
            const m1Duration = Math.min(6000, parsed.m1.length * 33 + 400);
            await new Promise(r => setTimeout(r, m1Duration));

            try { this.onLine("M2", parsed.m2); } catch (e) { console.warn("[palchat] onLine M2 threw:", e); }
            if (this.kpop?.isEnabled?.()) {
                this.kpop.speak({ Voice: "M2", Text: parsed.m2 });
            }
            return parsed;
        } finally {
            this._inFlight = false;
        }
    }

    // ---- prompt + parsing ---------------------------------------------

    _buildPrompt(context) {
        // Short, persona-driven prompt with strict format constraints.
        // No commentary, no JSON, no "AI:" prefix — just two labelled
        // lines that we can regex-parse cheaply.
        const recent = this.history.slice(-3)
            .map(h => `M1: ${h.m1}\nM2: ${h.m2}`)
            .join("\n\n");
        const recentBlock = recent ? `Recent exchanges:\n${recent}\n\n` : "";

        return `You are scripting two characters chatting briefly.
M1 is a thoughtful person who observes things calmly.
M2 is M1's small dog who responds with enthusiasm and dog-like instincts (sniffing, wagging, barking, chasing).

${recentBlock}New context: ${context}

Write EXACTLY two short lines. Each line under 15 words. No commentary.
Format strictly:
M1: <one line>
M2: <one line>`;
    }

    _parseDialogue(text) {
        if (!text || typeof text !== "string") return { m1: null, m2: null };
        // Strip code fences if the model added them
        let t = text.replace(/```[a-z]*\n?/gi, "").trim();
        // Greedy but anchored — accept M1:/M1./M1- as prefixes
        const m1Match = t.match(/M1\s*[:.\-]\s*(.+?)(?=\n+\s*M2|$)/is);
        const m2Match = t.match(/M2\s*[:.\-]\s*(.+?)(?=\n+\s*M1|$)/is);
        let m1 = m1Match?.[1]?.trim() ?? null;
        let m2 = m2Match?.[1]?.trim() ?? null;
        // Single-line cleanups
        if (m1) m1 = m1.replace(/\s+/g, " ").trim();
        if (m2) m2 = m2.replace(/\s+/g, " ").trim();
        // Strip trailing model-y artifacts (parentheticals, "(end)" etc.)
        if (m1) m1 = m1.replace(/\s*\([^)]*\)\s*$/, "").trim();
        if (m2) m2 = m2.replace(/\s*\([^)]*\)\s*$/, "").trim();
        return { m1, m2 };
    }
}
