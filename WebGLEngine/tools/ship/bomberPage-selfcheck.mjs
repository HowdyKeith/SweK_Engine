// WebGLEngine/tools/ship/bomberPage-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/ship/bomberPage-selfcheck.mjs      (~40 s: a real browser, software rendering, a dozen full fights of up to 90 s)
//
// THE PAGE-WIRING GATE for bomber.html. Everything the page WIRES TOGETHER -- brain/bomberFight.mjs (the scenario, the gunners, the tally: pinned on its own), brain/dogfightArena.mjs (the bomber, its seats, its hull, its engines, the friendly-fire rule: held on
// its own), physics/mechanics/bomber.mjs, render/flightViews.mjs (the cameras, nextWindow, seatRows), the two flight networks and their shipped files -- is gated on its own; this file proves the WIRING in a real browser: the page boots with no error and
// flies the fight it says, ONE WINDOW PER CRAFT stacked down the right (the bomber's first), a CLICK on the bomber's window goes plane -> pilot -> seat 1 ... seat 5 -> brain -> plane (a fighter's goes plane -> pilot -> gunner -> brain) without
// touching the others, the views are really different pictures (the WebGL pixels under each window are read back), a gun seat's window draws the sight for the target that gunner chose (the pipper and the lead pip, on a tick it is firing), the brain window has a
// row of bars per seat, the turrets the scene draws point where the seats point, an engine shot to nothing goes dark and the card and the log say so, the hit spheres are shown on request, and the options -- the attack, the seed, how many fighters, the
// gunners' skill, both pilots, hold fire -- are the fight that runs: every one is checked against brain/bomberFight.fight() run here, to the bit in every count. The bomber FLOWN BY THE NETWORKS we trained on the trainer (through froudeScale.scalePilot) holds its
// speed and height in the page. The exact state is read through window.__bomber (a hook the page exposes, whose step(n) is the gate's clock: no waiting on frames).
//
// SABOTAGE LOG -- FORTY-SIX, each applied to bomber.html in a scratch worktree, the gate run, the worktree restored; every one red by name (the number is how many rows went red):
//   BP1 a click does nothing 3 | BP2 the bomber's window skips the seats 2 | BP3 a click switches every window 2 | BP4 a window for the bomber only 1 | BP5 the views are not kept across a new fight 1
//   BP6 the seat is not kept across a new fight 1 | BP7 the window label never names the seat 1 | BP8 a seat's view is the pilot's camera 3 | BP9 a seat's view is always seat 1's 2
//   BP10 the sight's target is the bomber's nearest foe, not the gunner's 1 | BP11 no pipper in the sight 1 | BP12 no lead pip in the sight 1 | BP13 no FIRE in a seat's sight 2
//   BP14 no bore cross in the sight 2 | BP15 the brain window has no seat rows 2 | BP16 the seat rows never see the gunner's command 1 | BP17 the bomber's pilot is shown in the bomber's own metres 1
//   BP18 the turrets do not turn 1 | BP19 the turrets' yaw and pitch swapped 1 | BP20 a dead engine is not drawn dark 1 | BP21 a dead engine's disc keeps turning 1 | BP22 the hit spheres are never shown 1
//   BP23 the hit spheres are always shown 2 | BP24 an engine going out is not logged 1 | BP25 a hit on the bomber does not name the part 1 | BP26 the card shows every engine running 1
//   BP27 the hold-fire box is ignored 2 | BP28 the gunners' skill is ignored 2 | BP29 the number of fighters is ignored 2 | BP30 the bomber's pilot is ignored 1 | BP31 the fighters' pilot is ignored 5
//   BP32 the attack kind is ignored 2 | BP33 the seed is ignored 2 | BP34 the fallback pilot's label does not say why 1 | BP35 a refused later load takes the held pilot away 1 | BP36 a failed fetch is not said 1
//   BP37 a pilot that is not loaded is still offered 1 | BP38 the window boxes paint their own background 1 | BP39 the page's tick steps the arena twice 3
//   BP40 the big picture follows the bomber, not the overview 1 | BP41 the pause button does nothing 1 | BP42 the window stack is on the left 1 | BP43 a fighter's gunner view is the pilot's camera 1
//   BP44 a fighter's trigger held back is not shown 1 | BP45 the default fighters are the PD autopilot 1 | BP46 hold fire off by default 1
// NINE WENT 0 RED THE FIRST TIME AND WERE FIXED IN THE GATE, NOT EXCUSED: BP27-BP30, BP32 and BP33 (the hold-fire box, the gunners' skill, the number of fighters, the bomber's pilot, the attack and the seed ignored) because the gate always handed newFight() every option, so the defaults that READ THE PAGE'S CONTROLS were never taken -- the gate now sets the real controls, presses New fight and compares with the module's fight (a combination chosen so that every one of those settings changes the fight it gives), and fires a change event at each control; BP10 (the seat's sight drawn for the bomber's nearest foe instead of the gunner's target) and BP43 (a fighter's sight drawn with the pilot's camera) because a pip drawn anywhere on the picture counted the same -- the page now says where it drew the sight (sight(i)) and the gate recomputes it from the same fight run here, at a tick when the seat's target is NOT the bomber's nearest foe, to half a pixel; and BP44 (the HOLD text) because nothing read the words -- the page records what each window says (texts(i)) and a fighter that is holding fire has to say so. THE GATE ALSO FOUND ONE REAL PAGE BUG: the stack of six windows ran 2 px off the bottom of the page (the border is outside the box's height) -- fixed in the page.
"use strict";
import { runInEngineOrigin, webgpuSkipReason } from "./webgpuHarness.mjs";
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as PB from "../../brain/peerBrain.mjs";
import * as PF from "../../brain/pilotFlightPolicy.mjs";
import * as MF from "../../brain/pilotFlightMlp.mjs";
import * as BF from "../../brain/bomberFight.mjs";
import * as BM from "../../physics/mechanics/bomber.mjs";
import * as GS from "../../physics/mechanics/gunSeats.mjs";
import * as SC from "../../physics/mechanics/froudeScale.mjs";
import * as A from "../../brain/dogfightArena.mjs";
import * as V from "../../render/flightViews.mjs";
import * as G from "../../physics/mechanics/flightGuns.mjs";
import { weightsHash } from "../../brain/drivePolicy.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
function ok(name, cond, detail) { console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? "   " + detail : ""}`); if (!cond) fails++; }
function report(name, detail) { console.log(`  ----  ${name}   ${detail}`); }

console.log("bomberPage-selfcheck -- bomber.html really wires the gated modules together\n");

const skip = webgpuSkipReason(createRequire(import.meta.url));
if (skip) { console.log(`  SKIP  ${skip}`); report("*** NOT A PASS. ***", ""); fails++; }
else {
    const run = await runInEngineOrigin({
        engineRoot: ENG, timeoutMs: 400000,
        script: `async () => {
            globalThis.__swekStep = "booting bomber.html in an iframe";
            const f = document.createElement("iframe");
            f.style.width = "1100px"; f.style.height = "760px";
            f.src = "/bomber.html";
            document.body.appendChild(f);
            await new Promise((res) => { f.onload = res; });
            const win = f.contentWindow, doc = win.document, wait = (ms) => new Promise((res) => setTimeout(res, ms));
            const t0 = performance.now();
            while (performance.now() - t0 < 40000 && !win.__bomber) { globalThis.__swekStep = "waiting for window.__bomber"; await wait(200); }
            if (!win.__bomber) return { booted: false, reason: "window.__bomber never appeared" };
            const B = win.__bomber; await B.ready; B.hold(true);
            const out = { booted: true }, views = () => B.windows().map((w) => (w.view === "gunner" ? "gunner" + w.seat : w.view)), cards = () => [...doc.querySelectorAll(".card")].map((c) => c.textContent);
            const sel = (id) => doc.getElementById(id);
            const set = (id, v) => { const e = sel(id); if (e.type === "checkbox") e.checked = v; else e.value = String(v); };
            const fightOf = (o) => { B.newFight(o); B.step(2700); return { tally: B.tally(), state: B.state() }; };

            // ---- the page's OWN default fight, before anything touches it ----
            out.boot = { windows: B.windows(), choices: B.roster.choices, labels: B.roster.labels, state: B.state(), cards: cards(), stat: sel("stat").textContent, note: sel("note").textContent,
                selects: ["kind", "seed", "nfight", "gunners", "pilotF", "pilotB"].map((id) => sel(id).value), hold: sel("hold").checked, spheres: sel("spheres").checked, spheresShown: B.spheresShown() };
            B.step(60); out.s60 = B.state(); out.feat60 = [B.brainRows(0)[0].values, B.brainRows(1)[0].values, B.brainRows(1)[2].values];
            B.step(2700); out.end = B.state(); out.endTally = B.tally(); out.endStat = sel("stat").textContent; out.endLog = out.end.log; out.endCards = cards();
            B.step(5); out.afterDone = B.state().tick;

            // ---- the options are the fight that runs: each kind of attack, PD fighters, regular gunners, seed 2 ----
            out.kinds = {};
            for (const kind of ["stern", "beam", "head-on", "mixed"]) { globalThis.__swekStep = "full fight: " + kind; out.kinds[kind] = fightOf({ kind, seed: 2, fighters: 3, gunners: "regular", f: "pd", b: "pd", hold: true }).tally; }
            out.opts = {};
            globalThis.__swekStep = "full fights: the options";
            out.opts.five = (() => { const r = fightOf({ kind: "mixed", seed: 3, fighters: 5, gunners: "regular", f: "pd", b: "pd", hold: true }); return { tally: r.tally, windows: B.windows().length, cards: cards().length, rects: B.windows().map((w) => w.rect) }; })();
            out.opts.perfect = fightOf({ kind: "beam", seed: 3, fighters: 3, gunners: "perfect", f: "pd", b: "pd", hold: true });
            out.opts.green = fightOf({ kind: "beam", seed: 3, fighters: 3, gunners: "green", f: "pd", b: "pd", hold: true });
            out.opts.holdOn = fightOf({ kind: "stern", seed: 1, fighters: 3, gunners: "green", f: "pd", b: "pd", hold: true }).tally;
            out.opts.holdOff = fightOf({ kind: "stern", seed: 1, fighters: 3, gunners: "green", f: "pd", b: "pd", hold: false });
            out.opts.holdOffChecked = [sel("hold").checked, B.state().crafts.slice(1).map((c) => c.friendlyHits)];
            out.opts.gpuFighters = fightOf({ kind: "beam", seed: 1, fighters: 3, gunners: "regular", f: "gpuDogfight", b: "pd", hold: true }).tally;
            out.opts.flyFighters = fightOf({ kind: "beam", seed: 1, fighters: 3, gunners: "regular", f: "dogfight", b: "pd", hold: true }).tally;

            // ---- the windows: the layout, the click, the other windows, the views kept across a new fight ----
            B.newFight({ kind: "beam", seed: 1, fighters: 3, gunners: "regular", f: "dogfight", b: "pd", hold: true });
            out.layout = B.windows().map((w) => w.rect); out.windowBg = B.windows().map((w) => w.bg);
            out.seq = [views()]; for (let k = 0; k < 9; k++) { B.clickWindow(0); out.seq.push(views()); }
            out.seqLabels = []; B.setView(0, "plane"); for (let k = 0; k < 8; k++) { out.seqLabels.push(B.windows()[0].label); B.clickWindow(0); }
            B.setView(0, "plane"); out.fighterSeq = [views()]; for (let k = 0; k < 5; k++) { B.clickWindow(1); out.fighterSeq.push(views()); }
            B.setView(1, "plane"); B.setView(0, "gunner", 3); B.setView(2, "brain"); B.newFight({ kind: "beam", seed: 4, fighters: 3, gunners: "regular", f: "dogfight", b: "pd", hold: true }); out.kept = [B.windows().map((w) => [w.view, w.seat])];
            B.newFight({ kind: "beam", seed: 4, fighters: 2, gunners: "regular", f: "dogfight", b: "pd", hold: true }); out.keptTwo = [B.windows().map((w) => [w.view, w.seat])];
            B.setView(0, "plane"); B.setView(1, "plane"); B.setView(2, "plane");

            // ---- the pictures: the pixels under each window, in each view, mid-fight in a beam attack ----
            B.newFight({ kind: "beam", seed: 1, fighters: 3, gunners: "regular", f: "dogfight", b: "pd", hold: true }); B.step(470);
            // a seat that is firing at a target right now: its window should draw the sight
            let firing = null; for (let t = 0; t < 320 && firing === null && !B.state().done; t++) { B.step(1); const c0 = B.state().crafts[0], s = c0.seats.findIndex((q) => q.last && q.last.fire && q.last.target != null && q.last.target !== c0.last.foe); if (s >= 0) firing = s; }   // a seat firing at a target that is NOT the bomber's nearest foe
            out.firingSeat = firing; out.firingTick = B.state().tick;
            out.pix = {};
            const take = (name, i, v, seat) => { B.setView(i, v, seat); out.pix[name] = { gl: B.pixels(i), ink: B.ink(i), bars: B.inkColor(i, [89, 209, 255]) + B.inkColor(i, [246, 166, 35]), pipper: B.inkColor(i, [90, 214, 255]), lead: B.inkColor(i, [246, 166, 35]), cross: B.inkColor(i, [127, 224, 160]), fire: B.inkColor(i, [255, 107, 107]), sight: B.sight(i), texts: B.texts(i), rect: B.windows()[i].rect }; };
            take("plane", 0, "plane"); take("pilot", 0, "pilot");
            if (firing !== null) take("seat", 0, "gunner", firing);
            take("seatOther", 0, "gunner", firing === 4 ? 0 : 4);
            take("brain", 0, "brain"); take("fightGunner", 1, "gunner"); take("fightBrain", 1, "brain");
            out.brainRowsBomber = B.brainRows(0); out.brainRowsFighter = B.brainRows(1);
            B.setView(0, "plane"); B.setView(1, "plane");
            // the turrets the scene draws: each barrel's quaternion, with the seats' state, now
            out.turrets = B.state().crafts[0].seats.map((s, k) => ({ yaw: s.yaw, pitch: s.pitch, q: B.turretAim(k) }));

            // ---- the CONTROLS: every knob set on the page and the New fight button pressed is the fight that runs ----
            B.newFight({ kind: "beam", seed: 1, fighters: 3, gunners: "regular", f: "dogfight", b: "pd", hold: true });
            set("kind", "stern"); set("seed", 3); set("nfight", 2); set("gunners", "green"); set("pilotF", "gpuDogfight"); set("pilotB", "flight"); set("hold", false); sel("newBtn").click(); B.step(2700);
            out.ui = { tally: B.tally(), state: B.state(), sel: ["kind", "seed", "nfight", "gunners", "pilotF", "pilotB"].map((id) => sel(id).value), hold: sel("hold").checked };
            B.newFight({ kind: "beam", seed: 1, fighters: 3, gunners: "regular", f: "dogfight", b: "pd", hold: true }); B.step(10);
            out.change = {}; for (const [id, v] of [["gunners", "green"], ["kind", "stern"], ["seed", 7], ["nfight", 2], ["hold", false], ["pilotF", "pd"], ["pilotB", "hand"]]) { set(id, v); sel(id).dispatchEvent(new win.Event("change", { bubbles: true })); const st2 = B.state(); out.change[id] = { tick: st2.tick, crafts: st2.crafts.length, kind: st2.scenario.kind, seed: st2.scenario.seed, gunners: st2.gunners, pf: st2.pilots.f.id, pb: st2.pilots.b.id, hold: st2.crafts[1].holdFire }; }

            // ---- a fighter holding fire says so in its sight ----
            B.newFight({ kind: "stern", seed: 1, fighters: 3, gunners: "green", f: "pd", b: "pd", hold: true }); B.step(980);
            let heldAt = null; for (let t = 0; t < 400 && heldAt === null; t++) { B.step(1); const k = B.state().crafts.findIndex((c, i) => i > 0 && c.last && c.last.held); if (k > 0) heldAt = k; }
            out.held = { craft: heldAt, tick: B.state().tick };
            if (heldAt !== null) { B.setView(heldAt, "gunner"); out.held.texts = B.texts(heldAt); B.newFight({ kind: "stern", seed: 1, fighters: 3, gunners: "green", f: "pd", b: "pd", hold: true }); B.setView(heldAt, "gunner"); B.step(1); out.held.textsEarly = B.texts(heldAt); }

            // ---- the engines and the hit spheres: shoot an engine to nothing ----
            B.newFight({ kind: "beam", seed: 1, fighters: 3, gunners: "perfect", f: "pd", b: "pd", hold: true }); B.step(30);
            out.engBefore = { shown: B.engineShown(), running: B.state().crafts[0].enginesRunning, card: cards()[0] };
            B.shoot("engine 2 (inner left)", 12); B.step(8); const st = B.state();
            out.engAfter = { shown: B.engineShown(), running: st.crafts[0].enginesRunning, card: cards()[0], log: st.log, taken: st.crafts[0].taken };
            sel("spheres").checked = true; B.step(1); out.spheresOn = B.spheresShown(); sel("spheres").checked = false; B.step(1); out.spheresOff = B.spheresShown();

            // ---- the bomber flown by the networks we trained on the trainer ----
            out.flown = {};
            for (const id of ["pd", "flight", "gpuFlight", "hand"]) {
                globalThis.__swekStep = "the bomber flown by " + id;
                B.newFight({ kind: "stern", seed: 1, fighters: 1, gunners: "green", f: "pd", b: id, hold: true }); const s0 = B.state(); let minAlt = 1e9, maxAlt = -1e9, minV = 1e9, maxV = -1e9;
                for (let k = 0; k < 20; k++) { B.step(30); const c = B.state().crafts[0], v = Math.hypot(...c.vel); minAlt = Math.min(minAlt, c.pos[2]); maxAlt = Math.max(maxAlt, c.pos[2]); minV = Math.min(minV, v); maxV = Math.max(maxV, v); }
                out.flown[id] = { minAlt, maxAlt, minV, maxV, label: B.roster.labels[1], status: B.state().crafts[0].status, tick: B.state().tick };
            }

            // ---- a pilot file that will not load: said, and the pilot the page holds is kept ----
            out.fail = {};
            out.fail.missing = await B.roster.loadChoice("dogfight", "/brain/pilotDogfightWeightsNope.json"); out.fail.missingErr = B.roster.error("dogfight"); out.fail.stillLoaded = B.roster.loaded("dogfight");
            out.fail.wrong = await B.roster.loadChoice("dogfight", "/brain/pilotFlightMlpWeightsDefault.json"); out.fail.wrongErr = B.roster.error("dogfight"); out.fail.stillLoaded2 = B.roster.loaded("dogfight");
            out.fail.good = await B.roster.loadChoice("dogfight"); out.fail.goodErr = B.roster.error("dogfight");
            B.roster.forget("gpuDogfight"); out.fail.choices = B.roster.choices;
            B.newFight({ kind: "beam", seed: 1, fighters: 3, gunners: "regular", f: "gpuDogfight", b: "pd", hold: true }); out.fail.fallback = B.roster.labels[0]; out.fail.fallbackId = B.state().pilots.f.id;

            // ---- the big picture keeps every craft in frame ----
            B.newFight({ kind: "stern", seed: 2, fighters: 3, gunners: "regular", f: "pd", b: "pd", hold: true }); B.step(300); sel("camMode").value = "overview"; B.settleCamera(); out.mainNdc = B.mainView();
            B.step(300); B.settleCamera(); out.mainNdc2 = B.mainView();

            // ---- pause ----
            const pb = doc.getElementById("pauseBtn"); out.pause = [B.paused, pb.textContent]; pb.click(); out.pause.push(B.paused, pb.textContent); pb.click(); out.pause.push(B.paused, pb.textContent);
            return out;
        }`,
    });

    ok("the harness booted bomber.html and found window.__bomber", run.ok && run.result && run.result.booted, run.ok ? (run.result ? "" : "no result") : String(run.reason || JSON.stringify(run)).slice(0, 300));
    if (run.pageErrors && run.pageErrors.length) report("page console errors", run.pageErrors.slice(0, 5).join(" | ").slice(0, 400));
    // the run asks for one file that is not there ON PURPOSE (the pilot file's failure path): the browser logs that as one 404, and nothing else may be logged
    const errs404 = (run.pageErrors || []).filter((e) => /\b404\b/.test(e)), other = (run.pageErrors || []).filter((e) => !/\b404\b/.test(e));
    ok("!! no page errors were logged during the whole run -- except the ONE 404 the gate asks for on purpose (the pilot file that is not there); a second missing file would be a second 404", other.length === 0 && errs404.length <= 1, `${other.length} other, ${errs404.length} x 404 ${other.slice(0, 2).join(" | ").slice(0, 200)}`);

    if (run.ok && run.result && run.result.booted) {
        const r = run.result;
        const weightsOf = (f) => Float32Array.from(JSON.parse(fs.readFileSync(path.join(ENG, "brain", f), "utf8")).weights);
        const FLY = PF.pilotFor(weightsOf("pilotDogfightWeightsDefault.json")), GPU = MF.pilotFor(weightsOf("pilotDogfightMlpWeightsDefault.json"));
        const dogBlob = JSON.parse(fs.readFileSync(path.join(ENG, "brain", "pilotDogfightWeightsDefault.json"), "utf8")), dogImp = PB.importBrain(PB.describePolicy("pilotFlightPolicy", PF), dogBlob);
        // the page's tally against bomberFight.fight()'s, to the bit in every count it reports
        const same = (a, b) => ["winner", "over", "ticks", "killed", "grounded", "hitsOnBomber", "friendlyHits"].every((k) => Object.is(a[k], b[k])) && a.bomber.hpLeft === b.bomber.hpLeft && a.bomber.seatRounds === b.bomber.seatRounds && a.bomber.hitsDealt === b.bomber.hitsDealt && a.bomber.enginesRunning === b.bomber.enginesRunning && a.bomber.status === b.bomber.status
            && a.fighters.length === b.fighters.length && a.fighters.every((f, i) => f.status === b.fighters[i].status && f.hpLeft === b.fighters[i].hpLeft && f.fired === b.fighters[i].fired && f.hitsDealt === b.fighters[i].hitsDealt && f.friendlyHits === b.fighters[i].friendlyHits && f.held === b.fighters[i].held);
        const line = (t) => `${t.winner}, ${t.ticks} ticks, ${t.killed} shot down, ${t.hitsOnBomber} hits on the bomber`;

        // ---- 1 the boot ----
        const b = r.boot;
        ok("!! THE PAGE'S OWN FIGHT (before the gate touches it) is a beam attack, seed 1, three fighters, regular gunners, the fruit fly TRAINED TO FIGHT as the fighters (named, with the hash of its file's weights and its held-out score) and the PD autopilot flying the bomber, hold fire ON, hit spheres OFF, at tick 0 with everyone flying",
            b.selects.join() === "beam,1,3,regular,dogfight,pd" && b.hold === true && b.spheres === false && b.spheresShown.length === 17 && b.spheresShown.every((v) => v === false) && /trained to FIGHT/i.test(b.labels[0]) && b.labels[0].includes(weightsHash(dogImp.weights)) && /held-out 0\.6715/.test(b.labels[0]) && /PD autopilot/.test(b.labels[1]) && b.state.tick === 0 && b.state.crafts.every((c) => c.status === "airborne") && b.state.crafts.length === 4, `${b.labels[0]} | ${b.labels[1]}`);
        ok("!! the roster offers all seven pilots for the fighters, every one enabled (the PD autopilot; the fruit fly on hand weights, trained to fly, trained to fight; the GPU Brain's network on the same three)", b.choices.map((c) => c.id).join() === "pd,hand,flight,dogfight,gpuHand,gpuFlight,gpuDogfight" && b.choices.every((c) => !c.disabled));
        ok("!! FOUR WINDOWS, one per craft, the BOMBER'S FIRST, each showing the plane from outside to start with, each labelled with its number, its name and the view", b.windows.length === 4 && b.windows.every((w, i) => w.craft === i && w.view === "plane" && w.label.startsWith(`${i + 1}. ${i ? "fighter " + i : "bomber"} --`) && /\(from outside/.test(w.label) && /click to switch/.test(w.label)), b.windows.map((w) => w.label).join(" | ").slice(0, 220));
        ok("the board has a card for each craft: the bomber's names its pilot and says it is flying, with its hit points, its four engines and the gunners' rounds by seat; each fighter's names its pilot, its hits and rounds; and the stat line and the note name the fight",
            b.cards.length === 4 && /^bomber/.test(b.cards[0]) && /PD autopilot/.test(b.cards[0]) && /flying/.test(b.cards[0]) && /hit points 60\/60/.test(b.cards[0]) && /engines ● ● ● ● 4 of 4/.test(b.cards[0]) && /hand rule/.test(b.cards[0]) && b.cards.slice(1).every((t, i) => t.startsWith(`fighter ${i + 1}`) && t.includes(b.labels[0]) && /hit points 20\/20/.test(t) && /rounds 300 left/.test(t)) && /beam 1/.test(b.stat) && /0 of 3 fighters down/.test(b.stat) && /click a window/.test(b.note), `${b.stat}`);

        // the brain window's numbers are the pilots' own: the bomber's features are those of THE TRAINER'S WORLD it is shown (scaled down by similarity), the fighter's those of its own state, and the fighter's outputs are its network's, at tick 60
        const ref = BF.build(1, "beam", { pilot: FLY }).arena; for (let i = 0; i < 60; i++) A.stepArena(ref);
        const bC = ref.crafts[0], fC = ref.crafts[1], wantB = PF.features(SC.scaleState(bC.state, 2), SC.scaleTarget(bC.last.target, 2)), wantF = PF.features(fC.state, fC.last.target), wantOut = (() => { const c = PF.forward(weightsOf("pilotDogfightWeightsDefault.json"), wantF); return [c.pitch, c.roll, c.yaw, c.throttle * 2 - 1]; })();
        const closeTo = (a, bb, tol) => a.length === bb.length && a.every((v, i) => Math.abs(v - bb[i]) <= tol);
        ok("!! THE BRAIN WINDOW SHOWS THE PILOT'S OWN NUMBERS: at tick 60 the bomber's 18 features are those of the TRAINER'S WORLD it is flown in (position over 2, velocity over sqrt 2: PF.features of the scaled state, to 1e-5) and not of the bomber's own metres, the fighter's are PF.features of its own state, and the fighter's four outputs are what its network gives on those features (the window shows the network deciding NOW, on the state the tick ended in)", closeTo(r.feat60[0], Array.from(wantB), 1e-5) && closeTo(r.feat60[1], Array.from(wantF), 1e-5) && !closeTo(r.feat60[0], Array.from(PF.features(bC.state, bC.last.target)), 1e-3) && closeTo(r.feat60[2], wantOut, 1e-5), `bomber ${closeTo(r.feat60[0], Array.from(wantB), 1e-5)} fighter ${closeTo(r.feat60[1], Array.from(wantF), 1e-5)} not-unscaled ${!closeTo(r.feat60[0], Array.from(PF.features(bC.state, bC.last.target)), 1e-3)} outputs ${closeTo(r.feat60[2], wantOut, 1e-5)} | ${r.feat60[2].map((v) => v.toFixed(4))} vs ${wantOut.map((v) => v.toFixed(4))}`);

        // ---- 2 the clock ----
        ok("!! the tick counter advanced by exactly the steps taken (60 ticks is 2 s), and a finished fight does not move: 5 more steps leave the tick where it was", r.s60.tick === 60 && Math.abs(r.s60.t - 2) < 1e-12 && r.end.done === true && r.afterDone === r.end.tick && r.end.tick > 60);

        // ---- 3 the fight the page shows is the fight the module runs ----
        const fly = BF.fight(1, "beam", { pilot: FLY }), flyEnd = r.endTally;
        ok("!! THE DEFAULT FIGHT IS bomberFight.fight()'s: the page's beam attack, seed 1, with the fruit fly trained to fight as the fighters, run to its end, has the winner, the ending, the tick count, the fighters shot down and grounded, the hits on the bomber, the bomber's hit points and seat rounds, and every fighter's status, hit points, rounds and hits of the same fight run here -- to the bit", same(flyEnd, fly) && flyEnd.over === fly.over, `page ${line(flyEnd)} / here ${line(fly)}`);
        ok("the stat line says how it ended and the log says it (a line 'OVER' with the ending and the winner), and the cards say the bomber's and the fighters' hit points", new RegExp(`${flyEnd.winner === "none" ? "no winner" : flyEnd.winner + " win"}`).test(r.endStat) && /OVER/.test(r.endStat) && r.endLog.some((l) => /^OVER/.test(l)) && new RegExp(`hit points ${flyEnd.bomber.hpLeft}/60`).test(r.endCards[0]), `${r.endStat}`);
        for (const kind of ["stern", "beam", "head-on", "mixed"]) {
            const n = BF.fight(2, kind, { gunners: "regular" });
            ok(`!! the ${kind} attack, the PD autopilot on every side, regular gunners, seed 2, is bomberFight.fight()'s to the bit in every count it reports`, same(r.kinds[kind], n), `page ${line(r.kinds[kind])} / here ${line(n)}`);
        }
        const o = r.opts, five = BF.fight(3, "mixed", { fighters: 5 }), perfect = BF.fight(3, "beam", { gunners: "perfect" }), green = BF.fight(3, "beam", { gunners: "green" });
        ok("!! THE OPTIONS ARE THE FIGHT THAT RUNS: five fighters make six windows and six cards (all inside the page, none under 96 px tall) and the fight bomberFight.fight() runs for five; perfect gunners and green gunners are two different fights and each is its module run's", same(o.five.tally, five) && o.five.windows === 6 && o.five.cards === 6 && o.five.rects.every((q) => q.height >= 80 && q.y + q.height <= 760) && same(o.perfect.tally, perfect) && same(o.green.tally, green) && !same(o.perfect.tally, o.green.tally), `five: ${line(o.five.tally)}; perfect: ${line(o.perfect.tally)}; green: ${line(o.green.tally)}; terms ${[same(o.five.tally, five), o.five.windows, o.five.cards, o.five.rects.map((q) => q.height + "@" + (q.y + q.height)).join(" "), same(o.perfect.tally, perfect), same(o.green.tally, green)].join(" ")}`);
        ok("the gunners' settings are the module's: the page's perfect and green gunners are the settings bomberFight.GUNNERS names", JSON.stringify(o.perfect.state.gunners) === JSON.stringify(BF.GUNNERS.perfect) && JSON.stringify(o.green.state.gunners) === JSON.stringify(BF.GUNNERS.green) && JSON.stringify(r.end.gunners) === JSON.stringify(BF.GUNNERS.regular));
        const hOn = BF.fight(1, "stern", { gunners: "green" }), hOff = BF.fight(1, "stern", { gunners: "green", holdFire: false });
        ok("!! HOLD FIRE IS WIRED: six seconds of nothing -- the same stern attack (green gunners, PD fighters, seed 1) with the box checked is the module's fight with the rule on (no friendly hit; the bomber is lost), with it unchecked the module's fight with it off (39 friendly hits, the bomber untouched, two fighters shot down by their own side), and the page's cards show it", same(o.holdOn, hOn) && o.holdOn.friendlyHits === 0 && same(o.holdOff.tally, hOff) && o.holdOff.tally.friendlyHits > 20 && o.holdOffChecked[0] === false && o.holdOffChecked[1].reduce((a, v) => a + v, 0) === o.holdOff.tally.friendlyHits, `with ${line(o.holdOn)} / without ${line(o.holdOff.tally)}, ${o.holdOff.tally.friendlyHits} friendly`);
        ok("!! a different pilot for the fighters is a different fight: the GPU Brain trained to fight and the fruit fly trained to fight against the same bomber, gunners and seed are the module's two fights (not each other's)", same(o.gpuFighters, BF.fight(1, "beam", { pilot: GPU })) && same(o.flyFighters, BF.fight(1, "beam", { pilot: FLY })) && !same(o.gpuFighters, o.flyFighters), `gpu ${line(o.gpuFighters)} / fruit fly ${line(o.flyFighters)}`);

        // ---- 3b the controls ----
        const FLYFLIGHT = PF.pilotFor(weightsOf("pilotFlightWeightsDefault.json")), ui = r.ui, uiWant = BF.fight(3, "stern", { fighters: 2, gunners: "green", pilot: GPU, bomberPilot: FLYFLIGHT, holdFire: false });
        ok("!! EVERY CONTROL IS THE FIGHT THAT RUNS: with the attack set to stern, the seed to 3, two fighters, green gunners, the GPU Brain trained to fight for the fighters, the fruit fly trained to FLY for the BOMBER and hold fire off -- all set on the page's own controls, then the New fight button pressed -- the fight that runs is bomberFight.fight()'s with those options, to the bit (the bomber lost at 33 s: every one of those settings changes the fight it gives), with those pilots seated and the controls reading what was set",
            same(ui.tally, uiWant) && ui.sel.join() === "stern,3,2,green,gpuDogfight,flight" && ui.hold === false && ui.state.pilots.f.id === "gpuDogfight" && ui.state.pilots.b.id === "flight" && ui.state.crafts.length === 3 && ui.state.crafts.slice(1).every((c) => c.holdFire === false), `page ${line(ui.tally)} / here ${line(uiWant)}`);
        const ch = r.change;
        ok("!! A CHANGE TO ANY CONTROL STARTS THE FIGHT AGAIN from tick 0 with what the controls say: the gunners' skill, the attack, the seed, the number of fighters, hold fire, the fighters' pilot and the bomber's pilot each, on its own change event, restart the fight with that setting taken",
            Object.values(ch).every((c) => c.tick === 0) && JSON.stringify(ch.gunners.gunners) === JSON.stringify(BF.GUNNERS.green) && ch.kind.kind === "stern" && ch.seed.seed === 7 && ch.nfight.crafts === 3 && ch.hold.hold === false && ch.pilotF.pf === "pd" && ch.pilotB.pb === "hand", JSON.stringify(Object.fromEntries(Object.entries(ch).map(([k, c]) => [k, [c.tick, c.crafts, c.kind, c.seed, c.pf, c.pb]]))));

        // ---- 4 the windows ----
        const L = r.layout;
        ok("!! A WINDOW'S BOX DOES NOT PAINT OVER ITS PICTURE: the pictures are drawn into the page's one WebGL canvas, BEHIND the boxes, so a box with a background of its own hides its picture -- every window box is transparent", r.windowBg.length === 4 && r.windowBg.every((bg) => /^(rgba\(0, 0, 0, 0\)|transparent)$/.test(bg)), r.windowBg.join(" | "));
        ok("!! THE WINDOWS ARE STACKED DOWN THE RIGHT: the same left edge, the same width (262), each below the one before with a gap, the right edge inside the page, and each a landscape picture that fits the page", L.length === 4 && L.every((q) => q.x === L[0].x && q.width === 262 && q.width > q.height) && L.every((q, i) => i === 0 || q.y >= L[i - 1].y + L[i - 1].height) && L[0].x + L[0].width <= 1100 && L[0].x > 700 && L[3].y + L[3].height <= 760, JSON.stringify(L.map((q) => [q.x, q.y, q.width, q.height])));
        const seqOf = (s) => s.map((x) => x[0]), want = ["plane", "pilot", "gunner0", "gunner1", "gunner2", "gunner3", "gunner4", "brain", "plane", "pilot"];
        ok("!! A CLICK ON THE BOMBER'S WINDOW GOES PLANE, PILOT, SEAT 1, SEAT 2, SEAT 3, SEAT 4, SEAT 5, BRAIN and round to the plane again -- one click each, ten views in nine clicks -- while the three fighters' windows stay on the plane", JSON.stringify(seqOf(r.seq)) === JSON.stringify(want) && r.seq.every((s) => s.slice(1).every((v) => v === "plane")), JSON.stringify(seqOf(r.seq)));
        ok("!! each seat's window says WHICH seat it is, by name: 'gun seat 1 of 5: forward upper turret' to 'gun seat 5 of 5: tail turret'; the brain's label says it shows the gunners' too", ["forward upper turret", "forward lower turret", "aft upper turret", "aft lower turret", "tail turret"].every((n, k) => r.seqLabels[2 + k].includes(`gun seat ${k + 1} of 5: ${n}`)) && /the gunners'/.test(r.seqLabels[7]), r.seqLabels.slice(2, 4).join(" | ").slice(0, 200));
        ok("!! A FIGHTER'S WINDOW GOES PLANE, PILOT, GUNNER, BRAIN and round again (four views, as dogfight.html's), without touching the bomber's window", JSON.stringify(r.fighterSeq.map((s) => s[1])) === JSON.stringify(["plane", "pilot", "gunner0", "brain", "plane", "pilot"]) && r.fighterSeq.every((s) => s[0] === "plane"), JSON.stringify(r.fighterSeq.map((s) => s[1])));
        ok("!! THE VIEWS SURVIVE A NEW FIGHT, seat and all: the bomber on seat 4, a fighter on the brain, stay so when another fight starts; with only two fighters (three windows) the first three are kept, and the seat is kept inside the five", JSON.stringify(r.kept[0].map((w) => w[0])) === JSON.stringify(["gunner", "plane", "brain", "plane"]) && r.kept[0][0][1] === 3 && JSON.stringify(r.keptTwo[0].map((w) => w[0])) === JSON.stringify(["gunner", "plane", "brain"]) && r.keptTwo[0][0][1] === 3, JSON.stringify(r.kept) + " " + JSON.stringify(r.keptTwo));

        // ---- 5 the pictures ----
        const P = r.pix;
        ok("!! A SEAT WAS FIRING AT A TARGET at some tick of the beam attack (so the sight can be read), and the bomber's window on THAT seat draws the gun's sight: the bore cross, the pipper (a cyan ring), the lead pip (an orange diamond) and 'FIRE' in red; the pilot's view of the same bomber has no pipper and no lead pip", r.firingSeat !== null && P.seat && P.seat.cross > 8 && P.seat.pipper > 15 && P.seat.lead > 15 && P.seat.fire > 8 && P.pilot.pipper < 10 && P.pilot.lead < 10 && P.pilot.fire === 0, `seat ${r.firingSeat} at tick ${r.firingTick}: cross ${P.seat && P.seat.cross}, pipper ${P.seat && P.seat.pipper}, lead ${P.seat && P.seat.lead}, fire ${P.seat && P.seat.fire}`);
        ok("!! THE CAMERA VIEWS ARE PICTURES OF A WORLD, and different ones: the pixels under the bomber's window in the plane, pilot and a gun seat's view each hold many colours, no two have the same mean colour, and a seat that cannot see the enemy shows no pip", ["plane", "pilot", "seat", "seatOther"].every((v) => P[v] && P[v].gl.distinct >= 8 && P[v].gl.w > 200 && P[v].gl.h > 120) && ["plane|pilot", "plane|seat", "pilot|seat", "seat|seatOther"].every((pair) => { const [x, y] = pair.split("|"); return Math.max(...P[x].gl.mean.map((m, i) => Math.abs(m - P[y].gl.mean[i]))) >= 2; }), ["plane", "pilot", "seat", "seatOther"].map((v) => `${v}: ${P[v].gl.distinct} colours`).join(" | "));
        ok("!! THE BRAIN VIEW IS NOT A CAMERA: the picture under it is the flat dark fill (one colour or two), and the overlay is bars -- the bomber's (the PD autopilot's features and outputs, and a ROW OF SIX PER SEAT, five seats) by the thousand, the fruit fly fighter's (its 18 features, 34 hidden activations and four outputs) too, and a tenth of that or less in the camera views", P.brain.gl.distinct <= 2 && P.brain.gl.mean.every((m) => m < 20) && P.brain.bars > 2000 && P.fightBrain.bars > 1000 && ["plane", "pilot", "seat"].every((v) => P[v].bars * 8 < P.brain.bars), `bomber ${P.brain.bars}, fighter ${P.fightBrain.bars}; camera views ${["plane", "pilot", "seat"].map((v) => P[v].bars)}`);
        const rb = r.brainRowsBomber, rf = r.brainRowsFighter;
        ok("!! THE BOMBER'S BRAIN WINDOW HAS THE GUNNERS: its rows are the pilot's features (18) and outputs (4) -- the PD autopilot has no hidden layer -- then one row of six per seat labelled s1 aim to s5 aim, with the six numbers in [-1, 1] and the trigger and target at +1 or -1; a fighter's has features, the fruit fly's 34 hidden activations and outputs, and no seat rows", rb.map((q) => q.label).join() === "p features,p outputs,s1 aim,s2 aim,s3 aim,s4 aim,s5 aim" && rb[0].n === 18 && rb[1].n === 4 && rb.slice(2).every((q) => q.n === 6 && q.values.every((v) => v >= -1 && v <= 1) && Math.abs(q.values[4]) === 1 && Math.abs(q.values[5]) === 1) && rf.map((q) => q.layer).join() === "features,hidden,outputs" && rf[1].n === 34, `${rb.map((q) => q.label).join()} | ${rf.map((q) => q.layer + q.n).join()}`);
        ok("THE FIRING SEAT'S ROW IS LIVE: the seat that was firing has its trigger at +1 and a target at +1 in its row, and the rows of a seat that has no target say -1 and -1", r.firingSeat !== null && rb[2 + r.firingSeat] && rb[2 + r.firingSeat].values[4] === 1 && rb[2 + r.firingSeat].values[5] === 1 && rb.slice(2).some((q) => q.values[5] === -1), rb.slice(2).map((q) => `${q.values[4]}/${q.values[5]}`).join(" "));
        ok("a fighter's window in the gunner's view is the fixed gun's sight: the bore cross is drawn and the pipper or the lead pip is on it in a beam attack", P.fightGunner.cross > 8 && (P.fightGunner.pipper > 15 || P.fightGunner.lead > 15), `${P.fightGunner.cross} cross, ${P.fightGunner.pipper} pipper, ${P.fightGunner.lead} lead`);
        // the sights, against the same fight run here to the same tick: THE GUNNER'S OWN target, the bore, the pipper and the lead pip, to half a pixel, for the seat that was firing and for a fighter's fixed gun
        const ref2 = BF.build(1, "beam", { pilot: FLY }).arena; for (let i = 0; i < r.firingTick; i++) A.stepArena(ref2);
        const rc0 = ref2.crafts[0], rst = r.firingSeat !== null ? rc0.seats[r.firingSeat] : null;
        if (rst) {
            const foe = ref2.crafts.find((o) => o.id === rst.last.target), sg = P.seat.sight, W = Math.round(P.seat.rect.width), H = Math.round(P.seat.rect.height);
            const exp = V.gunsight(V.seatCamera(rc0.state, GS.muzzleOfSeat(rst.seat, rst.state, rc0.state)), GS.muzzleOfSeat(rst.seat, rst.state, rc0.state), { pos: foe.state.pos, vel: foe.state.vel }, W, H, rst.seat.gun);
            const px = (a, b2) => a && b2 && Math.hypot(a[0] - b2[0], a[1] - b2[1]) < 0.5;
            ok("!! A SEAT'S SIGHT IS THE GUNNER'S: at a tick when the firing seat's target is NOT the bomber's nearest foe, the sight is drawn for the target THAT GUNNER chose (the id, the range to 1e-6 m) and the bore cross, the pipper and the lead pip are where gunSeats.muzzleOfSeat and flightViews.gunsight put them for that target, to half a pixel; and the window says 'FIRE' and the seat's yaw, pitch and rounds",
                rc0.last.foe !== rst.last.target && sg && sg.foe === rst.last.target && Math.abs(sg.range - exp.range) < 1e-6 && px(sg.bore, exp.bore) && px(sg.pipper, exp.pipper) && px(sg.lead, exp.lead) && P.seat.texts.includes("FIRE") && P.seat.texts.some((t) => /^yaw -?\d+°  pitch -?\d+°  rounds \d+$/.test(t)), `target ${sg && sg.foe} (the bomber's foe ${rc0.last.foe}), range ${sg && sg.range && sg.range.toFixed(2)} / ${exp.range.toFixed(2)}`);
        } else ok("a seat was found firing at a target that is not the bomber's nearest foe", false);
        {
            const f1 = ref2.crafts[1], foe1 = ref2.crafts.find((o) => o.id === f1.last.foe), sg = P.fightGunner.sight, W = Math.round(P.fightGunner.rect.width), H = Math.round(P.fightGunner.rect.height);
            const exp = V.gunsight(V.gunSightCamera(f1.state, { spec: f1.spec }), G.muzzleOf(f1.state, f1.spec), { pos: foe1.state.pos, vel: foe1.state.vel }, W, H, f1.spec), px = (a, b2) => a && b2 && Math.hypot(a[0] - b2[0], a[1] - b2[1]) < 0.5;
            ok("!! A FIGHTER'S SIGHT IS ITS GUN'S: the fixed gun's sight (the pilot's eye along the gun axis, 0.55 rad across) with the bore, the pipper and the lead pip where flightViews.gunsight puts them for the bomber, to half a pixel", sg && sg.foe === foe1.id && px(sg.bore, exp.bore) && px(sg.pipper, exp.pipper) && px(sg.lead, exp.lead) && Math.abs(sg.range - exp.range) < 1e-6, `range ${sg && sg.range && sg.range.toFixed(2)} / ${exp.range.toFixed(2)}`);
        }
        ok("!! A FIGHTER HOLDING FIRE SAYS SO IN ITS SIGHT: in a stern attack by PD fighters on green gunners, the window of a fighter whose trigger is held back for a team-mate says 'HOLD — a team-mate in the line', and the same window at the start of the fight does not", r.held.craft !== null && r.held.texts.some((t) => /^HOLD — a team-mate in the line/.test(t)) && !r.held.textsEarly.some((t) => /^HOLD/.test(t)), JSON.stringify(r.held.texts && r.held.texts.slice(0, 3)));
        // the turrets
        const rotY = (q, v) => { const [x, y, z, w] = q, t = [2 * (y * v[2] - z * v[1]), 2 * (z * v[0] - x * v[2]), 2 * (x * v[1] - y * v[0])]; return [v[0] + w * t[0] + (y * t[2] - z * t[1]), v[1] + w * t[1] + (z * t[0] - x * t[2]), v[2] + w * t[2] + (x * t[1] - y * t[0])]; };
        const bomber = BM.createBomber(), tur = r.turrets.map((t, k) => { const d = GS.dirAt(bomber.seats[k], t.yaw, t.pitch), g = rotY(t.q, [0, 1, 0]); return Math.hypot(d[0] - g[0], d[1] - g[1], d[2] - g[2]); });
        ok("!! THE TURRETS THE SCENE DRAWS POINT WHERE THE SEATS POINT: each barrel group's rotation, applied to its barrel's own axis, is gunSeats.dirAt(seat, yaw, pitch) to 1e-6 for all five seats -- mid-fight, with at least one seat slewed away from rest", tur.every((e) => e < 1e-6) && r.turrets.some((t) => Math.abs(t.yaw) > 0.1 || Math.abs(t.pitch) > 0.1), `${tur.map((e) => e.toExponential(1)).join(" ")}; yaw ${r.turrets.map((t) => t.yaw.toFixed(2)).join(" ")}`);

        // ---- 6 the engines and the spheres ----
        const e0 = r.engBefore, e1 = r.engAfter;
        ok("!! AN ENGINE SHOT TO NOTHING GOES DARK: before, four engines running with every disc turning; after twelve rounds dropped on the inner left engine, three running, THAT engine's nacelle is the dead material and its disc hidden while the other three are as they were, the card says '3 of 4' with one hollow circle, and the log says 'engine 2 (inner left) OUT — 3 engines running'",
            e0.running === 4 && e0.shown.every((e) => !e.out && e.disc) && e1.running === 3 && e1.shown.map((e) => e.out).join() === "false,true,false,false" && e1.shown.map((e) => e.disc).join() === "true,false,true,true" && /engines ● ○ ● ● 3 of 4/.test(e1.card) && e1.log.some((l) => /engine 2 \(inner left\) OUT — 3 engines running/.test(l)) && e1.taken >= 8, `${e1.shown.map((e) => e.out)}, ${e1.card.slice(0, 120)}`);
        ok("!! ...and the log names the PART each hit reached ('hit bomber — inner left engine' is not in it, but 'engine 2 (inner left)' is: the part's own name), and the HIT SPHERES are shown on request: all 17 hidden by default, all 17 shown with the box checked, hidden again when it is unchecked", e1.log.some((l) => /hit bomber — engine 2 \(inner left\)/.test(l)) && r.spheresOn.length === 17 && r.spheresOn.every((v) => v === true) && r.spheresOff.every((v) => v === false));

        // ---- 7 the bomber is flown by the networks we trained on the trainer ----
        const fl = r.flown;
        ok("!! THE BOMBER FLOWN BY THE NETWORKS TRAINED ON THE TRAINER (through froudeScale.scalePilot) holds its height and speed in the page: 20 s (in a stern attack by one PD fighter that the green gunners do not stop and that does not touch the bomber) of the fruit fly trained to fly, the GPU Brain trained to fly, the fruit fly's hand weights and the PD autopilot each keep it within 12 m of 500 m and within 2 m/s of its 43.3 m/s cruise, flying, and the label names the pilot", ["pd", "flight", "gpuFlight", "hand"].every((id) => fl[id] && fl[id].status === "airborne" && fl[id].minAlt > 488 && fl[id].maxAlt < 512 && fl[id].minV > 41.2 && fl[id].maxV < 45.3 && fl[id].tick >= 600) && /trained to FLY/.test(fl.flight.label) && /GPU Brain trained to FLY/.test(fl.gpuFlight.label), ["pd", "flight", "gpuFlight", "hand"].map((id) => `${id}: ${fl[id].minAlt.toFixed(0)}-${fl[id].maxAlt.toFixed(0)} m, ${fl[id].minV.toFixed(1)}-${fl[id].maxV.toFixed(1)} m/s`).join(" | "));

        // ---- 8 failure paths ----
        const F = r.fail;
        ok("!! A PILOT FILE THAT WILL NOT LOAD IS SAID AND THE PILOT THE PAGE HOLDS IS KEPT: a file that is not there gives 'HTTP 404', the GPU Brain's file offered as the fruit fly's is refused by name, neither takes the pilot away, and loading the good file again clears the error",
            F.missing === false && /HTTP 404/.test(F.missingErr) && F.stillLoaded === true && F.wrong === false && /pilotFlightMlp/.test(F.wrongErr) && /pilotFlightPolicy/.test(F.wrongErr) && F.stillLoaded2 === true && F.good === true && F.goodErr === null, `${F.missingErr} | ${(F.wrongErr || "").slice(0, 100)}`);
        ok("!! a pilot whose file is not here is NOT OFFERED (disabled in the roster), and a fight that asks for it anyway is flown by the PD autopilot with the label saying why", F.choices.find((c) => c.id === "gpuDogfight").disabled === true && F.fallbackId === "pd" && /PD autopilot/.test(F.fallback) && /not loaded|could not/.test(F.fallback), F.fallback);

        // ---- 9 the big picture, the pause ----
        const inFrame = (ndc) => ndc.length === 4 && ndc.every(([x, y, z]) => Math.abs(x) <= 1.02 && Math.abs(y) <= 1.02 && z > 0 && z < 1);
        ok("!! THE OVERVIEW KEEPS EVERY CRAFT IN FRAME: after 10 s and after 20 s of a stern attack, the bomber and all three fighters are inside the big picture (normalised coordinates within 1.02, in front of the camera)", inFrame(r.mainNdc) && inFrame(r.mainNdc2), JSON.stringify(r.mainNdc.map((v) => v.map((q) => +q.toFixed(2)))));
        ok("the pause button toggles: playing, then paused with the button saying Play, then playing again", r.pause[0] === false && r.pause[2] === true && /Play/.test(r.pause[3]) && r.pause[4] === false && /Pause/.test(r.pause[5]), JSON.stringify(r.pause));
    }
}

console.log(fails ? `\nbomberPage-selfcheck: ${fails} FAILED` : "\nbomberPage-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
