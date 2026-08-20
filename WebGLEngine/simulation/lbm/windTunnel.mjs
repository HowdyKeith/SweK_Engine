// simulation/lbm/windTunnel.mjs
//
// Wind tunnel instrumentation for the LBM lab (v2796). Extends simulation/lbm/lbm2d.js with the three things a
// tunnel actually reports: FORCE on an obstacle (drag and lift), the dimensionless COEFFICIENTS, and STREAMLINES.
//
// Force uses the standard LBM momentum-exchange method: every lattice link that crosses from a fluid node into a
// solid node carries momentum e_i, and bounce-back returns it, so summing e_i * (f_i + f_opp) over the boundary
// links gives the force the fluid exerts on that solid.
//
// WHY THIS IS GRADEABLE (the lab's governing rule -- an instrument needs an answer key):
// in a periodic channel driven by a uniform body force g, at steady state the total momentum the force injects
// into the fluid each step must leave through the solid surfaces. So
//
//     sum over ALL solids of measured force  ==  sum over fluid nodes of rho * g
//
// That identity is derived, not fitted, and it is not what the momentum-exchange sum is built from -- so it is an
// independent check on the force measurement. solidForceBalance() reports both sides.
//
// Pure: takes an lbm instance, no imports. Browser/worker-safe.

// Force on the subset of solid nodes selected by `pick(x, y)`, by momentum exchange over boundary links.
// Returns { fx, fy, links } in lattice units.
export function solidForce(lbm, pick) {
    const { nx, ny, solid, f, Q, E, idx } = lbm;
    let fx = 0, fy = 0, links = 0;
    // Walk SOLID nodes and sum what arrived there from fluid. This implementation bounces back ON the solid node
    // (fp[solid][i] = f[solid][OPP[i]]), so a population arriving with momentum e_i leaves with -e_i: the solid
    // receives 2 * e_i * f_i. Only populations whose SOURCE node (x - e_i) is fluid transfer momentum from the
    // flow -- links arriving from other solid nodes are internal and must not be counted.
    for (let y = 0; y < ny; y++) {
        for (let x = 0; x < nx; x++) {
            const k = idx(x, y);
            if (!solid[k]) continue;
            if (pick && !pick(x, y)) continue;
            for (let i = 1; i < Q; i++) {
                const sx = (x - E[i][0] + nx) % nx;       // where this population came from
                const sy = y - E[i][1];
                if (sy < 0 || sy >= ny) continue;
                if (solid[idx(sx, sy)]) continue;          // internal link -- not a fluid/solid exchange
                const fi = f[k * Q + i];
                fx += 2 * E[i][0] * fi;
                fy += 2 * E[i][1] * fi;
                links++;
            }
        }
    }
    return { fx, fy, links };
}

// Total body force currently applied to the fluid: sum of rho * g over fluid nodes.
export function appliedBodyForce(lbm) {
    const { nx, ny, solid, rho, force, idx } = lbm;
    let m = 0;
    for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) { const k = idx(x, y); if (!solid[k]) m += rho[k]; }
    return { fx: m * force[0], fy: m * force[1], mass: m };
}

// The gradeable identity: force on ALL solids vs the body force driving the flow.
export function solidForceBalance(lbm) {
    const solids = solidForce(lbm, null);
    const applied = appliedBodyForce(lbm);
    const denom = Math.abs(applied.fx) > 1e-12 ? Math.abs(applied.fx) : 1;
    return {
        solidFx: solids.fx, solidFy: solids.fy,
        appliedFx: applied.fx, appliedFy: applied.fy,
        relError: Math.abs(solids.fx - applied.fx) / denom,
    };
}

// Drag / lift coefficients for an obstacle. Cd = 2 F_drag / (rho U^2 D) in 2D (D = frontal width).
// U and rho are the UPSTREAM reference values the caller measured -- never nominal inputs.
export function coefficients({ fx, fy }, { rho = 1, U, D }) {
    const q = rho * U * U * D;
    return { cd: q > 0 ? 2 * fx / q : NaN, cl: q > 0 ? 2 * fy / q : NaN };
}

// Bilinear velocity sample at a continuous point (clamped at the edges).
export function sampleVelocity(lbm, x, y) {
    const { nx, ny, ux, uy, idx } = lbm;
    const x0 = Math.max(0, Math.min(nx - 1, Math.floor(x))), y0 = Math.max(0, Math.min(ny - 1, Math.floor(y)));
    const x1 = Math.min(nx - 1, x0 + 1), y1 = Math.min(ny - 1, y0 + 1);
    const tx = Math.max(0, Math.min(1, x - x0)), ty = Math.max(0, Math.min(1, y - y0));
    const lerp = (a, b, t) => a + (b - a) * t;
    const vx = lerp(lerp(ux[idx(x0, y0)], ux[idx(x1, y0)], tx), lerp(ux[idx(x0, y1)], ux[idx(x1, y1)], tx), ty);
    const vy = lerp(lerp(uy[idx(x0, y0)], uy[idx(x1, y0)], tx), lerp(uy[idx(x0, y1)], uy[idx(x1, y1)], tx), ty);
    return [vx, vy];
}

// Trace one streamline by RK2 (midpoint) through the frozen velocity field. Stops on a solid node, on leaving the
// domain, or when the flow stalls. Returns an array of [x, y] points.
export function streamline(lbm, sx, sy, { steps = 400, ds = 0.5, minSpeed = 1e-9 } = {}) {
    const { nx, ny, solid, idx } = lbm;
    const pts = [[sx, sy]];
    let x = sx, y = sy;
    const isSolidAt = (px, py) => {
        const cx = Math.round(px), cy = Math.round(py);
        if (cx < 0 || cy < 0 || cx >= nx || cy >= ny) return false;
        return !!solid[idx(cx, cy)];
    };
    for (let s = 0; s < steps; s++) {
        const [vx, vy] = sampleVelocity(lbm, x, y);
        const sp = Math.hypot(vx, vy);
        if (!isFinite(sp) || sp < minSpeed) break;
        // midpoint step
        const hx = x + (vx / sp) * ds * 0.5, hy = y + (vy / sp) * ds * 0.5;
        const [mx, my] = sampleVelocity(lbm, hx, hy);
        const ms = Math.hypot(mx, my);
        if (!isFinite(ms) || ms < minSpeed) break;
        const nxp = x + (mx / ms) * ds, nyp = y + (my / ms) * ds;
        if (nyp < 0 || nyp >= ny) break;
        if (isSolidAt(nxp, nyp)) break;                        // never penetrate the obstacle
        x = nxp; y = nyp;
        if (x < 0) x += nx; else if (x >= nx) x -= nx;          // channel is periodic in x
        pts.push([x, y]);
    }
    return pts;
}

// Convenience: a fan of streamlines seeded down the inlet column.
export function streamlineField(lbm, { count = 12, x0 = 1, opts } = {}) {
    const out = [];
    for (let i = 0; i < count; i++) {
        const y = (lbm.ny - 1) * (i + 0.5) / count;
        out.push(streamline(lbm, x0, y, opts));
    }
    return out;
}
