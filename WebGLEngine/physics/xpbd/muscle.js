// physics/xpbd/muscle.js
//
// Signal-driven actuation -- the coupling that makes a passive mesh into a machine. It is another map on the same
// modulation spine, but with two twists over thermal. It is SELECTIVE: only constraints flagged as muscle fibers
// respond, while passive structural constraints are left alone, so a body can be part rigid frame and part actuator.
// And activation SHORTENS rather than swells: rest = rest0 * (1 - contraction * activation), so a fiber under signal
// pulls its endpoints together and does mechanical work. Because it recomputes from rest0 every frame (spine rule),
// the contraction is temporary -- drop the signal and the fiber relaxes back to rest, the clean contrast with
// plasticity's permanence.
//
// The activation field is a per-node scalar the brain already emits: a spike travelling an SVO path lights up the
// nodes along it, and this coupling turns that lit path into contraction. Here the field is the input; the brain that
// produces it is the separate, already-built system. The map reads only the field snapshot and a constraint's own
// two nodes -- pure per-constraint, order-free. Pure +,-,*,/; bit-identical.
import { modulateConstraints } from "./modulate.js";
export { modulatedSubstep } from "./modulate.js";

// Shorten muscle fibers by up to `contraction` fraction at full activation; leave passive constraints at base.
export function muscleModulate(constraints, activation, opts = {}, order) {
    const contraction = opts.contraction ?? 0.4;   // 0..1: fraction a fiber shortens at activation 1
    modulateConstraints(constraints, (c, rest0, compliance0) => {
        if (!c.muscle) return { rest: rest0, compliance: compliance0 };
        const actEdge = 0.5 * (activation[c.i] + activation[c.j]);
        return { rest: rest0 * (1 - contraction * actEdge), compliance: compliance0 };
    }, order);
}

// Convenience: mark the horizontal fibers of one row of a (W x H) grid as muscle (the actuating band of a strip).
export function markRowFibers(constraints, W, row) {
    for (const c of constraints) {
        const xi = c.i % W, yi = (c.i - xi) / W, xj = c.j % W, yj = (c.j - xj) / W;
        if (yi === row && yj === row && Math.abs(xi - xj) === 1) c.muscle = true;
    }
    return constraints;
}
