// FILE: simulation/AquaticLife.js
// v1379 — shared underwater LIFE layer. Populates a region with sea life and
// animates it, so the aquarium, open-sea, and sea-ogre scenarios can all reuse it
// (and the sandbox can borrow the spawn list). Uses the bespoke voxel kinds that
// already ship (sea_kelp / sea_ray / sea_turtle / sea_octopus / coral_* and the
// new sea_jelly / sea_shrimp) plus library seaCreature models, all via the entity
// spawn/move ops. Behaviours: kelp+coral root on the floor; ray/turtle/octopus +
// library models swim (3D wander + bob); jellyfish drift + pulse; shrimp move as a
// boids-lite swarm; one shark (kaiju_water) patrols a slow circle.

const CORAL_KINDS = ["coral_brain", "coral_brain_red", "coral_staghorn", "coral_table", "coral_pillar"];
const SWIM_KINDS  = ["sea_ray", "sea_turtle", "sea_octopus"];

export class AquaticLife {
    constructor({ router, world, assetLoader } = {}) {
        this.router = router || null;
        this.world  = world  || null;
        this.assetLoader = assetLoader || null;
        this.ents = [];          // { id, type, ... }
        this.active = false;
        this._swarmCenter = { x: 0, z: 0, tx: 0, tz: 0, t: 0 };
        this._monkeySwarm = { x: 0, z: 0, tx: 0, tz: 0, t: 0 };   // v1380
        this._region = null;
    }

    _floorY(x, z) {
        const r = this._region;
        if (r && typeof r.floorFn === "function") { try { const y = r.floorFn(x, z); if (isFinite(y)) return y; } catch {} }
        try { if (this.world?._heightAt) { const y = this.world._heightAt(x, z); if (isFinite(y)) return y; } } catch {}
        return 8;
    }

    _spawnKind(kind, x, y, z, scale) {
        try {
            const r = this.router.exec({ type: "entity:spawnMesh", assetId: kind, kind, x, y, z, scale, yaw: 0 });
            return (r && r.id != null) ? r.id : null;
        } catch { return null; }
    }

