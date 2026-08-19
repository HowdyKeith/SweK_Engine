// FILE: simulation/Ragdoll.js
// VERSION: v1 — round 300
//
// Position-based dynamics (PBD) ragdoll. When a kaiju dies, instead of
// playing a canned death clip, snapshot its current bone positions and
// hand them to this module — it converts the skeleton into a particle
// system, applies gravity + ground collision, and feeds the resulting
// positions back through SkeletalAnimator's pose constraint hook.
//
// PBD vs Verlet vs full rigid-body:
//   - PBD: positions are the primary state; velocity is implicit
//     (curr - prev). Constraints (bone lengths) are satisfied by direct
//     position projection, not force accumulation. Very stable, easy
//     to tune, no exploding when constraints are tight.
//   - Verlet: similar to PBD but uses force integration. PBD is
//     basically Verlet with iterative position projection.
//   - Rigid-body: each bone is an oriented box with mass + inertia
//     tensor. Realistic but ~5x more compute and needs joint limits
//     to look right. Overkill for kaiju that flop for a second before
//     despawning.
//
// PBD algorithm per substep:
//   1. Predict: position += velocity * dt + gravity * dt²
//   2. Constrain: iterate distance constraints (each bone segment) +
//      ground collision N times. Each pass nudges particle pairs back
//      to their rest distance.
//   3. Derive new velocity from (newPosition - oldPosition) / dt
//   4. Damp velocity to make the motion eventually settle.
//
// Hook into the existing skeletal system via the v292 onPose callback
// — we don't need a new constraint type. Each frame, the ragdoll
// writes its converged positions into the animator's localT array,
// effectively overriding the clip-driven motion.

const GRAVITY_Y = -22;         // m/s² — punchier than real ~9.8 reads better
const GROUND_Y = -10;          // catch-all ground; can be overridden per kaiju
const DAMPING = 0.995;         // per tick — gentle drag; lower = sloppier ragdoll
const SUBSTEPS = 4;            // PBD substeps per tick — more = stiffer
const CONSTRAINT_ITERATIONS = 3;
const MAX_LIFETIME_SEC = 4.0;  // ragdoll auto-despawns after this

