// FILE: engine/ovmGenerator.js
// VERSION: v1.1 — round 345 (AO added v346)
//
// Synthesizes .ovm sparse voxel assets without needing a TRELLIS-2
// Python interceptor. Useful for:
//   - Demoing the renderer when no real assets are available
//   - Testing the binary format round-trip with realistic data
//   - Quick visual experiments with the dual-grid offset displacement
//
// All generators return the in-memory struct that encodeOVM() accepts:
//   { count, coords, offsets, materials, aoBitmasks?  }
//
// The "shape offset" channel is what makes a true O-Voxel asset look
// organic instead of Minecraft-cubic. For a sphere, surface voxels
// get an offset toward the analytical surface — when the vertex shader
// adds (a_box_vertex + offset), the cube center shifts off the grid
// and the rendered geometry better approximates the curve.
//
// v346: added computeAOBitmasks() — 8 corners × 4 bits packed into a
// uint32 per voxel. Lookup table-based, runs once at generation time.

/**
 * Compute per-corner ambient occlusion bitmasks for an asset. For each
 * voxel, evaluate the 8 cube corners; for each corner check 3 edge-adjacent
 * cells; pack the 0-3 occlusion score into a 4-bit slot.
 *
 * Returns Uint32Array(N) — one packed uint32 per voxel.
 *
 *   bit layout per voxel uint32 (LSB → MSB):
 *     [ corner0:4 | corner1:4 | corner2:4 | corner3:4 |
 *       corner4:4 | corner5:4 | corner6:4 | corner7:4 ]
 *
 *   corner index encoding (binary):
 *     bit 0 = +X (1) or -X (0)
 *     bit 1 = +Y (1) or -Y (0)
 *     bit 2 = +Z (1) or -Z (0)
 *
 *   AO score per corner: 3 = fully exposed, 0 = fully occluded.
 *   Score = 3 - (count of neighbor cells filled).
 */
export function computeAOBitmasks(coords, count) {
    // Build active-set hash: encode (x,y,z) as a string key. JS Set/Map
    // with composite keys is the cleanest fast path here.
    const active = new Set();
    for (let i = 0; i < count; i++) {
        active.add(coords[i * 3 + 0] + "," + coords[i * 3 + 1] + "," + coords[i * 3 + 2]);
    }

    // Pre-compute the 3 edge-adjacent neighbor offsets for each of the 8
    // corners. Pattern: for corner (sx, sy, sz) the 3 edge neighbors are
    //   (sx, sy, 0), (sx, 0, sz), (0, sy, sz)
    // — the cells sharing an edge with that corner.
    const cornerNeighbors = [];
    for (let c = 0; c < 8; c++) {
        const sx = (c & 1) ? 1 : -1;
        const sy = (c & 2) ? 1 : -1;
        const sz = (c & 4) ? 1 : -1;
        cornerNeighbors.push([
            [sx, sy, 0],
            [sx, 0, sz],
            [0, sy, sz],
        ]);
    }

    const bitmasks = new Uint32Array(count);
    for (let i = 0; i < count; i++) {
        const x = coords[i * 3 + 0], y = coords[i * 3 + 1], z = coords[i * 3 + 2];
        let mask = 0;
        for (let c = 0; c < 8; c++) {
            let occluded = 0;
            for (const [dx, dy, dz] of cornerNeighbors[c]) {
                if (active.has((x + dx) + "," + (y + dy) + "," + (z + dz))) occluded++;
            }
            const aoScore = Math.max(0, 3 - occluded);   // 0..3
            mask |= (aoScore << (c * 4));
        }
        bitmasks[i] = mask >>> 0;   // ensure unsigned
    }
    return bitmasks;
}

