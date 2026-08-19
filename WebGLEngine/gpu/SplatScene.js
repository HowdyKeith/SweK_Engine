// FILE: gpu/SplatScene.js
// VERSION: v3 (v789 — multi-splat layers + localStorage persistence)
//
// Owns a collection of SplatLayer objects, each with its own renderer +
// parsed data + transform. Single-layer workflows still work via the
// original API (loadFile/loadUrl/setPosition operate on the "current"
// layer, which defaults to "main").
//
// New in v789:
//   - addLayer(name, source) / removeLayer(name) / getLayer(name)
//   - setCurrentLayer(name) — switches the legacy API's target
//   - listLayers() — returns [{ id, name, count, format, visible, ... }]
//   - localStorage persistence: transforms + source URLs survive refresh.
//     File-based layers (drag-drop) can't be persisted (no URL) — those
//     are noted as { transient: true } and skipped at save time.
//
// Each layer renders independently — its own depth sort, its own
// frustum cull, its own model transform. Per-layer cost scales with
// the layer's splat count.

import { parseSplatFile } from "./SplatLoader.js";
import { SplatRenderer } from "../render/SplatRenderer.js";

const STORAGE_KEY = "splatScene.layers.v1";

/**
 * v793 — compute row 2 of (view * model) so view-space Z of any
 * local position can be read with a 3-mul-1-add dot product.
 * Returns [a, b, c, d] where viewZ = a*lx + b*ly + c*lz + d.
 */
function V_ROW_2(V, M) {
    // row 2 of view = [V[2], V[6], V[10], V[14]]
    // (view * model)[row 2, col i] = V_row2 · M_col_i
    const a = V[2]*M[0]  + V[6]*M[1]  + V[10]*M[2]  + V[14]*M[3];
    const b = V[2]*M[4]  + V[6]*M[5]  + V[10]*M[6]  + V[14]*M[7];
    const c = V[2]*M[8]  + V[6]*M[9]  + V[10]*M[10] + V[14]*M[11];
    const d = V[2]*M[12] + V[6]*M[13] + V[10]*M[14] + V[14]*M[15];
    return [a, b, c, d];
}

/**
 * A single splat cloud: renderer + transform + visibility + identity.
 */
class SplatLayer {
    constructor(gl, name, opts = {}) {
        this.gl = gl;
        this.id = name;                                      // unique identifier (also display name)
        this.renderer = new SplatRenderer(gl, { mode: opts.mode ?? "gaussian" });
        this.visible = true;
        this.transient = false;                              // true → not persisted (file-based source)
        this.sourceUrl = null;                               // set by loadUrl; null for file-based
        this.sourceName = null;
        this.info = null;                                    // { count, format, ms }
        // Transform — these are now LOCAL to the parent. World transform
        // is computed each frame by walking the parent chain (see
        // SplatScene._resolveWorldMatrices).
        this.position = [0, 0, 0];
        this.scale = 1.0;
        this.rotation = [1, 0, 0, 0];
        this._modelMat = new Float32Array(16);   // local
        this._worldMat = new Float32Array(16);   // v797 — composed via parent chain
        this._viewModel = new Float32Array(16);
        this._setIdentity(this._modelMat);
        this._setIdentity(this._worldMat);
        // v793 — follow-target (object-side). Updates LOCAL position.
        this.followTarget = null;
        this.followOffset = [0, 0, 0];
        // v797 — scene-graph parent (layer-side). Walks up the chain.
        this.parentLayerId = null;
    }

    _setIdentity(m) { m.fill(0); m[0] = m[5] = m[10] = m[15] = 1; }

    _rebuildModelMatrix() {
        const m = this._modelMat;
        const s = this.scale;
        const [qw, qx, qy, qz] = this.rotation;
        const [tx, ty, tz] = this.position;
        const xx = qx*qx, yy = qy*qy, zz = qz*qz;
        const xy = qx*qy, xz = qx*qz, yz = qy*qz;
        const wx = qw*qx, wy = qw*qy, wz = qw*qz;
        m[0] = s * (1 - 2*(yy + zz));    m[4] = s * (2*(xy - wz));        m[8]  = s * (2*(xz + wy));    m[12] = tx;
        m[1] = s * (2*(xy + wz));        m[5] = s * (1 - 2*(xx + zz));    m[9]  = s * (2*(yz - wx));    m[13] = ty;
        m[2] = s * (2*(xz - wy));        m[6] = s * (2*(yz + wx));        m[10] = s * (1 - 2*(xx + yy)); m[14] = tz;
        m[3] = 0;                         m[7] = 0;                         m[11] = 0;                    m[15] = 1;
    }

    _composeViewModel(view) {
        // v797 — use the resolved WORLD matrix (composed via parent chain).
        // When no parent, _worldMat equals _modelMat.
        const a = view, b = this._worldMat, out = this._viewModel;
        for (let r = 0; r < 4; r++) {
            for (let c = 0; c < 4; c++) {
                let sum = 0;
                for (let k = 0; k < 4; k++) sum += a[k*4 + r] * b[c*4 + k];
                out[c*4 + r] = sum;
            }
        }
    }

    setPosition(x, y, z) {
        if (Array.isArray(x)) { this.position = x.slice(); }
        else { this.position[0] = x; this.position[1] = y; this.position[2] = z; }
        this._rebuildModelMatrix();
    }
    setScale(s) { this.scale = Math.max(0.0001, s); this._rebuildModelMatrix(); }
    setRotation(w, x, y, z) {
        if (Array.isArray(w)) { this.rotation = w.slice(); }
        else { this.rotation = [w, x, y, z]; }
        const q = this.rotation;
        const n = Math.hypot(q[0], q[1], q[2], q[3]) || 1;
        for (let i = 0; i < 4; i++) q[i] /= n;
        this._rebuildModelMatrix();
    }

    serialize() {
        return {
            id: this.id,
            visible: this.visible,
            position: this.position.slice(),
            scale: this.scale,
            rotation: this.rotation.slice(),
            sourceUrl: this.sourceUrl,
            mode: this.renderer.mode,
            parentLayerId: this.parentLayerId,   // v797
        };
    }

    dispose() {
        this.renderer.dispose();
    }
}

