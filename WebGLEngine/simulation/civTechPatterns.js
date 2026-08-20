// FILE: simulation/civTechPatterns.js
// VERSION: v1
//
// Round 27 — civilization tech progression. Civs accumulate research
// over time; crossing thresholds unlocks tiers:
//
//   Tier 1 (Walls)        — defensive ring around civ (110 voxels)
//   Tier 2 (Watchtowers)  — 4 corner towers with MEMORY beacons (90 voxels)
//   Tier 3 (Defenders)    — civ fires lightning bolts at nearby kaiju
//   Tier 4 (Counter-strike) — civ launches stone projectiles at kaiju
//
// Tiers 1 + 2 are voxel structures (gradual build via existing
// MegastructureProject machinery). Tiers 3 + 4 are behavioral
// (manager runs combat logic each tick).

const STONE  = 1;
const MEMORY = 30;

// Research thresholds — when civ.research crosses these, tech advances
export const TECH_THRESHOLDS = [0, 30, 80, 150, 250];
//                              ^   ^   ^    ^    ^
//                              0   1   2    3    4

export const TECH_NAMES = ["", "Walls", "Watchtowers", "Defenders", "Counter-Strike"];

// Build a ring of stone wall around civ center. Radius 7, height 3.
// Uses 8° steps, deduped; ~110 unique voxels at radius 7.
export function buildWalls(radius = 7, height = 3) {
    const seen = new Set();
    const voxels = [];
    for (let h = 0; h < height; h++) {
        for (let theta = 0; theta < 360; theta += 6) {
            const rad = (theta * Math.PI) / 180;
            const dx = Math.round(Math.cos(rad) * radius);
            const dz = Math.round(Math.sin(rad) * radius);
            const key = `${dx},${h},${dz}`;
            if (seen.has(key)) continue;
            seen.add(key);
            voxels.push({ dx, dy: h, dz, mat: STONE });
        }
    }
    return voxels;
}

// 4 watchtowers at compass points (distance 9 from center). Each is
// a 2x2 column 5 high with a MEMORY beacon on top. ~92 voxels total.
export function buildWatchtowers(distance = 9) {
    const voxels = [];
    const positions = [
        [ distance, 0],
        [-distance, 0],
        [ 0,  distance],
        [ 0, -distance],
    ];
    for (const [tx, tz] of positions) {
        // 2x2 column, 5 tall
        for (let dx = 0; dx < 2; dx++) {
            for (let dz = 0; dz < 2; dz++) {
                for (let y = 0; y < 5; y++) {
                    voxels.push({ dx: tx + dx, dy: y, dz: tz + dz, mat: STONE });
                }
            }
        }
        // MEMORY beacon on top (centered on the column)
        voxels.push({ dx: tx,     dy: 5, dz: tz,     mat: MEMORY });
        voxels.push({ dx: tx + 1, dy: 5, dz: tz,     mat: MEMORY });
    }
    return voxels;
}

// Compute total voxel count for either pattern (used by UI for progress)
export const WALL_VOXELS_DEFAULT = buildWalls();
export const WATCHTOWER_VOXELS_DEFAULT = buildWatchtowers();
