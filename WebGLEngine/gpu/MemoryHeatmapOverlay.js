// FILE: gpu/MemoryHeatmapOverlay.js
// VERSION: v1 - 2D MINIMAP RENDERING THE GPU HEATMAP
//
// Reads back the GPU memory texture every ~500ms (cheap at size=128
// → 64KB readback) and paints it as a colorized minimap. Sits in the
// bottom-right corner of the viewport. Toggle with H key from main.js.
//
// Why the readback rather than rendering the GPU texture directly to a
// quad in the WebGL canvas: keeps the WebGL render path unchanged
// (no extra shader, no compositing logic in the main render). Cost is
// 2 readbacks/sec, ~128KB/s. Trivial.
//
// Color ramp: black -> red -> yellow -> white as strength increases.
// Alpha tracks strength so empty cells are transparent (you can see
// through to the world behind).

const READBACK_INTERVAL_MS = 500;
const PIXEL_SCALE = 2;          // each heatmap texel rendered as 2×2 px
const PADDING = 12;
const TITLE = "MEMORY HEATMAP";

export class MemoryHeatmapOverlay {
    constructor(parent, gpuMemory) {
        this.parent = parent;
        this.gpu = gpuMemory;
        this.visible = false;        // off by default; H toggles
        this.lastReadback = 0;

        this.canvas = document.createElement("canvas");
        this.size   = gpuMemory.size;
        this.canvas.width  = this.size * PIXEL_SCALE;
        this.canvas.height = this.size * PIXEL_SCALE + 18;   // room for title
        Object.assign(this.canvas.style, {
            position: "absolute",
            right: PADDING + "px",
            bottom: PADDING + "px",
            border: "1px solid rgba(0, 255, 220, 0.4)",
            background: "rgba(0, 0, 0, 0.55)",
            pointerEvents: "none",
            display: "none",
            zIndex: "9001",
            imageRendering: "pixelated",
        });
        parent.appendChild(this.canvas);
        this.ctx = this.canvas.getContext("2d");

        // ImageData buffer for the texel grid (without title bar).
        this.imageData = this.ctx.createImageData(this.size, this.size);
        this._buffer = new Float32Array(this.size * this.size * 4);
    }

    setVisible(v) {
        this.visible = !!v;
        this.canvas.style.display = this.visible ? "block" : "none";
    }

    toggle() {
        this.setVisible(!this.visible);
    }

    // Called from the main loop every frame. Cheap when invisible (no
    // readback). When visible, throttles readback to ~500ms.
    tickIfDue() {
        if (!this.visible) return;
        if (!this.gpu.supported) {
            this._renderUnsupported();
            return;
        }
        const now = performance.now();
        if (now - this.lastReadback < READBACK_INTERVAL_MS) return;
        this.lastReadback = now;

        this.gpu.readSeeds(this._buffer);
        this._render();
    }

    _render() {
        const data = this.imageData.data;
        const buf = this._buffer;
        for (let i = 0; i < this.size * this.size; i++) {
            const strength = buf[i * 4 + 0];
            const c = this._colorize(strength);
            data[i * 4 + 0] = c[0];
            data[i * 4 + 1] = c[1];
            data[i * 4 + 2] = c[2];
            data[i * 4 + 3] = c[3];
        }
        // Title bar
        this.ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
        this.ctx.fillRect(0, 0, this.canvas.width, 18);
        this.ctx.fillStyle = "rgba(0, 255, 220, 0.85)";
        this.ctx.font = "11px monospace";
        const snap = this.gpu.snapshot();
        this.ctx.fillText(
            `${TITLE}  ${snap.size}x${snap.size}  w:${snap.writes}  d:${snap.decays}`,
            6, 13
        );

        // Heatmap texels
        if (PIXEL_SCALE === 1) {
            this.ctx.putImageData(this.imageData, 0, 18);
        } else {
            // putImageData ignores ctx scale — write to a tmp canvas then
            // drawImage upscaled.
            if (!this._scratch) {
                this._scratch = document.createElement("canvas");
                this._scratch.width = this.size;
                this._scratch.height = this.size;
                this._scratchCtx = this._scratch.getContext("2d");
            }
            this._scratchCtx.putImageData(this.imageData, 0, 0);
            this.ctx.imageSmoothingEnabled = false;
            this.ctx.drawImage(
                this._scratch, 0, 0, this.size, this.size,
                0, 18, this.size * PIXEL_SCALE, this.size * PIXEL_SCALE
            );
        }
    }

    _renderUnsupported() {
        const ctx = this.ctx;
        ctx.fillStyle = "rgba(0, 0, 0, 0.85)";
        ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        ctx.fillStyle = "rgba(255, 100, 100, 0.9)";
        ctx.font = "12px monospace";
        ctx.fillText("GPU MEMORY UNAVAILABLE", 12, 28);
        ctx.fillStyle = "rgba(180, 180, 180, 0.85)";
        ctx.font = "10px monospace";
        ctx.fillText(this.gpu.unsupportedReason || "unknown", 12, 46);
    }

    // black -> deep red -> orange -> yellow -> white as strength climbs.
    // Alpha increases from 0 (transparent) at strength 0 to ~220 at high.
    _colorize(strength) {
        const s = Math.min(1, strength * 0.3);  // saturate at ~3.3
        if (s <= 0) return [0, 0, 0, 0];

        // Three-stop ramp.
        let r, g, b;
        if (s < 0.33) {
            const t = s / 0.33;
            r = Math.floor(180 * t);
            g = 0;
            b = 0;
        } else if (s < 0.66) {
            const t = (s - 0.33) / 0.33;
            r = 180 + Math.floor(75 * t);
            g = Math.floor(180 * t);
            b = 0;
        } else {
            const t = (s - 0.66) / 0.34;
            r = 255;
            g = 180 + Math.floor(75 * t);
            b = Math.floor(255 * t);
        }
        const a = Math.floor(80 + 140 * s);
        return [r, g, b, a];
    }
}
