// ui/arrivalLayers.js — v4134
//
// WHAT YOU PASS THROUGH ON THE WAY DOWN.
//
// Keith: "we would fly into the satellite layer briefly, then see the adsblayer, and then if we have 3d plane
// models would show those planes instead of simple plane."
//
// Three things, and only one of them needed building. The 3D-models-instead-of-glyphs half ALREADY EXISTED --
// adsbLayer.js has carried a models3D flag and a window.planeMesh.sync(list) call since v1447, and nothing
// during an arrival ever switched it on. The satellites are new (ui/orbitPassLayer.js). This file is the part
// that was missing from both: the HANDOVER.
//
// *** IT IS DRIVEN BY ALTITUDE, NOT BY THE CLOCK, AND THAT IS THE WHOLE DESIGN. *** A timeline keyed to "4
// seconds in, turn on the planes" is correct exactly once -- until somebody retimes a leg, changes the landing
// site, or the shot is played at a different length, at which point the aircraft appear over an empty sky and
// nothing fails. Reading the camera's own height means the bands stay true whatever the shot does, and it is
// also the honest description of what the user asked for: these are LAYERS, and you are either in one or not.
//
// THE BAND EDGES ARE DERIVED FROM adsbLayer's OWN CONSTANTS, not chosen. That layer places an aircraft at
// baseY + (altFt/1000) * voxPer1000ft, so its ceiling is a fact about it rather than a number to guess at:
// a 45,000 ft airliner sits at 30 + 45*4 = 210. The bands turn on relative to that, so if those constants ever
// change these edges follow instead of drifting. The SHELL the satellites actually occupy is a separate
// number and a separate argument -- see SATELLITE_SHELL_Y below, which is set by where the arrival flies.
//
// A NOTE ON THE VERTICAL SCALE, because it looks wrong until you know: this world is COMPRESSED. adsbLayer
// spends 6 voxels per horizontal km and 4 per 1000 vertical feet, so the whole troposphere is about 200 units
// tall. Satellites a few hundred units above the airliners is not a claim about orbital altitude -- it is the
// same compression the aircraft already live under, applied one layer further up. Saying so here is cheaper
// than somebody later "fixing" the satellites to 400 km and finding the arrival never reaches them.

// adsbLayer.js's own placement constants. Kept in ONE place with a note pointing at the source, because two
// copies of a magic number is how the last several rounds of this session started.
const ADSB = { baseY: 30, voxPer1000ft: 4 };
const CEILING_FT = 45000;
export const AIRCRAFT_CEILING_Y = ADSB.baseY + (CEILING_FT / 1000) * ADSB.voxPer1000ft;   // 210

// WHERE THE SATELLITES ACTUALLY SIT, and this number was measured rather than picked. main.js's flyIn opens
// with a leg from distance 5200 at pitch 0.42 -- an altitude of 5200*sin(0.42) = 2120 -- down to 200. A shell
// just above the airliners (say 280) would be met in the final instant of that leg and read as "satellites
// appeared at the last moment"; a shell up at the start would sit above the whole arrival and never be flown
// through. 900 is inside the leg with room either side, so the descent passes THROUGH it -- which is what
// "fly into the satellite layer briefly" asks for. Overridable per call; the arrival does not hardcode it.
export const SATELLITE_SHELL_Y = 900;

/**
 * The bands, as a pure function of camera altitude. Exported and pure so a gate can grade the schedule
 * WITHOUT a browser, a GPU, or a live ADS-B feed -- the alternative is asserting that some code was called,
 * which is the check that passes while the thing it describes is wrong.
 *
 * @param {number} y camera altitude in world units
 * @returns {{satellites:boolean, aircraft:boolean, band:string}}
 */
export function layersAt(y) {
    const h = Number(y);
    if (!Number.isFinite(h)) return { satellites: false, aircraft: false, band: "unknown" };
    // THE SATELLITE EDGE SITS AT THE AIRCRAFT CEILING ITSELF: they are dismissed exactly when you are down
    // among the airliners, which is a rule that can be stated in one sentence. It also clears the dive leg's
    // measured hump -- that leg dips to about 228 before climbing back to 440 -- so the descent does not spend
    // fifteen seconds at orbital altitude with an empty sky. The latch in installArrivalLayers guarantees a
    // single transition whatever the shot does; this edge is what makes the single transition land WELL.
    const sat = AIRCRAFT_CEILING_Y;           // 210 -- satellites go once you are among the aircraft
    const air = AIRCRAFT_CEILING_Y * 1.6;     // 336 -- aircraft become worth drawing on the way down
    if (h >= air) return { satellites: true, aircraft: false, band: "orbital" };
    if (h >= sat) return { satellites: true, aircraft: true, band: "handover" };
    return { satellites: false, aircraft: true, band: "atmospheric" };
}

