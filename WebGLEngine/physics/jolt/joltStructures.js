// physics/jolt/joltStructures.js -- destructible battlegrounds on Jolt. Build walls/towers out of boxes joined to
// their neighbors by fixed constraints, so the structure stands rigid until something hits it hard enough -- then
// the constraints at the impact BREAK and the structure crumbles realistically. Breaking is by VELOCITY-DELTA (the
// same backend-agnostic impact signal the combat layer uses): when a jointed box's velocity jumps past a threshold
// on a tick, its constraints are removed, so damage spreads outward from where the hit landed. Deterministic (a
// pure function of the sim + fixed iteration order), so destruction stays in sync across peers under lockstep.
//
// Uses the Jolt handles the JoltWorld exposes via raw(); the box3d-compatible world interface stays untouched.
"use strict";

function createStructures(world) {
    const { Jolt, ps, bodyOf } = world.raw();
    const constraints = [];            // { con, aIdx, bIdx, broken, strength }
    const constrained = new Map();     // bodyIdx -> [constraint entries]
    const lastVel = new Map();         // bodyIdx -> [vx,vy,vz] previous tick

    // strength scales how much impact a joint survives (1 = normal; 2 = twice as tough -> reinforced beams)
    function join(aIdx, bIdx, strength = 1) {
        const fcs = new Jolt.FixedConstraintSettings(); fcs.mAutoDetectPoint = true;
        const con = fcs.Create(bodyOf(aIdx), bodyOf(bIdx)); ps.AddConstraint(con);
        const e = { con, aIdx, bIdx, broken: false, strength }; constraints.push(e);
        if (!constrained.has(aIdx)) constrained.set(aIdx, []); constrained.get(aIdx).push(e);
        if (!constrained.has(bIdx)) constrained.set(bIdx, []); constrained.get(bIdx).push(e);
        return e;
    }
    // a wall: cols x rows grid of dynamic boxes, each joined to its right + upper neighbor. strengthAt(c,r,dir) can
    // reinforce specific joints (return a multiplier); default uniform.
    function addWall({ x = 0, y = 0, z = 0, cols = 6, rows = 5, half = 0.5, gap = 0.02, strengthAt = null } = {}) {
        const grid = [], idxs = [];
        for (let r = 0; r < rows; r++) { grid[r] = []; for (let c = 0; c < cols; c++) {
            const bx = x + (c - (cols - 1) / 2) * (half * 2 + gap), by = y + half + r * (half * 2 + gap);
            const i = world.addBox({ type: "dynamic", pos: [bx, by, z], half: [half, half, half] }); grid[r][c] = i; idxs.push(i);
        } }
        for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
            if (c + 1 < cols) join(grid[r][c], grid[r][c + 1], strengthAt ? strengthAt(c, r, "h") : 1);
            if (r + 1 < rows) join(grid[r][c], grid[r + 1][c], strengthAt ? strengthAt(c, r, "v") : 1);
        }
        return { grid, idxs };
    }
    function _bodyPos(idx) { const xf = world.readTransforms(); return [xf[idx * 7], xf[idx * 7 + 1], xf[idx * 7 + 2]]; }

    // localized breaking: find this tick's IMPACTS (bodies whose velocity spiked, with where + how hard), then break
    // only the joints within a radius that grows with impact energy and shrinks with the joint's strength -- so a hit
    // craters the wall at the point of contact instead of shattering the whole thing, and reinforced joints survive.
    // Per-constraint thresholds + deterministic (fixed iteration order) -> lockstep-safe.
    function update(opts = {}) {
        const impactThresh = opts.impactThresh != null ? opts.impactThresh : 5;    // min |dv| to register an impact
        const baseRadius = opts.baseRadius != null ? opts.baseRadius : 1.1;         // metres of damage per unit ref energy
        const refEnergy = opts.refEnergy != null ? opts.refEnergy : 9;             // dv that yields ~baseRadius of cratering
        const vel = world.readVelocities(), xf = world.readTransforms();
        const impacts = [];
        for (const idx of constrained.keys()) { const o = idx * 3; const cur = [vel[o], vel[o + 1], vel[o + 2]]; const prev = lastVel.get(idx) || cur;
            const dv = Math.hypot(cur[0] - prev[0], cur[1] - prev[1], cur[2] - prev[2]); lastVel.set(idx, cur);
            if (dv > impactThresh) impacts.push({ x: xf[idx * 7], y: xf[idx * 7 + 1], z: xf[idx * 7 + 2], energy: dv });
        }
        if (!impacts.length) return 0;
        let broke = 0;
        for (const e of constraints) { if (e.broken) continue;
            const ax = xf[e.aIdx * 7], ay = xf[e.aIdx * 7 + 1], az = xf[e.aIdx * 7 + 2], bx = xf[e.bIdx * 7], by = xf[e.bIdx * 7 + 1], bz = xf[e.bIdx * 7 + 2];
            const mx = (ax + bx) / 2, my = (ay + by) / 2, mz = (az + bz) / 2;
            for (const im of impacts) { const rad = baseRadius * (im.energy / refEnergy) / e.strength;
                if (Math.hypot(mx - im.x, my - im.y, mz - im.z) < rad) { try { ps.RemoveConstraint(e.con); } catch {} e.broken = true; broke++; break; }
            }
        }
        return broke;
    }
    function breakConstraintsOf(idx) { const list = constrained.get(idx); if (!list) return 0; let n = 0; for (const e of list) if (!e.broken) { try { ps.RemoveConstraint(e.con); } catch {} e.broken = true; n++; } return n; }
    return { addWall, join, update, breakConstraintsOf, constraints, activeCount: () => constraints.filter((c) => !c.broken).length, brokenCount: () => constraints.filter((c) => c.broken).length };
}

export { createStructures };
if (typeof module !== "undefined" && module.exports) module.exports = { createStructures };
