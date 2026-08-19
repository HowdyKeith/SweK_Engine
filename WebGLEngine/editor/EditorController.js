// FILE: editor/EditorController.js
// VERSION: v1 - MOUSE-DRIVEN VOXEL EDITOR
//
// One controller, three responsibilities:
//   1. Each frame: raycast from camera forward; update the existing
//      VoxelHighlight box so the voxel under the crosshair gets a
//      visible outline.
//   2. Mouse clicks (when pointer is locked):
//        left  → remove the hit voxel (set to AIR)
//        right → place currentMaterial on the face that was hit
//   3. Number keys 1–7 cycle through the materials. Active material
//      shows in the small bottom-centre overlay so the user knows
//      what they'll place.
//
// Why not the existing editor/voxelEditor.js or input/voxelInputController.js:
// each was wired to a different chunk-upload pipeline (gpu.uploadChunk
// or chunkRebuildDispatcher) that the current renderer doesn't use.
// Going through CommandRouter.exec({type:"voxel:set", ...}) means:
//   - chunks get marked dirty (renderer re-meshes them next frame)
//   - chunks get marked _modified (persistence picks them up)
//   - the WSBridge sees them too if a relay subscriber is listening
// One code path, three side effects, zero plumbing duplication.

import { raycastVoxel } from "./voxelSelectionRaycast.js";
import { VOXEL }        from "../world/voxelFormat.js";

const PALETTE = [
    { id: VOXEL.STONE, label: "stone", swatch: "#a6a6ad" },
    { id: VOXEL.DIRT,  label: "dirt",  swatch: "#996b3d" },
    { id: VOXEL.GRASS, label: "grass", swatch: "#4cba4c" },
    { id: VOXEL.SAND,  label: "sand",  swatch: "#e0d28a" },
    { id: VOXEL.WATER, label: "water", swatch: "#4a8acc" },
    { id: VOXEL.LAVA,  label: "lava",  swatch: "#d96825" },
    { id: VOXEL.AIR,   label: "erase", swatch: "#222"    },
];

const MAX_REACH = 12;     // max distance the raycast extends

export class EditorController {
    constructor(camera, world, router, highlight, opts = {}) {
        this.camera    = camera;
        this.world     = world;
        this.router    = router;
        this.highlight = highlight;
        this.canvas    = opts.canvas ?? null;
        // Optional debris hook — spawns particle effect on voxel removal.
        // Decoupled so the editor still works without it (and so sim
        // systems that destroy voxels at high frequency don't auto-spawn
        // debris and saturate the screen).
        this.debris    = opts.debris ?? null;

        this.materialIdx = 0;          // index into PALETTE
        this.totalPlaces = 0;
        this.totalRemovals = 0;
        this.lastHit = null;

        this._buildPalette(opts.parent ?? document.body);
        this._bindMouse();
        this._bindKeys();
        this._updatePaletteUI();
    }

    get currentMaterial() {
        return PALETTE[this.materialIdx];
    }

    // Per-frame update: raycast from camera, point the highlight cube
    // at whatever voxel is under the crosshair (or hide if nothing).
    update() {
        const dir = this._cameraForward();
        const hit = raycastVoxel(this.world, this.camera.position, dir, MAX_REACH);
        this.lastHit = hit;
        if (hit) {
            this.highlight.setTarget(hit);
        } else {
            this.highlight.setTarget(null);
        }
    }

    // ----- private --------------------------------------------------------

    _cameraForward() {
        const cy = Math.cos(this.camera.yaw);
        const sy = Math.sin(this.camera.yaw);
        const cp = Math.cos(this.camera.pitch);
        const sp = Math.sin(this.camera.pitch);
        return { x: sy * cp, y: sp, z: -cy * cp };
    }

    _bindMouse() {
        // Block the browser context menu so right-click is ours.
        window.addEventListener("contextmenu", (e) => {
            if (this.camera.locked) e.preventDefault();
        });
        window.addEventListener("mousedown", (e) => {
            if (!this.camera.locked) return;
            if (!this.lastHit) return;
            const hit = this.lastHit;

            if (e.button === 0) {
                // Left click — remove the voxel that was hit.
                // Read the prior voxel so we can spawn debris in its
                // color before the cell becomes air.
                const prev = this.world.getVoxel(hit.x, hit.y, hit.z);
                if (this.debris) this.debris.spawn(hit.x, hit.y, hit.z, prev);
                this.router.exec({
                    type: "voxel:set",
                    x: hit.x, y: hit.y, z: hit.z, v: VOXEL.AIR,
                });
                this.totalRemovals++;
                return;
            }
            if (e.button === 2) {
                // Right click — place current material on the face hit.
                // hit.face is the inward step, so adding it gives the
                // adjacent empty cell.
                const mat = this.currentMaterial.id;
                if (mat === VOXEL.AIR) {
                    // "Erase" material on right click → also remove,
                    // matching the left-click destruction (incl. debris).
                    const prev = this.world.getVoxel(hit.x, hit.y, hit.z);
                    if (this.debris) this.debris.spawn(hit.x, hit.y, hit.z, prev);
                    this.router.exec({
                        type: "voxel:set",
                        x: hit.x, y: hit.y, z: hit.z, v: VOXEL.AIR,
                    });
                    this.totalRemovals++;
                    return;
                }
                this.router.exec({
                    type: "voxel:set",
                    x: hit.x + hit.face.x,
                    y: hit.y + hit.face.y,
                    z: hit.z + hit.face.z,
                    v: mat,
                });
                this.totalPlaces++;
            }
        });
    }

