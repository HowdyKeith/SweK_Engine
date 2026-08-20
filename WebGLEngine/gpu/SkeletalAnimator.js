// FILE: gpu/SkeletalAnimator.js
// VERSION: v1 — round 19 (stage 1 of GLB skeletal animation pipeline)
//
// SkeletalAnimator drives joint matrix computation each frame. Given
// parsed mesh data (skin + animations + node hierarchy from GLBParser)
// and a current time, it samples the active animation clip and produces
// a flat Float32Array of joint matrices (mat4 per joint) ready to upload
// as a vertex shader uniform array.
//
// Pipeline per frame:
//   1. Sample each animation channel at current time → gives new T/R/S
//      for each animated node.
//   2. Walk the node hierarchy from roots → compute world matrix for
//      every node.
//   3. For each joint in the skin, multiply worldMat by inverseBindMat
//      → gives the skinning matrix the shader uses.
//
// Designed to be cheap on the JS side. The flat matrix array is the
// canonical interface to the renderer (planned in stage 2).

const TMP_QUAT = new Float32Array(4);
const TMP_VEC3 = new Float32Array(3);
const TMP_MAT4 = new Float32Array(16);

export class SkeletalAnimator {
    // mesh: GLBParser output with skin + animations + nodes
    constructor(mesh) {
        this.mesh = mesh;
        this.skin = mesh.skin || null;
        this.animations = mesh.animations || [];
        this.nodes = mesh.nodes || [];
        this.activeClipIdx = 0;
        this.timeSeconds = 0;
        this.loopMode = "loop";   // "loop" | "clamp"

        // Round 52 - per-instance playback speed. 1.0 = real time,
        // 2.0 = double speed, 0.0 = paused. Applied in update().
        this.timeScale = 1.0;

        // Round 292 - per-bone TRS crossfade snapshot. Replaces the
        // round-52 joint-matrix lerp (which had a known scale-dip
        // artifact). setClip() populates this._trsBlendFrom with
        // {T:[],R:[],S:[]} arrays of pre-clip-change locals; update()
        // interpolates T+S linearly and R via slerp until _trsBlendT
        // reaches _trsBlendDur.
        this._trsBlendFrom = null;
        this._trsBlendT = 0;
        this._trsBlendDur = 0;

        // Round 53 - animation events. Subscribers set animator.onEvent
        // to a function (eventName, ctx) => void. Events fire once per
        // playback when the head crosses their time. Loop wrap handled.
        // Events at t=0 don't fire on clip start by convention (use a
        // dedicated "clip:start" hook instead if needed).
        this._lastPlaybackT = 0;
        this.onEvent = null;

        // Working state. nodeMatrices is the per-node 4x4 world matrix
        // computed each frame. jointMatrices is the per-joint output
        // (worldMat * inverseBindMat) the renderer reads.
        this.nodeMatrices = new Array(this.nodes.length);
        for (let i = 0; i < this.nodes.length; i++) {
            this.nodeMatrices[i] = new Float32Array(16);
        }
        const jointCount = this.skin?.joints.length ?? 0;
        this.jointMatrices = new Float32Array(jointCount * 16);
        // Per-frame T/R/S overrides (sampled from animation channels)
        this.localT = new Array(this.nodes.length);
        this.localR = new Array(this.nodes.length);
        this.localS = new Array(this.nodes.length);
        for (let i = 0; i < this.nodes.length; i++) {
            this.localT[i] = new Float32Array(this.nodes[i].translation);
            this.localR[i] = new Float32Array(this.nodes[i].rotation);
            this.localS[i] = new Float32Array(this.nodes[i].scale);
        }
        // Identify root nodes (parent === -1) for hierarchy walks.
        this.roots = [];
        for (let i = 0; i < this.nodes.length; i++) {
            if (this.nodes[i].parent === -1) this.roots.push(i);
        }
    }

    setClip(idx, blendDur = 0.2) {
        if (idx >= 0 && idx < this.animations.length && idx !== this.activeClipIdx) {
            // Round 292 — snapshot current TRS (not matrices) as the blend
            // source. The TRS-level blend in update() interpolates each
            // bone's T/R/S separately and slerps R, eliminating the
            // matrix-lerp scale dip the round-52 version had.
            if (this.skin && blendDur > 0 && this.nodes.length > 0) {
                if (!this._trsBlendFrom) {
                    this._trsBlendFrom = {
                        T: new Array(this.nodes.length),
                        R: new Array(this.nodes.length),
                        S: new Array(this.nodes.length),
                    };
                    for (let i = 0; i < this.nodes.length; i++) {
                        this._trsBlendFrom.T[i] = new Float32Array(3);
                        this._trsBlendFrom.R[i] = new Float32Array(4);
                        this._trsBlendFrom.S[i] = new Float32Array(3);
                    }
                }
                for (let i = 0; i < this.nodes.length; i++) {
                    this._trsBlendFrom.T[i].set(this.localT[i]);
                    this._trsBlendFrom.R[i].set(this.localR[i]);
                    this._trsBlendFrom.S[i].set(this.localS[i]);
                }
                this._trsBlendT = 0;
                this._trsBlendDur = blendDur;
            }
            this.activeClipIdx = idx;
            this.timeSeconds = 0;     // restart from beginning of new clip
            this._lastPlaybackT = 0;  // round 53 - reset event tracking too
        }
    }

    // -----------------------------------------------------------------
    // Round 292 — pose constraint API
    //
    // setLookAt(boneNameOrIdx, getTarget, opts) attaches a look-at
    // constraint that rotates the specified bone so its forward axis
    // points toward a runtime-supplied target. getTarget is called
    // every frame with the animator as argument; return {x,y,z}
    // (world-space) or null to skip the frame.
    //
    // opts:
    //   forwardAxis  default [0, 0, 1]      — bone's local forward dir
    //   weight       default 1.0            — 0..1 blend into the sampled pose
    //   maxAngle     default Math.PI        — clamp deviation from rest
    //
    // Returns the constraint object so callers can unwire via
    // removeConstraint(c) or clearConstraints().
    setLookAt(boneNameOrIdx, getTarget, opts = {}) {
        const boneIdx = this._resolveBone(boneNameOrIdx);
        if (boneIdx < 0) {
            console.warn(`[SkeletalAnimator] setLookAt: bone "${boneNameOrIdx}" not found`);
            return null;
        }
        const forwardAxis = opts.forwardAxis ?? [0, 0, 1];
        const weight      = Math.max(0, Math.min(1, opts.weight ?? 1));
        const maxAngle    = opts.maxAngle ?? Math.PI;
        const constraint = {
            type: "lookAt",
            boneIdx,
            getTarget,
            forwardAxis,
            weight,
            maxAngle,
            apply: (animator) => {
                const target = getTarget(animator);
                if (!target) return;
                _applyLookAt(animator, boneIdx, target, forwardAxis, weight, maxAngle);
            },
        };
        if (!this._poseConstraints) this._poseConstraints = [];
        this._poseConstraints.push(constraint);
        return constraint;
    }

    removeConstraint(c) {
        if (!this._poseConstraints || !c) return false;
        const i = this._poseConstraints.indexOf(c);
        if (i < 0) return false;
        this._poseConstraints.splice(i, 1);
        return true;
    }

    clearConstraints() {
        if (this._poseConstraints) this._poseConstraints.length = 0;
    }

