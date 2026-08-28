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

import { makeSpring, step as springStep } from "./springMotion.js";

// v4114 -- SPRING, NOT EASE. Keith asked for sileo-style physical motion. The CSS transition below is gone:
// a `transition` cannot overshoot, so the whole feel it was asked for is not expressible in one. The spring
// lives in ui/springMotion.js and is shared with ui/toaster.js rather than written twice.
//
// TRAVEL IS 32px, UP FROM 6px -- AND THE FIRST TRY AT 14px WAS DRIVEN IN A BROWSER AND REJECTED. A spring's
// overshoot is a FRACTION of its travel, so on a short rise the physics is real and invisible, which is the
// same failure as not doing it at all. Chromium measured 14px of travel giving a 1.27px overshoot: sub-pixel
// on a non-retina display, an ease with extra arithmetic. 32px measures 2.9px, which is a settle you can
// actually see. This is why the gate now reads BOTH surfaces' travel constants out of the source and grades
// the overshoot in real pixels -- a fraction alone cannot tell you whether anybody can see it.
const RISE_PX = 32;

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
        // NO `transition` -- every frame's transform is written by the spring below. Leaving one here would
        // have the browser interpolate BETWEEN the spring's own frames, smearing the overshoot back out.
        transform: `translateY(${-RISE_PX}px)`,
        willChange: "transform, opacity",
        whiteSpace: "nowrap",
        textShadow: "0 1px 2px rgba(0,0,0,0.7)",
    });
    el.textContent = String(message);
    stack.appendChild(el);

    // *** ONE rAF LOOP DRIVES BOTH DIRECTIONS. *** Two loops (in, then out) would each own a spring and could
    // both be alive during the handoff, fighting over the same transform. `phase` flips the target instead, so
    // a toast dismissed mid-entrance simply reverses from wherever it actually is, carrying its velocity --
    // which is the behaviour a spring is for and an ease cannot do at all.
    let sp = makeSpring(-RISE_PX, 0, "snappy");
    let phase = "in", last = performance.now(), leaveAt = performance.now() + ms, raf = 0;
    const frame = (t) => {
        // *** STOP IF THE ELEMENT IS GONE. *** The MAX cap above evicts with a bare .remove(), which does not
        // touch this loop. Without this line an evicted toast keeps a rAF alive writing styles to a DETACHED
        // node for the rest of its duration -- measured in Chromium at NINE live loops for four visible
        // toasts. ui/toaster.js already guarded this way; toast.js did not, and the flood path is exactly
        // where it bites, because that is the only path that removes a toast without going through the spring.
        if (!el.parentNode) { cancelAnimationFrame(raf); return; }
        const dt = (t - last) / 1000; last = t;
        if (phase === "in" && t >= leaveAt) { phase = "out"; sp = { ...sp, target: -RISE_PX }; }
        sp = springStep(sp, dt);
        el.style.transform = `translateY(${sp.x.toFixed(2)}px)`;
        // Opacity is driven FROM THE SPRING'S OWN POSITION rather than by a second timer, so the fade can
        // never disagree with the motion -- one source of truth for where the toast is in its life.
        //
        // *** MEASURED AS TRAVEL FROM THE START, NOT DISTANCE TO THE TARGET, AND THAT DISTINCTION IS A BUG I
        // SHIPPED AND CHROMIUM CAUGHT. *** `1 - abs(x)/RISE` looks right and is wrong the instant a spring
        // overshoots: past the target abs(x) GROWS again, so the toast DIMMED at the peak of its bounce --
        // Chromium measured opacity 0.909 exactly when the toast was most prominent, a visible flicker that
        // only exists because the motion became springy. (x + RISE)/RISE rises monotonically on the way in and
        // falls monotonically on the way out, so both overshoots clamp harmlessly instead of reversing the fade.
        el.style.opacity = String(Math.max(0, Math.min(1, (sp.x + RISE_PX) / RISE_PX)));
        if (phase === "out" && sp.done) { try { el.remove(); } catch {} return; }
        raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
}

export function installGlobal() {
    if (typeof window === "undefined") return;
    if (!window.toast) window.toast = { show: showToast, subscribe: subscribeToast };
}