export class Ragdoll {
    constructor({
        animator,
        rootPos = {x:0, y:0, z:0},
        groundY = GROUND_Y,
        initialVelocity = null,
        world = null,                              // round 303 — voxel surface query
        maxBendAngle = (150 * Math.PI / 180),      // round 303 — joint hyperextension limit
        maxLifetimeSec = MAX_LIFETIME_SEC,
        activeExtensionEnergy = 0.001,             // round 303 — kinetic threshold for despawn (per-bone |Δpos|² summed; ≈3 m/s avg motion)
        boneMass = null,                           // round 304 — optional per-bone mass override
    } = {}) {
        if (!animator) throw new Error("[Ragdoll] animator required");
        this.animator = animator;
        // v838 — auto-clear any prior dismemberment state on the bridge.
        // If this entityId died before, the bridge may still have
        // detachedBones from the previous life. A new Ragdoll = new death
        // = should start without prior amputations. Safe no-op for
        // animators that don't have the API (e.g. SkeletalAnimator).
        if (typeof animator.clearDetached === "function") {
            animator.clearDetached();
        }
        this.groundY = groundY;
        this.world = world;
        this.maxLifetimeSec = maxLifetimeSec;
        this.activeExtensionEnergy = activeExtensionEnergy;
        // Precompute cos of the angle threshold. maxBendAngle is measured
        // as the largest "straight-out" angle the joint can take before
        // we say the chain is folded (smaller bend = tighter limit).
        // Triangle inequality angle at the middle joint:
        //   180° (straight) → cos = -1   (no constraint needed)
        //   90° (right ang) → cos =  0
        //   0° (fully folded) → cos = +1  (violated)
        // Our constraint fires when measured cos > _angleMinCos.
        // For default 150° max bend, allow folding TO 30° at the joint
        // (i.e., elbow can hyperflex but not invert). cos(30°) = 0.866,
        // and we reject anything above that.
        this._angleMinCos = Math.cos(Math.PI - maxBendAngle);
        // Round 303 — track age in seconds via accumulated dt instead of
        // wall-clock subtraction. Wall-clock breaks unit tests that fire
        // ticks faster than real time, and also misbehaves when the
        // simulation is paused/slowed. dt-accumulated reads the same in
        // a debugger as in normal play.
        this.ageSec = 0;
        this.active = true;
        this._poseHookHandle = null;

        // Snapshot the current LOCAL T of every bone — these are bone
        // positions in PARENT-LOCAL space. We need WORLD-space positions
        // for the physics simulation, then convert back to parent-local
        // when writing the result.
        const N = animator.nodes.length;
        this.boneCount = N;
        this.worldPos = new Array(N);    // current world positions [x,y,z]
        this.prevPos  = new Array(N);    // PBD previous-frame positions
        this.restLen  = new Array(N);    // segment length to PARENT bone (0 if root)
        this.parents  = new Array(N);

        for (let i = 0; i < N; i++) {
            this.worldPos[i] = _boneWorld(animator, i, rootPos);
            this.prevPos[i]  = this.worldPos[i].slice();
            this.parents[i]  = animator.nodes[i].parent;
        }

        // Compute segment lengths from current world positions
        for (let i = 0; i < N; i++) {
            const p = this.parents[i];
            if (p < 0) { this.restLen[i] = 0; continue; }
            const dx = this.worldPos[i][0] - this.worldPos[p][0];
            const dy = this.worldPos[i][1] - this.worldPos[p][1];
            const dz = this.worldPos[i][2] - this.worldPos[p][2];
            this.restLen[i] = Math.hypot(dx, dy, dz);
        }

        // Round 304 — per-bone mass from subtree size.
        //
        // Mass scheme: each bone "represents" itself + all its descendants.
        // A leaf bone (fingertip) carries mass 1. A bone with N descendants
        // carries mass 1 + N. Result: hips/torso are heavy because the
        // whole limb hierarchy hangs off them; fingertips are light. This
        // makes the body flop in a believable way — the heavy core leads,
        // the light extremities flail around it.
        //
        // Two implementation notes:
        // 1. We compute the subtree count by counting how many bones have
        //    a given bone as an ANCESTOR. Walk each bone up to the root
        //    and bump a counter. O(N × depth); for kaiju rigs (≤60 bones
        //    × ~8 depth) it's < 500 ops at spawn time.
        // 2. Caller can override masses via `boneMass` option (array of
        //    length N) if they know the rig semantically — e.g. give the
        //    head a heavy weight even though it has no descendants.
        this.mass = new Array(N).fill(1);
        for (let i = 0; i < N; i++) {
            let cur = this.parents[i];
            while (cur >= 0) {
                this.mass[cur]++;
                cur = this.parents[cur];
            }
        }
        // Apply optional override
        if (Array.isArray(boneMass)) {
            for (let i = 0; i < N && i < boneMass.length; i++) {
                if (Number.isFinite(boneMass[i]) && boneMass[i] > 0) {
                    this.mass[i] = boneMass[i];
                }
            }
        }

        // Apply initial impulse if given — typical: opposite direction
        // of the killing blow. Subtle (0.5-3 m/s) reads as "knocked over"
        // rather than "thrown across the map".
        if (initialVelocity) {
            const vx = initialVelocity.x ?? 0;
            const vy = initialVelocity.y ?? 0;
            const vz = initialVelocity.z ?? 0;
            for (let i = 0; i < N; i++) {
                this.prevPos[i][0] -= vx * (1/60);
                this.prevPos[i][1] -= vy * (1/60);
                this.prevPos[i][2] -= vz * (1/60);
            }
        }

        // Hook into the animator's pose system. The hook writes our
        // particle positions back into localT, overriding the clip.
        // Save the previous onPose so we can chain if there was one.
        this._prevOnPose = animator.onPose;
        animator.onPose = (a) => this._applyToAnimator(a);
    }

    // Step the simulation forward by `dt` seconds.
    tick(dt) {
        if (!this.active) return;
        // Round 303 — accumulate age via dt. See constructor comment.
        this.ageSec += dt;
        // Active-extension lifetime: past the soft cap, measure total
        // kinetic energy and only despawn if the ragdoll has settled.
        // Hard cap at 2× lifetime to prevent perpetual-jiggle leaks.
        if (this.ageSec > this.maxLifetimeSec) {
            const ke = this._kineticEnergy();
            if (ke < this.activeExtensionEnergy || this.ageSec > this.maxLifetimeSec * 2) {
                this.dispose();
                return;
            }
        }
        const dtSub = dt / SUBSTEPS;
        for (let step = 0; step < SUBSTEPS; step++) {
            this._predict(dtSub);
            for (let it = 0; it < CONSTRAINT_ITERATIONS; it++) {
                this._solveDistanceConstraints();
                this._solveAngleLimits();              // round 303
                this._solveGroundCollision();
            }
        }
    }

