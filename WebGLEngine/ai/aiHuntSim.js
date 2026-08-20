// FILE: ai/aiHuntSim.js
// VERSION: v1 — round 72
//
// Self-hosted multi-agent hunt simulation. Lives entirely in the brain
// page. No VBA, no bridge. Spawns N synthetic agents on the currently
// loaded WAD (or a fallback box if none), each one hunts the nearest
// other agent with line-of-sight gated targeting. Hitscan fire, health
// pools, deaths, optional auto-respawn.
//
// Why this lives separately from aiBrain.js: the brain's existing
// state machine + heatmap + threat-line renderer are written around
// the VBA single-player model (one player, N enemies, enemies target
// the player). The hunt sim is N-vs-N — agents target each other.
// Different topology, different decide loop, different render path
// for threat lines. Sharing one file would invite mode-conditional
// branches everywhere; better to expose a few hooks.
//
// Integration contract (called from aiBrain.js):
//   simIsActive()        → bool
//   simDecideTick()      → run per 250ms decide tick (replaces aiTick)
//   simStepFrame(dtSec)  → run per render frame for physics integration
//   simStateForRender()  → returns a { player, enemies, ... } shape for
//                          the existing renderer to consume
//   simExtraRender(ctx, toC, dpr) → fire flashes, kill counters, etc.
//                                   that the standard renderer doesn't
//                                   know about
//   simSync(wadMap, wadScale, thinkFn, aiState) → injected each frame
//                                                  (cheap; just rebinds)

const SPAWN_COUNT      = 6;
const AGENT_RADIUS     = 1.0;     // brain world units
const AGENT_HEALTH     = 3;
const AGENT_SPEED      = 4.0;     // u/s when seeking
const AGENT_ATTACK_SPD = 1.5;     // u/s when in attack range (slower; strafing-ish)
const AGENT_TURN_RATE  = 3.5;     // rad/s
const ATTACK_DIST      = 8;       // bigger than VBA-mode (4) — ranged combat
const SEEK_DIST        = 30;
const FIRE_COOLDOWN_MS = 700;
const MAX_FIRE_RANGE   = 28;
const AIM_TOLERANCE    = 0.30;    // radians
const RESPAWN_DELAY_MS = 2500;
const FIRE_FLASH_MS    = 180;
const FALLBACK_HALF    = 30;      // half-extent for no-WAD spawn box

let active = false;
let agents = [];
let kills  = 0;
let nextId = 1;
let respawnAt   = 0;
let fireFlashes = [];   // [{ fromX, fromZ, toX, toZ, t, hit }]

// Injected once per frame from aiBrain.js so this module doesn't import
// from there (avoids a circular dep and keeps everything narrow).
let _wadMap   = null;
let _wadScale = 1;
let _think    = () => {};
let _aiState  = null;

export function simSync({ wadMap, wadScale, thinkFn, aiState }) {
    _wadMap   = wadMap;
    _wadScale = wadScale;
    _think    = thinkFn || _think;
    _aiState  = aiState;
}

export function simIsActive() { return active; }
export function simAgentCount() { return agents.length; }
export function simKills() { return kills; }

export function simSetActive(on) {
    active = !!on;
    if (active) {
        simSpawn();
    } else {
        if (_aiState) {
            for (const a of agents) _aiState.delete(a.id);
        }
        agents = [];
        fireFlashes = [];
        respawnAt = 0;
    }
}

// Spawn `count` agents in random open positions. Uses WAD bounds if a
// map is loaded, else a fixed box around origin. Rejects spawns too
// close to walls (so agents don't start stuck).
export function simSpawn(count = SPAWN_COUNT) {
    agents = [];
    kills  = 0;
    fireFlashes = [];
    respawnAt = 0;
    nextId = 1;
    if (_aiState) _aiState.clear();

    let minX, maxX, minZ, maxZ;
    if (_wadMap) {
        minX = _wadMap.bounds.minX * _wadScale;
        maxX = _wadMap.bounds.maxX * _wadScale;
        minZ = _wadMap.bounds.minY * _wadScale;
        maxZ = _wadMap.bounds.maxY * _wadScale;
    } else {
        minX = -FALLBACK_HALF; maxX = FALLBACK_HALF;
        minZ = -FALLBACK_HALF; maxZ = FALLBACK_HALF;
    }

    let attempts = 0;
    const maxAttempts = count * 80;
    while (agents.length < count && attempts < maxAttempts) {
        attempts++;
        const x = minX + Math.random() * (maxX - minX);
        const z = minZ + Math.random() * (maxZ - minZ);
        if (isBlocked(x, z, AGENT_RADIUS * 2.0)) continue;
        // Also ensure clear from other spawned agents
        let tooClose = false;
        for (const o of agents) {
            const ddx = o.x - x, ddz = o.z - z;
            if (ddx * ddx + ddz * ddz < 9) { tooClose = true; break; }   // 3u min spacing
        }
        if (tooClose) continue;
        const id = nextId++;
        const hue = (id * 71) % 360;
        agents.push({
            id, x, z,
            yaw: Math.random() * Math.PI * 2,
            desiredYaw: Math.random() * Math.PI * 2,
            state: "idle",
            targetId: null,
            health: AGENT_HEALTH,
            color: `hsl(${hue}, 80%, 62%)`,
            lastFireMs: 0,
            kills: 0,
        });
    }
    _think(`sim: spawned ${agents.length} agents`, "info");
}

