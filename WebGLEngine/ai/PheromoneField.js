// ai/PheromoneField.js
//
// Singleton pheromone scent field, world-grid-aligned. Lets multiple
// AI systems share the same scent map — both pheromone_hunt and
// neural_enemies sample it, so neural-evolution enemies can develop
// "follow scent" behavior just like the hand-coded scent trackers.
//
// Single global field rather than one-per-demo for two reasons:
//   1. Memory: ~36KB per field, multiple fields = waste
//   2. Composability: any enemy AI can opt in to scent sensing
//      without re-implementing the deposit/decay loop
//
// World coverage: WORLD_SPAN x WORLD_SPAN units, centered on origin,
// GRID_SIZE x GRID_SIZE cells. Player position deposits per frame
// when activate() is called. Decay + diffusion run on tick().
//
// Both depositors and samplers go through the singleton's API:
//   PheromoneField.shared().activate();
//   PheromoneField.shared().depositAt(x, z, amount);
//   PheromoneField.shared().sampleAt(x, z);
//   PheromoneField.shared().tickGlobal(dt);
//   PheromoneField.shared().sampleGradient(x, z);  // returns [dx, dz]

const GRID_SIZE      = 96;
const WORLD_SPAN     = 240;
const CELL_SIZE      = WORLD_SPAN / GRID_SIZE;
const DECAY_PER_SEC  = 0.40;
const DIFFUSE_PER_SEC = 0.12;
const PLAYER_DEPOSIT_AMT = 0.6;
const DEPOSIT_PROXIMITY  = 1.2;  // cells

let instance = null;

export class PheromoneField {
    static shared() {
        if (!instance) instance = new PheromoneField();
        return instance;
    }

    constructor() {
        this.grid     = new Float32Array(GRID_SIZE * GRID_SIZE);
        this.gridNext = new Float32Array(GRID_SIZE * GRID_SIZE);
        this.subscribers = 0;   // refcount — clears grid when last consumer stops
        this.lastPlayer = { x: 0, z: 0 };
        this.cellSize = CELL_SIZE;
        this.size = GRID_SIZE;
        this.worldSpan = WORLD_SPAN;
        this.lastTickTime = 0;
        this.tickFrame = 0;
    }

    // Subscribe — increment refcount, return this for chaining
    subscribe() { this.subscribers++; return this; }
    // Unsubscribe — when no consumers remain, clear the grid so next
    // session starts fresh
    unsubscribe() {
        this.subscribers = Math.max(0, this.subscribers - 1);
        if (this.subscribers === 0) {
            this.grid.fill(0);
            this.gridNext.fill(0);
        }
    }

    worldToGrid(x, z) {
        const gx = ((x + WORLD_SPAN / 2) / CELL_SIZE) | 0;
        const gz = ((z + WORLD_SPAN / 2) / CELL_SIZE) | 0;
        return [gx, gz];
    }

    inBounds(gx, gz) {
        return gx >= 0 && gx < GRID_SIZE && gz >= 0 && gz < GRID_SIZE;
    }

    // Deposit pheromone at world position (x, z) with given amount,
    // spread over DEPOSIT_PROXIMITY cells with linear falloff.
    depositAt(x, z, amount) {
        const [gx, gz] = this.worldToGrid(x, z);
        const r = Math.ceil(DEPOSIT_PROXIMITY);
        for (let dz = -r; dz <= r; dz++) {
            for (let dx = -r; dx <= r; dx++) {
                const d = Math.hypot(dx, dz);
                if (d > DEPOSIT_PROXIMITY) continue;
                const ggx = gx + dx, ggz = gz + dz;
                if (!this.inBounds(ggx, ggz)) continue;
                const fall = 1 - d / DEPOSIT_PROXIMITY;
                const i = ggz * GRID_SIZE + ggx;
                this.grid[i] = Math.min(1.0, this.grid[i] + amount * fall);
            }
        }
    }

    // Sample scalar pheromone value at world position
    sampleAt(x, z) {
        const [gx, gz] = this.worldToGrid(x, z);
        if (!this.inBounds(gx, gz)) return 0;
        return this.grid[gz * GRID_SIZE + gx];
    }

    // Sample local gradient using central differences. Returns
    // [dx, dz] vector pointing UP the scent gradient (toward stronger
    // pheromone). Magnitude reflects gradient strength.
    sampleGradient(x, z) {
        const [gx, gz] = this.worldToGrid(x, z);
        if (!this.inBounds(gx + 1, gz) || !this.inBounds(gx - 1, gz) ||
            !this.inBounds(gx, gz + 1) || !this.inBounds(gx, gz - 1)) {
            return [0, 0];
        }
        const i = gz * GRID_SIZE + gx;
        const dPx = this.grid[i + 1] - this.grid[i - 1];
        const dPz = this.grid[i + GRID_SIZE] - this.grid[i - GRID_SIZE];
        return [dPx, dPz];
    }

    // Deposit the player's current position based on motion. Run from
    // any active subscriber's tick. Idempotent across multiple
    // subscribers within the same frame thanks to tickFrame guard.
    depositPlayer(player, dt, frameTag) {
        if (frameTag != null && frameTag === this.tickFrame) return;  // already done this frame
        const dx = player.x - this.lastPlayer.x;
        const dz = player.z - this.lastPlayer.z;
        const dist = Math.hypot(dx, dz);
        if (dist > 0.05) {
            const amt = Math.min(1, dist * 4) * PLAYER_DEPOSIT_AMT;
            this.depositAt(player.x, player.z, amt);
        }
        this.depositAt(player.x, player.z, PLAYER_DEPOSIT_AMT * 0.1);  // baseline
        this.lastPlayer.x = player.x;
        this.lastPlayer.z = player.z;
        if (frameTag != null) this.tickFrame = frameTag;
    }

    // Decay + diffuse the entire field. Cheap — 9216 cells, single
    // pass. Subscribers should call this exactly once per frame.
    tickGlobal(dt, frameTag) {
        if (frameTag != null && frameTag === this.lastTickTime) return;
        const decay = Math.exp(-DECAY_PER_SEC * dt);
        const diff  = DIFFUSE_PER_SEC * dt;
        const g = this.grid;
        const out = this.gridNext;
        for (let z = 0; z < GRID_SIZE; z++) {
            for (let x = 0; x < GRID_SIZE; x++) {
                const i = z * GRID_SIZE + x;
                const c = g[i];
                let n = 0; let nc = 0;
                if (x > 0)             { n += g[i - 1];         nc++; }
                if (x < GRID_SIZE - 1) { n += g[i + 1];         nc++; }
                if (z > 0)             { n += g[i - GRID_SIZE]; nc++; }
                if (z < GRID_SIZE - 1) { n += g[i + GRID_SIZE]; nc++; }
                if (nc > 0) n /= nc;
                out[i] = (c * (1 - diff) + n * diff) * decay;
            }
        }
        // Swap buffers
        const tmp = this.grid; this.grid = this.gridNext; this.gridNext = tmp;
        if (frameTag != null) this.lastTickTime = frameTag;
    }
}
