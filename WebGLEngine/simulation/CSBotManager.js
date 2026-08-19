// FILE: simulation/CSBotManager.js
// VERSION: v1 — round 326
//
// Manages all CS-side bots: spawn at team spawns, tick AI each frame,
// route hits/deaths, expose alive counts for round-end checks.
//
// Bot composition per round:
//   2 T attackers (spawn in t_spawn, walk toward a chosen bombsite)
//   2 CT defenders (spawn in ct_spawn, walk toward a defensive position
//     near a site, then patrol)
//
// One T attacker picks A site, the other picks B site (split push).
// CT defenders mirror: one watches A, one watches B.

import { CSBot, BOT_ROLE, BOT_HP_DEFAULT, BOT_DAMAGE_PER_HIT, hasLineOfSight } from "./CSBot.js";
import { pointInZone } from "./CSBomb.js";

const T_BOT_ASSETS  = ["bot_grunt", "bot_grunt"];      // reuse existing bot meshes
const CT_BOT_ASSETS = ["bot_grunt", "bot_grunt"];

export class CSBotManager {
    constructor({ router, world, fpsShooter, particles }) {
        this.router = router;
        this.world = world;
        this.fpsShooter = fpsShooter;
        this.particles = particles;

        this.bots = new Map();        // entityId → CSBot
        this._layout = null;
        this._playerSide = "t";
        this._spawned = false;
        // v328 — main.js patches this after construction so we can read
        // the current action owner and freeze the right bot.
        this.roundManager = null;
    }

    /** Spawn the bots for a fresh round.
     *  @param {Object} layout — current CS map layout
     *  @param {string} playerSide — "t" | "ct"; opposite team gets full bot count */
    spawnRound(layout, playerSide) {
        this.despawnAll();
        this._layout = layout;
        this._playerSide = playerSide;

        const tSpawn  = layout.rooms.find(r => r.id === "t_spawn");
        const ctSpawn = layout.rooms.find(r => r.id === "ct_spawn");
        if (!tSpawn || !ctSpawn) return;

        // T side: 2 attackers (one to A, one to B). If player is T, one
        // less bot on T side (player counts as the third T).
        const tCount = playerSide === "t" ? 1 : 2;
        const targets = ["a_site", "b_site"];
        for (let i = 0; i < tCount; i++) {
            const ang = (i / tCount) * Math.PI * 2;
            const sx = tSpawn.x + tSpawn.w / 2 + Math.cos(ang) * 3;
            const sz = tSpawn.z + tSpawn.d / 2 + Math.sin(ang) * 3;
            this._spawnBot({
                side: "t",
                role: BOT_ROLE.ATTACKER,
                x: sx, z: sz,
                targetRoomId: targets[i % targets.length],
            });
        }

        // CT side: 2 defenders, one watches A and one watches B
        const ctCount = playerSide === "ct" ? 1 : 2;
        const ctTargets = ["a_site", "b_site"];
        for (let i = 0; i < ctCount; i++) {
            const ang = (i / ctCount) * Math.PI * 2;
            const sx = ctSpawn.x + ctSpawn.w / 2 + Math.cos(ang) * 3;
            const sz = ctSpawn.z + ctSpawn.d / 2 + Math.sin(ang) * 3;
            this._spawnBot({
                side: "ct",
                role: BOT_ROLE.DEFENDER,
                x: sx, z: sz,
                targetRoomId: ctTargets[i % ctTargets.length],
            });
        }

        this._spawned = true;
        console.log(`[csbots] spawned ${this.bots.size} bots (player: ${playerSide.toUpperCase()})`);
    }

    despawnAll() {
        for (const bot of this.bots.values()) {
            try { this.router?.exec({ type: "entity:despawn", id: bot.id }); } catch {}
        }
        this.bots.clear();
        this._spawned = false;
    }