    _resolveBone(nameOrIdx) {
        if (typeof nameOrIdx === "number") {
            return (nameOrIdx >= 0 && nameOrIdx < this.nodes.length) ? nameOrIdx : -1;
        }
        if (typeof nameOrIdx !== "string") return -1;
        const lower = nameOrIdx.toLowerCase();
        let i = this.nodes.findIndex(n => n.name === nameOrIdx);
        if (i >= 0) return i;
        i = this.nodes.findIndex(n => (n.name || "").toLowerCase() === lower);
        if (i >= 0) return i;
        // Substring match (e.g. "head" matches "mixamorig:Head")
        i = this.nodes.findIndex(n => (n.name || "").toLowerCase().includes(lower));
        return i;
    }

    // -----------------------------------------------------------------
    // Round 293 — Two-bone analytical IK
    //
    // Solves a 3-joint chain (root → mid → end) so the end effector
    // reaches a world-space target. Classic cosine-rule formulation —
    // exact, deterministic, fast (no iteration). Best for limbs:
    // shoulder→elbow→hand, hip→knee→foot.
    //
    // setTwoBoneIK(rootBone, midBone, endBone, getTarget, opts):
    //   getTarget(animator) → {x,y,z} world-space, or null to skip
    //   opts:
    //     poleVector  default null → preserves current mid-bone direction
    //                                Otherwise: world-space hint
    //                                {x,y,z} for which side the elbow
    //                                bends toward (back for arm, front
    //                                for leg). Direction only — magnitude
    //                                ignored.
    //     weight      default 1.0   — 0..1 blend into the sampled pose
    //     reachLimit  default 0.995 — clamp target into reachable shell
    //                                at this fraction of (a+b) to avoid
    //                                fully-extended snap
    // -----------------------------------------------------------------
    setTwoBoneIK(rootBone, midBone, endBone, getTarget, opts = {}) {
        const rootIdx = this._resolveBone(rootBone);
        const midIdx  = this._resolveBone(midBone);
        const endIdx  = this._resolveBone(endBone);
        if (rootIdx < 0 || midIdx < 0 || endIdx < 0) {
            console.warn(`[SkeletalAnimator] setTwoBoneIK: bone not found (${rootBone}/${midBone}/${endBone})`);
            return null;
        }
        // Sanity: end's chain should reach root via parents (mid in between)
        if (this.nodes[endIdx].parent !== midIdx ||
            this.nodes[midIdx].parent !== rootIdx) {
            console.warn(`[SkeletalAnimator] setTwoBoneIK: bones don't form a parent chain root→mid→end`);
            // Continue anyway — math still works, but the rig may not respond as expected
        }
        const poleVector = opts.poleVector ?? null;
        const weight     = Math.max(0, Math.min(1, opts.weight ?? 1));
        const reachLimit = Math.max(0.1, Math.min(1.0, opts.reachLimit ?? 0.995));
        const constraint = {
            type: "twoBoneIK",
            rootIdx, midIdx, endIdx,
            getTarget, poleVector, weight, reachLimit,
            apply: (animator) => {
                const target = getTarget(animator);
                if (!target) return;
                _applyTwoBoneIK(animator, rootIdx, midIdx, endIdx, target, poleVector, weight, reachLimit);
            },
        };
        if (!this._poseConstraints) this._poseConstraints = [];
        this._poseConstraints.push(constraint);
        return constraint;
    }

    // -----------------------------------------------------------------
    // Round 293 — FABRIK (Forward And Backward Reaching IK)
    //
    // Iterative position-based IK for chains of any length. Good for
    // tentacles, tails, spines, where analytical solutions don't exist.
    // Converges fast in practice (~3-5 iterations for 8-bone chains).
    //
    // setFabrikIK(boneChain, getTarget, opts):
    //   boneChain  Array of bone names/indices, root-to-end order.
    //              Must be a parent chain in the rig (each is the
    //              parent of the next).
    //   opts:
    //     iterations  default 8  — max passes
    //     tolerance   default 0.01 — stop when end is within this dist
    //     weight      default 1.0
    //     rootPin     default true — keep root fixed in place
    // -----------------------------------------------------------------
    setFabrikIK(boneChain, getTarget, opts = {}) {
        if (!Array.isArray(boneChain) || boneChain.length < 2) {
            console.warn(`[SkeletalAnimator] setFabrikIK: chain needs at least 2 bones`);
            return null;
        }
        const indices = boneChain.map(b => this._resolveBone(b));
        if (indices.some(i => i < 0)) {
            console.warn(`[SkeletalAnimator] setFabrikIK: one or more bones not found: ${boneChain.join(", ")}`);
            return null;
        }
        // Verify parent chain
        for (let k = 1; k < indices.length; k++) {
            if (this.nodes[indices[k]].parent !== indices[k - 1]) {
                console.warn(`[SkeletalAnimator] setFabrikIK: ${boneChain[k]} is not a child of ${boneChain[k-1]}`);
                // Continue — math still works
            }
        }
        const iterations = Math.max(1, Math.min(50, opts.iterations ?? 8));
        const tolerance  = opts.tolerance ?? 0.01;
        const weight     = Math.max(0, Math.min(1, opts.weight ?? 1));
        const rootPin    = opts.rootPin ?? true;
        const constraint = {
            type: "fabrik",
            indices, getTarget, iterations, tolerance, weight, rootPin,
            apply: (animator) => {
                const target = getTarget(animator);
                if (!target) return;
                _applyFabrik(animator, indices, target, iterations, tolerance, weight, rootPin);
            },
        };
        if (!this._poseConstraints) this._poseConstraints = [];
        this._poseConstraints.push(constraint);
        return constraint;
    }


    setClipByName(name, blendDur = 0.2) {
        const idx = this._findClipIndex(name);
        if (idx >= 0) this.setClip(idx, blendDur);
    }

    // Round 56 - resolve a logical clip name against the actual clips on
    // the rig, allowing for the wild variation in how exporters name
    // animations. Tries (in order): exact match, case-insensitive match,
    // contains-as-substring (case-insensitive). The last covers Blender's
    // "Armature|walk", FBX's "Take 001|walk", "walk_cycle", "anim_walk_loop",
    // etc. Returns -1 if no match.
    _findClipIndex(name) {
        if (!name) return -1;
        // 1. Exact match
        let idx = this.animations.findIndex(a => a.name === name);
        if (idx >= 0) return idx;
        // 2. Case-insensitive exact match
        const lower = name.toLowerCase();
        idx = this.animations.findIndex(a => (a.name || "").toLowerCase() === lower);
        if (idx >= 0) return idx;
        // 3. Substring match - looks for "walk" inside "Armature|walk",
        // "walking", etc. First-found wins; order in the rig matters.
        idx = this.animations.findIndex(a => (a.name || "").toLowerCase().includes(lower));
        if (idx >= 0) return idx;
        return -1;
    }

