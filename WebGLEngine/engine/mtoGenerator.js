// FILE: engine/mtoGenerator.js
// VERSION: v1 — round 351
//
// Tissue class palette + synthetic anatomical generators. The palette
// maps class IDs to display colors and rough Hounsfield intensities
// (so generators can fill the `intensity` field plausibly).
//
// Class IDs follow common medical-imaging convention:
//   0 = unsegmented / air (transparent — not rendered)
//   1 = cortical bone
//   2 = trabecular bone (marrow)
//   3 = soft tissue
//   4 = muscle
//   5 = fat
//   6 = organ (generic visceral)
//   7 = vessel (artery/vein)

export const TISSUE_PALETTE = {
    0: { name: "air",        color: [0.00, 0.00, 0.00], alpha: 0.0, hu: -1000 },
    1: { name: "cortical",   color: [0.94, 0.91, 0.82], alpha: 1.0, hu:  1200 },
    2: { name: "trabecular", color: [0.66, 0.60, 0.52], alpha: 1.0, hu:   400 },
    3: { name: "soft",       color: [0.91, 0.69, 0.63], alpha: 1.0, hu:    40 },
    4: { name: "muscle",     color: [0.55, 0.23, 0.23], alpha: 1.0, hu:    50 },
    5: { name: "fat",        color: [1.00, 0.88, 0.63], alpha: 1.0, hu:  -100 },
    6: { name: "organ",      color: [0.55, 0.04, 0.04], alpha: 1.0, hu:    60 },
    7: { name: "vessel",     color: [0.86, 0.08, 0.24], alpha: 1.0, hu:   100 },
};

export const TISSUE_BY_NAME = Object.fromEntries(
    Object.entries(TISSUE_PALETTE).map(([id, t]) => [t.name, +id])
);

/** Look up a tissue color by class ID, fallback to grey. */
export function tissueColor(classId) {
    return (TISSUE_PALETTE[classId] || TISSUE_PALETTE[0]).color;
}

/**
 * Concentric shells — outer cortical bone → trabecular → soft tissue
 * core. Each shell is the SURFACE of a sphere (so it's a thin layer of
 * voxels with outward gradient normals). Mimics what a 3D U-Net would
 * emit for a long-bone cross-section.
 */
export function generateAnatomicalShell({
    outerRadius = 12,
    shellThickness = 1.2,
} = {}) {
    const shells = [
        { rOuter: outerRadius,       rInner: outerRadius - shellThickness,     classId: 1, intensityBase: 240 },   // cortical
        { rOuter: outerRadius - 3,   rInner: outerRadius - 3 - shellThickness, classId: 2, intensityBase: 160 },   // trabecular
        { rOuter: outerRadius - 6,   rInner: 0,                                classId: 3, intensityBase: 90  },   // soft tissue core
    ];
    const coords = [], normals = [], intensity = [], classes = [];
    const R = Math.ceil(outerRadius) + 1;
    for (let x = -R; x <= R; x++) {
        for (let y = -R; y <= R; y++) {
            for (let z = -R; z <= R; z++) {
                const d = Math.hypot(x, y, z);
                for (const sh of shells) {
                    if (d <= sh.rOuter && d > sh.rInner) {
                        coords.push(x, y, z);
                        // Gradient normal points radially outward from sphere center
                        const inv = d === 0 ? 0 : 1 / d;
                        normals.push(x * inv, y * inv, z * inv);
                        intensity.push(sh.intensityBase + ((x*13 + y*7 + z*5) & 15));
                        classes.push(sh.classId);
                        break;   // each voxel belongs to one shell
                    }
                }
            }
        }
    }
    const count = classes.length;
    return {
        count,
        coords:    new Int16Array(coords),
        normals:   new Float32Array(normals),
        intensity: new Uint8Array(intensity),
        classes:   new Uint8Array(classes),
    };
}

/**
 * Long-bone cross-section — a vertical cylinder with cortical sheath
 * + trabecular marrow + central canal. Approximates a femur slice.
 */
