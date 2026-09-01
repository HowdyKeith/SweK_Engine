// =============================================================================
// FILE: /physics/box3d/box3dLoader.js
// v1989 — loader + JS binding for the Box3D WASM build (erincatto/box3d, alpha).
//
// The WASM artifact is NOT vendored (it must be compiled once on a networked
// box with emsdk — see build-box3d-wasm-clang.sh in this folder). This loader:
//   · tries to import /vendor/box3d/box3d.js (the Emscripten ES module);
//   · reports { ready:false, reason } cleanly when it isn't built yet, so
//     callers can fall back to the JS PhysicsSystem (core/ecs/systems/physics.js);
//   · exposes a small world API (createWorld/addBox/step/readTransforms);
//   · exposes lockstep helpers: stateHash() for desync detection, and
//     selfTest() — run it on two different boxes; identical printed hashes
//     demonstrate Box3D's cross-platform determinism, the precondition for
//     input-only peer sync (a few bytes/tick instead of entity-state blobs).
//
// Usage:
//   import { box3d } from "/physics/box3d/box3dLoader.js";
//   const st = await box3d.init();          // { ready, reason? }
//   if (st.ready) {
//     const w = box3d.createWorld({ gravity: [0, -9.8, 0] });
//     const ground = w.addBox({ type: "static",  pos: [0, -0.5, 0], half: [50, 0.5, 50] });
//     const crate  = w.addBox({ type: "dynamic", pos: [0, 5, 0],   half: [0.5, 0.5, 0.5] });
//     w.step(1 / 60, 4);                     // dt, substeps (Box3D solver sub-stepping)
//     const xf = w.readTransforms();         // Float32Array, 7 floats per body (pos + quat)
//     console.log("hash:", w.stateHash().toString(16));
//   }
// =============================================================================

import { explainWasmFailure } from "../../engine/wasmSupport.mjs";

class Box3DWorldHandle {
    constructor(mod) {
        this._m = mod;
        this._xfPtr = 0;
        this._xfCap = 0;
        this._vPtr = 0;
        this._vCap = 0;
    }
    addBox({ type = "dynamic", pos = [0, 0, 0], half = [0.5, 0.5, 0.5], density = 1 } = {}) {
        const t = type === "dynamic" ? 1 : type === "kinematic" ? 2 : 0;   // 0 static, 1 dynamic, 2 kinematic
        const idx = this._m._swk_body_box(t, pos[0], pos[1], pos[2], half[0], half[1], half[2], density);
        if (idx < 0) throw new Error("box3d: body limit reached");
        return idx;
    }
    backendId() { return "box3d"; }   // v2470 -- see physics/damping.js and box3dSyncCompare
    step(dt = 1 / 60, substeps = 4) { this._m._swk_world_step(dt, substeps); }
    // v2258 -- interaction primitives: let the kaiju CAUSE the physics.
    impulse(idx, v) { this._m._swk_body_impulse(idx, v[0], v[1], v[2]); }                          // linear impulse at COM (kick/blast)
    angularImpulse(idx, v) { this._m._swk_body_ang_impulse(idx, v[0], v[1], v[2]); }               // spin (tumbling throw)
    setVelocity(idx, v) { this._m._swk_body_set_velocity(idx, v[0], v[1], v[2]); }                 // launch at a chosen speed
    setTransform(idx, p, q) { this._m._swk_body_set_transform(idx, p[0], p[1], p[2], q[0], q[1], q[2], q[3]); }  // drive a kinematic body
    setType(idx, type) { this._m._swk_body_set_type(idx, type === "kinematic" ? 2 : type === "dynamic" ? 1 : 0); } // wall -> debris on impact
    // v3568 -- SURFACE PROPERTIES. Two rigid-body keys need these and could not be written without them: the
    // friction cone (a box slides iff tan(theta) > mu, an exact threshold bisected on a binary outcome) and the
    // bounce ratio (h_n = e^(2n) h_0, geometric, with e = 0 an EXACT zero). See physics/mechanics/rigidKeys.mjs.
    //
    // *** THEY RETURN false WHEN THE ARTIFACT PREDATES THEM, RATHER THAN THROWING. *** vendor/box3d/box3d.wasm is
    // a v2560 build and is already three functions behind box3d_shim.c, so "the loader is ready" has never meant
    // "the artifact has everything the shim declares". A caller that must have these should ask supports() first;
    // physics/box3d/box3dNode.mjs reports the whole gap as an integer set difference.
    setFriction(idx, mu) { if (!this._m._swk_body_set_friction) return false; this._m._swk_body_set_friction(idx, mu); return true; }
    setRestitution(idx, e) { if (!this._m._swk_body_set_restitution) return false; this._m._swk_body_set_restitution(idx, e); return true; }
    supports(name) { return typeof this._m["_swk_" + name] === "function"; }
    // v2263 -- ES ship: a planar, drag-free, non-rotating body (heading lives in the flight model).
    addShip({ x = 0, z = 0, half = 0.5, density = 1 } = {}) {
        const idx = this._m._swk_body_ship(x, z, half, density);
        if (idx < 0) throw new Error("box3d: body limit reached");
        return idx;
    }
    // [vx,vy,vz] per body; collision-adjusted. Valid until the next box3d call.
    readVelocities() {
        const n = this._m._swk_body_count(), bytes = n * 3 * 4;
        if (bytes > this._vCap) { if (this._vPtr) this._m._free(this._vPtr); this._vPtr = this._m._malloc(bytes); this._vCap = bytes; }
        this._m._swk_velocities(this._vPtr);
        return new Float32Array(this._m.HEAPF32.buffer, this._vPtr, n * 3);
    }
    bodyCount() { return this._m._swk_body_count(); }
    // Float32Array view: [x,y,z, qx,qy,qz,qw] per body. Valid until next call.
    readTransforms() {
        const n = this.bodyCount(), bytes = n * 7 * 4;
        if (bytes > this._xfCap) {
            if (this._xfPtr) this._m._free(this._xfPtr);
            this._xfPtr = this._m._malloc(bytes);
            this._xfCap = bytes;
        }
        this._m._swk_transforms(this._xfPtr);
        return new Float32Array(this._m.HEAPF32.buffer, this._xfPtr, n * 7);
    }
    stateHash() { return this._m._swk_state_hash() >>> 0; }