export class SplatScene {
    constructor(gl, canvas, opts = {}) {
        this.gl = gl;
        this.canvas = canvas;
        this.layers = new Map();              // id → SplatLayer
        this.currentLayerId = "main";         // legacy API operates on this layer
        this._mulScratch = new Float32Array(16);
        // v789 — optional autosave
        this.autoSave = (opts.autoSave !== false);
        // v790 — debounced autoSave: rapid transform changes (e.g. dragging
        // a splat around) coalesce into one localStorage write every 500ms.
        // Single trailing-edge timer; cleared on dispose.
        this._autoSaveDebounceMs = opts.autoSaveDebounceMs ?? 500;
        this._autoSaveTimer = null;
        this._dropEnabled = false;
        this._onDragOver = null;
        this._onDrop = null;
        // v793 — sort mode: "per-layer" (default, fast) or "merged" (correct
        // for overlapping layers, but O(N_total log N_total) CPU sort each
        // frame). Opt-in via setSortMode.
        this.sortMode = opts.sortMode ?? "per-layer";
        this._mergedBuf = null;       // scratch for global sort {layer, idx, viewZ}
    }

    /**
     * v790 — request a debounced save. Replaces direct saveState()
     * calls from the auto-save code paths. Public saveState() and
     * forgetState() still write/clear synchronously.
     */
    _requestAutoSave() {
        if (!this.autoSave) return;
        if (this._autoSaveTimer != null) return;        // already scheduled
        const ms = this._autoSaveDebounceMs;
        const schedule = (typeof globalThis !== "undefined" && globalThis.setTimeout) ? globalThis.setTimeout : null;
        if (!schedule) { this.saveState(); return; }    // fallback to immediate
        this._autoSaveTimer = schedule(() => {
            this._autoSaveTimer = null;
            try { this.saveState(); } catch {}
        }, ms);
    }

    /**
     * v791 — flush pending debounced autoSave NOW (synchronously).
     * Called on beforeunload so a fast tab-close doesn't lose changes.
     */
    _flushAutoSave() {
        if (this._autoSaveTimer != null) {
            try { globalThis.clearTimeout?.(this._autoSaveTimer); } catch {}
            this._autoSaveTimer = null;
        }
        try { this.saveState(); } catch {}
    }

    // ============================================================
    // Multi-layer API (v789)
    // ============================================================

    /**
     * Ensure a layer with the given id exists. Returns the layer.
     */
    _ensureLayer(id) {
        if (!this.layers.has(id)) {
            this.layers.set(id, new SplatLayer(this.gl, id));
        }
        return this.layers.get(id);
    }

    /**
     * Public: get or create a named layer.
     */
    getLayer(id = this.currentLayerId) {
        return this._ensureLayer(id);
    }

    /**
     * Public: set the layer the legacy API operates on. Creates if missing.
     */
    setCurrentLayer(id) {
        this._ensureLayer(id);
        this.currentLayerId = id;
    }

    /**
     * Public: remove a layer + dispose its GPU resources.
     */
    removeLayer(id) {
        const layer = this.layers.get(id);
        if (!layer) return false;
        layer.dispose();
        this.layers.delete(id);
        if (this.currentLayerId === id) {
            // Fall back to any remaining layer, or "main"
            this.currentLayerId = this.layers.keys().next().value || "main";
        }
        this._emitChange("remove", id);
        if (this.autoSave) this._requestAutoSave();
        return true;
    }

    /**
     * Public: list all layers as plain objects (for UI consumption).
     */
    listLayers() {
        const out = [];
        for (const layer of this.layers.values()) {
            out.push({
                id: layer.id,
                visible: layer.visible,
                count: layer.info?.count ?? 0,
                format: layer.info?.format ?? null,
                sourceName: layer.info?.sourceName ?? null,
                sourceUrl: layer.sourceUrl,
                transient: layer.transient,
                position: layer.position.slice(),
                scale: layer.scale,
                rotation: layer.rotation.slice(),
                mode: layer.renderer.mode,
            });
        }
        return out;
    }

    /**
     * Toggle visibility of a layer without unloading it.
     */
    setLayerVisible(id, visible) {
        const layer = this.layers.get(id);
        if (!layer) return false;
        layer.visible = !!visible;
        this._emitChange("visibility", id);
        return true;
    }

    /**
     * v793 — attach a layer to a scene object so its position tracks
     * the object each frame. Target ID format:
     *   "kaiju:<id>"   → kaiju position
     *   "civ:<id>"     → civ center
     *   "window:<key>" → window[<key>].position (raw escape hatch)
     *   "<id>"         → tries kaiju first, then civ
     * Offset is added in WORLD space (i.e. layer rotation/scale do not
     * affect it — the layer's own setRotation/setScale apply to the
     * splat cloud about the target point).
     */
    attachLayerTo(layerId, targetId, offset = [0, 0, 0]) {
        const layer = this.layers.get(layerId);
        if (!layer) return false;
        layer.followTarget = targetId;
        layer.followOffset = Array.isArray(offset) ? offset.slice() : [0, 0, 0];
        return true;
    }

    detachLayerFrom(layerId) {
        const layer = this.layers.get(layerId);
        if (!layer) return false;
        layer.followTarget = null;
        return true;
    }

    /**
     * v793 — per-frame: for each layer with a followTarget, resolve the
     * target and update layer.position. If target lookup fails, the
     * layer stays at its last position (no jump).
     */
    _resolveFollowTargets() {
        for (const layer of this.layers.values()) {
            if (!layer.followTarget) continue;
            const pos = this._lookupTargetPosition(layer.followTarget);
            if (!pos) continue;
            const o = layer.followOffset;
            layer.setPosition(pos[0] + o[0], pos[1] + o[1], pos[2] + o[2]);
        }
    }

    /**
     * v797 — set/clear a layer's scene-graph parent. The child inherits
     * the parent's full world transform (composed each frame via
     * _resolveWorldMatrices). Pass parentId = null to detach.
     *
     * Cycles are rejected: walking up from the proposed parent must not
     * reach the child. Self-parenting is also rejected.
     */
    setLayerParent(childId, parentId) {
        const child = this.layers.get(childId);
        if (!child) return false;
        if (parentId === null || parentId === undefined) {
            child.parentLayerId = null;
            return true;
        }
        if (childId === parentId) return false;
        // Cycle check: walk up from parent; if we hit child, it's a cycle
        let cur = this.layers.get(parentId);
        let depth = 0;
        while (cur && depth < 16) {
            if (cur.id === childId) return false;
            if (!cur.parentLayerId) break;
            cur = this.layers.get(cur.parentLayerId);
            depth++;
        }
        if (!this.layers.has(parentId)) return false;
        child.parentLayerId = parentId;
        return true;
    }

    getLayerParent(childId) {
        return this.layers.get(childId)?.parentLayerId ?? null;
    }