export function generateLimbSection({ length = 24, outerR = 8, marrowR = 5, canalR = 1.5 } = {}) {
    const coords = [], normals = [], intensity = [], classes = [];
    const hL = length / 2 | 0;
    for (let x = -outerR; x <= outerR; x++) {
        for (let y = -hL; y <= hL; y++) {
            for (let z = -outerR; z <= outerR; z++) {
                const r = Math.hypot(x, z);
                let cls = 0, inten = 0;
                if (r <= canalR)                         { cls = 0; }
                else if (r <= marrowR)                   { cls = 2; inten = 150; }
                else if (r <= outerR && r > outerR - 1.5){ cls = 1; inten = 240; }
                else if (r <= outerR - 1.5 && r > marrowR){ cls = 2; inten = 170; }
                else                                      { cls = 0; }
                if (cls === 0) continue;
                coords.push(x, y, z);
                // Gradient normal — radial in xz plane
                const inv = r === 0 ? 0 : 1 / r;
                normals.push(x * inv, 0, z * inv);
                intensity.push(inten + ((x*3 + y + z*5) & 7));
                classes.push(cls);
            }
        }
    }
    const count = classes.length;
    return {
        count,
        coords:    new Int16Array(coords),
        normals:   new Float32Array(normals),
        intensity: new Uint8Array(intensity),
        classes:   new Uint8Array(classes),
    };
}

/**
 * Torso slab — multi-tissue ellipsoid with embedded organ regions
 * and vessels. Demonstrates the full tissue palette in one structure.
 */
export function generateTorsoSlab({ width = 14, height = 4, depth = 10 } = {}) {
    const coords = [], normals = [], intensity = [], classes = [];
    const orgX = 0, orgY = 0, orgZ = -2;
    const vesselX = 4, vesselZ = 1;
    for (let x = -width; x <= width; x++) {
        for (let y = -height; y <= height; y++) {
            for (let z = -depth; z <= depth; z++) {
                // Outer torso ellipsoid
                const e = (x*x)/(width*width) + (y*y)/(height*height) + (z*z)/(depth*depth);
                if (e > 1.0) continue;
                let cls, inten, nx, ny, nz;
                // Vessel — small pipe near the right
                const dv = Math.hypot(x - vesselX, z - vesselZ);
                if (dv <= 1.4) {
                    cls = 7; inten = 110;
                    nx = (x - vesselX) / (dv || 1); ny = 0; nz = (z - vesselZ) / (dv || 1);
                }
                // Organ blob
                else if (Math.hypot(x - orgX, y - orgY, z - orgZ) <= 3.0) {
                    cls = 6; inten = 70;
                    const dx = x - orgX, dy = y - orgY, dz = z - orgZ;
                    const dl = Math.hypot(dx, dy, dz) || 1;
                    nx = dx / dl; ny = dy / dl; nz = dz / dl;
                }
                // Bone strip along spine
                else if (Math.abs(x) <= 1 && Math.abs(y) <= height - 0.5 && z > depth - 4 && z < depth - 1) {
                    cls = 1; inten = 240;
                    nx = x; ny = 0; nz = 0;
                    const nl = Math.hypot(nx, ny, nz) || 1; nx /= nl; ny /= nl; nz /= nl;
                }
                // Fat layer at outer boundary (within 1 voxel of skin)
                else if (e > 0.78) {
                    cls = 5; inten = 60;
                    nx = x / width; ny = y / height; nz = z / depth;
                    const nl = Math.hypot(nx, ny, nz) || 1; nx /= nl; ny /= nl; nz /= nl;
                }
                // Muscle elsewhere
                else {
                    cls = 4; inten = 90;
                    nx = x / width; ny = y / height; nz = z / depth;
                    const nl = Math.hypot(nx, ny, nz) || 1; nx /= nl; ny /= nl; nz /= nl;
                }
                coords.push(x, y, z);
                normals.push(nx, ny, nz);
                intensity.push(inten + ((x*7 + z*3) & 15));
                classes.push(cls);
            }
        }
    }
    const count = classes.length;
    return {
        count,
        coords:    new Int16Array(coords),
        normals:   new Float32Array(normals),
        intensity: new Uint8Array(intensity),
        classes:   new Uint8Array(classes),
    };
}

export const MTO_GENERATORS = {
    anatomicalShell: generateAnatomicalShell,
    limbSection:     generateLimbSection,
    torsoSlab:       generateTorsoSlab,
};
