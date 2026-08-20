// FILE: demos_code/kaiju_attacks_city.js
// VERSION: v755 — planes + raycast hit + independent turret aim + kaiju returns fire
//
// Defends a small city from a kaiju centipede. Player watches; tanks
// drive in, planes fly overhead and dive-bomb, kaiju fires plasma back.
// First to deplete the other side's HP wins:
//   * Kaiju HP=0 → CITY DEFENDED
//   * Kaiju reaches city center → CITY DESTROYED
//
// v755 changes:
//   * Tanks built via simulation/multiPartVehicle.js (shared module)
//   * Independent turret aim — barrel rotates toward kaiju even when
//     hull is mid-turn or facing differently
//   * Two patrol planes loop above the city; periodically dive-bomb the
//     kaiju (faster than tanks, ~3x damage, longer cooldown)
//   * Raycast hit detection — projectiles check line-segment vs each
//     centipede segment (sphere). Damage attributed to specific segment.
//     "Lucky" hits on the head still split chains via centipede.bisect
//   * Kaiju fires plasma orbs at the nearest tank every ~3-5s (visual
//     return fire — projectile despawns on near-tank or after lifetime)
//
// Console (active while demo running):
//   cityAttack.spawnTank() / spawnPlane()
//   cityAttack.spawnKaiju(n)
//   cityAttack.flyThrough() / flyStop()
//   cityAttack.stats()
//   cityAttack.reset()

import {
    buildTank, updateTankTransform, despawnTank, tankMuzzle,
    buildPlane, updatePlaneTransform, despawnPlane, planeDropPoint,
    registerVoxelAssets, resetVoxelAssets,
} from "../simulation/multiPartVehicle.js";
import { buildCivilians, updateCivilians, despawnCivilians } from "../simulation/cityCivilians.js";

const PROJ_KIND_TANK    = "tank_projectile";
const PROJ_KIND_PLANE   = "plane_bomb";
const PROJ_KIND_KAIJU   = "kaiju_plasma";
const PROJ_KIND_BEAM    = "kaiju_beam_bead";    // v757 — beam visualized as fast bead trail
const CAR_KIND          = "civilian_car";

// v758 — visual hit feedback helper. Best-effort: if damageNumbers isn't
// hooked up (older engine), silently no-op. Color encodes source:
//   yellow → tank fire  · cyan → plane bomb  · purple → kaiju · white → fatal
function _showDamage(x, y, z, amount, color, prefix) {
    try {
        if (typeof window !== "undefined" && window.damageNumbers?.show) {
            window.damageNumbers.show(x, y, z, amount, {
                color: color ?? "#ffcc66",
                prefix: prefix ?? "",
                durationMs: 900,
            });
        }
    } catch {}
}

// v758 — register a tank or plane as a KaijuManager-visible target. The
// target descriptor returns LIVE x/y/z via getters so kaiju aim at the
// CURRENT position rather than a snapshot. applyDamage triggers the
// same damage path the demo uses for kaiju projectile hits.
function _registerTargetFor(unit, isPlane = false) {
    if (typeof window === "undefined" || !Array.isArray(window._extraRangedTargets)) return;
    const target = {
        get x() { return isPlane ? unit.plane.x : unit.x; },
        get y() { return isPlane ? unit.plane.y : 1.0; },
        get z() { return isPlane ? unit.plane.z : unit.z; },
        ref: unit,
        _type: isPlane ? "city_plane" : "city_tank",
        name:  isPlane ? "City Plane" : "City Tank",
        // v770 — moveBy lets the status effect "pulled" (tractor beam)
        // physically drag this defender. Writes through to the
        // underlying unit's position. No-op-safe for tanks at y=ground.
        moveBy: (dx, dz) => {
            if (isPlane) {
                unit.plane.x += dx;
                unit.plane.z += dz;
            } else {
                unit.x += dx;
                unit.z += dz;
            }
        },
        applyDamage: (d) => {
            // KaijuManager damage is normalized 0..1; tanks deal in integer HP.
            // Use d directly (1.0 typical) and floor for HP arithmetic.
            const dmg = Math.max(1, Math.ceil(d));
            if (isPlane) {
                unit.hp = (unit.hp ?? PLANE_MAX_HP) - dmg;
                _showDamage(unit.plane.x, unit.plane.y + 0.8, unit.plane.z, dmg, "#cc66ff", "-");
                if (unit.hp <= 0) {
                    _showDamage(unit.plane.x, unit.plane.y + 1.6, unit.plane.z, "DOWNED", "#ffffff", "");
                    despawnPlane(state.router, unit.plane);
                    const idx = state.planes.indexOf(unit);
                    if (idx >= 0) state.planes.splice(idx, 1);
                    _unregisterTarget(target);
                }
            } else {
                unit.hp = (unit.hp ?? TANK_MAX_HP) - dmg;
                _showDamage(unit.x, 2.2, unit.z, dmg, "#cc66ff", "-");
                if (unit.hp <= 0) {
                    _showDamage(unit.x, 3.0, unit.z, "WRECKED", "#ffffff", "");
                    despawnTank(state.router, unit);
                    const idx = state.tanks.indexOf(unit);
                    if (idx >= 0) state.tanks.splice(idx, 1);
                    _unregisterTarget(target);
                }
            }
        },
    };
    unit._kmTarget = target;
    window._extraRangedTargets.push(target);
}

function _unregisterTarget(target) {
    try {
        const arr = window._extraRangedTargets;
        if (!arr) return;
        const i = arr.indexOf(target);
        if (i >= 0) arr.splice(i, 1);
    } catch {}
}

function _clearAllTargets() {
    try { if (Array.isArray(window._extraRangedTargets)) window._extraRangedTargets.length = 0; } catch {}
}

const KAIJU_MAX_HP       = 40;
const KAIJU_LOSE_RADIUS  = 5;
const FLEE_RADIUS        = 25;
const TANK_PROJ_SPEED    = 32;
const TANK_PROJ_LIFE_MS  = 3500;
const PLANE_BOMB_SPEED   = 24;
const PLANE_BOMB_LIFE_MS = 4000;
const KAIJU_PROJ_SPEED   = 18;
const KAIJU_PROJ_LIFE_MS = 4000;
const KAIJU_FIRE_MIN_MS  = 3000;
const KAIJU_FIRE_MAX_MS  = 5500;
const SEGMENT_HIT_RADIUS = 1.6;
const HEAD_HIT_RADIUS    = 2.4;
// v756 — combatant HP + AA
const TANK_MAX_HP        = 3;
const PLANE_MAX_HP       = 2;
const PLANE_HIT_RADIUS   = 2.0;
const KAIJU_AA_MIN_MS    = 5500;   // anti-air slower than ground fire
const KAIJU_AA_MAX_MS    = 9000;
const KAIJU_AA_SPEED     = 22;
// v756 — tilt the plane orbit center +X so planes don't fly THROUGH skyscrapers.
// City lives at (0,0); shifted orbit center keeps planes mostly clear of buildings.
const ORBIT_OFFSET_X     = 8;
const ORBIT_OFFSET_Z     = 0;

let state = null;
let rafHandle = null;
let lastTickMs = 0;
let hudEl = null;

const _now = () => (typeof performance !== "undefined") ? performance.now() : Date.now();
const _dist = (ax, az, bx, bz) => { const dx = bx - ax, dz = bz - az; return Math.sqrt(dx*dx + dz*dz); };
const _yawTo = (fx, fz, tx, tz) => Math.atan2(tx - fx, tz - fz);

function _shortAngle(from, to) {
    let d = to - from;
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    return d;
}

