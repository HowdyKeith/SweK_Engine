# demos_code/ — drop-in demo modules

Drop a `.js` file in this folder and it appears in the DEMO dropdown
(the LCARS orange button at the top of the canvas) the next time you
click the ↻ refresh icon — or on the next page load.

This is the "code demo" half of the engine's demo system. The
companion `demos/` folder takes `.json` files for declarative scene
snapshots (camera pose, voxel writes, entity spawns). This folder is
for demos that need actual code — custom UI, per-frame logic, AI,
physics, anything beyond a camera pose.

## Contract

Each `.js` file in this folder must `export default` an object with
this shape:

```js
export default {
    id:    "pinball",                       // unique identifier
    label: "PINBALL",                       // shown in dropdown
    hint:  "tilt the world to score",       // optional one-liner
    category: "Home Assistant",             // optional — puts the demo in a named menu
                                            // section (e.g. its own HA group); untagged demos stay under "Addons"
    controls: [                              // optional control list
        "Mouse — aim flippers",              // shown when ? key pressed
        "Space — launch ball",
    ],

    // Called when this demo becomes active. ctx exposes the engine.
    start(ctx) { /* ... */ },

    // Called when leaving this demo. Clean up your state.
    stop(ctx)  { /* ... */ },

    // Called every frame while active. dt is seconds since last tick.
    tick(ctx, dt) { /* ... */ },
};
```

All three lifecycle methods are optional. A demo with only `start` is
fine if it just sets up a scene and lets the main game loop run.

## Engine context — two tiers

`ctx` exposes the engine in **two tiers**. Use blessed unless you
have to reach for raw.

### Tier 1 — Blessed (stable, addon-safe)

These verbs are designed for addon authors and survive engine
refactors. Prefer them.

| call | what it does |
|---|---|
| `ctx.spawnMesh(kind, x, y, z, scale?)` | Spawn a procedural-mesh entity. Returns id (number) or null. Kinds: `"ogre_demon"`, `"ogre_hp_weapon"`, `"alien"`, etc. — see `render/entityVisuals.js` |
| `ctx.despawnEntity(id)` | Remove a previously-spawned entity. Returns bool |
| `ctx.spawnParticle({x,y,z,vx,vy,vz,ttl,size,r,g,b,a,gravity})` | Spawn a single billboard particle. All fields optional |
| `ctx.kpop` | KPop bridge client. `ctx.kpop.success(title, msg)`, `.info()`, `.error()`, `.warn()`, `.speak({Voice:"M1"\|"M2", Text})`. Safe to call even when KPop is disabled |
| `ctx.palChat.generate(context)` | Trigger Ollama-driven M1↔M2 dialogue about `context`. Speaks via System.Speech. No-ops when PalChat disabled |
| `ctx.palChat.isEnabled()` | Bool — PalChat currently on |
| `ctx.playSfx(name, x?, y?, z?)` | Play named SFX. Spatial if x/y/z provided. Common names: `"hit"`, `"highlight"` |
| `ctx.getSurfaceY(x, z)` | Read terrain surface height at world XZ. Returns number or null |
| `ctx.getVoxel(x, y, z)` | Read voxel material at world XYZ. Returns number or null |
| `ctx.getOgre()` | Snapshot of active OGRE: `{x,y,z,hp,maxHp,state,variantKey,variantName}` or null. Frozen — don't mutate |
| `ctx.getCrewState()` | Snapshot of crew stations: `[{id,state,hpPct}]`. Empty when no OGRE active |
| `ctx.lookAt(x, y, z)` | Smooth-cut camera to look at position. Doesn't seize control |
| `ctx.rand()` `ctx.randRange(lo,hi)` `ctx.randInt(lo,hi)` | Convenience randoms |

### Tier 2 — Raw (power user)

Direct access to engine subsystems. Surface may change between
versions; pin your demo to a specific engine release if you use these.

| key | type |
|---|---|
| `world` | `VoxelWorld` |
| `renderer` | `VoxelRenderer` |
| `camera` | `Camera` |
| `router` | `CommandRouter` |
| `bridge` | `WSBridge` |
| `particles` | `ParticleSystem` |
| `persistence` | `WorldPersistence` |
| `audio` | `AudioManager` |
| `toaster` | `Toaster` |
| `ecsWorld` | `ECSWorld` |
| `skyRenderer` | `SkyRenderer` |
| `weatherSystem` | `WeatherSystem` |

### Example — blessed-only

```js
export default {
    id:    "fireworks",
    label: "FIREWORKS",
    start(ctx) {
        ctx.kpop.info("Fireworks demo", "Watch the sky!");
        this._t = 0;
    },
    tick(ctx, dt) {
        this._t += dt;
        if (this._t > 0.4) {
            this._t = 0;
            const x = ctx.randRange(-30, 30);
            const z = ctx.randRange(-30, 30);
            const y = (ctx.getSurfaceY(x, z) ?? 0) + 20;
            for (let i = 0; i < 30; i++) {
                ctx.spawnParticle({
                    x, y, z,
                    vx: ctx.randRange(-4, 4),
                    vy: ctx.randRange(2, 6),
                    vz: ctx.randRange(-4, 4),
                    ttl: 1.2, size: 0.6,
                    r: ctx.rand(), g: ctx.rand(), b: ctx.rand(), a: 1,
                    gravity: 4,
                });
            }
            ctx.playSfx("hit", x, y, z);
        }
    },
};
```

## Lifecycle

1. **Page load**: every `.js` file in this folder is fetched, then
   `import()`-ed via dynamic import. The default export is wrapped
   and appended to the engine's `DEMO_MODES` array.
2. **Activated**: when the user clicks your demo's row in the
   dropdown, `start(ctx)` is called.
3. **Per frame**: `tick(ctx, dt)` is called from the main render loop.
4. **Deactivated**: when the user switches to another demo,
   `stop(ctx)` is called.
5. **Refresh**: clicking ↻ on the dropdown re-fetches the folder
   listing and re-imports everything with a cache-busting query
   param. Edit a file in place, click ↻, see changes without reload.

## Errors

If your module throws during `import()`, the engine logs to the
browser console and skips it. The rest of the engine keeps running.
If `start()` throws, you'll see the error in the console; switching
to a different demo recovers.

`tick()` errors are caught per-frame so a buggy demo doesn't kill
the engine — but expect framerate impact if your tick throws every
frame.

## See also

- `pinball.js` — original demo, uses tier-1 + tier-2 mix
- `credits.js` — pure tier-1 example using KPop toasts + particles
