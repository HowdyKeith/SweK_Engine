// box3d_shim.c — v2284: thin flat-C API over Box3D v0.1.0 for the SweK WASM loader.
// Keeps the JS<->WASM surface tiny: ids in, floats out. Built by build-box3d-wasm.sh; bound by box3dLoader.js.
//
// Corrected against the real erincatto/box3d @ v0.1.0 headers (the v1989 shim guessed the API):
//   - b3BodyDef.position is b3Pos (double x,y,z), not b3Vec3
//   - b3MakeBoxHull returns b3BoxHull (which embeds a b3HullData `base`); b3CreateHullShape takes &hull.base
//   - b3Body_GetTransform returns b3WorldTransform { b3Pos p; b3Quat q; }, and b3Quat is { b3Vec3 v; float s; }
//     so the quaternion components are q.v.x / q.v.y / q.v.z / q.s (there is no q.x or q.w)
//
// If a tag bump renames types or def fields, this file is the only thing to touch.

#include "box3d/box3d.h"
#include <stdint.h>
#include <stdbool.h>

#define MAX_BODIES 4096
static b3WorldId g_world;
static b3BodyId g_bodies[MAX_BODIES];
static int g_bodyCount = 0;

// v3568 -- MOVED UP from the joints section. swk_world_create and swk_world_destroy both reset it now, and a
// global cannot be reset above its own declaration. The joint API itself is unchanged and still lives below.
#define MAX_JOINTS 512
static b3JointId g_joints[MAX_JOINTS];
static int g_jointCount = 0;

int swk_world_create(float gx, float gy, float gz) {
    b3WorldDef def = b3DefaultWorldDef();
    def.gravity = (b3Vec3){ gx, gy, gz };
    g_world = b3CreateWorld(&def);
    g_bodyCount = 0;
    g_jointCount = 0;   // v3568 -- see below
    return 1;
}

void swk_world_step(float dt, int substeps) {
    b3World_Step(g_world, dt, substeps);
}

// v3568 -- g_jointCount IS RESET HERE AND IN swk_world_create, AND IT WAS NOT BEFORE. g_bodyCount has always been
// reset in both; the joint table was added at v2515 and never joined them. A caller that creates and destroys
// several worlds in one process -- which is exactly what a gate does, and rigidKeys.mjs creates eight -- kept
// climbing toward MAX_JOINTS (512) while g_joints held b3JointId handles belonging to worlds that no longer
// exist. Returned joint indices climbing 0, 1, 2 across three fresh worlds is how it was seen.
//
// Nothing shipped had hit it, because the browser path builds one world and keeps it. That is the whole reason it
// survived fifty versions: the leak is invisible to the only caller that existed.
void swk_world_destroy(void) {
    b3DestroyWorld(g_world);
    g_bodyCount = 0;
    g_jointCount = 0;
}

// Create a box body. type: 0 static, 1 dynamic, 2 kinematic. Returns body index or -1.
int swk_body_box(int type, float x, float y, float z,
                 float hx, float hy, float hz, float density) {
    if (g_bodyCount >= MAX_BODIES) return -1;
    b3BodyDef bd = b3DefaultBodyDef();
    // v2468 -- SET, not inherited. The backend adjudicator measured box3d's default at 0.00/s and Jolt's at 0.05/s on
    // real hardware: two identical worlds drifted 0.973 m apart in 2.5 seconds, and cross-peer lockstep runs on
    // either backend. Neither library was wrong; the ENGINE had never chosen. It has now: see physics/damping.js.
    // (Ships stay drag-free below -- that IS a deliberate choice, and Jolt's addShip now matches it.)
    bd.linearDamping = 0.05f;
    bd.angularDamping = 0.05f;
    bd.type = (type == 2) ? b3_kinematicBody : (type == 1) ? b3_dynamicBody : b3_staticBody;
    bd.position = (b3Pos){ x, y, z };
    b3BodyId body = b3CreateBody(g_world, &bd);
    b3ShapeDef sd = b3DefaultShapeDef();
    sd.density = density;
    b3BoxHull hull = b3MakeBoxHull(hx, hy, hz);
    b3CreateHullShape(body, &sd, &hull.base);
    g_bodies[g_bodyCount] = body;
    return g_bodyCount++;
}

int swk_body_count(void) { return g_bodyCount; }

// =============================================================================
// v3568 -- SURFACE PROPERTIES. Two setters, and the reason they are worth the two functions is that WITHOUT THEM
// TWO OF THE BEST RIGID-BODY KEYS IN THE LAB CANNOT BE RUN AT ALL:
//
//   FRICTION CONE   a box on a ramp slides iff tan(theta) > mu. An EXACT threshold, and it can be found by
//                   bisecting on a BINARY outcome -- slid, or did not -- then graded against atan(mu), which the
//                   search never consults. The same shape as navigate.js steering on one bit.
//   BOUNCE RATIO    successive bounce heights are geometric, h_n = e^(2n) h_0, so the RATIO is constant and
//                   independent of drop height. And e = 0 is an EXACT ZERO: the body must not leave the ground at
//                   all, which is a stronger falsifier than any tolerance.
//
// Both are per-SHAPE in box3d, not per-body, so these walk the body's shapes. A body created here has exactly one
// shape, but walking is correct for any body and costs nothing.
//
// STRUCT FIELD NAMES ARE READ FROM box3d's OWN API, not guessed -- b3Shape_SetFriction / b3Shape_SetRestitution
// are the Box2D v3 lineage spellings this shim already follows for b3Shape_*. The header note at the contacts
// block applies here too: box3d's headers are not vendored, so if the rig build fails, these two lines are where
// to look and nothing else needs to change.
//
// *** THESE WILL NOT EXIST IN vendor/box3d/box3d.wasm UNTIL IT IS REBUILT. *** That artifact is v2560 and is
// already three functions behind this file (the v3037 contacts block). physics/box3d/box3dNode.mjs turns that gap
// into an integer set difference, and physics/mechanics/rigidKeys.mjs SKIPS these two keys rather than failing.
// Rebuild with build-box3d-wasm-clang.sh on a box with clang + wasi-libc.
// =============================================================================

#define SWK_MAX_SHAPES_PER_BODY 8

// Coulomb friction coefficient mu. Clamped at zero because a negative mu is not a surface, it is a typo.
void swk_body_set_friction(int idx, float mu) {
    if (idx < 0 || idx >= g_bodyCount) return;
    if (mu < 0.0f) mu = 0.0f;
    b3ShapeId shapes[SWK_MAX_SHAPES_PER_BODY];
    int n = b3Body_GetShapes(g_bodies[idx], shapes, SWK_MAX_SHAPES_PER_BODY);
    for (int i = 0; i < n; i++) b3Shape_SetFriction(shapes[i], mu);
}

// Coefficient of restitution e, clamped to [0,1]. e > 1 would ADD energy on every bounce, and a solver that
// accepted it would make the geometric-ratio key meaningless in the one direction it cannot recover from.
void swk_body_set_restitution(int idx, float e) {
    if (idx < 0 || idx >= g_bodyCount) return;
    if (e < 0.0f) e = 0.0f;
    if (e > 1.0f) e = 1.0f;
    b3ShapeId shapes[SWK_MAX_SHAPES_PER_BODY];
    int n = b3Body_GetShapes(g_bodies[idx], shapes, SWK_MAX_SHAPES_PER_BODY);
    for (int i = 0; i < n; i++) b3Shape_SetRestitution(shapes[i], e);
}