    populate(opts = {}) {
        if (this.active) return;
        this.active = true;
        const cx = opts.cx ?? 0, cz = opts.cz ?? 0, half = opts.half ?? 44;
        const topY = opts.topY ?? (this._floorY(cx, cz) + 28);
        this._region = { cx, cz, half, topY, floorFn: opts.floorFn || null };
        const c = Object.assign({ kelp: 10, coral: 8, swimmers: 6, jelly: 5, shrimp: 14, monkey: 10, shark: 1 }, opts.counts || {});
        const rnd = (m) => (Math.random() - 0.5) * 2 * m;
        const inR = () => [cx + rnd(half - 4), cz + rnd(half - 4)];

        // Floor flora (static)
        for (let i = 0; i < c.kelp; i++)  { const [x, z] = inR(); const id = this._spawnKind("sea_kelp", x, this._floorY(x, z), z, 0.45 + Math.random() * 0.25); if (id != null) this.ents.push({ id, type: "static" }); }
        for (let i = 0; i < c.coral; i++) { const [x, z] = inR(); const k = CORAL_KINDS[(Math.random() * CORAL_KINDS.length) | 0]; const id = this._spawnKind(k, x, this._floorY(x, z), z, 0.35 + Math.random() * 0.3); if (id != null) this.ents.push({ id, type: "static" }); }

        // Swimmers — voxel kinds
        for (let i = 0; i < c.swimmers; i++) {
            const [x, z] = inR(); const k = SWIM_KINDS[(Math.random() * SWIM_KINDS.length) | 0];
            const y = this._floorY(x, z) + 4 + Math.random() * 16;
            const id = this._spawnKind(k, x, y, z, 0.35 + Math.random() * 0.2);
            if (id != null) this.ents.push(this._swimmer(id, x, y, z));
        }
        // Swimmers — library seaCreature models (height-normalised)
        if (typeof window !== "undefined" && window.assetRoles?.spawn && (opts.libCount ?? 6) > 0) {
            for (let i = 0; i < (opts.libCount ?? 6); i++) {
                const [x, z] = inR(); const y = this._floorY(x, z) + 4 + Math.random() * 16;
                window.assetRoles.spawn("seaCreature", { x, y, z, kind: "sea_creature" }).then((res) => {
                    if (!res || !res.ok || res.id == null) return;
                    if (!this.active) { try { this.router.exec({ type: "entity:despawn", id: res.id }); } catch {} return; }
                    const crawl = /marauder|crab|lobster|scorpion/i.test(String(res.model || ""));
                    this.ents.push(crawl ? this._crawler(res.id, x, z) : this._swimmer(res.id, x, y, z));
                }).catch(() => {});
            }
        }

        // Jellyfish — drift + pulse
        for (let i = 0; i < c.jelly; i++) {
            const [x, z] = inR(); const y = this._floorY(x, z) + 8 + Math.random() * 12;
            const id = this._spawnKind("sea_jelly", x, y, z, 0.35 + Math.random() * 0.2);
            if (id != null) this.ents.push({ id, type: "jelly", x, y, z, baseY: y, head: Math.random() * Math.PI * 2, drift: 0.4 + Math.random() * 0.5, phase: Math.random() * Math.PI * 2, amp: 1.5 + Math.random() });
        }

        // Shrimp swarm
        this._swarmCenter = { x: cx, z: cz, tx: cx, tz: cz, t: 0 };
        for (let i = 0; i < c.shrimp; i++) {
            const x = cx + rnd(12), z = cz + rnd(12); const y = this._floorY(x, z) + 2 + Math.random() * 4;
            const id = this._spawnKind("sea_shrimp", x, y, z, 0.12 + Math.random() * 0.06);
            if (id != null) this.ents.push({ id, type: "shrimp", x, y, z, yaw: 0, jitter: Math.random() * Math.PI * 2 });
        }

        // Sea-monkey colony — schools mid-water around its own wandering centre.
        this._monkeySwarm = { x: cx, z: cz, tx: cx, tz: cz, t: 0 };
        for (let i = 0; i < c.monkey; i++) {
            const x = cx + rnd(14), z = cz + rnd(14); const y = this._floorY(x, z) + 8 + Math.random() * 8;
            const id = this._spawnKind("sea_monkey", x, y, z, 0.16 + Math.random() * 0.06);
            if (id != null) this.ents.push({ id, type: "monkey", x, y, z, yaw: 0, jitter: Math.random() * Math.PI * 2 });
        }

        // Shark — slow circular patrol
        for (let i = 0; i < c.shark; i++) {
            const ang = Math.random() * Math.PI * 2, rad = half * 0.6;
            const x = cx + Math.cos(ang) * rad, z = cz + Math.sin(ang) * rad;
            const y = this._floorY(cx, cz) + 12;
            const id = this._spawnKind("kaiju_water", x, y, z, 0.5);
            if (id != null) this.ents.push({ id, type: "shark", ang, rad, y, cx, cz, speed: 0.25 + Math.random() * 0.15 });
        }
    }

    _swimmer(id, x, y, z) { return { id, type: "swim", x, y, z, tx: x, ty: y, tz: z, yaw: 0, speed: 1.3 + Math.random() * 1.8, bob: Math.random() * 6.28, retargetT: Math.random() * 3 }; }
    _crawler(id, x, z)    { return { id, type: "crawl", x, y: this._floorY(x, z) + 1, z, tx: x, tz: z, yaw: 0, speed: 0.8 + Math.random(), retargetT: Math.random() * 3 }; }

