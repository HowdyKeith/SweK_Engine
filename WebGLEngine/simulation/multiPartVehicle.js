// FILE: simulation/multiPartVehicle.js
// VERSION: v755
//
// Reusable multi-part vehicle constructors. Both demos (city defense)
// and potentially OGRE civ-defender spawning can use these. Vehicles
// are built from 3 entities each to read as recognizable shapes:
//
//   TANK:
//        ┌──────┐
//      ┌─┤turret│─── barrel ──>
//      │ └──────┘
//     ┌┴────────┐
//     │  hull   │
//     └─────────┘
//
//   PLANE:
//          ◄══tail══►
//         ┌──┐
//      ┌──┤fuselage├──┐
//   wing└────────────┘wing
//
// All parts use the "obelisk" primitive (built-in scaled cube) so no
// asset pack is required. Future: a single GLB swap can replace each
// part by name. Both builders return a "vehicle handle" with the part
// IDs + state needed by the caller's tick loop.

const TANK_HULL_KIND    = "tank_hull";
const TANK_TURRET_KIND  = "tank_turret";
const TANK_BARREL_KIND  = "tank_barrel";
const PLANE_FUSELAGE_K  = "plane_fuselage";
const PLANE_WING_K      = "plane_wing";
const PLANE_TAIL_K      = "plane_tail";

// v759 — Gemini-voxelized GLB asset swap. By default each part renders
// using the engine's "obelisk" primitive. Demos can call registerVoxelAssets()
// once at startup to replace these with AI-generated voxelized meshes.
// The map persists between buildTank/buildPlane calls.
const _ASSET_OVERRIDES = {
    [TANK_HULL_KIND]:   "obelisk",
    [TANK_TURRET_KIND]: "obelisk",
    [TANK_BARREL_KIND]: "obelisk",
    [PLANE_FUSELAGE_K]: "obelisk",
    [PLANE_WING_K]:     "obelisk",
    [PLANE_TAIL_K]:     "obelisk",
};

// Prompts tuned for Gemini's blocky voxelized output. Short, descriptive,
// styled for the blocky aesthetic of the engine. Used by registerVoxelAssets.
const VOXEL_PROMPTS = {
    [TANK_HULL_KIND]:   "tank hull olive drab blocky voxel",
    [TANK_TURRET_KIND]: "tank turret rotating blocky voxel",
    [TANK_BARREL_KIND]: "tank gun barrel blocky voxel",
    [PLANE_FUSELAGE_K]: "fighter plane fuselage gunmetal blocky voxel",
    [PLANE_WING_K]:     "fighter plane wing blocky voxel",
    [PLANE_TAIL_K]:     "fighter plane tail blocky voxel",
};

// v759 — call once on engine boot or first demo start to swap obelisks
// for Gemini-voxelized assets. Idempotent: if assets are already cached
// server-side (via the engine's AI bridge), this returns nearly instantly.
// Returns the map of {part_kind: assetId} that was registered, or
// {ok:false, reason} if the AI bridge isn't reachable.
//
// Usage in the city demo (or any other module):
//   import { registerVoxelAssets } from "../simulation/multiPartVehicle.js";
//   await registerVoxelAssets();   // swaps all parts to Gemini GLBs
//   const tank = buildTank(router, x, z);   // now built from voxelized assets
export async function registerVoxelAssets(opts = {}) {
    if (typeof window === "undefined" || !window.ai?.registerAsset) {
        return { ok: false, reason: "no_ai_bridge" };
    }
    const verbose = opts.verbose !== false;
    const results = {};
    for (const [kind, prompt] of Object.entries(VOXEL_PROMPTS)) {
        try {
            if (verbose) console.log(`[multiPartVehicle] registering ${kind} <- "${prompt}"`);
            const r = await window.ai.registerAsset(prompt, { allowCached: true });
            if (r?.ok && r.kind) {
                _ASSET_OVERRIDES[kind] = r.kind;
                results[kind] = r.kind;
                if (verbose) console.log(`  ✓ ${kind} → assetId="${r.kind}"`);
            } else {
                if (verbose) console.warn(`  ✗ ${kind} failed:`, r?.error || "unknown");
                results[kind] = null;
            }
        } catch (e) {
            if (verbose) console.warn(`  ✗ ${kind} threw:`, e?.message);
            results[kind] = null;
        }
    }
    return { ok: true, assets: results };
}

// Reset all parts to obelisk (used to "un-Gemini" the vehicles for testing).
export function resetVoxelAssets() {
    _ASSET_OVERRIDES[TANK_HULL_KIND]   = "obelisk";
    _ASSET_OVERRIDES[TANK_TURRET_KIND] = "obelisk";
    _ASSET_OVERRIDES[TANK_BARREL_KIND] = "obelisk";
    _ASSET_OVERRIDES[PLANE_FUSELAGE_K] = "obelisk";
    _ASSET_OVERRIDES[PLANE_WING_K]     = "obelisk";
    _ASSET_OVERRIDES[PLANE_TAIL_K]     = "obelisk";
}

function _spawn(router, kind, x, y, z, scale, yaw) {
    if (!router?.exec) return null;
    try {
        const r = router.exec({
            type: "entity:spawnMesh",
            assetId: _ASSET_OVERRIDES[kind] || "obelisk",
            kind, x, y, z, scale, yaw,
        });
        return (r?.ok && r.id != null) ? r.id : null;
    } catch { return null; }
}