    _bindKeys() {
        window.addEventListener("keydown", (e) => {
            if (e.repeat) return;
            // Don't capture digit keys while typing in an input field
            const tgt = e.target;
            if (tgt && (tgt.tagName === "INPUT" ||
                        tgt.tagName === "TEXTAREA" ||
                        tgt.isContentEditable)) {
                return;
            }
            // Digit1..Digit7 → palette index 0..6
            const m = /^Digit([1-7])$/.exec(e.code);
            if (!m) return;
            const idx = +m[1] - 1;
            if (idx < 0 || idx >= PALETTE.length) return;
            this.materialIdx = idx;
            this._updatePaletteUI();
            console.log(`[Editor] material: ${this.currentMaterial.label}`);
        });
    }

    _buildPalette(parent) {
        // ---- main palette wrap (bottom center) — LCARS-styled ----
        const wrap = document.createElement("div");
        wrap.className = "lcars-panel";
        Object.assign(wrap.style, {
            left: "50%",
            bottom: "20px",
            transform: "translateX(-50%)",
            minWidth: "640px",
            zIndex: "9100",
        });

        // Header (clickable to minimize) with a visible minimize button
        const wrapHeader = document.createElement("div");
        wrapHeader.className = "lcars-panel-header";
        wrapHeader.style.cursor = "default";
        const wrapTitle = document.createElement("div");
        wrapTitle.textContent = "Voxel Palette";
        wrapHeader.appendChild(wrapTitle);
        // Minimize button (round 43b) — visible "−" affordance
        const wrapMinBtn = document.createElement("div");
        wrapMinBtn.textContent = "−";
        Object.assign(wrapMinBtn.style, {
            marginLeft: "auto",
            marginRight: "8px",
            width: "18px", height: "18px",
            lineHeight: "16px",
            textAlign: "center",
            background: "#000",
            color: "#fc9",
            borderRadius: "9px",
            cursor: "pointer",
            fontFamily: "Antonio, sans-serif",
            fontSize: "16px",
            fontWeight: "700",
            userSelect: "none",
        });
        wrapMinBtn.title = "Minimize palette";
        wrapHeader.appendChild(wrapMinBtn);
        const wrapTitleId = document.createElement("div");
        wrapTitleId.className = "lcars-panel-header-id";
        wrapTitleId.textContent = "P-07";
        wrapHeader.appendChild(wrapTitleId);
        wrap.appendChild(wrapHeader);

        const wrapBody = document.createElement("div");
        wrapBody.className = "lcars-panel-body";
        const wrapBar = document.createElement("div");
        wrapBar.className = "lcars-panel-bar";
        wrapBody.appendChild(wrapBar);
        const wrapContent = document.createElement("div");
        wrapContent.className = "lcars-panel-content";
        wrapBody.appendChild(wrapContent);
        wrap.appendChild(wrapBody);

        const wrapFooter = document.createElement("div");
        wrapFooter.className = "lcars-panel-footer";
        wrap.appendChild(wrapFooter);

        // Suppress Windows middle-click autoscroll over the palette
        wrap.addEventListener("mousedown", (e) => {
            if (e.button === 1) e.preventDefault();
        });

        // Row of swatches
        const row = document.createElement("div");
        Object.assign(row.style, {
            display: "flex",
            gap: "8px",
        });

        this._paletteCells = [];
        for (let i = 0; i < PALETTE.length; i++) {
            const p = PALETTE[i];
            const cell = document.createElement("div");
            Object.assign(cell.style, {
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                padding: "4px 6px",
                minWidth: "44px",
                border: "1px solid transparent",
                borderRadius: "3px",
                cursor: "pointer",
                fontFamily: "Antonio, 'Helvetica Neue', sans-serif",
                color: "#fff",
            });
            const sw = document.createElement("div");
            Object.assign(sw.style, {
                width: "22px", height: "22px",
                background: p.swatch,
                border: "1px solid rgba(255,255,255,0.3)",
                pointerEvents: "none",
            });
            const lbl = document.createElement("div");
            lbl.textContent = `${i + 1} ${p.label.toUpperCase()}`;
            Object.assign(lbl.style, {
                marginTop: "3px",
                fontSize: "9px",
                letterSpacing: "0.06em",
                pointerEvents: "none",
                color: "#fc9",
            });
            cell.appendChild(sw);
            cell.appendChild(lbl);
            cell.addEventListener("click", () => {
                this.materialIdx = i;
                this._updatePaletteUI();
                console.log(`[Editor] material: ${this.currentMaterial.label}`);
            });
            row.appendChild(cell);
            this._paletteCells.push(cell);
        }
        wrapContent.appendChild(row);

        const hint = document.createElement("div");
        hint.textContent = "WASD: move · drag: rotate · middle-click: lock · wheel: zoom · Esc: release";
        Object.assign(hint.style, {
            fontSize: "9px",
            opacity: "0.55",
            color: "#fc9",
            pointerEvents: "none",
            marginTop: "6px",
            letterSpacing: "0.08em",
            textAlign: "center",
        });
        wrapContent.appendChild(hint);

        // ---- palette minitab — v683 moved from edge-left bottom:20 to
        // edge-right top:430, under NARRATIVE (at top:336) on the right edge ----
        const paletteMinitab = document.createElement("div");
        paletteMinitab.className = "lcars-minitab edge-bottom color-cyan";   // v1584 — bottom-right rail (minitabLayout places it)
        paletteMinitab.textContent = "▲ Palette";
        paletteMinitab.style.top = "auto";
        paletteMinitab.style.bottom = "auto";

        const STORE_PAL = "voxelengine.palette.minimized";
        // Round 43h - ALWAYS start minimized regardless of localStorage.
        // User wants palette closed on every load; they can click the
        // minitab to open. The localStorage write below keeps the
        // toggle reactive within-session.
        let palMin = true;
        const applyPal = () => {
            wrap.style.display = palMin ? "none" : "block";
            paletteMinitab.style.display = palMin ? "block" : "none";
            try { localStorage.setItem(STORE_PAL, palMin ? "1" : "0"); } catch {}
        };
        applyPal();
        wrapMinBtn.addEventListener("click", () => { palMin = true; applyPal(); });
        paletteMinitab.addEventListener("click", () => { palMin = false; applyPal(); });

        // ---- separate Reset World button (v703: uses miniIconStack
        // helper, auto-positions in the bottom-left vertical rail) ----
        (async () => {
            try {
                const { mountMiniIcon } = await import("../ui/miniIconStack.js");
                mountMiniIcon({
                    id: "ve-reset-world-btn",
                    icon: "↻",
                    label: "Reset World",
                    color: "red",
                    title: "Reset world to a fresh random seed",
                    onClick: () => {
                        const ok = window.confirm(
                            "Reset world?\n\nGenerates a brand-NEW random world (fresh seed) and reloads. " +
                            "Clears saved chunks, sky props, and placed entities. Your settings are kept."
                        );
                        if (!ok) return;
                        try {
                            // v428 — randomize the world seed so reset
                            // produces a genuinely different world.
                            const s = Math.floor(Math.random() * 0x7fffffff) + 1;
                            localStorage.setItem("voxelengine.worldSeed", String(s));
                            localStorage.setItem("voxelengine.worldSeed_v1", String(s));
                        } catch (e) {}
                        try { this.router.exec({ type: "world:reset" }); }
                        catch (e) { console.warn("[Editor] world:reset failed:", e); }
                        setTimeout(() => window.location.reload(), 50);
                    },
                });
            } catch (e) { console.warn("[ResetWorld] miniIconStack mount failed:", e?.message); }
        })();

        parent.appendChild(wrap);
        parent.appendChild(paletteMinitab);
        this._paletteRoot = wrap;
        applyPal();
    }

    _updatePaletteUI() {
        if (!this._paletteCells) return;
        for (let i = 0; i < this._paletteCells.length; i++) {
            const sel = (i === this.materialIdx);
            this._paletteCells[i].style.border = sel
                ? "1px solid #f90"
                : "1px solid transparent";
            this._paletteCells[i].style.background = sel
                ? "rgba(255, 153, 0, 0.18)"
                : "transparent";
        }
    }

    snapshot() {
        return {
            material: this.currentMaterial.label,
            placed: this.totalPlaces,
            removed: this.totalRemovals,
            hit: this.lastHit
                ? `${this.lastHit.x},${this.lastHit.y},${this.lastHit.z}`
                : null,
        };
    }
}
