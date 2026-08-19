// flip2d.mjs -- a correct 2D FLIP/PIC fluid solver on a staggered MAC grid, in plain JS. This is the
// REFERENCE implementation: the WebGPU/WGSL demo (fluid-webgpu.html) mirrors this exact algorithm pass for
// pass, so this file is what pins the physics. It runs headless, so its correctness is unit-tested
// (divergence collapses after the pressure solve, a dropped block of fluid settles, no particles escape).
//
// MAC grid, cell size h. u sits on vertical faces ((nx+1) x ny), v on horizontal faces (nx x (ny+1)),
// pressure/marker at cell centers (nx x ny). A one-cell SOLID border walls the domain. The step is the
// classic hybrid: P2G splat -> save grid velocity -> gravity -> boundaries -> mark fluid -> pressure
// projection (Jacobi) -> G2P with a FLIP/PIC blend -> advect. FLIP adds the grid-velocity CHANGE back to the
// particle (lively, low dissipation); PIC replaces it (stable, damped); we blend, the standard trick.
//
// ST-FLIP SEAM: advect() and the P2G weight are the two spots the SIGGRAPH 2026 spacetime plug-in touches
// (a sub-step time offset per particle + a temporal kernel term). They're isolated + commented so the
// large-time-step extension can drop in without disturbing the projection core.
"use strict";

import { PoissonMG } from "./multigrid.mjs";

const AIR = 0, FLUID = 1, SOLID = 2;

class Flip2D {
    constructor(nx, ny, opts = {}) {
        this.nx = nx; this.ny = ny; this.h = opts.h || 1.0;
        this.gravity = opts.gravity != null ? opts.gravity : -9.81;
        this.twoWay = opts.twoWay != null ? opts.twoWay : true;            // fluid pushes bodies back (buoyancy + drag)
        this.forcesAfterProject = opts.forcesAfterProject === true;   // v3806 -- declared plant, default OFF
        this.forceScale = opts.forceScale != null ? opts.forceScale : 1.0; // calibration for the fluid->body force
        this.flipRatio = opts.flipRatio != null ? opts.flipRatio : 0.95;   // 0=pure PIC, 1=pure FLIP
        this.iters = opts.iters || 60;                                     // pressure iterations
        this.gpuDevice = opts.gpuDevice || null;   // v3225: only "mggpu" uses it, and that solver REFUSES without one
        this.solver = opts.solver || "jacobi";                             // "jacobi" (robust default) | "rbgs" (red-black GS + SOR: faster on larger/well-posed solves, the multigrid smoother)
        this.omega = opts.omega != null ? opts.omega : 1.7;                // SOR over-relaxation (1=plain GS; ~1.7 near-optimal here)
        this.overRelax = opts.overRelax != null ? opts.overRelax : 1.0;
        this.stflip = opts.stflip || false;                                // ST-FLIP: motion-blur the P2G deposit across the time-slab
        this.stSubsteps = opts.stSubsteps || 4;                            // trajectory sub-samples per particle when stflip is on

        this.u = new Float32Array((nx + 1) * ny);
        this.v = new Float32Array(nx * (ny + 1));
        this.uPrev = new Float32Array((nx + 1) * ny);
        this.vPrev = new Float32Array(nx * (ny + 1));
        this.du = new Float32Array((nx + 1) * ny);   // P2G weight accumulators
        this.dv = new Float32Array(nx * (ny + 1));
        this.p = new Float32Array(nx * ny);
        this.pNew = new Float32Array(nx * ny);
        this.type = new Uint8Array(nx * ny);
        this.div = new Float32Array(nx * ny);
        // --- rigid coupling (one-way: bodies move the fluid) ---
        this.staticType = new Uint8Array(nx * ny);          // border solids only; rebuilt into `type` each frame
        this.solidU = new Float32Array((nx + 1) * ny);      // prescribed velocity on solid faces (0 = static wall, else body velocity)
        this.solidV = new Float32Array(nx * (ny + 1));
        this.bodyId = new Int16Array(nx * ny).fill(-1);     // which body occupies each cell, or -1
        this.bodies = [];                                   // rigid bodies

        this.px = []; this.py = []; this.pvx = []; this.pvy = [];   // particles
        this._resetSolids();
    }

