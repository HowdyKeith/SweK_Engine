// FILE: rig/RigSystem.js
// VERSION: v1 (v817 — rig integration steps 1-5 for splats)
//
// One coordinator with four embedded subsystems:
//   * RigBinding   — per-splat bone weights + LBS skinning (CPU)
//   * RigAnimator  — keyframe interpolation of bone transforms
//   * RigOverlay   — GL LINES rendering of bones + sphere markers at joints
//   * RigSystem    — top-level: per-frame update + draw, indexed by splatLayerId

// v829 — Easing function registry. Reuses across TrackAnimator, MeshRigBridge,
// CameraCinematic. All functions take u ∈ [0,1] and return eased u ∈ [0,1].
// Standard CSS-style easing names + a few extras useful for camera paths.
export const EASING = {
    linear:      (u) => u,
    easeIn:      (u) => u * u,                              // quadratic in
    easeOut:     (u) => 1 - (1 - u) * (1 - u),              // quadratic out
    easeInOut:   (u) => u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2,
    easeInCubic: (u) => u * u * u,
    easeOutCubic:(u) => 1 - Math.pow(1 - u, 3),
    easeInOutCubic: (u) => u < 0.5 ? 4*u*u*u : 1 - Math.pow(-2*u + 2, 3) / 2,
    easeInSine:  (u) => 1 - Math.cos(u * Math.PI / 2),
    easeOutSine: (u) => Math.sin(u * Math.PI / 2),
    easeInOutSine: (u) => -(Math.cos(Math.PI * u) - 1) / 2,
    smoothstep:  (u) => u * u * (3 - 2 * u),                // Hermite, C¹
    smootherstep:(u) => u * u * u * (u * (u * 6 - 15) + 10),// C² — gentler
    // Bézier-style: custom cubic curve via 2 control points (CSS cubic-bezier).
    // Use applyEasing("cubic-bezier(0.4, 0, 0.2, 1)", u) — parsed lazily.
};

const _bezierCache = new Map();
function _parseCubicBezier(name) {
    const m = name.match(/cubic-bezier\s*\(\s*([\d.\-]+)\s*,\s*([\d.\-]+)\s*,\s*([\d.\-]+)\s*,\s*([\d.\-]+)\s*\)/);
    if (!m) return null;
    const [x1, y1, x2, y2] = [parseFloat(m[1]), parseFloat(m[2]), parseFloat(m[3]), parseFloat(m[4])];
    // Returns a function u → eased u. Implemented via Newton-Raphson to invert x.
    return (u) => {
        if (u <= 0) return 0;
        if (u >= 1) return 1;
        // Solve for t such that bezierX(t) = u
        let t = u;
        for (let i = 0; i < 8; i++) {
            const ct = 1 - t;
            const x = 3 * ct * ct * t * x1 + 3 * ct * t * t * x2 + t * t * t;
            const dx = 3 * ct * ct * (x1) + 6 * ct * t * (x2 - x1) + 3 * t * t * (1 - x2);
            if (Math.abs(dx) < 1e-6) break;
            const next = t - (x - u) / dx;
            if (Math.abs(next - t) < 1e-6) { t = next; break; }
            t = Math.max(0, Math.min(1, next));
        }
        const ct = 1 - t;
        return 3 * ct * ct * t * y1 + 3 * ct * t * t * y2 + t * t * t;
    };
}

/** Apply easing to u ∈ [0,1]. Accepts string name, "cubic-bezier(...)", or function. */
export function applyEasing(ease, u) {
    if (!ease || ease === "linear") return u;
    if (typeof ease === "function") return ease(u);
    if (typeof ease === "string") {
        if (EASING[ease]) return EASING[ease](u);
        if (ease.startsWith("cubic-bezier")) {
            let fn = _bezierCache.get(ease);
            if (!fn) {
                fn = _parseCubicBezier(ease);
                if (fn) _bezierCache.set(ease, fn);
            }
            if (fn) return fn(u);
        }
    }
    return u;
}

// v831 — Catmull-Rom spline through 4 control points. Returns the value
// at parameter t ∈ [0, 1] on the curve segment between p1 and p2, using
// p0 and p3 as the in/out tangents. Standard "uniform" formulation
// (no chordal/centripetal correction — assumes evenly-spaced keyframes).
// Reference: https://en.wikipedia.org/wiki/Centripetal_Catmull–Rom_spline
function _catmullRom(p0, p1, p2, p3, t) {
    const t2 = t * t;
    const t3 = t2 * t;
    return 0.5 * (
        (2 * p1) +
        (-p0 + p2) * t +
        (2*p0 - 5*p1 + 4*p2 - p3) * t2 +
        (-p0 + 3*p1 - 3*p2 + p3) * t3
    );
}
export { _catmullRom as catmullRom };

// v833 — Centripetal Catmull-Rom for 3D positions. Reparameterizes the
// spline so non-uniform keyframe spacing doesn't produce cusps/loops.
// alpha=0: uniform (matches _catmullRom above); alpha=0.5: centripetal
// (most natural for camera paths); alpha=1.0: chordal.
// Operates on a vec3 at a time. Returns [x, y, z].
function _catmullRomVec3(P0, P1, P2, P3, t, alpha = 0.5) {
    // Compute knot parameter spacing based on distance.
    const _knot = (Pa, Pb, prev) => {
        const dx = Pb[0]-Pa[0], dy = Pb[1]-Pa[1], dz = Pb[2]-Pa[2];
        const d2 = dx*dx + dy*dy + dz*dz;
        // alpha=0 → 1 (uniform), alpha=0.5 → d, alpha=1.0 → d²
        // Numerically: Math.pow(d, 2*alpha).
        return prev + Math.pow(Math.sqrt(d2 + 1e-12), 2 * alpha);
    };
    const t0 = 0;
    const t1 = _knot(P0, P1, t0);
    const t2 = _knot(P1, P2, t1);
    const t3 = _knot(P2, P3, t2);
    // t in [0,1] within (t1, t2) segment → actual time tt
    const tt = t1 + (t2 - t1) * t;
    // Barry-Goldman recursive evaluation (numerically stable)
    const _lerpVec = (Pa, Pb, ta, tb, time) => {
        if (Math.abs(tb - ta) < 1e-9) return [Pa[0], Pa[1], Pa[2]];
        const u = (time - ta) / (tb - ta);
        return [
            Pa[0] + (Pb[0] - Pa[0]) * u,
            Pa[1] + (Pb[1] - Pa[1]) * u,
            Pa[2] + (Pb[2] - Pa[2]) * u,
        ];
    };
    const A1 = _lerpVec(P0, P1, t0, t1, tt);
    const A2 = _lerpVec(P1, P2, t1, t2, tt);
    const A3 = _lerpVec(P2, P3, t2, t3, tt);
    const B1 = _lerpVec(A1, A2, t0, t2, tt);
    const B2 = _lerpVec(A2, A3, t1, t3, tt);
    return _lerpVec(B1, B2, t1, t2, tt);
}
export { _catmullRomVec3 as catmullRomVec3 };

// One file because the pieces are small and tightly coupled. If any
// of them grow beyond ~150 LOC, split into their own file.
//
// Data model — see assetLibraryBridge._parseRigStats. A rig is:
//   { bones: [{ id, name?, position: [x,y,z], parent: -1|<id>, rotation? }] }
//
// Animation overlay format:
//   { duration, bones: [{ id, frames: [{ t, position?, rotation? }] }] }
//
// Per-frame flow:
//   1. RigSystem.update(now) — for each active binding:
//      a) RigAnimator.evaluate(now) — current local TRS per bone
//      b) Walk hierarchy to compose world matrices per bone
//      c) RigBinding.skin(boneMats) — LBS over splat positions
//      d) Updated _splatPos picked up by SplatRenderer's next sort+draw
//   2. RigSystem.drawOverlays(camera, gl) — bone lines + joint dots
//
// Constraints:
//   * Position-only LBS for now (no rotation/scale propagation to splats).
//     This is wrong-but-recognizable: arms move but a splat's covariance
//     doesn't rotate. Good enough for v1 visual feedback.
//   * Single-bone-per-splat weights (rigid skinning). Weighted multi-bone
//     blending is wired but auto-bind only emits weight=1 for nearest bone.

import { _mat4Identity, _mat4Multiply, _mat4Translate,
         _mat4FromQuat, _vec3Lerp, _quatSlerp,
         _quatFromMat4, _quatMul } from "./rigMath.js";

// ─── RigBinding ──────────────────────────────────────────────────────────
// Owns the splat-side state: rest positions + rotations, multi-bone
// weights, and the skinned-position+rotation buffers that get written
// into the splat layer's _splatPos / _splatRot each frame.
//
// v818 — K=2 multi-bone position weighting + per-splat rotation skinning.
//   Position: weighted blend of (boneMat * restPos) from up to 2 bones
//   Rotation: primary-bone-only (single-bone rotation — multi-bone
//     rotation blending requires care to avoid covariance pop; deferred)
//   Auto-bind: top-2 nearest bones, weights ∝ 1/distance, normalized

const K_INFLUENCES = 2;             // per-splat bone influences

export class RigBinding {
    /**
     * @param {SplatLayer} layer      — the SplatScene layer to skin
     * @param {Object}     rig        — { bones: [...] } from the library
     */
    constructor(layer, rig) {
        this.layer = layer;
        this.rig = rig;
        this.boneCount = rig.bones.length;

        // Snapshot the rest pose. _splatPos is the source-of-truth in the
        // renderer; we keep our own copy so we can re-skin from the original
        // positions every frame (avoids accumulated drift).
        const src = layer.renderer?._splatPos;
        if (!src) throw new Error("RigBinding: layer has no _splatPos (was it loaded?)");
        this.splatCount = src.length / 3;
        this.restPos = new Float32Array(src);                  // copy
        this.outPos  = src;                                    // alias — we write here

        // v818 — also snapshot rotations if available
        const srcRot = layer.renderer?._splatRot;
        if (srcRot && srcRot.length === this.splatCount * 4) {
            this.restRot = new Float32Array(srcRot);
            this.outRot  = srcRot;
        } else {
            this.restRot = null;
            this.outRot  = null;
        }

        // v818 — multi-bone influence arrays (K=2). Slot 0 is the primary
        // influence (also drives rotation). Slot 1 is secondary. Both use
        // -1 for "unused".
        this.boneIdx0    = new Int32Array(this.splatCount);
        this.boneIdx1    = new Int32Array(this.splatCount);
        this.boneWeight0 = new Float32Array(this.splatCount);
        this.boneWeight1 = new Float32Array(this.splatCount);
        this.boneIdx0.fill(-1);
        this.boneIdx1.fill(-1);

        // Resolve parent indices once for hierarchy walks
        const idMap = new Map();
        for (let i = 0; i < this.boneCount; i++) idMap.set(rig.bones[i].id, i);
        this.parentIdx = new Int32Array(this.boneCount);
        for (let i = 0; i < this.boneCount; i++) {
            const p = rig.bones[i].parent;
            this.parentIdx[i] = (p == null || p === -1) ? -1 : (idMap.get(p) ?? -1);
        }

        // Rest pose world matrices (translation-only — see _computeRestPose).
        // Inverse stored so LBS can transform rest→world via bone deltas.
        this.restWorld    = new Float32Array(this.boneCount * 16);
        this.restWorldInv = new Float32Array(this.boneCount * 16);
        this._computeRestPose();

        // v818 — extract rest pose bone rotations as quaternions, used for
        // the rotation-skinning composition step.
        this.restBoneRot = new Float32Array(this.boneCount * 4);
        for (let i = 0; i < this.boneCount; i++) {
            this.restBoneRot[i*4+3] = 1;       // identity quat in rest
        }

        // Current frame's bone world matrices (filled by RigSystem.update)
        this.curWorld = new Float32Array(this.boneCount * 16);
        for (let i = 0; i < this.boneCount; i++) {
            this.curWorld.set(_mat4FromTranslation(rig.bones[i].position), i * 16);
        }

        // Scratch buffers reused per frame to avoid GC churn
        this._scratchDelta    = new Float32Array(this.boneCount * 16);
        this._scratchBoneQuat = new Float32Array(this.boneCount * 4);
        this._tmpMat          = new Float32Array(16);
        this._tmpQuat         = new Float32Array(4);
    }

    _computeRestPose() {
        const done = new Uint8Array(this.boneCount);
        let progress = true;
        while (progress) {
            progress = false;
            for (let i = 0; i < this.boneCount; i++) {
                if (done[i]) continue;
                const p = this.parentIdx[i];
                if (p === -1 || done[p]) {
                    const local = _mat4FromTranslation(this.rig.bones[i].position);
                    this.restWorld.set(local, i * 16);
                    _mat4InvertSafe(this.restWorld, i * 16, this.restWorldInv, i * 16);
                    done[i] = 1;
                    progress = true;
                }
            }
        }
    }