// Low-level entity helpers for projectiles + cars (vehicle parts go via module)
function _spawnPrim(kind, x, y, z, scale, yaw, opts) {
    if (!state?.router?.exec) return null;
    // v771 — optional non-uniform scaling via opts.{scaleX,scaleY,scaleZ}.
    // Lets callers shape obelisks into bombs (tall+narrow), tank shells
    // (uniform small), beams (long+thin), etc. CentipedeManager already
    // does this for beams; the city demo's projectile spawns can too.
    const args = { type: "entity:spawnMesh", assetId: "obelisk", kind, x, y, z, scale, yaw };
    if (opts) {
        if (opts.scaleX != null) args.scaleX = opts.scaleX;
        if (opts.scaleY != null) args.scaleY = opts.scaleY;
        if (opts.scaleZ != null) args.scaleZ = opts.scaleZ;
    }
    try {
        const r = state.router.exec(args);
        return (r?.ok && r.id != null) ? r.id : null;
    } catch { return null; }
}
function _despawn(id) {
    if (id == null || !state?.router?.exec) return;
    try { state.router.exec({ type: "entity:despawn", id }); } catch {}
}
function _move(id, x, y, z, yaw) {
    if (id == null || !state?.router?.exec) return;
    try { state.router.exec({ type: "entity:move", id, x, y, z, yaw }); } catch {}
}

// ---------------------------------------------------------------------
// Building footprints (deterministic from cityPack grid params)
// ---------------------------------------------------------------------
function _buildingFootprints(rows, cols, spacing, center) {
    const halfRows = (rows - 1) / 2;
    const halfCols = (cols - 1) / 2;
    const out = [];
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            out.push({
                x: center.x + (c - halfCols) * spacing,
                z: center.z + (r - halfRows) * spacing,
                radius: 4.5,
            });
        }
    }
    return out;
}

function _avoidanceVector(x, z, buildings) {
    let dx = 0, dz = 0;
    for (const b of buildings) {
        const d = _dist(x, z, b.x, b.z);
        if (d < b.radius + 3 && d > 0.01) {
            const strength = (b.radius + 3 - d) / (b.radius + 3);
            dx -= (b.x - x) / d * strength * 6;
            dz -= (b.z - z) / d * strength * 6;
        }
    }
    return { dx, dz };
}

// ---------------------------------------------------------------------
// Kaiju segments — pull ALL positions from window.centipede.list() so
// projectiles can hit any segment (and split chains by hitting middle)
// ---------------------------------------------------------------------
function _getKaijuSegments() {
    if (!window.centipede?.list || state.outcomeFired || state.kaijuId == null) return [];
    try {
        const rows = window.centipede.list();
        if (!Array.isArray(rows)) return [];
        // Pull our specific chain; ignore others
        const ours = rows.filter(r => r.id === state.kaijuId);
        // If list() returns ONE row per chain with x/z (head pos), we still
        // only get the head. For chains, look for a segments array.
        const segs = [];
        for (const row of ours) {
            if (Array.isArray(row.segments)) {
                for (let i = 0; i < row.segments.length; i++) {
                    const s = row.segments[i];
                    if (typeof s.x === "number" && typeof s.z === "number") {
                        segs.push({ x: s.x, y: s.y ?? 0, z: s.z, isHead: i === 0, segIdx: i, chainId: row.id });
                    }
                }
            } else if (typeof row.x === "number" && typeof row.z === "number") {
                // Fallback: row IS the head
                segs.push({ x: row.x, y: row.y ?? 0, z: row.z, isHead: true, segIdx: 0, chainId: row.id });
            }
        }
        return segs;
    } catch { return []; }
}

// ---------------------------------------------------------------------
// Raycast: prev→curr line segment vs each kaiju-segment sphere.
// Returns first segment hit (or null) using earliest t parameter.
// ---------------------------------------------------------------------
function _raycastVsSegments(prevX, prevZ, curX, curZ, segments) {
    const dx = curX - prevX, dz = curZ - prevZ;
    const len2 = dx * dx + dz * dz;
    if (len2 < 1e-6) return null;
    let bestT = Infinity;
    let bestSeg = null;
    for (const seg of segments) {
        const r = seg.isHead ? HEAD_HIT_RADIUS : SEGMENT_HIT_RADIUS;
        // Project (seg - prev) onto direction, clamped to [0, 1]
        const ex = seg.x - prevX, ez = seg.z - prevZ;
        let t = (ex * dx + ez * dz) / len2;
        if (t < 0) t = 0; else if (t > 1) t = 1;
        const px = prevX + dx * t, pz = prevZ + dz * t;
        const d = _dist(px, pz, seg.x, seg.z);
        if (d < r && t < bestT) { bestT = t; bestSeg = seg; }
    }
    return bestSeg;
}

function _damageKaiju(segment, damage) {
    const before = state.kaijuHP;
    state.kaijuHP = Math.max(0, state.kaijuHP - damage);
    const dealt = before - state.kaijuHP;
    // v757 — floating damage number at the hit location (purple for kaiju)
    if (segment) {
        _showDamage(segment.x, (segment.y ?? 0) + 2.5, segment.z, dealt, "#ff66cc", "-");
    }
    // If we hit a non-head segment with substantial damage, occasionally
    // split the chain at that segment to reward accuracy.
    if (segment && !segment.isHead && damage >= 2 && Math.random() < 0.5) {
        try { window.centipede.hit?.(state.kaijuId, segment.segIdx); } catch {}
    }
    if (!state.outcomeFired && state.kaijuHP <= 0) {
        state.outcomeFired = true;
        // v757 — final-blow flash
        if (segment) _showDamage(segment.x, (segment.y ?? 0) + 3.5, segment.z, "✗", "#ffffff", "");
        try { window.centipede.clear(); } catch {}
        state.kaijuId = null;
        _showOutcome("CITY DEFENDED 🛡", true);
        console.log("[cityAttack] WIN — kaiju destroyed");
    }
}

// ---------------------------------------------------------------------
// Civilian car
// ---------------------------------------------------------------------
function _spawnCar(x, z) {
    const yaw = Math.random() * Math.PI * 2;
    const id = _spawnPrim(CAR_KIND, x, 0.3, z, 0.28, yaw);
    if (id == null) return null;
    return {
        id, x, y: 0.3, z, yaw,
        targetX: (Math.random() - 0.5) * 50,
        targetZ: (Math.random() - 0.5) * 50,
        speed: 5 + Math.random() * 2,
        nextRetargetMs: _now() + 5000 + Math.random() * 3000,
    };
}

function _updateCar(car, dt, kaijuX, kaijuZ) {
    const fleeing = _dist(car.x, car.z, kaijuX, kaijuZ) < FLEE_RADIUS;
    let tgtX, tgtZ;
    if (fleeing) {
        // Run away from kaiju along outward vector (no road-following while panicking)
        const dx = car.x - kaijuX, dz = car.z - kaijuZ;
        const d = Math.max(0.01, Math.sqrt(dx*dx + dz*dz));
        tgtX = car.x + (dx / d) * 30;
        tgtZ = car.z + (dz / d) * 30;
    } else {
        // v758 — road-aware target selection. If we have a current waypoint
        // and haven't arrived, drive toward it. Otherwise pick a new
        // waypoint adjacent to the current node (so cars actually FOLLOW
        // roads instead of cutting corners).
        const arrived = _dist(car.x, car.z, car.targetX, car.targetZ) < 3;
        if (arrived || _now() >= car.nextRetargetMs) {
            const next = _pickNextRoadWaypoint(car);
            if (next) {
                car.targetX = next.x;
                car.targetZ = next.z;
                car._currentNodeIdx = next.idx;
            }
            car.nextRetargetMs = _now() + 15000;   // long timeout — usually we retarget on arrival
        }
        tgtX = car.targetX; tgtZ = car.targetZ;
    }
    car.yaw += _shortAngle(car.yaw, _yawTo(car.x, car.z, tgtX, tgtZ)) * Math.min(1, dt * 3);
    const sp = fleeing ? car.speed * 2 : car.speed;
    let nx = car.x + Math.sin(car.yaw) * sp * dt;
    let nz = car.z + Math.cos(car.yaw) * sp * dt;
    const av = _avoidanceVector(nx, nz, state.buildings);
    nx += av.dx * dt; nz += av.dz * dt;
    car.x = nx; car.z = nz;
    _move(car.id, car.x, car.y, car.z, car.yaw);
}

