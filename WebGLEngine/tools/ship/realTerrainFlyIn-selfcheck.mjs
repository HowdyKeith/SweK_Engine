// WebGLEngine/tools/ship/realTerrainFlyIn-selfcheck.mjs -- v4061
//
// GATES v4058's window.realTerrain.flyIn() -- previously verified only by ARITHMETIC AND SOURCE (rig/
// cinematicShot-selfcheck.mjs section 5c checks the flat-world-as-sphere math and greps main.js for the right
// shape of call), never by an actual rendered frame. Keith's own words: "build the headless harness that
// actually watches a real-terrain fly-in." This is that harness: it boots the REAL bootstrap page (index.html,
// not a stripped fixture), fetches a REAL location through the REAL data pipeline (world/realTerrainData.js ->
// world/realTerrainStamp.js), and then WATCHES THE CAMERA MOVE for the full ~22s dive/descent/orbit flight
// rather than taking one screenshot on a guessed clock -- the exact mistake v4055/v4056 paid for once already
// (a "wash" frame that only a full, polled watch of the shot would have caught; see cinematicShot-selfcheck.mjs
// section 5c's changelog for that history).
//
// *** NETWORK, STUBBED ON PURPOSE, NOT BECAUSE THE SANDBOX CAN'T REACH IT. *** Open-Meteo and both Overpass
// mirrors are unreachable from THIS box (agent proxy: CONNECT tunnel failed, 403) -- but a permanent CI gate
// that depends on two third-party APIs staying up is a worse gate than one that doesn't, on ANY box. So
// page.route() intercepts exactly world/realTerrainData.js's three endpoints (elevation, both Overpass
// mirrors) and returns synthetic-but-VALID data shaped exactly like the real APIs: elevation with genuine
// per-point variance (not a flat plane -- that would let a broken interpolator pass), one road way, one
// building way, one water way, all real OSM Overpass JSON shape (`{elements:[{type:"way",tags,geometry}]}`)
// with points placed inside the fetched bbox. Everything else on http://swek.local/* is served from disk,
// exactly like firewallBanner-selfcheck.mjs and goLinkStyle-selfcheck.mjs already do for server.html/page-
// index.html -- this is the same pattern, walked one page further to the real engine bootstrap.
//
// WHAT WOULD HAVE SLIPPED THROUGH ARITHMETIC ALONE: a `.play()` call that no-ops because cameraCinematic never
// installed (silently swallowed by v4058's own `if (window.cameraCinematic?.play)` guard -- a source grep
// cannot tell "guarded and firing" from "guarded and silently skipping"); a flight that snaps to the end frame
// in one tick instead of animating (TrackAnimator regression); terrain that never actually voxelizes even
// though `.load()` returns a summary object that LOOKS complete. All three are checked here by polling live
// state through the real ~22s duration, not by reading source or grabbing one frame.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { resolvePlaywright, browserSkipReason, HEADLESS_SHELL } from "./playwrightResolve.mjs";

const require_ = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

const { chromium, from: pwFrom } = resolvePlaywright(require_);
const skip = browserSkipReason(chromium, pwFrom, HEADLESS_SHELL);
if (skip) { console.log("realTerrainFlyIn-selfcheck: SKIPPED -- " + skip); process.exit(0); }

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const report = (l) => console.log("  ----  " + l);
console.log("realTerrainFlyIn-selfcheck -- watching v4058's real-terrain fly-in actually fly, in a real browser\n");

// ---- synthetic-but-valid data, shaped exactly like world/realTerrainData.js's own three endpoints --------
// Keith's own default (realterrain.html): 41.7001, -71.4162 (Rhode Island).
const LAT = 41.7001, LON = -71.4162;