// Wall collision: point inside `radius` of any one-sided linedef. We
// ignore two-sided lines (passages, sector boundaries) — agents walk
// freely through them. Linedef verts are in WAD units, so multiply by
// wadScale to match agent coords.
function isBlocked(x, z, radius) {
    if (!_wadMap) return false;
    const verts = _wadMap.vertices;
    const lines = _wadMap.lines;
    const r2 = radius * radius;
    for (let i = 0; i < lines.length; i += 3) {
        if (lines[i + 2] !== 0) continue;
        const v1 = lines[i], v2 = lines[i + 1];
        const x1 = verts[v1 * 2]     * _wadScale;
        const z1 = verts[v1 * 2 + 1] * _wadScale;
        const x2 = verts[v2 * 2]     * _wadScale;
        const z2 = verts[v2 * 2 + 1] * _wadScale;
        // Closest point on segment to (x, z)
        const dx = x2 - x1, dz = z2 - z1;
        const len2 = dx * dx + dz * dz;
        if (len2 < 1e-6) continue;
        let t = ((x - x1) * dx + (z - z1) * dz) / len2;
        if (t < 0) t = 0; else if (t > 1) t = 1;
        const px = x1 + t * dx, pz = z1 + t * dz;
        const ex = x - px, ez = z - pz;
        if (ex * ex + ez * ez < r2) return true;
    }
    return false;
}

// Line of sight between two world points. Same wall set as isBlocked
// (one-sided lines only block sight). Two-sided lines are "low walls"
// for our purposes — visually they're passages, so vision passes.
function hasLOS(ax, az, bx, bz) {
    if (!_wadMap) return true;
    const verts = _wadMap.vertices;
    const lines = _wadMap.lines;
    for (let i = 0; i < lines.length; i += 3) {
        if (lines[i + 2] !== 0) continue;
        const v1 = lines[i], v2 = lines[i + 1];
        const cx = verts[v1 * 2]     * _wadScale;
        const cz = verts[v1 * 2 + 1] * _wadScale;
        const dx = verts[v2 * 2]     * _wadScale;
        const dz = verts[v2 * 2 + 1] * _wadScale;
        if (segIntersect(ax, az, bx, bz, cx, cz, dx, dz)) return false;
    }
    return true;
}

function segIntersect(ax, ay, bx, by, cx, cy, dx, dy) {
    const d1x = bx - ax, d1y = by - ay;
    const d2x = dx - cx, d2y = dy - cy;
    const denom = d1x * d2y - d1y * d2x;
    if (Math.abs(denom) < 1e-9) return false;
    const tx = ((cx - ax) * d2y - (cy - ay) * d2x) / denom;
    const ty = ((cx - ax) * d1y - (cy - ay) * d1x) / denom;
    return tx > 0 && tx < 1 && ty > 0 && ty < 1;
}

function wrapPi(a) {
    while (a >  Math.PI) a -= Math.PI * 2;
    while (a < -Math.PI) a += Math.PI * 2;
    return a;
}