    /**
     * Auto-bind: assign each splat to its top-2 nearest bones, weighted
     * by inverse distance, normalized to sum=1.
     */
    autoBind() {
        const positions = this.restPos;
        const n = this.splatCount;
        const b = this.boneCount;
        if (b === 0) return;
        if (b === 1) {
            this.boneIdx0.fill(0);
            this.boneWeight0.fill(1);
            this.boneIdx1.fill(-1);
            this.boneWeight1.fill(0);
            return;
        }
        for (let i = 0; i < n; i++) {
            const px = positions[i*3], py = positions[i*3+1], pz = positions[i*3+2];
            // Find best + second-best by squared distance
            let bestJ = -1, bestD2 = Infinity;
            let secJ  = -1, secD2  = Infinity;
            for (let j = 0; j < b; j++) {
                const bx = this.rig.bones[j].position[0];
                const by = this.rig.bones[j].position[1];
                const bz = this.rig.bones[j].position[2];
                const dx = px - bx, dy = py - by, dz = pz - bz;
                const d2 = dx*dx + dy*dy + dz*dz;
                if (d2 < bestD2) {
                    secJ = bestJ; secD2 = bestD2;
                    bestJ = j; bestD2 = d2;
                } else if (d2 < secD2) {
                    secJ = j; secD2 = d2;
                }
            }
            // Inverse-distance weights with epsilon to avoid div-by-zero
            const w0 = 1.0 / Math.sqrt(bestD2 + 1e-6);
            const w1 = 1.0 / Math.sqrt(secD2  + 1e-6);
            const total = w0 + w1;
            this.boneIdx0[i] = bestJ;
            this.boneIdx1[i] = secJ;
            this.boneWeight0[i] = w0 / total;
            this.boneWeight1[i] = w1 / total;
        }
    }

    /**
     * Apply skinning using the current world matrices. Writes into
     * outPos + outRot, picked up by next sort+upload.
     */
    skin() {
        const rest = this.restPos;
        const out  = this.outPos;
        const cur  = this.curWorld;
        const rinv = this.restWorldInv;
        const idx0 = this.boneIdx0, idx1 = this.boneIdx1;
        const w0a  = this.boneWeight0, w1a = this.boneWeight1;
        const n    = this.splatCount;
        const m    = this._tmpMat;
        const delta = this._scratchDelta;
        const restRot = this.restRot, outRot = this.outRot;
        const boneQ = this._scratchBoneQuat;
        const tq = this._tmpQuat;

        // Precompute delta = cur * restInv per bone
        for (let j = 0; j < this.boneCount; j++) {
            _mat4Multiply(cur, j * 16, rinv, j * 16, m, 0);
            delta.set(m, j * 16);
            // Also extract the rotation quaternion for rotation skinning
            if (outRot) _quatFromMat4(delta, j * 16, boneQ, j * 4);
        }

        for (let i = 0; i < n; i++) {
            const j0 = idx0[i];
            if (j0 < 0) {                          // unbound — leave at rest
                out[i*3+0] = rest[i*3+0];
                out[i*3+1] = rest[i*3+1];
                out[i*3+2] = rest[i*3+2];
                if (outRot && restRot) {
                    outRot[i*4+0] = restRot[i*4+0];
                    outRot[i*4+1] = restRot[i*4+1];
                    outRot[i*4+2] = restRot[i*4+2];
                    outRot[i*4+3] = restRot[i*4+3];
                }
                continue;
            }
            const dx = rest[i*3+0], dy = rest[i*3+1], dz = rest[i*3+2];
            const k0 = j0 * 16;
            const w0 = w0a[i];

            // Position from primary bone
            let px = delta[k0+0]*dx + delta[k0+4]*dy + delta[k0+8] *dz + delta[k0+12];
            let py = delta[k0+1]*dx + delta[k0+5]*dy + delta[k0+9] *dz + delta[k0+13];
            let pz = delta[k0+2]*dx + delta[k0+6]*dy + delta[k0+10]*dz + delta[k0+14];

            // Blend with secondary bone if present
            const j1 = idx1[i];
            if (j1 >= 0) {
                const k1 = j1 * 16;
                const w1 = w1a[i];
                const px1 = delta[k1+0]*dx + delta[k1+4]*dy + delta[k1+8] *dz + delta[k1+12];
                const py1 = delta[k1+1]*dx + delta[k1+5]*dy + delta[k1+9] *dz + delta[k1+13];
                const pz1 = delta[k1+2]*dx + delta[k1+6]*dy + delta[k1+10]*dz + delta[k1+14];
                px = px * w0 + px1 * w1;
                py = py * w0 + py1 * w1;
                pz = pz * w0 + pz1 * w1;
            }
            // (If only j0 is set, w0 == 1 already from autoBind, so px above is final)

            out[i*3+0] = px;
            out[i*3+1] = py;
            out[i*3+2] = pz;

            // v819 — Rotation: blend bone delta quats weighted, then compose
            // with rest rotation. Multi-bone via normalized nlerp with
            // shortest-path sign correction (preserves quat unit length).
            //   blended = normalize(w0*q0 + sign*w1*q1)
            //   newRot  = blended * restRot
            if (outRot && restRot) {
                const q0x = boneQ[j0*4+0], q0y = boneQ[j0*4+1], q0z = boneQ[j0*4+2], q0w = boneQ[j0*4+3];
                let bx, by, bz, bw;
                if (j1 >= 0) {
                    let q1x = boneQ[j1*4+0], q1y = boneQ[j1*4+1], q1z = boneQ[j1*4+2], q1w = boneQ[j1*4+3];
                    // Shortest-path sign correction: ensure q0 · q1 ≥ 0
                    const dot = q0x*q1x + q0y*q1y + q0z*q1z + q0w*q1w;
                    if (dot < 0) { q1x = -q1x; q1y = -q1y; q1z = -q1z; q1w = -q1w; }
                    const w1 = w1a[i];
                    bx = w0 * q0x + w1 * q1x;
                    by = w0 * q0y + w1 * q1y;
                    bz = w0 * q0z + w1 * q1z;
                    bw = w0 * q0w + w1 * q1w;
                    // Normalize to unit quat
                    const invLen = 1 / Math.sqrt(bx*bx + by*by + bz*bz + bw*bw);
                    bx *= invLen; by *= invLen; bz *= invLen; bw *= invLen;
                } else {
                    bx = q0x; by = q0y; bz = q0z; bw = q0w;
                }
                // newRot = blended * restRot
                const rx = restRot[i*4+0], ry = restRot[i*4+1], rz = restRot[i*4+2], rw = restRot[i*4+3];
                outRot[i*4+0] = bw*rx + bx*rw + by*rz - bz*ry;
                outRot[i*4+1] = bw*ry - bx*rz + by*rw + bz*rx;
                outRot[i*4+2] = bw*rz + bx*ry - by*rx + bz*rw;
                outRot[i*4+3] = bw*rw - bx*rx - by*ry - bz*rz;
            }
        }
    }
}

// ─── RigAnimator ─────────────────────────────────────────────────────────
// Evaluates keyframe tracks at a given time. Writes per-bone world
// matrices into the binding.curWorld buffer.

export class RigAnimator {
    /**
     * @param {RigBinding} binding
     * @param {Object} clip — { duration, bones: [{ id, frames: [{ t, position?, rotation? }] }] }
     */
    constructor(binding, clip) {
        this.binding = binding;
        this.clip = clip || { duration: 0, bones: [] };
        this.playing = !!clip;
        this.loop = true;
        this.startTime = 0;           // set on first update
        // Resolve bone id → index for fast lookup
        this._tracks = [];            // parallel to binding.boneCount; index i = track for bone i
        if (clip) {
            const idMap = new Map();
            for (let i = 0; i < binding.boneCount; i++) idMap.set(binding.rig.bones[i].id, i);
            for (const track of clip.bones || []) {
                const idx = idMap.get(track.id);
                if (idx != null && Array.isArray(track.frames) && track.frames.length > 0) {
                    this._tracks[idx] = track.frames.slice().sort((a, b) => a.t - b.t);
                }
            }
        }
    }

    /**
     * Evaluate the animation at "now" seconds. Writes into binding.curWorld.
     * Bones with no animation track stay at their rest pose.
     */
    evaluate(now) {
        if (!this.playing || !this.clip?.duration) {
            // Hold rest pose — but parent transforms could still propagate
            // if any bone got externally posed. v1 just snaps to rest.
            this.binding.curWorld.set(this.binding.restWorld);
            return;
        }
        if (!this.startTime) this.startTime = now;
        let t = now - this.startTime;
        if (this.loop) t = t % this.clip.duration;
        else if (t > this.clip.duration) t = this.clip.duration;

        const b = this.binding;
        const tmp = new Float32Array(16);
        // Local TRS for each bone, defaulting to rest pose
        const localT = new Float32Array(b.boneCount * 3);
        const localR = new Float32Array(b.boneCount * 4);
        for (let i = 0; i < b.boneCount; i++) {
            localT[i*3+0] = b.rig.bones[i].position[0];
            localT[i*3+1] = b.rig.bones[i].position[1];
            localT[i*3+2] = b.rig.bones[i].position[2];
            // Identity quaternion
            localR[i*4+3] = 1;
        }
        // Apply tracks
        for (let i = 0; i < b.boneCount; i++) {
            const frames = this._tracks[i];
            if (!frames) continue;
            const sample = _sampleFrames(frames, t);
            if (sample.position) {
                localT[i*3+0] = sample.position[0];
                localT[i*3+1] = sample.position[1];
                localT[i*3+2] = sample.position[2];
            }
            if (sample.rotation) {
                localR[i*4+0] = sample.rotation[0];
                localR[i*4+1] = sample.rotation[1];
                localR[i*4+2] = sample.rotation[2];
                localR[i*4+3] = sample.rotation[3];
            }
        }
        // Compose world matrices top-down
        const done = new Uint8Array(b.boneCount);
        let progress = true;
        while (progress) {
            progress = false;
            for (let i = 0; i < b.boneCount; i++) {
                if (done[i]) continue;
                const p = b.parentIdx[i];
                if (p === -1 || done[p]) {
                    // Build local matrix from TRS at index i
                    _mat4FromQuat(localR, i * 4, tmp, 0);
                    tmp[12] = localT[i*3+0];
                    tmp[13] = localT[i*3+1];
                    tmp[14] = localT[i*3+2];
                    if (p === -1) {
                        b.curWorld.set(tmp, i * 16);
                    } else {
                        const out = new Float32Array(16);
                        _mat4Multiply(b.curWorld, p * 16, tmp, 0, out, 0);
                        b.curWorld.set(out, i * 16);
                    }
                    done[i] = 1;
                    progress = true;
                }
            }
        }
    }
}

// ─── RigOverlay ──────────────────────────────────────────────────────────
// Single-pass line renderer for bone segments + small sphere-ish point
// markers at joints. Uses lazy-init GL state per (gl) context.

const OVERLAY_VERT_SRC = `
attribute vec3 a_pos;
attribute vec3 a_col;
uniform mat4 u_viewProj;
uniform float u_pointSize;
varying vec3 v_col;
void main() {
    gl_Position = u_viewProj * vec4(a_pos, 1.0);
    gl_PointSize = u_pointSize;
    v_col = a_col;
}`;
const OVERLAY_FRAG_SRC = `
precision mediump float;
varying vec3 v_col;
void main() {
    gl_FragColor = vec4(v_col, 1.0);
}`;

class _OverlayGL {
    constructor(gl) {
        this.gl = gl;
        // Compile shader
        const v = gl.createShader(gl.VERTEX_SHADER);
        gl.shaderSource(v, OVERLAY_VERT_SRC); gl.compileShader(v);
        const f = gl.createShader(gl.FRAGMENT_SHADER);
        gl.shaderSource(f, OVERLAY_FRAG_SRC); gl.compileShader(f);
        const p = gl.createProgram();
        gl.attachShader(p, v); gl.attachShader(p, f); gl.linkProgram(p);
        this.program = p;
        this.u_viewProj = gl.getUniformLocation(p, "u_viewProj");
        this.u_pointSize = gl.getUniformLocation(p, "u_pointSize");
        this.a_pos = gl.getAttribLocation(p, "a_pos");
        this.a_col = gl.getAttribLocation(p, "a_col");
        this.buf  = gl.createBuffer();
    }
    draw(vertices, mode, viewProj, pointSize = 8.0, depthTest = false) {
        const gl = this.gl;
        gl.useProgram(this.program);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
        gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.DYNAMIC_DRAW);
        gl.enableVertexAttribArray(this.a_pos);
        gl.vertexAttribPointer(this.a_pos, 3, gl.FLOAT, false, 6 * 4, 0);
        gl.enableVertexAttribArray(this.a_col);
        gl.vertexAttribPointer(this.a_col, 3, gl.FLOAT, false, 6 * 4, 3 * 4);
        gl.uniformMatrix4fv(this.u_viewProj, false, viewProj);
        gl.uniform1f(this.u_pointSize, pointSize);
        // v826 — depthTest=false (default) draws on top of everything;
        // depthTest=true respects depth buffer so debug markers behind
        // geometry get occluded.
        if (depthTest) {
            gl.depthFunc(gl.LESS);                 // standard depth test
        } else {
            gl.depthFunc(gl.ALWAYS);              // overlay — always on top
        }
        gl.drawArrays(mode, 0, vertices.length / 6);
        gl.depthFunc(gl.LESS);                 // restore
    }
}