// =============================================================================
// v4256 -- COLLISION FILTERING, AND THE CLAIM IT CORRECTS.
//
// v4249 measured a derived ragdoll self-colliding at 148x the impulse of its neighbours, said the correct fix
// was "disabling collision between jointed neighbours", and recorded that this could not be requested through
// this shim. *** BOTH HALVES WERE WRONG, AND THE HEADER SAYS SO. ***
//
// b3JointDef.collideConnected is a plain bool on the shared base def, and b3DefaultJointDef() is `{ 0 }` and
// never sets it -- so it is ALREADY false, and box3d has never collided jointed neighbours. Measured natively
// against box3d v0.1.0: two overlapping dynamic boxes report 8 contacts unjointed and 0 once a spherical joint
// is added. Nothing had to be requested; the behaviour v4249 asked for was the default all along.
//
// Which relocates the defect rather than removing it: the self-collision v4249 saw was between parts that are
// NOT jointed to each other -- a forearm against a thigh, a hand against a torso two joints away. box3d's own
// header names that case and prescribes the fix:
//
//     "you may want ragdolls to collide with other ragdolls but you don't want ragdoll self-collision. In
//      this case you would give each ragdoll a unique negative group index and apply that group index to all
//      shapes on the ragdoll."
//
// So the missing capability is the FILTER, not the joint flag. b3Filter carries categoryBits, maskBits and a
// groupIndex whose sign wins over the mask entirely: negative means never collide within the group, positive
// means always. One call per body, and a ragdoll stops fighting itself while still colliding with the world.

// Set a body's collision filter on every shape it owns. A negative `group` shared across a ragdoll's bodies
// disables self-collision among them without touching how they collide with anything else.
//
// The mask is applied to all shapes because a body with two shapes filtered differently is a body that is
// half-solid, which is never what a caller asking for "this ragdoll" means.
void swk_body_set_filter(int idx, double category, double mask, int group) {
    if (idx < 0 || idx >= g_bodyCount) return;
    b3ShapeId shapes[SWK_MAX_SHAPES_PER_BODY];
    int n = b3Body_GetShapes(g_bodies[idx], shapes, SWK_MAX_SHAPES_PER_BODY);
    for (int i = 0; i < n; i++) {
        b3Filter f = b3Shape_GetFilter(shapes[i]);
        // categoryBits/maskBits are uint64_t. They arrive as double because that is the only numeric type a
        // WASM boundary carries losslessly up to 2^53 -- a JS number IS a double, and taking these as int32
        // would silently truncate any category above bit 31. Above 2^53 a caller must use `group` instead,
        // which is stated here rather than discovered.
        if (category >= 0.0) f.categoryBits = (uint64_t)category;
        if (mask >= 0.0) f.maskBits = (uint64_t)mask;
        f.groupIndex = group;
        b3Shape_SetFilter(shapes[i], f, true);   // invokeContacts: re-evaluate pairs already touching
    }
}

// Read a body's filter back, so a caller can assert what it set rather than trust it. Returns 0 on success.
//
// *** THE READBACK SATURATES AT THE TOP OF THE RANGE, AND THIS IS MEASURED, NOT FEARED. *** box3d's default
// is B3_DEFAULT_CATEGORY_BITS / B3_DEFAULT_MASK_BITS = UINT64_MAX, and (double)UINT64_MAX rounds to 2^64
// exactly: this getter reports 18446744073709551616 for a value that is 18446744073709551615. So a category
// or mask is faithful below 2^53 and APPROXIMATE above it, and the default is above it. A caller comparing a
// read-back default for equality against UINT64_MAX will find they differ by one and be right to.
int swk_body_get_filter(int idx, double* outCategory, double* outMask, int* outGroup) {
    if (idx < 0 || idx >= g_bodyCount) return -1;
    b3ShapeId shapes[SWK_MAX_SHAPES_PER_BODY];
    int n = b3Body_GetShapes(g_bodies[idx], shapes, SWK_MAX_SHAPES_PER_BODY);
    if (n <= 0) return -1;
    b3Filter f = b3Shape_GetFilter(shapes[0]);
    if (outCategory) *outCategory = (double)f.categoryBits;
    if (outMask) *outMask = (double)f.maskBits;
    if (outGroup) *outGroup = f.groupIndex;
    return 0;
}

// Whether a joint lets the two bodies it connects collide. Exposed for completeness and for the gate, NOT
// because a ragdoll needs it: box3d already defaults this to false, which is the correction above.
void swk_joint_set_collide_connected(int idx, int shouldCollide) {
    if (idx < 0 || idx >= g_jointCount) return;
    b3Joint_SetCollideConnected(g_joints[idx], shouldCollide ? true : false);
}

int swk_joint_get_collide_connected(int idx) {
    if (idx < 0 || idx >= g_jointCount) return -1;
    return b3Joint_GetCollideConnected(g_joints[idx]) ? 1 : 0;
}

// v2263: an ES ship body -- planar (free to translate in X/Z, locked in Y), NON-rotating in box3d (heading is
// owned by the flight model), zero damping so velocity persists like ES's drag-free space flight. box3d gives
// it exactly two things ES lacks: collision response and staying in the plane. Returns index or -1.
int swk_body_ship(float x, float z, float half, float density) {
    if (g_bodyCount >= MAX_BODIES) return -1;
    b3BodyDef bd = b3DefaultBodyDef();
    bd.type = b3_dynamicBody;
    bd.position = (b3Pos){ x, 0.0, z };
    bd.linearDamping = 0.0f;
    bd.angularDamping = 0.0f;
    bd.motionLocks = (b3MotionLocks){ false, true, false, true, true, true };  // free X/Z; lock Y + all rotation
    b3BodyId body = b3CreateBody(g_world, &bd);
    b3ShapeDef sd = b3DefaultShapeDef();
    sd.density = density;
    b3BoxHull hull = b3MakeBoxHull(half, half, half);
    b3CreateHullShape(body, &sd, &hull.base);
    g_bodies[g_bodyCount] = body;
    return g_bodyCount++;
}

// v2263: linear velocities [vx,vy,vz] * bodyCount -- the ES adapter reads collision-adjusted velocity back
// each tick (a ship that got rammed comes back with a changed velocity, which is the whole point).
void swk_velocities(float* out) {
    for (int i = 0; i < g_bodyCount; i++) {
        b3Vec3 v = b3Body_GetLinearVelocity(g_bodies[i]);
        out[i * 3 + 0] = v.x; out[i * 3 + 1] = v.y; out[i * 3 + 2] = v.z;
    }
}

// --- interaction primitives (what let the kaiju CAUSE the physics instead of just watching it fall) ---
static inline int _valid(int idx) { return idx >= 0 && idx < g_bodyCount; }

// Kick: a linear impulse at the center of mass (wakes the body). The kaiju's swat / a blast wave.
void swk_body_impulse(int idx, float ix, float iy, float iz) {
    if (!_valid(idx)) return;
    b3Body_ApplyLinearImpulseToCenter(g_bodies[idx], (b3Vec3){ ix, iy, iz }, true);
}

// Spin: an angular impulse -> a thrown car/tree that tumbles with real angular momentum.
void swk_body_ang_impulse(int idx, float ix, float iy, float iz) {
    if (!_valid(idx)) return;
    b3Body_ApplyAngularImpulse(g_bodies[idx], (b3Vec3){ ix, iy, iz }, true);
}

// Launch at a chosen speed outright (an object leaving the kaiju's hand).
void swk_body_set_velocity(int idx, float vx, float vy, float vz) {
    if (!_valid(idx)) return;
    b3Body_SetLinearVelocity(g_bodies[idx], (b3Vec3){ vx, vy, vz });
}

// Drive a body's transform -- for a KINEMATIC kaiju collider the AI moves each frame, which then shoves
// whatever dynamic bodies (buildings, debris) it sweeps through. Quat is { {x,y,z}, w }.
void swk_body_set_transform(int idx, float x, float y, float z, float qx, float qy, float qz, float qw) {
    if (!_valid(idx)) return;
    b3Body_SetTransform(g_bodies[idx], (b3Pos){ x, y, z }, (b3Quat){ { qx, qy, qz }, qw });
}

// Change type at runtime: 0 static, 1 dynamic, 2 kinematic. Lets a static wall become dynamic debris the
// instant the kaiju reaches it (recompute mass from shapes when it wakes to dynamic).
void swk_body_set_type(int idx, int type) {
    if (!_valid(idx)) return;
    b3BodyType t = (type == 2) ? b3_kinematicBody : (type == 1) ? b3_dynamicBody : b3_staticBody;
    b3Body_SetType(g_bodies[idx], t);
    if (t == b3_dynamicBody) b3Body_ApplyMassFromShapes(g_bodies[idx]);
}

