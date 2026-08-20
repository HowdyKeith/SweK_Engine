// multigrid.mjs -- geometric multigrid V-cycle + MGPCG for the FLIP pressure Poisson, GALERKIN coarse operators.
// STATUS (v2346): free-surface convergence fixed by Galerkin coarse operators (A_c = P^T A_f P), and the robust
// solver is MGPCG (multigrid-preconditioned CG), which also handles the near-null-space mode of solid (Neumann)
// walls. See multigrid3d.mjs for the 3D counterpart used by flip3d.
//
// v2346 perf: operators are now stored as a FLATTENED 9-point stencil (Float32Array nc*9) instead of per-cell Maps.
// For bilinear prolongation P and its transpose R = P^T acting on the 5-point fine operator, the Galerkin triple
// product stays within the 3x3 coarse neighborhood at every level, so 9 coefficients per cell capture it exactly.
// The flat layout removes per-cell Map allocation/iteration from the hot assembly + smoother paths. Stencil index
// k = (dy+1)*3 + (dx+1) for dx,dy in {-1,0,1}; k=4 is the diagonal.
"use strict";

const AIR = 0, FLUID = 1, SOLID = 2;
const SR = 2, SW = 2 * SR + 1, SS = SW * SW, SDIAG = SR * SW + SR;   // stencil radius 2 -> 5x5 = 25-point (the true Galerkin width for bilinear transfers)

class PoissonMG {
    constructor(nx, ny, opts = {}) {
        // *** v3785 -- `??` NOT `||`. v3754 moved exactly these five knobs in multigrid3d.mjs AND NEVER TOUCHED
        // THIS FILE, its 2D sibling, which carried the identical defect for thirty-one versions. `pre: 0` and
        // `post: 0` are MEANINGFUL (skip that leg of the smoothing) and were silently rewritten to 2.
        // minDim and coarseIters are LEFT REFUSING ZERO BY VALIDATION rather than by falsy-default, because
        // minDim 0 describes no solver at all -- the same distinction multigrid3d.mjs draws. ***
        this.pre = opts.pre ?? 2; this.post = opts.post ?? 2; this.omega = opts.omega != null ? opts.omega : 1.2;
        this.minDim = opts.minDim ?? 4; this.coarseIters = opts.coarseIters ?? 60;
        if (!(this.pre >= 0) || !(this.post >= 0)) throw new Error("PoissonMG: pre/post must be >= 0");
        if (!(this.minDim >= 1)) throw new Error("PoissonMG: minDim must be >= 1 (got " + opts.minDim + ") -- a coarse grid of zero cells is not a solver");
        this.levels = [];
        let cw = nx, ch = ny;
        while (true) {
            this.levels.push({ nx: cw, ny: ch, h: (nx / cw), type: new Uint8Array(cw * ch), p: new Float32Array(cw * ch), b: new Float32Array(cw * ch), r: new Float32Array(cw * ch), op: new Float32Array(cw * ch * SS) });
            if ((cw % 2) || (ch % 2) || Math.min(cw, ch) <= this.minDim) break;
            cw /= 2; ch /= 2;
        }
    }

    // prolongation weights: fine cell (fi,fj) interpolated from surrounding fluid coarse cells (normalized)
    _pcols(C, fi, fj, out) {
        out.length = 0;
        const gx = (fi + 0.5) * 0.5 - 0.5, gy = (fj + 0.5) * 0.5 - 0.5;
        const i0 = Math.floor(gx), j0 = Math.floor(gy), fx = gx - i0, fy = gy - j0;
        let wsum = 0;
        for (let dj = 0; dj < 2; dj++) for (let di = 0; di < 2; di++) {
            let ci = Math.max(0, Math.min(C.nx - 1, i0 + di)), cj = Math.max(0, Math.min(C.ny - 1, j0 + dj));
            const cc = ci + C.nx * cj; if (C.type[cc] !== FLUID) continue;
            const w = (di ? fx : 1 - fx) * (dj ? fy : 1 - fy); if (w <= 0) continue;
            out.push([cc, ci, cj, w]); wsum += w;
        }
        if (wsum > 0) for (const e of out) e[3] /= wsum;
        return out;
    }

