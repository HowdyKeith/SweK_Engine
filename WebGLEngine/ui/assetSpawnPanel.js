// FILE: ui/assetSpawnPanel.js
// VERSION: v614 — left-docked panel that arms an asset for click-to-spawn in
// the SANDBOX demo.
//
// Workflow:
//   1. Click any row in the panel → window._armedAsset is set, row highlights.
//   2. While in the SANDBOX demo: clicking on a voxel in the world spawns
//      that asset at the clicked voxel's face (SandboxMode reads
//      window._armedAsset and routes entity:spawnMesh).
//   3. Outside sandbox: the panel still lets you arm, but clicks in the world
//      don't fire because SandboxMode isn't installed. A future "picker
//      mode toggle" round will generalize this to any demo.
//
// Categories:
//   KAIJU (the 9 kinds the engine recognises) — scale 1.2, both assetId and
//     kind use the "kaiju_*" naming.
//   PROPS (obelisk / chest / floor plate / test_rig) — different scales pulled
//     from main.js's existing spawn sites so they look right at default size.
//   GLBs — populated async from /assets/list (whatever's in GPU_Assets/).
//     This is where Kaggle-generated meshes land after /kaggle/download.

const BUILTIN = {
    "KAIJU": [
        { label: "Sky",          assetId: "kaiju_sky",          kind: "kaiju_sky",          scale: 1.2 },
        { label: "Space",        assetId: "kaiju_space",        kind: "kaiju_space",        scale: 1.2 },
        { label: "Cave",         assetId: "kaiju_cave",         kind: "kaiju_cave",         scale: 1.2 },
        { label: "Underground",  assetId: "kaiju_underground",  kind: "kaiju_underground",  scale: 1.2 },
        { label: "Water",        assetId: "kaiju_water",        kind: "kaiju_water",        scale: 1.2 },
        { label: "Hell",         assetId: "kaiju_hell",         kind: "kaiju_hell",         scale: 1.2 },
        { label: "Tech",         assetId: "kaiju_tech",         kind: "kaiju_tech",         scale: 1.2 },
        { label: "Ice",          assetId: "kaiju_ice",          kind: "kaiju_ice",          scale: 1.2 },
        { label: "Ogre Hull",    assetId: "kaiju_ogre_hull",    kind: "kaiju_ogre_hull",    scale: 1.2 },
    ],
    "SEA LIFE": [
        { label: "Stingray",     assetId: "sea_ray",            kind: "sea_ray",            scale: 0.5 },
        { label: "Sea Turtle",   assetId: "sea_turtle",         kind: "sea_turtle",         scale: 0.5 },
        { label: "Octopus",      assetId: "sea_octopus",        kind: "sea_octopus",        scale: 0.5 },
        { label: "Jellyfish",    assetId: "sea_jelly",          kind: "sea_jelly",          scale: 0.5 },
        { label: "Shrimp",       assetId: "sea_shrimp",         kind: "sea_shrimp",         scale: 0.3 },
        { label: "Sea Monkey",   assetId: "sea_monkey",         kind: "sea_monkey",         scale: 0.3 },
        { label: "Kelp",         assetId: "sea_kelp",           kind: "sea_kelp",           scale: 0.6 },
    ],
    "CORAL": [
        { label: "Brain Coral",  assetId: "coral_brain",        kind: "coral_brain",        scale: 0.5 },
        { label: "Red Brain",    assetId: "coral_brain_red",    kind: "coral_brain_red",    scale: 0.5 },
        { label: "Staghorn",     assetId: "coral_staghorn",     kind: "coral_staghorn",     scale: 0.5 },
        { label: "Table Coral",  assetId: "coral_table",        kind: "coral_table",        scale: 0.5 },
        { label: "Pillar Coral", assetId: "coral_pillar",       kind: "coral_pillar",       scale: 0.5 },
    ],
    "PROPS": [
        { label: "Obelisk",      assetId: "obelisk",            kind: "obelisk",            scale: 3.0 },
        { label: "Chest",        assetId: "wad_prop_chest",     kind: "wad_prop_chest",     scale: 0.32 },
        { label: "Floor Plate",  assetId: "wad_plate",          kind: "stage_floor",        scale: 10.0 },
        { label: "Test Rig",     assetId: "test_rig",           kind: "rig",                scale: 1.0 },
    ],
};

const H   = { fontWeight: "700", color: "#fc6", fontSize: "12px", margin: "8px 4px 2px", textTransform: "uppercase", letterSpacing: "0.1em" };
const CAT = { color: "#9fb", fontSize: "10px", fontWeight: "700", margin: "10px 4px 3px", textTransform: "uppercase", letterSpacing: "0.1em" };
const ROW_BASE  = { padding: "3px 8px", margin: "1px 0", border: "1px solid transparent", borderRadius: "3px", cursor: "pointer", fontSize: "11px" };
const ROW_ARMED = { ...ROW_BASE, border: "1px solid #fc6", background: "rgba(255,200,80,0.2)", color: "#fc6", fontWeight: "700" };
const ARMED_BAR = { padding: "5px 8px", margin: "4px 0 6px", background: "rgba(255,200,80,0.1)", border: "1px solid #356", borderRadius: "4px", fontSize: "11px" };
const BTN = { padding: "4px 8px", border: "1px solid #6cf", borderRadius: "3px", cursor: "pointer", textAlign: "center", fontSize: "10px", marginTop: "6px", background: "rgba(102,204,255,0.08)" };

function el(t, s, x) { const e = document.createElement(t); if (s) Object.assign(e.style, s); if (x != null) e.textContent = x; return e; }

