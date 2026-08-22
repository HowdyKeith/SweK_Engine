// FILE: ui/toast.js
// VERSION: v1 (v777 — round 31 polish)
//
// Minimal on-screen toast widget. Fades in near the top of the screen,
// holds for ~2.5s, fades out. Multiple toasts stack vertically. Used
// for transient gameplay messages where a console.log isn't enough
// (e.g. kaiju_drive auto-exit on death, level transitions, achievement
// pings, etc.).
//
// Usage:
//   import { showToast, installGlobal } from "./toast.js";
//   showToast("controlled kaiju has died");
//   showToast("level cleared!", { kind: "success", ms: 4000 });
//
// installGlobal() exposes window.toast.show for console / script use.

const KINDS = {
    info:    { border: "rgba(140,200,255,0.6)", text: "#cfd" },
    success: { border: "rgba(120,255,160,0.7)", text: "#dfd" },
    warn:    { border: "rgba(255,200,80,0.8)",  text: "#fec" },
    error:   { border: "rgba(255,90,90,0.85)",  text: "#fcc" },
};

let _stackEl = null;
const _subs = [];   // v1690 — event subscribers (e.g. the SweK robot reacts to toasts)
export function subscribeToast(fn) { if (typeof fn === "function") _subs.push(fn); return () => { const i = _subs.indexOf(fn); if (i >= 0) _subs.splice(i, 1); }; }

function _ensureStack() {
    if (_stackEl || typeof document === "undefined") return _stackEl;
    _stackEl = document.createElement("div");
    _stackEl.id = "toast-stack";
    Object.assign(_stackEl.style, {
        position: "fixed",
        left: "50%",
        top: "60px",
        transform: "translateX(-50%)",
        display: "flex",
        flexDirection: "column",
        gap: "6px",
        pointerEvents: "none",
        zIndex: "1200",
        alignItems: "center",
    });
    document.body.appendChild(_stackEl);
    return _stackEl;
}

export function showToast(message, opts = {}) {
    const stack = _ensureStack();
    if (!stack) return;
    const kind = KINDS[opts.kind] || KINDS.info;
    try { _subs.forEach(f => { try { f(String(message), opts.kind || "info"); } catch (e) {} }); } catch (e) {}
    const ms = opts.ms ?? 2500;

    // v778 — queue limit. Drop oldest toast immediately if we'd exceed
    // 4 visible at once. Spam-firing into death (or rapid event sequences)
    // can otherwise stack a wall of messages.
    const MAX = 4;
    while (stack.children.length >= MAX) {
        try { stack.firstChild?.remove?.(); } catch { break; }
    }

    const el = document.createElement("div");
    Object.assign(el.style, {
        background: "rgba(0,0,0,0.62)",
        border: `1px solid ${kind.border}`,
        borderRadius: "6px",
        color: kind.text,
        fontFamily: "monospace",
        fontSize: "12px",
        padding: "6px 14px",
        opacity: "0",
        transition: "opacity 200ms ease-out, transform 200ms ease-out",
        transform: "translateY(-6px)",
        whiteSpace: "nowrap",
        textShadow: "0 1px 2px rgba(0,0,0,0.7)",
    });
    el.textContent = String(message);
    stack.appendChild(el);

    // Force layout flush, then fade in
    requestAnimationFrame(() => {
        el.style.opacity = "1";
        el.style.transform = "translateY(0)";
    });

    // Fade out + remove
    setTimeout(() => {
        el.style.opacity = "0";
        el.style.transform = "translateY(-6px)";
        setTimeout(() => {
            try { el.remove(); } catch {}
        }, 220);
    }, ms);
}

export function installGlobal() {
    if (typeof window === "undefined") return;
    if (!window.toast) window.toast = { show: showToast, subscribe: subscribeToast };
}