export class RigOverlay {
    constructor() {
        this._glCache = new WeakMap();
    }
    _getGL(gl) {
        let c = this._glCache.get(gl);
        if (!c) { c = new _OverlayGL(gl); this._glCache.set(gl, c); }
        return c;
    }
    /**
     * Build line + point vertex buffers from a binding's current pose.
     * Lines connect each bone to its parent (yellow). Points sit at
     * each joint (cyan). v819 — highlightIdx draws that bone in orange.
     */
    drawBinding(binding, viewProj, gl, highlightIdx = -1) {
        this._drawBonesGeneric(
            binding.boneCount, binding.parentIdx, binding.curWorld,
            [1.0, 0.85, 0.2],    // line color (yellow)
            [0.3, 0.95, 1.0],    // joint color (cyan)
            highlightIdx,
            viewProj, gl,
        );
    }
    /** v819 — overlay for a ghost rig (no splat layer) */
    drawGhost(ghost, viewProj, gl, highlightIdx = -1) {
        this._drawBonesGeneric(
            ghost.boneCount, ghost.parentIdx, ghost.curWorld,
            [0.85, 0.65, 1.0],    // line color (lavender — distinguish from active rigs)
            [1.0, 0.55, 0.95],    // joint color (pink)
            highlightIdx,
            viewProj, gl,
        );
    }
    _drawBonesGeneric(boneCount, parentIdx, curWorld, lineColor, jointColor, highlightIdx, viewProj, gl) {
        const ogl = this._getGL(gl);
        const highlight = [1.0, 0.5, 0.0];     // bright orange for selected bone
        // Lines: child → parent
        const lineList = [];
        for (let i = 0; i < boneCount; i++) {
            const p = parentIdx[i];
            if (p === -1) continue;
            const cx = curWorld[i*16 + 12], cy = curWorld[i*16 + 13], cz = curWorld[i*16 + 14];
            const px = curWorld[p*16 + 12], py = curWorld[p*16 + 13], pz = curWorld[p*16 + 14];
            const col = (i === highlightIdx || p === highlightIdx) ? highlight : lineColor;
            lineList.push(cx, cy, cz, col[0], col[1], col[2]);
            lineList.push(px, py, pz, col[0], col[1], col[2]);
        }
        if (lineList.length > 0) {
            ogl.draw(new Float32Array(lineList), gl.LINES, viewProj, 8.0);
        }
        // Points
        const pointList = [];
        for (let i = 0; i < boneCount; i++) {
            const col = (i === highlightIdx) ? highlight : jointColor;
            pointList.push(
                curWorld[i*16 + 12],
                curWorld[i*16 + 13],
                curWorld[i*16 + 14],
                col[0], col[1], col[2],
            );
        }
        if (pointList.length > 0) {
            const sz = highlightIdx >= 0 ? 14.0 : 10.0;
            ogl.draw(new Float32Array(pointList), gl.POINTS, viewProj, sz);
        }
    }
}

// ─── RigSystem (coordinator) ─────────────────────────────────────────────

export class RigSystem {
    constructor() {
        this.bindings = new Map();            // splatLayerId -> { binding, animator? }
        this.ghosts = new Map();              // ghostId -> { rig, parentIdx, curWorld, restWorld }
        this.overlay = new RigOverlay();
        this.showOverlay = true;
        // v819 — click-drag manipulation state
        this._selectedBone = null;            // { ghostId|layerId, boneIdx }
        this._dragMode = null;                // "ghost" | "binding" | null
        this._dragPlaneZ = 0;                 // view-space Z of the picked bone (held during drag)
        this._dragOnChange = null;            // callback(ghostId, boneIdx, [x,y,z]) — set by editor
    }

    /**
     * Bind a rig to a splat layer. Replaces any prior binding for that
     * layer. autoBind=true assigns nearest-bone weights immediately.
     */
    attach(splatLayerId, layer, rig, opts = {}) {
        if (!layer?.renderer?._splatPos) {
            console.warn("[RigSystem] layer has no positions; skipping attach");
            return null;
        }
        const binding = new RigBinding(layer, rig);
        if (opts.autoBind !== false) binding.autoBind();
        const animator = opts.clip ? new RigAnimator(binding, opts.clip) : new RigAnimator(binding, null);
        const entry = { binding, animator };
        this.bindings.set(splatLayerId, entry);
        return entry;
    }

    detach(splatLayerId) {
        const e = this.bindings.get(splatLayerId);
        if (e) {
            // Restore rest positions + rotations so the splat doesn't stay
            // in some partially-skinned pose.
            e.binding.outPos.set(e.binding.restPos);
            if (e.binding.outRot && e.binding.restRot) {
                e.binding.outRot.set(e.binding.restRot);
            }
        }
        this.bindings.delete(splatLayerId);
    }

    setClip(splatLayerId, clip) {
        const e = this.bindings.get(splatLayerId);
        if (e) e.animator = new RigAnimator(e.binding, clip);
    }

    /**
     * v819 — install a "ghost" rig: bone hierarchy + current world matrices
     * with no splat layer attached. Used by the rig editor to render the
     * skeleton in the scene without needing a spawned splat.
     */
    attachGhost(ghostId, rig) {
        const boneCount = rig.bones.length;
        const idMap = new Map();
        for (let i = 0; i < boneCount; i++) idMap.set(rig.bones[i].id, i);
        const parentIdx = new Int32Array(boneCount);
        for (let i = 0; i < boneCount; i++) {
            const p = rig.bones[i].parent;
            parentIdx[i] = (p == null || p === -1) ? -1 : (idMap.get(p) ?? -1);
        }
        const curWorld = new Float32Array(boneCount * 16);
        for (let i = 0; i < boneCount; i++) {
            const m = _mat4FromTranslation(rig.bones[i].position);
            curWorld.set(m, i * 16);
        }
        const ghost = { rig, parentIdx, curWorld, boneCount };
        this.ghosts.set(ghostId, ghost);
        return ghost;
    }

    detachGhost(ghostId) {
        if (this._selectedBone?.ownerId === ghostId) this._selectedBone = null;
        this.ghosts.delete(ghostId);
    }

    /** Update a ghost's bone position (used by the editor when fields change) */
    setGhostBonePosition(ghostId, boneIdx, x, y, z) {
        const g = this.ghosts.get(ghostId);
        if (!g || boneIdx < 0 || boneIdx >= g.boneCount) return;
        g.curWorld[boneIdx * 16 + 12] = x;
        g.curWorld[boneIdx * 16 + 13] = y;
        g.curWorld[boneIdx * 16 + 14] = z;
    }

    /**
     * v827 — attach a rig+clip to an entity by ID. Injects a MeshRigBridge
     * into entityMeshRenderer._animators so the engine's existing
     * skinning path drives our rig.
     *
     * Requirements:
     *   - entityMeshRenderer must be findable (window.entityMeshRenderer or
     *     passed via opts.renderer)
     *   - the entity must currently render with a mesh marked isRigged
     *     (i.e. its GLB loaded with JOINTS_0/WEIGHTS_0 + animations).
     *     For static meshes, see future "force-skin" work.
     *
     * @returns { ok: true, bridge } | { error }
     */
    attachEntityRig(entityId, rig, clip, opts = {}) {
        const renderer = opts.renderer || window.entityMeshRenderer;
        if (!renderer) return { error: "entityMeshRenderer not on window — pass via opts.renderer" };
        if (!entityId) return { error: "entityId required" };
        if (!rig?.bones?.length) return { error: "rig must have at least one bone" };
        // Find the entity's mesh. We need the mesh.skin reference.
        // The renderer keeps assetVAOs keyed by assetId; the entity's
        // assetId is usually entity.kind. We don't have direct access,
        // so caller passes mesh via opts.mesh, OR we accept a mesh ref
        // directly through opts.
        const mesh = opts.mesh;
        if (!mesh) return { error: "opts.mesh required — pass the entity's mesh ref (e.g. entityMeshRenderer.assetVAOs.get(assetId).mesh)" };
        if (!mesh.isRigged || !mesh.skin) {
            return { error: "mesh is not rigged — only meshes with JOINTS_0/WEIGHTS_0 + skin can be retargeted via attachEntityRig" };
        }
        const bridge = new MeshRigBridge(mesh, rig, clip || null);
        // v833 — per-bridge gen counter (bumped only when this bridge
        // changes, so cache invalidation is fine-grained instead of
        // global). Set the initial gen here; consumers read bridge._gen.
        bridge._gen = 1;
        // Install. Engine's _getOrCreateInstanceAnimator returns this entry
        // when keyed by entityId, so subsequent draws use our bridge.
        renderer._animators.set(entityId, bridge);
        this._entityBridges = this._entityBridges || new Map();
        // If we're replacing an existing bridge at this entityId, mark
        // the old one as stale so a stale reference doesn't pollute caches.
        const prev = this._entityBridges.get(entityId);
        if (prev && prev !== bridge) prev._gen = -1;
        this._entityBridges.set(entityId, bridge);
        // v831 — coarse global gen kept for compatibility (still bumped)
        this._bridgeGen = (this._bridgeGen || 0) + 1;
        return { ok: true, bridge };
    }

    /**
     * v827 — detach. Lets the engine recreate its default animator next frame.
     */
    detachEntityRig(entityId, opts = {}) {
        const renderer = opts.renderer || window.entityMeshRenderer;
        if (!renderer) return { error: "entityMeshRenderer not on window" };
        renderer._animators.delete(entityId);
        // v833 — mark detached bridge stale before forgetting it
        const prev = this._entityBridges?.get(entityId);
        if (prev) prev._gen = -1;
        this._entityBridges?.delete(entityId);
        // v831 — bump coarse global gen
        this._bridgeGen = (this._bridgeGen || 0) + 1;
        return { ok: true };
    }

    /** v827 — list active bridges */
    listEntityBridges() {
        return Array.from(this._entityBridges?.keys() ?? []);
    }

    /**
     * v835 — Sever a limb on a bridged entity. Drives the engine's
     * existing Ragdoll.sever() physics + marks the bridge's detachedBones
     * so JointEmitter pauses emission and WorldLabels hides labels for
     * the severed subtree.
     *
     * @param {*} entityId - the entity whose limb to sever
     * @param {string|number} boneRef - bone name (e.g. "claw_r") or bone index
     * @param {object} opts - { separationDir, separationSpeed, spinSpeed,
     *                          ragdollManager? } — pass ragdollManager if not
     *                          using window.ragdollManager
     * @returns {object} { ok, severed: number[] } on success, { error } on failure
     */
    severLimb(entityId, boneRef, opts = {}) {
        const bridge = this._entityBridges?.get(entityId);
        if (!bridge) return { error: "no bridge attached for entityId " + entityId };
        // Resolve bone ref → idx
        let boneIdx;
        if (typeof boneRef === "number") {
            boneIdx = boneRef;
        } else {
            boneIdx = this.boneIdxByName(entityId, String(boneRef));
        }
        if (boneIdx == null || boneIdx < 0) return { error: "bone not found: " + boneRef };
        if (boneIdx === 0) return { error: "cannot sever root bone (boneIdx=0)" };
        // Locate ragdoll
        const ragdollManager = opts.ragdollManager || window.ragdollManager;
        if (!ragdollManager) return { error: "ragdollManager not available — pass via opts.ragdollManager or set window.ragdollManager" };
        const ragdoll = ragdollManager.getRagdoll?.(entityId);
        if (!ragdoll) return { error: "no active ragdoll for entityId " + entityId + " — entity must be in dying state" };
        // Drive the physics
        const subtree = ragdoll.sever(boneIdx, {
            separationDir: opts.separationDir,
            separationSpeed: opts.separationSpeed,
            spinSpeed: opts.spinSpeed,
        });
        if (!subtree) return { error: "ragdoll.sever returned null (invalid bone or ragdoll inactive)" };
        // Mark all subtree bones detached on the bridge (so emitters/HUDs react)
        const severed = [];
        for (const idx of subtree) {
            bridge.detachedBones.add(idx);
            severed.push(idx);
        }
        return { ok: true, severed };
    }

    /** Per-frame update — call BEFORE splatScene.draw() */
    update(nowSec) {
        for (const e of this.bindings.values()) {
            e.animator.evaluate(nowSec);
            e.binding.skin();
        }
    }

    /** Per-frame overlay draw — call AFTER splatScene.draw() */
    drawOverlays(viewProj, gl) {
        if (!this.showOverlay) return;
        for (const e of this.bindings.values()) {
            this.overlay.drawBinding(e.binding, viewProj, gl,
                this._selectedBone?.ownerId === "binding" ? this._selectedBone.boneIdx : -1);
        }
        for (const [id, g] of this.ghosts.entries()) {
            this.overlay.drawGhost(g, viewProj, gl,
                this._selectedBone?.ownerId === id ? this._selectedBone.boneIdx : -1);
        }
        // v825 — flush global debug-draw primitives sharing this overlay's
        // shader pipeline. Queued via window.debugDraw.line/point/etc.
        try { window.debugDraw?._flush?.(viewProj, gl, this.overlay); } catch (e) {}
    }

    /**
     * v819 — pick the closest bone (across all bindings + ghosts) within a
     * screen-space radius. Returns { ownerId, boneIdx, worldPos, screenPos } or null.
     * @param {number} mouseX — pixel x within canvas
     * @param {number} mouseY — pixel y within canvas
     * @param {Float32Array} viewProj — current view-projection matrix
     * @param {number} canvasW
     * @param {number} canvasH
     * @param {number} radiusPx — selection tolerance in pixels (default 16)
     */
    /**
     * v826 — Read the current world-space position of a bone. Used by
     * joint-driven particle emitters, attached UI labels, AI ranged
     * attack origins, etc.
     *   ownerId can be a binding's layerId, "binding:<layerId>", or a ghostId
     *   boneIdx is the index into rig.bones (resolve from id with .boneIdxByName)
     * Returns [x, y, z] or null if not found.
     */
    getBoneWorldPos(ownerId, boneIdx) {
        if (boneIdx == null || boneIdx < 0) return null;
        let curWorld = null;
        // Allow either "foo" or "binding:foo" as a layer ref
        const layerKey = ownerId?.startsWith?.("binding:") ? ownerId.slice("binding:".length) : ownerId;
        const b = this.bindings.get(layerKey);
        if (b && boneIdx < b.binding.boneCount) curWorld = b.binding.curWorld;
        if (!curWorld) {
            const g = this.ghosts.get(ownerId);
            if (g && boneIdx < g.boneCount) curWorld = g.curWorld;
        }
        if (!curWorld) return null;
        const off = boneIdx * 16;
        return [curWorld[off + 12], curWorld[off + 13], curWorld[off + 14]];
    }

