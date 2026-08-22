// FILE: /ui/selfieGallery.js
// v1018 — a tiny selfie gallery for the avatar diorama. The stage captures the
// drawn pose (single OR duo) at the flash peak and posts it up; this module
// stores a DOWNSCALED copy (max 360px, keeps localStorage well under quota),
// caps the roll FIFO, and offers a full-window LCARS viewer (the panel itself
// is too small to browse in). Dependency-free.
//
//   add(dataURL, meta)  -> Promise<entry>   downscale + store (FIFO cap)
//   list()              -> [{id,dataURL,ts,scene}]   newest first
//   remove(id) / clear()
//   download(id)        -> save one as a .png
//   open() / close()    -> the viewer overlay

const STORAGE_KEY = "voxelEngine.selfieGallery";
const CAP = 16;          // keep the most recent N
const MAX_DIM = 360;     // downscale longest edge to this (thumbnail-ish, quota-safe)

function _load() { try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"); } catch { return []; } }
function _save(arr) {
    // newest-first, capped; on quota error, drop the oldest and retry a few times
    let a = arr.slice(0, CAP);
    for (let tries = 0; tries < 6; tries++) {
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(a)); return true; }
        catch { a = a.slice(0, Math.max(1, a.length - 2)); }
    }
    return false;
}
function _downscale(dataURL) {
    return new Promise((resolve) => {
        try {
            const img = new Image();
            img.onload = () => {
                try {
                    const w = img.width || 1, h = img.height || 1, s = Math.min(1, MAX_DIM / Math.max(w, h));
                    const cv = document.createElement("canvas");
                    cv.width = Math.max(1, Math.round(w * s)); cv.height = Math.max(1, Math.round(h * s));
                    const ctx = cv.getContext("2d");
                    ctx.drawImage(img, 0, 0, cv.width, cv.height);
                    resolve(cv.toDataURL("image/png"));
                } catch { resolve(dataURL); }
            };
            img.onerror = () => resolve(dataURL);
            img.src = dataURL;
        } catch { resolve(dataURL); }
    });
}

let _overlay = null;