    /** Per-frame tick. Run all bot AI, apply movement, fire-callbacks. */
    tick(dt) {
        if (!this._spawned || !this._layout) return;
        const playerPos = this._getPlayerPos();
        const playerAlive = (this.fpsShooter?.health ?? 1) > 0 &&
                             (this.fpsShooter?.active ?? false);

        // v328 — propagate freeze state. The bot whose id matches the
        // round manager's current action owner is locked in place
        // (planting or defusing). All other bots are unfrozen.
        const ownerId = this.roundManager?.getActionOwnerId?.();
        for (const bot of this.bots.values()) {
            bot.frozen = (ownerId != null && ownerId !== "player" && ownerId === bot.id);
        }

        // Build enemies list once per tick (each bot sees this snapshot)
        const enemies = [];
        for (const bot of this.bots.values()) {
            if (bot.isAlive()) {
                enemies.push({ id: bot.id, side: bot.side,
                              x: bot.x, y: bot.y, z: bot.z, alive: true });
            }
        }
        if (playerAlive) {
            enemies.push({
                id: -1,    // player sentinel
                side: this._playerSide,
                x: playerPos.x, y: playerPos.y, z: playerPos.z,
                alive: true,
            });
        }

        const ctx = {
            dt,
            layout: this._layout,
            enemies,
            world: this.world,
            fire: (self, target) => this._botFires(self, target),
            move: (self, dx, dz) => this._botMoves(self, dx, dz),
        };
        for (const bot of this.bots.values()) {
            if (bot.isAlive()) bot.tick(ctx);
        }
    }

    // -- v328 — plant/defuse intent providers --------------------------------

    /** Returns the first alive T attacker standing in a plant zone,
     *  or null if no T bot is eligible. Stateless. */
    getBotPlanter() {
        const zones = this._layout?.csMeta?.plantZones;
        if (!zones) return null;
        for (const bot of this.bots.values()) {
            if (!bot.isAlive()) continue;
            if (bot.side !== "t") continue;
            if (bot.role !== BOT_ROLE.ATTACKER) continue;
            if (zones.a && pointInZone(bot.x, bot.z, zones.a)) return bot;
            if (zones.b && pointInZone(bot.x, bot.z, zones.b)) return bot;
        }
        return null;
    }

    /** Returns the first alive CT defender within `radius` of the bomb,
     *  or null. Stateless. */
    getBotDefuser(bx, bz, radius) {
        const r2 = radius * radius;
        for (const bot of this.bots.values()) {
            if (!bot.isAlive()) continue;
            if (bot.side !== "ct") continue;
            const dx = bot.x - bx, dz = bot.z - bz;
            if (dx * dx + dz * dz <= r2) return bot;
        }
        return null;
    }

    // -- v330 — carrier lookup helpers ---------------------------------------

    /** Returns the id of the first alive T attacker. Used as the
     *  initial bomb carrier when player is CT side. Returns null if
     *  no T bot exists. */
    getFirstTBotId() {
        for (const bot of this.bots.values()) {
            if (bot.side === "t" && bot.isAlive()) return bot.id;
        }
        return null;
    }

    /** Position of a given bot (or null if dead/missing). */
    getBotPos(botId) {
        const bot = this.bots.get(botId);
        if (!bot || !bot.isAlive()) return null;
        return { x: bot.x, z: bot.z };
    }

    /** First alive T entity (bot only — player handled separately by
     *  main.js wiring) within `radius` of a position. Used for bomb
     *  pickup detection. */
    getNearbyTBot(x, z, radius) {
        const r2 = radius * radius;
        for (const bot of this.bots.values()) {
            if (!bot.isAlive()) continue;
            if (bot.side !== "t") continue;
            const dx = bot.x - x, dz = bot.z - z;
            if (dx * dx + dz * dz <= r2) return bot.id;
        }
        return null;
    }

    // -- Inspection ----------------------------------------------------------

