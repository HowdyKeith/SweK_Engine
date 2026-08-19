// FILE: simulation/megastructurePatterns.js
// VERSION: v1
//
// Voxel patterns for civilization megastructures. One pattern per
// civ style. Each is an array of {dx, dy, dz, mat} entries relative
// to the megastructure's base position.
//
// Material legend:
//   1  = STONE (grey)  — bulk
//   2  = DIRT  (brown) — terraces / accents
//   3  = GRASS (green) — base ring (visible greenery at foundation)
//   30 = MEMORY (cyan) — keystone / apex / shrine cores
//
// Memory blocks bloom strongly through the new BloomPass — placing
// them at apexes / keystones makes the megastructure visually
// signal completion.

const STONE  = 1;
const DIRT   = 2;
const GRASS  = 3;
const MEMORY = 30;

// PYRAMID (step_pyramid civ): 11x11 stepped base, 6 layers
// narrowing by 2 per level. ~287 voxels. Apex glowing keystone.
function buildPyramid() {
    const v = [];
    for (let layer = 0; layer < 6; layer++) {
        const halfSize = 5 - layer;
        for (let dx = -halfSize; dx <= halfSize; dx++) {
            for (let dz = -halfSize; dz <= halfSize; dz++) {
                // Outline of each layer is dirt; interior is stone
                const isEdge = (dx === -halfSize || dx === halfSize ||
                                dz === -halfSize || dz === halfSize);
                v.push({ dx, dy: layer, dz, mat: isEdge ? DIRT : STONE });
            }
        }
    }
    v.push({ dx: 0, dy: 6, dz: 0, mat: MEMORY });    // apex keystone
    return v;
}

// SKY_SPIRE (tower civ): central column + 4 corner buttresses.
// Memory-cap at top. ~100 voxels.
function buildSkySpire() {
    const v = [];
    // Central column 1x1 from y=0 to y=24
    for (let y = 0; y < 25; y++) {
        v.push({ dx: 0, dy: y, dz: 0, mat: STONE });
    }
    // 4 corner buttresses (offset ±2,±2) from y=0 to y=15
    for (const [bx, bz] of [[-2,-2],[2,-2],[-2,2],[2,2]]) {
        for (let y = 0; y < 15; y++) {
            v.push({ dx: bx, dy: y, dz: bz, mat: STONE });
        }
    }
    // Memory cap on top of central column
    v.push({ dx: 0, dy: 25, dz: 0, mat: MEMORY });
    return v;
}

// ZIGGURAT (ring_wall civ): 9x9 base, 3 stepped layers, dirt
// terraces, memory at top. ~156 voxels.
function buildZiggurat() {
    const v = [];
    for (let layer = 0; layer < 3; layer++) {
        const halfSize = 4 - layer;
        for (let dx = -halfSize; dx <= halfSize; dx++) {
            for (let dz = -halfSize; dz <= halfSize; dz++) {
                const isEdge = (dx === -halfSize || dx === halfSize ||
                                dz === -halfSize || dz === halfSize);
                v.push({ dx, dy: layer * 2, dz, mat: isEdge ? DIRT : STONE });
            }
        }
        // Each terrace gets a thin lip on top (visual separation)
        for (let dx = -halfSize; dx <= halfSize; dx++) {
            for (let dz = -halfSize; dz <= halfSize; dz++) {
                const isEdge = (dx === -halfSize || dx === halfSize ||
                                dz === -halfSize || dz === halfSize);
                if (isEdge) v.push({ dx, dy: layer * 2 + 1, dz, mat: STONE });
            }
        }
    }
    // 4 memory beacons at top corners + 1 center
    v.push({ dx: -1, dy: 6, dz: -1, mat: MEMORY });
    v.push({ dx:  1, dy: 6, dz: -1, mat: MEMORY });
    v.push({ dx: -1, dy: 6, dz:  1, mat: MEMORY });
    v.push({ dx:  1, dy: 6, dz:  1, mat: MEMORY });
    v.push({ dx:  0, dy: 7, dz:  0, mat: MEMORY });
    return v;
}

