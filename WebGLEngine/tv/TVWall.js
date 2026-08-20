// FILE: tv/TVWall.js
// VERSION: v1 - TILED MULTI-VIEWPORT WALL
//
// Owns the wall layout (cols × rows) and the list of registered screens.
// Cell (0,0) is reserved for the PRIMARY camera (the one with mouse/keyboard
// input). Registered screens fill cells 1..N in row-major order, left-to-
// right then top-to-bottom.
//
// All cells render to the same WebGL canvas via gl.viewport + gl.scissor
// — no DOM canvas juggling, no GL context proliferation, all chunk meshes
// and material textures shared across cells.
//
// "Active" means cols > 1 or rows > 1. When cols=rows=1, the wall is
// effectively disabled and the renderer falls back to its normal full-
// canvas path.

import { TVScreenCamera } from "./TVScreenCamera.js";

export class TVWall {
    constructor(opts) {
        this.canvas = opts.canvas;

        this.cols = 1;
        this.rows = 1;
        this.screens = [];   // [{ id, camera, viewport: [x,y,w,h] }]
        this._nextId = 1;    // 0 reserved for primary
    }

    isActive() {
        return this.cols > 1 || this.rows > 1;
    }

    cellCount() {
        return this.cols * this.rows;
    }

    setLayout(cols, rows) {
        this.cols = Math.max(1, cols | 0);
        this.rows = Math.max(1, rows | 0);
        this._recomputeViewports();
    }

    // Adds a screen at the next free cell. Returns the assigned id.
    // If the wall is full (cells - 1 already registered), wraps so that
    // additional registrations reuse the last cell — keeps demos working
    // even if the user calls TV_RegisterScreen too many times.
    registerScreen(opts = {}) {
        const id = this._nextId++;
        const camera = new TVScreenCamera(opts);
        this.screens.push({ id, camera, viewport: null });
        this._recomputeViewports();
        return id;
    }

    clearScreens() {
        this.screens = [];
        this._nextId = 1;
    }

    setScreenCamera(id, fields) {
        const s = this.screens.find(s => s.id === id);
        if (!s) return false;
        if (fields.position) Object.assign(s.camera.position, fields.position);
        if (fields.yaw   != null) s.camera.yaw   = fields.yaw;
        if (fields.pitch != null) s.camera.pitch = fields.pitch;
        return true;
    }

    // Viewport for the primary camera. null if wall is 1x1 (use full
    // canvas). Otherwise cell (0, 0) — top-left in screen-space, which is
    // bottom-left in GL viewport coordinates.
    primaryViewport() {
        if (!this.isActive()) return null;
        const cellW = Math.floor(this.canvas.width  / this.cols);
        const cellH = Math.floor(this.canvas.height / this.rows);
        // Top-left cell in screen-space = (this.rows - 1) * cellH in GL Y.
        return [0, (this.rows - 1) * cellH, cellW, cellH];
    }

    // Recompute viewport rectangles for all registered screens after a
    // layout change. Cells are filled in row-major (screen-space) order
    // STARTING FROM cell index 1 (cell 0 = primary).
    _recomputeViewports() {
        const cellW = Math.floor(this.canvas.width  / this.cols);
        const cellH = Math.floor(this.canvas.height / this.rows);
        const total = this.cellCount();

        for (let i = 0; i < this.screens.length; i++) {
            const cellIdx = (i + 1) % total;        // skip cell 0 (primary)
            if (cellIdx === 0 && total > 1) {
                // Wrapped past last cell — pin to last cell so the screen
                // still has somewhere to draw.
                this.screens[i].viewport = null;
                continue;
            }
            const col = cellIdx % this.cols;
            const row = Math.floor(cellIdx / this.cols);
            // GL viewport Y origin is bottom; row 0 = top of screen.
            const x = col * cellW;
            const y = (this.rows - 1 - row) * cellH;
            this.screens[i].viewport = [x, y, cellW, cellH];
            this.screens[i].camera.setViewport(cellW, cellH);
        }
    }

    // Call after canvas resize so cells track the new dimensions.
    onResize() {
        this._recomputeViewports();
    }
}
