// FILE: ui/jobWatermark.js
// VERSION: v1 — round 335
//
// Subtle bottom-right watermark advertising the developer's availability.
// Fades in over 3s, holds for 8s, fades out over 3s, dark for 20s, repeats
// — a 34-second cycle. Small, low-opacity, monospace, positioned so it
// doesn't fight any existing UI.
//
// Style choices:
//   • Bottom-right corner, 10px margin
//   • Monospace font, 11px
//   • Maximum opacity 0.55 (visible without dominating)
//   • pointer-events:none so it never blocks clicks
//   • CSS animation handles the fade timing — no JS tick needed
//
// Toggle from console: window.jobWatermark.hide() / .show() / .destroy()

export class JobWatermark {
    constructor({
        text = "Keith needs a job — please help. howdykeith@gmail.com",
        position = "bottom-right",
    } = {}) {
        this.text = text;
        this.position = position;
        this._el = null;
        this._build();
    }

    _build() {
        // Style block — keep it scoped via unique class name so it can't
        // collide with anything else on the page.
        const STYLE_ID = "voxelengine-job-watermark-style";
        if (!document.getElementById(STYLE_ID)) {
            const style = document.createElement("style");
            style.id = STYLE_ID;
            style.textContent = `
                @keyframes voxelengine-watermark-fade {
                    0%   { opacity: 0; }
                    9%   { opacity: 0.55; }    /* 3s fade-in   (3/34) */
                    32%  { opacity: 0.55; }    /* hold 8s     (11/34) */
                    41%  { opacity: 0; }       /* 3s fade-out (14/34) */
                    100% { opacity: 0; }       /* dark 20s    (34/34) */
                }
                .voxelengine-job-watermark {
                    position: fixed;
                    bottom: 58px;
                    right: 14px;
                    color: #cfd;
                    font-family: ui-monospace, Consolas, "Courier New", monospace;
                    font-size: 11px;
                    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.85);
                    background: rgba(0, 0, 0, 0.35);
                    padding: 4px 10px;
                    border-radius: 3px;
                    pointer-events: none;
                    user-select: none;
                    z-index: 9500;
                    opacity: 0;
                    animation: voxelengine-watermark-fade 34s linear infinite;
                }
                .voxelengine-job-watermark.tl { bottom: auto; right: auto; top: 10px; left: 14px; }
                .voxelengine-job-watermark.tr { bottom: auto; top: 10px; }
                .voxelengine-job-watermark.bl { right: auto; left: 14px; }
            `;
            document.head.appendChild(style);
        }

        const el = document.createElement("div");
        el.className = "voxelengine-job-watermark";
        if (this.position === "top-left")     el.classList.add("tl");
        else if (this.position === "top-right")    el.classList.add("tr");
        else if (this.position === "bottom-left")  el.classList.add("bl");
        // default = bottom-right
        el.textContent = this.text;
        document.body.appendChild(el);
        this._el = el;
    }

    hide() { if (this._el) this._el.style.display = "none"; }
    show() { if (this._el) this._el.style.display = ""; }
    destroy() {
        if (this._el) {
            this._el.remove();
            this._el = null;
        }
    }
    setText(t) {
        this.text = t;
        if (this._el) this._el.textContent = t;
    }
}
