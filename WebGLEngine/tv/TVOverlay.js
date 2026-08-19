// FILE: tv/TVOverlay.js
// VERSION: v3 - DPR-AWARE TEXT RENDERING
//
// v2 added per-screen narrative captions on top of v1's grid lines.
// v3 makes all text and padding scale by devicePixelRatio so it stays
// readable when the GL canvas is rendered at 2× framebuffer size for
// high-DPI displays.
//
// Sits as an absolutely-positioned 2D canvas above the WebGL canvas.
//   * Thin cell separators
//   * Cell label in the top-left ("[primary]" / "screen #N")
//   * Each non-primary cell shows the narrative caption from its
//     TVScreenAgent (if one is registered), pinned to the bottom of
//     the cell with a translucent black backdrop strip. Intensity
//     drives the text alpha so loud events look "louder."
//
// Pure visual aid — pointer-events: none so it doesn't block input.

const CAPTION_PADDING_X = 10;
const CAPTION_PADDING_Y = 10;
const CAPTION_BAND_HEIGHT = 36;

export class TVOverlay {
    constructor(parent) {
        this.canvas = document.createElement("canvas");
        Object.assign(this.canvas.style, {
            position: "absolute",
            left: "0", top: "0",
            width: "100%", height: "100%",
            pointerEvents: "none",
            zIndex: "9000",
        });
        parent.appendChild(this.canvas);
        this.ctx = this.canvas.getContext("2d");
        this.dpr = 1;
    }

    // (w, h) are framebuffer pixels (already DPR-scaled in main.js).
    // dpr is passed separately so font/padding sizes can be scaled up
    // to match — otherwise text would render at 1/dpr its intended size.
    resize(w, h, dpr = 1) {
        this.canvas.width  = w;
        this.canvas.height = h;
        this.dpr = dpr;
    }

    // wall    : TVWall instance
    // agents  : { screenId -> TVScreenAgent } map (optional)
    render(wall, agents = null) {
        const ctx = this.ctx;
        const dpr = this.dpr;
        const w = this.canvas.width;
        const h = this.canvas.height;

        ctx.clearRect(0, 0, w, h);
        if (!wall.isActive()) return;

        const cellW = Math.floor(w / wall.cols);
        const cellH = Math.floor(h / wall.rows);

        // Grid lines
        ctx.strokeStyle = "rgba(0, 255, 220, 0.25)";
        ctx.lineWidth = Math.max(1, dpr);
        for (let c = 1; c < wall.cols; c++) {
            const x = c * cellW + 0.5;
            ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
        }
        for (let r = 1; r < wall.rows; r++) {
            const y = r * cellH + 0.5;
            ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
        }

        // Cell labels + per-cell captions
        for (let r = 0; r < wall.rows; r++) {
            for (let c = 0; c < wall.cols; c++) {
                const idx = r * wall.cols + c;
                const cellX = c * cellW;
                const cellY = r * cellH;

                let screen = null;
                if (idx > 0) {
                    screen = wall.screens.find(s =>
                        s.viewport &&
                        Math.abs(s.viewport[0] - cellX) < 2 &&
                        Math.abs(s.viewport[1] - (wall.rows - 1 - r) * cellH) < 2
                    );
                }
                const label = idx === 0
                    ? "[primary]"
                    : screen ? `screen #${screen.id}` : "(empty)";

                // Top-left label (DPR-scaled)
                ctx.fillStyle = "rgba(0, 255, 220, 0.65)";
                ctx.font = `${11 * dpr}px monospace`;
                ctx.fillText(label, cellX + 6 * dpr, cellY + 14 * dpr);

                if (screen && agents) {
                    const agent = agents.get?.(screen.id) ?? agents[screen.id];
                    const cap = agent?.captionState();
                    if (cap?.text) {
                        this._drawCaption(ctx, cellX, cellY, cellW, cellH, cap, dpr);
                    }
                }
            }
        }
    }

    _drawCaption(ctx, cellX, cellY, cellW, cellH, cap, dpr) {
        const bandH = CAPTION_BAND_HEIGHT * dpr;
        const padX  = CAPTION_PADDING_X  * dpr;
        const bandY = cellY + cellH - bandH;

        // Translucent backdrop band
        ctx.fillStyle = "rgba(0, 0, 0, 0.55)";
        ctx.fillRect(cellX + 1, bandY, cellW - 2, bandH - 1);

        // Text
        const intensity = cap.intensity ?? 0;
        const alpha = 0.7 + Math.min(0.3, intensity * 0.3);
        ctx.fillStyle = `rgba(220, 240, 255, ${alpha})`;
        ctx.font = `${12 * dpr}px monospace`;
        const text = String(cap.text);
        const maxW = cellW - padX * 2;
        let display = text;
        if (ctx.measureText(text).width > maxW) {
            let len = text.length;
            while (len > 4 && ctx.measureText(text.slice(0, len) + "...").width > maxW) {
                len--;
            }
            display = text.slice(0, len) + "...";
        }
        ctx.fillText(display, cellX + padX, bandY + 22 * dpr);
    }
}