// Write [x,y,z, qx,qy,qz,qw] * bodyCount into `out` (Float32, 7 per body). Position is double in box3d; we
// narrow to float for the JS Float32 view (the JS side reads 7 floats/body).
void swk_transforms(float* out) {
    for (int i = 0; i < g_bodyCount; i++) {
        b3WorldTransform t = b3Body_GetTransform(g_bodies[i]);
        out[i * 7 + 0] = (float)t.p.x; out[i * 7 + 1] = (float)t.p.y; out[i * 7 + 2] = (float)t.p.z;
        out[i * 7 + 3] = t.q.v.x; out[i * 7 + 4] = t.q.v.y; out[i * 7 + 5] = t.q.v.z;
        out[i * 7 + 6] = t.q.s;
    }
}

// FNV-1a over all body transforms -- Box3D is deterministic across platforms, so two peers stepping identical
// inputs must produce IDENTICAL hashes. This is the lockstep desync detector.
uint32_t swk_state_hash(void) {
    uint32_t h = 2166136261u;
    for (int i = 0; i < g_bodyCount; i++) {
        b3WorldTransform t = b3Body_GetTransform(g_bodies[i]);
        float f[7] = { (float)t.p.x, (float)t.p.y, (float)t.p.z, t.q.v.x, t.q.v.y, t.q.v.z, t.q.s };
        const uint8_t* b = (const uint8_t*)f;
        for (int k = 0; k < (int)sizeof f; k++) { h ^= b[k]; h *= 16777619u; }
    }
    return h;
}

// =============================================================================
// v2508 -- RECORDING + REPLAY, ported from the standalone box3d-js-deterministic repo where every call below was
// verified against the real erincatto/box3d v0.1.0 headers.
//
// WHY THE ENGINE WANTS THIS. box3dSyncCompare.js currently locates a cross-peer divergence by CHECKPOINT INDEX --
// "somewhere in these 150 ticks". b3RecPlayer_GetDivergeFrame names the exact frame. The library has always been
// 150x more precise than the tool we built on top of it.
//
// And b3RecPlayer_SetWorkerCount turns a replay into a CROSS-THREAD determinism test: replaying at a different
// worker count re-partitions the constraint graph, so the same arithmetic happens in a different order and every
// embedded state hash must still match.
//
// REQUIRES A WASM REBUILD. These are new exports; until physics/box3d/build-box3d-wasm.sh is re-run on a box with
// emsdk, box3dLoader.js will find them missing. The loader guards for that rather than throwing.
// =============================================================================

static b3Recording* g_rec = 0;

// ---- recording + replay -------------------------------------------------------------------------------------
//
// WHY THIS REPLACES A HAND-ROLLED HASH COMPARISON.
//
// Box3D records world mutations AND embeds its own state hashes as it goes, then b3ValidateReplay() stands up a
// fresh world from the seed snapshot, replays every op, and checks each embedded hash. That is a better test than
// anything a binding can build on top:
//
//   * it uses BOX3D'S definition of world state (b3HashWorldState -- FNV over every body's transform and velocity),
//     not one I invented and hoped covered the right fields;
//   * it replays into a FRESH world, so it exercises snapshot restore as well as stepping;
//   * the recording is a FILE. Machine A records, machine B validates. No human copies a number between windows,
//     and the artifact can hang off a GitHub release so a stranger can check the claim instead of believing it.
//
// b3HashWorldState is internal (src/recording.h, not include/), so a binding CANNOT call it directly -- which is
// precisely why the recording path is the supported way to ask this question.

int swk_record_start(int capacity) {
    if (g_rec) { b3DestroyRecording(g_rec); g_rec = 0; }
    g_rec = b3CreateRecording(capacity);          // 0 => default 64 KiB, grows on demand
    if (!g_rec) return 0;
    b3World_StartRecording(g_world, g_rec);
    return 1;
}

// Must be called before reading: StopRecording writes the trailing geometry registry and backpatches the header.
// Read the bytes before this and you get a truncated, headerless file that validates as garbage.
void swk_record_stop(void) {
    if (g_rec) b3World_StopRecording(g_world);
}

int swk_record_size(void) { return g_rec ? b3Recording_GetSize(g_rec) : 0; }

// Copy the recording into a caller-owned buffer. The internal pointer is only "valid until the buffer is modified
// or destroyed", so we copy rather than hand JS a view into memory that may move.
int swk_record_copy(uint8_t* dst, int max) {
    if (!g_rec) return 0;
    const uint8_t* src = b3Recording_GetData(g_rec);
    int n = b3Recording_GetSize(g_rec);
    if (!src || n <= 0 || n > max) return 0;
    for (int i = 0; i < n; i++) dst[i] = src[i];
    return n;
}

void swk_record_free(void) {
    if (g_rec) { b3DestroyRecording(g_rec); g_rec = 0; }
}

// THE VERDICT. Replays the recording in a fresh world and checks every embedded state hash.
// workerCount: the header says "reserved for future multithreaded replay; pass 1 for now" -- so the
// determinism-across-thread-counts claim is NOT testable through THIS function. It IS testable through
// b3RecPlayer_SetWorkerCount below, whose docs say the opposite eight lines further down the header. Reading one
// function's doc and generalising to the API is how I told Keith this could not be done. It can.
int swk_validate_replay(const uint8_t* data, int size) {
    return b3ValidateReplay((const void*)data, size, 1) ? 1 : 0;
}

// ---- the replay PLAYER --------------------------------------------------------------------------------------
//
// b3ValidateReplay gives a verdict: true or false over the whole recording. The player gives the same verdict
// FRAME BY FRAME, plus three things worth more than the verdict:
//
//   1. GetDivergeFrame -- box3d tells you WHICH FRAME first disagreed. We were doing this by hand with checkpoints
//      every 150 ticks, which locates a divergence to within 150 ticks. This locates it exactly.
//   2. SetWorkerCount -- "Replaying at a different count than recorded re-partitions the constraint graph, so the
//      StateHash check becomes a cross-thread determinism test." That is Box3D's headline claim, testable.
//   3. GetWorldId + SeekFrame -- a real world id you can render, with O(interval) backward seek off a keyframe
//      ring. That is a scrubber: drag a timeline through recorded physics and watch it.

static b3RecPlayer* g_player = 0;

// The player owns a private copy of the bytes, so JS may free its buffer immediately after this returns.
int swk_player_create(const uint8_t* data, int size, int workers) {
    if (g_player) { b3RecPlayer_Destroy(g_player); g_player = 0; }
    g_player = b3RecPlayer_Create((const void*)data, size, workers < 1 ? 1 : workers);
    return g_player ? 1 : 0;   // NULL on a bad header or a failed deserialize -- not a crash, a false
}

void swk_player_destroy(void) {
    if (g_player) { b3RecPlayer_Destroy(g_player); g_player = 0; }
}

int swk_player_step(void)        { return (g_player && b3RecPlayer_StepFrame(g_player)) ? 1 : 0; }  // false at end
void swk_player_restart(void)    { if (g_player) b3RecPlayer_Restart(g_player); }
void swk_player_seek(int frame)  { if (g_player) b3RecPlayer_SeekFrame(g_player, frame); }
int swk_player_frame(void)       { return g_player ? b3RecPlayer_GetFrame(g_player) : -1; }
int swk_player_frame_count(void) { return g_player ? b3RecPlayer_GetFrameCount(g_player) : 0; }
int swk_player_at_end(void)      { return (g_player && b3RecPlayer_IsAtEnd(g_player)) ? 1 : 0; }

// THE TWO THAT MATTER. diverged() is the verdict; diverge_frame() is the bug report.
int swk_player_diverged(void)      { return (g_player && b3RecPlayer_HasDiverged(g_player)) ? 1 : 0; }
int swk_player_diverge_frame(void) { return g_player ? b3RecPlayer_GetDivergeFrame(g_player) : -1; }  // -1 = never