    // --- indexing (u: (nx+1) x ny, v: nx x (ny+1), center: nx x ny) ---
    ui(i, j) { return i + j * (this.nx + 1); }
    vi(i, j) { return i + j * this.nx; }
    ci(i, j) { return i + j * this.nx; }

    _resetSolids() {
        const { nx, ny } = this;
        for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
            const s = (i === 0 || j === 0 || i === nx - 1 || j === ny - 1) ? SOLID : AIR;
            this.staticType[this.ci(i, j)] = s; this.type[this.ci(i, j)] = s;
        }
    }

    // ---- rigid bodies (one-way coupling): each body is a moving SOLID that the fluid splashes off ----
    addBox(x, y, hw, hh, opts = {}) { const b = { type: "box", x, y, hw, hh, angle: opts.angle || 0, vx: opts.vx || 0, vy: opts.vy || 0, omega: opts.omega || 0, mass: opts.mass != null ? opts.mass : 4 * hw * hh, fixed: !!opts.fixed, restitution: opts.restitution != null ? opts.restitution : 0.2 }; this.bodies.push(b); return b; }
    addCircle(x, y, r, opts = {}) { const b = { type: "circle", x, y, r, angle: 0, vx: opts.vx || 0, vy: opts.vy || 0, omega: opts.omega || 0, mass: opts.mass != null ? opts.mass : Math.PI * r * r, fixed: !!opts.fixed, restitution: opts.restitution != null ? opts.restitution : 0.2 }; this.bodies.push(b); return b; }

    _bodyContains(b, wx, wy) {
        if (b.type === "circle") { const dx = wx - b.x, dy = wy - b.y; return dx * dx + dy * dy <= b.r * b.r; }
        const ca = Math.cos(-b.angle), sa = Math.sin(-b.angle), dx = wx - b.x, dy = wy - b.y;
        const lx = dx * ca - dy * sa, ly = dx * sa + dy * ca;
        return Math.abs(lx) <= b.hw && Math.abs(ly) <= b.hh;
    }
    // velocity of the rigid body at a world point: v + omega x r  (2D: omega*(-ry, rx))
    _bodyVelAt(b, wx, wy) { const rx = wx - b.x, ry = wy - b.y; return [b.vx - b.omega * ry, b.vy + b.omega * rx]; }
    // push a point out of the body to its nearest surface; returns [nx,ny,surfx,surfy] or null
    _bodyEject(b, wx, wy) {
        if (b.type === "circle") { const dx = wx - b.x, dy = wy - b.y, d = Math.hypot(dx, dy) || 1e-6; if (d >= b.r) return null; const nx = dx / d, ny = dy / d; return [nx, ny, b.x + nx * b.r, b.y + ny * b.r]; }
        const ca = Math.cos(-b.angle), sa = Math.sin(-b.angle), dx = wx - b.x, dy = wy - b.y;
        let lx = dx * ca - dy * sa, ly = dx * sa + dy * ca;
        if (Math.abs(lx) > b.hw || Math.abs(ly) > b.hh) return null;
        const px = b.hw - Math.abs(lx), py = b.hh - Math.abs(ly);   // penetration depth per axis
        let lnx = 0, lny = 0, sx = lx, sy = ly;
        if (px < py) { lnx = Math.sign(lx) || 1; sx = b.hw * lnx; } else { lny = Math.sign(ly) || 1; sy = b.hh * lny; }
        const c = Math.cos(b.angle), s = Math.sin(b.angle);   // rotate normal + surface point back to world
        return [lnx * c - lny * s, lnx * s + lny * c, b.x + (sx * c - sy * s), b.y + (sx * s + sy * c)];
    }
    // one-way body kinematics: gravity + integrate + bounce off domain walls (fluid does NOT push back yet)
    _stepBodies(dt) {
        const { nx, ny, h } = this;
        for (const b of this.bodies) {
            if (b.fixed) continue;
            b.vy += this.gravity * dt;
            b.x += b.vx * dt; b.y += b.vy * dt; b.angle += b.omega * dt;
            const rad = b.type === "circle" ? b.r : Math.hypot(b.hw, b.hh);
            const lo = h + rad, hiX = (nx - 1) * h - rad, hiY = (ny - 1) * h - rad;
            if (b.x < lo) { b.x = lo; b.vx = -b.vx * b.restitution; } if (b.x > hiX) { b.x = hiX; b.vx = -b.vx * b.restitution; }
            if (b.y < lo) { b.y = lo; b.vy = -b.vy * b.restitution; } if (b.y > hiY) { b.y = hiY; b.vy = -b.vy * b.restitution; }
        }
    }
    // stamp bodies into the type grid as SOLID and prescribe the solid-face velocities to the body velocity
    _stampBodies() {
        const { nx, ny, h } = this;
        this.solidU.fill(0); this.solidV.fill(0); this.bodyId.fill(-1);
        if (this.bodies.length === 0) return;
        for (let j = 1; j < ny - 1; j++) for (let i = 1; i < nx - 1; i++) {
            const cx = (i + 0.5) * h, cy = (j + 0.5) * h;
            for (let bi = 0; bi < this.bodies.length; bi++) {
                if (this._bodyContains(this.bodies[bi], cx, cy)) { const c = this.ci(i, j); this.type[c] = SOLID; this.bodyId[c] = bi; break; }
            }
        }
        // set prescribed velocity on faces adjacent to a body cell (body velocity at the face position)
        for (let j = 0; j < ny; j++) for (let i = 0; i <= nx; i++) {
            const bl = i > 0 ? this.bodyId[this.ci(i - 1, j)] : -1, br = i < nx ? this.bodyId[this.ci(i, j)] : -1;
            const bid = br >= 0 ? br : bl; if (bid < 0) continue;
            this.solidU[this.ui(i, j)] = this._bodyVelAt(this.bodies[bid], i * h, (j + 0.5) * h)[0];
        }
        for (let j = 0; j <= ny; j++) for (let i = 0; i < nx; i++) {
            const bd = j > 0 ? this.bodyId[this.ci(i, j - 1)] : -1, bu = j < ny ? this.bodyId[this.ci(i, j)] : -1;
            const bid = bu >= 0 ? bu : bd; if (bid < 0) continue;
            this.solidV[this.vi(i, j)] = this._bodyVelAt(this.bodies[bid], (i + 0.5) * h, j * h)[1];
        }
    }

    addParticle(x, y, vx = 0, vy = 0) { this.px.push(x); this.py.push(y); this.pvx.push(vx); this.pvy.push(vy); }
    // Fill a rectangle (world units) with a jittered particle grid (~4 per cell).
    fillBlock(x0, y0, x1, y1, perCell = 2, rng = Math.random) {
        const step = this.h / perCell;
        for (let y = y0 + step * 0.5; y < y1; y += step)
            for (let x = x0 + step * 0.5; x < x1; x += step)
                this.addParticle(x + (rng() - 0.5) * step * 0.5, y + (rng() - 0.5) * step * 0.5);
    }
    count() { return this.px.length; }

    // v3225 -- *** step() IS async AND THE SYNCHRONOUS PATHS STILL COMPLETE SYNCHRONOUSLY, WHICH IS WHY THIS IS
    // SAFE TO DO BEFORE ANYBODY HAS DECIDED TO USE THE GPU. *** An async function runs its body eagerly up to
    // the first await; the jacobi / rbgs / mgpcg branches contain none, so a caller that does NOT await gets
    // exactly the behaviour it got before -- every field mutated, in order, before step() returns. Only the
    // "mggpu" branch actually suspends.
    //
    // THAT PROPERTY IS GATED (flip2dAsync-selfcheck) RATHER THAN ASSUMED, because it is the whole argument for
    // wiring this now: fluid-rigid-2d.html can keep calling sim.step(1/60) unchanged, and nobody pays the async
    // cost until they ask for the device.
    //
    // *** THE DEFAULT IS UNCHANGED ON PURPOSE, which is this tree's own precedent: v2579 put the greedy mesher
    // behind ?mesher=greedy and left the default alone with the reason written down -- "PROVEN CORRECT and LOOKS
    // RIGHT ON A SCREEN ARE DIFFERENT CLAIMS". The same applies here with a different word for right: multigrid
    // .html measures whether the device path is FASTER, and until somebody runs it on a GPU there is no reason
    // to make anybody pay for an await. ***
    async step(dt) {
        this._stepBodies(dt);                             // gravity + integrate + wall bounce (velocity carries last frame's fluid force)
        this._p2g(dt);
        this.uPrev.set(this.u); this.vPrev.set(this.v);   // for the FLIP delta
        // *** v3806 -- `forcesAfterProject` IS A DECLARED PLANT, DEFAULTING OFF. Gravity must reach the grid
        // BEFORE the projection, or the projection never sees it and no hydrostatic gradient can develop. It is
        // the classic operator-splitting error and the same shape v3790 found in MPM's grid step -- the SAME
        // LINES in a DIFFERENT ORDER, which is why reading the code does not catch it. ***
        if (!this.forcesAfterProject) this._addForces(dt);
        this._markFluid();                                // rebuild type from static grid + particles
        this._stampBodies();                              // stamp body cells SOLID + prescribe their face velocities
        this._setSolidVel();                              // apply prescribed velocities (0 static / body velocity)
        await this._project(dt);
        if (this.forcesAfterProject) this._addForces(dt);   // the plant: too late to be projected
        if (this.twoWay) this._applyFluidForce(dt);       // TWO-WAY: integrate pressure over each body -> buoyancy + drag
        this._setSolidVel();
        this._g2p();
        this._advect(dt);                                 // includes body ejection (no-penetration)
    }

    // integrate the fluid pressure over each body's submerged faces -> net force + torque, applied to the body.
    // A body-solid face shared with a FLUID cell feels that cell's pressure pushing INTO the body; summed over the
    // surface this is buoyancy (higher pressure below) + form drag. Torque = r x F about the body center.
    _applyFluidForce(dt) {
        const { nx, ny } = this;
        for (const b of this.bodies) { b._fx = 0; b._fy = 0; b._tau = 0; }
        for (let j = 0; j < ny; j++) for (let i = 1; i < nx; i++) {              // u-faces (normal +/-x)
            const A = this.ci(i - 1, j), B = this.ci(i, j), bidA = this.bodyId[A], bidB = this.bodyId[B];
            if (bidA >= 0 && this.type[B] === FLUID) { const b = this.bodies[bidA], F = -this.p[B]; b._fx += F; b._tau += -((j + 0.5) - b.y) * F; }
            else if (bidB >= 0 && this.type[A] === FLUID) { const b = this.bodies[bidB], F = this.p[A]; b._fx += F; b._tau += -((j + 0.5) - b.y) * F; }
        }
        for (let j = 1; j < ny; j++) for (let i = 0; i < nx; i++) {              // v-faces (normal +/-y)
            const A = this.ci(i, j - 1), B = this.ci(i, j), bidA = this.bodyId[A], bidB = this.bodyId[B];
            if (bidA >= 0 && this.type[B] === FLUID) { const b = this.bodies[bidA], F = -this.p[B]; b._fy += F; b._tau += ((i + 0.5) - b.x) * F; }
            else if (bidB >= 0 && this.type[A] === FLUID) { const b = this.bodies[bidB], F = this.p[A]; b._fy += F; b._tau += ((i + 0.5) - b.x) * F; }
        }
        const s = this.forceScale;   // grid pressure p equals the physical pressure (rho=1, h=1), so force = sum of p over faces
        for (const b of this.bodies) {
            if (b.fixed) continue;
            const I = b.type === "circle" ? Math.max(1e-6, b.mass * b.r * b.r / 2) : Math.max(1e-6, b.mass * (b.hw * b.hw + b.hh * b.hh) / 3);
            b.vx += s * b._fx / b.mass * dt; b.vy += s * b._fy / b.mass * dt; b.omega += s * b._tau / I * dt;
        }
    }

    // ---- Particle -> Grid (bilinear splat into velocity numerator + weight denominator) ----
    _p2g(dt = 1 / 60) {
        const { nx, ny, h } = this;
        this.u.fill(0); this.v.fill(0); this.du.fill(0); this.dv.fill(0);
        const S = this.stflip ? this.stSubsteps : 1;
        for (let k = 0; k < this.px.length; k++) {
            const vx = this.pvx[k], vy = this.pvy[k];
            if (S === 1) {
                const x = this.px[k] / h, y = this.py[k] / h;
                this._splat(this.u, this.du, nx + 1, ny, x, y - 0.5, vx, 1);      // u-faces at (i, j+0.5)
                this._splat(this.v, this.dv, nx, ny + 1, x - 0.5, y, vy, 1);      // v-faces at (i+0.5, j)
            } else {
                // ST-FLIP SEAM: motion-blur the deposit across the time-slab. Splat the particle at S sub-positions
                // along its trajectory -- its position at time tau in [0,dt) -- each carrying 1/S of the weight, so
                // the grid receives a TIME-INTEGRATED velocity field instead of an instantaneous snapshot. A per-
                // particle low-discrepancy jitter decorrelates the sub-samples. At large dt this antialiases the
                // transfer (a fast particle no longer skips grid cells between old and new position), which is the
                // essence of the SIGGRAPH 2026 ST-FLIP large-time-step technique, in plug-in form.
                const jit = (k * 0.6180339887498949) % 1, invS = 1 / S;
                for (let s = 0; s < S; s++) {
                    const tau = (s + jit) * invS * dt;
                    const x = (this.px[k] + tau * vx) / h, y = (this.py[k] + tau * vy) / h;
                    this._splat(this.u, this.du, nx + 1, ny, x, y - 0.5, vx, invS);
                    this._splat(this.v, this.dv, nx, ny + 1, x - 0.5, y, vy, invS);
                }
            }
        }
        for (let n = 0; n < this.u.length; n++) if (this.du[n] > 0) this.u[n] /= this.du[n];
        for (let n = 0; n < this.v.length; n++) if (this.dv[n] > 0) this.v[n] /= this.dv[n];
    }
    _splat(field, wsum, w, hgt, gx, gy, val, wscale) {
        const i0 = Math.floor(gx), j0 = Math.floor(gy);
        const fx = gx - i0, fy = gy - j0;
        for (let dj = 0; dj <= 1; dj++) for (let di = 0; di <= 1; di++) {
            const i = i0 + di, j = j0 + dj; if (i < 0 || j < 0 || i >= w || j >= hgt) continue;
            const wt = (di ? fx : 1 - fx) * (dj ? fy : 1 - fy) * wscale;
            const idx = i + j * w; field[idx] += wt * val; wsum[idx] += wt;
        }
    }
    _sample(field, w, hgt, gx, gy) {   // bilinear sample of a face field
        let i0 = Math.floor(gx), j0 = Math.floor(gy);
        const fx = gx - i0, fy = gy - j0; let s = 0;
        for (let dj = 0; dj <= 1; dj++) for (let di = 0; di <= 1; di++) {
            let i = i0 + di, j = j0 + dj; i = Math.max(0, Math.min(w - 1, i)); j = Math.max(0, Math.min(hgt - 1, j));
            s += (di ? fx : 1 - fx) * (dj ? fy : 1 - fy) * field[i + j * w];
        }
        return s;
    }

    _addForces(dt) { for (let n = 0; n < this.v.length; n++) this.v[n] += this.gravity * dt; }

    _markFluid() {
        const { nx, ny, h } = this;
        this.type.set(this.staticType);   // border solid + interior air (body solids re-stamped afterward)
        for (let k = 0; k < this.px.length; k++) {
            const i = Math.floor(this.px[k] / h), j = Math.floor(this.py[k] / h);
            if (i > 0 && j > 0 && i < nx - 1 && j < ny - 1) { const c = this.ci(i, j); if (this.type[c] !== SOLID) this.type[c] = FLUID; }
        }
    }

    // set every solid-adjacent face to its prescribed velocity (0 for static walls, body velocity for body faces)
    _setSolidVel() {
        const { nx, ny } = this;
        for (let j = 0; j < ny; j++) for (let i = 0; i <= nx; i++) {
            const left = i > 0 ? this.type[this.ci(i - 1, j)] : SOLID, right = i < nx ? this.type[this.ci(i, j)] : SOLID;
            if (left === SOLID || right === SOLID) this.u[this.ui(i, j)] = this.solidU[this.ui(i, j)];
        }
        for (let j = 0; j <= ny; j++) for (let i = 0; i < nx; i++) {
            const down = j > 0 ? this.type[this.ci(i, j - 1)] : SOLID, up = j < ny ? this.type[this.ci(i, j)] : SOLID;
            if (down === SOLID || up === SOLID) this.v[this.vi(i, j)] = this.solidV[this.vi(i, j)];
        }
    }

    // ---- Pressure projection: solve Laplacian(p) = div/dt for fluid cells (Jacobi), then subtract grad p ----
    async _project(dt) {
        const { nx, ny } = this;
        // WARM START: keep last frame's pressure as the initial guess instead of zeroing. Fluid pressure is
        // temporally coherent, so Jacobi converges far faster frame-to-frame (non-fluid cells are re-zeroed
        // inside the sweep; stale solid/border values are never read by the stencil). The WGSL demo keeps a
        // persistent pressure texture for the same reason.
        // divergence of each fluid cell
        for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
            const c = this.ci(i, j);
            this.div[c] = (this.type[c] === FLUID)
                ? (this.u[this.ui(i + 1, j)] - this.u[this.ui(i, j)] + this.v[this.vi(i, j + 1)] - this.v[this.vi(i, j)]) : 0;
        }
        const invDt = 1.0 / dt;
        // v3225 -- THE DEVICE BRANCH. OPT-IN, and it REFUSES rather than falling back silently: a solver that
        // quietly ran on the CPU when asked for the GPU would make multigrid.html's numbers meaningless and
        // would be the "flag that lies about which code ran" voxel-viewer already refuses to be (v2866).
        if (this.solver === "mggpu") {
            if (!this._gpuMg) {
                if (!this.gpuDevice) throw new Error("solver 'mggpu' needs a WebGPU device: pass { solver: 'mggpu', gpuDevice } -- refusing to fall back to the CPU, because a solver that silently ran somewhere else makes every timing meaningless");
                const { GpuMultigrid } = await import("./multigridGPU.js");
                this._gpuMg = new GpuMultigrid(this.gpuDevice, nx, ny, { pre: 2, post: 2 });
            }
            await this._gpuMg.solve(this.type, this.div, dt, this.p, this.mgVcycles || 8);
        } else if (this.solver === "mgpcg") {
            // Galerkin multigrid-preconditioned CG -- grid-independent, robust on solid walls + free surface.
            if (!this._mg || this._mg.levels[0].nx !== nx || this._mg.levels[0].ny !== ny) this._mg = new PoissonMG(nx, ny, { pre: 2, post: 2, omega: 1.2 });
            this._mg.solveCG(this.type, this.div, dt, this.p, { maxIters: this.mgIters || 30, tol: this.mgTol || 1e-4 });
        } else if (this.solver === "rbgs") {
            // Red-black Gauss-Seidel + SOR. Checkerboard color by (i+j) parity: every red cell depends only on
            // black neighbors and vice-versa, so a whole color updates in parallel (GPU-friendly) yet uses the
            // LATEST neighbor values within the sweep (Gauss-Seidel). SOR over-relaxation (omega) accelerates the
            // smooth low-frequency modes. This is also the standard MULTIGRID smoother -- the seam for that upgrade.
            // NOTE: unlike Jacobi, RBGS must start FRESH each frame; warm-starting poisons its in-place propagation
            // (a stale guess from the previous frame's different fluid shape spreads through the sweep). Measured:
            // warm-start RBGS residual ~0.23 vs fresh ~0.12 on the same dynamic frames.
            this.p.fill(0);
            const om = this.omega;
            for (let it = 0; it < this.iters; it++) {
                for (let color = 0; color < 2; color++) {
                    for (let j = 1; j < ny - 1; j++) for (let i = 1; i < nx - 1; i++) {
                        if (((i + j) & 1) !== color) continue;
                        const c = this.ci(i, j); if (this.type[c] !== FLUID) continue;
                        const tL = this.type[this.ci(i - 1, j)], tR = this.type[this.ci(i + 1, j)], tD = this.type[this.ci(i, j - 1)], tU = this.type[this.ci(i, j + 1)];
                        let denom = 0, sum = 0;
                        if (tL !== SOLID) { denom++; if (tL === FLUID) sum += this.p[this.ci(i - 1, j)]; }
                        if (tR !== SOLID) { denom++; if (tR === FLUID) sum += this.p[this.ci(i + 1, j)]; }
                        if (tD !== SOLID) { denom++; if (tD === FLUID) sum += this.p[this.ci(i, j - 1)]; }
                        if (tU !== SOLID) { denom++; if (tU === FLUID) sum += this.p[this.ci(i, j + 1)]; }
                        if (denom > 0) { const gs = (sum - this.div[c] * invDt) / denom; this.p[c] += om * (gs - this.p[c]); }
                    }
                }
            }
        } else {
            for (let it = 0; it < this.iters; it++) {
                for (let j = 1; j < ny - 1; j++) for (let i = 1; i < nx - 1; i++) {
                    const c = this.ci(i, j); if (this.type[c] !== FLUID) { this.pNew[c] = 0; continue; }
                    const tL = this.type[this.ci(i - 1, j)], tR = this.type[this.ci(i + 1, j)], tD = this.type[this.ci(i, j - 1)], tU = this.type[this.ci(i, j + 1)];
                    let denom = 0, sum = 0;
                    if (tL !== SOLID) { denom++; if (tL === FLUID) sum += this.p[this.ci(i - 1, j)]; }
                    if (tR !== SOLID) { denom++; if (tR === FLUID) sum += this.p[this.ci(i + 1, j)]; }
                    if (tD !== SOLID) { denom++; if (tD === FLUID) sum += this.p[this.ci(i, j - 1)]; }
                    if (tU !== SOLID) { denom++; if (tU === FLUID) sum += this.p[this.ci(i, j + 1)]; }
                    this.pNew[c] = denom > 0 ? (sum - this.div[c] * invDt) / denom * this.overRelax : 0;
                }
                const tmp = this.p; this.p = this.pNew; this.pNew = tmp;
            }
        }
        // subtract pressure gradient -> divergence-free (only across non-solid faces)
        for (let j = 0; j < ny; j++) for (let i = 1; i < nx; i++) {
            const cL = this.ci(i - 1, j), cR = this.ci(i, j);
            if (this.type[cL] === SOLID || this.type[cR] === SOLID) continue;
            if (this.type[cL] === FLUID || this.type[cR] === FLUID) this.u[this.ui(i, j)] -= dt * (this.p[cR] - this.p[cL]);
        }
        for (let j = 1; j < ny; j++) for (let i = 0; i < nx; i++) {
            const cD = this.ci(i, j - 1), cU = this.ci(i, j);
            if (this.type[cD] === SOLID || this.type[cU] === SOLID) continue;
            if (this.type[cD] === FLUID || this.type[cU] === FLUID) this.v[this.vi(i, j)] -= dt * (this.p[cU] - this.p[cD]);
        }
    }

    // ---- Grid -> Particle (FLIP/PIC blend) ----
    _g2p() {
        const { nx, ny, h } = this;
        for (let k = 0; k < this.px.length; k++) {
            const x = this.px[k] / h, y = this.py[k] / h;
            const picU = this._sample(this.u, nx + 1, ny, x, y - 0.5);
            const picV = this._sample(this.v, nx, ny + 1, x - 0.5, y);
            const duG = picU - this._sample(this.uPrev, nx + 1, ny, x, y - 0.5);
            const dvG = picV - this._sample(this.vPrev, nx, ny + 1, x - 0.5, y);
            const flipU = this.pvx[k] + duG, flipV = this.pvy[k] + dvG;
            this.pvx[k] = this.flipRatio * flipU + (1 - this.flipRatio) * picU;
            this.pvy[k] = this.flipRatio * flipV + (1 - this.flipRatio) * picV;
        }
    }

    // ---- Advection (RK2) + wall collisions. ST-FLIP's per-particle time offset would enter here. ----
    _advect(dt) {
        const { nx, ny, h } = this;
        const lo = 1.001 * h, hiX = (nx - 1.001) * h, hiY = (ny - 1.001) * h;
        for (let k = 0; k < this.px.length; k++) {
            // RK2 midpoint using the grid velocity field
            const gx = this.px[k] / h, gy = this.py[k] / h;
            const um = this._sample(this.u, nx + 1, ny, gx, gy - 0.5), vm = this._sample(this.v, nx, ny + 1, gx - 0.5, gy);
            const mx = this.px[k] + 0.5 * dt * um, my = this.py[k] + 0.5 * dt * vm;
            const gmx = mx / h, gmy = my / h;
            const u2 = this._sample(this.u, nx + 1, ny, gmx, gmy - 0.5), v2 = this._sample(this.v, nx, ny + 1, gmx - 0.5, gmy);
            let x = this.px[k] + dt * u2, y = this.py[k] + dt * v2;
            if (x < lo) { x = lo; if (this.pvx[k] < 0) this.pvx[k] = 0; }
            if (x > hiX) { x = hiX; if (this.pvx[k] > 0) this.pvx[k] = 0; }
            if (y < lo) { y = lo; if (this.pvy[k] < 0) this.pvy[k] = 0; }
            if (y > hiY) { y = hiY; if (this.pvy[k] > 0) this.pvy[k] = 0; }
            // eject from rigid bodies (no-penetration): push to the surface, kill inward relative velocity, keep slip
            for (let bi = 0; bi < this.bodies.length; bi++) {
                const ej = this._bodyEject(this.bodies[bi], x, y);
                if (!ej) continue;
                const [enx, eny, sx, sy] = ej;
                x = sx + enx * 0.01 * h; y = sy + eny * 0.01 * h;
                const bv = this._bodyVelAt(this.bodies[bi], x, y);
                const vn = (this.pvx[k] - bv[0]) * enx + (this.pvy[k] - bv[1]) * eny;
                if (vn < 0) { this.pvx[k] -= vn * enx; this.pvy[k] -= vn * eny; }
            }
            this.px[k] = x; this.py[k] = y;
        }
    }

    // diagnostics for the tests
    maxDivergence() {
        const { nx, ny } = this; let m = 0;
        for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
            const c = this.ci(i, j); if (this.type[c] !== FLUID) continue;
            const d = Math.abs(this.u[this.ui(i + 1, j)] - this.u[this.ui(i, j)] + this.v[this.vi(i, j + 1)] - this.v[this.vi(i, j)]);
            if (d > m) m = d;
        }
        return m;
    }
    meanSpeed() { let s = 0; for (let k = 0; k < this.px.length; k++) s += Math.hypot(this.pvx[k], this.pvy[k]); return this.px.length ? s / this.px.length : 0; }
    inBounds() { const { nx, ny, h } = this; for (let k = 0; k < this.px.length; k++) { if (this.px[k] <= 0 || this.py[k] <= 0 || this.px[k] >= nx * h || this.py[k] >= ny * h) return false; } return true; }
}

export { Flip2D, AIR, FLUID, SOLID };
if (typeof module !== "undefined" && module.exports) module.exports = { Flip2D, AIR, FLUID, SOLID };
