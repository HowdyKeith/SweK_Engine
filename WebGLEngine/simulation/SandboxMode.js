// FILE: simulation/SandboxMode.js
// VERSION: v621 — multi-select + drag-box (parity with GlobalPicker).
//
// Single-click on entity → replace selection with just that entity.
// Single-click on voxel  → arm-spawn (existing).
// Shift-click on entity  → toggle that entity in/out of the selection set.
// Shift-click on empty   → clear multi-select.
// Shift-drag (rectangle) → entities inside get added to the selection set.
// Right-click (mouse) OR phone long-press → if selection set is non-empty,
//   despawn all of them; else fall back to single-target despawn.

import { ndcToWorldRay, pickClosest, entitiesInScreenRect } from "./pickerCore.js";
import { raycastVoxel } from "../editor/voxelSelectionRaycast.js";   // v1354 — grab-and-move ground target

const MAX_PICK_DIST = 80;
const HOVER_LIFT = 1.6;   // v1354 — how high a carried asset "hangs" above the surface

export class SandboxMode {
    constructor({ world, camera, canvas, hoverHighlight, selectionHighlight, pickerInput, renderBridge }) {
        this.world = world;
        this.camera = camera;
        this.canvas = canvas;
        this.hover = hoverHighlight;
        this.sel   = selectionHighlight;
        this.picker = pickerInput || window._pickerInput;
        this.renderBridge = renderBridge || window._renderBridge;

        this.lastHover = null;
        this.selectedSet = new Map();
        this.moveTool = false;   // v1354 — grab-and-move tool
        this._held = null;       // { id, kind, target:{x,y,z} } while carrying
        this._lastSpawn = null;
        this._lastAction = null;

        this._rafId = null;
        this._unsubClick = null;
        this._unsubRightClick = null;
        this._dom = {};
        this._dragOverlay = null;
        this._dragStart = null;

        this._onMove        = this._onMove.bind(this);
        this._onLeave       = this._onLeave.bind(this);
        this._onMouseDown   = this._onMouseDown.bind(this);
        this._onMouseClick  = this._onMouseClick.bind(this);
        this._onMouseUp     = this._onMouseUp.bind(this);
        this._onContextMenu = this._onContextMenu.bind(this);
        this._onPickerClick = this._onPickerClick.bind(this);
        this._onPickerRightClick = this._onPickerRightClick.bind(this);
    }

    install() {
        try { window._sandboxInstalled = true; } catch {}
        this._dom.readout = _mkDiv({
            position: "fixed", top: "60px", right: "20px",
            color: "#cde", fontFamily: "ui-monospace, monospace", fontSize: "11px",
            background: "rgba(10,30,60,0.7)", padding: "5px 10px", borderRadius: "8px",
            border: "1px solid #356", pointerEvents: "none", zIndex: "9090",
            whiteSpace: "pre", lineHeight: "1.45",
        });
        this._dom.hint = _mkDiv({
            position: "fixed", bottom: "70px", left: "50%", transform: "translateX(-50%)",
            color: "#cde", fontFamily: "ui-monospace, monospace", fontSize: "11px",
            background: "rgba(10,30,60,0.7)", padding: "4px 12px", borderRadius: "12px",
            border: "1px solid #356", pointerEvents: "none", zIndex: "9090",
            whiteSpace: "nowrap",
        });
        this._dom.hint.textContent = "L-CLICK select/spawn · SHIFT+CLICK toggle · SHIFT+DRAG box · R-CLICK / hold despawn";
        this._dom.moveBtn = _mkDiv({
            position: "fixed", top: "118px", right: "20px", zIndex: "9091",
            color: "#cde", fontFamily: "ui-monospace, monospace", fontSize: "11px",
            background: "rgba(102,204,255,0.10)", padding: "6px 10px", borderRadius: "8px",
            border: "1px solid #6cf", cursor: "pointer", userSelect: "none",
        });
        this._dom.moveBtn.textContent = "\u270B Move tool: OFF";
        this._dom.moveBtn.title = "Grab a placed asset and carry it; click to drop. Off = normal select/spawn.";
        this._dom.moveBtn.addEventListener("click", () => this._toggleMoveTool());
        for (const el of Object.values(this._dom)) document.body.appendChild(el);

        this.canvas.addEventListener("mousemove",   this._onMove);
        this.canvas.addEventListener("mouseleave",  this._onLeave);
        this.canvas.addEventListener("mousedown",   this._onMouseDown);
        this.canvas.addEventListener("click",       this._onMouseClick);
        this.canvas.addEventListener("contextmenu", this._onContextMenu);
        window.addEventListener("mouseup", this._onMouseUp);

        if (this.picker) {
            this._unsubClick = this.picker.onClick(this._onPickerClick);
            this._unsubRightClick = this.picker.onRightClick(this._onPickerRightClick);
        }

        const loop = () => { this._tick(); this._rafId = requestAnimationFrame(loop); };
        this._rafId = requestAnimationFrame(loop);
        this._renderReadout();
    }

