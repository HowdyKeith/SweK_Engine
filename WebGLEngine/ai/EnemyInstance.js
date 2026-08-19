// ai/EnemyInstance.js
//
// Port of VBA EnemyInstance.cls — represents one enemy in the
// neural-evolution swarm. Wraps:
//
//   * an engine entity (the visible mesh)
//   * a NeuralEnemyBrain (the genome)
//   * position, velocity, health
//   * fitness tracking (used by EnemyEvolutionManager to decide
//     which brains reproduce when one dies)
//
// Per-frame update:
//   1. Compute 8-element input vector from world state
//   2. Brain forward pass → (steerX, steerZ, speedMod)
//   3. Apply steering to velocity, cap speed, integrate position
//   4. Update fitness metrics
//   5. Push position/yaw to the renderer via router

import { NeuralEnemyBrain } from "./NeuralEnemyBrain.js";
import { PheromoneField } from "./PheromoneField.js";

const MAX_HEALTH      = 100;
const MAX_SPEED       = 11.0;
const ATTACK_RANGE    = 4.5;
const TAG_HOLD_TIME   = 1.0;     // sec near player to score a "tag"
const VISION_RADIUS   = 18;
const VISION_SQ       = VISION_RADIUS * VISION_RADIUS;

let nextId = 1;

export class EnemyInstance {
    constructor(opts = {}) {
        this.id = nextId++;
        this.brain = opts.brain ?? new NeuralEnemyBrain();
        this.entityId = null;       // assigned by manager when spawned
        this.kind = opts.kind ?? "alien_hostile";
        this.usePheromone = !!opts.usePheromone;   // round 145 — opt-in scent sensing

        // Position + velocity
        this.x = opts.x ?? 0;
        this.y = opts.y ?? 35;
        this.z = opts.z ?? 0;
        this.vx = (Math.random() - 0.5) * 4;
        this.vy = 0;
        this.vz = (Math.random() - 0.5) * 4;
        this.yaw = Math.random() * Math.PI * 2;

        this.health = MAX_HEALTH;
        this.alive = true;
        this.dead = false;

        // Fitness
        this.tagsScored      = 0;        // times "touched" player
        this.timeAlive       = 0;
        this.minDistToPlayer = Infinity; // best approach
        this.tagHoldTime     = 0;        // seconds within attack range
        this.cumulativeDamage = 0;       // damage taken across life

        // Reusable input buffer
        this._inputs = new Float32Array(8);

        // ID of the parent brain for lineage tracking
        this.lineageId = nextId;
    }

    // Compute the 8-input feature vector from world state. This is
    // where the VBA placeholders (inputs 1-4) get filled with actual
    // signals.
    _buildInputs(player, neighbors) {
        // (1-3) Direction to player. Encoded as (dist_norm, dx_norm, dz_norm)
        // so the brain learns both "how far" and "which way".
        const dx = player.x - this.x;
        const dz = player.z - this.z;
        const distSq = dx * dx + dz * dz;
        const dist = Math.sqrt(distSq);
        const distNorm = Math.max(0, Math.min(1, 1 - dist / 60));   // 1 at 0u, 0 at 60u+
        let dxN = 0, dzN = 0;
        if (dist > 0.01) {
            dxN = dx / Math.max(dist, 1);    // direction, normalized to [-1,+1]
            dzN = dz / Math.max(dist, 1);
        }
        this._inputs[0] = distNorm;
        this._inputs[1] = dxN;
        this._inputs[2] = dzN;

        // (4) Neighbor density — count of swarm-mates within VISION_RADIUS.
        // Lets the brain learn flocking or dispersal as an emergent
        // strategy ("when surrounded, do X").
        let nCount = 0;
        for (const n of neighbors) {
            if (n === this) continue;
            const ndx = n.x - this.x, ndz = n.z - this.z;
            if (ndx * ndx + ndz * ndz < VISION_SQ) nCount++;
        }
        this._inputs[3] = Math.min(1, nCount / 6);   // saturates at 6 neighbors

        // (5) Health — 0 dead, 1 full
        this._inputs[4] = this.health / MAX_HEALTH;

        // (6, 7) Velocity components — normalized to [-1, +1]
        this._inputs[5] = Math.max(-1, Math.min(1, this.vx / MAX_SPEED));
        this._inputs[6] = Math.max(-1, Math.min(1, this.vz / MAX_SPEED));

        // (8) Random noise OR pheromone gradient. Constructor option
        // usePheromone=true swaps in a real environmental signal from
        // the shared scent field — lets evolution discover trail-
        // following strategies. Default false preserves the original
        // VBA semantics where input 8 was pure exploration noise.
        if (this.usePheromone) {
            const [gx, gz] = PheromoneField.shared().sampleGradient(this.x, this.z);
            // Project gradient onto enemy's heading axis so the input
            // encodes "is scent ahead of me getting stronger?" rather
            // than raw world-space gradient. Range roughly ±1.
            const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
            const projected = fx * gx + fz * gz;
            // Gradient magnitudes are small (~0.01 per cell of scent
            // difference); scale up so it actually drives the network.
            this._inputs[7] = Math.max(-1, Math.min(1, projected * 40));
        } else {
            this._inputs[7] = Math.random();
        }
    }

