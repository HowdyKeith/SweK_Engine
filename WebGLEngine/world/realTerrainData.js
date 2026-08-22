// FILE: world/realTerrainData.js
// VERSION: v1096 — Stage 2 data layer for the Real Terrain demo.
//
// Fetches real-world ELEVATION (Open-Meteo) and STREETS (OpenStreetMap via the
// Overpass API) for a point on Earth. No API keys; both sources are CORS-enabled
// so this runs straight from the browser. Pure data (no DOM) — the same parsing
// the standalone realterrain.html preview uses, lifted into the engine so the
// voxel stamp (world/realTerrainStamp.js) can consume it.
//
//   const data = await fetchRealTerrain({ lat, lon, sizeM, grid });
//   // -> { heights:[grid*grid], grid, min, max, bbox, roads:[{cls,name,pts}], lat, lon, sizeM }

const M_PER_DEG_LAT = 111320;

export function bboxFromCenter(lat, lon, sizeM) {
    const half = sizeM / 2;
    const dLat = half / M_PER_DEG_LAT;
    const dLon = half / (M_PER_DEG_LAT * Math.cos(lat * Math.PI / 180));
    return { south: lat - dLat, west: lon - dLon, north: lat + dLat, east: lon + dLon };
}

// Open-Meteo elevation, batched (<=100 points/request). Row-major, north->south.
// Open-Meteo elevation for a point list (batched <=100/request). Free, no key.
async function elevOpenMeteo(lats, lons) {
    const heights = new Array(lats.length);
    const BATCH = 100;
    for (let i = 0; i < lats.length; i += BATCH) {
        const la = lats.slice(i, i + BATCH).map((v) => v.toFixed(5)).join(",");
        const lo = lons.slice(i, i + BATCH).map((v) => v.toFixed(5)).join(",");
        const res = await fetch(`https://api.open-meteo.com/v1/elevation?latitude=${la}&longitude=${lo}`);
        if (!res.ok) throw new Error("Open-Meteo HTTP " + res.status);
        const j = await res.json();
        if (!Array.isArray(j.elevation)) throw new Error("Open-Meteo: unexpected response");
        for (let k = 0; k < j.elevation.length; k++) heights[i + k] = j.elevation[k];
    }
    return heights;
}

// USGS 3DEP elevation via the National Map ImageServer getSamples (multipoint).
// Free, no key, US-only, ~1-10 m. Samples carry locationId = input index.
async function elevUSGS(lats, lons) {
    const heights = new Array(lats.length).fill(0);
    const BATCH = 50;
    const base = "https://elevation.nationalmap.gov/arcgis/rest/services/3DEPElevation/ImageServer/getSamples";
    for (let i = 0; i < lats.length; i += BATCH) {
        const pts = [];
        for (let k = i; k < Math.min(i + BATCH, lats.length); k++) pts.push([+lons[k].toFixed(6), +lats[k].toFixed(6)]); // [x=lon, y=lat]
        const geom = encodeURIComponent(JSON.stringify({ points: pts, spatialReference: { wkid: 4326 } }));
        const url = `${base}?geometry=${geom}&geometryType=esriGeometryMultipoint&returnFirstValueOnly=true&f=json`;
        const res = await fetch(url);
        if (!res.ok) throw new Error("USGS HTTP " + res.status);
        const j = await res.json();
        const samples = j.samples || [];
        for (let s = 0; s < samples.length; s++) {
            const idx = (samples[s].locationId != null) ? i + samples[s].locationId : i + s;
            const v = parseFloat(samples[s].value);
            if (idx < heights.length && isFinite(v)) heights[idx] = v;
        }
    }
    return heights;
}