    // ---- joints (v2515) --------------------------------------------------------------------------------------
    //
    // A rig IS a joint graph. Shoulders and hips are spherical, elbows and knees are revolute, a spine segment is
    // a weld. box3d compiled all eight types from the start; this shim bound none of them until now, so the engine
    // had bodies and no way to attach one to another.
    //
    // ANCHORS ARE WORLD-SPACE HERE, because that is what a rig gives you: a bone's head, where it is right now.
    // box3d wants each anchor in each body's own local frame, so the shim converts with b3Body_GetLocalPoint.
    // Doing that arithmetic in JS would be a second, worse copy of a conversion the library already ships.
    //
    // AXES ARE WORLD-SPACE TOO. box3d has no axis field: the hinge is the joint FRAME's z-axis, and you rotate the
    // frame to point it. The shim does that (b3ComputeQuatBetweenUnitVectors), following box3d's own
    // samples/sample_character.cpp rather than a guess.
    //
    // DETERMINISM: the joints themselves are solved inside box3d and inherit its determinism -- they cost lockstep
    // nothing. What costs lockstep everything is whatever DRIVES them. A pose sampled from wall-clock time or a
    // variable frame delta makes two peers disagree on tick 300; a pose sampled from the TICK INDEX does not. Same
    // rule that keeps the GPU brain out of the simulation loop.

    // A shoulder or a hip. `cone` in degrees opens around `axis`; <= 0 means unlimited.
    // Returns a joint index, or -1 if either body index is out of range.
    jointSpherical(a, b, anchor, axis = [0, 1, 0], cone = 0) {
        return this._m._swk_joint_spherical(a | 0, b | 0, anchor[0], anchor[1], anchor[2], axis[0], axis[1], axis[2], cone);
    }

    // An elbow or a knee. lo/hi in degrees; pass lo >= hi for a free hinge.
    // A knee is roughly (0, 150): it bends one way and stops.
    jointRevolute(a, b, anchor, axis = [1, 0, 0], lo = 0, hi = 0) {
        return this._m._swk_joint_revolute(a | 0, b | 0, anchor[0], anchor[1], anchor[2], axis[0], axis[1], axis[2], lo, hi);
    }

