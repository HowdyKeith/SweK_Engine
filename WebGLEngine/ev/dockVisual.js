// WebGLEngine/ev/dockVisual.js — derive a small 3D appearance descriptor for a stellar (spöb) from its flags.
// Pure: no three.js, no DOM, fully deterministic — so it can be unit-tested headless. dockView.js consumes the result
// to build the actual mesh; the same spob always yields the same look.
import { voxelizeShell, VOXEL_KINDS } from "../tools/voxExporter.js";

function hsv(h, s, v) {                       // h,s,v in 0..1 -> [r,g,b] 0..255
    const i = Math.floor(h * 6), f = h * 6 - i, p = v * (1 - s), q = v * (1 - f * s), t = v * (1 - (1 - f) * s);
    let r, g, b;
    switch (((i % 6) + 6) % 6) {
        case 0: r = v; g = t; b = p; break;
        case 1: r = q; g = v; b = p; break;
        case 2: r = p; g = v; b = t; break;
        case 3: r = p; g = q; b = v; break;
        case 4: r = t; g = p; b = v; break;
        default: r = v; g = p; b = q;
    }
    return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

// spob -> { kind:"planet"|"station", color:[r,g,b], spin, ringed, emissive }
function spobVisual(spob) {
    const s = spob || {};
    const station = !!s.isStation;
    const govt = (s.govt != null && s.govt >= 0) ? s.govt : 7;
    const hue = (((govt * 0.137) % 1) + 1) % 1;                 // stable per-govt hue
    const tech = Math.max(0, Math.min(6, s.techLevel || 0));
    const val = 0.5 + tech * 0.05;                             // higher tech reads brighter
    const color = station ? hsv((hue + 0.55) % 1, 0.22, 0.72)  // stations: cool, desaturated, metallic
                          : hsv(hue, 0.55, val);                // planets: warmer, saturated by govt
    return {
        kind: station ? "station" : "planet",
        color,
        spin: station ? 0.30 : 0.14,                            // stations turn a touch faster
        ringed: !station && (((s.id || 0) % 5) === 0),          // a fraction of planets get a ring
        emissive: station ? 0.18 : 0.05,                        // stations glow a little from their lights
    };
}

// spob -> a centred voxel model for the dock viewport: a hollow shell (hull colour from spobVisual) wrapping a glowing
// energy core. Returns { size, radius, groups:{ solid:{color,emissive,voxels:[{x,y,z}]}, energy:{color,emissive,voxels} } }
// with voxel positions centred on the origin. Pure (delegates the voxelization to the tested voxelizeShell).
function dockVoxelModel(spob) {
    const v = spobVisual(spob);
    const station = v.kind === "station";
    const radius = station ? 6 : 7;
    const coreR = station ? 2.6 : 1.7;          // stations read as "powered" - a bigger glowing core
    const thickness = station ? 2 : 1;          // stations get a chunkier hull
    const shell = voxelizeShell(radius, coreR, thickness);
    const c = (shell.size - 1) / 2;
    const groups = {
        solid:  { color: v.color,            emissive: v.emissive, voxels: [] },
        energy: { color: VOXEL_KINDS.energy.color, emissive: 1,    voxels: [] },
    };
    for (const vox of shell.voxels) {
        const g = groups[vox.kind] || groups.solid;
        g.voxels.push({ x: vox.x - c, y: vox.y - c, z: vox.z - c });
    }
    // ringed planets get a thin, dusty equatorial band of voxels just outside the hull (lost in the voxel swap, restored).
    let extent = radius;
    if (v.ringed) {
        const inner = radius + 1.5, outer = radius + 3.0, rr = Math.ceil(outer);
        const dust = [205, 200, 190];
        const ring = { color: v.color.map((ch, i) => Math.round((ch + dust[i]) / 2)), emissive: 0.04, voxels: [] };
        for (let z = -rr; z <= rr; z++) for (let x = -rr; x <= rr; x++) {
            const h = Math.sqrt(x * x + z * z);
            if (h >= inner && h <= outer + 0.001) ring.voxels.push({ x, y: 0, z });   // single equatorial layer
        }
        groups.ring = ring;
        extent = rr;
    }
    return { size: 2 * extent + 1, radius, spin: v.spin, groups };
}

export { spobVisual, dockVoxelModel };