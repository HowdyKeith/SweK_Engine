// FILE: simulation/CivilizationLoop.js
// VERSION: v2 - GPU SCANNER PREFERENCE + CPU FALLBACK
//
// Owns the scanner + manager + optimizer triplet and runs each at the
// appropriate cadence. Called once per frame from main.js with the player
// camera (used to anchor CPU scan bounds) and dt.
//
// Scanner selection (new in v2):
//   * If gpuMemory is provided AND gpuMemory.supported → GPU scanner
//   * Otherwise CPU scanner
// The selection is checked each scan tick (not just at construction) so
// graceful-degradation paths through GPU init still resolve correctly.
// Both scanners produce the same output shape so the manager.ingest path
// is identical.
//
// Throttles unchanged from v1:
//   * Scanner sweep      -- every ~2000ms
//   * Manager tick       -- every ~250ms
//   * UniverseOptimizer  -- every ~1000ms

import { CivilizationScanner }    from "../analysis/CivilizationScanner.js";
import { CivilizationGPUScanner } from "../analysis/CivilizationGPUScanner.js";
import { CivilizationEntity }     from "./CivilizationEntity.js";

export class CivilizationLoop {
    constructor(opts) {
        this.world      = opts.world;
        this.memory     = opts.memory;
        this.gpuMemory  = opts.gpuMemory || null;
        this.manager    = opts.manager;
        this.optimizer  = opts.optimizer || null;

        this.scanRadius        = opts.scanRadius        ?? 30;
        this.scanInterval      = opts.scanInterval      ?? 2000;
        this.tickInterval      = opts.tickInterval      ?? 250;
        this.optimizerInterval = opts.optimizerInterval ?? 1000;

        // CPU scanner is always constructed (used as fallback). GPU
        // scanner is constructed only if a GPU memory is provided.
        this.cpuScanner = new CivilizationScanner(this.memory);
        this.gpuScanner = this.gpuMemory
            ? new CivilizationGPUScanner(this.gpuMemory, this.memory)
            : null;

        this._lastScan      = 0;
        this._lastTick      = 0;
        this._lastOptimize  = 0;

        // Counters for HUD.
        this.scanCount      = 0;
        this.tickCount      = 0;
        this.optimizeCount  = 0;
        this.lastClusterCount = 0;
        this.lastScannerUsed = "none";
    }

    update(camera, dt) {
        const now = performance.now();

        if (now - this._lastScan > this.scanInterval) {
            this._scan(camera);
            this._lastScan = now;
        }

        if (now - this._lastTick > this.tickInterval) {
            this.manager.tick(dt, this.world);
            this.memory.tick(this.tickInterval / 1000);
            this.tickCount++;
            this._lastTick = now;
        }

        if (this.optimizer && now - this._lastOptimize > this.optimizerInterval) {
            this.optimizer.tick();
            this.optimizeCount++;
            this._lastOptimize = now;
        }
    }

    _scan(camera) {
        let clusters = null;

        // Prefer GPU when available + supported. Returns null when GPU
        // wasn't actually supported at runtime — safe to fall through.
        if (this.gpuScanner && this.gpuMemory.supported) {
            clusters = this.gpuScanner.scan();
            if (clusters !== null) {
                this.lastScannerUsed = "gpu";
            }
        }

        if (clusters === null) {
            const r = this.scanRadius;
            const cx = Math.floor(camera.position.x);
            const cz = Math.floor(camera.position.z);
            const bounds = {
                minX: cx - r, maxX: cx + r,
                minY: 20,     maxY: 65,
                minZ: cz - r, maxZ: cz + r,
            };
            clusters = this.cpuScanner.tick(bounds, /* step */ 5);
            this.lastScannerUsed = "cpu";
        }

        this.lastClusterCount = clusters.length;
        if (clusters.length > 0) {
            this.manager.ingest(clusters, CivilizationEntity);
        }
        this.scanCount++;
    }
}