    /** Number of alive bots on a given side. Caller adds 1 if the
     *  player is on that side and alive. */
    aliveBots(side) {
        let n = 0;
        for (const bot of this.bots.values()) {
            if (bot.side === side && bot.isAlive()) n++;
        }
        return n;
    }

    /** Total alive on a side (bots + player if applicable). */
    aliveTeam(side, playerAlive) {
        let n = this.aliveBots(side);
        if (this._playerSide === side && playerAlive) n++;
        return n;
    }

    list() {
        return [...this.bots.values()].map(b => ({
            id: b.id, side: b.side, role: b.role,
            x: b.x|0, z: b.z|0, hp: b.hp, state: b.state,
            target: b.targetRoomId,
        }));
    }

    /** v538 — area damage from the bomb blast. Damages every alive bot
     *  within `radius` of (x,z) by `amount` (0..1 of bot HP scale via
     *  takeDamage). Returns the number newly killed. */
    damageNear(x, z, radius, amount) {
        let killed = 0;
        const r2 = radius * radius;
        for (const bot of this.bots.values()) {
            if (!bot.isAlive?.()) continue;
            const dx = bot.x - x, dz = bot.z - z;
            if (dx * dx + dz * dz <= r2) {
                bot.takeDamage(amount);
                if (!bot.isAlive()) killed++;
            }
        }
        return killed;
    }

    // -- Internals -----------------------------------------------------------

    _spawnBot({ side, role, x, z, targetRoomId }) {
        const y = (this.world?._heightAt?.(x, z) ?? 5) + 1;
        const asset = side === "t" ? T_BOT_ASSETS[this.bots.size % T_BOT_ASSETS.length]
                                   : CT_BOT_ASSETS[this.bots.size % CT_BOT_ASSETS.length];
        let r;
        try {
            r = this.router.exec({
                type: "entity:spawnMesh",
                assetId: asset,
                kind: asset,
                x, y, z, scale: 1, yaw: 0,
            });
        } catch (e) {
            console.warn(`[csbots] spawn failed: ${e?.message ?? e}`);
            return null;
        }
        const id = r?.id;
        if (id == null) return null;

        const bot = new CSBot({ id, side, role, x, y, z, targetRoomId });
        this.bots.set(id, bot);
        // v555 — team recolor: T and CT share the bot_grunt mesh, so tint them
        // apart (composes with the hit-flash, which reverts to this base).
        try { window.tintFX?.team(id, side === "t" ? [1.0, 0.55, 0.15] : [0.30, 0.55, 1.0], 0.5); } catch {}

        // Register with FPS shooter so the player can damage the bot.
        // The shooter's onDeath callback dispatches to our _onBotKilled.
        if (this.fpsShooter?.registerEnemy) {
            this.fpsShooter.registerEnemy(id, {
                hp: BOT_HP_DEFAULT,
                kind: asset,
                name: `${side.toUpperCase()}-BOT`,
                onDeath: (eid) => this._onBotKilled(eid, true),   // v543 — player frag
                // The FPS bullet-hit hook passes damage amounts; relay to bot.
                onHit: (eid, dmg) => {
                    const b = this.bots.get(eid);
                    if (b) b.takeDamage(dmg);
                },
            });
        }
        return bot;
    }

