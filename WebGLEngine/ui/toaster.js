// FILE: ui/toaster.js
// Round 47 — in-engine toast notification system.
//
// Stack in top-right; slide in (translateX), hold, fade out. Five
// types color-code the left border: info / success / warn / error / system.
//
// Sources of toasts:
//   - Internal: toaster.show({ title, msg, type, duration })
//   - External: WSBridge dispatches "toast" messages here
//   - Convenience: from PowerShell/VBA via Send-VoxelToast.ps1 (sibling
//     of Send-VoxelLog.ps1)
//
// Each toast: {title, msg, type, duration_ms}. duration default 4500ms.
// Stack capacity: 5 visible at once; new arrivals push the oldest out
// early if at cap.

const COLORS = {
    info:    "#4af",
    success: "#5d8",
    warn:    "#fa3",
    error:   "#f44",
    system:  "#a6f",
};

const DEFAULT_DURATION = 4500;
const MAX_VISIBLE = 5;

export class Toaster {

    constructor(opts = {}) {
        this.bridge = opts.bridge ?? null;
        this._stack = [];     // FIFO of {el, timer}
        this._buildContainer();

        // Subscribe to bridge "toast" messages
        if (this.bridge?.on) {
            this.bridge.on("toast", (data) => {
                this.show({
                    title: data?.title ?? "Notification",
                    msg:   data?.msg ?? data?.message ?? "",
                    type:  data?.type ?? "info",
                    duration: data?.duration ?? DEFAULT_DURATION,
                });
            });
        }
    }

    _buildContainer() {
        const c = document.createElement("div");
        Object.assign(c.style, {
            position: "fixed",
            top: "14px",
            right: "14px",
            display: "flex",
            flexDirection: "column",
            gap: "8px",
            zIndex: "30000",
            pointerEvents: "none",
            maxWidth: "340px",
        });
        document.body.appendChild(c);
        this._container = c;
    }

    // Returns the toast element (in case caller wants to dismiss early).
    show({ title = "", msg = "", type = "info", duration = DEFAULT_DURATION, thumb = "" } = {}) {
        // Cap stack — push oldest out
        while (this._stack.length >= MAX_VISIBLE) {
            const oldest = this._stack.shift();
            if (oldest) this._dismissEl(oldest.el, oldest.timer);
        }

        const color = COLORS[type] ?? COLORS.info;
        const el = document.createElement("div");
        Object.assign(el.style, {
            background: "rgba(20,20,28,0.95)",
            color: "#cfd",
            borderLeft: `4px solid ${color}`,
            borderRadius: "5px",
            padding: "10px 14px",
            fontFamily: "ui-monospace, Consolas, monospace",
            fontSize: "12px",
            boxShadow: "0 4px 14px rgba(0,0,0,0.45)",
            transform: "translateX(380px)",
            opacity: "0",
            transition: "transform 0.28s ease-out, opacity 0.28s",
            pointerEvents: "auto",
            cursor: "pointer",
        });

        // v1764 — optional left-side thumbnail; title/msg then go in a text column
        let body = el;
        if (thumb) {
            el.style.display = "flex";
            el.style.alignItems = "center";
            el.style.gap = "10px";
            const im = document.createElement("img");
            im.src = thumb;
            Object.assign(im.style, { width: "48px", height: "48px", borderRadius: "5px", objectFit: "cover", background: "#08120b", flex: "0 0 auto" });
            el.appendChild(im);
            body = document.createElement("div");
            body.style.minWidth = "0";
            el.appendChild(body);
        }

        if (title) {
            const t = document.createElement("div");
            t.textContent = title;
            Object.assign(t.style, {
                color, fontWeight: "bold",
                fontSize: "13px", letterSpacing: "1px",
                marginBottom: "3px",
            });
            body.appendChild(t);
        }
        if (msg) {
            const m = document.createElement("div");
            m.textContent = msg;
            m.style.lineHeight = "1.4";
            m.style.opacity = "0.85";
            body.appendChild(m);
        }

        // Click to dismiss early
        el.addEventListener("click", () => this._dismissEl(el, entry.timer));

        this._container.appendChild(el);
        // Trigger slide-in on next frame
        requestAnimationFrame(() => {
            el.style.transform = "translateX(0)";
            el.style.opacity = "1";
        });

        const timer = setTimeout(() => this._dismissEl(el, timer), duration);
        const entry = { el, timer };
        this._stack.push(entry);

        return el;
    }

    _dismissEl(el, timer) {
        if (timer) clearTimeout(timer);
        if (!el.parentNode) return;
        el.style.transform = "translateX(380px)";
        el.style.opacity = "0";
        setTimeout(() => {
            if (el.parentNode) el.parentNode.removeChild(el);
            const idx = this._stack.findIndex(e => e.el === el);
            if (idx >= 0) this._stack.splice(idx, 1);
        }, 320);
    }

    dismissAll() {
        for (const entry of [...this._stack]) {
            this._dismissEl(entry.el, entry.timer);
        }
    }

    // Convenience type-shorthand
    info(title, msg, duration)    { return this.show({ title, msg, type: "info", duration }); }
    success(title, msg, duration) { return this.show({ title, msg, type: "success", duration }); }
    warn(title, msg, duration)    { return this.show({ title, msg, type: "warn", duration }); }
    error(title, msg, duration)   { return this.show({ title, msg, type: "error", duration }); }
    system(title, msg, duration)  { return this.show({ title, msg, type: "system", duration }); }
}
