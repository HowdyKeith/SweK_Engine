// physics/figureEight.js
//
// The most beautiful solution of the three-body problem. Three equal masses, given exactly the right push, chase one
// another forever around a single figure-eight curve -- never colliding, never flying apart, each following the next a
// third of a period behind on the very same track. It was found numerically by Moore in 1993 and proved to exist by
// Chenciner and Montgomery in 2000, and it survives only for one precise set of initial conditions (Simo's numbers
// below); nudge them and it falls apart. It runs on the same N-body gravity and symplectic velocity-Verlet as the orbit
// subsystem -- this module is only the magic initial conditions and the period -- so it is +,-,*,/ and sqrt, and
// bit-identical across machines. A choreography: one curve, three dancers, evenly spaced in time.
import { makeSystem, orbitStep } from "./orbit.js";

export const FIG8_PERIOD = 6.32591;

export function makeFigureEight() {
    const x = 0.97000436, y = -0.24308753, vx = -0.93240737, vy = -0.86473146;
    return makeSystem([
        { m: 1, r: [x, y, 0], v: [-vx / 2, -vy / 2, 0] },
        { m: 1, r: [-x, -y, 0], v: [-vx / 2, -vy / 2, 0] },
        { m: 1, r: [0, 0, 0], v: [vx, vy, 0] },
    ], { G: 1 });
}

export { orbitStep };