function syntheticElevation(lats, lons) {
    // Real variance, not a flat plane -- a broken interpolator that treats min==max would pass a flat mock.
    return lats.map((la, i) => 28 + 14 * Math.sin(la * 137.1) + 9 * Math.cos(lons[i] * 91.7));
}
function wayEl(tags, pts) { return { type: "way", tags, geometry: pts.map(([lat, lon]) => ({ lat, lon })) }; }
function overpassBody(queryText) {
    if (/"highway"/.test(queryText)) {
        return { elements: [wayEl({ highway: "residential", name: "Synthetic Test Rd" },
            [[LAT - 0.0015, LON - 0.0015], [LAT, LON], [LAT + 0.0015, LON + 0.0015]])] };
    }
    if (/"building"/.test(queryText)) {
        return { elements: [wayEl({ building: "yes", height: "9" },
            [[LAT + 0.0008, LON + 0.0008], [LAT + 0.0008, LON + 0.0012], [LAT + 0.0012, LON + 0.0012], [LAT + 0.0012, LON + 0.0008], [LAT + 0.0008, LON + 0.0008]])] };
    }
    if (/"natural"="water"|waterway/.test(queryText)) {
        return { elements: [wayEl({ natural: "water" },
            [[LAT - 0.0012, LON + 0.0004], [LAT - 0.0012, LON + 0.0008], [LAT - 0.0008, LON + 0.0008], [LAT - 0.0008, LON + 0.0004], [LAT - 0.0012, LON + 0.0004]])] };
    }
    return { elements: [] };
}

const browser = await chromium.launch({ executablePath: HEADLESS_SHELL });
const page = await browser.newPage();
const pageErrors = [];
page.on("pageerror", (e) => pageErrors.push(String(e).slice(0, 200)));

let elevationRequests = 0, overpassRequests = 0;
await page.route("**/*", (route) => {
    const u = new URL(route.request().url());
    if (u.hostname === "api.open-meteo.com" && u.pathname === "/v1/elevation") {
        elevationRequests++;
        const lats = (u.searchParams.get("latitude") || "").split(",").map(Number);
        const lons = (u.searchParams.get("longitude") || "").split(",").map(Number);
        return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ elevation: syntheticElevation(lats, lons) }) });
    }
    if ((u.hostname === "overpass-api.de" || u.hostname === "overpass.kumi.systems") && u.pathname === "/api/interpreter") {
        overpassRequests++;
        const body = route.request().postData() || "";
        const q = decodeURIComponent(body.replace(/^data=/, ""));
        return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(overpassBody(q)) });
    }
    if (u.hostname === "swek.local") {
        const p = path.join(ROOT, decodeURIComponent(u.pathname));
        if (fs.existsSync(p) && fs.statSync(p).isFile()) {
            const ext = path.extname(p);
            const type = ext === ".mjs" || ext === ".js" ? "text/javascript"
                : ext === ".html" ? "text/html" : ext === ".json" ? "application/json"
                : ext === ".css" ? "text/css" : "application/octet-stream";
            return route.fulfill({ status: 200, contentType: type, body: fs.readFileSync(p) });
        }
        return route.fulfill({ status: 404, body: "not found" });
    }
    // Anything else (fonts, third-party widgets, weather forecast, etc.) -- 404 rather than hitting the real
    // network. main.js's own subsystems already wrap these in try/catch (that is what lets server.html boot
    // cleanly in firewallBanner-selfcheck.mjs today); a real fly-in does not need any of them to succeed.
    return route.fulfill({ status: 404, body: "not found" });
});