// v758 — road waypoint network. cityPack lays roads at the gaps between
// building grid cells. For a 4×4 city at spacing 14, that yields a
// 5×5 lattice of road intersections at z=±21, ±7, 0 (wait — spacing is
// 14, half-rows is 1.5, so cells run at -21,-7,7,21 for rows=4).
// Intersections sit BETWEEN cells, i.e. at the midpoints: -14, 0, +14
// and the outer edge -28, +28. We generate a 5×5 lattice.
function _generateRoadWaypoints(rows, cols, spacing, center) {
    const out = [];
    const halfRows = (rows - 1) / 2;
    const halfCols = (cols - 1) / 2;
    // Lattice extends slightly past building edges (rows+1 lines × cols+1 lines)
    for (let r = 0; r <= rows; r++) {
        for (let c = 0; c <= cols; c++) {
            const x = center.x + (c - halfCols - 0.5) * spacing;
            const z = center.z + (r - halfRows - 0.5) * spacing;
            out.push({ x, z, idx: out.length, gridR: r, gridC: c });
        }
    }
    return out;
}

function _pickNextRoadWaypoint(car) {
    if (!state.roadGrid || state.roadGrid.length === 0) return null;
    // Find nearest current node — if undefined, find closest
    let curIdx = car._currentNodeIdx;
    if (curIdx == null) {
        let bestD2 = Infinity;
        for (const node of state.roadGrid) {
            const dx = node.x - car.x, dz = node.z - car.z;
            const d2 = dx*dx + dz*dz;
            if (d2 < bestD2) { bestD2 = d2; curIdx = node.idx; }
        }
    }
    if (curIdx == null) return null;
    const cur = state.roadGrid[curIdx];
    // Adjacent nodes: cells at gridR ± 1 or gridC ± 1 (no diagonals)
    const adj = state.roadGrid.filter(n =>
        (n.gridR === cur.gridR && Math.abs(n.gridC - cur.gridC) === 1) ||
        (n.gridC === cur.gridC && Math.abs(n.gridR - cur.gridR) === 1)
    );
    if (adj.length === 0) return null;
    // Pick random adjacent (no backtracking unless dead-end)
    const choices = adj.filter(n => n.idx !== car._lastNodeIdx);
    const next = (choices.length > 0 ? choices : adj)[Math.floor(Math.random() * (choices.length || adj.length))];
    car._lastNodeIdx = curIdx;
    return next;
}

// ---------------------------------------------------------------------
// Planes — patrol high above, dive-bomb periodically
// ---------------------------------------------------------------------
function _buildPatrolPlane(angle0) {
    const r = 55, h = 18;
    // v756 — orbit center tilted off the city so planes don't intersect skyscrapers
    const cx = ORBIT_OFFSET_X, cz = ORBIT_OFFSET_Z;
    const plane = buildPlane(state.router, cx + Math.sin(angle0) * r, h, cz + Math.cos(angle0) * r, { yaw: angle0 });
    if (!plane) return null;
    return {
        plane,
        orbitAngle: angle0,
        orbitRadius: r,
        cruiseHeight: h,
        diving: false,
        diveTargetY: 0,
        nextBombMs: _now() + 4000 + Math.random() * 3000,
        hp: PLANE_MAX_HP,   // v756 — anti-air kaiju attacks can damage
    };
}

function _updatePlane(p, dt, kaijuPos) {
    p.orbitAngle += dt * 0.35;
    // v756 — orbit around offset center so planes don't fly through skyscrapers
    const cx = ORBIT_OFFSET_X, cz = ORBIT_OFFSET_Z;
    const tx = cx + Math.sin(p.orbitAngle) * p.orbitRadius;
    const tz = cz + Math.cos(p.orbitAngle) * p.orbitRadius;
    p.plane.yaw = p.orbitAngle + Math.PI / 2;
    p.plane.x = tx;
    p.plane.z = tz;
    p.plane.y = p.cruiseHeight + Math.sin(_now() * 0.001) * 0.6;
    updatePlaneTransform(state.router, p.plane);

    // Drop a bomb periodically over the kaiju
    if (!state.outcomeFired && _now() >= p.nextBombMs) {
        // Only drop if we're roughly above the kaiju (within ~25 units laterally)
        if (_dist(p.plane.x, p.plane.z, kaijuPos.x, kaijuPos.z) < 25) {
            const drop = planeDropPoint(p.plane);
            // v771 — bomb mesh differentiation. Elongated capsule shape
            // (3× taller than wide) so plane bombs visually read as
            // bombs, not just black cubes. Tank shells stay uniform.
            const bid = _spawnPrim(PROJ_KIND_PLANE, drop.x, drop.y, drop.z, 0.18, 0, {
                scaleX: 0.10, scaleY: 0.30, scaleZ: 0.10,
            });
            if (bid != null) {
                // Bombs go straight down with slight forward inertia
                state.projectiles.push({
                    id: bid, kind: "plane",
                    x: drop.x, y: drop.y, z: drop.z,
                    prevX: drop.x, prevZ: drop.z,
                    vx: Math.sin(p.plane.yaw) * 4, vz: Math.cos(p.plane.yaw) * 4,
                    vy: -PLANE_BOMB_SPEED * 0.5,
                    bornMs: _now(),
                    damage: 3,
                });
            }
            p.nextBombMs = _now() + 6000 + Math.random() * 4000;
        } else {
            // Not in position — try again sooner
            p.nextBombMs = _now() + 1200;
        }
    }
}

// ---------------------------------------------------------------------
// HUD + outcome banner
// ---------------------------------------------------------------------
function _createHud() {
    if (hudEl) return;
    hudEl = document.createElement("div");
    Object.assign(hudEl.style, {
        position: "fixed", left: "12px", top: "12px", zIndex: "99500",
        padding: "10px 14px", background: "rgba(8, 14, 22, 0.78)",
        color: "#a0d0ff", font: "13px ui-monospace, Menlo, Consolas, monospace",
        borderRadius: "6px", border: "1px solid #1a3a5a",
        minWidth: "220px", pointerEvents: "none",
        boxShadow: "0 4px 18px rgba(0,0,0,0.5)",
    });
    hudEl.innerHTML = "<div id='ca-l1'></div><div id='ca-l2'></div><div id='ca-l3'></div>";
    document.body.appendChild(hudEl);
}