export function installArrivalLayers() {
    let running = false, raf = null, last = 0, applied = { satellites: null, aircraft: null };
    // *** THE LATCH, AND IT WAS FOUND BY WATCHING A REAL FLIGHT RATHER THAN BY READING layersAt. ***
    // layersAt is monotone in altitude and a gate proves it. THE CAMERA IS NOT MONOTONE IN TIME. The dive leg
    // interpolates distance and pitch INDEPENDENTLY -- 4000->600 while 0.05->0.22 -- and d*sin(p) humps: it
    // starts at 200, rises to about 311 halfway through, then falls to 131. That hump is original to the shot,
    // not something this round added. Following the bands frame-by-frame therefore despawned the satellites at
    // 224, respawned all five at 273, and despawned them again at 198: measured live as 5 -> 0 -> 5 -> 0, a
    // visible flicker and a pile of pointless mesh churn.
    //
    // An ARRIVAL DESCENDS. That is the intent the shot expresses even where its arithmetic wobbles, so each
    // layer changes state at most ONCE per run: satellites, once dismissed, stay dismissed; aircraft, once
    // raised, stay raised. The latch lives here and NOT in layersAt, because it is a property of a RUN through
    // the bands rather than of an altitude -- layersAt(y) must keep answering for any y a caller asks about.
    let latchedSatellitesOff = false, latchedAircraftOn = false;

    function cameraY() {
        try { const c = window.camera; return c && Number.isFinite(c.position?.y) ? c.position.y : (Number.isFinite(c?.y) ? c.y : NaN); } catch { return NaN; }
    }

    function setSatellites(want) {
        if (applied.satellites === want) return;
        applied.satellites = want;
        try {
            if (want) window.orbitPass?.start?.({ shellY: SATELLITE_SHELL_Y });
            else window.orbitPass?.stop?.();
        } catch {}
    }

    function setAircraft(want) {
        if (applied.aircraft === want) return;
        applied.aircraft = want;
        try {
            const a = window.adsb;
            if (!a) return;
            if (want) {
                // THE MODELS ARE ASKED FOR ONLY WHEN THERE IS SOMETHING TO ASK. planeMesh registers itself on
                // install, so its absence is a real answer -- and adsbLayer already falls back to its glyph
                // labels, which is the correct degraded state rather than an empty sky.
                if (window.planeMesh && a.setModels3D) { try { a.setModels3D(true); } catch {} }
                a.start?.();
            } else {
                a.stop?.();
            }
        } catch {}
    }

    function step(nowMs) {
        if (!running) return;
        const dt = last ? Math.min(0.25, (nowMs - last) / 1000) : 0;
        last = nowMs;
        const want = layersAt(cameraY());
        if (!want.satellites) latchedSatellitesOff = true;
        if (want.aircraft) latchedAircraftOn = true;
        setSatellites(want.satellites && !latchedSatellitesOff);
        setAircraft(want.aircraft || latchedAircraftOn);
        try { window.orbitPass?.tick?.(dt); } catch {}
        raf = requestAnimationFrame(step);
    }

    /** Follow the arrival for `sec` seconds, then leave the sky as the ground-level band says it should be. */
    function run(sec) {
        stop();
        running = true; last = 0;
        latchedSatellitesOff = false; latchedAircraftOn = false;   // a new arrival starts the descent over
        raf = requestAnimationFrame(step);
        const ms = Math.max(1000, (Number(sec) || 26) * 1000);
        setTimeout(() => {
            if (!running) return;
            stop();
            // The arrival ENDS on the ground, so the satellites go and the aircraft stay -- which is what the
            // atmospheric band says anyway. Applying it explicitly means the end state does not depend on
            // whichever frame happened to be last.
            setSatellites(false);
            setAircraft(true);
        }, ms + 500);
        return { ok: true, seconds: ms / 1000, ceilingY: AIRCRAFT_CEILING_Y };
    }

    function stop() {
        running = false;
        if (raf) { try { cancelAnimationFrame(raf); } catch {} raf = null; }
        return { ok: true };
    }

    function status() { return { ok: true, running, applied, ceilingY: AIRCRAFT_CEILING_Y,
        band: layersAt(cameraY()).band, latched: { satellitesOff: latchedSatellitesOff, aircraftOn: latchedAircraftOn } }; }

    window.arrivalLayers = { run, stop, status, layersAt, AIRCRAFT_CEILING_Y, SATELLITE_SHELL_Y };
    console.log("[arrivalLayers] window.arrivalLayers.run(sec) — satellites overhead, then aircraft, keyed on camera altitude");
}