    /**
     * v797 — recursively compose this layer's world matrix from its
     * local matrix + its parent chain. Depth-limited to 8 levels so
     * cycles can't hang (also guarded by setLayerParent).
     *
     *   world = parent.world * local
     *
     * Result is stored in layer._worldMat and returned.
     */
    _resolveWorldMatrix(layer, depth = 0) {
        if (depth > 8) {
            // Defensive — should never hit due to cycle check
            for (let i = 0; i < 16; i++) layer._worldMat[i] = layer._modelMat[i];
            return layer._worldMat;
        }
        if (!layer.parentLayerId) {
            for (let i = 0; i < 16; i++) layer._worldMat[i] = layer._modelMat[i];
            return layer._worldMat;
        }
        const parent = this.layers.get(layer.parentLayerId);
        if (!parent) {
            // Parent removed — degrade gracefully
            for (let i = 0; i < 16; i++) layer._worldMat[i] = layer._modelMat[i];
            return layer._worldMat;
        }
        const parentWorld = this._resolveWorldMatrix(parent, depth + 1);
        // layer._worldMat = parentWorld * layer._modelMat
        this._mulMat4Into(layer._worldMat, parentWorld, layer._modelMat);
        return layer._worldMat;
    }

    /**
     * v797 — resolve all layers' world matrices in one pass.
     */
    _resolveWorldMatrices() {
        for (const layer of this.layers.values()) {
            this._resolveWorldMatrix(layer);
        }
    }

    /**
     * v797 — destination-aware 4x4 multiply. out = a * b.
     * Used by _resolveWorldMatrix to avoid clobbering scratch state
     * during recursion (the existing _mulMat4 uses a shared scratch).
     */
    _mulMat4Into(out, a, b) {
        for (let r = 0; r < 4; r++) {
            for (let c = 0; c < 4; c++) {
                let sum = 0;
                for (let k = 0; k < 4; k++) sum += a[k*4 + r] * b[c*4 + k];
                out[c*4 + r] = sum;
            }
        }
    }

    /**
     * Duck-typed target lookup. Returns [x, y, z] or null.
     */
    _lookupTargetPosition(targetId) {
        if (typeof window === "undefined") return null;
        // Parse "type:id" or bare "id"
        let type = null, id = targetId;
        const colon = targetId.indexOf(":");
        if (colon > 0) {
            type = targetId.slice(0, colon);
            id = targetId.slice(colon + 1);
        }
        const tryKaiju = () => {
            const km = window.kaijuManager;
            if (!km?.kaiju?.get) return null;
            const k = km.kaiju.get(id);
            if (!k?.position) return null;
            return [k.position.x, k.position.y, k.position.z];
        };
        const tryCiv = () => {
            const cm = window.civManager;
            if (!cm) return null;
            const all = cm.getAll?.() ?? [];
            for (const c of all) {
                if (c.id === id && c.center) return [c.center.x, c.center.y, c.center.z];
            }
            return null;
        };
        const tryWindow = () => {
            const obj = window[id];
            if (!obj?.position) return null;
            return [obj.position.x, obj.position.y, obj.position.z];
        };
        if (type === "kaiju")  return tryKaiju();
        if (type === "civ")    return tryCiv();
        if (type === "window") return tryWindow();
        // No prefix: try kaiju → civ → window
        return tryKaiju() ?? tryCiv() ?? tryWindow();
    }

    // ============================================================
    // Legacy single-layer API (operates on currentLayerId)
    // ============================================================

    get visible()  { return this.layers.get(this.currentLayerId)?.visible ?? false; }
    set visible(v) { const l = this.layers.get(this.currentLayerId); if (l) l.visible = v; }
    get lastInfo() {
        const l = this.layers.get(this.currentLayerId);
        return l?.info ? { ...l.info, sourceName: l.info.sourceName } : null;
    }
    get position() { return this._ensureLayer(this.currentLayerId).position; }
    get scale()    { return this._ensureLayer(this.currentLayerId).scale; }
    get rotation() { return this._ensureLayer(this.currentLayerId).rotation; }

    async loadUrl(url, layerId = null) {
        const id = layerId || this.currentLayerId;
        const layer = this._ensureLayer(id);
        const t0 = performance.now();
        const resp = await fetch(url);
        if (!resp.ok) throw new Error(`SplatScene.loadUrl: HTTP ${resp.status} ${url}`);
        const buf = await resp.arrayBuffer();
        const parsed = parseSplatFile(buf, url);
        layer.renderer.load(parsed);
        layer.visible = true;
        layer.sourceUrl = url;
        layer.sourceName = url.split(/[\\/]/).pop();
        layer.transient = false;                              // URL-based = persistable
        const ms = Math.round(performance.now() - t0);
        layer.info = { count: parsed.count, format: parsed.format, sourceName: layer.sourceName, ms };
        console.log(`[SplatScene/${id}] loaded ${parsed.count} splats from ${url} (${parsed.format}, ${ms}ms)`);
        this._emitChange("load", id);
        if (this.autoSave) this._requestAutoSave();
        return layer.info;
    }

    async loadFile(file, layerId = null) {
        const id = layerId || this.currentLayerId;
        const layer = this._ensureLayer(id);
        const t0 = performance.now();
        const buf = await file.arrayBuffer();
        const parsed = parseSplatFile(buf, file.name);
        layer.renderer.load(parsed);
        layer.visible = true;
        layer.sourceUrl = null;
        layer.sourceName = file.name;
        layer.transient = true;                                // file-based = not persistable
        const ms = Math.round(performance.now() - t0);
        layer.info = { count: parsed.count, format: parsed.format, sourceName: file.name, ms };
        console.log(`[SplatScene/${id}] loaded ${parsed.count} splats from file '${file.name}' (${parsed.format}, ${ms}ms)`);
        this._emitChange("load", id);
        if (this.autoSave) this._requestAutoSave();
        return layer.info;
    }

    loadParsed(parsed, label = "parsed", layerId = null) {
        const id = layerId || this.currentLayerId;
        const layer = this._ensureLayer(id);
        layer.renderer.load(parsed);
        layer.visible = true;
        layer.transient = true;
        layer.info = { count: parsed.count, format: parsed.format, sourceName: label, ms: 0 };
        this._emitChange("load", id);
        return layer.info;
    }

    clear(layerId = null) {
        const id = layerId || this.currentLayerId;
        const layer = this.layers.get(id);
        if (!layer) return;
        // "Clear" the current layer means make it invisible. Use removeLayer
        // to fully dispose. This matches v784-v788 semantics where clear()
        // hid the cloud without disposing GPU buffers.
        layer.visible = false;
        layer.info = null;
        this._emitChange("clear", id);
        if (this.autoSave) this._requestAutoSave();
    }

