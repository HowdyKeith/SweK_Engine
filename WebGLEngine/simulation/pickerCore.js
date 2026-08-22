// FILE: simulation/pickerCore.js
// VERSION: v620 — full 3-axis OBB picking (yaw + pitch + roll) + per-joint
//                  skin radii for pose-corrected bounds.
//
// What changed from v619:
//   * v619 was yaw-only OBB. Pitch (tiltX) and roll (tiltZ) were ignored, so
//     a hurled projectile tumbling around all 3 axes got an undersized /
//     misaligned pick volume. v620 composes a full 3x3 rotation matrix
//     CPU-side using the same `yawMat * pitchMat * rollMat` order as
//     EntityMeshRenderer; both ray transform (inverse = transpose) and
//     highlight render use the same matrix.
//   * Pose AABB padding in v619 was a flat fraction of static-bounds extent —
//     a "stick-figure-plus-pad" model. v620 unions per-joint spheres using
//     skin.jointRadii (precomputed at GLB load by gpuAssetLoader). Each
//     joint's contribution is its world position ± its actual radius.
//     Falls back to v619 flat-pad if jointRadii is absent.
//
// Also fixed: v619 had inverted sin signs in both the highlight shader and
// the picker ray transform. Both effects cancelled relative to each other
// so picks still worked, but the rendered OBB was mirrored from the actual
// rendered entity. v620's mat3 approach builds the right matrix once on the
// CPU, eliminating sign-flip risk.

import { raycastVoxel } from "../editor/voxelSelectionRaycast.js";

const SKIP_KINDS = new Set([
    "stage_floor",
    "player",
]);
const HIT_PAD = 0.15;
const MIN_SPHERE_R = 0.4;
const POSE_PAD_FRAC = 0.15;     // fallback pad when jointRadii not precomputed

let _assetLoader = null;
let _entityMeshRenderer = null;

// v621 — per-frame pose-AABB cache. Picker queries one ray per frame today,
// but multi-select and screen-rect enumeration query many entities at once.
// Caching the rigged pose AABB per (entityId, frame) keeps the per-tick
// joint-walk cost flat regardless of how many picks fire per frame. main.js's
// render loop calls beginFrame() at the start of each tick; on cache miss
// the AABB is computed and stored. As a defensive backup, entries also
// time-expire after CACHE_TTL_MS in case the caller forgets to call
// beginFrame() (e.g. testing in isolation).
const CACHE_TTL_MS = 30;
let _poseCache = new Map();
let _poseCacheCleared = 0;

