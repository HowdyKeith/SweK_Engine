// WebGLEngine/ev/shots.js — pure weapon-firing and projectile simulation for the EV-compatible engine. No WebGL,
// no DOM. The flight view feeds it dt + a "firing" flag + the ship state + (optionally) a target; it returns new
// shots and advances/culls the live ones. EV time fields are in frames (~30fps); shot Speed shares the ship Speed
// field's units, so a shot's world velocity is weapon.speed * speedScale (the ship's speedScale) added to the
// ship's velocity.
//
// Weapon behavior is driven by the wëap Guidance field. Verified against the EV Nova Bible + community docs:
//   -1 unguided (dumbfire, travels straight), 0 guided (homing — steers toward the target), 1 beam.
// The Guidance >= 2 family is the turret / point-defense / swivel group, which all auto-aim; we treat them
// uniformly as "turret" (the shot is aimed at the target at fire time, then travels straight) until the exact
// sub-types are verified on a rig. Homing turn-rate uses a sane default until the wëap Turn field is decoded.
//
// Milestone 5d.

const EV_FPS = 30;
const DEFAULT_HOMING_TURN = 220;   // deg/sec, until the wëap Turn field is decoded

// Map a wëap Guidance value to a shot behavior.
function weaponBehavior(guidance) {
    const g = guidance == null ? -1 : guidance;
    if (g === 1) return "beam";
    if (g === 0) return "homing";
    if (g >= 2) return "turret";
    return "unguided";
}

function weaponTiming(weapon) {
    const beam = weaponBehavior(weapon.guidance) === "beam";
    return {
        interval: Math.max(0.03, (weapon.reload || 30) / EV_FPS),   // seconds between shots
        life: beam ? 0.12 : Math.max(0.1, (weapon.count || 30) / EV_FPS),   // shot lifetime, seconds (beams are brief)
        speed: Math.max(1, weapon.speed || 0),                      // field units (= ship Speed units)
    };
}

// heading (deg, 0 = up, +y down) pointing from `from` toward `to`.
function aimHeading(from, to) {
    const a = Math.atan2(to.x - from.x, -(to.y - from.y)) * 180 / Math.PI;
    return (a % 360 + 360) % 360;
}

// Spawn one shot from a ship firing a weapon. Inherits the ship's velocity (EV launches shots relative to the ship)
// plus the weapon speed along the firing heading. heading 0 = up; world +y down -> dir = (sin, -cos). A turret aims
// at opts.target; a beam launches fast and brief; a homing shot records its speed + turn rate so stepShots can steer.
function createShot(ship, weapon, speedScale = 1, opts = {}) {
    const t = weaponTiming(weapon), kind = weaponBehavior(weapon.guidance), target = opts.target || null;
    let headingDeg = ship.heading || 0;
    if (kind === "turret" && target) headingDeg = aimHeading(ship, target);
    const a = headingDeg * Math.PI / 180;
    let sp = t.speed * speedScale;
    if (kind === "beam") sp *= 4;
    const vx = (ship.vx || 0) + Math.sin(a) * sp, vy = (ship.vy || 0) + (-Math.cos(a)) * sp;
    const shot = {
        x: ship.x, y: ship.y, vx, vy,
        life: t.life, dmgArmor: weapon.massDmg || 0, dmgShield: weapon.energyDmg || 0, kind,
    };
    if (kind === "homing") { shot.spd = Math.hypot(vx, vy); shot.turn = (weapon.turn || DEFAULT_HOMING_TURN); }
    if (kind === "beam") shot.beam = true;
    return shot;
}

// Advance all shots by dt, drop the expired, and drop any that reach a stellar (recording an impact point). Homing
// shots steer toward the nearest live OPPOSING target (from `targets`, each tagged with a team), keeping their speed.
// Returns a new array (does not mutate the inputs). hitRadius is in world units.
function stepShots(shots, dt, spobs, hitRadius = 60, targets = null) {
    const out = [], impacts = [];
    for (const s of shots) {
        const life = s.life - dt;
        if (life <= 0) continue;
        let vx = s.vx, vy = s.vy;
        if (s.kind === "homing" && targets && targets.length) {
            let best = null, bd = Infinity;
            for (const tg of targets) {
                if (tg.dead) continue;
                if (s.team && tg.team && tg.team === s.team) continue;   // don't home on your own team
                const dx = tg.x - s.x, dy = tg.y - s.y, d = dx * dx + dy * dy;
                if (d < bd) { bd = d; best = tg; }
            }
            if (best) {
                const cur = Math.atan2(vx, -vy) * 180 / Math.PI;
                let diff = ((aimHeading(s, best) - cur) % 360 + 360) % 360; if (diff > 180) diff -= 360;
                const maxTurn = (s.turn || DEFAULT_HOMING_TURN) * dt;
                const na = (cur + Math.max(-maxTurn, Math.min(maxTurn, diff))) * Math.PI / 180;
                const spd = s.spd || Math.hypot(vx, vy);
                vx = Math.sin(na) * spd; vy = -Math.cos(na) * spd;
            }
        }
        const x = s.x + vx * dt, y = s.y + vy * dt;
        let hit = false;
        if (spobs) for (const p of spobs) { const dx = p.x - x, dy = p.y - y; if (dx * dx + dy * dy <= hitRadius * hitRadius) { hit = true; impacts.push({ x, y }); break; } }
        if (hit) continue;
        out.push(Object.assign({}, s, { x, y, vx, vy, life }));
    }
    return { shots: out, impacts };
}

// Per-slot reload clocks. tick() returns the shots spawned this frame. target (optional) is aimed at by turrets and
// seeded into homing shots.
class FireControl {
    constructor(loadout) { this.loadout = loadout || []; this.cool = this.loadout.map(() => 0); }
    tick(dt, firing, ship, speedScale = 1, target = null) {
        const spawned = [];
        for (let i = 0; i < this.loadout.length; i++) {
            if (this.cool[i] > 0) this.cool[i] = Math.max(0, this.cool[i] - dt);
            if (firing && this.cool[i] <= 0) {
                const w = this.loadout[i].weapon;
                spawned.push(createShot(ship, w, speedScale, { target }));
                this.cool[i] = weaponTiming(w).interval;
            }
        }
        return spawned;
    }
    get armedNames() { return this.loadout.map((l) => l.weapon.name).filter(Boolean); }
    get armed() { return this.loadout.length > 0; }
}

export { weaponTiming, weaponBehavior, aimHeading, createShot, stepShots, FireControl, EV_FPS };