    /**
     * v826 — Resolve a bone id (string) to its index for a given owner.
     * Returns -1 if not found.
     */
    boneIdxByName(ownerId, name) {
        const layerKey = ownerId?.startsWith?.("binding:") ? ownerId.slice("binding:".length) : ownerId;
        let rig = null;
        const b = this.bindings.get(layerKey);
        if (b) rig = b.binding.rig;
        if (!rig) {
            const g = this.ghosts.get(ownerId);
            if (g) rig = g.rig;
        }
        // v835 — also resolve through entity bridges (MeshRigBridge owners)
        if (!rig) {
            const bridge = this._entityBridges?.get(ownerId);
            if (bridge) rig = bridge.rig;
        }
        if (!rig) return -1;
        for (let i = 0; i < rig.bones.length; i++) {
            if (String(rig.bones[i].id) === String(name)) return i;
        }
        return -1;
    }

    pickBone(mouseX, mouseY, viewProj, canvasW, canvasH, radiusPx = 16) {
        let best = null;
        let bestDist2 = radiusPx * radiusPx;
        const _scanGroup = (boneCount, curWorld, ownerId) => {
            for (let i = 0; i < boneCount; i++) {
                const x = curWorld[i*16 + 12];
                const y = curWorld[i*16 + 13];
                const z = curWorld[i*16 + 14];
                // Project to clip space: clip = viewProj * (x, y, z, 1)
                const cx = viewProj[0]*x + viewProj[4]*y + viewProj[8] *z + viewProj[12];
                const cy = viewProj[1]*x + viewProj[5]*y + viewProj[9] *z + viewProj[13];
                const cz = viewProj[2]*x + viewProj[6]*y + viewProj[10]*z + viewProj[14];
                const cw = viewProj[3]*x + viewProj[7]*y + viewProj[11]*z + viewProj[15];
                if (cw <= 0) continue;                                      // behind camera
                const ndcX = cx / cw, ndcY = cy / cw;
                const sx = (ndcX *  0.5 + 0.5) * canvasW;
                const sy = (-ndcY * 0.5 + 0.5) * canvasH;
                const dx = sx - mouseX, dy = sy - mouseY;
                const d2 = dx*dx + dy*dy;
                if (d2 < bestDist2) {
                    bestDist2 = d2;
                    best = { ownerId, boneIdx: i, worldPos: [x, y, z], screenPos: [sx, sy], viewZ: cz / cw };
                }
            }
        };
        for (const [id, g] of this.ghosts.entries()) {
            _scanGroup(g.boneCount, g.curWorld, id);
        }
        for (const [layerId, e] of this.bindings.entries()) {
            _scanGroup(e.binding.boneCount, e.binding.curWorld, "binding:" + layerId);
        }
        return best;
    }

    /**
     * v819 — install canvas mouse handlers for click-drag bone manipulation.
     * Should be called ONCE during engine init. Hooks Shift+click to pick;
     * drag updates the selected bone's position; release commits.
     *
     * Drag projection: keep the bone's view-space Z constant; convert
     * mouse delta to world-space delta using the canvas dimensions + an
     * approximate scale derived from the bone's clip-space w.
     */
    installCanvasHandlers(canvas, camera) {
        if (this._handlersInstalled) return;
        this._handlersInstalled = true;
        let dragging = false;
        let downX = 0, downY = 0;
        let lastMouseX = 0, lastMouseY = 0;
        let pickedAt = null;        // { worldPos, viewZ, canvasW, canvasH, vpW }
        canvas.addEventListener("mousedown", (ev) => {
            if (!ev.shiftKey || ev.button !== 0) return;       // only Shift+LMB
            // Only if there's at least one active ghost (editor open) or binding
            if (this.ghosts.size === 0 && this.bindings.size === 0) return;
            const rect = canvas.getBoundingClientRect();
            const mx = ev.clientX - rect.left;
            const my = ev.clientY - rect.top;
            const pick = this.pickBone(mx, my, camera.viewProj, canvas.width, canvas.height, 20);
            if (!pick) return;
            this._selectedBone = { ownerId: pick.ownerId, boneIdx: pick.boneIdx };
            dragging = true;
            downX = mx; downY = my;
            lastMouseX = mx; lastMouseY = my;
            pickedAt = {
                worldPos: pick.worldPos.slice(),
                viewZ: pick.viewZ,
                canvasW: canvas.width,
                canvasH: canvas.height,
            };
            ev.preventDefault();
            ev.stopPropagation();
        }, true);                                                // capture phase — preempt other handlers
        canvas.addEventListener("mousemove", (ev) => {
            if (!dragging || !this._selectedBone || !pickedAt) return;
            const rect = canvas.getBoundingClientRect();
            const mx = ev.clientX - rect.left;
            const my = ev.clientY - rect.top;
            const dx_px = mx - downX;
            const dy_px = my - downY;
            // Approximate world-space per pixel using a vector derived from
            // the picked bone's screen+world. Use viewProj to compute a small
            // perpendicular offset's world equivalent. Simpler: use the
            // canvas-aspect + a heuristic scale based on |viewZ|.
            // Heuristic: 1 pixel ≈ |viewZ| / canvasH * 2 / tan(fov/2)
            // We don't have direct fov access; use camera position scale via
            // pickedAt.worldPos magnitude as a fallback. Good enough for v1.
            const dist = Math.max(1, Math.abs(pickedAt.viewZ) || 1);
            const scale = (dist * 2) / pickedAt.canvasH;          // world units per pixel
            // Pan in screen-aligned axes: +X right, +Y up
            // Compute camera right + up by reading rows from viewProj
            const vp = camera.viewProj;
            // The screen-aligned right vector ≈ first column of view-only
            // matrix. Since we don't separate view+proj, approximate from
            // viewProj rows. For an axis-aligned movement, decompose:
            //   right ≈ (vp[0], vp[4], vp[8])  but those include projection scale
            // Workaround: pull right/up from camera.yaw + pitch.
            const yaw = camera.yaw, pitch = camera.pitch;
            const cosY = Math.cos(yaw), sinY = Math.sin(yaw);
            const cosP = Math.cos(pitch), sinP = Math.sin(pitch);
            // forward = (sin(yaw)*cos(pitch), -sin(pitch), -cos(yaw)*cos(pitch))
            // right   = (cos(yaw),  0,  sin(yaw))
            // up      = (-sin(yaw)*sin(pitch), cos(pitch), cos(yaw)*sin(pitch))
            const rightX = cosY,         rightY = 0,        rightZ = sinY;
            const upX = -sinY * sinP,    upY = cosP,        upZ = cosY * sinP;
            const wx = pickedAt.worldPos[0] + (rightX * dx_px - upX * dy_px) * scale;
            const wy = pickedAt.worldPos[1] + (rightY * dx_px - upY * dy_px) * scale;
            const wz = pickedAt.worldPos[2] + (rightZ * dx_px - upZ * dy_px) * scale;
            // Apply to the selected bone
            const sel = this._selectedBone;
            if (typeof sel.ownerId === "string" && this.ghosts.has(sel.ownerId)) {
                this.setGhostBonePosition(sel.ownerId, sel.boneIdx, wx, wy, wz);
                if (typeof this._dragOnChange === "function") {
                    this._dragOnChange(sel.ownerId, sel.boneIdx, [wx, wy, wz]);
                }
            }
            lastMouseX = mx; lastMouseY = my;
            ev.preventDefault();
            ev.stopPropagation();
        }, true);
        const _end = (ev) => {
            if (dragging) {
                dragging = false;
                ev?.preventDefault?.();
                ev?.stopPropagation?.();
            }
        };
        canvas.addEventListener("mouseup", _end, true);
        canvas.addEventListener("mouseleave", _end, true);
    }

    /** Set a callback fired whenever drag changes a ghost bone's position */
    setDragCallback(fn) { this._dragOnChange = fn; }
}

// ─── small math helpers (inline to avoid creating yet another file) ─────

function _mat4FromTranslation(p) {
    const m = new Float32Array(16);
    m[0] = m[5] = m[10] = m[15] = 1;
    m[12] = p[0]; m[13] = p[1]; m[14] = p[2];
    return m;
}

function _mat4InvertSafe(src, srcOff, dst, dstOff) {
    // Translation-only rest poses → invert is just negate translation.
    // (If we ever support rotation in rest, replace with full inverse.)
    for (let i = 0; i < 12; i++) dst[dstOff + i] = src[srcOff + i];
    dst[dstOff + 12] = -src[srcOff + 12];
    dst[dstOff + 13] = -src[srcOff + 13];
    dst[dstOff + 14] = -src[srcOff + 14];
    dst[dstOff + 15] = 1;
}

// Find surrounding keyframes for t, interpolate position + rotation
function _sampleFrames(frames, t) {
    if (frames.length === 1) return frames[0];
    if (t <= frames[0].t) return frames[0];
    if (t >= frames[frames.length - 1].t) return frames[frames.length - 1];
    let i = 0;
    while (i < frames.length - 1 && frames[i + 1].t < t) i++;
    const a = frames[i], b = frames[i + 1];
    const span = b.t - a.t;
    const u = span > 0 ? (t - a.t) / span : 0;
    const out = {};
    if (a.position && b.position) {
        out.position = [
            a.position[0] + (b.position[0] - a.position[0]) * u,
            a.position[1] + (b.position[1] - a.position[1]) * u,
            a.position[2] + (b.position[2] - a.position[2]) * u,
        ];
    } else if (a.position) out.position = a.position.slice();
    if (a.rotation && b.rotation) {
        const tmp = new Float32Array(4);
        _quatSlerp(a.rotation, b.rotation, u, tmp);
        out.rotation = [tmp[0], tmp[1], tmp[2], tmp[3]];
    } else if (a.rotation) out.rotation = a.rotation.slice();
    return out;
}

// v826 — WorldLabels: DOM-based labels anchored to world 3D positions or
// to rig bones. Each label is a <div> positioned absolutely over the
// canvas; position recomputed each frame via viewProj projection.
// Out-of-screen / behind-camera labels are hidden via display:none.
//
// API (window.worldLabels after install):
//   .add(id, opts) → { id, pos?: [x,y,z], boneRef?: { layerId|ghostId, idx },
//                       text, html?, className?, offset?: [px, px], hideBehindCamera? }
//   .update(id, opts)
//   .remove(id)
//   .updateAll(viewProj, canvasW, canvasH) — called per frame
//   .clear()
//
// Labels with `boneRef` look up the bone's current world position from
// the RigSystem each frame (so they follow animated rigs automatically).
export class WorldLabels {
    constructor(container) {
        this.container = container;
        this.layer = document.createElement("div");
        Object.assign(this.layer.style, {
            position: "fixed", inset: "0",
            pointerEvents: "none",
            zIndex: "150",
            overflow: "hidden",
        });
        container.appendChild(this.layer);
        this.labels = new Map();      // id → { el, ...opts }
    }

    add(id, opts = {}) {
        if (this.labels.has(id)) return this.update(id, opts);
        const el = document.createElement("div");
        Object.assign(el.style, {
            position: "absolute",
            color: opts.color || "#dff",
            background: opts.bg || "rgba(0,0,0,0.55)",
            fontSize: (opts.fontSize || 11) + "px",
            padding: opts.padding || "2px 6px",
            borderRadius: "3px",
            fontFamily: "monospace",
            whiteSpace: "nowrap",
            transform: "translate(-50%, -100%)",
            pointerEvents: opts.clickable ? "auto" : "none",
            border: opts.border || "1px solid rgba(140,200,255,0.18)",
            display: "none",
        });
        if (opts.className) el.className = opts.className;
        if (opts.html != null) el.innerHTML = opts.html;
        else el.textContent = opts.text || "";
        if (opts.onClick) el.addEventListener("click", opts.onClick);
        this.layer.appendChild(el);
        const entry = { el, ...opts };
        this.labels.set(id, entry);
        return entry;
    }

    update(id, opts = {}) {
        const e = this.labels.get(id);
        if (!e) return null;
        Object.assign(e, opts);
        if (opts.text != null) e.el.textContent = opts.text;
        if (opts.html != null) e.el.innerHTML = opts.html;
        if (opts.color != null) e.el.style.color = opts.color;
        if (opts.bg != null) e.el.style.background = opts.bg;
        return e;
    }

    remove(id) {
        const e = this.labels.get(id);
        if (!e) return;
        try { this.layer.removeChild(e.el); } catch {}
        this.labels.delete(id);
    }

    clear() {
        for (const [id] of [...this.labels]) this.remove(id);
    }