function _updateHud() {
    if (!hudEl || !state) return;
    const elapsed = ((_now() - state.startedMs) / 1000).toFixed(1);
    const hp = state.kaijuHP;
    const bar = "█".repeat(Math.max(0, Math.floor(hp / KAIJU_MAX_HP * 20))) +
                "░".repeat(20 - Math.max(0, Math.floor(hp / KAIJU_MAX_HP * 20)));
    const color = hp > KAIJU_MAX_HP / 2 ? "#7fff7f" : hp > KAIJU_MAX_HP / 4 ? "#ffcc66" : "#ff6666";
    const l1 = document.getElementById("ca-l1");
    const l2 = document.getElementById("ca-l2");
    const l3 = document.getElementById("ca-l3");
    if (l1) l1.innerHTML = `<b>KAIJU ATTACKS CITY</b> · t=${elapsed}s`;
    if (l2) l2.innerHTML = `Kaiju HP: <span style="color:${color};">${bar}</span> ${hp}/${KAIJU_MAX_HP}`;
    if (l3) {
        let tankHpSum = 0; for (const t of state.tanks) tankHpSum += (t.hp ?? TANK_MAX_HP);
        let planeHpSum = 0; for (const p of state.planes) planeHpSum += (p.hp ?? PLANE_MAX_HP);
        // v760 — when hunt mode is active, prioritize the kill count + mode banner
        const huntInfo = state._huntMode ? ` 🪲 HUNT eaten=${state._eatCount}` : "";
        l3.textContent = `Tanks:${state.tanks.length}(hp=${tankHpSum}) Planes:${state.planes.length}(hp=${planeHpSum}) Cars:${state.cars.length} Peds:${state.pedestrians.length} Proj:${state.projectiles.length}${huntInfo}`;
    }
}

function _destroyHud() {
    if (hudEl) { try { hudEl.remove(); } catch {} hudEl = null; }
}

function _showOutcome(text, isWin) {
    const banner = document.createElement("div");
    Object.assign(banner.style, {
        position: "fixed", left: "50%", top: "40%", transform: "translate(-50%, -50%)",
        zIndex: "99600", padding: "26px 48px",
        background: isWin ? "rgba(40, 80, 30, 0.92)" : "rgba(100, 30, 30, 0.92)",
        color: isWin ? "#dfffd8" : "#ffd0d0",
        font: "bold 28px ui-monospace, Menlo, Consolas, monospace",
        borderRadius: "10px",
        border: "2px solid " + (isWin ? "#7fff7f" : "#ff7f7f"),
        textAlign: "center", letterSpacing: "0.05em",
        boxShadow: "0 8px 40px rgba(0,0,0,0.6)",
    });
    banner.innerHTML = `${text}<div style="font-size:13px; margin-top:10px; opacity:0.85;">cityAttack.reset() to play again</div>`;
    document.body.appendChild(banner);
    setTimeout(() => { try { banner.remove(); } catch {} }, 6500);
}