    // Round 304 — apply an impulse (velocity change) to bones within radius
    // of a world-space point. Used to wake a settling ragdoll when a
    // projectile or explosion hits the corpse — physics returns for a
    // moment, then it re-settles. In PBD, velocity is implicit in
    // (curr - prev); to add velocity v we shift prev BACKWARD along v.
    //
    // Falloff is 1 - (dist/radius)² → bones at the impact center take
    // the full impulse, bones at the boundary take none. Mass weighting
    // means light bones (fingertips) fly farther than heavy ones (hip).
    //
    // Args:
    //   worldPos   — [x, y, z] center of the impact
    //   direction  — [dx, dy, dz] unit vector (need not be normalized)
    //   magnitude  — scalar in m/sec at impact center
    //   radius     — falloff distance in world units
    //
    // Also resets ageSec to 0 so the ragdoll gets a fresh lifetime budget
    // — a projectile-hit corpse should re-flop fully, not despawn 0.1s
    // later because we were about to call it settled.
    applyImpulse(worldPos, direction, magnitude, radius) {
        if (!this.active) return 0;
        if (!Number.isFinite(magnitude) || magnitude <= 0) return 0;
        if (!Number.isFinite(radius) || radius <= 0) return 0;
        const wx = worldPos[0], wy = worldPos[1], wz = worldPos[2];
        // Normalize direction
        let dx = direction[0], dy = direction[1], dz = direction[2];
        const dLen = Math.hypot(dx, dy, dz);
        if (dLen < 1e-6) return 0;
        dx /= dLen; dy /= dLen; dz /= dLen;
        const r2 = radius * radius;
        let affected = 0;
        for (let i = 0; i < this.boneCount; i++) {
            const c = this.worldPos[i];
            const ox = c[0] - wx, oy = c[1] - wy, oz = c[2] - wz;
            const dist2 = ox*ox + oy*oy + oz*oz;
            if (dist2 >= r2) continue;          // strict: boundary = no effect
            // Falloff: full at center, zero at boundary
            const falloff = 1 - (dist2 / r2);
            // Scale impulse: divide by mass so heavy bones move less
            const impulse = magnitude * falloff / this.mass[i];
            // PBD: shift prev backward along impulse to create velocity.
            // We don't multiply by dt here — magnitude is interpreted as
            // m/sec, prev/curr delta IS the per-tick velocity scaled to dt.
            const p = this.prevPos[i];
            p[0] -= dx * impulse * (1/60);    // scaled for 60Hz tick budget
            p[1] -= dy * impulse * (1/60);
            p[2] -= dz * impulse * (1/60);
            affected++;
        }
        if (affected > 0) {
            // Reset lifetime so the second flop gets its full budget
            this.ageSec = 0;
        }
        return affected;
    }

    _kineticEnergy() {
        let sum = 0;
        for (let i = 0; i < this.boneCount; i++) {
            const c = this.worldPos[i], p = this.prevPos[i];
            const dx = c[0] - p[0], dy = c[1] - p[1], dz = c[2] - p[2];
            sum += dx*dx + dy*dy + dz*dz;
        }
        return sum;
    }

    // Verlet-style prediction. velocity = (curr - prev) / dt is implicit
    // in PBD. We update curr = curr + (curr - prev) * damping + gravity*dt²
    // then store prev = curr_before_update for next frame.
    //
    // Note: DAMPING is tuned per-tick. With N substeps per tick, each
    // substep should apply DAMPING^(1/N) to preserve the per-tick rate.
    // Otherwise multi-substep ragdolls lose all velocity to over-damping
    // (0.985^240 ≈ 0.026 over one second of 60-Hz × 4 substeps).
    _predict(dt) {
        const N = this.boneCount;
        const gDt2 = GRAVITY_Y * dt * dt;
        const dampSubstep = Math.pow(DAMPING, 1 / SUBSTEPS);
        for (let i = 0; i < N; i++) {
            const c = this.worldPos[i], p = this.prevPos[i];
            const vx = (c[0] - p[0]) * dampSubstep;
            const vy = (c[1] - p[1]) * dampSubstep;
            const vz = (c[2] - p[2]) * dampSubstep;
            p[0] = c[0]; p[1] = c[1]; p[2] = c[2];
            c[0] += vx;
            c[1] += vy + gDt2;
            c[2] += vz;
        }
    }

