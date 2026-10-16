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
//   v4869, TEN MORE (the shipped pilot: fetched, offered, the default seat, flown, and its failure paths), every one red by name:
//   P1 the default roster's third seat the noise pilot again 1 | P2 the shipped file fetched from a path that is not there 5 | P3 rosterCtx holds no shipped pilot 2 | P4 the roster does not offer 'shipped' 1 | P5 the shipped weights halved on arrival 2 |
//   P6 the pilot line leaves the shipped pilot out 2 | P7 roster.shipped always null 2 | P8 a failed shipped fetch not said (shippedErr never set) 1 | P9 a failed later load discards the pilot the page holds 1 | P10 a good load does not clear the error 1.
//   P8 WENT 0 RED THE FIRST TIME: nothing in the gate made the load fail. The page's loader is now loadShipped(url), exposed on the hook, and the gate asks it for a file that is not there (one deliberate 404, which the page-errors row now
//   expects exactly once) and for another policy's brain.
//   THREE WENT 0 RED THE FIRST TIME: H8 (the old string was not in the file -- the page's score text differed), H12 (the gate chose the imported pilot AFTER importing it, which re-resolves on its own; the choice now comes first and the import
//   alone must seat it) and H20 (no row pulled back; the S-key row exists because of it). THE FIRST VERSION OF THE KEYBOARD ROW ROLLED THE AIRCRAFT FOR SIX REAL SECONDS: the stick was read per FRAME and the flight per tick, so a held key meant
//   a different thing at 1x, 4x and in the gate; the keys are read in simulated time now, which is also why a stick means the same thing at 4x.
"use strict";
import { runInEngineOrigin, webgpuSkipReason } from "./webgpuHarness.mjs";
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import * as PB from "../../brain/peerBrain.mjs";
import * as PF from "../../brain/pilotFlightPolicy.mjs";
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

            // ---- v4869: the page's OWN default roster, before anything touches it, once the shipped pilot has loaded (or said why not) ----
            const tS = performance.now(); while (performance.now() - tS < 15000 && !D.roster.shipped && !D.roster.shippedError) await wait(100);
            D.hold(true);   // from here the page's own frame loop steps nothing: the hook is the only clock, so what a row counts is what it stepped
            const tG = performance.now(); while (performance.now() - tG < 20000 && !D.roster.gpu.trained && !D.roster.gpu.error && !D.roster.gpu.weightsError) await wait(100);
            out.gpuAtBoot = { ...D.roster.gpu, weights: D.roster.gpu.weights ? D.roster.gpu.weights.length : 0 };
            out.ownSpecs = D.specs; out.ownLabels = D.roster.labels; out.ownChoices = D.roster.choices;
            out.shipped = D.roster.shipped ? Array.from(D.roster.shipped) : null; out.shippedError = D.roster.shippedError;
            out.pilotLine = doc.getElementById("pilotLine").textContent;
            // ---- the roster the rest of the run flies: PD autopilot, hand weights, hand + noise 0.05 ----
            D.setSpec(0, "scripted"); D.setSpec(1, "hand"); D.setSpec(2, "noise05"); D.reset(); D.step(0);   // step(0) repaints the cards: the page repaints them on a frame, and a frame is not guaranteed in a background iframe
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

            // ---- the SHIPPED pilot flies the same mission beside the autopilot ----
            D.setSpec(0, "scripted"); D.setSpec(1, "shipped"); D.setSpec(2, "hand"); D.reset(); D.step(1560);
            out.shippedRun = snap(); out.shippedFinite = finite(out.shippedRun); out.shippedLabels = D.roster.labels; out.shippedHdg = out.shippedRun.fleet.map((s) => hdg(s.q));
            // ---- v4870: THE GPU BRAIN FLIES the same mission on the device: the hand-weights brain beside the autopilot, and the trained one ----
            D.setSpec(0, "scripted"); D.setSpec(1, "gpuHand"); D.setSpec(2, "gpu"); D.reset(); await D.stepAsync(0);
            out.stepThrows = (() => { try { D.step(1); return null; } catch (e) { return e.message; } })();
            const dG = D.roster.gpu.dispatches; await D.stepAsync(1560);
            out.gpuRun = snap(); out.gpuFinite = finite(out.gpuRun); out.gpuLabels = D.roster.labels; out.gpuHdg = out.gpuRun.fleet.map((s) => hdg(s.q)); out.gpuDispatchesTaken = D.roster.gpu.dispatches - dG;
            out.gpuCards = [0, 1, 2].map((i) => doc.getElementById("card" + i).textContent);
            // ---- the GPU pilot's FAILURE paths: a file that is not there, another brain's file, then the good one again ----
            out.badGpuFetch = await D.roster.loadGpuShipped("/brain/pilotFlightMlpWeightsNope.json"); out.badGpuErr = D.roster.gpu.weightsError; out.stillGpu = D.roster.gpu.trained; out.badGpuLine = doc.getElementById("pilotLine").textContent;
            out.wrongGpu = await D.roster.loadGpuShipped("/brain/pilotFlightWeightsDefault.json"); out.wrongGpuErr = D.roster.gpu.weightsError;
            out.goodGpuAgain = await D.roster.loadGpuShipped(); out.goodGpuErr = D.roster.gpu.weightsError;
            // ---- the shipped pilot's FAILURE paths: a file that is not there, a brain for another policy, and then the good one again ----
            out.badFetch = await D.roster.loadShipped("/brain/pilotFlightWeightsNope.json"); out.badFetchErr = D.roster.shippedError; out.stillShipped = !!D.roster.shipped; out.badLine = doc.getElementById("pilotLine").textContent;
            out.wrongBrain = await D.roster.loadShipped("/brain/pilotAircraftWeightsDefault.json"); out.wrongErr = D.roster.shippedError;
            out.goodAgain = await D.roster.loadShipped(); out.goodErr = D.roster.shippedError; out.goodLine = doc.getElementById("pilotLine").textContent;
            D.setSpec(0, "scripted"); D.setSpec(1, "hand"); D.setSpec(2, "noise05");
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

            // ---- THE DEVICE IS LOST MID-FLIGHT (last: it takes the GPU brain away for the rest of the run) ----
            D.setSpec(0, "scripted"); D.setSpec(1, "hand"); D.setSpec(2, "gpu"); D.reset(); await D.stepAsync(10);
            D.roster.simulateGpuLoss(); out.loss = { threw: null }; try { await D.stepAsync(60); } catch (e) { out.loss.threw = e.message; }
            out.lossState = snap(); out.lossLabels = D.roster.labels; out.lossGpu = { ...D.roster.gpu, weights: 0 }; out.lossNote = doc.getElementById("rosterNote").textContent; out.lossChoices = D.roster.choices; out.lossLine = doc.getElementById("pilotLine").textContent;
            D.setSpec(0, "scripted"); D.setSpec(1, "hand"); D.setSpec(2, "noise05");
            // ---- reset ----
            D.step(300); const before = snap().tick; D.reset(); const after = snap();
            out.reset = { before, after: after.tick, pos: after.fleet.map((s) => s.pos), status: after.fleet.map((s) => s.status) };
            return out;
        }`,
    });

    ok("the harness booted es-flight6dof.html and found window.__flightDemo", run.ok && run.result && run.result.booted, run.ok ? (run.result ? "" : "no result") : String(run.reason || JSON.stringify(run)).slice(0, 300));
    if (run.pageErrors && run.pageErrors.length) report("page console errors", run.pageErrors.slice(0, 5).join(" | ").slice(0, 400));
    // the run asks for a file that is not there ON PURPOSE, once (the shipped pilot's failure path): the browser logs that as one 404 and nothing else may be logged
    const errs404 = (run.pageErrors || []).filter((e) => /\b404\b/.test(e)), other = (run.pageErrors || []).filter((e) => !/\b404\b/.test(e));
    ok("!! no page errors were logged during the whole run -- except the TWO 404s the gate asks for on purpose (the fruit fly's and the GPU brain's shipped-pilot failure paths); a third missing file would be a third 404", other.length === 0 && errs404.length === 2, (run.pageErrors || []).join(" | ").slice(0, 300));

    if (run.ok && run.result && run.result.booted) {
        const r = run.result, R2D = 180 / Math.PI;
        const speed = (s) => Math.hypot(s.vel[0], s.vel[1], s.vel[2]);
        ok("!! three aircraft spawn, side by side 90 m apart at 300 m, flying at 45 m/s", r.start.fleet.length === 3 && r.start.fleet.every((s, i) => Math.abs(s.pos[2] - 300) < 1e-9 && Math.abs(s.pos[1] - (i - 1) * 90) < 1e-9 && Math.abs(speed(s) - 45) < 1e-6 && s.status === "airborne"));
        const shippedFile = JSON.parse(fs.readFileSync(path.join(ENG, "brain", "pilotFlightWeightsDefault.json"), "utf8")), shippedImp = PB.importBrain(PB.describePolicy("pilotFlightPolicy", PF), shippedFile);
        ok("!! THE PAGE FETCHES THE SHIPPED PILOT: brain/pilotFlightWeightsDefault.json arrives through the same importer the Import button uses, without an error, as the file's own 1,099 weights bit for bit (and no 404 in the console)", shippedImp.ok && r.shipped && r.shipped.length === 1099 && !r.shippedError && r.shipped.every((v, i) => v === shippedImp.weights[i]), r.shippedError || `${r.shipped ? r.shipped.length : 0} weights`);
        ok("!! THE PAGE'S OWN DEFAULT ROSTER (read before the gate touches a seat) is the PD autopilot, the SHIPPED fruit fly and the GPU brain's shipped pilot, both shipped pilots are among the choices, and the pilot line names the fruit fly's with its held-out score", JSON.stringify(r.ownSpecs) === JSON.stringify(["scripted", "shipped", "gpu"]) && /PD autopilot/.test(r.ownLabels[0]) && /shipped pilot brain/.test(r.ownLabels[1]) && /GPU brain pilot/.test(r.ownLabels[2]) && r.ownChoices.includes("shipped") && r.ownChoices.includes("gpu") && /shipped pilot [0-9a-f]{8}: held-out score -0\.2965/.test(r.pilotLine), r.ownLabels.join(" | ") + " :: " + r.pilotLine.slice(0, 80));
        ok("!! the roster the rest of the run flies is the PD autopilot, the hand weights, and hand + noise 0.05, and the choices offered include the keyboard", JSON.stringify(r.specs) === JSON.stringify(["scripted", "hand", "noise05"]) && /PD autopilot/.test(r.labels[0]) && /hand weights/.test(r.labels[1]) && /noise 0.05/.test(r.labels[2]) && r.choices.includes("manual") && r.choices.includes("zero") && r.choices.includes("hand") && !r.choices.includes("imported"), JSON.stringify(r.labels) + " " + JSON.stringify(r.choices));
        ok("!! the cards name each pilot and say the aircraft is flying", r.cardsStart.every((t, i) => t.includes(r.labels[i]) && /flying/.test(t) && /score/.test(t)), r.cardsStart[0].slice(0, 120));
        ok("!! the tick counter advanced by exactly the steps taken (750, 1500, then 60 more) and the mission moves on every 25 s: leg 1 is 300 m / 0 rad / 45 m/s, leg 2 (from tick 750) is 360 m / 1.2 rad / 42 m/s, leg 3 (from tick 1500) is 280 m / 2.6 rad / 47 m/s", r.start.tick === 0 && r.leg1.tick === 750 && r.leg2.tick === 1500 && r.start.mission.altitude === 300 && r.start.mission.airspeed === 45 && r.leg1.mission.altitude === 360 && Math.abs(r.leg1.mission.heading - 1.2) < 1e-9 && r.leg1.mission.airspeed === 42 && r.leg2.mission.altitude === 280 && Math.abs(r.leg2.mission.heading - 2.6) < 1e-9 && r.leg2.mission.airspeed === 47, `${JSON.stringify(r.start.mission)} -> ${JSON.stringify(r.leg1.mission)} -> ${JSON.stringify(r.leg2.mission)}`);
        ok("!! every state stays finite and every aircraft is still flying after 51 s of mission", r.finiteDefault && r.leg2.fleet.every((s) => s.status === "airborne"));
        const a = r.leg2.fleet[0], b = r.leg2.fleet[1];
        report("after the second leg (25 s toward 360 m, 69 degrees, 42 m/s)", r.leg2.fleet.map((s, i) => `#${i + 1}: alt ${s.pos[2].toFixed(1)} V ${speed(s).toFixed(1)} hdg ${(r.heading[i] * R2D).toFixed(1)} score ${s.score.toFixed(3)}`).join(" | "));
        ok("!! THE HAND WEIGHTS FLY THE AUTOPILOT'S FLIGHT on the page: after 50 s the two are within 0.5 m of altitude, 0.2 m/s of speed and 0.3 degrees of heading", Math.abs(a.pos[2] - b.pos[2]) < 0.5 && Math.abs(speed(a) - speed(b)) < 0.2 && Math.abs(r.heading[0] - r.heading[1]) < 0.3 / R2D, `d alt ${(a.pos[2] - b.pos[2]).toFixed(3)} m, d V ${(speed(a) - speed(b)).toFixed(3)}, d hdg ${((r.heading[0] - r.heading[1]) * R2D).toFixed(3)} deg`);
        ok("!! the mission is really flown: by 50 s the autopilot is climbing toward 360 m, 8 s into the second leg it is within 40 m of it, turning right (heading above 20 degrees), with the airspeed within 4 m/s of 42", a.pos[2] > 330 && a.pos[2] < 395 && r.heading[0] > 20 / R2D && Math.abs(speed(a) - 42) < 4, `alt ${a.pos[2].toFixed(1)}, hdg ${(r.heading[0] * R2D).toFixed(1)}, V ${speed(a).toFixed(1)}`);
        ok("!! the noisy pilot still flies (hand + noise 0.05 stays airborne through the mission) and scores worse than the autopilot", r.leg2.fleet[2].status === "airborne" && r.leg2.fleet[2].score < a.score, `${r.leg2.fleet[2].score.toFixed(3)} vs ${a.score.toFixed(3)}`);

        { const A = r.shippedRun.fleet[0], S = r.shippedRun.fleet[1], H = r.shippedRun.fleet[2];
          report("the shipped pilot beside the autopilot and the hand weights, 52 s of mission", `scores ${A.score.toFixed(3)} (autopilot) | ${S.score.toFixed(3)} (shipped) | ${H.score.toFixed(3)} (hand); altitude ${A.pos[2].toFixed(1)} | ${S.pos[2].toFixed(1)} | ${H.pos[2].toFixed(1)}`);
          ok("!! THE SHIPPED PILOT FLIES THE PAGE'S MISSION: seated in aircraft 2 it is still flying after 52 s, every state finite, the card names it, it follows the mission's second leg (climbing toward 360 m and turning right, within 60 m and 12 degrees of the autopilot's), it SCORES BETTER THAN THE AUTOPILOT over the mission by more than 0.05 (the job it was trained on is the page's job), and the hand weights beside it still fly the autopilot's flight", S.status === "airborne" && r.shippedFinite && /shipped pilot brain/.test(r.shippedLabels[1]) && Math.abs(S.pos[2] - A.pos[2]) < 60 && r.shippedHdg[1] > 20 / R2D && Math.abs(r.shippedHdg[1] - r.shippedHdg[0]) < 12 / R2D && Math.abs(H.pos[2] - A.pos[2]) < 0.5 && S.score < 0 && S.score > A.score + 0.05, `score ${S.score.toFixed(3)} against the autopilot's ${A.score.toFixed(3)}; altitude ${S.pos[2].toFixed(1)} vs ${A.pos[2].toFixed(1)}, heading ${(r.shippedHdg[1] * R2D).toFixed(1)} vs ${(r.shippedHdg[0] * R2D).toFixed(1)}`); }
        { const g = r.gpuAtBoot, A = r.gpuRun.fleet[0], Hh = r.gpuRun.fleet[1], G = r.gpuRun.fleet[2];
          ok("!! THE PAGE FOUND A WebGPU DEVICE AND BUILT THE GPU BRAIN: the hand-weights brain and the shipped GPU pilot's are both on the device (1,796 weights, no error), the adapter is named, 'gpu' and 'gpuHand' are among the choices, and the pilot line says which device", g.trained && g.hand && !g.error && !g.weightsError && g.weights === 1796 && g.info && typeof g.info.software === "boolean" && r.ownChoices.includes("gpu") && r.ownChoices.includes("gpuHand") && /GPU brain on /.test(r.pilotLine), `${g.info ? [g.info.vendor, g.info.architecture].join(" ") : ""}${g.info && g.info.software ? " (software)" : ""}`);
          report("the GPU brain beside the autopilot, 52 s of mission", `scores ${A.score.toFixed(3)} (autopilot) | ${Hh.score.toFixed(3)} (GPU hand weights) | ${G.score.toFixed(3)} (GPU pilot); altitude ${A.pos[2].toFixed(1)} | ${Hh.pos[2].toFixed(1)} | ${G.pos[2].toFixed(1)}`);
          ok("!! THE GPU BRAIN FLIES THE PAGE'S MISSION: on the device the hand-weights brain flies the AUTOPILOT'S flight (within 0.5 m of altitude, 0.2 m/s of speed and 0.3 degrees of heading after 52 s -- float32 on the device against the double-precision law), the shipped GPU pilot is still flying and SCORES BETTER THAN THE AUTOPILOT over the mission by more than 0.05, every state finite, the cards name both", A.status === "airborne" && Hh.status === "airborne" && G.status === "airborne" && r.gpuFinite && Math.abs(Hh.pos[2] - A.pos[2]) < 0.5 && Math.abs(speed(Hh) - speed(A)) < 0.2 && Math.abs(r.gpuHdg[1] - r.gpuHdg[0]) < 0.3 / R2D && /GPU brain, hand weights/.test(r.gpuLabels[1]) && /GPU brain pilot/.test(r.gpuLabels[2]) && r.gpuCards[1].includes(r.gpuLabels[1]) && r.gpuCards[2].includes(r.gpuLabels[2]) && G.score > A.score + 0.05, `hand: d alt ${(Hh.pos[2] - A.pos[2]).toFixed(3)} m, d V ${(speed(Hh) - speed(A)).toFixed(3)}; GPU pilot alt ${G.pos[2].toFixed(1)}`);
          ok("!! ONE DISPATCH PER TICK PER BRAIN: 1,560 ticks with two GPU seats on two different brains took 3,120 dispatches (not one per aircraft per layer per tick)", r.gpuDispatchesTaken === 3120, `${r.gpuDispatchesTaken}`);
          ok("!! step() REFUSES while a GPU pilot is seated, by name (the device answers later than a tick; stepAsync() is the door)", /GPU pilot is seated/.test(r.stepThrows || "") && /stepAsync/.test(r.stepThrows || ""), r.stepThrows);
          ok("!! A GPU PILOT THAT WILL NOT LOAD IS SAID, AND THE ONE THE DEVICE HOLDS IS KEPT: a file that is not there gives 'HTTP 404', the FRUIT FLY'S brain file is refused by name, neither takes the pilot away, the pilot line says it did not load, and loading the good file again clears the error", r.badGpuFetch === false && /HTTP 404/.test(r.badGpuErr || "") && r.stillGpu && /the GPU pilot did not load \(.*HTTP 404/.test(r.badGpuLine) && r.wrongGpu === false && /pilotFlightPolicy/.test(r.wrongGpuErr || "") && /pilotFlightMlp/.test(r.wrongGpuErr || "") && r.goodGpuAgain === true && r.goodGpuErr === null, `${r.badGpuErr} | ${r.wrongGpuErr}`);
          ok("!! A DEVICE LOST MID-FLIGHT TAKES ITS SEATS BACK TO THE FRUIT FLY'S HAND WEIGHTS, SAID, AND THE FLIGHT GOES ON: stepping on throws nothing, the seat's label says no GPU brain here, the roster note and the pilot line name the loss, the GPU choices are gone, and the aircraft is still flying", r.loss.threw === null && /hand weights \(no GPU brain here\)/.test(r.lossLabels[2]) && /simulated device loss/.test(r.lossNote) && /simulated device loss/.test(r.lossLine) && r.lossGpu.lost === "simulated device loss" && !r.lossChoices.includes("gpu") && !r.lossChoices.includes("gpuHand") && r.lossState.fleet.every((s) => s.status === "airborne"), `${r.lossLabels[2]} :: ${r.lossNote.slice(0, 120)}`); }
        ok("!! A SHIPPED PILOT THAT WILL NOT LOAD IS SAID, AND THE ONE THE PAGE HOLDS IS KEPT: a file that is not there gives 'HTTP 404' on the pilot line, a brain for another policy is refused by name, neither takes the pilot away, and loading the good file again clears the error", r.badFetch === false && /HTTP 404/.test(r.badFetchErr || "") && r.stillShipped && /the shipped pilot did not load \(.*HTTP 404/.test(r.badLine) && /shipped pilot [0-9a-f]{8}/.test(r.badLine) && r.wrongBrain === false && /pilotAircraftPolicy/.test(r.wrongErr || "") && /pilotFlightPolicy/.test(r.wrongErr || "") && r.goodAgain === true && r.goodErr === null && !/did not load/.test(r.goodLine), `${r.badFetchErr} | ${r.wrongErr}`);
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
