// FILE: simulation/Centipede.js
// VERSION: v1 - round 50
//
// 3D centipede: a head + N body segments that follow the head's recent
// trail. Distinct from the kaiju system — this is a snake-y enemy with
// continuous segment chain mechanics. Splits on hit: if segment[i] is
// destroyed, segments [i+1..N-1] form a new centipede with [i+1] as the
// new head.
//
// Movement model:
//   - Head wanders in XZ with smooth heading drift (low-frequency yaw noise)
//   - Y follows the terrain via surfaceY callback
//   - Head pushes a position to the trail buffer every time it has moved
//     SEGMENT_DIST since the last push. Body segments read positions at
//     fixed offsets back in the trail (segment k reads at index k+1).
//   - Distance-keyed pushes (not frame-keyed) so segment spacing is
//     stable regardless of frame rate or speed changes.
//
// Render: head + each body segment is its own ECS entity (kind
// "centipede_head" / "centipede_body"). Updated each frame via
// entity:move so the renderer just sees moving meshes.

let _nextId = 1;

const SEGMENT_DIST  = 0.5;      // world units between trail samples
const SEGMENT_SPACING = 4;      // trail-indices between consecutive segments (= 2 world units)
const MAX_TRAIL    = 400;       // 400 samples * 0.5u = 200m of memory
const HEAD_SPEED   = 7.0;       // m/s
const YAW_DRIFT_RATE = 0.55;    // radians/sec wander
const Y_HOVER      = 0.7;       // body height above ground
// v734 — millipede-style legs per body segment
const LEG_OFFSET    = 0.45;     // lateral distance from segment center (perpendicular to yaw)
// v741 — outward tilt for legs so they splay out from the body like a
// real bug instead of dropping straight down. Roll is applied around
// the segment's forward axis (after yaw rotates into local frame).
const LEG_TILT      = 0.45;     // ±radians (~26°) outward from vertical
const LEG_DROP      = 0.55;     // how far the resting leg foot sits below segment center
const LEG_SWING_AMP = 0.35;     // ± world units forward/back swing
const LEG_LIFT_AMP  = 0.25;     // ± world units up-down during swing
const LEG_PERIOD    = 0.45;     // seconds per full gait cycle
const LEG_WAVES     = 1.8;      // metachronal waves visible along the chain at any moment

export class Centipede {

    constructor({ surfaceY, x = 0, z = 0, yaw = 0, segmentCount = 8, headEntityId = null, segmentEntityIds = null, legLEntityIds = null, legREntityIds = null, trail = null, parentId = null, wanderRadius = 90 }) {
        this.id = _nextId++;
        this.parentId = parentId;          // tracks lineage for split chains
        this.alive = true;
        this._surfaceY = surfaceY;
        this.yaw = yaw;
        this.x = x;
        this.z = z;
        // Round 58 - tunable soft-wander radius. Demo passes ~30 to keep
        // the chain inside a visible arena perimeter.
        this.wanderRadius = wanderRadius;
        // v760 — optional hunt target. When set via setHuntTarget(x, z),
        // the head's yaw drift is overridden by a steering force toward
        // the target (still goes through smoothing so it doesn't snap).
        // The city demo uses this for "centipede chases pedestrians" mode.
        this._huntTarget = null;
        // Round 57 - surfaceY can return null for unloaded chunks; use a
        // sensible spawn-height fallback instead of dropping the chain.
        const initSY = surfaceY ? surfaceY(x, z) : null;
        this.y = (initSY != null ? initSY : 30) + Y_HOVER;
        // Trail buffer: array of {x, y, z}. Newest at index 0, oldest pushed
        // at the end. We read segments at offset (k+1) * SEGMENT_SPACING.
        if (trail) {
            // Inherited trail from a parent split — clone so the parent's
            // future mutations don't leak in.
            this.trail = trail.map(p => ({ x: p.x, y: p.y, z: p.z }));
        } else {
            // Seed the trail with the head's current position so segments
            // have somewhere to sit on first tick (otherwise they default to
            // origin until enough head movement has accumulated).
            this.trail = [];
            const fillCount = (segmentCount + 1) * SEGMENT_SPACING + 1;
            for (let i = 0; i < fillCount; i++) {
                this.trail.push({ x, y: this.y, z });
            }
        }
        // Segment array — each entry: { entityId, hp, x, y, z, legL, legR }
        // v734 — legL/legR are entity IDs for the pair of legs attached to
        // this body segment. Manager populates them at spawn time; they get
        // animated each tick by legPositions(k, time).
        this.segments = [];
        for (let k = 0; k < segmentCount; k++) {
            const idx = (k + 1) * SEGMENT_SPACING;
            const p = this.trail[Math.min(idx, this.trail.length - 1)];
            this.segments.push({
                entityId: segmentEntityIds ? segmentEntityIds[k] : null,
                hp: 1,
                x: p.x, y: p.y, z: p.z,
                legL: legLEntityIds ? legLEntityIds[k] : null,
                legR: legREntityIds ? legREntityIds[k] : null,
            });
        }
        this._legT = 0;   // accumulated time for leg gait phase
        // Head entity id may be passed in if we're inheriting from a split;
        // otherwise the manager will spawn it after construction.
        this.headEntityId = headEntityId;
        // Cosmetic: bobbing phase per segment so the centipede ripples as it
        // moves (very small Y offset added during tick).
        this._bobT = 0;
        // Track distance traveled since last trail push so we sample at
        // SEGMENT_DIST intervals regardless of frame rate.
        this._distSinceLastPush = 0;
    }

