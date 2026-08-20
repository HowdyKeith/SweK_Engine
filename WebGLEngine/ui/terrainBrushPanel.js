// FILE: ui/terrainBrushPanel.js
// VERSION: v1353 — terrain sculpting brush for the SANDBOX demo. Sets
// window._terrainBrush = { mode, type, radius, strength }; SandboxMode reads it
// on a voxel click and edits the world via world.setVoxel (which remeshes the
// touched chunks). When mode is "off" the click falls through to the normal
// arm-spawn behaviour, so the brush and the asset spawner coexist.
//
//   Raise  — add voxels of the chosen block out from the clicked face (stack = strength)
//   Lower  — carve voxels in from the clicked face (depth = strength)
//   Paint  — recolour the clicked voxel(s) to the chosen block (no height change)
//   Erase  — clear voxels (to AIR)
//   radius — round brush footprint on the clicked surface (0 = single voxel)

const BLOCKS = [
    { id: 1,  name: "Stone", color: "#8a8a8a" },
    { id: 2,  name: "Dirt",  color: "#7a5a3a" },
    { id: 3,  name: "Grass", color: "#4caf50" },
    { id: 4,  name: "Sand",  color: "#e0cda0" },
    { id: 5,  name: "Snow",  color: "#eef3f7" },
    { id: 6,  name: "Ash",   color: "#565656" },
    { id: 10, name: "Water", color: "#3a78c8" },
    { id: 12, name: "Lava",  color: "#e0531f" },
];
const NAMES = { 0: "Air", 1: "Stone", 2: "Dirt", 3: "Grass", 4: "Sand", 5: "Snow", 6: "Ash", 10: "Water", 12: "Lava" };
const MODES = ["off", "raise", "lower", "paint", "erase"];