// Mapbox Terrain-RGB: per-pixel DEM. Sharpest, needs an access token. Fetches the
// tiles covering the bbox, composites them, and samples each grid point.
async function elevMapbox(bb, lats, lons, token) {
    if (!token) throw new Error("Mapbox source needs an access token (set it in Terrain Settings or pass {mapboxToken})");
    if (typeof OffscreenCanvas === "undefined" || typeof createImageBitmap === "undefined") throw new Error("Mapbox decode needs OffscreenCanvas (use a recent Chrome)");
    const span = Math.max(bb.east - bb.west, 1e-6);
    let z = Math.round(Math.log2(360 / span * 3)); z = Math.max(11, Math.min(15, z));
    const n = 2 ** z, TS = 256;
    const tileX = (lon) => (lon + 180) / 360 * n;
    const tileY = (lat) => { const r = lat * Math.PI / 180; return (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * n; };
    const x0 = Math.floor(tileX(bb.west)), x1 = Math.floor(tileX(bb.east));
    const y0 = Math.floor(tileY(bb.north)), y1 = Math.floor(tileY(bb.south));
    const txCount = x1 - x0 + 1, tyCount = y1 - y0 + 1;
    if (txCount * tyCount > 16) throw new Error("Mapbox: area too large for one pass — shrink the box");
    const cvs = new OffscreenCanvas(txCount * TS, tyCount * TS);
    const ctx = cvs.getContext("2d");
    for (let tx = x0; tx <= x1; tx++) for (let ty = y0; ty <= y1; ty++) {
        const res = await fetch(`https://api.mapbox.com/v4/mapbox.terrain-rgb/${z}/${tx}/${ty}.pngraw?access_token=${token}`);
        if (!res.ok) throw new Error("Mapbox tile HTTP " + res.status);
        ctx.drawImage(await createImageBitmap(await res.blob()), (tx - x0) * TS, (ty - y0) * TS);
    }
    const W = cvs.width, H = cvs.height, px = ctx.getImageData(0, 0, W, H).data;
    const heights = new Array(lats.length);
    for (let i = 0; i < lats.length; i++) {
        const ix = Math.max(0, Math.min(W - 1, Math.round((tileX(lons[i]) - x0) * TS)));
        const iy = Math.max(0, Math.min(H - 1, Math.round((tileY(lats[i]) - y0) * TS)));
        const o = (iy * W + ix) * 4;
        heights[i] = -10000 + ((px[o] * 65536 + px[o + 1] * 256 + px[o + 2]) * 0.1);
    }
    return heights;
}

export async function fetchElevationGrid({ lat, lon, sizeM, grid, source = "open-meteo", mapboxToken }) {
    const bb = bboxFromCenter(lat, lon, sizeM);
    const lats = [], lons = [];
    for (let r = 0; r < grid; r++) {
        const fy = grid === 1 ? 0 : r / (grid - 1);
        const la = bb.north + (bb.south - bb.north) * fy;
        for (let c = 0; c < grid; c++) {
            const fx = grid === 1 ? 0 : c / (grid - 1);
            const lo = bb.west + (bb.east - bb.west) * fx;
            lats.push(la); lons.push(lo);
        }
    }
    let heights;
    if (source === "mapbox")     heights = await elevMapbox(bb, lats, lons, mapboxToken);
    else if (source === "usgs")  heights = await elevUSGS(lats, lons);
    else                         heights = await elevOpenMeteo(lats, lons);
    let min = Infinity, max = -Infinity;
    for (const h of heights) { if (h < min) min = h; if (h > max) max = h; }
    return { heights, grid, min, max, bbox: bb, source };
}

const OVERPASS = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter"];

// Shared Overpass POST with mirror fallback. Returns parsed JSON.
async function overpassPost(query) {
    let lastErr = null;
    for (const ep of OVERPASS) {
        try {
            const res = await fetch(ep, {
                method: "POST",
                headers: { "Content-Type": "application/x-www-form-urlencoded" },
                body: "data=" + encodeURIComponent(query),
            });
            if (!res.ok) throw new Error("HTTP " + res.status);
            return await res.json();
        } catch (e) { lastErr = e; console.warn("[realTerrain] overpass mirror failed:", ep, e.message); }
    }
    throw lastErr || new Error("overpass: all mirrors failed");
}

// OSM highway ways (with inline node geometry) inside the bbox.
export async function fetchStreets(bb) {
    const q = `[out:json][timeout:25];(way["highway"](${bb.south},${bb.west},${bb.north},${bb.east}););out geom;`;
    const j = await overpassPost(q);
    const roads = [];
    for (const el of (j.elements || [])) {
        if (el.type !== "way" || !Array.isArray(el.geometry)) continue;
        roads.push({
            cls: (el.tags && el.tags.highway) || "road",
            name: (el.tags && el.tags.name) || "",
            pts: el.geometry.map((g) => [g.lat, g.lon]),
        });
    }
    return { roads };
}

// OSM building footprints (way["building"]) with height. Height comes from the
// `height` tag (metres) or `building:levels` x 3 m, else a 6 m default.
export async function fetchBuildings(bb) {
    const q = `[out:json][timeout:30];(way["building"](${bb.south},${bb.west},${bb.north},${bb.east}););out geom;`;
    const j = await overpassPost(q);
    const buildings = [];
    for (const el of (j.elements || [])) {
        if (el.type !== "way" || !Array.isArray(el.geometry) || el.geometry.length < 3) continue;
        const tags = el.tags || {};
        let hM = parseFloat(tags.height);
        if (!isFinite(hM)) { const lv = parseFloat(tags["building:levels"]); hM = isFinite(lv) ? lv * 3 : 6; }
        buildings.push({ poly: el.geometry.map((g) => [g.lat, g.lon]), heightM: Math.max(3, hM) });
    }
    return { buildings };
}

// OSM water: areas (natural=water / landuse=reservoir, polygons) + waterways
// (river/stream/canal lines). Ways only (relations/multipolygons skipped for now).
export async function fetchWater(bb) {
    const q = `[out:json][timeout:30];(way["natural"="water"](${bb.south},${bb.west},${bb.north},${bb.east});way["landuse"="reservoir"](${bb.south},${bb.west},${bb.north},${bb.east});way["waterway"](${bb.south},${bb.west},${bb.north},${bb.east}););out geom;`;
    const j = await overpassPost(q);
    const areas = [], ways = [];
    for (const el of (j.elements || [])) {
        if (el.type !== "way" || !Array.isArray(el.geometry) || el.geometry.length < 2) continue;
        const tags = el.tags || {};
        const pts = el.geometry.map((g) => [g.lat, g.lon]);
        if (tags.natural === "water" || tags.landuse === "reservoir") areas.push({ poly: pts });
        else if (tags.waterway) ways.push({ pts, kind: tags.waterway });
    }
    return { water: { areas, ways } };
}

// One-shot: elevation + streets (+ optional buildings + water). Streets/buildings/
// water are best-effort (terrain still returns if Overpass is down).
export async function fetchRealTerrain({ lat, lon, sizeM = 2000, grid = 32, buildings = false, water = false, source = "open-meteo", mapboxToken }) {
    const el = await fetchElevationGrid({ lat, lon, sizeM, grid, source, mapboxToken });
    let roads = [], bld = [], wtr = { areas: [], ways: [] };
    try { roads = (await fetchStreets(el.bbox)).roads; }
    catch (e) { console.warn("[realTerrain] streets unavailable:", e.message); }
    if (buildings) {
        try { bld = (await fetchBuildings(el.bbox)).buildings; }
        catch (e) { console.warn("[realTerrain] buildings unavailable:", e.message); }
    }
    if (water) {
        try { wtr = (await fetchWater(el.bbox)).water; }
        catch (e) { console.warn("[realTerrain] water unavailable:", e.message); }
    }
    return Object.assign({ lat, lon, sizeM, roads, buildings: bld, water: wtr }, el);
}