    // Advance simulation by dt seconds. The manager calls this per frame.
    // Returns nothing; manager reads positions afterward to push entity:move.
    tick(dt) {
        if (!this.alive) return;
        this._bobT += dt;
        this._legT += dt;
        // v760 — hunt target overrides random yaw drift. When _huntTarget
        // is set, the head steers toward it directly (with smoothing so the
        // chain doesn't snap). Falls back to normal wander when target null.
        if (this._huntTarget) {
            const ht = this._huntTarget;
            const yawToTgt = Math.atan2(ht.x - this.x, ht.z - this.z);
            let delta = yawToTgt - this.yaw;
            while (delta >  Math.PI) delta -= 2 * Math.PI;
            while (delta < -Math.PI) delta += 2 * Math.PI;
            // Strong but smoothed turn — k=0.5/sec ~ feels like a determined predator
            this.yaw += delta * Math.min(1, dt * 2.5);
        } else {
            // Yaw drift: random walk with small per-frame change. Net effect is
            // a meandering path. Tweak: bias slightly toward turning away from
            // the world's edges so centipedes don't get stuck against walls.
            const yawNoise = (Math.random() - 0.5) * 2 * YAW_DRIFT_RATE * dt;
            this.yaw += yawNoise;
        }
        // Round 58 - soft constraint to keep chain inside the wander
        // radius. When near the edge we lerp yaw toward origin direction,
        // with stronger pull as we approach the radius.
        const distFromOrigin = Math.hypot(this.x, this.z);
        if (distFromOrigin > this.wanderRadius) {
            const yawToOrigin = Math.atan2(-this.x, -this.z);
            let delta = yawToOrigin - this.yaw;
            while (delta >  Math.PI) delta -= 2 * Math.PI;
            while (delta < -Math.PI) delta += 2 * Math.PI;
            // Stronger pull when further past the radius (overshoot)
            const overshoot = (distFromOrigin - this.wanderRadius) / 5;
            const k = Math.min(1, dt * (1.5 + overshoot * 2));
            this.yaw += delta * k;
        }
        // Move head along heading
        const dx = Math.sin(this.yaw) * HEAD_SPEED * dt;
        const dz = Math.cos(this.yaw) * HEAD_SPEED * dt;
        this.x += dx;
        this.z += dz;
        // Round 57 - if surfaceY returns null (unloaded chunk), keep the
        // last valid Y instead of dropping. Prevents the "centipede drops
        // through terrain when straying over a chunk boundary that hasn't
        // streamed in yet" bug.
        const sy = this._surfaceY ? this._surfaceY(this.x, this.z) : 0;
        if (sy != null) this.y = sy + Y_HOVER;
        // (else: leave this.y unchanged from previous tick)
        // Distance-based trail push
        this._distSinceLastPush += Math.hypot(dx, dz);
        while (this._distSinceLastPush >= SEGMENT_DIST) {
            this.trail.unshift({ x: this.x, y: this.y, z: this.z });
            if (this.trail.length > MAX_TRAIL) this.trail.length = MAX_TRAIL;
            this._distSinceLastPush -= SEGMENT_DIST;
        }
        // Update each body segment's position from the trail buffer.
        // Round 58 - resample surface Y at each segment's CURRENT xz
        // instead of trusting the historical trail Y. The trail stores
        // {x,y,z} snapshots from when the head visited, so if terrain
        // has changed under those positions (procedural updates, voxel
        // edits) or if the head was at a lower altitude when it visited
        // a now-higher area, segments would appear inside or above the
        // mountain. Always-current surface sampling fixes "centipede
        // flies through mountain" by making each segment hug the terrain
        // at its own xz, regardless of head history.
        for (let k = 0; k < this.segments.length; k++) {
            const seg = this.segments[k];
            if (seg.hp <= 0) continue;
            const idx = Math.min((k + 1) * SEGMENT_SPACING, this.trail.length - 1);
            const p = this.trail[idx];
            // Tiny vertical bob - amplitude shrinks down the chain so the
            // head doesn't whip the tail around when it turns hard.
            const bob = Math.sin(this._bobT * 4 + k * 0.6) * 0.15 * (1 - k / this.segments.length);
            seg.x = p.x;
            seg.z = p.z;
            // Resample surface at the segment's xz. Fallback to trail Y
            // when the chunk isn't loaded (same defensive pattern as the
            // head's update above).
            const segSurf = this._surfaceY ? this._surfaceY(p.x, p.z) : null;
            seg.y = (segSurf != null ? segSurf + Y_HOVER : p.y) + bob;
        }
    }

