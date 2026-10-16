// WebGLEngine/tools/ship/flightPage-selfcheck.mjs
//
// Run: node tools/ship/flightPage-selfcheck.mjs      (~2 s: a real browser, software rendering)
//
// THE PAGE-WIRING GATE for es-flight6dof.html (v4867). Everything the page WIRES TOGETHER -- physics/mechanics/flightModel6dof.mjs, brain/autopilotFlight.mjs, brain/pilotFlightPolicy.mjs, brain/flightTask.mjs, brain/pilotRoster.mjs --
// is gated on its own; this file proves the WIRING: the page boots in a real browser, its flight loop runs, three aircraft fly the mission under the pilots the roster chose, the autopilot and the same laws written through the fruit
// fly's network fly the same flight, a network that outputs nothing falls out of the sky and the card SAYS so, the keyboard pilot is trimmed and answers the stick, the wind moves the ground track and not the airspeed, an imported pilot
// is offered and flown and a bad one is refused by name, and Reset really resets. The exact state is read back through window.__flightDemo (a hook the page exposes, whose step(n) is the gate's clock: no waiting on frames).
//
// SABOTAGE LOG -- each applied to es-flight6dof.html, the gate run against the REAL browser, the page restored (diffed byte-identical):
//   20 sabotages of es-flight6dof.html, every one red by name (the number is how many rows went red):
//   H1 the tick counter never advances 4 | H2 the mission never moves on 2 | H10 reset keeps the tick 5 | H16 the page steps at 1/60 6 | H11 the spawn at 250 m 4 | H18 two aircraft instead of three (the page itself fails to boot: a card is missing) 1 |
//   H3 the wind ignored 2 | H13 the wind's heading sign flipped 1 | H4 the keyboard pilot untrimmed 1 | H6 A and D swapped 1 | H7 the keys never read in the step 1 | H20 S and W swapped (the pull has the wrong sign) 1 |
//   H5 the default roster's second aircraft the autopilot, not the hand weights 1 | H17 the noise pilot the autopilot 2 | H19 pilot labels dropped 2 | H9 an import of ANY brain accepted 1 | H12 the pilots not re-resolved when an import arrives 2 |
//   H14 a crashed aircraft not marked 1 | H15 the card does not say CRASHED 1 | H8 an aircraft that is not flying is not charged 1
//   THREE WENT 0 RED THE FIRST TIME: H8 (the old string was not in the file -- the page's score text differed), H12 (the gate chose the imported pilot AFTER importing it, which re-resolves on its own; the choice now comes first and the import
//   alone must seat it) and H20 (no row pulled back; the S-key row exists because of it). THE FIRST VERSION OF THE KEYBOARD ROW ROLLED THE AIRCRAFT FOR SIX REAL SECONDS: the stick was read per FRAME and the flight per tick, so a held key meant
//   a different thing at 1x, 4x and in the gate; the keys are read in simulated time now, which is also why a stick means the same thing at 4x.
"use strict";
import { runInEngineOrigin, webgpuSkipReason } from "./webgpuHarness.mjs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
function ok(name, cond, detail) { console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? "   " + detail : ""}`); if (!cond) fails++; }
function report(name, detail) { console.log(`  ----  ${name}   ${detail}`); }

console.log("flightPage-selfcheck -- es-flight6dof.html really wires the gated flight modules together\n");

const skip = webgpuSkipReason(createRequire(import.meta.url));
if (skip) { console.log(`  SKIP  ${skip}`); report("*** NOT A PASS. ***", ""); fails++; }
else {
    const run = await runInEngineOrigin({
        engineRoot: ENG, timeoutMs: 240000,
        script: `async () => {
            globalThis.__swekStep = "booting es-flight6dof.html in an iframe";
            const f = document.createElement("iframe");
            f.style.width = "900px"; f.style.height = "600px";
            f.src = "/es-flight6dof.html";
            document.body.appendChild(f);
            await new Promise((res) => { f.onload = res; });
            const win = f.contentWindow, wait = (ms) => new Promise((res) => setTimeout(res, ms));
            const t0 = performance.now();
            while (performance.now() - t0 < 40000 && (!win.__flightDemo || win.__flightDemo.state().tick < 1)) { globalThis.__swekStep = "waiting for window.__flightDemo"; await wait(200); }
            if (!win.__flightDemo) return { booted: false, reason: "window.__flightDemo never appeared" };
            const D = win.__flightDemo, doc = win.document;
            const PB = await import("/brain/peerBrain.mjs"), PF = await import("/brain/pilotFlightPolicy.mjs");
            const out = { booted: true };
            const snap = () => D.state();
            const hdg = (q) => { const x = 1 - 2 * (q[2] * q[2] + q[3] * q[3]), y = 2 * (q[0] * q[3] + q[1] * q[2]); return Math.atan2(-y, x); };
            const finite = (st) => st.fleet.every((s) => s.pos.every(Number.isFinite) && s.vel.every(Number.isFinite) && s.q.every(Number.isFinite) && Number.isFinite(s.score));

            // ---- the default roster: PD autopilot, hand weights, hand + noise 0.05 ----
            D.setSpec(0, "scripted"); D.setSpec(1, "hand"); D.setSpec(2, "noise05"); D.reset();
            out.labels = D.roster.labels; out.choices = D.roster.choices; out.specs = D.specs;
            out.start = snap();
            out.cardsStart = [0, 1, 2].map((i) => doc.getElementById("card" + i).textContent);
            D.step(750);   // the first leg: the targets are the start state's, so nothing should move much
            out.leg1 = snap();
            D.step(750);   // the second leg's targets: 360 m, heading 1.2 rad, 42 m/s
            out.leg2 = snap();
            D.step(60);
            out.finiteDefault = finite(snap());
            out.heading = out.leg2.fleet.map((s) => hdg(s.q));

            // ---- a network that outputs nothing: aircraft 2 flies the zero pilot and falls ----
            D.setSpec(1, "zero"); D.reset(); D.step(600);
            out.zero = snap(); out.zeroCard = doc.getElementById("card1").textContent; out.otherCard = doc.getElementById("card0").textContent;

            // ---- the keyboard pilot: trimmed, then a stick ----
            D.setSpec(1, "hand"); D.setSpec(0, "manual"); D.reset(); D.step(600);
            out.manualTrim = snap();
            D.reset();
            win.dispatchEvent(new win.KeyboardEvent("keydown", { code: "KeyD", bubbles: true }));
            D.step(8);   // 0.27 s of simulated time with the stick right: the keys are read in SIMULATED time, so this is the same flight every run
            win.dispatchEvent(new win.KeyboardEvent("keyup", { code: "KeyD", bubbles: true }));
            out.manualHeld = snap(); D.step(90);
            out.manualRoll = snap();
            const pitchOf = (q) => Math.asin(2 * (q[1] * q[3] - q[0] * q[2]));
            D.reset(); D.step(38); const noKey = snap();
            D.reset();
            win.dispatchEvent(new win.KeyboardEvent("keydown", { code: "KeyS", bubbles: true })); D.step(8);
            win.dispatchEvent(new win.KeyboardEvent("keyup", { code: "KeyS", bubbles: true })); D.step(30);
            out.pitchPull = { pull: pitchOf(snap().fleet[0].q), none: pitchOf(noKey.fleet[0].q) };
            D.setSpec(0, "scripted");

            // ---- wind: a 12 m/s tailwind (blowing toward heading 0) moves the ground track, not the airspeed ----
            D.reset(); D.setWind(0, 90, 0); D.step(600); const calm = snap();
            D.reset(); D.setWind(12, 0, 0); D.step(600); const windy = snap();
            D.reset(); D.setWind(12, 90, 0); D.step(600); const cross = snap(); D.setWind(0, 90, 0);
            out.windCrossY = [calm.fleet[0].pos[1], cross.fleet[0].pos[1]]; out.windCrossStatus = cross.fleet.map((x) => x.status);
            out.windGround = [calm.fleet[0].pos[0], windy.fleet[0].pos[0]]; out.windAlt = [calm.fleet[0].pos[2], windy.fleet[0].pos[2]]; out.windVel = [calm.fleet[0].vel, windy.fleet[0].vel];
            out.windVel = [calm.fleet[0].vel, windy.fleet[0].vel];

            // ---- the imported pilot ----
            const bad = PB.exportBrain(PB.describePolicy("pilotAircraftPolicy", PF), PF.handWeights()), refused = D.roster.importBlob(bad);
            out.badImport = { ok: refused, error: D.roster.importError, imported: !!D.roster.imported, choices: D.roster.choices };
            D.setSpec(2, "imported"); out.beforeImport = D.roster.labels[2];   // chosen before there is one: the hand weights fly, and the roster says so
            const good = PB.exportBrain(PB.describePolicy("pilotFlightPolicy", PF), PF.handWeights(), { score: -0.3577, by: "the gate" }), accepted = D.roster.importBlob(good);
            out.afterImport = D.roster.labels[2];   // and the import alone (no new choice) is what puts the imported pilot in the seat
            out.goodImport = { ok: accepted, error: D.roster.importError, imported: !!D.roster.imported, choices: D.roster.choices };
            D.reset(); D.step(750);
            out.imported = { labels: D.roster.labels, state: snap() };

            // ---- reset ----
            D.step(300); const before = snap().tick; D.reset(); const after = snap();
            out.reset = { before, after: after.tick, pos: after.fleet.map((s) => s.pos), status: after.fleet.map((s) => s.status) };
            return out;
        }`,
    });

    ok("the harness booted es-flight6dof.html and found window.__flightDemo", run.ok && run.result && run.result.booted, run.ok ? (run.result ? "" : "no result") : String(run.reason || JSON.stringify(run)).slice(0, 300));
    if (run.pageErrors && run.pageErrors.length) report("page console errors", run.pageErrors.slice(0, 5).join(" | ").slice(0, 400));
    ok("!! no page errors were logged during the whole run", !run.pageErrors || run.pageErrors.length === 0, (run.pageErrors || []).join(" | ").slice(0, 300));

    if (run.ok && run.result && run.result.booted) {
        const r = run.result, R2D = 180 / Math.PI;
        const speed = (s) => Math.hypot(s.vel[0], s.vel[1], s.vel[2]);
        ok("!! three aircraft spawn, side by side 90 m apart at 300 m, flying at 45 m/s", r.start.fleet.length === 3 && r.start.fleet.every((s, i) => Math.abs(s.pos[2] - 300) < 1e-9 && Math.abs(s.pos[1] - (i - 1) * 90) < 1e-9 && Math.abs(speed(s) - 45) < 1e-6 && s.status === "airborne"));
        ok("!! the roster's default is the PD autopilot, the hand weights, and hand + noise 0.05, and the choices offered include the keyboard", JSON.stringify(r.specs) === JSON.stringify(["scripted", "hand", "noise05"]) && /PD autopilot/.test(r.labels[0]) && /hand weights/.test(r.labels[1]) && /noise 0.05/.test(r.labels[2]) && r.choices.includes("manual") && r.choices.includes("zero") && r.choices.includes("hand") && !r.choices.includes("imported"), JSON.stringify(r.labels) + " " + JSON.stringify(r.choices));
        ok("!! the cards name each pilot and say the aircraft is flying", r.cardsStart.every((t, i) => t.includes(r.labels[i]) && /flying/.test(t) && /score/.test(t)), r.cardsStart[0].slice(0, 120));
        ok("!! the tick counter advanced by exactly the steps taken (750, 1500, then 60 more) and the mission moves on every 25 s: leg 1 is 300 m / 0 rad / 45 m/s, leg 2 (from tick 750) is 360 m / 1.2 rad / 42 m/s, leg 3 (from tick 1500) is 280 m / 2.6 rad / 47 m/s", r.start.tick === 0 && r.leg1.tick === 750 && r.leg2.tick === 1500 && r.start.mission.altitude === 300 && r.start.mission.airspeed === 45 && r.leg1.mission.altitude === 360 && Math.abs(r.leg1.mission.heading - 1.2) < 1e-9 && r.leg1.mission.airspeed === 42 && r.leg2.mission.altitude === 280 && Math.abs(r.leg2.mission.heading - 2.6) < 1e-9 && r.leg2.mission.airspeed === 47, `${JSON.stringify(r.start.mission)} -> ${JSON.stringify(r.leg1.mission)} -> ${JSON.stringify(r.leg2.mission)}`);
        ok("!! every state stays finite and every aircraft is still flying after 51 s of mission", r.finiteDefault && r.leg2.fleet.every((s) => s.status === "airborne"));
        const a = r.leg2.fleet[0], b = r.leg2.fleet[1];
        report("after the second leg (25 s toward 360 m, 69 degrees, 42 m/s)", r.leg2.fleet.map((s, i) => `#${i + 1}: alt ${s.pos[2].toFixed(1)} V ${speed(s).toFixed(1)} hdg ${(r.heading[i] * R2D).toFixed(1)} score ${s.score.toFixed(3)}`).join(" | "));
        ok("!! THE HAND WEIGHTS FLY THE AUTOPILOT'S FLIGHT on the page: after 50 s the two are within 0.5 m of altitude, 0.2 m/s of speed and 0.3 degrees of heading", Math.abs(a.pos[2] - b.pos[2]) < 0.5 && Math.abs(speed(a) - speed(b)) < 0.2 && Math.abs(r.heading[0] - r.heading[1]) < 0.3 / R2D, `d alt ${(a.pos[2] - b.pos[2]).toFixed(3)} m, d V ${(speed(a) - speed(b)).toFixed(3)}, d hdg ${((r.heading[0] - r.heading[1]) * R2D).toFixed(3)} deg`);
        ok("!! the mission is really flown: by 50 s the autopilot is climbing toward 360 m, 8 s into the second leg it is within 40 m of it, turning right (heading above 20 degrees), with the airspeed within 4 m/s of 42", a.pos[2] > 330 && a.pos[2] < 395 && r.heading[0] > 20 / R2D && Math.abs(speed(a) - 42) < 4, `alt ${a.pos[2].toFixed(1)}, hdg ${(r.heading[0] * R2D).toFixed(1)}, V ${speed(a).toFixed(1)}`);
        ok("!! the noisy pilot still flies (hand + noise 0.05 stays airborne through the mission) and scores worse than the autopilot", r.leg2.fleet[2].status === "airborne" && r.leg2.fleet[2].score < a.score, `${r.leg2.fleet[2].score.toFixed(3)} vs ${a.score.toFixed(3)}`);

        ok("!! A NETWORK THAT OUTPUTS NOTHING FALLS: the zero pilot's aircraft is no longer flying after 20 s, the card says CRASHED, and its neighbours are still flying", r.zero.fleet[1].status !== "airborne" && /CRASHED|TOUCHDOWN|LOST/.test(r.zeroCard) && r.zero.fleet[0].status === "airborne" && /flying/.test(r.otherCard), `${r.zero.fleet[1].status}: ${r.zeroCard.slice(0, 60)}`);
        ok("...and the finished aircraft stopped scoring as flown (its score is the worst a flight can have at that tick or near it: below -3)", r.zero.fleet[1].score < -3 && r.zero.fleet[0].score > -1, `${r.zero.fleet[1].score.toFixed(2)} vs ${r.zero.fleet[0].score.toFixed(2)}`);

        const mt = r.manualTrim.fleet[0];
        ok("!! THE KEYBOARD PILOT IS TRIMMED: with no key touched, 20 s on, the aircraft is flying within 25 m of its altitude and 3 m/s of its speed", mt.status === "airborne" && Math.abs(mt.pos[2] - 300) < 25 && Math.abs(speed(mt) - 45) < 3, `alt ${mt.pos[2].toFixed(1)} V ${speed(mt).toFixed(1)}`);
        const mr = r.manualRoll.fleet[0], rollOf = (q) => Math.atan2(2 * (q[0] * q[1] + q[2] * q[3]), 1 - 2 * (q[1] * q[1] + q[2] * q[2]));
        ok("!! ...and D (stick right) held for 8 ticks (0.27 s) banks it to the RIGHT (a positive bank: right wing down, between 5 and 60 degrees), and 3 s later it is still banked and has turned right (the heading has risen)", rollOf(r.manualHeld.fleet[0].q) > 0.02 && rollOf(mr.q) > 0.09 && rollOf(mr.q) < 1.05 && hdg3(mr.q) > 0.02 && mr.status === "airborne", `bank ${(rollOf(r.manualHeld.fleet[0].q) * R2D).toFixed(1)} -> ${(rollOf(mr.q) * R2D).toFixed(1)} deg, heading ${(hdg3(mr.q) * R2D).toFixed(1)} deg`);

        const dx = r.windGround[1] - r.windGround[0], dv = r.windVel[1][0] - r.windVel[0][0];
        ok("!! WIND moves the ground track and not the airspeed: in a 12 m/s tailwind the pilot (reading AIR data) brings the airspeed back to 45, so the ground speed ends 9..13 m/s above the calm day's, the track is carried 120..250 m farther in 20 s (it started at 33 m/s of airspeed and had to accelerate), and the altitude is held to 3 m", dv > 9 && dv < 13 && dx > 120 && dx < 250 && Math.abs(r.windAlt[1] - r.windAlt[0]) < 3, `ground speed +${dv.toFixed(1)} m/s; ${dx.toFixed(1)} m farther; altitude ${r.windAlt.map((v) => v.toFixed(1)).join(" vs ")}`);

        const dy = r.windCrossY[1] - r.windCrossY[0];
        ok("!! a 12 m/s wind blowing TOWARD heading 90 degrees (to the right of the nose) pushes the ground track to the RIGHT -- world -Y, since +Y is the aircraft's left -- by 150..300 m in 20 s, and everyone is still flying (the crosswind is flown, not dodged)", dy < -150 && dy > -300 && r.windCrossStatus.every((x) => x === "airborne"), `${dy.toFixed(1)} m in y`);
        ok("!! a brain exported for ANOTHER policy is refused by name and nothing is imported; the choices do not grow", r.badImport.ok === false && /pilotAircraftPolicy/.test(r.badImport.error || "") && r.badImport.imported === false && !r.badImport.choices.includes("imported"), r.badImport.error);
        ok("!! a pilot CHOSEN BEFORE it exists falls back to the hand weights and says so, and the import ALONE (no new choice) puts the imported pilot in the seat", /hand weights/.test(r.beforeImport) && /imported pilot/.test(r.afterImport), `${r.beforeImport} -> ${r.afterImport}`);
        ok("!! S (pull back) held for 8 ticks makes the nose HIGHER than no key does, 1.3 s on: the keyboard's pitch has the right sign (by more than 0.02 rad)", r.pitchPull.pull > r.pitchPull.none + 0.02, `${(r.pitchPull.pull * R2D).toFixed(2)} deg vs ${(r.pitchPull.none * R2D).toFixed(2)} deg`);
        ok("!! a good brain is accepted, 'imported pilot brain' is offered, and an aircraft assigned to it flies (airborne after 25 s, the label names it)", r.goodImport.ok && r.goodImport.imported && r.goodImport.choices.includes("imported") && /imported/.test(r.imported.labels[2]) && r.imported.state.fleet[2].status === "airborne", r.imported.labels[2]);
        ok("!! ...and the imported hand weights fly the same flight as the autopilot (within 0.5 m of altitude after 25 s)", Math.abs(r.imported.state.fleet[2].pos[2] - r.imported.state.fleet[0].pos[2]) < 0.5, `${r.imported.state.fleet[2].pos[2].toFixed(2)} vs ${r.imported.state.fleet[0].pos[2].toFixed(2)}`);

        ok("!! Reset sets the tick counter back to 0, respawns all three at 300 m flying again", r.reset.after === 0 && r.reset.before >= 300 && r.reset.pos.every((p) => Math.abs(p[2] - 300) < 1e-9) && r.reset.status.every((s) => s === "airborne"), `tick ${r.reset.before} -> ${r.reset.after}`);
    }
}
function hdg3(q) { const x = 1 - 2 * (q[2] * q[2] + q[3] * q[3]), y = 2 * (q[0] * q[3] + q[1] * q[2]); return Math.atan2(-y, x); }

console.log(fails ? `\nflightPage-selfcheck: ${fails} FAILED` : "\nflightPage-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