    tick(dt) {
        if (!this.active || !this.router) return;
        if (!(dt > 0)) dt = 0.016;
        const R = this._region; if (!R) return;
        const half = R.half, cx = R.cx, cz = R.cz, topY = R.topY;
        const clampXZ = (v, c0) => Math.max(c0 - half + 3, Math.min(c0 + half - 3, v));

        // Shrimp swarm centre wanders.
        const sc = this._swarmCenter; sc.t -= dt;
        if (sc.t <= 0) { sc.tx = clampXZ(cx + (Math.random() - 0.5) * half, cx); sc.tz = clampXZ(cz + (Math.random() - 0.5) * half, cz); sc.t = 3 + Math.random() * 3; }
        sc.x += (sc.tx - sc.x) * Math.min(1, dt * 0.6); sc.z += (sc.tz - sc.z) * Math.min(1, dt * 0.6);
        const mc = this._monkeySwarm; mc.t -= dt;
        if (mc.t <= 0) { mc.tx = clampXZ(cx + (Math.random() - 0.5) * half, cx); mc.tz = clampXZ(cz + (Math.random() - 0.5) * half, cz); mc.t = 4 + Math.random() * 3; }
        mc.x += (mc.tx - mc.x) * Math.min(1, dt * 0.5); mc.z += (mc.tz - mc.z) * Math.min(1, dt * 0.5);

        for (const e of this.ents) {
            if (e.type === "static") continue;

            if (e.type === "swim") {
                e.retargetT -= dt;
                if (e.retargetT <= 0) { e.tx = clampXZ(e.x + (Math.random() - 0.5) * 40, cx); e.tz = clampXZ(e.z + (Math.random() - 0.5) * 40, cz); e.ty = this._floorY(e.x, e.z) + 4 + Math.random() * (topY - this._floorY(e.x, e.z) - 8); e.retargetT = 3 + Math.random() * 4; }
                const dx = e.tx - e.x, dz = e.tz - e.z, d = Math.hypot(dx, dz) || 1, step = Math.min(d, e.speed * dt);
                e.x += dx / d * step; e.z += dz / d * step;
                e.bob += dt * 1.6; e.y += (Math.max(this._floorY(e.x, e.z) + 3, e.ty) - e.y) * Math.min(1, dt * 0.8) + Math.sin(e.bob) * dt * 1.2;
                if (d > 0.001) e.yaw = Math.atan2(dx, dz);
            } else if (e.type === "crawl") {
                e.retargetT -= dt;
                if (e.retargetT <= 0) { e.tx = clampXZ(e.x + (Math.random() - 0.5) * 30, cx); e.tz = clampXZ(e.z + (Math.random() - 0.5) * 30, cz); e.retargetT = 3 + Math.random() * 4; }
                const dx = e.tx - e.x, dz = e.tz - e.z, d = Math.hypot(dx, dz) || 1, step = Math.min(d, e.speed * dt);
                e.x += dx / d * step; e.z += dz / d * step; e.y = this._floorY(e.x, e.z) + 1;
                if (d > 0.001) e.yaw = Math.atan2(dx, dz);
            } else if (e.type === "jelly") {
                e.phase += dt * 1.2; e.head += (Math.random() - 0.5) * dt;
                e.x = clampXZ(e.x + Math.sin(e.head) * e.drift * dt * 6, cx);
                e.z = clampXZ(e.z + Math.cos(e.head) * e.drift * dt * 6, cz);
                e.y = e.baseY + Math.sin(e.phase) * e.amp;
                e.yaw = e.head;
            } else if (e.type === "shrimp") {
                // steer toward the swarm centre + jitter, hug low water
                e.jitter += dt * 3;
                const dx = sc.x - e.x + Math.cos(e.jitter) * 6, dz = sc.z - e.z + Math.sin(e.jitter * 1.3) * 6;
                const d = Math.hypot(dx, dz) || 1, sp = 3.5;
                e.x += dx / d * sp * dt; e.z += dz / d * sp * dt;
                e.y = this._floorY(e.x, e.z) + 2 + Math.sin(e.jitter) * 0.5;
                e.yaw = Math.atan2(dx, dz);
            } else if (e.type === "monkey") {
                e.jitter += dt * 2.5;
                const dx = mc.x - e.x + Math.cos(e.jitter) * 7, dz = mc.z - e.z + Math.sin(e.jitter * 1.2) * 7;
                const d = Math.hypot(dx, dz) || 1, sp = 2.8;
                e.x += dx / d * sp * dt; e.z += dz / d * sp * dt;
                e.y = this._floorY(e.x, e.z) + 8 + Math.sin(e.jitter * 0.7) * 2;
                e.yaw = Math.atan2(dx, dz);
            } else if (e.type === "shark") {
                e.ang += e.speed * dt;
                e.x = e.cx + Math.cos(e.ang) * e.rad; e.z = e.cz + Math.sin(e.ang) * e.rad;
                e.yaw = e.ang + Math.PI / 2;
            }
            try { this.router.exec({ type: "entity:move", id: e.id, x: e.x, y: e.y, z: e.z, yaw: e.yaw }); } catch {}
        }
    }

    clear() {
        this.active = false;
        for (const e of this.ents) { try { this.router.exec({ type: "entity:despawn", id: e.id }); } catch {} }
        this.ents = [];
    }
    count() { return this.ents.length; }
}
