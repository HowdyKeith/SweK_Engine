// FILE: render/WaterField.js
// Heightfield water disturbance field for the VoxelEngine.
//
// What it is: a finite 2D grid of (displacement, velocity) that simulates
// ripple/wake/splash/tidal propagation on a flat resting water plane. It is
// the EVENT-DRIVEN layer that the existing WaterRenderer (ambient GPU waves
// over voxel WATER cells) cannot do on its own.
//
// What it gives you:
//   - splash(wx,wz,force)            -> expanding rings (impacts, footsteps, kaiju)
//   - tidalWave({...})               -> a bounded traveling wall of water
//   - getHeight(wx,wz)               -> absolute water-surface Y at a world point
//   - getCurrentWaterLevel()         -> the flat resting level (what creatures want)
//   - this.texture (optional, R16F)  -> sampled by WaterRenderer's vertex shader
//
// Design notes (fixes vs the original transcript version):
//   - Ping-pong height buffers: no per-frame allocation -> no GC hitching.
//   - Fixed-timestep integration: framerate-independent and stable (the original
//     mixed dt into one term only, which explodes at variable FPS).
//   - Reflecting boundaries via clamped neighbor reads (the original silently
//     reset border cells to 0, leaving a dead wall at the edges).
//   - Tidal wave is a bounded MOVING SOURCE (stamped with max()), not a per-frame
//     `height += sin()` accumulator (which grows without bound).
//
// `gl` is OPTIONAL. Omit it to run the sim headless (tests, servers, or purely
// for getHeight() driving floating/swimming entities with no visual layer).

const VOXEL_TOP_OFFSET = 1.0; // WaterRenderer renders the surface at voxelY + 1

export class WaterField {
    constructor(opts = {}) {
        this.gl = opts.gl ?? null;

        // Grid covers the world rectangle:
        //   [originX, originX + width*cellSize] x [originZ, originZ + depth*cellSize]
        this.width    = opts.width    ?? 128;   // cells along X
        this.depth    = opts.depth    ?? 128;   // cells along Z
        this.cellSize = opts.cellSize ?? 1.0;   // world units per cell
        this.originX  = opts.originX  ?? 0.0;
        this.originZ  = opts.originZ  ?? 0.0;

        // Resting water-surface Y. WaterRenderer places quads at voxelY+1, so a
        // field meant to ride on water at voxel level V should use baseLevel = V+1.
        this.baseLevel = opts.baseLevel ?? 0.0;

        // Sim tuning. These are PER FIXED-STEP coefficients (no dt multiply inside
        // the step), which is what makes the integration framerate-independent.
        this.waveSpeed = opts.waveSpeed ?? 0.18; // propagation stiffness (0..0.5)
        this.damping   = opts.damping   ?? 0.992; // energy retained per step (<1)
        this.fixedDt   = opts.fixedDt   ?? (1 / 60);
        this.maxSteps  = opts.maxSteps  ?? 4;     // cap substeps to avoid spiral

        const n = this.width * this.depth;
        this.H  = new Float32Array(n); // current displacement (ping)
        this.H2 = new Float32Array(n); // next displacement (pong)
        this.V  = new Float32Array(n); // velocity

        this._acc = 0;
        this._fronts = []; // active tidal wavefronts

        this.texture = null;
        if (this.gl) this._initTexture();
    }

    // ---- world <-> cell mapping -------------------------------------------

    _idx(x, z) { return x + z * this.width; }

    // Fractional cell coordinates for a world point (not clamped).
    _worldToCell(wx, wz) {
        return {
            fx: (wx - this.originX) / this.cellSize,
            fz: (wz - this.originZ) / this.cellSize,
        };
    }

    contains(wx, wz) {
        const { fx, fz } = this._worldToCell(wx, wz);
        return fx >= 0 && fx <= this.width - 1 && fz >= 0 && fz <= this.depth - 1;
    }

    // ---- disturbance sources ----------------------------------------------

