// Round 41 — Lorenz attractor visualization. Classic chaotic system:
//   dx/dt = σ(y - x)
//   dy/dt = x(ρ - z) - y
//   dz/dt = xy - βz
// With σ=10, ρ=28, β=8/3 → "butterfly" two-lobe attractor.
//
// We integrate N tracers in parallel from slightly different starting
// states. Each frame they get moved along their trajectories; small trail
// particles spawn behind. Over time the structure of the attractor emerges.

const SIGMA = 10.0;
const RHO   = 28.0;
const BETA  = 8.0 / 3.0;
const STEP  = 0.015;      // integration step
const SUBSTEPS = 3;       // per visual frame
const TRACER_COUNT = 60;
const VIS_SCALE = 1.4;    // map state space to world units
const VIS_OFFSET_Y = 35;  // float above terrain

export class LorenzDemo {
    constructor({ router, particles }) {
        this.router = router;
        this.particles = particles;
        this.active = false;
        this.tracers = [];   // {state:[x,y,z], entityId, hue}
    }

    start() {
        this.stop();
        this.active = true;
        for (let i = 0; i < TRACER_COUNT; i++) {
            // Cluster of nearby starting states — small perturbations
            // show off chaos: trajectories diverge dramatically.
            const x0 = 0.1 + (Math.random() - 0.5) * 0.4;
            const y0 = 0.1 + (Math.random() - 0.5) * 0.4;
            const z0 = 0.1 + (Math.random() - 0.5) * 0.4;
            const tracer = {
                state: [x0, y0, z0],
                hue: i / TRACER_COUNT,
                entityId: null,
            };
            const pos = this._project(tracer.state);
            if (this.router) {
                const r = this.router.exec({
                    type: "entity:spawnMesh",
                    assetId: "lorenz_tracer",
                    kind: "lorenz_tracer",
                    x: pos.x, y: pos.y, z: pos.z,
                    scale: 0.35,
                });
                tracer.entityId = r?.id ?? null;
            }
            this.tracers.push(tracer);
        }
        console.log(`[LORENZ] ${TRACER_COUNT} tracers seeded`);
    }

    // v1414 — remote/pad action.
    reset() { this.stop(); this.start(); }

    stop() {
        if (this.router) {
            for (const t of this.tracers) {
                if (t.entityId != null) {
                    this.router.exec({ type: "entity:despawn", id: t.entityId });
                }
            }
        }
        this.tracers.length = 0;
        this.active = false;
    }

    _project(state) {
        // Map state-space (typical range ±30) to world coordinates,
        // centered at origin and floated above terrain.
        return {
            x: state[0] * VIS_SCALE,
            y: state[2] * VIS_SCALE + VIS_OFFSET_Y,    // z (Lorenz) → world Y
            z: state[1] * VIS_SCALE,
        };
    }

    _hslToRgb(h, s, l) {
        const c = (1 - Math.abs(2 * l - 1)) * s;
        const hp = h * 6;
        const x = c * (1 - Math.abs((hp % 2) - 1));
        let r = 0, g = 0, b = 0;
        if      (hp < 1) { r = c; g = x; }
        else if (hp < 2) { r = x; g = c; }
        else if (hp < 3) { g = c; b = x; }
        else if (hp < 4) { g = x; b = c; }
        else if (hp < 5) { r = x; b = c; }
        else             { r = c; b = x; }
        const m = l - c / 2;
        return [r + m, g + m, b + m];
    }

    tick(dt) {
        if (!this.active) return;
        // Sub-step integration for accuracy. Each tracer integrates
        // Lorenz equations forward.
        for (const tracer of this.tracers) {
            const s = tracer.state;
            for (let k = 0; k < SUBSTEPS; k++) {
                // Forward Euler — fine for visualization
                const dx = SIGMA * (s[1] - s[0]);
                const dy = s[0] * (RHO - s[2]) - s[1];
                const dz = s[0] * s[1] - BETA * s[2];
                s[0] += dx * STEP;
                s[1] += dy * STEP;
                s[2] += dz * STEP;
            }
            const pos = this._project(s);
            if (tracer.entityId != null && this.router) {
                this.router.exec({
                    type: "entity:move",
                    id: tracer.entityId, x: pos.x, y: pos.y, z: pos.z,
                });
            }
            // Trail particle
            if (this.particles?.spawn && Math.random() < 0.6) {
                const [r, g, b] = this._hslToRgb(tracer.hue, 0.85, 0.55);
                this.particles.spawn({
                    x: pos.x, y: pos.y, z: pos.z,
                    ttl: 2.2, size: 0.30,
                    r, g, b, a: 0.85,
                });
            }
        }
    }
}
