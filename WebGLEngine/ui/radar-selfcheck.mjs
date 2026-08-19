// ui/radar-selfcheck.mjs
//
// Run: node ui/radar-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs.
//
// The radar manager unifies every feed and the projection decides where each blip lands. The gate proves the flat
// projection still does what the scope always did (origin -> centre, far -> rim, angle right), and that the globe
// projection does the one thing that makes it a globe and not a painted disc: a blip on the far side of the sphere,
// past the horizon from the viewer, is NOT drawn. Then it proves the manager holds many sources, dedupes a blip that
// two sources both report, drops the back-hemisphere blips from the frame, and is deterministic. The sabotage makes the
// globe projection claim everything is visible -- and the far-side test fails, because a globe you can see through the
// back of is just a flat disc lying about its shape.
import { projectFlat, projectGlobe } from "./radarProjection.js";
import { makeRadarManager } from "./radarManager.js";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };
const near = (a, b, e = 1e-9) => Math.abs(a - b) < e;
const HALF_PI = Math.PI / 2;

// ---- 1. FLAT: origin -> centre, far -> rim, angle correct --------------------------------------------
{
    const c = projectFlat(0, 0, 10);
    const far = projectFlat(10, 0, 10);
    const up = projectFlat(0, 5, 10);   // +z -> angle pi/2
    ok("!! flat projection: origin at centre, far at rim, angle correct", near(c.ring, 0) && far.ring > 0.85 && near(up.angle, HALF_PI),
       "the origin lands dead centre, a point at full range lands near the rim, and a point on the +z axis reads at 90 degrees -- exactly what the scope has always drawn.");
}

// ---- 2. GLOBE: viewer at centre, 90deg at rim, FAR SIDE hidden ---------------------------------------
{
    const self = projectGlobe(0, 0, 0, 0);                 // viewer's own position
    const rim = projectGlobe(0, HALF_PI, 0, 0);            // 90 deg east -> on the rim, still visible
    const back = projectGlobe(0, Math.PI, 0, 0);          // 180 deg -> directly behind the globe
    ok("!! globe projection: self centred, horizon at rim, FAR SIDE not drawn", near(self.px, 0) && near(self.py, 0) && self.visible && rim.visible && rim.ring > 0.99 && !back.visible,
       "your own position sits at the centre, a point on the horizon sits on the rim, and a point on the opposite face of the globe is marked not-visible -- it falls off the back instead of showing through.");
}

// ---- 3. MANAGER: many sources, dedupe, frame ---------------------------------------------------------
{
    const m = makeRadarManager();
    m.register("peers", "flat");
    m.register("aircraft", "globe");
    m.submit("peers", [{ id: "p1", type: "peer", x: 1, z: 0 }, { id: "shared", type: "peer", x: 2, z: 2 }]);
    m.submit("aircraft", [{ id: "a1", type: "plane", lat: 0, lon: 0.1 }, { id: "shared", type: "plane", lat: 0, lon: 0.2 }]);
    const f = m.frame({ range: 10 });
    const ids = f.map((b) => b.id);
    ok("!! manager holds many sources and dedupes a shared blip", m.list().length === 2 && ids.filter((x) => x === "shared").length === 1 && ids.includes("p1") && ids.includes("a1"),
       "two sources register, four blips submitted, and the id reported by both sources appears once -- one radar, many feeds, one layout.");
}

// ---- 4. MANAGER drops back-hemisphere blips from the frame -------------------------------------------
{
    const m = makeRadarManager();
    m.register("sky", "globe");
    m.submit("sky", [{ id: "front", type: "plane", lat: 0, lon: 0.2 }, { id: "behind", type: "plane", lat: 0, lon: Math.PI }]);
    const f = m.frame({ lat0: 0, lon0: 0 });
    ok("!! manager drops blips past the horizon in globe mode", f.length === 1 && f[0].id === "front",
       "of a blip in front and a blip on the far side of the globe, only the front one reaches the draw list -- the horizon is real.");
}

// ---- 5. DETERMINISTIC --------------------------------------------------------------------------------
{
    const mk = () => { const m = makeRadarManager(); m.register("s", "flat"); m.submit("s", [{ id: "x", type: "t", x: 3, z: 4 }]); return JSON.stringify(m.frame({ range: 10 })); };
    ok("!! the manager is deterministic", mk() === mk(),
       "the same sources and blips produce the same draw list every frame -- the layout is a function of its inputs, nothing hidden.");
}

console.log(fails ? "\nradar-selfcheck: " + fails + " FAILED" : "\nradar-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