    setMode(mode, layerId = null) {
        const id = layerId || this.currentLayerId;
        const layer = this.layers.get(id);
        if (layer) layer.renderer.mode = (mode === "billboard") ? "billboard" : "gaussian";
    }
    setPointSize(px, layerId = null) {
        const id = layerId || this.currentLayerId;
        const layer = this.layers.get(id);
        if (layer) layer.renderer.pointSize = px;
    }
    setTanFov(t, layerId = null) {
        const id = layerId || this.currentLayerId;
        const layer = this.layers.get(id);
        if (layer) layer.renderer.tanFov = t;
    }

    setPosition(x, y, z, layerId = null) {
        const id = layerId || this.currentLayerId;
        this._ensureLayer(id).setPosition(x, y, z);
        if (this.autoSave) this._requestAutoSave();
    }
    setScale(s, layerId = null) {
        const id = layerId || this.currentLayerId;
        this._ensureLayer(id).setScale(s);
        if (this.autoSave) this._requestAutoSave();
    }
    setRotation(w, x, y, z, layerId = null) {
        const id = layerId || this.currentLayerId;
        this._ensureLayer(id).setRotation(w, x, y, z);
        if (this.autoSave) this._requestAutoSave();
    }
    placeAt(x, y, z, scale = 1.0, layerId = null) {
        const id = layerId || this.currentLayerId;
        const layer = this._ensureLayer(id);
        layer.setPosition(x, y, z);
        layer.setScale(scale);
        if (this.autoSave) this._requestAutoSave();
    }
    getTransform(layerId = null) {
        const id = layerId || this.currentLayerId;
        const layer = this.layers.get(id);
        if (!layer) return null;
        return { position: layer.position.slice(), scale: layer.scale, rotation: layer.rotation.slice() };
    }

    // ============================================================
    // Render loop hook
    // ============================================================

    draw(camera) {
        if (!camera || this.layers.size === 0) return;
        const cw = this.canvas?.width  || this.canvas?.clientWidth  || 1;
        const ch = this.canvas?.height || this.canvas?.clientHeight || 1;

        // v793 — first run follow-target resolution on each layer that has
        // one. This updates layer.position before the model matrix builds.
        this._resolveFollowTargets();

        // v797 — then compose world matrices (parent.world * local) so
        // every downstream consumer (_drawMerged, pickLayer, pickSplat,
        // per-layer draw path) reads the same world transform.
        this._resolveWorldMatrices();

        const view = camera.view ?? camera._view ?? null;
        const proj = camera.proj ?? camera.projection ?? camera._proj ?? null;

        // Count visible layers for merged-path eligibility
        let visibleCount = 0;
        for (const layer of this.layers.values()) if (layer.visible) visibleCount++;

        // v793 — merged cross-layer sort path (opt-in, more expensive but
        // correct for overlapping layers)
        if (this.sortMode === "merged" && visibleCount > 1 && view && proj) {
            this._drawMerged(camera, cw, ch, view, proj);
            return;
        }

        let tanFov = null;
        if (camera.fovY != null)      tanFov = Math.tan(0.5 * camera.fovY);
        else if (camera.fov != null)  tanFov = Math.tan(0.5 * camera.fov);

        // v790 — sort layers by camera-distance to their world-space center,
        // back to front. Each layer still alpha-blends correctly within
        // itself (its own depth sort handles intra-layer order); this
        // gives the right compositing for non-overlapping clouds in
        // different parts of the scene.
        // Camera-space Z extraction from view matrix (column-major):
        //   z_view = V[2]*x + V[6]*y + V[10]*z + V[14]
        // For each layer, evaluate at the layer's world position.
        const layersArr = Array.from(this.layers.values());
        if (view && layersArr.length > 1) {
            const V = view;
            for (const layer of layersArr) {
                const [px, py, pz] = layer.position;
                layer._sortKey = V[2]*px + V[6]*py + V[10]*pz + V[14];
            }
            // Back-to-front: most negative Z (furthest) first
            layersArr.sort((a, b) => a._sortKey - b._sortKey);
        }

        // Draw each visible layer in sorted order
        for (const layer of layersArr) {
            if (!layer.visible) continue;
            const r = layer.renderer;
            r.viewport[0] = cw;
            r.viewport[1] = ch;
            if (tanFov !== null) r.tanFov = tanFov;
            r.modelScale = layer.scale;

            // Bake model transform into view (per-layer)
            let effectiveView = view;
            let effectiveViewProj = camera.viewProj;
            if (view) {
                layer._composeViewModel(view);
                effectiveView = layer._viewModel;
            }
            if (proj && layer._viewModel && view) {
                effectiveViewProj = this._mulMat4(proj, layer._viewModel);
            } else if (camera.viewProj && !view) {
                layer._composeViewModel(camera.viewProj);
                effectiveViewProj = layer._viewModel;
            }
            try { r.draw(effectiveViewProj, effectiveView, proj); }
            catch (e) { /* never break the render loop */ }
        }
    }

    _mulMat4(a, b) {
        const out = this._mulScratch;
        for (let r = 0; r < 4; r++) {
            for (let c = 0; c < 4; c++) {
                let sum = 0;
                for (let k = 0; k < 4; k++) sum += a[k*4 + r] * b[c*4 + k];
                out[c*4 + r] = sum;
            }
        }
        return out;
    }

    /**
     * v793 — set sort mode. "per-layer" (default) sorts each layer
     * internally, then composites layers back-to-front by layer-center
     * camera distance. Fast. Correct when layers don't overlap.
     *
     * "merged" performs a global cross-layer sort each frame for correct
     * compositing of overlapping clouds. CPU cost: O(N_total log N_total)
     * per frame — acceptable up to ~50K total splats, slow beyond.
     */
    setSortMode(mode) {
        this.sortMode = (mode === "merged") ? "merged" : "per-layer";
    }