// Change the thread count of the REPLAY world. Recorded at 1, replayed at 4: the constraint graph is partitioned
// differently, the arithmetic happens in a different order, and the embedded state hashes must STILL match. That is
// a real determinism test, not a tautology -- and it is the one thing a single-threaded replay cannot ask.
void swk_player_set_workers(int n) { if (g_player) b3RecPlayer_SetWorkerCount(g_player, n < 1 ? 1 : n); }

int swk_player_info(int* out) {   // [frameCount, workerCount, subStepCount] + timeStep via a float write
    if (!g_player || !out) return 0;
    b3RecPlayerInfo i = b3RecPlayer_GetInfo(g_player);
    out[0] = i.frameCount; out[1] = i.workerCount; out[2] = i.subStepCount;
    return 1;
}

float swk_player_timestep(void) {
    if (!g_player) return 0.0f;
    return b3RecPlayer_GetInfo(g_player).timeStep;
}

// The player's world has its OWN bodies -- not the g_bodies[] this shim tracks for a live world. Ordinals include
// holes for destroyed bodies, so a null id is expected and is not an error.
int swk_player_body_count(void) { return g_player ? b3RecPlayer_GetBodyCount(g_player) : 0; }

// [x,y,z, qx,qy,qz,qw] per body, in creation order. A destroyed body writes zeros and a w of 1 rather than
// shifting everything after it, so an ordinal means the same thing on every frame -- which is what a renderer
// needs to keep a mesh attached to a body across a seek.
int swk_player_transforms(float* out) {
    if (!g_player || !out) return 0;
    int n = b3RecPlayer_GetBodyCount(g_player);
    for (int i = 0; i < n; i++) {
        b3BodyId id = b3RecPlayer_GetBodyId(g_player, i);
        float* o = out + i * 7;
        if (B3_IS_NULL(id) || !b3Body_IsValid(id)) {
            o[0] = o[1] = o[2] = 0.0f; o[3] = o[4] = o[5] = 0.0f; o[6] = 1.0f;
            continue;
        }
        b3WorldTransform xf = b3Body_GetTransform(id);
        o[0] = (float)xf.p.x; o[1] = (float)xf.p.y; o[2] = (float)xf.p.z;
        o[3] = xf.q.v.x; o[4] = xf.q.v.y; o[5] = xf.q.v.z; o[6] = xf.q.s;
    }
    return n;
}

// =============================================================================
// v2515 -- JOINTS. box3d compiled all eight types from the start and this shim bound none of them, so the engine
// had rigid bodies and no way to attach one to another. A rig is a joint graph: shoulders and hips are spherical,
// elbows and knees are revolute, a spine segment is a weld. That is the whole mapping.
//
// WRITTEN AGAINST box3d's OWN samples/sample_character.cpp, not against a guess. The conventions that matter and
// are not obvious from the function signatures:
//
//   * THE JOINT AXIS IS THE FRAME'S Z. There is no axis field on a revolute def. You rotate the frame so its
//     z-axis points along the hinge -- b3ComputeQuatBetweenUnitVectors(b3Vec3_axisZ, myAxis) -- exactly as the
//     sample does. The spherical cone limit is likewise "centered on the frameA z-axis".
//   * ANCHORS ARE LOCAL, ONE PER BODY. A rig hands you a world-space bone position; each body needs that same
//     world point expressed in ITS own frame. b3Body_GetLocalPoint does the conversion, so we do not.
//   * b3Pos IS b3Vec3 in single precision. It is a distinct struct only under BOX3D_DOUBLE_PRECISION, which we do
//     not build.
//
// DETERMINISM: joints are solved inside box3d, so they inherit its determinism and cost lockstep nothing. What
// would cost lockstep everything is the thing that DRIVES them -- a joint MOTOR, whose target is set per tick by
// a caller and therefore has to travel with the input stream rather than be recomputed.
//
// v3568 -- THIS COMMENT USED TO SAY "see swk_joint_motor_set below" AND NO SUCH FUNCTION IS DEFINED IN THIS FILE,
// or anywhere. A reader following the pointer found nothing, which is worse than silence because it reads like a
// capability the shim has. There is no motor binding yet; when there is, this is where it goes.
//
// *** v4385 -- THERE IS ONE NOW, AND IT IS CALLED swk_joint_motor, IN THE JOINT STATE BLOCK AT THE END OF THIS
// FILE. *** v3568 left a promise rather than a pointer and this closes it. The name deliberately is NOT
// swk_joint_motor_set: box3dNode.mjs's documentedButMissing() still lists that string as a name the shim
// mentions and never defines, and inventing a function to satisfy a report would be shipping code to silence a
// measurement. The dangling name stays reported until this comment stops containing it.
// =============================================================================

// (the joint table is declared with the other globals at the top of the file -- v3568)

static int swk__push_joint(b3JointId id) {
    if (g_jointCount >= MAX_JOINTS) return -1;
    g_joints[g_jointCount] = id;
    return g_jointCount++;
}

// Both bodies must exist. An out-of-range index here is a silently wrong rig later, so it is a -1 now.
static int swk__valid_pair(int a, int b) {
    return a >= 0 && a < g_bodyCount && b >= 0 && b < g_bodyCount && a != b;
}

// A shoulder or a hip: rotates freely, optionally inside a cone. coneDeg <= 0 disables the limit.
// The cone opens along the frame's z-axis, so we point that at the bone direction.
int swk_joint_spherical(int a, int b, float wx, float wy, float wz,
                        float axx, float axy, float axz, float coneDeg) {
    if (!swk__valid_pair(a, b)) return -1;
    b3Vec3 world = { wx, wy, wz };
    b3Vec3 axis = b3Normalize((b3Vec3){ axx, axy, axz });
    b3Quat axisQuat = b3ComputeQuatBetweenUnitVectors(b3Vec3_axisZ, axis);

    b3SphericalJointDef def = b3DefaultSphericalJointDef();
    def.base.bodyIdA = g_bodies[a];
    def.base.bodyIdB = g_bodies[b];
    def.base.localFrameA.p = b3Body_GetLocalPoint(g_bodies[a], world);
    def.base.localFrameA.q = axisQuat;
    def.base.localFrameB.p = b3Body_GetLocalPoint(g_bodies[b], world);
    def.base.localFrameB.q = axisQuat;
    if (coneDeg > 0.0f) {
        def.enableConeLimit = true;
        def.coneAngle = B3_DEG_TO_RAD * coneDeg;
    }
    return swk__push_joint(b3CreateSphericalJoint(g_world, &def));
}

// An elbow or a knee: one axis, with a stop at each end. Pass lo >= hi to leave it unlimited.
int swk_joint_revolute(int a, int b, float wx, float wy, float wz,
                       float axx, float axy, float axz, float loDeg, float hiDeg) {
    if (!swk__valid_pair(a, b)) return -1;
    b3Vec3 world = { wx, wy, wz };
    b3Vec3 axis = b3Normalize((b3Vec3){ axx, axy, axz });
    b3Quat axisQuat = b3ComputeQuatBetweenUnitVectors(b3Vec3_axisZ, axis);

    b3RevoluteJointDef def = b3DefaultRevoluteJointDef();
    def.base.bodyIdA = g_bodies[a];
    def.base.bodyIdB = g_bodies[b];
    def.base.localFrameA.p = b3Body_GetLocalPoint(g_bodies[a], world);
    def.base.localFrameA.q = axisQuat;
    def.base.localFrameB.p = b3Body_GetLocalPoint(g_bodies[b], world);
    def.base.localFrameB.q = axisQuat;
    if (loDeg < hiDeg) {
        def.enableLimit = true;
        def.lowerAngle = B3_DEG_TO_RAD * loDeg;
        def.upperAngle = B3_DEG_TO_RAD * hiDeg;
    }
    return swk__push_joint(b3CreateRevoluteJoint(g_world, &def));
}

