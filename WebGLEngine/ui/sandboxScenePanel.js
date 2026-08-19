// FILE: ui/sandboxScenePanel.js
// VERSION: v1355 — save / load / share a SANDBOX scene. A scene is the placed
// assets (from window._stage's tracked ids) + the terrain edits the brush made
// (window._sandboxVoxelEdits) + a seed stamp. Capture/load run in the engine
// context using the live globals (router / renderBridge / _stage / world).
//   Export  → downloads scene JSON          Load file → re-spawns + replays edits
//   Save    → also stores on the bridge by name (GET/POST /sandbox/scene[s])
//   Bridge  → list + load server-side scenes (the share path between devices)
//   Clear   → despawns the placed assets (terrain edits are not auto-reverted)

function captureScene() {
    const rb = window._renderBridge, stage = window._stage;
    let ents = [];
    try { ents = (rb && rb.getVisibleEntities && rb.getVisibleEntities()) || []; } catch {}
    const ids = stage && Array.isArray(stage._ids) ? new Set(stage._ids) : null;
    const floorId = stage ? stage._floorId : null;
    if (ids) ents = ents.filter((e) => ids.has(e.id) && e.id !== floorId);
    const entities = ents.map((e) => ({
        assetId: e.assetId, kind: e.kind,
        x: e.x, y: e.y, z: e.z,
        scale: (typeof e.scale === "number") ? e.scale : (e.scaleX || 1),
    })).filter((e) => e.assetId || e.kind);
    const voxels = (window._sandboxVoxelEdits || []).slice();
    let seed = null;
    try { seed = (typeof window.worldSeed === "function") ? window.worldSeed() : (window.worldSeed && window.worldSeed.seed) || null; } catch {}
    return { v: 1, savedAt: Date.now(), seed, entities, voxels };
}

function loadScene(scene) {
    if (!scene || typeof scene !== "object") return { ok: false, error: "not a scene" };
    let spawned = 0, edited = 0;
    (scene.entities || []).forEach((en) => {
        try {
            const r = window.router && window.router.exec({
                type: "entity:spawnMesh", assetId: en.assetId, kind: en.kind,
                x: en.x, y: en.y, z: en.z, scale: en.scale != null ? en.scale : 1,
            });
            if (r && r.id != null) { spawned++; try { window._stage && window._stage.add && window._stage.add(r.id); } catch {} }
        } catch {}
    });
    const w = window.world;
    if (w && typeof w.setVoxel === "function") {
        (scene.voxels || []).forEach((v) => { try { w.setVoxel(v.x, v.y, v.z, v.id); edited++; } catch {} });
        // remember replayed edits so a re-save keeps them
        const log = (window._sandboxVoxelEdits = window._sandboxVoxelEdits || []);
        (scene.voxels || []).forEach((v) => { if (log.length < 50000) log.push(v); });
    }
    return { ok: true, spawned, edited };
}

function clearPlaced() {
    const stage = window._stage; if (!stage || !Array.isArray(stage._ids)) return 0;
    const floorId = stage._floorId; let n = 0;
    stage._ids.slice().forEach((id) => {
        if (id === floorId) return;
        try { window.router && window.router.exec({ type: "entity:despawn", id }); n++; } catch {}
    });
    return n;
}