    // A spine segment. hertz <= 0 is truly rigid; a few Hz gives a spine that flexes under a hit.
    jointWeld(a, b, anchor, hertz = 0, damping = 0.5) {
        return this._m._swk_joint_weld(a | 0, b | 0, anchor[0], anchor[1], anchor[2], hertz, damping);
    }

    jointCount() { return this._m._swk_joint_count(); }

    // Leaves a hole rather than shifting the joints after it: an index must mean the same joint for the life of
    // the world, or every handle the caller holds quietly points at a different bone.
    jointDestroy(i) { this._m._swk_joint_destroy(i | 0); }

    // Does this WASM have joints at all? A box3d.js built before v2515 does not, and "not a function" tells an
    // operator nothing. Same reason supportsRecording() exists.
    /**
     * v2564 -- THE ELEVENTH CALL (v2557's CONTRACT).
     *
     * box3d IS SPATIAL, and this was measured rather than assumed: the same engine, given the same 5 m/s push
     * straight up for one second with gravity off, moves a DYNAMIC swk_body_box to y = 4.8765 -- and leaves a
     * swk_body_ship at y = 0.0000.
     *
     * The ship does not move because swk_body_ship SETS motionLocks{ false, TRUE, false, true, true, true } --
     * Y IS LOCKED ON PURPOSE. Endless Sky ships fly in a plane, and that is the whole point of the helper.
     *
     * v2564 MADE THIS SAY "planar", AND IT WAS RIGHT TO. v2565 MAKES IT SAY "spatial", AND NOTHING ABOUT BOX3D
     * CHANGED IN BETWEEN.
     *
     * The history matters, because it is the whole argument for why this call exists:
     *
     *   v2564: the contract's only body-maker was addShip. swk_body_ship sets motionLocks{false,TRUE,false,...}
     *          -- Y LOCKED ON PURPOSE, because Endless Sky ships fly in a plane. So through that interface,
     *          box3d offered two axes and no more, and "spatial" would have been a claim a caller could not
     *          cash. The checker pushed a ship up, watched it not rise, and failed my "spatial". CORRECT.
     *
     *   v2565: addBox joined the contract -- a method THIS FILE HAS HAD ALL ALONG. The capability was never
     *          missing; the interface never asked. Now the probe is a general body, and the same engine that
     *          could not lift a ship lifts a box to y=4.8765 from a 5 m/s push. "spatial" is now a claim the
     *          caller CAN cash, and the checker makes it prove it every run.
     *
     * v2564's ANSWER went stale. v2564's REASONING did not, and those are different things: dimensionality()
     * ANSWERS FOR THE CONTRACT, NOT FOR THE ENGINE'S BROCHURE. The day this file offers a caller only planar
     * bodies again, this goes back to "planar" -- and the checker will notice before anyone else does.
     */
    dimensionality() { return "spatial"; }

    // v3586 -- CONTACTS, ROUND 3: THE OVERLAY. The shim declared three rounds at v3037 (exports -> gate ->
    // overlay); v3569 built the exports, v3580 drove them, and this is what a page needs to DRAW them.
    //
    // *** AND v3580 SETTLED WHAT AN OVERLAY MAY CLAIM, WHICH IS WHY THIS RETURNS BOTH IMPULSES. *** The stride
    // carries totalNormalImpulse AND the final-substep normalImpulse, and the total is NOT a momentum budget
    // outside the static case: reported/needed measured 1.742 at impact, 14 to 30 while settling, and exactly 2
    // only at rest. So a renderer scaling arrow length by it would be drawing a number that MEANS SOMETHING
    // DIFFERENT MID-IMPACT THAN AT REST. POSITION AND NORMAL ARE SOUND; magnitude is a solver diagnostic, and
    // both fields are handed over so a page can show that rather than pick one and imply it is the force.
    supportsContacts() { return typeof this._m._swk_contacts === "function" && typeof this._m._swk_contact_count === "function"; }
    readContacts() {
        // ABSENT IS NOT EMPTY: an artifact built before v3037 has no contact exports at all, and returning []
        // would render an untroubled scene with no contacts rather than a page that cannot answer.
        if (!this.supportsContacts()) return null;
        const n = this._m._swk_contact_count();
        if (!n) return [];
        const stride = this._m._swk_contact_stride();
        const p = this._m._malloc(n * stride * 4);
        this._m._swk_contacts(p);
        const a = this._m.HEAPF32.subarray(p / 4, p / 4 + n * stride);
        const out = [];
        for (let i = 0; i < n; i++) {
            const r = i * stride;
            out.push({ body: a[r] | 0,
                       point: [a[r + 1], a[r + 2], a[r + 3]],
                       normal: [a[r + 4], a[r + 5], a[r + 6]],
                       totalImpulse: a[r + 7],      // solve + relax passes summed -- NOT a momentum budget
                       lastImpulse: a[r + 8],       // final substep only
                       pointIndex: a[r + 9] | 0 });
        }
        this._m._free(p);
        return out;
    }
    supportsJoints() { return typeof this._m._swk_joint_spherical === "function"; }

