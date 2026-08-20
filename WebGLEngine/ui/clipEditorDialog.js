// FILE: ui/clipEditorDialog.js
// VERSION: v1 (v818 — animation clip editor)
//
// Minimal clip editor:
//   * Top panel: duration, "add keyframe at t=0 for bone X" helpers,
//     and a JSON textarea for direct editing
//   * Bottom panel: animation timeline (play/pause + scrub slider)
//
// The timeline only does something when a splat layer is currently
// playing this clip via window.rigSystem — it pokes the animator's
// playing/startTime to control playback. Otherwise it's a no-op
// (still useful for editing the JSON).

export async function openClipEditor(asset, onSaved) {
    if (asset?.type !== "clip") {
        alert("Clip editor: asset is not a clip");
        return;
    }
    // Load clip data
    let clip;
    try {
        const r = await window.assetLibrary.get(asset.id);
        if (r?.error) throw new Error(r.error);
        clip = r.data;
    } catch (e) {
        alert("Failed to load clip: " + e.message);
        return;
    }
    if (!clip || typeof clip !== "object") clip = { duration: 1.0, bones: [] };

    // Look for any splat layer currently bound to this clip in the rig system
    const activeLayerIds = [];
    if (window.rigSystem) {
        for (const [layerId, entry] of window.rigSystem.bindings.entries()) {
            if (entry.animator?.clip === clip) activeLayerIds.push(layerId);
            // Note: above identity check only matches if the clip object is
            // shared — in practice we look up by clipId via the asset library.
        }
    }

    const overlay = document.createElement("div");
    Object.assign(overlay.style, {
        position: "fixed", inset: "0", background: "rgba(0,0,0,0.6)",
        zIndex: "2100", display: "flex", alignItems: "center", justifyContent: "center",
    });
    const dlg = document.createElement("div");
    Object.assign(dlg.style, {
        background: "rgba(20,28,38,0.97)", border: "1px solid rgba(180,140,240,0.5)",
        borderRadius: "8px", padding: "20px", color: "#cde",
        fontSize: "12px", width: "560px", maxHeight: "85vh", overflowY: "auto",
    });
    const title = document.createElement("div");
    title.textContent = "🎬 Clip Editor — " + asset.name;
    Object.assign(title.style, { fontWeight: "600", fontSize: "15px", marginBottom: "4px", color: "#dcf" });
    dlg.appendChild(title);
    const sub = document.createElement("div");
    sub.textContent = `${(clip.bones || []).length} bone tracks · duration ${clip.duration?.toFixed?.(2) || "?"}s`;
    Object.assign(sub.style, { fontSize: "10px", color: "#9ab", marginBottom: "12px" });
    dlg.appendChild(sub);

    // ─── JSON editor ─────────────────────────────────────────────
    const _section = (label) => {
        const h = document.createElement("div");
        h.textContent = label;
        Object.assign(h.style, {
            fontSize: "11px", color: "#bdf", textTransform: "uppercase",
            letterSpacing: "0.05em", marginTop: "12px", marginBottom: "5px",
            paddingBottom: "3px", borderBottom: "1px solid rgba(180,140,240,0.2)",
        });
        return h;
    };
    dlg.appendChild(_section("JSON data"));

    const textarea = document.createElement("textarea");
    Object.assign(textarea.style, {
        width: "100%", boxSizing: "border-box", minHeight: "240px",
        background: "#1a2333", color: "#cdf", border: "1px solid #345",
        borderRadius: "4px", padding: "8px", fontFamily: "monospace",
        fontSize: "11px", lineHeight: "1.4",
    });
    textarea.value = JSON.stringify(clip, null, 2);
    dlg.appendChild(textarea);
    const validMsg = document.createElement("div");
    Object.assign(validMsg.style, { fontSize: "10px", color: "#9ab", marginTop: "4px", minHeight: "14px" });
    dlg.appendChild(validMsg);

    // Live validation
    let parsedClip = clip;
    const _validate = () => {
        try {
            const parsed = JSON.parse(textarea.value);
            if (typeof parsed !== "object" || !parsed) throw new Error("not an object");
            if (typeof parsed.duration !== "number" || !(parsed.duration > 0)) throw new Error("duration must be > 0");
            if (!Array.isArray(parsed.bones)) throw new Error("bones must be an array");
            for (const t of parsed.bones) {
                if (!t || t.id == null) throw new Error("each track needs id");
                if (!Array.isArray(t.frames) || t.frames.length === 0) throw new Error(`track ${t.id} needs frames`);
                let prev = -Infinity;
                for (const f of t.frames) {
                    if (typeof f.t !== "number") throw new Error(`bad frame t in ${t.id}`);
                    if (f.t < 0 || f.t > parsed.duration) throw new Error(`frame t=${f.t} out of [0,${parsed.duration}] in ${t.id}`);
                    if (f.t < prev) throw new Error(`unsorted frame at t=${f.t} in ${t.id}`);
                    prev = f.t;
                }
            }
            parsedClip = parsed;
            validMsg.textContent = `✓ valid · ${parsed.bones.length} tracks · ${parsed.duration.toFixed(2)}s`;
            validMsg.style.color = "#9c9";
            return parsed;
        } catch (e) {
            validMsg.textContent = "✗ " + e.message;
            validMsg.style.color = "#f99";
            return null;
        }
    };
    textarea.addEventListener("input", _validate);
    _validate();

    // ─── Timeline (only does anything for active layers) ────────
    dlg.appendChild(_section("Timeline"));
    const tlRow = document.createElement("div");
    Object.assign(tlRow.style, { display: "flex", gap: "8px", alignItems: "center", marginBottom: "12px" });
    const playBtn = document.createElement("button");
    playBtn.textContent = "▶";
    Object.assign(playBtn.style, {
        background: "#345", color: "#cdf", border: "1px solid #567",
        borderRadius: "3px", padding: "4px 10px", cursor: "pointer", fontSize: "12px", minWidth: "32px",
    });
    const scrub = document.createElement("input");
    scrub.type = "range"; scrub.min = "0"; scrub.max = "1000"; scrub.value = "0";
    Object.assign(scrub.style, { flex: "1" });
    const tLabel = document.createElement("span");
    Object.assign(tLabel.style, { fontSize: "10px", fontFamily: "monospace", color: "#9ab", minWidth: "70px", textAlign: "right" });
    tLabel.textContent = "0.00 / " + (clip.duration?.toFixed(2) || "?") + "s";

    let isPlaying = false;
    const _findActiveEntries = async () => {
        // Match by clipId — look up active bindings whose stored clip data
        // matches asset.id. We don't track clipId in rigSystem entries yet,
        // so this is a best-effort: only works if the editor was opened
        // AFTER the splat was spawned with this clip.
        // Approach: scan rigSystem.bindings, look at any animator whose
        // clip.duration + clip.bones.length match this asset's stats.
        if (!window.rigSystem) return [];
        const matches = [];
        for (const [layerId, entry] of window.rigSystem.bindings.entries()) {
            const c = entry.animator?.clip;
            if (c && c.duration === clip.duration && (c.bones?.length || 0) === (clip.bones?.length || 0)) {
                matches.push({ layerId, entry });
            }
        }
        return matches;
    };
    const _setTime = async (t) => {
        const matches = await _findActiveEntries();
        for (const { entry } of matches) {
            if (!entry.animator) continue;
            const now = performance.now() / 1000;
            entry.animator.startTime = now - t;            // sets clip time = (now - startTime) = t
            entry.animator.playing = true;
            entry.animator.evaluate(now);                  // immediately step + skin
            entry.binding.skin();
        }
        tLabel.textContent = t.toFixed(2) + " / " + (parsedClip.duration?.toFixed(2) || "?") + "s";
    };
    scrub.addEventListener("input", () => {
        const u = parseInt(scrub.value, 10) / 1000;
        const t = u * (parsedClip.duration || 1);
        _setTime(t);
        isPlaying = false; playBtn.textContent = "▶";
        // Stop animator's playback so the scrubbed value sticks
        _findActiveEntries().then(matches => {
            for (const { entry } of matches) {
                if (entry.animator) entry.animator.playing = false;
            }
        });
    });
    playBtn.addEventListener("click", async () => {
        isPlaying = !isPlaying;
        playBtn.textContent = isPlaying ? "⏸" : "▶";
        const matches = await _findActiveEntries();
        for (const { entry } of matches) {
            if (!entry.animator) continue;
            entry.animator.playing = isPlaying;
            if (isPlaying) {
                // Resume from scrubbed time
                const u = parseInt(scrub.value, 10) / 1000;
                const t = u * (parsedClip.duration || 1);
                entry.animator.startTime = (performance.now() / 1000) - t;
            }
        }
    });
    tlRow.appendChild(playBtn);
    tlRow.appendChild(scrub);
    tlRow.appendChild(tLabel);
    dlg.appendChild(tlRow);

    // v819 — Snapshot pose: reads the active binding's current bone world
    // matrices and inserts (or replaces) a keyframe at the current scrubber
    // position for each bone. Only meaningful when a splat is playing this
    // clip (so we have a real binding to read pose from). The pose comes
    // from binding.curWorld so it captures any manual editing too.
    const snapRow = document.createElement("div");
    Object.assign(snapRow.style, { display: "flex", gap: "8px", alignItems: "center", marginBottom: "12px" });
    const snapBtn = document.createElement("button");
    snapBtn.textContent = "📸 Snapshot pose @ t = current";
    Object.assign(snapBtn.style, {
        background: "#473", color: "#cfd", border: "1px solid #694",
        borderRadius: "3px", padding: "6px 12px", cursor: "pointer", fontSize: "11px",
    });
    const snapStatus = document.createElement("span");
    Object.assign(snapStatus.style, { fontSize: "10px", color: "#9ab", flex: "1" });
    snapBtn.addEventListener("click", async () => {
        const matches = await _findActiveEntries();
        if (matches.length === 0) {
            snapStatus.textContent = "No active splat playing this clip — spawn one first";
            snapStatus.style.color = "#fb9";
            return;
        }
        const { entry } = matches[0];
        const u = parseInt(scrub.value, 10) / 1000;
        const t = u * (parsedClip.duration || 1);
        // Build a map of current bone TRS from binding.curWorld
        // (translation comes straight from the matrix; rotation extracted
        // via the same quatFromMat4 used in skinning.)
        const b = entry.binding;
        const { _quatFromMat4 } = await import("../rig/rigMath.js");
        const tmpQ = new Float32Array(4);
        // Mutate the in-memory clip + write back to textarea + bones array
        for (let i = 0; i < b.boneCount; i++) {
            const boneId = b.rig.bones[i].id;
            // Translation directly from curWorld
            const tx = b.curWorld[i*16 + 12];
            const ty = b.curWorld[i*16 + 13];
            const tz = b.curWorld[i*16 + 14];
            // Rotation: extract quat from the upper-3x3 of curWorld
            _quatFromMat4(b.curWorld, i * 16, tmpQ, 0);
            const rot = [tmpQ[0], tmpQ[1], tmpQ[2], tmpQ[3]];
            // Find this bone's track
            let track = parsedClip.bones.find(tr => tr.id === boneId);
            if (!track) {
                track = { id: boneId, frames: [] };
                parsedClip.bones.push(track);
            }
            // Find existing keyframe within 0.001s tolerance
            const epsilon = 0.001;
            let existing = track.frames.findIndex(f => Math.abs(f.t - t) < epsilon);
            const kf = { t, position: [tx, ty, tz], rotation: rot };
            if (existing >= 0) {
                track.frames[existing] = kf;
            } else {
                // Insert in sorted position
                let ins = 0;
                while (ins < track.frames.length && track.frames[ins].t < t) ins++;
                track.frames.splice(ins, 0, kf);
            }
        }
        // Push back to textarea
        textarea.value = JSON.stringify(parsedClip, null, 2);
        _validate();
        snapStatus.textContent = `✓ ${b.boneCount} bone keyframes captured @ t=${t.toFixed(2)}s`;
        snapStatus.style.color = "#9c9";
    });
    snapRow.appendChild(snapBtn);
    snapRow.appendChild(snapStatus);
    dlg.appendChild(snapRow);

    // Live scrub tick while playing — updates the scrubber position
    let raf = null;
    const _tick = async () => {
        if (isPlaying) {
            const matches = await _findActiveEntries();
            if (matches.length > 0) {
                const e = matches[0].entry;
                const now = performance.now() / 1000;
                if (e.animator?.startTime) {
                    let t = now - e.animator.startTime;
                    const dur = parsedClip.duration || 1;
                    if (e.animator.loop) t = t % dur;
                    else if (t > dur) t = dur;
                    scrub.value = String(Math.floor((t / dur) * 1000));
                    tLabel.textContent = t.toFixed(2) + " / " + dur.toFixed(2) + "s";
                }
            }
        }
        raf = requestAnimationFrame(_tick);
    };
    raf = requestAnimationFrame(_tick);

    // ─── Buttons ───────────────────────────────────────────────
    const btnRow = document.createElement("div");
    Object.assign(btnRow.style, { display: "flex", gap: "8px", justifyContent: "flex-end", marginTop: "8px" });

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
    const _close = () => {
        if (raf) cancelAnimationFrame(raf);
        try { document.body.removeChild(overlay); } catch {}
    };
    btnRow.appendChild(_btn("Cancel", "#9ab", "#345", _close));
    const save = _btn("Save", "#cfd", "#473", async () => {
        const p = _validate();
        if (!p) { alert("Fix JSON errors before saving"); return; }
        save.disabled = true;
        save.textContent = "Saving...";
        try {
            const newClip = {
                name: asset.name, type: "clip", source: asset.source,
                data: p,
                tags: asset.tags ? asset.tags.slice() : [],
                notes: asset.notes || "",
            };
            const added = await window.assetLibrary.add(newClip);
            if (added?.error) throw new Error(added.error);
            await window.assetLibrary.remove(asset.id);
            // Re-attach updated clip to any active matches (they were keyed
            // by old object reference which is now stale).
            try {
                const matches = await _findActiveEntries();
                for (const { layerId, entry } of matches) {
                    entry.animator.clip = p;
                    entry.animator.startTime = 0;
                }
            } catch {}
            _close();
            if (typeof onSaved === "function") onSaved(added.meta);
        } catch (e) {
            alert("Save failed: " + e.message);
            save.disabled = false; save.textContent = "Save";
        }
    });
    btnRow.appendChild(save);
    dlg.appendChild(btnRow);

    overlay.appendChild(dlg);
    overlay.addEventListener("click", (e) => { if (e.target === overlay) _close(); });
    document.body.appendChild(overlay);
}
