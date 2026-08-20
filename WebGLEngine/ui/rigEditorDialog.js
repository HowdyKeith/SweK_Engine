// FILE: ui/rigEditorDialog.js
// VERSION: v1 (v817 — step 4 of rig integration)
//
// Visual list-based editor for rig assets. Loads the rig's JSON, lets
// you add/remove bones and edit their fields, then writes back to the
// library by calling assetLibrary.add() with a new id and removing the
// old one (we don't have an "update" endpoint — duplicate-and-replace
// is the simplest path that exercises existing endpoints).

/**
 * @param {Object} asset — the rig asset meta (must have type='rig')
 * @param {function} onSaved — optional callback called after save with the new asset
 */
export async function openRigEditor(asset, onSaved) {
    if (asset?.type !== "rig") {
        alert("Rig editor: asset is not a rig");
        return;
    }

    // Fetch the rig data
    let rigData;
    try {
        const r = await window.assetLibrary.get(asset.id);
        if (r?.error) throw new Error(r.error);
        rigData = r.data;
    } catch (e) {
        alert("Failed to load rig: " + e.message);
        return;
    }
    // Defensive defaults
    if (!rigData || !Array.isArray(rigData.bones)) rigData = { bones: [] };
    // Working copy — don't mutate the original until save
    const bones = rigData.bones.map(b => ({
        id: String(b.id),
        name: b.name || "",
        position: [b.position?.[0] ?? 0, b.position?.[1] ?? 0, b.position?.[2] ?? 0],
        parent: b.parent ?? -1,
    }));

    // v819 — install a "ghost" rig in the scene so the user sees the
    // skeleton in 3D while editing. Updates to bone positions in the
    // editor list reflect to the ghost immediately. Shift+click+drag in
    // the canvas moves bones; the drag callback updates our `bones` list
    // and re-renders the editor.
    const GHOST_ID = "rig_editor:" + asset.id;
    const _rebuildGhost = () => {
        if (!window.rigSystem) return;
        try { window.rigSystem.detachGhost(GHOST_ID); } catch {}
        const rigForGhost = {
            bones: bones.map(b => ({ id: b.id, position: b.position, parent: b.parent })),
        };
        if (rigForGhost.bones.length > 0) {
            try { window.rigSystem.attachGhost(GHOST_ID, rigForGhost); } catch {}
        }
    };
    _rebuildGhost();
    if (window.rigSystem) {
        window.rigSystem.setDragCallback((ghostId, boneIdx, newPos) => {
            if (ghostId !== GHOST_ID) return;
            if (boneIdx < 0 || boneIdx >= bones.length) return;
            bones[boneIdx].position[0] = newPos[0];
            bones[boneIdx].position[1] = newPos[1];
            bones[boneIdx].position[2] = newPos[2];
            renderBones();   // re-paint position fields with new values
        });
    }

    const overlay = document.createElement("div");
    Object.assign(overlay.style, {
        position: "fixed", inset: "0", background: "rgba(0,0,0,0.6)",
        zIndex: "2100", display: "flex", alignItems: "center", justifyContent: "center",
    });
    const dlg = document.createElement("div");
    Object.assign(dlg.style, {
        background: "rgba(20,28,38,0.97)", border: "1px solid rgba(255,220,90,0.5)",
        borderRadius: "8px", padding: "20px", color: "#cde",
        fontSize: "12px", width: "560px", maxHeight: "85vh", overflowY: "auto",
    });
    const title = document.createElement("div");
    title.textContent = "🦴 Rig Editor — " + asset.name;
    Object.assign(title.style, { fontWeight: "600", fontSize: "15px", marginBottom: "4px", color: "#ffe89a" });
    dlg.appendChild(title);
    // v819 — hint about visual manipulation
    const hint = document.createElement("div");
    hint.textContent = "Skeleton appears in scene (lavender). Shift+drag a joint in the 3D scene to move it. Edits sync both ways.";
    Object.assign(hint.style, { fontSize: "10px", color: "#9ab", marginBottom: "12px", fontStyle: "italic" });
    dlg.appendChild(hint);

    const list = document.createElement("div");
    Object.assign(list.style, { display: "flex", flexDirection: "column", gap: "4px", marginBottom: "12px" });
    dlg.appendChild(list);

    // Header row
    const headerRow = document.createElement("div");
    Object.assign(headerRow.style, {
        display: "grid",
        gridTemplateColumns: "100px 100px 60px 60px 60px 100px 28px",
        gap: "4px", fontSize: "10px", color: "#7af", textTransform: "uppercase",
        letterSpacing: "0.05em", marginBottom: "4px", paddingLeft: "2px",
    });
    headerRow.innerHTML = `<span>id</span><span>name</span><span>x</span><span>y</span><span>z</span><span>parent</span><span></span>`;
    list.appendChild(headerRow);

    function renderBones() {
        // Clear existing bone rows (keep header)
        while (list.childNodes.length > 1) list.removeChild(list.lastChild);
        for (let i = 0; i < bones.length; i++) {
            const b = bones[i];
            const row = document.createElement("div");
            Object.assign(row.style, {
                display: "grid",
                gridTemplateColumns: "100px 100px 60px 60px 60px 100px 28px",
                gap: "4px",
            });
            const _input = (val, onChange, type = "text") => {
                const inp = document.createElement("input");
                inp.type = type; inp.value = val;
                Object.assign(inp.style, {
                    background: "#1a2333", color: "#cde", border: "1px solid #345",
                    borderRadius: "3px", padding: "4px 6px", fontSize: "11px",
                    width: "100%", boxSizing: "border-box",
                });
                inp.addEventListener("change", () => { onChange(inp.value); _rebuildGhost(); });
                return inp;
            };
            row.appendChild(_input(b.id,   v => b.id = v));
            row.appendChild(_input(b.name, v => b.name = v));
            row.appendChild(_input(String(b.position[0]), v => b.position[0] = parseFloat(v) || 0, "number"));
            row.appendChild(_input(String(b.position[1]), v => b.position[1] = parseFloat(v) || 0, "number"));
            row.appendChild(_input(String(b.position[2]), v => b.position[2] = parseFloat(v) || 0, "number"));

            // Parent dropdown
            const sel = document.createElement("select");
            Object.assign(sel.style, {
                background: "#1a2333", color: "#cde", border: "1px solid #345",
                borderRadius: "3px", padding: "4px 6px", fontSize: "11px",
                width: "100%", boxSizing: "border-box",
            });
            const optNone = document.createElement("option");
            optNone.value = "-1"; optNone.textContent = "(root)";
            sel.appendChild(optNone);
            for (let j = 0; j < bones.length; j++) {
                if (j === i) continue;          // can't be own parent
                const opt = document.createElement("option");
                opt.value = bones[j].id;
                opt.textContent = bones[j].id;
                sel.appendChild(opt);
            }
            sel.value = (b.parent == null || b.parent === -1) ? "-1" : String(b.parent);
            sel.addEventListener("change", () => {
                b.parent = (sel.value === "-1") ? -1 : sel.value;
            });
            row.appendChild(sel);

            const rm = document.createElement("button");
            rm.textContent = "✕";
            Object.assign(rm.style, {
                background: "#a44", color: "#fff", border: "none",
                borderRadius: "3px", cursor: "pointer", fontSize: "11px",
            });
            rm.addEventListener("click", () => {
                if (!confirm(`Remove bone "${b.id}"? Children referencing it will become orphans.`)) return;
                bones.splice(i, 1);
                // Orphan any children that point at this id
                for (const other of bones) {
                    if (other.parent === b.id) other.parent = -1;
                }
                renderBones();
                _rebuildGhost();
            });
            row.appendChild(rm);
            list.appendChild(row);
        }
    }
    renderBones();

    // Bottom row: Add bone, Save, Cancel
    const btnRow = document.createElement("div");
    Object.assign(btnRow.style, { display: "flex", gap: "8px", justifyContent: "flex-end" });

    const _btn = (label, color, bg, onClick) => {
        const b = document.createElement("button");
        b.textContent = label;
        Object.assign(b.style, {
            background: bg, color: color, border: "1px solid " + bg,
            borderRadius: "4px", padding: "8px 14px", cursor: "pointer",
            fontSize: "12px", fontWeight: "500",
        });
        b.addEventListener("click", onClick);
        return b;
    };

    btnRow.appendChild(_btn("+ Add bone", "#cdf", "#345", () => {
        // Auto-generate a fresh id
        let n = bones.length;
        let newId;
        do { newId = "bone_" + (n++); } while (bones.some(b => b.id === newId));
        bones.push({ id: newId, name: "", position: [0, 0, 0], parent: bones.length > 0 ? bones[0].id : -1 });
        renderBones();
        _rebuildGhost();
    }));
    const _cleanupGhost = () => {
        try { window.rigSystem?.detachGhost(GHOST_ID); } catch {}
        try { window.rigSystem?.setDragCallback(null); } catch {}
    };
    const _close = () => { _cleanupGhost(); try { document.body.removeChild(overlay); } catch {} };
    const cancel = _btn("Cancel", "#9ab", "#345", _close);
    btnRow.appendChild(cancel);
    const save = _btn("Save", "#cfd", "#473", async () => {
        save.disabled = true;
        save.textContent = "Saving...";
        try {
            // Validate before save — catch errors here so the user gets a
            // clean message rather than a bridge "invalid rig" response.
            if (bones.length === 0) { alert("A rig needs at least one bone"); save.disabled = false; save.textContent = "Save"; return; }
            const seen = new Set();
            for (const b of bones) {
                if (!b.id || !b.id.trim()) { alert(`Empty bone id at index ${bones.indexOf(b)}`); save.disabled = false; save.textContent = "Save"; return; }
                if (seen.has(b.id)) { alert(`Duplicate bone id: ${b.id}`); save.disabled = false; save.textContent = "Save"; return; }
                seen.add(b.id);
            }
            for (const b of bones) {
                if (b.parent !== -1 && !seen.has(b.parent)) {
                    alert(`Bone "${b.id}" references unknown parent "${b.parent}"`);
                    save.disabled = false; save.textContent = "Save"; return;
                }
            }
            if (!bones.some(b => b.parent === -1)) {
                alert("At least one bone must be a root (parent: -1)");
                save.disabled = false; save.textContent = "Save"; return;
            }
            // Write back: re-add then remove old (since there's no update endpoint).
            // Preserves tags/notes/orientation by re-applying them after the add.
            const newRig = {
                name: asset.name,
                type: "rig",
                source: asset.source,
                data: { bones: bones.map(b => ({
                    id: b.id, name: b.name || undefined,
                    position: b.position, parent: b.parent,
                })) },
                tags: asset.tags ? asset.tags.slice() : [],
                notes: asset.notes || "",
                orientation: asset.orientation || null,
            };
            const added = await window.assetLibrary.add(newRig);
            if (added?.error) throw new Error(added.error);
            await window.assetLibrary.remove(asset.id);
            // Done
            _cleanupGhost();
            document.body.removeChild(overlay);
            if (typeof onSaved === "function") onSaved(added.meta);
        } catch (e) {
            alert("Save failed: " + e.message);
            save.disabled = false; save.textContent = "Save";
        }
    });
    btnRow.appendChild(_btn("+ Add bone", "#cdf", "#345", () => {})); // placeholder duplicate (will be removed)
    btnRow.lastChild.remove();   // (the placeholder above was for safety)
    dlg.appendChild(btnRow);
    btnRow.insertBefore(save, cancel);

    overlay.appendChild(dlg);
    overlay.addEventListener("click", (e) => { if (e.target === overlay) _close(); });
    document.body.appendChild(overlay);
}