    // Compute the head's local yaw to "look forward" along its motion.
    // Used by the manager when sending entity:move with a yaw component.
    headYaw() { return this.yaw; }

    // Yaw for a body segment — points toward the trail position one
    // sample ahead so segments visually align with the chain direction.
    segmentYaw(k) {
        const idx = (k + 1) * SEGMENT_SPACING;
        const ahead = this.trail[Math.max(0, idx - SEGMENT_SPACING)];
        const here  = this.trail[Math.min(idx, this.trail.length - 1)];
        if (!ahead || !here) return this.yaw;
        return Math.atan2(ahead.x - here.x, ahead.z - here.z);
    }

    // v734 — compute the world positions of segment k's left + right legs,
    // applying the metachronal-wave gait. Phase depends on segment index
    // (so waves visibly ripple down the body) and global _legT (so the
    // gait cycles forward in time). Left/right are antiphase (π apart) so
    // when one foot is mid-swing the opposite is planted.
    //
    // Returns { lx, ly, lz, rx, ry, rz, lyaw, ryaw, lroll, rroll } in world
    // space. v741 — added lroll/rroll so the leg cylinders tilt outward
    // (rolled around their forward axis) instead of dropping straight down.
    legPositions(k) {
        const seg = this.segments[k];
        const yaw = this.segmentYaw(k);
        const cy = Math.cos(yaw), sy = Math.sin(yaw);
        // Lateral (perpendicular to yaw): yaw points along +Z forward, so
        // the side vector is (cos(yaw), 0, -sin(yaw)) for right and inverted
        // for left.
        const sideX =  cy;
        const sideZ = -sy;
        // Phase: visible wave count along chain + cycle from _legT.
        const N = Math.max(1, this.segments.length);
        const segPhase = (k / N) * 2 * Math.PI * LEG_WAVES;
        const cyc = (this._legT / LEG_PERIOD) * 2 * Math.PI;
        // Forward axis (direction the segment is moving) for swing component.
        const fwdX = sy, fwdZ = cy;
        const buildLeg = (side, phaseShift) => {
            const ph = segPhase + cyc + phaseShift;
            const swing = Math.cos(ph) * LEG_SWING_AMP;
            const rawSin = Math.sin(ph);
            const lift  = rawSin > 0 ? rawSin * LEG_LIFT_AMP : 0;
            const lx = seg.x + sideX * (LEG_OFFSET * side) + fwdX * swing;
            const lz = seg.z + sideZ * (LEG_OFFSET * side) + fwdZ * swing;
            // v741 — raise the leg's Y so the tilted cylinder visually
            // connects to the body. Was seg.y - LEG_DROP (foot drop full
            // distance); now seg.y - LEG_DROP*0.4 so the entity center
            // sits closer to the body and the tilted cylinder sweeps
            // outward to the splayed foot region.
            const ly = seg.y - LEG_DROP * 0.4 + lift;
            // Roll: tilts the cylinder outward, perpendicular to walking
            // direction. side=-1 (left) → negative roll; side=+1 (right)
            // → positive roll. Sign chosen so legs splay AWAY from body.
            const roll = LEG_TILT * side;
            return { x: lx, y: ly, z: lz, yaw, roll };
        };
        const L = buildLeg(-1, 0);            // left
        const R = buildLeg( 1, Math.PI);      // right antiphase
        return { lx: L.x, ly: L.y, lz: L.z, lyaw: L.yaw, lroll: L.roll,
                 rx: R.x, ry: R.y, rz: R.z, ryaw: R.yaw, rroll: R.roll };
    }

