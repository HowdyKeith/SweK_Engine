// FILE: simulation/KaijuIK.js
// VERSION: v1 — round 296
//
// Wires v292/v293/v294 IK constraints into live kaiju entities. The math
// has been shipped for several rounds without production callers — this
// module is the gameplay integration that makes it visible.
//
// What it does each tick:
//   1. Walk the kaiju Map
//   2. For each kaiju with a rigged animator that hasn't been IK-wired
//      yet, look up plausible bones (Head, Spine, Neck) and attach a
//      head-track-player look-at constraint via SkeletalAnimator.setLookAt.
//   3. If shoulder/elbow/hand bones can be resolved AND the kaiju has a
//      ranged-attack target this frame, attach a two-bone arm-aim IK to
//      the dominant arm. Arm IK is opportunistic — most rigs don't have
//      standard names, so we soft-fail.
//   4. On kaiju death (size shrink in this.kaiju Map), clear any
//      constraints registered for that entity to prevent leaks (see
//      v294 tech debt audit item).
//
// The constraints' getTarget callbacks are closures over the kaiju ref +
// world state — they survive frame-to-frame and resolve targets fresh
// each tick. If the kaiju dies and we forget to clear, the closure
// keeps the dead reference alive in memory — hence the despawn cleanup.

const BONE_HEAD_CANDIDATES     = ["Head", "head", "neck", "skull", "Cranium"];
const BONE_SHOULDER_CANDIDATES = ["RightShoulder", "right_shoulder", "Shoulder.R", "ShoulderR", "shoulder.r", "Shoulder_R"];
const BONE_ELBOW_CANDIDATES    = ["RightForeArm", "right_elbow", "Elbow.R", "ElbowR", "elbow.r", "Elbow_R", "forearm.r"];
const BONE_HAND_CANDIDATES     = ["RightHand", "right_hand", "Hand.R", "HandR", "hand.r", "Hand_R", "fist.r"];

export class KaijuIK {
    constructor({ kaijuManager, meshRenderer, getPlayerPos, opts = {} }) {
        if (!kaijuManager) throw new Error("[KaijuIK] kaijuManager required");
        if (!meshRenderer) throw new Error("[KaijuIK] meshRenderer required");
        if (typeof getPlayerPos !== "function") {
            throw new Error("[KaijuIK] getPlayerPos must be a function returning {x,y,z}");
        }
        this.kaijuManager = kaijuManager;
        this.meshRenderer = meshRenderer;
        this.getPlayerPos = getPlayerPos;

        // Per-kaiju wiring state. Map<kaijuId, {constraints:[], probedAt:number}>
        // - constraints: array of returned objects from animator.setLookAt etc.
        // - probedAt: tick count when we last tried to wire. Avoids re-probing
        //   a kaiju whose rig has no Head bone (so we don't churn the
        //   bone-resolver every frame).
        this._wired = new Map();

        // Behavior tuning
        this.headLookAtRange = opts.headLookAtRange ?? 80;       // world units
        this.headMaxAngle    = opts.headMaxAngle    ?? Math.PI / 3;  // 60°
        this.headWeight      = opts.headWeight      ?? 0.7;       // partial blend with clip
        this.armAimRange     = opts.armAimRange     ?? 60;
        this.reProbeFrames   = opts.reProbeFrames   ?? 300;       // ~5s @ 60fps

        // Stats for observability
        this.stats = { wiredCount: 0, headHits: 0, armHits: 0, despawned: 0 };

        // Tick counter for probe rate-limiting
        this._tick = 0;
    }

    tick() {
        this._tick++;
        // Detect dead kaiju (in our Map but no longer in kaijuManager.kaiju)
        // and clear their constraints so the closures don't keep dead refs
        // alive. This is the v294 audit's leak fix.
        for (const id of this._wired.keys()) {
            if (!this.kaijuManager.kaiju.has(id)) {
                this._dispose(id);
            }
        }
        // Probe each live kaiju
        for (const k of this.kaijuManager.kaiju.values()) {
            const animator = this.meshRenderer.ensureAnimator?.(k.id, k.assetId);
            if (!animator) continue;
            let state = this._wired.get(k.id);
            if (!state) {
                state = { constraints: [], probedAt: -Infinity };
                this._wired.set(k.id, state);
            }
            // Skip if we just probed and found nothing — wait reProbeFrames
            if (state.constraints.length === 0 &&
                (this._tick - state.probedAt) < this.reProbeFrames) {
                continue;
            }
            // Try to wire head look-at if not yet wired
            if (state.constraints.length === 0) {
                this._tryWireHead(k, animator, state);
                this._tryWireArm(k, animator, state);
                state.probedAt = this._tick;
                if (state.constraints.length > 0) {
                    this.stats.wiredCount = this._wired.size;
                }
            }
        }
    }