// A spine segment: rigid, but with give. hertz <= 0 means truly rigid.
int swk_joint_weld(int a, int b, float wx, float wy, float wz, float hertz, float damping) {
    if (!swk__valid_pair(a, b)) return -1;
    b3Vec3 world = { wx, wy, wz };
    b3WeldJointDef def = b3DefaultWeldJointDef();
    def.base.bodyIdA = g_bodies[a];
    def.base.bodyIdB = g_bodies[b];
    def.base.localFrameA.p = b3Body_GetLocalPoint(g_bodies[a], world);
    def.base.localFrameB.p = b3Body_GetLocalPoint(g_bodies[b], world);
    if (hertz > 0.0f) {
        def.linearHertz = hertz;
        def.angularHertz = hertz;
        def.linearDampingRatio = damping;
        def.angularDampingRatio = damping;
    }
    return swk__push_joint(b3CreateWeldJoint(g_world, &def));
}

int swk_joint_count(void) { return g_jointCount; }

// Destroying a joint leaves a hole rather than shifting the ones after it: an index must mean the same joint for
// the life of the world, or every handle the caller is holding silently points at a different bone.
void swk_joint_destroy(int i) {
    if (i < 0 || i >= g_jointCount) return;
    if (B3_IS_NULL(g_joints[i])) return;
    b3DestroyJoint(g_joints[i], true);
    g_joints[i] = b3_nullJointId;
}

// ============================================================================================================
// CONTACTS -- v3037, round 1 of 3 (exports -> gate -> overlay).
//
// *** v3580 -- ROUND 2 HAPPENED, AND THE CLOSURE THIS BLOCK WAS BUILT FOR DOES NOT EXIST. ***
// The stated key below -- sum the normal impulses acting on a body across a step and it must equal that body's
// momentum change -- IS FALSE FOR THE FIELD THIS BLOCK EXPORTS, and it is left standing above only so this
// correction has something to point at. Measured through one impact (physics/mechanics/contactImpulse.mjs):
// reported/needed is 1.742 at the impact step, then 14.4, 29.6, 27.3, 29.8 while settling, and exactly 2 only
// once the body is at rest. A NUMBER THAT WANDERS OVER AN ORDER OF MAGNITUDE IS NOT A BUDGET WITH A COEFFICIENT
// IN FRONT OF IT.
//
// THE REASON IS IN box3d's OWN solver.c, READ RATHER THAN INFERRED: every substep runs b3_stageSolve
// (useBias=true) AND b3_stageRelax (useBias=false), both calling b3SolveContacts_*, and contact_solver.c:458
// accumulates totalNormalImpulse in each. When the state is NOT changing the two passes compute the same impulse
// and the sum is exactly twice the physical one; when it IS changing they compute different ones and the sum
// means nothing in particular. THAT IS A PROPERTY OF A SOFT-STEP SOLVER AND NOT A DEFECT IN box3d.
//
// WHAT IS TRUE, AND IS GATED: the STATIC closure. A resting body's contact must cancel gravity exactly, and
// sum/2 = m g dt to four digits across dt 1/60 to 1/240 AND substeps 1 to 16. Plus the field relationship
// normalImpulse/totalNormalImpulse = 1/(2*substeps) exactly, which is the pre-v3569 guess's error measured.
//
// A STATED PURPOSE THAT CANNOT BE DELIVERED IS WORSE THAN NO PURPOSE: the next reader spends a round building
// it, which is exactly what happened. Round 3 (the overlay) is still unbuilt, and now knows what it can claim.
//
// WHY EXPORTS AND NOT b3DebugDraw. box3d ships a debug-draw callback path, and wiring it is strictly less work
// than this. It is also the wrong tool here: a callback stream hands you DRAW CALLS, and a draw call cannot be
// graded. What the replay page needs is not a picture of a contact, it is the NUMBERS -- point, normal, normal
// impulse -- because those close against something. Sum the normal impulses acting on a body across a step and
// it must equal that body's momentum change, and swk_velocities already exports the velocities to difference.
// That is a derived answer key from data the shim already publishes, the same shape as the wind tunnel's
// "force on all solids == applied body force" key that caught a real force-formula bug.
//
// So: a picture you look at, versus a quantity that can fail. Take the more expensive one.
//
// WHY GetContactData AND NOT GetContactEvents. box3d's docs recommend b3World_GetContactEvents as the efficient
// path, and for gameplay it is. But events answer "did these two shapes BEGIN touching" -- they carry shape ids,
// not manifolds. They cannot answer "with what impulse, at what point, along which normal", so they cannot close
// against momentum. The efficient call is the one that does not measure the thing.
//
// *** SURFACE VERIFIED AGAINST THE REAL HEADERS AT v3569, AND TWO OF THE FIVE GUESSES WERE WRONG -- WHICH IS WHY
// THIS BLOCK HAD NEVER COMPILED AND WHY vendor/box3d/box3d.wasm HAD BEEN STALE SINCE v3037. ***
//
// The note that used to sit here said the field names "follow the Box2D v3 lineage ... and are my best reading,
// not a checked fact", and predicted that if the rig build failed, ONE header read would fix all of it in one
// place. BOTH HALVES WERE RIGHT. The build fails with FIVE ERRORS FROM THREE MACROS, and the fix is confined to
// exactly the accessors below. The prediction is the reason this cost one read instead of one round.
//
// WHAT WAS WRONG, read from box3d v0.1.0 include/box3d/types.h:
//
//   (cd).manifold      -> b3ContactData has NO SUCH FIELD. It carries `const struct b3Manifold* manifolds` AND
//                         `int manifoldCount` -- A POINTER TO AN ARRAY, not one embedded struct, because "for
//                         mesh and height-field collision there can be multiple manifolds". So the walk needs an
//                         EXTRA LOOP, and a single-manifold reading would have silently dropped every manifold
//                         after the first on exactly the geometry that produces more than one.
//   (mp).point         -> b3ManifoldPoint has NO SUCH FIELD. It carries anchorA and anchorB, each documented as
//                         "location of the contact point relative to the bodyX CENTER OF MASS in world space" --
//                         AN OFFSET, NOT AN ABSOLUTE POINT. Emitting the anchor as a world point would have put
//                         every contact near the origin and looked plausible on a body that happens to sit there.
//   (mp).normalImpulse -> the field EXISTS, and it is the wrong one for this block's stated purpose. Its own doc
//                         says "Since Box3D uses sub-stepping, this is result from the FINAL SUB-STEP". The key
//                         this block was built for is a MOMENTUM CLOSURE over a whole step, and the header two
//                         paragraphs up says so. `totalNormalImpulse` is documented as "the TOTAL normal impulse
//                         applied during sub-stepping" and is the one that closes. *** THE GUESS THAT COMPILED
//                         WAS THE DANGEROUS ONE: it would have under-reported the momentum budget by roughly the
//                         substep count and the closure would have failed for a reason having nothing to do with
//                         the physics. *** Both are exported now, so the gate can show the wrong one failing.
//
// The accessors stay isolated exactly as before, because the reasoning that put them here was correct.
#define SWK_CD_SHAPE_A(cd)    ((cd).shapeIdA)
#define SWK_CD_SHAPE_B(cd)    ((cd).shapeIdB)
#define SWK_CD_MANIFOLDS(cd)  ((cd).manifolds)        /* POINTER to manifoldCount manifolds, not one struct */
#define SWK_CD_MANIFOLD_N(cd) ((cd).manifoldCount)
#define SWK_MP_ANCHOR_A(mp)   ((mp).anchorA)          /* OFFSET from bodyA's centre of mass, in world axes */
#define SWK_MP_IMPULSE(mp)    ((mp).totalNormalImpulse)  /* whole step; (mp).normalImpulse is the last substep */
#define SWK_MP_LAST_IMPULSE(mp) ((mp).normalImpulse)

#define SWK_MAX_CONTACTS 256
#define SWK_CONTACT_STRIDE 10     /* bodyIdx, px,py,pz, nx,ny,nz, totalNormalImpulse, lastSubstepImpulse */