    updateAll(viewProj, canvasW, canvasH) {
        for (const e of this.labels.values()) {
            let world = e.pos;
            if (e.boneRef && window.rigSystem) {
                const ref = e.boneRef;
                let curWorld = null;
                if (ref.layerId) {
                    const b = window.rigSystem.bindings.get(ref.layerId);
                    if (b) curWorld = b.binding.curWorld;
                } else if (ref.ghostId) {
                    const g = window.rigSystem.ghosts.get(ref.ghostId);
                    if (g) curWorld = g.curWorld;
                } else if (ref.entityId != null) {
                    // v835 — bridge-anchored label. Hide if the bone is detached
                    // (limb has flown off so the label has nothing meaningful
                    // to point at).
                    const bridge = window.rigSystem._entityBridges?.get(ref.entityId);
                    if (bridge?.isDetached?.(ref.idx)) {
                        e.el.style.display = "none";
                        continue;
                    }
                    if (bridge) curWorld = bridge.curWorld;
                }
                if (curWorld && ref.idx >= 0) {
                    const off = ref.idx * 16;
                    world = [curWorld[off + 12], curWorld[off + 13], curWorld[off + 14]];
                }
            }
            if (!world) { e.el.style.display = "none"; continue; }
            const x = world[0], y = world[1], z = world[2];
            const cx = viewProj[0]*x + viewProj[4]*y + viewProj[8] *z + viewProj[12];
            const cy = viewProj[1]*x + viewProj[5]*y + viewProj[9] *z + viewProj[13];
            const cw = viewProj[3]*x + viewProj[7]*y + viewProj[11]*z + viewProj[15];
            if (cw <= 0 && (e.hideBehindCamera ?? true)) {
                e.el.style.display = "none";
                continue;
            }
            const ndcX = cx / cw, ndcY = cy / cw;
            const sx = (ndcX *  0.5 + 0.5) * canvasW;
            const sy = (-ndcY * 0.5 + 0.5) * canvasH;
            if (sx < -50 || sx > canvasW + 50 || sy < -50 || sy > canvasH + 50) {
                e.el.style.display = "none";
                continue;
            }
            const off = e.offset || [0, -4];
            e.el.style.display = "";
            e.el.style.left = (sx + off[0]) + "px";
            e.el.style.top  = (sy + off[1]) + "px";
        }
    }
}

// v826 — TrackAnimator: general-purpose keyframe interpolator for non-bone
// things. Reuses the same clip schema as RigAnimator (
//   { duration, bones: [{ id, frames: [{ t, position?, rotation? }] }] }
// ) but the "id" doesn't have to be a bone — it can be any string the
// caller chooses (e.g. "camera", "sun", "civ.population"). Useful for:
//   * Camera paths (cinematics)
//   * Sun trajectories (timelapse weather)
//   * Civ growth curves
//   * Sequenced events ("rain at min 2, storm at min 5")
//
// Per-tick: animator.evaluate(t) → { id: { position?, rotation? }, ... }
// Caller applies the values to their own world objects.
export class TrackAnimator {
    constructor(clip) {
        this.clip = clip;
        this.playing = false;
        this.loop = true;
        this.startTime = 0;
    }
    play(nowSec) { this.playing = true; this.startTime = (nowSec ?? performance.now()/1000); }
    pause()      { this.playing = false; }
    stop()       { this.playing = false; this.startTime = 0; }

    /**
     * Evaluate all tracks at time t (seconds within clip).
     * Returns { trackId: { position?, rotation? } } map.
     */
    evaluate(t) {
        if (!this.clip || !Array.isArray(this.clip.bones)) return {};
        const dur = this.clip.duration || 1;
        let tt = t;
        if (this.loop) tt = ((t % dur) + dur) % dur;
        else tt = Math.min(Math.max(0, t), dur);
        const out = {};
        for (const track of this.clip.bones) {
            const frames = track.frames;
            if (!frames || frames.length === 0) continue;
            if (frames.length === 1) {
                out[track.id] = { ...frames[0] };
                continue;
            }
            // Find bracketing frames
            let i = 0;
            while (i < frames.length - 1 && frames[i+1].t < tt) i++;
            const f0 = frames[i];
            const f1 = frames[Math.min(i+1, frames.length-1)];
            const span = Math.max(1e-6, f1.t - f0.t);
            const uRaw = Math.max(0, Math.min(1, (tt - f0.t) / span));
            // v829 — apply easing. Per-keyframe `ease` on f0 wins; falls back
            // to track-level, then clip-level, then linear.
            const easeSpec = f0.ease ?? track.ease ?? this.clip.ease;
            const u = applyEasing(easeSpec, uRaw);
            const entry = {};
            // v831 — interpolation mode. Default "linear"; "catmullRom"
            // uses Hermite spline over 4 neighboring keyframes for C¹-
            // continuous smoothing through ALL keyframes (no per-keyframe
            // ease needed — the spline itself is the curve). Falls back
            // to lerp at edges where 4 neighbors aren't available.
            const interp = track.interpolation ?? this.clip.interpolation ?? "linear";
            if (f0.position && f1.position) {
                // v833 — Catmull-Rom variants get the same eased `u` so easing
                // composes with the spline (easing is the velocity along the
                // curve; spline is the shape). Pass `u` (eased) not `uRaw`.
                if ((interp === "catmullRom" || interp === "catmullRomCentripetal")
                    && frames.length >= 4 && i > 0 && i < frames.length - 2) {
                    const fm1 = frames[i - 1];
                    const fp2 = frames[i + 2];
                    if (interp === "catmullRomCentripetal") {
                        // Use the 3D-aware centripetal variant for non-uniform
                        // keyframe spacing — avoids cusps/loops.
                        entry.position = _catmullRomVec3(
                            fm1.position, f0.position, f1.position, fp2.position, u, 0.5
                        );
                    } else {
                        entry.position = [
                            _catmullRom(fm1.position[0], f0.position[0], f1.position[0], fp2.position[0], u),
                            _catmullRom(fm1.position[1], f0.position[1], f1.position[1], fp2.position[1], u),
                            _catmullRom(fm1.position[2], f0.position[2], f1.position[2], fp2.position[2], u),
                        ];
                    }
                } else {
                    entry.position = [
                        f0.position[0] + (f1.position[0] - f0.position[0]) * u,
                        f0.position[1] + (f1.position[1] - f0.position[1]) * u,
                        f0.position[2] + (f1.position[2] - f0.position[2]) * u,
                    ];
                }
            } else if (f0.position) entry.position = f0.position.slice();
            if (f0.rotation && f1.rotation) {
                // v831 — by default, rotation uses raw u (slerp has its own
                // curve). Opt-in track.easeRotation = true applies the same
                // ease as position — useful when a camera path's rotation
                // should pause/accelerate with the position.
                const uRot = (track.easeRotation || this.clip.easeRotation) ? u : uRaw;
                const q = new Float32Array(4);
                _quatSlerp(f0.rotation, f1.rotation, uRot, q);
                entry.rotation = [q[0], q[1], q[2], q[3]];
            } else if (f0.rotation) entry.rotation = f0.rotation.slice();
            out[track.id] = entry;
        }
        return out;
    }

    /**
     * Convenience: evaluate using a clock-based startTime + nowSec.
     * Returns the same map plus a `_t` field for the current clip time.
     */
    tick(nowSec) {
        if (!this.playing) return {};
        const t = nowSec - this.startTime;
        const res = this.evaluate(t);
        res._t = t;
        return res;
    }
}


// splats. Designed to feed the engine's existing EntityMeshRenderer skin
// path (aJoints uvec4 + aWeights vec4 + uJointMatrices[128] + uHasSkin).
//
// Differences from RigBinding (splats):
//   * K=4 multi-bone weighting (matches the vertex shader's blend math).
//     Splats use K=2 because covariance blending degrades with more bones.
//   * GPU skinning (no per-frame _splatPos write). We just compute
//     joint matrices each frame and the GPU does the rest.
//   * inverseBindMatrices stored (one per bone) so skinning math is the
//     standard glTF formula: skinMat[j] = curWorld[j] * inverseBind[j]
//
// Per-frame output: a Float32Array of size boneCount*16 (column-major mat4s)
// suitable for direct gl.uniformMatrix4fv(uJointMatrices, ...).
//
// Buffer outputs (built once at construction):
//   joints  — Uint16Array of vertCount*4   (joint indices per vertex)
//   weights — Float32Array of vertCount*4  (weights per vertex, sum to 1)
//
// Caller is responsible for uploading these to the mesh's GL buffers.
// We don't touch GL here — keeps MeshRigBinding portable.
export class MeshRigBinding {
    /**
     * @param {Object} mesh     — { positions: Float32Array (3 per vertex), vertCount }
     * @param {Object} rig      — { bones: [{ id, position, parent }] }
     */
    constructor(mesh, rig) {
        if (!mesh?.positions) throw new Error("MeshRigBinding: mesh.positions required");
        const n = (mesh.vertCount != null) ? mesh.vertCount : (mesh.positions.length / 3);
        this.mesh = mesh;
        this.rig = rig;
        this.vertCount = n;
        this.boneCount = rig.bones.length;
        if (this.boneCount === 0) throw new Error("MeshRigBinding: rig has no bones");
        if (this.boneCount > 128) console.warn("[MeshRigBinding] >128 bones; shader uJointMatrices[128] truncated");

        // Resolve parent indices
        const idMap = new Map();
        for (let i = 0; i < this.boneCount; i++) idMap.set(rig.bones[i].id, i);
        this.parentIdx = new Int32Array(this.boneCount);
        for (let i = 0; i < this.boneCount; i++) {
            const p = rig.bones[i].parent;
            this.parentIdx[i] = (p == null || p === -1) ? -1 : (idMap.get(p) ?? -1);
        }

        // Rest pose + inverse bind matrices
        this.restWorld    = new Float32Array(this.boneCount * 16);
        this.inverseBind  = new Float32Array(this.boneCount * 16);
        this._computeRestPose();

        // Current per-bone world matrices (initialized to rest)
        this.curWorld = new Float32Array(this.boneCount * 16);
        this.curWorld.set(this.restWorld);

        // Joint matrices output: cur * inverseBind, one per bone
        this.jointMatrices = new Float32Array(this.boneCount * 16);

        // K=4 weighting buffers (joints as Uint16 for safety; shader reads
        // them as uvec4 which is widened from any unsigned int input)
        this.joints  = new Uint16Array(this.vertCount * 4);
        this.weights = new Float32Array(this.vertCount * 4);

        // Scratch for matrix math
        this._tmpMat = new Float32Array(16);
    }

    _computeRestPose() {
        // Identical to RigBinding's rest pose computation — translation-only
        // world matrices from bone positions, plus their inverses for skinning.
        const done = new Uint8Array(this.boneCount);
        let progress = true;
        while (progress) {
            progress = false;
            for (let i = 0; i < this.boneCount; i++) {
                if (done[i]) continue;
                const p = this.parentIdx[i];
                if (p === -1 || done[p]) {
                    const local = _mat4FromTranslation(this.rig.bones[i].position);
                    this.restWorld.set(local, i * 16);
                    _mat4InvertSafe(this.restWorld, i * 16, this.inverseBind, i * 16);
                    done[i] = 1;
                    progress = true;
                }
            }
        }
    }

    /**
     * Auto-bind: K=4 nearest bones per vertex with inverse-distance weights,
     * normalized to sum=1.
     */
    autoBind() {
        const pos = this.mesh.positions;
        const n = this.vertCount;
        const b = this.boneCount;
        if (b === 0) return;
        // Cache bone positions in flat array for hot loop
        const bx = new Float32Array(b), by = new Float32Array(b), bz = new Float32Array(b);
        for (let j = 0; j < b; j++) {
            bx[j] = this.rig.bones[j].position[0];
            by[j] = this.rig.bones[j].position[1];
            bz[j] = this.rig.bones[j].position[2];
        }
        // Top-K=4 selection per vertex
        const topJ = new Int32Array(4);
        const topD2 = new Float32Array(4);
        for (let i = 0; i < n; i++) {
            const vx = pos[i*3], vy = pos[i*3+1], vz = pos[i*3+2];
            // Initialize top-4 to "infinity"
            topJ[0] = topJ[1] = topJ[2] = topJ[3] = -1;
            topD2[0] = topD2[1] = topD2[2] = topD2[3] = Infinity;
            for (let j = 0; j < b; j++) {
                const dx = vx - bx[j], dy = vy - by[j], dz = vz - bz[j];
                const d2 = dx*dx + dy*dy + dz*dz;
                // Insertion sort into top-4 (small fixed size — fine)
                if (d2 < topD2[3]) {
                    let k = 3;
                    while (k > 0 && d2 < topD2[k-1]) {
                        topJ[k]  = topJ[k-1];
                        topD2[k] = topD2[k-1];
                        k--;
                    }
                    topJ[k]  = j;
                    topD2[k] = d2;
                }
            }
            // Inverse-distance weights, normalized
            let totalW = 0;
            const w = [0, 0, 0, 0];
            for (let k = 0; k < 4; k++) {
                if (topJ[k] < 0) break;
                w[k] = 1 / Math.sqrt(topD2[k] + 1e-6);
                totalW += w[k];
            }
            if (totalW === 0) {
                // No bones — bind everything to bone 0 with weight 1
                this.joints[i*4]   = 0;
                this.weights[i*4]  = 1;
                this.joints[i*4+1] = this.joints[i*4+2] = this.joints[i*4+3] = 0;
                this.weights[i*4+1] = this.weights[i*4+2] = this.weights[i*4+3] = 0;
                continue;
            }
            for (let k = 0; k < 4; k++) {
                this.joints[i*4+k]  = topJ[k] >= 0 ? topJ[k] : 0;
                this.weights[i*4+k] = topJ[k] >= 0 ? w[k] / totalW : 0;
            }
        }
    }

