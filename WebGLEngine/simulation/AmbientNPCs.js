// v1375 — ambient terrain NPCs: downloaded terrainNPC-role models that wander the
// biome terrain. Consumer 4/4 of the "library models as game entities" arc.
//
// Spawns via window.assetRoles.spawn (pick -> load -> entity:spawnMesh), wanders each
// critter toward a roaming target on the heightmap (synced with entity:move), and
// despawns them on stop. Driven by the demo framework's tick(dt) (the "wildlife" mode),
// so it always ticks without touching the core render loop. Guarded end-to-end: no
// assetRoles / empty role just yields an empty landscape.

const WORLD_SPREAD = 220;     // initial scatter half-extent (xz)
const ROAM_RADIUS  = 70;      // how far a fresh wander target sits from the current pos

export class AmbientNPCs {
    constructor({ router, world } = {}) {
        this.router = router || null;
        this.world  = world  || null;
        this.npcs   = [];
        this.active = false;
    }

    _groundY(x, z) {
        let y = 2;
        try { if (this.world?._heightAt) y = (this.world._heightAt(x, z) | 0) + 1; } catch {}
        return y;
    }

    start(count = 12) {
        if (this.active) return;
        this.active = true;
        if (typeof window === "undefined" || !window.assetRoles || !window.assetRoles.spawn) return;
        for (let i = 0; i < count; i++) {
            const x = (Math.random() - 0.5) * 2 * WORLD_SPREAD;
            const z = (Math.random() - 0.5) * 2 * WORLD_SPREAD;
            const y = this._groundY(x, z);
            window.assetRoles.spawn("terrainNPC", { x, y, z, kind: "terrain_npc", scale: 1.0 })
                .then((res) => {
                    if (!res || !res.ok || res.id == null) return;
                    if (!this.active) { try { this.router.exec({ type: "entity:despawn", id: res.id }); } catch {} return; }   // torn down mid-spawn
                    this.npcs.push({
                        id: res.id, x, y, z,
                        tx: x, tz: z, yaw: 0,
                        speed: 1.5 + Math.random() * 2,
                        retargetT: Math.random() * 3,
                    });
                }).catch(() => {});
        }
    }

    tick(dt) {
        if (!this.active || !this.router || !this.npcs.length) return;
        if (!(dt > 0)) dt = 0.016;
        for (const n of this.npcs) {
            n.retargetT -= dt;
            if (n.retargetT <= 0) {
                n.tx = n.x + (Math.random() - 0.5) * 2 * ROAM_RADIUS;
                n.tz = n.z + (Math.random() - 0.5) * 2 * ROAM_RADIUS;
                n.retargetT = 3 + Math.random() * 5;
            }
            const dx = n.tx - n.x, dz = n.tz - n.z;
            const d = Math.hypot(dx, dz) || 1;
            const step = Math.min(d, n.speed * dt);
            n.x += (dx / d) * step;
            n.z += (dz / d) * step;
            n.y = this._groundY(n.x, n.z);
            if (d > 0.001) n.yaw = Math.atan2(dx, dz);
            try { this.router.exec({ type: "entity:move", id: n.id, x: n.x, y: n.y, z: n.z, yaw: n.yaw }); } catch {}
        }
    }

    stop() {
        this.active = false;
        for (const n of this.npcs) { try { this.router.exec({ type: "entity:despawn", id: n.id }); } catch {} }
        this.npcs = [];
    }

    toggle(count) { if (this.active) this.stop(); else this.start(count); }
    count() { return this.npcs.length; }
}