    // Update one frame. player is {x, y, z}, neighbors is the array
    // of all other EnemyInstances (used for density input).
    update(dt, player, neighbors, ctx) {
        if (!this.alive) return;
        if (dt > 0.1) dt = 0.1;
        this.timeAlive += dt;

        this._buildInputs(player, neighbors);
        const out = this.brain.think(this._inputs);
        const steerX  = out[0];
        const steerZ  = out[1];
        const speedMod = out[2];

        // Apply steering to velocity. Aggression scales how strongly
        // the steering vector is integrated — higher aggression =
        // sharper turns. (Matches VBA EnemyInstance.Update.)
        const aggression = 1.6;
        this.vx += steerX * aggression * dt * 4;
        this.vz += steerZ * aggression * dt * 4;

        // speedMod ∈ approximately [-2..+2] from random initial weights;
        // map to a speed multiplier in [0.5, 1.5].
        const speedMul = Math.max(0.5, Math.min(1.5, 1 + speedMod * 0.2));
        const maxSpeed = MAX_SPEED * speedMul;

        // Cap velocity magnitude
        const speed = Math.hypot(this.vx, this.vz);
        if (speed > maxSpeed) {
            this.vx = this.vx / speed * maxSpeed;
            this.vz = this.vz / speed * maxSpeed;
        }

        // Integrate position
        this.x += this.vx * dt;
        this.z += this.vz * dt;
        // Stick to terrain
        this.y = (ctx.getSurfaceY?.(this.x, this.z) ?? 30) + 2.2;

        // Heading from velocity
        if (Math.abs(this.vx) > 0.05 || Math.abs(this.vz) > 0.05) {
            this.yaw = Math.atan2(this.vx, this.vz);
        }

        // Fitness: track closest approach + tag holds + total damage
        const dxP = player.x - this.x;
        const dzP = player.z - this.z;
        const dToPlayer = Math.hypot(dxP, dzP);
        if (dToPlayer < this.minDistToPlayer) this.minDistToPlayer = dToPlayer;
        if (dToPlayer < ATTACK_RANGE) {
            this.tagHoldTime += dt;
            if (this.tagHoldTime >= TAG_HOLD_TIME) {
                this.tagsScored++;
                this.tagHoldTime = 0;
                this.health -= 20;   // each tag costs HP — encourages exploration over camping
                if (this.health <= 0) {
                    this.alive = false;
                    this.dead = true;
                }
            }
        } else {
            // Drain tag-hold time when away from player so it has to
            // be a sustained press
            this.tagHoldTime = Math.max(0, this.tagHoldTime - dt * 0.5);
        }

        // Push to renderer
        ctx.router?.exec?.({
            type: "entity:move",
            id:   this.entityId,
            x: this.x, y: this.y, z: this.z,
            yaw: this.yaw,
        });
    }

    // Fitness = sum of weighted contributions. Higher = better hunter.
    // Used by EvolutionManager to pick a parent for the next genome.
    fitness() {
        // Heavy bias toward actual tags (the goal); secondary credit
        // for time alive (survivors get more chances to improve);
        // small credit for close approaches even without a tag (so
        // the genome that "almost made it" can still propagate).
        const closeBonus = Math.max(0, 20 - this.minDistToPlayer);   // 20 max
        return this.tagsScored * 50 + this.timeAlive * 0.6 + closeBonus * 0.4;
    }

    despawn(ctx) {
        if (this.entityId != null) {
            ctx.despawnEntity?.(this.entityId);
            this.entityId = null;
        }
        this.alive = false;
    }
}