    // fine operator from types -> flat 9-point stencil. A p[c] = (denom*p - sum_fluidnbr p)/h^2
    _buildFineOp(L) {
        const { nx, ny, h } = L, T = L.type, inv = 1 / (h * h), op = L.op; op.fill(0);
        for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
            const c = i + nx * j; if (T[c] !== FLUID) continue;
            let denom = 0; const base = c * SS;
            if (i > 0) { const t = T[c - 1]; if (t !== SOLID) { denom++; if (t === FLUID) op[base + SDIAG - 1] = -inv; } }   // (-1,0)
            if (i < nx - 1) { const t = T[c + 1]; if (t !== SOLID) { denom++; if (t === FLUID) op[base + SDIAG + 1] = -inv; } }   // (+1,0)
            if (j > 0) { const t = T[c - nx]; if (t !== SOLID) { denom++; if (t === FLUID) op[base + SDIAG - SW] = -inv; } }   // (0,-1)
            if (j < ny - 1) { const t = T[c + nx]; if (t !== SOLID) { denom++; if (t === FLUID) op[base + SDIAG + SW] = -inv; } }   // (0,+1)
            op[base + SDIAG] = denom * inv;
        }
    }

    // Galerkin A_c = P^T A_f P into a flat 9-point coarse stencil (scatter)
    _galerkin(F, C) {
        C.op.fill(0); const opC = C.op, opF = F.op, fnx = F.nx, cnx = C.nx;
        const pf = [], pfp = [];
        for (let fj = 0; fj < F.ny; fj++) for (let fi = 0; fi < F.nx; fi++) {
            const f = fi + fnx * fj; if (F.type[f] !== FLUID) continue;
            const fbase = f * SS; this._pcols(C, fi, fj, pf); if (pf.length === 0) continue;
            for (let k = 0; k < SS; k++) {
                const a = opF[fbase + k]; if (a === 0) continue;
                const fdx = (k % SW) - SR, fdy = ((k / SW) | 0) - SR, pfi = fi + fdx, pfj = fj + fdy;
                if (pfi < 0 || pfj < 0 || pfi >= F.nx || pfj >= F.ny) continue;
                this._pcols(C, pfi, pfj, pfp); if (pfp.length === 0) continue;
                for (const e of pf) { const cc = e[0], ci = e[1], cj = e[2], wc = e[3];
                    for (const g of pfp) { const cpi = g[1], cpj = g[2], wcp = g[3], cdx = cpi - ci, cdy = cpj - cj;
                        if (cdx < -SR || cdx > SR || cdy < -SR || cdy > SR) continue;   // Galerkin stays within radius SR
                        opC[cc * SS + (cdy + SR) * SW + (cdx + SR)] += wc * a * wcp; } }
            }
        }
    }

    _applyOp(L, p, i, j, c) {
        const { nx, ny } = L, op = L.op, base = c * SS; let s = 0;
        for (let k = 0; k < SS; k++) { const a = op[base + k]; if (a === 0) continue; const dx = (k % SW) - SR, dy = ((k / SW) | 0) - SR, ni = i + dx, nj = j + dy; if (ni < 0 || nj < 0 || ni >= nx || nj >= ny) continue; s += a * p[ni + nx * nj]; }
        return s;
    }

    _smooth(L, sweeps) {
        const { nx, ny } = L, T = L.type, p = L.p, b = L.b, op = L.op, om = this.omega;
        for (let s = 0; s < sweeps; s++) for (let color = 0; color < 2; color++)
            for (let j = 1; j < ny - 1; j++) for (let i = 1; i < nx - 1; i++) {
                if (((i + j) & 1) !== color) continue;
                const c = i + nx * j; if (T[c] !== FLUID) { p[c] = 0; continue; }
                const base = c * SS, diag = op[base + SDIAG]; if (diag === 0) continue;
                let off = 0;
                for (let k = 0; k < SS; k++) { if (k === SDIAG) continue; const a = op[base + k]; if (a === 0) continue; const dx = (k % SW) - SR, dy = ((k / SW) | 0) - SR; const ni = i + dx, nj = j + dy; if (ni < 0 || nj < 0 || ni >= nx || nj >= ny) continue; off += a * p[ni + nx * nj]; }
                const gs = (b[c] - off) / diag; p[c] += om * (gs - p[c]);
            }
    }

    _residual(L) {
        const { nx, ny } = L, T = L.type, r = L.r, p = L.p, b = L.b;
        for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { const c = i + nx * j; r[c] = (T[c] === FLUID) ? (b[c] - this._applyOp(L, p, i, j, c)) : 0; }
    }

    _coarsenType(F, C) {
        const { nx: cnx, ny: cny } = C, { nx: fnx } = F;
        for (let J = 0; J < cny; J++) for (let I = 0; I < cnx; I++) {
            let anyF = false, anyA = false;
            for (let dj = 0; dj < 2; dj++) for (let di = 0; di < 2; di++) { const t = F.type[(2 * I + di) + fnx * (2 * J + dj)]; if (t === FLUID) anyF = true; else if (t === AIR) anyA = true; }
            C.type[I + cnx * J] = anyF ? FLUID : (anyA ? AIR : SOLID);
        }
    }

    _restrict(F, C) {
        C.b.fill(0); const pf = [];
        for (let fj = 0; fj < F.ny; fj++) for (let fi = 0; fi < F.nx; fi++) {
            const f = fi + F.nx * fj; if (F.type[f] !== FLUID) continue;
            this._pcols(C, fi, fj, pf); const rf = F.r[f];
            for (const e of pf) if (C.type[e[0]] === FLUID) C.b[e[0]] += e[3] * rf;
        }
    }

    _prolongAdd(C, F) {
        const pf = [];
        for (let fj = 0; fj < F.ny; fj++) for (let fi = 0; fi < F.nx; fi++) {
            const f = fi + F.nx * fj; if (F.type[f] !== FLUID) continue;
            this._pcols(C, fi, fj, pf); let val = 0; for (const e of pf) val += e[3] * C.p[e[0]]; F.p[f] += val;
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

    solve(type, div, dt, pOut, vcycles = 3) {
        const F = this.levels[0];
        F.type.set(type);
        const invDt = 1 / dt;
        for (let n = 0; n < F.b.length; n++) F.b[n] = (F.type[n] === FLUID) ? -div[n] * invDt : 0;
        F.p.fill(0);
        for (let L = 0; L < this.levels.length - 1; L++) this._coarsenType(this.levels[L], this.levels[L + 1]);
        this._buildFineOp(F);
        for (let L = 0; L < this.levels.length - 1; L++) this._galerkin(this.levels[L], this.levels[L + 1]);
        for (let v = 0; v < vcycles; v++) this._vcycle(0);
        pOut.set(F.p);
        return pOut;
    }

    fineResidualMax() { const F = this.levels[0]; this._residual(F); let m = 0; for (let n = 0; n < F.r.length; n++) { const a = Math.abs(F.r[n]); if (a > m) m = a; } return m; }

    _applyFineA(x, out) { const F = this.levels[0], T = F.type, nx = F.nx, ny = F.ny; for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { const c = i + nx * j; out[c] = (T[c] === FLUID) ? this._applyOp(F, x, i, j, c) : 0; } }
    /**
     * *** v3785 -- THE SAME FALSY-ZERO v3784 FIXED IN multigrid3d.mjs, IN ITS 2D SIBLING. `(cycles || 1)`
     * turned an asked-for 0 back into 1, so `pcCycles: 0` ran ONE V-CYCLE -- the shipped default -- and the
     * knob was INERT. MEASURED BEFORE THE FIX at n=32: pcCycles 1 and 0 both gave 19 iterations and a
     * BIT-IDENTICAL residual of 8.144e-7. Identical residuals mean THE SAME ARITHMETIC RAN. ***
     */
    _precond(r, z, cycles) {
        const n = cycles == null ? 1 : cycles;
        if (n <= 0) { z.set(r); return; }          // plain CG: the identity preconditioner IS no preconditioner
        const F = this.levels[0]; F.b.set(r); F.p.fill(0);
        for (let v = 0; v < n; v++) this._vcycle(0);
        z.set(F.p);
    }

    solveCG(type, div, dt, pOut, opts = {}) {
        // *** v3785 -- A THIRD INSTANCE IN THE SAME CHAIN, AND IT IS THE ONE THAT MATTERED. Fixing _precond
        // below changed nothing because `opts.pcCycles || 1` HERE turned the 0 into a 1 BEFORE _precond ever
        // saw it. TWO GUARDS ON ONE VALUE, and fixing the inner one alone is invisible.
        // `maxIters: 0` was the same shape -- multigrid3d.mjs's own comment says "maxIters 0 means do nothing
        // and pcCycles 0 means plain CG. Both are askable" -- so both move to `??` together. ***
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
        let b2 = Math.sqrt(dot(b, b)); if (b2 === 0) { pOut.set(x); this.iters = 0; this.res = 0; return pOut; }
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

export { PoissonMG, AIR, FLUID, SOLID };
if (typeof module !== "undefined" && module.exports) module.exports = { PoissonMG, AIR, FLUID, SOLID };
