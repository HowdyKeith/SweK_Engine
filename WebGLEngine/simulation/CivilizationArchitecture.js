// FILE: simulation/CivilizationArchitecture.js
// VERSION: v1
//
// Per-civ architectural style + step-by-step build progression. Each
// civ is assigned one style at birth (deterministic from civ.id) and
// produces one structureBuilder primitive per build step. After
// maxSteps, the civ stops building (structure complete) but keeps
// living, decaying, etc.
//
// All five styles use STONE (material 1). The visual differentiation
// comes from primitive composition, not material. If we ever want
// per-style materials (obsidian, marble, etc.), it's a one-line
// change per style.
//
// Reuses world/structureBuilder.expandStructures so civs and demos
// share the same architectural primitive vocabulary.

import { expandStructures } from "../world/structureBuilder.js";

const STONE = 1;

const STYLES = {
    // Single tall pillar. Each step adds two voxels of height,
    // producing a slim 16-tall column over 8 steps.
    tower: {
        maxSteps: 8,
        next(civ, step, terrainY) {
            const x = Math.floor(civ.center.x);
            const z = Math.floor(civ.center.z);
            return {
                kind: "column",
                x, z,
                y0: terrainY + step * 2,
                y1: terrainY + step * 2 + 1,
                material: STONE,
            };
        },
    },

    // Concentric rings stacked from the ground up. Radius scales with
    // civ.radius so ring_wall civs that grow territorially also grow
    // architecturally.
    ring_wall: {
        maxSteps: 5,
        next(civ, step, terrainY) {
            const radius = Math.max(2, Math.min(6, Math.floor(civ.radius * 0.4)));
            return {
                kind: "ring",
                cx: Math.floor(civ.center.x),
                cy: terrainY + step,
                cz: Math.floor(civ.center.z),
                radius,
                material: STONE,
            };
        },
    },

    // Foundation disk first, then four corner columns rising from it.
    // Reads as a plaza or temple footprint with pillars.
    plaza: {
        maxSteps: 5,
        next(civ, step, terrainY) {
            const cx = Math.floor(civ.center.x);
            const cz = Math.floor(civ.center.z);
            if (step === 0) {
                const radius = Math.max(2, Math.min(5, Math.floor(civ.radius * 0.3)));
                return {
                    kind: "disk",
                    cx, cy: terrainY, cz,
                    radius,
                    material: STONE,
                };
            }
            // Four corner pillars at the disk's edge
            const offsets = [[+3, +3], [-3, +3], [+3, -3], [-3, -3]];
            const [dx, dz] = offsets[(step - 1) % offsets.length];
            return {
                kind: "column",
                x: cx + dx, z: cz + dz,
                y0: terrainY,
                y1: terrainY + 4,
                material: STONE,
            };
        },
    },

    // Six small spires placed in a hexagonal ring around the center,
    // varying heights for an irregular skyline.
    spire_field: {
        maxSteps: 6,
        next(civ, step, terrainY) {
            const angle = (step * Math.PI * 2) / 6;
            const r = Math.max(3, Math.min(7, Math.floor(civ.radius * 0.5)));
            const x = Math.floor(civ.center.x + Math.cos(angle) * r);
            const z = Math.floor(civ.center.z + Math.sin(angle) * r);
            const height = 3 + (step % 3);   // 3, 4, 5, 3, 4, 5 → varied skyline
            return {
                kind: "column",
                x, z,
                y0: terrainY,
                y1: terrainY + height,
                material: STONE,
            };
        },
    },

    // Stacked shrinking disks — classic Mesoamerican stepped pyramid.
    step_pyramid: {
        maxSteps: 5,
        next(civ, step, terrainY) {
            const baseRadius = Math.max(3, Math.min(6, Math.floor(civ.radius * 0.4)));
            const radius = Math.max(1, baseRadius - step);
            return {
                kind: "disk",
                cx: Math.floor(civ.center.x),
                cy: terrainY + step,
                cz: Math.floor(civ.center.z),
                radius,
                material: STONE,
            };
        },
    },
};

const STYLE_NAMES = Object.keys(STYLES);

// Deterministic — civ.id alone selects the style, so a re-spawned
// civ at the same id (post-reload) builds the same way.
export function pickStyle(civId) {
    return STYLE_NAMES[civId % STYLE_NAMES.length];
}

// Returns voxel writes (already expanded via structureBuilder) for
// the civ's NEXT build step, or empty array when complete.
export function nextBuildVoxels(civ, terrainY) {
    const style = STYLES[civ.style];
    if (!style) return [];
    if (civ.buildStep >= style.maxSteps) return [];
    const primitive = style.next(civ, civ.buildStep, terrainY);
    if (!primitive) return [];
    return expandStructures([primitive]);
}

export function maxBuildSteps(styleName) {
    return STYLES[styleName]?.maxSteps ?? 0;
}

export function isStyleComplete(civ) {
    const max = maxBuildSteps(civ.style);
    return civ.buildStep >= max;
}
