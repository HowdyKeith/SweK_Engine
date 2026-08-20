// multigrid3d.mjs -- 3D geometric multigrid V-cycle + MGPCG for the FLIP pressure Poisson (flip3d), the 3D
// counterpart of multigrid.mjs. GALERKIN coarse operators A_c = P^T A_f P built from trilinear prolongation, so
// the fine air-Dirichlet / solid-Neumann boundaries propagate down every level; MGPCG (multigrid-preconditioned
// CG) then handles the near-null-space mode of solid (Neumann) walls, giving grid-independent convergence.
//
// Operators are stored as a FLATTENED stencil (Float32Array n*SS). The full 3D Galerkin width for trilinear
// transfers is 5x5x5 = 125-point (SR=2); a 3x3x3 = 27-point (SR=1) approximation costs ~5x less memory for a few
// extra CG iterations. Default SR=1 (27-point) keeps memory sane on 3D grids; pass {stencilRadius:2} for the exact
// operator. Stencil index k = ((dz+SR)*SW + (dy+SR))*SW + (dx+SR), SW = 2*SR+1; SDIAG is the center.
"use strict";

const AIR = 0, FLUID = 1, SOLID = 2;

class PoissonMG3D {
    constructor(nx, ny, nz, opts = {}) {
        // *** v3754 -- THESE WERE `opts.x || default`, SO A REQUESTED ZERO WAS SILENTLY REWRITTEN. Found at
        // v3753 while mapping the option space: { pre: 0, post: 4 } came back reporting SIX smoothing sweeps
        // instead of four, because `0 || 2` is 2. THE REQUEST WAS REWRITTEN AND NOTHING SAID SO -- v3712's
        // shape (a clamp that rewrites an input and reports nothing), sitting in shipped physics.
        // *** AND THE RIGHT ANSWER IS NOT A BLANKET `??`, WHICH IS WHY THIS IS NOT A ONE-CHARACTER FIX:
        // ZERO IS MEANINGFUL FOR SOME OF THESE KNOBS AND NONSENSE FOR OTHERS. pre/post 0 is a real V-cycle
        // variant (smooth on only one leg). pcCycles 0 is plain CG with no preconditioner. coarseIters 0 skips
        // the coarse solve. BUT minDim 0 and stencilRadius 0 describe no solver at all -- SW would be 1, a
        // one-point stencil. So the zero-able knobs take `??` and the others are REFUSED BY NAME rather than
        // quietly corrected, which is the same choice v3738 made for bounds: a loud failure beats a silent
        // downgrade. NOTE THAT omega AND tol ON THESE VERY LINES ALREADY USED `!= null` -- the correct idiom
        // was in the file the whole time, two knobs away. ***
        this.pre = opts.pre ?? 2; this.post = opts.post ?? 2; this.omega = opts.omega != null ? opts.omega : 1.1;
        this.minDim = opts.minDim ?? 4; this.coarseIters = opts.coarseIters ?? 40;
        this.SR = opts.stencilRadius ?? 1;
        if (!(this.minDim >= 1)) throw new Error("PoissonMG3D: minDim must be >= 1 (got " + opts.minDim + ") -- a coarsest level of zero cells is not a solver");
        if (!(this.SR >= 1)) throw new Error("PoissonMG3D: stencilRadius must be >= 1 (got " + opts.stencilRadius + ") -- radius 0 is a one-point stencil");
        if (!(this.pre >= 0) || !(this.post >= 0)) throw new Error("PoissonMG3D: pre/post must be >= 0 (got " + opts.pre + "/" + opts.post + ")");
        this.SW = 2 * this.SR + 1; this.SS = this.SW * this.SW * this.SW;
        this.SDIAG = (this.SR * this.SW + this.SR) * this.SW + this.SR;
        this.levels = [];
        let cw = nx, ch = ny, cd = nz;
        while (true) {
            const n = cw * ch * cd;
            this.levels.push({ nx: cw, ny: ch, nz: cd, h: (nx / cw), type: new Uint8Array(n), p: new Float32Array(n), b: new Float32Array(n), r: new Float32Array(n), op: new Float32Array(n * this.SS) });
            if ((cw % 2) || (ch % 2) || (cd % 2) || Math.min(cw, ch, cd) <= this.minDim) break;
            cw /= 2; ch /= 2; cd /= 2;
        }
    }

    _idx(L, i, j, k) { return i + L.nx * (j + L.ny * k); }

