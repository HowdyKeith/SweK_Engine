// multiplayer/frameStreamer.js
//
// Captures the engine's main canvas at a configurable rate, downsamples
// it to a small RGB grid, and POSTs the raw bytes to the bridge server.
// The Excel commander view pulls these frames and paints them as cell
// colors in a worksheet — literal "render a frame into a sheet."
//
// Architecture:
//   * Auto-finds the largest <canvas> on the page (the engine's main
//     rendering surface). Overlay/UI canvases are smaller and excluded.
//   * Captures inside requestAnimationFrame so we read the canvas
//     *before* WebGL's compositing clears the drawing buffer (which
//     would otherwise yield blank frames when preserveDrawingBuffer is
//     false, the WebGL default).
//   * Downsamples via a 2D canvas drawImage (bilinear), gets RGBA via
//     getImageData, strips alpha to RGB, POSTs as octet-stream.
//   * Self-throttles: if a POST is in flight, the next capture is
//     skipped so we don't queue up requests.
//
// Usage:
//   import { FrameStreamer } from "../multiplayer/frameStreamer.js";
//   const streamer = new FrameStreamer({
//       targetWidth: 48,
//       targetHeight: 36,
//       fps: 2,
//       source: "Player_42",
//   });
//   streamer.start();
//   // ...later
//   streamer.stop();

const DEFAULT_FPS    = 2;
const DEFAULT_W      = 48;
const DEFAULT_H      = 36;
const DEFAULT_BRIDGE = "http://localhost:8787";

export class FrameStreamer {
    constructor(opts = {}) {
        this.targetWidth  = Math.max(8, Math.min(128, opts.targetWidth  ?? DEFAULT_W));
        this.targetHeight = Math.max(6, Math.min(96,  opts.targetHeight ?? DEFAULT_H));
        this.fps          = Math.max(0.5, Math.min(10, opts.fps ?? DEFAULT_FPS));
        this.bridgeUrl    = opts.bridgeUrl ?? DEFAULT_BRIDGE;
        this.source       = String(opts.source ?? "webgl_streamer").slice(0, 32);

        this._running = false;
        this._sending = false;
        this._tickHandle = null;
        this._lastCaptureAt = 0;
        this._offscreen = null;
        this._stats = { framesSent: 0, framesSkipped: 0, errors: 0, lastError: null };
    }

    start() {
        if (this._running) return;
        this._running = true;
        this._offscreen = document.createElement("canvas");
        this._offscreen.width  = this.targetWidth;
        this._offscreen.height = this.targetHeight;
        this._loop();
        console.log(`[FrameStreamer] start ${this.targetWidth}×${this.targetHeight} @ ${this.fps}fps → ${this.bridgeUrl}`);
    }

    stop() {
        if (!this._running) return;
        this._running = false;
        if (this._tickHandle != null) {
            cancelAnimationFrame(this._tickHandle);
            this._tickHandle = null;
        }
        console.log("[FrameStreamer] stop", this._stats);
    }

    stats() { return { ...this._stats }; }

    // Find the engine's main render canvas. Picks the largest <canvas>
    // by pixel area so demo overlays and UI canvases (which are
    // smaller) don't get picked.
    _findEngineCanvas() {
        const all = document.querySelectorAll("canvas");
        let best = null, bestArea = 0;
        for (const c of all) {
            const area = (c.width || 1) * (c.height || 1);
            if (area > bestArea) { best = c; bestArea = area; }
        }
        return best;
    }

    _loop() {
        if (!this._running) return;
        const intervalMs = 1000 / this.fps;
        const now = performance.now();
        const due = now - this._lastCaptureAt >= intervalMs;
        if (due && !this._sending) {
            this._lastCaptureAt = now;
            this._captureAndSend();
        }
        this._tickHandle = requestAnimationFrame(() => this._loop());
    }

    _captureAndSend() {
        const src = this._findEngineCanvas();
        if (!src || src.width === 0 || src.height === 0) {
            this._stats.framesSkipped++;
            return;
        }
        // Downsample via 2D drawImage. Must run inside rAF (which
        // _loop guarantees) so the WebGL drawing buffer is still
        // populated before compositing clears it.
        try {
            const ctx = this._offscreen.getContext("2d", { willReadFrequently: true });
            ctx.drawImage(src, 0, 0, this.targetWidth, this.targetHeight);
            const img = ctx.getImageData(0, 0, this.targetWidth, this.targetHeight);
            // RGBA → RGB. Use Uint8Array (transferable) for the body.
            const rgb = new Uint8Array(this.targetWidth * this.targetHeight * 3);
            let j = 0;
            for (let i = 0; i < img.data.length; i += 4) {
                rgb[j++] = img.data[i];
                rgb[j++] = img.data[i + 1];
                rgb[j++] = img.data[i + 2];
            }
            this._postFrame(rgb);
        } catch (e) {
            this._stats.errors++;
            this._stats.lastError = e?.message || String(e);
            console.warn("[FrameStreamer] capture failed:", e);
        }
    }

    async _postFrame(rgb) {
        this._sending = true;
        try {
            const res = await fetch(this.bridgeUrl + "/api/multiplayer/frame", {
                method: "POST",
                headers: {
                    "Content-Type":   "application/octet-stream",
                    "X-Frame-Width":  String(this.targetWidth),
                    "X-Frame-Height": String(this.targetHeight),
                    "X-Frame-Source": this.source,
                },
                body: rgb,
            });
            if (res.ok) {
                this._stats.framesSent++;
            } else {
                this._stats.errors++;
                this._stats.lastError = "HTTP " + res.status;
            }
        } catch (e) {
            this._stats.errors++;
            this._stats.lastError = e?.message || String(e);
        } finally {
            this._sending = false;
        }
    }
}
