// FILE: simulation/HitReactionSystem.js
// VERSION: v1 — round 309
//
// Hit reactions for alive kaiju. When a kaiju is damaged but doesn't
// die, briefly inject a wobble offset on a nearby bone for ~0.35 sec.
// The clip animation continues running underneath; the reaction is
// additive on top of the clip pose.
//
// How it differs from Ragdoll (v300-v306):
//   - Ragdoll OVERRIDES the clip pose entirely. Only applies on death.
//     Once active, the kaiju is a physics body.
//   - HitReaction is ADDITIVE. The kaiju stays alive, the clip keeps
//     running (walking/idle/attacking), and a small directional jolt
//     gets layered on top for a moment. Reads as "took a hit but kept
//     fighting".
//
// Implementation uses SkeletalAnimator's `_poseConstraints` array
// (introduced in round 292 for look-at + IK). Constraints run AFTER
// clip evaluation but BEFORE world-matrix composition, so we can
// modify localT/R in-place each frame and the wobble lasts only until
// reactionT decays to zero.
//
// When the kaiju dies and Ragdoll activates, Ragdoll's onPose callback
// runs AFTER our constraint, which means it overwrites the wobble
// completely — no special-case gating needed.
//
// Public API:
//   const hr = new HitReactionSystem({ kaijuManager, meshRenderer });
//   hr.tick(dt);
//   hr.setEnabled(true|false);   // default true
//   hr.snapshot();

const REACTION_DURATION_SEC = 0.35;    // total wobble length
const WOBBLE_OSCILLATIONS   = 4;       // sin cycles over duration
const WOBBLE_PEAK_AMP       = 0.18;    // max localT offset at peak (world units)
const VERT_AMP_SCALE        = 0.4;     // vertical wobble dampened vs horizontal

// Bones we prefer to wobble. Lower-case substring match. We pick a
// random one from the candidates that EXIST in the rig — different
// hits look like they connect with different body parts.
const PREFERRED_BONE_PATTERNS = [
    "head", "chest", "spine", "torso", "neck", "body", "shoulder", "ribcage",
];

export class HitReactionSystem {
    constructor({ kaijuManager, meshRenderer }) {
        if (!kaijuManager) throw new Error("[HitReactionSystem] kaijuManager required");
        if (!meshRenderer) throw new Error("[HitReactionSystem] meshRenderer required");
        this.kaijuManager = kaijuManager;
        this.meshRenderer = meshRenderer;
        this._enabled = true;
        // Map<kaijuId, { animator, constraint, state }>
        this._entries = new Map();
        this.stats = { wired: 0, reactionsTriggered: 0, droppedAfterDespawn: 0 };
    }

    setEnabled(on) { this._enabled = !!on; }
    isEnabled()    { return this._enabled; }

    tick(dt) {
        if (!this._enabled) return;
        // Pass 1 — for each living kaiju, ensure a reaction constraint
        // is attached, and update its state from the kaiju's hit info.
        for (const [id, k] of this.kaijuManager.kaiju) {
            if (k.state === "dying" || k.state === "dead") continue;
            let entry = this._entries.get(id);
            if (!entry) {
                const animator = this.meshRenderer.ensureAnimator?.(id, k.assetId);
                if (!animator || !animator.nodes || animator.nodes.length === 0) continue;
                entry = this._attach(animator, k);
                this._entries.set(id, entry);
                this.stats.wired++;
            }
            this._updateState(entry, k, dt);
        }
        // Pass 2 — drop entries whose kaiju no longer exist OR has died
        // (Ragdoll takes over for dead kaiju via onPose).
        for (const id of [...this._entries.keys()]) {
            const k = this.kaijuManager.kaiju.get(id);
            if (!k || k.state === "dying" || k.state === "dead") {
                this._detach(id);
                this.stats.droppedAfterDespawn++;
            }
        }
    }

