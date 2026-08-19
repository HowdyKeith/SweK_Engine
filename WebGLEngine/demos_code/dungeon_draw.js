// demos_code/dungeon_draw.js — v1461
// DRAW-YOUR-OWN DUNGEON: a paint-grid editor. Carve floor out of solid rock,
// then "Build & Play" hands the grid to window.dungeonLayout.fromGrid(), which
// builds it in voxels and drops you in first-person on that exact layout.
// Entrance + treasure are auto-derived from the open cells by the dungeon.

let _overlay = null;

function _build() {
    if (typeof document === "undefined" || _overlay) return;
    let GW = 23, GH = 23;                       // odd grid (matches the voxel dungeon)
    let wall = new Uint8Array(GW * GH).fill(1);  // 1 = solid rock, 0 = carved floor
    let brushFloor = true;                       // paint floor (carve); toggle to paint wall
    let painting = false;

    const ov = document.createElement("div");
    ov.style.cssText = "position:fixed;inset:0;z-index:400;background:rgba(6,9,13,0.92);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;font:13px system-ui,sans-serif;color:#dde6f2;";
    const title = document.createElement("div");
    title.innerHTML = "<b>\uD83C\uDFF0 Draw your dungeon</b> \u2014 drag to carve floor out of the rock. It builds in voxels and drops you in first-person.";
    title.style.cssText = "max-width:560px;text-align:center;line-height:1.4;";

    const cellPx = 18;
    const cv = document.createElement("canvas");
    cv.style.cssText = "background:#0b0e13;border:1px solid #2a3645;border-radius:6px;cursor:crosshair;touch-action:none;";
    const ctx = cv.getContext("2d");
    const sizeCv = () => { cv.width = GW * cellPx; cv.height = GH * cellPx; };
    const draw = () => {
        ctx.clearRect(0, 0, cv.width, cv.height);
        for (let z = 0; z < GH; z++) for (let x = 0; x < GW; x++) {
            const w = wall[z * GW + x];
            ctx.fillStyle = w ? "#1a2330" : "#5a7d9a";
            ctx.fillRect(x * cellPx + 1, z * cellPx + 1, cellPx - 1, cellPx - 1);
        }
    };
    const cellAt = (ev) => {
        const r = cv.getBoundingClientRect();
        const x = Math.floor((ev.clientX - r.left) / cellPx), z = Math.floor((ev.clientY - r.top) / cellPx);
        if (x < 0 || z < 0 || x >= GW || z >= GH) return null;
        return [x, z];
    };
    const paintAt = (ev) => { const c = cellAt(ev); if (!c) return; wall[c[1] * GW + c[0]] = brushFloor ? 0 : 1; draw(); };
    cv.addEventListener("pointerdown", (e) => { painting = true; paintAt(e); });
    cv.addEventListener("pointermove", (e) => { if (painting) paintAt(e); });
    window.addEventListener("pointerup", () => { painting = false; });

    // toolbar
    const bar = document.createElement("div"); bar.style.cssText = "display:flex;gap:8px;align-items:center;flex-wrap:wrap;justify-content:center;";
    const mkBtn = (txt, primary) => { const b = document.createElement("button"); b.textContent = txt; b.style.cssText = "padding:7px 14px;border-radius:6px;cursor:pointer;font-size:12px;" + (primary ? "background:#2a4d3a;color:#cfe;border:1px solid #4a7d5a;" : "background:#16202c;color:#cde;border:1px solid #2a3340;"); return b; };
    const brushBtn = mkBtn("Brush: carve floor");
    brushBtn.onclick = () => { brushFloor = !brushFloor; brushBtn.textContent = brushFloor ? "Brush: carve floor" : "Brush: add wall"; };
    const roomBtn = mkBtn("Carve a room");
    roomBtn.onclick = () => { for (let z = 2; z < GH - 2; z++) for (let x = 2; x < GW - 2; x++) wall[z * GW + x] = 0; draw(); };
    const clearBtn = mkBtn("Clear (solid)");
    clearBtn.onclick = () => { wall.fill(1); draw(); };
    const sizeBtn = mkBtn("Size: 23\u00d723");
    sizeBtn.onclick = () => { const opts = [17, 23, 29, 35]; const i = (opts.indexOf(GW) + 1) % opts.length; GW = GH = opts[i]; wall = new Uint8Array(GW * GH).fill(1); sizeBtn.textContent = "Size: " + GW + "\u00d7" + GH; sizeCv(); draw(); };
    const playBtn = mkBtn("\u2694 Build & Play", true);
    const msg = document.createElement("div"); msg.style.cssText = "font-size:11px;color:#8b97a8;min-height:14px;";
    playBtn.onclick = () => {
        let open = 0; for (let i = 0; i < wall.length; i++) if (!wall[i]) open++;
        if (open < 2) { msg.style.color = "#f88"; msg.textContent = "Carve at least a couple of floor cells first."; return; }
        try {
            if (!window.dungeonLayout || !window.dungeonLayout.fromGrid) { msg.style.color = "#f88"; msg.textContent = "Dungeon layout API not available."; return; }
            _close();
            window.dungeonLayout.fromGrid({ GW, GH, wall });
        } catch (e) { msg.style.color = "#f88"; msg.textContent = "Build failed: " + (e && e.message || e); }
    };
    const closeBtn = mkBtn("Close");
    closeBtn.onclick = () => _close();
    bar.append(brushBtn, roomBtn, clearBtn, sizeBtn, playBtn, closeBtn);

    ov.append(title, cv, bar, msg);
    document.body.appendChild(ov);
    _overlay = ov;
    sizeCv(); draw();
}

function _close() { if (_overlay) { try { _overlay.remove(); } catch {} _overlay = null; } }

export default {
    id: "dungeon_draw",
    label: "DUNGEON \u2014 draw your own (grid editor)",
    hint: "paint walls/floor \u2192 build it in voxels \u2192 play first-person",
    start() { _build(); },
    stop() { _close(); },
};
