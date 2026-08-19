// flip3d.mjs -- the 3D extension of flip2d.mjs. Same hybrid FLIP/PIC algorithm on a staggered MAC grid, with
// one more dimension: velocity components live on the three sets of cell faces, pressure at centers, a one-cell
// SOLID shell walls the box. Everything that was bilinear in 2D is trilinear here (8 neighbors instead of 4),
// the pressure stencil is 6-neighbor instead of 4, and advection carries a z component. The step pipeline is
// identical: P2G splat -> save grid velocity -> gravity -> solid boundaries -> mark fluid -> pressure projection
// (Jacobi warm-started, or red-black Gauss-Seidel + SOR fresh) -> G2P FLIP/PIC blend -> RK2 advect.
//
// Verified headless the same way as 2D: divergence collapses after projection, a dropped block settles, and no
// particle is lost. ST-FLIP's temporal seam is the same two spots (P2G weight + advection).
"use strict";

import { PoissonMG3D } from "./multigrid3d.mjs";

const AIR = 0, FLUID = 1, SOLID = 2;

class Flip3D {
    constructor(nx, ny, nz, opts = {}) {
        this.nx = nx; this.ny = ny; this.nz = nz; this.h = opts.h || 1.0;
        this.gravity = opts.gravity != null ? opts.gravity : -9.81;
        this.twoWay = opts.twoWay != null ? opts.twoWay : true;
        this.forceScale = opts.forceScale != null ? opts.forceScale : 1.0;
        this.externalBodies = opts.externalBodies || false;   // when true, an external rigid engine (box3d) owns body motion; the fluid only supplies forces
        this.flipRatio = opts.flipRatio != null ? opts.flipRatio : 0.95;
        this.iters = opts.iters || 50;
        this.solver = opts.solver || "jacobi";      // "jacobi" | "rbgs"
        this.omega = opts.omega != null ? opts.omega : 1.4;

        this.nu = (nx + 1) * ny * nz; this.nv = nx * (ny + 1) * nz; this.nw = nx * ny * (nz + 1); this.nc = nx * ny * nz;
        this.u = new Float32Array(this.nu); this.v = new Float32Array(this.nv); this.w = new Float32Array(this.nw);
        this.uPrev = new Float32Array(this.nu); this.vPrev = new Float32Array(this.nv); this.wPrev = new Float32Array(this.nw);
        this.duW = new Float32Array(this.nu); this.dvW = new Float32Array(this.nv); this.dwW = new Float32Array(this.nw);
        this.p = new Float32Array(this.nc); this.pNew = new Float32Array(this.nc);
        this.type = new Uint8Array(this.nc); this.div = new Float32Array(this.nc);
        // --- rigid coupling (one-way) ---
        this.staticType = new Uint8Array(this.nc);
        this.solidU = new Float32Array(this.nu); this.solidV = new Float32Array(this.nv); this.solidW = new Float32Array(this.nw);
        this.bodyId = new Int16Array(this.nc).fill(-1);
        this.bodies = [];
        this.px = []; this.py = []; this.pz = []; this.pvx = []; this.pvy = []; this.pvz = [];
        this._resetSolids();
    }

    // face + center indexing
    ui(i, j, k) { return i + (this.nx + 1) * (j + this.ny * k); }
    vi(i, j, k) { return i + this.nx * (j + (this.ny + 1) * k); }
    wi(i, j, k) { return i + this.nx * (j + this.ny * k); }
    ci(i, j, k) { return i + this.nx * (j + this.ny * k); }