// ---------------------------------------------------------------------
// Main tick
// ---------------------------------------------------------------------
function _tick() {
    if (!state) return;
    const now = _now();
    const dt = Math.min(0.1, (now - lastTickMs) / 1000);
    lastTickMs = now;

    // Kaiju segments + head position
    const segments = _getKaijuSegments();
    let kaijuPos = state.kaijuLastPos;
    const head = segments.find(s => s.isHead) || segments[0];
    if (head) {
        kaijuPos = { x: head.x, z: head.z };
        state.kaijuLastPos = kaijuPos;
    }

    // Lose check
    if (!state.outcomeFired && _dist(kaijuPos.x, kaijuPos.z, 0, 0) < KAIJU_LOSE_RADIUS) {
        state.outcomeFired = true;
        _showOutcome("CITY DESTROYED 💥", false);
        console.log("[cityAttack] LOSE — kaiju reached city center");
    }
    // v756 — additional lose condition: all defenders eliminated
    if (!state.outcomeFired && state.tanks.length === 0 && state.planes.length === 0 && state.kaijuHP > 0) {
        state.outcomeFired = true;
        _showOutcome("DEFENDERS WIPED 💀", false);
        console.log("[cityAttack] LOSE — all tanks and planes destroyed");
    }

    // Tanks
    for (const tank of state.tanks) {
        // Independent turret aim toward kaiju
        const desiredTurretYaw = _yawTo(tank.x, tank.z, kaijuPos.x, kaijuPos.z);
        tank.turretYaw += _shortAngle(tank.turretYaw, desiredTurretYaw) * Math.min(1, dt * 4.5);

        // Hull yaw lags (slower than turret) — looks more tank-like
        tank.yaw += _shortAngle(tank.yaw, desiredTurretYaw) * Math.min(1, dt * 1.8);

        const dist = _dist(tank.x, tank.z, kaijuPos.x, kaijuPos.z);
        if (dist > 18 && !state.outcomeFired) {
            let nx = tank.x + Math.sin(tank.yaw) * 4.5 * dt;
            let nz = tank.z + Math.cos(tank.yaw) * 4.5 * dt;
            const av = _avoidanceVector(nx, nz, state.buildings);
            nx += av.dx * dt; nz += av.dz * dt;
            tank.x = nx; tank.z = nz;
        }
        updateTankTransform(state.router, tank);

        if (!state.outcomeFired && dist < 50 && now >= tank._nextFireMs) {
            const muzzle = tankMuzzle(tank);
            const dx = kaijuPos.x - muzzle.x, dz = kaijuPos.z - muzzle.z;
            const d = Math.max(0.001, Math.sqrt(dx*dx + dz*dz));
            const pid = _spawnPrim(PROJ_KIND_TANK, muzzle.x, muzzle.y, muzzle.z, 0.12, tank.turretYaw);
            if (pid != null) {
                state.projectiles.push({
                    id: pid, kind: "tank",
                    x: muzzle.x, y: muzzle.y, z: muzzle.z,
                    prevX: muzzle.x, prevZ: muzzle.z,
                    vx: (dx / d) * TANK_PROJ_SPEED,
                    vz: (dz / d) * TANK_PROJ_SPEED,
                    vy: 0,
                    bornMs: now,
                    damage: 1,
                });
            }
            tank._nextFireMs = now + 1800 + Math.random() * 900;
        }
    }

    // Planes
    for (const p of state.planes) _updatePlane(p, dt, kaijuPos);

    // Projectiles — raycast hit detection vs ALL kaiju segments
    state.projectiles = state.projectiles.filter(p => {
        p.prevX = p.x; p.prevZ = p.z;
        p.x += p.vx * dt; p.z += p.vz * dt;
        if (p.vy != null) p.y += p.vy * dt;

        _move(p.id, p.x, p.y, p.z, _yawTo(0, 0, p.vx || 0, p.vz || 0));

        const lifetime = now - p.bornMs;
        const lifeMax = p.kind === "plane" ? PLANE_BOMB_LIFE_MS
                       : p.kind === "kaiju" ? KAIJU_PROJ_LIFE_MS
                       : p.kind === "beam_bead" ? 250
                       : p.kind === "beam_line" ? 250      // v758 — single beam
                       : p.kind === "aoe_particle" ? 600
                       : TANK_PROJ_LIFE_MS;
        // v757/v758 — beam visuals + AoE particles are pure cosmetics, no hit.
        if (p.kind === "beam_bead" || p.kind === "aoe_particle" || p.kind === "beam_line") {
            // v758 — fade-out via vy decay (AoE particles sink as they age)
            if (p.lifeFade && p.kind === "aoe_particle") {
                p.vy *= 0.93;
                p.vy -= 8 * dt;
                p.vx *= 0.96; p.vz *= 0.96;
            }
            // v759 — TRUE scale-fade via entity:rescale. Particles visibly
            // shrink to zero before despawn instead of vanishing suddenly.
            if (p.lifeFade && state.router?.exec) {
                const tProg = lifetime / lifeMax;
                const factor = Math.max(0, 1 - tProg);
                const init = p.initScale ?? 0.18;
                try {
                    if (p.kind === "beam_line") {
                        // Beam line keeps Z-stretch but X/Y shrink + slight Z taper
                        state.router.exec({
                            type: "entity:rescale", id: p.id,
                            scaleX: init * factor,
                            scaleY: init * factor,
                            scaleZ: (p.beamLen ?? init) * Math.max(0.4, factor),
                        });
                    } else {
                        state.router.exec({
                            type: "entity:rescale", id: p.id,
                            scaleX: init * factor,
                            scaleY: init * factor,
                            scaleZ: init * factor,
                        });
                    }
                } catch {}
            }
            if (lifetime > lifeMax) { _despawn(p.id); return false; }
            return true;
        }

        // Kaiju projectile — proximity hit, damages tanks/planes by kind
        if (p.kind === "kaiju") {
            // Check tanks first
            for (let ti = state.tanks.length - 1; ti >= 0; ti--) {
                const tank = state.tanks[ti];
                if (_dist(p.x, p.z, tank.x, tank.z) < 2.5) {
                    tank.hp = (tank.hp ?? TANK_MAX_HP) - 1;
                    _showDamage(tank.x, 2.2, tank.z, 1, "#cc66ff", "-");   // v757 purple incoming
                    _despawn(p.id);
                    if (tank.hp <= 0) {
                        _showDamage(tank.x, 3.0, tank.z, "WRECKED", "#ffffff", "");
                        despawnTank(state.router, tank);
                        state.tanks.splice(ti, 1);
                        console.log("[city] tank destroyed by kaiju");
                    }
                    return false;
                }
            }
            // v756 — also check planes (anti-air kaiju attacks come in as p.kind === "kaiju"
            // but originated at y > 0; same proximity test using full 3D distance)
            for (let pi = state.planes.length - 1; pi >= 0; pi--) {
                const pl = state.planes[pi];
                const dx = pl.plane.x - p.x, dy = pl.plane.y - p.y, dz = pl.plane.z - p.z;
                const d3 = Math.sqrt(dx*dx + dy*dy + dz*dz);
                if (d3 < PLANE_HIT_RADIUS) {
                    pl.hp = (pl.hp ?? PLANE_MAX_HP) - 1;
                    _showDamage(pl.plane.x, pl.plane.y + 0.8, pl.plane.z, 1, "#cc66ff", "-");
                    _despawn(p.id);
                    if (pl.hp <= 0) {
                        _showDamage(pl.plane.x, pl.plane.y + 1.6, pl.plane.z, "DOWNED", "#ffffff", "");
                        despawnPlane(state.router, pl.plane);
                        state.planes.splice(pi, 1);
                        console.log("[city] plane shot down by kaiju");
                    }
                    return false;
                }
            }
        }
        // Tank/plane projectile — raycast vs kaiju segments
        else {
            const hit = _raycastVsSegments(p.prevX, p.prevZ, p.x, p.z, segments);
            if (hit) {
                _damageKaiju(hit, p.damage || 1);
                _despawn(p.id);
                return false;
            }
            // Bomb hit ground
            if (p.y != null && p.y < 0.2) {
                _despawn(p.id);
                return false;
            }
        }

        if (lifetime > lifeMax) { _despawn(p.id); return false; }
        return true;
    });

    // Cars
    for (const car of state.cars) _updateCar(car, dt, kaijuPos.x, kaijuPos.z);

    // v757 — pedestrian flock
    updateCivilians(state.router, state.pedestrians, dt, kaijuPos, state.buildings);

    // v758 — poll ProjectileManager projectiles for tank/plane hits.
    // PM projectiles damage civs natively but not our custom tanks. We
    // check distance each tick and apply damage when one passes near a unit.
    if (state._pmActive) {
        const pm = (typeof window !== "undefined") ? window.projectileManager : null;
        if (pm?.projectiles?.size) {
            for (const proj of pm.projectiles.values()) {
                if (proj._kaijuCityChecked && proj._kaijuCityChecked >= now - 100) continue;
                proj._kaijuCityChecked = now;
                const px = proj.x ?? proj.position?.x;
                const pz = proj.z ?? proj.position?.z;
                if (px == null || pz == null) continue;
                // Tank hit check
                for (let ti = state.tanks.length - 1; ti >= 0; ti--) {
                    const tank = state.tanks[ti];
                    if (_dist(px, pz, tank.x, tank.z) < 2.5) {
                        tank.hp = (tank.hp ?? TANK_MAX_HP) - 1;
                        _showDamage(tank.x, 2.2, tank.z, 1, "#cc66ff", "FIRE -");
                        if (tank.hp <= 0) {
                            _showDamage(tank.x, 3.0, tank.z, "WRECKED", "#ffffff", "");
                            despawnTank(state.router, tank);
                            if (tank._kmTarget) _unregisterTarget(tank._kmTarget);
                            state.tanks.splice(ti, 1);
                        }
                        // Force PM projectile to despawn next tick (no kill API
                        // on PM externally, so just mark)
                        proj._cityKilled = true;
                        break;
                    }
                }
            }
        }
    }

    // v757 — Kaiju return fire with ATTACK FAMILY variety. Each fire,
    // pick a random family from { projectile, beam, aoe }. Mirrors the
    // KaijuManager attack-family pattern at small scale; full integration
    // (using KaijuManager._executeProjectileAttack against tank targets)
    // would require registering tanks as kaiju-managed targets, which
    // is a bigger plumbing change deferred to a future round.
    // v759 — skip when CentipedeManager owns attacks (true engine integration)
    if (!state._centipedeOwnsAttacks
        && !state.outcomeFired && state.kaijuId != null && now >= state._kaijuNextFireMs && state.tanks.length > 0) {
        // Pick the closest tank as the focus target
        let nearest = null, bestD = Infinity;
        for (const tank of state.tanks) {
            const d = _dist(tank.x, tank.z, kaijuPos.x, kaijuPos.z);
            if (d < bestD) { bestD = d; nearest = tank; }
        }
        if (nearest && bestD < 60) {
            const family = ["projectile", "beam", "aoe"][Math.floor(Math.random() * 3)];

            if (family === "projectile") {
                // v758 — prefer ProjectileManager for real engine integration
                // (ballistic arc, voxel carve on impact, splash damage to nearby
                // civs). Falls through to demo's self-rolled physics if PM
                // isn't available (e.g. running the demo without a kaiju sim).
                const pm = (typeof window !== "undefined") ? window.projectileManager : null;
                if (pm?.launch) {
                    try {
                        pm.launch({
                            from: { x: kaijuPos.x, y: 3, z: kaijuPos.z },
                            to:   { x: nearest.x, y: 1, z: nearest.z },
                            kind: "fireball",   // PM recognized kind w/ smoke trail
                            scale: 0.6,
                            ownerKaijuId: state.kaijuId,
                            damageMul: 1.0,
                            trail: "smoke",
                        });
                        // Note: PM projectiles damage civs (CivilizationManager) but
                        // do NOT damage tanks — our tanks are not civs. The applyDamage
                        // on tank target descriptors fires when KaijuManager.execute*
                        // attacks pick them via _findRangedTarget, NOT from PM's
                        // splash. So we ALSO run a proximity check in the tick loop
                        // (see PM-projectile-hit detection below).
                        state._pmActive = true;   // signals tick to poll PM projectiles
                    } catch (e) {
                        console.warn("[city] PM launch failed, falling back:", e?.message);
                    }
                } else {
                    // Fallback: existing self-rolled projectile
                    const dx = nearest.x - kaijuPos.x, dz = nearest.z - kaijuPos.z;
                    const d = Math.max(0.001, Math.sqrt(dx*dx + dz*dz));
                    const pid = _spawnPrim(PROJ_KIND_KAIJU, kaijuPos.x, 3, kaijuPos.z, 0.22, 0);
                    if (pid != null) {
                        state.projectiles.push({
                            id: pid, kind: "kaiju",
                            x: kaijuPos.x, y: 3, z: kaijuPos.z,
                            prevX: kaijuPos.x, prevZ: kaijuPos.z,
                            vx: (dx / d) * KAIJU_PROJ_SPEED,
                            vz: (dz / d) * KAIJU_PROJ_SPEED,
                            vy: 2,
                            bornMs: now,
                        });
                    }
                }
            }
            else if (family === "beam") {
                // Instant-damage beam: deal 1 HP to target tank if still alive,
                // then visualize as a SINGLE stretched bar from kaiju head to
                // tank (v758 — proper line render, replaces v757 bead train).
                nearest.hp = (nearest.hp ?? TANK_MAX_HP) - 1;
                _showDamage(nearest.x, 2.4, nearest.z, 1, "#ff66ff", "BEAM ");
                if (nearest.hp <= 0) {
                    _showDamage(nearest.x, 3.2, nearest.z, "WRECKED", "#ffffff", "");
                    despawnTank(state.router, nearest);
                    if (nearest._kmTarget) _unregisterTarget(nearest._kmTarget);
                    const idx = state.tanks.indexOf(nearest);
                    if (idx >= 0) state.tanks.splice(idx, 1);
                    console.log("[city] tank wrecked by kaiju beam");
                }
                // v758 — single line entity, scaled along the beam direction.
                // Position is the midpoint; yaw aligns with the beam vector;
                // scale-Z carries the full beam length (renderer treats obelisk
                // as a unit cube * scale, so this stretches it).
                const dx = nearest.x - kaijuPos.x, dz = nearest.z - kaijuPos.z;
                const len = Math.sqrt(dx*dx + dz*dz);
                const midX = (kaijuPos.x + nearest.x) / 2;
                const midZ = (kaijuPos.z + nearest.z) / 2;
                const midY = 1.5 + (3 - 1.5) / 2;   // line slopes 3 → ~1.5 over the beam length
                const yaw = Math.atan2(dx, dz);
                const beamId = _spawnPrim(PROJ_KIND_BEAM, midX, midY, midZ, len * 0.4, yaw);
                if (beamId != null) {
                    state.projectiles.push({
                        id: beamId, kind: "beam_line",
                        x: midX, y: midY, z: midZ, prevX: midX, prevZ: midZ,
                        vx: 0, vz: 0, vy: 0,
                        bornMs: now,
                        lifeFade: true,
                        initScale: 0.18,
                        beamLen: len * 0.4,   // v759 — preserved Z-stretch for fade-rescale
                    });
                }
                state.beams.push({ t: 0, life: 0.25 });
            }
            else if (family === "aoe") {
                // Slam: deals 1 HP to every tank within 8 units of target
                const slamX = nearest.x, slamZ = nearest.z;
                const SLAM_R = 8;
                for (let ti = state.tanks.length - 1; ti >= 0; ti--) {
                    const tk = state.tanks[ti];
                    if (_dist(tk.x, tk.z, slamX, slamZ) > SLAM_R) continue;
                    tk.hp = (tk.hp ?? TANK_MAX_HP) - 1;
                    _showDamage(tk.x, 2.4, tk.z, 1, "#ff8844", "AOE ");
                    if (tk.hp <= 0) {
                        _showDamage(tk.x, 3.2, tk.z, "WRECKED", "#ffffff", "");
                        despawnTank(state.router, tk);
                        if (tk._kmTarget) _unregisterTarget(tk._kmTarget);
                        state.tanks.splice(ti, 1);
                        console.log("[city] tank wrecked by kaiju AoE slam");
                    }
                }
                // v758 — 12 small particles bursting at slam center; lifeFade
                // tag makes them shrink toward the end of their life
                for (let i = 0; i < 12; i++) {
                    const a = (i / 12) * Math.PI * 2;
                    const r = 0.5 + Math.random() * 2;
                    const px = slamX + Math.cos(a) * r;
                    const pz = slamZ + Math.sin(a) * r;
                    const pid = _spawnPrim(PROJ_KIND_KAIJU, px, 0.4, pz, 0.12, 0);
                    if (pid != null) {
                        state.projectiles.push({
                            id: pid, kind: "aoe_particle",
                            x: px, y: 0.4, z: pz, prevX: px, prevZ: pz,
                            vx: Math.cos(a) * 8, vz: Math.sin(a) * 8,
                            vy: 4,
                            bornMs: now,
                            lifeFade: true,   // v758
                            initScale: 0.12,
                        });
                    }
                }
            }
        }
        state._kaijuNextFireMs = now + KAIJU_FIRE_MIN_MS + Math.random() * (KAIJU_FIRE_MAX_MS - KAIJU_FIRE_MIN_MS);
    }

    // v756 — kaiju anti-air. Slower cadence than ground fire; targets the
    // nearest plane with a leading shot (predicts plane position ~1.5s ahead
    // based on its tangential orbit velocity).
    // v759 — skip when CentipedeManager owns attacks (planes covered via _extraRangedTargets)
    if (!state._centipedeOwnsAttacks
        && !state.outcomeFired && state.kaijuId != null && now >= state._kaijuNextAAMs && state.planes.length > 0) {
        let nearest = null, bestD = Infinity;
        for (const pl of state.planes) {
            const d = _dist(pl.plane.x, pl.plane.z, kaijuPos.x, kaijuPos.z);
            if (d < bestD) { bestD = d; nearest = pl; }
        }
        if (nearest && bestD < 80) {
            // Lead the plane by its tangential velocity × prediction time
            const orbitVel = nearest.orbitRadius * 0.35;   // ω × r
            const tangentX =  Math.cos(nearest.orbitAngle) * orbitVel;
            const tangentZ = -Math.sin(nearest.orbitAngle) * orbitVel;
            const leadX = nearest.plane.x + tangentX * 1.5;
            const leadZ = nearest.plane.z + tangentZ * 1.5;
            const leadY = nearest.plane.y;
            const dx = leadX - kaijuPos.x, dy = leadY - 3, dz = leadZ - kaijuPos.z;
            const d3 = Math.max(0.001, Math.sqrt(dx*dx + dy*dy + dz*dz));
            const pid = _spawnPrim(PROJ_KIND_KAIJU, kaijuPos.x, 3, kaijuPos.z, 0.24, 0);
            if (pid != null) {
                state.projectiles.push({
                    id: pid, kind: "kaiju",
                    x: kaijuPos.x, y: 3, z: kaijuPos.z,
                    prevX: kaijuPos.x, prevZ: kaijuPos.z,
                    vx: (dx / d3) * KAIJU_AA_SPEED,
                    vz: (dz / d3) * KAIJU_AA_SPEED,
                    vy: (dy / d3) * KAIJU_AA_SPEED + 1,
                    bornMs: now,
                });
            }
        }
        state._kaijuNextAAMs = now + KAIJU_AA_MIN_MS + Math.random() * (KAIJU_AA_MAX_MS - KAIJU_AA_MIN_MS);
    }

    // Fly-through camera
    if (state.fly.active && window.camera?.position) {
        state.fly.t += dt;
        const angle = (state.fly.t / state.fly.period) * Math.PI * 2;
        const r = state.fly.radius;
        window.camera.position.x = Math.sin(angle) * r;
        window.camera.position.y = state.fly.height;
        window.camera.position.z = Math.cos(angle) * r;
        window.camera.yaw = angle + Math.PI;
        window.camera.pitch = -0.35;
    }

    _updateHud();
    rafHandle = requestAnimationFrame(_tick);
}