export const selfieGallery = {
    async add(dataURL, meta = {}) {
        if (!dataURL || typeof dataURL !== "string") return null;
        const small = await _downscale(dataURL);
        const entry = { id: "s" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), dataURL: small, ts: Date.now(), scene: meta.scene || "" };
        const a = _load(); a.unshift(entry); _save(a);
        if (_overlay) selfieGallery._render();   // live-refresh if open
        return entry;
    },
    list() { return _load(); },
    remove(id) { _save(_load().filter(e => e.id !== id)); if (_overlay) selfieGallery._render(); },
    clear() { try { localStorage.removeItem(STORAGE_KEY); } catch {} if (_overlay) selfieGallery._render(); },
    count() { return _load().length; },
    download(id) {
        const e = _load().find(x => x.id === id); if (!e) return;
        try {
            const a = document.createElement("a");
            a.href = e.dataURL;
            a.download = "selfie-" + new Date(e.ts).toISOString().replace(/[:.]/g, "-").slice(0, 19) + ".png";
            document.body.appendChild(a); a.click(); a.remove();
        } catch {}
    },

    open() {
        if (_overlay) { selfieGallery._render(); return; }
        const ov = document.createElement("div");
        ov.id = "selfieGalleryOverlay";
        Object.assign(ov.style, {
            position: "fixed", inset: "0", zIndex: "200000", background: "rgba(4,7,13,0.92)",
            display: "flex", flexDirection: "column", font: "13px ui-sans-serif,system-ui,sans-serif",
            color: "#cfe3ff", backdropFilter: "blur(2px)",
        });
        const head = document.createElement("div");
        Object.assign(head.style, {
            display: "flex", alignItems: "center", gap: "12px", padding: "14px 20px",
            borderBottom: "1px solid #2a4a6a", letterSpacing: "0.08em",
        });
        const title = document.createElement("div");
        title.textContent = "SELFIE GALLERY";
        title.id = "selfieGalleryTitle";
        Object.assign(title.style, { fontWeight: "800", color: "#7fb8ff", letterSpacing: "0.18em", flex: "1 1 auto" });
        const mkBtn = (label, bg) => {
            const b = document.createElement("button");
            b.textContent = label;
            Object.assign(b.style, {
                cursor: "pointer", border: "1px solid #3a5a7a", background: bg || "rgba(12,18,30,0.9)",
                color: "#cfe3ff", borderRadius: "8px", padding: "7px 14px", fontWeight: "700", letterSpacing: "0.06em",
            });
            return b;
        };
        const clearBtn = mkBtn("Clear all", "rgba(60,20,24,0.85)");
        clearBtn.addEventListener("click", () => { if (confirm("Delete all selfies?")) selfieGallery.clear(); });
        const closeBtn = mkBtn("\u2715 Close");
        closeBtn.addEventListener("click", () => selfieGallery.close());
        head.append(title, clearBtn, closeBtn);

        const grid = document.createElement("div");
        grid.id = "selfieGalleryGrid";
        Object.assign(grid.style, {
            flex: "1 1 auto", overflowY: "auto", padding: "18px 20px",
            display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: "14px", alignContent: "start",
        });
        ov.append(head, grid);
        document.body.appendChild(ov);
        _overlay = ov;
        ov.addEventListener("click", (e) => { if (e.target === ov) selfieGallery.close(); });
        selfieGallery._render();
    },
    close() { if (_overlay) { try { _overlay.remove(); } catch {} _overlay = null; } },

    _render() {
        if (!_overlay) return;
        const grid = _overlay.querySelector("#selfieGalleryGrid");
        const title = _overlay.querySelector("#selfieGalleryTitle");
        const items = _load();
        if (title) title.textContent = "SELFIE GALLERY  (" + items.length + ")";
        grid.textContent = "";
        if (!items.length) {
            const empty = document.createElement("div");
            empty.textContent = "No selfies yet \u2014 tap the camera on the avatar panel.";
            Object.assign(empty.style, { gridColumn: "1 / -1", textAlign: "center", color: "#6f8bb0", padding: "40px 0" });
            grid.appendChild(empty);
            return;
        }
        for (const e of items) {
            const card = document.createElement("div");
            Object.assign(card.style, { position: "relative", borderRadius: "10px", overflow: "hidden", border: "1px solid #2a4a6a", background: "#0a0e16" });
            const img = document.createElement("img");
            img.src = e.dataURL; img.title = "Click to download";
            Object.assign(img.style, { display: "block", width: "100%", height: "auto", cursor: "pointer" });
            img.addEventListener("click", () => selfieGallery.download(e.id));
            const when = document.createElement("div");
            when.textContent = new Date(e.ts).toLocaleString();
            Object.assign(when.style, { fontSize: "10.5px", color: "#7f9ec0", padding: "5px 8px", display: "flex", justifyContent: "space-between", alignItems: "center" });
            if (e.scene && e.scene !== "diorama") { const tag = document.createElement("span"); tag.textContent = e.scene; tag.style.color = "#5f7da0"; when.appendChild(tag); }
            const del = document.createElement("button");
            del.textContent = "\u2715"; del.title = "Delete";
            Object.assign(del.style, {
                position: "absolute", top: "6px", right: "6px", width: "24px", height: "24px", borderRadius: "6px",
                border: "1px solid #5a3a3a", background: "rgba(20,8,10,0.8)", color: "#ffb0b0", cursor: "pointer", lineHeight: "1", fontWeight: "700",
            });
            del.addEventListener("click", (ev) => { ev.stopPropagation(); selfieGallery.remove(e.id); });
            card.append(img, when, del);
            grid.appendChild(card);
        }
    },
};
export default selfieGallery;