    update(dt) {
        // Round 52 - per-instance speed (1.0 default). timeScale=0 pauses
        // motion but still runs through the pipeline so the joint matrices
        // are correct for the current paused pose.
        this.timeSeconds += dt * this.timeScale;
        const clip = this.animations[this.activeClipIdx];
        if (!clip || !this.skin) return this.jointMatrices;

        // Wrap time within clip duration. Round 56 - per-clip loop mode
        // overrides the animator-wide setting. A clip can carry
        // `loopMode: "clamp"` to hold its final pose (typical for death
        // clips) regardless of how the animator is configured globally.
        const dur = clip.duration > 0 ? clip.duration : 1;
        const clipLoop = clip.loopMode || this.loopMode;
        let t = this.timeSeconds;
        if (clipLoop === "loop") t = t - Math.floor(t / dur) * dur;
        else                     t = Math.min(t, dur);

        // Round 53 - fire animation events in (lastT, t]. Loop wrap
        // splits the range into two: (lastT, dur] then (0, t]. Events
        // at t=0 don't fire on the first frame (interval is open at the
        // low end); use the loop wrap to catch them on subsequent loops.
        // Subscribers may set animator.onEvent to receive callbacks.
        if (clip.events && clip.events.length > 0 && this.onEvent) {
            const lastT = this._lastPlaybackT;
            if (clipLoop === "loop" && t < lastT) {
                // wrapped this frame
                this._fireEventsInRange(clip, lastT, dur);
                this._fireEventsInRange(clip, 0, t);
            } else {
                this._fireEventsInRange(clip, lastT, t);
            }
        }
        this._lastPlaybackT = t;

        // 1. Reset locals to rest pose, then apply sampled overrides
        for (let i = 0; i < this.nodes.length; i++) {
            this.localT[i].set(this.nodes[i].translation);
            this.localR[i].set(this.nodes[i].rotation);
            this.localS[i].set(this.nodes[i].scale);
        }
        for (const ch of clip.channels) {
            if (ch.targetNode == null) continue;
            const samp = clip.samplers[ch.samplerIdx];
            if (!samp) continue;
            const out = ch.path === "translation" ? this.localT[ch.targetNode]
                      : ch.path === "rotation"    ? this.localR[ch.targetNode]
                      : ch.path === "scale"       ? this.localS[ch.targetNode]
                      : null;
            if (!out) continue;
            const compCount = ch.path === "rotation" ? 4 : 3;
            sampleSampler(samp, t, out, compCount);
        }

        // Round 292 — TRS-level crossfade. Replaces the round-52 matrix
        // lerp with proper per-bone TRS interpolation: linear for T+S,
        // slerp for R. Eliminates the scale-dip that matrix lerp showed
        // mid-transition. Applied AT THE LOCAL TRS LEVEL, before world
        // matrices are computed — so the blended pose composes correctly
        // through the hierarchy.
        if (this._trsBlendFrom && this._trsBlendDur > 0) {
            this._trsBlendT += dt;
            if (this._trsBlendT >= this._trsBlendDur) {
                this._trsBlendFrom = null;
                this._trsBlendDur = 0;
            } else {
                const u = Math.min(1, this._trsBlendT / this._trsBlendDur);
                const inv = 1 - u;
                const src = this._trsBlendFrom;
                for (let i = 0; i < this.nodes.length; i++) {
                    const sT = src.T[i], dT = this.localT[i];
                    dT[0] = sT[0] * inv + dT[0] * u;
                    dT[1] = sT[1] * inv + dT[1] * u;
                    dT[2] = sT[2] * inv + dT[2] * u;
                    const sS = src.S[i], dS = this.localS[i];
                    dS[0] = sS[0] * inv + dS[0] * u;
                    dS[1] = sS[1] * inv + dS[1] * u;
                    dS[2] = sS[2] * inv + dS[2] * u;
                    _quatSlerp(src.R[i], this.localR[i], u, this.localR[i]);
                }
            }
        }

        // Round 292 — post-pose constraint hook. After clip sampling +
        // crossfade but BEFORE world matrices are computed, run any
        // registered constraints. They can modify this.localT/R/S for
        // any bone — look-at, sway, foot IK, breathing, etc. The
        // animator itself ships one built-in: look-at via setLookAt().
        // Custom callbacks via this.onPose(animator) → user code.
        if (this._poseConstraints && this._poseConstraints.length > 0) {
            for (const c of this._poseConstraints) {
                try { c.apply(this); }
                catch (e) { console.warn("[SkeletalAnimator] pose constraint failed:", e?.message ?? e); }
            }
        }
        if (this.onPose) {
            try { this.onPose(this); }
            catch (e) { console.warn("[SkeletalAnimator.onPose]", e?.message ?? e); }
        }

        // 2. Walk hierarchy → world matrices
        for (const rootIdx of this.roots) {
            this._composeNode(rootIdx, IDENTITY_MAT4);
        }

        // 3. Skin: jointMatrix = nodeWorld[jointNode] * inverseBindMat
        for (let j = 0; j < this.skin.joints.length; j++) {
            const nodeIdx = this.skin.joints[j];
            const worldMat = this.nodeMatrices[nodeIdx];
            const ibm = this.skin.inverseBindMatrices[j];
            mulMat4(worldMat, ibm, TMP_MAT4);
            this.jointMatrices.set(TMP_MAT4, j * 16);
        }

        return this.jointMatrices;
    }

    _composeNode(nodeIdx, parentMat) {
        const node = this.nodes[nodeIdx];
        const t = this.localT[nodeIdx];
        const r = this.localR[nodeIdx];
        const s = this.localS[nodeIdx];
        // Local matrix = T * R * S
        const localMat = TMP_MAT4;
        composeTRS(t, r, s, localMat);
        // World = parent * local
        const worldMat = this.nodeMatrices[nodeIdx];
        mulMat4(parentMat, localMat, worldMat);
        for (const childIdx of node.children) {
            this._composeNode(childIdx, worldMat);
        }
    }

    // Round 53 - fire animation events in the half-open range (lo, hi].
    // Events come from clip.events: [{ time, name, data? }, ...]. Fired
    // in time order so a subscriber gets them in the same sequence each
    // loop. Wrapped in try/catch so a misbehaving subscriber doesn't
    // break the animator pipeline.
    _fireEventsInRange(clip, lo, hi) {
        if (!clip.events) return;
        for (const ev of clip.events) {
            if (ev.time > lo && ev.time <= hi) {
                try {
                    this.onEvent(ev.name, {
                        time: ev.time,
                        clipName: clip.name,
                        data: ev.data,
                    });
                } catch (e) {
                    console.warn(`[SkeletalAnimator] event "${ev.name}" handler failed:`, e);
                }
            }
        }
    }
}

// -- math helpers (no external dep) ------------------------------------

const IDENTITY_MAT4 = new Float32Array([
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    0, 0, 0, 1,
]);

function composeTRS(t, r, s, out) {
    // out = T * R * S, where R is built from quat (xyzw)
    const qx = r[0], qy = r[1], qz = r[2], qw = r[3];
    const x2 = qx + qx, y2 = qy + qy, z2 = qz + qz;
    const xx = qx * x2, xy = qx * y2, xz = qx * z2;
    const yy = qy * y2, yz = qy * z2, zz = qz * z2;
    const wx = qw * x2, wy = qw * y2, wz = qw * z2;
    const sx = s[0], sy = s[1], sz = s[2];
    out[0]  = (1 - (yy + zz)) * sx;
    out[1]  = (xy + wz) * sx;
    out[2]  = (xz - wy) * sx;
    out[3]  = 0;
    out[4]  = (xy - wz) * sy;
    out[5]  = (1 - (xx + zz)) * sy;
    out[6]  = (yz + wx) * sy;
    out[7]  = 0;
    out[8]  = (xz + wy) * sz;
    out[9]  = (yz - wx) * sz;
    out[10] = (1 - (xx + yy)) * sz;
    out[11] = 0;
    out[12] = t[0];
    out[13] = t[1];
    out[14] = t[2];
    out[15] = 1;
}