    /**
     * Recompute jointMatrices = curWorld * inverseBind for each bone.
     * Caller uploads this.jointMatrices to uJointMatrices.
     */
    updateJointMatrices() {
        const tmp = this._tmpMat;
        for (let j = 0; j < this.boneCount; j++) {
            _mat4Multiply(this.curWorld, j * 16, this.inverseBind, j * 16, tmp, 0);
            this.jointMatrices.set(tmp, j * 16);
        }
    }
}

// v827 — MeshRigBridge: adapter between our (rig + clip) world and the
// engine's existing EntityMeshRenderer/SkeletalAnimator interface. The
// engine's draw path calls animator.update(dt) and uploads animator.jointMatrices
// into uJointMatrices. By stuffing a MeshRigBridge into entityMeshRenderer._animators
// keyed by an entity ID, that entity transparently animates via our clip system.
//
// Note: only works on meshes that are ALREADY rigged (mesh.isRigged === true).
// Forcing skin onto a previously-static mesh requires uploading aJoints + aWeights
// VBOs + setting mesh.isRigged + skin + animations — deferred to a future round.
export class MeshRigBridge {
    /**
     * @param {Object} mesh   — engine mesh with .skin (joints + inverseBindMatrices)
     * @param {Object} rig    — { bones: [...] } from the library
     * @param {Object} clip   — optional { duration, bones: [{ id, frames }] }
     */
    constructor(mesh, rig, clip = null) {
        this.mesh = mesh;
        this.rig = rig;
        this.clip = clip;
        // Map our rig bones to the mesh's existing joint indices.
        // mesh.skin.joints is an array of node indices. We assume the rig's
        // bone IDs are either the joint indices (numeric) or names that
        // match the mesh's joint naming. If only indices: rig.bones[i].id
        // should equal mesh.skin.joints[i] for i in 0..jointCount.
        const meshJointCount = mesh.skin?.joints?.length || rig.bones.length;
        this.jointCount = meshJointCount;
        this.jointMatrices = new Float32Array(this.jointCount * 16);
        // Identity-init so the first frame before update() shows rest pose.
        for (let j = 0; j < this.jointCount; j++) {
            this.jointMatrices[j*16 + 0]  = 1;
            this.jointMatrices[j*16 + 5]  = 1;
            this.jointMatrices[j*16 + 10] = 1;
            this.jointMatrices[j*16 + 15] = 1;
        }

        // Build the rig-side state: parentIdx + curWorld + inverseBind
        const idMap = new Map();
        for (let i = 0; i < rig.bones.length; i++) idMap.set(rig.bones[i].id, i);
        this.parentIdx = new Int32Array(rig.bones.length);
        for (let i = 0; i < rig.bones.length; i++) {
            const p = rig.bones[i].parent;
            this.parentIdx[i] = (p == null || p === -1) ? -1 : (idMap.get(p) ?? -1);
        }
        // Rest world matrices (translation-only — sufficient for rig as authored)
        this.restWorld = new Float32Array(rig.bones.length * 16);
        this.inverseBind = new Float32Array(rig.bones.length * 16);
        // Honor mesh.skin.inverseBindMatrices when present (preserves mesh-author's bind pose).
        const meshIBM = mesh.skin?.inverseBindMatrices;
        const done = new Uint8Array(rig.bones.length);
        let progress = true;
        while (progress) {
            progress = false;
            for (let i = 0; i < rig.bones.length; i++) {
                if (done[i]) continue;
                const p = this.parentIdx[i];
                if (p === -1 || done[p]) {
                    const local = _mat4FromTranslation(rig.bones[i].position);
                    this.restWorld.set(local, i * 16);
                    if (meshIBM && meshIBM[i] && meshIBM[i].length === 16) {
                        this.inverseBind.set(meshIBM[i], i * 16);
                    } else {
                        _mat4InvertSafe(this.restWorld, i * 16, this.inverseBind, i * 16);
                    }
                    done[i] = 1;
                    progress = true;
                }
            }
        }
        // curWorld starts at rest
        this.curWorld = new Float32Array(this.restWorld);

        // Animator surface mirroring SkeletalAnimator (so the engine
        // doesn't need to know it's a different class).
        this.animations = clip ? [{ name: "clip", duration: clip.duration }] : [];
        this.activeClipIdx = 0;
        this.timeSeconds = 0;
        this.skin = mesh.skin || {};

        // v829 — local TRS arrays matching SkeletalAnimator's shape, so
        // ragdoll (and any other system that hooks onPose) writes here
        // and we compose curWorld from these on every update.
        this.localT = new Array(rig.bones.length);
        this.localR = new Array(rig.bones.length);
        for (let i = 0; i < rig.bones.length; i++) {
            this.localT[i] = new Float32Array(3);    // x, y, z
            this.localR[i] = new Float32Array([0, 0, 0, 1]);   // quat xyzw, identity
        }
        this.onPose = null;   // set externally (ragdoll integration writes here)
        // v831 — scratch buffers reused each frame to eliminate per-frame
        // allocation in _composeCurWorld + _computeJointMatrices.
        this._composeLocalMat = new Float32Array(16);
        this._composeTmp      = new Float32Array(16);
        this._computeTmp      = new Float32Array(16);
        this._composeDone     = new Uint8Array(rig.bones.length);
        // v832 — SkeletalAnimator-compatible `nodes` array so Ragdoll (and
        // any other consumer that reads `animator.nodes[i].parent`) works
        // unchanged. Each node carries parent + translation/rotation/scale
        // matching the rig's rest pose. Used by Ragdoll for hierarchy walks
        // + parent-relative position math.
        this.nodes = new Array(rig.bones.length);
        for (let i = 0; i < rig.bones.length; i++) {
            const b = rig.bones[i];
            const pIdx = this.parentIdx[i];
            // Translation in node space is PARENT-RELATIVE (matches glTF)
            let tx = b.position[0], ty = b.position[1], tz = b.position[2];
            if (pIdx >= 0) {
                const pp = rig.bones[pIdx].position;
                tx -= pp[0]; ty -= pp[1]; tz -= pp[2];
            }
            this.nodes[i] = {
                parent: pIdx,                         // -1 for root, else index
                translation: [tx, ty, tz],            // parent-relative
                rotation: [0, 0, 0, 1],               // identity quat
                scale: [1, 1, 1],
                name: String(b.id),
            };
            // Also pre-fill localT with rest pose so first update() before
            // any clip evaluation gives the rest pose, not zeros.
            this.localT[i][0] = tx; this.localT[i][1] = ty; this.localT[i][2] = tz;
        }
        // localS — Ragdoll doesn't write to scale, but a consumer might
        // read it. Provide identity for parity.
        this.localS = new Array(rig.bones.length);
        for (let i = 0; i < rig.bones.length; i++) {
            this.localS[i] = new Float32Array([1, 1, 1]);
        }

        // v835 — Limb separation tracking. Bones in this set are
        // considered "detached" from the body. JointEmitter pauses
        // emission from detached bones; WorldLabels hides labels
        // anchored to them. The ragdoll's _severedRoots set drives
        // the physics; this set tells the visual/UX layer what's gone.
        // Includes the severed root AND all its descendants (the
        // whole subtree that flew off).
        this.detachedBones = new Set();
        // v841 — body-pass collapse mode for detached bones.
        //   true  (clean stump): detached bones get ALL-ZERO matrix.
        //         Pure-limb vertices weighted only to detached bones
        //         degenerate (w=0 in clip space) and the GPU discards
        //         them — the body looks cleanly amputated with a stump.
        //         Boundary vertices weighted partly to non-detached
        //         bones re-normalize naturally via homogeneous division:
        //         their effective weight to the body's bones grows to
        //         account for the lost detached weight, so they stay
        //         attached at the body without warping.
        //   false (legacy v836): detached bones pin to ancestor's joint
        //         matrix. The limb mesh stays visible at rest pose
        //         attached to the body. Use this for non-dismemberment
        //         use cases of detachedBones (e.g. temporarily hiding
        //         a bone in a way that keeps the mesh attached).
        this.cleanStump = true;
        // v838 — when each bone was detached (in bridge-local seconds at sever time).
        // v839 — now uses bridge._localTime instead of performance.now()
        // for pause-awareness (caller skips update() during pause →
        // _localTime doesn't advance → flying limbs don't age).
        this._detachedAt = new Map();
        // v838 — bones whose flying-limb has aged past limbLifetime.
        // Still in detachedBones (body pass keeps pinning them to parent),
        // but the limb pass renders them with all-zero matrices so the
        // flying-limb mesh collapses to a degenerate point (invisible).
        this._hiddenLimbBones = new Set();
        // v839 — bones that have ENTERED the fade phase. Fade is the
        // transition from full real matrix → all-zero. Visually: limb
        // shrinks toward its bone origin point over `limbFadeDuration`.
        // Map<boneIdx, fadeStartLocalTime>.
        this._fadingBones = new Map();
        // v839 — bones whose velocity has dropped below the settle
        // threshold. Once a bone is in here, fade kicks in immediately
        // (override-acceleration: don't wait for limbLifetime).
        this._settledBones = new Set();
        // v839 — per-bone settle tracking. Map<boneIdx, {prev:[x,y,z], lowFrames:number}>.
        this._boneSettleState = new Map();
        // v838 — seconds after sever until the flying limb fully hides.
        // null = never (limb stays visible until clearDetached/dispose).
        this.limbLifetime = null;
        // v839 — last N seconds of the lifetime spent fading instead of
        // snapping. Default 0.5s. Also used when settle-detection
        // accelerates fade (limb settles → fade immediately, lasts
        // limbFadeDuration seconds).
        this.limbFadeDuration = 0.5;
        // v839 — per-frame motion threshold for "settled" detection.
        // If a bone's curWorld translation moves less than this between
        // frames, increment its lowFrames counter.
        this.settleThreshold = 0.1;
        // v839 — how many consecutive low-motion frames before a bone
        // is marked settled (and fade starts immediately).
        this.settleHoldFrames = 30;   // 0.5s at 60fps
        // v839 — bridge-local time accumulator. Replaces wall-clock
        // for lifetime aging so pause + slow-motion behave correctly.
        this._localTime = 0;
        // Cache child lookup for fast subtree walks (built lazily)
        this._childrenOfBone = null;

        // v836 — invalidate children cache. Call after rig mutation
        // (extremely rare — rigs are immutable post-construction in
        // current usage, but the hook exists for completeness).
        this._invalidateChildrenCache = () => { this._childrenOfBone = null; };

        // v836 — invariant guard: _computeJointMatrices relies on
        // parent-first ordering (parent's matrix already computed when
        // we hit a child). Most authored rigs are parent-first; warn
        // (don't throw) if a rig is out of order so detached-bone
        // collapse will visually misbehave but won't crash.
        for (let i = 0; i < rig.bones.length; i++) {
            const p = this.parentIdx[i];
            if (p >= 0 && p >= i) {
                console.warn(`[MeshRigBridge] rig "${rig.name || "unnamed"}" is not parent-first: bone[${i}]="${rig.bones[i].id}" has parent at idx ${p}. Detached-bone collapse may render incorrectly.`);
                break;
            }
        }


        // Track-style evaluator state (reusing RigAnimator's logic inline so
        // we don't import-cycle).
        this._loop = true;

        this._scratchT = new Float32Array(3);
        this._scratchQ = new Float32Array(4);
    }

    /** Engine-compatible: called per frame with delta seconds */
    update(dt) {
        // v839 — bridge-local time accumulator (pause-aware). Callers
        // that skip update during pause give us a natural pause behavior:
        // _localTime doesn't advance, so detached-bone aging halts.
        this._localTime += dt;
        // v829 — Standard SkeletalAnimator-compatible flow:
        //   1. Reset locals to rest pose (from nodes — same pattern as SkeletalAnimator)
        //   2. Sample clip into localT/localR (if clip exists)
        //   3. Fire onPose hook so external systems (ragdoll, IK, procedural
        //      overrides) can write into localT/localR
        //   4. Compose curWorld[i] from localT[i] + localR[i] + parent
        //   5. Compute jointMatrices = curWorld * inverseBind
        const bones = this.rig.bones;
        // (1) reset to rest — v832: read from this.nodes[i].translation/rotation
        // which holds the parent-relative rest pose. Matches SkeletalAnimator.
        for (let i = 0; i < bones.length; i++) {
            const n = this.nodes[i];
            this.localT[i][0] = n.translation[0];
            this.localT[i][1] = n.translation[1];
            this.localT[i][2] = n.translation[2];
            this.localR[i][0] = n.rotation[0];
            this.localR[i][1] = n.rotation[1];
            this.localR[i][2] = n.rotation[2];
            this.localR[i][3] = n.rotation[3];
        }
        // (2) clip sample (writes into localT/localR)
        if (this.clip) {
            this.timeSeconds += dt;
            this._evaluateClip(this.timeSeconds);
        }
        // (3) onPose hook — ragdoll, IK, or custom poses
        if (this.onPose) {
            try { this.onPose(this); } catch (e) { console.warn("[MeshRigBridge] onPose threw:", e?.message); }
        }
        // (3b) v838 — age detached bones; any past lifetime move to _hiddenLimbBones
        this._ageDetachedBones();
        // (4) compose curWorld[i] from locals + parent's curWorld
        this._composeCurWorld();
        // (5) joint matrices
        this._computeJointMatrices();
        return this.jointMatrices;
    }

