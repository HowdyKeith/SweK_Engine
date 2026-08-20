// world/waterfallSystem.js — v516 — VISUAL waterfall emitter.
//
// Pure, read-only: it scans for water voxels that spill over an edge near a
// point — a "lip", i.e. a water voxel (WATER or FLOWING_WATER) with AIR
// directly below — traces each lip down to its landing voxel, and emits a
// falling-water sheet down the column plus a mist/foam puff and a WaterField
// ripple at the base. It writes NO voxels and holds no state, so it composes
// freely with the flood/river sim (which does the actual water motion). When
// the particle / water-field globals are absent (e.g. node tests) it still
// detects falls and returns the count, just without visuals.
import { VOXEL } from "./voxelFormat.js";

const WATER = VOXEL.WATER, FLOW = VOXEL.FLOWING_WATER;
const isWater = (v) => v === WATER || v === FLOW;

export class WaterfallSystem {
    constructor(world) {
        this.world = world;
        // radius/step bound the per-scan cost; scanTop is the Y ceiling we look
        // down from; minDrop rejects 1-voxel steps so only real falls render.
        this.params = { radius: 32, step: 3, scanTop: 48, minDrop: 2, maxEdges: 30, sheet: 3, mist: 4 };
    }
    setParams(p) { Object.assign(this.params, p || {}); return this.params; }

    /** Scan near (centerX,centerZ) for waterfall lips and emit their visuals.
     *  Returns { falls, particles } — `falls` is GPU-independent (testable). */
    scan(centerX, centerZ, opts = {}) {
        const P = { ...this.params, ...opts };
        const world = this.world;
        if (!world) return { falls: 0, particles: 0 };
        const gp = (typeof window !== "undefined") ? window.gpuParticles : null;
        const wf = (typeof window !== "undefined") ? window.waterField  : null;
        const cx = centerX | 0, cz = centerZ | 0, R = P.radius | 0, step = Math.max(1, P.step | 0);
        let falls = 0, particles = 0;
        for (let dz = -R; dz <= R && falls < P.maxEdges; dz += step) {
            for (let dx = -R; dx <= R && falls < P.maxEdges; dx += step) {
                if (dx * dx + dz * dz > R * R) continue;
                const wx = cx + dx, wz = cz + dz;
                if (!world.getChunk(wx, wz)) continue;          // stay in the loaded world
                // Walk down the column for the highest water voxel with air below.
                for (let y = P.scanTop; y >= 2; y--) {
                    if (!isWater(world.voxelAt(wx, y, wz))) continue;
                    if (world.voxelAt(wx, y - 1, wz) !== VOXEL.AIR) continue;   // not a lip
                    // Trace the drop to the landing voxel (first non-air below).
                    let baseY = y - 1;
                    while (baseY >= 1 && world.voxelAt(wx, baseY, wz) === VOXEL.AIR) baseY--;
                    const drop = y - baseY;
                    if (drop < P.minDrop) break;                // too short — done with this column
                    falls++;
                    if (gp) {
                        // Falling sheet — particles seeded at random heights along
                        // the column so the whole drop stays populated each tick.
                        for (let i = 0; i < P.sheet; i++) {
                            if (gp.spawn({
                                x: wx + 0.5 + (Math.random() - 0.5) * 0.6,
                                y: y - Math.random() * drop,
                                z: wz + 0.5 + (Math.random() - 0.5) * 0.6,
                                vx: (Math.random() - 0.5) * 0.4, vy: -2.5 - Math.random() * 1.5, vz: (Math.random() - 0.5) * 0.4,
                                life: 0.6 + Math.random() * 0.35, size: 0.5,
                                r: 0.75, g: 0.88, b: 1.0, shape: 0,    // soft blue-white water
                            })) particles++;
                        }
                        // Mist / foam puff at the base — low, drifting up, near-white.
                        for (let i = 0; i < P.mist; i++) {
                            if (gp.spawn({
                                x: wx + 0.5 + (Math.random() - 0.5) * 1.4,
                                y: baseY + 1 + Math.random() * 0.6,
                                z: wz + 0.5 + (Math.random() - 0.5) * 1.4,
                                vx: (Math.random() - 0.5) * 0.8, vy: 0.5 + Math.random() * 0.7, vz: (Math.random() - 0.5) * 0.8,
                                life: 0.7 + Math.random() * 0.5, size: 0.7,
                                r: 0.92, g: 0.96, b: 1.0, shape: 4,    // smoke = soft mist
                            })) particles++;
                        }
                    }
                    // Ripple at the base when it lands in / near the water plane.
                    if (wf && baseY <= 9) { try { wf.splash(wx + 0.5, wz + 0.5, Math.min(1.6, drop * 0.2), 2.2); } catch {} }
                    break;                                      // one fall per column
                }
            }
        }
        return { falls, particles };
    }
}
