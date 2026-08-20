// Round 39 — Conway's Game of Life rendered into the voxel grid.
// Uses a 2D grid laid flat at fixed Y. Live cells are MEMORY voxels
// (cyan-emissive), dead cells are AIR. Updates at ~3 Hz so the
// pattern is visible to a human eye.

const LIFE_VOXEL = 30;          // MEMORY — cyan-emissive
const AIR = 0;

export class LifeDemo {
    constructor({ world }) {
        this.world = world;
        this.active = false;
        this.size = 64;             // grid dimension (NxN)
        this.tickInterval = 0.33;   // seconds between generations
        this._tickT = 0;
        this.baseY = 30;            // height above terrain to render
        this.originX = -32;
        this.originZ = -32;
        // Two buffers for double-buffered update
        this.gridA = new Uint8Array(this.size * this.size);
        this.gridB = new Uint8Array(this.size * this.size);
        this.current = this.gridA;
        this.next = this.gridB;
    }

    start() {
        this.stop();
        this.active = true;
        this._seed();
        this._renderAllVoxels();
        console.log(`[LIFE] ${this.size}x${this.size} grid seeded at Y=${this.baseY}`);
    }

    _seed() {
        // Random fill at ~28% density. Adds the classic glider near top-left
        // and a small bunch of pulsars for variety.
        this.current.fill(0);
        const N = this.size;
        for (let i = 0; i < N * N; i++) {
            if (Math.random() < 0.28) this.current[i] = 1;
        }
        // Glider at (5,5)
        const g = [[1,0],[2,1],[0,2],[1,2],[2,2]];
        for (const [dx, dz] of g) {
            const idx = (5 + dz) * N + (5 + dx);
            if (idx < N * N) this.current[idx] = 1;
        }
    }

    _step() {
        const N = this.size;
        for (let z = 0; z < N; z++) {
            for (let x = 0; x < N; x++) {
                let live = 0;
                for (let dz = -1; dz <= 1; dz++) {
                    for (let dx = -1; dx <= 1; dx++) {
                        if (dx === 0 && dz === 0) continue;
                        const nx = x + dx, nz = z + dz;
                        if (nx < 0 || nx >= N || nz < 0 || nz >= N) continue;
                        live += this.current[nz * N + nx];
                    }
                }
                const cell = this.current[z * N + x];
                const nextCell = cell
                    ? ((live === 2 || live === 3) ? 1 : 0)    // survive
                    : (live === 3 ? 1 : 0);                    // birth
                this.next[z * N + x] = nextCell;
            }
        }
        // Swap buffers
        const tmp = this.current;
        this.current = this.next;
        this.next = tmp;
    }

    _renderAllVoxels() {
        if (!this.world?.setVoxel) return;
        const N = this.size;
        for (let z = 0; z < N; z++) {
            for (let x = 0; x < N; x++) {
                const cell = this.current[z * N + x];
                this.world.setVoxel(
                    this.originX + x,
                    this.baseY,
                    this.originZ + z,
                    cell ? LIFE_VOXEL : AIR
                );
            }
        }
    }

    _renderDiff() {
        // Only update voxels that changed since the last generation.
        if (!this.world?.setVoxel) return;
        const N = this.size;
        for (let z = 0; z < N; z++) {
            for (let x = 0; x < N; x++) {
                const idx = z * N + x;
                const cur = this.current[idx];
                const prev = this.next[idx];          // buffer was swapped; "next" is now previous
                if (cur !== prev) {
                    this.world.setVoxel(
                        this.originX + x,
                        this.baseY,
                        this.originZ + z,
                        cur ? LIFE_VOXEL : AIR
                    );
                }
            }
        }
    }

    // v1414 — remote/pad actions.
    reseed()    { if (this.active) { this._seed(); this._renderAllVoxels(); } }
    stepOnce()  { if (this.active) { this._step(); this._renderDiff(); } }
    clearGrid() { if (this.active) { this.current.fill(0); this._renderAllVoxels(); } }
    togglePause() { this._paused = !this._paused; console.log(`[LIFE] ${this._paused ? "paused" : "running"}`); return this._paused; }

    stop() {
        if (this.active && this.world?.setVoxel) {
            // Clear the rendered grid
            const N = this.size;
            for (let z = 0; z < N; z++) {
                for (let x = 0; x < N; x++) {
                    this.world.setVoxel(
                        this.originX + x,
                        this.baseY,
                        this.originZ + z,
                        AIR
                    );
                }
            }
        }
        this.active = false;
        this._tickT = 0;
    }

    tick(dt) {
        if (!this.active || this._paused) return;   // v1414 — pause = freeze generations
        this._tickT += dt;
        if (this._tickT < this.tickInterval) return;
        this._tickT = 0;
        this._step();
        this._renderDiff();
    }
}
