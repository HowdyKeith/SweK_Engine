// FILE: ui/testMePanel.js
// VERSION: v1 — "TEST ME" verification queue.
//
// The sandbox Claude builds in can't run WebGL, so anything visual ships with a
// "please eyeball this" caveat. This panel turns those caveats into a live,
// minimized checklist: each item is something to confirm in-app, with a "Try it"
// button that triggers it. Tap ✓ Works → it's remembered (localStorage) and drops
// off the list. Report back what worked / didn't, and Claude prunes the seed list
// — so it grows when new unverified things land and shrinks to zero as you confirm.

const LS_KEY = "voxelengine.testme.confirmed";

export class TestMePanel {
    constructor(items = []) {
        this.items = items;
        this.confirmed = this._load();
        this.expanded = false;
        this._build();
        this._render();
    }
    _load() { try { return new Set(JSON.parse(localStorage.getItem(LS_KEY) || "[]")); } catch { return new Set(); } }
    _save() { try { localStorage.setItem(LS_KEY, JSON.stringify([...this.confirmed])); } catch {} }
    pending() { return this.items.filter((i) => !this.confirmed.has(i.id)); }

    _btn(b, bg, border) {
        Object.assign(b.style, { background: bg, color: "#cfe", border: "1px solid " + border,
            borderRadius: "5px", padding: "3px 8px", cursor: "pointer", font: "inherit" });
        return b;
    }

    _build() {
        const el = this.root = document.createElement("div");
        Object.assign(el.style, { position: "fixed", top: "10px", right: "10px", zIndex: 99998,
            font: "12px/1.4 ui-monospace, Menlo, Consolas, monospace", color: "#cfe8ff", maxWidth: "330px" });
        const tab = this.tab = this._btn(document.createElement("button"), "#15324a", "#2e6088");
        tab.style.boxShadow = "0 2px 8px rgba(0,0,0,0.4)";
        tab.onclick = () => { this.expanded = !this.expanded; this._render(); };
        const body = this.body = document.createElement("div");
        Object.assign(body.style, { marginTop: "6px", background: "rgba(8,18,28,0.96)",
            border: "1px solid #2e6088", borderRadius: "8px", padding: "8px",
            display: "none", maxHeight: "72vh", overflowY: "auto" });
        el.appendChild(tab); el.appendChild(body);
        document.body.appendChild(el);
    }

    // v1573 — launchable from the Applications panel (the standalone tab is hidden in main.js).
    toggle() { this.expanded = !this.expanded; this._render(); }
    show()   { this.expanded = true;  this._render(); }
    hide()   { this.expanded = false; this._render(); }

    _row(item) {
        const row = document.createElement("div");
        Object.assign(row.style, { borderTop: "1px solid #1d3a52", padding: "6px 0" });
        const lab = document.createElement("div");
        lab.textContent = item.label; lab.style.fontWeight = "600"; lab.style.color = "#dff";
        row.appendChild(lab);
        if (item.check) {
            const c = document.createElement("div");
            c.textContent = item.check;
            Object.assign(c.style, { color: "#9ab", fontSize: "11px", margin: "2px 0 5px" });
            row.appendChild(c);
        }
        const btns = document.createElement("div");
        Object.assign(btns.style, { display: "flex", gap: "6px" });
        if (item.try) {
            const tb = this._btn(document.createElement("button"), "#1f3a24", "#3a6");
            tb.textContent = "Try it";
            tb.onclick = () => { try { const r = item.try(); console.log("[testme] " + item.id + " →", r); } catch (e) { console.warn("[testme] try failed:", e); } };
            btns.appendChild(tb);
        }
        const ok = this._btn(document.createElement("button"), "#264a2a", "#4a8");
        ok.textContent = "✓ Works";
        ok.onclick = () => { this.confirmed.add(item.id); this._save(); this._render(); };
        btns.appendChild(ok);
        row.appendChild(btns);
        return row;
    }

    _render() {
        const pend = this.pending();
        this.tab.textContent = "🧪 TEST ME (" + pend.length + ")";
        this.body.style.display = this.expanded ? "block" : "none";
        if (!this.expanded) return;
        this.body.innerHTML = "";
        const intro = document.createElement("div");
        intro.textContent = "Confirm these work, then tell Claude:";
        Object.assign(intro.style, { color: "#8fb", marginBottom: "4px" });
        this.body.appendChild(intro);
        if (!pend.length) {
            const d = document.createElement("div");
            d.textContent = "✓ all clear — nothing pending";
            d.style.color = "#7d7";
            this.body.appendChild(d);
        }
        for (const item of pend) this.body.appendChild(this._row(item));
        if (this.confirmed.size) {
            const f = document.createElement("div");
            f.textContent = "(" + this.confirmed.size + " confirmed — click to reset)";
            Object.assign(f.style, { marginTop: "8px", color: "#789", cursor: "pointer", fontSize: "11px" });
            f.onclick = () => { this.confirmed.clear(); this._save(); this._render(); };
            this.body.appendChild(f);
        }
    }

    // Claude updates the seed list across builds.
    setItems(items) { this.items = items; this._render(); }
}
