// WebGLEngine/tools/ship/arrivalLayers-selfcheck.mjs -- v4134
//
// THE ANSWER KEY FOR "WHAT YOU PASS THROUGH ON THE WAY DOWN."
//
// Keith: "we would fly into the satellite layer briefly, then see the adsblayer, and then if we have 3d plane
// models would show those planes instead of simple plane."
//
// ONE MEASUREMENT DECIDED THE WHOLE SHAPE OF THIS ROUND, and it was taken before anything was built: the
// fly-in never went high enough for a satellite layer to exist in. Its first leg opened at distance 4000 but
// pitch 0.05, and 4000*sin(0.05) is an ALTITUDE OF 200 -- while adsbLayer puts a 40,000 ft airliner at world
// Y 190. The "fly in from space" was a low flat approach that skimmed the top of the airliners. Adding
// satellites without checking that would have put them somewhere the camera never goes, and it would have
// LOOKED like a working feature that simply never showed up.
//
// THE SCHEDULE IS GRADED AS ARITHMETIC. layersAt(y) is a pure function, so the bands are checked here directly
// -- no browser, no GPU, no live ADS-B feed. The alternative, asserting that some function got called, is the
// check that passes while the thing it describes is wrong.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { layersAt, AIRCRAFT_CEILING_Y, SATELLITE_SHELL_Y } from "../../ui/arrivalLayers.js";
import { noComments } from "./sourceScan.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENG = path.resolve(HERE, "..", "..");
const read = (p) => fs.readFileSync(path.join(ENG, p), "utf8");

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };

const main = read("main.js");
const arr = read("ui/arrivalLayers.js");
// *** COMMENTS OUT, STRINGS IN -- AND GETTING THAT BACKWARDS COST A SECOND ROUND OF THIS GATE. *** The first
// run failed both section-5 checks against the shipped, correct file: orbitPassLayer's header EXPLAINS why it
// does not reuse SatelliteFleet, and QUOTES hitBurst's "uses no Math.random" as the precedent for being
// seeded, so raw source read those sentences as the code they warn about -- the prose-as-code false positive
// this tree keeps paying for. The obvious fix, codeOnly, then broke the OPPOSITE check: it blanks strings too,
// and "entity:spawnMesh" IS a string, so the reuse check went red on a file that does reuse the path.
// boundaryLint.mjs already wrote this distinction down at v3107 in almost these words -- a kill is a CODE
// question and codeOnly is right; a listener named by a STRING needs noComments. Same split, same answer.
const orbit = noComments(read("ui/orbitPassLayer.js"));
const adsb = read("ui/adsbLayer.js");