export function mountTerrainBrushPanel() {
    // shared brush state read by SandboxMode
    window._terrainBrush = window._terrainBrush || { mode: "off", type: 1, radius: 1, strength: 1 };
    window._voxelName = (id) => NAMES[id] || ("#" + id);
    const tb = window._terrainBrush;

    const root = document.createElement("div");
    root.id = "terrainBrushPanel";
    root.style.cssText = "width:228px; color:#cde; font:11px ui-monospace, monospace; padding:8px 9px;";   // v1356 — docked tab (was fixed overlay)

    const head = document.createElement("div");
    head.style.cssText = "display:flex; align-items:center; gap:6px; margin-bottom:6px;";
    head.innerHTML = '<span style="flex:1; letter-spacing:.06em; color:#8af0c8; font-weight:600;">\u26F0 TERRAIN BRUSH</span>';
    const min = document.createElement("button");
    min.textContent = "\u2013";
    min.title = "collapse";
    min.style.cssText = "width:22px; height:22px; border:1px solid #2a4038; border-radius:6px; background:#0c1a12; color:#8af0c8; cursor:pointer; line-height:1;";
    head.appendChild(min);
    root.appendChild(head);

    const bodyWrap = document.createElement("div");
    root.appendChild(bodyWrap);
    min.addEventListener("click", () => { bodyWrap.style.display = bodyWrap.style.display === "none" ? "" : "none"; min.textContent = bodyWrap.style.display === "none" ? "+" : "\u2013"; });

    const note = document.createElement("div");
    note.style.cssText = "color:#7f9; opacity:.7; font-size:10px; line-height:1.4; margin-bottom:7px;";
    note.textContent = "Active in SANDBOX. Click the ground to sculpt. \u201cOff\u201d returns clicks to asset-spawn.";
    bodyWrap.appendChild(note);

    // --- mode row ---
    const modeRow = document.createElement("div");
    modeRow.style.cssText = "display:flex; flex-wrap:wrap; gap:4px; margin-bottom:7px;";
    const modeBtns = {};
    MODES.forEach((m) => {
        const b = document.createElement("button");
        b.textContent = m;
        b.style.cssText = "flex:1 0 auto; padding:5px 7px; border-radius:7px; border:1px solid #2a4038; background:#0c1a12; color:#cde; cursor:pointer; text-transform:capitalize;";
        b.addEventListener("click", () => { tb.mode = m; paintModes(); });
        modeBtns[m] = b; modeRow.appendChild(b);
    });
    bodyWrap.appendChild(modeRow);
    function paintModes() {
        MODES.forEach((m) => {
            const on = tb.mode === m;
            const b = modeBtns[m];
            b.style.background = on ? (m === "off" ? "rgba(120,140,150,.25)" : "rgba(138,240,200,.20)") : "#0c1a12";
            b.style.borderColor = on ? (m === "off" ? "#8aa" : "#8af0c8") : "#2a4038";
            b.style.color = on ? (m === "off" ? "#cde" : "#8af0c8") : "#cde";
        });
    }

    // --- block swatches ---
    const blkLabel = document.createElement("div");
    blkLabel.style.cssText = "color:#9ab; font-size:10px; margin-bottom:3px;";
    blkLabel.textContent = "Block";
    bodyWrap.appendChild(blkLabel);
    const blkRow = document.createElement("div");
    blkRow.style.cssText = "display:flex; flex-wrap:wrap; gap:4px; margin-bottom:8px;";
    const blkBtns = {};
    BLOCKS.forEach((bl) => {
        const b = document.createElement("button");
        b.title = bl.name;
        b.style.cssText = "width:38px; height:30px; border-radius:6px; border:2px solid #2a4038; background:" + bl.color + "; cursor:pointer; position:relative;";
        b.innerHTML = '<span style="position:absolute; left:0; right:0; bottom:1px; font-size:8px; color:#000a; text-shadow:0 0 2px #fff8;">' + bl.name + '</span>';
        b.addEventListener("click", () => { tb.type = bl.id; paintBlocks(); });
        blkBtns[bl.id] = b; blkRow.appendChild(b);
    });
    bodyWrap.appendChild(blkRow);
    function paintBlocks() { BLOCKS.forEach((bl) => { blkBtns[bl.id].style.borderColor = (tb.type === bl.id) ? "#8af0c8" : "#2a4038"; }); }

    // --- sliders ---
    function slider(labelTxt, key, min, max, val) {
        const wrap = document.createElement("div");
        wrap.style.cssText = "display:flex; align-items:center; gap:7px; margin:5px 0;";
        const lab = document.createElement("span"); lab.style.cssText = "flex:0 0 58px; color:#9ab; font-size:10px;"; lab.textContent = labelTxt;
        const inp = document.createElement("input"); inp.type = "range"; inp.min = min; inp.max = max; inp.step = 1; inp.value = val; inp.style.cssText = "flex:1; accent-color:#8af0c8;";
        const out = document.createElement("span"); out.style.cssText = "flex:0 0 18px; text-align:right; color:#8af0c8;"; out.textContent = val;
        inp.addEventListener("input", () => { tb[key] = parseInt(inp.value, 10); out.textContent = inp.value; });
        wrap.appendChild(lab); wrap.appendChild(inp); wrap.appendChild(out);
        return wrap;
    }
    bodyWrap.appendChild(slider("Radius", "radius", 0, 4, tb.radius));
    bodyWrap.appendChild(slider("Strength", "strength", 1, 6, tb.strength));

    // v1356 — undo last brush stroke (restores the voxels it changed)
    window._sandboxUndo = function () {
        const log = window._sandboxVoxelEdits || [];
        const w = window.world;
        if (!log.length || !w || typeof w.setVoxel !== "function") return 0;
        const last = log[log.length - 1].s;
        let n = 0;
        while (log.length && log[log.length - 1].s === last) {
            const e = log.pop();
            try { w.setVoxel(e.x, e.y, e.z, (e.prev != null ? e.prev : 0)); n++; } catch {}
        }
        return n;
    };
    const undoRow = document.createElement("div");
    undoRow.style.cssText = "display:flex; align-items:center; gap:7px; margin-top:7px;";
    const undoBtn = document.createElement("button");
    undoBtn.textContent = "\u21B6 Undo last";
    undoBtn.style.cssText = "flex:1; padding:5px 8px; border-radius:7px; border:1px solid #2a4038; background:#0c1a12; color:#cde; cursor:pointer;";
    const undoStat = document.createElement("span"); undoStat.style.cssText = "flex:0 0 auto; color:#8af0c8; font-size:10px;";
    undoBtn.onclick = () => { const n = window._sandboxUndo(); undoStat.textContent = n ? ("\u2713 " + n) : "nothing"; setTimeout(() => undoStat.textContent = "", 1800); };
    undoBtn.onmouseenter = () => undoBtn.style.borderColor = "#8af0c8"; undoBtn.onmouseleave = () => undoBtn.style.borderColor = "#2a4038";
    undoRow.appendChild(undoBtn); undoRow.appendChild(undoStat); bodyWrap.appendChild(undoRow);

    paintModes(); paintBlocks();   // v1356 — no self-append; the dock parents it

    return {
        root,
        get() { return window._terrainBrush; },
        setMode(m) { if (MODES.includes(m)) { tb.mode = m; paintModes(); } },
        destroy() { try { root.remove(); } catch {} },
    };
}

export default mountTerrainBrushPanel;