    // For each child-parent pair, move both particles so they're at the
    // rest segment length. Each particle gets half the correction
    // (equal mass assumption — kaiju bones are roughly comparable mass).
    _solveDistanceConstraints() {
        const N = this.boneCount;
        const severed = this._severedRoots;
        for (let i = 0; i < N; i++) {
            const p = this.parents[i];
            if (p < 0) continue;
            // Round 306 — limb severance: if this bone is the root of a
            // severed subtree, skip its parent link so the limb is free
            // to fly away. All OTHER links (inside the subtree, and in
            // the rest of the body) remain intact.
            if (severed && severed.has(i)) continue;
            const rest = this.restLen[i];
            const ci = this.worldPos[i], cp = this.worldPos[p];
            const dx = ci[0] - cp[0], dy = ci[1] - cp[1], dz = ci[2] - cp[2];
            const d = Math.hypot(dx, dy, dz);
            if (d < 1e-6) continue;
            // Round 304 — inverse-mass weighted correction.
            // Each bone moves by a share proportional to the OTHER bone's mass:
            // heavy bones absorb the constraint, light bones do most of the
            // motion. This is the standard PBD weighting; when both masses
            // are equal (the round-300 default), it reduces to ½ each.
            //   shareChild  = mParent / (mParent + mChild)
            //   shareParent = mChild  / (mParent + mChild)
            const mi = this.mass[i], mp = this.mass[p];
            const totalM = mi + mp;
            const shareCi = mp / totalM;
            const shareCp = mi / totalM;
            const corr = (d - rest) / d;
            ci[0] -= dx * corr * shareCi; ci[1] -= dy * corr * shareCi; ci[2] -= dz * corr * shareCi;
            cp[0] += dx * corr * shareCp; cp[1] += dy * corr * shareCp; cp[2] += dz * corr * shareCp;
        }
    }

    _solveGroundCollision() {
        const N = this.boneCount;
        const w = this.world;
        for (let i = 0; i < N; i++) {
            const c = this.worldPos[i];
            // Round 303 — per-bone voxel surface query. If the world is
            // available, scan downward at the bone's xz column to find
            // the first solid voxel; use its top as the ground floor.
            // Falls back to the flat groundY plane when the world isn't
            // wired (unit tests, headless contexts).
            let g = this.groundY;
            if (w && typeof w.voxelAt === "function") {
                g = _terrainSurfaceAt(w, c[0], c[2], c[1] + 2, this.groundY);
            }
            if (c[1] < g) {
                c[1] = g;
                const p = this.prevPos[i];
                // Friction on impact — kill horizontal velocity component
                // by pulling prev toward curr
                p[0] = c[0] + (p[0] - c[0]) * 0.5;
                p[2] = c[2] + (p[2] - c[2]) * 0.5;
            }
        }
    }