function mulMat4(a, b, out) {
    // out = a * b. Column-major (glTF convention).
    const a00 = a[0],  a01 = a[1],  a02 = a[2],  a03 = a[3];
    const a10 = a[4],  a11 = a[5],  a12 = a[6],  a13 = a[7];
    const a20 = a[8],  a21 = a[9],  a22 = a[10], a23 = a[11];
    const a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15];

    let b0 = b[0], b1 = b[1], b2 = b[2], b3 = b[3];
    out[0]  = a00*b0 + a10*b1 + a20*b2 + a30*b3;
    out[1]  = a01*b0 + a11*b1 + a21*b2 + a31*b3;
    out[2]  = a02*b0 + a12*b1 + a22*b2 + a32*b3;
    out[3]  = a03*b0 + a13*b1 + a23*b2 + a33*b3;
    b0 = b[4]; b1 = b[5]; b2 = b[6]; b3 = b[7];
    out[4]  = a00*b0 + a10*b1 + a20*b2 + a30*b3;
    out[5]  = a01*b0 + a11*b1 + a21*b2 + a31*b3;
    out[6]  = a02*b0 + a12*b1 + a22*b2 + a32*b3;
    out[7]  = a03*b0 + a13*b1 + a23*b2 + a33*b3;
    b0 = b[8]; b1 = b[9]; b2 = b[10]; b3 = b[11];
    out[8]  = a00*b0 + a10*b1 + a20*b2 + a30*b3;
    out[9]  = a01*b0 + a11*b1 + a21*b2 + a31*b3;
    out[10] = a02*b0 + a12*b1 + a22*b2 + a32*b3;
    out[11] = a03*b0 + a13*b1 + a23*b2 + a33*b3;
    b0 = b[12]; b1 = b[13]; b2 = b[14]; b3 = b[15];
    out[12] = a00*b0 + a10*b1 + a20*b2 + a30*b3;
    out[13] = a01*b0 + a11*b1 + a21*b2 + a31*b3;
    out[14] = a02*b0 + a12*b1 + a22*b2 + a32*b3;
    out[15] = a03*b0 + a13*b1 + a23*b2 + a33*b3;
}

// Sample a glTF animation sampler at time t. Writes compCount floats
// to out. Supports LINEAR + STEP. CUBICSPLINE falls back to LINEAR for
// now (proper cubic-spline interpolation is more complex; defer).
function sampleSampler(samp, t, out, compCount) {
    const times = samp.times;
    const values = samp.values;
    const n = times.length;
    if (n === 0) {
        for (let i = 0; i < compCount; i++) out[i] = 0;
        return;
    }
    if (t <= times[0]) {
        for (let i = 0; i < compCount; i++) out[i] = values[i];
        return;
    }
    if (t >= times[n - 1]) {
        const base = (n - 1) * compCount;
        for (let i = 0; i < compCount; i++) out[i] = values[base + i];
        return;
    }
    // Binary search for the keyframe interval
    let lo = 0, hi = n - 1;
    while (hi - lo > 1) {
        const mid = (lo + hi) >> 1;
        if (times[mid] <= t) lo = mid;
        else                 hi = mid;
    }
    const t0 = times[lo];
    const t1 = times[hi];
    const u = (t - t0) / (t1 - t0);
    const baseLo = lo * compCount;
    const baseHi = hi * compCount;

    if (samp.interpolation === "STEP") {
        for (let i = 0; i < compCount; i++) out[i] = values[baseLo + i];
        return;
    }
    // LINEAR (also fallback for CUBICSPLINE for now)
    if (compCount === 4) {
        // Quaternion — use NLERP (fast, accurate enough for short
        // time slices). Choose shortest path via dot sign.
        let ax = values[baseLo+0], ay = values[baseLo+1], az = values[baseLo+2], aw = values[baseLo+3];
        let bx = values[baseHi+0], by = values[baseHi+1], bz = values[baseHi+2], bw = values[baseHi+3];
        const dot = ax*bx + ay*by + az*bz + aw*bw;
        const sgn = dot < 0 ? -1 : 1;
        const x = ax + (bx*sgn - ax) * u;
        const y = ay + (by*sgn - ay) * u;
        const z = az + (bz*sgn - az) * u;
        const w = aw + (bw*sgn - aw) * u;
        const inv = 1 / Math.sqrt(x*x + y*y + z*z + w*w || 1);
        out[0] = x * inv; out[1] = y * inv; out[2] = z * inv; out[3] = w * inv;
    } else {
        for (let i = 0; i < compCount; i++) {
            out[i] = values[baseLo + i] + (values[baseHi + i] - values[baseLo + i]) * u;
        }
    }
}

// =============================================================================
// Round 292 — TRS-level crossfade + pose constraints helpers
// =============================================================================

// Spherical linear interpolation of quaternions. Both args (xyzw, length 4),
// scalar u in [0,1]. Writes to `out` (xyzw). Handles shortest-path via dot
// sign flip; falls back to NLERP at near-parallel angles where sin(θ)≈0
// (numerical guard). Safe to call with out === b.
function _quatSlerp(a, b, u, out) {
    let ax = a[0], ay = a[1], az = a[2], aw = a[3];
    let bx = b[0], by = b[1], bz = b[2], bw = b[3];
    let dot = ax*bx + ay*by + az*bz + aw*bw;
    if (dot < 0) {
        // Flip b to take the short way around
        bx = -bx; by = -by; bz = -bz; bw = -bw;
        dot = -dot;
    }
    // Linear if very close (avoid sin(θ)→0 numerical blow-up)
    if (dot > 0.9995) {
        const x = ax + (bx - ax) * u;
        const y = ay + (by - ay) * u;
        const z = az + (bz - az) * u;
        const w = aw + (bw - aw) * u;
        const inv = 1 / Math.sqrt(x*x + y*y + z*z + w*w || 1);
        out[0] = x * inv; out[1] = y * inv; out[2] = z * inv; out[3] = w * inv;
        return;
    }
    const theta0 = Math.acos(Math.max(-1, Math.min(1, dot)));
    const theta  = theta0 * u;
    const sinT0  = Math.sin(theta0);
    const sinT   = Math.sin(theta);
    const s1 = Math.cos(theta) - dot * sinT / sinT0;
    const s2 = sinT / sinT0;
    out[0] = ax * s1 + bx * s2;
    out[1] = ay * s1 + by * s2;
    out[2] = az * s1 + bz * s2;
    out[3] = aw * s1 + bw * s2;
}

// Build a quaternion that rotates one unit vector onto another.
// Both `from` and `to` should be normalized. Writes (xyzw) to `out`.
// Handles the antiparallel case (180°) by picking an arbitrary
// perpendicular axis.
function _quatFromToVec3(from, to, out) {
    const fx = from[0], fy = from[1], fz = from[2];
    const tx = to[0], ty = to[1], tz = to[2];
    let dot = fx*tx + fy*ty + fz*tz;
    if (dot > 0.999999) {
        // Identity
        out[0] = 0; out[1] = 0; out[2] = 0; out[3] = 1;
        return;
    }
    if (dot < -0.999999) {
        // Antiparallel: pick any axis perpendicular to `from` and rotate 180°.
        let ax, ay, az;
        if (Math.abs(fx) < 0.9) { ax = 1; ay = 0; az = 0; }
        else                     { ax = 0; ay = 1; az = 0; }
        // axis = normalize(from × arbitrary)
        const cx = fy*az - fz*ay;
        const cy = fz*ax - fx*az;
        const cz = fx*ay - fy*ax;
        const len = Math.sqrt(cx*cx + cy*cy + cz*cz) || 1;
        out[0] = cx / len; out[1] = cy / len; out[2] = cz / len; out[3] = 0;
        return;
    }
    // General case: axis = from × to, scalar = sqrt((1+dot)*2) / 2
    const cx = fy*tz - fz*ty;
    const cy = fz*tx - fx*tz;
    const cz = fx*ty - fy*tx;
    const s  = Math.sqrt((1 + dot) * 2);
    const inv = 1 / s;
    out[0] = cx * inv;
    out[1] = cy * inv;
    out[2] = cz * inv;
    out[3] = s * 0.5;
}

