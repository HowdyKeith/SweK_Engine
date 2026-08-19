// FILE: simulation/MegastructureProject.js
// VERSION: v1
//
// Long-running construction project for a civilization. Pulls from
// a precomputed voxel pattern (megastructurePatterns.js), places one
// voxel per build tick. Build rate scales with civ energy so a
// healthy civ raises a megastructure in 60-100s while a struggling
// civ takes 3+ minutes (or never finishes).
//
// Lifecycle:
//   * constructed when civ qualifies (age + energy + style match)
//   * tick() called each civ tick, advances placement
//   * complete when placedCount == voxels.length, emits event once
//   * megastructure voxels persist after civ death — they become
//     ruins, contributing to world history

const BUILD_INTERVAL_BASE = 0.5;   // seconds between voxels at energy=0.5
const PLACE_PER_TICK_MAX = 3;      // hard cap so weird energy values don't burst

export class MegastructureProject {
    constructor({ civ, type, name, voxels, baseY }) {
        this.civ = civ;
        this.type = type;
        this.name = name;
        this.voxels = voxels;          // array of {dx, dy, dz, mat}
        this.placedCount = 0;
        this.completed = false;
        this._completedFired = false;
        this._buildAccum = 0;

        // Anchor — civ.center is the planning anchor; baseY is the
        // ground height we stack on (terrain top at center xz)
        this.anchor = { x: civ.center.x, y: baseY, z: civ.center.z };
    }

    progress() {
        return this.placedCount / Math.max(1, this.voxels.length);
    }

    tick(delta, router) {
        if (this.completed || !router) return;

        // Build interval scales inversely with energy (high energy = faster).
        // Round 34 — personality scales overall: religious 1.6× build
        // speed, expansionist 0.7× (doesn't prioritize monuments).
        const energy = this.civ.energy ?? 0.5;
        const energyScale = Math.max(0.3, energy);   // floor so dying civs still creep
        const personalityMul = this.civ.personalityMods?.megaSpeedMul ?? 1;
        const interval = BUILD_INTERVAL_BASE / (energyScale * personalityMul);

        this._buildAccum += delta;
        let placedThisTick = 0;
        while (this._buildAccum >= interval && placedThisTick < PLACE_PER_TICK_MAX) {
            this._buildAccum -= interval;
            if (this.placedCount >= this.voxels.length) break;

            const v = this.voxels[this.placedCount];
            router.exec({
                type: "voxel:set",
                x: this.anchor.x + v.dx,
                y: this.anchor.y + v.dy,
                z: this.anchor.z + v.dz,
                v:  v.mat,
            });
            this.placedCount++;
            placedThisTick++;
        }

        if (!this.completed && this.placedCount >= this.voxels.length) {
            this.completed = true;
        }
    }
}