    // Round 303 — joint angle limits. For each parent-child-grandchild
    // triple, compute the angle at the middle joint. If it's tighter
    // than the configured threshold (joint hyperflexed), rotate the
    // grandchild outward in the bend plane to widen the angle.
    //
    // Degenerate case: when the three bones are colinear (cosA ≈ ±1),
    // there's no unique bend plane. We pick an arbitrary perpendicular
    // axis as fallback — gives the constraint a "direction" to push in
    // even when geometric data alone is ambiguous.
    //
    // PBD soft update: blend the corrected position 70% toward the
    // target rather than snap. Keeps the constraint stable across
    // multiple iterations + the distance constraint pass.
    _solveAngleLimits() {
        const N = this.boneCount;
        const minCos = this._angleMinCos;
        const severed = this._severedRoots;
        for (let i = 0; i < N; i++) {
            const p = this.parents[i];
            if (p < 0) continue;
            const gp = this.parents[p];
            if (gp < 0) continue;
            // Round 306 — limb severance: skip angle triples that cross
            // a severed boundary. If i is the severed root (i->p severed)
            // OR if p is the severed root (p->gp severed), the constraint
            // would pull the limb back toward the body. Keep only triples
            // entirely within the body OR entirely within a severed subtree.
            if (severed && (severed.has(i) || severed.has(p))) continue;
            const a = this.worldPos[gp];
            const b = this.worldPos[p];
            const c = this.worldPos[i];
            // Vectors out of the middle joint b
            let v1x = a[0] - b[0], v1y = a[1] - b[1], v1z = a[2] - b[2];
            let v2x = c[0] - b[0], v2y = c[1] - b[1], v2z = c[2] - b[2];
            const len1 = Math.hypot(v1x, v1y, v1z);
            const len2 = Math.hypot(v2x, v2y, v2z);
            if (len1 < 1e-6 || len2 < 1e-6) continue;
            v1x /= len1; v1y /= len1; v1z /= len1;
            v2x /= len2; v2y /= len2; v2z /= len2;
            // cos(angle between v1, v2): -1 = straight, +1 = folded.
            // Constraint fires when joint is folded tighter than threshold
            // (cosA > minCos means we exceeded the fold limit).
            const cosA = v1x*v2x + v1y*v2y + v1z*v2z;
            if (cosA <= minCos) continue;

            // Find unit vector in the bend plane perpendicular to v1,
            // pointing in the direction v2 currently leans.
            // Decompose v2 = v1*cos + perp*sin → perp = (v2 - v1*cos)/sin.
            // Degenerate when sin → 0 (vectors colinear); fall back to
            // any axis perpendicular to v1.
            let perpX, perpY, perpZ;
            const sinSq = 1 - cosA * cosA;
            if (sinSq > 1e-6) {
                const invSin = 1 / Math.sqrt(sinSq);
                perpX = (v2x - v1x * cosA) * invSin;
                perpY = (v2y - v1y * cosA) * invSin;
                perpZ = (v2z - v1z * cosA) * invSin;
            } else {
                // Pick a stable perpendicular axis to v1.
                if (Math.abs(v1x) < 0.9) {
                    perpX = 1 - v1x * v1x;
                    perpY = -v1x * v1y;
                    perpZ = -v1x * v1z;
                } else {
                    perpX = -v1y * v1x;
                    perpY = 1 - v1y * v1y;
                    perpZ = -v1y * v1z;
                }
                const pl = Math.hypot(perpX, perpY, perpZ) || 1;
                perpX /= pl; perpY /= pl; perpZ /= pl;
            }

            // New v2 direction at the threshold angle: cos·v1 + sin·perp,
            // where cos = minCos (we relax exactly to the limit, not past).
            const newCos = minCos;
            const newSin = Math.sqrt(Math.max(0, 1 - newCos * newCos));
            const newV2x = newCos * v1x + newSin * perpX;
            const newV2y = newCos * v1y + newSin * perpY;
            const newV2z = newCos * v1z + newSin * perpZ;

            // Move c toward the corrected position. 70% blend → the
            // distance constraint can run on next iteration and we
            // converge in 3-5 passes.
            const targetX = b[0] + len2 * newV2x;
            const targetY = b[1] + len2 * newV2y;
            const targetZ = b[2] + len2 * newV2z;
            const blend = 0.7;
            c[0] += (targetX - c[0]) * blend;
            c[1] += (targetY - c[1]) * blend;
            c[2] += (targetZ - c[2]) * blend;
        }
    }

    // Pose hook — writes simulated world positions back to the animator
    // as PARENT-LOCAL translations. Called inside the animator's
    // update() after clip sampling. Effectively replaces the clip's
    // pose with ours.
    _applyToAnimator(a) {
        if (!this.active) return;
        const N = this.boneCount;
        // First write root translation directly (it's in world space already
        // for our purposes; rigid translation is fine).
        // For non-root bones: localT = worldPos[i] - worldPos[parent], expressed
        // in parent's local frame. Since we don't store parent rotations during
        // the sim, we treat the chain as additive translations only. The
        // resulting pose drops the clip's rotations entirely — for ragdoll
        // visuals (a flopping body) this is correct: rotations come from the
        // segment directions, not the original animation.
        for (let i = 0; i < N; i++) {
            const p = this.parents[i];
            if (p < 0) {
                a.localT[i][0] = this.worldPos[i][0];
                a.localT[i][1] = this.worldPos[i][1];
                a.localT[i][2] = this.worldPos[i][2];
                continue;
            }
            const wc = this.worldPos[i], wp = this.worldPos[p];
            a.localT[i][0] = wc[0] - wp[0];
            a.localT[i][1] = wc[1] - wp[1];
            a.localT[i][2] = wc[2] - wp[2];
            // Reset local rotation to identity — segment direction
            // implicitly encodes orientation via parent→child vector.
            a.localR[i][0] = 0;
            a.localR[i][1] = 0;
            a.localR[i][2] = 0;
            a.localR[i][3] = 1;
        }
    }

