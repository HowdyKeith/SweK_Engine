// FILE: simulation/GlobalPicker.js
// VERSION: v621 — multi-select + drag-box.
//
// Single-click and right-click behaviour unchanged.
// Shift-click on an entity:   toggle it in/out of the selection set.
// Shift-click on empty space: clears the multi-select.
// Shift-drag on canvas:       defines a screen-space rectangle; on release,
//                             pickerCore.entitiesInScreenRect picks all visible
//                             entities whose center projects inside the rect.
// Right-click while multi-set is non-empty: despawn ALL selected entities.

import { ndcToWorldRay, pickClosest, entitiesInScreenRect } from "./pickerCore.js";

const MAX_PICK_DIST = 80;

export class GlobalPicker {
    constructor({ world, camera, canvas, hoverHighlight, selectionHighlight, pickerInput, renderBridge }) {
        this.world = world;
        this.camera = camera;
        this.canvas = canvas;
        this.hover = hoverHighlight;
        this.sel   = selectionHighlight;
        this.picker = pickerInput || window._pickerInput;
        this.renderBridge = renderBridge || window._renderBridge;

        this.lastHover = null;
        this.selectedSet = new Map();      // v621 — id -> { entity ref, hit info }
        this._lastAction = null;
        this._installed = false;

        this._rafId = null;
        this._unsubClick = null;
        this._unsubRightClick = null;
        this._statusDom = null;
        this._dragOverlay = null;          // v621 — visible rectangle while shift-dragging
        this._dragStart = null;            // pixel coords + ndc snapshot

        this._onMove        = this._onMove.bind(this);
        this._onLeave       = this._onLeave.bind(this);
        this._onMouseDown   = this._onMouseDown.bind(this);
        this._onMouseClick  = this._onMouseClick.bind(this);
        this._onMouseUp     = this._onMouseUp.bind(this);
        this._onContextMenu = this._onContextMenu.bind(this);
        this._onPickerClick = this._onPickerClick.bind(this);
        this._onPickerRightClick = this._onPickerRightClick.bind(this);
    }

    isInstalled() { return this._installed; }

    install() {
        if (this._installed) return;
        this._installed = true;

        this._statusDom = document.createElement("div");
        Object.assign(this._statusDom.style, {
            position: "fixed", left: "12px", bottom: "12px",
            color: "#fc6", fontFamily: "ui-monospace, monospace", fontSize: "10px",
            background: "rgba(20,20,28,0.7)", padding: "3px 9px", borderRadius: "10px",
            border: "1px solid #fc6", pointerEvents: "none", zIndex: "9090",
            whiteSpace: "pre",
        });
        this._renderStatus();
        document.body.appendChild(this._statusDom);

        this.canvas.addEventListener("mousemove",   this._onMove);
        this.canvas.addEventListener("mouseleave",  this._onLeave);
        this.canvas.addEventListener("mousedown",   this._onMouseDown);
        this.canvas.addEventListener("click",       this._onMouseClick);
        this.canvas.addEventListener("contextmenu", this._onContextMenu);
        // mouseup attaches to window so we still get the drop event even if
        // the user dragged off-canvas before releasing
        window.addEventListener("mouseup", this._onMouseUp);

        if (this.picker) {
            this._unsubClick = this.picker.onClick(this._onPickerClick);
            this._unsubRightClick = this.picker.onRightClick(this._onPickerRightClick);
        }

        const loop = () => { this._tick(); this._rafId = requestAnimationFrame(loop); };
        this._rafId = requestAnimationFrame(loop);
    }

    uninstall() {
        if (!this._installed) return;
        this._installed = false;

        if (this._rafId) cancelAnimationFrame(this._rafId);
        this._rafId = null;
        this.canvas.removeEventListener("mousemove",   this._onMove);
        this.canvas.removeEventListener("mouseleave",  this._onLeave);
        this.canvas.removeEventListener("mousedown",   this._onMouseDown);
        this.canvas.removeEventListener("click",       this._onMouseClick);
        this.canvas.removeEventListener("contextmenu", this._onContextMenu);
        window.removeEventListener("mouseup", this._onMouseUp);
        if (this._unsubClick) { try { this._unsubClick(); } catch {} this._unsubClick = null; }
        if (this._unsubRightClick) { try { this._unsubRightClick(); } catch {} this._unsubRightClick = null; }
        if (this._statusDom) { try { this._statusDom.remove(); } catch {} this._statusDom = null; }
        this._endDrag();

        try { this.hover?.clear(); } catch {}
        try { this.sel?.clear(); } catch {}
        this.lastHover = null;
        this.selectedSet.clear();
        this._lastAction = null;
    }

    toggle() {
        if (this._installed) this.uninstall();
        else this.install();
        return this._installed;
    }

