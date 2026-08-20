// physics/mechanics/reposeOps.mjs -- v3630
//
// THE ANGLE OF REPOSE, EXTRACTED SO A PAGE CAN RUN IT.
//
// *** THIS IS v3617'S DEFECT, FOUND A SECOND TIME AND BY KEITH ASKING FOR A LINK. physics/mechanics/contactKeys.mjs
// imports `node:url` AND physics/box3d/box3dNode.mjs AT MODULE SCOPE, so it was STRUCTURALLY UNABLE TO HAVE A
// VISUAL DOOR -- no browser can import it, whatever anybody wired. That is exactly what sirt/adjoint/
// matchedAdjoint/ambiguity did at v3617, and the fix is the same one: the arithmetic MOVES into a module with no
// imports at all, and the Node bootstrap stays where it is. NOTHING IS COPIED -- contactKeys.mjs now delegates,
// and its gate asserts the two are THE SAME FUNCTION OBJECT rather than two implementations that agree today. ***
//
// The box3d wasm module is a PARAMETER here. Node supplies it through box3dNode.mjs; a browser supplies it
// through physics/box3d/box3dLoader.js. Neither route is privileged and neither is mentioned in this file.
//
// THE PHYSICS. A block on a slope of angle theta slides when tan(theta) > mu, so the critical angle is
// atan(mu) -- an EXTERNAL key that neither implementation is ever told while it searches.
//
// *** THE SPEED IS THE DETECTOR AND THE DISPLACEMENT IS NOT, which is the finding contactKeys already carried and
// which travels with the code: a settling box creeps 1.5e-5 to 5.3e-4 below the critical angle, so a DISPLACEMENT
// bound is crossed by a block that is not sliding and the recovered angle then moves with the bound. The speed
// below the critical angle is EXACTLY ZERO. ***
//
// NO IMPORTS. NO node:. NO DOM. That is the whole point of the file.

const vxOf = (m, i = 1) => {
    const n = m._swk_body_count(), p = m._malloc(n * 3 * 4);
    m._swk_velocities(p, n);
    const v = m.HEAPF32[p / 4 + i * 3];
    m._free(p);
    return v;
};

/** Tilt GRAVITY rather than the ramp. Returns the block's speed along the slope after `secs`. */
export function slopeSpeedWith(m, theta, mu, { g = 9.8, secs = 1.5, dt = 1 / 240, substeps = 8 } = {}) {
    m._swk_world_create(g * Math.sin(theta), -g * Math.cos(theta), 0);
    const ground = m._swk_body_box(0, 0, -0.5, 0, 50, 0.5, 50, 1);
    const box = m._swk_body_box(1, 0, 0.5, 0, 0.5, 0.5, 0.5, 1);
    m._swk_body_set_friction(ground, mu);
    m._swk_body_set_friction(box, mu);
    for (let i = 0; i < secs / dt; i++) m._swk_world_step(dt, substeps);
    const v = Math.abs(vxOf(m));
    m._swk_world_destroy();
    return v;
}

/** Bisect on the BINARY outcome. atan(mu) is never consulted while searching -- only afterwards, to grade. */
export function criticalAngleWith(m, mu, { tol = 1e-3, iters = 24, ...opts } = {}) {
    let lo = 0.001, hi = Math.PI / 2 - 0.001;
    for (let i = 0; i < iters; i++) {
        const mid = (lo + hi) / 2;
        if (slopeSpeedWith(m, mid, mu, opts) > tol) hi = mid; else lo = mid;
    }
    const theta = (lo + hi) / 2;
    return { theta, tan: Math.tan(theta), exact: Math.atan(mu), ratio: Math.tan(theta) / mu,
             delta: Math.tan(theta) - mu };
}

/**
 * THE THREE-WAY GRADING KEITH ASKED FOR. Two independent solvers and one closed form:
 *   box3d      -- criticalAngleWith above, a rigid-body wasm solver, answering in RADIANS inside an object
 *   xpbd       -- physics/xpbd/frictionKey.mjs criticalAngle, a particle solver, answering in DEGREES as a number
 *   the key    -- atan(mu), which neither is told
 * `xpbdDeg` is INJECTED so this file keeps its no-imports property; a caller that omits it gets a stated absence.
 */
export function gradeBoth(m, mu, { xpbdDeg = null, opts = {} } = {}) {
    const box = m ? criticalAngleWith(m, mu, opts) : null;
    const exact = Math.atan(mu);
    const x = typeof xpbdDeg === "function" ? xpbdDeg(mu) : null;
    const xRad = x === null ? null : x * Math.PI / 180;
    return {
        mu, exactRad: exact, exactDeg: 180 / Math.PI * exact, exactTan: mu,
        box3d: box === null ? null : { rad: box.theta, deg: 180 / Math.PI * box.theta, tan: box.tan,
            relTan: Math.abs(box.tan - mu) / mu, relAngle: Math.abs(box.theta - exact) / exact },
        xpbd: xRad === null ? null : { rad: xRad, deg: x, tan: Math.tan(xRad),
            relTan: Math.abs(Math.tan(xRad) - mu) / mu, relAngle: Math.abs(xRad - exact) / exact },
        // The two solvers compared to EACH OTHER only after both are compared to the key -- because two solvers
        // agreeing tells you nothing about whether either is right, and this is the pair the v3629 census found
        // could not be compared at all (different units, different shapes, one needing a wasm backend).
        solverGap: box === null || xRad === null ? null : Math.abs(box.theta - xRad),
    };
}