export function mountSandboxScenePanel() {
    window._sandboxScene = { capture: captureScene, load: loadScene, clear: clearPlaced };

    const root = document.createElement("div");
    root.id = "sandboxScenePanel";
    root.style.cssText = "width:212px; color:#cde; font:11px ui-monospace, monospace; padding:8px 9px;";   // v1356 — docked tab

    const head = document.createElement("div");
    head.style.cssText = "display:flex; align-items:center; gap:6px; margin-bottom:6px;";
    head.innerHTML = '<span style="flex:1; letter-spacing:.06em; color:#8af0c8; font-weight:600;">\uD83D\uDDFA SANDBOX SCENE</span>';
    const min = document.createElement("button");
    min.textContent = "\u2013"; min.title = "collapse";
    min.style.cssText = "width:22px; height:22px; border:1px solid #2a4038; border-radius:6px; background:#0c1a12; color:#8af0c8; cursor:pointer; line-height:1;";
    head.appendChild(min); root.appendChild(head);

    const body = document.createElement("div"); root.appendChild(body);
    min.addEventListener("click", () => { body.style.display = body.style.display === "none" ? "" : "none"; min.textContent = body.style.display === "none" ? "+" : "\u2013"; });

    const stat = document.createElement("div");
    stat.style.cssText = "color:#7f9; opacity:.8; font-size:10px; line-height:1.4; margin-bottom:7px; min-height:1.3em;";
    body.appendChild(stat);
    function refreshStat() {
        const sc = captureScene();
        stat.textContent = sc.entities.length + " placed \u00b7 " + (window._sandboxVoxelEdits || []).length + " terrain edits";
    }

    function mkBtn(label) {
        const b = document.createElement("button");
        b.textContent = label;
        b.style.cssText = "display:block; width:100%; margin:4px 0; padding:6px 8px; text-align:left; border-radius:7px; border:1px solid #2a4038; background:#0c1a12; color:#cde; cursor:pointer;";
        b.onmouseenter = () => b.style.borderColor = "#8af0c8";
        b.onmouseleave = () => b.style.borderColor = "#2a4038";
        body.appendChild(b); return b;
    }
    function msg(t) { stat.textContent = t; setTimeout(refreshStat, 2200); }

    // Export to file
    mkBtn("\u2b07 Export to file").onclick = () => {
        const sc = captureScene();
        const blob = new Blob([JSON.stringify(sc, null, 2)], { type: "application/json" });
        const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
        a.download = "sandbox-scene-" + new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-") + ".json";
        document.body.appendChild(a); a.click();
        setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
        msg("\u2b07 exported (" + sc.entities.length + " assets)");
    };

    // Load from file
    const file = document.createElement("input"); file.type = "file"; file.accept = "application/json,.json"; file.style.display = "none"; body.appendChild(file);
    mkBtn("\u2b06 Load from file").onclick = () => file.click();
    file.onchange = (e) => {
        const f = e.target.files && e.target.files[0]; if (!f) return;
        const rd = new FileReader();
        rd.onload = () => { try { const r = loadScene(JSON.parse(rd.result)); msg("\u2b06 loaded " + r.spawned + " assets, " + r.edited + " edits"); } catch { msg("\u2717 not a valid scene file"); } };
        rd.readAsText(f); file.value = "";
    };

    // Save to bridge (named, shareable across devices)
    mkBtn("\uD83D\uDCBE Save to bridge\u2026").onclick = () => {
        const name = prompt("Name this scene:"); if (!name) return;
        const sc = captureScene();
        fetch("/sandbox/scene", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: name.trim(), scene: sc }) })
            .then((r) => r.json()).then((j) => msg(j && j.ok ? ("\uD83D\uDCBE saved \u201c" + name.trim() + "\u201d") : "\u2717 save failed")).catch(() => msg("\u2717 bridge unreachable"));
    };

    // Load from bridge (list)
    mkBtn("\u2601 Bridge scenes\u2026").onclick = () => {
        fetch("/sandbox/scenes", { cache: "no-store" }).then((r) => r.json()).then((j) => {
            const scenes = (j && j.scenes) || {};
            const names = Object.keys(scenes);
            if (!names.length) { msg("no saved scenes on the bridge"); return; }
            const pick = prompt("Load which scene?\n\n" + names.map((n, i) => (i + 1) + ". " + n).join("\n") + "\n\nType the number or name:");
            if (!pick) return;
            let key = names[parseInt(pick, 10) - 1] || (names.indexOf(pick.trim()) >= 0 ? pick.trim() : null);
            if (!key || !scenes[key]) { msg("\u2717 no scene \u201c" + pick + "\u201d"); return; }
            const r = loadScene(scenes[key]); msg("\u2b06 loaded \u201c" + key + "\u201d: " + r.spawned + " assets");
        }).catch(() => msg("\u2717 bridge unreachable"));
    };

    // Clear placed
    mkBtn("\uD83D\uDDD1 Clear placed assets").onclick = () => {
        const n = clearPlaced(); msg("\uD83D\uDDD1 despawned " + n + " (terrain edits stay)");
    };

    refreshStat();   // v1356 — docked by caller
    setInterval(refreshStat, 4000);

    return { root, capture: captureScene, load: loadScene, clear: clearPlaced, destroy() { try { root.remove(); } catch {} } };
}

export default mountSandboxScenePanel;