// Decide tick — 250ms. For each agent: pick the nearest other agent
// with LOS (or fallback to nearest blind), update state by distance,
// fire if attack-state + aimed + cooled-down.
export function simDecideTick() {
    if (!active) return;
    const now = performance.now();

    // Respawn if we've collapsed to ≤1 agent
    if (agents.length <= 1) {
        if (respawnAt === 0) {
            respawnAt = now + RESPAWN_DELAY_MS;
            _think(`sim: round over (${kills} kills) — respawning in ${RESPAWN_DELAY_MS}ms`, "info");
        } else if (now >= respawnAt) {
            simSpawn();
        }
        return;
    }
    respawnAt = 0;

    for (const a of agents) {
        // Find nearest other agent — prefer LOS, fall back to blind
        let visBest = null, visBestD = Infinity;
        let anyBest = null, anyBestD = Infinity;
        for (const b of agents) {
            if (b.id === a.id) continue;
            const dx = b.x - a.x, dz = b.z - a.z;
            const d = Math.hypot(dx, dz);
            if (d < anyBestD) { anyBestD = d; anyBest = b; }
            if (hasLOS(a.x, a.z, b.x, b.z) && d < visBestD) { visBestD = d; visBest = b; }
        }
        const target = visBest || anyBest;
        const dist   = visBest ? visBestD : anyBestD;
        const haveLOS = !!visBest;
        a.targetId = target ? target.id : null;

        // State machine — same hysteresis pattern as the VBA-mode AI.
        // Without LOS, never escalate to attack (would shoot through walls).
        let newState = a.state;
        if (newState === "idle") {
            if (dist < SEEK_DIST) newState = "seek";
        } else if (newState === "seek") {
            if (dist > SEEK_DIST * 1.3) newState = "idle";
            else if (haveLOS && dist < ATTACK_DIST) newState = "attack";
        } else if (newState === "attack") {
            if (!haveLOS || dist > ATTACK_DIST * 1.5) newState = "seek";
        }

        if (newState !== a.state) {
            _think(`sim #${a.id} ${a.state} → ${newState}${target ? ` (#${target.id} @ ${dist.toFixed(1)}u${haveLOS ? "" : ", blind"})` : ""}`,
                newState === "attack" ? "attack" :
                newState === "seek"   ? "seek"   : "idle");
        }
        a.state = newState;

        // Desired yaw: face the target. In attack, jitter slightly so
        // agents strafe-ish around their aim line (more dynamic look).
        if (target) {
            const baseYaw = Math.atan2(target.z - a.z, target.x - a.x);
            a.desiredYaw = newState === "attack"
                ? baseYaw + Math.sin(now * 0.004 + a.id) * 0.18
                : baseYaw;
        }

        // Fire decision
        if (newState === "attack" && target && haveLOS &&
            now - a.lastFireMs > FIRE_COOLDOWN_MS &&
            dist < MAX_FIRE_RANGE) {
            const aimErr = Math.abs(wrapPi(a.desiredYaw - a.yaw));
            if (aimErr < AIM_TOLERANCE) {
                fire(a, target);
                a.lastFireMs = now;
            }
        }

        // Mirror into _aiState so the existing renderer picks state colors
        if (_aiState) {
            _aiState.set(a.id, {
                state: a.state,
                target: a.targetId,
                desiredYaw: a.desiredYaw,
                dist,
                lastDecisionMs: now,
            });
        }
    }
}

function fire(from, to) {
    to.health -= 1;
    fireFlashes.push({
        fromX: from.x, fromZ: from.z,
        toX:   to.x,   toZ:   to.z,
        t: performance.now(),
        hit: true,
    });
    if (to.health <= 0) {
        from.kills += 1;
        kills += 1;
        _think(`sim #${from.id} killed #${to.id} (${from.kills} kills)`, "attack");
        agents = agents.filter(x => x.id !== to.id);
        if (_aiState) _aiState.delete(to.id);
    }
}

// Per-frame physics integration. Yaw smoothing + axis-decomposed move
// (try X, then Z, with wall checks each axis). Keeps agents from
// sliding into walls but lets them slip along walls when partially
// blocked. Cheaper than full continuous collision.
export function simStepFrame(dt) {
    if (!active) return;
    // Clamp dt to avoid huge jumps on tab-resume
    if (dt > 0.1) dt = 0.1;

    for (const a of agents) {
        const yawDiff = wrapPi(a.desiredYaw - a.yaw);
        const yawStep = AGENT_TURN_RATE * dt;
        if (Math.abs(yawDiff) <= yawStep) a.yaw = a.desiredYaw;
        else a.yaw += Math.sign(yawDiff) * yawStep;

        let speed = 0;
        if (a.state === "seek")        speed = AGENT_SPEED;
        else if (a.state === "attack") speed = AGENT_ATTACK_SPD;
        // idle: stand still

        if (speed > 0) {
            const vx = Math.cos(a.yaw) * speed;
            const vz = Math.sin(a.yaw) * speed;
            const newX = a.x + vx * dt;
            if (!isBlocked(newX, a.z, AGENT_RADIUS)) a.x = newX;
            const newZ = a.z + vz * dt;
            if (!isBlocked(a.x, newZ, AGENT_RADIUS)) a.z = newZ;
        }
    }

    // Expire fire flashes
    const now = performance.now();
    for (let i = fireFlashes.length - 1; i >= 0; i--) {
        if (now - fireFlashes[i].t > FIRE_FLASH_MS) fireFlashes.splice(i, 1);
    }
}

// Synthesize a state shape the existing brain renderer understands.
// Player is null (no human in a sim). Enemies carry the per-agent
// fields plus a `targetId` so the renderer can draw agent→agent
// threat lines instead of the default enemy→player.
export function simStateForRender() {
    if (!active) return null;
    return {
        tick: 0,
        t_ms: performance.now(),
        player: null,
        enemies: agents.map(a => ({
            id: a.id,
            x: a.x, z: a.z,
            yaw: a.yaw,
            color: a.color,
            health: a.health,
            targetId: a.targetId,
        })),
        events: [],
    };
}

// Extras the standard renderer doesn't know about:
//   - fire-flash hit lines (white→red gradient, decay over 180ms)
//   - per-agent health pips and kill count next to their dot
//   - agent→agent threat lines colored by state
//   - "round over" overlay during respawn delay
export function simExtraRender(ctx, toC, dpr, cx, cy) {
    if (!active) return;
    const now = performance.now();

    // Agent→target threat lines (instead of the standard enemy→player)
    for (const a of agents) {
        if (a.targetId == null) continue;
        const tgt = agents.find(x => x.id === a.targetId);
        if (!tgt) continue;
        const p1 = toC(a.x, a.z);
        const p2 = toC(tgt.x, tgt.z);
        const stateAlpha = a.state === "attack" ? 0.85
                        : a.state === "seek"   ? 0.45
                        :                          0.15;
        const stateColor = a.state === "attack" ? "rgba(255,80,80,"
                        :  a.state === "seek"   ? "rgba(255,153,51,"
                        :                          "rgba(94,200,255,";
        ctx.strokeStyle = stateColor + stateAlpha + ")";
        ctx.lineWidth = a.state === "attack" ? 1.5 : 1;
        ctx.setLineDash(a.state === "attack" ? [] : [4, 4]);
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();
        ctx.setLineDash([]);
    }

    // Fire flashes — bright pulse from shooter to target that fades fast.
    // Used to show the hitscan event visually; the actual damage already
    // landed in fire(). Color shifts red→white→transparent over the TTL.
    for (const f of fireFlashes) {
        const age = now - f.t;
        const k = 1 - age / FIRE_FLASH_MS;
        if (k <= 0) continue;
        const a = toC(f.fromX, f.fromZ);
        const b = toC(f.toX,   f.toZ);
        ctx.strokeStyle = `rgba(255, 245, 200, ${k * 0.9})`;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
        // Impact flash at the target
        ctx.fillStyle = `rgba(255, 220, 120, ${k * 0.7})`;
        ctx.beginPath();
        ctx.arc(b.x, b.y, 5 + (1 - k) * 4, 0, Math.PI * 2);
        ctx.fill();
    }

    // Per-agent health pips + id + kills label
    ctx.font = `${9 * dpr}px monospace`;
    ctx.textAlign = "left";
    for (const a of agents) {
        const p = toC(a.x, a.z);
        // Health pips (3 dots, lit if alive)
        for (let i = 0; i < AGENT_HEALTH; i++) {
            ctx.fillStyle = i < a.health ? "rgba(120, 255, 140, 0.8)" : "rgba(60, 60, 60, 0.5)";
            ctx.beginPath();
            ctx.arc(p.x - 6 + i * 4, p.y - 14, 1.5, 0, Math.PI * 2);
            ctx.fill();
        }
        // Kill count tag
        if (a.kills > 0) {
            ctx.fillStyle = "rgba(255, 200, 120, 0.9)";
            ctx.fillText(`★${a.kills}`, p.x + 9, p.y - 8);
        }
    }

    // Round-over overlay
    if (respawnAt > 0) {
        const sec = Math.max(0, (respawnAt - now) / 1000);
        ctx.fillStyle = "rgba(0, 0, 0, 0.45)";
        ctx.fillRect(0, cy / 2 - 40 * dpr, cx, 80 * dpr);
        ctx.fillStyle = "rgba(255, 220, 120, 0.95)";
        ctx.textAlign = "center";
        ctx.font = `${20 * dpr}px monospace`;
        const winnerLabel = agents.length === 1 ? `#${agents[0].id} WINS` : "DRAW";
        ctx.fillText(winnerLabel, cx / 2, cy / 2 - 4 * dpr);
        ctx.font = `${11 * dpr}px monospace`;
        ctx.fillStyle = "rgba(220, 230, 255, 0.7)";
        ctx.fillText(`respawn in ${sec.toFixed(1)}s · ${kills} total kills`,
            cx / 2, cy / 2 + 18 * dpr);
    }
}
