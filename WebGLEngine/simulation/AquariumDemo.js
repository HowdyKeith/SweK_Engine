// FILE: simulation/AquariumDemo.js
// v1378 — AQUARIUM / sea demo. Assembles existing pieces:
//   * window.aquariumTank  — glass walls + caustics (render/aquariumTank.js)
//   * MarchingCubes        — the voxel sea floor, SMOOTHED via marching cubes
//   * window.waterField    — raised to submerge the tank
//   * window.assetRoles    — seaCreature-role models that swim (marauder -> crab)
//
// The floor is built TILE BY TILE over time (a "build speed" knob) so you can watch
// the marching-cubes surface form rather than it popping in instantly. Each tile is a
// thin density slab sampled from the terrain heightmap -> marchScalarField -> a smooth
// mesh entity (positions are already world-space, so it spawns at the origin, scale 1).

import { marchScalarField, meshToOBJ } from "./MarchingCubes.js";
import { AquaticLife } from "./AquaticLife.js";   // v1379 — shared underwater life layer

const HALF        = 48;     // tank XZ half-extent (world units)
const TILE        = 16;     // tile size (world units) — floor builds one tile at a time
const CELL        = 2;      // marching-cubes cell size (world units per sample)
const TANK_HEIGHT = 30;     // water column height above the floor
const N_CREATURES = 10;
const CRAWLER_RE  = /marauder|crab|lobster|shrimp|scorpion/i;   // bottom-dwellers

export class AquariumDemo {
    constructor({ router, world, camera, assetLoader } = {}) {
        this.router = router || null;
        this.world  = world  || null;
        this.camera = camera || null;
        this.assetLoader = assetLoader || null;
        this.active = false;
        this._floorIds = [];
        this._life = new AquaticLife({ router, world, assetLoader });   // v1379
        this._tiles = [];          // queued tile origins to march
        this._tileCursor = 0;
        this._lastTileT = 0;
        this._buildMsPerTile = 120;   // build speed — window.aquarium.buildSpeed(ms)
        this._uniq = 0;
        this._prevWaterLevel = null;
        this._baseFloorY = 8;
        this._tankTopY = 38;
    }

    _surfaceY(x, z) {
        let y = this._baseFloorY;
        try { if (this.world?._heightAt) y = this.world._heightAt(x, z); } catch {}
        return (typeof y === "number" && isFinite(y)) ? y : this._baseFloorY;
    }

    start() {
        if (this.active) return;
        this.active = true;

        // Tank geometry sampled around the centre column.
        this._baseFloorY = Math.round(this._surfaceY(0, 0));
        const bottom = this._baseFloorY - 2;
        this._tankTopY = bottom + TANK_HEIGHT;
        const cy = (this._tankTopY + bottom) / 2;
        const hh = (this._tankTopY - bottom) / 2;
        try { window.aquariumTank?.setActive?.(true, { half: HALF, cy, hh }); } catch {}

        // Submerge: raise the water surface to just below the tank top.
        try {
            if (window.waterField) {
                this._prevWaterLevel = (typeof window.waterField.getBaseLevel === "function") ? window.waterField.getBaseLevel() : 9;
                window.waterField.setBaseLevel(this._tankTopY - 1);
            }
        } catch {}

        // Queue floor tiles (built progressively in tick()).
        this._tiles = [];
        for (let tx = -HALF; tx < HALF; tx += TILE) {
            for (let tz = -HALF; tz < HALF; tz += TILE) this._tiles.push([tx, tz]);
        }
        this._tileCursor = 0;
        this._lastTileT = 0;

        try { window.swim?.setOpenWater({ surfaceY: this._tankTopY, cx: 0, cz: 0, half: HALF }); } catch {}   // v1380 — enable swimming in the tank
        this._life.populate({
            cx: 0, cz: 0, half: HALF, topY: this._tankTopY,
            floorFn: (x, z) => this._surfaceY(x, z),
            counts: { kelp: 12, coral: 10, swimmers: 6, jelly: 5, shrimp: 16, monkey: 10, shark: 1 },
            libCount: N_CREATURES,
        });
    }

    // Build ONE floor tile: sample a thin density slab from the heightmap, march it.
    _buildTile(tx, tz) {
        const nx = (TILE / CELL) + 1, nz = (TILE / CELL) + 1;
        // Y range from the tile's surface min/max.
        let minS = Infinity, maxS = -Infinity;
        for (let ix = 0; ix < nx; ix++) for (let iz = 0; iz < nz; iz++) {
            const s = this._surfaceY(tx + ix * CELL, tz + iz * CELL);
            if (s < minS) minS = s; if (s > maxS) maxS = s;
        }
        if (!isFinite(minS)) return;
        const y0 = Math.floor(minS) - 3, y1 = Math.ceil(maxS) + 1;
        const ny = Math.max(2, Math.round((y1 - y0) / CELL) + 1);

        // field[z,y,x] = surfaceY(col) - worldY  (>0 below surface = inside; iso 0 = surface)
        const field = new Float32Array(nx * ny * nz);
        const idx = (x, y, z) => z * nx * ny + y * nx + x;
        for (let iz = 0; iz < nz; iz++) for (let ix = 0; ix < nx; ix++) {
            const surf = this._surfaceY(tx + ix * CELL, tz + iz * CELL);
            for (let iy = 0; iy < ny; iy++) field[idx(ix, iy, iz)] = surf - (y0 + iy * CELL);
        }

        const mesh = marchScalarField(field, nx, ny, nz, 0, { origin: [tx, y0, tz], cellSize: CELL });
        if (!mesh || mesh.triangleCount === 0) return;

        const name = `aq_floor_${++this._uniq}`;
        try {
            const glMesh = this.assetLoader._loadOBJFromText(name, meshToOBJ(mesh.positions, mesh.normals));
            this.assetLoader.cache?.set(name, glMesh);
            this.assetLoader._knownAssets?.add(name);
            const r = this.router.exec({ type: "entity:spawnMesh", assetId: name, kind: "aquarium_floor", x: 0, y: 0, z: 0, scale: 1 });
            if (r && r.id != null) this._floorIds.push(r.id);
        } catch (e) {}
    }

    tick(dt) {
        if (!this.active) return;
        if (!(dt > 0)) dt = 0.016;
        const now = (typeof performance !== "undefined" ? performance.now() : Date.now());

        // Progressive floor: one tile per buildMsPerTile (watch it form).
        if (this._tileCursor < this._tiles.length && (now - this._lastTileT) >= this._buildMsPerTile) {
            const [tx, tz] = this._tiles[this._tileCursor++];
            this._buildTile(tx, tz);
            this._lastTileT = now;
        }

        this._life.tick(dt);
    }

    setBuildSpeed(msPerTile) { const v = Number(msPerTile); if (isFinite(v) && v >= 0) this._buildMsPerTile = v; return this._buildMsPerTile; }

    stop() {
        this.active = false;
        try { window.swim?.setOpenWater(null); } catch {}
        try { window.aquariumTank?.setActive?.(false); } catch {}
        try { if (window.waterField && this._prevWaterLevel != null) window.waterField.setBaseLevel(this._prevWaterLevel); } catch {}
        for (const id of this._floorIds) { try { this.router.exec({ type: "entity:despawn", id }); } catch {} }
        try { this._life.clear(); } catch {}
        this._floorIds = []; this._tiles = []; this._tileCursor = 0;
    }
}
