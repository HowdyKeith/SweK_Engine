// FILE: simulation/OpenSeaDemo.js
// v1380 — OPEN SEA. Proves the shared AquaticLife layer reuses outside the tank:
// regenerate the terrain as a sea bed, raise the water surface to submerge a large
// open region, and populate it with the same aquatic life (no glass, no MC floor —
// just the natural voxel terrain under deep water). Same populate/tick/clear layer
// the aquarium uses; only the region size + counts differ.

import { AquaticLife } from "./AquaticLife.js";

export class OpenSeaDemo {
    constructor({ router, world, camera, assetLoader } = {}) {
        this.router = router || null;
        this.world  = world  || null;
        this.camera = camera || null;
        this.assetLoader = assetLoader || null;
        this.active = false;
        this._life = new AquaticLife({ router, world, assetLoader });
        this._prevWater = null;
        this._half = 120;
    }

    _floorY(x, z) {
        let y = 6;
        try { if (this.world?._heightAt) { const h = this.world._heightAt(x, z); if (isFinite(h)) y = h; } } catch {}
        return y;
    }

    start() {
        if (this.active) return;
        this.active = true;
        const baseFloor = Math.round(this._floorY(0, 0));
        const top = baseFloor + 36;
        this._top = top;
        try {
            if (window.waterField) {
                this._prevWater = (typeof window.waterField.getBaseLevel === "function") ? window.waterField.getBaseLevel() : 9;
                window.waterField.setBaseLevel(top);
            }
        } catch {}
        try { window.swim?.setOpenWater({ surfaceY: top, cx: 0, cz: 0, half: this._half }); } catch {}   // v1380 — enable swimming
        this._life.populate({
            cx: 0, cz: 0, half: this._half, topY: top,
            floorFn: (x, z) => this._floorY(x, z),
            counts: { kelp: 40, coral: 30, swimmers: 18, jelly: 16, shrimp: 40, monkey: 30, shark: 3 },
            libCount: 16,
        });
    }

    tick(dt) { if (this.active) this._life.tick(dt); }

    stop() {
        this.active = false;
        try { window.swim?.setOpenWater(null); } catch {}
        try { if (window.waterField && this._prevWater != null) window.waterField.setBaseLevel(this._prevWater); } catch {}
        try { this._life.clear(); } catch {}
    }
}