    // Impulse at a world point. `force` is a velocity kick (positive = energetic).
    // `radius` (in cells) spreads it over a small kernel so a single splash does
    // not alias to one texel.
    splash(wx, wz, force = 1.0, radius = 1.5) {
        const { fx, fz } = this._worldToCell(wx, wz);
        if (fx < 0 || fx > this.width - 1 || fz < 0 || fz > this.depth - 1) return false;
        const cx = Math.round(fx), cz = Math.round(fz);
        const r = Math.max(0, Math.ceil(radius));
        const r2 = (radius + 0.001) * (radius + 0.001);
        for (let dz = -r; dz <= r; dz++) {
            for (let dx = -r; dx <= r; dx++) {
                const x = cx + dx, z = cz + dz;
                if (x < 0 || z < 0 || x >= this.width || z >= this.depth) continue;
                const dist2 = dx * dx + dz * dz;
                if (dist2 > r2) continue;
                const falloff = Math.exp(-dist2 / r2);
                this.V[this._idx(x, z)] += force * falloff;
            }
        }
        return true;
    }

    // A traveling wall of water entering from one edge and sweeping across.
    // Bounded by construction: it stamps a moving ridge (max), it does not add
    // energy every frame. Auto-expires when the front leaves the grid.
    //   edge: 'west'|'east'|'north'|'south'  (X- / X+ / Z- / Z+)
    //   speed: world units / second
    //   amplitude: ridge height (world units)
    //   thickness: ridge half-width (world units)
    tidalWave({ edge = 'west', speed = 12, amplitude = 6, thickness = 4 } = {}) {
        const axisIsX = (edge === 'west' || edge === 'east');
        const dir = (edge === 'west' || edge === 'north') ? 1 : -1;
        const spanWorld = axisIsX
            ? this.width * this.cellSize
            : this.depth * this.cellSize;
        const startPos = dir > 0 ? -thickness : spanWorld + thickness;
        this._fronts.push({
            axisIsX, dir,
            pos: startPos,         // world coordinate of the ridge along its axis
            speedCells: (speed * this.fixedDt) / this.cellSize,
            ampWorld: amplitude,
            thickCells: Math.max(1, thickness / this.cellSize),
            spanCells: axisIsX ? this.width : this.depth,
        });
        return this._fronts.length;
    }

    _applyFronts() {
        if (this._fronts.length === 0) return;
        const { width, depth, cellSize } = this;
        for (const f of this._fronts) {
            const ridgeCell = (f.pos / cellSize); // ridge position in cells (along axis)
            const inv2t2 = 1 / (2 * f.thickCells * f.thickCells);
            if (f.axisIsX) {
                for (let x = 0; x < width; x++) {
                    const d = x - ridgeCell;
                    const g = f.ampWorld * Math.exp(-(d * d) * inv2t2);
                    if (g < 0.01) continue;
                    for (let z = 0; z < depth; z++) {
                        const i = this._idx(x, z);
                        if (g > this.H[i]) this.H[i] = g; // moving ridge, bounded
                    }
                }
            } else {
                for (let z = 0; z < depth; z++) {
                    const d = z - ridgeCell;
                    const g = f.ampWorld * Math.exp(-(d * d) * inv2t2);
                    if (g < 0.01) continue;
                    for (let x = 0; x < width; x++) {
                        const i = this._idx(x, z);
                        if (g > this.H[i]) this.H[i] = g;
                    }
                }
            }
        }
    }

    _advanceFronts() {
        if (this._fronts.length === 0) return;
        const margin = 4;
        this._fronts = this._fronts.filter((f) => {
            f.pos += f.dir * f.speedCells * this.cellSize;
            const cell = f.pos / this.cellSize;
            return cell > -f.thickCells - margin &&
                   cell < f.spanCells + f.thickCells + margin;
        });
    }

    // ---- simulation --------------------------------------------------------

    // One fixed-timestep integration step. Reflecting boundaries via clamped reads.
    _step() {
        this._applyFronts();

        const { width, depth, H, H2, V, waveSpeed, damping } = this;
        const wM = width - 1, dM = depth - 1;
        for (let z = 0; z < depth; z++) {
            const zU = z > 0 ? z - 1 : 0;       // clamp -> reflect
            const zD = z < dM ? z + 1 : dM;
            for (let x = 0; x < width; x++) {
                const i = x + z * width;
                const xL = x > 0 ? x - 1 : 0;
                const xR = x < wM ? x + 1 : wM;
                const avg = 0.25 * (
                    H[xL + z * width] + H[xR + z * width] +
                    H[x + zU * width] + H[x + zD * width]
                );
                let v = V[i] + (avg - H[i]) * waveSpeed;
                v *= damping;
                V[i] = v;
                H2[i] = H[i] + v;
            }
        }
        // swap ping-pong
        this.H = H2;
        this.H2 = H;

        this._advanceFronts();
    }