// MONOLITH_CIRCLE (plaza civ): 8 stone monoliths arranged in a
// ring around a central memory shrine. ~100 voxels.
function buildMonolithCircle() {
    const v = [];
    const monoliths = 8;
    const radius = 5;
    const height = 9;
    for (let i = 0; i < monoliths; i++) {
        const angle = (i / monoliths) * Math.PI * 2;
        const mx = Math.round(Math.cos(angle) * radius);
        const mz = Math.round(Math.sin(angle) * radius);
        for (let y = 0; y < height; y++) {
            v.push({ dx: mx, dy: y, dz: mz, mat: STONE });
        }
        // Cap each monolith with a single memory block
        v.push({ dx: mx, dy: height, dz: mz, mat: MEMORY });
    }
    // Central shrine — small memory column
    for (let y = 0; y < 4; y++) {
        v.push({ dx: 0, dy: y, dz: 0, mat: MEMORY });
    }
    // Grass floor ring under the monoliths
    for (let dx = -radius - 1; dx <= radius + 1; dx++) {
        for (let dz = -radius - 1; dz <= radius + 1; dz++) {
            const r2 = dx * dx + dz * dz;
            if (r2 >= (radius - 1) * (radius - 1) && r2 <= (radius + 2) * (radius + 2)) {
                v.push({ dx, dy: 0, dz, mat: GRASS });
            }
        }
    }
    return v;
}

// ARCH (spire_field civ): two pillars connected by a vaulted span.
// Memory keystone at apex. ~80 voxels.
function buildArch() {
    const v = [];
    const pillarH = 12;
    const span = 8;     // distance between pillar bases
    // Two pillars (2x2 each) at x = -4 and x = +4
    for (const px of [-4, 4]) {
        for (let y = 0; y < pillarH; y++) {
            for (let dx = 0; dx < 2; dx++) {
                for (let dz = 0; dz < 2; dz++) {
                    v.push({ dx: px + dx, dy: y, dz: dz, mat: STONE });
                }
            }
        }
    }
    // Arched span — quarter-circle on each side meeting at center
    // Sample arch with 9 voxels along a parametric curve
    for (let i = 0; i <= 8; i++) {
        const t = i / 8;          // 0..1
        const x = Math.round(-4 + t * span);
        const archY = Math.round(pillarH + 2 * Math.sin(t * Math.PI));
        v.push({ dx: x,     dy: archY, dz: 0, mat: STONE });
        v.push({ dx: x + 1, dy: archY, dz: 0, mat: STONE });
        v.push({ dx: x,     dy: archY, dz: 1, mat: STONE });
        v.push({ dx: x + 1, dy: archY, dz: 1, mat: STONE });
    }
    // Keystone — memory block at center top of arch
    v.push({ dx: 0, dy: pillarH + 3, dz: 0, mat: MEMORY });
    v.push({ dx: 1, dy: pillarH + 3, dz: 0, mat: MEMORY });
    return v;
}

// Civ style → megastructure type + voxel pattern + display name
export const MEGASTRUCTURE_BY_STYLE = {
    "step_pyramid": { type: "pyramid",         name: "Pyramid of the Ages",  voxels: buildPyramid()        },
    "tower":        { type: "sky_spire",       name: "Sky Spire",            voxels: buildSkySpire()       },
    "ring_wall":    { type: "ziggurat",        name: "Ziggurat",             voxels: buildZiggurat()       },
    "plaza":        { type: "monolith_circle", name: "Circle of Stones",     voxels: buildMonolithCircle() },
    "spire_field":  { type: "arch",            name: "Great Arch",           voxels: buildArch()           },
};

export function getMegastructureForStyle(style) {
    return MEGASTRUCTURE_BY_STYLE[style] ?? null;
}

// Round 26 — mod registration. Mods provide a JSON pattern using
// the same {dx,dy,dz,mat} entries as the built-ins. Either creates
// a new style entry or overrides an existing one.
export function registerMegastructure(style, spec) {
    if (!style || typeof style !== "string") {
        console.warn("[megastructure] register: invalid style");
        return false;
    }
    if (!spec || !Array.isArray(spec.voxels)) {
        console.warn("[megastructure] register: invalid spec (need voxels array)");
        return false;
    }
    MEGASTRUCTURE_BY_STYLE[style] = {
        type:  spec.type ?? style,
        name:  spec.name ?? style,
        voxels: spec.voxels,
    };
    console.log(`[megastructure] registered for style "${style}" (${spec.voxels.length} voxels)`);
    return true;
}