// Walk every body's contact data once and count the MANIFOLD POINTS, not the manifolds. A box resting flat on
// the ground is ONE manifold with FOUR points, and it is the points that carry impulse -- counting manifolds
// would under-report the momentum budget by a factor of four and the closure check would fail for a reason that
// has nothing to do with the physics.
//
// v3569 -- AND THE MANIFOLD LOOP IS A THIRD LEVEL, NOT A SECOND. b3ContactData carries an ARRAY of manifolds, so
// a contact walks bodies -> contacts -> MANIFOLDS -> points. The original had three levels and needed four.
int swk_contact_count(void) {
    b3ContactData cds[SWK_MAX_CONTACTS];
    int total = 0;
    for (int i = 0; i < g_bodyCount; i++) {
        int n = b3Body_GetContactData(g_bodies[i], cds, SWK_MAX_CONTACTS);
        for (int c = 0; c < n; c++) {
            const b3Manifold* ms = SWK_CD_MANIFOLDS(cds[c]);
            int mn = SWK_CD_MANIFOLD_N(cds[c]);
            for (int k = 0; k < mn; k++) total += ms[k].pointCount;
        }
    }
    return total;
}

// Packed rows, same idiom as swk_transforms / swk_velocities: the caller sizes the buffer from
// swk_contact_count() * SWK_CONTACT_STRIDE and reads it as a flat Float32Array.
//
// NOTE ON DOUBLE COUNTING, AND IT IS DELIBERATE. A contact between bodies A and B is reported by BOTH, so each
// physical contact appears twice with opposite normals. That is not a bug to filter here -- it is Newton's third
// law made checkable, and the gate asserts it (every row must have a partner whose normal is its negation and
// whose impulse matches). Deduplicating in C would destroy the evidence the check is built on.
void swk_contacts(float* out) {
    b3ContactData cds[SWK_MAX_CONTACTS];
    int row = 0;
    for (int i = 0; i < g_bodyCount; i++) {
        int n = b3Body_GetContactData(g_bodies[i], cds, SWK_MAX_CONTACTS);
        for (int c = 0; c < n; c++) {
            const b3Manifold* ms = SWK_CD_MANIFOLDS(cds[c]);
            int mn = SWK_CD_MANIFOLD_N(cds[c]);
            // anchorA is an OFFSET FROM bodyA's CENTRE OF MASS, so the absolute point needs that centre. The
            // owning body comes from the contact's own shapeIdA rather than from the loop index i, because the
            // loop index is whichever body we ASKED and A is whichever body box3d ordered first.
            b3BodyId bodyA = b3Shape_GetBody(SWK_CD_SHAPE_A(cds[c]));
            b3Pos comA = b3Body_GetWorldCenterOfMass(bodyA);
            for (int k = 0; k < mn; k++) {
                const b3Manifold* m = &ms[k];
                for (int p = 0; p < m->pointCount; p++) {
                    b3Vec3 a = SWK_MP_ANCHOR_A(m->points[p]);
                    float* r = out + row * SWK_CONTACT_STRIDE;
                    r[0] = (float)i;
                    r[1] = (float)comA.x + a.x;
                    r[2] = (float)comA.y + a.y;
                    r[3] = (float)comA.z + a.z;
                    r[4] = m->normal.x; r[5] = m->normal.y; r[6] = m->normal.z;
                    r[7] = SWK_MP_IMPULSE(m->points[p]);        // whole step -- the one a closure needs
                    r[8] = SWK_MP_LAST_IMPULSE(m->points[p]);   // final substep -- the guess that compiled
                    r[9] = (float)p;
                    row++;
                }
            }
        }
    }
}

// The stride, published rather than duplicated on the JS side. Two declarations of a packed layout is the
// eight-defect law waiting to happen; the reader asks the shim what the row width is.
int swk_contact_stride(void) { return SWK_CONTACT_STRIDE; }

// =============================================================================================================
// v4382 -- *** A RAY, AND UNTIL NOW NOTHING IN THIS TREE COULD ASK THE PHYSICS WORLD WHAT ONE HITS. ***
//
// The shim has carried bodies, filters, three joint types, impulses, transforms, contacts and a deterministic
// record/replay with divergence detection for hundreds of rounds. It has never carried a cast. box3d has had
// b3World_CastRayClosest the whole time.
//
// The cost of that gap is not hypothetical and it is not one module: mesh/meshBVH.mjs, render/perspectiveWarp.mjs
// and multiplayer/wadLevelHost.js each carry their own ray-versus-geometry code, and the gaze-dwell picker, the
// FPS control path and the navmesh all ask "what is in front of me" of some OTHER representation of the world.
// None of them can ask the one that is actually simulating it, so none of them can agree with it by construction.
//
// ---- THE SEGMENT CONVENTION, STATED BECAUSE IT IS THE FIRST THING A CALLER GETS WRONG --------------------------
//
// box3d takes an ORIGIN and a TRANSLATION, not an origin and a unit direction. The translation IS the length:
// the cast covers origin -> origin + translation and nothing beyond it, and `fraction` is a fraction OF THAT
// TRANSLATION rather than a distance. So a caller with a direction and a range multiplies before calling, and
// the hit distance is fraction * |translation|. Passing a unit direction and expecting a long ray is the same
// mistake as passing a unit direction to a segment test, and it fails quietly by hitting nothing.
//
// ---- WHY THIS RETURNS A BODY INDEX AND NOT A SHAPE ID ---------------------------------------------------------
//
// b3RayResult names the SHAPE. Every other entry point in this file speaks in the body indices swk_body_box
// hands out, and returning a shape id here would make this the one function whose answer the rest of the shim
// cannot use. So the shape is resolved to its body and the body to its index, by the same B3_ID_EQUALS scan the
// contact reader uses. A body the table does not know returns -1 rather than 0, because 0 is a real body.
#define SWK_RAY_STRIDE 9   // hit, bodyIndex, fraction, px, py, pz, nx, ny, nz

int swk_ray_stride(void) { return SWK_RAY_STRIDE; }

/**
 * Closest hit along origin -> origin + translation. Writes SWK_RAY_STRIDE floats and returns the body index,
 * or -1 for a miss. The out buffer is written on a miss too -- zeros with out[0] = 0 -- so a caller that reads
 * the row without checking the return value sees "no hit" rather than whatever was there before.
 */
int swk_world_cast_ray(float ox, float oy, float oz,
                       float tx, float ty, float tz, float* out) {
    for (int i = 0; i < SWK_RAY_STRIDE; i++) out[i] = 0.0f;
    b3QueryFilter filter = b3DefaultQueryFilter();
    b3RayResult r = b3World_CastRayClosest(g_world, (b3Pos){ ox, oy, oz }, (b3Vec3){ tx, ty, tz }, filter);
    if (!r.hit) return -1;
    b3BodyId hitBody = b3Shape_GetBody(r.shapeId);
    int idx = -1;
    for (int i = 0; i < g_bodyCount; i++) {
        if (B3_ID_EQUALS(g_bodies[i], hitBody)) { idx = i; break; }
    }
    out[0] = 1.0f;
    out[1] = (float)idx;
    out[2] = r.fraction;
    out[3] = r.point.x;  out[4] = r.point.y;  out[5] = r.point.z;
    out[6] = r.normal.x; out[7] = r.normal.y; out[8] = r.normal.z;
    return idx;
}

// ============================================================================================================
// JOINT STATE AND JOINT DRIVE -- v4385.
//
// *** THE LIMIT HAS BEEN WRITE-ONLY SINCE v2515. *** swk_joint_revolute has taken loDeg and hiDeg from the
// day it was written and swk_joint_spherical has taken coneDeg just as long, and NOT ONE FUNCTION IN THIS FILE
// HAS EVER READ A JOINT ANGLE BACK. Seven swk_joint_* entry points before this block, and every one of them
// either creates, destroys, counts, or toggles collide-connected. So physics/ragdollFromSkeleton.mjs derives
// a knee limit of [-145, 0] degrees from a bone name, hands it to box3d, and nothing anywhere can say whether
// the knee ever reached it -- which is exactly what tools/ship/ragdollStep-selfcheck.mjs's own footer says of
// itself: "the limits are checked as values by v4245 and never as behaviour".
//
// A value you write and never read is not a setting, it is a hope. These are the readbacks that turn it into
// a measurement, plus the DRIVE that a limit implies the need for: a joint that can only be stopped is a
// ragdoll, and a joint that can also be pushed is a rig.
//
// LAYOUTS ARE PUBLISHED, NOT TYPED TWICE. swk_joint_state_stride() and swk_joint_limits_stride() do for these
// rows what swk_contact_stride() and swk_ray_stride() already do for theirs, so physics/box3d/jointDrive.mjs
// names the fields and the gate compares the two counts rather than trusting that they agree.
// ============================================================================================================

