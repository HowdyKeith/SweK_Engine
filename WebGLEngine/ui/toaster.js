import { makeSpring, step as springStep } from "./springMotion.js";
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

// v4114 -- the SAME spring ui/toast.js uses. Two toast surfaces, one integrator: writing the physics into
// whichever file was upgraded first and then again into the second is the second-copy defect this session has
// watched land repeatedly.
const SLIDE_PX = 380;

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
            transform: `translateX(${SLIDE_PX}px)`,
            opacity: "0",
            // NO `transition`: a transition cannot overshoot, and it would also interpolate BETWEEN the
            // spring's own frames and smear the overshoot back out. The rAF loop below writes every frame.
            willChange: "transform, opacity",
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
        // *** ONE SPRING PER TOAST, RETARGETED RATHER THAN REPLACED. *** _dismissEl flips this spring's target
        // instead of starting a second animation, so a toast clicked mid-entrance reverses FROM WHERE IT
        // ACTUALLY IS and carries its velocity out with it. Two separate animations would fight over one
        // transform, and the old CSS pair genuinely did: clicking during the 0.28s slide-in restarted from the
        // element's committed style, not its rendered position, and the toast jumped.
        el._spring = makeSpring(SLIDE_PX, 0, "snappy");
        el._springLast = performance.now();
        const frame = (t) => {
            if (!el.parentNode) return;                     // removed: stop, do not resurrect
            const dt = (t - el._springLast) / 1000; el._springLast = t;
            el._spring = springStep(el._spring, dt);
            el.style.transform = `translateX(${el._spring.x.toFixed(2)}px)`;
            el.style.opacity = String(Math.max(0, Math.min(1, 1 - el._spring.x / SLIDE_PX)));
            if (el._leaving && el._spring.done) {
                if (el.parentNode) el.parentNode.removeChild(el);
                const i = this._stack.findIndex((e) => e.el === el);
                if (i >= 0) this._stack.splice(i, 1);
                return;
            }
            el._raf = requestAnimationFrame(frame);
        };
        el._raf = requestAnimationFrame(frame);

        const timer = setTimeout(() => this._dismissEl(el, timer), duration);
        const entry = { el, timer };
        this._stack.push(entry);

        return el;
    }

    _dismissEl(el, timer) {
        if (timer) clearTimeout(timer);
        if (!el.parentNode) return;
        // Retarget, do not re-animate. Removal happens in the frame loop when the spring actually rests, so
        // there is no fixed 320ms timer that can fire while the element is still visibly moving.
        el._leaving = true;
        if (el._spring) el._spring = { ...el._spring, target: SLIDE_PX };
        else { if (el.parentNode) el.parentNode.removeChild(el); }
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
