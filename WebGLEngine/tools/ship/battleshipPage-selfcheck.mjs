// WebGLEngine/tools/ship/battleshipPage-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/ship/battleshipPage-selfcheck.mjs      (~2 min: a real browser, software rendering, thirty full fights of up to 120 s)
//
// THE PAGE-WIRING GATE for battleship.html. Everything the page WIRES TOGETHER -- brain/battleshipFight.mjs (the scenario, the gunners, the tally: pinned on its own), brain/spaceArena.mjs (the ship, its thirteen seats, its parts, the cannon, the fighters' doctrine: held on its own),
// physics/mechanics/capitalShip.mjs, render/flightViews.mjs (the cameras, nextWindow, seatRows, the vacuum sight, the 6DOF pilot's activations), brain/pilot6dofPolicy.mjs and its three shipped weight files -- is gated on its own; this file proves the WIRING in a real browser: the page
// boots with no error and flies the fight it says, ONE WINDOW PER CRAFT stacked down the right (the ship's first and taller), a CLICK on the ship's window goes plane -> pilot -> seat 1 ... seat 13 -> brain -> plane (a fighter's goes plane -> pilot -> gunner -> brain) without touching the
// others, the views are really different pictures (the WebGL pixels under each window are read back), a gun seat's window draws the sight for the target THAT gunner chose, in VACUUM (the pipper and the lead pip, where flightViews.gunsight puts them with gravity 0 -- and not where the Earth's gravity
// would), the brain windows show the pilots' own numbers (a fighter's twelve features, its network's 34 hidden and five outputs or the PD's five commands; the hull and a row per seat for the ship), the turrets the scene draws point where the seats point, an engine pod or a turret or a mount shot
// to nothing goes dark and the card and the log say so, the wave-motion cannon's charge and beam are drawn, the big picture marks every craft, and the options -- the attack, the seed, how many fighters, the gunners' skill, the fighters' pilot (the PD autopilot, the network twin, the shipped pilot,
// the league pilot, the close-quarters pilot, a mix), the ship's behaviour and cruise -- are the fight that runs: every one is checked against brain/battleshipFight.fight() run here, to the bit in every count. The stack scrolls when the craft do not fit and a window half out of it is cut at its
// edge. The exact state is read through window.__battleship (a hook the page exposes, whose step(n) is the gate's clock: no waiting on frames).
//
// SABOTAGE LOG -- EIGHTY-NINE, each applied to battleship.html in a scratch worktree, the gate run, the worktree restored; every one red by name (the number is how many rows went red):
//   BSP1 a click does nothing 3 | BSP2 the ship's window skips the seats 2 | BSP3 a click on a window switches the plane windows too 3 | BSP4 a window for the ship only 1
//   BSP5 the views are not kept across a new fight 1 | BSP6 the seat is not kept across a new fight 1 | BSP7 the window label never names the seat 1 | BSP8 a seat's view is the pilot's camera 6
//   BSP9 a seat's view is always seat 1's 4 | BSP10 the sight's target is the ship's nearest foe, not the gunner's 2 | BSP11 no pipper in the sight 1 | BSP12 no lead pip in the sight 1
//   BSP13 no FIRE in a seat's sight 2 | BSP14 no bore cross in the sight 2 | BSP15 the sight allows for the Earth's gravity 2 | BSP16 a fighter's sight is from its centre, not its muzzle 1
//   BSP17 the brain window has no seat rows 2 | BSP18 the seat rows never see the gunner's command 1 | BSP19 the hull row's turn rates are not scaled 1 | BSP20 the hull row's thrust is not a fraction 1
//   BSP21 the hull row's engines are not a fraction 1 | BSP22 the hull row's cannon is not a fraction 1 | BSP23 the hull row's hull is not a fraction 1
//   BSP24 the PD's pitch torque is shown without the network's gain 2 | BSP25 the PD's thrust is 0 or 1 1 | BSP26 the PD's trigger is always on 1
//   BSP27 the features are those of the foe, not the doctrine's aim point 2 | BSP28 every fighter has the first pilot 1 | BSP29 the fighter's index is off by one 1 | BSP30 a network's rows are the PD's 1
//   BSP31 the turrets do not turn 1 | BSP32 the turrets' yaw and pitch are swapped 1 | BSP33 a pod shot out is not drawn dark 1 | BSP34 a pod's glow stays on 1 | BSP35 a seat shot out is not drawn dark 1
//   BSP36 a seat that is out says nothing 1 | BSP37 the hit spheres are never shown 1 | BSP38 the hit spheres are always shown 2 | BSP39 a part going out is not logged 2
//   BSP40 a hit on the ship does not name the part 1 | BSP41 the log's engine count is one too many 1 | BSP42 the card shows every pod running 1 | BSP43 the card never lists the parts out 1
//   BSP44 the cannon's charge is not drawn 1 | BSP45 the cannon's beam is never drawn 1 | BSP46 the cannon's beam stays 1 | BSP47 the beam's clock is not started by the shot 1
//   BSP48 the cannon's shot is not logged 1 | BSP49 the markers do not follow the craft 2 | BSP50 the dead keep their marker's colour 1 | BSP51 the ship's marker is a fighter's 2
//   BSP52 the markers are left hidden 2 | BSP53 a fighter's engine always glows 1 | BSP54 the main shells are drawn as point defence 1 | BSP55 the fighters' rounds are drawn as the ship's 1
//   BSP56 the stack does not scroll 1 | BSP57 a window half out of the stack is not cut 1 | BSP58 a window scrolled out of the stack is drawn anyway 1 | BSP59 reading a window does not bring it into view 1
//   BSP60 the window boxes paint their own background 1 | BSP61 the ship's window is no taller than a fighter's 3 | BSP62 the ship's chase camera is the fighters' 1 | BSP63 the ship's chase is 100 back 2
//   BSP64 the ship's bridge is 3 units higher 1 | BSP65 a fighter's chase is 14 back 1 | BSP66 the tick steps the arena twice 8 | BSP67 the pause button does nothing 1 | BSP68 the gunners' skill is ignored 5
//   BSP69 the number of fighters is ignored 4 | BSP70 the fighters' pilot is ignored 3 | BSP71 the ship's behaviour is ignored 3 | BSP72 the ship's cruise is ignored 3 | BSP73 the attack kind is ignored 9
//   BSP74 the seed is ignored 10 | BSP75 the number of fighters is not capped 1 | BSP76 a change of cruise does not start a new fight 1 | BSP77 the default pilot is the shipped one 3
//   BSP78 a mix includes pilots that are not loaded 1 | BSP79 the pilot label has no hash 1 | BSP80 the pilot label has no held-out score 1 | BSP81 the fallback pilot's label does not say why 1
//   BSP82 a refused later load takes the held pilot away 1 | BSP83 a pilot that is not loaded is still offered 1 | BSP84 a missing file is not said 1 | BSP85 the overview leaves out the far fighters 1
//   BSP86 chase fighter 1 follows the ship 1 | BSP87 the stat line counts only the destroyed 1 | BSP88 the PD's yaw torque is shown without the network's gain 2 | BSP89 a ram is not logged 1
// FIVE WENT 0 RED THE FIRST TIME AND WERE FIXED IN THE GATE, NOT EXCUSED: BSP25 and BSP24 (the PD's thrust shown as 0 or 1 where the network's scale is -1 or +1, and its torque shown without the network's gain of 40) because the brain rows were only compared at tick 60, when every fighter has its engine on and the pitch and yaw torques are 0 -- all eight fighters' rows are now compared with the module's at tick 480, with a premise that some fighter has its thrust CUT, some its trigger pulled and a pitch and a yaw torque that are not zero (0.01 and 0.04 of the network's scale: small, and the row holds them to 1e-5; the roll torque is 0 in every PD fight, so the roll version of BSP24 is an equivalent mutant and the sabotage is made on the pitch and the yaw, BSP24 and BSP88); BSP85 (the overview leaving out all but the first two fighters) because a stern attack keeps the fighters close together -- a swarm of twelve, which comes from every side, is now held in frame too; BSP87 (the stat line counting only the destroyed, not the rammed) because no fight in the tree has a fighter that touches the hull -- the gate now puts one there with the page's own ram() hook and reads the stat line, the log, the card, the ship's 1,475 hit points and the grey marker; BSP56 (the stack not scrolling) because overflow-y:visible beside overflow-x:hidden COMPUTES to auto -- it was an equivalent mutant; the sabotage is now overflow:hidden and the gate reads the stack's computed overflow. NOT HELD, SAID PLAINLY: that the markers are hidden while the windows are drawn (only that they are visible again afterwards) -- a marker left in a window would paint a 7-pixel square over the craft and no row reads that; the page's look (the ship's hull, tower and pods, the stars) is read by eye in the screenshots, not by a row; the sabotages of the first pass ran against the gate before those five rows existed and the five were re-run against the final gate (every row added only makes a sabotage redder, and the options comparison was re-ordered to the shared-first order the module now gives).
"use strict";
import { runInEngineOrigin, webgpuSkipReason } from "./webgpuHarness.mjs";
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as PB from "../../brain/peerBrain.mjs";
import * as P6 from "../../brain/pilot6dofPolicy.mjs";
import * as AP from "../../brain/autopilot6dof.mjs";
import * as BS from "../../brain/battleshipFight.mjs";
import * as SA from "../../brain/spaceArena.mjs";
import * as CS from "../../physics/mechanics/capitalShip.mjs";
import * as GS from "../../physics/mechanics/gunSeats.mjs";
import * as RB from "../../physics/mechanics/rigidBody6dof.mjs";
import * as V from "../../render/flightViews.mjs";
import { weightsHash } from "../../brain/drivePolicy.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
function ok(name, cond, detail) { console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? "   " + detail : ""}`); if (!cond) fails++; }
function report(name, detail) { console.log(`  ----  ${name}   ${detail}`); }

console.log("battleshipPage-selfcheck -- battleship.html really wires the gated modules together\n");

const skip = webgpuSkipReason(createRequire(import.meta.url));
if (skip) { console.log(`  SKIP  ${skip}`); report("*** NOT A PASS. ***", ""); fails++; }
else {
    const run = await runInEngineOrigin({
        engineRoot: ENG, timeoutMs: 560000,
        script: `async () => {
            globalThis.__swekStep = "booting battleship.html in an iframe";
            const f = document.createElement("iframe");
            f.style.width = "1100px"; f.style.height = "1250px";
            f.src = "/battleship.html";
            document.body.appendChild(f);
            await new Promise((res) => { f.onload = res; });
            const win = f.contentWindow, doc = win.document, wait = (ms) => new Promise((res) => setTimeout(res, ms));
            const t0 = performance.now();
            while (performance.now() - t0 < 40000 && !win.__battleship) { globalThis.__swekStep = "waiting for window.__battleship"; await wait(200); }
            if (!win.__battleship) return { booted: false, reason: "window.__battleship never appeared" };
            const B = win.__battleship; await B.ready; B.hold(true);
            const out = { booted: true }, views = () => B.windows().map((w) => (w.view === "gunner" ? "gunner" + w.seat : w.view)), cards = () => [...doc.querySelectorAll(".card")].map((c) => c.textContent);
            const sel = (id) => doc.getElementById(id);
            const set = (id, v) => { const e = sel(id); if (e.type === "checkbox") e.checked = v; else e.value = String(v); };
            const fightOf = (o) => { B.newFight(o); B.step(3700); return { tally: B.tally(), state: B.state() }; };
            const base = { kind: "beam", seed: 1, fighters: 8, gunners: "regular", f: "pd", behaviour: "face", cruise: 0.3 };

            // ---- the page's OWN default fight, before anything touches it ----
            out.boot = { windows: B.windows(), choices: B.roster.choices, label: B.roster.label, state: B.state(), cards: cards(), stat: sel("stat").textContent, note: sel("note").textContent,
                selects: ["kind", "seed", "nfight", "gunners", "pilotF", "behaviour", "cruise"].map((id) => sel(id).value), spheres: sel("spheres").checked, spheresShown: B.spheresShown(), markers: B.markers(), camMode: sel("camMode").value };
            B.step(60); out.s60 = B.state(); out.rows60 = { ship: B.brainRows(0), f1: B.brainRows(1) };
            B.step(3700); out.end = B.state(); out.endTally = B.tally(); out.endStat = sel("stat").textContent; out.endLog = out.end.log; out.endCards = cards();
            B.step(5); out.afterDone = B.state().tick;

            // ---- the options are the fight that runs: each kind of attack, PD fighters, regular gunners, seed 2 ----
            out.kinds = {};
            for (const kind of ["bow", "beam", "stern", "swarm"]) { globalThis.__swekStep = "full fight: " + kind; out.kinds[kind] = fightOf({ ...base, kind, seed: 2 }).tally; }
            out.opts = {};
            globalThis.__swekStep = "full fights: the options";
            out.opts.five = (() => { const r = fightOf({ ...base, kind: "swarm", seed: 3, fighters: 5 }); return { tally: r.tally, windows: B.windows().length, cards: cards().length, stat: sel("stat").textContent }; })();
            out.opts.twelve = (() => { B.newFight({ ...base, kind: "swarm", seed: 3, fighters: 12 }); const w = B.windows().length, c = cards(); B.step(3700); return { tally: B.tally(), windows: w, cards: c.length, row: (c[1].match(/fighter \\d+ /g) || []).length, stat: sel("stat").textContent }; })();
            out.opts.tooMany = (() => { B.newFight({ ...base, fighters: 40 }); const n = B.state().crafts.length; B.newFight({ ...base, fighters: 0 }); return [n, B.state().crafts.length]; })();
            out.opts.perfect = fightOf({ ...base, kind: "beam", seed: 3, gunners: "perfect" });
            out.opts.green = fightOf({ ...base, kind: "beam", seed: 3, gunners: "green" });
            out.opts.ace = fightOf({ ...base, kind: "beam", seed: 3, gunners: "ace" });
            out.opts.hold = fightOf({ ...base, kind: "bow", seed: 1, behaviour: "hold", cruise: 0.6 });
            out.opts.holdBase = fightOf({ ...base, kind: "bow", seed: 1 });
            out.opts.faceCruise = fightOf({ ...base, kind: "bow", seed: 1, cruise: 0 });
            out.opts.shipped = fightOf({ ...base, kind: "swarm", seed: 1, gunners: "green", f: "shipped" });
            out.opts.league = fightOf({ ...base, kind: "swarm", seed: 2, f: "league" });
            out.opts.close = fightOf({ ...base, kind: "swarm", seed: 2, f: "close" });
            out.opts.hand = fightOf({ ...base, kind: "bow", seed: 2, f: "hand" });
            out.opts.mix = fightOf({ ...base, kind: "swarm", seed: 2, f: "mix" });
            out.opts.pdBeside = fightOf({ ...base, kind: "swarm", seed: 2 });

            // ---- the windows: the layout, the click, the other windows, the views kept across a new fight ----
            B.newFight({ ...base, f: "mix" });
            out.layout = B.windows().map((w) => w.rect); out.windowBg = B.windows().map((w) => w.bg); out.stackRect = B.stackRect();
            out.seq = [views()]; for (let k = 0; k < 17; k++) { B.clickWindow(0); out.seq.push(views()); }
            out.seqLabels = []; B.setView(0, "plane"); for (let k = 0; k < 16; k++) { out.seqLabels.push(B.windows()[0].label); B.clickWindow(0); }
            B.setView(0, "plane"); out.fighterSeq = [views()]; for (let k = 0; k < 5; k++) { B.clickWindow(1); out.fighterSeq.push(views()); }
            B.setView(1, "plane"); B.setView(0, "gunner", 9); B.setView(2, "brain"); B.newFight({ ...base, f: "mix", seed: 4 }); out.kept = [B.windows().map((w) => [w.view, w.seat])];
            B.newFight({ ...base, f: "mix", seed: 4, fighters: 2 }); out.keptTwo = [B.windows().map((w) => [w.view, w.seat])];
            B.setView(0, "plane"); B.setView(1, "plane"); B.setView(2, "plane");

            // ---- the pictures: the pixels under each window, in each view, early in a beam attack (every seat has a target by tick 40) ----
            B.newFight({ ...base }); B.step(90);
            const c0 = B.state().crafts[0], mainSeat = c0.seats.findIndex((s, k) => k < 3 && s.last && s.last.target != null), firing = c0.seats.findIndex((s) => s.last && s.last.fire && s.last.target != null && s.last.target !== c0.last.foe);
            out.pictures = { tick: B.state().tick, mainSeat, firing };
            out.pix = {};
            const take = (name, i, v, seat) => { B.setView(i, v, seat); out.pix[name] = { gl: B.pixels(i), ink: B.ink(i), bars: B.inkColor(i, [89, 209, 255]) + B.inkColor(i, [246, 166, 35]), pipper: B.inkColor(i, [90, 214, 255]), lead: B.inkColor(i, [246, 166, 35]), cross: B.inkColor(i, [127, 224, 160]), fire: B.inkColor(i, [255, 107, 107]), sight: B.sight(i), texts: B.texts(i), rect: B.windows()[i].rect, cam: B.cameraOf(i) }; };
            take("plane", 0, "plane"); take("pilot", 0, "pilot");
            if (firing >= 0) take("seat", 0, "gunner", firing);
            if (mainSeat >= 0) take("main", 0, "gunner", mainSeat);
            take("seatOther", 0, "gunner", firing === 12 ? 0 : 12);
            take("brain", 0, "brain"); take("fighterPlane", 1, "plane"); take("fighterPilot", 1, "pilot"); take("fightGunner", 1, "gunner"); take("fightBrain", 1, "brain");
            out.brainRowsShip = B.brainRows(0); out.brainRowsFighter = B.brainRows(1); out.stateAtPictures = B.state();
            B.setView(0, "plane"); B.setView(1, "plane");
            out.turrets = B.state().crafts[0].seats.map((s, k) => ({ yaw: s.yaw, pitch: s.pitch, q: B.turretAim(k) }));
            B.newFight({ ...base }); B.step(420); out.tracers = [];
            for (let k = 0; k < 12; k++) { B.step(5); out.tracers.push({ tick: B.state().tick, counts: B.tracers() }); }
            out.late = { tick: B.state().tick, rows: [1, 2, 3, 4, 5, 6, 7, 8].map((i) => B.brainRows(i)) };
            B.newFight({ ...base }); B.step(400); out.glow = { samples: [] };
            for (let k = 0; k < 40; k++) { B.step(3); out.glow.samples.push({ tick: B.state().tick, shown: B.fighterGlow(), thrust: B.state().crafts.slice(1).map((c) => !!(c.last && c.last.thrust > 0)) }); }

            // ---- the brain window's rows for a MIX of pilots: fighter 1 the PD autopilot, 2 the shipped network, 3 league, 4 close ----
            B.newFight({ ...base, kind: "swarm", seed: 2, f: "mix", fighters: 5 }); B.step(75);
            out.mixRows = [1, 2, 3, 4, 5].map((i) => B.brainRows(i)); out.mixState = B.state();

            // ---- the CONTROLS: every knob set on the page and the New fight button pressed is the fight that runs ----
            B.newFight({ ...base });
            set("kind", "stern"); set("seed", 3); set("nfight", 6); set("gunners", "green"); set("pilotF", "mix"); set("behaviour", "hold"); set("cruise", 0.5); sel("newBtn").click(); B.step(3700);
            out.ui = { tally: B.tally(), state: B.state(), sel: ["kind", "seed", "nfight", "gunners", "pilotF", "behaviour", "cruise"].map((id) => sel(id).value) };
            B.newFight({ ...base }); B.step(10);
            out.change = {};
            for (const [id, v] of [["gunners", "green"], ["kind", "stern"], ["seed", 7], ["nfight", 5], ["behaviour", "hold"], ["cruise", 0.6], ["pilotF", "shipped"]]) {
                set(id, v); sel(id).dispatchEvent(new win.Event("change", { bubbles: true })); const st2 = B.state();
                out.change[id] = { tick: st2.tick, crafts: st2.crafts.length, kind: st2.scenario.kind, seed: st2.scenario.seed, gunners: st2.gunnerOptions, pilot: st2.pilots.id, behaviour: st2.behaviour, cruise: st2.cruise };
            }

            // ---- the parts: shoot an engine pod, a flank mount, a main turret to nothing ----
            B.newFight({ ...base, kind: "bow" }); B.step(20);
            out.partsBefore = { engines: B.engineShown(), seats: B.seatShown(), running: B.state().crafts[0].enginesRunning, card: cards()[0], spheres: B.spheresShown() };
            B.shoot("engine pod 2", 6); B.step(8); const stE = B.state();
            out.engAfter = { engines: B.engineShown(), running: stE.crafts[0].enginesRunning, card: cards()[0], log: stE.log, hp: stE.crafts[0].hp };
            B.shoot("port PD 1", 4); B.step(8); B.shoot("main turret A", 7); B.step(8); const stP = B.state();
            B.setView(0, "gunner", 3); B.step(1); out.pdOutTexts = B.texts(0); B.setView(0, "gunner", 0); B.step(1); out.mainOutTexts = B.texts(0); B.setView(0, "gunner", 4); B.step(1); out.pdWorksTexts = B.texts(0); B.setView(0, "plane");
            out.seatsAfter = { shown: B.seatShown(), works: stP.crafts[0].seats.map((s) => s.works), partsOut: stP.crafts[0].partsOut, card: cards()[0], log: stP.log, aim: B.turretAim(0) };
            sel("spheres").checked = true; B.step(1); out.spheresOn = B.spheresShown(); sel("spheres").checked = false; B.step(1); out.spheresOff = B.spheresShown();

            // ---- the wave-motion cannon: the pinned fight in which it fires once (green gunners, a swarm, seed 3) ----
            B.newFight({ ...base, kind: "swarm", seed: 3, gunners: "green" }); out.cannon = { start: B.cannonShown(), card: cards()[0] };
            B.step(300); out.cannon.mid = B.cannonShown(); out.cannon.midCard = cards()[0]; out.cannon.midState = B.state().crafts[0].charge;
            let firedAt = null; for (let t = 0; t < 3400 && firedAt === null && !B.state().done; t++) { B.step(1, false); if (B.state().crafts[0].waves > 0) firedAt = B.state().tick; }
            B.step(0);
            out.cannon.firedAt = firedAt; out.cannon.afterFire = B.cannonShown(); out.cannon.log = B.state().log.filter((l) => /WAVE/.test(l)); out.cannon.charge = B.state().crafts[0].charge; out.cannon.cardAfter = cards()[0];
            B.step(20); out.cannon.later = B.cannonShown();

            // ---- the markers, the dead, the log ----
            B.newFight({ ...base, kind: "beam", seed: 1, gunners: "perfect" }); B.step(30); out.markersEarly = { m: B.markers(), state: B.state(), cards: cards() };
            B.step(470); out.markersLate = { m: B.markers(), state: B.state(), cards: cards(), log: B.state().log, fighterWins: B.windows().map((w) => w.label) };

            // ---- a fighter that touches the hull is lost, and the ship takes the ram ----
            B.newFight({ ...base, gunners: "perfect" }); B.step(10); out.ramBefore = { stat: sel("stat").textContent, hp: B.state().crafts[0].hp, hook: true };
            out.ramBefore.hook = B.ram(1); B.step(1); const sR = B.state(); out.ram = { stat: sel("stat").textContent, log: sR.log, tally: B.tally(), cards: cards(), status: sR.crafts[1].status, hp: sR.crafts[0].hp, markerGrey: B.markers().color.slice(3, 6) };

            // ---- a pilot file that will not load: said, and the pilot the page holds is kept ----
            out.fail = {};
            out.fail.missing = await B.roster.loadChoice("shipped", "/brain/pilot6dofWeightsNope.json"); out.fail.missingErr = B.roster.error("shipped"); out.fail.stillLoaded = B.roster.loaded("shipped");
            out.fail.wrong = await B.roster.loadChoice("shipped", "/brain/pilotFlightWeightsDefault.json"); out.fail.wrongErr = B.roster.error("shipped"); out.fail.stillLoaded2 = B.roster.loaded("shipped");
            out.fail.good = await B.roster.loadChoice("shipped"); out.fail.goodErr = B.roster.error("shipped");
            B.roster.forget("league"); out.fail.choices = B.roster.choices;
            B.newFight({ ...base, f: "league" }); out.fail.fallback = B.roster.label; out.fail.fallbackId = B.state().pilots.id; out.fail.state = B.state().pilots;
            B.newFight({ ...base, f: "mix", fighters: 4 }); out.fail.mixList = B.state().pilots.list.map((p) => p.id);
            await B.roster.loadChoice("league"); B.newFight({ ...base, f: "mix", fighters: 4 }); out.fail.mixListAfter = B.state().pilots.list.map((p) => p.id);

            // ---- the big picture keeps every craft in frame, and the camera modes go where they say ----
            B.newFight({ ...base, kind: "stern", seed: 2 }); B.step(300); sel("camMode").value = "overview"; B.settleCamera(); out.mainNdc = B.mainView();
            B.step(300); B.settleCamera(); out.mainNdc2 = B.mainView();
            B.newFight({ ...base, kind: "swarm", seed: 5, fighters: 12 }); B.settleCamera(); out.mainNdc3 = B.mainView(); B.step(120); B.settleCamera(); out.mainNdc4 = B.mainView(); B.newFight({ ...base, kind: "stern", seed: 2 }); B.step(300);
            sel("camMode").value = "chase0"; B.settleCamera(); out.chase0 = { cam: B.mainCamera(), state: B.state() };
            sel("camMode").value = "chase1"; B.settleCamera(); out.chase1 = { cam: B.mainCamera(), state: B.state() };
            sel("camMode").value = "overview"; B.settleCamera();

            // ---- pause ----
            const pb = doc.getElementById("pauseBtn"); out.pause = [B.paused, pb.textContent]; pb.click(); out.pause.push(B.paused, pb.textContent); pb.click(); out.pause.push(B.paused, pb.textContent);

            // ---- the stack scrolls: a short page, the nine windows do not fit ----
            f.style.height = "560px"; await wait(400); B.newFight({ ...base }); B.step(3); await wait(200);
            const sr = B.stackRect(), ws = B.windows(), sc = B.scissors();
            out.scroll = { stack: sr, rects: ws.map((w) => w.rect), scissors: sc, scrollable: doc.getElementById("stack").scrollHeight > doc.getElementById("stack").clientHeight, overflowY: win.getComputedStyle(doc.getElementById("stack")).overflowY, innerHeight: win.innerHeight };
            const px = B.pixels(8); out.scroll.px = px; out.scroll.after = { scissors: B.scissors(), stackTop: doc.getElementById("stack").scrollTop, rect8: B.windows()[8].rect, stack: B.stackRect() };
            f.style.height = "1250px"; await wait(400);
            return out;
        }`,
    });

    ok("the harness booted battleship.html and found window.__battleship", run.ok && run.result && run.result.booted, run.ok ? (run.result ? "" : "no result") : String(run.reason || JSON.stringify(run)).slice(0, 300));
    if (run.pageErrors && run.pageErrors.length) report("page console errors", run.pageErrors.slice(0, 5).join(" | ").slice(0, 400));
    // the run asks for one file that is not there ON PURPOSE (the pilot file's failure path): the browser logs that as one 404, and nothing else may be logged
    const errs404 = (run.pageErrors || []).filter((e) => /\b404\b/.test(e)), other = (run.pageErrors || []).filter((e) => !/\b404\b/.test(e));
    ok("!! no page errors were logged during the whole run -- except the ONE 404 the gate asks for on purpose (the pilot file that is not there); a second missing file would be a second 404", other.length === 0 && errs404.length <= 1, `${other.length} other, ${errs404.length} x 404 ${other.slice(0, 2).join(" | ").slice(0, 200)}`);

    if (run.ok && run.result && run.result.booted) {
        const r = run.result;
        const blobOf = (f) => JSON.parse(fs.readFileSync(path.join(ENG, "brain", f), "utf8")), weightsOf = (f) => Float32Array.from(blobOf(f).weights);
        const WS = weightsOf("pilot6dofWeightsDefault.json"), WL = weightsOf("pilot6dofWeightsLeague.json"), WC = weightsOf("pilot6dofWeightsClose.json"), WH = P6.handWeights();
        const SHIPPED = P6.pilotFor(WS), LEAGUE = P6.pilotFor(WL), CLOSE = P6.pilotFor(WC), HAND = P6.pilotFor(WH), MIX = [undefined, SHIPPED, LEAGUE, CLOSE];
        const DESC = PB.describePolicy("pilot6dofPolicy", P6), shipImp = PB.importBrain(DESC, blobOf("pilot6dofWeightsDefault.json"));
        const seatsOf = CS.createCapitalShip().seats;
        // the page's tally against battleshipFight.fight()'s, to the bit in every count it reports
        const same = (a, b) => ["winner", "over", "ticks", "killed", "rammed", "flying", "damageOnShip"].every((k) => Object.is(a[k], b[k])) && ["status", "hpLeft", "enginesRunning", "seatRounds", "hitsDealt", "waves", "charge"].every((k) => Object.is(a.ship[k], b.ship[k])) && a.ship.partsOut.join() === b.ship.partsOut.join()
            && a.fighters.length === b.fighters.length && a.fighters.every((f, i) => f.status === b.fighters[i].status && f.hpLeft === b.fighters[i].hpLeft && f.fired === b.fighters[i].fired && f.hitsDealt === b.fighters[i].hitsDealt && f.mode === b.fighters[i].mode);
        const line = (t) => `${t.winner}, ${t.ticks} ticks, ${t.killed} shot down, ${t.damageOnShip} damage on the ship`;

        // ---- 1 the boot ----
        const b = r.boot;
        ok("!! THE PAGE'S OWN FIGHT (before the gate touches it) is a beam attack, seed 1, eight fighters, regular gunners, the PD autopilot for the fighters, the ship facing the enemy at 0.3 cruise, the hit spheres OFF, the big picture on the overview, at tick 0 with everyone flying and nine markers",
            b.selects.join() === "beam,1,8,regular,pd,face,0.3" && b.spheres === false && b.spheresShown.length === 22 && b.spheresShown.every((v) => v === false) && /PD autopilot/.test(b.label) && b.state.tick === 0 && b.state.crafts.length === 9 && b.state.crafts.every((c) => c.status === "flying") && b.camMode === "overview" && b.markers.n === 9 && b.markers.visible === true, `${b.selects.join()} | ${b.label}`);
        ok("!! the roster offers all six pilots for the fighters, every one enabled (the PD autopilot; the PD written into the network; the shipped pilot; the league-trained one; the close-quarters one; a mix of them in turn)", b.choices.map((c) => c.id).join() === "pd,hand,shipped,league,close,mix" && b.choices.every((c) => !c.disabled));
        ok("!! NINE WINDOWS, one per craft, THE SHIP'S FIRST AND TALLER, each showing the plane from outside to start with, each labelled with its number, its name and the view", b.windows.length === 9 && b.windows.every((w, i) => w.craft === i && w.view === "plane" && w.label.startsWith(`${i + 1}. ${i ? "fighter " + i : "battleship"} --`) && /\(from outside/.test(w.label) && /click to switch/.test(w.label)) && b.windows[0].rect.height > b.windows[1].rect.height * 1.8 && b.windows.slice(1).every((w) => w.rect.height === b.windows[1].rect.height), b.windows.map((w) => w.label).join(" | ").slice(0, 200));
        ok("the board has two cards: the ship's (flying, 1500/1500, its three engine pods, the cannon at 0% and the parts out: none) and the fighters' (eight rows with the pilot named, each flying in its approach), and the stat line and the note name the fight",
            b.cards.length === 2 && /^battleship/.test(b.cards[0]) && /flying/.test(b.cards[0]) && /hit points 1500\/1500/.test(b.cards[0]) && /engines ● ● ● 3 of 3/.test(b.cards[0]) && /wave-motion cannon \(invented\) 0% charged, fired 0/.test(b.cards[0]) && /parts out: none/.test(b.cards[0]) && /gunners regular/.test(b.cards[0])
            && /^8 fighters/.test(b.cards[1]) && b.cards[1].includes(b.label) && /8 flying, 0 shot down, 0 rammed/.test(b.cards[1]) && (b.cards[1].match(/approach/g) || []).length === 8 && /beam 1/.test(b.stat) && /0 of 8 fighters down/.test(b.stat) && /click a window/.test(b.note) && /1-13/.test(b.note), `${b.stat}`);
        ok("!! THE MARKERS: nine, one per craft, at the crafts' own positions, the ship's teal and the fighters' orange, in the big picture", (() => { const m = b.markers, st = b.state.crafts; return st.every((c, i) => Math.abs(m.pos[i * 3] - c.pos[0]) < 1e-3 && Math.abs(m.pos[i * 3 + 1] - c.pos[1]) < 1e-3 && Math.abs(m.pos[i * 3 + 2] - c.pos[2]) < 1e-3) && m.color[1] > 0.9 && m.color[2] > 0.7 && m.color[0] < 0.4 && [1, 2, 3, 4, 5, 6, 7, 8].every((i) => m.color[i * 3] > 0.9 && m.color[i * 3 + 1] > 0.5 && m.color[i * 3 + 2] < 0.4); })());

        // the brain window's numbers are the pilots' own: at tick 60 the ship's hull row and the PD fighter's features and commands, from the same fight run here
        const ref = BS.build(1, "beam").arena; for (let i = 0; i < 60; i++) SA.stepSpaceArena(ref);
        const clamp1 = (v) => Math.max(-1, Math.min(1, v)), closeTo = (a, bb, tol) => a.length === bb.length && a.every((v, i) => Math.abs(v - bb[i]) <= tol);
        const rs = ref.crafts[0], rf = ref.crafts[1], foe1 = SA.nearestFoe(ref, rf), aim1 = SA.fighterAim(ref, rf, foe1), x1 = P6.features(rf.body, aim1.target, aim1.opts), d1 = AP.decide(rf.body, aim1.target, aim1.opts);
        const wantOut1 = [0, 1, 2].map((i) => clamp1(d1.torqueBody[i] / (rf.body.I[i] * P6.TORQUE_GAIN))).concat([d1.thrust > 0 ? 1 : -1, d1.firing ? 1 : -1]);
        const wantHull = [clamp1(rs.body.w[0] / 0.5), clamp1(rs.body.w[1] / 0.5), clamp1(rs.body.w[2] / 0.5), rs.last.thrust / CS.thrustWith(rs.ship, 3), rs.enginesRunning / 3, rs.charge / 12, rs.hp / rs.hpMax];
        ok("!! THE BRAIN WINDOW SHOWS THE PILOT'S OWN NUMBERS: at tick 60 the PD fighter's rows are its twelve features (P6.features of its state against the foe it is flying at, to 1e-5) and its five commands in the network's own scale (the torque over I x 40, thrust and trigger +-1, from autopilot6dof.decide), with NO hidden row (the PD has no network); the ship's hull row is its turn rate over 0.5, thrust over the full, engines over three, the charge over twelve seconds and the hull over 1,500",
            r.rows60.f1.map((q) => q.layer).join() === "features,outputs" && closeTo(r.rows60.f1[0].values, x1, 1e-5) && closeTo(r.rows60.f1[1].values, wantOut1, 1e-5) && r.rows60.ship[0].label === "hull" && closeTo(r.rows60.ship[0].values, wantHull, 1e-9), `features ${closeTo(r.rows60.f1[0].values, x1, 1e-5)}, outputs ${closeTo(r.rows60.f1[1].values, wantOut1, 1e-5)} (${r.rows60.f1[1].values.map((v) => v.toFixed(2))} / ${wantOut1.map((v) => v.toFixed(2))})`);

        // ---- 2 the clock ----
        ok("!! the tick counter advanced by exactly the steps taken (60 ticks is 2 s), and a finished fight does not move: 5 more steps leave the tick where it was", r.s60.tick === 60 && Math.abs(r.s60.t - 2) < 1e-12 && r.end.done === true && r.afterDone === r.end.tick && r.end.tick > 60);

        // ---- 3 the fight the page shows is the fight the module runs ----
        const dflt = BS.fight(1, "beam"), flyEnd = r.endTally;
        ok("!! THE DEFAULT FIGHT IS battleshipFight.fight()'s: the page's beam attack, seed 1, PD fighters, regular gunners, run to its end, has the winner, the ending, the tick count, the fighters shot down and rammed, the damage on the ship, its hit points, parts, engines, seat rounds, waves and charge, and every fighter's status, hit points, rounds, hits and mode of the same fight run here -- to the bit", same(flyEnd, dflt) && flyEnd.over === dflt.over, `page ${line(flyEnd)} / here ${line(dflt)}`);
        ok("the stat line says how it ended and the log says it (a line 'OVER' with the ending and the winner), and the cards say the ship's hit points and the fighters' count", new RegExp(`${flyEnd.winner === "none" ? "no winner" : flyEnd.winner + " win"}`).test(r.endStat) && /OVER/.test(r.endStat) && r.endLog.some((l) => /^OVER/.test(l)) && new RegExp(`hit points ${Math.round(flyEnd.ship.hpLeft)}/1500`).test(r.endCards[0]) && new RegExp(`${flyEnd.killed} shot down`).test(r.endCards[1]), `${r.endStat}`);
        for (const kind of BS.KINDS) {
            const n = BS.fight(2, kind);
            ok(`!! the ${kind} attack, the PD autopilot on every fighter, regular gunners, seed 2, is battleshipFight.fight()'s to the bit in every count it reports`, same(r.kinds[kind], n), `page ${line(r.kinds[kind])} / here ${line(n)}`);
        }
        const o = r.opts, five = BS.fight(3, "swarm", { fighters: 5 }), twelve = BS.fight(3, "swarm", { fighters: 12 }), perfect = BS.fight(3, "beam", { gunners: "perfect" }), green = BS.fight(3, "beam", { gunners: "green" }), ace = BS.fight(3, "beam", { gunners: "ace" });
        ok("!! THE OPTIONS ARE THE FIGHT THAT RUNS: five fighters make six windows and the fight battleshipFight.fight() runs for five, twelve make thirteen windows and its twelve (the card lists twelve), and a number of fighters that is not 1-12 is cut to 12 or raised to 1", same(o.five.tally, five) && o.five.windows === 6 && o.five.cards === 2 && same(o.twelve.tally, twelve) && o.twelve.windows === 13 && o.twelve.row === 12 && o.tooMany[0] === 13 && o.tooMany[1] === 2, `five ${line(o.five.tally)} / ${line(five)}; twelve ${line(o.twelve.tally)}; cuts ${o.tooMany}`);
        ok("!! perfect, ace and green gunners are three different fights and each is its module run's, and the page names the settings battleshipFight.GUNNERS names", same(o.perfect.tally, perfect) && same(o.green.tally, green) && same(o.ace.tally, ace) && !same(o.perfect.tally, o.green.tally) && !same(o.ace.tally, o.green.tally) && !same(o.perfect.tally, o.ace.tally) && ["perfect", "green", "ace"].every((n) => JSON.stringify(o[n].state.gunnerOptions) === JSON.stringify({ ...BS.SHARED, ...BS.GUNNERS[n] })) && JSON.stringify(r.end.gunnerOptions) === JSON.stringify({ ...BS.SHARED, ...BS.GUNNERS.regular }),
            `perfect ${line(o.perfect.tally)}; ace ${line(o.ace.tally)}; green ${line(o.green.tally)}`);
        const hold = BS.fight(1, "bow", { behaviour: "hold", cruise: 0.6 }), holdBase = BS.fight(1, "bow"), noCruise = BS.fight(1, "bow", { cruise: 0 });
        ok("!! THE SHIP'S BEHAVIOUR AND CRUISE ARE WIRED: a bow attack that the ship HOLDS its heading for at 0.6 of its thrust is the module's fight with those options (not the faced fight's), and a cruise of 0 is the module's with cruise 0 -- three different fights, the state naming the behaviour and the cruise", same(o.hold.tally, hold) && same(o.holdBase.tally, holdBase) && same(o.faceCruise.tally, noCruise) && !same(o.hold.tally, o.holdBase.tally) && !same(o.faceCruise.tally, o.holdBase.tally) && o.hold.state.behaviour === "hold" && o.hold.state.cruise === 0.6 && o.faceCruise.state.cruise === 0 && o.holdBase.state.behaviour === "face" && o.holdBase.state.cruise === 0.3,
            `hold ${line(o.hold.tally)} / ${line(hold)}; face ${line(o.holdBase.tally)}; cruise 0 ${line(o.faceCruise.tally)}`);
        const pilotRuns = { shipped: BS.fight(1, "swarm", { gunners: "green", pilot: SHIPPED }), league: BS.fight(2, "swarm", { pilot: LEAGUE }), close: BS.fight(2, "swarm", { pilot: CLOSE }), hand: BS.fight(2, "bow", { pilot: HAND }), mix: BS.fight(2, "swarm", { pilot: MIX }) }, pdSwarm2 = BS.fight(2, "swarm");
        ok("!! A DIFFERENT PILOT FOR THE FIGHTERS IS A DIFFERENT FIGHT: the shipped pilot (against green gunners in a swarm), the league pilot, the close-quarters pilot, the network twin of the PD (hand weights) and a mix of the PD, the shipped, the league and the close pilot in turn each fly the fight battleshipFight.fight() runs for that pilot, to the bit -- and the league, close and mix fights are not the PD autopilot's on the same seed",
            ["shipped", "league", "close", "hand", "mix"].every((id) => same(o[id].tally, pilotRuns[id])) && ["league", "close", "mix"].every((id) => !same(o[id].tally, pdSwarm2)) && same(o.pdBeside.tally, pdSwarm2), ["shipped", "league", "close", "hand", "mix"].map((id) => `${id}: ${line(o[id].tally)}`).join("; "));
        ok("!! the pilot's label says which pilot flew, with the hash of the weights file it was loaded from and its held-out score (the shipped pilot's 9.934), and a mix names its four", /6DOF pilot, shipped/.test(o.shipped.state.pilots.label) && o.shipped.state.pilots.label.includes(weightsHash(shipImp.weights)) && /held-out 9\.934/.test(o.shipped.state.pilots.label) && o.mix.state.pilots.list.map((p) => p.id).join() === "pd,shipped,league,close" && /mix/.test(o.mix.state.pilots.label), o.shipped.state.pilots.label);

        // ---- 3b the controls ----
        const ui = r.ui, uiWant = BS.fight(3, "stern", { fighters: 6, gunners: "green", pilot: MIX, behaviour: "hold", cruise: 0.5 });
        ok("!! EVERY CONTROL IS THE FIGHT THAT RUNS: with the attack set to stern, the seed to 3, six fighters, green gunners, a mix of pilots, the ship holding its heading at 0.5 cruise -- all set on the page's own controls, then the New fight button pressed -- the fight that runs is battleshipFight.fight()'s with those options, to the bit, with the controls reading what was set",
            same(ui.tally, uiWant) && ui.sel.join() === "stern,3,6,green,mix,hold,0.5" && ui.state.pilots.id === "mix" && ui.state.crafts.length === 7 && ui.state.behaviour === "hold" && ui.state.cruise === 0.5, `page ${line(ui.tally)} / here ${line(uiWant)}`);
        const ch = r.change;
        ok("!! A CHANGE TO ANY CONTROL STARTS THE FIGHT AGAIN from tick 0 with what the controls say: the gunners' skill, the attack, the seed, the number of fighters, the ship's behaviour, its cruise and the fighters' pilot each, on its own change event, restart the fight with that setting taken",
            Object.values(ch).every((c) => c.tick === 0) && JSON.stringify(ch.gunners.gunners) === JSON.stringify({ ...BS.SHARED, ...BS.GUNNERS.green }) && ch.kind.kind === "stern" && ch.seed.seed === 7 && ch.nfight.crafts === 6 && ch.behaviour.behaviour === "hold" && ch.cruise.cruise === 0.6 && ch.pilotF.pilot === "shipped", JSON.stringify(Object.fromEntries(Object.entries(ch).map(([k, c]) => [k, [c.tick, c.crafts, c.kind, c.seed, c.pilot, c.behaviour, c.cruise]]))));

        // ---- 4 the windows ----
        const L = r.layout;
        ok("!! A WINDOW'S BOX DOES NOT PAINT OVER ITS PICTURE: the pictures are drawn into the page's one WebGL canvas, BEHIND the boxes, so a box with a background of its own hides its picture -- every window box is transparent", r.windowBg.length === 9 && r.windowBg.every((bg) => /^(rgba\(0, 0, 0, 0\)|transparent)$/.test(bg)), r.windowBg.join(" | "));
        ok("!! THE WINDOWS ARE STACKED DOWN THE RIGHT: the same left edge, the same width (262), each below the one before with a gap, the right edge inside the page, the ship's window the tallest, and every one fits the page (1250 px)", L.length === 9 && L.every((q) => q.x === L[0].x && q.width === 262 && q.width > q.height * 1.2 || (q.width === 262 && q.height > 140)) && L.every((q, i) => i === 0 || q.y >= L[i - 1].y + L[i - 1].height) && L[0].x + L[0].width <= 1100 && L[0].x > 700 && L[8].y + L[8].height <= 1250 && L[0].height > Math.max(...L.slice(1).map((q) => q.height)), JSON.stringify(L.map((q) => [q.x, q.y, q.width, q.height])));
        const seqOf = (s) => s.map((x) => x[0]), want = ["plane", "pilot", ...Array.from({ length: 13 }, (_, k) => "gunner" + k), "brain", "plane", "pilot"];
        ok("!! A CLICK ON THE SHIP'S WINDOW GOES PLANE, PILOT, SEAT 1 TO SEAT 13, BRAIN and round to the plane again -- one click each, eighteen views in seventeen clicks -- while the eight fighters' windows stay on the plane", JSON.stringify(seqOf(r.seq)) === JSON.stringify(want) && r.seq.every((s) => s.slice(1).every((v) => v === "plane")), JSON.stringify(seqOf(r.seq)));
        ok("!! each seat's window says WHICH seat it is, by name: 'gun seat 1 of 13: main turret A' to 'gun seat 13 of 13: dorsal PD 2'; the brain's label says it shows the gunners' too", seatsOf.every((s, k) => r.seqLabels[2 + k].includes(`gun seat ${k + 1} of 13: ${s.name}`)) && /the gunners'/.test(r.seqLabels[15]) && /main turret A/.test(r.seqLabels[2]) && /dorsal PD 2/.test(r.seqLabels[14]), r.seqLabels.slice(2, 4).join(" | ").slice(0, 200));
        ok("!! A FIGHTER'S WINDOW GOES PLANE, PILOT, GUNNER, BRAIN and round again (four views), without touching the ship's window", JSON.stringify(r.fighterSeq.map((s) => s[1])) === JSON.stringify(["plane", "pilot", "gunner0", "brain", "plane", "pilot"]) && r.fighterSeq.every((s) => s[0] === "plane"), JSON.stringify(r.fighterSeq.map((s) => s[1])));
        ok("!! THE VIEWS SURVIVE A NEW FIGHT, seat and all: the ship on seat 10, a fighter on the brain, stay so when another fight starts; with only two fighters (three windows) the first three are kept, and the seat is kept inside the thirteen", JSON.stringify(r.kept[0].map((w) => w[0])) === JSON.stringify(["gunner", "plane", "brain", ...Array(6).fill("plane")]) && r.kept[0][0][1] === 9 && JSON.stringify(r.keptTwo[0].map((w) => w[0])) === JSON.stringify(["gunner", "plane", "brain"]) && r.keptTwo[0][0][1] === 9, JSON.stringify(r.kept) + " " + JSON.stringify(r.keptTwo));

        // ---- 5 the pictures ----
        const P = r.pix, pc = r.pictures;
        ok("!! BY TICK 90 EVERY GUNNER HAS CHOSEN A TARGET (a main turret has one, and a point-defence seat is firing at a target that is NOT the ship's nearest foe), so the sights can be read", pc.mainSeat >= 0 && pc.firing >= 0 && pc.tick === 90, JSON.stringify(pc));
        ok("!! A SEAT THAT IS FIRING AT A TARGET draws the gun's sight in its window: the bore cross, the pipper (a cyan ring), the lead pip (an orange diamond) and 'FIRE' in red; the pilot's view of the same ship has no pipper and no lead pip", P.seat && P.seat.cross > 8 && P.seat.pipper > 15 && P.seat.lead > 15 && P.seat.fire > 8 && P.pilot.pipper < 10 && P.pilot.lead < 10 && P.pilot.fire === 0, `seat ${pc.firing}: cross ${P.seat && P.seat.cross}, pipper ${P.seat && P.seat.pipper}, lead ${P.seat && P.seat.lead}, fire ${P.seat && P.seat.fire}`);
        const gdist = (a, b2) => P[a].gl.grid.reduce((t, v, i) => t + Math.abs(v - P[b2].gl.grid[i]), 0);
        ok("!! THE CAMERA VIEWS ARE PICTURES OF A WORLD, and different ones: the pixels under the ship's window in the plane, pilot and two gun seats' views each hold more than a few colours, no two are the same picture (their 8 x 8 brightness maps are more than 2 apart in all), and a fighter's plane view and pilot view are pictures too", ["plane", "pilot", "seat", "main", "fighterPlane", "fighterPilot"].every((v) => P[v] && P[v].gl.distinct >= 5 && P[v].gl.w > 200 && P[v].gl.h > 80) && [["plane", "pilot"], ["plane", "seat"], ["pilot", "seat"], ["seat", "main"], ["plane", "main"], ["pilot", "main"], ["fighterPlane", "fighterPilot"]].every(([x, y]) => gdist(x, y) > 2),
            ["plane", "pilot", "seat", "main", "fighterPlane", "fighterPilot"].map((v) => `${v}: ${P[v].gl.distinct} colours`).join(" | ") + " | distances " + [["plane", "pilot"], ["plane", "seat"], ["pilot", "seat"], ["seat", "main"], ["plane", "main"], ["pilot", "main"], ["fighterPlane", "fighterPilot"]].map(([x, y]) => gdist(x, y).toFixed(1)).join(" "));
        ok("!! THE BRAIN VIEW IS NOT A CAMERA: the picture under it is the flat dark fill (one colour or two), and the overlay is bars -- the ship's (the hull row, and a ROW OF SIX PER SEAT, thirteen seats) by the thousand, the PD fighter's (its twelve features and five commands) too, and a tenth of that or less in the camera views", P.brain.gl.distinct <= 2 && P.brain.gl.mean.every((m) => m < 20) && P.brain.bars > 2000 && P.fightBrain.bars > 400 && ["plane", "pilot", "seat"].every((v) => P[v].bars * 8 < P.brain.bars), `ship ${P.brain.bars}, fighter ${P.fightBrain.bars}; camera views ${["plane", "pilot", "seat"].map((v) => P[v].bars)}`);
        const rb = r.brainRowsShip, rf1 = r.brainRowsFighter;
        ok("!! THE SHIP'S BRAIN WINDOW HAS THE GUNNERS: its rows are the hull's (seven numbers) then one row of six per seat labelled s1 aim to s13 aim, with the six numbers in [-1, 1] and the trigger and target at +1 or -1; a PD fighter's has its features (12) and commands (5), no seat rows", rb.map((q) => q.label).join() === "hull," + Array.from({ length: 13 }, (_, k) => `s${k + 1} aim`).join() && rb[0].n === 7 && rb.slice(1).every((q) => q.n === 6 && q.values.every((v) => v >= -1 && v <= 1) && Math.abs(q.values[4]) === 1 && Math.abs(q.values[5]) === 1) && rf1.map((q) => q.layer).join() === "features,outputs" && rf1[0].n === 12 && rf1[1].n === 5);
        ok("THE FIRING SEAT'S ROW IS LIVE: the seat that was firing has its trigger at +1 and a target at +1 in its row, and some seat's row says -1 for its target (a seat with nothing in its arc)", pc.firing >= 0 && rb[1 + pc.firing] && rb[1 + pc.firing].values[4] === 1 && rb[1 + pc.firing].values[5] === 1 && rb.slice(1).some((q) => q.values[4] === -1), rb.slice(1).map((q) => `${q.values[4]}/${q.values[5]}`).join(" "));
        ok("a fighter's window in the gunner's view is the fixed gun's sight: the bore cross is drawn and the pipper or the lead pip is on it", P.fightGunner.cross > 8 && (P.fightGunner.pipper > 15 || P.fightGunner.lead > 15), `${P.fightGunner.cross} cross, ${P.fightGunner.pipper} pipper, ${P.fightGunner.lead} lead`);
        // the sights, against the same fight run here to the same tick: the gunner's own target, the bore, the pipper and the lead pip, to half a pixel, IN VACUUM
        const ref2 = BS.build(1, "beam").arena; for (let i = 0; i < pc.tick; i++) SA.stepSpaceArena(ref2);
        const rc0 = ref2.crafts[0], px = (a, b2) => a && b2 && Math.hypot(a[0] - b2[0], a[1] - b2[1]) < 0.5;
        const seatSight = (k, picture, gravity) => { const st = rc0.seats[k], foe = ref2.crafts.find((o2) => o2.id === st.last.target), mz = GS.muzzleOfSeat(st.seat, st.state, rc0.body), W = Math.round(picture.rect.width), H = Math.round(picture.rect.height); return V.gunsight(V.seatCamera(rc0.body, mz), mz, { pos: foe.body.pos, vel: foe.body.vel }, W, H, st.seat.gun, gravity); };
        if (pc.firing >= 0) {
            const sg = P.seat.sight, exp = seatSight(pc.firing, P.seat, 0), st = rc0.seats[pc.firing];
            ok("!! A SEAT'S SIGHT IS THE GUNNER'S: the sight is drawn for the target THAT GUNNER chose (the id, the range to 1e-6) and not the ship's nearest foe, and the bore cross, the pipper and the lead pip are where gunSeats.muzzleOfSeat and flightViews.gunsight put them for that target, to half a pixel; and the window says 'FIRE' and the seat's yaw, pitch and rounds",
                rc0.last.foe !== st.last.target && sg && sg.foe === st.last.target && Math.abs(sg.range - exp.range) < 1e-6 && px(sg.bore, exp.bore) && px(sg.pipper, exp.pipper) && px(sg.lead, exp.lead) && P.seat.texts.includes("FIRE") && P.seat.texts.some((t) => /^yaw -?\d+°  pitch -?\d+°  rounds \d+$/.test(t)), `target ${sg && sg.foe} (the ship's foe ${rc0.last.foe}), range ${sg && sg.range && sg.range.toFixed(2)} / ${exp.range.toFixed(2)}`);
        } else ok("a point-defence seat was found firing at a target that is not the ship's nearest foe", false);
        if (pc.mainSeat >= 0) {
            const sg = P.main.sight, exp = seatSight(pc.mainSeat, P.main, 0), earth = seatSight(pc.mainSeat, P.main, 9.80665);
            ok("!! THE SIGHTS ARE DRAWN FOR VACUUM: a MAIN turret's sight (a slow, 500 unit-a-second shell, a long flight) has its pipper and lead pip where gunsight puts them with GRAVITY 0, to half a pixel -- and the same sight with the Earth's gravity would put the pipper more than 1.5 pixels elsewhere, so the row can tell (the shells of a ship in space do not fall)",
                sg && px(sg.bore, exp.bore) && px(sg.pipper, exp.pipper) && px(sg.lead, exp.lead) && Math.hypot(earth.pipper[0] - exp.pipper[0], earth.pipper[1] - exp.pipper[1]) > 1.5 && Math.abs(earth.tof - exp.tof) > 1e-3, `pipper page ${sg && sg.pipper && sg.pipper.map((v) => v.toFixed(1))} / vacuum ${exp.pipper && exp.pipper.map((v) => v.toFixed(1))} / Earth ${earth.pipper && earth.pipper.map((v) => v.toFixed(1))}`);
        } else ok("a main turret had a target by tick 90", false);
        {
            const f1 = ref2.crafts[1], foe1b = ref2.crafts.find((o2) => o2.id === f1.last.foe), sg = P.fightGunner.sight, W = Math.round(P.fightGunner.rect.width), H = Math.round(P.fightGunner.rect.height);
            const mz = { pos: [0, 1, 2].map((a) => f1.body.pos[a] + RB.rotateByQuat(f1.body.q, SA.FIGHTER.muzzle)[a]), vel: f1.body.vel.slice(), dir: RB.rotateByQuat(f1.body.q, [1, 0, 0]) };
            const exp = V.gunsight(V.seatCamera(f1.body, mz), mz, { pos: foe1b.body.pos, vel: foe1b.body.vel }, W, H, SA.FIGHTER_GUN, 0);
            ok("!! A FIGHTER'S SIGHT IS ITS GUN'S: the fixed gun along the nose, 1.4 units ahead of the centre (spaceArena.FIGHTER's muzzle), a 900 unit-a-second round, the foe it is flying at, in vacuum -- the bore, the pipper and the lead pip where flightViews.gunsight puts them, to half a pixel", sg && sg.foe === foe1b.id && px(sg.bore, exp.bore) && px(sg.pipper, exp.pipper) && px(sg.lead, exp.lead) && Math.abs(sg.range - exp.range) < 1e-6, `range ${sg && sg.range && sg.range.toFixed(2)} / ${exp.range.toFixed(2)}`);
        }
        // the cameras: the page's chosen draw specs, against flightViews' own functions
        {
            const f1 = ref2.crafts[1], near = (a, b2, tol = 1e-9) => a.every((v, i) => Math.abs(v - b2[i]) <= tol), same3 = (c, e) => c && near(c.eye, e.eye) && near(c.target, e.target) && near(c.up, e.up) && Math.abs(c.fov - e.fov) < 1e-12;
            const drawS = { ...V.VIEW_DRAW, chaseBack: 74, chaseUp: 24, chaseAhead: 12, seat: [-2, 0, 10.4], sightAhead: 800, fovPilot: 1.25 }, drawF = { ...V.VIEW_DRAW, chaseBack: 10, chaseUp: 3.2, chaseAhead: 4, seat: [0.9, 0, 0.35], sightAhead: 500, fovPilot: 1.25 };
            const st = rc0.seats[pc.firing >= 0 ? pc.firing : 0], mzS = GS.muzzleOfSeat(st.seat, st.state, rc0.body);
            ok("!! THE PAGE'S CAMERAS ARE flightViews' WITH ITS CHOSEN DRAW SPECS: the ship's plane view is the chase camera 74 units behind and 24 above, looking 12 ahead; its pilot's view is the BRIDGE (2 units aft of the centre, 10.4 above, looking 800 along the nose, 1.25 rad across); a fighter's plane view is 10 behind and 3.2 above, looking 4 ahead, its pilot's the cockpit 0.9 ahead and 0.35 above; and a seat's view is seatCamera at that seat's muzzle looking 800 along the gun -- eye, target, up and field of view, to 1e-9",
                same3(P.plane.cam, V.planeCamera(rc0.body, { draw: drawS })) && same3(P.pilot.cam, V.pilotCamera(rc0.body, { draw: drawS })) && same3(P.fighterPlane.cam, V.planeCamera(f1.body, { draw: drawF })) && same3(P.fighterPilot.cam, V.pilotCamera(f1.body, { draw: drawF })) && same3(P.seat.cam, V.seatCamera(rc0.body, mzS, { draw: drawS })) && P.brain.cam === null, JSON.stringify(P.plane.cam && P.plane.cam.eye.map((v) => +v.toFixed(2))));
            const refT = BS.build(1, "beam").arena; for (let i = 0; i < 420; i++) SA.stepSpaceArena(refT);
            const tr = r.tracers.map((q) => { while (refT.i < q.tick) SA.stepSpaceArena(refT); return { got: q.counts, want: { pd: refT.rounds.filter((x) => x.team === 1 && x.dmg <= 30).length, main: refT.rounds.filter((x) => x.team === 1 && x.dmg > 30).length, fighter: refT.rounds.filter((x) => x.team === 2).length } }; });
            ok("!! THE ROUNDS ARE DRAWN IN THE COLOURS OF WHO FIRED THEM: sampled every five ticks from 425 to 480 of a beam attack, the page draws as many point-defence streaks (cyan), main-shell streaks (red) and fighter streaks (yellow) as the same fight run here has rounds of each kind in flight (the ship's 10-damage rounds, its 60-damage shells, the fighters' 18-damage rounds), and in some sample there are all three kinds at once", tr.length === 12 && tr.every((q) => q.got.pd === q.want.pd && q.got.main === q.want.main && q.got.fighter === q.want.fighter) && tr.some((q) => q.want.pd > 0 && q.want.main > 0 && q.want.fighter > 0), JSON.stringify(tr.slice(0, 3)));
        }
        ok("!! A FIGHTER'S ENGINE GLOWS WHILE IT THRUSTS: sampled every three ticks from tick 403 to 520 of a beam attack, the glow of each fighter is lit exactly when its last thrust command was positive (the autopilot cuts it to strafe), and over the samples some fighter's glow is lit and some fighter's is dark at the same moment", r.glow.samples.length === 40 && r.glow.samples.every((s) => s.shown.length === 8 && s.shown.every((g, i) => g === s.thrust[i])) && r.glow.samples.some((s) => s.shown.some((g) => g) && s.shown.some((g) => !g)), `${r.glow.samples.filter((s) => s.shown.some((g) => g) && s.shown.some((g) => !g)).length} of 40 samples with both; lit at the last: ${JSON.stringify(r.glow.samples[39].shown)}`);
        // the turrets
        const rotY = (q, v) => { const [x, y, z, w] = q, t = [2 * (y * v[2] - z * v[1]), 2 * (z * v[0] - x * v[2]), 2 * (x * v[1] - y * v[0])]; return [v[0] + w * t[0] + (y * t[2] - z * t[1]), v[1] + w * t[1] + (z * t[0] - x * t[2]), v[2] + w * t[2] + (x * t[1] - y * t[0])]; };
        const tur = r.turrets.map((t, k) => { const d = GS.dirAt(seatsOf[k], t.yaw, t.pitch), g = rotY(t.q, [0, 1, 0]); return Math.hypot(d[0] - g[0], d[1] - g[1], d[2] - g[2]); });
        ok("!! THE TURRETS THE SCENE DRAWS POINT WHERE THE SEATS POINT: each barrel group's rotation, applied to its barrel's own axis, is gunSeats.dirAt(seat, yaw, pitch) to 1e-6 for all thirteen seats -- at tick 90, with at least four seats slewed away from rest", tur.length === 13 && tur.every((e) => e < 1e-6) && r.turrets.filter((t) => Math.abs(t.yaw) > 0.1 || Math.abs(t.pitch) > 0.1).length >= 4, `${tur.map((e) => e.toExponential(0)).join(" ")}; yaw ${r.turrets.map((t) => t.yaw.toFixed(1)).join(" ")}`);

        // the brain rows of a mix
        {
            const refM = BS.build(2, "swarm", { fighters: 5, pilot: MIX }).arena; for (let i = 0; i < 75; i++) SA.stepSpaceArena(refM);
            const weightsFor = [null, WS, WL, WC, null], rowsWant = [1, 2, 3, 4, 5].map((i) => { const c = refM.crafts[i], foe = SA.nearestFoe(refM, c), aim = SA.fighterAim(refM, c, foe), x = P6.features(c.body, aim.target, aim.opts), w = weightsFor[i - 1]; return { x, y: w ? P6.forward(w, x) : null, hidden: w ? V.pilotActivations(P6, w, x).hidden : null, pd: w ? null : AP.decide(c.body, aim.target, aim.opts) }; });
            const okRows = r.mixRows.every((rows, k) => { const w = rowsWant[k], isNet = weightsFor[k] !== null; return rows[0].layer === "features" && closeTo(rows[0].values, w.x, 1e-5) && (isNet ? rows.length === 3 && rows[1].layer === "hidden" && rows[1].n === 34 && closeTo(rows[1].values, Array.from(w.hidden), 1e-4) && rows[2].layer === "outputs" && closeTo(rows[2].values, w.y, 1e-5) : rows.length === 2 && rows[1].layer === "outputs" && rows[1].n === 5); });
            ok("!! IN A MIX EACH FIGHTER'S BRAIN WINDOW IS ITS OWN PILOT'S: at tick 75 fighters 1 and 5 are the PD autopilot (features and commands, no hidden row), 2 the shipped network, 3 the league network and 4 the close-quarters network (features, 34 hidden activations, five outputs: P6.forward of its own weights on its own features, to 1e-5) -- five different brains in five windows", okRows && r.mixState.pilots.list.map((p) => p.id).join() === "pd,shipped,league,close", `${r.mixRows.map((rows) => rows.map((q) => q.layer + q.n).join("/")).join(" | ")}`);
        }

        // the PD fighters' brain rows LATE in the fight, when they thrust and strafe, turn and fire: every fighter's five commands against the same fight run here
        {
            const lateRows = r.late.rows, refL = BS.build(1, "beam").arena; for (let i = 0; i < r.late.tick; i++) SA.stepSpaceArena(refL);
            const want = [1, 2, 3, 4, 5, 6, 7, 8].map((i) => { const c = refL.crafts[i], foe = SA.nearestFoe(refL, c), aim = SA.fighterAim(refL, c, foe), d = AP.decide(c.body, aim.target, aim.opts); return { x: P6.features(c.body, aim.target, aim.opts), y: [0, 1, 2].map((a) => clamp1(d.torqueBody[a] / (c.body.I[a] * P6.TORQUE_GAIN))).concat([d.thrust > 0 ? 1 : -1, d.firing ? 1 : -1]) }; });
            ok("!! THE PD FIGHTERS' ROWS ARE THEIR OWN AT TICK 480 TOO, when the fight is under way: all eight fighters' twelve features and five commands (the torque about each axis over I x 40, the thrust at +1 or -1, the trigger at +1 or -1) are the module's to 1e-5 -- and in this fight some fighter has its thrust CUT (-1: it is strafing), some its engine on, some its trigger pulled, and the pitch and yaw torques are not zero (a row of zeros would pass anything; the PD's are small here, 0.01 and 0.04 of the network's full scale, and the row holds them to 1e-5)",
                lateRows.every((rows, k) => rows.length === 2 && closeTo(rows[0].values, want[k].x, 1e-5) && closeTo(rows[1].values, want[k].y, 1e-5)) && want.some((q) => q.y[3] === -1) && want.some((q) => q.y[3] === 1) && want.some((q) => q.y[4] === 1) && want.some((q) => Math.abs(q.y[1]) > 0.005) && want.some((q) => Math.abs(q.y[2]) > 0.02), want.map((q) => q.y.map((v) => v.toFixed(2)).join("/")).join(" "));
        }

        // ---- 6 the parts ----
        const pb0 = r.partsBefore, e1 = r.engAfter, sa = r.seatsAfter;
        ok("!! AN ENGINE POD SHOT TO NOTHING GOES DARK: before, three pods running with every nozzle glowing and every seat alive; after six rounds dropped on pod 2, two running, THAT pod is the dead material and its glow off while the other two are as they were, the card says '2 of 3' with one hollow circle, and the log says 'engine pod 2 OUT — 2 of 3 engine pods running'",
            pb0.running === 3 && pb0.engines.every((e) => !e.out) && pb0.seats.every((s) => !s.dead) && e1.running === 2 && e1.engines.map((e) => e.out).join() === "false,true,false" && e1.engines[1].glow === false && e1.engines.filter((e, i) => i !== 1).every((e) => e.glow !== undefined) && /engines ● ○ ● 2 of 3/.test(e1.card) && e1.log.some((l) => /engine pod 2 OUT — 2 of 3 engine pods running/.test(l)) && e1.hp < 1500, `${e1.engines.map((e) => e.out)}, ${e1.card.slice(0, 120)}`);
        ok("!! ...and the log names the PART the first hit reached ('hit the battleship — engine pod 2'), and the hit spheres are shown on request: all 22 hidden by default, all 22 shown with the box checked, hidden again when it is unchecked", e1.log.some((l) => /hit the battleship — engine pod 2/.test(l)) && r.spheresOn.length === 22 && r.spheresOn.every((v) => v === true) && r.spheresOff.every((v) => v === false));
        const portSeat = seatsOf.findIndex((s) => s.name === "port PD 1"), mainSeat0 = seatsOf.findIndex((s) => s.name === "main turret A");
        ok("!! A MOUNT AND A TURRET SHOT TO NOTHING GO DARK AND ARE OUT: after four rounds on port PD 1 and seven on main turret A the seats for THOSE parts (and no other) are drawn dead, are not working (the arena's own seatWorks), the card lists both parts out, the log says 'port PD 1 OUT' and 'main turret A OUT', and the seat's window says 'SEAT OUT' while a seat that works says nothing",
            sa.shown.map((s, k) => s.dead === (k === portSeat || k === mainSeat0)).every(Boolean) && sa.works.map((w, k) => w === !(k === portSeat || k === mainSeat0)).every(Boolean) && sa.partsOut.slice().sort().join() === "engine pod 2,main turret A,port PD 1" && /parts out: .*port PD 1/.test(sa.card) && /parts out: .*main turret A/.test(sa.card) && sa.log.some((l) => /port PD 1 OUT/.test(l)) && sa.log.some((l) => /main turret A OUT/.test(l)) && r.pdOutTexts.includes("SEAT OUT") && r.mainOutTexts.includes("SEAT OUT") && !r.pdWorksTexts.includes("SEAT OUT"), `${sa.partsOut}; ${sa.card.split("\n").slice(-1)[0].slice(0, 120)}`);

        // ---- 7 the wave-motion cannon ----
        const cn = r.cannon, cannonRef = BS.fight(3, "swarm", { gunners: "green" });
        ok("!! THE WAVE-MOTION CANNON IS DRAWN: its charge sphere starts small and grows as the cannon charges (the card says the percentage), a beam is drawn the tick it fires and is gone within a second, the log says it fired and how many craft were in it, the charge starts again from 0 -- in the pinned fight where it fires exactly once (green gunners, a swarm, seed 3)",
            cn.firedAt !== null && cannonRef.ship.waves === 1 && cn.start.beam === false && cn.mid.charge > cn.start.charge * 3 && /[1-9]\d?% charged/.test(cn.midCard) && cn.afterFire.beam === true && cn.later.beam === false && cn.afterFire.charge < cn.mid.charge && cn.log.length === 1 && /WAVE-MOTION CANNON fires — \d+ craft in the beam \(400 each\)/.test(cn.log[0]) && cn.charge < 0.1 && /fired 1/.test(cn.cardAfter), `fired at tick ${cn.firedAt}; charge scale ${cn.start.charge.toFixed(2)} -> ${cn.mid.charge.toFixed(2)} -> ${cn.afterFire.charge.toFixed(2)}; ${cn.log[0]}`);

        // ---- 8 the markers, the dead ----
        const me = r.markersEarly, ml = r.markersLate;
        ok("!! THE MARKERS FOLLOW THE CRAFT AND GO GREY WHEN A CRAFT IS LOST: at tick 30 all nine are in the craft's colours; at tick 500 of a beam attack by perfect gunners every fighter that is no longer flying has a grey marker at the craft's position and the ones still flying are orange; the markers are visible after a frame (they are hidden only while the windows are drawn)", me.m.color.slice(3).every((v, i) => (i % 3 === 0 ? v > 0.9 : true)) && (() => { const lost = ml.state.crafts.map((c, i) => [c, i]).filter(([c]) => c.status !== "flying"); const live = ml.state.crafts.map((c, i) => [c, i]).filter(([c]) => c.status === "flying"); const m = ml.m; return lost.length >= 1 && live.length >= 1 && lost.every(([c, i]) => Math.abs(m.color[i * 3] - 0.3) < 1e-6 && Math.abs(m.color[i * 3 + 1] - 0.3) < 1e-6 && Math.abs(m.pos[i * 3] - c.pos[0]) < 1e-3) && live.every(([c, i]) => (i === 0 ? m.color[i * 3] < 0.4 : m.color[i * 3] > 0.9)); })() && ml.m.visible === true, `${ml.state.crafts.map((c) => c.status[0]).join("")}`);
        ok("the log and the cards say what happened: the kills ('fighter k DESTROYED'), and the fighters' card shows a hollow circle and the status for a craft that is gone", ml.log.some((l) => /fighter \d DESTROYED/.test(l)) && /○ fighter \d +0 hp +destroyed/.test(ml.cards[1]) && /● fighter \d/.test(me.cards[1]) && !/○ fighter/.test(me.cards[1]), ml.log.slice(0, 3).join(" | "));

        // ---- 9 failure paths ----
        const F = r.fail;
        ok("!! A PILOT FILE THAT WILL NOT LOAD IS SAID AND THE PILOT THE PAGE HOLDS IS KEPT: a file that is not there gives 'HTTP 404', a flight pilot's file offered as the 6DOF pilot's is refused by name, neither takes the pilot away, and loading the good file again clears the error",
            F.missing === false && /HTTP 404/.test(F.missingErr) && F.stillLoaded === true && F.wrong === false && /pilotFlightPolicy/.test(F.wrongErr) && /pilot6dofPolicy/.test(F.wrongErr) && F.stillLoaded2 === true && F.good === true && F.goodErr === null, `${F.missingErr} | ${(F.wrongErr || "").slice(0, 100)}`);
        ok("!! a pilot whose file is not here is NOT OFFERED (disabled in the roster), a fight that asks for it anyway is flown by the PD autopilot with the label saying why, and a MIX leaves it out of its list until it is loaded again", F.choices.find((c) => c.id === "league").disabled === true && F.choices.find((c) => c.id === "mix").disabled === false && F.fallbackId === "pd" && /PD autopilot/.test(F.fallback) && /not loaded|could not/.test(F.fallback) && F.mixList.join() === "pd,shipped,close" && F.mixListAfter.join() === "pd,shipped,league,close", `${F.fallback} | ${F.mixList} -> ${F.mixListAfter}`);

        // ---- 9b a ram ----
        {
            const rm = r.ram;
            ok("!! A FIGHTER THAT TOUCHES THE HULL IS LOST AND THE SHIP TAKES THE RAM: one put on the ship's forward hull is 'rammed' on the next tick (not 'destroyed'), the ship loses 25 (1,475 of 1,500), the log says 'fighter 1 rammed the hull (-25)', the stat line counts it among the fighters down (1 of 8), the card says '1 rammed' with a hollow circle and the status for it, and its marker goes grey", r.ramBefore.hook === true && /0 of 8 fighters down/.test(r.ramBefore.stat) && rm.status === "rammed" && rm.tally.rammed === 1 && rm.tally.killed === 0 && rm.tally.flying === 7 && rm.hp === 1475 && rm.log.some((l) => /fighter 1 rammed the hull \(-25\)/.test(l)) && /1 of 8 fighters down/.test(rm.stat) && /7 flying, 0 shot down, 1 rammed/.test(rm.cards[1]) && /○ fighter 1 +\d+ hp +rammed/.test(rm.cards[1]) && /hit points 1475\/1500/.test(rm.cards[0]) && rm.markerGrey.every((v) => Math.abs(v - 0.3) < 1e-6), `${rm.stat} | ${rm.log.slice(-1)[0]}`);
        }

        // ---- 10 the big picture, the pause ----
        const inFrame = (ndc) => ndc.length === 9 && ndc.every(([x, y, z]) => Math.abs(x) <= 1.02 && Math.abs(y) <= 1.02 && z > 0 && z < 1);
        const inFrameN = (ndc, n) => ndc.length === n && ndc.every(([x, y, z]) => Math.abs(x) <= 1.02 && Math.abs(y) <= 1.02 && z > 0 && z < 1);
        ok("!! THE OVERVIEW KEEPS EVERY CRAFT IN FRAME: after 10 s and after 20 s of a stern attack, the ship and all eight fighters are inside the big picture (normalised coordinates within 1.02, in front of the camera) -- and so are the ship and twelve fighters of a SWARM, which come from every side, at the start and four seconds in", inFrame(r.mainNdc) && inFrame(r.mainNdc2) && inFrameN(r.mainNdc3, 13) && inFrameN(r.mainNdc4, 13), JSON.stringify(r.mainNdc.map((v) => v.map((q) => +q.toFixed(2)))));
        const dist = (cam, p) => Math.hypot(cam.look[0] - p[0], cam.look[1] - p[1], cam.look[2] - p[2]);
        ok("!! THE CAMERA MODES GO WHERE THEY SAY: 'chase battleship' looks at a point within 30 units of the ship and sits within 100 units of it (the page's draw spec), 'chase fighter 1' looks within 15 units of the first fighter and sits within 25 of it", dist(r.chase0.cam, r.chase0.state.crafts[0].pos) < 30 && Math.hypot(...r.chase0.cam.pos.map((v, i) => v - r.chase0.state.crafts[0].pos[i])) < 100 && dist(r.chase1.cam, r.chase1.state.crafts[1].pos) < 15 && Math.hypot(...r.chase1.cam.pos.map((v, i) => v - r.chase1.state.crafts[1].pos[i])) < 25, `${dist(r.chase0.cam, r.chase0.state.crafts[0].pos).toFixed(1)}, ${dist(r.chase1.cam, r.chase1.state.crafts[1].pos).toFixed(1)}`);
        ok("the pause button toggles: playing, then paused with the button saying Play, then playing again", r.pause[0] === false && r.pause[2] === true && /Play/.test(r.pause[3]) && r.pause[4] === false && /Pause/.test(r.pause[5]), JSON.stringify(r.pause));

        // ---- 11 the stack scrolls ----
        const sc = r.scroll;
        ok("!! THE STACK SCROLLS WHEN THE CRAFT DO NOT FIT: on a page 560 px tall the nine windows are taller than the stack (it scrolls -- its overflow is auto -- and is no taller than the page), the windows past its bottom are not drawn (no scissor), and every window that is drawn is cut to the stack: its scissor lies inside the stack's rectangle",
            sc.scrollable === true && /^(auto|scroll)$/.test(sc.overflowY) && sc.stack.height <= sc.innerHeight - 12 + 1 && sc.scissors.length === 9 && sc.scissors[8] === null && sc.scissors[0] !== null && sc.scissors.every((s) => s === null || (s.height > 0 && s.width > 0)) && sc.scissors.filter((s) => s !== null).length < 9 && sc.rects.every((q, i) => sc.scissors[i] === null || sc.scissors[i].height <= q.height + 1e-6), `${sc.scissors.filter((s) => s !== null).length} of 9 drawn; stack ${Math.round(sc.stack.height)} px of ${sc.innerHeight}`);
        ok("!! ...and reading a window that is scrolled out of the stack brings it into view (the last window's pixels are read after the stack scrolls to it: it is drawn then, and the stack has scrolled down)", sc.after.stackTop > 0 && sc.after.scissors[8] !== null && sc.px.distinct >= 3 && sc.after.rect8.y >= sc.after.stack.y - 1 && sc.after.rect8.y + sc.after.rect8.height <= sc.after.stack.y + sc.after.stack.height + 1, `scrollTop ${sc.after.stackTop}, window 9 at ${Math.round(sc.after.rect8.y)} in a stack at ${Math.round(sc.after.stack.y)}+${Math.round(sc.after.stack.height)}; ${sc.px.distinct} colours`);
    }
}

console.log(fails ? `\nbattleshipPage-selfcheck: ${fails} FAILED` : "\nbattleshipPage-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