    // Call once per frame with real elapsed seconds. Runs as many fixed steps as
    // fit, capped by maxSteps, then (if GL) uploads the disturbance texture once.
    update(dtSeconds) {
        if (!(dtSeconds > 0)) dtSeconds = this.fixedDt;
        this._acc += dtSeconds;
        let steps = 0;
        while (this._acc >= this.fixedDt && steps < this.maxSteps) {
            this._step();
            this._acc -= this.fixedDt;
            steps++;
        }
        if (steps >= this.maxSteps) this._acc = 0; // drop backlog, no spiral
        if (this.gl) this._uploadTexture();
    }

    // ---- sampling (CPU read for gameplay / entities) -----------------------

    // Ripple displacement (offset from baseLevel) at a world point. 0 outside.
    getDisplacement(wx, wz) {
        const { fx, fz } = this._worldToCell(wx, wz);
        if (fx < 0 || fx > this.width - 1 || fz < 0 || fz > this.depth - 1) return 0;
        const x0 = Math.floor(fx), z0 = Math.floor(fz);
        const x1 = Math.min(x0 + 1, this.width - 1);
        const z1 = Math.min(z0 + 1, this.depth - 1);
        const tx = fx - x0, tz = fz - z0;
        const H = this.H, w = this.width;
        const h00 = H[x0 + z0 * w], h10 = H[x1 + z0 * w];
        const h01 = H[x0 + z1 * w], h11 = H[x1 + z1 * w];
        const a = h00 + (h10 - h00) * tx;
        const b = h01 + (h11 - h01) * tx;
        return a + (b - a) * tz;
    }

    // Absolute water-surface Y at a world point (resting level + ripple).
    getHeight(wx, wz) {
        return this.baseLevel + this.getDisplacement(wx, wz);
    }

    // The flat resting water level. This is what swimming/floating creatures and
    // the aquarium code (waterSystem.getCurrentWaterLevel()) expect.
    getCurrentWaterLevel() {
        return this.baseLevel;
    }

    setBaseLevel(y) { this.baseLevel = y; }

    // Recenter the field on a moving target (e.g. the player). Clears the sim to
    // avoid smearing old ripples to new world space.
    setOrigin(originX, originZ) {
        this.originX = originX;
        this.originZ = originZ;
        this.reset();
    }

    reset() {
        this.H.fill(0); this.H2.fill(0); this.V.fill(0);
        this._fronts.length = 0;
    }

    // ---- GL disturbance texture (consumed by WaterRenderer) ----------------

    _initTexture() {
        const gl = this.gl;
        this.texture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, this.texture);
        // R16F is core-filterable in WebGL2 (no extension needed). Stores the
        // displacement field; small range so half-float precision is plenty.
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.R16F, this.width, this.depth, 0,
                      gl.RED, gl.FLOAT, this.H);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.bindTexture(gl.TEXTURE_2D, null);
    }

    _uploadTexture() {
        const gl = this.gl;
        gl.bindTexture(gl.TEXTURE_2D, this.texture);
        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, this.width, this.depth,
                         gl.RED, gl.FLOAT, this.H);
        gl.bindTexture(gl.TEXTURE_2D, null);
    }

    // World-space inverse extent — WaterRenderer uses this to map worldPos.xz to
    // a [0,1] sample UV: uv = (worldPos.xz - origin) * invSize.
    get invSizeX() { return 1 / (this.width * this.cellSize); }
    get invSizeZ() { return 1 / (this.depth * this.cellSize); }

    snapshot() {
        let peak = 0;
        for (let i = 0; i < this.H.length; i++) {
            const a = Math.abs(this.H[i]);
            if (a > peak) peak = a;
        }
        return {
            cells: this.width * this.depth,
            originX: this.originX, originZ: this.originZ,
            baseLevel: this.baseLevel,
            activeFronts: this._fronts.length,
            peakDisplacement: peak,
        };
    }

    dispose() {
        if (this.gl && this.texture) this.gl.deleteTexture(this.texture);
        this.texture = null;
    }
}