function _quatMul(a, b, out) {
    const ax = a[0], ay = a[1], az = a[2], aw = a[3];
    const bx = b[0], by = b[1], bz = b[2], bw = b[3];
    out[0] = aw*bx + ax*bw + ay*bz - az*by;
    out[1] = aw*by - ax*bz + ay*bw + az*bx;
    out[2] = aw*bz + ax*by - ay*bx + az*bw;
    out[3] = aw*bw - ax*bx - ay*by - az*bz;
}

const _LOOKAT_TMP_FORWARD_WORLD = new Float32Array(3);
const _LOOKAT_TMP_TARGET_DIR    = new Float32Array(3);
const _LOOKAT_TMP_DELTA_Q       = new Float32Array(4);
const _LOOKAT_TMP_REST_Q        = new Float32Array(4);
const _LOOKAT_TMP_LOCAL_TARGET  = new Float32Array(3);

// Apply a look-at constraint to a single bone. Operates in PARENT-LOCAL
// space: we compute the bone's parent's current world matrix (so far,
// using rest pose or already-modified locals up the chain), invert-
// transform the target into parent-local coords, then build the
// rotation that aims `forwardAxis` at that direction. Replaces the
// bone's localR weighted by `weight`. maxAngle clamps deviation from
// the rest rotation.
function _applyLookAt(animator, boneIdx, target, forwardAxis, weight, maxAngle) {
    if (!animator || boneIdx < 0) return;
    const node = animator.nodes[boneIdx];
    if (!node) return;

    // Compute parent's world transform by composing up the chain from
    // the root using the CURRENT localT/R/S (which may already have
    // been modified by a constraint earlier in the chain — that's
    // intentional, so chained constraints work).
    const parentWorld = _computeParentWorld(animator, boneIdx);
    // Inverse of an affine matrix isn't trivially cheap; for the
    // common case where parentWorld has no scale shear, we can
    // approximate by transforming the world target into parent-local
    // via the inverse of the 4x4. Use a simple inversion.
    const inv = _LOOKAT_TMP_INV;
    if (!_invertMat4(parentWorld, inv)) return;

    // Transform world target into parent-local space (since the bone's
    // localR is expressed in parent-local coords).
    const tx = target.x, ty = target.y, tz = target.z;
    _LOOKAT_TMP_LOCAL_TARGET[0] = inv[0]*tx + inv[4]*ty + inv[8]*tz + inv[12];
    _LOOKAT_TMP_LOCAL_TARGET[1] = inv[1]*tx + inv[5]*ty + inv[9]*tz + inv[13];
    _LOOKAT_TMP_LOCAL_TARGET[2] = inv[2]*tx + inv[6]*ty + inv[10]*tz + inv[14];

    // Direction from bone origin (in parent-local) to target (in parent-local).
    // Bone origin in parent-local is its translation.
    const dx = _LOOKAT_TMP_LOCAL_TARGET[0] - animator.localT[boneIdx][0];
    const dy = _LOOKAT_TMP_LOCAL_TARGET[1] - animator.localT[boneIdx][1];
    const dz = _LOOKAT_TMP_LOCAL_TARGET[2] - animator.localT[boneIdx][2];
    const dlen = Math.sqrt(dx*dx + dy*dy + dz*dz);
    if (dlen < 1e-6) return;
    _LOOKAT_TMP_TARGET_DIR[0] = dx / dlen;
    _LOOKAT_TMP_TARGET_DIR[1] = dy / dlen;
    _LOOKAT_TMP_TARGET_DIR[2] = dz / dlen;

    // Build rotation that maps forwardAxis → targetDir
    const fAx = forwardAxis[0], fAy = forwardAxis[1], fAz = forwardAxis[2];
    const flen = Math.sqrt(fAx*fAx + fAy*fAy + fAz*fAz) || 1;
    _LOOKAT_TMP_FORWARD_WORLD[0] = fAx / flen;
    _LOOKAT_TMP_FORWARD_WORLD[1] = fAy / flen;
    _LOOKAT_TMP_FORWARD_WORLD[2] = fAz / flen;
    _quatFromToVec3(_LOOKAT_TMP_FORWARD_WORLD, _LOOKAT_TMP_TARGET_DIR, _LOOKAT_TMP_DELTA_Q);

    // Clamp by maxAngle: extract rotation angle from quaternion
    // (2 * acos(w)) and rescale if it exceeds the cap.
    if (maxAngle < Math.PI) {
        const w = Math.max(-1, Math.min(1, _LOOKAT_TMP_DELTA_Q[3]));
        const angle = 2 * Math.acos(Math.abs(w));
        if (angle > maxAngle && angle > 1e-6) {
            const k = maxAngle / angle;
            // Re-slerp from identity toward DELTA by factor k
            _LOOKAT_TMP_REST_Q[0] = 0; _LOOKAT_TMP_REST_Q[1] = 0;
            _LOOKAT_TMP_REST_Q[2] = 0; _LOOKAT_TMP_REST_Q[3] = 1;
            _quatSlerp(_LOOKAT_TMP_REST_Q, _LOOKAT_TMP_DELTA_Q, k, _LOOKAT_TMP_DELTA_Q);
        }
    }

    // Final local rotation = (deltaQ ∘ currentLocalR), then slerp from
    // the original by `weight` so partial constraints compose with
    // the sampled clip pose.
    if (weight >= 1.0) {
        _quatMul(_LOOKAT_TMP_DELTA_Q, animator.localR[boneIdx], animator.localR[boneIdx]);
    } else if (weight > 0) {
        _LOOKAT_TMP_REST_Q.set(animator.localR[boneIdx]);
        _quatMul(_LOOKAT_TMP_DELTA_Q, _LOOKAT_TMP_REST_Q, _LOOKAT_TMP_DELTA_Q);
        _quatSlerp(_LOOKAT_TMP_REST_Q, _LOOKAT_TMP_DELTA_Q, weight, animator.localR[boneIdx]);
    }
}

const _LOOKAT_TMP_INV = new Float32Array(16);
const _LOOKAT_TMP_PARENT_WORLD = new Float32Array(16);
const _LOOKAT_TMP_LOCAL_MAT = new Float32Array(16);

// Compose the parent's world transform by walking up from a root using
// the animator's current localT/R/S. Returns a reference to a shared
// Float32Array — do not retain across calls.
function _computeParentWorld(animator, boneIdx) {
    const node = animator.nodes[boneIdx];
    const parent = node.parent;
    if (parent < 0) {
        // Root bone — parent is world identity
        _LOOKAT_TMP_PARENT_WORLD.set([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]);
        return _LOOKAT_TMP_PARENT_WORLD;
    }
    // Build the chain bottom-up
    const chain = [];
    let p = parent;
    while (p >= 0) {
        chain.push(p);
        p = animator.nodes[p].parent;
    }
    chain.reverse();
    // Compose
    _LOOKAT_TMP_PARENT_WORLD.set([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]);
    for (const idx of chain) {
        composeTRS(animator.localT[idx], animator.localR[idx], animator.localS[idx], _LOOKAT_TMP_LOCAL_MAT);
        // _LOOKAT_TMP_PARENT_WORLD = _LOOKAT_TMP_PARENT_WORLD * localMat
        // Use temp via TMP_MAT4 because mulMat4 doesn't accept aliasing
        const tmp = TMP_MAT4;
        mulMat4(_LOOKAT_TMP_PARENT_WORLD, _LOOKAT_TMP_LOCAL_MAT, tmp);
        _LOOKAT_TMP_PARENT_WORLD.set(tmp);
    }
    return _LOOKAT_TMP_PARENT_WORLD;
}