export function mountAssetSpawnPanel() {
    const root = el("div", { width: "280px", color: "#cde", font: "11px ui-monospace, monospace", padding: "2px 2px 6px" });
    root.appendChild(el("div", H, "SPAWN ASSET"));
    const note = el("div", { fontSize: "10px", color: "#9ab", padding: "0 4px 4px", lineHeight: "1.4" }, "Pick an asset, then click on the world floor in SANDBOX demo to drop one there.");
    root.appendChild(note);

    // v616 — Global Picker toggle. Off by default. When ON, the picker
    // (hover yellow + click cyan + click-to-spawn-armed) works in ANY demo,
    // not just SANDBOX. Persists across reloads.
    const pickerToggle = el("div", { ...BTN, marginTop: "0", marginBottom: "8px" });
    const renderPickerToggle = () => {
        const on = !!(window._globalPicker && window._globalPicker.isInstalled());
        pickerToggle.textContent = on ? "✓ Global picker: ON (any demo)" : "Global picker: OFF";
        pickerToggle.style.background = on ? "rgba(255,200,80,0.18)" : "rgba(102,204,255,0.08)";
        pickerToggle.style.borderColor = on ? "#fc6" : "#6cf";
        pickerToggle.style.color = on ? "#fc6" : "#cde";
    };
    pickerToggle.addEventListener("click", () => {
        try {
            if (window._globalPicker) {
                const nowOn = window._globalPicker.toggle();
                try { localStorage.setItem("voxelengine.globalPicker", nowOn ? "1" : "0"); } catch {}
            } else {
                console.warn("[spawnPanel] window._globalPicker not initialised yet");
            }
        } catch (e) { console.warn("[spawnPanel] picker toggle failed:", e?.message); }
        renderPickerToggle();
    });
    root.appendChild(pickerToggle);
    // restore persisted toggle state after main.js has initialised the picker
    setTimeout(() => {
        try {
            if (localStorage.getItem("voxelengine.globalPicker") === "1" && window._globalPicker && !window._globalPicker.isInstalled()) {
                window._globalPicker.install();
            }
        } catch {}
        renderPickerToggle();
    }, 400);
    // poll every few seconds so the button reflects state if the picker is
    // toggled programmatically elsewhere (e.g. by a future demo).
    setInterval(renderPickerToggle, 2500);

    const armedBar = el("div", ARMED_BAR);
    armedBar.innerHTML = "Armed: <span style='opacity:0.6'>(none)</span>";
    root.appendChild(armedBar);

    const body = el("div");
    root.appendChild(body);

    let glbItems = [];           // populated by refreshGlbs()
    let glbStatus = "loading...";

    function setArmed(asset) {
        window._armedAsset = asset || null;
        armedBar.innerHTML = asset
            ? "Armed: <span style='color:#fc6;font-weight:700'>" + asset.label + "</span>  <span style='opacity:0.6'>" + (asset.kind || "") + "</span>"
            : "Armed: <span style='opacity:0.6'>(none)</span>";
        renderRows();
    }

    function renderRows() {
        body.innerHTML = "";
        const armed = window._armedAsset;
        const drawRow = (item) => {
            const isArmed = armed && armed.assetId === item.assetId && armed.kind === item.kind;
            const row = el("div", isArmed ? ROW_ARMED : ROW_BASE, item.label);
            row.title = `assetId=${item.assetId}  kind=${item.kind}  scale=${item.scale}`;
            row.addEventListener("click", () => setArmed(isArmed ? null : item));
            return row;
        };
        for (const [cat, items] of Object.entries(BUILTIN)) {
            body.appendChild(el("div", CAT, cat));
            for (const item of items) body.appendChild(drawRow(item));
        }
        // GLB section — from /assets/list (GPU_Assets/)
        body.appendChild(el("div", CAT, "GLBs (GPU_Assets/)"));
        if (!glbItems.length) {
            const empty = el("div", { fontStyle: "italic", opacity: "0.55", padding: "2px 8px", fontSize: "10px" }, glbStatus);
            body.appendChild(empty);
        } else {
            for (const item of glbItems) body.appendChild(drawRow(item));
        }
    }

    function refreshGlbs() {
        glbStatus = "loading...";
        glbItems = [];
        renderRows();
        fetch("/assets/list", { cache: "no-cache" })
            .then(r => r.json())
            .then(j => {
                const names = (j && j.ok && Array.isArray(j.assets)) ? j.assets
                            : Array.isArray(j) ? j
                            : (j && j.assets) ? j.assets : [];
                glbItems = names.slice(0, 60).map(name => ({
                    label: name,
                    assetId: name,
                    kind: "asset_" + name,        // a unique kind per asset id so the renderer routes it
                    scale: 1.0,
                }));
                glbStatus = glbItems.length ? "" : "(none — drop .glb in GPU_Assets/ or download from Kaggle, then refresh)";
                renderRows();
            })
            .catch(e => {
                glbStatus = "(/assets/list unavailable: " + (e?.message || "fetch failed") + ")";
                renderRows();
            });
    }

    const refreshBtn = el("div", BTN, "↻ Refresh GLB list");
    refreshBtn.addEventListener("click", refreshGlbs);
    root.appendChild(refreshBtn);

    const clearBtn = el("div", BTN, "Disarm");
    clearBtn.addEventListener("click", () => setArmed(null));
    root.appendChild(clearBtn);

    renderRows();
    refreshGlbs();

    return {
        root,
        refresh: refreshGlbs,
        getArmed() { return window._armedAsset || null; },
        setArmed,
    };
}