    /**
     * v793 — merged cross-layer draw path. Used when sortMode === "merged".
     * Steps:
     *   1. Compute layer model matrices + view-space Z for each splat
     *   2. Sort globally back-to-front
     *   3. Walk sorted array, batch contiguous runs of same-layer
     *   4. For each batch, call layer.renderer.drawSubset with the indices
     */
    _drawMerged(camera, cw, ch, view, proj) {
        let tanFov = null;
        if (camera.fovY != null)      tanFov = Math.tan(0.5 * camera.fovY);
        else if (camera.fov != null)  tanFov = Math.tan(0.5 * camera.fov);

        // Step 1: gather world-space view-Z for every visible splat.
        // Build the merged list lazily — single allocation reused frame-to-frame.
        // Each entry: 3 numbers packed into typed arrays to minimize GC.
        let totalSplats = 0;
        for (const layer of this.layers.values()) {
            if (!layer.visible) continue;
            totalSplats += (layer.renderer?._splatPos?.length ?? 0) / 3;
        }
        if (totalSplats === 0) return;

        if (!this._mergedBuf || this._mergedBuf.cap < totalSplats) {
            this._mergedBuf = {
                cap:      totalSplats,
                layerIdx: new Int32Array(totalSplats),     // which layer (index into _mergedLayers)
                splatIdx: new Uint32Array(totalSplats),    // splat index within that layer
                viewZ:    new Float32Array(totalSplats),
                order:    new Uint32Array(totalSplats),    // sorted indices into the above
            };
        }

        // Snapshot the visible layers (stable order for this frame)
        const mergedLayers = [];
        for (const layer of this.layers.values()) {
            if (!layer.visible) continue;
            mergedLayers.push(layer);
        }

        const buf = this._mergedBuf;
        let n = 0;
        for (let li = 0; li < mergedLayers.length; li++) {
            const layer = mergedLayers[li];
            const positions = layer.renderer._splatPos;
            const count = positions.length / 3;
            // v797 — use world matrix (parent chain composed) instead of local
            const M = layer._worldMat;
            // View-space Z of world-space position = V[2,6,10,14] · (M · localPos, 1)
            // Equivalent: (V * M)[2,6,10,14] · localPos. Precompute the row.
            const a = V_ROW_2(view, M);
            for (let i = 0; i < count; i++) {
                const lx = positions[i*3+0], ly = positions[i*3+1], lz = positions[i*3+2];
                buf.layerIdx[n] = li;
                buf.splatIdx[n] = i;
                buf.viewZ[n] = a[0]*lx + a[1]*ly + a[2]*lz + a[3];
                n++;
            }
        }

        // Step 2: sort. Build an order array, sort by viewZ ascending
        // (most-negative Z = furthest from camera = drawn first).
        for (let i = 0; i < n; i++) buf.order[i] = i;
        // Need a comparator that reads from buf.viewZ
        const viewZ = buf.viewZ;
        const sortable = Array.from(buf.order.subarray(0, n));
        sortable.sort((a, b) => viewZ[a] - viewZ[b]);
        for (let i = 0; i < n; i++) buf.order[i] = sortable[i];

        // Step 3+4: walk sorted, batch by layer, draw each batch via drawSubset
        let i = 0;
        const indexScratch = new Uint32Array(n);   // worst case all in one batch
        while (i < n) {
            const k0 = buf.order[i];
            const batchLayerIdx = buf.layerIdx[k0];
            const layer = mergedLayers[batchLayerIdx];
            // Walk to end of this run
            let j = i, batchN = 0;
            while (j < n && buf.layerIdx[buf.order[j]] === batchLayerIdx) {
                indexScratch[batchN++] = buf.splatIdx[buf.order[j]];
                j++;
            }
            // Compose the layer's viewModel matrix (same logic as per-layer path)
            const r = layer.renderer;
            r.viewport[0] = cw;
            r.viewport[1] = ch;
            if (tanFov !== null) r.tanFov = tanFov;
            r.modelScale = layer.scale;
            layer._composeViewModel(view);
            const effectiveView = layer._viewModel;
            try { r.drawSubset(effectiveView, proj, indexScratch, batchN); }
            catch (e) { /* must not break render loop */ }
            i = j;
        }
    }

    /**
     * v792 — per-splat pick. Refines pickLayer to the splat level by
     * iterating the renderer's instance positions and computing
     * ray-vs-sphere (sphere radius = 3σ of the splat's max scale —
     * matches the screen-space extent the shader uses).
     *
     * Cost: O(N_splats) per call but constant-time per splat. For
     * typical 32K splat clouds: <1ms. For 256K, ~5ms. Use sparingly
     * (e.g. on click, not on every mousemove).
     *
     * @returns {{layerId, splatIdx, position, color, distance}|null}
     */
    pickSplat(screenX, screenY, camera) {
        if (!camera || this.layers.size === 0) return null;
        const cw = this.canvas?.width  || this.canvas?.clientWidth  || 1;
        const ch = this.canvas?.height || this.canvas?.clientHeight || 1;
        const ndcX = (2 * screenX / cw) - 1;
        const ndcY = 1 - (2 * screenY / ch);

        const viewProj = camera.viewProj || (camera.view && camera.proj
            ? this._mulMat4(camera.proj, camera.view) : null);
        if (!viewProj) return null;
        const invVP = this._invertMat4(viewProj);
        if (!invVP) return null;

        const near = this._transformPoint(invVP, ndcX, ndcY, -1);
        const far  = this._transformPoint(invVP, ndcX, ndcY,  1);
        if (!near || !far) return null;
        const dx = far[0] - near[0], dy = far[1] - near[1], dz = far[2] - near[2];
        const len = Math.hypot(dx, dy, dz) || 1;
        const dirX = dx/len, dirY = dy/len, dirZ = dz/len;
        const eyeX = near[0], eyeY = near[1], eyeZ = near[2];

        let bestId = null, bestIdx = -1, bestDist = Infinity;
        let bestPos = null, bestColor = null;

        for (const layer of this.layers.values()) {
            if (!layer.visible) continue;
            const positions = layer.renderer?._splatPos;
            const scales    = layer.renderer?._splatScale;
            const colors    = layer.renderer?._splatCol;
            if (!positions || !scales) continue;
            const count = positions.length / 3;

            // Pre-compute layer world matrix as M so we can transform each
            // splat to world space. M is column-major.
            // v797 — use _worldMat (composes parent chain) instead of _modelMat.
            const M = layer._worldMat;

            for (let i = 0; i < count; i++) {
                // World-space splat center
                const lx = positions[i*3+0], ly = positions[i*3+1], lz = positions[i*3+2];
                const wx = M[0]*lx + M[4]*ly + M[8]*lz  + M[12];
                const wy = M[1]*lx + M[5]*ly + M[9]*lz  + M[13];
                const wz = M[2]*lx + M[6]*ly + M[10]*lz + M[14];

                // Sphere radius: 3σ of max scale × layer scale
                const maxScale = Math.max(scales[i*3+0], scales[i*3+1], scales[i*3+2]);
                const radius = 3 * maxScale * layer.scale;

                // Closest point on ray to splat center
                const tx = wx - eyeX, ty = wy - eyeY, tz = wz - eyeZ;
                const t = tx*dirX + ty*dirY + tz*dirZ;
                if (t < 0) continue;                         // behind camera
                const cx = eyeX + t*dirX, cy = eyeY + t*dirY, cz = eyeZ + t*dirZ;
                const dxx = wx - cx, dyy = wy - cy, dzz = wz - cz;
                const dist2 = dxx*dxx + dyy*dyy + dzz*dzz;
                if (dist2 > radius * radius) continue;       // ray misses sphere

                if (t < bestDist) {
                    bestDist = t;
                    bestId = layer.id;
                    bestIdx = i;
                    bestPos = [wx, wy, wz];
                    if (colors) {
                        bestColor = [colors[i*4+0]/255, colors[i*4+1]/255, colors[i*4+2]/255, colors[i*4+3]/255];
                    }
                }
            }
        }

        if (bestId == null) return null;
        return { layerId: bestId, splatIdx: bestIdx, position: bestPos, color: bestColor, distance: bestDist };
    }

