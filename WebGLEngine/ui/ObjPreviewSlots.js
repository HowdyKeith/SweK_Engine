// FILE: ui/ObjPreviewSlots.js
// VERSION: v1 — round 363
//
// Multi-slot OBJ preview card. Instead of one floating preview at a
// time, this is a draggable grid of N slots where each slot holds an
// independent rotating thumbnail. Useful for side-by-side comparison
// of race results, asset variants, or just keeping a few reference
// meshes visible while iterating.
//
// Each slot wraps an existing createObjThumbnail handle (which already
// handles OffscreenCanvas-in-worker rendering + main-thread fallback,
// plus mesh QC counts shown as a badge).
//
// API (returned from mountObjPreviewSlots):
//   setSlot(i, objText, opts)   fill slot i with a thumbnail
//   clearSlot(i)                empty a single slot
//   clearAll()                  empty everything
//   getSlotCount()              returns current grid size
//   resize(n)                   change grid size (re-renders existing entries)
//   show() / hide() / toggle()  visibility controls
//   element                      the panel DOM node
//   dispose()                    tear down

import { makeDraggable } from "./draggable.js";

const STORAGE_KEY = "voxelengine.objSlots_v1";

function _readState() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) return JSON.parse(raw);
    } catch {}
    return null;
}

function _writeState(state) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch {}
}

/**
 * @param {Object} [opts]
 * @param {number} [opts.slotCount=4]   default 2×2 grid
 * @param {number} [opts.slotSize=128]  pixel size per slot
 * @param {Function} [opts.makeThumbnail]  injectable for tests; defaults
 *                                          to createObjThumbnail
 */
