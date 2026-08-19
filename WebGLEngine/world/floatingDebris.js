// world/floatingDebris.js — v518 — buoyancy: persistent objects that float on
// the water surface and drift with the current field.
//
// Rendered through the existing instanced DebrisRenderer — getInstanceData()
// returns the same [x, y, z, scale, r, g, b] layout as VoxelDebris and the
// civilian ragdolls, so `debrisRenderer.render(floatingDebris, camera)` just
// works alongside them. Each floater rides its LOCAL water surface (scanned
// around its own Y, so it works on the sea or a high lake/river), is pushed
// along flood.currentAt(), bobs on the WaterField ripple, and despawns when it
// beaches (no water beneath it for a grace period) or after a long timeout.
import { VOXEL } from "./voxelFormat.js";

const WATER = VOXEL.WATER, FLOW = VOXEL.FLOWING_WATER;
const WATER_LEVEL     = 8;        // matches world.js
const MAX_OBJECTS     = 200;
const DEFAULT_MAX_AGE = 40;       // seconds afloat before despawn
const BEACH_GRACE     = 2.5;      // seconds out of water before despawn

// debris flavors — color + base scale
const KINDS = {
    log:    { r: 0.45, g: 0.30, b: 0.16, scale: 0.7 },
    crate:  { r: 0.58, g: 0.42, b: 0.24, scale: 0.6 },
    ice:    { r: 0.78, g: 0.90, b: 0.99, scale: 0.7 },
    debris: { r: 0.50, g: 0.50, b: 0.52, scale: 0.5 },
};

export class FloatingDebris {
    constructor(world) {
        this.world = world;
        this.objects = [];
        this.params = { drag: 0.90, currentPush: 7.0, bobAmp: 0.22, bobRate: 1.8, maxObjects: MAX_OBJECTS };
    }
    setParams(p) { Object.assign(this.params, p || {}); return this.params; }
    count() { return this.objects.length; }
    clear() { this.objects.length = 0; }

    // Find the local water-surface Y near (ix,iz), searching a band around seedY.
    // Returns the Y just ABOVE the top water voxel, or null if there's no water.
    _surfaceY(ix, iz, seedY, span) {
        const w = this.world;
        if (!w?.voxelAt) return seedY + 1;
        const yTop = Math.min(62, (seedY | 0) + span), yBot = Math.max(1, (seedY | 0) - span);
        for (let y = yTop; y >= yBot; y--) {
            const v = w.voxelAt(ix, y, iz);
            if (v === WATER || v === FLOW) return y + 1;
        }
        return null;
    }

    // Drop a floater at world (x,z). Seeds at the local water surface (wide
    // scan); if no water is found it seeds at the sea level and beaches shortly.
    spawn(x, z, { kind = "debris", scale = null, y = null } = {}) {
        const k = KINDS[kind] || KINDS.debris;
        if (this.objects.length >= this.params.maxObjects) this.objects.shift();
        const ix = x | 0, iz = z | 0;
        const surf = (y != null) ? y : (this._surfaceY(ix, iz, WATER_LEVEL, 30) ?? (WATER_LEVEL + 1));
        const o = {
            x: x + 0.5, z: z + 0.5, y: surf + 0.3,
            vx: 0, vz: 0,
            r: k.r, g: k.g, b: k.b, scale: scale ?? k.scale,
            bob: Math.random() * Math.PI * 2,
            age: 0, maxAge: DEFAULT_MAX_AGE, dry: 0,
        };
        this.objects.push(o);
        return o;
    }

    // Per-frame step. flood = FloodSystem (currentAt), waterField (getDisplacement).
    update(dt, flood, waterField) {
        if (dt > 0.1) dt = 0.1;
        const world = this.world, P = this.params;
        const survivors = [];
        for (const o of this.objects) {
            o.age += dt;
            if (o.age >= o.maxAge) continue;
            const ix = o.x | 0, iz = o.z | 0;
            // local surface, scanned around the object's own Y (sea OR high lake)
            const surf = this._surfaceY(ix, iz, o.y | 0, 4);
            if (surf == null) {
                o.dry += dt;
                if (o.dry >= BEACH_GRACE) continue;     // beached → gone
                o.vx *= 0.6; o.vz *= 0.6;               // settle where it grounded
            } else {
                o.dry = 0;
                if (flood?.currentAt) {                 // drift with the current
                    const c = flood.currentAt(ix, iz);
                    if (c && c.speed > 0) { o.vx += c.vx * P.currentPush * dt; o.vz += c.vz * P.currentPush * dt; }
                }
            }
            o.vx *= P.drag; o.vz *= P.drag;
            o.x += o.vx * dt; o.z += o.vz * dt;
            // ride the surface + bob (sin) + couple to the live ripple field
            o.bob += P.bobRate * dt;
            let waveY = 0;
            if (waterField?.getDisplacement) { try { const d = waterField.getDisplacement(o.x, o.z); if (Number.isFinite(d)) waveY = d; } catch {} }
            const base = (surf != null ? surf : (o.y | 0)) + 0.3;
            const targetY = base + Math.sin(o.bob) * P.bobAmp + waveY;
            o.y += (targetY - o.y) * Math.min(1, dt * 6);
            survivors.push(o);
        }
        this.objects = survivors;
        return { active: this.objects.length };
    }

    // [x, y, z, scale, r, g, b] per instance — same layout the DebrisRenderer
    // already consumes for VoxelDebris / ragdolls.
    getInstanceData() {
        const n = this.objects.length;
        const buf = new Float32Array(n * 7);
        for (let i = 0; i < n; i++) {
            const o = this.objects[i], off = i * 7;
            buf[off] = o.x; buf[off + 1] = o.y; buf[off + 2] = o.z; buf[off + 3] = o.scale;
            buf[off + 4] = o.r; buf[off + 5] = o.g; buf[off + 6] = o.b;
        }
        return { data: buf, count: n };
    }
}