    // ---- input bridging ----
    _onMove(e) {
        const rect = this.canvas.getBoundingClientRect();
        const px = e.clientX - rect.left, py = e.clientY - rect.top;
        if (this.picker) this.picker.setMousePixel(px, py, rect.width, rect.height);

        // v621 — update drag rectangle if active
        if (this._dragStart && this._dragOverlay) {
            const x0 = this._dragStart.px, y0 = this._dragStart.py;
            const left   = Math.min(x0, px), top  = Math.min(y0, py);
            const width  = Math.abs(x0 - px), height = Math.abs(y0 - py);
            Object.assign(this._dragOverlay.style, {
                left:   (rect.left + left) + "px",
                top:    (rect.top  + top ) + "px",
                width:  width  + "px",
                height: height + "px",
            });
        }
    }
    _onLeave() {
        if (this.picker) this.picker.clearMouse();
        try { this.hover?.clear(); } catch {}
        this.lastHover = null;
    }
    _onMouseDown(e) {
        if (window._sandboxInstalled) return;
        if (e.button !== 0) return;
        if (!e.shiftKey) return;            // shift-drag only
        const rect = this.canvas.getBoundingClientRect();
        const px = e.clientX - rect.left, py = e.clientY - rect.top;
        this._dragStart = { px, py };
        this._dragOverlay = document.createElement("div");
        Object.assign(this._dragOverlay.style, {
            position: "fixed",
            left: (rect.left + px) + "px", top: (rect.top + py) + "px",
            width: "0px", height: "0px",
            border: "1px dashed #fc6",
            background: "rgba(255,200,80,0.12)",
            pointerEvents: "none", zIndex: "9091",
        });
        document.body.appendChild(this._dragOverlay);
    }
    _onMouseUp(e) {
        if (window._sandboxInstalled) { this._endDrag(); return; }
        if (!this._dragStart) return;
        // Compute final rect in NDC. The drag distance threshold filters
        // accidental tiny-rect drags from being treated as a box select.
        const rect = this.canvas.getBoundingClientRect();
        const x0 = this._dragStart.px, y0 = this._dragStart.py;
        const x1 = e.clientX - rect.left, y1 = e.clientY - rect.top;
        const dragPx = Math.hypot(x1 - x0, y1 - y0);
        this._endDrag();
        if (dragPx < 6) {
            // Treat as a normal shift-click; let _onMouseClick handle it
            return;
        }
        // NDC: x = px/w * 2 - 1, y = -(py/h * 2 - 1)
        const w = rect.width, h = rect.height;
        const ndcRect = {
            minX: Math.min(x0, x1) / w * 2 - 1,
            maxX: Math.max(x0, x1) / w * 2 - 1,
            minY: -(Math.max(y0, y1) / h * 2 - 1),
            maxY: -(Math.min(y0, y1) / h * 2 - 1),
        };
        const entities = this._getEntities();
        const picked = entitiesInScreenRect(entities, this.camera, ndcRect);
        // Add to selection set (shift-drag is additive)
        for (const ent of picked) {
            this._addEntityToSelection(ent);
        }
        this._lastAction = `box-selected ${picked.length} entit${picked.length === 1 ? "y" : "ies"} (total ${this.selectedSet.size})`;
        this._syncSelectionHighlight();
        this._renderStatus();
    }
    _endDrag() {
        if (this._dragOverlay) { try { this._dragOverlay.remove(); } catch {} this._dragOverlay = null; }
        this._dragStart = null;
    }
    _onMouseClick(e) {
        if (e.button !== 0) return;
        if (window._sandboxInstalled) return;
        if (this._dragStart) return;   // a drag is in flight; mouseup will handle
        // Shift-click is toggle on the hovered entity, OR clear if no hover
        if (e.shiftKey) {
            if (this.lastHover?.type === "entity") {
                this._toggleEntityInSelection(this.lastHover);
                this._syncSelectionHighlight();
                this._renderStatus();
            } else if (!this.lastHover) {
                this.selectedSet.clear();
                this._lastAction = "cleared multi-select";
                this._syncSelectionHighlight();
                this._renderStatus();
            }
            return;
        }
        if (this.picker) this.picker.fireMouseClick();
        else this._resolveClick();
    }
    _onContextMenu(e) {
        if (window._sandboxInstalled) return;
        e.preventDefault();
        if (this.picker) this.picker.fireMouseRightClick();
        else this._resolveRightClick();
    }
    _onPickerClick(_evt) {
        if (window._sandboxInstalled) return;
        this._resolveClick();
    }
    _onPickerRightClick(_evt) {
        if (window._sandboxInstalled) return;
        this._resolveRightClick();
    }