    _onBotKilled(entityId, byPlayer = false) {
        const bot = this.bots.get(entityId);
        if (!bot) return;
        bot.state = "dead";
        bot.hp = 0;
        // v543 — buy economy: reward the player for fragging an ENEMY bot.
        // Only the FPS player-kill path passes byPlayer=true; bot-on-bot and
        // non-CS (e.g. OGRE turret) deaths pass false, so no mis-rewards.
        if (byPlayer && this.roundManager &&
            this.roundManager.state !== "idle" &&
            bot.side !== this.roundManager.playerSide) {
            try { this.roundManager.awardKill(); } catch {}
        }
        // Small puff at death
        if (this.particles?.spawn) {
            for (let i = 0; i < 8; i++) {
                const a = Math.random() * Math.PI * 2;
                try {
                    this.particles.spawn({
                        x: bot.x + Math.cos(a) * 0.6,
                        y: bot.y + Math.random() * 1.4,
                        z: bot.z + Math.sin(a) * 0.6,
                        vx: Math.cos(a) * 1, vy: 1.5, vz: Math.sin(a) * 1,
                        ttl: 0.6, size: 0.4,
                        r: 0.9, g: 0.2, b: 0.1, a: 0.7, gravity: -1,
                    });
                } catch {}
            }
        }
        // Despawn the entity (mesh disappears)
        try { this.router?.exec({ type: "entity:despawn", id: entityId }); } catch {}
        // Keep the bot record in the map briefly so aliveBots() reflects
        // the kill — but we mark state DEAD and hp 0, so isAlive() is false.
    }

    _botFires(bot, target) {
        // Pseudo-random hit roll (could later be raycast-based)
        if (Math.random() > 0.55) return;   // miss
        if (target.id === -1) {
            // Player hit. v327 — engine player health is 0..1 normalized,
            // but our bot damage is on a 0..100 scale (matches bot HP).
            // Normalize: 18 bot-damage = 0.18 player-damage.
            if (this.fpsShooter?.takeDamage) {
                const dmg01 = BOT_DAMAGE_PER_HIT / BOT_HP_DEFAULT;
                this.fpsShooter.takeDamage(dmg01,
                    { kind: "cs_bot", side: bot.side });
            }
        } else {
            // Bot-on-bot: use takeDamage on the target bot
            const t = this.bots.get(target.id);
            if (t && t.takeDamage(BOT_DAMAGE_PER_HIT)) {
                this._onBotKilled(target.id);
            }
        }
        // Small muzzle puff at bot
        if (this.particles?.spawn) {
            try {
                this.particles.spawn({
                    x: bot.x, y: bot.y + 1.4, z: bot.z,
                    vx: (Math.random() - 0.5) * 2,
                    vy: Math.random() * 1.5,
                    vz: (Math.random() - 0.5) * 2,
                    ttl: 0.25, size: 0.4,
                    r: 1, g: 0.9, b: 0.4, a: 0.8, gravity: 0,
                });
            } catch {}
        }
    }

    _botMoves(bot, dx, dz) {
        // Simple wall-slide: try full move, if next voxel is solid skip
        // that axis. Cheap enough at 4 bots.
        const tryX = bot.x + dx, tryZ = bot.z + dz;
        const yFloor = Math.floor(bot.y);
        let nx = bot.x, nz = bot.z;
        if (this.world?.getVoxel) {
            const blockX = this.world.getVoxel(Math.floor(tryX), yFloor, Math.floor(bot.z));
            const blockZ = this.world.getVoxel(Math.floor(bot.x), yFloor, Math.floor(tryZ));
            if (!blockX) nx = tryX;
            if (!blockZ) nz = tryZ;
        } else {
            nx = tryX; nz = tryZ;
        }
        bot.x = nx; bot.z = nz;

        // Y follows the world height (steps onto heaven stairs etc.)
        if (this.world?._heightAt) {
            bot.y = this.world._heightAt(bot.x, bot.z) + 1;
        }

        // Reflect to renderer
        if (this.router) {
            try {
                this.router.exec({
                    type: "entity:move",
                    id: bot.id,
                    x: bot.x, y: bot.y, z: bot.z,
                    yaw: bot.yaw,
                });
            } catch {}
        }
    }

    _getPlayerPos() {
        // FPSShooter writes camera.position; read from there if no other.
        const c = this.fpsShooter?.camera;
        if (c?.position) return { x: c.position.x, y: c.position.y, z: c.position.z };
        return { x: 0, y: 0, z: 0 };
    }
}
