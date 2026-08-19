// FILE: simulation/CSBot.js
// VERSION: v1 — round 326
//
// Per-bot state for CS-style team bots. Two roles:
//
//   ATTACKER (T side):
//     - Walks toward an assigned bombsite via the corridor graph
//     - On arrival, holds position (in real CS would plant; for now
//       just stands in the site as a soft objective)
//     - Shoots any visible enemy on cooldown
//
//   DEFENDER (CT side):
//     - Walks toward an assigned defensive position (site or near it)
//     - Patrols within a small radius
//     - Shoots any visible enemy on cooldown
//
// The AI is intentionally minimal: room-to-room target tracking,
// straight-line movement within each room, line-of-sight check via
// voxel raycast for shooting. No proper navmesh; the corridor carve
// shape means most paths are L-shaped, which the room-center
// targeting approximates well enough.

export const BOT_STATE = Object.freeze({
    MOVING:   "moving",     // pathing toward next room center
    HOLDING:  "holding",    // arrived at target room, watching
    SHOOTING: "shooting",   // enemy in sight, firing on cooldown
    DEAD:     "dead",
});

export const BOT_ROLE = Object.freeze({
    ATTACKER: "attacker",
    DEFENDER: "defender",
});

// Tuning constants
export const BOT_HP_DEFAULT       = 100;
export const BOT_MOVE_SPEED       = 4.5;     // voxels/sec
export const BOT_FIRE_INTERVAL_S  = 0.7;
export const BOT_DAMAGE_PER_HIT   = 18;      // ~5-6 hits to kill player (100 HP)
export const BOT_VIEW_RANGE       = 35;      // voxels — generous "spotting"
export const BOT_HIT_CHANCE       = 0.55;    // per-shot hit probability
export const BOT_TARGET_RADIUS    = 4;       // "I'm at target room" threshold

export class CSBot {
    constructor({ id, side, role, x, y, z, targetRoomId = null }) {
        this.id = id;                  // entity id from router.spawnMesh
        this.side = side;              // "t" | "ct"
        this.role = role;              // BOT_ROLE.ATTACKER | DEFENDER
        this.x = x; this.y = y; this.z = z;
        this.yaw = 0;
        this.hp = BOT_HP_DEFAULT;
        this.state = BOT_STATE.MOVING;
        this.targetRoomId = targetRoomId;
        this.path = [];                // [roomId, ...] from BFS
        this.pathIdx = 0;
        this._fireCooldown = Math.random() * BOT_FIRE_INTERVAL_S;
        this._patrolPhase = Math.random() * Math.PI * 2;
        this._patrolCenter = { x, z };
        // v328 — when true, the bot is locked in place (planting or
        // defusing). Movement is skipped but aim/fire still allowed.
        this.frozen = false;
    }

    isAlive() { return this.hp > 0 && this.state !== BOT_STATE.DEAD; }

    takeDamage(amt) {
        try { window.tintFX?.flash(this.id); } catch {}   // v554 — red hit-flash
        this.hp -= amt;
        if (this.hp <= 0) {
            this.hp = 0;
            this.state = BOT_STATE.DEAD;
            return true;   // died
        }
        return false;
    }

    /**
     * One AI tick. Caller passes:
     *   ctx.dt — frame delta
     *   ctx.layout — the CS map layout (for room lookups)
     *   ctx.enemies — array of { id, side, x, y, z, alive: bool } including player
     *   ctx.world — voxel world for LOS check
     *   ctx.fire(self, target) — callback when bot fires at someone
     *   ctx.move(self, dx, dz) — caller moves the entity (so collision can be applied)
     */
    tick(ctx) {
        if (!this.isAlive()) return;

        // 1) Find best visible enemy (any other team)
        const target = this._pickTarget(ctx);

        if (target) {
            // Face target and shoot
            const dx = target.x - this.x;
            const dz = target.z - this.z;
            this.yaw = Math.atan2(-dx, -dz);
            this.state = BOT_STATE.SHOOTING;
            this._fireCooldown -= ctx.dt;
            if (this._fireCooldown <= 0) {
                this._fireCooldown = BOT_FIRE_INTERVAL_S;
                ctx.fire?.(this, target);
            }
            return;
        }

        // v328 — frozen bots (planting/defusing) hold position and don't
        // advance pathing or patrol. Aim/fire above already ran, so the
        // bot still defends itself while standing still.
        if (this.frozen) {
            this.state = BOT_STATE.HOLDING;
            return;
        }

        // 2) No target visible → move toward objective
        this._advanceMovement(ctx);
    }

    _pickTarget(ctx) {
        const enemies = ctx.enemies || [];
        let best = null;
        let bestDist = Infinity;
        for (const e of enemies) {
            if (!e || !e.alive || e.side === this.side) continue;
            const dx = e.x - this.x;
            const dz = e.z - this.z;
            const d2 = dx * dx + dz * dz;
            if (d2 > BOT_VIEW_RANGE * BOT_VIEW_RANGE) continue;
            // Voxel LOS check — if blocked by stone, can't see
            if (ctx.world && !hasLineOfSight(this.x, this.y + 1.5, this.z,
                                             e.x, e.y + 1.5, e.z, ctx.world)) continue;
            if (d2 < bestDist) { bestDist = d2; best = e; }
        }
        return best;
    }