    // v2509 -- supportsRecording(): the fallback world answers this too, so a PAGE can ask instead of sniffing at
    // typeof. Here it is a real question -- a box3d.wasm built before v2508 has no recording exports.
    supportsRecording() { return typeof this._m._swk_record_start === "function" && typeof this._m._swk_player_create === "function"; }

    // ---- recording -------------------------------------------------------------------------------------------
    //
    // Box3D records world mutations and embeds ITS OWN state hashes as it goes. b3ValidateReplay then stands up a
    // fresh world from the seed snapshot, replays every op, and checks each embedded hash. So:
    //
    //   machine A:  startRecording() -> run the scenario -> stopRecording() -> write the bytes to a file
    //   machine B:  read the file -> validateReplay(bytes) -> true means B reproduced A's hashes exactly
    //
    // Better than comparing two numbers by hand in three ways: it is BOX3D's definition of state rather than mine,
    // it exercises snapshot restore as well as stepping, and the artifact is a FILE -- so a stranger can download
    // it from a release and check the claim instead of believing it.
    startRecording(capacity = 0) {
        if (!this._m._swk_record_start(capacity)) throw new Error("box3d: could not create a recording buffer");
        return true;
    }

    // Returns a Uint8Array COPY. stop() must run first: it writes the trailing geometry registry and backpatches
    // the header, so bytes read before it are a truncated file that validates as garbage.
    stopRecording() {
        this._m._swk_record_stop();
        const n = this._m._swk_record_size();
        if (n <= 0) { this._m._swk_record_free(); return new Uint8Array(0); }
        const ptr = this._m._malloc(n);
        try {
            const got = this._m._swk_record_copy(ptr, n);
            if (got !== n) throw new Error("box3d: recording copy returned " + got + " of " + n + " bytes");
            // slice(), not subarray(): HEAPU8 can be detached by memory growth, and a view into it would rot.
            return new Uint8Array(this._m.HEAPU8.buffer, ptr, n).slice();
        } finally {
            this._m._free(ptr);
            this._m._swk_record_free();
        }
    }

    // THE VERDICT, from box3d itself. True = this build reproduced every state hash embedded in the recording.
    validateReplay(bytes) {
        if (!(bytes instanceof Uint8Array) || bytes.length === 0) throw new Error("box3d: validateReplay needs a non-empty Uint8Array");
        const ptr = this._m._malloc(bytes.length);
        try {
            this._m.HEAPU8.set(bytes, ptr);
            return this._m._swk_validate_replay(ptr, bytes.length) === 1;
        } finally { this._m._free(ptr); }
    }

    destroy() {
        try { this._m._swk_world_destroy(); } catch {}
        if (this._xfPtr) { try { this._m._free(this._xfPtr); } catch {} this._xfPtr = 0; this._xfCap = 0; }
        if (this._vPtr) { try { this._m._free(this._vPtr); } catch {} this._vPtr = 0; this._vCap = 0; }
    }
}

export class Box3DLoader {
    constructor() { this._mod = null; this._status = null; }