    /**
     * v791 — screen-position layer pick. Returns the closest visible
     * layer whose world-space AABB the camera ray intersects, or null.
     *
     * @param {number} screenX  CSS pixel x (0 = left edge of canvas)
     * @param {number} screenY  CSS pixel y (0 = top edge of canvas)
     * @param {Object} camera   must expose either {view, proj} matrices
     *                          (column-major Float32Array(16)) OR
     *                          a viewProj. Plus an `eye` field
     *                          (camera world position) if available;
     *                          falls back to inverse-view extraction.
     * @returns {{layerId, distance, hitPoint}|null}
     */
    pickLayer(screenX, screenY, camera) {
        if (!camera || this.layers.size === 0) return null;
        const cw = this.canvas?.width  || this.canvas?.clientWidth  || 1;
        const ch = this.canvas?.height || this.canvas?.clientHeight || 1;
        // NDC: x in [-1, 1], y FLIPPED (top-left → bottom-left)
        const ndcX = (2 * screenX / cw) - 1;
        const ndcY = 1 - (2 * screenY / ch);

        // Build the world-space ray. We need:
        //   - eye   (camera world position)
        //   - dir   (unit vector through pixel)
        // Approach: unproject (ndcX, ndcY, -1) and (ndcX, ndcY, +1) from
        // clip space using inverse(viewProj), then dir = normalize(far - near).
        // We compute inverse(viewProj) inline (small 4x4).
        const viewProj = camera.viewProj || (camera.view && camera.proj
            ? this._mulMat4(camera.proj, camera.view) : null);
        if (!viewProj) return null;
        const invVP = this._invertMat4(viewProj);
        if (!invVP) return null;

        // Unproject NDC near + far
        const near = this._transformPoint(invVP, ndcX, ndcY, -1);
        const far  = this._transformPoint(invVP, ndcX, ndcY,  1);
        if (!near || !far) return null;
        const dx = far[0] - near[0], dy = far[1] - near[1], dz = far[2] - near[2];
        const len = Math.hypot(dx, dy, dz) || 1;
        const dir = [dx/len, dy/len, dz/len];
        const eye = near;                     // ray starts at the near-plane projection

        // For each visible layer, transform its AABB (renderer-local) to
        // world space via the layer's model matrix, then ray-vs-AABB.
        let bestId = null, bestDist = Infinity, bestHit = null;
        for (const layer of this.layers.values()) {
            if (!layer.visible) continue;
            const aabb = layer.renderer?.aabb;
            if (!aabb) continue;
            // Transform AABB corners through layer model matrix, compute new AABB
            // v797 — use _worldMat (composes parent chain) instead of _modelMat
            const worldAabb = this._transformAabb(aabb, layer._worldMat);
            const hit = this._rayAabb(eye, dir, worldAabb);
            if (hit && hit.t > 0 && hit.t < bestDist) {
                bestDist = hit.t;
                bestId = layer.id;
                bestHit = [eye[0] + dir[0]*hit.t, eye[1] + dir[1]*hit.t, eye[2] + dir[2]*hit.t];
            }
        }
        if (bestId == null) return null;
        return { layerId: bestId, distance: bestDist, hitPoint: bestHit };
    }

    /**
     * Transform an AABB through a 4x4 matrix by projecting its 8 corners
     * and re-computing min/max.
     */
    _transformAabb(aabb, M) {
        let minX = Infinity, minY = Infinity, minZ = Infinity;
        let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
        for (let i = 0; i < 8; i++) {
            const x = (i & 1) ? aabb.maxX : aabb.minX;
            const y = (i & 2) ? aabb.maxY : aabb.minY;
            const z = (i & 4) ? aabb.maxZ : aabb.minZ;
            const wx = M[0]*x + M[4]*y + M[8]*z  + M[12];
            const wy = M[1]*x + M[5]*y + M[9]*z  + M[13];
            const wz = M[2]*x + M[6]*y + M[10]*z + M[14];
            if (wx < minX) minX = wx; if (wx > maxX) maxX = wx;
            if (wy < minY) minY = wy; if (wy > maxY) maxY = wy;
            if (wz < minZ) minZ = wz; if (wz > maxZ) maxZ = wz;
        }
        return { minX, minY, minZ, maxX, maxY, maxZ };
    }

    /**
     * Ray-vs-AABB slab test. Returns { t } for the entry intersection or null.
     */
    _rayAabb(o, d, b) {
        let tmin = -Infinity, tmax = Infinity;
        for (let i = 0; i < 3; i++) {
            const oi = o[i], di = d[i];
            const lo = i === 0 ? b.minX : i === 1 ? b.minY : b.minZ;
            const hi = i === 0 ? b.maxX : i === 1 ? b.maxY : b.maxZ;
            if (Math.abs(di) < 1e-9) {
                // Ray parallel to slab — must be inside the slab
                if (oi < lo || oi > hi) return null;
            } else {
                let t1 = (lo - oi) / di;
                let t2 = (hi - oi) / di;
                if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
                if (t1 > tmin) tmin = t1;
                if (t2 < tmax) tmax = t2;
                if (tmin > tmax) return null;
            }
        }
        // tmin is the entry distance (could be negative if eye is inside box)
        return { t: tmin >= 0 ? tmin : (tmax >= 0 ? tmax : null) };
    }

    /**
     * Transform a point through a 4x4 matrix with perspective divide.
     */
    _transformPoint(M, x, y, z) {
        const px = M[0]*x + M[4]*y + M[8]*z  + M[12];
        const py = M[1]*x + M[5]*y + M[9]*z  + M[13];
        const pz = M[2]*x + M[6]*y + M[10]*z + M[14];
        const pw = M[3]*x + M[7]*y + M[11]*z + M[15];
        if (Math.abs(pw) < 1e-9) return null;
        return [px/pw, py/pw, pz/pw];
    }

