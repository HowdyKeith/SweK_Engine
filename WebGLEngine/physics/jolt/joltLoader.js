import { LINEAR_DAMPING, ANGULAR_DAMPING } from "../damping.js";
// physics/jolt/joltLoader.js -- Jolt Physics (jrouwe/JoltPhysics, MIT) as a SweK physics backend, wrapped behind
// the SAME world-handle interface box3dLoader exposes (createWorld / addBox / addShip / setVelocity / impulse /
// angularImpulse / setTransform / readTransforms(7 floats/body) / readVelocities(3/body) / step / stateHash /
// backendId / destroy). Because the interface is identical, esBox3d, esHullCombat and box3dLockstep RUN on Jolt
// with no code change.
//
// v2477 -- that used to end "...all just work on either backend", and the difference between RUN and WORK is not
// pedantry, it is two real bugs. The claim was about the INTERFACE and was read as a claim about the PHYSICS.
//   - ES ships flew through 5%/s drag on Jolt and through vacuum on box3d, for as long as both backends existed,
//     because box3d_shim.c zeroes ship damping on purpose and addShip here inherited Jolt's default (fixed v2468).
//   - Cross-peer lockstep across a MIXED pair cannot work at all -- not a bug, a property (measured v2470).
// Identical methods are not identical physics, and nothing had ever compared the two engines against mathematics.
//
// Jolt is Y-up like box3d, so the ES (x,y) <-> world (x,z) mapping is unchanged. Jolt was verified deterministic
// headlessly (two fresh sims -> bit-identical), which is what lockstep needs. Loads the jolt-physics npm package
// (WASM, runs in Node AND the browser) via dynamic import, cached across worlds.
"use strict";

let _Jolt = null;
async function _load() {
    if (_Jolt) return _Jolt;
    // vendored, self-contained wasm-compat build (WASM embedded) -- resolves in Node AND the browser by relative path
    let mod;
    try { mod = await import("../../vendor/jolt/jolt-physics.wasm-compat.js"); }
    catch { mod = await import("jolt-physics"); }   // fallback to the npm package if vendored copy is absent
    const init = mod.default || mod; _Jolt = await init(); return _Jolt;
}

const LAYER_NM = 0, LAYER_M = 1, N_OBJ = 2, N_BP = 2;

function _makeInterface(Jolt) {
    const s = new Jolt.JoltSettings();
    const objFilter = new Jolt.ObjectLayerPairFilterTable(N_OBJ);
    objFilter.EnableCollision(LAYER_NM, LAYER_M); objFilter.EnableCollision(LAYER_M, LAYER_M);
    const bpi = new Jolt.BroadPhaseLayerInterfaceTable(N_OBJ, N_BP);
    bpi.MapObjectToBroadPhaseLayer(LAYER_NM, new Jolt.BroadPhaseLayer(0)); bpi.MapObjectToBroadPhaseLayer(LAYER_M, new Jolt.BroadPhaseLayer(1));
    s.mObjectLayerPairFilter = objFilter; s.mBroadPhaseLayerInterface = bpi;
    s.mObjectVsBroadPhaseLayerFilter = new Jolt.ObjectVsBroadPhaseLayerFilterTable(bpi, N_BP, objFilter, N_OBJ);
    const j = new Jolt.JoltInterface(s); Jolt.destroy(s); return j;
}