/** Generate a sphere as a sparse voxel asset with surface-aligned shape offsets. */
export function generateSphere({ radius = 8, smoothness = 0.4, color = [180, 60, 220, 255] } = {}) {
    const R = radius;
    const dim = R * 2 + 4;   // bounding cube side
    const cx = R + 2, cy = R + 2, cz = R + 2;

    // Pass 1: gather active voxels (inside or on the surface shell)
    const active = [];
    for (let x = 0; x < dim; x++) {
        for (let y = 0; y < dim; y++) {
            for (let z = 0; z < dim; z++) {
                const dx = x - cx, dy = y - cy, dz = z - cz;
                const distSq = dx*dx + dy*dy + dz*dz;
                if (distSq <= R*R) active.push([x, y, z, dx, dy, dz]);
            }
        }
    }

    const count = active.length;
    const coords    = new Int16Array(count * 3);
    const offsets   = new Float32Array(count * 3);
    const materials = new Uint8Array(count * 4);

    for (let i = 0; i < count; i++) {
        const [x, y, z, dx, dy, dz] = active[i];
        // Center coords near origin
        coords[i * 3 + 0] = x - cx;
        coords[i * 3 + 1] = y - cy;
        coords[i * 3 + 2] = z - cz;

        // Shape offset: for voxels near the sphere surface, push slightly
        // outward in the radial direction so the rendered cubes contour
        // the analytical surface. Interior voxels get zero offset.
        const dist = Math.sqrt(dx*dx + dy*dy + dz*dz);
        const surfaceProximity = Math.max(0, 1 - (R - dist));   // 1 at surface, 0 at center
        const offsetMag = surfaceProximity * smoothness;
        if (dist > 0) {
            offsets[i * 3 + 0] = (dx / dist) * offsetMag;
            offsets[i * 3 + 1] = (dy / dist) * offsetMag;
            offsets[i * 3 + 2] = (dz / dist) * offsetMag;
        }

        // Color tinted by surface normal so the shape has visible shading
        materials[i * 4 + 0] = Math.max(0, Math.min(255, Math.round(color[0] * (0.6 + 0.4 * (dx/R + 1) * 0.5))));
        materials[i * 4 + 1] = Math.max(0, Math.min(255, Math.round(color[1] * (0.6 + 0.4 * (dy/R + 1) * 0.5))));
        materials[i * 4 + 2] = Math.max(0, Math.min(255, Math.round(color[2] * (0.6 + 0.4 * (dz/R + 1) * 0.5))));
        materials[i * 4 + 3] = 255;
    }
    return { count, coords, offsets, materials };
}

/** Generate a torus. Smoothness applied along the minor radius. */
export function generateTorus({ majorRadius = 8, minorRadius = 3, smoothness = 0.4 } = {}) {
    const dim = (majorRadius + minorRadius + 2) * 2;
    const cx = dim / 2, cy = dim / 2, cz = dim / 2;

    const active = [];
    for (let x = 0; x < dim; x++) {
        for (let y = 0; y < dim; y++) {
            for (let z = 0; z < dim; z++) {
                const dx = x - cx, dy = y - cy, dz = z - cz;
                const horiz = Math.sqrt(dx*dx + dz*dz);
                const tubeR = Math.sqrt((horiz - majorRadius) ** 2 + dy*dy);
                if (tubeR <= minorRadius) {
                    active.push([x, y, z, dx, dy, dz, horiz, tubeR]);
                }
            }
        }
    }
    const count = active.length;
    const coords    = new Int16Array(count * 3);
    const offsets   = new Float32Array(count * 3);
    const materials = new Uint8Array(count * 4);
    for (let i = 0; i < count; i++) {
        const [x, y, z, dx, dy, dz, horiz, tubeR] = active[i];
        coords[i * 3 + 0] = x - cx;
        coords[i * 3 + 1] = y - cy;
        coords[i * 3 + 2] = z - cz;
        // Radial offset along the minor radius — pushes surface voxels toward tube surface
        const surfaceProximity = Math.max(0, 1 - (minorRadius - tubeR));
        const offsetMag = surfaceProximity * smoothness;
        if (tubeR > 0 && horiz > 0) {
            // Direction along the tube cross-section
            const nx = (horiz - majorRadius) * (dx / horiz) / tubeR;
            const nz = (horiz - majorRadius) * (dz / horiz) / tubeR;
            const ny = dy / tubeR;
            offsets[i * 3 + 0] = nx * offsetMag;
            offsets[i * 3 + 1] = ny * offsetMag;
            offsets[i * 3 + 2] = nz * offsetMag;
        }
        const ang = Math.atan2(dz, dx);
        materials[i * 4 + 0] = Math.round(127.5 + 127.5 * Math.cos(ang));
        materials[i * 4 + 1] = Math.round(127.5 + 127.5 * Math.sin(ang));
        materials[i * 4 + 2] = Math.round(127.5 + 127.5 * (dy / minorRadius));
        materials[i * 4 + 3] = 255;
    }
    return { count, coords, offsets, materials };
}

