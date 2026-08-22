# City packs — Quaternius Downtown City Mega Kit

The engine's `window.city.build()` function auto-discovers GLB files in a
named subfolder of `WebGLEngine/GPU_Assets/` and classifies them by filename
into buildings, skyscrapers, vehicles, props, road pieces, and sidewalks.

v724 — packs live in their own subfolders so they can be added/removed
cleanly without mixing with engine-built-in assets (RobotExpressive,
test_rig, etc. which stay at the top level).

## Install (Quaternius Downtown)

1. Download: https://quaternius.com/packs/downtowncitymegakit.html
   (CC0 — public domain, no attribution required, 300+ modular pieces)
2. Pick the **glTF** zip (NOT FBX/OBJ — the engine wants .glb)
3. Unzip; the .glb files live in a subfolder of the unzipped archive
4. **Drop all the .glb files into** `WebGLEngine/GPU_Assets/city/`
   (create the `city/` folder if it doesn't exist)
5. Reload the engine
6. In the engine console:
   ```js
   await city.list()                              // see what was discovered
   await city.build()                             // 6x6 city with streets + sidewalks
   await city.build({ rows: 10, cols: 10 })       // bigger
   await city.build({ sidewalks: false })         // disable sidewalks
   await city.build({ pack: "city" })             // explicit pack name (default)
   city.clear()                                   // remove the last city
   ```

## Pack folder layout

```
GPU_Assets/
├── RobotExpressive.glb        ← engine built-in, stays top-level
├── RobotWoman.glb             ← engine built-in
├── test_rig.glb               ← engine built-in
├── city/                      ← Quaternius Downtown (you create this)
│   ├── Building_A.glb
│   ├── Skyscraper_01.glb
│   ├── Road_Straight.glb
│   ├── ...
├── nature/                    ← future: Stylized Nature MegaKit
├── medieval/                  ← future: Medieval Village MegaKit
├── scifi/                     ← future: Sci-Fi Essentials
└── ...
```

To use a different pack folder, pass `{ pack: "name" }`:
```js
await city.build({ pack: "medieval" })   // builds from GPU_Assets/medieval/
```

## Filename → role mapping

The classifier looks at filename prefix (case-insensitive):

| Pattern                                | Role            |
|----------------------------------------|-----------------|
| `Skyscraper_*`, `Tower_*`, `Highrise*` | **skyscraper** (center bias) |
| `Building_*`, `Office*`, `Apartment*`, `Hotel*`, `Shop*` | **building** |
| `Car_*`, `Truck*`, `Van*`, `Bus*`, `Taxi*`, `Motorcycle*` | **vehicle** |
| `Streetlight*`, `Lamppost*`, `Bench*`, `Trashcan*`, `Sign_*`, `Tree_*` | **prop** |
| `Road*Cross*`, `Crossroad*`, `Intersection*` | **road_cross** (4-way) |
| `Road*T*junc*`, `T_junction*`, `Road*3way*` | **road_t** (T-junction) |
| `Road*Corner*`, `Corner*`, `Road*Bend*` | **road_corner** (L-corner) |
| `Road*Straight*`, `Road_*`, `Street_*`, `Pavement*` | **road_straight** |
| `Crosswalk*`, other `Road*` | **road_other** (fallback) |
| `Sidewalk*`, `Pavement*` | also picked as **sidewalk** |

## Build options

```js
await city.build({
    pack: "city",              // subfolder name (default "city")
    rows: 6,                   // grid rows (1..20)
    cols: 6,                   // grid cols (1..20)
    spacing: 12,               // distance between buildings
    flatten: true,             // wipe terrain + lay flat floor before build
    floorY: 8,                 // floor Y height (when flatten:true)
    center: { x: 0, z: 0 },    // grid center (default: camera position)
    scaleMin: 1.0,             // random scale range
    scaleMax: 1.6,
    skyscraperBias: 0.35,      // skyscraper probability per cell
    roads: true,               // place street grid
    roadScale: 3,              // road piece scale (default spacing/4)
    roadY: 8.5,                // road Y (default floorY + 0.5)
    sidewalks: true,           // place sidewalks alongside roads
    propsPerBuilding: 1,       // prop density
    vehicleCount: 9,           // vehicles scattered
    seed: 42,                  // PRNG seed for reproducible layouts
    props: true,
    vehicles: true,
});
```

## Honest gaps

- **Yaw conventions are best-guess**. T-junction stem direction and L-corner
  opening direction depend on each piece's natural orientation in the GLB.
  If they look wrong, tune in `_placeStreets` (yawTNorth / yawTWest constants).
- **No traffic AI** — vehicles are static.
- **roadScale defaults to spacing/4** assuming Quaternius pieces are ~4 units
  wide. If yours are different, override via `{ roadScale: N }`.
- **The pack subfolder must exist before reload** — the bridge serves whatever
  is in there at request time, but the folder itself has to be created first.