    /** v829 — compose curWorld matrices from localT + localR per bone, walking the hierarchy parent-first */
    _composeCurWorld() {
        const bones = this.rig.bones;
        // v831 — reuse scratch + reset done array (faster than creating new each frame)
        const done = this._composeDone;
        done.fill(0);
        const localMat = this._composeLocalMat;
        const tmp = this._composeTmp;
        let progress = true;
        while (progress) {
            progress = false;
            for (let i = 0; i < bones.length; i++) {
                if (done[i]) continue;
                const p = this.parentIdx[i];
                if (p === -1 || done[p]) {
                    // Build local matrix from translation + rotation (zero out localMat first)
                    const lt = this.localT[i], lr = this.localR[i];
                    const x = lr[0], y = lr[1], z = lr[2], w = lr[3];
                    localMat[0] = 1 - 2*(y*y + z*z);
                    localMat[1] = 2*(x*y + z*w);
                    localMat[2] = 2*(x*z - y*w);
                    localMat[3] = 0;
                    localMat[4] = 2*(x*y - z*w);
                    localMat[5] = 1 - 2*(x*x + z*z);
                    localMat[6] = 2*(y*z + x*w);
                    localMat[7] = 0;
                    localMat[8] = 2*(x*z + y*w);
                    localMat[9] = 2*(y*z - x*w);
                    localMat[10] = 1 - 2*(x*x + y*y);
                    localMat[11] = 0;
                    localMat[12] = lt[0]; localMat[13] = lt[1]; localMat[14] = lt[2];
                    localMat[15] = 1;
                    if (p === -1) {
                        this.curWorld.set(localMat, i * 16);
                    } else {
                        // curWorld[i] = curWorld[p] * localMat
                        _mat4Multiply(this.curWorld, p * 16, localMat, 0, tmp, 0);
                        this.curWorld.set(tmp, i * 16);
                    }
                    done[i] = 1;
                    progress = true;
                }
            }
        }
    }

    /** Match SkeletalAnimator's setClipByName — we only have one clip */
    setClipByName(name) {
        // No-op for now: a MeshRigBridge has at most one clip. Future:
        // accept a clip set.
        return this.activeClipIdx;
    }

    /**
     * v835 — Limb separation API. Mark a bone (and all descendants) as
     * detached. JointEmitter + WorldLabels query isDetached() to pause
     * emission / hide labels for that part of the body. Usually called
     * from RigSystem.severLimb after Ragdoll.sever() does the physics;
     * can also be called standalone (e.g. hide a bone preemptively).
     *
     * Returns the count of bones marked.
     */
    markDetached(boneIdx) {
        if (boneIdx < 0 || boneIdx >= this.rig.bones.length) return 0;
        // Build children map lazily, cache on instance
        if (!this._childrenOfBone) {
            this._childrenOfBone = new Array(this.rig.bones.length);
            for (let i = 0; i < this.rig.bones.length; i++) this._childrenOfBone[i] = [];
            for (let i = 0; i < this.rig.bones.length; i++) {
                const p = this.parentIdx[i];
                if (p >= 0) this._childrenOfBone[p].push(i);
            }
        }
        // BFS to mark the whole subtree
        const queue = [boneIdx];
        let count = 0;
        // v838/v839 — stamp the detach time using bridge-local time
        // (pause-aware). _localTime accumulates from dt passed to update().
        const now = this._localTime;
        while (queue.length) {
            const idx = queue.shift();
            if (this.detachedBones.has(idx)) continue;
            this.detachedBones.add(idx);
            this._detachedAt.set(idx, now);
            count++;
            for (const c of this._childrenOfBone[idx]) queue.push(c);
        }
        return count;
    }

    /** v835 — query: is this bone (or one of its ancestors) detached? */
    isDetached(boneIdx) {
        if (boneIdx < 0 || boneIdx >= this.rig.bones.length) return false;
        return this.detachedBones.has(boneIdx);
    }

    /** v835/v838/v839 — clear all detached + hidden + fade + settle state (call on respawn / reset) */
    clearDetached() {
        this.detachedBones.clear();
        this._detachedAt.clear();
        this._hiddenLimbBones.clear();
        this._fadingBones.clear();
        this._settledBones.clear();
        this._boneSettleState.clear();
    }

    /**
     * v838/v839 — Limb lifecycle state machine, called once per update.
     *
     * Per-bone lifecycle:
     *   detached → (settle detected) ─┐
     *              (age >= L-F)       ├→ fading → (fadeDuration elapsed) → hidden
     *                                 ┘
     * Where L = limbLifetime, F = limbFadeDuration.
     *
     * Skipped when limbLifetime is null (no auto-despawn).
     */
    _ageDetachedBones() {
        if (this.detachedBones.size === 0) return;
        const now = this._localTime;
        // Settle detection: track per-bone velocity proxy. Even when
        // limbLifetime is null we still detect (cheap), but only act on
        // it if limbLifetime is set (otherwise the limb stays forever).
        for (const idx of this.detachedBones) {
            if (this._hiddenLimbBones.has(idx)) continue;
            const off = idx * 16;
            const px = this.curWorld[off + 12], py = this.curWorld[off + 13], pz = this.curWorld[off + 14];
            let st = this._boneSettleState.get(idx);
            if (!st) {
                st = { prev: [px, py, pz], lowFrames: 0 };
                this._boneSettleState.set(idx, st);
            } else {
                const dx = px - st.prev[0], dy = py - st.prev[1], dz = pz - st.prev[2];
                const dist = Math.hypot(dx, dy, dz);
                if (dist < this.settleThreshold) st.lowFrames++;
                else st.lowFrames = 0;
                st.prev[0] = px; st.prev[1] = py; st.prev[2] = pz;
                if (st.lowFrames >= this.settleHoldFrames && !this._settledBones.has(idx)) {
                    this._settledBones.add(idx);
                }
            }
        }

        // Lifetime aging — only when limbLifetime is set
        if (this.limbLifetime == null) return;
        const fadeStartAge = Math.max(0, this.limbLifetime - this.limbFadeDuration);
        for (const idx of this.detachedBones) {
            if (this._hiddenLimbBones.has(idx)) continue;
            const t0 = this._detachedAt.get(idx);
            if (t0 == null) continue;
            const age = now - t0;
            // Start fade either by age OR by settle (whichever first)
            if (!this._fadingBones.has(idx)) {
                if (age >= fadeStartAge || this._settledBones.has(idx)) {
                    this._fadingBones.set(idx, now);
                }
            }
            // Finish fade → hidden
            const fadeStart = this._fadingBones.get(idx);
            if (fadeStart != null && (now - fadeStart) >= this.limbFadeDuration) {
                this._hiddenLimbBones.add(idx);
            }
        }
    }

    /** v839 — fade factor for the limb pass. 1 = fully visible, 0 = invisible. */
    _fadeFactor(boneIdx) {
        if (this._hiddenLimbBones.has(boneIdx)) return 0;
        const fadeStart = this._fadingBones.get(boneIdx);
        if (fadeStart == null) return 1;
        const elapsed = this._localTime - fadeStart;
        if (elapsed <= 0) return 1;
        if (elapsed >= this.limbFadeDuration) return 0;
        return 1 - (elapsed / this.limbFadeDuration);
    }

    /**
     * v831/v833 — chain a new onPose hook. The new callback is called
     * FIRST, then prior hooks in stacking order, then any pre-existing
     * `onPose` set directly. Returns a remove function. Hooks are stored
     * in an explicit array (not nested closures) so:
     *   * removeAllHooks() can wipe them all in one call
     *   * hooks.length warns at >10 (catches leaks from forgot-to-remove)
     *   * remove(id) is O(1) instead of recursive unwinding
     */
    addOnPose(fn) {
        if (typeof fn !== "function") return () => {};
        this._onPoseHooks = this._onPoseHooks || [];
        const id = Symbol("onPoseHook");
        this._onPoseHooks.push({ id, fn });
        // Install (or reinstall) the dispatcher
        if (!this._onPoseDispatcherInstalled) {
            this._onPoseDirect = this.onPose;     // capture any pre-existing direct assignment
            this.onPose = (a) => {
                // Walk hooks in LIFO so newest fires first (matches the
                // wrapper-closure pattern's behavior)
                if (this._onPoseHooks) {
                    for (let k = this._onPoseHooks.length - 1; k >= 0; k--) {
                        try { this._onPoseHooks[k].fn(a); }
                        catch (e) { console.warn("[MeshRigBridge] onPose hook:", e?.message); }
                    }
                }
                if (this._onPoseDirect) {
                    try { this._onPoseDirect(a); }
                    catch (e) { console.warn("[MeshRigBridge] direct onPose:", e?.message); }
                }
            };
            this._onPoseDispatcherInstalled = true;
        }
        if (this._onPoseHooks.length > 10) {
            console.warn(`[MeshRigBridge] >${this._onPoseHooks.length} onPose hooks — possible leak. Call removeAllHooks() or be sure each addOnPose's remove fn fires.`);
        }
        return () => {
            if (!this._onPoseHooks) return;
            const idx = this._onPoseHooks.findIndex(h => h.id === id);
            if (idx >= 0) this._onPoseHooks.splice(idx, 1);
        };
    }

    /** v833 — wipe all hooks added via addOnPose. Leaves the direct
     * `onPose` assignment intact (use `bridge.onPose = null` to clear that). */
    removeAllHooks() {
        this._onPoseHooks = [];
    }

    setClip(clip) {
        this.clip = clip;
        this.animations = clip ? [{ name: "clip", duration: clip.duration }] : [];
        this.timeSeconds = 0;
    }

    /** Sample the clip at time t and write into rig.bones positions/rotations */
    _evaluateClip(tRaw) {
        if (!this.clip) return;
        const dur = this.clip.duration || 1;
        const t = this._loop ? ((tRaw % dur) + dur) % dur : Math.min(Math.max(0, tRaw), dur);
        for (const track of (this.clip.bones || [])) {
            const boneIdx = this._findBoneIdx(track.id);
            if (boneIdx < 0) continue;
            const frames = track.frames || [];
            if (frames.length === 0) continue;
            // Find bracketing frames
            let i = 0;
            while (i < frames.length - 1 && frames[i+1].t < t) i++;
            const f0 = frames[i];
            const f1 = frames[Math.min(i+1, frames.length-1)];
            const span = Math.max(1e-6, f1.t - f0.t);
            const uRaw = Math.max(0, Math.min(1, (t - f0.t) / span));
            // v829 — apply per-keyframe / per-track / per-clip easing
            const easeSpec = f0.ease ?? track.ease ?? this.clip.ease;
            const u = applyEasing(easeSpec, uRaw);
            // v842 — interpolation mode (matches TrackAnimator). Pass eased
            // `u` to the spline so easing composes with the spline shape:
            // the spline determines the curve, easing determines velocity
            // along the curve.
            const interp = track.interpolation ?? this.clip.interpolation ?? "linear";
            // Position interpolation
            const rest = this.rig.bones[boneIdx].position;
            let px = rest[0], py = rest[1], pz = rest[2];
            if (f0.position && f1.position) {
                if ((interp === "catmullRom" || interp === "catmullRomCentripetal")
                    && frames.length >= 4 && i > 0 && i < frames.length - 2) {
                    const fm1 = frames[i - 1];
                    const fp2 = frames[i + 2];
                    if (interp === "catmullRomCentripetal") {
                        const out = _catmullRomVec3(
                            fm1.position, f0.position, f1.position, fp2.position, u, 0.5
                        );
                        px = out[0]; py = out[1]; pz = out[2];
                    } else {
                        px = _catmullRom(fm1.position[0], f0.position[0], f1.position[0], fp2.position[0], u);
                        py = _catmullRom(fm1.position[1], f0.position[1], f1.position[1], fp2.position[1], u);
                        pz = _catmullRom(fm1.position[2], f0.position[2], f1.position[2], fp2.position[2], u);
                    }
                } else {
                    px = f0.position[0] + (f1.position[0] - f0.position[0]) * u;
                    py = f0.position[1] + (f1.position[1] - f0.position[1]) * u;
                    pz = f0.position[2] + (f1.position[2] - f0.position[2]) * u;
                }
            } else if (f0.position) {
                px = f0.position[0]; py = f0.position[1]; pz = f0.position[2];
            }
            // Write into localT (parent-relative)
            const pIdx = this.parentIdx[boneIdx];
            if (pIdx >= 0) {
                const ppos = this.rig.bones[pIdx].position;
                this.localT[boneIdx][0] = px - ppos[0];
                this.localT[boneIdx][1] = py - ppos[1];
                this.localT[boneIdx][2] = pz - ppos[2];
            } else {
                this.localT[boneIdx][0] = px;
                this.localT[boneIdx][1] = py;
                this.localT[boneIdx][2] = pz;
            }
            // Rotation slerp → localR
            // Rotation slerp → localR
            // v842 — match TrackAnimator's easeRotation behavior: default
            // uses raw u (slerp's geodesic curve is usually right);
            // opt-in track.easeRotation = true or clip.easeRotation
            // applies the same ease as position. Useful for camera arcs
            // where rotation should pause/accelerate with position.
            if (f0.rotation && f1.rotation) {
                const uRot = (track.easeRotation || this.clip.easeRotation) ? u : uRaw;
                _quatSlerp(f0.rotation, f1.rotation, uRot, this._scratchQ);
                this.localR[boneIdx][0] = this._scratchQ[0];
                this.localR[boneIdx][1] = this._scratchQ[1];
                this.localR[boneIdx][2] = this._scratchQ[2];
                this.localR[boneIdx][3] = this._scratchQ[3];
            } else if (f0.rotation) {
                this.localR[boneIdx][0] = f0.rotation[0];
                this.localR[boneIdx][1] = f0.rotation[1];
                this.localR[boneIdx][2] = f0.rotation[2];
                this.localR[boneIdx][3] = f0.rotation[3];
            }
        }
    }