    _resolveClick() {
        const h = this.lastHover;
        if (!h) {
            // Single-click on empty space: replace selection with empty.
            this.selectedSet.clear();
            this._syncSelectionHighlight();
            this._renderStatus();
            return;
        }
        if (h.type === "entity") {
            // Single-click on entity: replace selection with this one entity.
            this.selectedSet.clear();
            this._addEntityToSelection(h.entity, h);
            this._lastAction = `selected ${h.entity.kind} #${h.entity.id} [${h.hitMode}]`;
            this._syncSelectionHighlight();
            this._renderStatus();
            return;
        }
        // Voxel click — armed-asset spawn + clear selection set.
        this.selectedSet.clear();
        try { this.sel?.clear(); } catch {}
        const armed = window._armedAsset;
        if (armed && window.router) {
            const face = h.hit.face || { x: 0, y: 1, z: 0 };
            const sx = h.hit.x + 0.5 + face.x;
            const sy = h.hit.y + 0.5 + face.y;
            const sz = h.hit.z + 0.5 + face.z;
            try {
                const r = window.router.exec({
                    type: "entity:spawnMesh",
                    assetId: armed.assetId, kind: armed.kind,
                    x: sx, y: sy, z: sz,
                    scale: armed.scale ?? 1.0,
                });
                if (r?.id != null && window._stage?.add) { try { window._stage.add(r.id); } catch {} }
                this._lastAction = `spawned ${armed.label} id=${r?.id ?? "?"}`;
            } catch (err) {
                console.warn("[globalPicker] spawn failed:", err?.message);
            }
        }
        this._renderStatus();
    }

    _resolveRightClick() {
        // v621 — if multi-set is non-empty, despawn all.
        if (this.selectedSet.size > 0 && window.router) {
            const ids = Array.from(this.selectedSet.keys());
            for (const id of ids) {
                try { window.router.exec({ type: "entity:despawn", id }); }
                catch (e) { console.warn("[globalPicker] despawn failed:", e?.message); }
            }
            this._lastAction = `despawned ${ids.length} (multi)`;
            this.selectedSet.clear();
            try { this.hover?.clear(); } catch {}
            this._syncSelectionHighlight();
            this._renderStatus();
            return;
        }
        // Otherwise fall back to the v619 single-target despawn.
        const h = this.lastHover;
        if (!h || h.type !== "entity") return;
        if (!window.router) return;
        const id = h.entity.id;
        try {
            window.router.exec({ type: "entity:despawn", id });
            this._lastAction = `despawned ${h.entity.kind} #${id}`;
            this.lastHover = null;
            try { this.hover?.clear(); } catch {}
            this._renderStatus();
        } catch (err) {
            console.warn("[globalPicker] despawn failed:", err?.message);
        }
    }

    _addEntityToSelection(ent, hit = null) {
        // Store id + last-known hit info (used to render the OBB). The tick
        // will refresh entity-tracked fields (position, yaw, etc.) so a
        // moving selected entity's box follows it.
        this.selectedSet.set(ent.id, hit || { entity: ent });
    }
    _toggleEntityInSelection(hit) {
        const id = hit.entity.id;
        if (this.selectedSet.has(id)) {
            this.selectedSet.delete(id);
            this._lastAction = `removed ${hit.entity.kind} #${id} from selection`;
        } else {
            this._addEntityToSelection(hit.entity, hit);
            this._lastAction = `added ${hit.entity.kind} #${id} to selection (total ${this.selectedSet.size})`;
        }
    }

    // Pull the current entity state and rebuild OBB items for the selection
    // highlight. Called from _tick() so moving entities follow correctly.
    _syncSelectionHighlight() {
        if (this.selectedSet.size === 0) {
            try { this.sel?.clear(); } catch {}
            return;
        }
        const entities = this._getEntities();
        const byId = new Map();
        for (const e of entities) byId.set(e.id, e);

        // import pickerCore deps for fresh pick info (mesh.bounds + yaw matrix etc.)
        // We don't actually raycast — just compose what setOBB needs from current entity state.
        const items = [];
        for (const id of this.selectedSet.keys()) {
            const ent = byId.get(id);
            if (!ent) { this.selectedSet.delete(id); continue; }   // despawned by someone else
            const info = _composeOBBItem(ent);
            if (info) items.push(info);
        }
        try { this.sel?.setMulti(items); } catch {}
    }

