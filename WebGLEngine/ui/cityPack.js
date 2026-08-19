// ui/cityPack.js — v721
//
// Procedural city builder. Auto-discovers GLB files in GPU_Assets/ via the
// bridge's /GPU_Assets/list endpoint, classifies them by filename pattern
// (building / skyscraper / vehicle / prop), loads them via the asset
// loader's swapMesh, then arranges in a grid with optional vehicles and
// props scattered between blocks.
//
// Designed to work out of the box with the Quaternius Downtown City Mega
// Kit (https://quaternius.com/packs/downtowncitymegakit.html) but classifies
// from filename so any GLBs following common naming work too.
//
// Usage from the engine console:
//
//   await city.list()        — show discovered GLBs grouped by role
//   await city.build()       — default 6x6 city centered at camera
//   await city.build({ rows: 8, cols: 8, spacing: 14, center: {x: 0, z: 0} })
//   city.clear()             — remove the most recently built city
//
// Honest gap: no streets, no traffic. The kit comes with road segments,
// crosswalks, etc. that this module DOESN'T currently place — buildings
// are spawned on a flat grid. Streets can be added by registering them in
// CLASSIFICATION.road and extending _placeStreets in a future round.

// Filename → role classification. Tuned for the actual Quaternius Downtown
// City Mega Kit filenames (verified from a real install in v725):
//
//   Buildings (only 3 whole buildings — pack is modular):
//     Building_Large_2.gltf, Building_Medium_2_001.gltf, Building_Small_1.gltf
//   Roads (Street_ prefix, not Road_):
//     Street_2Lane, Street_4Lane, Street_2Lane_noSidewalk, Street_4Lane_noSidewalk
//     Street_4WayIntersection, Street_TIntersection
//     Street_Curve_2Lane, Street_Curve_4Lane_Short_Curb, Street_Curve_4LaneShort
//     Street_Asphalt_6x6, Street_Asphalt_9x9, Street_Asphalt_Curve_*
//   Sidewalks (own prefix):
//     Sidewalk_Straight_3m, Sidewalk_Corner_Flat_3m, Sidewalk_Corner_Round_3m
//     Sidewalk_NoCurb_3m, Sidewalk_Planter, Sidewalk_Straight_3m_Stripe
//   Props:
//     Prop_ACUnit, Prop_Bollard, Prop_Drain, Prop_ManholeCover, Prop_Planter_Single
//   Modular building parts (NOT placed on grid — pack is meant for hand-assembly):
//     Brick_*, Trim_*, Metal_*, Cornice_*, Door*, DoorFrame_*, Floor_*, Roof_*,
//     Stairs_*, Entrance_*
//   Decals (road markings — also not placed by city.build):
//     Decal_*
//
// Order matters; first matching role wins. Each "road" sub-role is checked
// before generic patterns so Street_TIntersection lands in road_t, not
// road_straight.
const CLASSIFICATION = {
    // Whole buildings (Quaternius: only 3 in Downtown pack)
    skyscraper:    [/^skyscraper/i, /^tower(?:_|$)/i, /^highrise/i, /^building_large/i],
    building:      [/^building(?:_|$)/i, /^building_(small|medium)/i, /^office/i, /^apartment/i, /^shop/i, /^store/i, /^hotel/i],

    // Vehicles
    vehicle:       [/^car(?:_|$)/i, /^truck/i, /^van/i, /^bus/i, /^taxi/i, /^vehicle/i, /^motorcycle/i, /^bike/i],

    // Roads — sub-types checked first (most specific to least).
    // road_t MUST come before road_cross — otherwise "TIntersection"
    // would match road_cross's "intersection" pattern.
    road_t:        [/(street|road).*(t[-_]?intersect|t[-_]?junc|tee|3way)/i, /^t[-_]?junction/i, /^tintersection/i],
    road_cross:    [/(street|road).*(4way|fourway|cross|intersection)/i, /^crossroad/i],
    road_corner:   [/(street|road).*(curve|corner|bend|90)/i],
    road_straight: [/(street|road).*(2lane|4lane|straight|asphalt|long|line)/i, /^road(?:_|$)/i, /^street(?:_|$)/i, /^pavement/i],
    road_other:    [/^road/i, /^street/i, /^asphalt/i],

    // Sidewalks — dedicated category (was inferred via re-scan before)
    sidewalk_corner:   [/^sidewalk.*corner/i],
    sidewalk_straight: [/^sidewalk.*(straight|nocurb)/i],
    sidewalk_other:    [/^sidewalk/i],

    // Props (street furniture, scattered alongside roads)
    prop:          [/^prop_/i, /^streetlight/i, /^lamppost/i, /^bench/i, /^trashcan/i,
                    /^fire_hydrant/i, /^firehydrant/i, /^mailbox/i, /^sign(?:_|$)/i,
                    /^trafficlight/i, /^traffic_light/i, /^tree(?:_|$)/i, /^bollard/i],

    // Modular building parts — NOT placed by city.build (pack is meant
    // for hand-assembly, but listed for completeness in city.list())
    part:          [/^brick_/i, /^trim_/i, /^metal_/i, /^cornice_/i, /^door/i,
                    /^doorframe/i, /^floor_/i, /^roof_/i, /^stairs_/i,
                    /^entrance_/i, /^window/i, /^column/i],

    // Road decals (markings, crosswalks) — not placed currently
    decal:         [/^decal_/i],
};

