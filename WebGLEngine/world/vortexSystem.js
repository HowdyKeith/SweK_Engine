// world/vortexSystem.js — v519 — rotating vortex columns: tornado, whirlpool,
// waterspout, cyclone. They share one core — a spinning velocity field
// (tangential + inward pull, falling off to the edge, with optional lift) — and
// differ only by preset (radius, height, strength, lift, wander, whether they
// live over water). The field pushes floating debris (the buoyancy system) so
// whirlpools suck floaters into the center, waterspouts spin + lift them. The
// funnel particles are spawned by the caller, which samples fieldAt() down the
// column. Pure data + math here; no rendering, no voxel writes.

const PRESETS = {
    whirlpool:  { radius: 11, height: 3,  strength: 10, lift: 0,   wander: 0,   maxAge: 18, water: true,  spawnRate: 26 },
    tornado:    { radius: 7,  height: 30, strength: 8,  lift: 7,   wander: 5,   maxAge: 22, water: false, spawnRate: 34 },
    waterspout: { radius: 6,  height: 28, strength: 8,  lift: 8,   wander: 3,   maxAge: 18, water: true,  spawnRate: 34 },
    cyclone:    { radius: 28, height: 44, strength: 4.5, lift: 3,  wander: 7,   maxAge: 40, water: false, spawnRate: 40 },
};

export class VortexSystem {
    constructor(world) {
        this.world = world;
        this.vortices = [];
    }

    spawn(x, z, type = "tornado", opts = {}) {
        const base = PRESETS[type] || PRESETS.tornado;
        const v = { type, x: +x, z: +z, ...base, ...opts, age: 0, _t: Math.random() * 6.28 };
        this.vortices.push(v);
        return v;
    }
    count() { return this.vortices.length; }
    clear() { this.vortices.length = 0; }

    // Horizontal swirl velocity + lift at a world point for one vortex.
    // Counterclockwise tangential + inward radial, both fading to the edge.
    fieldAt(v, x, z) {
        const dx = x - v.x, dz = z - v.z;
        const r = Math.hypot(dx, dz);
        if (r > v.radius || r < 1e-4) return { vx: 0, vz: 0, lift: 0, r };
        const falloff = 1 - r / v.radius;          // 1 at center → 0 at edge
        const s = v.strength * falloff;
        const tx = -dz / r, tz = dx / r;           // tangential (CCW)
        const rx = -dx / r, rz = -dz / r;          // inward
        return { vx: tx * s + rx * s * 0.4, vz: tz * s + rz * s * 0.4, lift: v.lift * falloff, r };
    }

    // Strongest swirl at a point across ALL active vortices (for buoyancy /
    // queries). Returns the dominant vortex's field plus its type.
    sampleAt(x, z) {
        let best = { vx: 0, vz: 0, lift: 0, speed: 0, type: null };
        for (const v of this.vortices) {
            const f = this.fieldAt(v, x, z);
            const sp = Math.hypot(f.vx, f.vz);
            if (sp > best.speed) best = { vx: f.vx, vz: f.vz, lift: f.lift, speed: sp, type: v.type };
        }
        return best;
    }

    // dt seconds. `floaters` = FloatingDebris (optional): its objects get pushed
    // by the swirl (and lifted by waterspouts/tornados). Returns { active }.
    update(dt, { floaters = null } = {}) {
        if (dt > 0.1) dt = 0.1;
        const survivors = [];
        for (const v of this.vortices) {
            v.age += dt;
            if (v.age >= v.maxAge) continue;
            if (v.wander > 0) {                    // drunken-walk across the map
                v._t += dt;
                v.x += Math.cos(v._t * 0.7) * v.wander * dt;
                v.z += Math.sin(v._t * 0.5) * v.wander * dt;
            }
            if (floaters?.objects) {
                for (const o of floaters.objects) {
                    const f = this.fieldAt(v, o.x, o.z);
                    if (f.vx === 0 && f.vz === 0 && f.lift === 0) continue;
                    o.vx += f.vx * dt;
                    o.vz += f.vz * dt;
                    if (f.lift > 0) o.y += f.lift * dt * 0.5;   // waterspout/tornado lift
                }
            }
            survivors.push(v);
        }
        this.vortices = survivors;
        return { active: this.vortices.length };
    }
}