#define SWK_JOINT_STATE_STRIDE  4   // kind, angle, twist, motorTorque
#define SWK_JOINT_LIMITS_STRIDE 4   // limitEnabled, lower, upper, motorEnabled

// What kind of joint an index holds, so a caller reading a row knows which fields mean anything.
// *** THIS IS NOT b3JointType. *** box3d numbers its own enum and that numbering is upstream's to change;
// these three constants are this shim's contract with jointDrive.mjs and are asserted equal in the gate.
#define SWK_JOINT_UNKNOWN   0
#define SWK_JOINT_REVOLUTE  1
#define SWK_JOINT_SPHERICAL 2
#define SWK_JOINT_WELD      3

int swk_joint_state_stride(void)  { return SWK_JOINT_STATE_STRIDE; }
int swk_joint_limits_stride(void) { return SWK_JOINT_LIMITS_STRIDE; }

static int swk__joint_kind(int idx) {
    if (idx < 0 || idx >= g_jointCount) return SWK_JOINT_UNKNOWN;
    if (B3_IS_NULL(g_joints[idx])) return SWK_JOINT_UNKNOWN;
    switch (b3Joint_GetType(g_joints[idx])) {
        case b3_revoluteJoint:  return SWK_JOINT_REVOLUTE;
        case b3_sphericalJoint: return SWK_JOINT_SPHERICAL;
        case b3_weldJoint:      return SWK_JOINT_WELD;
        default:                return SWK_JOINT_UNKNOWN;
    }
}

int swk_joint_kind(int idx) { return swk__joint_kind(idx); }

/*
 * The live angles, in RADIANS. Fields: kind, angle, twist, motorTorque.
 *
 * *** THE TWO ANGLE FIELDS MEAN DIFFERENT THINGS FOR THE TWO JOINT KINDS, AND COLLAPSING THEM WOULD BE A LIE.
 * A revolute has ONE angle about its axis and no twist. A spherical has a CONE angle -- how far the bone has
 * swung away from its rest direction, always non-negative -- and separately a TWIST about that direction,
 * which is signed. Writing the cone angle into a field called "angle" and leaving twist at zero would let a
 * caller average the two kinds together, which is meaningless. `kind` is field 0 so the reader has to look.
 *
 * Returns the kind, or SWK_JOINT_UNKNOWN with the row zeroed.
 */
int swk_joint_state(int idx, float* out) {
    for (int i = 0; i < SWK_JOINT_STATE_STRIDE; i++) out[i] = 0.0f;
    int kind = swk__joint_kind(idx);
    out[0] = (float)kind;
    if (kind == SWK_JOINT_REVOLUTE) {
        out[1] = b3RevoluteJoint_GetAngle(g_joints[idx]);
        out[3] = b3RevoluteJoint_GetMotorTorque(g_joints[idx]);
    } else if (kind == SWK_JOINT_SPHERICAL) {
        out[1] = b3SphericalJoint_GetConeAngle(g_joints[idx]);
        out[2] = b3SphericalJoint_GetTwistAngle(g_joints[idx]);
        b3Vec3 t = b3SphericalJoint_GetMotorTorque(g_joints[idx]);
        out[3] = b3Length(t);
    }
    return kind;
}

/*
 * What the joint was actually CONFIGURED with, read back out of the solver rather than remembered here.
 * Fields: limitEnabled, lower, upper, motorEnabled -- radians, and for a spherical the "lower/upper" pair is
 * the cone half-angle in BOTH slots, because a cone has one number and duplicating it is honester than
 * leaving a field that a reader would have to know to ignore.
 *
 * *** READING THIS BACK IS THE POINT, NOT A CONVENIENCE. *** swk_joint_revolute silently drops the limit when
 * loDeg >= hiDeg, and swk_joint_spherical silently drops the cone when coneDeg <= 0. Both are documented and
 * neither was observable: a caller who passed its degrees the wrong way round got a free joint and no
 * complaint. Now the caller can ask.
 */
int swk_joint_limits(int idx, float* out) {
    for (int i = 0; i < SWK_JOINT_LIMITS_STRIDE; i++) out[i] = 0.0f;
    int kind = swk__joint_kind(idx);
    if (kind == SWK_JOINT_REVOLUTE) {
        out[0] = b3RevoluteJoint_IsLimitEnabled(g_joints[idx]) ? 1.0f : 0.0f;
        out[1] = b3RevoluteJoint_GetLowerLimit(g_joints[idx]);
        out[2] = b3RevoluteJoint_GetUpperLimit(g_joints[idx]);
        out[3] = b3RevoluteJoint_IsMotorEnabled(g_joints[idx]) ? 1.0f : 0.0f;
    } else if (kind == SWK_JOINT_SPHERICAL) {
        out[0] = b3SphericalJoint_IsConeLimitEnabled(g_joints[idx]) ? 1.0f : 0.0f;
        const float cone = b3SphericalJoint_GetConeLimit(g_joints[idx]);
        out[1] = cone; out[2] = cone;
        out[3] = b3SphericalJoint_IsMotorEnabled(g_joints[idx]) ? 1.0f : 0.0f;
    }
    return kind;
}

/*
 * THE DRIVE. A motor is what makes a rig resist instead of hanging.
 *
 * speed is RADIANS PER SECOND about the joint's own axis; maxTorque caps what the solver may spend reaching
 * it, and is the field that separates "a limb that holds its pose" from "a limb that cannot be pushed off it".
 * A motor with an unbounded torque is not a muscle, it is a weld with extra steps.
 *
 * *** DETERMINISM: THE COMMENT ABOVE THE JOINT BLOCK HAS WARNED ABOUT THIS SINCE v2515 AND IT IS STILL TRUE.
 * Joints are solved inside box3d and cost lockstep nothing. A motor whose target is set per tick by gameplay
 * is an INPUT, and an input has to travel the same path every other input travels or the replay diverges.
 * This function is the actuator, not the policy; nothing here decides when to call it.
 */
int swk_joint_motor(int idx, int enable, float speed, float maxTorque) {
    int kind = swk__joint_kind(idx);
    if (kind == SWK_JOINT_REVOLUTE) {
        b3RevoluteJoint_EnableMotor(g_joints[idx], enable ? true : false);
        b3RevoluteJoint_SetMotorSpeed(g_joints[idx], speed);
        b3RevoluteJoint_SetMaxMotorTorque(g_joints[idx], maxTorque);
        return kind;
    }
    if (kind == SWK_JOINT_SPHERICAL) {
        // A spherical motor takes a VECTOR velocity. The axis a spherical joint was built around is its
        // frame's z, so a scalar "speed" here means "about your own axis" and is written as such.
        b3SphericalJoint_EnableMotor(g_joints[idx], enable ? true : false);
        b3SphericalJoint_SetMotorVelocity(g_joints[idx], (b3Vec3){ 0.0f, 0.0f, speed });
        b3SphericalJoint_SetMaxMotorTorque(g_joints[idx], maxTorque);
        return kind;
    }
    return SWK_JOINT_UNKNOWN;       // a weld has nothing to drive, and saying so beats doing nothing quietly
}

