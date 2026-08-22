// FILE: ui/eyeToggle.js
// VERSION: v1 - round 57
//
// "Hide all UI" master toggle. A small eye icon top-right of the screen.
// Click it: every UI panel disappears so you can see the engine cleanly.
// Click again: panels return to wherever they were.
//
// Mechanism: we toggle a CSS class on document.body. The class hides
// every absolute / fixed element whose role is "UI panel" — identified
// via either the `data-ui-panel="1"` attribute we set on registered
// roots, OR by tag/class heuristic (LCARS panels, demo menu, status
// HUD, etc.). Canvas + the eye icon itself are explicitly preserved.
//
// Sticky across sessions via localStorage so refreshing doesn't fight
// the user's preference.

const STORAGE_KEY = "voxelengine.uiHidden.v1";

export class EyeToggle {
    constructor() {
        this._hidden = this._loadState();
        this._styleEl = null;
        this._installStyle();
        this._buildButton();
        this._apply();
    }

    _loadState() {
        try { return localStorage.getItem(STORAGE_KEY) === "1"; }
        catch { return false; }
    }

    _saveState() {
        try { localStorage.setItem(STORAGE_KEY, this._hidden ? "1" : "0"); }
        catch {}
    }

    // CSS rule that hides everything tagged with [data-ui-panel="1"]
    // PLUS a set of common selectors used by the engine's existing
    // panels. Canvas + the eye button itself are excluded.
    _installStyle() {
        if (this._styleEl) return;
        const style = document.createElement("style");
        style.textContent = `
body.ve-ui-hidden [data-ui-panel="1"],
body.ve-ui-hidden .lcars-panel,
body.ve-ui-hidden .lcars-minitab,
body.ve-ui-hidden .lcars-status-card,
body.ve-ui-hidden .lcars-narrative-card,
body.ve-ui-hidden .demo-menu-root,
body.ve-ui-hidden #ogreHud,
body.ve-ui-hidden #toastContainer,
/* v739 — also hide the dock tabs (Prompt, Home Assistant, Shield, Cameras, Civs, Kaiju, Assets, Spawn) */
body.ve-ui-hidden .dock-tab,
body.ve-ui-hidden .dock-drawer {
    display: none !important;
}
/* The eye button itself stays visible regardless of state */
#ve-eye-toggle { display: block !important; }
        `;
        document.head.appendChild(style);
        this._styleEl = style;
    }

    _buildButton() {
        const btn = document.createElement("div");
        btn.id = "ve-eye-toggle";
        btn.title = "Hide all UI (click to toggle)";
        Object.assign(btn.style, {
            position: "fixed",
            bottom: "12px",        // v447 — moved to bottom-right corner
            right: "12px",
            width: "28px",
            height: "28px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(0, 0, 0, 0.55)",
            border: "1px solid rgba(255, 180, 80, 0.45)",
            borderRadius: "50%",
            color: "#ffd884",
            fontSize: "15px",
            cursor: "pointer",
            zIndex: "10000",
            userSelect: "none",
            transition: "background 120ms, opacity 120ms",
        });
        btn.addEventListener("mouseenter", () => {
            btn.style.background = "rgba(20, 20, 20, 0.85)";
        });
        btn.addEventListener("mouseleave", () => {
            btn.style.background = "rgba(0, 0, 0, 0.55)";
        });
        btn.addEventListener("click", () => this.toggle());
        document.body.appendChild(btn);
        this._btn = btn;
    }

    toggle() { this._hidden = !this._hidden; this._apply(); this._saveState(); }
    show()   { this._hidden = false;        this._apply(); this._saveState(); }
    hide()   { this._hidden = true;         this._apply(); this._saveState(); }

    _apply() {
        document.body.classList.toggle("ve-ui-hidden", this._hidden);
        if (this._btn) {
            // Open eye when UI is visible, closed eye when hidden.
            // Add a subtle pulse animation on the closed state so the
            // button visibly invites "click to restore".
            this._btn.textContent = this._hidden ? "👁️‍🗨️" : "👁";
            this._btn.style.borderColor = this._hidden
                ? "rgba(255, 140, 80, 0.9)"
                : "rgba(255, 180, 80, 0.45)";
        }
    }
}