try {
    console.log("1. BOOT -- the real bootstrap page, not a stripped fixture");
    await page.goto("http://swek.local/index.html", { waitUntil: "domcontentloaded", timeout: 30000 });
    let readyErr = null;
    await page.waitForFunction(
        () => window.realTerrain && window.cameraCinematic && window.world && window.camera && typeof window.realTerrain.load === "function",
        { timeout: 30000 }
    ).catch((e) => { readyErr = e; });
    ok("!! index.html boots to a ready engine: window.realTerrain / cameraCinematic / world / camera all present",
        !readyErr, readyErr ? String(readyErr).slice(0, 160) : "ready");

    console.log("\n2. FETCH -- a real location through the real data pipeline (mocked transport only)");
    // Clouds default ON at boot (main.js's own "cumulus on by default" fallback) -- so checking cumulus AFTER
    // the flight proves nothing on its own. Force them off first so a later "cumulus" reading can only mean
    // flyIn's own window.clouds?.set?.() actually fired, not that the default state coincidentally agreed.
    await page.evaluate(() => { try { window.clouds.off(); } catch {} });
    const summary = await page.evaluate(async ({ lat, lon }) => {
        try {
            const s = await window.realTerrain.load({ lat, lon, sizeM: 1200, grid: 16, buildings: true, water: true });
            return { ok: true, s, last: window.realTerrain.last ? { min: window.realTerrain.last.min, max: window.realTerrain.last.max, grid: window.realTerrain.last.grid } : null };
        } catch (e) { return { ok: false, error: String(e && e.message || e) }; }
    }, { lat: LAT, lon: LON });

    ok("!! realTerrain.load({lat,lon}) resolved without throwing", summary.ok, summary.ok ? "" : summary.error);
    ok("!! fetchElevationGrid actually hit the (mocked) Open-Meteo endpoint", elevationRequests > 0, elevationRequests + " request(s)");
    ok("!! fetchStreets/fetchBuildings/fetchWater actually hit the (mocked) Overpass endpoint", overpassRequests >= 3, overpassRequests + " request(s) (expect >=3: streets, buildings, water)");
    if (summary.ok) {
        ok("!! elevation carries real per-point variance, not a flat plane", summary.last && summary.last.min < summary.last.max,
            summary.last ? `min=${summary.last.min.toFixed(2)} max=${summary.last.max.toFixed(2)}` : "no data");
        ok("!! the synthetic road actually voxelized (roadsPainted > 0)", summary.s.roadsPainted > 0, "roadsPainted=" + summary.s.roadsPainted);
        ok("!! the synthetic building actually voxelized (buildingsPainted > 0)", summary.s.buildingsPainted > 0, "buildingsPainted=" + summary.s.buildingsPainted);
    }

    console.log("\n3. WATCH -- poll the live flight through its real ~26s duration, not one screenshot on a guessed clock");
    const samples = [];
    const t0 = Date.now();
    let sawPlaying = false, sawStop = false;
    while (Date.now() - t0 < 27000) {
        // v4134 -- the arrival's LAYERS are sampled on the same poll. This flight is already running, and the
        // band is only observable WHILE the camera is moving; standing up a second browser harness to watch
        // the same 26 seconds would be the duplicate-definition shape this tree keeps paying for.
        const s = await page.evaluate(() => ({
            playing: !!(window.cameraCinematic && window.cameraCinematic.isPlaying),
            x: camera.position.x, y: camera.position.y, z: camera.position.z,
            yaw: camera.yaw, pitch: camera.pitch,
            band: (() => { try { return window.arrivalLayers?.status?.().band ?? null; } catch { return null; } })(),
            sats: (() => { try { return window.orbitPass?.status?.().count ?? null; } catch { return null; } })(),
        }));
        samples.push(Object.assign(s, { tMs: Date.now() - t0 }));
        if (s.playing) sawPlaying = true;
        if (sawPlaying && !s.playing) { sawStop = true; break; }
        await page.waitForTimeout(200);
    }
    const playingSamples = samples.filter((s) => s.playing);
    const distinctPositions = new Set(playingSamples.map((s) => s.x.toFixed(3) + "," + s.y.toFixed(3) + "," + s.z.toFixed(3))).size;
    const flightMs = playingSamples.length ? playingSamples[playingSamples.length - 1].tMs - playingSamples[0].tMs : 0;

    ok("!! cameraCinematic actually started playing the clip (isPlaying went true) -- catches a silently swallowed .play() guard",
        sawPlaying, sawPlaying ? "" : "isPlaying never observed true -- the play() call in flyIn() either never fired or was skipped");
    ok("!! ...and actually stopped on its own within the polling window -- catches a clip that never ends or never starts",
        sawStop, sawStop ? "" : (sawPlaying ? "still playing after 27s poll (clip should be ~22s)" : "n/a, never started"));
    ok("!! the camera visited MANY distinct positions while playing, not one teleport -- catches a snap-to-end regression",
        distinctPositions >= 15, distinctPositions + " distinct positions across " + playingSamples.length + " playing samples");
    // v4134 -- THE SHOT GREW A LEG AND THIS CLAIM HAD TO GROW WITH IT. flyIn now opens ABOVE the aircraft
    // (4s orbital, from an altitude of ~2120) before the original three legs, because the old shot peaked at
    // ~200 while adsbLayer puts a 40,000 ft airliner at 190 -- there was nowhere for a satellite layer to be.
    // The bound is widened to match rather than left alone: 26s still passes a 15-27s window by luck, and a
    // check whose NAME describes legs the shot no longer has is a false statement that happens to be green.
    ok("!! the observed flight duration is close to the ~26s the shot's own legs define (4s orbital + 4s dive + 8s descent + 10s orbit)",
        flightMs > 18000 && flightMs < 32000, (flightMs / 1000).toFixed(1) + "s observed");
    // v4134 -- WHAT THE ARRIVAL ACTUALLY PASSED THROUGH, observed rather than asserted.
    {
        const seq = samples.map((x) => x.band).filter(Boolean).filter((b, i, a) => b !== a[i - 1]);
        ok("!! the arrival layers RAN and reported a band while the camera was flying",
            seq.length > 0, seq.length ? "bands: " + seq.join(" -> ") : "no band ever reported");
        ok("!! ...and the band CHANGED on the way down -- the handover actually happened",
            seq.length >= 2,
            "one band for the whole flight means the stager ran and never crossed an edge, which is also " +
            "exactly what a shot that never reaches the satellite shell would look like");
        // THE FLICKER CHECK, and it is here because this is where the flicker was FOUND. Watching a real
        // flight measured satellites going 5 -> 0 -> 5 -> 0: layersAt is monotone in altitude, but the dive
        // leg interpolates distance and pitch independently so the camera dips to ~228 and climbs back to
        // ~440 before landing. No pure-function check could see that; only the live camera could.
        // COUNT RISING EDGES, not state changes. The first draft counted changes and read the pre-flight
        // sample (no satellites yet, before the stager's first frame) as one -- and it also filtered on `x.p`
        // when the field here is `playing`, so it never restricted to the flight at all. Two mistakes that
        // between them turned a clean single appearance into "3". A FLICKER IS THE SATELLITES COMING BACK:
        // one rising edge is the feature working, two or more is the churn this check exists to catch.
        // COUNT RETURNS, NOT RISES -- and the difference is not pedantry, it is the check working at all.
        // Counting rising edges and allowing one passed the sabotage: with the latch removed the satellites
        // went on -> off -> ON, exactly one rise, and the check that exists to catch that said PASS. A RETURN
        // is a rise that happens AFTER a dismissal, which is precisely "they came back", and it is robust to
        // whichever state the first sampled frame happens to catch.
        const onSeq = samples.filter((x) => x.playing).map((x) => (x.sats || 0) > 0);
        let seenOn = false, seenOffAfterOn = false, returns = 0;
        for (const v of onSeq) {
            if (v && seenOffAfterOn) { returns++; seenOffAfterOn = false; }
            else if (v) seenOn = true;
            else if (seenOn) seenOffAfterOn = true;
        }
        ok("!! once dismissed the satellites do NOT come back -- no spawn/despawn flicker across the hump",
            returns === 0 && onSeq.some(Boolean),
            returns + " return(s) after dismissal; they were live in " + onSeq.filter(Boolean).length +
            " of " + onSeq.length + " flight samples -- the camera dips to ~228 and climbs back to ~440 " +
            "mid-dive, which is what made this flicker in the first place");
        const peakSats = Math.max(0, ...samples.map((x) => x.sats || 0));
        report("satellites spawned at peak: " + peakSats + (peakSats === 0
            ? "  -- REPORTED, NOT ASSERTED: zero means orbitPass never got a mesh into the world. assetLoader " +
              "readiness is a GPU-side race this harness does not control, so failing on it would make a real " +
              "gate flaky; but zero here is still a thing to go and look at on the rig."
            : ""));
    }
    report(`sampled ${samples.length} frames over ${((Date.now() - t0) / 1000).toFixed(1)}s`);

    console.log("\n4. LANDING STATE -- weather crossed, no page errors");
    const cloudsNow = await page.evaluate(() => (window.clouds ? window.clouds.current() : null));
    ok("!! the cloud deck was switched on for the descent (flyIn's own o.clouds!==false branch) -- clouds were forced off before the flight, so this can only be flyIn's own doing",
        cloudsNow === "cumulus", "clouds.current() = " + cloudsNow);
    const realErrs = pageErrors.filter((e) => !/Failed to load resource/.test(e));
    ok("!! zero page errors across boot, fetch, and the full watched flight", realErrs.length === 0, realErrs[0] || "clean");
} finally {
    await browser.close();
}

console.log(fails ? `\nrealTerrainFlyIn-selfcheck: ${fails} FAILED` : "\nrealTerrainFlyIn-selfcheck: all checks pass");
if (fails) process.exit(1);