    // trilinear prolongation weights: fine cell (fi,fj,fk) from the surrounding fluid coarse cells (normalized)
    _pcols(C, fi, fj, fk, out) {
        out.length = 0;
        const gx = (fi + 0.5) * 0.5 - 0.5, gy = (fj + 0.5) * 0.5 - 0.5, gz = (fk + 0.5) * 0.5 - 0.5;
        const i0 = Math.floor(gx), j0 = Math.floor(gy), k0 = Math.floor(gz), fx = gx - i0, fy = gy - j0, fz = gz - k0;
        let wsum = 0;
        for (let dk = 0; dk < 2; dk++) for (let dj = 0; dj < 2; dj++) for (let di = 0; di < 2; di++) {
            const ci = Math.max(0, Math.min(C.nx - 1, i0 + di)), cj = Math.max(0, Math.min(C.ny - 1, j0 + dj)), ck = Math.max(0, Math.min(C.nz - 1, k0 + dk));
            const cc = ci + C.nx * (cj + C.ny * ck); if (C.type[cc] !== FLUID) continue;
            const w = (di ? fx : 1 - fx) * (dj ? fy : 1 - fy) * (dk ? fz : 1 - fz); if (w <= 0) continue;
            out.push([cc, ci, cj, ck, w]); wsum += w;
        }
        if (wsum > 0) for (const e of out) e[4] /= wsum;
        return out;
    }