export function beginFrame() {
    _poseCache.clear();
    _poseCacheCleared = (typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now();
}

export function setAssetLoader(loader) { _assetLoader = loader; }
export function setEntityMeshRenderer(emr) { _entityMeshRenderer = emr; }

// ------------------------------------------------------------- public API

export function ndcToWorldRay(camera, canvas, ndcX, ndcY) {
    const fov = (camera.fov || (60 * Math.PI / 180));
    const w = canvas.width, h = canvas.height;
    const aspect = w / h;
    const t = Math.tan(fov / 2);
    const fwd = (camera.getForwardVector?.() || { x: 0, y: 0, z: -1 });
    const wup = (Math.abs(fwd.y) > 0.99) ? { x: 0, y: 0, z: 1 } : { x: 0, y: 1, z: 0 };
    const right = _norm(_cross(fwd, wup));
    if (!right) return null;
    const up = _norm(_cross(right, fwd));
    const dir = _norm({
        x: fwd.x + right.x * ndcX * t * aspect + up.x * ndcY * t,
        y: fwd.y + right.y * ndcX * t * aspect + up.y * ndcY * t,
        z: fwd.z + right.z * ndcX * t * aspect + up.z * ndcY * t,
    });
    if (!dir) return null;
    return { origin: { x: camera.position.x, y: camera.position.y, z: camera.position.z }, dir };
}

export function raycastEntities(entities, origin, dir, maxDist) {
    if (!entities || !entities.length) return null;
    let best = null;
    for (const e of entities) {
        if (SKIP_KINDS.has(e.kind)) continue;
        const local = _getEntityLocalAABB(e);
        let t = null, hitMode = null;
        const rotMat = composeRotMat3(Number(e.yaw)||0, Number(e.tiltX)||0, Number(e.tiltZ)||0);
        if (local) {
            t = _rayOBB(origin, dir, e, local.aabb, rotMat);
            hitMode = local.isPoseCorrected ? "obb-pose" : "obb";
        }
        if (t == null) {
            t = _raySphere(origin, dir, e);
            hitMode = "sphere";
        }
        if (t == null || t < 0 || t > maxDist) continue;
        if (!best || t < best.dist) {
            best = {
                entity: e,
                dist: t,
                hitRadius: _entityRadius(e),
                localAABB: local ? local.aabb : null,
                worldAABB: local ? _worldAABBFromLocal(e, local.aabb, rotMat) : null,
                rotMat,
                scale: { x: _sx(e), y: _sy(e), z: _sz(e) },
                hitMode,
            };
        }
    }
    return best;
}

// v621 — project each visible entity's center to NDC; return entities whose
// projected position falls inside the (ndcMinX, ndcMinY, ndcMaxX, ndcMaxY)
// rectangle AND are in front of the camera (clip-space w > 0).
//
// Used by the drag-box multi-select. Skip-list ('stage_floor', 'player') still
// applies so the user can't accidentally select the world floor. Caller is
// expected to compute the NDC rect from canvas-pixel mouse coords.
export function entitiesInScreenRect(entities, camera, rectNdc) {
    if (!entities || !entities.length) return [];
    const mvp = camera?.getViewProjMatrix?.();
    if (!mvp || mvp.length < 16) return [];
    const out = [];
    const minX = Math.min(rectNdc.minX, rectNdc.maxX);
    const maxX = Math.max(rectNdc.minX, rectNdc.maxX);
    const minY = Math.min(rectNdc.minY, rectNdc.maxY);
    const maxY = Math.max(rectNdc.minY, rectNdc.maxY);
    for (const e of entities) {
        if (SKIP_KINDS.has(e.kind)) continue;
        // Project entity center (lift Y up a bit to roughly hit middle of mesh
        // since most are base-anchored) through MVP. mat4 col-major:
        //   col0 = mvp[0..3], col1 = mvp[4..7], col2 = mvp[8..11], col3 = mvp[12..15]
        // (mvp * v).i = mvp[0+i]*v.x + mvp[4+i]*v.y + mvp[8+i]*v.z + mvp[12+i]*v.w
        const r = _entityRadius(e);
        const px = e.x, py = e.y + r * 0.5, pz = e.z, pw = 1;
        const cx = mvp[0]*px + mvp[4]*py + mvp[8] *pz + mvp[12]*pw;
        const cy = mvp[1]*px + mvp[5]*py + mvp[9] *pz + mvp[13]*pw;
        const cw = mvp[3]*px + mvp[7]*py + mvp[11]*pz + mvp[15]*pw;
        if (cw <= 0) continue;        // behind camera
        const ndcX = cx / cw, ndcY = cy / cw;
        if (ndcX < minX || ndcX > maxX || ndcY < minY || ndcY > maxY) continue;
        out.push(e);
    }
    return out;
}

export function pickClosest(world, entities, origin, dir, maxDist) {
    // v623 — when the active demo hides terrain (isolation = exclusive or
    // clean), the voxel chunks still exist in memory but don't render. The
    // picker was raycasting them anyway, producing a yellow hover-box that
    // tracked an invisible terrain — confusing and useless in non-sandbox
    // demos. Now we skip the voxel raycast entirely when terrain is hidden.
    // Entities are still picked normally (so multi-select etc. keeps
    // working across all demos).
    const hideTerrain = (typeof window !== "undefined") &&
        (window._demoIsolation === "exclusive" || window._demoIsolation === "clean");
    const vox = (world && !hideTerrain) ? raycastVoxel(world, origin, dir, maxDist) : null;
    const voxDist = vox ? _approxVoxelDist(origin, vox) : Infinity;
    const ent = raycastEntities(entities, origin, dir, maxDist);
    const entDist = ent ? ent.dist : Infinity;
    if (voxDist < entDist) {
        if (!vox) return null;
        return { type: "voxel", hit: vox, dist: voxDist };
    }
    if (!ent) return null;
    return {
        type: "entity",
        entity: ent.entity,
        dist: ent.dist,
        hitRadius: ent.hitRadius,
        localAABB: ent.localAABB,
        worldAABB: ent.worldAABB,
        rotMat: ent.rotMat,
        scale: ent.scale,
        hitMode: ent.hitMode,
        aabb: ent.worldAABB,
    };
}

// Compose engine's `yawMat * pitchMat * rollMat` (column-major) as Float32Array(9).
// Exported so consumers (the pickers) get the same matrix that's already in
// the hit result — they could re-derive, but this saves the re-compute.
export function composeRotMat3(yaw, pitch, roll) {
    const cy = Math.cos(yaw),   sy = Math.sin(yaw);
    const cp = Math.cos(pitch), sp = Math.sin(pitch);
    const cr = Math.cos(roll),  sr = Math.sin(roll);
    // Row-major derivation:
    //   R[0][0] = cy*cr + sy*sp*sr     R[0][1] = -cy*sr + sy*sp*cr   R[0][2] = sy*cp
    //   R[1][0] = cp*sr                R[1][1] = cp*cr               R[1][2] = -sp
    //   R[2][0] = -sy*cr + cy*sp*sr    R[2][1] = sy*sr + cy*sp*cr    R[2][2] = cy*cp
    // Column-major storage = (col0, col1, col2)
    return new Float32Array([
        cy*cr + sy*sp*sr,          // col 0 row 0
        cp*sr,                     // col 0 row 1
        -sy*cr + cy*sp*sr,         // col 0 row 2
        -cy*sr + sy*sp*cr,         // col 1 row 0
        cp*cr,                     // col 1 row 1
        sy*sr + cy*sp*cr,          // col 1 row 2
        sy*cp,                     // col 2 row 0
        -sp,                       // col 2 row 1
        cy*cp,                     // col 2 row 2
    ]);
}

// ------------------------------------------------------------- internals

function _getEntityLocalAABB(e) {
    if (!_assetLoader?.cache || !e.assetId) return null;
    const mesh = _assetLoader.cache.get(e.assetId);
    if (!mesh || !mesh.bounds) return null;

    if (mesh.isRigged && mesh.skin && _entityMeshRenderer?._animators) {
        // v621 — cache fast-path. On hit we skip animator inspection entirely;
        // on miss we walk the animator state and compute fresh, then store.
        const now = (typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now();
        if (now - _poseCacheCleared > CACHE_TTL_MS) {
            _poseCache.clear();
            _poseCacheCleared = now;
        }
        const cached = _poseCache.get(e.id);
        if (cached) return { aabb: cached, isPoseCorrected: true, mesh };

        const animator = _entityMeshRenderer._animators.get(e.id);
        if (animator && animator.nodeMatrices && animator.skin?.joints) {
            const poseAABB = _animatorPoseAABB(animator, mesh);
            if (poseAABB) {
                _poseCache.set(e.id, poseAABB);
                return { aabb: poseAABB, isPoseCorrected: true, mesh };
            }
        }
    }
    return { aabb: mesh.bounds, isPoseCorrected: false, mesh };
}

// v620 — pose AABB now uses per-joint radii (mesh.skin.jointRadii from
// gpuAssetLoader). For each joint: world position ± radius → union. If
// jointRadii is absent (older meshes), falls back to flat-pad of static
// extent (v619 behaviour).
function _animatorPoseAABB(animator, mesh) {
    const joints = animator.skin.joints;
    const node = animator.nodeMatrices;
    if (!joints?.length || !node) return null;

    const radii = mesh.skin.jointRadii;   // precomputed at GLB load; may be null/undefined
    let minX = +Infinity, minY = +Infinity, minZ = +Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    let touched = 0;
    for (let j = 0; j < joints.length; j++) {
        const m = node[joints[j]];
        if (!m || m.length < 16) continue;
        const x = m[12], y = m[13], z = m[14];
        if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) continue;
        const r = (radii && Number.isFinite(radii[j])) ? radii[j] : 0;
        if (x - r < minX) minX = x - r;
        if (x + r > maxX) maxX = x + r;
        if (y - r < minY) minY = y - r;
        if (y + r > maxY) maxY = y + r;
        if (z - r < minZ) minZ = z - r;
        if (z + r > maxZ) maxZ = z + r;
        touched++;
    }
    if (touched === 0) return null;

    // If we DIDN'T have per-joint radii, fall back to v619's flat-pad model.
    // The min/max above are just joint positions; add a static-extent fraction
    // so mesh skin around each joint is at least somewhat covered.
    if (!radii) {
        const sb = mesh.bounds;
        const padX = (sb.maxX - sb.minX) * POSE_PAD_FRAC + HIT_PAD;
        const padY = (sb.maxY - sb.minY) * POSE_PAD_FRAC + HIT_PAD;
        const padZ = (sb.maxZ - sb.minZ) * POSE_PAD_FRAC + HIT_PAD;
        return {
            minX: minX - padX, maxX: maxX + padX,
            minY: minY - padY, maxY: maxY + padY,
            minZ: minZ - padZ, maxZ: maxZ + padZ,
        };
    }
    // With per-joint radii, the bounds are already correct — small HIT_PAD only.
    return {
        minX: minX - HIT_PAD, maxX: maxX + HIT_PAD,
        minY: minY - HIT_PAD, maxY: maxY + HIT_PAD,
        minZ: minZ - HIT_PAD, maxZ: maxZ + HIT_PAD,
    };
}

// 3-axis OBB raycast. Transform ray to entity-local: subtract position,
// apply inverse rotation (= transpose for orthogonal mat3), divide by per-
// axis scale. Slab test against local AABB. t is preserved across the
// transform since we don't renormalise direction.
function _rayOBB(origin, dir, e, localAABB, rotMat) {
    const sx = _sx(e), sy = _sy(e), sz = _sz(e);

    // d = origin - entity_pos
    const dx = origin.x - e.x;
    const dy = origin.y - e.y;
    const dz = origin.z - e.z;

    // Apply R^T (transpose of rotation matrix) to d. Column-major mat3:
    //   m[0..2] = col0 = (R[0][0], R[1][0], R[2][0])
    //   m[3..5] = col1, m[6..8] = col2
    // R^T * v: row i of R^T = column i of R, so:
    //   (R^T * v).x = R[col0][0]*v.x + R[col0][1]*v.y + R[col0][2]*v.z
    //              = m[0]*v.x + m[1]*v.y + m[2]*v.z
    const m = rotMat;
    const rx = m[0] * dx + m[1] * dy + m[2] * dz;
    const ry = m[3] * dx + m[4] * dy + m[5] * dz;
    const rz = m[6] * dx + m[7] * dy + m[8] * dz;
    const o = { x: rx / sx, y: ry / sy, z: rz / sz };

    const rdx = m[0] * dir.x + m[1] * dir.y + m[2] * dir.z;
    const rdy = m[3] * dir.x + m[4] * dir.y + m[5] * dir.z;
    const rdz = m[6] * dir.x + m[7] * dir.y + m[8] * dir.z;
    const d = { x: rdx / sx, y: rdy / sy, z: rdz / sz };

    const minX = localAABB.minX - HIT_PAD / sx, maxX = localAABB.maxX + HIT_PAD / sx;
    const minY = localAABB.minY - HIT_PAD / sy, maxY = localAABB.maxY + HIT_PAD / sy;
    const minZ = localAABB.minZ - HIT_PAD / sz, maxZ = localAABB.maxZ + HIT_PAD / sz;

    const inv = (v) => Math.abs(v) > 1e-9 ? 1 / v : Infinity;
    const ix = inv(d.x), iy = inv(d.y), iz = inv(d.z);
    const t1x = (minX - o.x) * ix, t2x = (maxX - o.x) * ix;
    const t1y = (minY - o.y) * iy, t2y = (maxY - o.y) * iy;
    const t1z = (minZ - o.z) * iz, t2z = (maxZ - o.z) * iz;
    const tmin = Math.max(Math.min(t1x, t2x), Math.min(t1y, t2y), Math.min(t1z, t2z));
    const tmax = Math.min(Math.max(t1x, t2x), Math.max(t1y, t2y), Math.max(t1z, t2z));
    if (tmax < 0 || tmin > tmax) return null;
    return Math.max(tmin, 0);
}

// Conservative world AABB from local AABB + entity TRS. Transforms 8 corners
// by full TRS using the mat3 rotation. Used by back-compat consumers that
// expect a world-space box.
function _worldAABBFromLocal(e, localAABB, rotMat) {
    const sx = _sx(e), sy = _sy(e), sz = _sz(e);
    let minX = +Infinity, minY = +Infinity, minZ = +Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    const m = rotMat;
    for (let i = 0; i < 8; i++) {
        const lx = ((i & 1) ? localAABB.maxX : localAABB.minX) * sx;
        const ly = ((i & 2) ? localAABB.maxY : localAABB.minY) * sy;
        const lz = ((i & 4) ? localAABB.maxZ : localAABB.minZ) * sz;
        // Forward R: column-major, R * v = (m[0]*x + m[3]*y + m[6]*z, m[1]*x + m[4]*y + m[7]*z, m[2]*x + m[5]*y + m[8]*z)
        const rx = m[0]*lx + m[3]*ly + m[6]*lz;
        const ry = m[1]*lx + m[4]*ly + m[7]*lz;
        const rz = m[2]*lx + m[5]*ly + m[8]*lz;
        const wx = e.x + rx, wy = e.y + ry, wz = e.z + rz;
        if (wx < minX) minX = wx; if (wx > maxX) maxX = wx;
        if (wy < minY) minY = wy; if (wy > maxY) maxY = wy;
        if (wz < minZ) minZ = wz; if (wz > maxZ) maxZ = wz;
    }
    return {
        minX: minX - HIT_PAD, maxX: maxX + HIT_PAD,
        minY: minY - HIT_PAD, maxY: maxY + HIT_PAD,
        minZ: minZ - HIT_PAD, maxZ: maxZ + HIT_PAD,
    };
}

function _raySphere(origin, dir, e) {
    const r = _entityRadius(e);
    if (r <= 0) return null;
    const cx = e.x, cy = e.y + r, cz = e.z;
    const lx = cx - origin.x, ly = cy - origin.y, lz = cz - origin.z;
    const tca = lx * dir.x + ly * dir.y + lz * dir.z;
    if (tca < 0) return null;
    const dsq = (lx*lx + ly*ly + lz*lz) - tca*tca;
    const rsq = r * r;
    if (dsq > rsq) return null;
    const thc = Math.sqrt(rsq - dsq);
    const t = tca - thc;
    return t < 0 ? null : t;
}

function _entityRadius(e) {
    const s = Math.max(Number(e.scale)||0, Number(e.scaleX)||0, Number(e.scaleY)||0, Number(e.scaleZ)||0);
    return Math.max(s, MIN_SPHERE_R);
}
function _sx(e) { return (e.scaleX != null ? Number(e.scaleX) : 0) || Number(e.scale) || 1; }
function _sy(e) { return (e.scaleY != null ? Number(e.scaleY) : 0) || Number(e.scale) || 1; }
function _sz(e) { return (e.scaleZ != null ? Number(e.scaleZ) : 0) || Number(e.scale) || 1; }
function _approxVoxelDist(origin, hit) {
    const dx = (hit.x + 0.5) - origin.x;
    const dy = (hit.y + 0.5) - origin.y;
    const dz = (hit.z + 0.5) - origin.z;
    return Math.hypot(dx, dy, dz);
}
function _cross(a, b) { return { x: a.y*b.z - a.z*b.y, y: a.z*b.x - a.x*b.z, z: a.x*b.y - a.y*b.x }; }
function _norm(v)     { const L = Math.hypot(v.x, v.y, v.z); return L < 1e-6 ? null : { x: v.x/L, y: v.y/L, z: v.z/L }; }