    _advanceMovement(ctx) {
        const layout = ctx.layout;
        if (!layout) return;

        // If we don't have a path yet, plan one
        if (this.path.length === 0 && this.targetRoomId) {
            const here = roomContaining(this.x, this.z, layout.rooms);
            this.path = bfsRoomPath(here, this.targetRoomId, layout) || [];
            this.pathIdx = 0;
        }

        // Walk toward the next room center on the path
        if (this.pathIdx < this.path.length) {
            const nextRoomId = this.path[this.pathIdx];
            const room = layout.rooms.find(r => r.id === nextRoomId);
            if (!room) {
                // Bad path; clear and retry next tick
                this.path = []; this.pathIdx = 0;
                return;
            }
            const tx = room.x + room.w / 2;
            const tz = room.z + room.d / 2;
            const dx = tx - this.x, dz = tz - this.z;
            const dist = Math.sqrt(dx * dx + dz * dz);
            if (dist < BOT_TARGET_RADIUS) {
                this.pathIdx++;
                return;
            }
            const step = Math.min(dist, BOT_MOVE_SPEED * ctx.dt);
            const nx = dx / (dist || 1);
            const nz = dz / (dist || 1);
            const mx = nx * step, mz = nz * step;
            this.yaw = Math.atan2(-mx, -mz);
            ctx.move?.(this, mx, mz);
            this.state = BOT_STATE.MOVING;
            return;
        }

        // Path complete → hold position with small patrol jitter (defenders)
        // or sit still (attackers at the site)
        this.state = BOT_STATE.HOLDING;
        if (this.role === BOT_ROLE.DEFENDER) {
            this._patrolPhase += ctx.dt * 0.6;
            const radius = 3;
            const ptx = this._patrolCenter.x + Math.cos(this._patrolPhase) * radius;
            const ptz = this._patrolCenter.z + Math.sin(this._patrolPhase) * radius;
            const dx = ptx - this.x, dz = ptz - this.z;
            const dist = Math.sqrt(dx * dx + dz * dz);
            if (dist > 0.5) {
                const step = Math.min(dist, BOT_MOVE_SPEED * 0.4 * ctx.dt);
                const mx = (dx / dist) * step, mz = (dz / dist) * step;
                this.yaw = Math.atan2(-mx, -mz);
                ctx.move?.(this, mx, mz);
            }
        }
    }
}

// =============================================================================
// Pure helpers — exported for testing
// =============================================================================

/** Which room (id) does (x, z) sit inside? Returns null if none. */
export function roomContaining(x, z, rooms) {
    for (const r of rooms) {
        if (x >= r.x && x < r.x + r.w && z >= r.z && z < r.z + r.d) {
            return r.id;
        }
    }
    return null;
}

/** BFS through the corridor + stair graph. Returns array of room ids
 *  from start (exclusive) to target (inclusive), or null if unreachable. */
export function bfsRoomPath(startId, targetId, layout) {
    if (!startId || !targetId) return null;
    if (startId === targetId) return [targetId];
    const adj = new Map();
    for (const r of layout.rooms) adj.set(r.id, []);
    for (const c of (layout.corridors || [])) {
        adj.get(c.from)?.push(c.to);
        adj.get(c.to)?.push(c.from);
    }
    for (const s of (layout.stairs || [])) {
        adj.get(s.from)?.push(s.to);
        adj.get(s.to)?.push(s.from);
    }
    const queue = [[startId]];
    const visited = new Set([startId]);
    while (queue.length) {
        const path = queue.shift();
        const cur = path[path.length - 1];
        for (const n of (adj.get(cur) || [])) {
            if (visited.has(n)) continue;
            const next = [...path, n];
            if (n === targetId) return next.slice(1);   // drop start
            visited.add(n);
            queue.push(next);
        }
    }
    return null;
}

/** Simple voxel-raymarch LOS. Returns true if no solid voxel
 *  between (ax,ay,az) and (bx,by,bz). Steps in ~0.5-voxel increments.
 *  Treats voxel id 0 (air) as clear; everything else as opaque. */
export function hasLineOfSight(ax, ay, az, bx, by, bz, world) {
    if (!world?.getVoxel) return true;   // optimistic when no world
    const dx = bx - ax, dy = by - ay, dz = bz - az;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    const steps = Math.max(1, Math.floor(dist * 2));
    const sx = dx / steps, sy = dy / steps, sz = dz / steps;
    for (let i = 1; i < steps; i++) {
        const x = Math.floor(ax + sx * i);
        const y = Math.floor(ay + sy * i);
        const z = Math.floor(az + sz * i);
        const v = world.getVoxel(x, y, z);
        if (v && v !== 0) return false;
    }
    return true;
}