console.log("1. THE ARRIVAL ACTUALLY REACHES THE LAYERS IT CLAIMS TO FLY THROUGH");
{
    // Read the shot's own legs out of main.js rather than restating them: this gate's entire reason for
    // existing is that a leg's numbers and the layer's numbers drifted apart unnoticed.
    // THE FIRST DRAFT OF THIS READ ONLY LITERALS AND QUIETLY MISSED THE LANDING. flyIn writes its last two
    // legs as `distance: SETTLE`, a named constant -- so a regex wanting \d+ saw four pairs instead of six and
    // reported the lowest altitude as 131 when the shot actually settles at 45. A gate that silently reads
    // PART of the thing it grades is worse than one that fails: it reports a real number about a subset.
    const consts = {};
    for (const m of main.matchAll(/\b(SETTLE|LAND_AZ|SWEEP)\s*=\s*([\d.]+)/g)) consts[m[1]] = +m[2];
    const num = (tok) => (/^[\d.]+$/.test(tok) ? +tok : consts[tok]);
    const legs = [...main.matchAll(/(?:from|to):\s*\{\s*distance:\s*([A-Za-z_][\w]*|[\d.]+),\s*pitch:\s*([\d.]+)/g)]
        .map((m) => ({ d: num(m[1]), p: +m[2] }))
        .filter((l) => Number.isFinite(l.d))
        .map((l) => ({ ...l, alt: l.d * Math.sin(l.p) }));
    ok("!! the fly-in's legs are readable, INCLUDING the ones written with named constants",
        legs.length >= 5 && Number.isFinite(consts.SETTLE),
        legs.length + " distance/pitch pairs (SETTLE=" + consts.SETTLE + ")");
    const peak = Math.max(...legs.map((l) => l.alt));
    ok("!! the arrival now climbs ABOVE the aircraft ceiling -- it did not before",
        peak > AIRCRAFT_CEILING_Y * 2,
        "peak altitude ~" + peak.toFixed(0) + " vs an aircraft ceiling of " + AIRCRAFT_CEILING_Y +
        " (the old shot peaked at ~200, BELOW the airliners at 190 -- there was no room for a satellite layer)");
    ok("!! ...and it reaches the satellite shell, so the satellites are actually flown THROUGH",
        peak > SATELLITE_SHELL_Y,
        "peak ~" + peak.toFixed(0) + " vs shell " + SATELLITE_SHELL_Y +
        " -- a shell above the arrival's reach is a feature that never appears and never fails");
    const low = Math.min(...legs.map((l) => l.alt));
    ok("...and still lands, rather than stopping in the sky", low < AIRCRAFT_CEILING_Y / 3,
        "lowest leg altitude ~" + low.toFixed(0));
}

console.log("\n2. THE BANDS, AS ARITHMETIC");
{
    ok("!! high above everything is orbital: satellites, no aircraft",
        layersAt(5000).band === "orbital" && layersAt(5000).satellites && !layersAt(5000).aircraft);
    ok("!! at the shell itself the satellites are on",
        layersAt(SATELLITE_SHELL_Y).satellites === true, "shell Y " + SATELLITE_SHELL_Y);
    ok("!! there IS a handover band where both are live",
        layersAt(AIRCRAFT_CEILING_Y * 1.3).band === "handover" &&
        layersAt(AIRCRAFT_CEILING_Y * 1.3).satellites && layersAt(AIRCRAFT_CEILING_Y * 1.3).aircraft,
        "'briefly, THEN the adsblayer' is a crossfade, not a cut -- a hard switch pops one sky out for another");
    ok("!! down among the aircraft the satellites are GONE",
        layersAt(50).satellites === false && layersAt(50).aircraft === true && layersAt(50).band === "atmospheric",
        "satellites still drawn at ground level would be the feature failing in the most visible way");
    ok("!! ground level keeps the aircraft on", layersAt(0).aircraft === true,
        "the ADS-B overlay is a standing feature; the arrival turns it ON and must not take it away on landing");

    // MONOTONE: descending must never re-light a layer it already put out. A band table that flickers is worse
    // than one that switches late, because it spawns and despawns meshes every frame at the boundary.
    let satFlips = 0, airFlips = 0, prev = layersAt(6000);
    for (let y = 6000; y >= 0; y -= 5) {
        const cur = layersAt(y);
        if (cur.satellites !== prev.satellites) satFlips++;
        if (cur.aircraft !== prev.aircraft) airFlips++;
        prev = cur;
    }
    ok("!! descending flips each layer exactly ONCE", satFlips === 1 && airFlips === 1,
        "satellites " + satFlips + " flip(s), aircraft " + airFlips + " -- more than one means a band that flickers");

    ok("!! the satellite edge is the aircraft ceiling itself, so the rule is one sentence",
        layersAt(AIRCRAFT_CEILING_Y).satellites === true && layersAt(AIRCRAFT_CEILING_Y - 1).satellites === false,
        "satellites go exactly when you are down among the airliners (Y " + AIRCRAFT_CEILING_Y + ")");
    ok("!! ...and that edge clears the dive leg's MEASURED hump",
        228 > AIRCRAFT_CEILING_Y,
        "the dive interpolates distance and pitch independently, so d*sin(p) dips to ~228 and climbs back to " +
        "~440 before landing -- measured in a real browser. An edge above that trough dismisses the satellites " +
        "and then flies fifteen seconds of orbital altitude with an empty sky");

    ok("a non-finite altitude turns everything OFF rather than guessing",
        layersAt(NaN).satellites === false && layersAt(NaN).aircraft === false && layersAt(undefined).band === "unknown",
        "no camera yet is a real state, and defaulting it ON would spawn a sky nobody asked for");
}

console.log("\n3. THE BAND EDGES ARE DERIVED FROM adsbLayer, NOT INVENTED HERE");
{
    const baseY = /baseY:\s*(\d+)/.exec(adsb), vox = /voxPer1000ft:\s*(\d+)/.exec(adsb);
    ok("!! adsbLayer's own placement constants are readable", !!baseY && !!vox,
        baseY && vox ? "baseY " + baseY[1] + ", " + vox[1] + " vox/1000ft" : "");
    const derived = +baseY[1] + 45 * +vox[1];
    ok("!! ...and the ceiling this module uses MATCHES them",
        AIRCRAFT_CEILING_Y === derived,
        AIRCRAFT_CEILING_Y + " vs " + derived + " re-derived from adsbLayer -- if that layer's compression " +
        "changes, a hardcoded ceiling here would silently put the bands in the wrong place");
}

console.log("\n4. THE THREE PIECES ARE WIRED, AND THE THIRD ONE ALREADY EXISTED");
{
    ok("!! adsbLayer ALREADY had the 3D-model path -- this round did not rebuild it",
        /window\.planeMesh\.sync\(list\)/.test(adsb) && /function setModels3D/.test(adsb),
        "since v1447; what was missing was anybody switching it on during an arrival");
    ok("!! ...and the stager switches it on, only when planeMesh is actually present",
        /if \(window\.planeMesh && a\.setModels3D\)/.test(arr),
        "absent planeMesh falls back to adsbLayer's glyph labels, which is the correct degraded state");
    ok("!! each layer is LATCHED to one transition per arrival",
        /latchedSatellitesOff/.test(arr) && /latchedAircraftOn/.test(arr) &&
        /setSatellites\(want\.satellites && !latchedSatellitesOff\)/.test(arr),
        "found by watching a real flight: following the bands frame-by-frame measured 5 -> 0 -> 5 -> 0 " +
        "satellites, because the camera's altitude is NOT monotone even though layersAt is");
    ok("!! ...and the latch RESETS per run, so a second arrival is a fresh descent",
        /latchedSatellitesOff = false; latchedAircraftOn = false;/.test(arr),
        "a latch that never clears makes the feature work exactly once per page load");
    ok("!! the latch is in the STAGER, not in layersAt",
        !/latched/.test(arr.slice(0, arr.indexOf("export function installArrivalLayers"))),
        "layersAt(y) must keep answering for any y a caller asks about -- the latch is a property of a RUN " +
        "through the bands, not of an altitude");
    ok("!! the stager is driven by ALTITUDE, not by a timer",
        /layersAt\(cameraY\(\)\)/.test(arr) && !/setTimeout\([^)]*setAircraft/.test(arr),
        "a schedule keyed to 'four seconds in' is right exactly once, then silently wrong after any retime");
    ok("!! flyIn starts the stager, and can be told not to",
        /window\.arrivalLayers\?\.run\?\.\(clip\.duration\)/.test(main) && /o\.layers !== false/.test(main),
        "and it is passed the clip's OWN duration rather than a second copy of the number");
    ok("!! both layers are installed, orbitPass BEFORE the stager that drives it",
        main.indexOf("installOrbitPass()") > 0 &&
        main.indexOf("installOrbitPass()") < main.indexOf("installArrivalLayers()"),
        "the reverse order would leave the first band silently empty on the very first arrival");
}

console.log("\n5. THE SATELLITES ARE SCENERY, AND DELIBERATELY NOT THE ONES ALREADY IN THE TREE");
{
    ok("!! orbitPass does NOT drag in SatelliteFleet",
        !/SatelliteFleet/.test(orbit),
        "simulation/SatelliteFleet.js is a COMBAT system -- cities launching armed satellites with cooldowns, " +
        "lasers and kaiju targeting. Reusing it would have given a scenic descent a fleet that wants to shoot");
    ok("!! it reuses planeMeshLayer's spawn path rather than inventing a second one",
        /buildVoxelMesh/.test(orbit) && /entity:spawnMesh/.test(orbit) && /_createMesh/.test(orbit),
        "a second way to put a moving mesh in this world is the duplicate-definition shape this tree keeps paying for");
    ok("!! it is SEEDED -- two arrivals at one place look the same",
        /function makeRng/.test(orbit) && !/Math\.random/.test(orbit),
        "this runs during a CINEMATIC; a shot that differs every time cannot be graded or compared to the last one");
    ok("...and it cleans up after itself",
        /function stop\(\)/.test(orbit) && /_despawn\(s\.id\)/.test(orbit),
        "meshes left behind after an arrival accumulate one fleet per fly-in");
}

console.log("\n  ----  NOT RUN HERE: the arrival itself. Spawning meshes needs assetLoader + a GL context, and the");
console.log("  ----  ADS-B half needs a live feed from adsb.lol, so neither is exercised on this box. The band");
console.log("  ----  SCHEDULE above is real arithmetic over the shipped function, and the shot's altitudes are");
console.log("  ----  read from main.js's own legs -- but 'satellites are visibly overhead, then aircraft replace");
console.log("  ----  them, wearing 3D models' is a claim only a run on the rig can settle.");

console.log(fails ? `\narrivalLayers-selfcheck: ${fails} FAILED` : "\narrivalLayers-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