    uninstall() {
        try { window._sandboxInstalled = false; } catch {}
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
        for (const el of Object.values(this._dom)) { try { el.remove(); } catch {} }
        this._dom = {};
        this._endDrag();
        try { this.hover?.clear(); } catch {}
        try { this.sel?.clear(); } catch {}
        this.lastHover = null;
        this.selectedSet.clear();
        this._lastSpawn = null;
        this._lastAction = null;
    }

    _onMove(e) {
        const rect = this.canvas.getBoundingClientRect();
        const px = e.clientX - rect.left, py = e.clientY - rect.top;
        if (this.picker) this.picker.setMousePixel(px, py, rect.width, rect.height);
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
        this._renderReadout();
    }
    _onMouseDown(e) {
        if (e.button !== 0) return;
        if (!e.shiftKey) return;
        const rect = this.canvas.getBoundingClientRect();
        const px = e.clientX - rect.left, py = e.clientY - rect.top;
        this._dragStart = { px, py };
        this._dragOverlay = document.createElement("div");
        Object.assign(this._dragOverlay.style, {
            position: "fixed",
            left: (rect.left + px) + "px", top: (rect.top + py) + "px",
            width: "0px", height: "0px",
            border: "1px dashed #fc6", background: "rgba(255,200,80,0.12)",
            pointerEvents: "none", zIndex: "9091",
        });
        document.body.appendChild(this._dragOverlay);
    }
    _onMouseUp(e) {
        if (!this._dragStart) return;
        const rect = this.canvas.getBoundingClientRect();
        const x0 = this._dragStart.px, y0 = this._dragStart.py;
        const x1 = e.clientX - rect.left, y1 = e.clientY - rect.top;
        const dragPx = Math.hypot(x1 - x0, y1 - y0);
        this._endDrag();
        if (dragPx < 6) return;
        const w = rect.width, h = rect.height;
        const ndcRect = {
            minX: Math.min(x0, x1) / w * 2 - 1,
            maxX: Math.max(x0, x1) / w * 2 - 1,
            minY: -(Math.max(y0, y1) / h * 2 - 1),
            maxY: -(Math.min(y0, y1) / h * 2 - 1),
        };
        const entities = this._getEntities();
        const picked = entitiesInScreenRect(entities, this.camera, ndcRect);
        for (const ent of picked) this._addEntityToSelection(ent);
        this._lastAction = `box-selected ${picked.length} (total ${this.selectedSet.size})`;
        this._syncSelectionHighlight();
        this._renderReadout();
    }
    _endDrag() {
        if (this._dragOverlay) { try { this._dragOverlay.remove(); } catch {} this._dragOverlay = null; }
        this._dragStart = null;
    }
    _onMouseClick(e) {
        if (e.button !== 0) return;
        if (this._dragStart) return;
        if (e.shiftKey) {
            if (this.lastHover?.type === "entity") {
                this._toggleEntityInSelection(this.lastHover);
                this._syncSelectionHighlight();
                this._renderReadout();
            } else if (!this.lastHover) {
                this.selectedSet.clear();
                this._lastAction = "cleared multi-select";
                this._syncSelectionHighlight();
                this._renderReadout();
            }
            return;
        }
        if (this.picker) this.picker.fireMouseClick();
        else this._resolveClick();
    }
    _onContextMenu(e) {
        e.preventDefault();
        if (this.picker) this.picker.fireMouseRightClick();
        else this._resolveRightClick();
    }
    _onPickerClick(_evt) { this._resolveClick(); }
    _onPickerRightClick(_evt) { this._resolveRightClick(); }

