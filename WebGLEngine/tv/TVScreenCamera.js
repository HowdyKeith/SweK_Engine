// FILE: tv/TVScreenCamera.js
// VERSION: v1 - DUCK-TYPED CAMERA FOR TV WALL CELLS
//
// No mouse / keyboard / pointer-lock listeners — this is a pure pose-and-
// matrix object that the TV wall positions programmatically. Aspect ratio
// is derived from the cell dimensions, not the canvas, so the projection
// matches the cell rather than getting stretched.

import { buildViewProj } from "../camera/buildViewProj.js";

export class TVScreenCamera {
    constructor(opts = {}) {
        this.position = {
            x: opts.position?.x ?? 0,
            y: opts.position?.y ?? 50,
            z: opts.position?.z ?? 0,
        };
        this.yaw   = opts.yaw   ?? 0;
        this.pitch = opts.pitch ?? -0.4;

        this.fov  = opts.fov  ?? 70 * Math.PI / 180;
        this.near = opts.near ?? 0.1;
        this.far  = opts.far  ?? 1000;

        // Aspect comes from the assigned viewport, not from any canvas.
        // TVWall._recomputeViewports updates this whenever the cell size
        // changes (layout change or canvas resize).
        this.aspect = 1;

        this._mvp = new Float32Array(16);
    }

    setViewport(w, h) {
        this.aspect = w / Math.max(1, h);
    }

    getMatrix()         { return this.getViewProjMatrix(); }
    getViewProjMatrix() {
        buildViewProj(
            this._mvp, this.position, this.yaw, this.pitch,
            this.fov, this.near, this.far, this.aspect,
        );
        return this._mvp;
    }
}
