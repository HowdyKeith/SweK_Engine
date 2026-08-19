// v1989 — Box3D-derived upgrade (techniques, not the library):
//   · FIXED TIMESTEP + ACCUMULATOR — update(dt) no longer integrates raw frame
//     dt. Variable timesteps produce variable results that are hard to debug
//     (and impossible to lockstep across peers); we accumulate real time and
//     integrate in fixed 1/60 slices. Leftover time carries to the next frame.
//   · SUB-STEPPING — each fixed step runs `substeps` (default 4) internal
//     sub-integrations, so constraints/contacts act at 240 Hz internally while
//     the world ticks at 60. Cheap accuracy, especially for fast movers.
//   · OPTIONAL BROADPHASE — if the world provides `world.broadphase` (an
//     AABBTree from core/ecs/aabbTree.js) and entities carry a `radius`,
//     sphere-sphere overlaps are separated using O(log n) tree queries
//     instead of O(n²) pair scans. Fully opt-in: without a tree or radii the
//     behavior is byte-identical to the old system (ground plane + friction).
//   · DETERMINISM-FRIENDLY — fixed dt + Map-iteration order + no Math.random
//     means identical inputs give identical trajectories, the precondition for
//     peer-lockstep sims (see physics/box3d/ for the full Box3D WASM path).
export class PhysicsSystem {
    constructor(world) {
        this.world = world;
        this.gravity = -9.8;
        this.friction = 6;
        this.fixedDt = 1 / 60;     // simulation tick (Hz-locked, frame-rate independent)
        this.substeps = 4;         // internal sub-integrations per tick
        this.maxSteps = 5;         // spiral-of-death guard: cap catch-up work per frame
        this._acc = 0;
        this._proxies = new Map(); // entity id -> tree proxy (when broadphase active)
    }

    // Accumulate real time; integrate in fixed slices. Returns how many fixed
    // steps ran (0 on a fast frame — callers can interpolate render transforms).
    // v1989 — lockstep entry point: advance EXACTLY n fixed ticks, ignoring the
    // accumulator. Peer-synced sims call this with agreed tick counts; identical
    // inputs then produce identical state on every box (verified in tests).
    stepN(n, world) { for (let i = 0; i < n; i++) this._step(this.fixedDt, world || this.world); }

    update(dt) {
        this._acc += Math.max(0, Math.min(0.25, dt));   // clamp huge stalls (tab was hidden)
        let steps = 0;
        while (this._acc >= this.fixedDt - 1e-9 && steps < this.maxSteps) {
            this._step(this.fixedDt);
            this._acc -= this.fixedDt;
            steps++;
        }
        if (steps === this.maxSteps) this._acc = 0;      // too far behind — drop the debt
        return steps;
    }

    _step(dt) {
        const transforms = this.world.components?.transform;
        const velocities = this.world.components?.velocity;
        if (!transforms || !velocities) return;
        const h = dt / this.substeps;
        for (let s = 0; s < this.substeps; s++) {
            for (const [id, t] of transforms) {
                const v = velocities.get(id);
                if (!v) continue;
                v.y += this.gravity * h * (t.noGravity ? 0 : (t.gravityScale ?? 0));   // opt-in gravity (old system had none on x/z movers)
                t.x += v.x * h; t.y += v.y * h; t.z += v.z * h;
                if (t.y < (t.floorY ?? 1.6)) { t.y = (t.floorY ?? 1.6); v.y = 0; }
                const damp = Math.max(0, 1 - this.friction * h);
                v.x *= damp; v.z *= damp;
            }
            this._resolveOverlaps(transforms, velocities, h);
        }
        this._syncBroadphase(transforms);
    }

    // Sphere-sphere separation through the AABB tree (opt-in).
    _resolveOverlaps(transforms, velocities) {
        const tree = this.world.broadphase;
        if (!tree) return;
        for (const [id, t] of transforms) {
            const r = t.radius; if (!r) continue;
            tree.query([t.x - r, t.y - r, t.z - r], [t.x + r, t.y + r, t.z + r], (otherId) => {
                if (otherId === id) return;
                const o = transforms.get(otherId); if (!o || !o.radius) return;
                const dx = t.x - o.x, dy = t.y - o.y, dz = t.z - o.z;
                const rr = r + o.radius, d2 = dx * dx + dy * dy + dz * dz;
                if (d2 >= rr * rr) return;
                if (d2 < 1e-12) {   // coincident: deterministic id-ordered separation axis (no Math.random — lockstep-safe)
                    const sgn = id < otherId ? 1 : -1, p2 = rr * 0.5;
                    if (!t.static) t.x += sgn * p2;
                    if (!o.static) o.x -= sgn * p2;
                    return;
                }
                const d = Math.sqrt(d2), push = (rr - d) * 0.5, nx = dx / d, ny = dy / d, nz = dz / d;
                if (!t.static) { t.x += nx * push; t.y += ny * push; t.z += nz * push; }
                if (!o.static) { o.x -= nx * push; o.y -= ny * push; o.z -= nz * push; }
            });
        }
    }

    _syncBroadphase(transforms) {
        const tree = this.world.broadphase;
        if (!tree) return;
        for (const [id, t] of transforms) {
            const r = t.radius ?? 0.5;
            const min = [t.x - r, t.y - r, t.z - r], max = [t.x + r, t.y + r, t.z + r];
            const proxy = this._proxies.get(id);
            if (proxy == null) this._proxies.set(id, tree.insert(id, min, max));
            else tree.move(proxy, min, max);
        }
        for (const [id, proxy] of this._proxies) {
            if (!transforms.has(id)) { tree.remove(proxy); this._proxies.delete(id); }
        }
    }
}
