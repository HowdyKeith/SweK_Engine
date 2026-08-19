// FILE: ui/firstRunModal.js
// VERSION: v1
//
// LCARS-styled overlay shown on first run when Ollama is detected.
// Communicates the procedural-model population process to the user
// while it runs in the background, with per-creature progress updates.
//
// Lifecycle:
//   const m = new FirstRunModal();
//   m.show();
//   m.setStatus("Connecting to Ollama...");
//   m.addLine("herald", true);
//   m.setProgress(0.5);
//   m.hide();

export class FirstRunModal {
    constructor() {
        this.root = null;
        this.statusEl = null;
        this.progressEl = null;
        this.logEl = null;
        this.closed = false;
    }

    show() {
        if (this.root) return;
        this.closed = false;

        // v2 round 12: no backdrop overlay — pinned corner widget so
        // the world stays visible while population runs in background.
        const root = document.createElement("div");
        Object.assign(root.style, {
            position: "fixed",
            top: "12px",
            right: "12px",
            zIndex: "10000",
            fontFamily: "'Helvetica Neue', Arial, sans-serif",
            pointerEvents: "auto",
        });

        const panel = document.createElement("div");
        Object.assign(panel.style, {
            width: "320px",
            maxHeight: "70vh",
            background: "rgba(0,0,0,0.88)",
            border: "2px solid #f96",
            borderRadius: "16px 16px 4px 4px",
            color: "#fc6",
            padding: "0",
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
            boxShadow: "0 4px 24px rgba(255, 153, 102, 0.25)",
        });

        const header = document.createElement("div");
        Object.assign(header.style, {
            background: "#f96",
            color: "#000",
            padding: "8px 14px",
            fontSize: "11px",
            fontWeight: "bold",
            letterSpacing: "1px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
        });
        header.innerHTML = `<span>FIRST-RUN POPULATION</span>`;

        const closeBtn = document.createElement("button");
        closeBtn.textContent = "✕";
        Object.assign(closeBtn.style, {
            background: "transparent",
            border: "1px solid #000",
            color: "#000",
            width: "20px",
            height: "20px",
            cursor: "pointer",
            fontWeight: "bold",
            borderRadius: "4px",
            padding: "0",
            lineHeight: "18px",
            fontSize: "10px",
        });
        closeBtn.addEventListener("click", () => {
            this.closed = true;
            this.hide();
        });
        header.appendChild(closeBtn);

        const status = document.createElement("div");
        Object.assign(status.style, {
            padding: "10px 14px 4px",
            fontSize: "11px",
            color: "#fc6",
        });
        status.textContent = "Initializing...";

        const progressOuter = document.createElement("div");
        Object.assign(progressOuter.style, {
            margin: "0 14px 8px",
            height: "6px",
            background: "#220",
            borderRadius: "2px",
            overflow: "hidden",
        });
        const progressInner = document.createElement("div");
        Object.assign(progressInner.style, {
            height: "100%",
            width: "0%",
            background: "linear-gradient(90deg, #f96 0%, #fc6 100%)",
            transition: "width 0.25s ease",
        });
        progressOuter.appendChild(progressInner);

        const log = document.createElement("div");
        Object.assign(log.style, {
            margin: "0 14px 12px",
            padding: "6px 8px",
            background: "#110",
            border: "1px solid #441",
            borderRadius: "4px",
            fontFamily: "monospace",
            fontSize: "10px",
            color: "#aa9",
            maxHeight: "180px",
            overflowY: "auto",
        });
        log.textContent = "";

        // v1366 — opt-in: watch the Downloads folder for new models (also in Settings → Asset ingest)
        const watchRow = document.createElement("label");
        Object.assign(watchRow.style, { display: "flex", alignItems: "center", gap: "8px", margin: "0 14px 10px", padding: "8px 10px", background: "#0a1622", border: "1px solid #21303f", borderRadius: "6px", fontFamily: "monospace", fontSize: "11px", color: "#cfe3ff", cursor: "pointer" });
        const watchCb = document.createElement("input"); watchCb.type = "checkbox";
        const watchTxt = document.createElement("span"); watchTxt.innerHTML = "&#128229; Auto-import models I download (watch Downloads for .glb/.gltf; skips zips &amp; images)";
        watchRow.appendChild(watchCb); watchRow.appendChild(watchTxt);
        watchCb.addEventListener("change", () => {
            try { fetch("/assets/ingest/config", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ watchDownloads: watchCb.checked }) }); } catch (e) {}
            try { window._assetWatchOn = watchCb.checked; } catch (e) {}
        });

        // v1444 — opt-in: use my location (powers the weather radar, live aircraft,
        // real-world terrain). Default on; checking it asks the browser for location.
        const locRow = document.createElement("label");
        Object.assign(locRow.style, { display: "flex", alignItems: "center", gap: "8px", margin: "0 14px 10px", padding: "8px 10px", background: "#0a1622", border: "1px solid #21303f", borderRadius: "6px", fontFamily: "monospace", fontSize: "11px", color: "#cfe3ff", cursor: "pointer" });
        const locCb = document.createElement("input"); locCb.type = "checkbox";
        try { const v = localStorage.getItem("voxelengine.location.allow"); locCb.checked = (v == null) ? true : (v === "1"); } catch { locCb.checked = true; }
        const locTxt = document.createElement("span"); locTxt.innerHTML = "&#128205; Use my location &mdash; powers the weather radar, live aircraft &amp; real-world terrain (asks your browser once)";
        locRow.appendChild(locCb); locRow.appendChild(locTxt);
        locCb.addEventListener("change", () => {
            try { localStorage.setItem("voxelengine.location.allow", locCb.checked ? "1" : "0"); } catch (e) {}
            if (locCb.checked) { try { window.engineLocation && window.engineLocation.get(); } catch (e) {} }
        });

        const note = document.createElement("div");
        Object.assign(note.style, {
            padding: "0 14px 10px",
            fontSize: "9px",
            color: "#996",
            opacity: "0.8",
            lineHeight: "1.35",
        });
        note.textContent = "Generating creatures via Ollama. Each will materialize in the showcase row near spawn.";

        panel.appendChild(header);
        panel.appendChild(status);
        panel.appendChild(progressOuter);
        panel.appendChild(log);
        panel.appendChild(watchRow);
        panel.appendChild(locRow);
        panel.appendChild(note);
        root.appendChild(panel);
        document.body.appendChild(root);

        this.root = root;
        this.statusEl = status;
        this.progressEl = progressInner;
        this.logEl = log;
    }

    setStatus(text) {
        if (this.statusEl) this.statusEl.textContent = text;
    }

    setProgress(pct) {
        if (this.progressEl) {
            const p = Math.max(0, Math.min(1, pct)) * 100;
            this.progressEl.style.width = `${p.toFixed(1)}%`;
        }
    }

    addLine(name, ok = true) {
        if (!this.logEl) return;
        const line = document.createElement("div");
        line.textContent = ok ? `✓ ${name}` : `✗ ${name} (failed)`;
        line.style.color = ok ? "#9c9" : "#c66";
        this.logEl.appendChild(line);
        // Auto-scroll
        this.logEl.scrollTop = this.logEl.scrollHeight;
    }

    isClosed() {
        return this.closed;
    }

    hide() {
        if (!this.root) return;
        this.root.remove();
        this.root = null;
        this.statusEl = null;
        this.progressEl = null;
        this.logEl = null;
    }
}