    dispose() {
        if (!this.active) return;
        this.active = false;
        if (this.animator) {
            this.animator.onPose = this._prevOnPose ?? null;
        }
    }

    // Round 306 — Limb severance.
    //
    // Given a bone index (the root of a subtree we want to detach), compute
    // the full subtree (BFS of descendants via the parents array), apply a
    // separation impulse to all bones in it, and remove the parent-link
    // distance constraint that anchors the subtree to the body.
    //
    // Visually: the limb flies off in `separationDir` while the rest of
    // the body keeps physically settling. Both stay in the SAME ragdoll
    // and use the SAME animator hook — no second Ragdoll instance is
    // needed. The animator renders the limb at its parent-local offset
    // which has now grown large (since severed bone drifted away), so
    // the skinned mesh shows the limb detached in world space.
    //
    // Returns the set of bone indices that were severed (the subtree),
    // or null if the boneIdx is invalid / can't be severed (e.g. root).
    sever(boneIdx, opts = {}) {
        const {
            separationDir = { x: 0, y: 1, z: 0 },      // default: pop up
            separationSpeed = 8,                        // m/sec along dir
            spinSpeed = 0,                              // optional tumble
        } = opts;

        if (!this.active) return null;
        if (boneIdx <= 0 || boneIdx >= this.boneCount) return null;
        const N = this.boneCount;

        // BFS the subtree rooted at boneIdx.
        // children[parent] -> array of children was not pre-computed; do it
        // here in O(N) by scanning parents[].
        const childrenOf = new Array(N);
        for (let i = 0; i < N; i++) childrenOf[i] = [];
        for (let i = 0; i < N; i++) {
            const p = this.parents[i];
            if (p >= 0) childrenOf[p].push(i);
        }
        const subtree = new Set();
        const queue = [boneIdx];
        while (queue.length > 0) {
            const idx = queue.shift();
            if (subtree.has(idx)) continue;
            subtree.add(idx);
            for (const child of childrenOf[idx]) queue.push(child);
        }
        if (subtree.size === 0) return null;

        // Track severed bones for the distance constraint pass to skip
        // the boneIdx-to-parent link. Other links (within the subtree)
        // remain intact so the limb holds its segment lengths.
        if (!this._severedRoots) this._severedRoots = new Set();
        this._severedRoots.add(boneIdx);

        // v840 — auto-sync the animator (bridge) so any sever path
        // (direct ragdoll.sever, RagdollIntegration auto-sever, or
        // RigSystem.severLimb) keeps the bridge's detachedBones set in
        // sync. Safe no-op on animators without the method (SkeletalAnimator).
        if (typeof this.animator.markDetached === "function") {
            this.animator.markDetached(boneIdx);
        }

        // Apply separation impulse to all bones in the subtree.
        // PBD velocity is implicit in (curr - prev); shift prev backward
        // along separationDir to create outward velocity.
        let dx = separationDir.x ?? separationDir[0] ?? 0;
        let dy = separationDir.y ?? separationDir[1] ?? 0;
        let dz = separationDir.z ?? separationDir[2] ?? 0;
        const dLen = Math.hypot(dx, dy, dz) || 1;
        dx /= dLen; dy /= dLen; dz /= dLen;
        const v = separationSpeed * (1/60);   // per-tick velocity at 60Hz

        // Compute subtree centroid for tumble axis (a free axis ~perpendicular
        // to separationDir gives a natural "twirl" look)
        let cx = 0, cy = 0, cz = 0;
        for (const i of subtree) {
            const w = this.worldPos[i];
            cx += w[0]; cy += w[1]; cz += w[2];
        }
        cx /= subtree.size; cy /= subtree.size; cz /= subtree.size;

        for (const i of subtree) {
            const p = this.prevPos[i];
            p[0] -= dx * v;
            p[1] -= dy * v;
            p[2] -= dz * v;

            if (spinSpeed > 0) {
                // Tumble: rotate slightly around the separation axis. For
                // each bone, push perpendicular component of (pos - centroid)
                // along an arbitrary tangent.
                const w = this.worldPos[i];
                const rx = w[0] - cx, ry = w[1] - cy, rz = w[2] - cz;
                // Tangent = separationDir × radius (right-hand rule)
                const tx = dy * rz - dz * ry;
                const ty = dz * rx - dx * rz;
                const tz = dx * ry - dy * rx;
                const tLen = Math.hypot(tx, ty, tz) || 1;
                const sv = spinSpeed * (1/60) / tLen;
                p[0] -= tx * sv;
                p[1] -= ty * sv;
                p[2] -= tz * sv;
            }
        }

        return subtree;
    }

