// FILE: media/afDecode.js -- v4193
//
// The WebCodecs half of media/afContainer.mjs: turn a packed clip into frames you can ask for by index.
// Everything that DECIDES anything -- which samples a seek needs, whether a container is well formed -- lives
// in the container; this file drives a VideoDecoder.
"use strict";

import { unpack, decodePlanFor, seekCostOf, describe } from "./afContainer.mjs";

/**
 * *** A CODEC THE BROWSER CANNOT DECODE MUST FAIL LOUDLY. ***
 *
 * Chromium's open build has no H.264 -- measured, avc1 is unsupported for both encode and decode, while vp8
 * and vp09 are supported both ways. So a clip encoded on one machine can be undecodable on another, and the
 * failure mode of not checking is a black rectangle with no error anywhere: configure() succeeds, decode()
 * queues, and nothing ever comes out. This asks first and says which codec was refused.
 */
export async function codecSupported(manifest) {
    if (typeof VideoDecoder === "undefined") return { ok: false, why: "this browser has no WebCodecs VideoDecoder" };
    const cfg = { codec: manifest.codec, codedWidth: manifest.width, codedHeight: manifest.height };
    try {
        const s = await VideoDecoder.isConfigSupported(cfg);
        return s.supported ? { ok: true } : { ok: false, why: `this browser cannot decode "${manifest.codec}"` };
    } catch (e) {
        return { ok: false, why: `this browser refused the config for "${manifest.codec}": ${e.message}` };
    }
}

export class AfPlayer {
    constructor() {
        this.container = null;
        this.decoder = null;
        this.frame = null;          // the most recently decoded VideoFrame -- owned here, closed on the next one
        this.index = -1;            // which frame `this.frame` is
        this.decodes = 0;           // samples actually fed, so a page can show what a seek cost
        this.seeks = 0;
        this.error = null;
    }

    get manifest() { return this.container ? this.container.manifest : null; }
    get frameCount() { return this.container ? this.container.samples.length : 0; }
    get summary() { return this.container ? describe(this.container) : "(no clip)"; }
    get seekCost() { return this.container ? seekCostOf(this.container.samples) : null; }

    /** Load a packed clip. Throws with a reason -- a half-loaded player is worse than none. */
    async load(bytes) {
        this.container = unpack(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes));
        const sup = await codecSupported(this.container.manifest);
        if (!sup.ok) { this.error = sup.why; throw new Error("afDecode: " + sup.why); }
        return this.container;
    }

    /** Load from a URL. */
    async loadUrl(url) {
        const r = await fetch(url);
        if (!r.ok) throw new Error(`afDecode: ${url} returned ${r.status}`);
        return this.load(new Uint8Array(await r.arrayBuffer()));
    }

    _reset() {
        try { if (this.decoder && this.decoder.state !== "closed") this.decoder.close(); } catch {}
        try { if (this._latest) this._latest.close(); } catch {}
        this.decoder = null;
        this._latest = null;
        this._pending = null;
        this.index = -1;
    }

    /**
     * Decode and return frame `index`.
     *
     * *** PLAYING FORWARD DOES NOT RE-SEEK. *** Asking for the frame after the one just decoded feeds one
     * sample and returns; only a jump rebuilds the decoder from a keyframe. Without this, scrubbing forward
     * through a GOP-15 clip would cost 8 decodes per frame on average instead of 1 -- the seek cost the
     * container reports, paid on every frame of ordinary playback.
     */
    async setFrame(index) {
        if (!this.container) throw new Error("afDecode: no clip loaded");
        const plan = decodePlanFor(this.container.samples, index);   // throws on out of range, which is the point
        const forward = this.decoder && this.decoder.state === "configured" && index === this.index + 1 && !this.container.samples[index].key;
        const feed = forward ? [index] : plan;
        if (!forward) { this._reset(); this.seeks++; }

        // *** DO NOT flush() BETWEEN FRAMES. *** flush() ENDS the decode sequence: the very next chunk must be
        // a keyframe, or WebCodecs throws "A key frame is required after configure() or flush()". Measured the
        // hard way -- the first version flushed after every setFrame, which worked for a seek and threw on the
        // second frame of ordinary forward play. So the frames are awaited through the output callback and the
        // decoder is left running; flush happens only when the decoder is torn down.
        if (!this.decoder) {
            const m = this.container.manifest;
            this._pending = null;
            this.decoder = new VideoDecoder({
                output: (f) => {
                    // keep only the newest: the plan's earlier frames are scaffolding, not the answer
                    if (this._latest) { try { this._latest.close(); } catch {} }
                    this._latest = f;
                    if (this._pending && --this._pending.want <= 0) { const r = this._pending.resolve; this._pending = null; r(); }
                },
                error: (e) => {
                    this.error = String(e && e.message || e);
                    if (this._pending) { const r = this._pending.reject; this._pending = null; r(new Error(this.error)); }
                },
            });
            this.decoder.configure({ codec: m.codec, codedWidth: m.width, codedHeight: m.height });
        }
        this._latest = null;
        const arrived = new Promise((resolve, reject) => { this._pending = { want: feed.length, resolve, reject }; });
        for (const i of feed) {
            const s = this.container.samples[i];
            this.decoder.decode(new EncodedVideoChunk({
                type: s.key ? "key" : "delta", timestamp: s.ts, data: s.data,
            }));
            this.decodes++;
        }
        await arrived;
        const out = this._latest;
        this._latest = null;
        if (this.error) throw new Error("afDecode: " + this.error);
        if (!out) throw new Error(`afDecode: the decoder produced no frame for index ${index}`);
        if (this.frame) { try { this.frame.close(); } catch {} }
        this.frame = out;
        this.index = index;
        return out;
    }

    /** Release the decoder and the frame it is holding. A VideoFrame not closed is real memory held. */
    close() {
        this._reset();
        try { if (this.frame) this.frame.close(); } catch {}
        this.frame = null;
    }
}

export { unpack, decodePlanFor, seekCostOf, describe };