    _findBoneIdx(id) {
        for (let i = 0; i < this.rig.bones.length; i++) {
            if (String(this.rig.bones[i].id) === String(id)) return i;
        }
        return -1;
    }

    _computeJointMatrices() {
        // jointMatrices[j] = curWorld[j] * inverseBind[j]
        // Match the engine's expected joint ordering: jointMatrices[k] is
        // applied to vertices with aJoints[k]. mesh.skin.joints[k] is the
        // glTF node index; we assume our rig.bones[k] maps 1:1 by position.
        // v831 — reuse scratch buffer instead of allocating per call
        const tmp = this._computeTmp;
        const n = Math.min(this.jointCount, this.rig.bones.length);
        // v836 — for the BODY render pass, collapse detached bones to their
        // parent. Vertices weighted to a severed bone get pinned to the
        // parent's matrix; the body mesh visually shows an amputation
        // (no stretching toward the flying limb). Limb mesh rendering is
        // a separate pass with its own joint matrices (see _computeLimbJointMatrices).
        const hasDetached = this.detachedBones.size > 0;
        for (let j = 0; j < n; j++) {
            if (hasDetached && this.detachedBones.has(j)) {
                // v841 — clean stump mode (default). Detached bones get
                // an all-zero matrix. Pure-limb vertices weighted only
                // to detached bones get skinMat·V = (0,0,0,0); after
                // perspective division (w=0) the GPU discards them, so
                // the limb mesh disappears from the body. Boundary
                // vertices weighted partly to non-detached bones still
                // render correctly: their weighted sum reduces to
                // (Σ w_i · M_i) * V, and homogeneous coordinate division
                // by the resulting w = Σ w_i (over non-detached bones)
                // re-normalizes the position to lie at the weighted blend
                // of the remaining bones — i.e. on the body's surface.
                if (this.cleanStump) {
                    for (let k = 0; k < 16; k++) this.jointMatrices[j * 16 + k] = 0;
                    continue;
                }
                // Legacy v836 path: pin to first non-detached ancestor's
                // matrix. The limb mesh stays visible at rest pose
                // attached to the body (not a clean stump, but consistent
                // for non-dismemberment use cases of detachedBones).
                let anc = this.parentIdx[j];
                while (anc >= 0 && this.detachedBones.has(anc)) {
                    anc = this.parentIdx[anc];
                }
                if (anc >= 0) {
                    this.jointMatrices.set(
                        this.jointMatrices.subarray(anc * 16, anc * 16 + 16),
                        j * 16
                    );
                } else {
                    // Identity fallback
                    for (let k = 0; k < 16; k++) tmp[k] = (k % 5 === 0) ? 1 : 0;
                    this.jointMatrices.set(tmp, j * 16);
                }
                continue;
            }
            _mat4Multiply(this.curWorld, j * 16, this.inverseBind, j * 16, tmp, 0);
            this.jointMatrices.set(tmp, j * 16);
        }
        // Any extra joints beyond our rig stay identity (init'd in constructor).
    }

    /**
     * v836 — Compute joint matrices for a SEPARATE limb render pass.
     * Inverse of _computeJointMatrices's detached handling: ONLY the
     * detached subtree gets real matrices (driven by ragdoll physics);
     * everything else collapses to identity. Caller renders the SAME mesh
     * with this matrix array to show the flying limb without the body.
     *
     * Returns a Float32Array(boneCount * 16). Allocates on first call;
     * reused on subsequent calls for the same bridge.
     *
     * Visual model:
     *   1. _computeJointMatrices fills this.jointMatrices: body visible
     *      (detached bones pinned to parent — amputation), limb collapsed.
     *   2. computeLimbJointMatrices() fills this._limbJointMatrices:
     *      limb visible (real physics-driven matrices for detached bones),
     *      body collapsed to identity (no visible body).
     *   3. Renderer draws the mesh twice (once with each matrix array)
     *      → body + flying limb both visible, no stretchy in-between.
     *
     * If no bones are detached, returns null (caller should skip the
     * limb render pass).
     */
    computeLimbJointMatrices() {
        if (this.detachedBones.size === 0) return null;
        if (!this._limbJointMatrices) {
            this._limbJointMatrices = new Float32Array(this.jointCount * 16);
        }
        const lm = this._limbJointMatrices;
        const tmp = this._computeTmp;
        const n = Math.min(this.jointCount, this.rig.bones.length);
        for (let j = 0; j < n; j++) {
            if (this.detachedBones.has(j)) {
                if (this._hiddenLimbBones.has(j)) {
                    // v838 — hidden: all-zero matrix. Pure-limb vertices
                    // weighted to this bone get skinMat·V = 0 → degenerate
                    // → GPU discards. Boundary vertices still render
                    // correctly because the weighted sum is dominated by
                    // the non-zero contribution.
                    for (let k = 0; k < 16; k++) lm[j * 16 + k] = 0;
                } else {
                    // Real ragdoll-driven joint matrix
                    _mat4Multiply(this.curWorld, j * 16, this.inverseBind, j * 16, tmp, 0);
                    // v839 — apply fade: scale rotation/scale (m0..m10) but
                    // keep translation (m12..m14) intact. Vertices uniquely
                    // weighted to this bone collapse smoothly toward the
                    // bone's CURRENT world origin (its translation column)
                    // as fade goes 1 → 0. At fade=0, all such vertices
                    // are at the bone's origin point — degenerate but at
                    // a defined location, not at world origin. Boundary
                    // vertices blend correctly via the weighted sum.
                    const f = this._fadeFactor(j);
                    if (f < 1) {
                        for (let k = 0; k < 12; k++) tmp[k] *= f;   // R+S portion
                        // translation tmp[12..14] left as-is
                    }
                    lm.set(tmp, j * 16);
                }
            } else {
                // Identity — vertices weighted to non-detached bones collapse
                // (so the body mesh doesn't render in this pass)
                for (let k = 0; k < 16; k++) tmp[k] = (k % 5 === 0) ? 1 : 0;
                lm.set(tmp, j * 16);
            }
        }
        // Any extra joints stay identity
        for (let j = n; j < this.jointCount; j++) {
            for (let k = 0; k < 16; k++) tmp[k] = (k % 5 === 0) ? 1 : 0;
            lm.set(tmp, j * 16);
        }
        return lm;
    }
}



// Install on window so spawn-from-library and the editor can reach it
export function installRigSystemGlobal() {
    if (!window.rigSystem) {
        window.rigSystem = new RigSystem();
    }
    return window.rigSystem;
}

// v825 — Debug draw. Reuses the same shader-based LINES + POINTS pipeline
// the rig overlay uses, exposed as a general 3D scribble surface.
//   window.debugDraw.line([x,y,z], [x,y,z], [r,g,b])
//   window.debugDraw.point([x,y,z], [r,g,b], size?)
//   window.debugDraw.hierarchy(positions, parentIdx, color?)
//   window.debugDraw.aabb(min, max, color)
//   window.debugDraw.frame([x,y,z], axes?) — draws RGB axes at a point
//   window.debugDraw.clear() — wipes all queued primitives
// Primitives accumulate in queues, draw fires after rig overlays each
// frame via rigSystem.drawOverlays. clear() is automatic each frame
// unless persist=true.
//
// Design: each primitive becomes one entry in queues. drawOverlays
// flushes them via the overlay's _drawBonesGeneric internals (which
// take arbitrary boneCount + parentIdx + curWorld arrays).
export class DebugDraw {
    constructor() {
        this._lines = [];          // [{ a:[x,y,z], b:[x,y,z], color:[r,g,b], lifetime }]
        this._points = [];         // [{ p:[x,y,z], color:[r,g,b], size, lifetime }]
        this._persistent = [];     // primitives that survive clear()
    }
    line(a, b, color = [1, 1, 1], opts = {}) {
        const item = { a, b, color, persistent: !!opts.persist, depthTest: !!opts.depthTest };
        if (item.persistent) this._persistent.push({ type: "line", ...item });
        else this._lines.push(item);
    }
    point(p, color = [1, 1, 0], size = 8, opts = {}) {
        const item = { p, color, size, persistent: !!opts.persist, depthTest: !!opts.depthTest };
        if (item.persistent) this._persistent.push({ type: "point", ...item });
        else this._points.push(item);
    }
    aabb(min, max, color = [0.5, 1, 0.5], opts = {}) {
        const [x0, y0, z0] = min, [x1, y1, z1] = max;
        const corners = [
            [x0,y0,z0], [x1,y0,z0], [x1,y1,z0], [x0,y1,z0],
            [x0,y0,z1], [x1,y0,z1], [x1,y1,z1], [x0,y1,z1],
        ];
        const edges = [
            [0,1],[1,2],[2,3],[3,0],
            [4,5],[5,6],[6,7],[7,4],
            [0,4],[1,5],[2,6],[3,7],
        ];
        for (const [i, j] of edges) this.line(corners[i], corners[j], color, opts);
    }
    frame(p, axes = 1.0, opts = {}) {
        const [x, y, z] = p;
        this.line([x, y, z], [x + axes, y, z], [1, 0.3, 0.3], opts);
        this.line([x, y, z], [x, y + axes, z], [0.3, 1, 0.3], opts);
        this.line([x, y, z], [x, y, z + axes], [0.3, 0.5, 1], opts);
    }
    hierarchy(positions, parentIdx, color = [0.8, 0.6, 1.0]) {
        for (let i = 0; i < positions.length; i++) {
            const p = positions[i];
            this.point(p, color, 8);
            const pi = parentIdx?.[i];
            if (pi != null && pi >= 0 && pi < positions.length) {
                this.line(p, positions[pi], color);
            }
        }
    }
    /**
     * v826 — text(id, pos, opts) — anchored DOM label at a world position.
     * Backed by window.worldLabels. Auto-removed on clearText().
     * If `id` is reused, the label updates in place. Pass null pos to remove.
     */
    text(id, pos, opts = {}) {
        if (!window.worldLabels) return;
        const tid = "_debugDraw:" + id;
        if (pos == null) { window.worldLabels.remove(tid); return; }
        window.worldLabels.add(tid, { ...opts, pos });
        this._textIds = this._textIds || new Set();
        this._textIds.add(tid);
    }
    clearText() {
        if (!window.worldLabels || !this._textIds) return;
        for (const tid of this._textIds) window.worldLabels.remove(tid);
        this._textIds.clear();
    }
    clear() { this._lines = []; this._points = []; }
    clearPersistent() { this._persistent = []; }
    // Called by RigSystem.drawOverlays after the rig overlays render
    _flush(viewProj, gl, overlay) {
        // v826 — separate by depthTest flag so each goes through the correct path.
        const allLines = [...this._persistent.filter(p => p.type === "line"), ...this._lines];
        const lineGroups = { ontop: [], depth: [] };
        for (const l of allLines) (l.depthTest ? lineGroups.depth : lineGroups.ontop).push(l);
        const _drawLines = (group, depthTest) => {
            if (group.length === 0) return;
            const flat = [];
            for (const l of group) {
                flat.push(l.a[0], l.a[1], l.a[2], l.color[0], l.color[1], l.color[2]);
                flat.push(l.b[0], l.b[1], l.b[2], l.color[0], l.color[1], l.color[2]);
            }
            const ogl = overlay._getGL(gl);
            ogl.draw(new Float32Array(flat), gl.LINES, viewProj, 4.0, depthTest);
        };
        _drawLines(lineGroups.depth, true);
        _drawLines(lineGroups.ontop, false);

        const allPoints = [...this._persistent.filter(p => p.type === "point"), ...this._points];
        // Group by (size, depthTest)
        const ptGroups = new Map();
        for (const p of allPoints) {
            const key = (p.depthTest ? "D:" : "O:") + p.size;
            if (!ptGroups.has(key)) ptGroups.set(key, []);
            ptGroups.get(key).push(p);
        }
        for (const [key, group] of ptGroups.entries()) {
            const depthTest = key.startsWith("D:");
            const sz = parseFloat(key.slice(2));
            const flat = [];
            for (const p of group) {
                flat.push(p.p[0], p.p[1], p.p[2], p.color[0], p.color[1], p.color[2]);
            }
            const ogl = overlay._getGL(gl);
            ogl.draw(new Float32Array(flat), gl.POINTS, viewProj, sz, depthTest);
        }

        this._lines = [];
        this._points = [];
    }
}

// v825 — install global debugDraw; rig system flushes it during drawOverlays
export function installDebugDrawGlobal() {
    if (!window.debugDraw) window.debugDraw = new DebugDraw();
    return window.debugDraw;
}

// v826 — install global WorldLabels into the body. Returns the instance;
// caller must call updateAll(viewProj, w, h) each frame.
export function installWorldLabelsGlobal() {
    if (!window.worldLabels && typeof document !== "undefined") {
        window.worldLabels = new WorldLabels(document.body);
    }
    return window.worldLabels;
}
