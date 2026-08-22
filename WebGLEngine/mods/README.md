# VoxelEngine Mods

Drop a `.json` file in this folder to extend the engine. Reload the
page (browser refresh) and the mod is loaded automatically.

The Asset menu (right rail → Assets tab) shows what loaded.

---

## Mod types

### `kaiju_kind` — define a new kaiju kind

```json
{
    "type": "kaiju_kind",
    "name": "frost",
    "config": {
        "origin": "frozen wastes",
        "moveSpeed": 3.0,
        "scale": 3.5,
        "color": [0.70, 0.85, 1.00],
        "bobAmpl": 0.25,
        "spawnFallSpeed": 12,
        "spawnLandY": 24,
        "damageMul": 0.85,
        "maxLifetime": 110,
        "debrisVoxel": 1,
        "eruptRing": false
    }
}
```

Field reference:

| Field             | Default         | Description |
|-------------------|-----------------|-------------|
| `origin`          | (name)          | Narrative origin word ("hell", "the void", "frozen wastes") |
| `moveSpeed`       | 4.0             | World units per second when seeking |
| `scale`           | 3.0             | Visual marker scale + entity radius |
| `color`           | [1, 0.8, 0.4]   | RGB tint for marker (0..1 floats) |
| `bobAmpl`         | 0.3             | Bob animation amplitude |
| `spawnFallSpeed`  | 18              | Vertical speed when falling/rising into world (signed: + falls, - rises) |
| `spawnLandY`      | 22              | Y where spawn animation completes |
| `damageMul`       | 1.0             | Damage multiplier vs base 0.10/tick |
| `maxLifetime`     | 90              | Seconds before natural death |
| `debrisVoxel`     | 1               | Voxel id for biome scatter trail (1=stone, 12=lava, 30=memory, 10=water) |
| `eruptRing`       | false           | If true, spawn carves a ring of `debrisVoxel` at land position |

Once registered, the kind enters the random spawn rotation. You can also force-summon it via the Kaiju panel.

### `megastructure` — replace a civ style's monument

```json
{
    "type": "megastructure",
    "civStyle": "tower",
    "name": "Crystal Spire",
    "voxels": [
        {"dx": 0, "dy": 0, "dz": 0, "mat": 1},
        ...
    ]
}
```

| Field      | Description |
|-----------|-------------|
| `civStyle` | Which civ style to apply this to: `tower`, `step_pyramid`, `ring_wall`, `plaza`, `spire_field` |
| `name`     | Display name (shown in Civs panel + narrative) |
| `voxels`   | Array of `{dx, dy, dz, mat}` placements relative to base. Material ids: 1=stone, 2=dirt, 3=grass, 4=sand, 10=water, 12=lava, 30=memory (glows) |

### `asset_override` — pre-bind an asset at startup

```json
{
    "type": "asset_override",
    "default": "kaiju_sky",
    "asset": "obelisk"
}
```

Equivalent to picking from the Asset menu's dropdown for the `kaiju_sky` row, but applied automatically every load. Useful for distributing a mod pack with assets + bindings.

### `tree_kind` — register a new tree variant

```json
{
    "type": "tree_kind",
    "name": "tree_birch",
    "color": [0.85, 0.90, 0.75]
}
```

Doesn't yet hook into TreeSpawner (which still picks oak/palm by surface) — but registers the fallback color so any future tree placement of this name renders correctly without a GLB.

### `kaiju_attack` — define or bind a kaiju ranged attack (round 30)

Two flavors. Define + bind in one shot:

```json
{
    "type": "kaiju_attack",
    "name": "frost_blast",
    "spec": {
        "family": "beam",
        "cooldown": 5.0,
        "range": 30,
        "damage": 0.10,
        "color": [0.85, 0.95, 1.00],
        "sprite": 2,
        "narrativeVerb": "blasts with frost at"
    },
    "kind": "frost",
    "attackName": "frost_blast"
}
```

Or just rebind an existing attack to a different kind:

```json
{
    "type": "kaiju_attack",
    "kind": "cave",
    "attackName": "fireball"
}
```

`family` is `"beam"` (instant hitscan + particle stream), `"projectile"` (uses ProjectileManager — also requires `projectileKind` and optional `scale`), or `"aoe"` (expanding ring of particles in radius). `sprite` is an atlas index 0..7 (CIRCLE/SMOKE/SPARK/DUST/EMBER/GLYPH/HALO/RUNE). Built-in attacks: `lightning`, `fireball`, `plasma`, `ice_ray`, `rad_pulse`, `rock_spike`. Built-in kind→attack bindings: sky→lightning, hell→fireball, space→plasma, water/frost→ice_ray, underground→rad_pulse, cave→rock_spike.

---

## Examples in this folder

- `example_frost_kaiju.json` — 7th kaiju kind: slow, durable, leaves stone trail
- `example_crystal_spire.json` — replaces tower-civ Sky Spire with a smaller mostly-MEMORY structure (heavy bloom)
- `example_sky_obelisk_override.json` — re-bind sky kaiju to use the obelisk mesh

Delete or modify any of these. Boot logs show what loaded.
