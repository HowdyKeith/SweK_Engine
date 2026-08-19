// ui/radarManager.js
//
// One radar, many feeds. Today the STATUS scope, the weather/aircraft layer, and the in-world kaiju/asset trackers each
// keep their own blips and each try to draw; they were never behind a single thing that owns the layout. This is that
// thing. Every source REGISTERS once and SUBMITS a flat list of typed blips -- a world position, a type, and an optional
// preferred view mode -- and the manager holds them all, projects each through flat or globe (per the source's mode),
// and hands the renderer ONE deduplicated draw list. Add a source, remove a source, or re-submit a source's blips, and
// the single STATUS layout just reflects it.
//
// Logic only -- no DOM. The renderer (STATUS scope) reads frame() and draws; this decides WHAT and WHERE, not HOW.
import { project } from "./radarProjection.js";

export function makeRadarManager() {
    const sources = new Map();   // sourceId -> { mode, blips: [] }

    // Register (or re-register) a source with a default view mode ("flat" | "globe").
    function register(sourceId, mode = "flat") {
        const s = sources.get(sourceId) || { mode, blips: [] };
        s.mode = mode; sources.set(sourceId, s);
        return sourceId;
    }
    function unregister(sourceId) { return sources.delete(sourceId); }

    // Replace a source's blips. Each blip: { id, type, x,z (flat) | lat,lon (globe), label?, mode? }.
    function submit(sourceId, blips) {
        const s = sources.get(sourceId) || register(sourceId);
        s.blips = Array.isArray(blips) ? blips : [];
        return s.blips.length;
    }

    // Build the unified draw list for a frame. viewer = { lat0, lon0, range } for globe/flat context.
    // Returns [{ id, type, source, px, py, angle, ring, visible, label }], back-hemisphere blips dropped.
    function frame(viewer = {}) {
        const out = [];
        const seen = new Set();
        for (const [sourceId, s] of sources) {
            for (const b of s.blips) {
                const mode = b.mode || s.mode || "flat";
                const key = (b.id != null ? String(b.id) : (b.type + ":" + (b.label || b.x + "," + b.z)));
                if (seen.has(key)) continue;   // dedupe by id across sources: first source wins
                seen.add(key);
                const p = project(mode, {
                    x: b.x, z: b.z, range: viewer.range || 1,
                    lat: b.lat, lon: b.lon, lat0: viewer.lat0 || 0, lon0: viewer.lon0 || 0,
                });
                if (!p.visible) continue;   // globe: past the horizon -> not drawn
                out.push({ id: key, type: b.type || "blip", source: sourceId, px: p.px, py: p.py, angle: p.angle, ring: p.ring, visible: true, label: b.label || "" });
            }
        }
        return out;
    }

    function setMode(sourceId, mode) { const s = sources.get(sourceId); if (s) s.mode = mode; return !!s; }
    function list() { return [...sources.keys()]; }
    function count() { let n = 0; for (const s of sources.values()) n += s.blips.length; return n; }

    return { register, unregister, submit, frame, setMode, list, count };
}

// Browser: expose one shared manager so any source can register + submit and the STATUS scope can adopt frame() when
// wired. Instantiating here is inert until a source feeds it; it does not touch the existing radar draw path.
if (typeof window !== "undefined" && !window.radarManager) window.radarManager = makeRadarManager();
