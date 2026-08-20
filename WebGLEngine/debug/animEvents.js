// FILE: debug/animEvents.js
// VERSION: v1 - round 53
//
// Tiny event bus for animation events. Animators emit via their
// onEvent callback; subscribers register via window.animEvents.on().
//
// Event shape on the bus:
//   ("attack_release", { entityId, time, clipName, data })
//
// Wildcard subscription: name "*" gets every event with a third
// argument carrying the original name. Useful for debug logging.
//
// Two subscribers wired by default:
//   1. Console log on "*" (debug)
//   2. Particle burst on "muzzle_flash" (visible feedback for the
//      test rig's fire clip)

class EventBus {
    constructor() {
        this._listeners = new Map();    // name -> Set<fn>
    }
    on(name, fn) {
        let set = this._listeners.get(name);
        if (!set) {
            set = new Set();
            this._listeners.set(name, set);
        }
        set.add(fn);
        return () => set.delete(fn);
    }
    off(name, fn) {
        const set = this._listeners.get(name);
        if (set) set.delete(fn);
    }
    emit(name, ctx) {
        const direct = this._listeners.get(name);
        if (direct) {
            for (const fn of direct) {
                try { fn(ctx); } catch (e) { console.warn(`[animEvents] "${name}" listener failed:`, e); }
            }
        }
        const wild = this._listeners.get("*");
        if (wild) {
            for (const fn of wild) {
                try { fn(name, ctx); } catch (e) { console.warn(`[animEvents] "*" listener failed:`, e); }
            }
        }
    }
}

// Round 53 - mount the bus + default subscribers.
export function installAnimEvents(env = {}) {
    const bus = new EventBus();
    window.animEvents = bus;

    // Default: debug log every event at low volume. Toggleable via
    // window.animEvents.verbose = true/false (silent by default to
    // avoid spamming the console at 60fps for footstep-heavy clips).
    bus.verbose = false;
    bus.on("*", (name, ctx) => {
        if (!bus.verbose) return;
        console.log(`[animEvents] ${name}`, ctx);
    });

    // Default: spawn a small particle burst on "muzzle_flash" at the
    // entity's position. Hooks the test rig's fire clip; any other
    // entity with that event in any clip gets the same visual feedback.
    if (env.particles?.spawn && env.ecs && env.ecsTypes?.Position) {
        bus.on("muzzle_flash", (ctx) => {
            const pos = env.ecs.getComponent(ctx.entityId, env.ecsTypes.Position);
            if (!pos) return;
            for (let n = 0; n < 12; n++) {
                const a = Math.random() * Math.PI * 2;
                const speed = 3 + Math.random() * 4;
                env.particles.spawn({
                    x: pos.x, y: pos.y + 1.5, z: pos.z,
                    vx: Math.cos(a) * speed, vy: 1.5 + Math.random() * 2, vz: Math.sin(a) * speed,
                    ttl: 0.3, size: 0.45,
                    r: 1.0, g: 0.85, b: 0.45, a: 1.0,
                    gravity: 6,
                });
            }
        });

        // Round 53 - footstep events get a tiny ground puff. Cheap.
        bus.on("footstep", (ctx) => {
            const pos = env.ecs.getComponent(ctx.entityId, env.ecsTypes.Position);
            if (!pos) return;
            for (let n = 0; n < 4; n++) {
                const a = Math.random() * Math.PI * 2;
                env.particles.spawn({
                    x: pos.x + Math.cos(a) * 0.3,
                    y: pos.y + 0.05,
                    z: pos.z + Math.sin(a) * 0.3,
                    vx: Math.cos(a) * 0.6, vy: 0.4, vz: Math.sin(a) * 0.6,
                    ttl: 0.4, size: 0.18,
                    r: 0.65, g: 0.55, b: 0.45, a: 0.55,
                    gravity: 1.2,
                });
            }
        });

        // Round 53 - projectile_release: emit a damage projectile in the
        // direction the entity is facing. Synced to the attack clip's
        // wind-up so the projectile spawns at the "release" frame, not
        // at clip start. For the test rig (and any other entity that
        // has a yaw + this event), this visually demonstrates clip-
        // synced gameplay actions.
        bus.on("projectile_release", (ctx) => {
            const pos = env.ecs.getComponent(ctx.entityId, env.ecsTypes.Position);
            if (!pos) return;
            const render = env.ecs.getComponent(ctx.entityId, env.ecsTypes.Render);
            const yaw = render?.yaw ?? 0;
            const fwdX = Math.sin(yaw), fwdZ = Math.cos(yaw);
            for (let n = 0; n < 6; n++) {
                env.particles.spawn({
                    x: pos.x + fwdX * 0.5, y: pos.y + 1.8, z: pos.z + fwdZ * 0.5,
                    vx: fwdX * (8 + Math.random() * 2),
                    vy: 0.5,
                    vz: fwdZ * (8 + Math.random() * 2),
                    ttl: 0.6, size: 0.35,
                    r: 0.9, g: 0.4, b: 0.95, a: 1.0,
                });
            }
        });
    }

    console.log("[animEvents] bus ready. window.animEvents.verbose = true to log every event.");
    return bus;
}