// ---------------------------------------------------------------------
const TANK_SPAWNS = [
    { x:  20, z: -18 }, { x:  28, z:  10 },
    { x:   0, z:  28 }, { x: -18, z:  12 },
    { x:  18, z:  -6 },
];

export default {
    id: "kaiju_attacks_city",
    label: "KAIJU ATTACKS CITY (tanks + planes return fire)",
    hint:  "Kaiju walks toward city. Tanks drive up; planes dive-bomb; kaiju fires back. Win at HP=0, lose at city-center.",
    isolation: "exclusive",
    displayOrder: 5,
    controls: [
        `Auto — builds city, spawns kaiju (HP=${KAIJU_MAX_HP}), 5 tanks, 2 planes, 6 cars`,
        "Phone Demos tab — 🎥 Fly through · ⊕ Add tank · ♻ Reset",
        "Console: cityAttack.spawnPlane() / spawnKaiju(n) / stats()",
        "Win — destroy kaiju (HP=0); Lose — kaiju reaches city center",
    ],

    async start() {
        const stage = window._stage;
        if (stage) try { stage.enter({ floor: true }); } catch {}
        if (!window.router) { console.warn("[city] router not ready"); return; }
        if (!window.city?.build || !window.centipede?.spawn) {
            console.warn("[city] city or centipede manager not ready");
            return;
        }

        const cityRows = 4, cityCols = 4, spacing = 14;
        const center = { x: 0, z: 0 };

        state = {
            router:    window.router,
            buildings: _buildingFootprints(cityRows, cityCols, spacing, center),
            roadGrid:  _generateRoadWaypoints(cityRows, cityCols, spacing, center),   // v758
            kaijuId:   null,
            kaijuHP:   KAIJU_MAX_HP,
            kaijuLastPos: { x: -50, z: 0 },
            tanks:    [],
            planes:   [],
            cars:     [],
            pedestrians: [],
            projectiles: [],
            beams: [],
            fly: { active: false, t: 0, period: 24, radius: 70, height: 40 },
            outcomeFired: false,
            startedMs: _now(),
            _kaijuNextFireMs: _now() + 4000,
            _kaijuNextAAMs:   _now() + 7000,
            // v760 — hunt mode state. When true, centipede chases pedestrians
            // and eats them instead of attacking tanks. Combat is disabled.
            _huntMode:    false,
            _eatCount:    0,
            _eatRecentMs: 0,
        };

        try { await window.city.build({ rows: cityRows, cols: cityCols, spacing, center }); }
        catch (e) { console.warn("[city] build failed:", e?.message); }

        try { state.kaijuId = window.centipede.spawn(8, -50, 0); }
        catch (e) { console.warn("[city] kaiju spawn failed:", e?.message); }

        // v759 — enable centipede attack delegation. Now the centipede
        // fires through the engine's ProjectileManager (real ballistic
        // physics + voxel carve), with native beam + AoE visuals via
        // entity:rescale-driven scale fade. Replaces the demo's own
        // ad-hoc projectile spawning.
        try {
            window.centipede.setAttackPolicy?.({
                enabled: true,
                fireInterval: [3000, 5500],
                fireRange: 60,
                // v767 — round 30. Mix of named attacks from the registry
                // so each centipede shot has visual + behavioral variety.
                // The registry overrides fireInterval/range per attack, so
                // a meteor (slow but long-range) coexists with acid_spit
                // (rapid but short). Drop names from this list to make
                // the centipede stick to specific attacks for testing.
                families: ["fireball", "magic_orb", "laser", "radiation", "flamethrower", "lightning"],
                beamDamage: 1,
                aoeDamage: 1,
                aoeRadius: 8,
            });
            state._centipedeOwnsAttacks = true;
            console.log("[city] centipede attack delegation enabled (round 30 attack mix)");
        } catch (e) {
            state._centipedeOwnsAttacks = false;
            console.warn("[city] centipede delegation unavailable; using demo's own attacks");
        }

        for (const p of TANK_SPAWNS) {
            const tank = buildTank(state.router, p.x, p.z);
            if (tank) {
                tank._nextFireMs = _now() + 1000 + Math.random() * 1000;
                tank.hp = TANK_MAX_HP;
                state.tanks.push(tank);
            }
        }

        // Two patrol planes on opposite sides of the orbit
        const p1 = _buildPatrolPlane(0);
        const p2 = _buildPatrolPlane(Math.PI);
        if (p1) state.planes.push(p1);
        if (p2) state.planes.push(p2);

        for (let i = 0; i < 6; i++) {
            // v758 — spawn on a random road waypoint so cars start on the road network
            const node = state.roadGrid[Math.floor(Math.random() * state.roadGrid.length)];
            const c = _spawnCar(node?.x ?? 0, node?.z ?? 0);
            if (c) {
                c._currentNodeIdx = node?.idx ?? null;
                state.cars.push(c);
            }
        }
        // v757 — tiny civilian pedestrians for scale reference
        state.pedestrians = buildCivilians(state.router, {
            count: 30, area: 38, center,
        });

        // v758 — KaijuManager target hook. Tanks + planes expose their position
        // and an applyDamage callback so any KaijuManager-managed kaiju in the
        // world (including the OGRE-spawned ones if they happen) can target them.
        // The demo's own centipede doesn't go through KaijuManager, but this is
        // the building block: the moment we route the centipede's projectile
        // attacks through KaijuManager._executeProjectileAttack (next round),
        // this hook becomes the connection.
        try {
            window._extraRangedTargets = window._extraRangedTargets || [];
            // Clear any previous demo registration
            window._extraRangedTargets.length = 0;
            for (const tank of state.tanks) _registerTargetFor(tank);
            for (const pl of state.planes) _registerTargetFor(pl, /*isPlane*/ true);
        } catch {}

        if (window.camera?.position) {
            window.camera.position.x = 60;
            window.camera.position.y = 45;
            window.camera.position.z = 60;
            window.camera.yaw = -Math.PI * 0.75;
            window.camera.pitch = -0.45;
        }

        _createHud();
        lastTickMs = _now();
        rafHandle = requestAnimationFrame(_tick);
        console.log(`[city] running — ${state.tanks.length} tanks, ${state.planes.length} planes, ${state.cars.length} cars, HP=${state.kaijuHP}`);

        window.cityAttack = {
            spawnTank: () => {
                const x = -25 + Math.random() * 50;
                const z = -25 + Math.random() * 50;
                const tank = buildTank(state.router, x, z);
                if (tank) {
                    tank._nextFireMs = _now() + 1000;
                    tank.hp = TANK_MAX_HP;
                    state.tanks.push(tank);
                    _registerTargetFor(tank);   // v758
                }
                return tank?.hullId;
            },
            spawnPlane: () => {
                const a = Math.random() * Math.PI * 2;
                const p = _buildPatrolPlane(a);
                if (p) {
                    state.planes.push(p);
                    _registerTargetFor(p, true);   // v758
                }
                return p?.plane?.fuselageId;
            },
            spawnKaiju: (n = 8) => {
                if (state.kaijuId != null) try { window.centipede.clear(); } catch {}
                state.kaijuId = window.centipede.spawn(n, -50, 0);
                state.kaijuHP = KAIJU_MAX_HP;
                state.outcomeFired = false;
                return state.kaijuId;
            },
            flyThrough: () => { state.fly.active = true; state.fly.t = 0; },
            flyStop:    () => { state.fly.active = false; },
            stats: () => {
                const o = { tanks: state.tanks.length, planes: state.planes.length, cars: state.cars.length,
                            projectiles: state.projectiles.length, kaijuHP: state.kaijuHP, kaijuId: state.kaijuId,
                            huntMode: state._huntMode, eaten: state._eatCount };
                console.table(o); return o;
            },
            // v760 — HUNT MODE: centipede chases + eats pedestrians instead of
            // attacking tanks. Attack delegation is disabled; tank/plane fire
            // continues normally so this turns into "watch the centipede pick
            // off civilians while defenders try to take it down."
            enableHuntMode: () => {
                state._huntMode = true;
                try { window.centipede.setAttackPolicy?.({ enabled: false }); } catch {}
                try {
                    window.centipede.setHuntPolicy?.({
                        enabled: true,
                        eatRadius: 1.8,
                        targetProvider: () => state.pedestrians || [],
                        onEat: (ped) => {
                            // Remove this pedestrian from the array + despawn its entity
                            const idx = state.pedestrians.indexOf(ped);
                            if (idx < 0) return;
                            state.pedestrians.splice(idx, 1);
                            try { state.router.exec({ type: "entity:despawn", id: ped.id }); } catch {}
                            state._eatCount++;
                            state._eatRecentMs = _now();
                            _showDamage(ped.x, 1.6, ped.z, "MUNCH", "#ff3366", "");
                            // Brief satisfying particle puff at the eat point
                            for (let i = 0; i < 5; i++) {
                                const a = Math.random() * Math.PI * 2;
                                const r = 0.3 + Math.random() * 0.6;
                                const px = ped.x + Math.cos(a) * r;
                                const pz = ped.z + Math.sin(a) * r;
                                const pid = _spawnPrim(PROJ_KIND_KAIJU, px, 0.3, pz, 0.08, 0);
                                if (pid != null) {
                                    state.projectiles.push({
                                        id: pid, kind: "aoe_particle",
                                        x: px, y: 0.3, z: pz, prevX: px, prevZ: pz,
                                        vx: Math.cos(a) * 4, vz: Math.sin(a) * 4,
                                        vy: 3,
                                        bornMs: _now(),
                                        lifeFade: true,
                                        initScale: 0.08,
                                    });
                                }
                            }
                            // v761 — ALL PEDESTRIANS EATEN outcome banner
                            if (!state.outcomeFired && state.pedestrians.length === 0) {
                                state.outcomeFired = true;
                                _showOutcome(`ALL PEDESTRIANS EATEN 🪲 (${state._eatCount})`, false);
                                console.log(`[city] HUNT outcome — ${state._eatCount} pedestrians eaten`);
                            }
                        },
                    });
                } catch {}
                state._centipedeOwnsAttacks = false;
                console.log("[city] HUNT MODE enabled — centipede chases pedestrians");
            },
            // Restore the v759 attack delegation: centipede shoots at tanks/planes
            enableAttackMode: () => {
                state._huntMode = false;
                try { window.centipede.setHuntPolicy?.({ enabled: false }); } catch {}
                try {
                    window.centipede.setAttackPolicy?.({
                        enabled: true,
                        fireInterval: [3000, 5500],
                        fireRange: 60,
                        // v767 — round 30 attack mix
                        families: ["fireball", "magic_orb", "laser", "radiation", "flamethrower", "lightning"],
                    });
                    state._centipedeOwnsAttacks = true;
                    console.log("[city] ATTACK MODE enabled — centipede attacks defenders");
                } catch {}
            },
            // Toggle between modes
            toggleHuntMode: () => {
                if (state._huntMode) window.cityAttack?.enableAttackMode?.();
                else                 window.cityAttack?.enableHuntMode?.();
            },
            // v759 — Gemini-voxelized GLB swap. Existing vehicles continue
            // using their original assets; cityAttack.reset() rebuilds them
            // with the newly-registered assets.
            useVoxelAssets: async () => {
                const r = await registerVoxelAssets({ verbose: true });
                if (r.ok) console.log("[city] voxel assets registered; cityAttack.reset() to rebuild vehicles with them");
                else console.warn("[city] voxel asset registration failed:", r.reason);
                return r;
            },
            useObeliskAssets: () => {
                resetVoxelAssets();
                console.log("[city] reverted to obelisk primitives; cityAttack.reset() to rebuild");
            },
            reset: () => {
                for (const t of state.tanks) despawnTank(state.router, t);
                for (const p of state.planes) despawnPlane(state.router, p.plane);
                for (const c of state.cars) _despawn(c.id);
                for (const pr of state.projectiles) _despawn(pr.id);
                despawnCivilians(state.router, state.pedestrians);   // v757
                if (state.kaijuId != null) try { window.centipede.clear(); } catch {}
                state.tanks = []; state.planes = []; state.cars = []; state.projectiles = [];
                state.pedestrians = [];
                state.kaijuId = window.centipede.spawn(8, -50, 0);
                state.kaijuHP = KAIJU_MAX_HP;
                state.outcomeFired = false;
                state.startedMs = _now();
                for (const p of TANK_SPAWNS) {
                    const tank = buildTank(state.router, p.x, p.z);
                    tank.hp = TANK_MAX_HP;
                    if (tank) { tank._nextFireMs = _now() + 1000; state.tanks.push(tank); }
                }
                const p1 = _buildPatrolPlane(0), p2 = _buildPatrolPlane(Math.PI);
                if (p1) state.planes.push(p1);
                if (p2) state.planes.push(p2);
                for (let i = 0; i < 6; i++) {
                    const c = _spawnCar((Math.random() - 0.5) * 40, (Math.random() - 0.5) * 40);
                    if (c) state.cars.push(c);
                }
                state.pedestrians = buildCivilians(state.router, { count: 30, area: 38, center: { x: 0, z: 0 } });
                // v758 — re-register tanks/planes as KaijuManager targets
                _clearAllTargets();
                for (const tank of state.tanks) _registerTargetFor(tank);
                for (const pl of state.planes) _registerTargetFor(pl, true);
                // v760 — clear hunt state on reset
                state._eatCount = 0;
                // If hunt mode was enabled, re-install with the new pedestrian array
                if (state._huntMode) window.cityAttack?.enableHuntMode?.();
                console.log("[city] reset complete");
            },
        };
    },

    stop() {
        if (rafHandle != null) { try { cancelAnimationFrame(rafHandle); } catch {} rafHandle = null; }
        if (state) {
            for (const t of state.tanks) despawnTank(state.router, t);
            for (const p of state.planes) despawnPlane(state.router, p.plane);
            for (const c of state.cars) _despawn(c.id);
            for (const pr of state.projectiles) _despawn(pr.id);
            despawnCivilians(state.router, state.pedestrians);
            try { if (state.kaijuId != null) window.centipede.clear(); } catch {}
            try { if (window.city?.clear) window.city.clear(); } catch {}
        }
        _clearAllTargets();
        // v760 — disable hunt policy so a future demo doesn't inherit it
        try { window.centipede?.setHuntPolicy?.({ enabled: false }); } catch {}
        try { window.centipede?.setAttackPolicy?.({ enabled: false }); } catch {}
        try { delete window.cityAttack; } catch {}
        _destroyHud();
        state = null;
        console.log("[city] stopped");
    },
};