// 4x4 matrix inversion via cofactor expansion. Writes to `out`,
// returns true on success, false if singular. Column-major.
function _invertMat4(m, out) {
    const m00 = m[0],  m01 = m[1],  m02 = m[2],  m03 = m[3];
    const m10 = m[4],  m11 = m[5],  m12 = m[6],  m13 = m[7];
    const m20 = m[8],  m21 = m[9],  m22 = m[10], m23 = m[11];
    const m30 = m[12], m31 = m[13], m32 = m[14], m33 = m[15];
    const b00 = m00*m11 - m01*m10;
    const b01 = m00*m12 - m02*m10;
    const b02 = m00*m13 - m03*m10;
    const b03 = m01*m12 - m02*m11;
    const b04 = m01*m13 - m03*m11;
    const b05 = m02*m13 - m03*m12;
    const b06 = m20*m31 - m21*m30;
    const b07 = m20*m32 - m22*m30;
    const b08 = m20*m33 - m23*m30;
    const b09 = m21*m32 - m22*m31;
    const b10 = m21*m33 - m23*m31;
    const b11 = m22*m33 - m23*m32;
    const det = b00*b11 - b01*b10 + b02*b09 + b03*b08 - b04*b07 + b05*b06;
    if (Math.abs(det) < 1e-12) return false;
    const inv = 1 / det;
    out[0]  = ( m11*b11 - m12*b10 + m13*b09) * inv;
    out[1]  = (-m01*b11 + m02*b10 - m03*b09) * inv;
    out[2]  = ( m31*b05 - m32*b04 + m33*b03) * inv;
    out[3]  = (-m21*b05 + m22*b04 - m23*b03) * inv;
    out[4]  = (-m10*b11 + m12*b08 - m13*b07) * inv;
    out[5]  = ( m00*b11 - m02*b08 + m03*b07) * inv;
    out[6]  = (-m30*b05 + m32*b02 - m33*b01) * inv;
    out[7]  = ( m20*b05 - m22*b02 + m23*b01) * inv;
    out[8]  = ( m10*b10 - m11*b08 + m13*b06) * inv;
    out[9]  = (-m00*b10 + m01*b08 - m03*b06) * inv;
    out[10] = ( m30*b04 - m31*b02 + m33*b00) * inv;
    out[11] = (-m20*b04 + m21*b02 - m23*b00) * inv;
    out[12] = (-m10*b09 + m11*b07 - m12*b06) * inv;
    out[13] = ( m00*b09 - m01*b07 + m02*b06) * inv;
    out[14] = (-m30*b03 + m31*b01 - m32*b00) * inv;
    out[15] = ( m20*b03 - m21*b01 + m22*b00) * inv;
    return true;
}

// =============================================================================
// Round 293 — Multi-bone IK solvers
// =============================================================================

const _IK_TMP_INV    = new Float32Array(16);
const _IK_TMP_LOCAL  = new Float32Array(16);
const _IK_TMP_PARENT = new Float32Array(16);

// Round 294 — module-scope scratch quats for _applyTwoBoneIK and
// _applyFabrik. Previously these were allocated per-frame per-constraint
// (~10 Float32Array(4)s per call); with N kaiju × M constraints × 60fps
// that's hundreds-to-thousands of small allocations/sec churning the GC.
// Now reused; the math doesn't aliasing-fail because each function
// uses them in a strict read-once-write-once pattern within one call.
const _IK_TMP_dRootW     = new Float32Array(4);
const _IK_TMP_dMidW      = new Float32Array(4);
const _IK_TMP_dW         = new Float32Array(4);
const _IK_TMP_parentRoot = new Float32Array(4);
const _IK_TMP_parentMid  = new Float32Array(4);
const _IK_TMP_parentBone = new Float32Array(4);
const _IK_TMP_invPR      = new Float32Array(4);
const _IK_TMP_invPM      = new Float32Array(4);
const _IK_TMP_invP       = new Float32Array(4);
const _IK_TMP_quatA      = new Float32Array(4);
const _IK_TMP_quatB      = new Float32Array(4);
const _IK_TMP_dRootLocal = new Float32Array(4);
const _IK_TMP_dMidLocal  = new Float32Array(4);
const _IK_TMP_dLocal     = new Float32Array(4);
const _IK_TMP_idQ        = new Float32Array([0, 0, 0, 1]);
// _computeBoneWorld returns a Float32Array(16) — pool it too. Note the
// callers retain the result only briefly (read translation, extract
// rotation), so we can reuse across multiple sequential calls in the
// same constraint without aliasing risk if we copy out what we need.
const _IK_TMP_BONE_WORLD = new Float32Array(16);
// Allocate a small pool of 5 to cover the most chained call site
// (two-bone IK reads root/mid/end + later remeasures mid/end = 5 calls).
// Round-robin index cycles between them so back-to-back calls don't
// trample each other's results before the caller reads them.
const _IK_BONE_WORLD_POOL = [
    new Float32Array(16), new Float32Array(16), new Float32Array(16),
    new Float32Array(16), new Float32Array(16),
];
let _ikBoneWorldCursor = 0;

// Compute world transform of a node by composing localT/R/S up the chain
// from the root using the animator's CURRENT locals (constraints earlier
// in the apply list may have modified them). Returns a Float32Array(16)
// drawn from the IK pool — caller MUST consume the data before the
// next 5 calls (pool cycles round-robin).
function _computeBoneWorld(animator, boneIdx) {
    const chain = [];
    let cur = boneIdx;
    while (cur >= 0) {
        chain.push(cur);
        cur = animator.nodes[cur].parent;
    }
    chain.reverse();
    const out = _IK_BONE_WORLD_POOL[_ikBoneWorldCursor];
    _ikBoneWorldCursor = (_ikBoneWorldCursor + 1) % _IK_BONE_WORLD_POOL.length;
    out.set([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]);
    for (const idx of chain) {
        composeTRS(animator.localT[idx], animator.localR[idx], animator.localS[idx], _IK_TMP_LOCAL);
        mulMat4(out, _IK_TMP_LOCAL, TMP_MAT4);
        out.set(TMP_MAT4);
    }
    return out;
}

// World-space position of a bone's origin from its world matrix.
// glTF column-major: translation is in m[12..14].
function _worldPos(worldMat) {
    return [worldMat[12], worldMat[13], worldMat[14]];
}