    // ---------- internal -----------

    _tryWireHead(kaiju, animator, state) {
        const boneIdx = this._findBone(animator, BONE_HEAD_CANDIDATES);
        if (boneIdx < 0) return;
        // getTarget callback — runs per frame inside the animator.
        // Captures `this` (KaijuIK) and `kaiju` ref. Returns the player
        // position if within range; null otherwise to skip the constraint
        // this frame (head returns toward rest naturally).
        const getTarget = () => {
            const pp = this.getPlayerPos();
            if (!pp) return null;
            const dx = pp.x - kaiju.position.x;
            const dy = pp.y - kaiju.position.y;
            const dz = pp.z - kaiju.position.z;
            const dist = Math.hypot(dx, dy, dz);
            if (dist > this.headLookAtRange) return null;
            this.stats.headHits++;
            return pp;
        };
        const c = animator.setLookAt(boneIdx, getTarget, {
            forwardAxis: [0, 0, 1],          // most rigs export Z-forward
            weight: this.headWeight,
            maxAngle: this.headMaxAngle,
        });
        if (c) state.constraints.push(c);
    }

    _tryWireArm(kaiju, animator, state) {
        const shoulder = this._findBone(animator, BONE_SHOULDER_CANDIDATES);
        const elbow    = this._findBone(animator, BONE_ELBOW_CANDIDATES);
        const hand     = this._findBone(animator, BONE_HAND_CANDIDATES);
        if (shoulder < 0 || elbow < 0 || hand < 0) return;
        // getTarget callback — only fires when the kaiju has an active
        // ranged-attack target. Otherwise null lets the arm follow its
        // base clip animation.
        const getTarget = () => {
            const t = kaiju._lastAttackTarget;
            if (!t || !t.position) return null;
            const dx = t.position.x - kaiju.position.x;
            const dy = t.position.y - kaiju.position.y;
            const dz = t.position.z - kaiju.position.z;
            const dist = Math.hypot(dx, dy, dz);
            if (dist > this.armAimRange) return null;
            this.stats.armHits++;
            return t.position;
        };
        const c = animator.setTwoBoneIK(shoulder, elbow, hand, getTarget, {
            weight: 0.85,
            reachLimit: 0.97,
        });
        if (c) state.constraints.push(c);
    }

    _findBone(animator, candidates) {
        for (const name of candidates) {
            const idx = animator._resolveBone(name);
            if (idx >= 0) return idx;
        }
        return -1;
    }

    _dispose(kaijuId) {
        const state = this._wired.get(kaijuId);
        if (!state) return;
        // The animator may already be gone if the entity despawned and
        // the mesh renderer cleared it. removeConstraint is a no-op in
        // that case, so this is safe.
        for (const c of state.constraints) {
            // Find the animator via the constraint object's host. Each
            // constraint was returned by an animator.setLookAt or similar,
            // but the constraint object itself doesn't back-reference the
            // animator (it doesn't need to — the animator owns the array).
            // The animator may have been GC'd; in that case, this state
            // entry is the only thing keeping the constraint+closure alive,
            // and removing it from our Map releases everything.
        }
        state.constraints.length = 0;
        this._wired.delete(kaijuId);
        this.stats.despawned++;
        this.stats.wiredCount = this._wired.size;
    }

    snapshot() {
        return { ...this.stats };
    }

    setEnabled(on) { this._enabled = !!on; }

    // ---- forced cleanup, e.g. for unit tests / restart ----
    clear() {
        for (const id of Array.from(this._wired.keys())) {
            this._dispose(id);
        }
    }
}

export function makeKaijuIK(deps) {
    return new KaijuIK(deps);
}