    _tick() {
        if (!this.picker) return;
        if (window._sandboxInstalled) return;

        const cursor = this.picker.getNDC();
        if (!cursor) {
            try { this.hover?.clear(); } catch {}
            this.lastHover = null;
            this._syncSelectionHighlight();
            return;
        }
        const ray = ndcToWorldRay(this.camera, this.canvas, cursor.x, cursor.y);
        if (!ray) {
            try { this.hover?.clear(); } catch {}
            this.lastHover = null;
            this._syncSelectionHighlight();
            return;
        }
        const entities = this._getEntities();
        const pick = pickClosest(this.world, entities, ray.origin, ray.dir, MAX_PICK_DIST);
        if (!pick) {
            this.lastHover = null;
            try { this.hover?.clear(); } catch {}
            this._syncSelectionHighlight();
            return;
        }
        this.lastHover = pick;
        if (pick.type === "entity") {
            try {
                if (pick.localAABB) this.hover?.setOBB({ x: pick.entity.x, y: pick.entity.y, z: pick.entity.z }, pick.localAABB, pick.rotMat, pick.scale);
                else if (pick.worldAABB) this.hover?.setAABB(pick.worldAABB);
                else this.hover?.setBox(pick.entity.x, pick.entity.y, pick.entity.z, pick.hitRadius * 2);
            } catch {}
        } else {
            try { this.hover?.setTarget(pick.hit); } catch {}
        }
        // Always re-sync selection highlight too — moving entities update.
        this._syncSelectionHighlight();
    }

    _getEntities() {
        try { return this.renderBridge?.getVisibleEntities?.() || []; } catch { return []; }
    }

    _renderStatus() {
        if (!this._statusDom) return;
        const h = this.lastHover;
        let hoverTxt = "—";
        if (h?.type === "voxel") hoverTxt = `voxel (${h.hit.x},${h.hit.y},${h.hit.z})`;
        else if (h?.type === "entity") hoverTxt = `${h.entity.kind} #${h.entity.id}`;
        const selCount = this.selectedSet.size;
        this._statusDom.textContent =
            "PICKER · on   hover: " + hoverTxt +
            "   selected: " + (selCount === 0 ? "(none)" : selCount + (selCount === 1 ? " entity" : " entities")) +
            (this._lastAction ? "\n            last: " + this._lastAction : "") +
            "\n            (click select/spawn · shift+click toggle · shift+drag box · right-click despawn)";
    }
}

// Compose an OBB item for an entity using its current state + the cached
// mesh bounds. Used by _syncSelectionHighlight; doesn't raycast.
function _composeOBBItem(entity) {
    const loader = window.assetLoader;
    if (!loader?.cache || !entity.assetId) {
        // sphere fallback shape — a centered cube
        const r = Math.max(Number(entity.scale)||1, 0.4);
        return {
            entityPos: { x: entity.x, y: entity.y + r * 0.5, z: entity.z },
            localAABB: { minX: -r, maxX: r, minY: -r, maxY: r, minZ: -r, maxZ: r },
            rotMat3: null,
            entityScale: { x: 1, y: 1, z: 1 },
        };
    }
    const mesh = loader.cache.get(entity.assetId);
    const bounds = mesh?.bounds;
    if (!bounds) {
        const r = Math.max(Number(entity.scale)||1, 0.4);
        return {
            entityPos: { x: entity.x, y: entity.y + r * 0.5, z: entity.z },
            localAABB: { minX: -r, maxX: r, minY: -r, maxY: r, minZ: -r, maxZ: r },
            rotMat3: null,
            entityScale: { x: 1, y: 1, z: 1 },
        };
    }
    const yaw = Number(entity.yaw) || 0;
    const pitch = Number(entity.tiltX) || 0;
    const roll = Number(entity.tiltZ) || 0;
    const rotMat = _composeRotMat3Inline(yaw, pitch, roll);
    const sx = (entity.scaleX != null ? Number(entity.scaleX) : 0) || Number(entity.scale) || 1;
    const sy = (entity.scaleY != null ? Number(entity.scaleY) : 0) || Number(entity.scale) || 1;
    const sz = (entity.scaleZ != null ? Number(entity.scaleZ) : 0) || Number(entity.scale) || 1;
    return {
        entityPos: { x: entity.x, y: entity.y, z: entity.z },
        localAABB: bounds,
        rotMat3: rotMat,
        entityScale: { x: sx, y: sy, z: sz },
    };
}

// Inlined here (and not imported) so the selection sync doesn't induce
// another module dependency loop — same math as pickerCore.composeRotMat3.
function _composeRotMat3Inline(yaw, pitch, roll) {
    const cy = Math.cos(yaw),   sy = Math.sin(yaw);
    const cp = Math.cos(pitch), sp = Math.sin(pitch);
    const cr = Math.cos(roll),  sr = Math.sin(roll);
    return new Float32Array([
        cy*cr + sy*sp*sr,  cp*sr,  -sy*cr + cy*sp*sr,
        -cy*sr + sy*sp*cr, cp*cr,  sy*sr + cy*sp*cr,
        sy*cp,             -sp,    cy*cp,
    ]);
}