    _resetSolids() {
        const { nx, ny, nz } = this;
        for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
            const s = (i === 0 || j === 0 || k === 0 || i === nx - 1 || j === ny - 1 || k === nz - 1) ? SOLID : AIR;
            this.staticType[this.ci(i, j, k)] = s; this.type[this.ci(i, j, k)] = s;
        }
    }

    // ---- rigid bodies (one-way): axis-aligned boxes + spheres become moving SOLIDs the fluid splashes off ----
    addBox(x, y, z, hx, hy, hz, opts = {}) { const b = { type: "box", x, y, z, hx, hy, hz, vx: opts.vx || 0, vy: opts.vy || 0, vz: opts.vz || 0, wx: opts.wx || 0, wy: opts.wy || 0, wz: opts.wz || 0, mass: opts.mass != null ? opts.mass : 8 * hx * hy * hz, fixed: !!opts.fixed, restitution: opts.restitution != null ? opts.restitution : 0.2, rot: [1, 0, 0, 0, 1, 0, 0, 0, 1] }; this.bodies.push(b); return b; }
    addSphere(x, y, z, r, opts = {}) { const b = { type: "sphere", x, y, z, r, vx: opts.vx || 0, vy: opts.vy || 0, vz: opts.vz || 0, wx: opts.wx || 0, wy: opts.wy || 0, wz: opts.wz || 0, mass: opts.mass != null ? opts.mass : (4 / 3) * Math.PI * r * r * r, fixed: !!opts.fixed, restitution: opts.restitution != null ? opts.restitution : 0.2 }; this.bodies.push(b); return b; }

    // set a box body's orientation from a quaternion (matches box3d readTransforms xf[o+3..o+6]); builds the
    // body->world rotation matrix (row-major). Non-box bodies (spheres) ignore orientation.
    setBodyQuat(b, qx, qy, qz, qw) {
        if (!b.rot) return;
        const xx = qx * qx, yy = qy * qy, zz = qz * qz, xy = qx * qy, xz = qx * qz, yz = qy * qz, wx = qw * qx, wy = qw * qy, wz = qw * qz;
        b.rot[0] = 1 - 2 * (yy + zz); b.rot[1] = 2 * (xy - wz); b.rot[2] = 2 * (xz + wy);
        b.rot[3] = 2 * (xy + wz); b.rot[4] = 1 - 2 * (xx + zz); b.rot[5] = 2 * (yz - wx);
        b.rot[6] = 2 * (xz - wy); b.rot[7] = 2 * (yz + wx); b.rot[8] = 1 - 2 * (xx + yy);
    }
    // world point -> body local frame (R^T * (p - center))
    _toLocal(b, x, y, z) { const R = b.rot, dx = x - b.x, dy = y - b.y, dz = z - b.z;
        return [R[0] * dx + R[3] * dy + R[6] * dz, R[1] * dx + R[4] * dy + R[7] * dz, R[2] * dx + R[5] * dy + R[8] * dz]; }

    _bodyContains(b, x, y, z) {
        if (b.type === "sphere") { const dx = x - b.x, dy = y - b.y, dz = z - b.z; return dx * dx + dy * dy + dz * dz <= b.r * b.r; }
        const l = this._toLocal(b, x, y, z);   // oriented box: test in the body's local frame
        return Math.abs(l[0]) <= b.hx && Math.abs(l[1]) <= b.hy && Math.abs(l[2]) <= b.hz;
    }
    // velocity at world point: v + omega x r  (world-frame, orientation-independent)
    _bodyVelAt(b, x, y, z) { const rx = x - b.x, ry = y - b.y, rz = z - b.z;
        return [b.vx + b.wy * rz - b.wz * ry, b.vy + b.wz * rx - b.wx * rz, b.vz + b.wx * ry - b.wy * rx]; }
    // eject a point to the body surface; returns [nx,ny,nz, sx,sy,sz] (world) or null
    _bodyEject(b, x, y, z) {
        if (b.type === "sphere") { const dx = x - b.x, dy = y - b.y, dz = z - b.z, d = Math.hypot(dx, dy, dz) || 1e-6; if (d >= b.r) return null; const nx = dx / d, ny = dy / d, nz = dz / d; return [nx, ny, nz, b.x + nx * b.r, b.y + ny * b.r, b.z + nz * b.r]; }
        const l = this._toLocal(b, x, y, z), lx = l[0], ly = l[1], lz = l[2];
        if (Math.abs(lx) > b.hx || Math.abs(ly) > b.hy || Math.abs(lz) > b.hz) return null;
        const px = b.hx - Math.abs(lx), py = b.hy - Math.abs(ly), pz = b.hz - Math.abs(lz);   // penetration per local axis
        let lnx = 0, lny = 0, lnz = 0, sx = lx, sy = ly, sz = lz;
        if (px <= py && px <= pz) { lnx = Math.sign(lx) || 1; sx = b.hx * lnx; }
        else if (py <= pz) { lny = Math.sign(ly) || 1; sy = b.hy * lny; }
        else { lnz = Math.sign(lz) || 1; sz = b.hz * lnz; }
        const R = b.rot;   // local -> world (R * v), surface point = center + R * localSurf
        const nX = R[0] * lnx + R[1] * lny + R[2] * lnz, nY = R[3] * lnx + R[4] * lny + R[5] * lnz, nZ = R[6] * lnx + R[7] * lny + R[8] * lnz;
        const wsx = b.x + R[0] * sx + R[1] * sy + R[2] * sz, wsy = b.y + R[3] * sx + R[4] * sy + R[5] * sz, wsz = b.z + R[6] * sx + R[7] * sy + R[8] * sz;
        return [nX, nY, nZ, wsx, wsy, wsz];
    }
    _stepBodies(dt) {
        const { nx, ny, nz, h } = this;
        for (const b of this.bodies) {
            if (b.fixed) continue;
            b.vy += this.gravity * dt;
            b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
            const rad = b.type === "sphere" ? b.r : Math.hypot(b.hx, b.hy, b.hz);
            const lo = h + rad, hiX = (nx - 1) * h - rad, hiY = (ny - 1) * h - rad, hiZ = (nz - 1) * h - rad;
            if (b.x < lo) { b.x = lo; b.vx = -b.vx * b.restitution; } if (b.x > hiX) { b.x = hiX; b.vx = -b.vx * b.restitution; }
            if (b.y < lo) { b.y = lo; b.vy = -b.vy * b.restitution; } if (b.y > hiY) { b.y = hiY; b.vy = -b.vy * b.restitution; }
            if (b.z < lo) { b.z = lo; b.vz = -b.vz * b.restitution; } if (b.z > hiZ) { b.z = hiZ; b.vz = -b.vz * b.restitution; }
        }
    }
    _stampBodies() {
        const { nx, ny, nz, h } = this;
        this.solidU.fill(0); this.solidV.fill(0); this.solidW.fill(0); this.bodyId.fill(-1);
        if (this.bodies.length === 0) return;
        for (let k = 1; k < nz - 1; k++) for (let j = 1; j < ny - 1; j++) for (let i = 1; i < nx - 1; i++) {
            const cx = (i + 0.5) * h, cy = (j + 0.5) * h, cz = (k + 0.5) * h;
            for (let bi = 0; bi < this.bodies.length; bi++) if (this._bodyContains(this.bodies[bi], cx, cy, cz)) { const c = this.ci(i, j, k); this.type[c] = SOLID; this.bodyId[c] = bi; break; }
        }
        for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i <= nx; i++) {
            const bl = i > 0 ? this.bodyId[this.ci(i - 1, j, k)] : -1, br = i < nx ? this.bodyId[this.ci(i, j, k)] : -1; const bid = br >= 0 ? br : bl; if (bid < 0) continue;
            this.solidU[this.ui(i, j, k)] = this._bodyVelAt(this.bodies[bid], i * h, (j + 0.5) * h, (k + 0.5) * h)[0];
        }
        for (let k = 0; k < nz; k++) for (let j = 0; j <= ny; j++) for (let i = 0; i < nx; i++) {
            const bd = j > 0 ? this.bodyId[this.ci(i, j - 1, k)] : -1, bu = j < ny ? this.bodyId[this.ci(i, j, k)] : -1; const bid = bu >= 0 ? bu : bd; if (bid < 0) continue;
            this.solidV[this.vi(i, j, k)] = this._bodyVelAt(this.bodies[bid], (i + 0.5) * h, j * h, (k + 0.5) * h)[1];
        }
        for (let k = 0; k <= nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
            const bb = k > 0 ? this.bodyId[this.ci(i, j, k - 1)] : -1, bf = k < nz ? this.bodyId[this.ci(i, j, k)] : -1; const bid = bf >= 0 ? bf : bb; if (bid < 0) continue;
            this.solidW[this.wi(i, j, k)] = this._bodyVelAt(this.bodies[bid], (i + 0.5) * h, (j + 0.5) * h, k * h)[2];
        }
    }

    addParticle(x, y, z, vx = 0, vy = 0, vz = 0) { this.px.push(x); this.py.push(y); this.pz.push(z); this.pvx.push(vx); this.pvy.push(vy); this.pvz.push(vz); }
    fillBlock(x0, y0, z0, x1, y1, z1, perCell = 2, rng = Math.random) {
        const step = this.h / perCell;
        for (let z = z0 + step * 0.5; z < z1; z += step) for (let y = y0 + step * 0.5; y < y1; y += step) for (let x = x0 + step * 0.5; x < x1; x += step)
            this.addParticle(x + (rng() - 0.5) * step * 0.5, y + (rng() - 0.5) * step * 0.5, z + (rng() - 0.5) * step * 0.5);
    }
    count() { return this.px.length; }

    step(dt) {
        if (!this.externalBodies) this._stepBodies(dt);   // internal kinematics; external mode: box3d owns motion
        this._p2g();
        this.uPrev.set(this.u); this.vPrev.set(this.v); this.wPrev.set(this.w);
        this._addForces(dt);
        this._markFluid();
        this._stampBodies();
        this._setSolidVel();
        this._project(dt);
        if (this.twoWay) this._applyFluidForce(dt);
        this._setSolidVel();
        this._g2p();
        this._advect(dt);
    }

    // integrate fluid pressure over each body's submerged faces -> force + torque (3D). Buoyancy + drag.
    _applyFluidForce(dt) {
        const { nx, ny, nz } = this;
        for (const b of this.bodies) { b._fx = 0; b._fy = 0; b._fz = 0; b._tx = 0; b._ty = 0; b._tz = 0; }
        const add = (b, Fx, Fy, Fz, fx, fy, fz) => {
            const rx = fx - b.x, ry = fy - b.y, rz = fz - b.z;
            b._fx += Fx; b._fy += Fy; b._fz += Fz;
            b._tx += ry * Fz - rz * Fy; b._ty += rz * Fx - rx * Fz; b._tz += rx * Fy - ry * Fx;
        };
        for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 1; i < nx; i++) {   // u-faces, normal x
            const A = this.ci(i - 1, j, k), B = this.ci(i, j, k), ba = this.bodyId[A], bb = this.bodyId[B];
            if (ba >= 0 && this.type[B] === FLUID) add(this.bodies[ba], -this.p[B], 0, 0, i, j + 0.5, k + 0.5);
            else if (bb >= 0 && this.type[A] === FLUID) add(this.bodies[bb], this.p[A], 0, 0, i, j + 0.5, k + 0.5);
        }
        for (let k = 0; k < nz; k++) for (let j = 1; j < ny; j++) for (let i = 0; i < nx; i++) {   // v-faces, normal y
            const A = this.ci(i, j - 1, k), B = this.ci(i, j, k), ba = this.bodyId[A], bb = this.bodyId[B];
            if (ba >= 0 && this.type[B] === FLUID) add(this.bodies[ba], 0, -this.p[B], 0, i + 0.5, j, k + 0.5);
            else if (bb >= 0 && this.type[A] === FLUID) add(this.bodies[bb], 0, this.p[A], 0, i + 0.5, j, k + 0.5);
        }
        for (let k = 1; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {   // w-faces, normal z
            const A = this.ci(i, j, k - 1), B = this.ci(i, j, k), ba = this.bodyId[A], bb = this.bodyId[B];
            if (ba >= 0 && this.type[B] === FLUID) add(this.bodies[ba], 0, 0, -this.p[B], i + 0.5, j + 0.5, k);
            else if (bb >= 0 && this.type[A] === FLUID) add(this.bodies[bb], 0, 0, this.p[A], i + 0.5, j + 0.5, k);
        }
        const s = this.forceScale;
        if (this.externalBodies) return;   // forces are computed + stored on each body (_fx.._tz); the host feeds them to box3d
        for (const b of this.bodies) {
            if (b.fixed) continue;
            let Ix, Iy, Iz;
            if (b.type === "sphere") { Ix = Iy = Iz = Math.max(1e-6, 0.4 * b.mass * b.r * b.r); }
            else { Ix = Math.max(1e-6, b.mass * (b.hy * b.hy + b.hz * b.hz) / 3); Iy = Math.max(1e-6, b.mass * (b.hx * b.hx + b.hz * b.hz) / 3); Iz = Math.max(1e-6, b.mass * (b.hx * b.hx + b.hy * b.hy) / 3); }
            b.vx += s * b._fx / b.mass * dt; b.vy += s * b._fy / b.mass * dt; b.vz += s * b._fz / b.mass * dt;
            b.wx += s * b._tx / Ix * dt; b.wy += s * b._ty / Iy * dt; b.wz += s * b._tz / Iz * dt;
        }
    }

    _splat(field, wsum, wdim, hdim, ddim, gx, gy, gz, val) {
        const i0 = Math.floor(gx), j0 = Math.floor(gy), k0 = Math.floor(gz);
        const fx = gx - i0, fy = gy - j0, fz = gz - k0;
        for (let dk = 0; dk <= 1; dk++) for (let dj = 0; dj <= 1; dj++) for (let di = 0; di <= 1; di++) {
            const i = i0 + di, j = j0 + dj, k = k0 + dk; if (i < 0 || j < 0 || k < 0 || i >= wdim || j >= hdim || k >= ddim) continue;
            const wt = (di ? fx : 1 - fx) * (dj ? fy : 1 - fy) * (dk ? fz : 1 - fz);
            const idx = i + wdim * (j + hdim * k); field[idx] += wt * val; wsum[idx] += wt;
        }
    }
    _sample(field, wdim, hdim, ddim, gx, gy, gz) {
        const i0 = Math.floor(gx), j0 = Math.floor(gy), k0 = Math.floor(gz);
        const fx = gx - i0, fy = gy - j0, fz = gz - k0; let s = 0;
        for (let dk = 0; dk <= 1; dk++) for (let dj = 0; dj <= 1; dj++) for (let di = 0; di <= 1; di++) {
            let i = i0 + di, j = j0 + dj, k = k0 + dk;
            i = Math.max(0, Math.min(wdim - 1, i)); j = Math.max(0, Math.min(hdim - 1, j)); k = Math.max(0, Math.min(ddim - 1, k));
            s += (di ? fx : 1 - fx) * (dj ? fy : 1 - fy) * (dk ? fz : 1 - fz) * field[i + wdim * (j + hdim * k)];
        }
        return s;
    }

    _p2g() {
        const { nx, ny, nz, h } = this;
        this.u.fill(0); this.v.fill(0); this.w.fill(0); this.duW.fill(0); this.dvW.fill(0); this.dwW.fill(0);
        for (let n = 0; n < this.px.length; n++) {
            const x = this.px[n] / h, y = this.py[n] / h, z = this.pz[n] / h;
            this._splat(this.u, this.duW, nx + 1, ny, nz, x, y - 0.5, z - 0.5, this.pvx[n]);
            this._splat(this.v, this.dvW, nx, ny + 1, nz, x - 0.5, y, z - 0.5, this.pvy[n]);
            this._splat(this.w, this.dwW, nx, ny, nz + 1, x - 0.5, y - 0.5, z, this.pvz[n]);
        }
        for (let n = 0; n < this.u.length; n++) if (this.duW[n] > 0) this.u[n] /= this.duW[n];
        for (let n = 0; n < this.v.length; n++) if (this.dvW[n] > 0) this.v[n] /= this.dvW[n];
        for (let n = 0; n < this.w.length; n++) if (this.dwW[n] > 0) this.w[n] /= this.dwW[n];
    }

    _addForces(dt) { for (let n = 0; n < this.v.length; n++) this.v[n] += this.gravity * dt; }

    _markFluid() {
        const { nx, ny, nz, h } = this;
        this.type.set(this.staticType);
        for (let n = 0; n < this.px.length; n++) {
            const i = Math.floor(this.px[n] / h), j = Math.floor(this.py[n] / h), k = Math.floor(this.pz[n] / h);
            if (i > 0 && j > 0 && k > 0 && i < nx - 1 && j < ny - 1 && k < nz - 1) { const c = this.ci(i, j, k); if (this.type[c] !== SOLID) this.type[c] = FLUID; }
        }
    }

    _setSolidVel() {
        const { nx, ny, nz } = this;
        for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i <= nx; i++) {
            const a = i > 0 ? this.type[this.ci(i - 1, j, k)] : SOLID, b = i < nx ? this.type[this.ci(i, j, k)] : SOLID;
            if (a === SOLID || b === SOLID) this.u[this.ui(i, j, k)] = this.solidU[this.ui(i, j, k)];
        }
        for (let k = 0; k < nz; k++) for (let j = 0; j <= ny; j++) for (let i = 0; i < nx; i++) {
            const a = j > 0 ? this.type[this.ci(i, j - 1, k)] : SOLID, b = j < ny ? this.type[this.ci(i, j, k)] : SOLID;
            if (a === SOLID || b === SOLID) this.v[this.vi(i, j, k)] = this.solidV[this.vi(i, j, k)];
        }
        for (let k = 0; k <= nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
            const a = k > 0 ? this.type[this.ci(i, j, k - 1)] : SOLID, b = k < nz ? this.type[this.ci(i, j, k)] : SOLID;
            if (a === SOLID || b === SOLID) this.w[this.wi(i, j, k)] = this.solidW[this.wi(i, j, k)];
        }
    }

    _project(dt) {
        const { nx, ny, nz } = this;
        for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
            const c = this.ci(i, j, k);
            this.div[c] = (this.type[c] === FLUID)
                ? (this.u[this.ui(i + 1, j, k)] - this.u[this.ui(i, j, k)] + this.v[this.vi(i, j + 1, k)] - this.v[this.vi(i, j, k)] + this.w[this.wi(i, j, k + 1)] - this.w[this.wi(i, j, k)]) : 0;
        }
        const invDt = 1.0 / dt;
        const nbrSum = (i, j, k) => {   // returns [denom, fluid-neighbor pressure sum]
            let denom = 0, sum = 0;
            const t = [[i - 1, j, k], [i + 1, j, k], [i, j - 1, k], [i, j + 1, k], [i, j, k - 1], [i, j, k + 1]];
            for (const [a, b, c2] of t) { const tt = this.type[this.ci(a, b, c2)]; if (tt !== SOLID) { denom++; if (tt === FLUID) sum += this.p[this.ci(a, b, c2)]; } }
            return [denom, sum];
        };
        if (this.solver === "mgpcg") {
            // 3D Galerkin multigrid-preconditioned CG -- grid-independent, robust on solid walls + free surface.
            if (!this._mg || this._mg.levels[0].nx !== nx || this._mg.levels[0].ny !== ny || this._mg.levels[0].nz !== nz) this._mg = new PoissonMG3D(nx, ny, nz, { pre: 2, post: 2, omega: 1.1, stencilRadius: this.mgRadius || 1 });
            this._mg.solveCG(this.type, this.div, dt, this.p, { maxIters: this.mgIters || 30, tol: this.mgTol || 1e-4 });
        } else if (this.solver === "rbgs") {
            this.p.fill(0); const om = this.omega;   // RBGS must run fresh (see flip2d.mjs note)
            for (let it = 0; it < this.iters; it++) for (let color = 0; color < 2; color++)
                for (let k = 1; k < nz - 1; k++) for (let j = 1; j < ny - 1; j++) for (let i = 1; i < nx - 1; i++) {
                    if (((i + j + k) & 1) !== color) continue;
                    const c = this.ci(i, j, k); if (this.type[c] !== FLUID) continue;
                    const [denom, sum] = nbrSum(i, j, k);
                    if (denom > 0) { const gs = (sum - this.div[c] * invDt) / denom; this.p[c] += om * (gs - this.p[c]); }
                }
        } else {
            for (let it = 0; it < this.iters; it++) {
                for (let k = 1; k < nz - 1; k++) for (let j = 1; j < ny - 1; j++) for (let i = 1; i < nx - 1; i++) {
                    const c = this.ci(i, j, k); if (this.type[c] !== FLUID) { this.pNew[c] = 0; continue; }
                    const [denom, sum] = nbrSum(i, j, k);
                    this.pNew[c] = denom > 0 ? (sum - this.div[c] * invDt) / denom : 0;
                }
                const tmp = this.p; this.p = this.pNew; this.pNew = tmp;
            }
        }
        // subtract pressure gradient
        for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 1; i < nx; i++) {
            const a = this.ci(i - 1, j, k), b = this.ci(i, j, k); if (this.type[a] === SOLID || this.type[b] === SOLID) continue;
            if (this.type[a] === FLUID || this.type[b] === FLUID) this.u[this.ui(i, j, k)] -= dt * (this.p[b] - this.p[a]);
        }
        for (let k = 0; k < nz; k++) for (let j = 1; j < ny; j++) for (let i = 0; i < nx; i++) {
            const a = this.ci(i, j - 1, k), b = this.ci(i, j, k); if (this.type[a] === SOLID || this.type[b] === SOLID) continue;
            if (this.type[a] === FLUID || this.type[b] === FLUID) this.v[this.vi(i, j, k)] -= dt * (this.p[b] - this.p[a]);
        }
        for (let k = 1; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
            const a = this.ci(i, j, k - 1), b = this.ci(i, j, k); if (this.type[a] === SOLID || this.type[b] === SOLID) continue;
            if (this.type[a] === FLUID || this.type[b] === FLUID) this.w[this.wi(i, j, k)] -= dt * (this.p[b] - this.p[a]);
        }
    }

    _g2p() {
        const { nx, ny, nz, h } = this;
        for (let n = 0; n < this.px.length; n++) {
            const x = this.px[n] / h, y = this.py[n] / h, z = this.pz[n] / h;
            const picU = this._sample(this.u, nx + 1, ny, nz, x, y - 0.5, z - 0.5);
            const picV = this._sample(this.v, nx, ny + 1, nz, x - 0.5, y, z - 0.5);
            const picW = this._sample(this.w, nx, ny, nz + 1, x - 0.5, y - 0.5, z);
            const dU = picU - this._sample(this.uPrev, nx + 1, ny, nz, x, y - 0.5, z - 0.5);
            const dV = picV - this._sample(this.vPrev, nx, ny + 1, nz, x - 0.5, y, z - 0.5);
            const dW = picW - this._sample(this.wPrev, nx, ny, nz + 1, x - 0.5, y - 0.5, z);
            const r = this.flipRatio;
            this.pvx[n] = r * (this.pvx[n] + dU) + (1 - r) * picU;
            this.pvy[n] = r * (this.pvy[n] + dV) + (1 - r) * picV;
            this.pvz[n] = r * (this.pvz[n] + dW) + (1 - r) * picW;
        }
    }

    _advect(dt) {
        const { nx, ny, nz, h } = this;
        const lo = 1.001 * h, hiX = (nx - 1.001) * h, hiY = (ny - 1.001) * h, hiZ = (nz - 1.001) * h;
        for (let n = 0; n < this.px.length; n++) {
            const gx = this.px[n] / h, gy = this.py[n] / h, gz = this.pz[n] / h;
            const um = this._sample(this.u, nx + 1, ny, nz, gx, gy - 0.5, gz - 0.5), vm = this._sample(this.v, nx, ny + 1, nz, gx - 0.5, gy, gz - 0.5), wm = this._sample(this.w, nx, ny, nz + 1, gx - 0.5, gy - 0.5, gz);
            const mx = this.px[n] + 0.5 * dt * um, my = this.py[n] + 0.5 * dt * vm, mz = this.pz[n] + 0.5 * dt * wm;
            const gmx = mx / h, gmy = my / h, gmz = mz / h;
            const u2 = this._sample(this.u, nx + 1, ny, nz, gmx, gmy - 0.5, gmz - 0.5), v2 = this._sample(this.v, nx, ny + 1, nz, gmx - 0.5, gmy, gmz - 0.5), w2 = this._sample(this.w, nx, ny, nz + 1, gmx - 0.5, gmy - 0.5, gmz);
            let x = this.px[n] + dt * u2, y = this.py[n] + dt * v2, zz = this.pz[n] + dt * w2;
            if (x < lo) { x = lo; if (this.pvx[n] < 0) this.pvx[n] = 0; } if (x > hiX) { x = hiX; if (this.pvx[n] > 0) this.pvx[n] = 0; }
            if (y < lo) { y = lo; if (this.pvy[n] < 0) this.pvy[n] = 0; } if (y > hiY) { y = hiY; if (this.pvy[n] > 0) this.pvy[n] = 0; }
            if (zz < lo) { zz = lo; if (this.pvz[n] < 0) this.pvz[n] = 0; } if (zz > hiZ) { zz = hiZ; if (this.pvz[n] > 0) this.pvz[n] = 0; }
            for (let bi = 0; bi < this.bodies.length; bi++) {
                const ej = this._bodyEject(this.bodies[bi], x, y, zz); if (!ej) continue;
                const [enx, eny, enz, sx, sy, sz] = ej;
                x = sx + enx * 0.01 * h; y = sy + eny * 0.01 * h; zz = sz + enz * 0.01 * h;
                const bv = this._bodyVelAt(this.bodies[bi], x, y, zz);
                const vn = (this.pvx[n] - bv[0]) * enx + (this.pvy[n] - bv[1]) * eny + (this.pvz[n] - bv[2]) * enz;
                if (vn < 0) { this.pvx[n] -= vn * enx; this.pvy[n] -= vn * eny; this.pvz[n] -= vn * enz; }
            }
            this.px[n] = x; this.py[n] = y; this.pz[n] = zz;
        }
    }

    maxDivergence() {
        const { nx, ny, nz } = this; let m = 0;
        for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
            const c = this.ci(i, j, k); if (this.type[c] !== FLUID) continue;
            const d = Math.abs(this.u[this.ui(i + 1, j, k)] - this.u[this.ui(i, j, k)] + this.v[this.vi(i, j + 1, k)] - this.v[this.vi(i, j, k)] + this.w[this.wi(i, j, k + 1)] - this.w[this.wi(i, j, k)]);
            if (d > m) m = d;
        }
        return m;
    }
    meanSpeed() { let s = 0; for (let n = 0; n < this.px.length; n++) s += Math.hypot(this.pvx[n], this.pvy[n], this.pvz[n]); return this.px.length ? s / this.px.length : 0; }
    inBounds() { const { nx, ny, nz, h } = this; for (let n = 0; n < this.px.length; n++) { if (this.px[n] <= 0 || this.py[n] <= 0 || this.pz[n] <= 0 || this.px[n] >= nx * h || this.py[n] >= ny * h || this.pz[n] >= nz * h) return false; } return true; }
}

export { Flip3D, AIR, FLUID, SOLID };
if (typeof module !== "undefined" && module.exports) module.exports = { Flip3D, AIR, FLUID, SOLID };
