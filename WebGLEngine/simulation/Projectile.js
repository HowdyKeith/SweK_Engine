// FILE: simulation/Projectile.js
// VERSION: v1
//
// Single in-flight projectile (a hurled tree, mostly). Owns its own
// physics integration — gravity arc through air, terminates on
// ground hit. Manager wires impact effects (voxel carve + splash
// entity damage).
//
// Lifecycle:
//   * spawned with launch velocity computed by ProjectileManager
//   * tick(delta, world) updates pos + vel; returns:
//       - { state: "alive" }    while in flight
//       - { state: "impact", x, y, z }  on ground hit
//       - { state: "expired" }   if ttl elapses (safety net)

const GRAVITY = 18;                  // m/s² downward
const MAX_TTL = 6.0;                 // safety: no projectile flies > 6s

// Round 82 — global gravity scalar for newly-spawned projectiles when
// no explicit opts.gravityScale is provided. ProjectileManager (or any
// caller) can set this when atmosphere changes — e.g., moon = 0.16,
// deep space = 0.0. Existing in-flight projectiles keep whatever
// scale they were constructed with.
export function setGlobalProjectileGravityScale(s) {
    GRAVITY_SCALE_DEFAULT.value = +s;
}
export function getGlobalProjectileGravityScale() {
    return GRAVITY_SCALE_DEFAULT.value;
}
const GRAVITY_SCALE_DEFAULT = { value: 1.0 };

export class Projectile {
    constructor(id, opts) {
        this.id = id;
        this.position = { x: opts.x, y: opts.y, z: opts.z };
        this.velocity = { x: opts.vx, y: opts.vy, z: opts.vz };

        this.kind = opts.kind ?? "tree_oak";   // mesh asset for in-flight render
        this.scale = opts.scale ?? 1.5;
        this.ownerKaijuId = opts.ownerKaijuId ?? null;
        this.targetEntityId = opts.targetEntityId ?? null;

        this.age = 0;
        this.alive = true;

        // Round 82 — per-projectile gravity scale. Defaults to whatever
        // the global default is at spawn time. Allows atmosphere code
        // to flip moon-gravity globally without each spawn site knowing.
        // Pass opts.gravityScale to override (0 = no gravity).
        this.gravityScale = (opts.gravityScale != null)
            ? +opts.gravityScale
            : GRAVITY_SCALE_DEFAULT.value;

        // Round 81 — tumble. Hurled projectiles get random initial
        // angular velocity proportional to launch speed, then integrate
        // it over the flight as orientation (yaw, tiltX, tiltZ). Sells
        // the cinematic scale — a kaiju-hurled pine that flies vertically
        // the whole way looks fake; a tumbling one sells the throw.
        //
        // Caller can override the spin via opts.spin = { yaw, tilt, roll }
        // (rad/s on each axis), or pass opts.noTumble = true to suppress
        // (e.g., for laser bolts that shouldn't rotate). Default is
        // randomized based on launch speed.
        if (opts.noTumble) {
            this.angVelYaw = 0;
            this.angVelTilt = 0;
            this.angVelRoll = 0;
        } else if (opts.spin) {
            this.angVelYaw  = opts.spin.yaw  ?? 0;
            this.angVelTilt = opts.spin.tilt ?? 0;
            this.angVelRoll = opts.spin.roll ?? 0;
        } else {
            // Launch energy → spin energy. Faster throw, more tumble.
            const speed = Math.hypot(this.velocity.x, this.velocity.y, this.velocity.z);
            const spinScale = 0.06 * speed;          // ~1.2 rad/s per 20 m/s
            this.angVelYaw  = (Math.random() - 0.5) * 2 * spinScale;
            this.angVelTilt = (Math.random() - 0.5) * 2 * spinScale;
            this.angVelRoll = (Math.random() - 0.5) * 2 * spinScale;
        }
        // Orientation accumulators. Start randomized so projectiles in
        // a volley don't all visually sync up.
        this.yaw   = Math.random() * Math.PI * 2;
        this.tiltX = (Math.random() - 0.5) * 0.3;
        this.tiltZ = (Math.random() - 0.5) * 0.3;

        // Ground-collision skin — projectile registers impact when y
        // would drop below the terrain top. Manager queries world for
        // terrain, so projectile's own collision is just safety-net
        // (y < -10).
        this._floor = -10;
    }

    tick(delta, world) {
        if (!this.alive) return { state: "expired" };
        this.age += delta;
        if (this.age > MAX_TTL) {
            this.alive = false;
            return { state: "expired" };
        }

        // Integrate
        this.position.x += this.velocity.x * delta;
        this.position.y += this.velocity.y * delta;
        this.position.z += this.velocity.z * delta;
        this.velocity.y -= GRAVITY * this.gravityScale * delta;

        // Round 81 — tumble. Accumulate orientation from angular velocity.
        // Mild air drag (0.5%/s) bleeds spin so projectiles aren't
        // spinning when they land. Drag is intentionally weak — over a
        // 2-second flight the angular velocity drops only ~1%, keeping
        // tumble visually constant during flight.
        this.yaw   += this.angVelYaw  * delta;
        this.tiltX += this.angVelTilt * delta;
        this.tiltZ += this.angVelRoll * delta;
        const angDrag = Math.max(0, 1 - 0.005 * delta);
        this.angVelYaw  *= angDrag;
        this.angVelTilt *= angDrag;
        this.angVelRoll *= angDrag;

        // Ground collision via world terrain top scan
        if (world && (world.voxelAt || world.getVoxel)) {
            const get = world.voxelAt
                ? (xx, yy, zz) => world.voxelAt(xx, yy, zz)
                : (xx, yy, zz) => world.getVoxel(xx, yy, zz);
            const cx = Math.floor(this.position.x);
            const cy = Math.floor(this.position.y);
            const cz = Math.floor(this.position.z);
            // If current cell is solid, projectile has impacted
            const v = get(cx, cy, cz);
            if (v !== undefined && v !== 0) {
                this.alive = false;
                return {
                    state: "impact",
                    x: this.position.x, y: this.position.y, z: this.position.z,
                };
            }
        }

        // Hard floor safety
        if (this.position.y < this._floor) {
            this.alive = false;
            return {
                state: "impact",
                x: this.position.x, y: 0, z: this.position.z,
            };
        }

        return { state: "alive" };
    }
}