    // v840 — Pick the non-root bone whose current world position is
    // closest to `hitPos`. Used by RagdollIntegration to translate a
    // weapon-hit world position into a specific bone to sever.
    // Optionally enforce minDescendants so callers can avoid severing
    // leaf bones (which have nothing below them, so the limb is a single
    // bone). Returns boneIdx or -1 if no candidate found.
    findClosestBone(hitPos, opts = {}) {
        const { minDescendants = 0, includeRoot = false } = opts;
        if (!hitPos) return -1;
        const hx = hitPos.x ?? hitPos[0] ?? 0;
        const hy = hitPos.y ?? hitPos[1] ?? 0;
        const hz = hitPos.z ?? hitPos[2] ?? 0;
        const N = this.boneCount;
        // Compute descendant counts via single pass (matches severRandomLimb).
        let subtreeSize = null;
        if (minDescendants > 0) {
            subtreeSize = new Array(N).fill(0);
            for (let i = 0; i < N; i++) {
                let cur = i;
                while (cur >= 0) { subtreeSize[cur]++; cur = this.parents[cur]; }
            }
        }
        let bestIdx = -1;
        let bestDist = Infinity;
        for (let i = 0; i < N; i++) {
            if (!includeRoot && i === 0) continue;
            if (subtreeSize && subtreeSize[i] < (minDescendants + 1)) continue;
            const wp = this.worldPos[i];
            const dx = wp[0] - hx, dy = wp[1] - hy, dz = wp[2] - hz;
            const d2 = dx*dx + dy*dy + dz*dz;
            if (d2 < bestDist) { bestDist = d2; bestIdx = i; }
        }
        return bestIdx;
    }

    // Convenience: pick a limb at random and sever it. "Limb" = any
    // subtree whose root is not the body root (bone 0) and has at least
    // `minDescendants` descendants. For most rigs this picks an arm, leg,
    // or tail. The selection is uniform over qualifying candidates.
    severRandomLimb(opts = {}) {
        const { minDescendants = 1, ...severOpts } = opts;
        const N = this.boneCount;
        // Count descendants per bone (BFS sizes)
        const subtreeSize = new Array(N).fill(0);
        for (let i = N - 1; i >= 0; i--) {
            subtreeSize[i] += 1;    // self
            const p = this.parents[i];
            if (p >= 0) subtreeSize[p] += subtreeSize[i];
        }
        // NB: above accumulates incorrectly if we visit non-leaf-first.
        // Recompute via single-pass with proper ordering:
        for (let i = 0; i < N; i++) subtreeSize[i] = 0;
        for (let i = 0; i < N; i++) {
            let cur = i;
            while (cur >= 0) {
                subtreeSize[cur]++;
                cur = this.parents[cur];
            }
        }
        // Candidates: non-root bones with enough descendants (subtree
        // size includes self, so minDescendants + 1 total).
        const candidates = [];
        for (let i = 1; i < N; i++) {
            if (subtreeSize[i] >= 1 + minDescendants) candidates.push(i);
        }
        if (candidates.length === 0) return null;
        const pick = candidates[Math.floor(Math.random() * candidates.length)];
        const subtree = this.sever(pick, severOpts);
        return subtree ? { boneIdx: pick, bones: subtree } : null;
    }
}