function _move(router, id, x, y, z, yaw) {
    if (id == null || !router?.exec) return;
    try { router.exec({ type: "entity:move", id, x, y, z, yaw }); } catch {}
}

function _despawn(router, id) {
    if (id == null || !router?.exec) return;
    try { router.exec({ type: "entity:despawn", id }); } catch {}
}

// ----------------------------------------------------------------------
// TANK — three obelisks. Drive yaw is the heading of the hull.
// turretYaw is independent; the barrel/turret render using turretYaw.
// ----------------------------------------------------------------------
export function buildTank(router, x, z, opts = {}) {
    const yaw       = opts.yaw       ?? 0;
    const hullScale = opts.hullScale ?? 0.55;
    const turScale  = opts.turScale  ?? 0.32;
    const barScale  = opts.barScale  ?? 0.15;
    const hullId   = _spawn(router, TANK_HULL_KIND,   x, 0.4, z, hullScale, yaw);
    const turretId = _spawn(router, TANK_TURRET_KIND, x, 1.4, z, turScale,  yaw);
    if (hullId == null || turretId == null) {
        _despawn(router, hullId);
        _despawn(router, turretId);
        return null;
    }
    const bX = x + Math.sin(yaw) * 1.4;
    const bZ = z + Math.cos(yaw) * 1.4;
    const barrelId = _spawn(router, TANK_BARREL_KIND, bX, 1.4, bZ, barScale, yaw);
    return {
        kind: "tank",
        hullId, turretId, barrelId,
        x, y: 0, z,
        yaw,        // hull heading
        turretYaw: yaw,   // independent aim (v755 added — defaults to hull)
        scale: hullScale,
    };
}

export function updateTankTransform(router, tank) {
    if (!tank) return;
    _move(router, tank.hullId,   tank.x, 0.4, tank.z, tank.yaw);
    _move(router, tank.turretId, tank.x, 1.4, tank.z, tank.turretYaw);
    if (tank.barrelId != null) {
        const bx = tank.x + Math.sin(tank.turretYaw) * 1.4;
        const bz = tank.z + Math.cos(tank.turretYaw) * 1.4;
        _move(router, tank.barrelId, bx, 1.4, bz, tank.turretYaw);
    }
}

export function despawnTank(router, tank) {
    if (!tank) return;
    _despawn(router, tank.hullId);
    _despawn(router, tank.turretId);
    _despawn(router, tank.barrelId);
}

// Compute the world-space muzzle position (end of barrel) so projectiles
// spawn from the barrel tip instead of the hull center.
export function tankMuzzle(tank) {
    if (!tank) return null;
    return {
        x: tank.x + Math.sin(tank.turretYaw) * 2.5,
        y: 1.5,
        z: tank.z + Math.cos(tank.turretYaw) * 2.5,
    };
}

// ----------------------------------------------------------------------
// PLANE — three obelisks: long fuselage, two wing pieces (one wide
// obelisk crossed against the fuselage), short tail piece.
// ----------------------------------------------------------------------
export function buildPlane(router, x, y, z, opts = {}) {
    const yaw = opts.yaw ?? 0;
    const fuselageScale = opts.fuselageScale ?? 1.2;
    const wingScale     = opts.wingScale     ?? 0.8;
    const tailScale     = opts.tailScale     ?? 0.4;
    const fuselageId = _spawn(router, PLANE_FUSELAGE_K, x, y, z, fuselageScale, yaw);
    if (fuselageId == null) return null;
    // Wings: a wide obelisk rotated 90° relative to fuselage
    const wingId = _spawn(router, PLANE_WING_K, x, y, z, wingScale, yaw + Math.PI / 2);
    // Tail: smaller piece behind fuselage
    const tx = x - Math.sin(yaw) * 2.5;
    const tz = z - Math.cos(yaw) * 2.5;
    const tailId = _spawn(router, PLANE_TAIL_K, tx, y + 0.4, tz, tailScale, yaw);
    return {
        kind: "plane",
        fuselageId, wingId, tailId,
        x, y, z, yaw,
        scale: fuselageScale,
    };
}

export function updatePlaneTransform(router, plane) {
    if (!plane) return;
    _move(router, plane.fuselageId, plane.x, plane.y, plane.z, plane.yaw);
    _move(router, plane.wingId,     plane.x, plane.y, plane.z, plane.yaw + Math.PI / 2);
    if (plane.tailId != null) {
        const tx = plane.x - Math.sin(plane.yaw) * 2.5;
        const tz = plane.z - Math.cos(plane.yaw) * 2.5;
        _move(router, plane.tailId, tx, plane.y + 0.4, tz, plane.yaw);
    }
}

export function despawnPlane(router, plane) {
    if (!plane) return;
    _despawn(router, plane.fuselageId);
    _despawn(router, plane.wingId);
    _despawn(router, plane.tailId);
}

// World-space bomb-drop position (slightly below fuselage)
export function planeDropPoint(plane) {
    if (!plane) return null;
    return { x: plane.x, y: plane.y - 0.5, z: plane.z };
}