    // Split the chain at segment index `i`. Returns the new tail centipede
    // (without spawned entities; manager handles entity allocation), or
    // null if the split would produce an empty tail. Mutates this
    // centipede in place: trims segments[i..] and despawn happens
    // externally by the manager reading the returned dead-segment id.
    splitAt(i) {
        if (i < 0 || i >= this.segments.length) return null;
        // The hit segment dies entirely. Everything after it becomes a new
        // centipede whose head is the (i+1)th segment of the parent.
        const deadSeg = this.segments[i];
        deadSeg.hp = 0;
        const tail = this.segments.slice(i + 1);
        // Trim this centipede's segments to [0..i-1] (the hit segment is
        // removed; the part before it continues as the parent centipede).
        this.segments.length = i;
        if (tail.length === 0) return { deadSeg, newCentipede: null };
        // The new head sits at the position of the first tail segment.
        // Its trail history is the OLDER positions from the parent's
        // trail — specifically from index (i+2)*SPACING onward (since
        // segment[i+1] in the parent was reading at (i+2)*SPACING).
        const newHeadIdx = (i + 2) * SEGMENT_SPACING;
        const inheritedTrail = this.trail.slice(Math.min(newHeadIdx, this.trail.length - 1));
        const newHead = tail[0];
        const newSegments = tail.slice(1);
        const newCent = new Centipede({
            surfaceY: this._surfaceY,
            x: newHead.x, z: newHead.z,
            yaw: this.yaw + (Math.random() - 0.5) * 0.8,   // wander off in a slightly different direction
            segmentCount: newSegments.length,
            headEntityId: newHead.entityId,    // promote tail[0]'s entity to head (caller will reassign kind)
            segmentEntityIds: newSegments.map(s => s.entityId),
            legLEntityIds:    newSegments.map(s => s.legL),
            legREntityIds:    newSegments.map(s => s.legR),
            trail: inheritedTrail.length > 0
                ? inheritedTrail
                : [{ x: newHead.x, y: newHead.y, z: newHead.z }],
            parentId: this.id,
        });
        // Manager is responsible for re-skinning newHead's entity from
        // "centipede_body" to "centipede_head" (despawn + respawn with new
        // kind), despawning newHead's leg pair (heads don't have legs),
        // and updating the segments table to match the new chain.
        return { deadSeg, newCentipede: newCent, newHeadLegL: newHead.legL, newHeadLegR: newHead.legR };
    }

    // v760 — hunt mode: override wander drift with steering toward a target.
    // Pass null to clear and resume wander. Used by the centipede-hunt mode
    // in the city-attack demo for pedestrian pursuit.
    setHuntTarget(x, z) {
        if (x == null || z == null) this._huntTarget = null;
        else this._huntTarget = { x, z };
    }
}