    // fine operator from types -> flat stencil. A p[c] = (denom*p - sum_fluidnbr p)/h^2  (7-point)
    _buildFineOp(L) {
        const { nx, ny, nz, h } = L, T = L.type, inv = 1 / (h * h), op = L.op, SS = this.SS, D = this.SDIAG, SW = this.SW;
        op.fill(0);
        const off = [[-1, 0, 0], [1, 0, 0], [0, -1, 0], [0, 1, 0], [0, 0, -1], [0, 0, 1]];
        for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
            const c = i + nx * (j + ny * k); if (T[c] !== FLUID) continue;
            let denom = 0; const base = c * SS;
            for (const [dx, dy, dz] of off) {
                const ni = i + dx, nj = j + dy, nk = k + dz; if (ni < 0 || nj < 0 || nk < 0 || ni >= nx || nj >= ny || nk >= nz) continue;
                const t = T[ni + nx * (nj + ny * nk)]; if (t !== SOLID) { denom++; if (t === FLUID) op[base + D + dz * SW * SW + dy * SW + dx] = -inv; }
            }
            op[base + D] = denom * inv;
        }
    }

    // Galerkin A_c = P^T A_f P into a flat coarse stencil (scatter)
    _galerkin(F, C) {
        C.op.fill(0); const opC = C.op, opF = F.op, SS = this.SS, SW = this.SW, SR = this.SR;
        const pf = [], pfp = [];
        for (let fk = 0; fk < F.nz; fk++) for (let fj = 0; fj < F.ny; fj++) for (let fi = 0; fi < F.nx; fi++) {
            const f = fi + F.nx * (fj + F.ny * fk); if (F.type[f] !== FLUID) continue;
            const fbase = f * SS; this._pcols(C, fi, fj, fk, pf); if (pf.length === 0) continue;
            for (let kk = 0; kk < SS; kk++) {
                const a = opF[fbase + kk]; if (a === 0) continue;
                const fdx = (kk % SW) - SR, fdy = (((kk / SW) | 0) % SW) - SR, fdz = ((kk / (SW * SW)) | 0) - SR;
                const pfi = fi + fdx, pfj = fj + fdy, pfk = fk + fdz;
                if (pfi < 0 || pfj < 0 || pfk < 0 || pfi >= F.nx || pfj >= F.ny || pfk >= F.nz) continue;
                this._pcols(C, pfi, pfj, pfk, pfp); if (pfp.length === 0) continue;
                for (const e of pf) { const cc = e[0], ci = e[1], cj = e[2], ck = e[3], wc = e[4];
                    for (const g of pfp) { const cdx = g[1] - ci, cdy = g[2] - cj, cdz = g[3] - ck;
                        if (cdx < -SR || cdx > SR || cdy < -SR || cdy > SR || cdz < -SR || cdz > SR) continue;
                        opC[cc * SS + this.SDIAG + cdz * SW * SW + cdy * SW + cdx] += wc * a * g[4]; } }
            }
        }
    }

    _applyOp(L, p, i, j, k, c) {
        const { nx, ny, nz } = L, op = L.op, SS = this.SS, SW = this.SW, SR = this.SR, base = c * SS; let s = 0;
        for (let kk = 0; kk < SS; kk++) { const a = op[base + kk]; if (a === 0) continue;
            const dx = (kk % SW) - SR, dy = (((kk / SW) | 0) % SW) - SR, dz = ((kk / (SW * SW)) | 0) - SR, ni = i + dx, nj = j + dy, nk = k + dz;
            if (ni < 0 || nj < 0 || nk < 0 || ni >= nx || nj >= ny || nk >= nz) continue; s += a * p[ni + nx * (nj + ny * nk)]; }
        return s;
    }

    _smooth(L, sweeps) {
        const { nx, ny, nz } = L, T = L.type, p = L.p, b = L.b, op = L.op, om = this.omega, SS = this.SS, SW = this.SW, SR = this.SR, D = this.SDIAG;
        for (let s = 0; s < sweeps; s++) for (let color = 0; color < 2; color++)
            for (let k = 1; k < nz - 1; k++) for (let j = 1; j < ny - 1; j++) for (let i = 1; i < nx - 1; i++) {
                if (((i + j + k) & 1) !== color) continue;
                const c = i + nx * (j + ny * k); if (T[c] !== FLUID) { p[c] = 0; continue; }
                const base = c * SS, diag = op[base + D]; if (diag === 0) continue;
                let offv = 0;
                for (let kk = 0; kk < SS; kk++) { if (kk === D) continue; const a = op[base + kk]; if (a === 0) continue;
                    const dx = (kk % SW) - SR, dy = (((kk / SW) | 0) % SW) - SR, dz = ((kk / (SW * SW)) | 0) - SR, ni = i + dx, nj = j + dy, nk = k + dz;
                    if (ni < 0 || nj < 0 || nk < 0 || ni >= nx || nj >= ny || nk >= nz) continue; offv += a * p[ni + nx * (nj + ny * nk)]; }
                const gs = (b[c] - offv) / diag; p[c] += om * (gs - p[c]);
            }
    }

    _residual(L) {
        const { nx, ny, nz } = L, T = L.type, r = L.r, p = L.p, b = L.b;
        for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { const c = i + nx * (j + ny * k); r[c] = (T[c] === FLUID) ? (b[c] - this._applyOp(L, p, i, j, k, c)) : 0; }
    }

    _coarsenType(F, C) {
        const { nx: cnx, ny: cny, nz: cnz } = C, { nx: fnx, ny: fny } = F;
        for (let K = 0; K < cnz; K++) for (let J = 0; J < cny; J++) for (let I = 0; I < cnx; I++) {
            let anyF = false, anyA = false;
            for (let dk = 0; dk < 2; dk++) for (let dj = 0; dj < 2; dj++) for (let di = 0; di < 2; di++) { const t = F.type[(2 * I + di) + fnx * ((2 * J + dj) + fny * (2 * K + dk))]; if (t === FLUID) anyF = true; else if (t === AIR) anyA = true; }
            C.type[I + cnx * (J + cny * K)] = anyF ? FLUID : (anyA ? AIR : SOLID);
        }
    }

    _restrict(F, C) {
        C.b.fill(0); const pf = [];
        for (let fk = 0; fk < F.nz; fk++) for (let fj = 0; fj < F.ny; fj++) for (let fi = 0; fi < F.nx; fi++) {
            const f = fi + F.nx * (fj + F.ny * fk); if (F.type[f] !== FLUID) continue;
            this._pcols(C, fi, fj, fk, pf); const rf = F.r[f];
            for (const e of pf) if (C.type[e[0]] === FLUID) C.b[e[0]] += e[4] * rf;
        }
    }

    _prolongAdd(C, F) {
        const pf = [];
        for (let fk = 0; fk < F.nz; fk++) for (let fj = 0; fj < F.ny; fj++) for (let fi = 0; fi < F.nx; fi++) {
            const f = fi + F.nx * (fj + F.ny * fk); if (F.type[f] !== FLUID) continue;
            this._pcols(C, fi, fj, fk, pf); let val = 0; for (const e of pf) val += e[4] * C.p[e[0]]; F.p[f] += val;
        }
    }

    _vcycle(lvl) {
        const L = this.levels[lvl];
        if (lvl === this.levels.length - 1) { this._smooth(L, this.coarseIters); return; }
        this._smooth(L, this.pre);
        this._residual(L);
        const C = this.levels[lvl + 1];
        this._restrict(L, C);
        C.p.fill(0);
        this._vcycle(lvl + 1);
        this._prolongAdd(C, L);
        this._smooth(L, this.post);
    }

    _applyFineA(x, out) { const F = this.levels[0], T = F.type, { nx, ny, nz } = F; for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { const c = i + nx * (j + ny * k); out[c] = (T[c] === FLUID) ? this._applyOp(F, x, i, j, k, c) : 0; } }
    /**
     * *** v3784 -- `cycles || 1` WAS THE FALSY-ZERO DEFAULT AND IT MADE pcCycles 0 A LIE. solveCG reads
     * `pc = opts.pcCycles ?? 1` correctly and its own comment one line below says "pcCycles 0 means plain CG.
     * Both are askable" -- AND THEN HANDED THE 0 TO THIS FUNCTION, WHICH TURNED IT BACK INTO 1. Asking for
     * plain CG silently got you ONE V-CYCLE, which is the shipped default, so the knob was INERT.
     * MEASURED BEFORE THE FIX: pcCycles 1 and 0 gave IDENTICAL iterations AND BIT-IDENTICAL RESIDUALS --
     * 20 iters / 6.33e-7 at n=16 and 28 / 6.20e-7 at n=32, both values.
     * v3754 FIXED EXACTLY THIS SHAPE IN THIS FILE -- pre, post, minDim, coarseIters, stencilRadius all moved
     * to `??` -- AND MISSED THIS ONE, ONE FUNCTION ABOVE THE COMMENT THAT DOCUMENTS THE RULE. Zero cycles now
     * means ZERO: no preconditioner, z = r, which is plain CG by definition. ***
     */
    _precond(r, z, cycles) {
        const n = cycles == null ? 1 : cycles;
        if (n <= 0) { z.set(r); return; }          // plain CG: the identity preconditioner IS no preconditioner
        const F = this.levels[0]; F.b.set(r); F.p.fill(0);
        for (let v = 0; v < n; v++) this._vcycle(0);
        z.set(F.p);
    }

    // MG-preconditioned conjugate gradient (the robust 3D FLIP pressure solver). Returns pOut, sets .iters/.res.
    solveCG(type, div, dt, pOut, opts = {}) {
        // v3754 -- same fix: maxIters 0 means "do nothing" and pcCycles 0 means plain CG. Both are askable.
        const maxIters = opts.maxIters ?? 40, tol = opts.tol != null ? opts.tol : 1e-5, pc = opts.pcCycles ?? 1;
        const F = this.levels[0], N = F.type.length, T = F.type; F.type.set(type);
        for (let L = 0; L < this.levels.length - 1; L++) this._coarsenType(this.levels[L], this.levels[L + 1]);
        this._buildFineOp(F);
        for (let L = 0; L < this.levels.length - 1; L++) this._galerkin(this.levels[L], this.levels[L + 1]);
        const invDt = 1 / dt;
        const b = new Float32Array(N), x = new Float32Array(N), r = new Float32Array(N), z = new Float32Array(N), pv = new Float32Array(N), Ap = new Float32Array(N);
        for (let c = 0; c < N; c++) b[c] = (T[c] === FLUID) ? -div[c] * invDt : 0;
        r.set(b);
        const dot = (u, w) => { let s = 0; for (let c = 0; c < N; c++) if (T[c] === FLUID) s += u[c] * w[c]; return s; };
        const b2 = Math.sqrt(dot(b, b)); if (b2 === 0) { pOut.set(x); this.iters = 0; this.res = 0; return pOut; }
        this._precond(r, z, pc); pv.set(z);
        let rz = dot(r, z), it = 0;
        for (; it < maxIters; it++) {
            this._applyFineA(pv, Ap);
            const pAp = dot(pv, Ap); if (pAp === 0) break;
            const alpha = rz / pAp;
            for (let c = 0; c < N; c++) if (T[c] === FLUID) { x[c] += alpha * pv[c]; r[c] -= alpha * Ap[c]; }
            if (Math.sqrt(dot(r, r)) / b2 < tol) { it++; break; }
            this._precond(r, z, pc);
            const rzNew = dot(r, z), beta = rzNew / rz;
            for (let c = 0; c < N; c++) if (T[c] === FLUID) pv[c] = z[c] + beta * pv[c];
            rz = rzNew;
        }
        pOut.set(x); this.iters = it; this.res = Math.sqrt(dot(r, r)) / b2; return pOut;
    }
}

export { PoissonMG3D, AIR, FLUID, SOLID };
if (typeof module !== "undefined" && module.exports) module.exports = { PoissonMG3D, AIR, FLUID, SOLID };