// ==============================================================================================================
// v4395 -- SENSORS AND CONTINUOUS COLLISION. The last two names on #150 after v4385 shipped motors and limits.
//
// *** A SENSOR IS NOT A FLAG YOU CAN SET LATER. *** b3Shape_IsSensor is a GETTER and there is no setter: the
// isSensor field lives on b3ShapeDef and is read once, at b3CreateHullShape. So this is a second CREATION entry
// point rather than a set-it-afterwards flag, and the shape of the API is dictated by the library rather than
// chosen. Adding an eighth parameter to swk_body_box would have been the other option and would have changed
// the signature every existing caller and every existing gate uses.
//
// The obvious name for that flag is deliberately NOT written above, and this paragraph is why. The first draft
// explained the absence BY NAMING IT, and box3dNode.documentedButMissing -- which greps this file for swk_
// names it can find no definition of -- went from two to three on the strength of a sentence saying the
// function does not exist. A file that names its own subject becomes its own subject; v4387 hit the same trap
// from the other side and the fix is the same, reword rather than add an exclusion.
//
// *** AND SENSOR EVENTS ARE OFF BY DEFAULT ON BOTH ENDS. *** The header says so twice, in two places, because
// it catches everybody: "Enable sensor events for this shape. This applies to sensors AND NON-SENSORS. False by
// default, EVEN FOR SENSORS." A sensor with events disabled is a hole in the world that reports nothing, and a
// visitor with events disabled walks through a live sensor silently. swk_body_sensor enables them on the sensor
// it creates; the VISITOR is the caller's job and swk_body_enable_sensor_events is how.
// ==============================================================================================================

#define SWK_SENSOR_STRIDE 2   /* sensorBodyIndex, visitorBodyIndex */

int swk_sensor_stride(void) { return SWK_SENSOR_STRIDE; }

// Shape -> body -> index, the same scan swk_world_cast_ray and the contact reader use. A shape whose body the
// table does not know yields -1, which is a real answer here: an END event can name a shape that has already
// been destroyed, and the header warns about exactly that.
static int swk__index_of_shape(b3ShapeId s) {
    b3BodyId b = b3Shape_GetBody(s);
    for (int i = 0; i < g_bodyCount; i++) if (B3_ID_EQUALS(g_bodies[i], b)) return i;
    return -1;
}

/**
 * A sensor body: overlaps are reported, nothing is pushed. Density is fixed at 0 rather than taken as a
 * parameter -- the header notes sensors still contribute to body mass at non-zero density, and a trigger volume
 * that changes the mass of the thing it is attached to is a trap nobody would look for.
 *
 * type follows swk_body_box: 0 static, 1 dynamic, 2 kinematic. A static sensor is the ordinary trigger volume.
 */
int swk_body_sensor(int type, float x, float y, float z, float hx, float hy, float hz) {
    if (g_bodyCount >= MAX_BODIES) return -1;
    b3BodyDef bd = b3DefaultBodyDef();
    bd.linearDamping = 0.05f;
    bd.angularDamping = 0.05f;
    bd.type = (type == 2) ? b3_kinematicBody : (type == 1) ? b3_dynamicBody : b3_staticBody;
    bd.position = (b3Pos){ x, y, z };
    b3BodyId body = b3CreateBody(g_world, &bd);
    b3ShapeDef sd = b3DefaultShapeDef();
    sd.density = 0.0f;
    sd.isSensor = true;
    sd.enableSensorEvents = true;   // see the header block: false by default EVEN FOR SENSORS
    b3BoxHull hull = b3MakeBoxHull(hx, hy, hz);
    b3CreateHullShape(body, &sd, &hull.base);
    g_bodies[g_bodyCount] = body;
    return g_bodyCount++;
}

/** Is this body's first shape a sensor? Reads the library rather than a flag this file kept. */
int swk_body_is_sensor(int idx) {
    if (idx < 0 || idx >= g_bodyCount) return 0;
    b3ShapeId shapes[8];
    int n = b3Body_GetShapes(g_bodies[idx], shapes, 8);
    return (n > 0 && b3Shape_IsSensor(shapes[0])) ? 1 : 0;
}

/** Turn sensor events on or off for every shape on a body. A VISITOR needs this or it is never reported. */
void swk_body_enable_sensor_events(int idx, int flag) {
    if (idx < 0 || idx >= g_bodyCount) return;
    b3ShapeId shapes[8];
    int n = b3Body_GetShapes(g_bodies[idx], shapes, 8);
    for (int i = 0; i < n; i++) b3Shape_EnableSensorEvents(shapes[i], flag ? true : false);
}

int swk_sensor_begin_count(void) { return b3World_GetSensorEvents(g_world).beginCount; }
int swk_sensor_end_count(void)   { return b3World_GetSensorEvents(g_world).endCount; }

// Packed int rows, the same idiom as swk_contacts: the caller sizes from the count and reads a flat Int32Array.
// The events are TRANSIENT -- the header says do not store a reference -- so they are copied out here and the
// buffer belongs to the caller.
void swk_sensor_begin(int* out) {
    b3SensorEvents ev = b3World_GetSensorEvents(g_world);
    for (int i = 0; i < ev.beginCount; i++) {
        out[i * SWK_SENSOR_STRIDE + 0] = swk__index_of_shape(ev.beginEvents[i].sensorShapeId);
        out[i * SWK_SENSOR_STRIDE + 1] = swk__index_of_shape(ev.beginEvents[i].visitorShapeId);
    }
}

void swk_sensor_end(int* out) {
    b3SensorEvents ev = b3World_GetSensorEvents(g_world);
    for (int i = 0; i < ev.endCount; i++) {
        out[i * SWK_SENSOR_STRIDE + 0] = swk__index_of_shape(ev.endEvents[i].sensorShapeId);
        out[i * SWK_SENSOR_STRIDE + 1] = swk__index_of_shape(ev.endEvents[i].visitorShapeId);
    }
}

// ---- CONTINUOUS COLLISION -------------------------------------------------------------------------------------
//
// Two independent switches, and calling either one "CCD" would hide the difference. b3World_EnableContinuous is
// DYNAMIC-VERSUS-STATIC and defaults ON; b3Body_SetBullet is DYNAMIC-VERSUS-DYNAMIC for one body and defaults
// off. Measured, and this is stronger than anything the vendored header says: the bullet flag is a second gate
// BEHIND the world switch, not an alternative to it. With the world switch off, setting bullet changes nothing
// against either kind of wall.

void swk_world_enable_continuous(int flag) { b3World_EnableContinuous(g_world, flag ? true : false); }
int  swk_world_continuous_enabled(void)    { return b3World_IsContinuousEnabled(g_world) ? 1 : 0; }

void swk_body_set_bullet(int idx, int flag) {
    if (idx < 0 || idx >= g_bodyCount) return;
    b3Body_SetBullet(g_bodies[idx], flag ? true : false);
}

int swk_body_is_bullet(int idx) {
    if (idx < 0 || idx >= g_bodyCount) return 0;
    return b3Body_IsBullet(g_bodies[idx]) ? 1 : 0;
}

// ---- THE SPEED CAP, WHICH swk_body_set_velocity HAS ALWAYS BEEN SUBJECT TO AND NEVER MENTIONED ---------------
//
// *** FOUND BY MEASURING CONTINUOUS COLLISION, NOT BY LOOKING FOR IT. *** A tunnelling sweep read the same
// final position for 640 m/s and for 1280 m/s, to the last decimal, which no physics does. b3WorldDef carries
// a maximumLinearSpeed and b3DefaultWorldDef sets it; the vendored headers declare the FIELD and the two
// accessors and nowhere state the DEFAULT, because it is assigned in box3d's own .c, which is not vendored
// here. So the number is a measurement rather than a quotation: swk_body_set_velocity accepts any speed, reads
// back unchanged before the step, and is silently 400 m/s after it.
//
// Exposing the accessors is the point. A shim with a velocity setter and no way to see or move the cap that
// overrides it is half an API, and the half it is missing is the one that explains the surprise.

void  swk_world_set_max_linear_speed(float v) { b3World_SetMaximumLinearSpeed(g_world, v); }
float swk_world_max_linear_speed(void)        { return b3World_GetMaximumLinearSpeed(g_world); }