    async init() {
        if (this._status) return this._status;
        try {
            const factory = (await import(/* @vite-ignore */ "/vendor/box3d/box3d.js")).default;
            this._mod = await factory({
                locateFile: (f) => "/vendor/box3d/" + f,   // finds box3d.wasm beside the js
            });
            this._status = { ready: true };
            console.log("[box3d] WASM module loaded — rigid-body physics available");
        } catch (e) {
            // v4229 -- WAS: this said "Box3D WASM not built yet -- run build-box3d-wasm-clang.sh..." for EVERY
            // failure. Measured in a headless Chromium with WebAssembly deleted, the build was present and this
            // same loader had returned ready:true from it seconds earlier, and it still sent the reader off to
            // install clang and wasi-libc. Two independent facts -- "wasm works here" and "this build loaded" --
            // now get reported on their own evidence, which is browserSkipReason()'s rule from
            // tools/ship/playwrightResolve.mjs applied to the third instance of the same defect.
            this._status = {
                ready: false,
                reason: explainWasmFailure(e,
                    "Box3D WASM not built yet — run physics/box3d/build-box3d-wasm-clang.sh on a " +
                    "box with clang + wasi-libc, which outputs /vendor/box3d/box3d.{js,wasm}."),
            };
        }
        return this._status;
    }

    status() { return this._status || { ready: false, reason: "init() not called" }; }

    // v3630: the raw wasm module, so a PAGE can drive the same arithmetic Node drives (physics/mechanics/
    // reposeOps.mjs takes it as a parameter). Returns null before init() rather than throwing.
    mod() { return this._mod || null; }

    // v1989 — the "use Box3D for physics" switch (set from the Services Dashboard).
    // Sims should consult box3d.enabled() && (await box3d.init()).ready before
    // preferring a WASM world over the JS PhysicsSystem.
    enabled() { try { return localStorage.getItem("voxelengine.box3dEnabled") === "1"; } catch { return false; } }
    setEnabled(on) { try { on ? localStorage.setItem("voxelengine.box3dEnabled", "1") : localStorage.removeItem("voxelengine.box3dEnabled"); } catch {} }

    createWorld({ gravity = [0, -9.8, 0] } = {}) {
        if (!this._mod) throw new Error("box3d: call init() first (and check .ready)");
        this._mod._swk_world_create(gravity[0], gravity[1], gravity[2]);
        return new Box3DWorldHandle(this._mod);
    }

    // Determinism proof: identical scripted scene, 600 ticks, print the hash.
    // Run on two different machines/OSes — Box3D's cross-platform determinism
    // means the hashes MUST match. If they do, input-only lockstep is safe.
    async selfTest() {
        const st = await this.init();
        if (!st.ready) { console.warn("[box3d] selfTest: " + st.reason); return null; }
        const w = this.createWorld({ gravity: [0, -9.8, 0] });
        w.addBox({ type: "static", pos: [0, -0.5, 0], half: [20, 0.5, 20] });
        for (let i = 0; i < 40; i++) {
            w.addBox({ type: "dynamic", pos: [(i % 5) - 2, 2 + Math.floor(i / 5) * 1.2, ((i * 7) % 5) - 2], half: [0.4, 0.4, 0.4] });
        }
        for (let t = 0; t < 600; t++) w.step(1 / 60, 4);
        const hash = w.stateHash().toString(16).padStart(8, "0");
        w.destroy();
        console.log(`[box3d] selfTest hash after 600 ticks: ${hash} — compare across peers; equal = lockstep-safe`);
        return hash;
    }
}

export const box3d = new Box3DLoader();
try { if (typeof window !== "undefined" && !window.box3d) window.box3d = box3d; } catch {}

// =============================================================================
// v2508 -- ported from the standalone box3d-js-deterministic repo.
//
// REQUIRES A WASM REBUILD (physics/box3d/build-box3d-wasm-clang.sh, on a box with emsdk). The functions below are new
// exports; an older box3d.js simply will not have them. supportsReplay() below asks BEFORE anything calls them,
// because "_swk_player_create is not a function" is a worse error message than "rebuild the WASM".
// =============================================================================