export function mountObjPreviewSlots(opts = {}) {
    if (typeof document === "undefined") return null;

    const persisted = _readState() || {};
    let slotCount = opts.slotCount ?? persisted.slotCount ?? 4;
    const slotSize = opts.slotSize ?? 128;
    // For tests we inject; in browser we lazy-load createObjThumbnail
    const makeThumbnail = opts.makeThumbnail ?? null;

    const panel = document.createElement("div");
    Object.assign(panel.style, {
        position: "fixed",
        bottom: "100px",
        right: "20px",
        background: "rgba(8,14,20,0.96)",
        border: "1px solid #6ad",
        borderRadius: "8px",
        padding: "8px 12px 10px 12px",
        color: "#cfd",
        fontFamily: "monospace",
        fontSize: "11px",
        // z-index sits ABOVE the benchmark overlay (~8800) per the
        // memory: floating OBJ preview should render above benchmark.
        zIndex: "8870",
        boxShadow: "0 0 18px rgba(80,180,255,0.18)",
    });

    const header = document.createElement("div");
    header.style.cssText = "color:#6cf; font-weight:bold; letter-spacing:1.5px; padding-bottom:6px; border-bottom:1px solid #233; margin-bottom:8px; display:flex; align-items:center; gap:8px;";
    const title = document.createElement("span");
    title.textContent = "🖼 OBJ SLOTS";
    header.appendChild(title);
    const slotCountBadge = document.createElement("span");
    slotCountBadge.style.cssText = "background:#06060c; padding:1px 6px; border-radius:3px; font-size:9px; color:#9ab;";
    header.appendChild(slotCountBadge);
    const headerSpacer = document.createElement("span");
    headerSpacer.style.cssText = "flex:1;";
    header.appendChild(headerSpacer);
    const sizeBtn = document.createElement("button");
    sizeBtn.textContent = "size";
    sizeBtn.title = "cycle slot grid: 1 / 4 / 6 / 9";
    Object.assign(sizeBtn.style, {
        background: "#48c", border: "none", color: "#fff",
        padding: "2px 6px", borderRadius: "3px",
        cursor: "pointer", fontFamily: "monospace", fontSize: "9px",
    });
    header.appendChild(sizeBtn);
    const clearAllBtn = document.createElement("button");
    clearAllBtn.textContent = "clear";
    Object.assign(clearAllBtn.style, {
        background: "#a44", border: "none", color: "#fff",
        padding: "2px 6px", borderRadius: "3px",
        cursor: "pointer", fontFamily: "monospace", fontSize: "9px",
    });
    header.appendChild(clearAllBtn);
    panel.appendChild(header);

    const grid = document.createElement("div");
    grid.style.cssText = `display:grid; gap:4px;`;
    panel.appendChild(grid);

    document.body.appendChild(panel);

    const drag = makeDraggable(panel, { label: "OBJ SLOTS", storageKey: "objPreviewSlots" });
    drag.attach();

    // Per-slot state: { handle: thumbnail handle or null, label: string, dom: container }
    const slots = [];

    function _gridCols(n) {
        if (n <= 1) return 1;
        if (n <= 4) return 2;
        if (n <= 6) return 3;
        return 3;   // 9 → 3×3
    }

    function _rebuildGrid() {
        // Dispose existing thumbnail handles, keep their objText / label
        // refs so we can re-populate after resize.
        const preserved = slots.map(s => ({ objText: s.objText, label: s.label, opts: s.opts }));
        for (const s of slots) {
            if (s.handle?.dispose) { try { s.handle.dispose(); } catch {} }
        }
        slots.length = 0;
        grid.innerHTML = "";
        grid.style.gridTemplateColumns = `repeat(${_gridCols(slotCount)}, ${slotSize}px)`;

        for (let i = 0; i < slotCount; i++) {
            const slotDom = document.createElement("div");
            Object.assign(slotDom.style, {
                position: "relative", width: slotSize + "px", height: slotSize + "px",
                background: "#040608", border: "1px solid #233", borderRadius: "3px",
                display: "flex", alignItems: "center", justifyContent: "center",
                color: "#456", fontSize: "10px",
            });
            slotDom.textContent = `slot ${i + 1}`;
            // Per-slot × button (created upfront, hidden until populated)
            const x = document.createElement("button");
            x.textContent = "×";
            Object.assign(x.style, {
                position: "absolute", top: "2px", right: "2px",
                background: "rgba(0,0,0,0.6)", border: "1px solid #345",
                color: "#cfd", width: "16px", height: "16px",
                borderRadius: "3px", lineHeight: "14px", padding: "0",
                cursor: "pointer", fontFamily: "monospace", fontSize: "11px",
                display: "none",
            });
            x.title = "clear this slot";
            x.addEventListener("click", (e) => {
                e.stopPropagation();
                api.clearSlot(i);
            });
            slotDom.appendChild(x);
            const labelBadge = document.createElement("div");
            Object.assign(labelBadge.style, {
                position: "absolute", left: "3px", top: "3px",
                background: "rgba(0,0,0,0.55)", padding: "1px 4px",
                borderRadius: "2px", fontSize: "8px", color: "#9be",
                fontFamily: "monospace", pointerEvents: "none",
                maxWidth: (slotSize - 24) + "px", overflow: "hidden",
                textOverflow: "ellipsis", whiteSpace: "nowrap",
                display: "none",
            });
            slotDom.appendChild(labelBadge);
            grid.appendChild(slotDom);
            slots.push({ handle: null, objText: null, label: null, opts: null, dom: slotDom, x, labelBadge });
        }

        // Re-populate from preserved state
        for (let i = 0; i < preserved.length && i < slotCount; i++) {
            const p = preserved[i];
            if (p.objText) api.setSlot(i, p.objText, p.opts || {});
        }
        _refreshCountBadge();
    }

    function _refreshCountBadge() {
        const filled = slots.filter(s => s.handle).length;
        slotCountBadge.textContent = `${filled}/${slotCount}`;
    }

    sizeBtn.addEventListener("click", () => {
        // Cycle through 1 → 4 → 6 → 9 → 1
        const next = { 1: 4, 4: 6, 6: 9, 9: 1 }[slotCount] ?? 4;
        api.resize(next);
    });

    clearAllBtn.addEventListener("click", () => {
        api.clearAll();
    });

    // Default thumbnail loader if none injected — lazy-imports
    async function _defaultMakeThumbnail(objText, opts) {
        const mod = await import("./objThumbnail.js");
        return mod.createObjThumbnail(objText, opts);
    }

    const _mkThumb = makeThumbnail || _defaultMakeThumbnail;

    const api = {
        element: panel,

        getSlotCount() { return slotCount; },

        setSlot(i, objText, slotOpts = {}) {
            if (i < 0 || i >= slotCount) throw new Error(`setSlot: index ${i} out of range [0, ${slotCount})`);
            const slot = slots[i];
            // Dispose existing thumbnail if any. Also dispose any in-flight
            // pending handle (rare race when user setSlot races with the
            // async re-populate from a resize).
            if (slot.handle?.dispose) {
                try { slot.handle.dispose(); } catch {}
                slot.handle = null;
            }
            // Bump a generation counter so older in-flight setSlot calls
            // know they've been superseded and should dispose any handle
            // they receive instead of installing it.
            slot.gen = (slot.gen || 0) + 1;
            const myGen = slot.gen;

            slot.objText = objText;
            slot.label   = slotOpts.label || `slot ${i + 1}`;
            slot.opts    = slotOpts;
            slot.dom.textContent = "";
            slot.dom.appendChild(slot.x);          // x button persists across reloads
            slot.dom.appendChild(slot.labelBadge);
            slot.labelBadge.textContent = slot.label;
            slot.labelBadge.style.display = "block";
            slot.x.style.display = "block";

            // Install the produced handle into the slot. Used by both
            // sync and async paths. Disposes the handle silently if the
            // slot has been superseded by a newer setSlot.
            const _install = (handle) => {
                if (slots[i] !== slot || slot.gen !== myGen) {
                    try { handle?.dispose?.(); } catch {}
                    return;
                }
                slot.handle = handle;
                slot.dom.insertBefore(handle.element, slot.x);
                _refreshCountBadge();
            };
            const _onError = (e) => {
                if (slots[i] !== slot || slot.gen !== myGen) return;
                slot.dom.textContent = `err: ${e.message?.slice(0, 30) || "thumbnail failed"}`;
                console.warn(`[ObjSlots] setSlot(${i}) failed:`, e?.message ?? e);
            };

            const result = _mkThumb(objText, { width: slotSize, height: slotSize, ...slotOpts });
            if (result && typeof result.then === "function") {
                // Async factory (lazy-import path)
                return result.then(_install, _onError).then(() => i);
            }
            // Sync factory — install immediately
            try { _install(result); }
            catch (e) { _onError(e); }
            return Promise.resolve(i);
        },

        clearSlot(i) {
            if (i < 0 || i >= slotCount) return false;
            const slot = slots[i];
            if (slot.handle?.dispose) { try { slot.handle.dispose(); } catch {} }
            slot.handle = null;
            slot.objText = null;
            slot.label = null;
            slot.opts = null;
            slot.dom.innerHTML = "";
            slot.dom.appendChild(slot.x);
            slot.dom.appendChild(slot.labelBadge);
            slot.dom.appendChild(document.createTextNode(`slot ${i + 1}`));
            slot.x.style.display = "none";
            slot.labelBadge.style.display = "none";
            _refreshCountBadge();
            return true;
        },

        clearAll() {
            for (let i = 0; i < slots.length; i++) api.clearSlot(i);
        },

        resize(n) {
            n = Math.max(1, Math.min(16, n | 0));
            if (n === slotCount) return;
            slotCount = n;
            _writeState({ slotCount });
            _rebuildGrid();
        },

        show()   { panel.style.display = "block"; },
        hide()   { panel.style.display = "none"; },
        toggle() { panel.style.display = panel.style.display === "none" ? "block" : "none"; },

        dispose() {
            api.clearAll();
            drag.detach();
            try { panel.remove(); } catch {}
        },
    };

    _rebuildGrid();
    return api;
}
