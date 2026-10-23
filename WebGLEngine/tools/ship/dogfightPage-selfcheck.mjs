// WebGLEngine/tools/ship/dogfightPage-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/ship/dogfightPage-selfcheck.mjs      (~6 s: a real browser, software rendering, eight full fights of 60 s)
//
// THE PAGE-WIRING GATE for dogfight.html. Everything the page WIRES TOGETHER -- brain/dogfightArena.mjs (held to dogfightTask.duel() to the bit), render/flightViews.mjs (the cameras, the projection, the sight, the bars, the overview),
// brain/dogfightTask.mjs, the two flight networks and their shipped files -- is gated on its own; this file proves the WIRING in a real browser: the page boots with no error and fights the fight it says, the pilots the roster offers are the
// ones that fly, the fight it shows is the fight the task would score (all four kinds, to the bit in every count the task reports), there is ONE WINDOW PER AIRCRAFT stacked down the right, a CLICK on a window goes plane -> pilot -> gunner ->
// brain -> plane without touching the other window, the views are really different pictures (the WebGL pixels under each window are read back and compared) and the brain window is the network's bars (the 2D overlay's pixels are counted by
// colour), the sight draws the pipper and the lead pip when the target is in it, the overview keeps both aircraft in frame, a pilot file that will not load is said and the pilot the page holds is kept, and the log tells the fight. The exact state
// is read through window.__dogfight (a hook the page exposes, whose step(n) is the gate's clock: no waiting on frames).
//
// SABOTAGE LOG -- THIRTY-ONE, each applied to dogfight.html in a scratch worktree, the gate run against the REAL browser, the page restored; thirty red by name (the number is how many rows went red), one not at all and said so:
//   PG1 a click does nothing 2 | PG2 the click skips the gunner's view 2 | PG3 a click switches every window 2 | PG4 a window for the first craft only 1 (the page fails to boot) | PG5 the views are not kept across a new fight 1 | PG6 the window label is never set 1 |
//   PG7 the brain view draws no bars 2 | PG8 the pilot's view is the plane's camera 1 | PG9 the gunner's view is the pilot's camera 1 | PG10 the viewport's y not flipped 2 | PG12 the big picture is a chase camera, not the overview 1 | PG13 the two pilots swapped 5 |
//   PG14 B flies A's pilot 2 | PG15 a refused later load takes the held pilot away 1 | PG16 a refused load is not said 1 | PG17 a failed fetch is not said 1 | PG18 a pilot that is not loaded is still offered 1 | PG19 the fallback pilot's label does not say why 1 |
//   PG20 the page's tick steps the arena once only 8 | PG21 a hit is not logged 1 | PG22 the end of the fight is not logged 1 | PG23 the card does not show hit points 2 | PG24 the pause button does nothing 1 | PG25 the window stack on the left 1 |
//   PG26 the window boxes paint their own background 1 | PG27 no lead pip in the sight 1 | PG28 no pipper in the sight 1 | PG29 no cross in the pilot's view 1 | PG30 B's default pilot the hand weights 2 | PG31 A's default pilot the hand weights 2
//   PG11 (the craft's own mesh left in its own cockpit view) goes 0 red AND IS AN EQUIVALENT MUTANT TODAY: the eye sits inside a HOLLOW hull (open cylinders, a cone, a thin slab) and no face seen from inside is front-facing, so hiding the mesh changes no pixel; the page hides it anyway for the day the hull has a closed canopy.
//   TWO WENT 0 RED THE FIRST TIME AND WERE FIXED IN THE GATE: PG12 (the overview replaced by a chase camera) because the first fights it framed were ones where the chase camera behind A also saw B -- the rows now use a duel at 20 s and 30 s, after the two have passed each other, where the chase camera loses B by 4.0 and 2.0 screens;
//   and PG21 because the sabotage's own old string was not in the file (the sabotage was fixed, not the gate). THE FIRST SCREENSHOT OF THIS PAGE SHOWED BLACK WINDOWS over a gate that read the right pixels: the window boxes had a background of their own and covered the WebGL canvas they are drawn into -- PG26 is that bug, and its row reads the boxes' computed background.
"use strict";
import { runInEngineOrigin, webgpuSkipReason } from "./webgpuHarness.mjs";
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as PB from "../../brain/peerBrain.mjs";
import * as PF from "../../brain/pilotFlightPolicy.mjs";
import * as AF from "../../brain/autopilotFlight.mjs";
import * as D from "../../brain/dogfightTask.mjs";
import * as A from "../../brain/dogfightArena.mjs";
import * as JF from "../../brain/jetFight.mjs";
import { weightsHash } from "../../brain/drivePolicy.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
function ok(name, cond, detail) { console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? "   " + detail : ""}`); if (!cond) fails++; }
function report(name, detail) { console.log(`  ----  ${name}   ${detail}`); }

console.log("dogfightPage-selfcheck -- dogfight.html really wires the gated modules together\n");

const skip = webgpuSkipReason(createRequire(import.meta.url));
if (skip) { console.log(`  SKIP  ${skip}`); report("*** NOT A PASS. ***", ""); fails++; }
else {
    const run = await runInEngineOrigin({
        engineRoot: ENG, timeoutMs: 280000,
        script: `async () => {
            globalThis.__swekStep = "booting dogfight.html in an iframe";
            const f = document.createElement("iframe");
            f.style.width = "1100px"; f.style.height = "720px";
            f.src = "/dogfight.html";
            document.body.appendChild(f);
            await new Promise((res) => { f.onload = res; });
            const win = f.contentWindow, doc = win.document, wait = (ms) => new Promise((res) => setTimeout(res, ms));
            const t0 = performance.now();
            while (performance.now() - t0 < 40000 && !win.__dogfight) { globalThis.__swekStep = "waiting for window.__dogfight"; await wait(200); }
            if (!win.__dogfight) return { booted: false, reason: "window.__dogfight never appeared" };
            const D = win.__dogfight; await D.ready; D.hold(true);
            const out = { booted: true }, views = () => D.windows().map((w) => w.view);
            const cards = () => [0, 1].map((i) => (doc.getElementById("card" + i) || { textContent: "" }).textContent);

            // ---- the page's OWN default fight, before anything touches it ----
            out.boot = { windows: D.windows(), choices: D.roster.choices, labels: D.roster.labels, state: D.state(), cards: cards(), stat: doc.getElementById("stat").textContent, note: doc.getElementById("note").textContent,
                selects: [doc.getElementById("kind").value, doc.getElementById("seed").value, doc.getElementById("pilotA").value, doc.getElementById("pilotB").value] };
            D.step(60); out.s60 = D.state();
            D.step(1740); out.end = D.state(); out.endRes = D.resultA(); out.endCards = cards(); out.endStat = doc.getElementById("stat").textContent;
            D.step(5); out.afterDone = D.state().tick;

            // ---- the fight the task would score: each kind, the PD autopilot on both sides ----
            out.kinds = {};
            for (const kind of ["tail", "offset", "turning", "duel"]) {
                globalThis.__swekStep = "full fight: " + kind;
                D.newFight({ kind, seed: 2, a: "pd", b: "pd" }); D.step(1800);
                out.kinds[kind] = { res: D.resultA(), state: D.state() };
            }

            // ---- the windows: the layout, the click, the other window, the views kept across a new fight ----
            D.newFight({ kind: "duel", seed: 3, a: "dogfight", b: "pd" });
            out.layout = D.windows().map((w) => w.rect);
            out.seq = [views()];
            for (let k = 0; k < 5; k++) { D.clickWindow(0); out.seq.push(views()); }
            D.clickWindow(1); out.afterOther = views(); D.clickWindow(1); D.clickWindow(1); D.clickWindow(1); out.backToPlane = views();
            D.setView(0, "gunner"); D.setView(1, "brain"); D.newFight({ kind: "duel", seed: 4, a: "dogfight", b: "pd" }); out.kept = views();
            D.newFight({ kind: "duel", seed: 3, a: "dogfight", b: "pd" }); out.keptAgain = views(); D.setView(0, "plane"); D.setView(1, "plane");
            out.labels = D.windows().map((w) => w.label);

            // ---- the pictures: the pixels under each window, in each view, mid-fight in a tail chase (the target is in the sight) ----
            D.newFight({ kind: "tail", seed: 1, a: "pd", b: "pd" }); D.step(40);
            out.pix = {};
            for (const v of ["plane", "pilot", "gunner", "brain"]) {
                D.setView(0, v);
                out.pix[v] = { gl: D.pixels(0), ink: D.ink(0), bars: D.inkColor(0, [89, 209, 255]) + D.inkColor(0, [246, 166, 35]), pipper: D.inkColor(0, [90, 214, 255]), lead: D.inkColor(0, [246, 166, 35]), cross: D.inkColor(0, [127, 224, 160]) };
            }
            D.setView(1, "brain"); out.pixB = { bars: D.inkColor(1, [89, 209, 255]) + D.inkColor(1, [246, 166, 35]) }; D.setView(1, "plane"); D.setView(0, "plane");
            out.pixPlane2 = D.pixels(1);

            // ---- the big picture keeps both aircraft in frame ----
            D.newFight({ kind: "duel", seed: 3, a: "pd", b: "pd" }); D.step(600); D.settleCamera(); out.mainNdc = D.mainView(); out.mainCam = D.mainCamera();
            D.step(300); D.settleCamera(); out.mainNdc2 = D.mainView();

            // ---- the pilots: a choice flies, and a different choice flies differently ----
            D.newFight({ kind: "turning", seed: 3, a: "pd", b: "pd" }); D.step(600); const pdState = D.state();
            D.newFight({ kind: "turning", seed: 3, a: "dogfight", b: "pd" }); D.step(600); const dfState = D.state();
            D.newFight({ kind: "turning", seed: 3, a: "gpuDogfight", b: "pd" }); D.step(600); const gpuState = D.state();
            out.pilotsRun = { pd: pdState.crafts[0].pos, dogfight: dfState.crafts[0].pos, gpuDogfight: gpuState.crafts[0].pos, labels: [pdState.pilots[0].label, dfState.pilots[0].label, gpuState.pilots[0].label], ids: [pdState.pilots[0].id, dfState.pilots[0].id, gpuState.pilots[0].id] };

            // ---- a pilot file that will not load: said, and the pilot the page holds is kept ----
            out.fail = {};
            out.fail.missing = await D.roster.loadChoice("dogfight", "/brain/pilotDogfightWeightsNope.json"); out.fail.missingErr = D.roster.error("dogfight"); out.fail.stillLoaded = D.roster.loaded("dogfight");
            out.fail.wrong = await D.roster.loadChoice("dogfight", "/brain/pilotFlightMlpWeightsDefault.json"); out.fail.wrongErr = D.roster.error("dogfight"); out.fail.stillLoaded2 = D.roster.loaded("dogfight");
            out.fail.good = await D.roster.loadChoice("dogfight"); out.fail.goodErr = D.roster.error("dogfight");
            D.roster.forget("gpuDogfight"); out.fail.choices = D.roster.choices;
            D.newFight({ kind: "duel", seed: 3, a: "dogfight", b: "gpuDogfight" }); out.fail.fallback = D.roster.labels[1]; out.fail.fallbackId = D.state().pilots[1].id;

            // ---- a hit is logged and the cards say it ----
            D.newFight({ kind: "tail", seed: 1, a: "dogfight", b: "pd" }); D.step(1800); out.tailLog = D.state().log; out.tailCards = cards(); out.tailRes = D.resultA();

            // ---- THE JET: the aircraft selector, the jet's fights (brain/jetFight.mjs), its roster, its pictures, and the way back ----
            out.jet = {};
            await D.roster.loadChoice("gpuDogfight");   // the failure paths above took it away on purpose
            D.newFight({ kind: "duel", seed: 3, a: "dogfight", b: "pd" });
            D.setCraft("jet");
            out.jet.craft = D.craft(); out.jet.choices = D.roster.choices; out.jet.labels = D.roster.labels; out.jet.state0 = D.state(); out.jet.cards0 = cards();
            out.jet.selects = [doc.getElementById("craft").value, doc.getElementById("kind").value, doc.getElementById("seed").value, doc.getElementById("pilotA").value, doc.getElementById("pilotB").value];
            out.jet.kinds = {};
            for (const kind of ["tail", "offset", "turning", "duel"]) {
                globalThis.__swekStep = "jet fight: " + kind;
                D.newFight({ kind, seed: 2, a: "pd", b: "pd" }); D.step(1800);
                out.jet.kinds[kind] = { res: D.resultA(), state: D.state() };
            }
            globalThis.__swekStep = "jet: the networks";
            D.newFight({ kind: "duel", seed: 3, a: "hand", b: "pd" }); D.step(1800); out.jet.hand = D.resultA(); out.jet.handIds = D.state().pilots.map((p) => p.id);
            D.newFight({ kind: "duel", seed: 3, a: "gpuHand", b: "pd" }); D.step(1800); out.jet.gpu = D.resultA(); out.jet.gpuLabels = D.roster.labels;
            D.newFight({ kind: "duel", seed: 3, a: "pd", b: "pd" }); D.step(1800); out.jet.pd = D.resultA();
            D.newFight({ kind: "duel", seed: 3, a: "cruise", b: "pd" }); D.step(1800); out.jet.cruise = D.resultA();
            globalThis.__swekStep = "jet: the pictures";
            D.newFight({ kind: "tail", seed: 1, a: "pd", b: "pd" }); D.step(60);
            out.jet.pix = {};
            for (const v of ["plane", "pilot", "gunner", "brain"]) {
                D.setView(0, v);
                out.jet.pix[v] = { gl: D.pixels(0), ink: D.ink(0), bars: D.inkColor(0, [89, 209, 255]) + D.inkColor(0, [246, 166, 35]), pipper: D.inkColor(0, [90, 214, 255]), lead: D.inkColor(0, [246, 166, 35]), cross: D.inkColor(0, [127, 224, 160]) };
            }
            D.setView(0, "plane");
            D.newFight({ kind: "duel", seed: 3, a: "pd", b: "pd" }); D.step(600); D.settleCamera(); out.jet.mainNdc = D.mainView(); out.jet.mainCam = D.mainCamera();
            out.jet.scale = D.meshScale(0); out.jet.fog = D.fog(); out.jet.brainNames = D.brainNames(0)[0]; out.jet.pilotIds = D.state().pilots.map((p) => p.id);
            doc.getElementById("camMode").value = "chase0"; D.newFight({ kind: "tail", seed: 1, a: "pd", b: "pd" }); D.step(30); D.settleCamera();
            { const cam = D.mainCamera(), a = D.state().crafts[0].pos; out.jet.chase = Math.hypot(cam.pos[0] - a[0], cam.pos[1] - a[1], cam.pos[2] - a[2]); }
            doc.getElementById("camMode").value = "overview";
            D.newFight({ kind: "duel", seed: 3, a: "cruise", b: "pd" }); out.jet.cruiseIds = D.state().pilots.map((p) => p.id);
            D.setCraft("trainer");
            out.jet.scaleTrainer = D.meshScale(0); out.jet.fogTrainer = D.fog();
            out.jet.back = { craft: D.craft(), choices: D.roster.choices, labels: D.roster.labels, state: D.state(), selects: [doc.getElementById("craft").value, doc.getElementById("pilotA").value, doc.getElementById("pilotB").value] };

            // ---- the page booted with ?craft=jet: a second page, its own default fight ----
            {
                const f2 = document.createElement("iframe"); f2.style.width = "1100px"; f2.style.height = "720px"; f2.src = "/dogfight.html?craft=jet&kind=tail&seed=2&a=cruise&b=pd"; document.body.appendChild(f2);
                await new Promise((res) => { f2.onload = res; });
                const w2 = f2.contentWindow, t1 = performance.now();
                while (performance.now() - t1 < 40000 && !w2.__dogfight) { globalThis.__swekStep = "waiting for the ?craft=jet page"; await wait(200); }
                const D2 = w2.__dogfight; await D2.ready; D2.hold(true);
                out.jetUrl = { craft: D2.craft(), selects: ["craft", "kind", "seed", "pilotA", "pilotB"].map((id) => w2.document.getElementById(id).value), ids: D2.state().pilots.map((p) => p.id), alt: D2.state().crafts.map((c) => c.pos[2]), fog: D2.fog() };
                f2.remove();
            }

            // ---- pause ----
            const pb = doc.getElementById("pauseBtn"); out.pause = [D.paused, pb.textContent]; pb.click(); out.pause.push(D.paused, pb.textContent); pb.click(); out.pause.push(D.paused, pb.textContent);
            return out;
        }`,
    });

    ok("the harness booted dogfight.html and found window.__dogfight", run.ok && run.result && run.result.booted, run.ok ? (run.result ? "" : "no result") : String(run.reason || JSON.stringify(run)).slice(0, 300));
    if (run.pageErrors && run.pageErrors.length) report("page console errors", run.pageErrors.slice(0, 5).join(" | ").slice(0, 400));
    // the run asks for one file that is not there ON PURPOSE (the pilot file's failure path): the browser logs that as one 404, and nothing else may be logged
    const errs404 = (run.pageErrors || []).filter((e) => /\b404\b/.test(e)), other = (run.pageErrors || []).filter((e) => !/\b404\b/.test(e));
    ok("!! no page errors were logged during the whole run -- except the ONE 404 the gate asks for on purpose (the pilot file that is not there); a second missing file would be a second 404", other.length === 0 && errs404.length <= 1, `${other.length} other, ${errs404.length} x 404 ${other.slice(0, 2).join(" | ").slice(0, 200)}`);

    if (run.ok && run.result && run.result.booted) {
        const r = run.result, close = (a, b, tol) => a.length === b.length && a.every((v, i) => Math.abs(v - b[i]) <= tol);
        const dogBlob = JSON.parse(fs.readFileSync(path.join(ENG, "brain", "pilotDogfightWeightsDefault.json"), "utf8")), DESC = PB.describePolicy("pilotFlightPolicy", PF), dogImp = PB.importBrain(DESC, dogBlob);

        // ---- 1 the boot ----
        const b = r.boot;
        ok("!! THE PAGE'S OWN FIGHT (before the gate touches it) is duel seed 3, A the fruit fly TRAINED TO FIGHT (named, with the hash of its file's weights and its held-out score) against B the PD autopilot, at tick 0 with both aircraft flying",
            b.selects.join() === `duel,3,dogfight,pd` && /trained to FIGHT/i.test(b.labels[0]) && b.labels[0].includes(weightsHash(dogImp.weights)) && /held-out 0\.6715/.test(b.labels[0]) && /PD autopilot/.test(b.labels[1]) && b.state.tick === 0 && b.state.crafts.every((c) => c.status === "airborne"), `${b.labels[0]} | ${b.labels[1]}`);
        ok("!! the roster offers all seven pilots, every one enabled (the PD autopilot; the fruit fly on hand weights, trained to fly, trained to fight; the GPU Brain's network on the same three)", b.choices.map((c) => c.id).join() === "pd,hand,flight,dogfight,gpuHand,gpuFlight,gpuDogfight" && b.choices.every((c) => !c.disabled));
        ok("!! TWO WINDOWS, one per aircraft, both showing the plane from outside to start with, each labelled with its number, its pilot and the view", b.windows.length === 2 && b.windows.every((w, i) => w.craft === i && w.view === "plane" && w.label.startsWith(`${i + 1}. ${i ? "B" : "A"} · `) && /\(from outside/.test(w.label) && /click to switch/.test(w.label)), b.windows.map((w) => w.label).join(" | ").slice(0, 200));
        ok("the board has a card for each aircraft that names its pilot and says it is flying, with its hit points and rounds, and the stat line names the fight", b.cards.length === 2 && b.cards.every((t, i) => t.includes(b.labels[i]) && /flying/.test(t) && /hit points 20\/20/.test(t) && /rounds 300 left/.test(t)) && /duel 3/.test(b.stat) && /A's score/.test(b.stat) && /click a window/.test(b.note), `${b.stat}`);

        // ---- 2 the clock ----
        ok("!! the tick counter advanced by exactly the steps taken (60 ticks is 2 s; 1800 is 60 s and the fight is over, by time), and a finished fight does not move: 5 more steps leave the tick at 1800", r.s60.tick === 60 && Math.abs(r.s60.t - 2) < 1e-12 && r.end.tick === 1800 && r.end.done === true && r.end.over === "time" && r.afterDone === 1800);

        // ---- 3 the fight the page shows is the fight the arena (and so the task) runs ----
        const sc = D.scenario(3, "duel"), node = A.runArena(A.arenaFromScenario(sc, PF.pilotFor(dogImp.weights), { pilotB: AF.pilot })), nodeRes = A.resultOf(node, D.A_ID);
        ok("!! THE DEFAULT FIGHT IS THE ARENA'S: the page's fruit-fly-trained-to-fight against the autopilot in duel 3, 60 s on, has the hits, the rounds fired, the statuses and the tick count of the same fight run here, and the positions to 1e-6 m (two JavaScript engines)",
            r.end.crafts.every((c, i) => c.hits === node.crafts[i].hits && c.taken === node.crafts[i].taken && c.fired === node.crafts[i].gun.fired && c.status === node.crafts[i].status && close(c.pos, node.crafts[i].state.pos, 1e-6)) && r.endRes.score === nodeRes.score && r.endRes.dealt === nodeRes.dealt && r.endRes.firstHit === nodeRes.firstHit,
            `A: ${r.end.crafts[0].hits} hits / ${r.end.crafts[0].fired} rounds, score ${r.endRes.score.toFixed(4)} (here ${nodeRes.score.toFixed(4)})`);
        for (const kind of ["tail", "offset", "turning", "duel"]) {
            const d = D.duel(AF.pilot, D.scenario(2, kind), { pilotB: AF.pilot }), k = r.kinds[kind].res;
            ok(`!! the ${kind} fight, the PD autopilot on both sides, seed 2, is dogfightTask.duel()'s to the bit in every count it reports (hits dealt and taken, rounds by each side, first hit, kill, both statuses, ticks) and its score to 1e-12`,
                ["dealt", "taken", "fired", "firedB", "firstHit", "killedB", "statusA", "statusB", "ticks"].every((f) => Object.is(k[f], d[f])) && Math.abs(k.score - d.score) < 1e-12, `${kind}: score ${k.score.toFixed(4)} / ${d.score.toFixed(4)}, ${k.statusA} vs ${k.statusB}`);
        }

        // ---- 4 the windows ----
        const L = r.layout;
        ok("!! A WINDOW'S BOX DOES NOT PAINT OVER ITS PICTURE: the pictures are drawn into the page's one WebGL canvas, BEHIND the boxes, so a box with a background of its own hides its picture (the first screenshot of this page showed black windows over a gate that read the right pixels) -- every window box is transparent", r.layout.length === 2 && r.boot.windows.every((w) => /^(rgba\(0, 0, 0, 0\)|transparent)$/.test(w.bg)), r.boot.windows.map((w) => w.bg).join(" | "));
        ok("!! THE WINDOWS ARE STACKED DOWN THE RIGHT: the same left edge, the same width (262), the second below the first with a gap, the right edge inside the page, and each a landscape picture", L.length === 2 && L[0].x === L[1].x && L[0].width === 262 && L[1].width === 262 && L[1].y >= L[0].y + L[0].height && L[0].x + L[0].width <= 1100 && L[0].x > 700 && L[0].width > L[0].height, JSON.stringify(L.map((q) => [q.x, q.y, q.width, q.height])));
        ok("!! A CLICK ON A WINDOW SWITCHES IT: plane, pilot, gunner, brain, and round to the plane again -- one click each -- while the other window stays on the plane", JSON.stringify(r.seq.map((s) => s[0])) === JSON.stringify(["plane", "pilot", "gunner", "brain", "plane", "pilot"]) && r.seq.every((s) => s[1] === "plane"), JSON.stringify(r.seq.map((s) => s[0])));
        ok("!! ...and a click on the OTHER window switches that one and not the first (window 0 was left on 'pilot'), four clicks take it back round to the plane", r.afterOther[0] === "pilot" && r.afterOther[1] === "pilot" && r.backToPlane[0] === "pilot" && r.backToPlane[1] === "plane", `${r.afterOther} -> ${r.backToPlane}`);
        ok("!! THE VIEWS SURVIVE A NEW FIGHT: window 0 on the gunner's sight and window 1 on the brain stay so when another fight starts (so does a repeat of the first)", r.kept.join() === "gunner,brain" && r.keptAgain.join() === "gunner,brain", `${r.kept} / ${r.keptAgain}`);

        // ---- 5 the pictures ----
        const P = r.pix;
        ok("!! THE THREE CAMERA VIEWS ARE PICTURES OF A WORLD, and different ones: the pixels under window 0 in the plane, pilot and gunner views each hold many colours (sky, ground, aircraft) and no two have the same mean colour",
            ["plane", "pilot", "gunner"].every((v) => P[v].gl.distinct >= 8 && P[v].gl.w > 200 && P[v].gl.h > 150) && ["plane|pilot", "plane|gunner", "pilot|gunner"].every((pair) => { const [x, y] = pair.split("|"); return Math.max(...P[x].gl.mean.map((m, i) => Math.abs(m - P[y].gl.mean[i]))) >= 2; }),
            ["plane", "pilot", "gunner"].map((v) => `${v}: ${P[v].gl.distinct} colours, mean ${P[v].gl.mean.map((m) => m.toFixed(0))}`).join(" | "));
        ok("!! THE BRAIN VIEW IS NOT A CAMERA: the picture under the window is the flat dark fill (one colour), and the overlay on top of it is the network's BARS -- blue and amber bars by the thousand (the 18 features, the hidden activations and the four outputs), and a tenth of that or less in the camera views (the sight's pipper and lead pip use the same two colours)",
            P.brain.gl.distinct <= 2 && P.brain.gl.mean.every((m) => m < 20) && P.brain.bars > 1000 && ["plane", "pilot", "gunner"].every((v) => P[v].bars * 10 < P.brain.bars), `${P.brain.bars} bar pixels; others ${["plane", "pilot", "gunner"].map((v) => P[v].bars)}`);
        ok("the pilot's view has its cross on the nose (green pixels at the centre) and its line of figures; the plane view has neither", P.pilot.cross > 8 && P.pilot.ink > 300 && P.plane.cross === 0, `${P.pilot.cross} cross pixels, ${P.pilot.ink} ink`);
        ok("!! THE SIGHT DRAWS WHAT THE GUNNER FLIES BY: with the target in front (a tail chase, 1.3 s in) the gunner's view has the bore cross (green), the pipper (cyan ring) and the lead pip (orange diamond) drawn, and the pilot's view has no pipper and no lead pip",
            P.gunner.cross > 8 && P.gunner.pipper > 15 && P.gunner.lead > 15 && P.pilot.pipper < 10 && P.pilot.lead < 10, `cross ${P.gunner.cross}, pipper ${P.gunner.pipper}, lead ${P.gunner.lead}; pilot view ${P.pilot.pipper}/${P.pilot.lead}`);
        ok("window 1 draws its own bars when it is on the brain view, and its plane picture is a world too", r.pixB.bars > 150 && r.pixPlane2.distinct >= 8, `${r.pixB.bars} bar pixels, ${r.pixPlane2.distinct} colours`);

        // ---- 6 the big picture ----
        const inFrame = (ndc) => ndc.every(([x, y, z]) => Math.abs(x) <= 1.02 && Math.abs(y) <= 1.02 && z > 0 && z < 1);
        ok("!! THE OVERVIEW KEEPS BOTH AIRCRAFT IN FRAME: after 20 s and after 30 s of a duel, when the two have passed each other and one is BEHIND the other (a chase camera behind one of them loses the other, 4.0 and -2.0 off the edge, which is why the row is not at the start), both aircraft are inside the big picture (normalised coordinates within 1.02, in front of the camera)", inFrame(r.mainNdc) && inFrame(r.mainNdc2), JSON.stringify(r.mainNdc.map((v) => v.map((q) => +q.toFixed(2)))));

        // ---- 7 the pilots ----
        const pr = r.pilotsRun, dist = (a, b2) => Math.hypot(a[0] - b2[0], a[1] - b2[1], a[2] - b2[2]);
        ok("!! A CHOICE IS FLOWN, AND A DIFFERENT CHOICE FLIES DIFFERENTLY: 20 s into the same turning fight the autopilot, the fruit fly trained to fight and the GPU Brain trained to fight have been seated (their labels differ) and the three are at three different places (each at least 1 m from the others)",
            pr.ids.join() === "pd,dogfight,gpuDogfight" && new Set(pr.labels).size === 3 && dist(pr.pd, pr.dogfight) > 1 && dist(pr.pd, pr.gpuDogfight) > 1 && dist(pr.dogfight, pr.gpuDogfight) > 1, `${pr.labels.join(" | ").slice(0, 160)}`);

        // ---- 8 failure paths ----
        const F = r.fail;
        ok("!! A PILOT FILE THAT WILL NOT LOAD IS SAID AND THE PILOT THE PAGE HOLDS IS KEPT: a file that is not there gives 'HTTP 404', the GPU Brain's file offered as the fruit fly's is refused by name, neither takes the pilot away, and loading the good file again clears the error",
            F.missing === false && /HTTP 404/.test(F.missingErr) && F.stillLoaded === true && F.wrong === false && /pilotFlightMlp/.test(F.wrongErr) && /pilotFlightPolicy/.test(F.wrongErr) && F.stillLoaded2 === true && F.good === true && F.goodErr === null, `${F.missingErr} | ${(F.wrongErr || "").slice(0, 100)}`);
        ok("!! a pilot whose file is not here is NOT OFFERED (disabled in the roster), and a fight that asks for it anyway is flown by the PD autopilot with the label saying why", F.choices.find((c) => c.id === "gpuDogfight").disabled === true && F.fallbackId === "pd" && /PD autopilot/.test(F.fallback) && /not loaded|could not/.test(F.fallback), F.fallback);

        // ---- 9 the log and the cards ----
        ok("!! THE LOG TELLS THE FIGHT: a tail chase by the fruit fly trained to fight lands hits, and the log has a line for the first ('A hit B' with the hit points left) and the line that the fight is over; the card shows A's hits landed and B's hit points down", r.tailLog.some((l) => /A hit B.*hit points left/.test(l)) && r.tailLog.some((l) => /^OVER/.test(l)) && r.tailRes.dealt > 0 && new RegExp(`hits landed ${r.tailRes.dealt}\\b`).test(r.tailCards[0]) && new RegExp(`hit points ${20 - r.tailRes.dealt}/20`).test(r.tailCards[1]),
            `${r.tailRes.dealt} hits; log ${JSON.stringify(r.tailLog.slice(-2))}`);
        // ---- 10 the jet ----
        {
            const J = r.jet;
            ok("!! THE AIRCRAFT SELECTOR SWITCHES THE PAGE TO THE JET'S FIGHT: the selector says jet, the page starts a new fight of its own (duel 3 with the fruit fly's jet layout against the jet fighting autopilot), at tick 0 with both jets flying, between 1,800 and 2,200 m at 120 to 160 m/s -- the trainer's 300 m and 45 m/s scaled -- each with its 300 rounds and 20 hit points",
                J.craft === "jet" && J.selects.join() === "jet,duel,3,hand,pd" && J.state0.tick === 0 && J.state0.crafts.length === 2 && J.state0.crafts.every((c) => c.status === "airborne" && c.pos[2] > 1800 && c.pos[2] < 2200 && Math.hypot(...c.vel) > 120 && Math.hypot(...c.vel) < 160 && c.ammo === 300 && c.hp === 20), `${J.selects} ${J.state0.crafts.map((c) => c.pos[2].toFixed(0) + "m " + Math.hypot(...c.vel).toFixed(0) + "m/s")}`);
            ok("!! THE JET'S ROSTER IS FOUR HAND-FLOWN PILOTS, all offered: the fighting autopilot, the cruise autopilot, the fruit fly's jet layout on hand weights and the GPU Brain's on hand weights (nothing has been trained to fly the jet, so there are no weight files to load or to be missing), each labelled as a jet pilot",
                J.choices.map((c) => c.id).join() === "pd,cruise,hand,gpuHand" && J.choices.every((c) => !c.disabled) && /jet fighting/.test(J.labels[1]) && /fruit fly, jet layout/.test(J.labels[0]), J.labels.join(" | "));
            for (const kind of ["tail", "offset", "turning", "duel"]) {
                const d = JF.duel(AF.jetFightPilot, JF.scenario(2, kind)), k = J.kinds[kind].res;
                ok(`!! the JET'S ${kind} fight, the fighting autopilot on both sides, seed 2, is brain/jetFight.mjs's duel() to the bit in every count it reports (hits dealt and taken, rounds by each side, first hit, kill, both statuses, ticks) and its score to 1e-12`,
                    ["dealt", "taken", "fired", "firedB", "firstHit", "killedB", "statusA", "statusB", "ticks"].every((f) => Object.is(k[f], d[f])) && Math.abs(k.score - d.score) < 1e-12, `${kind}: score ${k.score.toFixed(4)} / ${d.score.toFixed(4)}, ${k.statusA} vs ${k.statusB}`);
            }
            ok("!! THE JET'S STRAIGHT FIGHTS ARE WON AND ITS DUEL IS NOT: the tail, offset and turning fights end with B destroyed and A flying with nothing taken (a score over 1), the duel (seed 2: A is hit 14 times and lands none) has no kill and both jets are still flying at the minute (the hand pilot against itself: the numbers brain/jetFight-selfcheck.mjs pins)", ["tail", "offset", "turning"].every((k) => J.kinds[k].res.statusB === "destroyed" && J.kinds[k].res.statusA === "airborne" && J.kinds[k].res.taken === 0 && J.kinds[k].res.score > 1) && J.kinds.duel.res.dealt + J.kinds.duel.res.taken > 0 && J.kinds.duel.res.statusB === "airborne" && J.kinds.duel.res.statusA === "airborne", JSON.stringify(["tail", "offset", "turning", "duel"].map((k) => J.kinds[k].res.score.toFixed(2))));
            ok("!! THE TWO NETWORKS FLY THE JET'S FIGHT THE AUTOPILOT FLIES, hit for hit: duel 3 with the fruit fly's jet layout in seat A, then the GPU Brain's, and then the fighting autopilot itself, give the same hits, rounds, statuses and ticks, and the same score (the page labels name the network); the cruise autopilot (gentler gains) flies a different fight", J.handIds.join() === "hand,pd" && /fruit fly, jet layout/.test(J.gpuLabels[0] + "") === false && /GPU Brain network, jet layout/.test(J.gpuLabels[0]) && ["dealt", "taken", "fired", "firedB", "statusA", "statusB", "ticks"].every((f) => Object.is(J.hand[f], J.pd[f]) && Object.is(J.gpu[f], J.pd[f])) && J.hand.score === J.pd.score && J.gpu.score === J.pd.score && (J.cruise.dealt !== J.pd.dealt || J.cruise.taken !== J.pd.taken || J.cruise.ticks !== J.pd.ticks), `pd ${J.pd.dealt}/${J.pd.taken}, hand ${J.hand.dealt}/${J.hand.taken}, gpu ${J.gpu.dealt}/${J.gpu.taken}, cruise ${J.cruise.dealt}/${J.cruise.taken}`);
            const P = J.pix;
            ok("!! THE JET'S VIEWS ARE PICTURES OF A WORLD, AND THE SIGHT AND THE BRAIN WORK: plane, pilot and gunner each hold many colours; the gunner's sight draws the bore cross, the pipper and the lead pip on a target 700 m ahead (a tail chase 2 s in); the pilot's view has its cross; the brain window is the network's bars (the jet layout's 18 features)",
                ["plane", "pilot", "gunner"].every((v) => P[v].gl.distinct >= 8) && P.gunner.cross > 8 && P.gunner.pipper > 15 && P.gunner.lead > 15 && P.pilot.cross > 8 && P.brain.gl.distinct <= 2 && P.brain.bars > 1000, `plane ${P.plane.gl.distinct} colours, gunner cross ${P.gunner.cross} pipper ${P.gunner.pipper} lead ${P.gunner.lead}, brain bars ${P.brain.bars}`);
            ok("!! THE OVERVIEW KEEPS BOTH JETS IN FRAME after 20 s of a duel (they are 2 to 3 km apart; the trainer's cameras are tens of metres)", J.mainNdc.every(([x, y, z]) => Math.abs(x) <= 1.02 && Math.abs(y) <= 1.02 && z > 0 && z < 1), JSON.stringify(J.mainNdc.map((n) => n.map((v) => +v.toFixed(2)))));
            ok("!! THE JET IS DRAWN THREE TIMES LIFE SIZE AND THE TRAINER AT LIFE SIZE; THE FOG AND THE CHASE CAMERA ARE THE JET'S: a model scale of 3 (the trainer 1), a fog from 4,000 to 24,000 m (the trainer's 1,500 to 9,000), the chase camera 114 m from the jet (110 m behind and 30 above, the trainer's 25), the brain window's first row is the JET LAYOUT's features (named bankCompScheduled and upright) and the cruise pilot is seated as 'cruise'",
                J.scale === 3 && J.scaleTrainer === 1 && J.fog.join() === "4000,24000" && J.fogTrainer.join() === "1500,9000" && Math.abs(J.chase - Math.hypot(110, 30)) < 8 && J.brainNames.includes("bankCompScheduled") && J.brainNames.includes("upright") && J.cruiseIds.join() === "cruise,pd", `scale ${J.scale}/${J.scaleTrainer}, chase ${J.chase.toFixed(0)} m, fog ${J.fog}`);
            ok("!! A PAGE OPENED WITH ?craft=jet STARTS AS THE JET'S: the selector says jet, the fight is the one in the address (tail 2, the cruise autopilot against the fighting one), both jets between 1,800 and 2,200 m, and the jet's fog", r.jetUrl.craft === "jet" && r.jetUrl.selects.join() === "jet,tail,2,cruise,pd" && r.jetUrl.ids.join() === "cruise,pd" && r.jetUrl.alt.every((z) => z > 1800 && z < 2200) && r.jetUrl.fog.join() === "4000,24000", JSON.stringify(r.jetUrl.selects));
            ok("!! THE WAY BACK: switching to the trainer restores its seven pilots (all enabled), its default fight (the fruit fly trained to FIGHT against the PD autopilot), and the selector says trainer", J.back.craft === "trainer" && J.back.choices.map((c) => c.id).join() === "pd,hand,flight,dogfight,gpuHand,gpuFlight,gpuDogfight" && J.back.choices.every((c) => !c.disabled) && J.back.selects.join() === "trainer,dogfight,pd" && J.back.state.tick === 0 && J.back.state.crafts.every((c) => c.pos[2] > 200 && c.pos[2] < 400), J.back.selects.join());
        }

        ok("the pause button toggles: playing, then paused with the button saying Play, then playing again", r.pause[0] === false && r.pause[2] === true && /Play/.test(r.pause[3]) && r.pause[4] === false && /Pause/.test(r.pause[5]), JSON.stringify(r.pause));
    }
}

console.log(fails ? `\ndogfightPage-selfcheck: ${fails} FAILED` : "\ndogfightPage-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