function _classify(filename) {
    const base = filename.replace(/\.(glb|gltf)$/i, "");
    for (const role of Object.keys(CLASSIFICATION)) {
        for (const re of CLASSIFICATION[role]) {
            if (re.test(base)) return role;
        }
    }
    return "other";
}

// Group all road_* sub-types under "road" for the list() view
function _isRoadRole(role) {
    return role === "road_straight" || role === "road_cross" || role === "road_t"
        || role === "road_corner" || role === "road_other";
}

async function _listAvailable(pack = "city") {
    let files = [];
    let url = pack ? `/GPU_Assets/list/${encodeURIComponent(pack)}` : "/GPU_Assets/list";
    try {
        const r = await fetch(url, { cache: "no-store" });
        const j = await r.json();
        if (j.ok && Array.isArray(j.files)) files = j.files;
        else if (!j.ok) {
            console.warn(`[city] ${url} returned: ${j.error || "unknown error"}`);
        }
    } catch (e) {
        console.warn(`[city] ${url} unreachable —`, e.message);
        return null;
    }
    const grouped = {
        skyscraper: [], building: [], vehicle: [], prop: [],
        road_straight: [], road_cross: [], road_t: [], road_corner: [], road_other: [],
        sidewalk_straight: [], sidewalk_corner: [], sidewalk_other: [],
        part: [], decal: [],
        other: [],
    };
    for (const f of files) grouped[_classify(f)].push(f);
    return grouped;
}

async function list(pack = "city") {
    const grouped = await _listAvailable(pack);
    if (!grouped) return null;
    const total = Object.values(grouped).reduce((s, a) => s + a.length, 0);
    console.group(`[city] discovered ${total} GLBs/GLTFs in GPU_Assets/${pack}/ by role`);
    const roleOrder = ["skyscraper", "building", "vehicle", "prop",
                       "road_straight", "road_cross", "road_t", "road_corner", "road_other",
                       "sidewalk_straight", "sidewalk_corner", "sidewalk_other",
                       "part", "decal", "other"];
    for (const role of roleOrder) {
        if (grouped[role] && grouped[role].length > 0) {
            console.log(`  ${role}: ${grouped[role].length} — ${grouped[role].slice(0, 4).join(", ")}${grouped[role].length > 4 ? ", …" : ""}`);
        }
    }
    if (total === 0) {
        console.log(`  (empty — drop .glb/.gltf files into WebGLEngine/GPU_Assets/${pack}/)`);
    }
    console.groupEnd();
    return grouped;
}