    _resolveClick() {
        if (this.moveTool) {   // v1354 — grab-and-move takes precedence over select/spawn
            if (this._held) { this._dropHeld(); this._renderReadout(); return; }
            const hh = this.lastHover;
            if (hh && hh.type === "entity") {
                this._held = { id: hh.entity.id, kind: hh.entity.kind, target: { x: hh.entity.x, y: hh.entity.y, z: hh.entity.z } };
                this._lastAction = "grabbed " + hh.entity.kind + " #" + hh.entity.id;
                try { this.hover?.clear(); } catch {}
                this._renderReadout();
            }
            return;
        }
        const h = this.lastHover;
        if (!h) {
            this.selectedSet.clear();
            this._syncSelectionHighlight();
            this._renderReadout();
            return;
        }
        if (h.type === "entity") {
            this.selectedSet.clear();
            this._addEntityToSelection(h.entity, h);
            this._lastAction = `selected ${h.entity.kind} #${h.entity.id} [${h.hitMode}]`;
            this._syncSelectionHighlight();
            this._renderReadout();
            return;
        }
        // Voxel — clear selection, then sculpt (brush) or spawn (armed)
        this.selectedSet.clear();
        try { this.sel?.clear(); } catch {}
        const _tb = window._terrainBrush;
        if (_tb && _tb.mode && _tb.mode !== "off") { this._applyBrush(h.hit, _tb); this._renderReadout(); return; }   // v1353 — terrain brush
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
                this._lastSpawn = { label: armed.label, id: r?.id ?? null, x: sx, y: sy, z: sz };
            } catch (err) {
                console.warn("[sandbox] spawn failed:", err?.message);
                this._lastSpawn = { label: armed.label, error: err?.message };
            }
        }
        this._renderReadout();
    }

    _applyBrush(hit, tb) {   // v1353 — sculpt terrain via world.setVoxel (round footprint on the clicked face)
        const w = this.world;
        if (!w || typeof w.setVoxel !== "function" || !hit) return;
        const face = hit.face || { x: 0, y: 1, z: 0 };
        const R = Math.max(0, tb.radius | 0);
        const S = Math.max(1, tb.strength | 0);
        const type = tb.type | 0;
        const ax = Math.abs(face.x), ay = Math.abs(face.y), az = Math.abs(face.z);
        let n = 0;
        const log = (window._sandboxVoxelEdits = window._sandboxVoxelEdits || []);   // v1355 — recorded for scene save
        const stroke = (window._sandboxStroke = (window._sandboxStroke || 0) + 1);   // v1356 — one click = one undoable stroke
        const put = (x, y, z, id) => { try { const prev = (typeof w.voxelAt === "function") ? w.voxelAt(x, y, z) : undefined; w.setVoxel(x, y, z, id); n++; if (log.length < 50000) log.push({ x, y, z, id, prev, s: stroke }); } catch {} };
        for (let a = -R; a <= R; a++) {
            for (let b = -R; b <= R; b++) {
                if (a * a + b * b > R * R + R) continue;   // round-ish footprint
                let bx, by, bz;
                if (ay >= ax && ay >= az) { bx = hit.x + a; by = hit.y;     bz = hit.z + b; }   // top/bottom face: vary X,Z
                else if (ax >= az)        { bx = hit.x;     by = hit.y + a; bz = hit.z + b; }   // X-facing wall: vary Y,Z
                else                      { bx = hit.x + a; by = hit.y + b; bz = hit.z;     }   // Z-facing wall: vary X,Y
                if (tb.mode === "raise") {
                    for (let s = 1; s <= S; s++) put(bx + face.x * s, by + face.y * s, bz + face.z * s, type);
                } else if (tb.mode === "lower" || tb.mode === "erase") {
                    for (let s = 0; s < S; s++) put(bx - face.x * s, by - face.y * s, bz - face.z * s, 0);
                } else if (tb.mode === "paint") {
                    put(bx, by, bz, type);
                }
            }
        }
        const nm = window._voxelName ? window._voxelName(tb.mode === "erase" ? 0 : type) : String(type);
        this._lastAction = tb.mode + " \u00d7" + n + " (" + nm + ")";
    }

    _resolveRightClick() {
        if (this._held) { this._dropHeld(); this._renderReadout(); return; }   // v1354 — right-click drops a carried asset
        if (this.selectedSet.size > 0 && window.router) {
            const ids = Array.from(this.selectedSet.keys());
            for (const id of ids) {
                try { window.router.exec({ type: "entity:despawn", id }); }
                catch (e) { console.warn("[sandbox] despawn failed:", e?.message); }
            }
            this._lastAction = `despawned ${ids.length} (multi)`;
            this.selectedSet.clear();
            try { this.hover?.clear(); } catch {}
            this._syncSelectionHighlight();
            this._renderReadout();
            return;
        }
        const h = this.lastHover;
        if (!h || h.type !== "entity") return;
        if (!window.router) return;
        const id = h.entity.id;
        try {
            window.router.exec({ type: "entity:despawn", id });
            this._lastAction = `despawned ${h.entity.kind} #${id}`;
            this.lastHover = null;
            try { this.hover?.clear(); } catch {}
        } catch (err) {
            console.warn("[sandbox] despawn failed:", err?.message);
            this._lastAction = `despawn failed: ${err?.message}`;
        }
        this._renderReadout();
    }

    _addEntityToSelection(ent, hit = null) {
        this.selectedSet.set(ent.id, hit || { entity: ent });
    }
    _toggleEntityInSelection(hit) {
        const id = hit.entity.id;
        if (this.selectedSet.has(id)) {
            this.selectedSet.delete(id);
            this._lastAction = `removed ${hit.entity.kind} #${id} from selection`;
        } else {
            this._addEntityToSelection(hit.entity, hit);
            this._lastAction = `added ${hit.entity.kind} #${id} (total ${this.selectedSet.size})`;
        }
    }

    _syncSelectionHighlight() {
        if (this.selectedSet.size === 0) {
            try { this.sel?.clear(); } catch {}
            return;
        }
        const entities = this._getEntities();
        const byId = new Map();
        for (const e of entities) byId.set(e.id, e);
        const items = [];
        for (const id of this.selectedSet.keys()) {
            const ent = byId.get(id);
            if (!ent) { this.selectedSet.delete(id); continue; }
            const info = _composeOBBItem(ent);
            if (info) items.push(info);
        }
        try { this.sel?.setMulti(items); } catch {}
    }

    _dropHeld() {
        if (!this._held) return;
        const t = this._held.target;
        if (t) { try { window.router?.exec({ type: "entity:move", id: this._held.id, x: t.x, y: t.y, z: t.z }); } catch {} }
        this._lastAction = "placed #" + this._held.id;
        this._held = null;
        try { this.hover?.clear(); } catch {}
    }
    _toggleMoveTool() {
        this.moveTool = !this.moveTool;
        if (!this.moveTool && this._held) this._dropHeld();
        const b = this._dom.moveBtn;
        if (b) {
            b.textContent = "\u270B Move tool: " + (this.moveTool ? "ON" : "OFF");
            b.style.background = this.moveTool ? "rgba(138,240,200,0.18)" : "rgba(102,204,255,0.10)";
            b.style.borderColor = this.moveTool ? "#8af0c8" : "#6cf";
            b.style.color = this.moveTool ? "#8af0c8" : "#cde";
        }
        this._renderReadout();
    }
    _tick() {
        if (!this.picker) return;
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
        if (this._held) {   // v1354 — carry: follow the cursor's ground point, lifted so it hangs
            const v = raycastVoxel(this.world, ray.origin, ray.dir, MAX_PICK_DIST);
            if (v) {
                const fc = v.face || { x: 0, y: 1, z: 0 };
                const gx = v.x + 0.5 + fc.x, gy = v.y + 0.5 + fc.y, gz = v.z + 0.5 + fc.z;
                this._held.target = { x: gx, y: gy, z: gz };
                try { window.router?.exec({ type: "entity:move", id: this._held.id, x: gx, y: gy + HOVER_LIFT, z: gz }); } catch {}
            }
            this._renderReadout();
            return;
        }
        const entities = this._getEntities();
        const pick = pickClosest(this.world, entities, ray.origin, ray.dir, MAX_PICK_DIST);
        if (!pick) {
            this.lastHover = null;
            try { this.hover?.clear(); } catch {}
            this._syncSelectionHighlight();
            this._renderReadout();
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
        this._syncSelectionHighlight();
        this._renderReadout();
    }

    _getEntities() {
        try { return this.renderBridge?.getVisibleEntities?.() || []; } catch { return []; }
    }

    _renderReadout() {
        if (!this._dom.readout) return;
        const fmtHover = (h) => {
            if (!h) return "(none)";
            if (h.type === "entity") return `${h.entity.kind} #${h.entity.id}`;
            return `voxel (${h.hit.x},${h.hit.y},${h.hit.z})`;
        };
        const armed = window._armedAsset;
        const spawn = this._lastSpawn;
        const st = this.picker ? this.picker.getStatus() : null;
        const sourceLine = st ? `  input : ${st.source || "(none)"}${st.source === "phone" && !st.phoneCalibrated ? " (calibrating)" : ""}` : "";
        const selCount = this.selectedSet.size;
        this._dom.readout.textContent =
            "SANDBOX\n" +
            (this.moveTool ? "  tool  : MOVE" + (this._held ? " (carrying #" + this._held.id + ", click to drop)" : " (click an asset to grab)") + "\n" : "") +
            (sourceLine ? sourceLine + "\n" : "") +
            "  hover : " + fmtHover(this.lastHover) + "\n" +
            "  select: " + (selCount === 0 ? "(none)" : selCount + (selCount === 1 ? " entity" : " entities")) + "\n" +
            "  armed : " + (armed ? armed.label : "(none)") +
            (spawn ? ("\n  spawn : " + spawn.label + (spawn.error ? "  ✗ " + spawn.error : ("  id=" + (spawn.id ?? "?")))) : "") +
            (this._lastAction ? "\n  action: " + this._lastAction : "");
    }
}

function _mkDiv(styles) { const d = document.createElement("div"); Object.assign(d.style, styles); return d; }

function _composeOBBItem(entity) {
    const loader = window.assetLoader;
    if (!loader?.cache || !entity.assetId) {
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