/** Generate a box with rounded corners via shape offsets. */
export function generateRoundedBox({ size = 10, cornerRadius = 3, smoothness = 0.45 } = {}) {
    const half = Math.floor(size / 2);
    const coords    = [];
    const offsets   = [];
    const materials = [];
    let count = 0;
    for (let x = -half; x <= half; x++) {
        for (let y = -half; y <= half; y++) {
            for (let z = -half; z <= half; z++) {
                // Distance from nearest corner (chamfered cube SDF)
                const ax = Math.max(0, Math.abs(x) - (half - cornerRadius));
                const ay = Math.max(0, Math.abs(y) - (half - cornerRadius));
                const az = Math.max(0, Math.abs(z) - (half - cornerRadius));
                const cornerDist = Math.sqrt(ax*ax + ay*ay + az*az);
                if (cornerDist > cornerRadius) continue;   // outside rounded box
                count++;
                coords.push(x, y, z);
                // Offset toward the rounded surface for corner voxels
                const inset = cornerRadius - cornerDist;
                const surfaceProximity = Math.max(0, 1 - inset);
                const offsetMag = surfaceProximity * smoothness;
                if (cornerDist > 0) {
                    offsets.push((ax * Math.sign(x) / cornerDist) * offsetMag,
                                 (ay * Math.sign(y) / cornerDist) * offsetMag,
                                 (az * Math.sign(z) / cornerDist) * offsetMag);
                } else {
                    offsets.push(0, 0, 0);
                }
                // Color from XYZ position for visible shading
                materials.push(
                    Math.round(127 + 100 * x / half),
                    Math.round(127 + 100 * y / half),
                    Math.round(127 + 100 * z / half),
                    255
                );
            }
        }
    }
    return {
        count,
        coords:    new Int16Array(coords),
        offsets:   new Float32Array(offsets),
        materials: new Uint8Array(materials),
    };
}

/** Generate a procedural terrain patch — sine-wave heightfield. */
export function generateTerrain({ size = 20, amplitude = 4, smoothness = 0.3 } = {}) {
    const active = [];
    for (let x = 0; x < size; x++) {
        for (let z = 0; z < size; z++) {
            const u = (x / size) * Math.PI * 2;
            const v = (z / size) * Math.PI * 2;
            const h = Math.round(amplitude * (Math.sin(u) * Math.cos(v) + 0.5 * Math.sin(u * 2)));
            for (let y = -amplitude; y <= h; y++) {
                active.push([x - size/2, y, z - size/2, y, h]);
            }
        }
    }
    const count = active.length;
    const coords    = new Int16Array(count * 3);
    const offsets   = new Float32Array(count * 3);
    const materials = new Uint8Array(count * 4);
    for (let i = 0; i < count; i++) {
        const [x, y, z, vy, top] = active[i];
        coords[i * 3 + 0] = x;
        coords[i * 3 + 1] = y;
        coords[i * 3 + 2] = z;
        // Only top voxels get an upward shape offset for a softer surface
        if (vy === top) offsets[i * 3 + 1] = smoothness * 0.5;
        // Color by depth: dirt/grass/sand layering
        const fromTop = top - vy;
        if (fromTop === 0)      { materials[i*4]=110; materials[i*4+1]=170; materials[i*4+2]=60;  }   // grass
        else if (fromTop < 2)   { materials[i*4]=130; materials[i*4+1]=90;  materials[i*4+2]=50;  }   // dirt
        else                    { materials[i*4]=110; materials[i*4+1]=110; materials[i*4+2]=110; }   // stone
        materials[i*4+3] = 255;
    }
    return { count, coords, offsets, materials };
}

export const OVM_GENERATORS = {
    sphere:      generateSphere,
    torus:       generateTorus,
    roundedBox:  generateRoundedBox,
    terrain:     generateTerrain,
};

/**
 * Generator wrapper that runs a base generator + attaches AO bitmasks.
 * Use this when the renderer expects AO data (v346+).
 */
export function generateWithAO(name, opts = {}) {
    const gen = OVM_GENERATORS[name];
    if (!gen) throw new Error("generateWithAO: unknown generator " + name);
    const asset = gen(opts);
    asset.aoBitmasks = computeAOBitmasks(asset.coords, asset.count);
    return asset;
}