// Compute current world position of a bone by composing translations up
// the chain. We use the animator's CURRENT localT (post-clip-sample
// pose) at snapshot time. This is the same kind of walk SkeletalAnimator
// does internally, but exposed for the ragdoll's initialization.
function _boneWorld(animator, boneIdx, rootOffset) {
    const chain = [];
    let cur = boneIdx;
    while (cur >= 0) {
        chain.push(cur);
        cur = animator.nodes[cur].parent;
    }
    chain.reverse();
    let x = rootOffset.x, y = rootOffset.y, z = rootOffset.z;
    for (const idx of chain) {
        // Treat as translation-only — rotations of the parent affect the
        // child's offset direction, but for ragdoll init we accept the
        // rest-pose approximation. The clip pose at the moment of death
        // gives us the visible bone positions; the ragdoll then takes
        // over physically.
        x += animator.localT[idx][0];
        y += animator.localT[idx][1];
        z += animator.localT[idx][2];
    }
    return [x, y, z];
}

// Round 303 — voxel surface query. Scan downward at column (x, z)
// looking for the first solid (non-AIR) voxel, return its TOP world
// Y as the ground floor for that bone. Bounded scan with a step cap
// to avoid pathological loops on enormous empty columns. Falls back
// to `floor` when no solid is found.
//
// VOXEL palette assumption: AIR = 0 (see VoxelEngine memory invariants).
// Water (10) and lava (12) are NOT treated as solid floors — ragdolls
// can submerge slightly before settling on the next solid below.
const _RAGDOLL_AIR_IDS = new Set([0, 10, 11, 12]);    // air + water + flow + lava
const _RAGDOLL_SCAN_STEPS = 64;

function _terrainSurfaceAt(world, x, z, fromY, floor) {
    const ix = Math.floor(x), iz = Math.floor(z);
    let iy = Math.floor(fromY);
    for (let step = 0; step < _RAGDOLL_SCAN_STEPS; step++) {
        if (iy <= floor) return floor;
        let id;
        try { id = world.voxelAt(ix, iy, iz); }
        catch { return floor; }
        if (id !== undefined && id !== null && !_RAGDOLL_AIR_IDS.has(id)) {
            // First solid found — return top of that voxel
            return iy + 1;
        }
        iy--;
    }
    return floor;
}

export function makeRagdoll(deps) {
    return new Ragdoll(deps);
}

// =============================================================================
// Manager — tracks active ragdolls, ticks them, disposes auto-expired
// =============================================================================
export class RagdollManager {
    constructor({ getNow = () => performance.now() } = {}) {
        this._active = new Map();    // entityId → Ragdoll
        this._getNow = getNow;
    }
    spawn(entityId, deps) {
        if (this._active.has(entityId)) {
            this._active.get(entityId).dispose();
        }
        const r = new Ragdoll(deps);
        this._active.set(entityId, r);
        return r;
    }
    tick(dt) {
        for (const [id, r] of this._active) {
            r.tick(dt);
            if (!r.active) this._active.delete(id);
        }
    }
    dispose(entityId) {
        const r = this._active.get(entityId);
        if (r) { r.dispose(); this._active.delete(entityId); }
    }
    clear() {
        for (const r of this._active.values()) r.dispose();
        this._active.clear();
    }
    activeCount() { return this._active.size; }

    /** v835 — public accessor used by RigSystem.severLimb (and tests) */
    getRagdoll(entityId) { return this._active.get(entityId) || null; }


    // Round 304 — broadcast an impulse to all ragdolls within reach.
    // Convenience for projectile/explosion systems: call once, every
    // ragdoll whose bones are inside `radius` of `worldPos` gets the
    // wake-up kick.
    //
    // direction is the push direction (e.g. radially outward from
    // explosion center to ragdoll); caller may pass any vector and we
    // normalize. Returns total bones affected across all ragdolls.
    kick(worldPos, direction, magnitude, radius) {
        let total = 0;
        for (const r of this._active.values()) {
            total += r.applyImpulse(worldPos, direction, magnitude, radius);
        }
        return total;
    }

    // Kick a single ragdoll by entityId (skip the broadcast)
    kickEntity(entityId, worldPos, direction, magnitude, radius) {
        const r = this._active.get(entityId);
        if (!r) return 0;
        return r.applyImpulse(worldPos, direction, magnitude, radius);
    }
}

export function makeRagdollManager(deps) {
    return new RagdollManager(deps);
}
