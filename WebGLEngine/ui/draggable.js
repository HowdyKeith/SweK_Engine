// FILE: ui/draggable.js
// VERSION: v1 — round 357
//
// Generic draggable helper for floating widgets. Attaches a drag
// handle to an existing element so the user can reposition it
// without rebuilding the widget's internal markup.
//
// Usage:
//   const handle = makeDraggable(panelDiv);
//   handle.attach();   // call once after appending to DOM
//   handle.detach();   // tear down listeners
//
// Behavior:
//   - Adds a small "≡" handle bar at the top of the element
//   - Drag from anywhere on the handle bar
//   - z-index bumps to 9000 while dragging so widget pops above peers
//   - Position becomes `fixed` with explicit left/top once dragged
//   - localStorage remembers position per `storageKey` if provided

export function makeDraggable(element, opts = {}) {
    if (!element) return null;
    const { label = "", storageKey = null, initialPosition = null } = opts;
    const z0 = element.style.zIndex || "8800";

    // Build the handle bar
    const bar = document.createElement("div");
    bar.textContent = `≡  ${label}`.trim();
    Object.assign(bar.style, {
        cursor: "grab",
        background: "rgba(40, 80, 120, 0.6)",
        color: "#cfd",
        fontFamily: "monospace",
        fontSize: "11px",
        padding: "3px 8px",
        marginBottom: "6px",
        borderRadius: "4px",
        userSelect: "none",
        textAlign: "left",
        letterSpacing: "1px",
    });
    bar.setAttribute("data-draggable-handle", "true");

    let onDown = null, onMove = null, onUp = null;
    let dragging = false;
    let startX = 0, startY = 0, startLeft = 0, startTop = 0;

    function _restorePersisted() {
        if (!storageKey) return false;
        try {
            const saved = JSON.parse(localStorage.getItem(`draggable:${storageKey}`) || "null");
            if (saved && typeof saved.left === "number" && typeof saved.top === "number") {
                element.style.position = "fixed";
                element.style.left = saved.left + "px";
                element.style.top = saved.top + "px";
                element.style.right = "auto";
                element.style.bottom = "auto";
                return true;
            }
        } catch {}
        return false;
    }

    function _persist() {
        if (!storageKey) return;
        try {
            const r = element.getBoundingClientRect();
            localStorage.setItem(`draggable:${storageKey}`, JSON.stringify({ left: r.left, top: r.top }));
        } catch {}
    }

    const api = {
        bar,
        attach() {
            element.insertBefore(bar, element.firstChild);

            if (initialPosition && !_restorePersisted()) {
                element.style.position = "fixed";
                element.style.left = initialPosition.left + "px";
                element.style.top = initialPosition.top + "px";
                element.style.right = "auto";
                element.style.bottom = "auto";
            } else {
                _restorePersisted();
            }

            onDown = (e) => {
                dragging = true;
                bar.style.cursor = "grabbing";
                element.style.zIndex = "9000";
                const rect = element.getBoundingClientRect();
                startLeft = rect.left;
                startTop  = rect.top;
                const p = e.touches ? e.touches[0] : e;
                startX = p.clientX;
                startY = p.clientY;
                // Convert to fixed-px positioning so drag math is clean
                element.style.position = "fixed";
                element.style.left = startLeft + "px";
                element.style.top  = startTop  + "px";
                element.style.right = "auto";
                element.style.bottom = "auto";
                e.preventDefault();
            };
            onMove = (e) => {
                if (!dragging) return;
                const p = e.touches ? e.touches[0] : e;
                const dx = p.clientX - startX;
                const dy = p.clientY - startY;
                element.style.left = (startLeft + dx) + "px";
                element.style.top  = (startTop  + dy) + "px";
            };
            onUp = () => {
                if (!dragging) return;
                dragging = false;
                bar.style.cursor = "grab";
                element.style.zIndex = z0;
                _persist();
            };

            bar.addEventListener("mousedown", onDown);
            bar.addEventListener("touchstart", onDown, { passive: false });
            window.addEventListener("mousemove", onMove);
            window.addEventListener("touchmove", onMove, { passive: false });
            window.addEventListener("mouseup", onUp);
            window.addEventListener("touchend", onUp);
        },
        detach() {
            bar.removeEventListener("mousedown", onDown);
            bar.removeEventListener("touchstart", onDown);
            window.removeEventListener("mousemove", onMove);
            window.removeEventListener("touchmove", onMove);
            window.removeEventListener("mouseup", onUp);
            window.removeEventListener("touchend", onUp);
            try { bar.remove(); } catch {}
        },
        resetPosition() {
            if (storageKey) localStorage.removeItem(`draggable:${storageKey}`);
            element.style.position = "";
            element.style.left = "";
            element.style.top = "";
            element.style.right = "";
            element.style.bottom = "";
        },
    };
    return api;
}