    _attach(animator, kaiju) {
        const state = {
            reactionT: 0,                     // 1.0 = fresh, decays to 0
            reactionDir: null,                // unit vector — direction of the hit
            reactionBoneIdx: 0,               // which bone is wobbling this round
            lastSeenHitAge: Number.NEGATIVE_INFINITY,
        };
        // Constraint object shape matches what SkeletalAnimator's
        // _poseConstraints loop expects: { apply(animator) }.
        const constraint = {
            type: "hitReaction",
            apply: (anim) => this._applyConstraint(anim, state),
        };
        if (!animator._poseConstraints) animator._poseConstraints = [];
        animator._poseConstraints.push(constraint);
        return { animator, constraint, state };
    }

    _detach(id) {
        const entry = this._entries.get(id);
        if (!entry) return;
        const arr = entry.animator?._poseConstraints;
        if (arr) {
            const i = arr.indexOf(entry.constraint);
            if (i >= 0) arr.splice(i, 1);
        }
        this._entries.delete(id);
    }

    _updateState(entry, k, dt) {
        const state = entry.state;
        // Detect new hit via the v305 _lastHitAge tag. We only fire
        // a wobble on a transition (new hitAge > lastSeen). This means
        // each hit triggers exactly one reaction — multiple hits in
        // quick succession can stack (the second hit refreshes the
        // wobble before the first finishes).
        const hitAge = k._lastHitAge;
        if (Number.isFinite(hitAge) && hitAge > state.lastSeenHitAge) {
            state.lastSeenHitAge = hitAge;
            state.reactionT = 1.0;
            state.reactionDir = k._lastHitDir || null;
            state.reactionBoneIdx = this._pickBone(entry.animator);
            this.stats.reactionsTriggered++;
        }
        // Decay reactionT toward 0 over REACTION_DURATION_SEC.
        if (state.reactionT > 0) {
            state.reactionT -= dt / REACTION_DURATION_SEC;
            if (state.reactionT < 0) state.reactionT = 0;
        }
    }

    _applyConstraint(animator, state) {
        if (state.reactionT <= 0 || !state.reactionDir) return;
        const idx = state.reactionBoneIdx;
        if (idx < 0 || idx >= animator.localT.length) return;
        const t = state.reactionT;
        const dir = state.reactionDir;
        // Wobble envelope: sin oscillation × linear decay. Phase advances
        // as t goes from 1 (fresh) → 0 (done). With WOBBLE_OSCILLATIONS=4,
        // the wobble does 4 full sin cycles over the reaction duration.
        const phase = (1 - t) * Math.PI * 2 * WOBBLE_OSCILLATIONS;
        const amp = WOBBLE_PEAK_AMP * t;
        const wobble = Math.sin(phase) * amp;
        // Direction: lateral wobble matches hit direction (body shaken
        // in the direction the bullet went). Vertical is dampened so
        // the bone doesn't pop awkwardly skyward on a perpendicular hit.
        const localT = animator.localT[idx];
        localT[0] += dir.x * wobble;
        localT[1] += dir.y * wobble * VERT_AMP_SCALE;
        localT[2] += dir.z * wobble;
    }

    _pickBone(animator) {
        // Build list of bone indices whose name matches one of the
        // preferred patterns. Animator.nodes[].name is set by the GLB
        // loader (round 292). If no matches (e.g. unnamed rig), fall
        // back to bone 1 (typical chest/spine in our procedural rigs)
        // or 0 (root).
        const candidates = [];
        for (let i = 0; i < animator.nodes.length; i++) {
            const name = (animator.nodes[i].name || "").toLowerCase();
            for (const pat of PREFERRED_BONE_PATTERNS) {
                if (name.includes(pat)) { candidates.push(i); break; }
            }
        }
        if (candidates.length > 0) {
            return candidates[Math.floor(Math.random() * candidates.length)];
        }
        return animator.nodes.length > 1 ? 1 : 0;
    }

    snapshot() {
        return {
            wired: this.stats.wired,
            reactionsTriggered: this.stats.reactionsTriggered,
            droppedAfterDespawn: this.stats.droppedAfterDespawn,
            active: this._entries.size,
            enabled: this._enabled,
        };
    }

    clear() {
        for (const id of [...this._entries.keys()]) this._detach(id);
    }
}

export function makeHitReactionSystem(deps) {
    return new HitReactionSystem(deps);
}