// Does the loaded WASM actually have the replay API? An engine that shipped before v2508 will not, and a page that
// assumes it does dies with a TypeError that says nothing useful.
export function supportsReplay(mod) {
    return !!(mod && typeof mod._swk_player_create === "function" && typeof mod._swk_record_start === "function");
}

// A replay player over a recording. Where validateReplay() answers yes-or-no over a whole file, this answers frame
// by frame -- and answers three things the verdict cannot:
//
//   * WHICH FRAME broke?  divergeFrame() -- box3d finds it itself, exactly. We were bracketing this by hand with
//     checkpoints every 150 ticks, which is 150x vaguer than the library already was.
//   * Does the THREAD COUNT change the answer?  setWorkerCount() -- replaying at a count other than recorded
//     re-partitions the constraint graph, so the same hashes must survive a different ORDER of arithmetic. That is
//     Box3D's headline determinism claim, and it is testable. (b3ValidateReplay's own docs say "pass 1 for now",
//     which is why I first said this could not be done. The player's docs say the opposite, eight lines later.)
//   * What did it LOOK like?  transforms() + seek() -- a real world to render and scrub, with O(interval) backward
//     seek off a keyframe ring.
export class Box3DPlayer {
    constructor(mod) { this._m = mod; this._xfPtr = 0; this._xfCap = 0; }

    // The player owns a private copy of the bytes, so the caller's buffer is free the moment this returns.
    open(bytes, workerCount = 1) {
        if (!(bytes instanceof Uint8Array) || bytes.length === 0) throw new Error("box3d: open() needs a non-empty Uint8Array");
        const ptr = this._m._malloc(bytes.length);
        try {
            this._m.HEAPU8.set(bytes, ptr);
            if (this._m._swk_player_create(ptr, bytes.length, workerCount) !== 1) {
                throw new Error("box3d: could not open the recording (bad header, or written by a different build)");
            }
        } finally { this._m._free(ptr); }
        return this.info();
    }

    info() {
        const p = this._m._malloc(3 * 4);
        try {
            if (this._m._swk_player_info(p) !== 1) return null;
            const v = new Int32Array(this._m.HEAP32.buffer, p, 3);
            return { frameCount: v[0], workerCount: v[1], subStepCount: v[2], timeStep: this._m._swk_player_timestep() };
        } finally { this._m._free(p); }
    }

    step() { return this._m._swk_player_step() === 1; }   // false at end-of-recording
    restart() { this._m._swk_player_restart(); }
    seek(frame) { this._m._swk_player_seek(frame | 0); }
    frame() { return this._m._swk_player_frame(); }
    frameCount() { return this._m._swk_player_frame_count(); }
    atEnd() { return this._m._swk_player_at_end() === 1; }

    // diverged() is the verdict. divergeFrame() is the bug report: -1 means it never disagreed.
    diverged() { return this._m._swk_player_diverged() === 1; }
    divergeFrame() { return this._m._swk_player_diverge_frame(); }

    // THE CROSS-THREAD TEST. Applied at once, and reused whenever the player rebuilds its world on restart or a
    // backward seek.
    setWorkerCount(n) { this._m._swk_player_set_workers(n | 0); }

    bodyCount() { return this._m._swk_player_body_count(); }

    // [x,y,z, qx,qy,qz,qw] per body, in CREATION order. Destroyed bodies write zeros and w=1 rather than shifting
    // the ones after them, so an ordinal means the same body on every frame -- which is what a renderer needs to
    // keep a mesh attached across a seek. Valid until the next call.
    transforms() {
        const n = this.bodyCount();
        if (!n) return new Float32Array(0);
        const bytes = n * 7 * 4;
        if (bytes > this._xfCap) {
            if (this._xfPtr) this._m._free(this._xfPtr);
            this._xfPtr = this._m._malloc(bytes);
            this._xfCap = bytes;
        }
        this._m._swk_player_transforms(this._xfPtr);
        return new Float32Array(this._m.HEAPF32.buffer, this._xfPtr, n * 7);
    }

    destroy() {
        try { this._m._swk_player_destroy(); } catch {}
        if (this._xfPtr) { try { this._m._free(this._xfPtr); } catch {} this._xfPtr = 0; this._xfCap = 0; }
    }
}