// World-space rotation of a bone, as a quaternion. Extracted from the
// upper-3x3 of the world matrix (assumes no scale shear in the chain
// — true for rigged characters where bones use uniform/no scale).
function _extractWorldRotation(m, out) {
    // Standard mat-to-quat (Shepherd's method)
    const m00 = m[0], m01 = m[1], m02 = m[2];
    const m10 = m[4], m11 = m[5], m12 = m[6];
    const m20 = m[8], m21 = m[9], m22 = m[10];
    // Remove scale by normalizing each axis (defensive)
    const sx = Math.hypot(m00, m01, m02) || 1;
    const sy = Math.hypot(m10, m11, m12) || 1;
    const sz = Math.hypot(m20, m21, m22) || 1;
    const r00 = m00/sx, r01 = m01/sx, r02 = m02/sx;
    const r10 = m10/sy, r11 = m11/sy, r12 = m12/sy;
    const r20 = m20/sz, r21 = m21/sz, r22 = m22/sz;
    const trace = r00 + r11 + r22;
    if (trace > 0) {
        const s = 0.5 / Math.sqrt(trace + 1);
        out[3] = 0.25 / s;
        out[0] = (r12 - r21) * s;
        out[1] = (r20 - r02) * s;
        out[2] = (r01 - r10) * s;
    } else if (r00 > r11 && r00 > r22) {
        const s = 2 * Math.sqrt(1 + r00 - r11 - r22);
        out[3] = (r12 - r21) / s;
        out[0] = 0.25 * s;
        out[1] = (r10 + r01) / s;
        out[2] = (r20 + r02) / s;
    } else if (r11 > r22) {
        const s = 2 * Math.sqrt(1 + r11 - r00 - r22);
        out[3] = (r20 - r02) / s;
        out[0] = (r10 + r01) / s;
        out[1] = 0.25 * s;
        out[2] = (r21 + r12) / s;
    } else {
        const s = 2 * Math.sqrt(1 + r22 - r00 - r11);
        out[3] = (r01 - r10) / s;
        out[0] = (r20 + r02) / s;
        out[1] = (r21 + r12) / s;
        out[2] = 0.25 * s;
    }
}

function _quatInverse(q, out) {
    // For unit quaternions: inverse = conjugate (negate xyz, keep w)
    out[0] = -q[0]; out[1] = -q[1]; out[2] = -q[2]; out[3] = q[3];
}

// -----------------------------------------------------------------------------
// Two-bone IK — analytical cosine-rule solver
// -----------------------------------------------------------------------------
function _applyTwoBoneIK(animator, rootIdx, midIdx, endIdx, target, poleVector, weight, reachLimit) {
    // Compute current world positions of the three bones
    const rootWorld = _computeBoneWorld(animator, rootIdx);
    const midWorld  = _computeBoneWorld(animator, midIdx);
    const endWorld  = _computeBoneWorld(animator, endIdx);
    const Pr = _worldPos(rootWorld);
    const Pm = _worldPos(midWorld);
    const Pe = _worldPos(endWorld);

    // Bone lengths (preserve current rig segments)
    const a = Math.hypot(Pm[0]-Pr[0], Pm[1]-Pr[1], Pm[2]-Pr[2]);   // root→mid
    const b = Math.hypot(Pe[0]-Pm[0], Pe[1]-Pm[1], Pe[2]-Pm[2]);   // mid→end
    if (a < 1e-6 || b < 1e-6) return;

    // Target direction + clamped distance
    let dx = target.x - Pr[0], dy = target.y - Pr[1], dz = target.z - Pr[2];
    let dist = Math.hypot(dx, dy, dz);
    if (dist < 1e-6) return;
    const maxReach = (a + b) * reachLimit;
    const minReach = Math.abs(a - b) + 1e-4;
    if (dist > maxReach) dist = maxReach;
    if (dist < minReach) dist = minReach;
    // Re-normalize direction
    const sd = Math.hypot(dx, dy, dz);
    dx /= sd; dy /= sd; dz /= sd;

    // Cosine rule — angle at the root corner of the triangle between
    // segment-a and the chord.
    const cosAngleA = (a*a + dist*dist - b*b) / (2 * a * dist);
    const angleA = Math.acos(Math.max(-1, Math.min(1, cosAngleA)));

    // Pole direction — which way the elbow bends.
    let px, py, pz;
    if (poleVector) {
        px = poleVector.x; py = poleVector.y; pz = poleVector.z;
    } else {
        const mx = Pm[0] - Pr[0], my = Pm[1] - Pr[1], mz = Pm[2] - Pr[2];
        const ml = Math.hypot(mx, my, mz) || 1;
        px = mx / ml; py = my / ml; pz = mz / ml;
    }
    // Project pole onto plane perpendicular to chain dir D
    const dotDP = dx*px + dy*py + dz*pz;
    let opx = px - dx * dotDP;
    let opy = py - dy * dotDP;
    let opz = pz - dz * dotDP;
    const opl = Math.hypot(opx, opy, opz);
    if (opl < 1e-4) {
        if (Math.abs(dx) < 0.9) { opx = 1 - dx*dx; opy = -dx*dy; opz = -dx*dz; }
        else                    { opx = -dy*dx; opy = 1 - dy*dy; opz = -dy*dz; }
        const opln = Math.hypot(opx, opy, opz) || 1;
        opx /= opln; opy /= opln; opz /= opln;
    } else {
        opx /= opl; opy /= opl; opz /= opl;
    }

    // Target positions of mid and end in world space
    const cosA = Math.cos(angleA), sinA = Math.sin(angleA);
    const newMidX = Pr[0] + a * (cosA * dx + sinA * opx);
    const newMidY = Pr[1] + a * (cosA * dy + sinA * opy);
    const newMidZ = Pr[2] + a * (cosA * dz + sinA * opz);
    const newEndX = Pr[0] + dist * dx;
    const newEndY = Pr[1] + dist * dy;
    const newEndZ = Pr[2] + dist * dz;

    // STEP 1: Apply root rotation. Computes the world-space delta from
    // the old root segment direction to the new one, then converts to
    // local space using the root's parent world rotation (which has
    // NOT changed yet).
    const oldRootDir = [(Pm[0]-Pr[0])/a, (Pm[1]-Pr[1])/a, (Pm[2]-Pr[2])/a];
    const newRootDir = [(newMidX-Pr[0])/a, (newMidY-Pr[1])/a, (newMidZ-Pr[2])/a];
    _quatFromToVec3(oldRootDir, newRootDir, _IK_TMP_dRootW);

    const rootParentIdx = animator.nodes[rootIdx].parent;
    _IK_TMP_parentRoot[0] = 0; _IK_TMP_parentRoot[1] = 0;
    _IK_TMP_parentRoot[2] = 0; _IK_TMP_parentRoot[3] = 1;
    if (rootParentIdx >= 0) {
        const pw = _computeBoneWorld(animator, rootParentIdx);
        _extractWorldRotation(pw, _IK_TMP_parentRoot);
    }
    _quatInverse(_IK_TMP_parentRoot, _IK_TMP_invPR);
    _quatMul(_IK_TMP_invPR, _IK_TMP_dRootW, _IK_TMP_quatA);
    _quatMul(_IK_TMP_quatA, _IK_TMP_parentRoot, _IK_TMP_quatB);
    _quatSlerp(_IK_TMP_idQ, _IK_TMP_quatB, weight, _IK_TMP_dRootLocal);
    _quatMul(_IK_TMP_dRootLocal, animator.localR[rootIdx], animator.localR[rootIdx]);

    // STEP 2: Recompute mid's world direction AFTER the root rotation
    // took effect. The mid bone's parent (root) now has a different
    // world rotation, so what used to point toward `oldMidDir` now
    // points somewhere else; we want to rotate FROM that new direction
    // TO `newMidDir`. This is the fix for the parent-rotation lag.
    const PmNew = _worldPos(_computeBoneWorld(animator, midIdx));
    const PeNew = _worldPos(_computeBoneWorld(animator, endIdx));
    const newSegLen = Math.hypot(PeNew[0]-PmNew[0], PeNew[1]-PmNew[1], PeNew[2]-PmNew[2]) || b;
    const currentMidDir = [
        (PeNew[0] - PmNew[0]) / newSegLen,
        (PeNew[1] - PmNew[1]) / newSegLen,
        (PeNew[2] - PmNew[2]) / newSegLen,
    ];
    const newMidDir = [
        (newEndX - newMidX) / b,
        (newEndY - newMidY) / b,
        (newEndZ - newMidZ) / b,
    ];
    _quatFromToVec3(currentMidDir, newMidDir, _IK_TMP_dMidW);

    // Mid's parent world rotation — now updated post-root-rotation
    const midParentIdx = animator.nodes[midIdx].parent;
    _IK_TMP_parentMid[0] = 0; _IK_TMP_parentMid[1] = 0;
    _IK_TMP_parentMid[2] = 0; _IK_TMP_parentMid[3] = 1;
    if (midParentIdx >= 0) {
        const pw = _computeBoneWorld(animator, midParentIdx);
        _extractWorldRotation(pw, _IK_TMP_parentMid);
    }
    _quatInverse(_IK_TMP_parentMid, _IK_TMP_invPM);
    _quatMul(_IK_TMP_invPM, _IK_TMP_dMidW, _IK_TMP_quatA);
    _quatMul(_IK_TMP_quatA, _IK_TMP_parentMid, _IK_TMP_quatB);
    _quatSlerp(_IK_TMP_idQ, _IK_TMP_quatB, weight, _IK_TMP_dMidLocal);
    _quatMul(_IK_TMP_dMidLocal, animator.localR[midIdx], animator.localR[midIdx]);
}