    /**
     * Invert a 4x4 column-major matrix. Returns a new Float32Array(16),
     * or null if non-invertible.
     */
    _invertMat4(m) {
        const out = new Float32Array(16);
        out[0]  =  m[5]*m[10]*m[15] - m[5]*m[11]*m[14] - m[9]*m[6]*m[15] + m[9]*m[7]*m[14] + m[13]*m[6]*m[11] - m[13]*m[7]*m[10];
        out[4]  = -m[4]*m[10]*m[15] + m[4]*m[11]*m[14] + m[8]*m[6]*m[15] - m[8]*m[7]*m[14] - m[12]*m[6]*m[11] + m[12]*m[7]*m[10];
        out[8]  =  m[4]*m[9]*m[15]  - m[4]*m[11]*m[13] - m[8]*m[5]*m[15] + m[8]*m[7]*m[13] + m[12]*m[5]*m[11] - m[12]*m[7]*m[9];
        out[12] = -m[4]*m[9]*m[14]  + m[4]*m[10]*m[13] + m[8]*m[5]*m[14] - m[8]*m[6]*m[13] - m[12]*m[5]*m[10] + m[12]*m[6]*m[9];
        out[1]  = -m[1]*m[10]*m[15] + m[1]*m[11]*m[14] + m[9]*m[2]*m[15] - m[9]*m[3]*m[14] - m[13]*m[2]*m[11] + m[13]*m[3]*m[10];
        out[5]  =  m[0]*m[10]*m[15] - m[0]*m[11]*m[14] - m[8]*m[2]*m[15] + m[8]*m[3]*m[14] + m[12]*m[2]*m[11] - m[12]*m[3]*m[10];
        out[9]  = -m[0]*m[9]*m[15]  + m[0]*m[11]*m[13] + m[8]*m[1]*m[15] - m[8]*m[3]*m[13] - m[12]*m[1]*m[11] + m[12]*m[3]*m[9];
        out[13] =  m[0]*m[9]*m[14]  - m[0]*m[10]*m[13] - m[8]*m[1]*m[14] + m[8]*m[2]*m[13] + m[12]*m[1]*m[10] - m[12]*m[2]*m[9];
        out[2]  =  m[1]*m[6]*m[15]  - m[1]*m[7]*m[14]  - m[5]*m[2]*m[15] + m[5]*m[3]*m[14] + m[13]*m[2]*m[7]  - m[13]*m[3]*m[6];
        out[6]  = -m[0]*m[6]*m[15]  + m[0]*m[7]*m[14]  + m[4]*m[2]*m[15] - m[4]*m[3]*m[14] - m[12]*m[2]*m[7]  + m[12]*m[3]*m[6];
        out[10] =  m[0]*m[5]*m[15]  - m[0]*m[7]*m[13]  - m[4]*m[1]*m[15] + m[4]*m[3]*m[13] + m[12]*m[1]*m[7]  - m[12]*m[3]*m[5];
        out[14] = -m[0]*m[5]*m[14]  + m[0]*m[6]*m[13]  + m[4]*m[1]*m[14] - m[4]*m[2]*m[13] - m[12]*m[1]*m[6]  + m[12]*m[2]*m[5];
        out[3]  = -m[1]*m[6]*m[11]  + m[1]*m[7]*m[10]  + m[5]*m[2]*m[11] - m[5]*m[3]*m[10] - m[9]*m[2]*m[7]   + m[9]*m[3]*m[6];
        out[7]  =  m[0]*m[6]*m[11]  - m[0]*m[7]*m[10]  - m[4]*m[2]*m[11] + m[4]*m[3]*m[10] + m[8]*m[2]*m[7]   - m[8]*m[3]*m[6];
        out[11] = -m[0]*m[5]*m[11]  + m[0]*m[7]*m[9]   + m[4]*m[1]*m[11] - m[4]*m[3]*m[9]  - m[8]*m[1]*m[7]   + m[8]*m[3]*m[5];
        out[15] =  m[0]*m[5]*m[10]  - m[0]*m[6]*m[9]   - m[4]*m[1]*m[10] + m[4]*m[2]*m[9]  + m[8]*m[1]*m[6]   - m[8]*m[2]*m[5];
        let det = m[0]*out[0] + m[1]*out[4] + m[2]*out[8] + m[3]*out[12];
        if (Math.abs(det) < 1e-12) return null;
        det = 1 / det;
        for (let i = 0; i < 16; i++) out[i] *= det;
        return out;
    }

    // ============================================================
    // localStorage persistence (v789)
    // ============================================================

    /**
     * Serialize all non-transient layers + their transforms to localStorage.
     */
    saveState() {
        try {
            const layers = [];
            for (const layer of this.layers.values()) {
                if (layer.transient) continue;
                if (!layer.sourceUrl) continue;        // file-only — can't restore
                layers.push(layer.serialize());
            }
            const payload = {
                version: 1,
                savedAt: Date.now(),
                currentLayerId: this.currentLayerId,
                layers,
            };
            window.localStorage?.setItem(STORAGE_KEY, JSON.stringify(payload));
            return payload;
        } catch (e) {
            console.warn("[SplatScene] saveState failed:", e?.message);
            return null;
        }
    }

    /**
     * Restore state from localStorage. Returns the number of layers loaded.
     * Each layer triggers a fetch — call this AFTER the engine has the GL
     * context ready, ideally during init.
     *
     * v791 — race-safe: skips any layer IDs that already exist in the
     * scene (user could have drag-dropped or manually loaded something
     * during the boot window before auto-restore fired).
     */
    async restoreState() {
        let raw = null;
        try { raw = window.localStorage?.getItem(STORAGE_KEY); } catch {}
        if (!raw) return 0;
        let payload = null;
        try { payload = JSON.parse(raw); } catch (e) {
            console.warn("[SplatScene] restoreState parse failed:", e?.message);
            return 0;
        }
        if (!payload?.layers?.length) return 0;
        let loaded = 0, skipped = 0;
        for (const meta of payload.layers) {
            // v791 — race protection: don't clobber a layer the user
            // already loaded during the boot window. Only restore if
            // the layer ID is absent OR present-but-empty (info=null
            // would mean it was created but never loaded).
            const existing = this.layers.get(meta.id);
            if (existing && existing.info && existing.info.count > 0) {
                skipped++;
                continue;
            }
            try {
                await this.loadUrl(meta.sourceUrl, meta.id);
                // Apply saved transform AFTER load (load resets some state)
                const layer = this._ensureLayer(meta.id);
                if (Array.isArray(meta.position)) layer.setPosition(meta.position);
                if (typeof meta.scale === "number") layer.setScale(meta.scale);
                if (Array.isArray(meta.rotation)) layer.setRotation(meta.rotation);
                if (typeof meta.visible === "boolean") layer.visible = meta.visible;
                if (typeof meta.mode === "string") layer.renderer.mode = meta.mode;
                loaded++;
            } catch (e) {
                console.warn(`[SplatScene] failed to restore layer '${meta.id}' from ${meta.sourceUrl}:`, e?.message);
            }
        }
        // v797 — second pass: re-apply parent links AFTER all layers exist.
        // setLayerParent rejects unknown parents, so this avoids partial-restore failures.
        for (const meta of payload.layers) {
            if (typeof meta.parentLayerId === "string") {
                this.setLayerParent(meta.id, meta.parentLayerId);
            }
        }
        // Only override currentLayerId if the user hasn't already set it
        if (typeof payload.currentLayerId === "string" && skipped === 0) {
            this.currentLayerId = payload.currentLayerId;
        }
        if (skipped > 0) {
            console.log(`[SplatScene] restored ${loaded}/${payload.layers.length} layers (${skipped} skipped: already loaded by user)`);
        } else {
            console.log(`[SplatScene] restored ${loaded}/${payload.layers.length} layers from localStorage`);
        }
        return loaded;
    }

