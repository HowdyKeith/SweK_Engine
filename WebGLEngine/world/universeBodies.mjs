// WebGLEngine/world/universeBodies.mjs -- v4299 (Level 13)
//
// THE UNIVERSE AS INSTANCE RECORDS. es-universe.json (the Endless Sky data the tree already reads for ev.html)
// has 694 systems with map coordinates and, inside each, its stellar objects -- stars, planets, stations --
// with positions relative to the system. This turns them into the input records render/gpuDriven.mjs culls:
// one per system, one per stellar object, thousands in all, on the XY plane -- the orrery's plane, the plane
// gpuDriven's quads lie in -- with the lift along z toward a camera on +z.
//
// *** THE DATA MODEL, NOT THE VIEW. *** Every number here is from the file: a system sits at its map x/y, an
// object at its system plus its own offset (scaled, because Endless Sky's in-system pixels dwarf its map
// units), a radius from what the object IS (a star is larger than a station). Nothing is invented, so a
// pick that names an id can be checked against the file. `names` maps a record's id back to a name.
"use strict";

/**
 * In-system pixels to map pixels: objects stay INSIDE their system's marker. Endless Sky places objects up to
 * ~5,000 px from their star and systems ~100-300 px apart on the map, so at 0.02 a planet of Sol landed over
 * a star of Caph (measured at Level 13: 10 of 20 picks near Sol named another system's body). At 0.005 an
 * object is within 25 map px of its marker, which the marker's radius contains.
 */
export const OBJECT_SCALE = 0.005;
/** Radii by kind, in map pixels (x mapScale). A system marker is sized by how much it holds. */
export const RADII = Object.freeze({ system: 40, star: 30, planet: 16, station: 11, other: 12 });
/**
 * Objects are LIFTED above their system's marker, stars highest: every record on one plane would leave two
 * overlapping quads at one depth, and then draw order -- the atomics' order -- would decide a pick. With the
 * lift the depth test decides: a pick at a star's centre is the star, and the marker shows around it.
 */
export const LIFT = Object.freeze({ system: 0, station: 1, planet: 2, star: 3, other: 1 });

export function kindOf(spob) {
    if (!spob) return "other";
    if (spob.isStar || spob.kind === "star") return "star";
    if (spob.isStation || spob.kind === "station") return "station";
    if (spob.kind === "planet" || spob.landable) return "planet";
    return "other";
}

/**
 * Records from the universe: { records: Float32Array(4n), names: string[], kinds: string[], systemOf: Int32Array,
 * count, extent }. Systems first (index i = system i), then every object in system order.
 */
export function universeRecords(universe, { objectScale = OBJECT_SCALE, mapScale = 0.01, radii = RADII } = {}) {
    const systems = (universe && universe.systems) || [];
    const rows = [];
    for (let i = 0; i < systems.length; i++) {
        const s = systems[i];
        rows.push({ x: s.x * mapScale, z: s.y * mapScale, y: 0, r: radii.system * mapScale * (1 + 0.15 * Math.min(8, (s.spobs || []).length)), name: s.name || `system ${s.id}`, kind: "system", system: i });
    }
    for (let i = 0; i < systems.length; i++) {
        const s = systems[i];
        for (const o of (s.spobs || [])) {
            const kind = kindOf(o);
            rows.push({ x: (s.x + (o.x || 0) * objectScale) * mapScale, z: (s.y + (o.y || 0) * objectScale) * mapScale, y: (LIFT[kind] || LIFT.other) * radii.other * mapScale,
                        r: (radii[kind] || radii.other) * mapScale, name: o.name || `${kind} ${o.id} of ${s.name}`, kind, system: i });
        }
    }
    const records = new Float32Array(rows.length * 4), systemOf = new Int32Array(rows.length);
    let extent = 0;
    // record = (map x, map y, lift, radius): the map is XY, the lift is z, as the quads and the orrery expect
    rows.forEach((w, i) => { records.set([w.x, w.z, w.y, w.r], i * 4); systemOf[i] = w.system; extent = Math.max(extent, Math.abs(w.x), Math.abs(w.z)); });
    return { records, names: rows.map((w) => w.name), kinds: rows.map((w) => w.kind), systemOf, count: rows.length, systems: systems.length, extent };
}

/** The subset a page or a gate can load without the 16 MB file: systems and objects only, positions and names. */
export function slimUniverse(universe) {
    return { systems: (universe.systems || []).map((s) => ({ id: s.id, name: s.name, x: s.x, y: s.y, spobs: (s.spobs || []).map((o) => ({ id: o.id, name: o.name, x: o.x, y: o.y, kind: o.kind, isStar: !!o.isStar, isStation: !!o.isStation, landable: !!o.landable })) })) };
}
