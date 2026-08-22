// FILE: ui/toastTestMenu.js
// VERSION: v1 - round 48
//
// LCARS-styled dedicated "Toast Test" menu. Sits on the RIGHT edge as a
// minitab (TOAST), opens to a panel with all five toast types as test
// buttons. Unlike ListenerMenu's quick-test row (which goes through the
// WSBridge), this one ALWAYS fires locally via window._toaster — so it
// works whether or not the Node relay is connected.
//
// Purpose:
//   1. Visual sanity check that the toaster is rendering at all.
//   2. Quick way to see every type's color coding side by side.
//   3. Ground truth for "toasts not appearing" debugging — if these
//      buttons produce toasts but bridge-driven ones don't, the issue
//      is in the bridge wiring, not the toaster.

export class ToastTestMenu {

    constructor() {
        this._build();
    }

    _build() {
        // Right-edge minitab. Cyan to match its diagnostic/utility role
        // (distinct from LSTN pink on the left).
        const tab = document.createElement("div");
        tab.className = "lcars-minitab edge-bottom color-cyan";
        // Round 263 — moved to bottom edge (dev/debug experimental group)
        tab.style.bottom = "0";
        tab.style.left = "20px";
        tab.style.top = "auto";
        tab.textContent = "▼ Toast Test";
        tab.title = "Toast test menu — fires every toaster type locally";
        document.body.appendChild(tab);

        const panel = document.createElement("div");
        panel.className = "lcars-panel";
        Object.assign(panel.style, {
            position: "fixed",
            right: "60px",
            bottom: "180px",
            width: "260px",
            zIndex: "9300",
            display: "none",
            pointerEvents: "auto",
        });

        // ---- Header ----
        const header = document.createElement("div");
        header.className = "lcars-panel-header";
        const title = document.createElement("div");
        title.textContent = "Toast Test";
        header.appendChild(title);
        const close = document.createElement("div");
        close.className = "lcars-panel-header-id";
        close.textContent = "X";
        close.style.cursor = "pointer";
        close.addEventListener("click", () => panel.style.display = "none");
        header.appendChild(close);
        panel.appendChild(header);

        // ---- Body ----
        const body = document.createElement("div");
        body.className = "lcars-panel-body";
        const bar = document.createElement("div");
        bar.className = "lcars-panel-bar";
        body.appendChild(bar);

        const content = document.createElement("div");
        content.className = "lcars-panel-content";
        content.style.fontSize = "11px";
        content.style.color = "#fc9";

        const note = document.createElement("div");
        note.textContent = "Local-fire only. Bypasses the WSBridge so it works offline too.";
        Object.assign(note.style, {
            fontSize: "10px",
            color: "#aaa",
            marginBottom: "10px",
            lineHeight: "1.4",
        });
        content.appendChild(note);

        // Each button uses its type's color to make the mapping obvious.
        // Mirrors the COLORS table in toaster.js.
        const BTN_COLORS = {
            info:    "#4af",
            success: "#5d8",
            warn:    "#fa3",
            error:   "#f44",
            system:  "#a6f",
        };
        const BTN_BLURBS = {
            info:    "Routine status message",
            success: "Operation completed",
            warn:    "Watch out for this",
            error:   "Something went wrong",
            system:  "Engine-level event",
        };

        for (const type of ["info", "success", "warn", "error", "system"]) {
            const c = BTN_COLORS[type];
            const b = document.createElement("button");
            b.textContent = type.toUpperCase();
            Object.assign(b.style, {
                display: "block",
                width: "100%",
                padding: "8px",
                marginBottom: "6px",
                fontSize: "12px",
                fontFamily: "monospace",
                fontWeight: "700",
                background: "rgba(20,20,28,0.85)",
                color: c,
                border: `2px solid ${c}`,
                borderLeftWidth: "8px",
                cursor: "pointer",
                letterSpacing: "0.1em",
                textAlign: "left",
            });
            b.addEventListener("mouseenter", () => b.style.background = "rgba(40,40,55,0.9)");
            b.addEventListener("mouseleave", () => b.style.background = "rgba(20,20,28,0.85)");
            b.addEventListener("click", () => this._fire(type));
            content.appendChild(b);
        }

        // ---- Burst-of-5: fires one of each type in sequence so the
        // stack-cap behavior + slide animation can be inspected.
        const burst = document.createElement("button");
        burst.textContent = "⚡ FIRE ALL 5";
        Object.assign(burst.style, {
            display: "block",
            width: "100%",
            padding: "8px",
            marginTop: "8px",
            fontSize: "12px",
            fontFamily: "monospace",
            fontWeight: "700",
            background: "rgba(255,153,0,0.25)",
            color: "#fff",
            border: "2px solid #f90",
            cursor: "pointer",
            letterSpacing: "0.1em",
        });
        burst.addEventListener("click", () => {
            const types = ["info", "success", "warn", "error", "system"];
            types.forEach((t, i) => {
                setTimeout(() => this._fire(t), i * 220);
            });
        });
        content.appendChild(burst);

        // Save type blurbs for fire()
        this._blurbs = BTN_BLURBS;

        body.appendChild(content);
        panel.appendChild(body);

        const footer = document.createElement("div");
        footer.className = "lcars-panel-footer";
        panel.appendChild(footer);

        document.body.appendChild(panel);
        tab.addEventListener("click", () => {
            panel.style.display = (panel.style.display === "none") ? "block" : "none";
        });
        this._panel = panel;
        this._tab = tab;
    }

    // v1558 — opened from the Applications launcher (its minitab is hidden).
    toggle() { if (this._panel) this._panel.style.display = (this._panel.style.display === "none" || !this._panel.style.display) ? "block" : "none"; }

    _fire(type) {
        if (!window._toaster?.show) {
            console.warn("[ToastTestMenu] window._toaster not mounted; cannot fire local toast");
            return;
        }
        window._toaster.show({
            title: type.toUpperCase(),
            msg:   `${this._blurbs[type]} (t=${new Date().toLocaleTimeString()})`,
            type,
            duration: 4500,
        });
    }
}