// -----------------------------------------------------------------------------
// FABRIK — Forward And Backward Reaching IK
// -----------------------------------------------------------------------------
//
// Position-based iterative solver. Per pass:
//   Backward: end-effector → target, walk back placing each joint at
//             segment-length from the next, in direction toward next.
//   Forward:  pin root at origin, walk forward placing each joint at
//             segment-length from the previous, in direction toward
//             the now-updated next joint.
// Converges quickly because the second pass restores the rooted chain.
//
// After convergence, derive per-bone rotation deltas from each segment's
// direction change and apply to localR.
//
function _applyFabrik(animator, indices, target, iterations, tolerance, weight, rootPin) {
    const N = indices.length;
    // Gather current world positions
    const positions = new Array(N);
    for (let i = 0; i < N; i++) {
        positions[i] = _worldPos(_computeBoneWorld(animator, indices[i]));
    }
    // Segment lengths (preserved)
    const segLen = new Array(N - 1);
    for (let i = 0; i < N - 1; i++) {
        const p0 = positions[i], p1 = positions[i + 1];
        segLen[i] = Math.hypot(p1[0]-p0[0], p1[1]-p0[1], p1[2]-p0[2]);
    }
    const totalLen = segLen.reduce((s, l) => s + l, 0);
    const rootPos = positions[0].slice();

    // Unreachable: stretch chain in line toward target
    const rx = rootPos[0], ry = rootPos[1], rz = rootPos[2];
    const dx = target.x - rx, dy = target.y - ry, dz = target.z - rz;
    const dist = Math.hypot(dx, dy, dz);
    if (dist > totalLen) {
        const ux = dx/dist, uy = dy/dist, uz = dz/dist;
        let acc = 0;
        for (let i = 1; i < N; i++) {
            acc += segLen[i - 1];
            positions[i] = [rx + ux*acc, ry + uy*acc, rz + uz*acc];
        }
    } else {
        // Iterate
        for (let iter = 0; iter < iterations; iter++) {
            // BACKWARD: pin end to target, walk back
            positions[N - 1] = [target.x, target.y, target.z];
            for (let i = N - 2; i >= 0; i--) {
                const p_curr = positions[i], p_next = positions[i + 1];
                const segDX = p_curr[0] - p_next[0];
                const segDY = p_curr[1] - p_next[1];
                const segDZ = p_curr[2] - p_next[2];
                const len = Math.hypot(segDX, segDY, segDZ) || 1;
                const r = segLen[i] / len;
                positions[i] = [
                    p_next[0] + segDX * r,
                    p_next[1] + segDY * r,
                    p_next[2] + segDZ * r,
                ];
            }
            // FORWARD: pin root, walk forward
            if (rootPin) {
                positions[0] = [rootPos[0], rootPos[1], rootPos[2]];
            }
            for (let i = 0; i < N - 1; i++) {
                const p_curr = positions[i], p_next = positions[i + 1];
                const segDX = p_next[0] - p_curr[0];
                const segDY = p_next[1] - p_curr[1];
                const segDZ = p_next[2] - p_curr[2];
                const len = Math.hypot(segDX, segDY, segDZ) || 1;
                const r = segLen[i] / len;
                positions[i + 1] = [
                    p_curr[0] + segDX * r,
                    p_curr[1] + segDY * r,
                    p_curr[2] + segDZ * r,
                ];
            }
            // Convergence check
            const last = positions[N - 1];
            const ex = last[0] - target.x, ey = last[1] - target.y, ez = last[2] - target.z;
            if (Math.hypot(ex, ey, ez) < tolerance) break;
        }
    }

    // Apply rotations bone-by-bone from root. Crucially, for each bone
    // we recompute the CURRENT world direction (post previous bones'
    // rotations) — without this, every child bone after the first gets
    // a stale delta because its parent just moved. Tracks the FABRIK-
    // converged target positions for each child.
    for (let i = 0; i < N - 1; i++) {
        const boneIdx = indices[i];
        // CURRENT world positions of this bone and its child, AFTER any
        // previous bone rotations have been applied.
        const wThis = _worldPos(_computeBoneWorld(animator, boneIdx));
        const wNext = _worldPos(_computeBoneWorld(animator, indices[i + 1]));
        // Current world direction of this segment
        const curLen = Math.hypot(wNext[0]-wThis[0], wNext[1]-wThis[1], wNext[2]-wThis[2]) || segLen[i];
        const curDir = [
            (wNext[0] - wThis[0]) / curLen,
            (wNext[1] - wThis[1]) / curLen,
            (wNext[2] - wThis[2]) / curLen,
        ];
        // Desired world direction from FABRIK-solved positions. Note we
        // use wThis (current world pos of THIS bone) as the segment
        // origin — the rotation only changes the CHILD's position, not
        // this bone's, so this matches what will actually happen.
        const dnx = positions[i + 1][0] - wThis[0];
        const dny = positions[i + 1][1] - wThis[1];
        const dnz = positions[i + 1][2] - wThis[2];
        const dnl = Math.hypot(dnx, dny, dnz) || 1;
        const newDir = [dnx / dnl, dny / dnl, dnz / dnl];

        _quatFromToVec3(curDir, newDir, _IK_TMP_dW);

        const parentIdx = animator.nodes[boneIdx].parent;
        _IK_TMP_parentBone[0] = 0; _IK_TMP_parentBone[1] = 0;
        _IK_TMP_parentBone[2] = 0; _IK_TMP_parentBone[3] = 1;
        if (parentIdx >= 0) {
            const pw = _computeBoneWorld(animator, parentIdx);
            _extractWorldRotation(pw, _IK_TMP_parentBone);
        }
        _quatInverse(_IK_TMP_parentBone, _IK_TMP_invP);
        _quatMul(_IK_TMP_invP, _IK_TMP_dW, _IK_TMP_quatA);
        _quatMul(_IK_TMP_quatA, _IK_TMP_parentBone, _IK_TMP_quatB);
        _quatSlerp(_IK_TMP_idQ, _IK_TMP_quatB, weight, _IK_TMP_dLocal);
        _quatMul(_IK_TMP_dLocal, animator.localR[boneIdx], animator.localR[boneIdx]);
    }
}

