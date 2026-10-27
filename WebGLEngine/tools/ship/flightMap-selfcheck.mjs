// WebGLEngine/tools/ship/flightMap-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time).
//
// Run: node tools/ship/flightMap-selfcheck.mjs      (a real browser, software rendering; the page is booted in an iframe like flightPage-selfcheck's)
//
// GATES the MAP SELECTOR on es-flight6dof.html: flat field (the default, the ground every pilot was trained and gated on), hills, the racing city's circuit scaled up, and the circuit on the hills. What is held:
// (1) THE DEFAULT IS THE FLAT FIELD and its terrain is the model's bit-for-bit fast path (terrain.flat); (2) EVERY MAP BOOTS AND FLIES with no page error, the three aircraft airborne after 150 ticks (the hills are 45 m
// against a mission at 220 to 380 m); (3) WHAT IS DRAWN IS WHAT THE MODEL COLLIDES WITH: sampled vertices of the drawn ground sit on terrain.height; (4) THE HILLS ARE REAL GROUND: a point 15 m up over a 30 m hill is open air on the
// flat map and a ground contact on the hills map (the same position, one step); (5) THE CIRCUIT IS DRAWN AND ON THE MINIMAP: a gate ring per checkpoint, a road and a line, and the minimap's layout holds a room per track cell.
//
// SABOTAGES, RESULTS BY NAME (each against es-flight6dof.html, this gate run, restored identical), every one 1 RED:
//   M1 stepFlight called without the terrain                       -> the hill-is-ground row
//   M2 the drawn hills lifted 17 m off the height function         -> the drawn-is-collided row
//   M3 the default map "hills"                                     -> the boots-on-the-flat-field row
//   M4 the circuit not handed to the minimap                       -> the circuit row (0 track cells)
//   M5 no gate rings                                               -> the circuit row (2 objects)
//   M6 the hills without the spawn clearing                        -> the relief-and-clear-spawn row
// THE FIRST RUN FOUND A BUG IN THE PAGE'S OWN HOOK: Object.assign copies a getter's VALUE once, so the hook's map, terrain and layout were frozen at their first reading; they are defineProperties accessors now.
"use strict";
import { runInEngineOrigin, webgpuSkipReason } from "./webgpuHarness.mjs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (name, cond, detail) => { console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? "   " + detail : ""}`); if (!cond) fails++; };
console.log("flightMap-selfcheck -- the map selector on the flight page\n");
const skip = webgpuSkipReason(createRequire(import.meta.url));
if (skip) { console.log("  SKIP  " + skip); console.log("  ----  *** NOT A PASS. ***"); fails++; }
else {
    const run = await runInEngineOrigin({ engineRoot: ENG, timeoutMs: 150000, script: `async () => {
        globalThis.__swekStep = "booting es-flight6dof.html";
        const errs = [], f = document.createElement("iframe"); f.style.width = "900px"; f.style.height = "600px"; f.src = "/es-flight6dof.html"; document.body.appendChild(f);
        await new Promise((res) => { f.onload = res; });
        const win = f.contentWindow, wait = (ms) => new Promise((r) => setTimeout(r, ms)), t0 = performance.now();
        win.addEventListener("error", (e) => errs.push(String(e.message).slice(0, 200)));
        while (performance.now() - t0 < 40000 && (!win.__flightDemo || win.__flightDemo.state().tick < 1)) await wait(200);
        if (!win.__flightDemo) return { booted: false };
        const D = win.__flightDemo; const first0 = { map: D.map, flat: D.terrain.flat }; D.setSpec(0, "scripted"); D.setSpec(1, "scripted"); D.setSpec(2, "scripted"); D.reset();   // no GPU seat: step() is the gate\'s clock
        const out = { booted: true, first: first0.map, firstFlat: first0.flat, maps: D.maps, per: {} };
        for (const name of D.maps) {
            globalThis.__swekStep = "map " + name;
            D.setMap(name); D.hold(true); D.step(150);
            const st = D.state(), g = D.mapGroup, rec = { airborne: st.fleet.filter((s) => s.status === "airborne").length, flat: D.terrain.flat, kids: g.children.length, rooms: D.mapLayout ? D.mapLayout.rooms.length : 0 };
            const mesh = g.children.find((o) => o.isMesh && o.geometry.attributes.position.count > 1000);
            if (mesh) { const P = mesh.geometry.attributes.position; let worst = 0; for (let k = 0; k < 8; k++) { const i = Math.floor((k + 0.5) / 8 * P.count); worst = Math.max(worst, Math.abs(P.getZ(i) - D.terrain.height(P.getX(i), P.getY(i)))); } rec.meshWorst = worst; }
            if (!D.terrain.flat) {   // find a 30 m point, then the same position as a flat map and as this one
                let best = null; for (let x = -3000; x <= 3000; x += 100) for (let y = -3000; y <= 3000; y += 100) { const h = D.terrain.height(x, y); if (!best || h > best.h) best = { x, y, h }; }
                rec.peak = best; rec.range = best.h - D.terrain.height(0, 0); rec.h0 = D.terrain.height(0, 0);
                D.place(0, [best.x, best.y, best.h - 15]); D.step(1); rec.insideHill = D.state().fleet[0].status;
                D.place(0, [best.x, best.y, best.h + 100]); D.step(1); rec.aboveHill = D.state().fleet[0].status;
            }
            out.per[name] = rec;
        }
        D.setMap("flat"); D.hold(true); D.place(0, [1500, 1500, 15]); D.step(1); out.flatLow = D.state().fleet[0].status;
        out.errs = errs;
        return out;
    }` });
    if (!run.ok || !run.result) ok("the page ran in the browser", false, JSON.stringify(run).slice(0, 300));
    else {
        const r = run.result;
        ok("the page boots on the flat field, whose terrain is the model's fast path", r.booted && r.first === "flat" && r.firstFlat === true, "map " + r.first);
        if (r.booted) {
            ok("the selector offers flat, hills, circuit and circuit on hills", ["flat", "hills", "circuit", "circuitHills"].every((m) => r.maps.includes(m)), r.maps.join(", "));
            const P = r.per;
            ok("!! every map boots and flies: three aircraft airborne after 150 ticks on each (" + Object.entries(P).map(([n, v]) => n + " " + v.airborne).join(", ") + ") with no page error", Object.values(P).every((v) => v.airborne === 3) && (r.errs || []).length === 0, (r.errs || []).join(" | "));
            ok("!! WHAT IS DRAWN IS WHAT THE MODEL COLLIDES WITH: the drawn hills' vertices sit on terrain.height (worst " + (P.hills.meshWorst || 0).toExponential(1) + " m)", P.hills.meshWorst !== undefined && P.hills.meshWorst < 1e-3 && P.circuitHills.meshWorst < 1e-3);
            ok("the hills are real relief (" + P.hills.range.toFixed(0) + " m above the spawn's clearing) and the spawn is clear (height " + P.hills.h0.toFixed(2) + " m there)", P.hills.range > 20 && Math.abs(P.hills.h0) < 1);
            ok("!! A HILL IS GROUND: 15 m under a " + P.hills.peak.h.toFixed(0) + " m crest the aircraft has hit it (" + P.hills.insideHill + "), 100 m over it is still flying (" + P.hills.aboveHill + "), and the same kind of low point on the flat map is open air (" + r.flatLow + ")", P.hills.insideHill !== "airborne" && P.hills.aboveHill === "airborne" && r.flatLow === "airborne");
            ok("!! the circuit is DRAWN (a line, a road, a gate ring a cell: " + P.circuit.kids + " objects) and on the minimap (" + P.circuit.rooms + " track cells as rooms); the flat and hills maps have neither", P.circuit.kids >= 20 && P.circuit.rooms >= 20 && P.flat.kids === 0 && P.flat.rooms === 0 && P.hills.rooms === 0);
        }
    }
}
console.log(`\nflightMap-selfcheck: ${fails === 0 ? "all passed" : fails + " FAILED"}`);
process.exit(fails === 0 ? 0 : 1);