// Load a GLB/GLTF into the asset loader under its base name. Idempotent —
// swapMesh handles the "already loaded" case internally.
// v724 — accepts pack folder; loads from /GPU_Assets/{pack}/{filename}.
// v725 — passes the FILENAME (with extension) so .gltf works alongside .glb.
async function _loadGlb(filename, pack = "city") {
    const base = filename.replace(/\.(glb|gltf)$/i, "");
    if (!window.assetLoader?.swapMesh) {
        throw new Error("assetLoader.swapMesh unavailable");
    }
    const url = pack ? `/GPU_Assets/${pack}/${filename}` : `/GPU_Assets/${filename}`;
    try {
        await window.assetLoader.swapMesh(base, url);
        return base;
    } catch (e) {
        console.warn(`[city] failed to load ${filename}:`, e.message);
        return null;
    }
}

async function build(opts = {}) {
    const rows    = Math.max(1, Math.min(20, opts.rows    ?? 6));
    const cols    = Math.max(1, Math.min(20, opts.cols    ?? 6));
    const spacing = Math.max(4,  Math.min(50, opts.spacing ?? 12));
    // v724 — asset pack name = subfolder under GPU_Assets/. Default "city"
    // for the Quaternius Downtown Mega Kit. Drop GLBs into the named
    // subfolder so packs can be added/removed cleanly.
    const pack = opts.pack ?? "city";
    // v722 — flatten the terrain before building so the city sits on a
    // flat plane rather than rolling hills. World.flatten({floorY:N})
    // wipes ALL chunks to AIR and lays one stone plane at floorY.
    const flatten = opts.flatten ?? true;
    const floorY  = opts.floorY ?? 8;   // matches BUILD VIEWER's default
    // Default center: camera position, projected onto ground plane.
    let center = opts.center;
    if (!center) {
        const cam = window.camera?.position;
        center = cam ? { x: Math.round(cam.x), z: Math.round(cam.z) } : { x: 0, z: 0 };
    }
    const scaleMin = opts.scaleMin ?? 1.0;
    const scaleMax = opts.scaleMax ?? 1.6;
    const skyscraperBias = opts.skyscraperBias ?? 0.35;
    // v722 — road grid options
    const roads = opts.roads ?? true;
    const roadScale = opts.roadScale ?? (spacing / 4);   // Quaternius road pieces are typically ~4 units; scale to spacing
    const roadY = opts.roadY ?? (floorY + 0.5);
    const sidewalks = opts.sidewalks ?? true;

    const grouped = await _listAvailable(pack);
    if (!grouped) {
        console.warn(`[city] no asset listing available from GPU_Assets/${pack}/ — make sure the bridge is running and the folder exists`);
        return null;
    }
    const tall = grouped.skyscraper;
    const short = grouped.building;
    if (tall.length === 0 && short.length === 0) {
        console.warn(`[city] no buildings found in GPU_Assets/${pack}/. Download Quaternius Downtown City Mega Kit (https://quaternius.com/packs/downtowncitymegakit.html), unzip into WebGLEngine/GPU_Assets/${pack}/, then retry.`);
        return null;
    }

    // v722 — flatten the world first (optional). Buildings + streets sit on
    // the floor plane this lays down. Skip via {flatten:false} if you want
    // the kaiju terrain preserved (city will undulate with hills).
    if (flatten) {
        try {
            window.world?.flatten?.({ floorY });
            console.log(`[city] flattened world; floor at y=${floorY}`);
            // Re-arm the camera so we're sitting comfortably above the floor
            if (window.camera && window._safeMoveCamera) {
                try {
                    window._safeMoveCamera(window.camera, center.x, floorY + 18, center.z + 30, { warnOnAdjust: false });
                } catch {}
            }
        } catch (e) {
            console.warn("[city] world.flatten failed:", e.message);
        }
    }

    console.log(`[city] building ${rows}x${cols} city at (${center.x},${center.z}) — ${tall.length} skyscraper types, ${short.length} building types`);

    // Load every used GLB once up-front (so swapMesh resolves before spawn calls)
    const allBuildings = [...tall, ...short];
    const loadedNames = [];
    for (const f of allBuildings) {
        const name = await _loadGlb(f, pack);
        if (name) loadedNames.push(name);
    }
    if (loadedNames.length === 0) {
        console.warn("[city] no buildings loaded successfully");
        return null;
    }

    // Place buildings on the grid
    if (!window.anim?.spawn) {
        console.warn("[city] window.anim.spawn unavailable — engine not fully booted");
        return null;
    }
    const spawnedIds = [];
    const seed = (opts.seed ?? Date.now()) | 0;
    let rngState = seed;
    function rand() {   // small xorshift PRNG so repeat builds with same seed match
        rngState ^= rngState << 13; rngState ^= rngState >>> 17; rngState ^= rngState << 5;
        return ((rngState >>> 0) / 4294967296);
    }

    // ---- v722 — Streets first, so buildings sit on top of them visually -----
    // Use router.exec directly because anim.spawn doesn't pass yaw through.
    if (roads) {
        await _placeStreets({
            grouped, center, rows, cols, spacing, roadY, roadScale,
            spawnedIds, pack, sidewalksOn: sidewalks,
        });
    }

    // ---- v764 / v768 — flat-parsed-building safety net ----
    // v764 added an obelisk fallback because GLBParser only read the
    // first mesh's first primitive — multi-mesh Quaternius buildings
    // parsed as flat 12-vert footprint planes. v768 fixed the parser
    // with a full scene-graph walk, so most Quaternius buildings now
    // render with their real geometry. This safety net is kept because
    // it's idempotent and cheap — if any asset still comes back flat
    // (e.g. a genuinely-flat decal accidentally classified as a
    // building) we still fall back to obelisks instead of invisible
    // floors.
    const flatNames = new Set();
    if (window.assetLoader?.cache) {
        for (const n of loadedNames) {
            const mesh = window.assetLoader.cache.get(n);
            const bb = mesh?._preNormalizeBBox;
            if (bb && bb.sy < 0.5) {
                flatNames.add(n);
                console.log(`[city] v764 — "${n}" parsed flat (sy=${bb.sy.toFixed(2)}) → using obelisk fallback`);
            }
        }
    }
    const hasObeliskFallback = !!window.assetLoader?.cache?.has?.("obelisk");
    if (flatNames.size > 0 && !hasObeliskFallback) {
        console.warn("[city] v764 — flat buildings detected but obelisk unavailable; buildings will remain invisible");
    }

    // ---- Buildings on the grid (existing logic) -----
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            const x = center.x + (c - cols / 2) * spacing;
            const z = center.z + (r - rows / 2) * spacing;
            // Pick a building. Skyscrapers cluster toward the center.
            const distFromCenter = Math.hypot(c - cols/2, r - rows/2);
            const centerFactor = 1 - Math.min(1, distFromCenter / (Math.max(rows, cols) / 2));
            const wantTall = tall.length > 0 && rand() < (skyscraperBias + centerFactor * 0.4);
            const pool = wantTall ? tall.map(f => f.replace(/\.glb$/i, ""))
                                  : short.map(f => f.replace(/\.glb$/i, ""));
            const validPool = pool.filter(n => loadedNames.includes(n));
            if (validPool.length === 0) continue;
            let pick = validPool[Math.floor(rand() * validPool.length)];
            let scale = scaleMin + rand() * (scaleMax - scaleMin);
            // v764 — flat-parse fallback. Swap to obelisk + boost scale so the
            // entity actually has visible height. Skyscrapers get taller obelisks
            // than mid-rises to preserve the city's silhouette variety.
            if (flatNames.has(pick) && hasObeliskFallback) {
                pick = "obelisk";
                scale = wantTall
                    ? 5.5 + rand() * 3.5      // skyscraper: 5.5-9.0
                    : 3.0 + rand() * 2.0;     // building:   3.0-5.0
            }
            try {
                const id = window.anim.spawn(x, z, scale, pick);
                if (id != null) spawnedIds.push(id);
            } catch (e) {
                /* anim.spawn logs failures internally */
            }
        }
    }

    // Scatter props (lampposts, signs, etc.) between buildings
    if (opts.props !== false && grouped.prop.length > 0) {
        const propsToLoad = grouped.prop.slice(0, 6);
        const propNames = [];
        for (const f of propsToLoad) {
            const n = await _loadGlb(f, pack); if (n) propNames.push(n);
        }
        const propsPerBuilding = opts.propsPerBuilding ?? 1;
        const propCount = Math.floor(spawnedIds.length * propsPerBuilding);
        for (let i = 0; i < propCount && propNames.length > 0; i++) {
            const x = center.x + (rand() - 0.5) * cols * spacing;
            const z = center.z + (rand() - 0.5) * rows * spacing;
            const pick = propNames[Math.floor(rand() * propNames.length)];
            try {
                const id = window.anim.spawn(x, z, 0.6 + rand() * 0.4, pick);
                if (id != null) spawnedIds.push(id);
            } catch {}
        }
    }

    // Scatter vehicles
    if (opts.vehicles !== false && grouped.vehicle.length > 0) {
        const vehiclesToLoad = grouped.vehicle.slice(0, 4);
        const vehNames = [];
        for (const f of vehiclesToLoad) {
            const n = await _loadGlb(f, pack); if (n) vehNames.push(n);
        }
        const vehicleCount = opts.vehicleCount ?? Math.floor((rows * cols) / 4);
        for (let i = 0; i < vehicleCount && vehNames.length > 0; i++) {
            const x = center.x + (rand() - 0.5) * cols * spacing;
            const z = center.z + (rand() - 0.5) * rows * spacing;
            const pick = vehNames[Math.floor(rand() * vehNames.length)];
            try {
                const id = window.anim.spawn(x, z, 0.8 + rand() * 0.3, pick);
                if (id != null) spawnedIds.push(id);
            } catch {}
        }
    }

    window._lastCityIds = spawnedIds;
    console.log(`[city] spawned ${spawnedIds.length} entities (${rows*cols} buildings + props + vehicles + streets). city.clear() to remove.`);
    return spawnedIds;
}