class JoltWorld {
    constructor(Jolt, gravity) {
        this.Jolt = Jolt; this.j = _makeInterface(Jolt); this.ps = this.j.GetPhysicsSystem(); this.bi = this.ps.GetBodyInterface();
        if (gravity) this.ps.SetGravity(new Jolt.Vec3(gravity[0], gravity[1], gravity[2]));
        this.bodies = [];   // { body, id, dynamic }
    }
    addBox({ type = "dynamic", pos = [0, 0, 0], half = [0.5, 0.5, 0.5], density = 1, damping = LINEAR_DAMPING } = {}) {
        const Jolt = this.Jolt, dyn = type !== "static";
        const shape = new Jolt.BoxShapeSettings(new Jolt.Vec3(half[0], half[1], half[2])).Create().Get();
        const cs = new Jolt.BodyCreationSettings(shape, new Jolt.RVec3(pos[0], pos[1], pos[2]), new Jolt.Quat(0, 0, 0, 1), dyn ? Jolt.EMotionType_Dynamic : Jolt.EMotionType_Static, dyn ? LAYER_M : LAYER_NM);
        if (dyn) { cs.mOverrideMassProperties = Jolt.EOverrideMassProperties_CalculateInertia; cs.mMassPropertiesOverride.mMass = density * 8 * half[0] * half[1] * half[2]; }
        // v2468 -- SET, not inherited. This is the value Jolt was already defaulting to, so nothing about Jolt's
        // behaviour changes; what changes is that the ENGINE now chooses it, and box3d is held to the same number.
        cs.mLinearDamping = damping;
        cs.mAngularDamping = damping === 0 ? 0 : ANGULAR_DAMPING;
        const b = this.bi.CreateBody(cs); Jolt.destroy(cs); this.bi.AddBody(b.GetID(), dyn ? Jolt.EActivation_Activate : Jolt.EActivation_DontActivate);
        this.bodies.push({ body: b, id: b.GetID(), dynamic: dyn }); return this.bodies.length - 1;
    }
    // planar ES helper: a cube at (x, 0, z). Matches box3d.addShip so esBox3d/esHullCombat are backend-agnostic.
    //
    // v2468 -- DRAG-FREE, and this was a real bug for as long as there have been two backends. box3d_shim.c sets
    // bd.linearDamping = 0.0f for ships ON PURPOSE ("zero damping so velocity persists like ES's drag-free space
    // flight"), and esBox3d's flight model is written "drag-free like ES space" and owns its own drag. Jolt's ships
    // went through addBox and inherited Jolt's 0.05 default, so ES ships have been flying through 5%-per-second
    // molasses on Jolt and through vacuum on box3d -- while this very file claimed the substrate "just works on
    // either backend". The two backends were never agnostic; nothing had ever measured them against each other.
    addShip({ x = 0, z = 0, half = 0.5, density = 1 } = {}) { return this.addBox({ type: "dynamic", pos: [x, 0, z], half: [half, half, half], density, damping: 0 }); }
    // v2470 -- a world now says WHICH ENGINE IT IS, because lockstep across two different engines is not merely
    // broken, it is impossible, and until now nothing in the stack could even tell them apart.
    backendId() { return "jolt"; }
    _id(idx) { return this.bodies[idx].id; }
    setVelocity(idx, v) { const J = this.Jolt, vv = new J.Vec3(v[0], v[1], v[2]); this.bi.SetLinearVelocity(this._id(idx), vv); J.destroy(vv); this.bi.ActivateBody(this._id(idx)); }
    impulse(idx, v) { const J = this.Jolt, vv = new J.Vec3(v[0], v[1], v[2]); this.bi.AddImpulse(this._id(idx), vv); J.destroy(vv); this.bi.ActivateBody(this._id(idx)); }
    angularImpulse(idx, v) { const J = this.Jolt, vv = new J.Vec3(v[0], v[1], v[2]); this.bi.AddAngularImpulse(this._id(idx), vv); J.destroy(vv); this.bi.ActivateBody(this._id(idx)); }
    setTransform(idx, p, q) { const J = this.Jolt, pp = new J.RVec3(p[0], p[1], p[2]), qq = new J.Quat(q[0], q[1], q[2], q[3]); this.bi.SetPositionAndRotation(this._id(idx), pp, qq, J.EActivation_Activate); J.destroy(pp); J.destroy(qq); }
    step(dt = 1 / 60, substeps = 1) { this.j.Step(dt, substeps); }
    readTransforms() {
        const out = new Float32Array(this.bodies.length * 7);
        for (let i = 0; i < this.bodies.length; i++) { const b = this.bodies[i].body, p = b.GetPosition(), r = b.GetRotation(), o = i * 7; out[o] = p.GetX(); out[o + 1] = p.GetY(); out[o + 2] = p.GetZ(); out[o + 3] = r.GetX(); out[o + 4] = r.GetY(); out[o + 5] = r.GetZ(); out[o + 6] = r.GetW(); }
        return out;
    }
    readVelocities() {
        const out = new Float32Array(this.bodies.length * 3);
        for (let i = 0; i < this.bodies.length; i++) { const b = this.bodies[i]; if (!b.dynamic) continue; const v = this.bi.GetLinearVelocity(b.id), o = i * 3; out[o] = v.GetX(); out[o + 1] = v.GetY(); out[o + 2] = v.GetZ(); }
        return out;
    }
    // quantized position hash for cross-peer desync detection, same spirit + width as box3d's stateHash (uint32)
    // v2509 -- THE RECORDING API, HONESTLY REFUSED.
    //
    // The facade's promise is that Jolt and box3d are interchangeable. Recording breaks that promise and cannot be
    // patched over: a .b3rec is box3d's format, replayed by box3d's own b3RecPlayer against state hashes box3d
    // embedded. Jolt is a different engine. It could not produce one, and faking it would be worse than saying no.
    //
    // So these exist and REFUSE, which is the difference between a branch the caller can take and a TypeError
    // halfway down a page the moment someone clicks. The ship gate demands both backends answer every method the
    // pages call -- it caught this, and it was right to.
    // v2515 -- JOINTS, HONESTLY REFUSED. Jolt itself has constraints; THIS BINDING does not bind them. That is the
    // honest statement: not "Jolt cannot", but "our JoltWorld cannot", and a page must be able to find that out
    // without a TypeError. The ship gate requires both backends answer every world method a page calls.
    supportsJoints() { return false; }
    jointSpherical() { return -1; }   // -1 = no joint made, the same answer the shim gives for a bad body index
    jointRevolute() { return -1; }
    jointWeld() { return -1; }
    jointCount() { return 0; }
    jointDestroy() {}