    /**
     * Wipe persisted state (useful when a URL becomes stale).
     */
    forgetState() {
        try { window.localStorage?.removeItem(STORAGE_KEY); } catch {}
    }

    // ============================================================
    // Events
    // ============================================================

    _emitChange(kind, layerId = null) {
        try {
            if (typeof window !== "undefined" && typeof CustomEvent === "function") {
                window.dispatchEvent(new CustomEvent("splatscene-change", {
                    detail: { kind, layerId, info: this.lastInfo, visible: this.visible },
                }));
            }
        } catch {}
    }

    // ============================================================
    // Drag-and-drop wiring
    // ============================================================

    enableDragDrop() {
        if (this._dropEnabled) return;
        const cnv = this.canvas;
        if (!cnv) return;
        this._onDragOver = (e) => {
            const items = e.dataTransfer?.items;
            if (!items) return;
            for (const item of items) {
                const name = item.getAsFile?.()?.name || "";
                if (/\.(splat|ply)$/i.test(name)) { e.preventDefault(); break; }
            }
        };
        this._onDrop = async (e) => {
            const files = e.dataTransfer?.files;
            if (!files || files.length === 0) return;
            for (const f of files) {
                if (/\.(splat|ply)$/i.test(f.name)) {
                    e.preventDefault();
                    try { await this.loadFile(f); }
                    catch (err) { console.warn("[SplatScene] drop load failed:", err.message); }
                    return;
                }
            }
        };
        cnv.addEventListener("dragover", this._onDragOver);
        cnv.addEventListener("drop", this._onDrop);
        this._dropEnabled = true;
    }

    disableDragDrop() {
        if (!this._dropEnabled) return;
        this.canvas?.removeEventListener?.("dragover", this._onDragOver);
        this.canvas?.removeEventListener?.("drop", this._onDrop);
        this._dropEnabled = false;
    }

    // ============================================================
    // Global console API
    // ============================================================

    installGlobal() {
        if (typeof window === "undefined") return;
        const self = this;
        // v791 — flush pending autoSave on tab-close
        this._onBeforeUnload = () => self._flushAutoSave();
        try { window.addEventListener("beforeunload", this._onBeforeUnload); } catch {}
        window.splatScene = {
            // Legacy single-layer
            load:        (url, id) => self.loadUrl(url, id),
            loadFile:    (f, id)   => self.loadFile(f, id),
            clear:       (id)      => self.clear(id),
            setMode:     (m, id)   => self.setMode(m, id),
            setPointSize:(px, id)  => self.setPointSize(px, id),
            setTanFov:   (t, id)   => self.setTanFov(t, id),
            info:        ()        => self.lastInfo,
            visible:     ()        => self.visible,
            enableDrop:  ()        => self.enableDragDrop(),
            disableDrop: ()        => self.disableDragDrop(),
            // Transform (current layer)
            setPosition: (x,y,z,id)   => self.setPosition(x,y,z,id),
            setScale:    (s,id)       => self.setScale(s,id),
            setRotation: (w,x,y,z,id) => self.setRotation(w,x,y,z,id),
            placeAt:     (x,y,z,s,id) => self.placeAt(x,y,z,s,id),
            getTransform:(id)         => self.getTransform(id),
            // v789 — multi-layer
            list:           ()       => self.listLayers(),
            setCurrent:     (id)     => self.setCurrentLayer(id),
            getCurrent:     ()       => self.currentLayerId,
            remove:         (id)     => self.removeLayer(id),
            setVisible:     (id, v)  => self.setLayerVisible(id, v),
            saveState:      ()       => self.saveState(),
            restoreState:   ()       => self.restoreState(),
            forgetState:    ()       => self.forgetState(),
            // v791 — screen-position picking
            pick:           (x, y, cam) => self.pickLayer(x, y, cam ?? window.camera),
            // v792 — per-splat picking
            pickSplat:      (x, y, cam) => self.pickSplat(x, y, cam ?? window.camera),
            // v793 — cross-layer sort + scene-graph follow
            setSortMode:    (m)              => self.setSortMode(m),
            getSortMode:    ()               => self.sortMode,
            attachTo:       (id, tgt, off)   => self.attachLayerTo(id, tgt, off),
            detachFrom:     (id)             => self.detachLayerFrom(id),
            // v797 — scene-graph layer nesting
            setParent:      (childId, parentId) => self.setLayerParent(childId, parentId),
            getParent:      (childId)           => self.getLayerParent(childId),
            _ref: self,
        };
        console.log("[SplatScene] ready — window.splatScene.{load, list, setCurrent, remove, placeAt, saveState, restoreState}");
    }

    dispose() {
        // v790 — flush any pending autoSave + clear timer
        if (this._autoSaveTimer != null) {
            try { globalThis.clearTimeout?.(this._autoSaveTimer); } catch {}
            this._autoSaveTimer = null;
            try { this.saveState(); } catch {}   // final flush
        }
        // v791 — unhook beforeunload listener
        if (this._onBeforeUnload && typeof window !== "undefined") {
            try { window.removeEventListener("beforeunload", this._onBeforeUnload); } catch {}
            this._onBeforeUnload = null;
        }
        this.disableDragDrop();
        for (const layer of this.layers.values()) layer.dispose();
        this.layers.clear();
        if (typeof window !== "undefined" && window.splatScene?._ref === this) {
            delete window.splatScene;
        }
    }
}