// ---- v722 — Street grid placement -------------------------------------
//
// Layout with perimeter (v723):
//
//   P-T-S-T-S-T-P     P = L-corner (perimeter outer corner)
//   S B + B + B S     T = T-junction (perimeter meets interior street)
//   T-X-+-X-+-X-T     S = straight road segment
//   S B + B + B S     X = 4-way crossroad (interior intersection)
//   T-X-+-X-+-X-T     B = building cell
//   S B + B + B S     + = vertical road segment crossing horizontal
//   P-T-S-T-S-T-P
//
// All road segments placed via router.exec directly because anim.spawn
// doesn't pass yaw through. yaw is in radians; 0 = piece's natural
// orientation (assumed east-west horizontal for straights).
//
// Sidewalks: one piece on each side of every road segment, offset
// perpendicular to the road by `sidewalkOffset`. Opt-out: {sidewalks:false}.
async function _placeStreets({ grouped, center, rows, cols, spacing, roadY, roadScale, spawnedIds, pack = "city", sidewalksOn = true }) {
    const router = window.router;
    if (!router?.exec) {
        console.warn("[city] router unavailable — skipping streets");
        return;
    }
    async function loadFirst(arr) {
        if (!arr || arr.length === 0) return null;
        return await _loadGlb(arr[0], pack);
    }
    const straight = await loadFirst(grouped.road_straight)
                  || await loadFirst(grouped.road_other);
    const cross    = await loadFirst(grouped.road_cross);
    const tjunc    = await loadFirst(grouped.road_t);
    const corner   = await loadFirst(grouped.road_corner);
    // v725 — sidewalks now have their own classification categories
    // (sidewalk_straight, sidewalk_corner, sidewalk_other). Pick straight
    // sidewalk first; fall back to any sidewalk piece if missing.
    let sidewalk = null;
    if (sidewalksOn) {
        sidewalk = await loadFirst(grouped.sidewalk_straight)
                || await loadFirst(grouped.sidewalk_other);
    }

    if (!straight && !cross && !tjunc && !corner && !sidewalk) {
        console.log("[city] no road or sidewalk pieces found — skipping streets. Drop Road_Straight.glb (etc.) into GPU_Assets/.");
        return;
    }

    function spawnRoad(assetId, x, z, yaw) {
        try {
            const r = router.exec({
                type: "entity:spawnMesh",
                assetId, kind: assetId,
                x, y: roadY, z,
                scale: roadScale, yaw,
            });
            const id = r?.id ?? null;
            if (id != null) spawnedIds.push(id);
            return id;
        } catch { return null; }
    }

    const halfCols = cols / 2;
    const halfRows = rows / 2;
    // Sidewalks sit perpendicular to roads, offset by ~spacing/3
    // (between road centerline and the building footprint)
    const sidewalkOffset = spacing * 0.32;
    // Slight Y lift so sidewalks render above road (avoid z-fighting)
    const sidewalkY = roadY + 0.05;

    let placed = 0;
    let placedSidewalks = 0;

    // --- Helper: place sidewalks on both sides of a road segment ---
    // For yaw=0 (east-west road), sidewalks go at z±offset
    // For yaw=PI/2 (north-south road), sidewalks go at x±offset
    function placeSidewalksAt(x, z, roadYaw) {
        if (!sidewalk) return;
        const isEW = Math.abs(Math.sin(roadYaw)) < 0.5;   // 0 or PI = east-west
        const dx = isEW ? 0 : sidewalkOffset;
        const dz = isEW ? sidewalkOffset : 0;
        for (const sign of [-1, 1]) {
            try {
                const r = router.exec({
                    type: "entity:spawnMesh",
                    assetId: sidewalk, kind: sidewalk,
                    x: x + sign * dx, y: sidewalkY, z: z + sign * dz,
                    scale: roadScale, yaw: roadYaw,
                });
                if (r?.id != null) { spawnedIds.push(r.id); placedSidewalks++; }
            } catch {}
        }
    }

    // --- Interior horizontal road segments (east-west, between rows) ---
    if (straight) {
        for (let r = 0; r < rows - 1; r++) {
            const z = center.z + (r - halfRows + 0.5) * spacing;
            for (let c = 0; c < cols; c++) {
                const x = center.x + (c - halfCols) * spacing;
                if (spawnRoad(straight, x, z, 0) != null) placed++;
                placeSidewalksAt(x, z, 0);
            }
        }
        // Interior vertical road segments (north-south, between cols)
        for (let c = 0; c < cols - 1; c++) {
            const x = center.x + (c - halfCols + 0.5) * spacing;
            for (let r = 0; r < rows; r++) {
                const z = center.z + (r - halfRows) * spacing;
                if (spawnRoad(straight, x, z, Math.PI/2) != null) placed++;
                placeSidewalksAt(x, z, Math.PI/2);
            }
        }
    }

    // --- Interior 4-way intersections ---
    for (let r = 0; r < rows - 1; r++) {
        const z = center.z + (r - halfRows + 0.5) * spacing;
        for (let c = 0; c < cols - 1; c++) {
            const x = center.x + (c - halfCols + 0.5) * spacing;
            const piece = cross || straight;
            if (piece && spawnRoad(piece, x, z, 0) != null) placed++;
            // No sidewalks at crossroads — they'd intersect the road
        }
    }

    // --- v723 — PERIMETER road around the entire city -----
    // The perimeter sits one spacing-unit beyond the outermost buildings
    // on each side. T-junctions go where interior streets meet it; L-
    // corners go at the 4 outer corners; straights fill the rest.
    //
    // Yaw conventions (best guess; tunable if Quaternius pieces have a
    // different default orientation):
    //   straight  yaw = 0       → runs east-west
    //   T-junc    yaw = 0       → stem points south (perpendicular axis = E-W)
    //   L-corner  yaw = 0       → opens to SE (top of L = north, side = east)
    //
    // Rotate by π/2 increments to fit each edge/corner.

    const northZ = center.z + (-halfRows - 0.5) * spacing;
    const southZ = center.z + ( halfRows - 0.5) * spacing;
    const westX  = center.x + (-halfCols - 0.5) * spacing;
    const eastX  = center.x + ( halfCols - 0.5) * spacing;

    // North + south edges — straight pieces along each col, T-junction where
    // a vertical street meets the perimeter (every col-boundary), L-corner
    // at the 2 ends.
    for (let edge of [{ z: northZ, yawStraight: 0, yawTNorth: 0 },
                      { z: southZ, yawStraight: 0, yawTNorth: Math.PI }]) {
        const isNorth = (edge.z === northZ);
        for (let c = 0; c < cols; c++) {
            const x = center.x + (c - halfCols) * spacing;
            if (straight && spawnRoad(straight, x, edge.z, edge.yawStraight) != null) placed++;
            placeSidewalksAt(x, edge.z, edge.yawStraight);
        }
        // T-junctions at every interior col boundary (cols-1 of them)
        for (let c = 0; c < cols - 1; c++) {
            const x = center.x + (c - halfCols + 0.5) * spacing;
            const piece = tjunc || cross || straight;
            // T-stem points INTO city (south for north edge, north for south edge)
            const yaw = edge.yawTNorth;
            if (piece && spawnRoad(piece, x, edge.z, yaw) != null) placed++;
        }
    }
    // West + east edges — straights along each row, T-junctions at row
    // boundaries, L-corners deferred to the corner placement below
    for (let edge of [{ x: westX, yawStraight: Math.PI/2, yawTWest: Math.PI/2 },
                      { x: eastX, yawStraight: Math.PI/2, yawTWest: -Math.PI/2 }]) {
        for (let r = 0; r < rows; r++) {
            const z = center.z + (r - halfRows) * spacing;
            if (straight && spawnRoad(straight, edge.x, z, edge.yawStraight) != null) placed++;
            placeSidewalksAt(edge.x, z, edge.yawStraight);
        }
        for (let r = 0; r < rows - 1; r++) {
            const z = center.z + (r - halfRows + 0.5) * spacing;
            const piece = tjunc || cross || straight;
            const yaw = edge.yawTWest;
            if (piece && spawnRoad(piece, edge.x, z, yaw) != null) placed++;
        }
    }

    // --- 4 outer corners ---
    // L-corner natural orientation (yaw=0): assumed opens to SE
    // NW corner: yaw = 0
    // NE corner: yaw = -PI/2 (turn 90° CCW)
    // SE corner: yaw = PI
    // SW corner: yaw = PI/2
    const cornerPiece = corner || tjunc || straight;
    if (cornerPiece) {
        if (spawnRoad(cornerPiece, westX, northZ, 0)         != null) placed++;
        if (spawnRoad(cornerPiece, eastX, northZ, -Math.PI/2) != null) placed++;
        if (spawnRoad(cornerPiece, eastX, southZ, Math.PI)    != null) placed++;
        if (spawnRoad(cornerPiece, westX, southZ, Math.PI/2)  != null) placed++;
    }

    console.log(`[city] streets placed: ${placed} road segments + ${placedSidewalks} sidewalks (straight=${!!straight}, cross=${!!cross}, t=${!!tjunc}, corner=${!!corner}, sidewalk=${!!sidewalk})`);
}

function clear() {
    const ids = window._lastCityIds || [];
    if (!ids.length) {
        console.log("[city] no recent city to clear");
        return 0;
    }
    let despawned = 0;
    for (const id of ids) {
        try {
            window.router?.exec?.({ type: "entity:despawn", id });
            despawned++;
        } catch {}
    }
    window._lastCityIds = [];
    console.log(`[city] cleared ${despawned} entities`);
    return despawned;
}

export const city = { list, build, clear };
export default city;
