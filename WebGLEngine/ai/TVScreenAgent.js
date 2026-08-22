// FILE: ai/TVScreenAgent.js
// VERSION: v1 - PER-SCREEN NARRATIVE OBSERVER
//
// One TVScreenAgent per TV cell. Each owns:
//   * a reference to its TVScreenCamera (read-only, for proximity filter)
//   * its own NarrativeEngine (so each screen has independent history)
//   * a latest-line buffer (for the overlay caption)
//
// Civ events flow into agent.observe(evt) from main.js's bus subscription.
// The agent decides whether the event is "in its view" by checking spatial
// distance from camera position; only nearby events generate narrative for
// that screen. This is what makes the wall feel like N independent
// surveillance cameras rather than one global commentary.
//
// The agent does NOT drive the camera — main.js or external commands aim
// each TV camera. The agent just narrates whatever the camera sees.

import { NarrativeEngine } from "./NarrativeEngine.js";

const DEFAULT_VIEW_RADIUS = 40;   // squared in code: 1600

export class TVScreenAgent {
    constructor(opts = {}) {
        this.id        = opts.id;
        this.camera    = opts.camera;
        this.viewRadius = opts.viewRadius ?? DEFAULT_VIEW_RADIUS;
        this.narrative  = new NarrativeEngine();

        // Latest narrative state for the overlay caption.
        this.latest = null;          // last produced { text, intensity, timestamp, source }
        this.eventCount = 0;
        this.observedCount = 0;
        this.pendingAsync = 0;       // LLM calls in flight
        this.llmReplaced = 0;        // captions successfully upgraded to LLM
        // Round 307 — per-agent LLM cooldown. Without this, every civ
        // event triggers an LLM call per screen; with 3 screens + frequent
        // events that's 3-15 Ollama calls/sec, each one streaming tokens
        // back through the main thread and dragging frame time to 350+ms
        // (FPS 3-10). 8s cooldown caps each screen to ~7 LLM rephrases
        // per minute — plenty for narration, gentle on the GPU.
        this._lastLlmMs = 0;
        this._llmCooldownMs = 8000;
        this.llmSkipped = 0;         // count of events that bypassed LLM
    }

    // Hook this in main.js by subscribing to CivilizationEventBus once and
    // forwarding each event to every agent's observe(). The agent decides
    // internally whether to act on it.
    //
    // Flow:
    //   1. Sync interpret() — sets `latest` immediately so the caption
    //      appears within one frame of the event.
    //   2. Async interpretAsync() — fires off in the background; when
    //      the LLM responds (1–4s typical), the agent replaces
    //      `latest.text` and `latest.source` in-place. The overlay
    //      reads `captionState()` each frame and picks up the swap.
    //
    // If there's no LLM wired or Ollama is down, the async path returns
    // null and the templated text just stays.
    observe(evt) {
        this.eventCount++;
        if (!this._inView(evt)) return null;
        this.observedCount++;

        // Sync — show the templated caption right away
        const story = this.narrative.interpret([evt], this.id);
        if (!story) return null;
        this.latest = story;

        // Async — replace text with LLM rephrase when ready (best-effort).
        // Round 307 — gated by per-agent cooldown AND single-in-flight.
        // Without these, the agent fires an LLM call on every observed
        // event, generating an Ollama firehose that destroys main-thread
        // frame time. Skip silently when gated; the templated caption
        // is fine on its own.
        const now = performance.now();
        const cooldownReady = (now - this._lastLlmMs) >= this._llmCooldownMs;
        if (this.narrative.llm && cooldownReady && this.pendingAsync === 0) {
            this.pendingAsync++;
            this._lastLlmMs = now;
            this.narrative.interpretAsync([evt], this.id)
                .then((llmStory) => {
                    this.pendingAsync--;
                    if (!llmStory || !llmStory.text) return;
                    // Only replace if we still have the same `latest` object
                    // (avoids overwriting a fresher event's caption that
                    // arrived while this LLM call was inflight).
                    if (this.latest && this.latest.timestamp === story.timestamp) {
                        this.latest = {
                            ...this.latest,
                            text: llmStory.text,
                            source: "llm",
                        };
                        this.llmReplaced++;
                    }
                })
                .catch(() => { this.pendingAsync--; });
        } else if (this.narrative.llm) {
            this.llmSkipped++;
        }
        return story;
    }

    // Spatial gate: events too far from the camera don't get narrated by
    // this screen. Uses squared distance for cheap rejection. If event
    // has no coords, default to "always include" so global events still
    // get a screen voice.
    _inView(evt) {
        if (evt.x == null || evt.z == null) return true;
        const dx = evt.x - this.camera.position.x;
        const dz = evt.z - this.camera.position.z;
        const dist2 = dx * dx + dz * dz;
        return dist2 < this.viewRadius * this.viewRadius;
    }

    // Get current caption + intensity for the overlay. null = no narrative.
    captionState() {
        return this.latest;
    }

    snapshot() {
        return {
            id: this.id,
            events: this.eventCount,
            observed: this.observedCount,
            text: this.latest?.text ?? null,
            source: this.latest?.source ?? null,
            intensity: this.latest?.intensity ?? 0,
            pendingLLM: this.pendingAsync,
            llmReplaced: this.llmReplaced,
        };
    }
}