    supportsRecording() { return false; }
    startRecording() { return false; }
    stopRecording() { return new Uint8Array(0); }
    validateReplay() { return null; }   // null = "I cannot answer", distinct from false = "it failed"

    stateHash() { let h = 2166136261 >>> 0; const xf = this.readTransforms(); for (let i = 0; i < xf.length; i++) { const q = Math.round(xf[i] * 1000) | 0; h ^= q & 0xff; h = Math.imul(h, 16777619) >>> 0; h ^= (q >> 8) & 0xff; h = Math.imul(h, 16777619) >>> 0; } return h >>> 0; }
    destroy() { try { this.Jolt.destroy(this.j); } catch {} this.bodies.length = 0; }
    // raw handles for advanced use (constraints, ragdolls) -- the box3d-compatible interface above stays clean
    // v2450 -- box3d has always had this and Jolt did not, so any page that asked a Jolt world how many bodies it
    // held got a TypeError, which escaped the frame loop before its requestAnimationFrame and silently killed the
    // animation for good. The facade claimed parity it did not have. tools/qa/backendParity.mjs now checks that claim.
    bodyCount() { return this.bodies.length; }

    raw() { return { Jolt: this.Jolt, ps: this.ps, bi: this.bi, bodyOf: (idx) => this.bodies[idx].body }; }
}

// backend factory, mirrors box3d's shape: await createJoltBackend(); then backend.createWorld({gravity}).
async function createJoltBackend() {
    const Jolt = await _load();
    return {
        createWorld({ gravity = [0, -9.8, 0] } = {}) { return new JoltWorld(Jolt, gravity); },
        _Jolt: Jolt,
    };
}

export { createJoltBackend, JoltWorld };
if (typeof module !== "undefined" && module.exports) module.exports = { createJoltBackend, JoltWorld };
